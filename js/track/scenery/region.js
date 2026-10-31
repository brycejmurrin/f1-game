/* Optional bounded CPU scenery emission. World coordinates only; canonical graph bakes bypass it. */
const TrackSceneryRegion = (function () {
  "use strict";
  function create(options, buffers, sourceRaw) {
    if (!options || typeof options.intersects !== "function" ||
        !Number.isInteger(options.maxVertices) || options.maxVertices <= 0 ||
        !Number.isInteger(options.maxIndices) || options.maxIndices <= 0)
      throw new Error("Invalid scenery region");
    let failure = null, wholeDepth = 0, checks = 0, accepted = 0, rejected = 0, peakVertices = 0, peakIndices = 0;
    const check = (extra) => {
      if (failure) throw failure;
      let vertices = 0, indices = 0;
      for (const buf of buffers) { vertices += buf.pos.length / 3; indices += buf.idx.length; }
      if (extra && !buffers.includes(extra)) { vertices += extra.pos.length / 3; indices += extra.idx.length; }
      peakVertices = Math.max(peakVertices, vertices); peakIndices = Math.max(peakIndices, indices);
      if (vertices > options.maxVertices || indices > options.maxIndices) {
        failure = new Error("Scenery region geometry budget exceeded"); throw failure;
      }
      return { vertices, indices };
    };
    const sphere = (center, radius) => {
      checks++;
      const kept = wholeDepth > 0 || options.intersects(center, radius);
      if (kept) accepted++; else rejected++;
      return kept;
    };
    const basisLength = (basis, i) => basis ? Math.hypot(...basis[i]) : 1;
    // Full dimensions intentionally bound both centred boxes and base-anchored
    // prisms/pyramids. Keep an intersecting object whole; final clipping owns the doorway.
    const box = (center, size, basis) => sphere(center,
      Math.abs(size[0]) * basisLength(basis, 0) + Math.abs(size[1]) * basisLength(basis, 1) + Math.abs(size[2]) * basisLength(basis, 2));
    const radial = (center, radius, height, basis) => sphere(center,
      Math.abs(radius) * (basisLength(basis, 0) + basisLength(basis, 2)) + Math.abs(height) * basisLength(basis, 1));
    const whole = (bounds, callback) => {
      if (!bounds || !Array.isArray(bounds.center) || !Array.isArray(bounds.size)) return callback();
      if (!box(bounds.center, bounds.size, bounds.basis)) return false;
      wholeDepth++;
      try { return callback(); } finally { wholeDepth--; }
    };
    const modelBounds = new WeakMap();
    // Read the recorded primitive recipes, not model.aabb: that getter bakes
    // and retains a canonical mesh outside this region's vertex budget.
    const boundsOf = (model) => {
      if (modelBounds.has(model)) return modelBounds.get(model);
      const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      for (const op of model.ops || []) {
        let lo, hi;
        if (op.op === "box" || op.op === "prism" || op.op === "pyramid") {
          if (!op.sz || !op.sz.every(v => Number.isFinite(v) && v > 0)) continue;
          const half = op.sz.map(v => v / 2);
          lo = [-half[0], op.op === "box" ? -half[1] : 0, -half[2]];
          hi = [half[0], op.op === "box" ? half[1] : op.sz[1], half[2]];
        } else if (op.op === "cyl" || op.op === "cone" || op.op === "frustum") {
          const radius = op.op === "frustum" ? Math.max(op.rB, op.rT) : op.rad;
          if (!(Number.isFinite(radius) && radius > 0 && Number.isFinite(op.h) && op.h > 0)) continue;
          lo = [-radius, 0, -radius]; hi = [radius, op.h, radius];
        } else continue;
        if (!op.c || !op.c.every(Number.isFinite)) continue;
        for (let axis = 0; axis < 3; axis++) {
          mn[axis] = Math.min(mn[axis], op.c[axis] + lo[axis]);
          mx[axis] = Math.max(mx[axis], op.c[axis] + hi[axis]);
        }
      }
      const bounds = mn[0] <= mx[0] ? { mn, mx } : null;
      modelBounds.set(model, bounds); return bounds;
    };
    const instance = (graph, key, place, build, callback) => {
      if (!place || !Array.isArray(place.o) || !Array.isArray(place.r) || !Array.isArray(place.u) || !Array.isArray(place.t)) return callback();
      const bounds = boundsOf(graph.model(key, build)), scale = place.s || [1, 1, 1];
      if (!bounds) return callback();
      const center = place.o.slice(), size = [];
      const basis = [place.r, place.u, place.t];
      for (let i = 0; i < 3; i++) {
        const mid = (bounds.mn[i] + bounds.mx[i]) / 2 * scale[i];
        size.push((bounds.mx[i] - bounds.mn[i]) * Math.abs(scale[i]));
        for (let axis = 0; axis < 3; axis++) center[axis] += basis[i][axis] * mid;
      }
      return whole({ center, size, basis }, callback);
    };
    const mountain = (center, radius, height, opts) => {
      const o = opts || {}, rough = Math.abs(o.rough == null ? .34 : o.rough);
      const stretch = o.stretch > 0 ? o.stretch : 1, crest = Math.max(0, Math.min(1, o.crest || 0));
      const reach = Math.abs(radius) * (1 + .7 * rough) * (1 + .35 * rough) * (1 + .8 * crest);
      return sphere(center, reach * (Math.hypot(...(o.right || [1, 0, 0])) + stretch * Math.hypot(...(o.fwd || [0, 0, 1]))) + Math.abs(height) * (1.2 + rough));
    };
    const run = (target, admitted, fn, args) => {
      check(target);
      if (!admitted) return false;
      if (target && (target._dryRun || target._absorbOnly)) return true;
      const result = fn(target, ...args); check(target);
      return result !== false;
    };
    const raw = Object.assign({}, sourceRaw);
    for (const key of ["addBox", "addPrism", "addPyramid"])
      raw[key] = (target, c, size, col, basis) => run(target, box(c, size, basis), sourceRaw[key], [c, size, col, basis]);
    for (const key of ["addCyl", "addCone"])
      raw[key] = (target, c, radius, height, col, segments, basis) => run(target, radial(c, radius, height, basis), sourceRaw[key], [c, radius, height, col, segments, basis]);
    raw.addFrustum = (target, c, lower, upper, height, col, segments, basis) => run(target,
      radial(c, Math.max(lower, upper), height, basis), sourceRaw.addFrustum, [c, lower, upper, height, col, segments, basis]);
    raw.addMountain = (target, c, radius, height, opts) => run(target, mountain(c, radius, height, opts), sourceRaw.addMountain, [c, radius, height, opts]);
    const emit = (target, verts, col, ref) => {
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
      for (const v of verts) {
        x0 = Math.min(x0, v[0]); x1 = Math.max(x1, v[0]);
        y0 = Math.min(y0, v[1]); y1 = Math.max(y1, v[1]);
        z0 = Math.min(z0, v[2]); z1 = Math.max(z1, v[2]);
      }
      return run(target, sphere([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2), TrackGeom.emit, [verts, col, ref]);
    };
    const meshBounds = new WeakMap();
    const addMesh = (target, mesh, opts) => {
      if (!mesh || !mesh.pos || !mesh.idx || !mesh.pos.length) return false;
      let b = meshBounds.get(mesh);
      if (!b) {
        let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
        for (let i = 0; i < mesh.pos.length; i += 3) {
          x0 = Math.min(x0, mesh.pos[i]); x1 = Math.max(x1, mesh.pos[i]);
          y0 = Math.min(y0, mesh.pos[i + 1]); y1 = Math.max(y1, mesh.pos[i + 1]);
          z0 = Math.min(z0, mesh.pos[i + 2]); z1 = Math.max(z1, mesh.pos[i + 2]);
        }
        b = { center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], radius: Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 }; meshBounds.set(mesh, b);
      }
      const o = opts || {}, scale = o.scale == null ? 1 : o.scale, c = Math.cos(o.rotY || 0), s = Math.sin(o.rotY || 0);
      const p = b.center, center = [(o.x || 0) + scale * (p[0] * c + p[2] * s), (o.y || 0) + scale * p[1], (o.z || 0) + scale * (-p[0] * s + p[2] * c)];
      if (!sphere(center, b.radius * Math.abs(scale))) return false;
      const usage = check(target);
      if (usage.vertices + mesh.pos.length / 3 > options.maxVertices || usage.indices + mesh.idx.length > options.maxIndices) {
        failure = new Error("Scenery region geometry budget exceeded"); throw failure;
      }
      return run(target, true, TrackGeom.addMesh, [mesh, opts]);
    };
    return { raw, emit, addMesh, box, radial, mountain, whole, instance, check,
      stats: () => ({ checks, accepted, rejected, peakVertices, peakIndices, maxVertices: options.maxVertices, maxIndices: options.maxIndices }) };
  }
  return Object.freeze({ create });
})();
