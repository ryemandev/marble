import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SCRIPT = "https://accounts.google.com/gsi/client";
const ORIGINS = ["https://trademarble.app", "https://www.trademarble.app", ...String(import.meta.env.VITE_GOOGLE_ORIGINS || "").split(",").map((x) => x.trim()).filter(Boolean)];
const allowedHere = () => ORIGINS.includes(location.origin);

let loading = null;
const loadScript = () => (loading ||= new Promise((resolve, reject) => {
  if (window.google?.accounts?.id) return resolve();
  const s = document.createElement("script");
  s.src = SCRIPT; s.async = true; s.defer = true;
  s.onload = () => resolve();
  s.onerror = () => { loading = null; reject(new Error("Google sign-in didn't load")); };
  document.head.appendChild(s);
}));

async function makeNonce() {
  const raw = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))));
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return [raw, [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("")];
}

// `pill` is the face Marble draws: Google's own button sits over it, unseen, and takes the tap, so the sign-in that
// opens is still Google's. Without `pill` or `icon` it's Google's standard button, as Google draws it.
export default function GoogleButton({ fallback, disabled, onError, icon = false, pill = null, getCaptcha }) {
  const box = useRef(null), wrap = useRef(null), drawn = useRef(200);
  const captcha = useRef(getCaptcha);
  captcha.current = getCaptcha;
  const [mode, setMode] = useState(CLIENT_ID && allowedHere() ? "loading" : "fallback"); // loading | google | fallback

  useEffect(() => {
    if (!CLIENT_ID || !allowedHere()) return;
    let gone = false;
    const warn = console.warn, error = console.error;
    const watch = (orig) => (...a) => { if (/origin is not allowed|not a valid origin|GSI_LOGGER.*origin/i.test(a.join(" "))) { if (!gone) setMode("fallback"); } return orig.apply(console, a); };
    console.warn = watch(warn); console.error = watch(error);
    const timer = setTimeout(() => { if (!gone) setMode((m) => (m === "loading" ? "fallback" : m)); }, 5000);
    (async () => {
      try {
        await loadScript();
        const [raw, hashed] = await makeNonce();
        if (gone) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          nonce: hashed,
          ux_mode: "popup",
          itp_support: true,
          use_fedcm_for_button: true,
          callback: async ({ credential }) => {
            let captchaToken;
            try { captchaToken = await captcha.current?.(); } catch (e) { onError?.(e.message); return; }
            const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token: credential, nonce: raw, ...(captchaToken ? { options: { captchaToken } } : {}) });
            if (error) onError?.(error.message);
          },
        });
        if (pill) {
          const width = drawn.current = Math.min(400, Math.max(200, Math.round(box.current?.parentElement?.clientWidth || 200)));
          window.google.accounts.id.renderButton(box.current, { type: "standard", theme: "outline", size: "large", shape: "pill", text: "signin_with", logo_alignment: "left", width });
        } else if (icon) {
          window.google.accounts.id.renderButton(box.current, { type: "icon", theme: "filled_black", size: "large", shape: "circle" });
        } else {
          const width = Math.min(400, Math.max(240, Math.round(box.current?.parentElement?.clientWidth || 320)));
          window.google.accounts.id.renderButton(box.current, { type: "standard", theme: "filled_black", size: "large", shape: "pill", text: "continue_with", logo_alignment: "center", width });
        }
        clearTimeout(timer);
        setMode("google");
      } catch {
        if (!gone) setMode("fallback");
      }
    })();
    return () => { gone = true; clearTimeout(timer); console.warn = warn; console.error = error; };
  }, []);

  // Google draws its button between 200 and 400 wide. Stretched, it covers the whole pill at any width.
  useEffect(() => {
    const el = wrap.current;
    if (!pill || !el || typeof ResizeObserver === "undefined") return undefined;
    const fit = () => el.style.setProperty("--sx", Math.max(1.1, (el.clientWidth / drawn.current) * 1.1).toFixed(3));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode]);

  if (mode === "fallback") return fallback;
  if (pill) return (
    <div ref={wrap} className={`gate-google as-pill ${mode === "google" ? "ready" : ""} ${disabled ? "off" : ""}`} aria-busy={mode === "loading"}>
      <span className="gate-pill" aria-hidden="true">{pill}</span>
      <div className="gate-google-real"><div ref={box} /></div>
    </div>
  );
  return (
    <div className={`gate-google ${icon ? "icon" : ""} ${mode === "google" ? "ready" : ""} ${disabled ? "off" : ""}`} aria-busy={mode === "loading"}>
      <div ref={box} />
    </div>
  );
}
