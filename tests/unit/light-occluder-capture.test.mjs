// light-occluder-capture.test.mjs — the visor light-occluder capture and index
// answer exactly what they did before #7388 made them cheap (hunt #7387 rows 1-2).
//
// Member 1: a FOLIAGE/WOOD cone/cyl/frustum is recorded from the triangles its real
// emitter just wrote, not re-drawn into a scratch, and records accumulate in f32.
// The oracle here is the pre-#7388 code verbatim (redraw + per-triangle array +
// f32 copy), run on every call of a real spa and monaco build: every record must
// match bit for bit, and so must the record count.
// Member 2: boxes spanning more than 8 x 8 cells sit in one always-tested list
// instead of every 16 m cell. An index binned the old way over the same boxes must
// give the same lightBlocked answer on every ray of a fixed set.
//
// Readers: VisorOptics.sourceBlocked (helmet camera) and VisorOptics.captureLight
// (Photo Studio). ~10 s: two headless builds.
//
// Run: node --test tests/unit/light-occluder-capture.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildContext } = require("../../tools/track/verify-track.cjs");

const Tracks = buildContext(null, { quiet: true, assets: true });
const VMG = Tracks._vmContext, G = VMG.TrackGeom, TM = VMG.TrackModels;
const STRIDE = 18, CELL = 16;

// ---- the pre-#7388 capture, verbatim but for names ------------------------
function oldLightMesh(records, mesh, transform) {
  const p = mesh.pos, idx = mesh.idx, cs = Math.cos(transform?.rotY || 0), sn = Math.sin(transform?.rotY || 0);
  const scale = transform?.scale ?? 1;
  for (let i = 0; i < idx.length; i += 3) {
    const v = [];
    for (let j = 0; j < 3; j++) {
      const n = idx[i + j] * 3, x = p[n] * scale, y = p[n + 1] * scale, z = p[n + 2] * scale;
      v.push(x * cs + z * sn + (transform?.x || 0), y + (transform?.y || 0), -x * sn + z * cs + (transform?.z || 0));
    }
    records.push(...v, 0, 0, 0,
      Math.min(v[0], v[3], v[6]), Math.min(v[1], v[4], v[7]), Math.min(v[2], v[5], v[8]),
      Math.max(v[0], v[3], v[6]), Math.max(v[1], v[4], v[7]), Math.max(v[2], v[5], v[8]));
  }
}
function oldLightPrimitive(records, out, kind, args) {
  const mat = Math.floor((out._mat || 0) + 0.5);
  if (out._dryRun || (mat !== G.MAT.FOLIAGE && mat !== G.MAT.WOOD)) return;
  const scratch = { pos: [], nrm: [], col: [], idx: [], mat: [] };
  (kind === "cone" ? G.addCone : kind === "cyl" ? G.addCyl : G.addFrustum)(scratch, ...args);
  oldLightMesh(records, scratch);
}
// The pre-#7388 binning: every box in every cell its bounds span.
function oldIndex(index) {
  const boxes = index.boxes, cells = new Map();
  for (let id = 0; id < boxes.length / STRIDE; id++) {
    const n = id * STRIDE;
    for (let x = Math.floor(boxes[n + 12] / CELL); x <= Math.floor(boxes[n + 15] / CELL); x++)
      for (let z = Math.floor(boxes[n + 14] / CELL); z <= Math.floor(boxes[n + 17] / CELL); z++) {
        const key = x * 65536 + z;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(id);
      }
  }
  for (const [k, l] of cells) cells.set(k, new Uint32Array(l));
  return { boxes, cells, bounds: index.bounds, stamp: new Uint32Array(index.stamp.length), generation: 0, queries: 0, tests: 0 };
}
const slice = (records, from, to) => (records._data ? Array.from(records._data.subarray(from, to)) : records.slice(from, to));

// Wrap the capture entry points build-props calls (TrackModels) for one build: each call's new records against the oracle's.
function buildChecked(id) {
  const lp = TM.lightPrimitive, lm = TM.lightMesh, wrapped = { ...TM };
  const stats = { calls: 0, records: 0, mismatches: [] };
  const check = (records, before, oracle, what) => {
    stats.calls++;
    const got = slice(records, before, records.length), want = Array.from(Float32Array.from(oracle));
    stats.records += got.length / STRIDE;
    if (got.length !== want.length || got.some((v, i) => !Object.is(v, want[i])))
      if (stats.mismatches.length < 5) stats.mismatches.push(`${what}: ${got.length / STRIDE} vs ${want.length / STRIDE} records`);
  };
  wrapped.lightPrimitive = (records, out, kind, args, from) => {
    const before = records.length, oracle = [];
    oldLightPrimitive(oracle, out, kind, args);
    lp(records, out, kind, args, from);
    check(records, before, oracle, kind);
  };
  wrapped.lightMesh = (records, mesh, transform) => {
    const before = records.length, oracle = [];
    oldLightMesh(oracle, mesh, transform);
    lm(records, mesh, transform);
    check(records, before, oracle, "mesh");
  };
  // TrackModels is frozen: build-props reads the global at call time, so swap in a wrapped copy.
  VMG.TrackModels = wrapped;
  try { return { track: Tracks.build(Tracks.LIST.find((d) => d.id === id)), stats }; }
  finally { VMG.TrackModels = TM; }
}

// A fixed, seeded ray set inside the index bounds, eyes in the lowest 60 m.
function rays(bounds, count) {
  let s = 12345;
  const rnd = () => (s = (s * 1103515245 + 12345) >>> 0) / 4294967296;
  const out = [];
  for (let i = 0; i < count; i++) {
    const eye = [bounds[0] + rnd() * (bounds[3] - bounds[0]), bounds[1] + rnd() * Math.min(60, bounds[4] - bounds[1]),
      bounds[2] + rnd() * (bounds[5] - bounds[2])];
    let dx = rnd() - 0.5, dy = rnd() * 0.6, dz = rnd() - 0.5;
    const l = Math.hypot(dx, dy, dz);
    out.push([eye, dx / l, dy / l, dz / l, 50 + rnd() * 400]);
  }
  return out;
}
const inserts = (index) => { let n = index.large ? index.large.length : 0; for (const l of index.cells.values()) n += l.length; return n; };

for (const id of ["spa", "monaco"]) {
  test(`${id}: every captured occluder record matches the pre-#7388 capture, and lightBlocked answers the same`, () => {
    const { track, stats } = buildChecked(id);
    assert.deepEqual(stats.mismatches, [], "records differ from the redraw capture");
    assert.ok(stats.calls > 100 && stats.records > 1000, `premise: ${id} captures foliage (${stats.calls} calls)`);
    const index = track._lightOccluders;
    assert.ok(index && index.boxes.length % STRIDE === 0 && index.boxes.length > 0, "the index is built");
    const old = oldIndex(index);
    let blocked = 0;
    for (const [eye, dx, dy, dz, maxT] of rays(index.bounds, 3000)) {
      const want = G.lightBlocked({ _lightOccluders: old }, eye, dx, dy, dz, maxT);
      assert.equal(G.lightBlocked(track, eye, dx, dy, dz, maxT), want, `ray from ${eye.map((v) => v.toFixed(1))}`);
      if (want) blocked++;
    }
    assert.ok(blocked > 50, `premise: the ray set hits occluders (${blocked})`);
    if (id === "monaco") {
      assert.ok(index.large.length > 0, "monaco's sea and city slabs go in the large list");
      assert.ok(inserts(index) < 60000, `monaco index inserts ${inserts(index)} (286,241 before #7388)`);
      assert.ok(inserts(old) > 5 * inserts(index), "premise: the old binning was far larger");
    }
  });
}

test("records from a plain array (the VisorOptics test path) and from TrackModels.lightRecords index alike", () => {
  const acc = TM.lightRecords();
  TM.lightPrimitive(acc, { _mat: G.MAT.FOLIAGE }, "cone", [[0, 0, -20], 4, 12, [0.2, 0.4, 0.1], 7]);
  assert.equal(acc.length, 7 * STRIDE);
  const records = [];
  TM.lightPrimitive(records, { _mat: G.MAT.FOLIAGE }, "cone", [[0, 0, -20], 4, 12, [0.2, 0.4, 0.1], 7]);
  assert.equal(records.length, 7 * STRIDE, "a redraw records one triangle per cone face");
  const index = G.lightIndex(records);
  assert.equal(index.boxes.length, records.length);
  assert.deepEqual([...G.lightIndex(acc).boxes], [...index.boxes], "the f32 accumulator indexes to the same boxes");
  assert.equal(G.lightBlocked({ _lightOccluders: index }, [0, 4, 0], 0, 0, -1, 40), true);
  assert.equal(G.lightBlocked({ _lightOccluders: index }, [0, 40, 0], 0, 0, -1, 40), false);
});
