import { useMemo } from "react";
import { Card, Pnl } from "../components/ui";
import { MonthsHeat, Rolling } from "../components/charts";
import { CAL, acrossPeriod, fmtMoney, fmtR, greeting, inPeriod, monthName, noTradesYet, plural, summarize, viewingNow } from "../data";
import { setState, showMonth, useStore, useTrades } from "../store";
import { LIVE } from "../mode";
import MonthNav from "../live/MonthNav";
import { utcOf } from "../world";
import { WorldTag } from "./WorldSwitch";
import { InkHero, utcEyebrow } from "./CryptoDash";
import { Month7, TwoLines } from "./charts";
import { dailyOf } from "./stats";
import "./dash.css";
import { MON, pad } from "../lib/basics.js";

const DEMO_UTC = Date.UTC(2026, 9, 27, 17, 52);

export default function AllView({ go }) {
  const trades = useTrades();
  const name = useStore((s) => s.profile.name);
  const markets = useMemo(() => trades.filter((t) => t.world !== "crypto"), [trades]);
  const crypto = useMemo(() => trades.filter((t) => t.world === "crypto"), [trades]);
  const both = summarize(trades), m = summarize(markets), c = summarize(crypto);
  const days = new Date(Date.UTC(CAL.year, CAL.month + 1, 0)).getUTCDate();
  const u = utcOf(LIVE ? new Date() : DEMO_UTC);
  const today = viewingNow() ? u.day : CAL.year * 12 + CAL.month < u.year * 12 + u.month ? 32 : 0;
  // All time: one step a month, from the first month traded to this one
  const steps = useMemo(() => {
    if (!CAL.all) return null;
    const first = trades.map((t) => t.month).filter(Boolean).sort()[0];
    const [y0, m0] = first ? [+first.slice(0, 4), +first.slice(5, 7) - 1] : [u.year, u.month];
    const keys = [];
    for (let i = y0 * 12 + m0; i <= Math.max(y0 * 12 + m0, u.year * 12 + u.month); i++) keys.push(`${Math.floor(i / 12)}-${pad((i % 12) + 1)}`);
    const every = Math.max(1, Math.ceil(keys.length / 6));
    const marks = keys.map((k, i) => [i + 1, MON[+k.slice(5, 7) - 1]]).filter((_, i) => i % every === 0);
    const by = (ts) => { const o = {}; for (const t of ts) { const i = keys.indexOf(t.month) + 1; if (i) o[i] = (o[i] || 0) + t.pnl; } return o; };
    return { n: keys.length, marks, by };
  }, [trades, u.year, u.month]);
  const ledger = trades.slice(0, 8);
  const open = (id, e) => { setState({ journalSel: id }); go("journal", e); };
  const firstName = (name || "").split(" ")[0] || name;
  const sub = both.count
    ? `Markets ${fmtMoney(m.net, { sign: true })} and crypto ${fmtMoney(c.net, { sign: true })} ${inPeriod()}: ${fmtMoney(both.net, { sign: true })} together.`
    : `${noTradesYet()} in either world.`;
  const rate = (s) => (s.wins + s.losses ? `${s.winRate.toFixed(1)}% won` : "no wins or losses yet");

  return (
    <div className="view">
      <InkHero art={false} kanji="全" reading="zen · all" eyebrow={utcEyebrow(LIVE ? "All markets" : "All markets · Sample data")} title={`${greeting()},`} line2={`${firstName}.`} sub={sub}>
        <div className="ink-both"><span><WorldTag world="markets" /> Markets</span><span><WorldTag world="crypto" /> Crypto</span><span className="faint">USDT and USDC count 1:1 as dollars</span></div>
      </InkHero>

      <div className="grid g12">
        <Card className="kpi hero-kpi c4">
          <div className="k-label">Net P&amp;L · both worlds</div>
          <div className="k-value chrome-text"><Rolling value={both.net} format={(v) => fmtMoney(v, { sign: true })} /></div>
          <div className="k-sub">{plural(both.count, "trade")} · {rate(both)}</div>
        </Card>
        <Card className="kpi c4 half-sm">
          <div className="k-label"><WorldTag world="markets" />Markets</div>
          <div className="k-value"><Rolling value={m.net} format={(v) => fmtMoney(v, { sign: true })} /></div>
          <div className="k-sub">{plural(m.count, "trade")} · {rate(m)}</div>
        </Card>
        <Card className="kpi c4 half-sm">
          <div className="k-label"><WorldTag world="crypto" />Crypto</div>
          <div className="k-value"><Rolling value={c.net} format={(v) => fmtMoney(v, { sign: true })} /></div>
          <div className="k-sub">{plural(c.count, "trade")} · {rate(c)}</div>
        </Card>
      </div>

      {LIVE && <div className="dash-month"><MonthNav /></div>}

      <div className="grid g12">
        <Card className="c12 split">
          <h3>One equity line <span className="caps">Both, and each world in its own ink</span></h3>
          {both.count ? <>
            {steps
              ? <TwoLines a={steps.by(markets)} b={steps.by(crypto)} days={steps.n} marks={steps.marks} label={`Equity across ${acrossPeriod()}: Markets, Crypto and both`} />
              : <TwoLines a={dailyOf(markets)} b={dailyOf(crypto)} days={days} label={`Equity across ${acrossPeriod()}: Markets, Crypto and both`} />}
            <div className="cx-legend"><span><i className="k-total" />Both</span><span><i className="k-m" />Markets</span><span><i className="k-c" />Crypto</span></div>
          </> : <p className="empty-note">The line draws itself as either world's trades come in.</p>}
        </Card>
      </div>

      <div className="grid g12">
        <Card className="c7">
          <h3>{CAL.all ? "Every month" : monthName()}, both worlds <span className="caps">{CAL.all ? "P&L by month" : "Weekends are crypto's"}</span></h3>
          {CAL.all ? <MonthsHeat trades={trades} onPick={showMonth} /> : <Month7 year={CAL.year} month={CAL.month} daily={dailyOf(trades)} today={today} />}
        </Card>
        <Card className="c5">
          <h3>The ledger <span className="caps">Latest, both worlds</span></h3>
          {ledger.length === 0 && <p className="empty-note">Your latest trades from both worlds list here.</p>}
          <div className="cx-ledger">
            {ledger.map((t) => (
              <button key={t.id} type="button" className="cx-ledger-row" onClick={(e) => open(t.id, e)} aria-label={`Open ${t.symbol} ${t.side} from ${t.date} in the journal`}>
                <WorldTag world={t.world === "crypto" ? "crypto" : "markets"} />
                <span className="cx-ledger-mid">
                  <span><span className="sym">{t.symbol}</span><span className={`side-tag ${t.side}`}>{t.side === "long" ? "L" : "S"}</span></span>
                  <span className="faint xs">{[t.setup, `${t.date} ${t.time}${t.world === "crypto" ? " UTC" : ""}`].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="right-al"><Pnl value={t.pnl} /><span className="muted xs num" style={{ display: "block" }}>{fmtR(t.r)}</span></span>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
