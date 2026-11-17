import { useEffect, useRef, useState } from "react";
import { clamp } from "./motion";
import { clock } from "./model";
import { lessonClock, loadYouTube, useLessonClock } from "./youtube";

const SIZES = ["maxresdefault", "sddefault", "hqdefault"];

export function Video({ page, seek, seenRef, onLeave, onMeta, compact = false }) {
  const id = page?.videoId || null;
  const [live, setLive] = useState(false);
  const [failed, setFailed] = useState(false);
  const [start, setStart] = useState(0);
  const [size, setSize] = useState(0);
  const wrap = useRef(null), player = useRef(null);
  const pageRef = useRef(page); pageRef.current = page;
  const leave = useRef(null); leave.current = (t) => onLeave?.(pageRef.current, t);
  const metaRef = useRef(onMeta); metaRef.current = onMeta;
  const time = useLessonClock();

  // Before play, the clock shows where this page left the lesson
  useEffect(() => {
    if (!live) lessonClock.set({ t: page?.videoAt ?? null, live: false, videoId: id });
  }, [id, page?.id, page?.videoAt, live]);

  const own = useRef(0);
  const seen = seenRef || own;
  const ready = useRef(false), pending = useRef(null);
  useEffect(() => {
    if (!seek || seek.n <= seen.current || seek.videoId !== id) return;
    seen.current = seek.n;
    lessonClock.set({ t: seek.t, live, videoId: id });
    const p = player.current;
    if (p && ready.current) { try { p.seekTo(seek.t, true); p.playVideo(); } catch {} }
    else if (live && !failed) pending.current = seek.t;
    else { setStart(seek.t); setLive(true); }
  }, [seek?.n, id]);

  useEffect(() => {
    if (!live || !id || failed) return;
    let dead = false, poll = 0;
    const host = document.createElement("div");
    wrap.current?.replaceChildren(host);
    loadYouTube().then((YT) => {
      if (dead) return;
      const tell = (p) => {
        try {
          const d = p.getVideoData?.() || {}, len = Math.round(p.getDuration?.() || 0);
          if (d.title || len) metaRef.current?.(id, { title: d.title || null, channel: d.author || null, len: len || null });
        } catch {}
      };
      const p = new YT.Player(host, {
        host: "https://www.youtube-nocookie.com", videoId: id, width: "100%", height: "100%",
        playerVars: { start: Math.floor(start || 0), autoplay: 1, rel: 0, playsinline: 1, modestbranding: 1 },
        events: {
          onReady: (e) => {
            ready.current = true;
            const t = pending.current;
            pending.current = null;
            try { if (t != null) e.target.seekTo(t, true); e.target.playVideo(); } catch {}
            tell(e.target);
          },
          onStateChange: (e) => {
            if (e.data === 1) tell(e.target);
            if (e.data === 2 || e.data === 0) { try { leave.current?.(e.target.getCurrentTime()); } catch {} }
          },
        },
      });
      player.current = p;
      poll = setInterval(() => {
        try { const x = p.getCurrentTime?.(); if (typeof x === "number") lessonClock.set({ t: x, live: true, videoId: id }); } catch {}
      }, 250);
    }).catch(() => { if (!dead) { if (pending.current != null) setStart(pending.current); setFailed(true); } });
    return () => {
      dead = true;
      clearInterval(poll);
      ready.current = false;
      pending.current = null;
      const p = player.current;
      player.current = null;
      if (p) { try { leave.current?.(p.getCurrentTime()); } catch {} try { p.destroy(); } catch {} }
      wrap.current?.replaceChildren();
    };
  }, [live, id, failed]);

  if (!id) return null;

  const t = time.videoId === id && time.t != null ? time.t : page.videoAt ?? null;
  const len = page.videoLen || null;
  const pct = len && t != null ? clamp(t / len, 0, 1) * 100 : null;
  const title = page.videoTitle || "YouTube lesson";
  return (
    <div className={`st-video ${compact ? "compact" : ""}`}>
      <div className="st-lv-frame">
        {live && failed ? (
          <iframe title={title} src={`https://www.youtube-nocookie.com/embed/${id}?start=${Math.floor(start || 0)}&autoplay=1&rel=0&playsinline=1`}
            allow="autoplay; encrypted-media; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
        ) : live ? (
          <div className="st-lv-player" ref={wrap} />
        ) : (
          <button type="button" className="st-lv-poster" onClick={() => { setStart(t ?? 0); setLive(true); }} aria-label={`Play ${title}${t != null ? ` from ${clock(t)}` : ""}`}>
            <img src={`https://i.ytimg.com/vi/${id}/${SIZES[size]}.jpg`} alt="" draggable="false"
              onLoad={(e) => { if (e.currentTarget.naturalWidth <= 120 && size < 2) setSize(size + 1); }}
              onError={() => setSize((x) => Math.min(x + 1, 2))} />
            <span className="st-lv-play"><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" /></svg></span>
            <span className="st-lv-meta">
              <span className="st-lv-title">{title}</span>
              <span className="st-lv-channel">{page.videoChannel ? `${page.videoChannel} · YouTube` : "YouTube"}</span>
            </span>
            {pct != null && <span className="st-lv-bar"><span style={{ width: `${pct}%` }} /></span>}
            {t != null && <span className="st-lv-time num">{clock(t)}{len ? <span> / {clock(len)}</span> : null}</span>}
          </button>
        )}
      </div>
    </div>
  );
}
