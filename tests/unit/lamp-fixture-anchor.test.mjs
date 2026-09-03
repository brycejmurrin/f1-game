// lamp-fixture-anchor.test.mjs — every night light must come from a fixture,
// and every fixture must actually light the road.
//
// Two defects motivated this file, both found at Bahrain/night and both
// invisible to every guard that existed:
//
//   1. FLOATING LIGHTS. GLX.drawGlow paints an additive lens-halo billboard for
//      any light record with glareW > 0 (js/render/glx/glx.js, "0 = fixture-less
//      light ... must never paint a floating halo"). buildTrackLights honours
//      that for its synth fill lights, but the three START-GANTRY DOWNLIGHTS
//      shipped at glareW 0.3 while being explicitly NOT parented to the scenery
//      gantry — three glowing orbs 8 m over the start line with nothing holding
//      them up, on all 40 circuits. Jeddah was far worse: its LED tunnel drew
//      poles but registered no lights, so track.lampPosts was empty and the
//      whole circuit fell back to the synthetic stride walk — 311 halos, none
//      of them over a pole.
//
//   2. FIXTURES THAT LIGHT NOTHING. floodMast registered its lens without a
//      radius, so a 39 m stadium mast standing 34 m off the road inherited the
//      ~34 m radius that floodColor sizes for a 9-13 m verge lamp. Its lens sat
//      ~52 m from the road it aimed at, and the (1-(d/r)^4)^2 window is exactly
//      0 past r — so Bahrain rendered essentially unlit under a fully modelled
//      floodlight ring (2 of 135 centreline samples inside any light's radius,
//      and those 2 were the start line, lit by the orbs from defect 1).
//
// Defect 2 is why defect 1 was so visible, and the two guards below are the
// mechanism of each, not the symptom: a halo needs a fixture under it, and a
// fixture needs its pool to reach the road it stands beside. Both read ZERO on
// every circuit, so they are asserted as strict zeros — no baseline, no ALLOW
// hatch, matching tests/unit/prop-clipping.test.mjs and scenery-grounding.
//
// 40 real track builds, pure Node (no browser) — this belongs in
// `npm run test:sweeps`, not the Playwright projects.
//
// Run: node --test tests/unit/lamp-fixture-anchor.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { buildContext } = require("../../tools/track/verify-track.cjs");

// Same sandbox trick as tests/unit/lamp-density.test.mjs: the lighting files are
// plain IIFEs assigning one global each, so they load without a browser.
function loadLightTune() {
  const sb = { console: { log() {}, warn() {}, error() {} }, Math, JSON, Object, Array };
  sb.window = sb;
  vm.createContext(sb);
  seedLog(sb);
  for (const f of ["js/lighting/knobs.js", "js/lighting/track-lights.js", "js/lighting/frame-lights.js", "js/lighting/lighting.js"])
    vm.runInContext(readFileSync(path.join(ROOT, f), "utf8").replace(/^const\b/gm, "var"), sb);
  return sb.LightTune;
}

const STRIDE = 15;          // flat light record: see js/render/glx/glx.js frame.lights
const I_RAD = 6, I_GLARE = 14;
// A fixture "carries" a light when the record sits on the registered lens. The
// two are written from the same position, so this is an identity check with
// slack for float round-trips, NOT a proximity heuristic.
const ON_FIXTURE_M = 1.0;

let _T, _LT;
const Tracks = () => (_T || (_T = buildContext()));
const LightTune = () => (_LT || (_LT = loadLightTune()));

function nightLights(id) {
  const T = Tracks();
  const def = T.LIST.find((d) => d.id === id);
  assert.ok(def, `circuit ${id} registered`);
  const track = T.build(def, { night: true });
  return { track, L: LightTune().buildTrackLights(track) };
}

function nearestFixture(L, o, posts) {
  let best = Infinity;
  for (const p of posts) {
    const d = Math.hypot(p.x - L[o], p.y - L[o + 1], p.z - L[o + 2]);
    if (d < best) best = d;
  }
  return best;
}

// Distance from a lens to the nearest point on the centreline — the throw the
// light's radius has to cover for its pool to land on tarmac at all. Sampled
// every other node; the centreline is dense (~4 m), so the sample error is far
// below the shortfalls this is written to catch (Bahrain's was 18 m).
function throwToRoad(L, o, track) {
  let best = Infinity;
  for (let k = 0; k < track.n; k += 2) {
    const d = Math.hypot(L[o] - track.px[k], L[o + 1] - track.py[k], L[o + 2] - track.pz[k]);
    if (d < best) best = d;
  }
  return best;
}

test("no circuit paints a lens halo with no fixture under it", () => {
  const offenders = [];
  for (const def of Tracks().LIST) {
    const { track, L } = nightLights(def.id);
    const posts = track.lampPosts || [];
    let orphans = 0, worst = 0;
    for (let o = 0; o < L.length; o += STRIDE) {
      if (!(L[o + I_GLARE] > 0)) continue;      // fixture-less lights must be here
      const d = nearestFixture(L, o, posts);
      if (d > ON_FIXTURE_M) { orphans++; worst = Math.max(worst, d); }
    }
    if (orphans) {
      offenders.push(`${def.id}: ${orphans} halo(s) with no fixture ` +
                     `(nearest one ${worst.toFixed(1)} m away)`);
    }
  }
  assert.deepEqual(offenders, [],
    "a light with glareW > 0 draws a halo billboard, so it MUST sit on a drawn " +
    "fixture. Give the light a fixture, or push it with glareW 0:\n  " +
    offenders.join("\n  "));
});

test("every registered fixture's pool reaches the road", () => {
  const offenders = [];
  for (const def of Tracks().LIST) {
    const { track, L } = nightLights(def.id);
    const posts = track.lampPosts || [];
    if (!posts.length) continue;               // covered by the test above
    let short = 0, worst = 0;
    for (let o = 0; o < L.length; o += STRIDE) {
      if (nearestFixture(L, o, posts) > ON_FIXTURE_M) continue;   // not a fixture light
      const gap = throwToRoad(L, o, track) - L[o + I_RAD];
      if (gap > 0) { short++; worst = Math.max(worst, gap); }
    }
    if (short) {
      offenders.push(`${def.id}: ${short} fixture(s) whose radius stops short of ` +
                     `the road by up to ${worst.toFixed(1)} m`);
    }
  }
  assert.deepEqual(offenders, [],
    "the pool window (1-(d/r)^4)^2 is exactly 0 past r, so a fixture whose lens " +
    "is further from the road than its radius lights nothing at all. Tall masts " +
    "carry their real throw as minRadius (js/track/scenery/identity.js):\n  " +
    offenders.join("\n  "));
});

test("no circuit races through an unlit stretch of road", () => {
  // The third failure mode, and the one the two guards above cannot see: every
  // light can sit on a fixture, and every fixture can reach the road, while the
  // road itself is still dark — because the lamps are all somewhere else.
  //
  // That is what a wrong `k` does. `lampPosts.k` says which bit of road a
  // fixture is beside, and the gap-fill/density walk measures spans in node
  // units, so a k in the wrong frame makes it insert fill lights where the
  // lamps are NOT. `lampPost` takes a node index and is absent from every
  // remap list in tracks.js, so on a circuit with a `_sceneryShift` the stored
  // k and the stored position disagreed: imola 74/74 fixtures (worst 2030 m)
  // and hungaroring 96/96 (431 m). Imola ran 716 m of unlit road at frac 0.46
  // with no light within 200 m, on a circuit carrying 74 lamp posts.
  //
  // Assert the OBSERVABLE property rather than the internal index, so this
  // holds whatever future route a fixture takes to get registered.
  const MIN_LIT = 95;          // %, of centreline samples inside some light radius
  const MAX_DARK_M = 60;       // the DARK-GAP FILL knob's own default threshold
  const offenders = [];
  for (const def of Tracks().LIST) {
    const { track, L } = nightLights(def.id);
    const n = (L.length / STRIDE) | 0;
    const ds = track.total / track.n;
    let lit = 0, run = 0, worstRun = 0, worstAt = 0;
    for (let k = 0; k < track.n; k++) {
      let any = false;
      for (let i = 0; i < n && !any; i++) {
        const o = i * STRIDE;
        const dx = L[o] - track.px[k], dy = L[o + 1] - track.py[k], dz = L[o + 2] - track.pz[k];
        if (dx * dx + dy * dy + dz * dz < L[o + I_RAD] * L[o + I_RAD]) any = true;
      }
      if (any) { lit++; run = 0; }
      else { run++; if (run > worstRun) { worstRun = run; worstAt = k; } }
    }
    const cov = 100 * lit / track.n, darkM = worstRun * ds;
    if (cov < MIN_LIT || darkM > MAX_DARK_M) {
      offenders.push(`${def.id}: ${cov.toFixed(1)}% of the lap lit, longest dark run ` +
                     `${Math.round(darkM)} m at frac ${(worstAt / track.n).toFixed(3)}`);
    }
  }
  assert.deepEqual(offenders, [],
    "a night circuit has road no lamp reaches. Check that each fixture's `k` " +
    "names the node it actually stands beside (resolvePostNodes in " +
    "js/lighting/track-lights.js) before adding more lamps:\n  " + offenders.join("\n  "));
});

test("the start-gantry downlights stay fixture-less AND invisible", () => {
  // These three are placed by formula at node 0 and deliberately not parented to
  // the gantry mesh, so they are the one light group allowed to have no fixture
  // — which is exactly why they must never draw a halo or a volumetric shaft.
  const { track, L } = nightLights("bahrain");
  const posts = track.lampPosts || [];
  const n = (L.length / STRIDE) | 0;
  const tail = [];
  for (let i = n - 3; i < n; i++) {
    const o = i * STRIDE;
    tail.push({ glareW: L[o + I_GLARE], volW: L[o + I_GLARE - 1], y: L[o + 1],
                onFixture: nearestFixture(L, o, posts) <= ON_FIXTURE_M });
  }
  assert.equal(tail.length, 3, "three downlights over the grid");
  for (const t of tail) {
    assert.equal(t.onFixture, false, "still the unparented bar (rewrite this test if parented)");
    assert.equal(t.glareW, 0, "no lens halo — nothing is up there to glare");
    assert.equal(t.volW, 0, "no volumetric shaft — nothing is up there to emit it");
  }
  // The pool itself must survive: this bar is what marks the start line.
  const lit = tail.every((t) => t.y > track.py[0]);
  assert.ok(lit, "downlights still sit above the road at node 0");
});
