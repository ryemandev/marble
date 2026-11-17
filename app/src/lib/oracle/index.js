import { nyOf } from "../../live/time.js";
import { SCOPES, inScope, prepare } from "./prepare.js";
import { GROUPS, QUESTIONS, SESSIONS, slotName } from "./questions.js";
import { SPLITS, splitBy, splitsFor } from "./split.js";

export { GROUPS, QUESTIONS, SCOPES, SESSIONS, SPLITS, prepare, slotName, splitBy, splitsFor };

const questionById = (id) => QUESTIONS.find((q) => q.id === id) || null;

export function ask(id, journal = {}, opts = {}) {
  const q = questionById(id) || QUESTIONS[0];
  const now = journal.now ?? Date.now();
  const all = journal.prepared ?? prepare(journal.trades || [], { cal: journal.cal });
  const scope = SCOPES.find((s) => s.id === opts.scope) || SCOPES[0];
  const ctx = {
    trades: inScope(all, scope.id, now),
    all,
    rules: journal.rules || {},
    strategies: journal.strategies || [],
    now,
    scope,
    period: scope.days ? ` in the last ${scope.days} days` : "",
    year: nyOf(now).year,
  };
  const a = q.answer(ctx, opts);
  const ids = [...new Set(a.groups.flatMap((g) => g.ids))];
  return { id: q.id, group: q.group, question: q.text(opts), min: q.min, scope: scope.id, count: ctx.trades.length, ...a, ids };
}
