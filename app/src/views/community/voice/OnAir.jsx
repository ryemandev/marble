import InkPicture from "../../../drip/InkPicture";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../../components/ui";
import { art } from "../../../data";
import { setState, toast } from "../../../store";
import { LIVE } from "../../../mode";
import { useCm, useLoad } from "../context";
import { errText, source } from "../source";
import { Av } from "../parts";
import { Person, Seal, Sheet } from "../dmParts";
import { CREW_ORDER, TOPICS, crewName } from "../houses";
import { REPORT_REASONS, ROLE_WORD, browserToOpen, canAsk, canGoLive, checkQuestion, checkSchedule, countdown, elapsed, icsOf, inAppBrowser, lengthOf, phaseOf, progressOf, questionsInOrder, runFromText } from "./rules";
import { dismissGone, leave, refreshSession, setMic, tapToPlay, tuneIn, useVoice } from "./engine";
import "./voice.css";

/* ---------- Small pieces ---------- */

const PATHS = {
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3",
  micOff: "M15 9.4V6a3 3 0 0 0-5.7-1.3M9 9v3a3 3 0 0 0 4.9 2.3M18.5 11.5a6.5 6.5 0 0 1-1 3.5M5.5 11.5a6.5 6.5 0 0 0 10 5.5M12 18v3M4 4l16 16",
  hand: "M8.5 12.5V6a1.5 1.5 0 0 1 3 0v5M11.5 10.5V4.5a1.5 1.5 0 0 1 3 0v6M14.5 10.5V6.5a1.5 1.5 0 0 1 3 0v7.5a7 7 0 0 1-7 7h-.6a6 6 0 0 1-4.8-2.4l-2.4-3.3a1.5 1.5 0 0 1 2.3-1.9l1.9 2.1V8.5a1.5 1.5 0 0 1 3 0",
  leave: "M14 4h3.5A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5H14M10 8l-4 4 4 4M6 12h10",
  record: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM5.7 5.7l12.6 12.6M12 9a3 3 0 1 0 0 6",
  headphones: "M4 16v-4a8 8 0 0 1 16 0v4M4 16a2 2 0 0 1 2-2h1.5v6H6a2 2 0 0 1-2-2v-2zM20 16a2 2 0 0 0-2-2h-1.5v6H18a2 2 0 0 0 2-2v-2z",
  shield: "M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z",
  chevD: "M6 9.5l6 6 6-6",
  chevU: "M6 14.5l6-6 6 6",
  down: "M12 5v14M6 13l6 6 6-6",
  block: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM5.7 5.7l12.6 12.6",
  dots: null,
};
export function VIco({ name, size = 16 }) {
  if (name === "dots") return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="12" r="1.6" fill="currentColor" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /><circle cx="18.5" cy="12" r="1.6" fill="currentColor" /></svg>;
  if (!PATHS[name]) return <Icon name={name} size={size} />;
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={PATHS[name]} /></svg>;
}

function Face({ who, size = 40, talking, muted, onClick }) {
  const inner = (
    <>
      <Person who={who} size={size} />
      {talking && <><i className="oa-ring a" aria-hidden="true" /><i className="oa-ring b" aria-hidden="true" /></>}
      {muted && <span className="oa-badge" title="Microphone off"><VIco name="micOff" size={Math.max(11, Math.round(size * 0.22))} /></span>}
    </>
  );
  return onClick
    ? <button type="button" className={`oa-face ${talking ? "talking" : ""}`} style={{ "--s": `${size}px` }} onClick={onClick} aria-label={`${who.handle}: options`}>{inner}</button>
    : <span className={`oa-face ${talking ? "talking" : ""}`} style={{ "--s": `${size}px` }}>{inner}</span>;
}
export function Level({ n = 12, on = true }) {
  return (
    <span className={`oa-level ${on ? "on" : ""}`} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => <i key={i} style={{ "--d": `${(0.9 + ((i * 37) % 11) / 10).toFixed(2)}s`, "--o": `${-((i * 53) % 17) / 10}s`, "--h": `${0.25 + (((i * 29) % 13) / 13) * 0.75}` }} />)}
    </span>
  );
}
const NotRecorded = ({ long }) => <span className="oa-norec"><VIco name="record" size={13} />{long ? "Not recorded. Live only." : "Not recorded"}</span>;
export const OnAirMark = ({ soon, small }) => <span className={`oa-mark ${soon ? "soon" : ""} ${small ? "small" : ""}`}><i aria-hidden="true" />{soon ? "Next" : "On air"}</span>;

// The picture behind each room's sessions
const PICTURE = { general: "masters/calling-of-matthew-caravaggio", OLY: "masters/wanderer-friedrich", NITE: "anime/night-figure", PIT: "cars/ferrari-night" };
const clockAt = (iso, zone) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", ...(zone ? { timeZone: zone } : {}) });
const dayAt = (iso) => {
  const d = new Date(iso), now = new Date();
  const days = Math.round((new Date(d.toDateString()) - new Date(now.toDateString())) / 86400e3);
  return days === 0 ? "Today" : days === 1 ? "Tomorrow" : d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
};
const NY = "America/New_York";
const whenLine = (s) => `${dayAt(s.starts_at)} · ${clockAt(s.starts_at)} your time · ${clockAt(s.starts_at, NY)} New York`;
// Hosts first, then guests
export const onAirOf = (s) => (s.people || []).filter((p) => p.role === "host" || p.role === "guest");
// Ticks once a second while something on screen counts
export function useNow(on = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!on) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [on]);
  return now;
}

export function Air({ s, phone, soon, preview, onPerson, talking = [], muted = {} }) {
  return (
    <div className={`oa-air ${phone ? "phone" : ""}`}>
      <InkPicture className="oa-pic" src={art(PICTURE[s.room] || PICTURE.general, 960)} at="50% 30%" edge={false} />
      <div className="oa-air-words">
        <span className="oa-air-kicker">
          {preview ? <span className="oa-mark preview">Preview</span> : <OnAirMark soon={soon} />}
          <span className="num">{preview ? "Sample traders" : soon ? whenLine(s) : `${clockAt(s.starts_at, NY)}–${clockAt(s.ends_at, NY)} New York`}</span>
        </span>
        <b className="oa-title">{s.title}</b>
        {s.blurb && !phone && <span className="oa-blurb">{s.blurb}</span>}
        <span className="oa-on">
          {onAirOf(s).map((p) => (
            <span key={p.handle} className={`oa-on-one ${talking.includes(p.handle) ? "talking" : ""}`}>
              <Face who={p} size={phone ? 34 : 40} talking={talking.includes(p.handle)} muted={!soon && muted[p.handle]} onClick={onPerson ? () => onPerson(p) : null} />
              <span><span className="oa-on-name"><b>{p.handle}</b>{p.staff && <Seal size={12} />}</span><span>{ROLE_WORD[p.role]}</span></span>
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

export function LowerThird({ s, talking, tuned, now, phone }) {
  const item = (s.run || [])[s.run_at || 0];
  const who = talking.find((h) => onAirOf(s).some((p) => p.handle === h));
  return (
    <div className="oa-now">
      <span className="oa-now-tag">Now</span>
      <span className="oa-now-what">{who ? <b>{who}</b> : null}<span>{item ? (who ? `on ${item.what.charAt(0).toLowerCase()}${item.what.slice(1)}` : item.what) : who ? "talking" : "On air"}</span></span>
      <Level n={phone ? 6 : 16} on={tuned && !!who} />
      <span className="oa-now-time num">{elapsed(s, now)}{!phone && <span> / {lengthOf(s)}:00</span>}</span>
      <span className="oa-progress" aria-hidden="true"><i style={{ transform: `scaleX(${progressOf(s, now).toFixed(4)})` }} /></span>
    </div>
  );
}

export function RunSheet({ s, host, onRun }) {
  if (!s.run?.length) return <p className="oa-quiet">No run sheet for this one.</p>;
  const live = phaseOf(s) === "live";
  return (
    <ol className="oa-run">
      {s.run.map((r, i) => {
        const cls = live && i < s.run_at ? "done" : live && i === s.run_at ? "now" : "";
        const row = (
          <>
            <span className="num">{r.at || ""}</span>
            <span className="oa-run-what"><b>{r.what}</b>{cls === "now" && <span>Now</span>}</span>
            {cls === "done" ? <Icon name="check" size={14} /> : cls === "now" ? <i className="cm-live-dot" aria-hidden="true" /> : <i />}
          </>
        );
        return <li key={i} className={cls}>{host && live ? <button type="button" onClick={() => onRun(i)} aria-label={`Move the run sheet to ${r.what}`}>{row}</button> : row}</li>;
      })}
    </ol>
  );
}

/* ---------- Questions ---------- */

export function Questions({ s, host, onAsk, onVote, onSet, onBring, busy, readonly }) {
  const [text, setText] = useState("");
  if (readonly) {
    return (
      <div className="oa-qs">
        {questionsInOrder(s.questions).map((q) => (
          <div key={q.id} className={`oa-q ${q.state}`}>
            <span className={`oa-vote ${q.voted ? "on" : ""}`} aria-label={`${q.votes} want this answered`}><Icon name="up" size={13} /><span className="num">{q.votes}</span></span>
            <span className="oa-q-main">
              <span className="oa-q-who"><Av who={q.from} size={18} /><b>{q.from?.handle || "trader"}</b>{q.state === "next" && <span className="oa-q-tag">Up next</span>}</span>
              <p>{q.body}</p>
            </span>
          </div>
        ))}
      </div>
    );
  }
  const qs = questionsInOrder(s.questions);
  const mineOpen = qs.filter((q) => q.mine && ["open", "next"].includes(q.state)).length;
  const send = async (e) => {
    e.preventDefault();
    const why = checkQuestion(text, mineOpen);
    if (why) { toast(why, { warn: true }); return; }
    if (await onAsk(text.trim())) setText("");
  };
  return (
    <div className="oa-qs">
      {!qs.length && <p className="oa-quiet">No questions yet. {canAsk(s) ? "Ask the first one." : ""}</p>}
      {qs.map((q) => (
        <div key={q.id} className={`oa-q ${q.state}`}>
          <button type="button" className={`oa-vote ${q.voted ? "on" : ""}`} disabled={q.mine || busy} aria-pressed={!!q.voted}
            aria-label={q.mine ? `Your question, ${q.votes} want it answered` : `${q.votes} want this answered. ${q.voted ? "Take back your vote" : "Want it answered too"}`}
            onClick={() => onVote(q)}>
            <Icon name="up" size={13} /><span className="num">{q.votes}</span>
          </button>
          <span className="oa-q-main">
            <span className="oa-q-who"><Av who={q.from} size={18} /><b>{q.from?.handle || "trader"}</b>
              {q.state === "next" && <span className="oa-q-tag">Up next</span>}
              {q.state === "answered" && <span className="oa-q-tag faint">Answered</span>}
              {q.state === "hidden" && <span className="oa-q-tag faint">Hidden</span>}
            </span>
            <p>{q.body}</p>
            {host && (
              <span className="oa-q-tools">
                {q.state !== "next" && q.state !== "answered" && <button type="button" className="link xs" onClick={() => onSet(q, "next")}>Up next</button>}
                {q.state === "next" && !q.mine && <button type="button" className="link xs strong" onClick={() => onBring(q.from)}>Bring {q.from?.handle} on air</button>}
                {q.state !== "answered" && <button type="button" className="link xs" onClick={() => onSet(q, "answered")}>Answered</button>}
                {q.state !== "hidden" ? <button type="button" className="link xs faint" onClick={() => onSet(q, "hidden")}>Hide</button>
                  : <button type="button" className="link xs faint" onClick={() => onSet(q, "open")}>Show</button>}
              </span>
            )}
          </span>
        </div>
      ))}
      {!host && canAsk(s) && (
        <form className="oa-ask" onSubmit={send}>
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={280} placeholder="Ask the host a question" aria-label="Ask the host a question" />
          <button type="submit" className="btn ghost sm" disabled={text.trim().length < 3 || busy}>Send</button>
        </form>
      )}
    </div>
  );
}

/* ---------- A person: the host's tools, or report ---------- */

function PersonSheet({ s, who, kind, host, staff, tracks, muted, onAct, onReport, onProfile, onClose }) {
  const [reporting, setReporting] = useState(false);
  const theyHost = who.role === "host" || who.staff;
  const canAct = host && (!theyHost || staff);
  const row = (icon, label, hint, fn, strong) => (
    <button type="button" className={`oa-menu-row ${strong ? "strong" : ""}`} onClick={fn}>
      <VIco name={icon} size={16} /><span>{label}{hint && <small>{hint}</small>}</span>
    </button>
  );
  return (
    <Sheet title={who.handle} sub={kind === "hand" ? "Asked to speak" : ROLE_WORD[who.role] || "Listening"} className="oa-sheet" onClose={onClose}>
      {reporting ? (
        <div className="oa-menu">
          <p className="oa-menu-note">What's wrong? Marble's staff will see your report and who was talking when you sent it. We don't record sessions, so they won't hear what was said.</p>
          {REPORT_REASONS.map(([k, l]) => <button key={k} type="button" className="oa-menu-row" onClick={() => onReport(k)}><VIco name="shield" size={16} /><span>{l}</span></button>)}
          <button type="button" className="link xs faint" onClick={() => setReporting(false)}>Back</button>
        </div>
      ) : (
        <div className="oa-menu">
          {canAct && kind === "hand" && row("mic", `Bring ${who.handle} on air`, "They can talk once you do", () => onAct("speak"), true)}
          {canAct && kind !== "hand" && who.role === "guest" && tracks[who.handle] && !muted[who.handle] && row("micOff", "Mute", "They can turn it back on", () => onAct("mute"))}
          {canAct && kind !== "hand" && who.role === "guest" && row("down", "Back to listening", "Their microphone goes off", () => onAct("listen"))}
          {canAct && row("leave", "Remove from the session", "They can come back to listen", () => onAct("remove"))}
          {canAct && (
            <div className="oa-ban">
              <span><VIco name="block" size={16} />Ban from voice</span>
              <span className="oa-ban-for">
                <button type="button" onClick={() => onAct("ban", 1)}>24 hours</button>
                {staff && <><button type="button" onClick={() => onAct("ban", 7)}>7 days</button><button type="button" onClick={() => onAct("ban", null)}>For good</button></>}
              </span>
            </div>
          )}
          {canAct && <div className="oa-menu-sep" />}
          {row("shield", "Report to Marble", null, () => setReporting(true))}
          {row("user", "View profile", null, onProfile)}
        </div>
      )}
    </Sheet>
  );
}

const OK_KEY = "marble-voice-ok";
const confirmedBefore = () => { try { return localStorage.getItem(OK_KEY) === "1"; } catch { return false; } };
function JoinSheet({ s, onGo, onClose }) {
  const ua = navigator.userAgent;
  const app = inAppBrowser(ua);
  const copy = async () => { try { await navigator.clipboard.writeText(location.href); toast("Link copied. Paste it into " + browserToOpen(ua) + "."); } catch { toast("Copy the address from the menu instead.", { warn: true }); } };
  return (
    <Sheet title={`Tune in to ${s.title}`} sub={`Hosted by ${onAirOf(s).filter((p) => p.role === "host").map((p) => p.handle).join(", ")}`} className="oa-sheet" onClose={onClose}
      foot={<>{app && <button type="button" className="btn ghost" onClick={copy}>Copy link</button>}<button type="button" className="btn silver" onClick={onGo}>I'm 18 or over. Tune in</button></>}>
      {app && (
        <div className="oa-inapp"><VIco name="headphones" size={18} />
          <span><b>You're in {app}'s browser.</b> You can listen here. To talk, open Marble in {browserToOpen(ua)}: {app}'s browser often blocks the microphone. In {app}, tap the menu at the top, then Open in browser.</span>
        </div>
      )}
      <ul className="oa-points">
        <li><span className="oa-points-ico"><VIco name="headphones" size={16} /></span><span><b>You'll listen</b><span>Ask a question in writing at any time, or ask to speak. A host decides who goes on air.</span></span></li>
        <li><span className="oa-points-ico"><VIco name="record" size={16} /></span><span><b>Not recorded</b><span>Marble and our voice provider save nothing: no recording, no transcript.</span></span></li>
        <li><span className="oa-points-ico"><VIco name="shield" size={16} /></span><span><b>Members 18 and over</b><span>Share what you see, not what to do. Hosts can mute or remove anyone, and you can report anyone.</span></span></li>
      </ul>
    </Sheet>
  );
}

/* ---------- The owner: schedule a session ---------- */

export function ScheduleSheet({ room, onClose, onDone }) {
  const [f, setF] = useState(() => {
    const d = new Date(Date.now() + 3600e3); d.setMinutes(0, 0, 0);
    const local = new Date(d - d.getTimezoneOffset() * 60e3).toISOString().slice(0, 16);
    return { room, title: "", starts: local, minutes: 50, hosts: "", blurb: "", run: "" };
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const go = async () => {
    const input = { room: f.room, title: f.title.trim(), starts: new Date(f.starts).getTime(), minutes: +f.minutes,
      hosts: f.hosts.split(/[\s,]+/).map((h) => h.replace(/^@/, "")).filter(Boolean), blurb: f.blurb.trim() || null, run: runFromText(f.run) };
    const why = checkSchedule(input);
    if (why) { toast(why, { warn: true }); return; }
    setBusy(true);
    try { await source.voiceSchedule(input); toast("Scheduled. It shows in the room a day before."); onDone?.(); onClose(); }
    catch (e) { toast(errText(e, "Couldn't schedule that. Try again."), { warn: true }); }
    setBusy(false);
  };
  return (
    <Sheet title="Schedule a voice session" sub="Hosted, live, not recorded. It shows in its room a day before." className="oa-sheet oa-schedule" onClose={onClose}
      foot={<><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button type="button" className="btn silver" disabled={busy} onClick={go}>Schedule</button></>}>
      <label className="oa-field"><span>Room</span>
        <select value={f.room} onChange={set("room")}>
          <option value="general">General</option>
          <optgroup label="Topics">{TOPICS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>
          <optgroup label="A crew's room (that crew only)">{CREW_ORDER.map((c) => <option key={c} value={c}>{crewName(c)}</option>)}</optgroup>
        </select>
      </label>
      <label className="oa-field"><span>Title</span><input value={f.title} onChange={set("title")} maxLength={60} placeholder="NY open" /></label>
      <div className="oa-field-row">
        <label className="oa-field"><span>Starts (your time)</span><input type="datetime-local" value={f.starts} onChange={set("starts")} /></label>
        <label className="oa-field"><span>Length</span>
          <select value={f.minutes} onChange={set("minutes")}>{[30, 45, 50, 60, 90, 120, 180, 240].map((m) => <option key={m} value={m}>{m < 60 || m % 60 ? `${m} minutes` : `${m / 60} hour${m > 60 ? "s" : ""}`}</option>)}</select>
        </label>
      </div>
      <label className="oa-field"><span>Hosts (one to three handles)</span><input value={f.hosts} onChange={set("hosts")} placeholder="jules, kenji" /></label>
      <label className="oa-field"><span>One line about it (optional)</span><input value={f.blurb} onChange={set("blurb")} maxLength={200} placeholder="Levels, the 9:45 close, then your questions." /></label>
      <label className="oa-field"><span>Run sheet (optional, a line each, the time first if you like)</span>
        <textarea rows={4} value={f.run} onChange={set("run")} placeholder={"09:25 Overnight levels\n09:40 The 9:45 close\n09:55 Your questions"} />
      </label>
    </Sheet>
  );
}

/* ---------- The show ---------- */

export function Show({ session, head, phone, onFold }) {
  const { voice, personCard, me: myself } = useCm();
  const v = useVoice();
  const st = useLoad(() => source.voiceState(session.id), [session.id]);
  useEffect(() => {
    let t = 0;
    const again = () => { clearTimeout(t); t = setTimeout(st.reload, 250 + Math.random() * 900); };
    const off = source.voiceWatch(session.id, again);
    const iv = setInterval(() => { if (!document.hidden) st.reload(); }, LIVE ? 60000 : 15000);
    return () => { off(); clearTimeout(t); clearInterval(iv); };
  }, [session.id]);
  const s = st.data ? { ...session, ...st.data } : session;
  useEffect(() => { refreshSession(s); }, [st.data]);
  const phase = phaseOf(s);
  const now = useNow(true);
  const vme = voice.data?.me || {};
  const staff = !!(vme.staff && vme.aal2);
  const host = !!s.host;
  const tuned = v.session?.id === s.id && v.status === "on";
  const joining = v.session?.id === s.id && v.status === "joining";
  const myRole = tuned ? v.role : s.my_role || "listener";
  const onAir = myRole === "host" || myRole === "guest" || (tuned && v.canTalk);
  const [busy, setBusy] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [person, setPerson] = useState(null); // { who, kind }
  const [handsOpen, setHandsOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  useEffect(() => { if (!ending) return; const t = setTimeout(() => setEnding(false), 4000); return () => clearTimeout(t); }, [ending]);

  const act = async (fn, ok, fallback) => {
    setBusy(true);
    try { await fn(); if (ok) toast(ok); st.reload(); return true; }
    catch (e) { toast(errText(e, e?.message || fallback || "That didn't go through. Try again."), { warn: true }); return false; }
    finally { setBusy(false); }
  };
  const go = async () => {
    setJoinOpen(false);
    try { localStorage.setItem("marble-voice-ok", "1"); } catch { }
    try { await tuneIn(s, source.voiceJoin); } catch (e) { toast(errText(e, e?.message), { warn: true }); }
  };
  const tune = () => (confirmedBefore() && !inAppBrowser(navigator.userAgent) ? go() : setJoinOpen(true));
  const goLive = () => act(async () => { await source.voiceGoLive(s.id); await tuneIn({ ...s, phase: "live", status: "live" }, source.voiceJoin); }, null, "Couldn't go on air.");
  const end = () => {
    if (!ending) { setEnding(true); return; }
    act(async () => { await source.voiceMod(s.id, "end"); await leave(); voice.reload?.(); }, "The show has ended.");
  };
  const mod = (who, action, days) => act(() => source.voiceMod(s.id, action, { handle: who.handle, track: v.tracks[who.handle] || null, days }),
    { mute: `${who.handle} is muted.`, listen: `${who.handle} is back to listening.`, speak: `${who.handle} is on air.`, remove: `${who.handle} was removed.`, ban: `${who.handle} is banned from voice.` }[action]);
  const report = (who, reason) => act(() => source.voiceReport(s.id, who.handle, reason, null, v.talking), "Reported. Marble's staff will look at it.");
  const ask = (body) => act(() => source.voiceAsk(s.id, body), "Sent. The host will see it.");
  const vote = (q) => act(() => source.voiceVote(q.id, !q.voted));
  const setQ = (q, state) => act(() => source.voiceQuestion(q.id, state));
  const hand = () => act(() => source.voiceHand(s.id, !s.my_hand), s.my_hand ? null : "Hand raised. A host can bring you on air.");

  const talking = tuned ? v.talking : [];
  const muted = tuned ? v.muted : {};
  const openPerson = (who, kind = "air") => { if (who.handle !== myself?.handle) setPerson({ who, kind }); };

  // Gone: removed by a host, or the show ended
  useEffect(() => {
    if (!v.gone) return;
    toast(v.gone.why === "removed" ? "A host removed you from the session." : v.gone.why === "ended" ? "The show has ended." : "The connection dropped. Tune in again.", { warn: v.gone.why !== "ended" });
    dismissGone();
    voice.reload?.();
  }, [v.gone]);

  /* Before it starts */
  if (phase === "scheduled") {
    const ms = Date.parse(s.starts_at) - now;
    const calendar = () => {
      const url = URL.createObjectURL(new Blob([icsOf(s, location.origin + location.pathname)], { type: "text/calendar" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: `${s.title.replace(/[^\w ]+/g, "").trim() || "session"}.ics` });
      a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    };
    return (
      <>
        {head}
        <div className="oa-scroll">
          <Air s={s} phone={phone} soon />
          <div className="oa-soon-row">
            <span className="oa-countdown"><span className="caps faint">Starts in</span><b className="num">{countdown(ms)}</b></span>
            <span className="oa-soon-actions">
              {host && canGoLive(s, now) && <button type="button" className="btn silver" disabled={busy} onClick={goLive}><VIco name="mic" size={15} />Go on air</button>}
              <button type="button" className={`btn ${host && canGoLive(s, now) ? "ghost" : "silver"}`} onClick={calendar}><Icon name="calendar" size={15} />Add to calendar</button>
              {vme.admin && staff && <button type="button" className="btn ghost" disabled={busy} onClick={() => act(async () => { await source.voiceCancel(s.id); voice.reload?.(); }, "Cancelled.")}>Cancel it</button>}
            </span>
          </div>
          {host && !canGoLive(s, now) && <p className="oa-quiet pad">You're hosting. You can go on air from 15 minutes before the start.</p>}
          <div className="oa-soon-run"><span className="caps faint">Run sheet</span><RunSheet s={s} /></div>
          {canAsk(s, now) && <div className="oa-soon-run"><span className="caps faint">Ask ahead</span><Questions s={s} host={host} busy={busy} onAsk={ask} onVote={vote} onSet={setQ} onBring={() => {}} /></div>}
          <p className="oa-soon-note"><NotRecorded long /><span>Members 18 and over. You'll listen; ask in writing, or ask to speak.</span></p>
        </div>
      </>
    );
  }

  /* On air */
  const bar = (
    <div className={phone ? "oa-dock" : "oa-bar"}>
      {v.needsTap && tuned && <button type="button" className="oa-tap" onClick={tapToPlay}>Your browser paused the sound. Tap to hear the room.</button>}
      {!phone && (
        <span className="oa-bar-me">
          <VIco name={onAir ? "mic" : "headphones"} size={18} />
          <span><b>{!tuned ? "On air now" : myRole === "host" ? "You're hosting" : onAir ? "You're on air" : "You're listening"}</b><NotRecorded /></span>
        </span>
      )}
      {phone && <NotRecorded long />}
      <span className={phone ? "oa-dock-row" : "oa-bar-right"}>
        {!tuned && (
          <button type="button" className={`btn silver ${phone ? "oa-dock-main" : ""}`} disabled={joining} onClick={tune}>
            <VIco name="headphones" size={16} />{joining ? "Tuning in…" : "Tune in"}
          </button>
        )}
        {tuned && <button type="button" className={phone ? "oa-round" : "btn ghost"} onClick={() => leave()}><VIco name="leave" size={phone ? 20 : 16} /><span>Leave</span></button>}
        {tuned && onAir && (
          <button type="button" className={`${phone ? "btn silver oa-dock-main" : "btn silver"} ${v.mic ? "" : "off"}`} onClick={() => setMic(!v.mic)} aria-pressed={v.mic}>
            <VIco name={v.mic ? "mic" : "micOff"} size={16} />{v.mic ? "Mic on" : "Turn mic on"}
          </button>
        )}
        {tuned && !onAir && (
          <button type="button" className={`${phone ? "btn silver oa-dock-main" : "btn ghost"}`} disabled={busy} onClick={hand} aria-pressed={!!s.my_hand}>
            <VIco name="hand" size={16} />{s.my_hand ? "Hand raised" : "Ask to speak"}
          </button>
        )}
        {tuned && host && <button type="button" className={phone ? "oa-round" : "btn ghost"} onClick={() => setHandsOpen(true)}><VIco name="hand" size={phone ? 20 : 16} /><span>Hands · {s.hand_count || 0}</span></button>}
        {tuned && host && !phone && <button type="button" className="btn ghost" disabled={busy} onClick={end}>{ending ? "Tap again to end" : "End the show"}</button>}
        {tuned && !host && phone && <button type="button" className="oa-round" onClick={() => document.querySelector(".oa-ask input")?.focus()}><Icon name="chat" size={19} /><span>Ask</span></button>}
      </span>
      {tuned && host && phone && <button type="button" className="link xs faint" onClick={end}>{ending ? "Tap again to end the show" : "End the show"}</button>}
    </div>
  );
  const body = (
    <>
      <Air s={s} phone={phone} talking={talking} muted={muted} onPerson={(p) => openPerson(p)} />
      <LowerThird s={s} talking={talking} tuned={tuned} now={now} phone={phone} />
      {phone ? (
        <PhoneTabs s={s} host={host} busy={busy} ask={ask} vote={vote} setQ={setQ} bring={(who) => mod(who, "speak")} onRun={(i) => act(() => source.voiceRun(s.id, i))} />
      ) : (
        <div className="oa-body">
          <div className="oa-col"><span className="caps faint">Run sheet</span><RunSheet s={s} host={host} onRun={(i) => act(() => source.voiceRun(s.id, i))} /></div>
          <div className="oa-col wide"><span className="oa-col-head"><span className="caps faint">Questions</span><span className="oa-col-note">{host ? "Pick what's up next" : "Vote for the ones you want answered"}</span></span>
            <Questions s={s} host={host} busy={busy} onAsk={ask} onVote={vote} onSet={setQ} onBring={(who) => mod(who, "speak")} /></div>
        </div>
      )}
      {bar}
    </>
  );
  const sheets = (
    <>
      {joinOpen && <JoinSheet s={s} onGo={go} onClose={() => setJoinOpen(false)} />}
      {person && <PersonSheet s={s} who={person.who} kind={person.kind} host={host} staff={staff} tracks={v.tracks} muted={v.muted}
        onAct={(action, days) => { mod(person.who, action, days); setPerson(null); }} onReport={(why) => { report(person.who, why); setPerson(null); }}
        onProfile={(e) => { setPerson(null); personCard(person.who.handle, e?.currentTarget); }} onClose={() => setPerson(null)} />}
      {handsOpen && (
        <Sheet title="Asking to speak" sub={s.hands?.length ? "Bring someone on air, or leave them listening." : "Nobody's asked yet."} className="oa-sheet" onClose={() => setHandsOpen(false)}>
          <div className="oa-hands">
            {(s.hands || []).map((h) => (
              <div key={h.handle} className="oa-hand"><Av who={h} size={28} /><b>{h.handle}</b>
                <button type="button" className="btn ghost sm" onClick={() => { setHandsOpen(false); setPerson({ who: h, kind: "hand" }); }}><VIco name="dots" size={14} /></button>
                <button type="button" className="btn silver sm" onClick={() => mod(h, "speak")}>Bring on air</button>
              </div>
            ))}
          </div>
        </Sheet>
      )}
    </>
  );
  if (phone && tuned) {
    return (
      <>
        {head}
        {createPortal(
          <div className="oa-phone cm-view" role="dialog" aria-modal="true" aria-label={`${s.title}, on air`} onKeyDown={(e) => { if (e.key === "Escape") onFold?.(); }}>
            <div className="oa-phone-top">
              <button type="button" className="icon-btn" aria-label="Fold the show away" onClick={onFold} ref={(el) => { if (el && !el.dataset.focused) { el.dataset.focused = "1"; el.focus({ preventScroll: true }); } }}><VIco name="chevD" size={20} /></button>
              <span className="oa-phone-title"><b>{s.title}</b><span>{v.count ? `${v.count} tuned in` : "On air"}</span></span>
              <NotRecorded />
            </div>
            <div className="oa-phone-body">{body}</div>
          </div>, document.body)}
        {sheets}
      </>
    );
  }
  return (
    <>
      {head}
      <div className="oa-scroll show">{body}</div>
      {sheets}
    </>
  );
}

function PhoneTabs({ s, host, busy, ask, vote, setQ, bring, onRun }) {
  const [tab, setTab] = useState("q");
  return (
    <>
      <div className="cm-seg oa-tabs" role="group" aria-label="The show">
        <button type="button" aria-pressed={tab === "q"} onClick={() => setTab("q")}>Questions <span className="num">{(s.questions || []).filter((q) => q.state !== "hidden").length}</span></button>
        <button type="button" aria-pressed={tab === "run"} onClick={() => setTab("run")}>Run sheet</button>
      </div>
      <div className="oa-phone-pane">
        {tab === "q" ? <Questions s={s} host={host} busy={busy} onAsk={ask} onVote={vote} onSet={setQ} onBring={bring} /> : <RunSheet s={s} host={host} onRun={onRun} />}
      </div>
    </>
  );
}

export function VoiceStrip({ s, onOpen, invite }) {
  const v = useVoice();
  const talking = v.session?.id === s.id ? v.talking.find((h) => onAirOf(s).some((p) => p.handle === h)) : null;
  return (
    <div className="oa-strip">
      <OnAirMark soon={phaseOf(s) === "scheduled"} small />
      <span className="oa-strip-text">
        <b>{talking || s.title}</b>
        <span>{invite ? (phaseOf(s) === "scheduled" ? whenLine(s) : `${onAirOf(s).map((p) => p.handle).join(", ")} on air`) : talking ? s.title : "Tuned in"}</span>
      </span>
      {!invite && <Level n={8} on={!!talking} />}
      <button type="button" className={invite ? "btn silver sm" : "icon-btn"} onClick={onOpen} aria-label={invite ? undefined : "Back to the show"}>
        {invite ? (phaseOf(s) === "scheduled" ? "Details" : "Tune in") : <VIco name="chevU" size={18} />}
      </button>
      {!invite && <button type="button" className="icon-btn" onClick={() => leave()} aria-label="Leave the session"><VIco name="leave" size={17} /></button>}
    </div>
  );
}

export function VoiceDock({ view, go }) {
  const v = useVoice();
  if (view === "community" || v.status !== "on" || !v.session) return null;
  const s = v.session;
  const talking = v.talking.find((h) => onAirOf(s).some((p) => p.handle === h));
  const back = () => { setState({ communityTab: "chat", communityRoom: s.room }); go("community"); };
  return (
    <div className="oa-dock-app" role="region" aria-label="Voice session">
      <OnAirMark small />
      <button type="button" className="oa-dock-app-text" onClick={back}>
        <b>{talking || s.title}</b><span>{talking ? s.title : "Tuned in"}</span>
      </button>
      <Level n={6} on={!!talking} />
      <button type="button" className="icon-btn" onClick={() => leave()} aria-label="Leave the session"><VIco name="leave" size={17} /></button>
    </div>
  );
}
