// M-3b (#1647): drop road/terrain nrm/col/mat once both ribbon GPU copies exist.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { buildContext } = require(path.join(ROOT, "tools/track/verify-track.cjs"));

const gfx = {
  mobileTier: false,
  chunkedTrackCoords: true,
  createMesh(g) { return { __tlx: true, geo: g, count: g.idx?.length || 0 }; },
  createChunkedMesh(g) {
    return { __tlx: true, chunked: true, chunks: [{ geo: {} }], count: g.idx?.length || 0 };
  },
  createInstancedBatch(g, m) { return { instances: (m.length / 16) | 0, geo: g }; },
  freeInstancedBatch() {},
};

test("player build with chunkRibbons drops ribbon CPU channels after upload", () => {
  const T = buildContext(null, { quiet: true });
  const tr = T.build(T.LIST.find((d) => d.id === "monza"), { gfx, retainGraph: false, chunkRibbons: true });
  assert.ok(tr.meshes.roadChunked && tr.meshes.terrainChunked);
  assert.equal(tr.roadGeo.nrm, null);
  assert.equal(tr.roadGeo.col, null);
  assert.ok(Array.isArray(tr.roadGeo.pos) && Array.isArray(tr.roadGeo.idx));
  assert.equal(tr.terrainGeo.mat, null);
});

test("unchunked build keeps channels for a later quality-recovery chunk", () => {
  const T = buildContext(null, { quiet: true });
  const tr = T.build(T.LIST.find((d) => d.id === "monza"), { gfx, retainGraph: false, chunkRibbons: false });
  assert.ok(Array.isArray(tr.roadGeo.nrm));
  assert.ok(Array.isArray(tr.terrainGeo.col));
});

test("debris trimesh still builds from pos+idx after drop", () => {
  const T = buildContext(null, { quiet: true });
  const tr = T.build(T.LIST.find((d) => d.id === "monaco"), { gfx, retainGraph: false, chunkRibbons: true });
  assert.ok(tr.roadGeo.pos.length > 0 && tr.roadGeo.idx.length > 0);
  const pos = new Float32Array(tr.roadGeo.pos);
  const idx = new Uint32Array(tr.roadGeo.idx);
  assert.equal(pos.length % 3, 0);
  assert.ok(idx.length >= 3);
});
