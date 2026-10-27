/* car-geometry-decimate — CarGeometry.decimate, the vertex-clustering step behind the far rival body
 * (a rival past ~250 m is 1-3 px tall, so only its silhouette reads). On the REAL shared rival body:
 *   - lands at or under the target triangle count and keeps a usable mesh (indices in range, no degenerate
 *     triangle, unit normals);
 *   - keeps the silhouette: the bounding box stays within 3 % of the full body's in every axis;
 *   - is deterministic and leaves the input alone;
 *   - a body already under the target is returned as is.
 * Run: node --test tests/unit/car-geometry-decimate.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCar, farBody } from "../../tools/car/tri-census.mjs";

const M = loadCar(undefined, true);
const { Car3D, Parts, Teams, CarGeometry } = M;
const TARGET = 1500;
const body = (extra) => {
  const team = Teams.LIST[0];
  return Car3D.build([0.72, 0.72, 0.72], [0.72, 0.72, 0.72], Object.assign({ field: true, silhouette: true, noDriver: true,
    noWheels: true, livery: {}, smooth: false, parts: Parts.getVisualTiers(Parts.getFactorySetup(team), team) }, extra));
};
// The algorithm tests want the pre-LOD mesh. The race draws body() with no extra.
const dense = () => body({ noSharedLod: true });
const box = (o) => {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < o.pos.length; i += 3) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], o.pos[i + k]); b[3 + k] = Math.max(b[3 + k], o.pos[i + k]); }
  return b;
};

test("the far body decimates under the target and stays a valid mesh", () => {
  const full = dense(), n = full.idx.length;
  assert.ok(n / 3 > TARGET, "the shared body is bigger than the target (else this test is vacuous): " + n / 3);
  const d = CarGeometry.decimate(full, TARGET);
  assert.equal(full.idx.length, n, "the input is left alone");
  const tris = d.idx.length / 3, verts = d.pos.length / 3;
  assert.ok(tris <= TARGET && tris >= TARGET * 0.5, `decimated to ${tris} tris (target ${TARGET})`);
  assert.equal(d.nrm.length, d.pos.length); assert.equal(d.col.length, d.pos.length);
  if (full.mat) assert.equal(d.mat.length, verts);
  for (let t = 0; t < d.idx.length; t += 3) {
    const a = d.idx[t], b = d.idx[t + 1], c = d.idx[t + 2];
    assert.ok(a < verts && b < verts && c < verts && a !== b && b !== c && a !== c, "valid, non-degenerate triangle " + t / 3);
  }
  for (let i = 0; i < verts; i++) assert.ok(Math.abs(Math.hypot(d.nrm[i*3], d.nrm[i*3+1], d.nrm[i*3+2]) - 1) < 1e-6, "unit normal");
});

test("the silhouette survives: same bounding box within 3 %, and the result is deterministic", () => {
  const full = dense(), d = CarGeometry.decimate(full, TARGET), d2 = CarGeometry.decimate(dense(), TARGET);
  const a = box(full), b = box(d);
  for (let k = 0; k < 3; k++) {
    const ext = a[3 + k] - a[k];
    assert.ok(Math.abs(b[k] - a[k]) <= ext * 0.03 && Math.abs(b[3 + k] - a[3 + k]) <= ext * 0.03, "axis " + k + ": " + [a[k], a[3 + k], b[k], b[3 + k]].map((v) => v.toFixed(3)));
  }
  assert.deepEqual(Array.from(d2.idx), Array.from(d.idx));
  assert.deepEqual(Array.from(d2.pos), Array.from(d.pos));
});

test("the shipped shared rival is one paint surface inside the LOD budget", () => {
  const full = dense(), lod = body();
  const tris = lod.idx.length / 3, verts = lod.pos.length / 3;
  assert.ok(tris <= CarGeometry.SHARED_BODY_TRIS && tris >= CarGeometry.SHARED_BODY_TRIS * 0.85,
    `shared rival ${tris} tris, budget ${CarGeometry.SHARED_BODY_TRIS}`);
  assert.ok(verts * 2 < full.pos.length / 3, `verts ${verts} should be under half of ${full.pos.length / 3}`);
  assert.equal(new Set(lod.mat).size, 1);
  assert.equal(lod.mat[0], CarGeometry.SHARED_PAINT);
  assert.equal(lod._releaseCpuMirror, true, "the silhouette flag survives the new mesh");
  const a = box(full), b = box(lod);
  for (let k = 0; k < 3; k++) {
    const ext = a[3 + k] - a[k];
    assert.ok(Math.abs(b[k] - a[k]) <= ext * 0.03 && Math.abs(b[3 + k] - a[3 + k]) <= ext * 0.03, "axis " + k);
  }
  const far = CarGeometry.decimate(lod, TARGET);
  assert.ok(far.idx.length / 3 <= TARGET && far.idx.length / 3 >= TARGET * 0.5, "the 250 m step still fits");
  const team = Teams.LIST[0];
  const near = Car3D.build(team.color, team.color2, { field: true, noWheels: true, noDriver: true, smooth: false,
    livery: {}, parts: Parts.getVisualTiers(Parts.getFactorySetup(team), team) });
  assert.ok(new Set(near.mat).size > 1, "a near rival keeps its surfaces");
  assert.ok(near.idx.length / 3 > CarGeometry.SHARED_BODY_TRIS, "a near rival is not the shared LOD");
});

test("a body already under the target comes back untouched", () => {
  const small = farBody(M);   // sanity: the census helper still sees the shared body
  assert.ok(small.tris > 0);
  const tiny = { pos: [0, 0, 0, 1, 0, 0, 0, 1, 0], nrm: [0, 0, 1, 0, 0, 1, 0, 0, 1], col: [1, 1, 1, 1, 1, 1, 1, 1, 1], idx: [0, 1, 2] };
  assert.equal(CarGeometry.decimate(tiny, 10), tiny);
});
