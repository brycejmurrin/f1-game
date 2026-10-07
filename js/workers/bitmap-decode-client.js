/* Apex 26 — page side of js/workers/bitmap-decode-worker.js.
   Decodes a Blob to an ImageBitmap on a Worker, then transfers it back.
   Falls back to main-thread createImageBitmap when Workers are missing or
   the worker errors. Upload / draw stays on the caller (render thread).
   Not a <script> tag dependency of the boot path — callers import via
   new Worker URL the same way TrackBuildClient loads build-worker.js. */
const BitmapDecode = (function () {
  "use strict";
  const DEFAULT_OPTS = Object.freeze({
    premultiplyAlpha: "none",
    colorSpaceConversion: "none",
    imageOrientation: "none",
  });
  let _w = null, _seq = 0;
  const _pending = new Map();

  function url(f) {
    return new URL(f + "?v=" + (typeof window !== "undefined" && window.__APEX_BUILD || 0),
      (typeof location !== "undefined" && location.href) || "http://x/").href;
  }

  function drop() {
    for (const p of _pending.values()) {
      try { p.reject(new Error("bitmap worker dropped")); } catch (_) { /* settle once */ }
    }
    _pending.clear();
    try { if (_w) _w.terminate(); } catch (_) { /* already gone */ }
    _w = null;
  }

  function spawn() {
    if (_w) return _w;
    if (typeof Worker === "undefined") return null;
    try {
      const w = new Worker(url("js/workers/bitmap-decode-worker.js"));
      w.onmessage = (e) => {
        const m = e.data || {};
        const p = _pending.get(m.seq);
        if (!p) return;
        _pending.delete(m.seq);
        if (m.type === "decoded") p.resolve(m.bmp);
        else p.reject(new Error(m.message || "bitmap decode failed"));
      };
      w.onerror = () => drop();
      _w = w;
      return w;
    } catch (_) {
      return null;
    }
  }

  async function mainThread(blob, opts, crop) {
    const o = opts || DEFAULT_OPTS;
    if (crop && crop.length === 4) {
      const [sx, sy, sw, sh] = crop;
      return createImageBitmap(blob, sx, sy, sw, sh, o);
    }
    return createImageBitmap(blob, o);
  }

  // blob: Blob|File; opts: ImageBitmapOptions; crop: [sx,sy,sw,sh] optional.
  async function decode(blob, opts, crop) {
    const o = opts ? Object.assign({}, DEFAULT_OPTS, opts) : DEFAULT_OPTS;
    const w = spawn();
    if (!w) return mainThread(blob, o, crop);
    const seq = ++_seq;
    try {
      return await new Promise((resolve, reject) => {
        _pending.set(seq, { resolve, reject });
        try {
          w.postMessage({ type: "decode", seq, blob, opts: o, crop: crop || null });
        } catch (err) {
          _pending.delete(seq);
          reject(err);
        }
      });
    } catch (_) {
      return mainThread(blob, o, crop);
    }
  }

  function supported() {
    return typeof Worker !== "undefined" && typeof createImageBitmap === "function";
  }

  return { decode, supported, DEFAULT_OPTS, drop };
})();
if (typeof window !== "undefined") window.BitmapDecode = BitmapDecode;
