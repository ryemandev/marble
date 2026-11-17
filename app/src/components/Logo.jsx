import { useId } from "react";
import wordmark from "../brand/marble-logo-black.svg?raw";

// The logo is the owner's file, read as it is: its two paths (the letters, then the drips) and its viewBox.
// Nothing here redraws it; the drips can only be revealed, never reshaped.
const paths = [...wordmark.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
export const LETTERS = paths[0];
export const DRIPS = paths[1];
export const VIEW = { x: 72, y: 22, w: 416, h: 152 };

const INK = "currentColor";

// The dripping m, the logo's icon. A small mark for small places.
export default function Logo({ size = 28, color = INK, decorative = false, className = "", style, ...rest }) {
  const label = decorative ? { "aria-hidden": "true" } : { role: "img", "aria-label": "Marble" };
  return (
    <svg width={size} height={size} viewBox="240 262 544 544" focusable="false" className={`marble-m ${className}`} style={style} {...label} {...rest}>
      <g transform="translate(212 182) scale(6)" fill="none" stroke={color} strokeWidth="17" strokeLinecap="round">
        <path d="M13 78V40a18.5 18.5 0 0 1 37 0V62M50 40a18.5 18.5 0 0 1 37 0V94" />
      </g>
      <circle cx="512" cy="710" r="42" fill={color} />
    </svg>
  );
}

// The wordmark. Size it by width. `pour` lets the drips run down when it first appears.
export function Wordmark({ width = 180, color = INK, pour = false, className = "", style, fontSize }) {
  const id = useId().replace(/:/g, "");
  const w = fontSize ? Math.round(fontSize * 4.4) : width;
  const h = (w * VIEW.h) / VIEW.w;
  return (
    <svg className={`wordmark ${pour ? "pours" : ""} ${className}`} width={w} height={h} viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} role="img" aria-label="Marble" style={style} focusable="false">
      {pour && <defs><clipPath id={id}><rect className="wordmark-run" x={VIEW.x} y="100" width={VIEW.w} height="74" /></clipPath></defs>}
      <g fill={color}>
        <path d={LETTERS} />
        <path d={DRIPS} clipPath={pour ? `url(#${id})` : undefined} />
      </g>
    </svg>
  );
}

// The old stamp's place: the m on its own
export function Stamp({ size = 96, color = INK, className = "", style }) {
  return <Logo size={size} color={color} decorative className={className} style={style} />;
}
