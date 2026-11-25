/* drive-to-box-vm.test.mjs — the bridge's `drive` law (SoakRun.policy, js/perf/soak-run.js) in the REAL game, headless
 * (tools/lib/game-vm.cjs). The phone bridge's END TIME TRIAL check needs the car in its box with no human: `box`
 * drives from mid-lap round to the pit entry, down the entry road and the lane at the limiter, and stops square in
 * this car's own box, through the setInput seam only. Run as the named policy of __apex.rollout, exactly what a
 * `{"cmd":"call","args":{"method":"rollout","args":[{"policy":"box"}]}}` does.
 *
 * SoakRun is LAZY_PERF (the bridge loads it with the perf rig), so the VM loads it here the way LazyBundles does.
 *
 * Run: node --test tests/unit/drive-to-box-vm.test.mjs
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");
const SOAK = readFileSync(new URL("../../js/perf/soak-run.js", import.meta.url), "utf8");

const games = [];
after(() => { for (const g of games) g.close(); });
async function boot(id) {
  const g = await createGame({ track: id });
  games.push(g);
  vm.runInContext(SOAK, g.ctx, { filename: absSrc("js/perf/soak-run.js") });
  vm.runInContext("SoakRun", g.ctx).create(g.G);
  return g;
}

function boxed(g, label) {
  const a = g.apex, G = g.G;
  G.player.x = 0;
  const r = a.rollout({ policy: "box", seconds: 120 });
  assert.ok(r && r.ran, label + ": rollout ran: " + JSON.stringify(r).slice(0, 300));
  assert.equal(r.ran.policy, "box (named) at 60 Hz");
  assert.equal(r.ran.stoppedEarly && r.ran.stoppedEarly.reason, "policy:box", label + ": stopped in the box: " + JSON.stringify(r.ran));
  assert.equal(G.player.pitState, "box", label);
  assert.equal(G.pits.canWork(G.player), true, label + ": the pit actions are offered");
  assert.equal(G._testInput, null, label + ": the rollout hands the input back");
  assert.ok(r.wallContacts <= 1, label + ": drove it, did not bounce it in (" + r.wallContacts + " wall contacts)");
  return r;
}

test("Monza TIME TRIAL: from mid-lap into the box, and END TIME TRIAL shows", async () => {
  const g = await boot("monza");
  const a = g.apex, G = g.G;
  assert.ok(a.tt("monza", "day"));
  assert.ok(await g.settle(() => G.timeTrial && G.track && G.player));
  a.go(); a.jump(0.5, 40, 0);
  boxed(g, "monza tt");
  G.refreshHud(true);
  assert.equal(g.sandbox.document.getElementById("hud-end-session").hidden, false, "END TIME TRIAL is on screen");
});

test("Bahrain RACE with the field running: the same policy boxes", async () => {
  const g = await boot("bahrain");
  const a = g.apex;
  await g.race("bahrain", "day", "dry", { laps: 5 });
  a.tyres({ level: "real" });
  a.go(); a.jump(0.5, 40, 0);
  boxed(g, "bahrain race");
});

test("autopilot laps on the soak law; names are checked; a function policy still works", async () => {
  const g = await boot("spa");
  const a = g.apex, G = g.G;
  await g.race("spa", "day", "dry", { laps: 3 });
  a.go(); a.jump(0.3, 40, 0);
  const r = a.rollout({ policy: "autopilot", seconds: 20 });
  assert.ok(r.distanceM > 400, "it drives: " + r.distanceM + " m in 20 s");
  assert.ok(r.offTrack.pct < 5, "on the road: " + r.offTrack.pct + "% off");
  assert.equal(G._testInput, null);
  const bad = a.rollout({ policy: "teleport" });
  assert.equal(bad.ok, false);
  assert.equal(bad.error, "BadArgumentError");
  assert.ok(a.rollout({ policy: () => ({ steer: 0, throttle: true }), seconds: 1 }).ran, "function policies are unchanged");
});

test("a box drive let go short of the box calls its stop off: no limiter waits at the next pit line", async () => {
  const g = await boot("monza");
  const a = g.apex, G = g.G;
  assert.ok(a.tt("monza", "day"));
  assert.ok(await g.settle(() => G.timeTrial && G.track && G.player));
  a.go(); a.jump(0.2, 40, 0);
  const r = a.rollout({ policy: "box", seconds: 3 });
  assert.equal(r.ran.stoppedEarly, null, "still on the lap after 3 s");
  assert.equal(G.player.pitArmed, false, "the stop it armed is disarmed on the way out");
  assert.equal(G._testInput, null);
});
