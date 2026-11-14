/* css-zoom.test.mjs — CssZoom.viewportRect on an engine whose getBoundingClientRect is LOCAL.
 *
 * MDN browser-compat-data 8.1.8 (2026-11-02): Element.currentCSSZoom ships in Chrome/Edge 128,
 * Firefox 126, Samsung Internet 28 and Safari / iOS Safari 26.4. The engines that return LOCAL
 * rects are exactly WebKit before 26.4 — the ones WITHOUT currentCSSZoom — so `of(el)` read 1
 * there and the local→viewport fallback scaled by 1: a no-op on the only engines it serves.
 * The fallback now derives the zoom from computed style (the product of `zoom` up the tree).
 *
 * Run: node --test tests/unit/css-zoom.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/ui/css-zoom.js"), "utf8");

class Rect { constructor(x, y, w, h) { this.x = x; this.y = y; this.width = w; this.height = h; } }

/** An old-WebKit page: rects are local, no currentCSSZoom, computed `zoom` per element. */
function oldWebKit() {
  const root = { zoom: "1", parentElement: null, appendChild() {}, removeChild() {} };
  const sheet = { zoom: "2", parentElement: root };          // `.sheet { zoom: var(--ui-scale) }` at 200 %
  const card = { zoom: "1.5", parentElement: sheet };        // a nested zoomed card
  const row = { zoom: "1", parentElement: card, getBoundingClientRect: () => new Rect(10, 20, 100, 40) };
  const document = {
    documentElement: root,
    // The probe box: 100×50 at zoom 2 reports 100×50 here (local), 200×100 on a visual engine.
    createElement: () => ({ style: {}, getBoundingClientRect: () => new Rect(0, 0, 100, 50) }),
  };
  const ctx = { document, DOMRect: Rect, window: {}, getComputedStyle: (el) => ({ zoom: el.zoom }) };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: absSrc("js/ui/css-zoom.js") });
  return { Z: ctx.window.CssZoom, row, sheet };
}

test("old WebKit (local rects, no currentCSSZoom): viewportRect scales by the computed zoom chain", () => {
  const { Z, row } = oldWebKit();
  const r = Z.viewportRect(row);
  assert.deepEqual([r.x, r.y, r.width, r.height], [30, 60, 300, 120], "2 × 1.5 = 3: local 100×40 paints 300×120");
});

test("a visual-rect engine returns the rect untouched", () => {
  const { Z, row } = oldWebKit();
  // Same tree, but this engine already zooms the rect (Chromium / Safari 26.4+).
  const vis = vm.createContext({ DOMRect: Rect, window: {}, getComputedStyle: () => ({ zoom: "3" }),
    document: { documentElement: { appendChild() {}, removeChild() {} },
      createElement: () => ({ style: {}, getBoundingClientRect: () => new Rect(0, 0, 200, 100) }) } });
  vm.runInContext(SRC, vis, { filename: absSrc("js/ui/css-zoom.js") });
  const r = vis.window.CssZoom.viewportRect(row);
  assert.deepEqual([r.x, r.y, r.width, r.height], [10, 20, 100, 40]);
  assert.equal(Z.of(row), 1, "of() still reads currentCSSZoom only (absent here: 1)");
});
