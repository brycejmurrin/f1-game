/* perf-try.test.mjs — baked renderer gates; no pause-menu toggles.

   The four PerfTry pause SETTINGS switches (skyLate, flareGate, envCull,
   lampFogGate) shipped default-ON. They were renderer A/B flags, not lighting
   knobs, so they were baked as the product path and the PERF tab was removed
   rather than moved into the lighting tuner.

   This file keeps its name so the 109-suite count does not churn. It now
   freezes: no PerfTry module / no PERF tab; late sky is unconditional;
   env-probe radial cull is 300 m without a toggle; GLSL/WGSL/TSL keep only
   the gated (ON) path.

   Run: node --test tests/unit/perf-try.test.mjs
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("PerfTry module and the PERF tab are gone", () => {
  assert.equal(fs.existsSync(path.join(ROOT, "js/game/perf-try.js")), false);
  const html = read("index.html");
  assert.doesNotMatch(html, /pm-tab-performance|pm-panel-performance|perf-try\.js/);
  assert.doesNotMatch(read("tools/manifest.cjs"), /js\/game\/perf-try\.js/);
  assert.doesNotMatch(read("js/game/settings-nav.js"), /"performance"/);
  assert.doesNotMatch(read("js/game/lighting.js"), /skyLate|flareGate|envCull|lampFogGate/);
});

test("late sky is the only world draw order", () => {
  const game = read("js/game.js");
  assert.doesNotMatch(game, /_skyLate|PerfTry/);
  assert.match(game, /drawWorldMeshes\(frame, night, wet, _floodEmit, false\)/);
  assert.match(game, /gfx\.drawSky\(frameSky\)/);
  assert.match(game, /if \(frame\.lights && !_studioRig\) gfx\.drawGlow\(frame\.lights, LT\.glareStr\)/);
});

test("env-probe radial cull is 300 m without a toggle", () => {
  const game = read("js/game.js");
  assert.match(game, /chunkRibbons:\s*PerfGov\.tier\(\) < 3/);
  assert.match(game, /if \(PerfGov\.tier\(\) < 3\)/);
  assert.match(game, /\|\| \(PerfGov\.tier\(\) < 3\)/);

  const glx = read("js/render/glx.js");
  assert.match(glx, /const ENV_CULL_M = 300/);
  assert.match(glx, /frame\.cullDist = _envSvCull > 0 \? Math\.min\(_envSvCull, ENV_CULL_M\) : ENV_CULL_M/);
  assert.doesNotMatch(glx, /typeof PerfTry|PerfTry\.(on|defines|withWgslConsts)/);

  const wgx = read("js/render/webgpu/wgx.js");
  assert.match(wgx, /frame\.cullDist = svCull > 0 \? Math\.min\(svCull, 300\) : 300/);
  assert.doesNotMatch(wgx, /_perfWgsl|typeof PerfTry|PerfTry\.(on|defines|withWgslConsts)/);

  const tlx = read("js/render/three/tlx.js");
  assert.match(tlx, /_envCullM = _envSvCull > 0 \? Math\.min\(_envSvCull, 300\) : 300/);
  assert.match(tlx, /chunkedSys\.cull\(rec\.chunked, faceVP, _envEye, _envCullM\)/);
  assert.match(tlx, /function _restoreEnvCull\(/);
  assert.doesNotMatch(tlx, /typeof PerfTry|PerfTry\.(on|defines|withWgslConsts)/);
});

test("GLSL / WGSL / TSL keep only the gated ON path", () => {
  const post = read("js/render/shaders/post.js");
  const lit = read("js/render/shaders/lit.js");
  assert.doesNotMatch(post, /#ifdef OPT_FLAREGATE|#else/);
  assert.match(post, /float sunVis = \(uFlareStr > 0\.0 && uSunUV\.x >= 0\.0/);
  assert.doesNotMatch(lit, /#ifdef OPT_LAMPFOGGATE/);
  assert.match(lit, /if \(uLampFog > 0\.0\)/);

  const chunks = read("js/render/webgpu/wgsl-chunks.js");
  const wgslPost = read("js/render/webgpu/wgsl-post.js");
  assert.doesNotMatch(chunks, /OPT_LAMPFOGGATE/);
  assert.match(chunks, /if \(F\.params8\.x > 0\.0\)/);
  assert.doesNotMatch(wgslPost, /OPT_FLAREGATE/);
  assert.match(wgslPost, /flareStr > 0\.0 && sunUV\.x >= 0\.0/);

  const tslLit = read("js/render/three/tsl-lit.js");
  const tslPost = read("js/render/three/tsl-post.js");
  assert.match(tslLit, /If\(U\.lampFog\.greaterThan\(0\.0\)/);
  assert.doesNotMatch(tslLit, /lampFogGate|PerfTry/);
  assert.match(tslPost, /If\(C\.flareStr\.greaterThan\(0\.0\)/);
  assert.doesNotMatch(tslPost, /flareGate|PerfTry/);
});

test("SETTINGS still has GRAPHICS: HIGH and three category tabs", () => {
  const html = read("index.html");
  assert.match(html, /GRAPHICS: HIGH/);
  assert.doesNotMatch(html, /GRAPHICS: STANDARD/);
  assert.match(html, /id="pm-tab-controls"/);
  assert.match(html, /id="pm-tab-display"/);
  assert.match(html, /id="pm-tab-more"/);
  assert.match(read("css/components.css"), /repeat\(3, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(read("css/components.css"), /repeat\(4, minmax\(0, 1fr\)\)/);
});
