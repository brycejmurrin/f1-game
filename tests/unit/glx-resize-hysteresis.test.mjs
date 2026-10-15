/* glx-resize-hysteresis — a 1 px CSS/DPR jitter must not rebuild the post chain.
 *
 * WHY (#2153): GLX resize() rebuilt every post target (scene, depth, MSAA,
 * bloom chain, SSAO, godray, LDR) whenever present or render size moved by a
 * single pixel — the mobile URL bar or a fractional zoom. WGX already snaps a
 * ±1 px change back to the last applied size (wgx.js "1px CSS/DPR jitter must
 * not rebuild the swapchain"); GLX now does the same.
 *
 * Harness: tests/helpers/glx-mock.mjs (real glx.js on a recording WebGL2 mock).
 * A post-chain rebuild is observed as createFramebuffer calls.
 *
 * Run: node --test tests/unit/glx-resize-hysteresis.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootGlx } from "../helpers/glx-mock.mjs";

// Resize the mock's CSS box. The shared CanvasCssSize cache re-reads the box
// when the window viewport changes, so move innerWidth with it.
function setCss(h, w, hh) {
  h.canvas.clientWidth = w; h.canvas.clientHeight = hh;
  h.sandbox.innerWidth = w; h.sandbox.innerHeight = hh;
  h.GLX.resize();
}
const fbos = (h) => h.count("createFramebuffer");
const sizeOf = (h) => ({ width: h.GLX.width, height: h.GLX.height });

test("a ±1 px CSS jitter does not rebuild the post targets", () => {
  const h = bootGlx();
  setCss(h, 800, 400);
  const size0 = sizeOf(h);
  h.reset();
  for (let i = 0; i < 6; i++) setCss(h, i % 2 ? 801 : 800, i % 3 ? 400 : 401);
  assert.equal(fbos(h), 0, "1 px jitter reallocated framebuffers");
  assert.deepEqual(sizeOf(h), size0, "jitter moved the applied size");
});

test("a real change (≥ 2 px) still rebuilds, once", () => {
  const h = bootGlx();
  setCss(h, 800, 400);
  h.reset();
  setCss(h, 802, 400);
  assert.ok(fbos(h) > 0, "2 px change did not rebuild the post targets");
  assert.equal(h.GLX.width, 802);
  const after = fbos(h);
  setCss(h, 802, 400);
  assert.equal(fbos(h), after, "an unchanged size rebuilt again");
});
