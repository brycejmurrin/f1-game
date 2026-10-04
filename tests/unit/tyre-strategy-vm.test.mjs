/* tyre-strategy-vm.test.mjs — the tyre strategy with TYRE WEAR on, in the Node
 * VM (tools/lib/game-vm.cjs): the real gridUp, the real per-tick pit update,
 * the real planner and the real sporting rule, on real circuits.
 *
 * Every browser fixture and this harness pin wear OFF (a physics baseline must
 * measure the driving model), so no spec ever ran the strategy stack end to
 * end — which is how a player could be told "PLAN NO STOP" with tyres gone in
 * three laps (#403), AUTO could fit a set that disqualified them (#403), and a
 * wet race put the whole AI field on slicks (#408). The unit files test each
 * piece against stubs; this one wires them together once.
 *
 * Run: node --test tests/unit/tyre-strategy-vm.test.mjs   (~15 s, one boot)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

let g = null;
before(async () => { g = await createGame({ storage: { tyreWear: "real" } }); });
after(() => { if (g) g.close(); });

test("the plan prices the circuit: Austria's sets last half what a neutral circuit's do", async () => {
  await g.race("redbull", "day", "dry", { laps: 10 });
  const { G } = g;
  const T = vm.runInContext("TyreModel", g.ctx);
  assert.equal(G.tyres.level(), "real");
  const sev = G.tyres.severity();
  assert.ok(sev > 1.9, `Austria's severity reaches the model: ${sev}`);
  // The hard: a 10-lap medium (3.8) sits under the MIN_LIFE_LAPS floor here.
  const planned = G.tyres.planLaps(T.AI_CLASS.hard.life, 10);
  assert.ok(Math.abs(planned - T.lifeLaps(T.AI_CLASS.hard.life, 10) / sev) < 1e-9,
    `planLaps is the life the wear actually allows: ${planned}`);
  // …and the player's reference plan starts on the set the player is on.
  const p = G.player;
  assert.ok(p.pitPlan, "the player has a reference plan");
  const code = p.tyre && p.tyre.code;
  const cls = { S: "soft", M: "medium", H: "hard" }[code];
  if (cls) assert.equal(p.pitPlan.seq[0], cls, `plan starts on the fitted ${code}: ${p.pitPlan.seq}`);
});

test("a NO STOP plan becomes a stop when the set is going faster than planned — through the live tick", async () => {
  await g.race("redbull", "day", "dry", { laps: 10 });
  const { G, apex: a } = g;
  const p = G.player;
  a.tyres({ fit: "medium" });                 // a known set, written to the stint log as a stop would
  p.tyreLog = p.tyreLog.slice(-1);            // …and it is the grid set
  p.pitStops = 0;
  p.pitPlan = { stops: 0, seq: ["medium"], stints: [10], lapsAt: [], pitLossLaps: p.pitPlan ? p.pitPlan.pitLossLaps : 0.2, pin: null };
  assert.match(G.pits.planInfo(p).text, /NO STOP/, "the precondition: the plan says NO STOP");
  // Three laps in and 90 % gone: the pace the reported bug describes.
  p.lap = 4; p.tyreLap0 = 1; p.fuelLap = 4; p.tyreWear = 0.9; p.tyreWearF = 0.9; p.tyreWearR = 0.9;
  p._planLap = 3;                             // the re-cut is due on this lap
  g.step(3);
  assert.ok(p.pitPlan.stops >= 1, `the live re-cut adds a stop: ${JSON.stringify(p.pitPlan)}`);
  assert.match(G.pits.planInfo(p).text, /BOX|1-STOP|2-STOP/, `the HUD line: ${G.pits.planInfo(p).text}`);
});

test("a 5-lap race at Austria is a no-stop race: the minimum life holds after severity", async () => {
  // Severity 1.97 divided the 4-lap floor to ~2, and the whole field planned a
  // stop into a 5-lap sprint.
  await g.race("redbull", "day", "dry", { laps: 5 });
  const { G } = g;
  const ai = G.cars.filter((c) => !c.human && c.pitPlan);
  assert.ok(ai.length > 5, "a planned field");
  const stopping = ai.filter((c) => c.pitPlan.stops > 0);
  assert.equal(stopping.length, 0, "planned stops: " + stopping.map((c) => c.code + ":" + c.pitPlan.seq).join(" "));
});

test("the grid runs several strategies: the roll is the driver's, not the grid slot's", async () => {
  // Keyed by slot + skill, tier-adjacent cars drew alike and a 25-lap Bahrain
  // split into two plans (HM / MS, 11 and 10 cars).
  await g.race("bahrain", "day", "dry", { laps: 25 });
  const seqs = new Set(g.G.cars.filter((c) => !c.human && c.pitPlan).map((c) => c.pitPlan.seq.join("-")));
  assert.ok(seqs.size >= 3, "strategies on the grid: " + [...seqs].join(" | "));
});

test("an AI re-cuts its own plan from the wear it measures, quietly", async () => {
  await g.race("bahrain", "day", "dry", { laps: 25 });
  const { G } = g;
  const said = []; const ann = G.announce; G.announce = (m) => { said.push(m); if (ann) ann(m); };
  try {
    const c = G.cars.find((o) => !o.human && o.pitPlan && o.pitPlan.stops === 1);
    assert.ok(c, "a one-stop AI");
    const before = c.pitPlan.lapsAt[0];
    // Four laps on the set and 80 % gone: far faster than any 25-lap plan.
    c.lap = 5; c.tyreLap0 = 1; c.fuelLap = 5; c.tyreWear = 0.8; c.tyreWearF = 0.8; c.tyreWearR = 0.8;
    c.pitArmed = false; c.pitState = "none"; c._planLap = 4;
    G.pits.update(c, 1 / 60);
    assert.ok(c.pitPlan.lapsAt[0] < before, `the stop comes forward: L${before} -> L${c.pitPlan.lapsAt[0]}`);
    assert.equal(c.pitReplans, 1, "counted");
    assert.equal(c.pitPlan.stints.reduce((a, v) => a + v, 0), 25, "the strip still covers the race");
    assert.ok(!said.some((m) => /PLAN B/.test(m)), "an AI's re-cut is not the player's radio: " + said.join(" | "));
  } finally { G.announce = ann; }
});

test("an AI set wearing at the planned, fuel-adjusted rate is not re-cut", async () => {
  // loadK used to fold the fuel in: high on a full tank, sinking as it
  // emptied, so the stop crept a lap later every re-cut (9 a car in 50 laps).
  await g.race("bahrain", "day", "dry", { laps: 50 });
  const { G } = g;
  const T = vm.runInContext("TyreModel", g.ctx);
  const A = vm.runInContext("AiDrive", g.ctx);
  const c = G.cars.find((o) => !o.human && o.pitPlan && o.pitPlan.stops >= 1);
  const before = c.pitPlan.lapsAt.slice();
  const nominal = G.tyres.planLaps(c.tyre.life, 50);
  const lap = 9, onSet = 8;
  const fuel = 1 - (lap - onSet / 2) / 50;
  const w = onSet / nominal * (1 + A.STRAT.FUEL_WEAR * fuel);   // exactly the plan's rate, with its fuel
  c.lap = lap; c.tyreLap0 = 1; c.fuelLap = lap; c.tyreWear = w; c.tyreWearF = w; c.tyreWearR = w;
  c.pitArmed = false; c.pitState = "none"; c._planLap = lap - 1; c._recutLap = null;
  G.pits.update(c, 1 / 60);
  assert.ok(Math.abs(c.pitPlan.loadK - 1) < 0.08, `loadK at the planned rate: ${c.pitPlan.loadK}`);
  assert.equal(c.pitPlan.lapsAt.join(), before.join(), "the plan stands");
  assert.ok(T);
});

test("an alert AI covers a rival's stop from behind; a slow wall does not", async () => {
  await g.race("bahrain", "day", "dry", { laps: 25 });
  const { G } = g;
  const ai = G.cars.filter((o) => !o.human && o.pitPlan && o.pitPlan.stops >= 1);
  const [c, o] = ai;
  const setup = (react) => {
    c.experience = react; c.awareness = react;
    c.lap = c.pitPlan.lapsAt[0] - 1; c.pitStops = 0; c.pitArmed = false; c.pitState = "none"; c.pitNext = null;
    c.tyreWear = 0.6; c.speed = 70; c.prog = 50000;
    o.prog = c.prog - 70 * 1.5; o.pitState = "lane"; o.retired = false; o.finished = false;   // 1.5 s behind, in the lane
    c._rivalStop = false;
    for (const x of G.cars) if (x !== c && x !== o) x.prog = 0;   // (the rest far behind)
  };
  setup(0.3);
  assert.equal(G.pits.think(c), "", "a rookie wall does not react");
  setup(1);
  assert.equal(G.pits.think(c), "cover", "a veteran wall covers the undercut");
  // Only the car DIRECTLY behind: with another car between us, its stop is
  // that car's problem — covering it chained through the field.
  const mid = ai[2];
  c.pitArmed = false; c.pitNext = null; c.pitWhy = "";
  mid.prog = c.prog - 35; mid.pitState = "none"; mid.retired = false; mid.finished = false;
  assert.equal(G.pits.think(c), "", "a stop two cars back is not ours to cover");
  // …and a wall that has made its rival call this race does not make another.
  mid.prog = 0; setup(1); c._rivalStop = true;
  assert.equal(G.pits.think(c), "", "one rival call a race");
  o.pitState = "none";
});

test("AUTO never fits the letter a car owing its second dry compound has run", async () => {
  await g.race("bahrain", "day", "dry", { laps: 10 });
  const { G } = g;
  const p = G.player;
  assert.equal(G.pits.twoCompoundApplies(), true, "a 10-lap dry Race: the rule binds");
  for (const run of ["S", "M", "H"]) {
    p.tyreLog = [{ code: run, lap0: 0, lap1: null }];
    p.pitNext = null; p.pitPlan = null; p.lap = 5;
    const next = G.pits.pickFor(p);
    assert.ok(next && next.code !== run, `after ${run}, AUTO picked ${next && next.code}`);
  }
});

test("a wet race puts the AI field on the tread the weather wants, and nobody pits for it", async () => {
  await g.race("bahrain", "day", "rain", { laps: 5 });
  const { G } = g;
  const T = vm.runInContext("TyreModel", g.ctx);
  const want = T.treadFor(G.raceWeather, G.trackWetness && G.trackWetness());
  assert.ok(want > 0, `rain wants a wet tread: ${want}`);
  const ai = G.cars.filter((c) => !c.human && !c.retired);
  assert.ok(ai.length > 5, "a field");
  for (const c of ai) assert.equal(c.tyre && c.tyre.tread, want, `${c.code} starts on ${c.tyre && c.tyre.code}`);
  g.step(120);                                // two seconds of racing: think() runs for every car
  const armed = ai.filter((c) => c.pitArmed || (c.pitState && c.pitState !== "none"));
  assert.equal(armed.length, 0, "no weather stop on lap 1: " + armed.map((c) => c.code + ":" + c.pitWhy).join(" "));
});

// THE FIELD'S PLANS, audited at the grid on three circuits that span the
// severity range. A full race per circuit is ~5 min in the VM
// (tools/check/ai-strategy-census.mjs measures that); the plan audit is the
// cheap half and catches what broke before: the severity-blind planner
// (#403) planned Austria's mediums for 7.4 laps against a real 3.8.
async function auditPlans(g, ids, LAPS) {
  const T = vm.runInContext("TyreModel", g.ctx);
  const A = vm.runInContext("AiDrive", g.ctx);
  for (const id of ids) {
    await g.race(id, "day", "dry", { laps: LAPS });
    const { G } = g;
    const rule = G.pits.twoCompoundApplies();
    const ai = G.cars.filter((c) => !c.human && c.pitPlan);
    assert.ok(ai.length > 5, `${id}: a planned field`);
    for (const c of ai) {
      const p = c.pitPlan;
      assert.equal(p.stints.reduce((a, v) => a + v, 0), LAPS, `${id} ${c.code}: stints ${p.stints} cover the race`);
      if (rule) assert.ok(new Set(p.seq).size >= 2, `${id} ${c.code}: ${p.seq} runs one dry compound (DSQ)`);
      let from = 0;
      for (let i = 0; i < p.stints.length; i++) {   // the FINAL stint too: an early stop lengthens it
        const len = p.stints[i];
        // The life the WEAR gives (update(): life·laps / severity, floored at
        // MIN_LIFE_LAPS, at REAL), not planLaps — the planner's own number
        // cannot audit the planner.
        const life = Math.max(T.MIN_LIFE_LAPS, T.AI_CLASS[p.seq[i]].life * LAPS / G.tyres.severity())
          / (1 + A.STRAT.FUEL_WEAR * (1 - (from + len / 2) / LAPS));
        // Whole laps against a fractional life: the optimum can end a lap and
        // a bit past it (measured at the flag: 0.96-1.07 wear); an early
        // stagger on top of that ran 7 laps on a 5.3-lap hard (1.17-1.25).
        assert.ok(len <= life + 1.5, `${id} ${c.code}: stint ${i + 1} (${p.seq[i]}) is ${len} laps on a ${life.toFixed(2)}-lap set`);
        from += len;
      }
    }
  }
}

test("every AI plan covers the race, meets the two-compound rule, and no stint outlives its set by more than a lap", async () => {
  await auditPlans(g, ["bahrain", "redbull", "monaco"], 10);
});

// The census grid (difficulty normal, tools/check/ai-strategy-census.mjs): its
// rolls reach the ends of the range the default grid does not, which is where
// an early stagger overran Austria's final stint (1.17-1.25 wear at the flag).
test("the census grid's plans pass the same audit at Austria, 10 and 5 laps", async () => {
  const g2 = await createGame({ storage: { tyreWear: "real", difficulty: "normal" } });
  try {
    await auditPlans(g2, ["redbull"], 10);
    await g2.race("redbull", "day", "dry", { laps: 5 });
    const stopping = g2.G.cars.filter((c) => !c.human && c.pitPlan && c.pitPlan.stops > 0);
    assert.equal(stopping.length, 0, "a 5-lap race is one set: " + stopping.map((c) => c.code + ":" + c.pitPlan.seq + "@" + c.pitPlan.lapsAt).join(" "));
  } finally { g2.close(); }
});

// ── 2026-10-04 race-strategy fixes, each against the live think() ─────────

test("an early safety car does not pull a stop onto a set that cannot reach the flag", async () => {
  // Bahrain, 12 laps, SC on lap 2 for 60 s (scratch/audit2/sc-early.mjs):
  // the caution rule took every one-stop plan's lap-7 stop on lap 1-2, onto a
  // soft that could not run 10 laps — 19 cars two-stopped, 2 three-stopped.
  await g.race("bahrain", "day", "dry", { laps: 12 });
  const { G } = g;
  const T = vm.runInContext("TyreModel", g.ctx);
  const A = vm.runInContext("AiDrive", g.ctx);
  const life = (cls, p) => G.tyres.planLaps(T.AI_CLASS[cls].life, 12) / (p.loadK || 1);
  const c = G.cars.find((o) => !o.human && o.pitPlan && o.pitPlan.stops === 1
    && o.pitPlan.lapsAt[0] - 2 <= A.STRAT.CAUTION_REACH && 12 - 2 > life(o.pitPlan.seq[1], o.pitPlan) * 1.1);
  assert.ok(c, "a one-stop AI whose second set cannot run from lap 2 to the flag");
  const reset = (lap) => {
    c.lap = lap; c.pitStops = 0; c.pitArmed = false; c.pitState = "none"; c.pitNext = null; c.pitWhy = "";
    c.tyreWear = 0.1; c.tyreWearF = 0.1; c.tyreWearR = 0.1;
  };
  G.holdCaution(3, "SAFETY CAR");
  try {
    for (let i = 0; i < 600 && G.cautionLevel() !== 3; i++) g.step(1);   // the hold lands on the next race-control tick
    assert.equal(G.cautionLevel(), 3, "the SC is out");
    reset(2);
    assert.equal(G.pits.think(c), "", `a stop on lap 2 onto a ${c.pitPlan.seq[1]} (${life(c.pitPlan.seq[1], c.pitPlan).toFixed(1)} laps) for 10 laps is not free`);
    // …but the free stop still stands where the set can carry the rest: on the
    // plan's own lap the caution outranks the plan, so it is the reason given.
    reset(c.pitPlan.lapsAt[0]);
    assert.equal(G.pits.think(c), "caution", "on the plan's stop lap, the SC stop is taken");
  } finally { G.holdCaution(0); reset(1); }
});

test("on the right wet tyre the stop comes from the wet's life, not the dry plan's lap", async () => {
  // plan.lapsAt is cut for slicks; in a wet race every stop refits the wet, so
  // the dry lap stopped a wet that could reach the flag (and a 2-stop dry plan
  // stopped it twice). The wet stint is re-cut on the wet class's life.
  await g.race("bahrain", "day", "rain", { laps: 10 });
  const { G } = g;
  const c = G.cars.find((o) => !o.human && o.pitPlan && o.pitPlan.stops >= 1 && o.tyre && o.tyre.tread > 0);
  assert.ok(c, "a planned AI on a wet set");
  const reset = (lap, w) => {
    c.lap = lap; c.tyreLap0 = 0; c.pitStops = 0; c.pitArmed = false; c.pitState = "none"; c.pitNext = null; c.pitWhy = "";
    c.tyreWear = w; c.tyreWearF = w; c.tyreWearR = w; c._rivalStop = true;   // (no rival call muddies the reason)
  };
  try {
    const at = c.pitPlan.lapsAt[0];
    reset(at, 0.04 * at);   // wearing at a 25-lap rate: this set reaches the flag
    assert.equal(G.pits.think(c), "", `lap ${at} (the dry plan's stop) on a ${c.tyre.code} that reaches the flag`);
    reset(5, 0.6);          // an 8-lap rate: it cannot, and lap 5 is the middle of the wet race
    assert.equal(G.pits.think(c), "plan", "a wet that cannot reach the flag stops once, mid-race");
    assert.equal(c.pitNext && c.pitNext.tread, c.tyre.tread, "…onto the same wet tread");
    reset(6, 1.3);
    assert.equal(G.pits.think(c), "worn", "a wet set past its life still comes off");
  } finally { reset(1, 0); c._rivalStop = false; }
});

test("with wear on an AI runs on the tread it is fitted; with no plan it keeps the competent-field sentinel", async () => {
  await g.race("bahrain", "day", "rain", { laps: 10 });
  const { G } = g;
  const c = G.cars.find((o) => !o.human && o.pitPlan && o.tyre && o.tyre.tread > 0);
  assert.ok(c, "a planned AI");
  assert.equal(c.tread, c.tyre.tread, `${c.code} on ${c.tyre.code} carries its tread`);
  const wetGrip = G.gripMult(c);
  G.tyres.fit(c, G.tyres.classRecord("soft"));   // slicks in the rain
  try {
    assert.equal(c.tread, 0, "a slick fitted is a slick");
    assert.ok(G.gripMult(c) < wetGrip - 0.1, `slicks in the rain lose grip like the player's: ${G.gripMult(c)} vs ${wetGrip}`);
  } finally { G.tyres.fit(c, G.tyres.classRecord("wet")); }
  // Wear off: no plan, so no stop to fix a wrong tyre — the sentinel stands.
  const fixed = { human: false, pitPlan: null, tread: null };
  G.tyres.fit(fixed, G.tyres.classRecord("soft"));
  assert.equal(fixed.tread, null, "an AI with no strategy keeps tread == null (the full-wet column)");
});
