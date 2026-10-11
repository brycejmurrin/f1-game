/* career-hire-rating.test.mjs — the MY TEAM hire tile promises the driver that races.
 *
 * The tile used to ask DriverRatings.get(code, agent.tier) while the race asks
 * with the TEAM's tier (driverSkill in js/game.js; a custom team is tier 2).
 * The free agents had no authored row, so get() fell back to fromTier(), which
 * depends on that tier: six of eight tiles were wrong and the cheapest hires
 * raced like the dearest. Authored HIRES rows answer the same whatever tier.
 *
 * Run: node --test tests/unit/career-hire-rating.test.mjs   (npm run test:tooling-fast)
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

function load() {
  const ctx = vm.createContext({
    Math, JSON, Object, Array, String, Number, Date, isNaN, isFinite, console,
    GameStore: { CAREER_V: 1, store: { get: (k, d) => d, set() {} },
      seasonDriverId: (t, i) => t + ":" + i, migrateCareer: (c) => c },
    Teams: { POINTS: [25], isReal: (t) => !!t && !t.custom, LIST: [] },
    Parts: { getFactorySetup: () => ({}) },
    Tracks: { LIST: [], SEASON: [] },
  });
  seedLog(ctx);
  seedHash32(ctx);
  for (const f of ["js/core/mat4.js", "js/data/driver-ratings.js", "js/career/career.js"])
    vm.runInContext(readFileSync(join(ROOT, f), "utf8"), ctx, { filename: f });
  return vm.runInContext("({ Career, DriverRatings })", ctx);
}

test("every free agent rates the same whatever tier asks (tile tier == race tier)", () => {
  const { Career, DriverRatings: DR } = load();
  const agents = Career.freeAgents();
  assert.equal(agents.length, 8);
  for (const a of agents) {
    const race = DR.get(a.code, 2);                 // a custom team is tier 2
    for (const tier of [0, 1, 2, 3, 4]) {
      assert.deepEqual(JSON.parse(JSON.stringify(DR.get(a.code, tier))), JSON.parse(JSON.stringify(race)),
        `${a.code} rates differently when asked with tier ${tier}`);
    }
    assert.equal(DR.get(a.code, a.tier).pace, race.pace, `${a.code}: the tile's pace is the race's pace`);
    assert.ok(DR.HIRES[a.code], `${a.code} has an authored row, not the tier fallback`);
  }
});

test("a dearer free agent never rates lower: overall is non-decreasing in ask", () => {
  const { Career, DriverRatings: DR } = load();
  const byAsk = Career.freeAgents().slice().sort((a, b) => a.ask - b.ask);
  let prev = -Infinity;
  for (const a of byAsk) {
    const o = DR.overall(DR.get(a.code, 2));
    assert.ok(o >= prev, `${a.code} (ask ${a.ask}) overall ${o} is below a cheaper agent's ${prev}`);
    prev = o;
  }
});

test("the tile asks the way the race asks: with the custom team's tier, not the agent's", () => {
  const src = readFileSync(join(ROOT, "js/career/career-ui.js"), "utf8");
  assert.ok(!/DriverRatings\.get\(a\.code, a\.tier\)/.test(src), "the tile must not pass the agent's own tier");
  assert.match(src, /DriverRatings\.get\(a\.code, custom \? custom\.tier : 2\)/);
});

test("HIRES stays out of BASE, so the grid statistics are about the real 22 only", () => {
  const { DriverRatings: DR } = load();
  for (const code of Object.keys(DR.HIRES)) assert.equal(DR.BASE[code], undefined, code);
});
