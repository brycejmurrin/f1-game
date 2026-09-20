/* Apex 26 — GLX chunked-mesh subsystem (split out of js/render/glx/glx.js). Frustum-culled chunked meshes for the heavy city/props geometry: one shared VBO/VAO with o… */
"use strict";

const GLXChunked = (function () {
  // Which record in F.allLights IS the shadow-mapped lamp? Resolved by baked
  // POSITION, which is stable: setFrame copies positions verbatim and flicker
  // scales rgb only. The scan is O(all baked lamps) — up to ~1000 records — and
  // drawChunked is called once per chunked mesh (props, glass, terrain, road),
  // so it ran 4-5x a frame, and again per env-probe face, to recompute a value
  // that is identical for the whole frame and usually for many frames: the
  // mapped lamp only changes when the shadow caster does. Keyed on the array
  // identity plus the position, so a rebuilt lamp set or a new caster misses
  // exactly once.
  let _saAL = null, _saX = 0, _saY = 0, _saZ = 0, _saIdx = -1;
  // Two chunks share a light set when the baked lists are the same object (the
  // common case — LampChunks reuses a list across neighbours) or element-wise
  // equal. Lists are perChunkLights long, i.e. single digits.
  function _sameList(a, b) {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  // Chunks that share a light set, found ONCE per baked table instead of by
  // comparing neighbours. `ids[c]` is a dense group id; every chunk sharing a
  // group shares its uploaded light set and therefore its shadow slot. Cached
  // on the table object, which LampChunks already invalidates on the lights
  // array identity and the cap.
  //
  // MEASURED at vegas, clock held at 02:00, player at 0.35 of a lap, counted
  // per frame (the counters below, read through __apex.multiDraw()):
  //
  //     108.5 visible chunk draws -> 24.5 consecutive groups -> 15.0 sets
  //
  // So grouping by SET rather than by neighbour is worth about 9.5 calls a
  // frame here, 1.63x fewer. Two things that number corrects, both of which
  // were guesses of mine before it existed:
  //   * Neighbour comparison is NOT hopeless. createChunkedMesh bins triangles
  //     into a Map keyed gx*4096+gz, so chunk array order is triangle-emission
  //     order and I expected consecutive entries to be spatially unrelated —
  //     but they group 108.5 draws into 24.5, so emission order tracks space
  //     much better than that.
  //   * The key is sorted because a set is a set, not because the sorting pays:
  //     LampChunks.buildTable orders each list by DISTANCE, so two chunks lit
  //     by the same eight lamps can hold them in different orders, and I
  //     expected that to be the main cause. Measured with the unsorted key the
  //     same scene gives 22 -> 14: the canonical order is worth about one group
  //     a frame, not the fourfold I predicted.
  const _gidCache = new WeakMap();
  function _groupIds(tbl) {
    let e = _gidCache.get(tbl);
    if (e) return e;
    const lists = tbl.lists, nc = lists.length, ids = new Int32Array(nc), by = new Map();
    let n = 0;
    for (let c = 0; c < nc; c++) {
      const li = lists[c];
      // Sorted key: the set is what matters, the distance order is not. A copy
      // per chunk, once per bake, over lists of at most CAP (24) entries.
      const k = Array.prototype.slice.call(li).sort((a, b) => a - b).join(",");
      let g = by.get(k);
      if (g === undefined) { g = n++; by.set(k, g); }
      ids[c] = g;
    }
    // head/tail/next: the per-frame bucket chains. `used` is a stamp against
    // `epoch` so a frame never clears an array it did not touch, and `order`
    // keeps the groups in first-seen order so the emit pass walks the index
    // buffer roughly forwards.
    e = { ids, count: n, epoch: 0,
          head: new Int32Array(n), tail: new Int32Array(n), next: new Int32Array(nc),
          used: new Int32Array(n), order: new Int32Array(n) };
    _gidCache.set(tbl, e);
    return e;
  }
  function _shadowAllIdx(AL, lx, ly, lz) {
    if (AL === _saAL && lx === _saX && ly === _saY && lz === _saZ) return _saIdx;
    let r = -1;
    for (let p = 0; p < AL.length; p += 15) {
      if (AL[p] === lx && AL[p + 1] === ly && AL[p + 2] === lz) { r = p / 15; break; }
    }
    _saAL = AL; _saX = lx; _saY = ly; _saZ = lz; _saIdx = r;
    return r;
  }

  function init(core) {
    const gl = core.gl;
    const { bindVAO, setBlend, setDepthMask, setCull, setPolyOffset, toF32, createMesh, litMaterial } = core;
    const F = core.frame;

    const _fcPlanes = [new Float32Array(4), new Float32Array(4), new Float32Array(4),
                       new Float32Array(4), new Float32Array(4), new Float32Array(4)];

    // ── WEBGL_multi_draw (apex26.multiDraw) ───────────────────────────────
    //
    // WHY, and it is the opposite of what the occlusion work assumed. The
    // census measured the frame GPU-bound and invariant to pixel count, which
    // rules out fragment-bound but not the difference that matters here; the
    // bound test then settled it (run 139, RENDER-PERF-PLAN §2): props uploaded
    // as ONE mesh — every vertex, no frustum cull, no occlusion — came in at
    // 18.21 ms against 18.75 ms for 152 culled draws. A single draw call
    // carrying 441,000 vertices beats 152 culled ones. DRAW CALLS bind.
    //
    // So collapse them. multiDrawElementsWEBGL takes a list of (count, offset)
    // pairs and issues them as one call, which is exactly the shape this file
    // already has: createChunkedMesh gives every chunk a range into one shared
    // index buffer, and tests/unit/chunked-index-ranges.test.mjs proves those
    // ranges tile it with no gap or overlap. Nothing about the DATA changes —
    // only the number of calls that submit it.
    //
    // It also removes the constraint the run-merge was built around.
    // drawElements can merge two chunks only when they are CONTIGUOUS in the
    // index buffer; multi-draw does not care, so chunks that share a light set
    // but sit apart now travel in one call instead of several.
    //
    // 92.6 % of browsers have the extension — 100 % on iOS and Safari, 99.97 %
    // Chrome — and Firefox is the outlier at 1.4 %, so the fallback below is
    // not decoration. Absent extension, or the flag off, and every path here is
    // the drawElements one it has always been.
    let _mdExt = null, _mdOn = false, _mdTried = false;
    let _mdCounts = null, _mdOffsets = null;
    // perChunkDraws / consecutiveGroups / setGroups are the COUNTED oracle for
    // the grouping itself, maintained whether or not the extension is on: how
    // many visible chunks the lamp branch submitted, how many groups the old
    // neighbour-comparison scheme would have made of them, and how many the
    // content bucketing does make. The ratio between the last two is the whole
    // claim multi-draw rests on, and it is a count, not a timing.
    const _mdStats = { supported: null, on: false, multiCalls: 0, rangesSubmitted: 0, drawElementsAvoided: 0,
                       perChunkDraws: 0, consecutiveGroups: 0, setGroups: 0,
                       // WHY the lamp branch did or did not run. Census 150 asked
                       // for the night leg, got clock=2:00, and STILL reported
                       // perChunkDraws 0 — the branch did not execute, and nothing
                       // in the output said why. The same calls give 358 locally,
                       // so it is the environment, not the sequence. These three
                       // are the whole gate (`perChunk` below), so a future reader
                       // reads the reason instead of inferring it.
                       lampFrames: 0, plainFrames: 0, perChunkKnob: null, allLightsLen: -1 };
    function _mdInit() {
      if (_mdTried) return !!_mdExt;
      _mdTried = true;
      try { _mdExt = gl.getExtension("WEBGL_multi_draw"); } catch (_) { _mdExt = null; }
      _mdStats.supported = !!_mdExt;
      Log.info("gfx", "GLX multi-draw " + (_mdExt ? "available" : "NOT available"));
      return !!_mdExt;
    }
    function _mdRoom(n) {
      if (!_mdCounts || _mdCounts.length < n) { _mdCounts = new Int32Array(n + 64); _mdOffsets = new Int32Array(n + 64); }
    }
    function multiDraw(on) {
      const want = !!on;
      if (want && !_mdInit()) { _mdOn = false; return { on: false, supported: false }; }
      _mdOn = want; _mdStats.on = want;
      if (!want) { _mdStats.multiCalls = _mdStats.rangesSubmitted = _mdStats.drawElementsAvoided = 0; }
      _mdStats.perChunkDraws = _mdStats.consecutiveGroups = _mdStats.setGroups = 0;
      _mdStats.lampFrames = _mdStats.plainFrames = 0;
      return { on: _mdOn, supported: _mdStats.supported };
    }
    function multiDrawStats() { return Object.assign({}, _mdStats, { on: _mdOn }); }

    // ── OCCLUSION CULLING (apex26.occlusionCull, ships OFF) ────────────────
    //
    // WHY, with numbers. tools/check/occlusion-estimate.mjs rasterises every
    // prop triangle into a depth buffer carrying the cell id that won each
    // pixel: of the chunks this file submits per camera, 84.9 % at vegas,
    // 80.1 % at monza and 55.9 % at spa contribute NO pixel at all — 58 %, 55 %
    // and 18 % of submitted prop vertices. And gpu-census run 131/132 measured
    // the frame GPU-bound and INVARIANT to pixel count (1.67x the pixels, 0.94x
    // the GPU time), so the cost is geometry and draw submission, which is
    // exactly what those wasted chunks are. The culling review had rejected
    // occlusion culling for needing a depth pre-pass; WebGL2 hardware queries
    // need none, and its other premise — that the frame cost is draw calls —
    // is the argument FOR removing draws that produce nothing.
    //
    // HOW. One proxy box per candidate chunk, drawn with colour and depth
    // writes off against the depth already in the buffer, wrapped in an
    // ANY_SAMPLES_PASSED_CONSERVATIVE query. Results are read on a LATER frame
    // (CHC++ temporal coherence) so nothing ever blocks on the GPU.
    //
    // EVERY UNCERTAINTY RESOLVES TO "VISIBLE". A missing extension, a program
    // that would not link, a chunk never queried, a query whose result has not
    // landed, a mesh seen for the first time — all keep the chunk drawn. The
    // failure mode of this feature must be "no saving", never "a hole in the
    // world", and that is why the flag ships off until a census says otherwise.
    const OCC_VS = "#version 300 es\nin vec3 aCorner;uniform mat4 uViewProj;uniform vec3 uMin,uMax;" +
      "void main(){gl_Position=uViewProj*vec4(mix(uMin,uMax,aCorner),1.0);}";
    const OCC_FS = "#version 300 es\nprecision lowp float;out vec4 o;void main(){o=vec4(1.0);}";
    let _occOn = false, _occProg = null, _occU = null, _occVao = null, _occFailed = false;
    let _occState = new WeakMap();        // mesh -> { flag, q, sent }
    let _occDrawn = [], _occFrame = 0;
    // `lagMax` / `lagSum` / `lagN` are HOW MANY PASSES a query takes to answer,
    // and they exist because run 133 reported queries=0 on its sampled pass —
    // every chunk already had one in flight. Harvesting demonstrably worked
    // (nothing reaches culled=146 otherwise), but the sample said nothing about
    // the latency, and a visibility flag that updates slowly is a flag that
    // POPS: the chunk stays hidden for as many frames as the answer takes.
    // Counting it is the difference between knowing that and assuming it.
    const _occStats = { supported: null, on: false, tested: 0, culled: 0, queries: 0, passes: 0,
                        lagMax: 0, lagAvg: 0 };
    let _lagSum = 0, _lagN = 0;

    function _occInit() {
      if (_occProg || _occFailed) return !!_occProg;
      try {
        const mk = (type, src) => {
          const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
          if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || "compile");
          return sh;
        };
        const prog = gl.createProgram();
        gl.attachShader(prog, mk(gl.VERTEX_SHADER, OCC_VS));
        gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, OCC_FS));
        gl.bindAttribLocation(prog, 0, "aCorner");
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || "link");
        _occProg = prog;
        _occU = { vp: gl.getUniformLocation(prog, "uViewProj"),
                  mn: gl.getUniformLocation(prog, "uMin"), mx: gl.getUniformLocation(prog, "uMax") };
        // Unit cube: 8 corners as 0/1 selectors, 36 indices. The vertex shader
        // mixes them between the chunk bounds, so the geometry is static.
        const corners = new Float32Array([0,0,0, 1,0,0, 1,1,0, 0,1,0, 0,0,1, 1,0,1, 1,1,1, 0,1,1]);
        const cubeIdx = new Uint16Array([0,1,2, 0,2,3, 5,4,7, 5,7,6, 4,0,3, 4,3,7,
                                         1,5,6, 1,6,2, 3,2,6, 3,6,7, 4,5,1, 4,1,0]);
        _occVao = gl.createVertexArray();
        gl.bindVertexArray(_occVao);
        const vb = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        const ib = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, cubeIdx, gl.STATIC_DRAW);
        gl.bindVertexArray(null);
        _occStats.supported = true;
        Log.info("gfx", "GLX occlusion queries ready");
        return true;
      } catch (e) {
        _occFailed = true; _occStats.supported = false;
        Log.warn("gfx", "GLX occlusion queries unavailable: " + ((e && e.message) || e));
        return false;
      }
    }
    // A chunk is drawn unless a query has SAID it is hidden. `flag` starts at 1
    // for every chunk of every mesh, including meshes this pass has never seen.
    function _occStateOf(mesh) {
      let st = _occState.get(mesh);
      if (!st && mesh.chunks) {
        st = { flag: new Uint8Array(mesh.chunks.length).fill(1), q: new Array(mesh.chunks.length).fill(null),
               sent: new Uint8Array(mesh.chunks.length), at: new Int32Array(mesh.chunks.length) };
        _occState.set(mesh, st);
      }
      return st;
    }
    function _occVisible(mesh, i) {
      if (!_occOn || !_occProg) return true;
      const st = _occState.get(mesh);
      return !st || st.flag[i] !== 0;
    }

    function createChunkedMesh(data, cellSize) {
      const cell = cellSize > 0 ? cellSize : 72;
      let pos = toF32(data.pos), nrm = toF32(data.nrm), col = toF32(data.col);
      const srcIdx = data.idx, vCount = pos.length / 3, big = vCount > 65535;
      const triCount = (srcIdx.length / 3) | 0;
      if (triCount < 2000) {
        const m = createMesh(data);
        if (!m) return null;
        m.chunks = null;
        return m;
      }
      let mat = data.mat && data.mat.length === vCount ? toF32(data.mat) : null;
      const trk = data.trk && data.trk.length === vCount * 3 ? toF32(data.trk) : null;
      const hasTrk = trk != null;
      // Packed layout — js/render/shared/vertex-pack.js. 28 bytes a vertex
      // (40 on the road, which carries track coords), against 36-52 when every
      // column was float32: on a street circuit's props this is tens of MB of
      // VBO, and the same fraction off the per-frame vertex fetch.
      let interleaved = VertexPack.pack(vCount, pos, nrm, col, mat, trk);
      // Interleave done: normals/colours/materials are now baked into `interleaved`
      // and never read again. Drop them (both the toF32 copies and the source refs)
      // so ~half the source arrays can be GC'd before the bucket index arrays are
      // built — lowers the transient peak on ~5 M-vert street props. `pos` is still
      // needed below for triangle centroids/AABBs, so it's nulled after the bins.
      nrm = col = mat = null;
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
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.STATIC_DRAW);
      interleaved = null;   // uploaded to the VBO — drop the CPU copy
      VertexPack.bindAttribs(gl, hasTrk);
      const IndexArray = big ? Uint32Array : Uint16Array;
      const indexType = big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
      const BPI = big ? 4 : 2;                 // bytes per index
      // ONE index buffer for the whole mesh. A chunk is a (byteOffset, count)
      // RANGE into it rather than a buffer of its own, which is what lets the
      // draw loops below merge adjacent visible chunks into a single
      // drawElements — the chunked scenery is otherwise the largest draw-call
      // block in the frame (measured over 12 stations a lap against the real
      // camera frustum: 146.9 visible chunks on spa, 100.9 on vegas, 79.3 on
      // monza, plus 36.8 for vegas glass, each one its own draw AND its own
      // ELEMENT_ARRAY_BUFFER bind).
      //
      // Nothing has to be rebased: bucket indices are already ABSOLUTE into the
      // shared VBO (the binning loop above pushes raw srcIdx values) and the
      // index TYPE is uniform per mesh, so concatenating in bucket order is a
      // byte-for-byte copy. Buckets keep Map insertion order, which is the
      // order triangles were emitted — along the arc — so the ranges are
      // already spatially coherent and no reorder is needed or wanted.
      //
      // Allocated by SIZE then filled with bufferSubData per bucket, rather
      // than concatenating on the CPU first: that keeps the transient peak at
      // one bucket's index array, exactly as before. On a ~5 M-vert street
      // circuit the whole-mesh array would be tens of MB held at once.
      let total = 0;
      buckets.forEach((bk) => { total += bk.idx.length; });
      const ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, total * BPI, gl.STATIC_DRAW);
      const chunks = [];
      let off = 0;                             // running offset, in INDICES
      buckets.forEach((bk) => {
        const arr = new IndexArray(bk.idx);
        bk.idx = null;   // uploaded below — drop the growable JS array now so buckets
                         // don't all stay resident while the rest are converted
        gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, off * BPI, arr);
        chunks.push({ byteOffset: off * BPI, count: arr.length, indexType, min: bk.mn, max: bk.mx });
        off += arr.length;
      });
      gl.bindVertexArray(null);
      core.invalidateVAO();   // keep glx.js's VAO bind cache in sync with the direct bind above
      return { vao, vbo, ib: ibo, count: total, indexType, chunks, cellSize: cell };
    }

    // Draw a chunked mesh, frustum-culling each chunk against the camera. Material
    // setup is identical to draw() (both route through core.litMaterial).
    // OPAQUE-ONLY: this path keeps depth writes ON regardless of alpha and never
    // masks alpha writes, so draw()'s translucency invariants (translucent draws
    // must not write depth; any blended draw masks scene alpha to protect the
    // SSR car-paint tag) are NOT honoured here. Every current caller passes
    // alpha 1 (game.js props/glass materials carry no alpha field); route
    // translucent work through draw() instead.
    function drawChunked(mesh, modelMat, opts) {
      if ((core.ctxGone && core.ctxGone()) || !mesh) return;
      const dbl = opts && opts.doubleSided, bias = opts && opts.depthBias;
      if (dbl) setCull(false);
      if (bias) setPolyOffset(bias);
      try {
        drawChunkedBody(mesh, modelMat, opts);
      } finally {
        if (bias) setPolyOffset(null);
        if (dbl) setCull(true);
      }
    }

    function drawChunkedBody(mesh, modelMat, opts) {
      if (_occOn && mesh.chunks && _occDrawn.indexOf(mesh) < 0) _occDrawn.push(mesh);
      const alpha = litMaterial(modelMat, opts);
      setDepthMask(true);
      setBlend(alpha < 1);
      bindVAO(mesh.vao);
      if (!mesh.chunks) { gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib); gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0); return; }
      Frustum.extractPlanes(F.viewProj, _fcPlanes);
      const chunks = mesh.chunks;
      const eye = F.eye;
      const cd = F.cullDist, cd2 = cd * cd,
            ex = eye ? eye[0] : 0, ey = eye ? eye[1] : 0, ez = eye ? eye[2] : 0;
      // The ROAD (surfaceId 16) only takes per-chunk lamp sets when PER-CHUNK
      // ROAD asks for it. It is drawn chunked on most devices for the frustum
      // + radial cull regardless, so this gates the LAMPS, never the culling.
      const perChunk = F.perChunkLights > 0 && F.allLights &&
        !(opts && opts.surfaceId === 16 && !F.roadChunkLamps);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib);
      _mdStats.perChunkKnob = F.perChunkLights;
      _mdStats.allLightsLen = F.allLights ? F.allLights.length : -1;
      if (perChunk) _mdStats.lampFrames++; else _mdStats.plainFrames++;
      if (perChunk) {
        // uLampShadowIdx is a SLOT in the bound set, chosen against the global
        // frame.lights ordering — a per-chunk set reorders lamps, so without a
        // retarget the PCF lands on whatever lamp occupies that slot number in
        // the chunk's set (wrong pools shadowed, the real lamp's pool lost on
        // all chunked geometry — the road included under PER-CHUNK ROAD). The
        // godray pass remaps for the same reason. Resolve the mapped lamp's
        // record in F.allLights ONCE per call by baked position (setFrame
        // copies positions verbatim; flicker scales rgb only), then per chunk
        // find its slot in that chunk's index list.
        const SH = core.shadow;
        let shadowAllIdx = -1;
        if (SH && SH.lampEnabled && SH.lampArmed && SH.lampIdx >= 0 && F.lights &&
            !(F.tailCount > 0 && SH.lampIdx >= F.tailStart)) {
          const o = SH.lampIdx * 15;
          shadowAllIdx = _shadowAllIdx(F.allLights, F.lights[o], F.lights[o + 1], F.lights[o + 2]);
        }
        // The whole per-chunk table is baked ONCE per (lights, knob) by the
        // shared LampChunks module (build-time work, invalidated by lights
        // array identity + knob value — a rebuild:true tuner edit nulls
        // track._lights and the next build mints a new array); this loop only
        // binds each visible chunk's pre-baked list.
        const _tbl = LampChunks.resolve(F.allLights, chunks, F.perChunkLights);
        let lastSlot = null, lastLi = null;
        // RUN-MERGE, the per-chunk twin of the plain branch below. This drew
        // once per visible chunk — 128 of the frame's 129 drawElements — and
        // re-uploaded a light set per chunk even when the neighbour's set was
        // identical. MEASURED before writing it (scratch/r11/chunk-merge.mjs,
        // vegas night, full field): of 152.6 chunk draws a frame, 91.2
        // consecutive pairs are contiguous in the index buffer, 114.8 share a
        // light set, and 74.2 are BOTH — so about half the draws, and their
        // uploads, can be one call.
        //
        // A run may only extend while every one of these holds, and each is
        // load-bearing:
        //   visible   — a culled chunk between two visible ones must break the
        //               run or merging would DRAW what the cull removed.
        //   same list — the light set is uploaded once for the run.
        //   same slot — uLampShadowIdx is a slot in that set.
        //   contiguous + same index type — the merged draw is one range.
        let runOff = -1, runCount = 0, runType = 0, runLi = null, runSlot = -1;
        // MULTI-DRAW DOES NOT GROUP BY NEIGHBOUR, IT GROUPS BY LIGHT SET.
        //
        // The first cut kept the run-merge's shape and merely let a group
        // survive a culled gap, so it could still only ever group chunks that
        // were ADJACENT in the array. Bucketing drops that: every visible chunk
        // is filed under its group id and each group is one call, which is
        // exactly the constraint the extension removes and the only reason to
        // carry it. Draw ORDER inside a group is irrelevant — the chunked
        // meshes are opaque and depth-tested, and a group shares one upload.
        //
        // WHAT IT IS WORTH, and it is not much: 24.5 calls a frame become 15.0
        // (_groupIds above has the measurement). Nine and a half draw calls is
        // not a frame time, so this makes multi-draw correct rather than
        // valuable, and nothing here argues for turning the flag on.
        //
        // It does NOT explain gpu-census run 143, where the first cut reported
        // 4,853 ranges in 4,709 calls — 1.03 a call, against the 4.4 the same
        // counters give that scheme locally. That gap is unexplained: the
        // census leg ran macos-latest at resMode=high and counts every
        // drawChunked call, env-probe faces included, and a probe face that
        // sees one chunk contributes a one-range call. Until a census carries
        // these three counters, treat 1.03 as a number about that run and not
        // about this branch.
        //
        // The group table is read on BOTH paths, because it is also the counted
        // oracle: `consecutiveGroups` is how many groups the neighbour scheme
        // makes of these chunks and `setGroups` how many the bucketing makes,
        // both from the SAME frame, so the comparison never depends on two runs
        // on two machines agreeing about a scene.
        const md = _mdOn && !!_mdExt;
        const GI = _groupIds(_tbl);
        GI.epoch = (GI.epoch | 0) + 1;
        if (md) _mdRoom(chunks.length);
        let nUsed = 0, visible = 0, consec = 0, lastVisI = -2, lastVisG = -2;
        const flush = () => {
          if (runOff < 0) return;
          if (!_sameList(lastLi, runLi)) {
            core.uploadLightSet(F.allLights, runLi, runLi.length,
                                F.lights, F.tailStart, F.tailCount);
            lastLi = runLi;
          }
          if (runSlot !== lastSlot) { core.setLampShadowSlot(runSlot); lastSlot = runSlot; }
          gl.drawElements(gl.TRIANGLES, runCount, runType, runOff);
          runOff = -1; runCount = 0; runLi = null;
        };
        for (let i = 0; i < chunks.length; i++) {
          const ch = chunks[i];
          if (!Frustum.aabbInFrustum(_fcPlanes, ch.min, ch.max) ||
              (cd > 0 && Frustum.aabbDist2(ch.min, ch.max, ex, ey, ez) > cd2) ||
              !_occVisible(mesh, i)) { if (!md) flush(); continue; }
          visible++;
          const g = GI.ids[i];
          if (!(lastVisI === i - 1 && lastVisG === g)) consec++;
          lastVisI = i; lastVisG = g;
          // First sighting of this group THIS frame: stamp it and record the
          // order. Both paths do this, because nUsed is the setGroups count.
          // Under multi-draw the chunk is also filed on the group's chain,
          // appended so it stays in ascending chunk order — which is ascending
          // byteOffset, so neighbours still fold into one RANGE below.
          if (GI.used[g] !== GI.epoch) { GI.used[g] = GI.epoch; GI.head[g] = i; GI.order[nUsed++] = g; }
          else if (md) GI.next[GI.tail[g]] = i;
          if (md) { GI.tail[g] = i; GI.next[i] = -1; continue; }
          const li = _tbl.lists[i];
          let slot = -1;
          if (shadowAllIdx >= 0) {
            for (let j = 0; j < li.length; j++) if (li[j] === shadowAllIdx) { slot = j; break; }
          }
          const stride = ch.indexType === gl.UNSIGNED_INT ? 4 : 2;
          if (runOff >= 0 && runType === ch.indexType && runSlot === slot &&
              _sameList(runLi, li) && runOff + runCount * stride === ch.byteOffset) {
            runCount += ch.count;
            continue;
          }
          flush();
          runOff = ch.byteOffset; runCount = ch.count; runType = ch.indexType;
          runLi = li; runSlot = slot;
        }
        _mdStats.perChunkDraws += visible;
        _mdStats.consecutiveGroups += consec;
        if (md) {
          // One multiDrawElementsWEBGL per group, and the index type is
          // mesh-wide (createChunkedMesh stamps the same value on every chunk),
          // so it never varies inside one.
          const stride = mesh.indexType === gl.UNSIGNED_INT ? 4 : 2;
          for (let u = 0; u < nUsed; u++) {
            const g = GI.order[u], first = GI.head[g], li = _tbl.lists[first];
            let slot = -1;
            if (shadowAllIdx >= 0) {
              for (let j = 0; j < li.length; j++) if (li[j] === shadowAllIdx) { slot = j; break; }
            }
            if (!_sameList(lastLi, li)) {
              core.uploadLightSet(F.allLights, li, li.length,
                                  F.lights, F.tailStart, F.tailCount);
              lastLi = li;
            }
            if (slot !== lastSlot) { core.setLampShadowSlot(slot); lastSlot = slot; }
            let n = 0;
            for (let i = first; i >= 0; i = GI.next[i]) {
              const ch = chunks[i];
              if (n && _mdOffsets[n - 1] + _mdCounts[n - 1] * stride === ch.byteOffset) _mdCounts[n - 1] += ch.count;
              else { _mdCounts[n] = ch.count; _mdOffsets[n] = ch.byteOffset; n++; }
            }
            _mdExt.multiDrawElementsWEBGL(gl.TRIANGLES, _mdCounts, 0, mesh.indexType, _mdOffsets, 0, n);
            _mdStats.multiCalls++; _mdStats.rangesSubmitted += n; _mdStats.drawElementsAvoided += n - 1;
          }
          _mdStats.setGroups += nUsed;
        } else {
          flush();
          _mdStats.setGroups += nUsed;
        }
      } else if (_mdOn && _mdExt) {
        // Contiguous chunks still merge into one RANGE — a shorter list is
        // still less for the driver to walk — but a break no longer costs a
        // call, it costs an entry.
        const stride = mesh.indexType === gl.UNSIGNED_INT ? 4 : 2;
        _mdRoom(chunks.length);
        let n = 0, plain = 0;
        for (let i = 0; i < chunks.length; i++) {
          const ch = chunks[i];
          if (!(Frustum.aabbInFrustum(_fcPlanes, ch.min, ch.max) &&
                !(cd > 0 && Frustum.aabbDist2(ch.min, ch.max, ex, ey, ez) > cd2) &&
                _occVisible(mesh, i))) { plain = 0; continue; }
          if (plain && _mdOffsets[n - 1] + _mdCounts[n - 1] * stride === ch.byteOffset) _mdCounts[n - 1] += ch.count;
          else { _mdCounts[n] = ch.count; _mdOffsets[n] = ch.byteOffset; n++; }
          plain = 1;
        }
        if (n) {
          _mdExt.multiDrawElementsWEBGL(gl.TRIANGLES, _mdCounts, 0, mesh.indexType, _mdOffsets, 0, n);
          _mdStats.multiCalls++; _mdStats.rangesSubmitted += n; _mdStats.drawElementsAvoided += n - 1;
        }
      } else {
        let runOff = -1, runCount = 0;
        for (let i = 0; i < chunks.length; i++) {
          const ch = chunks[i];
          const vis = Frustum.aabbInFrustum(_fcPlanes, ch.min, ch.max) &&
                      !(cd > 0 && Frustum.aabbDist2(ch.min, ch.max, ex, ey, ez) > cd2) &&
                      _occVisible(mesh, i);
          if (vis) {
            if (runOff < 0) { runOff = ch.byteOffset; runCount = ch.count; }
            else runCount += ch.count;
          } else if (runOff >= 0) {
            gl.drawElements(gl.TRIANGLES, runCount, mesh.indexType, runOff);
            runOff = -1; runCount = 0;
          }
        }
        if (runOff >= 0) gl.drawElements(gl.TRIANGLES, runCount, mesh.indexType, runOff);
      }
      if (perChunk) {
        core.uploadLightSet(F.lights, null, F.lights ? (F.lights.length / 15) | 0 : 0);
        // Restore the global slot with the global set. Safe when the lamp map
        // is disarmed: uLampShadowOn gates the shader branch.
        core.setLampShadowSlot(core.shadow ? core.shadow.lampIdx : -1);
      }
    }

    function castShadowChunked(mesh, model) {
      const SH = core.shadow;
      if ((core.ctxGone && core.ctxGone()) || !SH.depthPassOn || !mesh) return;
      bindVAO(mesh.vao);
      gl.uniformMatrix4fv(SH.depthU.uModel, false, model);
      if (!mesh.chunks) { gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib); gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0); return; }
      Frustum.extractPlanes(SH.castCullVP || SH.lightVP, _fcPlanes);
      const chunks = mesh.chunks;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib);
      let runOff = -1, runCount = 0;
      for (let i = 0; i < chunks.length; i++) {
        const ch = chunks[i];
        if (Frustum.aabbInFrustum(_fcPlanes, ch.min, ch.max)) {
          if (runOff < 0) { runOff = ch.byteOffset; runCount = ch.count; }
          else runCount += ch.count;
        } else if (runOff >= 0) {
          gl.drawElements(gl.TRIANGLES, runCount, mesh.indexType, runOff);
          runOff = -1; runCount = 0;
        }
      }
      if (runOff >= 0) gl.drawElements(gl.TRIANGLES, runCount, mesh.indexType, runOff);
    }

    // THE QUERY PASS. Called once a frame, after the opaque geometry and before
    // post consumes the scene buffer, so the depth it tests against is the
    // finished opaque depth of THIS frame. Two halves, in this order:
    //
    //   1. Harvest. Read any query whose result has landed — never one that has
    //      not, because getQueryParameter on a pending query is the stall this
    //      whole design exists to avoid. A result of false means the proxy box
    //      did not put a single sample through the depth test, so the chunk is
    //      behind something solid and is skipped NEXT frame.
    //   2. Re-test every frustum-candidate, hidden ones included. A hidden
    //      chunk must keep being asked or it can never come back, and coming
    //      back late is a hole in the world that heals — the worst kind of bug
    //      to find later.
    //
    // The pass costs one twelve-triangle draw per candidate with no colour and
    // no depth write. That IS more draw calls than it removes (vegas: ~152
    // proxy draws to skip ~129 real ones), which would be a bad trade on a
    // draw-call-bound frame and is a good one here: the census measured the
    // frame invariant to pixel count, so it is VERTICES that bind, and 152
    // boxes are 1,216 vertices against the ~58 % of a quarter-million prop
    // vertices they remove.
    function occlusionPass() {
      if (!_occOn || (core.ctxGone && core.ctxGone()) || !_occInit()) { _occDrawn.length = 0; return; }
      const meshes = _occDrawn;
      if (!meshes.length) return;
      _occFrame++;
      _occStats.passes++;
      let tested = 0, culled = 0, queries = 0;
      Frustum.extractPlanes(F.viewProj, _fcPlanes);
      const eye = F.eye, cd = F.cullDist, cd2 = cd * cd;
      const ex = eye ? eye[0] : 0, ey = eye ? eye[1] : 0, ez = eye ? eye[2] : 0;
      const prevProg = gl.getParameter(gl.CURRENT_PROGRAM);
      gl.useProgram(_occProg);
      gl.uniformMatrix4fv(_occU.vp, false, F.viewProj);
      bindVAO(_occVao);
      gl.colorMask(false, false, false, false);
      setDepthMask(false);
      setBlend(false);
      gl.depthFunc(gl.LEQUAL);
      try {
        for (const mesh of meshes) {
          const st = _occStateOf(mesh);
          if (!st) continue;
          const chunks = mesh.chunks;
          for (let i = 0; i < chunks.length; i++) {
            const ch = chunks[i];
            // 1. Harvest whatever landed, whether or not this chunk is a
            //    candidate now — a result thrown away is a query wasted.
            const q = st.q[i];
            if (q && st.sent[i]) {
              if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) {
                st.flag[i] = gl.getQueryParameter(q, gl.QUERY_RESULT) ? 1 : 0;
                st.sent[i] = 0;
                const lag = _occFrame - st.at[i];
                if (lag > _occStats.lagMax) _occStats.lagMax = lag;
                _lagSum += lag; _lagN++;
              }
            }
            const cand = Frustum.aabbInFrustum(_fcPlanes, ch.min, ch.max) &&
                         !(cd > 0 && Frustum.aabbDist2(ch.min, ch.max, ex, ey, ez) > cd2);
            if (!cand) { st.flag[i] = 1; continue; }   // out of frustum: not our business, and never left hidden
            tested++;
            if (st.flag[i] === 0) culled++;
            if (st.sent[i]) continue;                  // one query in flight per chunk
            if (!st.q[i]) st.q[i] = gl.createQuery();
            gl.uniform3f(_occU.mn, ch.min[0], ch.min[1], ch.min[2]);
            gl.uniform3f(_occU.mx, ch.max[0], ch.max[1], ch.max[2]);
            gl.beginQuery(gl.ANY_SAMPLES_PASSED_CONSERVATIVE, st.q[i]);
            gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
            gl.endQuery(gl.ANY_SAMPLES_PASSED_CONSERVATIVE);
            st.sent[i] = 1; st.at[i] = _occFrame; queries++;
          }
        }
      } finally {
        // LEQUAL, not LESS — this restores the CONTEXT BASELINE (glx.js sets
        // LEQUAL once at init and nothing resets it per frame), and the sky is
        // a fullscreen triangle at depth exactly 1.0 drawn AFTER the opaque
        // pass, against a depth buffer cleared to 1.0. Under LESS it fails its
        // own test and the sky goes black for every frame after the first
        // occlusion pass. Only reachable with apex26.occlusionCull=1, which
        // ships OFF — which is why nothing caught it.
        gl.depthFunc(gl.LEQUAL);
        gl.colorMask(true, true, true, true);
        setDepthMask(true);
        if (prevProg) gl.useProgram(prevProg);
        _occDrawn.length = 0;
      }
      _occStats.tested = tested; _occStats.culled = culled; _occStats.queries = queries;
      _occStats.lagAvg = _lagN ? +(_lagSum / _lagN).toFixed(2) : 0;
      _occStats.on = true;
    }
    // EITHER direction of the toggle drops the state, and both directions need
    // it. Off is covered twice over — _occVisible already short-circuits on
    // _occOn — but ON is the one that would bite: stale flags from a previous
    // enable would apply before a single query had re-tested them, so a chunk
    // hidden a minute ago would be hidden again for a frame in a scene that has
    // moved. The pass heals that within a frame or two, and a frame or two is
    // exactly how long a hole in the world is visible. A fresh WeakMap starts
    // every chunk visible by construction, which is the whole contract.
    function occlusionCull(on) {
      const want = !!on;
      if (want !== _occOn) {
        _occOn = want;
        _occDrawn.length = 0;
        _occState = new WeakMap();
        _lagSum = 0; _lagN = 0; _occStats.lagMax = 0; _occStats.lagAvg = 0;
        if (!want) { _occStats.on = false; _occStats.tested = _occStats.culled = _occStats.queries = 0; }
        Log.info("gfx", "GLX occlusion cull " + (want ? "ON" : "off"));
      }
      if (want) _occInit();
      return { on: _occOn, supported: _occStats.supported };
    }
    function occlusionStats() { return Object.assign({}, _occStats, { on: _occOn }); }

    function freeChunkedMesh(mesh) {
      if (!mesh) return;
      core.unbindVAOIf(mesh.vao);
      if (mesh.ib) gl.deleteBuffer(mesh.ib);
      if (mesh.vbo) gl.deleteBuffer(mesh.vbo);
      if (mesh.vao) gl.deleteVertexArray(mesh.vao);
    }

    Log.info("gfx", "GLX chunked init");
    // makeFrustumPlanes: allocates a fresh plane set from a column-major
    // view-proj (Frustum.makeFrustumPlanes). The draw path above uses the
    // module-static _fcPlanes scratch and must keep doing so (it runs per
    // frame); this export is for occasional callers — the agent world view
    // asking "which scenery chunks are actually on screen" — where one
    // allocation is free and sharing the scratch with an in-flight draw would
    // be a bug. Optional `out` (array of 6 Float32Array(4)) reuses a caller
    // pool — the race prop-batch path must never call the allocating form
    // every frame.
    return { createChunkedMesh, drawChunked, castShadowChunked, freeChunkedMesh,
             occlusionPass, occlusionCull, occlusionStats, multiDraw, multiDrawStats,
             makeFrustumPlanes: Frustum.makeFrustumPlanes,
             aabbInFrustum: Frustum.aabbInFrustum, aabbDist2: Frustum.aabbDist2 };
  }

  return { init };
})();
Object.freeze(GLXChunked);
