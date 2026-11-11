/* game-vm-pump.test.mjs — the VM harness can pump the real rAF loop, render() included (#5056).
 *
 * 1. The GLX stub's makeFrustumPlanes returned [] (truthy), so render()'s rival-car cull read
 *    planes[0] of undefined on the first frame a rival reached it; LoopHealth swallowed the throw
 *    into a "frame fault" console line until its cap. The stub now answers six all-pass planes, and
 *    pumpFrame throws when a pumped frame faulted instead of reading as clean.
 * 2. Built-in reads through the contextified global (Math, Number, …) cost ~100x a main-context read,
 *    so the harness aliases the realm's own intrinsics as script-scope lexicals. Same objects, so the
 *    simulation must be bit-identical with and without them.
 *
 * Run: node --test tests/unit/game-vm-pump.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";

const { createGame } = createRequire(import.meta.url)("../../tools/lib/game-vm.cjs");

test("600 pumped monza race frames: render runs every frame, no frame fault", async () => {
  const g = await createGame({ track: "monza" });
  try {
    const GLX = g.sandbox.GLX;
    const planes = GLX.makeFrustumPlanes(new Float32Array(16));
    assert.equal(planes.length, 6, "six planes: render() indexes planes[0..5]");
    for (const p of planes) assert.ok(p[0] * 1e4 + p[1] * 1e4 + p[2] * 1e4 + p[3] > 0, "every plane passes every point");
    let presents = 0;
    const present = GLX.present;
    GLX.present = (...a) => { presents++; return typeof present === "function" ? present(...a) : undefined; };
    g.apex.setInput({ throttle: true, steer: 0 });
    let t = 1000;
    for (let i = 0; i < 600; i++) g.pumpFrame(t += 1000 / 60);
    const faults = g.record.console.filter((c) => /frame fault/.test(c[1]));
    assert.deepEqual(faults, [], "no frame fault in record.console");
    assert.ok(presents >= 600, `render reached present() every frame (${presents} of 600)`);
    assert.ok(g.apex.physState().speed > 10, "the player is racing, so rivals reach the cull loop");
  } finally { g.close(); }
});

test("pumpFrame throws when the game swallowed a frame fault", async () => {
  const g = await createGame({ track: "monza" });
  try {
    let t = 1000;
    g.pumpFrame(t += 16);
    g.sandbox.GLX.makeFrustumPlanes = () => [];   // the pre-#5056 stub
    assert.throws(() => { for (let i = 0; i < 30; i++) g.pumpFrame(t += 1000 / 60); }, /pumped frame faulted|reading '0'/);
  } finally { g.close(); }
});

test("the intrinsic aliases are script-scope lexicals of the realm's own objects", async () => {
  const g = await createGame({});
  const off = await createGame({ intrinsics: false });
  try {
    assert.equal(vm.runInContext("Math === this.Math && Float32Array === this.Float32Array", g.ctx), true);
    assert.throws(() => vm.runInContext("let Math = 1;", g.ctx), /already been declared/, "Math is a script-scope lexical");
    assert.doesNotThrow(() => vm.runInContext("let Math = 1;", off.ctx), "intrinsics:false leaves the global path");
  } finally { g.close(); off.close(); }
});

test("the player's s/x after 2,100 frames is bit-identical with and without the aliases", async () => {
  const run = async (intrinsics) => {
    const g = await createGame({ track: "monza", intrinsics });
    try {
      g.apex.setInput({ throttle: true, steer: 0.02 });
      g.step(2100);
      const p = g.apex.physState();
      return { s: p.s, x: p.x, speed: p.speed };
    } finally { g.close(); }
  };
  const on = await run(true), off = await run(false);
  assert.deepEqual(on, off);
  assert.ok(Number.isFinite(on.s) && on.s > 0, `the car moved (s=${on.s})`);
});
