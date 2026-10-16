// terrain-normals.test.mjs — the terrain ribbon must be shaded by its OWN
// shape, not by a constant up-vector.
//
// buildTerrain used to push `nrm.push(0, 1, 0)` for every vertex it emitted.
// The ribbon is not flat: it tracks the road's elevation around the lap, grades
// down toward the lap's low point at its outer edge, and is carved DOWN under
// the road wherever another part of the circuit passes nearby. With one
// up-normal everywhere, all of that shaded as a level plane — an embankment, a
// banked verge and a flat runoff all took exactly the same amount of sun. That
// is the kind of defect that never throws and never shows up in a vertex count,
// which is why it survived: `tools/track/verify-track.cjs` happily reported OK.
//
// So this asserts the SHADING INPUT directly, off the built mesh. A regression
// back to a constant normal collapses the tilt spread to zero and fails here.
//
// Run: node --test tests/unit/terrain-normals.test.mjs  (npm run test:tooling-fast)

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { buildContext } = require("../../tools/track/verify-track.cjs");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// One street circuit and one open circuit: they take different paths through
// buildTerrain (lats, floor grading, how much road passes close to itself), and
// a constant-normal regression could plausibly survive in only one of them.
const TRACKS = ["monaco", "silverstone"];

// buildContext() re-evaluates the whole track engine plus all 40 circuit files,
// and Tracks.build() dresses a circuit — together several seconds. Both are
// pure w.r.t. this test, so build the context once and memoise per track;
// otherwise the four assertions below cost four full builds and this suite
// alone doubles test:tooling-fast.
let _ctx = null;
const _stats = new Map();
function terrainStats(id) {
  if (_stats.has(id)) return _stats.get(id);
  const Tracks = _ctx || (_ctx = buildContext());
  const def = Tracks.LIST.find((d) => d.id === id);
  assert.ok(def, `track "${id}" not in Tracks.LIST`);
  const track = Tracks.build(def);
  const mesh = Tracks._vmContext.TrackMesh.buildTerrain(track);
  const n = mesh.nrm.length / 3;
  assert.ok(n > 1000, `${id}: terrain has only ${n} verts — did the ribbon build?`);

  let nonUnit = 0, downward = 0, tilted = 0, sumTilt = 0;
  for (let i = 0; i < n; i++) {
    const x = mesh.nrm[i * 3], y = mesh.nrm[i * 3 + 1], z = mesh.nrm[i * 3 + 2];
    const l = Math.hypot(x, y, z);
    if (!Number.isFinite(l) || Math.abs(l - 1) > 1e-3) nonUnit++;
    if (y <= 0) downward++;
    const tilt = Math.acos(Math.max(-1, Math.min(1, y))) * 180 / Math.PI;
    if (tilt > 3) tilted++;
    sumTilt += tilt;
  }
  const out = { n, nonUnit, downward, tilted, meanTilt: sumTilt / n };
  _stats.set(id, out);
  return out;
}

for (const id of TRACKS) {
  test(`${id}: terrain normals are unit length and point up`, () => {
    const s = terrainStats(id);
    // Non-unit normals are not cosmetic: the lambert term scales with |N|, so a
    // stray length silently brightens or darkens whole patches of ground.
    assert.equal(s.nonUnit, 0, `${s.nonUnit}/${s.n} terrain normals are not unit length`);
    // Terrain is heightfield-like — nothing in the ribbon overhangs — so a
    // downward normal means a winding/sign bug, which renders as black ground.
    assert.equal(s.downward, 0, `${s.downward}/${s.n} terrain normals point down`);
  });

  test(`${id}: terrain normals follow the ribbon's shape, not a constant up-vector`, () => {
    const s = terrainStats(id);
    // A hardcoded (0,1,0) scores exactly 0 on both. The thresholds sit far below
    // what the real geometry produces (measured: monaco mean 24.9deg / 63% of
    // verts past 3deg, silverstone mean 5.2deg / 30%) so ordinary layout edits
    // do not trip them, but a collapse back to constant does.
    assert.ok(s.meanTilt > 1.5,
      `${id}: mean terrain normal tilt ${s.meanTilt.toFixed(2)}deg — the ribbon is being shaded flat`);
    assert.ok(s.tilted / s.n > 0.1,
      `${id}: only ${(100 * s.tilted / s.n).toFixed(1)}% of terrain verts tilt past 3deg — shaded flat`);
  });
}

// THE ROAD, TOO, ON A BANK. buildRoad offset every banked vertex along u by
// bankOffsetAt (a linear tilt across the tarmac, ramping in and out along the
// lap) but pushed the unbanked u as its normal, so Zandvoort's 19° bowl,
// Madrid's 13.5° and Indianapolis' 15° lit like flat road.
// The measure: each running-surface vertex normal against the area-weighted
// normal of the two faces either side of it along its column, MINUS the same
// angle on the same circuit built without its bank — the mesh's own faceting
// (Spa reads 10.6° flat at its sharpest kink) is not the bank's to fix. Before
// the fix the bank added 19° / 13.5° / 14.7°; after it 1.0° / 0.7° / 3.2°, the
// last on Indianapolis T1's inner rail, where the bank ramps 0.4 m a node over
// a 0.55 m sliver of road.
const BANKED = ["zandvoort", "madrid", "indianapolis"];
function surfaceNormalErrors(tr) {
  const Tracks = _ctx;
  const g = Tracks._vmContext.TrackMesh.buildRoad(tr), V = 14, P = g.pos, N = g.nrm, out = [];
  const face = (k, v) => {                  // un-normalised: the cross product's length is the area
    const a = k * V + v, b = a + 1, c = (k + 1) * V + v;
    const e1 = [0, 1, 2].map((i) => P[b * 3 + i] - P[a * 3 + i]), e2 = [0, 1, 2].map((i) => P[c * 3 + i] - P[a * 3 + i]);
    const f = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    return f[1] < 0 ? f.map((x) => -x) : f;
  };
  for (let k = 1; k < tr.n - 1; k++) for (let v = 3; v < 10; v++) {   // running surface, off the edge line
    const f1 = face(k - 1, v), f2 = face(k, v), f = [f1[0] + f2[0], f1[1] + f2[1], f1[2] + f2[2]];
    const a = k * V + v, vn = [N[a * 3], N[a * 3 + 1], N[a * 3 + 2]];
    const cos = (f[0] * vn[0] + f[1] * vn[1] + f[2] * vn[2]) / (Math.hypot(...f) * Math.hypot(...vn));
    out.push(Math.acos(Math.min(1, cos)) * 180 / Math.PI);
  }
  return out;
}
function bankShadingExcess(id) {
  const Tracks = _ctx || (_ctx = buildContext());
  const def = Tracks.LIST.find((d) => d.id === id);
  const banked = Tracks.buildCenterline(def, { line: false });
  const flat = Tracks.buildCenterline(def, { line: false });
  flat.bankP = null;
  const eb = surfaceNormalErrors(banked), ef = surfaceNormalErrors(flat);
  let worst = 0, at = 0, sum = 0, cnt = 0;
  for (let i = 0; i < eb.length; i++) {
    const k = 1 + Math.floor(i / 7);
    if (!(banked.bankP.lift[k] > 0)) continue;
    const d = eb[i] - ef[i];
    sum += d; cnt++;
    if (d > worst) { worst = d; at = k / banked.n; }
  }
  return { worst, at, mean: cnt ? sum / cnt : 0, cnt };
}

for (const id of BANKED) {
  test(`${id}: banked road vertex normals follow the bank`, () => {
    const r = bankShadingExcess(id);
    assert.ok(r.cnt > 100, `premise: ${id} carries a bank profile (${r.cnt} banked vertices)`);
    assert.ok(r.worst < 4, `${id}: the bank adds ${r.worst.toFixed(2)}° of normal error at lap ${r.at.toFixed(3)}`);
    assert.ok(r.mean < 0.5, `${id}: mean added normal error ${r.mean.toFixed(2)}° over banked vertices`);
  });
}

// The AI brake planner reads Tracks.bankAngle; the executor reads banking().
// They must be one channel: on Zandvoort the planner saw 0 while the executor
// applied a 19° bowl's grip.
test("Tracks.bankAngle is banking()'s roll at every node (zandvoort)", () => {
  const Tracks = _ctx || (_ctx = buildContext());
  const tr = Tracks.buildCenterline(Tracks.LIST.find((d) => d.id === "zandvoort"), { line: false });
  let maxDeg = 0, off = 0;
  for (let k = 0; k < tr.n; k++) {
    const s = (k + 0.37) * tr.total / tr.n;               // between nodes: the lerp must match too
    const b = Tracks.banking(tr, s, 0, {});
    const want = b ? b.roll : 0, got = Tracks.bankAngle(tr, s);
    if (got !== want) off++;
    maxDeg = Math.max(maxDeg, Math.abs(got) * 180 / Math.PI);
  }
  assert.equal(off, 0, "bankAngle and banking().roll disagree");
  assert.ok(maxDeg > 15, `the planner sees Zandvoort's bowl (max ${maxDeg.toFixed(1)}°)`);
});

// bankAngle used to wrap banking() (scratch write + smooth branch + atan2 on
// every flat node). pushLook calls it ~200×/physics step; routing through
// banking() was measurable waste (~10–13 % of step wall time in the game-vm).
// The fast path must stay independent of banking() and still match its roll
// (test above). A revert that re-wraps banking() fails this call-count pin.
test("Tracks.bankAngle does not call banking() (AI look hot path)", () => {
  const Tracks = _ctx || (_ctx = buildContext());
  const tr = Tracks.buildCenterline(Tracks.LIST.find((d) => d.id === "monza"), { line: false });
  let hits = 0;
  const keep = Tracks.banking;
  Tracks.banking = function () { hits++; return keep.apply(this, arguments); };
  try {
    for (let k = 0; k < tr.n; k++) Tracks.bankAngle(tr, (k + 0.37) * tr.total / tr.n);
  } finally {
    Tracks.banking = keep;
  }
  assert.equal(hits, 0, `bankAngle must not route through banking() (got ${hits} calls)`);
});

// Source pin for the updateCar grip path: bankAngle === banking().roll, so the
// executor must not pay for a second lookup. A Math.max(..., bankAngle(...))
// re-introduction is the regression this catches.
test("updateCar bank grip does not re-read bankAngle", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  const bankMu = src.indexOf("const bankMu = 1 + Math.sin(bankRoll)");
  assert.ok(bankMu >= 0, "bankMu site present");
  const window = src.slice(Math.max(0, bankMu - 400), bankMu + 80);
  assert.match(window, /bankPhys\s*\?\s*Math\.abs\(bankPhys\.roll\)/, "bankRoll from banking() scratch");
  assert.doesNotMatch(window, /Tracks\.bankAngle\s*\(/, "no second bankAngle lookup next to bankMu");
});