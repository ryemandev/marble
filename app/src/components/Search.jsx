import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Modal, reducedMotion } from "./overlay";
import { Avatar, Icon } from "./ui";
import { useSearch } from "./useSearch";
import { art, fmtMoney, plural, todayOf } from "../data";
import { getState, openDialog, setState, showMonth, useAllTrades, useFolded, useStore } from "../store";
import { LIVE } from "../mode";
import { nyOf } from "../live/time";
import { ribbonOf } from "../views/study/model";
import { ago } from "../views/community/parts";
import "./search.css";
import { DOW, MON } from "../lib/basics.js";

const MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
const KEY = MAC ? "⌘K" : "Ctrl K";
const SHOWN = 3; // results of each kind before "Show all"
const touch = () => matchMedia("(pointer: coarse)").matches;

const Marked = ({ parts }) => parts.map((p, i) => (p.hit ? <mark key={i} className="sx-m">{p.text}</mark> : <span key={i}>{p.text}</span>));
const tradeDay = (t) => { const [y, m, d] = String(t.dayKey || "").split("-").map(Number); return y ? `${DOW[new Date(y, m - 1, d).getDay()]} ${d} ${MON[m - 1]}` : t.date || ""; };
const iso = (ms) => (ms ? new Date(ms).toISOString() : null);

export default function Search({ onGo }) {
  const [open, setOpen] = useState(false);
  const btn = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      const k = e.key.toLowerCase();
      const combo = k === "k" && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey;
      const slash = e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey;
      if (!combo && !slash) return;
      if (slash && e.target.closest?.("input, textarea, select, [contenteditable]")) return;
      if (getState().dialog || document.querySelector("[aria-modal='true']")) return;
      e.preventDefault();
      window.dispatchEvent(new Event("marble:close-menus"));
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      <button ref={btn} type="button" className="sx-trig" onClick={() => { window.dispatchEvent(new Event("marble:close-menus")); setOpen(true); }}
        aria-label="Search" aria-keyshortcuts="/ Control+K Meta+K" aria-haspopup="dialog" aria-expanded={open} title={`Search (${KEY})`}>
        <Icon name="search" size={15} />
        <span className="sx-trig-word">Search</span>
        <kbd className="sx-k sx-trig-key">{KEY}</kbd>
      </button>
      {open && <Palette onClose={() => setOpen(false)} onGo={onGo} />}
    </>
  );
}

function Palette({ onClose, onGo }) {
  const [q, setQ] = useState("");
  const [shut, setShut] = useState(false);
  const [all, setAll] = useState(() => new Set()); // the kinds opened past three
  const [active, setActive] = useState(0);
  const box = useRef(null);
  const input = useRef(null);
  const list = useRef(null);
  const found = useSearch(q, true);
  const [narrow] = useState(() => matchMedia("(max-width: 640px)").matches);
  const jump = useJumps();

  const close = () => { if (reducedMotion()) return onClose(); setShut(true); setTimeout(onClose, 140); };
  const go = (fn) => { onClose(); fn(); };

  useLayoutEffect(() => {
    const vv = window.visualViewport;
    const el = box.current;
    if (!vv || !el) return;
    const fit = () => el.style.setProperty("--vvh", `${vv.height}px`);
    fit();
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    return () => { vv.removeEventListener("resize", fit); vv.removeEventListener("scroll", fit); };
  }, []);

  const options = useMemo(() => {
    const out = [];
    if (!found.ready) {
      jump.forEach((j, i) => out.push({ key: `j${i}`, group: j.group, act: () => go(() => { j.act(); if (j.view) onGo(j.view); }), row: j }));
      return out;
    }
    for (const g of found.groups) {
      if (!g.items.length) continue;
      const open = all.has(g.kind);
      for (const item of open ? g.items : g.items.slice(0, SHOWN)) out.push({ key: `${g.kind}:${item.id}`, group: g.kind, item, act: () => go(() => openResult(item, onGo)) });
      if (!open && g.items.length > SHOWN) out.push({ key: `${g.kind}:more`, group: g.kind, more: g, act: () => setAll((s) => new Set(s).add(g.kind)) });
    }
    return out;
  }, [found, jump, all]);
  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => { if (active >= options.length) setActive(Math.max(0, options.length - 1)); }, [options.length]);
  useEffect(() => { list.current?.querySelector(`[data-opt="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active]);

  const onKey = (e) => {
    const n = options.length;
    if (e.key === "Escape" && q) { e.preventDefault(); e.stopPropagation(); setQ(""); return; }
    if (!n) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a + (e.key === "ArrowDown" ? 1 : -1) + n) % n);
    } else if (e.key === "Tab") {
      // The next (or previous) kind's first row
      e.preventDefault();
      const groups = [...new Set(options.map((o) => o.group))];
      const at = groups.indexOf(options[active]?.group);
      const next = groups[(at + (e.shiftKey ? -1 : 1) + groups.length) % groups.length];
      setActive(options.findIndex((o) => o.group === next));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (touch()) input.current?.blur();
      else options[active]?.act();
    }
  };

  // The count, said politely once typing pauses
  const [said, setSaid] = useState("");
  useEffect(() => {
    if (!found.ready) { setSaid(""); return; }
    const t = setTimeout(() => setSaid(found.count ? plural(found.count, "result") : `No results for ${q.trim()}`), 400);
    return () => clearTimeout(t);
  }, [found.ready, found.count, q]);

  let i = -1;
  const row = (o, body) => {
    i++;
    const n = i;
    return (
      <div key={o.key} id={`sx-opt-${n}`} data-opt={n} role="option" aria-selected={n === active} className={`sx-row ${n === active ? "on" : ""}`}
        onPointerMove={() => setActive(n)} onClick={() => o.act()}>{body}</div>
    );
  };

  return (
    <Modal label="Search" onClose={close} className={`sx-scrim ${shut ? "out" : ""}`}>
      <div className={`sx-box ${shut ? "out" : ""}`} ref={box}>
        <div className="sx-in">
          <Icon name="search" size={18} />
          <input ref={input} className="sx-field" type="search" value={q} onChange={(e) => setQ(e.target.value.slice(0, 100))} onKeyDown={onKey}
            placeholder={narrow ? "Search everything" : "Search trades, Study, Community and messages"} aria-label="Search trades, Study, Community and messages"
            role="combobox" aria-expanded={options.length > 0} aria-controls="sx-list" aria-autocomplete="list"
            aria-activedescendant={options.length ? `sx-opt-${active}` : undefined}
            enterKeyHint="search" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} data-autofocus />
          {q && <button type="button" className="sx-clear" aria-label="Clear the search" onClick={() => { setQ(""); input.current?.focus(); }}><Icon name="close" size={13} /></button>}
          <kbd className="sx-k sx-esc">Esc</kbd>
          <button type="button" className="sx-cancel" onClick={close}>Cancel</button>
        </div>
        <div className="sx-list" id="sx-list" role="listbox" aria-label="Results" ref={list}
          onScroll={() => { if (touch() && document.activeElement === input.current) input.current.blur(); }}>
          {!found.ready && <Before jump={jump} options={options} row={row} />}
          {found.ready && found.groups.map((g) => {
            const shown = options.filter((o) => o.group === g.kind);
            if (!shown.length) return null;
            return (
              <div key={g.kind} className="sx-grp" role="group" aria-label={g.label}>
                <header>{g.label} <b>{g.items.length}</b>
                  {g.kind === "dm" && <span className="sx-hnote"><Icon name="lock" size={12} /><span className="sx-long">Encrypted: only conversations opened on this device are searched</span><span className="sx-short">Encrypted · on this device only</span></span>}
                </header>
                {shown.map((o) => row(o, o.more ? <More g={o.more} /> : <Result item={o.item} />))}
              </div>
            );
          })}
          {found.ready && !found.count && !found.postsBusy && <Nothing q={q} searched={found.searched} />}
        </div>
        <div className="sx-foot" aria-hidden="true">
          <span><kbd className="sx-k">↑</kbd><kbd className="sx-k">↓</kbd> move</span>
          <span><kbd className="sx-k">↵</kbd> open</span>
          <span><kbd className="sx-k">Tab</kbd> next kind</span>
          <span><kbd className="sx-k">Esc</kbd> close</span>
        </div>
        <p className="sr-only" aria-live="polite">{said}</p>
      </div>
    </Modal>
  );
}

function openResult(r, onGo) {
  if (r.kind === "trade") {
    if (LIVE && r.trade.traded_at) { const d = nyOf(r.trade.traded_at); showMonth(d.year, d.month); }
    setState({ journalSel: r.id });
    onGo("journal");
  } else if (r.kind === "page") {
    setState({ studyOpen: { id: r.notebookId, page: r.page } });
    onGo("study");
  } else if (r.kind === "post") {
    setState({ communityTab: "feed", communityPost: r.postId });
    onGo("community");
  } else if (r.kind === "dm") {
    setState({ communityRoom: `dm:${r.threadId}` });
    onGo("community");
  }
}

function Result({ item: r }) {
  if (r.kind === "trade") {
    const t = r.trade;
    return (
      <>
        <span className="sx-g sx-sym num" aria-hidden="true">{String(t.symbol || "").slice(0, 4)}</span>
        <span className="sx-txt">
          <span className="sx-t"><Marked parts={r.symbolParts} /> {t.side}{t.setup ? <> · <Marked parts={r.setupParts} /></> : null}</span>
          <span className="sx-s">{r.inNote ? <>{tradeDay(t)} · “<Marked parts={r.parts} />”</> : <>{tradeDay(t)} · {t.time}{r.copies ? ` · ${r.copies} accounts` : ""}</>}</span>
        </span>
        <span className="sx-r"><span className={`sx-pnl num ${t.pnl < 0 ? "neg" : ""}`}>{fmtMoney(t.pnl, { sign: true })}</span>{r.copies > 0 && <span className="sx-x num">×{r.copies}</span>}</span>
      </>
    );
  }
  if (r.kind === "page") {
    return (
      <>
        <span className="sx-g sx-cover" aria-hidden="true" style={r.cover ? { backgroundImage: `url(${art(r.cover, 160)})` } : undefined} />
        <span className="sx-txt">
          <span className="sx-t">{r.isTitle ? <Marked parts={r.parts} /> : <>“<Marked parts={r.parts} />”</>}</span>
          <span className="sx-s">{r.notebook} · page {r.page}</span>
        </span>
      </>
    );
  }
  const who = r.kind === "post" ? r.who || "Anonymous" : r.who || "A trader";
  return (
    <>
      <span className="sx-g"><Avatar name={who} src={r.avatar || undefined} size={32} /></span>
      <span className="sx-txt">
        <span className="sx-t"><b>{who}</b>{r.kind === "post" ? <span className="sx-dim"> · {r.reply ? "Reply" : "Feed"}</span> : null}</span>
        <span className="sx-s">{r.kind === "dm" && r.mine ? "You: " : ""}<Marked parts={r.parts} /></span>
      </span>
      {r.at > 0 && <span className="sx-r">{ago(iso(r.at))}</span>}
    </>
  );
}

const More = ({ g }) => (
  <span className="sx-more-row">Show all {g.items.length} {g.label === "Study" ? "in Study" : g.label.toLowerCase()} <Icon name="chevR" size={13} /></span>
);

function Nothing({ q, searched }) {
  const parts = [plural(searched.trades, "trade"), plural(searched.pages, "Study page"), "Community"];
  if (searched.conversations) parts.push(`${plural(searched.conversations, "conversation")} on this device`);
  return (
    <div className="sx-none">
      <p>Nothing for “{q.trim()}”.</p>
      <p>Searched {parts.slice(0, -1).join(", ")} and {parts.at(-1)}.</p>
    </div>
  );
}

function useJumps() {
  const trades = useFolded(useAllTrades());
  const notebooks = useStore((s) => s.notebooks);
  const pages = useStore((s) => s.pages);
  const unread = useStore((s) => s.dmUnread || 0);
  useStore((s) => s.tick);
  return useMemo(() => {
    const out = [];
    const day = todayOf(trades);
    if (day.trades) {
      out.push({ group: "jump", icon: "calendar", title: "Today's trades", where: "Journal",
        sub: `${plural(day.trades, "trade")} · ${fmtMoney(day.pnl, { sign: true })}${day.judged ? ` · ${day.kept} of ${day.judged} by the plan` : ""}`,
        act: () => { if (LIVE) { const n = nyOf(); showMonth(n.year, n.month); } setState({ journalSel: day.list[0]?.id || null }); }, view: "journal" });
    }
    const ribbon = ribbonOf(notebooks || [], pages || []);
    if (ribbon && !ribbon.fresh) {
      out.push({ group: "jump", cover: ribbon.notebook.cover, title: ribbon.page?.title || ribbon.notebook.title || "Your notebook", where: "Study",
        sub: `${ribbon.notebook.title || "Notebook"} · page ${ribbon.n}, where you left off`,
        act: () => setState({ studyOpen: { id: ribbon.notebook.id, page: ribbon.n } }), view: "study" });
    }
    if (unread > 0) {
      out.push({ group: "jump", icon: "mail", title: "Messages", where: "Community", sub: plural(unread, "unread message"),
        act: () => setState({ communityRoom: "dm-list" }), view: "community" });
    }
    out.push({ group: "do", icon: "plus", title: "Log a trade", sub: "Symbol, side and dollars", key: "L", act: () => openDialog("trade") });
    if (LIVE) out.push({ group: "do", icon: "upload", title: "Import trades", sub: "The file your platform exports", act: () => openDialog("import") });
    return out;
  }, [trades, notebooks, pages, unread]);
}

function Before({ jump, options, row }) {
  const groups = [["jump", "Jump to"], ["do", "Do"]];
  return groups.map(([k, label]) => {
    const rows = options.filter((o) => o.group === k);
    if (!rows.length) return null;
    return (
      <div key={k} className="sx-grp" role="group" aria-label={label}>
        <header>{label}</header>
        {rows.map((o) => row(o, (
          <>
            {o.row.cover ? <span className="sx-g sx-cover" aria-hidden="true" style={{ backgroundImage: `url(${art(o.row.cover, 160)})` }} />
              : <span className="sx-g sx-ic" aria-hidden="true"><Icon name={o.row.icon} size={15} /></span>}
            <span className="sx-txt"><span className="sx-t">{o.row.title}</span><span className="sx-s">{o.row.sub}</span></span>
            <span className="sx-r">{o.row.key ? <kbd className="sx-k">{o.row.key}</kbd> : o.row.where}</span>
          </>
        )))}
      </div>
    );
  });
}
