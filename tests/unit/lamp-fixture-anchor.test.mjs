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
//      them up, on every circuit. Jeddah was far worse: its LED tunnel drew
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
// The same fleet pass also holds the START LAMPS to a fixture (2026-10-04):
// js/race/start-lights.js lit only a scenery gantry within 3 % of a lap of
// the line, and 22 of 52 circuits had none there — the countdown played over
// an empty sky. Every circuit's five lamps must now hang over its grid,
// unburied, and a circuit that dresses gantries must stand one at its line.
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
  for (const f of ["js/render/shared/light-budget.js", "js/lighting/knobs.js", "js/lighting/track-lights.js", "js/lighting/frame-lights.js", "js/lighting/lighting.js"])
    vm.runInContext(readFileSync(path.join(ROOT, f), "utf8").replace(/^const\b/gm, "var"), sb);
  return sb.LightTune;
}

const STRIDE = 15;          // flat light record: see js/render/glx/glx.js frame.lights
const I_RAD = 6, I_GLARE = 14;
// A fixture "carries" a light when the record sits on the registered lens. The
// two are written from the same position, so this is an identity check with
// slack for float round-trips, NOT a proximity heuristic.
const ON_FIXTURE_M = 1.0;

let _T, _LT, _SL;
const Tracks = () => (_T || (_T = buildContext()));
const LightTune = () => (_LT || (_LT = loadLightTune()));
// js/race/start-lights.js, as game.js runs it: the five countdown lamps.
const StartLights = () => (_SL || (_SL = (() => {
  const sb = { Math, WeakMap };
  vm.createContext(sb);
  return vm.runInContext(readFileSync(path.join(ROOT, "js/race/start-lights.js"), "utf8") + ";StartLights", sb);
})()));
// A start lamp row and a start gantry both belong OVER THE GRID: the scenery
// gantry nearest the line within this many metres of it (arc), the lamps
// within this many (straight line) of the line's centre.
const START_M = 40;

// Lamps (of five) with a prop triangle across their first `reach` metres
// toward the grid. The glow is depth-tested, so a lamp sunk in its housing or
// inside a beam is dark: measured before the gantry named its row exactly,
// five circuits' lamps sat inside the housing bar and Jeddah's centre lamp
// inside a 12.6 m portal leg. Segment–triangle (Möller–Trumbore) over the
// props triangles near the row; the instanced batches are not in propsGeo.
function buriedLamps(track, lamps, reach = 2) {
  const arr = (a) => (a && a._data ? a._data : a);
  const P = arr(track.propsGeo && track.propsGeo.pos), I = arr(track.propsGeo && track.propsGeo.idx);
  if (!P || !I) return 0;
  const c = lamps[2];
  let rx = lamps[4][0] - lamps[0][0], rz = lamps[4][2] - lamps[0][2];
  const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
  // Toward the grid (−tangent, start-lights' convention) and down to an eye 30 m back.
  const eye = [c[0] - rz * 30, track.py[0] + 1.2, c[2] + rx * 30];
  // Triangles whose box meets the row's (±2 m lateral, + reach): by the whole
  // triangle, not one corner — a gantry beam's face is one 20 m triangle.
  const R = 2 + reach, near = [];
  for (let i = 0; i < I.length; i += 3) {
    const a = I[i] * 3, b = I[i + 1] * 3, d = I[i + 2] * 3;
    let ok = true;
    for (let ax = 0; ax < 3 && ok; ax++) {
      const lo = Math.min(P[a + ax], P[b + ax], P[d + ax]), hi = Math.max(P[a + ax], P[b + ax], P[d + ax]);
      ok = hi > c[ax] - R && lo < c[ax] + R;
    }
    if (ok) near.push(i);
  }
  let hidden = 0;
  for (const L of lamps) {
    let dx = eye[0] - L[0], dy = eye[1] - L[1], dz = eye[2] - L[2];
    const dl = Math.hypot(dx, dy, dz); dx /= dl; dy /= dl; dz /= dl;
    const hit = near.some((i) => {
      const a = I[i] * 3, b = I[i + 1] * 3, d = I[i + 2] * 3;
      const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]];
      const e2 = [P[d] - P[a], P[d + 1] - P[a + 1], P[d + 2] - P[a + 2]];
      const p = [dy * e2[2] - dz * e2[1], dz * e2[0] - dx * e2[2], dx * e2[1] - dy * e2[0]];
      const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
      if (Math.abs(det) < 1e-12) return false;
      const s = [L[0] - P[a], L[1] - P[a + 1], L[2] - P[a + 2]];
      const u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) / det;
      if (u < 0 || u > 1) return false;
      const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
      const v = (dx * q[0] + dy * q[1] + dz * q[2]) / det;
      if (v < 0 || u + v > 1) return false;
      const t = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det;
      return t > 0 && t < reach;
    });
    if (hit) hidden++;
  }
  return hidden;
}

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

// Coverage thresholds for the third guard below (hoisted so the fleet pass can
// take its verdict): % of centreline samples inside some light's radius, and
// the DARK-GAP FILL knob's own default threshold for a single unlit run.
const MIN_LIT = 95, MAX_DARK_M = 60;

/** ONE fleet pass, three verdicts.
 *
 * The three whole-field guards below each walked `Tracks().LIST` and called
 * nightLights() themselves, so this file rebuilt the fleet THREE TIMES over:
 * 156 night builds at 1217 ms each, 186 s for the file, and `test:sweeps` runs
 * it on every geometry diff. They ask three different questions of the same two
 * objects, so they share one pass now — each circuit is built once, all three
 * verdicts are taken from it, and the build goes out of scope before the next.
 *
 * Memoised rather than run at import time so `--test-name-pattern` on a single
 * guard still pays for one pass, and a build failure is still reported by the
 * guard that needed it rather than by the module loading. */
const survey = (() => {
  let out = null;
  return () => {
    if (out) return out;
    out = { orphans: [], shortPools: [], darkRuns: [], startLamps: [], startGantry: [], lampHosts: { gantry: [], gate: [] } };
    // process.env.APEX_CIRCUITS narrows the pass to the circuits a circuit-only
    // pull request touched (tools/lib/circuit-scope.cjs); unset = every circuit.
    const { scope } = require("../../tools/lib/circuit-scope.cjs");
    for (const def of Tracks().LIST.filter((d) => scope([d.id]).length)) {
      const { track, L } = nightLights(def.id);
      const posts = track.lampPosts || [];
      const n = (L.length / STRIDE) | 0;

      // 1. A light with glareW > 0 draws a halo billboard, so something must be
      //    holding it up.
      let orphans = 0, worstOrphan = 0;
      for (let o = 0; o < L.length; o += STRIDE) {
        if (!(L[o + I_GLARE] > 0)) continue;      // fixture-less lights must be here
        const d = nearestFixture(L, o, posts);
        if (d > ON_FIXTURE_M) { orphans++; worstOrphan = Math.max(worstOrphan, d); }
      }
      if (orphans) {
        out.orphans.push(`${def.id}: ${orphans} halo(s) with no fixture ` +
                         `(nearest one ${worstOrphan.toFixed(1)} m away)`);
      }

      // 2. And that fixture's pool has to reach the road it stands beside.
      if (posts.length) {
        let short = 0, worst = 0;
        for (let o = 0; o < L.length; o += STRIDE) {
          const post = posts.find((p) => Math.hypot(p.x - L[o], p.y - L[o + 1], p.z - L[o + 2]) <= ON_FIXTURE_M);
          if (!post) continue;                                         // not a fixture light
          // A fixture that names the point it lights (`aimAt`: the pit canopy
          // luminaires over the working lane) must reach THAT, not the centreline.
          const throwM = post.aimAt
            ? Math.hypot(L[o] - post.aimAt[0], L[o + 1] - post.aimAt[1], L[o + 2] - post.aimAt[2])
            : throwToRoad(L, o, track);
          const gap = throwM - L[o + I_RAD];
          if (gap > 0) { short++; worst = Math.max(worst, gap); }
        }
        if (short) {
          out.shortPools.push(`${def.id}: ${short} fixture(s) whose radius stops short of ` +
                              `the road by up to ${worst.toFixed(1)} m`);
        }
      }

      // 3. Every light can sit on a fixture and every fixture can reach the
      //    road while the road itself is still dark — the lamps are all
      //    somewhere else.
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
        out.darkRuns.push(`${def.id}: ${cov.toFixed(1)}% of the lap lit, longest dark run ` +
                          `${Math.round(darkM)} m at frac ${(worstAt / track.n).toFixed(3)}`);
      }

      // 4. The five countdown lamps (js/race/start-lights.js) hang over the
      //    grid, on a structure: the scenery gantry at the line, or the
      //    engine's start gate. And a circuit that dresses gantries stands one
      //    over its start line — RS() put nine of them 148 m-2.3 km away.
      const gantries = track.props.list.filter((r) => r.kind === "gantry" && r.side === 0);
      let nearest = Infinity;
      for (const r of gantries) nearest = Math.min(nearest, Math.min(r.k, track.n - r.k) * ds);
      if (gantries.length && nearest > START_M) {
        out.startGantry.push(`${def.id}: nearest of ${gantries.length} gantr${gantries.length > 1 ? "ies" : "y"} ` +
                             `stands ${Math.round(nearest)} m from the start line`);
      }
      const lamps = StartLights().create({}, { Particles: { glow() {} } }).lampsFor(track);
      if (!lamps || lamps.length !== 5) out.startLamps.push(`${def.id}: no start lamps`);
      else {
        const c = lamps[2], away = Math.hypot(c[0] - track.px[0], c[2] - track.pz[0]), up = c[1] - track.py[0];
        if (away > Math.min(START_M, 0.03 * track.total) || !(up > 4 && up < 16))
          out.startLamps.push(`${def.id}: start lamps ${away.toFixed(1)} m from the line, ${up.toFixed(1)} m up`);
        const hidden = buriedLamps(track, lamps);
        if (hidden) out.startLamps.push(`${def.id}: ${hidden} of 5 start lamps buried in geometry (no line of sight to the grid)`);
        out.lampHosts[nearest <= 0.03 * track.total ? "gantry" : "gate"].push(def.id);
      }
    }
    return out;
  };
})();

test("no circuit paints a lens halo with no fixture under it", () => {
  assert.deepEqual(survey().orphans, [],
    "a light with glareW > 0 draws a halo billboard, so it MUST sit on a drawn " +
    "fixture. Give the light a fixture, or push it with glareW 0:\n  " +
    survey().orphans.join("\n  "));
});

test("every registered fixture's pool reaches the road", () => {
  assert.deepEqual(survey().shortPools, [],
    "the pool window (1-(d/r)^4)^2 is exactly 0 past r, so a fixture whose lens " +
    "is further from the road than its radius lights nothing at all. Tall masts " +
    "carry their real throw as minRadius (js/track/scenery/identity.js):\n  " +
    survey().shortPools.join("\n  "));
});

test("no circuit races through an unlit stretch of road", () => {
  // The third failure mode, and the one the two guards above cannot see.
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
  // Asserts the OBSERVABLE property rather than the internal index, so this
  // holds whatever future route a fixture takes to get registered.
  assert.deepEqual(survey().darkRuns, [],
    "a night circuit has road no lamp reaches. Check that each fixture's `k` " +
    "names the node it actually stands beside (resolvePostNodes in " +
    "js/lighting/track-lights.js) before adding more lamps:\n  " +
    survey().darkRuns.join("\n  "));
});

test("every circuit's start lamps hang over its grid, on a gantry at the line or the engine's start gate", () => {
  // Until 2026-10-04 js/race/start-lights.js lit only a scenery gantry within
  // 3 % of a lap of the line, and 22 of 52 circuits had none: eight dress no
  // gantry, five span the line with an overheadSpan the registry never saw,
  // nine authored theirs where RS() lands it 148 m-2.3 km from the grid. The
  // lamps now fall back to the engine gate every circuit has, and a
  // start/finish overheadSpan registers itself (`startLights`).
  assert.deepEqual(survey().startLamps, [],
    `the countdown lamps must hang within ${START_M} m of the start line, 4-16 m up:\n  ` +
    survey().startLamps.join("\n  "));
  const { gantry, gate } = survey().lampHosts;
  console.log(`start lamps: ${gantry.length} on a scenery gantry, ${gate.length} on the engine gate (${gate.join(" ")})`);
  // Anti-vacuity, while the whole fleet is in the pass: both hosts are used.
  if (gantry.length + gate.length >= 52) assert.ok(gantry.length > 0 && gate.length > 0, "both lamp hosts are exercised");
});

test("a circuit that dresses gantries stands one over its start line", () => {
  // The _sceneryShift trap (AGENTS.md): a gantry(0.0) authored at the scenery
  // origin is re-keyed through sl() (brands_hatch, donington) to reach the line.
  assert.deepEqual(survey().startGantry, [],
    `re-key the start gantry through sl() so it stands within ${START_M} m of the line:\n  ` +
    survey().startGantry.join("\n  "));
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

test("the pit canopy luminaires throw at the working lane, not at the racing road", () => {
  // buildTrackLights sizes a lamp's energy by its lens → near-lane-centre
  // distance squared. A soffit luminaire 5 m over the working lane is 16 m
  // from that point, so measured against the road it came out ~27× too hot
  // (Monaco's tunnel soffits fudge the same thing with `energy`). A record's
  // `aimAt` names the point it lights instead; the bake takes throw, aim and
  // incidence from it. Monaco's hand-tuned soffits land ~250.
  for (const id of ["bahrain", "silverstone"]) {
    const { track, L } = nightLights(id);
    const pit = (track.lampPosts || []).filter((p) => p.pit && !p.entry);   // the canopy's; the entrance pair is pit-complex.test's
    assert.equal(pit.length, 6, `${id}: the row's six luminaires are registered`);
    for (const p of pit) {
      let o0 = -1, best = Infinity;
      for (let o = 0; o < L.length; o += STRIDE) {
        const d = Math.hypot(L[o] - p.x, L[o + 1] - p.y, L[o + 2] - p.z);
        if (d < best) { best = d; o0 = o; }
      }
      assert.ok(best <= ON_FIXTURE_M, `${id}: the light sits on its luminaire`);
      const e = Math.max(L[o0 + 3], L[o0 + 4], L[o0 + 5]);
      assert.ok(e >= 150 && e <= 600, `${id}: energy ${e.toFixed(0)} — a lane pool, not a floodlight`);
      assert.ok(L[o0 + 8] < -0.9, `${id}: the beam points down (${L[o0 + 8].toFixed(2)})`);
      assert.ok(L[o0 + I_RAD] <= 20, `${id}: radius ${L[o0 + I_RAD]} reaches the wall and the bays, not the far kerb`);
    }
  }
});
