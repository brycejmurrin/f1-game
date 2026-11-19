const SceneryNature = (function () {
  "use strict";

  const LOBED_CROWNS = [
    [[-0.6, -0.2, 3.8, 2.55, 2.4, 3.0], [0.7, 0.45, 4.3, 2.45, 2.7, 3.4], [-0.05, -0.65, 5.2, 2.05, 3.0, 3.8]],
    [[-0.7, 0.35, 3.5, 2.4, 2.5, 3.2], [0.6, -0.5, 4.8, 2.55, 2.2, 3.2], [0.2, 0.3, 5.4, 1.9, 2.8, 3.8]],
    [[-0.3, -0.7, 4.1, 2.6, 2.3, 3.4], [0.65, 0.2, 3.7, 2.35, 2.9, 3.3], [-0.45, 0.4, 5.8, 1.85, 2.4, 3.8]],
  ];

  function palmFootprint(part) {
    const [r, u, t] = part.b, [w, h, d] = part.size;
    const L = Math.hypot(r[0], r[2]) || 1;
    const rx = [r[0] / L, 0, r[2] / L], tz = [-rx[2], 0, rx[0]];
    const proj = (v, axis) => Math.abs(v[0] * axis[0] + v[2] * axis[2]);
    const c = part.type === "box" ? part.c : TrackGeom.vadd(part.c, u, h / 2);
    const fw = w * proj(r, rx) + h * proj(u, rx) + d * proj(t, rx);
    const fd = w * proj(r, tz) + h * proj(u, tz) + d * proj(t, tz);
    const ey = (w * Math.abs(r[1]) + h * Math.abs(u[1]) + d * Math.abs(t[1])) / 2;
    return { c, w: fw, d: fd, b: [rx, [0, 1, 0], tz], minY: c[1] - ey, maxY: c[1] + ey,
      ex: (fw * Math.abs(rx[0]) + fd * Math.abs(tz[0])) / 2,
      ez: (fw * Math.abs(rx[2]) + fd * Math.abs(tz[2])) / 2 };
  }

  function palmVertices(part) {
    const [r, u, t] = part.b, [w, h, d] = part.size, verts = [];
    for (const z of [-d / 2, d / 2]) {
      for (const x of [-w / 2, w / 2]) for (const y of part.type === "box" ? [-h / 2, h / 2] : [0])
        verts.push(TrackGeom.vadd(TrackGeom.vadd(TrackGeom.vadd(part.c, r, x), u, y), t, z));
      if (part.type === "prism") verts.push(TrackGeom.vadd(TrackGeom.vadd(part.c, u, h), t, z));
    }
    return verts;
  }

  const palmBoundsOverlap = (a, b) => Math.abs(a.c[0] - b.c[0]) <= a.ex + b.ex &&
    Math.abs(a.c[2] - b.c[2]) <= a.ez + b.ez && a.minY <= b.maxY && b.minY <= a.maxY;

  function palmOverlaps(a, b) {
    if (!palmBoundsOverlap(a, b)) return false;
    const dx = a.c[0] - b.c[0], dz = a.c[2] - b.c[2];
    return [a.b[0], a.b[2], b.b[0], b.b[2]].every((axis) => {
      const reach = (f) => (f.w * Math.abs(f.b[0][0] * axis[0] + f.b[0][2] * axis[2]) +
                            f.d * Math.abs(f.b[2][0] * axis[0] + f.b[2][2] * axis[2])) / 2;
      return Math.abs(dx * axis[0] + dz * axis[2]) <= reach(a) + reach(b);
    });
  }

  function create(ctx) {
    const { out, track, n, ds, hw, px, py, pz, NIGHT, MAT, def, theme,
            clearTreeDist,
            addBox, addCyl, addCone, addFrustum, addPrism, addPyramid,
            addMountain, emit, rejBox, recordBarrier, groundYAt,
            terrainYAt, onTrack, hash, upOf, norm, vadd, bankOffsetAt } = ctx;
    Log.info("scenery", "scenery-nature dress " + (def && def.id));
    const { CROWD_DAY } = TrackSceneryData;

    const _guCand = new Array(n);
    const groundUnder = (x, z) => {
      const ty = terrainYAt(x, z);
      if (ty !== null) return ty;
      let best = 0, bestD = Infinity;
      const grid = track._nodeGrid || (typeof TrackMesh !== "undefined" && TrackMesh.nodeGrid(track));
      if (grid && grid.query) {
        let R = 40;
        for (;;) {
          const cnt = grid.query(x, z, R, _guCand, false);
          best = 0; bestD = Infinity;
          for (let a = 0; a < cnt; a++) {
            const i = _guCand[a];
            const d = (x - px[i]) * (x - px[i]) + (z - pz[i]) * (z - pz[i]);
            if (d < bestD) { bestD = d; best = i; }
          }
          if (cnt > 0 && bestD <= R * R) break;
          if (R > 8000) break;
          R *= 2;
        }
      } else {
        for (let i = 0; i < n; i++) {
          const d = (x - px[i]) * (x - px[i]) + (z - pz[i]) * (z - pz[i]);
          if (d < bestD) { bestD = d; best = i; }
        }
      }
      return groundYAt(best, Math.max(0, Math.sqrt(bestD) - hw[best]));
    };

    const anchor = (kRaw, side, dist) => {
      const k = Math.round(((kRaw % n) + n) % n) % n;
      const r = [track.rx[k], track.ry[k], track.rz[k]];
      const t = [track.tx[k], track.ty[k], track.tz[k]];
      const u = upOf(track, k);
      const o = side * (hw[k] + dist);
      const cx = px[k] + r[0] * o, cz = pz[k] + r[2] * o;
      const base = dist < 2.2
        ? py[k] + bankOffsetAt(track, k, o)
        : (() => { const ty = terrainYAt(cx, cz);
                   return ty != null ? ty : groundYAt(k, dist) + bankOffsetAt(track, k, o); })();
      return { c: [cx, base - 0.3, cz], r, u, t, k };
    };
    const TREE_GAP = 1.0;
    const planted = new Map();
    let hillSeq = 0, standSeq = 0;
    const spotOccupied = (x, z, reserve = true) => {
      const cx = Math.floor(x / TREE_GAP), cz = Math.floor(z / TREE_GAP);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const cell = planted.get(`${cx + i}|${cz + j}`);
        if (cell) for (const q of cell)
          if (Math.hypot(q[0] - x, q[1] - z) < TREE_GAP) return true;
      }
      if (!reserve) return false;
      const key = `${cx}|${cz}`;
      if (!planted.has(key)) planted.set(key, []);
      planted.get(key).push([x, z]);
      return false;
    };
    const spotTaken = (x, z) => spotOccupied(x, z);
    const PINE_CELL = 10, pineFacetGrid = new Map();
    const pineFacetsNear = (x, z, reach) => {
      const res = [], cx = Math.floor(x / PINE_CELL), cz = Math.floor(z / PINE_CELL);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const cell = pineFacetGrid.get(`${cx + i}|${cz + j}`);
        if (cell) for (const q of cell)
          if (Math.hypot(q.x - x, q.z - z) < q.reach + reach) res.push(q.facets);
      }
      return res;
    };
    const pineFacetsAdd = (x, z, reach, facets) => {
      const key = `${Math.floor(x / PINE_CELL)}|${Math.floor(z / PINE_CELL)}`;
      if (!pineFacetGrid.has(key)) pineFacetGrid.set(key, []);
      const sorted = facets.filter((F) => F.every(Number.isFinite)).sort((A, B) => A[0] - B[0]), flat = new Float64Array(sorted.length * 4);
      sorted.forEach((F, i) => flat.set(F, i * 4));
      pineFacetGrid.get(key).push({ x, z, reach, facets: flat });
    };
    const facetFrom = (flat, v) => {
      let lo = 0, hi = flat.length >> 2;
      while (lo < hi) { const m = (lo + hi) >> 1; if (flat[m * 4] < v) lo = m + 1; else hi = m; }
      return lo;
    };
    const FACET_NX_WINDOW = 0.045;
    const pine = (k, side, dist, h, col, opts) => {
      opts = opts || {};
      const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
      if (spotTaken(a.c[0], a.c[2])) return;
      if (onTrack(a.c[0], a.c[2], 3, Math.max(0.5, h * 0.225))) {
        ctx.noteSuppressed("pine", `pine SUPPRESSED at k=${k} side=${side}: dist=${dist}`);
        return;
      }
      ctx.note("pine", [a.c[0], a.c[1] + h / 2, a.c[2]], [h * 0.45, h, h * 0.45], { k, side });
      if (def.furniture && def.furniture.bakedPines && ctx.bakedModel) {
        out._mat = MAT.FOLIAGE;
        const landed = ctx.bakedModel("pine_lod0", k, side, dist, { height: h });
        out._mat = 0;
        if (landed) return;
      }
      const j = 0.85 + hash(k * 3.7 + side * 1.3 + dist) * 0.3;
      const vr = hash(k * 6.1 + side * 4.4 + dist + 9.3);
      const sparse = opts.sparse != null ? !!opts.sparse : vr > 0.82;
      const lean = opts.lean != null ? opts.lean
        : (!sparse && vr > 0.55 ? (vr - 0.55) * 2.2 : 0);
      const tiers = opts.tiers != null ? Math.max(2, Math.min(6, Math.round(opts.tiers)))
        : (sparse ? 3 : 4);
      const PINE_REF_H = 12;
      const jQ = 0.85 + Math.round((j - 0.85) / 0.15) * 0.15;
      const leanQ = lean <= 0 ? 0 : Math.round(lean / 0.4) * 0.4;
      const s = h / PINE_REF_H;
      const o = [a.c[0] - a.u[0] * 0.5, a.c[1] - a.u[1] * 0.5, a.c[2] - a.u[2] * 0.5];
      const r = side < 0 ? [-a.r[0], -a.r[1], -a.r[2]] : a.r;
      const facets = [];
      {
        const H = PINE_REF_H, w0 = (sparse ? 2.3 : 2.7) * jQ, dy = H * (sparse ? 0.24 : 0.18) * jQ;
        const W = (m) => [o[0] + s * (r[0] * m[0] + a.u[0] * m[1] + a.t[0] * m[2]),
                          o[1] + s * (r[1] * m[0] + a.u[1] * m[1] + a.t[1] * m[2]),
                          o[2] + s * (r[2] * m[0] + a.u[2] * m[1] + a.t[2] * m[2])];
        let y = H * 0.3 + 0.5;
        for (let i = 0; i < tiers; i++, y += dy) {
          const w = w0 * (1 - i * (sparse ? 0.24 : 0.21)), lx = leanQ ? leanQ * (y / H) * 1.6 : 0;
          const ap = W([lx, y + H * 0.32, 0]);
          for (let f = 0; f < 7; f++) {
            const a0 = f / 7 * 6.2832, a1 = (f + 1) / 7 * 6.2832;
            const p0 = W([lx + Math.cos(a0) * w, y, Math.sin(a0) * w]);
            const p1 = W([lx + Math.cos(a1) * w, y, Math.sin(a1) * w]);
            const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], e2 = [ap[0] - p0[0], ap[1] - p0[1], ap[2] - p0[2]];
            const n = norm([e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]);
            facets.push([n[0], n[1], n[2], n[0] * ap[0] + n[1] * ap[1] + n[2] * ap[2]]);
          }
        }
      }
      const reach = ((sparse ? 2.3 : 2.7) * jQ + leanQ * 1.6) * s;
      const near = pineFacetsNear(a.c[0], a.c[2], reach);
      let dz = 0;
      if (near.length) {
        const par = [];
        for (const q of near) for (const F of facets) {
          const fx = F[0], fy = F[1], fz = F[2];
          for (let w = 0; w < 2; w++) {
            const c = w ? -fx : fx;
            for (let i = facetFrom(q, c - FACET_NX_WINDOW) * 4; i < q.length && q[i] <= c + FACET_NX_WINDOW; i += 4) {
              const dot = fx * q[i] + fy * q[i + 1] + fz * q[i + 2];
              if (Math.abs(dot) < 0.999) continue;
              par.push(fy, F[3], dot > 0 ? q[i + 3] : -q[i + 3]);
            }
          }
        }
        const clash = (d) => {
          for (let p = 0; p < par.length; p += 3) if (Math.abs(par[p + 1] - d * par[p] - par[p + 2]) < TrackGeom.MIN_SEP) return true;
          return false;
        };
        for (let i = 0; clash(dz) && i < 12; i++) dz = TrackGeom.SEP_SLOTS[i % 4] + Math.floor(i / 4) * 0.2;
      }
      if (dz) { o[1] -= dz; for (const F of facets) F[3] -= dz * F[1]; }
      pineFacetsAdd(a.c[0], a.c[2], reach, facets);
      ctx.instance(
        `pine|${sparse ? 1 : 0}|${tiers}|${leanQ}|${jQ}`,
        { o, r, u: a.u, t: a.t, s: [s, s, s], col },
        (rec) => {
          const H = PINE_REF_H;
          rec.mat(MAT.WOOD);
          rec.cyl([0, 0, 0], 0.35 + H * 0.02, H * 0.4 + 0.5, [0.30, 0.22, 0.13], 6);
          rec.mat(MAT.FOLIAGE, [H * 0.32, H * 1.15]);
          let y = H * 0.3 + 0.5;
          for (let i = 0; i < tiers; i++) {
            const w = (sparse ? 2.3 : 2.7) * jQ * (1 - i * (sparse ? 0.24 : 0.21));
            rec.cone([leanQ ? leanQ * (y / H) * 1.6 : 0, y, 0],
                     w, H * 0.32, TrackGraph.NODE_COLOR, 7);
            y += H * (sparse ? 0.24 : 0.18) * jQ;
          }
        },
        { kind: "pine", k, side, h });
      out._mat = 0;
    };
    let _crownV0 = -1, _crownBase = null, _crownUp = null;
    const swayOn = (base, up, y0, y1) => {
      out._matAt = TrackGeom.swayMatAt(MAT.FOLIAGE, base, up, y0, y1);
      _crownV0 = out.pos.length / 3; _crownBase = base; _crownUp = up;
    };
    const swayOff = () => {
      out._matAt = null;
      if (_crownV0 >= 0) TrackGeom.roundNormals(out, _crownV0, _crownBase, _crownUp);
      _crownV0 = -1; _crownBase = null; _crownUp = null;
    };
    const TREE_CELL = 24, placedTrees = new Map();
    const treeOccupied = (f, relocated) => {
      const seen = new Set();
      for (let x = Math.floor((f.c[0] - f.ex) / TREE_CELL); x <= Math.floor((f.c[0] + f.ex) / TREE_CELL); x++)
        for (let z = Math.floor((f.c[2] - f.ez) / TREE_CELL); z <= Math.floor((f.c[2] + f.ez) / TREE_CELL); z++)
          for (const site of placedTrees.get(`${x}|${z}`) || []) {
            if (seen.has(site) || (!relocated && !site.relocated)) continue;
            seen.add(site);
            if (palmBoundsOverlap(f, site) && site.parts.some((p) => palmOverlaps(f, p))) return true;
          }
      return false;
    };
    const lobedTree = (k, side, dist, h, col, opts, vr) => {
      const variant = opts.variant === undefined ? Math.floor(vr * 3) : opts.variant;
      if (!Number.isFinite(h) || h <= 0 || !Number.isInteger(variant) || variant < 0 || variant > 2 ||
          (opts.spread !== undefined && opts.spread !== 1) ||
          !Array.isArray(col) || col.length !== 3 || !col.every(Number.isFinite)) return false;
      const a = anchor(k, side, dist), b = [a.r, a.u, a.t], s = h / 12;
      const o = vadd(a.c, a.u, -0.5), lobes = LOBED_CROWNS[variant];
      const at = (x, y, z) => vadd(vadd(vadd(o, a.r, x * s), a.u, y * s), a.t, z * s);
      const parts = [{ type: "cyl", c: o, size: [0.8 * s, 6.7 * s, 0.8 * s], b }];
      for (const [x, z, y, radius, lower, cap] of lobes) {
        parts.push({ type: "frustum", c: at(x, y, z), size: [radius * 2 * s, lower * s, radius * 2 * s], b });
        parts.push({ type: "cone", c: at(x, y + lower, z), size: [radius * 2 * s, cap * s, radius * 2 * s], b });
      }
      const footprints = parts.map(palmFootprint);
      const clear = footprints.every((f, i) => {
        if (rejBox(f.c, [f.w, f.maxY - f.minY, f.d], f.b) ||
            ctx.massBlocked(f.c, f.w, f.d, f.b, 1) || treeOccupied(f, false) ||
            !ctx.barrierClear(f.c[0], f.c[2], Math.hypot(f.w, f.d) / 2)) return false;
        if (!i) return true;
        const p = parts[i], half = p.size[0] / 2;
        for (const [x, z] of [[0, 0], [-half, -half], [-half, half], [half, -half], [half, half]]) {
          const q = vadd(vadd(p.c, a.r, x), a.t, z), ground = terrainYAt(q[0], q[2]);
          if (ground != null && ground > q[1] + 0.02) return false;
        }
        return true;
      });
      if (!clear) {
        ctx.noteSuppressed("tree", `lobed tree SUPPRESSED at k=${k} side=${side}: dist=${dist}`);
        return false;
      }
      if (spotOccupied(a.c[0], a.c[2], false)) return false;
      const segments = ctx.lod(4, 3), trunkSegments = ctx.lod(5, 4);
      const landed = ctx.instance(`tree-lobed|${variant}|${segments}`, {
        o, r: a.r, u: a.u, t: a.t, s: [s, s, s], col,
      }, (rec) => {
        rec.mat(MAT.WOOD);
        rec.cyl([0, 0, 0], 0.4, 6.7, [0.32, 0.23, 0.13], trunkSegments);
        rec.mat(MAT.FOLIAGE, [3.5, 12]);
        for (const [x, z, y, radius, lower, cap] of lobes) {
          rec.frustum([x, y, z], 0.08, radius, lower, TrackGraph.NODE_COLOR, segments);
          rec.cone([x, y + lower, z], radius, cap, TrackGraph.NODE_COLOR, segments);
        }
      }, { kind: "tree", k, side, h, crown: "lobed", variant, whole: true }, { roundNormals: true });
      out._mat = 0; out._matAt = null;
      if (!landed) return false;
      spotTaken(a.c[0], a.c[2]);
      const minX = Math.min(...footprints.map((f) => f.c[0] - f.ex)), maxX = Math.max(...footprints.map((f) => f.c[0] + f.ex));
      const minZ = Math.min(...footprints.map((f) => f.c[2] - f.ez)), maxZ = Math.max(...footprints.map((f) => f.c[2] + f.ez));
      const minY = Math.min(...footprints.map((f) => f.minY)), maxY = Math.max(...footprints.map((f) => f.maxY));
      const site = { parts: footprints, relocated: false, c: [(minX + maxX) / 2, 0, (minZ + maxZ) / 2],
        ex: (maxX - minX) / 2, ez: (maxZ - minZ) / 2, minY, maxY };
      for (let x = Math.floor(minX / TREE_CELL); x <= Math.floor(maxX / TREE_CELL); x++)
        for (let z = Math.floor(minZ / TREE_CELL); z <= Math.floor(maxZ / TREE_CELL); z++) {
          const key = `${x}|${z}`;
          if (!placedTrees.has(key)) placedTrees.set(key, []);
          placedTrees.get(key).push(site);
        }
      ctx.note("tree", [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
        [maxX - minX, maxY - minY, maxZ - minZ], { k, side, dist, crown: "lobed", variant });
      return true;
    };
    const treeInFootprint = (c, w, h, d, b) => {
      const f = palmFootprint({ type: "box", c, size: [w, h, d], b }), seen = new Set();
      for (let x = Math.floor((f.c[0] - f.ex) / TREE_CELL); x <= Math.floor((f.c[0] + f.ex) / TREE_CELL); x++)
        for (let z = Math.floor((f.c[2] - f.ez) / TREE_CELL); z <= Math.floor((f.c[2] + f.ez) / TREE_CELL); z++)
          for (const site of placedTrees.get(`${x}|${z}`) || []) {
            if (seen.has(site)) continue;
            seen.add(site);
            if (palmBoundsOverlap(f, site) && site.parts.some((p) => palmOverlaps(f, p))) return true;
          }
      return false;
    };
    const tree = (k, side, dist, h, col, opts) => {
      const crown = (opts && opts.crown) || "round";
      const sp = (opts && opts.spread) || 1;
      const initialDist = dist;
      const vr = hash(k * 8.3 + side * 5.1 + initialDist + 4.7);
      const deadAt = 1 - ((opts && opts.deadChance != null) ? opts.deadChance : 0.09);
      if (crown === "lobed" && vr <= deadAt) return lobedTree(k, side, dist, h, col, opts, vr);
      const j = 0.85 + hash(k * 2.9 + side * 1.7 + initialDist) * 0.3;
      const lean = vr > 0.55 ? (vr - 0.55) * 1.4 : 0;
      const partsAt = (p) => {
        const basis = [p.r, p.u, p.t], parts = [];
        const part = (type, y, radius, height, x = 0, bb = basis) =>
          parts.push({ type, c: vadd(vadd(p.c, p.u, y), p.r, x), size: [radius * 2, height, radius * 2], b: bb });
        if (vr > deadAt) {
          part("cyl", -0.5, 0.32, h * 0.7 + 0.5);
          for (let i = 0; i < 3; i++) {
            const bh = hash(k * 11 + i * 3.1 + initialDist), angle = (i / 3 + bh * 0.4) * 6.2832;
            const bu = p.u.map((v, axis) => v * 0.7 + (p.r[axis] * Math.cos(angle) + p.t[axis] * Math.sin(angle)) * 0.7);
            part("cyl", h * 0.7 + i * 0.25, 0.09, 1.6 + bh * 1.4, 0, [p.r, bu, p.t]);
          }
        } else {
          part("cyl", -0.5, 0.4, h * 0.55 + 0.5);
          part("cone", h * 0.20, (3.5 + h * 0.135) * j, h * 0.14);
          if (crown === "vase") {
            part("cone", h * 0.34, (2.1 + h * 0.07) * j * sp, h * 0.28);
            part("cone", h * 0.56, (3.4 + h * 0.15) * j * sp, h * 0.28);
            part("cone", h * 0.78, (4.0 + h * 0.17) * j * sp, h * 0.24, lean);
          } else if (crown === "weeping") {
            part("cone", h * 0.62, (3.6 + h * 0.15) * j * sp, h * 0.30);
            part("frustum", h * 0.24, (3.9 + h * 0.16) * j * sp, h * 0.40);
          } else if (crown === "columnar") {
            part("cone", h * 0.30, (1.5 + h * 0.05) * j * sp, h * 0.36);
            part("cone", h * 0.56, (1.2 + h * 0.04) * j * sp, h * 0.34);
            part("cone", h * 0.80, (0.8 + h * 0.03) * j * sp, h * 0.26);
          } else {
            part("cone", h * 0.28, (3.3 + h * 0.13) * j * sp, h * 0.30);
            part("cone", h * 0.46, (3.7 + h * 0.14) * j * sp, h * 0.26);
            part("cone", h * 0.66, (2.9 + h * 0.10) * j * sp, h * 0.26, lean);
            part("cone", h * 0.82, (1.7 + h * 0.06) * j * sp, h * 0.22, lean * 1.6);
          }
        }
        return parts;
      };
      const clearAt = (p, relocated = false) => !onTrack(p.c[0], p.c[2], 4, Math.max(0.5, h * 0.3 * sp)) &&
        partsAt(p).every((part) => {
          const f = palmFootprint(part);
          return !ctx.massBlocked(f.c, f.w, f.d, f.b, 1) &&
            !treeOccupied(f, relocated) &&
            ctx.barrierClear(f.c[0], f.c[2], Math.hypot(f.w, f.d) / 2) &&
            !rejBox(f.c, [f.w, f.maxY - f.minY, f.d], f.b);
        });
      let a = anchor(k, side, dist);
      if (!clearAt(a)) {
        let found = false;
        for (let extra = 1.5; extra <= 12; extra += 1.5) {
          dist = initialDist + extra;
          a = anchor(k, side, dist);
          if (clearAt(a, true)) { found = true; break; }
        }
        if (!found) {
          ctx.noteSuppressed("tree", `tree SUPPRESSED by occupied ground at k=${k} side=${side}: dist=${initialDist}`);
          return;
        }
      }
      const b = [a.r, a.u, a.t];
      if (spotTaken(a.c[0], a.c[2])) return;
      const reserve = () => {
        const parts = partsAt(a).map(palmFootprint);
        const minX = Math.min(...parts.map((f) => f.c[0] - f.ex)), maxX = Math.max(...parts.map((f) => f.c[0] + f.ex));
        const minZ = Math.min(...parts.map((f) => f.c[2] - f.ez)), maxZ = Math.max(...parts.map((f) => f.c[2] + f.ez));
        const site = { parts, relocated: dist !== initialDist, c: [(minX + maxX) / 2, 0, (minZ + maxZ) / 2],
          ex: (maxX - minX) / 2, ez: (maxZ - minZ) / 2,
          minY: Math.min(...parts.map((f) => f.minY)), maxY: Math.max(...parts.map((f) => f.maxY)) };
        for (let x = Math.floor(minX / TREE_CELL); x <= Math.floor(maxX / TREE_CELL); x++)
          for (let z = Math.floor(minZ / TREE_CELL); z <= Math.floor(maxZ / TREE_CELL); z++) {
            const key = `${x}|${z}`;
            if (!placedTrees.has(key)) placedTrees.set(key, []);
            placedTrees.get(key).push(site);
          }
      };
      const treeRec = ctx.note("tree", [a.c[0], a.c[1] + h / 2, a.c[2]], [h * 0.5, h, h * 0.5], { k, side, dist, initialDist });
      const refuseTree = () => { out._mat = 0; if (ctx.unnote) ctx.unnote(treeRec); };
      if (vr > deadAt) {
        const th = h * 0.7;
        out._mat = MAT.WOOD;
        if (addCyl(out, vadd(a.c, a.u, -0.5), 0.32, th + 0.5, [0.28, 0.22, 0.16], 6, b) === false) { refuseTree(); return; }
        const top = vadd(a.c, a.u, th);
        for (let i = 0; i < 3; i++) {
          const bh = hash(k * 11 + i * 3.1 + initialDist);
          const ang = (i / 3 + bh * 0.4) * 6.2832;
          const ca = Math.cos(ang), sa = Math.sin(ang);
          const bu = [
            a.u[0] * 0.7 + (a.r[0] * ca + a.t[0] * sa) * 0.7,
            a.u[1] * 0.7 + (a.r[1] * ca + a.t[1] * sa) * 0.7,
            a.u[2] * 0.7 + (a.r[2] * ca + a.t[2] * sa) * 0.7
          ];
          addCyl(out, vadd(top, a.u, i * 0.25), 0.09, 1.6 + bh * 1.4, [0.30, 0.24, 0.17], 4, [a.r, bu, a.t]);
        }
        reserve();
        out._mat = 0;
        return;
      }
      const c2 = [col[0] * 0.88, col[1] * 0.9, col[2] * 0.84];
      out._mat = MAT.WOOD;
      if (addCyl(out, vadd(a.c, a.u, -0.5), 0.4, h * 0.55 + 0.5, [0.32, 0.23, 0.13], 6, b) === false) { refuseTree(); return; }
      out._mat = MAT.FOLIAGE;
      swayOn(a.c, a.u, h * 0.22, h * 1.0);
      {
        const usR = (3.5 + h * 0.135) * j;
        const ringY = h * 0.34, apexY = h * 0.20;
        const usCol = [col[0] * 0.5, col[1] * 0.52, col[2] * 0.5];
        const uref = vadd(a.c, a.u, h * 0.7);
        const apex = vadd(a.c, a.u, apexY);
        const ring = (ang) => vadd(vadd(vadd(a.c, a.u, ringY), a.r, Math.cos(ang) * usR), a.t, Math.sin(ang) * usR);
        const hidden = (tri) => {
          const top = Math.max(tri[0][1], tri[1][1], tri[2][1]) - 0.02;
          let sx = 0, sy = 0, sz = 0, m = 0, seen = 0;
          const under = (x, y, z) => { const ty = terrainYAt(x, z); if (ty === null) return true; seen++; return ty > y; };
          for (const p of tri) {
            if (p[1] < top) continue;
            if (!under(p[0], p[1], p[2])) return false;
            sx += p[0]; sy += p[1]; sz += p[2]; m++;
          }
          return under(sx / m, sy / m, sz / m) && seen > 0;
        };
        for (let i = 0; i < 9; i++) {
          const a0 = i / 9 * 6.2832, a1 = (i + 1) / 9 * 6.2832;
          const tri = [ring(a0), ring(a1), apex];
          if (hidden(tri)) continue;
          emit(out, tri, usCol, uref);
        }
      }
      if (crown === "vase") {
        addCone(out, vadd(a.c, a.u, h * 0.34), (2.1 + h * 0.07) * j * sp, h * 0.28, col, 8, b);
        addCone(out, vadd(a.c, a.u, h * 0.56), (3.4 + h * 0.15) * j * sp, h * 0.28, col, 9, b);
        addCone(out, vadd(vadd(a.c, a.u, h * 0.78), a.r, lean), (4.0 + h * 0.17) * j * sp, h * 0.24, c2, 9, b);
      } else if (crown === "weeping") {
        addCone(out, vadd(a.c, a.u, h * 0.62), (3.6 + h * 0.15) * j * sp, h * 0.30, col, 9, b);
        addFrustum(out, vadd(a.c, a.u, h * 0.24), (1.4 + h * 0.05) * j * sp,
          (3.9 + h * 0.16) * j * sp, h * 0.40, c2, 9, b);
      } else if (crown === "columnar") {
        addCone(out, vadd(a.c, a.u, h * 0.30), (1.5 + h * 0.05) * j * sp, h * 0.36, col, 7, b);
        addCone(out, vadd(a.c, a.u, h * 0.56), (1.2 + h * 0.04) * j * sp, h * 0.34, col, 7, b);
        addCone(out, vadd(a.c, a.u, h * 0.80), (0.8 + h * 0.03) * j * sp, h * 0.26, c2, 6, b);
      } else {
        addCone(out, vadd(a.c, a.u, h * 0.28), (3.3 + h * 0.13) * j * sp, h * 0.30, col, 9, b);
        addCone(out, vadd(a.c, a.u, h * 0.46), (3.7 + h * 0.14) * j * sp, h * 0.26, col, 9, b);
        addCone(out, vadd(vadd(a.c, a.u, h * 0.66), a.r, lean), (2.9 + h * 0.10) * j * sp, h * 0.26, c2, 8, b);
        addCone(out, vadd(vadd(a.c, a.u, h * 0.82), a.r, lean * 1.6), (1.7 + h * 0.06) * j * sp, h * 0.22, c2, 7, b);
      }
      reserve();
      out._mat = 0; swayOff();
    };
    const placedPalms = [];
    const palm = (k, side, dist, h, frond) => {
      let a = anchor(k, side, dist);
      if (onTrack(a.c[0], a.c[2], 4)) {
        ctx.noteSuppressed("palm", `palm SUPPRESSED at k=${k} side=${side}: dist=${dist}`);
        return;
      }
      const frCol = frond || [0.18, 0.40, 0.16];
      const frDark = [frCol[0] * 0.8, frCol[1] * 0.82, frCol[2] * 0.78];
      const partsAt = () => {
        const b = [a.r, a.u, a.t], parts = [];
        const lean = (hash(k * 3.3 + side * 2.1 + dist) - 0.5) * 0.5, seg = h / 3;
        const joint = (t) => vadd(vadd(a.c, a.u, t * seg), a.r, lean * t * t * 0.4 * side);
        for (let t = 0; t < 3; t++) {
          const p0 = t ? joint(t) : vadd(a.c, a.u, -0.6), p1 = joint(t + 1);
          const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
          const L = Math.hypot(d[0], d[1], d[2]) || seg, rad = 0.34 - t * 0.06;
          parts.push({ type: "cyl", c: p0, size: [rad * 2, L, rad * 2],
            b: [a.r, [d[0] / L, d[1] / L, d[2] / L], a.t], col: [0.45 - t * 0.03, 0.36, 0.22] });
        }
        const base = joint(3), top = vadd(base, a.u, -0.35);
        parts.push({ type: "box", c: top, size: [1.7, 1.2, 1.7], b, col: frDark });
        for (let i = 0; i < 9; i++) {
          const ang = (i / 9 + hash(k + i * 1.7) * 0.06) * 6.2832, dir = [Math.cos(ang), 0, Math.sin(ang)];
          const fr = [dir[0] * a.r[0] + dir[2] * a.t[0], 0, dir[0] * a.r[2] + dir[2] * a.t[2]];
          const droop = 0.45 + hash(k * 2.1 + i) * 0.5;
          const fu = [fr[0] * droop + a.u[0] * (1 - droop), a.u[1] * (1 - droop * 0.7), fr[2] * droop + a.u[2] * (1 - droop)];
          const len = 5.0 + hash(k + i * 3.3) * 2.0;
          parts.push({ type: "prism", c: vadd(vadd(top, fr, 2.4), a.u, 0.15),
            size: [1.9, 0.5, len], b: [fr, fu, [-fr[2], 0, fr[0]]], col: i % 2 ? frCol : frDark });
        }
        for (let i = 0; i < 3; i++) {
          const ang = i / 3 * 6.2832;
          parts.push({ type: "box", c: vadd(vadd(top, a.r, Math.cos(ang) * 0.5), a.t, Math.sin(ang) * 0.5),
            size: [0.34, 0.34, 0.34], b, col: [0.32, 0.24, 0.14] });
        }
        return { parts, base };
      };
      const footprintsClear = (parts, barriers) => parts.every((part) => {
        const f = palmFootprint(part);
        return !ctx.massBlocked(f.c, f.w, f.d, f.b, 1) &&
          !placedPalms.some((p) => (barriers || p.relocated) && palmBoundsOverlap(f, p) &&
            p.parts.some((q) => palmOverlaps(f, q))) &&
          (!barriers || ctx.barrierClear(f.c[0], f.c[2], Math.hypot(f.w, f.d) / 2));
      });
      const foliageClear = (parts) => parts.slice(3).every((part) => palmVertices(part).every((v) => {
        const ground = typeof Tracks !== "undefined" && typeof Tracks.terrainY === "function"
          ? Tracks.terrainY(track, v[0], v[2]) : terrainYAt(v[0], v[2]);
        return Number.isFinite(ground) && v[1] >= ground;
      }));
      let assembly = partsAt();
      const initialDist = dist;
      if (!footprintsClear(assembly.parts, false)) {
        let clear = false;
        for (let extra = 1.5; extra <= 12; extra += 1.5) {
          dist = initialDist + extra;
          a = anchor(k, side, dist);
          if (onTrack(a.c[0], a.c[2], 4)) continue;
          assembly = partsAt();
          if (!footprintsClear(assembly.parts, true) || !foliageClear(assembly.parts)) continue;
          clear = true;
          break;
        }
        if (!clear) {
          ctx.noteSuppressed("palm", `palm SUPPRESSED by occupied ground at k=${k} side=${side}: dist=${initialDist}`);
          return;
        }
      }
      ctx.note("palm", [a.c[0], a.c[1] + h / 2, a.c[2]], [h * 0.6, h, h * 0.6], { k, side, dist, initialDist });
      const base = assembly.base;
      const hb = (base[0] - a.c[0]) * a.u[0] + (base[1] - a.c[1]) * a.u[1] + (base[2] - a.c[2]) * a.u[2];
      assembly.parts.forEach((part, i) => {
        if (i === 3) swayOn(a.c, a.u, hb - 1.2, hb + 0.8);
        if (i === 13) swayOff();
        out._mat = i >= 3 && i < 13 ? MAT.FOLIAGE : MAT.WOOD;
        if (part.type === "cyl") addCyl(out, part.c, part.size[0] / 2, part.size[1], part.col, 6, part.b);
        else if (part.type === "prism") addPrism(out, part.c, part.size, part.col, part.b);
        else addBox(out, part.c, part.size, part.col, part.b);
      });
      const footprints = assembly.parts.map(palmFootprint);
      const minX = Math.min(...footprints.map((f) => f.c[0] - f.ex)), maxX = Math.max(...footprints.map((f) => f.c[0] + f.ex));
      const minZ = Math.min(...footprints.map((f) => f.c[2] - f.ez)), maxZ = Math.max(...footprints.map((f) => f.c[2] + f.ez));
      placedPalms.push({ parts: footprints, relocated: dist !== initialDist,
        c: [(minX + maxX) / 2, 0, (minZ + maxZ) / 2], ex: (maxX - minX) / 2, ez: (maxZ - minZ) / 2,
        minY: Math.min(...footprints.map((f) => f.minY)), maxY: Math.max(...footprints.map((f) => f.maxY)) });
      out._mat = 0;
    };
    const conifer = (k, side, dist, h, col) => {
      const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
      if (onTrack(a.c[0], a.c[2], 3)) return;
      const c2 = [col[0] * 0.86, col[1] * 0.92, col[2] * 0.82];
      const vr = hash(k * 6.7 + side * 2.3 + dist), j = 0.85 + hash(k * 3.1 + side * 1.7 + dist) * 0.3;
      const lean = vr > 0.6 ? (vr - 0.6) * 1.3 * side : 0;
      out._mat = MAT.WOOD;
      if (addCyl(out, vadd(a.c, a.u, -0.5), 0.3, h * 0.20 + 0.5, [0.34, 0.24, 0.15], 5, b) === false) { out._mat = 0; return; }
      out._mat = MAT.FOLIAGE;
      swayOn(a.c, a.u, h * 0.20, h * 1.1);
      addCone(out, vadd(vadd(a.c, a.u, h * 0.14), a.r, lean * 0.14), (2.1 + h * 0.06) * j, h * 0.44, col, 7, b);
      addCone(out, vadd(vadd(a.c, a.u, h * 0.42), a.r, lean * 0.42), (1.6 + h * 0.05) * j, h * 0.38, col, 6, b);
      addCone(out, vadd(vadd(a.c, a.u, h * 0.70), a.r, lean * 0.70), (1.0 + h * 0.04) * j, h * 0.34, c2, 6, b);
      addCone(out, vadd(vadd(a.c, a.u, h * 0.88), a.r, lean * 0.88), (0.6 + h * 0.03) * j, h * 0.28, c2, 5, b);
      out._mat = 0; swayOff();
    };

    const cypress = (k, side, dist, h, col, opts) => {
      opts = opts || {};
      const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
      const slim = opts.slim != null ? Math.max(0.4, Math.min(2.2, opts.slim)) : 1;
      if (onTrack(a.c[0], a.c[2], 1.6 * slim + 0.6)) {
        ctx.noteSuppressed("cypress", `cypress SUPPRESSED at k=${k} side=${side}: dist=${dist}`);
        return;
      }
      ctx.note("cypress", [a.c[0], a.c[1] + h / 2, a.c[2]], [3 * slim, h, 3 * slim], { k, side });
      const dark = hash(k * 7.3 + side * 2.1 + dist) < 0.5;
      const c = dark ? [col[0] * 0.78, col[1] * 0.82, col[2] * 0.80] : col;
      out._mat = MAT.WOOD;
      addCyl(out, vadd(a.c, a.u, -0.4), 0.22, h * 0.18 + 0.4, opts.trunkCol || [0.30, 0.22, 0.14], 5, b);
      out._mat = MAT.FOLIAGE;
      swayOn(a.c, a.u, h * 0.15, h * 1.0);
      addCone(out, vadd(a.c, a.u, h * 0.10), 1.45 * slim, h * 0.58, c, 6, b);
      addCone(out, vadd(a.c, a.u, h * 0.44), 1.10 * slim, h * 0.42, c, 6, b);
      addCone(out, vadd(a.c, a.u, h * 0.70), 0.70 * slim, h * 0.32, c, 6, b);
      out._mat = 0; swayOff();
    };

    const stonePine = (k, side, dist, h, col, opts) => {
      opts = opts || {};
      const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
      const spread = opts.spread != null ? Math.max(0.5, Math.min(1.8, opts.spread)) : 1;
      if (onTrack(a.c[0], a.c[2], h * 0.44 * spread + 0.6)) {
        ctx.noteSuppressed("stonePine", `stonePine SUPPRESSED at k=${k} side=${side}: dist=${dist}`);
        return;
      }
      ctx.note("stonePine", [a.c[0], a.c[1] + h * 0.7, a.c[2]],
               [h * 0.9 * spread, h, h * 0.9 * spread], { k, side });
      const amt = opts.lean != null ? Math.max(0, Math.min(1.5, opts.lean)) : 1;
      const lean = (hash(k * 13.1 + side * 3.7 + dist) - 0.5) * 0.9 * amt;
      const foot = vadd(a.c, a.r, lean * 0.6);
      out._mat = MAT.WOOD;
      addCyl(out, vadd(foot, a.u, -0.5), 0.20 + h * 0.014, h * 0.66 + 0.5,
             opts.trunkCol || [0.40, 0.31, 0.23], 5, b);
      out._mat = MAT.FOLIAGE;
      swayOn(foot, a.u, h * 0.58, h * 1.0);
      const crown = vadd(vadd(foot, a.u, h * 0.60), a.r, lean);
      addFrustum(out, crown, h * 0.12 * spread, h * 0.44 * spread, h * 0.16, col, 7, b);
      addCone(out, vadd(crown, a.u, h * 0.16), h * 0.44 * spread, h * 0.22, col, 7, b);
      out._mat = 0; swayOff();
    };

    const broadleafFall = (k, side, dist, h, col, opts) => {
      opts = opts || {};
      const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
      const spread = opts.spread != null ? Math.max(0.5, Math.min(1.8, opts.spread)) : 1;
      if (onTrack(a.c[0], a.c[2], h * 0.50 * spread + 0.8)) {
        ctx.noteSuppressed("broadleafFall", `broadleafFall SUPPRESSED at k=${k} side=${side}: dist=${dist}`);
        return;
      }
      ctx.note("broadleafFall", [a.c[0], a.c[1] + h * 0.6, a.c[2]],
               [h * 1.0 * spread, h, h * 1.0 * spread], { k, side });
      const lobes = Math.max(2, Math.min(5, Math.round(opts.lobes || 3)));
      out._mat = MAT.WOOD;
      if (addCyl(out, vadd(a.c, a.u, -0.5), 0.22 + h * 0.012, h * 0.42 + 0.5,
             opts.barkCol || [0.36, 0.30, 0.24], 5, b) === false) { out._mat = 0; return; }
      out._mat = MAT.FOLIAGE;
      swayOn(a.c, a.u, h * 0.40, h * 1.05);
      const c2 = [col[0] * 0.82, col[1] * 0.80, col[2] * 0.76];
      for (let i = 0; i < lobes; i++) {
        const ang = i * (6.2832 / lobes) + hash(k + i * 1.9 + side) * 1.2, rr = h * 0.16 * spread;
        const p = vadd(vadd(vadd(a.c, a.u, h * (0.40 + i * 0.09)),
                            a.r, Math.cos(ang) * rr), a.t, Math.sin(ang) * rr);
        addFrustum(out, p, h * (0.30 - i * 0.05) * spread, h * (0.34 - i * 0.08) * spread,
                   h * 0.26, i ? c2 : col, 6, b);
      }
      addCone(out, vadd(a.c, a.u, h * 0.76), h * 0.24 * spread, h * 0.30, col, 6, b);
      out._mat = 0; swayOff();
    };

    const acacia = (k, side, dist, h, col, opts) => {
      opts = opts || {};
      const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
      const spread = opts.spread != null ? Math.max(2, opts.spread) : h * 1.15;
      if (onTrack(a.c[0], a.c[2], spread * 0.5 + 0.8)) {
        ctx.noteSuppressed("acacia", `acacia SUPPRESSED at k=${k} side=${side}: dist=${dist}`);
        return;
      }
      ctx.note("acacia", [a.c[0], a.c[1] + h * 0.8, a.c[2]], [spread, h, spread], { k, side });
      const bark = opts.barkCol || [0.34, 0.26, 0.18];
      const layers = Math.max(1, Math.min(3, Math.round(opts.layers || 2)));
      const c2 = [col[0] * 0.82, col[1] * 0.86, col[2] * 0.80];
      const layerY = (i) => h * 0.80 + i * Math.min(h * 0.14, 1.0);
      const thick = (i) => i === 0 ? Math.max(0.9, 2 * (h * 0.12 - 0.90)) : 0.9 - i * 0.2;
      const JOINT = 0.14;
      const close = (lo, hi) => hi - lo <= JOINT ? lo : hi;
      const forkY = close(h * 0.68 + 0.35, layerY(0) - thick(0) / 2) - 0.35;
      const trunkTop = close(h * 0.62, forkY - 0.35);
      out._mat = MAT.WOOD;
      if (addCyl(out, vadd(a.c, a.u, -0.5), 0.28, trunkTop + 0.5, bark, 5, b) === false) { out._mat = 0; return; }
      for (const dr of [-1, 1])
        addBox(out, vadd(vadd(a.c, a.u, forkY), a.r, dr * spread * 0.22),
               [spread * 0.44, 0.7, 0.22], bark, b);
      out._mat = MAT.FOLIAGE;
      swayOn(a.c, a.u, trunkTop, h * 1.1);
      for (let i = 0; i < layers; i++) {
        const f = 1 - i * 0.4;
        const top = layerY(i) + thick(i) / 2;
        const bot0 = layerY(i) - thick(i) / 2, below = i ? layerY(i - 1) + thick(i - 1) / 2 : bot0;
        const bot = bot0 - below <= JOINT ? bot0 : below - 0.02;
        addBox(out, vadd(a.c, a.u, (top + bot) / 2),
               [spread * f, top - bot, spread * f], i % 2 ? c2 : col, b);
      }
      out._mat = 0; swayOff();
    };

    const plane = (k, side, dist, h, col, opts) => {
      opts = opts || {};
      const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
      const spread = opts.spread != null ? Math.max(0.5, Math.min(1.8, opts.spread)) : 1;
      const rad = (4.2 + h * 0.12) * spread;
      if (onTrack(a.c[0], a.c[2], rad + 0.6)) {
        ctx.noteSuppressed("plane", `plane SUPPRESSED at k=${k} side=${side}: dist=${dist}`);
        return;
      }
      ctx.note("plane", [a.c[0], a.c[1] + h * 0.6, a.c[2]], [rad * 2, h, rad * 2], { k, side });
      const stages = Math.max(1, Math.min(3, Math.round(opts.stages || 2)));
      const c2 = [col[0] * 0.80, col[1] * 0.84, col[2] * 0.80];
      out._mat = MAT.WOOD;
      if (addCyl(out, vadd(a.c, a.u, -0.5), 0.42, h * 0.48 + 0.5,
             opts.trunkCol || [0.72, 0.70, 0.62], 6, b) === false) { out._mat = 0; return; }
      out._mat = MAT.FOLIAGE;
      swayOn(a.c, a.u, h * 0.46, h * 1.1);
      let base = 0;
      for (let i = 0; i < stages; i++) {
        const sh = h * (0.34 - i * 0.10);
        const y = i < 2 ? h * (0.46 + i * 0.28) : base - h * 0.01 + sh / 2;
        addCyl(out, vadd(a.c, a.u, y), rad * (1 - i * 0.28), sh, i ? c2 : col, 7, b);
        base = y + sh / 2;
      }
      out._mat = 0; swayOff();
    };

    const { peak, mountain, ridge } = SceneryLandforms.create(ctx);
    const crowdBank = (k, side, gap, len, rise, depth, riserCol, lift) => {
      const a = anchor(k, side, gap), b = [a.r, a.u, a.t];
      const rows = Math.max(3, Math.round(rise / 1.4));
      const perRow = Math.max(6, Math.round(len / 1.15));
      const riser = riserCol || (NIGHT ? [0.10, 0.10, 0.13] : [0.28, 0.26, 0.27]);
      const y0 = lift || 0;
      let placed = 0;
      for (let r = 0; r < rows; r++) {
        const f = (r + 0.5) / rows, up = y0 + f * rise, back = f * depth;
        out._mat = MAT.CONCRETE;
        const riserC = vadd(vadd(a.c, a.u, up), a.r, side * back);
        if (rejBox(riserC, [1.3, 1.5, len], b)) continue;
        placed++;
        ctx.instance(`crowd-riser|${riser.join(",")}`,
          { o: riserC, r: a.r, u: a.u, t: a.t, s: [1, 1, len] },
          (rec) => { rec.mat(MAT.CONCRETE); rec.box([0, 0, 0], [1.3, 1.5, 1], riser); },
          { kind: "crowdRiser", k, side }, { unguarded: true });
        out._mat = MAT.FABRIC;
        if (rejBox(vadd(vadd(a.c, a.u, up + 0.55), a.r, side * back), [1.3, 1.1, len], b)) continue;
        for (let s2 = 0; s2 < perRow; s2++) {
          if (s2 % 10 === 9) continue;
          const h1 = hash(k * 2.7 + r * 5.3 + s2 * 1.9 + side * 3.1);
          const h2 = hash(k * 1.3 + r * 8.1 + s2 * 4.7 + side * 2.2);
          if (h2 > 0.86) continue;
          const along = ((s2 + 0.5) / perRow - 0.5) * len + (h1 - 0.5) * 0.45;
          const c = vadd(vadd(vadd(a.c, a.t, along), a.u, up + 0.55), a.r, side * back);
          let col;
          if (NIGHT) {
            col = h1 > 0.955 ? [2.6, 2.4, 2.0]
                : h1 > 0.55  ? [0.09, 0.10, 0.13]
                             : [0.16, 0.16, 0.21];
          } else {
            col = CROWD_DAY[Math.floor(h1 * CROWD_DAY.length) % CROWD_DAY.length];
          }
          ctx.instance("crowd-body",
            { o: c, r: a.r, u: a.u, t: a.t, s: [1, 0.72 + h2 * 0.2, 1], col },
            (rec) => { rec.mat(MAT.FABRIC); rec.box([0, 0, 0], [0.55, 1, 0.5], TrackGraph.NODE_COLOR); },
            { kind: "crowd", k, side }, { unguarded: true });
        }
      }
      out._mat = 0;
      return placed;
    };
    const grandstandEx = (s, side, gap, len, shell, crowd, opts) => {
      opts = opts || {};
      const lib = TrackSceneryData.STAND_LIVERIES || {};
      let liveryName = opts.livery;
      if (!liveryName && !shell) {
        const set = (def && def.standSet) || TrackSceneryData.STAND_SET_DEF;
        if (set && set.length) {
          const kk = ((Math.round(s * n) % n) + n) % n;
          liveryName = set[Math.floor(hash(kk * 2.7 + side * 1.9) * set.length) % set.length];
        }
      }
      const liv = (liveryName && lib[liveryName]) || null;
      shell = shell || (liv && liv.shell) || null;
      crowd = crowd || (liv && liv.crowd) || null;
      const roofKind = opts.roof || "cantilever";
      const roofCol = opts.roofCol || (liv && liv.roof) || [0.86, 0.88, 0.92];
      const fasciaCol = opts.fasciaCol || (liv && liv.fascia) || shell || [0.40, 0.41, 0.46];
      const tiers = Math.max(1, Math.min(3, Math.round(opts.tiers || 1)));
      const shellH = opts.h != null ? Math.max(6, opts.h) : 12;

      const k = ((Math.round(s * n) % n) + n) % n;
      const halfFrac = (len / 2) / track.total;
      recordBarrier(s - halfFrac, s + halfFrac, side, gap);
      ctx.indexSolid(s - halfFrac, s + halfFrac, side, gap, 12.5);
      const r = [track.rx[k], track.ry[k], track.rz[k]];
      const t = [track.tx[k], track.ty[k], track.tz[k]];
      const u = upOf(track, k);
      const oInner = side * (hw[k] + gap);
      const ifx = px[k] + r[0] * oInner, ifz = pz[k] + r[2] * oInner;
      if (onTrack(ifx, ifz, 0)) {
        ctx.noteSuppressed("grandstand", `grandstand SUPPRESSED at s=${s} side=${side}: gap=${gap} (inner face on track)`);
        return;
      }
      ctx.note("grandstand", [px[k] + r[0] * oInner, groundYAt(k, gap) + 6, pz[k] + r[2] * oInner],
               [10, 12, len], { k, side });
      gap += (standSeq++ & 1) * TrackGeom.MIN_SEP;
      const SHELL_IN = 6, SHELL_OUT = 12.5, SEP = TrackGeom.MIN_SEP;
      const BANK_AT = 1.5, BANK_RISE = 7, BANK_DEPTH = 4.2, TIER_BACK = 4.6, TIER_LIFT = 7.6;
      const bankRows = Math.max(3, Math.round(BANK_RISE / 1.4));
      const rakeBack = (i) => BANK_AT + TIER_BACK * i + BANK_DEPTH * (bankRows - 0.5) / bankRows + 0.65;
      const rakeFloor = (lift) => lift + BANK_RISE * 0.5 / bankRows - 0.75;
      const shellCol = shell || [0.40, 0.41, 0.46];
      const dotU = (p) => p[0] * u[0] + p[1] * u[1] + p[2] * u[2];
      const shellSection = (a, b, capU) => {
        if (b - a < 0.3) return null;
        const mid = (a + b) / 2, o = side * (hw[k] + gap + mid);
        const base = [px[k] + r[0] * o, groundYAt(k, gap + mid) - 0.8, pz[k] + r[2] * o];
        if (capU == null) {
          const c = [base[0], base[1] + shellH / 2, base[2]];
          addBox(out, c, [b - a, shellH, len], shellCol, [r, u, t]);
          return { top: c[1] + shellH / 2 };
        }
        const h = Math.min(shellH, capU - dotU(base));
        if (h < 1) return null;
        const c = vadd(base, u, h / 2);
        addBox(out, c, [b - a, h, len], shellCol, [r, u, t]);
        return { top: c[1] + h / 2 };
      };
      const riserTint = crowd ? [crowd[0] * 0.4, crowd[1] * 0.4, crowd[2] * 0.4] : null;
      const bankPlaced = crowdBank(k, side, gap + BANK_AT, len - 2, BANK_RISE, BANK_DEPTH, riserTint);
      if (bankPlaced === 0) {
        ctx.noteSuppressed("grandstand",
          `grandstand SUPPRESSED at s=${s} side=${side}: gap=${gap} (no seating rows cleared rejBox)`);
        return;
      }
      const tierLift = [];
      let prevBack = rakeBack(0), shellFront = SHELL_IN;
      for (let ti = 1; ti < tiers; ti++) {
        const lift = TIER_LIFT * ti, back = TIER_BACK * ti, tl = len - 2 - ti * 4;
        if (tl < 8) break;
        const ca = anchor(k, side, gap + BANK_AT + back);
        const cb = [ca.r, ca.u, ca.t];
        const capU = dotU(ca.c) + rakeFloor(lift) - 0.1;
        const bandA = prevBack + SEP, bandO = side * (hw[k] + gap + bandA + 0.25);
        const bandBase = [px[k] + r[0] * bandO, 0, pz[k] + r[2] * bandO];
        const bandC = vadd(bandBase, u, capU - 0.05 - 0.9 - dotU(bandBase));
        if (!rejBox(bandC, [0.5, 1.8, tl], cb)) {
          addBox(out, bandC, [0.5, 1.8, tl], fasciaCol, cb);
          crowdBank(k, side, gap + BANK_AT + back, tl, BANK_RISE, BANK_DEPTH, riserTint, lift);
          shellSection(Math.max(shellFront, bandA + 1.5 * SEP), Math.min(SHELL_OUT, rakeBack(ti)), capU);
          prevBack = rakeBack(ti);
          shellFront = prevBack + 2.5 * SEP;
          tierLift.push(lift);
        }
      }
      const fullShell = shellSection(shellFront, SHELL_OUT, null);
      const topLift = tierLift.length ? tierLift[tierLift.length - 1] : 0;
      const a = anchor(k, side, gap + 5);
      const roofY = 13 + topLift;
      const roofC = vadd(a.c, a.u, roofY);
      const roofW = roofKind === "truss" ? 12 : (roofKind === "flat" ? 10 : 12);
      let f0 = 5 + roofW / 2 - 4.08, f1 = f0 + 4;
      if (tierLift.length) { f0 = Math.max(f0, shellFront + SEP); f1 = Math.max(f1, f0 + 0.3); }
      const roofExt = Math.max(0, f1 + 0.08 - (5 + roofW / 2));
      const slabC = vadd(roofC, a.r, side * roofExt / 2);
      if (roofKind !== "none") {
        if (roofKind === "truss") {
          addBox(out, slabC, [12 + roofExt, 0.35, len + 2], roofCol, [a.r, a.u, a.t]);
          const bays = Math.max(2, Math.min(14, Math.round(len / 9)));
          for (let i = 0; i < bays; i++) {
            const off = ((i + 0.5) / bays - 0.5) * len;
            addBox(out, vadd(vadd(a.c, a.t, off), a.u, roofY - 0.9), [11.4, 1.1, 0.5], roofCol, [a.r, a.u, a.t]);
          }
        } else {
          const rw = roofKind === "flat" ? 10 : 12;
          addBox(out, slabC, [rw + roofExt, 0.8, len + 2], roofCol, [a.r, a.u, a.t]);
        }
        if (opts.pylons) {
          const posts = Math.max(2, Math.min(12, Math.round(len / 14)));
          const H = roofY - 0.5;
          for (let i = 0; i < posts; i++) {
            const off = ((i + 0.5) / posts - 0.5) * len;
            const pc = vadd(vadd(a.c, a.t, off), a.r, -side * 4.6);
            const drop = Math.max(0, pc[1] - groundUnder(pc[0], pc[2])) + 0.3;
            addCyl(out, vadd(pc, a.u, -drop), 0.28, H + drop,
                   fasciaCol, 6, [a.r, a.u, a.t]);
          }
        }
      }
      if (opts.suites) {
        const sc = anchor(k, side, gap + 7.0);
        const suiteC = vadd(sc.c, sc.u, roofY - 2.6);
        const suiteCol = opts.suiteCol || (NIGHT ? [1.10, 1.02, 0.80] : [0.34, 0.46, 0.58]);
        if (!rejBox(suiteC, [3.2, 3.0, len - 3], [sc.r, sc.u, sc.t]))
          addBox(out, suiteC, [3.2, 3.0, len - 3], suiteCol, [sc.r, sc.u, sc.t]);
      }
      if (opts.endWalls) {
        for (const sgn of [-1, 1]) {
          const base = vadd(a.c, a.t, sgn * (len / 2));
          const drop = Math.max(0, base[1] - groundUnder(base[0], base[2])) + 0.3;
          const h = roofY - 1 + drop;
          const ec = vadd(base, a.u, (roofY - 1) / 2 - drop / 2);
          if (!rejBox(ec, [11, h, 0.5], [a.r, a.u, a.t]))
            addBox(out, ec, [11, h, 0.5], fasciaCol, [a.r, a.u, a.t]);
        }
      }
      if (roofKind !== "none") {
        const fm = (f0 + f1) / 2, oF = side * (hw[k] + gap + fm);
        const shellTop = fullShell && f1 <= SHELL_OUT ? fullShell.top : groundYAt(k, gap + fm) - 0.8;
        const roofUnder = roofC[1] - 0.4;
        if (roofUnder > shellTop - 0.1) {
          addBox(out, [px[k] + r[0] * oF, (shellTop + roofUnder) / 2, pz[k] + r[2] * oF],
                 [f1 - f0, roofUnder - shellTop + 0.2, len], fasciaCol, [r, u, t]);
        }
      }
      if (NIGHT && roofKind !== "none")
        addBox(out, vadd(a.c, a.u, roofY - 0.65), [8.5, 0.28, len - 1], [1.30, 1.12, 0.74], [a.r, a.u, a.t]);
    };
    const grandstand = (s, side, gap, len, shell, crowd) =>
      grandstandEx(s, side, gap, len, shell, crowd, null);

    const spectatorHill = (s0, s1, side, gap, opts) => {
      opts = opts || {};
      const slot = hillSeq++ % 5, SEP = TrackGeom.MIN_SEP;
      gap += 0.017 + slot * SEP;
      const sShift = 0.007 + ((slot * 2) % 5) * SEP;
      const rows = Math.max(2, Math.min(8, Math.round(opts.rows || 4)));
      const rise = opts.rise != null ? opts.rise : 1.15;
      const depth = opts.depth != null ? opts.depth : 2.0;
      const grass = opts.grass || opts.col || [0.26, 0.42, 0.20];
      const riser = opts.riser || [0.30, 0.30, 0.28];
      const dens = opts.density != null ? Math.max(0.05, Math.min(1, opts.density)) : 0.65;
      const step = opts.step || 5;
      ctx.indexSolid(s0, s1, side, gap, rows * depth + 1);
      ctx.along(s0, s1, step, (k, spacing) => {
        const a = anchor(k, side, gap);
        const b = [a.r, a.u, a.t];
        const ac = vadd(a.c, a.t, sShift);
        let previousRow = false;
        for (let r = 0; r < rows; r++) {
          const back = r * depth, up = r * rise;
          const tc = vadd(vadd(ac, a.u, up + rise * 0.5), a.r, side * back);
          const nodes = Math.max(1, Math.round(spacing / ds));
          const prev = anchor((k - nodes + n) % n, side, gap);
          const next = anchor((k + nodes) % n, side, gap);
          const e1x = a.c[0] - prev.c[0], e1z = a.c[2] - prev.c[2];
          const e2x = next.c[0] - a.c[0], e2z = next.c[2] - a.c[2];
          const l1 = Math.hypot(e1x, e1z) || 1, l2 = Math.hypot(e2x, e2z) || 1;
          const κ = Math.atan2(e1x * e2z - e1z * e2x, e1x * e2x + e1z * e2z) / ((l1 + l2) / 2);
          const x = side * (hw[k] + gap + back);
          const curveCap = spacing * Math.min(1.85, Math.max(0.15, 1 + κ * x));
          let treadSpan = curveCap;
          for (const dk of [-nodes, nodes]) {
            const q = anchor((k + dk + n) % n, side, gap);
            const qc = vadd(vadd(vadd(q.c, q.t, sShift), q.u, up + rise * 0.5), q.r, side * back);
            const delta = [qc[0] - tc[0], qc[1] - tc[1], qc[2] - tc[2]];
            const d = Math.hypot(delta[0], delta[1], delta[2]);
            if (!(d > 0)) { treadSpan = 0; break; }
            const proj = (axis) => Math.abs((axis[0] * delta[0] + axis[1] * delta[1] + axis[2] * delta[2]) / d);
            const along = proj(a.t);
            const available = d - depth * proj(a.r) - (rise + 0.5) * proj(a.u);
            if (!(available > 0)) { treadSpan = 0; break; }
            if (along > 0) treadSpan = Math.min(treadSpan, available / along, d * 0.98);
          }
          if (treadSpan > 0 && typeof Tracks !== "undefined" &&
              typeof Tracks.terrainY === "function") {
            const bend = Math.min(0.35, Math.abs(κ * x));
            treadSpan *= 0.96 * (1 - bend);
          }
          if (!(treadSpan > 0) || rejBox(tc, [depth, rise + 0.5, treadSpan], b)) { previousRow = false; continue; }
          let treadC = tc, treadH = rise + 0.5;
          if (r === 0 && a.u[1] > 0.1 && typeof Tracks !== "undefined" && typeof Tracks.terrainY === "function") {
            const bot = vadd(tc, a.u, -treadH / 2);
            let drop = 0;
            for (const [xz, zz] of [[-0.5, -0.5], [-0.5, 0.5], [0.5, -0.5], [0.5, 0.5]]) {
              const q = vadd(vadd(bot, a.r, xz * depth), a.t, zz * treadSpan);
              const y = Tracks.terrainY(track, q[0], q[2]);
              if (!Number.isFinite(y)) { drop = NaN; break; }
              drop = Math.max(drop, q[1] - y);
            }
            if (drop > 0.05) {
              const ext = (drop + 0.05) / a.u[1];
              const c2 = vadd(tc, a.u, -ext / 2);
              if (!rejBox(c2, [depth, treadH + ext, treadSpan], b)) { treadC = c2; treadH += ext; }
            }
          }
          out._mat = MAT.CONCRETE;
          addBox(out, treadC, [depth, treadH, treadSpan], r % 2 ? riser : grass, b);
          if (r > 0 && !previousRow) {
            const bottom = vadd(treadC, a.u, -treadH / 2);
            const pr = norm([a.r[0], 0, a.r[2]]), pt = norm([a.t[0], 0, a.t[2]]);
            const pb = [pr, [0, 1, 0], pt];
            const w = Math.min(0.4, depth * 0.5);
            const d = Math.min(0.4, treadSpan * Math.hypot(a.t[0], a.t[2]) * 0.5);
            let footY = Infinity;
            for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) {
              const q = vadd(vadd(bottom, pr, x), pt, z);
              const y = typeof Tracks !== "undefined" && typeof Tracks.terrainY === "function"
                ? Tracks.terrainY(track, q[0], q[2]) : terrainYAt(q[0], q[2]);
              if (!Number.isFinite(y)) { footY = NaN; break; }
              footY = Math.min(footY, y);
            }
            if (Number.isFinite(footY) && bottom[1] > footY + 0.05) {
              const h = bottom[1] + 0.04 - (footY - 0.05);
              const c = [bottom[0], footY - 0.05 + h / 2, bottom[2]];
              if (!rejBox(c, [w, h, d], pb)) ctx.instance("spectator-hill-footing",
                { o: c, r: pr, u: pb[1], t: pt, s: [w, h, d], col: riser },
                (rec) => { rec.mat(MAT.CONCRETE); rec.box([0, 0, 0], [1, 1, 1], TrackGraph.NODE_COLOR); },
                { kind: "hill-footing", k, side });
            }
          }
          previousRow = true;
          out._mat = MAT.FABRIC;
          const bodyW = 0.5, bodyD = 0.46, edge = 0.03;
          const originalCount = Math.max(2, Math.round(spacing / 1.8));
          const crowdC = vadd(vadd(ac, a.u, up + rise + 0.55), a.r, side * back);
          const crowdOK = !rejBox(crowdC, [depth, 1.1, treadSpan], b);
          const perRow = crowdOK && treadSpan >= bodyD + 2 * edge && depth >= bodyW + 2 * edge
            ? Math.min(originalCount, Math.max(1, Math.floor(treadSpan / 0.6))) : 0;
          const slotSpan = perRow ? treadSpan / perRow : 0;
          const alongJitter = Math.min(0.25, Math.max(0, slotSpan / 2 - bodyD / 2 - edge));
          const backJitter = Math.min(depth / 4, Math.max(0, depth / 2 - bodyW / 2 - edge));
          for (let i = 0; i < perRow; i++) {
            const h1 = hash(k * 3.3 + r * 7.1 + i * 2.3 + side * 1.9);
            if (h1 > dens) continue;
            const h2 = hash(k * 5.9 + r * 2.7 + i * 6.1 + side * 4.3);
            const off = ((i + 0.5) / perRow - 0.5) * treadSpan + (h2 - 0.5) * 2 * alongJitter;
            const c = vadd(vadd(vadd(ac, a.t, off), a.u, up + rise + 0.55),
                           a.r, side * (back + (h2 - 0.5) * 2 * backJitter));
            const col = NIGHT
              ? (h2 > 0.95 ? [2.4, 2.2, 1.9] : [0.12, 0.13, 0.17])
              : (opts.crowd || CROWD_DAY)[Math.floor(h2 * (opts.crowd || CROWD_DAY).length) % (opts.crowd || CROWD_DAY).length];
            ctx.instance("crowd-standing",
              { o: c, r: a.r, u: a.u, t: a.t, s: [1, 0.86 + h1 * 0.2, 1], col },
              (rec) => { rec.mat(MAT.FABRIC); rec.box([0, 0, 0], [0.5, 1, 0.46], TrackGraph.NODE_COLOR); },
              { kind: "crowd", k, side }, { unguarded: true });
          }
          out._mat = 0;
        }
      });
    };
    const HEDGE_W = 2.4;
    const hedge = (s0, s1, side, gap, h, col) => {
      const blocked = new Set();
      ctx.along(s0, s1, 4, (k) => {
        const p = anchor(k, side, gap);
        if (!ctx.barrierClear(p.c[0], p.c[2], HEDGE_W / 2)) blocked.add(k);
      });
      ctx.indexSolid(s0, s1, side, gap - HEDGE_W / 2, HEDGE_W);
      ctx.along(s0, s1, 4, (k, spacing) => {
        if (blocked.has(k)) return;
        const p = anchor(k, side, gap);
        if (onTrack(p.c[0], p.c[2], 5)) {
          ctx.noteSuppressed("hedge", `hedge SUPPRESSED at k=${k} side=${side}: gap=${gap}`);
          return;
        }
        const base = col || [0.18, 0.36, 0.16], hb = [p.r, p.u, p.t];
        const hj = h * (0.9 + hash(k * 5.1 + side) * 0.2);
        addBox(out, vadd(p.c, p.u, (hj - 0.4) / 2), [HEDGE_W, hj + 0.4, spacing], base, hb);
        const lump = 0.25 + hash(k * 7.7 + side) * 0.5, lx = (hash(k * 3.3 + side) - 0.5) * HEDGE_W * 0.4;
        addBox(out, vadd(vadd(vadd(p.c, p.u, hj + lump * 0.5 - 0.2), p.r, lx), p.t, (hash(k * 9.1) - 0.5) * spacing * 0.3),
               [HEDGE_W * (0.5 + hash(k * 2.2) * 0.3), lump, spacing * 0.55],
               [base[0] * 0.9, base[1] * 0.92, base[2] * 0.88], hb);
      });
    };
    const canopyR = (kind, h) => {
      const jMax = 1.15;
      if (kind === "pine") return 2.7 * jMax + 0.4;
      if (kind === "fir") {
        const mesh = (2.1 + h * 0.06) * jMax + 0.8;
        const broad = (3.7 + h * 0.14) * jMax + 0.4;
        return Math.max(mesh, broad * 0.9);
      }
      if (kind === "palm") return 5.2;
      if (kind === "cypress")       return 1.45 * jMax + 0.4;
      if (kind === "stonePine")     return h * 0.44 + 0.6;
      if (kind === "broadleafFall") return h * 0.50 + 0.8;
      if (kind === "acacia")        return h * 0.575 + 0.8;
      if (kind === "plane")         return 4.2 + h * 0.12 + 0.6;
      if (kind === "vase")          return (4.0 + h * 0.17) * jMax + 0.4;
      if (kind === "weeping")       return (3.9 + h * 0.16) * jMax + 0.4;
      if (kind === "columnar")      return (1.5 + h * 0.05) * jMax + 0.4;
      return (3.7 + h * 0.14) * jMax + 0.4;
    };
    const deferredFoliage = [];
    const forestEdge = (...a) => { deferredFoliage.push(a); };
    const forestEdgeNow = (s0, s1, side, gap, opts) => {
      opts = opts || {};
      const hMin = opts.hMin != null ? opts.hMin : 7;
      const hMax = opts.hMax != null ? opts.hMax : 13;
      const pineCol = opts.col || [0.16, 0.36, 0.16];
      const treeCol = opts.col2 || [0.20, 0.40, 0.16];
      const pineFrac = opts.pineFrac != null ? opts.pineFrac : 0.55;
      const dens = opts.density != null ? Math.max(0.05, Math.min(1, opts.density)) : 0.7;
      const step = opts.spacing != null ? Math.max(ds, opts.spacing) : 7 - dens * 4;
      const treeOpts = opts.treeOptions || (opts.crown === "lobed" ? { crown: "lobed" } : null);
      const detailed = treeOpts && treeOpts.crown === "lobed" ? treeOpts : null;
      const palmFrac = opts.palmFrac > 0 ? Math.min(1, opts.palmFrac) : 0;
      const palmCol = opts.palmCol || treeCol;
      const limit = detailed && detailed.maxDetailed !== undefined ? detailed.maxDetailed : 30;
      let accepted = 0;
      ctx.along(s0, s1, step, (k) => {
        const s = hash(k * 4.3 + side * 1.1);
        const h = hMin + s * (hMax - hMin);
        const isPalm = palmFrac > 0 && hash(k * 2.3 + side * 3.7) < palmFrac;
        const isPine = !isPalm && hash(k * 6.7 + side * 0.7) < pineFrac;
        const canopy = canopyR(isPalm ? "palm" : isPine ? "pine" : "broad", h);
        const dist = gap + canopy;
        const back = (dens > 0.6 && hash(k * 8.9 + side) < 0.4) ? canopy * 1.4 : 0;
        const d = clearTreeDist(k, side, dist + back, canopy);
        if (d == null) return;
        if (isPalm) palm(k, side, d, h, palmCol);
        else if (isPine) pine(k, side, d, h, pineCol);
        else if (detailed && Number.isInteger(limit) && limit > 0 && limit <= 60 && accepted < limit) {
          const result = tree(k, side, d, h, treeCol, detailed);
          if (result === true) accepted++;
          else if (result === false) tree(k, side, d, h, treeCol);
        } else tree(k, side, d, h, treeCol);
      });
    };
    const bush = (k, side, dist, col, opts) => {
      const bform = (opts && opts.form) || "clump";
      const p = anchor(k, side, dist), b = [p.r, p.u, p.t];
      if (onTrack(p.c[0], p.c[2], 2)) {
        ctx.noteSuppressed("bush", `bush SUPPRESSED at k=${k} side=${side}: dist=${dist}`);
        return;
      }
      ctx.note("bush", [p.c[0], p.c[1] + 1.4, p.c[2]], [3, 2.8, 3], { k, side });
      const bc = col || [0.20, 0.38, 0.18];
      const c2 = [bc[0] * 0.90, bc[1] * 0.94, bc[2] * 0.88];
      const jh = hash(k * 4.3 + side * 2.1 + dist);
      let lobes = (opts && opts.lobes) || (jh < 0.4 ? 2 : 3);
      const previousMat = out._mat;
      out._mat = MAT.FOLIAGE;
      if (bform === "agave") {
        for (let i = 0; i < 6; i++) {
          const ang = i / 6 * 6.2832;
          const tip = vadd(vadd(vadd(p.c, p.u, 1.5), p.r, Math.cos(ang) * 1.3), p.t, Math.sin(ang) * 1.3);
          addCone(out, vadd(p.c, p.u, 0.2), 0.34, 1.9, bc, 4,
            [p.r, norm([tip[0] - p.c[0], 1.3, tip[2] - p.c[2]]), p.t]);
        }
        out._mat = previousMat;
        return;
      }
      if (bform === "grass") { lobes = 1; }
      for (let i = 0; i < lobes; i++) {
        const lh = hash(k * 5.9 + side * 3.3 + dist + i * 1.7);
        const ang = (i / lobes + lh * 0.3) * 6.2832;
        const off = lobes > 1 ? 0.6 + lh * 0.5 : 0;
        const lx = Math.cos(ang) * off, lz = Math.sin(ang) * off;
        const lc = vadd(vadd(p.c, p.r, lx), p.t, lz);
        const rad = (1.1 + lh * 0.9) * (lobes > 1 ? 0.82 : 1.15);
        addCone(out, vadd(lc, p.u, -0.3 + lh * 0.1), rad, 2.2 + lh * 1.0, i === 0 ? bc : c2, 6, b);
      }
      out._mat = previousMat;
    };

    return { anchor, groundUnder, pine, tree, palm, conifer,
             cypress, stonePine, broadleafFall, acacia, plane,
             peak, mountain, ridge,
             crowdBank, grandstand, grandstandEx, spectatorHill, bush, hedge, forestEdge,
             canopyR, forestEdgeNow, deferredFoliage, treeInFootprint };
  }

  return { create };
})();
Object.freeze(SceneryNature);
