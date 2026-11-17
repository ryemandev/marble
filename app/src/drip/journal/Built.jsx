import { Modal } from "../../components/overlay";
import { Icon } from "../../components/ui";
import { plural } from "../../data";
import { LIVE } from "../../mode";
import { openDialog } from "../../store";
import { FEE_NOTES, FEE_WORDS, SOURCES, builtFrom, feeOf } from "../../lib/trail";
import { Tick, exact } from "./bits";

export function Line({ name, value, strong, note }) {
  return <div className={`jn-line ${strong ? "strong" : ""}`}><span>{name}{note && <small>{note}</small>}</span><b className="num">{value}</b></div>;
}

// Tap a figure and this is how it was made: what it came to, where the trades came from, and which fees
// are in it. Nothing is smoothed over: a fee that never arrived is said out loud.
export default function Built({ title, tag, trades, onClose }) {
  const b = builtFrom(trades);
  const froms = ["sync", "import", "manual"].filter((k) => b[k].n);
  // Everything a person needs to find the gap goes with the report, so the trader only types their broker's number
  const gap = () => {
    onClose();
    openDialog("bug", { view: "figure", gap: {
      title, net: b.net, gross: b.gross, fees: b.fees, count: b.count,
      from: Object.fromEntries(froms.map((k) => [k, b[k].n])),
      trades: trades.slice(0, 40).map((t) => ({ id: t.id, at: t.traded_at || t.date, symbol: t.symbol, side: t.side, pnl: t.pnl, fee: t.commission ?? null, source: t.source || null })),
    } });
  };
  return (
    <Modal label={`How ${title} was built`} onClose={onClose} className="jn-sheet-wrap">
      <div className="jn-sheet">
        <header className="jn-sheet-head">
          <div>
            <h2>How it was built</h2>
            <p>{[title, tag].filter(Boolean).join(" · ")}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close" data-autofocus><Icon name="close" /></button>
        </header>

        <div className="jn-lines">
          <Line name={`Before fees, ${plural(b.count, "trade")}`} value={exact(b.gross)} />
          <Line name="Fees" value={exact(-b.fees)} />
          {b.funding !== 0 && <Line name="Funding" value={exact(b.funding)} />}
          <Line name="Net" value={exact(b.net)} strong />
        </div>

        <h3>Where it came from</h3>
        <div className="jn-lines">
          {froms.map((k) => <Line key={k} name={<span className="jn-ticked">{k === "sync" && <Tick size={13} />}{SOURCES[k]}</span>} note={plural(b[k].n, "trade")} value={exact(b[k].net)} />)}
        </div>

        <h3>Fee status</h3>
        <div className="jn-lines">
          <Line name={FEE_WORDS.in} value={b.feesIn} />
          {b.feesMissing > 0 && <Line name={FEE_WORDS.missing} note={FEE_NOTES.missing} value={b.feesMissing} />}
          {b.feesTyped > 0 && <Line name={FEE_WORDS.typed} note={FEE_NOTES.typed} value={b.feesTyped} />}
        </div>
        {LIVE && <button type="button" className="link jn-gap" onClick={gap}>Doesn't match your broker?</button>}
      </div>
    </Modal>
  );
}

export function FeeWord({ t }) {
  const f = feeOf(t);
  return <span className={`jn-fee ${f.status}`}>{FEE_WORDS[f.status]}</span>;
}

