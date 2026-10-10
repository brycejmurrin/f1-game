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

/* ACCEPTANCE (garage category tabs tap-floor): Pages live measure 852×344
 * compact wide painted fifteen #cs-tabs .cs-tab at h=30.5 with computed
 * min-height:0, caused by
 *   grid-template-rows: repeat(2, calc(var(--tap-min) + 4px))
 * plus `.cs-tab { min-height: 0 }` overriding components.css --tap.
 * Compact must keep the painted --tap / --tap-paint floor (logical +
 * physical), pan/snap instead of a 2-row tap-min grid, and leave livery
 * ⧉ chips on --chip-h / --tap-min. Folded #973's snap/width pins here. */
it("compact #cs-tabs category tabs keep the tap floor (no tap-min 2-row crush)", () => {
  const rd = (f) => fs.readFileSync(path.join(REPO, f), "utf8");
  // Strip comments so a historical note cannot trip the crush-pattern ban.
  const css = rd("css/carsetup.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const fade = rd("js/ui/scroll-fade.js");
  assert.doesNotMatch(
    css,
    /#cs-tabs[^{]*\{[^}]*grid-template-rows:\s*repeat\(\s*2\s*,\s*calc\(\s*var\(--tap-min\)/s,
    "compact short must not size #cs-tabs rows from --tap-min");
  assert.doesNotMatch(
    css,
    /#cs-inner:not\(\[data-pair="on"\]\)\[data-density="compact"\][^{]*#cs-tabs[^{]*\.cs-tab\s*\{[^}]*min-height:\s*0\s*;/s,
    "compact .cs-tab must not zero min-height over the components.css floor");
  assert.match(
    css,
    /#cs-inner:not\(\[data-pair="on"\]\)\[data-density="compact"\] #cs-tabs \.cs-tab\s*\{[^}]*min-block-size:\s*var\(--tap-paint,\s*var\(--tap\)\)/s,
    "compact category tabs floor block size at --tap-paint / --tap");
  assert.match(
    css,
    /#cs-inner:not\(\[data-pair="on"\]\)\[data-density="compact"\] #cs-tabs \.cs-tab\s*\{[^}]*min-height:\s*var\(--tap-paint,\s*var\(--tap\)\)/s,
    "compact category tabs also keep physical min-height at the tap rung");
  assert.match(
    css,
    /#cs-inner:not\(\[data-pair="on"\]\)\[data-density="compact"\] #cs-tabs \.cs-tab\s*\{[^}]*min-width:\s*var\(--tap-paint,\s*var\(--tap\)\)/s,
    "compact category tabs also floor width at the tap rung");
  assert.match(
    css,
    /#cs-inner:not\(\[data-pair="on"\]\)\[data-density="compact"\] #cs-tabs\s*\{[^}]*scroll-snap-type:\s*x\s+mandatory/s,
    "compact strip snaps so a category is not half-clipped beside BACK");
  assert.match(
    css,
    /#cs-inner:not\(\[data-pair="on"\]\)\[data-density="compact"\] #cs-tabs \.cs-tab\s*\{[^}]*scroll-snap-align:\s*start/s,
    "each compact category tab is a snap stop");
  // Livery ⧉ chips stay on the chip / WCAG-min rung — do not hoist them to --tap.
  assert.match(
    css,
    /\.cs-liv-del,\s*\.cs-liv-edit\s*\{[^}]*min-height:\s*var\(--chip-h\)/s,
    "livery edit chips keep --chip-h, not the category-tab --tap floor");
  assert.match(fade, /"#cs-tabs"/,
    "ScrollFade watches #cs-tabs so the compact pan strip gets sf-l / sf-r");
});

/* UI Fit (layout-audit ios-iphone-landscape-safari@100): SAVE/LOAD/RESET
 * GARAGE FILE painted h=46 vs tapFloor 52 — plain <button>s in #cs-garage-file
 * (no .sel-edit), so components.css never floored them. Play-shape short
 * landscape: CLOSE GARAGE rides header row col 2; #cs-tabs spans the strip row.
 * Play-shape grid is also inside @media (orientation: landscape) so a portrait
 * sheet that misreads shape≠tall cannot take #cs-body { display: contents }. */
it("#cs-garage-file buttons floor at --tap-paint; play-shape tabs full-width strip", () => {
  const css = fs.readFileSync(path.join(REPO, "css/carsetup.css"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(
    css,
    /#cs-garage-file\s*>\s*button\s*\{[^}]*min-height:\s*var\(--tap-paint\)/s,
    "SAVE/LOAD/RESET GARAGE FILE must floor min-height at --tap-paint");
  assert.match(
    css,
    /#cs-garage-file\s*>\s*button\s*\{[^}]*min-block-size:\s*var\(--tap-paint\)/s,
    "logical min-block-size also floors at --tap-paint");
  assert.match(
    css,
    /#cs-inner:not\(\[data-pair="on"\]\)\[data-density="compact"\]:not\(\[data-shape="tall"\]\) #cs-tabs\s*\{[^}]*grid-column:\s*1\s*\/\s*-1\s*;/s,
    "compact play-shape #cs-tabs spans the full strip row");
  assert.match(
    css,
    /#cs-inner:not\(\[data-pair="on"\]\)\[data-density="compact"\]:not\(\[data-shape="tall"\]\) > \.sheet-foot\s*\{[^}]*grid-column:\s*2\s*;[^}]*grid-row:\s*1\s*;/s,
    "compact play-shape .sheet-foot sits in header row column 2");
  assert.match(
    css,
    /#cs-inner:not\(\[data-pair="on"\]\)\[data-density="compact"\]:not\(\[data-shape="tall"\]\) > \.sheet-foot > \.bigbtn\s*\{[^}]*min-height:\s*var\(--tap-paint/s,
    "header-row dismiss keeps --tap-paint height");
  // Landscape gate: the nearest @media before play-shape #cs-body { display:
  // contents } must be orientation:landscape — portrait must not take that path.
  const bodyRe = /#cs-inner:not\(\[data-pair="on"\]\)\[data-density="compact"\]:not\(\[data-shape="tall"\]\) > #cs-body\s*\{[^}]*display:\s*contents/;
  assert.match(css, bodyRe, "play-shape still uses #cs-body display:contents");
  const bodyAt = css.search(bodyRe);
  const mediaBefore = [...css.slice(0, bodyAt).matchAll(/@media\s*\(([^)]+)\)/g)].pop();
  assert.ok(mediaBefore && /orientation:\s*landscape/i.test(mediaBefore[1]),
    "play-shape #cs-body display:contents must sit under @media (orientation: landscape), got "
    + (mediaBefore ? mediaBefore[1] : "no @media"));
});

it("garage sheet chrome is opaque, themed, and hides a redundant BACK", () => {
  const rd = (f) => fs.readFileSync(path.join(REPO, f), "utf8");
  const sheet = rd("js/garage/setup-sheet.js");
  const css = rd("css/carsetup.css");
  assert.match(css, /#cs-inner \{[^}]*background:\s*var\(--carbon\)/s,
    "shipped garage card is opaque carbon so 3D type cannot ghost through");
  assert.match(css, /#cs-inner > \.sheet-head \{[^}]*background-color:\s*var\(--carbon\)/s,
    "header paint is an opaque color, not a translucent --grad-head shorthand");
  assert.match(css, /#cs-inner > \.sheet-head \{[^}]*background-image:\s*var\(--grad-head\)/s,
    "brand wash sits on top of carbon, never instead of it");
  {
    const head = css.slice(css.indexOf("#cs-inner > .sheet-head {"),
      css.indexOf("#cs-inner > .sheet-foot {"));
    assert.doesNotMatch(head, /isolation:\s*isolate/,
      "header isolate + translucent wash composites the WebGL canvas through BUDGET");
  }
  assert.match(css, /#cs-aero \{[^}]*width:\s*max-content/s,
    "the aero chip hugs its labels instead of stretching the car band");
  assert.match(css, /#cs-bar \{[^}]*align-items:\s*center/s,
    "CAMERA and ACTIVE AERO share one vertical centre on the bar");
  assert.match(css, /#cs-aero \{[^}]*align-items:\s*center/s,
    "aero chip centres its label+value like CAMERA, not baseline");
  assert.match(css, /#cs-aero \{[^}]*flex:\s*0\s+0\s+auto/s,
    "aero chip does not shrink under the bar (CAMERA is 0 0 auto)");
  assert.match(css, /\.cs-aero-lbl \{[^}]*flex:\s*0\s+0\s+auto/s,
    "ACTIVE AERO label never ellipsizes away under CORNER/STRAIGHT MODE");
  assert.match(css, /\.cs-aero-val \{[^}]*flex:\s*0\s+0\s+auto/s,
    "aero value does not shrink — CORNER↔STRAIGHT must not reflow the chip");
  assert.match(css, /\.cs-aero-val \{[^}]*min-width:\s*14ch/s,
    "aero value floor is STRAIGHT MODE (longest), so the chip width stays put");
  assert.match(css, /\.cs-aero-lbl \{[^}]*color:\s*color-mix\(in oklab,\s*var\(--text\)\s+62%/s,
    "ACTIVE AERO label uses the same rest colour as CAMERA");
  assert.match(css, /@media \(max-width: 820px\) \{[^]*#cs-aero \{[^}]*flex-direction:\s*column/s,
    "below the 844 phone-landscape golden, ACTIVE AERO stacks above CORNER MODE");
  assert.match(css,
    /:root\[data-look-garage-glass="glass"\] #carsetup #cs-inner > \.sheet-head \{[^}]*background-color:\s*var\(--carbon\)/s,
    "GLASS thins the card body only — head chrome stays carbon");
  assert.match(css, /#cs-inner\[data-pair="on"\] #cs-tabs\s*\{[^}]*scrollbar-color:/s,
    "pair rail uses a themed scrollbar, not the platform white track");
  assert.match(css, /#cs-inner\[data-pair="on"\] #cs-tabs\s*\{[^}]*padding:[^;]*var\(--pad\)\s+var\(--pad\)/s,
    "pair rail keeps bottom padding so ERS can scroll fully into view");
  assert.match(css, /#cs-inner\[data-pair="on"\] #cs-tabs\s*\{[^}]*min-height:\s*0/s,
    "pair rail min-height 0 so the grid area can shrink and overflow-y scroll");
  assert.match(css, /#cs-inner\[data-pair="on"\] #cs-tabs\s*\{[^}]*max-height:\s*100%/s,
    "pair rail max-height 100% binds the scrollport to the pane-pair row");
  assert.match(css, /#cs-inner\[data-pair="on"\] #cs-tabs\s*\{[^}]*overflow-y:\s*auto/s,
    "pair rail scrolls vertically when categories overflow");
  assert.match(css, /#cs-team-card span \{[^}]*white-space:\s*normal/s,
    "garage team line wraps instead of ellipsizing the engine");
  assert.match(css, /#carsetup\[data-cs-exit="one"\] #cs-back \{ display: none; \}/);
  assert.match(sheet, /root\.setAttribute\("data-cs-exit", "one"\)/);
  assert.match(sheet, /\[team\.short, team\.engine\]\.filter\(Boolean\)\.join\(" · "\)/);
  assert.doesNotMatch(sheet, /team\.engine \|\| ""\} engine/, "no redundant 'engine' suffix on the team line");
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
