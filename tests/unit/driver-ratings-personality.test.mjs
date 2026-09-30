/**
 * DriverRatings personality gates: decorrelation, means, overall recognisability,
 * and skill() remaining a pace product (style/craft reshuffles must not move it).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { pearson, maxCraftClusterR, correlationMatrix, columnStats } from "../../tools/lib/ai-ratings-math.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function loadDR() {
  const ctx = vm.createContext({ console, Object, Math, window: {} });
  for (const f of ["js/core/mat4.js", "js/core/hash32.js", "js/data/driver-ratings.js"]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
  }
  return vm.runInContext("DriverRatings", ctx);
}

test("authored BASE: craft/awareness/consistency pairwise |r| < 0.5", () => {
  const DR = loadDR();
  const rows = Object.entries(DR.BASE).map(([code, row]) => ({
    code, pace: row[0], craft: row[1], awareness: row[2], consistency: row[3], experience: row[4],
  }));
  const m = correlationMatrix(rows);
  assert.ok(maxCraftClusterR(m) < 0.5, JSON.stringify(m));
  const stats = columnStats(rows);
  assert.ok(Math.abs(stats.craft.mean - 82.9) <= 1.5);
  assert.ok(Math.abs(stats.awareness.mean - 80.0) <= 1.5);
  assert.ok(Math.abs(stats.consistency.mean - 81.3) <= 1.5);
});

test("skill() is pace(+consistency jitter) only — craft reshuffle does not move it", () => {
  const DR = loadDR();
  const roll = 0.5;
  const a = DR.skill({ pace: 90, craft: 60, awareness: 60, consistency: 80, experience: 50 }, roll);
  const b = DR.skill({ pace: 90, craft: 99, awareness: 99, consistency: 80, experience: 50 }, roll);
  assert.equal(a, b, "craft/awareness must not enter skill()");
  const c = DR.skill({ pace: 80, craft: 99, awareness: 99, consistency: 80, experience: 50 }, roll);
  assert.ok(c < a, "lower pace must lower skill");
});

test("overall() still ranks VER above LIN and keeps elites high", () => {
  const DR = loadDR();
  const o = (code) => DR.overall(DR.get(code));
  assert.ok(o("VER") > o("LIN"));
  assert.ok(o("HAM") > o("BOR"));
  assert.ok(o("ALO") > o("COL"));
  // Top-weight elites remain in the upper half of the grid.
  const all = Object.keys(DR.BASE).map((c) => ({ c, o: o(c) })).sort((a, b) => b.o - a.o);
  const top8 = all.slice(0, 8).map((x) => x.c);
  for (const code of ["VER", "HAM", "ALO"]) assert.ok(top8.includes(code), `${code} in top8 ${top8}`);
});
