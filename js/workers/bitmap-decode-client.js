/* Apex 26 — page side of js/workers/bitmap-decode-worker.js.
   Pack-strip lane only (PARALLEL-HUNT-2026-10-24 P1): the worker inflates +
   unfilters a baked strip PNG and transfers the RGBA bytes back, behind
   apex26.packDecodeWorker ("1" on; unset or "0" OFF — a prototype). It answers
   null on anything but success, so the caller decodes on the page as before.
   The client ships as a boot <script> tag (tools/manifest.cjs FULL); only the
   worker entry is loaded via new Worker(ScriptLoader.url(...)). */
const BitmapDecode = (function () {
  "use strict";
  let _w = null, _seq = 0;
  const _pending = new Map();
  // A whole 256 strip is ~90 ms of decode on a desktop core (node, the shipped
  // pack); a phone core several times that. Generous: a timeout only falls back.
  const STRIP_MS = 15000;
  const STRIP_KEY = "apex26.packDecodeWorker";
  function closeBitmap(bmp) { try { if (bmp && typeof bmp.close === "function") bmp.close(); } catch (_) { /* best-effort disposal of an abandoned bitmap */ } }
  function settle(seq, err, value) {
    const p = _pending.get(seq);
    if (!p) { closeBitmap(value && value.close ? value : null); return; }
    _pending.delete(seq);
    if (p.timer != null) clearTimeout(p.timer);
    if (err) p.reject(err); else p.resolve(value);
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
        // settle a newer seq, and any transferred bitmap still needs closing.
        if (_w !== w) { closeBitmap(m.bmp); return; }
        // Strip is the only live port. A crossed or error reply answers null
        // and closes any ImageBitmap so it cannot leak.
        if (m.type === "strip") {
          settle(m.seq, null, m.pix ? { pix: m.pix, stride: m.stride } : null);
          return;
        }
        closeBitmap(m.bmp);
        settle(m.seq, null, null);
      };
      w.onerror = w.onmessageerror = () => { if (_w === w) drop(); };
      _w = w;
      return w;
    } catch (_) {
      return null;
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
        const p = { resolve, reject, timer: null };
        _pending.set(seq, p);
        p.timer = setTimeout(() => {
          // A silent worker stall affects every request on this instance.
          // Retire it so the next strip can start a healthy worker.
          if (_w === w) drop(); else settle(seq, new Error("strip worker timed out"));
        }, STRIP_MS);
        // drop() may have terminated `w` between spawn() and here. Never
        // postMessage at a corpse — that throws, and leaving `_w` pointed at
        // it makes every later strip hit the same InvalidStateError forever.
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

  return { strip, stripEnabled, drop };
})();
if (typeof window !== "undefined") window.BitmapDecode = BitmapDecode;
