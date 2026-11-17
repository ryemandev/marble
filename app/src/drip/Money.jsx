import { moneyParts } from "../lib/money";
import { fmtMoney } from "../data";
import "./money.css";

// A figure already written out, set hung: the sign and $ small at the top of the digits. Words with no $ in them,
// such as "Closed", come through as they are.
export function MoneyText({ text, className = "" }) {
  const { pre, digits } = moneyParts(text);
  return (
    <span className={`money ${className}`.trim()}>
      {pre && <span className="pre">{pre}</span>}
      {digits.map((d, i) => (d === "," ? <span className="cm" key={i}>,</span> : d))}
    </span>
  );
}

const FIGURE = { pre: 0.86, digit: 0.88, comma: 0.22 };

// How big a figure may stand: its size in --size and its width in ems in --ems, for a font-size that fits to width
export function figureSize(value) {
  const digits = String(Math.abs(Math.round(+value || 0))).length;
  return { "--size": digits > 3 ? "72px" : "88px", "--ems": (FIGURE.pre + digits * FIGURE.digit + Math.floor((digits - 1) / 3) * FIGURE.comma).toFixed(2) };
}

// The big money figure, for 28px and up in the display face. A loss is the same size as a win. Smaller figures in
// tiles and rows stay plain text.
export function Money({ value, sign = true, decimals = 0, onBlack = false, className = "" }) {
  const text = fmtMoney(value, { sign, decimals }).replace("-", "−");
  return <MoneyText text={text} className={[text.startsWith("−") && "loss", onBlack && "on-black", className].filter(Boolean).join(" ")} />;
}
