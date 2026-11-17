import { useEffect, useRef, useState } from "react";
import { useReveal } from "../../drip/motion";

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

const useScrollRead = (section, stage, measure) => {
  const [p, setP] = useState(0);
  const last = useRef(-1);
  useEffect(() => {
    let raf = 0;
    const read = () => {
      raf = 0;
      const box = section.current?.getBoundingClientRect();
      const h = stage.current?.clientHeight || innerHeight;
      if (!box) return;
      const next = Math.round(clamp(measure(box, h)) * 2000) / 2000;
      if (next !== last.current) { last.current = next; setP(next); }
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(read); };
    read();
    addEventListener("scroll", on, { passive: true });
    addEventListener("resize", on);
    return () => { removeEventListener("scroll", on); removeEventListener("resize", on); cancelAnimationFrame(raf); };
  }, [section, stage, measure]);
  return p;
};

const risen = (box, h) => (h - box.top) / Math.max(1, h);
const through = (box, h) => -box.top / Math.max(1, box.height - h);

// How far a section has come up the screen, 0 as its top enters and 1 when its top reaches the top. Nothing sticks:
// the page keeps moving at the reader's pace. Read once a frame while scrolling.
export const useProgress = (section, stage) => useScrollRead(section, stage, risen);

// How far a pinned stage has travelled through its section, 0 at the top and 1 as it lets go
export const usePinned = (section, stage) => useScrollRead(section, stage, through);

// The part of a progress that falls between two points, 0 to 1
export const between = (p, from, to) => clamp((p - from) / (to - from));

// How far an unpinned element has come up the screen: 0 as its top enters, 1 when its top reaches `to`
export function useEntry(el, to = 0.3) {
  const [p, setP] = useState(0);
  useEffect(() => {
    let raf = 0;
    const read = () => {
      raf = 0;
      const box = el.current?.getBoundingClientRect();
      if (box) setP(Math.round(clamp((innerHeight - box.top) / (innerHeight * (1 - to))) * 2000) / 2000);
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(read); };
    read();
    addEventListener("scroll", on, { passive: true });
    addEventListener("resize", on);
    return () => { removeEventListener("scroll", on); removeEventListener("resize", on); cancelAnimationFrame(raf); };
  }, [el, to]);
  return p;
}

// Adds .in the first time the element scrolls into view, or straight away with `now`
export function useIn(now = false) {
  const ref = useReveal();
  useEffect(() => { if (now) ref.current?.classList.add("in"); }, [now, ref]);
  return ref;
}
