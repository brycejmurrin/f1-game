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
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildContext } = require("../../tools/track/verify-track.cjs");

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
