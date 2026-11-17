// A money figure split for setting: the sign and $ together, then the digits, with each comma on its own. Works on
// the text every formatter already gives ("+$1,840", "−$825"), so there is one way of cutting a figure in two.
export function moneyParts(text) {
  const m = /^([+\-−]?[$¥€£])(.*)$/.exec(String(text));
  if (!m) return { pre: "", digits: [String(text)] };
  return { pre: m[1].replace("-", "−"), digits: m[2].split(/(,)/).filter(Boolean) };
}

// The short form, for tight spots such as calendar cells: capital K, one decimal at most, under $1,000 in full
export function shortMoney(v, { sign = true } = {}) {
  const n = +v;
  if (!Number.isFinite(n)) return "–";
  const a = Math.abs(n), mark = n < 0 ? "−" : sign && n > 0 ? "+" : "";
  if (a < 1000) return `${mark}$${Math.round(a).toLocaleString("en-US")}`;
  const k = Math.round(a / 100) / 10;
  return k >= 1000 ? `${mark}$${(Math.round(k / 100) / 10).toFixed(1).replace(/\.0$/, "")}M` : `${mark}$${k.toFixed(1).replace(/\.0$/, "")}K`;
}

// The same figure drawn on a canvas, in the same proportions as the hung figure on the page. font(px) gives the
// canvas font. measureMoney gives its width, drawMoney puts it on the baseline y from x.
const PRE = 0.56, RAISE = PRE * 0.62, GAP = PRE * 0.1, COMMA = 0.8, TRACK = -0.03;
function runs(text, size) {
  const { pre, digits } = moneyParts(text);
  const list = pre ? [{ text: pre, px: size * PRE, track: 0, rise: size * RAISE, after: size * GAP }] : [];
  for (const d of digits) list.push({ text: d, px: d === "," ? size * COMMA : size, track: size * TRACK, rise: 0, after: 0 });
  return list;
}
const track = (ctx, px) => { if ("letterSpacing" in ctx) ctx.letterSpacing = `${px.toFixed(2)}px`; };
export function measureMoney(ctx, text, size, font) {
  let w = 0;
  for (const r of runs(text, size)) { ctx.font = font(r.px); track(ctx, r.track); w += ctx.measureText(r.text).width + r.after; }
  track(ctx, 0);
  return w;
}
export function drawMoney(ctx, text, x, y, size, font) {
  let at = x;
  for (const r of runs(text, size)) {
    ctx.font = font(r.px); track(ctx, r.track);
    ctx.fillText(r.text, at, y - r.rise);
    at += ctx.measureText(r.text).width + r.after;
  }
  track(ctx, 0);
}
