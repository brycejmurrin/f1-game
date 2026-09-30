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
