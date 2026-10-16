/* wet-grip-ladder.test.mjs — WET_GRIP orders the treads the way treadFor picks them.
 *
 * TyreModel.treadFor sends a car to slicks below wetness 0.25, inters to 0.72,
 * full wets above, and its comment promises "the one that actually wins
 * there". Before this pin WET_GRIP gave the full wet MORE grip than the inter
 * at every wetness (wet row 0.94 vs 0.99), so an AI told to fit inters on a
 * drizzly road fitted the slower tyre. Real F1 (Pirelli, "When it's time to
 * change from slick to wet tyres in Formula 1"): inters beat full wets in the
 * damp, full wets win only in heavy standing water.
 *
 * Read through the game's own lerp (TyreModel.weatherGrip) and, for the
 * "effective" checks, times the catalog's dry cornering stat — the price a
 * wet tread carries everywhere (js/car/parts.js), since the table's dry knot
 * is 1 for every tread.
 *
 * Run: node --test tests/unit/wet-grip-ladder.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";
import { symbolSource } from "../helpers/game-source.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ctx = vm.createContext({ Math, console, Object, Array, Number, JSON, isFinite });
seedLog(ctx);
ctx.window = ctx;
for (const f of ["js/core/mat4.js", "js/physics/consts.js", "js/data/teams.js",
                 "js/car/parts.js", "js/physics/tyre-model.js"]) {
  vm.runInContext(readFileSync(join(ROOT, f), "utf8"), ctx, { filename: f });
}
const T = vm.runInContext("TyreModel", ctx);
const PC = vm.runInContext("PhysicsConsts", ctx);
const Parts = vm.runInContext("Parts", ctx);

const grip = (t, w) => T.weatherGrip(t, w);
const rows = Parts.CATALOG.find((c) => c.id === "tyres").options;
const corner = [1, ...["intermediate", "wet_full"].map((id) => rows.find((o) => o.id === id).cornering)];
const eff = (t, w) => grip(t, w) * corner[t];

/** First wetness in (lo, hi] where tread b overtakes tread a under f. */
function crossover(f, a, b, lo = 0, hi = 1) {
  let prev = f(b, lo) > f(a, lo);
  for (let w = lo; w <= hi + 1e-9; w += 0.001) {
    const now = f(b, w) > f(a, w);
    if (now && !prev) return w;
    prev = now;
  }
  return NaN;
}

test("the slick column and the dry knot are untouched (dry physics cannot move)", () => {
  assert.equal(PC.WET_GRIP.wet[0], 0.82);
  assert.equal(PC.WET_GRIP.rain[0], 0.72);
  for (const t of [0, 1, 2]) assert.equal(grip(t, 0), 1, `tread ${t} on a dry road`);
});

test("the inter out-grips the full wet on a drizzly road, the full wet wins in rain", () => {
  assert.ok(grip(1, 0.5) > grip(2, 0.5),
    `wetness 0.5: inter ${grip(1, 0.5)} must beat full wet ${grip(2, 0.5)}`);
  assert.ok(grip(2, 1) > grip(1, 1), `wetness 1: full wet ${grip(2, 1)} must beat inter ${grip(1, 1)}`);
  assert.ok(grip(1, 0.5) > grip(0, 0.5) && grip(2, 1) > grip(0, 1), "a wet tread always beats a slick in the wet");
});

test("the inter→full crossover brackets treadFor's 0.72 switch", () => {
  const pure = crossover(grip, 1, 2, 0.3);
  const withCost = crossover(eff, 1, 2, 0.3);
  assert.ok(pure >= 0.6 && pure <= 0.72, `grip-only crossover ${pure.toFixed(3)} not in [0.60, 0.72]`);
  assert.ok(withCost >= 0.72 && withCost <= 0.85, `with dry stat cost ${withCost.toFixed(3)} not in [0.72, 0.85]`);
});

test("slicks win when dry and lose to inters near treadFor's 0.25 switch", () => {
  assert.ok(eff(0, 0) > eff(1, 0) && eff(1, 0) > eff(2, 0), "dry: slick > inter > full wet");
  const x = crossover(eff, 0, 1);
  assert.ok(x >= 0.2 && x <= 0.3, `slick→inter crossover ${x.toFixed(3)} not in [0.20, 0.30]`);
});

test("away from the crossovers, treadFor's tread is the effective-grip winner", () => {
  for (const w of [0, 0.1, 0.18, 0.35, 0.5, 0.6, 0.9, 1]) {
    const best = [0, 1, 2].reduce((b, t) => (eff(t, w) > eff(b, w) ? t : b), 0);
    assert.equal(T.treadFor("dry", w), best, `wetness ${w}: treadFor ${T.treadFor("dry", w)}, fastest ${best}`);
  }
});

test("a car with no fitted set (wear off) grips on the tread the conditions call for, not a hard-coded full wet", () => {
  // game.js gripMult defaulted `tread == null` to 2 (full wet). With the damp row now
  // favouring inters that cost the wear-off AI field ~6% grip on a wet road.
  const m = symbolSource("function gripMult(").match(/^function gripMult\(c\) \{ return (.+?); \}/m);
  assert.ok(m, "gripMult moved — re-point this test");
  // wxArc unset: no local shower, so the surface read falls back to trackWetness() (js/race/rain-cells.js).
  const gripMult = new Function("TyreModel", "raceWeather", "trackWetness", "c", "wxArc", `return ${m[1]};`);
  for (const [wx, w] of [["wet", 0.5], ["rain", 1], ["dry", 0]]) {
    const got = gripMult(T, wx, () => w, {});
    const want = grip(T.treadFor(wx, w), w);
    assert.equal(got, want, `${wx} @ ${w}: no-set car uses treadFor's pick`);
  }
  assert.equal(gripMult(T, "wet", () => 0.5, { tread: 2 }), grip(2, 0.5), "a fitted set still wins");
});
