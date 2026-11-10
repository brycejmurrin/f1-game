/* The circuit picker's hero still ships a 1600 px file beside the 800 px one, and the hero asks for it (#5223).
 * The 800x450 still alone sat in an ~804 CSS px box on a DPR-3 phone (2411 device px): 0.33 source px per
 * device px (emulation; the pixel-truth hunt note of PR #5232, F3). Pins: the generated sizes, one pair
 * per circuit, the srcset the hero sets, the density it buys, and the folder's weight.
 * Run: node --test tests/unit/hero-still-density.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import sharp from "sharp";
import { absSrc } from "../helpers/abs-src.mjs";

const gen = fs.readFileSync(absSrc("tools/gen/track-stills.mjs"), "utf8");
const src = fs.readFileSync(absSrc("js/ui/select-screen.js"), "utf8");
const DIR = absSrc("assets/stills");
const all = fs.readdirSync(absSrc("js/circuits")).filter((f) => f.endsWith(".js")).map((f) => f.replace(/\.js$/, ""));
// Circuits with NO 2x file yet, by name. zolder: track-stills captured an unsized 300x150 canvas twice on
// 2026-11-10 and its size check refused the write; the hero falls back to the 800 px file (showStill onerror).
// The first test below fails when this list and the folder disagree, so a fixed circuit must leave the list.
const NO_2X = ["zolder"];
const ids = all.filter((id) => !NO_2X.includes(id));
const BIG_TOTAL = 3.2 * 1024 * 1024, BIG_WORST = 96 * 1024;   // measured 2026-11-10: 2.54 MB total, 64.0 KB worst

const num = (name) => {
  const m = gen.match(new RegExp("\\b" + name + " = (\\d+)"));
  assert.ok(m, "track-stills.mjs declares " + name);
  return +m[1];
};
const W1 = num("STILL_W"), H1 = num("STILL_H"), W2 = num("STILL_2X_W"), H2 = num("STILL_2X_H");

function stillSrcset() {
  const m = src.match(/function stillSrcset\(id, conn\) \{[\s\S]*?\n\}/);
  assert.ok(m, "select-screen.js defines stillSrcset(id, conn)");
  return vm.runInNewContext("(" + m[0] + ")", {}, { filename: absSrc("js/ui/select-screen.js") });
}

test("the generator writes an 800x450 and a 1600x900 file from one capture", () => {
  assert.deepEqual([W1, H1, W2, H2], [800, 450, 1600, 900]);
  assert.match(gen, /STILL_2X_SUFFIX = "-1600"/);
  assert.match(gen, /viewport: \{ width: STILL_2X_W, height: STILL_2X_H \}/, "the capture is as large as the 2x file: never an upscale");
});

test("the circuits without a 2x file are exactly the named ones", () => {
  const missing = all.filter((id) => !fs.existsSync(path.join(DIR, id + "-1600.webp")));
  assert.deepEqual(missing, NO_2X);
  for (const id of NO_2X) assert.ok(fs.existsSync(path.join(DIR, id + ".webp")), id + " keeps its 800 px still");
});

test("every other circuit ships both stills at the generated sizes", async () => {
  assert.ok(all.length >= 52);
  for (const id of ids) {
    for (const [file, w, h] of [[id + ".webp", W1, H1], [id + "-1600.webp", W2, H2]]) {
      const p = path.join(DIR, file);
      assert.ok(fs.existsSync(p), file + " is committed");
      const m = await sharp(p).metadata();
      assert.deepEqual([m.format, m.width, m.height], ["webp", w, h], file);
    }
  }
});

test("the hero's srcset offers both files and a DPR-3 phone gets at least 0.6 source px per device px", () => {
  const set = stillSrcset()("bahrain", null);
  assert.equal(set, "assets/stills/bahrain.webp 800w, assets/stills/bahrain-1600.webp 1600w");
  assert.match(src, /const STILL_SIZES = "100vw";/);
  assert.match(src, /img\.sizes = STILL_SIZES; img\.srcset = set;/);
  // The browser picks the smallest candidate that covers sizes x DPR, else the largest.
  const pick = (cssVw, dpr) => (cssVw * dpr <= W1 ? W1 : W2);
  const heroCss = 803.7;   // measured hero box on 852x393 (emulation, the hunt note F3)
  assert.equal(pick(852, 3), 1600);
  assert.ok(pick(852, 3) / (heroCss * 3) >= 0.6, "the issue's done-when: >= 0.6 source px per device px");
  assert.equal(pick(800, 1), 800, "a DPR-1 window no wider than the small file keeps it");
});

test("Save-Data or a 2G link keeps the 800 px file; a missing 2x file falls back instead of hiding the still", () => {
  const f = stillSrcset();
  assert.equal(f("monza", { saveData: true }), "");
  assert.equal(f("monza", { effectiveType: "2g" }), "");
  assert.equal(f("monza", { effectiveType: "slow-2g" }), "");
  assert.notEqual(f("monza", { effectiveType: "4g" }), "");
  const body = src.slice(src.indexOf("function showStill(t)"), src.indexOf("let previewMapsTok"));
  assert.match(body, /if \(img\.getAttribute\("srcset"\)\) \{ img\.removeAttribute\("srcset"\); img\.removeAttribute\("sizes"\); img\.src = src; return; \}/);
});

test("the stills folder stays inside its byte budget (lazy: one circuit's file per selection)", () => {
  let small = 0, big = 0, worst = 0;
  for (const id of ids) {
    small += fs.statSync(path.join(DIR, id + ".webp")).size;
    const b = fs.statSync(path.join(DIR, id + "-1600.webp")).size;
    big += b; worst = Math.max(worst, b);
  }
  assert.ok(small <= 2.2 * 1024 * 1024, `800 px stills total ${small} B`);
  assert.ok(big <= BIG_TOTAL, `1600 px stills total ${big} B`);
  assert.ok(worst <= BIG_WORST, `largest 1600 px still ${worst} B`);
});
