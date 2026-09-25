/* Apex 26 — WGX chunked-mesh subsystem (split out of js/render/webgpu/wgx.js).
 * Owns createChunkedMesh / freeChunkedMesh / drawChunked and the per-chunk
 * lamp segment allocator. Mirror of js/render/glx/chunked.js for WebGPU.
 * Must load before js/render/webgpu/wgx.js (wgx.js calls WGXChunked.init).
 */
"use strict";

const WGXChunked = (function () {

  function init(core) {
    let _ciCursor = 0;
    let _ciSeg = new WeakMap();
    let _lm0 = 0, _lm1 = 0, _lmGen = 0;
    let _mrMaskL = null, _mrSlot = 0, _mrPass = null, _mrRoad = false;

    function _chunkFirstIndex(ch) {
      if (!ch) return 0;
      if (ch.firstIndex != null) return ch.firstIndex | 0;
      if (ch.byteOffset) {
        const bpi = ch.indexFormat === "uint32" ? 4 : 2;
        return (ch.byteOffset / bpi) | 0;
      }
      return 0;
    }
    function createChunkedMesh(data, cellSize) {
      const cell = cellSize > 0 ? cellSize : 72;
      const pos = core.toF32(data.pos);
      const vCount = pos.length / 3, big = vCount > 65535;
      const srcIdx = data.idx;
      const triCount = (srcIdx.length / 3) | 0;
      if (triCount < 2000) { const m = core.createMesh(data); m.chunks = null; return m; }
      if (data.trk && data.trk.length >= vCount * 3) {
        const b = core.interleave(data);
        const pulled = core.expandPull(b.vert, b.attr, b.idx);
        const lut = core.makeRoadLUT(data.pos, data.trk, data.mat);
        const buckets = new Map();
        const pv = pulled.vert, VF = core.VERTEX_FLOATS;
        // Float view for the centroid reads (position is still float32 at word
        // 0), integer view for the gather copy below — see core.expandPull.
        const pvW = new Uint32Array(pv.buffer, pv.byteOffset, pv.length);
        for (let t = 0; t < pulled.count; t += 3) {
          const ao = t * VF, bo = (t + 1) * VF, co = (t + 2) * VF;
          const ax = pv[ao], ay = pv[ao + 1], az = pv[ao + 2];
          const bx = pv[bo], by = pv[bo + 1], bz = pv[bo + 2];
          const cx = pv[co], cy = pv[co + 1], cz = pv[co + 2];
          const gx = Math.floor(((ax + bx + cx) / 3) / cell) + 1024;
          const gz = Math.floor(((az + bz + cz) / 3) / cell) + 1024;
          const key = gx * 4096 + gz;
          let bk = buckets.get(key);
          if (!bk) { bk = { idx: [], mn: [Infinity, Infinity, Infinity], mx: [-Infinity, -Infinity, -Infinity] }; buckets.set(key, bk); }
          bk.idx.push(t, t + 1, t + 2);
          const mn = bk.mn, mx = bk.mx;
          if (ax<mn[0])mn[0]=ax; if (ax>mx[0])mx[0]=ax; if (ay<mn[1])mn[1]=ay; if (ay>mx[1])mx[1]=ay; if (az<mn[2])mn[2]=az; if (az>mx[2])mx[2]=az;
          if (bx<mn[0])mn[0]=bx; if (bx>mx[0])mx[0]=bx; if (by<mn[1])mn[1]=by; if (by>mx[1])mx[1]=by; if (bz<mn[2])mn[2]=bz; if (bz>mx[2])mx[2]=bz;
          if (cx<mn[0])mn[0]=cx; if (cx>mx[0])mx[0]=cx; if (cy<mn[1])mn[1]=cy; if (cy>mx[1])mx[1]=cy; if (cz<mn[2])mn[2]=cz; if (cz>mx[2])mx[2]=cz;
        }
        const PIECE = 4095;
        const chunks = [];
        // ONE vertex buffer for the whole ribbon, chunks are (first, count)
        // ranges into it — GLX has always done this (glx/chunked.js) and it is
        // what lets drawChunked's run merge fire for the road at all: the merge
        // test is keyed on buffer IDENTITY, so per-piece buffers made it dead
        // code. Size is exact: every bk.idx length and PIECE are multiples of
        // 3, so `n -= n % 3` never trims and the pieces sum to pulled.count.
        // Pieces are still staged one at a time (<=147 KB each) through
        // queue.writeBuffer at a byte offset — never mappedAtCreation, and
        // never one big CPU copy: bounded staging is what fixed the mappable
        // pool exhaustion, and the peak here matches the per-piece shape.
        let cv = null;
        try {
          cv = core.device.createBuffer({
            size: pulled.count * VF * 4,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
          });
          let first = 0;
          buckets.forEach((bk) => {
            const nAll = bk.idx.length;
            for (let off = 0; off < nAll; off += PIECE) {
              let n = Math.min(PIECE, nAll - off);
              n -= n % 3;
              if (n <= 0) continue;
              const vertBuf = new ArrayBuffer(n * core.VERTEX_STRIDE);
              const vert = new Float32Array(vertBuf);
              const vertW = new Uint32Array(vertBuf);
              for (let j = 0; j < n; j++) {
                const src = bk.idx[off + j] * VF;
                for (let k = 0; k < VF; k++) vertW[j * VF + k] = pvW[src + k];
              }
              core.device.queue.writeBuffer(cv, first * VF * 4, vert);
              chunks.push({
                vbuf: cv, ibuf: null, first, count: n, min: bk.mn, max: bk.mx,
                sbuf: lut.sbuf, attrBG: lut.attrBG,
              });
              first += n;
            }
          });
        } catch (e) {
          try { if (cv) cv.destroy(); } catch (_) { /* already invalid */ }
          try { if (lut && lut.sbuf) lut.sbuf.destroy(); } catch (_) { /* already invalid */ }
          core.allocFail("createChunkedMesh", e);
          return { _wgx: "chunked", vbuf: null, ibuf: null, sbuf: null, attrBG: null, chunks: [], count: 0, indexFormat: b.indexFormat };
        }
        if (lut) core.rememberRoadLut(lut);
        if (data._keepFullGeometry === false) data.nrm = data.col = data.mat = data.trk = null;
        if (!data._keepPositions) { data.pos = null; data.idx = null; }
        const head = chunks[0] || { vbuf: null, sbuf: null, attrBG: null, count: 0 };
        return {
          _wgx: "chunked", vbuf: head.vbuf, ibuf: null,
          sbuf: lut.sbuf, attrBG: lut.attrBG, chunks,
          count: head.count, indexFormat: b.indexFormat,
        };
      }
      const b = core.interleave(data);
      const IndexArray = big ? Uint32Array : Uint16Array;
      const indexFormat = big ? "uint32" : "uint16";
      const BPI = big ? 4 : 2;
      let vbuf = null, sbuf = null, attrBG = null, ibuf = null;
      try {
        vbuf = core.mkBuffer(b.vert, GPUBufferUsage.VERTEX);
      } catch (e) {
        try { if (vbuf) vbuf.destroy(); } catch (_) { /* already invalid */ }
        core.allocFail("createChunkedMesh", e);
        return { _wgx: "chunked", vbuf: null, sbuf: null, attrBG: null, chunks: [], count: 0, indexFormat };
      }
      const buckets = new Map();
      for (let t = 0; t < srcIdx.length; t += 3) {
        const a = srcIdx[t], bi = srcIdx[t+1], c = srcIdx[t+2];
        const ax=pos[a*3],ay=pos[a*3+1],az=pos[a*3+2], bx=pos[bi*3],by=pos[bi*3+1],bz=pos[bi*3+2],
              cx=pos[c*3],cy=pos[c*3+1],cz=pos[c*3+2];
        const gx = Math.floor(((ax+bx+cx)/3)/cell) + 1024;
        const gz = Math.floor(((az+bz+cz)/3)/cell) + 1024;
        const key = gx * 4096 + gz;
        let bk = buckets.get(key);
        if (!bk) { bk = { idx: [], mn: [Infinity,Infinity,Infinity], mx: [-Infinity,-Infinity,-Infinity] }; buckets.set(key, bk); }
        bk.idx.push(a, bi, c);
        const mn = bk.mn, mx = bk.mx;
        if (ax<mn[0])mn[0]=ax; if (ax>mx[0])mx[0]=ax; if (ay<mn[1])mn[1]=ay; if (ay>mx[1])mx[1]=ay; if (az<mn[2])mn[2]=az; if (az>mx[2])mx[2]=az;
        if (bx<mn[0])mn[0]=bx; if (bx>mx[0])mx[0]=bx; if (by<mn[1])mn[1]=by; if (by>mx[1])mx[1]=by; if (bz<mn[2])mn[2]=bz; if (bz>mx[2])mx[2]=bz;
        if (cx<mn[0])mn[0]=cx; if (cx>mx[0])mx[0]=cx; if (cy<mn[1])mn[1]=cy; if (cy>mx[1])mx[1]=cy; if (cz<mn[2])mn[2]=cz; if (cz>mx[2])mx[2]=cz;
      }
      let total = 0;
      buckets.forEach((bk) => { total += bk.idx.length; });
      const packed = new IndexArray(total);
      const chunks = [];
      let off = 0;
      buckets.forEach((bk) => {
        const src = bk.idx;
        for (let i = 0; i < src.length; i++) packed[off + i] = src[i];
        chunks.push({
          firstIndex: off, byteOffset: off * BPI, count: src.length,
          indexFormat, min: bk.mn, max: bk.mx,
        });
        off += src.length;
        bk.idx = null;
      });
      try {
        ibuf = core.mkBuffer(packed, GPUBufferUsage.INDEX);
        const a = core.attrOrZero(b.attr);
        sbuf = a.sbuf; attrBG = a.attrBG;
        for (let i = 0; i < chunks.length; i++) {
          chunks[i].ibuf = ibuf;
          chunks[i].sbuf = sbuf;
          chunks[i].attrBG = attrBG;
        }
      } catch (e) {
        // Partial chunk set under memory pressure: release everything — a
        // half-uploaded prop mesh must not pin buffers on a struggling core.device.
        try { vbuf.destroy(); } catch (_) { /* already invalid */ }
        try { if (ibuf) ibuf.destroy(); } catch (_) { /* already invalid */ }
        try { if (sbuf) sbuf.destroy(); } catch (_) { /* already invalid */ }
        core.allocFail("createChunkedMesh", e);
        return { _wgx: "chunked", vbuf: null, sbuf: null, attrBG: null, chunks: [], count: 0, indexFormat };
      }
      // Release only after the complete chunk upload succeeds. A failed upload
      // can then fall back to core.createMesh without finding its source nulled.
      if (data._keepFullGeometry === false) data.nrm = data.col = data.mat = data.trk = null;
      if (!data._keepPositions) { data.pos = null; data.idx = null; }
      return { _wgx: "chunked", vbuf, ibuf, sbuf, attrBG, chunks, count: total, indexFormat };
    }
    function freeChunkedMesh(m) {
      if (!m) return;
      // Drop the lamp-table segment (and any overflow sentinel) keyed on this
      // chunks array — a rebuilt mesh must re-resolve, not inherit stale state.
      if (m.chunks) _ciSeg.delete(m.chunks);
      // ROAD-LUT OWNER, the chunked twin of the freeMesh() clear below. The
      // chunked road path returns `sbuf: lut.sbuf, attrBG: lut.attrBG` (see
      // createChunkedMesh) after core.rememberRoadLut() has parked that same bind
      // group in the global — so the m.sbuf.destroy() on the next line frees
      // the buffer core.roadLutBG is built over. Without this clear, draw()'s
      // `core.roadLutBG || attrBG || zeroAttrBG` keeps binding a bind group whose
      // buffer is gone: a per-draw validation error, and `vidDead` in the
      // shadow path silently changes meaning too.
      // REACHABLE ON EVERY TRACK SWITCH — game.js frees track.meshes.roadChunked
      // on teardown, and the replacement build is ASYNC (seconds), so frames
      // render in the gap. If the next road never produces a LUT the stale
      // pointer never gets overwritten at all.
      if (m.attrBG && m.attrBG === core.roadLutBG) { core.setRoadLutBG(null); core.setRoadLutReady(false); }
      if (m.vbuf) m.vbuf.destroy();
      if (m.ibuf) m.ibuf.destroy();
      if (m.sbuf) m.sbuf.destroy();
      // The `!== m.vbuf` guards below now skip EVERY road chunk, not just the
      // head: the ribbon shares one buffer, which the m.vbuf.destroy() above
      // already freed. Still exactly one destroy per buffer, but the guard's
      // meaning changed with the shared buffer — do not read it as "skip the
      // head". Meshes that really do own per-chunk buffers still free here.
      if (m.chunks) {
        for (let i = 0; i < m.chunks.length; i++) {
          const c = m.chunks[i];
          try { if (c.ibuf && c.ibuf !== m.ibuf) c.ibuf.destroy(); } catch (_) { /* already destroyed */ }
          try { if (c.vbuf && c.vbuf !== m.vbuf) c.vbuf.destroy(); } catch (_) { /* already destroyed */ }
          try { if (c.sbuf && c.sbuf !== m.sbuf) c.sbuf.destroy(); } catch (_) { /* already destroyed */ }
        }
      }
    }
    const _lmCache = new WeakMap();
    const _mrRun = {
      active: false, vbuf: null, ibuf: null, attrBG: null,
      count: 0, first: 0, firstIndex: 0, indexFormat: null, m0: 0, m1: 0,
    };
    function _mrFlush() {
      const run = _mrRun;
      if (!run.active) return;
      if (_mrMaskL) {
        const s2 = core.allocDrawSlot();
        const use = s2 >= 0 ? s2 : _mrSlot;
        if (s2 >= 0) {
          const db = s2 * core.DRAW_F32_STRIDE, sb = _mrSlot * core.DRAW_F32_STRIDE;
          core.drawRing.copyWithin(db, sb, sb + 28);
          core.drawRing[db + 28] = run.m0;
          core.drawRing[db + 29] = run.m1;
          // The copy stops at lane 28, so clear the relocated lampRange
          // lanes explicitly — ring slots are reused and a stale
          // lampRange.z=1 from a per-chunk frame would reroute the shader.
          core.drawRing[db + 32] = 0; core.drawRing[db + 33] = 0; core.drawRing[db + 34] = 0;
        }
        core.dynOff[0] = use * core.DRAW_STRIDE;
        _mrPass.setBindGroup(1, core.drawBindGroup, core.dynOff);
      }
      core.bindLitVerts(_mrPass, run.vbuf, core.identInstanceBuf, run.attrBG, _mrRoad);
      core.drawGeom(_mrPass, run);
      run.active = false;
    }
    function _chunkLampMask(mn, mx, L, n) {
      let m0 = 0, m1 = 0;
      for (let i = 0; i < n; i++) {
        const o = i * 15, rad = L[o + 6];
        if (rad > 0 && Frustum.aabbDist2(mn, mx, L[o], L[o + 1], L[o + 2]) <= rad * rad) {
          if (i < 24) m0 |= (1 << i); else m1 |= (1 << (i - 24));
        }
      }
      _lm0 = m0; _lm1 = m1;
    }
    function drawChunked(mesh, model, opts) {
      if (!core.litPass || !mesh || !mesh.vbuf) return;
      const o = core.litOpts(opts);
      const slot = core.allocDrawSlot();
      if (slot < 0) return;   // allocDrawSlot: -1 once the pass's MAX_DRAWS is spent
      core.writeDraw(slot, model, o);
      core.setPipe(core.litPass, core.litPipeline(o));
      core.setBG0(core.litPass, core.activeFrameBG);
      core.dynOff[0] = slot * core.DRAW_STRIDE;
      core.litPass.setBindGroup(1, core.drawBindGroup, core.dynOff);
      if (!mesh.chunks) {
        // hasTrk roads are core.createMesh pieces (chunks=null). Drawing only
        // mesh.vbuf here left 4095 verts — the rest of the ribbon vanished
        // and terrain showed through (chopped asphalt).
        if (mesh.pieces) {
          for (let i = 0; i < mesh.pieces.length; i++) {
            const p = mesh.pieces[i];
            core.bindLitVerts(core.litPass, p.vbuf, core.identInstanceBuf, p.attrBG, o.surfaceId === 16);
            core.drawGeom(core.litPass, p);
          }
          return;
        }
        core.bindLitVerts(core.litPass, mesh.vbuf, core.identInstanceBuf, mesh.attrBG, o.surfaceId === 16);
        core.drawGeom(core.litPass, mesh);
        return;
      }
      // Road (surfaceId 16) uses the same frustum + radial cull as terrain.
      // The skip existed because a WebGPU z>=0 extract on the raw GL VP hid
      // chase/park chunks; near is now GL clip w+z (see Frustum.extractPlanes) so
      // the exemption was leftover work — env-probe 300 m was thrown away.
      const cull = !!core.frameViewProj;
      // core.fcPlanes is scratch shared with the shadow extracts below; the flag
      // says it currently holds THIS frame's camera planes. Terrain, road,
      // props, glass and water each re-derived the same six planes per frame.
      if (cull && !core.fcPlanesIsFrame) { Frustum.extractPlanes(core.frameViewProj, core.fcPlanes); core.fcPlanesIsFrame = true; }
      const cd = core.frameCullDist, cd2 = cd * cd;
      const ex = core.frameEye ? core.frameEye[0] : 0, ey = core.frameEye ? core.frameEye[1] : 0, ez = core.frameEye ? core.frameEye[2] : 0;
      const chunks = mesh.chunks;
      // Per-chunk lamps: one DrawU slot per visible chunk carrying that chunk's
      // (offset, count) slice of the baked core.chunkIdxSBO table. The adjacent-run
      // merge is deliberately forfeited here — adjacent chunks almost never
      // share an index list, exactly as GLX gives up its merged drawElements
      // runs in this mode; core.MAX_DRAWS 4096 has ample headroom (~150 visible
      // chunks measured worst-case).
      // That sentence was load-bearing and unmeasured; it is measured now, and
      // it holds: 3 shared non-empty adjacent pairs of 909, 0 of 195
      // (tools/gfx/chunk-share-census.mjs). Empty chunks DO share constantly and
      // still do not merge — they are outfield the frustum never draws, ~2
      // visible a frame. Two audits have proposed this merge; both numbers and
      // the trap are in docs/PERF-FINDINGS.md §2b. Do not re-open it.
      // Table segments append per chunks-array;
      // a bake-generation move (_writeFrame) resets the allocator.
      // This branch sits ABOVE the !cull fast path: a frame without a
      // viewProj (menu orbit, headless) must still light per-chunk when the
      // mode is on — it just draws every chunk instead of the visible ones.
      // The ROAD (surfaceId 16) only takes per-chunk lamp SETS when PER-CHUNK
      // ROAD asks for it — it is chunked on most devices for the cull alone.
      // The AABB lamp-mask path below is unaffected: that is an output-
      // preserving cull, not a change of which lamps light the road.
      const _perChunkOK = core.framePerChunk > 0 &&
        !(o.surfaceId === 16 && !core.frameRoadChunkLamps);
      if (_perChunkOK && core.frameAllLights && typeof LampChunks !== "undefined") {
        let seg = _ciSeg.get(chunks);
        const table = LampChunks.resolve(core.frameAllLights, chunks, core.framePerChunk);
        if (!seg || seg.table !== table) {
          const need = table.concat.length;
          if (_ciCursor + need > core.CHUNK_IDX_CAP) {
            // Overflow (extreme lampDensity): warn ONCE per table — the
            // sentinel (base -1) is remembered so the next frame neither
            // re-warns nor re-attempts the write; the mesh falls through to
            // the global-set merge path below until the bake regenerates.
            try { Log.warn("gfx", "WGX per-chunk lamp table overflow (" + (_ciCursor + need) + " > " + core.CHUNK_IDX_CAP + ") — mesh keeps the global set"); } catch (_) { /* harness */ }
            seg = { base: -1, table };
            _ciSeg.set(chunks, seg);
          } else {
            if (need > 0) core.device.queue.writeBuffer(core.chunkIdxSBO, _ciCursor * 4, table.concat);
            seg = { base: _ciCursor, table };
            _ciSeg.set(chunks, seg);
            _ciCursor += need;
          }
        }
        if (seg.base >= 0) {
          const tbl = seg.table;
          for (let i = 0; i < chunks.length; i++) {
            const ch = chunks[i];
            if (cull) {
              const dist2 = Frustum.aabbDist2(ch.min, ch.max, ex, ey, ez);
              if (!Frustum.aabbInFrustum(core.fcPlanes, ch.min, ch.max) || (cd > 0 && dist2 > cd2)) continue;
            }
            const cslot = core.allocDrawSlot();
            if (cslot < 0) break;
            core.writeDraw(cslot, model, o);
            const cbase = cslot * core.DRAW_F32_STRIDE;
            // lampRange lives at lanes 32-34 (lanes 28-29 are the lamp masks).
            core.drawRing[cbase + 32] = seg.base + tbl.offsets[i];
            core.drawRing[cbase + 33] = tbl.counts[i];
            core.drawRing[cbase + 34] = 1;
            core.dynOff[0] = cslot * core.DRAW_STRIDE;
            core.litPass.setBindGroup(1, core.drawBindGroup, core.dynOff);
            core.bindLitVerts(core.litPass, ch.vbuf || mesh.vbuf, core.identInstanceBuf, ch.attrBG || mesh.attrBG, o.surfaceId === 16);
            core.drawGeom(core.litPass, ch);
          }
          return;
        }
      }
      if (!cull) {
        for (let i = 0; i < chunks.length; i++) {
          const ch = chunks[i];
          core.bindLitVerts(core.litPass, ch.vbuf || mesh.vbuf, core.identInstanceBuf, ch.attrBG || mesh.attrBG, o.surfaceId === 16);
          core.drawGeom(core.litPass, ch);
        }
        return;
      }
      // Merge runs of adjacent visible chunks that share vbuf/ibuf/attrBG.
      // Map insertion order is IBO order, so summing count from the run's
      // first firstIndex submits the same triangles as the per-chunk loop.
      //
      // Chunk-AABB lamp cull: with a night light set bound, each run gets its
      // OWN draw slot whose mask has a bit only for lights whose radius
      // reaches some chunk of the run — bit-exact vs the shader's radius
      // reject (see the WGSL lamp loop), it just skips the distance math for
      // lights that cannot touch this geometry. The set is re-ranked as the
      // player moves, so masks are computed per call (visible chunks × nL
      // cheap AABB tests); small sets skip the machinery — the reject is
      // already cheap. Run overflow rebinds the base slot (all-ones mask).
      const maskL = core.frameNL > 8 ? core.frameLights : null;
      _mrMaskL = maskL; _mrSlot = slot; _mrPass = core.litPass; _mrRoad = o.surfaceId === 16;
      for (let i = 0; i < chunks.length; i++) {
        const ch = chunks[i];
        const dist2 = Frustum.aabbDist2(ch.min, ch.max, ex, ey, ez);
        if (!Frustum.aabbInFrustum(core.fcPlanes, ch.min, ch.max) || (cd > 0 && dist2 > cd2)) {
          _mrFlush();
          continue;
        }
        if (maskL) {
          // Generation-keyed cache (the LampChunks WeakMap shape): the ranked
          // set is stable for many frames at a time — while _lmGen holds, the
          // chunk's mask is a lookup, not nL AABB tests.
          let cm = _lmCache.get(ch);
          if (cm && cm.gen === _lmGen) {
            _lm0 = cm.m0; _lm1 = cm.m1;
          } else {
            _chunkLampMask(ch.min, ch.max, maskL, core.frameNL);
            if (cm) { cm.gen = _lmGen; cm.m0 = _lm0; cm.m1 = _lm1; }
            else _lmCache.set(ch, { gen: _lmGen, m0: _lm0, m1: _lm1 });
          }
        }
        const vbuf = ch.vbuf || mesh.vbuf;
        const ibuf = ch.ibuf || mesh.ibuf || null;
        const attrBG = ch.attrBG || mesh.attrBG;
        // Merge only what is provably safe to merge:
        //  - contiguous: the next run vertex/index is exactly this chunk's
        //    first. Emission order already guarantees it (write order ==
        //    push order == bucket first-touch == arc order, and a culled
        //    chunk flushes above), so this term never rejects a merge that
        //    used to happen — it makes the merge provable instead of
        //    order-dependent, and is a no-op on the indexed path, which packs
        //    firstIndex monotonically.
        //  - vertex_index is dead: a merged run is a large non-indexed draw,
        //    the exact shape the PIECE=4095 split exists to avoid. Indexed
        //    draws take vid from the index value (order-independent); the road
        //    binds the world LUT (magic 12345), so its WGSL reads
        //    trkFromWorld(wpos), never matTrkArr[vid]. If no LUT is bound the
        //    authored storage read is live and merging could shift it, so the
        //    merge refuses rather than relying on the argument holding.
        //    Evidence for the shapes themselves: docs/archive/tools/gfx/wgx-vid-repro.mjs.
        //  - no lamp mask, ROAD ONLY: a run ORs its chunks' masks, so merging
        //    the ribbon at night would hand a long run the UNION and turn
        //    cheap mask-skips back into full lamp evaluations over the road's
        //    large screen coverage. The road stands down at night and keeps
        //    one draw per chunk (still winning the setVertexBuffer elision,
        //    the buffer is shared). Indexed meshes — terrain, props, glass —
        //    keep merging exactly as they do today: union masks there are
        //    pre-existing behaviour, and narrowing them is a separate change
        //    with its own measurement, not a rider on this one.
        const indexed = !!ibuf;
        const chFirst = indexed ? _chunkFirstIndex(ch) : (ch.first | 0);
        const vidDead = indexed || !!core.roadLutBG;
        const nightOK = indexed || !maskL;
        // Pooled bag (see _mrRun): `run.active` is what `run &&` used to be.
        const run = _mrRun;
        const contig = run.active && (indexed ? run.firstIndex : (run.first | 0)) + run.count === chFirst;
        if (run.active && run.vbuf === vbuf && run.ibuf === ibuf && run.attrBG === attrBG
            && contig && vidDead && nightOK) {
          run.count += ch.count;
          if (maskL) { run.m0 |= _lm0; run.m1 |= _lm1; }
        } else {
          _mrFlush();
          run.active = true;
          run.vbuf = vbuf; run.ibuf = ibuf; run.attrBG = attrBG;
          run.count = ch.count;
          // `first` IS LOAD-BEARING: core.drawGeom draws pass.draw(count, 1,
          // mesh.first | 0) on the non-indexed path, so a pooled bag without
          // it would send every road run from vertex 0. No unit test can see
          // that (the core.device is a mock) — only real pixels can.
          run.first = ch.first | 0;
          run.firstIndex = _chunkFirstIndex(ch);
          run.indexFormat = ch.indexFormat || mesh.indexFormat;
          run.m0 = maskL ? _lm0 : core.LAMP_MASK_ALL;
          run.m1 = maskL ? _lm1 : core.LAMP_MASK_ALL;
        }
      }
      _mrFlush();
      // Release the GPU-object refs — the bag survives between calls.
      _mrPass = null; _mrMaskL = null;
      _mrRun.vbuf = _mrRun.ibuf = _mrRun.attrBG = _mrRun.indexFormat = null;
    }
    function resetLampSeg() {
      _ciCursor = 0;
      _ciSeg = new WeakMap();
    }
    function bumpLampGen() { _lmGen++; }

    return {
      createChunkedMesh, freeChunkedMesh, drawChunked,
      chunkFirstIndex: _chunkFirstIndex,
      resetLampSeg, bumpLampGen,
      get lmGen() { return _lmGen; },
      get ciCursor() { return _ciCursor; },
      get ciSeg() { return _ciSeg; },
    };
  }

  return { init };
})();
Object.freeze(WGXChunked);
