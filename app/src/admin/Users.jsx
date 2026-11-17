import { useEffect, useState } from "react";
import { Icon } from "../components/ui";
import { Columns } from "../components/charts";
import { Choice, SubTabs } from "../components/forms";
import { accountAction, rpc, useRpc } from "./api";
import { FILTER_HINT, USER_FILTERS, USER_SORTS, ago, count, day, pct, plural, share } from "./model";
import { Drawer, St, State, Who, copy, go, useAct } from "./parts";

const HEARD = { x: "X/Twitter", youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram", reddit: "Reddit", discord: "Discord", google: "Google search", friend: "A friend" };
const heard = (v) => (!v ? "Not answered" : HEARD[v] || (v.startsWith("other:") ? `Other: ${v.slice(6).trim()}` : v));
const PROVIDER = { email: "an email link", google: "Google", discord: "Discord", apple: "Apple" };
const UUID = /^[0-9a-f-]{36}$/;
// A UTC day ("2026-11-02") as today, yesterday, n days ago or the date
export function lastActive(d, now = Date.now()) {
  if (!d) return "never";
  const n = Math.round((Date.parse(new Date(now).toISOString().slice(0, 10)) - Date.parse(d)) / 864e5);
  return n <= 0 ? "today" : n === 1 ? "yesterday" : n < 14 ? `${n} days ago` : day(d);
}

export default function Users({ tab, query, onQuery }) {
  const open = UUID.test(tab || "") ? tab : null;
  const [rev, setRev] = useState(0); // a deleted account leaves the list
  const section = tab === "activity" ? "activity" : "people";
  return (
    <div className="view">
      <div className="view-head">
        <div><h1>Users</h1><p>Everyone with a Marble account: when they last opened the app and how they found it. Never their journal.</p></div>
        <SubTabs label="Users" value={section} onChange={(k) => go(k === "people" ? "users" : "users/activity")} items={[["people", "People"], ["activity", "Activity"]]} />
      </div>
      {section === "people" ? <People open={open} query={query} onQuery={onQuery} rev={rev} /> : <Activity />}
      {open && <Trader id={open} onClose={() => go("users")} onGone={() => { setRev((n) => n + 1); go("users"); }} />}
    </div>
  );
}

/* ---------- People ---------- */

function People({ open, query, onQuery, rev = 0 }) {
  const [q, setQ] = useState(query || "");
  const [asked, setAsked] = useState(query || "");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("joined");
  const [pages, setPages] = useState(1);
  // Asks again a moment after typing stops
  useEffect(() => { const t = setTimeout(() => setAsked(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  useEffect(() => { setQ(query || ""); }, [query]);
  useEffect(() => { setPages(1); }, [asked, filter, sort]);
  const list = useRpc("admin_users", { p_query: asked, p_filter: filter, p_sort: sort, p_offset: 0 }, [asked, filter, sort, rev]);
  const [more, setMore] = useState([]);
  const [busy, run] = useAct();
  useEffect(() => { setMore([]); }, [list.data]);
  const rows = [...(list.data?.rows || []), ...more];
  const matched = list.data?.matched || 0;
  const loadMore = () => run("more", async () => {
    const next = await rpc("admin_users", { p_query: asked, p_filter: filter, p_sort: sort, p_offset: pages * 100 });
    setMore((m) => [...m, ...(next?.rows || [])]);
    setPages((p) => p + 1);
  });
  return (
    <section className="card flush">
      <div className="tool-row">
        <label className="search grow">
          <Icon name="search" size={15} />
          <input value={q} onChange={(e) => { setQ(e.target.value); onQuery(e.target.value); }} placeholder="Handle, name, email or #number" aria-label="Search users" autoFocus={!!query} />
        </label>
        <label className="adm-select">
          <span className="sr-only">Sort</span>
          <select className="input" value={sort} onChange={(e) => setSort(e.target.value)}>{USER_SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
      </div>
      <div className="tool-row">
        <Choice label="Show" value={filter} onChange={setFilter} options={USER_FILTERS} />
      </div>
      <div className="tool-row thin">
        <span className="faint xs">
          {list.data ? `${plural(matched, "person", "people")}${filter !== "all" || asked ? ` of ${count(list.data.total)}` : ""}` : ""}
          {FILTER_HINT[filter] ? ` · ${FILTER_HINT[filter]}` : ""}
        </span>
      </div>
      <State q={list} empty={!list.loading && !rows.length ? (asked ? `Nobody matches "${asked}".` : "Nobody here yet.") : null}>
        <table className="table adm-table hide-phone">
          <thead><tr><th>Trader</th><th>Last active</th><th className="r">Trades</th><th>Found Marble</th><th>Joined</th></tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} onClick={() => go(`users/${t.id}`)} className={open === t.id ? "sel" : ""}>
                <td><Who handle={t.handle} name={t.name} avatar={t.avatar} no={t.no} sub={t.email} /></td>
                <td className="muted">{lastActive(t.last_active)}</td>
                <td className="num r">{count(t.trades)}</td>
                <td className="muted">{heard(t.heard_from)}</td>
                <td className="muted num">{day(t.joined)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="adm-list show-phone">
          {rows.map((t) => (
            <button key={t.id} type="button" className="lrow" onClick={() => go(`users/${t.id}`)}>
              <span className="lrow-main"><b>{t.name || `@${t.handle}`}</b><span className="faint num">{t.no ? `#${t.no} · ` : ""}@{t.handle} · {count(t.trades)} trades</span></span>
              <span className="lrow-end"><span className="xs faint">{lastActive(t.last_active)}</span></span>
            </button>
          ))}
        </div>
        {rows.length < matched && (
          <div className="table-foot"><button type="button" className="btn ghost" disabled={busy === "more"} onClick={loadMore}>{busy === "more" ? "Loading…" : `Show the next ${Math.min(100, matched - rows.length)}`}</button></div>
        )}
      </State>
    </section>
  );
}

/* ---------- Activity ---------- */

const dayLabel = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const Ret = ({ v }) => (v == null ? <span className="faint">–</span> : <span className="num">{pct(v)}</span>);

function Activity() {
  const a = useRpc("admin_activity", {}, []);
  const d = a.data;
  const days = d?.days || [];
  const heardRows = d ? Object.entries(d.heard).sort((x, y) => y[1] - x[1]) : [];
  const heardTotal = heardRows.reduce((s, [, n]) => s + n, 0);
  const u = d?.use || {};
  return (
    <State q={a}>
      {d && <>
        <div className="grid g12">
          {[
            ["Active today", d.dau, "Opened the app today (UTC)"],
            ["Active this week", d.wau, "In the last 7 days"],
            ["Active this month", d.mau, `In the last 30 days · ${u.traders ? pct(d.mau / u.traders) : "0%"} of everyone`],
            ["Stickiness", d.mau ? d.dau / d.mau : 0, "Today's actives ÷ this month's", true],
          ].map(([label, v, sub, isPct]) => (
            <section key={label} className="card c3 kpi">
              <span className="k-label">{label}</span>
              <span className="k-value num">{isPct ? pct(v) : count(v)}</span>
              <span className="k-sub">{sub}</span>
            </section>
          ))}
        </div>
        {d.since && <p className="faint xs adm-note">Counting since {day(d.since)}, when the app started noting the days people open it.</p>}

        <div className="grid g12">
          <section className="card c6">
            <h3>Active traders <span className="caps">30 days</span></h3>
            <Columns items={days.map((x) => ({ key: x.day, value: x.active, label: dayLabel(x.day), title: dayLabel(x.day) }))}
              height={180} format={(v) => plural(v, "trader")} axisFormat={(v) => count(v)} toneOf={() => "win"} labelAll={false} label="Traders who opened the app each day for 30 days" />
          </section>
          <section className="card c6">
            <h3>New accounts <span className="caps">30 days</span></h3>
            <Columns items={days.map((x) => ({ key: x.day, value: x.signups, label: dayLabel(x.day), title: dayLabel(x.day) }))}
              height={180} format={(v) => plural(v, "account")} axisFormat={(v) => count(v)} toneOf={() => "win"} labelAll={false} label="New accounts each day for 30 days" />
          </section>
        </div>

        <div className="grid g12">
          <section className="card c7 flush">
            <div className="tool-row"><h3 className="tool-title">Do they come back?</h3><span className="faint xs">Of each week's new accounts, the share who opened the app in a later week</span></div>
            {d.cohorts?.length ? (
              <div className="adm-scroll-x">
                <table className="table adm-table compact">
                  <thead><tr><th>Week starting</th><th className="r">New</th><th className="r">Next week</th><th className="r">2 weeks on</th><th className="r">4 weeks on</th></tr></thead>
                  <tbody>{d.cohorts.map((c) => (
                    <tr key={c.week}><td className="num">{day(c.week)}</td><td className="num r">{count(c.size)}</td>
                      <td className="r"><Ret v={share(c.w1, c.size)} /></td><td className="r"><Ret v={share(c.w2, c.size)} /></td><td className="r"><Ret v={share(c.w4, c.size)} /></td></tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <p className="muted adm-state">No new accounts in the last 9 weeks.</p>}
          </section>
          <section className="card c5">
            <h3>How they found Marble</h3>
            <div className="bars">
              {heardRows.map(([k, n]) => (
                <div key={k} className="bar-row">
                  <span className="bar-name">{k === "none" ? "Didn't say" : k === "other" ? "Other" : HEARD[k] || k}</span>
                  <span className="bar-track"><i style={{ width: `${heardTotal ? (n / heardTotal) * 100 : 0}%` }} /></span>
                  <span className="num bar-n">{count(n)}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="card">
          <h3>What they use <span className="caps">Everyone, all time unless it says</span></h3>
          <dl className="facts wide">
            <div><dt>Have logged a trade</dt><dd className="num">{count(u.with_trades)} <span className="faint">of {count(u.traders)}</span></dd></div>
            <div><dt>Trades logged</dt><dd className="num">{count(u.trades)} <span className="faint">· {count(u.trades_7d)} this week</span></dd></div>
            <div><dt>Imported a file</dt><dd className="num">{plural(u.imported, "trader")}</dd></div>
            <div><dt>Phone alerts on</dt><dd className="num">{plural(u.push, "trader")}</dd></div>
            <div><dt>Posted in 30 days</dt><dd className="num">{plural(u.posted_30d, "trader")}</dd></div>
            <div><dt>Use Study</dt><dd className="num">{plural(u.study, "trader")}</dd></div>
          </dl>
        </section>
      </>}
    </State>
  );
}

/* ---------- One trader ---------- */

function Trader({ id, onClose, onGone }) {
  const t = useRpc("admin_trader", { p_user: id }, [id]);
  const d = t.data;
  const [busy, act] = useAct();
  const [sure, setSure] = useState(false); // suspend waits for a second tap
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState("");
  useEffect(() => { if (!sure) return undefined; const x = setTimeout(() => setSure(false), 4000); return () => clearTimeout(x); }, [sure]);
  const suspended = !!d?.suspended_until;
  const suspend = () => {
    if (!suspended && !sure) { setSure(true); return; }
    setSure(false);
    act("suspend", () => accountAction(suspended ? "unsuspend" : "suspend", id), suspended ? "Suspension lifted. They can sign in again." : "Suspended. They can't sign in.")
      .then((v) => { if (v !== undefined) t.reload(); });
  };
  const matches = !!d && typed.trim().replace(/^@/, "").toLowerCase() === String(d.handle).toLowerCase();
  const remove = () => act("delete", () => accountAction("delete", id, typed), `Deleted ${d.handle}'s account`)
    .then((v) => { if (v !== undefined) onGone(); });
  return (
    <Drawer onClose={onClose} label="Trader"
      title={d ? <div className="dr-who"><Who handle={d.handle} name={d.name} avatar={d.avatar} no={d.no} size={48} /></div> : <h2>Trader</h2>}
      foot={d && <>
        <button type="button" className="btn ghost" onClick={() => copy(d.email, "Email copied")}><Icon name="copy" size={14} /> Copy email</button>
        {!d.admin && <>
          <span className="spacer" />
          <button type="button" className={`btn ${suspended ? "ghost" : "danger"}`} disabled={!!busy} onClick={suspend}>
            {busy === "suspend" ? "Saving…" : suspended ? "Lift suspension" : sure ? "Tap again to suspend" : "Suspend"}
          </button>
          {!deleting && <button type="button" className="btn danger" disabled={!!busy} onClick={() => setDeleting(true)}>Delete account</button>}
        </>}
      </>}>
      <State q={t}>
        {d && <>
          {(d.staff || d.admin || suspended) && (
            <div className="dr-chips">
              {suspended && <St tone="solid">Suspended</St>}
              {d.staff && <St tone="ink">Staff</St>}
              {d.admin && <St tone="ink">Admin</St>}
            </div>
          )}
          {deleting && (
            <section className="dr-danger" aria-label="Delete this account">
              <h3>Delete {d.handle}'s account?</h3>
              <p>This removes their sign-in, journal, notes, posts, messages, cards and every file they stored. It can't be undone. Marble doesn't email them about it.</p>
              <label className="dr-danger-field">
                <span>Type <b>{d.handle}</b> to confirm</span>
                <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} aria-label={`Type ${d.handle} to confirm`} />
              </label>
              <div className="dr-danger-acts">
                <button type="button" className="btn ghost" disabled={busy === "delete"} onClick={() => { setDeleting(false); setTyped(""); }}>Keep it</button>
                <button type="button" className="btn danger-solid" disabled={!matches || !!busy} onClick={remove}>{busy === "delete" ? "Deleting…" : "Delete for good"}</button>
              </div>
            </section>
          )}
          <dl className="dr-list">
            <div><dt>Email</dt><dd><span className="num">{d.email || "None"}</span>{d.email && !d.email_confirmed && <span className="faint">not confirmed</span>}</dd></div>
            {suspended && <div><dt>Suspended</dt><dd>Can't sign in.<span className="faint">Anything they have open stops working within the hour.</span></dd></div>}
            <div><dt>Joined</dt><dd>{day(d.joined)} · signed in {ago(d.last_seen)}{d.providers?.length ? <span className="faint">with {d.providers.map((p) => PROVIDER[p] || p).join(", ")}</span> : null}{d.no && d.show_number === false ? <span className="faint">Hides #{d.no} from other traders</span> : null}</dd></div>
            <div><dt>Active</dt><dd>{d.last_active ? `Last opened the app ${lastActive(d.last_active)}` : "Hasn't opened the app since counting began"}<span className="faint">{plural(d.active_30, "day")} in the last 30</span></dd></div>
            <div><dt>Found Marble</dt><dd>{heard(d.heard_from)}</dd></div>
            <div><dt>Journal</dt><dd className="num">{plural(d.journal.trades, "trade")} · {plural(d.journal.accounts, "account")} · {plural(d.journal.imports, "import")}</dd></div>
            <div><dt>Community</dt><dd>
              {plural(d.community.posts, "post")}{d.community.hidden ? ` (${count(d.community.hidden)} hidden)` : ""} · {count(d.community.chat_30d)} chat messages in 30 days{d.crew ? ` · ${d.crew}` : ""}
              <span className="faint">Reported {d.community.reported ? plural(d.community.reported, "time") : "never"} · made {plural(d.community.reports_made, "report")}{d.community.dm_paused_until ? ` · messaging paused until ${day(d.community.dm_paused_until)}` : ""}</span>
            </dd></div>
            <div><dt>Events</dt><dd>{plural(d.events.competitions, "competition")} · {plural(d.events.giveaways, "draw")} entered</dd></div>
            <div><dt>News emails</dt><dd>{d.news ? "Said yes" : "No"}</dd></div>
          </dl>
        </>}
      </State>
    </Drawer>
  );
}
