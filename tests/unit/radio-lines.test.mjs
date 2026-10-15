/* radio-lines.test.mjs — phrasebook pools and pick anti-repeat memory.
 *
 * Run: node --test tests/unit/radio-lines.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function loadRL() {
  const ctx = vm.createContext({ Math, console, Object, Array, Number, JSON, isFinite, Map, Set, String, RegExp });
  seedLog(ctx);
  vm.runInContext(readFileSync(join(ROOT, "js/race/radio-lines.js"), "utf8"), ctx, { filename: "js/race/radio-lines.js" });
  return vm.runInContext("RadioLines", ctx);
}

const RL = loadRL();

const LONG = { pos: 20, passed: "VERSTAPPEN", by: "VERSTAPPEN", n: 12, gap: "10.5", ahead: "VERSTAPPEN",
  behind: "VERSTAPPEN", rate: "0.8", laps: 12, gapA: "10.5", gapB: "10.5", time: "1:32.4", delta: "2.3",
  left: 10, grid: 20, name: "VERSTAPPEN", leader: "VERSTAPPEN", a: "VERSTAPPEN", b: "HULKENBERG",
  why: "MECHANICAL TROUBLE" };

test("every template fills every slot with longest plausible values", () => {
  for (const [key, pool] of Object.entries(RL.POOLS)) {
    for (const tpl of pool) {
      const msg = RL.fill(tpl, LONG);
      assert.ok(msg, `${key}: "${tpl}" has a slot this test does not fill`);
    }
  }
});

test("pick never repeats the same line back to back across 50 draws per pool", () => {
  const d = RL.create(42);
  for (const [key, pool] of Object.entries(RL.POOLS)) {
    if (pool.length < 2) continue;
    let prev = null;
    for (let i = 0; i < 50; i++) {
      const line = d.pick(key, LONG);
      assert.ok(line, `${key} pick ${i} returned empty with full vars`);
      assert.notEqual(line, prev, `${key}: repeated line on consecutive pick`);
      prev = line;
    }
  }
});

test("frequent pools have at least five variants", () => {
  const needFive = ["eng.status", "eng.attack", "eng.closing", "eng.manage", "eng.tyres",
    "eng.rivalPit", "tv.pass", "tv.pit"];
  for (const key of needFive) {
    const pool = RL.POOLS[key];
    assert.ok(pool && pool.length >= 5, `${key} should have 5+ variants, got ${pool ? pool.length : 0}`);
  }
});
