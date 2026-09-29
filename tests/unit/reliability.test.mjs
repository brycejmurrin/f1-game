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
const SRC = fs.readFileSync(path.join(ROOT, "js/race/reliability.js"), "utf8");

// A deterministic [0,1) hash of (seed, ...parts): FNV-1a over the joined key.
function hash(seed, ...parts) {
  let h = 2166136261 >>> 0;
  const s = seed + "|" + parts.join("|");
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h / 4294967296;
}

function load() {
  const ctx = vm.createContext({
    Object, Array, Number, String,
    Math: Object.assign(Object.create(Math), { random: () => { throw new Error("Math.random called"); } }),
    M4: { clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)) },
    Career: { hash, TDEV_MAX: 1, TDEV_TO_PACE: 0.01, paceMult: () => 1 },
    Parts: { CATALOG: [], resolveSetup: () => ({ options: {} }) },
    Log: { info() {}, warn() {} },
  });
  vm.runInContext(SRC.replace(/^const\b/gm, "var"), ctx, { filename: "js/race/reliability.js" });
  return vm.runInContext("Reliability", ctx);
}

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
