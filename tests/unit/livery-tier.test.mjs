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
 * The other half of the policy — photo mode upgrading the cars it draws to the
 * full tier, lazily and within a bound — lives in js/car/car-draw.js
 * (decalTextureFor / planPhotoAtlases) and is RUN below against that source,
 * because a fixed downshift with no upgrade path is exactly what would show up
 * in a screenshot, and an unbounded upgrade is ~147 MB.
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
// square texture and this atlas is 2048x2560.
function atlasBytes(div) {
  let total = 0, w = LiveryTex.SIZE / div, h = LiveryTex.SIZE_H / div;
  for (;;) {
    total += w * h * 4;
    if (w === 1 && h === 1) return total;
    w = Math.max(1, w >> 1); h = Math.max(1, h >> 1);
  }
}

test("the authored atlas is the size the memory arithmetic assumes", () => {
  assert.equal(LiveryTex.SIZE, 2048);
  assert.equal(LiveryTex.SIZE_H, 2560);
  // ~26.7 MB — garage boards need 2× linear texels; AI/mobile keep the old
  // absolute upload sizes via atlasDiv. If the authored size ever changes,
  // every number in the tier table is stale and this fails.
  assert.equal(atlasBytes(1), 27962020);
});

test("desktop: the player keeps full resolution, AI uploads at 512×640", () => {
  assert.equal(LiveryTex.atlasDiv(true, false), 1, "the player's own car stays authored-size");
  assert.equal(LiveryTex.atlasDiv(false, false), 4, "AI cars upload at 512x640 (same absolute as pre-2048 half)");
  assert.equal(atlasBytes(4), 1747620, "desktop AI mip chain stays ~1.67 MB");
});

test("mobile keeps the same absolute upload sizes as the 1024-era policy", () => {
  // Divisors doubled with SIZE so jetsam bytes are unchanged: 512 player / 256 AI.
  assert.equal(LiveryTex.atlasDiv(true, true), 4);
  assert.equal(LiveryTex.atlasDiv(false, true), 8);
  assert.equal(atlasBytes(4), 1747620);
  assert.equal(atlasBytes(8), 436900);
});

test("the desktop grid stays well under the old every-car-full figure", () => {
  const everyFull = 22 * atlasBytes(1);                    // every car at authored full
  const tiered = atlasBytes(1) + 21 * atlasBytes(4);       // player full, 21 AI at 512×640
  const mb = (b) => b / 1048576;
  // Pre-tier / pre-2048 plan figure was ~147 MB for 22 × 1024×1280. Authored
  // 2048 makes every-full ~587 MB; the tiered desktop grid is ~62 MB.
  assert.ok(mb(everyFull) > 500, `every-full ${mb(everyFull).toFixed(2)} MB`);
  assert.ok(mb(tiered) < 70, `tiered ${mb(tiered).toFixed(2)} MB should stay under 70`);
  assert.ok(mb(everyFull) - mb(tiered) > 400,
    `expected to free >400 MB vs every-full, freed ${(mb(everyFull) - mb(tiered)).toFixed(1)}`);
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

test("photo mode routes every drawn car through the lazy full-tier picker", () => {
  // The close-up escape hatch. Without it the downshift is visible in exactly
  // the place players look hardest at a car.
  const src = fs.readFileSync(path.join(ROOT, "js/car/car-draw.js"), "utf8");
  assert.match(src, /const tex = decalTextureFor\(team, num, usePlayerSetup\);/,
    "drawCarDecals must take its atlas from decalTextureFor (the photo-mode picker)");
  // And photoMode must NOT have been folded into usePlayerSetup, which selects
  // the player's SETUP for teamDecalState and means something else entirely.
  // Optional setup/stamp args key a career hire / AI shelf; the second arg is
  // still plain usePlayerSetup.
  assert.match(src, /teamDecalState\(team, usePlayerSetup(?:, setup, stamp)?\)/,
    "the setup state must keep reading plain usePlayerSetup");
  assert.doesNotMatch(src, /teamDecalState\(team,\s*usePlayerSetup\s*\|\|/,
    "photoMode must not fold into the setup-state argument");
  assert.match(src, /function flushDecals\(night\) \{\s*planPhotoAtlases\(\);/,
    "the per-frame plan runs before the decal queue is drawn");
});

// THE PHOTO-MODE ATLAS POLICY, run for real against the car-draw.js decal
// section (2026-10-04). It used to ask for the full tier on EVERY drawn car:
// entering photo mode on a grid built ~21 full atlases in one frame and kept
// ~147 MB of them resident after the mode closed, under a 48-entry FIFO the
// live set never filled, so nothing was ever evicted.
function decalRig() {
  const src = fs.readFileSync(path.join(ROOT, "js/car/car-draw.js"), "utf8");
  const body = src.slice(src.indexOf("    // ── decals ──"), src.indexOf("    function carDecalNum("));
  const built = [], freed = [];
  const G = { photoMode: false, camEye: [0, 0, 0], store: { rev: 1 }, getLiveryId: () => "std",
    gfx: { createTexture: (a) => { const t = { atlas: a }; built.push(a); return t; }, freeTexture: (t) => freed.push(t.atlas) } };
  const LiveryTex = { buildAtlas: (team, _l, num, full) => team + "#" + num + (full ? ":full" : ":half") };
  const make = new Function("G", "LiveryTex", "deps", "Log", `
    const DECAL_TEX_CACHE_MAX = 36;
    const _decalTeams = [], _decalNums = [], _decalMats = [], _decalSetup = [];
    let _decalCount = 0;
    ${body}
    return {
      frame(cars) {            // cars: [{ team, num, at: [x,y,z], player }]
        _decalCount = cars.length;
        cars.forEach((c, i) => { _decalTeams[i] = c.team; _decalNums[i] = c.num;
          const m = new Float32Array(16); m[12] = c.at[0]; m[13] = c.at[1]; m[14] = c.at[2]; _decalMats[i] = m;
          _decalSetup[i] = !!c.player; });
        planPhotoAtlases();
        return cars.map((c) => decalTextureFor(c.team, c.num, !!c.player).atlas);
      },
      cached: () => Object.keys(_decalTexCache).length,
      photo: () => _photoKeys.size,
    };`);
  const api = make(G, LiveryTex, { resolveLivery: () => ({}) }, { warn() {} });
  return { G, api, built, freed };
}
const team = (id) => ({ id });
function grid(n) {
  const cars = [{ team: team("me"), num: 1, at: [0, 0, 5], player: true }];
  for (let i = 1; i <= n; i++) cars.push({ team: team("t" + (i % 11)), num: 10 + i, at: [0, 0, 5 + i * 8] });
  return cars;
}

test("entering photo mode on a grid builds ONE full atlas a frame, nearest the camera first", () => {
  const { G, api, built } = decalRig();
  const cars = grid(21);
  api.frame(cars);                               // racing: player full, rivals half
  const racing = built.length;
  assert.equal(built.filter((a) => a.endsWith(":full")).length, 1, "only the player's car is full outside photo mode");
  G.photoMode = true;
  const drawn = api.frame(cars);
  assert.equal(built.length - racing, 1, "one atlas build on the first photo frame, not twenty-one");
  assert.equal(drawn[1], "t1#11:full", "the rival nearest the camera got it");
  assert.equal(drawn[2], "t2#12:half", "the rest draw their half tier while they wait");
  api.frame(cars);
  assert.equal(built.length - racing, 2, "and one more the next frame");
  for (let f = 0; f < 30; f++) api.frame(cars);
  assert.equal(api.photo(), 6, "a bounded set: PHOTO_ATLAS_MAX full atlases at most");
  assert.equal(built.length - racing, 6, "and no thrash once it is full: every held atlas is still drawn");
});

test("the photo set follows the camera, and closing photo mode frees every photo atlas", () => {
  const { G, api, built, freed } = decalRig();
  const cars = grid(21);
  G.photoMode = true;
  for (let f = 0; f < 10; f++) api.frame(cars);
  // Fly to the back of the grid: the front six are no longer drawn.
  const back = cars.slice(16);                  // six rivals
  G.camEye = [0, 0, 5 + 21 * 8];
  for (let f = 0; f < 10; f++) api.frame(back);
  assert.equal(api.photo(), 6, "still bounded");
  assert.ok(freed.some((a) => a === "t1#11:full"), "a full atlas no longer drawn was evicted for one in view");
  const drawn = api.frame(back);
  assert.ok(drawn.every((a) => a.endsWith(":full")), "the six cars in view are all full now");
  G.photoMode = false;
  const before = freed.length;
  api.frame(cars);
  assert.equal(freed.length - before, 6, "the first frame after photo mode frees the six photo atlases");
  assert.equal(api.photo(), 0);
  assert.ok(!freed.includes("me#1:full"), "the player's own full atlas is never a photo atlas");
  assert.ok(built.filter((a) => a === "me#1:full").length === 1, "and it was never rebuilt");
});

test("the decal cache evicts the least recently drawn atlas, never the live field", () => {
  const { api, built, freed } = decalRig();
  const cars = grid(23);                         // 24 live keys
  api.frame(cars);
  // Browse 30 liveries for the player: each a new player key, drawn once.
  for (let i = 0; i < 30; i++) api.frame([{ team: team("me"), num: 100 + i, at: [0, 0, 5], player: true }, ...cars.slice(1)]);
  assert.ok(freed.length > 0, "eviction actually triggers");
  assert.ok(api.cached() <= 36, `bounded: ${api.cached()} cached`);
  const rivalsBuilt = built.filter((a) => a.endsWith(":half")).length;
  assert.equal(rivalsBuilt, 23, "no rival atlas the field kept drawing was evicted and rebuilt");
});

test("the decal cache keys on the tier, which is what makes the upgrade cheap", () => {
  // The upgrade is affordable only because the cache can hold both tiers for
  // one team and getCarDecalTexture runs per DRAWN car — so approaching one car
  // in photo mode mints one atlas rather than rebuilding the grid.
  const src = fs.readFileSync(path.join(ROOT, "js/car/car-draw.js"), "utf8");
  assert.match(src, /\(isPlayer \? ":P" : ""\)/,
    "the resolution tier must stay part of the decal cache key");
});
