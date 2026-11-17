import { useEffect, useRef } from "react";
import { reducedMotion } from "../components/overlay";

// A figure is simply there. It used to count up to its value each time a screen opened, which replayed a loss on
// every visit. The name stays, so every screen that asked for a rolled number gets the number itself.
export function useRoll(value) {
  return Number.isFinite(+value) ? +value : 0;
}

// Put this ref on an element with class `reveal`, or anything that wants `.in` the first time it's seen
export function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (reducedMotion() || typeof IntersectionObserver === "undefined") { el.classList.add("in"); return undefined; }
    const io = new IntersectionObserver((seen) => {
      if (!seen.some((e) => e.isIntersecting)) return;
      el.classList.add("in");
      io.disconnect();
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0.06 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}
