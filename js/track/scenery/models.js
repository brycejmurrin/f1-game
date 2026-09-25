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
      // preflight answers true (clear), false (on the road) or "pit": inside
      // the pit complex the engine now builds. A model the complex supersedes
      // is recorded as such and never counts as a required failure — the
      // circuit's hand-placed pit block is exactly what the complex replaces.
      const verdict = preflight(Object.assign({ id }, bounds));
      if (verdict !== true) {
        const pit = verdict === "pit";
        diagnostics.suppressed.push({ id, required: pit ? false : required, reason: pit ? "superseded by the pit complex" : "footprint rejected" });
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
      const emitted = actual ? preflight(Object.assign({ id }, actual)) : true;
      if (emitted !== true) {
        const pit = emitted === "pit";
        diagnostics.suppressed.push({ id, required: pit ? false : required, reason: pit ? "emitted footprint superseded by the pit complex" : "emitted footprint rejected" });
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
      // soffit: a dark plate under the deck (tunnel shade). `clearance` stays
      // truthful: the PLATE's bottom sits at it, the deck is raised by `inset`,
      // and the plate is thicker than the inset so its top is buried in the
      // deck. Span/depth are scaled < 1 so the plate's end faces never meet
      // the deck's — two hand-rolled spans at one frac used to share planes.
      const soffitSpec = spec.soffit || (spec.soffitColor ? { color: spec.soffitColor } : null);
      let soffit = null;
      if (soffitSpec) {
        const o = typeof soffitSpec === "object" ? soffitSpec : {};
        let inset = o.inset != null ? Number(o.inset) : 0.05;
        let plate = o.thickness != null ? Number(o.thickness) : 0.2;
        const spanScale = o.spanScale != null ? Number(o.spanScale) : 0.97;
        const depthScale = o.depthScale != null ? Number(o.depthScale) : 0.94;
        // Clamp (never refuse a required bridge) and record why, as `escaped`.
        const clampLog = () => diagnostics.clamped || (diagnostics.clamped = []);
        if (!(inset > 0 && inset < thickness)) {
          const clamped = Math.min(0.05, thickness / 4);
          clampLog().push({ id, required: !!spec.required, reason: "soffit inset must be > 0 and < deck thickness", inset, clampedTo: clamped });
          inset = clamped;
        }
        if (!Number.isFinite(plate)) plate = 0.2;
        if (!(plate > inset && plate < thickness)) {
          const clamped = Math.min(Math.max(plate, inset * 2), (inset + thickness) / 2);
          clampLog().push({ id, required: !!spec.required, reason: "soffit thickness must be > inset and < deck thickness", thickness: plate, clampedTo: clamped });
          plate = clamped;
        }
        soffit = {
          color: o.color || spec.soffitColor || [0.08, 0.08, 0.10],
          inset, thickness: plate,
          spanScale: spanScale > 0 && spanScale < 1 ? spanScale : 0.97,
          depthScale: depthScale > 0 && depthScale < 1 ? depthScale : 0.94,
        };
      }
      const deckUnder = clearance + (soffit ? soffit.inset : 0);
      const lift = deckUnder + thickness / 2;
      const at = (h) => [
        frame.c[0] + frame.r[0] * offset + frame.u[0] * h,
        frame.c[1] + frame.r[1] * offset + frame.u[1] * h,
        frame.c[2] + frame.r[2] * offset + frame.u[2] * h,
      ];
      const stage = emptyBuffer();
      if (!box(stage, at(lift), [span, thickness, depth], spec.color, [frame.r, frame.u, frame.t])) return false;
      if (soffit && !box(stage, at(clearance + soffit.thickness / 2),
          [span * soffit.spanScale, soffit.thickness, depth * soffit.depthScale],
          soffit.color, [frame.r, frame.u, frame.t])) return false;
      if (spec.supports !== false && ctx.groundHeight && ctx.groundPoint) {
        const sw = (spec.supportWidth != null ? spec.supportWidth : 0.8) * 0.9;
        const lat = supportGap + sw / 2 + 0.12;
        const under = deckUnder;           // deck underside above the road datum
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
      diagnostics.emitted.push(Object.assign({ id, required: !!spec.required, vertices: stage.pos.length / 3, overhead: true, clearance, frac: spec.frac },
        soffit ? { soffit: true } : null));
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

    // T3 drape: sand/apron/car-park grid over the drawn terrain (SCENERY-QA-PLAN
    // §2b). Columns break at ribbon rails; rows ~4 m; sz[1] skirt on the rim.
    // Per-cell footprint guard — one box round a climbing drape suppressed every
    // lower road in the footprint. Falls back to N closed-form boxes when the
    // build has no track frame (unit harness).
    let patchSeq = 0;
    function groundPatch(spec) {
      spec = spec || {};
      if (!validSize(spec.size)) {
        diagnostics.invalid.push({ id: spec.id || "ground-patch", reason: "invalid ground-patch dimensions", size: spec.size });
        return false;
      }
      const track = ctx.track, px = ctx.px, pz = ctx.pz, hw = ctx.hw;
      if (!track || !px || !pz || !hw || !ctx.groundHeight) {
        // Box path: sample groundHeight along the gap (no world frame).
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
      const n = ctx.n || track.n || px.length;
      const k = ((Math.round(spec.k || 0) % n) + n) % n;
      const side = spec.side || 1, gap = spec.gap || 0, sz = spec.size;
      const col = spec.color || [0.5, 0.5, 0.5];
      const pieces = Math.max(2, Math.round(spec.samples || 4));
      const id = spec.id || ("ground-patch-" + k), required = !!spec.required;
      const emitFace = ctx.emitFace || (typeof TrackGeom !== "undefined" && TrackGeom.emit);
      const normFn = (typeof TrackGeom !== "undefined" && TrackGeom.norm) || ((v) => {
        const L = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / L, v[1] / L, v[2] / L];
      });
      const minSep = (typeof TrackGeom !== "undefined" && TrackGeom.MIN_SEP) || 0.02;
      const UPV = [0, 1, 0];
      const r = [track.rx[k], track.ry[k], track.rz[k]];
      const t = [track.tx[k], track.ty[k], track.tz[k]];
      const u = ctx.upOf ? ctx.upOf(track, k) : UPV;
      // Per-call lift slot so overlapping patches never share a plane.
      const lift = (1 + patchSeq++ % 5) * minSep;
      const midDist = gap + sz[0] / 2;
      const mid = [px[k] + r[0] * side * (hw[k] + midDist),
        ctx.groundHeight(k, midDist), pz[k] + r[2] * side * (hw[k] + midDist)];
      const suppress = (em, pit) => (diagnostics.suppressed.push({
        id, required: pit ? false : required,
        reason: (pit ? (em ? "emitted footprint " : "") + "superseded by the pit complex"
          : (em ? "emitted " : "") + "footprint rejected"),
      }), false);
      const reject = (center, size, basis) => {
        const v = preflight({ center, size, basis });
        return v === true ? null : v;
      };
      const hit = reject(mid, sz, [r, u, t]);
      if (hit !== null) return suppress(false, hit === "pit");
      const cuts = [gap];
      const rails = ctx.rails || [];
      for (const d of rails) if (d > gap + 0.25 && d < gap + sz[0] - 0.25) cuts.push(d);
      cuts.push(gap + sz[0]);
      while (cuts.length - 1 < pieces) {
        let w = 0;
        for (let i = 1; i < cuts.length; i++) if (cuts[i] - cuts[i - 1] > cuts[w + 1] - cuts[w]) w = i - 1;
        cuts.splice(w + 1, 0, (cuts[w] + cuts[w + 1]) / 2);
      }
      const cols = cuts.length - 1, rows = Math.min(16, Math.max(1, Math.ceil(sz[2] / 4)));
      const top = [], bot = [], at = (i, j) => j * (cols + 1) + i;
      const terrainAt = ctx.terrainY || (() => null);
      for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
        const o = side * (hw[k] + cuts[i]), f = (j / rows - 0.5) * sz[2];
        const x = px[k] + r[0] * o + t[0] * f, z = pz[k] + r[2] * o + t[2] * f;
        const g = terrainAt(x, z), y = (g != null ? g : ctx.groundHeight(k, cuts[i])) + lift;
        top.push([x, y, z]); bot.push([x, y - sz[1], z]);
      }
      const cellB = [normFn([r[0], 0, r[2]]), UPV, normFn([t[0], 0, t[2]])];
      const keep = new Uint8Array(cols * rows);
      const quad = (i, j) => [top[at(i, j)], top[at(i + 1, j)], top[at(i + 1, j + 1)], top[at(i, j + 1)]];
      let kept = 0;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const q = quad(i, j), hi = Math.max(q[0][1], q[1][1], q[2][1], q[3][1]);
        const lo = Math.min(q[0][1], q[1][1], q[2][1], q[3][1]) - sz[1];
        const c = [(q[0][0] + q[2][0]) / 2, (lo + hi) / 2, (q[0][2] + q[2][2]) / 2];
        if (reject(c, [cuts[i + 1] - cuts[i], hi - lo, sz[2] / rows], cellB) === null) {
          keep[j * cols + i] = 1; kept++;
        }
      }
      if (!kept) return suppress(true, false);
      if (typeof emitFace !== "function") {
        diagnostics.invalid.push({ id, required, reason: "no emitFace for draped groundPatch" });
        return false;
      }
      const v0 = out.pos.length / 3, mat0 = out._mat, below = [mid[0], mid[1] - 1e4, mid[2]];
      out._mat = 0;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++)
        if (keep[j * cols + i]) emitFace(out, quad(i, j), col, below);
      const skirt = (a, b, cell) => { if (keep[cell]) emitFace(out, [top[a], top[b], bot[b], bot[a]], col, mid); };
      for (let i = 0; i < cols; i++) skirt(at(i, 0), at(i + 1, 0), i);
      for (let j = 0; j < rows; j++) skirt(at(cols, j), at(cols, j + 1), j * cols + cols - 1);
      for (let i = cols; i > 0; i--) skirt(at(i, rows), at(i - 1, rows), (rows - 1) * cols + i - 1);
      for (let j = rows; j > 0; j--) skirt(at(0, j), at(0, j - 1), (j - 1) * cols);
      out._mat = mat0;
      diagnostics.emitted.push({ id, required, vertices: out.pos.length / 3 - v0, kind: spec.kind || "model", groundPatch: true });
      if (spec.collision && typeof ctx.recordBarrier === "function") {
        const halfFrac = (sz[2] / 2) / (track.total || 1);
        ctx.recordBarrier(k / n - halfFrac, k / n + halfFrac, side, gap);
      }
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
      // One box between two grounded points, extruded up from grade. Densified
      // per pair below, never as one global polyline — see the note there.
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
      // Densify and extrude EACH caller pair independently — never a single
      // global polyline. The caller's points can be 50-100 m apart in s, and a
      // straight box between two of them chords across the track's curvature,
      // so the terrain-tilted slab bows OVER the racing line (monza banking,
      // catalunya La Caixa, istanbul T8 revetment all read 1.9-4.4 m over the
      // tarmac from exactly this). k is a node index groundPoint() rounds, so
      // interpolating k between a pair's endpoints and re-grounding at each
      // intermediate node walks the real arc; ~10 m sub-chords keep the bow
      // under the 0.2 m props-over-road tolerance on a typical corner radius.
      // Per-PAIR is load-bearing on top of that: a global polyline bridged
      // across any pair that grounded to null — e.g. a wall that wraps the
      // start line — drew one box the full width of the circuit (hungaroring's
      // pit trim read 5 m over the racing line 1 km away).
      const TARGET = 10, MAXSUB = 16;
      // The pit complex owns its footprint. These boxes are RAW (no footprint
      // guard), so a cutting or a wall that runs through the complex yields
      // there chord by chord — Portimão's pit-straight earthwork stood inside
      // the garages — and the drop is recorded as superseded, not as a guard
      // suppression.
      const inPit = ctx.inPit || (() => false);
      let emitted = 0, superseded = 0;
      for (let i = 0; i < spec.points.length - 1; i++) {
        const a = spec.points[i], b = spec.points[i + 1];
        const pa = ground(a.k, a.side, a.dist), pb = ground(b.k, b.side, b.dist);
        if (!pa || !pb) continue;
        const chord = Math.hypot(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]) || 0.1;
        const sub = Math.max(1, Math.min(MAXSUB, Math.ceil(chord / TARGET)));
        let dk = b.k - a.k;
        if (ctx.n && Math.abs(dk) > ctx.n / 2) dk -= Math.sign(dk) * ctx.n;
        let prev = pa;
        let prevIn = inPit(a.k, a.side || 1, a.dist || 0, width / 2);
        for (let j = 1; j <= sub; j++) {
          const t = j / sub;
          const kk = a.k + dk * t, sd = t < 0.5 ? (a.side || 1) : (b.side || 1);
          const dd = (a.dist || 0) + ((b.dist || 0) - (a.dist || 0)) * t;
          const p = j === sub ? pb : (ground(kk, sd, dd) || pb);
          const pIn = inPit(kk, sd, dd, width / 2);
          if (prevIn || pIn) superseded++;
          else if (emitBox(prev, p)) emitted++;
          prev = p; prevIn = pIn;
        }
      }
      if (superseded && spec.id)
        diagnostics.suppressed.push({ id: spec.id, required: false,
          reason: superseded + " chord(s) superseded by the pit complex" });
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

  // DRAPE — a flat decal laid ON the rendered terrain, for what runoffApron /
  // place() / groundPatch cannot do: each takes ONE height per box (place()
  // also sinks it 0.8 m), so a 30 m band on relief went wholly under grade.
  // Promoted from four identical circuit-local copies (paul_ricard, dijon,
  // okayama, miami) — vertex-identical to them.
  //
  // Built from the FINAL scenery api (after transformSceneryApi), so it calls
  // the wrapped anchor/K/along exactly as circuit code does: `k` is the
  // authored-frame node and it must NOT be wrapped again.
  //
  // drape(k, side, gap, [depth, thick, len], col, opts?) — the footprint
  // (depth across x len along, `gap` beyond the edge at node k) is tiled into
  // <= opts.cell (24) m cells; each samples terrainYAt on a 3x3 grid, is tilted
  // to the best-fit plane, and spans from `thick` under its lowest sample to
  // `opts.h` (default 1 cm) over its highest — never buried, never floating.
  //  * Arc length scales by (1 - kappa*d): the cell length follows it, and a
  //    cell folded inside a tight corner (scale < 0.25) is dropped.
  //  * A cell any corner of which lies closer to ANOTHER part of the lap than
  //    to its own centreline is dropped (two straights' 90 m bands met in the
  //    infield and lay one over the other).
  //  * The normal is quantised (0.02 in x/z) and tops and bottoms snap to a
  //    0.24 m lattice at a per-class residue (`opts.res` in 0.03 steps, +0.12
  //    on alternate cells along the run unless `opts.line`), so no two
  //    overlapping faces share a plane: >= 3 cm apart by construction.
  //  * `opts.phase` seeds that alternation (default: a per-build call count).
  //  * `opts.widen`: alternate cells run that much wider (split both sides)
  //    and the parity also alternates across the depth — a crop field's
  //    stations overlap 4 % end to end, and on a near-straight their side
  //    faces were 0-2 cm apart; the sliver a wide cell lays over its
  //    neighbour's top is then 0.12 m off it.
  //
  // drapeRun(s, side, gap, sz, col, res, span?, extra?) — a patch sz[2] m long
  // centred on lap fraction `s`, draped one ~20 m along() station at a time so
  // it follows the corner instead of running straight off its tangent.
  // `span` (default sz[2]) is the run the stations are laid over: bands of one
  // corner share it so their cells abut station for station. `extra` merges
  // into each station's drape opts.
  function drapeKit(api) {
    const { n, px, pz, K, along, anchor, terrainYAt, addBox, out, vadd } = api;
    let grid = null;
    const DG = 24;
    const nearestNode = (x, z, R) => {
      if (!grid) {
        grid = new Map();
        for (let i = 0; i < n; i++) {
          const key = __M.floor(px[i] / DG) + "," + __M.floor(pz[i] / DG);
          let a = grid.get(key);
          if (!a) grid.set(key, (a = []));
          a.push(i);
        }
      }
      const ix = __M.floor(x / DG), iz = __M.floor(z / DG), m = __M.ceil(R / DG);
      let best = R * R;
      for (let a = -m; a <= m; a++) for (let b = -m; b <= m; b++) {
        for (const i of grid.get((ix + a) + "," + (iz + b)) || []) {
          const d = (px[i] - x) ** 2 + (pz[i] - z) ** 2;
          if (d < best) best = d;
        }
      }
      return __M.sqrt(best);
    };
    const cr = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
    const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
    const nrm = (p) => { const m = __M.hypot(p[0], p[1], p[2]) || 1; return [p[0] / m, p[1] / m, p[2] / m]; };
    let seq = 0;
    const drape = (k, side, gap, sz, col, opts) => {
      opts = opts || {};
      const depth = sz[0], thick = sz[1], len = sz[2], cell = opts.cell || 24;
      const res = opts.res || 0, widen = opts.widen || 0;
      const phase = opts.phase != null ? opts.phase : seq++;
      const na = __M.max(1, __M.ceil(depth / cell)), nl = __M.max(1, __M.ceil(len / cell));
      const a0 = anchor(k, side, gap + depth / 2);
      const hand = dot(cr(a0.r, a0.u), a0.t) < 0 ? -1 : 1;
      const tl = __M.hypot(a0.t[0], a0.t[2]) || 1, th = [a0.t[0] / tl, a0.t[2] / tl];
      const eL = anchor(k, side, 0).c, eR = anchor(k, -side, 0).c;
      const mid = [(eL[0] + eR[0]) / 2, (eL[2] + eR[2]) / 2];
      const spanAt = (d) => {
        const a = anchor(k - 1, side, d).c, b = anchor(k + 1, side, d).c;
        return __M.hypot(b[0] - a[0], b[2] - a[2]);
      };
      const span0 = spanAt(0) || 1;
      const dw = depth / na;
      for (let i = 0; i < na; i++) {
        const f = spanAt(gap + (i + 0.5) * dw) / span0;
        if (!(f > 0.25)) continue;
        const dl = __M.min(3, f) * len / nl;
        const p0 = anchor(k, side, gap + i * dw).c, p1 = anchor(k, side, gap + (i + 1) * dw).c;
        const rl = __M.hypot(p1[0] - p0[0], p1[2] - p0[2]) || 1;
        const rh = [(p1[0] - p0[0]) / rl, (p1[2] - p0[2]) / rl];
        const fb = anchor(k, side, gap + (i + 0.5) * dw).c[1] + 0.3;
        for (let j = 0; j < nl; j++) {
          const lc = (j + 0.5 - nl / 2) * dl;
          const cx = (p0[0] + p1[0]) / 2 + th[0] * lc, cz = (p0[2] + p1[2]) / 2 + th[1] * lc;
          let foreign = false;
          for (const fa of [-0.5, 0.5]) for (const fl of [-0.5, 0.5]) {
            const x = cx + rh[0] * fa * rl + th[0] * fl * dl, z = cz + rh[1] * fa * rl + th[1] * fl * dl;
            const own = __M.abs((x - mid[0]) * rh[0] + (z - mid[1]) * rh[1]);
            if (nearestNode(x, z, own) < own - 1.5) foreign = true;
          }
          if (foreign) continue;
          const S = [];
          let my = 0;
          for (const fa of [-0.5, 0, 0.5]) for (const fl of [-0.5, 0, 0.5]) {
            const aa = fa * rl, ll = fl * dl;
            const x = cx + rh[0] * aa + th[0] * ll, z = cz + rh[1] * aa + th[1] * ll;
            const ty = terrainYAt(x, z);
            const y = ty !== null && __isFinite(ty) ? ty : fb;
            S.push([aa, ll, x, y, z]); my += y / 9;
          }
          let ga = 0, gl = 0;
          for (const s of S) { ga += s[0] * (s[3] - my); gl += s[1] * (s[3] - my); }
          ga /= 6 * (0.5 * rl) * (0.5 * rl); gl /= 6 * (0.5 * dl) * (0.5 * dl);
          // Normal quantised to a 0.02 grid in world x/z: overlapping cells
          // then share it EXACTLY, so the lattice below separates their planes
          // (two near-equal tilts put the same face 0-2 cm apart at random).
          const un = nrm(cr([th[0], gl, th[1]], [rh[0], ga, rh[1]]));
          if (un[1] < 0) { un[0] = -un[0]; un[2] = -un[2]; }
          const ux = __M.round(un[0] * 50) / 50, uz = __M.round(un[2] * 50) / 50;
          const u = [ux, __M.sqrt(__M.max(0.5, 1 - ux * ux - uz * uz)), uz];
          const rd = rh[0] * u[0] + rh[1] * u[2];
          const r = nrm([rh[0] - rd * u[0], -rd * u[1], rh[1] - rd * u[2]]);
          const t0 = cr(r, u), t = [t0[0] * hand, t0[1] * hand, t0[2] * hand];
          const C = [cx, my, cz], dC = dot(C, u);
          let hi = -1e9, lo = 1e9;
          for (const s of S) {
            const h = dot([s[2] - C[0], s[3] - C[1], s[4] - C[2]], u);
            if (h > hi) hi = h;
            if (h < lo) lo = h;
          }
          const odd = (phase * nl + j + (widen ? i : 0)) & 1;
          const r0 = res + (opts.line ? 0 : 0.12 * odd);
          const top = __M.ceil((dC + hi + (opts.h || 0.01) - r0) / 0.24) * 0.24 + r0 - dC;
          const bot = __M.floor((dC + lo - thick - r0) / 0.24) * 0.24 + r0 - dC;
          const rw = rl + widen * odd;
          addBox(out, vadd(C, u, (top + bot) / 2),
            [rw / (__M.hypot(r[0], r[2]) || 1), top - bot, dl / (__M.hypot(t[0], t[2]) || 1)], col, [r, u, t]);
        }
      }
    };
    let lapLen = 0;
    for (let i = 0; i < n; i++) lapLen += __M.hypot(px[(i + 1) % n] - px[i], pz[(i + 1) % n] - pz[i]);
    const drapeRun = (s, side, gap, sz, col, res, span, extra) => {
      span = span || sz[2];
      const k0 = K(s);
      let st = 0;
      along(s - span / 2 / lapLen, s + span / 2 / lapLen, 20, (k, sp) => {
        const dk = __M.abs(((k - k0) % n + n + n / 2) % n - n / 2);
        if (dk * lapLen / n <= sz[2] / 2 + sp / 2)
          drape(k, side, gap, [sz[0], sz[1], sp * 1.04], col,
            extra ? Object.assign({ res, phase: st }, extra) : { res, phase: st });
        st++;
      });
    };
    return { drape, drapeRun };
  }

  return { create, validateGeometry, scratch, sealGeometry, drapeKit };
})();
Object.freeze(TrackModels);
