// lighting-hunt-gaps — three small defects from the 2026-11-03 lighting hunt
// (docs/notes/HUNT-LIGHTING-2026-11-03.md):
//
//   H1  a >1 s wall-clock gap in setFrameLights must drop the MIRROR rank
//       cache too (_S_VIEW), not only _S_MAIN — a parked eye reuses otherwise
//   H2  DARK-GAP fill must alternate from the anchor's side (applyLampDensity
//       already does); a.side === -1 used to land the first synth on the mast
//   H3  NEON edge washers must use (hw[k] || 7) like gap-fill / densify — a
//       zero half-width put the washer on the racing line
//
// Run: node --test tests/unit/lighting-hunt-gaps.test.mjs  (npm run test:tooling-fast)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLog } from "../helpers/seed-log.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function loadFrameLights() {
  const clock = { now: 0 };
  const ctx = {
    performance: { now: () => clock.now },
    Math, Float32Array, Uint32Array, Array, Object, WeakRef,
    document: { addEventListener() {}, hidden: false },
    LightKnobs: { LT: { lampWarmup: 0, lampFlicker: 0, lampCull: 40, lampBehindBias: 5.25, lampCullFade: 0.35, lampReach: 1 } },
    PerfGov: { tier: () => 0 },
  };
  vm.createContext(ctx);
  vm.runInContext(read("js/render/shared/light-budget.js") + "\n;globalThis.LightBudget = LightBudget;", ctx, { filename: absSrc("js/render/shared/light-budget.js") });
  vm.runInContext(read("js/lighting/frame-lights.js") + "\n;globalThis.FrameLights = FrameLights;", ctx, { filename: absSrc("js/lighting/frame-lights.js") });
  return { FL: ctx.FrameLights, clock };
}

function street(spacing) {
  const L = [];
  for (let z = 0; z < 6000; z += spacing) for (const x of [-9, 9]) L.push(x, 8, z, 1, 0.9, 0.7, 40, 0, -1, 0, -1, 0, 0, 0, 1);
  return L;
}

function loadTrackLights() {
  const sb = { console: { log() {}, warn() {}, error() {} }, Math, JSON, Object, Array, WeakMap };
  sb.window = sb;
  vm.createContext(sb);
  seedLog(sb);
  for (const f of [
    "js/render/shared/light-budget.js",
    "js/lighting/knobs.js",
    "js/lighting/track-lights.js",
    "js/lighting/frame-lights.js",
    "js/lighting/lighting.js",
  ]) vm.runInContext(read(f).replace(/^const\b/gm, "var"), sb, { filename: absSrc(f) });
  return sb.LightTune;
}

test("H1: a >1 s pause drops the mirror rank cache (view rebuilds while parked)", () => {
  const { FL, clock } = loadFrameLights();
  const track = { _lights: street(12) }, cars = new Array(10).fill({}), frame = {};
  const eye = [0, 1.2, 500], fwd = [0, 0, 1], back = [0, 0, -1];
  // Warm both heaps at a fixed eye so standstill reuse is available.
  for (let f = 0; f < 5; f++) {
    clock.now = f * (1000 / 60);
    FL.setFrameLights(frame, track, cars, eye, 1, fwd, 0);
    frame.tailStart = (frame.lights.length / 15) | 0; frame.tailCount = 0;
    FL.viewLights(frame, eye, back);
  }
  FL.resetRankStats();
  // >1 s wall gap with the same eye (pause / tab-away). Forward must rebuild;
  // before the fix, viewLights reused _S_VIEW while main rebuilt.
  clock.now += 3000;
  FL.setFrameLights(frame, track, cars, eye, 1, fwd, 0);
  frame.tailStart = (frame.lights.length / 15) | 0; frame.tailCount = 0;
  FL.viewLights(frame, eye, back);
  const s = FL.rankStats();
  assert.equal(s.mainRebuilds, 1, `forward rebuilds after a pause gap (got ${s.mainRebuilds})`);
  assert.equal(s.viewRebuilds, 1, `mirror must rebuild too, not reuse a pre-pause set (got ${s.viewRebuilds}, reuses ${s.viewReuses})`);
  assert.equal(s.viewReuses, 0, "no mirror reuse on the first frame after a >1 s gap");
});

test("H2: DARK-GAP fill alternates from a.side when the anchor is on -1", () => {
  const api = loadTrackLights();
  api.LT.lampDensity = 1;
  // Two left-side posts with a dark gap between them. Gap-fill must put the
  // first synth on the OPPOSITE side of the anchor (a.side = -1 → first +1).
  const n = 80, total = 1760; // ds = 22 → stride nodes = 1 at dens 1
  const track = {
    n, total,
    px: new Float64Array(n), py: new Float64Array(n), pz: new Float64Array(n),
    rx: new Float64Array(n), rz: new Float64Array(n), hw: new Float64Array(n),
    def: { theme: "city", id: "gap-probe" },
    lampPosts: [],
  };
  for (let i = 0; i < n; i++) {
    track.px[i] = i; track.pz[i] = 0; track.py[i] = 0;
    track.rx[i] = 1; track.rz[i] = 0; track.hw[i] = 7;
  }
  // Anchors far apart so lampGapFill (default 90 m ≈ 4 nodes) fires many steps.
  const a0 = { k: 0, side: -1, kind: "halide", x: 0 - 13, y: 13, z: 0 };
  const a1 = { k: 40, side: -1, kind: "halide", x: 40 - 13, y: 13, z: 0 };
  track.lampPosts = [a0, a1];
  api.LT.lampGapFill = 90;
  const L = api.buildTrackLights(track);
  // Synth fills push with glareW 0 (field 14). Find the first fill after k=0:
  // its x uses rx*(hw+6)*side → with rx=1, hw=7: x = k + 13*side.
  const fills = [];
  for (let o = 0; o < L.length; o += 15) {
    if (L[o + 14] !== 0) continue; // halo'd = real fixture or neon
    const x = L[o], kApprox = Math.round(x); // rough; better: recover side from x - k
    // Position = k + 13*side for fills (k integer, side ±1). Recover k and side.
    // Try both sides for nearby k.
    let best = null;
    for (let k = 1; k < 40; k++) {
      for (const side of [1, -1]) {
        const ex = k + 13 * side;
        if (Math.abs(ex - x) < 1e-6) { best = { k, side }; break; }
      }
      if (best) break;
    }
    if (best) fills.push(best);
  }
  assert.ok(fills.length >= 2, `expected dark-gap synths, got ${fills.length}`);
  // First insert is j=1 → side = -a.side = +1 when a.side === -1.
  assert.equal(fills[0].side, 1, `first gap fill must sit opposite a.side=-1 (got ${fills[0].side})`);
  assert.equal(fills[1].side, -1, `second gap fill returns to the anchor side`);
});

test("H3: NEON edge washer uses hw||7 (zero half-width stays off the racing line)", () => {
  // Source pin first: the washer must share densify/gap-fill's half-width floor.
  const src = read("js/lighting/track-lights.js");
  assert.match(src, /const hwk = track\.hw\[k\] \|\| 7;\s*\n\s*const wx0 = track\.px\[k\] \+ track\.rx\[k\] \* \(hwk \+ 2\.5\)/);

  const api = loadTrackLights();
  // street_night sets floodColor.street; kindRoll = lh(i+71) < 0.10 picks washers.
  // Zero hw everywhere — before the fix offset was 2.5 m (on the road); after, 9.5 m.
  const n = 80, total = 1760;
  const track = {
    n, total,
    px: new Float64Array(n), py: new Float64Array(n), pz: new Float64Array(n),
    rx: new Float64Array(n), rz: new Float64Array(n), hw: new Float64Array(n),
    def: { theme: "street_night", id: "vegas" },
    lampPosts: [],
  };
  for (let i = 0; i < n; i++) {
    track.px[i] = i * 10; track.pz[i] = 0; track.py[i] = 0;
    track.rx[i] = 1; track.rz[i] = 0; track.hw[i] = 0;
  }
  for (let k = 8; k < n - 8; k++) {
    track.lampPosts.push({
      k, side: 1, kind: "halide",
      x: track.px[k] + 13, y: 13, z: 0,
    });
  }
  api.LT.lampGapFill = 0;
  api.LT.lampDensity = 1;
  const L = api.buildTrackLights(track);
  // Washers sit at y=4.5. With hw=0 the buggy offset is 2.5 m from a post's
  // px[k]; the floor (hw||7) puts them at 9.5 m. Measure against post px values
  // (not "nearest centreline sample" — dense posts make 9.5 m land near a neighbour).
  let verge = 0, onRoad = 0;
  for (let o = 0; o < L.length; o += 15) {
    const x = L[o], y = L[o + 1];
    if (y < 4 || y > 5) continue;
    let hitVerge = false, hitRoad = false;
    for (let k = 0; k < n; k++) {
      const d = Math.abs(x - track.px[k]);
      if (Math.abs(d - 9.5) < 1e-6) hitVerge = true;
      if (Math.abs(d - 2.5) < 1e-6) hitRoad = true;
    }
    if (hitVerge) verge++;
    if (hitRoad) onRoad++;
  }
  assert.ok(verge > 0, `street_night must emit neon washers at the hw||7 verge (got ${verge})`);
  assert.equal(onRoad, 0, `no washer may use raw hw=0 offset 2.5 m (got ${onRoad})`);
});
