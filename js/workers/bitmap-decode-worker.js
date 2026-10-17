/* Apex 26 — decode image Blobs to transferable ImageBitmaps off the page
   thread. The page uploads / draws; this worker only createImageBitmap().
   Options match the pack strip (premultiplyAlpha:"none", colorSpaceConversion:
   "none") plus imageOrientation so EXIF does not flip textures.
   https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html */
"use strict";
const DEFAULT_OPTS = Object.freeze({
  premultiplyAlpha: "none",
  colorSpaceConversion: "none",
  imageOrientation: "none",
});

self.onmessage = async (e) => {
  const m = e.data || {};
  if (m.type !== "decode") return;
  const seq = m.seq;
  let bmp = null;
  try {
    const blob = m.blob;
    if (!blob) throw new Error("decode: missing blob");
    const opts = m.opts ? Object.assign({}, DEFAULT_OPTS, m.opts) : DEFAULT_OPTS;
    if (m.crop != null && (!Array.isArray(m.crop) || m.crop.length !== 4 ||
        !m.crop.every(Number.isFinite) || m.crop[2] <= 0 || m.crop[3] <= 0)) throw new Error("bitmap decode: invalid crop");
    if (m.crop != null) {
      const [sx, sy, sw, sh] = m.crop;
      bmp = await createImageBitmap(blob, sx, sy, sw, sh, opts);
    } else {
      bmp = await createImageBitmap(blob, opts);
    }
    self.postMessage({ type: "decoded", seq, bmp }, [bmp]);
    bmp = null; // the page owns a successfully transferred bitmap
  } catch (err) {
    try { if (bmp) bmp.close(); } catch (_) { /* disposal must not suppress the error reply */ }
    self.postMessage({ type: "error", seq, message: String(err && err.message || err) });
  }
};
