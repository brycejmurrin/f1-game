/* glx-output-target — explicit final framebuffer + viewport (VR task 30).
 *
 * WHY: a WebXR layer needs the final pass in layer.framebuffer at the eye
 * viewport. The prior spike monkey-patched bindFramebuffer/viewport at runtime.
 * This file is the source-scan guard plus a recording-mock proof that
 * setOutputTarget routes the final pass, and that two clipped viewports do
 * not clear each other on the direct (post-off) path.
 *
 * Harness: tests/helpers/glx-mock.mjs (real glx.js against a recording WebGL2
 * mock) because the route is in present()/begin(), not a string we can pin.
 *
 * Run: node --test tests/unit/glx-output-target.test.mjs
 * (CI: re-fire after concurrency cancel on tip a9e7ed1fb post-#478 sync; still no XR.)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bootGlx } from "../helpers/glx-mock.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const GLX_DIR = path.join(ROOT, "js/render/glx");
const FILES = ["glx.js", "post.js", "shadow.js", "chunked.js"];
const MARKER = "glx-default-fb: reset only";
// Tripwire: every default-FB unbind in the four files. Bump only when a new
// class-(C) reset is added WITH the marker (or a site is removed).
const RESET_ONLY_COUNT = 10;

function scanNullBinds() {
  const hits = [];
  for (const name of FILES) {
    const rel = "js/render/glx/" + name;
    const text = fs.readFileSync(path.join(GLX_DIR, name), "utf8");
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      if (/bindFramebuffer\s*\([^)]*\bnull\b/.test(line) || /bindOverwrite\s*\(\s*null\s*\)/.test(line)) {
        hits.push({ rel, line: i + 1, text: line.trim() });
      }
    });
  }
  return hits;
}

test("every default-FB unbind is outputFBO() or a class-C reset marker", () => {
  const hits = scanNullBinds();
  assert.equal(hits.length, RESET_ONLY_COUNT,
    "bindFramebuffer(..., null) / bindOverwrite(null) count drifted — " +
    hits.map((h) => h.rel + ":" + h.line).join(", "));
  const bad = hits.filter((h) => !h.text.includes("outputFBO()") && !h.text.includes(MARKER));
  assert.deepEqual(bad, [],
    "unannotated default-FB binds:\n" + bad.map((h) => h.rel + ":" + h.line + "  " + h.text).join("\n"));
});

function stateOf(h) {
  const s = h.GLX.outputTargetState();
  return { fbo: !!s.fbo, vp: s.vp ? Array.from(s.vp) : null };
}

function lastFramebuffer(calls) {
  let fb = "unset";
  for (const [name, args] of calls) {
    if (name === "bindFramebuffer" && args.length >= 2) fb = args[1];
  }
  return fb;
}

function drawsOnNull(calls, enums) {
  let fb = null;
  const bad = [];
  for (const [name, args] of calls) {
    if (name === "bindFramebuffer" && args.length >= 2) {
      const target = args[0];
      if (target === enums.FRAMEBUFFER || target === enums.DRAW_FRAMEBUFFER) fb = args[1];
    }
    if (/^draw(Arrays|Elements)/.test(name) && (fb == null)) bad.push(name);
  }
  return bad;
}

test("setOutputTarget routes the final pass (glx-mock present)", () => {
  const h = bootGlx();
  assert.equal(typeof h.GLX.setOutputTarget, "function");
  assert.deepEqual(stateOf(h), { fbo: false, vp: null });
  const fboX = h.gl.createFramebuffer();
  h.GLX.setOutputTarget(fboX, { x: 10, y: 20, w: 300, h: 200 });
  assert.deepEqual(stateOf(h), { fbo: true, vp: [10, 20, 300, 200] });
  h.reset();
  h.GLX.begin(h.frame());
  h.GLX.present({});
  assert.equal(lastFramebuffer(h.calls), fboX, "final bindFramebuffer must be the output FBO");
  const vp = h.calls.filter((c) => c[0] === "viewport").map((c) => c[1]);
  assert.ok(vp.some((a) => a[0] === 10 && a[1] === 20 && a[2] === 300 && a[3] === 200),
    "final viewport must be the output rectangle; got " + JSON.stringify(vp.slice(-6)));
  const onNull = drawsOnNull(h.calls, h.enums);
  assert.deepEqual(onNull, [], "a draw landed on framebuffer null: " + onNull.join(","));
  h.GLX.clearOutputTarget();
  assert.deepEqual(stateOf(h), { fbo: false, vp: null });
});

test("two clipped viewports do not clear each other on the direct path", () => {
  const h = bootGlx();
  // Fail the next scene-target completeness check so createTargets disables post.
  h.answers.checkFramebufferStatus = () => 0;
  h.sandbox.innerWidth = 1400;
  h.canvas.clientWidth = 800;
  h.GLX.resize();
  assert.equal(h.GLX.hdrMode(), false, "need the direct (post-off) path for this clear test");
  const fboX = h.gl.createFramebuffer();
  h.GLX.setOutputTarget(fboX, { x: 0, y: 0, w: 100, h: 80 });
  h.reset();
  h.GLX.begin(h.frame());
  const scissor1 = h.calls.filter((c) => c[0] === "scissor").map((c) => c[1]);
  const enable = h.calls.filter((c) => c[0] === "enable").map((c) => c[1][0]);
  assert.ok(enable.includes(h.enums.SCISSOR_TEST), "begin() must scissor the clear when an output viewport is set");
  assert.ok(scissor1.some((a) => a[0] === 0 && a[1] === 0 && a[2] === 100 && a[3] === 80));
  h.GLX.setOutputTarget(fboX, { x: 100, y: 0, w: 100, h: 80 });
  h.reset();
  h.GLX.begin(h.frame());
  const lastScissor = [...h.calls].reverse().find((c) => c[0] === "scissor");
  assert.ok(lastScissor, "second begin() must scissor");
  assert.deepEqual(lastScissor[1], [100, 0, 100, 80]);
});

test("setRenderSizeOverride changes getSize via resize", () => {
  const h = bootGlx();
  h.GLX.setRenderSizeOverride({ width: 512, height: 256 });
  h.GLX.resize();
  assert.equal(h.GLX.width, 512);
  assert.equal(h.GLX.height, 256);
  h.GLX.setRenderSizeOverride(null);
});

test("a half-float-only device keeps bloom/godray targets on RGBA16F; R11F_G11F_B10F waits for EXT_color_buffer_float (iPhone GLX report)", () => {
  // EXT_color_buffer_half_float makes RGBA16F renderable but not R11F_G11F_B10F. Allocating
  // the slim format there left bloom level 0 incomplete, so post switched off untonemapped.
  const run = (extensions) => {
    const h = bootGlx({ extensions });
    h.GLX.begin(h.frame());
    return { h, r11: h.count("texImage2D", (a) => a[2] === h.gl.R11F_G11F_B10F), f16: h.count("texImage2D", (a) => a[2] === h.gl.RGBA16F) };
  };
  const half = run(["EXT_color_buffer_half_float"]);
  assert.equal(half.r11, 0, "no R11F_G11F_B10F target without EXT_color_buffer_float");
  assert.ok(half.f16 > 1, "bloom/godray fall back to RGBA16F");
  assert.equal(half.h.GLX.hdrMode(), true, "post stays on, HDR, on half-float-only");
  const full = run(["EXT_color_buffer_float"]);
  assert.ok(full.r11 > 0, "with the float extension the slim format is still used");
});

test("WebKit never invalidates the DEFAULT framebuffer; FBO targets keep theirs (iPhone GLX black-screen lead)", () => {
  // WebKit 280799 (Safari 18: one frame, then a black canvas) is triggered by invalidating the
  // default framebuffer, the one GLX path TLX never takes. Count, per UA, the invalidations
  // whose attachments are the default framebuffer's gl.COLOR / gl.DEPTH.
  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  const CHROME = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
  const count = (userAgent) => {
    const h = bootGlx({ userAgent, extensions: ["EXT_color_buffer_float"] });
    h.GLX.begin(h.frame()); h.GLX.present({}); h.reset();
    h.GLX.begin(h.frame()); h.GLX.present({});
    const inv = h.calls.filter((c) => c[0] === "invalidateFramebuffer");
    return { all: inv.length, def: inv.filter((c) => c[1][1].some((a) => a === h.gl.COLOR || a === h.gl.DEPTH)).length };
  };
  const safari = count(IPHONE), chrome = count(CHROME);
  assert.equal(safari.def, 0, "Safari/WebKit: no default-framebuffer invalidation");
  // The iPhone is on the cover path, where post colour targets CLEAR instead (next test);
  // the scene-depth DontCare hint is still issued.
  assert.ok(safari.all > 0, "Safari keeps an FBO DontCare hint (scene depth)");
  assert.ok(chrome.def > 0, "Chromium keeps the default-framebuffer hints");
});

// ---- Perf hunt 9: phone cover targets (iPhone GLX black canvas, candidate 1 + 2) ----
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const CHROME_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
function presentCalls(userAgent) {
  const h = bootGlx({ userAgent, extensions: ["EXT_color_buffer_float"] });
  h.GLX.begin(h.frame()); h.reset();
  h.GLX.present({ ssao: 0.5, bloom: 0.5 });
  return h;
}
/** Every draw present() issues on an FBO, with what happened to its colour since the bind. */
function fboDraws(h) {
  const g = h.gl;
  let fb = null, inv = false, clr = false;
  const out = [];
  for (const [name, a] of h.calls) {
    if (name === "bindFramebuffer" && (a[0] === g.FRAMEBUFFER || a[0] === g.DRAW_FRAMEBUFFER)) { fb = a[1]; inv = false; clr = false; }
    else if (name === "invalidateFramebuffer" && a[0] === g.FRAMEBUFFER && a[1].includes(g.COLOR_ATTACHMENT0)) inv = true;
    else if (name === "clear" && (a[0] & g.COLOR_BUFFER_BIT)) clr = true;
    else if (/^draw(Arrays|Elements)/.test(name) && fb) out.push({ fb, inv, clr });
  }
  return out;
}
const steps = (h, name) => h.calls.filter((c) => c[0] === "uniform2f" && c[1][0] && c[1][0].name === name).map((c) => [c[1][1], c[1][2]]);

test("phone cover targets are cleared, never DontCare'd, so the area outside the w×h rect is defined", () => {
  // A square max(w,h)² cover is drawn only inside its viewport, while the next pass's taps cross the
  // edge. Whole-attachment invalidation left that area undefined per frame on ANGLE-Metal (NaN in RGBA16F).
  const h = presentCalls(IPHONE_UA);
  const draws = fboDraws(h);
  assert.ok(draws.length >= 8, "present() drew the SSAO + bloom passes on FBOs; got " + draws.length);
  assert.equal(draws.filter((d) => d.inv).length, 0, "no post pass draws into a colour attachment it invalidated");
  assert.ok(draws.filter((d) => d.clr).length >= 8, "the overwrite passes start from a full clear");
  assert.ok(h.count("clearColor", (c) => c.every((x) => x === 1)) > 0, "the SSAO targets clear to 1 (no occlusion bleeds in)");
  assert.ok(h.count("clearColor", (c) => c.every((x) => x === 0)) > 0, "colour targets clear to 0");
});

test("desktop post passes keep the DontCare hint and issue no clear (call stream unchanged off the cover path)", () => {
  const h = presentCalls(CHROME_UA);
  const draws = fboDraws(h);
  assert.equal(h.count("clear"), 0, "present() issues no clear on desktop");
  assert.equal(h.count("clearColor"), 0, "present() sets no clear colour on desktop");
  assert.ok(draws.filter((d) => d.inv).length >= 8, "desktop overwrite passes still invalidate first");
});

test("tap texels are one PHYSICAL texel: square on a phone cover, logical on desktop", () => {
  // vUV is physical UV (p * uUVScale), so a step of 1/logical overshoots by alloc/logical on a cover.
  const phone = presentCalls(IPHONE_UA);
  const W = phone.GLX.width, H = phone.GLX.height;
  assert.notEqual(W, H, "need a non-square logical size");
  const pDir = steps(phone, "uDir"), pAO = steps(phone, "uAOTexel"), pTex = steps(phone, "uTexel").slice(1);   // [0] is SSAO's (unused)
  assert.ok(pDir.length >= 2 && pTex.length >= 8, "blur + bloom + FXAA steps recorded");
  assert.equal(pDir[0][0], pDir[1][1], "SSAO blur: H step == V step on the square half-res cover");
  assert.equal(pAO[0][0], pAO[0][1], "AO grid texel is square on the cover");
  assert.deepEqual(pTex.filter((t) => t[0] !== t[1]), [], "bloom + FXAA texels are square on the cover");
  const desk = presentCalls(CHROME_UA);
  const dW = desk.GLX.width, dH = desk.GLX.height;
  const half = (a) => Math.max(1, Math.floor(a / 2));
  const dDir = steps(desk, "uDir"), dTex = steps(desk, "uTexel");
  assert.deepEqual([dDir[0][0], dDir[1][1]], [1 / half(dW), 1 / half(dH)], "desktop SSAO blur: logical half-res texel");
  assert.deepEqual(steps(desk, "uAOTexel")[0], [1 / half(dW), 1 / half(dH)], "desktop AO grid: logical half-res texel");
  assert.deepEqual(dTex[1], [1 / half(dW), 1 / half(dH)], "desktop first bloom downsample: 1/level-0 size");
  assert.deepEqual(dTex[dTex.length - 1], [1 / dW, 1 / dH], "desktop FXAA: 1/render size");
});
