// The hazard-projection hint in js/physics/debris-world.js.
//
// hazards() used to call Tracks.project with NO hint, which scans every
// centreline segment (n = round(total/4): 824 on monaco, 1737 on spa) for every
// live shard, disturbed cone and broken panel at 4 Hz. Each record already
// carries the arc it was placed at, so it can seed a ±16-node search instead.
//
// The hazard is that a hint RESTRICTS the search window rather than seeding it,
// so a stale or cross-leg hint mis-projects SILENTLY. projectHazard therefore
// trusts a hinted answer only when it passes consider()'s own two tests (inside
// the road half-width, at this road's height) and otherwise falls back to the
// full scan. This file pins what that guard is worth:
//
//   · on every circuit but suzuka, hinting changes NO accept/reject verdict, at
//     any staleness up to a 2 km wrong hint;
//   · suzuka is a figure-of-eight, and the HEIGHT half of the guard is what stops
//     a hint on one leg of the crossover being trusted for a body on the other;
//   · both halves are load-bearing — the last two tests fail the moment either
//     the fallback or the height test is removed (anti-vacuity).
//
// The subject is EXTRACTED FROM THE REAL SOURCE, not re-implemented here, so a
// change to the shipped function is what these assertions run against.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const { buildContext } = require(path.join(ROOT, "tools", "track-build-vm.cjs"));

const SRC_PATH = path.join(ROOT, "js/physics/debris-world.js");
const SRC = fs.readFileSync(SRC_PATH, "utf8");

// ── pull the real projectHazard + HAZARD_Y_TOL out of the module ────────────
function extractFn(src, name) {
  const i = src.indexOf(`function ${name}(`);
  assert.ok(i >= 0, `${name}() not found in js/physics/debris-world.js — was it renamed?`);
  let depth = 0;
  for (let k = src.indexOf("{", i); k < src.length; k++) {
    if (src[k] === "{") depth++;
    else if (src[k] === "}" && --depth === 0) return src.slice(i, k + 1);
  }
  throw new Error(`unbalanced braces reading ${name}()`);
}

const HAZARD_Y_TOL = Number(/const HAZARD_Y_TOL = ([\d.]+)/.exec(SRC)[1]);
const _smp = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };

const env = buildContext();
const Tracks = env.Tracks;

// The shipped function, given the three names it closes over.
const projectHazard = new Function(
  "Tracks", "_smp", "HAZARD_Y_TOL",
  `${extractFn(SRC, "projectHazard")}; return projectHazard;`,
)(Tracks, _smp, HAZARD_Y_TOL);

// Two deliberately-broken variants, to prove each half of the guard is what the
// assertions below are actually detecting.
function noFallback(track, x, y, z, hint) {
  const pr = hint != null ? Tracks.project(track, x, z, hint) : Tracks.project(track, x, z);
  Tracks.sample(track, pr.s, _smp);
  return pr;
}
function noHeightTest(track, x, y, z, hint) {
  if (hint != null) {
    const pr = Tracks.project(track, x, z, hint);
    Tracks.sample(track, pr.s, _smp);
    if (pr.dist <= (_smp.hw || 6)) return pr;
  }
  const pr = Tracks.project(track, x, z);
  Tracks.sample(track, pr.s, _smp);
  return pr;
}

const _b = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
const built = new Map();
function build(id) {
  if (!built.has(id)) {
    const def = env.Tracks.LIST.find((d) => d.id === id);
    assert.ok(def, `no circuit ${id}`);
    const from = env.mark();
    built.set(id, env.Tracks.build(def));
    env.trim(from);
  }
  return built.get(id);
}

// consider()'s verdict, given a projection result and the body's height. Mirrors
// js/physics/debris-world.js hazards(): at road height AND inside the half-width.
const verdict = (pr, y) =>
  Math.abs(y - _smp.p[1]) <= HAZARD_Y_TOL && Math.abs(pr.lat) <= (_smp.hw || 6);

// Place a settled body ON the road at arc sTrue, offset laterally, and ask a
// policy where it is when seeded with `hint`. Returns {ok, s} plus the truth.
function probe(track, policy, sTrue, latF, hint) {
  Tracks.sample(track, sTrue, _b);
  const rl = Math.hypot(_b.r[0], _b.r[2]) || 1;
  const lat = latF * (_b.hw || 6);
  const x = _b.p[0] + _b.r[0] / rl * lat, z = _b.p[2] + _b.r[2] / rl * lat;
  const y = _b.p[1] + 0.05;                      // resting on the surface
  const truth = Tracks.project(track, x, z);
  Tracks.sample(track, truth.s, _smp);
  const okTruth = verdict(truth, y);
  const pr = policy(track, x, y, z, hint);
  return { ok: verdict(pr, y), s: pr.s, okTruth, sTruth: truth.s };
}

// A staleness sweep: every offset is the gap between where the body ACTUALLY is
// and the arc its record was stamped with — 0 for a cone, tens of metres for a
// shard that skittered, and the rest are hints no longer worth anything.
const STALE = [0, 2, 5, 10, 20, 35, 50, 63, -5, -20, -50, -63, 70, 200, 900, 2000];
const LATS = [0, 0.6, -0.95, 1.2];

function sweep(track, policy, step) {
  let cases = 0, flips = 0, maxDs = 0;
  const L = track.total;
  const dS = (a, b) => { const v = Math.abs(a - b); return Math.min(v, L - v); };
  for (let s0 = 0; s0 < L; s0 += step) {
    for (const off of STALE) {
      const sTrue = ((s0 + off) % L + L) % L;
      for (const latF of LATS) {
        const r = probe(track, policy, sTrue, latF, s0);
        cases++;
        if (r.ok !== r.okTruth) flips++;
        else if (r.ok) maxDs = Math.max(maxDs, dS(r.s, r.sTruth));
      }
    }
  }
  return { cases, flips, maxDs };
}

// Circuits chosen for shape, not for passing: monaco is the tightest and
// lowest-n, spa the longest with the most elevation, miami had the widest
// measured arc drift, monza is the fast baseline, suzuka is the figure-of-eight.
const CIRCUITS = ["monza", "monaco", "spa", "miami"];

test("hinting the hazard projection changes no verdict, at any staleness", () => {
  for (const id of CIRCUITS) {
    const r = sweep(build(id), projectHazard, 47.1);
    assert.ok(r.cases > 2000, `${id}: sweep collapsed to ${r.cases} cases`);
    assert.equal(r.flips, 0,
      `${id}: ${r.flips}/${r.cases} hinted projections disagreed with the full scan ` +
      `about whether the body is a hazard`);
    // The CONT term in TrackSpline.project drags a hinted answer toward its hint.
    // That moves only the per-sector SPLIT of hazards() (never `total`), so it is
    // bounded rather than forbidden — but it must stay far below a sector.
    assert.ok(r.maxDs < track_sector_floor(build(id)),
      `${id}: hinted arc drifted ${r.maxDs.toFixed(1)} m — approaching a sector`);
  }
});

function track_sector_floor(track) { return track.total / 30; }   // ~3% of a lap

test("suzuka crosses itself, and the height test is what keeps the legs apart", () => {
  const track = build("suzuka");
  const n = track.n, ds = track.total / n;
  // Find the crossover: the closest spatial approach between two points more
  // than one hint window (±16 nodes) apart in arc.
  const gap = Math.ceil(64 / ds);
  let best = Infinity, at = null;
  for (let a = 0; a < n; a++) {
    for (let b = a + gap; b < n; b++) {
      if (n - (b - a) < gap) break;
      const dx = track.px[b] - track.px[a], dz = track.pz[b] - track.pz[a];
      const d2 = dx * dx + dz * dz;
      if (d2 < best) { best = d2; at = [a, b]; }
    }
  }
  const [lo, hi] = at;
  const dy = Math.abs(track.py[lo] - track.py[hi]);
  assert.ok(Math.sqrt(best) < 3,
    "expected suzuka's legs to cross within 3 m in XZ — the premise of this test");
  assert.ok(dy > 2 * HAZARD_Y_TOL,
    `expected the crossover legs to be separated in height (got ${dy.toFixed(2)} m)`);

  // The body rests on the LOWER leg (arc sBody); sWrong is the deck above it.
  const sBody = hi * ds, sWrong = lo * ds;
  assert.ok(Math.abs(sBody - sWrong) > 1000, "the two legs should be far apart in arc");
  const arcOff = (a) => Math.min(Math.abs(a - sBody), track.total - Math.abs(a - sBody));
  // Place it latF*hw off its own centreline and return the world point.
  const place = (latF) => {
    Tracks.sample(track, sBody, _b);
    const rl = Math.hypot(_b.r[0], _b.r[2]) || 1;
    const lat = latF * (_b.hw || 6);
    return { x: _b.p[0] + _b.r[0] / rl * lat, z: _b.p[2] + _b.r[2] / rl * lat, y: _b.p[1] + 0.05 };
  };
  const bare = (q) => { const pr = Tracks.project(track, q.x, q.z); Tracks.sample(track, pr.s, _smp); return pr; };

  // (1) THE DELIBERATE IMPROVEMENT, at an offset where the XZ-only full scan is
  // wrong: it snaps this body onto the deck 8 m above, and consider() then throws
  // it away as airborne. Seeded with the arc it was placed at, it stays put and
  // counts. This is the one behaviour change hinting makes, and it is a fix.
  const off = place(0.6);
  const bareOff = bare(off);
  assert.ok(arcOff(bareOff.s) > 1000 && !verdict(bareOff, off.y),
    "premise: the unhinted scan should snap this body onto the far leg and discard it " +
    `(got s=${bareOff.s.toFixed(0)}, hazard=${verdict(bareOff, off.y)})`);
  const own = probe(track, projectHazard, sBody, 0.6, sBody);
  assert.ok(arcOff(own.s) < 20 && own.ok,
    `an own-leg hint should keep the body on its own deck and count it ` +
    `(got s=${own.s.toFixed(0)}, hazard=${own.ok})`);

  // (2) THE GUARD, at an offset where the full scan IS right — so a trusted
  // cross-leg hint would be a regression rather than a wash. The window lands on
  // the wrong deck (Tracks.project is XZ-only and cannot tell), the height test
  // catches it, and projectHazard falls back to exactly the unhinted answer.
  const mid = place(0);
  const bareMid = bare(mid);
  assert.ok(arcOff(bareMid.s) < 20 && verdict(bareMid, mid.y),
    `premise: the unhinted scan should get this one right (got s=${bareMid.s.toFixed(0)})`);
  const stale = projectHazard(track, mid.x, mid.y, mid.z, sWrong);
  assert.equal(stale.s, bareMid.s,
    `a cross-leg hint was TRUSTED (s=${stale.s.toFixed(0)} instead of the full scan's ` +
    `${bareMid.s.toFixed(0)}) — the height half of the trust test is not holding`);
  Tracks.sample(track, stale.s, _smp);
  assert.ok(verdict(stale, mid.y), "and the body is still counted as the hazard it is");

  // (3) ANTI-VACUITY for (2): drop the height test and that same cross-leg hint
  // IS trusted — landing on the deck above, a kilometre away in arc, which turns
  // a real hazard into a discarded one.
  const bad = noHeightTest(track, mid.x, mid.y, mid.z, sWrong);
  assert.ok(Math.abs(bad.s - sWrong) < 100 && arcOff(bad.s) > 1000,
    "without the height test the cross-leg hint should have been trusted onto the far " +
    `leg near ${sWrong.toFixed(0)} — got ${bad.s.toFixed(0)}, so this test is not ` +
    "measuring what it claims");
  assert.ok(!verdict(bad, mid.y), "and that mis-projection should lose the hazard");
});

test("ANTI-VACUITY: without the fallback, the sweep is full of wrong verdicts", () => {
  // The same sweep the first test runs, against a projectHazard that trusts the
  // window unconditionally. If this does NOT fail, the first test proves nothing.
  for (const id of ["monza", "monaco"]) {
    const r = sweep(build(id), noFallback, 47.1);
    assert.ok(r.flips > r.cases * 0.05,
      `${id}: an unguarded hint only flipped ${r.flips}/${r.cases} verdicts — ` +
      "the sweep is too weak to detect the bug the fallback exists for");
  }
});
