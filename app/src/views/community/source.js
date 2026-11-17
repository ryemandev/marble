import { LIVE } from "../../mode";
import { liveSource, markRoomSeen } from "../../live/Community";
import { dmLive } from "../../live/dms";
import { voiceLive } from "../../live/voice";
import { demoSource } from "./demoSource";
import { demoDms } from "./demoDms";
import { demoVoice } from "./voice/demoVoice";
import { userId } from "../../live/sync";
import { forgetHandle, forgetMessage, forgetThread, seenInbox, seenSent, seenThread } from "./dmSeen";

const demo = { ...demoSource, ...demoDms, ...demoVoice, sharePage: (args) => demoDms.sharePage(args, { addPost: (p) => demoSource.addSharedPost(p) }) };
export const dmOwner = () => (LIVE ? userId() : "demo");
const noted = (src) => ({
  ...src,
  dmInbox: async (...a) => seenInbox(dmOwner(), await src.dmInbox(...a)),
  dmThread: async (...a) => seenThread(dmOwner(), await src.dmThread(...a)),
  dmSend: async (thread, ...a) => seenSent(dmOwner(), thread, await src.dmSend(thread, ...a)),
  dmUnsend: async (id) => { const r = await src.dmUnsend(id); forgetMessage(id); return r; },
  dmLeave: async (thread) => { const r = await src.dmLeave(thread); forgetThread(thread); return r; },
  dmBlock: async (handle) => { const r = await src.dmBlock(handle); forgetHandle(handle); return r; },
});
export const source = noted(LIVE ? { ...liveSource, ...dmLive, ...voiceLive } : demo);
export const roomSeen = (room) => { if (LIVE) markRoomSeen(room); };

export const errText = (e, fallback = "That didn't go through. Check your connection and try again.") =>
  (e?.code === "P0001" && e.message ? e.message
    : e?.code === "42501" && /active plan/i.test(e.message || "") ? e.message
    : e?.code === "42501" && /row-level security/i.test(e.message || "") ? "You can't do that from this account."
    : fallback);
