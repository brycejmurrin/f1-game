// render-lighting-prep — pure-move pin: lighting-prep phase of render() lives in
// renderLightingPrep (js/game.js), called in order after sunPass. Zero behavior
// change; Lighting owns the domain. No browser. Reads via game-source helpers
// (source-pin-hygiene: no new raw js/game.js path literals under tests/).
import test from "node:test";
import assert from "node:assert/strict";
import { symbolSource } from "../helpers/game-source.mjs";

test("renderLightingPrep is a named sibling of render() and owns the lighting-prep body", () => {
  const prep = symbolSource("function renderLightingPrep(dt, hasLivePlayerShadow)");
  const render = symbolSource("function render(dt)");
  assert.match(prep, /\/\/ ── Sky animation & weather FX/, "sky/weather knobs moved into the prep phase");
  assert.match(prep, /\/\/ ── Lightning \(active rain only\)/, "lightning stays in the lighting-prep phase");
  assert.match(prep, /frame\.tune = LT;/, "frame.tune is set in lighting prep, not later in the draw path");
  assert.match(prep, /return wet;/, "wet is returned for the draw path (env probe / mirror / world)");
  assert.doesNotMatch(render, /\/\/ ── Sky animation & weather FX/,
    "render() must not still inline the sky/weather lighting-prep block");
  assert.doesNotMatch(render, /frame\.tune = LT;/,
    "render() must not still assign frame.tune — that is lighting prep");
});

test("render() calls renderLightingPrep after the sun shadow pass, same order as before the extract", () => {
  const render = symbolSource("function render(dt)");
  const sun = render.indexOf("shadowPass.sunPass(");
  const call = render.indexOf("const wet = renderLightingPrep(dt, _hasLivePlayerShadow);");
  assert.ok(sun >= 0, "sunPass still runs in render()");
  assert.ok(call > sun, "lighting prep follows sunPass (call order unchanged)");
  assert.match(render, /const wet = renderLightingPrep\(dt, _hasLivePlayerShadow\);/,
    "wet flows from the prep return into the draw path");
});
