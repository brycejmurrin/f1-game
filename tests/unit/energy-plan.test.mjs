/* EnergyPlan (js/race/energy-plan.js, #1580): the manual per-sector ERS
 * policy. Pure policy rows, then the game VM: a neutral plan leaves a race
 * byte-identical, DEPLOY switches BOOST on as the car enters its sector, SAVE
 * switches it off, and time trial ignores the plan. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/race/energy-plan.js"), "utf8");
function load() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(SRC + "; this.EnergyPlan = EnergyPlan;", ctx, { filename: absSrc("js/race/energy-plan.js") });
  return ctx.EnergyPlan;
}

test("the shipped plan is MANUAL ×3, and a bad plan is refused without changing it", () => {
  const P = load();
  assert.deepEqual([...P.plan()], ["manual", "manual", "manual"]);
  assert.equal(P.isNeutral(), true);
  for (const bad of [null, "deploy", ["deploy"], ["deploy", "save", "boost"], ["manual", "manual", "manual", "manual"]])
    assert.equal(P.setPlan(bad), false, JSON.stringify(bad));
  assert.deepEqual([...P.plan()], ["manual", "manual", "manual"]);
  assert.equal(P.setPlan(["deploy", "manual", "save"]), true);
  assert.deepEqual([...P.plan()], ["deploy", "manual", "save"]);
  assert.deepEqual([...P.fromStore({ get: () => "junk" })], ["manual", "manual", "manual"], "a corrupt stored plan falls back to neutral");
  assert.deepEqual([...P.fromStore({ get: (k) => (k === P.KEY ? ["save", "save", "deploy"] : null) })], ["save", "save", "deploy"]);
});

test("policy per sector: DEPLOY wants BOOST on (with charge), SAVE wants it off, MANUAL never acts", () => {
  const P = load();
  assert.equal(P.wantsFlip("deploy", false, 0.5), true);
  assert.equal(P.wantsFlip("deploy", true, 0.5), false, "already on");
  assert.equal(P.wantsFlip("deploy", false, 0), false, "a flat battery cannot deploy");
  assert.equal(P.wantsFlip("save", true, 0.5), true);
  assert.equal(P.wantsFlip("save", false, 0.5), false);
  for (const on of [true, false]) assert.equal(P.wantsFlip("manual", on, 0.5), false);
});

test("toggleFor acts once per sector entry, per car, and never in time trial", () => {
  const P = load();
  P.setPlan(["deploy", "manual", "save"]);
  const c = { _secIdx: 0, boostOn: false, energy: 0.8 };
  assert.equal(P.toggleFor(c, false), true, "entering S1 with DEPLOY flips BOOST on");
  c.boostOn = true;
  c.boostOn = false;   // the player pressed BOOST off mid-sector…
  assert.equal(P.toggleFor(c, false), false, "…and the plan does not fight it until the next entry");
  c._secIdx = 1; assert.equal(P.toggleFor(c, false), false, "MANUAL sector");
  c.boostOn = true; c._secIdx = 2; assert.equal(P.toggleFor(c, false), true, "SAVE flips it off");
  const tt = { _secIdx: 0, boostOn: false, energy: 1 };
  assert.equal(P.toggleFor(tt, true), false, "time trial ignores the plan");
  assert.equal(P.toggleFor({ _secIdx: null, boostOn: false, energy: 1 }, false), false, "no sector yet");
});

test("VM: a neutral plan is byte-identical; DEPLOY in every sector turns BOOST on in the race", async () => {
  const { createGame } = createRequire(import.meta.url)("../../tools/lib/game-vm.cjs");
  const run = async (plan) => {
    const g = await createGame({ track: "monza" });
    await g.race("monza", "day", "dry");
    if (plan) assert.equal(g.apex.ersPlan(plan).ok, true);
    g.apex.setInput({ throttle: true });
    let boosted = 0;
    for (let i = 0; i < 30; i++) { g.step(20); if (g.G.player.boostOn) boosted++; }
    const ps = g.apex.physState();
    return { boosted, speed: ps.speed, s: g.G.player.s, energy: g.G.player.energy };
  };
  const base = await run(null);
  const neutral = await run(["manual", "manual", "manual"]);
  assert.deepEqual(neutral, base, "MANUAL ×3 changes nothing");
  assert.equal(base.boosted, 0, "nobody pressed BOOST");
  const deploy = await run(["deploy", "deploy", "deploy"]);
  assert.ok(deploy.boosted > 0, "DEPLOY switched BOOST on at a sector entry");
  assert.ok(deploy.energy < base.energy, `and it spent charge (${deploy.energy} < ${base.energy})`);
});
