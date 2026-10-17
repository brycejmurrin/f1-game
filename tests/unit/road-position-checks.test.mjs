// road-position-checks.test.mjs — the position-based road-ribbon checks (#1943).
//
// verify-track's index/duplicate/fold checks accept three injected defects on a real
// circuit (Monza), because they never read a position: a collapsed running-surface
// section, every skirt bottom lifted onto its top, and one main-road vertex lifted 50 m.
// checkRoadPositions must reject each one, accept the unmodified circuit (and a fold-clamped
// street circuit, whose coincident rails must not trip it), and not ban zero-area triangles.
//
// Run: node --test tests/unit/road-position-checks.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildContext } = require("../../tools/lib/track-build-vm.cjs");
const { checkRoadPositions, roadPositionMetrics, V } = require("../../tools/lib/road-position-checks.cjs");

const env = buildContext();
const build = (id) => env.Tracks.build(env.Tracks.LIST.find((t) => t.id === id));
// A view of a built track whose roadGeo positions are a private copy we may damage.
const copy = (track) => {
  const src = track.roadGeo.pos._data || track.roadGeo.pos;
  return { n: track.n, total: track.total, roadGeo: { pos: Float64Array.from(src) } };
};

const monza = build("monza");

test("an unmodified circuit passes, with fleet-like margins", () => {
  assert.deepEqual(checkRoadPositions(monza), []);
  const m = roadPositionMetrics(monza);
  assert.ok(m.minRunWidth > 10 && m.minSkirtDepth > 1 && m.detachedSkirts === 0 && m.maxRise < 0.5, JSON.stringify(m));
  assert.equal(m.skirtPairs, 2 * monza.n);
});

test("a fold-clamped street circuit with coincident rails passes", () => {
  assert.deepEqual(checkRoadPositions(build("monaco")), []);
});

test("a running-surface section collapsed to zero width is rejected", () => {
  const t = copy(monza), P = t.roadGeo.pos;
  for (let k = 200; k < 218; k++) // 18 rows: every running column onto the centre column
    for (let v = 2; v <= 11; v++) for (let a = 0; a < 3; a++) P[(k * V + v) * 3 + a] = P[(k * V + 5) * 3 + a];
  const fails = checkRoadPositions(t);
  assert.ok(fails.some((f) => /collapsed: 0\.00 m wide/.test(f)), fails.join("\n"));
});

test("a section collapsed along the lap (consecutive rows coincide) is rejected", () => {
  const t = copy(monza), P = t.roadGeo.pos;
  for (let k = 300; k < 306; k++) for (let v = 0; v < V; v++) for (let a = 0; a < 3; a++) P[(k * V + v) * 3 + a] = P[(300 * V + v) * 3 + a];
  assert.ok(checkRoadPositions(t).some((f) => /along the lap/.test(f)));
});

test("skirts collapsed onto their tops are rejected", () => {
  const t = copy(monza), P = t.roadGeo.pos, base = (monza.n + 1) * V;
  for (let i = 0; i < 4 * monza.n; i += 2) P[(base + i + 1) * 3 + 1] = P[(base + i) * 3 + 1];
  const fails = checkRoadPositions(t);
  assert.ok(fails.some((f) => /skirt depth 0\.00/.test(f)), fails.join("\n"));
});

test("a skirt top detached from the ribbon edge is rejected", () => {
  const t = copy(monza), P = t.roadGeo.pos, base = (monza.n + 1) * V;
  P[(base + 2 * 40) * 3] += 5;
  assert.ok(checkRoadPositions(t).some((f) => /not on the ribbon edge/.test(f)));
});

test("a main-road vertex lifted 50 m is rejected", () => {
  const t = copy(monza), P = t.roadGeo.pos;
  P[(500 * V + 6) * 3 + 1] += 50;
  const fails = checkRoadPositions(t);
  assert.ok(fails.some((f) => /vertical discontinuity \d+\.\d+ m at node 5(00|01|99)/.test(f)), fails.join("\n"));
});
