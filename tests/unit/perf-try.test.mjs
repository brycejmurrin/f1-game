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
  assert.match(game, /if \(frame\.lights && !_studioRig && PerfGov\.tier\(\) < 3\) gfx\.drawGlow\(frame\.lights, LT\.glareStr\)/);
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
  assert.match(read("css/components.css"), /\.balanced-row\s*>\s*:not\(\[hidden\]\)/);
  assert.doesNotMatch(read("css/components.css"), /repeat\(4, minmax\(0, 1fr\)\)/);
});

test("sun GGX and clearcoat skip backfaces on all three backends", () => {
  // specCol is * litNoL (= NoL * …); ccCol is * NoLg. A backface paid two
  // GGX evals for 0. Same shape as the lamp NoLl gate already in the tree.
  console.log("[perf-try] checking backface skip: GLX lit.js");
  const lit = read("js/render/shaders/lit.js");
  assert.match(lit, /if \(NoL > 0\.0\) \{\s*float D = D_GGX/);
  assert.match(lit, /float NoLg = max\(dot\(Ngeo, L\), 0\.0\);[\s\S]{0,240}?if \(NoLg > 0\.0\)/);

  console.log("[perf-try] checking backface skip: WGX wgsl-chunks.js");
  const chunks = read("js/render/webgpu/wgsl-chunks.js");
  assert.match(chunks, /if \(NoL > 0\.0\) \{\s*let Dg = D_GGX/);
  assert.match(chunks, /let NoLg = max\(dot\(Ngeo, L\), 0\.0\);[\s\S]{0,200}?if \(NoLg > 0\.0\)/);

  console.log("[perf-try] checking backface skip: TLX tsl-lit.js");
  const tsl = read("js/render/three/tsl-lit.js");
  assert.match(tsl, /If\(NoL\.greaterThan\(0\.0\), \(\) => \{/);
  assert.match(tsl, /If\(NoLg\.greaterThan\(0\.0\), \(\) => \{/);
  console.log("[perf-try] backface skip: all three backends OK");
});

test("composite skips dummy SSAO / bloom / godray fetches", () => {
  console.log("[perf-try] checking composite fetch gates: GLX post.js");
  const post = read("js/render/shaders/post.js");
  assert.match(post, /uniform float uHaveGodray/);
  assert.match(post, /float aoV = 1\.0;\s*if \(uAOTexel\.x > 0\.0\)/);
  assert.doesNotMatch(post, /else aoV = texture\(uSSAO/);
  assert.match(post, /if \(uHaveGodray > 0\.5\) c \+= texture\(uGodray/);
  assert.match(post, /if \(uBloomAmt > 0\.001\) \{\s*bloomSample = texture\(uBloom/);
  assert.match(post, /if \(uSunShaft > 0\.0 && uBloomAmt > 0\.001\)/);

  console.log("[perf-try] checking composite fetch gates: glx/post.js");
  const glxPost = read("js/render/glx/post.js");
  assert.match(glxPost, /uf1\(compU\.uHaveGodray, "haveGodray", haveGR \? 1 : 0\)/);
  assert.match(glxPost, /const needDepth = haveAO \|\| haveGRPre \|\| ssrOn \|\| flareMaybe/);
  assert.match(glxPost, /needDepth \? \(gl\.COLOR_BUFFER_BIT \| gl\.DEPTH_BUFFER_BIT\) : gl\.COLOR_BUFFER_BIT/);
  // Omitted carReflect is the 0.05 default — must count as ssrOn.
  assert.match(glxPost, /const _carReflPre = opts && opts\.carReflect != null \? opts\.carReflect/);
  assert.match(glxPost, /const ssrOn = \(\(opts && opts\.reflect\) > 0\.001\) \|\| _carReflPre > 0\.001/);

  console.log("[perf-try] checking composite fetch gates: wgsl-post.js");
  const wgsl = read("js/render/webgpu/wgsl-post.js");
  assert.match(wgsl, /fn ssaoViewPosFromD\(/);
  assert.match(wgsl, /let P = ssaoViewPosFromD\(in\.uv, dCentre\)/);
  assert.match(wgsl, /if \(bloomAmt > 0\.001\) \{\s*bloomSample = textureSampleLevel\(bloomTex/);
  assert.match(wgsl, /if \(U\.lift\.w > 0\.5\) \{\s*c = c \+ textureSampleLevel\(godrayTex/);

  console.log("[perf-try] checking composite fetch gates: wgx.js");
  const wgx = read("js/render/webgpu/wgx.js");
  assert.match(wgx, /const _needDepth = _haveAOEarly \|\| _haveGREarly \|\| _ssrEarly \|\| _flareEarly/);
  assert.match(wgx, /if \(_needDepth && _passSamples > 1 && pDepthResolve/);
  assert.match(wgx, /const _carReflEarly = o\.carReflect != null \? o\.carReflect/);
  assert.match(wgx, /_wetEarly > 0\.01 && _ssrStrEarly > 0\.001\) \|\| _carReflEarly > 0\.001/);
  // Skipped SSAO / bloom / godray no longer pay a dummy clear.
  // lift.w is haveGR — COMPOSITE skips the fetch when 0.
  assert.doesNotMatch(wgx, /_clearTarget\(godrayView/);
  assert.doesNotMatch(wgx, /_clearTarget\(ssaoView/);
  assert.doesNotMatch(wgx, /_clearTarget\(bloomLv/);

  console.log("[perf-try] checking composite fetch gates: tsl-post.js / tlx-post.js");
  const tslPost = read("js/render/three/tsl-post.js");
  assert.match(tslPost, /haveGodray: uniform\(0\)/);
  assert.match(tslPost, /If\(C\.haveGodray\.greaterThan\(0\.5\)/);
  assert.match(tslPost, /If\(C\.bloomAmt\.greaterThan\(0\.001\)/);
  assert.match(tslPost, /If\(C\.sunShaft\.greaterThan\(0\.0\)\.and\(C\.bloomAmt\.greaterThan\(0\.001\)\)/);
  assert.match(read("js/render/three/tlx-post.js"), /C\.haveGodray\.value = haveGR \? 1 : 0/);
  console.log("[perf-try] composite fetch gates: all backends OK");
});

test("SSAO reconstructs the centre from one depth sample", () => {
  console.log("[perf-try] checking SSAO single-depth-sample reconstruction");
  const post = read("js/render/shaders/post.js");
  assert.match(post, /vec3 viewPosD\(vec2 uv, float d\)/);
  assert.match(post, /vec3 P = viewPosD\(vUV, d\);/);
  // The 1-arg wrapper stays for contact-shadow sample sites (no overload in ES 3.00).
  assert.match(post, /vec3 viewPos\(vec2 uv\) \{ return viewPosD\(uv, texture\(uDepth, uv\)\.r\); \}/);

  console.log("[perf-try] checking SSAO single-depth-sample: wgsl-post.js");
  const wgsl = read("js/render/webgpu/wgsl-post.js");
  assert.match(wgsl, /let dCentre = ssaoDepth\(in\.uv\);\s*let P = ssaoViewPosFromD\(in\.uv, dCentre\)/);

  console.log("[perf-try] checking SSAO single-depth-sample: tsl-post.js");
  const tsl = read("js/render/three/tsl-post.js");
  assert.match(tsl, /const ssaoViewPosFromD = \(uvGl, d\) =>/);
  assert.match(tsl, /const P0 = vec3\(ssaoViewPosFromD\(vUV, d\)\)\.toVar\(\)/);
  console.log("[perf-try] SSAO single-depth-sample: all backends OK");
});

test("AI cars outside an 8 m frustum sphere are not drawn", () => {
  console.log("[perf-try] checking AI car 8 m frustum cull: game.js");
  const game = read("js/game.js");
  assert.match(game, /const _carCullPlanes = \(gfx\.makeFrustumPlanes && frame\.viewProj\)/);
  assert.match(game, /gfx\.makeFrustumPlanes\(frame\.viewProj, _pbPlanes\)/);
  assert.match(game, /const x = tmpP\[0\], y = tmpP\[1\], z = tmpP\[2\], r = 8;/);
  assert.match(game, /if \(p\[0\] \* x \+ p\[1\] \* y \+ p\[2\] \* z \+ p\[3\] < -r\)/);
  // Shadow enqueue MUST precede the side-frustum continue — a rival just
  // off the chase FOV still casts into the ±42 m car map.
  assert.match(game, /_shadowCount\+\+;\s*\/\/ Side frustum[\s\S]*?if \(!c\.isPlayer && _carCullPlanes\) \{[\s\S]*?if \(_out\) continue;/);
  // Behind / near-eye stays above banking and still skips the shadow list.
  assert.match(game, /if \(dx \* _camFwdX \+ dz \* _camFwdZ < -6\) continue;[\s\S]{0,160}?if \(dx \* dx \+ dy \* dy \+ dz \* dz < 3\.4 \* 3\.4\) continue;/);
  assert.doesNotMatch(game, /if \(dx \* dx \+ dy \* dy \+ dz \* dz < 3\.4 \* 3\.4\) continue;[\s\S]{0,200}?_carCullPlanes/);

  console.log("[perf-try] checking AI car 8 m frustum cull: glx.js + tlx.js");
  const glx = read("js/render/glx.js");
  assert.match(glx, /makeFrustumPlanes: \(viewProj, out\) => CHK\.makeFrustumPlanes\(viewProj, out\)/);
  const tlx = read("js/render/three/tlx.js");
  assert.match(tlx, /makeFrustumPlanes\(viewProj, out\) \{\s*return TLXShaders\.makeFrustumPlanes\(viewProj, out\);/);
  console.log("[perf-try] AI car frustum cull: OK");
});

test("fog stack skips pow/exp when density and mist are off", () => {
  // fd==0 → f==0 → mix is identity. Setup preview / carview / tuner-zero
  // used to still pay two sunAmt pows + tint + exp. Mist keeps its own
  // gate so a density-0 + mist-on tuner frame still tints.
  console.log("[perf-try] checking fog gate: lit.js");
  const lit = read("js/render/shaders/lit.js");
  assert.match(lit, /if \(uFogDensity > 0\.0 \|\| uGroundMist > 0\.001\)/);
  assert.match(lit, /if \(uFogDensity > 0\.0\) \{\s*float heightAtten/);
  assert.match(lit, /if \(uFogDensity > 0\.0\) \{[\s\S]*?pow\(sunAmt, 4\.0\)[\s\S]*?pow\(sunAmt, 16\.0\)/);

  console.log("[perf-try] checking fog gate: wgsl-chunks.js");
  const chunks = read("js/render/webgpu/wgsl-chunks.js");
  assert.match(chunks, /if \(fogDensity > 0\.0 \|\| mistK > 0\.001\)/);
  assert.match(chunks, /if \(fogDensity > 0\.0\) \{[\s\S]*?pow\(sunAmt, 4\.0\)/);

  console.log("[perf-try] checking fog gate: tsl-lit.js");
  const tsl = read("js/render/three/tsl-lit.js");
  assert.match(tsl, /If\(U\.fogDensity\.greaterThan\(0\.0\)\.or\(U\.groundMist\.greaterThan\(0\.001\)\)/);
  assert.match(tsl, /If\(U\.fogDensity\.greaterThan\(0\.0\), \(\) => \{/);
  console.log("[perf-try] fog gate: all backends OK");
});

test("window sun flash skips pow(_,22) when wet or the knobs are off", () => {
  // Term is * (1-wetSheen)*uWindowSunFlash*uKeyMul. Wet road forces
  // envBlend high then multiplies the flash by 0.
  console.log("[perf-try] checking window sun flash gate: lit.js");
  const lit = read("js/render/shaders/lit.js");
  assert.match(lit, /if \(\(1\.0 - wetSheen\) \* uWindowSunFlash \* uKeyMul > 0\.001\) \{/);
  assert.match(lit, /if \(\(1\.0 - wetSheen\) \* uWindowSunFlash \* uKeyMul > 0\.001\) \{[\s\S]{0,240}?pow\(max\(envSunAlign, 1e-4\), 22\.0\)/);

  console.log("[perf-try] checking window sun flash gate: wgsl-chunks.js");
  const chunks = read("js/render/webgpu/wgsl-chunks.js");
  assert.match(chunks, /if \(\(1\.0 - wetSheen\) \* F\.params9\.z \* keyMul > 0\.001\) \{/);
  assert.match(chunks, /if \(\(1\.0 - wetSheen\) \* F\.params9\.z \* keyMul > 0\.001\) \{[\s\S]{0,240}?pow\(max\(envSunAlign, 1e-4\), 22\.0\)/);

  console.log("[perf-try] checking window sun flash gate: tsl-lit.js");
  const tsl = read("js/render/three/tsl-lit.js");
  assert.match(tsl, /If\(wetSheen\.oneMinus\(\)\.mul\(U\.windowSunFlash\)\.mul\(U\.keyMul\)\.greaterThan\(0\.001\)/);
  console.log("[perf-try] window sun flash gate: all backends OK");
});

test("sky golden-hour and low-sun band skip when sunE >= 0.72", () => {
  // First factor is (1-smoothstep(0, 0.72, sunE)). Identically 0 on
  // default day (~0.95) and night moon-key (~1). Dawn/dusk still enter.
  console.log("[perf-try] checking sky golden-hour/low-sun gate: sky.js");
  const sky = read("js/render/shaders/sky.js");
  assert.match(sky, /if \(sunE < 0\.72\) \{[\s\S]*?goldenAmt[\s\S]*?lowBand/);

  console.log("[perf-try] checking sky golden-hour/low-sun gate: wgsl-chunks.js");
  const chunks = read("js/render/webgpu/wgsl-chunks.js");
  assert.match(chunks, /if \(sunE < 0\.72\) \{[\s\S]*?goldenAmt[\s\S]*?lowBand/);

  console.log("[perf-try] checking sky golden-hour/low-sun gate: tsl-sky.js");
  const tsl = read("js/render/three/tsl-sky.js");
  assert.match(tsl, /If\(sunE\.lessThan\(0\.72\), \(\) => \{[\s\S]*?goldenAmt[\s\S]*?lowBand/);
  console.log("[perf-try] sky golden-hour/low-sun gate: all backends OK");
});

test("WGX composite godray fetch is gated on lift.w haveGR", () => {
  // lift.w is the only spare CompositeU float after SSR remul. Keep
  // `let ssrWet = U.lift.w` so Dawn still compiles a leftover use.
  console.log("[perf-try] checking WGX godray haveGR gate: wgsl-post.js");
  const post = read("js/render/webgpu/wgsl-post.js");
  assert.match(post, /let ssrWet = U\.lift\.w/);
  assert.match(post, /if \(U\.lift\.w > 0\.5\) \{\s*c = c \+ textureSampleLevel\(godrayTex/);
  assert.equal((post.match(/textureSampleLevel\(godrayTex/g) || []).length, 1,
    "godray fetch must exist exactly once, inside the haveGR gate");

  console.log("[perf-try] checking WGX godray haveGR gate: wgx.js");
  const wgx = read("js/render/webgpu/wgx.js");
  assert.match(wgx, /s\[47\] = haveGR \? 1 : 0/);
  assert.doesNotMatch(wgx, /_clearTarget\(/);
  console.log("[perf-try] WGX godray haveGR gate: OK");
});

test("sky twilight cloud wash skips pow(sd,2.5) when twilight is 0", () => {
  // twilight = smoothstep(0.02,0.22,sunE)*(1-dayGate)*(1-nightSky).
  // Identically 0 on default day (~0.95) and night. Default cloud is 0.4
  // so the cloud block is live — the pow was * 0. WGSL has no twilight wash.
  console.log("[perf-try] checking twilight cloud-wash gate: sky.js");
  const sky = read("js/render/shaders/sky.js");
  assert.match(sky, /if \(twilight > 0\.001\) \{\s*lit \+= uSunColor \* pow\(sd, 2\.5\) \* twilight/);

  console.log("[perf-try] checking twilight cloud-wash gate: tsl-sky.js");
  const tsl = read("js/render/three/tsl-sky.js");
  assert.match(tsl, /If\(twilight\.greaterThan\(0\.001\), \(\) => \{[\s\S]{0,200}?pow\(sd, 2\.5\)/);
  console.log("[perf-try] twilight cloud-wash gate: OK");
});

test("godray sun HG and TSL sun-half skip when shaft strength is 0", () => {
  // Night haveGR is lampVol with uStr=0. GLSL/WGSL already gated the
  // 16-step sun march; TSL did not. HG sqrt's only consumer is * uStr.
  console.log("[perf-try] checking godray sun HG gate: post.js");
  const post = read("js/render/shaders/post.js");
  assert.match(post, /if \(uStr > 0\.0\) \{\s*float hSun/);
  assert.match(post, /vec3 sunTerm = vec3\(0\.0\);\s*if \(uStr > 0\.0\) \{/);
  assert.match(post, /outColor = vec4\(sunTerm \+ lampAccum, 1\.0\)/);

  console.log("[perf-try] checking godray sun HG gate: wgsl-post.js");
  const wgsl = read("js/render/webgpu/wgsl-post.js");
  assert.match(wgsl, /var sunTerm = vec3<f32>\(0\.0\);\s*if \(uStr > 0\.0\) \{/);
  assert.match(wgsl, /return vec4<f32>\(sunTerm \+ lampAccum, 1\.0\)/);

  console.log("[perf-try] checking godray sun HG gate: tsl-post.js");
  const tsl = read("js/render/three/tsl-post.js");
  assert.match(tsl, /If\(grU\.str\.greaterThan\(0\.0\), \(\) => \{[\s\S]*?gCloud\(p\)/);
  assert.match(tsl, /If\(grU\.lampStr\.greaterThan\(0\.0\)[\s\S]*?hLamp = exp/);
  assert.match(tsl, /If\(grU\.str\.greaterThan\(0\.0\), \(\) => \{[\s\S]*?hgAniso/);
  console.log("[perf-try] godray sun HG gate: all backends OK");
});

test("TSL heat-haze tests the plume before the scene-tag fetch", () => {
  console.log("[perf-try] checking TSL heat-haze plume-first gate: tsl-post.js");
  const tsl = read("js/render/three/tsl-post.js");
  assert.match(tsl, /const hm = exp\(dot\(hd, hd\)\.mul\(-70\.0\)\)[\s\S]{0,80}?If\(hm\.greaterThan\(0\.003\)[\s\S]{0,160}?tagT\.sample/);
  assert.doesNotMatch(tsl, /tagT\.sample\(TL\(vUV\)\)[\s\S]{0,200}?dot\(hd, hd\)/);
  console.log("[perf-try] TSL heat-haze plume-first gate: OK");
});

test("WGX SSR pass omitted carReflect is the 0.05 tuner default", () => {
  // leftover-2 armed _ssrEarly / gain.w at 0.05 but the march still
  // defaulted to 0 — HIGH dry paid the depth resolve then skipped the
  // pass, and COMPOSITE fetched a target that never ran.
  console.log("[perf-try] checking WGX SSR carReflect 0.05 default: wgx.js");
  const wgx = read("js/render/webgpu/wgx.js");
  assert.match(wgx, /const _carRefl = o\.carReflect != null \? o\.carReflect[\s\S]{0,80}?: 0\.05\)/);
  assert.match(wgx, /const _carReflEarly = o\.carReflect != null \? o\.carReflect[\s\S]{0,80}?: 0\.05\)/);
  console.log("[perf-try] WGX SSR carReflect 0.05 default: OK");
});
