const LINK = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/gi;

export function linkParts(text = "") {
  const parts = [];
  let last = 0;
  for (const m of String(text).matchAll(LINK)) {
    let u;
    try { u = new URL(m[0]); } catch { continue; }
    if (u.protocol !== "http:" && u.protocol !== "https:") continue;
    if (u.username || u.password || /^https?:\/\/[^/?#]*@/i.test(m[0])) continue; // a disguised address: left as text
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    const rest = `${u.pathname === "/" ? "" : u.pathname}${u.search}${u.hash}`;
    parts.push({ href: u.href, host: u.host, rest });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
