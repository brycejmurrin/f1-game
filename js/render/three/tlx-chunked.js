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

  function chunked(THREE /*, ctx */) {

    const toF32 = (a) => (a instanceof Float32Array ? a : new Float32Array(a));

    function attrOrZero(src, len, itemSize) {
      return new THREE.BufferAttribute(
        src && src.length === len ? toF32(src) : new Float32Array(len), itemSize);
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
        geo.setAttribute("normal", attrOrZero(data.nrm, vCount * 3, 3));
        geo.setAttribute("color", attrOrZero(data.col, vCount * 3, 3));
        geo.setAttribute("mat", attrOrZero(data.mat, vCount, 1));
        geo.setIndex(new THREE.BufferAttribute(
          big ? new Uint32Array(srcIdx) : new Uint16Array(srcIdx), 1));
        return { __tlx: true, chunked: true, geo, chunks: null, count: srcIdx.length };
      }
      let pos = toF32(data.pos);
      const aPos = new THREE.BufferAttribute(pos, 3);
      const aNrm = attrOrZero(data.nrm, vCount * 3, 3);
      const aCol = attrOrZero(data.col, vCount * 3, 3);
      const aMat = attrOrZero(data.mat, vCount, 1);
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
     * volumes were precomputed at build, so nothing walks the arrays later.
     * Idempotent; index mirrors are deliberately kept. */
    function releaseMirrors(mesh) {
      if (!mesh || !mesh.chunks || !mesh.chunks.length || mesh._mirrorsFreed) return;
      mesh._mirrorsFreed = true;
      const atts = mesh.chunks[0].geo.attributes;
      for (const k in atts) if (atts[k]) atts[k].array = null;
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
    { chunked, makeFrustumPlanes, aabbInFrustum: _aabbInFrustum, aabbDist2: _aabbDist2 });
})();
