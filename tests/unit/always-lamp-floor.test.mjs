// always-lamp-floor — day lampLevel 0 must not crush always-on tunnel lamps.
//
// frame-lights.js applies max(scale, alwaysLampFloor) only when srcSet is the
// always-on baked list (game.js hasAlwaysLamps path). Street masts use the main
// set without srcSet and stay at lampLevel 0.
//
// Run: node --test tests/unit/always-lamp-floor.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function load(lt) {
  const ctx = {
    performance: { now: () => 1000 },
    Math, Float32Array, Uint32Array, Array, Object,
    LightKnobs: { LT: { lampWarmup: 0, lampFlicker: 0, ...lt } },
    PerfGov: { tier: () => 0 },
  };
  vm.createContext(ctx);
  vm.runInContext(read("js/render/shared/light-budget.js") + "\n;globalThis.LightBudget = LightBudget;", ctx);
  vm.runInContext(read("js/lighting/frame-lights.js") + "\n;globalThis.FrameLights = FrameLights;", ctx);
  return ctx.FrameLights;
}

const oneLamp = [0, 8, 0, 2, 1.8, 1.4, 24, 0, -1, 0, -1, 0, 0, 0, 1];

test("always-on srcSet uses alwaysLampFloor when lampLevel is 0", () => {
  const FL = load({ lampLevel: 0, alwaysLampFloor: 0.13 });
  const always = oneLamp.slice();
  const track = { _lights: always, _alwaysLights: always };
  const frame = {};
  FL.setFrameLights(frame, track, [], [0, 1.2, 0], 0, [0, 0, 1], 0, always);
  assert.equal(frame.lights[3], 2 * 0.13);
  assert.equal(frame.lights[4], 1.8 * 0.13);
});

test("main lamp set ignores alwaysLampFloor at day lampLevel 0", () => {
  const FL = load({ lampLevel: 0, alwaysLampFloor: 0.13 });
  const track = { _lights: oneLamp.slice() };
  const frame = {};
  FL.setFrameLights(frame, track, [], [0, 1.2, 0], 0, [0, 0, 1], 0);
  assert.equal(frame.lights[3], 0);
});

test("night always-on keeps lampLevel when above floor", () => {
  const FL = load({ lampLevel: 0.26, alwaysLampFloor: 0 });
  const always = oneLamp.slice();
  const track = { _lights: always, _alwaysLights: always };
  const frame = {};
  FL.setFrameLights(frame, track, [], [0, 1.2, 0], 0.26, [0, 0, 1], 0, always);
  assert.equal(frame.lights[3], 2 * 0.26);
});
