/* Detached circuit pit exterior: build once on selection, never on the render clock. */
const GarageExteriorGeometry = (function () {
  "use strict";
  const MAX_VERTICES = 240000, MAX_INDICES = 720000;
  const empty = () => ({ pos: [], nrm: [], col: [], mat: [], idx: [] });
  const bounds = () => [-55, 55, -10, 45, GaragePrims.Z_DOOR, 110];

  const groundBounds = () => [-550, 550, -10000, 10000, GaragePrims.Z_DOOR, 750];

  // Match SceneryPits' exact-arc, yaw-only placement, including its banked origin.
  function anchorOf(track, teamId) {
    const pit = track.pit;
    if (!pit || !pit.hasBays || pit.painted) return null;
    const row = TrackPit.rowOf(pit, teamId);
    if (row < 0) return null;
    const box = pit.row.boxes[row], f = { p: [0, 0, 0], r: [0, 0, 0], t: [0, 0, 0], hw: 0 };
    TrackSpline.sample(track, box.s, f);
    const r = TrackGeom.norm(f.r), t = TrackGeom.norm(f.t), u = TrackGeom.norm(TrackGeom.cross(r, t));
    const lat = pit.side * (f.hw + pit.off.workOut + pit.bay.depth / 2);
    const y = TrackMesh.bankOffsetAt(track, box.k, lat) + 0.02;
    const position = f.p.map((v, i) => v + r[i] * lat + u[i] * y);
    const yaw = Math.atan2(-pit.side * r[0], -pit.side * r[2]);
    return { position, yaw, side: pit.side, row, teamId, s: box.s,
      bands: Object.assign({}, pit.bands), door: { width: pit.bay.doorW, height: pit.bay.doorH, z: pit.bay.depth / 2 } };
  }

  function vertex(source, i, a) {
    const j = i * 3, dx = source.pos[j] - a.position[0], dz = source.pos[j + 2] - a.position[2];
    const c = Math.cos(a.yaw), s = Math.sin(a.yaw);
    const nx = source.nrm[j], nz = source.nrm[j + 2];
    return [dx * c - dz * s, source.pos[j + 1] - a.position[1], dx * s + dz * c,
      nx * c - nz * s, source.nrm[j + 1], nx * s + nz * c,
      source.col[j], source.col[j + 1], source.col[j + 2]];
  }
  function clipPlane(poly, axis, limit, sign) {
    const result = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const da = (a[axis] - limit) * sign, db = (b[axis] - limit) * sign;
      if (da >= 0) result.push(a);
      if ((da >= 0) !== (db >= 0)) {
        const t = da / (da - db), v = a.map((x, j) => x + (b[j] - x) * t);
        v[axis] = limit; result.push(v);
      }
    }
    return result;
  }
  function* clipSteps(source, anchor, limits, budget) {
    const out = empty();
    for (let i = 0; i + 2 < source.idx.length; i += 3) {
      if (i % 6144 === 0) yield;
      let poly = [vertex(source, source.idx[i], anchor), vertex(source, source.idx[i + 1], anchor), vertex(source, source.idx[i + 2], anchor)];
      if (!poly.every(v => v.every(Number.isFinite))) throw new Error("Non-finite circuit exterior geometry");
      for (let axis = 0; axis < 3 && poly.length; axis++) {
        poly = clipPlane(poly, axis, limits[axis * 2], 1);
        if (poly.length) poly = clipPlane(poly, axis, limits[axis * 2 + 1], -1);
      }
      // Triangulate the clipped convex polygon; discard boundary-only remnants.
      for (let j = 1; j + 1 < poly.length; j++) {
        const tri = [poly[0], poly[j], poly[j + 1]], a = tri[0], b = tri[1], c = tri[2];
        const cross = TrackGeom.cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]);
        if (Math.hypot(...cross) < 1e-9) continue;
        budget.vertices += 3; budget.indices += 3;
        if (budget.vertices > MAX_VERTICES || budget.indices > MAX_INDICES) throw new Error("Circuit exterior geometry budget exceeded");
        const base = out.pos.length / 3, material = source.mat && source.mat[source.idx[i]] || 0;
        for (const v of tri) {
          out.pos.push(v[0], v[1], v[2]);
          const n = Math.hypot(v[3], v[4], v[5]) || 1;
          out.nrm.push(v[3] / n, v[4] / n, v[5] / n);
          out.col.push(v[6], v[7], v[8]); out.mat.push(material);
        }
        out.idx.push(base, base + 1, base + 2);
      }
    }
    return out;
  }

  // A narrow sill-to-apron ramp under the raised threshold. Only the outer
  // edge meets the pit ribbon's +3 cm surface; no coplanar area is added.
  function bridge(road, anchor, color, budget) {
    const x = anchor.door.width / 2, z = GaragePrims.Z_DOOR, base = road.pos.length / 3;
    const points = [[-x, 0, z], [x, 0, z], [-x, .03, z + .30], [x, .03, z + .30]];
    for (const p of points) {
      road.pos.push(...p); road.nrm.push(0, 1 / Math.hypot(1, .1), -.1 / Math.hypot(1, .1));
      road.col.push(...color); road.mat.push(TrackGeom.MAT ? TrackGeom.MAT.ASPHALT : 16);
    }
    road.idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    budget.vertices += 4; budget.indices += 6;
    if (budget.vertices > MAX_VERTICES || budget.indices > MAX_INDICES) throw new Error("Circuit exterior geometry budget exceeded");
  }

  function unsupported(def, reason) {
    return { supported: false, reason, trackId: def && def.id || null,
      road: null, props: null, ground: null, anchor: null, stats: { vertices: 0, indices: 0 } };
  }
  function* buildSteps(def, options = {}) {
    if (!def || !def.id) return unsupported(def, "missing-circuit");
    // line:false avoids racing-line / physics construction. Never call Tracks.build(Paced).
    const track = Object.assign({}, Tracks.buildCenterline(def, { line: false }), { meshes: {} });
    yield { phase: "centerline" };
    track.pit = TrackPit.build(track, def, TrackSpline.curvature);
    const anchor = anchorOf(track, options.teamId);
    if (!anchor) return unsupported(def, track.pit && track.pit.hasBays ? "team-has-no-bay" : "circuit-has-no-bays");
    track.surface = TrackSurface.profile(def, track);
    track._night = options.night === undefined ? !!def.night : !!options.night;
    yield { phase: "surface" };
    const limits = bounds(), floorLimits = groundBounds(), budget = { vertices: 0, indices: 0 };
    let raw = TrackMesh.buildRoad(track);
    // The race appends this ribbon to start-line geometry; use its SAME generator,
    // with its own buffer here, without building grid boxes or the whole scenery.
    TrackMesh.buildPitLane(track, raw); TrackMesh.buildPitBoxes(track, raw);
    yield { phase: "road" };
    const road = yield* clipSteps(raw, anchor, limits, budget); raw = null;
    bridge(road, anchor, track.asphaltCol || def.palette && def.palette.asphalt || [.16, .17, .19], budget);
    yield { phase: "road-clipped" };
    raw = empty();
    const pitStats = SceneryPits.build({ track, out: raw, night: track._night, exteriorOnly: true,
      rawBox: TrackGeom.addBox, rawEmit: TrackGeom.emit, upOf: TrackMesh.upOf,
      bankOffsetAt: TrackMesh.bankOffsetAt, curvature: s => TrackSpline.curvature(track, s) });
    yield { phase: "pit" };
    const props = yield* clipSteps(raw, anchor, limits, budget); raw = null;
    yield { phase: "pit-clipped" };
    const ground = yield* clipSteps(TrackMesh.buildFloor(track), anchor, floorLimits, budget);
    return { supported: true, trackId: def.id, road, props, ground, anchor,
      stats: { vertices: budget.vertices, indices: budget.indices, bounds: limits, groundBounds: floorLimits, night: track._night, pit: pitStats } };
  }
  return Object.freeze({ buildSteps });
})();
