import { VIEWS } from "../lib/copies";
import { setCopyView, useCopies, useStore } from "../store";
import { fmtMoney, plural } from "../data";
import "./copies.css";

export const accountText = (a) => `${a.name}${a.label && !String(a.name).endsWith(a.label) ? ` ${a.label}` : ""}`;

export function CopyView({ className = "" }) {
  const copies = useCopies();
  const view = useStore((s) => s.copyView);
  const accounts = useStore((s) => s.accounts);
  if (!copies.groups.length) return null;
  const used = new Set(copies.groups.flatMap((g) => g.accounts));
  const choices = accounts.filter((a) => !a.archived && used.has(a.id));
  return (
    <div className={`copy-view ${className}`} role="group" aria-label="How copied trades count">
      <span className="caps" title="A trade placed on several accounts at once">Copied trades</span>
      <div className="segmented">
        {VIEWS.map(([k, label]) => (
          <button key={k} type="button" className={view.mode === k ? "on" : ""} aria-pressed={view.mode === k}
            title={k === "combined" ? "Each copied trade counts once, its money totalled across the accounts" : "Every account's copy counts on its own"}
            onClick={() => setCopyView({ mode: k, account: view.account })}>{label}</button>
        ))}
      </div>
      {view.mode === "each" && choices.length > 0 && (
        <select className="input copy-acct" aria-label="Which account" value={view.account || ""} onChange={(e) => setCopyView({ mode: "each", account: e.target.value || null })}>
          <option value="">Every account</option>
          {choices.map((a) => <option key={a.id} value={a.id}>{accountText(a)}</option>)}
        </select>
      )}
    </div>
  );
}

export function useCopyAccount() {
  const copies = useCopies();
  const view = useStore((s) => s.copyView);
  const accounts = useStore((s) => s.accounts);
  if (!copies.groups.length || view.mode !== "each" || !view.account) return "";
  const a = accounts.find((x) => x.id === view.account);
  return a ? accountText(a) : "";
}

export function CopyTag({ n, open, onToggle }) {
  return (
    <button type="button" className="copy-tag num" aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} the ${n} accounts`}
      onClick={(e) => { e.stopPropagation(); onToggle(); }} onKeyDown={(e) => e.stopPropagation()}>
      ×{n}<span className="hide-sm"> accounts</span>
    </button>
  );
}

export function CopyList({ members, accounts, onPick, limit = 5, expanded, onExpand }) {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const shown = expanded ? members : members.slice(0, limit);
  return (
    <div className="copy-list">
      <div className="caps">On {plural(members.length, "account")}</div>
      <ul>
        {shown.map((m) => (
          <li key={m.id}>
            <button type="button" onClick={() => onPick(m.id)}>
              <span className="copy-acct-name">{byId.get(m.account) ? accountText(byId.get(m.account)) : "Removed account"}</span>
              <span className="num faint">{m.size || "–"}</span>
              <span className={`num ${m.pnl > 0 ? "win" : m.pnl < 0 ? "loss" : ""}`}>{fmtMoney(m.pnl, { sign: true })}</span>
            </button>
          </li>
        ))}
      </ul>
      {members.length > limit && <button type="button" className="link xs" onClick={onExpand}>{expanded ? "Show fewer" : `Show all ${members.length}`}</button>}
    </div>
  );
}
