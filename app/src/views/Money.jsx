import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/ui";
import { SubTabs } from "../components/forms";
import { getState, openDialog, setState, toast, useOwnStore } from "../store";
import { LIVE } from "../mode";
import { Receipt } from "./money/Receipt";
import { accountName, firmKey, firmsOf, pick, span } from "./money/model";
import { byIdOf, moneyToday, startCurrency, useMoneyAccounts } from "./money/hooks";
import "./money/money.css";
import { useMedia } from "../lib/useMedia.js";

const PERIODS = [["month", "This month"], ["year", "This year"], ["all", "All time"]];
const SINCE = { month: "this month", year: "since January", all: "since you started" };

function Seg({ label, items, value, onChange }) {
  const ref = useRef(null);
  const [edges, setEdges] = useState("");
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const look = () => {
      const more = el.scrollWidth - el.clientWidth > 1;
      setEdges(!more ? "" : [el.scrollLeft > 1 && "left", el.scrollLeft < el.scrollWidth - el.clientWidth - 1 && "right"].filter(Boolean).join(" "));
    };
    look();
    el.addEventListener("scroll", look, { passive: true });
    const ro = new ResizeObserver(look);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => { el.removeEventListener("scroll", look); ro.disconnect(); };
  }, [items.length]);
  return <div className="money-seg" ref={ref} data-more={edges || undefined}><SubTabs label={label} items={items} value={value} onChange={onChange} /></div>;
}

async function shareReceipt(node, name) {
  const lib = await import("html-to-image");
  await document.fonts?.ready;
  let fontEmbedCSS;
  try { fontEmbedCSS = await lib.getFontEmbedCSS(node); } catch { fontEmbedCSS = undefined; }
  const blob = await lib.toBlob(node, { pixelRatio: 3, fontEmbedCSS });
  const save = () => {
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), { href: url, download: name }).click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return "saved";
  };
  const file = new File([blob], name, { type: "image/png" });
  if (!navigator.canShare?.({ files: [file] })) return save();
  try { await navigator.share({ files: [file] }); return "shared"; }
  catch (e) { return e?.name === "AbortError" ? "cancelled" : save(); }
}

export default function Money() {
  const all = useOwnStore((s) => s.money);
  const me = useOwnStore((s) => s.me);
  const view = useOwnStore((s) => s.moneyView) || { period: "year", show: "all" };
  const accounts = useMoneyAccounts();
  const byId = useMemo(() => byIdOf(accounts), [accounts]);
  const compact = useMedia("(max-width: 640px)");
  const today = moneyToday();
  const failed = LIVE && !Array.isArray(all);
  const list = useMemo(() => (Array.isArray(all) ? all : []), [all]);

  const firms = useMemo(() => firmsOf(list), [list]);
  const acctId = view.show.startsWith("acct:") ? view.show.slice(5) : null;
  const acct = acctId ? byId[acctId] || list.find((e) => e.account === acctId)?.acct || null : null;
  const show = (view.show.startsWith("firm:") && firms.some((f) => `firm:${f.key}` === view.show)) || acct ? view.show : "all";
  const items = [["all", "All firms"], ...firms.map((f) => [`firm:${f.key}`, f.name]), ...(acct ? [[show, accountName(acct) || acct.name]] : [])];
  const setView = (patch) => setState((s) => ({ moneyView: { ...(s.moneyView || view), ...patch } }));

  const entries = useMemo(() => pick(list, { period: view.period, show, today }), [list, view.period, show, today]);
  const range = span(pick(list, { period: "all", show, today }), view.period, today);
  const who = show === "all" ? "" : ` for ${items.find(([k]) => k === show)?.[1] || ""}`;
  const emptyLine = !list.length ? "Add a fee or a payout to start" : `Nothing${who} ${SINCE[view.period]}`;

  const known = useRef(null);
  const timer = useRef(0);
  const [fresh, setFresh] = useState(() => new Set());
  const [open, setOpen] = useState(() => new Set());
  useEffect(() => {
    const ids = list.map((e) => e.id);
    if (!known.current) { known.current = new Set(ids); return; }
    const added = list.filter((e) => !known.current.has(e.id));
    ids.forEach((id) => known.current.add(id));
    if (!added.length) return;
    setFresh(new Set(added.map((e) => e.id)));
    setOpen((o) => new Set([...o, ...added.map((e) => (e.account ? `acct:${e.account}` : `firm:${firmKey(e.firm)}`))]));
    const mv = getState().moneyView || view;
    if (!pick(added, { period: mv.period, show: mv.show, today }).length) setView({ show: "all", period: added.every((e) => e.day.slice(0, 4) === today.slice(0, 4)) ? "year" : "all" });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setFresh(new Set()), 1000);
  }, [list]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearTimeout(timer.current), []);
  const toggle = (key) => setOpen((o) => { const n = new Set(o); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  const add = (mode) => openDialog("money", { mode, account: acctId && byId[acctId] && !byId[acctId].archived ? acctId : undefined });
  const edit = (entry) => openDialog("money", { entry });

  const paper = useRef(null);
  const [busy, setBusy] = useState(false);
  const share = async () => {
    if (!paper.current || busy) return;
    setBusy(true);
    try {
      const done = await shareReceipt(paper.current, `marble-receipt-${today}.png`);
      if (done === "saved") toast("Saved the receipt as a picture");
    } catch { toast("Couldn't make the picture. Try again.", { warn: true }); }
    setBusy(false);
  };
  const retry = async () => {
    const m = await import("../live/sync");
    const got = await m.reloadMoney().catch(() => null);
    if (!got) toast("Still couldn't load them. Try again in a minute.", { warn: true });
  };

  const lede = compact ? `Fees in, payouts out, ${SINCE[view.period]}.` : "Every fee you've paid a prop firm, and every payout, on one receipt.";
  return (
    <div className={`view money-view ${compact ? "compact" : ""}`}>
      <div className="money-grid">
        <div className="view-head money-head">
          <div><div className="eyebrow">Fees &amp; payouts</div><h1 className="two">What you paid.<span>What came back.</span></h1><p>{lede}</p></div>
          {compact && !failed && <button type="button" className="icon-btn" onClick={share} disabled={busy} aria-label="Share the receipt" title="Share the receipt"><Icon name="share" size={17} /></button>}
        </div>

        <div className="money-controls">
          <div className="money-label" id="money-for">Show it for</div>
          <Seg label="Show it for" items={items} value={show} onChange={(k) => setView({ show: k })} />
          <div className="money-label" id="money-dates">Dates</div>
          <Seg label="Dates" items={PERIODS} value={view.period} onChange={(k) => setView({ period: k })} />
        </div>

        <div className="money-add">
          <button type="button" className="btn silver" onClick={() => add("fee")} disabled={failed}><Icon name="plus" size={14} /> Add a fee</button>
          <button type="button" className="btn ghost" onClick={() => add("payout")} disabled={failed}><Icon name="plus" size={14} /> Got paid</button>
        </div>

        <div className="money-paper">
          {failed ? (
            <div className="money-failed" role="alert">
              <p>Your fees and payouts didn&apos;t load just now. Everything else in Marble is here.</p>
              <button type="button" className="btn ghost" onClick={retry}>Try again</button>
            </div>
          ) : (
            <div className="money-shadow">
              <Receipt ref={paper} entries={entries} byId={byId} range={range} emptyLine={emptyLine} compact={compact}
                fresh={fresh} open={open} onToggle={toggle} onEdit={edit} currency={startCurrency(list, me)} />
            </div>
          )}
        </div>

        <div className="money-aside">
          {!compact && !failed && <button type="button" className="btn ghost" onClick={share} disabled={busy}><Icon name="share" size={14} /> {busy ? "Making the picture…" : "Share the receipt"}</button>}
          <p>{compact
            ? "Tap an account to print its lines, and a line to change it. Payouts print in brackets, as money back."
            : "A new fee prints a new line the moment you add it. Payouts print in brackets, as money back. Click a line to change it."}</p>
          <p className="money-honest">Marble adds up the figures you type in. It doesn&apos;t check them with any firm.</p>
        </div>
      </div>
    </div>
  );
}
