// lockup-smoke-vm — a locked front wheel is a skid: it squeals, marks and smokes.
//
// player-forces sets c.wheelLock when braking overdrives the front axle
// (measured ~0.47 on a dry straight-line stop); until 2026-10-01 the only
// consumer was car-draw, which froze the front spin. Now skidIntensity — the
// one value the squeal, the skid marks and the tyre smoke all read — takes
// max(slide, wheelLock × 0.9), and the smoke site picks a FRONT wheel while
// locked (the second graphics-detail survey, item 10). Real js/game.js in the
// VM harness; one boot, no browser.
//
// Run: node --test tests/unit/lockup-smoke-vm.test.mjs  (test:game-vm-a)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

let g = null;
before(async () => { g = await createGame({ track: "monza" }); });
after(() => { if (g) g.close(); });

test("a straight-line stop from speed locks a front and the lock reads as skid intensity", async () => {
  await g.race("monza");
  g.apex.setInput({ throttle: true, brake: false, steer: 0 });
  g.step(600);   // ten seconds of launch down the Monza pit straight
  const p = g.G.player;
  assert.ok(p.speed > 30, `the launch should reach road speed (measured ~37 m/s after 10 s), got ${p.speed}`);
  assert.equal(p.wheelLock || 0, 0, "no lock under power on a straight");
  assert.ok((p.skidIntensity || 0) < 0.25, `a straight under power is no skid: ${p.skidIntensity}`);
  g.apex.setInput({ throttle: false, brake: true, steer: 0 });
  let maxLock = 0, okFrames = 0, frames = 0;
  for (let i = 0; i < 40 && p.speed > 5; i++) {
    g.step(1); frames++;
    const lock = p.wheelLock || 0;
    maxLock = Math.max(maxLock, lock);
    if (lock > 0.3 && (p.skidIntensity || 0) >= lock * 0.9 - 1e-6 && p.skidIntensity > 0.25) okFrames++;
  }
  assert.ok(maxLock > 0.3, `a full dry stop should lock a front (player-forces measured ~0.47), peak ${maxLock}`);
  assert.ok(okFrames > 0, `on every locked frame skidIntensity must carry the lock (≥ 0.9 × wheelLock, above the 0.25 mark/smoke threshold); ${okFrames}/${frames}`);
});

test("the smoke site reads the lock and picks a front wheel for it", () => {
  const fs = require("node:fs"), path = require("node:path");
  const game = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "../../js/game.js"), "utf8");
  assert.match(game, /const locked = !c\.offroad && vStd\(c\.speed\) > 8 && \(c\.wheelLock \|\| 0\) > 0\.3;/);
  assert.match(game, /if \(locked\) smokeI = Math\.max\(smokeI, c\.wheelLock\);/);
  assert.match(game, /carDraw\.WHEELS\[\(locked \? 0 : 2\) \+ \(\(Math\.random\(\) \* 2\) \| 0\)\]/, "a locked car smokes from a front wheel (indices 0-1), else a rear (2-3)");
  assert.match(game, /Math\.max\(clamp\(\(slipAng - 0\.10\) \/ 0\.20, 0, 1\), \(c\.wheelLock \|\| 0\) \* 0\.9\)/);
});
