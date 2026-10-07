/* Apex 26 — track engine shell: LIST / build() / centerline / pit helpers / terrainY.
   Props orchestration is js/track/scenery/build-props.js (TrackBuildProps). */
const Tracks = (function () {
  "use strict";
  let keepGeometry = false;
  // Props vertex compaction after the hidden-face strip (hidden-faces.js
  // compact). The node audit harness turns it OFF: its primitive ranges [s,e)
  // index the raw emission buffer (tools/lib/track-build-vm.cjs).
  let compactProps = true;

  const WORLD_UP = [0, 1, 0];

  const { cross, norm, addBox } = TrackGeom;
  const { cr, sample, curvatureRaw, curvature, project, wallAt, postLimits } = TrackSpline;
  const { upOf, bankingProfile, onKerb, bankAngle, banking,
          buildRoad, buildTerrainSteps, buildFloor } = TrackMesh;
  const lerp = M4.lerp, __M = Math, __isFinite = Number.isFinite;
  // The def factory (js/track/core/def.js): palettes, SRTM readers, realPoints
  // and the LIST field copy all live there, so a runtime def (the track
  // designer's) is built by the same code as a script-tag circuit.
  const { elevationAt, hasRealElevation, fromRaw } = TrackDef;

  /** Centreline only, no meshes. `opts.line === false` skips ONLY the racing-line bake (~75 %
   *  of the time): tr.line = null, lineW/lineCorners/… absent — the designer's preview build. */
  function buildCenterline(def, opts) {
    ensurePoints(def);
    const P = def.points, N = P.length;
    const idx = (i) => ((i % N) + N) % N;
    const SUB = 16;
    const dx = [], dy = [], dz = [], dhw = [], dbank = [], dlen = [0];
    for (let i = 0; i < N; i++) {
      const a = P[idx(i - 1)], b = P[i], c = P[idx(i + 1)], d = P[idx(i + 2)];
      for (let j = 0; j < SUB; j++) {
        const t = j / SUB;
        const x = cr(a[0], b[0], c[0], d[0], t);
        const y = cr(a[1], b[1], c[1], d[1], t);
        const z = cr(a[2], b[2], c[2], d[2], t);
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
    // The last dense point is still short of the lap origin. Include that
    // final chord as a real interpolation interval: otherwise the final
    // output nodes extrapolate the preceding Catmull segment with f > 1.
    dx.push(dx[0]); dy.push(dy[0]); dz.push(dz[0]);
    dhw.push(dhw[0]); dbank.push(dbank[0]); dlen.push(total);

    if (def.sceneryStartFrac != null) {
      const offNew = Math.round(TrackSpace.wrap01(def.startFrac) * N) % N;
      const iOld = Math.round(TrackSpace.wrap01(def.sceneryStartFrac) * N) % N;
      // The old origin's control point, renumbered into THIS lap's ordering.
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
      const cs = ((b.s + dress) % 1) * total;
      for (let k = 0; k < n; k++) {
        let d = Math.abs(k * ds - cs);
        d = Math.min(d, total - d);                 // wrap-around distance
        if (d < b.halfM) py[k] += b.rise * 0.5 * (1 + Math.cos(Math.PI * d / b.halfM));
      }
    }
    // elevation changes — terrain follows road (unlike BRIDGES where gY stays flat)
    const elevs = def.elevations;
    if (elevs) for (const e of elevs) {
      const cs = ((e.s + dress) % 1) * total;
      for (let k = 0; k < n; k++) {
        let d = Math.abs(k * ds - cs);
        d = Math.min(d, total - d);
        if (d < e.halfM) py[k] += e.rise * 0.5 * (1 + Math.cos(Math.PI * d / e.halfM));
      }
    }
    // Low-amplitude ripple (3 harmonics, whole cycles/lap for seam continuity);
    // amp scales with relief (0.14–0.42 m cap); seeded off circuit id for ghosts.
    if (def.undulate !== false) {
      let lo = Infinity, hi = -Infinity;
      for (let k = 0; k < n; k++) { if (py[k] < lo) lo = py[k]; if (py[k] > hi) hi = py[k]; }
      const relief = hi - lo;
      // 0.14 m on a dead-flat circuit rising to 0.42 m on Spa-like relief.
      const amp = Math.min(0.42, 0.14 + relief * 0.0028);
      let seed = 0;
      for (let i = 0; i < String(def.id).length; i++) seed = (seed * 31 + String(def.id).charCodeAt(i)) % 9973;
      const rnd = (i) => { const x = Math.sin((seed + i * 78.233) * 12.9898) * 43758.5453; return x - Math.floor(x); };
      // Wavelengths ~30-110 m expressed as whole cycles per lap.
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

    // tangents by central difference (wrap), then right + banking
    for (let k = 0; k < n; k++) {
      const a = (k - 1 + n) % n, b = (k + 1) % n;
      let t = norm([px[b] - px[a], py[b] - py[a], pz[b] - pz[a]]);
      tx[k] = t[0]; ty[k] = t[1]; tz[k] = t[2];
      let r = norm(cross(t, WORLD_UP));
      // bake banking: rotate right & up around tangent
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
    // Bake the static curvature LUT (rad/m per node) BEFORE anything derives from
    // it — findCorners/bankingProfile call curvature(), which now indexes this.
    track.curv = new Float32Array(n);
    { const cds = total / n; for (let k = 0; k < n; k++) track.curv[k] = curvatureRaw(track, k * cds); }
    // ── THE PIT LANE IS REAL TARMAC, NOT A STRIP CARVED OUT OF THE ROAD ──────
    // Painted INSIDE the racing surface, the lane eats 3.2 m of the road's
    // width, so a narrow circuit races on less road because a pit lane
    // exists. Widen the road across the pit window instead, by exactly the
    // lane's width, so the racing surface is untouched and the lane is new
    // tarmac beyond the racing edge.
    //
    // WHY HERE: the curvature LUT is baked two lines up and the mesh is not
    // built until build(), so this is the one seam where the window can be
    // derived from the arc AND still reach the road, the kerbs and the banking.
    //
    // WHY SYMMETRIC: `hw` is ONE half-width per node and every consumer — mesh,
    // kerbs, banking, sampling, projection — builds from +/-hw about the
    // centreline. A one-sided widening needs a centreline-offset array threaded
    // through all of them, which is a different change. Widening both sides is
    // what this engine can express, and it is not a fudge: real pit straights
    // ARE wide, and the extra room on the far side is the start/finish straight
    // getting the width it should have had.
    //
    // The taper matters more than the width. A step in `hw` is a step in the
    // road mesh, the kerb line and the racing-line LUT all at once, so the
    // window opens and closes over PIT_TAPER metres.
    if (opts && opts.line === false) track.line = null; else TrackLine.bake(track);   // the racing line LUT (track.line / lineW / lineCorners), from curv + hw
    track.bankP = bankingProfile(track);
    return track;
  }

  // THE PIT COMPLEX IS ONE MODEL — js/track/core/pit.js (TrackPit), built once
  // per track in build() before the terrain profile and the scenery, both of
  // which read it. The window, the lane, the wall, the row of boxes and the
  // garages are all derived from that record; nothing below keeps a second
  // copy of a width or a position (docs/research/PIT-LANE-REDESIGN-2026-09.md).

  /** The limiter window: how far before the line it opens, how far after it
   *  closes. Off the model once built; the same arithmetic before. */
  function pitWindow(track) {
    if (track && track.pit) return { entryM: track.pit.entryM, exitM: track.pit.exitM };
    return TrackPit.window(track, curvature);
  }

  // THE ROAD NEVER MOVES. The complex is a second ribbon beside the racing
  // surface — `hw`, the racing line, the kerbs and every sampler see exactly
  // the road they saw before — and the SCENERY yields to it: onRoadHit /
  // onTrack in buildProps treat the complex's footprint as road on the pit
  // side, and the driving boundary is opened across it afterwards
  // (TrackPit.openBoundary). The widening of `hw` that pushed the road through
  // the scenery on a dozen circuits, and the fit-to-whatever-room-is-left that
  // gave a 3.2 m strip, are both gone.

  /** WHERE the lane is at one arc position, in the same lateral frame the
   *  car's own `x` lives in — { side, inner, outer, centre, workCentre, … },
   *  signed, or null outside the complex. Everything that has to agree about
   *  the lane reads THIS: the physics exemption, PitLane's box and the AI's
   *  lane line. The mesh is built from the same profile. */
  function pitLaneAt(track, s) { return TrackPit.at(track, s); }

  /** The lane's EXTENT between the entry line and the exit line, or null. */
  function pitLaneSpan(track) {
    const p = track && track.pit;
    return p ? { sIn: p.sIn, lenM: p.lenM, side: p.side } : null;
  }

  /** Is this car's lateral position inside the lane? A TOLERANCE of half a
   *  car is allowed at the inner edge, because the alternative is a car whose
   *  inside wheels are over the line reading as beached on the grass. */
  function inPitLane(track, s, x) {
    const l = pitLaneAt(track, s);
    if (!l) return false;
    const a = Math.min(l.inner, l.outer) - (l.side > 0 ? 0.9 : 0);
    const b = Math.max(l.inner, l.outer) + (l.side > 0 ? 0 : 0.9);
    return x >= a && x <= b;
  }

  // BUILD PROFILE — a sequential timeline of the build, emission separated
  // from upload, so `track.buildProfile` can answer the one question the
  // multithreading plan still has open: is the main-thread block at race entry
  // the TRACK BUILD, or something else in the same window
  // (docs/notes/MULTITHREADING-PLAN-2026-09-16.md §7, condition 2). Run 128
  // established on real hardware that the block is 1.8-3.0 s and is main-thread
  // JavaScript rather than upload back-pressure; it could not say WHICH
  // JavaScript, and a worker that moves the wrong half buys nothing.
  //
  // A stopwatch rather than wrappers: the build IS a sequence, so a lap between
  // two points needs no restructuring of the call sites, which is what keeps
  // this from being a refactor with a measurement attached. `performance.now`
  // where it exists and Date.now otherwise — the Node-VM build guard
  // (tools/track/verify-track.cjs) has to keep working, and a 1 ms clock is
  // plenty for phases measured in tens.
  const _now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());
  // THE BUILD AS STEPS: build() runs it straight through, buildPaced a few ms per frame
  // (the garage drive-out keeps animating). Yields the track so far at every lap() and
  // inside props and the strip: byte-identical by construction; suspended time is no lap's.
  function* buildSteps(def, opts) {
    // A centerline-only consumer has buildCenterline(). A full build without
    // uploads silently skipped road, props, barriers and pit boundary opening,
    // yet returned a track that looked ready to physics and render callers.
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
    // The pit complex FIRST: the terrain profile flattens under it and the
    // scenery keeps out of it, so both need the model before they run.
    track.pit = TrackPit.build(track, def, curvature);
    lap("pit", "geo"); yield track; _t = _now();
    track.surface = TrackSurface.profile(def, track);
    lap("surface", "geo"); yield track; _t = _now();
    track._night = opts && opts.night != null ? !!opts.night : !!def.night;
    // How many grid boxes to paint. game.js passes the SIZE OF THE FIELD IT IS
    // ABOUT TO GRID, because that varies with the selected team; anything that
    // builds a track without a field (tools, VM builds, the circuit sweeps)
    // leaves it null and gets TrackMesh's 22-car default.
    track._gridSlots = opts && opts.gridSlots > 0 ? Math.round(opts.gridSlots) : null;
    // Façade wiring: the active renderer backend flows in through opts.gfx
    // (game.js passes `gfx`). This ends tracks.js's reliance on reaching the
    // GLX global directly — the injected handle is the WebGL2/TLX/WGX backend
    // actually in use. The `typeof GLX` branch is the fallback for callers that
    // don't inject one: the Node-VM build guard (tools/track/verify-track.cjs) and the
    // VM tests, which install a stub GLX global instead of an opts.gfx.
    track._gfx = G;
    // Keep the upload block scoped; the precondition at entry guarantees it runs.
    {
      track.geometryDiagnostics = [];
      const chunkRibbons = !!(opts && opts.chunkRibbons && G.createChunkedMesh);
      const buildRibbon = (geo, key) => {
        const canChunk = chunkRibbons && (key !== "road" || G.chunkedTrackCoords !== false);
        if (!canChunk) {
          track.meshes[key] = G.createMesh(geo);
          // Quality recovery may build a chunked copy later. Keep the source
          // channels at their authored precision: TLX quantizes normals from
          // these numbers *before* converting to float32, so compacting even
          // after the first upload changes some late-chunk GPU bytes by 1 LSB.
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
        // `chunks:null` is a small plain mesh; `chunks:[]` is a failed upload.
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
      track.terrainGeo = terrainSafe; buildRibbon(terrainSafe, "terrain"); // raw geometry kept for groundY/debug
      lap("terrain", "up"); yield track; _t = _now();
      const _props = TrackBuildProps.buildSteps ? yield* inner(TrackBuildProps.buildSteps(track)) : TrackBuildProps.build(track);
      lap("props", "geo"); yield track; _t = _now();
      // AFTER buildProps: the scenery kept out of the complex (onRoadHit), so
      // opening the driving boundary across it puts nothing in a car's path.
      TrackPit.openBoundary(track); TrackBuildProps.featherAfterOpen(track);
      const propsGeo = safe("props", TrackModels.sealGeometry(_props.out));
      track.propsGeo = propsGeo;
      // The tallest prop above its own ground: what the sun shadow map's depth
      // span must hold (js/render/shared/shadow-pass.js sunSpan). Measured before
      // the upload may drop the positions.
      track.propTop = propTop(track, propsGeo);
      propsGeo._keepPositions = propsGeo._keepFullGeometry = keepGeometry;
      lap("propsSeal", "geo"); yield track; _t = _now();
      // Index-only strip of never-visible triangles (js/track/core/hidden-faces.js).
      const _stripOpts = { groundY: (x, z) => terrainY(track, x, z), terrain: track.terrainGeo };
      propsGeo._hidden = TrackHiddenFaces.stripSteps ? yield* inner(TrackHiddenFaces.stripSteps(propsGeo, _stripOpts))
        : TrackHiddenFaces.strip(propsGeo, _stripOpts);
      // ...then drop the vertices only stripped triangles used (28 B each in
      // the VBO). This one DOES move vertex ranges — see compactProps.
      if (compactProps) propsGeo._compact = TrackHiddenFaces.compact(propsGeo);
      lap("propsHidden", "geo"); yield track; _t = _now();
      // THE DISCRIMINATOR (apex26.propsUnchunked, diagnostic only, default off).
      //
      // The census measured GPU time invariant to pixel count, which rules out
      // a fragment-bound frame but does NOT separate vertex-bound from
      // draw-call-bound — and the two want opposite fixes. Culling pays on the
      // first; on the second it can LOSE, which is what the occlusion numbers
      // did at vegas (94 % of chunks skipped, 10 % slower).
      //
      // One unchunked mesh is the clean separation: every prop vertex
      // submitted, no frustum cull, no occlusion, exactly ONE draw call. If
      // that is FASTER than the chunked path, draw calls are what bind and
      // WEBGL_multi_draw is the lever; if it is slower, vertices bind and the
      // query overhead is the thing to fix. Either answer closes a question
      // that has been guessed at twice.
      let _unchunked = false;
      try { _unchunked = localStorage.getItem("apex26.propsUnchunked") === "1"; } catch (_) { /* no storage */ }
      track.meshes.props = (G.createChunkedMesh && !_unchunked)
        ? G.createChunkedMesh(propsGeo, 72) : G.createMesh(propsGeo);
      lap("props", "up"); yield track; _t = _now();
      track.meshes.propBatches = null;
      if (track.graph && G.createInstancedBatch) {
        const { batches } = track.graph.batches({ instancedOnly: true });   // uploading the plain (capability) set ships glassBuf's panes twice — graph.js batches()
        // These placements' triangles were WITHHELD from propsGeo (city masses,
        // walls, risers), yet they cast into the sun map: fold them into the
        // span. A VM with no createInstancedBatch fused them all — unchanged.
        track.propTop = Math.max(track.propTop, instTop(track, batches));
        if (batches.length) {
          // Pushed as each one lands, not assigned after the map: a throw or an
          // abandon part-way can then free the batches already on the GPU.
          const pb = track.meshes.propBatches = [];
          for (const b of batches) pb.push(G.createInstancedBatch(b.geo, b.matrices, b.colors, { cellSize: 72 }));
        }
      }
      lap("batches", "up"); yield track; _t = _now();
      // The graph's placement nodes are build inputs, not race state. On a
      // production page they have already been fused/uploaded into meshes;
      // retaining tens of thousands of nodes keeps an entire build-local object
      // graph alive. VM parity and the opt-in dev API retain the graph explicitly.
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
      // The bay signs: one painted atlas + one texMesh, where a canvas and the
      // livery painter exist (feature-detected inside; the VM builds skip it).
      if (typeof PitSigns !== "undefined") PitSigns.upload(G, track);
      lap("pitSigns", "up"); yield track; _t = _now();
    }
    Log.info("track", "build done " + def.id + " total=" + (track && track.total && +track.total.toFixed(1)) + " n=" + (track && track.n) + " night=" + !!(track && track._night));
    return track;
  }
  let _buildGen = 0, _pacing = 0;   // bumped by every build (a newer one abandons a paced one); paced in flight
  // A throw mid-build (an OOM RangeError, a scenery closure fault) frees what the
  // steps had already uploaded: the caller has no handle to the partial track, so
  // every retry of a failed preparation would otherwise stack another orphaned world.
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
    try { free(partial, G); if (typeof PitSigns !== "undefined") PitSigns.free(G, partial); } catch (_) { /* best effort: the build's own error is the one to surface */ }
  }
  // ~budgetMs per frame, a paint between slices. Resolves the track, or null once alive() is
  // false or a newer build started — after handing onAbandon the partial track to free.
  async function buildPaced(def, opts, alive, onAbandon, budgetMs) {
    const gen = ++_buildGen, it = buildSteps(def, opts), budget = budgetMs > 0 ? budgetMs : 8;
    let partial = null, r;
    _pacing++;
    try {
      for (;;) {
        const t0 = _now();
        do { r = it.next(); if (r.value) partial = r.value; } while (!r.done && _now() - t0 < budget);
        if (r.done) return r.value;
        await new Promise((res) => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(res) : setTimeout(res, 16)));
        if (gen !== _buildGen || !alive()) { it.return(); if (onAbandon) onAbandon(partial); return null; }
      }
    } catch (e) { if (onAbandon) onAbandon(partial); throw e; }
    finally { _pacing--; }
  }
  const building = () => _pacing > 0;   // a paced build is in flight (its caller's world is null till it lands)
  function free(t, gfx) {   // every GPU resource build() uploaded; null-safe (a partial track too)
    const m = t && t.meshes, ck = !!gfx.freeChunkedMesh;
    if (!m) return;
    for (const h of [m.floor, m.road, m.terrain, m.gate, m.startline]) gfx.freeMesh(h);
    if (ck) { gfx.freeChunkedMesh(m.props); if (m.roadChunked) gfx.freeChunkedMesh(m.roadChunked); if (m.terrainChunked) gfx.freeChunkedMesh(m.terrainChunked); }
    else gfx.freeMesh(m.props);
    if (m.glass) { if (ck) gfx.freeChunkedMesh(m.glass); else gfx.freeMesh(m.glass); }
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

  // Props orchestration lives in js/track/scenery/build-props.js (TrackBuildProps), which Tracks.build calls.

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
      // Legs sit on the road plane (u-up from the sampled centreline).
      addBox(out,
        [gateX + r[0] * o + u[0] * 3, gateY + r[1] * o + u[1] * 3, gateZ + r[2] * o + u[2] * 3],
        [1, 6, 1], [0.85, 0.1, 0.1], basis);
    }
    const beam = [gateX + u[0] * 6.2, gateY + u[1] * 6.2, gateZ + u[2] * 6.2];
    track.startGate = { c: beam, t, face: 0.65 };   // start lamps on the beam's grid face when no gantry is at the line (js/race/start-lights.js)
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
    const SQ = 0.5;                          // square size (m)
    const rows = 2;                          // two squares deep (~1 m line)
    const depth = rows * SQ;
    const cols = Math.max(2, Math.round((2 * w) / SQ));
    const colW = (2 * w) / cols;
    const lift = 0.05;                        // along the road normal, just above the asphalt
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
        // verts: (o0,d0) (o1,d0) (o0,d1) (o1,d1) — same CCW winding as the road
        vert(o0, d0); vert(o1, d0); vert(o0, d1); vert(o1, d1);
        out.idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
        base += 4;
      }
    }
    // The pit lane's tarmac rides this decal too — but BEFORE the grid, because
    // tests/unit/grid-boxes.test.mjs reads the boxes as the TAIL of this buffer
    // and that is a real invariant, not an accident of order: the grid is the
    // last thing appended so a reader can slice it off without knowing what
    // came before.
    TrackMesh.buildPitLane(track, out);
    TrackMesh.buildPitBoxes(track, out);
    TrackMesh.buildGridBoxes(track, out);   // …and the grid stays the tail
    return out;
  }

  const DEFS = (typeof window !== "undefined" && window.TrackDefs) || [];

  // The survey at every 4 m node, not just at the control points: a control
  // point can only carry its own height, and splining between them drew a
  // straight line across a dip under dijon's 399 m first segment (9.7 m off).
  // Align once on the source trace, then read MONOTONIC arc fractions — a
  // nearest-seg walk skipped 7.6 m into one step at Nürburgring s≈0.775 and
  // authored a 9.8% knife-edge on a 5.5%-capped bake. Table is periodic.
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

  // fromRaw (def.js): authored fields + lazy points (realPoints / startFrac / hwZones).
  const LIST = DEFS.map((d) => {
    const def = fromRaw(d);
    if (d && d._metaOnly) def._metaOnly = true;
    return def;
  });

  function ensurePoints(def) { return def.points; }

  // LAZY_CIRCUIT: title meta stubs; hydrate in place so SEASON / saved indexes hold.
  function circuitPayloadResident(def) {
    return !!(def && def.path && def.path.pts && def.path.pts.length && !def._metaOnly);
  }
  function hydrate(raw) {
    if (!raw || !raw.id) return false;
    const idx = LIST.findIndex((t) => t && t.id === raw.id);
    if (idx < 0) return false;
    if (circuitPayloadResident(LIST[idx])) return true;
    const next = fromRaw(raw);
    // Force points on `next` first (elev/bridge fmap), then copy onto LIST[idx].
    // Moving the getter alone closes over `next` → Shanghai/Singapore/Suzuka CI reds.
    const pts = next.points, cur = LIST[idx];
    for (const k of Object.keys(next)) if (k !== "points") cur[k] = next[k];
    delete cur._metaOnly;
    Object.defineProperty(cur, "points", { value: pts, writable: true, configurable: true, enumerable: true });
    // Mutate TrackDefs in place — foundation holds find() refs across race().
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
    return true;
  }

  const SEASON = LIST.filter((t) => !t.classic);

  function seasonIndex(round) {
    const t = SEASON[round];
    return t ? LIST.indexOf(t) : -1;
  }

  function terrainGrid(track) {
    const g = track.terrainGeo;
    if (!g || !g.pos || !g.idx) return null;
    if (track._terrGrid && track._terrGrid.geo === g) return track._terrGrid;
    const pos = g.pos, idx = g.idx, CELL = 24;
    let mnx = Infinity, mnz = Infinity, mxx = -Infinity, mxz = -Infinity;
    for (let i = 0; i < pos.length; i += 3) {
      if (pos[i] < mnx) mnx = pos[i]; if (pos[i] > mxx) mxx = pos[i];
      if (pos[i + 2] < mnz) mnz = pos[i + 2]; if (pos[i + 2] > mxz) mxz = pos[i + 2];
    }
    if (!isFinite(mnx)) return null;
    const nx = Math.max(1, Math.ceil((mxx - mnx) / CELL));
    const nz = Math.max(1, Math.ceil((mxz - mnz) / CELL));
    const cells = new Array(nx * nz);
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const x0 = __M.min(pos[a], pos[b], pos[c]), x1 = __M.max(pos[a], pos[b], pos[c]);
      const z0 = __M.min(pos[a + 2], pos[b + 2], pos[c + 2]);
      const z1 = __M.max(pos[a + 2], pos[b + 2], pos[c + 2]);
      const i0 = __M.max(0, __M.floor((x0 - mnx) / CELL));
      const i1 = __M.min(nx - 1, __M.floor((x1 - mnx) / CELL));
      const j0 = __M.max(0, __M.floor((z0 - mnz) / CELL));
      const j1 = __M.min(nz - 1, __M.floor((z1 - mnz) / CELL));
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          const k = j * nx + i;
          (cells[k] || (cells[k] = [])).push(t);
        }
      }
    }
    track._terrGrid = { geo: g, mnx, mnz, nx, nz, cell: CELL, cells };
    return track._terrGrid;
  }

  // Height of the tallest prop above ITS OWN ground (terrainY): the car passing
  // it is on that ground too, so this — not the altitude over the lowest road
  // point, which read 1159 m at Monaco's cliffs — is how far up the sun axis a
  // caster sits from the shadow anchor. Props off the terrain (far backdrop,
  // outside every shadow box) are skipped. Pruned by the terrain's lowest point:
  // terrainY runs only for a vertex that could still beat the best so far.
  function propTop(track, propsGeo) {
    const t = track.terrainGeo && track.terrainGeo.pos, p = propsGeo && propsGeo.pos;
    if (!t || !t.length || !p || !p.length) return 0;
    let lo = Infinity, best = 0;
    for (let i = 1; i < t.length; i += 3) if (t[i] < lo) lo = t[i];
    for (let i = 0; i < p.length; i += 3) {
      const y = p[i + 1];
      if (!(y - lo > best)) continue;
      const g = terrainY(track, p[i], p[i + 2]);
      if (g != null && y - g > best) best = y - g;
    }
    return best;
  }
  // The same measure for instanced batches (graph.batches(): column-major
  // placement matrices over one model geo): each instance's top is its origin
  // height plus the model's local AABB through the matrix's Y row (exact for
  // an upright placement, an upper bound when tilted), above the ground at the
  // instance origin. 8 corners per instance: Vegas alone has ~22k.
  function instTop(track, batches) {
    const t = track.terrainGeo && track.terrainGeo.pos;
    if (!t || !t.length || !batches) return 0;
    let lo = Infinity, best = 0;
    for (let i = 1; i < t.length; i += 3) if (t[i] < lo) lo = t[i];
    for (const b of batches) {
      const p = b && b.geo && b.geo.pos, M = b && b.matrices;
      if (!p || !p.length || !M) continue;
      const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < p.length; i++) { const a = i % 3; if (p[i] < mn[a]) mn[a] = p[i]; if (p[i] > mx[a]) mx[a] = p[i]; }
      for (let k = 0; k + 15 < M.length; k += 16) {
        // Per axis, the larger of the two extents' contributions is the corner max.
        let hi = 0;
        for (let a = 0; a < 3; a++) hi += __M.max(M[k + 1 + 4 * a] * mn[a], M[k + 1 + 4 * a] * mx[a]);
        const y = M[k + 13] + hi;
        if (!(y - lo > best)) continue;
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
      const i = __M.floor((x - G.mnx) / G.cell), j = __M.floor((z - G.mnz) / G.cell);
      if (i < 0 || j < 0 || i >= G.nx || j >= G.nz) return null;
      const list = G.cells[j * G.nx + i];
      if (!list) return null;
      for (let n = 0; n < list.length; n++) {
        const t = list[n];
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
    if (u < -0.01 || vv < -0.01 || u + vv > 1.01) return best;
    const y = pos[a + 1] + u * (pos[c + 1] - pos[a + 1]) + vv * (pos[b + 1] - pos[a + 1]);
    return best === null || y > best ? y : best;
  }

  function setCompactProps(value) { compactProps = !!value; return compactProps; }

  function setKeepGeometry(value) {
    keepGeometry = !!value;
    return keepGeometry;
  }
  // Read by TrackBuildClient.replay: the worker's Tracks copy never sees the
  // page's keepGeometry flag, so replay must stamp _keepPositions itself.
  function getKeepGeometry() { return keepGeometry; }

  return { LIST, SEASON, seasonIndex, build, buildSteps, buildPaced, building, free, buildCenterline, sample, curvature, onKerb, banking, bankAngle, project, wallAt, postLimits, terrainY, setKeepGeometry, keepGeometry: getKeepGeometry, setCompactProps, pitWindow, pitLaneAt, pitLaneSpan, inPitLane, hydrate, circuitPayloadResident };
})();
