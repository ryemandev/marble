import { forwardRef, useLayoutEffect, useRef, useState } from "react";
import { Wordmark } from "../../components/Logo";
import { KIND_LABEL, SYMBOL, dayLabel, isPayout, money, plain, sections, spanLabel, timesLabel, totals } from "./model";

const up = (s) => String(s || "").toUpperCase();

function useTeeth(ref) {
  const [n, setN] = useState(36);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => setN(Math.max(12, Math.round(el.offsetWidth / 9)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  const top = [], bottom = [];
  for (let i = 0; i <= n; i++) {
    const x = `${((i / n) * 100).toFixed(3)}%`;
    top.push(`${x} ${i % 2 ? "var(--tooth)" : "0"}`);
    bottom.push(`${x} ${i % 2 ? "calc(100% - var(--tooth))" : "100%"}`);
  }
  return `polygon(${[...top, ...bottom.reverse()].join(",")})`;
}

function Barcode({ seed }) {
  let s = 13 + seed * 7;
  const bars = [];
  for (let i = 0; i < 46; i++) {
    s = (s * 9301 + 49297) % 233280;
    bars.push(<i key={i} style={{ width: 1 + (s % 3), marginRight: 1 + ((s >> 3) % 3) }} />);
  }
  return <div className="rc-bars" aria-hidden="true">{bars}</div>;
}

function Line({ e, mixed, fresh, onEdit }) {
  const amt = `${mixed ? SYMBOL[e.currency] : ""}${plain(e.minor)}`;
  const line = (
    <button type="button" className="ln sub rc-line" onClick={() => onEdit(e)}
      aria-label={`${dayLabel(e.day)}, ${KIND_LABEL[e.kind]}, ${money(e.minor, e.currency)}${isPayout(e) ? " paid to you" : ""}${e.note ? `, ${e.note}` : ""}. Change it`}
      title={e.note || undefined}>
      <span>{up(dayLabel(e.day, { year: false, pad: true }))}&nbsp; {KIND_LABEL[e.kind]}</span>
      <span className="amt">{isPayout(e) ? `(${amt})` : <>{amt}&nbsp;</>}</span>
    </button>
  );
  return fresh ? <div className="rc-print"><div>{line}</div></div> : line;
}

const perCurrency = (by, mixed) => {
  const list = Object.entries(by);
  if (!list.length) return "0.00";
  return list.map(([c, v]) => `${mixed ? SYMBOL[c] : ""}${plain(v)}`).join(" · ");
};

export const Receipt = forwardRef(function Receipt({ entries, byId, range, emptyLine, compact, fresh, open, onToggle, onEdit, currency = "USD" }, outer) {
  const paper = useRef(null);
  const clip = useTeeth(paper);
  const groups = sections(entries, byId);
  const sums = totals(entries);
  const mixed = sums.length > 1;
  const main = sums[0] || { currency, fees: 0, paid: 0, net: 0, multiple: null, aheadSince: null };
  const count = entries.length;
  const setRefs = (el) => { paper.current = el; if (typeof outer === "function") outer(el); else if (outer) outer.current = el; };

  return (
    <div className="receipt" ref={setRefs} style={{ clipPath: clip }} role="group" aria-label="Your fees and payouts, as a receipt">
      <div className="rc-c rc-mark"><Wordmark fontSize={19} className="rc-wmk" /></div>
      <div className="rc-c rc-title">PROP FIRM ACCOUNT · RECEIPT</div>
      <div className="ln"><span>{up(spanLabel(range))}</span><span>NO. {String(count).padStart(4, "0")}</span></div>
      <div className="rc-rule" />

      {!count && (
        <div className="rc-empty">
          <div className="rc-c">NO ITEMS</div>
          <div className="rc-c rc-faint">{up(emptyLine)}</div>
        </div>
      )}

      {groups.map((g) => {
        const anyFresh = g.entries.some((e) => fresh.has(e.id));
        const isNew = g.entries.every((e) => fresh.has(e.id));
        const wrap = (el) => (isNew ? <div className="rc-print" key={g.key}><div>{el}</div></div> : el);
        const lineFresh = (e) => !isNew && fresh.has(e.id);
        if (compact) {
          const shown = open.has(g.key);
          const paid = Object.keys(g.paid).length > 0;
          return wrap(
            <div className="rc-sec compact" key={g.key}>
              <button type="button" className="ln rc-acct-btn" aria-expanded={shown} onClick={() => onToggle(g.key)}
                aria-label={`${g.name}: ${perCurrency(g.fees, true)} in fees${paid ? `, ${perCurrency(g.paid, true)} paid to you` : ""}. ${shown ? "Hide" : "Print"} its lines`}>
                <b>{g.name}</b><span className="amt">{perCurrency(g.fees, mixed)}&nbsp;</span>
              </button>
              {shown
                ? <div className="rc-lines">{g.entries.map((e) => <Line key={e.id} e={e} mixed={mixed} fresh={lineFresh(e)} onEdit={onEdit} />)}</div>
                : paid && <div className={`ln sub ${anyFresh && !isNew ? "rc-flash" : ""}`}><span>Paid to you</span><span className="amt">({perCurrency(g.paid, mixed)})</span></div>}
            </div>
          );
        }
        return wrap(
          <div className="rc-sec" key={g.key}>
            <div className="ln acct"><span>{up(g.name)}</span><span>{up(g.state)}</span></div>
            {g.entries.map((e) => <Line key={e.id} e={e} mixed={mixed} fresh={lineFresh(e)} onEdit={onEdit} />)}
          </div>
        );
      })}

      <div className="rc-rule" />
      {sums.length ? sums.map((t, i) => (
        <div className="ln" key={`f-${t.currency}`}><span>{i ? "" : "FEES PAID"}</span><span>{money(t.fees, t.currency)}</span></div>
      )) : <div className="ln"><span>FEES PAID</span><span>{money(0, currency)}</span></div>}
      {sums.length ? sums.map((t, i) => (
        <div className="ln" key={`p-${t.currency}`}><span>{i ? "" : "PAID TO YOU"}</span><span>{money(t.paid, t.currency)}</span></div>
      )) : <div className="ln"><span>PAID TO YOU</span><span>{money(0, currency)}</span></div>}
      <div className="rc-rule2" />
      <div className="ln rc-total-row"><b>TRUE RETURN</b><span className="rc-total">{money(main.net, main.currency, { sign: true })}</span></div>
      {sums.slice(1).map((t) => (
        <div className="ln rc-total-row more" key={`n-${t.currency}`}><span /><span className="rc-total sm">{money(t.net, t.currency, { sign: true })}</span></div>
      ))}
      {!mixed && main.paid > 0 && main.fees > 0 && <div className="ln sub flush"><span>{timesLabel(main.multiple)} WHAT YOU PAID IN</span></div>}
      {!mixed && main.aheadSince && <div className="ln sub flush"><span>AHEAD SINCE {up(dayLabel(main.aheadSince))}</span></div>}
      {!mixed && count > 0 && main.paid === 0 && <div className="ln sub flush"><span>NO PAYOUTS YET</span></div>}
      {mixed && <div className="ln sub flush"><span>EACH CURRENCY ADDED UP ON ITS OWN</span></div>}
      <div className="rc-rule" />
      <Barcode seed={count} />
      <div className="rc-c rc-faint rc-foot">{count} {count === 1 ? "ITEM" : "ITEMS"} · KEEP THIS RECEIPT</div>
      <div className="rc-c rc-faint">FIGURES AS YOU ENTERED THEM</div>
    </div>
  );
});
