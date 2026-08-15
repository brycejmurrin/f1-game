/* gfx-backend-canary.test.mjs — the RENDERER pick must survive the title menu.
 *
 * Title SETTINGS never presents a world frame (`render()` returns on !track
 * until the deferred flyby builds). A canary that stayed armed until present()
 * reverted THREE/WEBGPU to WEBGL2 on every refresh — computer and phone.
 *
 * Run: node --test tests/unit/gfx-backend-canary.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("#pm-renderer is visible in the SETTINGS markup (not hidden)", () => {
  const html = read("index.html");
  const m = html.match(/<button id="pm-renderer"[^>]*>/);
  assert.ok(m, "pm-renderer button exists");
  assert.doesNotMatch(m[0], /\bhidden\b/, "hidden on the tag hid RENDERER until game.js finished an async backend load");
});

test("boot canary disarms after a successful bind, not only after present()", () => {
  const game = read("js/game.js");
  const bind = game.indexOf("Object.defineProperties(GLX, Object.getOwnPropertyDescriptors(backend))");
  const present = game.indexOf("gfx.present(po);");
  const disarmAfterBind = game.indexOf("localStorage.removeItem(PROBE_KEY)", bind);
  assert.ok(bind > 0 && present > bind, "bind then present");
  assert.ok(disarmAfterBind > bind && disarmAfterBind < present,
    "PROBE_KEY must be cleared after Gfx.create() binds, before the first present — title has no track");
});

test("first world present re-arms the canary so a jetsam mid-frame still reverts", () => {
  const game = read("js/game.js");
  const present = game.indexOf("gfx.present(po);");
  const window = game.slice(present - 400, present + 280);
  assert.match(window, /setItem\("apex26\.gfxBackendProbe"/);
  assert.match(window, /removeItem\("apex26\.gfxBackendProbe"\)/);
});

test("RENDERER cycle lives in gfx-quality.js and always names WEBGPU", () => {
  const src = read("js/game/gfx-quality.js");
  assert.match(src, /getElementById\("pm-renderer"\)/);
  assert.match(src, /WEBGPU \(UNAVAILABLE\)/);
  assert.doesNotMatch(read("js/game.js"), /getElementById\("pm-renderer"\)|\$\("pm-renderer"\)/);
});

test("TLX pins WebKit (Safari Mac + iOS) to three's WebGL2 backend", () => {
  const src = read("js/render/three/tlx.js");
  assert.match(src, /isWebKit/);
  assert.match(src, /forceWebGL = _glPin === "1" \? true : _glPin === "0" \? false : !!\(isMobile \|\| isWebKit\)/);
  assert.match(read("js/render/three/tsl-lit.js"), /cubeTexture\(envCubeNode, Rg, rough\.mul\(2\.5\)\)/);
});

test("a refused WGX/TLX create does not persist WEBGL2 over the user's pick", () => {
  const game = read("js/game.js");
  assert.match(game, /apex26\.gfxClaimFail/);
  assert.match(game, /armed && !skipClaim/);
  assert.match(game, /Live tab, create\(\) refused[\s\S]{0,400}removeItem\("apex26\.gfxBackendProbe"\)/);
  assert.match(game, /gfxClaimFail[\s\S]{0,220}removeItem\("apex26\.gfxBackendProbe"\)/);
  assert.doesNotMatch(game, /create\(\) refused[\s\S]{0,250}setItem\("apex26\.gfxBackend", "webgl2"\)/);
  const wgx = read("js/render/webgpu/wgx.js");
  assert.match(wgx, /device\.lost[\s\S]{0,2200}apex26\.gfxClaimFail/);
  assert.doesNotMatch(wgx, /device\.lost[\s\S]{0,2200}setItem\("apex26\.gfxBackend", "webgl2"\)/);
  assert.match(wgx, /WGX_LITE/);
  assert.match(wgx, /IS_WEBKIT/);
  assert.match(wgx, /_canTimestamp = !WGX_LITE/);
  assert.match(wgx, /apex26\.gfxWgxLite/);
  assert.match(wgx, /apex26\.gfxBound/);
  assert.match(wgx, /WGX begin failed/);
  assert.match(wgx, /WGX present failed/);
  // The loss ladder: full → lite → minimal → GLX session skip. A loss must
  // climb a rung (persisted) and reload, never re-run the identical config.
  assert.match(wgx, /apex26\.gfxWgxLevel/);
  assert.match(wgx, /WGX_MINIMAL = _wgxLevel >= 2/);
  assert.match(wgx, /if \(!WGX_MINIMAL\) _buildPost\(\)/);
  assert.match(wgx, /if \(_lost \|\| WGX_MINIMAL \|\| !skyPipeline\) return null/);
  // A hand re-pick of WEBGPU resets the ladder so the player can retry full.
  const gq = read("js/game/gfx-quality.js");
  assert.match(gq, /removeItem\("apex26\.gfxWgxLevel"\)/);
  assert.match(gq, /removeItem\("apex26\.gfxWgxLite"\)/);
});

test("RENDERER label names the live backend when WEBGPU fell back to GLX", () => {
  const src = read("js/game/gfx-quality.js");
  assert.match(src, /WEBGPU \(WEBGL2\)|backendLabel\(pref\) \+ " \(WEBGL2\)"/);
  assert.match(src, /apex26\.gfxBound/);
  assert.match(src, /apex-gfx-live/);
});

test("TLX HDR accepts iOS half-float and a refused create records why", () => {
  const post = read("js/render/three/tlx-post.js");
  assert.match(post, /EXT_color_buffer_half_float/);
  assert.match(post, /EXT_color_buffer_float/);
  assert.doesNotMatch(post, /keep hdr=true \(WebGPU is always half-float\)/);
  const tlx = read("js/render/three/tlx.js");
  assert.match(tlx, /apex26\.gfxTlxFail/);
  assert.match(tlx, /isMobile && !post\.hdrOk\(\)/);
  assert.match(tlx, /TLX: present failed/);
  assert.match(tlx, /MeshBasicMaterial/);
  assert.match(tlx, /apex26\.gfxClaimFail/);
  const present = tlx.indexOf("present(opts) {");
  const presentEnd = tlx.indexOf("// debug — the __tlx tooling", present);
  const body = tlx.slice(present, presentEnd);
  assert.ok(present > 0 && presentEnd > present, "present() body found");
  assert.doesNotMatch(body, /post = null;\s*renderer\.setRenderTarget\(null\);\s*renderer\.render/);
  assert.match(read("js/render/three/tlx-shadow.js"), /TLX: shadow pass failed/);
});

test("nextBackend is webgl2 → three → webgpu → webgl2", () => {
  const src = read("js/game/gfx-quality.js");
  const ctx = vm.createContext({ window: {}, document: undefined, localStorage: undefined });
  vm.runInContext(src, ctx, { filename: "js/game/gfx-quality.js" });
  const G = vm.runInContext("GfxQuality", ctx);
  assert.equal(G.nextBackend("webgl2"), "three");
  assert.equal(G.nextBackend("three"), "webgpu");
  assert.equal(G.nextBackend("webgpu"), "webgl2");
  assert.equal(G.backendLabel("three"), "THREE");
  assert.equal(G.backendLabel("webgpu"), "WEBGPU");
});
