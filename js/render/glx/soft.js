/*
 * Apex 26 — GLX soft-present overlay (split out of js/render/glx/glx.js).
 * HeadlessChrome / Playwright often leave the WebGL canvas uncomposited for
 * CDP screenshots; this blits the LDR present into a 2D #game-soft overlay on
 * demand (awaitSoftPresent / invalidateSoftPresent). Wired through a thin deps
 * bag so glx.js keeps the GL context and post chain. Must load before glx.js.
 */
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
      // Same box as #game (tokens.css: fixed inset 0). Sit above the WebGL
      // canvas and below menu sheets (carsetup z-index 35) so CDP/page shots
      // see the blit while the garage UI still covers the right edge.
      // HIDDEN UNTIL IT HAS SOMETHING TO SHOW. This canvas is opaque (alpha:false)
      // and covers the viewport at z-index 1, and the blit below only runs when a
      // capture is waiting — so on any page that never calls awaitSoftPresent /
      // invalidateSoftPresent it is a BLACK LID over a renderer that is working
      // perfectly. tools/carview.html read as "draws nothing" for exactly this
      // reason. OPACITY, not visibility or display: several capture tools call
      // locator("#game-soft").screenshot(), and Playwright's actionability check
      // fails a visibility:hidden element but passes an opacity:0 one — so the
      // box stays screenshot-able while it is still see-through.
      _displayCanvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;"
        + "display:block;opacity:0;pointer-events:none;z-index:1;touch-action:none";
      if (canvas.parentNode) canvas.parentNode.insertBefore(_displayCanvas, canvas.nextSibling);
      else if (document.body) document.body.appendChild(_displayCanvas);
      _displayCtx = _displayCanvas.getContext("2d", { alpha: false, willReadFrequently: true });   // read back by ?gfxdebug=1, as TLX's
      // Keep #game opacity at 1 — hiding it broke element screenshots and
      // visibility waits. The overlay sits on top with opaque putImageData.
      try { Log.info("gfx", "GLX soft-present on"); } catch (_) { /* harness */ }
    }

    function softBlitNotify() {
      _softBlitGen++;
      const keep = [];
      const ws = _softPresentWaiters.splice(0);
      for (let i = 0; i < ws.length; i++) {
        try { if (!ws[i](_softBlitGen)) keep.push(ws[i]); } catch (_) { /* harness waiter */ }
      }
      for (let j = 0; j < keep.length; j++) _softPresentWaiters.push(keep[j]);
    }

    function softBlit() {
      const gl = deps.getGl();
      const PST = deps.getPST();
      if (deps.getOutFBO() || !enabled || !_displayCtx || !gl || deps.ctxGone()) return;
      // A synchronous GPU readback plus two full-frame CPU copies is capture
      // work, not presentation work. Capture tools call awaitSoftPresent(), and
      // snapCam()/invalidateSoftPresent() arms one explicit blit on the next
      // present — not a periodic background readback every N frames.
      if (!_softPresentWaiters.length && !_softCaptureDue) return;
      // Drawing-buffer size, not render width/height: with spatial upscale the
      // canvas (and default FB) is presentW×presentH while width/height stay at
      // the internal render scale — readPixels of the small box only captured a
      // corner of the SGSR present and left #game-soft letterboxed/black.
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
        if (!(PST && PST.readbackLdrPixels && PST.readbackLdrPixels(_softBuf, w, h))) return;
      } catch (_) { return; }
      if (!_softImg || _softImg.width !== w || _softImg.height !== h) {
        _softImg = _displayCtx.createImageData(w, h);
      }
      const dst = _softImg.data;
      const row = w * 4;
      // Flip Y (GL origin is bottom-left) via row copies, then force opaque alpha.
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
      // Skip near-black frames so a clear does not wipe a good garage still
      // (same floor as TLX soft-blit).
      if (maxPx < 8) return;
      try {
        _displayCtx.putImageData(_softImg, 0, 0);
        // First real frame: reveal the overlay. Before this it held nothing but
        // opaque black, and showing that hid the live canvas underneath.
        if (_displayCanvas.style.opacity !== "1") _displayCanvas.style.opacity = "1";
        _softCaptureDue = false;
        softBlitNotify();
      } catch (_) { /* 2D blit failed */ }
    }

    function softPresentState() {
      const PST = deps.getPST();
      return {
        on: !!enabled,
        gen: _softBlitGen,
        maxPx: _softLastMaxPx,
        display: _displayCanvas ? [_displayCanvas.width, _displayCanvas.height] : null,
        post: (PST && PST.postPath) ? PST.postPath() : null,   // js/render/glx/post.js _lastPath
      };
    }

    // snapCam() / park() call gfx.invalidateSoftPresent. GLX captures only on
    // demand, and awaitSoftPresent() already requires a newer generation.
    function invalidateSoftPresent() {
      _softCaptureDue = true;
      const PST = deps.getPST();
      try { if (PST && PST.invalidateUniformCache) PST.invalidateUniformCache(); } catch (_) { /* harness */ }
    }

    // awaitSoftPresent(ms, "frame"): a headed GLX drawing buffer is cleared after
    // compositing, so SAVE SCREENSHOT must read it in the task that presented.
    // Resolves "frame" from INSIDE present() (the caller's microtask runs before
    // the compositor), or "stale" when none came in `ms` (paused).
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
      // Wait for a NEWER blit, not the last one already on the overlay.
      // A wrap/indexOf(waiter) mismatch leaves timed-out waiters on the list
      // forever, and an early return on gen>0 makes SAVE SCREENSHOT after a
      // camera move byte-identical to the previous still (same class as
      // TLX/WGX). Timeout must splice the same function push()
      // stored — see renderer-soft-lifecycle. Return true/false so notify's
      // keep[] can re-queue waiters whose predicate has not fired (a dim
      // skip never notifies; the next good blit must still wake them).
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
            try { clearTimeout(t); } catch (_) { /* harness */ }
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
      isEnabled, setEnabled, gen, ensureSoftDisplay, softBlit, softBlitNotify,
      softPresentState, invalidateSoftPresent, awaitSoftPresent, blitIfDue, drainFrameWaiters,
      // present() gates the blit on these without exposing the arrays.
      hasWaiters: () => !!_softPresentWaiters.length,
      captureDue: () => _softCaptureDue,
    };
  }

  return { create };
})();
Object.freeze(GLXSoft);
