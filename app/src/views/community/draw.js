export async function sha256hex(text) {
  const bytes = new TextEncoder().encode(text);
  const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const listText = (entries) => [...entries].sort((a, b) => a - b).join(",");

export async function drawPicks({ seed, listHash, entries, count, exclude = [] }) {
  const list = [...entries].sort((a, b) => a - b);
  const skip = new Set(exclude);
  const want = Math.min(count, list.filter((e) => !skip.has(e)).length);
  const picks = [];
  for (let n = 1; picks.length < want && n <= 100000; n++) {
    const h = await sha256hex(`${seed}:${listHash}:${n}`);
    const e = list[parseInt(h.slice(0, 13), 16) % list.length];
    if (!skip.has(e) && !picks.includes(e)) picks.push(e);
  }
  return picks;
}

export async function verifyDraw({ sealed, draws }) {
  const checks = [];
  const earlier = [];
  for (const d of draws || []) {
    const seedOk = (await sha256hex(d.seed)) === sealed;
    const listOk = (await sha256hex(listText(d.entries))) === d.list_hash;
    const picks = await drawPicks({ seed: d.seed, listHash: d.list_hash, entries: d.entries, count: d.picks.length, exclude: earlier });
    const picksOk = picks.length === d.picks.length && picks.every((p, i) => p === d.picks[i]);
    checks.push({ label: `Round ${d.round}: the secret matches the sealed code`, ok: seedOk });
    checks.push({ label: `Round ${d.round}: the entry list matches its fingerprint`, ok: listOk });
    checks.push({ label: `Round ${d.round}: the winning numbers follow from both`, ok: picksOk });
    earlier.push(...d.picks);
  }
  return { ok: checks.length > 0 && checks.every((c) => c.ok), checks };
}
