const BitmapDecode = (function () {
  "use strict";
  let _w = null, _seq = 0;
  const _pending = new Map();
  const STRIP_MS = 15000;
  const STRIP_KEY = "apex26.packDecodeWorker";
  function closeBitmap(bmp) { try { if (bmp && typeof bmp.close === "function") bmp.close(); } catch (_) {  } }
  function settle(seq, err, value) {
    const p = _pending.get(seq);
    if (!p) { closeBitmap(value && value.close ? value : null); return; }
    _pending.delete(seq);
    if (p.timer != null) clearTimeout(p.timer);
    if (err) p.reject(err); else p.resolve(value);
    if (!_pending.size && _w) {
      try { _w.terminate(); } catch (_) {  }
      _w = null;
    }
  }

  function url(f) {
    const keyed = typeof ScriptLoader !== "undefined" && ScriptLoader.url ? ScriptLoader.url(f) : f + "?v=" + (typeof window !== "undefined" && window.__APEX_BUILD || 0);
    return new URL(keyed, (typeof location !== "undefined" && location.href) || "http://x/").href;
  }

  function drop() {
    for (const seq of _pending.keys()) settle(seq, new Error("bitmap worker dropped"));
    try { if (_w) _w.terminate(); } catch (_) {  }
    _w = null;
  }

  function spawn() {
    if (_w) return _w;
    if (typeof Worker === "undefined") return null;
    try {
      const w = new Worker(url("js/workers/bitmap-decode-worker.js"));
      w.onmessage = (e) => {
        const m = e.data || {};
        if (_w !== w) { closeBitmap(m.bmp); return; }
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

  return { strip, stripEnabled, drop };
})();
if (typeof window !== "undefined") window.BitmapDecode = BitmapDecode;
