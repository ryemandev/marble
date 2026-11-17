import { useStore } from "../store";
import { openDialog } from "../store";
import { Sheet } from "../components/forms";
import { Icon, Skeleton } from "../components/ui";
import { Meter } from "../components/charts";
import { FirmLogo } from "./FirmPicker";
import { useTracked } from "./useFirmRules";
import { dayWords, firmShort, pageLinks, phaseLabel, sizeLabel } from "../lib/firm-rules/catalog";
import { money } from "../lib/firm-rules/track";
import "./firm-tracker.css";

const CARD = ["dll", "dd", "target", "cons", "days", "pay"];
const short = { dll: "Daily loss", target: "Target", cons: "Consistency", days: "Days", pay: "Payout days" };

function figure(l, cur) {
  if (l.id === "dd") return { now: money(l.left, cur), of: l.approx ? "left, about" : l.estimate ? "left, at most" : "left" };
  if (l.id === "cons") return { now: l.best > 0 && Number.isFinite(l.value) ? `${Math.round(l.value * 100)}%` : "–", of: `of ${Math.round(l.limit * 100)}%` };
  if (l.id === "days" || l.id === "pay") return { now: String(l.value), of: `of ${l.limit}` };
  if (l.id === "target") return { now: money(l.value, cur), of: `of ${money(l.limit, cur)}` };
  return { now: money(l.value, cur), of: `of ${money(l.limit, cur)}` };
}

export default function FirmTracker({ account }) {
  const trades = useStore((s) => s.logged);
  const tick = useStore((s) => s.tick);
  const money = useStore((s) => s.money);
  const { plan, phase, meta, result, loading } = useTracked(account, trades, tick, money);
  if (!account?.firmPlan) return null;
  if (loading || !result) return <div className="ft ft-wait"><Skeleton rows={2} kind="lines" label={`Loading ${meta?.name || "firm"} rules`} /></div>;
  const lines = CARD.map((id) => result.lines.find((l) => l.id === id)).filter((l) => l && !l.info && !l.unclear);
  const title = `${sizeLabel(plan.size)} · ${phaseLabel(plan, account.firmPhase || undefined)}`;
  const open = () => openDialog("firmRules", { account });
  const alert = result.alert && (
    <p className={`ft-alert xs ${result.alert.level}`} role="status"><Icon name="alert" size={13} /><span>{result.alert.level === "reached" ? result.alert.text : `${result.alert.label}: ${result.alert.text}`}</span></p>
  );
  const foot = <button type="button" className="ft-foot xs" onClick={open}><span className="faint">Rules checked {dayWords(meta.checked).replace(/ \d{4}$/, "")}</span><span className="link">All rules</span></button>;
  const head = (
    <div className="ft-head">
      <FirmLogo slug={account.firm} size={16} />
      <span className="ft-plan xs">{title}</span>
    </div>
  );

  return (
    <section className={`ft ft-ledger ${result.level}`} aria-label={`${meta.name} rules`}>
      {head}
      {alert}
      {lines.map((l) => {
        const f = figure(l, result.cur);
        return (
          <div key={l.id} className={`ft-row ${l.level || ""} ${l.met ? "met" : ""}`}>
            <div className="row xs"><span className="muted">{l.id === "dd" ? "Drawdown" : short[l.id]}</span><span className="num">{f.now} <span className="faint">{f.of}</span></span></div>
            <Meter value={l.value} max={l.limit} label={l.label} />
          </div>
        );
      })}
      {foot}
    </section>
  );
}

export function FirmRulesSheet({ account, onClose }) {
  const trades = useStore((s) => s.logged);
  const tick = useStore((s) => s.tick);
  const money = useStore((s) => s.money);
  const live = useStore((s) => s.accounts.find((a) => a.id === account?.id)) || account;
  const { plan, meta, result } = useTracked(live, trades, tick, money);
  if (!plan || !result) return null;
  const wrong = () => {
    onClose();
    openDialog("bug", { view: "firm rules", rule: { firm: meta.name, plan: plan.id, phase: live.firmPhase || null, checked: meta.checked } });
  };
  return (
    <Sheet title={`${meta.name} ${sizeLabel(plan.size)}: the rules`} sub={`${plan.n}, ${phaseLabel(plan, live.firmPhase || undefined).toLowerCase()}. ${result.basis}`}
      onClose={onClose} onSubmit={onClose} submitLabel="Done" cancel={false}
      extra={<button type="button" className="link" onClick={wrong}>This looks wrong</button>}>
      <ul className="ft-all span-4">
        {result.lines.map((l, i) => (
          <li key={`${l.id}-${i}`} className={`ft-all-row ${l.level || ""} ${l.unclear ? "unclear" : ""}`}>
            <div className="ft-all-head"><span className="ft-all-label">{l.label}</span>{l.src && <a className="link" href={l.src} target="_blank" rel="noopener noreferrer">{firmShort(live.firm)}'s page</a>}</div>
            <p className="ft-all-text">{l.text}</p>
            {l.note && <p className="ft-all-note xs muted">{l.note}</p>}
            {l.srcs?.length > 0 && (
              <p className="ft-all-pages xs">
                <span className="faint">The pages: </span>
                {pageLinks(l.srcs).map((p, j) => <span key={p.url}>{j > 0 && <span className="faint"> · </span>}<a className="link" href={p.url} target="_blank" rel="noopener noreferrer">{p.label}</a></span>)}
              </p>
            )}
          </li>
        ))}
      </ul>
      <p className="ft-all-check xs faint span-4">Rules checked {dayWords(meta.checked)} from {firmShort(live.firm)}'s own pages. Firms change rules often, and {firmShort(live.firm)}'s dashboard always has the final word.</p>
    </Sheet>
  );
}
