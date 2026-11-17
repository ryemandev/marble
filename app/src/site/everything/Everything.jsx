import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { COUNTS, GROUPS, plainText } from "./features";
import { HERO } from "./copy";
import { HOME_URL, sectionUrl } from "../Header";
import { EndWave, Ghost, StartFree, reduced } from "../heroes/shared";
import "./everything.css";
import InkPicture from "../../drip/InkPicture";
import Lines from "../ink/Lines";

const BASE = import.meta.env.BASE_URL;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordsOf = (q) => q.trim().toLowerCase().split(/\s+/).filter(Boolean);
const HAY = new Map(GROUPS.flatMap((g) => g.features.map((f) => [f.id, `${g.name} ${f.name} ${plainText(f)}`.toLowerCase()])));
const matches = (f, words) => words.every((w) => HAY.get(f.id).includes(w));

function Marked({ text, words }) {
  if (!words.length) return text;
  const re = new RegExp(`(${words.map(esc).join("|")})`, "gi");
  return text.split(re).map((part, i) => (i % 2 ? <mark key={i} className="ev-hit">{part}</mark> : part));
}

const Glass = () => (
  <svg className="ev-glass" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5.25" /><path d="M11 11l3.5 3.5" /></svg>
);

function Tick() {
  return <svg className="ev-tick" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 7.5l3 3 6-7" /></svg>;
}
function Feature({ f, words, shown }) {
  return (
    <li id={f.id} className="ev-f" hidden={!shown}>
      <details open={words.length > 0 || undefined}>
        <summary><Tick /><h3 className="ev-fn"><Marked text={f.name} words={words} /></h3><i className="ev-more" aria-hidden="true" /></summary>
        <div className="ev-fbody">
          <p className="ev-ft"><Marked text={f.text} words={words} /></p>
          {f.list && (
            <ul className={`ev-fl ${f.list.length > 8 ? "cols" : ""}`}>
              {f.list.map((x) => <li key={x}><Marked text={x} words={words} /></li>)}
            </ul>
          )}
        </div>
      </details>
    </li>
  );
}

export default function Everything() {
  const [query, setQuery] = useState("");
  const words = useMemo(() => wordsOf(query), [query]);
  const hits = useMemo(() => new Set(GROUPS.flatMap((g) => g.features.filter((f) => !words.length || matches(f, words)).map((f) => f.id))), [words]);
  const count = (g) => g.features.filter((f) => hits.has(f.id)).length;
  const [active, setActive] = useState(GROUPS[0].id);
  const groupEls = useRef({});
  const indexEls = useRef({});
  const search = useRef(null);
  const [dash, setDash] = useState(null);

  useEffect(() => {
    let raf = 0;
    const check = () => {
      raf = 0;
      let cur = null;
      for (const g of GROUPS) {
        const el = groupEls.current[g.id];
        if (!el || el.hidden) continue;
        if (!cur) cur = g.id;
        if (el.getBoundingClientRect().top <= innerHeight * 0.4) cur = g.id;
      }
      if (cur) setActive(cur);
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(check); };
    check();
    addEventListener("scroll", on, { passive: true });
    addEventListener("resize", on);
    return () => { removeEventListener("scroll", on); removeEventListener("resize", on); cancelAnimationFrame(raf); };
  }, [hits]);

  useLayoutEffect(() => {
    const place = () => {
      const el = indexEls.current[active];
      setDash((prev) => (el && el.offsetParent ? { y: Math.round(el.offsetTop), h: Math.round(el.offsetHeight), ready: !!prev } : null));
    };
    place();
    addEventListener("resize", place);
    return () => removeEventListener("resize", place);
  }, [active, hits]);

  useEffect(() => {
    const el = indexEls.current[active];
    const row = el?.parentElement, nav = el?.closest(".ev-index");
    if (!row || !nav) return;
    const behavior = reduced() ? "auto" : "smooth";
    const a = el.getBoundingClientRect();
    if (row.scrollWidth > row.clientWidth + 1) {
      const r = row.getBoundingClientRect();
      row.scrollTo({ left: Math.round(row.scrollLeft + a.left - r.left - (r.width - a.width) / 2), behavior });
    } else if (nav.scrollHeight > nav.clientHeight + 1) {
      const r = nav.getBoundingClientRect();
      if (a.top < r.top || a.bottom > r.bottom) nav.scrollTo({ top: Math.round(nav.scrollTop + a.top - r.top - (r.height - a.height) / 2), behavior });
    }
  }, [active]);

  useEffect(() => {
    let id = "";
    try { id = decodeURIComponent(location.hash.slice(1)); } catch {}
    const el = id && document.getElementById(id);
    if (!el || !el.closest(".ev-list")) return;
    const d = el.matches(".ev-f") && el.querySelector("details");
    if (d) d.open = true;
    const go = () => el.scrollIntoView({ block: "start" });
    go();
    document.fonts?.ready.then(go);
  }, []);

  const jump = (e, id, c) => {
    e.preventDefault();
    if (!c) return;
    groupEls.current[id]?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
    try { history.replaceState(null, "", `#${id}`); } catch {}
  };
  const toSearch = () => {
    const el = search.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + scrollY - (innerWidth <= 640 ? 84 : 96);
    scrollTo({ top: Math.max(0, Math.round(top)), behavior: reduced() ? "auto" : "smooth" });
    el.focus({ preventScroll: true });
  };

  const total = hits.size;
  const status = words.length
    ? `${total} of ${COUNTS.features} features`
    : `${COUNTS.groups} groups · ${COUNTS.features} features`;

  return (
    <>
      <section className="ev-hero" aria-labelledby="ev-title">
        <InkPicture className="ev-hero-art" src={`${BASE}site/ev-falls.webp`} srcSet={`${BASE}site/ev-falls-640.webp 640w, ${BASE}site/ev-falls.webp 1067w`} sizes="(max-width: 640px) 100vw, 50vw" at="50% 18%" aria-hidden="true" />
        <div className="ev-wrap ev-hero-in">
          <nav className="pg-crumbs" aria-label="Breadcrumb">
            <a href={HOME_URL}>Marble</a><span aria-hidden="true">/</span><span aria-current="page">{HERO.crumb}</span>
          </nav>
          <Lines as="h1" id="ev-title" className="ev-h1" text={HERO.h1[0]} silver={HERO.h1[1]} now />
          <p className="ev-lede">{HERO.lede}</p>
          <dl className="ev-tally">
            <div><dt>Groups</dt><dd className="num">{COUNTS.groups}</dd></div>
            <div><dt>Features</dt><dd className="num">{COUNTS.features}</dd></div>
            <div><dt>Questions to ask</dt><dd className="num">{COUNTS.questions}</dd></div>
          </dl>
          <div className="hx-actions ev-hero-actions">
            <StartFree />
            <Ghost onClick={toSearch}>Search every feature</Ghost>
          </div>
        </div>
      </section>

      <section className="ev-body" aria-label="Every feature">
        <div className="ev-wrap ev-grid">
          <aside className="ev-side">
            <div className="ev-find">
              <label className="ev-search">
                <Glass />
                <span className="sr-only">Search every feature</span>
                <input ref={search} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search every feature" autoComplete="off" spellCheck="false" aria-describedby="ev-status" aria-controls="ev-list" />
                {query && <button type="button" className="ev-clear" onClick={() => { setQuery(""); search.current?.focus(); }} aria-label="Clear the search"><i /><i /></button>}
              </label>
              <p className="ev-status num" id="ev-status" aria-live="polite">{status}</p>
            </div>
            <nav className="ev-index" aria-label="Feature groups">
              <ol>
                <li className="ev-chip-search"><button type="button" onClick={toSearch} aria-label="Search every feature"><Glass /></button></li>
                {GROUPS.map((g) => {
                  const c = count(g);
                  const on = active === g.id && c > 0;
                  return (
                    <li key={g.id} ref={(el) => (indexEls.current[g.id] = el)}>
                      <a href={`#${g.id}`} className={`${on ? "on" : ""} ${c ? "" : "none"}`} aria-current={on ? "true" : undefined} onClick={(e) => jump(e, g.id, c)} aria-disabled={c ? undefined : "true"} tabIndex={c ? undefined : -1}>
                        <span className="ev-in" data-v={g.no} aria-hidden="true" />
                        <span className="ev-il">{g.label}</span>
                        <span className="ev-ic" data-v={c} aria-hidden="true" />
                      </a>
                    </li>
                  );
                })}
              </ol>
              {dash && <span className={`ev-dash ${dash.ready ? "ready" : ""}`} style={{ top: dash.y, height: dash.h }} aria-hidden="true" />}
            </nav>
          </aside>

          <div className="ev-list" id="ev-list">
            {GROUPS.map((g) => {
              const c = count(g);
              return (
                <section key={g.id} id={g.id} className="ev-group" ref={(el) => (groupEls.current[g.id] = el)} hidden={!c} aria-labelledby={`${g.id}-t`}>
                  <header className="ev-gh">
                    <span className="ev-gk num"><span>{g.no}</span><span>{words.length ? `${c} of ${g.features.length}` : `${g.features.length} features`}</span></span>
                    <h2 id={`${g.id}-t`} className="ev-gt"><Marked text={g.name} words={words} /></h2>
                    <p className="ev-gl">{g.line}</p>
                  </header>
                  <ul className="ev-feats">
                    {g.features.map((f) => <Feature key={f.id} f={f} words={words} shown={hits.has(f.id)} />)}
                  </ul>
                </section>
              );
            })}
            {!total && (
              <div className="ev-empty">
                <p className="ev-empty-t">Nothing matches that.</p>
                <p className="ev-empty-s">Try another word, like import, ask or limits.</p>
                <button type="button" className="ev-link" onClick={() => { setQuery(""); search.current?.focus(); }}>Clear the search<span className="ev-arrow" aria-hidden="true">→</span></button>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="ev-end ink-section" aria-labelledby="ev-end-title">
        <EndWave />
        <div className="ev-wrap ev-end-in">
          <span className="hx-kicker">All of it</span>
          <h2 id="ev-end-title" className="ev-end-title"><span>Everything above,</span><span className="silver">free forever.</span></h2>
          <p className="hx-sub ev-end-sub">For everyone, with no card to enter and no trial to run out.</p>
          <div className="hx-actions ev-end-actions">
            <StartFree />
            <Ghost href={sectionUrl("faq")}>Read the answers</Ghost>
          </div>
        </div>
      </section>
    </>
  );
}
