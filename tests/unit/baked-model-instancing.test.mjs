// baked-model-instancing.test.mjs — a pack model placed N times is one batch.
//
// build-props' bakedModel() used to copy a model's triangles into the props
// soup once per placement. When the backend can draw instanced batches
// (G.createInstancedBatch — the graph's primitive models already go that way)
// it now RECORDS each placement and, once every call is in, keeps a key as one
// compacted geometry + N transforms (TrackGraph.meshModel / meshPlace, drawn
// through the same batches() record the backends upload) — or copies it as
// before when batching would not save vertices. Without the batch API (every
// VM sweep, verify-track) nothing changes, so this file injects the API into
// tools/lib/track-build-vm.cjs and pins:
//   * the soup loses exactly the instanced keys' triangles, nothing else;
//   * expanding a batch's matrix over its compacted geometry reproduces what
//     TrackGeom.addMesh would have copied, triangle for triangle (position,
//     normal, colour x tint, material);
//   * the record and the batch order are deterministic across rebuilds;
//   * the pack's own arrays are untouched (Assets hands out one object per id);
//   * `apex26.modelInst=0` restores the copies.
//
// Run: node --test tests/unit/baked-model-instancing.test.mjs   (~15 s: four Monza builds)

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { buildContext } = require(path.join(ROOT, "tools", "lib", "track-build-vm.cjs"));

// Monza: two repeated kit placements (construction barriers along the
// Rettifilo, cones) beside six one-off buildings — both branches in one build.
const ID = "monza";
const ctx = buildContext();
const stub = (geo, matrices, colors) => ({ geo, matrices, colors, instances: matrices.length / 16 });
const build = (opts) => {
  const o = opts || {};
  ctx.sandbox.GLX.createInstancedBatch = o.api === false ? undefined : stub;
  ctx.sandbox.localStorage = o.flag === false ? { getItem: (k) => (k === "apex26.modelInst" ? "0" : null) } : undefined;
  const T = ctx.Tracks;
  const t = T.build(T.LIST.find((d) => d.id === ID));
  ctx.trim(0);
  return t;
};
const meshBatches = (t) => t.graph.batches({ instancedOnly: true }).batches.filter((b) => b.model.startsWith("mesh:"));
const sum = (a) => a.reduce((x, y) => x + y, 0);

test("the batch API on: repeated placements leave the soup, one-offs stay copies", () => {
  const on = build(), off = build({ flag: false });
  const rec = on.modelInstances;
  assert.ok(rec && Object.keys(rec).length >= 2, "no placements recorded");
  const inst = Object.values(rec).filter((r) => r.inst), copies = Object.values(rec).filter((r) => !r.inst);
  assert.ok(inst.length >= 1, "nothing was instanced");
  assert.ok(copies.length >= 1, "nothing was copied");
  for (const r of inst) assert.ok(r.n >= 2 && (r.n - 1) * r.verts >= 1024, `${r.id} instanced below the saving threshold`);
  for (const r of copies) assert.ok(r.n < 2 || (r.n - 1) * r.verts < 1024, `${r.id} copied above the saving threshold`);
  // The flag off restores the copies — and the record still says so.
  assert.ok(Object.values(off.modelInstances).every((r) => !r.inst), "apex26.modelInst=0 still instanced");
  assert.deepEqual([...Object.keys(off.modelInstances)], [...Object.keys(rec)], "the flag changed WHICH models were placed");
  // The soup lost exactly the instanced keys' triangles.
  const saved = sum(inst.map((r) => r.n * r.tris));
  assert.equal(off.propsGeo._hidden.trisBefore - on.propsGeo._hidden.trisBefore, saved,
    "props triangles did not move by the instanced keys' n x tris");
  // One batch per instanced key, in the uploaded set, with a colour per instance.
  const bs = meshBatches(on);
  // (host-realm copies: the VM's arrays fail deepStrictEqual on their prototype alone)
  assert.deepEqual([...bs.map((b) => b.model)].sort(), [...inst.map((r) => "mesh:" + Object.keys(rec).find((k) => rec[k] === r))].sort());
  for (const b of bs) {
    const r = rec[b.model.slice(5)];
    assert.equal(b.count, r.n); assert.equal(b.matrices.length, r.n * 16); assert.equal(b.colors.length, r.n * 3);
    assert.equal(b.geo.pos.length / 3, r.verts); assert.equal(b.geo.idx.length / 3, r.tris);
  }
  assert.ok(on.meshes.propBatches.some((p) => p.geo && p.geo.idx && bs.some((b) => b.geo === p.geo)), "the mesh batches were not uploaded");
  ctx.release(on); ctx.release(off);
});

test("a batch expands to what addMesh would have copied, triangle for triangle", () => {
  const on = build();
  const TG = ctx.TrackGeom, Assets = ctx.sandbox.Assets;
  for (const b of meshBatches(on)) {
    const r = on.modelInstances[b.model.slice(5)];
    const mesh = Assets.modelSync(r.id);
    for (let i = 0; i < r.n; i++) {
      const M = b.matrices.subarray(i * 16, i * 16 + 16);
      const ref = { pos: [], nrm: [], col: [], idx: [], mat: [] };
      const t = r.tint ? [r.tint[i * 3], r.tint[i * 3 + 1], r.tint[i * 3 + 2]] : null;
      TG.addMesh(ref, mesh, { x: r.xf[i * 5], y: r.xf[i * 5 + 1], z: r.xf[i * 5 + 2], rotY: r.xf[i * 5 + 3], scale: r.xf[i * 5 + 4], tint: t, mat: r.mat });
      assert.equal(ref.idx.length, b.geo.idx.length);
      const g = b.geo, c = b.colors.subarray(i * 3, i * 3 + 3);
      for (let k = 0; k < ref.idx.length; k++) {
        const a = ref.idx[k] * 3, d = g.idx[k] * 3;
        const px = g.pos[d], py = g.pos[d + 1], pz = g.pos[d + 2];
        const wx = M[0] * px + M[4] * py + M[8] * pz + M[12];
        const wy = M[1] * px + M[5] * py + M[9] * pz + M[13];
        const wz = M[2] * px + M[6] * py + M[10] * pz + M[14];
        assert.ok(Math.abs(wx - ref.pos[a]) < 1e-3 && Math.abs(wy - ref.pos[a + 1]) < 1e-3 && Math.abs(wz - ref.pos[a + 2]) < 1e-3,
          `${r.id}[${i}] corner ${k}: (${wx},${wy},${wz}) vs (${ref.pos[a]},${ref.pos[a + 1]},${ref.pos[a + 2]})`);
        // normals: mat3(M) / scale, as the lit shaders apply it
        const s = r.xf[i * 5 + 4], nx = g.nrm[d], ny = g.nrm[d + 1], nz = g.nrm[d + 2];
        const rx = (M[0] * nx + M[4] * ny + M[8] * nz) / s, ry = (M[1] * nx + M[5] * ny + M[9] * nz) / s, rz = (M[2] * nx + M[6] * ny + M[10] * nz) / s;
        assert.ok(Math.abs(rx - ref.nrm[a]) < 1e-4 && Math.abs(ry - ref.nrm[a + 1]) < 1e-4 && Math.abs(rz - ref.nrm[a + 2]) < 1e-4, `${r.id}[${i}] normal ${k}`);
        for (let q = 0; q < 3; q++) assert.ok(Math.abs(g.col[d + q] * c[q] - ref.col[a + q]) < 1e-6, `${r.id}[${i}] colour ${k}`);
        assert.equal(g.mat[g.idx[k]], ref.mat[ref.idx[k]], `${r.id}[${i}] material ${k}`);
      }
    }
  }
  ctx.release(on);
});

test("the record and the batch order are deterministic; the pack's arrays are untouched", () => {
  const Assets = ctx.sandbox.Assets;
  const ids = Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, "assets", "pack", "manifest.json"), "utf8")).models);
  const before = {};
  for (const id of ids) { const m = Assets.modelSync(id); if (m) before[id] = [sum(m.pos), sum(m.col), sum(m.idx), m.pos.length]; }
  const a = build(), b = build();
  const strip = (t) => Object.fromEntries(Object.entries(t.modelInstances).map(([k, r]) =>
    [k, { ...r, xf: Array.from(r.xf), tint: r.tint && Array.from(r.tint) }]));
  assert.deepEqual(strip(a), strip(b));
  assert.deepEqual(meshBatches(a).map((x) => [x.model, x.count, Array.from(x.matrices)]), meshBatches(b).map((x) => [x.model, x.count, Array.from(x.matrices)]));
  for (const id of Object.keys(before)) { const m = Assets.modelSync(id); assert.deepEqual([sum(m.pos), sum(m.col), sum(m.idx), m.pos.length], before[id], id); }
  // No batch API (the VM default): every placement copies, as every sweep measures.
  const c = build({ api: false });
  assert.ok(Object.values(c.modelInstances).every((r) => !r.inst));
  assert.equal(c.graph.batches().batches.filter((x) => x.model.startsWith("mesh:")).length, 0);
  ctx.release(a); ctx.release(b); ctx.release(c);
});
