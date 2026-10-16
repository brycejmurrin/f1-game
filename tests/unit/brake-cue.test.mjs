// BrakeCue math: pulse RATE is the signal; the function never returns a brake
// command. urgencyOf is pure so this file does not boot the game.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const src = fs.readFileSync(path.join(ROOT, "js/physics/brake-cue.js"), "utf8")
  .replace(/^const\b/gm, "var");
const ctx = {
  window: {},
  performance: { now: () => 0 },
  M4: { clamp: (v, a, b) => (v < a ? a : v > b ? b : v) },
};
vm.runInNewContext(src, ctx);
const { BrakeCue } = ctx;
assert.ok(BrakeCue && BrakeCue.urgencyOf, "BrakeCue IIFE must assign the global");

const LAT = 22, BRAKE = 22;

test("slider 1 is OFF; 6 is CUE with mid lookahead", () => {
  assert.equal(BrakeCue.fromSlider(1).on, false);
  assert.equal(BrakeCue.fromSlider(6).on, true);
  assert.ok(BrakeCue.fromSlider(6).lookSec > 1 && BrakeCue.fromSlider(6).lookSec < 2);
  assert.equal(BrakeCue.labelOf(1), "OFF");
  assert.match(BrakeCue.labelOf(6), /^CUE 6$/);
});

test("a corner you can already take is silent", () => {
  // 30 m/s into a 200 m radius (~66 m/s apex) — no brake needed.
  const u = BrakeCue.urgencyOf(30, 1 / 200, 80, 0, LAT, BRAKE);
  assert.equal(u, 0);
});

test("too fast for the apex raises urgency, and braking already done cuts it", () => {
  const k = 1 / 40;                 // 40 m radius, vCorner ≈ 29.7
  const coast = BrakeCue.urgencyOf(50, k, 60, 0, LAT, BRAKE);
  const braking = BrakeCue.urgencyOf(50, k, 60, -18, LAT, BRAKE);
  assert.ok(coast > 0.3, "flat-out into a slow corner must tick");
  assert.ok(braking < coast, "being on the anchors must quiet the cue");
});

test("urgency is never a brake command — output is 0..1 only", () => {
  const u = BrakeCue.urgencyOf(70, 0.04, 40, 0, LAT, BRAKE);
  assert.ok(u >= 0 && u <= 1);
});
