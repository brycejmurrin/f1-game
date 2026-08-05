"use strict";
/* DomGeom — viewport vs local geometry under CSS `zoom`.
 *
 * UI SIZE / HUD SIZE use `zoom` on sheets, overlay children, HUD clusters and
 * docks. getBoundingClientRect() returns scaled (viewport) values in Chrome /
 * Firefox / Safari 26.4+, but pre-26.4 WebKit returned pre-zoom (local) values
 * for thirteen years. Mixing a zoomed rect with an unzoomed length (canvas
 * clientWidth, --pair-at, scrollTop, clientX) is wrong on one engine or the
 * other depending on the call site.
 *
 * viewportRect(el)  → DOMRect in real viewport CSS pixels (fixes A13 mixes)
 * localWidth(el)    → layout width in the element's own space (for --pair-at)
 *
 * Feature-detect once: a 50px box inside zoom:2 reports ~100 when the engine
 * scales rects, ~50 when it does not.
 */
window.DomGeom = (function () {
  let needsScale = null;

  function probe() {
    if (needsScale != null) return needsScale;
    if (typeof document === "undefined" || !document.documentElement) {
      needsScale = false;
      return needsScale;
    }
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-9999px;top:0;width:100px;height:100px;zoom:2;";
    const inner = document.createElement("div");
    inner.style.cssText = "width:50px;height:50px;";
    host.appendChild(inner);
    document.documentElement.appendChild(host);
    const w = inner.getBoundingClientRect().width;
    host.remove();
    // Scaled engines ≈ 100; legacy WebKit ≈ 50.
    needsScale = w < 75;
    return needsScale;
  }

  function viewportRect(el) {
    const r = el.getBoundingClientRect();
    const z = el.currentCSSZoom || 1;
    if (!probe() || z === 1) return r;
    return new DOMRect(r.x * z, r.y * z, r.width * z, r.height * z);
  }

  function localWidth(el) {
    return el.clientWidth;
  }

  function localHeight(el) {
    return el.clientHeight;
  }

  return {
    rectNeedsZoomScale: probe,
    viewportRect,
    localWidth,
    localHeight
  };
})();
