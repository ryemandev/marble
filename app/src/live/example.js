import { getState, loadState, onAnyChange, setExampleHooks, setState } from "../store";
import { supabase } from "./supabase";

let startedThisVisit = false;
const FADE_MS = 480;

export async function startExample({ tour = true, replay = false } = {}) {
  if (getState().example?.on) { if (tour) setState({ tourOpen: true }); return; }
  startedThisVisit = true;
  const { buildExample } = await import("./exampleData");
  const { ticks, ...data } = buildExample();
  setState({ example: { on: true, data, ticks, deskAccount: null, replay, baseline: getState().logged.length }, tourOpen: tour, tourStep: 0 });
}

// The walkthrough has been seen or skipped: it doesn't open by itself again
export async function markDone() {
  const me = getState().me;
  if (!me || me.private?.tour_done_at) return;
  const at = new Date().toISOString();
  loadState({ me: { ...me, private: { ...me.private, tour_done_at: at } } });
  const { error } = await supabase.from("profile_private").update({ tour_done_at: at }).eq("id", me.id);
  if (error) console.warn("Marble couldn't save the walkthrough as done:", error.message);
}

export function endExample({ now = false } = {}) {
  const ex = getState().example;
  if (!ex?.on) return;
  markDone();
  // Back at the top of the trader's own desk, on the Numbers tab, whatever the tour last showed
  if (now || matchMedia("(prefers-reduced-motion: reduce)").matches) { setState({ example: null, tourOpen: false, exampleSwap: false, statsTab: "numbers" }); window.scrollTo(0, 0); return; }
  setState({ exampleSwap: true, tourOpen: false });
  setTimeout(() => { setState({ example: null, statsTab: "numbers" }); window.scrollTo(0, 0); }, FADE_MS / 2);
  setTimeout(() => setState({ exampleSwap: false }), FADE_MS);
}
setExampleHooks({ end: endExample });

export function maybeStartExample() {
  const s = getState();
  if (startedThisVisit || s.example?.on || !s.me || s.me.private?.tour_done_at || s.logged.length > 0) return;
  startExample({ tour: true });
}

onAnyChange(() => {
  const s = getState();
  if (s.example?.on && s.logged.length > s.example.baseline) endExample({ now: true });
});
