import { Fragment, useLayoutEffect } from "react";
import { useIn } from "./useRise";

const Words = ({ text, silver }) => text.split(" ").map((word, i) => (
  <Fragment key={i}><span className={silver ? "w silver" : "w"}><span>{word}</span></span>{" "}</Fragment>
));

// A headline that wraps however the screen wants it to, then arrives a line at a time. Words on the same
// line share a delay, so it reads as whole lines rising, whatever the width.
export default function Lines({ as: Tag = "h2", text, silver, now, boxRef, className = "", ...rest }) {
  const ref = useIn(now);
  const hold = (el) => { ref.current = el; if (boxRef) boxRef.current = el; };
  useLayoutEffect(() => {
    const el = ref.current;
    const number = () => {
      let line = -1, top = null;
      el.querySelectorAll(".w").forEach((w) => {
        if (top === null || Math.abs(w.offsetTop - top) > 6) { line++; top = w.offsetTop; }
        w.firstChild.style.setProperty("--i", line);
      });
    };
    number();
    document.fonts?.ready.then(number);
    const ro = new ResizeObserver(number);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, silver]);
  return <Tag ref={hold} className={`lines ${className}`} {...rest}><Words text={text} />{silver && <><br /><Words text={silver} silver /></>}</Tag>;
}
