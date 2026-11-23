/* mesh-detail.test.mjs — MeshDetail (js/render/shared/mesh-detail.js), the shared refinement kit the car,
 * scenery and garage builders call above ULTRA: Loop / Butterfly subdivision with creases, bevel, crease-angle
 * normals, QEM simplify, weld / unweld, stats. Geometry facts only (no GPU here: nothing below says how a
 * refined mesh LOOKS).
 *
 * Run: node --test tests/unit/mesh-detail.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MD = new Function(readFileSync(join(ROOT, "js/render/shared/mesh-detail.js"), "utf8") + "; return MeshDetail;")();

// Unit cube [-0.5, 0.5]³, outward CCW quads. shared: 8 welded corners; else 24 (per-face uv + material id).
const QUADS = [
  [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]],     // +z
  [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]], // -z
  [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]],     // +x
  [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]], // -x
  [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]],     // +y
  [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]], // -y
];
function cube(shared) {
  const pos = [], idx = [], uv = [], mat = [];
  const key = new Map();
  QUADS.forEach((q, f) => {
    const ids = q.map((p, k) => {
      const k3 = p.join(",");
      if (shared && key.has(k3)) return key.get(k3);
      const id = pos.length / 3;
      pos.push(p[0] * 0.5, p[1] * 0.5, p[2] * 0.5);
      uv.push(k === 1 || k === 2 ? 1 : 0, k >= 2 ? 1 : 0);
      mat.push(f < 3 ? 20 : 21);
      if (shared) key.set(k3, id);
      return id;
    });
    idx.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]);
  });
  return shared ? MD.mesh(pos, idx) : MD.mesh(pos, idx, { uv: { data: uv, size: 2 }, mat: { data: Float32Array.from(mat), size: 1, id: true } });
}

function octahedron() {
  const pos = [1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1];
  const idx = [0, 2, 4, 2, 1, 4, 1, 3, 4, 3, 0, 4, 2, 0, 5, 1, 2, 5, 3, 1, 5, 0, 3, 5];
  return MD.mesh(pos, idx);
}

function grid(n) {   // n×n quads on the unit square, z = 0, with a uv
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) { pos.push(i / n, j / n, 0); uv.push(i / n, j / n); }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i, b = a + 1, c = a + n + 2, d = a + n + 1;
    idx.push(a, b, c, a, c, d);
  }
  return MD.mesh(pos, idx, { uv: { data: uv, size: 2 } });
}

function radii(m) {
  const r = [];
  for (let i = 0; i < m.positions.length; i += 3) r.push(Math.hypot(m.positions[i], m.positions[i + 1], m.positions[i + 2]));
  return r;
}

test("subdividing a cube with all its edges creased keeps it exactly a cube", () => {
  const c = cube(true);
  const cr = MD.creaseEdges(c, 30);
  assert.equal(cr.count, 12, "the 12 cube edges are creases, the 6 face diagonals are not");
  const s = MD.subdivide(c, { levels: 3, creases: cr });
  const st = MD.stats(s);
  assert.equal(st.tris, 12 * 64);
  assert.ok(st.watertight, "still closed");
  assert.equal(st.openIndexEdges, 0);
  assert.equal(st.degenerate, 0);
  assert.deepEqual(st.bbox.min.map((v) => +v.toFixed(6)), [-0.5, -0.5, -0.5]);
  assert.deepEqual(st.bbox.max.map((v) => +v.toFixed(6)), [0.5, 0.5, 0.5]);
  for (let i = 0; i < s.positions.length; i += 3) {
    const onFace = [0, 1, 2].some((k) => Math.abs(Math.abs(s.positions[i + k]) - 0.5) < 1e-6);
    assert.ok(onFace, "every vertex stays on a cube face");
  }
});

test("an uncreased cube shrinks toward a round limit; the measured bbox loss is what the header states", () => {
  const s = MD.subdivide(cube(true), { levels: 3 });
  const st = MD.stats(s);
  const ext = st.bbox.max[0] - st.bbox.min[0];
  // header: "unit cube, 3 levels: bbox extent 0.87 (-13 %)"
  assert.ok(Math.abs(ext - 0.87) < 0.01, "bbox extent " + ext.toFixed(4));
  const k = MD.subdivide(cube(true), { levels: 3, keepBounds: true });
  assert.ok(Math.abs(MD.stats(k).bbox.max[1] - 0.5) < 1e-6 && Math.abs(MD.stats(k).bbox.min[2] + 0.5) < 1e-6, "keepBounds restores the box");
});

test("Loop converges to the known limit point: octahedron vertex at r = 1 - 4χ (Loop β, valence 4)", () => {
  const n = 4, c = 0.375 + 0.25 * Math.cos(2 * Math.PI / n), beta = (0.625 - c * c) / n, chi = 1 / (3 / (8 * beta) + n);
  const want = 1 - n * chi;   // ≈ 0.43636; the neighbours' sum is 0 along the vertex axis
  const lim = MD.subdivide(octahedron(), { levels: 2, limit: true });
  assert.ok(Math.abs(lim.positions[0] - want) < 1e-6, "limit projection " + lim.positions[0]);
  const deep = MD.subdivide(octahedron(), { levels: 5 });
  assert.ok(Math.abs(deep.positions[0] - want) < 2e-3, "5 levels approach the limit " + deep.positions[0]);
  const r = radii(lim), mean = r.reduce((a, b) => a + b, 0) / r.length;
  const spread = (Math.max(...r) - Math.min(...r)) / mean;
  assert.ok(spread < 0.12, "sphere-like: radius spread " + spread.toFixed(4));
  assert.ok(MD.stats(lim).watertight);
});

test("butterfly keeps every original vertex bit-exact and stays closed", () => {
  const o = octahedron();
  const s = MD.subdivide(o, { levels: 3, scheme: "butterfly" });
  for (let i = 0; i < o.positions.length; i++) assert.equal(s.positions[i], o.positions[i]);
  const st = MD.stats(s);
  assert.ok(st.watertight);
  assert.equal(st.degenerate, 0);
  // interpolating schemes overshoot a little; never collapse inward like Loop
  const r = radii(s);
  assert.ok(Math.min(...r) > 0.55 && Math.max(...r) <= 1 + 1e-6, "radius range " + Math.min(...r).toFixed(3) + ".." + Math.max(...r).toFixed(3));
  // creased cube under butterfly: corners pinned, crease curves stay on the edges
  const c = MD.subdivide(cube(true), { levels: 2, scheme: "butterfly", creases: MD.creaseEdges(cube(true), 30) });
  const bb = MD.stats(c).bbox;
  assert.ok(bb.max.every((v) => Math.abs(v - 0.5) < 1e-6) && bb.min.every((v) => Math.abs(v + 0.5) < 1e-6));
});

test("UV seams survive subdivision and material ids never blend", () => {
  const c = cube(false);   // 24 verts: every cube edge is a uv + material seam
  const s = MD.subdivide(c, { levels: 2 });
  const st = MD.stats(s);
  assert.ok(st.watertight, "seam vertices move together: no cracks");
  const uv = s.attrs.uv.data, mat = s.attrs.mat.data;
  for (let i = 0; i < mat.length; i++) assert.ok(mat[i] === 20 || mat[i] === 21, "id " + mat[i]);
  for (let t = 0; t < s.indices.length; t += 3) {
    const a = mat[s.indices[t]];
    assert.ok(mat[s.indices[t + 1]] === a && mat[s.indices[t + 2]] === a, "a triangle carries one material");
  }
  for (let i = 0; i < uv.length; i++) assert.ok(uv[i] >= 0 && uv[i] <= 1);
  // the same surface point carries different uv on two faces
  const seen = new Map();
  let split = 0;
  for (let v = 0; v < s.positions.length / 3; v++) {
    const k = [s.positions[v * 3], s.positions[v * 3 + 1], s.positions[v * 3 + 2]].join(",");
    const u = uv[v * 2] + "," + uv[v * 2 + 1];
    if (seen.has(k) && seen.get(k) !== u) split++;
    seen.set(k, u);
  }
  assert.ok(split > 0, "seam vertices still split");
  // creaseEdges names the material/uv seams as creases even on a flat surface
  const g = grid(2), A = g.attrs.uv.data;
  for (let v = 0; v < 9; v++) A[v * 2] = (v % 3) < 2 ? 0 : 1;   // not a real seam: still one vertex per point
  assert.equal(MD.creaseEdges(g, 30).count, 8, "a welded flat grid has only its 8 boundary edges");
});

test("normals: angle-weighted, split at crease angle, unit length", () => {
  const n = MD.normals(cube(true), { creaseAngle: 40 });
  assert.equal(n.positions.length / 3, 24, "each cube corner splits into its three wedges");
  const N = n.attrs.nrm.data;
  for (let v = 0; v < N.length; v += 3) {
    assert.ok(Math.abs(Math.hypot(N[v], N[v + 1], N[v + 2]) - 1) < 1e-6);
    const axis = [0, 1, 2].filter((k) => Math.abs(Math.abs(N[v + k]) - 1) < 1e-6);
    assert.equal(axis.length, 1, "a flat face normal");
  }
  const s = MD.normals(cube(true), { creaseAngle: 120 });
  assert.equal(s.positions.length / 3, 8, "nothing split above 90°");
  const S = s.attrs.nrm.data;
  for (let v = 0; v < S.length; v += 3) for (let k = 0; k < 3; k++) assert.ok(Math.abs(Math.abs(S[v + k]) - 1 / Math.sqrt(3)) < 1e-6, "corner normal is the diagonal");
});

test("bevel: rounded crease strips, no degenerate triangles, unit normals, still closed", () => {
  for (const segs of [1, 2, 4]) {
    const b = MD.bevel(cube(false), { width: 0.05, segments: segs });
    const st = MD.stats(b);
    assert.equal(b.bevelled, 12);
    assert.equal(st.degenerate, 0, "segments " + segs);
    assert.ok(st.watertight, "closed at segments " + segs);
    assert.equal(st.tris, 12 + 12 * 2 * segs + 8 * 3 * segs, "faces + strips + corner fans");
    const N = b.attrs.nrm.data;
    for (let v = 0; v < N.length; v += 3) assert.ok(Math.abs(Math.hypot(N[v], N[v + 1], N[v + 2]) - 1) < 1e-5);
    assert.ok(st.bbox.max.every((v) => v <= 0.5 + 1e-6) && st.bbox.min.every((v) => v >= -0.5 - 1e-6));
    const mat = b.attrs.mat.data;
    for (let i = 0; i < mat.length; i++) assert.ok(mat[i] === 20 || mat[i] === 21);
  }
  // the chamfer is `width` in from each face edge, and the strip normal turns smoothly between faces
  const b = MD.bevel(cube(true), { width: 0.05, segments: 2 });
  assert.equal(MD.stats(b).openIndexEdges, 0, "strips, rows and corner fans share vertices: closed by index, not only by position");
  assert.equal(MD.stats(MD.bevel(cube(true), { width: 0.05, segments: 5 })).openIndexEdges, 0);
  // a crease running THROUGH vertices (two crease edges in line): consecutive strips share their rows
  const dense = MD.subdivide(cube(true), { levels: 2, creases: MD.creaseEdges(cube(true), 30) });
  const bd = MD.bevel(dense, { width: 0.03, segments: 3 }), sd = MD.stats(bd);
  assert.equal(bd.bevelled, 48);
  assert.ok(sd.watertight && sd.degenerate === 0 && sd.openIndexEdges === 0, JSON.stringify(sd));
  const P = b.positions, N = b.attrs.nrm.data;
  let mid = 0;
  for (let v = 0; v < P.length / 3; v++) {
    const n = [N[v * 3], N[v * 3 + 1], N[v * 3 + 2]];
    const off = n.filter((x) => Math.abs(x) > 1e-3).length;
    if (off === 2 && Math.abs(Math.abs(n[0]) + Math.abs(n[1]) + Math.abs(n[2]) - Math.SQRT2) < 1e-5) mid++;
  }
  assert.ok(mid > 0, "strip mid-rows carry 45° normals");
  const inset = [];
  for (let v = 0; v < P.length / 3; v++) {
    const n = [N[v * 3], N[v * 3 + 1], N[v * 3 + 2]];
    if (Math.abs(n[2] - 1) < 1e-9) inset.push(Math.max(Math.abs(P[v * 3]), Math.abs(P[v * 3 + 1])));
  }
  assert.ok(inset.length && inset.every((x) => Math.abs(x - 0.45) < 1e-6), "+z face corners slid to 0.45");
});

test("simplify hits its target within 5 % and keeps the border loop", () => {
  const sphere = MD.subdivide(octahedron(), { levels: 4, limit: true });
  const st0 = MD.stats(sphere);
  for (const target of [1024, 300]) {
    const s = MD.simplify(sphere, { targetTris: target });
    const st = MD.stats(s);
    assert.ok(Math.abs(st.tris - target) <= target * 0.05, "tris " + st.tris + " for " + target);
    assert.ok(st.watertight && st.degenerate === 0, "closed, clean");
    assert.ok(s.maxError < 0.1);
    assert.ok(st0.tris > st.tris);
  }
  const g = grid(24);   // 1152 tris, border is the unit square perimeter
  for (const lockBorders of [true, false]) {
    const s = MD.simplify(g, { targetTris: 300, lockBorders });
    const st = MD.stats(s);
    assert.ok(Math.abs(st.tris - 300) <= 15, "grid tris " + st.tris);
    assert.equal(st.nonManifoldEdges, 0);
    assert.ok(st.boundaryEdges >= 4, "a border remains");
    // every border edge still on the perimeter, and the border is one closed loop (each border vertex: 2 edges)
    const onPerim = (x, y) => Math.abs(x) < 1e-6 || Math.abs(x - 1) < 1e-6 || Math.abs(y) < 1e-6 || Math.abs(y - 1) < 1e-6;
    const cnt = new Map(), P = s.positions, I = s.indices, ek = new Map();
    for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) {
      const a = I[t + k], b = I[t + (k + 1) % 3], key = Math.min(a, b) + "," + Math.max(a, b);
      ek.set(key, (ek.get(key) || 0) + 1);
    }
    for (const [key, c] of ek) {
      if (c !== 1) continue;
      for (const v of key.split(",").map(Number)) {
        assert.ok(onPerim(P[v * 3], P[v * 3 + 1]), "border vertex left the perimeter");
        cnt.set(v, (cnt.get(v) || 0) + 1);
      }
    }
    for (const c of cnt.values()) assert.equal(c, 2);
    if (lockBorders) assert.equal(cnt.size, 96, "locked: all 96 border vertices kept");
    const corners = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (const [x, y] of corners) assert.ok([...cnt.keys()].some((v) => P[v * 3] === x && P[v * 3 + 1] === y), "corner " + x + "," + y + " kept");
  }
  // uv seams and materials are never re-interpolated by a collapse
  const c = MD.subdivide(cube(false), { levels: 3 });
  const s = MD.simplify(c, { targetTris: 200 });
  const mat = s.attrs.mat.data;
  for (let t = 0; t < s.indices.length; t += 3) assert.ok(mat[s.indices[t]] === mat[s.indices[t + 1]] && mat[s.indices[t]] === mat[s.indices[t + 2]]);
  assert.ok(MD.stats(s).watertight);
});

test("weld / unweld round trip; seams stay split", () => {
  const c = cube(false);
  const u = MD.unweld(c);
  assert.equal(u.positions.length / 3, 36);
  const w = MD.weld(u, 0);
  const distinct = new Set();
  for (let v = 0; v < 24; v++) distinct.add([...c.positions.subarray(v * 3, v * 3 + 3), ...c.attrs.uv.data.subarray(v * 2, v * 2 + 2), c.attrs.mat.data[v]].join(","));
  assert.equal(w.positions.length / 3, distinct.size, "one vertex per distinct (position, uv, material)");
  assert.ok(distinct.size > 8, "seams stay split");
  const bare = MD.weld(MD.unweld(cube(true)), 0);
  assert.equal(bare.positions.length / 3, 8);
  const jitter = MD.unweld(cube(true));
  for (let i = 0; i < jitter.positions.length; i++) jitter.positions[i] += (i % 7) * 1e-5;
  assert.equal(MD.weld(jitter, 1e-3).positions.length / 3, 8, "eps weld across cells");
  assert.equal(MD.stats(w).tris, 12);
});

test("fromGeom / toGeom speak the game's builder shape", () => {
  const g = { pos: [0, 0, 0, 1, 0, 0, 0, 1, 0], nrm: [0, 0, 1, 0, 0, 1, 0, 0, 1], col: [1, 0, 0, 0, 1, 0, 0, 0, 1], idx: [0, 1, 2], mat: [20, 20, 20] };
  const m = MD.fromGeom(g);
  assert.ok(!m.attrs.nrm && m.attrs.col && m.attrs.mat.id);
  const back = MD.toGeom(m);
  assert.deepEqual(back.idx, [0, 1, 2]);
  assert.deepEqual(back.mat, [20, 20, 20]);
  assert.deepEqual(back.nrm.map((x) => Math.round(x)), [0, 0, 1, 0, 0, 1, 0, 0, 1]);
});

test("deterministic: the same input gives identical bytes", () => {
  const run = () => {
    const s = MD.subdivide(cube(false), { levels: 2, creases: MD.creaseEdges(cube(false), 30) });
    const b = MD.bevel(cube(false), { width: 0.04, segments: 3 });
    const q = MD.simplify(MD.subdivide(octahedron(), { levels: 3 }), { targetTris: 100 });
    return [s, b, q].map((m) => Buffer.concat([Buffer.from(m.positions.buffer), Buffer.from(m.indices.buffer),
      ...Object.keys(m.attrs).sort().map((k) => Buffer.from(m.attrs[k].data.buffer))]).toString("base64"));
  };
  assert.deepEqual(run(), run());
});

test("semi-sharp creases sit between smooth and sharp", () => {
  const c = cube(true);
  const all = MD.creaseEdges(c, 30);
  // vertex 0 is a cube corner (even vertices keep their index): its distance from the centre
  const corner = (m) => Math.hypot(m.positions[0], m.positions[1], m.positions[2]);
  const at = (s) => corner(MD.subdivide(c, { levels: 3, creases: MD.creases(Array.from(all.pairs), s) }));
  const smooth = corner(MD.subdivide(c, { levels: 3 }));
  const half = at(0.5), one = at(1), two = at(2), hard = at(Infinity);
  assert.ok(smooth < half && half < one && one < two && two < hard, [smooth, half, one, two, hard].join(" < "));
  assert.ok(Math.abs(hard - Math.sqrt(0.75)) < 1e-6, "an infinitely sharp corner stays put");
});
