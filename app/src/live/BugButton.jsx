import { Icon } from "../components/ui";
import { openDialog } from "../store";

export default function BugButton({ view }) {
  return (
    <button type="button" className="bug-btn" onClick={() => openDialog("bug", { view })} aria-label="Report a bug" title="Report a bug">
      <Icon name="bug" size={14} />
      <span className="bug-btn-text">Report a bug</span>
    </button>
  );
}
