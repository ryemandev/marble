import { useMemo, useState } from "react";
import { Icon } from "../../components/ui";
import { NOW, monthNow } from "../../data";
import { LIVE, MONEY_CARDS } from "../../mode";
import { exampleBlocked, setState, toast, useAllTrades, useFolded, useStore } from "../../store";
import FlexStudio, { FlexMini, tradeCard } from "../../views/Flex";
import { dayCardOf } from "../DailyClose";
import { isSample, useAccounts } from "../accounts";
import { finishFor, keyOf, money, nextFinish, stampOf, unfolded, useCloses } from "../week";
import { useFlexStyle } from "../../views/flexpics";
import { isPayout, money as cash } from "../../views/money/model";
import { cardOf } from "../../views/community/mine";
import { errText, source } from "../../views/community/source";
import { useCm } from "../../views/community/context";
import FitCard from "./FitCard";
import Lead from "./Lead";

const SHOWN = 24;
const FILTERS = [["all", "All"], ["day", "Days"], ["trade", "Trades"], ["payout", "Payouts"]];
const dayName = (key) => new Date(`${key}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

// The month so far, for the line on a day's card. Money from one stage only, as the card itself.
function recordOf(all, stage, accounts) {
  if (!stage) return null;
  const ids = new Set(accounts.filter((a) => a.stage === stage).map((a) => a.id));
  const days = {};
  for (const t of unfolded(all)) {
    const at = new Date(stampOf(t));
    if (!ids.has(t.account) || at.getUTCMonth() !== NOW.month || at.getUTCFullYear() !== NOW.year) continue;
    const k = keyOf(stampOf(t));
    days[k] = (days[k] || 0) + (+t.pnl || 0);
  }
  const list = Object.values(days);
  if (!list.length) return null;
  return `${monthNow()} ${money(list.reduce((a, b) => a + b, 0), { sign: true })}`;
}

// Every card the trader has, newest first. Nothing here sorts or filters on how much was made.
function useWall() {
  const all = useFolded(useAllTrades());
  const accounts = useAccounts();
  const closes = useCloses();
  const ledger = useStore((s) => s.money);
  const seat = useStore((s) => s.me?.seat);
  const wanted = useFlexStyle().finish;
  return useMemo(() => {
    const top = finishFor(Object.keys(closes).length, wanted);
    const days = Object.keys(closes).sort().map((key, i) => ({
      id: `day-${key}`, at: key, type: "day", finish: finishFor(i + 1, wanted),
      card: dayCardOf({ all, accounts, closes: { [key]: closes[key] }, count: i + 1 }),
    }));
    const trades = unfolded(all).slice(0, SHOWN).map((t) => ({ // one card per account, so each shows its own stage
      id: `trade-${t.id}`, at: keyOf(stampOf(t)), type: "trade", finish: top, trade: t,
      card: tradeCard(t, accounts.find((a) => a.id === t.account)),
    }));
    const payouts = (ledger || []).filter(isPayout).map((p) => ({
      id: `payout-${p.id}`, at: p.day, type: "payout", finish: top,
      card: {
        kind: "payout", id: p.id, title: "Payout", when: dayName(p.day), money: p.minor / 100, figure: cash(p.minor, p.currency),
        fallback: "Payout", stage: accounts.find((a) => a.id === p.account)?.stage || null, verified: false,
        caption: "Paid out. Journaled on Marble.",
      },
    }));
    const wall = [...days, ...trades, ...payouts].sort((a, b) => b.at.localeCompare(a.at));
    const founder = seat ? {
      id: "founder", type: "founder", finish: "silver",
      card: { kind: "founder", id: "founder", title: "Founder", when: "", money: null, fallback: `Nº ${String(seat).padStart(3, "0")}`, seat, caption: `Founder Nº ${String(seat).padStart(3, "0")} on Marble.` },
    } : null;
    return { wall, founder, count: Object.keys(closes).length, latest: days.at(-1) || null, top };
  }, [all, accounts, closes, ledger, seat, wanted]);
}

// What a card says on the Feed. Dollars only while money cards are on.
function feedLine(item) {
  const c = item.card;
  if (item.type === "trade") return `${c.title}${MONEY_CARDS && c.money != null ? `, ${money(c.money, { sign: true })}` : ""}.`;
  if (item.type === "day") return `${c.title} closed.`;
  if (item.type === "payout") return "Paid out.";
  return c.caption;
}

const EXAMPLE = { kind: "day", id: "example", title: "Day 1", when: "", money: null, fallback: "Day 1" };

export default function Cards() {
  const { go } = useCm();
  const all = useFolded(useAllTrades());
  const accounts = useAccounts();
  const { wall, founder, count, latest, top } = useWall();
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(null);
  const types = new Set(wall.map((x) => x.type));
  const shown = wall.filter((x) => filter === "all" || x.type === filter);
  const items = filter === "all" && founder ? [founder, ...shown] : shown;

  const openCard = (item, finish = item.finish) => {
    if (item.trade?.example) { exampleBlocked(); return; }
    setOpen({ ...item, finish });
  };
  const post = async (item, finish, text, picture) => {
    if (item.trade?.example || (LIVE && isSample())) { exampleBlocked(); return; }
    try {
      await source.post({
        kind: item.card.money < 0 ? "lesson" : "win",
        body: text || feedLine(item),
        tradeId: item.trade?.id,
        card: item.trade ? cardOf(item.trade) : null,
        flex: { card: item.card, finish, picture },
      });
      setOpen(null);
      toast(LIVE && String(picture || "").startsWith("own:") ? "Posted to the Feed. Your own picture stays on your device, so it went up with one of Marble's." : "Posted to the Feed");
      go("feed");
    } catch (err) { toast(errText(err, "Couldn't post that. Try again."), { warn: true }); }
  };
  const record = (item) => (item.type === "day" ? recordOf(all, item.card.stage, accounts) : null);

  const coming = nextFinish(count);
  return (
    <div className="fl-cards">
      <Lead title="Close a day and you get a card to share.">
        {latest
          ? <button type="button" className="btn" onClick={() => openCard(latest, top)}><Icon name="share" size={15} /> Share your latest card</button>
          : <button type="button" className="btn" onClick={() => setState({ closing: "review" })}>Close today</button>}
      </Lead>

      <div className="fl-cards-grid">
        {latest ? (
          <section className="fl-latest">
            <button type="button" aria-label="Open your latest card" onClick={() => openCard(latest, top)}>
              <FitCard card={latest.card} finish={top} record={record(latest)} show={{ money: true, handle: false }} />
            </button>
            <p className="fl-foot">{coming ? `${coming.name} finish at ${coming.need} closed days. You're on ${count}.` : "You've earned every finish."}</p>
          </section>
        ) : (
          <section className="fl-latest">
            <FitCard card={EXAMPLE} finish="black" show={{ money: false, record: false, handle: false }} />
            <p className="fl-foot">Your first card will look like this. A day with no trades counts as a closed day too.</p>
          </section>
        )}

        {items.length > 0 && (
          <section className="fl-allcards">
            <h3>All your cards</h3>
            <p className="fl-foot">Tap one to share it.</p>
            {types.size > 1 && (
              <div className="fl-chips" role="group" aria-label="Show">
                {FILTERS.filter(([k]) => k === "all" || types.has(k)).map(([k, l]) => <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}
              </div>
            )}
            <div className="fl-wall">
              {items.map((x, i) => <FlexMini key={x.id} className="rise-in" style={{ "--i": Math.min(i, 10) }} card={x.card} finish={x.finish} onClick={() => openCard(x)} />)}
            </div>
            <p className="fl-foot">Newest first.{MONEY_CARDS ? " Payouts are self-reported." : ""}</p>
          </section>
        )}
      </div>

      {open && (
        <FlexStudio card={open.card} trade={open.trade} record={record(open)} finish={open.type === "founder" ? "silver" : open.finish === top ? undefined : open.finish}
          onClose={() => setOpen(null)} onPost={({ card, finish, picture, caption }) => post({ ...open, card }, finish, caption, picture)} />
      )}
    </div>
  );
}
