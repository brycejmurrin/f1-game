/* reliability.test.mjs — js/race/reliability.js in a VM: which cars are planned to retire.
 *
 * Reliability decides random DNFs for a whole championship and had no unit test
 * (testing-gap audit 2026-09-29): only career.spec.js reached it, over the
 * change-aware budget and on the nightly rota alone. The contract pinned here:
 * OFF plans nothing and clears stale plans; a plan is a pure function of the
 * seed (never Math.random, so a reload or a netplay peer draws the same field);
 * a weaker team tier retires more often; every planned retirement lands inside
 * the race, with a known reason.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// The REAL Career (hash, TDEV_MAX/TDEV_TO_PACE, paceMult), Hash32, M4 and the Parts catalog — a hand-copied
// hash and a CATALOG:[] stub left buildQuality, devNorm, the relief constants and the networked branch unrun.
function load() {
  const stored = new Map();
  const ctx = vm.createContext({
    Math: Object.assign(Object.create(Math), { random: () => { throw new Error("Math.random called"); } }),
    JSON, Object, Array, Number, String, Date, Set, Map, isNaN, isFinite, console,
  });
  ctx.window = ctx;
  ctx.GameStore = {
    CAREER_V: 2,
    store: { get: (k, d) => (stored.has(k) ? JSON.parse(JSON.stringify(stored.get(k))) : d),
             set: (k, v) => { stored.set(k, JSON.parse(JSON.stringify(v))); return true; } },
    seasonDriverId: (t, i) => t + ":" + i, migrateCareer: (c) => c,
  };
  const list = ["albert_park", "shanghai", "suzuka"].map((id) => ({ id, name: id }));
  ctx.Tracks = { LIST: list, SEASON: list.slice(), seasonIndex(i) { return this.LIST.indexOf(this.SEASON[i]); } };
  for (const f of ["js/core/log.js", "js/core/mat4.js", "js/core/hash32.js", "js/data/teams.js", "js/data/driver-ratings.js",
    "js/physics/consts.js", "js/car/parts.js", "js/career/save-migrate.js", "js/career/regulations.js",
    "js/career/career.js", "js/race/reliability.js"]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8").replace(/^const\b/gm, "var"), ctx, { filename: f });
  }
  const run = (code) => vm.runInContext(code, ctx);
  const R = Object.create(run("Reliability"));   // Reliability is frozen: the harness hangs its handles on a wrapper
  R.ctx = ctx; R.run = run; R.Career = run("Career"); R.Parts = run("Parts"); R.Teams = run("Teams");
  return R;
}
/** Start a driver career (so Career.paceMult reads `tdev`) and set a team's development. */
function inCareer(R, tdev) {
  R.Career.start({ flavour: "driver", teamId: "haas", seed: 9 });
  R.Career.engage(true);
  Object.assign(R.Career.data().tdev, tdev);
}
const plain = (v) => JSON.parse(JSON.stringify(v));

const field = (n, tier) => Array.from({ length: n }, (_, i) => ({ driverId: "d" + i, code: "D" + i, tier, team: { id: "t" + (i % 10) } }));

test("OFF (the shipped default) plans nothing and clears a stale plan", () => {
  const R = load();
  const cars = field(20, 4);
  cars[3].dnfAt = 0.5; cars[3].dnfWhy = "engine"; cars[4].retired = true;
  R.arm(cars, { level: "off", seed: 7, round: 1 });
  assert.equal(R.plan(cars).length, 0, "no car is planned to retire, and old plans are gone");
  assert.equal(R.isLevel("off"), true);
  assert.equal(R.isLevel("brutal"), false);
});

test("a plan is a pure function of the seed: same seed, same field; another seed, another", () => {
  const R = load();
  const a = R.plan(R.arm(field(400, 4), { level: "real", seed: 11, round: 3 }));
  const b = R.plan(R.arm(field(400, 4), { level: "real", seed: 11, round: 3 }));
  const c = R.plan(R.arm(field(400, 4), { level: "real", seed: 12, round: 3 }));
  assert.ok(a.length > 0, "a real-level field of 400 plans some retirements");
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  assert.notDeepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(c)));
});

test("a weaker tier retires more often, and LOW halves the risk", () => {
  const R = load();
  const count = (tier, level) => R.plan(R.arm(field(4000, tier), { level, seed: 5, round: 2 })).length;
  const strong = count(0, "real"), weak = count(4, "real"), low = count(4, "low");
  assert.ok(weak > strong * 1.8, `tier 4 (${weak}) retires far more than tier 0 (${strong})`);
  assert.ok(low < weak * 0.75 && low > weak * 0.3, `LOW (${low}) is about half of REAL (${weak})`);
});

test("every planned retirement lands inside the race, with a known reason", () => {
  const R = load();
  for (const p of R.plan(R.arm(field(2000, 4), { level: "real", seed: 9, round: 1 }))) {
    assert.ok(p.at >= 0.06 && p.at <= 0.94, `at ${p.at} is inside the race, not the formation lap or the flag`);
    assert.ok(R.REASONS.includes(p.why), `reason ${p.why}`);
    assert.equal(p.retired, false, "planned, not yet retired");
  }
});

test("anonymous cars (no driverId/code) still draw distinct DNF plans", () => {
  const R = load();
  const cars = Array.from({ length: 200 }, () => ({ tier: 4, team: { id: "t0" } }));
  R.arm(cars, { level: "real", seed: 2, round: 1 });
  const plan = R.plan(cars);
  assert.ok(plan.length >= 5, "a real-level anon field still plans some retirements");
  assert.ok(new Set(plan.map((p) => p.at)).size > 1,
    "index fallback keeps plans from collapsing onto one at=");
});

const countPlanned = (R, cars, opts) => R.plan(R.arm(cars, Object.assign({ level: "real", seed: 5, round: 2 }, opts))).length;
const same = (n, over) => Array.from({ length: n }, (_, i) => Object.assign({ driverId: "d" + i, code: "D" + i, tier: 4, team: { id: "haas" } }, over));

test("team development buys risk back: a developed team retires less, a neglected one more, and OFF career means no relief", () => {
  const R = load();
  const n = 6000;
  const outside = countPlanned(R, same(n), {});              // no career: Career.paceMult() is 1
  inCareer(R, { haas: R.Career.TDEV_MAX });
  const developed = countPlanned(R, same(n), {});
  R.Career.data().tdev.haas = -R.Career.TDEV_MAX;
  const neglected = countPlanned(R, same(n), {});
  assert.ok(developed < outside * 0.75, `full development (${developed}) cuts about 40% off the baseline (${outside})`);
  assert.ok(developed > outside * 0.45, `…but never to immortality (${developed} vs ${outside})`);
  assert.ok(neglected > outside * 1.25, `a neglected team (${neglected}) retires more than baseline (${outside})`);
});

test("buildQuality scores the fitted engine and gearbox by cost: dearest = 1, cheapest below it, absent = 0", () => {
  const R = load();
  const team = R.Teams.LIST.find((t) => t.id === "haas");
  const pick = (best) => {
    const setup = {};
    for (const cat of R.Parts.CATALOG) {
      if (cat.id !== "engine" && cat.id !== "gearbox") continue;
      const sorted = cat.options.slice().sort((a, b) => (a.cost || 0) - (b.cost || 0));
      setup[cat.id] = (best ? sorted[sorted.length - 1] : sorted[0]).id;
    }
    return setup;
  };
  assert.ok(R.Parts.CATALOG.some((c) => c.id === "engine") && R.Parts.CATALOG.some((c) => c.id === "gearbox"), "the real catalog has the two scored categories");
  assert.equal(R.buildQuality(null, team), 0);
  const top = R.buildQuality(pick(true), team), bottom = R.buildQuality(pick(false), team);
  assert.ok(top > 0.99, `dearest build scores ~1 (${top})`);
  assert.ok(bottom >= 0 && bottom < top, `cheapest build (${bottom}) scores below the dearest (${top})`);
});

test("the player's developed engine and gearbox cut their DNF risk ~a third — offline only, never networked", () => {
  const R = load();
  const n = 6000;
  const me = () => same(n, { isPlayer: true });
  const none = countPlanned(R, me(), { build: 0 });
  const built = countPlanned(R, me(), { build: 1 });
  const net = countPlanned(R, me(), { build: 1, networked: true });
  const ai = countPlanned(R, same(n), { build: 1 });         // AI cars never take the build relief
  assert.ok(built < none * 0.8 && built > none * 0.55, `build 1 (${built}) is about 33% under build 0 (${none})`);
  assert.equal(net, none, "a networked race ignores the build relief so peers agree");
  assert.equal(ai, none, "only the player's car is relieved");
});

test("a tier outside 0..4 clamps to the nearest tier instead of indexing past TIER_RISK", () => {
  const R = load();
  const plans = (tier) => plain(R.plan(R.arm(same(500, { tier }), { level: "real", seed: 3, round: 1 })));
  assert.deepEqual(plans(99), plans(R.TIER_RISK.length - 1), "tier 99 plans like the weakest tier");
  assert.deepEqual(plans(-3), plans(0), "tier -3 plans like the strongest tier");
  assert.ok(plans(99).length > 0);
});
