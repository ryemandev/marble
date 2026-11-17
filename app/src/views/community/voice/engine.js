import { useSyncExternalStore } from "react";

const IDLE = { session: null, status: "idle", role: null, talking: [], count: 0, mic: false, canTalk: false, needsTap: false, tracks: {}, muted: {}, gone: null, error: null };
let state = IDLE;
let conn = null; // { mic(on), tap(), leave() }
const subs = new Set();
const set = (patch) => { state = { ...state, ...patch }; subs.forEach((f) => f()); };
export const voiceState = () => state;
export const useVoice = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, voiceState, voiceState);

async function liveConnect(url, token, onGone) {
  const { Room, RoomEvent, Track, DisconnectReason } = await import("livekit-client");
  const room = new Room({ adaptiveStream: false, dynacast: false, audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const players = new Set();
  const snapshot = () => {
    const all = [room.localParticipant, ...room.remoteParticipants.values()];
    const tracks = {}, muted = {};
    for (const p of all) {
      const pub = p.getTrackPublication(Track.Source.Microphone);
      if (pub?.trackSid) tracks[p.identity] = pub.trackSid;
      muted[p.identity] = !pub || pub.isMuted;
    }
    set({ talking: room.activeSpeakers.map((p) => p.identity), count: all.length, tracks, muted,
      canTalk: !!room.localParticipant.permissions?.canPublish, mic: room.localParticipant.isMicrophoneEnabled, needsTap: !room.canPlaybackAudio });
  };
  room
    .on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Audio) { const el = track.attach(); el.dataset.voice = ""; document.body.appendChild(el); players.add(el); }
      snapshot();
    })
    .on(RoomEvent.TrackUnsubscribed, (track) => { track.detach().forEach((el) => { el.remove(); players.delete(el); }); snapshot(); })
    // Moved back to listening: the microphone goes off at once
    .on(RoomEvent.ParticipantPermissionsChanged, (_, p) => {
      if (p === room.localParticipant && !p.permissions?.canPublish) room.localParticipant.setMicrophoneEnabled(false).catch(() => {});
      snapshot();
    })
    .on(RoomEvent.Disconnected, (reason) => {
      players.forEach((el) => el.remove());
      onGone(reason === DisconnectReason.PARTICIPANT_REMOVED ? "removed" : reason === DisconnectReason.ROOM_DELETED ? "ended" : reason === DisconnectReason.CLIENT_INITIATED ? null : "dropped");
    });
  for (const e of [RoomEvent.ActiveSpeakersChanged, RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected, RoomEvent.TrackMuted, RoomEvent.TrackUnmuted,
    RoomEvent.LocalTrackPublished, RoomEvent.LocalTrackUnpublished, RoomEvent.AudioPlaybackStatusChanged]) room.on(e, snapshot);
  await room.connect(url, token, { autoSubscribe: true });
  await room.startAudio().catch(() => {});
  snapshot();
  return {
    mic: async (on) => { await room.localParticipant.setMicrophoneEnabled(on); snapshot(); },
    tap: () => room.startAudio().then(snapshot),
    leave: () => room.disconnect(),
  };
}

function demoConnect(session) {
  const onAir = (session.people || []).map((p) => p.handle);
  let i = 0, timer = 0;
  const next = () => {
    const speaking = i % 4 !== 3; // every fourth beat is a pause
    set({ talking: speaking && onAir.length ? [onAir[(i * 2 + 1) % onAir.length]] : [] });
    i++;
    timer = setTimeout(next, speaking ? 4200 + (i % 3) * 900 : 1100);
  };
  set({ count: 41, canTalk: false, mic: false, needsTap: false, muted: Object.fromEntries(onAir.map((h, k) => [h, k === 2])) });
  next();
  return { mic: async () => {}, tap: async () => {}, leave: () => clearTimeout(timer) };
}

export async function tuneIn(session, join) {
  if (state.session?.id === session.id && state.status !== "error") return;
  await leave();
  set({ ...IDLE, session, status: "joining" });
  try {
    const r = await join(session.id);
    if (state.session?.id !== session.id) return; // left while joining
    const gone = (why) => { conn = null; set({ ...IDLE, gone: why ? { why, title: session.title } : null }); };
    conn = r.demo ? demoConnect(session) : await liveConnect(r.url, r.token, gone);
    set({ status: "on", role: r.role || "listener" });
  } catch (e) {
    conn = null;
    set({ ...IDLE, session, status: "error", error: e?.message || "Couldn't tune in. Try again." });
    throw e;
  }
}
export async function leave() {
  const c = conn;
  conn = null;
  if (c) { try { await c.leave(); } catch { } }
  set(IDLE);
}
export const setMic = (on) => conn?.mic(on);
export const tapToPlay = () => conn?.tap();
export const dismissGone = () => set({ gone: null });
export const refreshSession = (s) => { if (state.session?.id === s?.id) set({ session: { ...state.session, ...s } }); };
