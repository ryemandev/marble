import { Icon } from "../components/ui";
import { Columns } from "../components/charts";
import { useRpc } from "./api";
import { STEPS, ago, count, gbp, plural, share } from "./model";
import { Who, go } from "./parts";
import { lastActive } from "./Users";
import Costs from "./Costs";

const HEARD = { x: "X", youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram", reddit: "Reddit", discord: "Discord", google: "Google", friend: "A friend" };
const heardShort = (v) => (!v ? "Didn't say" : HEARD[v] || (v.startsWith("other:") ? v.slice(6).trim() || "Other" : v));

// Who opens the app, from the days it notes (Users → Activity has the rest)
function Active() {
  const a = useRpc("admin_activity", {}, []);
  const d = a.data;
  if (!d) return null;
  return (
    <section className="card hstrip">
      {[["Active today", d.dau], ["This week", d.wau], ["This month", d.mau]].map(([name, n]) => (
        <button key={name} type="button" className="hcell ok" onClick={() => go("users/activity")}>
          <span className="hname">{name}</span><b className="num">{count(n)}</b>
          <span className="faint xs">{plural(n, "trader")} opened the app</span>
        </button>
      ))}
    </section>
  );
}

// Week i of n ends (n - 1 - i) weeks before today
const weekEnd = (i, n) => new Date(Date.now() - (n - 1 - i) * 7 * 864e5).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

function Delta({ now, before }) {
  const d = (now || 0) - (before || 0);
  if (!d) return <span className="delta good">Same as the week before</span>;
  return <span className={`delta ${d > 0 ? "good" : "bad"}`}><span aria-hidden="true">{d > 0 ? "↑" : "↓"}</span> {count(Math.abs(d))} on the week before's {count(before)}</span>;
}

// How far traders get: every account, then each step a new trader takes
function Funnel({ f }) {
  const steps = [["accounts", "Signed up"], ...STEPS];
  return (
    <section className="card td-funnel" aria-label="How far traders get">
      <h3>How far traders get <span className="caps">Everyone, all time</span></h3>
      <ol className="td-steps">
        {steps.map(([k, label], i) => {
          const n = f?.[k] || 0;
          const of = share(n, f?.accounts);
          return (
            <li key={k} className="td-step">
              <span className="td-step-n num">{count(n)}</span>
              <span className="td-step-label">{label}</span>
              <span className="td-bar" aria-hidden="true"><i style={{ width: `${(of ?? 0) * 100}%` }} /></span>
              <span className="faint xs num">{i === 0 ? "accounts" : of == null ? "–" : `${Math.round(of * 100)}% of accounts`}</span>
            </li>
          );
        })}
      </ol>
      <p className="faint xs">Steps only: never what anyone traded or made. "Came back" is opening the app on a later day than the one they joined.</p>
    </section>
  );
}

function Newest({ rows }) {
  return (
    <section className="card flush">
      <div className="tool-row"><h3 className="tool-title">Newest traders</h3><span className="faint xs">The last {rows.length}, and how far each has got</span></div>
      {rows.length ? (
        <div className="adm-list">{rows.map((r) => (
          <button key={r.id} type="button" className="lrow td-row" onClick={() => go(`users/${r.id}`)}>
            <span className="lrow-main"><Who handle={r.handle} avatar={r.avatar} sub={`joined ${ago(r.joined)} · ${heardShort(r.heard)}`} size={34} /></span>
            <span className="td-ticks" aria-label={STEPS.map(([k, l]) => `${l}: ${r[k] ? "yes" : "not yet"}`).join(", ")}>
              {STEPS.map(([k, l]) => <span key={k} className={`td-tick ${r[k] ? "on" : ""}`} title={l}>{r[k] ? <Icon name="check" size={12} /> : null}</span>)}
            </span>
            <span className="lrow-end hide-sm"><span className="xs faint">{r.admin ? "You" : r.last_active ? `Opened ${lastActive(r.last_active)}` : "Not opened yet"}</span></span>
          </button>
        ))}</div>
      ) : <p className="muted adm-state">No traders yet.</p>}
      <p className="faint xs td-key">Ticks, left to right: {STEPS.map(([, l]) => l.toLowerCase()).join(", ")}.</p>
    </section>
  );
}

export default function Overview({ o, onReload, open }) {
  const t = useRpc("admin_today", {}, []);
  const d = t.data;
  const reload = () => { onReload(); t.reload(); };
  const head = (
    <div className="view-head">
      <div>
        <div className="kicker">{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} · live</div>
        <h1>Today</h1>
        <p>What needs you, and how far traders get. "This week" is the last 7 days.</p>
      </div>
      <div className="actions"><button type="button" className="btn ghost" onClick={reload}><Icon name="bolt" size={14} /> Refresh</button></div>
    </div>
  );
  if (!o) return <div className="view">{head}<p className="muted adm-state">Loading…</p></div>;

  const n = o.needs || {};
  const needs = [
    n.reports + n.dm_reports > 0 && { to: "reports", big: count(n.reports + n.dm_reports), text: `reported ${n.reports + n.dm_reports === 1 ? "item" : "items"}${n.dm_reports ? `, ${n.dm_reports} private` : ""}` },
    n.ideas > 0 && { to: "floor/ideas", big: count(n.ideas), text: `new idea${n.ideas === 1 ? "" : "s"} to answer` },
    n.bugs > 0 && { to: "health/bugs", big: count(n.bugs), text: `new bug report${n.bugs === 1 ? "" : "s"}` },
    n.crashes > 0 && { to: "health/crashes", big: count(n.crashes), text: `crash${n.crashes === 1 ? "" : "es"} in the last day` },
    n.cron_failed > 0 && { to: "health/cron", big: count(n.cron_failed), text: `scheduled job${n.cron_failed === 1 ? "" : "s"} failed today` },
    n.csp_day > 0 && { to: "health/csp", big: count(n.csp_day), text: "security-header reports today" },
  ].filter(Boolean);
  const weeks = o.signups?.weeks || [];
  const mail = d?.emails;

  return (
    <div className="view">
      {head}

      <section className="card needs" aria-label="Needs you">
        <span className="needs-title caps">Needs you</span>
        {needs.length ? (
          <div className="needs-row" style={{ "--cells": Math.max(needs.length, 3) }}>
            {needs.map((x) => (
              <button key={x.text} type="button" className="need" onClick={() => go(x.to)}>
                <span className="need-top"><b className="num">{x.big}</b><Icon name="chevR" size={14} /></span><span className="need-text">{x.text}</span>
              </button>
            ))}
          </div>
        ) : <p className="needs-none muted">Nothing is waiting on you.</p>}
      </section>

      {d && <Funnel f={d.funnel} />}

      <Active />

      <div className="grid g12">
        <div className="c8 td-col">{d && <Newest rows={d.recent || []} />}</div>
        <div className="c4 td-col">
          <section className="card kpi">
            <span className="k-label">Traders</span>
            <span className="k-value num">{count(o.traders)}</span>
            <Delta now={o.signups?.week} before={o.signups?.prev} />
            <span className="k-sub">{plural(o.signups?.week || 0, "new account")} this week</span>
          </section>
          {d && (
            <button type="button" className="card kpi td-link" onClick={() => go("overview/costs")}>
              <span className="k-label">Running costs</span>
              <span className="k-value num">{gbp(d.costs.month_pence, 2)}</span>
              <span className="k-sub">{d.costs.items ? `a month, ${plural(d.costs.items, "cost")}` : "Nothing added yet"} · <u>{d.costs.items ? "See and change" : "Add what Marble pays for"}</u></span>
            </button>
          )}
          {mail && (
            <section className="card kpi">
              <span className="k-label">Welcome emails</span>
              <span className="k-value num">{count(mail.welcome_7d)} <span className="faint k-of">of {count(mail.signups_7d)}</span></span>
              <span className="k-sub">{mail.signups_7d && mail.welcome_7d < mail.signups_7d ? "Some new traders didn't get one this week" : "Sent to every new trader this week"}</span>
            </section>
          )}
          {d && (
            <button type="button" className="card kpi td-link" onClick={() => go("health/crashes")}>
              <span className="k-label">Crashes</span>
              <span className="k-value num">{count(d.crashes.week)}</span>
              <span className="k-sub">{d.crashes.week ? <>{d.crashes.week === 1 ? "crash" : "different crashes"} this week, {count(d.crashes.day)} today · <u>See them</u></> : "None this week"}</span>
            </button>
          )}
        </div>
      </div>

      <section className="card">
        <h3>New accounts <span className="caps">13 weeks</span></h3>
        {weeks.some((v) => v > 0)
          ? <Columns items={weeks.map((v, i) => ({ key: i, value: v, label: weekEnd(i, weeks.length), title: `Week to ${weekEnd(i, weeks.length)}` }))}
              height={200} format={(v) => plural(v, "account")} axisFormat={(v) => count(v)} toneOf={() => "win"} label="New accounts each week for 13 weeks" />
          : <p className="muted adm-state">No sign-ups in the last 13 weeks.</p>}
      </section>

      {open === "costs" && <Costs onClose={() => go("overview")} onChanged={t.reload} />}
    </div>
  );
}
