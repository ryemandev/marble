import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Wordmark } from "../components/Logo";
import { Icon } from "../components/ui";
import { Toaster } from "../components/forms";
import { TwoStep } from "../live/Staff";
import { rpc, whoAmI } from "./api";
import { count } from "./model";
import { I, go } from "./parts";
import Overview from "./Overview";
import Floor from "./Floor";
import Users from "./Users";
import Events from "./Events";
import Reports from "./Reports";
import Health from "./Health";

const DESK = import.meta.env.PROD ? "/desk/" : "./index.html";

const SECTIONS = [
  { id: "overview", label: "Today", icon: "overview" },
  { id: "users", label: "Users", icon: "traders" },
  { id: "floor", label: "Floor", icon: "chat" },
  { id: "events", label: "Competitions", icon: "trophy" },
  { id: "reports", label: "Reports", icon: "flag" },
  { id: "health", label: "Health", icon: "health" },
];
// What's waiting in each section, from the overview's counts
const badges = (n) => ({
  reports: (n?.reports || 0) + (n?.dm_reports || 0),
  floor: n?.ideas || 0,
  health: (n?.bugs || 0) + (n?.cron_failed || 0) + (n?.crashes || 0),
});

function useRoute() {
  const read = () => {
    const [first, ...rest] = (location.hash.slice(1) || "overview").split("/");
    const section = first === "traders" ? "users" : first; // the old name, in saved links
    return { section: SECTIONS.some((s) => s.id === section) ? section : "overview", rest };
  };
  const [r, setR] = useState(read);
  useEffect(() => { const f = () => setR(read()); addEventListener("hashchange", f); return () => removeEventListener("hashchange", f); }, []);
  return r;
}

function Rail({ section, counts, email }) {
  const i = Math.max(0, SECTIONS.findIndex((s) => s.id === section));
  return (
    <aside className="adm-rail" aria-label="Admin sections">
      <nav className="adm-nav">
        <span className="adm-nav-ind" style={{ transform: `translateY(${i * 42}px)` }} aria-hidden="true" />
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" className={section === s.id ? "on" : ""} aria-current={section === s.id ? "page" : undefined} onClick={() => go(s.id)}>
            <I n={s.icon} size={17} /><span>{s.label}</span>
            {counts[s.id] > 0 && <span className="adm-badge num" aria-label={`${counts[s.id]} waiting`}>{count(counts[s.id])}</span>}
          </button>
        ))}
      </nav>
      <div className="adm-rail-foot">
        <a className="link-muted" href={DESK}><I n="ext" size={14} /> Open your desk</a>
        <p className="faint xs">Signed in as <span className="adm-email">{email}</span>, with two-step. The server checks both on every request.</p>
      </div>
    </aside>
  );
}

function PillTabs({ section, counts }) {
  const nav = useRef(null);
  const [ind, setInd] = useState(null);
  useLayoutEffect(() => {
    const row = nav.current;
    const place = () => {
      const el = row?.querySelector(`[data-tab="${section}"]`);
      if (!el) return;
      row.classList.toggle("scrolls", row.scrollWidth > row.clientWidth + 1);
      setInd((p) => {
        const n = { left: el.offsetLeft, right: row.clientWidth - (el.offsetLeft + el.offsetWidth) };
        return p && p.left === n.left && p.right === n.right ? p : n;
      });
      if (row.scrollWidth > row.clientWidth) el.scrollIntoView({ inline: "center", block: "nearest" });
    };
    place();
    let live = true;
    document.fonts?.ready.then(() => live && place());
    // A tab changes width when the type arrives or a count appears
    const ro = new ResizeObserver(place);
    ro.observe(row);
    row.querySelectorAll("[data-tab]").forEach((b) => ro.observe(b));
    return () => { live = false; ro.disconnect(); };
  }, [section, counts.reports, counts.health, counts.floor]);
  return (
    <nav className="tabs adm-tabs" ref={nav} aria-label="Admin sections">
      {ind && <span className="tab-ind" style={{ left: ind.left, right: ind.right }} aria-hidden="true" />}
      {SECTIONS.map((s) => (
        <button key={s.id} type="button" data-tab={s.id} className={`tab ${section === s.id ? "active" : ""}`} aria-current={section === s.id ? "page" : undefined} onClick={() => go(s.id)}>
          {s.label}{counts[s.id] > 0 && <span className="tab-n num">{count(counts[s.id])}</span>}
        </button>
      ))}
    </nav>
  );
}

function TopBar({ section, counts, onSearch, preview }) {
  const [q, setQ] = useState("");
  return (
    <header className="topbar adm-top">
      <div className="brand adm-brand">
        <Wordmark fontSize={22} className="wordmark" />
        <span className="adm-tag">Admin</span>
      </div>
      <form className="search adm-search" role="search" onSubmit={(e) => { e.preventDefault(); onSearch(q.trim()); }}>
        <Icon name="search" size={15} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a trader by handle, name or email" aria-label="Find a trader" />
      </form>
      <PillTabs section={section} counts={counts} />
      <div className="top-right">
        {preview && <span className="adm-sample" title="Invented data: the dev server's preview">Preview data</span>}
      </div>
    </header>
  );
}

function StatusBar({ o }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30e3); return () => clearInterval(t); }, []);
  const n = o?.needs || {};
  return (
    <footer className="statusbar adm-status">
      {!o && <span className="muted">Checking…</span>}
      {n.crashes > 0 && <button type="button" className="muted link-plain" onClick={() => go("health/crashes")}>{n.crashes} crash{n.crashes === 1 ? "" : "es"} today</button>}
      {n.cron_failed > 0 && <button type="button" className="muted link-plain hide-sm" onClick={() => go("health/cron")}>{n.cron_failed} scheduled job{n.cron_failed === 1 ? "" : "s"} failed today</button>}
      <span className="spacer" />
      <span className="muted num">{new Date().toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
    </footer>
  );
}

/* ---------- The way in ---------- */

function Hall({ title, sub, children }) {
  return (
    <div className="gate gl gl-hall adm-gate">
      <figure className="hall-art" aria-hidden="true">
        <div className="hall-layer top">
          <img src="/art/masters/wanderer-friedrich-960.webp" alt="" style={{ objectPosition: "50% 30%" }} />
          <div className="hall-words">
            <span className="hall-kicker">Marble · the owner's door</span>
            <span className="hall-head"><span>The whole house,</span> <span className="silver-text">one room.</span></span>
          </div>
        </div>
      </figure>
      <div className="hall-side">
        <div className="gate-card">
          <div className="adm-brand"><Wordmark fontSize={24} className="wordmark" /><span className="adm-tag">Admin</span></div>
          <h1 className="gate-title">{title}</h1>
          {sub && <p className="gate-sub">{sub}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}

function WayIn({ who, onIn }) {
  if (who.state === "out") return (
    <Hall title="Sign in to run Marble." sub="The admin area uses your Marble sign-in. Sign in at your desk, then come back to this page.">
      <a className="btn silver gate-btn" href={DESK}>Sign in at your desk</a>
    </Hall>
  );
  if (who.state === "trader") return (
    <Hall title="This page is for Marble's team." sub={`You're signed in as ${who.email}.`}>
      <a className="btn ghost gate-btn" href={DESK}>Back to your desk</a>
    </Hall>
  );
  return (
    <Hall title="One more step." sub="The admin area opens only with two-step sign-in: a 6-digit code from your authenticator app, so a stolen password alone can't run Marble.">
      <div className="adm-twostep"><TwoStep level="aal1" onLevel={onIn} intro={false} /></div>
    </Hall>
  );
}

/* ---------- The page ---------- */

export default function Admin() {
  const [who, setWho] = useState(null);
  const check = () => whoAmI().then(setWho, () => setWho({ state: "out" }));
  useEffect(() => { check(); }, []);
  if (!who) return <div className="adm-loading"><Wordmark fontSize={28} className="wordmark" /></div>;
  if (who.state !== "in") return <><WayIn who={who} onIn={check} /><Toaster /></>;
  return <Office who={who} />;
}

function Office({ who }) {
  const { section, rest } = useRoute();
  const [overview, setOverview] = useState(null);
  const [query, setQuery] = useState("");
  const preview = import.meta.env.DEV && new URLSearchParams(location.search).has("preview");
  const refresh = () => rpc("admin_overview").then(setOverview, () => {});
  useEffect(() => { refresh(); }, [section]);
  useEffect(() => { document.querySelector(".adm .main-scroll")?.scrollTo(0, 0); window.scrollTo(0, 0); }, [section]);
  const counts = badges(overview?.needs);
  const search = (q) => { setQuery(q); go("users"); };
  const view = {
    overview: <Overview o={overview} onReload={refresh} open={rest[0]} />,
    floor: <Floor tab={rest[0]} onChange={refresh} />,
    users: <Users tab={rest[0]} query={query} onQuery={setQuery} />,
    events: <Events tab={rest[0]} open={rest[1]} mode={rest[2]} />,
    reports: <Reports tab={rest[0]} onChange={refresh} />,
    health: <Health tab={rest[0]} open={rest[1]} onChange={refresh} />,
  }[section];
  return (
    <div className="adm">
      <div className="grain" aria-hidden="true" />
      <TopBar section={section} counts={counts} onSearch={search} preview={preview} />
      <Rail section={section} counts={counts} email={who.email} />
      <main className="main"><div className="main-scroll"><div key={section} className="adm-view">{view}</div></div></main>
      <StatusBar o={overview} />
      <Toaster />
    </div>
  );
}
