/* tlx-cull-shadow-pack — TLX's sun-shadow instanced cull has its OWN pack (R3-RENDER-6).
 *
 * shadow-pass.js _castPropBatchesShadow culls every prop batch with the sun box
 * ({upload:false}) and hands the count to gfx.castShadowInstanced. TLX packed
 * that cull into batch.packMatrices — the CAMERA pack — so a mirror cull that
 * then HIT the cell-set cache (same cells as the last upload: no repack)
 * left the shadow pack in packMatrices, the entry module's drawWorldMeshes
 * recorder copied it into _mirMats, and the next frozen mirror frame
 * (instEvery 2) uploaded instances the mirror cannot see
 * (scratch/hunt3-render/tlx-mirpack.cjs). GLX/WGX were immune (_shadowPackFor).
 * The real cullInstances + castShadowInstanced (extracted from tlx.js), real
 * InstCells/Frustum, and the recorder extracted via gameSource(). No browser (~0.1 s).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fnSource } from "../helpers/fn-source.mjs";
import { gameSource } from "../helpers/game-source.mjs";

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
  const game = gameSource().slice("// ==== js/game.js\n".length).split("\n// ==== ")[0];
  const rec = /if \(rec && n > 0 && b\.packMatrices\) \{[\s\S]*?b\._mirN = n;\n\s*\}/.exec(game);
  assert.ok(rec, "drawWorldMeshes' mirror recorder");
  const casts = [];
  const ctx = vm.createContext({ localStorage: { getItem: () => null }, Math, Float32Array, Float64Array, Int32Array, Array });
  vm.runInContext(read("js/render/shared/frustum.js").replace(/^const Frustum/m, "var Frustum"), ctx);
  vm.runInContext(read("js/render/shared/inst-cells.js").replace(/^const InstCells/m, "var InstCells"), ctx);
  Object.assign(ctx, { _mirActive: false, frameEye: null, frameCullDist: 0, frameCullFog: null });
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

// Run every backend's real culler and the shared production predicates. Only
// uploads and renderer frame latches are stand-ins: selection/cache behavior is real.
function radialRig(backend, enabled) {
  let writes = 0;
  const ctx = vm.createContext({ Math, Float32Array, Float64Array, Int32Array, Array,
    localStorage: { getItem: () => enabled ? null : "0" },
    frameEye: [0, 0, 0], frameCullDist: 0, frameCullFog: [0, 0.018],
    _mirActive: false, _mirEncoder: null, _mirEye: [700, 0, 0], _mirCull: 100, _mirFog: null,
    _mirFreeze: false, ctxGone: () => false, _passBatch: b => b, identInstanceBuf: null,
    gl: { ARRAY_BUFFER: 1, bindBuffer() {}, bufferSubData() { writes++; } },
    device: { queue: { writeBuffer() { writes++; } } },
    _writeInstanceMatrices() { writes++; },
    _shadowPackFor: b => b._shadowPacked,
  });
  for (const file of ["js/render/shared/frustum.js", "js/render/shared/inst-cells.js"])
    vm.runInContext(read(file).replace(/^const /gm, "var "), ctx);
  ctx.CHK = ctx.TLXShaders = ctx.Frustum;
  const path = backend === "tlx" ? "three/tlx" : backend === "glx" ? "glx/glx" : "webgpu/wgx";
  vm.runInContext(fnSource(read("js/render/" + path + ".js"), "function cullInstances(batch, planes, opts) {")
    + "\nthis.cull = cullInstances;", ctx);
  const mats = new Float32Array(64);
  [10, 250, 700, 700].forEach((x, i) => mats[i * 16 + 12] = x);
  const cells = [10, 250, 700, 700].map((x, i) => ({ idx: [i], mn: [x - 1, 0, -1], mx: [x + 1, i === 3 ? 500 : 1, 1] }));
  const batch = { cells, instances: 4, visible: 4, srcMatrices: mats, srcColors: null,
    packMatrices: new Float32Array(64), packColors: null, _instPacked: new Float32Array(80),
    _shadowPacked: new Float32Array(80), imesh: {}, ibo: {}, instBuf: {} };
  return { ctx, batch, writes: () => writes };
}

const widePlanes = () => P(-1000).map(p => new Float32Array([p[0], p[1], p[2], 10000]));

for (const backend of ["tlx", "glx", "wgx"]) for (const enabled of [true, false]) {
  test(`${backend}: radial cull and scalar cache survive mutable frame inputs (cell cache ${enabled})`, () => {
    const { ctx, batch: b, writes } = radialRig(backend, enabled);
    const planes = widePlanes();
    assert.equal(ctx.cull(b, planes), 4);
    assert.equal(ctx.cull(b, planes), 4);
    assert.equal(writes(), 1, "identical planes and radial scalars reuse the physical pack");
    ctx.frameEye[2] = 1000;
    assert.equal(ctx.cull(b, planes), 4);
    assert.equal(writes(), 1, "an inactive radial budget adds no recull when eye moves");
    ctx.frameEye[2] = 0;
    ctx.frameCullFog[0] = 0.01;
    assert.equal(ctx.cull(b, planes), 3, "changed density with unchanged planes reselects; tall silhouette stays");
    assert.equal(writes(), 2);
    ctx.frameCullFog[1] = 0;
    assert.equal(ctx.cull(b, planes), 2, "changed height falloff drops only fully fogged tall cells");
    ctx.frameCullFog[1] = 0.018;
    assert.equal(ctx.cull(b, planes), 3);
    const before = writes();
    ctx.frameCullFog[0] = 0.009;
    assert.equal(ctx.cull(b, planes), 3);
    assert.equal(writes(), before + (enabled ? 0 : 1), "same cells still skip upload when enabled");
    ctx.frameCullFog[0] = 0;
    assert.equal(ctx.cull(b, planes), 4);
    ctx.frameCullDist = 200;
    assert.equal(ctx.cull(b, planes), 1, "radius-only change reselects unchanged planes");
    ctx.frameEye[0] = 700;
    assert.equal(ctx.cull(b, planes), 2, "mutating the same eye array changes selection");
    assert.equal((backend === "wgx" ? b._instPacked : b.packMatrices)[12], 700);
    const radial = Array.from(b._cullRadial), cameraVisible = b.visible;
    assert.equal(ctx.cull(b, planes, { upload: false }), 4, "camera radius and fog never cull shadow casters");
    assert.equal(b.visible, cameraVisible);
    assert.deepEqual(Array.from(b._cullRadial), radial, "shadow cull leaves camera cache scalars untouched");
  });
}

test("TLX mirror instance cull uses the mirror eye and radius instead of the main camera", () => {
  const { ctx, batch: b } = radialRig("tlx", true);
  ctx.frameCullDist = 100;
  assert.equal(ctx.cull(b, widePlanes()), 1);
  ctx._mirActive = true;
  assert.equal(ctx.cull(b, widePlanes()), 2);
  assert.equal(b.packMatrices[12], 700);
});

for (const backend of ["tlx", "glx", "wgx"]) test(`${backend}: cell-key hit cannot mix old planes with a newer radial snapshot`, () => {
  const { ctx, batch: b, writes } = radialRig(backend, true);
  const all = widePlanes(), narrow = widePlanes(); narrow[1][3] = 100;
  ctx.frameCullDist = 200;
  assert.equal(ctx.cull(b, all), 1);
  ctx.frameEye[0] = 150;
  assert.equal(ctx.cull(b, narrow), 1);
  assert.equal(writes(), 1, "different planes and eye, identical cells: no upload");
  assert.equal(ctx.cull(b, all), 2, "old planes with newer eye is a different selection");
  assert.equal(writes(), 2);
});
