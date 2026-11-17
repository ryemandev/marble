// A deploy removes the old build's files. A tab still running that build can't fetch a screen it hasn't loaded yet,
// so it reloads onto the new build, once. If the reload doesn't cure it, the error carries on to the crash screen and
// the crash report, which is what a real download failure should do.
const KEY = "marble-stale-reload";
const QUIET_MS = 60000;

export function reloadOnce(storage, now, reload) {
  try {
    if (now - (Number(storage.getItem(KEY)) || 0) < QUIET_MS) return false;
    storage.setItem(KEY, String(now)); // no note kept, no reload: without it this could loop
  } catch { return false; }
  reload();
  return true;
}

export function watchForNewBuild() {
  addEventListener("vite:preloadError", (e) => {
    let storage = null;
    try { storage = sessionStorage; } catch {}
    if (storage && reloadOnce(storage, Date.now(), () => location.reload())) e.preventDefault();
  });
}
