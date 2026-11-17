function sniffDelimiter(text) {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim()).slice(0, 12);
  let best = ",", bestScore = -1;
  for (const d of [",", ";", "\t", "|"]) {
    const counts = lines.map((l) => splitLine(l, d).length);
    const top = Math.max(...counts);
    if (top < 2) continue;
    const agree = counts.filter((c) => c === top).length;
    const score = agree * 100 + top;
    if (score > bestScore) { best = d; bestScore = score; }
  }
  return best;
}
const splitLine = (line, d) => parseCSV(line, d).rows[0] || [];

export function parseCSV(text, delimiter) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const d = delimiter || sniffDelimiter(text);
  const rows = [];
  let row = [], cell = "", quoted = false, i = 0, wasQuoted = false;
  const endCell = () => { row.push(wasQuoted ? cell : cell.trim()); cell = ""; wasQuoted = false; };
  const endRow = () => { endCell(); if (row.some((c) => c !== "")) rows.push(row); row = []; };
  while (i < text.length) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      cell += c; i++; continue;
    }
    if (c === '"' && cell.trim() === "") { quoted = true; wasQuoted = true; cell = ""; i++; continue; }
    if (c === d) { endCell(); i++; continue; }
    if (c === "\r" || c === "\n") { endRow(); i += c === "\r" && text[i + 1] === "\n" ? 2 : 1; continue; }
    cell += c; i++;
  }
  if (cell !== "" || row.length) endRow();
  return { delimiter: d, rows };
}

export function findHeader(rows) {
  const width = (r) => r.filter((c) => String(c ?? "").trim() !== "").length;
  const counts = {};
  for (const r of rows.slice(0, 60)) counts[r.length] = (counts[r.length] || 0) + 1;
  const common = +Object.entries(counts).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] || 0;
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const r = rows[i];
    const w = width(r);
    if (w < 2 || w < common * 0.6) continue;
    const wordy = r.filter((c) => typeof c === "string" && c.trim() && Number.isNaN(parseNumber(c))).length;
    if (wordy >= w * 0.6) return i;
  }
  return 0;
}

export function tableOf(rows) {
  const h = findHeader(rows);
  const headers = (rows[h] || []).map((x, i) => String(x ?? "").trim() || `Column ${i + 1}`);
  const records = rows.slice(h + 1).filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
  return { headers, records };
}

export function parseNumber(v, decimalComma = false) {
  if (typeof v === "number") return v;
  if (v == null) return NaN;
  let s = String(v).trim();
  if (!s) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1).trim(); }
  if (/-$/.test(s)) { neg = !neg; s = s.slice(0, -1).trim(); } // 25.00- as some statements write it
  s = s.replace(/\s*(lots?|contracts?|shares?|units?)$/i, ""); // 0.10 Lots (cTrader)
  s = s.replace(/^[A-Za-z]{3}\s+/, "").replace(/\s+[A-Za-z]{3}$/, ""); // USD 12.50, 12.50 USD
  s = s.replace(/[$€£¥₹\s '’]/g, "");
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1); }
  else if (s.startsWith("+")) s = s.slice(1);
  s = s.replace(/^[$€£¥₹]/, "");
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1); }
  const comma = s.lastIndexOf(","), dot = s.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    // Both: whichever comes last is the decimal point
    s = comma > dot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (comma >= 0) {
    const thousands = /^\d{1,3}(,\d{3})+$/.test(s) && !decimalComma;
    s = thousands ? s.replace(/,/g, "") : (s.match(/,/g).length === 1 ? s.replace(",", ".") : s.replace(/,/g, ""));
  } else if (dot >= 0 && decimalComma && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  if (!/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return NaN;
  const n = parseFloat(s);
  return neg ? -n : n;
}

export function decodeBytes(buf) {
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(b.subarray(2));
  if (b.length > 8 && b[1] === 0 && b[3] === 0 && b[0] !== 0) return new TextDecoder("utf-16le").decode(b);
  try { return new TextDecoder("utf-8", { fatal: true }).decode(b); } catch { return new TextDecoder("windows-1252").decode(b); }
}

const ENTITIES = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  const k = e.toLowerCase();
  if (ENTITIES[k] != null) return ENTITIES[k];
  if (k.startsWith("#x")) return String.fromCodePoint(parseInt(k.slice(2), 16));
  if (k.startsWith("#")) return String.fromCodePoint(+k.slice(1));
  return m;
});
export const looksLikeHTML = (text) => /<(html|table|tr)\b/i.test(text.slice(0, 4000));
export function htmlRows(html) {
  const rows = [];
  const body = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "");
  for (const tr of body.split(/<tr\b[^>]*>/i).slice(1)) {
    const inner = tr.split(/<\/tr>|<\/table>/i)[0];
    const row = [];
    for (const cell of inner.split(/<t[dh]\b/i).slice(1)) {
      const attrs = cell.slice(0, cell.indexOf(">") + 1);
      const text = decode(cell.slice(attrs.length).split(/<\/t[dh]>/i)[0].replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
      const span = Math.min(50, +(/colspan\s*=\s*["']?(\d+)/i.exec(attrs)?.[1] || 1));
      row.push(text, ...Array(span - 1).fill(""));
    }
    if (row.some((c) => c !== "")) rows.push(row);
  }
  return rows;
}

export function sectionsOf(rows) {
  const out = [];
  let cur = { title: "", rows: [] };
  const filled = (r) => r.filter((c) => String(c ?? "").trim() !== "");
  for (const r of rows) {
    const f = filled(r);
    if (f.length === 1 && typeof f[0] === "string" && Number.isNaN(parseNumber(f[0])) && f[0].length < 60) {
      if (cur.rows.length) out.push(cur);
      cur = { title: f[0].replace(/:$/, ""), rows: [] };
      continue;
    }
    cur.rows.push(r);
  }
  if (cur.rows.length) out.push(cur);
  return out;
}

export function usesDecimalComma(delimiter, records) {
  if (delimiter !== ";") return false;
  let comma = 0, dot = 0;
  for (const r of records.slice(0, 50)) for (const c of r) {
    const s = String(c ?? "").trim();
    if (/^-?[\d.]*\d,\d+$/.test(s)) comma++;
    else if (/^-?[\d,]*\d\.\d+$/.test(s)) dot++;
  }
  return comma > dot;
}
