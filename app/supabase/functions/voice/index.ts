const env = (k: string) => Deno.env.get(k) || "";
const SB = env("SUPABASE_URL"), KEY = env("SUPABASE_SERVICE_ROLE_KEY");
const LK = env("LIVEKIT_URL"), LK_KEY = env("LIVEKIT_API_KEY"), LK_SECRET = env("LIVEKIT_API_SECRET");
const ORIGINS = ["https://trademarble.app", "https://www.trademarble.app", ...env("MARBLE_ORIGINS").split(",").map((s) => s.trim()).filter(Boolean)];
const te = new TextEncoder();
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const part = (o: unknown) => b64(te.encode(JSON.stringify(o)));
const UUID = /^[0-9a-f-]{36}$/;

// LiveKit token: HS256 JWT
export async function sign(claims: Record<string, unknown>, ttl: number, now = Math.floor(Date.now() / 1000)) {
  const body = `${part({ alg: "HS256", typ: "JWT" })}.${part({ iss: LK_KEY, nbf: now - 10, exp: now + ttl, ...claims })}`;
  const k = await crypto.subtle.importKey("raw", te.encode(LK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `${body}.${b64(new Uint8Array(await crypto.subtle.sign("HMAC", k, te.encode(body))))}`;
}

const cors = (req: Request) => {
  const o = req.headers.get("Origin") || "";
  return ORIGINS.includes(o) ? { "Access-Control-Allow-Origin": o, "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS", Vary: "Origin" } : {};
};
const reply = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });

async function rpc(name: string, args: Record<string, unknown>) {
  const r = await fetch(`${SB}/rest/v1/rpc/${name}`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(args) });
  const j = await r.json().catch(() => null);
  return r.ok ? { ok: true, data: j } : { ok: false, code: j?.code || "", message: j?.message || "" };
}

// LiveKit's server API (1-minute admin token)
async function room(method: string, name: string, body: Record<string, unknown>) {
  const token = await sign({ sub: "marble", video: { room: name, roomAdmin: true } }, 60);
  const r = await fetch(`${LK.replace(/^wss?:/, "https:")}/twirp/livekit.RoomService/${method}`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ room: name, ...body }),
  });
  await r.body?.cancel();
  if (!r.ok && r.status !== 404) throw new Error(`${method} ${r.status}`);
}

const perm = (talk: boolean) => ({ canSubscribe: true, canPublish: talk, canPublishData: false, canPublishSources: talk ? ["MICROPHONE"] : [] });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return reply(req, { error: "POST only" }, 405);
  if (!LK || !LK_KEY || !LK_SECRET) return reply(req, { error: "Voice sessions aren't switched on yet." }, 503);
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const u = jwt ? await fetch(`${SB}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${jwt}` } }) : null;
  const user = u?.ok ? await u.json() : (await u?.body?.cancel(), null);
  if (!user?.id) return reply(req, { error: "Sign in again." }, 401);
  // Auth checked it above, so its aal can be read
  let aal2 = false;
  try { aal2 = JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).aal === "aal2"; } catch { }
  const b = await req.json().catch(() => ({}));
  if (!UUID.test(b?.session || "")) return reply(req, { error: "Which session?" }, 400);
  // Only the database's own refusals keep their words. Anything else stays in the logs
  const refuse = (r: { code?: string; message?: string }) => {
    if (r.code === "42501" || r.code === "P0001") return reply(req, { error: r.message || "Try again." }, r.code === "42501" ? 403 : 400);
    console.error("[voice]", r.code, r.message);
    return reply(req, { error: "Voice is having a moment. Try again." }, 502);
  };

  try {
    if (b.op === "join") {
      const r = await rpc("voice_join", { p_user: user.id, p_session: b.session, p_aal2: aal2 });
      if (!r.ok) return refuse(r);
      const { room: name, role, who } = r.data;
      const talk = role === "host" || role === "guest";
      const token = await sign({
        sub: who.handle, name: who.handle, metadata: JSON.stringify({ ...who, role }),
        video: { room: name, roomJoin: true, canSubscribe: true, canPublish: talk, canPublishSources: talk ? ["microphone"] : [], canPublishData: false, canUpdateOwnMetadata: false },
      }, 600);
      return reply(req, { url: LK, token, role });
    }
    if (b.op === "mod") {
      const r = await rpc("voice_mod", { p_user: user.id, p_session: b.session, p_handle: b.handle ?? null, p_action: b.action, p_days: [1, 7].includes(b.days) ? b.days : null, p_aal2: aal2 });
      if (!r.ok) return refuse(r);
      const name = r.data.room, who = { identity: String(b.handle || "") };
      if (b.action === "mute") {
        if (!/^TR_[A-Za-z0-9]{1,40}$/.test(b.track || "")) return reply(req, { error: "Which microphone?" }, 400);
        await room("MutePublishedTrack", name, { ...who, trackSid: b.track, muted: true });
      } else if (b.action === "listen" || b.action === "speak") {
        await room("UpdateParticipant", name, { ...who, permission: perm(b.action === "speak") });
      } else if (b.action === "remove" || b.action === "ban") {
        await room("RemoveParticipant", name, who);
      } else if (b.action === "end") {
        await room("DeleteRoom", name, {});
      }
      return reply(req, { ok: true });
    }
    return reply(req, { error: "Unknown op" }, 400);
  } catch (e) {
    console.error(e);
    return reply(req, { error: "Voice is having a moment. Try again." }, 502);
  }
});
