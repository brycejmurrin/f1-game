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
