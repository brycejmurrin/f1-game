const TrackGraph = (function () {
  "use strict";

  const __M = Math, __isFinite = Number.isFinite;

  const isVec3 = (v) => Array.isArray(v) && v.length === 3 &&
    __isFinite(v[0]) && __isFinite(v[1]) && __isFinite(v[2]);

  const NODE_COLOR = "@node";
  const WHITE = [1, 1, 1];
  const colourOf = (op, place) =>
    op.col === NODE_COLOR ? (place.col || WHITE) : op.col;

  const _xfOut = [0, 0, 0];
  function xform(place, lc) {
    const s = place.s;
    const x = s ? lc[0] * s[0] : lc[0];
    const y = s ? lc[1] * s[1] : lc[1];
    const z = s ? lc[2] * s[2] : lc[2];
    const r = place.r, u = place.u, t = place.t, o = place.o;
    _xfOut[0] = o[0] + r[0] * x + u[0] * y + t[0] * z;
    _xfOut[1] = o[1] + r[1] * x + u[1] * y + t[1] * z;
    _xfOut[2] = o[2] + r[2] * x + u[2] * y + t[2] * z;
    return _xfOut;
  }

  const radScale = (s) => (s ? __M.max(__M.abs(s[0]), __M.abs(s[2])) : 1);
  const upScale = (s) => (s ? __M.abs(s[1]) : 1);
  const SWAY_FRAC = 0.45;
  function swayAt(id, base, up, us, range) {
    const y0 = range[0] * us, inv = 1 / __M.max(1e-6, (range[1] - range[0]) * us);
    return (x, y, z) => {
      const w = ((x - base[0]) * up[0] + (y - base[1]) * up[1] + (z - base[2]) * up[2] - y0) * inv;
      return id + (w <= 0 ? 0 : w >= 1 ? 1 : w) * SWAY_FRAC;
    };
  }
  const _ORIGIN = [0, 0, 0], _UP = [0, 1, 0];

  function create(ctx) {
    Log.info("track", "graph create");
    ctx = ctx || {};
    const raw = ctx.raw || null;

    const models = new Map();
    const nodes = [];
    let dropped = 0;
    const meshes = new Map();

    function recorder(ops) {
      let mat, sway;
      const push = (op) => { op.mat = mat; if (sway) op.sway = sway; ops.push(op); return true; };
      return {
        mat(id, swayRange) { mat = id || 0; sway = swayRange || null; },
        box: (c, sz, col) => push({ op: "box", c, sz, col }),
        prism: (c, sz, col) => push({ op: "prism", c, sz, col }),
        pyramid: (c, sz, col) => push({ op: "pyramid", c, sz, col }),
        cyl: (c, rad, h, col, seg) => push({ op: "cyl", c, rad, h, col, seg }),
        cone: (c, rad, h, col, seg) => push({ op: "cone", c, rad, h, col, seg }),
        frustum: (c, rB, rT, h, col, seg) => push({ op: "frustum", c, rB, rT, h, col, seg }),
      };
    }

    function bakeCanonical(ops, signs) {
      if (!raw) return null;
      const buf = { pos: [], nrm: [], col: [], idx: [], mat: [], _mat: 0, _matAt: null };
      for (const op of ops) {
        buf._mat = op.mat || 0;
        buf._matAt = op.sway ? swayAt(buf._mat, _ORIGIN, _UP, 1, op.sway) : null;
        const col = op.col === NODE_COLOR ? WHITE : op.col;
        const c = signs ? op.c.map((v, a) => (signs & (1 << a)) ? -v : v) : op.c;
        const v0 = buf.pos.length / 3;
        switch (op.op) {
          case "box": raw.addBox(buf, c, op.sz, col, null); break;
          case "prism": raw.addPrism(buf, c, op.sz, col, null); break;
          case "pyramid": raw.addPyramid(buf, c, op.sz, col, null); break;
          case "cyl": raw.addCyl(buf, c, op.rad, op.h, col, op.seg, null); break;
          case "cone": raw.addCone(buf, c, op.rad, op.h, col, op.seg, null); break;
          case "frustum": raw.addFrustum(buf, c, op.rB, op.rT, op.h, col, op.seg, null); break;
        }
        if (op.sway && raw.roundNormals) raw.roundNormals(buf, v0, _ORIGIN, _UP);
      }
      buf._mat = 0; buf._matAt = null;
      return buf;
    }

    function mirroredGeo(geo) {
      if (!geo) return geo;
      const g = { ...geo, pos: geo.pos.slice(), nrm: geo.nrm.slice(), idx: geo.idx.slice() };
      for (let i = 2; i < g.pos.length; i += 3) { g.pos[i] = -g.pos[i]; g.nrm[i] = -g.nrm[i]; }
      for (let i = 0; i < g.idx.length; i += 3) { const b = g.idx[i + 1]; g.idx[i + 1] = g.idx[i + 2]; g.idx[i + 2] = b; }
      return g;
    }

    function variantOf(n) {
      const r = n.r, u = n.u, t = n.t, s = n.s;
      const det = (r[1] * u[2] - r[2] * u[1]) * t[0] + (r[2] * u[0] - r[0] * u[2]) * t[1] + (r[0] * u[1] - r[1] * u[0]) * t[2];
      return (s && s[0] < 0 ? 1 : 0) | (s && s[1] < 0 ? 2 : 0) | (s && s[2] < 0 ? 4 : 0) | (det < 0 ? 8 : 0);
    }

    function aabbOf(geo) {
      const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      const p = geo && geo.pos;
      if (!p || !p.length) return { mn: [0, 0, 0], mx: [0, 0, 0] };
      for (let i = 0; i < p.length; i += 3) {
        for (let a = 0; a < 3; a++) {
          const v = p[i + a];
          if (v < mn[a]) mn[a] = v;
          if (v > mx[a]) mx[a] = v;
        }
      }
      return { mn, mx };
    }

    function model(key, build) {
      let m = models.get(key);
      if (m) return m;
      const ops = [];
      build(recorder(ops));
      let geo, aabb;
      const variants = new Map();
      const meshOf = () => (geo === undefined ? (geo = bakeCanonical(ops)) : geo);
      m = {
        key, ops, uses: 0,
        hasRadial: ops.some((o) => o.op === "cyl" || o.op === "cone" || o.op === "frustum"),
        nodeColored: ops.some((o) => o.col === NODE_COLOR),
        get geo() { return meshOf(); },
        geoFor(variant) {
          if (!variant) return meshOf();
          if (!variants.has(variant)) {
            const g = (variant & 7) ? bakeCanonical(ops, variant & 7) : meshOf();
            variants.set(variant, (variant & 8) ? mirroredGeo(g) : g);
          }
          return variants.get(variant);
        },
        get aabb() { return aabb === undefined ? (aabb = aabbOf(meshOf())) : aabb; },
        get verts() { const g = meshOf(); return g ? g.pos.length / 3 : 0; },
      };
      models.set(key, m);
      return m;
    }

    function replay(m, place, emit, out) {
      const s = place.s;
      const rs = radScale(s), us = upScale(s);
      const basis = [place.r, place.u, place.t];
      let landed = 0;
      let swayed = false;
      for (const op of m.ops) {
        const c = xform(place, op.c);
        if (op.mat !== undefined) out._mat = op.mat;
        out._matAt = op.sway ? swayAt(out._mat || 0, place.o, place.u, upScale(s), op.sway) : null;
        if (op.sway) swayed = true;
        const col = colourOf(op, place);
        let ok = false;
        const v0 = out.pos.length / 3;
        switch (op.op) {
          case "box":
          case "prism":
          case "pyramid": {
            const sz = s ? [op.sz[0] * __M.abs(s[0]), op.sz[1] * __M.abs(s[1]), op.sz[2] * __M.abs(s[2])] : op.sz;
            ok = op.op === "box" ? emit.addBox(out, c, sz, col, basis)
              : op.op === "prism" ? emit.addPrism(out, c, sz, col, basis)
                : emit.addPyramid(out, c, sz, col, basis);
            break;
          }
          case "cyl": ok = emit.addCyl(out, c, op.rad * rs, op.h * us, col, op.seg, basis); break;
          case "cone": ok = emit.addCone(out, c, op.rad * rs, op.h * us, col, op.seg, basis); break;
          case "frustum": ok = emit.addFrustum(out, c, op.rB * rs, op.rT * rs, op.h * us, col, op.seg, basis); break;
        }
        if (op.sway && emit.roundNormals && out.pos.length / 3 > v0) emit.roundNormals(out, v0, place.o, place.u);
        if (ok) landed++;
        if (!ok && op.op === "cyl" && out._pitRejected && !out._replayVerdicts) {
          if (out._recVerdicts) for (let r = m.ops.indexOf(op) + 1; r < m.ops.length; r++) out._recVerdicts[out._vIdx++] = 0;
          break;
        }
      }
      if (swayed) out._matAt = null;
      return landed;
    }

    function instance(key, place, build, meta, emit, out) {
      if (!place || !isVec3(place.o) || !isVec3(place.r) || !isVec3(place.u) || !isVec3(place.t)) {
        dropped++;
        return 0;
      }
      const m = model(key, build);
      if (!m.ops.length) { dropped++; return 0; }
      let whole = null;
      if (meta && (meta.kind === "pine" || meta.whole) && emit) {
        const verd = m._whole || (m._whole = new Uint8Array(m.ops.length));
        out._dryRun = true;
        out._recVerdicts = verd;
        out._vIdx = 0;
        const nLand = replay(m, place, emit, out);
        out._dryRun = false; out._recVerdicts = null;
        if (nLand !== m.ops.length) { dropped++; return 0; }
        whole = verd;
      }
      const prefer = !!(out && out._preferInstance && emit);
      let landed, verd = whole;
      if (prefer && whole) {
        landed = m.ops.length;
      } else if (prefer) {
        out._dryRun = true;
        out._recVerdicts = verd = m._verd || (m._verd = new Uint8Array(m.ops.length));
        out._vIdx = 0;
        landed = replay(m, place, emit, out);
        out._dryRun = false; out._recVerdicts = null;
      } else if (whole) {
        out._replayVerdicts = whole; out._vIdx = 0;
        landed = replay(m, place, emit, out);
        out._replayVerdicts = null;
      } else {
        landed = emit ? replay(m, place, emit, out) : 0;
      }
      if (landed) {
        m.uses++;
        const full = landed === m.ops.length;
        const s = place.s;
        const nonUniformXZ = !!s && __M.abs(__M.abs(s[0]) - __M.abs(s[2])) > 1e-9;
        const skipFuse = prefer && full && !(m.hasRadial && nonUniformXZ);
        nodes.push({
          model: key,
          o: place.o, r: place.r, u: place.u, t: place.t,
          s: place.s || null,
          col: place.col || null,
          landed,
          full,
          inst: skipFuse,
          meta: meta || null,
        });
        if (prefer && !skipFuse) {
          out._replayVerdicts = verd; out._vIdx = 0;
          replay(m, place, emit, out);
          out._replayVerdicts = null;
        } else if (prefer && skipFuse) {
          out._absorbOnly = true;
          out._replayVerdicts = verd; out._vIdx = 0;
          replay(m, place, emit, out);
          out._absorbOnly = false; out._replayVerdicts = null;
        }
      }
      return landed;
    }

    function bake(emit, out) {
      let landed = 0;
      for (const node of nodes) {
        const m = models.get(node.model);
        if (!m) continue;
        landed += replay(m, node, emit, out);
      }
      return landed;
    }

    function meshModel(key, mesh, mat) {
      let m = meshes.get(key);
      if (m) return m;
      const si = mesh.idx, nv = mesh.pos.length / 3;
      const remap = new Int32Array(nv).fill(-1);
      const idx = new Uint32Array(si.length);
      let n = 0;
      for (let i = 0; i < si.length; i++) {
        const v = si[i];
        if (remap[v] < 0) remap[v] = n++;
        idx[i] = remap[v];
      }
      const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3);
      const mt = new Float32Array(n);
      for (let v = 0; v < nv; v++) {
        const d = remap[v];
        if (d < 0) continue;
        pos[d * 3] = mesh.pos[v * 3]; pos[d * 3 + 1] = mesh.pos[v * 3 + 1]; pos[d * 3 + 2] = mesh.pos[v * 3 + 2];
        if (mesh.nrm) { nrm[d * 3] = mesh.nrm[v * 3]; nrm[d * 3 + 1] = mesh.nrm[v * 3 + 1]; nrm[d * 3 + 2] = mesh.nrm[v * 3 + 2]; }
        else nrm[d * 3 + 1] = 1;
        if (mesh.col) { col[d * 3] = mesh.col[v * 3]; col[d * 3 + 1] = mesh.col[v * 3 + 1]; col[d * 3 + 2] = mesh.col[v * 3 + 2]; }
        else { col[d * 3] = col[d * 3 + 1] = col[d * 3 + 2] = 0.7; }
        mt[d] = mat != null ? mat : (mesh.mat ? mesh.mat[v] : 0);
      }
      m = { key, geo: { pos, nrm, col, mat: mt, idx }, verts: n, tris: idx.length / 3, places: [], tinted: false };
      meshes.set(key, m);
      return m;
    }
    function meshPlace(key, x, y, z, yaw, scale, tint) {
      const m = meshes.get(key);
      if (!m) return false;
      m.places.push({ x, y, z, yaw, s: scale != null ? scale : 1, tint: tint || null });
      if (tint) m.tinted = true;
      return true;
    }
    function meshBatches(out) {
      for (const m of meshes.values()) {
        const count = m.places.length;
        if (!count) continue;
        const matrices = new Float32Array(count * 16);
        const colors = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
          const p = m.places[i], cs = __M.cos(p.yaw), sn = __M.sin(p.yaw), s = p.s, b = i * 16;
          matrices[b] = cs * s;      matrices[b + 2] = -sn * s;
          matrices[b + 5] = s;
          matrices[b + 8] = sn * s;  matrices[b + 10] = cs * s;
          matrices[b + 12] = p.x;    matrices[b + 13] = p.y;    matrices[b + 14] = p.z;
          matrices[b + 15] = 1;
          const c = p.tint || WHITE;
          colors[i * 3] = c[0]; colors[i * 3 + 1] = c[1]; colors[i * 3 + 2] = c[2];
        }
        out.push({ model: "mesh:" + m.key, geo: m.geo, verts: m.verts, count, matrices, colors });
      }
    }

    function batches(opts) {
      const instancedOnly = !!(opts && opts.instancedOnly);
      const byModel = new Map();
      const bakeOnly = [];
      for (const node of nodes) {
        const m = models.get(node.model);
        if (!m) continue;
        if (instancedOnly && !node.inst) continue;
        const s = node.s;
        const nonUniformXZ = !!s && __M.abs(__M.abs(s[0]) - __M.abs(s[2])) > 1e-9;
        if (!node.full || (m.hasRadial && nonUniformXZ)) { bakeOnly.push(node); continue; }
        let variants = byModel.get(node.model);
        if (!variants) byModel.set(node.model, (variants = new Map()));
        const variant = variantOf(node);
        let list = variants.get(variant);
        if (!list) variants.set(variant, (list = []));
        list.push(node);
      }

      const out = [];
      for (const [key, variants] of byModel) for (const [variant, list] of variants) {
        const m = models.get(key);
        const count = list.length;
        const matrices = new Float32Array(count * 16);
        const colors = m.nodeColored ? new Float32Array(count * 3) : null;
        for (let i = 0; i < count; i++) {
          const n = list[i], o = n.o, r = n.r, u = n.u, t = n.t, s = n.s;
          const sx = s ? __M.abs(s[0]) : 1, sy = s ? __M.abs(s[1]) : 1, sz = s ? __M.abs(s[2]) : 1;
          const b = i * 16;
          matrices[b]      = r[0] * sx; matrices[b + 1]  = r[1] * sx; matrices[b + 2]  = r[2] * sx;
          matrices[b + 4]  = u[0] * sy; matrices[b + 5]  = u[1] * sy; matrices[b + 6]  = u[2] * sy;
          const tz = (variant & 8) ? -sz : sz;
          matrices[b + 8]  = t[0] * tz; matrices[b + 9]  = t[1] * tz; matrices[b + 10] = t[2] * tz;
          matrices[b + 12] = o[0];      matrices[b + 13] = o[1];      matrices[b + 14] = o[2];
          matrices[b + 15] = 1;
          if (colors) {
            const c = n.col || WHITE;
            colors[i * 3] = c[0]; colors[i * 3 + 1] = c[1]; colors[i * 3 + 2] = c[2];
          }
        }
        out.push({ model: key, variant, geo: m.geoFor(variant), verts: m.verts, count, matrices, colors });
      }
      meshBatches(out);
      out.sort((a, b) => (a.model < b.model ? -1 : a.model > b.model ? 1 : (a.variant || 0) - (b.variant || 0)));
      return { batches: out, bakeOnly };
    }

    function stats() {
      let unique = 0, fused = 0;
      for (const m of models.values()) {
        unique += m.verts;
        fused += m.verts * m.uses;
      }
      const byKind = {};
      const seen = new Map();
      for (const node of nodes) {
        const kind = (node.meta && node.meta.kind) || "(unkeyed)";
        const m = models.get(node.model);
        if (!m) continue;
        let e = byKind[kind];
        if (!e) { e = byKind[kind] = { nodes: 0, models: 0, fusedVerts: 0, uniqueVerts: 0, reuse: 0 }; seen.set(kind, new Set()); }
        e.nodes++;
        e.fusedVerts += m.verts;
        const set = seen.get(kind);
        if (!set.has(node.model)) { set.add(node.model); e.models++; e.uniqueVerts += m.verts; }
      }
      for (const kind in byKind) {
        const e = byKind[kind];
        e.reuse = e.uniqueVerts > 0 ? e.fusedVerts / e.uniqueVerts : 0;
      }
      let mModels = 0, mInst = 0, mUnique = 0, mFused = 0;
      for (const m of meshes.values()) {
        if (!m.places.length) continue;
        mModels++; mInst += m.places.length; mUnique += m.verts; mFused += m.verts * m.places.length;
      }
      return {
        models: models.size,
        nodes: nodes.length,
        dropped,
        mesh: { models: mModels, instances: mInst, uniqueVerts: mUnique, fusedVerts: mFused },
        uniqueVerts: unique,
        fusedVerts: fused,
        reuse: unique > 0 ? fused / unique : 0,
        byKind,
      };
    }

    return { models, nodes, meshes, model, instance, replay, bake, batches, stats, meshModel, meshPlace };
  }

  return { create, xform, NODE_COLOR, SWAY_FRAC };
})();
Object.freeze(TrackGraph);
