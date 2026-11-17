import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { LOOK, PLACE, WEIGHT, WINDOWS, keepOf, placeOf, placement, toneOf } from "../src/views/engrave.js";
import { SHELVES } from "../src/views/flexpics.js";
import { sourceWord, trustLine, builtFrom } from "../src/lib/trail.js";

const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const flex = read("../src/views/Flex.jsx");
const css = read("../src/views/flex.css");

/* ---------- The one word for where money came from ---------- */

test("all from a file says From a file, and any typed trade makes the figure Typed", () => {
  assert.equal(sourceWord([{ source: "import" }, { source: "import" }]), "From a file");
  assert.equal(sourceWord([{ source: "import" }, { source: "manual" }]), "Typed");
  assert.equal(sourceWord([{}]), "Typed", "a trade with no source was typed in");
  assert.equal(sourceWord([{ source: "manual" }]), "Typed");
  assert.equal(sourceWord([]), null, "no trades, no word");
});

test("copies count one by one, and the word agrees with the Journal's own line", () => {
  const copied = { copies: { members: [{ source: "import" }, { source: "manual" }] } };
  assert.equal(sourceWord([copied]), "Typed");
  const b = builtFrom([{ source: "import" }, { source: "import" }]);
  assert.equal(trustLine(b), "All 2 from a file");
  assert.equal(sourceWord([{ source: "import" }, { source: "import" }]), "From a file");
});

test("money from anywhere else gets no word at all, so nothing about sync can show", () => {
  assert.equal(sourceWord([{ source: "sync" }]), null);
  assert.equal(sourceWord([{ source: "sync" }, { source: "import" }]), null);
  assert.equal(sourceWord([{ source: "sync" }, { source: "manual" }]), "Typed");
});

test("cards, a trade's detail and attached trades all use that one word", () => {
  assert.match(flex, /source: sourceWord\(\[t\]\),/, "a trade's card");
  assert.match(flex, /source: card\.source \?\? sourceWord\(list\)/, "a day's card");
  assert.match(read("../src/drip/journal/Detail.jsx"), /sourceWord\(group \? group\.members : \[t\]\)/);
  const parts = read("../src/views/community/parts.jsx");
  assert.match(parts, /sourceWord\(\[\{ source: t\?\.src \}\]\)/);
  assert.doesNotMatch(parts, /Logged by hand|Imported from|Synced/);
});

/* ---------- What a card prints ---------- */

test("Verified never prints, on a card, a small card, the studio or a post", () => {
  for (const f of ["../src/views/Flex.jsx", "../src/views/flex.css", "../src/views/community/parts.jsx"]) {
    assert.doesNotMatch(read(f), /Verified|fc-verified/, f);
  }
  assert.doesNotMatch(flex, /\.verified\b|verified:/);
});

test("simulated money says Simulated on the stage line and never funded wording, and no account means no stage", () => {
  assert.match(flex, /const fake = simulated\(card\.stage\);/);
  assert.match(flex, /const kindOf = card\.stage \? STAGES\[card\.stage\] : null;/);
  assert.match(flex, /\[kindOf, fake \? "Simulated" : paid \? "Self-reported" : card\.source\]/);
  assert.doesNotMatch(flex, /simulated money"\}`/, "the old long line is gone from the card");
  assert.match(read("../src/views/community/parts.jsx"), /" · Simulated"/);
});

test("the two faces: money by default, and no trades, a market or Closed when there's none to show", () => {
  assert.match(flex, /export const SHOW = \{ money: true, record: false, handle: true,/);
  assert.match(flex, /card\.steps\?\.length === 0/);
  assert.match(flex, /noTrades \? "No trades"/);
  assert.match(flex, /<MarketLine symbol=\{card\.symbol\}/);
  assert.match(flex, /`Closed by \$\{at\}`/);
  assert.doesNotMatch(flex, /\bfmtR\b/);
});

test("a card with no handle leaves the name's slot empty and the date moves up", () => {
  assert.match(css, /\.fc-b:first-child \{ margin-top: 13px; \}/);
  assert.match(css, /\.fc-slots \{ min-height: 63px; \}/, "the big lines don't move");
  assert.match(flex, /\{slotA && <div className="fc-a">/);
});

test("the table of sizes: logo, big line and line weight on each size", () => {
  assert.match(flex, /post: \{ mark: 116, big: \[92, 96, 480\]/);
  assert.match(flex, /story: \{ mark: 92, big: \[64, 68, 316\]/);
  assert.match(flex, /wide: \{ mark: 104, big: \[60, 64, 300\]/);
  assert.deepEqual(WEIGHT, { wide: 5, post: 7, story: 7 });
  assert.match(css, /\.fc-foot \{ position: absolute; left: 30px; bottom: 21px; width: 300px;/);
  assert.match(css, /\.fc-a \{[^}]*font-size: 22px; font-weight: 600; line-height: 28px;/);
  assert.match(css, /\.fc-b \{[^}]*font-size: 15px; line-height: 20px;/);
});

test("a loss is the same size as a win, in grey, on every finish", () => {
  assert.match(css, /\.fc-line\.loss \{ color: var\(--fc-loss\); \}/);
  assert.match(css, /\.fc-black \{[^}]*--fc-loss: #a8a8a6;/);
  assert.match(css, /\.fc-white \{[^}]*--fc-loss: #5a5a58;/);
  assert.match(flex, /<MoneyText text=\{figure\} \/>/);
});

test("charts stay on a card that has one", () => {
  assert.match(flex, /const chartIn = \(card, show\) => !!\(show\.chart && \(card\.chart \|\| \(MONEY_CARDS && show\.money && card\.steps\?\.length\)\)\);/);
  assert.match(flex, /charted && trade && <TradeChart/);
  assert.match(flex, /charted && !trade && <DayChart/);
});

test("a day's card finds its own market, source and year, and a post carries them", () => {
  assert.match(flex, /export function withDay\(card\)/);
  assert.match(flex, /const card = useMemo\(\(\) => withDay\(given\), \[given\]\);/);
  assert.match(read("../src/drip/floor/Cards.jsx"), /onPost=\{\(\{ card, finish, picture, caption \}\) => post\(\{ \.\.\.open, card \}/);
  assert.match(read("../src/views/community/Feed.jsx"), /p\.author\?\.handle \?\? null/, "someone else's post never falls back to your name");
});

test("the card's pictures keep the rotation and every shelf", () => {
  const pics = read("../src/views/flexpics.js");
  const rotation = pics.slice(pics.indexOf("const ROTATION"), pics.indexOf("const LIBRARY"));
  for (const name of ["self-portrait-rembrandt", "jerome-writing-caravaggio", "magdalen-la-tour", "ronin", "wanderer-friedrich", "great-wave-hokusai", "kabuto", "mystical-bird-hokusai"]) {
    assert.ok(rotation.includes(name), name);
  }
  const all = SHELVES.flatMap((s) => s[2]);
  for (const id of Object.keys(PLACE)) {
    assert.ok(all.includes(id), id);
    assert.ok(existsSync(new URL(`../public/art/${id}.webp`, import.meta.url)), id);
  }
});

/* ---------- Where a picture sits ---------- */

const CARDS = { post: [1080, 1080], story: [1080, 1920], wide: [1920, 1080] };

test("a picture cut for this card starts where the mock-up put it, on every size", () => {
  const size = [1600, 2000];
  for (const [kind, [W, H]] of Object.entries(CARDS)) {
    for (const [id, p] of Object.entries(PLACE)) {
      const at = placement(...size, W, H, WINDOWS[kind].open, LOOK, placeOf(id, kind, "open"));
      const scale = W / { wide: 720, post: 540, story: 360 }[kind];
      assert.ok(at.w >= p[kind].w * scale - 1e-6, `${id} on ${kind}`);
      assert.deepEqual(at.look.x, 0, `${id} on ${kind} stays put across`);
    }
  }
});

test("a cut picture is still dragged, zoomed and kept over its window like any other", () => {
  const box = (win, W, H) => ({ x: Math.max(0, win.cx - win.rx) * W, y: Math.max(0, win.cy - win.ry) * H, r: Math.min(1, win.cx + win.rx) * W, b: Math.min(1, win.cy + win.ry) * H });
  for (const [kind, [W, H]] of Object.entries(CARDS)) {
    for (const id of Object.keys(PLACE)) {
      const win = WINDOWS[kind].open, place = placeOf(id, kind, "open"), b = box(win, W, H);
      for (const x of [-9, -0.2, 0, 0.2, 9]) for (const y of [-9, -0.2, 0, 0.2, 9]) for (const zoom of [1, 1.6, 3]) {
        const at = placement(1600, 2000, W, H, win, { ...LOOK, x, y, zoom }, place);
        assert.ok(at.x <= b.x + 1e-6 && at.y <= b.y + 1e-6 && at.x + at.w >= b.r - 1e-6 && at.y + at.h >= b.b - 1e-6, `${id} on ${kind}`);
        const again = placement(1600, 2000, W, H, win, at.look, place);
        assert.ok(Math.abs(again.x - at.x) < 1e-6 && Math.abs(again.y - at.y) < 1e-6, "the place it was clamped to is the place it stays");
      }
    }
  }
});

test("only the open card uses a cut place, and any other picture starts from its window", () => {
  assert.equal(placeOf("masters/self-portrait-rembrandt", "wide", "chart"), null);
  assert.equal(placeOf("masters/narcissus-caravaggio", "wide", "open"), null);
  assert.equal(toneOf("masters/narcissus-caravaggio"), null);
  assert.ok(toneOf("anime/ronin"));
});

test("the open window ends on a hard edge the words never reach", () => {
  for (const [kind, [W, H]] of Object.entries(CARDS)) {
    const win = WINDOWS[kind].open, keep = keepOf(win, W, H);
    assert.equal(win.hard, true, kind);
    assert.equal(keep(W * (win.cx - win.rx * 0.98), H * win.cy), 1, `${kind} just inside`);
    assert.equal(keep(W * (win.cx - win.rx * 1.02), H * win.cy), 0, `${kind} just outside`);
  }
  const room = { wide: 330 / 720, post: 0.41 }; // Wide's foot ends at 330, and Post's big lines start at 224 of 540
  assert.ok(1 - WINDOWS.wide.open.rx >= room.wide, "Wide's picture starts past the foot");
  assert.ok(WINDOWS.post.open.ry <= room.post + 1e-9, "Post's picture ends above the big lines");
  assert.ok(WINDOWS.story.open.ry <= 388 / 640, "Story's picture ends above the big lines");
});
