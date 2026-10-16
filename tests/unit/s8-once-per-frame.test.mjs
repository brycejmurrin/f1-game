/* s8-once-per-frame.test.mjs — PERF-HUNT-2 S8: caution / coach / race-radio
 * run once per display frame (last physics step, summed sim dt).
 *
 * Pins:
 *   1. game.js gates the three call sites on _audioParamStep with _s8Pres.
 *   2. Each module no-ops a second update() under the same G._s8Stamp.
 *   3. A new stamp allows another body run (frame boundary).
 * carSfx stays per-step — intentionally not gated here.
 *
 * Run: node --test tests/unit/s8-once-per-frame.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";
import { gameSource } from "../helpers/game-source.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("game.js flushes caution/coach/radio once per frame on _audioParamStep (S8)", () => {
  const src = gameSource();
  assert.match(src, /const _s8Pres = \{ dt: 0 \}/,
    "_s8Pres accumulator must sit next to the engineer S8 latch");
  assert.match(src, /_s8Pres\.dt \+= dt/,
    "every physics sub-step must accumulate presentation dt");
  assert.match(src,
    /if \(_audioParamStep\) \{\s*\n\s*_s8Stamp = \(_s8Stamp == null \? 0 : _s8Stamp\) \+ 1;\s*\n\s*updateCaution\(_s8Pres\.dt\); coach\.update\(_s8Pres\.dt\); raceRadio\.update\(_s8Pres\.dt\);\s*\n\s*_s8Pres\.dt = 0;/,
    "flush caution+coach+radio only on the frame's last step with the summed dt");
  assert.match(src, /let _s8Stamp = null/,
    "stamp stays null until the first flush so harness coach.update loops are not latched at 0");
  assert.match(src, /get _s8Stamp\(\)/,
    "G._s8Stamp accessor publishes the stamp to the three modules");
  assert.match(src, /if \(soundOn && player\) carSfx\.update\(player\);/,
    "carSfx must stay per-step (edge detectors); S8 does not gate it");
  assert.doesNotMatch(src, /updateCaution\(dt\); coach\.update\(dt\); raceRadio\.update\(dt\);/,
    "the ungated per-step triple call must not return");
});

test("DrivingCoach.update runs once per G._s8Stamp", () => {
  const nodes = new Map(["pm-coach-status", "pm-coach-tip", "pm-coach-summary", "pm-drill-status",
    "pm-lap-report", "pm-practice-state", "pm-driving-trace"].map((id) => [id, { textContent: "" }]));
  const saved = new Map([["drivingCoach", true]]);
  const c = { speed: 60, lapTime: 0, brakeDemand: 0, throttleDemand: 1, s: 100, lap: 1 };
  let insightTicks = 0;
  const G = {
    player: c, track: { total: 1000, def: { turns: [0.10, 0.50, 0.98] } },
    state: "race", raceT: 0, paused: false, announceBusy: false,
    vTop: () => 100, trackWetness: () => 0, cautionInfo: () => ({ level: 0 }), cautionLevel: () => 0,
    fmtTime: (t) => String(t), store: { get: (k, d) => saved.get(k) ?? d, set: (k, v) => saved.set(k, v) },
    $: (id) => nodes.get(id) || null, timeTrial: false, practice: false,
    daily: { isActive: () => false }, netPlay: { active: () => false },
    records: { invalidate() {}, config: () => ({}) }, tyres: { on: () => false },
    pits: { ownedTyres: () => [], choices: () => [], estimate: () => null }, heard: true,
    announce: () => true,
  };
  const ctx = vm.createContext({
    RaceInsights: {
      create: () => ({
        update() { insightTicks++; }, reset() {}, summary: () => ({}), journal: () => [],
        forecast: () => null, network: () => null, startDrill: () => true, attempts: () => [], mastery: () => null,
      }),
      DRILLS: { free: "Free practice" },
    },
    SettingRow: { paint() {}, disable() {}, wire() {} },
    Ghost: { timeAt: () => null, bestTime: () => 60 },
    IncidentSim: { reset() {} }, DebrisWorld: { reset() {} },
    PhysicsConsts: { BRAKE: 22, REVISION: "test" },
  });
  vm.runInContext(readFileSync(join(ROOT, "js/race/driving-coach.js"), "utf8"), ctx);
  const coach = vm.runInContext("DrivingCoach", ctx).create(G);
  // insights.update fires when elapsed crosses 0.1 s — one 0.12 s tick trips it once.
  G._s8Stamp = 1;
  coach.update(0.12);
  coach.update(0.12);
  coach.update(0.12);
  assert.equal(insightTicks, 1, "insights.update once under the same stamp");
  G._s8Stamp = 2;
  coach.update(0.12);
  assert.equal(insightTicks, 2, "new stamp allows another insights.update");
  delete G._s8Stamp;
  coach.update(0.12);
  coach.update(0.12);
  assert.equal(insightTicks, 4, "without a stamp every call still runs");
});

test("RaceControl.update runs once per G._s8Stamp", () => {
  const ctx = vm.createContext({ Math, JSON, Object, Array, String, Number, isNaN, isFinite, console,
    DebrisWorld: { active: () => true, hazards: () => ({ total: 12, redTotal: 12, sectors: [0, 12, 0], worst: { count: 12, sector: 1, frac: 0.4 } }) },
  });
  seedLog(ctx);
  vm.runInContext(readFileSync(join(ROOT, "js/race/race-control.js"), "utf8"), ctx);
  const RC = vm.runInContext("RaceControl", ctx);
  const saved = new Map([["caution", true]]);
  const G = {
    state: "race", ranked: [], timeTrial: false, session: "race", raceT: 10,
    netPlay: { active: () => false, ownsRaceControl: () => true, reportCaution() {} },
    store: { get: (k, d) => (saved.has(k) ? saved.get(k) : d), set: (k, v) => saved.set(k, v) },
    announce: () => true,
  };
  const rc = RC.create(G);
  // Warm until a flag is up so sinceT advances.
  for (let i = 0; i < 30; i++) rc.update(1 / 60);
  const lvl = rc.level;
  assert.ok(lvl > 0, "hazard picture must raise a caution for the stamp probe");
  const t0 = rc.info().sinceT;   // info() rounds sinceT to 2 dp
  G._s8Stamp = 1;
  rc.update(0.5);
  rc.update(0.5);
  rc.update(0.5);
  const t1 = rc.info().sinceT;
  assert.ok(Math.abs(t1 - t0 - 0.5) < 0.015,
    `same stamp: sinceT must advance once by ~0.5 (got ${t0} → ${t1})`);
  G._s8Stamp = 2;
  rc.update(0.5);
  const t2 = rc.info().sinceT;
  assert.ok(Math.abs(t2 - t1 - 0.5) < 0.015,
    `new stamp: sinceT advances again by ~0.5 (got ${t1} → ${t2})`);
});

test("RaceRadio.update runs once per G._s8Stamp", () => {
  const ctx = vm.createContext({ Math, console, Object, Array, Number, JSON, isFinite, Map, Set, String, RegExp,
    Float64Array, Int32Array });
  seedLog(ctx);
  ctx.window = ctx;
  ctx.CamModes = { CAM_MODES: [{ id: "chase" }, { id: "cockpit" }, { id: "heli" }] };
  for (const f of ["js/audio/radio-voice.js", "js/race/radio-lines.js", "js/race/race-facts.js", "js/race/race-radio.js"]) {
    vm.runInContext(readFileSync(join(ROOT, f), "utf8"), ctx, { filename: f });
  }
  const RR = vm.runInContext("RaceRadio", ctx);
  let observes = 0;
  const cars = [
    { id: 0, human: true, local: true, prog: 100, speed: 50, lap: 1, s: 100, x: 0, finished: false, retired: false,
      brakeDemand: 0, axEstSm: 0, steerAngle: 0 },
    { id: 1, human: false, prog: 120, speed: 50, lap: 1, s: 120, x: 0, finished: false, retired: false },
  ];
  const G = {
    state: "race", timeTrial: false, practice: false, raceT: 20, cars, player: cars[0],
    track: { total: 5000 }, camMode: "chase", paused: false,
    store: { get: (k, d) => d, set() {} },
    announce: () => true, announceBusy: false,
    cautionLevel: () => 0, cautionInfo: () => ({ level: 0 }),
    vTop: () => 90, LAT_MAX: 20,
  };
  const radio = RR.create(G, { seed: 1 });
  // Wrap facts.observe via a second create after stubbing RaceFacts — instead count via
  // trafficSide / status stability: call update many times under one stamp and ensure
  // consumeRadio-style work does not multiply. Use a custom Input.consumeRadio counter.
  let consumes = 0;
  ctx.Input = { consumeRadio: () => { consumes++; return false; } };
  // Recreate so update closes over Input from ctx — Input is read as global at call time.
  const radio2 = RR.create(G, { seed: 2 });
  G._s8Stamp = 7;
  radio2.update(1 / 60);
  radio2.update(1 / 60);
  radio2.update(1 / 60);
  assert.equal(consumes, 1, "Input.consumeRadio once per stamp (spotter/radio tick)");
  G._s8Stamp = 8;
  radio2.update(1 / 60);
  assert.equal(consumes, 2, "new stamp allows another radio tick");
  delete G._s8Stamp;
  radio2.update(1 / 60);
  radio2.update(1 / 60);
  assert.equal(consumes, 4, "without a stamp every call still runs (unit / harness path)");
});
