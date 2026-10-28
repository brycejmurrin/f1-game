/* Apex 26 — page side of js/workers/bitmap-decode-worker.js.
   Decodes a Blob to an ImageBitmap on a Worker, then transfers it back.
   Falls back to main-thread createImageBitmap when Workers are missing or
   the worker errors. Upload / draw stays on the caller (render thread).
   The client ships as a boot <script> tag (tools/manifest.cjs FULL); only the
   worker entry is loaded via new Worker(ScriptLoader.url(...)), same pattern
   as TrackBuildClient / build-worker.js.
   strip() is the pack-strip lane (PARALLEL-HUNT-2026-10-24 P1): the worker
   inflates + unfilters a baked strip PNG and transfers the RGBA bytes back,
   behind apex26.packDecodeWorker ("1" on; unset or "0" OFF — a prototype).
   It answers null on anything but success, so the caller decodes on the page
   exactly as before. */
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
  // A whole 256 strip is ~90 ms of decode on a desktop core (node, the shipped
  // pack); a phone core several times that. Generous: a timeout only falls back.
  const STRIP_MS = 15000;
  const STRIP_KEY = "apex26.packDecodeWorker";
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
    if (err) { if (!p.strip) closeBitmap(bmp); p.reject(err); } else p.resolve(bmp);
  }

  function url(f) {
    // audit4 I3 B6: the same cache key ScriptLoader gives every lazy file, so bump-cache precaches it like the rest
    const keyed = typeof ScriptLoader !== "undefined" && ScriptLoader.url ? ScriptLoader.url(f) : f + "?v=" + (typeof window !== "undefined" && window.__APEX_BUILD || 0);
    return new URL(keyed, (typeof location !== "undefined" && location.href) || "http://x/").href;
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
        // A reply from a worker we already terminated (drop + respawn) must not
        // settle a newer seq, and its transferred bitmap still needs closing.
        if (_w !== w) { closeBitmap(m.bmp); return; }
        const pending = _pending.get(m.seq);
        // Reply kind must match the waiting request. A crossed strip/decode
        // reply used to resolve the wrong shape (decode got {pix,stride}, or
        // strip kept an ImageBitmap it then discarded without close()).
        if (m.type === "strip") {
          if (pending && !pending.strip) {
            settle(m.seq, new Error("invalid bitmap worker reply"), null);
            return;
          }
          settle(m.seq, null, m.pix ? { pix: m.pix, stride: m.stride } : null);
          return;
        }
        if (pending && pending.strip) {
          closeBitmap(m.bmp);
          settle(m.seq, null, null);
          return;
        }
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
        p.timer = setTimeout(() => {
          // A silent worker stall affects every request on this instance.
          // Retire it so the next decode can start a healthy worker.
          if (_w === w) drop(); else settle(seq, new Error("bitmap worker timed out"));
        }, REQUEST_MS);
        // drop() may have terminated `w` between spawn() and here (or the
        // browser neutered it without firing onerror). Never postMessage at a
        // corpse — that throws, and leaving `_w` pointed at it makes every
        // later decode hit the same InvalidStateError forever.
        if (_w !== w) {
          settle(seq, new Error("bitmap worker dropped"));
          return;
        }
        try {
          w.postMessage({ type: "decode", seq, blob, opts: o, crop: crop || null });
        } catch (err) {
          if (_w === w) drop();
          else settle(seq, err);
        }
      });
    } catch (err) {
      if (signal && signal.aborted) throw abortError();
      return fallback();
    }
  }

  function stripEnabled() {
    try { if (localStorage.getItem(STRIP_KEY) !== "1") return false; } catch (_) { return false; }
    return typeof Worker !== "undefined";
  }
  // blob: the strip PNG; size: layer edge in px; present: per-MAT-layer truthy
  // flags (assets.js's own). Resolves an Array of per-layer Uint8Array views
  // (undefined where !present), or null — off, no worker, a refused PNG, an
  // error or a timeout — and the caller decodes on the page as before.
  async function strip(blob, size, present) {
    if (!stripEnabled() || !blob || !present) return null;
    let last = -1;
    for (let i = 0; i < present.length; i++) if (present[i]) last = i;
    if (last < 0) return null;
    const w = spawn();
    if (!w) return null;
    const seq = ++_seq;
    let got = null;
    try {
      got = await new Promise((resolve, reject) => {
        const p = { resolve, reject, timer: null, strip: true };
        _pending.set(seq, p);
        p.timer = setTimeout(() => {
          if (_w === w) drop(); else settle(seq, new Error("strip worker timed out"));
        }, STRIP_MS);
        if (_w !== w) { settle(seq, new Error("bitmap worker dropped")); return; }
        try { w.postMessage({ type: "strip", seq, blob, size, layers: last + 1 }); }
        catch (err) { if (_w === w) drop(); else settle(seq, err); }
      });
    } catch (_) { return null; }
    const layer = got && size * size * 4;
    if (!got || !(got.pix instanceof Uint8Array) || got.stride !== size * 4 || got.pix.length < (last + 1) * layer) return null;
    const out = new Array(present.length);
    for (let i = 0; i <= last; i++) if (present[i]) out[i] = got.pix.subarray(i * layer, (i + 1) * layer);
    return out;
  }

  function supported() {
    return typeof Worker !== "undefined" && typeof createImageBitmap === "function";
  }

  return { decode, strip, stripEnabled, supported, DEFAULT_OPTS, drop };
})();
if (typeof window !== "undefined") window.BitmapDecode = BitmapDecode;
