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

/* A GATE THAT CANNOT FAIL ON BLACK IS NOT A GATE (2026-09-08).
 *
 * garage-frame.mjs sampled its pixels from ctx.drawImage(#game) inside the
 * page. The WebGL2 context carries no preserveDrawingBuffer, so the drawing
 * buffer is cleared after compositing and that readback is solid black from
 * any evaluate outside the frame — measured meanRgb [0,0,0]. The gate then
 * returned ok:true on it, because every rule was written to catch a frame that
 * was too FLAT or too BRIGHT: black has spread 0 and rgbSpread 0 like a flat
 * wall, but the flat-wall rule also requires darkFrac BELOW its floor and
 * black scores 1.0, so nothing fired. The tool reported `interior.ok` on every
 * frame it was meant to judge.
 *
 * Two things hold that shut, and this pins both: the gate rejects an all-dark
 * sample, and the tool no longer reads the live canvas at all. */
describe("the interior gate on a cleared-buffer frame", () => {
  it("rejects an all-black sample instead of calling it an interior", () => {
    const black = Array.from({ length: 60 }, (_, i) => ({ rgb: [0, 0, 0], ny: i / 60 }));
    const gate = assertGarageInterior(black);
    assert.equal(gate.ok, false, "an all-black frame must never pass the interior gate");
    assert.equal(gate.reason, "all_dark");
  });

  it("rejects a near-black sample too — the clear is not always exactly 0", () => {
    const nearly = Array.from({ length: 60 }, (_, i) => ({ rgb: [3, 2, 4], ny: i / 60 }));
    assert.equal(assertGarageInterior(nearly).ok, false);
  });

  it("still passes a frame with real interior structure", () => {
    // Dark floor low, lit wall high, a bright car band — spread and colour
    // variance both real. Guards against the all_dark rule swallowing good frames.
    const good = [];
    for (let i = 0; i < 60; i++) {
      const ny = i / 60;
      good.push({ rgb: ny > 0.72 ? [18, 20, 24] : (i % 3 ? [past(i), 96, 70] : [140, 150, 165]), ny });
    }
    function past(n) { return 60 + (n * 7) % 180; }
    const gate = assertGarageInterior(good);
    assert.equal(gate.ok, true, `expected a pass, got ${JSON.stringify(gate)}`);
  });

  it("garage-frame samples the CAPTURED png, never the live canvas", () => {
    const rd = (f) => fs.readFileSync(path.join(REPO, f), "utf8");
    const frame = rd("tools/shot/garage-frame.mjs");
    const probe = rd("tools/capture/probe-page.mjs");
    assert.match(frame, /sampleGarageGapPixels/, "the gate's input comes from the sampler");
    assert.match(frame, /sharp\(pngPath\)/, "…fed from the captured PNG");
    assert.doesNotMatch(probe, /drawImage\(el/,
      "probe-page must not read the live WebGL canvas back — that is the cleared buffer");
    assert.doesNotMatch(frame, /gapSample/,
      "the drawImage-fed gapSample field is gone; nothing may depend on it again");
    const shot = probe.slice(probe.indexOf("export async function screenshotGameCanvas"),
      probe.indexOf("export async function screenshotGameCanvas") + 1800);
    const awaitAt = shot.indexOf("GLX.awaitSoftPresent");
    const freezeAt = shot.indexOf("headless(true)");
    assert.ok(awaitAt >= 0 && freezeAt > awaitAt,
      "awaitSoftPresent must run while the loop still presents; freeze-then-wait hangs on GLX");
  });
});
