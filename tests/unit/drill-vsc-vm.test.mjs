/* drill-vsc-vm.test.mjs — LEARN's VSC: BOX OR STAY drill (js/learn-drills/vsc.js, #6559 step 17, design #6554 §1)
 * on the real game in the Node VM, through game.js's own host (tests/helpers/vsc-drill-vm.mjs).
 *
 * Pins (the #6559 step 17 row, the worker brief of 2026-11-28):
 *   - the numbers are DETERMINISTIC: the same three rounds played twice (RETRY) give byte-identical branch times, so
 *     the card prints no "±" (Bryce's decision 4);
 *   - round 2 (a half-worn set with a stop due anyway): BOX beats STAY; every round's right call matches the
 *     recorded refs (tests/data/learn-drill-refs.json "vsc"), so the scenarios still teach after a retune;
 *   - medals go through learnMedals.v1 (decision 5): three right calls is gold, saved under "vsc|classic";
 *   - end() releases the VSC hold (RaceControl back to green), lets the held race go, restores the player's settings;
 *   - the drill race runs its own lap count (setup.laps 12) and every other drill still runs one lap (game.js's drill block).
 *
 * Run: node --test tests/unit/drill-vsc-vm.test.mjs   (~60 s, one boot)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { vscDrill, REFS } from "../helpers/vsc-drill-vm.mjs";

const refs = JSON.parse(readFileSync(REFS, "utf8")).vsc;
let d = null, first = null;
before(async () => { d = await vscDrill(); });
after(() => { if (d) d.close(); });

const times = (r) => r.rounds.map((x) => [x.id, x.box, x.stay]);

test("a 12-lap drill race with your car on the AI and the player's car parked", () => {
  const { G } = d;
  assert.equal(G.lapsTarget, 12, "setup.laps reaches the drill race");
  assert.equal(G.cars.length, 2);
  assert.equal(G.frozen, true, "the live race is held while the drill decides");
  assert.equal(d.V.state().phase, "decide");
  assert.equal(/BOX[^]*STAY OUT/.test(d.S.shown() || ""), true, "the decision card is up with BOX and STAY OUT");
});

test("three calls: every right call is the faster branch, round 2 is BOX, gold saved in learnMedals.v1", () => {
  const picks = refs.rounds.map((x) => x.best);
  first = d.play(picks);
  assert.ok(first, "the host shows a result");
  assert.equal(first.rounds.length, 3);
  first.rounds.forEach((x, k) => {
    assert.equal(x.best, refs.rounds[k].best, "round " + (k + 1) + " (" + x.id + ") right call moved: " + JSON.stringify(x));
    assert.equal(x.best, x.box <= x.stay ? "box" : "stay");
    assert.equal(x.lost, 0);
    assert.ok(Number.isFinite(x.box) && Number.isFinite(x.stay) && x.box > 60 && x.stay > 60, "measured race times");
  });
  const due = first.rounds[1];
  assert.equal(due.id, "due");
  assert.ok(due.box < due.stay, "a stop due anyway: boxing under the VSC wins (" + due.box + " vs " + due.stay + ")");
  assert.ok(first.rounds[0].stay < first.rounds[0].box, "a fresh set near the flag: staying out wins");
  assert.equal(first.value, 3);
  assert.equal(first.medal, "gold");
  const saved = d.G.store.get("learnMedals.v1", {})["vsc|classic"];
  assert.ok(saved && saved.medal === "gold" && saved.best === 3, "learnMedals.v1 row: " + JSON.stringify(saved));
  assert.equal(d.G.cautionInfo().level, 0, "no VSC is left flying between rounds");
});

test("RETRY replays the same rounds byte-identically; a wrong call costs exactly the gap", () => {
  assert.ok(d.retry(), "RETRY");
  assert.equal(d.V.state().phase, "decide");
  assert.equal(d.V.state().round, 0);
  const wrong = refs.rounds.map((x) => (x.best === "box" ? "stay" : "box"));
  const again = d.play(wrong);
  assert.deepEqual(times(again), times(first), "the branch times differ between two runs");
  again.rounds.forEach((x) => assert.ok(Math.abs(x.lost - Math.abs(x.box - x.stay)) <= 0.011, JSON.stringify(x)));
  assert.equal(again.value, 0);
  assert.equal(again.medal, null);
  assert.equal(d.G.store.get("learnMedals.v1", {})["vsc|classic"].medal, "gold", "a worse run keeps the best medal");
});

test("score() and the medal tiers are pure", () => {
  const r = (pick, best, box, stay) => ({ id: "x", pick, best, box, stay, lost: pick === best ? 0 : Math.abs(box - stay), right: pick === best });
  const s = d.V.score([r("box", "box", 10, 20), r("stay", "box", 10, 10.3), r("stay", "stay", 30, 20)]);
  assert.equal(s.value, 2);
  assert.equal(s.better, "high");
  assert.ok(s.metrics.length <= 6);
  assert.equal(/marginal/.test(s.metrics[1][1]), true);
  assert.deepEqual({ ...d.V.MEDALS }, { bronze: 1, silver: 2, gold: 3, goldClean: false });
  assert.deepEqual(refs.tiers, { bronze: 1, silver: 2, gold: 3 });
});

test("a quit while a branch is half run still releases the hold, the freeze and the drill's settings", () => {
  const { G, g } = d;
  assert.ok(d.retry(), "RETRY");
  assert.equal(d.V.state().phase, "decide");
  assert.ok(d.V.choose("box"));
  d.V.slice(0);
  assert.equal(d.V.state().phase, "running");
  assert.equal(G.cautionInfo().level > 0 || G.headlessMode === true, true, "the branch is live mid-way (VSC raised or headless)");
  const end = g.apex.drillEnd();
  assert.equal(end.ok, true, JSON.stringify(end));
  assert.equal(G.frozen, false);
  assert.equal(G.headlessMode, false, "the branch handed the headless flag back");
  assert.equal(G.cautionInfo().level, 0);
  assert.equal(G.drills().active(), null);
  assert.equal(G.raceTyreWear, d.before.tyreWear, "stage()'s tyre wear is undone");
  assert.equal(d.V.state(), null);
});

test("after end(): no hold, no freeze, no card; other drills still run 1 lap", async () => {
  const { G, g } = d;
  assert.equal(G.state, "menu");
  assert.equal(G.frozen, false, "the race hold is released");
  assert.equal(G.cautionInfo().level, 0);
  assert.equal(d.V.state(), null);
  assert.equal(d.S.shown(), null, "the decision card is gone");
  const launched = await g.apex.drillLaunch("wake");
  assert.equal(launched.ok, true, JSON.stringify(launched));
  const up = await g.stepUntil(() => G.state === "race" || G.state === "count", { maxSteps: 900 });
  assert.ok(up.ok);
  assert.equal(G.lapsTarget, 1, "a drill without setup.laps still runs one lap");
  g.apex.drillEnd();
});
