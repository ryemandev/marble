import { useEffect, useState } from "react";
import { Field, Sheet } from "../components/forms";
import { Icon } from "../components/ui";
import { toast } from "../store";
import { SHOT_MAX, SHOT_TYPES, bugContext, sendBugReport } from "./bugs";

export default function BugReport({ view, gap, rule, onClose }) {
  const [message, setMessage] = useState("");
  const [steps, setSteps] = useState("");
  const [shot, setShot] = useState(null);
  const [preview, setPreview] = useState(null);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const [context] = useState(() => ({ ...bugContext(view), ...(gap ? { gap } : {}), ...(rule ? { rule } : {}) }));

  useEffect(() => {
    if (!shot) { setPreview(null); return; }
    const url = URL.createObjectURL(shot);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [shot]);

  const scrub = (f) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext("2d").drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const type = f.type === "image/png" ? "image/png" : f.type;
      c.toBlob((b) => (b ? resolve(new File([b], f.name.replace(/\.\w+$/, "") + (type === "image/png" ? ".png" : type === "image/webp" ? ".webp" : ".jpg"), { type })) : reject(new Error("unreadable"))), type, 0.92);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("unreadable")); };
    img.src = url;
  });

  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!SHOT_TYPES.includes(f.type)) { setProblem("Screenshots can be PNG, JPEG or WebP."); return; }
    if (f.size > SHOT_MAX) { setProblem("That image is over 5 MB. Try a smaller screenshot."); return; }
    let clean;
    try { clean = await scrub(f); } catch { setProblem("That image couldn't be read. Try another screenshot."); return; }
    if (clean.size > SHOT_MAX) { setProblem("That image is over 5 MB. Try a smaller screenshot."); return; }
    setProblem("");
    setShot(clean);
  };

  const send = async () => {
    if (busy) return;
    setBusy(true);
    setProblem("");
    try {
      await sendBugReport({ message: gap ? `Doesn't match my broker: ${gap.title}. Marble shows ${gap.net}. Broker shows ${message.trim()}.` : rule ? `Firm rule looks wrong: ${rule.firm}, ${rule.plan}. ${message.trim()}` : message, steps, context, screenshot: shot });
      toast("Thanks. Jules reads every one.");
      onClose();
    } catch (e) {
      setProblem(/too many/i.test(e?.message || "") ? "That's a lot of reports in an hour. Try again a little later." : e?.message?.startsWith("Screenshots") ? e.message : "Couldn't send that. Check your connection and try again.");
      setBusy(false);
    }
  };

  return (
    <Sheet title={gap ? "Doesn't match your broker?" : rule ? "This looks wrong" : "Report a bug"} sub={gap ? "Type what your broker shows. The trades behind this figure go with it, so nothing needs copying out." : rule ? `Tell us which ${rule.firm} rule is off and what the firm's page says now. We'll check it.` : "Tell us what went wrong. The screen you were on and your browser go with it, nothing else."}
      onClose={onClose} onSubmit={send} submitLabel={busy ? "Sending…" : "Send report"} canSubmit={!!message.trim() && !busy}>
      <Field label={gap ? "What your broker shows" : rule ? "Which rule, and what it should say" : "What happened"} span={4}>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={gap ? 2 : 4} maxLength={4000} required aria-required="true" data-autofocus
          placeholder={gap ? "The total on your broker's statement" : rule ? "Daily loss is now $1,000" : "What you saw, and what you expected instead"} />
      </Field>
      {!gap && !rule && <Field label="How to make it happen (optional)" span={4}>
        <textarea value={steps} onChange={(e) => setSteps(e.target.value)} rows={3} maxLength={4000} placeholder="The steps, one a line" />
      </Field>}
      <div className="field span-4">
        <span className="field-label" id="bug-shot-label">Screenshot (optional)</span>
        {preview ? (
          <div className="bug-shot">
            <img src={preview} alt="The screenshot you attached" />
            <button type="button" className="link" onClick={() => setShot(null)}>Remove</button>
          </div>
        ) : (
          <label className="btn ghost bug-pick">
            <Icon name="image" size={14} /> Add a screenshot
            <input type="file" accept={SHOT_TYPES.join(",")} className="file-input" aria-labelledby="bug-shot-label" onChange={pick} />
          </label>
        )}
        <span className="field-hint">PNG, JPEG or WebP, up to 5 MB.</span>
      </div>
      <details className="bug-context span-4">
        <summary className="xs muted">What's sent with it</summary>
        <ul className="xs faint">
          {rule && <li>{rule.firm}: {rule.plan}</li>}
          {gap && <li>{gap.title}: {gap.count} trades, with the time, symbol, side, money and fees of up to 40</li>}
          <li>Screen: {context.screen || "–"} · {context.path}</li>
          <li>Browser: {context.browser}</li>
          <li>Window {context.viewport}, screen {context.screenSize}</li>
          <li>Build {context.build} · {context.errors.length} recent error{context.errors.length === 1 ? "" : "s"}</li>
        </ul>
      </details>
      {problem && <p className="bug-problem span-4" role="alert">{problem}</p>}
    </Sheet>
  );
}
