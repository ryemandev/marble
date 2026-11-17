import { useSample } from "../accounts";

// The top of each Floor tab: what this is, in a sentence, and the first thing to do on it.
export default function Lead({ title, note, tight, children }) {
  const sample = useSample();
  return (
    <header className={`fl-lead ${tight ? "tight" : ""}`}>
      <h2 className="loud">{title}</h2>
      {note && <p>{note}</p>}
      {(children || sample) && (
        <div className="fl-lead-act">
          {children}
          {sample && <span className="fl-lead-tag">Sample data</span>}
        </div>
      )}
    </header>
  );
}
