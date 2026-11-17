import { useMemo } from "react";
import { compactMoney } from "../../components/charts";
import { CAL, NOW, fmtMoney, monthName, todayInView } from "../../data";
import { MON, MONTHS, pad } from "../../lib/basics.js";
import { useStore } from "../../store";
import { dayKeyOf } from "./dayPhotos";

const WEEK = ["M", "T", "W", "T", "F", "S", "S"];
const short = (v) => compactMoney(v, true);
// The money in a day's foot: whole dollars while they fit the box, short above that
const footMoney = (v, whole) => (!v ? "$0" : Math.abs(v) < whole ? fmtMoney(v, { sign: true, decimals: 0 }).replace("-", "−") : short(v));

// One day, or one month. Every traded day carries the same foot of ink whatever it made or lost, so a big day is
// no taller than a small one. A day closed with no trades carries the same foot and says so.
function Well({ top, value, traded, word, whole = 0, on, today, later, label, onPick, i, photo }) {
  const tone = !traded ? "" : value > 0 ? "up" : value < 0 ? "down" : "flat";
  return (
    <button type="button" className={`jn-well ${tone} ${later ? "later" : ""} ${today ? "today" : ""} ${photo ? "shot" : ""}`} style={{ "--i": i }}
      disabled={!onPick} aria-pressed={on} aria-label={photo ? `${label}, with a photo` : label} onClick={onPick}>
      {photo && <span className="jn-well-pic"><img src={photo} alt="" loading="lazy" /></span>}
      <b className={photo ? "jn-well-date" : "jn-well-day"}>{top}</b>
      {traded ? <span className="jn-well-ink num">{footMoney(value, whole)}</span>
        : word === "none" ? <span className="jn-well-ink none">No trades</span>
          : word === "open" ? <span className="jn-well-word">Left open</span> : null}
    </button>
  );
}

const NO_CLOSES = {};
// The month as ink: a box for each day. A traded day's money sits in a foot of ink, white for a day up and grey for
// a day down, the same height either way. A weekday that was closed with no trades says so in the same ink. A
// weekday with neither, once the trader has started closing days, says it was left open.
export default function Wells({ trades, selected, onPick, photos = {} }) {
  const year = CAL.year, month = CAL.month;
  const today = todayInView();
  const closes = useStore((s) => (s.world === "crypto" ? NO_CLOSES : s.closes || NO_CLOSES));
  const firstClose = useMemo(() => Object.keys(closes).sort()[0] || null, [closes]);
  const { by, weekend } = useMemo(() => {
    const map = new Map();
    let sat = false;
    for (const t of trades) {
      const d = map.get(t.day) || { id: t.dayKey ?? t.day, net: 0, n: 0 };
      d.net += t.pnl;
      d.n += 1;
      map.set(t.day, d);
      if (new Date(year, month, t.day).getDay() % 6 === 0) sat = true;
    }
    return { by: map, weekend: sat };
  }, [trades, year, month]);
  const cols = weekend ? 7 : 5;
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let d = 1; d <= days; d++) {
    const dow = (new Date(year, month, d).getDay() + 6) % 7;
    if (dow < cols) cells.push({ d, dow });
  }
  const lead = cells[0]?.dow ?? 0;
  return (
    <div className={`jn-wells ${cols > 5 ? "all-week" : ""}`} style={{ "--cols": cols }} role="group" aria-label={`${monthName()}, day by day`}>
      {WEEK.slice(0, cols).map((l, i) => <span key={i} className="jn-wells-head" aria-hidden="true">{l}</span>)}
      {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
      {cells.map(({ d, dow }, i) => {
        const day = by.get(d);
        const sweep = dow + Math.floor((lead + i) / cols) * 0.5; // left to right, each week a beat behind
        const later = d > today;
        const key = `${year}-${pad(month + 1)}-${pad(d)}`;
        const id = day?.id ?? key;
        const word = day || later || dow > 4 ? null : closes[key] ? "none" : d < today && firstClose && key > firstClose ? "open" : null;
        return (
          <Well key={d} i={sweep} top={d} photo={photos[dayKeyOf(id)]?.[0]?.url} value={day?.net ?? 0} traded={!!day} word={word} whole={cols > 5 ? 1000 : 10000} on={!!day && selected === day.id} today={d === today} later={later}
            label={`${d} ${MONTHS[month]}: ${day ? fmtMoney(day.net, { sign: true }) : later ? "still to come" : "no trades"}`}
            onPick={!later ? () => onPick(id) : undefined} />
        );
      })}
    </div>
  );
}

// All time: a well for each month, and a month opens itself
export function MonthWells({ trades, onPick }) {
  const by = useMemo(() => { const m = {}; for (const t of trades) { const k = t.month || `${CAL.year}-${pad(CAL.month + 1)}`; m[k] = (m[k] || 0) + t.pnl; } return m; }, [trades]);
  const nowKey = `${NOW.year}-${pad(NOW.month + 1)}`;
  const first = Object.keys(by).sort()[0];
  const from = first ? Math.min(+first.slice(0, 4), NOW.year) : NOW.year;
  const years = Array.from({ length: NOW.year - from + 1 }, (_, i) => NOW.year - i);
  return (
    <div className="jn-years">
      {years.map((y) => (
        <div key={y} className="jn-year">
          <h3 className="num">{y}</h3>
          <div className="jn-wells months" style={{ "--cols": 4 }}>
            {MON.map((name, m) => {
              const k = `${y}-${pad(m + 1)}`, v = by[k], later = k > nowKey;
              return <Well key={k} i={m} top={name} value={v ?? 0} traded={v != null} whole={100000} today={k === nowKey} later={later}
                label={`${MONTHS[m]} ${y}: ${v != null ? fmtMoney(v, { sign: true }) : later ? "still to come" : "no trades"}`}
                onPick={later ? undefined : () => onPick(y, m)} />;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
