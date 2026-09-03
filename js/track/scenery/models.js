/* Apex 26 — atomic and intentional scenery model helpers.
   Pure IIFE global; loaded before tracks.js. */
const TrackModels = (function () {
  "use strict";

  const __M = Math, __isFinite = Number.isFinite, __isInteger = Number.isInteger;

  const isNumList = (a) => Array.isArray(a) || !!(a && a.BYTES_PER_ELEMENT && typeof a.length === "number");
  const finiteArray = (v, length) =>
    Array.isArray(v) && (!length || v.length === length) && v.every(__isFinite);
  const validSize = (v) => finiteArray(v, 3) && v.every((n) => n > 0);
  const emptyBuffer = () => ({ pos: [], nrm: [], col: [], idx: [], mat: [], _mat: 0 });

  // Growable typed accumulators for the props/glass/water fuse (PERF-FINDINGS).
  // Named-arity push — a rest/arguments shim measured slower than Array.push.
  // seal() copies to an exact-length TypedArray so createMesh/toF32 does not
  // upload spare capacity. Stages from emptyBuffer() stay plain arrays.
  function makeAccum(Type, est) {
    let data = new Type(est > 0 ? est : 256);
    let n = 0;
    function grow(need) {
      if (n + need <= data.length) return;
      let cap = data.length || 256;
      while (cap < n + need) cap *= 2;
      const next = new Type(cap);
      next.set(data.subarray(0, n));
      data = next;
    }
    return {
      get length() { return n; },
      get _data() { return data; },
      push(a, b, c, d, e, f) {
        const add = f !== undefined ? 6 : e !== undefined ? 5 : d !== undefined ? 4
                  : c !== undefined ? 3 : b !== undefined ? 2 : 1;
        grow(add);
        data[n++] = a;
        if (add > 1) data[n++] = b;
        if (add > 2) data[n++] = c;
        if (add > 3) data[n++] = d;
        if (add > 4) data[n++] = e;
        if (add > 5) data[n++] = f;
      },
      seal() { return n === data.length ? data : data.slice(0, n); },
    };
  }
  function scratch(verts) {
    const v = verts > 0 ? verts : 8192;
    // Float64 ON PURPOSE (an f32 conversion was tried 2026-08-21 and reverted):
    // graph-parity holds the fused soup and the instanced canonical bake equal
    // to 1e-6 m, and the canonical path accumulates in plain-array f64 — f32
    // here put every circuit ~6e-5 m (f32 epsilon at world scale) off parity.
    // Halving the accumulator footprint needs BOTH paths converted together.
    return {
      pos: makeAccum(Float64Array, v * 3),
      nrm: makeAccum(Float64Array, v * 3),
      col: makeAccum(Float64Array, v * 3),
      mat: makeAccum(Float64Array, v),
      idx: makeAccum(Uint32Array, v * 3),
      _mat: 0,
    };
  }
  function sealGeometry(geo) {
    if (!geo) return geo;
    if (geo.pos && typeof geo.pos.seal === "function") geo.pos = geo.pos.seal();
    if (geo.nrm && typeof geo.nrm.seal === "function") geo.nrm = geo.nrm.seal();
    if (geo.col && typeof geo.col.seal === "function") geo.col = geo.col.seal();
    if (geo.mat && typeof geo.mat.seal === "function") geo.mat = geo.mat.seal();
    if (geo.idx && typeof geo.idx.seal === "function") geo.idx = geo.idx.seal();
    return geo;
  }

  function appendBuffer(target, source, id) {
    const base = target.pos.length / 3;
    (target.__blocks || (target.__blocks = []))
      .push({ base, from: source, count: source.pos.length / 3, id: id || null });
    appendAll(target.pos, source.pos);
    appendAll(target.nrm, source.nrm);
    appendAll(target.col, source.col);
    if (target.mat && source.mat) appendAll(target.mat, source.mat);
    for (const i of source.idx) target.idx.push(base + i);
  }

  function appendAll(target, source) {
    for (let i = 0; i < source.length; i++) target.push(source[i]);
  }

  // How far the emitted geometry escapes the box the group DECLARED, per axis,
  // measured in that box's own basis. Null when everything fits.
  //
  // Hand-rolled dot products and an indexed loop for the same reason the
  // occupancy scans below are written that way: this runs over every vertex of
  // every model group on every build, including day<->night rebuilds.
  function boundsEscape(stage, bounds) {
    const c = bounds.center, sz = bounds.size, b = bounds.basis;
    if (!c || !sz) return null;
    const r = b ? b[0] : [1, 0, 0], u = b ? b[1] : [0, 1, 0], f = b ? b[2] : [0, 0, 1];
    const hr = sz[0] / 2, hu = sz[1] / 2, hf = sz[2] / 2;
    const p = stage.pos;
    let or_ = 0, ou = 0, of = 0;
    for (let i = 0; i < p.length; i += 3) {
      const dx = p[i] - c[0], dy = p[i + 1] - c[1], dz = p[i + 2] - c[2];
      const er = __M.abs(dx * r[0] + dy * r[1] + dz * r[2]) - hr;
      const eu = __M.abs(dx * u[0] + dy * u[1] + dz * u[2]) - hu;
      const ef = __M.abs(dx * f[0] + dy * f[1] + dz * f[2]) - hf;
      if (er > or_) or_ = er;
      if (eu > ou) ou = eu;
      if (ef > of) of = ef;
    }
    const TOL = 0.05;
    if (or_ <= TOL && ou <= TOL && of <= TOL) return null;
    return { overRight: +or_.toFixed(2), overUp: +ou.toFixed(2), overFwd: +of.toFixed(2) };
  }

  // Hand-rolled loops rather than Array.prototype.some(fn). These run over the
  // WHOLE props buffer of every built track — up to ~5 M vertices on Vegas, i.e.
  // ~15 M floats each for pos/nrm/col plus ~20 M indices, as plain (not typed)
  // arrays — and they run again on every day↔night rebuild. Through a callback
  // that is tens of millions of non-inlinable calls per track load; inline, the
  // same work is a predictable read-and-compare the JIT keeps in registers.
  // Behaviour is identical, including which reason wins.
  // Hoisted out of the loop below. `Infinity` is a GLOBAL, and under
  // vm.createContext — which tools/track/verify-track.cjs, tools/track/graph-parity.cjs and
  // the VM-based unit suites all use — every bare global read goes through the
  // contextified global's C++ interceptor. At 27 M elements x 2 lookups that is
  // ~54 M interceptor calls: validateGeometry measured 10.4 s of a 13.9 s Vegas
  // build in the VM (75 %), against 13 ms for the identical scan from host
  // scope. Hoisting took Vegas 14.7 s -> 5.7 s and Monza 5.2 s -> 2.7 s.
  //
  // In a browser this is a constant and costs nothing, so it is a dev-loop fix,
  // not a player-facing one — and it is a caution about the comment above:
  // this loop was hand-rolled FOR speed and then measured in the one
  // environment that made the globals expensive, so the callback took the
  // blame for what two property loads were doing. 1/0 === Infinity, so the
  // comparison is unchanged.
  const POSINF = 1 / 0, NEGINF = -1 / 0;

  function emittedBox(stage, bounds) {
    const b = bounds && bounds.basis;
    const r = b ? b[0] : [1, 0, 0], u = b ? b[1] : [0, 1, 0], f = b ? b[2] : [0, 0, 1];
    const p = stage.pos;
    let minR = POSINF, maxR = NEGINF, minU = POSINF, maxU = NEGINF, minF = POSINF, maxF = NEGINF;
    for (let i = 0; i < p.length; i += 3) {
      const pr = p[i] * r[0] + p[i + 1] * r[1] + p[i + 2] * r[2];
      const pu = p[i] * u[0] + p[i + 1] * u[1] + p[i + 2] * u[2];
      const pf = p[i] * f[0] + p[i + 1] * f[1] + p[i + 2] * f[2];
      if (pr < minR) minR = pr; if (pr > maxR) maxR = pr;
      if (pu < minU) minU = pu; if (pu > maxU) maxU = pu;
      if (pf < minF) minF = pf; if (pf > maxF) maxF = pf;
    }
    if (!(maxR > minR) || !(maxU > minU) || !(maxF > minF)) return null;
    const midR = (minR + maxR) / 2, midU = (minU + maxU) / 2, midF = (minF + maxF) / 2;
    return {
      center: [
        r[0] * midR + u[0] * midU + f[0] * midF,
        r[1] * midR + u[1] * midU + f[1] * midF,
        r[2] * midR + u[2] * midU + f[2] * midF,
      ],
      size: [maxR - minR, maxU - minU, maxF - minF],
      basis: b || [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    };
  }

  function firstNonFinite(a) {
    for (let i = 0; i < a.length; i++) {
      const v = a[i];
      if (!(v > NEGINF && v < POSINF)) return true;
    }
    return false;
  }

  function validateGeometry(geo) {
    if (!geo || !isNumList(geo.pos) || geo.pos.length % 3)
      return { ok: false, reason: "invalid position layout" };
    if (firstNonFinite(geo.pos))
      return { ok: false, reason: "non-finite position" };
    if (geo.nrm && (geo.nrm.length !== geo.pos.length || firstNonFinite(geo.nrm)))
      return { ok: false, reason: "invalid or non-finite normal" };
    if (geo.col && (geo.col.length !== geo.pos.length || firstNonFinite(geo.col)))
      return { ok: false, reason: "invalid or non-finite color" };
    const count = geo.pos.length / 3;
    if (!isNumList(geo.idx)) return { ok: false, reason: "invalid index" };
    for (let i = 0; i < geo.idx.length; i++) {
      const v = geo.idx[i];
      if (!__isInteger(v) || v < 0 || v >= count)
        return { ok: false, reason: "invalid index" };
    }
    return { ok: true, vertices: count, indices: geo.idx.length };
  }

  function create(ctx) {
    Log.info("track", "models create");
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
        if (result === false || !stage.pos.length || stage.pos.some((v) => !__isFinite(v)) ||
            stage.nrm.some((v) => !__isFinite(v)) ||
            stage.idx.some((v) => !__isInteger(v) || v < 0 || v >= stage.pos.length / 3)) {
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
      // THE DECLARED BOUNDS ARE A PROMISE, AND NOTHING CHECKED IT.
      // preflight() above tested `bounds` — the box the author DECLARED — and
      // never looked again, so a group may pass the footprint guard and then
      // emit its primitives somewhere else entirely. Measured on
      // `cota-amphitheater`: it declares its centre 8 m off the anchor
      // (`vadd(vadd(a.c, a.r, 8), a.u, 13)`) and emits its stage deck AT the
      // anchor, so ~55 x 28 m of geometry lands where the tested box never was
      // — 4.79 m over the racing line, with the guard reporting success. That
      // is what tests/specs/props-over-road.spec.js has been failing on for
      // COTA and Indianapolis.
      //
      // Declared-box mismatch is still reported (vertical apron slack is
      // common and harmless). The ROAD test now runs on the emitted box:
      // COTA's amphitheater declared 8 m further out than it built, passed
      // preflight, and put 4.79 m of stage over the racing line. Lateral-only
      // — rejBox is an XZ footprint, so a taller-than-declared apron does not
      // fail 40 circuits.
      const escaped = boundsEscape(stage, bounds);
      if (escaped) {
        (diagnostics.escaped || (diagnostics.escaped = []))
          .push(Object.assign({ id, required, kind, vertices }, escaped));
      }
      const actual = emittedBox(stage, bounds);
      if (actual && !preflight(Object.assign({ id }, actual))) {
        diagnostics.suppressed.push({ id, required, reason: "emitted footprint rejected" });
        return false;
      }
      appendBuffer(out, stage, id);
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
      const offset = Number.isFinite(spec.offset) ? spec.offset : 0;
      const lift = clearance + thickness / 2;
      const center = [
        frame.c[0] + frame.r[0] * offset + frame.u[0] * lift,
        frame.c[1] + frame.r[1] * offset + frame.u[1] * lift,
        frame.c[2] + frame.r[2] * offset + frame.u[2] * lift,
      ];
      const stage = emptyBuffer();
      if (!box(stage, center, [span, thickness, depth], spec.color, [frame.r, frame.u, frame.t])) return false;
      if (spec.supports !== false && ctx.groundHeight && ctx.groundPoint) {
        const sw = (spec.supportWidth != null ? spec.supportWidth : 0.8) * 0.9;
        const lat = supportGap + sw / 2 + 0.12;
        const under = clearance;           // deck underside above the road datum
        for (const side of [-1, 1]) {
          const foot = ctx.groundPoint(frame.k, side, lat, ctx.groundHeight(frame.k, lat));
          if (!finiteArray(foot, 3)) continue;
          // Base-anchored box would be wrong here: box() centres its `c`. Span
          // foot -> deck underside, with 0.3 m of embed at the bottom and a
          // 0.2 m overlap into the deck so the support chain never sees a seam.
          const top = frame.c[1] + under;
          const h = top - foot[1] + 0.5;
          if (!(h > 0.5)) continue;
          box(stage, [foot[0], foot[1] - 0.3 + h / 2, foot[2]],
              [sw, h, spec.depth != null ? spec.depth : 1.4],
              spec.supportColor || spec.color, [frame.r, frame.u, frame.t]);
        }
      }
      appendBuffer(out, stage, id);
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
      appendBuffer(water, stage, id);
      diagnostics.emitted.push({ id, required: !!spec.required, vertices: stage.pos.length / 3, water: true });
      return true;
    }

    function groundPatch(spec) {
      spec = spec || {};
      if (!validSize(spec.size) || !ctx.groundHeight) return false;
      const samples = Math.max(2, Math.round(spec.samples || 4));
      const depth = spec.size[0] / samples;
      const posBefore = out.pos.length;
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
      diagnostics.emitted.push({ id: spec.id || "ground-patch", vertices: (out.pos.length - posBefore) / 3, groundPatch: true });
      return true;
    }

    function groundedSegments(spec) {
      spec = spec || {};
      if (!Array.isArray(spec.points) || spec.points.length < 2 || !ctx.groundHeight) return false;
      const posBefore = out.pos.length;
      const height = spec.height || 1;
      const width = spec.width || 0.25;
      const ground = (k, side, dist) => {
        const y = ctx.groundHeight(k, dist || 0);
        if (!Number.isFinite(y)) return null;
        return ctx.groundPoint ? ctx.groundPoint(k, side || 1, dist || 0, y) : [(dist || 0), y, k];
      };
      // Densify the caller's polyline before extruding. The caller's points can
      // be 50-100 m apart in s; a single straight box between two of them chords
      // ACROSS the track's curvature, so on a bend the terrain-tilted slab bows
      // OVER the racing line (monza banking, catalunya La Caixa, istanbul T8
      // revetment all read 1.9-4.4 m over the tarmac from exactly this). k is a
      // node index and groundPoint(k,...) rounds it, so interpolating k between
      // two caller points and re-grounding at each intermediate node walks the
      // real track arc. A ~10 m sub-chord keeps the arc-vs-chord bow under the
      // 0.2 m props-over-road tolerance on a typical corner radius.
      // One box between two grounded points, extruded up from grade.
      const emitBox = (pa, pb) => {
        const dx = pb[0] - pa[0], dy = pb[1] - pa[1], dz = pb[2] - pa[2];
        const length = Math.hypot(dx, dy, dz) || 0.1;
        const forward = [dx / length, dy / length, dz / length];
        let right = [forward[2], 0, -forward[0]];
        const rl = Math.hypot(right[0], right[2]) || 1;
        right = [right[0] / rl, 0, right[2] / rl];
        const up = [
          forward[1] * right[2] - forward[2] * right[1],
          forward[2] * right[0] - forward[0] * right[2],
          forward[0] * right[1] - forward[1] * right[0],
        ];
        const center = [
          (pa[0] + pb[0]) / 2 + up[0] * height / 2,
          (pa[1] + pb[1]) / 2 + up[1] * height / 2,
          (pa[2] + pb[2]) / 2 + up[2] * height / 2,
        ];
        return box(out, center, [width, height, length], spec.color,
          spec.basis || [right, up, forward]);
      };
      // Extrude EACH caller pair independently — never a single global polyline.
      // A widely-spaced pair (50-100 m in s) chords across the track's curvature,
      // so the terrain-tilted slab bows OVER the racing line (monza banking,
      // catalunya La Caixa, istanbul T8 revetment read 1.9-4.4 m over the tarmac
      // from exactly this). k is a node index groundPoint() rounds, so
      // interpolating k between the pair's endpoints and re-grounding at each
      // intermediate node walks the real arc; ~10 m sub-chords keep the bow under
      // the 0.2 m props-over-road tolerance. Per-PAIR is load-bearing: a global
      // polyline bridged across any pair that grounded to null — e.g. a wall that
      // wraps the start line — drawing one box the full width of the circuit
      // (hungaroring's pit trim read 5 m over the racing line 1 km away).
      const TARGET = 10, MAXSUB = 16;
      let emitted = 0;
      for (let i = 0; i < spec.points.length - 1; i++) {
        const a = spec.points[i], b = spec.points[i + 1];
        const pa = ground(a.k, a.side, a.dist), pb = ground(b.k, b.side, b.dist);
        if (!pa || !pb) continue;
        const chord = Math.hypot(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]) || 0.1;
        const sub = Math.max(1, Math.min(MAXSUB, Math.ceil(chord / TARGET)));
        let dk = b.k - a.k;
        if (ctx.n && Math.abs(dk) > ctx.n / 2) dk -= Math.sign(dk) * ctx.n;
        let prev = pa;
        for (let j = 1; j <= sub; j++) {
          const t = j / sub;
          const p = j === sub ? pb : (ground(
            a.k + dk * t,
            t < 0.5 ? (a.side || 1) : (b.side || 1),
            (a.dist || 0) + ((b.dist || 0) - (a.dist || 0)) * t,
          ) || pb);
          if (emitBox(prev, p)) emitted++;
          prev = p;
        }
      }
      if (!emitted) return false;
      // Real vertex count (buffer delta) — see groundPatch above.
      diagnostics.emitted.push({ id: spec.id || "grounded-segments", vertices: (out.pos.length - posBefore) / 3, groundedSegments: true });
      return true;
    }

    return {
      diagnostics, box, modelGroup, overheadSpan, waterSurface,
      groundPatch, groundedSegments,
    };
  }

  return { create, validateGeometry, scratch, sealGeometry };
})();
