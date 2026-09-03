/* Factory aero/ERS must differ across teams — AI now reads these instead of
   sitting at the 0.5 midpoint. Run: node --test tests/unit/factory-ai-setup.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function load() {
  const ctx = vm.createContext({ Math, console, Object, Array, Number, isFinite });
  seedLog(ctx);
  for (const f of ["js/core/mat4.js", "js/data/teams.js", "js/car/parts.js"]) {
    vm.runInContext(readFileSync(join(ROOT, f), "utf8"), ctx, { filename: f });
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
});

test("makeCars assigns factory aero/ERS to AI, not null", () => {
  const src = readFileSync(join(ROOT, "js/game.js"), "utf8");
  assert.match(src, /aeroLoad: \(isP \|\| mate\) \? Parts\.aeroLoad/);
  assert.match(src, /Parts\.aeroLoad\(factoryParts\.setup, team\)/);
  assert.match(src, /houseStats: Career\.teamStats\(team\)/);
  assert.doesNotMatch(src, /aeroLoad: isP \? Parts\.aeroLoad\([^)]+\): null/);
});
