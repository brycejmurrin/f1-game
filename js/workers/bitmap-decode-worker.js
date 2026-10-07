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
  try {
    const blob = m.blob;
    if (!blob) throw new Error("decode: missing blob");
    const opts = m.opts ? Object.assign({}, DEFAULT_OPTS, m.opts) : DEFAULT_OPTS;
    let bmp;
    if (m.crop && m.crop.length === 4) {
      const [sx, sy, sw, sh] = m.crop;
      bmp = await createImageBitmap(blob, sx, sy, sw, sh, opts);
    } else {
      bmp = await createImageBitmap(blob, opts);
    }
    self.postMessage({ type: "decoded", seq, bmp }, [bmp]);
  } catch (err) {
    self.postMessage({ type: "error", seq, message: String(err && err.message || err) });
  }
};
