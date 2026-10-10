/* tyre-model.test.mjs — the tyre wear model's rules, in a VM.
 *
 * Three things this file exists to pin, in descending order of how badly a
 * regression would hurt:
 *
 *  1. OFF IS A TRUE NO-OP. Every multiplier the driving model reads is exactly
 *     1 while TYRE WEAR is off. That is what lets
 *     tests/specs/physics-characterization.spec.js stay bit-identical, and it is
 *     the promise the whole staged rollout rests on.
 *  2. LIFE IS A FRACTION OF THE SCHEDULED DISTANCE, not a lap count. Real deg
 *     over 25 laps accumulates ~1.5 s against a ~21 s pit loss, so a literal
 *     port of real rates would mean no stop is ever worth making at any distance
 *     this game offers (docs/research/TYRE-STRATEGY-DESIGN.md §4). Every
 *     assertion about stint length below is really an assertion about that.
 *  3. THE CATALOG'S `life` LADDER IS USABLE. tools/car/parts-ladder.mjs
 *     deliberately does NOT score life (its header says why at length), so this
 *     is the only guard on it: life trends against grip, every row is inside the
 *     model's clamp, and the spread is a real strategy range at real distances.
 *
 * Run: node --test tests/unit/tyre-model.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function load() {
  const ctx = vm.createContext({ Math, console, Object, Array, Number, JSON, isFinite });
  seedLog(ctx);
  ctx.window = ctx;
  for (const f of ["js/core/mat4.js", "js/physics/consts.js", "js/data/teams.js",
                   "js/car/parts.js", "js/physics/tyre-model.js"]) {
    vm.runInContext(readFileSync(join(ROOT, f), "utf8"), ctx, { filename: f });
  }
  return { T: vm.runInContext("TyreModel", ctx), Parts: vm.runInContext("Parts", ctx) };
}
const { T, Parts } = load();
const TYRES = Parts.CATALOG.find((c) => c.id === "tyres").options;

test("fitting a set owns explicit tread and rebuilds modifiers without accumulation", () => {
  const s = ctxFor();
  const base = { speed: 1.1, accel: 0.9, cornering: 1.05, braking: 1.02 };
  const car = { lap: 3, tread: 0, tyreBaseMods: base, mods: {} };
  const wet = T.optionRecord(TYRES.find((o) => o.id === "wet_full"));
  const soft = T.optionRecord(TYRES.find((o) => o.id === "soft"));

  s.fit(car, wet);
  assert.equal(car.tread, 2, "the fitted set, not the garage choice, owns weather grip");
  assert.equal(car.mods.speed, base.speed * 0.88);
  assert.equal(car.mods.cornering, base.cornering * 0.90);

  s.fit(car, soft);
  const once = { ...car.mods };
  s.fit(car, soft);
  assert.deepEqual(car.mods, once, "refitting must rebuild from the tyre-free base");
  assert.equal(car.mods.speed, base.speed * 0.97);
  assert.equal(car.mods.cornering, base.cornering * 1.12);
});

test("fitting preserves the ordinary AI null-tread competent-field sentinel", () => {
  const s = ctxFor();
  const car = { lap: 1, tread: null };
  s.fit(car, T.classRecord("hard"));
  assert.equal(car.tread, null);
  assert.equal(car.tyre.tread, 0);
});

test("…but an AI with a pit plan (wear on) carries the tread of the set it is fitted", () => {
  // Left null, an AI still on slicks as the rain came in cornered on full wets.
  const s = ctxFor();
  const car = { lap: 1, tread: null, human: false, pitPlan: { start: "hard" } };
  s.fit(car, T.classRecord("wet"));
  assert.equal(car.tread, 2);
  s.fit(car, T.classRecord("soft"));
  assert.equal(car.tread, 0, "slicks in the rain are slicks");
});

test("an AI plan overrides a MY TEAM mate's saved starting tyre", () => {
  const savedWet = TYRES.find((o) => o.id === "wet_full");
  const mate = { human: false, tyreOpt: savedWet, pitPlan: { start: "hard" }, tyreClass: "soft" };
  const rec = T.startRecord(mate);
  assert.equal(rec.id, "hard");
  assert.equal(rec.tread, 0);

  const player = { human: true, tyreOpt: savedWet, pitPlan: { start: "hard" } };
  assert.equal(T.startRecord(player).id, "wet_full", "a player's reference plan must not choose their set");
});

test("an AI car starts a WET race on the tread the weather wants, not the plan's slick", () => {
  // The planner sequences dry classes only; with no tread the whole field
  // lined up on slicks and was armed for the weather on the first tick.
  const ai = { human: false, pitPlan: { start: "hard" } };
  assert.equal(T.startRecord(ai, 0).id, "hard", "dry: the plan's class");
  assert.equal(T.startRecord(ai, 1).tread, 1, "damp: intermediates");
  assert.equal(T.startRecord(ai, 2).tread, 2, "rain: full wets");
  const player = { human: true, tyreOpt: TYRES.find((o) => o.id !== "wet_full" && !o.wetTread), pitPlan: { start: "hard" } };
  assert.equal(T.startRecord(player, 2).tread, 0, "the player's own set is theirs, whatever the sky");
});

// A minimal G stand-in: the model only reads lapsTarget, track.total, the two
// physics constants and (through severity) the circuit def.
function ctxFor({ laps = 25, total = 5386, severity = null } = {}) {
  return T.create({
    lapsTarget: laps,
    track: { total, def: severity == null ? {} : { tyreSeverity: severity } },
    LAT_MAX: 22,
    aTop: () => 7,
    // The thermal model reads these two: speed as a fraction of the envelope
    // drives both heating and airflow cooling, and the weather sets ambient.
    vTop: () => 60,
    raceWeather: "dry",
  });
}
// Drive `n` laps' worth of distance at a given load, in one-second ticks.
// `c.lap` is advanced as the distance is covered: the model reads it for the
// fuel load, so a car that never completes a lap would run the whole stint on
// full tanks and wear ~11% faster than any real one.
function run(session, car, laps, { speed = 60, total = 5386 } = {}) {
  const dt = 1;
  const ticks = Math.round((laps * total) / speed);
  // `c.lap` counts LINE CROSSINGS, as in the game: 1 on the first lap (the
  // start crossing), lapsTarget + 1 at the flag. A car on the grid (0) is on
  // lap 1 as soon as it moves.
  const lap0 = Math.max(1, car.lap || 0);
  for (let i = 0; i < ticks; i++) {
    car.lap = lap0 + Math.floor((i * speed * dt) / total);
    session.update(car, dt);
  }
  return car;
}
function freshCar(session, life, extra = {}) {
  const c = Object.assign({ human: false, speed: 60, consistency: 0.75, accSm: 0, lap: 0 }, extra);
  session.fit(c, { id: "t", code: "M", life, off: 0, tread: 0, colour: [1, 1, 1] });
  return c;
}

// ── 1. OFF is a true no-op ──────────────────────────────────────────────────

test("OFF: every multiplier is exactly 1 and nothing wears", () => {
  const s = ctxFor();
  assert.equal(s.level(), "off", "the model must construct OFF — an existing save must not start losing races");
  const c = freshCar(s, 0.5);
  run(s, c, 10);
  assert.equal(c.tyreWear, 0, "wear accumulated while the setting was off");
  for (const [name, v] of [["gripMul", s.gripMul(c)], ["tractionMul", s.tractionMul(c)],
                           ["fuelAccelMul", s.fuelAccelMul(c)], ["fuelVmaxMul", s.fuelVmaxMul(c)]]) {
    assert.equal(v, 1, `${name} is not exactly 1 with the setting off — the characterization baseline moves`);
  }
});

test("OFF: the multipliers are 1 even on a car that is already worn", () => {
  // A level can be turned off mid-session (__apex.tyres({level})), and a car
  // keeps its wear. Reading that wear back through a disabled model must still
  // be the identity, or turning the setting off would not restore the old car.
  const s = ctxFor();
  const c = freshCar(s, 0.5);
  c.tyreWear = 1.8;
  assert.equal(s.gripMul(c), 1);
  assert.equal(s.tractionMul(c), 1);
});

// ── 2. Life is a fraction of the scheduled distance ─────────────────────────

test("wear reaches 1.0 after `life x lapsTarget` laps at load 1", () => {
  // The load model is calibrated so a clean racing lap averages ~1.0, so this is
  // the sentence the constant's name makes: a 0.5-life compound is spent halfway
  // through whatever distance you selected.
  const s = ctxFor({ laps: 20 });
  s.setLevel("real");
  const c = freshCar(s, 0.5, { consistency: 1 });    // consistency 1 => load exactly LOAD_AI_BASE
  run(s, c, 10);                                      // 0.5 x 20 laps
  // NEAR 1, not exactly: a metronome's base load is 0.92 rather than 1.0, and
  // the FIRST half of a race carries more than the average fuel load, so this
  // stint wears a little faster than nominal. The claim is that `life` means
  // what its name says to within the spread those two put on it.
  assert.ok(c.tyreWear > 0.85 && c.tyreWear < 1.25,
    `ten laps of a 0.5-life set in a 20-lap race should be about spent, got ${c.tyreWear.toFixed(3)}`);
});

test("one NaN tick does not wipe a set's accumulated wear (bug-hunt 7.10)", () => {
  const s = ctxFor({ laps: 20 });
  s.setLevel("real");
  const c = freshCar(s, 0.5);
  run(s, c, 4);
  const w = c.tyreWear;
  assert.ok(w > 0.1, "precondition: the set has real wear");
  // aiLoad launders consistency through fin(); wear still advances from a
  // neutral load. The dw finite-guard is the backstop if an increment ever
  // goes non-finite — either way the set's accumulated wear must not reset.
  c.consistency = NaN;
  s.update(c, 1);
  assert.ok(Number.isFinite(c.tyreWear), "wear stays finite");
  assert.ok(c.tyreWear >= w - 1e-12, "a bad tick must not wipe accumulated wear to 0");
  c.consistency = 0.75;
  s.update(c, 1);
  assert.ok(c.tyreWear > w, "…and the next good tick carries on from the old wear, not from 0");
});

test("the SAME compound lasts proportionally longer in a longer race", () => {
  // This is the whole distance-fraction idea in one assertion. A soft is spent
  // at the same FRACTION of a 5-lap race and a 50-lap race; if this ever became
  // an absolute lap count, short races would turn into pit-stop simulators.
  const short = ctxFor({ laps: 10 }); short.setLevel("real");
  const long = ctxFor({ laps: 40 }); long.setLevel("real");
  const a = freshCar(short, 0.6), b = freshCar(long, 0.6);
  run(short, a, 6);    // 0.6 x 10
  run(long, b, 24);    // 0.6 x 40
  // Not exact: `run` rounds to whole one-second ticks, so the two distances land
  // a fraction of a tick apart. A relative bound is the honest assertion.
  assert.ok(Math.abs(a.tyreWear - b.tyreWear) / b.tyreWear < 0.01,
    `same fraction of the distance must be the same wear (${a.tyreWear} vs ${b.tyreWear})`);
});

test("a very short race cannot demand a stop: MIN_LIFE_LAPS floors the stint", () => {
  // A 3-lap blast on the softest compound must still finish on one set, or the
  // arcade end of the lap ladder becomes a strategy game nobody asked for.
  const s = ctxFor({ laps: 3 }); s.setLevel("real");
  const softest = Math.min(...TYRES.map((o) => o.life));
  assert.ok(T.lifeLaps(softest, 3) >= T.MIN_LIFE_LAPS,
    "the shortest-lived compound over the shortest race is under the stint floor");
  // Driven cleanly — a player who spends the whole blast sideways can still cook
  // a set, and should. The claim is that the DISTANCE alone never demands a stop.
  const c = freshCar(s, softest, { consistency: 1 });
  run(s, c, 3);
  assert.ok(c.tyreWear < 1, `a 3-lap race ended past the cliff on the softest tyre (${c.tyreWear.toFixed(3)})`);
});

test("LIGHT wears strictly slower than REAL, and both wear", () => {
  const mk = (lvl) => { const s = ctxFor({ laps: 20 }); s.setLevel(lvl); const c = freshCar(s, 0.6); run(s, c, 10); return c.tyreWear; };
  const light = mk("light"), real = mk("real");
  assert.ok(light > 0 && real > 0, "a level that is on must wear");
  assert.ok(light < real, `LIGHT (${light.toFixed(3)}) must wear less than REAL (${real.toFixed(3)})`);
});

test("circuit severity scales wear, and is clamped either side", () => {
  const mk = (sev) => { const s = ctxFor({ laps: 20, severity: sev }); s.setLevel("real"); const c = freshCar(s, 0.6); run(s, c, 5); return c.tyreWear; };
  assert.ok(mk(1.6) > mk(1.0) && mk(1.0) > mk(0.6), "severity must order wear");
  // Out-of-range values are clamped rather than trusted: a circuit def is data.
  assert.equal(ctxFor({ severity: 99 }).severity(), 2.0);
  assert.equal(ctxFor({ severity: -5 }).severity(), 0.4);
  assert.equal(ctxFor({ severity: null }).severity(), 1, "a circuit with no severity must be the neutral 1.0");
});

test("a set that is GONE costs real grip: the cliff bites, and the floor is a car you nurse home", () => {
  // Reported: "if my tyres give out nothing happens". At a 0.25 cliff and a
  // 0.70 floor, a whole life past the end still gripped at 70 %.
  assert.ok(T.gripFor(1.5) <= 0.72, `half a life over must cost a quarter of the grip: ${T.gripFor(1.5)}`);
  assert.equal(T.gripFor(2), T.GRIP_FLOOR);
  assert.ok(T.GRIP_FLOOR <= 0.6, "a destroyed set is a crawl, not a mild handicap");
  assert.ok(T.gripFor(1.05) > 0.9, "…while a lap or so over is still survivable");
});

test("qualifying runs light, on a set its out-lap has warmed", () => {
  // Quali is one standing lap (lapsTarget 1): the race formula read a FULL
  // tank for the whole timed lap and fitted the set off the blankets.
  const s = T.create({ lapsTarget: 1, session: "quali", track: { total: 5386, def: {} }, LAT_MAX: 22,
                       aTop: () => 7, vTop: () => 60, raceWeather: "dry" });
  s.setLevel("real");
  const c = freshCar(s, 0.74, { lap: 1 });
  assert.equal(s.fuelAccelMul(c), 1, "no fuel penalty on a qualifying lap");
  assert.equal(s.fuelVmaxMul(c), 1);
  assert.equal(c.tyreTs, T.optTemp(0.74), "the set is in its window");
  const race = ctxFor({ laps: 1 }); race.setLevel("real");
  const r = freshCar(race, 0.74, { lap: 1 });
  assert.ok(race.fuelAccelMul(r) < 1, "a 1-lap RACE still starts on its fuel");
  assert.equal(r.tyreTs, T.T_BLANKET, "…and off the blankets");
});

test("the player's top speed pays for worn rubber, as the AI's does", () => {
  // The AI's vmax took tractionMul; the player's took none, and perfMul only
  // slows the climb to vmax (ACCEL·perfMul·(1 − v/vmax)), never the cap.
  const src = readFileSync(join(ROOT, "js/game.js"), "utf8");
  assert.match(src, /else if \(c\.human\) vmax \*= tyres\.tractionMul\(c\)/,
    "the human branch of the speed target must carry the tyre's traction");
});

test("ambient temperature follows a weather arc, not the flip of raceWeather", () => {
  // It read T_AMBIENT[raceWeather] alone, so the tyres saw 30 C -> 13 C on the
  // tick the weather changed, minutes before the road was wet.
  const G = { lapsTarget: 20, track: { total: 5386, def: {} }, LAT_MAX: 22, aTop: () => 7, vTop: () => 60,
              raceWeather: "rain", weatherArc: { from: "dry", to: "rain", t: 0, dur: 300 } };
  const s = T.create(G); s.setLevel("real");
  const c = freshCar(s, 0.74);
  assert.equal(s.info(c).ambient, T.T_AMBIENT.dry, "the arc has not started: still the dry track");
  G.weatherArc.t = 150;
  const mid = s.info(c).ambient;
  assert.ok(Math.abs(mid - (T.T_AMBIENT.dry + T.T_AMBIENT.rain) / 2) < 1e-9, `half way: ${mid}`);
  G.weatherArc.t = 300;
  assert.equal(s.info(c).ambient, T.T_AMBIENT.rain);
  G.weatherArc = null;
  assert.equal(s.info(c).ambient, T.T_AMBIENT.rain, "no arc: the race's weather");
});

test("lapsLeft: the laps a set has left, at the rate this car has been wearing it", () => {
  const s = ctxFor({ laps: 20 }); s.setLevel("real");
  const c = freshCar(s, 0.74, { lap: 1 });
  // Before a lap is run on the set: the planned life, all of it.
  assert.ok(Math.abs(s.lapsLeft(c) - s.planLaps(0.74, 20)) < 1e-9, `fresh: ${s.lapsLeft(c)}`);
  // Three laps on it at 30 % gone: 10 laps of life at that rate, 7 left.
  c.lap = 4; c.tyreLap0 = 1; c.tyreWear = 0.3;
  assert.ok(Math.abs(s.lapsLeft(c) - 7) < 1e-9, `measured rate: ${s.lapsLeft(c)}`);
  c.tyreWear = 1.2;
  assert.equal(s.lapsLeft(c), 0, "a set past the cliff has none");
  const off = ctxFor({ laps: 20 });
  assert.equal(off.lapsLeft(freshCar(off, 0.74)), null, "wear off: nothing to show");
});

test("planLaps plans against the circuit's severity, as the wear does", () => {
  // update() charges wear at severity() and planLaps ignored it, so at Austria
  // (1.97) every plan believed a set lasted twice as long as it did — a
  // medium planned for 7.4 laps of a 10-lap race was gone in 3.8: NO STOP.
  const at = (sev) => { const s = ctxFor({ laps: 20, severity: sev }); s.setLevel("real"); return s; };
  const neutral = at(null), austria = at(1.97);
  assert.ok(Math.abs(austria.planLaps(0.74, 20) - neutral.planLaps(0.74, 20) / 1.97) < 1e-9,
    `planLaps must divide by severity: ${austria.planLaps(0.74, 20)} vs ${neutral.planLaps(0.74, 20)}`);
  // …and the same number of PLANNED laps leaves the same wear at either circuit.
  const worn = (s) => { const c = freshCar(s, 0.74); run(s, c, s.planLaps(0.74, 20)); return c.tyreWear; };
  const a = worn(austria), n = worn(neutral);
  assert.ok(Math.abs(a / n - 1) < 0.05, `planned life must mean the same wear: austria ${a.toFixed(3)} vs neutral ${n.toFixed(3)}`);
});

test("the minimum life holds AFTER severity: a 5-lap race at Austria is one set", () => {
  // planLaps and update divided a floored lifeLaps by severity, so at 1.97 a
  // 5-lap race's soft lasted ~1.2 laps — the race MIN_LIFE_LAPS exists to cover.
  const s = ctxFor({ laps: 5, severity: 1.97 }); s.setLevel("real");
  assert.equal(s.planLaps(0.48, 5), T.MIN_LIFE_LAPS, `planLaps: ${s.planLaps(0.48, 5)}`);
  // …and the wear agrees with the plan: the floor's laps at load ~1 spend the set.
  const c = freshCar(s, 0.48);
  run(s, c, T.MIN_LIFE_LAPS);
  assert.ok(c.tyreWear > 0.7 && c.tyreWear < 1.3, `wear after the floor's laps: ${c.tyreWear.toFixed(3)}`);
  const half = freshCar(s, 0.48); run(s, half, 2);
  assert.ok(half.tyreWear < 0.65, `two laps are half a set, not all of it: ${half.tyreWear.toFixed(3)}`);
});

test("a 5-lap race on the softest set ends on usable tyres, fuel and all", () => {
  // At MIN_LIFE_LAPS 4 the fuel load (+22 % at a full tank) took every car in
  // a 5-lap Austria past the cliff: 1.13-1.26 at the flag (census, 2026-09-30).
  const s = ctxFor({ laps: 5, severity: 1.97 }); s.setLevel("real");
  const c = freshCar(s, 0.48);
  run(s, c, 5);
  assert.ok(c.tyreWear <= 1.05, `wear at the flag of a 5-lap race: ${c.tyreWear.toFixed(3)}`);
});

// ── 3. The grip curve ───────────────────────────────────────────────────────

test("grip falls linearly across the stint, then falls off a cliff", () => {
  const g = T.gripFor;
  assert.equal(g(0), 1, "a fresh set is exactly neutral");
  // Monotone down, and the second half of the life costs the same as the first.
  assert.ok(g(0.5) < g(0) && g(1) < g(0.5));
  assert.ok(Math.abs((g(0) - g(0.5)) - (g(0.5) - g(1))) < 1e-9, "the in-life curve must be linear");
  // Past life the knee is much steeper than the line that reached it.
  const inLife = g(0.9) - g(1.0), past = g(1.0) - g(1.1);
  assert.ok(past > inLife * 4, `the cliff (${past.toFixed(4)}) must dwarf the linear slope (${inLife.toFixed(4)})`);
  assert.ok(g(9) >= T.GRIP_FLOOR, "grip must never fall through the floor");
});

test("traction loses a smaller share of the same drop than cornering", () => {
  // A tyre that lost only CORNERING grip reads as a handling bug. A tyre that
  // lost as much traction as cornering reads as an engine failure.
  for (const w of [0.5, 1.0, 1.5]) {
    const lat = 1 - T.gripFor(w), lng = 1 - T.longFor(w);
    assert.ok(lng > 0 && lng < lat, `at wear ${w}, traction drop ${lng} must be between 0 and the lateral drop ${lat}`);
    assert.ok(Math.abs(lng - lat * T.LONG_SHARE) < 1e-9);
  }
});

test("a full tank wears the tyre faster than an empty one", () => {
  // The term that makes a strategy MIX — harder rubber early, softer late.
  // AiDrive.stintPlan carries the same constant and plans around it, so the sim
  // has to agree or the field would be planning for physics it does not have.
  const s = ctxFor({ laps: 20 }); s.setLevel("real");
  const full = freshCar(s, 0.6, { lap: 0 });
  const empty = freshCar(s, 0.6, { lap: 20 });
  for (let i = 0; i < 200; i++) { s.update(full, 1); s.update(empty, 1); }
  assert.ok(full.tyreWear > empty.tyreWear,
    `a full tank (${full.tyreWear.toFixed(4)}) must wear more than an empty one (${empty.tyreWear.toFixed(4)})`);
  assert.ok(full.tyreWear / empty.tyreWear < 1 + T.FUEL_LOAD + 1e-6, "and by no more than the stated fraction");
});

test("fuel runs from a full tank at the start to empty at the flag", () => {
  const s = ctxFor({ laps: 20 }); s.setLevel("real");
  const c = freshCar(s, 0.6);
  assert.equal(T.fuelFrac(c, 20), 1, "a car on the grid carries a full load");
  // `c.lap` counts crossings: 1 through the first lap, 21 at a 20-lap flag.
  // Reading it as laps DONE burned a lap at the start and ran lap 20 empty.
  c.lap = 1;
  assert.equal(T.fuelFrac(c, 20), 1, "the first lap starts on a full load, not 1/n down");
  c.lap = 20;
  assert.ok(Math.abs(T.fuelFrac(c, 20) - 1 / 20) < 1e-12, "the last lap starts with one lap of fuel, not an empty tank");
  c.lap = 21;
  assert.equal(T.fuelFrac(c, 20), 0, "a car taking the flag carries none");
  c.lap = 0;
  const full = s.fuelAccelMul(c);
  c.lap = 21;
  assert.ok(s.fuelAccelMul(c) > full, "burning fuel must make the car quicker, not slower");
});

// ── 3b. Temperature, and the two ways a tyre fails ─────────────────────────

test("a fresh set comes out of blankets BELOW its window — that is the out-lap", () => {
  // The counterweight the undercut needs. Without it a stop is free and
  // therefore always correct, which is a worse game than the one with the
  // trade in it (docs/research/TYRE-STRATEGY-DESIGN.md §2.8).
  const s = ctxFor({ laps: 20 }); s.setLevel("real");
  const c = freshCar(s, 0.74);
  assert.equal(c.tyreTs, T.T_BLANKET, "a fresh set starts at blanket temperature");
  const opt = T.optTemp(0.74);
  assert.ok(T.T_BLANKET < opt - T.T_WINDOW, "and blanket temperature must be BELOW the window, or there is no out-lap");
  const cold = s.gripMul(c);
  assert.ok(cold < 1, "so a fresh set is down on grip");
  // ...and the size of it is the ~0.4-0.6 s the real thing measures, which at
  // this model's scale is a couple of percent of grip, not a couple of tenths.
  assert.ok(cold > 0.95, `the out-lap deficit must be a nuisance, not a cliff (got ${cold.toFixed(3)})`);
});

test("driving brings a cold set INTO its window, and it then holds there", () => {
  const s = ctxFor({ laps: 20 }); s.setLevel("real");
  const c = freshCar(s, 0.74, { speed: 60 });
  const opt = T.optTemp(0.74);
  for (let i = 0; i < 120; i++) s.update(c, 1);          // ~2 minutes of racing
  assert.ok(Math.abs(c.tyreTs - opt) < T.T_WINDOW,
    `a raced set must settle inside its window (${c.tyreTs.toFixed(1)} vs ${opt.toFixed(1)} +/- ${T.T_WINDOW})`);
  assert.ok(s.gripMul(c) > 0.99 * T.gripFor(c.tyreWear), "and pay no temperature penalty there");
  // Holds: another two minutes must not run away.
  const was = c.tyreTs;
  for (let i = 0; i < 120; i++) s.update(c, 1);
  assert.ok(Math.abs(c.tyreTs - was) < 8, "an equilibrium that drifts is not an equilibrium");
});

test("a softer compound switches on faster than a harder one", () => {
  // Softs in about a lap, hards in two or three — so the compound choice
  // reaches the out-lap, not just the stint.
  //
  // Measured as TIME INTO THE WINDOW, not distance-from-optimum at a fixed
  // moment: every compound settles at a similar offset above its own optimum,
  // so a snapshot comparison says nothing about switch-on and this test failed
  // against a model that was behaving correctly.
  const s = ctxFor({ laps: 20 }); s.setLevel("real");
  const secsToWindow = (life) => {
    const c = freshCar(s, life, { speed: 60 });
    const floor = T.optTemp(life) - T.T_WINDOW;
    for (let i = 0; i < 600; i++) { s.update(c, 1); if (c.tyreTs >= floor) return i + 1; }
    return Infinity;
  };
  const soft = secsToWindow(0.48), hard = secsToWindow(1.05);
  assert.ok(soft < hard, `a soft must reach its window sooner (${soft}s vs ${hard}s)`);
  assert.ok(Number.isFinite(hard), "and a hard must reach its window at all");
  assert.ok(T.warmRate(0.48) > T.warmRate(1.05), "the rate itself must run the right way");
});

test("the bulk lags the surface — which is what tells graining from blistering", () => {
  const s = ctxFor({ laps: 20 }); s.setLevel("real");
  const c = freshCar(s, 0.74, { speed: 60 });
  for (let i = 0; i < 60; i++) s.update(c, 1);
  assert.ok(c.tyreTs > c.tyreTb, "the surface must lead the core while heating");
  // ...and lead it the other way while cooling. A parked car shows it cleanly —
  // but only while the two are still ABOVE ambient: run it long enough and both
  // reach ambient and the comparison is noise, which is how this first failed.
  c.speed = 0;
  for (let i = 0; i < 30; i++) s.update(c, 1);
  assert.ok(c.tyreTb > c.tyreTs + 1,
    `the core must hold heat the surface has shed (${c.tyreTb.toFixed(1)} vs ${c.tyreTs.toFixed(1)})`);
});

test("a cold, sliding tyre GRAINS, and graining heals once it is warm again", () => {
  const s = ctxFor({ laps: 20 }); s.setLevel("real");
  const c = freshCar(s, 0.74, { speed: 40, human: true, yawRateCur: 0, axFrac: 0, skidIntensity: 0.8 });
  c.tyreTs = 40;                                        // stone cold
  for (let i = 0; i < 30; i++) { c.tyreTs = 40; s.update(c, 1); }   // hold it cold
  assert.ok(c.tyreGrain > 0, "cold rubber that is sliding must grain");
  const grained = c.tyreGrain;
  assert.ok(s.gripMul(c) < T.gripFor(c.tyreWear), "and graining must cost grip");
  // Warm and settled: it drives itself clean. This is the whole reason graining
  // is a SURFACE state and blistering is not.
  c.skidIntensity = 0;
  for (let i = 0; i < 60; i++) { c.tyreTs = T.optTemp(0.74); s.update(c, 1); }
  assert.ok(c.tyreGrain < grained, `graining must heal (${grained.toFixed(3)} -> ${c.tyreGrain.toFixed(3)})`);
});

test("a cooked CORE blisters, and blistering never heals", () => {
  const s = ctxFor({ laps: 20 }); s.setLevel("real");
  const c = freshCar(s, 0.74, { speed: 60 });
  c.tyreTb = T.optTemp(0.74) + T.T_WINDOW + T.BLIST_OVER + 60;
  for (let i = 0; i < 30; i++) { c.tyreTb = T.optTemp(0.74) + T.T_WINDOW + T.BLIST_OVER + 60; s.update(c, 1); }
  const blistered = c.tyreBlister;
  assert.ok(blistered > 0, "a core well past its limit must blister");
  assert.ok(T.BLIST_GRIP > T.GRAIN_GRIP, "and blistering must cost more than graining — 1 s/lap against 0.1-0.3");
  // Cool it right down and run: the damage stays.
  c.tyreTb = 20; c.tyreTs = 20;
  for (let i = 0; i < 120; i++) s.update(c, 1);
  assert.ok(c.tyreBlister >= blistered, "blistering is bulk damage and must not heal");
});

test("a stop resets temperature and BOTH defects, because it is a new tyre", () => {
  const s = ctxFor({ laps: 20 }); s.setLevel("real");
  const c = freshCar(s, 0.74, { speed: 60 });
  c.tyreGrain = 0.6; c.tyreBlister = 0.4; c.tyreTs = 160; c.tyreTb = 150;
  s.fit(c, T.classRecord("soft"));
  assert.equal(c.tyreGrain, 0);
  assert.equal(c.tyreBlister, 0);
  assert.equal(c.tyreTs, T.T_BLANKET);
  assert.equal(c.tyreTb, T.T_BLANKET);
});

test("colder weather means a colder tyre", () => {
  const run = (weather) => {
    const s = T.create({ lapsTarget: 20, track: { total: 5386, def: {} }, LAT_MAX: 22,
                         aTop: () => 7, vTop: () => 60, raceWeather: weather });
    s.setLevel("real");
    const c = freshCar(s, 0.74, { speed: 60 });
    for (let i = 0; i < 120; i++) s.update(c, 1);
    return c.tyreTs;
  };
  assert.ok(run("rain") < run("dry"), "a wet track must not run the same tyre temperature as a dry one");
  assert.ok(T.T_AMBIENT.rain < T.T_AMBIENT.dry);
});

test("OFF: temperature never costs grip", () => {
  // The promise the whole staged rollout rests on, restated for the new states.
  const s = ctxFor({ laps: 20 });
  const c = freshCar(s, 0.74);
  c.tyreTs = 10; c.tyreTb = 10; c.tyreGrain = 1; c.tyreBlister = 1; c.tyreWear = 1.5;
  assert.equal(s.gripMul(c), 1);
  assert.equal(s.tractionMul(c), 1);
});

// ── 3b. Per-axle ───────────────────────────────────────────────────────────

test("the two axle shares always average to exactly 1", () => {
  // The whole design rests on this: c.tyreWear is the mean, so the strategy
  // planner, the AI and the pit call never see the split at all.
  for (const c of [{ human: true, axEstSm: -5, axFrac: 1 }, { human: true, axEstSm: 3, axFrac: 1 },
                   { human: true, axEstSm: 0, axFrac: 0 }, { human: true, axEstSm: -5, axFrac: 1, brakeBias: 0.62 },
                   { human: false, accSm: -7 }, { human: false, accSm: 7 }, { human: false, accSm: 0 }]) {
    const [f, r] = T.axleShare(c, 7);
    assert.ok(Math.abs((f + r) / 2 - 1) < 1e-12, `shares do not average to 1: ${f} / ${r}`);
  }
});

test("braking wears the FRONT, traction wears the REAR", () => {
  const brake = T.axleShare({ human: true, axEstSm: -5, axFrac: 1 }, 7);
  const drive = T.axleShare({ human: true, axEstSm: 4, axFrac: 1 }, 7);
  assert.ok(brake[0] > brake[1] + 0.5, `braking did not load the front: ${brake}`);
  assert.ok(drive[1] > drive[0] + 0.5, `traction did not load the rear: ${drive}`);
});

// Physics hunt 2026-10-10: an AI car's accSm is engine pull only (never < 0,
// stale under the brake), so the AI never tilted its wear onto the fronts —
// Monza VM, 22 cars over 80 s: accSm min 0, axle tilt max exactly AXLE_REST.
// The observed corridorAccel carries the braking.
test("an AI car braking (corridorAccel < 0) loads its FRONT, and its load sees the stop", () => {
  const stale = { human: false, accSm: 2, corridorAccel: -20, consistency: 0.75 };
  const [f, r] = T.axleShare(stale, 7);
  assert.ok(f > r + 0.5, `AI braking did not load the front: ${f} / ${r}`);
  assert.ok(T.aiLoad(stale, 7) > T.aiLoad({ ...stale, corridorAccel: 2 }, 7), "a full stop scores more load than a part-throttle run");
  // No corridorAccel (a bare stub): accSm is still read, unchanged.
  assert.equal(T.axleShare({ human: false, accSm: 7 }, 7)[0], T.axleShare({ human: false, accSm: 7, corridorAccel: undefined }, 7)[0]);
});

test("a forward brake bias moves wear onto the front, a rearward one off it", () => {
  const at = (bb) => T.axleShare({ human: true, axEstSm: -5, axFrac: 1, brakeBias: bb }, 7)[0];
  assert.ok(at(0.62) > at(T.BB_REF), "more front bias did not wear the fronts harder");
  assert.ok(at(0.50) < at(T.BB_REF), "less front bias did not spare the fronts");
  // …and only under braking. A bias setting must not reach a traction event.
  const drive = (bb) => T.axleShare({ human: true, axEstSm: 4, axFrac: 1, brakeBias: bb }, 7)[0];
  assert.equal(drive(0.62), drive(0.50), "brake bias reached a traction event");
});

test("a braking-heavy stint leaves the fronts more worn than the rears", () => {
  // End to end through update(), which is the only place the split is integrated.
  const s = ctxFor({ laps: 10 }); s.setLevel("real");
  const c = freshCar(s, 0.5, { human: true, axEstSm: -5, axFrac: 0.8, yawRateCur: 0.1, skidIntensity: 0 });
  run(s, c, 4);
  assert.ok(c.tyreWearF > c.tyreWearR, `fronts not worn harder: ${c.tyreWearF} vs ${c.tyreWearR}`);
  const mean = (c.tyreWearF + c.tyreWearR) / 2;
  assert.ok(Math.abs(mean - c.tyreWear) < 1e-9, "the mean of the axles drifted from c.tyreWear");
});

test("worn fronts cost front grip and leave the rear alone — that is the point", () => {
  const s = ctxFor({ laps: 10 }); s.setLevel("real");
  const c = freshCar(s, 0.5);
  c.tyreWear = 0.6; c.tyreWearF = 0.9; c.tyreWearR = 0.3;
  const ax = s.axleSplit(c);
  assert.ok(ax.f < 1, "worn fronts did not cost front grip");
  assert.ok(ax.r > 1, "fresher rears did not keep their grip");
  // The split is RELATIVE, so an even set is exactly neutral and muBase keeps
  // carrying the whole drop — otherwise game.js would count wear twice.
  c.tyreWearF = 0.6; c.tyreWearR = 0.6;
  assert.equal(s.axleSplit(c).f, 1);
  assert.equal(s.axleSplit(c).r, 1);
});

// update() runs the thermal / defect / axle steps through positional bodies and
// one scratch pair (no literal or array per car per step). Bit-for-bit, one tick
// must equal the public stepTemp / stepGrain / stepBlister / axleShare chain.
test("update() is exactly the public step chain — the scratch refactor moved no bit", () => {
  const s = ctxFor({ laps: 10 }); s.setLevel("real");
  const c = freshCar(s, 0.5, { human: true, speed: 50, axEstSm: -3, axFrac: 0.6, skidIntensity: 0.4, lap: 1 });
  c.tyreTs = 70; c.tyreTb = 75; c.tyreGrain = 0.1; c.tyreBlister = 0.05;
  c.tyreWear = 0; c.tyreWearF = 0; c.tyreWearR = 0;
  const ax = s.axleSplit(c), ax0 = { f: ax.f, r: ax.r };
  s.update(c, 1 / 60);
  const amb = T.T_AMBIENT.dry, track = amb + T.T_TRACK_DELTA.dry, life = c.tyre.life, dt = 1 / 60;
  const t = T.stepTemp(70, 75, { load: c._tyreLoad, vFrac: 50 / 60, amb, track, life, slide: 0.4, dt });
  assert.equal(c.tyreTs, t[0]); assert.equal(c.tyreTb, t[1]);
  assert.equal(c.tyreGrain, T.stepGrain(0.1, { ts: t[0], life, slide: 0.4, dt }));
  assert.equal(c.tyreBlister, T.stepBlister(0.05, { tb: t[1], life, dt }));
  const sh = T.axleShare(c, 7);
  assert.ok(c.tyreWear > 0);
  assert.equal(c.tyreWearF, c.tyreWear * sh[0]); assert.equal(c.tyreWearR, c.tyreWear * sh[1]);
  // axleSplit hands back one reused answer: read it, do not keep it.
  assert.equal(ax0.f, 1); assert.equal(ax0.r, 1);
  const a = s.axleSplit(c);
  assert.ok(a.f < 1 && a.r > 1, "fronts worked harder on the brakes");
  assert.equal(s.axleSplit(c), a, "the same scratch object");
});

test("OFF: the axle split is exactly 1/1, and a stop resets both axles", () => {
  const s = ctxFor({ laps: 10 });
  const c = freshCar(s, 0.5);
  c.tyreWear = 0.6; c.tyreWearF = 1.2; c.tyreWearR = 0.1;
  assert.equal(s.axleSplit(c).f, 1, "the axle split moved grip with the setting off");
  assert.equal(s.axleSplit(c).r, 1);
  s.fit(c, { id: "t", code: "M", life: 0.5, off: 0, tread: 0, colour: [1, 1, 1] });
  assert.equal(c.tyreWearF, 0);
  assert.equal(c.tyreWearR, 0);
});

// ── 3c. The stint log ──────────────────────────────────────────────────────

test("every set fitted opens a stint, and the previous one closes at that lap", () => {
  // Recorded at fit() because that is the ONLY place a set changes — the
  // alternative, reconstructing stints from pit events afterwards, loses the
  // grid set entirely (nobody pits for it).
  const s = ctxFor({ laps: 20 }); s.setLevel("real");
  const c = freshCar(s, 0.5);
  c.lap = 0;
  const set = (code, life) => s.fit(c, { id: code, code, life, off: 0, tread: 0, colour: [1, 1, 1] });
  // Crossing counts: a stop on lap 9 comes after 8 laps, the flag is 21.
  c.lap = 9; set("M", 0.88);
  c.lap = 16; set("H", 1.05);
  c.lap = 21;
  s.closeStints(c);
  const st = s.stints(c);
  assert.deepEqual([...st.map((e) => e.code)], ["M", "M", "H"], "the GRID set is a stint too");
  assert.deepEqual([...st.map((e) => e.laps)], [8, 7, 5]);
  assert.equal(st.reduce((n, e) => n + e.laps, 0), 20, "the strip does not add up to the race");
});

test("the set the car is ON runs to the current lap, with no end recorded yet", () => {
  const s = ctxFor({ laps: 20 }); s.setLevel("real");
  const c = freshCar(s, 0.5);   // freshCar already fits the grid set, at lap 0
  c.lap = 7;   // on lap 7: six done
  assert.equal(s.stints(c)[0].laps, 6, "an open stint must still be drawable mid-race");
  assert.equal(c.tyreLog[0].lap1, null, "an open stint must not claim an end lap");
});

test("closeStints ends the last stint where the CAR stopped, not where the leader is", () => {
  // A retired car stopped laps ago. Its strip has to show the race it ran.
  const s = ctxFor({ laps: 50 }); s.setLevel("real");
  const c = freshCar(s, 0.5);
  c.lap = 4; c.retired = true;   // stopped on lap 4, three done
  s.closeStints(c);
  assert.equal(s.stints(c)[0].lap1, 3);
  assert.equal(s.stints(c)[0].laps, 3);
});

test("closeStints is idempotent, and a car that never ran has an empty strip", () => {
  const s = ctxFor({ laps: 10 }); s.setLevel("real");
  const c = freshCar(s, 0.5);
  c.lap = 5; s.closeStints(c); s.closeStints(c); c.lap = 9; s.closeStints(c);
  assert.equal(s.stints(c)[0].lap1, 4, "a second close moved an already-closed stint");
  assert.deepEqual([...s.stints({})], [], "a car with no log must not throw");
});

// ── 4. Load ────────────────────────────────────────────────────────────────

test("a tidy lap is materially cheaper than a scrappy one", () => {
  // The reward the whole system exists for. Squared utilisation is what makes
  // the difference material rather than marginal.
  const tidy = T.humanLoad({ speed: 60, yawRateCur: 0.15, axFrac: 0.3, skidIntensity: 0 }, 22);
  const scrappy = T.humanLoad({ speed: 60, yawRateCur: 0.35, axFrac: 0.9, skidIntensity: 0.6 }, 22);
  assert.ok(scrappy > tidy * 1.5, `a scrappy lap (${scrappy.toFixed(2)}) must cost far more than a tidy one (${tidy.toFixed(2)})`);
  const off = T.humanLoad({ speed: 60, yawRateCur: 0.15, axFrac: 0.3, skidIntensity: 0, offroad: true }, 22);
  assert.ok(off > tidy, "running off the road must cost tyre life");
});

test("a mid-rated AI driver scores ~1.0 — the scale everything else is read against", () => {
  // The player's raw weighted sum is DIVIDED into this scale by LOAD_REF, which
  // was measured off driven laps; the AI's constants are authored straight in
  // it. This is the assertion that keeps the two halves comparable, and a
  // strategy fight fair regardless of which model you happen to be.
  //
  // It cannot be checked against the player side here: the human number is a
  // DISTANCE-WEIGHTED LAP AVERAGE (monza 0.80, monaco 1.22 once normalised) and
  // no instantaneous sample stands in for it. The driven measurement lives in
  // the module's LOAD_REF comment, which is the right place for evidence.
  const mid = T.aiLoad({ consistency: 0.75, accSm: 2 }, 7);
  assert.ok(mid > 0.85 && mid < 1.25, `a mid AI driver must sit near the 1.0 reference, got ${mid.toFixed(3)}`);
  // ...and a ragged driver must wear more than a metronome.
  assert.ok(T.aiLoad({ consistency: 0.4, accSm: 2 }, 7) > T.aiLoad({ consistency: 1, accSm: 2 }, 7));
});

// ── 5. The catalog's life ladder ───────────────────────────────────────────

test("every tyre row carries a life inside the model's clamp", () => {
  // Spread into a HOST array: TYRES comes out of the vm context, so a .map() on
  // it carries the vm realm's Array.prototype and deepStrictEqual fails on the
  // prototype before it ever compares contents.
  const bad = [...TYRES.filter((o) => !(o.life >= T.LIFE_MIN && o.life <= T.LIFE_MAX)).map((o) => `${o.id}=${o.life}`)];
  assert.deepEqual(bad, [],
    "a tyre row's life is missing or outside [LIFE_MIN, LIFE_MAX]");
});

test("life trends against grip across the catalog", () => {
  // Not a strict function of cornering — deriving it that way gave the ladder no
  // independent information (tools/car/parts-ladder.mjs records what that cost).
  // The TREND still has to hold, or the catalog stops being legible: a stickier
  // tyre that also lasts longer is a free lunch.
  const rows = TYRES.filter((o) => !o.wetTread);
  let n = 0, sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (const o of rows) {
    const x = o.cornering === undefined ? 1 : o.cornering, y = o.life;
    n++; sx += x; sy += y; sxy += x * y; sxx += x * x;
  }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  assert.ok(slope < -0.5, `life must fall as grip rises (slope ${slope.toFixed(2)})`);
});

test("the life spread is a real strategy range at a real race distance", () => {
  // At the full-distance end the ladder has to produce DIFFERENT stop counts,
  // or the compound choice is cosmetic. Measured at 25 laps, the distance the
  // lap ladder offers below FULL.
  const dry = TYRES.filter((o) => !o.wetTread);
  const laps = 25;
  const stints = dry.map((o) => T.lifeLaps(o.life, laps));
  const longest = Math.max(...stints), shortest = Math.min(...stints);
  assert.ok(longest >= laps, "no compound can go the distance — every race would be a forced stop");
  assert.ok(shortest < laps / 2, "even the softest compound goes over half distance — nothing is a two-stopper");
  assert.ok(longest / shortest > 2 && longest / shortest < 4,
    `the life spread (${(longest / shortest).toFixed(2)}x) should be a real but not absurd range`);
});

test("a signature compound lasts exactly as long as the row it reskins", () => {
  // SIGNATURE options are cost-identical clones of their `equivalent` and must
  // stay clones on this axis too, or a team's livery would change its strategy.
  const byId = Object.fromEntries(TYRES.map((o) => [o.id, o]));
  const drift = [...TYRES.filter((o) => o.equivalent && byId[o.equivalent] && o.life !== byId[o.equivalent].life)
    .map((o) => `${o.id}=${o.life} vs ${o.equivalent}=${byId[o.equivalent].life}`)];
  assert.deepEqual(drift, [], "a signature tyre's life drifted from the row it reskins");
});

test("optionRecord reads a catalog row, classRecord an AI draw, and both agree in shape", () => {
  const fromRow = T.optionRecord(TYRES.find((o) => o.id === "soft"));
  const fromClass = T.classRecord("soft");
  for (const k of ["id", "code", "life", "off", "tread", "colour"]) {
    assert.ok(k in fromRow && k in fromClass, `both records must carry ${k}`);
  }
  assert.equal(fromRow.off, 0,
    "a catalog compound's pace offset must be 0 — the player's already lives in mods.cornering");
  assert.equal(T.optionRecord(TYRES.find((o) => o.id === "wet_full")).code, "W");
  assert.equal(T.optionRecord(TYRES.find((o) => o.id === "intermediate")).code, "I");
});

test("the SHIPPED default turns the pit feature on", () => {
  // OFF gates the entire pit feature — no lane, no box, no stop, no prompt, and
  // the AI never pits either. It shipped OFF, so a player who never opened
  // SETTINGS had a pit lane built into every circuit and no way to find out any
  // of it existed.
  //
  // This is asserted from SOURCE because tests/helpers/fixtures.js pins the key
  // to "off" for every browser spec, so that the physics baselines measure the
  // driving model rather than the current default. That pin is right, and it
  // means no spec would notice this default silently going back to OFF. This is
  // what notices.
  const src = readFileSync(join(ROOT, "js/game.js"), "utf8");
  const m = src.match(/raceTyreWear = store\.get\("tyreWear",\s*"([a-z]+)"\)/);
  assert.ok(m, "could not find the shipped TYRE WEAR default in js/game.js");
  assert.ok(T.isLevel(m[1]), `the shipped default "${m[1]}" is not a TyreModel level`);
  assert.notEqual(m[1], "off",
    "TYRE WEAR ships OFF again — that switches the whole pit lane back off for every new player");
  // …and the garbage-stored-value fallback must agree with it, or a corrupted
  // key would silently put a player on a different level than a fresh one.
  const f = src.match(/if \(!TyreModel\.isLevel\(raceTyreWear\)\) raceTyreWear = "([a-z]+)"/);
  assert.ok(f, "could not find the TYRE WEAR validation fallback");
  assert.equal(f[1], m[1], "the fallback level disagrees with the shipped default");
});

// ── The two load paths are calibrated to the same mean ───────────────────────
// `lifeLaps` only means what its name says if a racing lap scores ~1.0, and the
// file's own claim is that the player's path and the AI's are held to the same
// figure — "which is what keeps a strategy fight fair". They were not: aiLoad's
// constants read ~1.03 for a mid driver counting the base and style terms
// alone, while the longitudinal term adds on every lap and fuelLoadMul then
// multiplies by ~1.11 over a race. LOAD_REF absorbs that for the player;
// nothing did for the AI, so the field wore a fifth fast (measured 1.216 monza
// / 1.231 bahrain / 1.248 monaco, scratch/tyre-load-check.cjs).
test("a mid-grid AI on a clean lap scores about one, like the player's path", () => {
  const aTop = 12;
  // A mid driver, driving cleanly: the consistency default, no off-track, and
  // the longitudinal load a lap of braking and traction actually averages.
  const mid = { consistency: 0.75, accSm: aTop * 0.5, offroad: false };
  const load = T.aiLoad(mid, aTop);
  // Before the divisor this read ~1.11 BEFORE fuel, and fuel took it past 1.23.
  assert.ok(load > 0.85 && load < 1.05, `a clean AI lap is about one lap of life: ${load.toFixed(3)}`);
  // The axis still means something: a ragged driver wears more than a tidy one.
  const ragged = T.aiLoad({ consistency: 0.2, accSm: aTop * 0.5 }, aTop);
  const tidy = T.aiLoad({ consistency: 1.0, accSm: aTop * 0.5 }, aTop);
  assert.ok(ragged > load && load > tidy, `consistency still spreads the field (${tidy.toFixed(3)} < ${load.toFixed(3)} < ${ragged.toFixed(3)})`);
  // …and going off is still the most expensive thing a car can do.
  assert.ok(T.aiLoad({ consistency: 0.75, accSm: 0, offroad: true }, aTop) > ragged, "off-track outweighs a ragged lap");
});

// ── The HUD letter, over the whole catalog ──────────────────────────────────
// There used to be two ladders. AI_CLASS codes its soft at life 0.48 "S";
// optionRecord's own inline ternary cut at 0.40, so EVERY soft a player can
// buy — Soft 0.67, Super Soft 0.50, Sprint Soft 0.44, C5 0.52, P Zero Red 0.56
// — printed "M" on the HUD and the stint strip, while an AI running a
// longer-lived compound printed "S". Only the two one-lap specials fell under
// the old cut. One classifier now, checked against the catalog it describes.
test("every catalog compound prints the letter its life says", () => {
  const WANT = {
    hard: "H", endurance_tyre: "H", compound_c3: "M", medium: "M",
    slick_track: "M", compound_c4: "M", soft: "S", compound_c5: "S",
    supersoft: "S", p_zero_red: "S", qualigum: "S", hypersoft: "S",
    sprint_soft: "S", intermediate: "I", wet_full: "W",
  };
  const seen = [];
  for (const opt of TYRES) {
    const rec = T.optionRecord(opt);
    seen.push(opt.id);
    const want = WANT[opt.id];
    if (want == null) continue;               // signature clones follow their base
    assert.equal(rec.code, want,
      `${opt.id} (life ${rec.life}) prints ${rec.code}, expected ${want}`);
  }
  // The softs are the rows the old ladder got wrong — make sure they were here.
  for (const id of ["soft", "supersoft", "sprint_soft", "compound_c5", "p_zero_red"])
    assert.ok(seen.includes(id), `${id} must be in the catalog for this test to mean anything`);
});

test("the AI's compound classes agree with the same classifier", () => {
  // Two ladders is the defect; this is the assertion that keeps it one.
  for (const [name, cls] of Object.entries(T.AI_CLASS))
    assert.equal(T.codeForLife(cls.life, cls.tread), cls.code,
      `AI_CLASS.${name} codes "${cls.code}" at life ${cls.life}`);
});

test("the TYRE WEAR setting reaches the live model, not just the store", () => {
  // planLaps() divides by LEVELS[level]. The setter pushes on write; create()
  // must also seed from G.raceTyreWear. Without create sync, a fresh boot kept
  // the model at "off" until the next write or gridUp — STRATEGY previewed
  // "NO STOP" while the UI said wear was on.
  const src = readFileSync(join(ROOT, "js/game.js"), "utf8");
  const setter = src.match(/set raceTyreWear\(v\) \{[\s\S]*?\n  \},/);
  assert.ok(setter, "could not find the raceTyreWear setter in js/game.js");
  assert.match(setter[0], /tyres\.setLevel\(/,
    "setting TYRE WEAR must push the level into the model the STRATEGY preview reads");
  // gridUp's rule is the one to mirror: a time trial runs the model off.
  assert.match(setter[0], /isTimeTrial\(\) \? "off" : v/);
});

test("TyreModel.create seeds level from G.raceTyreWear (cold-boot sync)", () => {
  // Behavioural half of the store/model seam: create() alone, no setLevel,
  // no gridUp. A soft at REAL must not plan as whole-race life.
  const base = {
    lapsTarget: 53, track: { total: 5386, def: {} }, LAT_MAX: 22,
    aTop: () => 7, vTop: () => 60, raceWeather: "dry",
  };
  const real = T.create({ ...base, raceTyreWear: "real" });
  assert.equal(real.level(), "real");
  assert.equal(real.on(), true);
  assert.ok(real.planLaps(0.74, 53) < 53,
    `REAL wear must plan a soft shorter than the GP: ${real.planLaps(0.74, 53)}`);

  const light = T.create({ ...base, raceTyreWear: "light" });
  assert.equal(light.level(), "light");
  assert.ok(light.planLaps(0.74, 53) > real.planLaps(0.74, 53),
    "LIGHT lasts longer than REAL");

  const off = T.create({ ...base, raceTyreWear: "off" });
  assert.equal(off.level(), "off");
  assert.equal(off.planLaps(0.74, 53), 53, "OFF: honest answer is the whole race");

  const missing = T.create(base);
  assert.equal(missing.level(), "off", "no G.raceTyreWear: stay inert");
});

test("authored tyreSeverity stays in [0.4, 2.0] and the seven P5 anchors hold", () => {
  // Slice A must not invent out-of-clamp values, and must not retune the seven
  // measured 2026 anchors from TYRE-STRATEGY-DESIGN §5.5.
  const dir = join(ROOT, "js/circuits");
  const anchors = {
    monaco: 1.01, silverstone: 0.89, suzuka: 0.85, miami: 1.22,
    shanghai: 0.45, redbull: 1.97, albert_park: 0.61,
  };
  let authored = 0;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".js")) continue;
    const src = readFileSync(join(dir, f), "utf8");
    const m = src.match(/tyreSeverity:\s*([0-9.]+)/);
    if (!m) continue;
    authored++;
    const v = Number(m[1]);
    assert.ok(v >= 0.4 && v <= 2.0, `${f}: tyreSeverity ${v} outside clamp`);
    const id = f.replace(/\.js$/, "");
    if (anchors[id] != null) {
      assert.equal(v, anchors[id], `${id} P5 anchor must stay ${anchors[id]}`);
    }
  }
  assert.ok(authored >= 15, `expected ≥15 authored severities after A1, got ${authored}`);
});

test("severity default is 1.0 for circuits without authored data", () => {
  assert.equal(ctxFor({ severity: null }).severity(), 1.0);
  assert.equal(T.SEVERITY_DEFAULT ?? 1.0, 1.0);
});

test("sliding heats the surface faster than a clean rolling load (slip × force)", () => {
  // oxiphysics: Q_gen = slip_force · slip_speed. HEAT_SLIP fires only when
  // slide > 0; a clean lap (slide 0) must still use the HEAT_ROLL equilibrium.
  const life = 0.74;
  const amb = T.T_AMBIENT.dry;
  const track = amb + T.T_TRACK_DELTA.dry;
  const base = { load: 1.1, vFrac: 0.95, amb, track, life, dt: 1 };
  const clean = T.stepTemp(100, 100, { ...base, slide: 0 });
  const scrub = T.stepTemp(100, 100, { ...base, slide: 0.8 });
  assert.ok(scrub[0] > clean[0], `slide must heat more: scrub ${scrub[0]} vs clean ${clean[0]}`);
});

test("pathological NaN dt must not poison tyre temps (clamp alone is not enough)", () => {
  // M4.clamp(NaN, lo, hi) returns NaN — the old "clamp path" comment was a
  // false guard. A NaN dt (or heat term) must fall closed to the prior finite
  // state so grip stays driveable.
  const life = 0.74;
  const amb = T.T_AMBIENT.dry;
  const track = amb + T.T_TRACK_DELTA.dry;
  const t = T.stepTemp(95, 90, { load: 1, vFrac: 0.5, amb, track, life, slide: 0.2, dt: NaN });
  assert.ok(Number.isFinite(t[0]) && Number.isFinite(t[1]), `got ${t}`);
  assert.equal(t[0], 95, "surface keeps prior finite ts");
  assert.equal(t[1], 90, "bulk keeps prior finite tb");
});

test("cooling sinks toward ambient and a warmer track surface", () => {
  // A hotter track raises the blended sink, so a hot tyre cools less than on
  // a cold track (same air temperature).
  const life = 0.74;
  const amb = 30;
  const coolToward = (track) => {
    let ts = 120, tb = 110;
    for (let i = 0; i < 40; i++) {
      const t = T.stepTemp(ts, tb, { load: 0, vFrac: 0, amb, track, life, slide: 0, dt: 1 });
      ts = t[0]; tb = t[1];
    }
    return ts;
  };
  const onHotTrack = coolToward(amb + 25);
  const onColdTrack = coolToward(amb);
  assert.ok(onHotTrack > onColdTrack, `hotter track must cool less: ${onHotTrack} vs ${onColdTrack}`);
  assert.ok(onColdTrack < 120, "a stopped hot tyre must cool");
});

test("wear rises with slip speed at the same load (load × slip)", () => {
  const s = ctxFor({ laps: 10 }); s.setLevel("real");
  const roll = freshCar(s, 0.74, { human: true, speed: 60, yawRateCur: 0.1, axFrac: 0.2, skidIntensity: 0 });
  const slide = freshCar(s, 0.74, { human: true, speed: 60, yawRateCur: 0.1, axFrac: 0.2, skidIntensity: 0.9 });
  for (let i = 0; i < 30; i++) { s.update(roll, 0.5); s.update(slide, 0.5); }
  assert.ok(slide.tyreWear > roll.tyreWear,
    `sliding must wear more: ${slide.tyreWear.toFixed(4)} vs ${roll.tyreWear.toFixed(4)}`);
});

test("tempGrip peaks near optTemp and falls either side", () => {
  const life = 0.88;
  const opt = T.optTemp(life);
  assert.equal(T.tempGrip(opt, life), 1);
  assert.ok(T.tempGrip(opt - 50, life) < 1);
  assert.ok(T.tempGrip(opt + 50, life) < 1);
});

test("info() reports trackTemp above ambient in the dry", () => {
  const s = ctxFor({ laps: 10 }); s.setLevel("real");
  const c = freshCar(s, 0.74);
  const info = s.info(c);
  assert.ok(info.trackTemp > info.ambient, `${info.trackTemp} vs ambient ${info.ambient}`);
});

test("belowWindow preserves info's rounding, missing-state and non-finite behavior", () => {
  const s = ctxFor({ laps: 10 });
  for (const level of ["off", "light", "real"]) {
    s.setLevel(level);
    const cars = [null, {}, { tyreTs: 60 }, { tyre: T.classRecord("medium") }];
    for (const life of [null, undefined, 0, 0.48, 0.7414, 0.7415, 0.88, 1.05, NaN, Infinity]) {
      const opt = +T.optTemp(life).toFixed(1);
      for (const ts of [null, undefined, NaN, -Infinity, Infinity, -0, -40, 400,
                        opt - T.T_WINDOW - 0.051, opt - T.T_WINDOW - 0.049,
                        opt - T.T_WINDOW + 0.049, opt - T.T_WINDOW + 0.051]) {
        cars.push({ tyre: { life }, tyreTs: ts });
      }
    }
    for (const c of cars) {
      const info = s.info(c);
      const expected = info && info.tempOpt != null && info.tempS != null
        ? Math.max(0, (info.tempOpt - info.tempWindow) - info.tempS) : 0;
      const before = c && { ...c };
      assert.equal(s.belowWindow(c), expected, `${level}: life=${c?.tyre?.life}, ts=${c?.tyreTs}`);
      assert.deepEqual(c, before, "reading a cold-window deficit changed the car");
    }
  }
});

// A corrupt rating (consistency NaN) or a hook handing back NaN/Infinity used to
// make tyreWear/F/R NaN for a tick (clamp() passes NaN through; 0 * Infinity is
// NaN). Every load input is now finite-guarded: one neutral tick, never a poisoned
// integral. Finite inputs are unchanged (the rest of this file pins those).
test("NaN / Infinity in any load input never poisons the wear, temperature or grip state", () => {
  const BAD = [NaN, Infinity, -Infinity, undefined, null];
  const INPUTS = ["consistency", "accSm", "speed", "yawRateCur", "axFrac", "skidIntensity", "brakeBias"];
  for (const aTop of [7, NaN, Infinity]) {
    for (const human of [false, true]) {
      for (const field of INPUTS) {
        for (const bad of BAD) {
          const s = T.create({ lapsTarget: 10, track: { total: 5000, def: {} }, LAT_MAX: 22,
            aTop: () => aTop, vTop: () => 60, raceWeather: "dry" });
          s.setLevel("real");
          const c = freshCar(s, 0.74, { human, accSm: 1, yawRateCur: 0.2, axFrac: 0.3, skidIntensity: 0.1, lap: 2 });
          c[field] = bad;
          let last = 0;
          for (let i = 0; i < 4; i++) {
            s.update(c, 1);
            for (const k of ["tyreWear", "tyreWearF", "tyreWearR", "tyreTs", "tyreTb", "tyreGrain", "tyreBlister", "_tyreLoad"]) {
              assert.ok(Number.isFinite(c[k]), `${human ? "human" : "ai"} ${field}=${bad} aTop=${aTop} tick ${i}: ${k}=${c[k]}`);
            }
            assert.ok(c.tyreWear >= last, "wear never runs backwards");
            last = c.tyreWear;
          }
          const g = s.gripMul(c), a = s.axleSplit(c);
          assert.ok(Number.isFinite(g) && Number.isFinite(a.f) && Number.isFinite(a.r), `${field}=${bad}: grip ${g} ${a.f}/${a.r}`);
        }
      }
    }
  }
});

test("non-finite inputs read as the neutral value, finite ones are untouched", () => {
  const run = (over) => {
    const s = ctxFor({ laps: 10 }); s.setLevel("real");
    const c = freshCar(s, 0.74, over);
    for (let i = 0; i < 20; i++) s.update(c, 1);
    return c.tyreWear;
  };
  assert.equal(run({ consistency: NaN }), run({ consistency: 0.75 }), "a NaN rating is the mid driver");
  assert.equal(run({ consistency: undefined }), run({ consistency: 0.75 }));
  assert.equal(run({ accSm: NaN }), run({ accSm: 0 }));
  assert.ok(run({ consistency: 0.2 }) > run({ consistency: 0.9 }), "a ragged driver still wears more (finite path unchanged)");
});
