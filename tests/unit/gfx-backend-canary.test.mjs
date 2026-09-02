/* gfx-backend-canary.test.mjs — the RENDERER pick must survive the title menu.
 *
 * Title SETTINGS never presents a world frame (`render()` returns on !track
 * until the deferred flyby builds). A canary that stayed armed until present()
 * reverted THREE/WEBGPU to WEBGL2 on every refresh — computer and phone.
 *
 * HOW IT PINS THINGS (2026-09 rewrite). ~390 assertions here used to quote
 * source text; a one-token refactor that changed no behaviour broke two of
 * them. Now the GLX renderer is BOOTED on tests/helpers/glx-mock.mjs (a
 * recording WebGL2 mock) and asserted by its gl call stream — uniform caches,
 * fail-closed guards, cull bookkeeping, the light-lane packing, the opaque
 * canvas; the RENDERER picker is driven through gfx-quality.js in a VM; the
 * GPU-census Verdict script is EXECUTED against fixtures. WGX behaviour that
 * tests/unit/webgpu-lifecycle.test.mjs already drives on its mock device is
 * not repeated here as text. What stays a source pin — TLX (three.js cannot
 * load in Node), WGSL/GLSL/TSL, the vendored three bundle, the workflow
 * YAML, the tools — is matched on comment-stripped source by identifier and
 * shape, never by exact whitespace, argument order or comment text.
 *
 * Run: node --test tests/unit/gfx-backend-canary.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLog } from "../helpers/seed-log.mjs";
import { bootGlx } from "../helpers/glx-mock.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
// Comment-stripped source: a pin can only match code, and a comment can
// neither fail nor satisfy it.
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
/** Brace-matched body of `function name(` (or `name(args) {` for a method). */
function fnBody(src, name) {
  const m = src.match(new RegExp(`(?:function\\s+)?${name}\\s*\\([^)]*\\)\\s*\\{`));
  assert.ok(m, `${name}() moved`);
  let depth = 1;
  const start = m.index + m[0].length;
  let i = start;
  for (; i < src.length && depth; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") depth--;
  }
  return src.slice(start, i - 1);
}

test("gfx-probe cannot report a stale optional frame as fresh", () => {
  const probe = read("tools/gfx-probe.mjs");
  assert.match(probe, /ATTEMPT_ARTIFACTS\s*=\s*\[[^\]]*"frame\.png"/,
    "frame.png must be one of the owned artifacts cleared before every attempt");
  assert.match(probe, /for \(let attempt[^]*?clearAttemptArtifacts\(\);[^]*?runProbeAttempt\(attempt\)/,
    "retry attempts must clear files before launching the browser");
  assert.match(probe, /files:\s*artifactFiles\(\)/,
    "the JSON result must list files that actually exist, not a static wish list");
  assert.doesNotMatch(probe, /files:\s*opts\.backend\s*===/,
    "backend selection alone cannot prove optional frame.png was written");
  assert.equal((probe.match(/\blite:\s*false\b/g) || []).length, 1,
    "probe defaults should not carry duplicate lite entries");
  assert.equal((probe.match(/\biphone:\s*false\b/g) || []).length, 1,
    "probe defaults should not carry duplicate iphone entries");
});

test("#pm-renderer is visible in the SETTINGS markup (not hidden)", () => {
  const html = read("index.html");
  const m = html.match(/<button id="pm-renderer"[^>]*>/);
  assert.ok(m, "pm-renderer button exists");
  assert.doesNotMatch(m[0], /\bhidden\b/, "hidden on the tag hid RENDERER until game.js finished an async backend load");
});

test("boot canary disarms after a successful bind, not only after present()", () => {
  const game = code("js/game.js");
  const bind = game.search(/Object\.defineProperties\(\s*GLX\s*,\s*Object\.getOwnPropertyDescriptors\(\s*backend\s*\)\s*\)/);
  const present = game.search(/gfx\.present\(\s*po\s*\)/);
  assert.ok(bind > 0 && present > bind, "bind then present");
  const disarmAfterBind = game.slice(bind).search(/removeItem\(\s*PROBE_KEY\s*\)/);
  assert.ok(disarmAfterBind >= 0 && bind + disarmAfterBind < present,
    "PROBE_KEY must be cleared after Gfx.create() binds, before the first present — title has no track");
});

test("first world present re-arms the canary so a jetsam mid-frame still reverts", () => {
  const game = code("js/game.js");
  const present = game.search(/gfx\.present\(\s*po\s*\)/);
  const window = game.slice(present - 600, present + 400);
  assert.match(window, /setItem\(\s*"apex26\.gfxBackendProbe"/);
  assert.match(window, /removeItem\(\s*"apex26\.gfxBackendProbe"\s*\)/);
});

test("RENDERER picker lives in gfx-quality.js, not game.js", () => {
  // The picker's own behaviour — a <select> with ‹ › steps, "WEBGPU
  // (UNAVAILABLE)" without navigator.gpu — is driven through bootPicker()
  // below; this is the ownership rule only.
  assert.doesNotMatch(code("js/game.js"), /getElementById\(\s*"pm-renderer"\s*\)|\$\(\s*"pm-renderer"\s*\)/);
  assert.match(code("js/game/gfx-quality.js"), /getElementById\(\s*"pm-renderer"\s*\)/);
});

test("TLX AUTO may land on three WebGL2 and uses a lite swapchain on WebGPU", () => {
  const src = code("js/render/three/tlx.js");
  assert.match(src, /\bisWebKit\b/);
  assert.match(src, /apex26\.tlxAutoGL/);
  assert.match(src, /\b_autoStayGL\b/);
  assert.match(src, /forceWebGL\s*=\s*_glPin\s*===\s*"1"\s*\|\|\s*\(\s*_glPin\s*!==\s*"0"\s*&&\s*\(\s*!_hasGpu\s*\|\|\s*_autoStayGL\s*\)\s*\)/,
    "AUTO stays on WebGL2 without a GPU or after a WebGPU init failure; a pin of 1/0 overrides");
  assert.match(src, /async\s+function\s+bootRenderer\b/);
  assert.match(src, /AUTO WebGPU init failed/);
  assert.match(src, /AUTO stayed on three WebGL2/);
  assert.match(src, /outputType:\s*THREE\.UnsignedByteType/);
  assert.match(src, /powerPreference:\s*"low-power"/);
  assert.match(src, /infoBlob\s*=\s*\[[^\]]*\bdev\b[^\]]*\]/, "the adapter sniff joins the info fields into one blob");
  assert.match(code("js/render/three/tsl-lit.js"), /cubeTexture\(\s*envCubeNode\s*,\s*Rg\s*,\s*rough\.mul\(\s*2\.5\s*\)\s*\)/);
});

test("GLX create* / draw* fail closed when the context is lost", () => {
  // BEHAVIOUR on the mock: after `webglcontextlost` every creator returns
  // null and every draw entry (core, chunked, shadow, post) makes NO gl call.
  const h = bootGlx();
  const tri = { pos: [0, 0, 0, 1, 0, 0, 0, 1, 0], nrm: [0, 1, 0, 0, 1, 0, 0, 1, 0], col: [1, 1, 1, 1, 1, 1, 1, 1, 1], idx: [0, 1, 2] };
  const mesh = h.GLX.createMesh(tri);
  const chunked = h.GLX.createChunkedMesh(tri, 72);
  const batch = h.GLX.createInstancedBatch(tri, new Float32Array(32), null, null);
  const tex = h.GLX.createTexture({ width: 2, height: 2 });
  assert.ok(mesh && chunked && batch && tex, "a live context creates");
  const model = new Float32Array(16); model[0] = model[5] = model[10] = model[15] = 1;
  h.GLX.begin(h.frame());
  h.reset();
  h.GLX.draw(mesh, model, {});
  assert.ok(h.calls.length > 0, "a live draw talks to gl");

  h.loseContext();
  assert.equal(h.GLX.createMesh(tri), null);
  assert.equal(h.GLX.createTexMesh({ pos: [0, 0, 0], nrm: [0, 1, 0], uv: [0, 0], idx: [0] }), null);
  assert.equal(h.GLX.createTexture({}), null);
  assert.equal(h.GLX.createTextureArray(4, [{}], 1), null);
  h.reset();
  h.GLX.begin(h.frame());
  h.GLX.draw(mesh, model, {});
  h.GLX.drawChunked(chunked, model, {});
  h.GLX.drawInstanced(batch, {});
  h.GLX.drawDecal(mesh, model, tex, {});
  h.GLX.drawShadow(model, 1, 1);
  h.GLX.drawMark(model, 1, 1);
  h.GLX.drawSkidBatch(new Float32Array(64), 4, true);
  h.GLX.drawGlow([0, 0, 0, 1, 1, 1, 5], 0.2);
  h.GLX.drawParticles(new Float32Array(16), 16, false);
  h.GLX.castShadow(mesh, model);
  h.GLX.castShadowChunked(chunked, model);
  h.GLX.present({});
  assert.deepEqual(h.calls.map((c) => c[0]), [], "no entry point touches a lost context");
  assert.equal(h.GLX.updateInstances(batch, new Float32Array(32), 1), 0, "updateInstances reports nothing resident");
});

test("TLX hoists crack fwidth and MAT samples before the detail/live If (WGSL derivative_uniformity)", () => {
  const lit = read("js/render/three/tsl-lit.js");
  const at = lit.indexOf("const cr = abs(vnoise(wp.xz");
  const gate = lit.indexOf("If(matU.detail.greaterThan(0.0)", at);
  assert.ok(at > 0 && gate > at, "fwidth(cr) must be taken before the detail If");
  assert.match(lit.slice(at, gate + 40), /fwidth\(cr\)/);
  const nSamp = lit.indexOf("const nt = matNormalNode.sample(uv)");
  const nAfter = lit.indexOf("If(live.and(fade.greaterThan(0.005))", nSamp);
  assert.ok(nSamp > 0 && nAfter > nSamp, "MAT normal sample must sit before the live/fade If");
  const aSamp = lit.indexOf("const t = matAlbedoNode.sample(uv)");
  const aAfter = lit.indexOf("If(live.and(far.greaterThan(0.001))", aSamp);
  assert.ok(aSamp > 0 && aAfter > aSamp, "MAT albedo sample must sit before the live/far If");
});

test("TLX decal cache evicts without Material.dispose (three #33952)", () => {
  const fx = read("js/render/three/tsl-fx.js");
  const start = fx.indexOf("if (decalCache.size >= DECAL_CACHE_CAP)");
  const evict = fx.slice(start, fx.indexOf("m = fxMaterial({ doubleSided: true, key: \"tlx-fx-decal-\"", start));
  assert.match(evict, /decalCache\.delete\(k\)/);
  const code = evict.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(code, /\.dispose\s*\(/);
});

test("TLX decal programs share a material map reference, not the first car's texture node", () => {
  const fx = read("js/render/three/tsl-fx.js");
  assert.match(fx, /materialReference\("map", "texture"\)/);
  assert.match(fx, /m\.map = tex/);
  assert.match(fx, /const _decalGraph = \[null, null\]/);
  assert.doesNotMatch(fx, /const smp = texture\(tex\)/,
    "a per-texture node cannot sit behind the shared tlx-fx-decal program key");
});

test("a refused WGX/TLX create does not persist WEBGL2 over the user's pick", () => {
  const game = code("js/game.js");
  assert.match(game, /apex26\.gfxClaimFail/);
  assert.match(game, /armed\s*&&\s*!skipClaim\b/);
  // The claim-fail reload must READ THE SKIP BACK first: with sessionStorage
  // blocked, removing the probe + reloading replays the claim-and-die boot
  // forever (the probe was the only other escape). And it must reload at most
  // ONCE — a latch already set when the boot started means the previous
  // reload's GLX.init failed too, and reloading again loops forever
  // (measured 236 reloads/64 s under a Vulkan-only browser config).
  const latch = game.search(/if\s*\(\s*!_claimSkipped\s*\)/);
  assert.ok(latch > 0, "the reload is gated on the latch not already being set");
  const latchBody = game.slice(latch, latch + 400);
  assert.match(latchBody, /setItem\(\s*"apex26\.gfxClaimFail"\s*,\s*"1"\s*\)/);
  assert.match(latchBody, /skipped\s*=\s*sessionStorage\.getItem\(\s*"apex26\.gfxClaimFail"\s*\)\s*===\s*"1"/, "the skip is read back before the reload");
  const refused = game.search(/gfxClaimFail/);
  assert.ok(refused > 0);
  assert.match(game.slice(refused, refused + 3000), /removeItem\(\s*"apex26\.gfxBackendProbe"\s*\)/, "a refused create disarms the probe");
  assert.doesNotMatch(game, /create\(\)\s*refused[\s\S]{0,250}setItem\(\s*"apex26\.gfxBackend"\s*,\s*"webgl2"\s*\)/);
  const wgx = code("js/render/webgpu/wgx.js");
  assert.match(wgx, /device\.lost[\s\S]{0,600}_wgxEscalate\(/, "device.lost climbs the ladder through _wgxEscalate");
  assert.match(fnBody(wgx, "_wgxEscalate"), /apex26\.gfxClaimFail/, "the last rung surrenders the tab to GLX via the claim-fail latch");
  assert.doesNotMatch(wgx, /device\.lost[\s\S]{0,2200}setItem\(\s*"apex26\.gfxBackend"\s*,\s*"webgl2"\s*\)/);
  assert.match(wgx, /\bWGX_LITE\b/);
  assert.match(wgx, /\bIS_WEBKIT\b/);
  assert.match(wgx, /WGX_LITE\s*&&\s*format\s*===\s*"rgba16float"\s*\)\s*format\s*=\s*"bgra8unorm"/);
  assert.match(wgx, /_sceneProbeOn\s*=\s*!_outProbeOff\s*&&\s*!WGX_LITE\b/);
  // The loss ladder (full → lite → minimal → GLX, persisted in
  // apex26.gfxWgxLevel), the JS strike cap in begin()/present(), the
  // HEAL_SESSIONS step-down, the minimal rung's no-post/no-sky path and the
  // apex26.gfxBound label are all driven on the mock device by
  // tests/unit/webgpu-lifecycle.test.mjs ("device.lost climbs the ladder",
  // "…climbs to minimal", "minimal rung: no post targets…", "a JS throw in
  // begin() strikes out…", "clean sessions heal the ladder") — not repeated
  // here as source text.
  assert.match(wgx, /_allocFail\(\s*"createMesh"/, "lazy mesh creation on the render path degrades to inert, not a throw");
  assert.match(wgx, /_allocFail\(\s*"createChunkedMesh"/);
  // A hand re-pick of WEBGPU resets the ladder so the player can retry full:
  // BEHAVIOUR through the picker.
  const a = bootPicker({
    ls: { "apex26.gfxBackend": "three", "apex26.gfxWgxLevel": "2", "apex26.gfxWgxLite": "1", "apex26.gfxWgxFail": "device lost", "apex26.gfxWgxOk": "3" },
    ss: { "apex26.gfxClaimFail": "1" },
    gpu: {},
  });
  const sel = a.byId["pm-renderer"];
  sel.value = "webgpu";
  sel.dispatchEvent("change");
  assert.equal(a.ls.getItem("apex26.gfxBackend"), "webgpu");
  for (const k of ["apex26.gfxWgxLevel", "apex26.gfxWgxLite", "apex26.gfxWgxFail", "apex26.gfxWgxOk"]) {
    assert.equal(a.ls.getItem(k), null, `${k} must be cleared by a hand re-pick of WEBGPU`);
  }
  assert.equal(a.ss.getItem("apex26.gfxClaimFail"), null, "the session skip is cleared too");
});

test("RENDERER label names the live backend when WEBGPU fell back to GLX", () => {
  // BEHAVIOUR: the pick stays WEBGPU, the label says what actually paints.
  const a = bootPicker({ ls: { "apex26.gfxBackend": "webgpu" }, ss: { "apex26.gfxBound": "webgl2" }, gpu: {} });
  const sel = a.byId["pm-renderer"];
  assert.equal(sel.value, "webgpu", "the preference is still the player's pick");
  assert.equal(sel.options[2].textContent, "WEBGPU (WEBGL2)", "the live backend is named beside it");
  assert.equal(sel.options[0].textContent, "WEBGL2", "only the fallen-back pick carries the suffix");
  const b = bootPicker({ ls: { "apex26.gfxBackend": "webgpu" }, gpu: {} });
  assert.equal(b.byId["pm-renderer"].options[2].textContent, "WEBGPU", "no fallback, no suffix");
  assert.ok(a.winListeners.includes("apex-gfx-live"), "the label repaints when the backend announces itself");
});

test("TLX HDR accepts iOS half-float and a refused create records why", () => {
  const post = read("js/render/three/tlx-post.js");
  assert.match(post, /EXT_color_buffer_half_float/);
  assert.match(post, /EXT_color_buffer_float/);
  assert.doesNotMatch(post, /keep hdr=true \(WebGPU is always half-float\)/);
  const tlx = read("js/render/three/tlx.js");
  assert.match(tlx, /apex26\.gfxTlxFail/);
  assert.doesNotMatch(tlx, /isMobile\s*&&\s*!post\.hdrOk\(\s*\)/,
    "GLX keeps the 8-bit post chain when half-float is missing; TLX must too");
  assert.match(tlx, /TLX: present failed/);
  assert.match(tlx, /MeshBasicMaterial/);
  assert.match(tlx, /apex26\.gfxClaimFail/);
  // The third context loss in a tab surrenders to GLX (TLX has a floor below
  // it, unlike GLX) instead of freezing on the last frame with the label lying.
  assert.match(tlx, /context lost x/);
  const present = tlx.indexOf("present(opts) {");
  const presentEnd = tlx.indexOf("// debug — the __tlx tooling", present);
  const body = tlx.slice(present, presentEnd);
  assert.ok(present > 0 && presentEnd > present, "present() body found");
  assert.doesNotMatch(body, /post = null;\s*renderer\.setRenderTarget\(null\);\s*renderer\.render/);
  assert.match(read("js/render/three/tlx-shadow.js"), /TLX: shadow pass failed/);
});

test("TLX AO and god-ray blurs cannot share a node-program cache key", () => {
  const post = read("js/render/three/tsl-post.js");
  assert.match(post, /const blurAO = makeBlur\("tlx-post-blur-ao"\)/);
  assert.match(post, /const blurGR = makeBlur\("tlx-post-blur-godray"\)/);
  assert.doesNotMatch(post, /const blur(?:AO|GR) = makeBlur\(\)/,
    "same-shaped node materials still carry distinct texture-node bindings");
});

test("TLX material-map ownership keeps placeholders and reports pack state", () => {
  // Placeholders are always bound so nodes stay complete; materialMapState must
  // key off owned pack textures, and unload must dispose those without killing
  // the placeholders (GLX deleteTexture parity).
  const tlx = read("js/render/three/tlx.js");
  assert.match(tlx, /matPlaceAlbedo/);
  assert.match(tlx, /matOwnedAlbedo/);
  assert.match(tlx, /albedo: !!matOwnedAlbedo/);
  assert.doesNotMatch(tlx, /albedo: !!\(matMaps && matMaps\.albedo\)/);
  assert.match(tlx, /t\.dispose\(\)/);
  const wgx = read("js/render/webgpu/wgx.js");
  assert.match(wgx, /_matOwnedAlbedo/);
  assert.match(wgx, /matPlaceAlbedoView/);
  assert.match(wgx, /_releaseOwnedMatMaps/);
});

test("nextBackend / prevBackend wrap both ways around webgl2 → three → webgpu", () => {
  const src = read("js/game/gfx-quality.js");
  const ctx = vm.createContext({ window: {}, document: undefined, localStorage: undefined });
  seedLog(ctx);
  vm.runInContext(src, ctx, { filename: "js/game/gfx-quality.js" });
  const G = vm.runInContext("GfxQuality", ctx);
  assert.equal(G.nextBackend("webgl2"), "three");
  assert.equal(G.nextBackend("three"), "webgpu");
  assert.equal(G.nextBackend("webgpu"), "webgl2");
  assert.equal(G.prevBackend("webgl2"), "webgpu");
  assert.equal(G.prevBackend("webgpu"), "three");
  assert.equal(G.prevBackend("three"), "webgl2");
  assert.equal(G.backendLabel("three"), "THREE.JS");
  assert.equal(G.backendLabel("webgpu"), "WEBGPU");
});

function makeStorage(seed) {
  const m = new Map(Object.entries(seed || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _map: m,
  };
}

test("RESET RENDERER is injected next to #pm-renderer, not written into the shell", () => {
  // The injection itself (a <button> created and placed after #pm-renderer,
  // labelled RESET RENDERER) is driven below in "RESET RENDERER click wipes
  // storage, disarms the sentinel, and reloads"; this pins only that the
  // shell does not carry a static copy.
  assert.doesNotMatch(read("index.html"), /id="pm-renderer-reset"/);
});

test("clearRendererStorage drops backend crash flags and leaves GRAPHICS quality", () => {
  const src = read("js/game/gfx-quality.js");
  const ls = makeStorage({
    "apex26.gfxBackend": "three",
    "apex26.gfxBackendProbe": "three",
    "apex26.gfxWgxLevel": "2",
    "apex26.gfxWgxLite": "1",
    "apex26.gfxWgxOk": "0",
    "apex26.gfxWgxFail": "device lost",
    "apex26.gfxTlxFail": "present failed",
    "apex26.envProbeOff": "1",
    "apex26.perChunkOff": "1",
    "apex26.tlxForceGL": "0",
    "apex26.tlxViz": "lit",
    "apex26.wgxCapture": "1",
    "apex26.gfxHigh": "1",
    "apex26.uiScale": "110",
  });
  const ss = makeStorage({
    "apex26.gfxClaimFail": "1",
    "apex26.gfxBound": "webgl2",
    "apex26.ctxLostReloads": "2",
    "apex26.wgxCapture": "0",
    "apex26.tlxAutoGL": "1",
  });
  const ctx = vm.createContext({ window: {}, document: undefined, localStorage: ls, sessionStorage: ss });
  seedLog(ctx);
  vm.runInContext(src, ctx, { filename: "js/game/gfx-quality.js" });
  const G = vm.runInContext("GfxQuality", ctx);
  // Frozen deepEqual, not spot includes(): a round-6 audit found 7 of 12 keys
  // unasserted — a new crash latch omitted from the list would fail nothing
  // and then survive RESET RENDERER. Adding a key now REQUIRES updating this
  // frozen copy and saying what the key holds. apex26.gfxHigh stays out on
  // purpose: GRAPHICS quality is a player pref, not renderer crash state.
  assert.deepEqual(Array.from(G.RENDERER_LS_KEYS), [   // Array.from: vm arrays are another realm's Array
    "apex26.gfxBackend", "apex26.gfxBackendProbe",
    "apex26.gfxWgxLevel", "apex26.gfxWgxLite", "apex26.gfxWgxOk", "apex26.gfxWgxFail",
    "apex26.gfxTlxFail",
    "apex26.envProbeOff", "apex26.perChunkOff",
    "apex26.tlxForceGL", "apex26.tlxViz",
    "apex26.wgxCapture",
  ]);
  assert.deepEqual(Array.from(G.RENDERER_SS_KEYS), [
    "apex26.gfxClaimFail", "apex26.gfxBound", "apex26.ctxLostReloads",
    "apex26.wgxCapture", "apex26.tlxAutoGL",
  ]);
  assert.ok(!G.RENDERER_LS_KEYS.includes("apex26.gfxHigh"), "GRAPHICS quality is not renderer state");
  const removed = G.clearRendererStorage();
  assert.ok(removed.includes("apex26.gfxBackend"));
  assert.equal(ls.getItem("apex26.gfxBackend"), null);
  assert.equal(ls.getItem("apex26.gfxBackendProbe"), null);
  assert.equal(ls.getItem("apex26.gfxWgxLevel"), null);
  assert.equal(ls.getItem("apex26.gfxTlxFail"), null);
  assert.equal(ls.getItem("apex26.envProbeOff"), null);
  assert.equal(ls.getItem("apex26.perChunkOff"), null);
  assert.equal(ls.getItem("apex26.tlxForceGL"), null);
  assert.equal(ls.getItem("apex26.tlxViz"), null);
  assert.equal(ls.getItem("apex26.wgxCapture"), null);
  assert.equal(ss.getItem("apex26.wgxCapture"), null);
  assert.equal(ls.getItem("apex26.gfxHigh"), "1", "mobile GRAPHICS: ULTRA bit must survive");
  assert.equal(ls.getItem("apex26.uiScale"), "110", "unrelated settings must survive");
  assert.equal(ss.getItem("apex26.gfxClaimFail"), null);
  assert.equal(ss.getItem("apex26.gfxBound"), null);
  assert.equal(ss.getItem("apex26.ctxLostReloads"), null);
  assert.equal(ss.getItem("apex26.tlxAutoGL"), null);
  assert.equal(G.readBackend(), "webgl2");
});

test("blocked sessionStorage skips the opt-in so this tab never claims the canvas", () => {
  const game = code("js/game.js");
  const boot = game.slice(game.search(/let\s+skipClaim\s*=\s*false/), game.search(/const\s+PROBE_KEY\b/));
  assert.match(boot, /catch\s*\(\s*_?\w*\s*\)\s*\{\s*(?:skipClaim|_claimSkipped)\s*=\s*(?:(?:skipClaim|_claimSkipped)\s*=\s*)?true\b/,
    "a storage throw sets the skip (and the latch that the GLX.init failure path reads)");
  assert.doesNotMatch(boot, /try the opt-in as usual/);
});

test("RESET RENDERER click wipes storage, disarms the sentinel, and reloads", () => {
  const src = read("js/game/gfx-quality.js");
  const ls = makeStorage({ "apex26.gfxBackend": "webgpu", "apex26.gfxHigh": "0" });
  const ss = makeStorage({ "apex26.gfxClaimFail": "1" });
  const kids = [];
  const resetHost = {
    insertBefore(node, _ref) { kids.push(node); return node; },
  };
  const rendererBtn = { id: "pm-renderer", parentNode: resetHost, nextSibling: null };
  const gfxBtn = { id: "pm-gfx", textContent: "", hidden: true, onclick: null };
  const byId = { "pm-renderer": rendererBtn, "pm-gfx": gfxBtn };
  let reloaded = 0;
  let sentinel = true;
  const timers = [];
  const ctx = vm.createContext({
    window: { addEventListener() {} },
    document: {
      getElementById: (id) => byId[id] || null,
      createElement: (tag) => {
        const el = { tagName: tag, id: "", textContent: "", title: "", onclick: null };
        if (tag === "button") {
          Object.defineProperty(el, "id", {
            get() { return this._id || ""; },
            set(v) { this._id = v; byId[v] = this; },
          });
        }
        return el;
      },
      readyState: "complete",
      addEventListener() {},
    },
    localStorage: ls,
    sessionStorage: ss,
    location: { reload() { reloaded += 1; } },
    setTimeout: (fn) => { timers.push(fn); return 1; },
    PerfGov: { setUserTier() {}, sentinelArm(on) { sentinel = !!on; } },
    GameStore: { store: { get() { return null; }, set() {} } },
    GLX: { isMobile: true },
  });
  seedLog(ctx);
  vm.runInContext(src, ctx, { filename: "js/game/gfx-quality.js" });
  const G = vm.runInContext("GfxQuality", ctx);
  G.init();
  const btn = byId["pm-renderer-reset"];
  assert.ok(btn, "reset button was injected");
  assert.equal(btn.textContent, "RESET RENDERER");
  assert.equal(kids[0], btn);
  btn.onclick();
  assert.equal(ls.getItem("apex26.gfxBackend"), null);
  assert.equal(ss.getItem("apex26.gfxClaimFail"), null);
  assert.equal(ls.getItem("apex26.gfxHigh"), "0");
  assert.equal(sentinel, false, "settings reload must not count as a crash strike");
  assert.match(btn.textContent, /RELOADING/);
  assert.equal(reloaded, 0);
  timers.forEach((fn) => fn());
  assert.equal(reloaded, 1);
});

test("GLX pins the per-chunk uploadLightSet revert (arity 3)", () => {
  // Arity 3 is the DECISION, not an oversight: the 6-arg tail-light forwarding
  // was reverted pending a crash repro (see the decision record above
  // uploadLightSet in glx.js core). This canary used to pin the 6-arg form —
  // it was added with the fix and survived the revert being lost in the
  // build-1496 squash merge. Re-land the forwarding WITH a repro, and flip
  // this regex in the same commit. (The lost-context no-ops of draw() and
  // present() are behaviour in "GLX create* / draw* fail closed" above.)
  const glx = code("js/render/glx.js");
  assert.match(glx, /uploadLightSet:\s*\(\s*L\s*,\s*idx\s*,\s*n\s*\)\s*=>\s*uploadLightSet\(\s*L\s*,\s*idx\s*,\s*n\s*\)/);
});

test("the GPU-census gate scopes hardware expectations, and only those", () => {
  // Two checks are hardware-only ON PURPOSE: a software image may legitimately
  // fail to bring a backend up, and failing the job for that is noise. The rest
  // must stay unconditional — a real GPU error, a run that did not finish, or a
  // missing artifact is a defect on ANY image. Driven by EXECUTING the Verdict
  // script against fixtures (verdictScript / runVerdict below), so the split
  // cannot quietly spread. docs/PERF-FINDINGS.md 2f.
  const script = verdictScript();
  const hw = { anyHardware: true, runs: [] }, sw = { anyHardware: false, runs: [] };
  const legs = (over = {}) => ({ webgpu: tlxLegJson(), webgl2: tlxLegJson(), glx: glxLegJson(), wgx: wgxLegJson(), ...over });
  // Hardware-only: a missing gpuErrors count, a failed gfx read, a software adapter.
  let r = runVerdict(script, { census: hw, legs: legs({ webgl2: tlxLegJson({ gpuErrors: null }) }) });
  assert.equal(r.code, 1, `hardware + no gpuErrors count must fail:\n${r.out}`);
  r = runVerdict(script, { census: sw, legs: legs({ webgl2: tlxLegJson({ gpuErrors: null }) }) });
  assert.equal(r.code, 0, `software + no gpuErrors count is noise, not a failure:\n${r.out}`);
  r = runVerdict(script, { census: hw, legs: legs({ glx: { ...glxLegJson(), gfxReadFailed: "boom" } }) });
  assert.equal(r.code, 1, "hardware + gfxReadFailed must fail");
  r = runVerdict(script, { census: sw, legs: legs({ glx: { ...glxLegJson(), gfxReadFailed: "boom" } }) });
  assert.equal(r.code, 0, "software + gfxReadFailed passes");
  r = runVerdict(script, { census: hw, legs: legs({ webgpu: tlxLegJson({ backendState: { api: "webgpu", softAdapter: true, headless: false } }) }) });
  assert.equal(r.code, 1, "a software adapter on a hardware image is the defect the census exists to catch");
  r = runVerdict(script, { census: sw, legs: legs({ webgpu: tlxLegJson({ backendState: { api: "webgpu", softAdapter: true, headless: false } }) }) });
  assert.equal(r.code, 0, "a software adapter on a software image is expected");
  // …and these must NOT be scoped, or the gate stops gating.
  for (const census of [hw, sw]) {
    r = runVerdict(script, { census, legs: legs({ glx: { ...glxLegJson(), ok: false, phase: "boot" } }) });
    assert.equal(r.code, 1, "a run that did not finish must fail on every image");
    r = runVerdict(script, { census, legs: legs({ glx: glxLegJson({ gpuErrors: 3, gpuFirstError: "INVALID_OPERATION" }) }) });
    assert.equal(r.code, 1, "a real GPU error must fail on every image");
    const missing = legs(); delete missing.glx;
    r = runVerdict(script, { census, legs: missing });
    assert.equal(r.code, 1, "a missing leg artifact must fail on every image");
  }
  // The reason a leg is empty must always be PRINTED, even where it is not
  // blocking — that is the whole point of 2f.
  r = runVerdict(script, { census: sw, legs: legs({ webgpu: { ...tlxLegJson(), error: "launch failed", gfx: undefined } }) });
  assert.match(r.out, /launch failed/, "a leg's error is printed even when it does not block");
  const wf = read(".github/workflows/gpu-census.yml");
  assert.match(wf, /rows\.push\(\s*`\$\{" "\.repeat\(8\)\}gfx:/);
});

test("GLX exports a real gpuErrors counter and the workflow fails on a missing one", () => {
  // The real-GPU gate checked `(gfx.gpuErrors || 0) > 0` while ONLY WGX defined
  // gpuErrors, so on the GLX leg it read null and passed vacuously from the day
  // that leg was added (PERF-FINDINGS 2e). Both halves are pinned: the GLX
  // counter as BEHAVIOUR on the mock, the Verdict's null handling by executing
  // it (above), plus the banned `|| 0` shape as a lint.
  const h = bootGlx();
  assert.equal(h.GLX.gpuErrors(), 0);
  assert.equal(h.GLX.gpuFirstError(), null);
  let pending = [1282, 1281];   // INVALID_OPERATION, INVALID_VALUE
  h.answers.getError = () => (pending.length ? pending.shift() : 0);
  h.GLX.begin(h.frame());
  assert.equal(h.GLX.gpuErrors(), 0, "the counter is drained at present(), not mid-frame");
  h.GLX.present({});
  assert.equal(h.GLX.gpuErrors(), 2, "every queued GL error is counted once per present");
  assert.ok(h.GLX.gpuFirstError(), "the first error is kept for the report");
  h.GLX.begin(h.frame()); h.GLX.present({});
  assert.equal(h.GLX.gpuErrors(), 2, "a clean present adds nothing");
  const wf = read(".github/workflows/gpu-census.yml");
  assert.doesNotMatch(wf, /if\s*\(\s*\(\s*gfx\.gpuErrors\s*\|\|\s*0\s*\)\s*>\s*0\s*\)/,
    "the || 0 form treats an absent counter as zero — that was the bug");
});

// The Verdict step is a `node -e` script embedded in YAML, so nothing ever ran
// it — every guard on it was a regex over its SOURCE. That is how three
// vacuous clauses lived in it at once. Lift the real script out and execute it
// against fixtures, so the tests below are about behaviour, not spelling.
function verdictScript() {
  const wf = read(".github/workflows/gpu-census.yml");
  const at = wf.indexOf("Verdict — fail the job on what the game reported");
  assert.ok(at > 0, "the Verdict step is gone from gpu-census.yml");
  const open = wf.indexOf("node -e '", at);
  assert.ok(open > at, "the Verdict step no longer runs an inline node script");
  const lines = wf.slice(wf.indexOf("\n", open) + 1).split("\n");
  const end = lines.findIndex((l) => l.trim() === "'");
  assert.ok(end > 0, "could not find the end of the inline script");
  const body = lines.slice(0, end).join("\n");
  // A silent empty extraction would make every case below pass vacuously —
  // the exact failure this whole round is about. Refuse to hand one back.
  assert.ok(body.length > 2000, `extracted only ${body.length} chars of Verdict script`);
  assert.match(body, /const bad = \[\];/, "extracted text is not the Verdict script");
  return body;
}

// Fixtures shaped like what tools/gpu-game-check.mjs actually writes: it reads
// backendState/envState ONLY when g.__tlx exists (gpu-game-check.mjs 205-207),
// so the GLX leg legitimately carries neither.
const tlxLegJson = (gfxOver = {}) => ({
  phase: "done", ok: true,
  gfx: {
    glx: true, gpuErrors: 0, gpuFirstError: null,
    backendState: { api: "webgpu", softAdapter: false, headless: false },
    envState: { on: true, face: 6, ready: true, blank: false, fail: 0, failMsg: "", gaveUp: false },
    ...gfxOver,
  },
  frame: { meanLuma: 0.4 },
});
const glxLegJson = (gfxOver = {}) => ({
  phase: "done", ok: true,
  gfx: { glx: true, gpuErrors: 0, gpuFirstError: null, ...gfxOver },
  frame: { meanLuma: 0.4 },
});
// The native WGX leg (2026-09-02): gpu-game-check reports wgx (GLX.softPresent
// exists — WGX bound), wgxSoftPresent and headlessUa; no TLX env/backend state.
const wgxLegJson = (gfxOver = {}) => ({
  phase: "done", ok: true,
  gfx: { glx: true, gpuErrors: 0, gpuFirstError: null, wgx: true, wgxSoftPresent: true, headlessUa: true, ...gfxOver },
  frame: { meanLuma: 0.4 },
});

function runVerdict(script, { census, legs }) {
  const image = "macos-latest";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-verdict-"));
  try {
    if (census !== undefined) fs.writeFileSync(path.join(dir, `census-${image}.json`), JSON.stringify(census));
    for (const [leg, json] of Object.entries(legs)) {
      fs.writeFileSync(path.join(dir, `game-${leg}-${image}.json`), JSON.stringify(json));
    }
    const r = spawnSync(process.execPath, ["-e", script], {
      cwd: dir, encoding: "utf8",
      env: { ...process.env, IMAGE: image, GITHUB_STEP_SUMMARY: path.join(dir, "summary.md") },
    });
    return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test("gpu-game-check reports appearance, and can say when it could not measure it", () => {
  // The census printed `meanLuma=n/a` on EVERY leg of every image because this
  // tool never wrote out.frame — the string "frame" did not appear in the file
  // at all. The gate does not block on appearance (a brightness floor goes
  // flaky and then gets widened, which AGENTS.md forbids), but "reported for a
  // human" was untrue: there was nothing to report. Both halves are pinned,
  // because writing the field WITHOUT the absence path just recreates a
  // silently-empty column. docs/PERF-FINDINGS.md 2l.
  const ggc = read("tools/gpu-game-check.mjs");
  assert.match(ggc, /out\.frame = n\s*\?/, "the tool must write out.frame");
  assert.match(ggc, /meanLuma: \+\(sum \/ n\)\.toFixed\(1\)/);
  assert.match(ggc, /out\.frameReadFailed = /,
    "an appearance read that failed must be NAMED, not left as an empty column");
  assert.match(ggc, /await import\("sharp"\)/,
    "sharp is loaded dynamically so a missing binary degrades to frameReadFailed");

  const wf = read(".github/workflows/gpu-census.yml");
  assert.match(wf, /if \(g\.frameReadFailed\) rows\.push/,
    "the Verdict must print WHY appearance is missing, like the gfx:/ovl: rows");
});

test("gpu-game-check's finally can actually reach the console buffer", () => {
  // `const console_ = []` was declared INSIDE the try while the finally read
  // it — sibling scopes, so the finally threw ReferenceError on EVERY run,
  // success or failure. Everything after that line was dead: out.console (the
  // diagnostic lines a previous round moved into the finally precisely so a
  // FAILING run would keep them), out.root (added to name the Windows path bug
  // — never once set on a real run), the bounded browser/server teardown, and
  // the final process.exit, so the tool always exited non-zero even on ok:true.
  // `continue-on-error: true` on all four census steps swallowed the exit code
  // and checkpoint() had already written the JSON, so nothing looked wrong.
  // Measured after the fix: exit 0, root set, 7 console lines. PERF-FINDINGS 2l.
  const ggc = read("tools/gpu-game-check.mjs");
  const decl = ggc.indexOf("const console_ = [];");
  const tryAt = ggc.indexOf("\ntry {");
  const useAt = ggc.indexOf("out.console = console_");
  assert.ok(decl > -1, "the console buffer declaration is gone");
  assert.ok(tryAt > -1 && useAt > -1);
  assert.ok(decl < tryAt,
    "console_ must be declared ABOVE the try, or the finally cannot see it " +
    `(decl at ${decl}, try at ${tryAt})`);
  assert.ok(useAt > tryAt, "sanity: the read really is inside/after the try");
  // A declaration at column 0 is top-level; an indented one is inside a block.
  assert.match(ggc, /\nconst console_ = \[\];/,
    "console_ must be a TOP-LEVEL declaration, not indented inside the try");
});

test("the GPU gate passes a hardware run whose GLX leg reports no env probe", () => {
  // THE FALSE-FAILURE CASE. Making an absent env count fail on hardware is
  // right for the two TLX legs and wrong for GLX, which has no env probe to
  // report at all — an unscoped absence check would have failed macOS forever
  // for a leg behaving exactly as designed. This is the counter-test that
  // keeps the fix below honest; without it "fail on absence" looks free.
  const r = runVerdict(verdictScript(), {
    census: { anyHardware: true, runs: [] },
    legs: { webgpu: tlxLegJson(), webgl2: tlxLegJson(), glx: glxLegJson(), wgx: wgxLegJson() },
  });
  assert.equal(r.code, 0, `a healthy hardware run must pass:\n${r.out}`);
});

test("the GPU gate fails a census that measured nothing instead of calling it software", () => {
  // anyHardware was `runs.some(...)`, so four failed launches produced false —
  // and false is what switches OFF the hardware-only clauses. A census that
  // measured nothing therefore DOWNGRADED this gate to a software gate and
  // reported success. Tri-state; null must fail. docs/PERF-FINDINGS.md 2j.
  const script = verdictScript();
  const legs = { webgpu: tlxLegJson(), webgl2: tlxLegJson(), glx: glxLegJson(), wgx: wgxLegJson() };

  const nulled = runVerdict(script, { census: { anyHardware: null, runs: [] }, legs });
  assert.equal(nulled.code, 1, `a null census must fail the job:\n${nulled.out}`);
  assert.match(nulled.out, /measured NOTHING/);

  const missing = runVerdict(script, { census: undefined, legs });
  assert.equal(missing.code, 1, `an unreadable census must fail the job:\n${missing.out}`);

  // …and a census that really did measure a software image still passes, or
  // the fix has just made every software run red.
  const soft = runVerdict(script, {
    census: { anyHardware: false, runs: [] },
    legs: { webgpu: tlxLegJson({ envState: undefined, gpuErrors: null }), webgl2: tlxLegJson(), glx: glxLegJson({ gpuErrors: null }), wgx: wgxLegJson({ wgx: false, gpuErrors: null }) },
  });
  assert.equal(soft.code, 0, `a measured software image must still pass:\n${soft.out}`);
});

test("the GPU gate holds the native WGX leg to bind + swapchain, but only a HEADED run to the swapchain", () => {
  // Run 19 (2026-09-02, macos-latest) was the first census that ran WGX at all:
  // bound, 0 GPU errors, the brightest leg — and soft-presenting, because WGX
  // sniffs a HeadlessChrome UA as software by design. That is expected on a
  // headless runner and a regression on a headed one; a fallback to GLX is a
  // regression on any hardware run.
  const script = verdictScript();
  const hw = { anyHardware: true, runs: [] }, sw = { anyHardware: false, runs: [] };
  const legs = (wgx) => ({ webgpu: tlxLegJson(), webgl2: tlxLegJson(), glx: glxLegJson(), wgx });
  let r = runVerdict(script, { census: hw, legs: legs(wgxLegJson()) });
  assert.equal(r.code, 0, `headless hardware + soft-present is the documented shape:\n${r.out}`);
  assert.match(r.out, /expected: WGX blits under a headless UA by design/);
  r = runVerdict(script, { census: hw, legs: legs(wgxLegJson({ headlessUa: false })) });
  assert.equal(r.code, 1, "HEADED hardware + soft-present must fail");
  assert.match(r.out, /WGX is soft-presenting/);
  r = runVerdict(script, { census: hw, legs: legs(wgxLegJson({ headlessUa: false, wgxSoftPresent: false })) });
  assert.equal(r.code, 0, `headed hardware on the swapchain passes:\n${r.out}`);
  r = runVerdict(script, { census: hw, legs: legs(wgxLegJson({ wgx: false })) });
  assert.equal(r.code, 1, "hardware + WGX not bound must fail");
  assert.match(r.out, /WGX did not bind/);
  r = runVerdict(script, { census: sw, legs: legs(wgxLegJson({ wgx: false, gpuErrors: null })) });
  assert.equal(r.code, 0, `a software image that cannot bring WGX up is noise:\n${r.out}`);
  r = runVerdict(script, { census: hw, legs: { webgpu: tlxLegJson(), webgl2: tlxLegJson(), glx: glxLegJson() } });
  assert.equal(r.code, 1, "a missing wgx artifact must fail like any other missing leg");
});

test("the GPU gate fails a hardware TLX leg that stopped reporting an env count", () => {
  // `(env.fail || 0) > 0` was the SAME banned shape as the gpuErrors fix twelve
  // lines above it in the same file, on the same object: a build that stops
  // exporting envState().fail read as clean. Scoped to the TLX legs, which are
  // `--backend three` by construction and must bring an env probe with them —
  // so a TLX leg that fell back to GLX fails here too, which is the point.
  const script = verdictScript();
  const gone = runVerdict(script, {
    census: { anyHardware: true, runs: [] },
    legs: { webgpu: tlxLegJson({ envState: undefined }), webgl2: tlxLegJson(), glx: glxLegJson() },
  });
  assert.equal(gone.code, 1, `a TLX leg with no env count must fail on hardware:\n${gone.out}`);
  assert.match(gone.out, /webgpu: NO env-probe fail count/);

  // The count itself still gates, on every image.
  const failed = runVerdict(script, {
    census: { anyHardware: true, runs: [] },
    legs: { webgpu: tlxLegJson({ envState: { fail: 81, failMsg: "boom", gaveUp: false } }), webgl2: tlxLegJson(), glx: glxLegJson() },
  });
  assert.equal(failed.code, 1);
  assert.match(failed.out, /81 env-probe faces FAILED/);

  // Both banned shapes pinned out of the source, so neither can return quietly.
  const wf = read(".github/workflows/gpu-census.yml");
  assert.doesNotMatch(wf, /if \(\(env\.fail \|\| 0\) > 0\)/,
    "the || 0 form treats an absent env counter as zero — that was the bug");
  assert.doesNotMatch(wf, /const hardware = !!\(census && census\.anyHardware\);/,
    "coercing anyHardware collapses 'measured no hardware' into 'measured nothing'");
  assert.match(wf, /census\.anyHardware === true/);
});

test("the instancing gate is declared through the cache, never bracketed per draw", () => {
  // uInstanced was 54.8 uniform1f/frame for a value that changes 3.1 times: the
  // 1/0 bracket around each instanced draw alternates, so a redundancy cache
  // collapses none of it (PERF-FINDINGS 2e). litMaterial declares the kind
  // instead — BEHAVIOUR: consecutive draws of one kind upload nothing.
  const h = bootGlx();
  const tri = { pos: [0, 0, 0, 1, 0, 0, 0, 1, 0], nrm: [0, 1, 0, 0, 1, 0, 0, 1, 0], col: [1, 1, 1, 1, 1, 1, 1, 1, 1], idx: [0, 1, 2] };
  const mesh = h.GLX.createMesh(tri);
  const batch = h.GLX.createInstancedBatch(tri, new Float32Array(32), null, null);
  const model = new Float32Array(16); model[0] = model[5] = model[10] = model[15] = 1;
  const instUploads = () => h.calls.filter((c) => c[0] === "uniform1f" && c[1][0].name === "uInstanced").map((c) => c[1][1]);
  h.GLX.begin(h.frame());
  h.reset();
  h.GLX.draw(mesh, model, {}); h.GLX.draw(mesh, model, {});
  h.GLX.drawInstanced(batch, {}); h.GLX.drawInstanced(batch, {}); h.GLX.drawInstanced(batch, {});
  h.GLX.draw(mesh, model, {});
  assert.deepEqual(instUploads(), [0, 1, 0], "one upload per KIND transition — never a 1/0 bracket per instanced draw");
  assert.equal(h.count("useProgram"), 0, "the lit program stays bound across the run — no rebind per draw");
  // Source lints that the behaviour above cannot see: a raw write beside the
  // cache would desync it, and a lit draw bound outside litMaterial would skip
  // the declaration.
  const glx = code("js/render/glx.js");
  assert.doesNotMatch(glx, /gl\.uniform1f\(\s*litU\.uInstanced/, "uInstanced must go through uf1, not a raw uniform1f");
  const binds = glx.match(/useProg\(\s*litProg\s*\)/g) || [];
  assert.equal(binds.length, 2, "a new useProg(litProg) site must also declare uInstanced — see PERF-FINDINGS 2e");
});

test("uModel goes through the redundancy cache, not a raw upload", () => {
  // PERF-FINDINGS 2h: uModel was 103.2 uploads/frame for 50.3 distinct values,
  // because drawChunked calls litMaterial once per chunk RUN and every run of
  // one mesh shares that mesh's matrix. BEHAVIOUR: an equal matrix skips.
  const h = bootGlx();
  const tri = { pos: [0, 0, 0, 1, 0, 0, 0, 1, 0], nrm: [0, 1, 0, 0, 1, 0, 0, 1, 0], col: [1, 1, 1, 1, 1, 1, 1, 1, 1], idx: [0, 1, 2] };
  const mesh = h.GLX.createMesh(tri);
  const model = new Float32Array(16); model[0] = model[5] = model[10] = model[15] = 1;
  const uploads = () => h.count("uniformMatrix4fv", (a) => a[0].name === "uModel");
  h.GLX.begin(h.frame());
  h.reset();
  h.GLX.draw(mesh, model, {}); h.GLX.draw(mesh, model, {}); h.GLX.draw(mesh, model, {});
  assert.equal(uploads(), 1, "three draws of one matrix upload it once");
  // The cache must COPY. Callers hand in scratch matrices they mutate in place
  // (game.js _wheelWorld/_ringWorld, DebrisWorld _mat); retaining the reference
  // would compare a value against itself and silently skip a real change —
  // a wrong TRANSFORM, which no call counter would catch.
  h.reset();
  model[12] = 5; h.GLX.draw(mesh, model, {});
  model[12] = 9; h.GLX.draw(mesh, model, {});
  assert.equal(uploads(), 2, "the same array mutated in place re-uploads every time it changes");
  h.reset();
  h.GLX.draw(mesh, new Float32Array(model), {});
  assert.equal(uploads(), 0, "an equal COPY is a hit — the cache compares values, not references");
  assert.doesNotMatch(code("js/render/glx.js"), /gl\.uniformMatrix4fv\(\s*litU\.uModel/,
    "uModel must go through ufM4, not a raw uniformMatrix4fv");
});

test("updateInstances clears the cull snapshots it did not produce", () => {
  // cullInstances memoises on _cullPlanes (the frustum that physically wrote the
  // resident bytes) and _cellKeyN (the surviving cell set), and a hit SKIPS the
  // re-upload. updateInstances writes bytes produced by no frustum at all, so
  // leaving either snapshot standing lets a later cullInstances hit its cache
  // and draw this pack as though it were that frustum's. PERF-FINDINGS 2h.
  const h = bootGlx();
  const tri = { pos: [0, 0, 0, 1, 0, 0, 0, 1, 0], nrm: [0, 1, 0, 0, 1, 0, 0, 1, 0], col: [1, 1, 1, 1, 1, 1, 1, 1, 1], idx: [0, 1, 2] };
  const mats = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 100, 0, 0, 1]);
  const batch = h.GLX.createInstancedBatch(tri, mats, null, { cellSize: 50 });
  const planes = (d) => Array.from({ length: 6 }, () => [0, 0, 0, d]);
  h.reset();
  assert.equal(h.GLX.cullInstances(batch, planes(1e6)), 2);
  assert.equal(h.count("bufferSubData"), 1, "a fresh frustum packs and uploads");
  h.reset();
  assert.equal(h.GLX.cullInstances(batch, planes(1e6)), 2);
  assert.equal(h.count("bufferSubData"), 0, "the same frustum is a hit: no re-upload");
  // Now hand the batch a caller-packed set (the debris pools' path)…
  h.reset();
  assert.equal(h.GLX.updateInstances(batch, new Float32Array(32), 1), 1);
  assert.equal(batch.visible, 1);
  assert.equal(h.count("bufferSubData", (a) => a[4] === 16), 1, "one instance (16 floats) is uploaded");
  assert.equal(batch._cullPlanes, null, "updateInstances must invalidate the frustum snapshot");
  assert.equal(batch._cellKeyN, -1, "updateInstances must invalidate the cell-set snapshot");
  // …so the next cull with the OLD frustum cannot claim the resident bytes.
  h.reset();
  assert.equal(h.GLX.cullInstances(batch, planes(1e6)), 2);
  assert.equal(h.count("bufferSubData"), 1, "the frustum re-packs over the caller's bytes instead of hitting a stale cache");
  assert.equal(typeof h.GLX.updateInstances, "function", "updateInstances is exported");
});

test("the debris pools instance behind a capability read, with the loop as fallback", () => {
  // Four per-body loops reaching 98 draws at desktop caps — and 17 every frame
  // of every lap from cones alone, which have no liveness test (PERF-FINDINGS
  // 2h). GLX ships updateInstances; WGX and TLX have not been ported and MUST
  // keep the per-body path rather than silently drawing nothing.
  const dw = code("js/game/debrisworld.js");
  assert.match(dw, /gfx\.updateInstances\(/);
  assert.match(dw, /gfx\.drawInstanced\(/);
  assert.match(dw, /!gfx\.createInstancedBatch\s*\|\|\s*!gfx\.updateInstances\s*\|\|\s*!gfx\.drawInstanced/,
    "the capability read must test every method the instanced path calls");
  assert.match(dw, /for\s*\(\s*const\s+\w+\s+of\s+list\s*\)\s*if\s*\(\s*!liveOnly\s*\|\|\s*\w+\.live\s*\)\s*drawBody\(/,
    "the per-body fallback must survive for backends without updateInstances");
  // Both paths must build a pose the same way, or a backend switch moves debris.
  assert.equal((dw.match(/function\s+packBody\s*\(/g) || []).length, 1);
  assert.match(fnBody(dw, "drawBody"), /packBody\(/, "drawBody must share packBody, not carry a second copy of the quaternion maths");
});

test("the interleaved uLight[] lanes agree between glx.js and shaders/lit.js", () => {
  // ONE uniform4fv per chunk instead of four (PERF-FINDINGS 2d) only works if
  // both halves agree on the stride-16 lane order. A swapped lane keeps the GL
  // CALL COUNTS byte-identical and the render statistically indistinguishable
  // on a coarse metric — it moves or recolours lamp pools, which no counter
  // and no unit test would catch. This is the guard for that.
  const glx = code("js/render/glx.js");
  const lit = code("js/render/shaders/lit.js");

  // The four arrays must be GONE from both halves, or a stale reader survives.
  for (const n of ["uLightA", "uLightB", "uLightC", "uLightD"]) {
    assert.doesNotMatch(glx, new RegExp(n), `glx.js still references ${n}`);
    assert.doesNotMatch(lit, new RegExp(n), `lit.js still references ${n}`);
  }

  // Shader side: one array, 4 vec4s per light, read at li+0..3 off i*4.
  assert.match(lit, /uniform\s+vec4\s+uLight\s*\[\s*MAX_LIGHTS\s*\*\s*4\s*\]\s*;/);
  assert.match(lit, /int\s+li\s*=\s*i\s*\*\s*4\s*;/);
  assert.match(lit, /vec4\s+la\s*=\s*uLight\[\s*li\s*\]\s*,\s*lb\s*=\s*uLight\[\s*li\s*\+\s*1\s*\]\s*,\s*lc\s*=\s*uLight\[\s*li\s*\+\s*2\s*\]\s*;/);
  assert.match(lit, /smoothstep\(\s*uLight\[\s*li\s*\+\s*3\s*\]\.x\s*,/);

  // JS side: BEHAVIOUR. One stride-15 light record through begin() lands in
  // the uniform4fv payload at exactly the lanes the shader reads:
  //   +0 la = pos.xyz | radius   +1 lb = rgb | bleed
  //   +2 lc = aim.xyz | cosInner +3 x = cosOuter
  const h = bootGlx();
  const rec = [1, 2, 3, /*rgb*/ 4, 5, 6, /*radius*/ 7, /*aim*/ 8, 9, 10, /*cosInner*/ 11, /*cosOuter*/ 12, /*bleed*/ 13, 14, 15];
  h.GLX.begin(h.frame({ lights: rec }));
  const ups = h.calls.filter((c) => c[0] === "uniform4fv" && c[1][0].name === "uLight[0]");
  assert.equal(ups.length, 1, "expected exactly one uLight upload per begin()");
  const [, L4, off, len] = ups[0][1];
  assert.equal(off, 0);
  assert.equal(len, 16, "sized in whole lights: nL * 16 floats");
  assert.deepEqual(Array.from(L4.subarray(0, 16)), [1, 2, 3, 7, 4, 5, 6, 13, 8, 9, 10, 11, 12, 0, 0, 0],
    "lane +0 pos|radius, +1 rgb|bleed, +2 aim|cosInner, +3 cosOuter|pad");
  assert.equal(h.count("uniform1i", (a) => a[0].name === "uNumLights" && a[1] === 1), 1, "the count is uploaded once for one light");
  h.reset();
  h.GLX.begin(h.frame({ lights: rec.concat(rec) }));
  const two = h.calls.find((c) => c[0] === "uniform4fv" && c[1][0].name === "uLight[0]");
  assert.equal(two[1][3], 32, "two lights → 32 floats");
});

test("WGX sky ports GLX overcast grey-shift, horizon bank, and azimuthal variation", () => {
  const sky = read("js/render/webgpu/wgsl-chunks.js");
  assert.match(sky, /nightLid/);
  assert.match(sky, /greyZ/);
  assert.match(sky, /bankThresh/);
  assert.match(sky, /atan2\(dir\.z,\s*dir\.x\)/);
  console.log("[gfx-canary] checking WGX sky night-corona gate: wgsl-chunks.js");
  assert.match(sky, /if \(nightSky < 0\.5\)/,
    "night corona/disc must skip (GLX SKY_FS) — do not mul-to-zero");
  assert.doesNotMatch(sky, /Deliberately reduced vs GLX SKY_FS/);
});

test("TLX sky gates night corona and the day-band atan like GLX", () => {
  console.log("[gfx-canary] checking TLX sky night-corona + day-band gate: tsl-sky.js");
  const sky = read("js/render/three/tsl-sky.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(sky, /If\(nightSky\.lessThan\(0\.5\)/,
    "night corona/disc must skip (GLX SKY_FS) — do not mul-to-zero");
  assert.match(sky, /If\(daytime\.greaterThan\(0\.0\)/,
    "day-band atan+vnoise must skip when daytime is 0");
  console.log("[gfx-canary] TLX sky gates: OK");
});

test("TLX shadow cull packs CPU-side without uploading the lit InstancedMesh", () => {
  console.log("[gfx-canary] checking TLX shadow cull upload:false: tlx.js");
  const tlx = read("js/render/three/tlx.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const at = tlx.indexOf("function cullInstances");
  console.log("[gfx-canary] cullInstances offset in tlx.js:", at);
  assert.notEqual(at, -1, "cullInstances moved");
  const body = tlx.slice(at, at + 3600);
  assert.match(body, /opts && opts\.upload === false/,
    "shadow path must be able to skip the lit imesh setMatrixAt walk");
  console.log("[gfx-canary] checking TLX shadow cull upload:false call site: game.js");
  const game = read("js/game.js");
  assert.match(game, /cullInstances\([^)]*planes,\s*\{\s*upload:\s*false\s*\}\)/,
    "sun/lamp prop-shadow must pass upload:false");
  console.log("[gfx-canary] TLX shadow cull upload:false: OK");
});

test("WGX phone post targets use the slim GLX-equivalent formats", () => {
  const wgx = read("js/render/webgpu/wgx.js");
  assert.match(wgx, /SSAO_FORMAT\s*=\s*"r8unorm"/);
  assert.match(wgx, /POST_HDR_FORMAT\s*=\s*"rg11b10ufloat"/);
  // Blur pipelines use an explicit dynamic-offset layout (not fsPipe) so H/V
  // passes do not share one writeBuffer slot before submit.
  assert.match(wgx, /pBlurHDR\s*=\s*blurPipe\(POST_HDR_FORMAT\)/);
  assert.match(wgx, /pBlur\s*=\s*blurPipe\(SSAO_FORMAT\)/);
});

test("TLX present() records gfxBound when a fallback still paints", () => {
  const tlx = read("js/render/three/tlx.js");
  const persist = tlx.slice(tlx.indexOf("const persistFail"), tlx.indexOf("const paintCanvas"));
  assert.match(persist, /apex26\.gfxBound/);
});

function makePickerDom(byId, hostKids) {
  const makeEl = (tag) => {
    const kids = [];
    const el = {
      tagName: String(tag).toUpperCase(),
      textContent: "",
      title: "",
      type: "",
      value: "",
      hidden: false,
      onclick: null,
      parentNode: null,
      nextSibling: null,
      children: kids,
      options: String(tag).toUpperCase() === "SELECT" ? kids : undefined,
      _listeners: {},
      setAttribute() {},
      appendChild(c) { kids.push(c); c.parentNode = this; return c; },
      addEventListener(type, fn) {
        (this._listeners[type] || (this._listeners[type] = [])).push(fn);
      },
      dispatchEvent(type) {
        const list = this._listeners[type] || [];
        for (let i = 0; i < list.length; i++) list[i]();
      },
      replaceWith(node) {
        const host = this.parentNode;
        if (host && host.children) {
          const i = host.children.indexOf(this);
          if (i >= 0) host.children[i] = node;
        }
        node.parentNode = host;
        node.nextSibling = this.nextSibling;
        if (this._id && byId[this._id] === this) delete byId[this._id];
      },
    };
    Object.defineProperty(el, "id", {
      get() { return this._id || ""; },
      set(v) {
        if (this._id && byId[this._id] === this) delete byId[this._id];
        this._id = v;
        if (v) byId[v] = this;
      },
    });
    return el;
  };
  const host = {
    children: hostKids,
    insertBefore(node, ref) {
      const i = ref ? hostKids.indexOf(ref) : -1;
      if (i >= 0) hostKids.splice(i, 0, node);
      else hostKids.push(node);
      node.parentNode = host;
      return node;
    },
    replaceChild(node, old) {
      const i = hostKids.indexOf(old);
      if (i >= 0) hostKids[i] = node;
      node.parentNode = host;
      return old;
    },
  };
  const btn = makeEl("button");
  btn.id = "pm-renderer";
  btn.parentNode = host;
  hostKids.push(btn);
  return { host, btn, makeEl };
}

function bootPicker(opts) {
  const src = read("js/game/gfx-quality.js");
  const ls = makeStorage(opts.ls || {});
  const ss = makeStorage(opts.ss || {});
  const hostKids = [];
  const byId = {};
  const { makeEl } = makePickerDom(byId, hostKids);
  const gfxBtn = makeEl("button");
  gfxBtn.id = "pm-gfx";
  gfxBtn.hidden = true;
  let reloaded = 0;
  const timers = [];
  const winListeners = [];
  const ctx = vm.createContext({
    window: { addEventListener(type) { winListeners.push(type); } },
    document: {
      getElementById: (id) => byId[id] || null,
      createElement: makeEl,
      readyState: "complete",
      addEventListener() {},
    },
    localStorage: ls,
    sessionStorage: ss,
    location: { reload() { reloaded += 1; } },
    setTimeout: (fn) => { timers.push(fn); return 1; },
    navigator: { gpu: opts.gpu || undefined },
    PerfGov: { setUserTier() {}, sentinelArm() {} },
    GameStore: { store: { get() { return null; }, set() {} } },
    GLX: { isMobile: true },
  });
  seedLog(ctx);
  vm.runInContext(src, ctx, { filename: "js/game/gfx-quality.js" });
  const G = vm.runInContext("GfxQuality", ctx);
  // readyState is "complete", so the IIFE already called init().
  return { G, ls, ss, byId, hostKids, reloaded: () => reloaded, timers, winListeners };
}

test("RENDERER control becomes a select with prev/next, not a one-way cycle", () => {
  const { byId, hostKids } = bootPicker({ ls: { "apex26.gfxBackend": "webgl2" } });
  const sel = byId["pm-renderer"];
  assert.equal(sel.tagName, "SELECT");
  assert.equal(sel.value, "webgl2");
  assert.equal(sel.options.length, 3);
  assert.equal(sel.options[0].value, "webgl2");
  assert.equal(sel.options[1].value, "three");
  assert.equal(sel.options[2].value, "webgpu");
  assert.ok(byId["pm-renderer-prev"], "‹ steps backward");
  assert.ok(byId["pm-renderer-next"], "› steps forward");
  assert.equal(byId["pm-renderer-row"].children.length, 3);
  assert.ok(hostKids.some((n) => n.id === "pm-renderer-reset"));
});

test("selecting THREE persists the pick and reloads; WEBGPU without gpu does not", () => {
  const a = bootPicker({ ls: { "apex26.gfxBackend": "webgl2" } });
  const sel = a.byId["pm-renderer"];
  sel.value = "three";
  sel.dispatchEvent("change");
  assert.equal(a.ls.getItem("apex26.gfxBackend"), "three");
  assert.equal(a.reloaded(), 0);
  a.timers.forEach((fn) => fn());
  assert.equal(a.reloaded(), 1);

  const b = bootPicker({ ls: { "apex26.gfxBackend": "webgl2" }, gpu: undefined });
  const selB = b.byId["pm-renderer"];
  selB.value = "webgpu";
  selB.dispatchEvent("change");
  assert.equal(b.ls.getItem("apex26.gfxBackend"), "webgl2", "unavailable WEBGPU must not persist");
  assert.match(selB.options[2].textContent, /UNAVAILABLE/);
  assert.equal(b.reloaded(), 0);
});

test("‹ from WEBGL2 jumps to WEBGPU without opening THREE", () => {
  const { byId, ls, timers, reloaded } = bootPicker({
    ls: { "apex26.gfxBackend": "webgl2" },
    gpu: {},
  });
  byId["pm-renderer-prev"].onclick();
  assert.equal(ls.getItem("apex26.gfxBackend"), "webgpu");
  assert.equal(ls.getItem("apex26.gfxWgxFail"), null);
  timers.forEach((fn) => fn());
  assert.equal(reloaded(), 1);
});

test("THREE PATH and SCREENSHOTS are injected, and only reload when live", () => {
  const a = bootPicker({
    ls: { "apex26.gfxBackend": "webgl2" },
    ss: { "apex26.tlxAutoGL": "1" },
  });
  assert.ok(a.byId["pm-three-path"], "THREE PATH button");
  assert.ok(a.byId["pm-screenshots"], "SCREENSHOTS button");
  assert.ok(a.byId["pm-save-shot"], "SAVE SCREENSHOT button");
  assert.ok(a.byId["pm-gfx-status"], "status line");
  assert.match(a.byId["pm-three-path"].textContent, /THREE PATH: AUTO/);
  assert.match(a.byId["pm-screenshots"].textContent, /SCREENSHOTS: AUTO/);
  assert.match(a.byId["pm-gfx-status"].textContent, /WEBGL2 paints the canvas/);

  a.byId["pm-three-path"].onclick();
  assert.equal(a.G.readThreePath(), "webgl2");
  assert.equal(a.ls.getItem("apex26.tlxForceGL"), "1");
  assert.equal(a.ss.getItem("apex26.tlxAutoGL"), null, "THREE PATH cycle drops the AUTO stay-GL latch");
  assert.equal(a.reloaded(), 0, "THREE PATH must not reload on WEBGL2");
  assert.match(a.byId["pm-gfx-status"].textContent, /WEBGL2 paints the canvas/);

  a.byId["pm-screenshots"].onclick();
  assert.equal(a.G.readShotMode(), "blit");
  assert.equal(a.ls.getItem("apex26.wgxCapture"), "1");
  assert.equal(a.ss.getItem("apex26.wgxCapture"), "1");
  assert.equal(a.reloaded(), 0, "SCREENSHOTS must not reload on WEBGL2");

  const b = bootPicker({ ls: { "apex26.gfxBackend": "three", "apex26.tlxForceGL": "1" } });
  assert.match(b.byId["pm-three-path"].textContent, /WEBGL2/);
  assert.match(b.byId["pm-gfx-status"].textContent, /pinned to WebGL2/);
  b.byId["pm-three-path"].onclick();
  assert.equal(b.G.readThreePath(), "webgpu");
  assert.equal(b.ls.getItem("apex26.tlxForceGL"), "0");
  assert.match(b.byId["pm-three-path"].textContent, /RELOADING/);
  b.timers.forEach((fn) => fn());
  assert.equal(b.reloaded(), 1, "THREE PATH reloads when THREE.JS is live");

  const c = bootPicker({
    ls: { "apex26.gfxBackend": "webgpu" },
    ss: { "apex26.wgxCapture": "1" },
    gpu: {},
  });
  assert.equal(c.G.readShotMode(), "blit");
  assert.match(c.byId["pm-screenshots"].textContent, /2D BLIT/);
  assert.match(c.byId["pm-gfx-status"].textContent, /2D BLIT/);
  c.byId["pm-screenshots"].onclick();
  assert.equal(c.G.readShotMode(), "native");
  assert.match(c.byId["pm-screenshots"].textContent, /RELOADING/);
  c.timers.forEach((fn) => fn());
  assert.equal(c.reloaded(), 1, "SCREENSHOTS reloads when WEBGPU is live");

  const d = bootPicker({
    ls: { "apex26.gfxBackend": "three", "apex26.tlxForceGL": "0" },
  });
  d.byId["pm-screenshots"].onclick();
  assert.equal(d.G.readShotMode(), "blit");
  assert.match(d.byId["pm-screenshots"].textContent, /RELOADING/);
  d.timers.forEach((fn) => fn());
  assert.equal(d.reloaded(), 1, "SCREENSHOTS reloads when THREE.JS WebGPU is live");
});

test("presentStatus names the three screenshot paths in plain language", () => {
  const src = read("js/game/gfx-quality.js");
  const ctx = vm.createContext({
    window: {}, document: undefined,
    localStorage: makeStorage({ "apex26.gfxBackend": "webgpu", "apex26.wgxCapture": "0" }),
    sessionStorage: makeStorage(),
  });
  vm.runInContext(src, ctx, { filename: "js/game/gfx-quality.js" });
  const G = vm.runInContext("GfxQuality", ctx);
  assert.match(G.presentStatus(), /native swapchain/);
  G.applyShotMode("blit", { noReload: true });
  assert.match(G.presentStatus(), /copied onto the canvas/);
  ctx.localStorage.setItem("apex26.gfxBackend", "three");
  ctx.localStorage.setItem("apex26.tlxForceGL", "0");
  assert.match(G.presentStatus(), /pinned to WebGPU/);
  G.applyThreePath("webgl2", { noReload: true });
  assert.match(G.presentStatus(), /pinned to WebGL2/);
  G.applyThreePath("auto", { noReload: true });
  assert.match(G.presentStatus(), /can be WebGPU or three WebGL2/);
  assert.equal(G.threePathLabel("auto"), "AUTO");
  assert.equal(G.liveThreeApi(), null);

  ctx.GLX = {
    __tlx: { backendState() { return { api: "webgpu" }; } },
    softPresent() { return true; },
  };
  assert.equal(G.liveThreeApi(), "webgpu");
  assert.equal(G.threePathLabel("auto"), "AUTO (WEBGPU)");
  assert.match(G.presentStatus(), /AUTO is WebGPU/);

  ctx.GLX.__tlx.backendState = () => ({ api: "webgl2" });
  ctx.GLX.softPresent = () => false;
  assert.equal(G.liveThreeApi(), "webgl2");
  assert.equal(G.threePathLabel("auto"), "AUTO (WEBGL2)");
  assert.match(G.presentStatus(), /AUTO is three WebGL2/);
});

test("TLX publishes capturePixels / awaitSoftPresent as the three.js screenshot API", () => {
  const tlx = code("js/render/three/tlx.js");
  const post = code("js/render/three/tlx-post.js");
  assert.match(tlx, /\bcapturePixels\s*\(\s*\)\s*\{/);
  assert.match(tlx, /\breadRenderTargetPixelsAsync\b/, "the blit goes through three's readback (copyTextureToBuffer + mapAsync), not the swapchain");
  assert.match(fnBody(tlx, "softPresent"), /return\s+!!\s*_softBlit\b/);
  assert.match(tlx, /_softBlit\s*=\s*!forceWebGL\s*&&\s*_capPref\s*!==\s*"0"/);
  assert.doesNotMatch(tlx, /[.]\s*getCurrentTexture\s*\(/, "never getCurrentTexture on software — the swapchain never composites and it breaks mapAsync");
  assert.match(tlx, /await\s+renderer\.init\(\s*\)/);
  assert.match(tlx, /\bgame-soft\b/);
  assert.match(tlx, /\b__apexWriteBuf\b/);
  assert.match(tlx, /queue\.writeBuffer\(\s*buf\s*,\s*0\s*,\s*staging\s*\)/);
  assert.match(tlx, /function\s+_instColorAttr\b/);
  assert.match(tlx, /\bisInstancedBufferAttribute\b/);
  assert.match(post, /ldrTarget:\s*\(\s*\)\s*=>\s*ldrRT\b/);
});

test("TLX WebGPU path never claims #game as WebGL2 after renderer.init()", () => {
  const tlx = read("js/render/three/tlx.js");
  // MDN: one context type per canvas for life. three r185.1 configure() is
  // lazy on first present(); sniffing WebGL2 on #game after init() made
  // getContext("webgpu") return null (mcp-probe 2026-08-18).
  assert.match(tlx, /softwareGL\s*=\s*forceWebGL\s*\?\s*detectSoftwareGL\(\s*\)\s*:\s*!!\s*_softAdapter\b/);
  const initAt = tlx.search(/await\s+renderer\.init\(\s*\)/);
  const sniffAt = tlx.search(/softwareGL\s*=\s*forceWebGL\s*\?\s*detectSoftwareGL\(/);
  assert.ok(initAt > 0 && sniffAt > initAt, "software sniff stays after init");
  assert.match(tlx, /getContext\("webgpu"\)===null/);
});

/* ── TLX canvas opacity — the "transparent cars on iPhone" guard ─────────
 *
 * The defect this pins, end to end:
 *
 *   1. The lit fragment writes the SSR car-paint TAG — 0.35 — into ALPHA
 *      (js/render/three/tsl-lit.js, gated on ctx.ssrTag). It is a CHANNEL for
 *      the post chain, not an opacity, and the post chain's own passes all
 *      output alpha 1.0, so the canvas never normally sees it.
 *   2. present() has a "post-only death" path: when the post chain throws it
 *      sets post = null and paints the scene STRAIGHT TO THE CANVAS with the
 *      same lit materials. Nothing rebuilds them, so from that frame on the tag
 *      is written to the canvas — for the rest of the session.
 *   3. three's canvas is alpha-composited by default. So the browser reads that
 *      0.35 as opacity and the painted bodywork of every car goes 35%
 *      see-through. Only the bodywork: tyres, carbon, glass and wings keep
 *      alpha = the material's own, which is 1.
 *
 * GLX cannot hit this because it asks for `alpha: false` (js/render/glx.js), so
 * the compositor ignores whatever it writes to alpha. TLX has to say the same
 * thing, and — the part worth a test — it has to say it TWICE, because three's
 * two backends read different inputs and neither reads the other's. Those two
 * vendor behaviours are asserted against the bundled three below, so a three
 * upgrade that changes either one fails HERE, next to the reason, instead of
 * turning back into a bug report from a phone.
 *
 */
const TLX = read("js/render/three/tlx.js");
const GLX = read("js/render/glx.js");
const TSL_LIT = read("js/render/three/tsl-lit.js");
const THREE_BUNDLE = read("vendor/three-0.185.1/three.webgpu.min.js");

// ── The two LOCAL PATCHES carried on the vendored bundle (vendor/three-0.185.1/
// PATCHES.md). A vendor re-drop that silently reverts either one must fail HERE,
// not in production. Upstream has fixed neither as of 186dev (2026-08-27).
test("the vendored three carries the swizzle patch — Chromium 141 rejects r185's string swizzle", () => {
  // r185's pooled GPUTextureViewDescriptor stamps swizzle:"rgba" (constructor +
  // reset()) into EVERY createView; Chromium 141 validates the member as a
  // GPUTextureComponentSwizzle dictionary, so the pristine bundle throws on
  // every render pass — shadows dead, env probe dead, present() throws on the
  // first race frame, TLX refuses the tab and reloads. The patch omits the
  // member (identity swizzle carries no information). Re-apply per PATCHES.md.
  assert.doesNotMatch(THREE_BUNDLE, /this\.swizzle="rgba"/,
    "pristine swizzle default is back — the vendor bundle was re-dropped without the patch (see vendor/three-0.185.1/PATCHES.md §1)");
  assert.equal(THREE_BUNDLE.split('this.swizzle=void 0').length - 1, 2,
    "the swizzle patch must cover BOTH sites (constructor + reset())");
});
test("the vendored three carries the #33952 bind-group leak backport (PR #33954)", () => {
  // _destroyBindings must delete the destroyed bind group from the shared
  // texture's bindGroups Set, or the Set grows unboundedly holding
  // NodeSampledTexture refs — TLX's shared-texture-node pattern. The deferred
  // material dispose() in tlx.js/tsl-fx.js is only leak-free WITH this patch.
  // Drop the assertion (and the patch) on the first release containing #33954.
  assert.match(THREE_BUNDLE, /bindGroups\.delete\(\w+\)\}\)\(this\.textures\.get\(\w+\.texture\)\)/,
    "the #33952 backport is missing from the vendor bundle — evicted-material dispose() now leaks (see vendor/three-0.185.1/PATCHES.md §2)");
});

/** The object literal passed to `new THREE.WebGPURenderer({...})`, brace-matched
 *  (it spans ~40 lines of comment, so a regex over one line cannot see it). */
function rendererParams() {
  const at = TLX.indexOf("new THREE.WebGPURenderer(");
  assert.notEqual(at, -1, "the renderer construction moved");
  const open = TLX.indexOf("{", at);
  let depth = 0;
  let i = open;
  for (; i < TLX.length; i++) {
    if (TLX[i] === "{") depth++;
    else if (TLX[i] === "}" && --depth === 0) break;
  }
  // Comments quote `alpha: false` when explaining it; only code may answer.
  return TLX.slice(open, i + 1).replace(/^[ \t]*\/\/.*$/gm, "");
}

test("GLX asks for an opaque canvas — the behaviour TLX has to match", () => {
  const h = bootGlx();
  const ctx = h.contextAttrs.find((c) => c.type === "webgl2");
  assert.ok(ctx, "GLX asks the canvas for a webgl2 context");
  assert.equal(ctx.attrs.alpha, false,
    "GLX dropped `alpha: false` — then the tag can ghost cars on BOTH backends " +
    "and this whole guard needs rethinking, not updating");
  assert.equal(ctx.attrs.antialias, false, "no browser MSAA — the post path resolves its own");
});

test("the alpha tag that makes canvas opacity load-bearing still exists", () => {
  // If this ever stops being true the coupling is gone and the two assertions
  // below are merely tidy rather than load-bearing. Worth knowing which.
  const src = TSL_LIT.replace(/^[ \t]*\/\/.*$/gm, "").replace(/^\s*\*.*$/gm, "");
  assert.match(src, /SSR_TAG\s*\?[\s\S]{0,160}float\(0\.35\)/,
    "the SSR car-paint alpha tag moved — re-derive whether an alpha canvas can " +
    "still ghost the cars before touching the guards below");
});

test("TLX pack sampling skips car surface ids, matching GLX matTexUV", () => {
  // The baked array is 17 layers (MAT 0..16). Car surfaces are 20-27.
  // GLX/WGX refuse mid>16 before the fetch. TLX used to sample layer=mid
  // on every car fragment; SwiftShader returns black and the car vanishes
  // while the road (MAT 16) still draws.
  const glxLit = read("js/render/shaders/lit.js");
  assert.match(glxLit, /mid <= 0 \|\| mid > 16/,
    "GLX matTexUV lost its 1..16 pack gate — re-derive the TLX clamp");
  const src = TSL_LIT.replace(/^[ \t]*\/\/.*$/gm, "").replace(/^\s*\*.*$/gm, "");
  assert.match(src, /matTexInPack/,
    "TLX must name the 1..16 pack gate so car ids cannot enable a live sample");
  assert.match(src, /lessThanEqual\(16\.0\)/,
    "the pack gate must refuse mid>16 (car surfaces 20-27)");
  assert.match(src, /depth\(int\(matTexLayer\(mid\)\)\)/,
    "the hoisted array sample must clamp the layer, not pass raw mid");
});

test("TLX pooled meshes write matrixWorld — scene auto-update is off", () => {
  // scene.matrixWorldAutoUpdate = false so renderer.render() does not walk
  // the graph. The comment above that flag says every pooled mesh writes
  // matrixWorld; the shadow caster pool does (tlx-shadow.js cast()). The
  // visible acquireMesh pool used to write only `matrix`. Reused slots
  // kept the identity world matrix they were born with (track), so race
  // cars sat at the origin while the chase camera looked at Monza.
  const tlx = TLX.replace(/^[ \t]*\/\/.*$/gm, "");
  const at = tlx.indexOf("function acquireMesh(");
  assert.ok(at > 0, "acquireMesh is gone");
  const body = tlx.slice(at, tlx.indexOf("function buildGeometry(", at));
  assert.match(body, /matrixWorld\.copy\(\s*m\.matrix\s*\)/,
    "acquireMesh must stamp matrixWorld — scene auto-update will not");
  assert.match(body, /matrixWorldAutoUpdate\s*=\s*false/,
    "pool meshes must not let a later graph walk clobber the stamp");
  const sh = read("js/render/three/tlx-shadow.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(sh, /matrixWorld\.copy\(\s*m\.matrix\s*\)/,
    "shadow casters are the working reference for this stamp");
});

test("the SSR tag is not three's opacity socket — that is what made cars vanish", () => {
  // NodeMaterial.setupDiffuseColor does diffuseColor.a *= opacityNode.
  // NodeBuilder.isOpaque() is (transparent===false && blending===NormalBlending).
  // Opaque car paint uses NoBlending so the tag writes verbatim (GLX parity),
  // which makes isOpaque() FALSE, so a 0.35 opacityNode is left as coverage:
  // painted bodywork disappears; tyres/carbon/glass (alpha 1) stay. The tag
  // belongs on outputNode; opacityNode is the real material alpha.
  const src = TSL_LIT.replace(/^[ \t]*\/\/.*$/gm, "").replace(/^\s*\*.*$/gm, "");
  assert.doesNotMatch(src, /opacityNode\s*=\s*packed\.a/,
    "opacityNode = packed.a feeds the 0.35 paint tag into three as coverage");
  assert.match(src, /opacityNode\s*=\s*packed\.opacity/,
    "opacityNode must be the real tlxAlpha, not the SSR channel");
  assert.match(src, /outputNode\s*=\s*packed\.out/,
    "outputNode must be the shared-graph vec4 (RGB + real alpha)");
  assert.match(src, /vec4\(packed\.rgb,\s*matU\.alpha\)/,
    "output.a must be tlxAlpha — the 0.35 tag is coverage on NoBlending");
  assert.doesNotMatch(src, /out:\s*packed(?:\s|,|\})/,
    "do not emit packed (RGB + tag) as the written vec4");
  assert.match(src, /opacity:\s*matU\.alpha/,
    "shared graph must expose matU.alpha as the opacity socket");
  assert.match(src, /m\.fog\s*=\s*false/,
    "three scene-fog on top of the lit fog stack darkens bodywork a second time");
  assert.match(src, /m\.premultipliedAlpha\s*=\s*false/,
    "premultiply would scale RGB by the tag if it ever re-enters the output");
});

test("three still treats NoBlending as non-opaque (why the tag cannot live in opacityNode)", () => {
  // Makes the assertion above NECESSARY. If isOpaque() starts ignoring
  // blending, NoBlending would force alpha back to 1 and the outputNode
  // split would be tidy rather than load-bearing — worth knowing which.
  assert.match(THREE_BUNDLE,
    /isOpaque\(\)\{const \w+=this\.material;return!1===\w+\.transparent&&\w+\.blending===\w+&&!1===\w+\.alphaToCoverage\}/,
    "bundled three isOpaque() no longer requires NormalBlending — re-derive " +
    "whether NoBlending + opacityNode=tag still ghosts cars");
});

test("TLX asks for an opaque canvas on the WebGPU backend", () => {
  assert.match(rendererParams(), /(^|[{,\s])alpha:\s*false/,
    "TLX must pass alpha:false — three's WebGPU backend turns it into " +
    'alphaMode "opaque"');
  assert.match(rendererParams(), /(^|[{,\s])premultipliedAlpha:\s*false/,
    "TLX must pass premultipliedAlpha:false — default true premultiplies the " +
    "SSR tag into car RGB");
});

test("TLX world-frame Color clear prefers skyZenith over fog (missed TSL sky is not beige)", () => {
  // scene.background is the fallback when backgroundNode misses (software-GL
  // TSL compile, HDR-target skip). Clearing to fogColor made every dusk
  // probe a washed beige void ([0.68,0.64,0.54]). Zenith is the sky the
  // node would have drawn; fog stays the no-track menu fallback only.
  const src = read("js/render/three/tlx.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const begin = src.indexOf("begin(frame)");
  assert.notEqual(begin, -1, "begin(frame) moved");
  const body = src.slice(begin, begin + 900);
  assert.match(body, /skyZenith/, "begin() must read frame.skyZenith for the Color fallback");
  assert.match(body, /background\.setRGB/, "begin() still sets scene.background");
  const zAt = body.indexOf("skyZenith");
  const fogAssign = body.indexOf("fogColor) || [0.04");
  assert.ok(zAt >= 0 && fogAssign > zAt,
    "zenith must be preferred; fogColor is the no-zenith fallback");
  const drawSky = src.indexOf("drawSky(frameSky)");
  assert.notEqual(drawSky, -1, "drawSky moved");
  assert.match(src.slice(drawSky, drawSky + 1100), /frameSky\.zenith\s*\|\|\s*frameSky\.skyZenith/,
    "drawSky must keep the Color fallback in lockstep with the sky node");
  // softContent("sky") IS (softwareGL || softGpu()), with the apex26.tlxForceHw
  // escape folded in — the fallback stays the software default for players.
  assert.match(src.slice(drawSky, drawSky + 1100), /softContent\("sky"\) && sky\.fallbackNode/,
    "software GL and software WebGPU must arm the zenith-only fallback, not the full SKY_FS node");
  assert.match(read("js/render/three/tsl-sky.js"), /fallbackNode/,
    "tsl-sky must publish a zenith-only fallbackNode for the software-GL path");
});

test("TLX pins the sky material before the HDR scene render, not only the canvas fallback", () => {
  const src = read("js/render/three/tlx.js");
  const present = src.indexOf("present(opts)");
  const hdr = src.indexOf("post.sceneTarget()", present);
  assert.ok(present > 0 && hdr > present, "HDR present path moved");
  const pinBefore = src.lastIndexOf("pinSkyMaterial()", hdr);
  assert.ok(pinBefore > present && pinBefore < hdr,
    "HDR target render must pin the TSL sky or a missed compile leaves the Color clear");
});

test("TLX software-WebGPU soft-presents like WGX (never getCurrentTexture)", () => {
  // Dawn on SwiftShader/Lavapipe executes shaders but the native swapchain
  // never composites, and the first getCurrentTexture() breaks mapAsync
  // device-wide. TLX sniffs the adapter (info fields are not JSON-
  // enumerable), keeps #game as the GPU canvas, and blits onto #game-soft.
  const src = read("js/render/three/tlx.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(src, /navigator\.gpu\.requestAdapter\(\)/,
    "soft-adapter sniff must use requestAdapter — getContext('webgl2') is null after WebGPU claims the canvas");
  assert.match(src, /info\.vendor/,
    "adapter.info fields are not enumerable — read vendor/device/architecture directly");
  assert.match(src, /swiftshader\|llvmpipe\|lavapipe\|microsoft basic render\|soft/,
    "sniff regex must match WGX's software-adapter list");
  assert.match(src, /apex26\.wgxCapture/,
    "sessionStorage apex26.wgxCapture=1 must force the blit (gfx-probe --tlx-webgpu)");
  assert.match(src, /game-soft/,
    "#game stays the GPU canvas; visible present is the #game-soft sibling");
  assert.match(src, /_displayCanvas\.getContext\("2d"/,
    "soft-present overlay is a 2D sibling — never getContext(2d) on #game");
  assert.match(src, /softDest:\s*(?:function\s*\(\s*\)\s*\{\s*return|\(\s*\)\s*=>)\s*softOutRT\b/,
    "post chain must receive softDest so FXAA never targets the swapchain");
  assert.match(src, /awaitSoftPresent/,
    "backend must expose awaitSoftPresent (copied onto GLX by game.js)");
  assert.match(src, /capturePixels/,
    "backend must expose capturePixels for gfx-probe frame.png");
  assert.match(src, /readRenderTargetPixelsAsync/,
    "blit must go through three's copyTextureToBuffer + mapAsync, not the swapchain");
  // TLX must hear Dawn. WGX has hooked onuncapturederror since it shipped; TLX
  // hooked nothing, so a black three-on-WebGPU frame was chased for a whole
  // session against probes reporting `gpuErrors: null` — which read as "no
  // errors" and meant "no reader". An unheard backend is an undebuggable one.
  assert.match(src, /onuncapturederror/,
    "the three backend must hook device.onuncapturederror — WGX has always had it");
  assert.match(fnBody(src, "gpuErrors"), /return\s+_gpuErrors\b/,
    "the error tally must be exposed (GLX.gpuErrors() after the descriptor-copy)");
  assert.match(src, /function drawInstanced[\s\S]{0,400}if \(skipBatches/,
    "software WebGPU must skip InstancedMesh draws — they poison the frame encoder");
  // skipBatches() is softGpu() AND NOT the apex26.tlxForceBatches escape. The
  // skip stays the default, so the assertion above still holds for players; the
  // switch exists because gating the workaround on softGpu() meant the code
  // path REAL GPUs take was the one CI never executed — which is how a black
  // three.js WebGPU screen shipped. Keep both halves: default skips, opt-in runs.
  // CONTENT gates ask _softAdapter, never softGpu(): softGpu() folds in
  // _softBlit, which is a PRESENTATION need (headless has no compositing
  // swapchain even on real hardware). Conflating them made the Apple/Metal
  // runner — the project's only real GPU — run the software half of every
  // skip, so the machine that could finally test a player's path tested the
  // other one instead. softOutRT keeps asking softGpu(); these must not.
  assert.match(fnBody(src, "skipBatches"), /^\s*return\s+_softAdapter\s*&&\s*!_forceBatches\s*&&\s*!_forceHw\.has\(\s*"batches"\s*\)/,
    "the batch skip is _softAdapter-by-default — not the presentation blit");
  assert.match(fnBody(src, "softOutRT"), /^\s*return\s+softGpu\(\s*\)/,
    "presentation still follows softGpu() — the blit is needed whenever the swapchain is not composited");
  assert.match(src, /apex26\.tlxForceBatches/,
    "the real-GPU code path must stay reachable from a software run for debugging");
  // apex26.tlxForceHw is the same argument generalised: EVERY software skip in
  // this file hides a path only a player's GPU executes, so each one needs a
  // switch that puts it back. softContent() must always take a part name —
  // a bare softContent() would force all the gates together and a timeout
  // would not say which path did it.
  assert.match(src, /apex26\.tlxForceHw/,
    "the per-gate hardware-path switch must stay reachable from a software run");
  // _softAdapter must classify the ADAPTER. Headless is a presentation fact —
  // headless Chromium on a real GPU is hardware — and putting it here made the
  // Apple/Metal runner, the project's only real GPU, take the software half of
  // every content skip. It belongs to _softBlit, which exists precisely because
  // a headless swapchain does not composite.
  const sniff = src.slice(src.indexOf("let _softAdapter = false;"),
    src.indexOf("let forceWebGL"));
  // The VERDICT expression itself, not the surrounding block: _headless is
  // declared in this region on purpose (the blit needs it), so slicing wider
  // would assert against its own definition.
  const verdict = src.slice(src.indexOf("_softAdapter = !!("),
    src.indexOf("} catch (_) { _softAdapter = false;"));
  assert.doesNotMatch(verdict, /HeadlessChrome/,
    "the adapter verdict must not treat headless as software — that is a presentation fact");
  assert.match(src, /_softBlit\s*=\s*!forceWebGL\s*&&\s*_capPref\s*!==\s*"0"\s*&&\s*!!\s*\(\s*_softAdapter\s*\|\|\s*_headless\s*\|\|\s*_capPref\s*===\s*"1"\s*\)/,
    "the blit must follow headless: a headless swapchain does not composite even on real silicon");
  // An empty adapter.info is UNKNOWN, not software. Browsers trim those fields
  // for fingerprinting reasons, so a player with no vendor string must not be
  // handed the degraded path on real hardware.
  assert.doesNotMatch(verdict, /infoEmpty/,
    "empty adapter.info must not be a software verdict on its own");
  assert.match(sniff, /maxTextureDimension2D <= 8192/,
    "the tie-break is measured LIMITS — SwiftShader/llvmpipe 8192, Apple 16384");
  assert.match(fnBody(src, "softContent"), /^\s*return\s+\(\s*softwareGL\s*\|\|\s*_softAdapter\s*\)\s*&&\s*!_forceHw\.has\(\s*part\s*\)/,
    "content skips must route through softContent(part) — software by default, forceable per gate");
  assert.doesNotMatch(src, /softContent\(\)/,
    "softContent() must never be called without a part name");
  for (const part of ["sky", "env", "chunked", "shadow"]) {
    assert.ok(src.includes(`softContent("${part}")`),
      `the ${part} software skip must be forceable — it is a path only real GPUs take`);
  }
  assert.match(src, /renderer\.setRenderTarget\(softOutRT/,
    "env / post restore must rebind the blit RT, not the native swapchain");
  const envEnd = src.indexOf("envFaceEnd(face)");
  assert.notEqual(envEnd, -1, "envFaceEnd moved");
  const envBody = src.slice(envEnd, envEnd + 4200);
  assert.doesNotMatch(envBody, /setRenderTarget\(\s*null\s*\)/,
    "envFaceEnd must not restore the swapchain on the software-WebGPU path");
  // A probe face that throws must NOT be counted: six swallowed throws used to
  // latch envReady over a cube nothing wrote, and every lit surface sampled
  // black. That is invisible on software (the faces are skipped there), which
  // is exactly why it needs a static pin.
  assert.match(envBody, /catch\s*\(\s*\w+\s*\)\s*\{[\s\S]{0,400}faceOk\s*=\s*false\b/,
    "envFaceEnd must record a failed probe face, not swallow it silently");
  assert.match(envBody, /if\s*\(\s*faceOk\s*\)\s*envFacesMask\s*\|=\s*1\s*<<\s*\(\s*face\s*&\s*7\s*\)/,
    "a failed probe face must not be counted towards the six");
  assert.match(envBody, /if\s*\(\s*faceOk\s*&&\s*envFacesMask\s*===\s*63\s*&&\s*probeErrored\s*\)/,
    "envReady must not latch on a face that threw");
  // Dawn does NOT throw when it rejects a pipeline — render() returns normally
  // and the command buffer is discarded, so faceOk alone cannot see it. The
  // uncaptured-error tally across the six faces is the only in-page signal
  // that the probe's own commands never ran, and binding that cube is what
  // lights a whole world from black.
  assert.match(envBody, /_envErrBase\s*=\s*_gpuErrors\b/,
    "the probe must baseline the GPU error tally at its first face");
  assert.match(envBody, /probeErrored\s*=\s*_envErrBase\s*>=\s*0\s*&&\s*_gpuErrors\s*>\s*_envErrBase\b/,
    "and compare it at the latch — a silent rejection has no other tell");
  assert.match(envBody, /_envGaveUp\s*=\s*true\s*;\s*envReady\s*=\s*false\b/,
    "a probe that keeps erroring must stand down instead of binding the cube");
  assert.match(fnBody(src, "envProbeReady"), /return\s+envReady\s*\|\|\s*_envGaveUp\b/,
    "standing down must read as ready so the caller stops re-probing forever");
  // releaseMirrors() nulls attribute.array. three's node builder reads
  // attribute.array.constructor to type an attribute whenever it compiles a
  // program for a pass it has not seen before, so a chunk freed before the env
  // probe's first face makes EVERY face throw. Measured on real hardware
  // (macos-latest/Metal): 41 failed faces on WebGL2, 81 on WebGPU.
  assert.match(src, /!rec\.chunked\._mirrorsFreed\s*&&\s*!vizMat\s*&&\s*\(\s*envReady\s*\|\|\s*_envGaveUp\s*\|\|\s*!envRT\s*\)/,
    "the CPU mirrors must not be freed while the env probe still has passes to compile");
  assert.match(src, /if\s*\(\s*_envFailN\s*>=\s*ENV_FAIL_CAP\s*\)\s*_envGaveUp\s*=\s*true\b/,
    "a probe that cannot succeed must stop retrying — it threw every frame forever");
  const post = read("js/render/three/tlx-post.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(post, /ctx\.softDest/,
    "tlx-post must honour ctx.softDest for the FXAA / viz dest");
  assert.match(post, /if\s*\(\s*!dest\s*\)/,
    "finally must skip setRenderTarget(null) when a soft dest is bound");
});

test("TLX soft-present overlay is opaque — SSR tag 0.35 is not compositor opacity", () => {
  // Same hole as the iPhone alpha-canvas guard, on the #game-soft path:
  // car-paint alpha is the SSR mask. A default 2D overlay composites that
  // as 35% opacity and the bodywork ghosts (tyres/wings stay solid).
  const src = read("js/render/three/tlx.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const at = src.indexOf('_displayCanvas.getContext("2d"');
  assert.notEqual(at, -1, "overlay getContext moved");
  assert.match(src.slice(at, at + 120), /alpha:\s*false/,
    "#game-soft must be an opaque 2D context");
  assert.match(src, /img\.data\[i \+ 3\] = 255/,
    "putImageData blit must force opaque pixels");
  assert.match(src, /data\[i\] = 255/,
    "_unstrideRgba / capturePixels must force opaque alpha too");
});

test("TLX InstancedMesh preserves vertex colour and owns a capped placement tint", () => {
  // three WebGPU binds a 1-instance dummy color buffer when instanceColor is
  // missing; DrawIndexed with count>1 fails validation (Lavapipe, 2026-08-18).
  // A dedicated instanceTint avoids that path without replacing canonical
  // per-vertex `color` (brown trunks / billboard frames must survive).
  const src = read("js/render/three/tlx.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const at = src.indexOf("function createInstancedBatch");
  assert.notEqual(at, -1, "createInstancedBatch moved");
  const body = src.slice(at, at + 2200);
  assert.match(body, /_instColorAttr\(\s*imesh/,
    "every batch must get an instanced tint, not only when colors[] is present");
  assert.doesNotMatch(body, /imesh\.instanceColor\s*=/,
    "do not also set imesh.instanceColor — that is the slot-5 dummy-buffer trap");
  const attrAt = src.indexOf("function _instColorAttr");
  const attrBody = src.slice(attrAt, attrAt + 1200);
  assert.match(attrBody, /setAttribute\(\s*"instanceTint"/,
    "placement colour must use its own instance-rate attribute");
  assert.doesNotMatch(attrBody, /setAttribute\(\s*"color"/,
    "instancing must not overwrite canonical per-vertex colour");
  const lit = read("js/render/three/tsl-lit.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(lit, /vertexColor\.mul\(attribute\(\s*"instanceTint"/,
    "the instanced lit graph must multiply base colour by placement tint");
  assert.match(lit, /tlx-lit-instanced/,
    "the extra attribute requires its own stable program family");
  const shadow = read("js/render/three/tlx-shadow.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const cast = shadow.indexOf("function castInstanced");
  assert.notEqual(cast, -1, "castInstanced moved");
  const castBody = shadow.slice(cast, cast + 1800);
  assert.doesNotMatch(castBody, /m\.instanceColor\s*=/,
    "shadow InstancedMesh must not set instanceColor — the lit geo already has instanceTint");
});

test("instanced cull cache only hits the transform pack resident in the GPU buffer", () => {
  for (const file of ["js/render/glx.js", "js/render/webgpu/wgx.js", "js/render/three/tlx.js"]) {
    const src = read(file).replace(/^[ \t]*\/\/.*$/gm, "");
    const at = src.indexOf("function cullInstances");
    assert.notEqual(at, -1, `${file}: cullInstances moved`);
    const body = src.slice(at, at + 2800);
    assert.doesNotMatch(body, /_cullSig[01]/,
      `${file}: a second cached count cannot restore a second physical transform pack`);
    assert.match(body, /_cullPlanes/,
      `${file}: resident pack must be identified by its complete frustum`);
    assert.match(body, /k\s*<\s*4/,
      `${file}: compare x/y/z/d, not the old x/d-only collision-prone hash`);
    assert.match(body, /_cullN\b/,
      `${file}: the resident pack's count should be cached with it`);
    // The cell-set key (apex26.instCellCache) identifies the resident pack by
    // WHICH CELLS produced it. Its hit path must NOT stamp the plane snapshot:
    // _cullPlanes has to keep describing the frustum that PHYSICALLY wrote the
    // buffer, or the cheap plane compare above starts claiming a pack it never
    // produced — the same "right count, wrong transforms" defect the _cullSig
    // assertion above exists to prevent, reintroduced through the side door.
    const cellHit = body.indexOf("_cellKeyN === k");
    if (cellHit !== -1) {
      const hitBlock = body.slice(cellHit, cellHit + 600);
      assert.doesNotMatch(hitBlock, /_cullPlanes\s*(=|\[)/,
        `${file}: a cell-set cache HIT must not write the plane snapshot`);
    }
  }
  const glShadow = read("js/render/glx/shadow.js");
  const wgx = read("js/render/webgpu/wgx.js");
  assert.match(glShadow, /bufferSubData\([^]*?batch\._cullPlanes\s*=\s*null/,
    "GLX full-set shadow restore must invalidate the resident cull pack");
  assert.match(wgx, /count === undefined[^]*?writeBuffer\([^]*?batch\._cullPlanes\s*=\s*null/,
    "WGX full-set shadow restore must invalidate the resident cull pack");
});

test("TLX instanced shadows consume the light-frustum packed slice", () => {
  const src = read("js/render/three/tlx.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const at = src.indexOf("function castShadowInstanced");
  assert.notEqual(at, -1, "TLX castShadowInstanced moved");
  assert.match(src.slice(at, at + 350), /castInstanced\(batch,\s*count\)/,
    "TLX wrapper must forward game.js's culled count");
  const shadow = read("js/render/three/tlx-shadow.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const castAt = shadow.indexOf("function castInstanced");
  const body = shadow.slice(castAt, castAt + 2600);
  assert.match(body, /culled[^]*?batch\.packMatrices/,
    "explicit count must copy the light-frustum packed transforms");
  assert.match(body, /m\.count\s*=\s*n/,
    "shadow draw count must be the culled count, not batch.instances");
});

test("env cube 4× anisotropy is on all three backends (grazing clearcoat)", () => {
  // GLX sets TEXTURE_MAX_ANISOTROPY_EXT on the env cube so clearcoat rays at
  // grazing angles do not over-blur — BEHAVIOUR on a mock that advertises the
  // extension. TLX is per-texture; WGX needs a dedicated sampler (binding 14)
  // because envSamp is shared with SSR + the PCSS blocker.
  const h = bootGlx({ aniso: true });
  h.GLX.envFaceBegin(0, [0, 1, 0], h.frame());
  const cube = h.calls.filter((c) => c[0] === "texParameterf" && c[1][0] === h.gl.TEXTURE_CUBE_MAP && c[1][1] === h.ANISO.TEXTURE_MAX_ANISOTROPY_EXT);
  assert.equal(cube.length, 1, "the env cube gets one anisotropy setting");
  assert.equal(cube[0][1][2], 4, "GLX env cube must keep 4× anisotropy (capped, not the driver max of 16)");
  const none = bootGlx();
  none.GLX.envFaceBegin(0, [0, 1, 0], none.frame());
  assert.equal(none.count("texParameterf"), 0, "without the extension nothing is set — no invalid enum");
  const tlx = code("js/render/three/tlx.js");
  assert.match(tlx, /envRT\.texture\.anisotropy\s*=\s*4\b/, "TLX env cube must match GLX 4× anisotropy");
  const wgx = code("js/render/webgpu/wgx.js");
  assert.match(wgx, /\benvCubeSamp\b/, "WGX must own a dedicated env-cube sampler");
  assert.match(wgx, /maxAnisotropy:\s*4\b/, "WGX env-cube sampler must request 4× anisotropy");
  const wgsl = code("js/render/webgpu/wgsl-chunks.js");
  assert.match(wgsl, /binding\(\s*14\s*\)\s*var\s+envCubeSamp\b/, "WGSL must sample the cube through the aniso sampler, not shared envSamp");
  assert.match(wgsl, /textureSampleLevel\(\s*envCube\s*,\s*envCubeSamp\b/, "env cube taps must use envCubeSamp");
  assert.doesNotMatch(wgsl, /textureSampleLevel\(\s*envCube\s*,\s*envSamp\b/, "do not sample the cube with the shared SSR/blocker sampler");
});

test("WGX car-paint flake and orange-peel key in object space like GLX", () => {
  // World-space cells swam as the car translated (floor(wpos*45) + hash3).
  // GLX / TLX weld glitter to vObjPos / positionGeometry at 220 Hz + hash21.
  const chunks = read("js/render/webgpu/wgsl-chunks.js");
  const lit = read("js/render/shaders/lit.js");
  const tsl = read("js/render/three/tsl-lit.js");
  // location 3 is the road trk vec3; objPos shifted 7 → 5 with that pack.
  assert.match(chunks, /@location\(5\)\s+objPos\s*:\s*vec3<f32>/,
    "LIT VSOut must carry object-space position (GLX vObjPos)");
  assert.match(chunks, /o\.objPos\s*=\s*aPos/,
    "vs_main must write aPos into objPos, not the world-space wp");
  assert.match(chunks, /fn paintPeelN\(/,
    "orange-peel must live in a helper so SAA can hoist it in uniform CF");
  assert.match(chunks, /objPos\.xz \* 34\.0 \+ objPos\.y \* 29\.0/,
    "orange-peel coarse scale must match GLX vObjPos.xz * 34");
  assert.match(chunks, /objPos\.xz \* 130\.0 \+ objPos\.y \* 111\.0/,
    "orange-peel fine scale must match GLX vObjPos.xz * 130");
  assert.match(chunks, /svnoise\(puv\) \* 0\.6 \+ svnoise\(fuv\) \* 0\.4/,
    "peel must use surface-family svnoise (hash21), not sky vnoise (hash2)");
  assert.match(chunks, /floor\(in\.objPos \* 220\.0\)/,
    "flake cells must use the GLX 220 Hz object-space grid");
  assert.match(chunks, /hash21\(cell\.xy \+ cell\.z \* 19\.7\)/,
    "flake hash must match GLX hash21(cell.xy + cell.z * 19.7)");
  assert.doesNotMatch(chunks.replace(/^[ \t]*\/\/.*$/gm, ""), /floor\(in\.wpos \* 45\.0\)/,
    "do not cell flake in world space — that is the swim");
  assert.match(lit, /vObjPos = aPos/,
    "GLX still keys paint to object space — WGX is the port");
  assert.match(tsl, /positionGeometry/,
    "TLX still keys paint to object space — WGX is the port");
});

test("WGX SAA mixes geometric N with a uniform-CF peel hoist", () => {
  const chunks = read("js/render/webgpu/wgsl-chunks.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(chunks, /let Npeel = paintPeelN\(topNgeo, in\.objPos, vDist, peelAmt\)/,
    "peel normal for SAA must be computed at fs_main top (uniform CF)");
  // The peel's cost gate is a uniform early return INSIDE paintPeelN (amt from
  // D.mat1.w), so non-paint draws skip the 6-svnoise body while the caller's
  // derivatives stay at fs_main top level.
  assert.match(chunks, /let peelAmt = select\(0\.0, 1\.0, D\.mat1\.w > 0\.001\)/,
    "peel amt gates on the per-draw carPaint uniform");
  assert.match(chunks, /fn paintPeelN[\s\S]{0,600}?if \(amt <= 0\.0\) \{ return N; \}/,
    "paintPeelN early-returns (uniform) when the peel is mixed by 0 anyway");
  assert.match(chunks, /let saaDxPeel = dpdx\(Npeel\)/,
    "SAA must take peel derivatives, not only geometric N");
  assert.match(chunks, /mix\(saaVarGeo, saaVarPeel, saturate\(carPaint\)\)/,
    "paint fragments get peel SAA; carbon/rubber stay on geometric N");
});

test("WGX hoists every pack layer with textureSample so walls match GLX aniso", () => {
  const chunks = read("js/render/webgpu/wgsl-chunks.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(chunks, /fn matUvLit\(/,
    "constant-layer UV helper for the fs_main hoist");
  // The per-layer hoist collapsed to ONE dynamic-layer tap (WGSL allows
  // non-uniform layer/UV expressions; only the CALL must sit in uniform CF —
  // GLX's texture() path exactly). The invariant that matters is unchanged:
  // implicit-LOD textureSample, never SampleLevel, so walls keep aniso.
  assert.match(chunks, /textureSample\(matAlbedoTex, matSamp, uvSel, midClamp\)/,
    "pack albedo must use implicit-LOD textureSample, not SampleLevel");
  assert.match(chunks, /textureSample\(matNormalTex, matSamp, uvSel, midClamp\)/,
    "pack normal must use implicit-LOD textureSample, not SampleLevel");
  assert.match(chunks, /let uvSel = matUvLit\(midClamp, topNgeo, in\.wpos\)/,
    "the tap's UV keeps matUvLit's wall-vs-ground plane selection");
  // (glass/flag — mids 3/15 — keep their explicit-LOD fallback inside
  // applyMaterial's non-uniform branch; that path is deliberate.)
  assert.match(chunks, /let hoisted = packOn && mid >= 1 && mid <= 16 && mid != 3 && mid != 15/,
    "glass/flag stay off the hoist; everything else picks the hoisted tap");
  const peelLit = chunks.indexOf("N = paintPeelN(N, in.objPos, vDist, carPaint)");
  const bump = chunks.indexOf("applyMaterialNormal(i32(vMatId + 0.5), &N, vDist, in.wpos, fwWpos, litNrm, packOn)");
  assert.ok(peelLit > 0 && bump > peelLit,
    "wall bump must run after peel like GLX, not before detail");
});

test("GLX/TLX SAA snapshot N before wall bump so walls match WGX", () => {
  // WGX cannot dpdx after applyMaterialNormal (non-uniform matId). GLX used
  // to dFdx the bumped N, which widened roughness on every brick/concrete
  // seam and made WebGL2 walls duller than WebGPU. Snapshot after peel,
  // before the material bump; lighting still uses the bumped N.
  const lit = read("js/render/shaders/lit.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const tsl = read("js/render/three/tsl-lit.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const post = read("js/render/glx/post.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(lit, /vec3 Nsaa = N;/,
    "GLX must snapshot N after peel, before applyMaterialNormal");
  assert.match(lit, /saaDx = dFdx\(Nsaa\)/,
    "GLX SAA must differentiate the pre-material snapshot");
  assert.doesNotMatch(lit, /saaDx = dFdx\(N\)/,
    "do not dFdx the bumped wall N — that is the dull-wall look");
  assert.match(tsl, /const Nsaa = vec3\(N\)\.toVar\(\)/,
    "TLX must snapshot N after peel, before applyMaterialNormal");
  assert.match(tsl, /dFdx\(Nsaa\)/,
    "TLX SAA must differentiate the pre-material snapshot");
  assert.match(post, /Math\.min\(4, cMax, dMax\)/,
    "desktop GLX MSAA must pick 4× like WGX, not the old 2× cap");
});

test("pcssPen help names desktop three.js WebGL2 as live", () => {
  const lighting = read("js/game/lighting.js");
  assert.match(lighting, /three\.js desktop WebGL2/,
    "SHADOW SOFTEN help must not still say three.js WebGL2 is a no-op");
  assert.doesNotMatch(lighting, /this slider does nothing on that path only/,
    "phones / software WebGL2 now scale Poisson R — do not call the slider a no-op");
  assert.match(lighting, /scales the fixed Poisson radius/,
    "help must name the software/phone R-scale so the slider is not a mystery");
});

test("GLX present reuses scratch vectors and skip-equals grade", () => {
  const h = bootGlx();
  const opts = { grade: { shadow: [0.9, 0.95, 1.0], hi: [1, 1, 1], str: 0.3 } };
  h.GLX.begin(h.frame()); h.GLX.present(opts);
  h.reset();
  h.GLX.begin(h.frame()); h.GLX.present(opts);
  assert.equal(h.count("uniform3f", (a) => a[0].name === "uGradeShadow"), 0, "an unchanged split-tone grade is not re-uploaded");
  h.reset();
  h.GLX.begin(h.frame()); h.GLX.present({ grade: { shadow: [0.8, 0.95, 1.0], hi: [1, 1, 1], str: 0.3 } });
  assert.equal(h.count("uniform3f", (a) => a[0].name === "uGradeShadow"), 1, "a changed grade uploads once");
  const post = code("js/render/glx/post.js");
  assert.match(post, /\b_ONE3\s*=\s*\[\s*1\s*,\s*1\s*,\s*1\s*\]/, "neutral grade / sunColor fallback must not allocate [1,1,1] per frame");
  assert.match(post, /\b_NEGZ\s*=\s*\[\s*0\s*,\s*0\s*,\s*-1\s*\]/, "sunVS fallback must not allocate [0,0,-1] per frame");
  assert.doesNotMatch(post, /uniform3fv\(\s*compU\.uGradeShadow/, "do not bypass _compUf for uGradeShadow");
});

test("WGX COMPOSITE declares ssrWet and does not remul wetness", () => {
  // d6c8fa17 dropped `let ssrWet = U.lift.w` and left `if (ssrWet > 0.001)` —
  // Dawn rejected the identifier and shed COMPOSITE. Deploy re-declares the
  // let so a leftover use compiles; wetness still lives in the SSR pass .a,
  // so the consume gate must not remultiply it.
  const post = read("js/render/webgpu/wgsl-post.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(post, /let ssrWet = U\.lift\.w/,
    "COMPOSITE must declare ssrWet so Dawn does not reject a leftover use");
  assert.doesNotMatch(post, /ssrWet \* ssrRefl/,
    "do not remultiply wetness * reflect — that zeros dry sheen");
  assert.match(post, /if \(ssrRefl > 0\.001 \|\| ssrCar > 0\.001\)/,
    "SSR consume gate is reflect || carReflect, not the wetness lane");
});

test("WGX bloom final upsample overwrites mip0 like GLX/TLX", () => {
  const wgx = read("js/render/webgpu/wgx.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(wgx, /loadOp: last \? "clear" : "load"/,
    "mip0 upsample must clear (overwrite the sharp bright-pass), not load+add");
});

test("WGX screen sun-shaft is zero when bloom is shed", () => {
  const wgx = read("js/render/webgpu/wgx.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(wgx, /shaftMul = \(bloomAmt > 0 && sun && sun\.shaft > 0\)/,
    "shaft pass reads the bloom chain — producer must say 0 when bloomAmt is 0");
});

test("WGX godray requires invViewProj like GLX/TLX", () => {
  const wgx = read("js/render/webgpu/wgx.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(wgx, /godrayBG && lastFrame && lastFrame\.invViewProj/,
    "haveGR without invVP marches IDENT world rays");
});

test("TLX godray uses partial nearest-K, not a full sort", () => {
  // _grKeepNearest itself (present in all three backends, swap-not-overwrite
  // eviction) is driven by tests/unit/godray-keep-nearest.test.mjs.
  const tlx = code("js/render/three/tlx-post.js");
  assert.match(tlx, /grNL\s*=\s*_grKeepNearest\(\s*total\s*,\s*6\s*\)/, "uploader cap must stay 6 (TSL march bound)");
  assert.doesNotMatch(tlx, /_grSel\.sort\(/, "do not full-sort the floodlight list every night frame");
});

test("TLX software/phone WebGL2 scales Poisson R from pcssPen", () => {
  const tsl = read("js/render/three/tsl-lit.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(tsl, /R\.assign\(float\(3\.0\)\.mul\(U\.pcssPen\.div\(80\.0\)\)\)/,
    "blocker-off path must scale R by pcssPen/80 (identity at the shipped def)");
  assert.match(tsl, /\}\)\.Else\(\(\) => \{/,
    "desktop blocker-on / PCSS-off path must also scale R (not freeze at 3.0)");
  assert.equal((tsl.match(/R\.assign\(float\(3\.0\)\.mul\(U\.pcssPen\.div\(80\.0\)\)\)/g) || []).length, 2,
    "both the no-blocker else and the PCSS-off Else must scale R");
});

test("lamp bounce ALU is gated when bounceK is 0 on all three backends", () => {
  const glx = read("js/render/shaders/lit.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const wgsl = read("js/render/webgpu/wgsl-chunks.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const tsl = read("js/render/three/tsl-lit.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(glx, /if \(uBounceK > 0\.0\)/,
    "GLX lamp bounce must skip when LAMP BOUNCE is 0");
  assert.match(wgsl, /if \(F\.params3\.x > 0\.0\)/,
    "WGX lamp bounce must skip when bounceK is 0");
  assert.match(tsl, /If\(U\.bounceK\.greaterThan\(0\.0\)/,
    "TLX lamp bounce must skip when bounceK is 0");
});

test("WGX SSAO kernel is the GLX/TLX K[0..7] fan, not an even ring", () => {
  const post = read("js/render/webgpu/wgsl-post.js");
  assert.match(post, /const SSAO_K = array<vec2<f32>, 8>/,
    "WGX SSAO must name the shared 8-tap fan");
  assert.match(post, /vec2<f32>\(0\.0, 1\.0\).*vec2<f32>\(-0\.5, -0\.866\)/s,
    "kernel must be the first 8 of GLX K[12]");
  assert.doesNotMatch(post.replace(/^[ \t]*\/\/.*$/gm, ""),
    /\(f32\(i\) \+ 0\.5\) \/ 8\.0 \* 6\.2832/,
    "do not rebuild an even 2π ring — that is the look gap vs GLX/TLX");
});

test("HDR grade is gated on all three backends when knobs are neutral", () => {
  // applyHdrGrade at shipped defaults is an identity that still costs ~20 ALU
  // + transcendentals per full-res pixel. GLX/TLX skip it; WGX used to always
  // run it (and the max(c,0) clamp is the only non-identity).
  const glx = read("js/render/shaders/post.js");
  assert.match(glx, /if \(uHdrGradeOn > 0\.5\) c = applyHdrGrade\(c\)/,
    "GLX composite must keep the uHdrGradeOn gate");
  const wgsl = read("js/render/webgpu/wgsl-post.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(wgsl, /if \(U\.tone1\.w > 0\.5\) \{ c = applyHdrGrade\(c\); \}/,
    "WGX must gate applyHdrGrade on tone1.w (hdrGradeOn)");
  assert.doesNotMatch(wgsl, /^\s*c = applyHdrGrade\(c\);/m,
    "do not always run applyHdrGrade — that is the skip-path drift vs GLX/TLX");
  const wgx = read("js/render/webgpu/wgx.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(wgx, /s\[43\] = _hg \? 1 : 0/,
    "WGX must pack hdrGradeOn into the tone1.w pad");
  const tsl = read("js/render/three/tsl-post.js");
  assert.match(tsl, /hdrGradeOn\.greaterThan\(0\.5\)/,
    "TLX composite must keep the hdrGradeOn gate");
  const tlxPost = read("js/render/three/tlx-post.js");
  assert.match(tlxPost, /C\.hdrGradeOn\.value = _hg \? 1 : 0/,
    "TLX must still compute the same off-neutral _hg mask as GLX");
});

test("TLX software sky fallback is a zenith-horizon mix, not a flat lid", () => {
  const sky = read("js/render/three/tsl-sky.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(sky, /mix\(U\.zenith,\s*U\.horizon,\s*t\)/,
    "fallbackNode must mix the same zenith/horizon uniforms the full sky reads");
  assert.doesNotMatch(sky, /fallbackNode = Fn\(\(\) => vec4\(U\.zenith, 1\.0\)\)/,
    "do not fall back to a flat zenith lid — that is the washed software-GL sky");
});

test("TLX desktop WebGL2 builds a color-depth PCSS blocker", () => {
  const sh = read("js/render/three/tlx-shadow.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(sh, /colorPcss/,
    "WebGL2 desktop must take the depth-in-color blocker path");
  assert.match(sh, /TSL\.depth/,
    "sun casters must write TSL.depth into the R16F color attachment");
  assert.match(sh, /colorPcss \? sunRT\.texture : sunRT\.depthTexture/,
    "WebGL2 blocker taps the color attachment, WebGPU still textureLoads depth");
});

test("WGX SSR car streak uses carGloss like GLX/TLX", () => {
  // A single tap left CAR GLOSS dead on WebGPU and night lamps as hard dots.
  const post = read("js/render/webgpu/wgsl-post.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const glx = read("js/render/shaders/post.js");
  const tsl = read("js/render/three/tsl-post.js");
  assert.match(post, /gloss\s*:\s*vec4<f32>/,
    "SsrU must carry carGloss");
  assert.match(post, /clamp\(\(1\.4 - U\.gloss\.x\) \* 0\.5, 0\.0, 1\.0\)/,
    "carSoft must match GLX (1.4 - uCarGloss) * 0.5");
  assert.match(post, /carReflect \* \(0\.006 \+ 0\.030 \* carSoft\)/,
    "car streak width must match GLX uCarReflect * (0.006 + 0.030 * carSoft)");
  assert.match(post, /hitDist \/ 25\.0/,
    "contact hardening must scale the streak by march hit distance");
  assert.match(glx, /float carSoft = clamp\(\(1\.4 - uCarGloss\) \* 0\.5/,
    "GLX still owns the carSoft formula — WGX is the port");
  assert.match(tsl, /float\(1\.4\)\.sub\(C\.carGloss\)\.mul\(0\.5\)/,
    "TLX still owns the carSoft formula — WGX is the port");
  const wgx = read("js/render/webgpu/wgx.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(wgx, /s\[48\] = \(T && T\.carGloss != null\) \? T\.carGloss : 1\.0/,
    "WGX must pack carGloss into SsrU gloss.x");
});

test("WGX SSR is consumed same-frame in COMPOSITE, not next-frame LIT", () => {
  const post = read("js/render/webgpu/wgsl-post.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(post, /binding\(8\) var ssrPostTex/,
    "COMPOSITE must bind this-frame ssrTex");
  assert.match(post, /ssrPostTex/,
    "COMPOSITE must sample the SSR target");
  const lit = read("js/render/webgpu/wgsl-chunks.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.doesNotMatch(lit, /wetSheen > 0\.001 && ssrStrength > 0\.001/,
    "LIT must not still mix last frame's ssrTex into wet road");
});

test("WGX SSR consume/march/sinT match GLX (no wetness remul, dry sheen lives)", () => {
  const post = read("js/render/webgpu/wgsl-post.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.doesNotMatch(post, /ssrWet \* ssrRefl/,
    "COMPOSITE must not remultiply wetness * reflect — that zeros dry sheen");
  assert.match(post, /ssr\.rgb \* aoV \* aoV/,
    "COMPOSITE must apply Lagarde ao² to reflected RGB like GLX");
  assert.match(post, /clamp\(ssr\.a, 0\.0, 0\.85\)/,
    "COMPOSITE must mix by the pass .a (already gated + dry-faded)");
  assert.match(post, /sinT > 0\.08/,
    "SSR Nv must use the GLX/TLX scale-free sinT fallback");
  assert.match(post, /var stepLen = 0\.55/,
    "march start must match GLX 0.55 m, not the old 0.40");
  assert.match(post, /stepLen = stepLen \* 1\.16/,
    "march growth must match GLX 1.16, not the old 1.15");
  assert.match(post, /for \(var j = 0; j < 4; j = j \+ 1\)/,
    "binary refine must be 4 like GLX, not 5");
  assert.match(post, /min\(gateSrc \/ 0\.20, 1\.0\)/,
    "SSR pass must apply the dry-sheen fade once so COMPOSITE can trust .a");
  assert.match(post, /let ssrWet = U\.lift\.w/,
    "COMPOSITE must declare ssrWet = U.lift.w so Dawn does not reject a leftover use");
  assert.equal((post.match(/let gateSrc/g) || []).length, 1,
    "do not redeclare gateSrc — Dawn refuses SSR and sheds the whole post chain");
  assert.equal((post.match(/min\(gateSrc \/ 0\.20, 1\.0\)/g) || []).length, 1,
    "a merge leftover applied the dry damp twice (and squared the sheen)");
});

test("WGX SAA widens roughness before wet like GLX", () => {
  const chunks = read("js/render/webgpu/wgsl-chunks.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const saa = chunks.indexOf("let saaVar = mix(saaVarGeo, saaVarPeel");
  const wet = chunks.indexOf("if (wetness > 0.001)");
  assert.ok(saa > 0 && wet > saa,
    "SAA after wet extra-widens puddle edges — GLX widens, then polishes");
  assert.match(chunks, /a = rough \* rough;/,
    "wet must recompute a after polishing, like GLX lit.js");
});

test("TLX FS mat stays a smooth attribute (flat varying blanks the garage car)", () => {
  const tsl = read("js/render/three/tsl-lit.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(tsl, /const matA = float\(attribute\("mat", "float"\)\)\.toVar\(\)/,
    "FS must read attribute(mat) directly — varying()+FLAT made the garage car vanish");
  assert.doesNotMatch(tsl, /InterpolationSamplingType\.FLAT/,
    "do not setInterpolation(FLAT) on mat — three r185 compiled it and drew nothing");
  assert.match(tsl, /const matA = attribute\("mat", "float"\)/,
    "FLAG VS wave must keep the per-vertex attribute (fract(aMat) weight)");
  assert.match(tsl, /const ridgePhase0 = hc\.mul\(7\.5\)/,
    "corrugation fwidth must match GLX hc*7.5, not abs(hc)*5.5");
});

test("TLX SSAO does not flip N.z; SSR self-hit still does", () => {
  const tsl = read("js/render/three/tsl-post.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const ssao = tsl.slice(0, tsl.indexOf("Contact shadows"));
  assert.doesNotMatch(ssao, /If\(N\.z\.lessThan\(0\.0\)/,
    "GLX SSAO does not flip N.z — the coin toss darkens walls");
  assert.match(tsl, /If\(hN\.z\.lessThan\(0\.0\)/,
    "SSR grazing self-hit reject still flips hN like GLX");
});

test("road-marking mip uses unclamped fwX on all three backends", () => {
  const glx = read("js/render/shaders/lit.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const tsl = read("js/render/three/tsl-lit.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const chunks = read("js/render/webgpu/wgsl-chunks.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(glx, /float fwX = max\(fwidth\(x\), 1e-4\)/,
    "GLX mip must read raw fwidth, not the clamped aaX (0.30 ceiling → mip 0)");
  assert.match(glx, /1\.0 - \(fwX - 0\.10\) \/ 0\.55/,
    "GLX mip knee must match WGX 0.10/0.55");
  assert.match(tsl, /const fwX = max\(fwidth\(x\), 1e-4\)/,
    "TLX mip must read raw fwidth like WGX/GLX");
  assert.match(tsl, /fwX\.sub\(0\.10\)\.div\(0\.55\)/,
    "TLX mip knee must match WGX 0.10/0.55");
  assert.match(chunks, /let fwX = max\(fwTrk\.y, 1e-4\)/,
    "WGX still owns the unclamped form");
});

test("SSAO tap setup is skipped when strength is 0 on all three backends", () => {
  // Contact shadows keep the pass live at aoStr=0; the 8 dependent depth
  // fetches must not still run. strength/uStrength is a uniform.
  const glx = read("js/render/shaders/post.js");
  assert.match(glx, /if \(uStrength > 0\.0\)/,
    "GLX SSAO must keep the uStrength tap gate");
  const wgsl = read("js/render/webgpu/wgsl-post.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(wgsl, /if \(strength > 0\.0\)/,
    "WGX SSAO must skip the 8-tap loop when AO strength is 0");
  const tsl = read("js/render/three/tsl-post.js");
  assert.match(tsl, /ssaoU\.strength\.greaterThan\(0\.0\)/,
    "TLX SSAO must skip the 8-tap loop when AO strength is 0");
});

test("Gfx seam lists instancing on all three backends", () => {
  const gfx = read("js/render/gfx.js");
  assert.match(gfx, /GLX \+ WGX \+ TLX implement the family/,
    "gfx.js must not still say TLX exports instancing as undefined");
});

test("TLX garage (no proj) paints the canvas, not the HDR scene target", () => {
  // Setup preview only sends viewProj. The HDR RT stayed black on software
  // GL (viz=scene was empty) so the turntable vanished while GLX was fine.
  const src = read("js/render/three/tlx.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(src, /if \(post && _postF\.proj\)/,
    "post chain must require begin() proj — garage frames must not render into sceneRT");
});

test("TLX copies matrix → matrixWorld on every pooled mesh (cars otherwise sit at origin)", () => {
  // scene.matrixWorldAutoUpdate is false; three uploads matrixWorld as the
  // model matrix. Writing only `.matrix` left cars/flaps/shadows at identity —
  // invisible on track (world-space chase cam), fine in the garage (car near
  // origin). World-baked track still looked correct with identity.
  const src = TLX.replace(/^[ \t]*\/\/.*$/gm, "").replace(/^\s*\*.*$/gm, "");
  assert.match(src, /matrixWorldAutoUpdate\s*=\s*false/,
    "matrixWorldAutoUpdate latch moved — re-check whether acquireMesh still must promote");
  const acq = src.indexOf("function acquireMesh");
  assert.notEqual(acq, -1, "acquireMesh moved");
  const body = src.slice(acq, acq + 1400);   // the occurrence-keyed lookup (2026-09-02) sits before the stamp
  assert.match(body, /matrixWorld\.copy\(\s*m\.matrix\s*\)/,
    "acquireMesh must promote m.matrix into matrixWorld — without it every " +
    "draw() with a non-identity model (cars) renders at the world origin");
});

test("three's WebGPU backend still maps the alpha parameter to the canvas alphaMode", () => {
  // Makes the assertion above SUFFICIENT for that backend. If three stops
  // reading the parameter, alpha:false becomes a no-op and cars ghost again on
  // desktop WebGPU with nothing failing.
  assert.match(THREE_BUNDLE, /alpha\s*\?\s*"premultiplied"\s*:\s*"opaque"/,
    "bundled three no longer derives alphaMode from the alpha parameter");
});

test("TLX supplies its own WebGL2 context, because three hardcodes alpha there", () => {
  const params = rendererParams();
  assert.match(params, /context:/,
    "the WebGL path needs a caller-supplied context: three ignores alpha:false there");

  // The context TLX makes must itself be opaque, and must only be made for the
  // WebGL path — three's WebGPU backend reads parameters.context too and would
  // try to configure a WebGL2 context as a WebGPU one.
  const at = TLX.indexOf('getContext("webgl2"');
  assert.notEqual(at, -1, "TLX no longer creates its own WebGL2 context");
  const call = TLX.slice(at, at + 500);
  assert.match(call, /alpha:\s*false/, "TLX's own context must be opaque");
  const guard = TLX.slice(Math.max(0, at - 400), at);
  assert.match(guard, /if\s*\(\s*forceWebGL\s*\)/,
    "the hand-made WebGL2 context must be gated on forceWebGL");
});

test("the hand-made WebGL2 context still matches three's own attribute set", () => {
  // Supplying `context` means three stops deriving the attributes and we own
  // ALL of them, not just the one we came to change. Today ours is three's set
  // byte for byte except alpha:
  //   three: { antialias: currentSamples > 0, alpha: !0, depth: e.depth, stencil: e.stencil }
  //   ours:  { antialias: !isMobile,           alpha: false, depth: true,  stencil: false }
  // and those agree only because TLX overrides neither depth nor stencil, so
  // the renderer holds three's defaults — depth true, stencil false. Should a
  // three bump default stencil back to true, its passes would want a stencil
  // buffer that our context never asked for, and nothing else would notice.
  assert.match(THREE_BUNDLE, /depth:\w+=!0,stencil:\w+=!1/,
    "three's depth/stencil defaults moved — re-derive the context TLX hands it");

  const tlx = read("js/render/three/tlx.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const ctx = tlx.match(/getContext\("webgl2",\s*\{([^}]*)\}/);
  assert.ok(ctx, "TLX no longer makes its own WebGL2 context");
  assert.match(ctx[1], /depth:\s*true/, "context must request depth (three's default)");
  assert.match(ctx[1], /stencil:\s*false/, "context must match three's stencil default");
  // Not cosmetic either: three's antialias becomes samples>0 on the DEFAULT
  // canvas target, so a context that disagrees with the renderer gets a
  // multisample resolve mismatch on the very path this fix exists to protect.
  assert.match(ctx[1], /antialias:\s*!isMobile/, "context AA must track the renderer's forceWebGL path");
  assert.match(tlx, /antialias:\s*forceWebGL\s*\?\s*!isMobile\s*:\s*!_liteGpu\b/,
    "lite WebGPU (phone / WebKit / software) must not ask for canvas MSAA 4");
});

test("GLX and TLX road-marking mip use the raw footprint, like WGX", () => {
  const glx = read("js/render/shaders/lit.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const tsl = read("js/render/three/tsl-lit.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(glx, /float fwX = max\(fwidth\(x\), 1e-4\);/,
    "GLX must keep the unclamped lateral footprint for mip");
  assert.match(glx, /float mip = clamp\(1\.0 - \(fwX - 0\.10\) \/ 0\.55, 0\.0, 1\.0\);/,
    "GLX mip must match the WGX knee — not the clamped aaX");
  assert.match(tsl, /fwX\.sub\(0\.10\)\.div\(0\.55\)\.oneMinus\(\)/,
    "TLX mip must match the WGX knee — not the clamped aaX");
});

test("WGX's canvas is opaque too — it writes the same tag with NO gate", () => {
  // The tag is not a TLX idea: WGX writes it from the same GLX lineage —
  //   return vec4<f32>(color, select(alpha, 0.35, carPaint > 0.001));
  // — and unlike TLX's, that line has no ssrTag gate at all, so EVERY WGX frame
  // carries 0.35 over car paint whether or not anything reads it. What makes
  // that safe is one word in the context configure, and nothing was checking
  // it. All three backends now hold the same invariant for the same reason:
  // GLX `alpha: false`, WGX `alphaMode: "opaque"`, TLX both spellings.
  const wgx = read("js/render/webgpu/wgx.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(wgx, /\.configure\(\{[^}]*alphaMode:\s*"opaque"/,
    "WGX must configure an OPAQUE canvas — it tags alpha on every frame");

  const chunks = read("js/render/webgpu/wgsl-chunks.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(chunks, /select\(alpha,\s*0\.35,\s*carPaint\s*>\s*0\.001\)/,
    "the ungated WGX car-paint tag moved — recheck what its canvas opacity is carrying");
});

test("three's WebGL backend still hardcodes an alpha canvas (why we pass a context)", () => {
  // Makes the assertion above NECESSARY. When three starts honouring the
  // parameter on this backend, the hand-made context can go — and this is the
  // test that says so, instead of it sitting there forever as cargo cult.
  const at = THREE_BUNDLE.indexOf('getContext("webgl2",');
  assert.notEqual(at, -1, "three's WebGL context creation moved");
  const attrs = THREE_BUNDLE.slice(Math.max(0, at - 260), at);
  assert.match(attrs, /alpha:\s*!0/,
    "bundled three no longer hardcodes alpha:true for WebGL — drop TLX's " +
    "hand-made context and pass alpha:false alone");
  assert.match(THREE_BUNDLE.slice(at, at + 60), /getContext\("webgl2",\s*\w+\)/);
});

test("TLX env probe culls and lights like GLX — not the chase camera", () => {
  // envFaceBegin used to return only invViewProj. drawWorldMeshes then
  // frustum-culled propBatches against the MAIN view, and envFaceEnd ran
  // before gfx.begin() so the cube baked last-frame (or default) lighting.
  // Software faces still latch envReady for M9, but a black cube must not
  // raise uEnvStr (clearcoat absorb toward black).
  const src = TLX.replace(/^[ \t]*\/\/.*$/gm, "").replace(/^\s*\*.*$/gm, "");
  const beginAt = src.indexOf("envFaceBegin(face, eye, frame)");
  assert.notEqual(beginAt, -1, "envFaceBegin moved");
  const beginBody = src.slice(beginAt, beginAt + 1800);
  assert.match(beginBody, /frame\.viewProj\s*=\s*_envVPArr/,
    "probe must publish the face VP so propBatches cull against the cube face");
  assert.match(beginBody, /frame\.eye\s*=\s*eye/,
    "probe eye must be the car, not the chase camera");
  assert.match(beginBody, /ENV_CULL_M/,
    "probe must cap draw distance like GLX (300 m when envCull is on)");
  assert.match(beginBody, /lit\.updateFrame\(frame\)/,
    "probe runs before gfx.begin — updateFrame must push this frame's lighting");
  const endAt = src.indexOf("envFaceEnd(face)");
  assert.notEqual(endAt, -1, "envFaceEnd moved");
  const endBody = src.slice(endAt, endAt + 3600);
  assert.match(endBody, /_restoreEnvFrame\(\)/,
    "envFaceEnd must restore the main-camera VP/eye/cullDist");
  assert.match(endBody, /_envBlank\s*=\s*true/,
    "software black-clear cycle must mark the cube blank");
  assert.match(src, /envReady && !_envBlank && !frame\.noEnv/,
    "uEnvStr must stay 0 while the cube is a software black stub");
});

test("TLX car SSR tag lives on a second HDR attachment, not scene alpha", () => {
  // r185 isOpaque() is false for NoBlending, so output.a is coverage.
  // The 0.35 paint tag therefore cannot share the colour target. It is
  // written to sceneRT.textures[1] (name ssrTag) via mrtNode, armed only
  // for the main HDR render so the env cube stays a single-target RT.
  const lit = TSL_LIT.replace(/^[ \t]*\/\/.*$/gm, "").replace(/^\s*\*.*$/gm, "");
  assert.match(lit, /mrt\(\{\s*output:\s*out,\s*ssrTag:\s*packed\.a\s*\}\)/,
    "lit mrtNode must write packed.a (the 0.35 tag) to the ssrTag attachment");
  assert.match(lit, /function setSsrMrt\(on\)/,
    "env / canvas paths must be able to drop mrtNode");
  assert.match(lit, /mrtNode \? "-mrt"/,
    "program key must fork when MRT is armed — one program cannot target both RTs");
  const post = read("js/render/three/tlx-post.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(post, /count:\s*2/,
    "HDR scene target must allocate the ssrTag colour attachment");
  assert.match(post, /textures\[1\]\.name\s*=\s*"ssrTag"/,
    "MRTNode.setup matches attachments by texture.name");
  const tsl = read("js/render/three/tsl-post.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(tsl, /tagT\.sample\(TL\(vUV\)\)\.r/,
    "heat haze must skip car pixels using the tag RT, not scene alpha");
  assert.match(tsl, /tagT\.sample\(TL\(hazeUV\)\)\.r/,
    "carPx / car SSR must read the tag RT");
  assert.doesNotMatch(tsl.replace(/\/\*[\s\S]*?\*\//g, ""), /carPx = smoothstep\([^)]*scn\.a/,
    "carPx must not still key off scn.a");
  const tlx = TLX.replace(/^[ \t]*\/\/.*$/gm, "").replace(/^\s*\*.*$/gm, "");
  const hdr = tlx.indexOf("post.sceneTarget()");
  assert.notEqual(hdr, -1, "HDR present path moved");
  const window = tlx.slice(Math.max(0, hdr - 800), hdr + 400);
  assert.match(window, /setSsrMrt\(true\)/,
    "main HDR render must arm the ssrTag MRT");
  assert.match(window, /renderer\.setMRT\(/,
    "renderer.getMRT() is what NodeMaterial.setup merges into");
  const envEnd = tlx.indexOf("envFaceEnd(face)");
  const envBody = tlx.slice(envEnd, envEnd + 3600);
  assert.doesNotMatch(envBody, /setSsrMrt\(true\)/,
    "env cube must not arm the 2-attachment program");
  assert.doesNotMatch(envBody, /setMRT\(/,
    "env cube render must not install a renderer MRT");
});

// uNumLights is uploaded 111 times a frame (vegas night, full field in a pack)
// for 53.7 distinct values — uploadLightSet sets the count unconditionally, and
// the per-chunk path calls it once per visible chunk, including the many that
// return immediately on a count of 0. The redundancy cache that collapses that
// is only sound because of two facts, and this pins both:
//
//  1. ONE WRITER. A WebGL uniform is per-PROGRAM state, so the cached value
//     survives every unbind — but only while nothing else writes it on the lit
//     program. post.js's godray pass has its own uNumLights on its own program
//     and cannot collide; a SECOND writer on the lit program would make the
//     cache lie, and this is the assertion that would catch it.
//  2. RESET AT RELINK. A relink resets every uniform on the program, so the
//     cache has to be cleared where the locations are re-fetched.
test("GLX caches uNumLights, and nothing else writes it on the lit program", () => {
  const h = bootGlx();
  const one = Array.from({ length: 15 }, (_, i) => i + 1);
  const nl = () => h.count("uniform1i", (a) => a[0].name === "uNumLights");
  h.GLX.begin(h.frame({ lights: one }));
  h.reset();
  h.GLX.begin(h.frame({ lights: one }));
  h.GLX.begin(h.frame({ lights: one }));
  assert.equal(nl(), 0, "uploadLightSet skips an unchanged uNumLights");
  h.reset();
  h.GLX.begin(h.frame({ lights: one.concat(one) }));
  assert.equal(nl(), 1, "a changed count uploads once");
  assert.equal(h.calls.find((c) => c[0] === "uniform1i" && c[1][0].name === "uNumLights")[1][1], 2);
  h.reset();
  h.GLX.begin(h.frame({ lights: [] }));
  assert.equal(nl(), 1, "a drop to zero is a change too — the per-chunk path's long tail of 0 must still be written once");
  // ONE WRITER. A WebGL uniform is per-PROGRAM state, so the cached value
  // survives every unbind — but only while nothing else writes it on the lit
  // program. post.js's godray pass has its own uNumLights on its own program
  // and cannot collide; a SECOND writer on the lit program would make the
  // cache lie, and this is the assertion that would catch it.
  const bare = code("js/render/glx.js");
  const writers = bare.match(/uniform1i\(\s*litU\.uNumLights/g) || [];
  assert.equal(writers.length, 1,
    `litU.uNumLights has ${writers.length} writers — the cache is only valid with one; ` +
    "route the new one through uploadLightSet or drop the cache");
  // RESET AT RELINK. A relink resets every uniform on the program, so the
  // cache has to be cleared where the locations are re-fetched.
  const at = bare.search(/litU\s*=\s*locs\(\s*litProg\b/);
  assert.notEqual(at, -1, "the lit program's locs() call moved");
  assert.match(bare.slice(Math.max(0, at - 300), at), /_luNL\s*=\s*-1\b/,
    "the uNumLights cache must be cleared where the lit program's locations are re-fetched");
  assert.doesNotMatch(bare, /_matEmissive\s*=[^;]*_luNL/,
    "uNumLights is program state, not per-frame material state — do not reset it in begin()");
});

// uniform3fv ran 32.4 times a frame with 24.3 of those re-sending a value the
// program already held (vegas night, full field). The frame-global sun /
// ambient / fog / sky terms are identical in every begin() — six env-cube
// faces, the shadow pass, the main camera — and identical again next frame on
// a steady condition. uf3 collapses them: measured 31.5 -> 16.3 per frame with
// every other census counter unchanged.
//
// THE TRAP THIS TEST EXISTS FOR: the first version stored into a
// Float32Array(3), mirroring ufM4, and skipped ZERO of 17.5 calls a frame. A
// Float32Array rounds on store, so the compare was the rounded float32 against
// the float64 the caller passed — `cached=0.11999999731779099 in=0.12` — and
// could never match. ufM4 is safe only because M4 hands it Float32Array
// matrices already; these vec3s are plain JS arrays off `frame`. A cache that
// never hits is worse than none: it pays the branch and the allocation to
// change nothing, and NOTHING GOES RED when it regresses, because the render
// is identical either way. Only a call count can tell, so pin the store type.
test("GLX's uf3 cache keeps float64 precision, and owns every lit/sky vec3", () => {
  // THE TRAP THIS TEST EXISTS FOR: the first version stored into a
  // Float32Array(3), mirroring ufM4, and skipped ZERO of 17.5 calls a frame. A
  // Float32Array rounds on store, so the compare was the rounded float32 against
  // the float64 the caller passed — `cached=0.11999999731779099 in=0.12` — and
  // could never match. BEHAVIOUR: a value that is not f32-representable still
  // hits on the second begin().
  const h = bootGlx();
  const f = h.frame({ ambientSky: [0.12, 0.31, 0.47], sunColor: [0.97, 0.91, 0.83] });
  h.GLX.begin(f);
  h.reset();
  h.GLX.begin(h.frame({ ambientSky: [0.12, 0.31, 0.47], sunColor: [0.97, 0.91, 0.83] }));
  assert.equal(h.count("uniform3fv"), 0, "equal float64 vec3s are skipped — a Float32Array store would round and never hit");
  // …and it COPIES: a scratch array mutated in place is a real change.
  const scratch = [0.12, 0.31, 0.47];
  h.GLX.begin(h.frame({ ambientSky: scratch }));
  h.reset();
  scratch[0] = 0.5;
  h.GLX.begin(h.frame({ ambientSky: scratch }));
  assert.equal(h.count("uniform3fv", (a) => a[0].name === "uAmbSky"), 1, "the cache compares values, not the caller's reference");
  // Single writer, the same property the uNumLights and uModel caches need: a
  // raw gl.uniform3fv on either program would desync the cache behind its back.
  const bare = code("js/render/glx.js");
  const raw = bare.match(/gl\.uniform3fv\(\s*(litU|skyU)\./g) || [];
  assert.equal(raw.length, 0,
    `${raw.length} raw gl.uniform3fv call(s) remain on the lit/sky programs (${raw.join(", ")}) — ` +
    "every one must go through uf3 or the cache goes stale");
  // The cache lives in the same two objects uf1/ufM4 use, so it is already
  // cleared where the programs are relinked.
  assert.match(bare, /_clearUf\(\s*_litUf\s*\)\s*;\s*_clearUf\(\s*_skyUf\s*\)/,
    "the lit/sky uniform caches must still be cleared together on relink");
});

// ── The phone route (docs/PERF-FINDINGS.md §2m) ───────────────────────────
// three retains the CPU copy of every geometry attribute after upload —
// measured 71.5 MB across 5,665 buffers against GLX's 17.8 MB / 253 — and an
// iPhone tab is OOM-killed mid-race for it. Releasing those arrays was built
// and DISPROVED live: three re-reads attribute.array after upload in draw()
// and in updateAttribute(), and each read takes the renderer down. So a phone
// that picks three binds GLX instead. Three things have to stay true, and
// each one of them has failed somewhere in this file's history.
test("TLX declines on a phone, with a REASON, and an override that works", () => {
  const tlx = read("js/render/three/tlx.js");

  // 1. The route exists and goes through _fail — the seam that records
  //    apex26.gfxTlxFail and flips gfxBound so SETTINGS can show why.
  const route = tlx.match(/if\s*\(isMobile\s*&&\s*!_mobileOptIn\)\s*\{\s*\n\s*return _fail\((["'`])([\s\S]*?)\1\s*\);/);
  assert.ok(route, "TLX no longer routes phones to GLX — the iPhone OOM is back");

  // 2. The reason is a REASON, not a label. A bare "mobile" in the SETTINGS
  //    panel tells the player nothing about what to do next, and this string
  //    is the only place the override is discoverable.
  const reason = route[2];
  assert.ok(reason.length > 40, `decline reason too thin to act on: ${JSON.stringify(reason)}`);
  assert.match(reason, /apex26\.tlxMobile/,
    "the decline reason must name the override key — it is the player's only way back to TLX");

  // 3. The override is real and defaults OFF. A gate with no way past it is a
  //    removal, not a route; a gate that defaults ON is not a gate at all.
  const optIn = tlx.match(/const _mobileOptIn = \(function \(\) \{[\s\S]*?\}\)\(\);/);
  assert.ok(optIn, "the apex26.tlxMobile override is gone — phones can no longer opt back in");
  assert.match(optIn[0], /localStorage\.getItem\("apex26\.tlxMobile"\) === "1"/,
    "override must be an explicit opt-IN, so the default stays the renderer that survives");
  assert.match(optIn[0], /catch \(_\) \{ return false; \}/,
    "blocked storage must fall to the SAFE side (decline), not to TLX");

  // 4. Order matters: the decline has to happen before create() imports three
  //    and builds a renderer, or the phone pays the memory anyway.
  const declineAt = tlx.indexOf("if (isMobile && !_mobileOptIn)");
  const importAt = tlx.indexOf('await import("three/webgpu")');
  assert.ok(declineAt > 0 && importAt > 0 && declineAt < importAt,
    "the phone decline must come BEFORE three is imported — otherwise the tab still pays for it");
});

// The release approach is disproved, not merely unused. If a future round
// reaches for it again, these two three.js source facts are why it cannot
// work — asserted against the VENDORED bundle so a version bump re-checks them
// rather than letting the comment go stale.
test("three still re-reads attribute.array after upload (why the release fix is impossible)", () => {
  const three = read("vendor/three-0.185.1/three.webgpu.min.js");

  // draw(): firstVertex *= index.array.BYTES_PER_ELEMENT, every indexed draw.
  assert.match(three, /\*=\s*\w+\.array\.BYTES_PER_ELEMENT/,
    "three no longer scales firstVertex by index.array — re-evaluate releasing index arrays");

  // BufferAttribute.onUpload is a legacy WebGLRenderer hook: the WebGPU
  // bundle never calls it. This is the assertion that would have saved the
  // first attempt, which shipped nothing and looked like a fix.
  assert.ok(!three.includes("onUploadCallback"),
    "three.webgpu now has onUploadCallback — the CPU-array release may finally be viable");
});

// ── TLX vertex-attribute packing (docs/PERF-FINDINGS.md §2n) ──────────────
// three retains the CPU copy of every attribute array forever. Packing them
// down (Int16 normals, half-float colours and MAT ids, one shared zero buffer
// behind absent sources, Uint16 indices) took montreal's deduped attribute
// bytes from 50.0 to 28.6 MB. The risk is not that it fails loudly — it is
// that it quietly shifts a value the shader BRANCHES on.
test("the attribute packer proves its precondition instead of assuming it", () => {
  const ch = read("js/render/three/tlx-chunked.js");

  // A blanket quantise is the bug. Colours carry emissive to 3.4 and MAT ids
  // are not whole (measured 15.4) — both must be range-scanned and kept wider
  // when they do not fit, never clamped into the small type.
  assert.match(ch, /function packAttr\(/, "packAttr is gone — TLX is back to Float32 everything");
  assert.match(ch, /if \(kind === "unorm"\) \{ if \(v < 0 \|\| v > 1\) \{ fits = false; break; \} \}/,
    "the unorm range scan is gone — an emissive colour above 1 would be clamped");
  assert.match(ch, /\(v \| 0\) !== v/,
    "the id check no longer rejects fractional MAT — 15.4 would round to a different material");

  // `trk` must NEVER go half-float: its arc length reaches 5382 m, where a
  // half's 11-bit mantissa is worth about ±2.6 m and road markings need far
  // better. The half path is restricted to unorm/id for exactly that reason.
  assert.match(ch, /kind === "unorm" \|\| kind === "id"/,
    "the half-float path is no longer restricted — trk arc length would lose metres");

  // Constructor, not a post-hoc assignment: BufferAttribute derives `count`
  // from the array it is GIVEN, so `new Float16BufferAttribute([], n)` followed
  // by `.array = h` leaves count 0 and the mesh draws NOTHING. That was a real
  // bug in this function's first draft.
  assert.match(ch, /return new THREE\.Float16BufferAttribute\(h, itemSize\);/,
    "half-float attributes must be built through the constructor or count stays 0");
  assert.ok(!/Float16BufferAttribute\(\[\]/.test(ch),
    "an empty-array Float16BufferAttribute leaves count 0 — the mesh silently draws nothing");

  // The shared zero buffer is only safe while nothing writes it.
  assert.match(ch, /function _zeros\(len\)/, "the shared zero buffer is gone — absent trk goes back to 5.88 MB of per-mesh zeros");

  // An off-switch that defaults ON, and fails to the SAFE side when storage
  // is blocked (packing is the verified path, so its default is 'on').
  assert.match(ch, /localStorage\.getItem\("apex26\.tlxPack"\) !== "0"/,
    "the apex26.tlxPack escape hatch is gone");
});

test("the packing round-trip check is wired to the shader's own decisions", () => {
  const tool = read("tools/tlx-pack-check.cjs");
  // The tool must LIFT the packer out of the shipping file. A reimplementation
  // drifts, and then it verifies its own copy rather than what ships.
  assert.match(tool, /readFileSync\(path\.join\(ROOT, "js\/render\/three\/tlx-chunked\.js"\)/,
    "the check no longer reads the real packer — it would be testing a copy");
  // And it must gate on DECISIONS, not on raw error: MAT is legitimately
  // fractional, so a zero-error gate is wrong and would fail forever.
  for (const decision of [/floor\(o \+ 0\.5\) !== Math\.floor\(d \+ 0\.5\)/, /o >= 15 && o < 16/, /\(o \| 0\) === o && d !== o/])
    assert.match(tool, decision, "a shader decision is no longer checked by tools/tlx-pack-check.cjs");
  assert.match(tool, /if \(layerChanges \|\| flips \|\| intInexact\) \{/, "the check no longer FAILS on a changed decision");
});

// ── the mesh pool is keyed, not indexed (docs/PERF-FINDINGS.md §2o) ───────
// A flat `meshPool[poolUsed]` gave wrapper #0 whatever geometry was first that
// frame, and three's WebGPURenderer caches a render object and its bind groups
// keyed on the object TOGETHER WITH its material and geometry — so the churn
// minted a cache entry per frame that was never released. Measured against the
// flat pool: createRenderObject -45%, _createBindings -27%, drift -28%.
test("TLX pools meshes by (geometry, material), and prunes on a clock", () => {
  const raw = read("js/render/three/tlx.js");
  // Negative assertions run against CODE, never against prose. The comment in
  // tlx.js explaining this fix quotes `meshPool[poolUsed]` verbatim, and the
  // first draft of this test failed on its own documentation — the same trap
  // that made a revert-check pass earlier in this file's history.
  const tlx = raw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

  // Keyed lookup, not an index. `poolUsed` may survive as a counter, but it
  // must never index the pool again.
  assert.match(tlx, /const meshByGeo = new Map\(\)/, "the keyed pool is gone — the render-object cache is unbounded again");
  assert.ok(!/meshPool\[poolUsed\]/.test(tlx),
    "meshPool is being indexed by poolUsed again — that is the exact churn §2o measured");
  assert.match(tlx, /let list = byMat\.get\(mat\);/, "acquireMesh no longer looks the wrapper list up by its (geometry, material) pair");
  assert.match(tlx, /const k = list\.n\+\+;\s*\n\s*let m = list\[k\];/,
    "acquireMesh must key on the OCCURRENCE within the batch as well — one wrapper per pair dropped every same-pair draw but the last (audit 2026-09-02)");

  // The hide sweep must follow the batch stamp. An index range cannot work on
  // a keyed pool — it would hide live meshes and show dead ones.
  assert.match(tlx, /pm\.__tlxBatch !== _poolBatch/, "the hide sweep is not stamp-based");
  assert.ok(!/for \(let i = poolUsed; i < meshPool\.length; i\+\+\)/.test(tlx),
    "an index-range hide sweep is back, which is incoherent with a keyed pool");

  // Pruning, or the map pins every geometry it has ever seen and we have
  // simply moved the leak from three's cache into ours.
  assert.match(tlx, /function prunePool\(now\)/, "the pool prune is gone — freed geometry would be pinned alive by the pool map");
  assert.match(tlx, /now - _pruneLast < PRUNE_EVERY_MS/, "the prune no longer throttles on the CLOCK");
  assert.ok(!/_pruneLast[\s\S]{0,200}% \d+\) === 0/.test(tlx),
    "the prune is gated on a frame count — measured to fire either never or constantly (§2n)");

  // The prune owns the WRAPPER only. Disposing the caller's geometry or
  // material here would free live resources out from under tracks.js.
  const prune = tlx.match(/function prunePool\(now\)[\s\S]*?\n      \}/)[0];
  assert.ok(!/\.dispose\(\)/.test(prune),
    "prunePool disposes something — geometry and material belong to the caller, not the pool");
});
