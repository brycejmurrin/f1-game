// REAL REPLAY frame fit (js/race/real-replay.js, js/data/real-race-tab.js) on the real Baku build.
// OpenF1's x/y for one of Russell's laps (a 2 Hz excerpt in the fixture) lands on the game's centreline
// within the road width, mirrored and turned as the feed's frame is, running the lap forward and 5.9 km
// long; and the spatial search behind the fit keeps exhaustive nearest matches. Split from
// real-replay-vm.test.mjs (M1-15).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");
import { ROOT, FIXTURE, TOTAL_REAL, host, line } from "../helpers/real-replay-fixtures.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

test("Russell's real lap lands on the game's Baku centreline: mirrored, turned, forward, 5.9 km", async () => {
  const g = await createGame({ track: "baku" });
  try {
    const R = vm.runInContext("RealReplay", g.ctx);
    const track = g.G.track;
    assert.ok(track && track.n > 1000 && Math.abs(track.total - TOTAL_REAL) < 150, "the game's Baku is the real length: " + track.total);
    const ex = FIXTURE.locationExcerpt;
    const pts = ex.rows.map((r) => [r[1] / 10, r[2] / 10]);
    const fit = R.fitFrame(track, pts);
    assert.ok(fit, "a fit");
    assert.ok(fit.rms < 7, "inside the road width (the fit pairs against a coarse centreline): rms " + fit.rms);
    assert.equal(fit.refl, -1, "OpenF1's frame is the mirror of the game's (+Y up, x/z ground)");
    // The trace as the engine keeps it: [t, x, y]* with t in seconds from lights out.
    const raw = Float32Array.from(ex.rows.flatMap((r) => [r[0] / 1000, r[1] / 10, r[2] / 10]));
    const tr = R.trackTrace(track, fit, raw);
    assert.equal(tr.n, ex.rows.length);
    const len = tr.prog[tr.n - 1] - tr.prog[0];
    assert.ok(len > 5700 && len < 6100, "one lap of progress: " + len);
    let back = 0;
    for (let i = 1; i < tr.n; i++) if (tr.prog[i] < tr.prog[i - 1] - 0.5) back++;
    assert.equal(back, 0, "never backwards");
    let worst = 0;
    for (let i = 0; i < tr.n; i++) worst = Math.max(worst, Math.abs(tr.x[i]));
    assert.ok(worst < 14, "the racing line stays near the road: " + worst);
    const at = R.sampleAt(tr, (raw[3 * 100] + raw[3 * 101]) / 2, {});
    assert.ok(at.speed > 25 && at.speed < 95, "a racing speed between two samples: " + at.speed);
    assert.ok(!at.before && !at.ended);
    assert.ok(R.sampleAt(tr, raw[0] - 5, {}).before, "before its data: on the grid");
    assert.ok(R.sampleAt(tr, tr.end + R.ENDED_S + 1, {}).ended, "after its data: stopped");
    // buildTraces fits on the winner's fastest lap when the whole race is there; with only this
    // excerpt on the winner it falls back to the first minutes after the start.
    const built = R.buildTraces(track, { drivers: [{ num: 63, pos: 1, code: "RUS", laps: [], lapStart: [] }] }, { cars: { 63: raw } });
    assert.ok(built && built.fit && built.byNum.get(63).n === tr.n);
  } finally { g.close(); }
});

test("frame-fit spatial search preserves exhaustive nearest matches, ties, and the exact Baku fit", async () => {
  const source = fs.readFileSync(path.join(ROOT, "js/race/real-replay.js"), "utf8");
  const start = source.indexOf("    function index(ids, axis) {"), end = source.indexOf("    const cs = centroid(S), ct = centroid(C);");
  assert.ok(start > 0 && end > start, "the index and unchanged ICP boundary are present");
  // Keep the production fit and replace only its search with the previous
  // exhaustive oracle. Compare every returned float, not a looser RMS bound.
  const exhaustive = "    const near = (x, y) => { let b = 0, bd = Infinity; for (let i = 0; i < C.length; i++) { const dx = C[i][0] - x, dy = C[i][1] - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; b = i; } } return b; };\n";
  const load = (code) => vm.runInNewContext(code + "; RealReplay", { M4: { clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)) } });
  const oldMapper = "    const mapper = (refl, th, tx, ty) => (p) => { const x = p[0], y = refl * p[1], cos = Math.cos(th), sin = Math.sin(th); return [cos * x - sin * y + tx, sin * x + cos * y + ty]; };\n";
  const linear = load((source.slice(0, start) + exhaustive + source.slice(end)).replace(/    const mapper = [\s\S]*?(?=    let best = null;)/, oldMapper));
  // Observe just the nearest indices as well, so duplicate points and exact
  // distance ties cannot hide behind an otherwise acceptable final fit.
  const nearest = load(source.replace("    const cs = centroid(S), ct = centroid(C);", "    return pts.map((p) => near(p[0], p[1]));"));
  const coords = Array.from({ length: 96 }, (_, i) => [((i * 17) % 13) - 6, ((i * 7) % 11) - 5]);
  coords.push(...coords.slice(0, 16));
  const track = { n: coords.length, total: 1000, px: coords.map((p) => p[0]), pz: coords.map((p) => p[1]) };
  const queries = coords.concat(Array.from({ length: 128 }, (_, i) => [(i % 17) - 8.5, (i % 19) - 9.5]), [[1e6, 1e6], [-1e6, -1e6]]);
  const expected = queries.map(([x, y]) => {
    let best = 0, distance = Infinity;
    for (let i = 0; i < coords.length; i++) {
      const dx = coords[i][0] - x, dy = coords[i][1] - y, d = dx * dx + dy * dy;
      if (d < distance) { distance = d; best = i; }
    }
    return best;
  });
  assert.deepEqual(host(nearest.fitFrame(track, queries)), expected, "smallest original index wins every nearest-neighbour tie");
  const g = await createGame({ track: "baku" });
  try {
    const R = vm.runInContext("RealReplay", g.ctx);
    const pts = FIXTURE.locationExcerpt.rows.map((r) => [r[1] / 10, r[2] / 10]);
    assert.deepEqual(host(R.fitFrame(g.G.track, pts)), host(linear.fitFrame(g.G.track, pts)), "same winning transform, handedness, residual, and sample count");
    for (const refl of [1, -1]) {
      const trace = coords.map(([x, y]) => [x * 0.8 - y * 0.6 + 150, refl * (x * 0.6 + y * 0.8) - 200]);
      assert.deepEqual(host(R.fitFrame(track, trace)), host(linear.fitFrame(track, trace)), "same fit on a repeated, crossing centreline with handedness " + refl);
    }
  } finally { g.close(); }
});

test("trackTrace reuses one transform while mapPoint still observes mutable fits", () => {
  const source = fs.readFileSync(path.join(ROOT, "js/race/real-replay.js"), "utf8");
  const calls = { sin: 0, cos: 0 }, math = Object.create(Math);
  for (const key of ["sin", "cos"]) math[key] = (x) => { calls[key]++; return Math[key](x); };
  const track = { total: 10000 }, fit = { refl: -1, th: 0.41, tx: 120, ty: -44 };
  const project = (_track, x, z) => ({ s: x + 500, lat: z });
  const R = vm.runInNewContext(source + "; RealReplay", { Math: math, M4: { clamp: (x) => x }, Tracks: { project } }, { filename: absSrc("js/race/real-replay.js") });
  const raw = Float32Array.from(Array.from({ length: 1000 }, (_, i) => [i * 0.5, i * 2, Math.sin(i / 30)]).flat());
  const actual = R.trackTrace(track, fit, raw);
  assert.deepEqual(calls, { sin: 1, cos: 1 }, "one trig pair per trace, independent of sample count");
  const expected = Array.from({ length: actual.n }, (_, i) => {
    const w = R.mapPoint(fit, raw[i * 3 + 1], raw[i * 3 + 2]);
    return project(track, w[0], w[1]);
  });
  assert.deepEqual(Array.from(actual.prog), Array.from(Float32Array.from(expected.map((p) => p.s))), "unchanged projection floats");
  assert.deepEqual(Array.from(actual.x), Array.from(Float32Array.from(expected.map((p) => p.lat))), "unchanged lateral floats");
  const first = Array.from(R.mapPoint(fit, 123, 456));
  fit.th += 0.25;
  assert.notDeepEqual(Array.from(R.mapPoint(fit, 123, 456)), first, "public single-point transforms do not cache mutable fit angles");
});
