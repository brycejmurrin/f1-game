/* career-planning.test.mjs — pure hub projections: next-round cash ceiling and
 * factory savings that exclude the next era's ban list (open-era legality is
 * null, so Parts.isOptionAvailable alone cannot drop future inventory).
 *
 * Run: node --test tests/unit/career-planning.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

function bootPlanning({ flavour = "myteam", money = 1000, facility = 0, owned = [], seasonsElapsed = 0, teamId = "haas" } = {}) {
  const ctx = vm.createContext({ Math, console, Object, Array, Number, JSON, Map, Set, String, isFinite });
  seedLog(ctx);
  ctx.window = ctx;
  for (const f of [
    "js/core/mat4.js", "js/physics/consts.js", "js/data/teams.js",
    "js/car/parts.js", "js/career/regulations.js", "js/career/career-planning.js",
  ]) {
    vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  }
  const career = {
    flavour, money, facility, owned, fitted: {}, year: 2026, team: teamId,
    season: { round: 0 }, roster: [],
  };
  const PRIZE = [900, 700, 560, 460, 380, 320, 270, 230, 200, 170];
  ctx.Career = {
    RESEARCH_MULT: 3,
    FACILITY_MAX: 8,
    FACILITY_DISCOUNT_MAX: 0.4,
  };
  const api = {
    facility: () => career.facility,
    facilityCost: () => 3000,
    freeMoney: () => false,
    prizeFor: (pos) => (pos < 1 ? 0 : pos <= PRIZE.length ? PRIZE[pos - 1] : 80),
    seasonsElapsed: () => seasonsElapsed,
    blocked: () => false,
    objectiveLocked: () => false,
    seasonDone: () => false,
    saveStatus: () => ({ ok: true }),
    sponsor: () => null,
    SPONSOR_KINDS: [],
    rnd: () => 0,
    sponsorLabel: () => "",
  };
  const CareerPlanning = vm.runInContext("CareerPlanning", ctx);
  const planning = CareerPlanning.create({
    data: () => career,
    api: () => api,
    raw: () => JSON.stringify(career),
    blocked: () => false,
    protection: () => null,
    revision: () => 1,
    armed: () => 1,
    save: () => {},
    adopt: () => false,
  });
  return {
    planning,
    career,
    Parts: vm.runInContext("Parts", ctx),
    Regulations: vm.runInContext("Regulations", ctx),
    Teams: vm.runInContext("Teams", ctx),
    prizeFor: api.prizeFor,
  };
}

test("MY TEAM cash().high is P1+P2, not prizeFor(1)*2", () => {
  const { planning, prizeFor } = bootPlanning({ flavour: "myteam", money: 1000 });
  const cash = planning.cash(0);
  assert.equal(cash.high, 1000 + prizeFor(1) + prizeFor(2),
    "two cars cannot both finish P1; ceiling is 900+700");
  assert.notEqual(cash.high, 1000 + prizeFor(1) * 2);
});

test("driver cash().high stays a single prizeFor(1)", () => {
  const { planning, prizeFor } = bootPlanning({ flavour: "driver", money: 500 });
  assert.equal(planning.cash(0).high, 500 + prizeFor(1));
});

test("factory() skips the next era's banned ids while the open era is live", () => {
  const { planning, Parts, Regulations, Teams, career } = bootPlanning({
    flavour: "driver", seasonsElapsed: 0, teamId: "haas",
  });
  Parts.setLegality(null, "open");
  const team = Teams.LIST.find((t) => t.id === career.team);
  const next = Regulations.eraFor(0 + Regulations.seasonsLeft(0));
  assert.equal(next.id, "powertrain");
  const banned = Regulations.bannedIds(next.id);
  assert.ok(banned.size > 0);

  let naive = 0, expected = 0;
  for (const cat of Parts.CATALOG) for (const opt of cat.options) {
    if (!opt.cost || (career.owned || []).includes(opt.id)) continue;
    if (Parts.isOptionAvailable && !Parts.isOptionAvailable(opt, team)) continue;
    naive++;
    if (!banned.has(opt.id)) expected++;
  }
  assert.ok(naive > expected, "open-era naive count still includes next-era bans");

  const quote = planning.factory();
  assert.equal(quote.count, expected, "factory count excludes next-era bans");
  assert.ok(quote.count < naive);
});
