import { useState } from "react";
import { Choice, Field, Sheet } from "../../components/forms";
import { AccountPicker, FirmField } from "../../live/FirmPicker";
import { firmOf } from "../../live/firms";
import { deleteMoney, newId, saveMoney, toast, useOwnStore } from "../../store";
import { CURRENCIES, FEE_KINDS, KIND_LABEL, NOTE_MAX, SYMBOL, byDay, checkEntry, firmName, isPayout, lastAmount, money, typed } from "./model";
import { moneyToday, startCurrency, useMoneyAccounts } from "./hooks";

const firmFromAccount = (a) => (a ? (firmOf(a.firm) ? a.firm : a.name || "") : "");

export default function MoneyForm({ entry, mode = "fee", account: fromAccount, onClose }) {
  const all = useOwnStore((s) => s.money) || [];
  const me = useOwnStore((s) => s.me);
  const accounts = useMoneyAccounts();
  const payout = entry ? isPayout(entry) : mode === "payout";
  const today = moneyToday();
  const acctOf = (id) => accounts.find((a) => a.id === id) || null;

  const [f, setF] = useState(() => {
    if (entry) return { account: entry.account || "", firm: entry.firm, kind: entry.kind, amount: typed(entry.minor), currency: entry.currency, day: entry.day, note: entry.note || "" };
    const lastPay = all.filter(isPayout).sort(byDay).at(-1);
    const open = (id) => (id && acctOf(id) && !acctOf(id).archived ? id : null);
    const start = open(fromAccount) ?? (payout ? open(lastPay?.account) ?? accounts.find((a) => !a.archived && /fund/i.test(a.status || a.kind || ""))?.id ?? null : null) ?? "";
    const firm = firmFromAccount(acctOf(start)) || (payout ? lastPay?.firm || "" : "");
    const kind = payout ? "payout" : "eval";
    const last = firm ? lastAmount(all, firm, kind) : null;
    return { account: start, firm, kind, amount: last ? typed(last.minor) : "", currency: last?.currency || startCurrency(all, me), day: today, note: "" };
  });
  const [typedAmount, setTypedAmount] = useState(!!entry);
  const refill = (next) => {
    if (typedAmount || !next.firm) return next;
    const last = lastAmount(all, next.firm, next.kind);
    return last ? { ...next, amount: typed(last.minor), currency: last.currency } : next;
  };
  const set = (k) => (v) => setF((x) => (k === "kind" || k === "firm" ? refill({ ...x, [k]: v }) : { ...x, [k]: v?.target ? v.target.value : v }));
  const pickAccount = (id) => setF((x) => {
    const a = acctOf(id);
    return refill({ ...x, account: id, firm: a ? firmFromAccount(a) || x.firm : x.firm });
  });

  const { entry: clean, errors, ok } = checkEntry(f, { today });
  const shown = (k) => (k === "firm" ? null : f[k] !== "" && errors[k]);
  const [sure, setSure] = useState(false);

  const save = () => {
    const next = { ...(entry || {}), ...clean, id: entry?.id ?? newId("pm"), at: entry?.at ?? new Date().toISOString() };
    delete next.acct;
    if (entry?.acct && entry.account === next.account) next.acct = entry.acct;
    saveMoney(next);
    const sum = money(next.minor, next.currency);
    toast(entry ? "Saved on the receipt" : payout ? `${sum} from ${firmName(next.firm)}, on the receipt` : `${sum} to ${firmName(next.firm)}, on the receipt`);
    onClose();
  };
  const remove = () => {
    if (!sure) { setSure(true); setTimeout(() => setSure(false), 4000); return; }
    deleteMoney(entry.id);
    toast("Taken off the receipt");
    onClose();
  };

  const listed = accounts.filter((a) => !a.archived || a.id === f.account);
  const chosen = entry?.acct && !acctOf(entry.account) && f.account === entry.account ? [{ value: entry.account, account: entry.acct }] : [];
  const options = [{ value: "", text: "No account" }, ...listed.map((a) => ({ value: a.id, account: a })), ...chosen];
  const firmValue = firmOf(f.firm) ? { firm: f.firm, name: firmOf(f.firm).name, label: "" } : { firm: null, name: f.firm, label: "" };

  const title = entry ? (payout ? "Change this payout" : "Change this fee") : payout ? "Got paid" : "Add a fee";
  const sub = entry
    ? "It's one line on your receipt. Change it, or take it off."
    : payout
      ? "Money a prop firm paid you. It prints on your receipt in brackets, as money back."
      : "What you paid a prop firm. It prints as a new line on your receipt.";

  return (
    <Sheet title={title} sub={sub} onClose={onClose} onSubmit={save} canSubmit={ok}
      submitLabel={entry ? "Save" : payout ? "Add the payout" : "Add the fee"}
      extra={entry && <button type="button" className="btn ghost danger" onClick={remove}>{sure ? "Tap again to take it off" : "Take it off"}</button>}>
      <div className="field span-2">
        <span className="field-label">Account (optional)</span>
        <AccountPicker label="Account" value={f.account} onChange={pickAccount} options={options} autoFocus={!entry && !fromAccount} />
      </div>
      <Field label="Firm" span={2}>
        <FirmField key={`firm-${f.account}`} value={firmValue} onChange={(v) => set("firm")(v.firm || v.name)} placeholder="Search firms, or type a name" autoFocus={!!fromAccount && !f.firm} />
      </Field>
      {!payout && (
        <Field label="What for" span={4}>
          <Choice label="What for" value={f.kind} onChange={set("kind")} options={FEE_KINDS.map((k) => [k, KIND_LABEL[k]])} />
        </Field>
      )}
      <Field label={payout ? "Paid to you" : "Amount"} span={2} error={shown("amount")}>
        <span className="money-amount">
          <span className="money-sym num" aria-hidden="true">{SYMBOL[f.currency]}</span>
          <input className="input num" value={f.amount} inputMode="decimal" autoComplete="off" placeholder="0.00" data-autofocus={fromAccount && f.firm ? true : undefined}
            onChange={(e) => { setTypedAmount(true); set("amount")(e.target.value); }} />
          <select value={f.currency} onChange={set("currency")} aria-label="Currency">
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </span>
      </Field>
      <Field label={payout ? "Paid on" : "Date"} span={2} error={shown("day")}>
        <input className="input num" type="date" value={f.day} max={today} onChange={set("day")} />
      </Field>
      <Field label="Note (optional)" span={4} error={shown("note")} hint={f.note.length > NOTE_MAX - 30 ? `${NOTE_MAX - f.note.length} characters left` : undefined}>
        <input className="input" value={f.note} onChange={set("note")} maxLength={NOTE_MAX} placeholder={payout ? "Which payout, after the split" : "A discount code, which month"} />
      </Field>
    </Sheet>
  );
}
