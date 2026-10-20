/* tlx-warm-chunks.test.mjs — the program warm's frame holds EVERY chunk, not only
 * the ones the frame's cull kept (js/render/three/tlx.js present(), "EVERY CHUNK
 * INTO THE WARM'S FRAME"). The real block is cut out of tlx.js and run against
 * stub pool state, so the test reads the shipped code, not a copy.
 *
 * Why: the pool held only visible chunks, so compileAsync and the draw warm built
 * those alone, and a chunk first in view mid-lap linked its program (and made its
 * bindings) on the race's main thread — TLX-WebGL2 census 39510807053 /
 * 39510922959: a 19.8 s (spa) and 156 s (singapore) LINK_STATUS.
 *
 * Run: node --test tests/unit/tlx-warm-chunks.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/render/three/tlx.js"), "utf8");

function block() {
  const a = SRC.indexOf("// EVERY CHUNK INTO THE WARM'S FRAME.");
  assert.ok(a > 0, "the block's marker is in tlx.js");
  const b = SRC.indexOf("_poolShow();", a);
  assert.ok(b > a, "the block ends at present()'s _poolShow()");
  return SRC.slice(a, b);
}

// A frame: two chunked records (one with a chunk the cull kept) and a plain one.
function run({ warmRequested = true, pending = null, lost = false, on = true } = {}) {
  const batch = 7;
  const chunk = (id, drawn) => ({ geo: { id, __tlxDrawnBatch: drawn ? batch : batch - 1 } });
  const road = { chunked: { chunks: [chunk("r0", true), chunk("r1"), chunk("r2")] }, m: null, mat: "road" };
  const plain = { geo: { id: "p" }, m: null, mat: "box" };
  const grass = { chunked: { chunks: [chunk("g0"), chunk("g1")] }, m: null, mat: "grass" };
  const drawList = [road, plain, grass]; drawList.n = 3;
  const acquired = [];
  const ctx = {
    drawList, _poolBatch: batch, _warmRequested: warmRequested, _warmPending: pending, _deviceLost: lost,
    _warmChunksOn: on, _warmStages: { allChunks: null },
    acquireMesh(geo, m, mat, rec) { acquired.push({ geo: geo.id, mat, rec }); geo.__tlxDrawnBatch = batch; return {}; },
  };
  vm.runInNewContext(block(), ctx);
  return { acquired, stages: ctx._warmStages, road, grass };
}

test("the warm's frame acquires every off-view chunk once, with its record's material", () => {
  const r = run();
  assert.deepEqual(r.acquired.map((a) => a.geo), ["r1", "r2", "g0", "g1"], "r0 was already acquired by the cull; the plain record is not chunked");
  assert.deepEqual(r.acquired.map((a) => a.mat), ["road", "road", "grass", "grass"]);
  assert.ok(r.acquired.every((a) => a.rec === (a.mat === "road" ? r.road : r.grass)), "each chunk is acquired as its own record's draw");
  assert.equal(r.stages.allChunks, 4, "memState().warm.allChunks reports how many the warm added");
});

test("no warm requested, a warm in flight, a lost device or the knob off: the frame stays as culled", () => {
  for (const opts of [{ warmRequested: false }, { pending: Promise.resolve() }, { lost: true }, { on: false }]) {
    const r = run(opts);
    assert.equal(r.acquired.length, 0, JSON.stringify(opts));
    assert.equal(r.stages.allChunks, null);
  }
});

test("the block runs before the warm starts, in the same present()", () => {
  const a = SRC.indexOf("// EVERY CHUNK INTO THE WARM'S FRAME.");
  const start = SRC.indexOf("if (_warmRequested) startProgramWarm(opts)", a);
  assert.ok(start > a && start - a < 2500, "startProgramWarm follows the block in the same frame");
  assert.match(SRC, /apex26\.tlxWarmChunks/, "the A/B knob exists");
  assert.match(SRC, /allChunks: _warmStages\.allChunks/, "memState reports it");
});
