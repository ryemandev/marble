import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "../components/overlay";
import { Choice, SubTabs } from "../components/forms";
import { Icon, Skeleton } from "../components/ui";
import { fmtMoney } from "../data";
import { BROKER_SYNC } from "../mode";
import { datedTrade, getState, loadState, setState, toast, unlinkTrades, useOwnStore, useStore } from "../store";
import { nyOf, pad } from "./time";
import { accountIn, tradeIn } from "./sync";
import { CRYPTO_TEMPLATE_CSV } from "./import/presets";
import { cryptoFirmOf } from "../crypto/venues";
import { utcOf } from "../world";
import { decodeBytes } from "./import/csv";
import { FIELDS, PRESETS, detect, fundingUpdates, holdLabel, mappingFor, mappingKey, presetById, readTable, toRow } from "./import/engine";
import { NY_CLOSE, STALE_DAYS, ZONES, build, zoneHint, zoneTwin } from "./import/trust";
import { localZone } from "./import/when";
import { carriedFills, commitImport, createAccount, existingKeys, listImports, saveSettings, undoImport, wasReviewed } from "./import/service";
import ConnectionsPanel from "./Connections";
import { PLATFORM as TOPSTEP_SYNC } from "./import/topstepx";
import { PLATFORM as IBKR_SYNC } from "./import/ibkr";
import "./import/import.css";
import { AccountPicker, FirmField, accountNameFor } from "./FirmPicker";
import { showEverything } from "../drip/view";
import { copiesAmong } from "../lib/copies";
import { MON as SHORT } from "../lib/basics.js";

const nyLabel = (d) => { const n = nyOf(d); return `${SHORT[n.month]} ${n.day} ${pad(n.hour)}:${pad(n.minute)}`; };
const utcLabel = (d) => { const n = utcOf(d); return `${SHORT[n.month]} ${n.day} ${pad(n.hour)}:${pad(n.minute)}`; };
const presetsFor = (world) => PRESETS.filter((p) => (world === "crypto" ? true : p.world !== "crypto"));
const SYNC_NAMES = { "hyperliquid-sync": "Hyperliquid sync" };
function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([CRYPTO_TEMPLATE_CSV], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "marble-crypto-template.csv" });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const dayLabel = (iso) => { const n = nyOf(iso); return `${SHORT[n.month]} ${n.day}`; };
const price = (v) => (v == null || !Number.isFinite(+v) ? "–" : (+v).toLocaleString("en-US", { maximumFractionDigits: 6 }));
const money = (v) => (v == null ? "–" : fmtMoney(v, { sign: true, decimals: 2 }));
const MAX_BYTES = 10 * 1024 * 1024;
const KINDS = [["Funded", "Funded"], ["Evaluation", "Evaluation"], ["Live", "Live"], ["Paper", "Paper"]];

export default function ImportForm({ onClose, tab: startTab = "new", venue = null }) {
  const [tab, setTab] = useState(!BROKER_SYNC && startTab === "connect" ? "new" : startTab);
  const crypto = useStore((s) => s.world) === "crypto";
  return (
    <Modal label="Import trades" onClose={onClose} className="overlay sheet-overlay">
      <div className="sheet wide imp">
        <header className="sheet-head">
          <div>
            <h2>Import trades</h2>
            <p>{crypto
              ? `From a file your exchange exports${BROKER_SYNC ? ", or synced from a Hyperliquid wallet's public address" : ""}. Marble pairs the fills into trades, with their fees and funding, and skips any it already has.`
              : `From the file your platform exports${BROKER_SYNC ? ", or synced from Topstep or Interactive Brokers" : ""}. Marble pairs the fills into trades and skips any it already has.`}</p>
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
        </header>
        <div className="imp-tabs"><SubTabs label="Import" value={tab} onChange={setTab} items={[["new", "New import"], ...(BROKER_SYNC ? [["connect", "Connect"]] : []), ["history", "Past imports"]]} /></div>
        {tab === "new" ? <NewImport onClose={onClose} venue={venue} /> : tab === "connect" ? <ConnectionsPanel /> : <History />}
      </div>
    </Modal>
  );
}

/* ---------- A new import ---------- */

function NewImport({ onClose, venue }) {
  const world = useStore((s) => s.world);
  const crypto = world === "crypto";
  const accounts = useStore((s) => s.accounts);
  const desk = useStore((s) => s.deskAccount);
  const priv = useStore((s) => s.me?.private) || {};
  const logged = useStore((s) => s.logged);
  const [accountId, setAccountId] = useState(() => (accounts.some((a) => a.id === desk) ? desk : accounts[0]?.id || "new"));
  const [newAcc, setNewAcc] = useState({ firm: null, name: "", label: "", kind: crypto ? "Live" : "Funded" });
  const how = cryptoFirmOf(venue || accounts.find((a) => a.id === accountId)?.firm || null);
  const [file, setFile] = useState(null); // { name, table }
  const [presetId, setPresetId] = useState(null);
  const [mapping, setMapping] = useState(null);
  const [tz, setTz] = useState(localZone());
  const [order, setOrder] = useState(null);
  const [points, setPoints] = useState({});
  const [fileAccount, setFileAccount] = useState(null);
  const [carried, setCarried] = useState([]);
  const [existing, setExisting] = useState(new Map());
  const [include, setInclude] = useState({});
  const [edges, setEdges] = useState({}); // the trader's own say on a contract that doesn't balance
  const [risk, setRisk] = useState(priv.default_risk ?? "");
  const [showCols, setShowCols] = useState(false);
  const [showSettings, setShowSettings] = useState(false); // crypto: how the file is read, behind a link
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);
  const input = useRef(null);
  const preset = presetById(presetId);
  // A crypto exchange's file belongs in the crypto world
  const wrongWorld = !crypto && preset?.world === "crypto";
  const fit = (p, m) => (crypto && p?.generic ? { ...m, world: "crypto", linear: true } : m);
  const mappings = priv.import_mappings || {};
  const realAccount = accountId !== "new" ? accountId : null;

  const open = async (f) => {
    setError("");
    if (!f) return;
    setFile(null);
    if (f.size > MAX_BYTES) return setError("That file is over 10 MB. Export a shorter date range and try again.");
    const ext = f.name.split(".").pop().toLowerCase();
    try {
      let table;
      if (ext === "xlsx") {
        const { readSheet } = await import("read-excel-file/browser");
        table = readTable(await readSheet(f));
      } else if (ext === "xls") {
        return setError("Old .xls files can't be read. Save it as .xlsx or .csv and try again.");
      } else {
        table = readTable(decodeBytes(await f.arrayBuffer()));
      }
      if (!table.headers.length || !table.records.length) return setError("Marble couldn't find a table of trades in that file.");
      const p = detect(table.headers);
      const saved = mappings[mappingKey(p, table.headers)] || {};
      const m = mappingFor(p, table.headers);
      setFile({ name: f.name, table });
      setPresetId(p.id);
      setMapping(fit(p, p.generic && saved.fields ? { ...m, shape: saved.shape || m.shape, fields: saved.fields, pnlIs: saved.pnlIs || m.pnlIs } : { ...m, pnlIs: saved.pnlIs || m.pnlIs }));
      setTz(saved.tz || zoneHint(p, table.headers).zone || localZone());
      setOrder(saved.order || null);
      setPoints(saved.points || {});
      setFileAccount(null);
      setInclude({});
      setEdges({});
      setShowCols(p.generic);
    } catch (e) {
      console.warn("Import read failed:", e);
      setError("Marble couldn't read that file. CSV, XLSX and HTML statements work.");
    }
  };

  const choosePreset = (id) => {
    const p = presetById(id);
    setPresetId(id);
    setMapping(fit(p, mappingFor(p, file.table.headers)));
    const hint = zoneHint(p, file.table.headers);
    if (hint.zone) setTz(hint.zone);
    setShowCols(p.generic);
  };

  useEffect(() => {
    let live = true;
    if (!realAccount || !presetId) { setCarried([]); return; }
    carriedFills(realAccount, presetId).then((c) => live && setCarried(c)).catch(() => live && setCarried([]));
    return () => { live = false; };
  }, [realAccount, presetId]);

  const result = useMemo(() => (file && mapping ? build(file.table, mapping, { tz, order, points, fileAccount, carried, edges }) : null), [file, mapping, tz, order, points, fileAccount, carried, edges]);

  const keys = useMemo(() => (result ? result.trades.map((t) => t.key).join("\n") : ""), [result]);
  useEffect(() => {
    let live = true;
    if (!realAccount || !keys) { setExisting(new Map()); return; }
    existingKeys(realAccount, keys.split("\n")).then((m) => live && setExisting(m)).catch(() => live && setExisting(new Map()));
    return () => { live = false; };
  }, [realAccount, keys]);

  const rows = useMemo(() => {
    if (!result) return [];
    const mine = logged.filter((x) => x.account === realAccount);
    const iso = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : null);
    const copied = copiesAmong(result.trades.map((t) => ({ id: t.key, account: realAccount || "new", symbol: t.symbol, side: t.side, traded_at: iso(t.opened),
      closedAt: t.closed && t.closed !== t.opened ? iso(t.closed) : null, entry: t.entry, exit: t.exit, pnl: t.net })), logged.filter((x) => x.account && x.account !== realAccount));
    return result.trades.map((t) => {
      const copies = copied.get(t.key) || null;
      if (existing.has(t.key)) return { t, status: "dup", why: `Already imported ${dayLabel(existing.get(t.key))}` };
      if (t.gross == null) return { t, status: "points", why: `Needs ${t.symbol}'s point value` };
      const twin = zoneTwin(t, mine);
      if (twin) return { t, status: include[t.key] ? "new" : "maybe", why: `Same trade as your ${twin.symbol} ${twin.side} from ${dayLabel(twin.traded_at)}, at another clock time`, soft: true, twin: true };
      const like = mine.find((x) => x.symbol === t.symbol && x.side === t.side && Math.abs(Date.parse(x.traded_at) - t.opened) <= 120000);
      if (like) return { t, status: include[t.key] ? "new" : "maybe", why: `Looks like the ${like.symbol} ${like.side} at ${like.time} already in your journal`, soft: true };
      return { t, status: "new", copies };
    });
  }, [result, existing, include, logged, realAccount]);
  const copyCount = rows.filter((x) => x.status === "new" && x.copies).length;
  const twinCount = rows.filter((x) => x.twin && x.status === "maybe").length;
  const picked = rows.filter((x) => x.status === "new");
  const funding = useMemo(() => {
    if (!result || mapping?.shape !== "funding" || !realAccount) return null;
    const mine = logged.filter((t) => t.account === realAccount && t.source !== "sync")
      .map((t) => ({ id: t.id, traded_at: t.traded_at, closed_at: t.closedAt, symbol: t.symbol, commission: t.commission, fills: t.fills }));
    return fundingUpdates(mine, result.fundingEvents || []);
  }, [result, mapping, realAccount, logged]);
  const dupCount = rows.filter((x) => x.status === "dup" || x.status === "maybe").length;

  const addFunding = () => {
    const by = new Map(funding.updates.map((u) => [u.id, u]));
    setState((s) => ({ logged: s.logged.map((t) => { const u = by.get(t.id); return u ? datedTrade({ ...t, funding: u.funding, ...(u.pnl != null ? { pnl: u.pnl } : {}) }) : t; }) }));
    toast(`Funding added to ${funding.updates.length} trade${funding.updates.length === 1 ? "" : "s"}${funding.unattached.length ? `. ${funding.unattached.length} payment${funding.unattached.length === 1 ? "" : "s"} matched no trade here` : ""}.`);
    onClose();
  };

  const go = async () => {
    if (funding) return addFunding();
    setBusy(true); setError("");
    try {
      let acc = realAccount;
      if (!acc) {
        const a = await createAccount({ name: accountNameFor(newAcc), kind: newAcc.kind, firm: newAcc.firm, label: newAcc.label.trim() || null, world: crypto ? "crypto" : "markets" });
        loadState({ accounts: [...getState().accounts, accountIn(a)] });
        if (!getState().deskAccount) setState({ deskAccount: a.id });
        acc = a.id;
        setAccountId(a.id);
      }
      const riskN = +risk > 0 ? +risk : null;
      const out = picked.map(({ t }) => toRow(t, { accountId: acc, importId: null, risk: riskN }));
      const firstFile = !Object.keys(mappings).length; // a saved mapping means a file has come in before, on any device
      const { importRow, trades } = await commitImport({
        accountId: acc, platform: presetId, fileName: file.name, rows: out, duplicates: dupCount,
        open: result.open.length, openFills: result.open.flatMap((o) => o.fills).slice(0, 2000),
      });
      const added = trades.map(tradeIn);
      loadState({ logged: [...added, ...getState().logged].sort((a, b) => b.traded_at.localeCompare(a.traded_at)) });
      const key = mappingKey(preset, file.table.headers);
      const nextMappings = { ...mappings, [key]: { preset: presetId, shape: mapping.shape, fields: preset.generic ? mapping.fields : undefined, pnlIs: mapping.pnlIs, tz, order, points } };
      await saveSettings({ mappings: nextMappings, risk: riskN }).catch(() => {});
      const me = getState().me;
      if (me) loadState({ me: { ...me, private: { ...me.private, import_mappings: nextMappings, default_risk: riskN } } });
      if (firstFile && added.length) {
        showEverything();
        setState({ firstFile: { importId: importRow.id, ids: added.map((t) => t.id) } });
      } else {
        toast(`Imported ${added.length} trade${added.length === 1 ? "" : "s"}. They're waiting in Needs review.`);
        setState({ journalReview: true });
      }
      onClose();
    } catch (e) {
      console.warn("Import failed:", e?.message || e);
      setError("Couldn't import those trades. Nothing was saved. Try again.");
      setBusy(false);
    }
  };

  const accountOk = realAccount || newAcc.name.trim().length > 0;
  const canImport = funding ? funding.updates.length > 0 && !busy : !!result && picked.length > 0 && accountOk && !busy && !result.missing.length && !wrongWorld;
  const needsFirm = !!result && picked.length > 0 && !accountOk;
  const why = !result || busy || canImport ? "" : wrongWorld ? "Switch to Crypto to import this file" : mapping?.shape === "funding" && !realAccount ? "Choose the account whose trades it belongs to" : funding ? "No trades here for this funding" : needsFirm ? (crypto ? "Pick the exchange, wallet or firm for the new account" : "Pick the firm or broker for the new account") : result.missing.length ? "Choose the missing columns first" : "";
  const zones = ZONES.some(([z]) => z === tz) ? ZONES : [[tz, tz], ...ZONES];

  const accountFields = (
    <>
      <div className="imp-grid">
        <div className="field"><span className="field-label">Import into</span>
          <AccountPicker label="Account to import into" value={accountId} onChange={setAccountId} autoFocus
            options={[...accounts.filter((a) => !a.archived).map((a) => ({ value: a.id, account: a })), { value: "new", text: "+ A new account" }]} />
        </div>
        {accountId === "new" && (
          <div className={`field ${needsFirm ? "has-error" : ""}`}><span className="field-label">{crypto ? "Exchange, wallet or firm" : "Firm or broker"}</span>
            <FirmField value={newAcc} onChange={(v) => setNewAcc({ ...newAcc, ...v })} world={crypto ? "crypto" : "markets"} />
            {needsFirm && <span className="field-error">Needed to import</span>}
          </div>
        )}
        {accountId === "new" && (
          <label className="field"><span className="field-label">Label (optional)</span>
            <input className="input" placeholder="50K" value={newAcc.label} maxLength={40} onChange={(e) => setNewAcc({ ...newAcc, label: e.target.value })} />
          </label>
        )}
      </div>
      {accountId === "new" && <Choice label="Account type" value={newAcc.kind} onChange={(kind) => setNewAcc({ ...newAcc, kind })} options={KINDS} />}
    </>
  );
  const dropZone = (
    <>
      <label className={`imp-drop ${drag ? "over" : ""} ${file ? "has" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); open(e.dataTransfer.files?.[0]); }}>
        <input ref={input} type="file" accept=".csv,.txt,.tsv,.xlsx,.html,.htm" onChange={(e) => { open(e.target.files?.[0]); e.target.value = ""; }} />
        <Icon name="upload" size={18} />
        {file
          ? <span><b>{file.name}</b><span className="muted"> · {file.table.records.length} {file.table.records.length === 1 ? "row" : "rows"}{file.table.section ? ` · ${file.table.section}` : ""}. Drop another to change it.</span></span>
          : <span><b>Drop your export here</b><span className="muted"> or browse. CSV, XLSX or an HTML statement.</span></span>}
      </label>
      {error && <p className="imp-error" role="alert">{error}</p>}
    </>
  );
  const templateLine = crypto && <p className="xs faint">Another exchange, a prop firm's own terminal, or trades you keep elsewhere? <button type="button" className="link" onClick={downloadTemplate}>Download Marble's crypto template</button>, fill it in, and drop it here.</p>;
  const platformFields = file && result && (
    <>
      <div className="imp-grid">
        <label className="field"><span className="field-label">Detected</span>
          <select value={presetId} onChange={(e) => choosePreset(e.target.value)}>
            {[...presetsFor(world), ...(presetsFor(world).some((p) => p.id === presetId) ? [] : [preset])].map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="field"><span className="field-label">{zoneHint(preset, file.table.headers).ask ? "Broker server time" : "Times in the file are"}</span>
          <select value={tz} onChange={(e) => setTz(e.target.value)}>{zones.map(([z, l]) => <option key={z} value={z}>{l}</option>)}</select>
        </label>
        {(result.dates.ambiguous || result.dates.conflicting || order) && (
          <label className="field"><span className="field-label">Dates like 03/04</span>
            <select value={order || result.dates.order} onChange={(e) => setOrder(e.target.value)}>
              <option value="MDY">Month first (4 March is 03/04)</option>
              <option value="DMY">Day first (3 April is 03/04)</option>
            </select>
          </label>
        )}
        {result.accounts.length > 1 && (
          <label className="field"><span className="field-label">Account in the file</span>
            <select value={fileAccount || result.accounts[0]} onChange={(e) => setFileAccount(e.target.value)}>{result.accounts.map((a) => <option key={a}>{a}</option>)}</select>
          </label>
        )}
        {mapping.shape === "roundtrip" && mapping.fields.pnl && mapping.fields.commission && (
          <label className="field"><span className="field-label">The file's P&amp;L is</span>
            <select value={mapping.pnlIs} onChange={(e) => setMapping({ ...mapping, pnlIs: e.target.value })}>
              <option value="gross">Before commission</option>
              <option value="net">After commission</option>
            </select>
          </label>
        )}
        <label className="field"><span className="field-label">Usual risk per trade ($)</span>
          <input className="input num" inputMode="decimal" placeholder="Optional, gives R" value={risk} onChange={(e) => setRisk(e.target.value)} />
        </label>
      </div>
      {preset?.note && <p className="xs faint">{preset.note}</p>}
      {wrongWorld && <p className="imp-warn" role="alert">This looks like a {preset.name.split(" ·")[0]} export. Crypto trades live in the crypto world: switch with the seal beside the wordmark, then import it there.</p>}
      {result.hint && <p className="imp-warn" role="alert">{result.hint}</p>}
      {(showCols || result.missing.length > 0) && <Columns table={file.table} mapping={mapping} preset={preset} crypto={crypto} onChange={(m) => setMapping(fit(preset, m))} onManual={() => { const g = PRESETS.find((p) => p.generic && p.shape === (mapping.shape === "roundtrip" ? "roundtrip" : "fills")); setPresetId(g.id); setMapping(fit(g, mappingFor(g, file.table.headers))); setShowCols(true); }} />}
    </>
  );
  const pointsBlock = result?.unknown.length > 0 && (
    <section className="imp-step">
      <span className="caps">Point values</span>
      <p className="xs muted">Marble doesn't know what a point of these is worth. For shares, spot and crypto it's 1.</p>
      <div className="imp-grid">
        {result.unknown.map((s) => (
          <label key={s} className="field"><span className="field-label">{s}: dollars per point</span>
            <input className="input num" inputMode="decimal" placeholder="1" defaultValue={points[s] ?? ""} onBlur={(e) => { const v = +e.target.value; setPoints((p) => ({ ...p, [s]: v > 0 ? v : undefined })); }} />
          </label>
        ))}
      </div>
    </section>
  );
  const preview = result && (mapping.shape === "funding"
    ? <FundingPreview funding={funding} events={result.fundingEvents || []} logged={logged} />
    : <Preview rows={rows} accounts={accounts} copyCount={copyCount} twinCount={twinCount} crypto={crypto} onInclude={(k, v) => setInclude((x) => ({ ...x, [k]: v }))} />);
  const notes = result && <Notes result={result} crypto={crypto} onReading={(contract, reading) => setEdges((x) => ({ ...x, [contract]: reading }))} />;
  const footer = (
    <footer className="sheet-foot imp-foot">
      <span className="xs muted">{why ? <span className="imp-why-not">{why}</span> : funding ? `Funding for ${funding.updates.length} trade${funding.updates.length === 1 ? "" : "s"}` : result ? `${picked.length} to import${dupCount ? ` · ${dupCount} skipped as duplicates` : ""}` : ""}</span>
      <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
      <button type="button" className="btn" disabled={!canImport} onClick={go}>{funding ? `Add funding to ${funding.updates.length} trade${funding.updates.length === 1 ? "" : "s"}` : busy ? "Importing…" : picked.length ? `Import ${picked.length} trade${picked.length === 1 ? "" : "s"}` : "Import"}</button>
    </footer>
  );

  if (crypto) {
    const read = result && mapping.shape !== "funding" ? whatRead(result, tz) : null;
    const net = picked.reduce((a, { t }) => a + (t.net || 0), 0);
    const needsAnswer = !!result && (zoneHint(preset, file.table.headers).ask || result.dates.ambiguous || result.dates.conflicting || result.accounts.length > 1 || result.missing.length > 0 || wrongWorld || !!result.hint);
    return (
      <>
        <div className="sheet-body imp-body">
          <ol className="seal-steps">
            <li className={`seal-step ${accountOk ? "done" : "now"}`}>
              <span className="seal-mark" aria-hidden="true">一</span>
              <div className="seal-body">
                <div className="seal-head"><b>Where from</b></div>
                {accountFields}
                {how?.exportHint && !file && <div className="seal-how"><span>Export it from {how.name}:</span><span>{how.exportHint}</span></div>}
              </div>
            </li>
            <li className={`seal-step ${file ? "done" : accountOk ? "now" : ""}`}>
              <span className="seal-mark" aria-hidden="true">二</span>
              <div className="seal-body">
                <div className="seal-head"><b>The file</b>{file && <span className="num faint">{file.table.records.length} {file.table.records.length === 1 ? "row" : "rows"}</span>}</div>
                {dropZone}
                {!file && templateLine}
              </div>
            </li>
            <li className={`seal-step ${result && canImport ? "done" : file ? "now" : ""}`}>
              <span className="seal-mark" aria-hidden="true">三</span>
              <div className="seal-body">
                <div className="seal-head"><b>What Marble read</b>{preset && result && <span className="faint">{preset.name}</span>}
                  {result && !needsAnswer && <button type="button" className="link seal-edit" onClick={() => setShowSettings(!showSettings)} aria-expanded={showSettings}>{showSettings ? "Done" : "Check how"}</button>}</div>
                {!result && <p className="xs faint">Drop a file and Marble reads it here, in your browser: the fees, funding, leverage and every trade, before anything goes in.</p>}
                {read && (
                  <div className="seal-chips">
                    {read.map(([label, on]) => <span key={label} className={`seal-chip ${on ? "on" : "off"}`}>{on ? "✓" : "–"} {label}</span>)}
                  </div>
                )}
                {result && mapping.shape !== "funding" && (
                  <p className="seal-sum">
                    <span><b className="num">{picked.length}</b> new trade{picked.length === 1 ? "" : "s"}</span>
                    {dupCount > 0 && <span><b className="num">{dupCount}</b> already in</span>}
                    {result.open.length > 0 && <span><b className="num">{result.open.length}</b> still open</span>}
                    {picked.length > 0 && <span>net <b className="num">{money(net)}</b> after fees and funding</span>}
                  </p>
                )}
                {(needsAnswer || showSettings) && platformFields}
              </div>
            </li>
          </ol>
          {pointsBlock}
          {notes}
          {preview}
        </div>
        {footer}
      </>
    );
  }

  return (
    <>
      <div className="sheet-body imp-body">
        <section className="imp-step">
          <span className="caps">Account</span>
          {accountFields}
        </section>

        <section className="imp-step">
          <span className="caps">File</span>
          {dropZone}
        </section>

        {file && result && (
          <>
            <section className="imp-step">
              <div className="imp-row spread">
                <span className="caps">Platform</span>
                <button type="button" className="link" onClick={() => setShowCols(!showCols)} aria-expanded={showCols}>{showCols ? "Hide columns" : "Check the columns"}</button>
              </div>
              {platformFields}
            </section>
            {pointsBlock}
            {notes}
            {preview}
          </>
        )}
      </div>
      {footer}
    </>
  );
}

function whatRead(result, tz) {
  const ts = result.trades;
  const any = (k) => ts.some((t) => t[k] != null);
  const split = ts.some((t) => t.feeMaker != null || t.feeTaker != null);
  return [
    [split ? "Fees, maker and taker" : "Fees", split || ts.some((t) => t.commission)],
    ["Funding", any("funding") || (result.fundingEvents || []).length > 0],
    ["Leverage", any("leverage")],
    ["Liquidation price", any("liqPrice")],
    [tz === "UTC" ? "UTC times" : tz === NY_CLOSE ? "Times: broker server clock" : `Times: ${tz}`, true],
  ];
}

function Columns({ table, mapping, preset, onChange, onManual, crypto }) {
  const describe = (spec) => {
    if (spec == null) return "–";
    if (typeof spec === "string") return spec;
    if (Array.isArray(spec)) return spec.find((s) => table.headers.some((h) => h.toLowerCase() === String(s).toLowerCase())) || spec[0];
    if (spec.sum) return spec.sum.filter((s) => table.headers.includes(s)).join(" + ") || spec.sum[0];
    if (spec.join) return spec.join.join(" + ");
    if (spec.match) return table.headers.find((h) => new RegExp(spec.match, "i").test(h)) || spec.match;
    if (spec.nth) return `${spec.nth[0]} (${spec.nth[1] === 1 ? "first" : "second"})`;
    if (spec.product) return spec.product.map(describe).join(" × ");
    return "–";
  };
  const fields = (FIELDS[mapping.shape === "roundtrip" ? "roundtrip" : mapping.shape === "funding" ? "funding" : "fills"] || []).filter((f) => crypto || f[3] !== "crypto");
  if (!preset?.generic) {
    return (
      <div className="imp-cols">
        <p className="xs muted">Read as {preset.name}. <button type="button" className="link" onClick={onManual}>Map the columns yourself</button></p>
        <dl className="imp-map">{Object.entries(mapping.fields).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{describe(v)}</dd></div>)}</dl>
      </div>
    );
  }
  const set = (k, v) => { if (v !== "__join") onChange({ ...mapping, fields: { ...mapping.fields, [k]: v || undefined } }); };
  return (
    <div className="imp-cols">
      <div className="imp-row">
        <Choice label="What each row is" value={mapping.shape} onChange={(shape) => onChange({ ...mappingFor(PRESETS.find((p) => p.generic && p.shape === shape), table.headers) })} options={[["fills", "One row per fill"], ["roundtrip", "One row per trade"]]} />
      </div>
      <div className="imp-grid">
        {fields.map(([k, label, required]) => {
          const v = mapping.fields[k];
          return (
            <label key={k} className="field"><span className="field-label">{label}{required ? "" : " (optional)"}</span>
              <select value={typeof v === "string" ? v : v?.join ? "__join" : ""} onChange={(e) => set(k, e.target.value)}>
                <option value="">{required ? "Choose a column" : "Not in this file"}</option>
                {v?.join && <option value="__join">{v.join.join(" + ")}</option>}
                {table.headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </label>
          );
        })}
      </div>
      <p className="xs faint">Remembered for files with these columns.</p>
    </div>
  );
}

function Notes({ result, crypto, onReading }) {
  const [open, setOpen] = useState(false);
  const items = [];
  const fills = (n) => `${n} fill${n === 1 ? "" : "s"}`;
  const at = crypto ? utcLabel : nyLabel;
  const fillWords = (f) => `${f.side === "buy" ? "Buy" : "Sell"} ${price(f.qty)} at ${price(f.price)}, ${at(f.time)}`;
  const listed = (list) => `${list.slice(0, 3).map(fillWords).join("; ")}${list.length > 3 ? ` and ${list.length - 3} more` : ""}`;
  const unbalanced = new Set(result.unbalanced.map((u) => u.contract));
  const stillOpen = result.open.filter((o) => !unbalanced.has(o.contract));
  const openFills = stillOpen.reduce((n, o) => n + o.fills.length, 0);
  if (result.missing.length) items.push(<li key="m" className="imp-warn">Choose a column for {result.missing.join(", ")} to read this file.</li>);
  for (const u of result.unbalanced) items.push(
    <li key={`u${u.contract}`}>{u.symbol}'s buys and sells don't match in this file, so {fills(u.fills.length)} {u.fills.length === 1 ? "is" : "are"} left out ({listed(u.fills)}). {u.reading === "start"
      ? <>Marble read {u.fills.length === 1 ? "it" : "them"} as closing a position from before the file starts. <button type="button" className="link" onClick={() => onReading(u.contract, "end")}>{u.fills.length === 1 ? "It" : "They"} opened a trade instead</button></>
      : <>Marble read {u.fills.length === 1 ? "it" : "them"} as a position still open at the end of the file, and the next file from this platform finishes it. <button type="button" className="link" onClick={() => onReading(u.contract, "start")}>{u.fills.length === 1 ? "It" : "They"} closed an older position instead</button></>}
    </li>);
  if (stillOpen.length) items.push(<li key="o">{openFills ? `${fills(openFills)} left out. ` : ""}{stillOpen.length === 1 ? "1 position is" : `${stillOpen.length} positions are`} still open at the end of the file ({stillOpen.map((o) => `${o.symbol} ${o.side} ${o.qty}`).join(", ")}). Open positions aren't imported. The next file from this platform finishes them.</li>);
  if (result.stale.length) {
    const old = result.stale.flatMap((o) => o.fills);
    items.push(<li key="t">{fills(old.length)} from your last import left out ({result.stale.map((o) => `${o.symbol} ${o.side} ${o.qty}`).join(", ")}). {old.length === 1 ? "It's" : "They're"} more than {STALE_DAYS} days older than this file, so Marble can't see what happened in between. To count {old.length === 1 ? "it" : "them"}, import one file that covers both the open and the close.</li>);
  }
  if (result.orphans.length) items.push(<li key="x">{result.orphans.length} exit{result.orphans.length === 1 ? "" : "s"} with no entry in this file, from a position opened before it starts. Left out.</li>);
  if (result.skipped.length) items.push(
    <li key="s">{result.skipped.length} row{result.skipped.length === 1 ? "" : "s"} couldn't be read. <button type="button" className="link" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Hide" : "Show which"}</button>
      {open && <ul className="imp-skips">{result.skipped.slice(0, 20).map((s) => <li key={s.row} className="num">Row {s.row}: {s.reason}</li>)}</ul>}
    </li>);
  if (!items.length) return null;
  return <section className="imp-step"><ul className="imp-notes">{items}</ul></section>;
}

function FundingPreview({ funding, events, logged }) {
  if (!funding) return <section className="imp-step"><p className="muted xs">{events.length} funding payment{events.length === 1 ? "" : "s"} read. Choose the account whose trades they belong to.</p></section>;
  const byId = new Map(logged.map((t) => [t.id, t]));
  const total = funding.updates.reduce((a, u) => a + u.funding, 0);
  return (
    <section className="imp-step">
      <span className="caps">Funding for {funding.updates.length} trade{funding.updates.length === 1 ? "" : "s"} · {money(total)}</span>
      {funding.updates.length > 0 && (
        <div className="imp-table-wrap">
          <table className="table imp-table">
            <thead><tr><th>Opened (UTC)</th><th>Symbol</th><th className="r">Funding</th><th className="r">Net after</th></tr></thead>
            <tbody>{funding.updates.slice(0, 100).map((u) => { const t = byId.get(u.id); return (
              <tr key={u.id}><td className="num">{t ? utcLabel(t.traded_at) : "–"}{u.partial && <span className="imp-why">Open past this file's dates: some funding may be in another file</span>}</td>
                <td><span className="sym">{t?.symbol}</span></td><td className="num r">{money(u.funding)}</td><td className="num r">{u.pnl != null ? money(u.pnl) : "–"}</td></tr>); })}</tbody>
          </table>
        </div>
      )}
      {funding.unattached.length > 0 && <p className="xs muted">{funding.unattached.length} payment{funding.unattached.length === 1 ? "" : "s"} matched no trade in this account (a position from before your first import, or another account's). They're left out.</p>}
      <p className="xs faint">Funding replaces what these trades had, so adding the same file twice changes nothing.</p>
    </section>
  );
}

function Preview({ rows, accounts, copyCount, twinCount, onInclude, crypto }) {
  const nameOf = (id) => accounts.find((a) => a.id === id)?.name || "another account";
  const copyLine = (cs) => `Copy of the trade on ${nameOf(cs[0].account)}${cs.length > 1 ? ` and ${cs.length - 1} more` : ""}: one row in your journal`;
  const [limit, setLimit] = useState(100);
  if (!rows.length) return <section className="imp-step"><p className="muted xs">No finished trades in this file yet.</p></section>;
  return (
    <section className="imp-step">
      <span className="caps">{rows.length} trade{rows.length === 1 ? "" : "s"} found</span>
      <div className="imp-table-wrap">
        <table className="table imp-table">
          <thead><tr><th>Opened ({crypto ? "UTC" : "ET"})</th><th>Symbol</th><th className="r">Size</th>{crypto && <th className="r imp-wide">Lev</th>}<th className="r imp-wide">Entry</th><th className="r imp-wide">Exit</th><th className="r imp-wide">Held</th><th className="r imp-wide">Fees</th>{crypto && <th className="r imp-wide">Funding</th>}<th className="r">Net</th></tr></thead>
          <tbody>
            {rows.slice(0, limit).map(({ t, status, why, soft, copies }) => (
              <tr key={t.key} className={status === "new" ? "" : "imp-off"}>
                <td className="num">
                  {soft && <input type="checkbox" className="imp-check" checked={status === "new"} onChange={(e) => onInclude(t.key, e.target.checked)} aria-label={`Import this ${t.symbol} ${t.side} anyway`} />}
                  {crypto ? utcLabel(t.opened) : nyLabel(t.opened)}
                  {why && <span className="imp-why">{why}</span>}
                  {!why && copies && status === "new" && <span className="imp-why imp-copy">{copyLine(copies)}</span>}
                </td>
                <td style={{ whiteSpace: "nowrap" }}><span className="sym">{t.symbol}</span><span className={`side-tag ${t.side}`}>{t.side === "long" ? "L" : "S"}</span></td>
                <td className="num r">{price(t.size)}</td>
                {crypto && <td className="num r imp-wide">{t.leverage ? `${+(+t.leverage).toFixed(2)}×` : "–"}</td>}
                <td className="num r imp-wide">{price(t.entry)}</td>
                <td className="num r imp-wide">{price(t.exit)}</td>
                <td className="num r imp-wide">{holdLabel(t.holdMs)}</td>
                <td className="num r imp-wide">{t.commission ? fmtMoney(t.commission, { decimals: 2 }) : "–"}</td>
                {crypto && <td className="num r imp-wide">{t.funding ? money(t.funding) : "–"}</td>}
                <td className={`num r ${t.net < 0 ? "loss" : t.net > 0 ? "win" : ""}`}>{money(t.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > limit && <button type="button" className="link" onClick={() => setLimit(limit + 200)}>Show {Math.min(200, rows.length - limit)} more</button>}
      {twinCount > 0 && <p className="imp-warn" role="alert">{twinCount === 1 ? "1 trade here matches one" : `${twinCount} trades here match ones`} already in this account in everything but the clock. That looks like this file imported under another time zone, so {twinCount === 1 ? "it's" : "they're"} skipped. If the first time zone was wrong, undo that import in Past imports, then import this file. Tick a trade to bring it in anyway.</p>}
      {copyCount > 0 && <p className="xs muted">{copyCount === 1 ? "1 trade here copies" : `${copyCount} trades here copy`} a trade already on another of your accounts. Each joins its copies as one row in the journal, reviewed once for every account.</p>}
      <p className="xs faint">R stays blank unless the file has a stop or you set your usual risk. Grades are yours to give when you review each trade.</p>
    </section>
  );
}

/* ---------- Past imports, and undo ---------- */

function History() {
  const accounts = useStore((s) => s.accounts);
  const everyAccount = useOwnStore((s) => s.accounts);
  const logged = useOwnStore((s) => s.logged);
  const [list, setList] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { listImports().then(setList).catch(() => { setList([]); setError("Couldn't load your imports."); }); }, []);
  const undo = async (imp) => {
    if (confirm !== imp.id) return setConfirm(imp.id);
    setBusy(imp.id); setError("");
    try {
      const { removed, kept } = await undoImport(imp.id);
      const ids = new Set(removed);
      loadState({ logged: getState().logged.filter((t) => !ids.has(t.id)) });
      unlinkTrades(ids);
      setList((l) => l.map((x) => (x.id === imp.id ? { ...x, status: "undone", undone_at: new Date().toISOString() } : x)));
      toast(`Removed ${ids.size} imported trade${ids.size === 1 ? "" : "s"}${kept ? `. Kept ${kept} you reviewed` : ""}`);
    } catch {
      setError("Couldn't undo that import. Try again.");
    }
    setBusy(null); setConfirm(null);
  };
  const name = (id) => everyAccount.find((a) => a.id === id)?.name || "Removed account";
  const here = (imp) => !imp.account_id || accounts.some((a) => a.id === imp.account_id) || !everyAccount.some((a) => a.id === imp.account_id);
  const tradesOf = (imp) => logged.filter((t) => t.importId === imp.id);
  const undoAsk = (imp) => {
    const mine = tradesOf(imp), keep = mine.filter(wasReviewed).length, n = mine.length - keep;
    return keep ? `Remove ${n}, keep ${keep} reviewed?` : `Remove ${n} trade${n === 1 ? "" : "s"}?`;
  };
  return (
    <div className="sheet-body imp-body">
      {error && <p className="imp-error" role="alert">{error}</p>}
      {list == null ? <Skeleton rows={3} kind="lines" label="Loading your imports" /> : list.length === 0 ? <p className="muted xs">No imports yet.</p> : (
        <ul className="imp-history">
          {list.filter(here).map((imp) => (
            <li key={imp.id} className={imp.status === "undone" ? "imp-off" : ""}>
              <div>
                <b>{imp.platform === TOPSTEP_SYNC ? "Topstep sync" : imp.platform === IBKR_SYNC ? "Interactive Brokers sync" : SYNC_NAMES[imp.platform] || presetById(imp.platform)?.name || imp.platform}</b>
                <span className="xs muted"> · {name(imp.account_id)}</span>
                <div className="xs muted num">{dayLabel(imp.created_at)} · {imp.file_name || "file"} · {imp.added} added{imp.duplicates ? ` · ${imp.duplicates} duplicates` : ""}{imp.open_positions ? ` · ${imp.open_positions} open` : ""}</div>
              </div>
              {imp.status === "undone"
                ? <span className="chip">Undone {dayLabel(imp.undone_at)}{tradesOf(imp).length > 0 ? ` · ${tradesOf(imp).length} kept` : ""}</span>
                : <button type="button" className="btn ghost" disabled={busy === imp.id} onClick={() => undo(imp)}>{busy === imp.id ? "Undoing…" : confirm === imp.id ? undoAsk(imp) : "Undo"}</button>}
            </li>
          ))}
        </ul>
      )}
      <p className="xs faint">Undo removes the trades that import added. Any trade you've reviewed stays in your journal.</p>
    </div>
  );
}
