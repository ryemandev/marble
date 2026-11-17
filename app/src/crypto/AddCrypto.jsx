import { useState } from "react";
import { Choice, Field, Sheet } from "../components/forms";
import { newId, openDialog, setState, toast } from "../store";
import { parseNum } from "../lib/trade";
import { LIVE } from "../mode";
import { FirmLogo } from "../live/FirmPicker";
import { CRYPTO_PICK } from "../live/firms";
import { CRYPTO_GROUPS, QUOTES } from "./venues";
import { connectWallet, isAddress } from "./hyperliquid";

const KINDS = [["Live", "Live"], ["Eval", "Evaluation"], ["Funded", "Funded"], ["Paper", "Demo"]];
const STATUS_OF = { Live: "live", Eval: "eval", Funded: "funded", Paper: "paper" };
const OTHER = { slug: "__other", name: "Another exchange", how: "template", reads: "Marble's template", group: "exchanges", logo: null };
const BY = Object.fromEntries([...CRYPTO_PICK, OTHER].map((f) => [f.slug, f]));

export default function AddCrypto({ onClose, venue: start = null }) {
  const [venue, setVenue] = useState(start);
  const [step, setStep] = useState(start ? 2 : 1);
  const v = venue ? BY[venue] : null;
  const prop = v?.group === "crypto-prop";
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState(null);
  const [quote, setQuote] = useState(null);
  const [balance, setBalance] = useState("");
  const [address, setAddress] = useState("");
  const [own, setOwn] = useState(""); // the name of an exchange that isn't on the list
  const other = venue === OTHER.slug;
  const [busy, setBusy] = useState(false);
  const k = kind || (prop ? "Eval" : "Live");
  const q = quote || (venue === "hyperliquid" ? "USDC" : prop ? "USD" : "USDT");
  const bal = parseNum(balance);
  const balError = balance !== "" && (Number.isNaN(bal) || bal < 0) ? "A number, 0 or more" : bal >= 1e11 ? "That balance is too big" : null;
  const wallet = v?.how === "wallet";
  const addrError = wallet && address.trim() && !isAddress(address.trim()) ? "A public address is 0x and 40 letters or digits" : null;

  if (step === 1) {
    return (
      <Sheet title="Add a crypto account" sub="Marble only reads: a file you export or a public wallet address. Never a password, never a key that can trade or withdraw."
        onClose={onClose} onSubmit={() => setStep(2)} submitLabel={v ? `Continue with ${v.name}` : "Continue"} canSubmit={!!v} wide>
        <div className="span-4 cx-pick">
          {CRYPTO_GROUPS.map((g) => (
            <section key={g.key} aria-label={g.title}>
              <div className="caps cx-pick-head">{g.title}</div>
              <div className="cx-venues" role="radiogroup" aria-label={g.title}>
                {[...g.firms, ...(g.key === "exchanges" ? [OTHER] : [])].map((f) => {
                  const p = BY[f.slug];
                  return (
                    <button key={f.slug} type="button" role="radio" aria-checked={venue === f.slug} className={`cx-venue ${venue === f.slug ? "on" : ""}`}
                      onClick={() => setVenue(f.slug)} onDoubleClick={() => { setVenue(f.slug); setStep(2); }}>
                      <span className="cx-venue-mark">{p.logo ? <FirmLogo slug={f.slug} size={20} /> : <b>{f.name}</b>}</span>
                      {p.logo && <span className="cx-venue-name">{f.name}</span>}
                      <span className="cx-venue-how">{f.reads}{f.hint ? ` · ${f.hint}` : ""}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          <p className="xs faint">Names and logos belong to their owners. Marble isn't affiliated with any of them, and this list isn't a recommendation.</p>
        </div>
      </Sheet>
    );
  }

  const save = async () => {
    const name = [other ? own.trim() : v.name, label.trim()].filter(Boolean).join(" ").slice(0, 60);
    const fields = { name, firm: other ? null : v.slug, label: label.trim() || null, kind: KINDS.find(([x]) => x === k)[1], status: STATUS_OF[k], balance: Math.round((bal || 0) * 100) / 100, world: "crypto", quoteCcy: q };
    const id = newId("a");
    setState((s) => ({ accounts: [...s.accounts, { id, ...fields, change: 0, color: "#c8cacf" }], deskAccount: id }));
    if (wallet && LIVE) {
      setBusy(true);
      const ok = await connectWallet(address.trim(), id).catch((e) => { toast(e.message || "Couldn't add that wallet. Try again from Import → Connect.", { warn: true, ms: 8000 }); return false; });
      setBusy(false);
      onClose();
      if (ok) toast(`${name} added. Its trades are syncing from the wallet.`);
      return;
    }
    onClose();
    toast(`${name} added. New crypto trades log to it.`);
    if (LIVE) openDialog("import", { venue: other ? null : v.slug });
  };

  return (
    <Sheet title={other ? "Add another exchange" : `Add ${v.name}`} sub={v.how === "wallet" ? "A public address only. Marble reads its fills and funding; it can't sign or trade." : `Marble reads it from ${v.reads.toLowerCase()}${v.hint ? ` (${v.hint.toLowerCase()})` : ""}.`}
      onClose={onClose} onSubmit={save} submitLabel={busy ? "Adding…" : wallet ? "Add and sync" : "Add account"}
      canSubmit={!busy && (!wallet || (isAddress(address.trim()))) && (!other || !!own.trim()) && !balError && balance !== ""}
      extra={!start && <button type="button" className="btn ghost" onClick={() => setStep(1)}>Back</button>}>
      {wallet && <Field label="Wallet address" span={4} error={addrError} hint="Your main or sub-account address (not an API wallet), from Hyperliquid's portfolio page">
        <input className="input num" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="0x…" spellCheck={false} autoCapitalize="none" autoComplete="off" maxLength={42} data-autofocus />
      </Field>}
      {other && <Field label="Exchange" span={4} hint="Its trades come in through Marble's crypto template, or log them by hand"><input className="input" value={own} onChange={(e) => setOwn(e.target.value)} maxLength={40} placeholder="Name" data-autofocus /></Field>}
      <Field label="Label (optional)" span={2} hint={prop ? "Size or phase" : "A nickname"}><input className="input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} placeholder={prop ? "50K" : "Main"} data-autofocus={!wallet || undefined} /></Field>
      <Field label="Kept in" span={2}><Choice label="Currency" value={q} onChange={setQuote} options={QUOTES.map((x) => [x, x])} /></Field>
      <Field label="Type" span={4}><Choice label="Type" value={k} onChange={setKind} options={KINDS} /></Field>
      <Field label={`Starting balance (${q})`} span={2} error={balError}><input className="input num" value={balance} onChange={(e) => setBalance(e.target.value)} inputMode="decimal" placeholder={prop ? "50000" : "10000"} /></Field>
    </Sheet>
  );
}
