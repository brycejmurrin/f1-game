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
  const REQUEST_MS = 4000;
  function closeBitmap(bmp) { try { if (bmp && typeof bmp.close === "function") bmp.close(); } catch (_) { /* best-effort disposal of an abandoned bitmap */ } }
  function validCrop(crop) {
    if (crop != null && (!Array.isArray(crop) || crop.length !== 4 ||
        !crop.every(Number.isFinite) || crop[2] <= 0 || crop[3] <= 0)) throw new Error("bitmap decode: invalid crop");
  }
  function settle(seq, err, bmp) {
    const p = _pending.get(seq);
    if (!p) { closeBitmap(bmp); return; }
    _pending.delete(seq);
    if (p.timer != null) clearTimeout(p.timer);
    if (p.signal) p.signal.removeEventListener("abort", p.abort);
    if (err) { closeBitmap(bmp); p.reject(err); } else p.resolve(bmp);
  }

  function url(f) {
    return new URL(f + "?v=" + (typeof window !== "undefined" && window.__APEX_BUILD || 0),
      (typeof location !== "undefined" && location.href) || "http://x/").href;
  }

  function drop() {
    for (const seq of _pending.keys()) settle(seq, new Error("bitmap worker dropped"));
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
        const valid = m.type === "decoded" && m.bmp && typeof m.bmp.close === "function" &&
          Number.isFinite(m.bmp.width) && m.bmp.width > 0 && Number.isFinite(m.bmp.height) && m.bmp.height > 0;
        settle(m.seq, valid ? null : new Error(m.message || "invalid bitmap worker reply"), m.bmp);
      };
      w.onerror = w.onmessageerror = () => { if (_w === w) drop(); };
      _w = w;
      return w;
    } catch (_) {
      return null;
    }
  }

  async function mainThread(blob, opts, crop) {
    const o = opts || DEFAULT_OPTS;
    if (crop != null) {
      const [sx, sy, sw, sh] = crop;
      return createImageBitmap(blob, sx, sy, sw, sh, o);
    }
    return createImageBitmap(blob, o);
  }

  // blob: Blob|File; opts: ImageBitmapOptions; crop: [sx,sy,sw,sh] optional.
  function abortError() { const e = new Error("bitmap decode aborted"); e.name = "AbortError"; return e; }
  // Optional fourth argument is an AbortSignal. drop() remains a worker reset:
  // worker faults fall back, while explicit cancellation never starts fallback.
  async function decode(blob, opts, crop, signal) {
    validCrop(crop);
    if (signal && signal.aborted) throw abortError();
    const o = opts ? Object.assign({}, DEFAULT_OPTS, opts) : DEFAULT_OPTS;
    const w = spawn();
    const fallback = async () => {
      if (signal && signal.aborted) throw abortError();
      const bmp = await mainThread(blob, o, crop);
      if (signal && signal.aborted) { closeBitmap(bmp); throw abortError(); }
      return bmp;
    };
    if (!w) return fallback();
    const seq = ++_seq;
    try {
      return await new Promise((resolve, reject) => {
        const p = { resolve, reject, timer: null };
        _pending.set(seq, p);
        if (signal) {
          p.signal = signal; p.abort = () => settle(seq, abortError());
          signal.addEventListener("abort", p.abort, { once: true });
          if (signal.aborted) { p.abort(); return; }
        }
        p.timer = setTimeout(() => settle(seq, new Error("bitmap worker timed out")), REQUEST_MS);
        try {
          w.postMessage({ type: "decode", seq, blob, opts: o, crop: crop || null });
        } catch (err) {
          settle(seq, err);
        }
      });
    } catch (err) {
      if (signal && signal.aborted) throw abortError();
      return fallback();
    }
  }

  function supported() {
    return typeof Worker !== "undefined" && typeof createImageBitmap === "function";
  }

  return { decode, supported, DEFAULT_OPTS, drop };
})();
if (typeof window !== "undefined") window.BitmapDecode = BitmapDecode;
