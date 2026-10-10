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

test("degCost charges every lap past life the baseline drop as well as the cliff", () => {
  // The sim's gripFor carries the full DEG_LIN on every over-life lap; the
  // planner dropped it and priced a 50 % overrun ~29 % light, so sets ran long.
  // n = 15 on L = 10: 0.05·10/2 + 0.05·5 + 0.50·25/20 = 1.125 of grip-laps.
  const want = (0.05 * 10 / 2 + 0.05 * 5 + 0.5 * 25 / 20) * A.STRAT.GRIP_TO_LAP;
  assert.ok(Math.abs(A.degCost(15, 10) - want) < 1e-12, `degCost(15, 10) = ${A.degCost(15, 10)}, want ${want}`);
  // Inside the life nothing changed.
  assert.ok(Math.abs(A.degCost(10, 10) - 0.05 * 10 / 2 * A.STRAT.GRIP_TO_LAP) < 1e-12);
});

test("the field's plans spread: several strategies at 25 laps, two-stops at a full distance", () => {
  // The roll's taste moved the plan so little that a race split into two plans
  // (TASTE_BIAS 0.66, TASTE_SOFTEN 0.006: at 25 laps HM or MS, nothing else).
  // 21 evenly spread rolls stand in for a grid.
  const lives = (laps) => (cls) => T.lifeLaps(T.AI_CLASS[cls].life, laps);
  const spread = (laps) => {
    const out = new Map();
    for (let i = 0; i <= 20; i++) {
      const p = A.stintPlan({ laps, lifeLaps: lives(laps), pitLossLaps: 0.2, roll: i / 20, twoCompound: true });
      const k = p.seq.join("-");            // a STRATEGY is the tyres run, not the lap of the stop
      out.set(k, (out.get(k) || 0) + 1);
    }
    return out;
  };
  const r25 = spread(25), r57 = spread(57);
  assert.ok(r25.size >= 3, `25 laps: ${[...r25.keys()].join(" | ")}`);
  assert.ok(r57.size >= 3, `57 laps: ${[...r57.keys()].join(" | ")}`);
  assert.ok([...r57.keys()].some((k) => k.split("-").length === 3), `57 laps: some two-stop plan — ${[...r57.keys()].join(" | ")}`);
  // A short race stays short: nobody plans a stop into a 5-lap sprint on sets the floor covers.
  const five = (cls) => Math.max(T.MIN_LIFE_LAPS, T.AI_CLASS[cls].life * 5 / 1.97);
  for (let i = 0; i <= 20; i++) {
    const p = A.stintPlan({ laps: 5, lifeLaps: five, pitLossLaps: 0.2, roll: i / 20 });
    assert.equal(p.stops, 0, `roll ${i / 20}: ${p.seq} @${p.lapsAt}`);
  }
});

test("splitStints shares the distance in proportion to life", () => {
  const even = A.splitStints(30, [10, 10, 10]);
  assert.deepEqual([...even], [10, 10, 10]);
  const skew = A.splitStints(30, [20, 10]);
  assert.ok(skew[0] > skew[1], "a longer-lived compound takes the longer stint");
  assert.equal(skew.reduce((a, v) => a + v, 0), 30, "and the split still covers the distance");
});

test("splitStints covers the distance when rounding under-allocates and the last stints are 1 lap", () => {
  // [1,1,1] over 4 laps rounds to 1,1,1 (sum 3): the old 1-lap floor capped the
  // CORRECTION too, so nothing grew and the plan ended a lap short.
  const out = A.splitStints(4, [1, 1, 1]);
  assert.equal([...out].reduce((a, v) => a + v, 0), 4);
  assert.ok([...out].every((v) => v >= 1));
});

// ── 4. The reactive rules ──────────────────────────────────────────────────

const now = (o) => A.pitNow(Object.assign(
  { stopsLeft: 1, lapsToStop: 20, cautionLevel: 0, wear: 0, wrongTread: false }, o));

test("a SCRIPTED plan (a real race replayed) stops on its real laps and nowhere else", () => {
  // The caution reach double-stopped a car whose next real stop sat inside a
  // held safety car (Baku 2026: stops on L31 and L36, SC L31-35), and the worn
  // rule added stops the real race never made. Only the useless-tyre rule stays.
  assert.equal(now({ scripted: true, cautionLevel: 3, lapsToStop: 4 }), "");
  assert.equal(now({ scripted: true, wear: 1.4, lapsToStop: 9 }), "");
  assert.equal(now({ scripted: true, lapsToStop: 0 }), "plan");
  assert.equal(now({ scripted: true, lapsToStop: -1 }), "plan");
  assert.equal(now({ scripted: true, stopsLeft: 0, lapsToStop: -1 }), "");
  assert.equal(now({ scripted: true, stopsLeft: 0, wrongTread: true }), "weather");
});

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

test("the stop stagger never shifts a stop LATER past the set's life", () => {
  // Austria, 10 laps: severity 1.97 cuts a medium to ~3.8 laps. The optimum
  // stops on lap 4; the +1 stagger put a third of the field in on lap 5 — a
  // lap past the cliff (measured in a full VM race: 8 of 21 cars over 100 %
  // wear before their stop, 3 forced in by the worn rule). Earlier is still
  // allowed, so the field still spreads over the lane.
  const sev = 1.97, life = (c) => Math.max(4, { soft: 0.48, medium: 0.74, hard: 1.05 }[c] * 10) / sev;
  const at = (roll) => A.stintPlan({ laps: 10, lifeLaps: life, pitLossLaps: 0.2, roll, twoCompound: true });
  const mid = at(0.5), late = at(1), early = at(0);
  assert.equal(late.seq.join(), mid.seq.join(), "same plan, only the stagger differs");
  assert.ok(late.lapsAt[0] <= mid.lapsAt[0], `a late roll must not stop after the optimum here: L${late.lapsAt[0]} vs L${mid.lapsAt[0]}`);
  // …and EARLY is capped the same way: a -1 shift lengthens the next stint,
  // and the early third finished on 1.17-1.25 wear (the census, round 5).
  assert.ok(early.lapsAt[0] <= mid.lapsAt[0], "early never stops later than the optimum");
  // The optimum may itself run a set a little past its life (degCost prices
  // that); what the stagger must never do is add a lap to a stint that
  // already does not fit.
  for (const p of [early, late]) {
    let from = 0;
    p.stints.forEach((len, i) => {
      const fit = life(p.seq[i]) / (1 + A.STRAT.FUEL_WEAR * (1 - (from + len / 2) / 10));
      if (len > mid.stints[i]) assert.ok(len <= fit, `${p.seq}@${p.lapsAt}: the stagger stretched stint ${i + 1} to ${len} laps on a ${fit.toFixed(2)}-lap set`);
      from += len;
    });
    assert.equal(p.stints.reduce((a, v) => a + v, 0), 10);
  }
  // …and where the life allows it, the late shift is untouched.
  const roomy = (c) => ({ soft: 12, medium: 18, hard: 26 })[c];
  const r5 = A.stintPlan({ laps: 25, lifeLaps: roomy, pitLossLaps: 0.2, roll: 0.5, twoCompound: true });
  const r1 = A.stintPlan({ laps: 25, lifeLaps: roomy, pitLossLaps: 0.2, roll: 1, twoCompound: true });
  if (r1.seq.join() === r5.seq.join()) assert.ok(r1.lapsAt[0] >= r5.lapsAt[0], "a set with laps to spare still staggers late");
});

test("no stint is shorter than MIN_STINT, and a 5-lap race is run on one set", () => {
  // Two low rolls of 21 planned hard-hard with the stop after lap 1 of 5
  // (Austria, the census): the fuel-adjusted life dipped under the floor and
  // the -1 stagger cut the [2, 3] split to [1, 4].
  const floorLife = (laps, sev) => (c) => Math.max(T.MIN_LIFE_LAPS, T.AI_CLASS[c].life * laps / sev);
  for (const laps of [5, 10, 25]) for (let i = 0; i <= 20; i++) {
    const p = A.stintPlan({ laps, lifeLaps: floorLife(laps, 1.97), pitLossLaps: 0.2, roll: i / 20, twoCompound: laps >= 8 });
    assert.ok(p.stints.every((n) => n >= A.STRAT.MIN_STINT), `${laps} laps, roll ${i / 20}: stints ${p.stints}`);
    if (laps <= A.STRAT.ONE_SET_LAPS) assert.equal(p.stops, 0, `${laps} laps, roll ${i / 20}: ${p.seq} @${p.lapsAt}`);
  }
  // The player's STRATEGY row still wins: a pinned stop is a stop.
  const pinned = A.stintPlan({ laps: 5, lifeLaps: floorLife(5, 1.97), pitLossLaps: 0.2, roll: 0.5, stops: 1 });
  assert.equal(pinned.stops, 1);
});

test("the planner's cliff IS the sim's cliff", () => {
  // Two copies of one number: when the sim's cliff steepened and the planner's
  // did not, every plan would price a dead set at the old, cheap rate.
  assert.equal(A.STRAT.DEG_CLIFF, T.DROP_CLIFF);
  assert.equal(A.STRAT.DEG_LIN, T.DROP_LIN);
});

test("a worn stop needs laps left to pay for itself", () => {
  // Rule 3 fired on wear alone, with no regard for how much race was left, so a
  // set that went over its life near the flag sent the car down the lane to
  // lose 15 s it had no laps to win back. MEASURED on an 8-lap Bahrain: TWELVE
  // of 22 cars pitted on LAP 8 — the last lap — every one for "worn".
  const worn = (o) => now(Object.assign({ wear: 1.1, pitLossLaps: 0.13 }, o));
  assert.equal(worn({ lapsLeft: 1 }), "", "never on the last lap");
  assert.equal(worn({ lapsLeft: 2 }), "", "nor with two to go");
  assert.equal(worn({ lapsLeft: 40 }), "worn", "but a whole race ahead is worth the stop");
  // The deeper past its life the set is, the sooner the stop pays back — a
  // rag is worth changing with fewer laps left than a set just over the line.
  const rag = (left) => now({ wear: 2.0, pitLossLaps: 0.13, lapsLeft: left });
  // (A set 0.1 over its life gives back DEG_LIN + 0.1·DEG_CLIFF = 0.10 of grip
  // a lap on fresh rubber, so the 0.13-lap stop pays back in ~2.4 laps; a
  // destroyed one, 0.55 a lap, in under half of one.)
  assert.equal(rag(2), "worn", "a destroyed set is worth it with two to go");
  assert.ok(worn({ lapsLeft: 2 }) === "", "…where one barely over its life is not");
  assert.equal(worn({ lapsLeft: 3 }), "worn", "…until three: the baseline drop counts too");
  // A caller that does not say how many laps are left behaves exactly as before,
  // so nothing that never knew about this rule silently changes.
  assert.equal(now({ wear: 1.4 }), "worn", "no lapsLeft, no new gate");
  assert.equal(A.wornPays({ wear: 1.4 }), true);
});

test("the rival rules: an alert wall covers the undercut, an aggressive one makes it", () => {
  const S = A.STRAT, T0 = S.TEMPER;
  const at = (o) => now(Object.assign({ stopsLeft: 1, lapsToStop: S.UNDERCUT_REACH, wear: 0.6 }, o));
  // The car behind has boxed: a wall that reacts covers, one that does not waits.
  assert.equal(at({ rivalBehindBoxed: true, react: T0.REACT_MIN }), "cover");
  assert.equal(at({ rivalBehindBoxed: true, react: T0.REACT_MIN - 0.01 }), "");
  // Stuck behind a car that has not stopped: the attacker goes first — on the
  // lap before its stop, not two out.
  assert.equal(at({ stuckBehind: true, attack: T0.ATTACK_MIN, lapsToStop: S.UNDERCUT_LAPS }), "undercut");
  assert.equal(at({ stuckBehind: true, attack: T0.ATTACK_MIN - 0.01, lapsToStop: S.UNDERCUT_LAPS }), "");
  assert.equal(at({ stuckBehind: true, attack: 1, lapsToStop: S.UNDERCUT_LAPS + 1 }), "", "two laps out is not the undercut lap");
  // ONE rival call a race, and never one the next set cannot carry.
  assert.equal(at({ rivalBehindBoxed: true, react: 1, rivalUsed: true }), "");
  assert.equal(at({ stuckBehind: true, attack: 1, lapsToStop: 1, rivalUsed: true }), "");
  assert.equal(at({ rivalBehindBoxed: true, react: 1, fits: false }), "");
  // Neither pulls a stop the plan does not want soon, or onto a fresh set,
  // or spends a stop the plan does not have.
  assert.equal(at({ rivalBehindBoxed: true, react: 1, lapsToStop: S.UNDERCUT_REACH + 1 }), "");
  assert.equal(at({ stuckBehind: true, attack: 1, wear: S.UNDERCUT_MIN_WEAR - 0.01 }), "");
  assert.equal(at({ rivalBehindBoxed: true, react: 1, stopsLeft: 0 }), "");
});

test("strategic temper comes from the ratings: veterans react, rookies gamble", () => {
  const vet = { experience: 1, awareness: 0.9, craft: 0.95 }, rookie = { experience: 0.1, awareness: 0.66, craft: 0.7 };
  const tv = A.strategyTemper(vet), tr = A.strategyTemper(rookie);
  assert.ok(tv.react >= A.STRAT.TEMPER.REACT_MIN && tr.react < A.STRAT.TEMPER.REACT_MIN, `react ${tv.react} / ${tr.react}`);
  assert.ok(tv.attack >= A.STRAT.TEMPER.ATTACK_MIN && tr.attack < A.STRAT.TEMPER.ATTACK_MIN);
  // The roll's taste: 0.5 stays 0.5 for anyone; a rookie's reaches further.
  assert.equal(A.tasteRoll(0.5, rookie), 0.5);
  assert.ok(A.tasteRoll(0.2, rookie) < A.tasteRoll(0.2, vet), "a rookie's low roll goes lower");
  assert.ok(A.tasteRoll(0.8, rookie) > A.tasteRoll(0.8, vet), "…and a high one higher");
  assert.equal(A.tasteRoll(0.8, vet), 0.8, "a full-experience veteran runs the roll as drawn");
  for (const r of [0, 0.05, 0.95, 1]) { const x = A.tasteRoll(r, rookie); assert.ok(x >= 0 && x <= 1); }
});

test("the free stop under a caution pulls a planned stop forward", () => {
  // Worth 8-12 s — the biggest single lever in the sport. VSC is level 2.
  assert.equal(now({ cautionLevel: 2, lapsToStop: A.STRAT.CAUTION_REACH }), "caution");
  assert.equal(now({ cautionLevel: 3, lapsToStop: 1 }), "caution");
  // ...but not from the other end of the race: a stop 30 laps early is not free,
  // it is a wasted set.
  assert.equal(now({ cautionLevel: 3, lapsToStop: A.STRAT.CAUTION_REACH + 1 }), "");
  // ...nor onto a set that cannot carry the stint it lengthens: an SC on lap 2
  // of 12 pulled a lap-7 stop forward onto a soft that could not reach the
  // flag, and 21 of 21 one-stop plans ran two or three stops.
  assert.equal(now({ cautionLevel: 3, lapsToStop: 3, fits: false }), "");
  assert.equal(now({ cautionLevel: 2, lapsToStop: 3, fits: true }), "caution");
  // A local yellow (level 1) does not neutralise the field, so it is not free.
  assert.equal(now({ cautionLevel: 1, lapsToStop: 1 }), "");  // …and a RED FLAG (4) is not a pit window at all: the field is held, and
  // arms made under it leaked into green when the restart was refused.
  assert.equal(now({ cautionLevel: 4, lapsToStop: 2 }), "");
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

// ── 5. The PLAYER's reference plan: pins (js/race/pit-lane.js planFor / replan) ──

test("a pinned stop count returns that many stops, with the stop laps inside the race", () => {
  // The STRATEGY row pins the count; the planner keeps choosing the rubber.
  for (const stops of [0, 1, 2]) {
    const p = A.stintPlan({ laps: 53, lifeLaps: lifeFor(53), pitLossLaps: PIT_LOSS_LAPS, roll: 0.5, stops });
    assert.equal(p.stops, stops, `pinned ${stops}`);
    assert.equal(p.lapsAt.length, stops);
    for (const at of p.lapsAt) assert.ok(at >= 1 && at <= 52, `stop lap ${at} inside [1, 52]`);
    assert.equal(p.stints.reduce((a, v) => a + v, 0), 53, "the stints still cover the distance");
  }
  // A pin above the cap is the cap, not a crash.
  assert.equal(A.stintPlan({ laps: 53, lifeLaps: lifeFor(53), pitLossLaps: PIT_LOSS_LAPS, roll: 0.5, stops: 5 }).stops, A.STRAT.MAX_STOPS);
});

test("a pin the race is too short to hold is capped: no zero-length stint, no stop on lap 0", () => {
  // The pin is stored per circuit, not per distance: a 2-stop pin met a 2-lap
  // sprint leg and planned stints [0, 1, 1], "BOX L0".
  for (const [laps, stops] of [[2, 2], [1, 1], [3, 2]]) {
    const p = A.stintPlan({ laps, lifeLaps: lifeFor(laps), pitLossLaps: PIT_LOSS_LAPS, roll: 0.5, stops });
    assert.ok(p.stops <= laps - 1, `${laps} laps hold at most ${laps - 1} stops, got ${p.stops}`);
    for (const n of p.stints) assert.ok(n >= 1, `a stint of ${n} laps (${laps} laps, pin ${stops}): ${p.stints}`);
    for (const at of p.lapsAt) assert.ok(at >= 1 && at < laps, `stop lap ${at} inside [1, ${laps - 1}]`);
  }
});

test("a pinned start is the first compound, and a compound the planner does not enumerate falls back to the classes", () => {
  for (const start of ["soft", "medium", "hard"]) {
    const p = A.stintPlan({ laps: 53, lifeLaps: lifeFor(53), pitLossLaps: PIT_LOSS_LAPS, roll: 0.5, start });
    assert.equal(p.seq[0], start);
  }
  const wet = A.stintPlan({ laps: 53, lifeLaps: lifeFor(53), pitLossLaps: PIT_LOSS_LAPS, roll: 0.5, start: "wet" });
  assert.ok(wet && wet.seq.length >= 1, "a wet start still plans (from the classes)");
});

test("firstLife shortens the FIRST stint only: a re-plan runs the set that is on the car, not a fresh one", () => {
  const life = lifeFor(53);
  const fresh = A.stintPlan({ laps: 53, lifeLaps: life, pitLossLaps: PIT_LOSS_LAPS, roll: 0.5, start: "medium", stops: 1 });
  const worn = A.stintPlan({ laps: 53, lifeLaps: life, pitLossLaps: PIT_LOSS_LAPS, roll: 0.5, start: "medium", stops: 1, firstLife: 6 });
  assert.ok(worn.lapsAt[0] < fresh.lapsAt[0], `a set with 6 laps left stops earlier (${worn.lapsAt[0]} vs ${fresh.lapsAt[0]})`);
  assert.ok(worn.lapsAt[0] <= 9, `…and soon: lap ${worn.lapsAt[0]}`);
  assert.equal(worn.stints.reduce((a, v) => a + v, 0), 53);
});

// ── The pit lane queues ─────────────────────────────────────────────────────
// The held gap on the lane, and the reason it is not the racing one. game.js
// picks between them (the `onLane` branch in the capBlocks block); what is
// checkable here is that the lane's number is a real gap for a 4.8 m car and
// that it is wider than what racing traffic uses, which is the whole point.
test("the lane's follow distance is a car length plus air, and wider than the racing one", () => {
  const CAR_L = 4.8;
  const lane = A.laneFollow();
  assert.ok(lane > CAR_L, `a held gap must clear a car length (${lane} vs ${CAR_L})`);
  // Racing follow is a time headway (AiDrive.followGap: s0 + v·T), so the
  // like-for-like figure is at the lane's QUEUE speed — a crawl to rest — where
  // the racing gap is its s0, a metre of air: the lane holds more than that.
  const t = { craft: 1, awareness: 1, experience: 1, skill: 1, consistency: 1 };
  const atCrawl = A.followGap(t, false, 0, 0, null, 0, null, null);
  assert.ok(lane > atCrawl,
    `the lane holds more than racing traffic does at a crawl (${lane} vs ${atCrawl.toFixed(2)})`);
  // …and it is not so wide that a short lane cannot hold a queue: five cars at
  // this spacing must still fit inside the shortest complex in the game.
  assert.ok(lane * 5 < 190, `five cars queue inside a short lane (${lane * 5} m)`);
});

// ── The split answers the fuel term the cost already priced ─────────────────
// `degCost` charges every stint against a FUEL-ADJUSTED life, and the split
// divided the race by the RAW lives — so the cost knew a full tank eats tyres
// and the stint lengths could not answer. That is the mechanism the planner's
// own comment says makes plans MIX ("harder rubber early and softer late") and
// it could not act: a hard first stint could not take the longer share its
// durability earns while the car is heavy.
test("a fuel-aware split gives the early stints less of the race", () => {
  const laps = 50, lives = [37, 24, 24];   // medium, soft, soft at this distance
  const raw = A.splitStints(laps, lives);
  const fuelled = A.splitStints(laps, lives, A.STRAT.FUEL_WEAR);
  assert.equal(raw.reduce((a, v) => a + v, 0), laps, "the raw split still covers the race");
  assert.equal(fuelled.reduce((a, v) => a + v, 0), laps, "and so does the fuel-aware one");
  assert.ok(fuelled[0] < raw[0], `the first stint shortens on a heavy car (${fuelled[0]} vs ${raw[0]})`);
  assert.ok(fuelled[2] > fuelled[1], `and the last runs longest on a light one (${JSON.stringify(fuelled)})`);
  // Omitting the term is exactly the old behaviour, so nothing that never
  // passed it changes.
  assert.deepEqual([...A.splitStints(laps, lives, 0)], [...raw], "no fuel term, no change");
  // A single stint has nothing to trade against, and must not be disturbed.
  assert.deepEqual([...A.splitStints(30, [40], A.STRAT.FUEL_WEAR)], [30], "a no-stop plan is one stint");
});

// ── Two dry compounds (FIA Sporting Regulations B6.3.6) ───────────────────
test("twoCompound: every plan runs at least two different dry compounds", () => {
  // A dry race must use two specifications; the planner enumerated
  // single-compound and no-stop plans, and 20 of 21 AI cars ran one compound.
  for (const laps of [10, 25, 53]) {
    for (let i = 0; i < 20; i++) {
      const p = A.stintPlan({ laps, lifeLaps: lifeFor(laps), pitLossLaps: PIT_LOSS_LAPS, roll: (i + 0.5) / 20, twoCompound: true });
      assert.ok(new Set(p.seq).size >= 2, `${laps} laps, roll ${i}: ${p.seq.join(">")}`);
    }
  }
});

test("twoCompound: a re-cut counts the compounds already run, and a pinned NO STOP rises to the one stop the rule needs", () => {
  const recut = A.stintPlan({ laps: 12, lifeLaps: lifeFor(12), pitLossLaps: PIT_LOSS_LAPS, roll: 0.5,
                              start: "hard", twoCompound: true, used: ["medium"] });
  assert.ok(recut, "a plan exists");
  // The pin used to win: a legal-looking one-set plan, and a DSQ at the flag
  // for the player who followed it (bug hunt 2026-10-05 G3).
  for (const laps of [10, 20]) {
    const pinned = A.stintPlan({ laps, lifeLaps: lifeFor(laps), pitLossLaps: PIT_LOSS_LAPS, roll: 0.5, stops: 0, twoCompound: true });
    assert.equal(pinned.stops, 1, `${laps} laps: NO STOP under the two-compound rule plans one stop`);
    assert.ok(new Set(pinned.seq).size >= 2, `${laps} laps: on two compounds (${pinned.seq.join(">")})`);
  }
  const free = A.stintPlan({ laps: 20, lifeLaps: lifeFor(20), pitLossLaps: PIT_LOSS_LAPS, roll: 0.5, stops: 0 });
  assert.equal(free.stops, 0, "where the rule does not apply (wet, sprint, short) the pin stands");
  const reCut = A.stintPlan({ laps: 8, lifeLaps: lifeFor(8), pitLossLaps: PIT_LOSS_LAPS, roll: 0.5, stops: 0, twoCompound: true,
                              start: "hard", used: ["medium"] });
  assert.equal(reCut.stops, 0, "a re-cut that has already run two compounds keeps NO STOP");
});
