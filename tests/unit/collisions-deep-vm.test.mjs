/* collisions-deep-vm.test.mjs — tests/specs/collisions-deep.spec.js replayed in
 * the Node VM (tools/game-vm.cjs): driver↔AI pushes that must STICK through
 * the world-space integration, walls (open-circuit band and street barrier),
 * kerbs, sandwiches, pileups, the start/finish seam, the side-rub speed-death
 * regression — with the SAME assertions and thresholds.
 *
 * Ported: all 15 tests (the three street-circuit tests race monaco on the
 * same boot). The pageerror guards read the VM's console/rejection record.
 * Not portable: none — every assertion reads an `__apex` JSON hook.
 *
 * The browser spec stays the truth until CI has run this twin.
 * Run: node --test tests/unit/collisions-deep-vm.test.mjs   (~10 s, one boot)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/game-vm.cjs");

const gt = (a, b, m) => assert.ok(a > b, m || `${a} > ${b}`);
const lt = (a, b, m) => assert.ok(a < b, m || `${a} < ${b}`);
const lte = (a, b, m) => assert.ok(a <= b, m || `${a} <= ${b}`);

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
const startStreet = () => { fresh(); return g.race("monaco", "day", "dry"); };
// The R2 launch bypasses wallAt (recorded 2026-08-13): the wall tests pin the
// clamp in isolation through the sanctioned __apex.incident({flags}) hook.
const noIncidents = () => g.apex.incident({ flags: { r2Airborne: false, r3Contact: false, c1Pileup: false } });

test("driver↔AI side contact pushes the PLAYER and the push sticks", async () => {
  await startRace();
  const a = g.apex;
  a.setPhysics({ drift: 0 });
  a.jump(0.3, 40, 0);          // player centred
  a.rival(0, 1.0);             // AI 1 m to the right, overlapping (<2 m)
  a.setInput({ steer: 0, throttle: false });
  for (let i = 0; i < 30; i++) a.step(1 / 60, 1);
  const p = a.probe();
  a.clearInput();
  // The AI is on the player's right (+x); contact must shove the player LEFT
  // and it must persist.
  lt(p.x, -0.3);
});

test("driver↔AI: player can't be driven through an overlapping rival", async () => {
  await startRace();
  const a = g.apex;
  a.setPhysics({ drift: 0 });
  a.jump(0.3, 40, 0);
  a.rival(0, 0.4);             // heavily overlapped to the right
  a.setInput({ steer: 1, throttle: false });
  let minLat = Infinity;
  for (let i = 0; i < 40; i++) {
    a.step(1 / 60, 1);
    const cs = a.cars();
    const p = cs.find((c) => c.p), r = cs.find((c) => !c.p);
    if (Math.abs(p.prog - r.prog) < 4.8)        // while longitudinally overlapping
      minLat = Math.min(minLat, Math.abs(p.x - r.x));
  }
  a.clearInput();
  gt(minLat, 0.9);
});

test("driver↔wall: player is stopped at the barrier and loses speed", async () => {
  await startRace();
  const a = g.apex;
  noIncidents();
  a.setPhysics({ drift: 0 });
  const hw = a.probe().hw;
  a.jump(0.0, 60, 0);
  a.setInput({ steer: 1, throttle: true });
  let maxAbsX = 0;
  for (let i = 0; i < 120; i++) {
    a.step(1 / 60, 1);
    maxAbsX = Math.max(maxAbsX, Math.abs(a.probe().x));
  }
  a.clearInput();
  lt(maxAbsX, hw + 9.5);   // never pushes past the barrier band
  gt(maxAbsX, hw);         // it did reach the run-off/wall
});

test("kerb: riding the kerb sets the kerb flag (grip penalty hook)", async () => {
  await startRace();
  const a = g.apex;
  let sawKerb = false;
  const corners = a.corners();
  outer: for (const frac of corners) {
    for (let off = 5; off <= 9; off += 0.2) {
      for (const s of [off, -off]) {
        a.jump(frac, 28, s);
        a.step(1 / 60, 1);
        if (a.cars().find((c) => c.p).kerb) { sawKerb = true; break outer; }
      }
    }
  }
  assert.equal(sawKerb, true);
});

test("driver↔AI: ramming a car ahead never deeply interpenetrates (shove aside, pass clean)", async () => {
  await startRace();
  const a = g.apex;
  const LCAR = 4.8, WCAR = 2.0;
  a.setPhysics({ drift: 0 });
  a.jump(0.3, 50, 0);          // player fast
  a.rival(4, 0);               // rival ~a car-length AHEAD, same lane
  a.setInput({ steer: 0, throttle: true });
  let maxOverlap = 0;
  for (let i = 0; i < 90; i++) {
    a.step(1 / 60, 1);
    const cs = a.cars();
    const p = cs.find((c) => c.p), r = cs.find((c) => !c.p);
    const penLong = LCAR - Math.abs(r.prog - p.prog);
    const penLat = WCAR - Math.abs(r.x - p.x);
    if (penLong > 0 && penLat > 0) maxOverlap = Math.max(maxOverlap, Math.min(penLong, penLat));
  }
  a.clearInput();
  lt(maxOverlap, 1.0);
});

test("street-circuit wall: hard barrier pins the player and scrubs speed", async () => {
  await startStreet();
  const a = g.apex;
  noIncidents();
  a.setPhysics({ drift: 0 });
  const hw = a.probe().hw;
  a.jump(0.2, 55, 0);
  a.setInput({ steer: 1, throttle: true });   // bury it into the barrier
  let maxAbsX = 0, vEnd = 0;
  for (let i = 0; i < 90; i++) {
    a.step(1 / 60, 1);
    const p = a.probe();
    maxAbsX = Math.max(maxAbsX, Math.abs(p.x)); vEnd = p.speed;
  }
  a.clearInput();
  const maxWallOvershoot = a.maxWallOvershoot();
  gt(maxAbsX, hw * 0.8);        // reached the street barrier
  lt(maxWallOvershoot, 0.01);   // hard boundary kept the car pinned
  lt(vEnd, 40);                 // pinned against the wall = scrubbed speed
});

test("drift into a wall stays stable (no NaN, no fly-off)", async () => {
  const m = mark();
  await startRace();
  const a = g.apex;
  a.setPhysics({ drift: 0.9 });   // very slidey
  a.jump(0.0, 80, 0);
  a.setInput({ steer: 1, throttle: true });
  let finite = true, maxAbsX = 0, maxHw = 0;
  for (let i = 0; i < 120; i++) {
    a.step(1 / 60, 1);
    const p = a.probe();
    if (!Number.isFinite(p.x) || !Number.isFinite(p.s)) finite = false;
    maxAbsX = Math.max(maxAbsX, Math.abs(p.x));
    maxHw = Math.max(maxHw, p.hw || 0);
  }
  a.clearInput(); a.setPhysics({ drift: 0.2 });
  assert.deepEqual(errorsSince(m), []);
  assert.equal(finite, true);
  // DERIVED FROM THE ROAD — four half-widths, see the browser spec.
  lt(maxAbsX, 4 * maxHw);
});

test("sandwiched between two rivals: player stays on track, no merge, no NaN", async () => {
  const m = mark();
  await startRace();
  const a = g.apex;
  a.setPhysics({ drift: 0 });
  a.jump(0.3, 40, 0);
  a.rivals([{ dProg: 0, dx: -1.4 }, { dProg: 0, dx: 1.4 }]);  // both sides
  let finite = true, maxAbsX = 0;
  for (let i = 0; i < 60; i++) {
    a.setInput({ steer: 0, throttle: false });
    a.step(1 / 60, 1);
    const p = a.probe();
    if (!Number.isFinite(p.x)) finite = false;
    maxAbsX = Math.max(maxAbsX, Math.abs(p.x));
  }
  a.clearInput();
  const hw = a.probe().hw;
  assert.deepEqual(errorsSince(m), []);
  assert.equal(finite, true);
  lt(maxAbsX, hw + 9.5);   // never squeezed off through a wall
});

test("a side rub never INCREASES the player's speed (no energy injection)", async () => {
  await startRace();
  const a = g.apex;
  a.setPhysics({ drift: 0 });
  a.jump(0.3, 40, 0);
  a.rivals([{ dProg: 0, dx: 0.8 }]);   // overlapping to the right
  const v0 = a.probe().speed;
  let maxV = v0;
  for (let i = 0; i < 40; i++) {
    a.setInput({ steer: 0, throttle: false });
    a.step(1 / 60, 1);
    maxV = Math.max(maxV, a.probe().speed);
  }
  a.clearInput();
  lte(maxV, v0 + 0.5);   // contact only scrubs speed
});

test("a single AI rub only nudges the player apart — never launches it", async () => {
  await startRace();
  const a = g.apex;
  a.setPhysics({ drift: 0 });
  a.jump(0.3, 40, 0);
  a.rivals([{ dProg: 0, dx: 1.0 }]);   // overlapping to the right
  let maxStep = 0, prev = a.probe().x;
  for (let i = 0; i < 40; i++) {
    a.setInput({ steer: 0, throttle: false });
    a.step(1 / 60, 1);
    const x = a.probe().x;
    maxStep = Math.max(maxStep, Math.abs(x - prev));   // per-frame displacement
    prev = x;
  }
  a.clearInput();
  lt(prev, 0);        // shoved away from the rival (to the left)
  lt(maxStep, 0.6);   // gentle rub, never a launch/teleport
});

test("AI shoving the player toward the wall can't push them through it", async () => {
  await startStreet();
  const a = g.apex;
  a.setPhysics({ drift: 0 });
  const hw = a.probe().hw;
  a.jump(0.2, 30, hw - 1.2);            // player near the right barrier
  a.rivals([{ dProg: 0, dx: -1.2 }]);   // AI on the inside, shoving out
  let maxAbsX = 0;
  for (let i = 0; i < 60; i++) { a.setInput({ steer: 0, throttle: false }); a.step(1 / 60, 1); maxAbsX = Math.max(maxAbsX, Math.abs(a.probe().x)); }
  a.clearInput();
  lt(maxAbsX, hw + 0.2);   // held inside the street barrier
});

test("five-car pileup around the player stays bounded and finite", async () => {
  const m = mark();
  await startRace();
  const a = g.apex;
  a.setPhysics({ drift: 0.2 });
  a.jump(0.3, 35, 0);
  a.rivals([
    { dProg: 2, dx: 0.5 }, { dProg: -2, dx: -0.5 },
    { dProg: 1, dx: -1.2 }, { dProg: -1, dx: 1.2 }, { dProg: 0, dx: 0 },
  ]);
  let finite = true, maxAbsX = 0;
  for (let i = 0; i < 90; i++) {
    a.setInput({ steer: Math.sin(i / 6), throttle: true });
    a.step(1 / 60, 1);
    for (const c of a.cars()) { if (!Number.isFinite(c.x) || !Number.isFinite(c.prog)) finite = false; maxAbsX = Math.max(maxAbsX, Math.abs(c.x)); }
  }
  a.clearInput();
  assert.deepEqual(errorsSince(m), []);
  assert.equal(finite, true);
  lt(maxAbsX, 20);
});

test("collision across the start/finish line keeps prog monotonic (no wrap glitch)", async () => {
  await startRace();
  const a = g.apex;
  a.setPhysics({ drift: 0 });
  a.jump(0.985, 55, 0);                 // just before the line
  a.rivals([{ dProg: 3, dx: 0.6 }]);    // rival straddling the line ahead
  a.setInput({ steer: 0, throttle: true });
  let prev = a.physState().prog, backsteps = 0, finite = true;
  for (let i = 0; i < 120; i++) {
    a.step(1 / 60, 1);
    const p = a.physState();
    if (!Number.isFinite(p.prog)) finite = false;
    if (p.prog < prev - 0.6) backsteps++;           // big backward jump = wrap glitch
    prev = p.prog;
  }
  a.clearInput();
  assert.equal(finite, true);
  assert.equal(backsteps, 0);
});

test("driver↔AI contact never NaNs or desyncs prog/s for the player", async () => {
  const m = mark();
  await startRace();
  const a = g.apex;
  a.jump(0.3, 45, 0);
  a.rival(0, 0.6);
  let finite = true;
  for (let i = 0; i < 120; i++) {
    a.setInput({ steer: Math.sin(i / 5), throttle: true });
    a.step(1 / 60, 1);
    const p = a.probe();
    if (!Number.isFinite(p.x) || !Number.isFinite(p.s) || !Number.isFinite(p.speed)) finite = false;
  }
  a.clearInput();
  assert.deepEqual(errorsSince(m), []);
  assert.equal(finite, true);
});

test("closing into a traffic nest does not speed-death via perpetual side-rub", async () => {
  await startStreet();
  const a = g.apex;
  a.headless(true);
  a.setPhysics({ drift: 0 });
  a.jump(0.22, 48, 0);
  a.rivals([
    { dProg: 2.2, dx: 0, speed: 12 },
    { dProg: 0.5, dx: -2.2, speed: 40 },
    { dProg: 0.5, dx: 2.2, speed: 40 },
  ]);
  let locked = 0, minSpeed = 999;
  for (let i = 0; i < 120; i++) {
    a.act({ steer: 0, throttle: true, brake: false }, 1 / 60, 1);
    const cs = a.cars();
    const p = cs.find((c) => c.p);
    let ov = false;
    for (const o of cs.filter((c) => !c.p)) {
      const penL = 4.8 - Math.abs(o.prog - p.prog);
      const penX = 2.0 - Math.abs(o.x - p.x);
      if (penL > 0 && penX > 0) { ov = true; break; }
    }
    if (ov) locked++;
    minSpeed = Math.min(minSpeed, p.speed);
  }
  a.headless(false);
  a.clearInput();
  minSpeed = +minSpeed.toFixed(1);
  gt(minSpeed, 18);
  lt(locked, 90);
});
