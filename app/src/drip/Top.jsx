import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Wordmark } from "../components/Logo";
import { useLayer } from "../components/overlay";
import { Avatar, Icon } from "../components/ui";
import Search from "../components/Search";
import { TABS } from "../data";
import { LIVE } from "../mode";
import { openDialog, setState, toast, useStore } from "../store";
import { replayTour } from "../live/ExampleDesk";
import { supabase } from "../live/supabase";
import { sendBeforeLeaving } from "../live/sync";
import { startDmCount } from "../views/community/dmCount";
import TabBar from "./TabBar";
import { useMedia } from "../lib/useMedia.js";

const signOut = () => supabase.auth.signOut().then(({ error }) => { if (error) supabase.auth.signOut({ scope: "local" }); });
// A trade that hasn't reached the server only lives on this device, and signing out clears it
async function leave() {
  const left = await sendBeforeLeaving();
  if (!left) return signOut();
  toast(`${left === 1 ? "1 trade hasn't" : `${left} trades haven't`} reached Marble yet. Signing out now loses ${left === 1 ? "it" : "them"}.`, { warn: true, action: { label: "Sign out anyway", run: signOut }, ms: 12000 });
}

// Full screen where the browser offers it (not iPhone Safari), and not in the installed app
const canFullscreen = () => !!document.fullscreenEnabled && !matchMedia("(display-mode: standalone)").matches;
function useFullscreen() {
  const [on, setOn] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const read = () => setOn(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", read);
    return () => document.removeEventListener("fullscreenchange", read);
  }, []);
  const toggle = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen({ navigationUI: "hide" }))
    .catch(() => toast("Full screen isn't available here."));
  return { on, toggle };
}

function AvatarMenu({ profile, view, onSelect }) {
  const full = useFullscreen();
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const menu = useRef(null);
  useLayer(open, { onEscape: () => setOpen(false) });
  useLayoutEffect(() => {
    const m = menu.current;
    if (!open || !m) return;
    m.style.right = "";
    const r = m.getBoundingClientRect();
    const shift = r.left < 12 ? 12 - r.left : r.right > innerWidth - 12 ? innerWidth - 12 - r.right : 0;
    if (shift) m.style.right = `${-shift}px`;
  }, [open]);
  useEffect(() => { const shut = () => setOpen(false); addEventListener("marble:close-menus", shut); return () => removeEventListener("marble:close-menus", shut); }, []);
  useEffect(() => {
    if (!open) return;
    const el = wrap.current;
    el?.querySelector("[role=menuitem]")?.focus();
    const away = (e) => { if (!el?.contains(e.target)) setOpen(false); };
    const left = (e) => { if (e.relatedTarget && !el.contains(e.relatedTarget)) setOpen(false); };
    const keys = (e) => {
      const items = [...el.querySelectorAll("[role=menuitem]")];
      const i = items.indexOf(document.activeElement);
      const to = e.key === "ArrowDown" ? (i + 1) % items.length : e.key === "ArrowUp" ? (i - 1 + items.length) % items.length : e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : null;
      if (to == null || !items.length) return;
      e.preventDefault();
      items[to].focus();
    };
    document.addEventListener("pointerdown", away);
    el?.addEventListener("focusout", left);
    el?.addEventListener("keydown", keys);
    return () => { document.removeEventListener("pointerdown", away); el?.removeEventListener("focusout", left); el?.removeEventListener("keydown", keys); };
  }, [open]);
  const go = (id, e) => { setOpen(false); onSelect(id, e); };
  const admin = useStore((s) => s.me?.admin);
  const mine = view === "profile" || view === "team" || view === "money";
  return (
    <div className="avatar-wrap" ref={wrap}>
      <button className={`avatar-btn ${mine || open ? "on" : ""}`} onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} aria-label="Your account" title="Your account">
        <Avatar name={profile.name} src={profile.avatar} img={profile.avatarArt} size={36} />
      </button>
      {open && (
        <div className="avatar-menu" ref={menu} role="menu" aria-label="Your account">
          <div className="avatar-menu-head"><b>{profile.name}</b><span className="num">@{profile.handle}</span></div>
          <button role="menuitem" aria-current={view === "profile" ? "page" : undefined} onClick={(e) => go("profile", e)}><Icon name="user" size={15} /> Your profile</button>
          <button role="menuitem" aria-current={view === "money" ? "page" : undefined} onClick={(e) => go("money", e)}><Icon name="wallet" size={15} /> Fees &amp; payouts</button>
          {LIVE && <button role="menuitem" onClick={() => { setOpen(false); openDialog("import"); }}><Icon name="upload" size={15} /> Import trades</button>}
          <button role="menuitem" onClick={() => { setOpen(false); openDialog("backdrop"); }}><Icon name="image" size={15} /> Your picture</button>
          {canFullscreen() && <button role="menuitem" className="menu-fs" onClick={() => { setOpen(false); full.toggle(); }}><Icon name={full.on ? "shrink" : "expand"} size={15} /> {full.on ? "Leave full screen" : "Full screen"}</button>}
          {LIVE && admin && <button role="menuitem" aria-current={view === "team" ? "page" : undefined} onClick={(e) => go("team", e)}><Icon name="bug" size={15} /> Admin</button>}
          {LIVE && <button role="menuitem" onClick={(e) => { go("dashboard", e); replayTour(); }}><Icon name="play" size={15} /> Replay the tour</button>}
          {LIVE && <button role="menuitem" className="menu-bug" onClick={() => { setOpen(false); openDialog("bug", { view }); }}><Icon name="bug" size={15} /> Report a bug</button>}
          {LIVE && <button role="menuitem" onClick={() => { setOpen(false); leave(); }}><Icon name="close" size={15} /> Sign out</button>}
        </div>
      )}
    </div>
  );
}

// The top of the app: the loud logo with its drips hanging into the page, the tab bar, and the account.
// On a phone the same tab bar sits at the foot of the screen.
export default function Top({ view, onSelect }) {
  const profile = useStore((s) => s.profile);
  const dmCount = useStore((s) => s.dmUnread || 0);
  const phone = useMedia("(max-width: 1100px)");
  useEffect(() => { startDmCount(); }, []);
  const home = (e) => { setState({}); onSelect("dashboard", e); };
  return (
    <header className="top">
      <button type="button" className="top-logo" onClick={home} aria-label="Marble, go to your desk" style={{ background: "none", border: 0 }}>
        <Wordmark width={phone ? 172 : 248} pour />
      </button>
      <div className="top-mid"><div style={{ margin: "0 auto" }}><TabBar tabs={TABS} value={view} onChange={onSelect} counts={{ community: dmCount }} /></div></div>
      <div className="top-right">
        {!phone && <Search onGo={(id) => onSelect(id)} />}
        <AvatarMenu profile={profile} view={view} onSelect={onSelect} />
      </div>
    </header>
  );
}
