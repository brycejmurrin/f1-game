// @doc Author-time PNG codec with distinct material-validation and legacy model-import policies.
// Author-time PNG codec; never loaded by the game. No filesystem or CLI work.
// Format/filter reference: https://www.w3.org/TR/png-3/
// Bounded inflate: https://nodejs.org/api/zlib.html#class-options
import zlib from "node:zlib";

// ───────────────────────────── PNG encoder ───────────────────────────────────
// A dependency-free RGBA8 encoder.  PNG rather than WebP because node ships
// zlib but no lossy encoder, and because createImageBitmap decodes PNG
// everywhere.  A real-scan bake should re-encode to WebP or KTX2 (see the
// research doc) — the runtime reads whatever the manifest names.

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

export function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

export function encodePNG(w, h, rgba) {
  // ADAPTIVE per-scanline filtering: try all five and keep the one with the
  // smallest sum of absolute signed deviations — the standard heuristic, and
  // the one libpng uses. Sub-only (the original) is fine for synthetic noise
  // but poor on photographic scans, where Paeth usually wins by a wide margin;
  // on the 512² browser bake this is the difference between a pack that fits
  // the commit budget and one that does not.
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  const cand = [Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride),
                Buffer.alloc(stride), Buffer.alloc(stride)];
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const line = rgba.subarray(y * stride, (y + 1) * stride);
    let best = 0, bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      const c = cand[f];
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= 4 ? line[i - 4] : 0, b = prev[i], cc = i >= 4 ? prev[i - 4] : 0;
        let v;
        if (f === 0) v = line[i];
        else if (f === 1) v = line[i] - a;
        else if (f === 2) v = line[i] - b;
        else if (f === 3) v = line[i] - ((a + b) >> 1);
        else {
          const p = a + b - cc, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - cc);
          v = line[i] - ((pa <= pb && pa <= pc) ? a : (pb <= pc ? b : cc));
        }
        c[i] = v & 0xff;
        score += c[i] < 128 ? c[i] : 256 - c[i];
      }
      if (score < bestScore) { bestScore = score; best = f; }
    }
    const o = y * (stride + 1);
    raw[o] = best;
    cand[best].copy(raw, o + 1);
    prev = line;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;   // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// Explicit parser profiles preserve the two tools' existing acceptance and
// fallback boundaries. Sharing scanline math does not impose bake validation
// on model imports (which historically tolerate CRC/header/scanline defects).
export function decodePNG(buf, { profile = "validation" } = {}) {
  if (profile === "validation") return decodeValidationPNG(buf);
  if (profile === "model-import") return decodeImportPNG(buf);
  throw new Error(`unknown PNG profile ${profile}`);
}

// Needed to re-encode what the BROWSER baker produces: canvas.toBlob writes a
// conservatively-filtered PNG, and a 512² 17-layer pair lands around 19 MB —
// well over the commit budget. This decodes it so `import-pack` can downsample
// and re-encode. Only what canvas emits: 8-bit RGB/RGBA, non-interlaced.
// Canvas/material validation: retain all original assets.mjs checks and the
// bounded inflate. Only non-interlaced 8-bit RGB/RGBA is accepted here.
function decodeValidationPNG(buf) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buf.length < 8 || !buf.subarray(0, 8).equals(signature)) throw new Error("not a PNG (bad signature)");
  let off = 8, w = 0, h = 0, depth = 0, colour = 0, ended = false, header = false;
  const idat = [];
  while (off < buf.length) {
    if (off + 12 > buf.length) throw new Error("truncated PNG chunk");
    const len = buf.readUInt32BE(off);
    if (len > buf.length - off - 12) throw new Error("truncated PNG chunk data");
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (crc32(buf.subarray(off + 4, off + 8 + len)) !== buf.readUInt32BE(off + 8 + len)) throw new Error(`PNG ${type} CRC mismatch`);
    if (!header && type !== "IHDR") throw new Error("PNG must start with IHDR");
    if (type === "IHDR") {
      if (header || len !== 13) throw new Error("invalid PNG IHDR");
      header = true;
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      if (!w || !h || w * h > 32 * 1024 * 1024) throw new Error("invalid or oversized PNG dimensions");
      depth = data[8]; colour = data[9];
      if (depth !== 8) throw new Error(`unsupported bit depth ${depth}`);
      if (colour !== 2 && colour !== 6) throw new Error(`unsupported colour type ${colour}`);
      if (data[10] || data[11] || data[12]) throw new Error("unsupported PNG compression/filter/interlace method");
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") {
      if (len !== 0 || !idat.length || off + 12 !== buf.length) throw new Error("invalid PNG IEND or missing image data");
      ended = true; break;
    }
    off += 12 + len;
  }
  if (!ended) throw new Error("PNG missing IEND");
  const ch = colour === 6 ? 4 : 3;
  const stride = w * ch;
  const expected = h * (stride + 1);
  const raw = zlib.inflateSync(Buffer.concat(idat), { maxOutputLength: expected });
  if (raw.length !== expected) throw new Error("PNG scanline length mismatch");
  return decodeScanlines({ w, h, colour, raw }, true);
}

// Colour types: 2 = RGB, 6 = RGBA, 3 = indexed (PLTE). Kenney City Kit Roads /
// Modular Buildings ship indexed colormaps — without type-3 support those
// imports silently fall back to flat 0.75 grey (materialColour catches the
// throw) and barriers/cones arrive colourless.
// Model palette imports deliberately keep their original permissive parser:
// four signature bytes; no CRC/ordering/IEND/dimension/format-method checks;
// unbounded inflate; PLTE only needs one RGB entry. materialColour owns fallback.
function decodeImportPNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let off = 8, w = 0, h = 0, colour = 0; const idat = [];
  let plte = null, trns = null;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      if (data[8] !== 8) throw new Error("bit depth"); colour = data[9];
      if (colour !== 2 && colour !== 6 && colour !== 3) throw new Error("colour type"); }
    else if (type === "PLTE") plte = Buffer.from(data);
    else if (type === "tRNS") trns = Buffer.from(data);
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  if (colour === 3 && (!plte || plte.length < 3)) throw new Error("indexed PNG missing PLTE");
  const raw = zlib.inflateSync(Buffer.concat(idat));
  return decodeScanlines({ w, h, colour, raw, plte, trns }, false);
}

// One owner for all five scanline filters and RGB/RGBA/palette expansion.
// The validation parser requests its original per-row filter check. Imports
// keep treating unknown filters as None and short/extra raw data as before.
function decodeScanlines({ w, h, colour, raw, plte, trns }, validateFilters) {
  const ch = colour === 6 ? 4 : colour === 3 ? 1 : 3;
  const stride = w * ch;
  const out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    if (validateFilters && f > 4) throw new Error(`Invalid PNG scanline filter ${f}`);
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride));
    // Undo the per-scanline filter. a = left, b = up, c = up-left.
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? line[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      line[i] = v & 0xff;
    }
    for (let x = 0; x < w; x++) {
      const s = x * ch, d = (y * w + x) * 4;
      if (colour === 3) {
        // Keep the importer's Buffer semantics for missing palette entries:
        // undefined RGB components become zero; tRNS is independently indexed.
        const idx = line[x], po = idx * 3;
        out[d] = plte[po]; out[d + 1] = plte[po + 1]; out[d + 2] = plte[po + 2];
        out[d + 3] = trns && idx < trns.length ? trns[idx] : 255;
      } else {
        out[d] = line[s]; out[d + 1] = line[s + 1]; out[d + 2] = line[s + 2];
        out[d + 3] = ch === 4 ? line[s + 3] : 255;
      }
    }
    prev = line;
  }
  return { w, h, rgba: out };
}
