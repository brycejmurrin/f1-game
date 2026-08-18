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
  // Env-probe face uses the same opaque → sky order as the main camera.
  assert.match(game, /frameSky\.invViewProj = _envInv;[\s\S]{0,280}?drawWorldMeshes\(frame, night, wet, _floodEmit, false\);[\s\S]{0,80}?gfx\.drawSky\(frameSky\);[\s\S]{0,40}?gfx\.envFaceEnd/);
});

test("GLX skips equal tuner-uniform re-uploads", () => {
  const glx = read("js/render/glx.js");
  assert.match(glx, /const _litUf = Object\.create\(null\), _skyUf = Object\.create\(null\)/);
  assert.match(glx, /function uf1\(loc, cache, key, v\)/);
  assert.match(glx, /uf1\(litU\.uBounceK/);
  assert.match(glx, /uf1\(skyU\.uSkyGrad/);
  const post = read("js/render/glx/post.js");
  assert.match(post, /const _compUf = Object\.create\(null\)/);
  assert.match(post, /uf1\(compU\.uContrast/);
  // Per-frame values still upload unconditionally.
  assert.match(post, /gl\.uniform1f\(compU\.uGrainTime/);
});

test("props fuse uses sealed typed accumulators", () => {
  const tracks = read("js/track/tracks.js");
  assert.match(tracks, /const out = TrackModels\.scratch\(\)/);
  assert.match(tracks, /TrackModels\.sealGeometry\(out\)/);
  const models = read("js/track/models.js");
  assert.match(models, /function makeAccum\(Type, est\)/);
  assert.match(models, /makeAccum\(Float64Array/);
  assert.match(models, /makeAccum\(Uint32Array/);
  assert.match(models, /const isNumList =/);
  assert.match(models, /BYTES_PER_ELEMENT/);
});

test("main camera cullDist contains the far-plane corners", () => {
  const game = read("js/game.js");
  assert.match(game, /const _farCull = farPlane \* Math\.hypot\(1, Math\.tan\(fovY \* 0\.5\)/);
  assert.match(game, /_fogCull \|\| _farCull/);
  assert.doesNotMatch(game, /frame\.cullDist = dbgCam[\s\S]{0,120}300/);
});

test("already-landed leftovers stay in the product path", () => {
  const game = read("js/game.js");
  assert.match(game, /Cheap reject before wrap — same pattern as pairContact/);
  assert.match(game, /Cheap reject before wrap — pairContact form/);
  const tracks = read("js/track/tracks.js");
  assert.match(tracks, /const MASS_CELL = 24/);
  assert.match(tracks, /massGridInsert/);
  const geom = read("js/track/geom.js");
  assert.match(geom, /lo\(a0\)\/lo\(a1\) once each/);
  assert.match(geom, /\(i \+ 1\) \/ seg \* 6\.2832/);
  // Angle wrap via %seg moves the last edge (6.2832 ≠ 2π). Integer %seg on
  // a ring-vertex table (addMountain) is the correct close and is allowed.
  assert.doesNotMatch(geom, /(?:a1|ring)\([^)]*%\s*seg/);
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
  assert.match(tlx, /const ENV_CULL_M = 300/);
  assert.match(tlx, /frame\.cullDist = _envSvCull > 0 \? Math\.min\(_envSvCull, ENV_CULL_M\) : ENV_CULL_M/);
  assert.match(tlx, /chunkedSys\.cull\(rec\.chunked, faceVP, faceEye, faceCull\)/);
  assert.match(tlx, /function _restoreEnvFrame\(/);
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
