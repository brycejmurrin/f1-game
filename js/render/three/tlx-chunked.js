"use strict";

(function () {

  const _fcPlanes = [new Float32Array(4), new Float32Array(4), new Float32Array(4),
                     new Float32Array(4), new Float32Array(4), new Float32Array(4)];

  const packOn = (function () {
    try { return localStorage.getItem("apex26.tlxPack") !== "0"; } catch (_) { return true; }
  })();
  const packStats = { on: packOn, small: 0, wide: 0, zero: 0, savedMB: 0,
    half: 0, wideBy: {}, wideMax: {}, wideLen: {},
    pad4On: null, pad4: 0, pad4MB: 0 };
  const _fb = new Float32Array(1), _ib = new Uint32Array(_fb.buffer);
  function _toHalf(v) {
    _fb[0] = v;
    const x = _ib[0], sign = (x >>> 16) & 0x8000;
    const exp = (x >>> 23) & 0xff;
    let man = x & 0x7fffff;
    if (exp === 255) return sign | 0x7c00 | (man ? 0x200 : 0);
    let e = exp - 112;
    if (e >= 31) return sign | 0x7c00;
    if (e <= 0) {
      if (e < -11) return sign;
      man |= 0x800000;
      const sh = 14 - e;
      const lsb = Math.pow(2, sh), half = lsb / 2;
      const rem = man % lsb;
      let out = Math.floor(man / lsb);
      if (rem > half || (rem === half && (out & 1))) out += 1;
      return sign | out;
    }
    const rem = man & 0x1fff;
    let h = man >>> 13;
    if (rem > 0x1000 || (rem === 0x1000 && (h & 1))) h += 1;
    if (h & 0x400) { h = 0; e += 1; if (e >= 31) return sign | 0x7c00; }
    return sign | (e << 10) | h;
  }
  let _zeroBuf = new Float32Array(0);
  function _zeros(len) {
    if (_zeroBuf.length < len) _zeroBuf = new Float32Array(len);
    return _zeroBuf.subarray(0, len);
  }
  const pad4On = (function () {
    try { return localStorage.getItem("apex26.tlxPad4") !== "0"; } catch (_) { return true; }
  })();
  packStats.pad4On = pad4On;
  function _fromHalf(h) {
    const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, m = h & 0x3ff;
    if (e === 0) return s * m * 5.960464477539063e-8;
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
    const pad = fmt24 === false && padding && (itemSize === 3 || itemSize === 1);
    const halfOk = fmt24 !== true;
    if (fmt24 && itemSize === 3 && ok && kind === "unit") {
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
      src = yield* pad4Steps(src, len); len = (len / 3) * 4; itemSize = 4;
    }
    if (fmt24 && itemSize !== 2 && itemSize !== 4) kind = null;
    if (!packing) {
      return new THREE.BufferAttribute(
        ok ? (src instanceof Float32Array ? src : (yield* f32Steps(src))) : new Float32Array(len),
        itemSize);
    }
    if (!ok) {
      packStats.zero++;
      packStats.savedMB += (len * 4) / 1048576;
      return new THREE.BufferAttribute(_zeros(len), itemSize);
    }
    let fits = kind != null;
    let finite = true;
    if (fits) {
      for (let i = 0; i < len; i++) {
          if ((i & 8191) === 0) yield;
        const v = src[i];
        if (!(v === v) || v === Infinity || v === -Infinity) { fits = false; finite = false; break; }
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
      if (halfOk && finite && THREE.Float16BufferAttribute && (kind === "unorm" || kind === "id")) {
        packStats.half++;
        const h = new Uint16Array(len);
        for (let i = 0; i < len; i++) { if ((i & 8191) === 0) yield; h[i] = _toHalf(src[i]); }
        packStats.savedMB += (len * 2) / 1048576;
        if (pad) return (yield* halfAttrSteps(THREE, h, itemSize, kind));
        return new THREE.Float16BufferAttribute(h, itemSize);
      }
      packStats.wide++;
      const f = src instanceof Float32Array ? src : (yield* f32Steps(src));
      return new THREE.BufferAttribute(f, itemSize);
    }
    packStats.small++;
    if (kind === "unit") {
      const wide = pad && itemSize === 3;
      const a = new Int16Array(wide ? (len / 3) * 4 : len);
      for (let i = 0; i < len; i++) {
          if ((i & 8191) === 0) yield;
        const q = Math.round(src[i] * 32767);
        a[wide ? i + ((i / 3) | 0) : i] = q < -32767 ? -32767 : q > 32767 ? 32767 : q;
      }
      packStats.savedMB += (len * 2) / 1048576;
      if (wide) {
        packStats.pad4++; packStats.pad4MB += ((len / 3) * 2) / 1048576;
        return new THREE.BufferAttribute(a, 4, true);
      }
      return new THREE.BufferAttribute(a, itemSize, true);
    }
    if (kind === "id") {
      if (!halfOk) {
        packStats.wide++;
        return new THREE.BufferAttribute(yield* f32Steps(src), itemSize);
      }
      packStats.half++;
      const h = new Uint16Array(len);
      for (let i = 0; i < len; i++) { if ((i & 8191) === 0) yield; h[i] = _toHalf(src[i]); }
      packStats.savedMB += (len * 2) / 1048576;
      if (pad) return (yield* halfAttrSteps(THREE, h, itemSize, kind));
      return new THREE.Float16BufferAttribute(h, itemSize);
    }
    const a = new Uint8Array(len);
    for (let i = 0; i < len; i++) { if ((i & 8191) === 0) yield; a[i] = Math.round(src[i] * 255); }
    packStats.savedMB += (len * 3) / 1048576;
    if (pad && itemSize === 3) return new THREE.BufferAttribute((yield* widen4Steps(a, 255)), 4, true);
    return new THREE.BufferAttribute(a, itemSize, true);
  }
  function packIndex(THREE, idx, vCount) {
    const attribute = new THREE.BufferAttribute(
      (!packOn || vCount > 65535) ? new Uint32Array(idx) : new Uint16Array(idx), 1);
    if (attribute.array instanceof Uint16Array) attribute.__apexUint16Index = true;
    return attribute;
  }

  class PreparedAttribute {
    constructor(array, itemSize, normalized) { Object.assign(this, { array, itemSize, normalized: !!normalized }); }
  }
  class PreparedHalfAttribute extends PreparedAttribute {
    constructor(array, itemSize) { super(array, itemSize); this.half = true; }
  }
  const AttributeTypes = { BufferAttribute: PreparedAttribute, Float16BufferAttribute: PreparedHalfAttribute };
  function chunkPrepareConfig(fmt24) {
    let merge = 3;
    try { const v = +localStorage.getItem("apex26.tlxChunkMerge"); if (v >= 1 && v <= 4) merge = v | 0; } catch (_) {  }
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
    if (releaseSource && data._keepFullGeometry === false) data.nrm = data.col = data.mat = data.trk = null;
    const buckets = yield* ChunkBins.binSteps(pos, srcIdx, cell);
    if (releaseSource && !data._keepPositions) data.pos = data.idx = null;
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
        if (!m) { m = { parts: [], cells: [], n: 0, mn: [Infinity, Infinity, Infinity], mx: [-Infinity, -Infinity, -Infinity], gx, gz }; merged.set(mk, m); }
        m.cells.push({ o: m.n, n: bk.idx.length, min: lampCells[lampCells.length - 1].min, max: lampCells[lampCells.length - 1].max });
        m.parts.push(bk.idx); m.n += bk.idx.length;
        for (let a = 0; a < 3; a++) { if (bk.mn[a] < m.mn[a]) m.mn[a] = bk.mn[a]; if (bk.mx[a] > m.mx[a]) m.mx[a] = bk.mx[a]; }
      }
      buckets.clear();
      for (const [mk, m] of merged) {
        const idx = new IndexArray(m.n);
        let o = 0;
        for (const part of m.parts) for (let i = 0; i < part.length; i++) { if ((i & 8191) === 0) yield; idx[o++] = part[i]; }
        buckets.set(mk, { idx, mn: m.mn, mx: m.mx, gx: m.gx, gz: m.gz, cells: m.cells.length > 1 ? m.cells : null });
      }
    }
    if (mergeK > 1) {
      const DUST = 48 * 3, GROUP = 384 * 3, MAXEXT = cell * mergeK * 7;
      const groupOf = new Map(), blocks = new Map();
      const wide = [];
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
          if (g.done) continue;
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
      const out = { idx, min: bk.mn, max: bk.mx, gx: bk.gx !== undefined ? bk.gx : ChunkBins.gxOf(key), gz: bk.gz !== undefined ? bk.gz : ChunkBins.gzOf(key) };
      if (bk.cells && idx === bk.idx) out.cells = bk.cells;
      chunks.push(out);
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
      const webgpu = fmt24();
      for (const [name, a] of Object.entries(prepared.attributes)) {
        if (a.half && webgpu) { attributes[name] = new THREE.BufferAttribute(Float32Array.from(a.array, _fromHalf), a.itemSize); continue; }
        attributes[name] = a.half ? new THREE.Float16BufferAttribute(a.array, a.itemSize)
          : new THREE.BufferAttribute(a.array, a.itemSize, a.normalized);
      }
      const made = [];
      const makeGeo = (idx, min, max) => {
        const geo = new THREE.BufferGeometry(); made.push(geo);
        for (const [name, attr] of Object.entries(attributes)) geo.setAttribute(name, attr);
        geo.setIndex(new THREE.BufferAttribute(idx, 1));
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
          return { geo, count: c.idx.length, min: c.min, max: c.max, gx: c.gx, gz: c.gz, cells: c.cells || null, wrap: { __tlx: true, geo } };
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

    const _visList = [];
    const _ic = new Int32Array(1024);
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
        const src = mesh.attrs || vis[0].geo;
        for (const k in src.attributes) g.setAttribute(k, src.attributes[k]);
      }
      let tot = mesh._tlxIdxTotal;
      if (!(tot > 0)) {
        tot = 0;
        for (let k = 0; k < mesh.chunks.length; k++) {
          const ch = mesh.chunks[k], ix = ch.geo && ch.geo.index;
          ch._tlxCi = k;
          if (ix) tot += ix.count;
        }
        mesh._tlxIdxTotal = tot;
      }
      let fresh = !s.arr || s.arr.length < cnt || s.arr.constructor !== Ctor, made = null;
      if (fresh) {
        const grow = s.arr && s.arr.constructor === Ctor ? s.arr.length : 0;
        const cap = Math.max(cnt, Math.min(tot, Math.ceil(Math.max(cnt, grow) * 1.5)));
        const old = g.index;
        s.arr = new Ctor(cap);
        const ia = made = new THREE.BufferAttribute(s.arr, 1);
        if (s.arr instanceof Uint16Array) ia.__apexUint16Index = true;
        g.setIndex(ia);
        if (old && ctx && ctx.releaseAttribute) ctx.releaseAttribute(old);
      }
      const dst = s.arr, res = s.res, rc = s.rc;
      let bi = 0, bj = 0, bl = 0, bc = 0, P = 0;
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
      const r2 = s.r2, c2 = s.c2;
      let m = 0, rb = start;
      if (bl > 0 && pre === 0) { rb = s.rb; for (let i = 0; i < bi; i++) { r2[m] = res[i]; c2[m++] = rc[i]; } }
      for (let i = 0; i < n; i++) { r2[m] = vis[i]; c2[m++] = ic[i]; }
      if (bl > 0 && post === 0) for (let i = bi + bl; i < s.rn; i++) { r2[m] = res[i]; c2[m++] = rc[i]; }
      s.res = r2; s.rc = c2; s.r2 = res; s.c2 = rc; s.rn = m; s.rb = rb; s.n = n;
      g.setDrawRange(start, cnt);
      const attr = g.index, ur = attr.updateRanges || (attr.updateRanges = []);
      if (attr !== made && (pre > 0 || fresh)) ur.push({ start, count: fresh ? cnt : pre });
      if (post > 0 && !fresh) ur.push({ start: end - post, count: post });
      if (ur.length > 4) {
        let a = Infinity, b = 0;
        for (const r of ur) { if (r.start < a) a = r.start; if (r.start + r.count > b) b = r.start + r.count; }
        ur.length = 0; ur.push({ start: a, count: b - a });
      }
      if (ur.length) attr.needsUpdate = true;
      const bs = g.boundingSphere, cx = (x0 + x1) * 0.5, cy = (y0 + y1) * 0.5, cz = (z0 + z1) * 0.5;
      const ct = bs.center || (bs.center = new THREE.Vector3());
      ct.x = cx; ct.y = cy; ct.z = cz;
      bs.radius = Math.hypot(x1 - cx, y1 - cy, z1 - cz) || 0;
      return g;
    }
    function fineCells(mesh) {
      if (!mesh || !mesh.chunks) return null;
      if (mesh._tlxFine !== undefined) return mesh._tlxFine;
      let any = false;
      const list = [];
      for (let i = 0; i < mesh.chunks.length; i++) {
        const ch = mesh.chunks[i], cs = ch.cells, ix = ch.geo && ch.geo.index;
        if (!cs || !ix || !ix.array || ix.array.length < ch.count) { list.push({ geo: ch.geo, count: ch.count, min: ch.min, max: ch.max }); continue; }
        any = true;
        for (let k = 0; k < cs.length; k++) {
          const c = cs[k], geo = new THREE.BufferGeometry();
          geo.setIndex(new THREE.BufferAttribute(ix.array.subarray(c.o, c.o + c.n), 1));
          list.push({ geo, count: c.n, min: c.min, max: c.max });
        }
      }
      return (mesh._tlxFine = any ? { chunks: list, _tlxMv: null, _tlxIdxTotal: 0, attrs: mesh.chunks[0].geo } : null);
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

    function releaseMirrors(mesh) {
      if (!mesh || !mesh.chunks || !mesh.chunks.length || mesh._mirrorsFreed) return;
      mesh._mirrorsFreed = true;
      if (ctx && ctx.isWebGPU && ctx.isWebGPU()) { mesh._mirrorsKept = true; return; }
      const atts = mesh.chunks[0].geo.attributes;
      for (const k in atts) if (atts[k]) { if (ctx && ctx.noteNulled) ctx.noteNulled(atts[k]); atts[k].array = null; }
    }

    function disposeShared(geos) {
      const attrs = new Set();
      for (const g of geos) {
        if (!g || !g.attributes) continue;
        for (const k in g.attributes) if (g.attributes[k]) attrs.add(g.attributes[k]);
      }
      for (const a of attrs) { try { if (typeof a.dispose === "function") a.dispose(); } catch (_) {  } }
      for (const g of geos) {
        if (!g) continue;
        if (g.attributes) { const names = Object.keys(g.attributes); for (let k = 0; k < names.length; k++) delete g.attributes[names[k]]; }
        try { g.dispose(); } catch (_) {  }
      }
      return attrs.size;
    }

    function free(mesh, freedGeos) {
      if (!mesh) return;
      const mark = (g) => { if (g && freedGeos) freedGeos.add(g); };
      const owned = [];
      const dropGeo = (g) => {
        if (!g) return;
        mark(g);
        releaseGeometry(g);
        if (!freedGeos) owned.push(g);
      };
      const fine = mesh._tlxFine;
      mesh._tlxFine = undefined;
      const mv = fine && fine._tlxMv ? (mesh._tlxMv || []).concat(fine._tlxMv) : mesh._tlxMv;
      if (fine) { fine._tlxMv = null; fine.chunks = null; fine.attrs = null; }
      if (mv) {
        mesh._tlxMv = null;
        for (let i = 0; i < mv.length; i++) {
          const g = mv[i] && mv[i].geo;
          if (!g) continue;
          dropGeo(g);
          mv[i].geo = null;
        }
      }
      _visList.length = 0;
      if (mesh.chunks) {
        for (let i = 0; i < mesh.chunks.length; i++) {
          const ch = mesh.chunks[i];
          if (ch.geo) { dropGeo(ch.geo); ch.geo = null; }
          if (ch.wrap) ch.wrap.geo = null;
        }
        mesh.chunks = null;
        mesh.geo = null;
      } else if (mesh.geo) { dropGeo(mesh.geo); mesh.geo = null; }
      if (owned.length) disposeShared(owned);
    }

    try { Log.info("gfx", "TLX chunked init"); } catch (_) {  }
    return { build, prepareConfig, cull, visList: _visList, releaseMirrors, free, disposeShared, mergeVisible, fineCells };
  }

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
  function mergeRuns(vis, n, maxRuns, runs) {
    for (let i = 1; i < n; i++) { const c = vis[i]; let j = i - 1; while (j >= 0 && vis[j].start > c.start) { vis[j + 1] = vis[j]; j--; } vis[j + 1] = c; }
    let r = 0;
    for (let i = 0; i < n; i++) {
      const c = vis[i];
      if (r && runs[2 * r - 2] + runs[2 * r - 1] === c.start) runs[2 * r - 1] += c.count;
      else { runs[2 * r] = c.start; runs[2 * r + 1] = c.count; r++; }
    }
    while (r > maxRuns) {
      let best = 1, gap = Infinity;
      for (let i = 1; i < r; i++) { const g = runs[2 * i] - (runs[2 * i - 2] + runs[2 * i - 1]); if (g < gap) { gap = g; best = i; } }
      runs[2 * best - 1] = runs[2 * best] + runs[2 * best + 1] - runs[2 * best - 2];
      for (let i = best; i < r - 1; i++) { runs[2 * i] = runs[2 * i + 2]; runs[2 * i + 1] = runs[2 * i + 3]; }
      r--;
    }
    return r;
  }

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

  window.TLXShaders = Object.assign(window.TLXShaders || {},
    { chunked, idleYield, chunkPrepareConfig, validPrepareConfig, samePrepareConfig, prepareChunks, prepareChunksSteps,
      makeFrustumPlanes: Frustum.makeFrustumPlanes,
      aabbInFrustum: Frustum.aabbInFrustum, aabbDist2: Frustum.aabbDist2,
      packAttr, packIndex, packStats, splitRanges, mergeRuns });
})();
