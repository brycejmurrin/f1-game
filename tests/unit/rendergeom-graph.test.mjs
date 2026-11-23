import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const sandbox = vm.createContext({
  Log: { info() {} }, TrackSceneryData: {},
  M4: { clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)) },
});
for (const p of ["js/track/core/geom.js", "js/track/scenery/graph.js", "js/track/scenery/stands.js", "js/track/scenery/structures.js"]) {
  vm.runInContext(fs.readFileSync(new URL("../../" + p, import.meta.url), "utf8"), sandbox, { filename: absSrc(p) });
}
const { raw, graph, structures } = vm.runInContext("({raw: TrackGeom, graph: TrackGraph, structures: SceneryStructures})", sandbox);
const buf = () => ({ pos: [], nrm: [], col: [], idx: [], mat: [], _mat: 0 });
const emit = Object.fromEntries(["addBox", "addPrism", "addPyramid", "addCyl", "addCone", "addFrustum"].map((k) => [k,
  (out, ...args) => { if (!out._dryRun && !out._absorbOnly) raw[k](out, ...args); return true; }]));
emit.roundNormals = raw.roundNormals;
const plain = (v) => JSON.parse(JSON.stringify(v));
const transform = (m, b, p, normal = false) => {
  const out = normal ? [0, 0, 0] : [m[b + 12], m[b + 13], m[b + 14]];
  for (let a = 0; a < 3; a++) {
    const c = b + a * 4;
    // Instance bases here are orthogonal, so inverse-transpose normal columns
    // are each position column divided by its squared length.
    const d = normal ? m[c] ** 2 + m[c + 1] ** 2 + m[c + 2] ** 2 : 1;
    for (let j = 0; j < 3; j++) out[j] += m[c + j] * p[a] / d;
  }
  if (normal) { const d = Math.hypot(...out); return out.map((v) => v / d); }
  return out;
};
const det = (m, b) => m[b] * (m[b + 5] * m[b + 10] - m[b + 6] * m[b + 9]) -
  m[b + 4] * (m[b + 1] * m[b + 10] - m[b + 2] * m[b + 9]) +
  m[b + 8] * (m[b + 1] * m[b + 6] - m[b + 2] * m[b + 5]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const subtract = (a, b) => a.map((v, i) => v - b[i]);
const record = (p, n, c, mat) => [...p, ...n, ...c, mat];
function sameRecords(actual, expected, label = "geometry") {
  assert.equal(actual.length, expected.length);
  const remaining = expected.slice();
  for (const row of actual) {
    // Matrices are uploaded as Float32; compare numeric records instead of
    // rounding to decimal strings, which splits equal points at rounding edges.
    const i = remaining.findIndex((other) => row.every((v, a) => Math.abs(v - other[a]) < 2e-5));
    assert.ok(i >= 0, `${label}: unmatched vertex ${row.join(",")}`);
    remaining.splice(i, 1);
  }
}
function records(geo, matrix, b = 0, tint = [1, 1, 1]) {
  const out = [];
  for (let i = 0; i < geo.pos.length; i += 3) {
    const p = geo.pos.slice(i, i + 3), n = geo.nrm.slice(i, i + 3);
    out.push(record(matrix ? transform(matrix, b, p) : p,
      matrix ? transform(matrix, b, n, true) : n,
      geo.col.slice(i, i + 3).map((v, a) => v * tint[a]), geo.mat[i / 3]));
  }
  return out;
}
function outward(batch, i) {
  const { geo, matrices: m } = batch, b = i * 16;
  assert.ok(det(m, b) > 0, "GPU matrices must preserve front-face winding");
  for (let t = 0; t < geo.idx.length; t += 3) {
    const ids = Array.from(geo.idx.slice(t, t + 3));
    const p = ids.map((v) => transform(m, b, geo.pos.slice(v * 3, v * 3 + 3)));
    const face = cross(subtract(p[1], p[0]), subtract(p[2], p[0]));
    const n = transform(m, b, geo.nrm.slice(ids[0] * 3, ids[0] * 3 + 3), true);
    assert.ok(face.reduce((d, v, a) => d + v * n[a], 0) > 0, `triangle ${t / 3} opposes its outward normal`);
  }
}
const basis = (lh) => ({ r: [0.6, 0, 0.8], u: [0, 1, 0], t: lh ? [0.8, 0, -0.6] : [-0.8, 0, 0.6] });

for (const style of ["container", "hut"]) for (const lh of [false, true]) {
  test(`shipped ${style} marshal recipe keeps authored features and normals on ${lh ? "LH" : "RH"} frame`, () => {
    const g = graph.create({ raw }), out = buf();
    const p = { c: [20, 0, 0], ...basis(lh) };
    const api = structures.create({
      out, track: {}, def: { id: "fixture" }, n: 1, ds: 5, hw: [6], px: [0], py: [0], pz: [0],
      NIGHT: false, MAT: raw.MAT, RAW: raw, ...raw, anchor: () => p, onTrack: () => false,
      blockAt() {}, note() {}, kitOf: () => style,
      instance(key, place, build, meta) {
        out._preferInstance = true;
        const n = g.instance(key, place, build, meta, emit, out);
        out._preferInstance = false; return n;
      },
    });
    api.marshalPost(0, 1, 8);
    const { batches, bakeOnly } = g.batches({ instancedOnly: true });
    assert.equal(bakeOnly.length, 0); assert.equal(batches.length, 1);
    assert.ok(g.nodes[0].inst);
    const expected = buf(); g.bake(emit, expected);
    const b = batches[0];
    sameRecords(records(b.geo, b.matrices), records(expected));
    outward(b, 0);
    // The signal panel emitted outside the graph remains a separate primitive.
    assert.equal(out.pos.length / 3, 8);
    const before = plain(g.models.values().next().value.geo);
    assert.equal(g.batches().batches[0].geo, b.geo, "variant must be cached rather than rebuilt each call");
    assert.deepEqual(plain(g.models.values().next().value.geo), before, "reflection must not mutate canonical data");
  });
}

test("mixed handedness and negative-scale recipe variants match guarded replay deterministically", () => {
  const g = graph.create({ raw }), out = buf(); out._preferInstance = true;
  const places = [];
  // Include directional primitives: a negative Y scale must retain replay's
  // upright pyramid/cone dimensions while reflecting their local centre.
  const build = (r) => {
    r.mat(3); r.box([0.4, 1, 1.4], [1, 2, 0.3], graph.NODE_COLOR);
    r.mat(4); r.prism([2, 0.5, -0.7], [1, 1.5, 2], graph.NODE_COLOR);
    r.mat(5); r.pyramid([-2, 0.7, 0.2], [1, 2, 1.5], graph.NODE_COLOR);
    r.mat(6); r.cone([1, 2, 3], 0.5, 1.3, graph.NODE_COLOR, 6);
  };
  for (let mask = 15; mask >= 0; mask--) {
    const p = {
      o: [mask * 30, 2, -4], ...basis(!!(mask & 8)),
      s: [mask & 1 ? -2 : 2, mask & 2 ? -3 : 3, mask & 4 ? -2 : 2],
      col: [0.25 + mask / 32, 0.5, 0.75],
    };
    places[mask] = p;
    g.instance("asym", p, build, { kind: "fixture" }, emit, out);
  }
  assert.equal(out.pos.length, 0, "accepted instances must withhold all recipe triangles");
  const { batches, bakeOnly } = g.batches({ instancedOnly: true });
  assert.equal(bakeOnly.length, 0); assert.equal(batches.length, 16);
  assert.deepEqual(Array.from(batches, (b) => b.variant), Array.from({ length: 16 }, (_, i) => i));
  for (const b of batches) {
    const expected = buf(), place = places[b.variant];
    g.replay(g.models.get("asym"), place, emit, expected);
    sameRecords(records(b.geo, b.matrices, 0, Array.from(b.colors)), records(expected), `variant ${b.variant}`);
    outward(b, 0);
  }
  const again = g.batches({ instancedOnly: true }).batches;
  assert.deepEqual(plain(again), plain(batches));
  batches.forEach((b, i) => assert.equal(again[i].geo, b.geo));
});

test("variant partition preserves within-variant placement order and original model keys", () => {
  const g = graph.create({ raw }), out = buf(); out._preferInstance = true;
  const build = (r) => r.box([0, 1, 1], [1, 2, 1], graph.NODE_COLOR);
  const places = [[true, 8], [false, 1], [true, 9], [false, 2]];
  for (const [lh, x] of places) g.instance("a|8", { o: [x, 0, 0], ...basis(lh), col: [x / 10, 0.5, 1] }, build, null, emit, out);
  const { batches } = g.batches({ instancedOnly: true });
  assert.deepEqual(Array.from(batches, (b) => [b.model, b.variant, b.count]), [["a|8", 0, 2], ["a|8", 8, 2]]);
  assert.deepEqual(Array.from(batches[0].matrices).filter((_, i) => i % 16 === 12), [1, 2]);
  assert.deepEqual(Array.from(batches[1].matrices).filter((_, i) => i % 16 === 12), [8, 9]);
});

test("LH geometry variants retain sway/material attributes and rounded normals", () => {
  const g = graph.create({ raw }), out = buf(); out._preferInstance = true;
  const p = { o: [10, 2, 4], r: [1, 0, 0], u: [0, 1, 0], t: [0, 0, -1] };
  g.instance("crown", p, (r) => {
    r.mat(raw.MAT.FOLIAGE, [0, 4]); r.cone([0, 0, 0.7], 1.2, 4, [0.2, 0.5, 0.3], 7);
  }, null, emit, out);
  const b = g.batches({ instancedOnly: true }).batches[0], expected = buf();
  g.bake(emit, expected);
  sameRecords(records(b.geo, b.matrices), records(expected));
  const canonical = g.models.get("crown").geo;
  assert.deepEqual(plain(b.geo.mat), plain(canonical.mat));
  assert.deepEqual(plain(b.geo.col), plain(canonical.col));
  assert.ok(b.geo.mat.some((v) => v % 1 > 0), "fixture must contain sway weights");
});
