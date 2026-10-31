/* Apex 26 — TLXShaders.chunked: the chunked-mesh subsystem for the TLX backend
 * (M7). The three.js sibling of js/render/glx/chunked.js: buckets the heavy
 * city/props geometry into culled chunks and packs vertex attributes to cut
 * three's CPU-side memory. */
"use strict";

(function () {

  // Per-frame cull scratch — module-static so drawChunked allocates nothing.
  const _fcPlanes = [new Float32Array(4), new Float32Array(4), new Float32Array(4),
                     new Float32Array(4), new Float32Array(4), new Float32Array(4)];

  // Vertex-attribute packing.
  // three keeps the CPU copy of every attribute array forever (measured: 49.8
  // MB of deduped attribute bytes on montreal, against GLX's 17.8 MB, which is
  // what OOM-kills an iPhone tab mid-race — docs/PERF-FINDINGS.md 2m). Half of
  // those bytes are Float32 holding values that do not need 32 bits: a colour
  // channel is 8-bit, a unit normal survives 16, a MAT id is 0..16.
  //
  // The pack PROVES its precondition instead of assuming it. A colour outside
  // [0,1] (emissive) or a MAT id above 255 must never be silently clamped, so
  // every source is range-scanned first and anything that does not fit stays
  // Float32. `packStats` records which way each attribute went, so "quantised
  // nothing" can never be mistaken for "nothing needed quantising".
  // Off-switch AND the A/B handle: apex26.tlxPack="0" keeps every attribute
  // Float32 and every absent one its own array — the pre-pack behaviour, on
  // the same build, so a look regression can be attributed rather than argued.
  const packOn = (function () {
    try { return localStorage.getItem("apex26.tlxPack") !== "0"; } catch (_) { return true; }
  })();
  const packStats = { on: packOn, small: 0, wide: 0, zero: 0, savedMB: 0,
    // WHICH kind refused to quantise, how many vertices it cost, and the worst
    // value that pushed it out of range. "29 stayed wide" is not actionable;
    // "unorm, 3.1 M values, max 3.87" says the colours carry emissive above 1.
    half: 0, wideBy: {}, wideMax: {}, wideLen: {},
    // A-W2: attributes widened to a 4-byte stride on WebGL2, and the MB that cost.
    pad4On: null, pad4: 0, pad4MB: 0 };
  // float32 -> float16 bits. three exports Float16BufferAttribute but no
  // converter, so this is ours, with the subnormal and overflow cases handled
  // rather than wrapped.
  //
  // ROUNDS, half-to-even. Truncating (`man >>> 13` alone) is always-toward-zero
  // and therefore a DARKENING bias on every value it touches: measured -6.5e-4
  // mean signed error against ~0 rounded, with the worst case twice as large,
  // live on both legs for emissive colour and material ids.
  const _fb = new Float32Array(1), _ib = new Uint32Array(_fb.buffer);
  function _toHalf(v) {
    _fb[0] = v;
    const x = _ib[0], sign = (x >>> 16) & 0x8000;
    const exp = (x >>> 23) & 0xff;
    let man = x & 0x7fffff;
    if (exp === 255) return sign | 0x7c00 | (man ? 0x200 : 0);   // Inf / NaN
    let e = exp - 112;                                            // 127 - 15
    if (e >= 31) return sign | 0x7c00;                            // overflows half
    if (e <= 0) {                                                 // subnormal / zero
      if (e < -11) return sign;
      man |= 0x800000;
      const sh = 14 - e;                                          // bits discarded
      const lsb = Math.pow(2, sh), half = lsb / 2;
      const rem = man % lsb;
      let out = Math.floor(man / lsb);
      if (rem > half || (rem === half && (out & 1))) out += 1;
      // A carry out of the subnormal range lands on the smallest NORMAL half
      // (exponent 1, mantissa 0) all by itself — 0x400 is exactly that.
      return sign | out;
    }
    const rem = man & 0x1fff;                                     // the 13 dropped bits
    let h = man >>> 13;
    if (rem > 0x1000 || (rem === 0x1000 && (h & 1))) h += 1;
    if (h & 0x400) { h = 0; e += 1; if (e >= 31) return sign | 0x7c00; }
    return sign | (e << 10) | h;
  }
  // One shared all-zero buffer behind every absent attribute. Views into it
  // carry the right per-mesh count while costing one allocation in total —
  // absent `trk` alone measured 5.88 MB of zeros across 153 meshes. SAFE only
  // because nothing ever writes these: they are absent-source placeholders on
  // static geometry, and three re-reads an array only on a version bump that
  // never comes. Never hand this to an attribute a caller may mutate.
  let _zeroBuf = new Float32Array(0);
  function _zeros(len) {
    if (_zeroBuf.length < len) _zeroBuf = new Float32Array(len);
    return _zeroBuf.subarray(0, len);
  }
  // `fmt24` is the WebGPU rule: 8- and 16-bit VERTEX FORMATS exist only in
  // 2- and 4-component widths (unorm8x2/x4, snorm16x2/x4, float16x2/x4 —
  // there is no float16x3 and no unorm8x1), and three names the format
  // straight from itemSize, so a packed 3-wide colour or 1-wide id reaches
  // createRenderPipeline as 'float16x3' and the whole pipeline is REFUSED:
  // "TLX REFUSED ... not a valid enum value of type GPUVertexFormat",
  // measured on macos-latest/Metal (gpu-census runs 21-22, 2026-09-02) and
  // reproduced here under Dawn/SwiftShader. WebGL2 takes any width, which is
  // why the WebGL2 control leg stayed green while the WebGPU leg fell back to
  // GLX silently. Under fmt24 those widths keep Float32 (the pre-pack
  // layout); padding x3 to x4 is NOT the fix — three reads a 4-wide colour
  // attribute as RGBA.
  // WIDEN rather than give up, on the WebGPU leg.
  //
  // `fmt24` sets kind = null for every 1- or 3-wide channel; left there, normal,
  // colour and mat would fall back to Float32 (~23 bytes a vertex on WebGL2 vs
  // the full 40 on WebGPU). But a 3-wide channel fits a 4-wide FORMAT with a
  // zero in w, and WebGPU lets a vertex format carry MORE components than the
  // shader input reads.
  // tsl-lit.js keeps reading attribute("color", "vec3"); no TSL changes.
  //
  // mat is left alone: it is one scalar, float32 is already the narrowest lane
  // WebGPU offers at 1-wide, and padding it to 4 would COST 12 bytes.
  // A-W2 (perf hunt 4): 4-BYTE STRIDES ON THREE'S WEBGL2 BACKEND. ANGLE on
  // Metal converts, at the first draw that binds it, every vertex buffer whose
  // stride is not a multiple of 4 (Metal requires 4; ANGLE VertexArrayMtl
  // syncDirtyAttrib -> convertVertexBufferCPU, on the CPU for half floats).
  // layouts.cjs measured montreal's WebGL2 pack at 12.6 of 30.4 MB in such
  // strides: normal Int16x3n (6 B), colour Uint8x3n (3 B) / Float16x3 (6 B),
  // mat Float16x1 (2 B). So on WebGL2 (`fmt24 === false`, both shipping call
  // sites) the packed result is widened to a 4-byte stride with the SAME
  // values the shader reads:
  //   x3 -> x4 of the same type. w = 0 for a unit normal (read as vec3, the
  //   fmt24 pad); w = 1.0 for a colour (Uint8 255 / half 0x3C00), so the one
  //   reader that takes RGBA — three's vertexColor() on rawUnlitMat — sees
  //   alpha 1, exactly what three pads a 3-wide colour with (NodeBuilder
  //   format vec3 -> vec4(x, 1.0)); tsl-lit and the unlit mats read "vec3"
  //   (the .xyz of a vec4 input).
  //   a 1-wide half (mat) -> Float32 of the DECODED half: the shader gets the
  //   bit-identical float the half gave it (a half is exact in f32), not the
  //   source value (MAT 15.4 stays 15.3984375).
  // +5 B a vertex (normal +2, colour +1, mat +2). WebGPU (fmt24 true) already
  // has only 2-/4-wide 8/16-bit formats; an undefined fmt24 (the
  // tools/gfx/tlx-pack-check.cjs lift) keeps the raw pack.
  // apex26.tlxPad4="0" restores the narrow strides.
  const pad4On = (function () {
    try { return localStorage.getItem("apex26.tlxPad4") !== "0"; } catch (_) { return true; }
  })();
  packStats.pad4On = pad4On;
  function _fromHalf(h) {
    const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, m = h & 0x3ff;
    if (e === 0) return s * m * 5.960464477539063e-8;                 // 2^-24
    if (e === 31) return m ? NaN : s * Infinity;
    return s * (1 + m / 1024) * Math.pow(2, e - 15);
  }
  function packAttr(THREE, src, len, itemSize, kind, fmt24) {
    const steps = packAttrSteps(THREE, src, len, itemSize, kind, fmt24);
    let next; do { next = steps.next(); } while (!next.done);
    return next.value;
  }
  function* packAttrSteps(THREE, src, len, itemSize, kind, fmt24, config) {
    const packing = config ? config.pack : packOn;
    const padding = config ? config.pad4 : pad4On;
    let ok = src && src.length === len;
    // W2: only a 3-wide 8/16-bit or a 1-wide 16-bit result misses 4 bytes (itemSize 2 of 16 bits is 4 B).
    const pad = fmt24 === false && padding && (itemSize === 3 || itemSize === 1);
    if (fmt24 && itemSize === 3 && ok && kind === "unit") {
      // Validate and pack in one source pass: no padded Float32 temporary
      // (16 bytes/vertex). fround preserves that temporary's conversion of
      // JS-array inputs before both the range check and quantisation.
      if (packing) {
        const a = new Int16Array((len / 3) * 4);
        let fits = true;
        for (let i = 0; i < len; i++) {
          if ((i & 8191) === 0) yield;
          const v = Math.fround(src[i]);
          if (!(v >= -1.0001 && v <= 1.0001)) { fits = false; break; }
          const q = Math.round(v * 32767);
          a[i + ((i / 3) | 0)] = q < -32767 ? -32767 : q > 32767 ? 32767 : q;
        }
        if (fits) {
          packStats.small++; packStats.savedMB += a.byteLength / 1048576;
          return new THREE.BufferAttribute(a, 4, true);
        }
      }
      // Packing off, or an out-of-range/nonfinite normal: retain the wide
      // fallback and its diagnostics exactly as before.
      src = yield* pad4Steps(src, len); len = (len / 3) * 4; itemSize = 4;
    }
    // NORMAL ONLY, and COLOUR DELIBERATELY LEFT WIDE. Bisected on lavapipe,
    // montreal, against a control whose mean luma varies by only +/-0.1 across
    // runs (45.6 / 45.5 / 45.6) — each row is one probe, coverage census
    // identical to the tenth of a percent in every one:
    //
    //   control, nothing widened          mean luma 45.6   max 486
    //   widen NORMAL only  (snorm16x4)    mean luma 45.6   max 486  <- free
    //   widen COLOUR only  (unorm8x4)     mean luma 42.9   max 485
    //   widen both                        mean luma 42.8   max 485
    //   colour as Float16BufferAttribute  mean luma 39.1   max 467
    //
    // So the normal is free at 16 bits and the colour is not free at any width
    // tried. Eight bits costs ~6 % of the frame; three's Float16BufferAttribute
    // costs MORE (~14 %) than the byte does, which is backwards on precision
    // grounds and says the fault is in how three hands that array to the
    // WebGPU backend rather than in the encoding — unexplained, so not shipped.
    // Colour therefore stays float32x3 here and the channel keeps its 12 bytes.
    //
    // Two things fall out of this worth someone's time. The WebGL2 leg DOES
    // quantise colour to a byte today, so it is probably paying that same 6 %
    // where nobody can see it — the probe cannot read a frame on that leg.
    // And the Float16BufferAttribute result wants a real GPU before anyone
    // trusts it; lavapipe is not a player's machine.
    if (fmt24 && itemSize !== 2 && itemSize !== 4) kind = null;
    if (!packing) {
      return new THREE.BufferAttribute(
        ok ? (src instanceof Float32Array ? src : (yield* f32Steps(src))) : new Float32Array(len),
        itemSize);
    }
    if (!ok) {
      packStats.zero++;
      packStats.savedMB += (len * 4) / 1048576;      // the copy we did NOT make
      return new THREE.BufferAttribute(_zeros(len), itemSize);
    }
    let fits = kind != null;
    let finite = true;
    if (fits) {
      for (let i = 0; i < len; i++) {
          if ((i & 8191) === 0) yield;
        const v = src[i];
        if (!(v === v) || v === Infinity || v === -Infinity) { fits = false; finite = false; break; }
        // EPS, not a bare compare: a normalised normal lands on
        // 1.0000000560427362 often enough that four whole attributes (1.29 M
        // values, 4.9 MB) refused Int16 over float noise. Measured, not
        // guessed — the range scan reported that exact maximum.
        if (kind === "unit") { if (v < -1.0001 || v > 1.0001) { fits = false; break; } }
        else if (kind === "unorm") { if (v < 0 || v > 1) { fits = false; break; } }
        else if (kind === "id") { if (v < 0 || v > 255 || (v | 0) !== v) { fits = false; break; } }
      }
    }
    if (!fits) {
      const kk = kind || "raw";
      packStats.wideBy[kk] = (packStats.wideBy[kk] || 0) + 1;
      packStats.wideLen[kk] = (packStats.wideLen[kk] || 0) + len;
      let mx = packStats.wideMax[kk];
      for (let i = 0; i < len; i++) {
          if ((i & 8191) === 0) yield; const v = src[i]; if (!(mx >= v)) mx = v; }
      packStats.wideMax[kk] = mx;
      // Out of the small type's range is not the same as needing 32 bits.
      // Colours carry emissive up to 3.4 and MAT ids are not always whole
      // (measured 15.4), but half-float holds both with room to spare and
      // costs 2 bytes — three maps a Float16BufferAttribute straight to
      // GL_HALF_FLOAT, so the shader still reads a plain float and nothing
      // else changes. NOT for `trk`: its arc length reaches 5382 m, where
      // half-float's 11-bit mantissa is worth about +/-2.6 m and road
      // markings need far better. Non-finite data keeps Float32 as well —
      // half would turn a stray Infinity into a different wrong number.
      if (finite && THREE.Float16BufferAttribute && (kind === "unorm" || kind === "id")) {
        packStats.half++;
        const h = new Uint16Array(len);
        for (let i = 0; i < len; i++) { if ((i & 8191) === 0) yield; h[i] = _toHalf(src[i]); }
        packStats.savedMB += (len * 2) / 1048576;
        if (pad) return (yield* halfAttrSteps(THREE, h, itemSize, kind));
        // Constructor, NOT a post-hoc `.array =`: BufferAttribute derives
        // `count` from the array it is GIVEN, so assigning afterwards leaves
        // count 0 and the mesh draws nothing.
        return new THREE.Float16BufferAttribute(h, itemSize);
      }
      packStats.wide++;
      const f = src instanceof Float32Array ? src : (yield* f32Steps(src));
      return new THREE.BufferAttribute(f, itemSize);
    }
    packStats.small++;
    if (kind === "unit") {
      // Write padded WebGL2 normals into their final storage: widening an
      // Int16x3 temporary would allocate another 6 bytes per vertex.
      const wide = pad && itemSize === 3;
      const a = new Int16Array(wide ? (len / 3) * 4 : len);
      // CLAMP, like VertexPack.qs: the scan above admits |v| <= 1.0001, and
      // round(1.0001 * 32767) = 32770 WRAPS in an Int16 to -32766 — a
      // normal flipped to the opposite hemisphere. ±32767 keeps snorm symmetric.
      for (let i = 0; i < len; i++) {
          if ((i & 8191) === 0) yield;
        const q = Math.round(src[i] * 32767);
        a[wide ? i + ((i / 3) | 0) : i] = q < -32767 ? -32767 : q > 32767 ? 32767 : q;
      }
      packStats.savedMB += (len * 2) / 1048576;
      if (wide) {
        packStats.pad4++; packStats.pad4MB += ((len / 3) * 2) / 1048576;
        return new THREE.BufferAttribute(a, 4, true);   // untouched fourth lanes stay zero
      }
      return new THREE.BufferAttribute(a, itemSize, true);            // normalized
    }
    if (kind === "id") {
      // NOT a bare Uint8Array. A non-normalized integer array is bound as an
      // INTEGER attribute (vertexAttribIPointer / a uint vertex format) while
      // tsl-lit.js reads attribute("mat", "float"); SwiftShader shrugs, ANGLE
      // on Metal refuses every draw — GL_INVALID_OPERATION "vertex shader
      // input type does not match the type of the bound vertex attribute",
      // measured on macos-latest (dispatched runs 2217/2218, 2026-09-02) with
      // the road still drawing on the WebGL2/SwiftShader CI. Half-float holds
      // every id exactly (integers to 2048), is a FLOAT format on both
      // backends, and still halves the 4-byte source; the same path the
      // out-of-range branch above already takes.
      packStats.half++;
      const h = new Uint16Array(len);
      for (let i = 0; i < len; i++) { if ((i & 8191) === 0) yield; h[i] = _toHalf(src[i]); }
      packStats.savedMB += (len * 2) / 1048576;
      if (pad) return (yield* halfAttrSteps(THREE, h, itemSize, kind));   // W2: mat Float16x1 -> Float32 of the decoded half
      return new THREE.Float16BufferAttribute(h, itemSize);
    }
    const a = new Uint8Array(len);
    for (let i = 0; i < len; i++) { if ((i & 8191) === 0) yield; a[i] = Math.round(src[i] * 255); }
    packStats.savedMB += (len * 3) / 1048576;
    if (pad && itemSize === 3) return new THREE.BufferAttribute((yield* widen4Steps(a, 255)), 4, true);   // W2: unorm8x4, alpha 1.0
    return new THREE.BufferAttribute(a, itemSize, true);              // unorm: normalized = a float input
  }
  // Uint16 indices wherever the vertex count allows — three picks the GL type
  // from the array, so this is a straight halving with no shader involvement.
  function packIndex(THREE, idx, vCount) {
    const attribute = new THREE.BufferAttribute(
      (!packOn || vCount > 65535) ? new Uint32Array(idx) : new Uint16Array(idx), 1);
    // The vendor keeps owned scalar indices narrow and aligns later updates.
    if (attribute.array instanceof Uint16Array) attribute.__apexUint16Index = true;
    return attribute;
  }

  // Immutable CPU payload: no THREE objects, canvas or GPU ownership crosses
  // the worker boundary. The sync renderer and cooperative replay use the same steps.
  class PreparedAttribute {
    constructor(array, itemSize, normalized) { Object.assign(this, { array, itemSize, normalized: !!normalized }); }
  }
  class PreparedHalfAttribute extends PreparedAttribute {
    constructor(array, itemSize) { super(array, itemSize); this.half = true; }
  }
  const AttributeTypes = { BufferAttribute: PreparedAttribute, Float16BufferAttribute: PreparedHalfAttribute };
  function chunkPrepareConfig(fmt24) {
    let merge = 3;
    try { const v = +localStorage.getItem("apex26.tlxChunkMerge"); if (v >= 1 && v <= 4) merge = v | 0; } catch (_) { /* default */ }
    return { version: 1, backend: "tlx", fmt24: !!fmt24, pack: packOn, pad4: pad4On, merge };
  }
  function validPrepareConfig(c) {
    return !!c && c.version === 1 && c.backend === "tlx" && typeof c.fmt24 === "boolean" &&
      typeof c.pack === "boolean" && typeof c.pad4 === "boolean" && Number.isInteger(c.merge) && c.merge >= 1 && c.merge <= 4;
  }
  function samePrepareConfig(a, b) {
    return validPrepareConfig(a) && validPrepareConfig(b) &&
      ["version", "backend", "fmt24", "pack", "pad4", "merge"].every(k => a[k] === b[k]);
  }
  function* f32Steps(src) {
    if (src instanceof Float32Array) return src;
    const out = new Float32Array(src.length);
    for (let i = 0; i < src.length; i++) { if ((i & 8191) === 0) yield; out[i] = src[i]; }
    return out;
  }
  function* pad4Steps(src, len) {
    const out = new Float32Array(len / 3 * 4);
    for (let i = 0; i < len / 3; i++) { if ((i & 8191) === 0) yield; out[i*4] = src[i*3]; out[i*4+1] = src[i*3+1]; out[i*4+2] = src[i*3+2]; }
    return out;
  }
  function* widen4Steps(a, w) {
    const n = a.length / 3, out = new a.constructor(n * 4);
    for (let i = 0; i < n; i++) { if ((i & 8191) === 0) yield; out[i*4] = a[i*3]; out[i*4+1] = a[i*3+1]; out[i*4+2] = a[i*3+2]; out[i*4+3] = w; }
    packStats.pad4++; packStats.pad4MB += n * a.BYTES_PER_ELEMENT / 1048576;
    return out;
  }
  function* halfAttrSteps(THREE, h, itemSize, kind) {
    if (itemSize === 3) return new THREE.Float16BufferAttribute(yield* widen4Steps(h, kind === "unorm" ? 0x3c00 : 0), 4);
    const f = new Float32Array(h.length);
    for (let i = 0; i < h.length; i++) { if ((i & 8191) === 0) yield; f[i] = _fromHalf(h[i]); }
    packStats.pad4++; packStats.pad4MB += h.length * 2 / 1048576;
    return new THREE.BufferAttribute(f, itemSize);
  }
  function* prepareChunksSteps(data, cellSize, config, releaseSource) {
    if (!validPrepareConfig(config)) throw new Error("unsupported TLX preparation config");
    const cell = ChunkBins.cellSize(cellSize), srcIdx = data.idx, vCount = data.pos.length / 3;
    const big = vCount > 65535, IndexArray = big ? Uint32Array : Uint16Array, mergeK = config.merge;
    const pos = yield* f32Steps(data.pos);
    const attributes = { position: new PreparedAttribute(pos, 3) };
    for (const [name, key, size, kind] of [["normal", "nrm", 3, "unit"], ["color", "col", 3, "unorm"], ["mat", "mat", 1, "id"]]) {
      attributes[name] = yield* packAttrSteps(AttributeTypes, data[key], vCount * size, size, kind, config.fmt24, config);
    }
    if (srcIdx.length / 3 < 2000) {
      const idx = new IndexArray(srcIdx.length);
      for (let i = 0; i < idx.length; i++) { if ((i & 8191) === 0) yield; idx[i] = srcIdx[i]; }
      return { version: 1, config, attributes, idx, chunks: null, count: srcIdx.length, cellSize: cell };
    }
    // Only the synchronous cold/menu build may release its source at the
    // original low-peak points. Worker/cooperative preparation keeps immutable
    // raw inputs so a failed or superseded preparation can safely fall back.
    if (releaseSource && data._keepFullGeometry === false) data.nrm = data.col = data.mat = data.trk = null;
    // Float32 position conversion MUST precede bin centroids and bounds.
    const buckets = yield* ChunkBins.binSteps(pos, srcIdx, cell);
    if (releaseSource && !data._keepPositions) data.pos = data.idx = null;
    // DRAW MERGE. Every chunk is its own three RenderObject — a bind group
    // and per-object uniforms, which three's WebGPU path pays per draw
    // (three.js #30560) — and a record's chunks already share ONE vertex
    // buffer (aPos..aMat below), differing only in their index ranges. So a
    // merge factor k folds each k x k block of lamp cells into one DRAW chunk
    // whose index is the block's cells back to back: ~k² fewer render
    // objects in the scene pass and again in the sun pass, for a coarser
    // cull. The lamp table stays on the original cells (`lampCells`, same
    // gx/gz/min/max as before): the lamp grid is world-cell keyed, so
    // merging draws must not widen the 24-lamp cap's area.
    let lampCells = null;
    if (mergeK > 1) {
      lampCells = [];
      const merged = new Map();
      for (const [key, bk] of buckets) {
        yield;
        const gx = ChunkBins.gxOf(key), gz = ChunkBins.gzOf(key);
        lampCells.push({ min: bk.mn.slice(), max: bk.mx.slice(), gx, gz });
        const mk = ChunkBins.key(Math.floor(gx / mergeK), Math.floor(gz / mergeK));
        let m = merged.get(mk);
        if (!m) { m = { parts: [], n: 0, mn: [Infinity, Infinity, Infinity], mx: [-Infinity, -Infinity, -Infinity], gx, gz }; merged.set(mk, m); }
        m.parts.push(bk.idx); m.n += bk.idx.length;
        for (let a = 0; a < 3; a++) { if (bk.mn[a] < m.mn[a]) m.mn[a] = bk.mn[a]; if (bk.mx[a] > m.mx[a]) m.mx[a] = bk.mx[a]; }
      }
      buckets.clear();
      for (const [mk, m] of merged) {
        const idx = new IndexArray(m.n);
        let o = 0;
        for (const part of m.parts) for (let i = 0; i < part.length; i++) { if ((i & 8191) === 0) yield; idx[o++] = part[i]; }
        buckets.set(mk, { idx, mn: m.mn, mx: m.mx, gx: m.gx, gz: m.gz });
      }
    }
    // DUST MERGE (needs mergeK > 1, so tlxChunkMerge=1 is its off-switch too). Centroid binning leaves cells
    // holding a handful of triangles (a big ground triangle whose centroid lands in a street cell): monaco drew
    // 61 of 96 visible chunk draws at <= 33 triangles, each its own RenderObject (and again in the mirror and
    // sun passes). Dust draws of one 2x2-draw-cell block that fit together (triangle cap, extent cap) share one
    // chunk with the union AABB: same triangles, same lamp cells (those live on `lampCells`), fewer draws.
    if (mergeK > 1) {
      const DUST = 48 * 3, GROUP = 384 * 3, MAXEXT = cell * mergeK * 7;
      const groupOf = new Map(), blocks = new Map();
      const wide = [];   // dust whose own box already spans > MAXEXT (ground skirts): visible nearly everywhere, so locality buys nothing
      for (const [key, bk] of buckets) {
        yield;
        if (bk.idx.length > DUST) continue;
        let list, g;
        if (bk.mx[0] - bk.mn[0] > MAXEXT || bk.mx[2] - bk.mn[2] > MAXEXT) list = wide;
        else {
          const bkey = ChunkBins.key(Math.floor(bk.gx / 8), Math.floor(bk.gz / 8));
          list = blocks.get(bkey);
          if (!list) blocks.set(bkey, list = []);
        }
        g = list.length ? list[list.length - 1] : null;
        if (g && list !== wide) {
          const w0 = Math.max(g.mx[0], bk.mx[0]) - Math.min(g.mn[0], bk.mn[0]), w2 = Math.max(g.mx[2], bk.mx[2]) - Math.min(g.mn[2], bk.mn[2]);
          if (w0 > MAXEXT || w2 > MAXEXT) g = null;
        }
        if (!g || g.n + bk.idx.length > GROUP) {
          list.push(g = { parts: [], n: 0, mn: [Infinity, Infinity, Infinity], mx: [-Infinity, -Infinity, -Infinity], gx: bk.gx, gz: bk.gz, done: false });
        }
        g.parts.push(bk.idx); g.n += bk.idx.length;
        for (let a = 0; a < 3; a++) { if (bk.mn[a] < g.mn[a]) g.mn[a] = bk.mn[a]; if (bk.mx[a] > g.mx[a]) g.mx[a] = bk.mx[a]; }
        groupOf.set(key, g);
      }
      if (groupOf.size) {
        const ordered = new Map();
        for (const [key, bk] of buckets) {
        yield;
          const g = groupOf.get(key);
          if (!g) { ordered.set(key, bk); continue; }
          if (g.done) continue;   // emitted where its first member sat: draw order stays near emission order
          g.done = true;
          if (g.parts.length === 1) { ordered.set(key, bk); continue; }
          const idx = new IndexArray(g.n);
          let o = 0;
          for (const part of g.parts) for (let i = 0; i < part.length; i++) { if ((i & 8191) === 0) yield; idx[o++] = part[i]; }
          ordered.set(key, { idx, mn: g.mn, mx: g.mx, gx: g.gx, gz: g.gz });
        }
        buckets.clear();
        for (const [key, bk] of ordered) { buckets.set(key, bk); yield; }
      }
      // ORPHAN DUST. The block pack only joins dust that shares an 8-cell block
      // and a union box under MAXEXT. A ground triangle whose own box is already
      // most of that block (monaco props, headless build: 54 draws at <= 48
      // triangles whose box exceeds 576 m, 762 triangles between them) has no
      // neighbour there and cannot pair without crossing MAXEXT, so each stays
      // a RenderObject in the scene pass and again in the sun pass. The box is
      // already larger than the block, so culling it on its own rarely drops
      // it. Pack those leftovers into the same 384-triangle groups as the wide
      // list, with no spatial key. Tight dust (box <= one block) stays put, so
      // a small cluster still culls on its own. Lamp cells stay on `lampCells`.
      const SPAN = cell * 8;
      const orphans = [];
      for (const [key, bk] of buckets) {
        yield;
        if (bk.idx.length > DUST) continue;
        if (bk.mx[0] - bk.mn[0] <= SPAN && bk.mx[2] - bk.mn[2] <= SPAN) continue;
        orphans.push({ key, bk });
      }
      if (orphans.length > 1) {
        const groups = [];
        let g = null;
        for (let i = 0; i < orphans.length; i++) {
          if ((i & 255) === 0) yield;
          const o = orphans[i];
          if (!g || g.n + o.bk.idx.length > GROUP) {
            groups.push(g = { keys: [], parts: [], n: 0, mn: [Infinity, Infinity, Infinity], mx: [-Infinity, -Infinity, -Infinity], gx: o.bk.gx, gz: o.bk.gz, key: o.key });
          }
          g.keys.push(o.key); g.parts.push(o.bk.idx); g.n += o.bk.idx.length;
          for (let a = 0; a < 3; a++) { if (o.bk.mn[a] < g.mn[a]) g.mn[a] = o.bk.mn[a]; if (o.bk.mx[a] > g.mx[a]) g.mx[a] = o.bk.mx[a]; }
        }
        for (let gi = 0; gi < groups.length; gi++) {
          const pg = groups[gi];
          if (pg.parts.length < 2) continue;
          const idx = new IndexArray(pg.n);
          let w = 0;
          for (let p = 0; p < pg.parts.length; p++) { const part = pg.parts[p]; for (let i = 0; i < part.length; i++) { if ((i & 8191) === 0) yield; idx[w++] = part[i]; } }
          buckets.set(pg.key, { idx, mn: pg.mn, mx: pg.mx, gx: pg.gx, gz: pg.gz });
          for (let i = 1; i < pg.keys.length; i++) buckets.delete(pg.keys[i]);
        }
      }
    }
    const chunks = [];
    let count = 0;
    for (const [key, bk] of buckets) {
      let idx = bk.idx;
      if (!(idx instanceof IndexArray)) {
        idx = new IndexArray(bk.idx.length);
        for (let i = 0; i < idx.length; i++) { if ((i & 8191) === 0) yield; idx[i] = bk.idx[i]; }
      }
      count += idx.length;
      chunks.push({ idx, min: bk.mn, max: bk.mx, gx: bk.gx !== undefined ? bk.gx : ChunkBins.gxOf(key), gz: bk.gz !== undefined ? bk.gz : ChunkBins.gzOf(key) });
      yield;
    }
    return { version: 1, config, attributes, chunks, lampCells, cellSize: cell, count };
  }
  const packingCounters = ["small", "wide", "zero", "savedMB", "half", "pad4", "pad4MB"];
  function prepareChunks(data, cell, config, releaseSource) {
    const before = Object.fromEntries(packingCounters.map(k => [k, packStats[k]]));
    const wideBy = Object.assign({}, packStats.wideBy), wideLen = Object.assign({}, packStats.wideLen);
    const steps = prepareChunksSteps(data, cell, config, releaseSource);
    let next; do { next = steps.next(); } while (!next.done);
    const packing = Object.fromEntries(packingCounters.map(k => [k, packStats[k] - before[k]]));
    packing.wideBy = {}; packing.wideLen = {}; packing.wideMax = {};
    for (const k of Object.keys(packStats.wideBy)) if (packStats.wideBy[k] !== (wideBy[k] || 0)) {
      packing.wideBy[k] = packStats.wideBy[k] - (wideBy[k] || 0);
      packing.wideLen[k] = packStats.wideLen[k] - (wideLen[k] || 0);
      packing.wideMax[k] = packStats.wideMax[k];
    }
    next.value.packing = packing;
    return next.value;
  }

  function chunked(THREE, ctx) {

    const fmt24 = () => !!(ctx && ctx.isWebGPU && ctx.isWebGPU());
    const merge = chunkPrepareConfig(false).merge;
    const prepareConfig = () => Object.assign(chunkPrepareConfig(fmt24()), { merge });
    const releaseGeometry = (geo) => {
      if (geo && ctx && ctx.releaseGeometry) ctx.releaseGeometry(geo);
    };

    function build(data, cellSize) {
      const config = prepareConfig();
      const candidate = data._tlxPrepared;
      delete data._tlxPrepared;
      const prepared = candidate && candidate.version === 1 && samePrepareConfig(candidate.config, config) && candidate.cellSize === ChunkBins.cellSize(cellSize)
        ? candidate : prepareChunks(data, cellSize, config, true);
      // Preserve the page's packing diagnostics when the work ran elsewhere.
      if (prepared.workerPacking && prepared.packing) {
        const p = prepared.packing;
        for (const k of packingCounters) packStats[k] += p[k];
        for (const k of Object.keys(p.wideBy)) {
          packStats.wideBy[k] = (packStats.wideBy[k] || 0) + p.wideBy[k];
          packStats.wideLen[k] = (packStats.wideLen[k] || 0) + p.wideLen[k];
          if (!(packStats.wideMax[k] >= p.wideMax[k])) packStats.wideMax[k] = p.wideMax[k];
        }
        delete prepared.workerPacking;
      }
      const attributes = {};
      for (const [name, a] of Object.entries(prepared.attributes)) {
        attributes[name] = a.half ? new THREE.Float16BufferAttribute(a.array, a.itemSize)
          : new THREE.BufferAttribute(a.array, a.itemSize, a.normalized);
      }
      const made = [];
      const makeGeo = (idx, min, max) => {
        const geo = new THREE.BufferGeometry(); made.push(geo);
        for (const [name, attr] of Object.entries(attributes)) geo.setAttribute(name, attr);
        geo.setIndex(new THREE.BufferAttribute(idx, 1));
        // All prepared/synchronous small and chunked indices share this finalizer.
        if (geo.index.array instanceof Uint16Array) geo.index.__apexUint16Index = true;
        if (min) {
          geo.boundingBox = new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max));
          geo.boundingSphere = new THREE.Sphere(); geo.boundingBox.getBoundingSphere(geo.boundingSphere);
        }
        return geo;
      };
      try {
        if (!prepared.chunks) return { __tlx: true, chunked: true, geo: makeGeo(prepared.idx), chunks: null, count: prepared.count };
        const chunks = prepared.chunks.map(c => {
          const geo = makeGeo(c.idx, c.min, c.max);
          return { geo, count: c.idx.length, min: c.min, max: c.max, gx: c.gx, gz: c.gz, wrap: { __tlx: true, geo } };
        });
        if (data._keepFullGeometry === false) data.nrm = data.col = data.mat = data.trk = null;
        if (!data._keepPositions) data.pos = data.idx = null;
        return { __tlx: true, chunked: true, geo: chunks.length ? chunks[0].geo : null,
          chunks, lampCells: prepared.lampCells, cellSize: prepared.cellSize, count: prepared.count };
      } catch (err) {
        for (const geo of made) { releaseGeometry(geo); geo.dispose(); }
        throw err;
      }
    }

    // Per-frame culling. Fills _visList (module scratch — reused, never reallocated) with the
    // chunks whose AABB survives the frustum of the column-major `vp`, plus
    // the radial draw-distance cap when cullDist > 0: the frustum's far plane
    // is the only distance cull, so a pushed-out far plane (free camera) at a
    // high/wide vantage admits the whole ~5 M-vert city at once — a mobile-
    // tiler OOM. Fog hides the radial edge; `fog` (frame.cullFog) also drops
    // what the fog wall has hidden, height-aware (Frustum.radialCulled). Shadow
    // passes call with cullDist = 0 and no fog (an off-camera building can
    // still cast INTO view).
    // R13 (perf hunt 3): the list is a high-water scratch. `length = 0` per cull
    // dropped V8's backing store and the next 4-10 culls a frame regrew it; the
    // RETURNED n is the contract (every caller loops j < n), entries past it are
    // stale references to a live world's chunks, and free() still empties it.
    const _visList = [];
    const _ic = new Int32Array(1024);
    // One geometry per pass slot (0 main, 1 mirror) holding the visible chunks'
    // indices. The chunks already share vertex attributes, so concatenating
    // indices draws the same triangles. A repeated visible set returns the
    // cached geometry and does not touch the index buffer.
    function mergeVisible(mesh, n, slot) {
      const vis = _visList;
      if (!(n > 1) || !mesh || !mesh.chunks) return null;
      const slots = mesh._tlxMv || (mesh._tlxMv = []);
      const si = slot | 0;
      let s = slots[si];
      if (s && s.n === n) {
        let same = true;
        for (let i = 0; i < n; i++) if (s.ids[i] !== vis[i]) { same = false; break; }
        if (same) return s.geo;
      }
      let cnt = 0, Ctor = null;
      const ic = n <= _ic.length ? _ic : new Int32Array(n);
      for (let i = 0; i < n; i++) {
        const ix = vis[i] && vis[i].geo && vis[i].geo.index, a = ix && ix.array;
        if (!a) return null;
        const c = ix.count != null ? ix.count : (a.length / (ix.itemSize || 1));
        ic[i] = c; cnt += c;
        if (!Ctor || a.BYTES_PER_ELEMENT > Ctor.BYTES_PER_ELEMENT) Ctor = a.constructor;
      }
      if (!s) s = slots[si] = { n: 0, ids: [], geo: null, arr: null, res: [], rc: [], rn: 0, rb: 0, r2: [], c2: [] };
      const g = s.geo || (s.geo = new THREE.BufferGeometry());
      if (!g.boundingSphere) {
        g.boundingSphere = new THREE.Sphere();
        const src = vis[0].geo;
        for (const k in src.attributes) g.setAttribute(k, src.attributes[k]);
      }
      let tot = mesh._tlxIdxTotal;
      if (!(tot > 0)) {
        tot = 0;
        for (let k = 0; k < mesh.chunks.length; k++) {
          const ch = mesh.chunks[k], ix = ch.geo && ch.geo.index;
          ch._tlxCi = k;   // record order, which cull lists in: the run search below is one merge walk
          if (ix) tot += ix.count;
        }
        mesh._tlxIdxTotal = tot;
      }
      // GPU hunt 3 (#4272 item 3; census 41030658536: 200-920 KB index rewrites when the FIRST visible chunk
      // changed): a sliding window. The chunks the buffer holds (s.res from offset s.rb, drawn or not) keep their
      // offsets; the new set keeps its longest run shared with them in place and writes only the chunks before and
      // after it, so a head chunk leaving uploads nothing and one entering uploads itself. The GPU draws the same
      // indices in the same order from a moved drawRange.start. A fresh array, or a set that does not fit around
      // its run, rewrites from scratch, centred.
      let fresh = !s.arr || s.arr.length < cnt || s.arr.constructor !== Ctor, made = null;
      if (fresh) {
        // 1.5x headroom (capped at the record's whole index count): the window's slack, and a widening view
        // replaces the buffer O(log) times, not on every new high.
        const grow = s.arr && s.arr.constructor === Ctor ? s.arr.length : 0;
        const cap = Math.max(cnt, Math.min(tot, Math.ceil(Math.max(cnt, grow) * 1.5)));
        const old = g.index;
        s.arr = new Ctor(cap);
        const ia = made = new THREE.BufferAttribute(s.arr, 1);
        // The vendor's narrow-index opt-in (PATCHES §20), as packIndex marks every
        // chunk's own index: unmarked, three's WebGPU backend swaps ia.array for a
        // Uint32 copy at creation, every later write below lands in the orphaned
        // s.arr, and each changed visible set re-uploads the FIRST set's indices.
        if (s.arr instanceof Uint16Array) ia.__apexUint16Index = true;
        g.setIndex(ia);
        // The replaced index's GPU buffer, now held by nothing but the GC.
        if (old && ctx && ctx.releaseAttribute) ctx.releaseAttribute(old);
      }
      const dst = s.arr, res = s.res, rc = s.rc;
      let bi = 0, bj = 0, bl = 0, bc = 0, P = 0;   // longest shared run: res[bi..], vis[bj..], bl chunks, bc indices at P
      for (let i = 0, j = 0, o = s.rb, ri = 0, rj = 0, rl = 0, rn = 0, rp = 0; !fresh && i < s.rn && j < n;) {
        const a = res[i], b = vis[j];
        if (a === b && rc[i] === ic[j]) {
          if (rl > 0 && ri + rl === i && rj + rl === j) { rl++; rn += ic[j]; } else { ri = i; rj = j; rl = 1; rn = ic[j]; rp = o; }
          if (rn > bc) { bc = rn; bi = ri; bj = rj; bl = rl; P = rp; }
          o += rc[i]; i++; j++;
        } else if (a._tlxCi < b._tlxCi) { o += rc[i]; i++; } else j++;
      }
      let pre = 0;
      for (let i = 0; i < bj; i++) pre += ic[i];
      let start = P - pre;
      if (!(bl > 0 && start >= 0 && start + cnt <= dst.length)) {
        // A set drifting off one end restarts at the other, so a steady drive along the arc (record order) spends
        // the whole slack before the next rewrite. Even: a Uint16 range starts 4-byte aligned.
        start = P = (bl > 0 ? (start < 0 ? dst.length - cnt : 0) : (dst.length - cnt) >> 1) & ~1;
        fresh = true; bi = bj = bl = bc = pre = 0;
      }
      const end = start + cnt, post = end - (P + bc);
      let o = start, x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
      for (let i = 0; i < n; i++) {
        const ch = vis[i], a = ch.geo.index.array, c = ic[i];
        if (i < bj || i >= bj + bl) {
          if (a.constructor === Ctor) dst.set(c === a.length ? a : a.subarray(0, c), o);
          else for (let k = 0; k < c; k++) dst[o + k] = a[k];
        }
        o += c; s.ids[i] = ch;
        const mn = ch.min, mx = ch.max;
        if (!mn || !mx) continue;
        if (mn[0] < x0) x0 = mn[0]; if (mn[1] < y0) y0 = mn[1]; if (mn[2] < z0) z0 = mn[2];
        if (mx[0] > x1) x1 = mx[0]; if (mx[1] > y1) y1 = mx[1]; if (mx[2] > z1) z1 = mx[2];
      }
      // What the buffer now holds: the new set, plus the old chunks on a side it did not write (still intact).
      const r2 = s.r2, c2 = s.c2;
      let m = 0, rb = start;
      if (bl > 0 && pre === 0) { rb = s.rb; for (let i = 0; i < bi; i++) { r2[m] = res[i]; c2[m++] = rc[i]; } }
      for (let i = 0; i < n; i++) { r2[m] = vis[i]; c2[m++] = ic[i]; }
      if (bl > 0 && post === 0) for (let i = bi + bl; i < s.rn; i++) { r2[m] = res[i]; c2[m++] = rc[i]; }
      s.res = r2; s.rc = c2; s.r2 = res; s.c2 = rc; s.rn = m; s.rb = rb; s.n = n;
      g.setDrawRange(start, cnt);
      // three r186 uploads each queued range with its own writeBuffer / bufferSubData, in list order, then clears
      // the list (both backends): a range still queued never reached the GPU (the pass did not draw), so it stays.
      // A new attribute queues none: three's create uploads the whole array and leaves the ranges for the NEXT
      // update to re-send.
      const attr = g.index, ur = attr.updateRanges || (attr.updateRanges = []);
      if (attr !== made && (pre > 0 || fresh)) ur.push({ start, count: fresh ? cnt : pre });
      if (post > 0 && !fresh) ur.push({ start: end - post, count: post });
      if (ur.length > 4) {   // many owed ranges: one span covers them
        let a = Infinity, b = 0;
        for (const r of ur) { if (r.start < a) a = r.start; if (r.start + r.count > b) b = r.start + r.count; }
        ur.length = 0; ur.push({ start: a, count: b - a });
      }
      if (ur.length) attr.needsUpdate = true;   // a set inside what the buffer holds moves the draw range alone
      const bs = g.boundingSphere, cx = (x0 + x1) * 0.5, cy = (y0 + y1) * 0.5, cz = (z0 + z1) * 0.5;
      const ct = bs.center || (bs.center = new THREE.Vector3());
      ct.x = cx; ct.y = cy; ct.z = cz;
      bs.radius = Math.hypot(x1 - cx, y1 - cy, z1 - cz) || 0;
      return g;
    }
    function cull(mesh, vp, eye, cullDist, fog) {
      const chunks = mesh && mesh.chunks;
      if (!chunks || !vp) return 0;
      Frustum.extractPlanes(vp, _fcPlanes);
      const cd = cullDist > 0 ? cullDist : 0, cf = fog || null,
            ex = eye ? eye[0] : 0, ey = eye ? eye[1] : 0, ez = eye ? eye[2] : 0;
      let n = 0;
      for (let i = 0; i < chunks.length; i++) {
        const ch = chunks[i];
        if (!Frustum.aabbInFrustum(_fcPlanes, ch.min, ch.max)) continue;
        if (Frustum.radialCulled(ch.min, ch.max, ex, ey, ez, cd, cf)) continue;
        _visList[n++] = ch;
      }
      return n;
    }

    /** Drop the CPU mirrors of the SHARED vertex attributes (see header —
     * only after the renderer has provably created their GPU buffers: a lit
     * present() that drew >= 1 chunk consumed all four attributes). Bounding
     * volumes were precomputed at build, so nothing in the DRAW path walks the
     * arrays later. Idempotent; index mirrors are deliberately kept.
     *
     * A ZERO-LENGTH VIEW, NOT null. Every three site that touches .array after
     * upload wants a PROPERTY OF THE TYPE, never the data, and each one is a
     * null dereference away from taking the renderer down (all four verified
     * against vendor/three-0.187.0/three.webgpu.min.js):
     *
     *   node builder      attribute.array.constructor, on every pass it has not
     *                     compiled before — the env probe threw on 41 WebGL2 /
     *                     81 WebGPU faces on macos-latest/Metal, 2026-08-29
     *   draw()            firstVertex *= index.array.BYTES_PER_ELEMENT
     *   updateAttribute() bufferSubData(target, 0, attribute.array)
     *   _getAttributeMemorySize  array.byteLength (info.memory only)
     *
     * `new arr.constructor(0)` answers all of them — same constructor, same
     * BYTES_PER_ELEMENT, still an ArrayBufferView — while dropping the backing
     * store, which is the whole point. It costs one empty view per attribute.
     * `null` answered none of them, which is why this release had to be held
     * behind the env probe and why the INDEX mirrors could not be freed at all.
     * Both of those constraints are gone: BYTES_PER_ELEMENT reads correctly off
     * an empty Uint16Array/Uint32Array, and b.index takes geometry.index.count,
     * a stored number, not the array.
     *
     * Still true, and still the reason this is safe at all: bounding volumes
     * are precomputed at build, so no DRAW path walks the arrays. Wireframe
     * materials DO (three builds the line index from index.array) — chunks
     * never use one. */
    function releaseMirrors(mesh) {
      if (!mesh || !mesh.chunks || !mesh.chunks.length || mesh._mirrorsFreed) return;
      mesh._mirrorsFreed = true;
      // NULL, matching what shipped. Read the r185 SOURCE (not the minified
      // bundle) before touching this: src/renderers/webgpu/utils/
      // WebGPUAttributeUtils.js and its webgl-fallback sibling.
      //
      // createAttribute() sizes the GPU buffer as `array.byteLength` and
      // uploads with `new array.constructor(buffer.getMappedRange()).set(array)`.
      // There is NO fallback for a missing array. So neither form is "safe":
      //   null           -> throws on array.constructor / instanceof checks
      //   zero-length    -> a ZERO-BYTE buffer, silently
      // The only thing that makes releasing safe at all is that createAttribute
      // early-outs once bufferData.buffer exists — i.e. AFTER the attribute has
      // been uploaded once.
      //
      // WHICH IS THE TRAP FOR CHUNKED MESHES. Chunks are frustum-culled, so a
      // chunk that has never been visible has never been uploaded. This frees
      // the SHARED attribute set for every chunk at once. Drive on, a new chunk
      // enters the frustum, and its first upload happens after the release:
      // zero-byte buffer with a zero-length array, a throw with null. That is
      // "Index range ... does not fit in index buffer size (0)" from
      // gpu-census run 26 on Metal, and it is why a fixed-camera probe cannot
      // reproduce it — no new chunk ever enters view.
      //
      // Also note WebGLAttributeUtils has `//attribute.onUploadCallback();`
      // COMMENTED OUT, confirming PERF-FINDINGS 2m: onUpload is not a hook here.
      //
      // Releasing chunk mirrors is therefore only sound if EVERY chunk has been
      // uploaded first. Nothing establishes that today.
      const atts = mesh.chunks[0].geo.attributes;
      for (const k in atts) if (atts[k]) atts[k].array = null;
      // The per-chunk INDEX arrays stay. three's WebGPU backend sizes the index
      // buffer from the array's byte length, so freeing them yields a ZERO-BYTE
      // index buffer: "Index range ... does not fit in index buffer size (0)",
      // 8 uncaptured GPU errors on real Metal hardware (gpu-census run 26)
      // while the WebGL2 control leg was clean. tlx.js releaseGeoMirrors()
      // carries the same rule and the same reason.
    }

    function free(mesh, freedGeos) {
      if (!mesh) return;
      const mark = (g) => { if (g && freedGeos) freedGeos.add(g); };
      const dropGeo = (g, stripMergeAttrs) => {
        if (!g) return;
        mark(g);
        releaseGeometry(g);
        if (freedGeos) return;
        if (stripMergeAttrs) {
          const names = Object.keys(g.attributes);
          for (let k = 0; k < names.length; k++) delete g.attributes[names[k]];
        }
        try { g.dispose(); } catch (_) { /* already gone */ }
      };
      const mv = mesh._tlxMv;
      if (mv) {
        mesh._tlxMv = null;
        for (let i = 0; i < mv.length; i++) {
          const g = mv[i] && mv[i].geo;
          if (!g) continue;
          // The merged draw's wrapper is keyed on THIS geometry, not a chunk.
          // three r186 drops a RenderObject only when the object or the material
          // dispatches "dispose" (a geometry dispose only clears vertex state),
          // so geometry.dispose() alone left the wrapper in the pool and the
          // previous circuit's merge slot in renderer._objects on the next race.
          dropGeo(g, true);
          mv[i].geo = null;
        }
      }
      _visList.length = 0;   // the last cull's list may be this mesh's chunks: a dropped world must not sit in module scratch
      if (mesh.chunks) {
        for (let i = 0; i < mesh.chunks.length; i++) {
          const ch = mesh.chunks[i];
          if (ch.geo) { dropGeo(ch.geo, false); ch.geo = null; }
          if (ch.wrap) ch.wrap.geo = null;
        }
        mesh.chunks = null;
        mesh.geo = null;
        return;
      }
      if (mesh.geo) { dropGeo(mesh.geo, false); mesh.geo = null; }
    }

    try { Log.info("gfx", "TLX chunked init"); } catch (_) { /* harness */ }
    return { build, prepareConfig, cull, visList: _visList, releaseMirrors, free, mergeVisible };
  }

  // THE ROAD SPLIT (B·H10, docs/notes/LIVE-FRAME-H10-2026-10-20.md). TLX draws the road as ONE mesh
  // (chunkedTrackCoords:false: the chunked material has no `trk`/markings), so its whole lap, ~51k tris
  // on monza, went into every pass, the phone mirror included, where it was 3/4 of the triangles. The
  // ribbon's index runs along the lap, so contiguous index ranges are contiguous stretches of road:
  // splitRanges gives each one an AABB for cull(), and mergeRuns folds the visible ones into at most
  // maxRuns contiguous [start, count] draw ranges. A merged gap only draws real road triangles that are
  // off-screen, so the picture is unchanged. Pure; tests/unit/tlx-chunked-lifecycle.test.mjs.
  function splitRanges(pos, idx, triPer) {
    const out = [], per = Math.max(3, (triPer | 0) * 3);
    for (let s = 0; s < idx.length; s += per) {
      const e = Math.min(idx.length, s + per);
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (let k = s; k < e; k++) {
        const v = idx[k] * 3;
        for (let a = 0; a < 3; a++) { const p = pos[v + a]; if (p < min[a]) min[a] = p; if (p > max[a]) max[a] = p; }
      }
      out.push({ min, max, start: s, count: e - s });
    }
    return out;
  }
  // vis[0..n): chunks from cull(), each {start, count}. Writes runs as flat [start, count, ...] into
  // `runs`; returns the run count. Sorts vis in place (n is tens).
  function mergeRuns(vis, n, maxRuns, runs) {
    for (let i = 1; i < n; i++) { const c = vis[i]; let j = i - 1; while (j >= 0 && vis[j].start > c.start) { vis[j + 1] = vis[j]; j--; } vis[j + 1] = c; }
    let r = 0;
    for (let i = 0; i < n; i++) {
      const c = vis[i];
      if (r && runs[2 * r - 2] + runs[2 * r - 1] === c.start) runs[2 * r - 1] += c.count;
      else { runs[2 * r] = c.start; runs[2 * r + 1] = c.count; r++; }
    }
    while (r > maxRuns) {   // close the smallest gap
      let best = 1, gap = Infinity;
      for (let i = 1; i < r; i++) { const g = runs[2 * i] - (runs[2 * i - 2] + runs[2 * i - 1]); if (g < gap) { gap = g; best = i; } }
      runs[2 * best - 1] = runs[2 * best] + runs[2 * best + 1] - runs[2 * best - 2];
      for (let i = best; i < r - 1; i++) { runs[2 * i] = runs[2 * i + 2]; runs[2 * i + 1] = runs[2 * i + 3]; }
      r--;
    }
    return r;
  }

  // Idle yield for menu-path warm stages (#3279): requestIdleCallback when the
  // browser has it, else a 0-ms timer. Kept here (not in tlx.js) so the warm
  // region stays lean and unit tests can call the same helper.
  function idleYield(timeoutMs) {
    const ms = timeoutMs == null ? 48 : timeoutMs;
    return new Promise((resolve) => {
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(() => resolve(), { timeout: ms });
      } else {
        setTimeout(resolve, 0);
      }
    });
  }

  // The cull helpers ride alongside the factory, NOT on its instance: tlx.js
  // must be able to re-export them in GLX's shape even when the factory itself
  // failed and chunkedSys is null. See the note at their definition.
  window.TLXShaders = Object.assign(window.TLXShaders || {},
    { chunked, idleYield, chunkPrepareConfig, validPrepareConfig, samePrepareConfig, prepareChunks, prepareChunksSteps,
      makeFrustumPlanes: Frustum.makeFrustumPlanes,
      aabbInFrustum: Frustum.aabbInFrustum, aabbDist2: Frustum.aabbDist2,
      packAttr, packIndex, packStats, splitRanges, mergeRuns });
})();
