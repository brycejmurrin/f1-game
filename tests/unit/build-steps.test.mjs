// Tracks.buildSteps: the build as a generator, so game.js can run it a few ms per
// animation frame while the pre-race garage drive-out keeps animating. Its whole
// promise is that stepping it changes NOTHING: build() drives the same generator
// straight through, and a stepped drive — with unrelated work between the steps —
// must upload byte-identical buffers and leave identical physics arrays.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
const require = createRequire(import.meta.url);
const { buildContext } = require("../../tools/track/verify-track.cjs");

const Tracks = buildContext(null, { quiet: true });
// buildPaced waits between slices on requestAnimationFrame, else setTimeout: give the sandbox a timer, as a page has.
Tracks._vmContext.setTimeout = setTimeout;

// A gfx that records every upload in order, hashing its buffers.
function recorder() {
  const log = [];
  const h = (a) => {
    const hash = createHash("sha1");
    if (a && a.length) hash.update(Buffer.from(Float64Array.from(a).buffer));
    return hash.digest("hex").slice(0, 16);
  };
  const geo = (kind, g, extra) => {
    log.push([kind, g && g.pos ? g.pos.length : 0, h(g && g.pos), h(g && g.nrm), h(g && g.col), h(g && g.idx), h(g && g.mat), extra || ""].join(" "));
    return { kind };
  };
  return {
    log,
    gfx: {
      createMesh: (g) => geo("mesh", g),
      createChunkedMesh: (g, cell) => geo("chunked", g, "cell=" + cell),
      createInstancedBatch: (g, m, c) => geo("inst", g, h(m) + "/" + h(c)),
    },
  };
}

const PHYS = ["px", "py", "pz", "hw", "barL", "barR", "lineX", "lineK"];
function physics(track) {
  return PHYS.filter((k) => track[k]).map((k) => k + ":" + createHash("sha1").update(Buffer.from(Float64Array.from(track[k]).buffer)).digest("hex").slice(0, 16));
}

for (const id of ["monza", "spa", "vegas", "montreal"]) {
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

// pace.rafEvery: under the race cover the build takes a frame every Nth slice and a 0 ms task between (the
// sandbox has no requestAnimationFrame, so a frame wait is a 16 ms timer and a task wait a 0 ms one). The
// result is the same track either way; only the waits differ.
test("buildPaced: pace.rafEvery keeps one frame wait per N slices, the rest are task yields; same uploads", async () => {
  const def = Tracks.LIST[0];
  const waits = [];
  const vmSetTimeout = Tracks._vmContext.setTimeout;
  Tracks._vmContext.setTimeout = (fn, ms) => { waits.push(ms | 0); return setTimeout(fn, 0); };
  try {
    const a = recorder(), b = recorder();
    await Tracks.buildPaced(def, { gfx: a.gfx }, () => true, () => { throw new Error("not abandoned"); }, 1);
    const plain = waits.slice(); waits.length = 0;
    await Tracks.buildPaced(def, { gfx: b.gfx }, () => true, () => { throw new Error("not abandoned"); }, 1, { rafEvery: 3 });
    const paced = waits.slice();
    assert.ok(plain.length > 6 && plain.every((ms) => ms === 16), "every wait is a frame by default (" + plain.length + ")");
    const frames = paced.filter((ms) => ms === 16).length, tasks = paced.filter((ms) => ms === 0).length;
    assert.ok(frames > 0 && tasks > 0, "both kinds of wait with rafEvery 3 (" + frames + " frames, " + tasks + " tasks)");
    assert.ok(Math.abs(frames * 2 - tasks) <= 2, "one frame per three slices: " + frames + " frames vs " + tasks + " tasks");
    for (let i = 2; i < paced.length; i += 3) assert.equal(paced[i], 16, "the third wait of each triple is the frame");
    assert.deepEqual(b.log, a.log, "the paced build uploads the same buffers in the same order");
    // A FUNCTION pace is read before every slice: the picker's build that RACE! joins moves to the cover's pace.
    waits.length = 0;
    let covered = false;
    const c = recorder();
    const p = Tracks.buildPaced(def, { gfx: c.gfx }, () => true, () => { throw new Error("not abandoned"); }, 1, () => (covered ? { rafEvery: 3 } : null));
    await new Promise((r) => setTimeout(r, 30));   // a few picker-paced slices in
    const before = waits.length;
    assert.ok(before >= 1 && waits.slice(0, before).every((ms) => ms === 16), "frame waits while uncovered (" + before + ")");
    covered = true;
    await p;
    const after = waits.slice(before);
    assert.ok(after.some((ms) => ms === 0), "task yields once the cover is up (" + after.filter((ms) => ms === 0).length + " of " + after.length + ")");
    assert.deepEqual(c.log, a.log, "same uploads either way");
  } finally { Tracks._vmContext.setTimeout = vmSetTimeout; }
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

// Perf hunt 7 (#4219): the pit complex and the hidden-face classify pass were each ONE step of the paced
// build (60-380 VM ms). They yield inside now (per wall run and bay; per 4096 triangles), so no single step that runs
// either may cost more than PIECE_BUDGET_MS of CPU. CPU time, not wall, so a busy box cannot fail it; the
// first build warms the JIT and the better of the next two counts. (The circuit's own scenery closure is
// still one step: it is a plain function of the frozen scenery(api) contract.)
const PIECE_BUDGET_MS = 45;   // ~3x the after-value (11.6-22.4 CPU ms on a loaded 4-core box; the one-step code measured 77-104)
test("montreal: no single build step running the pit complex or the hidden-face classify exceeds the budget", () => {
  const T = buildContext(null, { quiet: true }), ctx = T._vmContext;
  const HF = ctx.TrackHiddenFaces, SP = ctx.SceneryPits;
  let tag = null;
  const tagged = (opts) => Object.assign({}, opts, { groundY: (x, z) => { tag = "classify"; return opts.groundY(x, z); } });
  ctx.TrackHiddenFaces = Object.assign({}, HF, {
    strip: (geo, opts) => HF.strip(geo, tagged(opts)),
    stripSteps: HF.stripSteps && ((geo, opts) => HF.stripSteps(geo, tagged(opts))),
  });
  ctx.SceneryPits = Object.assign({}, SP, {
    build: (c) => { tag = "pits"; return SP.build(c); },
    buildSteps: SP.buildSteps && ((c) => {
      const it = SP.buildSteps(c);
      return { next: (v) => { tag = "pits"; return it.next(v); }, return: (v) => it.return(v), [Symbol.iterator]() { return this; } };
    }),
  });
  const def = T.LIST.find((d) => d.id === "montreal");
  const worst = [];
  for (let rep = 0; rep < 3; rep++) {
    const it = T.buildSteps(def, { gfx: recorder().gfx });
    const max = { classify: 0, pits: 0 };
    for (;;) {
      tag = null;
      const c0 = process.cpuUsage(), r = it.next(), d = process.cpuUsage(c0), ms = (d.user + d.system) / 1000;
      if (tag) max[tag] = Math.max(max[tag], ms);
      if (r.done) break;
    }
    assert.ok(max.classify > 0 && max.pits > 0, "both pieces ran: " + JSON.stringify(max));
    if (rep) worst.push(max);
  }
  const best = (k) => Math.min(worst[0][k], worst[1][k]);
  const seen = JSON.stringify({ classify: +best("classify").toFixed(1), pits: +best("pits").toFixed(1) });
  assert.ok(best("classify") < PIECE_BUDGET_MS, "longest classify step (CPU ms) " + seen);
  assert.ok(best("pits") < PIECE_BUDGET_MS, "longest pit-complex step (CPU ms) " + seen);
});
