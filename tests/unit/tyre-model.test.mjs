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
import { readFileSync } from "node:fs";
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

// A minimal G stand-in: the model only reads lapsTarget, track.total, the two
// physics constants and (through severity) the circuit def.
function ctxFor({ laps = 25, total = 5386, severity = null } = {}) {
  return T.create({
    lapsTarget: laps,
    track: { total, def: severity == null ? {} : { tyreSeverity: severity } },
    LAT_MAX: 22,
    aTop: () => 7,
  });
}
// Drive `n` laps' worth of distance at a given load, in one-second ticks.
// `c.lap` is advanced as the distance is covered: the model reads it for the
// fuel load, so a car that never completes a lap would run the whole stint on
// full tanks and wear ~11% faster than any real one.
function run(session, car, laps, { speed = 60, total = 5386 } = {}) {
  const dt = 1;
  const ticks = Math.round((laps * total) / speed);
  const lap0 = car.lap || 0;
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
  c.lap = 20;
  assert.equal(T.fuelFrac(c, 20), 0, "a car taking the flag carries none");
  c.lap = 0;
  const full = s.fuelAccelMul(c);
  c.lap = 20;
  assert.ok(s.fuelAccelMul(c) > full, "burning fuel must make the car quicker, not slower");
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
