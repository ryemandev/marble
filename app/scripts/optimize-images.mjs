import sharp from "sharp";
import { readdir, mkdir } from "node:fs/promises";
import { join, parse } from "node:path";
import { PICTURES } from "../src/backdrop.js";

const SRC = new URL("../../art/", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const OUT = new URL("../public/art/", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const FOLDERS = ["gods", "cars", "japan", "anime", "money", "prints", "textures", "masters"];
const WIDTHS = [[160, 72], [480, 74], [960, 76], [1600, 78]]; // [width, WebP quality]
// A background fills the whole screen, so it gets its own two files, at WebP 86:
// name-full.webp, the whole picture up to 3840 across (a 4K screen), for wide screens;
// name-tall.webp, the middle 3:4 of it at up to 2880 high (the tallest phone at 3x is 2868), for upright ones
const BACKDROP_EDGE = 3840, TALL_HEIGHT = 2880, BACKDROP_QUALITY = 86;
const ONLY_BACKDROPS = process.argv.includes("--backdrops"); // npm run images -- --backdrops: just the background pictures, every size
// npm run images -- --only cars,gods: just those folders' four sizes, and no background files
const onlyAt = process.argv.findIndex((a) => a === "--only" || a.startsWith("--only="));
const ONLY = onlyAt < 0 ? null
  : (process.argv[onlyAt].includes("=") ? process.argv[onlyAt].split("=")[1] : process.argv[onlyAt + 1] ?? "").split(",").map((f) => f.trim()).filter(Boolean);
if (ONLY && (!ONLY.length || ONLY.some((f) => !FOLDERS.includes(f)))) throw new Error(`--only takes folders from: ${FOLDERS.join(",")}`);

const treat = (img) => img.grayscale() /* the brand is black, white and silver only */ .linear(1.08, -6);
const webp = (quality) => ({ quality, smartSubsample: true, effort: 6 });

async function sizes(folder, file) {
  const name = parse(file).name;
  for (const [w, quality] of WIDTHS) {
    const out = join(OUT, folder, w === 1600 ? `${name}.webp` : `${name}-${w}.webp`);
    await treat(sharp(join(SRC, folder, file)).resize({ width: w, height: w, fit: "inside", withoutEnlargement: true }))
      .webp({ quality })
      .toFile(out);
  }
  console.log(folder + "/" + name);
}

if (!ONLY_BACKDROPS) {
  for (const folder of ONLY ?? FOLDERS) {
    await mkdir(join(OUT, folder), { recursive: true });
    for (const file of await readdir(join(SRC, folder))) if (/\.jpe?g$/i.test(file)) await sizes(folder, file);
  }
}

for (const p of ONLY ? [] : PICTURES) {
  const [folder, name] = p.src.replace(/^\/art\//, "").split("/");
  const file = (await readdir(join(SRC, folder))).find((f) => parse(f).name === name && /\.jpe?g$/i.test(f));
  if (!file) throw new Error(`No original for ${p.src}`);
  const src = join(SRC, folder, file);
  if (ONLY_BACKDROPS) await sizes(folder, file);
  const full = await treat(sharp(src).resize({ width: BACKDROP_EDGE, height: BACKDROP_EDGE, fit: "inside", withoutEnlargement: true, kernel: "lanczos3" }))
    .webp(webp(BACKDROP_QUALITY))
    .toFile(join(OUT, folder, `${name}-full.webp`));
  // Never larger than the original: an original under 2880 high gives its own height
  const { height } = await sharp(src).metadata();
  const h = Math.min(TALL_HEIGHT, height), w = Math.round((h * 3) / 4);
  const tall = await treat(sharp(src).resize({ width: w, height: h, fit: "cover", position: "centre", kernel: "lanczos3" }))
    .webp(webp(BACKDROP_QUALITY))
    .toFile(join(OUT, folder, `${name}-tall.webp`));
  console.log(`${p.src}: full ${full.width}x${full.height} ${Math.round(full.size / 1024)}KB, tall ${tall.width}x${tall.height} ${Math.round(tall.size / 1024)}KB`);
}
