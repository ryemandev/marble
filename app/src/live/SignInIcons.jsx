import { useEffect, useState } from "react";
import GoogleButton from "./GoogleButton";

const URL_ = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const PROVIDERS = [
  {
    id: "discord", label: "Discord",
    mark: (
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M20.32 4.37A19.8 19.8 0 0 0 15.37 2.8a13.7 13.7 0 0 0-.63 1.3 18.4 18.4 0 0 0-5.48 0 12.7 12.7 0 0 0-.64-1.3 19.7 19.7 0 0 0-4.95 1.53C.53 9.07-.32 13.66.1 18.18a19.9 19.9 0 0 0 6.07 3.06c.49-.66.93-1.37 1.3-2.11a12.9 12.9 0 0 1-2.04-.98l.5-.39a14.2 14.2 0 0 0 12.14 0l.5.39c-.65.39-1.33.71-2.04.98.38.74.81 1.45 1.3 2.11a19.8 19.8 0 0 0 6.07-3.06c.5-5.24-.84-9.79-3.58-13.81ZM8.02 15.4c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.95-2.42 2.16-2.42s2.18 1.1 2.16 2.42c0 1.34-.95 2.42-2.16 2.42Zm7.96 0c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.95-2.42 2.16-2.42s2.18 1.1 2.16 2.42c0 1.34-.94 2.42-2.16 2.42Z" />
      </svg>
    ),
  },
];

let enabledCache = null;
const enabledProviders = () => (enabledCache ||= fetch(`${URL_}/auth/v1/settings`, { headers: { apikey: KEY } })
  .then((r) => (r.ok ? r.json() : {}))
  .then((s) => s.external || {})
  .catch(() => ({})));

export default function SignInIcons({ busy, onOAuth, onError, getCaptcha }) {
  const [on, setOn] = useState({});
  useEffect(() => { let live = true; enabledProviders().then((e) => live && setOn(e)); return () => { live = false; }; }, []);
  const all = import.meta.env.DEV && location.search.includes("icons=all");
  const shown = PROVIDERS.filter((p) => all || on[p.id]);
  // Two equal pills, mark then name, on the left
  const google = (
    <>
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#4285F4" d="M21.6 12.23c0-.68-.06-1.36-.18-2.02H12v3.83h5.4a4.62 4.62 0 0 1-2 3.03v2.5h3.24c1.9-1.75 2.96-4.33 2.96-7.34Z" />
        <path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.64-2.43l-3.24-2.5c-.9.6-2.05.95-3.4.95-2.6 0-4.81-1.76-5.6-4.12H3.06v2.58A10 10 0 0 0 12 22Z" />
        <path fill="#FBBC05" d="M6.4 13.9a6 6 0 0 1 0-3.8V7.52H3.06a10 10 0 0 0 0 8.96L6.4 13.9Z" />
        <path fill="#EA4335" d="M12 5.98c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.94 5.52L6.4 10.1C7.19 7.74 9.4 5.98 12 5.98Z" />
      </svg>
      <span>Google</span>
    </>
  );
  return (
    <div className="gate-pills" role="group" aria-label="Sign in with">
      <GoogleButton pill={google} disabled={!!busy} onError={onError} getCaptcha={getCaptcha} fallback={
        <button type="button" className="gate-pill" onClick={() => onOAuth("google")} disabled={!!busy} aria-label="Sign in with Google" aria-busy={busy === "google"}>{google}</button>
      } />
      {shown.map((p) => (
        <button key={p.id} type="button" className="gate-pill" onClick={() => onOAuth(p.id, p.scopes)} disabled={!!busy}
          aria-label={`Sign in with ${p.label}`} aria-busy={busy === p.id}>
          {p.mark}<span>{p.label}</span>
        </button>
      ))}
    </div>
  );
}
