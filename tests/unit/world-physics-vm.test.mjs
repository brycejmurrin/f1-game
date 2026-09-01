/* world-physics-vm.test.mjs — tests/specs/world-physics.spec.js replayed in the
 * Node VM (tools/game-vm.cjs): the world-space player model's observable
 * contract — progress with speed, steer direction, running wide with the
 * assist off, the AI getting away — with the SAME assertions and PACE pin.
 *
 * Ported: 5 of 6 tests. "loads and runs with no uncaught errors" reads the
 * VM's console/rejection record where the browser reads pageerror + console
 * error events (an exception inside step() throws straight into the test).
 * Not portable: "RESPONSE slider changes turn-in (wheelbase)" — it drives the
 * `#pm-rate` DOM slider with an input event; the VM's DOM is inert.
 *
 * The browser spec stays the truth until CI has run this twin.
 * Run: node --test tests/unit/world-physics-vm.test.mjs   (~6 s, one boot)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/game-vm.cjs");

const gt = (a, b, m) => assert.ok(a > b, m || `${a} > ${b}`);
const lt = (a, b, m) => assert.ok(a < b, m || `${a} < ${b}`);

let g = null, PHYS0 = null;
before(async () => { g = await createGame({ track: "monza" }); PHYS0 = { ...g.apex.tuning() }; });
after(() => { if (g) g.close(); });

// The browser spec gets a FRESH page per test; one boot here, so put back the
// physics knobs and the headless flag a previous test may have left behind.
const fresh = () => { g.apex.setPhysics(PHYS0); g.apex.headless(false); };

// The VM's stand-in for page.on("pageerror") + console "error" events: new
// console.error lines and unhandled rejections since `mark`.
const errorsSince = (mark) => [
  ...g.record.console.slice(mark.c).filter((c) => c[0] === "error").map((c) => c[1]),
  ...g.record.rejections.slice(mark.r),
];
const mark = () => ({ c: g.record.console.length, r: g.record.rejections.length });

async function startRace() {
  fresh();
  await g.race("monza", "day", "dry");
  // PACE pinned: "ds > 35 in 1 s" is in metres — see the browser spec.
  g.apex.setPhysics({ pace: 1 });
}

test("loads and runs a race with no uncaught errors", async () => {
  const m = mark();
  await startRace();
  g.apex.setInput({ steer: 0.4, throttle: true });
  for (let i = 0; i < 300; i++) g.apex.step(1 / 60, 1);
  g.apex.clearInput();
  assert.deepEqual(errorsSince(m).filter((e) => !e.includes("favicon")), []);
});

test("progress advances ~linearly with speed", async () => {
  await startRace();
  const a = g.apex;
  a.jump(0.30, 50, 0);
  a.setInput({ steer: 0, throttle: false });
  const s0 = a.probe().s;
  for (let i = 0; i < 60; i++) a.step(1 / 60, 1);  // 1 s
  const p = a.probe();
  a.clearInput();
  const ds = ((p.s - s0) + 1e6) % 1e6;
  gt(ds, 35);          // ~46 m at ~46 m/s
  assert.ok(Number.isFinite(p.x));
});

test("steer direction: +steer goes right (+x), -steer goes left", async () => {
  await startRace();
  const measure = (steer) => {
    const a = g.apex;
    a.jump(0.0, 40, 0);
    a.setInput({ steer, throttle: false });
    const x0 = a.probe().x;
    for (let i = 0; i < 30; i++) a.step(1 / 60, 1);
    const x1 = a.probe().x;
    a.clearInput();
    return x1 - x0;
  };
  gt(measure(0.5), 0);
  lt(measure(-0.5), 0);
});

test("no input runs wide with road-follow off; tracks the corner once switched on", async () => {
  await startRace();
  const a = g.apex;
  const def = 0.6;                      // explicit opted-in assist
  const corners = a.corners();
  const meas = (frac, rf) => {
    a.setPhysics({ roadFollow: rf });
    a.jump(frac, 24, 0);
    a.setInput({ steer: 0, throttle: false });
    a.step(1 / 60, 3);
    const b = a.probe();
    a.step(1 / 60, 40);
    const p = a.probe();
    a.clearInput();
    return { k: b.k, dx: p.x - b.x };
  };
  const out = [];
  for (const frac of corners.slice(0, 12)) {
    const off = meas(frac, 0);            // pure world-space: no auto-steer
    if (Math.abs(off.k) < 0.012) continue;
    const on = meas(frac, def);           // opted in: road-follow tracks
    out.push({ k: off.k, dxOff: off.dx, dxOn: on.dx });
  }
  a.setPhysics({ roadFollow: 0 });   // restore the shipped default
  gt(out.length, 0);
  for (const { k, dxOff, dxOn } of out) {
    assert.equal(Math.sign(dxOff), Math.sign(k), `k=${k} dxOff=${dxOff}`);
    lt(Math.abs(dxOn), Math.abs(dxOff));
  }
});

test("AI stays on track and progresses after the racing-line flip", async () => {
  await startRace();
  const a = g.apex;
  const at0 = new Map(a.cars().map((c) => [c.id, c.prog]));
  a.setInput({ steer: 0, throttle: true });
  for (let i = 0; i < 600; i++) a.step(1 / 60, 1);  // ~10 s
  a.clearInput();
  const cars = a.cars();
  const ai = cars.filter((c) => !c.p);   // the player is hand-driven here
  const offTrack = ai.filter((c) => Math.abs(c.x) > 18).length;
  const minGain = Math.min(...ai.map((c) => c.prog - at0.get(c.id)));
  const minSpeed = Math.min(...ai.map((c) => c.speed));
  assert.equal(offTrack, 0);
  gt(minGain, 100, "an AI car barely left its grid slot");
  gt(minSpeed, 2, "an AI car is stationary 10 s after the green light");
});
