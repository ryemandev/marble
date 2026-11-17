const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const MAX_SIDE = 2000;
export const THUMB_SIDE = 480;
export const TARGET = 1_000_000; // about 1 MB
const THUMB_TARGET = 80_000;
export const LIMIT = 2_000_000; // the bucket refuses anything bigger
const MAX_IN = 40_000_000; // what we'll try to open at all

// Short, so a phone's toast holds them whole
export const MESSAGES = {
  heic: "This browser can't open HEIC photos. Save it as a JPEG and try again.",
  type: "That isn't a photo. Use a JPEG, PNG, WebP or GIF.",
  broken: "That photo couldn't be opened. Try it as a JPEG.",
  big: "That photo is too large to open. Try a smaller copy.",
  full: "This page has 8 photos. Start a new page for more.",
};
const fail = (k) => Object.assign(new Error(MESSAGES[k]), { kind: k });

export function sniff(b) {
  if (!b || b.length < 12) return null;
  const at = (i, s) => [...s].every((c, j) => b[i + j] === c.charCodeAt(0));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && at(1, "PNG\r\n")) return "image/png";
  if (at(0, "GIF87a") || at(0, "GIF89a")) return "image/gif";
  if (at(0, "RIFF") && at(8, "WEBP")) return "image/webp";
  if (at(4, "ftyp") && ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].some((x) => at(8, x))) return "image/heic";
  if (at(4, "ftyp") && (at(8, "avif") || at(8, "avis"))) return "image/avif";
  return null;
}

// w × h scaled to fit within max on the long side (never up)
export function fitSize(w, h, max) {
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

async function shrink(img, max, target, io) {
  let { w, h } = fitSize(img.width, img.height, max);
  let last = null;
  for (let round = 0; round < 6; round++) {
    for (const q of [0.86, 0.78, 0.7]) {
      last = { ...(await io.encode(img, w, h, q)), w, h };
      if (last.blob.size <= target) return last;
    }
    w = Math.max(1, Math.round(w * 0.8)); h = Math.max(1, Math.round(h * 0.8));
  }
  return last;
}

export async function processImage(file, io = browserIO()) {
  if (!file || !file.size) throw fail("broken");
  if (file.size > MAX_IN) throw fail("big");
  const kind = sniff(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  const heic = kind === "image/heic" || /\.hei[cf]$/i.test(file.name || "") || /hei[cf]/i.test(file.type || "");
  if (!ACCEPTED.includes(kind) && !heic && kind !== "image/avif") throw fail("type");
  let img = null;
  try { img = await io.decode(file); } catch { img = null; }
  if (!img || !img.width || !img.height) throw fail(heic ? "heic" : "broken");
  try {
    const full = await shrink(img, MAX_SIDE, TARGET, io);
    const thumb = await shrink(img, THUMB_SIDE, THUMB_TARGET, io);
    if (!full || full.blob.size > LIMIT) throw fail("big");
    return { full, thumb };
  } finally {
    img.close?.();
  }
}

/* ---------- In the browser ---------- */

async function decodeFile(file) {
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch { }
  }
  const url = URL.createObjectURL(file);
  try {
    const el = new Image();
    el.decoding = "async";
    el.src = url;
    await el.decode();
    return { width: el.naturalWidth, height: el.naturalHeight, source: el, close() {} };
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

let webpOk = null;
async function encodeCanvas(img, w, h, q) {
  const off = typeof OffscreenCanvas === "function";
  const canvas = off ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  const toBlob = (type) => (off ? canvas.convertToBlob({ type, quality: q }) : new Promise((r) => canvas.toBlob(r, type, q)));
  if (webpOk !== false) {
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img.source || img, 0, 0, w, h);
    const b = await toBlob("image/webp");
    if (b && b.type === "image/webp") { webpOk = true; return { blob: b, type: "image/webp" }; }
    webpOk = false;
  }
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img.source || img, 0, 0, w, h);
  const b = await toBlob("image/jpeg");
  return { blob: b, type: "image/jpeg" };
}

const browserIO = () => ({ decode: decodeFile, encode: encodeCanvas });
