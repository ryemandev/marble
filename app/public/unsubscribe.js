(() => {
  const FN = "https://your-project-ref.supabase.co/functions/v1/email-unsubscribe";
  const q = new URLSearchParams(location.search);
  const u = q.get("u") || "", t = q.get("t") || "";
  try { if (location.search) history.replaceState(null, "", location.pathname); } catch {}
  const $ = (id) => document.getElementById(id);
  const show = (id) => { for (const s of ["ask", "done", "bad"]) $(s).hidden = s !== id; };
  if (!/^[0-9a-f-]{36}$/i.test(u) || t.length !== 32) { show("bad"); return; }
  const go = $("go");
  go.addEventListener("click", async () => {
    go.disabled = true;
    go.textContent = "Unsubscribing…";
    $("error").hidden = true;
    try {
      const r = await fetch(FN, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ u, t }) });
      if (r.ok) { show("done"); return; }
      if (r.status === 400) { show("bad"); return; }
      throw new Error(String(r.status));
    } catch {
      $("error").textContent = "Couldn't reach Marble just now. Check your connection and try again.";
      $("error").hidden = false;
      go.disabled = false;
      go.textContent = "Unsubscribe me";
    }
  });
})();
