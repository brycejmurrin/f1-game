/* perf-try.test.mjs — baked renderer gates; no pause-menu toggles.

   The four PerfTry pause SETTINGS switches (skyLate, flareGate, envCull,
   lampFogGate) shipped default-ON. They were renderer A/B flags, not lighting
   knobs, so they were baked as the product path and the PERF tab was removed
   rather than moved into the lighting tuner.

   This file keeps its name so the suite count does not churn. It now
   freezes: no PerfTry module / no PERF tab; late sky is unconditional;
   env-probe radial cull is 300 m without a toggle; GLSL/WGSL/TSL keep only
   the gated (ON) path.

   HOW IT PINS THINGS (2026-09 rewrite). Two of the source-text pins in this
   file broke on a one-token refactor that changed no behaviour, so every
   assertion is now one of:
     - BEHAVIOUR through a harness — js/game.js frames pumped in
       tools/lib/game-vm.cjs with a recording GLX stub, js/render/glx/glx.js booted on
       the tests/helpers/glx-mock.mjs WebGL2 mock, js/track/scenery/models.js in a VM;
     - a SHADER-TEXT pin, kept because a Node test has no GPU and the composed
       GLSL/WGSL/TSL is the only observable — matched on the comment-stripped
       source, loosely, on the identifier and the shape of the gate;
     - a STRUCTURE pin (a tab must not exist, a flag must stay off).
   Nothing here quotes a comment, an argument order or exact whitespace.

   Run: node --test tests/unit/perf-try.test.mjs   (~4 s: one shared game-vm boot)
*/
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { bootGlx } from "../helpers/glx-mock.mjs";
import { cssRules, ruleFor } from "../helpers/css-rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
// Shader files are GLSL/WGSL/TSL-as-data; strip JS and shader comments so a
// pin can only match CODE, and a comment edit can neither fail nor satisfy it.
const shader = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const { createGame } = createRequire(import.meta.url)("../../tools/lib/game-vm.cjs");

/* ── the shared headless game (draw order, cull maths, props fuse) ──────── */
let g = null;
const drawLog = [];                    // [name, args] per GLX call on the recorded surface
const FRUSTUM = { planes: null };      // when set, makeFrustumPlanes answers these
const RECORDED = ["begin", "draw", "drawChunked", "drawInstanced", "drawSky", "drawGlow", "present",
  "drawDecal", "drawShadow", "drawSkidBatch", "envFaceBegin", "envFaceEnd", "cullInstances"];
// Gribb–Hartmann planes from a column-major view-projection: p·(x,y,z,1) ≥ 0 inside.
function planesFromVP(m, out) {
  const row = (i) => [m[i], m[4 + i], m[8 + i], m[12 + i]];
  const r = [row(0), row(1), row(2), row(3)];
  const P = out || [];
  let k = 0;
  for (let axis = 0; axis < 3; axis++) for (const s of [1, -1]) {
    const p = P[k] || (P[k] = [0, 0, 0, 0]);
    for (let j = 0; j < 4; j++) p[j] = r[3][j] + s * r[axis][j];
    const l = Math.hypot(p[0], p[1], p[2]) || 1;
    for (let j = 0; j < 4; j++) p[j] /= l;
    k++;
  }
  return P;
}
const meshBufs = [];                  // every buffer Tracks.build handed createMesh / createChunkedMesh
before(async () => {
  g = await createGame({});           // boot only — wrap the stub, THEN build the circuit
  const GLX = g.sandbox.GLX;
  for (const n of ["createMesh", "createChunkedMesh"]) {
    const orig = GLX[n];
    GLX[n] = (buf, ...rest) => { meshBufs.push(buf); return orig(buf, ...rest); };
  }
  for (const n of RECORDED) {
    GLX[n] = (...a) => { drawLog.push([n, a]); return n === "cullInstances" ? 0 : n === "envFaceBegin" ? new Float32Array(16) : undefined; };
  }
  GLX.makeFrustumPlanes = (vp, out) => (FRUSTUM.planes ? FRUSTUM.planes.map((p) => p.slice()) : planesFromVP(vp, out));
  GLX.aabbInFrustum = () => true;
  GLX.envProbeReady = () => false;
  await g.race("monza", "night", "dry");   // night: frame.lights exists, so drawGlow is live
  g.apex.setInput({ throttle: true }); g.step(30); g.apex.clearInput();
});
after(() => { if (g) g.close(); });

/** Pump one render frame and return the recorded call names in order. */
function pumpNames() {
  drawLog.length = 0;
  g.pumpFrame();
  return drawLog.map((c) => c[0]);
}
const lastWorldDraw = (names) => Math.max(names.lastIndexOf("drawChunked"), names.lastIndexOf("drawInstanced"));

test("PerfTry module and the PERF tab are gone", () => {
  assert.equal(fs.existsSync(path.join(ROOT, "js/game/perf-try.js")), false);
  const html = read("index.html");
  assert.doesNotMatch(html, /pm-tab-performance|pm-panel-performance|perf-try\.js/);
  assert.doesNotMatch(read("tools/manifest.cjs"), /js\/game\/perf-try\.js/);
  assert.doesNotMatch(read("js/ui/settings-tabs.js"), /"performance"/);
  for (const f of ["js/lighting/knobs.js", "js/lighting/track-lights.js", "js/lighting/frame-lights.js", "js/lighting/lighting.js"])
    assert.doesNotMatch(read(f), /skyLate|flareGate|envCull|lampFogGate/);
  assert.doesNotMatch(read("js/game.js"), /_skyLate|PerfTry/);
});

test("late sky is the only world draw order: world meshes → sky → glow → present", () => {
  const names = pumpNames();
  assert.ok(names.includes("drawSky") && names.includes("present"), `frame drew: ${[...new Set(names)].join(",")}`);
  const sky = names.lastIndexOf("drawSky");
  assert.ok(lastWorldDraw(names) < sky, "every world mesh draws BEFORE the sky (early-Z: the sky fills only what the world left)");
  assert.ok(sky < names.indexOf("present"), "sky draws before present");
  const glow = names.indexOf("drawGlow");
  assert.ok(glow > sky, "night lens glow draws after the sky, in the same frame");
  assert.ok(names.indexOf("begin") < lastWorldDraw(names), "begin() opens the frame before the first world draw");
});

test("env-probe face uses the same opaque → sky order as the main camera", () => {
  // The stub's envFaceBegin returns an inverse VP, which is game.js's cue to
  // draw the face; the face must close with drawSky, then envFaceEnd.
  let names = null;
  for (let i = 0; i < 12 && !(names && names.includes("envFaceBegin")); i++) names = pumpNames();
  assert.ok(names.includes("envFaceBegin"), "the env probe never rendered a face in twelve frames");
  const b = names.indexOf("envFaceBegin"), e = names.indexOf("envFaceEnd", b);
  assert.ok(e > b, "envFaceBegin is paired with envFaceEnd");
  const face = names.slice(b + 1, e);
  const faceSky = face.lastIndexOf("drawSky");
  assert.ok(faceSky >= 0, "the probe face draws the sky");
  assert.ok(lastWorldDraw(face) < faceSky, "probe face: opaque world first, sky last");
  assert.ok(!face.includes("drawGlow"), "glow stays off on the probe face");
  assert.ok(face.includes("drawChunked") || face.includes("drawInstanced"), "the probe face draws the world, not just the sky");
});

test("main camera cullDist contains the far-plane corners (not the 300 m probe cap)", () => {
  pumpNames();
  const cull = g.G.frame.cullDist;
  // farPlane is 900 m at the default RENDER DISTANCE; the corner-containing
  // sphere is strictly larger, and nothing like the probe's 300 m cap.
  assert.ok(Number.isFinite(cull) && cull > 900, `cullDist ${cull} must exceed the 900 m far plane`);
  assert.ok(cull < 900 * 2, `cullDist ${cull} is not a corner-bounding sphere of a 900 m frustum`);
});

test("AI cars outside an 8 m frustum sphere are not drawn — shadows are enqueued first", () => {
  // One plane at a time, all others wide open. p·x + d < -r culls, so a plane
  // with normal 0 reads as d < -8: -7.99 keeps every rival, -8.01 drops them.
  const open = [0, 0, 0, 1e6];
  const withD = (d) => [[0, 0, 0, d], open, open, open, open, open];
  const counts = (names) => ({ draw: names.filter((n) => n === "draw").length, shadow: names.filter((n) => n === "drawShadow").length, decal: names.filter((n) => n === "drawDecal").length });
  FRUSTUM.planes = withD(-7.99);
  const kept = counts(pumpNames());
  FRUSTUM.planes = withD(-8.01);
  const culled = counts(pumpNames());
  FRUSTUM.planes = null;
  assert.ok(kept.draw > culled.draw + 20, `culling every rival must drop many draws: ${kept.draw} → ${culled.draw}`);
  assert.ok(kept.decal > culled.decal, "culled rivals draw no decals");
  assert.equal(kept.shadow, culled.shadow, "the shadow enqueue precedes the side-frustum cull — an off-camera rival still casts");
  assert.ok(culled.shadow >= 2, "the player and the rivals' shadows are still drawn");
});

test("GLX skips equal tuner-uniform re-uploads (lit / sky / composite)", () => {
  const h = bootGlx();
  const frame = h.frame({ tune: { bounceK: 0.3 } });
  h.GLX.begin(frame);
  h.reset();
  h.GLX.begin(frame);
  const again = h.calls.filter((c) => c[0] === "uniform1f").map((c) => c[1][0].name);
  assert.deepEqual(again, ["uTime"], "an identical begin() re-uploads only the per-frame clock");
  assert.equal(h.count("uniform3fv"), 0, "sun / ambient / fog vec3s are skipped when unchanged");
  h.reset();
  h.GLX.begin(h.frame({ tune: { bounceK: 0.5 } }));
  assert.ok(h.count("uniform1f", (a) => a[0].name === "uBounceK") === 1, "a changed tuner value uploads once");
  // Sky program: the gradient knob is cached the same way.
  const sky = { invViewProj: new Float32Array(16), sunDir: [0, 1, 0], sunColor: [1, 1, 1], zenith: [0.2, 0.3, 0.7], horizon: [0.6, 0.7, 0.9], time: 0 };
  h.GLX.drawSky(sky); h.reset(); h.GLX.drawSky(sky);
  assert.equal(h.count("uniform1f", (a) => a[0].name === "uSkyGrad"), 0, "sky gradient skips an equal re-upload");
  // Composite: grade knobs cached; per-frame grain time always uploads.
  h.GLX.begin(frame); h.GLX.present({}); h.reset();
  h.GLX.begin(frame); h.GLX.present({});
  assert.equal(h.count("uniform1f", (a) => a[0].name === "uContrast"), 0, "composite contrast skips an equal re-upload");
  assert.equal(h.count("uniform1f", (a) => a[0].name === "uGrainTime"), 1, "per-frame grain time still uploads unconditionally");
});

test("props fuse uses sealed typed accumulators", () => {
  // The model helper in a VM: scratch() hands out growable typed accumulators
  // and sealGeometry() trims them to exact-length TypedArrays.
  const ctx = vm.createContext({ Math, Number, Array, Float64Array, Float32Array, Uint32Array, Object, JSON });
  vm.runInContext(read("js/track/scenery/models.js").replace(/^const\b/gm, "var"), ctx, { filename: "js/track/scenery/models.js" });
  const TM = vm.runInContext("TrackModels", ctx);
  const geo = TM.scratch(4);
  assert.equal(geo.pos.length, 0);
  for (let i = 0; i < 40; i++) geo.pos.push(i, i + 0.5, i + 0.25);   // grows past the 4-vertex estimate
  geo.idx.push(0, 1, 2); geo.idx.push(2, 3);
  assert.equal(geo.pos.length, 120);
  assert.equal(geo.idx.length, 5);
  const sealed = TM.sealGeometry(geo);
  assert.ok(sealed.pos instanceof Float64Array || Object.getPrototypeOf(sealed.pos).constructor.name === "Float64Array", "positions seal to Float64Array (f64 on purpose — graph parity)");
  assert.equal(sealed.pos.length, 120, "sealed length is the pushed length, not the capacity");
  assert.equal(sealed.pos[119], 39.25);
  assert.equal(Object.getPrototypeOf(sealed.idx).constructor.name, "Uint32Array", "indices seal to Uint32Array");
  assert.equal(sealed.idx.length, 5);
  assert.deepEqual(Array.from(sealed.idx), [0, 1, 2, 2, 3]);
  // And the real build hands those sealed buffers to the renderer: the fused
  // props mesh reaches createMesh as typed arrays, never a plain growable list.
  const typed = meshBufs.filter((b) => b && b.pos && b.pos.BYTES_PER_ELEMENT === 8 && b.idx && b.idx.BYTES_PER_ELEMENT === 4);
  assert.ok(typed.length >= 1, `no createMesh call received a sealed (Float64Array pos + Uint32Array idx) buffer out of ${meshBufs.length}`);
  assert.ok(typed.some((b) => b.pos.length > 3000), "the fused props buffer is a large sealed mesh, not a stray helper");
});

test("already-landed leftovers stay in the product path", () => {
  const tracks = read("js/track/tracks.js");
  assert.match(tracks, /\bMASS_CELL\s*=\s*\d+/, "the mass grid keeps a cell size");
  assert.match(tracks, /\bmassGridInsert\b/, "masses are inserted into the grid, not scanned linearly");
  const geom = shader("js/track/core/geom.js");
  assert.match(geom, /\(i\s*\+\s*1\)\s*\/\s*seg\s*\*\s*6\.2832/, "ring tables close with (i+1)/seg, never with an integer %seg wrap");
  // Angle wrap via %seg moves the last edge (6.2832 ≠ 2π). Integer %seg on
  // a ring-vertex table (addMountain) is the correct close and is allowed.
  assert.doesNotMatch(geom, /(?:a1|ring)\([^)]*%\s*seg/);
});

test("env-probe radial cull is 300 m without a toggle", () => {
  // GLX: BEHAVIOUR on the mock — the probe caps a no-cull frame at 300 m and
  // keeps a tighter main-camera cull, restoring the caller's value after.
  const h = bootGlx();
  const free = h.frame({ cullDist: 0 });
  h.GLX.envFaceBegin(0, [1, 2, 3], free);
  assert.equal(free.cullDist, 300, "a no-cull (0) main frame probes at 300 m");
  h.GLX.envFaceEnd(0);
  assert.equal(free.cullDist, 0, "envFaceEnd restores the main camera's cull");
  const tight = h.frame({ cullDist: 120 });
  h.GLX.envFaceBegin(1, [1, 2, 3], tight);
  assert.equal(tight.cullDist, 120, "a tighter main-camera cull (tier-3 fog) is kept, never widened to 300");
  h.GLX.envFaceEnd(1);
  assert.equal(tight.cullDist, 120);
  const glx = shader("js/render/glx/glx.js");
  assert.doesNotMatch(glx, /typeof PerfTry|PerfTry\.(on|defines|withWgslConsts)/);

  // game.js: the chunk-ribbon and probe gates are tier reads, not a toggle.
  const game = shader("js/game.js");
  assert.match(game, /chunkRibbons:\s*PerfGov\.tier\(\)\s*<\s*3/);
  assert.doesNotMatch(game, /envCull|PerfTry/);

  // WGX / TLX: the same 300 m cap, read from source (no shared mock-device
  // harness in this file; the WGX one lives in webgpu-lifecycle.test.mjs).
  const wgx = shader("js/render/webgpu/wgx.js");
  assert.match(wgx, /cullDist\s*=\s*\w+\s*>\s*0\s*\?\s*Math\.min\(\s*\w+\s*,\s*300\s*\)\s*:\s*300/, "WGX probe caps at 300 m and keeps a tighter cull");
  assert.doesNotMatch(wgx, /_perfWgsl|typeof PerfTry|PerfTry\.(on|defines|withWgslConsts)/);
  const tlx = shader("js/render/three/tlx.js");
  assert.match(tlx, /\bENV_CULL_M\s*=\s*300\b/);
  assert.match(tlx, /cullDist\s*=\s*_envSvCull\s*>\s*0\s*\?\s*Math\.min\(\s*_envSvCull\s*,\s*ENV_CULL_M\s*\)\s*:\s*ENV_CULL_M/);
  assert.match(tlx, /chunkedSys\.cull\(\s*rec\.chunked\s*,\s*faceVP\s*,\s*faceEye\s*,\s*faceCull\s*\)/, "the probe face culls chunks against ITS frustum and cap");
  assert.match(tlx, /function\s+_restoreEnvFrame\s*\(/);
  assert.doesNotMatch(tlx, /typeof PerfTry|PerfTry\.(on|defines|withWgslConsts)/);
});

test("GLSL / WGSL / TSL keep only the gated ON path", () => {
  const post = shader("js/render/glx/shaders/glsl-post.js");
  const lit = shader("js/render/glx/shaders/glsl-lit.js");
  assert.doesNotMatch(post, /#ifdef OPT_FLAREGATE|#else/);
  assert.match(post, /sunVis\s*=\s*\(\s*uFlareStr\s*>\s*0\.0\s*&&\s*uSunUV\.x\s*>=\s*0\.0/);
  assert.doesNotMatch(lit, /#ifdef OPT_LAMPFOGGATE/);
  assert.match(lit, /if\s*\(\s*uLampFog\s*>\s*0\.0\s*\)/);

  const chunks = shader("js/render/webgpu/wgsl-chunks.js");
  const wgslPost = shader("js/render/webgpu/wgsl-post.js");
  assert.doesNotMatch(chunks, /OPT_LAMPFOGGATE/);
  assert.match(chunks, /if\s*\(\s*F\.params8\.x\s*>\s*0\.0\s*\)/);
  assert.doesNotMatch(wgslPost, /OPT_FLAREGATE/);
  assert.match(wgslPost, /flareStr\s*>\s*0\.0\s*&&\s*sunUV\.x\s*>=\s*0\.0/);

  const tslLit = shader("js/render/three/tsl-lit.js");
  const tslPost = shader("js/render/three/tsl-post.js");
  assert.match(tslLit, /If\(\s*U\.lampFog\.greaterThan\(\s*0\.0\s*\)/);
  assert.doesNotMatch(tslLit, /lampFogGate|PerfTry/);
  assert.match(tslPost, /If\(\s*C\.flareStr\.greaterThan\(\s*0\.0\s*\)/);
  assert.doesNotMatch(tslPost, /flareGate|PerfTry/);
});

test("SETTINGS still has GRAPHICS: HIGH and three category tabs", () => {
  const html = read("index.html");
  assert.match(html, /GRAPHICS: HIGH/);
  assert.doesNotMatch(html, /GRAPHICS: STANDARD/);
  for (const id of ["pm-tab-controls", "pm-tab-display", "pm-tab-more"]) assert.match(html, new RegExp(`id="${id}"`));
  const rules = cssRules(read("css/components.css"));
  assert.ok(ruleFor(rules, /^\.balanced-row\s*>\s*:not\(\[hidden\]\)$/), "the balanced-row child rule exists");
  assert.ok(!rules.some((r) => r.decls.get("grid-template-columns") === "repeat(4, minmax(0, 1fr))"),
    "no four-column tab grid — the PERF tab's column is gone");
});

test("sun GGX and clearcoat skip backfaces on all three backends", () => {
  // specCol is * litNoL (= NoL * …); ccCol is * NoLg. A backface paid two
  // GGX evals for 0. Same shape as the lamp NoLl gate already in the tree.
  const lit = shader("js/render/glx/shaders/glsl-lit.js");
  assert.match(lit, /if\s*\(\s*NoL\s*>\s*0\.0\s*\)\s*\{\s*float\s+D\s*=\s*D_GGX/);
  assert.match(lit, /NoLg\s*=\s*max\(\s*dot\(\s*Ngeo\s*,\s*L\s*\)\s*,\s*0\.0\s*\);[\s\S]{0,300}?if\s*\(\s*NoLg\s*>\s*0\.0\s*\)/);
  const chunks = shader("js/render/webgpu/wgsl-chunks.js");
  assert.match(chunks, /if\s*\(\s*NoL\s*>\s*0\.0\s*\)\s*\{\s*let\s+Dg\s*=\s*D_GGX/);
  assert.match(chunks, /NoLg\s*=\s*max\(\s*dot\(\s*Ngeo\s*,\s*L\s*\)\s*,\s*0\.0\s*\);[\s\S]{0,300}?if\s*\(\s*NoLg\s*>\s*0\.0\s*\)/);
  const tsl = shader("js/render/three/tsl-lit.js");
  assert.match(tsl, /If\(\s*NoL\.greaterThan\(\s*0\.0\s*\)\s*,/);
  assert.match(tsl, /If\(\s*NoLg\.greaterThan\(\s*0\.0\s*\)\s*,/);
});

test("composite skips dummy SSAO / bloom / godray fetches", () => {
  const post = shader("js/render/glx/shaders/glsl-post.js");
  assert.match(post, /uniform\s+float\s+uHaveGodray\b/);
  assert.match(post, /aoV\s*=\s*1\.0;\s*if\s*\(\s*uAOTexel\.x\s*>\s*0\.0\s*\)/);
  assert.doesNotMatch(post, /else\s+aoV\s*=\s*texture\(\s*uSSAO/);
  assert.match(post, /if\s*\(\s*uHaveGodray\s*>\s*0\.5\s*\)\s*c\s*\+=\s*texture\(\s*uGodray/);
  assert.match(post, /if\s*\(\s*uBloomAmt\s*>\s*0\.001\s*\)\s*\{\s*bloomSample\s*=\s*texture\(\s*uBloom/);
  assert.match(post, /if\s*\(\s*uSunShaft\s*>\s*0\.0\s*&&\s*uBloomAmt\s*>\s*0\.001\s*\)/);

  // GLX present(): BEHAVIOUR on the mock. The MSAA depth resolve is skipped
  // only when NOTHING will read depth; an OMITTED carReflect is the 0.05 tuner
  // default and so still counts as SSR-on (that omission once skipped the blit
  // on a dry night with AO/godray/flare off). uHaveGodray rides the cache.
  const h = bootGlx();
  const blitMask = (frame, opts) => {
    h.GLX.begin(frame); h.reset(); h.GLX.present(opts);
    const blit = h.calls.find((c) => c[0] === "blitFramebuffer");
    assert.ok(blit, "the MSAA resolve blit ran");
    return blit[1][8];
  };
  const C = h.gl.COLOR_BUFFER_BIT, D = h.gl.DEPTH_BUFFER_BIT;   // minted on first access
  const night = h.frame({ sunDir: [0, -1, 0] });   // sun down: no flare pre-check
  assert.equal(blitMask(night, {}), C | D, "omitted carReflect = 0.05 default → SSR marches → depth is resolved");
  assert.equal(blitMask(night, { carReflect: 0, reflect: 0 }), C, "AO/godray/SSR/flare all off → colour-only resolve");
  assert.equal(blitMask(night, { carReflect: 0, reflect: 0, ssao: 0.5 }), C | D, "SSAO reads depth");
  assert.equal(blitMask(night, { carReflect: 0, reflect: 0.4 }), C | D, "road SSR reads depth");
  assert.equal(h.count("uniform1f", (a) => a[0].name === "uHaveGodray" && a[1] === 0), 0,
    "uHaveGodray goes through the redundancy cache — an unchanged 0 is not re-uploaded");

  const wgsl = shader("js/render/webgpu/wgsl-post.js");
  assert.match(wgsl, /fn\s+ssaoViewPosFromD\s*\(/);
  assert.match(wgsl, /P\s*=\s*ssaoViewPosFromD\(\s*in\.uv\s*,\s*dCentre\s*\)/);
  assert.match(wgsl, /if\s*\(\s*bloomAmt\s*>\s*0\.001\s*\)\s*\{\s*bloomSample\s*=\s*textureSampleLevel\(\s*bloomTex/);
  assert.match(wgsl, /if\s*\(\s*U\.lift\.w\s*>\s*0\.5\s*\)\s*\{\s*c\s*=\s*c\s*\+\s*textureSampleLevel\(\s*godrayTex/);

  const wgx = shader("js/render/webgpu/wgx.js");
  assert.match(wgx, /_needDepth\s*=\s*_haveAOEarly\s*\|\|\s*_haveGREarly\s*\|\|\s*_ssrEarly\s*\|\|\s*_flareEarly/);
  assert.match(wgx, /if\s*\(\s*_needDepth\s*&&\s*_passSamples\s*>\s*1\s*&&\s*pDepthResolve/);
  assert.match(wgx, /_carReflEarly\s*=\s*o\.carReflect\s*!=\s*null\s*\?\s*o\.carReflect[\s\S]{0,120}?:\s*0\.05/, "WGX omitted carReflect is the 0.05 default");
  assert.match(wgx, /_wetEarly\s*>\s*0\.01\s*&&\s*_ssrStrEarly\s*>\s*0\.001\s*\)\s*\|\|\s*_carReflEarly\s*>\s*0\.001/);
  // Skipped SSAO / bloom / godray no longer pay a dummy clear.
  assert.doesNotMatch(wgx, /_clearTarget\(\s*(?:godrayView|ssaoView|bloomLv)/);

  const tslPost = shader("js/render/three/tsl-post.js");
  assert.match(tslPost, /haveGodray:\s*uniform\(\s*0\s*\)/);
  assert.match(tslPost, /If\(\s*C\.haveGodray\.greaterThan\(\s*0\.5\s*\)/);
  assert.match(tslPost, /If\(\s*C\.bloomAmt\.greaterThan\(\s*0\.001\s*\)/);
  assert.match(tslPost, /If\(\s*C\.sunShaft\.greaterThan\(\s*0\.0\s*\)\.and\(\s*C\.bloomAmt\.greaterThan\(\s*0\.001\s*\)\s*\)/);
  assert.match(shader("js/render/three/tlx-post.js"), /C\.haveGodray\.value\s*=\s*haveGR\s*\?\s*1\s*:\s*0/);
});

test("SSAO reconstructs the centre from one depth sample", () => {
  const post = shader("js/render/glx/shaders/glsl-post.js");
  assert.match(post, /vec3\s+viewPosD\s*\(\s*vec2\s+uv\s*,\s*float\s+d\s*\)/);
  assert.match(post, /vec3\s+P\s*=\s*viewPosD\(\s*vUV\s*,\s*d\s*\);/);
  // The 1-arg wrapper stays for contact-shadow sample sites (no overload in ES 3.00).
  assert.match(post, /vec3\s+viewPos\s*\(\s*vec2\s+uv\s*\)\s*\{\s*return\s+viewPosD\(\s*uv\s*,\s*texture\(\s*uDepth\s*,\s*uv\s*\)\.r\s*\);\s*\}/);
  const wgsl = shader("js/render/webgpu/wgsl-post.js");
  assert.match(wgsl, /dCentre\s*=\s*ssaoDepth\(\s*in\.uv\s*\);\s*let\s+P\s*=\s*ssaoViewPosFromD\(\s*in\.uv\s*,\s*dCentre\s*\)/);
  const tsl = shader("js/render/three/tsl-post.js");
  assert.match(tsl, /ssaoViewPosFromD\s*=\s*\(\s*uvGl\s*,\s*d\s*\)\s*=>/);
  assert.match(tsl, /P0\s*=\s*vec3\(\s*ssaoViewPosFromD\(\s*vUV\s*,\s*d\s*\)\s*\)\.toVar\(\)/);
});

test("frustum-plane helpers are exported by GLX and TLX for the car cull", () => {
  const h = bootGlx();
  const planes = h.GLX.makeFrustumPlanes(new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), null);
  assert.equal(planes.length, 6, "GLX.makeFrustumPlanes returns the six planes game.js tests the 8 m sphere against");
  for (const p of planes) assert.ok(p.length >= 4 && Number.isFinite(p[3]), "each plane is (nx, ny, nz, d)");
  const out = Array.from({ length: 6 }, () => [0, 0, 0, 0]);
  assert.equal(h.GLX.makeFrustumPlanes(new Float32Array(16).fill(0.5), out), out, "a preallocated `out` is filled in place and returned (no per-frame allocation)");
  assert.ok(out.some((p) => p[3] !== 0), "the planes were written into `out`");
  const tlx = shader("js/render/three/tlx.js");
  assert.match(tlx, /makeFrustumPlanes\s*\(\s*viewProj\s*,\s*out\s*\)\s*\{\s*return\s+TLXShaders\.makeFrustumPlanes\(\s*viewProj\s*,\s*out\s*\)/);
});

test("fog stack skips pow/exp when density and mist are off", () => {
  // fd==0 → f==0 → mix is identity. Setup preview / carview / tuner-zero
  // used to still pay two sunAmt pows + tint + exp. Mist keeps its own
  // gate so a density-0 + mist-on tuner frame still tints.
  const lit = shader("js/render/glx/shaders/glsl-lit.js");
  assert.match(lit, /if\s*\(\s*uFogDensity\s*>\s*0\.0\s*\|\|\s*uGroundMist\s*>\s*0\.001\s*\)/);
  assert.match(lit, /if\s*\(\s*uFogDensity\s*>\s*0\.0\s*\)\s*\{\s*float\s+heightAtten/);
  // The sun powers live INSIDE the gate. They were pow(sunAmt, 4.0) /
  // pow(sunAmt, 16.0); since 2026-09-02 they are the exact multiplies
  // sunAmt4 / sunAmt16 (renderer audit, GLX 10) — still gated, still skipped
  // when the density is 0.
  assert.match(lit, /if\s*\(\s*uFogDensity\s*>\s*0\.0\s*\)\s*\{[\s\S]*?sunAmt4\s*=\s*sunAmt2\s*\*\s*sunAmt2[\s\S]*?sunAmt16\s*\*=\s*sunAmt16/);
  assert.doesNotMatch(lit, /pow\(\s*sunAmt\s*,\s*(4|16)\.0\s*\)/, "the integer sun powers are multiplies now, not pow()");
  const chunks = shader("js/render/webgpu/wgsl-chunks.js");
  assert.match(chunks, /if\s*\(\s*fogDensity\s*>\s*0\.0\s*\|\|\s*mistK\s*>\s*0\.001\s*\)/);
  assert.match(chunks, /if\s*\(\s*fogDensity\s*>\s*0\.0\s*\)\s*\{[\s\S]*?pow\(\s*sunAmt\s*,\s*4\.0\s*\)/);
  const tsl = shader("js/render/three/tsl-lit.js");
  assert.match(tsl, /If\(\s*U\.fogDensity\.greaterThan\(\s*0\.0\s*\)\.or\(\s*U\.groundMist\.greaterThan\(\s*0\.001\s*\)\s*\)/);
  assert.match(tsl, /If\(\s*U\.fogDensity\.greaterThan\(\s*0\.0\s*\)\s*,/);
});

test("window sun flash skips pow(_,22) when wet or the knobs are off", () => {
  // Term is * (1-wetSheen)*uWindowSunFlash*uKeyMul. Wet road forces
  // envBlend high then multiplies the flash by 0.
  const lit = shader("js/render/glx/shaders/glsl-lit.js");
  assert.match(lit, /if\s*\(\s*\(\s*1\.0\s*-\s*wetSheen\s*\)\s*\*\s*uWindowSunFlash\s*\*\s*uKeyMul\s*>\s*0\.001\s*\)\s*\{[\s\S]{0,300}?pow\(\s*max\(\s*envSunAlign\s*,\s*1e-4\s*\)\s*,\s*22\.0\s*\)/);
  const chunks = shader("js/render/webgpu/wgsl-chunks.js");
  assert.match(chunks, /if\s*\(\s*\(\s*1\.0\s*-\s*wetSheen\s*\)\s*\*\s*F\.params9\.z\s*\*\s*keyMul\s*>\s*0\.001\s*\)\s*\{[\s\S]{0,300}?pow\(\s*max\(\s*envSunAlign\s*,\s*1e-4\s*\)\s*,\s*22\.0\s*\)/);
  const tsl = shader("js/render/three/tsl-lit.js");
  assert.match(tsl, /If\(\s*wetSheen\.oneMinus\(\)\.mul\(\s*U\.windowSunFlash\s*\)\.mul\(\s*U\.keyMul\s*\)\.greaterThan\(\s*0\.001\s*\)/);
});

test("sky golden-hour and low-sun band skip when sunE >= 0.72", () => {
  // First factor is (1-smoothstep(0, 0.72, sunE)). Identically 0 on
  // default day (~0.95) and night moon-key (~1). Dawn/dusk still enter.
  assert.match(shader("js/render/glx/shaders/glsl-sky.js"), /if\s*\(\s*sunE\s*<\s*0\.72\s*\)\s*\{[\s\S]*?goldenAmt[\s\S]*?lowBand/);
  assert.match(shader("js/render/webgpu/wgsl-chunks.js"), /if\s*\(\s*sunE\s*<\s*0\.72\s*\)\s*\{[\s\S]*?goldenAmt[\s\S]*?lowBand/);
  assert.match(shader("js/render/three/tsl-sky.js"), /If\(\s*sunE\.lessThan\(\s*0\.72\s*\)\s*,\s*\(\)\s*=>\s*\{[\s\S]*?goldenAmt[\s\S]*?lowBand/);
});

test("WGX composite godray fetch is gated on lift.w haveGR", () => {
  // lift.w is the only spare CompositeU float after SSR remul. Keep
  // `let ssrWet = U.lift.w` so Dawn still compiles a leftover use. The
  // producer side (lift.w = haveGR, 0 with no godray) is pinned as BEHAVIOUR
  // by webgpu-lifecycle.test.mjs ("lift.w is haveGR — harness present() has
  // no godray"), so it is not repeated as source text here.
  const post = shader("js/render/webgpu/wgsl-post.js");
  assert.match(post, /let\s+ssrWet\s*=\s*U\.lift\.w/);
  assert.match(post, /if\s*\(\s*U\.lift\.w\s*>\s*0\.5\s*\)\s*\{\s*c\s*=\s*c\s*\+\s*textureSampleLevel\(\s*godrayTex/);
  assert.equal((post.match(/textureSampleLevel\(\s*godrayTex/g) || []).length, 1,
    "godray fetch must exist exactly once, inside the haveGR gate");
  assert.doesNotMatch(shader("js/render/webgpu/wgx.js"), /_clearTarget\(/);
});

test("sky twilight cloud wash skips pow(sd,2.5) when twilight is 0", () => {
  // twilight = smoothstep(0.02,0.22,sunE)*(1-dayGate)*(1-nightSky).
  // Identically 0 on default day (~0.95) and night. Default cloud is 0.4
  // so the cloud block is live — the pow was * 0. WGSL has no twilight wash.
  assert.match(shader("js/render/glx/shaders/glsl-sky.js"), /if\s*\(\s*twilight\s*>\s*0\.001\s*\)\s*\{\s*lit\s*\+=\s*uSunColor\s*\*\s*pow\(\s*sd\s*,\s*2\.5\s*\)\s*\*\s*twilight/);
  assert.match(shader("js/render/three/tsl-sky.js"), /If\(\s*twilight\.greaterThan\(\s*0\.001\s*\)\s*,\s*\(\)\s*=>\s*\{[\s\S]{0,300}?pow\(\s*sd\s*,\s*2\.5\s*\)/);
});

test("godray sun HG and TSL sun-half skip when shaft strength is 0", () => {
  // Night haveGR is lampVol with uStr=0. GLSL/WGSL already gated the
  // 16-step sun march; TSL did not. HG sqrt's only consumer is * uStr.
  const post = shader("js/render/glx/shaders/glsl-post.js");
  assert.match(post, /if\s*\(\s*uStr\s*>\s*0\.0\s*\)\s*\{\s*float\s+hSun/);
  assert.match(post, /vec3\s+sunTerm\s*=\s*vec3\(\s*0\.0\s*\);\s*if\s*\(\s*uStr\s*>\s*0\.0\s*\)\s*\{/);
  assert.match(post, /outColor\s*=\s*vec4\(\s*sunTerm\s*\+\s*lampAccum\s*,\s*1\.0\s*\)/);
  const wgsl = shader("js/render/webgpu/wgsl-post.js");
  assert.match(wgsl, /var\s+sunTerm\s*=\s*vec3<f32>\(\s*0\.0\s*\);\s*if\s*\(\s*uStr\s*>\s*0\.0\s*\)\s*\{/);
  assert.match(wgsl, /return\s+vec4<f32>\(\s*sunTerm\s*\+\s*lampAccum\s*,\s*1\.0\s*\)/);
  const tsl = shader("js/render/three/tsl-post.js");
  assert.match(tsl, /If\(\s*grU\.str\.greaterThan\(\s*0\.0\s*\)\s*,\s*\(\)\s*=>\s*\{[\s\S]*?gCloud\(\s*p\s*\)/);
  assert.match(tsl, /If\(\s*grU\.lampStr\.greaterThan\(\s*0\.0\s*\)[\s\S]*?hLamp\s*=\s*exp/);
  assert.match(tsl, /If\(\s*grU\.str\.greaterThan\(\s*0\.0\s*\)\s*,\s*\(\)\s*=>\s*\{[\s\S]*?hgAniso/);
});

test("TSL heat-haze tests the plume before the scene-tag fetch", () => {
  const tsl = shader("js/render/three/tsl-post.js");
  assert.match(tsl, /hm\s*=\s*exp\(\s*dot\(\s*hd\s*,\s*hd\s*\)\.mul\(\s*-70\.0\s*\)\s*\)[\s\S]{0,120}?If\(\s*hm\.greaterThan\(\s*0\.003\s*\)[\s\S]{0,200}?tagT\.sample/);
  assert.doesNotMatch(tsl, /tagT\.sample\(\s*TL\(\s*vUV\s*\)\s*\)[\s\S]{0,200}?dot\(\s*hd\s*,\s*hd\s*\)/);
});

test("WGX SSR pass omitted carReflect is the 0.05 tuner default", () => {
  // leftover-2 armed _ssrEarly / gain.w at 0.05 but the march still
  // defaulted to 0 — HIGH dry paid the depth resolve then skipped the
  // pass, and COMPOSITE fetched a target that never ran. Both reads of
  // the option must share the default; the GLX twin of this rule is the
  // blit-mask behaviour test above.
  const wgx = shader("js/render/webgpu/wgx.js");
  for (const name of ["_carRefl", "_carReflEarly"]) {
    assert.match(wgx, new RegExp(`${name}\\s*=\\s*o\\.carReflect\\s*!=\\s*null\\s*\\?\\s*o\\.carReflect[\\s\\S]{0,120}?:\\s*0\\.05\\s*\\)`),
      `${name} must default an omitted carReflect to 0.05`);
  }
});
