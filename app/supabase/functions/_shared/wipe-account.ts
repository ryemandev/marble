// Removes a trader completely: every file they stored, their card pictures, their broker links and then the account,
// which takes every row that belongs to it with it. The same steps as delete-account, which a trader runs on themselves.
// Keep BUCKETS the same in both (tests/admin-account.test.js checks it).

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
export const BUCKETS = ["avatars", "screenshots", "community", "bug-reports", "study", "backdrops"];

async function allFiles(bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${URL_}/storage/v1/object/list/${bucket}`, { method: "POST", headers: admin, body: JSON.stringify({ prefix, limit: 1000, offset }) });
    if (r.status === 400 || r.status === 404) break;
    if (!r.ok) throw new Error(`storage list ${bucket} ${r.status}`);
    const items = await r.json();
    if (!Array.isArray(items) || !items.length) break;
    for (const it of items) {
      const path = `${prefix}/${it.name}`;
      if (it.id == null) out.push(...(await allFiles(bucket, path))); // a folder
      else out.push(path);
    }
    if (items.length < 1000) break;
  }
  return out;
}

export async function wipeAccount(id: string): Promise<void> {
  for (const bucket of BUCKETS) {
    const files = await allFiles(bucket, id);
    for (let i = 0; i < files.length; i += 500) {
      const gone = await fetch(`${URL_}/storage/v1/object/${bucket}`, { method: "DELETE", headers: admin, body: JSON.stringify({ prefixes: files.slice(i, i + 500) }) });
      if (!gone.ok) throw new Error(`storage delete ${bucket} ${gone.status}`);
    }
  }
  // Card pictures sit outside the trader's folder so their addresses don't carry a trader's id
  const cards = await fetch(`${URL_}/rest/v1/card_links?user_id=eq.${id}&select=id`, { headers: admin });
  if (!cards.ok) throw new Error(`card links ${cards.status}`);
  const pictures = ((await cards.json()) as { id: string }[]).map((c) => `${c.id}.jpg`);
  for (let i = 0; i < pictures.length; i += 500) {
    const gone = await fetch(`${URL_}/storage/v1/object/cards`, { method: "DELETE", headers: admin, body: JSON.stringify({ prefixes: pictures.slice(i, i + 500) }) });
    if (!gone.ok) throw new Error(`storage delete cards ${gone.status}`);
  }
  const links = await fetch(`${URL_}/rest/v1/connections?user_id=eq.${id}`, { method: "DELETE", headers: admin });
  if (!links.ok) throw new Error(`connections delete ${links.status}`);
  const del = await fetch(`${URL_}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: admin });
  if (!del.ok) throw new Error(`auth delete ${del.status}`);
}
