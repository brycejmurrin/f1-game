/* Apex 26 — atomic and intentional scenery model helpers.
   Pure IIFE global; loaded before tracks.js. */
const TrackModels = (function () {
  "use strict";

  const finiteArray = (v, length) =>
    Array.isArray(v) && (!length || v.length === length) && v.every(Number.isFinite);
  const validSize = (v) => finiteArray(v, 3) && v.every((n) => n > 0);
  const emptyBuffer = () => ({ pos: [], nrm: [], col: [], idx: [], mat: [], _mat: 0 });

  function appendBuffer(target, source) {
    const base = target.pos.length / 3;
    // Record where this staged block landed in the target. modelGroup emits
    // into a scratch buffer and copies it out, so a primitive recorded against
    // the STAGE carries vertex indices that mean nothing in the shipped mesh —
    // headless audits (float/clip) could not attribute any modelGroup geometry
    // at all and silently skipped it. One entry per copy is enough to remap.
    (target.__blocks || (target.__blocks = []))
      .push({ base, from: source, count: source.pos.length / 3 });
    target.pos.push(...source.pos);
    target.nrm.push(...source.nrm);
    target.col.push(...source.col);
    if (target.mat && source.mat) target.mat.push(...source.mat);
    for (const i of source.idx) target.idx.push(base + i);
  }

  function validateGeometry(geo) {
    if (!geo || !Array.isArray(geo.pos) || geo.pos.length % 3)
      return { ok: false, reason: "invalid position layout" };
    if (geo.pos.some((v) => !Number.isFinite(v)))
      return { ok: false, reason: "non-finite position" };
    if (geo.nrm && (geo.nrm.length !== geo.pos.length || geo.nrm.some((v) => !Number.isFinite(v))))
      return { ok: false, reason: "invalid or non-finite normal" };
    if (geo.col && (geo.col.length !== geo.pos.length || geo.col.some((v) => !Number.isFinite(v))))
      return { ok: false, reason: "invalid or non-finite color" };
    const count = geo.pos.length / 3;
    if (!Array.isArray(geo.idx) || geo.idx.some((i) => !Number.isInteger(i) || i < 0 || i >= count))
      return { ok: false, reason: "invalid index" };
    return { ok: true, vertices: count, indices: geo.idx.length };
  }

  function create(ctx) {
    ctx = ctx || {};
    const out = ctx.out || emptyBuffer();
    const water = ctx.water || emptyBuffer();
    const diagnostics = ctx.diagnostics || {
      emitted: [], suppressed: [], invalid: [], unsafe: [],
    };
    const emitBox = ctx.emitBox || (() => false);
    const preflight = ctx.preflight || (() => true);

    const box = (buffer, center, size, color, basis) => {
      if (!finiteArray(center, 3) || !validSize(size)) return false;
      emitBox(buffer, center, size, color || [1, 1, 1], basis);
      return true;
    };

    function modelGroup(id, bounds, emit, options) {
      const required = !!(options && options.required);
      const kind = options && options.kind || "model";
      if (!id || !bounds || !finiteArray(bounds.center, 3) || !validSize(bounds.size)) {
        diagnostics.invalid.push({ id: id || "(unnamed)", required, reason: "invalid bounds" });
        return false;
      }
      if (!preflight(Object.assign({ id }, bounds))) {
        diagnostics.suppressed.push({ id, required, reason: "footprint rejected" });
        return false;
      }
      const stage = emptyBuffer();
      try {
        const result = emit(stage);
        if (result === false || !stage.pos.length || stage.pos.some((v) => !Number.isFinite(v)) ||
            stage.nrm.some((v) => !Number.isFinite(v)) ||
            stage.idx.some((v) => !Number.isInteger(v) || v < 0 || v >= stage.pos.length / 3)) {
          diagnostics.invalid.push({ id, required, reason: "invalid or empty emission" });
          return false;
        }
      } catch (error) {
        diagnostics.invalid.push({ id, required, reason: error && error.message || String(error) });
        return false;
      }
      const vertices = stage.pos.length / 3;
      if (options && Object.prototype.hasOwnProperty.call(options, "maxVertices")) {
        const maximum = options.maxVertices;
        if (typeof maximum !== "number" || !Number.isFinite(maximum) || maximum < 0) {
          diagnostics.invalid.push({
            id, required, reason: "invalid vertex budget", maximum, kind,
          });
          return false;
        }
        if (vertices > maximum) {
          diagnostics.invalid.push({
            id, required, reason: "vertex budget exceeded", vertices, maximum, kind,
          });
          return false;
        }
      }
      appendBuffer(out, stage);
      diagnostics.emitted.push({ id, required, vertices, kind });
      return true;
    }

    function overheadSpan(spec) {
      spec = spec || {};
      const id = spec.id || "overhead";
      const clearance = Number(spec.clearance);
      const minimum = spec.minimumClearance != null ? Number(spec.minimumClearance) : 4.8;
      if (!Number.isFinite(clearance) || clearance < minimum) {
        diagnostics.unsafe.push({ id, required: !!spec.required, clearance, minimum });
        return false;
      }
      const frame = ctx.frameAt ? ctx.frameAt(spec.frac || 0) : null;
      if (!frame || !finiteArray(frame.c, 3) || !finiteArray(frame.r, 3) ||
          !finiteArray(frame.u, 3) || !finiteArray(frame.t, 3) || !Number.isFinite(frame.hw))
        return false;
      if (ctx.supportClear && !ctx.supportClear(frame, spec)) {
        diagnostics.unsafe.push({ id, required: !!spec.required, reason: "support footprint rejected" });
        return false;
      }
      const thickness = spec.thickness != null ? spec.thickness : 0.9;
      const depth = spec.depth != null ? spec.depth : 1.4;
      const supportGap = spec.supportGap != null ? spec.supportGap : 1.5;
      const span = spec.span != null ? spec.span : frame.hw * 2 + supportGap * 2 + 2;
      // LATERAL OFFSET: shift the band sideways along the track's right vector.
      // A single centred slab can only ever be a flat lid — an ARCHED soffit
      // (a tunnel vault, a stepped portal) needs bands that sit beside the
      // crown and leave the middle open, which a centred span cannot express.
      // `clearance` still means "underside height above the ROAD DATUM at this
      // node", so it is the offset band's own clearance, not a clearance over
      // the centreline; on banked road the two differ by sin(bank)·offset,
      // which is sub-decimetre at the ≤3° a street circuit carries.
      const offset = Number.isFinite(spec.offset) ? spec.offset : 0;
      const lift = clearance + thickness / 2;
      const center = [
        frame.c[0] + frame.r[0] * offset + frame.u[0] * lift,
        frame.c[1] + frame.r[1] * offset + frame.u[1] * lift,
        frame.c[2] + frame.r[2] * offset + frame.u[2] * lift,
      ];
      // Intentional overhead geometry bypasses ordinary road-footprint rejection;
      // its safety contract is explicit underside clearance.
      const stage = emptyBuffer();
      if (!box(stage, center, [span, thickness, depth], spec.color, [frame.r, frame.u, frame.t])) return false;
      appendBuffer(out, stage);
      diagnostics.emitted.push({ id, required: !!spec.required, vertices: stage.pos.length / 3, overhead: true, clearance });
      return true;
    }

    function waterSurface(spec) {
      spec = spec || {};
      const id = spec.id || "water";
      if (!finiteArray(spec.center, 3) || !validSize(spec.size)) {
        diagnostics.invalid.push({ id, required: !!spec.required, reason: "invalid water dimensions" });
        return false;
      }
      const stage = emptyBuffer();
      if (!box(stage, spec.center, spec.size, spec.color || [0.12, 0.34, 0.48], spec.basis)) return false;
      appendBuffer(water, stage);
      diagnostics.emitted.push({ id, required: !!spec.required, vertices: stage.pos.length / 3, water: true });
      return true;
    }

    function groundPatch(spec) {
      spec = spec || {};
      if (!validSize(spec.size) || !ctx.groundHeight) return false;
      const samples = Math.max(2, Math.round(spec.samples || 4));
      const depth = spec.size[0] / samples;
      let emitted = 0;
      for (let i = 0; i < samples; i++) {
        const dist = (spec.gap || 0) + depth * (i + 0.5);
        const y = ctx.groundHeight(spec.k || 0, dist);
        if (!Number.isFinite(y)) continue;
        const center = [dist * (spec.side || 1), y - spec.size[1] / 2, 0];
        if (box(out, center, [depth, spec.size[1], spec.size[2]], spec.color, spec.basis)) emitted++;
      }
      if (!emitted) {
        diagnostics.invalid.push({ id: spec.id || "ground-patch", reason: "no finite ground samples" });
        return false;
      }
      diagnostics.emitted.push({ id: spec.id || "ground-patch", vertices: emitted, groundPatch: true });
      return true;
    }

    function groundedSegments(spec) {
      spec = spec || {};
      if (!Array.isArray(spec.points) || spec.points.length < 2 || !ctx.groundHeight) return false;
      let emitted = 0;
      for (let i = 0; i < spec.points.length - 1; i++) {
        const a = spec.points[i], b = spec.points[i + 1];
        const ay = ctx.groundHeight(a.k, a.dist || 0);
        const by = ctx.groundHeight(b.k, b.dist || 0);
        if (!Number.isFinite(ay) || !Number.isFinite(by)) continue;
        const pa = ctx.groundPoint
          ? ctx.groundPoint(a.k, a.side || 1, a.dist || 0, ay)
          : [(a.dist || 0), ay, a.k];
        const pb = ctx.groundPoint
          ? ctx.groundPoint(b.k, b.side || 1, b.dist || 0, by)
          : [(b.dist || 0), by, b.k];
        const dx = pb[0] - pa[0], dy = pb[1] - pa[1], dz = pb[2] - pa[2];
        const length = Math.hypot(dx, dy, dz) || 0.1;
        const forward = [dx / length, dy / length, dz / length];
        let right = [-forward[2], 0, forward[0]];
        const rl = Math.hypot(right[0], right[2]) || 1;
        right = [right[0] / rl, 0, right[2] / rl];
        const up = [
          forward[1] * right[2] - forward[2] * right[1],
          forward[2] * right[0] - forward[0] * right[2],
          forward[0] * right[1] - forward[1] * right[0],
        ];
        const height = spec.height || 1;
        const center = [
          (pa[0] + pb[0]) / 2 + up[0] * height / 2,
          (pa[1] + pb[1]) / 2 + up[1] * height / 2,
          (pa[2] + pb[2]) / 2 + up[2] * height / 2,
        ];
        if (box(out, center, [spec.width || 0.25, height, length], spec.color,
          spec.basis || [right, up, forward])) emitted++;
      }
      if (!emitted) return false;
      diagnostics.emitted.push({ id: spec.id || "grounded-segments", vertices: emitted, groundedSegments: true });
      return true;
    }

    return {
      diagnostics, box, modelGroup, overheadSpan, waterSurface,
      groundPatch, groundedSegments,
    };
  }

  return { create, validateGeometry };
})();
