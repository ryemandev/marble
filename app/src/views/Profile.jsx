import { useEffect, useMemo, useState } from "react";
import { Avatar, Card, Icon } from "../components/ui";
import { ArtPicker, Chips, Choice, Field, photoDataURL } from "../components/forms";
import { CAL, art, fmtMoney, monthName, summarize, viewingNow } from "../data";
import InkPicture from "../drip/InkPicture";
import { dayCardOf } from "../drip/DailyClose";
import { isSample, useAccounts } from "../drip/accounts";
import FitCard from "../drip/floor/FitCard";
import { finishFor, money, recordSince, useCloses } from "../drip/week";
import { kindWord, tradeDay, useKinds, useMoney } from "../drip/view";
import { useFlexStyle } from "./flexpics";
import "../drip/record.css";
import { DEFAULT_PROFILE, setState, toast, useAllTrades, useFolded, useOwnTrades, useStore, useTrades } from "../store";
import { LIVE } from "../mode";
import { CRYPTO_RISK, publicTrades, showsCrypto } from "../crypto/public";
import { YourData } from "../live/YourData";
import { CardLinks } from "../live/CardLinks";
import { TwoStepSetting } from "../live/TwoStepSetting";
import { Alerts } from "../live/Alerts";
import { supabase } from "../live/supabase";

const MARKETS = ["Futures", "Forex", "Stocks", "Options", "Crypto"];
const STYLES = ["Scalper", "Day trader", "Swing trader"];
const HANDLE = /^[a-z0-9._]{2,20}$/;
const COVERS = [["masters/wanderer-friedrich", "The wanderer"], ["masters/calling-of-matthew-caravaggio", "The calling"], ["masters/charging-chasseur-gericault", "The chasseur"], ["cars/porsche-911-black", "Porsche 911"], ["cars/porsche-rear", "911 GT"], ["cars/ferrari-wheel", "Ferrari wheel"], ["japan/torii-tunnel", "Torii"], ["anime/samurai-duel", "Samurai"], ["textures/liquid-metal", "Metal"], ["textures/marble-rose", "Veined marble"], ["textures/kintsugi", "Kintsugi"], ["money/hundreds-spread", "Hundreds"], ["money/franklin-portrait", "Benjamin"], ["prints/great-wave-hokusai", "The great wave"]];
const PORTRAITS = [["masters/self-portrait-rembrandt", "Rembrandt"], ["anime/kabuto", "Kabuto"], ["anime/ronin", "Ronin"], ["masters/stag-at-sharkeys-bellows", "Stag at Sharkey's"], ["cars/aston-badge", "Aston wings"], ["textures/chrome-ripple", "Chrome"], ["money/franklin-eyes", "Benjamin"]];

// The card other traders see in Community and on share cards
function ProfileCard({ p, stats, crypto = false }) {
  const closed = Object.keys(useStore((s) => s.closes)).length;
  return (
    <div className="profile-card">
      <InkPicture className="profile-cover" src={art(p.cover || "masters/wanderer-friedrich", 960)} at="50% 62%" edge={false} />
      <div className="profile-body">
        <div className="profile-avatar"><Avatar name={p.name} src={p.avatar} img={p.avatarArt} size={84} /></div>
        <div className="profile-name">{p.name || "Your name"}</div>
        <div className="profile-handle num">@{p.handle || "handle"}{p.showNumber && p.no ? ` · #${p.no}` : ""}</div>
        {p.bio && <p className="profile-bio">{p.bio}</p>}
        <div className="profile-tags">
          {[...p.markets, p.style].filter(Boolean).map((t) => <span key={t} className="chip">{t}</span>)}
        </div>
        <dl className="profile-stats">
          <div><dt className="caps">Days closed</dt><dd className="num">{closed}</dd></div>
          <div><dt className="caps">{LIVE ? (CAL.all ? "All time" : viewingNow() ? "This month" : monthName()) : "October"}</dt><dd className="num">{p.show === "hidden" ? "Hidden" : !stats.count ? "–" : fmtMoney(stats.net, { sign: true })}</dd></div>
        </dl>
        {crypto && <p className="profile-risk">{CRYPTO_RISK}</p>}
      </div>
    </div>
  );
}

const Pencil = () => <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 16.5l.9-3.6L13.6 3.7a1.6 1.6 0 0 1 2.3 0l.4.4a1.6 1.6 0 0 1 0 2.3l-9.2 9.2-3.6.9zM11.5 17h5" /></svg>;
const LONG = 7; // past this, a name at this size runs into the drips
const dayWord = (key) => new Date(`${key}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).replace(",", "");

// Every closed day, newest first, on the same money as the calendar. A no-trade day is a row like any other.
function useRecord(pool) {
  const closes = useCloses();
  return useMemo(() => {
    const by = new Map();
    for (const t of pool) { const k = tradeDay(t); by.set(k, (by.get(k) || 0) + (+t.pnl || 0)); }
    return Object.keys(closes).sort().map((key, i) => ({ key, n: i + 1, net: by.get(key) })).reverse();
  }, [closes, pool]);
}

function Record({ p, onEdit }) {
  const closes = useCloses();
  const { pool } = useMoney("stats");
  const days = useRecord(pool);
  const all = useFolded(useAllTrades());
  const accounts = useAccounts();
  const latest = useMemo(() => dayCardOf({ all, accounts, closes, count: days.length }), [all, accounts, closes, days.length]);
  const kinds = useKinds(pool);
  const wanted = useFlexStyle().finish;
  const name = p.name || "Your name";
  const since = recordSince(closes);
  const number = p.showNumber && Number.isInteger(p.no) ? String(p.no).padStart(4, "0") : null;
  const facts = [number && ["No.", number], since && ["On record since", since], days.length > 0 && ["Days closed", days.length]].filter(Boolean);
  const words = [kindWord(kinds), isSample() ? "Sample data" : null].filter(Boolean).join(" · ");
  return (
    <div className="pr">
      <InkPicture className="pr-cover" src={art(p.cover || "masters/wanderer-friedrich", 960)} at="50% 36%" />
      <header className={`pr-head ${name.length > LONG ? "long" : ""}`}>
        <span className="pr-face"><Avatar name={p.name} src={p.avatar} img={p.avatarArt} size={76} /></span>
        <div className="pr-who">
          <h1 className="pr-name">{name}</h1>
          {p.handle && <p className="pr-handle num">@{p.handle}</p>}
        </div>
        <button type="button" className="pr-pencil" onClick={onEdit} aria-label="Edit your profile"><Pencil /></button>
      </header>
      {latest && (
        <button type="button" className="pr-card" onClick={() => setState({ closing: "card" })} aria-label="Open your latest card">
          <FitCard card={latest} finish={finishFor(days.length, wanted)} show={{ money: false, chart: false, record: false, handle: false }} />
        </button>
      )}
      {facts.length > 0 && <dl className="pr-facts">{facts.map(([t, v]) => <div key={t}><dt>{t}</dt><dd>{v}</dd></div>)}</dl>}
      {days.length ? (
        <section className="pr-days" aria-label="Every closed day">
          <div className="pr-days-head"><h2>Every closed day</h2>{words && <p>{words}</p>}</div>
          <ol>
            {days.map(({ key, n, net }) => (
              <li key={key} className="pr-day">
                <time dateTime={key}>{dayWord(key)}</time>
                <span>Day {n}</span>
                {net == null ? <b className="none">No trades</b> : <b className={net < 0 ? "down" : ""}>{money(net, { sign: true })}</b>}
              </li>
            ))}
          </ol>
        </section>
      ) : <p className="pr-none">Close your first day and your record starts here.</p>}
      <button type="button" className="pr-more" onClick={onEdit}>Profile, alerts and your data</button>
    </div>
  );
}

export default function Profile() {
  const saved = useStore((s) => s.profile);
  const own = useOwnTrades();
  const all = useTrades();
  const trades = publicTrades(LIVE ? own : all);
  const stats = summarize(trades);
  const [p, setP] = useState(saved);
  const [editing, setEditing] = useState(false);
  const set = (k) => (v) => setP((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));
  const handleOk = HANDLE.test(p.handle);
  const [taken, setTaken] = useState(false);
  useEffect(() => {
    if (!LIVE || !handleOk || p.handle === saved.handle) { setTaken(false); return; }
    let live = true;
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc("handle_available", { p_handle: p.handle });
      if (live) setTaken(!error && data === false);
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [p.handle, handleOk, saved.handle]);
  const dirty = JSON.stringify(p) !== JSON.stringify(saved);
  const valid = p.name.trim() && handleOk && !taken;
  const save = (e) => {
    e.preventDefault();
    if (!valid) return;
    setState({ profile: { ...p, name: p.name.trim(), bio: p.bio.trim() } });
    toast("Profile saved");
    setEditing(false);
  };
  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast("That file isn't a picture. Pick a JPEG, PNG or WebP.", { warn: true }); return; }
    try { const src = await photoDataURL(file); setP((x) => ({ ...x, avatar: src, avatarArt: null })); }
    catch { toast("That photo couldn't be read", { warn: true }); }
  };

  if (!editing) return <div className="view pr-wrap"><Record p={saved} onEdit={() => setEditing(true)} /></div>;

  return (
    <div className="view">
      <div className="pr-edit-head">
        <h1>Edit profile</h1>
        <button type="button" className="pr-x" aria-label="Back to your record" onClick={() => { setP(saved); setEditing(false); }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true"><path d="M4.5 4.5l11 11M15.5 4.5l-11 11" /></svg>
        </button>
      </div>
      <form className="grid g12" onSubmit={save} style={{ alignItems: "start" }}>
        <Card className="c7">
          <div className="profile-form">
            <section>
              <h3>Photo</h3>
              <div className="photo-row">
                <Avatar name={p.name} src={p.avatar} img={p.avatarArt} size={64} />
                <label className="btn ghost picker"><Icon name="upload" size={14} /> Upload a photo
                  <input type="file" accept="image/*" className="file-input" onChange={pickPhoto} aria-label="Upload a profile photo" />
                </label>
                {(p.avatar || p.avatarArt) && <button type="button" className="link" onClick={() => setP((x) => ({ ...x, avatar: null, avatarArt: null }))}>Use initials</button>}
              </div>
              <span className="field-hint">Or pick a portrait</span>
              <ArtPicker round label="Portrait" options={PORTRAITS} value={p.avatar ? null : p.avatarArt} onChange={(v) => setP((x) => ({ ...x, avatar: null, avatarArt: v }))} />
            </section>
            <section>
              <h3>Cover</h3>
              <ArtPicker label="Cover image" options={COVERS} value={p.cover} onChange={set("cover")} />
            </section>
            <section className="form-grid">
              <h3>About you</h3>
              <Field label="Name" span={2}><input className="input" value={p.name} onChange={set("name")} maxLength={40} /></Field>
              <Field label="Handle" span={2} hint={handleOk ? "Letters, numbers, dots and underscores" : undefined}
                error={!handleOk ? "2 to 20 lowercase letters, numbers, dots or underscores" : taken ? "That handle isn't available. Try another." : null}>
                <input className="input num" value={p.handle} onChange={(e) => set("handle")(e.target.value.toLowerCase().replace(/\s/g, ""))} aria-invalid={!handleOk || taken} maxLength={20} />
              </Field>
              <Field label={`Bio · ${160 - p.bio.length} left`} span={4}><textarea value={p.bio} onChange={set("bio")} maxLength={160} rows={3} placeholder="What you trade and how. Shown on your profile card." /></Field>
            </section>
            <section className="form-grid">
              <h3>Trading</h3>
              <Field label="Markets" span={4}><Chips label="Markets" options={MARKETS} value={p.markets} onChange={set("markets")} /></Field>
              <Field label="Style" span={4}><Choice label="Style" options={STYLES.map((x) => [x, x])} value={p.style} onChange={set("style")} /></Field>
            </section>
            <section className="form-grid">
              <h3>Privacy</h3>
              <Field label={LIVE ? "Show my monthly result as" : "Show my October result as"} span={4} hint="Applies to your profile card and your Floor posts">
                <Choice label="Show my result as" value={p.show} onChange={set("show")} options={[["dollars", "Dollars"], ["hidden", "Hidden"]]} />
              </Field>
              {p.showNumber !== undefined && Number.isInteger(p.no) && (
                <Field label={`Member number · #${p.no}`} span={4} hint={`You joined Marble as #${p.no}. Shown next to your name in Community`}>
                  <Choice label="Member number" value={p.showNumber ? "shown" : "hidden"} onChange={(v) => setP((x) => ({ ...x, showNumber: v === "shown" }))} options={[["shown", "Shown"], ["hidden", "Hidden"]]} />
                </Field>
              )}
            </section>
          </div>
          <div className="profile-actions">
            <button type="button" className="link" onClick={() => setP((x) => ({ ...x, avatar: DEFAULT_PROFILE.avatar, avatarArt: DEFAULT_PROFILE.avatarArt, cover: DEFAULT_PROFILE.cover, markets: DEFAULT_PROFILE.markets, style: DEFAULT_PROFILE.style, show: DEFAULT_PROFILE.show }))}>Reset to default</button>
            <span className="spacer" />
            {dirty && <button type="button" className="btn ghost" onClick={() => setP(saved)}>Discard changes</button>}
            <button type="submit" className="btn" disabled={!valid || !dirty}>Save profile</button>
          </div>
        </Card>
        <div className="c5 side profile-preview">
          <div className="caps" style={{ marginBottom: 10 }}>{LIVE ? "Preview" : "Preview · Sample data"}</div>
          <ProfileCard p={p} stats={stats} crypto={showsCrypto(trades)} />
        </div>
      </form>
      {LIVE && <Alerts />}
      {LIVE && <TwoStepSetting />}
      {LIVE && <CardLinks />}
      {LIVE && <YourData handle={saved.handle} />}
    </div>
  );
}
