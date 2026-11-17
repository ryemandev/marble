import { POST_MONEY } from "../../mode";
import { money } from "../week";

// The dollars on a post, if it has any. Only what a trader put on their own post counts, never an
// anonymous one: live posts carry no dollars yet.
export function postMoney(p) {
  if (!POST_MONEY || !p || p.anonymous || p.team) return null;
  const value = p.trade?.pnl ?? p.flex?.card?.money;
  if (value == null || !Number.isFinite(+value)) return null;
  return {
    value: +value,
    text: money(+value, { sign: true }),
    verified: p.trade ? p.trade.src === "sync" : !!p.flex?.card?.verified,
    stage: p.trade?.stage ?? p.flex?.card?.stage ?? null,
    sym: p.trade?.sym || null,
  };
}

// The days people posted, newest first: every post with a trade or a day's card on it, with dollars or without.
// Dollars never place anyone, and a day with none sits in the list like any other.
export function bigDays(posts, n = 12) {
  return (posts || [])
    .filter((p) => p && !p.team && (p.trade || p.flex))
    .map((p) => ({ post: p, m: postMoney(p) }))
    .slice(0, n);
}

// The newest words on the Floor, for when there are no dollars to show
export const latestPosts = (posts, n = 8) => (posts || []).filter((p) => !p.team && !p.pinned && p.body).slice(0, n);

export const shortBody = (s, n = 70) => {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};
