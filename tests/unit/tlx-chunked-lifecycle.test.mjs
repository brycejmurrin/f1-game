/* tlx-chunked-lifecycle — caller frees release TLX's pooled geometry owner
 * before disposing the THREE geometry. No renderer or GPU is involved. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { seedLog } from "../helpers/seed-log.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = new URL("../../js/render/three/tlx-chunked.js", import.meta.url);
const CHUNK_BINS = fs.readFileSync(new URL("../../js/render/shared/chunk-bins.js", import.meta.url), "utf8").replace(/^const\b/gm, "var");

class BufferAttribute {
  constructor(array, itemSize, normalized) {
    this.array = array; this.itemSize = itemSize; this.normalized = !!normalized;
    this.count = array ? array.length / itemSize : 0;
    this.updateRanges = [];
    this.needsUpdate = false;
  }
}
class Float16BufferAttribute extends BufferAttribute {}
class BufferGeometry {
  constructor() { this.attributes = {}; this.index = null; this.disposals = 0; this.drawRange = null; }
  setAttribute(name, value) { this.attributes[name] = value; }
  setIndex(value) { this.index = value; }
  setDrawRange(start, count) { this.drawRange = { start, count }; }
  dispose() { this.disposals++; }
}
class Vector3 { constructor(x, y, z) { this.x = x; this.y = y; this.z = z; } }
class Sphere {}
class Box3 {
  constructor(min, max) { this.min = min; this.max = max; }
  getBoundingSphere() {}
}
const THREE = { BufferAttribute, Float16BufferAttribute, BufferGeometry, Vector3, Sphere, Box3 };

function factory(released) {
  const sandbox = {
    window: {}, localStorage: { getItem: () => null },
    Float32Array, Uint32Array, Uint16Array, Uint8Array, Int16Array, Int32Array, Array, Map, Math,
    Frustum: {},
  };
  vm.createContext(sandbox);
  seedLog(sandbox);
  vm.runInContext(CHUNK_BINS, sandbox, { filename: absSrc("js/render/shared/chunk-bins.js") });   // build() bins through ChunkBins at call time
  vm.runInContext(fs.readFileSync(SRC, "utf8"), sandbox, { filename: absSrc("js/render/three/tlx-chunked.js") });
  return sandbox.window.TLXShaders.chunked(THREE, {
    isWebGPU: () => false,
    releaseGeometry: geo => released.push(geo),
  });
}

test("free releases and disposes a plain geometry exactly once", () => {
  const released = [], sys = factory(released);
  const mesh = sys.build({
    pos: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]),
    idx: new Uint16Array([0, 1, 2]),
  }, 72);
  const geo = mesh.geo;
  sys.free(mesh);
  assert.deepEqual(released, [geo]);
  assert.equal(geo.disposals, 1);
  assert.equal(mesh.geo, null);
});

test("free releases every chunk geometry before dropping the handle", () => {
  const released = [], sys = factory(released);
  const idx = new Uint16Array(2000 * 3);
  for (let t = 0; t < 2000; t++) {
    const base = t % 2 ? 3 : 0;
    idx[t * 3] = base; idx[t * 3 + 1] = base + 1; idx[t * 3 + 2] = base + 2;
  }
  const mesh = sys.build({
    pos: new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 0, 1,
      400, 0, 0, 401, 0, 0, 400, 0, 1,
    ]),
    idx,
    _keepPositions: true,
  }, 72);
  // Copy out of the VM realm before deep comparison; the geometry identities
  // are host objects, but Array.prototype on mesh.chunks belongs to the VM.
  const geos = Array.from(mesh.chunks, ch => ch.geo);
  assert.equal(geos.length, 2, "fixture spans two spatial chunks");
  sys.free(mesh);
  assert.deepEqual(released, geos);
  assert.deepEqual(geos.map(g => g.disposals), [1, 1]);
  assert.equal(mesh.chunks, null);
  assert.equal(mesh.geo, null);
});

// DRAW MERGE (tlx-chunked.js build, PERF-FINDINGS §2ai): apex26.tlxChunkMerge
// folds k x k lamp cells into one draw chunk. The draw chunks must carry every
// triangle exactly once, and the lamp table must stay on the ORIGINAL cells —
// the lit shader looks lamps up by world cell, so a merge that widened the
// cells would squeeze more lamps under the same 24-lamp cap.
function mergeFactory(value, constructors = {}) {
  const sandbox = {
    window: {}, localStorage: { getItem: (k) => (k === "apex26.tlxChunkMerge" ? value : null) },
    Float32Array, Uint32Array, Uint16Array, Uint8Array, Int16Array, Int32Array, Array, Map, Math,
    Frustum: {}, ...constructors,
  };
  vm.createContext(sandbox);
  seedLog(sandbox);
  vm.runInContext(CHUNK_BINS, sandbox, { filename: absSrc("js/render/shared/chunk-bins.js") });   // build() bins through ChunkBins at call time
  vm.runInContext(fs.readFileSync(SRC, "utf8"), sandbox, { filename: absSrc("js/render/three/tlx-chunked.js") });
  return sandbox.window.TLXShaders.chunked(THREE, { isWebGPU: () => false, releaseGeometry() {} });
}
function gridMesh() {
  // 6 x 6 cells of 72 m, 70 small triangles in each: 2520 tris, past the
  // 2000-tri threshold below which build() keeps one un-chunked geometry.
  const pos = [], idx = [];
  for (let cx = 0; cx < 6; cx++) for (let cz = 0; cz < 6; cz++) for (let t = 0; t < 70; t++) {
    const x = cx * 72 + 5 + (t % 10) * 6, z = cz * 72 + 5 + Math.floor(t / 10) * 8, v = pos.length / 3;
    pos.push(x, 0, z, x + 1, 0, z, x, 0, z + 1);
    idx.push(v, v + 1, v + 2);
  }
  return { pos: new Float32Array(pos), idx: new Uint32Array(idx) };
}
const triSet = (mesh) => {
  const all = [];
  for (const c of mesh.chunks) { const a = c.geo.index.array; for (let i = 0; i < a.length; i += 3) all.push(a[i] + "," + a[i + 1] + "," + a[i + 2]); }
  return all.sort();
};

test("merge 1 keeps one draw chunk per lamp cell and no separate lamp table", () => {
  const mesh = mergeFactory("1").build(gridMesh(), 72);
  assert.equal(mesh.chunks.length, 36);
  assert.equal(mesh.lampCells, null);
});

test("merge 2 folds 2x2 cells per draw, keeps every triangle once, and keeps the lamp cells", () => {
  const one = mergeFactory("1").build(gridMesh(), 72);
  const two = mergeFactory("2").build(gridMesh(), 72);
  assert.equal(two.chunks.length, 9, "6x6 cells -> 3x3 draw chunks");
  assert.deepEqual(triSet(two), triSet(one), "the merged draws cover exactly the same triangles");
  assert.equal(two.count, one.count);
  assert.equal(two.lampCells.length, 36, "the lamp table stays on the 72 m cells");
  const cellKeys = (cs) => Array.from(cs, (c) => c.gx + ":" + c.gz).sort();   // main-realm array: the build runs in a vm
  assert.deepEqual(cellKeys(two.lampCells), cellKeys(one.chunks), "same cell coordinates as the unmerged chunks");
  for (const c of two.chunks) for (let a = 0; a < 3; a++) assert.ok(c.min[a] <= c.max[a], "merged bounds are a real box");
});

test("the merge is ON by default (no stored value)", () => {
  const sizes = (v) => Array.from(mergeFactory(v).build(gridMesh(), 72).chunks, (c) => c.count);
  assert.deepEqual(sizes(null), sizes("3"), "the default factor is 3 (cells are biased by 1024, so 6 cells straddle 3 blocks)");
  assert.notDeepEqual(sizes(null), sizes("2"));
  assert.ok(sizes(null).length < 36);
});

for (const vertices of [65535, 65536]) for (const merge of [2, 3, 4]) {
  test(`merge ${merge} builds final indices once at the ${vertices}-vertex boundary`, () => {
    const fixture = () => {
      const data = gridMesh(), pos = new Float32Array(vertices * 3);
      pos.set(data.pos);
      pos.set(data.pos.subarray(data.pos.length - 9), pos.length - 9);
      data.pos = pos;
      data.idx.set([vertices - 3, vertices - 2, vertices - 1], data.idx.length - 3);
      return data;
    };
    const one = mergeFactory("1").build(fixture(), 72);
    const expected = new Map();
    for (const c of one.chunks) {
      const key = Math.floor(c.gx / merge) + ":" + Math.floor(c.gz / merge);
      if (!expected.has(key)) expected.set(key, []);
      expected.get(key).push(...c.geo.index.array);
    }
    const IndexArray = vertices > 65535 ? Uint32Array : Uint16Array;
    const allocations = [];
    const tracked = new Proxy(IndexArray, { construct(target, args) {
      allocations.push(args[0]);
      return Reflect.construct(target, args);
    } });
    const sys = mergeFactory(String(merge), { [IndexArray.name]: tracked });
    allocations.length = 0;   // exclude the factory's float-bit reinterpretation view
    const mesh = sys.build(fixture(), 72);
    assert.deepEqual(Array.from(mesh.chunks, c => Array.from(c.geo.index.array)), [...expected.values()],
      "merged chunks preserve the original cell and triangle order, including high vertex indices");
    assert.ok(mesh.chunks.every(c => c.geo.index.array instanceof IndexArray), "correct index width");
    assert.equal(allocations.length, mesh.chunks.length, "one final index allocation per draw chunk");
    assert.ok(allocations.every(n => typeof n === "number"), "allocate final storage directly without copying an intermediate index array");
  });
}

// NORMAL PACK CLAMP. packAttr's range scan admits |v| <= 1.0001 (float noise on
// normalised normals), but round(1.0001 * 32767) = 32770 overflows Int16 and
// WRAPS to -32766 — a normal flipped into the opposite hemisphere. The pack
// must clamp to ±32767 like VertexPack.qs.
test("snorm16 normal pack clamps, never wraps, at the 1.0001 admission edge", () => {
  // Float32 values just under the edge (1.0001 itself rounds ABOVE it in f32);
  // both still round past 32767 unclamped.
  const sys = factory([]);
  const mesh = sys.build({
    pos: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]),
    nrm: new Float32Array([1.00009, -1.00009, 0, 0, 1.00005, -1.00005, 0.5, -0.5, 1]),
    idx: new Uint16Array([0, 1, 2]),
  }, 72);
  const a = mesh.geo.attributes.normal.array;
  assert.equal(a.constructor.name, "Int16Array", "normals packed to Int16");
  // WebGL2 (isWebGPU false) widens to snorm16x4 (A-W2, apex26.tlxPad4): the same clamped xyz, w 0.
  assert.equal(mesh.geo.attributes.normal.itemSize, 4);
  assert.deepEqual(Array.from(a),
    [32767, -32767, 0, 0, 0, 32767, -32767, 0, Math.round(0.5 * 32767), Math.round(-0.5 * 32767), 32767, 0]);
});

// DUST MERGE (tlx-chunked.js build): cells that hold a few triangles (a ground triangle whose centroid lands in a
// street cell) each cost a RenderObject per pass. Dust draws of one block, and the always-visible wide ones,
// share a chunk; the triangles, the lamp cells and the big chunks are untouched.
function dustMesh() {
  const pos = [], idx = [];
  const tri = (x, z, w) => { const v = pos.length / 3; pos.push(x, 0, z, x + w, 0, z, x, 0, z + 1); idx.push(v, v + 1, v + 2); };
  for (let t = 0; t < 2000; t++) tri(4980 + (t % 50), 4980 + Math.floor(t / 50), 0.5);   // one big cell, far from the dust
  for (let k = 0; k < 8; k++) for (let j = 0; j < 3; j++) tri(10 + k * 72, 10 + j * 72, 2);          // 24 one-triangle cells in one 576 m block
  for (let k = 0; k < 6; k++) tri(-3000 + k * 400, -3000, 2500);                                     // 6 wide ground skirts (own box > the extent cap)
  return { pos: new Float32Array(pos), idx: new Uint32Array(idx) };
}

test("dust merge folds one-triangle cells into shared draws and keeps every triangle once", () => {
  const off = mergeFactory("1").build(dustMesh(), 72);
  const on = mergeFactory("2").build(dustMesh(), 72);
  assert.equal(off.chunks.length, 31, "merge 1 is the off-switch: one draw per cell (1 big + 24 dust + 6 wide)");
  assert.equal(on.chunks.length, 3, "big chunk + one local dust draw + one wide dust draw");
  assert.deepEqual(triSet(on), triSet(off), "the merged draws cover exactly the same triangles");
  assert.equal(on.count, off.count);
  assert.equal(on.lampCells.length, 31, "the lamp table stays on the 72 m cells");
  const sizes = Array.from(on.chunks, (c) => c.count / 3).sort((a, b) => a - b);
  assert.deepEqual(sizes, [6, 24, 2000], "dust groups stay under the triangle cap and the big chunk is untouched");
});

test("orphan dust whose box already spans a block shares one draw across blocks", () => {
  // Six ground triangles, each 700 m wide (under the wide-list cap, over one
  // 8-cell block) with centroids 900 m apart, plus one tight 2 m triangle and
  // one dense chunk. The block pack leaves the six alone; they must share a draw.
  const pos = [], idx = [];
  const tri = (x, z, w) => { const v = pos.length / 3; pos.push(x, 0, z, x + w, 0, z, x, 0, z + 1); idx.push(v, v + 1, v + 2); };
  for (let t = 0; t < 2000; t++) tri(4980 + (t % 50) * 0.5, 4980 + Math.floor(t / 50), 0.5);
  for (let k = 0; k < 6; k++) tri(k * 900, 0, 700);
  tri(8000, 8000, 2);
  const data = () => ({ pos: new Float32Array(pos), idx: new Uint32Array(idx) });
  const off = mergeFactory("1").build(data(), 72);
  const on = mergeFactory(null).build(data(), 72);
  assert.equal(on.chunks.length, 3, "dense chunk + one packed orphan draw + the tight triangle");
  assert.deepEqual(triSet(on), triSet(off), "orphan packing covers exactly the same triangles");
  assert.equal(on.lampCells.length, off.chunks.length, "the lamp table stays on the 72 m cells");
  const sizes = Array.from(on.chunks, (c) => c.count / 3).sort((a, b) => a - b);
  assert.deepEqual(sizes, [1, 6, 2000]);
});

test("a dust draw's box is the union of its parts, so the cull never drops a member", () => {
  const on = mergeFactory("2").build(dustMesh(), 72);
  const tris = (c) => { const a = c.geo.index.array, p = dustMesh().pos, out = []; for (let i = 0; i < a.length; i++) out.push([p[a[i] * 3], p[a[i] * 3 + 1], p[a[i] * 3 + 2]]); return out; };
  for (const c of on.chunks) for (const v of tris(c)) for (const a of [0, 2]) {
    assert.ok(v[a] >= c.min[a] - 1e-6 && v[a] <= c.max[a] + 1e-6, "every vertex of every merged triangle sits inside the chunk box");
  }
});

// Moved from track-foundation.test.mjs (TK1-11): a source scan of the game / shadow-pass / TLX
// wiring around the chunked ribbons, not a track-engine property.
test("game keeps the sole prebuilt ribbon usable across envCull and tier changes", () => {
  const source = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  assert.match(source, /chunkRibbons:\s*PerfGov\.tier\(\) < 3/);
  assert.match(source, /track\.meshes\.terrain \|\| track\.meshes\.terrainChunked/);
  assert.match(source, /track\.meshes\.road \|\| track\.meshes\.roadChunked/);
  assert.match(source, /_wantRoadChunk = gfx\.chunkedTrackCoords !== false/);
  // The lazy shadow-ribbon build is TIER-GATED. Above tier 3 Tracks.build()
  // writes a FUSED ribbon for perf and leaves roadChunked/terrainChunked
  // undefined — and this lazy build then made a second GPU copy anyway
  // (+2.78 MiB median, +3.81 on spa), charged to precisely the devices already
  // told to spend less: the crash-strike floor, GRAPHICS: LOW, or the
  // governor's own shed all raise tier(). Without the gate the fused/chunked
  // split above buys nothing on the tier that needs it most.
  // The lazy build itself lives in the shadow-pass seam (js/render/shared/shadow-pass.js,
  // _castRibbonSh) — it is what casts the ribbons into the sun map.
  const shadow = fs.readFileSync(path.join(ROOT, "js/render/shared/shadow-pass.js"), "utf8");
  assert.match(shadow, /const tierOk = typeof PerfGov === "undefined" \|\| PerfGov\.tier\(\) < 3;/);
  assert.match(shadow, /if \(allow && tierOk && geo && G\.gfx\.createChunkedMesh\)/);
  assert.match(shadow, /"roadChunked", G\.track\.meshes\.road, G\.gfx\.chunkedTrackCoords !== false/);
  const tlx = fs.readFileSync(path.join(ROOT, "js/render/three/tlx.js"), "utf8");
  assert.match(tlx, /chunkedTrackCoords:\s*false/);
});

// THE ROAD SPLIT (tlx.js _drawSplit): sub-range AABBs over index order, merged into at most N drawRanges.
function shaders() {
  const sandbox = { window: {}, localStorage: { getItem: () => null }, Float32Array, Uint32Array, Uint16Array, Uint8Array, Int16Array, Int32Array, Array, Map, Math, Frustum: {} };
  vm.createContext(sandbox);
  seedLog(sandbox);
  vm.runInContext(CHUNK_BINS, sandbox, { filename: absSrc("js/render/shared/chunk-bins.js") });
  vm.runInContext(fs.readFileSync(SRC, "utf8"), sandbox, { filename: absSrc("js/render/three/tlx-chunked.js") });
  return sandbox.window.TLXShaders;
}
const plain = v => JSON.parse(JSON.stringify(v));

test("splitRanges covers every index exactly once and boxes its own vertices", () => {
  const S = shaders();
  const pos = new Float32Array([0, 0, 0, 10, 0, 0, 0, 5, 1, 100, 2, 3, 101, 2, 3, 100, 9, 4]);
  const idx = new Uint32Array([0, 1, 2, 3, 4, 5, 0, 2, 1]);
  const r = plain(S.splitRanges(pos, idx, 1));
  assert.deepEqual(r.map(c => [c.start, c.count]), [[0, 3], [3, 3], [6, 3]]);
  assert.deepEqual(r[0].min, [0, 0, 0]); assert.deepEqual(r[0].max, [10, 5, 1]);
  assert.deepEqual(r[1].min, [100, 2, 3]); assert.deepEqual(r[1].max, [101, 9, 4]);
  assert.deepEqual(plain(S.splitRanges(pos, idx, 2)).map(c => [c.start, c.count]), [[0, 6], [6, 3]]);
});

test("mergeRuns joins contiguous ranges and closes the smallest gaps down to the slot cap", () => {
  const S = shaders(), out = [];
  const c = (start, count) => ({ start, count });
  // visible out of order; 0-3 and 3-6 touch; gaps 6->9 (3), 12->30 (18), 33->34 (1)
  const vis = [c(30, 3), c(0, 3), c(9, 3), c(3, 3), c(34, 3)];
  assert.equal(S.mergeRuns(vis, vis.length, 4, out), 4);
  assert.deepEqual(out.slice(0, 8), [0, 6, 9, 3, 30, 3, 33 + 1, 3]);
  assert.equal(S.mergeRuns(vis, vis.length, 2, out), 2);
  assert.deepEqual(out.slice(0, 4), [0, 12, 30, 7]);   // a merged run draws the gap: a superset, never a hole
  assert.equal(S.mergeRuns(vis, 0, 4, out), 0);
});

function preparationHarness(settings = {}, fmt24 = true, extra = {}) {
  const ctx = vm.createContext({window:{},performance,setTimeout,clearTimeout,Frustum:{},
    Float32Array,Float64Array,Uint32Array,Uint16Array,Uint8Array,Int16Array,Int32Array,
    localStorage:{getItem:k=>settings[k] ?? null}, ...extra});
  seedLog(ctx);
  vm.runInContext(CHUNK_BINS,ctx,{filename:absSrc("js/render/shared/chunk-bins.js")});
  vm.runInContext(fs.readFileSync(SRC,"utf8"),ctx,{filename:absSrc("js/render/three/tlx-chunked.js")});
  const S=ctx.window.TLXShaders;
  return {ctx,S,config:S.chunkPrepareConfig(fmt24),sys:S.chunked(THREE,{isWebGPU:()=>fmt24})};
}
const meshSnapshot = mesh => ({
  attributes:Object.fromEntries(Object.entries(mesh.geo.attributes).map(([k,a])=>[k,{type:a.array.constructor.name,size:a.itemSize,normalized:a.normalized,half:!!a.isFloat16BufferAttribute,values:Array.from(a.array)}])),
  count:mesh.count,cellSize:mesh.cellSize,lampCells:mesh.lampCells,
  chunks:mesh.chunks && Array.from(mesh.chunks,c=>({idx:Array.from(c.geo.index.array),type:c.geo.index.array.constructor.name,min:c.min,max:c.max,gx:c.gx,gz:c.gz})),
  idx:mesh.chunks ? null : Array.from(mesh.geo.index.array),
});
for (const fmt24 of [false,true]) for (const pack of ["0","1"]) for (const pad4 of ["0","1"]) {
  test(`prepared transfer preserves attributes, indices, lamp cells and bounds fmt24=${fmt24} pack=${pack} pad4=${pad4}`,()=>{
    const h=preparationHarness({"apex26.tlxPack":pack,"apex26.tlxPad4":pad4});
    const config=h.S.chunkPrepareConfig(fmt24), sys=h.S.chunked(THREE,{isWebGPU:()=>fmt24});
    const data=gridMesh(),n=data.pos.length/3;
    data.nrm=Float64Array.from({length:n*3},(_,i)=>i%3===1?1.00009:0);
    data.col=Float64Array.from({length:n*3},(_,i)=>i%19===0?3.4:(i%8)/8);
    data.mat=Float64Array.from({length:n},(_,i)=>i%2?15.4:300);
    const original=structuredClone(data),sync=sys.build({...structuredClone(data),_keepPositions:true},72);
    const payload=h.S.prepareChunks(data,72,config);
    assert.deepEqual(data,original,"pure CPU preparation does not discard raw channels");
    // Real structured clone removes descriptor prototypes just as postMessage does.
    const clone=structuredClone(payload),transferred=sys.build({...structuredClone(data),_tlxPrepared:clone,_keepPositions:true},72);
    assert.equal(JSON.stringify(meshSnapshot(transferred)),JSON.stringify(meshSnapshot(sync)));
  });
}

test("cooperative old-worker fallback yields during a single record, and canceled ownership allocates no THREE geometry",async()=>{
  let frames=0,live=true,uploads=0;
  const h=preparationHarness({},true,{requestAnimationFrame(fn){frames++;live=false;queueMicrotask(fn);},
    TrackSurface:{profile:()=>({})},Log:{info(){},warn(){}}});
  vm.runInContext(fs.readFileSync(new URL("../../js/track/build-client.js",import.meta.url),"utf8").replace(/^const\b/gm,"var"),h.ctx,{filename:absSrc("js/track/build-client.js")});
  const data=gridMesh(),msg={track:{meshes:{props:{__rec:0}},buildProfile:[]},recs:[{op:"chunked",args:[data,72]}],ms:100};
  const gfx={trackPrepareConfig:()=>h.config,createChunkedMesh(){uploads++;return {};}};
  assert.equal(await h.ctx.TrackBuildClient.replay(msg,{id:"fixture"},gfx,0.001,()=>live),null);
  assert.equal(frames,1,"fallback yields before finishing one record");
  assert.equal(uploads,0,"cancel is checked before accepting/finalizing prepared data");
  assert.equal(data._tlxPrepared,undefined);
});

test("unsupported prepared versions and changed backend settings use cooperative raw fallback",async()=>{
  for (const mismatch of ["version","config"]) {
    let frames=0;
    const h=preparationHarness({},true,{requestAnimationFrame(fn){frames++;queueMicrotask(fn);},TrackSurface:{profile:()=>({})}});
    vm.runInContext(fs.readFileSync(new URL("../../js/track/build-client.js",import.meta.url),"utf8").replace(/^const\b/gm,"var"),h.ctx,{filename:absSrc("js/track/build-client.js")});
    const data=gridMesh(),prepared=h.S.prepareChunks(data,72,h.config);
    if(mismatch==="version")prepared.version=2;else prepared.config={...h.config,fmt24:false};
    // Corrupt the refused payload, proving it was not used for finalization.
    prepared.attributes.position.array=new Float32Array(0);
    const msg={track:{meshes:{props:{__rec:0}},buildProfile:[]},recs:[{op:"chunked",args:[data,72],prepared}],ms:100};
    const built=await h.ctx.TrackBuildClient.replay(msg,{id:"fixture"},{trackPrepareConfig:()=>h.config,createChunkedMesh:(...args)=>h.sys.build(...args)},0.001);
    assert.ok(frames>1);
    assert.equal(built.meshes.props.geo.attributes.position.array.length,gridMesh().pos.length);
    assert.ok(built.buildProfile.find(r=>r.n==="replay prepare").ms>=0);
  }
});

test("THREE finalization disposes partially allocated geometries on failure",()=>{
  const h=preparationHarness({"apex26.tlxChunkMerge":"1"}),made=[],released=[];
  class FailingGeometry extends BufferGeometry {
    constructor(){super();made.push(this);}
    setIndex(a){if(made.length===2)throw new Error("index rejected");super.setIndex(a);}
  }
  const sys=h.S.chunked({...THREE,BufferGeometry:FailingGeometry},{isWebGPU:()=>true,releaseGeometry:g=>released.push(g)});
  assert.throws(()=>sys.build(gridMesh(),72),/index rejected/);
  assert.equal(made.length,2);assert.deepEqual(released,made);assert.ok(made.every(g=>g.disposals===1));
});

test("prepared canceled owner releases payload before any THREE allocation",async()=>{
  const h=preparationHarness({},true,{TrackSurface:{profile:()=>({})}});
  vm.runInContext(fs.readFileSync(new URL("../../js/track/build-client.js",import.meta.url),"utf8").replace(/^const\b/gm,"var"),h.ctx,{filename:absSrc("js/track/build-client.js")});
  const data=gridMesh(),prepared=h.S.prepareChunks(data,72,h.config),r={op:"chunked",args:[data,72],prepared};
  let uploads=0;
  const msg={track:{meshes:{props:{__rec:0}},buildProfile:[]},recs:[r],ms:100};
  assert.equal(await h.ctx.TrackBuildClient.replay(msg,{id:"fixture"},{trackPrepareConfig:()=>h.config,createChunkedMesh(){uploads++;}},8,()=>false),null);
  assert.equal(uploads,0);assert.equal(r.prepared,null);
});

test("chunk preparation configuration preserves per-instance merge setting",()=>{
  const settings={"apex26.tlxChunkMerge":"2"},h=preparationHarness(settings,true);
  settings["apex26.tlxChunkMerge"]="4";
  assert.equal(h.sys.prepareConfig().merge,2);
  assert.equal(h.S.chunkPrepareConfig(true).merge,4,"a new subsystem may capture the new setting");
});

test("accepted worker preparation carries packing diagnostics without repeating the CPU work",()=>{
  const worker=preparationHarness(),page=preparationHarness(),data=gridMesh();
  const prepared=structuredClone(worker.S.prepareChunks(data,72,worker.config));
  prepared.workerPacking=true;
  const before=page.S.packStats.zero;
  page.sys.build({...data,_tlxPrepared:prepared},72);
  assert.equal(page.S.packStats.zero-before,3,"three absent channels were prepared off-thread and reported on the page");
  assert.equal(prepared.workerPacking,undefined,"accepted diagnostics transfer once");
});

function retainedSourceFixture(chunked, keepFull, keepPositions) {
  const data=gridMesh(),vertices=data.pos.length/3;
  data.nrm=new Float32Array(data.pos.length).fill(0.5);
  data.col=new Float32Array(data.pos.length).fill(0.25);
  data.mat=new Float32Array(vertices).fill(3);
  data.trk=new Float32Array(data.pos.length);
  if (!chunked) data.idx=data.idx.subarray(0,3);
  if (keepFull!==undefined) data._keepFullGeometry=keepFull;
  if (keepPositions!==undefined) data._keepPositions=keepPositions;
  return data;
}

for (const chunked of [false,true]) for (const keepFull of [false,true,undefined]) for (const keepPositions of [false,true,undefined]) {
  test(`synchronous source retention matches legacy points chunked=${chunked} full=${keepFull} positions=${keepPositions}`,()=>{
    const h=preparationHarness(),data=retainedSourceFixture(chunked,keepFull,keepPositions),original={...data};
    const dropAttributes=chunked && keepFull===false,dropPositions=chunked && !keepPositions;
    let binned=false,allocated=0;
    const binSteps=h.ctx.ChunkBins.binSteps;
    h.ctx.ChunkBins={...h.ctx.ChunkBins,*binSteps(...args){
      binned=true;
      for(const key of ["nrm","col","mat","trk"]) assert.equal(data[key],dropAttributes?null:original[key],key+" is released before binning only when permitted");
      assert.equal(data.pos,original.pos,"positions stay available until binning completes");
      assert.equal(data.idx,original.idx);
      return yield* binSteps(...args);
    }};
    class ObservingGeometry extends BufferGeometry {
      constructor(){super();allocated++;
        assert.equal(data.pos,dropPositions?null:original.pos,"unretained positions release before THREE allocation");
        assert.equal(data.idx,dropPositions?null:original.idx);
      }
    }
    const sys=h.S.chunked({...THREE,BufferGeometry:ObservingGeometry},{isWebGPU:()=>true});
    const mesh=sys.build(data,72);
    assert.ok(allocated>0);assert.equal(binned,chunked);
    for(const key of ["nrm","col","mat","trk"]) assert.equal(data[key],dropAttributes?null:original[key]);
    assert.equal(data.pos,dropPositions?null:original.pos);assert.equal(data.idx,dropPositions?null:original.idx);
    assert.equal(mesh.count,original.idx.length);
  });
}

test("worker and cooperative preparation preserve keep-flagged raw inputs on success and failure",()=>{
  for(const cooperative of [false,true]) for(const fail of [false,true]) {
    const h=preparationHarness(),data=retainedSourceFixture(true,false,false),original={...data},failure=new Error("binning failed");
    if(fail)h.ctx.ChunkBins={...h.ctx.ChunkBins,*binSteps(){throw failure;}};
    const run=()=>{
      if(!cooperative)return h.S.prepareChunks(data,72,h.config);
      const steps=h.S.prepareChunksSteps(data,72,h.config);let next;
      do{next=steps.next();}while(!next.done);
      return next.value;
    };
    if(fail)assert.throws(run,err=>err===failure);else assert.ok(run().chunks.length>0);
    for(const key of ["pos","idx","nrm","col","mat","trk"])assert.equal(data[key],original[key],key+" stays available for a safe fallback");
  }
});

test("failed synchronous preparation clears refused payload and follows legacy pre-bin release without THREE allocations",()=>{
  for(const keepFull of [false,true]) {
    const h=preparationHarness(),data=retainedSourceFixture(true,keepFull,false),original={...data},failure=new Error("binning failed");
    data._tlxPrepared={version:2,config:h.config,attributes:{position:{array:new Float32Array(1000)}}};
    h.ctx.ChunkBins={...h.ctx.ChunkBins,*binSteps(){throw failure;}};
    let allocated=0;
    class NeverGeometry extends BufferGeometry{constructor(){super();allocated++;}}
    const sys=h.S.chunked({...THREE,BufferGeometry:NeverGeometry},{isWebGPU:()=>true});
    assert.throws(()=>sys.build(data,72),err=>err===failure);
    assert.equal(allocated,0,"CPU preparation failed before transferring ownership to THREE");
    assert.equal(data._tlxPrepared,undefined,"a refused payload must not remain attached after a failed fallback");
    for(const key of ["nrm","col","mat","trk"])assert.equal(data[key],keepFull?original[key]:null);
    assert.equal(data.pos,original.pos,"failed binning has not reached the position-release point");
    assert.equal(data.idx,original.idx);
  }
});

function visChunk(idx, min, max) {
  return {
    min, max,
    geo: {
      attributes: { position: { array: new Float32Array(9), itemSize: 3 } },
      index: { array: idx, count: idx.length, itemSize: 1 },
      dispose() {},
    },
  };
}

test("mergeVisible concatenates chunk indices once and reuses the geometry while the set holds", () => {
  const released = [];
  const sys = factory(released);
  const a = visChunk(new Uint16Array([0, 1, 2]), [0, 0, 0], [1, 1, 1]);
  const b = visChunk(new Uint16Array([3, 4, 5]), [10, 0, 0], [12, 2, 2]);
  const mesh = { chunks: [a, b] };
  sys.visList[0] = a; sys.visList[1] = b;
  const g = sys.mergeVisible(mesh, 2, 0);
  assert.ok(g, "two visible chunks become one geometry");
  assert.deepEqual(Array.from(g.index.array.subarray(0, g.drawRange.count)), [0, 1, 2, 3, 4, 5]);
  assert.equal(g.drawRange.count, 6);
  assert.equal(g.index.updateRanges.length, 0, "a new attribute queues no range: three's create uploads it whole");
  assert.ok(g.boundingSphere.radius > 5, "the sphere covers both chunk boxes");
  assert.equal(g.attributes.position, a.geo.attributes.position, "vertex attributes stay shared");
  g.index.needsUpdate = false;
  assert.equal(sys.mergeVisible(mesh, 2, 0), g, "the same visible set returns the cached geometry");
  assert.equal(g.index.needsUpdate, false, "a cache hit does not re-upload the index");
  const other = sys.mergeVisible(mesh, 2, 1);
  assert.notEqual(other, g, "the mirror pass keeps its own geometry");
  assert.equal(sys.mergeVisible(mesh, 2, 0), g, "the main slot is unchanged by the mirror merge");
  assert.equal(sys.mergeVisible(mesh, 1, 0), null, "a single chunk stays on its own geometry");
  sys.free(mesh);
  assert.equal(mesh.chunks, null, "free still drops the chunk list");
  assert.equal(g.disposals, 1);
  assert.equal(g.attributes.position, undefined, "free does not keep the shared vertex attribute on the merged geometry");
  assert.equal(released.length, 4, "both merge geometries and both chunk geometries are released");
  let sawMerge = 0;
  for (let i = 0; i < released.length; i++) if (released[i] === g || released[i] === other) sawMerge++;
  assert.equal(sawMerge, 2, "both merge geometries are released, not only disposed");
});

// Perf hunt 7 (census 41021778161): the merged index was 82 KB/f of TLX WebGPU's uploads, with a 1.18 MB
// createBuffer mid-race. `upload` stands in for three: it copies the queued ranges (or the whole array on a fresh
// attribute) into a GPU mirror and clears the ranges, as both backends do.
test("mergeVisible grows by half, uploads only the chunks that changed, and keeps a range three never uploaded", () => {
  const sys = factory([]);
  const ch = [0, 1, 2, 3, 4].map((k) => visChunk(new Uint16Array([3 * k, 3 * k + 1, 3 * k + 2]), [k, 0, 0], [k + 1, 1, 1]));
  const mesh = { chunks: ch };
  let gpu = null, gpuOf = null, fresh = 0;
  const upload = (g) => {
    const a = g.index;
    if (a !== gpuOf) { gpuOf = a; gpu = new Uint16Array(a.array.length); gpu.set(a.array); fresh++; a.updateRanges.length = 0; a.needsUpdate = false; return; }
    for (const r of a.updateRanges) gpu.set(a.array.subarray(r.start, r.start + r.count), r.start);
    a.updateRanges.length = 0; a.needsUpdate = false;
  };
  const merge = (ids) => { ids.forEach((k, i) => { sys.visList[i] = ch[k]; }); return sys.mergeVisible(mesh, ids.length, 0); };
  const drawn = (g) => Array.from(gpu.subarray(g.drawRange.start, g.drawRange.start + g.drawRange.count));
  const want = (ids) => ids.flatMap((k) => [3 * k, 3 * k + 1, 3 * k + 2]);

  let g = merge([0, 1]); upload(g);
  assert.deepEqual(drawn(g), want([0, 1]));
  g = merge([0, 2]);
  assert.deepEqual([g.index.updateRanges[0].start, g.index.updateRanges[0].count], [3, 3], "chunk 0 kept its bytes: only chunk 2 uploads");
  upload(g); assert.deepEqual(drawn(g), want([0, 2]));
  g = merge([0]);   // n = 1: no merge geometry
  assert.equal(g, null);
  g = merge([0, 2, 3]); upload(g);
  assert.deepEqual(drawn(g), want([0, 2, 3]));
  assert.equal(fresh, 1, "6 -> 9 indices fits the 1.5 x 6 = 9 taken at creation: no regrow");
  g = merge([0, 2]);
  assert.equal(g.index.needsUpdate, false, "a set that only lost its tail moves the draw range alone");
  assert.deepEqual(drawn(g), want([0, 2]));
  // A change the pass never drew (no upload), then another: the second range must cover the first.
  merge([1, 2]);
  g = merge([1, 3]);
  assert.deepEqual(g.index.updateRanges.map((r) => [r.start, r.count]), [[0, 3], [3, 3]], "the queued range from [1,2] is still owed");
  upload(g); assert.deepEqual(drawn(g), want([1, 3]));
  g = merge([0, 1, 2, 3, 4]); upload(g);
  assert.deepEqual(drawn(g), want([0, 1, 2, 3, 4]));
  assert.equal(g.index.array.length, 15, "capped at the mesh's whole index (15), never past it");
  assert.equal(fresh, 2, "9 -> 15: one regrow");
});

// GPU hunt 3 (#4272 item 3; census 41030658536): with the range starting at the first change, a head chunk
// leaving or entering re-sent the whole set (200-920 KB rows). `bytes` mirrors the vendor's Uint16 path: one
// writeBuffer per queued range, widened to whole 4-byte pairs; a fresh attribute uploads its whole array.
test("mergeVisible: the set sliding along the arc by one chunk uploads that chunk, not the set after it", () => {
  const sys = factory([]);
  const C = 40, T = 600, W = 20;   // chunks, triangles each, visible window
  const ch = Array.from({ length: C }, (_, k) => {
    const idx = new Uint16Array(3 * T);
    for (let i = 0; i < idx.length; i++) idx[i] = (k * 1543 + i * 7) % 60000;
    return visChunk(idx, [k, 0, 0], [k + 1, 1, 1]);
  });
  const mesh = { chunks: ch };
  let gpu = null, gpuOf = null, bytes = 0;
  const upload = (g) => {
    const a = g.index;
    if (a !== gpuOf) { gpuOf = a; gpu = Uint16Array.from(a.array); bytes += a.array.byteLength; }
    else for (const r of a.updateRanges) {
      const lo = r.start & ~1, hi = (r.start + r.count + 1) & ~1;
      gpu.set(a.array.subarray(lo, hi), lo); bytes += 2 * (hi - lo);
    }
    a.updateRanges.length = 0; a.needsUpdate = false;
  };
  const step = (lo, hi) => {
    let n = 0;
    for (let k = lo; k < hi; k++) sys.visList[n++] = ch[k];
    const g = sys.mergeVisible(mesh, n, 0), b0 = bytes;
    upload(g);
    const want = [];
    for (let k = lo; k < hi; k++) want.push(...ch[k].geo.index.array);
    assert.deepEqual(Array.from(gpu.subarray(g.drawRange.start, g.drawRange.start + g.drawRange.count)), want,
      `the GPU copy draws exactly chunks ${lo}..${hi - 1}, in record order`);
    return bytes - b0;
  };
  const chunkB = 2 * 3 * T, setB = W * chunkB;   // 3600 B, 72000 B
  step(5, 5 + W);
  assert.equal(step(6, 6 + W), chunkB, "head leaves, chunk 25 enters: one chunk (the old rule: all 72000 B)");
  assert.equal(step(5, 5 + W), 0, "the head returns while still resident: nothing uploads");
  assert.equal(step(4, 4 + W), chunkB, "a head chunk never held: that chunk alone");
  // A steady drive: 16 one-chunk steps. Each rewrite restarts the set at the far end of its 1.5x slack.
  let drive = 0;
  for (let k = 5; k <= 20; k++) drive += step(k, k + W);  assert.ok(drive <= 16 * chunkB + 2 * setB, `16 steps uploaded ${drive} B, the old rule ${16 * setB} B`);
});
