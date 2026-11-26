// boost-press-census — the press windows are LIVE ticks, so a press is never sampled inside a tickBody hold (#5592).
//
// The page driver (tools/perf/boost-press-census.mjs) runs here against a fake page: every poll of a wait is one
// animation frame of a fake game whose physics, like js/game.js tickBody, does not run while the renderer warms.
// Pages run 43963742824 failed "press 1 never deployed ERS" because the windows were counted in raw frames and
// 63 of them fit inside such a hold.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { frames, measureBoostPresses, PRESSES, DEPLOY_FRAMES, SPACING } from "../../tools/perf/boost-press-census.mjs";
import { mkTmpDir } from "../helpers/tmp-dir.mjs";

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
      renderScale: () => ({ scale: 1, lookPostShed: false }), govHold: () => ({ tierHold: false, tier: 0 }),
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
  const cwd = process.cwd(), tmp = mkTmpDir("boost-census-");
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

function pinnableGame() {
  const world = fakeGame({ heldFrames: 0 }), calls = [];
  const A = world.win.__apex, go = A.go;
  let scale = 1, hold = false;
  A.renderScale = (v) => { if (typeof v === "number") { calls.push("scale"); scale = v; } return { scale, lookPostShed: false }; };
  A.govHold = (on) => { if (on !== undefined) { calls.push("hold"); hold = !!on; } return { tierHold: hold, tier: 2 }; };
  A.go = () => { calls.push("go"); return go(); };
  return { world, calls };
}
async function inTmp(run) {
  const cwd = process.cwd(), tmp = mkTmpDir("boost-census-");
  process.chdir(tmp);
  try { await run(); } finally { process.chdir(cwd); fs.rmSync(tmp, { recursive: true, force: true }); }
}

test("renderScale pins the scale and holds the tier before go(), and reports both ends (#6669)", async () => {
  const { world, calls } = pinnableGame();
  await inTmp(() => withGlobals(world, async () => {
    const out = await measureBoostPresses(world.page, { forceGL: true, bootMs: 1000, renderScale: 0.5, gas: async (on) => { world.g.gas = on; } });
    assert.deepEqual(calls, ["scale", "hold", "go"]);
    const st = { scale: 0.5, tier: 2, tierHold: true, lookPostShed: false };
    assert.deepEqual(out.render, { asked: { renderScale: 0.5, swRaceShed: false }, before: st, after: st });
    assert.equal(out.presses.length, PRESSES);
    assert.ok(out.presses.every((p) => p.ms >= 0));
  }));
});

test("presses / deployFrames / spacing size the run; swRaceShed sets the knob and pins nothing itself (#6673)", async () => {
  const { world, calls } = pinnableGame();
  const ls = {};
  world.page.addInitScript = async (fn, arg) => {
    const saved = globalThis.localStorage;
    globalThis.localStorage = { setItem: (k, v) => { ls[k] = v; } };
    try { fn(arg); } finally { if (saved === undefined) delete globalThis.localStorage; else globalThis.localStorage = saved; }
  };
  await inTmp(() => withGlobals(world, async () => {
    const out = await measureBoostPresses(world.page, { forceGL: true, bootMs: 1000, swRaceShed: true, presses: 2, deployFrames: 15, spacing: 10,
      tag: "t", gas: async (on) => { world.g.gas = on; } });
    assert.equal(ls["apex26.swRaceShed"], "1");
    assert.equal(ls["apex26.tlxForceGL"], "1");
    assert.deepEqual(calls, ["go"]);
    assert.equal(out.presses.length, 2);
    assert.deepEqual(out.presses.map((p) => p.deployed), [true, true]);
    assert.equal(world.g.live, 10 + 2 * (15 + 10 + 15 + 10));
    assert.ok(fs.existsSync("artifacts/perf/boost-press-pipelines-t.json"));
  }));
});
