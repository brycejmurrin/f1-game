// physics-feel-vm — three user-approved FEEL fixes from the 2026-10-09 bug hunt,
// on the game-vm harness. They live here and not in active-aero-vm /
// longitudinal-vm because those two are TWINS of browser specs (tools/ci/
// twinned-specs.mjs): a twin must declare exactly its spec's tests, so a new
// VM-only case cannot be added there without porting it to the browser copy.
//
//   1. DEPLOY_A rides PACE like every other acceleration term (docs/PHYSICS.md:
//      "PACE multiplies the accel curve exactly as it multiplies ground speed").
//      Unscaled, the same BOOST sped the build-up between two dial-equivalent
//      speeds up 2.56x at OVERALL SPEED 0.44 but only 1.54x at 1.34.
//   2. BOOST held through a brake neither drains the battery nor lights
//      "deploying": the push enters `a` only on the throttle branch.
//   3. The manual gearbox's 8th gear has no rev limiter: gearHi(8) IS vTop(), so
//      `accelCeil = hi + 1.5` pinned a manual player at vTop + 1.5 for good and
//      none of X-mode's gain, ERS overspeed or an engine upgrade ever reached
//      them, while an auto player from the same start climbed to ~63.3 m/s.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

const gt = (a, b, m) => assert.ok(a > b, m || `${a} > ${b}`);
const lt = (a, b, m) => assert.ok(a < b, m || `${a} < ${b}`);
const gte = (a, b, m) => assert.ok(a >= b, m || `${a} >= ${b}`);

let g = null, PHYS0 = null;
before(async () => { g = await createGame({ track: "monza" }); PHYS0 = { ...g.apex.tuning() }; });
after(() => { if (g) g.close(); });

// One boot: put back the physics knobs a previous test may have left behind.
const fresh = () => { g.apex.setPhysics(PHYS0); g.apex.headless(false); };
const pinPace = () => g.apex.setPhysics({ pace: 1 });
async function startRace() {
  fresh();
  await g.race("monza", "day", "dry");
  pinPace();
}
// An empty road: every rival retired and parked far off the line.
const clearRoad = (G) => { for (const c of G.cars) if (c !== G.player) { c.retired = true; c.x = 80; } };
// The middle of the longest non-wrapping activation zone (active-aero's "straight").
function straightFrac() {
  const zones = g.apex.aeroZones();
  if (!zones.length) throw new Error("track has no activation zones");
  const sorted = zones.slice().sort((a, b) => b.len - a.len);
  return (sorted.find((q) => q.endFrac > q.startFrac) || sorted[0]).midFrac;
}

test("BOOST speeds the build-up by the same factor at every OVERALL SPEED", async () => {
  await startRace();
  const G = g.G, P = G.player;
  clearRoad(G);
  // The band is 20..35 m/s at the standard pace, scaled by PACE so it is the
  // same stretch of the speedometer at every dial setting.
  const ratio = (pace) => {
    const t = {};
    for (const boost of [false, true]) {
      g.apex.setPhysics({ pace });
      g.apex.jump(0.02, 20 * pace, 0);
      P.energy = 1; P.boostOn = boost; P.aeroX = 0; P.xOn = false;
      g.apex.setInput({ throttle: true });
      let n = 0;
      while (P.speed < 35 * pace && n < 60 * 30) { g.apex.step(1 / 60, 1); P.energy = 1; P.xOn = false; n++; }
      t[boost] = n / 60;
    }
    g.apex.clearInput();
    return t.false / t.true;
  };
  const slow = ratio(0.44), fast = ratio(1.34);
  gt(slow, 1.3, `BOOST must actually help at pace 0.44 (${slow})`);
  gt(fast, 1.3, `BOOST must actually help at pace 1.34 (${fast})`);
  lt(Math.abs(slow / fast - 1), 0.05, `BOOST factor ${slow.toFixed(3)} @0.44 vs ${fast.toFixed(3)} @1.34`);
  pinPace();
});

test("BOOST held through a brake neither drains the battery nor reads as deploying", async () => {
  await startRace();
  const G = g.G, P = G.player;
  clearRoad(G);
  const run = (input) => {
    g.apex.jump(0.02, 60, 0);
    P.energy = 0.8; P.boostOn = true;
    g.apex.setInput(input);
    let deployed = false;
    for (let i = 0; i < 120; i++) { g.apex.step(1 / 60, 1); if (P.deploying) deployed = true; }
    g.apex.clearInput();
    return { deployed, energy: P.energy };
  };
  for (const input of [{ brake: true }, { throttle: true, brake: true }]) {
    const r = run(input);
    assert.equal(r.deployed, false, `deploying lit while braking (${JSON.stringify(input)})`);
    gte(r.energy, 0.8, `energy fell to ${r.energy} while braking (${JSON.stringify(input)})`);
  }
  const ctl = run({ throttle: true });   // control: the same BOOST on the gas still pays
  assert.equal(ctl.deployed, true);
  lt(ctl.energy, 0.8);
  P.boostOn = false;
});

test("manual 8th reaches the same top speed as auto on a Monza straight", async () => {
  await startRace();
  const f = straightFrac();
  // Fresh games, because the gearbox mode is a boot-time preference; auto X-mode
  // on the zone is the gain the limiter used to swallow (without it the speed
  // never moves from 61 and the test could not tell fixed from unfixed).
  const speedAfter8s = async (manual) => {
    const m = await createGame({ track: "monza", storage: { manual, aeroMode: "auto" } });
    try {
      await m.race("monza", "day", "dry");
      const P = m.G.player;
      clearRoad(m.G);
      m.apex.jump(f, 61, 0);
      m.apex.setInput({ throttle: true });
      for (let i = 0; i < 60 * 8; i++) { if (manual) P.gear = 8; m.apex.step(1 / 60, 1); }
      return P.speed;
    } finally { m.close(); }
  };
  const auto = await speedAfter8s(false), manual = await speedAfter8s(true);
  gte(manual, auto - 0.5, `manual ${manual.toFixed(2)} vs auto ${auto.toFixed(2)}`);
  gt(auto, 61.5, `auto X-mode must move the car off 61 m/s (${auto.toFixed(2)})`);
});
