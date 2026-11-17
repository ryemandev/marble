import { useCallback, useEffect, useState } from "react";
import { supabase } from "../live/supabase";

const previewing = () => new URLSearchParams(location.search).has("preview");

export async function rpc(name, args) {
  if (import.meta.env.DEV && previewing()) return (await import("./preview.js")).answer(name, args);
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    const e = new Error(error.message || "Couldn't reach Marble. Check your connection.");
    e.code = error.code;
    e.hint = error.hint;
    throw e;
  }
  return data;
}

// Suspend, lift a suspension or delete another trader's account, through the admin-account function
export async function accountAction(action, user, confirm) {
  if (import.meta.env.DEV && previewing()) { await new Promise((r) => setTimeout(r, 500)); return { ok: true }; }
  const { data, error } = await supabase.functions.invoke("admin-account", { body: { action, user, confirm } });
  if (error) {
    let msg = null;
    try { msg = (await error.context?.json())?.error; } catch { /* no body */ }
    throw new Error(msg || "Couldn't reach Marble. Check your connection.");
  }
  return data;
}

export function useRpc(name, args, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const load = useCallback(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    rpc(name, args).then(
      (data) => live && setState({ data, error: null, loading: false }),
      (error) => live && setState({ data: null, error, loading: false }),
    );
    return () => { live = false; };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(load, [load]);
  return { ...state, reload: load };
}

export async function whoAmI() {
  if (import.meta.env.DEV && previewing()) return (await import("./preview.js")).who();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { state: "out" };
  const { data: admin } = await supabase.rpc("is_admin");
  if (!admin) return { state: "trader", email: session.user.email };
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel().catch(() => ({ data: null }));
  return { state: aal?.currentLevel === "aal2" ? "in" : "two-step", email: session.user.email, id: session.user.id };
}
