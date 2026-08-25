/* Apex 26 — GLX chunked-mesh subsystem (split out of js/render/glx.js). Frustum-culled chunked meshes for the heavy city/props geometry: one shared VBO/VAO with o… */
"use strict";

const GLXChunked = (function () {

  function init(core) {
    const gl = core.gl;
    const { bindVAO, setBlend, setDepthMask, toF32, createMesh, litMaterial } = core;
    const F = core.frame;

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
      const hasMat = mat != null;
      const hasTrk = trk != null;
      const fpv = 9 + (hasMat ? 1 : 0) + (hasTrk ? 3 : 0);
      const trkOff = 9 + (hasMat ? 1 : 0);
      let interleaved = new Float32Array(vCount * fpv);
      for (let i = 0; i < vCount; i++) {
        const o = i * fpv;
        interleaved[o  ]=pos[i*3  ]; interleaved[o+1]=pos[i*3+1]; interleaved[o+2]=pos[i*3+2];
        interleaved[o+3]=nrm[i*3  ]; interleaved[o+4]=nrm[i*3+1]; interleaved[o+5]=nrm[i*3+2];
        interleaved[o+6]=col[i*3  ]; interleaved[o+7]=col[i*3+1]; interleaved[o+8]=col[i*3+2];
        if (mat) interleaved[o+9]=mat[i];
        if (trk) {
          interleaved[o+trkOff  ] = trk[i*3  ];
          interleaved[o+trkOff+1] = trk[i*3+1];
          interleaved[o+trkOff+2] = trk[i*3+2];
        }
      }
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
      const stride = fpv * 4;
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride,  0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
      if (hasMat) { gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 36); }
      if (hasTrk) { gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 3, gl.FLOAT, false, stride, trkOff * 4); }
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
      const alpha = litMaterial(modelMat, opts);
      setDepthMask(true);
      setBlend(alpha < 1);
      bindVAO(mesh.vao);
      if (!mesh.chunks) { gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib); gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0); return; }
      _extractPlanes(F.viewProj, _fcPlanes);
      const chunks = mesh.chunks;
      const eye = F.eye;
      const cd = F.cullDist, cd2 = cd * cd,
            ex = eye ? eye[0] : 0, ey = eye ? eye[1] : 0, ez = eye ? eye[2] : 0;
      const perChunk = F.perChunkLights > 0 && F.allLights;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib);
      if (perChunk) {
        for (let i = 0; i < chunks.length; i++) {
          const ch = chunks[i];
          if (!_aabbInFrustum(_fcPlanes, ch.min, ch.max)) continue;
          if (cd > 0 && _aabbDist2(ch.min, ch.max, ex, ey, ez) > cd2) continue;
          // Keyed on the knob too: the cap inside _pickChunkLamps derives from
          // perChunkLights, so a slider move must invalidate — array identity
          // alone froze the first draw's cap for the life of the track.
          if (ch._lampIdx === undefined || ch._lampSrc !== F.allLights || ch._lampKnob !== F.perChunkLights) {
            ch._lampIdx = _pickChunkLamps(F.allLights, ch.min, ch.max);
            ch._lampSrc = F.allLights; ch._lampKnob = F.perChunkLights;
          }
          core.uploadLightSet(F.allLights, ch._lampIdx, ch._lampIdx.length,
                              F.lights, F.tailStart, F.tailCount);
          gl.drawElements(gl.TRIANGLES, ch.count, ch.indexType, ch.byteOffset);
        }
      } else {
        let runOff = -1, runCount = 0;
        for (let i = 0; i < chunks.length; i++) {
          const ch = chunks[i];
          const vis = _aabbInFrustum(_fcPlanes, ch.min, ch.max) &&
                      !(cd > 0 && _aabbDist2(ch.min, ch.max, ex, ey, ez) > cd2);
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
      if (perChunk) core.uploadLightSet(F.lights, null, F.lights ? (F.lights.length / 15) | 0 : 0);
    }

    // Nearest lamps whose radius actually reaches a chunk's AABB, closest first,
    // capped at 24 (was 48 — each chunk binds its own set and runs a full LIT
    // loop per draw). Runs ONCE per chunk (cached): lamps are baked
    // per track and chunk bounds never move, so this is build-time work paid
    // lazily on first draw, not a per-frame cull.
    function _pickChunkLamps(L, mn, mx) {
      const n = (L.length / 15) | 0, hits = [];
      for (let i = 0; i < n; i++) {
        const o = i * 15, rad = L[o + 6];
        if (!(rad > 0)) continue;
        const d2 = _aabbDist2(mn, mx, L[o], L[o + 1], L[o + 2]);
        if (d2 <= rad * rad) hits.push({ i, d2 });
      }
      hits.sort((a, b) => a.d2 - b.d2);
      const cap = (F.perChunkLights > 0 && F.perChunkLights < 1)
        ? Math.max(8, Math.round(24 * F.perChunkLights))
        : 24;
      const out = new Int32Array(Math.min(cap, hits.length));
      for (let k = 0; k < out.length; k++) out[k] = hits[k].i;
      return out;
    }

    function castShadowChunked(mesh, model) {
      const SH = core.shadow;
      if ((core.ctxGone && core.ctxGone()) || !SH.depthPassOn || !mesh) return;
      bindVAO(mesh.vao);
      gl.uniformMatrix4fv(SH.depthU.uModel, false, model);
      if (!mesh.chunks) { gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib); gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0); return; }
      _extractPlanes(SH.castCullVP || SH.lightVP, _fcPlanes);
      const chunks = mesh.chunks;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib);
      let runOff = -1, runCount = 0;
      for (let i = 0; i < chunks.length; i++) {
        const ch = chunks[i];
        if (_aabbInFrustum(_fcPlanes, ch.min, ch.max)) {
          if (runOff < 0) { runOff = ch.byteOffset; runCount = ch.count; }
          else runCount += ch.count;
        } else if (runOff >= 0) {
          gl.drawElements(gl.TRIANGLES, runCount, mesh.indexType, runOff);
          runOff = -1; runCount = 0;
        }
      }
      if (runOff >= 0) gl.drawElements(gl.TRIANGLES, runCount, mesh.indexType, runOff);
    }

    function freeChunkedMesh(mesh) {
      if (!mesh) return;
      core.unbindVAOIf(mesh.vao);
      if (mesh.ib) gl.deleteBuffer(mesh.ib);
      if (mesh.vbo) gl.deleteBuffer(mesh.vbo);
      if (mesh.vao) gl.deleteVertexArray(mesh.vao);
    }

    // Allocate a fresh plane set from a column-major view-proj. The draw path
    // uses the module-static _fcPlanes scratch and must keep doing so (it runs
    // per frame); this is for occasional callers — the agent world view asking
    // "which scenery chunks are actually on screen" — where one allocation is
    // free and sharing the scratch with an in-flight draw would be a bug.
    // Optional `out` (array of 6 Float32Array(4)) reuses a caller pool — the
    // race prop-batch path must never call the allocating form every frame.
    function makeFrustumPlanes(viewProj, out) {
      const p = out || [new Float32Array(4), new Float32Array(4), new Float32Array(4),
                        new Float32Array(4), new Float32Array(4), new Float32Array(4)];
      _extractPlanes(viewProj, p);
      return p;
    }

    Log.info("gfx", "GLX chunked init");
    return { createChunkedMesh, drawChunked, castShadowChunked, freeChunkedMesh,
             makeFrustumPlanes, aabbInFrustum: _aabbInFrustum, aabbDist2: _aabbDist2 };
  }

  return { init };
})();
