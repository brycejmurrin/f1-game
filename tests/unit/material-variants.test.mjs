// Draw options are a MATERIAL KEY on TLX (js/render/three/tlx.js buildMatKey:
// emissive and alpha quantised to 1/32, then roughness, metalness, specular,
// detail, clearcoat, carPaint, sparkle and the flags), and a new key is a new
// NodeMaterial — a new program, its TSL codegen, its pipeline and its first-draw
// costs. gpu-census 212 (a driven window on real Metal) counted twenty material
// misses in twenty seconds, one a second, which is the cadence of the "lags
// every few seconds" report: three draw sites fed the key a CONTINUOUS
// per-frame value — the rear light's brightness followed ERS energy, the
// exhaust flame's alpha followed the pop, the aero-bar blink was a sine on
// alpha. This pins each of them to a few fixed levels, and scans the draw
// modules for a sine or a clamp multiplied straight into an alpha or emissive.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL("../../" + p, import.meta.url), "utf8");

test("the rear light's ERS brightness is five levels, not a continuous emissive", () => {
  const game = read("js/game.js");
  assert.match(game, /drawRearLights\(tmpMat, \(wet \|\| preGrid \|\| ersCode === 1\) \? 1\.0 : \(0\.45 \+ 0\.55 \* \(Math\.round\(clamp\(c\.energy \|\| 0, 0, 1\) \* 4\) \/ 4\)\)\)/,
    "the rear-light emissive must be quantised to quarters of the battery (gpu-census 212)");
});

test("the exhaust flame's alpha is quarter steps", () => {
  const game = read("js/game.js");
  assert.match(game, /_flameOpts\.alpha = Math\.ceil\(\(0\.30 \+ 0\.55 \* fl\) \* c\.exhaustPop \* 4\) \/ 4;/,
    "the flame alpha must be quantised (a flicker minted a material per 1/32 of alpha)");
});

test("the aero-bar blink is two fixed option bags, not a sine on alpha", () => {
  const mesh = read("js/car/car-mesh.js");
  assert.match(mesh, /Math\.sin\(t \* 20\) > 0 \? _AX_FX_BLINK_HI : _AX_FX_BLINK_LO/, "the blink must switch between two constant bags");
  assert.match(mesh, /const _AX_FX_BLINK_HI = \{[^}]*alpha: 1\.0 \};/); assert.match(mesh, /const _AX_FX_BLINK_LO = \{[^}]*alpha: 0\.65 \};/);
  assert.doesNotMatch(mesh, /alpha: 0\.65 \+ 0\.35 \* Math\.sin/, "the sine alpha is back");
});

test("the brake-ring glow is five levels of disc heat, not a continuous emissive and alpha", () => {
  const draw = read("js/car/car-draw.js");
  assert.match(draw, /const hq = Math\.round\(heat \* 4\) \/ 4;\n\s+_rqEmis\[_rqN\] = 0\.30 \+ 0\.70 \* hq;\n\s+_rqAlpha\[_rqN\] = Math\.min\(1, 0\.25 \+ hq \* 0\.9\);/,
    "the ring glow must derive both key fields from one quantised heat (gpu-census 213 minted a material per 1/32 of heat at every braking zone)");
});

test("no draw module multiplies a sine or a clamp straight into an alpha or emissive option", () => {
  for (const p of ["js/game.js", "js/car/car-mesh.js", "js/car/car-draw.js"]) {
    const src = read(p).replace(/\/\/[^\n]*/g, "");
    const hits = src.match(/\b(alpha|emissive)\s*[:=]\s*[^;\n]*\*\s*(Math\.sin|clamp)\(/g) || [];
    assert.deepEqual(hits, [], p + " feeds a continuous value into a material-key field: " + hits.join(" ; "));
  }
});
