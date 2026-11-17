const DB = "marble-study", STORE = "photos";
const mem = new Map();
let dbP = null;

function open() {
  if (dbP) return dbP;
  dbP = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbP;
}
const run = async (mode, fn) => {
  const db = await open();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = tx.onabort = () => resolve(undefined);
    } catch { resolve(undefined); }
  });
};

export const lasting = async () => !!(await open());
export async function putBlob(path, blob) { mem.set(path, blob); await run("readwrite", (s) => s.put(blob, path)); }
export async function getBlob(path) { return mem.get(path) || (await run("readonly", (s) => s.get(path))) || null; }
export async function delBlob(path) { mem.delete(path); await run("readwrite", (s) => s.delete(path)); }
