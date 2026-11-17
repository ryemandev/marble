import { setState } from "../../store";
import { Av } from "../../views/community/parts";

// Up and down are ink and grey, as everywhere else
export const Fig = ({ m, className = "" }) => <b className={`hub-fig ${m.value < 0 ? "down" : ""} ${className}`}>{m.text}</b>;

export function Faces({ people, size = 28, max = 5, more = 0 }) {
  const shown = people.slice(0, max);
  return (
    <span className="hub-faces" aria-hidden="true">
      {shown.map((p, i) => <span key={p.handle || i} style={{ "--size": `${size}px` }}><Av who={{ handle: p.handle || p.name, avatar: p.src ?? p.avatar }} size={size} /></span>)}
      {more > 0 && <span className="hub-faces-more num" style={{ "--size": `${size}px` }}>+{more}</span>}
    </span>
  );
}

// "148 days" beside a name. It sorts nothing, and a trader with none yet has just a name
export const closedWord = (n) => (n > 0 ? `${n} ${n === 1 ? "day" : "days"}` : null);

// When something closes or ends, as a date: the same UTC day the event's own page prints. No clock counting down,
// so nothing here hurries anyone.
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const dueDate = (at) => {
  const d = new Date(`${String(at || "").slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(+d) ? "" : `${DAY_NAMES[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`;
};
export function DueDate({ at }) {
  const text = dueDate(at);
  if (!text) return null;
  return <time className="hub-count num" dateTime={String(at).slice(0, 10)}><b>{text}</b></time>;
}

// Back to the post a number came from
export const openPost = (go, id) => { go("feed"); setTimeout(() => setState({ communityPost: id }), 60); };
