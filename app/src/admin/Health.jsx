import { useEffect, useState } from "react";
import { Icon } from "../components/ui";
import { SubTabs } from "../components/forms";
import { screenshotUrl } from "../live/bugs";
import { rpc, useRpc } from "./api";
import { actionWord, ago, count, plural, when } from "./model";
import { Drawer, St, State, copy, go, useAct } from "./parts";

const TABS = [["bugs", "Bug reports"], ["crashes", "Crashes"], ["cron", "Scheduled jobs"], ["csp", "Security headers"], ["log", "Admin log"]];

export default function Health({ tab = "bugs", open, onChange }) {
  const h = useRpc("admin_health", {}, []);
  const cr = useRpc("admin_crashes", {}, []);
  const crashes = cr.data || [];
  const crashDay = crashes.filter((c) => Date.now() - Date.parse(c.last) < 864e5).length;
  const section = TABS.some(([k]) => k === tab) ? tab : "bugs";
  const d = h.data;
  const cronBad = (d?.cron || []).filter((j) => j.failed_24h > 0 || j.last_status === "failed");
  const cells = d ? [
    { id: "cron", name: "Scheduled jobs", state: cronBad.length ? "bad" : "ok", line: cronBad.length ? `${plural(cronBad.length, "job")} failing` : `All ${d.cron.length} running`, sub: cronBad.length ? cronBad.map((j) => j.name).join(", ") : "Purges and message alerts" },
    { id: "crashes", name: "Crashes", state: crashDay ? "warn" : "ok", line: crashDay ? `${plural(crashDay, "crash", "crashes")} today` : "None today", sub: `${plural(crashes.length, "different crash", "different crashes")} in 30 days` },
    { id: "bugs", name: "Bug reports", state: d.bugs.new ? "warn" : "ok", line: d.bugs.new ? `${count(d.bugs.new)} new` : "Nothing new", sub: `${count(d.bugs.week)} this week · ${count(d.bugs.seen)} being looked at` },
    { id: "csp", name: "Security headers", state: d.csp.day ? "warn" : "ok", line: d.csp.week ? `${plural(d.csp.week, "report")} this week` : "Clean all week", sub: d.csp.week ? `${count(d.csp.day)} in the last 24 h` : "Ready to enforce once it stays clean" },
  ] : [];
  return (
    <div className="view">
      <div className="view-head">
        <div><h1>Health</h1><p>What's failing right now, and what traders and browsers reported.</p></div>
        <div className="actions"><span className="faint xs num">{d ? `Checked ${when(d.at)}` : ""}</span><button type="button" className="btn ghost" onClick={() => { h.reload(); cr.reload(); onChange(); }}><Icon name="bolt" size={14} /> Check again</button></div>
      </div>
      <State q={h}>
        {d && <section className="card hstrip four">{cells.map((c) => (
          <button key={c.id} type="button" className={`hcell ${c.state} ${section === c.id ? "on" : ""}`} onClick={() => go(`health/${c.id}`)}>
            <span className="hname"><i className="hdot" />{c.name}</span><b>{c.line}</b><span className="faint xs">{c.sub}</span>
          </button>
        ))}</section>}
      </State>
      <div className="adm-tabs-row"><SubTabs label="Health" value={section} onChange={(k) => go(`health/${k}`)} items={TABS} /></div>
      {section === "bugs" && <Bugs open={open} onChange={() => { h.reload(); onChange(); }} />}
      {section === "crashes" && <Crashes q={cr} open={open} />}
      {section === "cron" && <Cron rows={d?.cron} />}
      {section === "csp" && <Csp csp={d?.csp} />}
      {section === "log" && <Log />}
    </div>
  );
}

/* ---------- Bug reports ---------- */

const BUG_STATES = [["new", "New"], ["seen", "Looking"], ["fixed", "Fixed"]];

function Bugs({ open, onChange }) {
  const [all, setAll] = useState(false);
  const q = useRpc("admin_bugs", { p_all: all }, [all]);
  const rows = q.data || [];
  const cur = rows.find((b) => b.id === open);
  return (
    <>
      <section className="card flush">
        <div className="tool-row">
          <h3 className="tool-title">From traders</h3>
          <button type="button" className="link" onClick={() => setAll(!all)}>{all ? "Hide fixed" : "Show fixed too"}</button>
        </div>
        <State q={q} empty={q.data && !rows.length ? (all ? "No bug reports yet." : "Every report is fixed.") : null}>
          <div className="ilist">{rows.map((b) => (
            <button key={b.id} type="button" className={`irow ${open === b.id ? "on" : ""}`} onClick={() => go(`health/bugs/${b.id}`)}>
              <span className={`idot ${b.status}`} aria-label={BUG_STATES.find(([k]) => k === b.status)?.[1]} />
              <span className="irow-main"><b>{b.message.length > 120 ? `${b.message.slice(0, 120)}…` : b.message}</b><span className="faint xs num">{b.handle ? `@${b.handle}` : "a deleted account"} · {b.context?.screen || "–"} · {ago(b.created_at)}</span></span>
              {b.screenshot_path && <Icon name="image" size={14} />}
            </button>
          ))}</div>
        </State>
      </section>
      {cur && <Bug key={cur.id} b={cur} onClose={() => go("health/bugs")} onSaved={() => { q.reload(); onChange(); }} />}
    </>
  );
}

function Bug({ b, onClose, onSaved }) {
  const [busy, act] = useAct();
  const [shot, setShot] = useState(null);
  const c = b.context || {};
  useEffect(() => { if (b.screenshot_path) screenshotUrl(b.screenshot_path).then(setShot, () => setShot(false)); }, [b.screenshot_path]);
  const set = (status) => act(status, () => rpc("admin_bug_status", { p_id: b.id, p_status: status }), "Saved").then((v) => v !== undefined && onSaved());
  // Everything someone fixing it needs, as one block of text
  const forFixing = [`Bug report from @${b.handle || "?"} (${when(b.created_at)})`, b.message, b.steps && `Steps: ${b.steps}`,
    `Screen: ${c.screen || "?"} · ${c.viewport || "?"} · build ${c.build || "?"}`, c.browser && `Browser: ${c.browser}`,
    c.errors?.length ? `Errors:\n${c.errors.map((e) => `- [${e.kind}] ${e.text}`).join("\n")}` : null].filter(Boolean).join("\n");
  return (
    <Drawer onClose={onClose} title="Bug report" sub={`${b.handle ? `@${b.handle}` : "A deleted account"} · ${when(b.created_at)}`}
      foot={<>
        <button type="button" className="btn ghost" onClick={() => copy(forFixing, "Copied, ready to paste")}><Icon name="copy" size={14} /> Copy for fixing</button>
        {b.user_id && <button type="button" className="btn ghost" onClick={() => go(`traders/${b.user_id}`)}><Icon name="user" size={14} /> Open trader</button>}
      </>}>
      <div className="segmented bd-status" role="group" aria-label="Status">
        {BUG_STATES.map(([k, l]) => <button key={k} type="button" className={b.status === k ? "on" : ""} aria-pressed={b.status === k} disabled={!!busy} onClick={() => b.status !== k && set(k)}>{l}</button>)}
      </div>
      <p className="bd-steps">{b.message}</p>
      {b.steps && <p className="muted sm">{b.steps}</p>}
      <dl className="dr-list compact">
        <div><dt>Screen</dt><dd>{c.screen || "–"}</dd></div>
        <div><dt>Device</dt><dd className="num">{c.viewport || "–"}{c.pixelRatio ? ` @${c.pixelRatio}x` : ""}{c.theme ? ` · ${c.theme}` : ""}</dd></div>
        <div><dt>Build</dt><dd className="num">{c.build || "–"}</dd></div>
        <div><dt>Browser</dt><dd className="xs">{c.browser || "–"}</dd></div>
      </dl>
      {c.errors?.length > 0 && <pre className="bd-pre">{c.errors.map((e) => `[${e.kind}] ${e.text}`).join("\n")}</pre>}
      {b.screenshot_path && (shot ? <a href={shot} target="_blank" rel="noreferrer" className="bd-shot"><img src={shot} alt="The screenshot sent with this report" /></a>
        : <p className="faint xs">{shot === false ? "Couldn't open the screenshot." : "Opening the screenshot…"}</p>)}
    </Drawer>
  );
}

/* ---------- Crashes ---------- */

// What broke in traders' browsers in the last 30 days, the same crash counted once. Nothing in it names a trader.
function Crashes({ q, open }) {
  const rows = q.data || [];
  const cur = rows.find((c) => c.fingerprint === open);
  return (
    <>
      <section className="card flush">
        <div className="tool-row"><h3 className="tool-title">Crashes</h3><span className="faint xs">The last 30 days. The same crash is counted once, newest first.</span></div>
        <State q={q} empty={q.data && !rows.length ? "No crashes in 30 days." : null}>
          <div className="ilist">{rows.map((c) => (
            <button key={c.fingerprint} type="button" className={`irow ${open === c.fingerprint ? "on" : ""}`} onClick={() => go(`health/crashes/${c.fingerprint}`)}>
              <span className={`idot ${Date.now() - Date.parse(c.last) < 864e5 ? "new" : "seen"}`} aria-hidden="true" />
              <span className="irow-main"><b>{c.message.length > 120 ? `${c.message.slice(0, 120)}…` : c.message}</b>
                <span className="faint xs num">{c.view || c.path || "–"} · {plural(c.n, "time")}, {plural(c.people, "trader")} · last {ago(c.last)}</span></span>
            </button>
          ))}</div>
        </State>
      </section>
      {cur && <Crash c={cur} onClose={() => go("health/crashes")} />}
    </>
  );
}

function Crash({ c, onClose }) {
  const text = [`Crash: ${c.message}`, `Where: ${c.view || "?"} ${c.path || ""}`.trim(), `Kind: ${c.kind}`, `Builds: ${(c.builds || []).join(", ") || "?"}`,
    `Seen ${c.n} times by ${c.people} traders, ${when(c.first)} to ${when(c.last)}`, c.stack && `Stack:\n${c.stack}`].filter(Boolean).join("\n");
  return (
    <Drawer onClose={onClose} title="Crash" sub={`${plural(c.n, "time")} · last ${when(c.last)}`}
      foot={<button type="button" className="btn ghost" onClick={() => copy(text, "Copied, ready to paste")}><Icon name="copy" size={14} /> Copy for fixing</button>}>
      <p className="bd-steps">{c.message}</p>
      <dl className="dr-list compact">
        <div><dt>Where</dt><dd>{c.view || "–"}{c.path ? <span className="faint num">{c.path}</span> : null}</dd></div>
        <div><dt>Builds</dt><dd className="num">{(c.builds || []).join(", ") || "–"}</dd></div>
        <div><dt>Devices</dt><dd>{(c.devices || []).join(", ") || "–"}{c.browsers?.length ? <span className="faint">{c.browsers.join(", ")}</span> : null}</dd></div>
        <div><dt>Seen</dt><dd>{plural(c.people, "trader")}<span className="faint">first {when(c.first)}</span></dd></div>
      </dl>
      {c.stack && <pre className="bd-pre">{c.stack}</pre>}
      <p className="faint xs">A crash in a build older than the live one may already be fixed.</p>
    </Drawer>
  );
}

/* ---------- Scheduled jobs, CSP ---------- */

function Cron({ rows }) {
  if (!rows) return null;
  return (
    <section className="card flush">
      <div className="tool-row"><h3 className="tool-title">Scheduled jobs</h3><span className="faint xs">pg_cron, in the database. Times are UTC.</span></div>
      {!rows.length ? <p className="muted adm-state">No scheduled jobs.</p> : (
        <div className="adm-list">{rows.map((j) => {
          const bad = j.last_status === "failed" || j.failed_24h > 0;
          return (
            <div key={j.name} className="lrow static">
              <span className="lrow-main">
                <b className="num">{j.name} {!j.active && <St tone="faint">Paused</St>}</b>
                <span className="faint xs num">{j.schedule} · ran {plural(j.runs_24h, "time")} in 24 h{j.failed_24h ? `, ${j.failed_24h} failed` : ""}</span>
                {bad && j.last_message && <span className="xs num err">{j.last_message}</span>}
              </span>
              <span className="lrow-end"><St tone={bad ? "solid" : ""}>{j.last_status ? (j.last_status === "succeeded" ? "OK" : j.last_status === "failed" ? "Failed" : j.last_status) : "Not run yet"}</St><span className="xs faint">{j.last_start ? ago(j.last_start) : ""}</span></span>
            </div>
          );
        })}</div>
      )}
    </section>
  );
}

function Csp({ csp }) {
  if (!csp) return null;
  return (
    <section className="card flush">
      <div className="tool-row"><h3 className="tool-title">What the security headers would block</h3><span className="faint xs">The policy only reports for now. A clean week means it can be switched to enforcing. Kept 30 days.</span></div>
      {!csp.top.length ? <p className="muted adm-state">No reports in the last 7 days.</p> : (
        <div className="adm-list">{csp.top.map((r, i) => (
          <div key={i} className="lrow static">
            <span className="lrow-main">
              <b className="num">{r.directive || "?"} · {r.blocked || "inline"}</b>
              <span className="faint xs num">{r.page || ""}{r.source ? ` · ${r.source}` : ""}</span>
              {r.sample && <span className="xs num">{r.sample}</span>}
            </span>
            <span className="lrow-end"><b className="num">×{count(r.n)}</b><span className="xs faint">{ago(r.last)}</span></span>
          </div>
        ))}</div>
      )}
    </section>
  );
}

/* ---------- The admin log ---------- */

function Log() {
  const [rows, setRows] = useState(null);
  const [more, setMore] = useState(true);
  const [error, setError] = useState(null);
  const load = (before = null) => rpc("admin_log_list", { p_before: before }).then((r) => {
    setRows((x) => (before ? [...(x || []), ...r] : r));
    setMore(r.length === 100);
  }, setError);
  useEffect(() => { load(); }, []);
  const q = { data: rows, error, loading: rows === null && !error, reload: () => { setError(null); load(); } };
  return (
    <section className="card flush">
      <div className="tool-row"><h3 className="tool-title">Admin log</h3><span className="faint xs">Every change made here: who, what and when. It can't be edited or deleted.</span></div>
      <State q={q} empty={rows && !rows.length ? "Nothing yet." : null}>
        <div className="adm-list">{(rows || []).map((l) => (
          <div key={l.id} className="lrow static">
            <span className="lrow-main">
              <b>{actionWord(l.action)}</b>
              <span className="faint xs num">{l.target_type ? `${l.target_type} ${String(l.target_id || "").slice(0, 8)}` : ""}{l.detail?.label ? ` · ${l.detail.label}` : ""}{l.detail?.to ? ` · ${l.detail.from} → ${l.detail.to}` : ""}{l.detail?.reason ? ` · “${l.detail.reason}”` : ""}</span>
            </span>
            <span className="lrow-end"><span className="xs faint">{l.by ? `@${l.by}` : ""}</span><span className="xs faint num">{when(l.at)}</span></span>
          </div>
        ))}</div>
        {more && rows?.length > 0 && <div className="table-foot"><button type="button" className="link" onClick={() => load(rows.at(-1).id)}>Older</button></div>}
      </State>
    </section>
  );
}
