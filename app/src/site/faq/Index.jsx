import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ALL, GROUPS } from "./answers";
import { OWNER } from "../legal/owner";
import { EndWave, Ghost, StartFree, reduced } from "../heroes/shared";
import { Roll, sectionUrl } from "../Header";
import Footer from "../Footer";
import "./index.css";

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordsOf = (q) => q.trim().toLowerCase().split(/\s+/).filter(Boolean);
const matches = (it, words) => { const text = `${it.q} ${it.a}`.toLowerCase(); return words.every((w) => text.includes(w)); };

function Marked({ text, words }) {
  if (!words.length) return text;
  const re = new RegExp(`(${words.map(esc).join("|")})`, "gi");
  return text.split(re).map((part, i) => (i % 2 ? <mark key={i} className="qi-hit">{part}</mark> : part));
}

function Row({ item, open, onToggle, words, n }) {
  const inner = useRef(null);
  const [h, setH] = useState(0);
  useLayoutEffect(() => {
    const el = inner.current;
    const measure = () => setH(Math.ceil(el.getBoundingClientRect().height));
    measure();
    if (!open) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, words.join(" ")]);
  return (
    <div className={`qi-row ${open ? "open" : ""}`}>
      <h4 className="qi-q">
        <button type="button" className="qi-btn" id={`qi-q-${n}`} aria-expanded={open} aria-controls={`qi-a-${n}`} onClick={onToggle}>
          <span className="qi-n" data-v={n} aria-hidden="true" />
          <span className="qi-qt"><Marked text={item.q} words={words} /></span>
          <span className="qi-pm" aria-hidden="true"><i /><i /></span>
        </button>
      </h4>
      <div className="qi-panel" id={`qi-a-${n}`} role="region" aria-labelledby={`qi-q-${n}`} style={{ height: open ? h : 0 }} inert={open ? undefined : ""}>
        <div className="qi-inner" ref={inner}>
          <p><Marked text={item.a} words={words} /></p>
          {item.link && (
            <a className="qi-link" href={item.link.href}>
              <Roll>{item.link.label}</Roll><span className="sr-only">{item.link.label}</span><span className="qi-arrow" aria-hidden="true">→</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Index() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(() => new Set([ALL[0].q]));
  const [active, setActive] = useState(GROUPS[0].key);
  const words = useMemo(() => wordsOf(query), [query]);
  const all = ALL;
  const num = useMemo(() => new Map(all.map((it, i) => [it.q, String(i + 1).padStart(2, "0")])), [all]);
  const hits = useMemo(() => (words.length ? all.filter((it) => matches(it, words)) : all), [words, all]);
  const hitSet = useMemo(() => new Set(hits.map((it) => it.q)), [hits]);
  const section = useRef(null);
  const groupEls = useRef({});
  const indexEls = useRef({});
  const [dash, setDash] = useState(null);

  useEffect(() => {
    if (!words.length) return;
    setOpen(new Set(hits.filter((it) => words.some((w) => it.a.toLowerCase().includes(w))).map((it) => it.q)));
  }, [query]);

  const toggle = (q) => setOpen((s) => { const n = new Set(s); n.has(q) ? n.delete(q) : n.add(q); return n; });

  // Which group is being read, for the index
  useEffect(() => {
    let raf = 0;
    const check = () => {
      raf = 0;
      let cur = null;
      for (const g of GROUPS) {
        const el = groupEls.current[g.key];
        if (!el) continue;
        if (!cur) cur = g.key;
        if (el.getBoundingClientRect().top <= innerHeight * 0.4) cur = g.key;
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
      setDash((prev) => (el ? { y: Math.round(el.offsetTop), h: Math.round(el.offsetHeight), ready: !!prev } : null));
    };
    place();
    addEventListener("resize", place);
    return () => removeEventListener("resize", place);
  }, [active, hits]);

  useEffect(() => {
    const el = indexEls.current[active];
    const row = el?.parentElement;
    if (!row || row.scrollWidth <= row.clientWidth) return;
    const a = el.getBoundingClientRect(), r = row.getBoundingClientRect();
    row.scrollTo({ left: Math.round(row.scrollLeft + a.left - r.left - (r.width - a.width) / 2), behavior: reduced() ? "auto" : "smooth" });
  }, [active]);

  const jump = (e, key, c) => {
    e.preventDefault();
    if (!c) return;
    groupEls.current[key]?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
  };

  const onKey = (e) => {
    if (!e.target.classList?.contains("qi-btn")) return;
    const all = [...section.current.querySelectorAll(".qi-btn")];
    const i = all.indexOf(e.target);
    const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: all.length - 1 }[e.key];
    if (to == null || !all[to]) return;
    e.preventDefault();
    all[to].focus();
  };

  const count = (g) => g.items.filter((it) => hitSet.has(it.q)).length;
  const shown = GROUPS.filter((g) => count(g) > 0);

  return (
    <section id="faq" className="qx qx-index" ref={section}>
      <div className="qi-wrap">
        <header className="qi-head">
          <div className="qi-head-copy">
            <span className="hx-kicker">FAQ</span>
            <h2 className="hx-title qi-title"><span>Straight answers,</span><span className="silver">before you start.</span></h2>
            <p className="hx-sub qi-lede">What's free, your data, the journal and the crews. If yours isn't here, ask Jules at <a href={`mailto:${OWNER.email}`}>{OWNER.email}</a>.</p>
          </div>
          <div className="qi-find">
            <label className="qi-search">
              <svg className="qi-glass" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5.25" /><path d="M11 11l3.5 3.5" /></svg>
              <span className="sr-only">Search the answers</span>
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the answers" autoComplete="off" spellCheck="false" aria-describedby="qi-status" />
              {query && <button type="button" className="qi-clear" onClick={() => setQuery("")} aria-label="Clear the search"><i /><i /></button>}
            </label>
            <p className="qi-status" id="qi-status" aria-live="polite">
              {words.length ? `${hits.length} of ${all.length} answers` : `${GROUPS.length} groups · ${all.length} answers`}
            </p>
          </div>
        </header>

        <div className="qi-body" onKeyDown={onKey}>
          <nav className="qi-index" aria-label="FAQ groups">
            <ol>
              {GROUPS.map((g, i) => {
                const c = count(g);
                return (
                  <li key={g.key} ref={(el) => (indexEls.current[g.key] = el)}>
                    <a href={`#qi-g-${g.key}`} className={`${active === g.key && c ? "on" : ""} ${c ? "" : "none"}`} aria-current={active === g.key && c ? "true" : undefined} onClick={(e) => jump(e, g.key, c)} aria-disabled={c ? undefined : "true"} tabIndex={c ? undefined : -1}>
                      <span className="qi-in" data-v={String(i + 1)} aria-hidden="true" />
                      <span className="qi-il">{g.label}</span>
                      <span className="qi-ic" data-v={String(c).padStart(2, "0")} aria-hidden="true" />
                    </a>
                  </li>
                );
              })}
            </ol>
            {dash && <span className={`qi-dash ${dash.ready ? "ready" : ""}`} style={{ top: dash.y, height: dash.h }} aria-hidden="true" />}
          </nav>

          <div className="qi-list">
            {shown.map((g) => (
              <div key={g.key} className="qi-group" id={`qi-g-${g.key}`} ref={(el) => (groupEls.current[g.key] = el)}>
                <h3 className="qi-gl"><span>{g.label}</span><span className="qi-gc" data-v={String(count(g)).padStart(2, "0")} aria-hidden="true" /></h3>
                {g.items.filter((it) => hitSet.has(it.q)).map((it) => (
                  <Row key={it.q} item={it} n={num.get(it.q)} open={open.has(it.q)} onToggle={() => toggle(it.q)} words={words} />
                ))}
              </div>
            ))}
            {!shown.length && (
              <div className="qi-empty">
                <p className="qi-empty-t">Nothing on that yet.</p>
                <a className="qi-link" href={`mailto:${OWNER.email}`}><Roll>Ask Jules by email.</Roll><span className="sr-only">Ask Jules by email, at {OWNER.email}.</span><span className="qi-arrow" aria-hidden="true">→</span></a>
              </div>
            )}
          </div>
        </div>

        <div className="qi-end ink-section">
          <EndWave />
          <h3 className="qi-end-title"><span>Log your</span><span className="silver">next trade.</span></h3>
          <p className="hx-sub qi-end-sub">It's free forever, every feature is in it, and there's no card to enter.</p>
          <div className="hx-actions qi-end-actions">
            <StartFree />
            <Ghost href={sectionUrl("everything")}>See every feature</Ghost>
          </div>
        </div>
      </div>

      <Footer />
    </section>
  );
}
