/* Apex 26 — SceneryNature: the nature/landscape band of the buildProps composite-model toolkit — the shared trackside anchor() plus vegetation (pine/tree/palm/con… */
const SceneryNature = (function () {
  "use strict";

  // Opt-in opaque broadleaf silhouettes, in a 12 m canonical frame. Each
  // [x,z,y,radius,lowerRise,capRise] lobe intersects the trunk/other lobes.
  // Heights/tints belong to placements, never to the model cache key.
  const LOBED_CROWNS = [
    [[-0.6, -0.2, 3.8, 2.55, 2.4, 3.0], [0.7, 0.45, 4.3, 2.45, 2.7, 3.4], [-0.05, -0.65, 5.2, 2.05, 3.0, 3.8]],
    [[-0.7, 0.35, 3.5, 2.4, 2.5, 3.2], [0.6, -0.5, 4.8, 2.55, 2.2, 3.2], [0.2, 0.3, 5.4, 1.9, 2.8, 3.8]],
    [[-0.3, -0.7, 4.1, 2.6, 2.3, 3.4], [0.65, 0.2, 3.7, 2.35, 2.9, 3.3], [-0.45, 0.4, 5.8, 1.85, 2.4, 3.8]],
  ];

  // Project every axis onto an orthonormal XZ frame, including leaned trunks
  // and drooping prism up-axes. Cylinders/prisms are base-anchored; boxes are
  // centre-anchored. These rectangles contain every vertex of each primitive.
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
      // Sit on the ACTUAL rendered terrain when available (exact — no float/sink
      // where the ribbon is carved or sags); fall back to the groundYAt estimate
      // for points the terrain mesh doesn't cover (far out / off the ribbon).
      // The returned point is sunk 0.3 m below the sample: it's a SINGLE-point
      // reading, so on any slope a flat-based model placed exactly at it floats
      // on the downhill side. Every anchored model (engine helpers AND raw
      // per-track props) inherits the embed; tops drop by the same 0.3, which
      // is visually negligible on multi-metre props.
      // Inside the road-to-ribbon GAP (the rendered terrain ribbon starts
      // ~2.2 m out; TrackSurface.heightAt() is a flat cross-section that knows
      // nothing about the road it borders) the ground is not terrain — it is
      // the ROAD SURFACE, so terrainYAt() must not be consulted here at all:
      // at a hairpin that doubles back on itself (Zandvoort) its XZ lookup
      // happily resolves the OTHER leg's ribbon, a metre higher, and buried
      // the kerb strip.
      //
      // On a BANKED corner the road pivots about its centreline, but
      // groundYAt()/heightAt() carry no banking term, so anything anchored in
      // the gap (kerb strips sit at 1.35 m) fell back to the UNBANKED height
      // while the road edge itself moved +/-2.26 m — a 2 m cliff on the low
      // side, the road climbing over its own kerb on the high side. Apply the
      // same pivot to this fallback so both sides of the seam agree; NOT to
      // the terrainYAt branch below, which already carries it — adding it
      // twice would double the bank.
      const base = dist < 2.2
        ? py[k] + bankOffsetAt(track, k, o)
        : (() => { const ty = terrainYAt(cx, cz);
                   return ty != null ? ty : groundYAt(k, dist) + bankOffsetAt(track, k, o); })();
      // `k` is the RESOLVED node — on a shifted/reversed circuit the wrapper
      // remapped the caller's index, so a circuit pairing this anchor with an
      // unwrapped node query (groundYAt) must read the node from here.
      return { c: [cx, base - 0.3, cz], r, u, t, k };
    };
    // ONE TREE PER SPOT. Two trees planted at the same point are the same tree
    // drawn twice: every trunk cylinder and canopy cone is coincident, so the
    // whole crown z-fights with itself and costs double the vertices. Circuits
    // hit this by walking two treelines that overlap, or by an `every()` step
    // landing on a node a hand-placed tree already took (okayama 2026-09-22:
    // 243 coincident primitives after the barrier guard, all of them trees).
    // A RADIUS, not a cell: a 25 cm cell lets two trunks 0.3-0.7 m apart
    // through (mont_tremblant, 2026-09-22: 15 same-facing coplanar trunk/cone
    // pairs from overlapping forest ranks, --why --raw), and no two real
    // trunks stand closer than TREE_GAP. Still far below any deliberate copse
    // spacing.
    const TREE_GAP = 1.0;
    const planted = new Map();   // 1 m cell -> [[x, z], …]
    // LAYERED-BANK SLOT. spectatorHill is called in layered pairs (a tall pale
    // cut and a short red one over the same span at the same gap); the slot is
    // what keeps the two apart. It counts CALLS, not heights: a hash of
    // `opts.h` looks stable but is a chaotic map, and okayama's 6.0/2.8 pair
    // landed 1.6 mm apart on one such hash while its 6.5/3.0 pair landed 18 mm
    // apart — the separation has to be a property of the emitter, not luck.
    // Call order inside a circuit file is deterministic and layered calls are
    // always adjacent, so consecutive slots is exactly the guarantee needed.
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
    // Placed pines' tier-cone facet planes [nx, ny, nz, d], bucketed on a
    // 10 m grid, for pine()'s coplanar guard.
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
      pineFacetGrid.get(key).push({ x, z, reach, facets });
    };
    const pine = (k, side, dist, h, col, opts) => {
      opts = opts || {};
      const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
      if (spotTaken(a.c[0], a.c[2])) return;
      // The CROWN's radius from the pit complex, not the trunk's: crown tiers
      // may overhang the complex (js/track/tracks.js onRoadHit), so a pine a
      // def plants just behind the garages — Monza's poplars at the row —
      // grew through the bay roofs. A tree is one object: if its crown would
      // reach in, none of it stands. (clearTreeDist plants with the same
      // margin; this is the guard for a direct call.)
      if (onTrack(a.c[0], a.c[2], 3, Math.max(0.5, h * 0.225))) {
        ctx.noteSuppressed("pine", `pine SUPPRESSED at k=${k} side=${side}: dist=${dist}`);
        return;
      }
      ctx.note("pine", [a.c[0], a.c[1] + h / 2, a.c[2]], [h * 0.45, h, h * 0.45], { k, side });
      // per-instance size jitter so a treeline doesn't read as identical clones
      const j = 0.85 + hash(k * 3.7 + side * 1.3 + dist) * 0.3;
      const vr = hash(k * 6.1 + side * 4.4 + dist + 9.3);
      const sparse = opts.sparse != null ? !!opts.sparse : vr > 0.82;   // ~18% thinner 3-tier trees
      const lean = opts.lean != null ? opts.lean
        : (!sparse && vr > 0.55 ? (vr - 0.55) * 2.2 : 0);              // ~27% windswept lean
      const tiers = opts.tiers != null ? Math.max(2, Math.min(6, Math.round(opts.tiers)))
        : (sparse ? 3 : 4);
      const PINE_REF_H = 12;
      const jQ = 0.85 + Math.round((j - 0.85) / 0.15) * 0.15;
      const leanQ = lean <= 0 ? 0 : Math.round(lean / 0.4) * 0.4;
      const s = h / PINE_REF_H;
      const o = [a.c[0] - a.u[0] * 0.5, a.c[1] - a.u[1] * 0.5, a.c[2] - a.u[2] * 0.5];
      const r = side < 0 ? [-a.r[0], -a.r[1], -a.r[2]] : a.r;
      // COPLANAR GUARD. Pines on neighbouring nodes share (nearly) one basis,
      // so two trees' same-aspect tier cones have PARALLEL side facets
      // (|n.y| ~0.57, inside ground-audit's flat check), and in a dense belt
      // some pair lands within 2 cm of one plane by chance (nurburgring
      // forestEdge, 5 spots). Every side facet passes through its cone's
      // apex, so the plane offset is n . apex: sink this tree by the first
      // SEP slot that keeps each of its facets >= MIN_SEP off every parallel
      // facet of an overlapping neighbour. Nothing moves sideways (a yaw
      // fixed it but swung leans and 7-gon corners into other props: +9
      // clip-audit severe spots); a few cm more trunk embed is invisible.
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
        const clash = (d) => {
          for (const q of near) for (const F of facets) for (const G of q) {
            if (Math.abs(F[0] * G[0] + F[1] * G[1] + F[2] * G[2]) < 0.999) continue;
            const dF = F[3] - d * F[1], sgn = F[0] * G[0] + F[1] * G[1] + F[2] * G[2] > 0 ? 1 : -1;
            if (Math.abs(dF - sgn * G[3]) < TrackGeom.MIN_SEP) return true;
          }
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
          rec.mat(MAT.FOLIAGE, [H * 0.32, H * 1.15]);   // wind-sway weight: 0 at the lowest tier, 1 at the tip
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
    // WIND SWAY: FOLIAGE emitted while out._matAt is set carries a per-vertex
    // weight in its material fraction (TrackGeom.swayMatAt): 0 at height y0 along
    // `up` from `base` (the crown's foot — it stays on the trunk), 1 at y1 (the
    // tip). The lit vertex shaders bend the crown downwind by it. Cleared with
    // swayOff() before each emitter returns: the props record is posted whole
    // from the build worker and a function on it would not clone.
    // The same span is the CROWN: swayOff() rounds the normals emitted since
    // swayOn() toward the crown axis (TrackGeom.roundNormals), so the cone
    // stacks light as soft volumes instead of faceted lanterns.
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
    // Authored woodland may interlock. Relocations claim complete tree parts
    // so a later row cannot move its matching facet planes into that tree.
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
      // A complete tree or nothing: test the actual tilted part envelopes
      // before graph replay, including crown terrain on all four rim corners.
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
      // Check the same guarded primitive calls graph replay will use. Runtime
      // dry runs write no vertices; the temporary arrays also suit VM emitters.
      const trial = { pos: [], nrm: [], col: [], mat: [], idx: [], _dryRun: true };
      if (addCyl(trial, o, 0.4 * s, 6.7 * s, [0.32, 0.23, 0.13], trunkSegments, b) === false) return false;
      for (const [x, z, y, radius, lower, cap] of lobes) {
        if (addFrustum(trial, at(x, y, z), 0.08 * s, radius * s, lower * s, col, segments, b) === false ||
            addCone(trial, at(x, y + lower, z), radius * s, cap * s, col, segments, b) === false) return false;
      }
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
      }, { kind: "tree", k, side, h, crown: "lobed", variant }, { roundNormals: true });
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
    // The same registry answers LATER masses (city towers are built after the
    // closure's trees and massBlocked never saw a tree): is any planted tree's
    // trunk or crown inside this box (centre c, w x h x d, basis b)?
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
      // Relocation changes the anchor, never this tree's authored shape seed.
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
          part("cone", h * 0.20, (3.5 + h * 0.135) * j, h * 0.14); // entire understorey skirt
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
      if (spotTaken(a.c[0], a.c[2])) return;   // reserve only the successful site
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
      // Past the on-track guard — this tree ships once its trunk lands. Canopy
      // radius scales with height, so w/d are an estimate rather than a measured
      // bound. Noted AFTER the trunk guard: a trunk the pit guard refuses draws
      // nothing, so it must not leave a phantom box in the registry (H26b).
      const noteTree = () => ctx.note("tree", [a.c[0], a.c[1] + h / 2, a.c[2]], [h * 0.5, h, h * 0.5], { k, side, dist, initialDist });
      if (vr > deadAt) {   // dead/storm tree: bare trunk + a few angled branch stubs.
        const th = h * 0.7;
        out._mat = MAT.WOOD;
        if (addCyl(out, vadd(a.c, a.u, -0.5), 0.32, th + 0.5, [0.28, 0.22, 0.16], 6, b) === false) { out._mat = 0; return; }   // no trunk, no crown (the pit complex keeps footings out)
        noteTree();
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
      // per-instance jitter so adjacent broadleaves vary in size/shape
      const c2 = [col[0] * 0.88, col[1] * 0.9, col[2] * 0.84];   // sunlit upper foliage
      out._mat = MAT.WOOD;
      if (addCyl(out, vadd(a.c, a.u, -0.5), 0.4, h * 0.55 + 0.5, [0.32, 0.23, 0.13], 6, b) === false) { out._mat = 0; return; }   // no trunk, no crown (the pit complex keeps footings out)
      noteTree();
      out._mat = MAT.FOLIAGE;
      swayOn(a.c, a.u, h * 0.22, h * 1.0);
      {
        const usR = (3.5 + h * 0.135) * j;
        const ringY = h * 0.34, apexY = h * 0.20;
        const usCol = [col[0] * 0.5, col[1] * 0.52, col[2] * 0.5];
        const uref = vadd(a.c, a.u, h * 0.7);
        const apex = vadd(a.c, a.u, apexY);
        const ring = (ang) => vadd(vadd(vadd(a.c, a.u, ringY), a.r, Math.cos(ang) * usR), a.t, Math.sin(ang) * usR);
        // A wedge whose whole rim is under the terrain is hidden: the trunk is
        // seated at ONE point, and a tree at the foot of a cutting or bank has
        // ground rising metres above its 5-6 m wide skirt (ground-audit: 219
        // such wedges up to 15 m deep on cota/interlagos/kyalami/suzuka…).
        // Drop those wedges instead of emitting buried triangles. A wedge is
        // hidden when its TOP (the corners within 2 cm of its highest, and their
        // centroid) is under the terrain; a tilted `u` can leave one rim corner
        // alone at the top, so the rim is not assumed level.
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
        // Eucalyptus / elm: narrow at the fork, spreading upward and outward.
        addCone(out, vadd(a.c, a.u, h * 0.34), (2.1 + h * 0.07) * j * sp, h * 0.28, col, 8, b);
        addCone(out, vadd(a.c, a.u, h * 0.56), (3.4 + h * 0.15) * j * sp, h * 0.28, col, 9, b);
        addCone(out, vadd(vadd(a.c, a.u, h * 0.78), a.r, lean), (4.0 + h * 0.17) * j * sp, h * 0.24, c2, 9, b);
      } else if (crown === "weeping") {
        // Willow: a high dome with the mass hanging BELOW it.
        addCone(out, vadd(a.c, a.u, h * 0.62), (3.6 + h * 0.15) * j * sp, h * 0.30, col, 9, b);
        addFrustum(out, vadd(a.c, a.u, h * 0.24), (1.4 + h * 0.05) * j * sp,
          (3.9 + h * 0.16) * j * sp, h * 0.40, c2, 9, b);
      } else if (crown === "columnar") {
        // Poplar / lombardy: a tall narrow spire, almost no spread.
        addCone(out, vadd(a.c, a.u, h * 0.30), (1.5 + h * 0.05) * j * sp, h * 0.36, col, 7, b);
        addCone(out, vadd(a.c, a.u, h * 0.56), (1.2 + h * 0.04) * j * sp, h * 0.34, col, 7, b);
        addCone(out, vadd(a.c, a.u, h * 0.80), (0.8 + h * 0.03) * j * sp, h * 0.26, c2, 6, b);
      } else {
        addCone(out, vadd(a.c, a.u, h * 0.28), (3.3 + h * 0.13) * j * sp, h * 0.30, col, 9, b);   // wide skirt
        addCone(out, vadd(a.c, a.u, h * 0.46), (3.7 + h * 0.14) * j * sp, h * 0.26, col, 9, b);   // widest bulge
        addCone(out, vadd(vadd(a.c, a.u, h * 0.66), a.r, lean), (2.9 + h * 0.10) * j * sp, h * 0.26, c2, 8, b);    // shoulder
        addCone(out, vadd(vadd(a.c, a.u, h * 0.82), a.r, lean * 1.6), (1.7 + h * 0.06) * j * sp, h * 0.22, c2, 7, b);    // rounded cap
      }
      reserve();
      out._mat = 0; swayOff();
    };
    // Palm: tall thin trunk + a crown of drooping frond prisms.
    const placedPalms = [];
    const palm = (k, side, dist, h, frond) => {
      let a = anchor(k, side, dist);
      if (onTrack(a.c[0], a.c[2], 4)) {
        ctx.noteSuppressed("palm", `palm SUPPRESSED at k=${k} side=${side}: dist=${dist}`);
        return;
      }
      const frCol = frond || [0.18, 0.40, 0.16];
      const frDark = [frCol[0] * 0.8, frCol[1] * 0.82, frCol[2] * 0.78];
      // Prepare the actual primitives before emission. A single canopy square
      // rejects clear space between the fronds; a trunk-only check lets crowns
      // grow through city towers when venue reservations move the foliage.
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
          // Relocations yield to all prior palms and steep ground. Authored
          // groves keep their overlap, except where a relocated tree now stands.
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
      if (addCyl(out, vadd(a.c, a.u, -0.5), 0.3, h * 0.20 + 0.5, [0.34, 0.24, 0.15], 5, b) === false) { out._mat = 0; return; }   // no trunk, no crown (the pit complex keeps footings out)
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
      // Per-instance tone shift: an avenue of one flat green reads as a fence.
      const dark = hash(k * 7.3 + side * 2.1 + dist) < 0.5;
      const c = dark ? [col[0] * 0.78, col[1] * 0.82, col[2] * 0.80] : col;
      out._mat = MAT.WOOD;
      addCyl(out, vadd(a.c, a.u, -0.4), 0.22, h * 0.18 + 0.4, opts.trunkCol || [0.30, 0.22, 0.14], 5, b);
      out._mat = MAT.FOLIAGE;
      swayOn(a.c, a.u, h * 0.15, h * 1.0);
      addCone(out, vadd(a.c, a.u, h * 0.10), 1.45 * slim, h * 0.58, c, 6, b);
      addCone(out, vadd(a.c, a.u, h * 0.44), 1.10 * slim, h * 0.42, c, 6, b);
      addCone(out, vadd(a.c, a.u, h * 0.70), 0.70 * slim, h * 0.32, c, 6, b);   // pointed crown
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
      addFrustum(out, crown, h * 0.12 * spread, h * 0.44 * spread, h * 0.16, col, 7, b);   // flared underside
      addCone(out, vadd(crown, a.u, h * 0.16), h * 0.44 * spread, h * 0.22, col, 7, b);    // shallow dome
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
             opts.barkCol || [0.36, 0.30, 0.24], 5, b) === false) { out._mat = 0; return; }   // no trunk, no crown
      out._mat = MAT.FOLIAGE;
      swayOn(a.c, a.u, h * 0.40, h * 1.05);
      // Shade the lower lobes: a single flat autumn colour flattens into a blob.
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
      // ONE CONNECTED STACK: trunk -> fork -> slab 0 -> slab 1 … each part
      // starts where the one below ends. Fixed fractions (fork at h*0.68,
      // slabs h*0.14 / 1 m apart) leave a 0.2-0.6 m air gap at every joint of
      // a tall tree, so the crown hangs detached from the tree carrying it
      // (ground-audit: 215 prims on cota/kyalami). The slab TOPS stay at those
      // fractions (they are what reads from above, and what the flat-coplanar
      // audit compares); the parts under them grow DOWN:
      //   - an upper slab's underside reaches 2 cm into the slab below it;
      //   - the fork rises until its top meets slab 0's underside;
      //   - the trunk rises until it meets the fork;
      // each only across a real gap (> JOINT): a closed joint is untouched.
      // Crown layer i's TOP is at layerY(i) + thick(i)/2. Its rise off the
      // trunk is capped in METRES, not held at a fraction of h (a 12 m tree at
      // h*0.14 per layer opened a 0.88 m step between slabs).
      const layerY = (i) => h * 0.80 + i * Math.min(h * 0.14, 1.0);
      const thick = (i) => i === 0 ? Math.max(0.9, 2 * (h * 0.12 - 0.90)) : 0.9 - i * 0.2;
      // A joint already closed to within JOINT (under the 0.15 m a grounding
      // audit bridges) keeps its old geometry: moving faces that were fine
      // only risks new coplanar coincidences with neighbouring trees.
      const JOINT = 0.14;
      const close = (lo, hi) => hi - lo <= JOINT ? lo : hi;   // `lo` rises to `hi` only across a real gap
      const forkY = close(h * 0.68 + 0.35, layerY(0) - thick(0) / 2) - 0.35;   // fork top meets slab 0
      const trunkTop = close(h * 0.62, forkY - 0.35);                         // trunk meets the fork
      out._mat = MAT.WOOD;
      if (addCyl(out, vadd(a.c, a.u, -0.5), 0.28, trunkTop + 0.5, bark, 5, b) === false) { out._mat = 0; return; }   // no trunk, no crown (the pit complex keeps footings out)
      for (const dr of [-1, 1])                                    // the low fork
        addBox(out, vadd(vadd(a.c, a.u, forkY), a.r, dr * spread * 0.22),
               [spread * 0.44, 0.7, 0.22], bark, b);
      out._mat = MAT.FOLIAGE;
      swayOn(a.c, a.u, trunkTop, h * 1.1);
      // Flat slabs, not cones: the crown's top and bottom are both near-planar.
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
             opts.trunkCol || [0.72, 0.70, 0.62], 6, b) === false) { out._mat = 0; return; }   // no trunk, no crown
      out._mat = MAT.FOLIAGE;
      swayOn(a.c, a.u, h * 0.46, h * 1.1);
      // Each stage starts just inside the one below. A fixed 0.28 h step left
      // the THIRD disc 0.09 h clear of the second ([0.95, 1.09] h over a top
      // at 0.86 h): a floating crown on every stages:3 tree (ground-audit,
      // mexico's street planes). Stages 1-2 are unchanged.
      let base = 0;
      for (let i = 0; i < stages; i++) {
        const sh = h * (0.34 - i * 0.10);
        const y = i < 2 ? h * (0.46 + i * 0.28) : base - h * 0.01 + sh / 2;
        addCyl(out, vadd(a.c, a.u, y), rad * (1 - i * 0.28), sh, i ? c2 : col, 7, b);
        base = y + sh / 2;
      }
      out._mat = 0; swayOff();
    };

    // Distant mountain peak (world coords), pyramid so it reads as a summit, with
    // a lower foot skirt so it doesn't look like a floating spike. Simple/clean —
    // use mountain() for organic, colour-zoned, snow-capped summits.
    // onTrack() measures against the TARMAC half-width. The road mesh is wider
    // than that: a gravel runoff apron runs 2.2 m beyond the edge and the kerb
    // ribbons are props at ~1.35 m out. A landform only has to clear the tarmac
    // to pass the guard, so it can still bury the kerb and the runoff — which on
    // screen reads as the hillside covering the track. Landforms must clear the
    // road's whole built width, not just the racing surface.
    const ROAD_SKIRT = 2.6;
    const peak = (x, z, baseY, w, h, col) => {
      // The foot pyramid's base is a SQUARE of side w*1.5, so its CORNERS reach
      // w*0.75*sqrt(2) ~= w*1.061. A w*0.75 guard measures to an edge
      // midpoint and lets the four corners overhang it by 41 %.
      if (onTrack(x, z, w * 1.061 + ROAD_SKIRT)) {
        ctx.noteSuppressed("peak", `peak SUPPRESSED at x=${x.toFixed(0)} z=${z.toFixed(0)}: w=${w}`);
        return;
      }
      ctx.note("peak", [x, baseY + h / 2, z], [w, h, w]);
      out._mat = MAT.ROCK;
      addPyramid(out, [x, baseY, z], [w, h, w], col, null);
      addPyramid(out, [x, baseY - 2, z], [w * 1.5, h * 0.45, w * 1.5], [col[0] * 0.9, col[1] * 0.92, col[2] * 0.9], null);
      const pj = hash(x * 0.17 + z * 0.19), pa = pj * 6.2832, so = w * (0.25 + pj * 0.13);
      addPyramid(out, [x + Math.cos(pa) * so, baseY - 0.6, z + Math.sin(pa) * so],
        [w * 0.6, h * (0.5 + pj * 0.25), w * 0.72], [col[0] * 0.94, col[1] * 0.95, col[2] * 0.96], null);
      out._mat = 0;
    };
    const mountain = (x, z, baseY, w, h, opts) => {
      opts = opts || {};
      const rough = opts.rough != null ? opts.rough : 0.34;
      const reach = (ww) =>
        ROAD_SKIRT +
        Math.max(ww * 0.62, ww * 0.5 * (1 + 0.7 * rough) * (1 + 0.35 * rough));
      let fit = w;
      for (let i = 0; i < 6 && onTrack(x, z, reach(fit)); i++) fit *= 0.88;
      if (onTrack(x, z, reach(fit))) {
        ctx.noteSuppressed("mountain", `mountain SUPPRESSED at x=${x.toFixed(0)} z=${z.toFixed(0)}: w=${w}`);
        return;
      }
      if (fit < w) h *= Math.sqrt(fit / w);   // narrower dune, plausible slope
      w = fit;
      ctx.note("mountain", [x, baseY + h / 2, z], [w, h, w]);
      addFrustum(out, [x, baseY - 2, z], w * 0.62, w * 0.42, h * 0.18,
                 opts.forest || [0.20, 0.34, 0.20], 9, null);   // skirt
      addMountain(out, [x, baseY, z], w * 0.5, h, opts);
    };
    const ridge = (x, z, baseY, ang, len, w, h, col) => {
      // Skip if footprint half-extent reaches tarmac.
      if (onTrack(x, z, Math.max(len, w) * 0.5 + ROAD_SKIRT)) {
        ctx.noteSuppressed("ridge", `ridge SUPPRESSED at x=${x.toFixed(0)} z=${z.toFixed(0)}: len=${len} w=${w}`);
        return;
      }
      ctx.note("ridge", [x, baseY + h / 2, z], [w, h, len]);
      const f = [Math.cos(ang), 0, Math.sin(ang)], r = [-f[2], 0, f[0]];
      // BURY the base. addPrism anchors at the BASE (Trap A in
      // docs/SCENERY-GROUNDING.md), so a prism placed at baseY has its underside
      // exactly there — and every one of the 28 ridge() calls across 24 circuits
      // passes `pyMin`, the lap's LOWEST NODE. The ground these backdrop ridges
      // actually stand on out there is the floor slab, and that sits at
      // `floorY = pyMin - 1` (js/track/core/surface.js) — so the ridge line perched
      // above its own ground by construction, fleet-wide. 206 of monza's 214
      // flagged clusters were this one helper.
      //
      // Sink the origin and add the SAME amount back to the height, so the
      // silhouette above ground is unchanged — dropping the origin alone would
      // shave SINK metres off every hill on 24 circuits. mountain() already does
      // the equivalent for its skirt (`baseY - 2`); ridge() was the sibling that
      // never got it.
      const SINK = 2;
      addPrism(out, [x, baseY - SINK, z], [w, h + SINK, len], col, [r, [0, 1, 0], f]);
      const jr = hash(x * 0.13 + z * 0.11 + ang);
      const a2 = ang + (jr - 0.5) * 0.6;
      const f2 = [Math.cos(a2), 0, Math.sin(a2)], r2 = [-f2[2], 0, f2[0]];
      const off = (0.06 + jr * 0.06) * len, dY = 1.0;
      addPrism(out,
        [x + f[0] * off, baseY - SINK - dY, z + f[2] * off],
        [w * 0.7, h * (0.42 + jr * 0.22) + SINK + dY, len * 0.4],
        col, [r2, [0, 1, 0], f2]);
    };
    // Returns the number of riser slabs that cleared rejBox. Callers that need
    // a whole stand (grandstandEx) use this to refuse a hollow shell: when every
    // riser lands on the fold of a neighbouring leg, seating is gone and the
    // roof/shell alone read as a backwards/empty box (bahrain T1, 2026-09).
    const crowdBank = (k, side, gap, len, rise, depth, riserCol, lift) => {
      const a = anchor(k, side, gap), b = [a.r, a.u, a.t];
      const rows = Math.max(3, Math.round(rise / 1.4));
      const perRow = Math.max(6, Math.round(len / 1.15));
      const riser = riserCol || (NIGHT ? [0.10, 0.10, 0.13] : [0.28, 0.26, 0.27]);
      const y0 = lift || 0;
      let placed = 0;
      for (let r = 0; r < rows; r++) {
        const f = (r + 0.5) / rows, up = y0 + f * rise, back = f * depth;
        // dark step riser behind each seating row (blocks sky/ground show-through).
        // Guarded (unlike the tiny spectator boxes): the riser is a wide flat slab,
        // so a mis-placed bank whose front row creeps toward the tarmac would
        // otherwise overhang the road here — the bypass an unguarded raw
        // addBox leaves open. rejBox drops only a riser actually over the
        // road; a bank safely behind the shell never trips it, so intended
        // crowds are unchanged.
        out._mat = MAT.CONCRETE;
        const riserC = vadd(vadd(a.c, a.u, up), a.r, side * back);
        if (rejBox(riserC, [1.3, 1.5, len], b)) continue;
        placed++;
        ctx.instance(`crowd-riser|${riser.join(",")}`,
          { o: riserC, r: a.r, u: a.u, t: a.t, s: [1, 1, len] },
          (rec) => { rec.mat(MAT.CONCRETE); rec.box([0, 0, 0], [1.3, 1.5, 1], riser); },
          { kind: "crowdRiser", k, side }, { unguarded: true });
        out._mat = MAT.FABRIC;
        for (let s2 = 0; s2 < perRow; s2++) {
          if (s2 % 10 === 9) continue;                       // aisle / vomitory gap
          const h1 = hash(k * 2.7 + r * 5.3 + s2 * 1.9 + side * 3.1);
          const h2 = hash(k * 1.3 + r * 8.1 + s2 * 4.7 + side * 2.2);
          if (h2 > 0.86) continue;                            // ~14% empty seats
          const along = ((s2 + 0.5) / perRow - 0.5) * len + (h1 - 0.5) * 0.45;
          const c = vadd(vadd(vadd(a.c, a.t, along), a.u, up + 0.55), a.r, side * back);
          let col;
          if (NIGHT) {
            col = h1 > 0.955 ? [2.6, 2.4, 2.0]                // phone light / flash (HDR → blooms)
                : h1 > 0.55  ? [0.09, 0.10, 0.13]            // dark bodies
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
        // def.standSet (js/circuits/<id>.js) names the livery families this
        // venue rotates through; the three permanent-circuit greys otherwise.
        const set = (def && def.standSet) || TrackSceneryData.STAND_SET_DEF;
        if (set && set.length) {
          const kk = Math.round(s * n) % n;
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

      const k = Math.round(s * n) % n;
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
      // Per-call MIN_SEP slot, as spectatorHill's hillSeq: circuits lay stands
      // end to end (fuji's run() of 150 m walls) and over each other, and on a
      // curve two shells' faces landed 1.3 mm apart. Geometry only, and only
      // OUTWARD — the barrier, solid index and on-track test above keep `gap`.
      // Alternate 0 / MIN_SEP: consecutive stands differ by MIN_SEP and every
      // other stand is where it was. Measured 2026-09-24 against the 4-slot
      // TrackGeom.SEP_SLOTS nudge: fleet coplanar spots 259 vs 263 (a 3.5-16.5
      // cm shift lands shells on city facades — mexico +10 pairs).
      gap += (standSeq++ & 1) * TrackGeom.MIN_SEP;
      // Back shell + upper tiers. The crowd bank below runs from gap+1.5 back
      // 4.2 m (+ half a 1.3 m riser): its last row's back edge is at gap+5.93,
      // so the single-tier shell sits BEHIND it, gap+6 .. gap+12.5 (a 10 m
      // shell from gap+2.5 swallows four of five rows — P2,
      // docs/notes/SCENERY-QA-PLAN.md). Same back face, same footprint.
      //
      // A MULTI-TIER stand stacks each upper rake 4.6 m further back and 7.6 m
      // up, which puts tier 1 (gap+5.87 .. gap+10.53, from lift-0.05 up)
      // straight over that shell: a full-height shell (top ~11.2 m, 16.7 m on
      // fuji's 17.5 m walls) swallows the upper tier's lower rows, and the
      // 5.2 m concourse band (gap+3.5 .. 8.7, 5.8-7.6 m up) encloses the ground
      // tier's top two rows (2026-09-24, measured as enclosed FABRIC triangles
      // fleet-wide). So the shell is STEPPED: under each built upper rake it is
      // a section capped just below that rake's lowest riser, and only behind
      // the last rake does it run to full height. The concourse band is a
      // fascia stripe on the section's face, MIN_SEP clear of the rake in front
      // of it and of the section behind it. Footprint and indexSolid are
      // unchanged; no crowd row of the stand is inside any of these boxes.
      const SHELL_IN = 6, SHELL_OUT = 12.5, SEP = TrackGeom.MIN_SEP;
      const BANK_AT = 1.5, BANK_RISE = 7, BANK_DEPTH = 4.2, TIER_BACK = 4.6, TIER_LIFT = 7.6;
      const bankRows = Math.max(3, Math.round(BANK_RISE / 1.4));   // crowdBank's own row count
      // Back face of tier i's rake (last riser: row centre + half its 1.3 m
      // depth), and a rake's floor above its anchor (row 0's riser bottom).
      const rakeBack = (i) => BANK_AT + TIER_BACK * i + BANK_DEPTH * (bankRows - 0.5) / bankRows + 0.65;
      const rakeFloor = (lift) => lift + BANK_RISE * 0.5 / bankRows - 0.75;
      const shellCol = shell || [0.40, 0.41, 0.46];
      const dotU = (p) => p[0] * u[0] + p[1] * u[1] + p[2] * u[2];
      // One shell section from lateral a..b (metres past the road edge): full
      // height, or capped at the u-coordinate capU just below a rake.
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
      // Seat first. A shell/roof with no rows is a hollow box that reads as a
      // backwards grandstand (bahrain T1 at the 0.20 fold: gap 24 cleared the
      // shell but every riser hit the neighbouring leg). If seating cannot
      // emit, suppress the whole stand rather than ship a rowless shell —
      // call sites that want the stand must move gap/s until crowdBank clears.
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
        // Concourse fascia stripe under the deck: 0.5 m deep, its face SEP
        // behind the rake in front, its top 5 cm under the section's.
        const capU = dotU(ca.c) + rakeFloor(lift) - 0.1;
        const bandA = prevBack + SEP, bandO = side * (hw[k] + gap + bandA + 0.25);
        const bandBase = [px[k] + r[0] * bandO, 0, pz[k] + r[2] * bandO];
        const bandC = vadd(bandBase, u, capU - 0.05 - 0.9 - dotU(bandBase));
        if (!rejBox(bandC, [0.5, 1.8, tl], cb)) {
          addBox(out, bandC, [0.5, 1.8, tl], fasciaCol, cb);
          crowdBank(k, side, gap + BANK_AT + back, tl, BANK_RISE, BANK_DEPTH, riserTint, lift);
          // The shell under this rake, capped below its floor, 1.5 SEP behind
          // the stripe's face so the two front faces never share a plane.
          shellSection(Math.max(shellFront, bandA + 1.5 * SEP), Math.min(SHELL_OUT, rakeBack(ti)), capU);
          prevBack = rakeBack(ti);
          shellFront = prevBack + 2.5 * SEP;
          // Only a tier that actually BUILT raises the roof — a culled tier
          // must not lift the slab a full rake above the surviving stand.
          tierLift.push(lift);
        }
      }
      // Full height behind the last rake (the whole shell of a one-tier stand).
      const fullShell = shellSection(shellFront, SHELL_OUT, null);
      const topLift = tierLift.length ? tierLift[tierLift.length - 1] : 0;
      // Roof slab cantilevered over the crowd, lifted on the up axis
      const a = anchor(k, side, gap + 5);
      const roofY = 13 + topLift;
      const roofC = vadd(a.c, a.u, roofY);
      const roofW = roofKind === "truss" ? 12 : (roofKind === "flat" ? 10 : 12);
      // The rear fascia's lateral span (see below) and how far the slab must
      // reach back to sit on it: a three-tier stand's last rake ends at
      // gap+15.13, past a 12 m slab's back edge (gap+11), so a fascia behind
      // it would leave the slab floating (indianapolis). The slab grows back
      // to cover it; one- and two-tier cantilevers are unchanged (<= 1.5 cm).
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
          // "flat" sits tight over the shell; "cantilever" (default) overhangs.
          const rw = roofKind === "flat" ? 10 : 12;
          addBox(out, slabC, [rw + roofExt, 0.8, len + 2], roofCol, [a.r, a.u, a.t]);
        }
        // Support columns under the roof's outer (trackside) edge.
        //
        // ⚠ addCyl is BASE-anchored (geom.js §addPrism: "addCyl/addCone/
        // addFrustum are base-anchored the same way"). This passed the MIDPOINT
        // — vadd(pc, u, H/2) — so every pylon on every circuit hung exactly
        // half its own height in the air: 9.6 m of daylight under Abu Dhabi's
        // 20 m posts, and floaters on 8 more circuits off this one line. It is
        // the eighth instance of the base-vs-centroid defect the geom.js note
        // enumerates. Measured over the 9 affected circuits: 95 -> 56 floating
        // clusters from seating the base alone.
        //
        // The foot is then extended DOWNWARD to the ground under its own world
        // x/z. A per-node lateral sample will not do: `off` runs along the
        // tangent at node k while the track curves away, so on a long curved
        // stand the post's true lateral distance is nowhere near gap+0.4 and
        // the verge has eased metres further down by then (monaco 31 -> 28).
        // Only ever lowering a foot already in place keeps this monotone —
        // re-siting it onto the per-node frame instead moved the row onto
        // different terrain and made Red Bull Ring WORSE (13 -> 15 floating
        // primitives), because a foot that lands somewhere new can land worse.
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
      // Glazed hospitality band tucked under the roof at the back of the top rake.
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
      // Rear fascia — closes the gap between the back shell's top and the roof
      // underside. Without it the roof is a slab hanging in air on EVERY
      // grandstand on every circuit: the shell tops out at ground+11.2 while the
      // roof's underside sits at ground+12.3. The two are also sampled at
      // different lateral distances (gap+7.5 via groundYAt vs gap+5 via the
      // anchor's terrain raycast), so the shortfall varies with the verge slope
      // rather than being a fixed 1.1 m — hence solving it from the two pieces'
      // ACTUAL world-space tops instead of a constant. Placed at the roof's
      // outer edge (over the shell, behind the crowd) so it never occludes the
      // under-roof night strip, and is itself hidden by the roof from trackside.
      // On a multi-tier stand the fascia starts behind the LAST rake (one SEP
      // behind the full-height shell's face) — at the roof's edge it stood
      // over the upper tier and enclosed its rows. At least 0.3 m deep; the
      // slab above was widened to reach it (f0/f1, roofExt). Past the shell's
      // back face (three tiers) it stands on the ground.
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
      // LAYERED BANKS MUST NOT COINCIDE. Circuits paint a two-tone cut by
      // calling this twice over almost the same span at the SAME gap — a tall
      // pale bank and a shorter redder one (okayama 0.100/0.102, 0.320/0.322,
      // 0.614/0.616). Wherever the two row ladders line up the treads come out
      // BYTE-IDENTICAL: same centre, same size, same basis — 340 coincident
      // pairs on okayama alone (2026-09-22), the purest z-fight there is.
      // A deterministic per-call slot separates them: stable across builds
      // (no hash of position, no RNG) and strictly OUTWARD, so it can only
      // increase clearance from the tarmac.
      // Both axes have to move. `steps` and `h` do NOT reach the ladder
      // (rows/rise/depth are the defaults for every caller), so two layered
      // calls emit the SAME ladder: nudging only the gap leaves their treads'
      // END caps — the ±t faces, depth x (rise+0.5) = 3.3 m2 each — on exactly
      // the same planes, 400 coincident pairs on okayama's three clayCut()
      // pairs alone (2026-09-22, coplanar-audit --why). The slot moves the
      // frame OUTWARD (never toward the tarmac) and ALONG the road, on two
      // different permutations of the same five positions: TrackGeom.MIN_SEP
      // apart across the gap (at the 300 m window, fights beyond 388 m) and
      // 2 x MIN_SEP along it. The along-shift moves the tread and its crowd
      // together, so a call's ladder still tiles exactly — the only seam is
      // between two layers, where the whole point is that they differ.
      // The odd bases (0.017 across, 0.007 along) are not decoration: authored
      // props sit at whole metres and half metres, so a ladder offset by an
      // exact multiple of the slot step can still land flush on one (monza
      // gained a 12 m2 pair against a tracks.js place() prop that way). An odd
      // base breaks the tie with the authored grid without changing any
      // separation BETWEEN slots.
      const slot = hillSeq++ % 5, SEP = TrackGeom.MIN_SEP;
      gap += 0.017 + slot * SEP;
      const sShift = 0.007 + ((slot * 2) % 5) * SEP;
      const rows = Math.max(2, Math.min(8, Math.round(opts.rows || 4)));
      const rise = opts.rise != null ? opts.rise : 1.15;      // per-row height gain
      // `opts.h` (total bank height, passed by donington / mosport / okayama)
      // is deliberately NOT honoured. Measured 2026-09-25 with rise = h / rows:
      // clip-audit severe donington 20 -> 22, okayama 57 -> 60; coplanar
      // donington 2 -> 3 spots; ground-audit flatCoplanar donington 23 -> 24,
      // mosport 6 -> 7 — the taller banks push into the trees and terraces laid
      // around the default ladder. Those call sites keep `h` as a record of the
      // intended height; honouring it needs those circuits re-dressed first.
      // (okayama's `steps` is likewise unread — `rows` is the knob.)
      const depth = opts.depth != null ? opts.depth : 2.0;    // per-row setback
      // `col` is the older name some circuits pass for the tread colour
      // (donington, mosport, okayama): honoured when `grass` is absent.
      const grass = opts.grass || opts.col || [0.26, 0.42, 0.20];
      const riser = opts.riser || [0.30, 0.30, 0.28];
      const dens = opts.density != null ? Math.max(0.05, Math.min(1, opts.density)) : 0.65;
      const step = opts.step || 5;
      // The bank is a solid mass — index it so treelines cannot grow through it.
      ctx.indexSolid(s0, s1, side, gap, rows * depth + 1);
      ctx.along(s0, s1, step, (k, spacing) => {
        // ONE terrain sample per along-step, like crowdBank just above — every
        // row is offset from this SAME frame instead of re-anchoring per row.
        // Re-anchoring (the original implementation) samples a different
        // terrain point and a different terrain-tilted basis for every row, so
        // on any slope — not just a curve — independently-tilted boxes rotate
        // into each other: redbull's Green Hill measured 1.8 m of
        // interpenetration between rows this way. A single shared frame,
        // offset by translation, cannot self-intersect by construction.
        const a = anchor(k, side, gap);
        const b = [a.r, a.u, a.t];
        const ac = vadd(a.c, a.t, sShift);   // layer nudge, along the road
        let previousRow = false;
        for (let r = 0; r < rows; r++) {
          const back = r * depth, up = r * rise;
          // Terrace tread: a wide flat step. Guarded — a bank creeping toward
          // the tarmac must be dropped, not left overhanging the road.
          const tc = vadd(vadd(ac, a.u, up + rise * 0.5), a.r, side * back);
          // At an inside bend the offset terrace is shorter than the road
          // centreline's arc step. Fit each box between the bisectors of its
          // neighbours, including the radial and vertical projected extents:
          // both ends yield equally, so rotated adjacent treads cannot draw
          // overlapping tops (Red Bull's Green Hill, three rows).
          let treadSpan = spacing;
          const nodes = Math.max(1, Math.round(spacing / ds));
          for (const dk of [-nodes, nodes]) {
            const q = anchor((k + dk + n) % n, side, gap);
            const qc = vadd(vadd(vadd(q.c, q.t, sShift), q.u, up + rise * 0.5), q.r, side * back);
            const delta = [qc[0] - tc[0], qc[1] - tc[1], qc[2] - tc[2]];
            const d = Math.hypot(delta[0], delta[1], delta[2]);
            if (!(d > 0)) { treadSpan = 0; break; }
            const proj = (axis) => Math.abs((axis[0] * delta[0] + axis[1] * delta[1] + axis[2] * delta[2]) / d);
            const along = proj(a.t);
            const available = d - depth * proj(a.r) - (rise + 0.5) * proj(a.u);
            // Fixed radial/vertical support can fill the separating interval
            // even when its along projection is zero. Such a row cannot fit;
            // otherwise keep the actual positive span, however short it is.
            if (!(available > 0)) { treadSpan = 0; break; }
            if (along > 0) treadSpan = Math.min(treadSpan, available / along);
          }
          if (!(treadSpan > 0) || rejBox(tc, [depth, rise + 0.5, treadSpan], b)) { previousRow = false; continue; }
          out._mat = MAT.CONCRETE;
          addBox(out, tc, [depth, rise + 0.5, treadSpan], r % 2 ? riser : grass, b);
          // A tight bend can reject the lower rows but retain a narrow upper
          // tread. Give that island its own small pier instead of relying on
          // the old overlapping neighbour boxes to hold it above the ground.
          if (r > 0 && !previousRow) {
            const bottom = vadd(tc, a.u, -(rise + 0.5) / 2);
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
          // Preserve the authored count wherever complete 0.5 x 0.46 m bodies
          // fit. Short chords need fewer slots; the whole footprint, including
          // jitter, stays on its tread rather than hanging past the ends.
          const bodyW = 0.5, bodyD = 0.46, edge = 0.03;
          const originalCount = Math.max(2, Math.round(spacing / 1.8));
          const perRow = treadSpan >= bodyD + 2 * edge && depth >= bodyW + 2 * edge
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
    // Low clipped hedge / continuous treeline.
    const HEDGE_W = 2.4;
    const hedge = (s0, s1, side, gap, h, col) => {
      // A hedge is a solid 2.4 m-wide body, but it is not a barrier — it must
      // not move the driving limit. Index the geometry only. This was the
      // single largest source of cross-model clipping on the fleet: without it
      // the roadside tree scatter plants straight through every hedge run
      // (monza's hedge x plantTree bucket was ~89% of that circuit's pairs).
      // The box straddles the anchor, so its inner face is half a width in.
      // A hedge run is laid out purely by arc length and never asks whether
      // something solid is already standing on the line, so at Zandvoort it grew
      // straight through a tyre wall (frac 0.959, 1.25 m of shared volume). A
      // safety barrier outranks planting, so the hedge yields segment by segment
      // — the run keeps its ends and simply stops at the obstruction.
      // Clearance is decided BEFORE indexSolid registers the hedge's own mass,
      // or every segment would read as blocked by itself.
      const blocked = new Set();
      ctx.along(s0, s1, 4, (k) => {
        const p = anchor(k, side, gap);
        if (!ctx.barrierClear(p.c[0], p.c[2], HEDGE_W / 2)) blocked.add(k);
      });
      ctx.indexSolid(s0, s1, side, gap - HEDGE_W / 2, HEDGE_W);
      ctx.along(s0, s1, 4, (k, spacing) => {
        if (blocked.has(k)) return;
        const p = anchor(k, side, gap);
        // 5 m, not 1.2: a field hedge that the lap brings within a few metres of
        // ANOTHER stretch of road sits over that road's terrain dip, grounded on
        // its own node's height — magny_cours 0.405 hung 2.7 m in the air.
        if (onTrack(p.c[0], p.c[2], 5)) {
          ctx.noteSuppressed("hedge", `hedge SUPPRESSED at k=${k} side=${side}: gap=${gap}`);
          return;
        }
        const base = col || [0.18, 0.36, 0.16], hb = [p.r, p.u, p.t];
        const hj = h * (0.9 + hash(k * 5.1 + side) * 0.2);
        addBox(out, vadd(p.c, p.u, (hj - 0.4) / 2), [HEDGE_W, hj + 0.4, spacing], base, hb);   // base sunk 0.4
        const lump = 0.25 + hash(k * 7.7 + side) * 0.5, lx = (hash(k * 3.3 + side) - 0.5) * HEDGE_W * 0.4;
        addBox(out, vadd(vadd(vadd(p.c, p.u, hj + lump * 0.5 - 0.2), p.r, lx), p.t, (hash(k * 9.1) - 0.5) * spacing * 0.3),
               [HEDGE_W * (0.5 + hash(k * 2.2) * 0.3), lump, spacing * 0.55],
               [base[0] * 0.9, base[1] * 0.92, base[2] * 0.88], hb);
      });
    };
    // forestEdge(): a DENSE treeline (mix of pine/tree) from s0→s1 on `side`,
    // GUARANTEED not to clip barriers. Foliage is placed so the canopy's INNER
    // edge stays at least `gap` beyond the road edge — i.e. the per-tree `dist`
    // accounts for the canopy radius (which grows with tree height), so a tree
    // called at small gap can never poke its canopy through a wall/hedge/fence.
    //   opts: { spacing, density, hMin, hMax, col, col2, pineFrac }
    // Canopy outer radius for a species at height h — the SINGLE source of truth
    // for "how far does this tree's foliage actually reach sideways". Both
    // forestEdge() and the FURN roadside scatter derive placement from it.
    // Keeping two hand-copied estimates is what let forestEdge's drift stale:
    // it still described tree()'s old (2.9 + h*0.12) skirt after the broadleaf
    // crown was widened to (3.7 + h*0.14), leaving the "GUARANTEED not to clip
    // barriers" contract ~0.9 m optimistic at h=16.
    const canopyR = (kind, h) => {
      const jMax = 1.15;                                  // per-instance jitter ceiling
      if (kind === "pine") return 2.7 * jMax + 0.4;       // pine(): widest lower tier
      // fir → conifer(): widest cone is (2.1+h*0.06)*j. Keep-out must not collapse
      // below the previous broadleaf scatter corridor when furniture.tree retargets
      // pine→fir (2026-09-22: bare mesh extent grew interpenetration on all five).
      // Mesh extent + lean budget, floored at ~90% of broadleaf keep-out.
      if (kind === "fir") {
        const mesh = (2.1 + h * 0.06) * jMax + 0.8;
        const broad = (3.7 + h * 0.14) * jMax + 0.4;
        return Math.max(mesh, broad * 0.9);
      }
      if (kind === "palm") return 5.2;                    // frond hub 2.4 + blade spread
      if (kind === "cypress")       return 1.45 * jMax + 0.4;   // narrow column
      if (kind === "stonePine")     return h * 0.44 + 0.6;      // wide flat parasol
      if (kind === "broadleafFall") return h * 0.50 + 0.8;      // lobed crown (lobe radial offset + widest lobe radius)
      if (kind === "acacia")        return h * 0.575 + 0.8;     // flat-topped thorn, spread = h*1.15
      if (kind === "plane")         return 4.2 + h * 0.12 + 0.6;  // pollarded avenue crown
      if (kind === "vase")          return (4.0 + h * 0.17) * jMax + 0.4;
      if (kind === "weeping")       return (3.9 + h * 0.16) * jMax + 0.4;
      if (kind === "columnar")      return (1.5 + h * 0.05) * jMax + 0.4;
      return (3.7 + h * 0.14) * jMax + 0.4;               // tree(): widest bulge cone
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
      // density 0..1 → step 7m (sparse) … 3m (dense). Default ~medium-dense.
      //
      // WHAT THIS KNOB ACTUALLY DOES. along() quantises to whole nodes
      // (`step = max(1, round(stepM / ds))`) and every circuit resamples to
      // ds = 4.00 m, so this maps to exactly TWO reachable spacings:
      //   density > 0.25  → stepM < 6 m  → 1 node  → trees every 4 m
      //   density <= 0.25 → stepM >= 6 m → 2 nodes → trees every 8 m
      // Anything from 0.26 to 1.0 is the same treeline. Measured, not guessed:
      // 0.86 and 0.42 emit identical geometry.
      //
      // 4 m spacing is TIGHTER THAN THE CANOPY. A 30 m pine's canopyR is ~3.5 m,
      // so adjacent crowns overlap by ~3 m — and because this emitter alternates
      // pine/tree, the clip audit sees two DIFFERENT models interpenetrating and
      // counts every one. A dense belt is therefore worth tens of severe clip
      // spots by construction. That is accepted: real mixed woodland has
      // interlocking canopies, and thinning to 8 m to satisfy the metric costs
      // half the trees for a small fraction of the spots (measured on
      // hockenheim: 180 k props for 20 spots). Baseline it, don't thin it.
      const dens = opts.density != null ? Math.max(0.05, Math.min(1, opts.density)) : 0.7;
      // `spacing` (METRES between trunks) is the escape hatch from the two
      // reachable density spacings above. A sparse background woodland — a tree
      // every 15-25 m — is simply not expressible as a density: the knob bottoms
      // out at stepM 6.8 → 8 m. Callers that pass it were silently getting the
      // 4 m dense belt, i.e. ~4x the trees they asked for. along() still
      // quantises to whole nodes (round(stepM / 4)), so the honest grid is
      // multiples of 4 m: spacing 15 → 16 m, spacing 24 → 24 m.
      const step = opts.spacing != null ? Math.max(ds, opts.spacing) : 7 - dens * 4;
      const detailed = opts.treeOptions && opts.treeOptions.crown === "lobed" ? opts.treeOptions : null;
      const limit = detailed && detailed.maxDetailed !== undefined ? detailed.maxDetailed : 30;
      let accepted = 0;
      ctx.along(s0, s1, step, (k) => {
        const s = hash(k * 4.3 + side * 1.1);
        const h = hMin + s * (hMax - hMin);
        const isPine = hash(k * 6.7 + side * 0.7) < pineFrac;
        const canopy = canopyR(isPine ? "pine" : "broad", h);
        // dist so the canopy's inner edge sits `gap` beyond the road edge
        const dist = gap + canopy;
        // stagger a back row slightly for depth on the densest treelines
        const back = (dens > 0.6 && hash(k * 8.9 + side) < 0.4) ? canopy * 1.4 : 0;
        const d = clearTreeDist(k, side, dist + back, canopy);
        if (d == null) return;
        if (isPine) pine(k, side, d, h, pineCol);
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
      // Nominal envelope: lobes are radius ~1.1-2.0 spread over a ~0.6-1.1 m
      // offset, standing 2.2-3.2 m tall. A bush takes no size argument, so this
      // is the clump's typical extent rather than a measured bound.
      ctx.note("bush", [p.c[0], p.c[1] + 1.4, p.c[2]], [3, 2.8, 3], { k, side });
      const bc = col || [0.20, 0.38, 0.18];
      const c2 = [bc[0] * 0.90, bc[1] * 0.94, bc[2] * 0.88];
      const jh = hash(k * 4.3 + side * 2.1 + dist);
      let lobes = (opts && opts.lobes) || (jh < 0.4 ? 2 : 3);   // most clumps 2-3 lobes
      // Understorey is foliage too: inheriting FLAT from the caller makes
      // clumps shade as solid props and misclassifies natural crown overlap.
      const previousMat = out._mat;
      out._mat = MAT.FOLIAGE;
      if (bform === "agave") {
        // Spiky rosette — desert circuits need something that is not a blob.
        for (let i = 0; i < 6; i++) {
          const ang = i / 6 * 6.2832;
          const tip = vadd(vadd(vadd(p.c, p.u, 1.5), p.r, Math.cos(ang) * 1.3), p.t, Math.sin(ang) * 1.3);
          addCone(out, vadd(p.c, p.u, 0.2), 0.34, 1.9, bc, 4,
            [p.r, norm([tip[0] - p.c[0], 1.3, tip[2] - p.c[2]]), p.t]);
        }
        out._mat = previousMat;
        return;
      }
      if (bform === "grass") { lobes = 1; }   // a single low tussock
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
