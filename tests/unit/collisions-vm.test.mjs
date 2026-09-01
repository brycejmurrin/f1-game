/* collisions-vm.test.mjs — tests/specs/collisions.spec.js replayed in the Node
 * VM (tools/game-vm.cjs): the Frenet car-to-car model — pair() separation,
 * jam() dig-out, a full pack for 10 s — with the SAME assertions.
 *
 * Ported: all 3 tests. The pageerror guards read the VM's console/rejection
 * record (an exception inside step() throws straight into the test).
 * Not portable: none — every assertion reads an `__apex` JSON hook.
 *
 * The browser spec stays the truth until CI has run this twin.
 * Run: node --test tests/unit/collisions-vm.test.mjs   (~4 s, one boot)
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

const mark = () => ({ c: g.record.console.length, r: g.record.rejections.length });
const errorsSince = (m) => [
  ...g.record.console.slice(m.c).filter((c) => c[0] === "error").map((c) => c[1]),
  ...g.record.rejections.slice(m.r),
];

const startRace = () => { fresh(); return g.race("monza", "day", "dry"); };
const step = (n) => { for (let i = 0; i < n; i++) g.apex.step(1 / 60, 1); };
const cars = () => g.apex.cars();

test("two overlapping cars push apart and settle without exploding", async () => {
  const m = mark();
  await startRace();
  const ids = g.apex.pair(0.3, 55);
  // Measure the separation over the window in which the two are actually
  // ALONGSIDE (see the browser spec for why a single sample at 2 s lied).
  const before = cars();
  const gap0 = Math.abs(before[ids.a].x - before[ids.b].x);
  let peak = 0;
  for (let i = 0; i < 60; i++) {          // 1 s, while still overlapped
    g.apex.step(1 / 60, 1);
    const cs = cars();
    const a = cs.find((c) => c.id === ids.a), b = cs.find((c) => c.id === ids.b);
    if (Math.abs(a.prog - b.prog) > 4) break;   // no longer side by side
    peak = Math.max(peak, Math.abs(a.x - b.x));
  }
  step(60);    // out to 2 s total, for the stability checks below
  const after = cars();

  assert.deepEqual(errorsSince(m), []);
  gt(peak, gap0);                      // they separated
  gt(peak, 1.6);                       // to ~a car width+
  for (const id of [ids.a, ids.b]) {
    assert.ok(Number.isFinite(after[id].x));   // no NaN blow-up
    lt(Math.abs(after[id].x), 12);             // stayed on track
  }
});

test("a jammed pack digs out and resumes speed", async () => {
  const m = mark();
  await startRace();
  const ids = g.apex.jam(5);
  step(360);   // ~6 s — generous margin (AI dig-out has randomness)
  const after = cars();
  const jammed = after.filter((c) => ids.includes(c.id));

  assert.deepEqual(errorsSince(m), []);
  for (const c of jammed) {
    // DELIBERATELY ABSOLUTE — a liveness bound, see the browser spec.
    gt(c.speed, 12);
    lt(Math.abs(c.x), 12);                 // and on track
  }
  for (let i = 0; i < jammed.length; i++)
    for (let j = i + 1; j < jammed.length; j++) {
      const dProg = Math.abs(jammed[i].prog - jammed[j].prog);
      const dX = Math.abs(jammed[i].x - jammed[j].x);
      assert.equal(dProg > 3 || dX > 1.4, true, `cars ${jammed[i].id}/${jammed[j].id} overlap`);
    }
});

test("a full pack racing for 10 s never piles off-track or NaNs", async () => {
  const m = mark();
  await startRace();
  g.apex.setInput({ steer: 0, throttle: true });
  step(600);
  g.apex.clearInput();
  const all = cars();
  assert.deepEqual(errorsSince(m), []);
  for (const c of all) {
    assert.ok(Number.isFinite(c.x));
    assert.ok(Number.isFinite(c.prog));
    lt(Math.abs(c.x), 18);
  }
});
