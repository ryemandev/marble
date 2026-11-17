const te = new TextEncoder();
export const b64u = {
  enc: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  dec: (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0)),
};
const concat = (...parts) => Uint8Array.from(parts.flatMap((p) => [...p]));
const hkdf = async (salt, ikm, info, bytes) => new Uint8Array(await crypto.subtle.deriveBits(
  { name: "HKDF", hash: "SHA-256", salt, info }, await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]), bytes * 8));

export async function encrypt(text, p256dh, auth, fixed = {}) {
  const device = b64u.dec(p256dh);
  const mine = fixed.keys || await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const minePublic = new Uint8Array(await crypto.subtle.exportKey("raw", mine.publicKey));
  const theirs = await crypto.subtle.importKey("raw", device, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: theirs }, mine.privateKey, 256));
  const ikm = await hkdf(b64u.dec(auth), shared, concat(te.encode("WebPush: info\0"), device, minePublic), 32);
  const salt = fixed.salt || crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // One record: the text, then the 0x02 that marks the last one
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(te.encode(text), Uint8Array.of(2))));
  const head = new Uint8Array(21);
  head.set(salt);
  new DataView(head.buffer).setUint32(16, 4096); // record size
  head[20] = minePublic.length;
  return concat(head, minePublic, sealed);
}

const signers = new Map();
export async function vapid(endpoint, { publicKey, privateKey, subject }, now = Date.now()) {
  if (!signers.has(privateKey)) {
    const pub = b64u.dec(publicKey);
    signers.set(privateKey, await crypto.subtle.importKey("jwk",
      { kty: "EC", crv: "P-256", x: b64u.enc(pub.slice(1, 33)), y: b64u.enc(pub.slice(33, 65)), d: privateKey, ext: true },
      { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]));
  }
  const part = (o) => b64u.enc(te.encode(JSON.stringify(o)));
  const unsigned = `${part({ typ: "JWT", alg: "ES256" })}.${part({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })}`;
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, signers.get(privateKey), te.encode(unsigned));
  return `vapid t=${unsigned}.${b64u.enc(sig)}, k=${publicKey}`;
}

export async function sendPush(device, payload, keys, { ttl = 3600, urgency = "normal", topic } = {}) {
  const headers = { Authorization: await vapid(device.endpoint, keys), "Content-Encoding": "aes128gcm", TTL: String(ttl), Urgency: urgency };
  if (topic) headers.Topic = topic;
  const res = await fetch(device.endpoint, { method: "POST", headers, body: await encrypt(JSON.stringify(payload), device.p256dh, device.auth) });
  await res.body?.cancel();
  return res.status;
}
