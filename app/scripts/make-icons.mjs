import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const OUT = new URL("../public/", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
// Phones keep icons they've fetched, so changed icons get a new ?v= here and in every page head (tests/seal.test.js checks they match)
const V = "4";
// The mark fills more of its tile at icon sizes, so it still reads at Google's 16px and inside its circle crop
const FILL = 1.35;
const png = (svg) => sharp(Buffer.from(svg), { density: 72 }).png({ compressionLevel: 9 });

// The owner's mark from public/brand, black on white. Marble is light everywhere, so there's one version.
const MARK = (await readFile(OUT + "brand/marble-icon.svg", "utf8")).replace(/^<svg[^>]*>/, "").replace("</svg>", "").replace(/<rect[^>]*\/>/, "");
const icon = ({ px, tile = "#fff", ink = "#000", scale = 1 }) => {
  const off = (1024 * (1 - scale)) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 1024 1024">${tile ? `<rect width="1024" height="1024" fill="${tile}"/>` : ""}<g transform="translate(${off} ${off}) scale(${scale})">${MARK.replaceAll("#fff", ink)}</g></svg>`;
};

await writeFile(OUT + "favicon.svg", icon({ px: 100, scale: FILL }).replace(' width="100" height="100"', ""));
console.log("favicon.svg");

for (const size of [48, 96, 192]) {
  await png(icon({ px: size, scale: FILL })).toFile(OUT + `favicon-${size}.png`);
  console.log(`favicon-${size}.png`);
}
const frames = await Promise.all([16, 32, 48].map(async (size) => ({ size, png: await png(icon({ px: size, scale: FILL })).toBuffer() })));
const dir = Buffer.alloc(6 + 16 * frames.length);
dir.writeUInt16LE(1, 2); // type 1: icon
dir.writeUInt16LE(frames.length, 4);
let offset = dir.length;
frames.forEach(({ size, png }, i) => {
  const e = 6 + 16 * i;
  dir.writeUInt8(size, e); // width
  dir.writeUInt8(size, e + 1); // height
  dir.writeUInt16LE(1, e + 4); // colour planes
  dir.writeUInt16LE(32, e + 6); // bits per pixel
  dir.writeUInt32LE(png.length, e + 8);
  dir.writeUInt32LE(offset, e + 12);
  offset += png.length;
});
await writeFile(OUT + "favicon.ico", Buffer.concat([dir, ...frames.map((f) => f.png)]));
console.log("favicon.ico (16, 32, 48)");

for (const [name, px, scale] of [["apple-touch-icon.png", 180, FILL], ["icon-192.png", 192, FILL], ["icon-512.png", 512, FILL], ["icon-maskable-512.png", 512, 1.1]]) {
  await png(icon({ px, scale })).toFile(OUT + name);
  console.log(name);
}

// Android draws a notification badge from its shape alone, so this one is white on nothing
await png(icon({ px: 96, tile: null, ink: "#fff", scale: 1.2 })).toFile(OUT + "badge-96.png");
console.log("badge-96.png");

const SPLASH = [[440, 956, 3], [420, 912, 3], [402, 874, 3], [430, 932, 3], [393, 852, 3], [428, 926, 3], [390, 844, 3], [375, 812, 3], [414, 896, 3], [414, 896, 2], [414, 736, 3], [375, 667, 2]];
await mkdir(OUT + "splash", { recursive: true });
for (const [w, h, dpr] of SPLASH) {
  const W = w * dpr, H = h * dpr, size = 96 * dpr;
  const mark = await png(icon({ px: size, tile: null })).toBuffer();
  await sharp({ create: { width: W, height: H, channels: 3, background: "#fff" } })
    .composite([{ input: mark, left: Math.round((W - size) / 2), top: Math.round((H - size) / 2) }])
    .png({ compressionLevel: 9, palette: true }).toFile(OUT + `splash/apple-${W}x${H}.png`);
}
console.log(`splash/: ${SPLASH.length} iPhone launch screens`);

await writeFile(OUT + "manifest.webmanifest", JSON.stringify({
  id: "/desk/",
  name: "Marble",
  short_name: "Marble",
  description: "The trading journal for every account you trade.",
  lang: "en-GB",
  start_url: "/desk/",
  scope: "/desk/",
  display: "standalone",
  background_color: "#ffffff",
  theme_color: "#ffffff",
  categories: ["finance", "productivity"],
  icons: [
    { src: `/icon-192.png?v=${V}`, sizes: "192x192", type: "image/png", purpose: "any" },
    { src: `/icon-512.png?v=${V}`, sizes: "512x512", type: "image/png", purpose: "any" },
    { src: `/icon-maskable-512.png?v=${V}`, sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
  // A long press on the icon (Android)
  shortcuts: [
    { name: "Journal", url: "/desk/#journal", icons: [{ src: `/icon-192.png?v=${V}`, sizes: "192x192", type: "image/png" }] },
    { name: "Floor", url: "/desk/#community", icons: [{ src: `/icon-192.png?v=${V}`, sizes: "192x192", type: "image/png" }] },
  ],
}, null, 2));
console.log("manifest.webmanifest");
