import { useEffect, useMemo, useState } from "react";
import { Card, Pnl } from "../components/ui";
import { Meter, Rolling } from "../components/charts";
import { fmtMoney, plural, summarize } from "../data";
import { goWorld } from "./WorldSwitch";
import { InkHero } from "./CryptoDash";
import { HourStrip, LevDots, LiqRuler, Month7, Receipt } from "./charts";
import { dailyOf, hoursOf, leverageOf, receiptOf, weekendOf } from "./stats";
import "./dash.css";

// The sample month: October 2026, "now" 27 October, 17:52 UTC
const YEAR = 2026, MONTH = 9, TODAY = 27;

export default function CryptoSoon() {
  const [sample, setSample] = useState(null);
  useEffect(() => {
    let live = true;
    import("./sample").then((m) => live && setSample(m.CRYPTO));
    return () => { live = false; };
  }, []);

  return (
    <div className="view soon-view">
      <div className="view-head soon-head">
        <div>
          <div className="eyebrow">Crypto · coming soon</div>
          <h1 className="two">The crypto desk.<span className="soon-silver">Coming soon.</span></h1>
          <p className="soon-line">Exchange files from Bybit, Binance and OKX, a Hyperliquid wallet synced from its public address, and a desk that keeps the 24/7 clock, with every fee, funding payment and hour in UTC.</p>
        </div>
        <button type="button" className="btn ghost soon-back" onClick={() => goWorld("markets")}>Back to Markets</button>
      </div>

      <div className="soon-mark"><span className="soon-dot" aria-hidden="true" />Preview · sample data<span className="faint">Nothing here is yours, and nothing can be saved</span></div>
      {sample ? <Preview sample={sample} /> : <div className="soon-wait" aria-hidden="true" />}
    </div>
  );
}

function Preview({ sample }) {
  const trades = sample.TRADES;
  const rules = sample.RULES;
  const t = useMemo(() => summarize(trades), [trades]);
  const receipt = useMemo(() => receiptOf(trades), [trades]);
  const clock = useMemo(() => hoursOf(trades), [trades]);
  const week = useMemo(() => weekendOf(trades), [trades]);
  const lev = useMemo(() => leverageOf(trades, rules.maxLeverage), [trades, rules.maxLeverage]);
  const decided = t.wins + t.losses;
  const accounts = new Set(trades.map((x) => x.account)).size;

  return (
    <>
      <InkHero eyebrow="Tuesday · 27 October · 17:52 UTC · Preview · sample data" title="Every hour," line2="on one desk."
        sub={`${plural(t.count, "sample trade")} across ${accounts} sample accounts: ${fmtMoney(Math.round(t.net), { sign: true })} after fees and funding in October.`} />

      <div className="grid g12">
        <Card className="kpi hero-kpi c4">
          <div className="k-label">Net P&amp;L · after fees and funding</div>
          <div className="k-value chrome-text"><Rolling value={Math.round(t.net)} format={(v) => fmtMoney(v, { sign: true })} /></div>
          <div className="k-sub">{plural(t.count, "trade")} in October</div>
        </Card>
        <Card className="kpi c4 half-sm">
          <div className="k-label">Win rate</div>
          <div className="k-value">{decided ? <Rolling value={t.winRate} format={(v) => `${v.toFixed(1)}%`} /> : "–"}</div>
          {decided > 0 && <Meter value={t.winRate} mark={50} label="Win rate" />}
          <div className="k-sub">Weekends {week.weekend.wins} of {week.weekend.trades} won</div>
        </Card>
        <Card className="kpi c4 half-sm">
          <div className="k-label">Fees and funding</div>
          <div className="k-value"><Rolling value={-Math.round(receipt.costs)} format={(v) => fmtMoney(v, { sign: true })} /></div>
          <div className="k-sub">{receipt.costShare != null ? `${Math.round(receipt.costShare)}% of what the trades made` : ""}</div>
        </Card>
      </div>

      <div className="grid g12">
        <Card className="c12">
          <h3>The clock never closes <span className="caps">P&amp;L by hour · UTC</span></h3>
          <HourStrip hours={clock.hours} sessions={clock.sessions} />
          <div className="cx-sessions">{clock.sessions.map((s) => <div key={s.name}><span className="faint xs">{s.name}</span><Pnl value={s.pnl} /></div>)}</div>
        </Card>
      </div>

      <div className="grid g12">
        <Card className="c7">
          <h3>October, all seven days <span className="caps">Saturday and Sunday included</span></h3>
          <Month7 year={YEAR} month={MONTH} daily={dailyOf(trades)} today={TODAY} />
          <div className="cx-wk-line">
            <span>Weekends <Pnl value={week.weekend.net} /> over {plural(week.weekend.trades, "trade")}</span>
            <span>Weekdays <Pnl value={week.weekday.net} /> over {week.weekday.trades}</span>
          </div>
        </Card>
        <Card className="c5">
          <h3>The receipt <span className="caps">Fees and funding</span></h3>
          <Receipt r={receipt} head={`OCTOBER · ${t.count} TRADES`} accounts={accounts} />
        </Card>
      </div>

      <div className="grid g12">
        <Card className="c6">
          <h3>Leverage <span className="caps">Each trade, one dot</span></h3>
          <LevDots stacks={lev.stacks} cap={lev.cap} />
          <p className="cx-note">{lev.over} of {lev.known} went over a {lev.cap}× cap; the highest was {+lev.max.toFixed(1)}×.</p>
        </Card>
        <Card className="c6">
          <h3>Distance to liquidation <span className="caps">Open now · rule {rules.minLiqDistance}%</span></h3>
          <LiqRuler rows={sample.POSITIONS} rule={rules.minLiqDistance} />
        </Card>
      </div>

      <div className="grid g12">
        <Card className="c12">
          <h3>Importing, in three seals <span className="caps">An exchange file, read before it goes in</span></h3>
          <SealsPreview />
        </Card>
      </div>
    </>
  );
}

function SealsPreview() {
  const rows = [
    ["Oct 26 16:21", "ETHUSDT", "long", "3×", "-$14.10", "–", "+$222.57"],
    ["Oct 25 08:09", "ETHUSDT", "long", "4×", "-$31.14", "+$5.24", "+$346.78"],
    ["Oct 24 22:40", "BTCUSDT", "short", "8×", "-$22.06", "-$4.25", "-$170.02"],
  ];
  return (
    <div className="soon-seals">
      <ol className="seal-steps">
        <li className="seal-step done">
          <span className="seal-mark" aria-hidden="true">一</span>
          <div className="seal-body">
            <div className="seal-head"><b>Where from</b><span className="faint">Bybit · Main · USDT</span></div>
            <div className="seal-how"><span>Export it from Bybit:</span><span>Assets → Unified Trading Account → History Records → Transaction Log → Export</span></div>
          </div>
        </li>
        <li className="seal-step done">
          <span className="seal-mark" aria-hidden="true">二</span>
          <div className="seal-body"><div className="seal-head"><b>The file</b><span className="num faint">bybit-transaction-log.csv · 214 rows</span></div></div>
        </li>
        <li className="seal-step now">
          <span className="seal-mark" aria-hidden="true">三</span>
          <div className="seal-body">
            <div className="seal-head"><b>What Marble read</b><span className="faint">Bybit · Transaction Log</span></div>
            <div className="seal-chips">
              {[["Fees, maker and taker", true], ["Funding", true], ["Leverage", true], ["Liquidation price", false], ["UTC times", true]].map(([l, on]) => <span key={l} className={`seal-chip ${on ? "on" : "off"}`}>{on ? "✓" : "–"} {l}</span>)}
            </div>
            <p className="seal-sum"><span><b className="num">55</b> new trades</span><span><b className="num">4</b> already in</span><span><b className="num">2</b> still open</span><span>net <b className="num">+$1,734.00</b> after fees and funding</span></p>
            <table className="table">
              <thead><tr><th>Opened · UTC</th><th>Symbol</th><th className="hide-sm" style={{ textAlign: "right" }}>Lev</th><th className="hide-sm" style={{ textAlign: "right" }}>Fees</th><th className="hide-sm" style={{ textAlign: "right" }}>Funding</th><th style={{ textAlign: "right" }}>Net</th></tr></thead>
              <tbody>{rows.map(([when, sym, side, lv, fee, fund, net]) => (
                <tr key={when} style={{ cursor: "default" }}>
                  <td className="num muted">{when}</td>
                  <td style={{ whiteSpace: "nowrap" }}><span className="sym">{sym}</span><span className={`side-tag ${side}`}>{side === "long" ? "L" : "S"}</span></td>
                  <td className="hide-sm num" style={{ textAlign: "right" }}>{lv}</td>
                  <td className="hide-sm num muted" style={{ textAlign: "right" }}>{fee}</td>
                  <td className="hide-sm num muted" style={{ textAlign: "right" }}>{fund}</td>
                  <td className={`num ${net.startsWith("-") ? "loss" : "win"}`} style={{ textAlign: "right" }}>{net}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </li>
      </ol>
    </div>
  );
}
