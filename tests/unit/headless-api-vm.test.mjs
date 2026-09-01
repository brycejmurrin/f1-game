/* headless-api-vm.test.mjs — tests/specs/headless-api.spec.js replayed in the
 * Node VM (tools/game-vm.cjs): the headless control loop — headless(), obs(),
 * act(), reset() — with the SAME assertions and thresholds as the browser spec.
 *
 * Ported: all 24 tests. The two "before track load" tests (obs() null,
 * reset() false) run FIRST against the virgin boot — the VM boots without
 * racing (storage.trackId only) so the pre-race state is observable, and the
 * first race() below is what the browser's loadRace() does.
 * Not portable: none — every assertion reads an `__apex` JSON hook.
 *
 * The browser spec stays the truth until CI has run this twin.
 * Run: node --test tests/unit/headless-api-vm.test.mjs   (~5 s, one boot)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/game-vm.cjs");

// Playwright's toBeCloseTo(expected, digits): |e - r| < 10^-digits / 2.
const closeTo = (r, e, d, m) => assert.ok(Math.abs(e - r) < Math.pow(10, -d) / 2, m || `${r} not within 10^-${d}/2 of ${e}`);
const gt = (a, b, m) => assert.ok(a > b, m || `${a} > ${b}`);
const lt = (a, b, m) => assert.ok(a < b, m || `${a} < ${b}`);
const isNum = (v, m) => assert.equal(typeof v, "number", m);

let g = null;
before(async () => { g = await createGame({ storage: { trackId: "monza" } }); });
after(() => { if (g) g.close(); });

// Shared page semantics: race(id) then jump mid-track at racing speed so obs()
// has a valid world-space position (the spec's loadRace()).
async function loadRace(trackId = "monza") {
  await g.race(trackId);
  g.apex.jump(0.1, 40, 0);
}

// ── before any race: the virgin-page tests ──────────────────────────────────

test("obs() returns null before track load", () => {
  assert.equal(g.apex.obs(), null);
});

test("reset() returns false when player not yet initialised", () => {
  let v;
  try {
    const r = g.apex.reset(0.1);
    v = r === false || (typeof r === "object" && r !== null);
  } catch (e) { v = false; }
  assert.equal(v, true);
});

// ── __apex.headless() ───────────────────────────────────────────────────────

test("headless() returns false by default", async () => {
  await loadRace();
  assert.equal(g.apex.headless(), false);
});

test("headless() can be set to true and read back", async () => {
  await loadRace();
  g.apex.headless(true);
  assert.equal(g.apex.headless(), true);
});

test("headless() can be toggled off again", async () => {
  await loadRace();
  g.apex.headless(true);
  g.apex.headless(false);
  assert.equal(g.apex.headless(), false);
});

// ── __apex.obs() ────────────────────────────────────────────────────────────

test("obs() returns full observation object after jump", async () => {
  await loadRace();
  const obs = g.apex.obs();
  assert.notEqual(obs, null);

  // position
  isNum(obs.s); isNum(obs.x); isNum(obs.prog); isNum(obs.lap); isNum(obs.raceT);

  // motion
  isNum(obs.speed); isNum(obs.speedKph);
  closeTo(obs.speedKph, obs.speed * 3.6, 0);

  // physics
  isNum(obs.axFrac);
  assert.ok(obs.axFrac >= 0 && obs.axFrac <= 1, `axFrac ${obs.axFrac}`);
  isNum(obs.slipFactor);
  assert.ok(obs.slipFactor >= 0 && obs.slipFactor <= 1, `slipFactor ${obs.slipFactor}`);

  // track context
  isNum(obs.k); isNum(obs.hw); gt(obs.hw, 0); isNum(obs.slope);
  assert.equal(obs.gripMult, 1);   // dry by default

  // barrier clearances
  isNum(obs.wallR); isNum(obs.wallL); isNum(obs.clearR); isNum(obs.clearL);
  gt(obs.clearR, 0); gt(obs.clearL, 0);

  // state flags
  assert.equal(typeof obs.wrongWay, "boolean");
  assert.equal(typeof obs.done, "boolean");
  isNum(obs.offT); isNum(obs.rescueT);

  // input
  assert.equal(typeof obs.input, "object");

  // rivals
  isNum(obs.posInField);

  // lookahead scan
  assert.ok(Array.isArray(obs.scan));
  assert.equal(obs.scan.length, 3);
  assert.equal(obs.scan[0].d, 10);
  assert.equal(obs.scan[1].d, 30);
  assert.equal(obs.scan[2].d, 60);
  for (const pt of obs.scan) {
    isNum(pt.k); isNum(pt.hw); isNum(pt.wallR); isNum(pt.wallL); isNum(pt.width);
    gt(pt.width, 0);
  }

  // reward components
  assert.equal(typeof obs.reward, "object");
  isNum(obs.reward.speed); isNum(obs.reward.offTrack); isNum(obs.reward.wallDist);
  assert.equal(typeof obs.reward.wrongWay, "boolean");
});

test("obs().done is false when driving normally", async () => {
  await loadRace();
  assert.equal(g.apex.obs().done, false);
});

test("clearR and clearL are positive when on-track at centre", async () => {
  await loadRace();
  g.apex.jump(0.1, 40, 0);
  const obs = g.apex.obs();
  closeTo(obs.x, 0, 0);
  gt(obs.clearR, 0); gt(obs.clearL, 0);
});

test("wallR > x (right wall is to the right of the car)", async () => {
  await loadRace();
  const obs = g.apex.obs();
  gt(obs.wallR, obs.x);
});

test("wet weather sets gripMult to 0.82", async () => {
  await loadRace();
  g.apex.weather("wet");
  const obs = g.apex.obs();
  closeTo(obs.gripMult, 0.82, 2);
  assert.equal(obs.weather, "wet");
});

// ── __apex.act() ────────────────────────────────────────────────────────────

test("act() returns obs on first call", async () => {
  await loadRace();
  const obs = g.apex.act({ steer: 0, throttle: true, brake: false }, 1 / 60, 1);
  assert.notEqual(obs, null);
  isNum(obs.speed);
  assert.equal(typeof obs.done, "boolean");
});

test("throttle for 60 ticks increases speed from rest", async () => {
  await loadRace();
  g.apex.reset(0.1, 0, 0);   // in race state at rest
  const obs = g.apex.act({ steer: 0, throttle: true, brake: false }, 1 / 60, 60);
  gt(obs.speed, 5);
});

test("braking reduces speed", async () => {
  await loadRace();
  const before = g.apex.reset(0.1, 60, 0);
  const after = g.apex.act({ steer: 0, throttle: false, brake: true }, 1 / 60, 30);
  lt(after.speed, before.speed);
});

test("input field in obs reflects what was passed to act", async () => {
  await loadRace();
  const obs = g.apex.act({ steer: 0.5, throttle: true, brake: false }, 1 / 60, 1);
  closeTo(obs.input.steer, 0.5, 5);
  assert.equal(obs.input.throttle, true);
  assert.equal(obs.input.brake, false);
});

test("act(null) clears test input", async () => {
  await loadRace();
  g.apex.act({ steer: 0.9, throttle: true }, 1 / 60, 1);
  const obs = g.apex.act(null, 1 / 60, 1);
  assert.equal(obs.input.steer, null);
});

test("n=10 steps advances further than n=1", async () => {
  await loadRace();
  g.apex.reset(0.1, 40, 0);
  const a = g.apex.act({ steer: 0, throttle: true }, 1 / 60, 1);
  g.apex.reset(0.1, 40, 0);
  const b = g.apex.act({ steer: 0, throttle: true }, 1 / 60, 10);
  gt(b.s, a.s);
});

test("headless mode does not break act()", async () => {
  await loadRace();
  g.apex.headless(true);
  const obs = g.apex.act({ steer: 0, throttle: true }, 1 / 60, 5);
  g.apex.headless(false);
  assert.notEqual(obs, null);
  assert.ok(obs.speed >= 0, `speed ${obs.speed}`);
});

// ── __apex.reset() ──────────────────────────────────────────────────────────

test("reset() returns obs after reset", async () => {
  await loadRace();
  const obs = g.apex.reset(0.1, 30, 0);
  assert.notEqual(obs, null);
  isNum(obs.speed);
});

test("reset() places player near the requested lap fraction", async () => {
  await loadRace();
  const obs = g.apex.reset(0.25, 0, 0);
  // prog is in metres; track.total varies, but fraction should be near 0.25
  const expectedS = 0.25 * g.apex.info().total;
  gt(obs.s, expectedS - 50);
  lt(obs.s, expectedS + 50);
});

test("reset() sets initial speed correctly", async () => {
  await loadRace();
  const obs = g.apex.reset(0.1, 55, 0);
  closeTo(obs.speed, 55, 0);
});

test("reset() resets lap counter to 0", async () => {
  await loadRace();
  assert.equal(g.apex.reset(0.1, 0, 0).lap, 0);
});

test("done is false immediately after reset", async () => {
  await loadRace();
  assert.equal(g.apex.reset(0.1, 40, 0).done, false);
});

test("can reset multiple times and always return valid obs", async () => {
  await loadRace();
  const results = [g.apex.reset(0.1, 30, 0), g.apex.reset(0.5, 50, 1), g.apex.reset(0.9, 0, -2)];
  for (const obs of results) {
    assert.notEqual(obs, null);
    isNum(obs.speed);
    assert.equal(obs.done, false);
  }
});

// ── headless control loop integration ───────────────────────────────────────

test("50-step control loop completes with valid final obs", async () => {
  await loadRace();
  g.apex.headless(true);
  g.apex.reset(0.1, 40, 0);
  let obs;
  for (let i = 0; i < 50; i++) {
    const steer = obs ? Math.sign(obs.clearL - obs.clearR) * 0.2 : 0;
    obs = g.apex.act({ steer, throttle: true, brake: false }, 1 / 60, 1);
    if (obs.done) break;
  }
  g.apex.headless(false);
  assert.notEqual(obs, null);
  isNum(obs.speed);
  assert.equal(typeof obs.done, "boolean");
  assert.ok(Array.isArray(obs.scan));
});
