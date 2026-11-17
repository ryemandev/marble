import { useState } from "react";
import { Card, Icon } from "../components/ui";
import { LEGAL } from "../mode";
import { toast, useStore } from "../store";
import { deleteAccount, exportRecord } from "./sync";
import { supabase } from "./supabase";
import "./live.css";

export function YourData({ handle }) {
  const email = useStore((s) => s.me?.email);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(null);
  const [progress, setProgress] = useState("");
  const download = async () => {
    setBusy("export");
    try {
      const { bytes, missed } = await exportRecord((done, all) => setProgress(`Photo ${done} of ${all}`));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: `marble-${handle}-${new Date().toISOString().slice(0, 10)}.zip` });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast(missed ? `Your data is downloading. ${missed} ${missed === 1 ? "photo" : "photos"} couldn't be fetched.` : "Your data is downloading", missed ? { warn: true } : undefined);
    } catch { toast("Couldn't export right now. Try again."); }
    setBusy(null); setProgress("");
  };
  const remove = async () => {
    if (typed !== handle) return;
    setBusy("delete");
    try { await deleteAccount(); toast("Your account and everything in it is deleted"); }
    catch (e) {
      setBusy(null);
      if (e?.code === "reauth") setReauth(true);
      else toast(e?.message || "Couldn't delete your account. Try again, or email us.", { warn: true, ms: 8000 });
    }
  };
  const [reauth, setReauth] = useState(false);
  return (
    <div className="grid g12">
      <Card className="c7">
        <h3>Your data <span className="caps">{email}</span></h3>
        <div className="danger-zone">
          <p className="muted">Everything you put in Marble is yours. Download everything any time: your data, your trades as a spreadsheet and your photos, in one zip file. We never sell it. <a className="link" href={`${LEGAL}#privacy`}>Privacy Policy</a></p>
          <div className="danger-row">
            <button className="btn ghost" onClick={download} disabled={!!busy}><Icon name="upload" size={14} /> {busy === "export" ? progress || "Preparing…" : "Export my data"}</button>
          </div>
          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}>
            <b>Delete my account</b>
            <p className="muted xs" style={{ marginTop: 4 }}>Removes your account, journal, notes, posts and files for good. It can't be undone. Type your handle to confirm.</p>
            <div className="danger-row" style={{ marginTop: 10 }}>
              <input className="input num" value={typed} onChange={(e) => setTyped(e.target.value.trim().toLowerCase())} placeholder={handle} aria-label="Type your handle to confirm" />
              <button className="btn" onClick={remove} disabled={typed !== handle || !!busy}>{busy === "delete" ? "Deleting…" : "Delete forever"}</button>
            </div>
            {reauth && (
              <div className="danger-row" role="alert" style={{ marginTop: 10, alignItems: "center" }}>
                <p className="muted xs" style={{ margin: 0 }}>For your safety, deleting needs a fresh sign-in. Sign in again, then come back here within ten minutes.</p>
                <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Sign in again</button>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
