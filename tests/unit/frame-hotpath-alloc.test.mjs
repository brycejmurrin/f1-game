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
  const g = read("js/game.js");
  assert.match(g, /const _gridIdleOpts = \{ soundOn: false, wet: false, step: true \}/);
  assert.match(g, /GameAudio\.setGridIdle\(player, _gridIdleOpts\)/);
  assert.equal(/GameAudio\.setGridIdle\(player, \{\s*soundOn/.test(g), false);
});

test("race present sheds bloom mips + godray blur pair at MEDIUM/LOW", () => {
  const g = read("js/game.js");
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
