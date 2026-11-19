"use strict";

const LampChunks = (function () {

  const CAP = LightBudget.CHUNK;

  function capFor(knob) {
    return (knob > 0 && knob < 1) ? Math.max(8, Math.round(CAP * knob)) : CAP;
  }

  function buildTable(lights, chunks, knob) {
    const cap = capFor(knob), n = (lights.length / 15) | 0, nc = chunks.length;
    const lists = new Array(nc);
    const live = new Int32Array(n), pack = new Float64Array(n * 4);
    let nLive = 0;
    for (let i = 0; i < n; i++) {
      const o = i * 15, rad = lights[o + 6];
      if (!(rad > 0)) continue;
      const k = nLive * 4;
      pack[k] = lights[o]; pack[k + 1] = lights[o + 1]; pack[k + 2] = lights[o + 2]; pack[k + 3] = rad;
      live[nLive++] = i;
    }
    const idx = new Int32Array(cap), dist = new Float64Array(cap);
    const worse = (a, b) => dist[a] > dist[b] || (dist[a] === dist[b] && idx[a] > idx[b]);
    const swap = (a, b) => { const i = idx[a], d = dist[a]; idx[a] = idx[b]; dist[a] = dist[b]; idx[b] = i; dist[b] = d; };
    const sink = (size) => {
      let p = 0;
      for (;;) {
        const l = p * 2 + 1, r = l + 1;
        let w = p;
        if (l < size && worse(l, w)) w = l;
        if (r < size && worse(r, w)) w = r;
        if (w === p) break;
        swap(p, w); p = w;
      }
    };
    let total = 0;
    for (let c = 0; c < nc; c++) {
      const ch = chunks[c];
      let m = 0;
      for (let j = 0; j < nLive; j++) {
        const k = j * 4, rad = pack[k + 3];
        const d2 = Frustum.aabbDist2(ch.min, ch.max, pack[k], pack[k + 1], pack[k + 2]);
        if (!(d2 <= rad * rad)) continue;
        const i = live[j];
        if (m < cap) {
          let p = m++;
          idx[p] = i; dist[p] = d2;
          while (p > 0) {
            const up = (p - 1) >> 1;
            if (!worse(p, up)) break;
            swap(p, up); p = up;
          }
        } else if (d2 < dist[0]) {
          idx[0] = i; dist[0] = d2; sink(m);
        }
      }
      for (let end = m - 1; end > 0; end--) { swap(0, end); sink(end); }
      const li = new Int32Array(m);
      for (let k = 0; k < m; k++) li[k] = idx[k];
      lists[c] = li; total += m;
    }
    const concat = new Uint32Array(total);
    const offsets = new Uint32Array(nc), counts = new Uint32Array(nc);
    let off = 0;
    for (let c = 0; c < nc; c++) {
      offsets[c] = off; counts[c] = lists[c].length;
      concat.set(lists[c], off); off += lists[c].length;
    }
    return { lists, concat, offsets, counts, cap };
  }

  function _reCap(full, cap) {
    const nc = full.lists.length, lists = new Array(nc);
    let total = 0;
    for (let c = 0; c < nc; c++) {
      const src = full.lists[c], m = Math.min(cap, src.length);
      lists[c] = m === src.length ? src : src.slice(0, m);
      total += m;
    }
    const concat = new Uint32Array(total);
    const offsets = new Uint32Array(nc), counts = new Uint32Array(nc);
    let off = 0;
    for (let c = 0; c < nc; c++) {
      offsets[c] = off; counts[c] = lists[c].length;
      concat.set(lists[c], off); off += lists[c].length;
    }
    return { lists, concat, offsets, counts, cap };
  }

  const _cache = new WeakMap();
  function _snap(lights) {
    const n = (lights.length / 15) | 0, s = new Float64Array(n * 4);
    for (let i = 0, o = 0, k = 0; i < n; i++, o += 15, k += 4) {
      s[k] = lights[o]; s[k + 1] = lights[o + 1]; s[k + 2] = lights[o + 2]; s[k + 3] = lights[o + 6];
    }
    return s;
  }
  function _moved(s, lights) {
    const n = (lights.length / 15) | 0;
    if (s.length !== n * 4) return true;
    for (let i = 0, o = 0, k = 0; i < n; i++, o += 15, k += 4) {
      const x = lights[o], y = lights[o + 1], z = lights[o + 2], r = lights[o + 6];
      if ((s[k] !== x && (x === x || s[k] === s[k])) || (s[k + 1] !== y && (y === y || s[k + 1] === s[k + 1])) ||
          (s[k + 2] !== z && (z === z || s[k + 2] === s[k + 2])) || (s[k + 3] !== r && (r === r || s[k + 3] === s[k + 3]))) return true;
    }
    return false;
  }
  function resolve(lights, chunks, knob) {
    const cap = capFor(knob);
    let e = _cache.get(chunks);
    if (!e || e.src !== lights || _moved(e.snap, lights)) {
      const full = buildTable(lights, chunks, CAP);
      e = { src: lights, snap: _snap(lights), full, cap: CAP, table: full };
      _cache.set(chunks, e);
    }
    if (e.cap !== cap) { e.table = cap === CAP ? e.full : _reCap(e.full, cap); e.cap = cap; }
    return e.table;
  }

  function buildGrid(table, chunks) {
    const nc = chunks.length;
    let gx0 = Infinity, gz0 = Infinity, gx1 = -Infinity, gz1 = -Infinity;
    for (let c = 0; c < nc; c++) {
      const ch = chunks[c];
      if (!(ch.gx >= 0) || !(ch.gz >= 0)) continue;
      if (ch.gx < gx0) gx0 = ch.gx;
      if (ch.gx > gx1) gx1 = ch.gx;
      if (ch.gz < gz0) gz0 = ch.gz;
      if (ch.gz > gz1) gz1 = ch.gz;
    }
    if (!(gx1 >= gx0)) return { gw: 1, gh: 1, gx0: 0, gz0: 0, data: new Uint32Array(2), concat: table.concat };
    const gw = gx1 - gx0 + 1, gh = gz1 - gz0 + 1;
    const data = new Uint32Array(gw * gh * 2);
    const firstAt = new Int32Array(gw * gh);
    let shared = null;
    for (let c = 0; c < nc; c++) {
      const ch = chunks[c];
      if (!(ch.gx >= 0) || !(ch.gz >= 0)) continue;
      const cell = (ch.gz - gz0) * gw + (ch.gx - gx0), o = cell * 2;
      if (firstAt[cell]) {
        if (!shared) shared = new Map();
        let m = shared.get(cell);
        if (!m) { m = [firstAt[cell] - 1]; shared.set(cell, m); }
        m.push(c);
        continue;
      }
      firstAt[cell] = c + 1;
      data[o] = table.offsets[c];
      data[o + 1] = table.counts[c];
    }
    if (!shared) return { gw, gh, gx0, gz0, data, concat: table.concat };
    const cap = table.cap > 0 ? table.cap : CAP;
    const listOf = (c) => table.lists ? table.lists[c]
      : table.concat.subarray(table.offsets[c], table.offsets[c] + table.counts[c]);
    const extra = [];
    let off = table.concat.length;
    for (const [cell, members] of shared) {
      const seen = new Set(), out = [];
      for (let k = 0, more = true; more && out.length < cap; k++) {
        more = false;
        for (let j = 0; j < members.length && out.length < cap; j++) {
          const li = listOf(members[j]);
          if (k >= li.length) continue;
          more = true;
          const i = li[k];
          if (!seen.has(i)) { seen.add(i); out.push(i); }
        }
      }
      data[cell * 2] = off;
      data[cell * 2 + 1] = out.length;
      off += out.length;
      extra.push(out);
    }
    const concat = new Uint32Array(off);
    concat.set(table.concat);
    let w = table.concat.length;
    for (const out of extra) { concat.set(out, w); w += out.length; }
    return { gw, gh, gx0, gz0, data, concat };
  }

  function blitGrid(g, dst, dstW) {
    if (!g || !dst || !(dstW > 0)) return false;
    if (!(g.gw > 0) || !(g.gh > 0) || g.gw > dstW || g.gh > dstW) return false;
    for (let r = 0; r < g.gh; r++) {
      const src = r * g.gw * 2, out = r * dstW * 2;
      for (let x = 0; x < g.gw; x++) {
        dst[out + x * 2] = g.data[src + x * 2];
        dst[out + x * 2 + 1] = g.data[src + x * 2 + 1];
      }
    }
    return true;
  }

  return { CAP, capFor, buildTable, resolve, buildGrid, blitGrid };
})();
