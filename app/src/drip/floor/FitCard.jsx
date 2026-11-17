import { useLayoutEffect, useRef, useState } from "react";
import { FORMATS, FlexCard, useTilt } from "../../views/Flex";

// A real card, shrunk to the width it's given. It's the card itself rather than a picture of one.
export default function FitCard({ format = "wide", className = "", ...card }) {
  const box = useRef(null);
  const f = FORMATS[format];
  const [scale, setScale] = useState(0.6);
  const { lean, tilt } = useTilt();
  useLayoutEffect(() => {
    const el = box.current;
    const fit = () => setScale(Math.min(1, el.clientWidth / f.w));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [f.w]);
  return (
    <div className="fl-fit-box" {...tilt}>
      <div className={`fl-fit ${className}`} ref={(el) => { box.current = el; lean.current = el; }} style={{ height: f.h * scale }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: f.w }}>
          <FlexCard format={format} {...card} />
        </div>
      </div>
    </div>
  );
}
