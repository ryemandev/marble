// A trader's daily closes. The server keeps them for good (public.closes, one row a day, never changed); this device
// keeps a copy, so a close stands even when the save doesn't reach the server. No imports, so the tests can run it.

export const KEY = "marble-closes";
const OWNER = "marble-closes-by";
const DAY = 864e5;

const shift = (day, by) => new Date(Date.parse(`${day}T12:00:00Z`) + by * DAY).toISOString().slice(0, 10);

// A row from the server, as the app holds a close
export const closeIn = (r) => ({ ...(r.facts || {}), at: Date.parse(r.closed_at) || 0 });

// A close as a row. The server stamps closed_at, and the facts are the plain numbers of the day.
export function closeOut(uid, day, close) {
  const { at, ...facts } = close || {};
  return { user_id: uid, day, facts };
}

export const closesFrom = (rows) => Object.fromEntries((rows || []).map((r) => [r.day, closeIn(r)]));

// The server wins on a day both have: a close stands as it was first made
export const mergeCloses = (server, local) => ({ ...local, ...server });

// The days this device closed that the server doesn't have. The server only takes a close for yesterday, today or
// tomorrow, so anything older stays on this device.
export const unsent = (local, server, today) => {
  const ok = [shift(today, -1), today, shift(today, 1)];
  return Object.keys(local).filter((day) => !server[day] && ok.includes(day)).sort();
};

const read = (store) => { try { return JSON.parse(store.getItem(KEY)) || {}; } catch { return {}; } };

// This device's copy, if it's this trader's. Someone else signed in here last: theirs isn't yours.
export function localCloses(who, store = localStorage) {
  try {
    const by = store.getItem(OWNER);
    return !by || by === who ? read(store) : {};
  } catch { return {}; }
}

export function keepCloses(closes, who, store = localStorage) {
  try {
    store.setItem(KEY, JSON.stringify(closes));
    if (who) store.setItem(OWNER, who);
  } catch {}
}

// A retried close finds its row already there: that's a save, not a failure
export const savedAnyway = (error) => !error || error.code === "23505";
