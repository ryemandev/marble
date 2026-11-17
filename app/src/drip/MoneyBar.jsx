import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/ui";
import { AccountName } from "../live/FirmPicker";
import { STAGES } from "./accounts";
import { useAccountPick } from "./view";
import "./money-bar.css";

const Chevron = () => <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;

function useDrop() {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  return { open, setOpen, box };
}

// One, some or all of the accounts. Each keeps its own word in the list, so simulated money can always be told apart.
export function AccountPick({ pick: given }) {
  const own = useAccountPick();
  const pick = given || own;
  const { open, setOpen, box } = useDrop();
  if (pick.accounts.length < 2) return null;
  return (
    <div className="pk" ref={box}>
      <button type="button" className={`pk-btn ${pick.ids ? "some" : ""}`} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(!open)}>
        <span>{pick.label}</span><Chevron />
      </button>
      {open && (
        <div className="pk-list swap" role="group" aria-label="Accounts in the total">
          <button type="button" className="pk-row" role="checkbox" aria-checked={!pick.ids} onClick={() => pick.all()}>
            <i className="pk-box" aria-hidden="true">{!pick.ids && <Icon name="check" size={13} />}</i>
            <b>All accounts</b>
          </button>
          {pick.accounts.map((a) => {
            const on = !!pick.ids?.has(a.id);
            return (
              <button type="button" key={a.id} className="pk-row" role="checkbox" aria-checked={on} onClick={() => pick.toggle(a.id)}>
                <i className="pk-box" aria-hidden="true">{on && <Icon name="check" size={13} />}</i>
                <span className="pk-name"><AccountName account={a} size={16} /></span>
                <small>{STAGES[a.stage]}</small>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function RangeDates({ period, set }) {
  return (
    <div className="pk-range" role="group" aria-label="Set a range">
      <label><span>From</span><input type="date" value={period.from || ""} max={period.to || undefined} onChange={(e) => set({ from: e.target.value })} /></label>
      <label><span>To</span><input type="date" value={period.to || ""} min={period.from || undefined} onChange={(e) => set({ to: e.target.value })} /></label>
    </div>
  );
}

const TABS = [["day", "Day"], ["week", "Week"], ["month", "Month"], ["all", "All time"], ["range", "Range"]];

// The period as one pill: its name, opening Day, Week, Month, All time and Range
export function PeriodPick({ view, word }) {
  const { period, span, pick: choose, step } = view;
  const { open, setOpen, box } = useDrop();
  const steps = period.kind === "day" || period.kind === "week" || period.kind === "month";
  return (
    <div className="pk" ref={box}>
      <button type="button" className="pk-btn" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(!open)}><span>{word}</span><Chevron /></button>
      {open && (
        <div className="pk-list swap" role="radiogroup" aria-label="Period">
          {TABS.map(([k, name]) => (
            <button type="button" key={k} className="pk-row" role="radio" aria-checked={period.kind === k} onClick={() => { choose(k); setOpen(false); }}>
              <i className="pk-box round" aria-hidden="true">{period.kind === k && <Icon name="check" size={13} />}</i>
              <b>{name}</b>
            </button>
          ))}
          {steps && (
            <div className="pk-step in-list" role="group" aria-label={span.label}>
              <button type="button" className="icon-btn sm" onClick={() => step(1)} aria-label="Earlier"><Icon name="chevL" size={14} /></button>
              <b className="num">{span.label}</b>
              <button type="button" className="icon-btn sm" onClick={() => step(-1)} disabled={!period.back} aria-label="Later"><Icon name="chevR" size={14} /></button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
