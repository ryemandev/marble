import { useEffect, useState } from "react";
import { Card } from "../components/ui";
import { closeReminder } from "../lib/calendar";
import { toast } from "../store";
import { installKind, pushOff, pushOn, pushSettings, pushSubscription, pushSupport } from "./pwa";
import { InstallSteps } from "./Install";
import "./install.css";

const KINDS = [
  ["limits", "Daily limits", "When you reach a daily limit, and when you're close to one. Never an amount."],
  ["dms", "Messages", "“New message on Marble”. Never who wrote or what."],
  ["mentions", "Crew mentions", "When someone in your crew's room writes your @handle."],
];

function Switch({ title, sub, on, busy, disabled, onChange }) {
  return (
    <label className={`al-row ${disabled ? "off" : ""} ${busy ? "busy" : ""}`}>
      <span><b>{title}</b><span>{sub}</span></span>
      <input type="checkbox" checked={!!on} disabled={disabled || busy} onChange={(e) => onChange(e.target.checked)} />
      <span className={`al-switch ${on ? "on" : ""}`} aria-hidden="true"><i /></span>
    </label>
  );
}

export function Alerts() {
  const [support, setSupport] = useState(pushSupport);
  const [here, setHere] = useState(null); // this device has alerts on
  const [prefs, setPrefs] = useState(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(null);
  const [closeAt, setCloseAt] = useState("17:00");
  const addToCalendar = () => {
    const url = URL.createObjectURL(new Blob([closeReminder(closeAt)], { type: "text/calendar" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "close-your-day.ics" });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast("Open the file to add it to your calendar");
  };
  useEffect(() => {
    if (support === "off") return;
    pushSubscription().then((s) => setHere(!!s && Notification.permission === "granted")).catch(() => setHere(false));
    pushSettings().then(setPrefs, () => setFailed(true));
  }, [support]);
  if (support === "off") return null;

  const device = async (on) => {
    setBusy("device");
    try {
      if (on) await pushOn(); else await pushOff();
      setHere(on);
      toast(on ? "Alerts are on for this device" : "Alerts are off on this device");
      setPrefs(await pushSettings());
    } catch (e) {
      toast(e?.message || "Couldn't change alerts. Try again.", { warn: true, ms: 7000 });
      setSupport(pushSupport());
    }
    setBusy(null);
  };
  const choose = (k) => async (on) => {
    setBusy(k);
    setPrefs((p) => ({ ...p, [k]: on }));
    try { setPrefs(await pushSettings({ [k]: on })); }
    catch { setPrefs((p) => ({ ...p, [k]: !on })); toast("Couldn't save that. Try again.", { warn: true }); }
    setBusy(null);
  };
  const devices = prefs?.devices || [];

  return (
    <div className="grid g12">
      <Card className="c7 al-card">
        <h3>Notifications</h3>
        <p className="al-lede">Alerts on your phone or computer, even with Marble closed.</p>
        <div className="al-rows">
          {support === "install" && (
            <div className="al-install">
              <p>On iPhone, alerts come to Marble on your home screen. Add it there, open it from the icon, and turn them on here.</p>
              <InstallSteps kind={installKind()} />
            </div>
          )}
          {support === "unsupported" && <p className="al-note">This browser can't show alerts from Marble. Chrome, Edge, Firefox and Safari can.</p>}
          {support === "old-ios" && <p className="al-note">Alerts on iPhone need iOS 16.4 or later. Update in Settings → General → Software Update.</p>}
          {support === "blocked" && <p className="al-note">Notifications are blocked for Marble in this browser's settings. Allow them for trademarble.app there, then come back.</p>}
          {support === "ready" && (
            <Switch title="Alerts on this device" sub={here ? "On. Choose what's sent below." : "Off. Turning them on asks your browser once."}
              on={here} busy={busy === "device"} disabled={here == null} onChange={device} />
          )}
        </div>
        <div className="al-sub">What to send</div>
        <div className="al-rows">
          {KINDS.map(([k, title, sub]) => (
            <Switch key={k} title={title} sub={sub} on={prefs?.[k]} busy={busy === k} disabled={!prefs} onChange={choose(k)} />
          ))}
        </div>
        <div className="al-sub">Your own calendar</div>
        <div className="al-cal">
          <label><span>Close your day at</span><input type="time" value={closeAt} onChange={(e) => setCloseAt(e.target.value)} /></label>
          <button type="button" className="btn ghost" onClick={addToCalendar}>Add to my calendar</button>
        </div>
        <p className="al-note">A weekday reminder in your calendar, not from Marble. It only ever says "Close your day".</p>
        {failed && <p className="al-note">Couldn't load your alert settings. Reload to try again.</p>}
        {devices.length > 0 && <p className="al-note">On for {devices.map((d) => d.device).join(", ")}.</p>}
      </Card>
    </div>
  );
}
