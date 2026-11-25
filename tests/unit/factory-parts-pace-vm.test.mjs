/* factory-parts-pace-vm — the works car is the neutral car on the road, in the REAL game (tools/lib/game-vm.cjs).
 *
 * Bryce's decision of 2026-11-25: "Scale factory parts to ~1.0". Before it, modsFor multiplied the raw twelve-
 * category product of a team's FACTORY_PRESETS build (McLaren 1.12 / 2.07 / 2.76 / 1.93), and the AI never reads
 * mods: a factory-kit player lapped Monza 10 % under the field. Parts.playerMods now reads the build over the works
 * one. Pinned here, driving the player's own physics:
 *   1. LAP PACE, Monza and Suzuka, McLaren and Williams: a factory-kit lap is no slower than the same car on
 *      neutral ×1 stat mods (within 0.5 %), its mods are that car × the half grip reserve (#6705, Parts.worksMods),
 *      and the old raw-factory mods lap quicker still and ≥ 3 % under neutral (Monza Williams, a small upgrade:
 *      ≥ 2 %, RAW_GAP below).
 *   2. STRAIGHT LINE (Ferrari, field benched, full throttle): an empty free-play sheet IS the works car, and a
 *      speed/accel upgrade above the works part still reaches 0.6·vTop sooner and runs a higher peak.
 *
 * The lap policy is physics-tune-sweep's curvature-fed closed loop (centreline, grip budget in m/s², no speed
 * literal), its budget scaled by the car's own cornering/braking mods so a stronger car is driven harder.
 * The lap times are the POLICY's, not a human's: only the ratios are asserted.
 *
 * Run: node --test tests/unit/factory-parts-pace-vm.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");
const K = ["speed", "accel", "cornering", "braking"];

async function seat(track, teamId, parts) {
  const probe = await createGame({ carMeshes: false });
  const ti = probe.sandbox.Teams.LIST.findIndex((t) => t.id === teamId);
  probe.close();
  return createGame({ track, carMeshes: false, storage: { team: ti, driver: 0, ["parts." + teamId]: parts || {} } });
}

async function worksOf(teamId) {
  const g = await createGame({ carMeshes: false });
  try { const t = g.sandbox.Teams.LIST.find((x) => x.id === teamId); return { ...g.sandbox.Parts.worksMods(t) }; } finally { g.close(); }
}

async function lap(track, teamId, arm) {
  const g = await seat(track, teamId);
  try {
    const A = g.apex, G = g.G, P = g.sandbox.Parts;
    A.tt(track, "day");
    // A SOLO time trial, not the race createGame booted: A.tt sets G.timeTrial at once but swaps the 22-car grid
    // for the lone TT car a host turn later, and settle() tests before it yields — so `G.timeTrial` alone let the
    // lap run in race traffic, whose outcome moved with the host (CI 169.27 s vs 171.40 s locally, Suzuka Williams).
    assert.ok(await g.settle(() => G.timeTrial && G.track && G.player && G.cars.length === 1 && G.state !== "race"), "time trial up");
    const t = G.player.team, st = g.sandbox.Career.teamStats(t) || t.stats;
    assert.equal(t.id, teamId);
    const raw = P.getMods(P.getFactorySetup(t), t);
    A.headless(true);
    A.reset(0.02, 25, 0, 4242);
    if (arm !== "factory") {
      const m = {};
      for (const k of K) m[k] = P.statMult(st[k]) * (arm === "raw" ? raw[k] : 1);
      G.player.mods = m;
    }
    const mods = G.player.mods, tuning = A.tuning();
    const prof = A.trackProfile(480), total = A.world().track.lengthM, ds = total / prof.length;
    const mu = 22 * (tuning.playerGrip || 1) * 0.8 * mods.cornering, brake = 22 * 0.8 * mods.braking;
    const vt = new Float64Array(prof.length);
    for (let i = 0; i < prof.length; i++) { const k = Math.abs(prof[i].k); vt[i] = k > 1e-5 ? Math.sqrt(mu / k) : 1e4; }
    for (let p = 0; p < 2; p++) for (let i = prof.length - 1; i >= 0; i--) {
      const reach = Math.sqrt(vt[(i + 1) % prof.length] ** 2 + 2 * brake * ds);
      if (reach < vt[i]) vt[i] = reach;
    }
    let o = A.obs(), T = 0;
    const startLap = o.lap, DT = 1 / 60, SUB = 4;
    for (let i = 0; i < 3000; i++) {
      const w = A.world({ detail: "drive" });
      const steer = Math.max(-1, Math.min(1, -(w.ego.headingErrDeg || 0) / 12 - (w.ego.lateralM || 0) / 14));
      const sp = o.speed || 0, tgt = vt[Math.floor((((o.prog % total) / total) % 1) * prof.length) || 0];
      const braking = sp > tgt * 1.02 && sp > 3;
      o = A.act({ steer, throttle: !braking && sp < tgt, brake: braking }, DT, SUB);
      assert.ok(o, "act stepped");
      T += DT * SUB;
      if (o.lap > startLap) return { T, mods: { ...mods } };
    }
    assert.fail(`${track} ${teamId} ${arm}: no lap in 200 s`);
  } finally { g.close(); }
}

// The raw factory kit's lap gain over the neutral car, per row (≥ 3 % unless named). #6573's brake over-rotation
// damp stopped the neutral car losing time to mid-corner brake snaps (Monza Williams neutral 151.53 → 146.00 s), so
// Williams' small-upgrade raw kit now measures 2.6 % at Monza (raw 142.20 s); Suzuka Williams 4.8 %, McLaren ≥ 22 %.
// Re-anchored from those numbers by Bryce's decision A (PR #6662, 2026-11-25).
const RAW_GAP = { "monza williams": 0.02 };
// THE GRIP RESERVE (#6705, Bryce's pick B after "braking and grip got worse"): the works car keeps half (log share)
// of its cornering/braking bonus, so it laps between the neutral car and the raw kit. Measured (neutral / works / raw):
// Monza McLaren 143.87 / 135.73 / 111.33 s, Williams 146.00 / 146.07 / 142.20 (its works cornering is under ×1, so
// only braking ×1.02 is kept); Suzuka McLaren 166.87 / 153.07 / 127.40, Williams 169.67 / 169.53 / 161.47.

for (const track of ["monza", "suzuka"]) for (const teamId of ["mclaren", "williams"]) {
  test(`${track} ${teamId}: the works car laps at or under neutral pace; the old raw factory kit is quicker still`, { timeout: 300000 }, async () => {
    const neutral = await lap(track, teamId, "neutral");
    const factory = await lap(track, teamId, "factory");
    const raw = await lap(track, teamId, "raw");
    const w = await worksOf(teamId);
    for (const k of K) assert.ok(Math.abs(factory.mods[k] - neutral.mods[k] * w[k]) < 1e-9, `${k}: works mods are the neutral car × the grip reserve`);
    assert.ok(factory.T <= neutral.T * 1.005, `works ${factory.T.toFixed(2)} s is not slower than neutral ${neutral.T.toFixed(2)} s`);
    assert.ok(raw.T < factory.T, `raw factory ${raw.T.toFixed(2)} s stays quicker than the reserve car ${factory.T.toFixed(2)} s`);
    const gap = RAW_GAP[`${track} ${teamId}`] ?? 0.03;
    assert.ok(raw.T < neutral.T * (1 - gap), `raw factory ${raw.T.toFixed(2)} s is the closed gap (neutral ${neutral.T.toFixed(2)} s, ≥ ${gap * 100} %)`);
  });
}

async function straight(parts) {
  const g = await seat("monza", "ferrari", parts);
  try {
    const A = g.apex, G = g.G;
    await g.race("monza", "day", "dry", { laps: 3 });
    A.go();
    G.cars.forEach((c, i) => { if (c !== G.player && !c.retired) A.retire(i, "bench"); });
    G.cars.forEach((c) => { if (c.retired) { c.x = (c.x >= 0 ? 1 : -1) * 500; c.xVis = c.x; c.parkedOnRoad = false; } });
    const p = G.player, target = 0.6 * G.vTop();
    let t = 0, reach = null, peak = 0;
    for (let f = 0; f < 14 * 60; f++) {
      A.setInput({ steer: 0, throttle: true, brake: false });
      g.step(1, 1 / 60); t += 1 / 60;
      if (reach == null && p.speed >= target) reach = t;
      if (p.speed > peak) peak = p.speed;
    }
    return { reach, peak, mods: { ...p.mods } };
  } finally { g.close(); }
}

test("straight line: an empty sheet is the works car; an upgrade above it is quicker", { timeout: 300000 }, async () => {
  const { loadParts } = await import("../../tools/car/parts-sweep.mjs");
  const { Parts, Teams } = loadParts();
  const t = Teams.LIST.find((x) => x.id === "ferrari"), works = Parts.getFactorySetup(t);
  // The available swap with the largest speed × accel gain that costs no stat anywhere.
  let best = null;
  for (const cat of Parts.CATALOG) for (const o of cat.options) {
    if (!Parts.isOptionAvailable(o, t)) continue;
    const m = Parts.playerMods(Object.assign({}, works, { [cat.id]: o.id }), t);
    if (K.every((k) => m[k] >= 1 - 1e-9) && (!best || m.speed * m.accel > best.gain)) best = { gain: m.speed * m.accel, cat: cat.id, id: o.id };
  }
  assert.ok(best && best.gain > 1.02, "ferrari has a no-cost straight-line upgrade: " + JSON.stringify(best));
  const empty = await straight({}), full = await straight(works), up = await straight({ ...works, [best.cat]: best.id });
  for (const k of K) assert.ok(Math.abs(empty.mods[k] - full.mods[k]) < 1e-12, `${k}: {} reads as the works sheet`);
  assert.ok(empty.reach != null && up.reach != null, "both reach 0.6·vTop");
  assert.ok(up.reach < empty.reach, `upgrade ${up.reach.toFixed(2)} s vs works ${empty.reach.toFixed(2)} s to 0.6·vTop`);
  assert.ok(up.peak > empty.peak, `upgrade peak ${up.peak.toFixed(1)} vs works ${empty.peak.toFixed(1)} m/s`);
});
