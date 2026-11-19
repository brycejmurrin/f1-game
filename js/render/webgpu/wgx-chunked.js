"use strict";

const WGXChunked = (function () {

  function init(core) {
    let _ciCursor = 0;
    let _ciSeg = new WeakMap();
    let _ciLive = 0;
    let _lm0 = 0, _lm1 = 0;
    const _lmGen = [0, 0];
    let _mrMaskL = null, _mrPass = null, _mrRoad = false;

    function _chunkFirstIndex(ch) {
      if (!ch) return 0;
      if (ch.firstIndex != null) return ch.firstIndex | 0;
      if (ch.byteOffset) {
        const bpi = ch.indexFormat === "uint32" ? 4 : 2;
        return (ch.byteOffset / bpi) | 0;
      }
      return 0;
    }
    function _chunkUploadFallback(data, indexFormat) {
      try {
        const m = core.createMesh(data);
        if (m) m.chunks = null;
        return m || {
          _wgx: "chunked", vbuf: null, sbuf: null, attrBG: null,
          chunks: [], count: 0, indexFormat,
        };
      } catch (e2) {
        core.allocFail("createChunkedMesh.fallback", e2);
        return {
          _wgx: "chunked", vbuf: null, sbuf: null, attrBG: null,
          chunks: [], count: 0, indexFormat,
        };
      }
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
          try { if (cv) cv.destroy(); } catch (_) {  }
          try { if (lut && lut.sbuf) lut.sbuf.destroy(); } catch (_) {  }
          core.allocFail("createChunkedMesh", e);
          return _chunkUploadFallback(data, b.indexFormat);
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
        vbuf = core.mkBuffer(b.vert, GPUBufferUsage.VERTEX);
        ibuf = core.mkBuffer(packed, GPUBufferUsage.INDEX);
        const a = core.attrOrZero(b.attr);
        sbuf = a.sbuf; attrBG = a.attrBG;
        for (let i = 0; i < chunks.length; i++) {
          chunks[i].ibuf = ibuf;
          chunks[i].sbuf = sbuf;
          chunks[i].attrBG = attrBG;
        }
      } catch (e) {
        try { if (vbuf) vbuf.destroy(); } catch (_) {  }
        try { if (ibuf) ibuf.destroy(); } catch (_) {  }
        try { if (sbuf) sbuf.destroy(); } catch (_) {  }
        core.allocFail("createChunkedMesh", e);
        return _chunkUploadFallback(data, indexFormat);
      }
      if (data._keepFullGeometry === false) data.nrm = data.col = data.mat = data.trk = null;
      if (!data._keepPositions) { data.pos = null; data.idx = null; }
      return { _wgx: "chunked", vbuf, ibuf, sbuf, attrBG, chunks, count: total, indexFormat };
    }
    function freeChunkedMesh(m) {
      if (!m) return;
      if (m.lutSbuf) {
        core.freeBuf(m.lutSbuf);
        if (m.lutAttrBG && m.lutAttrBG === core.roadLutBG) { core.setRoadLutBG(null); core.setRoadLutReady(false); }
        m.lutSbuf = null;
      }
      if (m.pieces) {
        for (const p of m.pieces) {
          if (p.vbuf && p.vbuf !== m.vbuf) core.freeBuf(p.vbuf);
          if (p.sbuf && p.sbuf !== m.sbuf) core.freeBuf(p.sbuf);
          if (p.ibuf && p.ibuf !== m.ibuf) core.freeBuf(p.ibuf);
        }
        m.pieces = null;
      }
      if (m.chunks && _ciSeg.has(m.chunks) && --_ciLive <= 0) { _ciLive = 0; _ciCursor = 0; }
      if (m.chunks) _ciSeg.delete(m.chunks);
      if (m.attrBG && m.attrBG === core.roadLutBG) { core.setRoadLutBG(null); core.setRoadLutReady(false); }
      core.freeBuf(m.vbuf);
      core.freeBuf(m.ibuf);
      core.freeBuf(m.sbuf);
      if (m.chunks) {
        for (let i = 0; i < m.chunks.length; i++) {
          const c = m.chunks[i];
          if (c.ibuf !== m.ibuf) core.freeBuf(c.ibuf);
          if (c.vbuf !== m.vbuf) core.freeBuf(c.vbuf);
          if (c.sbuf !== m.sbuf) core.freeBuf(c.sbuf);
        }
      }
    }
    const _lmCache = new WeakMap();
    const _mrRun = {
      active: false, vbuf: null, ibuf: null, attrBG: null,
      count: 0, first: 0, firstIndex: 0, indexFormat: null, m0: 0, m1: 0,
    };
    let _baseSlot = -1, _baseModel = null, _baseOpts = null;
    let _lastSlot = -1, _lastM0 = 0, _lastM1 = 0, _boundOff = -1, _pcTpl = -1;
    function _resetDrawState(model, o) {
      _baseSlot = -1; _lastSlot = -1; _lastM0 = 0; _lastM1 = 0; _boundOff = -1; _pcTpl = -1;
      _baseModel = model; _baseOpts = o;
    }
    function _bindOff(slot) {
      const off = slot * core.DRAW_STRIDE;
      if (_boundOff === off) return;
      core.dynOff[0] = off;
      core.litPass.setBindGroup(1, core.drawBindGroup, core.dynOff);
      _boundOff = off;
    }
    function _bindFreshSlot() {
      const s = core.allocDrawSlot();
      if (s < 0) return -1;
      core.writeDraw(s, _baseModel, _baseOpts);
      _baseSlot = s;
      _bindOff(s);
      return s;
    }
    function _mrFlush() {
      const run = _mrRun;
      if (!run.active) return;
      if (_mrMaskL) {
        const same = _lastSlot >= 0 && run.m0 === _lastM0 && run.m1 === _lastM1;
        let use = _lastSlot;
        if (!same) {
          let s2;
          if (_baseSlot < 0) {
            s2 = core.allocDrawSlot();
            if (s2 < 0) { run.active = false; return; }
            core.writeDraw(s2, _baseModel, _baseOpts);
            _baseSlot = s2;
          } else {
            s2 = core.allocDrawSlot();
            if (s2 < 0) { run.active = false; return; }
            const db = s2 * core.DRAW_F32_STRIDE, sb = _baseSlot * core.DRAW_F32_STRIDE;
            core.drawRing.copyWithin(db, sb, sb + 36);
            core.drawRing[db + 32] = 0; core.drawRing[db + 33] = 0; core.drawRing[db + 34] = 0;
          }
          const db = s2 * core.DRAW_F32_STRIDE;
          core.drawRing[db + 28] = run.m0;
          core.drawRing[db + 29] = run.m1;
          core.drawRing[db + 31] = 0;
          use = s2;
          _lastSlot = s2; _lastM0 = run.m0; _lastM1 = run.m1;
        }
        _bindOff(use);
      } else if (_baseSlot < 0) {
        if (_bindFreshSlot() < 0) { run.active = false; return; }
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
      core.setPipe(core.litPass, core.litPipeline(o));
      core.setBG0(core.litPass, core.activeFrameBG);
      _resetDrawState(model, o);
      if (!mesh.chunks) {
        if (_bindFreshSlot() < 0) return;
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
      const cull = !!core.frameViewProj;
      if (cull && !core.fcPlanesIsFrame) { Frustum.extractPlanes(core.frameViewProj, core.fcPlanes); core.fcPlanesIsFrame = true; }
      const cd = core.frameCullDist, cf = core.frameCullFog;
      const ex = core.frameEye ? core.frameEye[0] : 0, ey = core.frameEye ? core.frameEye[1] : 0, ez = core.frameEye ? core.frameEye[2] : 0;
      const chunks = mesh.chunks;
      const _perChunkOK = core.framePerChunk > 0 &&
        !(o.surfaceId === 16 && !core.frameRoadChunkLamps);
      if (_perChunkOK && core.frameAllLights && typeof LampChunks !== "undefined") {
        let seg = _ciSeg.get(chunks);
        const table = LampChunks.resolve(core.frameAllLights, chunks, core.framePerChunk);
        if (!seg || seg.table !== table) {
          if (!seg) _ciLive++;
          const need = table.concat.length;
          if (_ciCursor + need > core.CHUNK_IDX_CAP) {
            try { Log.warn("gfx", "WGX per-chunk lamp table overflow (" + (_ciCursor + need) + " > " + core.CHUNK_IDX_CAP + ") — mesh keeps the global set"); } catch (_) {  }
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
              if (!Frustum.aabbInFrustum(core.fcPlanes, ch.min, ch.max) ||
                  Frustum.radialCulled(ch.min, ch.max, ex, ey, ez, cd, cf)) continue;
            }
            const cslot = core.allocDrawSlot();
            if (cslot < 0) break;
            const cbase = cslot * core.DRAW_F32_STRIDE;
            if (_pcTpl < 0) {
              core.writeDraw(cslot, model, o);
              _pcTpl = cslot;
            } else {
              const sb = _pcTpl * core.DRAW_F32_STRIDE;
              core.drawRing.copyWithin(cbase, sb, sb + 36);
            }
            core.drawRing[cbase + 32] = seg.base + tbl.offsets[i];
            core.drawRing[cbase + 33] = tbl.counts[i];
            core.drawRing[cbase + 34] = 1;
            _bindOff(cslot);
            core.bindLitVerts(core.litPass, ch.vbuf || mesh.vbuf, core.identInstanceBuf, ch.attrBG || mesh.attrBG, o.surfaceId === 16);
            core.drawGeom(core.litPass, ch);
          }
          return;
        }
      }
      if (!cull) {
        if (_bindFreshSlot() < 0) return;
        for (let i = 0; i < chunks.length; i++) {
          const ch = chunks[i];
          core.bindLitVerts(core.litPass, ch.vbuf || mesh.vbuf, core.identInstanceBuf, ch.attrBG || mesh.attrBG, o.surfaceId === 16);
          core.drawGeom(core.litPass, ch);
        }
        return;
      }
      const maskL = core.frameNL > 8 ? core.frameLights : null, lp = core.lampPass;
      _mrMaskL = maskL; _mrPass = core.litPass; _mrRoad = o.surfaceId === 16;
      for (let i = 0; i < chunks.length; i++) {
        const ch = chunks[i];
        if (!Frustum.aabbInFrustum(core.fcPlanes, ch.min, ch.max) ||
            Frustum.radialCulled(ch.min, ch.max, ex, ey, ez, cd, cf)) {
          _mrFlush();
          continue;
        }
        if (maskL) {
          let cm = _lmCache.get(ch);
          if (!cm) _lmCache.set(ch, cm = { gen: [-1, -1], m0: [0, 0], m1: [0, 0] });
          if (cm.gen[lp] === _lmGen[lp]) {
            _lm0 = cm.m0[lp]; _lm1 = cm.m1[lp];
          } else {
            _chunkLampMask(ch.min, ch.max, maskL, core.frameNL);
            cm.gen[lp] = _lmGen[lp]; cm.m0[lp] = _lm0; cm.m1[lp] = _lm1;
          }
        }
        const vbuf = ch.vbuf || mesh.vbuf;
        const ibuf = ch.ibuf || mesh.ibuf || null;
        const attrBG = ch.attrBG || mesh.attrBG;
        const indexed = !!ibuf;
        const chFirst = indexed ? _chunkFirstIndex(ch) : (ch.first | 0);
        const vidDead = indexed || !!core.roadLutBG;
        const run = _mrRun;
        const nightOK = indexed || !maskL || (run.m0 === _lm0 && run.m1 === _lm1);
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
          run.first = ch.first | 0;
          run.firstIndex = _chunkFirstIndex(ch);
          run.indexFormat = ch.indexFormat || mesh.indexFormat;
          run.m0 = maskL ? _lm0 : core.LAMP_MASK_ALL;
          run.m1 = maskL ? _lm1 : core.LAMP_MASK_ALL;
        }
      }
      _mrFlush();
      _mrPass = null; _mrMaskL = null;
      _mrRun.vbuf = _mrRun.ibuf = _mrRun.attrBG = _mrRun.indexFormat = null;
    }
    function resetLampSeg() {
      _ciCursor = 0;
      _ciLive = 0;
      _ciSeg = new WeakMap();
    }
    function bumpLampGen(pass) { _lmGen[pass ? 1 : 0]++; }

    return {
      createChunkedMesh, freeChunkedMesh, drawChunked,
      chunkFirstIndex: _chunkFirstIndex,
      resetLampSeg, bumpLampGen,
      get lmGen() { return _lmGen[0]; },
      get lmGenMirror() { return _lmGen[1]; },
      get ciCursor() { return _ciCursor; },
      get ciSeg() { return _ciSeg; },
    };
  }

  return { init };
})();
Object.freeze(WGXChunked);
