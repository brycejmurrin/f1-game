const Tracks = (function () {
  "use strict";
  let keepGeometry = false;
  let compactProps = true;

  const WORLD_UP = [0, 1, 0];

  const { cross, norm, addBox } = TrackGeom;
  const { cr, crc, sample, curvatureRaw, curvature, project, wallAt, postLimits, surfaceFolds } = TrackSpline;
  const { upOf, bankingProfile, onKerb, bankAngle, banking,
          buildRoad, buildTerrainSteps, buildFloor } = TrackMesh;
  const lerp = M4.lerp, __M = Math, __isFinite = Number.isFinite;
  const { elevationAt, hasRealElevation, fromRaw } = TrackDef;

  const previewCL = new Map();
  function previewKey(def) {
    if (!def || !def.id) return null;
    const n = (def.path && def.path.pts && def.path.pts.length) || (def.points && def.points.length) || 0;
    let zones = "";
    if (def.hwZones && def.hwZones.length) try { zones = JSON.stringify(def.hwZones); } catch (_) { zones = "hz"; }
    return def.id + "\0" + (def.reverse ? "1" : "0") + "\0" + n + "\0"
      + (def.baseHW != null ? String(def.baseHW) : "") + "\0" + zones;
  }
  function forgetPreviewCenterline(id) {
    if (id == null) { previewCL.clear(); return; }
    for (const k of previewCL.keys()) if (k.startsWith(id + "\0")) previewCL.delete(k);
  }
  function adoptPreviewCenterline(def, track) {
    const key = previewKey(def);
    if (!key || !track) return false;
    track.def = def;
    previewCL.set(key, track);
    return true;
  }
  function buildCenterline(def, opts) {
    const key = opts && opts.line === false ? previewKey(def) : null;
    if (key && previewCL.has(key)) {
      const hit = previewCL.get(key);
      return Object.assign({}, hit, { meshes: hit.meshes || {} });
    }
    const track = buildCenterlineFresh(def, opts);
    if (key && opts && opts.preview === true) previewCL.set(key, track);
    return track;
  }
  function buildCenterlineFresh(def, opts) {
    ensurePoints(def);
    const P = def.points, N = P.length;
    const idx = (i) => ((i % N) + N) % N;
    const SUB = 16;
    const alpha = def.splineAlpha > 0 ? Math.min(1, +def.splineAlpha) : 0, crOut = [0, 0, 0];
    const dx = [], dy = [], dz = [], dhw = [], dbank = [], dlen = [0];
    for (let i = 0; i < N; i++) {
      const a = P[idx(i - 1)], b = P[i], c = P[idx(i + 1)], d = P[idx(i + 2)];
      for (let j = 0; j < SUB; j++) {
        const t = j / SUB;
        let x, y, z;
        if (alpha) { crc(a, b, c, d, t, alpha, crOut); x = crOut[0]; y = crOut[1]; z = crOut[2]; }
        else {
          x = cr(a[0], b[0], c[0], d[0], t);
          y = cr(a[1], b[1], c[1], d[1], t);
          z = cr(a[2], b[2], c[2], d[2], t);
        }
        dx.push(x); dy.push(y); dz.push(z);
        dhw.push(lerp(b[3], c[3], t));
        dbank.push(lerp(b[4], c[4], t));
        const k = dx.length - 1;
        if (k > 0) dlen.push(dlen[k - 1] + Math.hypot(dx[k] - dx[k - 1], dy[k] - dy[k - 1], dz[k] - dz[k - 1]));
      }
    }
    const M = dx.length;
    const closeGap = Math.hypot(dx[0] - dx[M - 1], dy[0] - dy[M - 1], dz[0] - dz[M - 1]);
    const total = dlen[M - 1] + closeGap;
    if (!(total > 1)) throw new Error("degenerate loop: lap length " + total + " m");
    dx.push(dx[0]); dy.push(dy[0]); dz.push(dz[0]);
    dhw.push(dhw[0]); dbank.push(dbank[0]); dlen.push(total);

    if (def.sceneryStartFrac != null) {
      const offNew = Math.round(TrackSpace.wrap01(def.startFrac) * N) % N;
      const iOld = Math.round(TrackSpace.wrap01(def.sceneryStartFrac) * N) % N;
      const j = (((def.reverse ? offNew - iOld : iOld - offNew) % N) + N) % N;
      def._sceneryShift = total ? dlen[j * SUB] / total : 0;
    }

    const n = Math.max(200, Math.round(total / 4));
    const ds = total / n;
    const px = new Float32Array(n), py = new Float32Array(n), pz = new Float32Array(n);
    const tx = new Float32Array(n), ty = new Float32Array(n), tz = new Float32Array(n);
    const rx = new Float32Array(n), ry = new Float32Array(n), rz = new Float32Array(n);
    const hw = new Float32Array(n), bank = new Float32Array(n);

    let di = 0;
    for (let k = 0; k < n; k++) {
      const target = k * ds;
      while (di < M - 1 && dlen[di + 1] < target) di++;
      const seg = dlen[di + 1] - dlen[di] || 1;
      const f = (target - dlen[di]) / seg;
      px[k] = lerp(dx[di], dx[di + 1], f);
      py[k] = lerp(dy[di], dy[di + 1], f);
      pz[k] = lerp(dz[di], dz[di + 1], f);
      hw[k] = lerp(dhw[di], dhw[di + 1], f);
      bank[k] = lerp(dbank[di], dbank[di + 1], f);
    }
    if (def.path && def.id && hasRealElevation(def.id)) surveyHeights(def, px, py, pz, n);
    const dress = def._sceneryShift || 0;
    const bridges = def.bridges;
    if (bridges) for (const b of bridges) {
      const cs = TrackSpace.wrap01(b.s + dress) * total;
      for (let k = 0; k < n; k++) {
        let d = Math.abs(k * ds - cs);
        d = Math.min(d, total - d);
        if (d < b.halfM) py[k] += b.rise * 0.5 * (1 + Math.cos(Math.PI * d / b.halfM));
      }
    }
    const elevs = def.elevations;
    if (elevs) for (const e of elevs) {
      const cs = TrackSpace.wrap01(e.s + dress) * total;
      for (let k = 0; k < n; k++) {
        let d = Math.abs(k * ds - cs);
        d = Math.min(d, total - d);
        if (d < e.halfM) py[k] += e.rise * 0.5 * (1 + Math.cos(Math.PI * d / e.halfM));
      }
    }
    if (def.undulate !== false) {
      let lo = Infinity, hi = -Infinity;
      for (let k = 0; k < n; k++) { if (py[k] < lo) lo = py[k]; if (py[k] > hi) hi = py[k]; }
      const relief = hi - lo;
      const amp = Math.min(0.42, 0.14 + relief * 0.0028);
      let seed = 0;
      for (let i = 0; i < String(def.id).length; i++) seed = (seed * 31 + String(def.id).charCodeAt(i)) % 9973;
      const rnd = (i) => { const x = Math.sin((seed + i * 78.233) * 12.9898) * 43758.5453; return x - Math.floor(x); };
      const waves = [];
      for (let h = 0; h < 3; h++) {
        const targetLen = 30 + h * 38 + rnd(h) * 22;
        const cycles = Math.max(4, Math.round(total / targetLen));
        waves.push({ cycles, phase: rnd(h + 7) * Math.PI * 2, w: h + 1 });
      }
      const norm = waves.reduce((a, b) => a + b.w, 0) || 1;
      for (let k = 0; k < n; k++) {
        const u = ((k / n - dress) % 1 + 1) % 1;
        let v = 0;
        for (const wv of waves) v += Math.sin(u * wv.cycles * Math.PI * 2 + wv.phase) * wv.w;
        py[k] += (v / norm) * amp;
      }
    }

    for (let k = 0; k < n; k++) {
      const a = (k - 1 + n) % n, b = (k + 1) % n;
      let t = norm([px[b] - px[a], py[b] - py[a], pz[b] - pz[a]]);
      tx[k] = t[0]; ty[k] = t[1]; tz[k] = t[2];
      let r = norm(cross(t, WORLD_UP));
      const bk = bank[k];
      if (bk) {
        const u = cross(r, t);
        const cb = Math.cos(bk), sb = Math.sin(bk);
        r = [r[0] * cb + u[0] * sb, r[1] * cb + u[1] * sb, r[2] * cb + u[2] * sb];
      }
      rx[k] = r[0]; ry[k] = r[1]; rz[k] = r[2];
    }

    const track = { def, total, n, px, py, pz, tx, ty, tz, rx, ry, rz, hw, bank, street: !!def.street, meshes: {}, map: null };
    track.map = buildMap(px, pz, n);
    track.curv = new Float32Array(n);
    { const cds = total / n; for (let k = 0; k < n; k++) track.curv[k] = curvatureRaw(track, k * cds); }
    if (opts && opts.line === false) track.line = null; else TrackLine.bake(track);
    track.bankP = bankingProfile(track);
    return track;
  }


  function pitWindow(track) {
    if (track && track.pit) return { entryM: track.pit.entryM, exitM: track.pit.exitM };
    return TrackPit.window(track, curvature);
  }


  function pitLaneAt(track, s) { return TrackPit.at(track, s); }

  function pitLaneSpan(track) {
    const p = track && track.pit;
    return p ? { sIn: p.sIn, lenM: p.lenM, side: p.side } : null;
  }

  function inPitLane(track, s, x) {
    const l = pitLaneAt(track, s);
    if (!l) return false;
    const a = Math.min(l.inner, l.outer) - (l.side > 0 ? 0.9 : 0);
    const b = Math.max(l.inner, l.outer) + (l.side > 0 ? 0 : 0.9);
    return x >= a && x <= b;
  }

  const _now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());
  function* buildSteps(def, opts) {
    const G = (opts && opts.gfx) || (typeof GLX !== "undefined" ? GLX : null);
    if (!G || typeof G.createMesh !== "function") throw new Error("Tracks.build requires gfx.createMesh");
    Log.info("track", "build start " + def.id + (opts && opts.night != null ? " night=" + !!opts.night : ""));
    const _prof = []; let _t = _now();
    const lap = (n, k) => { const now = _now(); _prof.push({ n, k, ms: +(now - _t).toFixed(2) }); _t = now; };
    function* inner(it) {
      let done = false;
      try {
        for (;;) {
          const r = it.next(); if (r.done) { done = true; return r.value; }
          const p = _now(); yield; _t += _now() - p;
        }
      } finally { if (!done && typeof it.return === "function") it.return(); }
    }
    const track = buildCenterline(def);
    track.buildProfile = _prof;
    lap("centerline", "geo"); yield track; _t = _now();
    track.pit = TrackPit.build(track, def, curvature);
    lap("pit", "geo"); yield track; _t = _now();
    track.surface = TrackSurface.profile(def, track);
    lap("surface", "geo"); yield track; _t = _now();
    track._night = opts && opts.night != null ? !!opts.night : !!def.night;
    track._gridSlots = opts && opts.gridSlots > 0 ? Math.round(opts.gridSlots) : null;
    track._gfx = G;
    {
      track.geometryDiagnostics = [];
      track.geometryDiagnostics.push(Object.assign({ name: "centreline", ok: true }, surfaceFolds(track)));
      const chunkRibbons = !!(opts && opts.chunkRibbons && G.createChunkedMesh);
      const buildRibbon = (geo, key) => {
        const canChunk = chunkRibbons && (key !== "road" || G.chunkedTrackCoords !== false);
        if (!canChunk) {
          track.meshes[key] = G.createMesh(geo);
          if (chunkRibbons) track.meshes[key + "Chunked"] = null;
          return;
        }
        const mesh = G.createChunkedMesh(geo, 72);
        const hasChunks = !!(mesh && mesh.chunks && mesh.chunks.length);
        if (hasChunks) {
          track.meshes[key] = null;
          track.meshes[key + "Chunked"] = mesh;
          return;
        }
        track.meshes[key] = mesh && mesh.chunks == null ? mesh : G.createMesh(geo);
        track.meshes[key + "Chunked"] = null;
      };
      const safe = (name, geo) => {
        const result = TrackModels.validateGeometry(geo);
        track.geometryDiagnostics.push(Object.assign({ name }, result));
        if (result.ok) return geo;
        Log.warn("track", `${def.id}/${name} skipped: ${result.reason}`);
        return { pos: [], nrm: [], col: [], idx: [], mat: [] };
      };
      const floorGeo = safe("floor", buildFloor(track)); lap("floor", "geo"); yield track; _t = _now();
      track.meshes.floor = G.createMesh(floorGeo); lap("floor", "up"); yield track; _t = _now();
      const roadGeo = safe("road", buildRoad(track)); roadGeo._keepPositions = true; roadGeo._keepFullGeometry = keepGeometry;
      lap("road", "geo"); yield track; _t = _now();
      track.roadGeo = roadGeo; buildRibbon(roadGeo, "road"); lap("road", "up"); yield track; _t = _now();
      const terrainGeo = yield* inner(buildTerrainSteps(track));
      const terrainSafe = safe("terrain", terrainGeo); terrainSafe._keepPositions = true; terrainSafe._keepFullGeometry = keepGeometry;
      lap("terrain", "geo"); yield track; _t = _now();
      track.terrainGeo = terrainSafe; buildRibbon(terrainSafe, "terrain");
      lap("terrain", "up"); yield track; _t = _now();
      const _props = TrackBuildProps.buildSteps ? yield* inner(TrackBuildProps.buildSteps(track)) : TrackBuildProps.build(track);
      lap("props", "geo"); yield track; _t = _now();
      let _ps; TrackPit.openBoundary(track); TrackBuildProps.featherAfterOpen(track); _ps = _now(); yield; _t += _now() - _ps;
      const _sealed = TrackModels.sealGeometry(_props.out); _ps = _now(); yield; _t += _now() - _ps;
      const propsGeo = safe("props", _sealed); track.propsGeo = propsGeo; _ps = _now(); yield; _t += _now() - _ps;
      track.propTop = propTop(track, propsGeo);
      propsGeo._keepPositions = propsGeo._keepFullGeometry = keepGeometry;
      lap("propsSeal", "geo"); yield track; _t = _now();
      const _stripOpts = { groundY: (x, z) => terrainY(track, x, z), terrain: track.terrainGeo };
      propsGeo._hidden = TrackHiddenFaces.stripSteps ? yield* inner(TrackHiddenFaces.stripSteps(propsGeo, _stripOpts))
        : TrackHiddenFaces.strip(propsGeo, _stripOpts);
      if (compactProps) {
        propsGeo._compact = TrackHiddenFaces.compact(propsGeo);
        const _blocks = propsGeo.__blocks;
        if (_blocks) for (let i = 0; i < _blocks.length; i++) _blocks[i].from = null;
      }
      lap("propsHidden", "geo"); yield track; _t = _now();
      let _unchunked = false;
      try { _unchunked = localStorage.getItem("apex26.propsUnchunked") === "1"; } catch (_) {  }
      track.meshes.props = (G.createChunkedMesh && !_unchunked)
        ? G.createChunkedMesh(propsGeo, 72) : G.createMesh(propsGeo);
      lap("props", "up"); yield track; _t = _now();
      track.meshes.propBatches = null;
      if (track.graph && G.createInstancedBatch) {
        const { batches } = track.graph.batches({ instancedOnly: true });
        track.propTop = Math.max(track.propTop, instTop(track, batches));
        if (batches.length) {
          const pb = track.meshes.propBatches = [];
          for (const b of batches) pb.push(G.createInstancedBatch(b.geo, b.matrices, b.colors, { cellSize: 72 }));
        }
      }
      lap("batches", "up"); yield track; _t = _now();
      if (opts && opts.retainGraph === false) track.graph = null;
      const glassGeo = safe("glass", _props.glass);
      const waterGeo = safe("water", _props.water);
      track.glassGeo = glassGeo;
      track.waterGeo = waterGeo;
      glassGeo._keepPositions = glassGeo._keepFullGeometry = keepGeometry;
      lap("glassWater", "geo"); yield track; _t = _now();
      track.meshes.glass = G.createChunkedMesh ? G.createChunkedMesh(glassGeo, 72) : G.createMesh(glassGeo);
      track.meshes.water = G.createMesh(waterGeo);
      track.meshes.gate = G.createMesh(safe("gate", buildGate(track)));
      track.meshes.startline = G.createMesh(safe("startline", buildStartLine(track)));
      lap("trim", "up"); yield track; _t = _now();
      if (typeof PitSigns !== "undefined") PitSigns.upload(G, track);
      lap("pitSigns", "up"); yield track; _t = _now();
      if (opts && opts.retainGraph === false && !opts.retainGeometry && !keepGeometry) {
        track.propsGeo = track.glassGeo = track.waterGeo = null;
      }
      dropRibbonCpuIfReady(track, opts);
    }
    Log.info("track", "build done " + def.id + " total=" + (track && track.total && +track.total.toFixed(1)) + " n=" + (track && track.n) + " night=" + !!(track && track._night));
    return track;
  }
  let _buildGen = 0, _pacing = 0;
  function build(def, opts) {
    _buildGen++;
    const it = buildSteps(def, opts);
    let partial = null;
    try {
      for (;;) { const r = it.next(); if (r.done) return r.value; if (r.value) partial = r.value; }
    } catch (e) { freePartial(partial, opts); throw e; }
  }
  function freePartial(partial, opts) {
    const G = partial && partial._gfx || (opts && opts.gfx);
    if (!partial || !G) return;
    try { free(partial, G); if (typeof PitSigns !== "undefined") PitSigns.free(G, partial); } catch (_) {  }
  }
  async function buildPaced(def, opts, alive, onAbandon, budgetMs, pace) {
    const gen = ++_buildGen, it = buildSteps(def, opts);
    const paceNow = () => (typeof pace === "function" ? pace() : pace) || null;
    const nextFrame = () => new Promise((res) => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(res) : setTimeout(res, 16)));
    const nextTask = () => (typeof scheduler !== "undefined" && scheduler && typeof scheduler.yield === "function") ? scheduler.yield() : new Promise((res) => setTimeout(res, 0));
    let partial = null, r, slices = 0;
    _pacing++;
    try {
      for (;;) {
        const p = paceNow(), budget = p && p.budgetMs > 0 ? p.budgetMs : budgetMs > 0 ? budgetMs : 8, rafEvery = p && p.rafEvery > 0 ? p.rafEvery | 0 : 1;
        const t0 = _now();
        do { r = it.next(); if (r.value) partial = r.value; } while (!r.done && _now() - t0 < budget);
        if (r.done) return r.value;
        await (++slices % rafEvery === 0 ? nextFrame() : nextTask());
        if (gen !== _buildGen || !alive()) { it.return(); if (onAbandon) onAbandon(partial); return null; }
      }
    } catch (e) { if (onAbandon) onAbandon(partial); throw e; }
    finally { _pacing--; }
  }
  const building = () => _pacing > 0;
  function free(t, gfx) {
    const m = t && t.meshes, ck = !!gfx.freeChunkedMesh;
    if (!m) return;
    for (const h of [m.floor, m.road, m.terrain, m.gate, m.startline]) gfx.freeMesh(h);
    if (ck) {
      gfx.freeChunkedMesh(m.props);
      if (m.roadChunked) gfx.freeChunkedMesh(m.roadChunked);
      if (m.terrainChunked) gfx.freeChunkedMesh(m.terrainChunked);
      if (m.glass) gfx.freeChunkedMesh(m.glass);
      if (gfx.flushChunkedOwnership) gfx.flushChunkedOwnership();
    } else gfx.freeMesh(m.props);
    if (m.glass && !ck) { gfx.freeMesh(m.glass); }
    if (m.water) gfx.freeMesh(m.water);
    if (m.propBatches && gfx.freeInstancedBatch) { for (const b of m.propBatches) gfx.freeInstancedBatch(b); m.propBatches = null; }
  }

  function buildMap(px, pz, n) {
    let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
    for (let i = 0; i < n; i++) {
      if (px[i] < minx) minx = px[i]; if (px[i] > maxx) maxx = px[i];
      if (pz[i] < minz) minz = pz[i]; if (pz[i] > maxz) maxz = pz[i];
    }
    const w = maxx - minx || 1, h = maxz - minz || 1, sc = 1 / Math.max(w, h);
    const ox = (1 - w * sc) / 2, oz = (1 - h * sc) / 2;
    const out = [], step = Math.max(1, Math.floor(n / 200));
    for (let i = 0; i < n; i += step) out.push([ox + (maxx - px[i]) * sc, oz + (maxz - pz[i]) * sc]);
    return out;
  }


  function buildGate(track) {
    const out = { pos: [], nrm: [], col: [], idx: [] };
    const backDist = 15;
    const tmp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 0 };
    sample(track, track.total - backDist, tmp);
    const r = norm(tmp.r), t = norm(tmp.t), u = norm(cross(r, t));
    const w = tmp.hw;
    const gateX = tmp.p[0], gateY = tmp.p[1], gateZ = tmp.p[2];
    const basis = [r, u, t];
    for (const side of [-1, 1]) {
      const o = side * (w + 1.5);
      addBox(out,
        [gateX + r[0] * o + u[0] * 3, gateY + r[1] * o + u[1] * 3, gateZ + r[2] * o + u[2] * 3],
        [1, 6, 1], [0.85, 0.1, 0.1], basis);
    }
    const beam = [gateX + u[0] * 6.2, gateY + u[1] * 6.2, gateZ + u[2] * 6.2];
    track.startGate = { c: beam, t, face: 0.65 };
    addBox(out, beam, [w * 2 + 4, 0.8, 1.2], [0.1, 0.1, 0.12], basis);
    addBox(out,
      [gateX + u[0] * 6.8, gateY + u[1] * 6.8, gateZ + u[2] * 6.8],
      [w * 1.4, 0.6, 0.6], [0.95, 0.95, 0.97], basis);
    return out;
  }

  function buildStartLine(track) {
    const out = { pos: [], nrm: [], col: [], idx: [] };
    const r = [track.rx[0], track.ry[0], track.rz[0]];
    const t = [track.tx[0], track.ty[0], track.tz[0]];
    const u = upOf(track, 0);
    const w = track.hw[0];
    const P = [track.px[0], track.py[0], track.pz[0]];
    const white = track.def.palette.line || [0.95, 0.95, 0.98];
    const dark = [0.05, 0.05, 0.06];
    const SQ = 0.5;
    const rows = 2;
    const depth = rows * SQ;
    const cols = Math.max(2, Math.round((2 * w) / SQ));
    const colW = (2 * w) / cols;
    const lift = 0.05;
    let base = 0;
    for (let ri = 0; ri < rows; ri++) {
      for (let ci = 0; ci < cols; ci++) {
        const c = (((ri + ci) & 1) === 0) ? white : dark;
        const o0 = -w + ci * colW, o1 = o0 + colW;
        const d0 = -depth / 2 + ri * SQ, d1 = d0 + SQ;
        const vert = (o, d) => {
          out.pos.push(P[0] + r[0] * o + t[0] * d + u[0] * lift,
                       P[1] + r[1] * o + t[1] * d + u[1] * lift,
                       P[2] + r[2] * o + t[2] * d + u[2] * lift);
          out.nrm.push(u[0], u[1], u[2]);
          out.col.push(c[0], c[1], c[2]);
        };
        vert(o0, d0); vert(o1, d0); vert(o0, d1); vert(o1, d1);
        out.idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
        base += 4;
      }
    }
    TrackMesh.buildPitLane(track, out);
    TrackMesh.buildPitBoxes(track, out);
    TrackMesh.buildGridBoxes(track, out);
    return out;
  }

  const DEFS = (typeof window !== "undefined" && window.TrackDefs) || [];

  function surveyHeights(def, px, py, pz, n) {
    const P = def.path.pts, N = P.length, arc = new Float64Array(N + 1);
    for (let i = 1; i <= N; i++) arc[i] = arc[i - 1] + __M.hypot(P[i % N][0] - P[i - 1][0], P[i % N][1] - P[i - 1][1]);
    const pathLen = arc[N] || 1;
    const near = (x, z, i) => {
      const a = P[i], b = P[(i + 1) % N], ex = b[0] - a[0], ez = b[1] - a[1], l2 = ex * ex + ez * ez || 1;
      const t = __M.max(0, __M.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / l2));
      const qx = a[0] + ex * t - x, qz = a[1] + ez * t - z;
      return [qx * qx + qz * qz, arc[i] + t * (arc[i + 1] - arc[i])];
    };
    let seg = 0, bd = Infinity;
    for (let i = 0; i < N; i++) { const d = near(px[0], pz[0], i)[0]; if (d < bd) { bd = d; seg = i; } }
    const startFrac = near(px[0], pz[0], seg)[1] / pathLen;
    const dir = def.reverse ? -1 : 1, y0 = elevationAt(def.id, startFrac), base = py[0];
    for (let k = 0; k < n; k++) {
      const f = ((startFrac + dir * (k / n)) % 1 + 1) % 1;
      py[k] = base + elevationAt(def.id, f) - y0;
    }
  }

  const LIST = DEFS.map((d) => {
    const def = fromRaw(d);
    if (d && d._metaOnly) def._metaOnly = true;
    return def;
  });

  function ensurePoints(def) { return def.points; }

  function circuitPayloadResident(def) {
    return !!(def && def.path && def.path.pts && def.path.pts.length && !def._metaOnly);
  }
  function hydrate(raw) {
    if (!raw || !raw.id) return false;
    const idx = LIST.findIndex((t) => t && t.id === raw.id);
    if (idx < 0) return false;
    if (circuitPayloadResident(LIST[idx])) return true;
    const next = fromRaw(raw);
    const pts = next.points, cur = LIST[idx];
    for (const k of Object.keys(next)) if (k !== "points") cur[k] = next[k];
    delete cur._metaOnly;
    Object.defineProperty(cur, "points", { value: pts, writable: true, configurable: true, enumerable: true });
    const TD = (typeof window !== "undefined" && window.TrackDefs) || [];
    for (let i = 0; i < TD.length; i++) {
      if (!TD[i] || TD[i].id !== raw.id) continue;
      if (TD[i] === raw) { delete TD[i]._metaOnly; continue; }
      const dst = TD[i];
      for (const k of Object.keys(dst)) delete dst[k];
      Object.assign(dst, raw);
      delete dst._metaOnly;
    }
    if (typeof TrackMaps !== "undefined" && TrackMaps.invalidate) TrackMaps.invalidate(raw.id);
    forgetPreviewCenterline(raw.id);
    return true;
  }

  const SEASON = LIST.filter((t) => !t.classic);

  function seasonIndex(round) {
    const t = SEASON[round];
    return t ? LIST.indexOf(t) : -1;
  }

  const TRI_EPS = 0.01;
  function terrainGrid(track) {
    const g = track.terrainGeo;
    if (!g || !g.pos || !g.idx) return null;
    if (track._terrGrid && track._terrGrid.geo === g) return track._terrGrid;
    const pos = g.pos, idx = g.idx, CELL = 8;
    let mnx = Infinity, mnz = Infinity, mxx = -Infinity, mxz = -Infinity;
    for (let i = 0; i < pos.length; i += 3) {
      if (pos[i] < mnx) mnx = pos[i]; if (pos[i] > mxx) mxx = pos[i];
      if (pos[i + 2] < mnz) mnz = pos[i + 2]; if (pos[i + 2] > mxz) mxz = pos[i + 2];
    }
    if (!isFinite(mnx)) return null;
    const nx = Math.max(1, Math.ceil((mxx - mnx) / CELL));
    const nz = Math.max(1, Math.ceil((mxz - mnz) / CELL));
    const nc = nx * nz, start = new Int32Array(nc + 1), lo = new Float64Array(nc).fill(Infinity);
    const rng = new Int32Array(idx.length / 3 * 4);
    for (let t = 0, r = 0; t < idx.length; t += 3, r += 4) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const x0 = __M.min(pos[a], pos[b], pos[c]) - TRI_EPS, x1 = __M.max(pos[a], pos[b], pos[c]) + TRI_EPS;
      const z0 = __M.min(pos[a + 2], pos[b + 2], pos[c + 2]) - TRI_EPS;
      const z1 = __M.max(pos[a + 2], pos[b + 2], pos[c + 2]) + TRI_EPS;
      const i0 = rng[r] = __M.max(0, __M.floor((x0 - mnx) / CELL)), i1 = rng[r + 1] = __M.min(nx - 1, __M.floor((x1 - mnx) / CELL));
      const j0 = rng[r + 2] = __M.max(0, __M.floor((z0 - mnz) / CELL)), j1 = rng[r + 3] = __M.min(nz - 1, __M.floor((z1 - mnz) / CELL));
      const tl = _triLo(pos, a, b, c);
      for (let j = j0; j <= j1; j++) for (let k = j * nx + i0, e = j * nx + i1; k <= e; k++) { start[k + 1]++; if (tl < lo[k]) lo[k] = tl; }
    }
    for (let k = 0; k < nc; k++) start[k + 1] += start[k];
    const list = new Uint32Array(start[nc]), fill = start.slice(0, nc);
    for (let t = 0, r = 0; t < idx.length; t += 3, r += 4) {
      for (let j = rng[r + 2]; j <= rng[r + 3]; j++) for (let k = j * nx + rng[r], e = j * nx + rng[r + 1]; k <= e; k++) list[fill[k]++] = t;
    }
    track._terrGrid = { geo: g, mnx, mnz, mxx, mxz, nx, nz, cell: CELL, start, list, lo };
    return track._terrGrid;
  }
  function _triLo(pos, a, b, c) {
    const v0x = pos[c] - pos[a], v0z = pos[c + 2] - pos[a + 2], v1x = pos[b] - pos[a], v1z = pos[b + 2] - pos[a + 2];
    const d00 = v0x * v0x + v0z * v0z, d01 = v0x * v1x + v0z * v1z, d11 = v1x * v1x + v1z * v1z;
    const den = d00 * d11 - d01 * d01; if (__M.abs(den) < 1e-9) return Infinity;
    const ya = pos[a + 1], yb = pos[b + 1], yc = pos[c + 1], mn = __M.min(ya, yb, yc), dy = __M.max(ya, yb, yc) - mn;
    return dy > 0 ? mn - dy * TRI_EPS * __M.sqrt(3 * (d00 + d11 + (d00 + d11 - 2 * d01)) / den) - 1e-6 : mn - 1e-6;
  }
  function terrainCell(G, x, z) {
    if (!(x >= G.mnx - TRI_EPS && z >= G.mnz - TRI_EPS && x <= G.mxx + TRI_EPS && z <= G.mxz + TRI_EPS)) return -1;
    const i = __M.min(G.nx - 1, __M.max(0, __M.floor((x - G.mnx) / G.cell)));
    const j = __M.min(G.nz - 1, __M.max(0, __M.floor((z - G.mnz) / G.cell)));
    return j * G.nx + i;
  }

  function propTop(track, propsGeo) {
    const G = terrainGrid(track), p = propsGeo && propsGeo.pos;
    if (!G || !p || !p.length) return 0;
    let best = 0;
    for (let i = 0; i < p.length; i += 3) {
      const y = p[i + 1], k = terrainCell(G, p[i], p[i + 2]);
      if (k < 0 || !(y - G.lo[k] > best)) continue;
      const g = terrainY(track, p[i], p[i + 2]);
      if (g != null && y - g > best) best = y - g;
    }
    return best;
  }
  function instTop(track, batches) {
    const G = terrainGrid(track);
    if (!G || !batches) return 0;
    let best = 0;
    for (const b of batches) {
      const p = b && b.geo && b.geo.pos, M = b && b.matrices;
      if (!p || !p.length || !M) continue;
      const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < p.length; i++) { const a = i % 3; if (p[i] < mn[a]) mn[a] = p[i]; if (p[i] > mx[a]) mx[a] = p[i]; }
      for (let k = 0; k + 15 < M.length; k += 16) {
        let hi = 0;
        for (let a = 0; a < 3; a++) hi += __M.max(M[k + 1 + 4 * a] * mn[a], M[k + 1 + 4 * a] * mx[a]);
        const y = M[k + 13] + hi, c = terrainCell(G, M[k + 12], M[k + 14]);
        if (c < 0 || !(y - G.lo[c] > best)) continue;
        const g = terrainY(track, M[k + 12], M[k + 14]);
        if (g != null && y - g > best) best = y - g;
      }
    }
    return best;
  }
  function terrainY(track, x, z) {
    const g = track.terrainGeo; if (!g) return null;
    const pos = g.pos, idx = g.idx; let best = null;
    const G = terrainGrid(track);
    if (G) {
      const k = terrainCell(G, x, z);
      if (k < 0) return null;
      for (let n = G.start[k], e = G.start[k + 1]; n < e; n++) {
        const t = G.list[n];
        best = _triY(pos, idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3, x, z, best);
      }
      return best;
    }
    for (let t = 0; t < idx.length; t += 3) {
      best = _triY(pos, idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3, x, z, best);
    }
    return best;
  }

  function _triY(pos, a, b, c, x, z, best) {
    const ax = pos[a], az = pos[a + 2], bx = pos[b], bz = pos[b + 2], cx = pos[c], cz = pos[c + 2];
    const v0x = cx - ax, v0z = cz - az, v1x = bx - ax, v1z = bz - az, v2x = x - ax, v2z = z - az;
    const d00 = v0x * v0x + v0z * v0z, d01 = v0x * v1x + v0z * v1z, d11 = v1x * v1x + v1z * v1z, d20 = v2x * v0x + v2z * v0z, d21 = v2x * v1x + v2z * v1z;
    const den = d00 * d11 - d01 * d01; if (__M.abs(den) < 1e-9) return best;
    const u = (d11 * d20 - d01 * d21) / den, vv = (d00 * d21 - d01 * d20) / den;
    const tA = __M.sqrt(den), w = 1 - u - vv;
    if (u * tA < -TRI_EPS * __M.sqrt(d11) || vv * tA < -TRI_EPS * __M.sqrt(d00)
        || w * tA < -TRI_EPS * __M.sqrt((v0x - v1x) * (v0x - v1x) + (v0z - v1z) * (v0z - v1z))) return best;
    const y = pos[a + 1] + u * (pos[c + 1] - pos[a + 1]) + vv * (pos[b + 1] - pos[a + 1]);
    return best === null || y > best ? y : best;
  }

  function diagnosticBuild() {
    if (!compactProps) return true;
    try { return localStorage.getItem("apex26.propsUnchunked") === "1"; } catch (_) { return false; }
  }

  function setCompactProps(value) { compactProps = !!value; return compactProps; }

  function setKeepGeometry(value) {
    keepGeometry = !!value;
    return keepGeometry;
  }
  function getKeepGeometry() { return keepGeometry; }

  function ribbonGpuSettled(track, which) {
    const m = track && track.meshes;
    if (!m) return false;
    const ch = m[which + "Chunked"];
    if (ch && ch.chunks && ch.chunks.length) return true;
    return which === "road" && !!m.road && !!track._gfx && track._gfx.chunkedTrackCoords === false;
  }
  function dropRibbonCpuIfReady(track, opts) {
    if (!track || track._ribbonCpuDropped || (opts && opts.retainGeometry) || (opts && opts.retainRibbonCpu) || keepGeometry) return;
    if (!track.roadGeo || !track.terrainGeo) return;
    if (!ribbonGpuSettled(track, "road") || !ribbonGpuSettled(track, "terrain")) return;
    for (const geo of [track.roadGeo, track.terrainGeo]) {
      geo.nrm = geo.col = geo.mat = null;
      if (Array.isArray(geo.pos)) geo.pos = Float64Array.from(geo.pos);
      if (Array.isArray(geo.idx) && geo.idx.every((v) => v >= 0 && v <= 4294967295 && v === Math.floor(v))) geo.idx = Uint32Array.from(geo.idx);
      if (geo.trk) geo.trk = null;
    }
    track._ribbonCpuDropped = true;
  }

  return { LIST, SEASON, seasonIndex, build, buildSteps, buildPaced, building, free, buildCenterline, adoptPreviewCenterline, forgetPreviewCenterline, sample, curvature, onKerb, banking, bankAngle, project, wallAt, postLimits, terrainY, setKeepGeometry, keepGeometry: getKeepGeometry, setCompactProps, diagnosticBuild, pitWindow, pitLaneAt, pitLaneSpan, inPitLane, hydrate, circuitPayloadResident, dropRibbonCpuIfReady };
})();
