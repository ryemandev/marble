import { useEffect, useMemo, useState } from "react";
import { LIVE } from "../../mode";
import { NOW, art, todayKey } from "../../data";
import { useAllTrades, useOwnStore } from "../../store";
import { COUNTED_SOURCES, disciplineDays, halfR, hasRules, ownRules, periodOf, stripDays, stripOf, summarise } from "./scoring";
import { source } from "./source";
import { publicTrades } from "../../crypto/public";
import { pad } from "../../lib/basics.js";

export const today = () => (LIVE ? todayKey() : `${NOW.year}-${pad(NOW.month + 1)}-${pad(NOW.day)}`);

const demoShape = (t) => ({ ...t, dayKey: t.dayKey || (t.day ? `2026-10-${pad(t.day)}` : null), at: t.time, source: "import" });

export function useMine(period = "month") {
  const own = useOwnStore((s) => s.logged);
  const demoTrades = useAllTrades();
  const ownRulesNow = useOwnStore((s) => s.rules);
  const profile = useOwnStore((s) => s.profile);
  const optedIn = useOwnStore((s) => !!s.me?.private?.show_on_boards);
  const p = useMemo(() => periodOf(period, today()), [period]);
  const [lock, setLock] = useState(null);
  useEffect(() => {
    if (!LIVE) return;
    let live = true;
    source.rulesLock(`${p.from.slice(0, 8)}01`).then((r) => live && setLock(r || null)).catch(() => live && setLock(null));
    return () => { live = false; };
  }, [p.from]);
  return useMemo(() => {
    const trades = publicTrades(LIVE ? own : demoTrades.map(demoShape));
    const rules = lock ? { lossLimit: lock.daily_loss_limit, maxTrades: lock.max_trades, stopAfter: lock.stop_after_losses } : ownRules(ownRulesNow);
    const all = disciplineDays(trades, rules, { sources: LIVE ? COUNTED_SOURCES : null });
    const end = p.to < p.today ? p.to : p.today;
    const days = all.filter((d) => d.day >= p.from && d.day <= end);
    const counted = LIVE ? trades.filter((t) => COUNTED_SOURCES.includes(t.source)).length : trades.length;
    return {
      period: p, days, all, rules, hasRules: hasRules(rules), counted, optedIn,
      summary: summarise(days), strip: stripOf(days, stripDays(p), p.today),
      handle: profile.handle, avatar: profile.avatar || (profile.avatarArt ? art(profile.avatarArt, 160) : null), cover: profile.cover ? art(profile.cover, 480) : null,
    };
  }, [own, demoTrades, ownRulesNow, lock, p, profile, optedIn]);
}

export function useAttachable() {
  const own = useOwnStore((s) => s.logged);
  const all = useAllTrades();
  return useMemo(() => publicTrades(LIVE ? own : all).slice(0, 14), [own, all]);
}

export function cardOf(t, anonymous = false) {
  const kept = Array.isArray(t.kept) ? t.kept : [];
  const card = {
    id: t.id, sym: t.symbol, side: t.side, setup: t.setup || "", r: t.r == null || t.r === "" ? null : Math.round(+t.r * 100) / 100,
    kept: kept.filter(Boolean).length, of: kept.length, plan: t.followedPlan ?? null,
    pnl: t.pnl == null ? null : Math.round(+t.pnl * 100) / 100, // what shows before it's sent. A live post's card is built again on the server, from the trade.
    src: LIVE ? t.source || "manual" : "import", via: LIVE ? null : t.world === "crypto" ? "bybit-translog" : "topstepx",
    world: t.world === "crypto" ? "crypto" : "markets",
  };
  return anonymous ? anonCard(card) : card;
}

const anonCard = (c) => (c ? { ...c, setup: null, pnl: null, r: halfR(c.r) } : c);
