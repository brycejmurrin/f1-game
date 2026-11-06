// LIVERY card swatches are painted once per look (B·H13, 2026-10-21). A LIVERY pick
// rebuilds the garage sheet, and its 113 cards each repainted the paint + crest
// lockup: 286-590 ms of a pick at CPU x4 (scratch/h13/garage-probe.mjs). Pins that
// LiveryTex.paintSwatch paints a (team, livery, size) once into an offscreen canvas
// and later calls only blit it, that a different livery or size paints again, and
// that a logo change (markChanged via setTeamLogo) drops the cache.
//
// Run: node --test tests/unit/livery-swatch-cache.test.mjs   (npm run test:tooling-fast; < 1 s, no browser)
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCrests } from "../../tools/car/crest-sweep.mjs";

const { LiveryTex: LT, RecCtx } = loadCrests();
const liv = { c1: [0.8, 0.1, 0.1], c2: [1, 1, 1], stripe: [0.1, 0.1, 0.1] };

function dest() { return Object.assign(new RecCtx(), { blits: 0, drawImage() { this.blits++; } }); }

test("a repeated swatch is painted once and blitted after", () => {
  const a = dest();
  LT.paintSwatch(a, "ferrari", liv, 112, 80);
  assert.equal(a.blits, 1, "the first call paints offscreen and blits the result");
  assert.equal(a.ops.length, 0, "nothing is painted straight onto the card");
  const b = dest();
  LT.paintSwatch(b, "ferrari", JSON.parse(JSON.stringify(liv)), 112, 80);
  assert.equal(b.blits, 1);
  assert.equal(b.ops.length, 0);
});

test("a different livery, team or size is its own entry", () => {
  const seen = new Set();
  const grab = (team, l, w, h) => { let canvas = null;
    LT.paintSwatch({ drawImage(c) { canvas = c; } }, team, l, w, h); return canvas; };
  for (const [team, l, w, h] of [["ferrari", liv, 112, 80], ["ferrari", { ...liv, c1: [0, 0, 1] }, 112, 80],
    ["mclaren", liv, 112, 80], ["ferrari", liv, 48, 48]]) seen.add(grab(team, l, w, h));
  assert.equal(seen.size, 4);
  assert.equal(grab("ferrari", liv, 112, 80), grab("ferrari", liv, 112, 80), "the same look returns the same canvas");
});

test("a logo change drops every cached card", () => {
  const grab = () => { let canvas = null; LT.paintSwatch({ drawImage(c) { canvas = c; } }, "ferrari", liv, 112, 80); return canvas; };
  const before = grab();
  LT.setTeamLogo("ferrari", null);   // markChanged()
  assert.notEqual(grab(), before, "repainted after markChanged");
});

// A pick's rebuilt sheet adopts each card's painted canvas (B·H32, 2026-10-21): 113 new canvases, each a
// getContext + a blit, were ~74 ms of a phone-throttled pick even with the swatch cache above.
test("swatchCanvas hands the same painted canvas to the next build's card", () => {
  assert.equal(typeof LT.swatchCanvas, "function", "LiveryTex.swatchCanvas is the card's canvas source");
  const s0 = LT.swatchStats();
  const a = LT.swatchCanvas("ferrari", liv, 112, 80, 1);
  const b = LT.swatchCanvas("ferrari", JSON.parse(JSON.stringify(liv)), 112, 80, 2);
  assert.equal(b, a, "build 2 adopts build 1's canvas: no new canvas, no blit");
  assert.equal(LT.swatchStats().reused - s0.reused, 1);
  assert.equal(a.width, 112); assert.equal(a.height, 80);
});

test("two cards with one look in the same build get two canvases", () => {
  const a = LT.swatchCanvas("mclaren", liv, 112, 80, 7);
  const b = LT.swatchCanvas("mclaren", liv, 112, 80, 7);
  assert.notEqual(b, a, "one DOM node cannot sit in two cards");
  assert.equal(LT.swatchCanvas("mclaren", liv, 112, 80, 8), a, "the kept one is still adopted next build");
});

test("a logo change drops the kept card canvases too", () => {
  const before = LT.swatchCanvas("ferrari", { ...liv, c1: [0, 1, 0] }, 112, 80, 20);
  LT.setTeamLogo("ferrari", null);   // markChanged()
  assert.notEqual(LT.swatchCanvas("ferrari", { ...liv, c1: [0, 1, 0] }, 112, 80, 21), before, "repainted after markChanged");
});
