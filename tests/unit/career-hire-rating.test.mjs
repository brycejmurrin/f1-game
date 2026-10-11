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
import { makeDom } from "../helpers/mini-dom.mjs";
import { DOM_SOURCE } from "../helpers/seed-dom.mjs";

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
  // Drive the real MY TEAM setup screen (career-ui.js on mini-dom) with a spy on
  // DriverRatings.get: every hire tile must ask with the custom team's tier and
  // print the pace the race will use for that driver.
  const { Career, DriverRatings: DR } = load();
  const dom = makeDom({ tagFor: (id) => (/^(cr-back|cr-go|cr-garage|co-back|ch-back|cg-back)$/.test(id) ? "button" : "div") });
  const asked = [];
  const customTier = 3;                              // not 2, and not any agent's tier
  const TEAMS = [{ id: "custom", name: "My Team", short: "YOU", tier: customTier, custom: true, engine: "Custom",
    color: [1, 0, 0], color2: [0, 0, 1], stats: { speed: 70, accel: 70, cornering: 70, braking: 70 },
    drivers: [{ name: "You", code: "YOU", num: 99 }] }];
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Map, Set, Date, parseFloat, parseInt, isFinite,
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    document: dom.document, addEventListener() {}, removeEventListener() {},
    setTimeout: () => 0, clearTimeout() {},
    GameAudio: { uiTick() {}, uiSelect() {}, uiReject() {}, init() {} }, ScrollFade: { refresh() {} },
    Career, Teams: { LIST: TEAMS, POINTS: [25], isReal: (t) => !!t && !t.custom && !t.legends },
    DriverRatings: { ...DR, get: (code, tier) => { asked.push([code, tier]); return DR.get(code, tier); } },
    Parts: { CATALOG: [], getCost: () => 0 }, Tracks: { SEASON: [] },
    GameStore: { seasonDriverId: (t, i) => t + ":" + i },
    SeasonCal: { hasProgress: () => false, rounds: () => 24, load: () => null },
    Reliability: { REASONS: ["engine"], TIER_RISK: [0.02, 0.06] }, PhysicsConsts: { DIFF: { EASY: 1 } },
  };
  sb.window = sb;
  const read = (f) => readFileSync(join(ROOT, f), "utf8").replace(/^const\b/gm, "var");
  vm.runInNewContext(DOM_SOURCE, sb, { filename: "js/ui/dom.js" });
  vm.runInNewContext(read("js/career/experience.js"), sb, { filename: "js/career/experience.js" });
  vm.runInNewContext(read("js/career/career-ui.js"), sb, { filename: "js/career/career-ui.js" });
  const G = { $: (id) => dom.byId(id), els: { overlay: dom.byId("overlay") }, soundOn: false, flow: "gp", session: "race", season: null,
    store: { get: (k, d) => d, set() {} }, cssCol: () => "#fff", openCareer() {}, openGarage() {}, openRaceSettings() {},
    refreshCareerButton() {}, qualiClear() {}, armConfirm: (btn, txt, act) => { act(); return true; } };
  const ui = sb.CareerScreen.create(G);
  ui.openSlots();
  dom.byId("cr-left").querySelectorAll(".cr-slot.empty")[0].querySelector(".cr-slot-main").onclick();   // NEW CAREER form
  const flavour = dom.byId("cr-left").querySelectorAll(".cr-flavour")
    .find((b) => /MY TEAM/.test(b.querySelector(".cr-flavour-name").textContent));
  assert.ok(flavour, "the form offers MY TEAM");
  flavour.onclick();
  const agents = Career.freeAgents();
  // mini-dom keeps detached nodes queryable, so read only the last paint's tiles.
  const metas = dom.byId("cr-left").querySelectorAll(".cr-teamtile-meta").map((n) => n.textContent)
    .filter((t) => /^PACE \d+ · CRAFT \d+/.test(t)).slice(-agents.length);
  assert.equal(metas.length, agents.length, "one hire tile per free agent");
  for (const a of agents) {
    assert.ok(asked.some(([c, t]) => c === a.code && t === customTier), `${a.code}: the tile asked with the custom team's tier`);
    assert.ok(!asked.some(([c, t]) => c === a.code && t !== customTier), `${a.code}: the tile never asked with another tier`);
    const r = DR.get(a.code, 2);
    assert.ok(metas.some((m) => m.startsWith(`PACE ${r.pace} · CRAFT ${r.craft} · ${a.ask} cr`)),
      `${a.code}: the tile prints the race's pace`);
  }
});

test("HIRES stays out of BASE, so the grid statistics are about the real 22 only", () => {
  const { DriverRatings: DR } = load();
  for (const code of Object.keys(DR.HIRES)) assert.equal(DR.BASE[code], undefined, code);
});
