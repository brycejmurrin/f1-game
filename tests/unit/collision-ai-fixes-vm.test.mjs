/* collision-ai-fixes-vm.test.mjs — tests/specs/collision-ai-fixes.spec.js
 * replayed in the Node VM (tools/game-vm.cjs): the June 2026 collision / AI /
 * physics bug-fix audit — wrong-way thresholds and hysteresis, the open-circuit
 * wall scrub, the throttle-gated rescue and its cooldown reset, rear-end
 * contactT, the >6-car separation window, AI banking grip (zandvoort) and the
 * Jeddah barrier face — with the SAME assertions and thresholds.
 *
 * Ported: all 14 tests (zandvoort and jeddah are built on the same boot; the
 * two Jeddah tests read `Tracks.LIST` from the VM sandbox exactly as the
 * browser reads the page global).
 * Not portable: none — every assertion reads an `__apex` JSON hook.
 *
 * The browser spec stays the truth until CI has run this twin.
 * Run: node --test tests/unit/collision-ai-fixes-vm.test.mjs   (~12 s, one boot)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/game-vm.cjs");

const closeTo = (r, e, d, m) => assert.ok(Math.abs(e - r) < Math.pow(10, -d) / 2, m || `${r} not within 10^-${d}/2 of ${e}`);
const gt = (a, b, m) => assert.ok(a > b, m || `${a} > ${b}`);
const lt = (a, b, m) => assert.ok(a < b, m || `${a} < ${b}`);
const lte = (a, b, m) => assert.ok(a <= b, m || `${a} <= ${b}`);

let g = null, PHYS0 = null;
before(async () => { g = await createGame({ track: "monza" }); PHYS0 = { ...g.apex.tuning() }; });
after(() => { if (g) g.close(); });

// The browser spec gets a FRESH page per test; one boot here, so put back the
// physics knobs and the headless flag a previous test may have left behind.
const fresh = () => { g.apex.setPhysics(PHYS0); g.apex.headless(false); };

// The spec's loadRace(): race(id) then jump mid-track at racing speed.
async function loadRace(trackId = "monza") {
  fresh();
  await g.race(trackId);
  g.apex.jump(0.1, 40, 0);
}

// ── Wrong-way detection (Bug #8 & #9) ───────────────────────────────────────

test("slow reverse crawl below 15 m/s does not trigger wrong-way", async () => {
  await loadRace();
  const A = g.apex;
  A.headless(true);
  A.reset(0.3, 0, 0);
  A.aim(180);   // face backwards along track
  for (let i = 0; i < 50; i++) {
    const obs = A.act({ steer: 0, throttle: true, brake: false }, 1 / 60, 1);
    if (obs.speed > 13) break;   // cap well below 15 threshold
  }
  A.headless(false);
  assert.equal(A.physState().wrongWay, false);
});

test("sustained backward driving at >15 m/s sets wrong-way within 0.6 s", async () => {
  await loadRace();
  const A = g.apex;
  A.headless(true);
  A.reset(0.3, 25, 0);  // 25 m/s > threshold
  A.aim(180);           // now heading backwards
  let triggered = false, frames = 0;
  for (let i = 0; i < 60; i++) {   // 1 s window
    A.act({ steer: 0, throttle: true, brake: false }, 1 / 60, 1);
    frames++;
    if (A.physState().wrongWay) { triggered = true; break; }
  }
  A.headless(false);
  assert.equal(triggered, true);
  lte(frames, 40);   // must fire well within 1 s
});

test("wrong-way clears within 0.5 s after car faces correct direction (hysteresis)", async () => {
  await loadRace();
  const A = g.apex;
  A.headless(true);
  A.reset(0.3, 25, 0);
  A.aim(180);
  for (let i = 0; i < 50; i++) {
    A.act({ steer: 0, throttle: true, brake: false }, 1 / 60, 1);
    if (A.physState().wrongWay) break;
  }
  const wasWrongWay = A.physState().wrongWay;
  A.aim(0);
  let cleared = false;
  for (let i = 0; i < 35; i++) {
    A.act({ steer: 0, throttle: true, brake: false }, 1 / 60, 1);
    if (!A.physState().wrongWay) { cleared = true; break; }
  }
  A.headless(false);
  assert.equal(wasWrongWay, true);
  assert.equal(cleared, true);
});

test("obs().done is true when wrong-way is active", async () => {
  await loadRace();
  const A = g.apex;
  A.headless(true);
  A.reset(0.3, 25, 0);
  A.aim(180);
  let obs;
  for (let i = 0; i < 80; i++) {
    obs = A.act({ steer: 0, throttle: true, brake: false }, 1 / 60, 1);
    if (obs.wrongWay) break;
  }
  A.headless(false);
  assert.equal(obs.done, true);
});

// ── Wall contact on non-street circuits (Bug #11) ────────────────────────────

test("speed is scrubbed when pinned against Monza barrier (pushIn penalty)", async () => {
  await loadRace("monza");
  const A = g.apex;
  A.headless(true);
  // One coasting episode: same start frac, same 20 m/s, same 10 ticks.
  const run = (lateralOf, steer) => {
    const obs0 = A.reset(0.05, 20, 0);
    A.jump(0.05, 20, lateralOf(obs0));
    let speed = 20;
    for (let i = 0; i < 10; i++) speed = A.act({ steer, throttle: false, brake: false }, 1 / 60, 1).speed;
    return speed;
  };
  const control = run(() => 0, 0);
  const scrubbed = run((o) => o.wallR + 0.8, 1.0);
  A.headless(false);
  gt(control, 15);                  // anti-vacuity: still a coasting run
  lt(scrubbed, control - 1.0);      // the pushIn scrub, beyond drag alone
});

test("a car wedged against the barrier is auto-rescued back onto the track", async () => {
  await loadRace("monza");
  const A = g.apex;
  A.headless(true);
  A.reset(0.05, 0, 0);
  const obs0 = A.obs();
  A.jump(0.05, 0, obs0.wallR + 0.2);   // pinned against the right wall
  let rescuedX = null, rescueFrame = -1;
  for (let i = 0; i < 420; i++) {  // 7 s window
    A.act({ steer: 1.0, throttle: true, brake: false }, 1 / 60, 1);
    const x = A.probe().x;
    if (x < obs0.wallR - 3) { rescuedX = +x.toFixed(1); rescueFrame = i; break; }
  }
  A.headless(false);
  const wallR = +obs0.wallR.toFixed(1);
  gt(rescueFrame, 0);
  lt(rescuedX, wallR - 3);
});

// ── rescueLastT reset in gridUp (Bug #7) ─────────────────────────────────────

test("reset() clears rescue grace so a second rescue fires within the window", async () => {
  await loadRace("monza");
  const A = g.apex;
  A.headless(true);
  const wedgeUntilRescue = () => {
    const o = A.obs();
    A.jump(0.05, 0, o.wallR + 0.2);
    for (let i = 0; i < 420; i++) {
      A.act({ steer: 1.0, throttle: true, brake: false }, 1 / 60, 1);
      if (A.probe().x < o.wallR - 3) return i;   // rescued back inboard
    }
    return -1;
  };
  A.reset(0.05, 0, 0);
  const first = wedgeUntilRescue();
  A.reset(0.05, 0, 0);
  const second = wedgeUntilRescue();
  A.headless(false);
  gt(first, 0);
  gt(second, 0);
});

// ── Rear-end collision contactT (Bug #3) ─────────────────────────────────────

test("rear-end collision sets contactT on both cars", async () => {
  await loadRace();
  const A = g.apex;
  A.headless(true);
  A.reset(0.3, 20, 0);
  const r = A.rival(-0.5, 0);
  assert.ok(r, "rival() returned nothing");
  const rivalIdx = r.rival;
  for (let i = 0; i < 6; i++) A.act({ steer: 0, throttle: false, brake: false }, 1 / 60, 1);
  const cars = A.cars();
  const playerCar = cars.find((c) => c.p);
  const rivalCar = cars[rivalIdx];
  A.headless(false);
  const playerCt = playerCar ? playerCar.ct : -1;
  const rivalCt = rivalCar ? rivalCar.ct : -1;
  gt(playerCt, 0);
  gt(rivalCt, 0);
});

// ── Separation window (Bug #2) ───────────────────────────────────────────────

test("10-car pack digs out within 5 s — no NaN positions", async () => {
  await loadRace();
  const A = g.apex;
  A.headless(true);
  A.jam(10);   // stack 10 cars at the same point
  for (let i = 0; i < 300; i++) A.act({ steer: 0, throttle: true, brake: false }, 1 / 60, 1);
  A.headless(false);
  assert.equal(A.cars().every((c) => isFinite(c.x) && isFinite(c.prog) && isFinite(c.speed)), true);
});

test("10-car pack reaches >10 m/s average speed within 5 s", async () => {
  await loadRace();
  const A = g.apex;
  A.headless(true);
  A.jam(10);
  for (let i = 0; i < 300; i++) A.act({ steer: 0, throttle: true, brake: false }, 1 / 60, 1);
  A.headless(false);
  const cars = A.cars();
  gt(cars.reduce((s, c) => s + c.speed, 0) / cars.length, 10);
});

// ── AI banking grip (elevation audit Bug #1) ─────────────────────────────────

test("AI carry banked-corner speed comparable to a flat straight (banking grip applies to AI)", async () => {
  await loadRace("zandvoort");
  const A = g.apex;
  const runAvg = (frac) => {
    A.headless(true);
    A.reset(frac, 20, 0);
    for (let i = 0; i < 480; i++) A.act({ steer: 0, throttle: true, brake: false }, 1 / 60, 1);
    A.headless(false);
    const ai = A.cars().filter((c) => !c.p);
    return {
      avg: ai.reduce((s, c) => s + c.speed, 0) / (ai.length || 1),
      finite: A.cars().every((c) => isFinite(c.x) && isFinite(c.speed)),
    };
  };
  const flat = runAvg(0.0);      // start/finish straight — the grip reference
  const banked = runAvg(0.65);   // Arie Luyendijk banked turn (~0.65–0.75)
  assert.equal(flat.finite && banked.finite, true);
  gt(banked.avg, flat.avg * 0.5);
});

test("player with racing-line assist stays on banked Zandvoort section", async () => {
  await loadRace("zandvoort");
  const A = g.apex;
  A.headless(true);
  A.reset(0.65, 30, 0);  // enter banking at moderate speed
  let obs, minClearR = Infinity, minClearL = Infinity;
  for (let i = 0; i < 240; i++) {  // 4 s
    obs = A.act({ steer: 0, throttle: true, brake: false }, 1 / 60, 1);
    minClearR = Math.min(minClearR, obs.clearR);
    minClearL = Math.min(minClearL, obs.clearL);
  }
  A.headless(false);
  gt(minClearR, -3);   // at most 3 m past right edge
  gt(minClearL, -3);   // at most 3 m past left edge
  gt(obs.speed, 5);    // not stopped
});

// ── Jeddah barrier physics (barrier audit) ───────────────────────────────────

test("Jeddah wallAt() matches the migrated visual wall clearance", async () => {
  await loadRace("jeddah");
  const obs = g.apex.reset(0.1, 0, 0);
  const barrierGap = g.sandbox.Tracks.LIST.find((entry) => entry.id === "jeddah").barrierGap;
  assert.equal(barrierGap, 3.4);
  closeTo(obs.wallR, obs.hw + barrierGap - 1.1, 1);
});

test("car cannot drive past the migrated Jeddah barrier face", async () => {
  await loadRace("jeddah");
  const A = g.apex;
  A.headless(true);
  const obs0 = A.reset(0.1, 20, 0);
  const hw = obs0.hw;
  const barrierGap = g.sandbox.Tracks.LIST.find((entry) => entry.id === "jeddah").barrierGap;
  A.jump(0.1, 20, hw + barrierGap + 0.4);
  A.act({ steer: 1, throttle: false, brake: false }, 1 / 60, 3);
  A.headless(false);
  lt(A.obs().x, hw + barrierGap);
});
