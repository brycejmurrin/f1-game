/* obs-act-edge-vm.test.mjs — tests/specs/obs-act-edge.spec.js replayed in the
 * Node VM (tools/game-vm.cjs): act()/reset()/obs() boundary conditions, the
 * lap seam, scan wrap-around and numeric stability, with the SAME assertions.
 *
 * Ported: all 16 tests (the three multi-track seam tests race monaco, suzuka
 * and spa on the same boot — ~1 s a build here).
 * Not portable: none — every assertion reads an `__apex` JSON hook.
 *
 * The browser spec stays the truth until CI has run this twin.
 * Run: node --test tests/unit/obs-act-edge-vm.test.mjs   (~8 s, one boot)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/game-vm.cjs");

const closeTo = (r, e, d, m) => assert.ok(Math.abs(e - r) < Math.pow(10, -d) / 2, m || `${r} not within 10^-${d}/2 of ${e}`);
const gt = (a, b, m) => assert.ok(a > b, m || `${a} > ${b}`);
const lt = (a, b, m) => assert.ok(a < b, m || `${a} < ${b}`);

let g = null, PHYS0 = null;
before(async () => { g = await createGame({ track: "monza" }); PHYS0 = { ...g.apex.tuning() }; });
after(() => { if (g) g.close(); });

// The browser spec gets a FRESH page per test; one boot here, so put back the
// physics knobs and the headless flag a previous test may have left behind.
const fresh = () => { g.apex.setPhysics(PHYS0); g.apex.headless(false); };

async function loadRace(trackId = "monza") {
  fresh();
  await g.race(trackId);
  g.apex.jump(0.1, 40, 0);
}

// ── act() edge cases ──────────────────────────────────────────────────────────

test("act(input, dt, 0) returns current obs without advancing s", async () => {
  await loadRace();
  g.apex.reset(0.2, 40, 0);
  const before = g.apex.obs();
  const fromAct = g.apex.act({ steer: 0, throttle: true }, 1 / 60, 0);
  // n=0 means zero physics steps — arc position unchanged
  closeTo(fromAct.s, before.s, 1);
});

test("act(null, dt, 0) with n=0 also does not advance physics", async () => {
  await loadRace();
  g.apex.reset(0.2, 40, 0);
  const before = g.apex.obs();
  const fromAct = g.apex.act(null, 1 / 60, 0);
  closeTo(fromAct.s, before.s, 1);
});

test("act with n=1 advances further than n=0", async () => {
  await loadRace();
  g.apex.reset(0.2, 40, 0);
  const a = g.apex.act({ steer: 0, throttle: true }, 1 / 60, 0);
  g.apex.reset(0.2, 40, 0);
  const b = g.apex.act({ steer: 0, throttle: true }, 1 / 60, 1);
  gt(b.s, a.s);
});

// ── reset() near the lap seam ─────────────────────────────────────────────────

test("reset(0.999) places player near end of lap without incrementing lap", async () => {
  await loadRace();
  const info = g.apex.info();
  const obs = g.apex.reset(0.999, 0, 0);
  const expectedS = 0.999 * info.total;
  gt(obs.s, expectedS - 50);
  lt(obs.s, expectedS + 50);
  assert.equal(obs.lap, 0);
});

test("driving past finish line from frac=0.999 increments lap counter", async () => {
  await loadRace();
  g.apex.headless(true);
  g.apex.reset(0.999, 40, 0);   // near finish, at racing speed
  let obs;
  for (let i = 0; i < 120; i++) {      // 2 s max
    obs = g.apex.act({ steer: 0, throttle: true, brake: false }, 1 / 60, 1);
    if (obs.lap > 0) break;
  }
  g.apex.headless(false);
  gt(obs.lap, 0);
});

test("scan returns finite values immediately after reset near seam", async () => {
  await loadRace();
  const result = g.apex.reset(0.999, 30, 0).scan;
  assert.ok(Array.isArray(result));
  for (const pt of result) {
    assert.ok(isFinite(pt.k)); assert.ok(isFinite(pt.hw));
    assert.ok(isFinite(pt.wallR)); assert.ok(isFinite(pt.wallL));
    gt(pt.width, 0);
  }
});

// ── scan() at track wrap-around ───────────────────────────────────────────────

test("scan returns no NaN at 5 positions near s = track.total", async () => {
  await loadRace();
  let hasNaN = false;
  for (const frac of [0.988, 0.991, 0.995, 0.998, 0.9995]) {
    g.apex.reset(frac, 30, 0);
    const obs = g.apex.obs();
    if (!obs) { hasNaN = true; break; }
    for (const pt of obs.scan || []) {
      if (!isFinite(pt.k) || !isFinite(pt.hw) ||
          !isFinite(pt.wallR) || !isFinite(pt.wallL) || !isFinite(pt.width)) hasNaN = true;
    }
  }
  assert.equal(hasNaN, false);
});

test("scan distances wrap correctly — each point is beyond the previous", async () => {
  await loadRace();
  // Near the end: 60 m ahead wraps around start/finish
  g.apex.reset(0.997, 30, 0);
  const scans = g.apex.obs().scan;
  assert.equal(scans[0].d, 10);
  assert.equal(scans[1].d, 30);
  assert.equal(scans[2].d, 60);
  for (const pt of scans) gt(pt.width, 0);
});

test("clearR and clearL are positive for scan at wrap-around positions", async () => {
  await loadRace();
  g.apex.reset(0.997, 30, 0);
  const obs = g.apex.obs();
  gt(obs.clearR, 0); gt(obs.clearL, 0);
});

// ── obs().done semantics ──────────────────────────────────────────────────────

test("done is false immediately after reset()", async () => {
  await loadRace();
  assert.equal(g.apex.reset(0.3, 40, 0).done, false);
});

test("done is false during normal forward driving", async () => {
  await loadRace();
  g.apex.headless(true);
  g.apex.reset(0.3, 40, 0);
  let o;
  for (let i = 0; i < 60; i++) o = g.apex.act({ steer: 0, throttle: true, brake: false }, 1 / 60, 1);
  g.apex.headless(false);
  assert.equal(o.done, false);
});

test("done becomes true when wrong-way is active", async () => {
  await loadRace();
  g.apex.headless(true);
  g.apex.reset(0.3, 25, 0);
  g.apex.aim(180);   // face backwards
  let obs;
  for (let i = 0; i < 80; i++) {
    obs = g.apex.act({ steer: 0, throttle: true, brake: false }, 1 / 60, 1);
    if (obs.wrongWay) break;
  }
  g.apex.headless(false);
  assert.equal(obs.done, true);
});

test("done resets to false after reset() clears wrong-way", async () => {
  await loadRace();
  g.apex.headless(true);
  g.apex.reset(0.3, 25, 0);
  g.apex.aim(180);
  for (let i = 0; i < 60; i++) {
    g.apex.act({ steer: 0, throttle: true, brake: false }, 1 / 60, 1);
    if (g.apex.obs().wrongWay) break;
  }
  const doneBefore = g.apex.obs().done;
  const obsAfter = g.apex.reset(0.3, 40, 0);
  g.apex.headless(false);
  assert.equal(doneBefore, true);
  assert.equal(obsAfter.done, false);
});

// ── obs() numeric stability ───────────────────────────────────────────────────

test("obs() returns no NaN or Infinity at 20 positions around full lap", async () => {
  await loadRace();
  const bad = [];
  for (let i = 0; i < 20; i++) {
    const frac = i / 20;
    g.apex.reset(frac, 40, 0);
    const obs = g.apex.obs();
    if (!obs) { bad.push(frac); continue; }
    const fields = [obs.s, obs.x, obs.speed, obs.k, obs.hw,
                    obs.wallR, obs.wallL, obs.clearR, obs.clearL,
                    obs.axFrac, obs.slipFactor];
    for (const pt of obs.scan || []) fields.push(pt.k, pt.hw, pt.wallR, pt.wallL, pt.width);
    if (fields.some((v) => !isFinite(v))) bad.push(frac);
  }
  assert.deepEqual(bad, []);
});

test("reward object fields are always finite numbers", async () => {
  await loadRace();
  g.apex.headless(true);
  g.apex.reset(0.3, 40, 0);
  let bad = false;
  for (let i = 0; i < 60; i++) {
    const obs = g.apex.act({ steer: 0, throttle: true, brake: false }, 1 / 60, 1);
    const r = obs.reward || {};
    if (!isFinite(r.speed) || !isFinite(r.offTrack) || !isFinite(r.wallDist)) { bad = true; break; }
  }
  g.apex.headless(false);
  assert.equal(bad, false);
});

// ── multi-track scan robustness ───────────────────────────────────────────────

for (const trackId of ["monaco", "suzuka", "spa"]) {
  test(`scan near seam is finite on ${trackId}`, async () => {
    await loadRace(trackId);
    let ok = true;
    for (const frac of [0.994, 0.997, 0.9995]) {
      g.apex.reset(frac, 30, 0);
      const obs = g.apex.obs();
      if (!obs) { ok = false; break; }
      for (const pt of obs.scan || []) {
        if (!isFinite(pt.k) || !isFinite(pt.hw) || pt.width <= 0) ok = false;
      }
    }
    assert.equal(ok, true);
  });
}
