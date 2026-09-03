/* Apex 26 — TLXShaders.chunked: the chunked-mesh subsystem for the TLX backend (M7). The three.js sibling of js/render/glx/chunked.js: the heavy city/props geomet… */
"use strict";

(function () {

  // ── Gribb–Hartmann plane extraction from a COLUMN-MAJOR view-proj
  // (m[col*4+row]) — js/render/glx/chunked.js verbatim. Planes are [a,b,c,d],
  // inside = a*x+b*y+c*z+d >= 0. Scratch is module-static so culling
  // allocates nothing per frame.
  //
  // AT MODULE SCOPE, not inside chunked(), for two reasons. They depend on
  // neither THREE nor ctx — they are pure math on a matrix. And the agent world
  // view needs the same test whether or not the chunked subsystem came up:
  // tlx.js builds `chunkedSys` inside a try/catch that legitimately leaves it
  // null (missing factory keeps the un-culled single-geometry fallback), and
  // "is this prop on screen" must not stop answering because prop CULLING is
  // switched off. Exported below so tlx.js re-exports them in GLX's shape.
  const _fcPlanes = [new Float32Array(4), new Float32Array(4), new Float32Array(4),
                     new Float32Array(4), new Float32Array(4), new Float32Array(4)];
  function _setPlane(p, a, b, c, d) {
    const inv = 1 / (Math.hypot(a, b, c) || 1);
    p[0] = a * inv; p[1] = b * inv; p[2] = c * inv; p[3] = d * inv;
  }
  function _extractPlanes(m, planes) {
    const m0=m[0],m4=m[4],m8=m[8],m12=m[12], m1=m[1],m5=m[5],m9=m[9],m13=m[13],
          m2=m[2],m6=m[6],m10=m[10],m14=m[14], m3=m[3],m7=m[7],m11=m[11],m15=m[15];
    _setPlane(planes[0], m3+m0, m7+m4, m11+m8,  m15+m12); // left
    _setPlane(planes[1], m3-m0, m7-m4, m11-m8,  m15-m12); // right
    _setPlane(planes[2], m3+m1, m7+m5, m11+m9,  m15+m13); // bottom
    _setPlane(planes[3], m3-m1, m7-m5, m11-m9,  m15-m13); // top
    _setPlane(planes[4], m3+m2, m7+m6, m11+m10, m15+m14); // near
    _setPlane(planes[5], m3-m2, m7-m6, m11-m10, m15-m14); // far
  }
  // AABB vs frustum via the box's most-positive vertex per plane (conservative).
  function _aabbInFrustum(planes, mn, mx) {
    for (let i = 0; i < 6; i++) {
      const p = planes[i];
      const px = p[0] >= 0 ? mx[0] : mn[0];
      const py = p[1] >= 0 ? mx[1] : mn[1];
      const pz = p[2] >= 0 ? mx[2] : mn[2];
      if (p[0]*px + p[1]*py + p[2]*pz + p[3] < 0) return false;
    }
    return true;
  }
  // Squared distance from point (ex,ey,ez) to the nearest point on an AABB.
  function _aabbDist2(mn, mx, ex, ey, ez) {
    const dx = ex < mn[0] ? mn[0] - ex : ex > mx[0] ? ex - mx[0] : 0;
    const dy = ey < mn[1] ? mn[1] - ey : ey > mx[1] ? ey - mx[1] : 0;
    const dz = ez < mn[2] ? mn[2] - ez : ez > mx[2] ? ez - mx[2] : 0;
    return dx * dx + dy * dy + dz * dz;
  }

  // GLX's shape: SIX planes per call. Pass `out` (6×Float32Array(4)) to reuse a
  // caller pool — the race prop-batch path must not allocate every frame.
  // Without `out`, allocate fresh so a held agentview result cannot be rewritten.
  function makeFrustumPlanes(viewProj, out) {
    const p = out || [new Float32Array(4), new Float32Array(4), new Float32Array(4),
                      new Float32Array(4), new Float32Array(4), new Float32Array(4)];
    _extractPlanes(viewProj, p);
    return p;
  }

  // ── vertex-attribute packing ─────────────────────────────────────────
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
    half: 0, wideBy: {}, wideMax: {}, wideLen: {} };
  // One shared all-zero buffer behind every absent attribute. Views into it
  // carry the right per-mesh count while costing one allocation in total —
  // absent `trk` alone measured 5.88 MB of zeros across 153 meshes. SAFE only
  // because nothing ever writes these: they are absent-source placeholders on
  // static geometry, and three re-reads an array only on a version bump that
  // never comes. Never hand this to an attribute a caller may mutate.
  // float32 -> float16 bits. three exports Float16BufferAttribute but no
  // converter, so this is ours: truncating mantissa (fine for colour), with
  // the subnormal and overflow cases handled rather than wrapped.
  const _fb = new Float32Array(1), _ib = new Uint32Array(_fb.buffer);
  function _toHalf(v) {
    _fb[0] = v;
    const x = _ib[0], sign = (x >>> 16) & 0x8000;
    const exp = (x >>> 23) & 0xff;
    let man = x & 0x7fffff;
    if (exp === 255) return sign | 0x7c00 | (man ? 0x200 : 0);   // Inf / NaN
    const e = exp - 112;                                          // 127 - 15
    if (e >= 31) return sign | 0x7c00;                            // overflows half
    if (e <= 0) {                                                 // subnormal / zero
      if (e < -10) return sign;
      man = (man | 0x800000) >>> (1 - e);
      return sign | (man >>> 13);
    }
    return sign | (e << 10) | (man >>> 13);
  }
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
  function packAttr(THREE, src, len, itemSize, kind, fmt24) {
    const ok = src && src.length === len;
    if (fmt24 && itemSize !== 2 && itemSize !== 4) kind = null;
    if (!packOn) {
      return new THREE.BufferAttribute(
        ok ? (src instanceof Float32Array ? src : new Float32Array(src)) : new Float32Array(len),
        itemSize);
    }
    if (!ok) {
      packStats.zero++;
      packStats.savedMB += (len * 4) / 1048576;      // the copy we did NOT make
      return new THREE.BufferAttribute(_zeros(len), itemSize);
    }
    let fits = kind !== null && kind !== undefined, finite = true;
    if (fits) {
      for (let i = 0; i < len; i++) {
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
      for (let i = 0; i < len; i++) { const v = src[i]; if (!(mx >= v)) mx = v; }
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
        for (let i = 0; i < len; i++) h[i] = _toHalf(src[i]);
        packStats.savedMB += (len * 2) / 1048576;
        // Constructor, NOT a post-hoc `.array =`: BufferAttribute derives
        // `count` from the array it is GIVEN, so assigning afterwards leaves
        // count 0 and the mesh draws nothing.
        return new THREE.Float16BufferAttribute(h, itemSize);
      }
      packStats.wide++;
      const f = src instanceof Float32Array ? src : new Float32Array(src);
      return new THREE.BufferAttribute(f, itemSize);
    }
    packStats.small++;
    if (kind === "unit") {
      const a = new Int16Array(len);
      for (let i = 0; i < len; i++) a[i] = Math.round(src[i] * 32767);
      packStats.savedMB += (len * 2) / 1048576;
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
      for (let i = 0; i < len; i++) h[i] = _toHalf(src[i]);
      packStats.savedMB += (len * 2) / 1048576;
      return new THREE.Float16BufferAttribute(h, itemSize);
    }
    const a = new Uint8Array(len);
    for (let i = 0; i < len; i++) a[i] = Math.round(src[i] * 255);
    packStats.savedMB += (len * 3) / 1048576;
    return new THREE.BufferAttribute(a, itemSize, true);              // unorm: normalized = a float input
  }
  // Uint16 indices wherever the vertex count allows — three picks the GL type
  // from the array, so this is a straight halving with no shader involvement.
  function packIndex(THREE, idx, vCount) {
    return new THREE.BufferAttribute(
      (!packOn || vCount > 65535) ? new Uint32Array(idx) : new Uint16Array(idx), 1);
  }

  function chunked(THREE, ctx) {

    const toF32 = (a) => (a instanceof Float32Array ? a : new Float32Array(a));
    // Read per build, not once: the renderer's backend is known only after
    // its async init, and a build can precede it on a slow boot.
    const fmt24 = () => !!(ctx && ctx.isWebGPU && ctx.isWebGPU());

    function attrOrZero(src, len, itemSize, kind) {
      return packAttr(THREE, src, len, itemSize, kind, fmt24());
    }

    /** Build a chunked mesh: one shared attribute set + one index buffer per
     * spatial XZ cell (cellSize metres), each with an AABB over the verts it
     * references. Index type is Uint32 whenever total verts > 65535 (chunk
     * indices reference the full shared vertex array). The returned handle
     * also works as a plain mesh (top-level geo = chunk 0) so a stray
     * draw()/castShadow() won't crash — js/render/glx/chunked.js semantics. */
    function build(data, cellSize) {
      const cell = cellSize > 0 ? cellSize : 72;
      const srcIdx = data.idx;
      const vCount = data.pos.length / 3, big = vCount > 65535;
      const triCount = (srcIdx.length / 3) | 0;
      if (triCount < 2000) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(toF32(data.pos), 3));
        geo.setAttribute("normal", attrOrZero(data.nrm, vCount * 3, 3, "unit"));
        geo.setAttribute("color", attrOrZero(data.col, vCount * 3, 3, "unorm"));
        geo.setAttribute("mat", attrOrZero(data.mat, vCount, 1, "id"));
        geo.setIndex(new THREE.BufferAttribute(
          big ? new Uint32Array(srcIdx) : new Uint16Array(srcIdx), 1));
        return { __tlx: true, chunked: true, geo, chunks: null, count: srcIdx.length };
      }
      let pos = toF32(data.pos);
      const aPos = new THREE.BufferAttribute(pos, 3);
      const aNrm = attrOrZero(data.nrm, vCount * 3, 3, "unit");
      const aCol = attrOrZero(data.col, vCount * 3, 3, "unorm");
      const aMat = attrOrZero(data.mat, vCount, 1, "id");
      // NO `trk` attribute here, deliberately. Only the ROAD carries track
      // coords, and the chunked path is the city props/glass — millions of
      // vertices, the one buffer this whole subsystem exists to keep small.
      // tsl-lit's `chunked` material variant therefore compiles without the
      // attribute read and without roadMarkings(); see its buildFragment note.
      // Chunked meshes must only ever be drawn through drawChunked /
      // castShadowChunked, which is what binds that variant.
      // Attributes built: normals/colours/materials are baked into the typed
      // attribute arrays and never read again. Drop the source refs so ~half
      // the raw JS arrays can be GC'd before the bucket index arrays are built
      // — lowers the transient peak on ~5 M-vert street props. `pos` is still
      // needed below for triangle centroids/AABBs, so it's nulled after the
      // bins (js/render/glx/chunked.js verbatim).
      if (data._keepFullGeometry === false) {
        data.nrm = data.col = data.mat = data.trk = null;
      }
      const buckets = new Map();
      for (let t = 0; t < srcIdx.length; t += 3) {
        const a = srcIdx[t], b = srcIdx[t+1], c = srcIdx[t+2];
        const ax=pos[a*3],ay=pos[a*3+1],az=pos[a*3+2], bx=pos[b*3],by=pos[b*3+1],bz=pos[b*3+2],
              cx=pos[c*3],cy=pos[c*3+1],cz=pos[c*3+2];
        const gx = Math.floor(((ax+bx+cx)/3)/cell) + 1024;
        const gz = Math.floor(((az+bz+cz)/3)/cell) + 1024;
        const key = gx * 4096 + gz;
        let bk = buckets.get(key);
        if (!bk) { bk = { idx: [], mn: [Infinity,Infinity,Infinity], mx: [-Infinity,-Infinity,-Infinity] }; buckets.set(key, bk); }
        bk.idx.push(a, b, c);
        const mn = bk.mn, mx = bk.mx;
        if (ax<mn[0])mn[0]=ax; if (ax>mx[0])mx[0]=ax; if (ay<mn[1])mn[1]=ay; if (ay>mx[1])mx[1]=ay; if (az<mn[2])mn[2]=az; if (az>mx[2])mx[2]=az;
        if (bx<mn[0])mn[0]=bx; if (bx>mx[0])mx[0]=bx; if (by<mn[1])mn[1]=by; if (by>mx[1])mx[1]=by; if (bz<mn[2])mn[2]=bz; if (bz>mx[2])mx[2]=bz;
        if (cx<mn[0])mn[0]=cx; if (cx>mx[0])mx[0]=cx; if (cy<mn[1])mn[1]=cy; if (cy>mx[1])mx[1]=cy; if (cz<mn[2])mn[2]=cz; if (cz>mx[2])mx[2]=cz;
      }
      pos = null;
      if (!data._keepPositions) { data.pos = null; data.idx = null; }
      const IndexArray = big ? Uint32Array : Uint16Array;
      const chunks = [];
      let count = 0;
      buckets.forEach((bk) => {
        const arr = new IndexArray(bk.idx);
        bk.idx = null;   // typed copy made — drop the growable JS array now so
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", aPos);
        geo.setAttribute("normal", aNrm);
        geo.setAttribute("color", aCol);
        geo.setAttribute("mat", aMat);
        geo.setIndex(new THREE.BufferAttribute(arr, 1));
        // Boundings from the bin AABB: three must never compute them itself —
        // that walks the FULL shared position array once per chunk.
        const mn = bk.mn, mx = bk.mx;
        geo.boundingBox = new THREE.Box3(
          new THREE.Vector3(mn[0], mn[1], mn[2]),
          new THREE.Vector3(mx[0], mx[1], mx[2]));
        geo.boundingSphere = new THREE.Sphere();
        geo.boundingBox.getBoundingSphere(geo.boundingSphere);
        count += arr.length;
        chunks.push({ geo, count: arr.length, min: mn, max: mx, wrap: { __tlx: true, geo } });
      });
      return { __tlx: true, chunked: true, geo: chunks.length ? chunks[0].geo : null,
               chunks, cellSize: cell, count };
    }

    // ── per-frame culling ────────────────────────────────────────────────
    // Fills _visList (module scratch — reused, never reallocated) with the
    // chunks whose AABB survives the frustum of the column-major `vp`, plus
    // the radial draw-distance cap when cullDist > 0: the frustum's far plane
    // is the only distance cull, so a pushed-out far plane (free camera) at a
    // high/wide vantage admits the whole ~5 M-vert city at once — a mobile-
    // tiler OOM. Fog hides the radial edge. Shadow passes call with
    // cullDist = 0 (an off-camera building can still cast INTO view).
    const _visList = [];
    function cull(mesh, vp, eye, cullDist) {
      _visList.length = 0;
      const chunks = mesh && mesh.chunks;
      if (!chunks || !vp) return 0;
      _extractPlanes(vp, _fcPlanes);
      const cd = cullDist > 0 ? cullDist : 0, cd2 = cd * cd,
            ex = eye ? eye[0] : 0, ey = eye ? eye[1] : 0, ez = eye ? eye[2] : 0;
      let n = 0;
      for (let i = 0; i < chunks.length; i++) {
        const ch = chunks[i];
        if (!_aabbInFrustum(_fcPlanes, ch.min, ch.max)) continue;
        if (cd > 0 && _aabbDist2(ch.min, ch.max, ex, ey, ez) > cd2) continue;
        _visList[n++] = ch;
      }
      _visList.length = n;
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
     * against spike/backends/vendor/three-0.185.1/three.webgpu.min.js):
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

    function free(mesh) {
      if (!mesh) return;
      if (mesh.chunks) {
        for (let i = 0; i < mesh.chunks.length; i++) {
          const ch = mesh.chunks[i];
          if (ch.geo) { ch.geo.dispose(); ch.geo = null; }
          if (ch.wrap) ch.wrap.geo = null;
        }
        mesh.chunks = null;
        mesh.geo = null;
        return;
      }
      if (mesh.geo) { mesh.geo.dispose(); mesh.geo = null; }
    }

    try { Log.info("gfx", "TLX chunked init"); } catch (_) { /* harness */ }
    return { build, cull, visList: _visList, releaseMirrors, free };
  }

  // The cull helpers ride alongside the factory, NOT on its instance: tlx.js
  // must be able to re-export them in GLX's shape even when the factory itself
  // failed and chunkedSys is null. See the note at their definition.
  window.TLXShaders = Object.assign(window.TLXShaders || {},
    { chunked, makeFrustumPlanes, aabbInFrustum: _aabbInFrustum, aabbDist2: _aabbDist2,
      packAttr, packIndex, packStats });
})();
