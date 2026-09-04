/* game-vm.test.mjs — the REAL js/game.js boots and drives in a Node VM.
 *
 * tools/lib/game-vm.cjs loads the full manifest order through game.js (renderer
 * stubbed, DOM inert, no browser) and hands back window.__apex. This file is
 * the harness's own contract: boot, race, drive, cross the line, and the JSON
 * hooks answer. The driving model's NUMBERS are pinned separately against the
 * browser-generated baseline in physics-characterization-vm.test.mjs.
 *
 * Run: node --test tests/unit/game-vm.test.mjs        (~3 s, one shared boot)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

const finite = (o, keys) => { for (const k of keys) assert.ok(Number.isFinite(o[k]), `${k} not finite: ${o[k]}`); };

let g;
before(async () => { g = await createGame({ track: "monza" }); });
after(() => { if (g) g.close(); });

test("boots to __apex with no script errors and a sub-5 s wall", () => {
  assert.ok(g.apex && typeof g.apex.step === "function", "__apex missing");
  assert.deepEqual(g.record.scripts.filter((s) => s.error), [], "an injected script threw");
  assert.deepEqual(g.record.rejections, [], "an unhandled rejection escaped boot");
  assert.ok(g.bootMs + g.trackMs < 5000, `boot ${g.bootMs | 0} ms + track ${g.trackMs | 0} ms`);
  assert.ok(g.G && g.G.track && g.G.player, "the G façade was not captured");
});

test("race(monza) + go() + 60 throttle steps: finite physState, speed > 0", () => {
  const a = g.apex;
  assert.equal(a.info().track, "monza");
  assert.ok(g.record.meshes > 0, "Tracks.build never reached the renderer stub");
  const p0 = a.physState();
  a.setInput({ throttle: true, steer: 0 });
  g.step(60);
  a.clearInput();
  const p = a.physState();
  finite(p, ["s", "x", "speed", "slipDeg", "head", "prog", "lap"]);
  assert.ok(p.speed > 0, `speed ${p.speed}`);
  assert.ok(p.prog > p0.prog, `prog did not advance: ${p0.prog} -> ${p.prog}`);
});

test("crossing the lap line increments lap and wraps s", () => {
  const a = g.apex;
  g.step(120);                        // let the grid clear the line first
  const j = a.jump(0.985, 50, 0);
  assert.ok(j && j.total > 1000, "jump returned no lap length");
  const lap0 = a.physState().lap;
  a.setInput({ throttle: true, steer: 0 });
  let crossed = -1;
  for (let i = 0; i < 300 && crossed < 0; i++) {
    g.step(1);
    if (a.physState().lap !== lap0) crossed = i;
  }
  a.clearInput();
  const p = a.physState();
  assert.ok(crossed >= 0, "never crossed the line in 300 steps");
  assert.equal(p.lap, lap0 + 1);
  assert.ok(p.s < 200, `s did not wrap: ${p.s}`);
  assert.equal(a.timing().lap, lap0 + 1);
});

test("the JSON hooks answer: obs / act / probe / cars / setInput / reset", () => {
  const a = g.apex;
  const o = a.obs();
  assert.ok(o && typeof o === "object" && Object.keys(o).length > 10, "obs() empty");
  const r = a.act({ steer: 0.2, throttle: true }, 1 / 60, 3);
  finite(r, ["s", "x", "speed", "head"]);
  const pr = a.probe();
  finite(pr, ["x", "k", "hw", "speed", "s"]);
  const cars = a.cars();
  assert.ok(cars.length >= 2 && cars.some((c) => c.p), "cars() lacks a field with a player");
  for (const c of cars) finite(c, ["x", "prog", "speed"]);
  const reset = a.reset(0.25, 30, 0, 5);
  assert.ok(reset && Number.isFinite(reset.speed), "reset() did not return obs");
  assert.equal(a.seed(), 5);
  assert.equal(Math.round(a.physState().speed), 30);
});

// The whole gear/rpm block used to live inside `if (c.human)`, so every AI car
// spent the race at IDLE_RPM in gear 1 — dark rev lights, a stuck gear digit,
// and (once rivals had engine audio) twenty opponents droning at idle tape
// speed. The readout is a pure function of speed, so the guard is: after a
// stretch of racing, the cars that are MOVING are also REVVING.
test("every car's gear and rpm track its speed, not just the player's", () => {
  const a = g.apex;
  a.setInput({ throttle: true, steer: 0 });
  g.step(180);
  a.clearInput();
  const { IDLE_RPM } = g.G.PhysicsConsts || { IDLE_RPM: 5000 };
  const moving = g.G.cars.filter((c) => !c.human && (c.speed || 0) > 12);
  assert.ok(moving.length >= 5, `only ${moving.length} AI cars are up to speed`);
  assert.ok(moving.every((c) => c.rpm > IDLE_RPM),
    `an AI car is still pinned at idle: ${JSON.stringify(moving.map((c) => ({ v: c.speed | 0, rpm: c.rpm | 0 })).slice(0, 4))}`);
  assert.ok(moving.some((c) => c.gear > 1), "no AI car ever left first gear");
  // ...and the human's own readout is unchanged by that: still a real gear.
  const p = g.G.cars.find((c) => c.human);
  assert.ok(p.rpm > IDLE_RPM || p.speed < 12, "the player's own rpm regressed");
});
