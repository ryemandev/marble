import { useCallback, useEffect, useRef, useState } from "react";

const env = (typeof import.meta !== "undefined" && import.meta.env) || {};
const TURNSTILE_SITE_KEY = String(env.VITE_TURNSTILE_SITE_KEY || "").trim();
export const CAPTCHA_ON = TURNSTILE_SITE_KEY.length > 0;
const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let loading = null;
function loadTurnstile() {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!loading) loading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT; s.async = true; s.defer = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("The bot check didn't start")));
    s.onerror = () => { loading = null; reject(new Error("The bot check didn't load")); };
    document.head.appendChild(s);
  });
  return loading;
}

export function useTurnstile({ action = "default" } = {}) {
  const box = useRef(null);
  const widget = useRef(null);
  const current = useRef(null);
  const waiting = useRef([]);
  const [failed, setFailed] = useState(false);

  const settle = useCallback((token) => {
    current.current = token || null;
    if (token) waiting.current.splice(0).forEach((w) => w(token));
  }, []);

  useEffect(() => {
    if (!CAPTCHA_ON) return undefined;
    let gone = false;
    loadTurnstile().then((ts) => {
      if (gone || !box.current) return;
      widget.current = ts.render(box.current, {
        sitekey: TURNSTILE_SITE_KEY, action, appearance: "interaction-only", theme: "light",
        callback: (t) => { setFailed(false); settle(t); },
        "expired-callback": () => settle(null),
        "error-callback": () => { settle(null); setFailed(true); },
      });
    }).catch(() => { if (!gone) setFailed(true); });
    return () => {
      gone = true;
      try { if (widget.current != null) window.turnstile?.remove(widget.current); } catch { }
      widget.current = null;
    };
  }, [action, settle]);

  const getToken = useCallback((ms = 15000) => {
    if (!CAPTCHA_ON) return Promise.resolve(undefined);
    if (current.current) return Promise.resolve(current.current);
    return new Promise((resolve) => {
      const done = (t) => { clearTimeout(timer); resolve(t); };
      const timer = setTimeout(() => { waiting.current = waiting.current.filter((x) => x !== done); resolve(null); }, ms);
      waiting.current.push(done);
    });
  }, []);

  const reset = useCallback(() => {
    current.current = null;
    try { if (widget.current != null) window.turnstile?.reset(widget.current); } catch { }
  }, []);

  return { enabled: CAPTCHA_ON, box, failed, getToken, reset };
}

export const CAPTCHA_FAILED = "We couldn't check this browser is a person. Reload the page and try again.";
