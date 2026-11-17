import { useEffect, useState } from "react";
import { useStore } from "../store";
import { agoLabel, kindOf } from "./import/topstepx";
import { SETUP as IBKR_SETUP } from "./import/ibkr";
import { PLATFORMS, connect, disconnect, link, loadConnections, syncPlatform } from "./import/connect";
import { AccountPicker } from "./FirmPicker";
import { isAddress } from "../crypto/hyperliquid";
import { worldOf } from "../world";
import { Skeleton } from "../components/ui";

const KINDS = ["Evaluation", "Funded", "Live", "Paper"];

const INFO = {
  topstepx: {
    title: "Topstep",
    lede: "Your Topstep trades arrive on their own: no exports.",
    promise: "Marble only reads your trades with this key. Topstep's key can do more than read, but Marble never places a trade and never sees your password. Disconnect any time.",
    steps: ["In TopstepX open Settings → API. API access is a Topstep add-on you turn on there.", "Create an API key, then paste it here with your TopstepX username (not your email)."],
    fields: [
      { k: "username", label: "TopstepX username", placeholder: "Not your email", max: 120 },
      { k: "apiKey", label: "API key", placeholder: "From Settings → API", max: 400, secret: true },
    ],
    ready: (v) => v.username?.trim() && (v.apiKey || "").trim().length >= 8,
    kind: (name) => kindOf(name) || "Evaluation",
  },
  ibkr: {
    title: "Interactive Brokers",
    lede: "Your IBKR trades arrive through a Flex Query report.",
    promise: "The Flex token can only read reports. It can't trade, move money or change your account. Disconnect any time.",
    steps: IBKR_SETUP,
    fields: [
      { k: "queryId", label: "Query ID", placeholder: "The number next to your query", max: 12, numeric: true },
      { k: "token", label: "Flex Web Service token", placeholder: "From Flex Web Service Configuration", max: 40, secret: true, numeric: true },
    ],
    ready: (v) => /^\d{3,12}$/.test((v.queryId || "").trim()) && /^\d{6,40}$/.test((v.token || "").replace(/\s+/g, "")),
    kind: () => "Live",
  },
  hyperliquid: {
    title: "Hyperliquid",
    lede: "A wallet's trades and funding, read from its public address.",
    promise: "Read-only: an address is public, like an account number on a statement. Marble can't sign, trade or move anything with it. Remove it any time.",
    steps: ["On Hyperliquid, open Portfolio and copy your address (your main account or a sub-account, not an API wallet).", "Paste it here. Marble reads its fills and funding from Hyperliquid's public data."],
    fields: [{ k: "address", label: "Wallet address", placeholder: "0x…", max: 42 }],
    ready: (v) => isAddress(v.address),
    kind: () => "Live",
    first: "The first sync brings in everything Hyperliquid still keeps (its 10,000 most recent fills), with the funding paid and received while each trade was open.",
    more: true,
  },
};

export default function ConnectionsPanel() {
  const all = useStore((s) => s.connections);
  const world = useStore((s) => s.world);
  const here = Object.keys(PLATFORMS).filter((p) => world === "all" || PLATFORMS[p].world === world);
  const [loaded, setLoaded] = useState(all !== undefined);
  useEffect(() => { loadConnections().catch(() => {}).finally(() => setLoaded(true)); }, []);
  if (!loaded) return <div className="sheet-body imp-body"><Skeleton rows={3} label="Loading your connections" /></div>;
  return (
    <div className="sheet-body imp-body">
      {here.map((p) => (
        <section key={p} className="imp-step conn-card">
          {all?.[p] ? <Connected platform={p} conn={all[p]} /> : <ConnectForm platform={p} />}
        </section>
      ))}
    </div>
  );
}

function ConnectForm({ platform }) {
  const info = INFO[platform];
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const go = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    const clean = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v).trim()]));
    try { await connect(platform, clean); setValues({}); } catch (err) { setError(err.message); }
    setBusy(false);
  };
  if (!open) {
    return (
      <div className="imp-row spread">
        <div className="conn-head"><b>{info.title}</b><span className="xs muted">{info.lede}</span></div>
        <button type="button" className="btn ghost" onClick={() => setOpen(true)}>Connect {info.title}</button>
      </div>
    );
  }
  return (
    <form className="conn-form" onSubmit={go}>
      <div className="conn-head"><b>Connect {info.title}</b><span className="xs muted">{info.lede}</span></div>
      <ol className="conn-steps">{info.steps.map((s) => <li key={s}>{s}</li>)}</ol>
      <div className="imp-grid">
        {info.fields.map((f) => (
          <label key={f.k} className="field"><span className="field-label">{f.label}</span>
            <input className="input" type={f.secret ? "password" : "text"} inputMode={f.numeric ? "numeric" : undefined} autoComplete="off" spellCheck={false}
              placeholder={f.placeholder} maxLength={f.max} value={values[f.k] || ""} onChange={(e) => setValues({ ...values, [f.k]: e.target.value })} />
          </label>
        ))}
      </div>
      <p className="xs faint">{info.promise}{info.fields.some((f) => f.secret) ? " It's stored encrypted and only Marble's server can use it." : ""}</p>
      {error && <p className="imp-error" role="alert">{error}</p>}
      <div className="imp-row">
        <button type="submit" className="btn" disabled={busy || !info.ready(values)}>{busy ? `Checking with ${info.title}…` : `Connect ${info.title}`}</button>
        <button type="button" className="btn ghost" disabled={busy} onClick={() => { setOpen(false); setError(""); }}>Cancel</button>
      </div>
    </form>
  );
}

function AddMore({ platform }) {
  const info = INFO[platform];
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!open) return <div className="imp-row"><button type="button" className="link" onClick={() => setOpen(true)}>Add another wallet</button></div>;
  const go = async () => {
    setBusy(true); setError("");
    try { await connect(platform, { address: value.trim() }); setValue(""); setOpen(false); } catch (e) { setError(e.message); }
    setBusy(false);
  };
  return (
    <div className="conn-form">
      <div className="imp-grid">
        <label className="field"><span className="field-label">{info.fields[0].label}</span>
          <input className="input num" autoComplete="off" spellCheck={false} placeholder={info.fields[0].placeholder} maxLength={info.fields[0].max} value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
      </div>
      {error && <p className="imp-error" role="alert">{error}</p>}
      <div className="imp-row">
        <button type="button" className="btn" disabled={busy || !info.ready({ address: value })} onClick={go}>{busy ? "Checking…" : "Add wallet"}</button>
        <button type="button" className="btn ghost" disabled={busy} onClick={() => { setOpen(false); setError(""); }}>Cancel</button>
      </div>
    </div>
  );
}

function Connected({ platform, conn }) {
  const info = INFO[platform];
  // Only accounts in the platform's own world can be fed by it
  const accounts = useStore((s) => s.accounts).filter((m) => worldOf(m) === PLATFORMS[platform].world);
  const list = conn.accounts || [];
  const [choice, setChoice] = useState(() => Object.fromEntries(list.map((a) => [a.id, a.linked || ""])));
  const [kinds, setKinds] = useState(() => Object.fromEntries(list.map((a) => [a.id, info.kind(a.name)])));
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(t); }, []);
  useEffect(() => { setChoice(Object.fromEntries(list.map((a) => [a.id, a.linked || ""]))); }, [conn.accounts]);

  const saved = list.every((a) => (a.linked || "") === (choice[a.id] || ""));
  const linkedCount = list.filter((a) => a.linked).length;
  const save = async () => {
    setBusy("link"); setError("");
    try {
      const links = list.filter((a) => choice[a.id]).map((a) => (choice[a.id] === "new" ? { id: a.id, create: { name: a.id === "*" ? "IBKR" : a.name, kind: kinds[a.id] } } : { id: a.id, accountId: choice[a.id] }));
      await link(platform, links);
      if (links.length) { const r = await syncPlatform(platform); if (r.error) setError(r.error); }
    } catch (e) { setError(e.message); }
    setBusy("");
  };
  const sync = async () => { setBusy("sync"); setError(""); const r = await syncPlatform(platform); if (r.error) setError(r.error); setBusy(""); };
  const drop = async () => {
    if (!confirm) return setConfirm(true);
    setBusy("drop"); setError("");
    try { await disconnect(platform); } catch (e) { setError(e.message); setBusy(""); }
  };

  return (
    <>
      <div className="imp-row spread">
        <div className="conn-head"><b>{info.title}</b><span className="xs muted">{conn.username}</span></div>
        <span className={`xs ${conn.status === "error" ? "loss" : "muted"}`}>{conn.status === "error" ? "Sync failed" : linkedCount ? `Synced ${agoLabel(conn.last_synced_at)}` : "Choose accounts"}</span>
      </div>
      {conn.status === "error" && conn.last_error && <p className="imp-warn" role="alert">{conn.last_error}</p>}
      {!list.length && <p className="xs muted">{info.title} didn't list any accounts.</p>}
      <ul className="tsx-accounts">
        {list.map((a) => (
          <li key={a.id}>
            <div className="tsx-name">
              <b>{a.name}</b>
              <span className="xs muted">{a.linked ? `Synced ${agoLabel(a.last_synced_at)}` : "Not syncing"}</span>
            </div>
            <div className="field">
              <AccountPicker label={`Marble account for ${a.name}`} prefix="Into" value={choice[a.id] || ""} onChange={(v) => setChoice({ ...choice, [a.id]: v })}
                options={[{ value: "", text: "Don't sync" }, ...accounts.filter((m) => !m.archived).map((m) => ({ value: m.id, account: m })), { value: "new", text: "Into a new account" }]} />
            </div>
            {choice[a.id] === "new" && (
              <label className="field"><span className="sr-only">Account type</span>
                <select value={kinds[a.id]} onChange={(e) => setKinds({ ...kinds, [a.id]: e.target.value })}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select>
              </label>
            )}
          </li>
        ))}
      </ul>
      <p className="xs faint">{info.promise} {info.first || "The first sync brings in the last 90 days."} New trades wait in Needs review, and each sync can be undone from Past imports.</p>
      {info.more && list.length < 10 && <AddMore platform={platform} />}
      {error && <p className="imp-error" role="alert">{error}</p>}
      <div className="imp-row">
        {!saved && <button type="button" className="btn" disabled={!!busy} onClick={save}>{busy === "link" ? "Saving…" : "Save and sync"}</button>}
        {saved && linkedCount > 0 && <button type="button" className="btn" disabled={!!busy} onClick={sync}>{busy === "sync" ? "Syncing…" : "Sync now"}</button>}
        <button type="button" className="btn ghost" disabled={!!busy} onClick={drop}>{busy === "drop" ? "Disconnecting…" : confirm ? "Disconnect? Trades stay" : "Disconnect"}</button>
      </div>
    </>
  );
}
