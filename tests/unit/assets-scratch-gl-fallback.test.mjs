/* assets-scratch-gl-fallback.test.mjs — W24 row 8. The pack's layer readback
 * context took OffscreenCanvas whenever it existed and gave up when its webgl2
 * context was null. Safari 16.4-16.x has OffscreenCanvas with 2D only, so the
 * readback path was lost on WebGL2-capable iPhones. A null (or throwing)
 * OffscreenCanvas context now falls back to a DOM canvas.
 *
 * Run: node --test tests/unit/assets-scratch-gl-fallback.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import { fnSource } from "../helpers/fn-source.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const SRC = fs.readFileSync(new URL("../../js/render/shared/assets.js", import.meta.url), "utf8");
const FN = fnSource(SRC, "function _ensureScratchGl(");

const fakeGl = () => ({ isContextLost: () => false, pixelStorei() {}, createTexture: () => ({}), createFramebuffer: () => ({}),
  bindTexture() {}, bindFramebuffer() {}, TEXTURE_2D: 1, FRAMEBUFFER: 2, NONE: 0 });
function run({ offscreen, dom }) {
  const made = [];
  const ctx = vm.createContext({
    ...(offscreen === undefined ? {} : { OffscreenCanvas: class { constructor(w, h) { this.width = w; this.height = h; made.push("offscreen"); }
      getContext() { if (offscreen === "throw") throw new Error("NotSupported"); return offscreen ? fakeGl() : null; } } }),
    document: { createElement: () => { made.push("dom"); return { getContext: () => (dom ? fakeGl() : null) }; } },
  });
  vm.runInContext("let _scratchGl = null;\n" + FN + "\nthis.r = _ensureScratchGl(256);", ctx, { filename: absSrc("js/render/shared/assets.js") });
  return { r: ctx.r, made };
}

test("Safari 16.4-16.x: OffscreenCanvas without webgl2 falls back to a DOM canvas", () => {
  const { r, made } = run({ offscreen: false, dom: true });
  assert.ok(r && r.gl, "a readback context exists");
  assert.deepEqual(made, ["offscreen", "dom"]);
  assert.equal(r.cv.width, 256);
});

test("an OffscreenCanvas getContext that throws also falls back", () => {
  const { r, made } = run({ offscreen: "throw", dom: true });
  assert.ok(r && r.gl);
  assert.deepEqual(made, ["offscreen", "dom"]);
});

test("OffscreenCanvas with webgl2 stays first; no WebGL2 anywhere is still null", () => {
  assert.deepEqual(run({ offscreen: true, dom: true }).made, ["offscreen"]);
  assert.equal(run({ offscreen: false, dom: false }).r, null);
  assert.ok(run({ offscreen: undefined, dom: true }).r, "no OffscreenCanvas: the DOM canvas, as before");
});
