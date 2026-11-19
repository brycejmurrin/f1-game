"use strict";
const FlybySight = (function () {

  const TREEISH = /tree|pine|palm|cypress|acacia|broadleaf|conifer/i;

  function propBoxes(track) {
    const out = [];
    const list = (track.props && track.props.list) || [];
    list.forEach((p, i) => {
      if (!(p.w > 0 && p.h > 0 && p.d > 0)) return;
      const base = { kind: p.kind, id: i, rec: p };
      if (TREEISH.test(p.kind)) {
        const y0 = p.y - p.h / 2, tw = Math.max(0.35, Math.min(p.w, p.d) * 0.12);
        const c0 = /stonePine|palm/.test(p.kind) ? 0.6 : /cypress/.test(p.kind) ? 0.1 : 0.35;
        out.push(Object.assign({}, base, { x: p.x, y: y0 + p.h * c0 / 2 + 0.1, z: p.z, w: tw, h: p.h * c0 + 0.2, d: tw, op: 1, part: "trunk" }));
        out.push(Object.assign({}, base, { x: p.x, y: y0 + p.h * (1 + c0) / 2, z: p.z, w: p.w * 0.85, h: p.h * (1 - c0), d: p.d * 0.85,
          op: 0.8, part: "canopy" }));
        return;
      }
      if (p.kind === "gantry") {
        out.push(Object.assign({}, base, { x: p.x, y: p.y + p.h / 3, z: p.z, w: p.w, h: p.h / 3, d: p.d, op: 1, solid: true }));
        return;
      }
      if (/ridge|mountain|hill|peak/.test(p.kind)) {
        const y0 = p.y - p.h / 2;
        for (let t = 0; t < 3; t++) {
          const k = 1 - t / 3;
          out.push(Object.assign({}, base, { x: p.x, y: y0 + p.h * (t + 0.5) / 3, z: p.z, w: p.w * k, h: p.h / 3, d: p.d * k, op: 0.9, part: "tier" + t }));
        }
        return;
      }
      let op = 1;
      if (p.kind === "structure") op = Math.min(1, (p.fill || 0) * 1.6);
      else if (/bush|hedge/.test(p.kind)) op = 0.6;
      else if (p.kind === "prop") op = 0.7;
      if (op < 0.05) return;
      out.push(Object.assign({}, base, { x: p.x, y: p.y, z: p.z, w: p.w, h: p.h, d: p.d, op, solid: FlybySeq.isSolid(p) }));
    });
    return out;
  }

  function offRoad(boxes, track) {
    if (!(track.n > 0 && track.px)) return boxes;
    const smp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 10 };
    let dropped = 0;
    const kept = boxes.filter((b) => {
      if (b.part || !(b.w > 2 && b.d > 2)) return true;
      for (let k = 0; k < 25; k++) {
        const x = b.x + ((k % 5) / 2 - 1) * b.w / 2 * 0.9, z = b.z + (Math.floor(k / 5) / 2 - 1) * b.d / 2 * 0.9;
        const pr = Tracks.project(track, x, z, null, b.y);
        if (!pr || !isFinite(pr.lat)) continue;
        Tracks.sample(track, pr.s, smp);
        if (Math.abs(pr.lat) < (smp.hw || 7) - 0.5 && b.y - b.h / 2 < smp.p[1] + 1) { dropped++; return false; }
      }
      return true;
    });
    kept.droppedOverRoad = dropped;
    return kept;
  }

  const SPAN_OP = { wall: 1, fence: 0.25, guardrail: 1, tyreWall: 1, bleacher: 0.9, scaffoldStand: 0.6, terrace: 0.9, tieredBowl: 0.9 };
  const SPAN_H = { guardrail: 0.9, tyreWall: 1.1 };
  function spanBoxes(track) {
    const out = [], smp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 10 };
    const L = track.total, spans = (track.props && track.props.spans) || [];
    spans.forEach((sp, j) => {
      let a = sp.s0 * L, b = sp.s1 * L;
      if (b < a) b += L;
      const h = sp.h || SPAN_H[sp.kind] || 1.5;
      for (let s = a; s < b; s += 6) {
        Tracks.sample(track, s % L, smp);
        const rl = Math.hypot(smp.r[0], smp.r[2]) || 1, rx = smp.r[0] / rl, rz = smp.r[2] / rl;
        const lat = (smp.hw + (sp.gap || 0)) * (sp.side >= 0 ? 1 : -1);
        const thick = /bleacher|stand|terrace|bowl/.test(sp.kind) ? Math.max(4, h) : 0.5;
        out.push({ kind: sp.kind, id: "span" + j, x: smp.p[0] + rx * (lat + Math.sign(lat) * thick / 2),
          y: smp.p[1] + h / 2, z: smp.p[2] + rz * (lat + Math.sign(lat) * thick / 2),
          w: thick, h, d: 6.2, rot: [rx, rz], op: SPAN_OP[sp.kind] != null ? SPAN_OP[sp.kind] : 0.8 });
      }
    });
    return out;
  }

  const CELL = 32;
  const cellKey = (ix, iz) => ix * 100003 + iz;
  function binBox(cells, i, x0, x1, z0, z1) {
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const k = cellKey(ix, iz);
      let a = cells.get(k);
      if (!a) cells.set(k, a = []);
      a.push(i);
    }
  }
  function maxStride3(pos) {
    let m = -Infinity;
    for (let k = 1; k < pos.length; k += 3) if (pos[k] > m) m = pos[k];
    return m;
  }
  function sceneOf(track) {
    if (track._fsScene) return track._fsScene;
    const boxes = offRoad(propBoxes(track), track).concat(spanBoxes(track));
    const cells = new Map();
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      let hx = b.w / 2, hz = b.d / 2;
      if (b.rot) {
        const c = Math.abs(b.rot[0]), s = Math.abs(b.rot[1]);
        hx = c * b.w / 2 + s * b.d / 2; hz = s * b.w / 2 + c * b.d / 2;
      }
      b._hx = hx; b._hz = hz; b._r = 0.5 * Math.hypot(b.w, b.h, b.d);
      binBox(cells, i, Math.floor((b.x - hx) / CELL), Math.floor((b.x + hx) / CELL),
             Math.floor((b.z - hz) / CELL), Math.floor((b.z + hz) / CELL));
    }
    const pos = track.terrainGeo && track.terrainGeo.pos;
    const maxT = pos ? maxStride3(pos) : -Infinity;
    track._fsScene = { boxes, cells, stamp: new Uint32Array(boxes.length), gen: 0, maxT };
    return track._fsScene;
  }

  function rayBox(o, d, b) {
    let ox = o[0] - b.x, oz = o[2] - b.z, dx = d[0], dz = d[2];
    const oy = o[1] - b.y, dy = d[1];
    if (b.rot) {
      const c = b.rot[0], s = b.rot[1];
      const rx = c * ox + s * oz, rz = -s * ox + c * oz; ox = rx; oz = rz;
      const qx = c * dx + s * dz, qz = -s * dx + c * dz; dx = qx; dz = qz;
    }
    let t0 = -Infinity, t1 = Infinity, a, c, h;
    h = b.w / 2;
    if (dx > -1e-12 && dx < 1e-12) { if (ox > h || ox < -h) return Infinity; }
    else { a = (-h - ox) / dx; c = (h - ox) / dx; if (a > c) { const t = a; a = c; c = t; } if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) return Infinity; }
    h = b.h / 2;
    if (dy > -1e-12 && dy < 1e-12) { if (oy > h || oy < -h) return Infinity; }
    else { a = (-h - oy) / dy; c = (h - oy) / dy; if (a > c) { const t = a; a = c; c = t; } if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) return Infinity; }
    h = b.d / 2;
    if (dz > -1e-12 && dz < 1e-12) { if (oz > h || oz < -h) return Infinity; }
    else { a = (-h - oz) / dz; c = (h - oz) / dz; if (a > c) { const t = a; a = c; c = t; } if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) return Infinity; }
    if (t1 < 0) return Infinity;
    return t0 > 0 ? t0 : 0;
  }
  function inBox(p, b, m) {
    let x = p[0] - b.x, z = p[2] - b.z;
    if (b.rot) { const c = b.rot[0], s = b.rot[1]; const rx = c * x + s * z; z = -s * x + c * z; x = rx; }
    return Math.abs(x) < b.w / 2 + m && Math.abs(z) < b.d / 2 + m && Math.abs(p[1] - b.y) < b.h / 2 + m;
  }

  function walk(sc, o, d, len, fn) {
    const gen = ++sc.gen;
    let ix = Math.floor(o[0] / CELL), iz = Math.floor(o[2] / CELL);
    const ex = Math.floor((o[0] + d[0] * len) / CELL), ez = Math.floor((o[2] + d[2] * len) / CELL);
    const sx = d[0] > 0 ? 1 : -1, sz = d[2] > 0 ? 1 : -1;
    const tdx = Math.abs(d[0]) > 1e-9 ? CELL / Math.abs(d[0]) : Infinity;
    const tdz = Math.abs(d[2]) > 1e-9 ? CELL / Math.abs(d[2]) : Infinity;
    let tx = Math.abs(d[0]) > 1e-9 ? ((sx > 0 ? (ix + 1) * CELL - o[0] : o[0] - ix * CELL) / Math.abs(d[0])) : Infinity;
    let tz = Math.abs(d[2]) > 1e-9 ? ((sz > 0 ? (iz + 1) * CELL - o[2] : o[2] - iz * CELL) / Math.abs(d[2])) : Infinity;
    for (let n = 0; n < 512; n++) {
      const a = sc.cells.get(cellKey(ix, iz));
      if (a) for (let j = 0; j < a.length; j++) {
        const i = a[j];
        if (sc.stamp[i] === gen) continue;
        sc.stamp[i] = gen;
        fn(sc.boxes[i]);
      }
      if (ix === ex && iz === ez) break;
      if (tx < tz) { if (tx > len) break; ix += sx; tx += tdx; } else { if (tz > len) break; iz += sz; tz += tdz; }
    }
  }

  const MOUNTAINISH = /ridge|mountain|hill|peak/;
  function terrainAt(track, x, z) {
    const g = Tracks.terrainY ? Tracks.terrainY(track, x, z) : null;
    return g == null || !isFinite(g) ? -Infinity : g;
  }

  const NEAR_M = 30;
  const _d = [0, 0, 0];
  function transmit(track, eye, p, skip) {
    const sc = sceneOf(track);
    const vx = p[0] - eye[0], vy = p[1] - eye[1], vz = p[2] - eye[2], L = Math.hypot(vx, vy, vz);
    if (!(L > 0)) return { T: 1, near: 0, Tdrawn: 1 };
    _d[0] = vx / L; _d[1] = vy / L; _d[2] = vz / L;
    const hits = [];
    let held = 1;
    walk(sc, eye, _d, L, (b) => {
      const bx = b.x - eye[0], by = b.y - eye[1], bz = b.z - eye[2];
      const tc = bx * _d[0] + by * _d[1] + bz * _d[2];
      if (tc < -b._r || tc > L + b._r || bx * bx + by * by + bz * bz - tc * tc > b._r * b._r) return;
      if (skip && skip(b)) return;
      if (inBox(eye, b, 0)) return;
      if (inBox(p, b, 0.05)) { if (rayBox(eye, _d, b) < L - 0.5) held *= 1 - b.op; return; }
      const t = rayBox(eye, _d, b);
      if (t < L - 0.5) hits.push(t, b.op);
    });
    let T = 1, near = 0;
    if (hits.length) {
      const order = [];
      for (let i = 0; i < hits.length; i += 2) order.push(i);
      order.sort((a, b) => hits[a] - hits[b]);
      for (let k = 0; k < order.length; k++) {
        const take = T * hits[order[k] + 1];
        if (hits[order[k]] < NEAR_M) near += take;
        T -= take;
      }
    }
    const N = Math.min(30, Math.max(6, Math.ceil(L / 20)));
    for (let i = 1; i < N && T > 0; i++) {
      const t = (i / N) * L, y = eye[1] + _d[1] * t;
      if (t > L - 2) break;
      if (y - 0.3 > sc.maxT) continue;
      if (y < terrainAt(track, eye[0] + _d[0] * t, eye[2] + _d[2] * t) - 0.3) { T = 0; break; }
    }
    return { T: Math.max(0, T), near, Tdrawn: Math.max(0, T) * held };
  }

  function camera(eye, tgt, fovDeg, aspect) {
    let fx = tgt[0] - eye[0], fy = tgt[1] - eye[1], fz = tgt[2] - eye[2];
    const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
    let rx = -fz, rz = fx;
    const rl = Math.hypot(rx, rz);
    if (rl < 1e-6) { rx = 1; rz = 0; } else { rx /= rl; rz /= rl; }
    const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
    const tanY = Math.tan((fovDeg || 50) * Math.PI / 360), tanX = tanY * (aspect || 16 / 9);
    return { eye, f: [fx, fy, fz], r: [rx, 0, rz], u: [ux, uy, uz], tanX, tanY, halfDiag: Math.atan(Math.hypot(tanX, tanY)) };
  }
  function project(cam, p) {
    const vx = p[0] - cam.eye[0], vy = p[1] - cam.eye[1], vz = p[2] - cam.eye[2];
    const z = vx * cam.f[0] + vy * cam.f[1] + vz * cam.f[2];
    if (!(z > 0.9)) return null;
    return { x: (vx * cam.r[0] + vz * cam.r[2]) / (z * cam.tanX),
             y: (vx * cam.u[0] + vy * cam.u[1] + vz * cam.u[2]) / (z * cam.tanY) };
  }

  const NC = 12, NR = 8;
  const _rd = [0, 0, 0];
  function nearThirds(track, cam, skip, coarse) {
    const nc = coarse ? NC / 2 : NC, nr = coarse ? NR / 2 : NR;
    const sc = sceneOf(track), e = cam.eye, near = [];
    const gen = ++sc.gen;
    for (let ix = Math.floor((e[0] - NEAR_M) / CELL); ix <= Math.floor((e[0] + NEAR_M) / CELL); ix++) {
      for (let iz = Math.floor((e[2] - NEAR_M) / CELL); iz <= Math.floor((e[2] + NEAR_M) / CELL); iz++) {
        const a = sc.cells.get(cellKey(ix, iz));
        if (a) for (let j = 0; j < a.length; j++) {
          const i = a[j];
          if (sc.stamp[i] === gen) continue;
          sc.stamp[i] = gen;
          const b = sc.boxes[i];
          if (Math.abs(b.x - e[0]) - b._hx > NEAR_M || Math.abs(b.z - e[2]) - b._hz > NEAR_M) continue;
          const vx = b.x - e[0], vy = b.y - e[1], vz = b.z - e[2], dist = Math.hypot(vx, vy, vz);
          if (dist - b._r > NEAR_M) continue;
          if (dist > b._r) {
            const cosA = (vx * cam.f[0] + vy * cam.f[1] + vz * cam.f[2]) / dist;
            if (Math.acos(Math.max(-1, Math.min(1, cosA))) - Math.asin(Math.min(1, b._r / dist)) > cam.halfDiag) continue;
          }
          if (inBox(e, b, 0) || (skip && skip(b))) continue;
          near.push(b);
        }
      }
    }
    const thirds = [0, 0, 0];
    if (!near.length) return thirds;
    const ts = [];
    for (let y = 0; y < nr; y++) {
      const ny = 1 - (y + 0.5) / nr * 2;
      for (let x = 0; x < nc; x++) {
        const nx = (x + 0.5) / nc * 2 - 1;
        const a = nx * cam.tanX, bb = ny * cam.tanY;
        _rd[0] = cam.f[0] + cam.r[0] * a + cam.u[0] * bb;
        _rd[1] = cam.f[1] + cam.u[1] * bb;
        _rd[2] = cam.f[2] + cam.r[2] * a + cam.u[2] * bb;
        const l = Math.hypot(_rd[0], _rd[1], _rd[2]);
        _rd[0] /= l; _rd[1] /= l; _rd[2] /= l;
        ts.length = 0;
        for (let k = 0; k < near.length; k++) {
          const b = near[k];
          const vx = b.x - e[0], vy = b.y - e[1], vz = b.z - e[2];
          const tc = vx * _rd[0] + vy * _rd[1] + vz * _rd[2];
          if (vx * vx + vy * vy + vz * vz - tc * tc > b._r * b._r) continue;
          const t = rayBox(e, _rd, b);
          if (t < NEAR_M) ts.push(t, b.op);
        }
        if (!ts.length) continue;
        let tg = Infinity, tMax = 0;
        for (let k = 0; k < ts.length; k += 2) if (ts[k] > tMax) tMax = ts[k];
        if (_rd[1] < 0) for (let t = 1; t < tMax; t += 1.5) {
          const y = e[1] + _rd[1] * t;
          if (y > sc.maxT) continue;
          if (y < terrainAt(track, e[0] + _rd[0] * t, e[2] + _rd[2] * t)) { tg = t; break; }
        }
        let pass = 1;
        for (let k = 0; k < ts.length; k += 2) if (ts[k] < tg) pass *= 1 - ts[k + 1];
        thirds[Math.min(2, Math.floor(x / nc * 3))] += (1 - pass) / (nc / 3 * nr);
      }
    }
    return thirds;
  }

  const MIX_RANGE = 2500, MIX_C = 8, MIX_R = 16;
  function floorOf(track, sc) {
    if (sc.floorY != null) return sc.floorY;
    const smp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 10 };
    let lo = Infinity;
    for (let i = 0; i < 128; i++) { Tracks.sample(track, (i / 128) * (track.total || 1), smp); if (smp.p[1] < lo) lo = smp.p[1]; }
    sc.floorY = isFinite(lo) ? lo - 0.3 : 0;
    return sc.floorY;
  }
  function topOf(sc) {
    if (sc.topY == null) { sc.topY = -Infinity; for (const b of sc.boxes) sc.topY = Math.max(sc.topY, b.y + b.h / 2); }
    return sc.topY;
  }
  const _md = [0, 0, 0];
  function mix(track, cam, coarse) {
    const sc = sceneOf(track), e = cam.eye, floor = floorOf(track, sc);
    const nc = coarse ? MIX_C / 2 : MIX_C, nr = coarse ? MIX_R / 2 : MIX_R;
    let sky = 0, ground = 0, prop = 0;
    const hits = [];
    for (let y = 0; y < nr; y++) {
      const ny = 1 - (y + 0.5) / nr * 2;
      for (let x = 0; x < nc; x++) {
        const nx = (x + 0.5) / nc * 2 - 1, a = nx * cam.tanX, bb = ny * cam.tanY;
        _md[0] = cam.f[0] + cam.r[0] * a + cam.u[0] * bb;
        _md[1] = cam.f[1] + cam.u[1] * bb;
        _md[2] = cam.f[2] + cam.r[2] * a + cam.u[2] * bb;
        const l = Math.hypot(_md[0], _md[1], _md[2]);
        _md[0] /= l; _md[1] /= l; _md[2] /= l;
        if (_md[1] >= 0 && e[1] > sc.maxT && e[1] > topOf(sc)) { sky++; continue; }
        let tg = Infinity;
        if (!(_md[1] >= 0 && e[1] > sc.maxT)) {
          for (let t = 2; t <= MIX_RANGE; t += Math.max(2, t * 0.04)) {
            const py = e[1] + _md[1] * t;
            if (_md[1] >= 0 && py > sc.maxT) break;
            if (py < terrainAt(track, e[0] + _md[0] * t, e[2] + _md[2] * t)) { tg = t; break; }
          }
        }
        if (tg === Infinity && _md[1] < 0 && e[1] > floor) tg = Math.min(MIX_RANGE * 2, (e[1] - floor) / -_md[1]);
        hits.length = 0;
        walk(sc, e, _md, Math.min(tg, MIX_RANGE), (b) => {
          const vx = b.x - e[0], vy = b.y - e[1], vz = b.z - e[2], tc = vx * _md[0] + vy * _md[1] + vz * _md[2];
          if (vx * vx + vy * vy + vz * vz - tc * tc > b._r * b._r) return;
          const t = rayBox(e, _md, b);
          if (t < tg && t <= MIX_RANGE && !inBox(e, b, 0)) hits.push(t, b.op);
        });
        let pass = 1;
        for (let k = 0; k < hits.length; k += 2) pass *= 1 - hits[k + 1];
        prop += 1 - pass;
        if (tg < Infinity || _md[1] < 0) ground += pass; else sky += pass;
      }
    }
    const n = nc * nr;
    return { sky: sky / n, ground: ground / n, prop: prop / n };
  }
  const GROUND_MAX = 70, SKY_MAX = 65, MIX_MARGIN = 2, MIX_FLAG = 10;
  const GROUND_OK = (GROUND_MAX - MIX_MARGIN) / 100;
  function mixCost(m) {
    const g = m.ground * 100, s = m.sky * 100;
    return Math.max(0, g - GROUND_MAX) * 0.5 + Math.max(0, s - SKY_MAX) * 0.5 + (g > GROUND_MAX - MIX_MARGIN || s > SKY_MAX - MIX_MARGIN ? MIX_FLAG : 0);
  }

  function thirdsDist(nx, ny) {
    const u = (nx + 1) / 2, v = (ny + 1) / 2;
    let best = Infinity;
    for (let i = 1; i <= 2; i++) for (let j = 1; j <= 2; j++) best = Math.min(best, Math.hypot(u - i / 3, v - j / 3));
    return best;
  }
  const BOX_FILL = 0.6;
  function boxCover(cam, r) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      const q = project(cam, [r.x + (i & 1 ? 0.5 : -0.5) * r.w, r.y + (i & 2 ? 0.5 : -0.5) * r.h, r.z + (i & 4 ? 0.5 : -0.5) * r.d]);
      if (!q) return null;
      if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y;
    }
    const c = (v) => Math.max(-1, Math.min(1, v));
    return Math.max(0, (c(x1) - c(x0)) * (c(y1) - c(y0)) / 4) * BOX_FILL;
  }

  function stripCover(cam, pts, stride, Ts, vis) {
    let area = 0, a = null, b = null;
    for (let i = 0; i + stride - 1 < pts.length; i += stride) {
      const l = project(cam, pts[i]), r = project(cam, pts[i + stride - 1]);
      if (a && b && l && r) {
        let w = 0, n = 0;
        for (let k = i - stride; k < i + stride; k++) if (Ts[k] >= 0) { w += Ts[k]; n++; }
        area += clippedArea([a.x, a.y, b.x, b.y, r.x, r.y, l.x, l.y]) * (n ? w / n : vis);
      }
      a = l; b = r;
    }
    return Math.min(1, area / 4);
  }
  function clippedArea(poly) {
    for (let e = 0; e < 4 && poly.length >= 6; e++) {
      const ax = e < 2 ? 0 : 1, sg = e % 2 ? -1 : 1, out = [];
      const inside = (k) => sg * poly[k + ax] <= 1;
      for (let k = 0; k < poly.length; k += 2) {
        const j = (k + 2) % poly.length, ki = inside(k), ji = inside(j);
        if (ki) out.push(poly[k], poly[k + 1]);
        if (ki !== ji) {
          const t = (sg - poly[k + ax]) / (poly[j + ax] - poly[k + ax]);
          out.push(poly[k] + (poly[j] - poly[k]) * t, poly[k + 1] + (poly[j + 1] - poly[k + 1]) * t);
        }
      }
      poly = out;
    }
    let A = 0;
    for (let k = 0; k < poly.length; k += 2) {
      const j = (k + 2) % poly.length;
      A += poly[k] * poly[j + 1] - poly[j] * poly[k + 1];
    }
    return Math.abs(A) / 2;
  }
  const CAR_W = 2.0, CAR_H = 1.0, FC = 32, FR = 18;
  const _cells = new Uint8Array(FC * FR);
  function fieldCover(cam, pts) {
    _cells.fill(0);
    let n = 0;
    for (let i = 0; i + 2 < pts.length; i += 3) {
      const m = project(cam, pts[i]), a = project(cam, pts[i + 1]), b = project(cam, pts[i + 2]);
      if (!m || !a || !b) continue;
      const vx = pts[i][0] - cam.eye[0], vy = pts[i][1] - cam.eye[1], vz = pts[i][2] - cam.eye[2];
      const z = vx * cam.f[0] + vy * cam.f[1] + vz * cam.f[2];
      const hw = CAR_W / 2 / (z * cam.tanX), hh = CAR_H / 2 / (z * cam.tanY);
      const x0 = Math.min(a.x, b.x) - hw, x1 = Math.max(a.x, b.x) + hw, y0 = Math.min(a.y, b.y) - hh, y1 = Math.max(a.y, b.y) + hh;
      const c0 = Math.max(0, Math.floor((x0 + 1) / 2 * FC)), c1 = Math.min(FC - 1, Math.floor((x1 + 1) / 2 * FC));
      const r0 = Math.max(0, Math.floor((y0 + 1) / 2 * FR)), r1 = Math.min(FR - 1, Math.floor((y1 + 1) / 2 * FR));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (!_cells[r * FC + c]) { _cells[r * FC + c] = 1; n++; }
    }
    return n / (FC * FR);
  }
  const SMALL_PCT = 8;

  const STEEP = 25 * Math.PI / 180;
  function frame(track, eye, tgt, fov, subj, coarse, withMix, lapCover) {
    const cam = camera(eye, tgt, fov, 16 / 9);
    let inF = 0, vis = 0, nearSubj = 0, sx = 0, sy = 0, n = 0;
    const pts = subj.pts, step = coarse ? 2 : 1, Ts = subj.strip || (subj.lap && lapCover) ? new Float32Array(pts.length).fill(-1) : null;
    for (let i = 0; i < pts.length; i += step) {
      n++;
      const q = project(cam, pts[i]);
      if (!q || Math.abs(q.x) > 1 || Math.abs(q.y) > 1) continue;
      inF++; sx += q.x; sy += q.y;
      const r = transmit(track, eye, pts[i], subj.skip);
      vis += r.T; nearSubj += r.near;
      if (Ts) Ts[i] = r.Tdrawn;
    }
    n = n || 1;
    const cx = inF ? sx / inF : 0, cy = inF ? sy / inF : 0;
    vis = inF ? vis / inF : 0; nearSubj = inF ? nearSubj / inF : 0;
    inF /= n;
    const th = nearThirds(track, cam, subj.skip, coarse);
    const near = Math.max(th[0], th[1], th[2]);
    const sc = sceneOf(track);
    let inside = false;
    walk(sc, eye, [1, 0, 0], 0.01, (b) => { if (!inside && b.op >= 0.5 && !MOUNTAINISH.test(b.kind) && inBox(eye, b, 0)) inside = true; });
    let cost = (1 - vis) * 40 + Math.max(0, near * 100 - 10) * 0.6 + (inside ? 60 : 0);
    if (!subj.lap) cost += (1 - inF) * 15 + (inF < 0.5 ? 20 : 0);
    if (!inF) cost += 40;
    else cost += Math.max(0, Math.min(thirdsDist(cx, cy), Math.hypot(cx, cy) / Math.SQRT2) - 0.12) * 40;
    const pitch = Math.asin(Math.max(-1, Math.min(1, cam.f[1])));
    const steep = pitch < -STEEP && 0.5 + Math.tan(pitch) / cam.tanY / 2 < 0;
    if (steep) cost += 25;
    let cover = null;
    if (subj.box) {
      const c = boxCover(cam, subj.box);
      cover = c == null ? null : c * vis;
    } else if (subj.strip) cover = stripCover(cam, pts, subj.strip, Ts, vis);
    else if (subj.field) cover = fieldCover(cam, pts) * vis;
    if (cover != null) cost += Math.max(0, SMALL_PCT - cover * 100) * 4;
    if (subj.lap && lapCover) cover = stripCover(cam, pts, 3, Ts, vis);
    let m = null, mc = 0;
    if (subj.lap && withMix) { m = mix(track, cam, coarse); mc = mixCost(m); cost += mc; }
    return { inF, vis, nearSubj, near, thirds: th, inside, steep, cover, mix: m, mixCost: mc, cost };
  }

  return Object.freeze({ propBoxes, offRoad, spanBoxes, sceneOf, transmit, nearThirds, mix, mixCost, frame, camera, project, GROUND_OK });
})();
