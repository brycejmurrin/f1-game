/* race-flow-vm.test.mjs — the race-flow transitions a phone player drives every
 * session, pinned in the Node VM (tools/lib/game-vm.cjs): a safety car that is
 * withdrawn on release with OVERTAKE held to the leader's next crossing, a
 * quit-to-menu that hands the next race a clean flag / pass-watch / pit / tyre
 * state, and a red flag that re-grids the field on the stopped clock.
 *
 * Measured live first (docs/notes/LIVE-DEBUGGER-RACE-2026-10-24.md S1–S3, S6,
 * S12): every assertion below held on the deploy tip. They are pinned because the
 * three paths share a dozen module-level `let`s in js/game.js (caution, scWatch,
 * pits, tyres, raceT, frozen) and a regression in any of them is invisible to the
 * pure race-control and pit-lane unit suites, which never run the whole game.
 *
 * AI-only field (g.aiOnly()): the parked VM player would otherwise be a blocker
 * the AI attacks and the human finishDelay waits on.
 *
 * Run: node --test tests/unit/race-flow-vm.test.mjs   (~30 s, one boot)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

const ID = "monza";
let g = null, A = null, G = null;
before(async () => { g = await createGame({ track: ID }); A = g.apex; G = g.G; });
after(() => { if (g) g.close(); });

// Step the race in 60 Hz ticks until `pred()` holds; false when `maxTicks` run out.
function stepUntil(pred, maxTicks) {
  for (let i = 0; i < maxTicks; i++) { if (pred()) return true; g.step(1, 1 / 60); }
  return pred();
}
const leader = () => G.ranked && G.ranked[0];
const leaderFrac = () => (leader() ? leader().s / G.track.total : 0);
async function fresh(laps) {
  const before = G.cars;
  await g.race(ID, "day", "dry", { laps });
  assert.notEqual(G.cars, before, "a new field was built");
  A.caution(true); A.seed(17); g.aiOnly();
}
const timersAfterStart = [];

test("a scripted safety car is withdrawn on release, and OVERTAKE stays off until the leader's next crossing", async () => {
  await fresh(4);
  timersAfterStart.push(g._timers.pending());
  assert.ok(stepUntil(() => G.state === "race" && G.raceT > 20, 60 * 40), "the race is running");
  assert.equal(A.caution().level, 0, "green before the hold");
  G.holdCaution(3, "SAFETY CAR");
  assert.ok(stepUntil(() => A.caution().level === 3, 60), "the held SC flies within a second");
  g.step(60 * 10, 1 / 60);
  assert.equal(A.caution().level, 3, "…and stays out while held");
  assert.equal(G.otEnabled(), false, "OVERTAKE is off under the safety car");
  // Release near the end of the leader's lap so its next crossing is close.
  assert.ok(stepUntil(() => leaderFrac() > 0.85, 60 * 200), "the leader reaches the last part of a lap under the SC");
  const lapAtRelease = leader().lap;
  G.holdCaution(0);
  assert.ok(stepUntil(() => A.caution().level === 0, 60), "GREEN within a second of the release");
  assert.equal(G.otEnabled(), false, "OVERTAKE is still held after the release (B7.2.2c: until the line)");
  assert.ok(stepUntil(() => leader().lap > lapAtRelease, 60 * 60), "the leader crosses the line after the restart");
  assert.ok(stepUntil(() => G.otEnabled(), 60 * 5), "OVERTAKE comes back at the leader's crossing");
  assert.equal(A.caution().level, 0, "no flag re-raised by the release");
});

test("quit-to-menu then start again hands the next race a clean flag, pass-watch, pit and tyre state", async () => {
  A.tyres({ level: "real" });
  g.step(60 * 5, 1 / 60);   // some wear on the first race's set
  assert.equal(G.state, "race");
  G.quitToMenu(); g.flushTimers(true);
  assert.equal(G.state, "menu");
  assert.equal(A.caution().level, 0, "quit drops the flag machine");
  await fresh(3);
  const c = A.caution(), p = A.pit(), t = A.tyres();
  assert.equal(c.level, 0, "green on the new grid");
  assert.equal(c.owed, 0, "no pass-watch debt carried over");
  assert.equal(p.armed, false, "no armed stop carried over");
  assert.equal(p.state, "none");
  assert.equal(p.stops, 0, "stop count starts at zero");
  assert.equal(t.wear, 0, "a fresh set of tyres");
  assert.equal(t.lapsOn, 0);
  assert.ok(G.raceT <= 0.5, `race clock reset (raceT ${G.raceT})`);
  assert.equal(G.paused, false); assert.equal(G.frozen, false);
  const pend = g._timers.pending();
  assert.ok(pend <= timersAfterStart[0] + 2, `no timer growth across quit→start (${timersAfterStart[0]} → ${pend})`);
});

test("a red flag re-grids the field on the stopped clock and leaves no flag flying at the restart", async () => {
  await fresh(5);
  assert.ok(stepUntil(() => G.state === "race" && G.raceT > 60, 60 * 90), "a minute of racing");
  const stopped = G.raceT, lapBefore = leader().lap;
  const r = A.redFlag();
  assert.ok(r && r.state === "count", "the red flag calls a standing restart (state count)");
  const running = G.cars.filter((c) => !c.retired);
  assert.ok(running.every((c) => Math.abs(c.speed) < 0.01), "every car is stationary on the grid");
  assert.ok(running.every((c) => c.lap === running[0].lap), "the whole field is re-gridded on one lap");
  assert.ok(running[0].lap <= lapBefore, "the leader's lap is rewound, never advanced");
  assert.ok(stepUntil(() => G.state === "race", 60 * 30), "the restart goes green");
  assert.ok(Math.abs(G.raceT - stopped) < 1, `the clock resumes where the flag stopped it (${stopped.toFixed(1)} → ${G.raceT.toFixed(1)})`);
  assert.equal(A.caution().level, 0, "no flag left flying at the restart");
  assert.equal(G.cars.map((c, k) => A.pit({ car: k }).state).filter((s) => s !== "none").length, 0, "no pit state survives the re-grid");
  assert.ok(stepUntil(() => leader().lap > running[0].lap, 60 * 150), "the field races on after the restart");
});

for (const flow of ["season", "career"]) {
  test(`${flow}: a duplicate completion cannot advance or pay another round`, async () => {
    await fresh(3);
    const { SeasonCal, Career } = g.sandbox;
    if (flow === "career") {
      Career.start({ flavour: "driver", teamId: G.player.team.id, seed: 7 });
      Career.engage(true);
    }
    SeasonCal.engage(flow);
    G.flow = flow;
    G.season = flow === "career" ? Career.data().season : SeasonCal.blank();
    // Invoke the real completion boundary twice with the same field. This pins
    // idempotence; it does not assert that ordinary UI controls deliver twice.
    G.endRace();
    assert.equal(G.state, "results");
    assert.equal(G.season.round, 1);
    const settled = JSON.stringify(flow === "career" ? Career.data() : G.season);
    G.endRace();
    assert.equal(G.season.round, 1, "a duplicate completion cannot spend the next round");
    assert.equal(JSON.stringify(flow === "career" ? Career.data() : G.season), settled,
      "the same completion must preserve points, round, economy and results ledger");
    G.flow = "gp";
    Career.engage(false);
    SeasonCal.engage(false);
  });
}

test("career simulation forgets the prior driven round's unclassified DNF", async () => {
  const simGame = await createGame({ track: ID });
  try {
    const { G, apex: A } = simGame;
    const { Career, SeasonCal } = simGame.sandbox;
    Career.start({ flavour: "driver", teamId: G.player.team.id, seed: 7 });
    Career.engage(true); SeasonCal.engage("career");
    G.flow = "career"; G.season = Career.data().season;
    for (const c of G.cars) {
      c.lap = 4; c.prog = 3 * G.track.total; c.finished = true;
      c.finishT = 300 + G.cars.indexOf(c); c.tyreLog = [{ code: "S" }, { code: "M" }]; c.best = 90;
    }
    G.player.finished = false; G.player.retired = true; G.player.lap = 1;
    G.player.prog = 100; G.player.dnf = "mechanical"; G.raceT = 350;
    G.endRace();
    assert.equal(G.player.classified, false);
    G.raceReliability = "off";
    A.careerSim(1);
    const row = Career.data().results.at(-1);
    assert.equal(G.player.retired, false);
    assert.ok(row.p <= 10, "the seeded next-round finish earns points");
    assert.ok(row.pts > 0, "a previous unclassified DNF cannot erase the new finish's points");
  } finally { simGame.close(); }
});
