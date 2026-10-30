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
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function loadRL() {
  const ctx = vm.createContext({ Math, console, Object, Array, Number, JSON, isFinite, Map, Set, String, RegExp });
  seedLog(ctx);
  vm.runInContext(readFileSync(join(ROOT, "js/race/radio-lines.js"), "utf8"), ctx, { filename: absSrc("js/race/radio-lines.js") });
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

test("a gap that rounds to ten is '10', never '10.0'", () => {
  // 9.96.toFixed(1) is "10.0". The recorded pack has "9.9" and "10", not "10.0",
  // so a gap that sits just under 10 s (a matched car, a whole stint) made every
  // line that named it silent. Same rounding the announcer already refuses.
  assert.equal(RL.gapText(9.94), "9.9");
  assert.equal(RL.gapText(9.96), "10");
  assert.equal(RL.gapText(9.99), "10");
  assert.equal(RL.gapText(10), "10");
  assert.equal(RL.gapText(10.4), "10");
  assert.equal(RL.gapText(1.234), "1.2");
});

test("a peeked pick counts as heard only once committed (refused cards must not burn variants)", () => {
  const rl = RL.create(7);
  const key = "eng.status";
  const vars = { pos: 3, gapA: "1.2", gapB: "0.8" };
  const seen = new Set();
  for (let i = 0; i < 12; i++) { seen.add(rl.pick(key, vars, true)); }   // refused every time: nothing remembered
  assert.ok(seen.size > 1, "uncommitted peeks vary freely");
  const first = rl.pick(key, vars, true);
  rl.commit();
  for (let i = 0; i < 20; i++) {
    const again = rl.pick(key, vars, true);
    assert.notEqual(again, first, "the committed line is in the anti-repeat window");
  }
});
