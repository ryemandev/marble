import { useRef, useState } from "react";
import { GROUPS, LINES, PLATFORMS } from "./firms";
import Logo, { Head } from "./Logo";
import "./works.css";

const names = (on) => on.map((p) => PLATFORMS[p].name).join(" · ");

export default function Works() {
  const [tab, setTab] = useState(GROUPS[0].key);
  const cols = 4;
  const tabs = useRef([]);
  const onKey = (e, i) => {
    const n = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : null;
    if (n === null) return;
    const k = (n + GROUPS.length) % GROUPS.length;
    setTab(GROUPS[k].key);
    tabs.current[k]?.focus();
  };
  return (
    <section id="works" className="fx wk wk-wall" aria-labelledby="wk-title">
      <div className="wk-wrap">
        <Head />
        <div className="ww-tabs" role="tablist" aria-label="Kind of firm">
          {GROUPS.map((g, i) => (
            <button key={g.key} ref={(el) => (tabs.current[i] = el)} type="button" role="tab" id={`ww-tab-${g.key}`} aria-controls={`ww-panel-${g.key}`}
              aria-selected={g.key === tab} tabIndex={g.key === tab ? 0 : -1} onClick={() => setTab(g.key)} onKeyDown={(e) => onKey(e, i)}>
              <span className="ww-long">{g.title}</span><span className="ww-short">{g.short}</span><span className="ww-count">{g.firms.length}</span>
            </button>
          ))}
        </div>
        {GROUPS.map((group) => {
          const fill = (cols - (group.firms.length % cols)) % cols;
          return (
            <ul key={group.key} className="ww-grid" id={`ww-panel-${group.key}`} role="tabpanel" aria-labelledby={`ww-tab-${group.key}`} hidden={group.key !== tab} style={{ "--fill": fill }}>
              {group.firms.map((f, i) => (
                <li key={f.slug} className="ww-cell" style={{ "--i": i }}>
                  <Logo slug={f.slug} name={f.name} size={30} />
                  <span className="ww-on">{group.key === "platforms" ? PLATFORMS[f.on[0]].export : names(f.on)}</span>
                </li>
              ))}
              {Array.from({ length: fill }, (_, i) => (
                <li key={`f${i}`} className="ww-cell ww-blank" style={{ "--i": group.firms.length + i }} aria-hidden={i > 0 ? "true" : undefined}>
                  {i === 0 && <span className="ww-any"><b>Anything else</b>Match its columns once. Marble remembers.</span>}
                </li>
              ))}
            </ul>
          );
        })}
        <p className="wk-small">{LINES.small}</p>
      </div>
    </section>
  );
}
