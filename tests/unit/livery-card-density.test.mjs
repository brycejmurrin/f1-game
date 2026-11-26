/* #5224: a LIVERY card's bitmap follows its own CSS box and devicePixelRatio.
 * It was a fixed 112×80 for both card shapes: the grid card measured 143.9×68.8 CSS at 852×393 DPR 3, so
 * 0.26 texels per device pixel and the crest drawn 1.5× too wide (bitmap 1.40 vs box 2.09 aspect;
 * pixel-truth hunt F5, PR #5232). livSwatchPx must keep the box's aspect, cover the box at
 * the pixel ratio within a bound, and the build must measure the laid-out box.
 * Run: node --test tests/unit/livery-card-density.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const src = fs.readFileSync(absSrc("js/garage/setup-sheet.js"), "utf8");

function livSwatchPx() {
  const m = src.match(/function livSwatchPx\(boxW, boxH, dpr\) \{[\s\S]*?\n\}/);
  assert.ok(m, "setup-sheet.js defines livSwatchPx(boxW, boxH, dpr)");
  const fn = vm.runInNewContext("(" + m[0] + ")", {}, { filename: absSrc("js/garage/setup-sheet.js") });
  return (...a) => ({ ...fn(...a) });   // a plain object of this realm, for deepEqual
}

test("the grid card's bitmap keeps the box's aspect and its density on a DPR-3 phone", () => {
  const px = livSwatchPx();
  const { w, h } = px(143.9, 68.8, 3);
  assert.ok(Math.abs(w / h - 143.9 / 68.8) < 0.02, `aspect ${(w / h).toFixed(2)} must be the box's 2.09 (was 1.40)`);
  const density = Math.min(w / (143.9 * 3), h / (68.8 * 3));
  assert.ok(density >= 0.85, `density ${density.toFixed(2)} texels per device px (was 0.26)`);
  assert.ok(Math.max(w, h) <= 384, "bounded: ~113 cards share the memory");
});

test("the factory-fold card and desktop DPR 1 are covered 1:1", () => {
  const px = livSwatchPx();
  assert.deepEqual(px(38, 24, 3), { w: 114, h: 72 });
  assert.deepEqual(px(144, 69, 1), { w: 144, h: 69 });
});

test("bad inputs fall back to DPR 1 and a floor, never a zero-size canvas", () => {
  const px = livSwatchPx();
  for (const bad of [undefined, 0, NaN, -2, "x"]) assert.deepEqual(px(38, 24, bad), { w: 38, h: 24 });
  const tiny = px(0, 0, 3);
  assert.ok(tiny.w >= 16 && tiny.h >= 16, "an unmeasured box still paints");
});

test("cards size through livSwatchPx from a measured box, not a literal", () => {
  // Exact lines, not loose patterns: the one card-canvas call sizes from px (no literal), the build ends
  // by fitting, and the box is the local clientWidth x UI-scale zoom (CssZoom), never a transformed rect.
  const lines = src.split("\n").map((l) => l.trim());
  const calls = lines.filter((l) => l.startsWith("const c = LiveryTex.swatchCanvas("));
  assert.deepEqual(calls, ["const c = LiveryTex.swatchCanvas(team.id, livs.find((l) => l.id === id), px.w, px.h, livBuild);"]);
  assert.equal(lines.filter((l) => l === "fitLivSwatches(container, team);").length, 1, "the build measures the laid-out box");
  assert.equal(lines.filter((l) => l === "if (e && e.clientWidth) livBox[s] = holdLivBox(livBox[s], e.clientWidth * z, e.clientHeight * z, same);").length, 1);
});

/* #6742: garage-pick-cost read cardReused 0 at pick 2 (113 paints, 113 blits). LiveryTex keys both card caches
 * on team|WxH|look, and W×H is this measured box (clientWidth × zoom of a 1fr grid column, integer-snapped): a
 * sub-pixel move of the options pane flipped it for every card at once, so every key was new to both caches.
 * holdLivBox keeps the painted box through that jitter; a real move (past 8%) or a resize (csViewGen) adopts. */
function holdLivBox() {
  const near = src.match(/const near = \(a, b\) => [^\n]+/), hold = src.match(/const holdLivBox = [^\n]+/);
  assert.ok(near && hold, "setup-sheet.js defines near and holdLivBox");
  return vm.runInNewContext(near[0] + "\n" + hold[0] + "\nholdLivBox", {}, { filename: absSrc("js/garage/setup-sheet.js") });
}

test("a 1 px layout jitter keeps every card's cache key (the #6742 full miss)", () => {
  const hold = holdLivBox(), px = livSwatchPx(), key = (b, d) => { const p = px(b[0], b[1], d); return p.w + "x" + p.h; };
  for (const dpr of [1, 3]) for (const prev of [[144, 69], [38, 24], [96, 44]]) {
    assert.equal(key(hold(prev, prev[0] + 1, prev[1], true), dpr), key(prev, dpr), `box ${prev} +1px at DPR ${dpr}`);
    assert.equal(key(hold(prev, prev[0] - 1, prev[1] - 1, true), dpr), key(prev, dpr), `box ${prev} -1px at DPR ${dpr}`);
  }
  assert.notEqual(key([145, 69], 1), key([144, 69], 1), "unheld, the 1 px moves the key: the miss the spec caught");
});

test("a real box change or a resize adopts the measurement", () => {
  const hold = holdLivBox();
  assert.deepEqual([...hold([144, 69], 200, 69, true)], [200, 69], "a wider pane repaints at its size");
  assert.deepEqual([...hold([144, 69], 144, 90, true)], [144, 90], "a taller card adopts too");
  assert.deepEqual([...hold([144, 69], 145, 69, false)], [145, 69], "csViewGen moved: re-fit exactly");
});
