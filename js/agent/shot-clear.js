/* Apex 26 — ShotClear: keeps the agent's free cameras (__apex.orbit / cinematic / view) from shooting through a hill, a building or a tree. blocker() walks the eye→target segment against the terrain, the prop registry (track.props) and the scenery graph (track.graph: instanced models, baked meshes) as world boxes; orbit()/side() try nearby placements, nearest first, and keep the first clear one. Agent surface only — no player camera reads it. */
const ShotClear = (function () {
  "use strict";

  // Terrain already covers these; their registry boxes envelope whole ranges.
  const SKIP = { mountain: 1, peak: 1, ridge: 1 };
  // The last metres before the look-at point belong to the subject (the car,
  // its kerb, the barrier beside it): never call those a blocker.
  const NEAR_TARGET = 4;
  const TERRAIN_STEP = 2, TERRAIN_SLACK = 0.25;
  const ZERO = [0, 0, 0];

  // Entry parameter t ∈ [0,1] of segment o + t·d into the box, or -1 for a miss.
  function slab(o, d, lo, hi) {
    let t0 = 0, t1 = 1;
    for (let k = 0; k < 3; k++) {
      if (Math.abs(d[k]) < 1e-9) {
        if (o[k] < lo[k] || o[k] > hi[k]) return -1;
        continue;
      }
      let a = (lo[k] - o[k]) / d[k], b = (hi[k] - o[k]) / d[k];
      if (a > b) { const s = a; a = b; b = s; }
      if (a > t0) t0 = a;
      if (b < t1) t1 = b;
      if (t0 > t1) return -1;
    }
    return t0;
  }

  // Every solid thing beside the road as a world AABB { kind, lo, hi }, built
  // once per track: the prop registry (track.props — the semantic placements)
  // plus the scenery graph (track.graph — instanced models such as a 108 m
  // crowd riser, and baked pack meshes), which the registry never sees.
  const _boxes = new WeakMap();
  function boxes(track) {
    if (!track) return [];
    const hit = _boxes.get(track);
    if (hit) return hit;
    const out = [];
    const list = track.props && track.props.list;
    if (list) {
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (p.w == null || SKIP[p.kind]) continue;
        // A sparse assembly hull (a grandstand frame, a fence run) is mostly air:
        // the raster view skips the same ones (agentview-raster.js).
        if (p.fill != null && p.fill < 0.06 && p.w * p.d > 150) continue;
        out.push({ kind: p.kind, lo: [p.x - p.w / 2, p.y - p.h / 2, p.z - p.d / 2],
                   hi: [p.x + p.w / 2, p.y + p.h / 2, p.z + p.d / 2] });
      }
    }
    const g = track.graph;
    if (g && g.nodes && g.models && g.models.get) {
      for (let i = 0; i < g.nodes.length; i++) {
        const n = g.nodes[i], m = g.models.get(n.model);
        const kind = (n.meta && n.meta.kind) || String(n.model).split("|")[0];
        if (!m || !n.o || !n.r || SKIP[kind]) continue;
        const bb = m.aabb;
        if (bb) out.push(nodeBox(kind, n, bb.mn, bb.mx));
      }
    }
    if (g && g.meshes && g.meshes.forEach) {
      g.meshes.forEach((m) => {
        const pos = m.geo && m.geo.pos;
        if (!pos || !pos.length || !m.places || !m.places.length) return;
        // Yaw turns the model about Y: its XZ reach is the radius of the
        // canonical footprint, a conservative box for any yaw.
        let rad = 0, y0 = Infinity, y1 = -Infinity;
        for (let i = 0; i < pos.length; i += 3) {
          rad = Math.max(rad, Math.hypot(pos[i], pos[i + 2]));
          y0 = Math.min(y0, pos[i + 1]); y1 = Math.max(y1, pos[i + 1]);
        }
        for (const pl of m.places) {
          const sc = pl.s || 1, r = rad * sc;
          out.push({ kind: m.key, lo: [pl.x - r, pl.y + y0 * sc, pl.z - r], hi: [pl.x + r, pl.y + y1 * sc, pl.z + r] });
        }
      });
    }
    _boxes.set(track, out);
    return out;
  }

  // A graph node as an ORIENTED box: the model-space box through graph.js
  // xform (o + r·x·s0 + u·y·s1 + t·z·s2). A long riser turned 40° off the world
  // axes has a world AABB tens of metres wide of open air, so blocker() tests
  // these in the node's own frame (obb); lo/hi stay as the cheap reject.
  function nodeBox(kind, n, mn, mx) {
    const s = n.s || [1, 1, 1], lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let c = 0; c < 8; c++) {
      const x = (c & 1 ? mx[0] : mn[0]) * s[0], y = (c & 2 ? mx[1] : mn[1]) * s[1], z = (c & 4 ? mx[2] : mn[2]) * s[2];
      for (let a = 0; a < 3; a++) {
        const v = n.o[a] + n.r[a] * x + n.u[a] * y + n.t[a] * z;
        if (v < lo[a]) lo[a] = v;
        if (v > hi[a]) hi[a] = v;
      }
    }
    const sl = (v, k) => [v[0] * k, v[1] * k, v[2] * k];
    const bmn = [mn[0] * s[0], mn[1] * s[1], mn[2] * s[2]], bmx = [mx[0] * s[0], mx[1] * s[1], mx[2] * s[2]];
    for (let a = 0; a < 3; a++) if (bmn[a] > bmx[a]) { const v = bmn[a]; bmn[a] = bmx[a]; bmx[a] = v; }
    return { kind, lo, hi, obb: { o: n.o, ax: [sl(n.r, 1), sl(n.u, 1), sl(n.t, 1)], mn: bmn, mx: bmx } };
  }

  // The ray in a box's own frame (axes unit-length and orthogonal, as graph
  // nodes are), then the same slab test.
  const _lo = [0, 0, 0], _ld = [0, 0, 0];
  function obbHit(b, eye, d) {
    const { o, ax } = b;
    for (let a = 0; a < 3; a++) {
      const v = ax[a];
      _lo[a] = (eye[0] - o[0]) * v[0] + (eye[1] - o[1]) * v[1] + (eye[2] - o[2]) * v[2];
      _ld[a] = d[0] * v[0] + d[1] * v[1] + d[2] * v[2];
    }
    return slab(_lo, _ld, b.mn, b.mx);
  }

  // The first thing between eye and target: { kind, atM } (metres from the eye),
  // or null when the view is clear. A box that holds the target itself (a
  // gantry over the grid, the pit wall the car is parked against) is part of
  // the subject, not a blocker — no placement could avoid it.
  function blocker(track, eye, target, noTerrain) {
    const d = [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]];
    const len = Math.hypot(d[0], d[1], d[2]);
    if (!(len > NEAR_TARGET)) return null;
    const tEnd = 1 - NEAR_TARGET / len;
    let best = -1, kind = null;
    if (!noTerrain && track && typeof Tracks !== "undefined" && Tracks.terrainY) {
      const n = Math.max(2, Math.ceil(len * tEnd / TERRAIN_STEP));
      for (let i = 0; i <= n; i++) {
        const t = (i / n) * tEnd;
        const ty = Tracks.terrainY(track, eye[0] + d[0] * t, eye[2] + d[2] * t);
        if (ty != null && ty > eye[1] + d[1] * t + TERRAIN_SLACK) { best = t; kind = "terrain"; break; }
      }
    }
    const x0 = Math.min(eye[0], target[0]), x1 = Math.max(eye[0], target[0]);
    const z0 = Math.min(eye[2], target[2]), z1 = Math.max(eye[2], target[2]);
    const all = boxes(track);
    for (let i = 0; i < all.length; i++) {
      const { lo, hi } = all[i];
      if (hi[0] < x0 || lo[0] > x1 || hi[2] < z0 || lo[2] > z1) continue;
      const ob = all[i].obb;
      if (ob ? obbHit(ob, target, ZERO) === 0
             : target[0] >= lo[0] && target[0] <= hi[0] && target[1] >= lo[1] && target[1] <= hi[1]
               && target[2] >= lo[2] && target[2] <= hi[2]) continue;
      const t = ob ? obbHit(ob, eye, d) : slab(eye, d, lo, hi);
      if (t >= 0 && t <= tEnd && (best < 0 || t < best)) { best = t; kind = all[i].kind; }
    }
    return best < 0 ? null : { kind, atM: Math.round(best * len * 10) / 10 };
  }

  // The view is blocked when the car is hidden OR the middle of the frame is:
  // the centre line runs to the car, and eight more aim across the central
  // half of a 16:9 frame at the car's distance, where only a FOREGROUND prop hit
  // (the first 60 %) counts — a building filling half the shot hides nothing
  // on the centre line but still ruins it.
  const FOREGROUND = 0.6;
  function frameBlocker(track, eye, target, fov) {
    const hit = blocker(track, eye, target);
    if (hit) return hit;
    const d = [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]];
    const len = Math.hypot(d[0], d[1], d[2]);
    if (!(len > NEAR_TARGET)) return null;
    const f = [d[0] / len, d[1] / len, d[2] / len];
    let rt = [-f[2], 0, f[0]];
    const rl = Math.hypot(rt[0], rt[2]);
    if (rl < 1e-6) rt = [1, 0, 0]; else rt = [rt[0] / rl, 0, rt[2] / rl];
    const up = [rt[1] * f[2] - rt[2] * f[1], rt[2] * f[0] - rt[0] * f[2], rt[0] * f[1] - rt[1] * f[0]];
    const w = len * Math.tan(((fov || 55) * Math.PI / 180) / 2) * 0.5 * (16 / 9), h = w * 9 / 16;
    for (const i of [-1, 0, 1]) for (const j of [-1, 0, 1]) {
      if (!i && !j) continue;
      const aim = [target[0] + rt[0] * w * i + up[0] * h * j, target[1] + rt[1] * w * i + up[1] * h * j,
                   target[2] + rt[2] * w * i + up[2] * h * j];
      const b = blocker(track, eye, aim, true);   // the ground fills a frame's lower edge by design
      if (b && b.atM < len * FOREGROUND) return Object.assign(b, { frame: true });
    }
    return null;
  }

  // Nearest-first offsets [Δaz°, Δel°, dist×] from the asked-for orbit: lift
  // first (a higher eye clears hedges and roofs), then swing round the subject,
  // then come in closer.
  const ORBIT_TRIES = (function () {
    const out = [];
    for (const k of [1, 0.6, 0.35])
      for (const de of [0, 12, 25, 40])
        for (const da of [0, 25, -25, 50, -50, 80, -80, 120, -120, 180]) out.push([da, de, k]);
    const cost = (o) => Math.abs(o[0]) / 25 + o[1] / 12 + (1 - o[2]) * 8;
    return out.sort((a, b) => cost(a) - cost(b));
  })();

  // place(az, el, dist) → eye; fov (deg) sizes the frame frameBlocker() checks. Returns the first clear placement as
  // { eye, az, el, dist, moved, blocked } — blocked names what stood in the
  // asked-for view — or null when every try is blocked (the caller keeps its own).
  function orbit(track, place, target, az, el, dist, fov) {
    let first = null;
    for (const [da, de, k] of ORBIT_TRIES) {
      const e = Math.min(85, el + de);
      const eye = place(az + da, e, dist * k);
      const hit = frameBlocker(track, eye, target, fov);
      if (!hit) {
        return { eye, az: az + da, el: e, dist: Math.round(dist * k * 10) / 10,
                 moved: !!(da || de || k !== 1), blocked: first };
      }
      if (!first) first = hit;
    }
    return null;
  }

  // The roadside eye of view({s, side, look:"in"}): place(side, dist, height) → eye.
  // Same side first, higher then closer, then the other side of the road.
  function side(track, place, target, sideSign, dist, height, fov) {
    let first = null;
    for (const sd of [sideSign, -sideSign])
      for (const k of [1, 0.6, 0.35])
        for (const hk of [1, 2, 3.5]) {
          const eye = place(sd, dist * k, height * hk);
          const hit = frameBlocker(track, eye, target, fov);
          if (!hit) return { eye, side: sd, dist: dist * k, height: height * hk, moved: !(sd === sideSign && k === 1 && hk === 1), blocked: first };
          if (!first) first = hit;
        }
    return null;
  }

  return Object.freeze({ blocker, frameBlocker, boxes, orbit, side, ORBIT_TRIES });
})();
