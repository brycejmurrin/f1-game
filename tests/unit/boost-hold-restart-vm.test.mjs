/* boost-hold-restart-vm.test.mjs — two race-flow safety fixes (#6616), against the real game.js in the VM.
 *
 * #6546 P4: the player's BOOST toggle survived the pit box and a caution. ersHeld masked only the deploy wish, and
 * c.boostOn was cleared only on a flat battery or a retirement, so BOOST came back (and drained) after the stop or
 * when the VSC/SC ended, with no new press. Now a hold drops the toggle.
 *
 * #6544 item 2: Pause -> RESTART set frozen and raceRestarting, then called startRace().then(...). startRace is a
 * plain function whose sync prefix (loadingInfo, entrySettings, Assets.retry...) can throw before it returns a
 * promise; both flags then stayed true and the race was frozen for good. Now a sync throw is logged and both drop.
 *
 * Run: node --test tests/unit/boost-hold-restart-vm.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

let g = null;
before(async () => {
  g = await createGame({ track: "monza" });
  // SoakRun (LAZY_PERF) carries the `box` rollout policy that drives a real stop, loaded as drive-to-box-vm does.
  vm.runInContext(readFileSync(new URL("../../js/perf/soak-run.js", import.meta.url), "utf8"), g.ctx, { filename: absSrc("js/perf/soak-run.js") });
  vm.runInContext("SoakRun", g.ctx).create(g.G);
});
after(() => { if (g) g.close(); });

function drive() {
  const A = g.apex, G = g.G;
  A.reset(0.3, 60, 0); A.headless(true); A.go();
  A.setInput({ throttle: true, steer: 0 });
  G.player.energy = 0.8; A.setBoost(true);
  g.step(30);
  assert.ok(G.player.boostOn && G.player.deploying, "BOOST is on and deploying before the hold");
  return G.player;
}

test("a caution drops the BOOST toggle: it does not resume, or drain, when the caution ends (#6546 P4)", () => {
  const A = g.apex, G = g.G, p = drive();
  assert.ok(G.applyCaution({ level: 2, replay: true }), "VSC applied");
  g.step(30);
  assert.equal(p.boostOn, false, "the caution cleared the toggle");
  assert.ok(G.applyCaution({ level: 0, replay: true }), "caution cleared");
  const e0 = p.energy;
  g.step(120);
  assert.equal(p.boostOn, false, "no BOOST after the caution without a new press");
  assert.equal(p.deploying, false, "and no deploy");
  assert.ok(p.energy >= e0 - 1e-9, `the battery did not drain: ${e0} -> ${p.energy}`);
  A.setBoost(true); g.step(10);
  assert.ok(p.boostOn && p.deploying, "a new press deploys again");
});

test("the pit box drops the BOOST toggle: it does not resume on the way out (#6546 P4)", async () => {
  const A = g.apex, G = g.G;
  await g.race("monza", "day", "dry", { laps: 5 });   // a race long enough for pit stops (the lane is shut on a sprint)
  A.tyres({ level: "real" });   // stops are on (the lane opens with wear)
  A.headless(true); A.go(); A.jump(0.5, 40, 0);
  const r = A.rollout({ policy: "box", seconds: 120 });
  assert.equal(r && r.ran && r.ran.stoppedEarly && r.ran.stoppedEarly.reason, "policy:box", "a real stop: " + JSON.stringify(r && r.ran));
  const p = G.player;
  assert.equal(p.pitState, "box");
  p.energy = 0.8; A.setBoost(true); g.step(1);
  assert.equal(p.boostOn, false, "the box cleared the toggle");
  A.setInput({ throttle: true, steer: 0 });
  for (let i = 0; i < 1200 && p.pitState !== "none"; i++) g.step(1);
  g.step(60);
  assert.equal(p.boostOn, false, "no BOOST after the stop without a new press");
  assert.equal(p.deploying, false, "and no deploy");
});

test("Pause -> RESTART whose startRace throws synchronously leaves the race running, not frozen (#6544 item 2)", () => {
  const G = g.G, S = g.sandbox;
  g.apex.reset(0.3, 60, 0); g.apex.headless(true); g.apex.go();
  const retry = S.Assets.retry, soft = S.document.fullscreenElement, lock = S.Input.lockLandscape;
  let threw = 0;
  const boom = () => { threw++; throw new Error("sync prefix fault (test)"); };
  // Two sync-prefix calls: Assets.retry is skipped on a software raster, Input.lockLandscape needs fullscreen.
  S.Assets.retry = boom; S.document.fullscreenElement = {}; S.Input.lockLandscape = boom;
  try {
    assert.doesNotThrow(() => S.document.getElementById("pm-restart").onclick(), "the click handler swallows and logs the fault");
  } finally { S.Assets.retry = retry; S.document.fullscreenElement = soft; S.Input.lockLandscape = lock; }
  assert.equal(threw, 1, "startRace threw in its sync prefix");
  assert.equal(G.frozen, false, "the race is not left frozen");
  assert.equal(G.state, "race");
  const t0 = G.raceT; g.step(30);
  assert.ok(G.raceT > t0, "the race runs on");
});
