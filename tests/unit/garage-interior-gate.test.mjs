import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
import { assertGarageInterior, sampleGarageGapPixels } from "../../tools/capture/garage-interior.mjs";

describe("garage-interior gate", () => {
  it("rejects a flat teal wall (uniform mid luminance)", () => {
    const wall = Array.from({ length: 80 }, () => ({ rgb: [18, 92, 88], ny: 0.5 }));
    const r = assertGarageInterior(wall);
    assert.equal(r.ok, false);
    assert.equal(r.reason, "flat_wall");
  });

  it("rejects exterior paddock sky bleed", () => {
    const mix = [];
    for (let i = 0; i < 20; i++) mix.push({ rgb: [180, 90, 40], ny: 0.1 });
    for (let i = 0; i < 60; i++) mix.push({ rgb: [70, 55, 45], ny: 0.85 });
    const r = assertGarageInterior(mix);
    assert.equal(r.ok, false);
    assert.equal(r.reason, "exterior_paddock");
  });

  it("accepts a varied garage gap (car + floor + lights)", () => {
    const mix = [];
    for (let i = 0; i < 40; i++) mix.push({ rgb: [12, 14, 16], ny: 0.88 });
    for (let i = 0; i < 30; i++) mix.push({ rgb: [180, 20, 24], ny: 0.45 });
    for (let i = 0; i < 20; i++) mix.push({ rgb: [90, 92, 98], ny: 0.12 });
    const r = assertGarageInterior(mix);
    assert.equal(r.ok, true);
  });

  it("samples the left gap region of canvas pixels", () => {
    const w = 400, h = 300;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        data[i] = x < 200 ? 30 : 200;
        data[i + 1] = 40;
        data[i + 2] = 50;
        data[i + 3] = 255;
      }
    }
    const px = sampleGarageGapPixels({ width: w, height: h, data }, w, h, 0.3);
    assert.ok(px.length >= 8);
    assert.ok(px.every((p) => p.rgb[0] === 30));
  });
});

/* ── the category strip fits every tab it builds ─────────────────────────────
   On the short-wide play shape css/carsetup.css lays #cs-tabs out as a fixed
   TWO-ROW grid with `overflow: hidden` and a two-row max-height. That is the
   right trade there — a sideways pan hides half the catalogue — but it means
   the grid must have a slot for every tab, or the surplus lands on an implicit
   third row that is clipped away with no scrollable ancestor to reach it.

   It did. The column count was the literal `repeat(7, …)`, i.e. 14 slots for
   the 14 tabs that existed when the rows were measured; the roster grew to 15
   (TEAM + the parts catalogue + SETUP + LIVERY) and LIVERY, appended last,
   rendered 53x6 px with 0 % of it visible at 852x393 — a whole screen of the
   game unreachable in landscape, on the primary play shape.

   So the count is DERIVED now, and this pins the derivation rather than a
   number: the strip must ask for ceil(tabs / 2) columns, and the stylesheet
   must consume that instead of a literal. Both halves, because either one
   alone silently reverts to the fallback. */
it("the garage tab grid has a slot for every tab it builds", () => {
  const rd = (f) => fs.readFileSync(path.join(REPO, f), "utf8");
  const sheet = rd("js/garage/setup-sheet.js");
  const css = rd("css/carsetup.css");
  assert.match(sheet, /setProperty\("--cs-tab-cols", String\(Math\.ceil\(tabs\.childElementCount \/ 2\)\)\)/,
    "the strip publishes ceil(tabs / 2) columns as it builds");
  assert.match(css, /grid-template-columns: repeat\(var\(--cs-tab-cols, \d+\), minmax\(0, 1fr\)\)/,
    "the two-row play-shape grid takes its column count from that var");
  assert.doesNotMatch(css, /grid-template-columns: repeat\(7, minmax\(0, 1fr\)\)/,
    "no literal column count may come back — that is the defect this pins");
  // And the roster really is bigger than the old literal, so the fallback is
  // not quietly the right answer by accident.
  const parts = rd("js/car/parts.js");
  const cats = (parts.match(/^ {6}id: "[a-z_]+", label: "[A-Z]/gm) || []).length;
  assert.ok(cats > 0, "the parts catalogue parses");
  const tabs = cats + 3;   // TEAM + catalogue + SETUP + LIVERY
  assert.ok(tabs > 14, `the roster is ${tabs} tabs — past the 14 the old literal allowed`);
  assert.ok(Math.ceil(tabs / 2) * 2 >= tabs, "ceil(tabs / 2) columns over two rows seats every tab");
});
