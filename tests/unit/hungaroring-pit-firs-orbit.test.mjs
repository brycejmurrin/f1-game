// Hungaroring pit-straight identity (#3317).
//
// Day/dry dual_lite orbit@0 used to read a neat European fir rank opposite a
// dark pit slab — not the straw-olive amphitheatre + white 2025 multi-storey
// paddock. Two mechanisms:
//   • forestEdge gap 8 on authored 0–0.18 / side +1 (near fir belt)
//   • Lombardy poplar row authored 0.23–0.34 / side +1 / gap 70 sat in the
//     S/F orbit sightline across the bowl (Cartesian ~44 m off the start
//     tangent) and read as firs
// Charcoal garage doors on hungaroring-pit-complex dominated the track face.
//
// This rebuilds hungaroring in track-build-vm and asserts:
//   1. No tall slim FOLIAGE within 55 m Cartesian of the S/F tangent on the
//      tribune side (orbit@0 sightline across the bowl) — the survey failure
//      mode. (Nearest-node gap checks false-positive pit-side Lombardy rows
//      that sit beside a parallel stretch of the bowl.)
//   2. hungaroring-pit-complex still emits (required landmark).
//   3. Source dressPit keeps pale glazing (no charcoal door RGB).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import fs from "fs";
import path from "path";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { buildContext } = require(path.join(ROOT, "tools/lib/track-build-vm.cjs"));

const MAT_FOLIAGE = 6;

function atStart(track) {
  const i = 0;
  const p = [track.px[i], track.py[i], track.pz[i]];
  let tv = [track.tx[i], 0, track.tz[i]];
  let rv = [track.rx[i], 0, track.rz[i]];
  const fl = Math.hypot(tv[0], tv[2]) || 1;
  const rl = Math.hypot(rv[0], rv[2]) || 1;
  tv = [tv[0] / fl, 0, tv[2] / fl];
  rv = [rv[0] / rl, 0, rv[2] / rl];
  return { p, tv, rv, hw: track.hw[i], n: track.n };
}

function isSlimFir(pr) {
  const h = pr.maxY - pr.minY;
  const w = Math.max(pr.maxX - pr.minX, pr.maxZ - pr.minZ);
  return h > 7 && h / Math.max(w, 0.1) > 3.5;
}

function nearestRacing(track, cx, cz) {
  const n = track.n;
  let best = 0, bestD = 1e9;
  for (let k = 0; k < n; k += 2) {
    const d = Math.hypot(track.px[k] - cx, track.pz[k] - cz);
    if (d < bestD) { bestD = d; best = k; }
  }
  return { racing: best / (n - 1), dNode: bestD, k: best };
}

test("hungaroring pit-straight clears fir-rank foliage (#3317)", () => {
  const env = buildContext();
  const def = env.Tracks.LIST.find((d) => d.id === "hungaroring");
  assert.ok(def, "hungaroring def");
  const from = env.mark();
  const track = env.Tracks.build(def, {});
  const prims = env.prims.slice(from);
  const { p, tv, rv, hw } = atStart(track);

  let slimInOrbitSight = 0;
  const hits = [];
  for (const pr of prims) {
    if (pr.mat !== MAT_FOLIAGE || !isSlimFir(pr)) continue;
    const cx = (pr.minX + pr.maxX) / 2;
    const cz = (pr.minZ + pr.maxZ) / 2;
    const lat = (cx - p[0]) * rv[0] + (cz - p[2]) * rv[2];
    if (lat <= 0) continue; // tribune side opposite the paddock
    const gap = Math.abs(lat) - hw;
    const along = (cx - p[0]) * tv[0] + (cz - p[2]) * tv[2];
    const { racing } = nearestRacing(track, cx, cz);

    // Orbit@0 sightline: Cartesian near the S/F tangent on the tribune side.
    if (Math.abs(along) < 130 && gap < 55) {
      slimInOrbitSight++;
      if (hits.length < 10) {
        hits.push({ gap: +gap.toFixed(1), along: +along.toFixed(0), racing: +racing.toFixed(3) });
      }
    }
  }

  assert.equal(slimInOrbitSight, 0,
    `S/F orbit sightline has ${slimInOrbitSight} tall slim FOLIAGE within gap 55 (fir rank across the bowl): ${JSON.stringify(hits)}`);

  env.release(track);
});

test("hungaroring-pit-complex still emits; dressPit stays pale (#3317)", () => {
  const env = buildContext();
  const def = env.Tracks.LIST.find((d) => d.id === "hungaroring");
  let sawPit = false;
  const orig = env.sandbox.TrackScenery.hungaroring;
  env.sandbox.TrackScenery.hungaroring = function (api) {
    const real = api.modelGroup;
    api.modelGroup = function (id, ...rest) {
      if (id === "hungaroring-pit-complex") sawPit = true;
      return real.call(this, id, ...rest);
    };
    return orig(api);
  };
  const track = env.Tracks.build(def, {});
  assert.ok(sawPit, "hungaroring-pit-complex modelGroup must still emit");
  env.release(track);

  // Pale-glaze contract without assertPins source pins (#1682): charcoal door
  // RGB must stay out of dressPit; GLAZE literal must stay in.
  const src = fs.readFileSync(path.join(ROOT, "js/circuits/scenery/hungaroring.js"), "utf8");
  const dressStart = src.indexOf("const dressPit");
  const dressEnd = src.indexOf("modelGroup(\"hungaroring-pit-complex\"");
  assert.ok(dressStart >= 0 && dressEnd > dressStart, "dressPit block present");
  const dress = src.slice(dressStart, dressEnd);
  assert.equal(/\[0\.18,\s*0\.19,\s*0\.22\]/.test(dress), false,
    "dressPit must not use charcoal technical door RGB");
  assert.equal(/\[0\.26,\s*0\.28,\s*0\.32\]/.test(dress), false,
    "dressPit must not use charcoal garage door RGB");
  assert.equal(/\[0\.78,\s*0\.84,\s*0\.90\]/.test(dress), true,
    "dressPit must keep pale glazing on the track face");
});
