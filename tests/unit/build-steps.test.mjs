// Tracks.buildSteps: the build as a generator, so game.js can run it a few ms per
// animation frame while the pre-race garage drive-out keeps animating. Its whole
// promise is that stepping it changes NOTHING: build() drives the same generator
// straight through, and a stepped drive — with unrelated work between the steps —
// must upload byte-identical buffers and leave identical physics arrays.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createBuildRecorder, physics } from "../helpers/track-build-oracle.mjs";
const require = createRequire(import.meta.url);
const { buildContext } = require("../../tools/track/verify-track.cjs");

const Tracks = buildContext(null, { quiet: true });
// buildPaced waits between slices on requestAnimationFrame, else setTimeout: give the sandbox a timer, as a page has.
Tracks._vmContext.setTimeout = setTimeout;

// A gfx that records every upload in order, hashing its buffers.
function recorder() {
  return createBuildRecorder({
    channels: ["pos", "nrm", "col", "idx", "mat"],
    releaseChunkPositions: false,
    chunkedHandle: "plain",
  });
}

// Fixed synthetic fingerprints keep the shared comparison oracle from making
// two equally broken build paths look equivalent. Expected hashes predate it.
test("track-build oracle preserves channel fingerprints, modes and ownership", () => {
  const channels = ["pos", "nrm", "col", "idx", "mat", "trk"];
  const worker = () => createBuildRecorder({ channels, releaseChunkPositions: true, chunkedHandle: "chunks" });
  const geometry = () => Object.fromEntries(channels.map((key, i) => [key, [i + 1]]));
  const row = "1 3eafb06982d26cb8 8f688ce4f0389109 c35a2a47490059fc 7e3647e6e4dffb0e f86f0aa72b960ca2 105d24a1ea5b0186";
  const a = worker(), g = geometry();
  assert.deepEqual(a.gfx.createMesh(g), { kind: "mesh" });
  assert.equal(a.log[0], "mesh " + row + " ");
  assert.deepEqual(a.gfx.createChunkedMesh(g, 24), { kind: "chunked", chunks: [1] });
  assert.equal(a.log[1], "chunked " + row + " cell=24", "hash before releasing CPU channels");
  assert.equal(g.pos, null); assert.equal(g.idx, null);
  const retained = geometry(); retained._keepPositions = true;
  a.gfx.createChunkedMesh(retained, 24);
  assert.deepEqual(retained.pos, [1]); assert.deepEqual(retained.idx, [4]);
  a.gfx.createInstancedBatch(geometry(), [7], [8]);
  assert.equal(a.log[3], "inst " + row + " 739c1dd4df44b519/ed41573109274eca");
  for (const key of channels) {
    const changed = geometry(); changed[key] = [99];
    const b = worker(); b.gfx.createMesh(changed);
    assert.notEqual(b.log[0], a.log[0], key + " contributes to the fingerprint");
  }
  const stepped = recorder(), kept = geometry();
  assert.deepEqual(stepped.gfx.createChunkedMesh(kept, 24), { kind: "chunked" });
  assert.deepEqual(kept.pos, [1]); assert.deepEqual(kept.idx, [4]);
  assert.equal(stepped.log[0], "chunked " + row.slice(0, row.lastIndexOf(" ")) + " cell=24");
  assert.deepEqual(worker().log, [], "each recorder owns its log");
  assert.deepEqual(physics({ px: [1], py: [], lineK: [8], ignored: [2] }),
    ["px:3eafb06982d26cb8", "py:da39a3ee5e6b4b0d", "lineK:ed41573109274eca"]);
});

for (const id of ["monza", "spa", "vegas"]) {
  test(`${id}: a stepped build uploads exactly what build() uploads`, () => {
    const def = Tracks.LIST.find((d) => d.id === id);
    const a = recorder();
    const tA = Tracks.build(def, { gfx: a.gfx });

    const b = recorder();
    const it = Tracks.buildSteps(def, { gfx: b.gfx });
    let steps = 0, r;
    // Unrelated work between steps (the garage frame, car assets): allocation churn
    // and a centreline-only build of another circuit, which shares the module state.
    const other = Tracks.LIST.find((d) => d.id === "monaco");
    for (;;) {
      r = it.next();
      if (r.done) break;
      steps++;
      if (steps % 4 === 0) Tracks.buildCenterline(other);
      new Array(1000).fill(steps);
    }
    const tB = r.value;

    assert.ok(steps >= 20, `the build yields at least at every lap and inside props/strip (got ${steps})`);
    assert.deepEqual(b.log, a.log, "every upload, in order, byte-identical");
    assert.deepEqual(physics(tB), physics(tA), "the physics arrays match");
    assert.equal(tB.total, tA.total);
    assert.deepEqual(tB.buildProfile.map((p) => p.n + "/" + p.k), tA.buildProfile.map((p) => p.n + "/" + p.k), "the same phases, in order");
  });
}

test("a stepped build abandoned part-way leaves the module able to build again", () => {
  const def = Tracks.LIST.find((d) => d.id === "monza");
  const it = Tracks.buildSteps(def, { gfx: recorder().gfx });
  for (let i = 0; i < 8; i++) it.next();
  it.return();   // what loadTrackStepped does when the player backs out
  const a = recorder(), b = recorder();
  Tracks.build(def, { gfx: a.gfx });
  Tracks.build(def, { gfx: b.gfx });
  assert.deepEqual(a.log, b.log, "no state leaked from the abandoned build");
});

test("buildPaced: a newer synchronous build supersedes a paced one in flight, which hands back its partial track", async () => {
  const def = Tracks.LIST.find((d) => d.id === "monaco");
  let abandoned = null, calls = 0;
  const paced = Tracks.buildPaced(def, { gfx: recorder().gfx }, () => true, (t) => { abandoned = t; calls++; }, 1);
  await new Promise((r) => setTimeout(r, 0));   // a slice or two in
  Tracks.build(def, { gfx: recorder().gfx });  // loadTrack: the synchronous build wins
  assert.equal(await paced, null, "the paced build gives up");
  assert.equal(calls, 1);
  assert.ok(abandoned && abandoned.meshes, "and passes back the track it had started, for its meshes to be freed");
  // Unhindered, it resolves the track itself.
  const whole = await Tracks.buildPaced(def, { gfx: recorder().gfx }, () => true, () => { throw new Error("not abandoned"); }, 50);
  assert.ok(whole && whole.meshes && whole.total > 0);
});

// Terrain is a CPU-only child until completion: its yields must exclude time
// spent painting, and backing out must close it before freeing earlier uploads.
test("terrain slices exclude suspended frames from the geometry profile", () => {
  const T = buildContext(null, { quiet: true });
  let clock = 0;
  T._vmContext.performance = { now: () => ++clock };
  const def = T.LIST.find((d) => d.id === "montreal");
  function measured(suspendedMs) {
    clock = 0;
    const it = T.buildSteps(def, { gfx: recorder().gfx });
    let partial = null, slices = 0;
    for (;;) {
      const r = it.next();
      assert.equal(r.done, false, "reach terrain before the complete build");
      if (r.value) partial = r.value;
      const phase = partial.buildProfile.find((p) => p.n === "terrain" && p.k === "geo");
      if (phase) { it.return(); return { ms: phase.ms, slices }; }
      if (!r.value) { slices++; clock += suspendedMs; }
    }
  }
  const active = measured(0), suspended = measured(1000);
  assert.ok(active.slices > 8, "terrain yields within both ribbons, not just at its boundary");
  assert.equal(suspended.slices, active.slices);
  assert.equal(suspended.ms, active.ms, "one-second frames never count as terrain CPU time");
});

test("return during terrain closes the child once and frees only completed uploads", async () => {
  const { readFileSync } = await import("node:fs");
  const { runInContext } = await import("node:vm");
  const base = buildContext(null, { quiet: true }), ctx = base._vmContext;
  const mesh = ctx.TrackMesh;
  let closed = 0;
  ctx.TrackMesh = Object.freeze(Object.assign({}, mesh, {
    buildTerrainSteps(track) {
      const child = mesh.buildTerrainSteps(track);
      return { next: () => child.next(), return: () => { closed++; return child.return(); } };
    },
  }));
  runInContext(readFileSync(new URL("../../js/track/tracks.js", import.meta.url), "utf8")
    .replace(/^const\b/gm, "var"), ctx);
  const T = ctx.Tracks, uploads = [], freed = [];
  const gfx = { createMesh: () => { const h = {}; uploads.push(h); return h; }, freeMesh: (h) => { if (h) freed.push(h); } };
  const def = T.LIST.find((d) => d.id === "montreal"), it = T.buildSteps(def, { gfx });
  let partial = null;
  for (;;) {
    const r = it.next();
    assert.equal(r.done, false);
    if (r.value) partial = r.value;
    else break; // First inner-terrain yield: road was uploaded, terrain was not.
  }
  assert.equal(uploads.length, 2, "only floor and road precede the terrain child");
  assert.equal(partial.terrainGeo, undefined);
  assert.equal(partial.meshes.terrain, undefined);
  it.return(); it.return();
  assert.equal(closed, 1, "forward cancellation once, even on repeated outer return");
  T.free(partial, gfx);
  assert.deepEqual(freed, uploads, "existing partial cleanup frees every earlier upload exactly once");
  const completed = T.build(def, { gfx });
  assert.ok(completed.terrainGeo && completed.meshes.terrain, "the next build still completes");
  assert.equal(closed, 1, "normal completion does not call child return");
});

// A build that THROWS (an OOM RangeError, a scenery closure fault) must free the
// uploads it had already made: the caller never receives the partial track, so
// every "PREPARATION FAILED — retry" otherwise stacked another orphaned world.
function ledger(opts) {
  const made = [], freed = [];
  const make = (kind) => { const h = { kind }; made.push(h); return h; };
  const gfx = {
    createMesh: () => make("mesh"),
    createChunkedMesh: () => make("chunked"),
    createInstancedBatch: () => make("inst"),
    freeMesh: (h) => { if (h) freed.push(h); },
    freeChunkedMesh: (h) => { if (h) freed.push(h); },
    freeInstancedBatch: (h) => { if (h) freed.push(h); },
  };
  Object.assign(gfx, opts);
  return { made, freed, gfx };
}
const liveAfter = (L) => L.made.filter((h) => !L.freed.includes(h)).map((h) => h.kind);

test("a synchronous build that throws frees every upload it made before the throw", () => {
  const def = Tracks.LIST.find((d) => d.id === "monza");
  const L = ledger();
  let n = 0;
  L.gfx.createChunkedMesh = () => { if (++n === 1) { L.made.push({ kind: "chunked" }); return L.made[L.made.length - 1]; } throw new RangeError("Array buffer allocation failed"); };
  assert.throws(() => Tracks.build(def, { gfx: L.gfx }), /allocation/);
  assert.ok(L.made.length >= 3, `floor, road and the first chunked upload landed (${L.made.length})`);
  assert.deepEqual(liveAfter(L), [], "nothing the failed build uploaded is still live");
  const again = Tracks.build(def, { gfx: ledger().gfx });
  assert.ok(again && again.meshes && again.total > 0, "the module builds again after the failure");
});

test("prop batches are owned as each lands, so a batch that throws part-way frees the earlier ones", () => {
  const def = Tracks.LIST.find((d) => d.id === "vegas");   // the roster's largest instanced set
  const probe = Tracks.build(def, { gfx: ledger().gfx });
  const nBatches = probe.meshes.propBatches ? probe.meshes.propBatches.length : 0;
  assert.ok(nBatches >= 2, `vegas uploads at least two instanced batches (${nBatches})`);
  const L = ledger();
  let k = 0;
  const inst = L.gfx.createInstancedBatch;
  L.gfx.createInstancedBatch = () => { if (++k === nBatches) throw new Error("device lost"); return inst(); };
  assert.throws(() => Tracks.build(def, { gfx: L.gfx }), /device lost/);
  assert.equal(L.made.filter((h) => h.kind === "inst").length, nBatches - 1);
  assert.deepEqual(liveAfter(L), [], "the batches that did land were freed with the rest");
});
