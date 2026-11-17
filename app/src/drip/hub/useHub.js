import { useEffect, useMemo } from "react";
import { LIVE } from "../../mode";
import { useFloor } from "../floor";
import { ROOM_GENERAL, TOPIC_IDS, roomName } from "../../views/community/houses";
import { useLoad } from "../../views/community/context";
import { source } from "../../views/community/source";
import { phaseOf } from "../../views/community/voice/rules";
import { bigDays, latestPosts } from "./money";

const peek = (room) => (source.peek ? source.peek(room) : source.chat(room));

// What the whole Floor is doing right now: read once here, shown in the band, the rails and the feed.
export function useHub({ crew, voice, events }) {
  const { here } = useFloor();
  const posts = useLoad(() => source.feed({}), []);
  // The demo shows a sample session. Live, sessions only ever come from the voice flag in Community.jsx.
  const sample = useLoad(() => (source.demo && source.voiceNow ? source.voiceNow() : null), []);
  const counts = useLoad(() => (source.hereNow ? source.hereNow() : {}), []);
  // A live room only says who's in it once you're in it, so live this is General and your crew's room
  const rooms = [ROOM_GENERAL, ...(crew ? [crew] : []), ...(source.peek ? TOPIC_IDS : [])];
  const latest = useLoad(async () => {
    const got = await Promise.all(rooms.map((r) => peek(r).catch(() => [])));
    return rooms.map((id, i) => ({ id, name: roomName(id), last: (got[i] || []).filter((m) => !m.team).at(-1) || null }));
  }, [rooms.join()]);
  useEffect(() => {
    if (!LIVE) return undefined;
    const t = setInterval(() => { if (!document.hidden) { posts.reload(); latest.reload(); } }, 60000);
    return () => clearInterval(t);
  }, [latest.reload]);

  const air = useMemo(() => {
    const sessions = voice.data?.sessions?.length ? voice.data.sessions : sample.data?.sessions || [];
    const live = sessions.find((s) => phaseOf(s) === "live") || null;
    const later = sessions.filter((s) => phaseOf(s) !== "live" && Date.parse(s.starts_at) > Date.now()).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))[0] || null;
    return { live, later };
  }, [voice.data, sample.data]);

  const next = useMemo(() => {
    const e = events.data || {};
    const list = [
      ...(e.competitions || []).flatMap((c) => (c.status === "open" ? [{ e: c, label: "Entries close", at: c.closesAt, tag: "Competition" }]
        : c.status === "live" ? [{ e: c, label: "Ends", at: `${c.endsOn}T23:59:00Z`, tag: "Competition" }] : [])),
      ...(e.giveaways || []).flatMap((g) => (g.status === "open" ? [{ e: g, label: "Draw closes", at: g.closesAt, tag: "Free prize draw" }] : [])),
    ];
    return list.filter((x) => Date.parse(x.at) > Date.now()).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  }, [events.data]);

  const days = useMemo(() => bigDays(posts.data), [posts.data]);
  const fresh = useMemo(() => latestPosts(posts.data), [posts.data]);
  const names = [...new Set([...days.map((x) => x.post), ...fresh].filter((p) => !p.anonymous).map((p) => p.author?.handle).filter(Boolean))];
  const closed = useLoad(() => (names.length ? source.closedDays(names) : {}), [names.join()]);
  const roomsNow = useMemo(() => {
    const n = counts.data || {};
    return (latest.data || []).map((r) => ({ ...r, here: n[r.id] || 0 })).sort((a, b) => b.here - a.here);
  }, [latest.data, counts.data]);

  return { here, days, fresh, air, next, roomsNow, hereIn: counts.data || {}, closed: closed.data || {}, posted: !!posts.data, reload: posts.reload };
}
