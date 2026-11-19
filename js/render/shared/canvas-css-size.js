const CanvasCssSize = (() => {
  "use strict";

  function create(canvas, opts = {}) {
    const settleFrames = Math.max(0, opts.settleFrames | 0);
    const ignore = typeof opts.ignore === "function" ? opts.ignore : () => false;
    const win = typeof window !== "undefined" ? window : null;
    let width = 0, height = 0, dirty = true;
    let viewportW = -1, viewportH = -1, recheck = 0;
    let watched = false, observer = null;
    const size = { width: 0, height: 0 };

    function markDirty() { if (!ignore()) dirty = true; }
    if (win && typeof win.addEventListener === "function") {
      win.addEventListener("resize", markDirty);
      win.addEventListener("orientationchange", markDirty);
      watched = true;
    }
    if (typeof ResizeObserver === "function" && canvas) {
      try {
        observer = new ResizeObserver(markDirty);
        observer.observe(canvas.__element || canvas);
        watched = true;
      } catch (_) { observer = null;  }
    }

    function read() {
      if (win) {
        const vw = win.innerWidth | 0, vh = win.innerHeight | 0;
        if (vw !== viewportW || vh !== viewportH) {
          const first = viewportW < 0;
          viewportW = vw; viewportH = vh;
          if (!first) recheck = settleFrames;
        }
      }
      if (!watched) dirty = true;
      if (dirty || width <= 0 || height <= 0 || recheck > 0) {
        if (recheck > 0) recheck--;
        width = canvas ? Number(canvas.clientWidth) || 0 : 0;
        height = canvas ? Number(canvas.clientHeight) || 0 : 0;
        dirty = false;
      }
      size.width = width; size.height = height;
      return size;
    }

    function dispose() {
      if (win && typeof win.removeEventListener === "function") {
        win.removeEventListener("resize", markDirty);
        win.removeEventListener("orientationchange", markDirty);
      }
      if (observer && typeof observer.disconnect === "function") observer.disconnect();
      observer = null; watched = false;
    }

    return { read, markDirty, dispose };
  }

  return { create };
})();
