import { useEffect, useState } from "react";
import { Card, Icon } from "../components/ui";
import { toast } from "../store";
import { supabase } from "./supabase";

const when = (iso) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const REASON = { scam: "A scam, or asking for money or card details", staff: "Pretending to be Marble staff", selling: "Selling, spam or signals", abuse: "Abuse or harassment", other: "Something else" };

export function TwoStep({ level, onLevel, intro = true }) {
  const [factor, setFactor] = useState(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data }) => { const f = data?.totp?.find((x) => x.status === "verified"); if (f) setFactor({ id: f.id, verified: true }); }).catch(() => {});
  }, []);
  const enrol = async () => {
    setBusy(true);
    try {
      // A half-finished set-up from before is cleared first
      const { data: list } = await supabase.auth.mfa.listFactors();
      for (const f of list?.all || []) if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Marble staff" });
      if (error) throw error;
      setFactor({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    } catch (e) { toast(e?.message || "Couldn't start two-step sign-in. Check it's turned on for the project.", { warn: true }); }
    setBusy(false);
  };
  const verify = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
    setBusy(false);
    if (error) { toast("That code didn't match. Try the newest one.", { warn: true }); return; }
    setCode("");
    setFactor((f) => ({ id: f.id, verified: true }));
    toast("Two-step sign-in verified");
    onLevel();
  };
  if (level === "aal2") return <p className="muted"><Icon name="check" size={14} /> Two-step sign-in is on for this session. You can send as staff and read reports.</p>;
  return (
    <>
      {intro && <p className="muted">Staff send messages and read reports only with two-step sign-in, so a stolen password alone can't speak as Marble.</p>}
      {!factor && <button type="button" className="btn" disabled={busy} onClick={enrol}>Turn on two-step sign-in</button>}
      {factor?.qr && (
        <div className="row" style={{ gap: 16, alignItems: "flex-start", flexWrap: "wrap", marginTop: 8 }}>
          <img src={factor.qr} alt="QR code for your authenticator app" width="160" height="160" style={{ background: "#fff", borderRadius: 8, padding: 6 }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <p className="xs muted">Scan it with an authenticator app (1Password, Google Authenticator, Authy), or enter this key:</p>
            <p className="num" style={{ overflowWrap: "anywhere", fontSize: 12 }}>{factor.secret}</p>
          </div>
        </div>
      )}
      {factor && (
        <form className="row" style={{ gap: 8, marginTop: 10 }} onSubmit={verify}>
          <input className="input" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" aria-label="Code from your authenticator app" style={{ maxWidth: 160 }} />
          <button type="submit" className="btn" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Verify"}</button>
        </form>
      )}
    </>
  );
}

function Report({ r, onDone }) {
  const [busy, setBusy] = useState(null);
  const act = async (action) => {
    setBusy(action);
    const { error } = await supabase.rpc("dm_report_resolve", { p_report: r.id, p_action: action });
    setBusy(null);
    if (error) { toast(error.message || "Couldn't save that.", { warn: true }); return; }
    toast(action === "dismiss" ? "Dismissed" : action === "hide" ? "Those messages are gone" : "Messaging paused for 7 days");
    onDone();
  };
  const p = r.reported || {};
  return (
    <div className="list-row" style={{ alignItems: "flex-start", flexDirection: "column", gap: 8 }}>
      <div style={{ minWidth: 0 }}>
        <b>{REASON[r.reason] || r.reason}</b> <span className="xs muted">· {when(r.at)}{r.from_request ? " · from a message request" : ""}</span>
        <div className="xs muted" style={{ marginTop: 2 }}>
          Reported: <b>{p.handle || "a deleted account"}</b> · joined {when(p.joined)} · {p.requests_7d ?? 0} requests this week · blocked by {p.blocked_by ?? 0} · {p.reports_before ?? 0} earlier reports · by {r.reporter || "a deleted account"}
        </div>
        {r.note && <div className="xs" style={{ marginTop: 4 }}>“{r.note}”</div>}
      </div>
      <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
        {(r.messages || []).map((m) => (
          <li key={m.id} style={{ display: "grid", gridTemplateColumns: "110px minmax(0, 1fr)", gap: 8, fontSize: 13, padding: "4px 6px", borderRadius: 6, background: m.reported ? "rgba(var(--ink), 0.07)" : "none" }}>
            <span className="xs muted" style={{ overflowWrap: "anywhere" }}><b>{m.from}</b> {when(m.at)}</span>
            <span style={{ overflowWrap: "anywhere" }}>{m.body || (m.card ? `[${m.card} card]` : "")}{m.flags?.length ? <span className="xs muted"> · flagged: {m.flags.join(", ")}</span> : null}</span>
          </li>
        ))}
      </ul>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn ghost" disabled={!!busy} onClick={() => act("dismiss")}>{busy === "dismiss" ? "Saving…" : "Dismiss"}</button>
        <button type="button" className="btn ghost" disabled={!!busy || !p.handle} onClick={() => act("hide")}>{busy === "hide" ? "Saving…" : "Delete their messages here"}</button>
        <button type="button" className="btn" disabled={!!busy || !p.handle} onClick={() => act("suspend")}>{busy === "suspend" ? "Saving…" : "Pause their messaging 7 days"}</button>
      </div>
    </div>
  );
}

export default function StaffDesk() {
  const [level, setLevel] = useState(null);
  const [reports, setReports] = useState(null);
  const checkLevel = async () => {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel().catch(() => ({ data: null }));
    setLevel(data?.currentLevel || "aal1");
    return data?.currentLevel;
  };
  const load = async () => {
    const { data, error } = await supabase.rpc("dm_reports_open");
    setReports(error ? { error: error.message } : data || []);
  };
  useEffect(() => { checkLevel().then((l) => { if (l === "aal2") load(); }); }, []);
  const list = Array.isArray(reports) ? reports : [];
  return (
    <div className="grid g12">
      <Card className="c4">
        <h3>Two-step sign-in</h3>
        {level ? <TwoStep level={level} onLevel={async () => { if ((await checkLevel()) === "aal2") load(); }} /> : <p className="muted">Checking…</p>}
      </Card>
      <Card className="c8">
        <h3>Reported messages <span className="caps">{list.length ? `${list.length} open` : ""}</span></h3>
        <p className="xs muted">Only reported messages are ever shown here: the message and up to 10 before it, as the reporter saw them. No other private message can be opened.</p>
        {level && level !== "aal2" && <p className="muted">Verify two-step sign-in to read reports.</p>}
        {level === "aal2" && reports === null && <p className="muted">Loading…</p>}
        {reports?.error && <p className="muted">Couldn't load reports: {reports.error}</p>}
        {Array.isArray(reports) && !list.length && <p className="muted">Nothing reported.</p>}
        <div className="list-rows">{list.map((r) => <Report key={r.id} r={r} onDone={load} />)}</div>
      </Card>
    </div>
  );
}
