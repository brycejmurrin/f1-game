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
 * Desktop player hi-res (2048) is DEFERRED off boot / garage-open — car-draw
 * sync-uploads the 1024 preview, then requestIdleCallback-swaps the full
 * atlas. That deferral is pinned below against car-draw.js source + a rig.
 *
 * The other half of the policy — photo mode upgrading the cars it draws to the
 * player tier, lazily and within a bound — lives in js/car/car-draw.js
 * (decalTextureFor / planPhotoAtlases) and is RUN below against that source,
 * because a fixed downshift with no upgrade path is exactly what would show up
 * in a screenshot, and an unbounded upgrade is ~147 MB.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { loadParts } from "../../tools/car/parts-sweep.mjs";
import { loadCrests } from "../../tools/car/crest-sweep.mjs";

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

test("desktop: player preview is 1024, hi-res is 2048, AI stays 512×640", () => {
  assert.equal(LiveryTex.atlasDiv(true, false, false), 2, "boot/garage sync path is 1024×1280 preview");
  assert.equal(LiveryTex.atlasDiv(true, false, true), 1, "deferred hi-res is authored 2048×2560");
  assert.equal(LiveryTex.atlasDiv(false, false), 4, "AI cars upload at 512x640");
  assert.equal(atlasBytes(2), 6990500, "preview mip chain stays ~6.67 MB");
  assert.equal(atlasBytes(4), 1747620, "desktop AI mip chain stays ~1.67 MB");
  assert.equal(LiveryTex.playerHiResDeferred(false), true, "desktop player must defer hi-res");
});

test("mobile keeps the same absolute upload sizes as the 1024-era policy", () => {
  // Divisors doubled with SIZE so jetsam bytes are unchanged: 512 player / 256 AI.
  assert.equal(LiveryTex.atlasDiv(true, true), 4);
  assert.equal(LiveryTex.atlasDiv(false, true), 8);
  assert.equal(atlasBytes(4), 1747620);
  assert.equal(atlasBytes(8), 436900);
  assert.equal(LiveryTex.playerHiResDeferred(true), false, "mobile has no larger player upload to defer");
});

test("the desktop grid stays well under the old every-car-full figure", () => {
  // Steady-state after deferral: player hi-res + 21 AI at 512.
  const everyFull = 22 * atlasBytes(1);
  const tiered = atlasBytes(1) + 21 * atlasBytes(4);
  // Boot / garage-open before deferral completes: player preview + AI.
  const openPath = atlasBytes(2) + 21 * atlasBytes(4);
  const mb = (b) => b / 1048576;
  assert.ok(mb(everyFull) > 500, `every-full ${mb(everyFull).toFixed(2)} MB`);
  assert.ok(mb(tiered) < 70, `tiered ${mb(tiered).toFixed(2)} MB should stay under 70`);
  assert.ok(mb(openPath) < 45, `open-path ${mb(openPath).toFixed(2)} MB must stay near the old ~42 MB grid`);
  assert.ok(mb(everyFull) - mb(tiered) > 400,
    `expected to free >400 MB vs every-full, freed ${(mb(everyFull) - mb(tiered)).toFixed(1)}`);
});

test("a tier is never bigger than the one above it", () => {
  for (const mobile of [false, true]) {
    assert.ok(LiveryTex.atlasDiv(true, mobile, false) <= LiveryTex.atlasDiv(false, mobile),
      "the player's preview must never be coarser than an AI car");
    assert.ok(LiveryTex.atlasDiv(true, mobile, true) <= LiveryTex.atlasDiv(false, mobile),
      "the player's hi-res must never be coarser than an AI car");
  }
  assert.ok(LiveryTex.atlasDiv(true, true) >= LiveryTex.atlasDiv(true, false, false),
    "mobile must never be finer than desktop preview");
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

test("desktop player hi-res atlas upload is deferred off boot and garage-open", () => {
  // Apex Perf condition: no synchronous 26.7 MB upload on garage open.
  const src = fs.readFileSync(path.join(ROOT, "js/car/car-draw.js"), "utf8");
  assert.match(src, /function schedulePlayerHiRes\(/,
    "car-draw must own a deferred hi-res scheduler");
  assert.match(src, /requestIdleCallback/,
    "hi-res must go through requestIdleCallback (or its setTimeout fallback)");
  assert.match(src, /buildAtlas\([^;]+,\s*(?:!!)?isPlayer,\s*false\)/,
    "the sync getCarDecalTexture path must pass hiRes=false");
  assert.match(src, /buildAtlas\([^;]+,\s*true,\s*true\)/,
    "the deferred kick must pass hiRes=true");
  assert.doesNotMatch(src, /buildAtlas\([^;]+,\s*(?:!!)?isPlayer,\s*true\)/,
    "sync path must never request hi-res inline");
  assert.doesNotMatch(src, /timeout:\s*2500/,
    "requestIdleCallback must not force the upload with a 2500 ms timeout");
  assert.match(src, /deadline\.didTimeout/,
    "a timed-out idle callback must re-queue instead of running the 2048 paint");
  assert.match(src, /getCarDecalTexture\(team, num, true, false\)/,
    "photo rivals mint the player-tier preview with allowHiRes=false");
  assert.match(src, /reapHiResGrave\(\)/,
    "the hi-res swap must not free prev until after the next material bind");
  assert.match(src, /_hiResGrave\.push\(\{\s*key:\s*key,\s*tex:\s*prev\s*\}\)/,
    "grave entries are keyed so dropDecalTexture can free a parked preview");
  assert.match(src, /g\.key !== key/,
    "invalidate/LRU/photo-release walk the grave by cache key");
  const tex = fs.readFileSync(path.join(ROOT, "js/car/liverytex.js"), "utf8");
  assert.match(tex, /setTransform\(\s*1\s*\/\s*div/,
    "preview/AI/mobile must paint at upload size via setTransform, not a 2048 then downscale");
});

// THE PHOTO-MODE ATLAS POLICY, run for real against the car-draw.js decal
// section (2026-10-04). It used to ask for the full tier on EVERY drawn car:
// entering photo mode on a grid built ~21 full atlases in one frame and kept
// ~147 MB of them resident after the mode closed, under a 48-entry FIFO the
// live set never filled, so nothing was ever evicted.
function decalRig() {
  const src = fs.readFileSync(path.join(ROOT, "js/car/car-draw.js"), "utf8");
  const body = src.slice(src.indexOf("    // ── decals ──"), src.indexOf("    function carDecalNum("));
  const built = [], freed = [], idle = [], hiLiveries = [];
  const live = { id: "std" };   // the livery the garage has selected NOW
  const G = { photoMode: false, camEye: [0, 0, 0], store: { rev: 1 }, getLiveryId: () => live.id,
    gfx: { createTexture: (a) => { const t = { atlas: a }; built.push(a); return t; }, freeTexture: (t) => freed.push(t.atlas) } };
  // 5th arg hiRes: preview vs deferred full. isPlayer without hiRes → preview.
  const LiveryTex = {
    IS_MOBILE: false,
    playerHiResDeferred: (mobile) => !mobile,
    buildAtlas: (team, l, num, isPlayer, hiRes) => {
      if (hiRes) hiLiveries.push(team + "#" + num + "=" + (l && l.id));
      return team + "#" + num + (hiRes ? ":hi" : (isPlayer ? ":prev" : ":half"));
    },
  };
  const make = new Function("G", "LiveryTex", "deps", "Log", "requestIdleCallback", "setTimeout", "idle", `
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
        const drawn = cars.map((c) => decalTextureFor(c.team, c.num, !!c.player).atlas);
        reapHiResGrave();
        return drawn;
      },
      cached: () => Object.keys(_decalTexCache).length,
      photo: () => _photoKeys.size,
      flushHiRes() {
        while (idle.length) idle.shift()({ didTimeout: false, timeRemaining: () => 50 });
      },
      starveHiRes() {
        const n = idle.length;
        for (let i = 0; i < n; i++) idle.shift()({ didTimeout: true, timeRemaining: () => 0 });
      },
      hiResDone: () => _hiResDone.size,
      invalidate(teamId) { invalidateDecalTextures(teamId); },
    };`);
  const api = make(G, LiveryTex, { resolveLivery: () => ({ id: live.id }) }, { warn() {} },
    (cb) => { idle.push(cb); }, (cb) => { idle.push(cb); }, idle);
  const pick = (id) => { live.id = id; G.store.rev++; };   // a garage livery click: a store write
  return { G, api, built, freed, idle, hiLiveries, pick };
}
const team = (id) => ({ id });
function grid(n) {
  const cars = [{ team: team("me"), num: 1, at: [0, 0, 5], player: true }];
  for (let i = 1; i <= n; i++) cars.push({ team: team("t" + (i % 11)), num: 10 + i, at: [0, 0, 5 + i * 8] });
  return cars;
}

test("sync player atlas is preview; hi-res lands only after idle flush", () => {
  const { api, built } = decalRig();
  const cars = grid(3);
  const drawn = api.frame(cars);
  assert.equal(drawn[0], "me#1:prev", "garage/boot draw uses the 1024 preview");
  assert.equal(built.filter((a) => a.endsWith(":hi")).length, 0, "no hi-res upload before idle");
  assert.equal(built.filter((a) => a.endsWith(":prev")).length, 1);
  assert.ok(built.filter((a) => a.endsWith(":half")).length >= 3);
  api.flushHiRes();
  assert.equal(api.hiResDone(), 1, "one deferred hi-res completed");
  assert.ok(built.some((a) => a === "me#1:hi"), "hi-res atlas was built after idle");
  assert.equal(api.frame(cars)[0], "me#1:hi", "draws swap to hi-res once ready");
});

test("a starved idle callback re-queues instead of painting 2048", () => {
  const { api, built, idle } = decalRig();
  api.frame(grid(1));
  assert.ok(idle.length >= 1, "hi-res is queued");
  api.starveHiRes();
  assert.equal(api.hiResDone(), 0, "didTimeout / tight deadline must not run the kick");
  assert.equal(built.filter((a) => a.endsWith(":hi")).length, 0);
  assert.ok(idle.length >= 1, "the callback was re-queued");
  api.flushHiRes();
  assert.equal(api.hiResDone(), 1);
});

// L10: the deferred kick is keyed by the livery at SCHEDULE time but used to build from the
// livery selected at IDLE time, so A -> B before the idle slot stored B's pixels under A's key.
test("L10: a livery switch before the idle slot never stores the new livery's atlas under the old key", () => {
  const { api, hiLiveries, pick } = decalRig();
  const cars = grid(0);
  pick("A");
  api.frame(cars);                 // preview for A, kick(A) queued
  pick("B");                       // the player clicks B before an idle slot with >=10 ms arrives
  api.flushHiRes();
  assert.deepEqual(hiLiveries, [], "kick(A) must not paint B into key A");
  assert.equal(api.hiResDone(), 0, "A has no hi-res yet");
  pick("A");                       // back to A: the hit path re-schedules, and builds A's own livery
  api.frame(cars);
  api.flushHiRes();
  assert.deepEqual(hiLiveries, ["me#1=A"]);
  assert.equal(api.frame(cars)[0], "me#1:hi");
});

test("L10: invalidate + re-mint under one key leaves exactly one live kick, built from the fresh livery", () => {
  const { api, hiLiveries, pick, idle } = decalRig();
  const cars = grid(0);
  pick("A"); api.frame(cars);      // kick#1 queued
  api.invalidate("me");            // editor SAVE: key dropped...
  pick("A2"); pick("A");           // (store write) ...and re-minted below
  api.frame(cars);                 // kick#2 queued for the same key
  assert.equal(idle.length, 2);
  api.flushHiRes();
  assert.deepEqual(hiLiveries, ["me#1=A"], "the stale kick#1 bails; one hi-res build");
});

test("hi-res swap does not free prev while a material still holds it", () => {
  const { api, built, freed } = decalRig();
  const cars = grid(1);
  api.frame(cars);
  const prev = built.find((a) => a === "me#1:prev");
  assert.ok(prev);
  api.flushHiRes();
  assert.ok(!freed.includes(prev), "preview stays alive until the next bind");
  api.frame(cars);
  assert.ok(freed.includes(prev), "preview is reaped after materials re-read the cache");
});

test("invalidate frees both the live atlas and a parked hi-res-swap preview", () => {
  // custom-team.spec.js color-save: invalidateDecalTextures("custom") must
  // free the first custom atlas even if the idle kick already swapped 2048
  // in and parked the 1024 preview. Dropping only the live cache entry
  // leaked id 7 while freeing the hi-res (id 9).
  const { api, built, freed } = decalRig();
  const cars = grid(0);
  api.frame(cars);
  api.flushHiRes();
  assert.ok(built.includes("me#1:prev") && built.includes("me#1:hi"));
  assert.ok(!freed.includes("me#1:prev"), "preview is still parked, not yet reaped");
  api.invalidate("me");
  assert.ok(freed.includes("me#1:prev"), "parked preview is freed on invalidate");
  assert.ok(freed.includes("me#1:hi"), "live hi-res is freed on invalidate");
  assert.equal(api.cached(), 0);
});

test("entering photo mode on a grid builds ONE player-tier atlas a frame, nearest the camera first", () => {
  const { G, api, built } = decalRig();
  const cars = grid(21);
  api.frame(cars);                               // racing: player preview, rivals half
  const racing = built.length;
  assert.equal(built.filter((a) => a.endsWith(":prev")).length, 1, "only the player's car is player-tier outside photo mode");
  G.photoMode = true;
  const drawn = api.frame(cars);
  assert.equal(built.length - racing, 1, "one atlas build on the first photo frame, not twenty-one");
  assert.equal(drawn[1], "t1#11:prev", "the rival nearest the camera got the player-tier preview");
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
  assert.ok(freed.some((a) => a === "t1#11:prev"), "a player-tier atlas no longer drawn was evicted for one in view");
  const drawn = api.frame(back);
  assert.ok(drawn.every((a) => a.endsWith(":prev")), "photo rivals stay at the player-tier preview, never :hi");
  G.photoMode = false;
  const before = freed.length;
  api.frame(cars);
  assert.equal(freed.length - before, 6, "the first frame after photo mode frees the six photo atlases");
  assert.equal(api.photo(), 0);
  assert.ok(!freed.includes("me#1:prev"), "the player's own preview atlas is never a photo atlas");
});

test("photo rivals never mint a :hi atlas; only the real player does", () => {
  const { G, api, built } = decalRig();
  const cars = grid(5);
  G.photoMode = true;
  for (let f = 0; f < 8; f++) api.frame(cars);
  api.flushHiRes();
  api.frame(cars);
  const hi = built.filter((a) => a.endsWith(":hi"));
  assert.deepEqual(hi, ["me#1:hi"], "2048 is the player car only");
  const drawn = api.frame(cars);
  for (let i = 1; i < drawn.length; i++)
    assert.ok(drawn[i].endsWith(":prev") || drawn[i].endsWith(":half"),
      "rival " + drawn[i] + " must not be :hi");
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

test("drawCarDecals re-reads _decalTexCache every frame via decalTextureFor", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/car/car-draw.js"), "utf8");
  const draw = src.slice(src.indexOf("function drawCarDecals("), src.indexOf("function flushDecals("));
  assert.match(draw, /const tex = decalTextureFor\(team, num, usePlayerSetup\)/);
  assert.match(draw, /G\.gfx\.drawDecal\(mesh, modelMat, tex/);
  const flush = src.slice(src.indexOf("function flushDecals("), src.indexOf("function setPlayerParts("));
  assert.match(flush, /drawCarDecals\(/);
  assert.match(flush, /reapHiResGrave\(\)/);
});

function paintAtlasWidths(isPlayer, hiRes) {
  const { RecCtx } = loadCrests();
  const widths = [];
  const sb = {
    console: { log() {}, warn() {}, error() {}, info() {} },
    Math, Object, Array, String, Number, JSON, Map, Set, isNaN, isFinite, parseInt, parseFloat,
    document: {
      querySelector: () => null,
      createElement: () => {
        const rec = new RecCtx();
        const c = {
          getContext: () => rec,
          set width(v) { widths.push(+v); this._w = +v; },
          get width() { return this._w || 0; },
          set height(v) { this._h = +v; },
          get height() { return this._h || 0; },
        };
        return c;
      },
    },
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  for (const f of ["js/core/log.js", "js/data/teams.js", "js/car/liveries.js",
                   "js/car/crest-paths.js", "js/car/livery-graphics.js", "js/car/liverytex.js"])
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sb, { filename: f });
  const LT = vm.runInContext("LiveryTex", sb);
  const returned = LT.buildAtlas("ferrari", {}, 16, isPlayer, hiRes);
  return { LT, widths, returned };
}

test("sync getCarDecalTexture path never creates a canvas wider than SIZE/div", () => {
  // The regression: paint 2048×2560 then downscale. Sync preview / AI / mobile
  // must author the upload-size canvas (REGIONS still in SIZE space via setTransform).
  const preview = paintAtlasWidths(true, false);
  const pDiv = preview.LT.atlasDiv(true, false, false);
  const pCap = preview.LT.SIZE / pDiv;
  assert.equal(preview.returned.width, pCap, "returned preview canvas is SIZE/div");
  assert.ok(preview.widths.every((w) => w <= pCap),
    "sync player canvases must be ≤ " + pCap + ", got " + preview.widths.join(","));
  const ai = paintAtlasWidths(false, false);
  const aCap = ai.LT.SIZE / ai.LT.atlasDiv(false, false, false);
  assert.equal(ai.returned.width, aCap, "returned AI canvas is SIZE/div");
  assert.ok(ai.widths.every((w) => w <= aCap),
    "sync AI canvases must be ≤ " + aCap + ", got " + ai.widths.join(","));
  const hi = paintAtlasWidths(true, true);
  assert.equal(hi.returned.width, hi.LT.SIZE, "deferred kick still authors 2048");
  assert.ok(hi.widths.includes(hi.LT.SIZE));
});

// M28: setTeamLogo decodes asynchronously. A decode that finished after CLEAR (or after a newer upload) reinstalled
// the stale emblem into LOGOS - the car wore a logo the player had just removed or replaced.
test("M28: an emblem that finishes decoding after CLEAR or a newer upload never reinstalls", () => {
  const made = [];
  class FakeImage { constructor() { made.push(this); } }
  const ctx = { console, Math, Object, Array, Float32Array, Uint16Array, Uint32Array, JSON, Number, String, Boolean,
                isFinite, isNaN, Map, Set, WeakMap, Image: FakeImage };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ["js/core/log.js", "js/core/mat4.js", "js/data/teams.js", "js/car/parts.js",
                   "js/car/livery-graphics.js", "js/car/liverytex.js"])
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
  const LT = vm.runInContext("LiveryTex", ctx);
  let marks = 0;
  LT.onMarkChange(() => { marks++; });

  LT.setTeamLogo("custom", "data:A"); LT.setTeamLogo("custom", "data:B");
  assert.equal(made.length, 2);
  made[1].onload();                                   // the newer upload decodes first
  assert.equal(LT.LOGOS.custom, made[1]);
  made[0].onload();                                   // the older one finishes late
  assert.equal(LT.LOGOS.custom, made[1], "a stale decode does not replace the newer emblem");

  LT.setTeamLogo("custom", "data:C");                 // upload, then CLEAR before it decodes
  LT.setTeamLogo("custom", null);
  assert.equal(LT.LOGOS.custom, undefined);
  const seen = marks;
  made[2].onload();
  assert.equal(LT.LOGOS.custom, undefined, "an emblem decoding after CLEAR stays cleared");
  assert.equal(marks, seen, "…and the stale decode does not tell the caches either");

  LT.setTeamLogo("custom", "data:D"); LT.setTeamLogo("custom", "data:E");
  made[4].onload();
  made[3].onerror();                                  // a stale failure must not wipe the current emblem
  assert.equal(LT.LOGOS.custom, made[4], "a stale onerror does not delete the current emblem");
});
