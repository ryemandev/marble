import { useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { reducedMotion } from "../components/overlay";
import { getState, setWorld, useStore } from "../store";
import { SEAL, WORLD_NAME } from "../world";

const MS = 1500;
const SWAP_AT = 0.44 * MS;
const RISE_MS = 900;
const slow = () => (import.meta.env.DEV ? +(window.__worldSlow || 1) : 1);

const groundOf = (world) => (document.documentElement.dataset.theme === "light" ? (world === "markets" ? "#efefed" : "#eceef1") : "#000");

let busy = false;
let queued = null;
let heading = null;
const settle = () => {
  busy = false;
  heading = null;
  const q = queued;
  queued = null;
  if (q && q !== getState().world) goWorld(q);
};
export function goWorld(next, { onSwap } = {}) {
  if (busy) { queued = next; return true; }
  if (next === getState().world) return false;
  const root = document.documentElement;
  const veil = document.querySelector(".world-veil");
  const quick = reducedMotion() || !veil;
  busy = true;
  heading = next;
  if (veil) {
    const bar = document.querySelector(".topbar")?.getBoundingClientRect();
    veil.style.top = `${Math.max(0, Math.round(bar?.bottom || 0))}px`;
    veil.style.background = groundOf(next);
  }
  root.classList.add(quick ? "world-quick" : "world-going");
  setTimeout(() => {
    flushSync(() => { setWorld(next); onSwap?.(); });
    root.classList.remove("world-going", "world-quick");
    if (quick) { settle(); return; }
    root.classList.add("world-rise");
    setTimeout(() => { root.classList.remove("world-rise"); settle(); }, RISE_MS * slow());
  }, (quick ? 110 : SWAP_AT) * slow());
  return true;
}

export default function WorldSwitch() {
  const world = useStore((s) => s.world);
  const [target, setTarget] = useState(null); // the world we're heading to, while the seal blooms
  const [bloom, setBloom] = useState(false);
  const label = useRef(null);
  const [width, setWidth] = useState(null);
  const pillTo = (w) => (w === "markets" ? "crypto" : "markets");
  const next = pillTo(world);

  const go = (to) => {
    if (busy) { goWorld(to); return; }
    if (to === world) return;
    const quick = reducedMotion();
    if (!quick) {
      setTarget(to);
      setWidth(label.current?.querySelector(".ws-w.now")?.offsetWidth ?? null);
    }
    goWorld(to, { onSwap: () => { setTarget(null); setBloom(false); setWidth(null); } });
  };

  useLayoutEffect(() => {
    if (!target) return;
    let a = requestAnimationFrame(() => {
      a = requestAnimationFrame(() => {
        setBloom(true);
        const w = label.current?.querySelector(".ws-w.next")?.offsetWidth;
        if (w) setWidth(w);
      });
    });
    return () => cancelAnimationFrame(a);
  }, [target]);

  return (
    <div className="ws" data-tour="world">
      <button type="button" className={`ws-toggle ${bloom ? "bloom" : ""}`} onClick={() => go(pillTo(heading || world))}
        aria-label={`Switch to ${WORLD_NAME[next]}`} title={`Switch to ${WORLD_NAME[next]}`}>
        <span className="ws-seal" aria-hidden="true">
          <span key={world} className="ws-k now">{SEAL[world]}</span>
          {target && <span className="ws-k next">{SEAL[target]}</span>}
        </span>
        <span className="ws-label" ref={label} style={width != null ? { width } : undefined}>
          <span key={world} className="ws-w now">{WORLD_NAME[world]}</span>
          {target && <span className="ws-w next" aria-hidden="true">{WORLD_NAME[target]}</span>}
        </span>
      </button>
      {world !== "all" && (
        <button type="button" className={`ws-all ${target === "all" ? "leaving" : ""}`} onClick={() => go("all")} aria-label="Show All markets" title="All markets">
          <span className="ws-seal sm" aria-hidden="true"><span className="ws-k now">{SEAL.all}</span></span>
        </button>
      )}
    </div>
  );
}

export const WorldTag = ({ world }) => <span className="ws-tag" title={WORLD_NAME[world]} aria-label={WORLD_NAME[world]}>{SEAL[world]}</span>;
