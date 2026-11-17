import { useMemo } from "react";
import { fmtMoney, periodName, plural } from "../../data";
import { useStore } from "../../store";
import { HourStrip, LevDots, LiqRuler, Receipt } from "../../crypto/charts";
import { hoursOf, leverageOf, liqDistancesOf, receiptOf, weekendOf } from "../../crypto/stats";
import { cash } from "./bits";
import { Spread } from "./charts";
import "../../crypto/dash.css";

// What only the crypto world has: a clock that never closes, a receipt, funding, leverage and how close
// each trade opened to liquidation.
export default function CryptoPanels({ trades, count }) {
  const rules = useStore((s) => s.rules);
  const m = useMemo(() => ({
    clock: hoursOf(trades), week: weekendOf(trades), receipt: receiptOf(trades), lev: leverageOf(trades, rules.maxLeverage), liq: liqDistancesOf(trades, rules.minLiqDistance),
    funding: [...new Set(trades.filter((t) => t.funding).map((t) => t.symbol))].map((sym) => {
      const ts = trades.filter((t) => t.symbol === sym && t.funding);
      return { label: sym, value: ts.reduce((a, t) => a + +t.funding, 0), sub: plural(ts.length, "trade") };
    }).sort((a, b) => a.value - b.value),
  }), [trades, rules.maxLeverage, rules.minLiqDistance]);
  return (
    <>
      <section className="jn-panel wide">
        <header><h3>The clock never closes</h3><p>By hour of entry, UTC</p></header>
        <HourStrip hours={m.clock.hours} sessions={m.clock.sessions} />
        <div className="sv-three">
          {m.clock.sessions.slice(0, 3).map((x) => <div key={x.name}><span>{x.name}</span><b className="num">{cash(x.pnl, { decimals: 0 })}</b></div>)}
        </div>
        <div className="sv-pair">
          <div><b>{cash(m.week.weekday.net, { decimals: 0 })}</b><span>Weekdays, {plural(m.week.weekday.trades, "trade")}</span></div>
          <div><b>{m.week.weekend.trades ? cash(m.week.weekend.net, { decimals: 0 }) : "$0"}</b><span>{m.week.weekend.trades ? `Weekends, ${plural(m.week.weekend.trades, "trade")}` : "No weekend trades"}</span></div>
        </div>
      </section>
      <section className="jn-panel">
        <header><h3>The receipt</h3><p>{periodName()}</p></header>
        <Receipt r={m.receipt} head={plural(count, "trade")} />
      </section>
      <section className="jn-panel">
        <header><h3>Funding by market</h3><p>Paid {fmtMoney(m.receipt.funding.paid)}, received {fmtMoney(m.receipt.funding.received)}</p></header>
        {m.funding.length ? <Spread label="Funding by market" rows={m.funding} /> : <p className="jn-sub">Funding shows once your trades carry it: Hyperliquid syncs and Bybit files do.</p>}
      </section>
      <section className="jn-panel">
        <header><h3>Leverage</h3><p>Each trade, one dot</p></header>
        {m.lev.known ? <>
          <LevDots stacks={m.lev.stacks} cap={m.lev.cap} />
          <p className="jn-sub">{m.lev.cap ? `${m.lev.over} of ${m.lev.known} over your ${m.lev.cap}× cap.` : `Averaging ${m.lev.avg}×.`}{m.lev.unknown ? ` ${plural(m.lev.unknown, "trade")} didn't say.` : ""}</p>
        </> : <p className="jn-sub">Leverage shows once your trades carry it.</p>}
      </section>
      {m.liq.rows.length > 0 && (
        <section className="jn-panel">
          <header><h3>Distance to liquidation</h3><p>At entry, closest first</p></header>
          <LiqRuler rows={[...m.liq.rows].sort((a, b) => a.d - b.d).slice(0, 5).map(({ t, d }) => ({ key: t.id, symbol: t.symbol, side: t.side, leverage: t.leverage, dist: d }))} rule={rules.minLiqDistance} />
          {rules.minLiqDistance > 0 && <p className="jn-sub">{m.liq.inside ? `${plural(m.liq.inside, "trade")} opened inside your ${rules.minLiqDistance}%.` : `Every trade opened outside your ${rules.minLiqDistance}%.`}</p>}
        </section>
      )}
    </>
  );
}
