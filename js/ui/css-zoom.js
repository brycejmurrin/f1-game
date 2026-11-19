"use strict";
window.CssZoom = (function () {
  try { Log.info("ui", "CssZoom ready"); } catch (_) {  }
  let visualCached = null;

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
      visualCached = true;
    }
    return visualCached;
  }

  function of(el) {
    if (!el) return 1;
    const z = el.currentCSSZoom;
    return (typeof z === "number" && z > 0) ? z : 1;
  }

  function viewportRect(el) {
    const r = el.getBoundingClientRect();
    const z = of(el);
    if (rectsAreVisual() || z === 1) return r;
    return new DOMRect(r.x * z, r.y * z, r.width * z, r.height * z);
  }

  function localBox(el) {
    return { w: el.clientWidth, h: el.clientHeight };
  }

  function toLocalDelta(el, viewportPx) {
    return viewportPx / of(el);
  }

  return { of, viewportRect, localBox, toLocalDelta };
})();
