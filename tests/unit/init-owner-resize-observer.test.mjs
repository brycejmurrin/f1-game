/* init-owner-resize-observer.test.mjs — the init-owner canvas lease must not blind CanvasCssSize.
 *
 * Found live (js-debugger, docs/notes/LIVE-DEBUGGER-RENDER-2026-10-16.md F1): Gfx.createInitOwner hands a
 * backend a Proxy of #game. ResizeObserver.observe(proxy) throws "parameter 1 is not of type 'Element'",
 * CanvasCssSize swallowed it, and TLX (whose _layoutCanvas is that proxy) never saw a CSS-box change that
 * was not a window resize.
 *
 * Run: node --test tests/unit/init-owner-resize-observer.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function boot() {
  class Element {}
  const observed = [];
  class ResizeObserver {
    constructor(cb) { this.cb = cb; }
    observe(el) {
      if (!(el instanceof Element)) throw new TypeError("parameter 1 is not of type 'Element'.");
      observed.push(el);
    }
    disconnect() {}
  }
  const canvas = Object.assign(new Element(), { clientWidth: 800, clientHeight: 450, getContext: () => ({}) });
  const win = { innerWidth: 1, innerHeight: 1, addEventListener() {}, removeEventListener() {} };
  const ctx = vm.createContext({ Element, ResizeObserver, window: win, Log: { info() {}, warn() {} }, localStorage: { getItem: () => null }, console });
  vm.runInContext(read("js/render/shared/canvas-css-size.js") + ";globalThis.CanvasCssSize = CanvasCssSize;", ctx);
  vm.runInContext(read("js/render/gfx.js") + ";globalThis.Gfx = Gfx;", ctx);
  return { ctx, canvas, observed };
}

test("the init-owner canvas lease is observable by ResizeObserver (real element reaches observe)", () => {
  const { ctx, canvas, observed } = boot();
  const owner = ctx.Gfx.createInitOwner(canvas);
  ctx.CanvasCssSize.create(owner.canvas, { settleFrames: 30 });
  assert.equal(observed.length, 1, "ResizeObserver.observe was never reached with a valid Element");
  assert.equal(observed[0], canvas);
});

test("a plain canvas still observes itself", () => {
  const { ctx, canvas, observed } = boot();
  ctx.CanvasCssSize.create(canvas, {});
  assert.deepEqual(observed, [canvas]);
});
