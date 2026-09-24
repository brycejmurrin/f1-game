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
  const { cr, sample, curvatureRaw, curvature, project, wallAt } = TrackSpline;
  const { upOf, bankingProfile, onKerb, bankAngle, banking,
          buildRoad, buildTerrain, buildFloor } = TrackMesh;
  const lerp = M4.lerp, __M = Math, __isFinite = Number.isFinite;

  function buildCenterline(def) {
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
      while (di < M - 2 && dlen[di + 1] < target) di++;
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
    // Until now the lane was painted INSIDE the racing surface: the road kept
    // its width and the lane ate 3.2 m of it, which on a narrow circuit meant
    // racing on less road because a pit lane existed. Widen the road across the
    // pit window instead, by exactly the lane's width, so the racing surface is
    // untouched and the lane is new tarmac beyond where the edge used to be.
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
    TrackLine.bake(track);   // the racing line LUT (track.line / lineW / lineCorners), from curv + hw
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
  function build(def, opts) {
    Log.info("track", "build start " + def.id + (opts && opts.night != null ? " night=" + !!opts.night : ""));
    const _prof = []; let _t = _now();
    const lap = (n, k) => { const now = _now(); _prof.push({ n, k, ms: +(now - _t).toFixed(2) }); _t = now; };
    const track = buildCenterline(def);
    track.buildProfile = _prof;
    lap("centerline", "geo");
    // The pit complex FIRST: the terrain profile flattens under it and the
    // scenery keeps out of it, so both need the model before they run.
    track.pit = TrackPit.build(track, def, curvature);
    lap("pit", "geo");
    track.surface = TrackSurface.profile(def, track);
    lap("surface", "geo");
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
    const G = (opts && opts.gfx) || (typeof GLX !== "undefined" ? GLX : null);
    track._gfx = G;
    if (G && G.createMesh) {
      track.geometryDiagnostics = [];
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
      const floorGeo = safe("floor", buildFloor(track)); lap("floor", "geo");
      track.meshes.floor = G.createMesh(floorGeo); lap("floor", "up");
      const roadGeo = safe("road", buildRoad(track)); roadGeo._keepPositions = true; roadGeo._keepFullGeometry = keepGeometry;
      lap("road", "geo");
      track.roadGeo = roadGeo; buildRibbon(roadGeo, "road"); lap("road", "up");
      const terrainGeo = buildTerrain(track);
      const terrainSafe = safe("terrain", terrainGeo); terrainSafe._keepPositions = true; terrainSafe._keepFullGeometry = keepGeometry;
      lap("terrain", "geo");
      track.terrainGeo = terrainSafe; buildRibbon(terrainSafe, "terrain"); // raw geometry kept for groundY/debug
      lap("terrain", "up");
      const _props = TrackBuildProps.build(track); lap("props", "geo");
      // AFTER buildProps: the scenery kept out of the complex (onRoadHit), so
      // opening the driving boundary across it puts nothing in a car's path.
      TrackPit.openBoundary(track);
      const propsGeo = safe("props", TrackModels.sealGeometry(_props.out));
      track.propsGeo = propsGeo;
      propsGeo._keepPositions = propsGeo._keepFullGeometry = keepGeometry;
      lap("propsSeal", "geo");
      // Index-only strip of never-visible triangles (js/track/core/hidden-faces.js).
      propsGeo._hidden = TrackHiddenFaces.strip(propsGeo,
        { groundY: (x, z) => terrainY(track, x, z), terrain: track.terrainGeo });
      // ...then drop the vertices only stripped triangles used (28 B each in
      // the VBO). This one DOES move vertex ranges — see compactProps.
      if (compactProps) propsGeo._compact = TrackHiddenFaces.compact(propsGeo);
      lap("propsHidden", "geo");
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
      lap("props", "up");
      track.meshes.propBatches = null;
      if (track.graph && G.createInstancedBatch) {
        const { batches } = track.graph.batches({ instancedOnly: true });   // uploading the plain (capability) set ships glassBuf's panes twice — graph.js batches()
        if (batches.length) {
          track.meshes.propBatches = batches.map((b) =>
            G.createInstancedBatch(b.geo, b.matrices, b.colors, { cellSize: 72 }));
        }
      }
      lap("batches", "up");
      const glassGeo = safe("glass", _props.glass);
      const waterGeo = safe("water", _props.water);
      track.glassGeo = glassGeo;
      track.waterGeo = waterGeo;
      glassGeo._keepPositions = glassGeo._keepFullGeometry = keepGeometry;
      lap("glassWater", "geo");
      track.meshes.glass = G.createChunkedMesh ? G.createChunkedMesh(glassGeo, 72) : G.createMesh(glassGeo);
      track.meshes.water = G.createMesh(waterGeo);
      track.meshes.gate = G.createMesh(safe("gate", buildGate(track)));
      track.meshes.startline = G.createMesh(safe("startline", buildStartLine(track)));
      lap("trim", "up");
      // The bay signs: one painted atlas + one texMesh, where a canvas and the
      // livery painter exist (feature-detected inside; the VM builds skip it).
      if (typeof PitSigns !== "undefined") PitSigns.upload(G, track);
      lap("pitSigns", "up");
    }
    Log.info("track", "build done " + def.id + " total=" + (track && track.total && +track.total.toFixed(1)) + " n=" + (track && track.n) + " night=" + !!(track && track._night));
    return track;
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

  // Props orchestration lives in js/track/scenery/build-props.js (TrackBuildProps).
  // Guards stay nested there for a later peel; Tracks.build calls TrackBuildProps.build.

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
    addBox(out,
      [gateX + u[0] * 6.2, gateY + u[1] * 6.2, gateZ + u[2] * 6.2],
      [w * 2 + 4, 0.8, 1.2], [0.1, 0.1, 0.12], basis);
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

  // palettes
  function dayPal(o) {
    const p = Object.assign({
      zenith: [0.18, 0.40, 0.78], horizon: [0.62, 0.74, 0.88], sun: [1, 0.96, 0.85],
      grass: [0.18, 0.42, 0.16], runoff: [0.55, 0.42, 0.28], fog: [0.62, 0.74, 0.88],
      asphalt: [0.16, 0.17, 0.19], line: [0.95, 0.95, 0.98],
      fogDensity: 0.0017, kerbA: [0.85, 0.12, 0.12], kerbB: [0.95, 0.95, 0.95],
      ambientSky: [0.45, 0.52, 0.62], ambientGround: [0.22, 0.22, 0.18],
      sunColor: [1, 0.95, 0.82], sunDir: [0.4, 0.72, 0.3],
    }, o);
    // Tracks historically authored fogColor; runtime reads fog.
    if (o && o.fogColor && o.fog == null) p.fog = o.fogColor;
    p.sunDir = norm(p.sunDir);   // data files store raw sunDir; normalize here
    return p;
  }
  function nightPal(o) {
    const p = Object.assign({
      zenith: [0.05, 0.06, 0.14], horizon: [0.12, 0.14, 0.24], sun: [0.4, 0.4, 0.5],
      grass: [0.14, 0.18, 0.14], runoff: [0.28, 0.26, 0.24], fog: [0.08, 0.09, 0.15],
      asphalt: [0.18, 0.19, 0.22], line: [0.9, 0.9, 0.95],
      fogDensity: 0.0023, kerbA: [0.85, 0.12, 0.12], kerbB: [0.92, 0.92, 0.92],
      ambientSky: [0.62, 0.64, 0.76], ambientGround: [0.44, 0.44, 0.48],
      sunColor: [0.7, 0.72, 0.8], sunDir: [0.1, 0.9, 0.2],
    }, o);
    if (o && o.fogColor && o.fog == null) p.fog = o.fogColor;
    p.sunDir = norm(p.sunDir);
    return p;
  }

  const DEFS = (typeof window !== "undefined" && window.TrackDefs) || [];

  // CATMULL-ROM, not linear. X/Z has always been a spline; interpolating Y
  // linearly creased the road at every one of the 64 samples, so the car crested
  // a kink each ~60 m. What a driver feels is the CHANGE of gradient, not the
  // gradient, so that read as "abrupt" even inside the baker's 8% slope clamp
  // (Brands Hatch, 2026-09-14: 8.0% max slope, 5.4% slope change per step).
  // C1 continuity here fixes it without touching the profile data; circuits
  // with no CircuitElevations entry never reach this function.
  function elevationAt(id, frac) {
    const prof = (typeof CircuitElevations !== "undefined") && CircuitElevations[id];
    if (!prof || !prof.length) return null;
    const M = prof.length, f = (((frac % 1) + 1) % 1) * M;
    const i = Math.floor(f) % M, t = f - Math.floor(f);
    if (M < 4) return prof[i] + (prof[(i + 1) % M] - prof[i]) * t;
    const p0 = prof[(i - 1 + M) % M], p1 = prof[i];
    const p2 = prof[(i + 1) % M], p3 = prof[(i + 2) % M];
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t +
                  (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
                  (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }
  function hasRealElevation(id) {
    return (typeof CircuitElevations !== "undefined") && !!(CircuitElevations[id] && CircuitElevations[id].length);
  }

  // The survey at every 4 m node, not just at the control points: a control
  // point can only carry its own height, and splining between them drew a
  // straight line across a dip under dijon's 399 m first segment (9.7 m off).
  // Each node is projected onto the source trace (a window walking forward, so
  // a hairpin's other leg is never picked) and reads the table at that ARC
  // fraction, which is independent of startFrac / reverse. The table is
  // periodic, so the lap closes without a drift correction.
  function surveyHeights(def, px, py, pz, n) {
    const P = def.path.pts, N = P.length, arc = new Float64Array(N + 1);
    for (let i = 1; i <= N; i++) arc[i] = arc[i - 1] + __M.hypot(P[i % N][0] - P[i - 1][0], P[i % N][1] - P[i - 1][1]);
    const near = (x, z, i) => {
      const a = P[i], b = P[(i + 1) % N], ex = b[0] - a[0], ez = b[1] - a[1], l2 = ex * ex + ez * ez || 1;
      const t = __M.max(0, __M.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / l2));
      const qx = a[0] + ex * t - x, qz = a[1] + ez * t - z;
      return [qx * qx + qz * qz, arc[i] + t * (arc[i + 1] - arc[i])];
    };
    let seg = 0, bd = Infinity;
    for (let i = 0; i < N; i++) { const d = near(px[0], pz[0], i)[0]; if (d < bd) { bd = d; seg = i; } }
    const dir = def.reverse ? -1 : 1, y0 = elevationAt(def.id, near(px[0], pz[0], seg)[1] / arc[N]);
    const base = py[0];
    for (let k = 0; k < n; k++) {
      let best = null, bi = seg;
      for (let o = -2; o <= 8; o++) {
        const i = (((seg + dir * o) % N) + N) % N, r = near(px[k], pz[k], i);
        if (!best || r[0] < best[0]) { best = r; bi = i; }
      }
      seg = bi;
      py[k] = base + elevationAt(def.id, best[1] / arc[N]) - y0;
    }
  }

  // def.path (the OSM trace) is the ONLY centreline: no path is a build error.
  function realPoints(id, path, baseHW) {
    if (!path || !path.pts || !path.pts.length) throw new Error("Tracks: circuit \"" + id +
      "\" has no `path` — js/circuits/" + id + ".js must carry `path: { len, pts }` (tools/track/import-circuit-path.mjs emits it)");
    const real = hasRealElevation(id);
    // The elevation tables are 64 samples by ARC fraction; reading them at the
    // point INDEX put fuji's 33 m profile 0.29 lap out of place (its 1.29 km
    // straight is one segment). Do NOT add points to carry a straight's own
    // profile: startFrac / sceneryStartFrac are INDEX fractions, and a denser
    // path rotated fuji's whole lap 217 m under its scenery (tried 2026-09-24).
    const src = path.pts;
    const N = src.length;
    const arc = new Float64Array(N + 1);
    for (let i = 1; i <= N; i++) { const a = src[i - 1], b = src[i % N]; arc[i] = arc[i - 1] + __M.hypot(b[0] - a[0], b[1] - a[1]); }
    let pts = src.map((p, i) => [p[0], real ? elevationAt(id, arc[i] / arc[N]) : 0, p[1], baseHW, 0]);
    for (let it = 0; it < 2; it++) {
      const sx = pts.map((p) => p[0]), sz = pts.map((p) => p[2]);
      const L = 0.25;
      for (let i = 0; i < N; i++) {
        const a = (i - 1 + N) % N, b = (i + 1) % N;
        pts[i][0] = sx[i] + L * ((sx[a] + sx[b]) * 0.5 - sx[i]);
        pts[i][2] = sz[i] + L * ((sz[a] + sz[b]) * 0.5 - sz[i]);
      }
    }
    if (real) {
      const eEnd = pts[N - 1][1] - pts[0][1];
      for (let i = 0; i < N; i++) pts[i][1] -= eEnd * (arc[i] / arc[N - 1]);
    }
    return pts;
  }

  function applyHwZones(pts, zones, baseHW) {
    if (!zones || !zones.length || !pts || !pts.length) return;
    const N = pts.length;
    const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
    const weightAt = (s, s0, s1, ease) => {
      // Normalise into [0,1) coverage along the zone, with eased shoulders.
      const wrap = s1 < s0;
      const inside = wrap ? (s >= s0 || s <= s1) : (s >= s0 && s <= s1);
      if (inside) return 1;
      // distance to nearest zone edge (shortest arc)
      const dEdge = (a, b) => Math.min(Math.abs(a - b), 1 - Math.abs(a - b));
      const d0 = dEdge(s, s0), d1 = dEdge(s, s1);
      const d = Math.min(d0, d1);
      if (d >= ease) return 0;
      return smooth(1 - d / ease);
    };
    for (let i = 0; i < N; i++) {
      const s = i / N;
      let hw = pts[i][3];
      let best = hw;
      for (let z = 0; z < zones.length; z++) {
        const zn = zones[z];
        if (zn.hw == null || zn.s0 == null || zn.s1 == null) continue;
        const ease = zn.ease != null ? zn.ease : 0.025;
        const w = weightAt(s, zn.s0, zn.s1, ease);
        if (w <= 0) continue;
        const blended = baseHW + (zn.hw - baseHW) * w;
        if (blended < best) best = blended;
      }
      pts[i][3] = best;
    }
  }

  const LIST = DEFS.map((d) => {
    const def = {
      id: d.id, name: d.name, gp: d.gp, country: d.country, laps: 3,
      // Fewest laps covering the regulation race distance (TrackSceneryData.GP_DISTANCE_KM).
      gpLaps: Math.ceil((TrackSceneryData.GP_DISTANCE_KM[d.id] || TrackSceneryData.GP_DISTANCE_KM.default) / (d.lengthKm || 5)),
      night: d.night, theme: d.theme, lengthKm: d.lengthKm,
      classic: !!d.classic,
      palette: (d.night ? nightPal : dayPal)(d.pal || {}),
      street: !!d.street, banked: !!d.banked, bankZones: d.bankZones || null, bridges: d.bridges || null,
      barrierGap: d.barrierGap || null,
      terrainOuter: d.terrainOuter,
      flatTerrain: !!d.flatTerrain,
      sceneryCoordinates: d.sceneryCoordinates || "legacy",
      // Read off the COPIED def by TrackSpace.lapMirror, so it has to be copied
      // here — the sixth member of the family the comment below describes. It
      // fails the same silent way: omitted, lapMirror() just reads undefined,
      // returns false, and the scenery places unmirrored on a reversed lap.
      // Singapore's Marina Bay Sands is the canary — it lands in the middle of
      // the road and modelGroup suppresses it as "footprint rejected".
      sceneryLapMirror: !!d.sceneryLapMirror,
      dressingExclusions: d.dressingExclusions || null,
      // These five are READ OFF THE COPIED DEF and so have to be copied onto
      // it. Each was authored in js/circuits/<id>.js, never copied here, and
      // therefore read as undefined at every consumer — silently, because
      // every consumer's fallback is a legitimate value:
      //   sunAzimBias           atmosphere.js — hand-tuned sun geography, inert
      //   sceneryTheme          tracks.js:~815 — Qatar fell back to `desert`,
      //                           Albert Park to `permanent`
      //   sceneryThemeOverrides tracks.js:~819 — Singapore's, always undefined
      //   ownPitStraight        tracks.js:~1816 — the generic 7-box pit fallback
      //                           kept landing on Monza's Tribuna Centrale, the
      //                           exact thing the field was added to stop
      //   undulate              buildCenterline — the opt-out could not be taken
      // This trap has bitten before and was fixed for ONE field only (see the
      // `pal` note in js/lighting/atmosphere.js); nobody swept the rest. The guard
      // in tests/unit/circuit-def-fields.test.mjs is what stops the sixth.
      // READ OFF THE COPIED DEF by js/physics/tyre-model.js severity(), so it
      // joins the family above. Omitted, it failed their exact silent way: the
      // model's fallback is a legitimate 1.0, so all seven authored circuits
      // simply behaved like the median and nothing anywhere said otherwise.
      // Caught by tests/unit/circuit-def-fields.test.mjs, which is what that
      // guard is for.
      tyreSeverity: d.tyreSeverity,
      sunAzimBias: d.sunAzimBias,
      sceneryTheme: d.sceneryTheme,
      sceneryThemeOverrides: d.sceneryThemeOverrides || null,
      ownPitStraight: !!d.ownPitStraight,
      pit: d.pit || null,          // the pit complex's authored choices (TrackPit.resolve): side, mode, limitKph, bands, bays
      undulate: d.undulate,
      // bespoke per-circuit scenery (js/circuits/<id>.js); run by buildProps
      scenery: d.scenery || null,
      elevations: hasRealElevation(d.id) ? null : (d.elevations || null),
      // Half-width overlays on the real centreline (the only way to narrow a section).
      hwZones: d.hwZones || null,
      reverse: !!d.reverse,
      startFrac: d.startFrac || 0,
      // The startFrac this circuit's RACING-space scenery, dressingExclusions
      // and corner boards were authored against — set only where the start line
      // has since been corrected onto its real position, so the line moves and
      // the dressed world stays where it was tuned. Read off the COPIED def by
      // TrackSpace.sceneryOriginDelta, so it has to be copied here: the seventh
      // member of the family the comment above describes, and it would fail the
      // same silent way, since "no shift" is a legitimate value.
      sceneryStartFrac: d.sceneryStartFrac != null ? d.sceneryStartFrac : null,
      // The def's curated FIA markings (RACING-LAP fractions, never fmap'd; no
      // sectors → thirds), real centreline and dressing rows (ex scenery-data.js
      // id tables) — all READ OFF THE BUILT DEF: the same trap as the seven above.
      sectors: d.sectors || null, turns: d.turns || null, path: d.path || null,
      lineHints: d.lineHints || null,   // authored racing-line hints per turn (TrackLine.bake)
      barrier: d.barrier || null, furniture: d.furniture || null, kit: d.kit || null,
      standSet: d.standSet || null, cityStyle: d.cityStyle || null,
    };
    // PERF-FINDINGS: boot ran realPoints for all 40 circuits (24.0 ms)
    // even though a session builds exactly one. Keep LIST.length===40 and every
    // metadata field copied as today; defer points (+ startFrac remaps /
    // elevation fmap / applyHwZones) until first access. The getter replaces
    // itself with a data property after materializing the SAME pipeline that
    // used to run inline — bit-identical once touched. Tracks.build →
    // buildCenterline calls ensurePoints so the heavy path never sees a getter.
    Object.defineProperty(def, "points", {
      configurable: true,
      enumerable: true,
      get() { return materializeListPoints(def, d); }
    });
    return def;
  });

  function materializeListPoints(def, d) {
    let pts = realPoints(d.id, def.path, d.baseHW);
    const phi = TrackSpace.wrap01(def.startFrac || 0);
    const phiAuthor = def.sceneryStartFrac != null
      ? TrackSpace.wrap01(def.sceneryStartFrac) : phi;
    if (def.reverse || phi || phiAuthor) {
      if (def.reverse || phi) {
        const P = pts, N = P.length, out = new Array(N);
        for (let i = 0; i < N; i++) out[i] = P[TrackSpace.racingNodeToSource(def, i, N)];
        pts = out;
      }
      def._startFrac = phi;
      // ELEVATION AND BRIDGE ANCHORS ARE DRESSING, NOT GEOMETRY, and they are
      // remapped against the AUTHORING origin, not the start line.
      //
      // `e.s` is remapped here as an index fraction (toRacingFrac is index
      // algebra) and then consumed by buildCenterline as an ARC fraction
      // (`e.s * total`). Control points are not arc-uniform, so that conflation
      // makes a bump's PHYSICAL position a function of startFrac — which is
      // invisible while startFrac never moves, and ruinous the moment it does.
      // Measured across the 27 corrected circuits, keying the bumps off the new
      // line slid the road surface vertically by a mean of 10.7 m at Red Bull
      // and 7.6 m at Spa (max 43 m) while X/Z stayed put to within 0.9 m — the
      // road climbing out from under its own dressing, and the reason floating
      // clusters went 29 → 44 at Monaco and 3 → 15 at Vegas.
      //
      // So freeze the mapping at the origin the bumps were tuned against and
      // let buildCenterline rotate the result by the same arc-length
      // `_sceneryShift` the scenery uses. Bit-identical output for every
      // circuit, whether or not its line moved.
      //
      // BOTH STEPS ARE REQUIRED — do not "simplify" this by dropping the
      // `+ dress` in buildCenterline. Tried 2026-08-13: it looks like a
      // double-shift and it is not. fmap is INDEX algebra about phiAuthor;
      // dress is the ARC-length distance from the new line to that origin.
      // Composed they equal "map through startFrac" in arc space, which is
      // the contract js/circuits/suzuka.js states explicitly (source 0.8125/
      // 0.0625/0.4298 -> racing 0.818/0.068/0.436). Dropping dress yields
      // 0.200/0.450/0.817 and detaches Suzuka's figure-8 bridge from the
      // crossover deck under it (verify-track.cjs rejects all three spans).
      const fmap = (s) => TrackSpace.toRacingFrac({ startFrac: phiAuthor, reverse: def.reverse }, s);
      if (def.elevations) def.elevations = def.elevations.map((e) => Object.assign({}, e, { s: fmap(e.s) }));
      if (def.bridges)    def.bridges    = def.bridges.map((b) => Object.assign({}, b, { s: fmap(b.s) }));
      if (def.hwZones && (def.reverse || phi)) {
        def.hwZones = def.hwZones.map((z) => {
          return Object.assign({}, z, TrackSpace.range(def, z.s0, z.s1, "source"));
        });
      }
    }
    // Apply after startFrac remap so authored s0/s1 stay in racing-lap space.
    if (def.hwZones) applyHwZones(pts, def.hwZones, d.baseHW);
    Object.defineProperty(def, "points", {
      value: pts, writable: true, configurable: true, enumerable: true
    });
    return pts;
  }

  // Touch-forces LIST points (and the coupled elevation/bridge/hwZones remaps).
  function ensurePoints(def) {
    return def.points;
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

  return { LIST, SEASON, seasonIndex, build, buildCenterline, sample, curvature, onKerb, banking, bankAngle, project, wallAt, terrainY, setKeepGeometry, setCompactProps, pitWindow, pitLaneAt, pitLaneSpan, inPitLane };
})();
