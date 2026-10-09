/* hud-gap-decimals — standard HUD profile gap spelling near the 2026 Overtake
 * unlock (~1.0 s). Hundredths must stay visible so 0.94 vs 1.04 is readable;
 * larger gaps / lap-down stay compact; chip, REL and the shared helper agree.
 *
 * Run: node --test tests/unit/hud-gap-decimals.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");
const SRC = read("js/ui/hud-readouts.js");

function load() {
  const ctx = { console, Math, Number };
  vm.createContext(ctx);
  vm.runInContext(SRC + "; this.HudReadouts = HudReadouts;", ctx);
  return ctx.HudReadouts;
}

test("standard profile: a 0.94 s gap renders with two decimals (Overtake threshold)", () => {
  const R = load();
  assert.equal(R.gapDecimals("standard", 0.94), 2);
  assert.equal(R.fmtGapSec(0.94, "standard"), "0.94");
  assert.equal(R.fmtGap(0.94, true, "standard"), "-0.94");
  assert.equal(R.fmtGap(0.94, false, "standard"), "+0.94");
});

test("under ~10 s every profile uses two decimals; larger gaps stay compact", () => {
  const R = load();
  for (const p of ["standard", "minimal", "broadcast"]) {
    assert.equal(R.fmtGapSec(1.04, p), "1.04", p);
    assert.equal(R.fmtGapSec(9.94, p), "9.94", p);
  }
  // Standard / minimal: one decimal from ~10 s (same width band as 9.94).
  assert.equal(R.fmtGapSec(10.4, "standard"), "10.4");
  assert.equal(R.fmtGapSec(12.6, "minimal"), "12.6");
  // Broadcast keeps hundredths at any magnitude (TV-style).
  assert.equal(R.fmtGapSec(12.6, "broadcast"), "12.60");
  // Chip keeps raw seconds (no 99+); REL/tower signed form caps at 99+.
  assert.equal(R.fmtGapSec(120.4, "standard"), "120.4");
  assert.equal(R.fmtGap(250, true, "standard"), "-99+");
  assert.equal(R.fmtGap(NaN, false, "standard"), "+--");
});

test("fmtGapSec length is stable under 10 s (tabular / no chip wobble)", () => {
  const R = load();
  const a = R.fmtGapSec(0.94, "standard");
  const b = R.fmtGapSec(9.99, "standard");
  assert.equal(a.length, b.length, `${a} vs ${b}`);
  assert.equal(a.length, R.fmtGapSec(1.00, "standard").length);
  // Crossing ~10 s keeps the same character count on standard (10.4 vs 9.94).
  assert.equal(R.fmtGapSec(10.4, "standard").length, R.fmtGapSec(9.94, "standard").length);
});

test("REL and the WATCH tower spell a gap exactly like the chip (one rule, no 1-dp copy)", () => {
  const R = load();
  const rel = read("js/ui/hud-relative.js"), bc = read("js/race/broadcast.js");
  assert.match(rel, /HudReadouts\.fmtGap\(/, "REL delegates to HudReadouts.fmtGap");
  assert.match(bc, /HudReadouts\.fmtGapSec\(/, "the tower delegates to HudReadouts.fmtGapSec");
  assert.doesNotMatch(bc, /"\+" \+ v\.toFixed\(1\)/);
  const tower = vm.createContext({ console, Math, Number, HudReadouts: R });
  const fn = bc.match(/function fmtGap\(r, mode\) \{[\s\S]*?\n  \}\n/);
  assert.ok(fn, "broadcast.js fmtGap(r, mode) found");
  vm.runInContext(fn[0] + "; this.fmtGap = fmtGap;", tower);
  const row = (gap) => ({ gap, interval: gap, pos: 2, down: 0 });
  assert.equal(tower.fmtGap(row(0.94), "gap"), "+" + R.fmtGapSec(0.94));
  assert.equal(tower.fmtGap(row(0.94), "gap"), "+0.94");
  assert.equal(tower.fmtGap(row(12.6), "gap"), "+12.6");
});

test("hud.js gapSec routes through HudReadouts (no private 1-dp ternary)", () => {
  const src = read("js/ui/hud.js");
  assert.match(src, /function gapDecimals\(/);
  assert.match(src, /_ro\.fmtGapSec|_ro\.gapDecimals|HudReadouts\.fmtGapSec|HudReadouts\.gapDecimals/);
  assert.doesNotMatch(src, /=== "broadcast" \? 2 : 1/);
});
