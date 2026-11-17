import { useEffect, useState } from "react";
import { Card, Icon } from "../components/ui";
import { toast } from "../store";
import { supabase } from "./supabase";

// A code from an authenticator app on top of the sign-in email. The database holds a signed-in trader who has this on
// to the code too (two_step_ok()), so the code is more than a screen.
const NAME = "Marble";

export function TwoStepSetting() {
  const [factor, setFactor] = useState(undefined);
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(null);
  const [sure, setSure] = useState(false);

  const look = () => supabase.auth.mfa.listFactors()
    .then(({ data }) => setFactor(data?.totp?.find((f) => f.status === "verified") || null))
    .catch(() => setFactor(null));
  useEffect(() => { look(); }, []);

  const begin = async () => {
    setBusy("start");
    try {
      // A half-finished set-up from before is cleared first
      const { data: list } = await supabase.auth.mfa.listFactors();
      for (const f of list?.all || []) if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: NAME });
      if (error) throw error;
      setSetup({ id: data.id, qr: data.totp.qr_code, key: data.totp.secret });
    } catch { toast("Couldn't start that. Try again.", { warn: true }); }
    setBusy(null);
  };
  const finish = async (e) => {
    e.preventDefault();
    if (code.length !== 6) return;
    setBusy("verify");
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: setup.id, code });
    setBusy(null);
    if (error) { toast("That code didn't match. Try the newest one.", { warn: true }); return; }
    setCode(""); setSetup(null);
    await look();
    toast("Two-step sign-in is on");
  };
  const cancel = async () => {
    const id = setup.id;
    setSetup(null); setCode("");
    await supabase.auth.mfa.unenroll({ factorId: id }).catch(() => {});
  };
  const off = async () => {
    if (!sure) { setSure(true); setTimeout(() => setSure(false), 4000); return; }
    setBusy("off");
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    setBusy(null); setSure(false);
    if (error) { toast("Couldn't turn it off. Sign in again, then try.", { warn: true }); return; }
    await supabase.auth.refreshSession().catch(() => {});
    await look();
    toast("Two-step sign-in is off");
  };
  const everywhere = async () => {
    setBusy("out");
    const { error } = await supabase.auth.signOut({ scope: "global" });
    setBusy(null);
    if (error) toast("Couldn't reach Marble. Try again.", { warn: true });
  };

  return (
    <div className="grid g12">
      <Card className="c7 ts-card">
        <h3>Two-step sign-in {factor && <span className="caps"><Icon name="check" size={12} /> On</span>}</h3>
        {factor === undefined ? null : setup ? (
          <div className="ts-setup">
            <img src={setup.qr} alt="QR code to scan with your authenticator app" width="168" height="168" />
            <p className="muted">Scan this with an authenticator app, or type this key into it.</p>
            <p className="num ts-key">{setup.key}</p>
            <p className="muted xs">Keep the key somewhere safe. It gets you back in if you lose your phone.</p>
            <form className="ts-row" onSubmit={finish}>
              <input className="input num" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" aria-label="The 6-digit code from your app" />
              <button type="submit" className="btn" disabled={code.length !== 6 || !!busy}>{busy === "verify" ? "Checking…" : "Turn on"}</button>
              <button type="button" className="btn ghost" onClick={cancel}>Cancel</button>
            </form>
          </div>
        ) : factor ? (
          <>
            <p className="muted">Marble asks for a code from your app each time you sign in on a device.</p>
            <div className="ts-row">
              <button type="button" className="btn ghost" onClick={everywhere} disabled={!!busy}>{busy === "out" ? "Signing out…" : "Sign out everywhere"}</button>
              <button type="button" className="btn ghost" onClick={off} disabled={!!busy}>{sure ? "Tap again to turn off" : "Turn off"}</button>
            </div>
          </>
        ) : (
          <>
            <p className="muted">Ask for a code from an authenticator app each time you sign in, so your email alone can't open your journal.</p>
            <div className="ts-row">
              <button type="button" className="btn ghost" onClick={begin} disabled={!!busy}>{busy === "start" ? "Starting…" : "Turn on"}</button>
              <button type="button" className="btn ghost" onClick={everywhere} disabled={!!busy}>{busy === "out" ? "Signing out…" : "Sign out everywhere"}</button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

// The second step at sign-in, for a trader who has turned it on
export function TwoStepCode({ onDone, Mark }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const check = async (e) => {
    e.preventDefault();
    if (code.length !== 6) return;
    setBusy(true); setError("");
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      const factor = data?.totp?.find((f) => f.status === "verified");
      const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor?.id, code });
      if (err) throw err;
      onDone();
    } catch { setBusy(false); setCode(""); setError("That code didn't match. Try the newest one."); }
  };
  return (
    <div className="gate-card">
      {Mark}
      <h1 className="gate-title">One more step</h1>
      <p className="gate-sub">Type the 6-digit code from your authenticator app.</p>
      <form className="gate-code" onSubmit={check}>
        <label className="gate-code-label" htmlFor="gate-step">Your code</label>
        <div className="gate-code-row">
          <input id="gate-step" className="input num" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" autoFocus
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
          <button type="submit" className="btn silver" disabled={code.length !== 6 || busy}>{busy ? "Checking…" : "Sign in"}</button>
        </div>
      </form>
      {error && <p className="gate-error" role="alert">{error}</p>}
      <div className="gate-sent-actions">
        <button type="button" className="link" onClick={() => supabase.auth.signOut()}>Sign out</button>
        <a className="link" href="mailto:support@example.com?subject=Lost%20my%20two-step%20code">Lost your phone?</a>
      </div>
    </div>
  );
}
