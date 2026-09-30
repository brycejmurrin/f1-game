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
