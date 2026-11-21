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
// Read the shipped threshold from the build code instead of copying 1024 (review M1-19).
const MIN_SAVED = (() => {
  const m = /const MODEL_INST_MIN_SAVED = (\d+);/.exec(fs.readFileSync(path.join(ROOT, "js/track/scenery/build-props.js"), "utf8"));
  assert.ok(m, "MODEL_INST_MIN_SAVED not found in build-props.js: update this test's reader");
  return +m[1];
})();
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

test("requested model height uses real mesh bounds and keeps sway materials", () => {
  const env = buildContext(), def = env.Tracks.LIST.find((d) => d.id === ID);
  const mesh = env.sandbox.Assets.modelSync("pine_lod0");
  const ys = Array.from(mesh.pos).filter((_, i) => i % 3 === 1);
  const height = Math.max(...ys) - Math.min(...ys), requested = 12;
  const materials = Array.from(mesh.mat);
  def.scenery = (api) => api.bakedModel("pine_lod0", 0, -1, 100, { height: requested, scale: 99 });
  const track = env.Tracks.build(def);
  const pine = track.modelInstances.pine_lod0;
  assert.ok(pine, "the real bakedModel path must place the requested tree");
  assert.equal(pine.n, 1);
  assert.equal(pine.xf[4], Math.fround(requested / height), "stored Float32 scale uses actual bounds and overrides scale");
  assert.deepEqual(Array.from(mesh.mat), materials, "source materials and v3 sway weights are untouched");
  assert.deepEqual(new Set(materials.map(m => Math.floor(m))), new Set([5, 6]), "whole-tree softness is valid only for WOOD/FOLIAGE vertices");
  assert.ok(materials.some(m => m > 6 && m < 6.5));
  env.trim(0); env.release(track);
});

test("the batch API on: repeated placements leave the soup, one-offs stay copies", () => {
  const on = build(), off = build({ flag: false });
  const rec = on.modelInstances;
  assert.ok(rec && Object.keys(rec).length >= 2, "no placements recorded");
  const inst = Object.values(rec).filter((r) => r.inst), copies = Object.values(rec).filter((r) => !r.inst);
  assert.ok(inst.length >= 1, "nothing was instanced");
  assert.ok(copies.length >= 1, "nothing was copied");
  for (const r of inst) assert.ok(r.n >= 2 && (r.n - 1) * r.verts >= MIN_SAVED, `${r.id} instanced below the saving threshold`);
  for (const r of copies) assert.ok(r.n < 2 || (r.n - 1) * r.verts < MIN_SAVED, `${r.id} copied above the saving threshold`);
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

// THE MODEL SET IS READ FROM TEXT. The per-circuit loader (Assets.modelIds / modelsReady) fetches only the pack ids it
// finds QUOTED in the text it is handed, so an id an ENGINE helper stamps was never fetched: Spa asks for baked pines
// (furniture.bakedPines) through nature.js, its closure names no pine, and Spa shipped procedural pines.
// TrackDef.scenerySource is the one place the page and the build worker get that text, engine-implied ids included.
// The guard is behavioural: every id a build actually asks Assets for must be quoted in that circuit's text.
const quotedIn = (src, id) => src.includes('"' + id + '"') || src.includes("'" + id + "'") || src.includes("`" + id + "`");
function buildRecording(id, furniture) {
  const env = buildContext(), vm = require("node:vm");
  const TrackDef = vm.runInContext("TrackDef", env.sandbox);
  const registry = vm.runInContext("typeof TrackScenery !== 'undefined' ? TrackScenery : {}", env.sandbox);
  const base = env.Tracks.LIST.find((d) => d.id === id), asked = new Set(), real = env.sandbox.Assets.modelSync;
  // furniture: a flag turned on for this build only (Spa's bakedPines is off until pine_lod0 has a crown, #6035).
  const def = furniture ? { ...base, furniture: { ...base.furniture, ...furniture } } : base;
  env.sandbox.Assets.modelSync = (m) => { const got = real(m); if (got) asked.add(m); return got; };
  const track = env.Tracks.build(def);
  return { def, track, asked: [...asked], src: TrackDef.scenerySource(def, registry), closure: String(def.scenery || registry[id]), TrackDef };
}
test("Spa's model text names the baked pine its def asks for, and the build stamps it", () => {
  const spa = buildRecording("spa", { bakedPines: true });
  assert.equal(!!(spa.def.furniture && spa.def.furniture.bakedPines), true, "Spa with bakedPines is the build this test stands on");
  assert.equal(quotedIn(spa.closure, "pine_lod0"), false, "the closure itself still names no pine: the engine helper does");
  assert.equal(quotedIn(spa.src, "pine_lod0"), true, "the text the loader scans quotes the pine");
  assert.equal(spa.src.startsWith(spa.closure), true, "and still carries the whole closure, so every id it names");
  assert.ok(spa.track.modelInstances.pine_lod0 && spa.track.modelInstances.pine_lod0.n > 1000, "the Spa build stamps it");
  assert.equal(Object.values(spa.TrackDef.ENGINE_MODELS).includes("pine_lod0"), true);
});
for (const id of ["spa", ID]) test(`every pack model the ${id} build asks for is quoted in the text its loader scans`, () => {
  const r = buildRecording(id, id === "spa" ? { bakedPines: true } : null);
  assert.ok(r.asked.length > 0, "the build placed pack models");
  assert.deepEqual(r.asked.filter((m) => !quotedIn(r.src, m)), [],
    "a model id spelled only in an engine helper is never fetched on a player's page: add its def flag to TrackDef.ENGINE_MODELS");
  if (id === ID) assert.equal(quotedIn(r.src, "pine_lod0"), false, "a circuit without the flag does not fetch the pine");
});

// A BAKED TREE MUST HAVE A CROWN (#6035 / #6037). #5782 made the page fetch pine_lod0 at Spa, and the old pack pine
// was a 0.64 m square trunk (8.2 m^2 of WOOD) with six leaf slivers (1.8 m^2 of FOLIAGE): every Spa pine became a
// brown post. #6037 rebaked pine/tree with a real crown (foliage ≥ wood, crown width ≥ ~30 % of height). Any tree
// model an ENGINE_MODELS flag stamps must still carry at least as much foliage surface as bark before a shipped
// circuit may set that flag; geometry, not pixels, so it holds on every backend.
const { parseModel } = require(path.join(ROOT, "tools", "lib", "pack-assets.cjs"));
function surfaceByMat(id) {
  const b = fs.readFileSync(path.join(ROOT, "assets", "pack", "models", id + ".bin"));
  const { pos: P, mat: M, idx: I } = parseModel(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
  const area = { wood: 0, foliage: 0 };
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b1 = I[t + 1] * 3, c = I[t + 2] * 3;
    const u = [P[b1] - P[a], P[b1 + 1] - P[a + 1], P[b1 + 2] - P[a + 2]];
    const v = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    const A = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
    const m = Math.floor(M[I[t]]);   // AX26 v3 packs sway into the fraction; the base id is WOOD 5 / FOLIAGE 6
    if (m === 5) area.wood += A; else if (m === 6) area.foliage += A;
  }
  return area;
}
function crownExtents(id) {
  const b = fs.readFileSync(path.join(ROOT, "assets", "pack", "models", id + ".bin"));
  const { pos: P } = parseModel(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
  let yMin = 1e9, yMax = -1e9, xMin = 1e9, xMax = -1e9, zMin = 1e9, zMax = -1e9;
  for (let i = 0; i < P.length; i += 3) {
    xMin = Math.min(xMin, P[i]); xMax = Math.max(xMax, P[i]);
    yMin = Math.min(yMin, P[i + 1]); yMax = Math.max(yMax, P[i + 1]);
    zMin = Math.min(zMin, P[i + 2]); zMax = Math.max(zMax, P[i + 2]);
  }
  const height = yMax - yMin, width = Math.max(xMax - xMin, zMax - zMin);
  return { height, width, ratio: width / height };
}
const hasCrown = (id) => { const a = surfaceByMat(id); return a.foliage >= a.wood; };
test("pine_lod0 has a real crown (#6037): foliage ≥ wood and width ≥ 30% height", () => {
  const a = surfaceByMat("pine_lod0");
  const e = crownExtents("pine_lod0");
  assert.ok(a.foliage >= a.wood, `pine_lod0 needs a canopy: ${JSON.stringify(a)}`);
  assert.equal(hasCrown("pine_lod0"), true);
  assert.ok(e.ratio >= 0.3, `crown too skinny: ${JSON.stringify(e)}`);
});
test("baked pine/tree LODs keep a crown under the triangle caps (#6037)", () => {
  for (const id of ["pine_lod0", "pine_lod1", "tree_lod0", "tree_lod1"]) {
    const a = surfaceByMat(id);
    const e = crownExtents(id);
    assert.ok(a.foliage >= a.wood, `${id} foliage < wood: ${JSON.stringify(a)}`);
    assert.ok(e.ratio >= 0.3, `${id} crown width < 30% height: ${JSON.stringify(e)}`);
  }
});
test("no circuit sets an ENGINE_MODELS flag whose baked tree has no crown", () => {
  const env = buildContext(), vm = require("node:vm");
  const TrackDef = vm.runInContext("TrackDef", env.sandbox);
  const bad = [];
  for (const def of env.Tracks.LIST) {
    const f = def.furniture || {};
    for (const flag in TrackDef.ENGINE_MODELS) {
      const id = TrackDef.ENGINE_MODELS[flag];
      if (f[flag] && !hasCrown(id)) bad.push(`${def.id}: furniture.${flag} stamps ${id} (${JSON.stringify(surfaceByMat(id))})`);
    }
  }
  assert.deepEqual(bad, [], "a baked tree with more bark than foliage renders as a post: rebake it with a crown first");
});
