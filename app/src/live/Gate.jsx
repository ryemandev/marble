import { useEffect, useRef, useState } from "react";
import { Stamp, Wordmark } from "../components/Logo";
import { Choice, Chips, Field } from "../components/forms";
import { Icon } from "../components/ui";
import { LEGAL, appUrl, BROKER_SYNC } from "../mode";
import { supabase } from "./supabase";
import SignInIcons from "./SignInIcons";
import { load, userId } from "./sync";
import { TwoStepCode } from "./TwoStepSetting";
import { pushGone } from "./pwa";
import { getState, loadState, useStore } from "../store";
import "./gate.css";
import Stage, { FORCE_PHASE, HallFrame } from "./gate/Looks";
import { FirmField, accountNameFor } from "./FirmPicker";
import FirmPlanFields from "./FirmPlanFields";
import { useFirm } from "./useFirmRules";
import { firmShort, hasRules, phaseOf, planIn, sizeLabel } from "../lib/firm-rules/catalog";
import { firmDailyLimit, money as usd } from "../lib/firm-rules/track";
import { wantsStart } from "../lib/intent";
import { CAPTCHA_FAILED, useTurnstile } from "../lib/turnstile";

function signInError(e) {
  const m = String(e?.message || "");
  const wait = m.match(/after (\d+) seconds?/i);
  if (wait) return `For security, a new email can go out in ${wait[1]} seconds. The code in the last one still works if you haven't used its link.`;
  if (/email rate limit/i.test(m)) return "Too many emails to this address in the last hour. Use the code from the last email, or try again later.";
  if (/rate|too many|seconds/i.test(m) || e?.status === 429) return "Too many tries just now. Wait a minute, then send the link again.";
  if (/sending|confirmation email|smtp|deliver/i.test(m) || e?.status >= 500) return "We couldn't send an email to that address. Check it's typed right, or try another.";
  if (/invalid.*email|email.*invalid/i.test(m)) return "That email doesn't look right.";
  if (/network|fetch/i.test(m)) return "Couldn't reach Marble. Check your connection and try again.";
  return "Sign-in didn't work. Please try again.";
}

// The days a trader opens the app, for the admin area's active counts: one call a UTC day per device (seen())
const SEEN_KEY = "marble-seen";
function markSeen() {
  const day = new Date().toISOString().slice(0, 10);
  try { if (localStorage.getItem(SEEN_KEY) === day) return; } catch {}
  supabase.rpc("seen").then(({ error }) => { if (!error) try { localStorage.setItem(SEEN_KEY, day); } catch {} }, () => {});
}
if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && userId()) markSeen(); });

/* ---------- Sign in ---------- */

const SITE_HOME = import.meta.env.PROD ? "/" : "./site.html";
// The sample desk: the same app on made-up trades, open to anyone. It needs no account and makes none.
const SAMPLE_DESK = `${import.meta.env.BASE_URL}demo.html`;
const HomeMark = ({ size }) => (
  <a className="gate-home" href={SITE_HOME} aria-label="Marble, back to the website">
    <Wordmark fontSize={size} className="gate-mark" />
  </a>
);

const Legal = () => (
  <p className="gate-legal">By continuing you agree to the <a href={`${LEGAL}#terms`}>Terms</a> and <a href={`${LEGAL}#privacy`}>Privacy Policy</a>.</p>
);

const PENDING_KEY = "marble-pending-email";
const pendingEmail = () => {
  try {
    const p = JSON.parse(localStorage.getItem(PENDING_KEY));
    if (p?.email && Date.now() - p.at < 36e5) return p.email;
  } catch {}
  return "";
};
const setPending = (email) => { try { email ? localStorage.setItem(PENDING_KEY, JSON.stringify({ email, at: Date.now() })) : localStorage.removeItem(PENDING_KEY); } catch {} };
const LINK_CHECK_KEY = "marble-link-check";
const setLinkCheck = (v) => { try { v == null ? sessionStorage.removeItem(LINK_CHECK_KEY) : sessionStorage.setItem(LINK_CHECK_KEY, JSON.stringify(v)); } catch {} };
const linkCheck = () => { try { return JSON.parse(sessionStorage.getItem(LINK_CHECK_KEY)); } catch { return null; } };

let linkTrouble = (() => {
  try {
    const u = new URL(location.href);
    const h = new URLSearchParams(u.hash.slice(1));
    if (u.searchParams.get("error_description") || h.get("error_description")) return "expired";
    if (u.searchParams.get("code")) return "elsewhere";
  } catch {}
  return null;
})();
const LINK_TYPES = { email: "email", signup: "email", magiclink: "email", invite: "invite", recovery: "recovery", email_change: "email_change" };
let linkToken = (() => {
  try {
    const u = new URL(location.href);
    const hash = u.searchParams.get("token_hash");
    const type = LINK_TYPES[u.searchParams.get("type") || "email"];
    return hash && type ? { hash, type } : null;
  } catch { return null; }
})();
const INTENT_KEY = "marble-intent";
const intent = (() => {
  try {
    const u = new URL(location.href);
    if (!wantsStart(u.search)) return sessionStorage.getItem(INTENT_KEY) === "start";
    sessionStorage.setItem(INTENT_KEY, "start");
    u.searchParams.delete("start");
    history.replaceState(null, "", u.pathname + u.search + u.hash);
    return true;
  } catch { return false; }
})();

const tidyAddress = () => {
  try {
    const u = new URL(location.href);
    ["code", "error", "error_code", "error_description", "token_hash", "type"].forEach((k) => u.searchParams.delete(k));
    history.replaceState(null, "", u.pathname + u.search);
  } catch {}
};

function SignIn({ preview = null }) {
  const [email, setEmail] = useState(preview === "sent" ? "support@example.com" : pendingEmail);
  const [sent, setSent] = useState(() => preview === "sent" || !!pendingEmail());
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [unknown, setUnknown] = useState("");
  const [creating, setCreating] = useState(intent);
  const [trouble, setTrouble] = useState(() => { const t = linkTrouble; linkTrouble = null; return t; });
  useEffect(() => { if (trouble) tidyAddress(); }, [trouble]);
  const [link, setLink] = useState(() => (preview ? null : linkToken));
  const bot = useTurnstile({ action: "signin" });
  const captcha = async () => {
    const token = await bot.getToken();
    if (bot.enabled && !token) throw Object.assign(new Error(CAPTCHA_FAILED), { captcha: true });
    return token;
  };
  const oauth = async (provider, scopes) => {
    setBusy(provider); setError("");
    const { error: e } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: appUrl(), ...(scopes ? { scopes } : {}) } });
    if (e) { setError(signInError(e)); setBusy(null); }
  };
  const send = async (create = creating) => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError("That email doesn't look right."); return; }
    setBusy(create ? "create" : "email"); setError(""); setUnknown("");
    let captchaToken;
    try { captchaToken = await captcha(); } catch (e) { setBusy(null); setError(e.message); return; }
    const { error: err } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: create, emailRedirectTo: appUrl(), ...(captchaToken ? { captchaToken } : {}) } });
    bot.reset();
    setBusy(null);
    if (err && !create && (/signups? not allowed|otp_disabled|user not found/i.test(err.message || "") || err.code === "otp_disabled")) { setUnknown(email.trim()); return; }
    if (err) setError(signInError(err));
    else { setCreating(create); setPending(email.trim()); setSent(true); setCode(""); }
  };
  const magic = (e) => { e.preventDefault(); send(creating); };
  const verify = async (e) => {
    e.preventDefault();
    if (code.length < 6) return;
    setBusy("code"); setError("");
    let captchaToken;
    try { captchaToken = await captcha(); } catch (e) { setBusy(null); setError(e.message); return; }
    const { error: err } = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type: "email", ...(captchaToken ? { options: { captchaToken } } : {}) });
    bot.reset();
    if (err) { setBusy(null); setError(/expired|invalid|otp/i.test(err.message || "") ? "That code didn't work. Use the code from the newest email: each new email replaces the code in the one before, and opening an email's link uses up its code." : signInError(err)); return; }
    setPending(null); // signed in: the gate takes it from here
  };
  const other = () => { setPending(null); setSent(false); setEmail(""); setCode(""); setError(""); setUnknown(""); setCreating(intent); };
  const confirmLink = async () => {
    setBusy("link"); setError("");
    setLinkCheck({ expected: pendingEmail() });
    const { error: err } = await supabase.auth.verifyOtp({ token_hash: link.hash, type: link.type });
    linkToken = null;
    tidyAddress();
    if (err) { setLinkCheck(null); setBusy(null); setLink(null); setTrouble("used"); return; }
    setPending(null); // signed in: the gate takes it from here
  };
  const haveCode = () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError("Type your email first, then the code."); return; }
    setPending(email.trim()); setSent(true); setCode(""); setError("");
  };
  if (link) return (
    <Stage screen="signin">
      <div className="gate-card">
        <HomeMark size={34} />
        <h1 className="gate-title">Sign in to Marble.</h1>
        <p className="gate-sub">Tap below to finish signing in on this device.</p>
        <button type="button" className="btn silver gate-link-go" onClick={confirmLink} disabled={!!busy}>{busy === "link" ? "Signing in…" : "Sign in"}</button>
        {error && <p className="gate-error" role="alert">{error}</p>}
      </div>
    </Stage>
  );
  return (
    <Stage screen={sent ? "sent" : "signin"}>
      <div className={`gate-card ${sent ? "" : "signin"}`}>
        <HomeMark size={34} />
        {sent ? (
          <>
            <h1 className="gate-title">Check your email.</h1>
            <p className="gate-sub">We sent a sign-in link and a code to <b>{email.trim()}</b>. Open the link on this device, or type the code here. Both work once and expire in an hour.</p>
            {trouble && <p className="gate-error" role="alert">That link opened somewhere else, like your phone's mail app or another browser. Type the code from the same email here instead.</p>}
            <form className="gate-code" onSubmit={verify}>
              <label className="gate-code-label" htmlFor="gate-otp">The code from the email</label>
              <div className="gate-code-row">
                <input id="gate-otp" className="input num" inputMode="numeric" autoComplete="one-time-code" maxLength={10} placeholder="123456"
                  value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))} />
                <button type="submit" className="btn silver" disabled={code.length < 6 || !!busy}>{busy === "code" ? "Checking…" : "Sign in"}</button>
              </div>
            </form>
            {error && <p className="gate-error" role="alert">{error}</p>}
            <div className="gate-sent-actions">
              <button type="button" className="link" onClick={() => send()} disabled={!!busy}>{busy === "email" || busy === "create" ? "Sending…" : "Send a new one"}</button>
              <button type="button" className="link" onClick={other}>Use a different email</button>
            </div>
          </>
        ) : (
          <>
            <h1 className="gate-title quiet">Sign in or create an account</h1>
            {trouble === "used" && <p className="gate-error" role="alert">That sign-in link has expired or was already used. Send a new one below. Each email also has a code you can type on any device.</p>}
            {trouble && trouble !== "used" && <p className="gate-error" role="alert">That sign-in link has expired, or opened in a different browser. Type your email and the code from the same email, or send a new one.</p>}
            <SignInIcons busy={busy} onOAuth={oauth} onError={setError} getCaptcha={captcha} />
            <div className="gate-or"><span>or with your email</span></div>
            <form className="gate-email" onSubmit={magic}>
              <input className="input" type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" aria-label="Email address" value={email} onChange={(e) => { setEmail(e.target.value); setUnknown(""); }} />
              <button type="submit" className="btn silver" disabled={!!busy}>{busy === "email" || busy === "create" ? "Sending…" : creating ? "Create my account" : "Email me a link"}</button>
            </form>
            {unknown && (
              <div className="gate-unknown" role="alert">
                <p>No Marble account uses <b>{unknown}</b>. Check the spelling, or create your account with it.</p>
                <button type="button" className="btn ghost" onClick={() => send(true)} disabled={!!busy}>{busy === "create" ? "Sending…" : "Create my account"}</button>
              </div>
            )}
            {error && <p className="gate-error" role="alert">{error}</p>}
            <p className="gate-links"><a className="gate-sample" href={SAMPLE_DESK}>See a sample desk first</a><span>· Sample data</span></p>
            <button type="button" className="gate-have-code" onClick={haveCode} disabled={!!busy}>I have a code from an email</button>
            <Legal />
          </>
        )}
        {bot.enabled && <div ref={bot.box} className="gate-captcha" />}
      </div>
    </Stage>
  );
}

/* ---------- First-time setup ---------- */

const MARKETS = ["Futures", "Forex", "Stocks", "Options", "Crypto"];
const STYLES = ["Scalper", "Day trader", "Swing trader"];
const KINDS = [["Live", "Live"], ["Evaluation", "Evaluation"], ["Funded", "Funded"], ["Paper", "Paper"]];
const STATUS = { Live: "live", Evaluation: "eval", Funded: "funded", Paper: "paper" };
const HANDLE = /^[a-z0-9._]{2,20}$/;
const HEARD = [["x", "X/Twitter"], ["youtube", "YouTube"], ["tiktok", "TikTok"], ["instagram", "Instagram"], ["reddit", "Reddit"], ["discord", "Discord"], ["google", "Google search"], ["friend", "A friend"], ["other", "Other"]];
const heardValue = (k, other) => {
  if (!HEARD.some(([key]) => key === k)) return null;
  const words = k === "other" ? other.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) : "";
  return words ? `other: ${words}` : k;
};

const DRAFT_KEY = "marble-setup-draft";
const readDraft = () => { try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY)) || null; } catch { return null; } };

// The public name is the trader's own choice. full_name is what Google or Discord gave, often a legal name, and it
// stays private: it's never copied across, and a name that only repeats it hasn't been chosen yet.
const bareName = (name) => String(name || "").trim().toLowerCase();
const chosenName = (name) => (bareName(name) && bareName(name) === bareName(getState().me?.private?.full_name) ? "" : name || "");

function Onboarding({ onDone, preview = false }) {
  const start = preview ? { handle: "jules", name: "Jules", markets: ["Futures"], style: "Day trader" } : getState().profile;
  const draft = preview ? null : readDraft();
  const [f, setF] = useState(draft?.f ? { ...draft.f, name: chosenName(draft.f.name) } : { handle: start.handle || "", name: chosenName(start.name), markets: start.markets?.length ? start.markets : ["Futures"], style: start.style || "Day trader" });
  const [agree, setAgree] = useState(!!draft?.agree);
  const [news, setNews] = useState(!!draft?.news);
  const [heard, setHeard] = useState(draft?.heard || { k: "", other: "" });
  const [acct, setAcct] = useState((draft?.acct && { prop: true, plan: null, phase: null, ...draft.acct }) || (preview
    ? { prop: true, firm: "topstep", name: "Topstep", label: "50K", kind: "Evaluation", balance: "50000", plan: "topstep.trading-combine.50k", phase: "evaluation" }
    : { prop: true, firm: null, name: "", label: "", kind: "Evaluation", balance: "", plan: null, phase: null }));
  const firmFile = useFirm(acct.prop && hasRules(acct.firm) ? acct.firm : null);
  const plan = acct.plan && acct.plan.startsWith(`${acct.firm}.`) ? planIn(firmFile, acct.plan) : null;
  const firmLimit = plan ? firmDailyLimit(plan, phaseOf(plan, acct.phase)) : null;
  const ruled = acct.prop && hasRules(acct.firm);
  useEffect(() => { if (!preview) try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ f, acct, agree, news, heard })); } catch {} }, [f, acct, agree, news, heard, preview]);
  const [taken, setTaken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const made = useRef(null); // the account, so a retry after a failed save doesn't add it twice
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));
  const handleOk = HANDLE.test(f.handle);
  const pickPlan = (r) => setAcct((a) => (r.plan
    ? { ...a, plan: r.plan, phase: r.phase, label: sizeLabel(r.size), balance: String(r.size), kind: r.kind || a.kind }
    : { ...a, plan: null, phase: null }));

  // Is the handle free? (Your own counts as free.)
  useEffect(() => {
    if (!handleOk) { setTaken(false); return; }
    let live = true;
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc("handle_available", { p_handle: f.handle });
      if (live) setTaken(!error && data === false);
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [f.handle, handleOk]);

  // A starting balance is a plain number ("1.2.3" isn't one)
  const balance = acct.balance === "" ? null : /^\d+(\.\d{1,2})?$/.test(acct.balance) ? +acct.balance : NaN;
  const balanceError = acct.name.trim() && Number.isNaN(balance) ? "A number, like 50000 or 50000.50" : null;
  const valid = handleOk && !taken && agree && (!acct.name.trim() || (balance != null && !Number.isNaN(balance)));
  const save = async (e) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true); setError("");
    try {
      const uid = userId();
      const p = await supabase.from("profiles").update({ handle: f.handle, name: f.name.trim() || f.handle, markets: f.markets, style: f.style }).eq("id", uid);
      if (p.error) throw p.error;
      let desk = made.current;
      if (!desk && acct.name.trim()) {
        const row = { name: accountNameFor(acct), firm: acct.firm || null, label: acct.label.trim() || null, kind: acct.kind, status: STATUS[acct.kind], balance: balance ?? 0 };
        const insert = (r) => supabase.from("accounts").insert(r).select("id").single();
        let a = await insert(plan ? { ...row, firm_plan: plan.id, firm_phase: acct.phase || null } : row);
        if (a.error && plan && /firm_plan|firm_phase|column/i.test(a.error.message || "")) a = await insert(row);
        if (a.error) throw a.error;
        desk = made.current = a.data.id;
      }
      const priv = await supabase.from("profile_private").update({ marketing_opt_in: news, terms_accepted_at: new Date().toISOString(), ...(desk ? { desk_account: desk } : {}) }).eq("id", uid);
      if (priv.error) throw priv.error;
      if (firmLimit && !getState().rules?.lossLimit) await supabase.from("profile_private").update({ daily_loss_limit: firmLimit }).eq("id", uid).then(() => {}, () => {});
      const said = heardValue(heard.k, heard.other);
      if (said) await supabase.from("profile_private").update({ heard_from: said }).eq("id", uid).then(() => {}, () => {});
      try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
      await onDone();
    } catch (err) {
      setError(err.code === "23505" ? "That handle isn't available. Try another." : err.message);
      setBusy(false);
    }
  };

  return (
    <Stage screen="setup" data={{ ...f, acct }}>
      <form className="gate-card wide" onSubmit={save}>
        <HomeMark size={26} />
        <h1 className="gate-title">Set up your desk.</h1>
        <p className="gate-sub">A minute now, and every trade after this lands in the right place.</p>
        <div className="form-grid gate-form">
          <Field label="Public name" span={2} hint="Everyone on Marble sees this. Leave it empty to show your handle."><input className="input" value={f.name} onChange={set("name")} maxLength={40} autoComplete="nickname" placeholder={f.handle || "A nickname"} /></Field>
          <Field label="Handle" span={2} hint={!handleOk ? "2 to 20 lowercase letters, numbers, dots or underscores" : taken ? "Not available. Try another." : "That one's yours if you want it."}>
            <input className="input num" value={f.handle} onChange={(e) => set("handle")(e.target.value.toLowerCase().replace(/\s/g, ""))} aria-invalid={!handleOk || taken} maxLength={20} />
          </Field>
          <Field label="Markets" span={4}><Chips label="Markets" options={MARKETS} value={f.markets} onChange={set("markets")} /></Field>
          <Field label="Style" span={4}><Choice label="Style" options={STYLES.map((x) => [x, x])} value={f.style} onChange={set("style")} /></Field>
        </div>
        <div className="gate-acct">
          <div className="gate-acct-title">Your first account <span className="faint">· optional, add more later</span></div>
          <div className="form-grid">
            <div className="field span-4">
              <span className="field-label">{acct.prop ? "Prop firm" : "Broker or platform"}</span>
              <FirmField value={acct} onChange={(v) => setAcct({ ...acct, ...v, plan: null, phase: null })} placeholder={acct.prop ? "Search prop firms" : "Search, or type a name"} />
              <span className="field-hint">{acct.prop ? "Pick yours to track its rules" : "Pick yours for its logo, or type your own name"}</span>
            </div>
            {ruled && <FirmPlanFields firm={acct.firm} value={acct} onChange={pickPlan} />}
            {!(ruled && plan) && (acct.name.trim() || !acct.prop) && <>
              <Field label="Label (optional)" span={2} hint="Size or nickname"><input className="input" value={acct.label} onChange={(e) => setAcct({ ...acct, label: e.target.value })} maxLength={40} placeholder="50K" /></Field>
              <Field label="Starting balance ($)" span={2} error={balanceError}><input className="input num" value={acct.balance} onChange={(e) => setAcct({ ...acct, balance: e.target.value.replace(/[^\d.]/g, "") })} inputMode="decimal" placeholder="Starting balance" /></Field>
              <Field label="Type" span={4}><Choice label="Account type" options={KINDS} value={acct.kind} onChange={(v) => setAcct({ ...acct, kind: v })} /></Field>
            </>}
            {plan && (
              <p className="field span-4 gate-limit">
                {firmLimit
                  ? <>Your daily loss limit becomes <span className="num">{usd(firmLimit, plan.cur)}</span>, {firmShort(acct.firm)}'s for this account, and the desk tracks the rest of its rules. Change any of it later.</>
                  : <>{firmShort(acct.firm)} has no daily loss limit on this account, so the desk tracks its drawdown, target and the rest of its rules. Set your own limit any time.</>}
              </p>
            )}
          </div>
          <button type="button" className="link gate-switch" onClick={() => setAcct({ ...acct, prop: !acct.prop, firm: null, name: "", label: "", balance: "", plan: null, phase: null })}>
            {acct.prop ? "I don't use a prop firm" : "I trade with a prop firm"}
          </button>
        </div>
        <div className="gate-acct gate-heard">
          <div className="gate-acct-title" id="gate-heard">How did you hear about Marble? <span className="faint">· optional</span></div>
          <Choice label="How did you hear about Marble?" options={HEARD} value={heard.k} onChange={(k) => setHeard((h) => ({ ...h, k: h.k === k ? "" : k }))} />
          {heard.k === "other" && (
            <Field label="Where was it?" span={4}><input className="input" value={heard.other} onChange={(e) => setHeard((h) => ({ ...h, other: e.target.value }))} maxLength={80} placeholder="A podcast, a newsletter…" /></Field>
          )}
        </div>
        <label className="gate-check">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} required />
          <span className="box"><Icon name="check" size={11} /></span>
          <span>I agree to the <a href={`${LEGAL}#terms`}>Terms</a> and <a href={`${LEGAL}#privacy`}>Privacy Policy</a>, and I understand Marble is a journal, not financial advice.</span>
        </label>
        <label className="gate-check">
          <input type="checkbox" checked={news} onChange={(e) => setNews(e.target.checked)} />
          <span className="box"><Icon name="check" size={11} /></span>
          <span>Send me the occasional email about new features. <span className="faint">Optional.</span></span>
        </label>
        {error && <p className="gate-error" role="alert">{error}</p>}
        <button type="submit" className="btn silver gate-go" disabled={!valid || busy}>{busy ? "Setting up…" : "Open my desk"}</button>
      </form>
    </Stage>
  );
}

/* ---------- The gate ---------- */

function Preview({ phase }) {
  if (phase === "setup") return <Onboarding preview onDone={() => {}} />;
  return <SignIn preview={phase} />;
}

export default function Gate({ children, loadDesk }) {
  if (FORCE_PHASE && ["signin", "sent", "setup"].includes(FORCE_PHASE)) return <Preview phase={FORCE_PHASE} />;
  return <RealGate loadDesk={loadDesk}>{children}</RealGate>;
}

// loadDesk() fetches the app's code: started once someone is signed in, waited for before the desk opens
function RealGate({ children, loadDesk = () => Promise.resolve() }) {
  const [phase, setPhase] = useState("loading");
  const [error, setError] = useState("");
  const [who, setWho] = useState("");
  const ready = useStore((s) => s.me?.private?.terms_accepted_at);
  const inside = () => loadDesk().catch(() => {}).then(() => {
    try { sessionStorage.removeItem(INTENT_KEY); } catch {}
    setPhase("in");
    if (BROKER_SYNC) import("./import/connect").then((m) => m.autoSync()).catch(() => {});
  });

  const enter = async () => {
    setPhase("loading");
    try {
      // A trader with a code app passes it before their journal loads: the database won't hand it over until then
      const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel().catch(() => ({ data: null }));
      if (level?.currentLevel === "aal1" && level?.nextLevel === "aal2") { setPhase("code"); return; }
      const user = await load();
      if (!user) { setLinkCheck(null); setPhase("out"); return; }
      const check = linkCheck();
      if (check) {
        const email = user.email || "";
        if (check.ok || (check.expected && check.expected.toLowerCase() === email.toLowerCase())) setLinkCheck(null);
        else { setWho(email || "an account with no email"); setPhase("whoami"); return; }
      }
      setPending(null); // signed in: no email waiting any more
      linkTrouble = null;
      if (linkToken) { linkToken = null; tidyAddress(); }
      markSeen();
      if (!getState().me.private.terms_accepted_at) { setPhase("setup"); return; }
      inside();
    } catch (e) {
      setError(e.message || String(e));
      setPhase("error");
    }
  };

  useEffect(() => {
    let current;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const id = session?.user?.id ?? null;
      if (id === current && event !== "SIGNED_OUT") return;
      // The page holds the last person's photos, picks and tour, so the next one starts from a clean page. Their
      // alerts stop first: a reload can cancel that halfway.
      if (current && id !== current) {
        tidyAddress();
        try { for (const k of [DRAFT_KEY, "marble-oracle"]) sessionStorage.removeItem(k); } catch {}
        loadState({ me: null });
        setPhase("out");
        pushGone().then(() => location.reload());
        return;
      }
      current = id;
      if (!id) { loadState({ me: null }); setPhase("out"); return; }
      loadDesk().catch(() => {});
      setTimeout(enter, 0); // outside the auth callback, as Supabase asks
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (phase === "in") return children;
  let body = null;
  if (phase === "loading") body = (
    <div className="gate-loading" role="status">
      <Stamp size={64} color="var(--accent)" />
      <span className="gate-loading-word">Opening your desk</span>
    </div>
  );
  else if (phase === "out") body = <SignIn />;
  else if (phase === "code") body = <Stage screen="signin"><TwoStepCode onDone={enter} Mark={<HomeMark size={34} />} /></Stage>;
  else if (phase === "whoami") body = (
    <Stage screen="signin">
      <div className="gate-card">
        <HomeMark size={34} />
        <h1 className="gate-title">Is this you?</h1>
        <p className="gate-sub">That link signed this device in as <b>{who}</b>. If that isn't your email, sign out: someone may have sent you a link to their own account.</p>
        <div className="gate-buttons">
          <button type="button" className="btn silver" onClick={() => { setLinkCheck({ ok: true }); enter(); }}>Yes, that's me</button>
          <button type="button" className="btn ghost" onClick={() => { setLinkCheck(null); setPending(null); supabase.auth.signOut(); }}>Not me, sign out</button>
        </div>
      </div>
    </Stage>
  );
  else if (phase === "setup" && !ready) body = <Onboarding onDone={enter} />;
  else if (phase === "error") body = (
    <Stage screen="signin">
      <div className="gate-card">
        <h1 className="gate-title">Marble couldn't load.</h1>
        <p className="gate-sub">{error}</p>
        <div className="gate-buttons"><button className="btn silver" onClick={enter}>Try again</button><button className="btn ghost" onClick={() => supabase.auth.signOut()}>Sign out</button></div>
      </div>
    </Stage>
  );
  return <HallFrame screen="loading" busy={phase === "loading"}>{body}</HallFrame>;
}
