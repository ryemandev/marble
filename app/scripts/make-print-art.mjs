import sharp from "sharp";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const ART = join(APP, "..", "art");
const OUT = join(APP, "public", "site");

const PAPER = 236, INK = 10;

async function levels(img) {
  const { data } = await img.clone().grayscale().raw().toBuffer({ resolveWithObject: true });
  const hist = new Uint32Array(256);
  for (const v of data) hist[v]++;
  const at = (p) => { let n = 0; const want = data.length * p; for (let v = 0; v < 256; v++) { n += hist[v]; if (n >= want) return v; } return 255; };
  return { ink: at(0.01), paper: at(0.83), hi: at(0.995) };
}
// a * v + b that takes from[0] to to[0] and from[1] to to[1]
const map = (from, to) => { const a = (to[1] - to[0]) / (from[1] - from[0]); return [a, to[0] - a * from[0]]; };

const TONES = {
  async ink(img) { const l = await levels(img); return img.grayscale().linear(...map([l.ink, l.paper], [INK, PAPER])); },
  async dark(img) { const l = await levels(img); return img.grayscale().linear(...map([l.ink, l.hi], [0, 236])); },
  async deep(img) {
    const l = await levels(img);
    const { data, info } = await img.grayscale().raw().toBuffer({ resolveWithObject: true });
    const lut = Uint8Array.from({ length: 256 }, (_, v) => Math.round(236 * Math.min(1, Math.max(0, (v - l.ink) / (l.hi - l.ink))) ** 1.9));
    for (let i = 0; i < data.length; i++) data[i] = lut[data[i]];
    return sharp(data, { raw: { width: info.width, height: info.height, channels: 1 } });
  },
};

async function cut(src, [x, y, cw, ch], w, h, tone) {
  const img = sharp(join(ART, src)).extract({ left: x, top: y, width: cw, height: ch }).resize(w, h, { kernel: "lanczos3" });
  const sized = sharp(await img.toBuffer());
  return (await TONES[tone](sized)).toColourspace("b-w");
}

async function write(img, file, quality) {
  const info = await img.webp({ quality, effort: 6 }).toFile(join(OUT, file));
  console.log(file.padEnd(28), `${info.width}x${info.height}`.padEnd(10), `${Math.round(info.size / 1024)} KB`);
}

async function picture({ name, src, crop, tone, sizes, q = 80 }) {
  for (const [i, [w, h]] of sizes.entries()) await write(await cut(src, crop, w, h, tone), i ? `${name}-${w}.webp` : `${name}.webp`, q);
}

const P = (n) => `prints/${n}.jpg`;
const WAVE = P("great-wave-hokusai"); // 3859 x 2594, Hokusai, The Great Wave off Kanagawa
const STORM = P("storm-below-fuji-hokusai"); // 1969 x 1336, Hokusai, Storm below Mount Fuji
const KAJIKA = P("kajikazawa-hokusai"); // 3948 x 2712, Hokusai, Kajikazawa in Kai Province
const FALLS = P("kirifuri-waterfall-hokusai"); // 1359 x 1939, Hokusai, Kirifuri Waterfall
const KABUTO = "anime/kabuto.jpg"; // 2400 x 2400

const PICTURES = [
  { name: "j3-kabuto", src: KABUTO, crop: [145, 0, 2110, 2400], tone: "ink", sizes: [[640, 728], [320, 364]] },
  { name: "r1-fisherman", src: KAJIKA, crop: [1560, 520, 1120, 1400], tone: "ink", sizes: [[720, 900], [360, 450]] },
  { name: "pk-storm", src: STORM, crop: [50, 50, 1860, 1230], tone: "dark", sizes: [[1920, 1270], [960, 635]], q: 66 },
  { name: "end-wave", src: WAVE, crop: [560, 40, 3299, 1900], tone: "ink", sizes: [[2880, 1659], [1920, 1106], [1440, 829]] },
  { name: "end-crest", src: WAVE, crop: [420, 120, 2400, 1500], tone: "ink", sizes: [[1170, 731], [780, 488]] },
  { name: "ev-falls", src: FALLS, crop: [70, 50, 1220, 1830], tone: "deep", sizes: [[1067, 1600], [640, 960]], q: 66 },
];

const only = process.argv[2];
for (const p of PICTURES) if (!only || p.name.startsWith(only)) await picture(p);
