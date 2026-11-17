import sharp from "sharp";
import { mkdir, readFile } from "node:fs/promises";

const OUT = new URL("../../brand/social/", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
await mkdir(OUT, { recursive: true });

const PUBLIC = new URL("../public/", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const ICON = await readFile(PUBLIC + "brand/marble-icon.svg", "utf8");

// The owner's mark as it comes, and the same mark black on white
const flipped = ICON.replaceAll("#fff", "@").replaceAll("#000", "#fff").replaceAll("@", "#000");
for (const [name, svg] of [["instagram-profile-black.png", ICON], ["instagram-profile-white.png", flipped]]) {
  await sharp(Buffer.from(svg), { density: 110 }).resize(1080, 1080).png().toFile(OUT + name);
  console.log(name);
}

// The link preview: the m, the logo used on socials and in Google, and the ink coming up under it
const W = 1200, H = 630;
const inner = ICON.replace(/^<svg[^>]*>/, "").replace("</svg>", "").replace(/<rect[^>]*\/>/, "").replaceAll("#fff", "#000");
const k = 0.62, x = 600 - 512 * k, y = 262 - 528 * k;
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/><g transform="translate(${x} ${y}) scale(${k})">${inner}</g><path d="M0 540C150 510 280 568 430 548S700 500 860 536 1080 566 1200 528V630H0Z" fill="#000"/></svg>`;
await sharp(Buffer.from(og)).flatten({ background: "#fff" }).jpeg({ quality: 90, mozjpeg: true }).toFile(PUBLIC + "og.jpg");
console.log("og.jpg");

const circle = (size) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`);
const round = async (file, size) => sharp(OUT + file).resize(size, size).composite([{ input: circle(size), blend: "dest-in" }]).png().toBuffer();
const parts = [];
for (const [row, file] of ["instagram-profile-black.png", "instagram-profile-white.png"].entries()) {
  for (const [i, size] of [300, 150, 77, 32].entries()) {
    parts.push({ input: await round(file, size), left: 40 + [0, 360, 560, 680][i], top: 40 + row * 360 + Math.round((300 - size) / 2) });
  }
}
await sharp({ create: { width: 760, height: 720, channels: 4, background: "#1a1a1a" } }).composite(parts).png().toFile(OUT + "preview.png");
console.log("preview.png");
