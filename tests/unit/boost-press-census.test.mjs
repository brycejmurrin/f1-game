// boost-press-census — the press windows are LIVE ticks, so a press is never sampled inside a tickBody hold (#5592).
//
// The page driver (tools/perf/boost-press-census.mjs) runs here against a fake page: every poll of a wait is one
// animation frame of a fake game whose physics, like js/game.js tickBody, does not run while the renderer warms.
// Pages run 43963742824 failed "press 1 never deployed ERS" because the windows were counted in raw frames and
// 63 of them fit inside such a hold.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { frames, measureBoostPresses, PRESSES, DEPLOY_FRAMES, SPACING } from "../../tools/perf/boost-press-census.mjs";

/** A fake game: `heldFrames` animation frames run before physics does (the warm hold), then every frame is live. */
function fakeGame({ heldFrames }) {
  const g = { raf: 0, live: 0, boostOn: false, deploying: false, gas: false, rafCallbacks: [] };
  const frame = () => {
    g.raf++;
    const cbs = g.rafCallbacks; g.rafCallbacks = [];
    for (const cb of cbs) cb();
    if (g.raf <= heldFrames) return;          // tickBody's hold: the frame is real, physics is not charged
    g.live++;
    g.deploying = g.boostOn && g.gas;         // game.js: c.deploying follows boostOn on the throttle branch
  };
  const backend = { createRenderPipeline() {} };
  const win = {
    __apex: {
      race() {}, go() {},
      info: () => ({ track: "monza", state: "race", liveTicks: g.live, warming: g.raf <= heldFrames }),
      raceEntryProfile: () => ({ marks: [{ n: "begin:race" }, { n: "warm:noop" }] }),
      setEnergy() {}, setBoost(on) { g.boostOn = !!on; },
      carEffects: () => ({ ersDeploy: g.deploying }),
    },
  };
  const page = {
    addInitScript: async () => {},
    goto: async () => {},
    evaluate: async (fn, arg) => fn(arg),
    waitForFunction: async (fn, arg) => {
      for (let i = 0; i < 100000; i++) { if (fn(arg)) return; frame(); }
      throw new Error("fake page: the wait never became true");
    },
  };
  return { g, win, page, backend };
}

function withGlobals(world, run) {
  const saved = { window: globalThis.window, GLX: globalThis.GLX, raf: globalThis.requestAnimationFrame };
  globalThis.window = world.win;
  globalThis.GLX = { __tlx: { renderer: { backend: world.backend }, backendState: () => ({ api: "webgl2" }), warming: () => false } };
  globalThis.requestAnimationFrame = (cb) => { world.g.rafCallbacks.push(cb); };
  const restore = () => {
    for (const [k, name] of [["window", "window"], ["GLX", "GLX"], ["raf", "requestAnimationFrame"]]) {
      if (saved[k] === undefined) delete globalThis[name]; else globalThis[name] = saved[k];
    }
  };
  return Promise.resolve().then(run).finally(restore);
}

test("frames(n) waits for n live ticks: frames inside a hold do not count", async () => {
  const world = fakeGame({ heldFrames: 40 });
  await withGlobals(world, async () => {
    await frames(world.page, 3);
    assert.equal(world.g.live, 3);
    assert.equal(world.g.raf, 43);             // the 40 held frames were waited out, then 3 live ones
  });
});

test("a press made during a hold is read after physics has seen it, and every window is the same live length", async () => {
  // 63 held frames is the failing run's shape: the control window (60) plus the 3-frame deploy read.
  const world = fakeGame({ heldFrames: SPACING + DEPLOY_FRAMES + SPACING + 3 });
  const cwd = process.cwd(), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "boost-census-"));
  process.chdir(tmp);
  try {
    await withGlobals(world, async () => {
      const out = await measureBoostPresses(world.page, { forceGL: true, bootMs: 1000, gas: async (on) => { world.g.gas = on; } });
      assert.equal(out.hook, "ok webgl2");
      assert.equal(out.presses.length, PRESSES);
      assert.deepEqual(out.presses.map((p) => p.deployed), [true, true, true, true]);
      // gas-on window, then per press: control + 3 + (deploy - 3) + spacing, all in live ticks.
      assert.equal(world.g.live, SPACING + PRESSES * (DEPLOY_FRAMES + SPACING + DEPLOY_FRAMES + SPACING));
    });
  } finally { process.chdir(cwd); fs.rmSync(tmp, { recursive: true, force: true }); }
});
