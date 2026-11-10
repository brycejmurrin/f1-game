"use strict";
/* CssZoom — one place for zoom ↔ viewport ↔ local conversions.
 *
 * Four subtrees carry `zoom: var(--ui-scale)` (every `.sheet`, `#overlay > *`,
 * `.dh-card`). Inside a zoomed subtree CSS lengths are LOCAL; getBoundingClientRect
 * on Chromium / modern Safari returns VISUAL (zoomed) pixels; pre-26.4 WebKit
 * returned LOCAL. Mixing a visual rect with `clientWidth`, `--pair-at` or
 * `scrollTop` is the A13 class of bug (docs/notes/ARCHITECTURE-REVIEW.md).
 *
 * Prefer `clientWidth` / `clientHeight` for the element's own box in local
 * units — they never need a probe. `viewportRect` mixes with `clientX`/`clientY`
 * or an unzoomed canvas; `toLocalDelta` turns wheel deltas into `scrollTop`.
 */
window.CssZoom = (function () {
  try { Log.info("ui", "CssZoom ready"); } catch (_) { /* Log absent in isolated VM */ }
  let visualCached = null;

  // Probe once: does gBCR already include zoom? A 100×50 box at zoom 2 paints
  // 200×100 visual on engines that scale the rect; old WebKit reports 100×50.
  function rectsAreVisual() {
    if (visualCached != null) return visualCached;
    try {
      const el = document.createElement("div");
      el.style.cssText = "position:fixed;left:0;top:0;width:100px;height:50px;zoom:2;visibility:hidden;pointer-events:none";
      document.documentElement.appendChild(el);
      const r = el.getBoundingClientRect();
      document.documentElement.removeChild(el);
      visualCached = Math.abs(r.width - 200) < 2;
    } catch (_) {
      visualCached = true; // Chromium-default assumption
    }
    return visualCached;
  }

  function of(el) {
    if (!el) return 1;
    const z = el.currentCSSZoom;
    return (typeof z === "number" && z > 0) ? z : 1;
  }

  // Product of ancestors' computed `zoom`: local-rect engines (WebKit < 26.4) lack currentCSSZoom (MDN BCD).
  function computedZoom(el) {
    let z = 1;
    try {
      for (let n = el; n && n.nodeType !== 9; n = n.parentElement) {
        const v = parseFloat(getComputedStyle(n).zoom);
        if (v > 0 && Number.isFinite(v)) z *= v;
      }
    } catch (_) { /* detached or no computed style: unzoomed */ }
    return z;
  }

  function viewportRect(el) {
    const r = el.getBoundingClientRect();
    if (rectsAreVisual()) return r;
    const z = el.currentCSSZoom > 0 ? el.currentCSSZoom : computedZoom(el);
    if (z === 1) return r;
    return new DOMRect(r.x * z, r.y * z, r.width * z, r.height * z);
  }

  // Always local — preferred for SheetShape thresholds vs --pair-at.
  function localBox(el) {
    return { w: el.clientWidth, h: el.clientHeight };
  }

  function toLocalDelta(el, viewportPx) {
    return viewportPx / of(el);
  }

  // rectsAreVisual stays module-local (viewportRect only).
  return { of, viewportRect, localBox, toLocalDelta };
})();
