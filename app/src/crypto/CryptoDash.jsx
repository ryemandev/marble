import { useMemo } from "react";
import { Card, Grade, Icon, Pnl } from "../components/ui";
import { LineChart, Meter, MonthsHeat, Rolling, equityProps } from "../components/charts";
import { CAL, SAMPLE, acrossPeriod, fmtMoney, fmtR, greeting, inPeriod, monthName, noTradesYet, plural, summarize, todayOf, viewingNow } from "../data";
import { openDialog, setState, showMonth, useAllTrades, useStore, useTrades } from "../store";
import { LIVE } from "../mode";
import MonthNav from "../live/MonthNav";
import { AccountName } from "../live/FirmPicker";
import { utcOf } from "../world";
import { HourStrip, LevDots, LiqRuler, Month7, Receipt } from "./charts";
import { dailyOf, hoursOf, leverageOf, liqDistancesOf, receiptOf, weekendOf } from "./stats";
import "./dash.css";
import { MONTHS, WEEKDAYS, pad } from "../lib/basics.js";

const DEMO_UTC = Date.UTC(2026, 9, 27, 17, 52);

export function InkHero({ eyebrow, title, line2, sub, kanji = "暗号", reading = "angō · crypto", art = true, children }) {
  return (
    <header className="hero ink-hero">
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <filter id="ink-moon" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0 0 0 1 0" />
          <feComponentTransfer>
            <feFuncR type="table" tableValues="0 0.01 0.07 0.42 0.84 0.96" />
            <feFuncG type="table" tableValues="0 0.012 0.08 0.45 0.87 0.98" />
            <feFuncB type="table" tableValues="0.006 0.02 0.1 0.5 0.92 1" />
          </feComponentTransfer>
        </filter>
      </svg>
      {art && <div className="hero-art ink-art" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}art/anime/ronin.webp)` }} />}
      <div className="hero-shade" />
      <div className="ink-vertical" aria-hidden="true"><span className="ink-kanji">{kanji}</span><span className="ink-reading">{reading}</span></div>
      <div className="hero-content">
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="hero-title">{title}<span className="hero-line2">{line2}</span></h1>
        {sub && <p className="hero-sub">{sub}</p>}
        {children}
      </div>
    </header>
  );
}

export const utcEyebrow = (label) => {
  const u = utcOf(LIVE ? new Date() : DEMO_UTC);
  return `${WEEKDAYS[u.weekday]} · ${u.day} ${MONTHS[u.month]} · ${pad(u.hour)}:${pad(u.minute)} UTC${label ? ` · ${label}` : ""}`;
};

function useOpenPositions() {
  const conns = useStore((s) => s.connections);
  return useMemo(() => {
    if (!LIVE) return SAMPLE.CRYPTO?.POSITIONS || [];
    const wallets = conns?.hyperliquid?.accounts || [];
    return wallets.flatMap((w) => (w.positions || []).map((p, i) => ({ ...p, key: `${w.id}-${i}` }))).filter((p) => p.dist != null);
  }, [conns]);
}

export default function CryptoDash({ go }) {
  const trades = useTrades();
  const all = useAllTrades();
  const name = useStore((s) => s.profile.name);
  const rules = useStore((s) => s.rules);
  const accounts = useStore((s) => s.accounts);
  useStore((s) => s.tick);
  const day = todayOf(all);
  const firstTime = all.length === 0;
  const t = summarize(trades);
  const receipt = useMemo(() => receiptOf(trades), [trades]);
  const clock = useMemo(() => hoursOf(trades), [trades]);
  const week = useMemo(() => weekendOf(trades), [trades]);
  const lev = useMemo(() => leverageOf(trades, rules.maxLeverage), [trades, rules.maxLeverage]);
  const positions = useOpenPositions();
  const atEntry = useMemo(() => liqDistancesOf(trades, rules.minLiqDistance), [trades, rules.minLiqDistance]);
  const eq = equityProps(trades);
  const decided = t.wins + t.losses;
  const u = utcOf(LIVE ? new Date() : DEMO_UTC);
  const today = viewingNow() ? u.day : CAL.year * 12 + CAL.month < u.year * 12 + u.month ? 32 : 0;
  const venues = new Set(trades.map((x) => x.account).filter(Boolean)).size;
  const openTrade = (id, e) => { setState({ journalSel: id }); go("journal", e); };
  const firstName = (name || "").split(" ")[0] || name;

  const sub = day.trades
    ? `${plural(day.trades, "trade")} today, ${fmtMoney(day.pnl, { sign: true })} after fees and funding. ${CAL.all ? "Your all-time total" : monthName()} stands at ${fmtMoney(t.net, { sign: true })}.`
    : t.count ? `No trades yet today. ${CAL.all ? "Your all-time total" : monthName()} stands at ${fmtMoney(t.net, { sign: true })} after fees and funding.`
      : firstTime ? "Bring in your crypto trades and Marble keeps the score: fees, funding, leverage and the hours you trade."
        : CAL.all ? "No crypto trades yet." : `No crypto trades in ${monthName()}.`;

  const liqRows = positions.length
    ? positions.map((p) => ({ key: p.key, symbol: p.symbol, side: p.side, leverage: p.leverage, dist: p.dist }))
    : atEntry.rows.slice(0, 4).map(({ t: x, d }) => ({ key: x.id, symbol: x.symbol, side: x.side, leverage: x.leverage, dist: d }));
  const liqCaps = positions.length ? `Open now${rules.minLiqDistance ? ` · rule ${rules.minLiqDistance}%` : ""}` : `At entry · latest${rules.minLiqDistance ? ` · rule ${rules.minLiqDistance}%` : ""}`;

  return (
    <div className="view">
      <InkHero eyebrow={utcEyebrow(LIVE ? "" : "Sample data")} title={`${greeting()},`} line2={`${firstName}.`} sub={sub}>
        <div className="actions">
          <button className="btn silver" onClick={() => openDialog("trade")}><Icon name="plus" /> Log trade</button>
          {firstTime && LIVE
            ? <button className="btn ghost" onClick={() => openDialog("import")}><Icon name="upload" size={14} /> Import trades</button>
            : <button className="btn ghost" onClick={(e) => go("journal", e)}>Open journal</button>}
        </div>
      </InkHero>

      <div className="grid g12">
        <Card className="kpi hero-kpi c4">
          <div className="k-label">Net P&amp;L · after fees and funding</div>
          <div className="k-value chrome-text">{t.count ? <Rolling value={Math.round(t.net)} format={(v) => fmtMoney(Math.round(v), { sign: true })} /> : "–"}</div>
          <div className="k-sub">{t.count ? `${plural(t.count, "trade")} ${inPeriod()}` : noTradesYet()}</div>
        </Card>
        <Card className="kpi c4 half-sm">
          <div className="k-label">Win rate</div>
          <div className="k-value">{decided ? <Rolling value={t.winRate} format={(v) => `${v.toFixed(1)}%`} /> : "–"}</div>
          {decided > 0 && <Meter value={t.winRate} mark={50} label="Win rate" />}
          <div className="k-sub">{week.weekend.trades ? `Weekends ${week.weekend.wins} of ${week.weekend.trades} won` : decided ? "No weekend trades this month" : "Shows after your first win or loss"}</div>
        </Card>
        <Card className="kpi c4 half-sm">
          <div className="k-label">Fees and funding</div>
          <div className="k-value">{t.count ? <Rolling value={-Math.round(receipt.costs)} format={(v) => fmtMoney(Math.round(v), { sign: true })} /> : "–"}</div>
          <div className="k-sub">{receipt.costShare != null ? `${Math.round(receipt.costShare)}% of what the trades made` : t.count ? "Fees, less any funding received" : "Counted from each trade's fees and funding"}</div>
        </Card>
      </div>

      {LIVE && <div className="dash-month"><MonthNav /></div>}

      {t.count === 0 ? (
        <div className="grid g12">
          <Card className="c12 cx-start">
            <h3>Your crypto desk <span className="caps">Read-only, always</span></h3>
            <div className="cx-ways">
              <div><b>Upload an export</b><span className="muted xs">Bybit (Demo too), Binance futures and OKX files, or Marble's crypto template for anything else.</span><button className="link" onClick={() => openDialog("import")}>Import a file</button></div>
              <div><b>Sync a Hyperliquid wallet</b><span className="muted xs">Paste a public address. No key, no signing, nothing Marble can trade with.</span><button className="link" onClick={() => openDialog("import", { tab: "connect" })}>Add a wallet</button></div>
              <div><b>Log one by hand</b><span className="muted xs">With its leverage, fees and funding. Press L anywhere.</span><button className="link" onClick={() => openDialog("trade")}>Log a trade</button></div>
            </div>
            {accounts.length === 0 && <p className="muted xs cx-start-foot">Start with an account: <button className="link" onClick={() => openDialog("cryptoAccount")}>add an exchange, a wallet or a prop firm</button>.</p>}
          </Card>
        </div>
      ) : (
        <>
          <div className="grid g12">
            <Card className="c12">
              <h3>The clock never closes <span className="caps">P&amp;L by hour · UTC</span></h3>
              <HourStrip hours={clock.hours} sessions={clock.sessions} />
              <div className="cx-sessions">{clock.sessions.map((s) => <div key={s.name}><span className="faint xs">{s.name}</span><Pnl value={s.pnl} /></div>)}</div>
            </Card>
          </div>

          <div className="grid g12">
            <Card className="c7">
              <h3>{CAL.all ? "Every month" : `${monthName()}, all seven days`} <span className="caps">{CAL.all ? "P&L by month" : "Saturday and Sunday included"}</span></h3>
              {CAL.all ? <MonthsHeat trades={trades} onPick={showMonth} /> : <Month7 year={CAL.year} month={CAL.month} daily={dailyOf(trades)} today={today} />}
              <div className="cx-wk-line">
                <span>Weekends <Pnl value={week.weekend.net} /> over {plural(week.weekend.trades, "trade")}</span>
                <span>Weekdays <Pnl value={week.weekday.net} /> over {week.weekday.trades}</span>
              </div>
            </Card>
            <Card className="c5">
              <h3>The receipt <span className="caps">Fees and funding</span></h3>
              <Receipt r={receipt} head={`${CAL.all ? "ALL TIME" : monthName().toUpperCase()} · ${t.count} ${t.count === 1 ? "TRADE" : "TRADES"}`} accounts={venues || null} />
            </Card>
          </div>

          <div className="grid g12">
            <Card className={liqRows.length ? "c6" : "c12"}>
              <h3>Leverage <span className="caps">Each trade, one dot</span></h3>
              {lev.known ? <>
                <LevDots stacks={lev.stacks} cap={lev.cap} />
                <p className="cx-note">{lev.cap
                  ? (lev.over ? `${lev.over} of ${lev.known} went over your ${lev.cap}× cap; the highest was ${+lev.max.toFixed(1)}×.` : `All ${lev.known} stayed inside your ${lev.cap}× cap.`)
                  : `Averaging ${lev.avg}×, the highest ${+lev.max.toFixed(1)}×. Set a cap in your limits to mark it here.`}
                {lev.unknown > 0 && ` ${plural(lev.unknown, "trade")} didn't say.`}</p>
              </> : <p className="empty-note">Leverage shows once your trades carry it: Bybit and OKX files do, and you can add it to a trade.</p>}
            </Card>
            {liqRows.length > 0 && (
              <Card className="c6">
                <h3>Distance to liquidation <span className="caps">{liqCaps}</span></h3>
                <LiqRuler rows={liqRows} rule={rules.minLiqDistance} />
              </Card>
            )}
          </div>

          <div className="grid g12">
            <Card className="c12 split">
              <h3>Equity curve <span className="caps">All crypto accounts · every day</span></h3>
              <LineChart {...eq} height={230} label={`Crypto equity across ${acrossPeriod()}, ending at ${fmtMoney(t.net, { sign: true })}`} />
            </Card>
          </div>
        </>
      )}

      <div className="grid g12">
        <Card className="c12">
          <h3>Latest trades {trades.length > 0 && <button className="link" onClick={(e) => go("journal", e)}>All {trades.length}</button>}</h3>
          <table className="table">
            <thead><tr><th>When <span className="faint">UTC</span></th><th>Symbol</th><th className="hide-sm">Account</th><th className="hide-sm">Lev</th><th className="hide-sm">Fees</th><th className="hide-sm">Funding</th><th className="hide-sm">Grade</th><th style={{ textAlign: "right" }}>R</th><th style={{ textAlign: "right" }}>P&amp;L</th></tr></thead>
            <tbody>
              {trades.length === 0 && <tr><td colSpan={9} className="empty-note" style={{ padding: "20px 0" }}>{firstTime ? <>No crypto trades yet. <button className="link" onClick={() => openDialog("trade")}>Log your first one</button> or press L.</> : CAL.all ? "No crypto trades yet." : `No crypto trades in ${monthName()}.`}</td></tr>}
              {trades.slice(0, 6).map((x) => {
                const acct = accounts.find((a) => a.id === x.account) || SAMPLE.CRYPTO?.ACCOUNTS?.find((a) => a.id === x.account);
                return (
                  <tr key={x.id} tabIndex={0} onClick={(e) => openTrade(x.id, e)} onKeyDown={(e) => { if (e.key === "Enter") openTrade(x.id, e); }} aria-label={`Open ${x.symbol} ${x.side} on ${x.date} in the journal`}>
                    <td className="num muted">{x.date} <span className="faint">{x.time}</span></td>
                    <td style={{ whiteSpace: "nowrap" }}><span className="sym">{x.symbol}</span><span className={`side-tag ${x.side}`}>{x.side === "long" ? "L" : "S"}</span></td>
                    <td className="hide-sm">{acct ? <AccountName account={acct} size={14} /> : <span className="faint">–</span>}</td>
                    <td className="hide-sm num">{x.leverage ? `${+(+x.leverage).toFixed(1)}×` : <span className="faint">–</span>}</td>
                    <td className="hide-sm num muted">{x.commission != null ? fmtMoney(-x.commission, { decimals: 2 }) : "–"}</td>
                    <td className="hide-sm num muted">{x.funding ? fmtMoney(x.funding, { sign: true, decimals: 2 }) : "–"}</td>
                    <td className="hide-sm"><Grade grade={x.grade} /></td>
                    <td className={`num ${x.r == null ? "faint" : x.r >= 0 ? "win" : "loss"}`} style={{ textAlign: "right" }}>{fmtR(x.r)}</td>
                    <td style={{ textAlign: "right" }}><Pnl value={x.pnl} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
