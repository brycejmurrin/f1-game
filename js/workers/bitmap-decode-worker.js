/* Apex 26 — pack-strip worker (type "strip"): inflate a baked pack strip
   (assets/pack/mat-*.png) to raw RGBA layer bytes with no GPU and no DOM —
   DecompressionStream on the IDAT stream, then the five PNG scanline filters.
   Same reader as assets.js _decodeStripBytes without its per-layer yields
   (apex26.packDecodeWorker, PARALLEL-HUNT-2026-10-24 P1). Pure: same bytes in
   give the same bytes out, on any thread.
   https://www.w3.org/TR/png-3/#9Filters
   https://developer.mozilla.org/en-US/docs/Web/API/DecompressionStream */
"use strict";
const PngStrip = (function () {

  async function inflate(parts, needed) {
    const out = new Uint8Array(needed);
    const ds = new DecompressionStream("deflate");   // zlib-wrapped, as PNG IDAT is
    const w = ds.writable.getWriter();
    const wrote = (async () => { for (const p of parts) await w.write(p); await w.close(); })();
    wrote.catch(() => {});   // a corrupt stream errors both ends: the read below reports it, once
    let n = 0;
    const r = ds.readable.getReader();
    for (;;) {
      const { done, value } = await r.read();
      if (done) break;
      const take = Math.min(value.length, needed - n);
      if (take > 0) { out.set(value.subarray(0, take), n); n += take; }
    }
    await wrote;
    return n === needed ? out : out.subarray(0, n);
  }

  // Rows [r0, r1) of raw (a filter byte + stride bytes per row) into out.
  function unfilterRows(raw, out, stride, r0, r1) {
    for (let r = r0; r < r1; r++) {
      const ft = raw[r * (stride + 1)], s = r * (stride + 1) + 1, o = r * stride, u = o - stride;
      if (ft === 0 || (ft === 2 && r === 0)) { out.set(raw.subarray(s, s + stride), o); continue; }
      if (ft === 1) {
        for (let x = 0; x < stride; x++) out[o + x] = raw[s + x] + (x >= 4 ? out[o + x - 4] : 0);
      } else if (ft === 2) {
        for (let x = 0; x < stride; x++) out[o + x] = raw[s + x] + out[u + x];
      } else if (ft === 3) {
        for (let x = 0; x < stride; x++) {
          const a = x >= 4 ? out[o + x - 4] : 0, b = r ? out[u + x] : 0;
          out[o + x] = raw[s + x] + ((a + b) >> 1);
        }
      } else if (ft === 4) {
        for (let x = 0; x < stride; x++) {
          const a = x >= 4 ? out[o + x - 4] : 0, b = r ? out[u + x] : 0, c = x >= 4 && r ? out[u + x - 4] : 0;
          const p = a + b - c, pa = p > a ? p - a : a - p, pb = p > b ? p - b : b - p, pc = p > c ? p - c : c - p;
          out[o + x] = raw[s + x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
        }
      } else throw new Error("png filter " + ft);
    }
  }

  // png: Uint8Array of the whole file; size: layer edge in px; layers: how many
  // layers from the top to unfilter (the last one the pack asks for, + 1).
  // Returns { pix, stride } — pix holds rows*size scanlines of RGBA — or null
  // for any PNG this reader does not take (the caller decodes as before).
  async function decode(png, size, layers) {
    if (typeof DecompressionStream !== "function" || !png || !(layers > 0)) return null;
    const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < 8; i++) if (png[i] !== SIG[i]) return null;
    const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
    let w = 0, h = 0, ok = false;
    const idat = [];
    for (let p = 8; p + 8 <= png.length;) {
      const len = dv.getUint32(p), d = p + 8;
      const type = String.fromCharCode(png[p + 4], png[p + 5], png[p + 6], png[p + 7]);
      if (d + len > png.length) return null;
      if (type === "IHDR") {
        w = dv.getUint32(d); h = dv.getUint32(d + 4);
        ok = png[d + 8] === 8 && png[d + 9] === 6 && png[d + 10] === 0 && png[d + 11] === 0 && png[d + 12] === 0;
      } else if (type === "IDAT") idat.push(png.subarray(d, d + len));
      else if (type === "IEND") break;
      else if (!(png[p + 4] & 0x20) || type === "iCCP" || type === "sRGB" || type === "gAMA" || type === "cHRM") return null;
      p = d + len + 4;
    }
    if (!ok || w !== size || !idat.length || h < layers * size) return null;
    const stride = w * 4, rows = layers * size;
    const raw = await inflate(idat, rows * (stride + 1));
    if (raw.length < rows * (stride + 1)) return null;
    const pix = new Uint8Array(rows * stride);
    unfilterRows(raw, pix, stride, 0, rows);
    return { pix, stride };
  }

  return { decode };
})();
self.PngStrip = PngStrip;   // the unit test reads it from the worker context

async function strip(m) {
  const seq = m.seq;
  try {
    if (!m.blob || typeof m.blob.arrayBuffer !== "function") throw new Error("strip: missing blob");
    const got = await PngStrip.decode(new Uint8Array(await m.blob.arrayBuffer()), m.size, m.layers);
    // null = a PNG this reader refuses: the page decodes it as before.
    if (!got) { self.postMessage({ type: "strip", seq, pix: null }); return; }
    self.postMessage({ type: "strip", seq, pix: got.pix, stride: got.stride }, [got.pix.buffer]);
  } catch (err) {
    try { self.postMessage({ type: "error", seq, message: String(err && err.message || err) }); } catch (_) { /* page already dropped us */ }
  }
}

self.onmessage = async (e) => {
  const m = e.data || {};
  if (m.type === "strip") return strip(m);
  // Unknown / retired ports (former ImageBitmap "decode") — no reply.
};
