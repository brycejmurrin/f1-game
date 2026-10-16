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
  const works = Parts.getFactorySetup(team);
  Parts.setLegality(Regulations.legalityFor(era.id), era.id);
  const career = { year: 2030, aiParts: {} };
  const tStand = [{ id: "ferrari", pos: 1 }];
  const expect = new Map([["ferrari", 8]]);
  CareerAiDev.developWinter(career, tStand, expect, () => 0);
  const fitted = CareerAiDev.fittedOf(career, team);
  if (!fitted) return; // no step found under the ban — fine
  const banned = Regulations.bannedIds(era.id);
  // The bag is seeded with the WORKS build (a banned works part stays owned and
  // resolves to its fallback at race time); the STEP itself is never banned,
  // and nothing banned survives resolution.
  for (const [cat, id] of Object.entries(fitted)) {
    if (id !== works[cat]) assert.equal(banned.has(id), false, `banned ${id} must not be bought`);
  }
  for (const id of Object.values(Parts.resolveSetup(fitted, team).setup)) {
    assert.equal(banned.has(id), false, `banned ${id} must not resolve`);
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

test("scrubFitted fits the best legal OWNED part over a banned one, shelves it, and restores it after the era", () => {
  const { CareerAiDev, Teams, Parts, Regulations } = boot();
  const team = Teams.LIST.find((t) => t.id === "ferrari");
  const era = Regulations.ERAS.find((e) => e.id === "powertrain");
  const factory = Parts.getFactorySetup(team);
  const banned = Regulations.bannedIds(era.id);
  let bannedId = null, catId = null;
  for (const cat of Parts.CATALOG) {
    if (banned.has(factory[cat.id])) continue;       // a category whose works part stays legal
    for (const opt of cat.options) {
      if (banned.has(opt.id) && Parts.isOptionAvailable(opt, team)) { bannedId = opt.id; catId = cat.id; break; }
    }
    if (bannedId) break;
  }
  assert.ok(bannedId, "the powertrain era bans an upgrade in a category where Ferrari's works part stays legal");
  const career = { aiParts: { ferrari: { owned: Object.values(factory).concat(bannedId), fitted: Object.assign({}, factory, { [catId]: bannedId }) } } };
  Parts.setLegality(Regulations.legalityFor(era.id), era.id);
  CareerAiDev.scrubFitted(career);
  const bag = career.aiParts.ferrari;
  assert.equal(bag.fitted[catId], factory[catId], "the owned legal works part replaces the banned upgrade");
  assert.equal(bag.shelved[catId], bannedId, "the banned upgrade is shelved, not lost");
  assert.ok(bag.owned.includes(bannedId), "the banned upgrade stays owned");
  Parts.setLegality(Regulations.legalityFor("aero"), "aero");
  CareerAiDev.scrubFitted(career);
  assert.equal(bag.fitted[catId], bannedId, "the upgrade returns the winter its era lapses");
  assert.equal(bag.shelved, undefined);
  Parts.setLegality(null, "");
});

test("a works part banned by an era is the works part again once the era lapses", () => {
  const { CareerAiDev, Teams, Parts, Regulations } = boot();
  const team = Teams.LIST.find((t) => t.id === "ferrari");
  const works = Parts.getFactorySetup(team);
  const engine = works.engine;
  assert.ok(Regulations.bannedIds("powertrain").has(engine), `the powertrain era bans Ferrari's works engine ${engine}`);
  const career = { year: 2026, aiParts: {} };
  const tStand = [{ id: "ferrari", pos: 1 }];
  const expect = new Map([["ferrari", 8]]);
  const winter = (eraId, year) => {
    Parts.setLegality(Regulations.legalityFor(eraId), eraId);
    CareerAiDev.scrubFitted(career);
    CareerAiDev.developWinter(career, tStand, expect, () => 0, year);
  };
  winter("open", 2026);                       // a bag exists before the era
  assert.equal(career.aiParts.ferrari.fitted.engine, engine);
  for (let y = 2027; y <= 2030; y++) winter("powertrain", y);   // four winters under the ban
  const bag = career.aiParts.ferrari;
  assert.ok(bag.owned.includes(engine), "the works engine is never dropped from owned");
  assert.notEqual(Parts.resolveSetup(bag.fitted, team).setup.engine, engine, "the ban is enforced at resolution");
  winter("aero", 2031);                       // the era lapses
  assert.equal(bag.fitted.engine, engine, "after the era the fitted engine is the works engine again");
  assert.equal(Parts.resolveSetup(bag.fitted, team).setup.engine, engine);
  Parts.setLegality(null, "");
});

test("ensureSeed under an era seeds the works build and leaves the ruleset installed", () => {
  const { CareerAiDev, Teams, Parts, Regulations } = boot();
  const team = Teams.LIST.find((t) => t.id === "ferrari");
  const works = Parts.getFactorySetup(team);
  const legal = Regulations.legalityFor("powertrain");
  Parts.setLegality(legal, "powertrain");
  assert.notEqual(Parts.getFactorySetup(team).engine, works.engine, "the era-resolved factory drops the works engine");
  assert.deepEqual({ ...CareerAiDev.worksSetup(team) }, { ...works });
  assert.equal(Parts.legalityKey(), "powertrain");
  assert.equal(Parts.legality(), legal, "the exact predicate is put back");
  const career = { year: 2030, aiParts: {} };
  CareerAiDev.developWinter(career, [{ id: "ferrari", pos: 1 }], new Map([["ferrari", 8]]), () => 0);
  const bag = career.aiParts.ferrari;
  assert.ok(bag && bag.owned.includes(works.engine), "a bag first seeded under the era still owns the works engine");
  Parts.setLegality(null, "");
});

test("scrubFitted is a no-op without a ban or a shelf, and heals a pre-fix scar", () => {
  const { CareerAiDev, Teams, Parts } = boot();
  const team = Teams.LIST.find((t) => t.id === "ferrari");
  const works = Parts.getFactorySetup(team);
  const career = { aiParts: { ferrari: { owned: Object.values(works), fitted: { ...works } } } };
  const before = JSON.stringify(career);
  CareerAiDev.scrubFitted(career);
  assert.equal(JSON.stringify(career), before, "no era, nothing shelved: byte-identical");
  // A save scrubbed by the old code: works engine spliced out of owned, the
  // DEFAULT fitted in its place.
  const scarred = { aiParts: { ferrari: { owned: Object.values(works).filter((id) => id !== works.engine),
    fitted: { ...works, engine: Parts.DEFAULTS.engine } } } };
  CareerAiDev.scrubFitted(scarred);
  assert.equal(scarred.aiParts.ferrari.fitted.engine, works.engine);
  assert.ok(scarred.aiParts.ferrari.owned.includes(works.engine));
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
