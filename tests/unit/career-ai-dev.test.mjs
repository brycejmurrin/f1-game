/* career-ai-dev.test.mjs — AI constructors develop catalog parts over winters.
 *
 * Pins the cure for CAREER-CEILING-FIX §1's "AI cars never leave their factory
 * build": one legal step per developing team, era-safe, absent bag ≡ factory.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

function boot() {
  const ctx = vm.createContext({ Math, console, Object, Array, Number, JSON, Map, Set, isFinite, String });
  seedLog(ctx);
  ctx.window = ctx;
  for (const f of [
    "js/core/mat4.js", "js/physics/consts.js", "js/data/teams.js", "js/car/parts.js",
    "js/career/regulations.js", "js/career/ai-dev.js",
  ]) {
    vm.runInContext(read(f), ctx, { filename: f });
  }
  // budgetCap stand-in: sum of dearest legal options minus one (mirrors Career).
  let cap = 2105;
  ctx.Career = {
    budgetCap: () => cap,
    setCap: (n) => { cap = n; },
  };
  // VM `const` bindings are not own-properties of the context object — extract
  // the same way factory-ai-setup / engineer harnesses do.
  return {
    CareerAiDev: vm.runInContext("CareerAiDev", ctx),
    Teams: vm.runInContext("Teams", ctx),
    Parts: vm.runInContext("Parts", ctx),
    Regulations: vm.runInContext("Regulations", ctx),
    Career: ctx.Career,
  };
}

test("absent aiParts leaves fittedOf null (factory path)", () => {
  const { CareerAiDev } = boot();
  assert.equal(CareerAiDev.fittedOf({ aiParts: {} }, { id: "mercedes" }), null);
  assert.equal(CareerAiDev.fittedOf({}, { id: "mercedes" }), null);
});

test("developWinter writes one legal fitted step for a developing team", () => {
  const { CareerAiDev, Teams, Parts } = boot();
  const career = { year: 2027, aiParts: {} };
  const mercedes = Teams.LIST.find((t) => t.id === "mercedes");
  assert.ok(mercedes);
  const factory = Parts.getFactorySetup(mercedes);
  const tStand = Teams.LIST.filter((t) => Teams.isReal(t)).map((t, i) => ({ id: t.id, pos: i + 1 }));
  // Force mercedes to develop: expected P5, finished P1 → high chance; rnd always 0.
  const expect = new Map([["mercedes", 5]]);
  const rnd = () => 0;
  CareerAiDev.developWinter(career, tStand, expect, rnd);
  const fitted = CareerAiDev.fittedOf(career, mercedes);
  assert.ok(fitted, "mercedes should have a fitted bag after a forced winter");
  assert.notDeepEqual(fitted, factory, "at least one category should leave the factory row");
  // Every fitted id must still resolve legally.
  const resolved = Parts.resolveSetup(fitted, mercedes);
  for (const cat of Parts.CATALOG) {
    const opt = Parts.CATALOG.find((c) => c.id === cat.id).options
      .find((o) => o.id === resolved.setup[cat.id]);
    assert.ok(Parts.isOptionAvailable(opt, mercedes), `${opt.id} must stay legal`);
  }
});

test("an era ban prevents fitting a banned option", () => {
  const { CareerAiDev, Teams, Parts, Regulations } = boot();
  const team = Teams.LIST.find((t) => t.id === "ferrari");
  const era = Regulations.ERAS.find((e) => e.id === "powertrain");
  Parts.setLegality(Regulations.legalityFor(era.id), era.id);
  const career = { year: 2030, aiParts: {} };
  const tStand = [{ id: "ferrari", pos: 1 }];
  const expect = new Map([["ferrari", 8]]);
  CareerAiDev.developWinter(career, tStand, expect, () => 0);
  const fitted = CareerAiDev.fittedOf(career, team);
  if (!fitted) return; // no step found under the ban — fine
  const banned = Regulations.bannedIds(era.id);
  for (const id of Object.values(fitted)) {
    assert.equal(banned.has(id), false, `banned ${id} must not be fitted`);
  }
  Parts.setLegality(null, "");
});

test("pickStep never exceeds the team cap", () => {
  const { CareerAiDev, Teams, Parts, Career } = boot();
  Career.setCap(800);
  const team = Teams.LIST.find((t) => t.id === "haas");
  const fitted = Object.assign({}, Parts.getFactorySetup(team));
  const cap = CareerAiDev.teamCap(team, {});
  assert.ok(cap <= 800);
  const step = CareerAiDev.pickStep(team, fitted, cap);
  if (step) assert.ok(Parts.getCost(step.trial, team) <= cap);
});

test("scrubFitted replaces a banned fitted id with the factory row", () => {
  const { CareerAiDev, Teams, Parts, Regulations } = boot();
  const team = Teams.LIST.find((t) => t.id === "ferrari");
  const era = Regulations.ERAS.find((e) => e.id === "powertrain");
  const factory = Parts.getFactorySetup(team);
  const banned = Regulations.bannedIds(era.id);
  let bannedId = null, catId = null;
  for (const cat of Parts.CATALOG) {
    for (const opt of cat.options) {
      if (banned.has(opt.id) && opt.id !== factory[cat.id]) { bannedId = opt.id; catId = cat.id; break; }
    }
    if (bannedId) break;
  }
  assert.ok(bannedId, "the powertrain era bans something other than Ferrari's factory row");
  const career = { aiParts: { ferrari: { owned: [bannedId, factory[catId]], fitted: Object.assign({}, factory, { [catId]: bannedId }) } } };
  Parts.setLegality(Regulations.legalityFor(era.id), era.id);
  const legalFactory = Parts.getFactorySetup(team);
  CareerAiDev.scrubFitted(career);
  assert.notEqual(legalFactory[catId], bannedId);
  assert.equal(career.aiParts.ferrari.fitted[catId], legalFactory[catId]);
  assert.equal(career.aiParts.ferrari.owned.indexOf(bannedId), -1);
  Parts.setLegality(null, "");
});

test("developWinter rolls the dice on diceYear, not career.year", () => {
  const { CareerAiDev, Teams } = boot();
  const career = { year: 2031, aiParts: {} };
  const seen = [];
  const rnd = (y, tag) => { seen.push([y, tag]); return 1; };
  const tStand = Teams.LIST.filter((t) => Teams.isReal(t)).map((t, i) => ({ id: t.id, pos: i + 1 }));
  CareerAiDev.developWinter(career, tStand, new Map(), rnd, 2026);
  assert.ok(seen.length > 0);
  assert.ok(seen.every((s) => s[0] === 2026 && s[1] === "aidev"));
});

test("rollover develops after applyRegs and keeps the dice on the year that ended", () => {
  const src = read("js/career/career.js");
  const teams = src.slice(src.indexOf("function rolloverTeams"), src.indexOf("function aiSetup"));
  assert.doesNotMatch(teams, /developWinter/, "a winter step before the era flip can be banned on the next line");
  const roll = src.slice(src.indexOf("function rollover("), src.indexOf("function rollover(") + 12000);
  const regs = roll.indexOf("applyRegs()");
  const dev = roll.indexOf("CareerAiDev.developWinter");
  const scrub = roll.indexOf("CareerAiDev.scrubFitted");
  assert.ok(regs > 0 && scrub > regs && dev > scrub, "scrub, then develop, both after the new ruleset");
  assert.match(roll, /developWinter\(career, tStand, devExpect, rnd, devYear\)/);
});
