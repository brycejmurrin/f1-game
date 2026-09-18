import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
import { assertGarageInterior, sampleGarageGapPixels } from "../../tools/shot/garage-interior.mjs";

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

/* ── category information architecture ─────────────────────────────────────
   Performance parts remain the primary rail. Presentation/setup categories
   get a second named row, so they no longer compete with ENGINE in one flat
   strip. Stacked rows pan independently; pair layout flattens both rows into
   one vertical keyboard rail. */
it("garage tabs split performance and finishing work into named rows", () => {
  const rd = (f) => fs.readFileSync(path.join(REPO, f), "utf8");
  const sheet = rd("js/garage/setup-sheet.js");
  const css = rd("css/carsetup.css");
  assert.match(sheet, /SECONDARY_CATS\s*=\s*new Set\(\["floor",\s*"cockpit",\s*"wheels",\s*"tune",\s*"livery"\]\)/);
  assert.match(sheet, /className = "cs-tab-row"/);
  assert.match(sheet, /aria-label", "Performance categories"/);
  assert.match(sheet, /aria-label", "Finishing and setup categories"/);
  assert.match(css, /#cs-tabs \.cs-tab-row\s*\{[^}]*overflow-x:\s*auto/s,
    "each stacked row can pan without hiding the other tier");
  assert.match(css, /#cs-inner\[data-pair="on"\] #cs-tabs \.cs-tab-row\s*\{[^}]*display:\s*contents/s,
    "the split-pane rail remains one vertical keyboard list");
  assert.doesNotMatch(sheet, /--cs-tab-cols/, "the old count-derived packing is gone");
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
    const probe = rd("tools/shot/probe-page.mjs");
    assert.match(frame, /sampleGarageGapPixels/, "the gate's input comes from the sampler");
    assert.match(frame, /sharp\(pngPath\)/, "…fed from the captured PNG");
    assert.doesNotMatch(probe, /drawImage\(el/,
      "probe-page must not read the live WebGL canvas back — that is the cleared buffer");
    assert.doesNotMatch(frame, /gapSample/,
      "the drawImage-fed gapSample field is gone; nothing may depend on it again");
    assert.match(probe, /export async function awaitPresentedFrame/);
    assert.match(probe, /getElementById\("game-soft"\)/,
      "presentedCanvasClip must prefer the HeadlessChrome overlay");
    const presented = probe.slice(probe.indexOf("export async function screenshotPresentedCanvas"),
      probe.indexOf("export async function screenshotGameCanvas"));
    assert.match(presented, /readSoftCanvasBytes/,
      "soft toDataURL is the multi-shot fast path before CDP");
    assert.match(presented, /Page\.captureScreenshot/,
      "CDP clip skips Playwright's document.fonts.ready wait that hung smoke shards 2/3");
    assert.doesNotMatch(presented, /page\.screenshot/,
      "page.screenshot waits for fonts and timed out on GHA after freeze");
    const shot = probe.slice(probe.indexOf("export async function screenshotGameCanvas"),
      probe.indexOf("export async function screenshotGameCanvas") + 2800);
    const awaitAt = shot.indexOf("awaitPresentedFrame");
    const softAt = shot.indexOf("readSoftCanvasBytes");
    const freezeAt = shot.indexOf("__apex.headless(true)");
    assert.ok(awaitAt >= 0 && softAt > awaitAt,
      "awaitPresentedFrame then soft toDataURL — multi-shot fast path");
    assert.ok(freezeAt < 0 || freezeAt > softAt,
      "freeze+CDP is fallback only after the soft overlay path");
  });

  it("garage-angles captures via soft helper and walks livery/spine designs", () => {
    const angles = fs.readFileSync(path.join(REPO, "tools/shot/garage-angles.mjs"), "utf8");
    assert.match(angles, /screenshotGameCanvas/,
      "HeadlessChrome GLX presents on #game-soft; a full-page screenshot is the UI sheet");
    assert.doesNotMatch(angles, /await page\.screenshot\(/,
      "page.screenshot waits for fonts.ready and was the smoke hang after freeze");
    assert.match(angles, /--livery/,
      "paint jobs share the camera stack; a store write is enough (LIVERY tab slams FRONT)");
    assert.match(angles, /--spine-side/,
      "crown/flank pills are walked as custom ids so a design pass does not reload per shot");
    assert.match(angles, /--zoom/,
      "counted #cs-view-in clicks so a flank mark can be judged, not just seen");
    // The WALK never reloads; the --serve / --watch session does, on purpose,
    // to pick up an edited painter (car-multi-shot-tools pins the split).
    const walkOnly = angles.slice(angles.indexOf("async function walk("), angles.indexOf("async function serveSession"));
    assert.doesNotMatch(walkOnly, /page\.reload\(/,
      "no second boot — openGarage + store writes keep ONE Chromium");
  });
});
