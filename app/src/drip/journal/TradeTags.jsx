import { EMOTIONS_BAD, EMOTIONS_GOOD, MISTAKES } from "../../data";
import { exampleBlocked, saveTrade, saveTrades, useSetups } from "../../store";

// Review a trade with a tap. Each tap saves on its own, a second tap takes it off, and nothing is scored or counted for
// tagging. Copies of one trade all take the same review.
function Pick({ label, items, on, onTap }) {
  return (
    <div className="jn-tag-row" role="group" aria-label={label}>
      <span>{label}</span>
      <div>{items.map((x) => <button key={x} type="button" aria-pressed={on(x)} onClick={() => onTap(x)}>{x}</button>)}</div>
    </div>
  );
}

export default function TradeTags({ t, members }) {
  const known = useSetups();
  const setups = [...new Set([...(t.setup ? [t.setup] : []), ...known])].slice(0, 8);
  const mistakes = t.mistakes || [];
  const save = (change) => {
    if (t.example) return exampleBlocked();
    const next = (members || [t]).map((m) => ({ ...m, ...change, needsReview: false }));
    return next.length > 1 ? saveTrades(next) : saveTrade(next[0]);
  };
  return (
    <section className="jn-tags" aria-label="Tag this trade">
      {setups.length > 0 && <Pick label="Setup" items={setups} on={(x) => t.setup === x} onTap={(x) => save({ setup: t.setup === x ? "" : x })} />}
      <Pick label="Felt" items={[...EMOTIONS_GOOD, ...EMOTIONS_BAD]} on={(x) => t.emotion === x} onTap={(x) => save({ emotion: t.emotion === x ? "" : x })} />
      <Pick label="Mistakes" items={MISTAKES} on={(x) => mistakes.includes(x)}
        onTap={(x) => save({ mistakes: mistakes.includes(x) ? mistakes.filter((m) => m !== x) : [...mistakes, x] })} />
    </section>
  );
}
