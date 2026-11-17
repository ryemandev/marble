export const ALLOW_HEADERS = "authorization, x-client-info, apikey, content-type";

export function corsFor(origin, origins) {
  const o = String(origin || "");
  return {
    Vary: "Origin",
    "Access-Control-Allow-Headers": ALLOW_HEADERS,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    ...(o && origins.includes(o) ? { "Access-Control-Allow-Origin": o } : {}),
  };
}

export function withCors(req, res, origins) {
  const h = new Headers(res.headers);
  for (const k of ["Access-Control-Allow-Origin", "Access-Control-Allow-Headers", "Access-Control-Allow-Methods", "Vary"]) h.delete(k);
  for (const [k, v] of Object.entries(corsFor(req.headers.get("Origin"), origins))) h.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

export const corsHandler = (handler, origins) => async (req, info) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsFor(req.headers.get("Origin"), origins) });
  return withCors(req, await handler(req, info), origins);
};
