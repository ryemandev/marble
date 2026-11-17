import { useMemo, useState } from "react";
import { Modal } from "../components/overlay";
import { CAL, art, fmtMoney, plural } from "../data";
import { Money, figureSize } from "../drip/Money";
import { STAGES, isSample, simulated, stageOf, useAccounts } from "../drip/accounts";
import { useMoney } from "../drip/view";
import { MON, pad } from "../lib/basics.js";
import { NEED, findLeak } from "../lib/finding";
import { prepare } from "../lib/oracle";
import { builtFrom } from "../lib/trail";
import { getState, loadState, setState, toast, unlinkTrades, useStore } from "../store";
import { utcOf } from "../world";
import { undoImport } from "./import/service";
import { nyOf } from "./time";
import "./import/first-file.css";

const SHOWN = 300; // a long file's rows stop here; the total above them is still the whole file
const Close = ({ onClick, label }) => (
  <button type="button" className="ff-x" onClick={onClick} aria-label={label}>
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true"><path d="M4.5 4.5l11 11M15.5 4.5l-11 11" /></svg>
  </button>
);
const cents = (v) => fmtMoney(v, { sign: true, decimals: 2 }).replace("-", "−");

// One figure, the file's whole total, and it's the trader who says whether it's right
function Ask({ words, net, onYes, onOff, onLeave }) {
  return (
    <div className="ff-page" tabIndex={-1} data-autofocus>
      <header className="ff-head"><p>{words}</p><Close onClick={onLeave} label="Not now" /></header>
      <p className="ff-fig" style={figureSize(net)}><Money value={net} /></p>
      <div className="ff-foot">
        <h2>Does this match your broker?</h2>
        <div className="ff-two">
          <button type="button" className="ff-btn" onClick={onYes}>Yes</button>
          <button type="button" className="ff-btn" onClick={onOff}>It's off</button>
        </div>
      </div>
    </div>
  );
}

function Cost({ found, tag, onSee, onLeave }) {
  return (
    <div className="ff-page" tabIndex={-1} data-autofocus>
      <section className="ff-cost" aria-label={`Your biggest cost: ${found.title}`}>
        <img src={art("masters/narcissus-caravaggio", 960)} alt="" draggable="false" />
        <Close onClick={onLeave} label="Go to the Desk" />
        <div className="ff-cost-words">
          <p><b>Your biggest cost</b>{tag && <span> · {tag}</span>}</p>
          <p className="ff-fig" style={{ ...figureSize(found.net), "--size": "80px" }}><Money value={found.net} onBlack /></p>
          <h2>{found.title}</h2>
        </div>
      </section>
      <button type="button" className="ff-btn wide" onClick={onSee}>See the {plural(found.n, "trade")}</button>
    </div>
  );
}

// Every trade in the file, the way a broker's statement lists them, with the fees kept apart
function Compare({ words, trades, net, crypto, busy, error, onRemove, onKeep }) {
  const built = useMemo(() => builtFrom(trades), [trades]);
  const clock = crypto ? utcOf : nyOf;
  const opened = (t) => { const n = clock(t.traded_at); return `${n.day} ${MON[n.month]} ${pad(n.hour)}:${pad(n.minute)}`; };
  return (
    <div className="ff-page compare" tabIndex={-1} data-autofocus>
      <div className="ff-scroll">
        <p className="ff-words">{words}</p>
        <p className="ff-fig" style={figureSize(net)}><Money value={net} /></p>
        <div className="ff-tiles">
          <div><span>Before fees</span><b>{cents(built.gross)}</b></div>
          <div className="fee"><span>Fees</span><b>{built.fees ? cents(-built.fees) : "None in the file"}</b></div>
        </div>
        <h2>Compare these with your broker</h2>
        <table className="ff-rows">
          <thead><tr><th scope="col">Opened ({crypto ? "UTC" : "ET"})</th><th scope="col">Trade</th><th scope="col">Size</th><th scope="col">After fees</th></tr></thead>
          <tbody>
            {trades.slice(0, SHOWN).map((t) => (
              <tr key={t.id}><td>{opened(t)}</td><td>{t.symbol} {t.side}</td><td>{t.size === "" || t.size == null ? "–" : t.size}</td><td className={+t.pnl < 0 ? "down" : ""}>{cents(+t.pnl || 0)}</td></tr>
            ))}
          </tbody>
        </table>
        {trades.length > SHOWN && <p className="ff-more">The first {SHOWN} of {trades.length}. The rest are in your Journal.</p>}
      </div>
      <div className="ff-foot pinned">
        {error && <p className="ff-error" role="alert">{error}</p>}
        <div className="ff-two">
          <button type="button" className="ff-btn grey" disabled={busy} onClick={onRemove}>Remove file</button>
          <button type="button" className="ff-btn" disabled={busy} onClick={onKeep}>Keep it</button>
        </div>
      </div>
    </div>
  );
}

function Frames({ file, go }) {
  const accounts = useAccounts();
  const crypto = useStore((s) => s.world) === "crypto";
  const view = useMoney("stats"); // the money Stats reads, so the cost here is the one Stats opens on
  const [trades] = useState(() => {
    const ids = new Set(file.ids);
    return getState().logged.filter((t) => ids.has(t.id)).sort((a, b) => a.traded_at.localeCompare(b.traded_at));
  });
  const [frame, setFrame] = useState("ask");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const net = trades.reduce((a, t) => a + (+t.pnl || 0), 0);
  const found = useMemo(() => (view.pool.length >= NEED ? findLeak(prepare(view.pool, { cal: { year: CAL.year, month: CAL.month } })) : null), [view.pool]);

  const sample = isSample();
  const account = accounts.find((a) => a.id === trades[0]?.account);
  const stage = account ? stageOf(account) : null;
  const words = [plural(trades.length, "trade"), "From a file", stage && simulated(stage) ? `${STAGES[stage]}, simulated` : null, sample ? "Sample data" : null].filter(Boolean).join(" · ");
  const tag = [view.simulated ? "Simulated" : null, sample ? "Sample data" : null].filter(Boolean).join(" · ");

  const leave = (to = "dashboard") => { setState({ firstFile: null }); go(to); };
  const yes = () => (found?.status === "ok" ? setFrame("cost") : leave());
  const see = () => { setState({ statsTab: "overview", statsSeeCost: true }); leave("analytics"); };
  const remove = async () => {
    setBusy(true); setError("");
    try {
      const { removed, kept } = await undoImport(file.importId);
      const ids = new Set(removed);
      loadState({ logged: getState().logged.filter((t) => !ids.has(t.id)) });
      unlinkTrades(ids);
      toast(`Removed ${plural(ids.size, "trade")}${kept ? `. Kept ${kept} you reviewed` : ""}`);
      leave();
    } catch {
      setError("Couldn't remove the file. Try again.");
      setBusy(false);
    }
  };

  return (
    <Modal label={frame === "cost" ? "Your biggest cost" : frame === "ask" ? "Does this match your broker?" : "Compare these with your broker"} onClose={() => leave()} className="ff">
      {frame === "ask" && <Ask words={words} net={net} onYes={yes} onOff={() => setFrame("compare")} onLeave={() => leave()} />}
      {frame === "cost" && <Cost found={found} tag={tag} onSee={see} onLeave={() => leave()} />}
      {frame === "compare" && <Compare words={words} trades={trades} net={net} crypto={crypto} busy={busy} error={error} onRemove={remove} onKeep={() => leave()} />}
    </Modal>
  );
}

// Once ever, straight after a trader's first file: the file's own total, and whether it's right.
export default function FirstFile({ go }) {
  const file = useStore((s) => s.firstFile);
  return file ? <Frames key={file.importId} file={file} go={go} /> : null;
}
