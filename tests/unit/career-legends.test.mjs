/* career-legends.test.mjs — the LEGENDS team is not a championship entrant.
 *
 * Teams.LIST is appended to at boot: custom-team.js splices in MY TEAM
 * (`custom: true`) and then pushes the twelve-driver LEGENDS entry
 * (`legends: true`). Both are grid furniture for one screen. Every career rule
 * that walks the field filtered on `custom` ALONE, so Legends was admitted
 * everywhere — measured before the fix, a DRIVER career started at Haas opened
 * with sixteen standings rows of which twelve were legends, its constructors
 * table read ferrari/legends/haas, and one winter wrote twelve
 * career.dev["legends:N"] keys.
 *
 * Same VM shape as career-settle.test.mjs: career.js is pure rules, so it
 * loads whole with stub GameStore / Teams / Parts. The stub roster is the real
 * one in miniature — a custom slot, two real teams, and Legends with its full
 * twelve — because the bug only appears once something is appended past the
 * real teams.
 *
 * Run: node --test tests/unit/career-legends.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";
import { seedHash32 } from "../helpers/seed-hash32.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const LEGEND_CODES = ["MSC", "SEN", "VET", "MAN", "FAN", "CLK", "LAU", "PRO", "STE", "MOS", "GHL", "HAK"];

function load() {
  const stored = new Map();
  const ctx = vm.createContext({
    Math, JSON, Object, Array, String, Number, Date, isNaN, isFinite, console,
    GameStore: {
      CAREER_V: 3,
      store: {
        get: (k, d) => (stored.has(k) ? stored.get(k) : d),
        set: (k, v) => stored.set(k, v),
      },
      seasonDriverId: (teamId, i) => teamId + ":" + i,
      migrateCareer: (c) => c,
    },
    Teams: {
      POINTS: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
      // The predicate under test, verbatim from js/data/teams.js.
      isReal: (t) => !!t && !t.custom && !t.legends,
      LIST: [
        { id: "ferrari", tier: 1, drivers: [{ name: "L", code: "LEC", num: 16 }, { name: "H", code: "HAM", num: 44 }] },
        { id: "haas", tier: 4, drivers: [{ name: "A", code: "AAA", num: 1 }, { name: "B", code: "BBB", num: 2 }] },
        // …appended at boot, in this order, by custom-team.js:
        { id: "custom", tier: 2, custom: true, drivers: [{ name: "You", code: "YOU", num: 99 }] },
        { id: "legends", tier: 0, legends: true,
          drivers: LEGEND_CODES.map((code, i) => ({ name: "Legend " + i, code, num: 100 + i })) },
      ],
    },
    Parts: { getFactorySetup: () => ({}) },
    DriverRatings: {
      get: () => ({ pace: 70, craft: 70, awareness: 70, consistency: 70, experience: 70 }),
      overall: () => 70,
    },
    Tracks: { LIST: [] },
  });
  seedLog(ctx);
  seedHash32(ctx);
  vm.runInContext(readFileSync(join(ROOT, "js/core/mat4.js"), "utf8"), ctx, { filename: "js/core/mat4.js" });
  vm.runInContext(readFileSync(join(ROOT, "js/career/career.js"), "utf8"), ctx, { filename: "js/career/career.js" });
  return vm.runInContext("Career", ctx);
}

/** A DRIVER career at a real team — the case the leak was measured in. */
function driverCareer() {
  const Career = load();
  Career.start({ flavour: "driver", teamId: "haas", seed: 7 });
  Career.engage(true);
  return Career;
}

const isLegendCode = (code) => LEGEND_CODES.includes(code);
// career.js builds its arrays inside the VM realm, so they carry the CONTEXT's
// Array.prototype — deepStrictEqual rejects that against a host [] even when
// both are empty. Copy into a host array before comparing.
const here = (xs) => Array.from(xs);

test("no legend takes a seat on the career grid", () => {
  // gridSeats() is internal; driverStandings() is one row per grid seat, which
  // is the same walk seen through the public surface.
  const rows = driverCareer().driverStandings();
  assert.ok(rows.length > 0, "the stub roster must produce a grid at all");
  assert.equal(rows.length, 4, "two real teams, two seats each — not 16 with the legends riding along");
  assert.deepEqual(here(rows.filter((r) => r.team.id === "legends")), [],
    "twelve legend seats used to ride along on every career grid");
});

test("standings count the constructors, not the guests", () => {
  const Career = driverCareer();
  const drivers = Career.driverStandings();
  const strays = drivers.filter((r) => isLegendCode(r.code) || (r.team && r.team.id === "legends")).map((r) => r.code);
  assert.deepEqual(here(strays), [], "a driver career at Haas opened with twelve legends in its own standings");

  const teams = Career.teamStandings().map((r) => r.id);
  assert.ok(!teams.includes("legends"), "the constructors table read ferrari/legends/haas");
  // MY TEAM is the same class of guest, and is admitted only when it is yours.
  assert.ok(!teams.includes("custom"), "a DRIVER career at Haas does not field MY TEAM either");
});

test("the driver market and contract offers stay inside the real grid", () => {
  const Career = driverCareer();
  const career = Career.data();
  career.season.round = 1;
  Career.rollover();
  const dev = Object.keys(career.dev || {});
  assert.deepEqual(here(dev.filter((k) => k.startsWith("legends"))), [],
    "one winter used to write career.dev['legends:0..11']");
  for (const o of career.offers || [])
    assert.notEqual(o.team, "legends", "a legend team cannot offer a drive — it has no car on the grid");
  for (const m of career.moves || [])
    assert.notEqual(m.team, "legends", "the market cannot move a driver into the Legends team");
});

test("an unknown team id falls back to MY TEAM, not to whatever booted last", () => {
  // Teams.LIST's TAIL is the last thing appended — Legends today, something
  // else tomorrow. The fallback used to be LIST[LIST.length - 1], so a
  // mis-keyed career silently inherited Legends' factory setup.
  const Career = load();
  Career.start({ flavour: "myteam", teamId: "nope", seed: 7 });
  Career.engage(true);
  const live = Career.data();
  assert.notEqual(live.teamName, "legends");
  assert.ok(!JSON.stringify(live).includes('"legends"'),
    "nothing about a fresh career should mention the legends team");
});
