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

  // A narrow sill-to-apron ramp: its outer edge meets the actual banked road.
  // Contact indexing precedes this decorative join and excludes its triangles.
  function bridge(road, anchor, color, budget, surface) {
    const x = anchor.door.width / 2, z = GaragePrims.Z_DOOR, base = road.pos.length / 3;
    const leftSample = sampleHeight(surface, -x, z + .30), rightSample = sampleHeight(surface, x, z + .30);
    const left = Number.isFinite(leftSample) ? leftSample : .03, right = Number.isFinite(rightSample) ? rightSample : .03;
    const forward = (left + right) / .60, lateral = (right - left) / (2 * x);
    const normal = Math.hypot(lateral, 1, forward);
    const points = [[-x, 0, z], [x, 0, z], [-x, left, z + .30], [x, right, z + .30]];
    for (const p of points) {
      road.pos.push(...p); road.nrm.push(-lateral / normal, 1 / normal, -forward / normal);
      road.col.push(...color); road.mat.push(TrackGeom.MAT ? TrackGeom.MAT.ASPHALT : 16);
    }
    road.idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    budget.vertices += 4; budget.indices += 6;
    if (budget.vertices > MAX_VERTICES || budget.indices > MAX_INDICES) throw new Error("Circuit exterior geometry budget exceeded");
  }

  // CPU-only contact index. Keep source faces once, plus bounded 2 m cell refs.
  // Pit paint shares FLAT with the ribbon. Preserve raised pavement; the query
  // resolves its coincident 15 mm paint overlay without selecting lower roads.
  function* surfaceSteps(road) {
    const cell = 2, triangles = [], cells = Object.create(null);
    let refs = 0, cellCount = 0, maxFaces = 0, work = 0;
    for (let i = 0; i + 2 < road.idx.length; i += 3) {
      if (i % 6144 === 0) yield;
      const ia = road.idx[i], ib = road.idx[i + 1], ic = road.idx[i + 2];
      const mat = road.mat[ia];
      if (mat !== 0 && mat !== 16) continue;
      const a = ia * 3, b = ib * 3, c = ic * 3, p = road.pos;
      const ab = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
      const ac = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
      const n = TrackGeom.cross(ab, ac);
      if (!(n[1] > Math.hypot(...n) * .6)) continue;
      const face = triangles.length / 9;
      triangles.push(p[a], p[a + 1], p[a + 2], p[b], p[b + 1], p[b + 2], p[c], p[c + 1], p[c + 2]);
      const x0 = Math.floor(Math.min(p[a], p[b], p[c]) / cell), x1 = Math.floor(Math.max(p[a], p[b], p[c]) / cell);
      const z0 = Math.floor(Math.min(p[a + 2], p[b + 2], p[c + 2]) / cell), z1 = Math.floor(Math.max(p[a + 2], p[b + 2], p[c + 2]) / cell);
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
        const key = x + "," + z;
        if (!cells[key]) { cells[key] = []; cellCount++; }
        const bucket = cells[key]; bucket.push(face); refs++;
        maxFaces = Math.max(maxFaces, bucket.length);
        if (cellCount > 4096 || refs > 400000 || bucket.length > 256) throw new Error("Circuit exterior surface budget exceeded");
        if (++work % 2048 === 0) yield;
      }
    }
    return { cell, triangles: Float64Array.from(triangles), cells,
      bounds: [-55, 55, GaragePrims.Z_DOOR, 110], refs, maxFaces };
  }
  // Query only one bounded cell without temporary arrays; null means off the owned road.
  function sampleHeight(surface, x, z) {
    if (!surface || !Number.isFinite(x) || !Number.isFinite(z)) return null;
    const bounds = surface.bounds;
    if (z < bounds[2]) return Math.abs(x) <= GaragePrims.HALF_W && z >= GaragePrims.Z_BACK ? 0 : null;
    if (x < bounds[0] || x > bounds[1] || z > bounds[3]) return null;
    const faces = surface.cells[Math.floor(x / surface.cell) + "," + Math.floor(z / surface.cell)];
    if (!faces) return null;
    const p = surface.triangles;
    let height = -Infinity;
    for (let i = 0; i < faces.length; i++) {
      const a = faces[i] * 9, b = a + 3, c = a + 6;
      const den = (p[b + 2] - p[c + 2]) * (p[a] - p[c]) + (p[c] - p[b]) * (p[a + 2] - p[c + 2]);
      if (Math.abs(den) < 1e-12) continue;
      const u = ((p[b + 2] - p[c + 2]) * (x - p[c]) + (p[c] - p[b]) * (z - p[c + 2])) / den;
      const v = ((p[c + 2] - p[a + 2]) * (x - p[c]) + (p[a] - p[c]) * (z - p[c + 2])) / den;
      if (u >= -1e-8 && v >= -1e-8 && u + v <= 1 + 1e-8)
        height = Math.max(height, u * p[a + 1] + v * p[b + 1] + (1 - u - v) * p[c + 1]);
    }
    if (!Number.isFinite(height)) return null;
    // Paint is 15 mm above the ribbon along its near-vertical up vector.
    // Look only in that narrow layer: a lower road 3 cm down must not win.
    let baseHeight = -Infinity;
    for (let i = 0; i < faces.length; i++) {
      const a = faces[i] * 9, b = a + 3, c = a + 6;
      const den = (p[b + 2] - p[c + 2]) * (p[a] - p[c]) + (p[c] - p[b]) * (p[a + 2] - p[c + 2]);
      if (Math.abs(den) < 1e-12) continue;
      const u = ((p[b + 2] - p[c + 2]) * (x - p[c]) + (p[c] - p[b]) * (z - p[c + 2])) / den;
      const v = ((p[c + 2] - p[a + 2]) * (x - p[c]) + (p[a] - p[c]) * (z - p[c + 2])) / den;
      if (u < -1e-8 || v < -1e-8 || u + v > 1 + 1e-8) continue;
      const y = u * p[a + 1] + v * p[b + 1] + (1 - u - v) * p[c + 1];
      if (height - y >= .013 && height - y <= .017) baseHeight = Math.max(baseHeight, y);
    }
    return Number.isFinite(baseHeight) ? baseHeight : height;
  }

  function unsupported(def, reason) {
    return { supported: false, reason, trackId: def && def.id || null,
      road: null, props: null, ground: null, surface: null, anchor: null, stats: { vertices: 0, indices: 0 } };
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
    yield { phase: "road-clipped" };
    const surface = yield* surfaceSteps(road);
    bridge(road, anchor, track.asphaltCol || def.palette && def.palette.asphalt || [.16, .17, .19], budget, surface);
    yield { phase: "surface-indexed" };
    raw = empty();
    const pitStats = SceneryPits.build({ track, out: raw, night: track._night, exteriorOnly: true,
      rawBox: TrackGeom.addBox, rawEmit: TrackGeom.emit, upOf: TrackMesh.upOf,
      bankOffsetAt: TrackMesh.bankOffsetAt, curvature: s => TrackSpline.curvature(track, s) });
    yield { phase: "pit" };
    const props = yield* clipSteps(raw, anchor, limits, budget); raw = null;
    yield { phase: "pit-clipped" };
    const ground = yield* clipSteps(TrackMesh.buildFloor(track), anchor, floorLimits, budget);
    return { supported: true, trackId: def.id, road, props, ground, surface, anchor,
      stats: { vertices: budget.vertices, indices: budget.indices, bounds: limits, groundBounds: floorLimits, night: track._night, surfaceTriangles: surface.triangles.length / 9, surfaceRefs: surface.refs, maxSurfaceFaces: surface.maxFaces, pit: pitStats } };
  }
  return Object.freeze({ buildSteps, sampleHeight });
})();
