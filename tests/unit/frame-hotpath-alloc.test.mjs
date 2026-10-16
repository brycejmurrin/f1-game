/* frame-hotpath-alloc — pins the race-loop GC/CPU trims from perf(frame).
 *
 * Source-level pins (no browser):
 *   - TLX cullInstances uses an indexed for over c.idx (not for…of iterators)
 *   - TLX poolModelMat returns null for an identity model matrix
 *   - GLX shadow cull does not allocate/upload shadowCbo / _shadowColors
 *   - GLX begin caches uPitLane/uPitBox via uf4 and uTime via uf1
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { loadParts } from "../../tools/car/parts-sweep.mjs";
import { gameSource } from "../helpers/game-source.mjs";

const read = (rel) => fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

function lift(src, name) {
  const start = src.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} moved`);
  let depth = 0, i = src.indexOf("{", start);
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) break;
  }
  return src.slice(start, i + 1);
}

test("TLX cullInstances does not for…of over c.idx", () => {
  const body = lift(read("js/render/three/tlx.js"), "cullInstances");
  assert.equal(/for\s*\(\s*const\s+\w+\s+of\s+c\.idx\s*\)/.test(body), false);
  assert.match(body, /const idx = c\.idx/);
  assert.match(body, /for\s*\(\s*let j = 0/);
});

test("TLX poolModelMat short-circuits identity to null", () => {
  const body = lift(read("js/render/three/tlx.js"), "poolModelMat");
  assert.match(body, /return null/);
  assert.match(body, /model\[0\] === 1/);
  assert.match(body, /model\[15\] === 1/);
});

test("GLX shadow cull skips colour pack/upload", () => {
  const glx = read("js/render/glx/glx.js");
  const pack = lift(glx, "_shadowPackFor");
  // Strip comments — the intentional "skip shadowCbo" note must not fail the pin.
  const packCode = pack.replace(/\/\/.*$/gm, "");
  assert.equal(packCode.includes("_shadowColors"), false);
  assert.equal(packCode.includes("shadowCbo"), false);
  assert.equal(/bufferData\([^)]*Colors/.test(packCode), false);
  const cull = lift(glx, "cullInstances");
  assert.match(cull, /const dc = shadow \? null : batch\.packColors/);
  assert.equal(/shadowCbo/.test(cull.replace(/\/\/.*$/gm, "")), false);
});

test("GLX begin caches pit uniforms and uTime", () => {
  const glx = read("js/render/glx/glx.js");
  assert.match(glx, /function uf4\(/);
  assert.match(glx, /uf4\(litU\.uPitLane/);
  assert.match(glx, /uf4\(litU\.uPitBox/);
  assert.match(glx, /uf1\(litU\.uTime,\s*_litUf,\s*"time"/);
});

test("countdown setGridIdle reuses a pooled opts bag", () => {
  const g = gameSource();
  assert.match(g, /const _gridIdleOpts = \{ soundOn: false, wet: false, step: true \}/);
  assert.match(g, /GameAudio\.setGridIdle\(player, _gridIdleOpts\)/);
  assert.equal(/GameAudio\.setGridIdle\(player, \{\s*soundOn/.test(g), false);
});

test("race present sheds bloom mips + godray blur pair at MEDIUM/LOW", () => {
  const g = gameSource();
  assert.match(g, /po\.bloomLevels\s*=/);
  assert.match(g, /po\.grLite\s*=/);
  assert.match(g, /userTier\(\)/);
  // Env probe cadence also reacts to autoShed (not only renderScale).
  assert.match(g, /autoShed\(\)\s*>\s*0/);
});

test("TLX/GLX/WGX honour opts.bloomLevels truncation", () => {
  const tlx = read("js/render/three/tlx-post.js");
  const glx = read("js/render/glx/post.js");
  const wgx = read("js/render/webgpu/wgx.js");
  assert.match(tlx, /o\.bloomLevels\s*>\s*0/);
  assert.match(glx, /opts\.bloomLevels\s*>\s*0/);
  assert.match(wgx, /o\.bloomLevels\s*>\s*0/);
  assert.match(tlx, /useLv/);
  assert.match(glx, /useLv/);
  assert.match(wgx, /useLv/);
});

test("GLX setPolyOffset caches bias and draw() passes depthBias without a literal", () => {
  const glx = read("js/render/glx/glx.js");
  const setPoly = lift(glx, "setPolyOffset");
  assert.match(setPoly, /_polyOn/);
  assert.match(setPoly, /_polyF/);
  const draw = lift(glx, "draw");
  assert.match(draw, /setPolyOffset\(_db\)/);
  assert.equal(/setPolyOffset\(\[_db/.test(draw), false);
  assert.match(glx, /function uf2\(/);
  assert.match(glx, /uf2\(litU\.uBakeOrigin/);
});


test("iterator GC microbench: indexed cull packs with less young-gen pressure than for…of", () => {
  // Synthetic pack loop mirroring cullInstances' inner cell walk. Measures
  // retained heap after forced GC over N cell iterations — for…of mints an
  // iterator per cell; indexed for does not. Skip when gc() is unavailable
  // (plain `node --test`); CI/tooling-fast may not expose it.
  if (typeof globalThis.gc !== "function") return;
  const cells = 4000;
  const idx = new Array(32);
  for (let i = 0; i < 32; i++) idx[i] = i;
  const src = new Float32Array(32 * 16);
  const dst = new Float32Array(32 * 16);
  const packForOf = () => {
    let n = 0;
    for (const i of idx) {
      const so = i * 16, dOff = n * 16;
      for (let k = 0; k < 16; k++) dst[dOff + k] = src[so + k];
      n++;
    }
    return n;
  };
  const packIdx = () => {
    let n = 0;
    for (let j = 0, jn = idx.length; j < jn; j++) {
      const i = idx[j];
      const so = i * 16, dOff = n * 16;
      for (let k = 0; k < 16; k++) dst[dOff + k] = src[so + k];
      n++;
    }
    return n;
  };
  const measure = (fn) => {
    globalThis.gc(); globalThis.gc();
    const h0 = process.memoryUsage().heapUsed;
    for (let c = 0; c < cells; c++) fn();
    globalThis.gc(); globalThis.gc();
    return process.memoryUsage().heapUsed - h0;
  };
  // Warm both paths so JIT noise is shared.
  for (let i = 0; i < 200; i++) { packForOf(); packIdx(); }
  const dFor = measure(packForOf);
  const dIdx = measure(packIdx);
  // Indexed must not allocate MORE retained bytes than for…of over the same
  // work. Absolute floors are noisy across V8 versions; the relative check is
  // the pin. Log both for the PR body.
  assert.ok(dIdx <= dFor + 64 * 1024,
    `indexed retained ${dIdx} B should be ≤ for…of ${dFor} B (+64 KiB slack)`);
  console.log(`# microbench cells=${cells} forOfDelta=${dFor} indexedDelta=${dIdx}`);
});

// ---- bug-hunt 2026-10-09 4.2 (W5 game) --------------------------------------------------------
test("CarMesh.aeroEdgeOn is memoised and tested AFTER the blend: no localStorage read per car per frame", () => {
  const ctx = { console, Math, Object, Array, Float32Array, Uint16Array, Uint32Array, JSON, Number, String, Boolean, isFinite, isNaN, Map, Set, WeakMap, Date };
  let reads = 0, on = "0";
  ctx.localStorage = { getItem: (k) => { if (k === "apex26.aeroEdge") reads++; return on; } };
  ctx.Log = { info() {}, warn() {}, error() {}, debug() {} };
  ctx.Car3D = { aeroFlaps: () => [] };
  vm.createContext(ctx);
  vm.runInContext(read("js/car/car-mesh.js"), ctx, { filename: "js/car/car-mesh.js" });
  const CarMesh = vm.runInContext("CarMesh", ctx);
  CarMesh.init({ createMesh: () => ({}), draw() {}, freeMesh() {} });
  const mat = new Float32Array(16);
  for (let i = 0; i < 2000; i++) CarMesh.drawAeroEdge(mat, 2, null, 0.2);   // Z-mode cars: most of a lap
  assert.equal(reads, 0, "a car below the blend gate never reads the latch");
  for (let i = 0; i < 2000; i++) CarMesh.drawAeroEdge(mat, 2, null, 0.9);   // X-mode cars on a straight
  assert.ok(reads <= 1, `${reads} localStorage reads for 2000 X-mode draws (was one per draw)`);
});

test("CarMesh.getAeroFlapSet: a (record, pose) memo returns the same baked mesh and never hands back an evicted one", () => {
  const M = loadParts();
  const made = [], freed = [];
  M.CarMesh.init({ createMesh: (d) => { const m = { id: made.length, d }; made.push(m); return m; }, freeMesh: (m) => freed.push(m), draw() {} });
  const set = (col, open, only) => M.CarMesh.getAeroFlapSet(2, col, null, null, open, only);
  const a = set([0.1, 0.2, 0.3], false), n = made.length;
  assert.ok(a, "level 2 has flaps");
  assert.equal(set([0.1, 0.2, 0.3], false), a, "a hit is the same mesh");
  assert.equal(made.length, n, "…and builds nothing");
  const poses = [set([0.1, 0.2, 0.3], true), set([0.1, 0.2, 0.3], false, "front"), set([0.1, 0.2, 0.3], false, "rear"), set([0.1, 0.2, 0.3], true, "front")];
  assert.equal(new Set([a, ...poses]).size, 5, "closed / open / front / rear / open-front are five meshes, not one");
  assert.equal(set([0.1, 0.2, 0.3], true), poses[0]);
  assert.equal(set([0.1, 0.2, 0.3], false, "rear"), poses[2]);
  for (let i = 0; i < 80; i++) set([i / 100, 0.5, 0.5], false);   // past FLAP_SET_MAX (64): the oldest is evicted and freed
  assert.ok(freed.includes(a), "the first set was evicted");
  const again = set([0.1, 0.2, 0.3], false);
  assert.ok(!freed.includes(again), "the memo does not hand back a freed mesh");
  assert.notEqual(again, a, "it is rebuilt");
});

// ---- perf hunt 2 F2 (2026-10-13) -----------------------------------------------------------------
test("CarMesh.drawRearLights / drawMirrorLights: one draw per car, the old per-light offsets baked into the vertices", () => {
  const M = loadParts();
  const made = [], draws = [];
  M.CarMesh.init({ createMesh: (d) => { const m = { id: made.length, d }; made.push(m); return m; }, freeMesh() {},
    draw: (mesh, mat, opts) => draws.push({ mesh, mat: Float32Array.from(mat), em: opts.emissive }) });
  const mat = new Float32Array([0.8, 0, -0.6, 0,  0, 1, 0, 0,  0.6, 0, 0.8, 0,  120.5, 3.25, -840.75, 1]);
  M.CarMesh.drawRearLights(mat, 0.7);
  M.CarMesh.drawRearLights(mat, 1);
  assert.equal(draws.length, 2, "one draw per call (was three)");
  assert.equal(draws[0].mesh, draws[1].mesh, "the set is built once");
  assert.deepEqual([draws[0].em, draws[1].em], [0.7, 1]);
  // The old path: quad (half-extents w,h at the origin) drawn through mat * T(o). The baked mesh at mat must land
  // on the same world points.
  const xf = (m, x, y, z) => [0, 1, 2].map((k) => m[k] * x + m[4 + k] * y + m[8 + k] * z + m[12 + k]);
  const { ris: R, endplate: E } = M.CarMesh.REAR_LIGHTS, d = draws[0].mesh.d;
  const quad = (w, h) => [[-w, -h], [w, -h], [w, h], [-w, h]];
  const want = [];
  for (const [o, w, h] of [[R, 0.068, 0.082], [[-E[0], E[1], E[2]], 0.030, 0.038], [E, 0.030, 0.038]])
    for (const [x, y] of quad(w, h)) want.push(xf(mat, x + o[0], y + o[1], o[2]));
  assert.equal(d.pos.length, want.length * 3);
  for (let v = 0; v < want.length; v++) {
    const got = xf(mat, d.pos[v * 3], d.pos[v * 3 + 1], d.pos[v * 3 + 2]);
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(got[k] - want[v][k]) < 1e-6, `vertex ${v}`);
  }
  assert.equal(d.idx.length, 36, "three both-wound quads");
  assert.ok(d.idx.every((i) => i < 12));
  // Mirror lamps: one mesh per anchors RESULT (frozen, cached per team+scale in Car3D), both sides in one draw.
  const a = M.Car3D.mirrorLightAnchors("ferrari", 1), b = M.Car3D.mirrorLightAnchors("mercedes", 1);
  draws.length = 0;
  M.CarMesh.drawMirrorLights(mat, a); M.CarMesh.drawMirrorLights(mat, a); M.CarMesh.drawMirrorLights(mat, b);
  assert.equal(draws.length, 3, "one draw per car (was two)");
  assert.equal(draws[0].mesh, draws[1].mesh, "same anchors, same mesh");
  assert.notEqual(draws[0].mesh, draws[2].mesh);
  const md = draws[0].mesh.d;
  assert.equal(md.pos.length, 24);
  for (let s = 0; s < 2; s++) assert.ok(Math.abs(md.pos[s * 12] - a[s].x) < 1e-12 && Math.abs(md.pos[s * 12 + 1] - (a[s].y - 0.018)) < 1e-12, `side ${s} sits at its anchor`);
});

// ---- perf hunt 2 F3 (2026-10-13) -----------------------------------------------------------------
function tailGlowVm(gfxExtra) {
  const ctx = { console, Math, Object, Array, Float32Array, Uint16Array, Uint32Array, JSON, Number, String, Boolean, isFinite, isNaN, Map, Set, WeakMap, Date };
  ctx.Log = { info() {}, warn() {}, error() {}, debug() {} };
  const g2d = { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, fillStyle: "" };
  ctx.document = { createElement: () => ({ width: 0, height: 0, getContext: () => g2d }) };
  vm.createContext(ctx);
  vm.runInContext(read("js/car/car-mesh.js"), ctx, { filename: "js/car/car-mesh.js" });
  const CarMesh = vm.runInContext("CarMesh", ctx);
  const decals = [];
  CarMesh.init(Object.assign({ createMesh: () => ({}), createTexMesh: (d) => ({ geo: d }), createTexture: () => ({ tex: 1 }), draw() {},
    drawDecal: (mesh, m, tex, opts) => decals.push({ mesh, m: Array.from(m), batch: !!opts.batch, glow: opts.glow }) }, gfxExtra));
  return { CarMesh, decals };
}
test("CarMesh tail glows: a decalRuns backend gets the field back to back after the car loop, same matrices, same order", () => {
  const ground = (x) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0.5, 2 * x, 1]);
  const amts = [1, 0.4, 2.5];
  const now = tailGlowVm({});   // GLX / WGX: no decalRuns, drawn at once
  for (let i = 0; i < amts.length; i++) now.CarMesh.drawTailGlow(ground(i * 10), amts[i]);
  assert.equal(now.decals.length, 3, "drawn as they come");
  now.CarMesh.flushTailGlows();
  assert.equal(now.decals.length, 3, "nothing queued");
  const q = tailGlowVm({ decalRuns: true });   // TLX
  for (let i = 0; i < amts.length; i++) q.CarMesh.drawTailGlow(ground(i * 10), amts[i]);
  assert.equal(q.decals.length, 0, "queued, not drawn inside the car loop");
  q.CarMesh.flushTailGlows();
  assert.equal(q.decals.length, 3);
  assert.deepEqual(q.decals.map((d) => d.m), now.decals.map((d) => d.m), "the same matrices in the same order");
  assert.ok(q.decals.every((d) => d.batch && d.glow === 1.6 && d.mesh === q.decals[0].mesh), "one mesh, one opts bag, marked batchable");
  q.CarMesh.flushTailGlows();
  assert.equal(q.decals.length, 3, "a flush empties the queue");
});
test("TLX decal runs: A6's live-record guard, one material per run, and the normal carried in the planar quad's Y column", () => {
  const tlx = read("js/render/three/tlx.js");
  const body = lift(tlx, "_decalAppend");
  assert.match(body, /b\.rec >= 0 && b\.rec < drawList\.n && drawList\[b\.rec\]\.instanced === b/, "the record sentinel guard (A6 fix)");
  assert.match(body, /b\.rec !== drawList\.n - 1 \|\| b\.visible >= BLOB_CAP \|\| drawList\[b\.rec\]\.mat !== mat/, "contiguous, capped, one material");
  assert.match(body, /if \(skipBatches\(\)\) return false;/);
  // Y column := Z x X (columns X = w[0..2], Z = w[8..10]).
  assert.match(body, /nx = w\[9\] \* w\[2\] - w\[10\] \* w\[1\], ny = w\[10\] \* w\[0\] - w\[8\] \* w\[2\], nz = w\[8\] \* w\[1\] - w\[9\] \* w\[0\]/);
  assert.match(body, /a\[o \+ 4\] = nx; a\[o \+ 5\] = ny; a\[o \+ 6\] = nz; a\[o \+ 7\] = 0;/);
  assert.match(tlx, /if \(opts && opts\.batch && _decalAppend\(mesh\.geo, modelMat, mat\)\) return;/, "only batch-marked decals (livery atlases stay per record)");
  assert.match(tlx, /for \(const run of \[_blob, \.\.\._decalRuns\.values\(\)\]\)/, "a hidden run is warmed like A6's blob");
  assert.match(gameSource(), /CarMesh\.flushTailGlows\(\);[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*carDraw\.flushDecals\(night\);/, "flushed after the car loop, before the livery decals (their old relative order)");
});

test("blueWatch.tick gets the pooled _blueCtx, never a per-step literal (issue #1649)", () => {
  const g = gameSource();
  assert.match(g, /const _blueCtx = \{ total: 0, vRef: 0, caution: 0, race: true \}/);
  assert.match(g, /blueWatch\.tick\(player, ranked, _blueCtx, dt\)/);
  assert.equal(/blueWatch\.tick\([^)]*\{/.test(g), false, "a literal is back in the race step");
});

test("car loop: a world-posed rival behind the eye is culled before sampleAt (perf plan C-10)", () => {
  const g = gameSource();
  const early = g.indexOf("rp.world && (rp.x - camEye[0]) * _camFwdX + (rp.z - camEye[2]) * _camFwdZ < -6) continue;");
  assert.notEqual(early, -1, "the early behind-camera cull moved");
  const sample = g.indexOf("sampleAt(cS, smp2);", early);
  assert.ok(sample > early && sample - early < 200, "it must sit right before the field's track sample");
  // Same predicate as the full cull it front-runs (tmpP x/z ARE rp.x/rp.z for a world pose).
  assert.match(g, /if \(dx \* _camFwdX \+ dz \* _camFwdZ < -6\) continue;/);
});

test("Collide relaxation stops after a pass that reached no contact (hunt-2 P6)", () => {
  const src = read("js/physics/collide.js");
  const body = lift(src, "resolveCollisions");
  assert.match(body, /if \(pass > 0 && !_colTouched\) break;/);
  assert.match(lift(src, "_colResolvePair"), /if \(!ct\) return;\s*_colTouched = true;/);
});
