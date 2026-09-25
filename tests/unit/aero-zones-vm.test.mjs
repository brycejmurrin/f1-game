/* aero-zones-vm.test.mjs — tests/specs/aero-zones.spec.js replayed in the Node
 * VM (tools/lib/game-vm.cjs): the authored activation zones, Monaco's zero,
 * inZone/zoneAhead, the overtake-mode rules active aero does NOT share, and
 * the X_VMAX_GAIN / X_DF_LOSS trade — with the SAME assertions and thresholds.
 *
 * Ported: all 10 tests. "a bigger wing trades HARDER" reloads the page three
 * times in the browser (the aero part is read by makeCars()); here it boots
 * three extra VMs with the same localStorage seed via createGame({ storage })
 * and closes each — the one test in the set with more than one boot.
 * The opening-lap overtake test does not step the browser spec's 220 s: the
 * rule is a pure function of the leader's lap, so it samples the first 10 s,
 * places the leader short of the line and samples the crossing (see the test).
 * Not portable: none — every assertion reads an `__apex` JSON hook.
 *
 * The browser spec stays the truth until CI has run this twin.
 * Run: node --test tests/unit/aero-zones-vm.test.mjs   (~45 s on a loaded box;
 * the opening-lap test was 80 s of it before 2026-09-25)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

const closeTo = (r, e, d, m) => assert.ok(Math.abs(e - r) < Math.pow(10, -d) / 2, m || `${r} not within 10^-${d}/2 of ${e}`);
const gt = (a, b, m) => assert.ok(a > b, m || `${a} > ${b}`);
const lt = (a, b, m) => assert.ok(a < b, m || `${a} < ${b}`);
const gte = (a, b, m) => assert.ok(a >= b, m || `${a} >= ${b}`);

const X_ZONE_MIN = 210;   // m — X_STRAIGHT_T * X_ZONE_VREF in js/physics/aero-zones.js

let g = null, PHYS0 = null;
before(async () => { g = await createGame({ track: "monza" }); PHYS0 = { ...g.apex.tuning() }; });
after(() => { if (g) g.close(); });

// VM objects have the VM realm's prototypes: strict deepEqual sees a "not
// reference-equal" Array.prototype. Compare plain-data copies instead.
const host = (v) => JSON.parse(JSON.stringify(v));
const deepEq = (a, b, m) => assert.deepEqual(host(a), host(b), m);

// The spec's loadTrack(): race(id) and wait for the build. (The harness's
// race() also calls go(); the tests that need it call go() again, which is
// idempotent — state "race", lights out.) The browser gets a FRESH page per
// test; one boot here, so put back the physics knobs (the pace test leaves
// 1.5 behind) and the headless flag first.
async function loadTrack(id) {
  g.apex.setPhysics(PHYS0); g.apex.headless(false);
  await g.race(id);
}

test("a fast circuit has zones, and every one clears the three-second minimum", async () => {
  await loadTrack("monza");
  const zones = g.apex.aeroZones();
  gt(zones.length, 0);
  for (const z of zones) gte(z.len, X_ZONE_MIN, `zone at ${z.start}m`);
  gt(Math.max(...zones.map((z) => z.len)), 700);
});

test("MONACO has no zone at all — 2026 switches active aero off there", async () => {
  await loadTrack("monaco");
  deepEq(g.apex.aeroZones(), []);
});

for (const [id, want] of [["monza", 2], ["baku", 2], ["qatar", 1], ["albert_park", 5]]) {
  test(`${id} gets the real number of zones, not a derived guess`, async () => {
    await loadTrack(id);
    const zones = g.apex.aeroZones();
    assert.equal(zones.length, want, `${id} zone count`);
    for (const z of zones) gt(z.len, 100, `${id} zone at ${z.start}m`);
  });
}

test("with no zone, the mode can never arm however hard it is asked for", async () => {
  await loadTrack("monaco");
  const A = g.apex;
  A.headless(true); A.go();
  const out = [];
  for (const frac of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    A.jump(frac, 55, 0);
    A.step(1 / 60, 2);
    A.aero(true);
    A.act({ throttle: true }, 1 / 60, 40);
    const a = A.aero();
    out.push({ frac, armed: a.xArmed, aeroX: a.aeroX, zones: a.zones });
  }
  for (const p of out) {
    assert.equal(p.zones, 0, `zones at ${p.frac}`);
    assert.equal(p.armed, false, `armed at ${p.frac}`);
    assert.equal(p.aeroX, 0, `flap at ${p.frac}`);
  }
});

test("zones are a property of the CIRCUIT — the pace slider cannot add or remove one", async () => {
  await loadTrack("monza");
  g.apex.setPhysics({ pace: 0.5 });
  const slow = g.apex.aeroZones();
  g.apex.setPhysics({ pace: 1.5 });
  const fast = g.apex.aeroZones();
  deepEq(fast, slow);
});

test("inZone and zoneAhead agree with the zone list, wrap included", async () => {
  await loadTrack("monza");
  const A = g.apex;
  A.headless(true); A.go();
  const zones = A.aeroZones();
  const z = zones.slice().sort((a, b) => b.len - a.len)[0];
  A.jump(z.midFrac, 60, 0);
  A.step(1 / 60, 2);
  const inside = A.aero();
  assert.equal(inside.inZone, true);
  assert.equal(inside.zoneAhead, 0, "zero distance while standing in one");
  assert.equal(inside.xArmed, true);
});

test("outside a zone, zoneAhead counts down a real distance", async () => {
  await loadTrack("monza");
  const A = g.apex;
  A.headless(true); A.go();
  const seen = [];
  for (let i = 0; i < 40; i++) {
    A.jump(i / 40, 60, 0);
    A.step(1 / 60, 1);
    const a = A.aero();
    seen.push({ inZone: a.inZone, ahead: a.zoneAhead });
  }
  for (const p of seen) {
    if (p.inZone) assert.equal(p.ahead, 0);
    else { gt(p.ahead, 0); assert.ok(Number.isFinite(p.ahead)); }
  }
  assert.equal(seen.some((p) => p.inZone), true, "some of the lap is inside a zone");
  assert.equal(seen.some((p) => !p.inZone), true, "and some of it is not");
});

// ── overtake mode — the rules active aero does NOT share ────────────────────

test("overtake stays disabled for the whole opening lap, then arms when the LEADER starts lap 2", async () => {
  // otEnabled() is `caution.level === 0 && leader.lap > 1` (js/race/race-control.js):
  // a pure function of the leader's lap count, so the 220 s the browser spec
  // drives to get the leader round (~16 s of VM here) buys nothing a line
  // crossing does not. The SAME invariant — on === (leaderLap > 1) on every
  // sample — is held over three stretches instead:
  //   1. the first 10 s from the lights, 1 s a sample (the opening lap);
  //   2. the leader placed 3 % of a lap short of the line, still on lap 1
  //      (aiPlace keeps its lap), sampled every 0.1 s as it drives across —
  //      the lap counter moves through race-control's real lineTransition();
  //   3. 5 s more of racing on lap 2, 1 s a sample.
  // The edge is asserted outright: the gate is shut on every sample before the
  // leader's lap reads 2 and open on every one after — no flicker, no lag.
  await loadTrack("monza");
  const A = g.apex;
  A.headless(true);
  A.go();
  A.jump(0, 60, 0);
  A.setInput({ throttle: true });
  const trail = [];
  const sample = (phase) => trail.push({ phase, leaderLap: Math.max(...A.cars().map((c) => c.lap)),
    on: A.carAt().otEnabled, level: A.caution().level });
  for (let i = 0; i < 10; i++) { A.step(1 / 60, 60); sample("open"); }   // 1 s of sim per sample
  // The AI leader (the player is under full throttle with no steering).
  const lead = A.cars().filter((c) => !c.p).sort((a, b) => b.prog - a.prog)[0];
  assert.equal(lead.lap, 1, "the leader is on the opening lap when it is placed");
  assert.ok(A.aiPlace(lead.id, 0.97, 60, 0), "leader placed short of the line");
  for (let i = 0; i < 80; i++) { A.step(1 / 60, 6); sample("edge"); }    // 0.1 s a sample
  for (let i = 0; i < 5; i++) { A.step(1 / 60, 60); sample("lap2"); }
  A.clearInput();
  for (const s of trail) assert.equal(s.level, 0, `no flag flew (${s.phase})`);
  for (const s of trail) assert.equal(s.on, s.leaderLap > 1, `${s.phase}: leaderLap ${s.leaderLap} on ${s.on}`);
  assert.equal(trail.filter((s) => s.phase === "open").every((s) => !s.on), true, "the opening lap is covered");
  assert.equal(trail.some((s) => s.on), true, "and the race gets past it");
  // The edge: one transition, off -> on, exactly where the leader's lap reads 2.
  const flips = trail.map((s, i) => (i && s.on !== trail[i - 1].on ? i : -1)).filter((i) => i > 0);
  assert.equal(flips.length, 1, `the gate changes state exactly once (flips at samples ${flips})`);
  const at = trail[flips[0]], prev = trail[flips[0] - 1];
  assert.equal(at.phase, "edge", "and it changes inside the sampled crossing");
  assert.deepEqual([prev.leaderLap, prev.on, at.leaderLap, at.on], [1, false, 2, true],
    "shut on the last lap-1 sample, open on the first lap-2 sample");
});

test("active aero is NOT gated by the opening lap — it arms inside a zone on lap 1", async () => {
  await loadTrack("monza");
  const A = g.apex;
  A.headless(true);
  A.go();
  const z = A.aeroZones().sort((a, b) => b.len - a.len)[0];
  A.jump(z.midFrac, 60, 0);
  A.step(1 / 60, 2);
  const leaderLap = Math.max(...A.cars().map((x) => x.lap));
  lt(leaderLap, 2, "still the opening lap");
  assert.equal(A.aero().xArmed, true, "active aero is available anyway");
  assert.equal(A.carAt().otEnabled, false, "overtake is not");
});

// ── downforce traded for top speed ──────────────────────────────────────────

test("X-mode buys X_VMAX_GAIN of vmax and gives up X_DF_LOSS of the aero load", async () => {
  await loadTrack("monza");
  const A = g.apex;
  A.headless(true); A.go();
  const zone = A.aeroZones().slice().sort((a, b) => b.len - a.len)[0];
  const read = (wantX) => {
    A.reset(zone.midFrac, 70, 0);
    // The player tows like the AI now (game.js updateCar, human branch): a grid
    // car launching inside the 34 m window would fold a slipstream gain into
    // vmaxNow. Park the field half a lap away so the ratio is X-mode alone.
    A.cars().forEach((c) => { if (!c.p) A.aiPlace(c.id, (zone.midFrac + 0.5) % 1, 0, 0); });
    A.setInput({ throttle: true });
    for (let i = 0; i < 60; i++) { A.aero(wantX); A.step(1 / 60, 1); }
    const ps = A.physState();
    A.clearInput();
    assert.equal(ps.towing, 0, "no slipstream in the sample");
    return { aeroX: ps.aeroX, vmaxNow: ps.vmaxNow, aeroGrip: ps.aeroGrip,
             aeroDf: ps.aeroDf, xVmaxGain: ps.xVmaxGain, xDfLoss: ps.xDfLoss,
             onTrack: Math.abs(ps.x) < 8 };
  };
  const r = { z: read(false), x: read(true) };
  assert.equal(r.z.onTrack && r.x.onTrack, true, "both samples taken on track");
  assert.equal(r.z.aeroX, 0);
  assert.equal(r.x.aeroX, 1);
  closeTo(r.x.vmaxNow / r.z.vmaxNow, 1 + r.z.xVmaxGain, 3);
  closeTo(r.z.aeroDf, 1, 3);
  closeTo(r.x.aeroDf, 1 - r.z.xDfLoss, 3);
  lt(r.x.aeroGrip, r.z.aeroGrip);
  gt(r.z.aeroGrip, 1);
});

test("a bigger wing trades HARDER — both halves scale with the aero part", async () => {
  // The aero part is read by makeCars(): each setting is its own boot with
  // the same localStorage the browser test writes before page.reload().
  const teamId = g.apex.teams()[0].id;
  const rows = [];
  for (const aero of ["minimal", "medium", "ground_effect"]) {
    const h = await createGame({ track: "monza", storage: {
      ["parts." + teamId]: { aero },
      team: 0,                 // localStorage "0", as the browser writes it
      unlimitedBudget: true,   // `extreme` blows the 780 cr cap
    } });
    try {
      const A = h.apex;
      A.headless(true); A.go();
      const z = A.aeroZones().slice().sort((a, b) => b.len - a.len)[0];
      A.reset(z.midFrac, 70, 0);
      A.setInput({ throttle: true });
      for (let i = 0; i < 30; i++) { A.aero(false); A.step(1 / 60, 1); }
      const ps = A.physState();
      A.clearInput();
      rows.push({ load: ps.aeroLoad, gain: ps.xVmaxGain, loss: ps.xDfLoss });
    } finally { h.close(); }
  }
  const [small, mid, big] = rows;
  lt(small.load, mid.load);
  lt(mid.load, big.load);
  lt(small.gain, mid.gain);
  lt(mid.gain, big.gain);
  lt(small.loss, mid.loss);
  lt(mid.loss, big.loss);
  gt(big.gain / small.gain, 2);
});
