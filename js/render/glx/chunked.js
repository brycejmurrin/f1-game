"use strict";

const GLXChunked = (function () {
  const _saCache = new WeakMap();
  function _sameList(a, b) {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  const _gidCache = new WeakMap();
  function _groupIds(tbl) {
    let e = _gidCache.get(tbl);
    if (e) return e;
    const lists = tbl.lists, nc = lists.length, ids = new Int32Array(nc), by = new Map();
    let n = 0;
    for (let c = 0; c < nc; c++) {
      const li = lists[c];
      const k = Array.prototype.slice.call(li).sort((a, b) => a - b).join(",");
      let g = by.get(k);
      if (g === undefined) { g = n++; by.set(k, g); }
      ids[c] = g;
    }
    e = { ids, count: n, epoch: 0,
          head: new Int32Array(n), tail: new Int32Array(n), next: new Int32Array(nc),
          used: new Int32Array(n), order: new Int32Array(n) };
    _gidCache.set(tbl, e);
    return e;
  }
  function _shadowAllIdx(AL, tbl, lx, ly, lz) {
    let e = tbl && typeof tbl === "object" ? _saCache.get(tbl) : undefined;
    if (e !== undefined && lx === e.x && ly === e.y && lz === e.z) return e.idx;
    let r = -1;
    for (let p = 0; p < AL.length; p += 15) {
      if (AL[p] === lx && AL[p + 1] === ly && AL[p + 2] === lz) { r = p / 15; break; }
    }
    if (tbl && typeof tbl === "object") {
      if (e === undefined) _saCache.set(tbl, e = { x: 0, y: 0, z: 0, idx: -1 });
      e.x = lx; e.y = ly; e.z = lz; e.idx = r;
    }
    return r;
  }

  function init(core) {
    const gl = core.gl;
    const { bindVAO, setBlend, setDepthMask, setCull, setPolyOffset, toF32, createMesh, litMaterial } = core;
    const F = core.frame;

    const _fcPlanes = [new Float32Array(4), new Float32Array(4), new Float32Array(4),
                       new Float32Array(4), new Float32Array(4), new Float32Array(4)];

    let _mdExt = null, _mdOn = false, _mdTried = false;
    let _mdCounts = null, _mdOffsets = null;
    const _mdStats = { supported: null, on: false, multiCalls: 0, rangesSubmitted: 0, drawElementsAvoided: 0,
                       perChunkDraws: 0, consecutiveGroups: 0, setGroups: 0,
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

    const OCC_VS = "#version 300 es\nin vec3 aCorner;uniform mat4 uViewProj;uniform vec3 uMin,uMax;" +
      "void main(){gl_Position=uViewProj*vec4(mix(uMin,uMax,aCorner),1.0);}";
    const OCC_FS = "#version 300 es\nprecision lowp float;out vec4 o;void main(){o=vec4(1.0);}";
    let _occOn = false, _occProg = null, _occU = null, _occVao = null, _occFailed = false;
    let _occState = new WeakMap();
    const _occQueries = new Set();
    let _occDrawn = [], _occFrame = 0;
    const _occStats = { supported: null, on: false, tested: 0, culled: 0, queries: 0, passes: 0,
                        lagMax: 0, lagAvg: 0 };
    let _lagSum = 0, _lagN = 0;

    function _occInit() {
      if (_occProg || _occFailed) return !!_occProg;
      let prog = null, vao = null, vb = null, ib = null;
      const shaders = [];
      try {
        const mk = (type, src) => {
          const sh = gl.createShader(type);
          if (!sh) throw new Error("shader allocation");
          shaders.push(sh);
          gl.shaderSource(sh, src); gl.compileShader(sh);
          if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || "compile");
          return sh;
        };
        prog = gl.createProgram();
        if (!prog) throw new Error("program allocation");
        gl.attachShader(prog, mk(gl.VERTEX_SHADER, OCC_VS));
        gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, OCC_FS));
        gl.bindAttribLocation(prog, 0, "aCorner");
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || "link");
        for (const sh of shaders) gl.deleteShader(sh);
        shaders.length = 0;
        const uniforms = { vp: gl.getUniformLocation(prog, "uViewProj"),
                  mn: gl.getUniformLocation(prog, "uMin"), mx: gl.getUniformLocation(prog, "uMax") };
        const corners = new Float32Array([0,0,0, 1,0,0, 1,1,0, 0,1,0, 0,0,1, 1,0,1, 1,1,1, 0,1,1]);
        const cubeIdx = new Uint16Array([0,1,2, 0,2,3, 5,4,7, 5,7,6, 4,0,3, 4,3,7,
                                         1,5,6, 1,6,2, 3,2,6, 3,6,7, 4,5,1, 4,1,0]);
        vao = gl.createVertexArray();
        if (!vao) throw new Error("vertex array allocation");
        gl.bindVertexArray(vao);
        vb = gl.createBuffer();
        if (!vb) throw new Error("vertex buffer allocation");
        gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        ib = gl.createBuffer();
        if (!ib) throw new Error("index buffer allocation");
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, cubeIdx, gl.STATIC_DRAW);
        gl.bindVertexArray(null);
        core.invalidateVAO();
        _occProg = prog; _occU = uniforms; _occVao = vao;
        _occStats.supported = true;
        Log.info("gfx", "GLX occlusion queries ready");
        return true;
      } catch (e) {
        gl.bindVertexArray(null);
        core.invalidateVAO();
        if (ib) gl.deleteBuffer(ib);
        if (vb) gl.deleteBuffer(vb);
        if (vao) gl.deleteVertexArray(vao);
        if (prog) gl.deleteProgram(prog);
        for (const sh of shaders) gl.deleteShader(sh);
        _occFailed = true; _occStats.supported = false;
        Log.warn("gfx", "GLX occlusion queries unavailable: " + ((e && e.message) || e));
        return false;
      }
    }
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
      if (!_occOn || !_occProg || core.post.mirror.active()) return true;
      const st = _occState.get(mesh);
      return !st || st.flag[i] !== 0;
    }
    function _occReleaseMesh(mesh) {
      if (!mesh) return;
      for (let i = _occDrawn.length - 1; i >= 0; i--) {
        if (_occDrawn[i] === mesh) _occDrawn.splice(i, 1);
      }
      const st = _occState.get(mesh);
      if (!st) return;
      for (let i = 0; i < st.q.length; i++) {
        const q = st.q[i];
        if (!q) continue;
        try { if (!(core.ctxGone && core.ctxGone())) gl.deleteQuery(q); } catch (_) {  }
        _occQueries.delete(q);
        st.q[i] = null;
      }
      _occState.delete(mesh);
    }
    function _occReset() {
      for (const q of _occQueries) {
        try { gl.deleteQuery(q); } catch (_) {  }
      }
      _occQueries.clear();
      _occState = new WeakMap();
    }

    function createChunkedMesh(data, cellSize) {
      if (core.ctxGone && core.ctxGone()) return null;
      const cell = ChunkBins.cellSize(cellSize);
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
      let interleaved = VertexPack.pack(vCount, pos, nrm, col, mat, trk);
      nrm = col = mat = null;
      if (data._keepFullGeometry === false) {
        data.nrm = data.col = data.mat = data.trk = null;
      }
      const buckets = ChunkBins.bin(pos, srcIdx, cell);
      pos = null;
      if (!data._keepPositions) { data.pos = null; data.idx = null; }
      let vao = null, vbo = null, ibo = null;
      try {
        vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.STATIC_DRAW);
        interleaved = null;
        VertexPack.bindAttribs(gl, hasTrk);
        const indexType = big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
        const BPI = big ? 4 : 2;
        let align = true;
        try { if (localStorage.getItem("apex26.glxChunkAlign") === "0") align = false; } catch (_) {  }
        const needAlign = !big && align;
        let total = 0;
        buckets.forEach((bk) => {
          total += bk.idx.length;
          if (needAlign && (total % 2 !== 0)) total += 3;
        });
        ibo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, total * BPI, gl.STATIC_DRAW);
        const chunks = [];
        let off = 0;
        const pad = needAlign ? new Uint16Array([0, 0, 0]) : null;
        buckets.forEach((bk) => {
          const start = off;
          const src = bk.idx;
          bk.idx = null;
          if (big) gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, off * BPI, src);
          else gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, off * BPI, new Uint16Array(src));
          off += src.length;
          if (needAlign && (off % 2 !== 0)) {
            gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, off * BPI, pad);
            off += 3;
          }
          chunks.push({ byteOffset: start * BPI, count: off - start, indexType, min: bk.mn, max: bk.mx });
        });
        return { vao, vbo, ib: ibo, count: total, indexType, chunks, cellSize: cell };
      } catch (e) {
        try { if (ibo) gl.deleteBuffer(ibo); } catch (_) {  }
        try { if (vbo) gl.deleteBuffer(vbo); } catch (_) {  }
        try { if (vao) gl.deleteVertexArray(vao); } catch (_) {  }
        throw e;
      } finally {
        gl.bindVertexArray(null);
        core.invalidateVAO();
      }
    }

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
      if (_occOn && mesh.chunks && !core.post.mirror.active() && _occDrawn.indexOf(mesh) < 0) _occDrawn.push(mesh);
      const alpha = litMaterial(modelMat, opts);
      setDepthMask(true);
      setBlend(alpha < 1);
      bindVAO(mesh.vao);
      if (!mesh.chunks) { gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib); gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0); return; }
      Frustum.extractPlanes(F.viewProj, _fcPlanes);
      const chunks = mesh.chunks;
      const eye = F.eye;
      const cd = F.cullDist, cf = F.cullFog,
            ex = eye ? eye[0] : 0, ey = eye ? eye[1] : 0, ez = eye ? eye[2] : 0;
      const perChunk = F.perChunkLights > 0 && F.allLights &&
        !(opts && opts.surfaceId === 16 && !F.roadChunkLamps);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib);
      _mdStats.perChunkKnob = F.perChunkLights;
      _mdStats.allLightsLen = F.allLights ? F.allLights.length : -1;
      if (perChunk) _mdStats.lampFrames++; else _mdStats.plainFrames++;
      if (perChunk) {
      try {
        const _tbl = LampChunks.resolve(F.allLights, chunks, F.perChunkLights);
        const SH = core.shadow;
        let shadowAllIdx = -1;
        if (SH && SH.lampEnabled && SH.lampArmed && SH.lampIdx >= 0 && F.lights && !core.post.mirror.active() &&
            !(F.tailCount > 0 && SH.lampIdx >= F.tailStart)) {
          const o = SH.lampIdx * 15;
          shadowAllIdx = _shadowAllIdx(F.allLights, _tbl, F.lights[o], F.lights[o + 1], F.lights[o + 2]);
        }
        let lastSlot = null, lastLi = null;
        let runOff = -1, runCount = 0, runType = 0, runLi = null, runSlot = -1;
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
              Frustum.radialCulled(ch.min, ch.max, ex, ey, ez, cd, cf) ||
              !_occVisible(mesh, i)) { if (!md) flush(); continue; }
          visible++;
          const g = GI.ids[i];
          if (!(lastVisI === i - 1 && lastVisG === g)) consec++;
          lastVisI = i; lastVisG = g;
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
      } finally {
        try {
          core.uploadLightSet(F.lights, null, F.lights ? (F.lights.length / 15) | 0 : 0);
        } finally {
          core.setLampShadowSlot(core.shadow ? core.shadow.lampIdx : -1);
        }
      }
      } else if (_mdOn && _mdExt) {
        const stride = mesh.indexType === gl.UNSIGNED_INT ? 4 : 2;
        _mdRoom(chunks.length);
        let n = 0, plain = 0;
        for (let i = 0; i < chunks.length; i++) {
          const ch = chunks[i];
          if (!(Frustum.aabbInFrustum(_fcPlanes, ch.min, ch.max) &&
                !Frustum.radialCulled(ch.min, ch.max, ex, ey, ez, cd, cf) &&
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
                      !Frustum.radialCulled(ch.min, ch.max, ex, ey, ez, cd, cf) &&
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
    }

    function castShadowChunked(mesh, model, reach) {
      const SH = core.shadow;
      if ((core.ctxGone && core.ctxGone()) || !SH.depthPassOn || !mesh) return;
      bindVAO(mesh.vao);
      gl.uniformMatrix4fv(SH.depthU.uModel, false, model);
      if (!mesh.chunks) { gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib); gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0); return; }
      Frustum.extractPlanes(SH.castCullVP || SH.lightVP, _fcPlanes);
      const chunks = mesh.chunks;
      const rr = reach && reach[3] > 0 ? reach[3] * reach[3] : -1;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib);
      let runOff = -1, runCount = 0;
      for (let i = 0; i < chunks.length; i++) {
        const ch = chunks[i];
        if (Frustum.aabbInFrustum(_fcPlanes, ch.min, ch.max) &&
            (rr < 0 || Frustum.aabbDist2(ch.min, ch.max, reach[0], reach[1], reach[2]) <= rr)) {
          if (runOff < 0) { runOff = ch.byteOffset; runCount = ch.count; }
          else runCount += ch.count;
        } else if (runOff >= 0) {
          gl.drawElements(gl.TRIANGLES, runCount, mesh.indexType, runOff);
          runOff = -1; runCount = 0;
        }
      }
      if (runOff >= 0) gl.drawElements(gl.TRIANGLES, runCount, mesh.indexType, runOff);
    }

    function occlusionPass() {
      if (!_occOn || (core.ctxGone && core.ctxGone()) || !_occInit()) { _occDrawn.length = 0; return; }
      const meshes = _occDrawn;
      if (!meshes.length) return;
      _occFrame++;
      _occStats.passes++;
      let tested = 0, culled = 0, queries = 0;
      Frustum.extractPlanes(F.viewProj, _fcPlanes);
      const eye = F.eye, cd = F.cullDist, cf = F.cullFog;
      const ex = eye ? eye[0] : 0, ey = eye ? eye[1] : 0, ez = eye ? eye[2] : 0;
      const prevProg = gl.getParameter(gl.CURRENT_PROGRAM);
      const prevCull = !!gl.getParameter(gl.CULL_FACE);
      setPolyOffset(null);
      gl.useProgram(_occProg);
      gl.uniformMatrix4fv(_occU.vp, false, F.viewProj);
      bindVAO(_occVao);
      gl.colorMask(false, false, false, false);
      setDepthMask(false);
      setBlend(false);
      gl.depthFunc(gl.LEQUAL);
      setCull(false);
      try {
        for (const mesh of meshes) {
          const st = _occStateOf(mesh);
          if (!st) continue;
          const chunks = mesh.chunks;
          for (let i = 0; i < chunks.length; i++) {
            const ch = chunks[i];
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
                         !Frustum.radialCulled(ch.min, ch.max, ex, ey, ez, cd, cf);
            if (!cand) { st.flag[i] = 1; continue; }
            const mn = ch.min, mx = ch.max, near = _fcPlanes[4];
            const inside = eye && ex >= mn[0] && ex <= mx[0] && ey >= mn[1] && ey <= mx[1] && ez >= mn[2] && ez <= mx[2];
            const nearMin = near[3] + near[0] * (near[0] >= 0 ? mn[0] : mx[0])
              + near[1] * (near[1] >= 0 ? mn[1] : mx[1]) + near[2] * (near[2] >= 0 ? mn[2] : mx[2]);
            if (inside || nearMin <= 0) { st.flag[i] = 1; continue; }
            tested++;
            if (st.flag[i] === 0) culled++;
            if (st.sent[i]) continue;
            if (!st.q[i]) {
              const q = gl.createQuery();
              if (!q) { st.flag[i] = 1; continue; }
              st.q[i] = q;
              _occQueries.add(q);
            }
            gl.uniform3f(_occU.mn, ch.min[0], ch.min[1], ch.min[2]);
            gl.uniform3f(_occU.mx, ch.max[0], ch.max[1], ch.max[2]);
            gl.beginQuery(gl.ANY_SAMPLES_PASSED_CONSERVATIVE, st.q[i]);
            try { gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0); }
            finally { gl.endQuery(gl.ANY_SAMPLES_PASSED_CONSERVATIVE); }
            st.sent[i] = 1; st.at[i] = _occFrame; queries++;
          }
        }
      } finally {
        setCull(prevCull);
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
    function occlusionCull(on) {
      const want = !!on;
      if (want !== _occOn) {
        _occOn = want;
        _occDrawn.length = 0;
        _occReset();
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
      _occReleaseMesh(mesh);
      if (core.ctxGone && core.ctxGone()) return;
      core.unbindVAOIf(mesh.vao);
      if (mesh.ib) gl.deleteBuffer(mesh.ib);
      if (mesh.vbo) gl.deleteBuffer(mesh.vbo);
      if (mesh.vao) gl.deleteVertexArray(mesh.vao);
    }

    Log.info("gfx", "GLX chunked init");
    return { createChunkedMesh, drawChunked, castShadowChunked, freeChunkedMesh,
             occlusionPass, occlusionCull, occlusionStats, multiDraw, multiDrawStats,
             makeFrustumPlanes: Frustum.makeFrustumPlanes,
             aabbInFrustum: Frustum.aabbInFrustum, aabbDist2: Frustum.aabbDist2 };
  }

  return { init };
})();
Object.freeze(GLXChunked);
