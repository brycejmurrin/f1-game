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
import { pearson, maxCraftClusterR, correlationMatrix, columnStats, styleZeroMean } from "../../tools/lib/ai-ratings-math.mjs";

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

// Tip pace column (instruments / ship tip 2026-09-30). skill() is pace-only, so a
// frozen pace column is the speed-product invariant for a data-only reshuffle.
const TIP_PACE = {
  VER: 96, LEC: 94, NOR: 93, PIA: 91, RUS: 90, HAM: 89, SAI: 88, ALO: 86,
  GAS: 84, ALB: 84, ANT: 84, HUL: 82, OCO: 82, HAD: 82, PER: 80, BEA: 80,
  LAW: 79, BOT: 79, COL: 78, BOR: 77, LIN: 76, STR: 74,
};

test("pace column frozen vs tip — skill() at roll 0.5 is pace-only and tip-identical", () => {
  const DR = loadDR();
  const roll = 0.5;
  for (const code of Object.keys(TIP_PACE)) {
    assert.equal(DR.BASE[code][0], TIP_PACE[code], `${code} pace`);
  }
  // At roll 0.5 the consistency jitter term is zero, so skill is a pure pace map.
  const ver = DR.skill(DR.get("VER"), roll);
  const lin = DR.skill(DR.get("LIN"), roll);
  assert.ok(ver > lin);
  assert.equal(ver, DR.skill({ pace: 96, craft: 0, awareness: 0, consistency: 0, experience: 0 }, roll));
});

test("style axes present, zero-mean, and excluded from overall/skill", () => {
  const DR = loadDR();
  assert.equal(DR.STYLE_AXES.join(","), "aggression,optimism");
  const rows = Object.entries(DR.BASE).map(([code, row]) => ({
    code, aggression: row[5], optimism: row[6],
  }));
  const style = styleZeroMean(rows, DR.STYLE_AXES);
  assert.equal(style.present, true);
  assert.equal(style.sums.aggression, 0);
  assert.equal(style.sums.optimism, 0);
  const a = DR.get("VER");
  const b = { ...a, aggression: -a.aggression, optimism: -a.optimism };
  assert.equal(DR.overall(a), DR.overall(b), "overall ignores style");
  assert.equal(DR.skill(a, 0.5), DR.skill(b, 0.5), "skill ignores style");
  assert.ok(Math.abs(DR.style01(30) - 1) < 1e-9);
  assert.ok(Math.abs(DR.style01(-30) + 1) < 1e-9);
});

// fromTier() read optimism at `h >>> 30` & 31 (2 bits), so every unrated driver
// sat at -15..-12 (~-0.45 optimistic). The style axes now come from a second hash.
test("unrated drivers' style axes are not one-sided (optimism had only 2 bits)", () => {
  const DR = loadDR();
  const codes = [];
  for (let i = 0; i < 200; i++) codes.push("U" + i.toString(36).toUpperCase() + String.fromCharCode(65 + (i * 7) % 26));
  for (const axis of ["aggression", "optimism"]) {
    const v = codes.map((c) => DR.style01(DR.get(c, 2)[axis]));
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    assert.ok(Math.abs(mean) <= 0.1, `${axis} mean ${mean.toFixed(3)} should be near zero`);
    assert.ok(v.some((x) => x > 0.2) && v.some((x) => x < -0.2), `${axis} must span both signs`);
  }
  // The five quality axes keep their exact old derivation, so only style moved.
  const a = DR.get("XYZ", 2);
  assert.deepEqual(Object.keys(a), ["pace", "craft", "awareness", "consistency", "experience", "aggression", "optimism"]);
  assert.deepEqual(DR.get("XYZ", 2), a, "stable per code");
});

test("a persisted code of constructor / __proto__ / toString is unrated, never NaN", () => {
  const DR = loadDR();
  for (const code of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
    const r = DR.get(code, 2);
    for (const k of [...DR.AXES, ...DR.STYLE_AXES]) assert.ok(Number.isFinite(r[k]), `${code}.${k} = ${r[k]}`);
    assert.deepEqual(JSON.parse(JSON.stringify(r)), JSON.parse(JSON.stringify(DR.fromTier(2, code))), `${code} falls back to fromTier`);
  }
  assert.equal(DR.get("FER2", 0).pace, 87, "a HIRES row is still found");
  assert.equal(DR.get("VER", 0).pace, 96, "a BASE row is still found");
});
