import { useLayoutEffect, useRef } from "react";
import { reducedMotion } from "../components/overlay";
import { pourPath } from "./pour-path";

// Ink pours down the screen and whatever is inside this layer appears behind its edge. The edge is
// redrawn each frame, so it stays sharp. It's the one big move in the app, kept for the moment a
// session closes.
//
// onScreen is the app's close: the edge is on the screen from the first frame, and with reduced motion the screen
// cuts to black over 200ms. Without it, as on the website, the ink arrives from above the screen and reduced motion
// skips straight to the end.
export default function Pour({ ms = 1300, colour = "#000", onScreen = false, onDone, className = "", children }) {
  const el = useRef(null);
  const done = useRef(onDone);
  done.current = onDone;
  useLayoutEffect(() => {
    const node = el.current;
    if (reducedMotion()) {
      if (!onScreen) { done.current?.(); return undefined; }
      const cut = node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "linear" });
      cut.onfinish = () => done.current?.();
      return () => { cut.onfinish = null; cut.cancel(); };
    }
    const W = onScreen ? node.clientWidth : innerWidth, H = onScreen ? node.clientHeight : innerHeight;
    let raf = 0, start = 0;
    const frame = (now) => {
      start ||= now;
      const t = Math.min(1, (now - start) / ms);
      node.style.clipPath = `path("${pourPath(W, H, onScreen ? Math.max(1 / 60, t) : t, onScreen)}")`;
      if (t < 1) raf = requestAnimationFrame(frame);
      else { node.style.clipPath = "none"; done.current?.(); }
    };
    node.style.clipPath = onScreen ? `path("${pourPath(W, H, 1 / 60, true)}")` : "path('M0 0L0 0Z')";
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [ms, onScreen]);
  return <div ref={el} className={`pour ${className}`} style={{ background: colour }}>{children}</div>;
}
