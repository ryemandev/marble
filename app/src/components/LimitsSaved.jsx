import { useMemo } from "react";
import { Card } from "./ui";
import { fmtMoney, plural } from "../data";
import { openDialog, useAllTrades, useFolded, useStore } from "../store";
import { HIT_NAMES, hasRules, limitsSaved, limitsSavedLine } from "../../supabase/functions/_shared/limits.js";
import "./limits.css";
import { DOW, MON as SHORT } from "../lib/basics.js";

const DAYS = 90;
const money = (n) => fmtMoney(n);
const real = (t) => !(t?.example === true || String(t?.id || "").startsWith("ex-"));
const dayLabel = (key) => { const [y, m, d] = key.split("-").map(Number); return `${DOW[new Date(y, m - 1, d).getDay()]} ${d} ${SHORT[m - 1]}`; };
const hitWords = (hit) => hit.map((h) => HIT_NAMES[h]).join(" and ").replace(/^./, (c) => c.toUpperCase());

function useLimitsSaved(rules) {
  const trades = useFolded(useAllTrades());
  const tick = useStore((s) => s.tick); // the 90 days move on at midnight
  return useMemo(() => {
    const mine = trades.filter(real);
    return { ...limitsSaved(mine, rules, { days: DAYS }), journal: mine.length };
  }, [trades, rules, tick]);
}

function Line({ r }) {
  const line = limitsSavedLine(r, money);
  const amount = r.status === "saved" ? money(r.kept) : r.status === "cost" ? money(r.afterPnl) : null;
  const at = amount ? line.indexOf(amount) : -1;
  if (at < 0) return <p className="saved-line">{line}</p>;
  return <p className="saved-line">{line.slice(0, at)}<b className="saved-amount num">{amount}</b>{line.slice(at + amount.length)}</p>;
}

export function LimitsCard() {
  const rules = useStore((s) => s.rules);
  const example = useStore((s) => s.example?.on);
  const r = useLimitsSaved(rules);
  if (example || (r.status === "no-rules" && !r.journal)) return null;
  const after = r.status === "saved" || r.status === "cost" || r.status === "even";
  return (
    <div className="grid g12">
      <Card className="c12 saved-card" aria-labelledby="saved-title">
        <h3 id="saved-title">What your limits would have saved <span className="caps">Last {DAYS} days · all accounts</span></h3>
        <div className={`saved ${r.byDay.length ? "" : "bare"}`}>
          <div className="saved-copy">
            <Line r={r} />
            <p className="saved-note">
              {after ? `From ${plural(r.tradesAfter, "trade")} taken after a daily limit was reached. ` : ""}
              {r.status === "no-rules" ? "Your loss limit, most trades a day and losses in a row: Marble checks each day of your history against them." : "Every trade counts, reviewed or not."}
            </p>
            <div className="saved-actions">
              {r.status === "no-trades"
                ? <button type="button" className="btn ghost" onClick={() => openDialog("import")}>Import trades</button>
                : <button type="button" className="btn ghost" onClick={() => openDialog("rules")}>{r.status === "no-rules" ? "Set daily limits" : "Edit daily limits"}</button>}
            </div>
          </div>
          {r.byDay.length > 0 && (
            <table className="table saved-days">
              <thead><tr><th>Day</th><th>Reached</th><th style={{ textAlign: "right" }}>After</th></tr></thead>
              <tbody>
                {r.byDay.slice(0, 4).map((d) => (
                  <tr key={d.day}>
                    <td className="num muted saved-day">{dayLabel(d.day)}</td>
                    <td>{hitWords(d.hit)}<span className="saved-n">{plural(d.trades, "trade")} after it</span></td>
                    <td className={`num ${d.pnl > 0 ? "win" : d.pnl < 0 ? "loss" : ""}`} style={{ textAlign: "right", whiteSpace: "nowrap" }}>{fmtMoney(d.pnl, { sign: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}
export function LimitsPreview({ rules }) {
  const r = useLimitsSaved(rules);
  if (!hasRules(rules) || r.status === "no-trades" || r.status === "no-rules") return null;
  return (
    <div className="saved-preview field span-4" role="status" aria-live="polite">
      <span className="field-label">On your last {DAYS} days</span>
      <p>{limitsSavedLine(r, money)}</p>
    </div>
  );
}
