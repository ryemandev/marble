import { useEffect, useRef, useState } from "react";
import { Wordmark } from "../components/Logo";
import TabBar from "../drip/TabBar";
import { TOOLS } from "./tools/copy";
import { startLink } from "../lib/intent";

export const LINKS = [["features", "Features"], ["journal", "Journal"], ["community", "Floor"], ["pricing", "Free"], ["faq", "FAQ"]];
const PAGE_ONLY = new Set(["everything", "changes", ...TOOLS.map((t) => t.slug)]);
export const OFF_HOME = new Set(["features", "journal"]);
export const SECTION_LINKS = LINKS;
export const FOOTER_PAGES = [["everything", "Everything in Marble"], ["changes", "What's new"]];
export const APP_URL = import.meta.env.VITE_APP_URL || "https://claude.ai/artifact/L4aWUgaZZgPdEPnPxw7sos";
export const START_URL = startLink(APP_URL);

const LIVE = import.meta.env.PROD && import.meta.env.BASE_URL === "/";
const OWN_PAGE = new Set(["features", "journal", "pricing", "faq", "founder"]);
export const HOME_URL = LIVE ? "/" : `${import.meta.env.BASE_URL}site.html`;
const pageUrl = (id) => (LIVE ? `/${id}` : `${import.meta.env.BASE_URL}pages/${id}.html`);
export const sectionUrl = (id) => (PAGE_ONLY.has(id) || OFF_HOME.has(id) ? pageUrl(id) : LIVE && OWN_PAGE.has(id) ? `/${id}` : `${HOME_URL}#${id}`);
const linkTo = (id, away) => (away || PAGE_ONLY.has(id) || OFF_HOME.has(id) ? sectionUrl(id) : `#${id}`);
const PAGE = document.body.dataset.page || null;
export const legalUrl = (id) => `${LIVE ? "/legal" : `${import.meta.env.BASE_URL}legal.html`}#${id}`;

// Older pages hand their label to this and keep a hidden copy for screen readers
export const Roll = ({ children }) => <span aria-hidden="true">{children}</span>;

// On the home page the bar follows the sections. Elsewhere it holds the pages.
const HOME_TABS = [{ id: "app", label: "App" }, { id: "close", label: "Close" }, { id: "cards", label: "Cards" }, { id: "study", label: "Study" }, { id: "community", label: "Floor" }, { id: "pricing", label: "Free" }];
const PAGE_TABS = [{ id: "home", label: "Home" }, { id: "features", label: "Features" }, { id: "journal", label: "Journal" }, { id: "pricing", label: "Free" }, { id: "faq", label: "FAQ" }];

function useSection(home) {
  const [at, setAt] = useState({ id: "app", top: home, film: false });
  useEffect(() => {
    if (!home) return undefined;
    let raf = 0;
    const check = () => {
      raf = 0;
      let cur = "app", film = false;
      for (const el of document.querySelectorAll("main > section[id]")) {
        const r = el.getBoundingClientRect();
        if (r.top <= innerHeight * 0.45 && HOME_TABS.some((t) => t.id === el.id)) cur = el.id;
        if (el.id === "app") film = r.top < innerHeight * 0.7 && r.bottom > innerHeight * 0.3;
      }
      const top = scrollY < innerHeight * 0.92;
      setAt((a) => (a.id === cur && a.top === top && a.film === film ? a : { id: cur, top, film }));
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(check); };
    check();
    addEventListener("scroll", on, { passive: true });
    addEventListener("resize", on);
    return () => { removeEventListener("scroll", on); removeEventListener("resize", on); cancelAnimationFrame(raf); };
  }, [home]);
  return at;
}

const Brand = ({ away = false }) => (
  <a href={away ? HOME_URL : "#top"} className="brand" aria-label={away ? "Marble, the home page" : "Marble, back to the top"}><Wordmark width={112} /></a>
);

const Actions = () => (
  <div className="actions">
    <a className="login" href={APP_URL}>Log in</a>
    <a className="cta" href={START_URL} aria-label="Start journaling"><span>Start<i> journaling</i></span></a>
  </div>
);

function Menu({ away = false }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const el = wrap.current;
    el.querySelector(".menu-panel a")?.focus({ preventScroll: true });
    const outside = (e) => { if (!el.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === "Escape") { setOpen(false); el.querySelector(".menu-btn")?.focus(); } };
    const left = (e) => { if (e.relatedTarget && !el.contains(e.relatedTarget)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    el.addEventListener("focusout", left);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", key); el.removeEventListener("focusout", left); };
  }, [open]);
  return (
    <div className="menu" ref={wrap}>
      <button type="button" className={`menu-btn ${open ? "open" : ""}`} aria-expanded={open} aria-controls="site-menu" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen(!open)}>
        <i /><i />
      </button>
      <div id="site-menu" className="menu-panel" hidden={!open}>
        {LINKS.map(([id, label]) => (
          <a key={id} href={linkTo(id, away)} className={PAGE === id ? "on" : ""} aria-current={PAGE === id ? "page" : undefined} onClick={() => setOpen(false)}>{label}</a>
        ))}
        <div className="menu-foot">
          <a className="login" href={APP_URL}>Log in</a>
          <a className="cta" href={START_URL}><span>Start journaling</span></a>
        </div>
      </div>
    </div>
  );
}

export default function Header({ away = false, skipTo = "top" }) {
  const home = !PAGE && !away;
  const at = useSection(home);
  const go = (id) => {
    if (home) { location.hash = id; return; }
    location.href = id === "home" ? HOME_URL : sectionUrl(id);
  };
  return (
    <header className={`hdr ${at.top ? "top" : ""} ${at.film ? "film" : ""}`}>
      <a className="skip" href={`#${skipTo}`}>Skip to content</a>
      <Brand away={away} />
      <div className="hdr-tabs">
        <TabBar tabs={home ? HOME_TABS : PAGE_TABS} value={home ? at.id : PAGE} onChange={go} label={home ? "Sections" : "Pages"} />
      </div>
      <div className="hdr-end">
        <Actions />
        <Menu away={away} />
      </div>
    </header>
  );
}
