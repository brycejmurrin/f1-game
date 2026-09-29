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
  const planned = G.tyres.planLaps(T.AI_CLASS.medium.life, 10);
  assert.ok(Math.abs(planned - T.lifeLaps(T.AI_CLASS.medium.life, 10) / sev) < 1e-9,
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
  const want = T.treadFor(G.raceWeather, G.roadWetness && G.roadWetness());
  assert.ok(want > 0, `rain wants a wet tread: ${want}`);
  const ai = G.cars.filter((c) => !c.human && !c.retired);
  assert.ok(ai.length > 5, "a field");
  for (const c of ai) assert.equal(c.tyre && c.tyre.tread, want, `${c.code} starts on ${c.tyre && c.tyre.code}`);
  g.step(120);                                // two seconds of racing: think() runs for every car
  const armed = ai.filter((c) => c.pitArmed || (c.pitState && c.pitState !== "none"));
  assert.equal(armed.length, 0, "no weather stop on lap 1: " + armed.map((c) => c.code + ":" + c.pitWhy).join(" "));
});
