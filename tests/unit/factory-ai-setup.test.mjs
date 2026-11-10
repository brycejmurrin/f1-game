/* Factory aero/ERS must differ across teams — AI now reads these instead of
   sitting at the 0.5 midpoint. Run: node --test tests/unit/factory-ai-setup.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { createRequire } from "node:module";
import { seedLog } from "../helpers/seed-log.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function load() {
  const ctx = vm.createContext({ Math, console, Object, Array, Number, isFinite });
  seedLog(ctx);
  for (const f of ["js/core/mat4.js", "js/data/teams.js", "js/car/parts.js"]) {
    vm.runInContext(readFileSync(join(ROOT, f), "utf8"), ctx, { filename: absSrc(f) });
  }
  return {
    Teams: vm.runInContext("Teams", ctx),
    Parts: vm.runInContext("Parts", ctx),
  };
}

const { Teams, Parts } = load();

test("factory aeroLoad and ersDeploy spread across the grid", () => {
  const byId = Object.fromEntries(Teams.LIST.map((t) => [t.id, t]));
  const aero = (id) => Parts.aeroLoad(Parts.getFactorySetup(byId[id]), byId[id]);
  const ers = (id) => Parts.ersProfile(Parts.getFactorySetup(byId[id]), byId[id]).deploy;
  assert.ok(aero("mclaren") > aero("williams") + 0.05,
    `McLaren flex ${aero("mclaren")} should out-wing Williams low-drag ${aero("williams")}`);
  assert.ok(aero("redbull") > aero("haas"),
    `RB ground-effect ${aero("redbull")} vs Haas low ${aero("haas")}`);
  const deploys = Teams.LIST.map((t) => ers(t.id));
  assert.ok(Math.max(...deploys) - Math.min(...deploys) > 0.05,
    "ERS deploy should not be identical across works cars");
  // A SPREAD, not two ordered pairs: most of the grid sits on its own number.
  const aeros = Teams.LIST.map((t) => aero(t.id));
  const distinct = (xs) => new Set(xs.map((x) => x.toFixed(4))).size;
  assert.ok(distinct(aeros) >= 6, `factory aeroLoad takes ${distinct(aeros)} distinct values over ${aeros.length} teams`);
  assert.ok(distinct(deploys) >= 6, `factory ersDeploy takes ${distinct(deploys)} distinct values over ${deploys.length} teams`);
  assert.ok(Math.max(...aeros) - Math.min(...aeros) > 0.5, "aeroLoad spans low-drag to max-downforce");
});

// THE AI HALF of the header's claim, executed: the real makeCars (game VM)
// hands each AI car its OWN team's factory aeroLoad / ersDeploy / ersRegen, so
// the field is not parked at the 0.5 midpoint and AiDrive.lateralScale reads a
// different number per team.
test("AI cars race on their team's factory aeroLoad and ERS, not a shared midpoint", async () => {
  const { createGame } = createRequire(import.meta.url)("../../tools/lib/game-vm.cjs");
  const g = await createGame({ track: "monza" });
  try {
    await g.race("monza", "day", "dry");
    const P = g.sandbox.Parts, player = g.G.player;
    const ai = g.G.cars.filter((c) => c !== player && c.team && !c.team.custom);
    assert.ok(ai.length >= 18, `a full AI field (${ai.length})`);
    for (const c of ai) {
      const setup = P.getFactorySetup(c.team), ersP = P.ersProfile(setup, c.team);
      assert.equal(c.aeroLoad, P.aeroLoad(setup, c.team), `${c.team.id}: AI aeroLoad is its factory value`);
      assert.equal(c.ersDeploy, ersP.deploy, `${c.team.id}: AI ersDeploy is its factory value`);
      assert.equal(c.ersRegen, ersP.regen, `${c.team.id}: AI ersRegen is its factory value`);
    }
    const aeroSet = new Set(ai.map((c) => c.aeroLoad.toFixed(4)));
    assert.ok(aeroSet.size >= 6, `the AI field carries ${aeroSet.size} distinct aeroLoads`);
    assert.ok(!ai.every((c) => c.aeroLoad === 0.5), "the AI field is not parked at the 0.5 midpoint");
  } finally { g.close(); }
});
