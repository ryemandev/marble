import { Icon } from "../components/ui";
import { fmtMoney } from "../data";
import { LIVE } from "../mode";
import { openDialog, setState, toast, useStore } from "../store";
import { FirmLogo } from "../live/FirmPicker";
import { firmOf, logoBox } from "../live/firms";
import { useTracked } from "../live/useFirmRules";
import { STAGES, useAccounts } from "./accounts";
import { useRoll } from "./motion";

const shortMoney = (v) => fmtMoney(v, { decimals: 0 });

// Room is how far the account can fall before the firm's drawdown line. It comes from the firm's rules
// and the trades, never from anything the trader writes down.
export function useRoom(a) {
  const trades = useStore((s) => s.logged);
  const tick = useStore((s) => s.tick);
  const money = useStore((s) => s.money);
  const { result } = useTracked(LIVE ? a : null, trades, tick, money);
  if (!LIVE) return a?.room != null ? { left: a.room, of: a.roomOf, about: false } : null;
  const dd = result?.lines.find((l) => l.id === "dd");
  if (!dd || !Number.isFinite(dd.left)) return null;
  return { left: dd.left, of: dd.limit, about: !!(dd.approx || dd.estimate) };
}

export function Tracker({ account: a, on, onClick, compact = false }) {
  const room = useRoom(a);
  const equity = useRoll(a.equity);
  const logo = firmOf(a.firm) && logoBox(a.firm, 20);
  const size = a.label || null;
  return (
    <div className={`tr-box ${LIVE && a.firmPlan ? "ruled" : ""}`}>
    <button type="button" className={`tr ${on ? "on" : ""} ${compact ? "compact" : ""}`} aria-pressed={on} onClick={onClick}>
      <span className="tr-top">
        <span className="tr-logo">{logo ? <FirmLogo slug={a.firm} size={20} /> : <span className="tr-name">{a.name}</span>}</span>
        <span className="tr-stage">{STAGES[a.stage]}</span>
      </span>
      <span className="tr-eq num" style={{ display: "block" }}>{shortMoney(Math.round(equity))}</span>
      <span className="tr-sub">
        <span>{size ? `${size} account` : "Equity"}</span>
        <span className={a.today > 0 ? "win" : a.today < 0 ? "loss" : ""}>{a.today ? `${fmtMoney(a.today, { sign: true, decimals: 0 }).replace("-", "−")} today` : "Flat today"}</span>
      </span>
      {room && (
        <span className="tr-room" style={{ display: "block" }}>
          <span className="tr-room-row"><span>Room to drawdown{room.about ? ", about" : ""}</span><b className="num">{shortMoney(room.left)}</b></span>
          {room.of > 0 && <span className="tr-bar"><i style={{ width: `${Math.max(2, Math.min(100, (room.left / room.of) * 100))}%` }} /></span>}
        </span>
      )}
    </button>
    {LIVE && <button type="button" className="tr-edit" onClick={() => openDialog("account", { account: a })} aria-label={`Edit ${a.name}`} title="Edit account"><Icon name="edit" size={14} /></button>}
    {LIVE && a.firmPlan && <button type="button" className="link tr-rules" onClick={() => openDialog("firmRules", { account: a })}>The firm's rules</button>}
    </div>
  );
}

export function useDesk() {
  const accounts = useAccounts();
  const active = useStore((s) => s.deskAccount) || accounts[0]?.id;
  const choose = (a) => {
    setState({ deskAccount: a.id });
    toast(`New trades log to ${a.name}`);
  };
  return { accounts, active, choose };
}

// The desktop's side panel. Nothing but the accounts.
export default function Trackers() {
  const { accounts, active, choose } = useDesk();
  return (
    <aside className="rail left" aria-label="Your accounts">
      <div className="tracks">
        {accounts.map((a) => <Tracker key={a.id} account={a} on={active === a.id} onClick={() => choose(a)} />)}
        <button type="button" className="btn ghost tracks-add" onClick={() => openDialog("account")}><Icon name="plus" size={14} /> {accounts.length ? "Add an account" : "Add your first account"}</button>
      </div>
    </aside>
  );
}
