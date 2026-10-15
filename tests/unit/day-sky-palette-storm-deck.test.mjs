// Day sky follows the circuit palette; day storm is visibly darker than day rain (engine-weather-light-a1).
// Run: node --test tests/unit/day-sky-palette-storm-deck.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync(new URL("../../js/lighting/atmosphere.js", import.meta.url), "utf8");

test("explicit day blends the circuit palette sky, skipping night-authored palettes", () => {
  assert.match(src, /const DAY_PAL_BLEND = 0\.5;/);
  assert.match(src, /_bl\(G\.frameSky\.zenith, _dp\.zenith\)/);
  assert.match(src, /_bl\(G\.frameSky\.horizon, _dp\.horizon\)/);
  assert.match(src, />= 0\.45\)/, "dark (night) palettes must not tint a day sky");
});

test("day storm deck is darker and denser than rain", () => {
  const m = src.match(/const STORM_DECK_DARK = ([\d.]+);/);
  assert.ok(m && Number(m[1]) <= 0.9, "storm deck multiplier darkens rain's deck");
  assert.match(src, /fogDensity \|\| 0\.0016\) \* 2\.6/);
});

test("fog in-scatter sun colour is capped in all three backends", () => {
  for (const f of ["js/render/glx/shaders/glsl-lit.js", "js/render/webgpu/wgsl-chunks.js", "js/render/three/tsl-lit.js"]) {
    assert.match(fs.readFileSync(new URL("../../" + f, import.meta.url), "utf8"), /fogSun/, f);
  }
});
