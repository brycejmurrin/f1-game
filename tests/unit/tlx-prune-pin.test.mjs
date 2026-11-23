// TLX's mesh-pool prune must keep a PINNED geometry's wrappers (#3677, A·W45).
//
// WHY THIS EXISTS. prunePool drops every pooled wrapper unseen for
// PRUNE_IDLE_MS (20 s), and dropWrapper's "dispose" event lets three release
// the wrapper's RenderObject; when that was a pipeline's last holder, three
// DESTROYS the pipeline and its program (Pipelines._releasePipeline /
// _releaseProgram). The cockpit ERS bar, armed OT lamp and ERS strip draw only
// while ERS deploys, so at a normal straight-to-straight BOOST cadence every
// press found its wrappers pruned and rebuilt their pipelines mid-race:
// ers-deploy-census --presses --gap 25 counted pipes=10 on a press 25 s after
// the last deploy. Bryce, iPhone, three.js WebGPU: "every press, a hitch".
//
// gfx.pinMesh(handle) marks such a geometry; this lifts the real prunePool out
// of js/render/three/tlx.js and asserts the pinned wrapper survives the prune
// while an unpinned idle one is still dropped (the prune's memory job).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fnSource } from "../helpers/fn-source.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/render/three/tlx.js"), "utf8");

/** Lift PRUNE_* and prunePool with the four closure names it reads. */
function liftPrune() {
  const start = SRC.indexOf("const PRUNE_EVERY_MS");
  assert.notEqual(start, -1, "PRUNE_EVERY_MS moved — update this test, do not delete it");
  const end = SRC.indexOf("\n      }\n", SRC.indexOf("function prunePool(now)", start));
  assert.notEqual(end, -1, "prunePool not found after PRUNE_EVERY_MS");
  const body = SRC.slice(start, end + 8);
  // eslint-disable-next-line no-new-func
  return new Function("meshPool", "meshByGeo", "dropWrapper",
    `"use strict"; let _pruneLast = -1e9; ${body}; return { prunePool, PRUNE_IDLE_MS };`);
}

function pool() {
  const meshPool = [], meshByGeo = new Map(), dropped = [];
  const add = (geo, mat, seen) => {
    const m = { geometry: geo, material: mat, __tlxSeen: seen };
    let byMat = meshByGeo.get(geo);
    if (!byMat) meshByGeo.set(geo, byMat = new Map());
    let list = byMat.get(mat);
    if (!list) byMat.set(mat, list = []);
    list.push(m); meshPool.push(m);
    return m;
  };
  const { prunePool, PRUNE_IDLE_MS } = liftPrune()(meshPool, meshByGeo, (m) => dropped.push(m));
  return { meshPool, meshByGeo, dropped, add, prunePool, PRUNE_IDLE_MS };
}

test("an idle wrapper of a pinned geometry survives the prune; an unpinned idle one does not", () => {
  const P = pool();
  const now = 100000, idle = now - P.PRUNE_IDLE_MS - 1;
  const ersBar = { __tlxPin: true }, track = {}, live = {};
  const keep = P.add(ersBar, "rigFxA", idle);
  const gone = P.add(track, "road", idle);
  const fresh = P.add(live, "body", now - 10);
  P.prunePool(now);
  assert.deepEqual(P.dropped, [gone], "only the unpinned idle wrapper is dropped");
  assert.deepEqual(P.meshPool, [keep, fresh], "the pinned and the fresh wrapper stay pooled");
  assert.ok(P.meshByGeo.get(ersBar).get("rigFxA").includes(keep), "the pinned wrapper is still found by acquireMesh's (geo, mat) lookup");
  assert.equal(P.meshByGeo.has(track), false, "the dropped geometry's map entry goes with it");
});

test("a pinned wrapper survives every prune, not just the first", () => {
  const P = pool();
  const ersStrip = { __tlxPin: true };
  const keep = P.add(ersStrip, "ersLight", 0);
  for (let t = 1; t <= 6; t++) P.prunePool(t * 30000);   // three minutes of BOOST off
  assert.deepEqual(P.dropped, []);
  assert.deepEqual(P.meshPool, [keep]);
});

test("TLX exports pinMesh and car-draw pins the deploy-only draws through the feature-detected hook", () => {
  const tlx = SRC.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  assert.ok(/pinMesh\(m\) \{[^}]*__tlxPin = true/.test(tlx), "tlx.js pinMesh sets the geometry's __tlxPin");
  const cd = fs.readFileSync(path.join(ROOT, "js/car/car-draw.js"), "utf8");
  for (const g of ["getErsBar()", "getOtLamp(true)", "CarMesh.getErsLight()"])
    assert.ok(cd.includes(`pin(${g})`), `car-draw pins ${g}`);
  for (const builder of ["ensureStream", "ensureGlowStream", "wrapStream"])
    assert.ok(fnSource(tlx, `function ${builder}(`).includes("geo.__tlxPin = true;"), `${builder} pins its geometry`);
  const cm = fs.readFileSync(path.join(ROOT, "js/car/car-mesh.js"), "utf8");
  assert.ok(cm.includes("_gfx.pinMesh(_rearLightSet)"), "car-mesh pins the rear-light set (the 2026 ERS light code's flash)");
});

// #5387: a wrapper's render object (object UBO + bind group) is re-minted on its next draw once the prune drops it.
// At 20 s idle every lap re-minted the scenery the last lap drew (lap census run 42941313887: spa lap 2 minted 286
// wrappers, monaco lap 2 pruned 321). The idle limit must outlast the longest lap: Spa took 126 s at the census pace.
test("a scenery wrapper unseen for one lap survives the prune; one idle past the limit is still dropped", () => {
  const P = pool();
  const LONGEST_LAP_MS = 130000;
  const now = 1000000;
  const lapAgo = P.add({}, "kerb", now - LONGEST_LAP_MS);
  const stale = P.add({}, "freedDecal", now - P.PRUNE_IDLE_MS - 1);
  P.prunePool(now);
  assert.equal(P.PRUNE_IDLE_MS, 600000, "PRUNE_IDLE_MS is Bryce's 600 s (#5387)");
  assert.deepEqual(P.dropped, [stale], "only the wrapper idle past PRUNE_IDLE_MS is dropped");
  assert.deepEqual(P.meshPool, [lapAgo], "the wrapper last drawn one lap ago keeps its render object");
});

// #5387: a chunked record's main-pass merge slot (and its wrapper's render object) was made the first time the record
// had 2+ visible chunks, so a record that first merged mid-lap minted them there. On the prime frame, every record
// still without a slot gets one from its first two chunks, acquired once at a zero matrix; nothing else is touched.
test("_primeMergeSlot builds a missing main-pass merge slot from two chunks and acquires it at a zero matrix", () => {
  const body = fnSource(SRC, "function _primeMergeSlot(rec, order) {");
  const zAt = SRC.indexOf("const _chunkPrimeZ = new Float32Array(16);");
  assert.notEqual(zAt, -1, "the zero matrix moved: update this test, do not delete it");
  const merges = [], acquired = [];
  const chunkedSys = { visList: [], mergeVisible(mesh, n, slot) { merges.push({ n, slot, vis: chunkedSys.visList.slice(0, n) }); return { mergedOf: mesh }; } };
  const run = new Function("chunkedSys", "acquireMesh", `"use strict"; let _chunkPrimeN = 0; const _chunkPrimeZ = new Float32Array(16); ${body}; return { prime: _primeMergeSlot, count: () => _chunkPrimeN };`)(
    chunkedSys, (g, m, mat) => { const w = { g, zero: Array.from(m).every((x) => x === 0), mat }; acquired.push(w); return w; });
  const opaque = {}, chunks = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.equal(run.prime({ chunked: { chunks }, mat: opaque, al: 1 }, 7), true, "a record with no slot is primed");
  assert.deepEqual(merges, [{ n: 2, slot: 0, vis: [chunks[0], chunks[1]] }], "from its first two chunks, main-pass slot 0");
  assert.equal(acquired.length, 1); assert.equal(acquired[0].zero, true, "acquired once at the zero matrix"); assert.equal(acquired[0].mat, opaque); assert.equal(acquired[0].renderOrder, 7, "at the record's own order");
  // Not primed: an existing slot, a single chunk, or a draw the merge path never takes (transparent, no depth write, alpha).
  assert.equal(run.prime({ chunked: { chunks, _tlxMv: [{ geo: {} }] }, mat: opaque, al: 1 }), false, "a record that already has its slot");
  assert.equal(run.prime({ chunked: { chunks: [chunks[0]] }, mat: opaque, al: 1 }), false, "a one-chunk record never merges");
  assert.equal(run.prime({ chunked: { chunks }, mat: { transparent: true }, al: 1 }), false, "transparent: the merge path skips it");
  assert.equal(run.prime({ chunked: { chunks }, mat: { depthWrite: false }, al: 1 }), false, "no depth write: skipped too");
  assert.equal(run.prime({ chunked: { chunks }, mat: opaque, al: 0.5 }), false, "alpha < 1: skipped too");
  assert.equal(run.count(), 1);
  const tlx = SRC.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  assert.ok(/if \(_chunkPrimeNow && slot === 0 && _chunkMerge && chunkedSys\.mergeVisible\) _primeMergeSlot\(rec, order\);/.test(tlx), "_drawChunked primes on the main pass only");
  assert.ok(/_chunkPrimeNow = _chunkPrime; _chunkPrime = false;/.test(tlx), "for one present only");
});
