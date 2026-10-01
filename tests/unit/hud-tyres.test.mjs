/* hud-tyres — cold/ok/hot bands + four-corner projection from axle model. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/ui/hud-tyres.js"), "utf8");

function load() {
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(SRC + "; this.HudTyres = HudTyres;", ctx);
  return ctx.HudTyres;
}

test("band: cold below window, hot above, ok inside", () => {
  const H = load();
  assert.equal(H.band(70, 90, 15), "cold");
  assert.equal(H.band(90, 90, 15), "ok");
  assert.equal(H.band(105, 90, 15), "hot");
});

test("corners: four ids; lateral load warms the outer side", () => {
  const H = load();
  const info = { tempS: 90, tempOpt: 90, tempWindow: 15, wearF: 0.2, wearR: 0.4 };
  const right = H.corners(info, 1);
  assert.equal(right.length, 4);
  assert.equal(right[0].id, "fl");
  assert.equal(right[1].id, "fr");
  assert.equal(right[2].id, "rl");
  assert.equal(right[3].id, "rr");
  assert.ok(right[1].temp >= right[0].temp, "FR warmer than FL under +lat");
  assert.ok(right[3].temp >= right[2].temp, "RR warmer than RL under +lat");
  const left = H.corners(info, -1);
  assert.ok(left[0].temp >= left[1].temp, "FL warmer than FR under -lat");
});

test("tempDelta rounds °C from the window centre", () => {
  const H = load();
  assert.equal(H.tempDelta({ tempS: 98.4, tempOpt: 90 }), 8);
  assert.equal(H.tempDelta({ tempS: 82, tempOpt: 90 }), -8);
  assert.equal(H.tempDelta(null), null);
});

test("module has no Tracks / curvature / kCur reads", () => {
  assert.doesNotMatch(SRC, /\bTracks\b/);
  assert.doesNotMatch(SRC, /\bcurvature\b/);
  assert.doesNotMatch(SRC, /\bkCur\b/);
});
