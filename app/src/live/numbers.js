import { supabase } from "./supabase";

// Member numbers beside names (#1 is Marble's first account). profiles.member_no is only filled while its trader
// shows it, so a hidden number never reaches anyone else. Looked up by handle, a page at a time, and kept for the visit.
const known = new Map();
const key = (h) => (typeof h === "string" ? h.toLowerCase() : "");

export async function numbersFor(handles) {
  const want = [...new Set(handles.map(key).filter((h) => h && !known.has(h)))].slice(0, 200);
  if (want.length) {
    try {
      const { data, error } = await supabase.from("profiles").select("handle, member_no").in("handle", want);
      if (!error) {
        for (const h of want) known.set(h, null);
        for (const r of data || []) known.set(key(r.handle), Number.isInteger(r.member_no) ? r.member_no : null);
      }
    } catch {}
  }
  return (h) => known.get(key(h)) ?? null;
}

// After Profile → "Show my number" changes, so your own name updates at once
export const rememberNumber = (handle, no) => { if (key(handle)) known.set(key(handle), no ?? null); };

// Adds .no to each item's person (picked by `who`), in place; a failed lookup just leaves names without numbers
export async function withNumbers(items, who) {
  const people = items.map(who).filter(Boolean);
  if (!people.length) return items;
  const no = await numbersFor(people.map((p) => p.handle));
  for (const p of people) p.no = p.no ?? no(p.handle);
  return items;
}

// How many days each trader has closed, for the Floor's rail. A failed lookup leaves names standing alone
export async function closedDays(handles) {
  const want = [...new Set(handles.filter(Boolean))].slice(0, 60);
  if (!want.length) return {};
  try {
    const { data, error } = await supabase.rpc("floor_days", { p_handles: want });
    return error ? {} : Object.fromEntries((data || []).map((r) => [r.handle, r.days]));
  } catch { return {}; }
}
