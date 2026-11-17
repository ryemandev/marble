import { startExample } from "../../live/example";
import { openDialog } from "../../store";

// The ways in, under a first desk's hold. They stay after the close: trades can come in any time.
export function FirstLinks({ accounts }) {
  const named = accounts.length ? `${accounts[0].name}${accounts.length > 1 ? ` and ${accounts.length - 1} more` : ""}` : null;
  return (
    <div className="fs-links">
      {named && <p className="fs-have">{named}</p>}
      <p><button type="button" data-tour="log" onClick={() => openDialog("trade")}>Log a trade</button></p>
      <p>
        <button type="button" onClick={() => openDialog("account")}>{named ? "Add an account" : "Add your account"}</button>
        <button type="button" onClick={() => openDialog("import")}>Bring your trades in</button>
      </p>
      <p><button type="button" className="quiet" onClick={() => startExample({ tour: false })}>See a sample desk</button></p>
    </div>
  );
}
