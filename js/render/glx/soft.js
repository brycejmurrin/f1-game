"use strict";

const GLXSoft = (function () {

  function create(deps) {
    let enabled = false;
    let _displayCanvas = null, _displayCtx = null;
    let _softBuf = null, _softImg = null;
    let _softBlitGen = 0;
    let _softPresentWaiters = [];
    let _softLastMaxPx = 0;
    let _softCaptureDue = false;
    const _frameWaiters = [];

    function isEnabled() { return enabled; }
    function setEnabled(on) {
      enabled = !!on;
      if (enabled) ensureSoftDisplay();
    }
    function gen() { return _softBlitGen; }

    function ensureSoftDisplay() {
      const canvas = deps.getCanvas();
      if (_displayCanvas || !canvas || typeof document === "undefined") return;
      _displayCanvas = document.createElement("canvas");
      _displayCanvas.id = "game-soft";
      _displayCanvas.setAttribute("aria-hidden", "true");
      _displayCanvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;"
        + "display:block;opacity:0;pointer-events:none;z-index:1;touch-action:none";
      if (canvas.parentNode) canvas.parentNode.insertBefore(_displayCanvas, canvas.nextSibling);
      else if (document.body) document.body.appendChild(_displayCanvas);
      _displayCtx = _displayCanvas.getContext("2d", { alpha: false, willReadFrequently: true });
      try { Log.info("gfx", "GLX soft-present on"); } catch (_) {  }
    }

    function softBlitNotify() {
      _softBlitGen++;
      const keep = [];
      const ws = _softPresentWaiters.splice(0);
      for (let i = 0; i < ws.length; i++) {
        try { if (!ws[i](_softBlitGen)) keep.push(ws[i]); } catch (_) {  }
      }
      for (let j = 0; j < keep.length; j++) _softPresentWaiters.push(keep[j]);
    }

    function softBlit() {
      const gl = deps.getGl();
      const PST = deps.getPST();
      if (deps.getOutFBO() || !enabled || !_displayCtx || !gl || deps.ctxGone()) return;
      if (!_softPresentWaiters.length && !_softCaptureDue) return;
      const asked = _softPresentWaiters.length > 0;
      try {
        if (!asked && typeof PerfGov !== "undefined" && PerfGov.softwareGlUiReadbackDefer && PerfGov.softwareGlUiReadbackDefer()) {
          if (_softCaptureDue) {
            _softCaptureDue = false;
            softBlitNotify();
          }
          return;
        }
      } catch (_) {  }
      const w = (gl.drawingBufferWidth | 0) || (deps.getWidth() | 0);
      const h = (gl.drawingBufferHeight | 0) || (deps.getHeight() | 0);
      if (w < 1 || h < 1) return;
      if (_displayCanvas.width !== w || _displayCanvas.height !== h) {
        _displayCanvas.width = w;
        _displayCanvas.height = h;
      }
      const n = w * h * 4;
      if (!_softBuf || _softBuf.length !== n) _softBuf = new Uint8Array(n);
      try {
        if (!(PST && PST.readbackLdrPixels && PST.readbackLdrPixels(_softBuf, w, h, asked))) return;
      } catch (_) { return; }
      if (!_softImg || _softImg.width !== w || _softImg.height !== h) {
        _softImg = _displayCtx.createImageData(w, h);
      }
      const dst = _softImg.data;
      const row = w * 4;
      for (let y = 0; y < h; y++) {
        dst.set(_softBuf.subarray((h - 1 - y) * row, (h - y) * row), y * row);
      }
      let maxPx = 0;
      for (let i = 0; i < dst.length; i += 4) {
        dst[i + 3] = 255;
        const s = dst[i] + dst[i + 1] + dst[i + 2];
        if (s > maxPx) maxPx = s;
      }
      _softLastMaxPx = maxPx;
      if (maxPx < 8) return;
      try {
        _displayCtx.putImageData(_softImg, 0, 0);
        if (_displayCanvas.style.opacity !== "1") _displayCanvas.style.opacity = "1";
        _softCaptureDue = false;
        softBlitNotify();
      } catch (_) {  }
    }

    function softPresentState() {
      const PST = deps.getPST();
      return {
        on: !!enabled,
        gen: _softBlitGen,
        maxPx: _softLastMaxPx,
        display: _displayCanvas ? [_displayCanvas.width, _displayCanvas.height] : null,
        post: (PST && PST.postPath) ? PST.postPath() : null,
      };
    }

    function invalidateSoftPresent() {
      _softCaptureDue = true;
      const PST = deps.getPST();
      try { if (PST && PST.invalidateUniformCache) PST.invalidateUniformCache(); } catch (_) {  }
    }

    function _awaitFrame(ms) {
      return new Promise(function (resolve) {
        const w = function () { clearTimeout(t); resolve("frame"); };
        const t = setTimeout(function () { _frameWaiters.splice(_frameWaiters.indexOf(w), 1); resolve("stale"); }, ms);
        _frameWaiters.push(w);
      });
    }
    function awaitSoftPresent(timeoutMs) {
      if (!enabled) return arguments[1] === "frame" ? _awaitFrame(timeoutMs == null ? 8000 : timeoutMs) : Promise.resolve(_softBlitGen);
      if (!_displayCtx) return Promise.reject(new Error("no display ctx"));
      const start = _softBlitGen;
      const ms = timeoutMs == null ? 8000 : timeoutMs;
      return new Promise(function (resolve, reject) {
        let waiter = null;
        const t = setTimeout(function () {
          const i = _softPresentWaiters.indexOf(waiter);
          if (i >= 0) _softPresentWaiters.splice(i, 1);
          reject(new Error("awaitSoftPresent timeout after " + ms + " ms"));
        }, ms);
        waiter = function (gen) {
          if (gen > start) {
            try { clearTimeout(t); } catch (_) {  }
            resolve(gen);
            return true;
          }
          return false;
        };
        _softPresentWaiters.push(waiter);
      });
    }

    function blitIfDue() {
      if (_softPresentWaiters.length || _softCaptureDue) softBlit();
    }

    function drainFrameWaiters() {
      if (_frameWaiters.length) _frameWaiters.splice(0).forEach(function (w) { w(); });
    }

    return {
      isEnabled, setEnabled, gen, ensureSoftDisplay,
      softPresentState, invalidateSoftPresent, awaitSoftPresent, blitIfDue, drainFrameWaiters,
    };
  }

  return { create };
})();
Object.freeze(GLXSoft);
