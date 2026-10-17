// storm-weather — the STORM weather (⛈, js/race/storm.js): above rain on the
// arc ladder, rain's grip and tread, heavier rain, a deterministic lightning
// schedule that never flashes under reduced motion, a safety-car start and a
// safety car while a storm rolls through, and a RACE SETTINGS chip that friend
// rooms offer too (js/net/lobby.js lists the word).
//
// The real storm.js, weather-arc.js, tyre-model.js, particles.js,
// race-control.js and race-settings.js in Node VMs — no browser, < 1 s. The
// in-game half (the real game.js frame: reduced-motion strike, room staging,
// grip) is tests/unit/storm-vm.test.mjs.
//
// Run: node --test tests/unit/storm-weather.test.mjs  (npm run test:tooling-fast)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLog } from "../helpers/seed-log.mjs";
import { makeRng } from "../helpers/seeded-fuzz.mjs";
import { symbolSource } from "../helpers/game-source.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const run = (ctx, f) => vm.runInContext(read(f).replace(/^const\b/gm, "var"), ctx, { filename: f });

function context(extra) {
  const rng = makeRng(0x5707);
  const ctx = vm.createContext(Object.assign({ Math: Object.assign(Object.create(Math), { random: () => rng.unit() }),
    Float32Array, Uint8Array, Array, Object, Number, JSON, WeakMap, Error, String, isFinite, isNaN }, extra));
  ctx.window = ctx;
  seedLog(ctx);
  return ctx;
}

/** weather-arc + tyre-model + particles + storm, G stubbed the way game.js wires it. */
function bootArc(hash) {
  const ctx = context();
  ctx.Career = { inCareer: () => false, hash: hash || ((_s, _r, _k, n) => (n === "dur" ? 0.5 : 0.1)) };
  for (const f of ["js/core/mat4.js", "js/physics/consts.js", "js/physics/tyre-model.js", "js/fx/particles.js", "js/race/storm.js", "js/race/weather-arc.js"]) run(ctx, f);
  const P = ctx.Particles;
  let drawn = 0;
  P.init({ drawParticles: (d, floats, additive) => { if (!additive) drawn += floats / 60; } });
  ctx.GameAudio = { startRain() {}, stopRain() {} };
  let wa = null;
  const G = {
    raceWeather: "dry", soundOn: false, track: null, announce() {}, applyRaceSettings() {},
    simSeed: () => 1, raceRound: 0, lapsTarget: 3, raceLaps: 3, netRoom: false,
    netPlay: { active: () => false },
    isWetRoad: () => wa.wetness() >= 0.25,
    isRaining: () => wa.wetness() >= 0.72,
    initRainDrops: () => P.rainSeed(G.isWetRoad() && !G.isRaining()),
  };
  wa = ctx.WeatherArc.create(G, { isTimeTrial: () => false, isQuali: () => false });
  const drops = () => { P.rainUpdate(1 / 60, [0, 1.2, 0], G.isRaining()); drawn = 0; P.draw(); return drawn; };
  return { ctx, G, wa, P, TM: ctx.TyreModel, WA: ctx.WeatherArc, S: ctx.Storm, drops };
}

test("storm is on the ladder above rain, and an arc walks to it stage by stage", () => {
  const { WA } = bootArc();
  assert.deepEqual([...WA.LADDER], ["dry", "wet", "rain", "storm"]);
  assert.ok(WA.VALID.includes("storm") && WA.TARGETS.includes("storm"), "storm is a valid weather and arc target");
  assert.deepEqual([...WA.arcSeq("dry", "storm")], ["dry", "wet", "rain", "storm"]);
  assert.deepEqual([...WA.arcSeq("storm", "dry")], ["storm", "rain", "wet", "dry"]);
});

test("a storm's road wetness, tread call and grip are exactly rain's", () => {
  const { G, wa, TM } = bootArc();
  wa.setWeatherLive("rain");
  const rain = { w: wa.wetness(), tread: TM.treadFor(G.raceWeather, wa.wetness()) };
  wa.setWeatherLive("storm");
  assert.equal(G.raceWeather, "storm", "setWeatherLive accepts storm");
  assert.equal(wa.wetness(), rain.w, "storm wetness = rain wetness");
  assert.equal(wa.wetness(), 1);
  assert.equal(TM.treadFor(G.raceWeather, wa.wetness()), rain.tread, "storm calls for the full wet, as rain does");
  for (const t of [0, 1, 2]) assert.equal(TM.weatherGrip(t, wa.wetness()), TM.weatherGrip(t, rain.w), "grip on tread " + t);
});

function walk(from, to, dur) {
  const B = bootArc();
  B.wa.setWeatherLive(from);
  B.wa.startArc(from, to, dur);
  const stages = [B.G.raceWeather], peak = {};
  for (let t = 0; t < dur * 4; t += 0.1) {
    B.wa.tick(0.1);
    if (stages[stages.length - 1] !== B.G.raceWeather) stages.push(B.G.raceWeather);
    if (B.G.isWetRoad()) peak[B.G.raceWeather] = Math.max(peak[B.G.raceWeather] || 0, B.drops());
    if (!B.wa.arc) break;
  }
  return { stages, peak, B };
}

test("dry → storm stages dry, wet, rain, storm in order; storm → dry walks back down", () => {
  const up = walk("dry", "storm", 120);
  assert.deepEqual(up.stages, ["dry", "wet", "rain", "storm"]);
  assert.equal(up.B.wa.arc, null, "the arc settles on storm");
  const down = walk("storm", "dry", 120);
  assert.deepEqual(down.stages, ["storm", "rain", "wet", "dry"]);
});

test("storm rain is heavier than rain: more streaks drawn", () => {
  const { peak } = walk("dry", "storm", 120);
  assert.ok(peak.rain > 200, "rain tier drew " + peak.rain);
  assert.ok(peak.storm >= peak.rain * 1.6, `storm ${peak.storm} vs rain ${peak.rain}`);
});

test("MIXED: a drawn rain escalates to storm, in a friend room too", () => {
  // from dry the drawn list is [overcast, wet, rain, fog]: 0.6 → rain; storm odds 0.1 < 0.25
  const hash = (_s, _r, _k, n) => (n === "to" ? 0.6 : n === "storm" ? 0.1 : 0.5);
  const solo = bootArc(hash);
  solo.G.raceWeather = "dry";
  assert.equal(solo.wa.planFor().to, "storm");
  const room = bootArc(hash);
  room.G.raceWeather = "dry";
  room.G.netRoom = true;
  assert.equal(room.wa.planFor().to, "storm", "a room's plan may name storm (lobby.js lists it)");
  const odds = bootArc((_s, _r, _k, n) => (n === "to" ? 0.6 : n === "storm" ? 0.4 : 0.5));
  odds.G.raceWeather = "dry";
  assert.equal(odds.wa.planFor().to, "rain", "1 in 4 only");
});

test("lightning: the schedule is a pure function of the seed and clock, and frame-rate independent", () => {
  const { S } = bootArc();
  const sched = (seed, w = "storm", rate = 1) => JSON.parse(JSON.stringify(S.schedule(seed, 0, 600, rate, w)));
  const a = sched(1234), b = sched(1234);
  assert.deepEqual(a, b, "same seed, same strikes");
  const other = sched(99);
  assert.notDeepEqual(other.map((s) => s.t), a.map((s) => s.t), "another seed, another sky");
  const perMin = a.length / 10;
  assert.ok(perMin >= 2 && perMin <= 6, "a few strikes a minute, got " + perMin);
  assert.ok(S.schedule(1234, 0, 600, 1, "rain").length < a.length / 2, "plain rain strikes far less");
  assert.equal(S.schedule(1234, 0, 600, 1, "dry").length, 0);
  assert.equal(S.schedule(1234, 0, 600, 0, "storm").length, 0, "LIGHTNING FREQ 0 = off");
  for (const s of a) assert.ok(s.delay >= 1 && s.delay <= 6, "thunder lags 1–6 s, got " + s.delay);
  // Walked frame by frame as game.js does (window = last clock → now), at two frame rates.
  for (const dt of [1 / 60, 1 / 23]) {
    const seen = [];
    let last = 0;
    for (let t = dt; t < 600; t += dt) { const s = S.strikeIn(1234, last, t, 1, "storm"); if (s) seen.push(s.t); last = t; }
    assert.deepEqual(seen, a.map((s) => s.t), "dt " + dt.toFixed(4) + ": every scheduled strike once");
  }
  assert.equal(S.strikeIn(1234, 0, 100, 1, "storm"), null, "a clock jump resyncs, never a burst");
  assert.equal(S.strikeIn(1234, 50, 10, 1, "storm"), null, "a clock that went back resyncs");
});

test("lightning never flashes under reduced motion (source guard on renderLightingPrep strike)", () => {
  const { S } = bootArc();
  assert.equal(S.flashOk(true), false);
  assert.equal(S.flashOk(false), true);
  const game = symbolSource("function renderLightingPrep(dt, hasLivePlayerShadow)");
  assert.match(game, /Storm\.strikeIn\(simSeed\(\), _ltNextT, ltNow, LT\.lightning, raceWeather\)/, "strikes come from the seeded schedule");
  assert.match(game, /if \(Storm\.flashOk\(motionReduced\(\)\)\) _ltFlash = 1\.0;/, "the flash is gated on motionReduced()");
  assert.doesNotMatch(game, /_ltNextT = \(4 \+ Math\.random\(\)/, "no Math.random strike countdown left");
});

/** race-control with storm.js, single-player owner, raceT driven by the test. */
function bootRC(over) {
  const ctx = context({ DebrisWorld: { active: () => false, hazards: () => ({ total: 0, redTotal: 0, sectors: [0, 0, 0], worst: { count: 0, sector: -1, frac: 0 } }) } });
  run(ctx, "js/race/storm.js");
  run(ctx, "js/race/race-control.js");
  const saved = new Map([["caution", true]]);
  const notes = [];
  const G = Object.assign({
    state: "race", ranked: [], raceT: 0, raceWeather: "dry", announce: (m) => { notes.push(m); return true; },
    netPlay: { active: () => false, ownsRaceControl: () => true, reportCaution() {} },
    store: { get: (k, d) => (saved.has(k) ? saved.get(k) : d), set: (k, v) => saved.set(k, v) },
  }, over);
  const rc = ctx.RaceControl.create(G);
  const adv = (secs) => { for (let i = 0; i < secs * 60; i++) { G.raceT += 1 / 60; rc.update(1 / 60); } };
  return { rc, G, adv, notes, S: ctx.Storm };
}

test("a race STARTED in a storm runs behind the safety car, then goes green", () => {
  const { rc, adv, notes, S } = bootRC({ raceWeather: "storm" });
  adv(1);
  assert.equal(rc.level, 3, "SC from the start");
  assert.equal(rc.info().cause, "STORM");
  assert.equal(rc.otEnabled(), false, "no Overtake behind the SC");
  assert.ok(notes.some((m) => /START BEHIND THE SAFETY CAR/.test(m)), notes.join("|"));
  adv(S.SC_START_S - 5);
  assert.equal(rc.level, 3, "still out inside the start window (cap-exempt)");
  adv(10);
  assert.equal(rc.level, 0, "in after the start window: a race that STAYS a storm still races");
});

test("a storm rolling in mid-race deploys the SC until it eases back to rain", () => {
  const { rc, G, adv, notes } = bootRC({ raceWeather: "rain" });
  adv(120);
  assert.equal(rc.level, 0, "rain alone is green");
  G.raceWeather = "storm";
  adv(1);
  assert.equal(rc.level, 3, "storm → SC");
  adv(60);
  assert.equal(rc.level, 3, "held while the storm lasts");
  G.raceWeather = "rain";
  adv(1);
  assert.equal(rc.level, 0, "eases to rain → SC in");
  assert.ok(notes.some((m) => /STORM EASING/.test(m)));
});

test("storm SC flies with CAUTIONS off, is bounded, and coexists with a scripted hold", () => {
  const off = bootRC({ raceWeather: "rain" });
  off.rc.setEnabled(false);
  off.adv(30);
  off.G.raceWeather = "storm";
  off.adv(1);
  assert.equal(off.rc.level, 3, "weather is not debris: the switch does not stop it");
  off.adv(off.S.SC_ROLL_S + 1);
  assert.equal(off.rc.level, 0, "a storm that settles in is capped at SC_ROLL_S");
  const both = bootRC({ raceWeather: "rain" });
  both.adv(30);
  assert.equal(both.rc.hold(1, "SCRIPT"), 1);
  both.adv(1);
  assert.equal(both.rc.level, 1);
  both.G.raceWeather = "storm";
  both.adv(1);
  assert.equal(both.rc.level, 3, "the storm's SC outranks the script's yellow");
  both.G.raceWeather = "rain";
  both.adv(1);
  assert.equal(both.rc.level, 1, "the storm leaves; the script's hold remains");
});

test("RACE SETTINGS: the ⛈ STORM chip is offered solo and in a room, matching the lobby's WEATHER list", () => {
  const ctx = context();
  run(ctx, "js/race/race-settings.js");
  const RS = ctx.RaceSettings;
  const ids = Array.from(RS.weatherOpts(), ([id]) => id);
  assert.equal(RS.weatherOpts().find(([id]) => id === "storm")[1], "⛈ STORM");
  const lobby = read("js/net/lobby.js").match(/const WEATHER = new Set\((\[[^\]]*\])\)/);
  assert.deepEqual(JSON.parse(lobby[1]).slice().sort(), ids.slice().sort(), "the sheet's list is the lobby's list");
  assert.equal(RS.roomWeather, undefined, "no room coercion left");
});

test("__apex.race() keeps weather \"storm\" instead of racing it dry", () => {
  const src = read("js/agent/apex.js");
  const m = src.match(/G\.raceWeather = \(([^?]*)\? weather : "dry"/);
  assert.ok(m, "race() weather mapping found");
  assert.match(m[1], /weather === "storm"/);
});

test("R2: a practice rewind does not extend the storm SC (raceT jumps back, the window follows)", () => {
  const { rc, G, adv, S } = bootRC({ raceWeather: "rain" });
  adv(120);
  G.raceWeather = "storm";
  adv(100);
  assert.equal(rc.level, 3, "storm SC out");
  G.raceT -= 100;                      // driving-coach restoreWorld: the clock comes back to before the storm
  adv(S.SC_ROLL_S - 100 + 5);          // 150 s of SC have now been flown in all
  assert.equal(rc.level, 0, "the SC window counts the time flown, not the clock value");
});
