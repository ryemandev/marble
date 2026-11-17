import { LIVE } from "../../mode";
import { loadState } from "../../store";
import { source } from "./source";

let started = false;
let timer = 0;
const ping = () => { clearTimeout(timer); timer = setTimeout(refresh, 400); };
function refresh() {
  if (LIVE) source.dmWatch(ping);
  return source.dmUnread().then((n) => loadState({ dmUnread: n })).catch(() => {});
}

export function startDmCount() {
  if (started) return;
  started = true;
  refresh();
  if (!LIVE) return;
  setInterval(() => { if (!document.hidden) refresh(); }, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
}
