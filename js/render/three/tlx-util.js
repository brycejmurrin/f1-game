/* Apex 26 — TLXUtil: module-level helpers carved out of tlx.js (#6821, #6607 row 8): pumpAnimation (three's rAF
 * pump), texStandIn (the 1x1 canvas a released texture source is swapped for) and readGlCapture (async PBO readback).
 * Behaviour-neutral: bodies are verbatim. Loads before tlx.js (DEFERRED.three + DEFERRED_EDGES). */
"use strict";

const TLXUtil = (function () {
  // three r186 Renderer.init() starts its own window rAF loop (Animation: info.reset, nodeFrame.update ->
  // frameId, inspector) that ticks every vsync beside the game loop: 2.04 rAF callbacks per drawn frame on
  // TLX vs 1.04 on GLX (gpu-census 39071040057), 0.12 ms each on the phone-shaped VM probe. TLX never sets
  // an animation loop, so its context becomes a pump that begin() drains: frameId still advances once per
  // DRAWN frame (FRAME-type nodes such as post passes key on it), an idle canvas runs no three callback,
  // and XRManager's session swap still restores it (it saves getContext() and puts it back on end).
  function pumpAnimation(r) {
    const anim = r && r._animation;
    if (!anim || typeof anim.setContext !== "function" || typeof anim.stop !== "function" || typeof anim.start !== "function") return null;
    const pump = { cb: null };
    pump.requestAnimationFrame = (cb) => { pump.cb = cb; return 1; };
    pump.cancelAnimationFrame = () => { pump.cb = null; };
    pump.drain = () => { const cb = pump.cb; if (cb) { pump.cb = null; cb(typeof performance !== "undefined" ? performance.now() : 0); } };
    anim.stop(); anim.setContext(pump); anim.start();   // start() ticks once now and parks the next tick in the pump
    return pump;
  }
  // RELEASE A createTexture() SOURCE AFTER UPLOAD. three keeps texture.image
  // for the texture's life and Texture.dispose() frees only the GPU copy
  // (https://threejs.org/docs/#api/en/textures/Texture.dispose,
  // mrdoob/three.js#23953), so every cached livery atlas pinned its 1024x1280
  // canvas — ~5 MB each, 48 cached plus the decal-material cache: 130-250 MB.
  // three r186 re-reads .image only when .version moves (Textures.updateTexture
  // returns early on initialized && same version), so after the upload the
  // image can be swapped for a 1x1 stand-in: a stray re-upload (e.g. a texture
  // drawn after its dispose) then yields a blank decal, not a TypeError from a
  // detached source. The image setter does not bump the version. ImageBitmap
  // sources are left alone: three's flipY uniform tests `image instanceof
  // ImageBitmap`, so swapping one would flip the texture.
  let _texStandIn = null;
  function texStandIn() {
    if (!_texStandIn && typeof document !== "undefined" && document.createElement) {
      _texStandIn = document.createElement("canvas");
      _texStandIn.width = _texStandIn.height = 1;
    }
    return _texStandIn;
  }
  // Capture the unpreserved backbuffer NOW, but wait asynchronously for its bytes.
  // A timer around client-memory readPixels still blocked Photo for 100 s on
  // software GL. PBO + fence polling moves GPU waiting out of that call;
  // the final client copy can still pay driver/command-stream overhead.
  // https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#use_non-blocking_async_data_readback
  const _captureReads = new WeakSet();
  async function readGlCapture(gl, w, h) {
    if (!(w > 0 && h > 0)) throw new Error("no frame size");
    if (_captureReads.has(gl)) throw new Error("capture already in progress");
    _captureReads.add(gl);
    let pbo = null, sync = null;
    try {
      const bytes = w * h * 4;
      pbo = gl.createBuffer();
      if (!pbo) throw new Error("capture buffer unavailable");
      const binding = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING);
      const names = [gl.PACK_ALIGNMENT, gl.PACK_ROW_LENGTH, gl.PACK_SKIP_PIXELS, gl.PACK_SKIP_ROWS];
      const pack = names.map((n) => gl.getParameter(n));
      try {
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
        gl.bufferData(gl.PIXEL_PACK_BUFFER, bytes, gl.STREAM_READ);
        if (gl.getBufferParameter(gl.PIXEL_PACK_BUFFER, gl.BUFFER_SIZE) !== bytes)
          throw new Error("capture buffer allocation failed");
        for (let i = 0; i < names.length; i++) gl.pixelStorei(names[i], i === 0 ? 4 : 0);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, 0);
        sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        if (!sync) throw new Error("capture fence unavailable");
        gl.flush();
      } finally {
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, binding);
        for (let i = 0; i < names.length; i++) gl.pixelStorei(names[i], pack[i]);
      }
      await new Promise((resolve, reject) => {
        // A valid full-resolution software frame exceeded 20 s; keep waiting
        // asynchronously instead of forcing Photo's synchronous canvas fallback.
        const deadline = performance.now() + 120000;
        const poll = () => {
          try {
            if (gl.isContextLost()) throw new Error("capture context lost");
            const status = gl.clientWaitSync(sync, 0, 0);
            if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) { resolve(); return; }
            if (status === gl.WAIT_FAILED) throw new Error("capture fence failed");
            if (performance.now() >= deadline) throw new Error("capture timed out");
            setTimeout(poll, 10);
          } catch (e) { reject(e); }
        };
        setTimeout(poll, 0);
      });
      const data = new Uint8ClampedArray(bytes);
      // Rendering may have changed this binding while the fence was pending.
      const bindingNow = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING);
      try {
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
        gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, data);
        if (gl.isContextLost()) throw new Error("capture context lost");
      } finally { gl.bindBuffer(gl.PIXEL_PACK_BUFFER, bindingNow); }
      const stride = w * 4, row = new Uint8ClampedArray(stride);
      for (let y = 0; y < Math.floor(h / 2); y++) {
        const a = y * stride, b = (h - 1 - y) * stride;
        row.set(data.subarray(a, a + stride)); data.copyWithin(a, b, b + stride); data.set(row, b);
      }
      return { width: w, height: h, data };
    } finally {
      try { if (sync) gl.deleteSync(sync); } catch (_) { /* context lost */ }
      try { if (pbo) gl.deleteBuffer(pbo); } catch (_) { /* context lost */ }
      _captureReads.delete(gl);
    }
  }

  return { pumpAnimation, texStandIn, readGlCapture };
})();

Object.freeze(TLXUtil);
