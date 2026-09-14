/* livery-tier.test.mjs — which resolution a car's livery atlas uploads at.
 *
 * WHY THIS IS A UNIT TEST AT ALL. Rasterising a livery needs a browser, and
 * tools/car/parts-sweep.mjs draws that boundary explicitly ("anything that
 * RASTERISES a livery texture still needs a browser and stays in tests/specs/").
 * But the TIER DECISION is arithmetic, and it is the part carrying the memory:
 * __apex.texCensus() on a full montreal grid measured 146.67 MB of livery
 * atlases against 11.33 MB of baked material arrays and 13.8 MB for the whole
 * packed world VBO of a mean circuit (notes/PERF-FINDINGS.md §2v). Ten times
 * the geometry, in the one thing nobody had measured.
 *
 * So atlasDiv() is pure and pinned here, headlessly, and the rasterised result
 * stays where the boundary says it belongs.
 *
 * The other half of the policy — photo mode taking the full tier for EVERY car
 * — lives in js/car/car-draw.js drawCarDecals and is asserted as a contract
 * below, because a fixed downshift with no upgrade path is exactly what would
 * show up in a screenshot.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadParts } from "../../tools/car/parts-sweep.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { LiveryTex } = loadParts();

// The resident cost of one atlas at a given divisor: the exact mip chain, the
// same arithmetic GLX.texCensus() uses. NOT w*h*4*4/3 — that rule assumes a
// square texture and this atlas is 1024x1280.
function atlasBytes(div) {
  let total = 0, w = LiveryTex.SIZE / div, h = LiveryTex.SIZE_H / div;
  for (;;) {
    total += w * h * 4;
    if (w === 1 && h === 1) return total;
    w = Math.max(1, w >> 1); h = Math.max(1, h >> 1);
  }
}

test("the authored atlas is the size the memory arithmetic assumes", () => {
  assert.equal(LiveryTex.SIZE, 1024);
  assert.equal(LiveryTex.SIZE_H, 1280);
  // 6.99 MB — the per-atlas figure §2v and the plan are built on. If the
  // authored size ever changes, every number in both is stale and this fails.
  assert.equal(atlasBytes(1), 6990500);
});

test("desktop: the player keeps full resolution, AI drops one step", () => {
  assert.equal(LiveryTex.atlasDiv(true, false), 1, "the player's own car stays authored-size");
  assert.equal(LiveryTex.atlasDiv(false, false), 2, "AI cars upload at 512x640");
});

test("mobile is UNCHANGED — it already had a tighter policy", () => {
  // Not touched by this change: mobile carries a jetsam budget this is not
  // about, and it was already at 512 player / 256 AI.
  assert.equal(LiveryTex.atlasDiv(true, true), 2);
  assert.equal(LiveryTex.atlasDiv(false, true), 4);
});

test("the desktop grid saving is the order of magnitude the plan claimed", () => {
  const before = 22 * atlasBytes(1);                       // every car at full
  const after = atlasBytes(1) + 21 * atlasBytes(2);        // player full, 21 AI at half
  const mb = (b) => b / 1048576;
  // Measured before: 146.67 MB (texCensus, montreal, full grid).
  assert.ok(Math.abs(mb(before) - 146.67) < 0.5, `before ${mb(before).toFixed(2)} MB`);
  assert.ok(mb(after) < 50, `after ${mb(after).toFixed(2)} MB should be well under 50`);
  // The whole point: this is worth more than every other texture lever
  // combined. The baked material arrays measure 11.33 MB in total.
  assert.ok(mb(before) - mb(after) > 90,
    `expected to free >90 MB, freed ${(mb(before) - mb(after)).toFixed(1)}`);
});

test("a tier is never bigger than the one above it", () => {
  // Guard the guard: a sign flip or a swapped ternary would still satisfy every
  // exact-value assertion above if someone rewrote them together.
  for (const mobile of [false, true]) {
    assert.ok(LiveryTex.atlasDiv(true, mobile) <= LiveryTex.atlasDiv(false, mobile),
      "the player's car must never be coarser than an AI car");
  }
  assert.ok(LiveryTex.atlasDiv(true, true) >= LiveryTex.atlasDiv(true, false),
    "mobile must never be finer than desktop");
});

test("photo mode asks for the full tier for every car, not just the player's", () => {
  // The close-up escape hatch. Without it the downshift is visible in exactly
  // the place players look hardest at a car.
  const src = fs.readFileSync(path.join(ROOT, "js/car/car-draw.js"), "utf8");
  const call = /getCarDecalTexture\(team, num, usePlayerSetup \|\| !!G\.photoMode\)/;
  assert.match(src, call,
    "drawCarDecals must request the full tier while photo mode is on");
  // And it must NOT have been folded into usePlayerSetup, which selects the
  // player's SETUP for teamDecalState and means something else entirely.
  assert.match(src, /teamDecalState\(team, usePlayerSetup\)/,
    "the setup state must keep reading plain usePlayerSetup");
});

test("the decal cache keys on the tier, which is what makes the upgrade cheap", () => {
  // The upgrade is affordable only because the cache can hold both tiers for
  // one team and getCarDecalTexture runs per DRAWN car — so approaching one car
  // in photo mode mints one atlas rather than rebuilding the grid.
  const src = fs.readFileSync(path.join(ROOT, "js/car/car-draw.js"), "utf8");
  assert.match(src, /\(isPlayer \? ":P" : ""\)/,
    "the resolution tier must stay part of the decal cache key");
});
