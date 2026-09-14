/* ai-strategy.test.mjs — the field's race strategy, in a VM.
 *
 * AiDrive.stintPlan decides what every AI car does about a worn tyre, and
 * AiDrive.pitNow decides when to ignore that plan. Both are pure, so all of it
 * is checkable without a browser.
 *
 * The four things that actually matter, in order:
 *
 *  1. THE PLAN SCALES WITH THE DISTANCE. A 3-lap blast takes no stop and a full
 *     distance takes one or two. If this ever inverted, the lap ladder's short
 *     end would become a pit-stop simulator — the failure the whole
 *     distance-fraction model exists to avoid (js/physics/tyre-model.js).
 *  2. THE FIELD DIVERGES. A grid that all picks the same plan is a procession,
 *     and js/physics/ai-drive.js's own TYRE comment cites strategy diversity as
 *     the largest lever a race controls over overtaking. Biasing only the stop
 *     COUNT is not enough — measured, it put 20 cars on one plan.
 *  3. STRATEGIES MIX. Harder rubber early, softer late, because a full tank
 *     wears tyres. Without that term the cost is separable and every plan comes
 *     out soft/soft/soft.
 *  4. THE REACTIVE RULES FIRE IN THE RIGHT ORDER. The free stop under a caution
 *     is worth 8-12 s and is the single biggest lever in the sport; the weather
 *     call is the recourse docs/PHYSICS.md said a dry->rain arc did not have.
 *
 * Run: node --test tests/unit/ai-strategy.test.mjs   (npm run test:tooling-fast)
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
                   "js/car/parts.js", "js/physics/tyre-model.js", "js/physics/ai-drive.js"]) {
    vm.runInContext(readFileSync(join(ROOT, f), "utf8"), ctx, { filename: f });
  }
  return { A: vm.runInContext("AiDrive", ctx), T: vm.runInContext("TyreModel", ctx) };
}
const { A, T } = load();

// Pit loss as a fraction of a lap: the 23.6 s measured at Monza over a ~160 s lap.
const PIT_LOSS_LAPS = 23.6 / 160;
const lifeFor = (laps) => (cls) => T.lifeLaps(T.AI_CLASS[cls].life, laps);
const plan = (laps, roll) => A.stintPlan({ laps, lifeLaps: lifeFor(laps), pitLossLaps: PIT_LOSS_LAPS, roll });
/** A whole 20-car field's worth of plans at one distance. */
const field = (laps) => Array.from({ length: 20 }, (_, i) => plan(laps, (i + 0.5) / 20));

// ── 1. The plan scales with the distance ───────────────────────────────────

test("a short race takes no stop and a long one does", () => {
  for (const laps of [3, 5]) {
    const stops = field(laps).map((p) => p.stops);
    assert.deepEqual([...new Set(stops)], [0],
      `${laps} laps must never call for a stop — got ${JSON.stringify(stops)}`);
  }
  // At full distance every car stops at least once.
  const long = field(53).map((p) => p.stops);
  assert.ok(Math.min(...long) >= 1, `a full distance must always stop, got ${JSON.stringify(long)}`);
  assert.ok(Math.max(...long) <= A.STRAT.MAX_STOPS, "and never more than the cap");
});

test("stop count is monotone in distance across the lap ladder", () => {
  // Not strictly per-car (tastes differ), but the FIELD MEAN must never go down
  // as the race gets longer, or the ladder stops making sense.
  const mean = (laps) => field(laps).reduce((a, p) => a + p.stops, 0) / 20;
  const ladder = [3, 5, 10, 25, 53].map(mean);
  for (let i = 1; i < ladder.length; i++) {
    assert.ok(ladder[i] >= ladder[i - 1] - 1e-9,
      `mean stops fell from ${ladder[i - 1]} to ${ladder[i]} as the race got longer (${ladder.join(", ")})`);
  }
});

test("the plan's stint lengths cover the distance exactly", () => {
  for (const laps of [3, 10, 25, 53]) {
    for (const p of field(laps)) {
      const sum = p.stints.reduce((a, v) => a + v, 0);
      assert.equal(sum, laps, `stints ${p.stints.join("+")} must add to ${laps}`);
      assert.equal(p.stints.length, p.stops + 1, "a plan has one more stint than it has stops");
      assert.equal(p.lapsAt.length, p.stops, "...and one stop lap per stop");
      for (const n of p.stints) assert.ok(n >= 1, "a stint of zero laps is not a stint");
    }
  }
});

test("stop laps are strictly increasing and inside the race", () => {
  for (const p of field(53)) {
    let prev = 0;
    for (const at of p.lapsAt) {
      assert.ok(at > prev, `stop laps must increase: ${p.lapsAt.join(",")}`);
      assert.ok(at < 53, "a stop on the last lap is not a strategy");
      prev = at;
    }
  }
});

// ── 2. The field diverges ──────────────────────────────────────────────────

test("a 20-car field does not converge on one plan", () => {
  // The regression this test exists for: with a taste for stopping but none for
  // COMPOUND, all 20 cars picked the same rubber and the race was a procession.
  for (const laps of [25, 53]) {
    const keys = new Set(field(laps).map((p) => p.stops + ":" + p.seq.join("/")));
    assert.ok(keys.size >= 3,
      `${laps} laps produced only ${keys.size} distinct plans (${[...keys].join(" | ")})`);
  }
});

test("the taste runs the right way: a low roll shops harder, a high roll softer", () => {
  const soft = (p) => p.seq.filter((c) => c === "soft").length;
  const hard = (p) => p.seq.filter((c) => c === "hard").length;
  const cautious = plan(53, 0.02), aggressive = plan(53, 0.98);
  assert.ok(hard(cautious) >= hard(aggressive), "the cautious end of the field must not run softer rubber");
  assert.ok(soft(aggressive) >= soft(cautious), "and the aggressive end must not run harder");
});

test("the plan is a pure function of its inputs", () => {
  // Determinism is the contract: the plan is drawn from a per-car race hash, so
  // the same seed must replay the same race (js/race/reliability.js holds the
  // same promise for retirements).
  for (const roll of [0.1, 0.5, 0.9]) {
    assert.deepEqual(plan(40, roll), plan(40, roll));
  }
});

// ── 3. Strategies mix ──────────────────────────────────────────────────────

test("a full tank costs tyre life, so the field does not run one compound all race", () => {
  // Without FUEL_WEAR the cost is separable, the best compound for stint 1 is
  // the best for stint 3, and every plan is soft/soft/soft.
  assert.ok(A.STRAT.FUEL_WEAR > 0, "the term must exist for any plan to mix");
  const mixed = field(53).filter((p) => new Set(p.seq).size > 1);
  assert.ok(mixed.length > 0, "no car in a 20-strong field ran a mixed strategy at full distance");
});

test("degCost rises across a stint, and a lap past life costs more than one before it", () => {
  const L = 20;
  const marginal = (n) => A.degCost(n + 1, L) - A.degCost(n, L);
  assert.ok(A.degCost(10, L) < A.degCost(20, L), "cost must rise across the stint");
  // The claim is about the MARGINAL lap, which is where the model's kink is:
  // grip falls at DROP_LIN per unit of wear inside the life and DROP_CLIFF (5x
  // that) past it. Integrated over a modest over-run the total is still modest —
  // that is the model being a knee rather than a wall, and is deliberate.
  assert.ok(marginal(L + 5) > marginal(L - 5),
    `a lap past life (${marginal(L + 5).toFixed(4)}) must cost more than one before it (${marginal(L - 5).toFixed(4)})`);
  assert.ok(marginal(L + 15) > marginal(L + 5) * 2, "and the cost keeps accelerating the further past it goes");
  // Running half again past the life more than doubles what the whole stint cost.
  assert.ok(A.degCost(L * 1.5, L) > A.degCost(L, L) * 2,
    "over-running a set by half must more than double the stint's cost — that is what the planner avoids");
});

test("splitStints shares the distance in proportion to life", () => {
  const even = A.splitStints(30, [10, 10, 10]);
  assert.deepEqual([...even], [10, 10, 10]);
  const skew = A.splitStints(30, [20, 10]);
  assert.ok(skew[0] > skew[1], "a longer-lived compound takes the longer stint");
  assert.equal(skew.reduce((a, v) => a + v, 0), 30, "and the split still covers the distance");
});

// ── 4. The reactive rules ──────────────────────────────────────────────────

const now = (o) => A.pitNow(Object.assign(
  { stopsLeft: 1, lapsToStop: 20, cautionLevel: 0, wear: 0, wrongTread: false }, o));

test("a car with no stops left still ignores the plan for a tyre that cannot do its job", () => {
  // Two rules are about a tyre that is USELESS, not about strategy, so neither
  // is gated on the plan's budget. Gating them left every 0-stop car in the
  // field circulating on slicks in the rain — measured, 0 stops out of 20.
  assert.equal(now({ stopsLeft: 0, wrongTread: true }), "weather");
  assert.equal(now({ stopsLeft: 0, wear: 1.4 }), "worn");
  // ...but a plan with no stops left does not take a free stop or a planned one.
  assert.equal(now({ stopsLeft: 0, cautionLevel: 3, lapsToStop: 1 }), "");
  assert.equal(now({ stopsLeft: 0, lapsToStop: -5 }), "");
});

test("the free stop under a caution pulls a planned stop forward", () => {
  // Worth 8-12 s — the biggest single lever in the sport. VSC is level 2.
  assert.equal(now({ cautionLevel: 2, lapsToStop: A.STRAT.CAUTION_REACH }), "caution");
  assert.equal(now({ cautionLevel: 3, lapsToStop: 1 }), "caution");
  // ...but not from the other end of the race: a stop 30 laps early is not free,
  // it is a wasted set.
  assert.equal(now({ cautionLevel: 3, lapsToStop: A.STRAT.CAUTION_REACH + 1 }), "");
  // A local yellow (level 1) does not neutralise the field, so it is not free.
  assert.equal(now({ cautionLevel: 1, lapsToStop: 1 }), "");
});

test("the wrong tyre for the weather outranks everything", () => {
  // The recourse docs/PHYSICS.md said a dry->rain arc did not have. It must beat
  // the caution rule: a car on slicks in the rain is losing more than a stop.
  assert.equal(now({ wrongTread: true, lapsToStop: 40 }), "weather");
  assert.equal(now({ wrongTread: true, cautionLevel: 3, lapsToStop: 1 }), "weather");
});

test("the weather call knows which tyre the conditions want, in BOTH directions", () => {
  // Without wet CLASSES an AI pits for the weather, fits another slick, is still
  // wrong, and pits again — a stop every lap. And a car left on wets when the
  // track dries has the same problem in reverse.
  assert.equal(T.treadFor("dry"), 0);
  assert.equal(T.treadFor("overcast"), 0, "cloud is not rain");
  assert.equal(T.treadFor("fog"), 0);
  assert.equal(T.treadFor("wet"), 1);
  assert.equal(T.treadFor("rain"), 2);
  assert.equal(T.classForTread(0), null, "a slick is whatever the plan says");
  assert.equal(T.classRecord(T.classForTread(1)).tread, 1);
  assert.equal(T.classRecord(T.classForTread(2)).tread, 2);
  // The wet classes must actually BE wet, or fitting one changes nothing.
  assert.equal(T.classRecord("inter").code, "I");
  assert.equal(T.classRecord("wet").code, "W");
});

test("an unplanned stop fits rubber that can finish the race", () => {
  // A 0-stop plan has no next compound, and falling back to a fixed one put a
  // car with three laps left on the same tyre as one with thirty.
  const life = lifeFor(50);
  assert.equal(A.compoundFor(1, life), "soft", "three laps left: take the fastest thing there is");
  assert.equal(A.compoundFor(50, life), "hard", "a full distance needs the durable one");
  // Never returns something that cannot finish when something can.
  for (const left of [1, 5, 15, 25, 40, 60]) {
    const cls = A.compoundFor(left, life);
    assert.ok(A.STRAT.CLASSES.includes(cls), `${cls} is not a dry compound`);
    const anyFits = A.STRAT.CLASSES.some((c) => life(c) >= left);
    if (anyFits) assert.ok(life(cls) >= left, `${cls} cannot cover ${left} laps but something could`);
  }
});

test("the planner never picks a wet compound for a dry race", () => {
  // stintPlan enumerates CLASSES, and a wet in there would have the field
  // starting a dry race on full wets because they "last longer".
  assert.deepEqual([...A.STRAT.CLASSES], ["soft", "medium", "hard"]);
  for (const p of field(53)) {
    for (const cls of p.seq) assert.ok(A.STRAT.CLASSES.includes(cls), `${cls} is not a dry compound`);
  }
});

test("a spent set boxes even when the plan says stay out", () => {
  assert.equal(now({ wear: 1, lapsToStop: 30 }), "worn");
  assert.equal(now({ wear: 0.99, lapsToStop: 30 }), "", "...but not before it is actually spent");
});

test("the plan alone fires when its lap arrives, and not before", () => {
  assert.equal(now({ lapsToStop: 1 }), "");
  assert.equal(now({ lapsToStop: 0 }), "plan");
  assert.equal(now({ lapsToStop: -3 }), "plan", "a stop missed by a lap or two still happens");
});
