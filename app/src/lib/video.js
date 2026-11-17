export function videoTime(v) {
  const s = String(v ?? "").trim();
  if (!s) return { ok: true, value: null };
  if (/^\d+$/.test(s)) return { ok: true, value: s };
  return /^(?:\d+:)?[0-5]?\d:[0-5]\d$/.test(s) ? { ok: true, value: s } : { ok: false };
}

export function videoSeconds(v) {
  const s = String(v ?? "").trim();
  if (!s || !videoTime(s).ok) return null;
  return s.split(":").reduce((a, x) => a * 60 + +x, 0);
}
