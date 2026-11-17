import { useSyncExternalStore } from "react";

let apiP = null;
export function loadYouTube(timeout = 12000) {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiP) return apiP;
  apiP = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    const timer = setTimeout(() => { apiP = null; reject(new Error("YouTube took too long")); }, timeout);
    window.onYouTubeIframeAPIReady = () => { clearTimeout(timer); try { prev?.(); } catch {} resolve(window.YT); };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    s.onerror = () => { clearTimeout(timer); apiP = null; s.remove(); reject(new Error("YouTube couldn't load")); };
    document.head.appendChild(s);
  });
  return apiP;
}

let now = { t: null, live: false, videoId: null };
const subs = new Set();
export const lessonClock = {
  get: () => now,
  set(next) {
    const t = next.t == null ? null : Math.floor(next.t);
    if (t === now.t && next.live === now.live && next.videoId === now.videoId) return;
    now = { t, live: !!next.live, videoId: next.videoId ?? null };
    subs.forEach((f) => f());
  },
  subscribe: (f) => (subs.add(f), () => subs.delete(f)),
};
export const useLessonClock = () => useSyncExternalStore(lessonClock.subscribe, lessonClock.get, lessonClock.get);
