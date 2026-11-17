import { NOTEBOOK_COLUMNS, PAGE_COLUMNS, mergeRow, notebookIn, notebookOut, pageIn, pageOut } from "./rows";

const COLUMNS = { notebooks: NOTEBOOK_COLUMNS, pages: PAGE_COLUMNS };
export const canon = (table, r) => (table === "pages" ? pageOut(pageIn(r)) : notebookOut(notebookIn(r)));
export const baseOf = (table, r) => ({ at: r.updated_at, row: canon(table, r) });
const columns = ({ id, ...rest }) => rest;
async function rows(q) {
  const r = await q;
  if (r.error) throw Object.assign(new Error(r.error.message || "Couldn't save"), { code: r.error.code, status: r.status });
  return r.data;
}
const firstRow = (o) => ({ ...o.row, created_at: o.createdAt && !Number.isNaN(Date.parse(o.createdAt)) ? o.createdAt : o.at });

export function createSaver({ db, bases, onMerged }) {
  async function put(table, list) {
    const out = new Map();
    const fresh = list.filter((o) => !o.base);
    if (fresh.length) {
      for (const r of await rows(db.from(table).upsert(fresh.map(firstRow)).select(COLUMNS[table]))) {
        const b = baseOf(table, r);
        bases().set(`${table}:${r.id}`, b);
        out.set(r.id, b);
      }
    }
    for (const o of list) if (o.base) { const b = await over(table, o); if (b) out.set(o.row.id, b); }
    return out;
  }

  async function over(table, o) {
    const k = `${table}:${o.row.id}`;
    let at = o.base.at, merged = null;
    for (let i = 0; i < 3; i++) {
      const wrote = await rows(db.from(table).update(columns(merged || o.row)).eq("id", o.row.id).eq("updated_at", at).select(COLUMNS[table]));
      if (wrote.length) {
        const b = baseOf(table, wrote[0]);
        bases().set(k, b);
        if (!merged) return b;
        onMerged?.(table, o, wrote[0]);
        return null;
      }
      const cur = await rows(db.from(table).select(COLUMNS[table]).eq("id", o.row.id).maybeSingle());
      if (!cur) {
        const [back] = await rows(db.from(table).upsert([firstRow(o)]).select(COLUMNS[table]));
        const b = baseOf(table, back);
        bases().set(k, b);
        return b;
      }
      if (cur.updated_at === at) throw Object.assign(new Error("Not saved: no plan"), { code: "42501" });
      merged = mergeRow(canon(table, cur), o.row, o.base.row ?? null);
      at = cur.updated_at;
    }
    throw Object.assign(new Error("Changed while saving"), { status: 409 });
  }

  async function patch(table, list) {
    const out = new Map();
    for (const o of list) {
      if (o.base) {
        const wrote = await rows(db.from(table).update(o.cols).eq("id", o.id).eq("updated_at", o.base.at).select("id, updated_at"));
        if (wrote.length) {
          const b = { at: wrote[0].updated_at, row: { ...o.base.row, ...o.cols } };
          bases().set(`${table}:${o.id}`, b);
          out.set(o.id, b);
          continue;
        }
      }
      await rows(db.from(table).update(o.cols).eq("id", o.id).select("id"));
    }
    return out;
  }

  async function del(table, ids) {
    await rows(db.from(table).delete().in("id", ids));
    ids.forEach((x) => bases().delete(`${table}:${x}`));
  }

  return { put, patch, del };
}
