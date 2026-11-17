import { Icon } from "../components/ui";
import { CAL, NOW, monthName, viewingNow } from "../data";
import { LIVE } from "../mode";
import { showAll, showMonth, useStore } from "../store";
import "./live.css";

export default function MonthNav() {
  useStore((s) => s.month);
  if (!LIVE) return null;
  // Every month at once: the label, and the way back to the month it left
  if (CAL.all) {
    return (
      <div className="month-nav all" role="group" aria-label="Period">
        <span className="num">All time</span>
        <button type="button" className="link xs" onClick={() => showMonth(CAL.year, CAL.month)}>By month</button>
      </div>
    );
  }
  const now = viewingNow();
  return (
    <div className="month-nav" role="group" aria-label="Month">
      <button type="button" className="icon-btn sm" onClick={() => showMonth(CAL.year, CAL.month - 1)} aria-label="Previous month"><Icon name="chevL" size={14} /></button>
      <span className="num">{monthName()} {CAL.year}</span>
      <button type="button" className="icon-btn sm" onClick={() => showMonth(CAL.year, CAL.month + 1)} disabled={now} aria-label="Next month"><Icon name="chevR" size={14} /></button>
      {!now && <button type="button" className="link xs" onClick={() => showMonth(NOW.year, NOW.month)}>This month</button>}
      <button type="button" className="link xs" onClick={showAll}>All time</button>
    </div>
  );
}
