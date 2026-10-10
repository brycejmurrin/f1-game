/* tlx-cull-shadow-pack — TLX's sun-shadow instanced cull has its OWN pack (R3-RENDER-6).
 *
 * shadow-pass.js _castPropBatchesShadow culls every prop batch with the sun box
 * ({upload:false}) and hands the count to gfx.castShadowInstanced. TLX packed
 * that cull into batch.packMatrices — the CAMERA pack — so a mirror cull that
 * then HIT the cell-set cache (same cells as the last upload: no repack)
 * left the shadow pack in packMatrices, game.js drawWorldMeshes' recorder copied
 * it into _mirMats, and the next frozen mirror frame (instEvery 2) uploaded
 * instances the mirror cannot see (scratch/hunt3-render/tlx-mirpack.cjs).
 * GLX/WGX were immune (_shadowPackFor). The real cullInstances +
 * castShadowInstanced (extracted from tlx.js), real InstCells/Frustum, and the
 * recorder extracted verbatim from game.js. No browser (~0.1 s).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const read = (rel) => fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");
function span(src, from, endMark) {
  const a = src.indexOf(from);
  assert.ok(a >= 0, "missing " + from);
  const b = src.indexOf(endMark, a);
  assert.ok(b > a, "missing end of " + from);
  return src.slice(a, b + endMark.length);
}

function load() {
  const tlx = read("js/render/three/tlx.js");
  const cull = span(tlx, "      function cullInstances(batch, planes, opts) {", "        return n;\n      }");
  const cast = span(tlx, "      function castShadowInstanced(batch, count) {", "\n      }");
  const rec = /if \(rec && n > 0 && b\.packMatrices\) \{[\s\S]*?b\._mirN = n;\n\s*\}/.exec(read("js/game.js"));
  assert.ok(rec, "drawWorldMeshes' mirror recorder");
  const casts = [];
  const ctx = vm.createContext({ localStorage: { getItem: () => null }, Math, Float32Array, Float64Array, Int32Array, Array });
  vm.runInContext(read("js/render/shared/frustum.js").replace(/^const Frustum/m, "var Frustum"), ctx);
  vm.runInContext(read("js/render/shared/inst-cells.js").replace(/^const InstCells/m, "var InstCells"), ctx);
  ctx.TLXShaders = { aabbInFrustum: ctx.Frustum.aabbInFrustum };
  ctx._writeInstanceMatrices = (imesh, m, c, n) => { imesh.gpu = Array.from(m.subarray(0, n * 16)); };
  ctx.skipBatches = () => false;
  // tlx-shadow castInstanced's read, as shipped: packMatrices for a culled cast.
  ctx.shadowSys = { castInstanced: (b, count) => { const src = count !== undefined && b.packMatrices ? b.packMatrices : b.srcMatrices;
    casts.push(Array.from({ length: count === undefined ? b.instances : count }, (_, i) => src[i * 16 + 12])); } };
  vm.runInContext(cull + "\n" + cast + "\nthis.cullInstances = cullInstances; this.castShadowInstanced = castShadowInstanced;"
    + "\nthis.record = function (rec, n, b) {" + rec[0] + "};", ctx);
  return { ctx, casts };
}

// 4 instances in two 72 m cells: cell 0 (x -40, -30), cell 1 (x 20, 30).
function batchOf(ctx) {
  const mats = new Float32Array(4 * 16);
  [-40, -30, 20, 30].forEach((x, i) => mats.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1], i * 16));
  return { instances: 4, srcMatrices: mats, srcColors: new Float32Array(12).fill(0.5), packMatrices: new Float32Array(mats.length),
    packColors: new Float32Array(12), imesh: {}, cells: ctx.Frustum.bucketInstances(mats, 4, new Float32Array([0.5, 0, 0, -0.5, 0, 0]), 72, 1) };
}
const P = (minX) => [[1, 0, 0, -minX], [-1, 0, 0, 200], [0, 1, 0, 100], [0, -1, 0, 100], [0, 0, 1, 100], [0, 0, -1, 100]].map((p) => new Float32Array(p));
const xsOf = (arr, n) => Array.from({ length: n }, (_, i) => arr[i * 16 + 12]);

test("a cache-hit mirror cull after a sun-shadow cull records the MIRROR's pack, not the shadow's", () => {
  const { ctx, casts } = load();
  const b = batchOf(ctx);
  ctx.cullInstances(b, P(0));                                         // main pass: cell 1 uploaded
  const ns = ctx.cullInstances(b, P(-100), { upload: false });        // sunPass rebuild: both cells
  ctx.castShadowInstanced(b, ns);
  assert.deepEqual(casts.pop(), [-40, -30, 20, 30], "the caster still gets the sun box's instances");
  const n = ctx.cullInstances(b, P(0.002));                           // mirror pass: same cell set -> key hit
  ctx.record(true, n, b);
  assert.deepEqual(xsOf(b._mirMats, b._mirN), b.imesh.gpu.filter((_, i) => i % 16 === 12), "recorded == what the mirror drew");
  assert.deepEqual(xsOf(b._mirMats, b._mirN), [20, 30]);
  assert.equal(b.visible, 2, "the camera count survives the shadow cull");
});

test("the shadow cast lends the shadow pack only for its own cull, and hands the camera pack back", () => {
  const { ctx, casts } = load();
  const b = batchOf(ctx);
  ctx.cullInstances(b, P(0));
  const cam = b.packMatrices;
  ctx.castShadowInstanced(b, ctx.cullInstances(b, P(-100), { upload: false }));
  assert.equal(b.packMatrices, cam, "packMatrices is the camera pack again after the cast");
  assert.deepEqual(xsOf(cam, 2), [20, 30], "and its contents were never overwritten");
  ctx.castShadowInstanced(b, 2);                                      // a count with no fresh shadow cull behind it
  assert.deepEqual(casts.pop(), [20, 30], "reads the camera pack, as before");
  ctx.castShadowInstanced(b);                                         // unculled cast: the source matrices
  assert.deepEqual(casts.pop(), [-40, -30, 20, 30]);
});
