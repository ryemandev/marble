import { supabase } from "./supabase";

// A card's public link: the row on the server, then the picture. The server reads the money from the trades itself.
const BUCKET = "cards";
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export const linkOf = (id) => `https://trademarble.app/c/${id}`;

// Ten letters from the browser's random source. Bytes past 247 are thrown away so every letter is as likely as the next.
export function newLinkId() {
  let id = "";
  while (id.length < 10) {
    for (const b of crypto.getRandomValues(new Uint8Array(16))) if (b < 248 && id.length < 10) id += LETTERS[b % 62];
  }
  return id;
}

// A link preview wants a small picture, so the page's copy is a JPEG on white
async function asJpeg(blob) {
  const art = await createImageBitmap(blob);
  const c = Object.assign(document.createElement("canvas"), { width: art.width, height: art.height });
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(art, 0, 0);
  return new Promise((done, fail) => c.toBlob((b) => (b ? done(b) : fail(new Error("No picture"))), "image/jpeg", 0.86));
}

const words = (e) => (/not saved yet/.test(e.message) ? "That trade is still saving. Try again in a moment."
  : /Too many/.test(e.message) ? "That's today's links. Try again tomorrow."
  : "Couldn't make the link. Try again.");

export async function makeLink({ id, kind, format, trades, money, sign, blob }) {
  const jpeg = await asJpeg(blob);
  const { error } = await supabase.rpc("card_link_make", { p_id: id, p_kind: kind, p_format: format, p_trades: trades, p_money: money, p_sign: sign });
  if (error) throw new Error(words(error));
  const { error: up } = await supabase.storage.from(BUCKET).upload(`${id}.jpg`, jpeg, { contentType: "image/jpeg", upsert: false, cacheControl: "3600" });
  if (up) {
    await supabase.rpc("card_link_remove", { p_id: id });
    throw new Error("Couldn't make the link. Try again.");
  }
}

// The row first: the storage rules only let a picture go once its link is down
export async function takeLinkDown(id) {
  const { error } = await supabase.rpc("card_link_remove", { p_id: id });
  if (error) throw error;
  await supabase.storage.from(BUCKET).remove([`${id}.jpg`]);
}

export async function myLinks() {
  const { data, error } = await supabase.from("card_links").select("id, kind, made_at").is("removed_at", null).order("made_at", { ascending: false }).limit(100);
  return error ? [] : data;
}
