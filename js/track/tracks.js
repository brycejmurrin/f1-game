/* Apex 26 — Tracks engine: turns per-circuit definitions (js/circuits/<id>.js,
   registered on the global TrackDefs list) into resampled closed Catmull-Rom
   splines extruded into 3D meshes. Contract: docs/ARCHITECTURE.md.
   Depends on globals TrackDefs + CircuitPaths (data). Mesh upload goes through
   the renderer backend injected via Tracks.build's opts.gfx (the GLX/TLX/WGX
   façade), falling back to the GLX global only for the Node-VM build guard. */
const Tracks = (function () {
  "use strict";
  let keepGeometry = false;

  const WORLD_UP = [0, 1, 0];

  // Geometry primitives + the MAT material-id map live in js/track/geom.js
  // (global TrackGeom, loaded before this file — index.html and
  // tools/verify-track.cjs). MAT is re-exposed to per-track scenery() via
  // api.MAT; buildProps shadows the raw emitters with on-track rejection
  // guards (see RAW below).
  const { MAT, cross, norm, vadd, emit, addBox, addPrism, addPyramid,
          addCone, addCyl, addFrustum, addMountain } = TrackGeom;
  // Centreline / spline math lives in js/track/spline.js (global TrackSpline,
  // loaded before this file — HARD EDGE: destructured here at eval).
  const { centerline, cr, sample, curvatureRaw, curvature, project, wallAt } = TrackSpline;
  // Kerb/banking band + road/terrain/floor mesh builders live in
  // js/track/mesh.js (global TrackMesh, loaded before this file — HARD EDGE:
  // destructured here at eval).
  const { upOf, hash, findCorners, bankingProfile, bankOffsetAt, onKerb, bankAngle, banking,
          nodeGrid, buildRoad, buildTerrain, buildFloor } = TrackMesh;
  const lerp = M4.lerp, __M = Math, __isFinite = Number.isFinite;   // js/mat4.js helper + the contextified-global aliases measured above `firstNonFinite` in js/track/models.js (this file is AT its module-size ceiling — one line only)

  // ---------- build ----------
  // Cheap centreline-only build: runs just the spline engine (positions,
  // tangents, banking, map, banking profile) WITHOUT generating the road /
  // terrain / props meshes or uploading anything to the GPU. Used by TrackMaps
  // to draw the 2D minimaps without paying the full 3D build cost (24 of those
  // on the select screen was a ~16 s first-open stall).
  function buildCenterline(def) {
    ensurePoints(def);
    const P = def.points, N = P.length;
    const idx = (i) => ((i % N) + N) % N;
    // dense sampling for arc-length parameterization
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
    // close the gap length
    const closeGap = Math.hypot(dx[0] - dx[M - 1], dy[0] - dy[M - 1], dz[0] - dz[M - 1]);
    const total = dlen[M - 1] + closeGap;

    // Where the SCENERY's old start line now sits, as an arc-length fraction of
    // this lap. See TrackSpace.sceneryOriginDelta for why this cannot be
    // `startFrac - sceneryStartFrac`: those are control-point index fractions
    // and the control points are not arc-uniform. Here the arc-length table is
    // in hand, so it is a direct lookup — control point j opens at dense
    // sample j*SUB.
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
    // Localized bridges (figure-8 crossovers): raise one section into a smooth
    // deck so it passes OVER the lower section instead of clipping through it.
    // The cosine bump returns to 0 at the window edges, so the rest of the lap
    // stays flat — no global tilt.
    // The dressing rotation, in the units this function works in. resolve()
    // froze the elevation/bridge anchors at the authoring origin; here they are
    // carried forward into the new lap, exactly as the scenery is.
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
    // ---- fine surface undulation -------------------------------------------
    // The authored profile is a handful of BROAD cosine bumps — Spa carries all
    // 102 m of its elevation in four, with halfM 360-920 m. Between them the
    // road is mathematically flat: measured over 20 m windows, the MEDIAN
    // gradient on Suzuka and Monaco is 0.0%. Real circuits never are. That
    // constant small compression-and-release is most of what makes a car feel
    // alive under you, and its absence is why every circuit reads the same
    // between corners.
    //
    // Add a low-amplitude ripple: three harmonics at 30-110 m wavelengths,
    // summed so the result never repeats obviously. Written in CYCLES PER LAP
    // (integer) rather than metres so the profile is continuous across the
    // start/finish seam — a wavelength that does not divide the lap leaves a
    // step there, and the car would hit it every lap.
    //
    // Amplitude scales with the track's own relief: a circuit that already
    // climbs (Spa, Red Bull) gets a little more, a flat street circuit stays
    // nearly smooth, and nothing exceeds the 0.42 cap applied below.
    // Deterministic — seeded
    // off the circuit id — so a lap is repeatable and ghosts stay valid.
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
        // Weight RISES with wavelength: long swells carry the amplitude, short
        // ripples are small. The other way round makes the peak GRADIENT scale
        // with 1/wavelength and turns a gentle 0.4 m ripple into a 9% ramp.
        waves.push({ cycles, phase: rnd(h + 7) * Math.PI * 2, w: h + 1 });
      }
      const norm = waves.reduce((a, b) => a + b.w, 0) || 1;
      for (let k = 0; k < n; k++) {
        // Phased by the dressing shift for the same reason the bumps are: the
        // ripple is a function of lap fraction, so moving the line would slide
        // 0.4 m of road up and down under scenery that did not move. Whole
        // cycles per lap, so a constant phase offset keeps the seam continuous.
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
    // Banking profile (outer-edge lift per node). Computed once and shared by the
    // road/terrain meshes and the car/camera placement in game.js.
    track.bankP = bankingProfile(track);
    return track;
  }

  // Full build: centreline + 3D meshes (road/terrain/props/gate) uploaded to the
  // GPU. This is the heavy one — only needed to actually render/drive a circuit.
  function build(def, opts) {
    Log.info("track", "build start " + def.id + (opts && opts.night != null ? " night=" + !!opts.night : ""));
    const track = buildCenterline(def);
    // One profile drives terrain generation, floor blending, and scenery
    // grounding. Keeping it on the track also makes diagnostics deterministic.
    track.surface = TrackSurface.profile(def, track);
    // Session darkness drives whether buildings/skyline light their windows.
    // Falls back to the track's default (def.night) when not specified.
    track._night = opts && opts.night != null ? !!opts.night : !!def.night;
    // Façade wiring: the active renderer backend flows in through opts.gfx
    // (game.js passes `gfx`). This ends tracks.js's reliance on reaching the
    // GLX global directly — the injected handle is the WebGL2/TLX/WGX backend
    // actually in use. The `typeof GLX` branch is the fallback for callers that
    // don't inject one: the Node-VM build guard (tools/verify-track.cjs) and the
    // VM tests, which install a stub GLX global instead of an opts.gfx.
    const G = (opts && opts.gfx) || (typeof GLX !== "undefined" ? GLX : null);
    // Stash it so buildProps (which only takes `track`) can read mobileTier off
    // the same backend rather than the GLX global.
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
      track.meshes.floor = G.createMesh(safe("floor", buildFloor(track)));
      const roadGeo = safe("road", buildRoad(track)); roadGeo._keepPositions = true; roadGeo._keepFullGeometry = keepGeometry;
      track.roadGeo = roadGeo; buildRibbon(roadGeo, "road");
      const terrainGeo = buildTerrain(track);
      const terrainSafe = safe("terrain", terrainGeo); terrainSafe._keepPositions = true; terrainSafe._keepFullGeometry = keepGeometry;
      track.terrainGeo = terrainSafe; buildRibbon(terrainSafe, "terrain"); // raw geometry kept for groundY/debug
      const _props = buildProps(track);
      // Chunked + frustum-culled: the city/props mesh is huge (up to ~5 M verts),
      // and most of it is off-screen each frame — drawing only visible XZ cells
      // (and only shadow-casting cells inside the light frustum) is the big win.
      const propsGeo = safe("props", _props.out);
      track.propsGeo = propsGeo;
      propsGeo._keepPositions = propsGeo._keepFullGeometry = keepGeometry;
      track.meshes.props = G.createChunkedMesh ? G.createChunkedMesh(propsGeo, 72) : G.createMesh(propsGeo);
      // S3: GPU batches for nodes that skipped the props fuse. Glass stays fused
      // (reflective material). Fall back to empty if the backend has no consumer.
      track.meshes.propBatches = null;
      if (track.graph && G.createInstancedBatch) {
        const { batches } = track.graph.batches();
        if (batches.length) {
          track.meshes.propBatches = batches.map((b) =>
            G.createInstancedBatch(b.geo, b.matrices, b.colors, { cellSize: 72 }));
        }
      }
      const glassGeo = safe("glass", _props.glass);
      const waterGeo = safe("water", _props.water);
      track.glassGeo = glassGeo;
      track.waterGeo = waterGeo;
      glassGeo._keepPositions = glassGeo._keepFullGeometry = keepGeometry;
      // Glass rides the SAME chunk grid as the props: it was one un-culled
      // createMesh draw of every window pane in the whole city, every frame —
      // full clearcoat+env fill for panes behind the camera and past the fog.
      track.meshes.glass = G.createChunkedMesh ? G.createChunkedMesh(glassGeo, 72) : G.createMesh(glassGeo);
      track.meshes.water = G.createMesh(waterGeo);
      track.meshes.gate = G.createMesh(safe("gate", buildGate(track)));
      track.meshes.startline = G.createMesh(safe("startline", buildStartLine(track)));
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
    // Minimap projection: flipped over the Y (vertical) axis — x = maxx-px — so the
    // 2D outline reads the same handedness as the 3D drive view (e.g. Bahrain's
    // long straight on the left with Turn 1 to the right). y = maxz-pz (north → top).
    for (let i = 0; i < n; i += step) out.push([ox + (maxx - px[i]) * sc, oz + (maxz - pz[i]) * sc]);
    return out;
  }


  // ---------- mesh helpers ----------
  // upOf/hash/findCorners/bankingProfile/buildKerbs/onKerb/bankAngle/banking
  // (kerb + banking band) and nodeGrid/buildRoad/buildTerrain/buildFloor
  // (road/terrain/floor band) live in js/track/mesh.js (TrackMesh) —
  // destructured at the top of this module.


  // Raw (unguarded) emitters, captured so buildProps can wrap them with the
  // on-track rejection guard below while still reaching the real implementations.
  const RAW = { addBox, addCyl, addCone, addFrustum, addPrism, addPyramid, addMountain };

  // Wrap a scenery api so a bespoke scenery() authored for the forward lap places
  // correctly on a REVERSED lap (optionally with the start rotated to fraction
  // `phi`). Transforms: s-fraction s→phi-s, node index k→round(phi*n)-k, side
  // ±1→∓1. Helpers are grouped by their leading-argument signature.
  function transformSceneryApi(api, def, n) {
    const RK = (k) => TrackSpace.sceneryNode(def, k, n);
    const RS = (s) => TrackSpace.sceneryFrac(def, s);
    const SIDE = (side) => def.reverse ? -side : side;
    const w = Object.assign({}, api);
    // (k, side, ...rest): index + side based
    for (const name of ["place", "prop", "backdrop", "groundPlane", "anchor", "pine", "tree",
                        "palm", "conifer", "building", "house", "motorhome", "tower", "billboard",
                        "marshalPost", "bush", "signBoard", "ferrisWheel", "floodMast", "runoffApron",
                        "cameraTower", "broadcastCompound", "waterSurface", "bakedModel",
                        "cypress", "stonePine", "broadleafFall", "acacia", "plane"]) {
      const f = api[name]; if (f) w[name] = (k, side, ...r) => f(RK(k), SIDE(side), ...r);
    }
    // (s, side, ...rest): single fraction + side
    for (const name of ["grandstand", "grandstandEx"]) {
      const f = api[name]; if (f) w[name] = (s, side, ...r) => f(RS(s), SIDE(side), ...r);
    }
    // (s0, s1, side, ...rest): fraction RANGE + side — swap ends and mirror both
    for (const name of ["wall", "fence", "guardrail", "tyreWall", "hedge",
                        "forestEdge", "cityFront", "recordBarrier", "indexSolid",
                        "concreteCanyon",
                        "bankedKerbStrip", "bowlSeatWall", "pastelStreetRow",
                        "spectatorHill", "sponsorHoarding", "waterBand",
                        "bleacher", "scaffoldStand", "terrace", "tieredBowl"]) {
      const f = api[name]; if (f) w[name] = (s0, s1, side, ...r) => {
        const range = TrackSpace.sceneryRange(def, s0, s1);
        return f(range.s0, range.s1, SIDE(side), ...r);
      };
    }
    // (s0, s1, stepM, fn): fraction range, no side
    if (api.along) w.along = (s0, s1, ...r) => {
      const range = TrackSpace.sceneryRange(def, s0, s1);
      return api.along(range.s0, range.s1, ...r);
    };
    // (s, …): single fraction, no side (gantry / underpass portal)
    if (api.gantry) w.gantry = (s, ...r) => api.gantry(RS(s), ...r);
    if (api.underpassPortal) w.underpassPortal = (s, ...r) => api.underpassPortal(RS(s), ...r);
    // floodMastRing places BOTH sides via every() — no remapping needed
    // NOTE: node-index utilities (groundYAt, upOf) and the raw px/py/pz arrays are
    // intentionally NOT remapped — the few direct px[k]/upOf(k) reads in bespoke
    // scenery stay mutually consistent on the reversed centreline (cosmetic only).

    // ── Origin-shift / lapMirror remaps for the six leftover emitters ─────────
    // Six more entry points take a node index or a lap fraction and are absent
    // from the lists above, so they never moved with the rest: `groundPatch`
    // (35 circuits), `overheadSpan` (16), `circuitKit` (16), `groundedSegments`
    // (10), `waterField`, and the `frameAt` lookup itself. That gap is why
    // Miami's Turnpike overpass and Singapore's kit-built pit building were the
    // last two required models left in the road after the origin move.
    //
    // Default: ORIGIN SHIFT ONLY — no side flip, no reverse/mirror remap. That
    // is deliberate and conservative: the same emitters are unremapped on the
    // reverse-only circuits (monaco, kyalami, paul_ricard) TODAY, so giving
    // them the full treatment here would silently move already-shipped geometry.
    //
    // Exception: `sceneryLapMirror` circuits (singapore). Their racing anchors
    // already get mirror+shift via sceneryNode/sceneryFrac, and portal decks
    // via shift-only overheadSpan/frameAt landed ~half a lap from hand supports
    // that went through anchor(). For those defs only, apply the full RS/RK
    // remap so every fraction-keyed helper agrees with the standard group.
    //
    // `frameAt` is wrapped at the API BOUNDARY rather than at its definition on
    // purpose. models/ and the kits hold the RAW frameAt and resolve fractions
    // the caller already handed them, so shifting it at source would apply the
    // shift twice to everything routed through the wrapped calls below.
    const shiftS = TrackSpace.sceneryOriginDelta(def);
    const doMirror = !!(def.reverse && def.sceneryLapMirror);
    if (doMirror || shiftS) {
      const shiftK = Math.round(shiftS * n);
      const SK = (k) => (((Math.round(k) + shiftK) % n) + n) % n;
      const SS = (s) => TrackSpace.wrap01(s + shiftS);
      const remapK = doMirror ? RK : SK;
      const remapS = doMirror ? RS : SS;
      // groundPatch / waterField / groundedSegments stay SHIFT-ONLY even on
      // lapMirror circuits — those defs authored dressing against the shift
      // frame; flipping them with RS/RK lifts props off the terrain ribbon
      // (singapore float-audit: 1 cluster @ frac 0.531 after a full remap).
      for (const name of ["groundPatch", "waterField"]) {
        const f = api[name]; if (f) w[name] = (k, side, ...r) => f(SK(k), side, ...r);
      }
      if (api.frameAt) w.frameAt = (frac, ...r) => api.frameAt(remapS(frac), ...r);
      // `rawFrac: true` = "this frac is ALREADY final racing space — hands off".
      // Monaco's tunnel derives k from the raw racing arrays and builds its
      // walls off px/py/pz directly (deliberately unremapped); shifting only
      // the roof tears the vault ~93.6 m off its own bore (0.0284 laps). The
      // caller knows which space its frac is in; the wrapper cannot.
      if (api.overheadSpan) w.overheadSpan = (spec) => api.overheadSpan(
        spec && Number.isFinite(spec.frac) && !spec.rawFrac
          ? Object.assign({}, spec, { frac: remapS(spec.frac) }) : spec);
      if (api.groundedSegments) w.groundedSegments = (spec) => api.groundedSegments(
        spec && Array.isArray(spec.points)
          ? Object.assign({}, spec, { points: spec.points.map((pt) => Object.assign({}, pt, { k: SK(pt.k) })) })
          : spec);
      // Every CircuitKit method takes a spec keyed on `frac` (circuit-kit.js
      // routes it through deps.frameAt RAW). Keep SHIFT-ONLY remap here even on
      // lapMirror circuits — the kit's callers (singapore raceControl beacon via
      // KOLD, etc.) are authored against shift space. Full RS on the kit moved
      // the pit tower out from under its roof beacon (float gap ≈ beacon height).
      // Portal decks still get RS via overheadSpan/frameAt above.
      if (api.circuitKit) {
        const kit = api.circuitKit, wk = {};
        for (const name of Object.keys(kit)) {
          const f = kit[name];
          wk[name] = typeof f === "function"
            ? (spec, ...r) => f(spec && Number.isFinite(spec.frac)
                ? Object.assign({}, spec, { frac: SS(spec.frac) }) : spec, ...r)
            : f;
        }
        w.circuitKit = wk;
      }
    }
    return w;
  }

  function buildProps(track) {
    Log.info("track", "buildProps start " + (track.def && track.def.id));
    // Static dressing tables (barrier liveries, furniture, crowd/sign/city
    // palettes, building styles) live in js/track/scenery-data.js.
    const { NC, DC, BLD, CROWD_DAY, WINTINTS, HOUSE_WALLS, HOUSE_ROOFS,
            MOTORHOME_BODY, SIGN_SEG, SIGN_DIGIT, BARRIER, FURN, FURN_DEF,
            STYLES, THEME_DEF, ATM, COL } = TrackSceneryData;
    const { n, px, py, pz, hw } = track;
    // Mobile geometry LOD: the street-circuit city facade is the single biggest GPU
    // allocation (the props VBO is ~88 MB on Vegas, ~73 on Baku), and the detailed
    // window-pane grid dominates it. On memory-limited phones (mobileTier = a phone
    // NOT opted into GRAPHICS: HIGH) coarsen that grid, cutting ~20-24% of the props
    // verts on the dense street tracks that OOM-crash iOS — the exact jetsam trigger.
    // CITY_LOD = 1 on desktop and HIGH-tier phones ⇒ geometry is byte-identical there;
    // `lod()` only ever shrinks a count and never below its floor.
    // Façade wiring: read mobileTier off the injected backend (stashed on the
    // track by build()), falling back to the GLX global for VM/stub callers.
    const G = track._gfx || (typeof GLX !== "undefined" ? GLX : null);
    const CITY_LOD = (G && G.mobileTier) ? 0.72 : 1;
    const lod = (nn, floor) => Math.max(floor, Math.round(nn * CITY_LOD));
    // `mat` holds a per-vertex procedural-material id (0 = FLAT). `_mat` is the
    // CURRENT material register: emitters (addBox/emit) stamp it onto every vertex,
    // so a model sets `out._mat = MAT.BRICK` around a block instead of threading a
    // param through every call. Untagged geometry stays FLAT (unchanged look).
    const out = TrackModels.scratch();
    // Separate GLASS buffer: reflective window panes are emitted here and drawn
    // with a low-roughness material so the lit shader's env term mirrors the sky
    // (real view-dependent reflection, not a faked colour). Day windows only.
    const glassBuf = TrackModels.scratch();
    // Separate WATER buffer: lake/sea/marina surfaces emit here and draw with a
    // low-roughness material so the lit shader's env term mirrors the live sky
    // (real time-of-day reflection + sun glint), turning flat blue slabs into
    // reflective water. Flagged via groundPlane(..., water=true).
    const waterBuf = TrackModels.scratch();
    const def = track.def, theme = def.theme, pal = def.palette, ds = track.total / n;
    // Session darkness (set by Tracks.build from the chosen time of day) drives
    // window/skyline lighting — so buildings respond to dusk/night even on a
    // day-default circuit, and stay daytime on a night-default one raced by day.
    const NIGHT = track._night != null ? track._night : !!def.night;

    // Rendered-terrain raycast for exact prop anchoring: anchor-based props
    // (walls, fences, trees) sit on the ACTUAL carved/clipped terrain ribbon
    // rather than the closed-form groundYAt approximation, so they never float
    // or sink where the ribbon is lowered (corner-inside verges, the channel cut
    // through an elevation mound — Miami s≈0.11). Triangles are binned into a
    // coarse XZ grid so each lookup is ~O(1); huge distant triangles are skipped
    // (props are never that far out — those fall back to groundYAt).
    const _tg = track.terrainGeo;
    // Numeric packed cell key (no per-triangle/per-lookup string garbage), same
    // scheme as glx.createChunkedMesh: (cx+OFFSET)*STRIDE + (cz+OFFSET).
    const _CELL = 6, _GOFF = 2048, _GSTR = 4096;
    const _gkey = (cx, cz) => (cx + _GOFF) * _GSTR + (cz + _GOFF);
    let _grid = null;
    const _buildGrid = () => {
      _grid = new Map(); const pos = _tg.pos, idx = _tg.idx;
      for (let t = 0; t < idx.length; t += 3) {
        const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
        const mnx = __M.min(pos[a], pos[b], pos[c]), mxx = __M.max(pos[a], pos[b], pos[c]);
        const mnz = __M.min(pos[a + 2], pos[b + 2], pos[c + 2]), mxz = __M.max(pos[a + 2], pos[b + 2], pos[c + 2]);
        if (mxx - mnx > 30 || mxz - mnz > 30) continue;
        for (let cx = __M.floor(mnx / _CELL); cx <= __M.floor(mxx / _CELL); cx++)
          for (let cz = __M.floor(mnz / _CELL); cz <= __M.floor(mxz / _CELL); cz++) {
            const key = _gkey(cx, cz); let arr = _grid.get(key); if (!arr) { arr = []; _grid.set(key, arr); } arr.push(t);
          }
      }
    };
    const terrainYAt = (x, z) => {
      if (!_tg || !_tg.idx) return null;
      if (!_grid) _buildGrid();
      const arr = _grid.get(_gkey(__M.floor(x / _CELL), __M.floor(z / _CELL)));
      if (!arr) return null;
      const pos = _tg.pos; let best = null;
      for (const t of arr) {
        const ia = _tg.idx[t] * 3, ib = _tg.idx[t + 1] * 3, ic = _tg.idx[t + 2] * 3;
        const ax = pos[ia], az = pos[ia + 2], bx = pos[ib], bz = pos[ib + 2], cx = pos[ic], cz = pos[ic + 2];
        const v0x = cx - ax, v0z = cz - az, v1x = bx - ax, v1z = bz - az, v2x = x - ax, v2z = z - az;
        const d00 = v0x * v0x + v0z * v0z, d01 = v0x * v1x + v0z * v1z, d11 = v1x * v1x + v1z * v1z, d20 = v2x * v0x + v2z * v0z, d21 = v2x * v1x + v2z * v1z;
        const den = d00 * d11 - d01 * d01; if (__M.abs(den) < 1e-9) continue;
        const u = (d11 * d20 - d01 * d21) / den, vv = (d00 * d21 - d01 * d20) / den;
        if (u < -0.01 || vv < -0.01 || u + vv > 1.01) continue;
        const y = pos[ia + 1] + u * (pos[ic + 1] - pos[ia + 1]) + vv * (pos[ib + 1] - pos[ia + 1]);
        if (best === null || y > best) best = y;
      }
      return best;
    };

    // ===================================================================
    // Hard guarantee: NO scenery primitive may sit on the racing surface.
    // Every shape — the helpers below AND the raw emitters handed to each
    // circuit's bespoke scenery() — funnels through these guarded wrappers.
    // Before emitting, a primitive's ground footprint is tested against the
    // tarmac at road height; if it covers any part of the road it is dropped
    // whole, so a misplaced or self-overlapping prop (common on street
    // circuits whose straights run close in world space) can never enclose the
    // chase camera or wall off the track. Sub-grade slabs (water, the universal
    // ground floor) sit below road level and are exempt via the topY check.
    // ===================================================================
    let _culled = 0;
    const _suppressed = Object.create(null);
    const noteSuppressed = (kind, msg) => {
      _suppressed[kind] = (_suppressed[kind] || 0) + 1;
      if (Log.enabled("scenery", Log.DEBUG)) Log.debug("scenery", msg);
    };
    const diagnostics = track.modelDiagnostics = {
      emitted: [], suppressed: [], invalid: [], unsafe: [],
    };

    // ---------- semantic prop registry ----------
    // Everything buildProps places goes straight into vertex buffers and is then
    // anonymous: the footprint list and spatial hash below are function-local and
    // die with this call, so after a build nothing can answer "is there a
    // grandstand on my left". The renderer's 72 m chunk AABBs locate scenery MASS
    // but cannot name it.
    //
    // note() records the semantic placements only — a tree, a building, a
    // grandstand — NOT every primitive. Vegas emits ~94k primitives; a tree alone
    // is a trunk plus several canopy tiers, so recording primitives would cost far
    // more and say far less. Consumed by __apex.scene() (js/game/agentview.js).
    //
    // Recording happens at the point of emission, AFTER each emitter's on-track
    // and mass-collision guards, so a suppressed prop never enters the registry —
    // the list describes what actually stands there.
    const PROP_CAP = 40000;
    const propList = [];
    let propDropped = 0;
    // The placement currently claiming emitted primitives, and where it stands.
    // A composite model is many primitives (a tree is a trunk plus four cones),
    // so ownership runs until the next note() or until emission moves away.
    let curRec = null, curAnchor = null;
    const OWN_R = 20;
    const note = (kind, c, size, extra) => {
      if (propList.length >= PROP_CAP) { propDropped++; return; }
      const r1 = (v) => Math.round(v * 10) / 10;
      const rec = { kind, x: r1(c[0]), y: r1(c[1]), z: r1(c[2]),
                    w: r1(size[0]), h: r1(size[1]), d: r1(size[2]) };
      if (extra) { for (const key in extra) rec[key] = extra[key]; }
      propList.push(rec);
      // Own the primitives that follow, so the record ends up with MEASURED
      // bounds instead of the nominal envelope the call site guessed. Those
      // guesses were consistently wrong in the same direction: a 20 m pine was
      // recorded 9 m wide against a real ~5.4 m canopy, which closed up the sky
      // in frame()'s raster and over-stated every proximity query.
      curRec = rec; curAnchor = [c[0], c[1], c[2]];
    };
    // Linear features — armco, catch fencing, tyre walls, boundary walls — are
    // emitted by along() in 3–6 m steps. Recording each step would bury the
    // registry in thousands of near-identical records and describe the world
    // worse: "armco on the left from 1.20 to 1.55 km" IS the object. They carry
    // an arc-length span instead of a world point.
    const spanList = [];
    const noteSpan = (kind, s0, s1, side, gap, extra) => {
      if (spanList.length >= PROP_CAP) { propDropped++; return; }
      const r3 = (v) => Math.round(v * 1000) / 1000;
      const rec = { kind, s0: r3(s0), s1: r3(s1), side, gap: Math.round(gap * 10) / 10 };
      if (extra) { for (const key in extra) rec[key] = extra[key]; }
      spanList.push(rec);
    };

    // ---------- unnamed geometry ----------
    // The named emitters above cover the shared toolkit, but each circuit's
    // bespoke scenery() also calls the raw guarded emitters directly, and on a
    // street circuit that is most of the world: measured against the shipped
    // primitives, the named registry alone describes 85% of Monza and only 21%
    // of Vegas. Those 68k unnamed boxes are the casino frontages, the pit
    // complex, the grandstand backs — the things an agent most needs to know are
    // there.
    //
    // Recording each primitive is not an option (that IS the vertex buffer, just
    // more expensive). Instead, consecutive primitives that stay within
    // ASSEMBLY_R of the running centroid are accumulated into one anonymous
    // structure with a combined box, and flushed when the emission jumps
    // somewhere else. Primitives are emitted assembly-by-assembly, so spatial
    // adjacency in emission order is a good proxy for "one thing".
    const ASSEMBLY_R = 30;
    const ASSEMBLY_MAX = 4000;      // primitives before a run is cut regardless
    // ...and a hard cap on the BOX. The centroid is a running mean, so a long
    // facade or treeline drifts it a little at a time and never trips the 30 m
    // test — the box then grows to hundreds of metres and stops describing a
    // thing. A loose hull that big is worse than useless downstream: frame()
    // paints it solid and one "structure" swallows the whole view.
    const ASSEMBLY_EXTENT = 70;
    let asm = null;
    const flushAsm = () => {
      if (!asm || asm.count < 4) { asm = null; return; }
      if (propList.length < PROP_CAP) {
        const r1 = (v) => Math.round(v * 10) / 10;
        const hull = Math.max(asm.x1 - asm.x0, 0.1) * Math.max(asm.y1 - asm.y0, 0.1)
                   * Math.max(asm.z1 - asm.z0, 0.1);
        propList.push({
          kind: "structure", parts: asm.count,
          fill: Math.round(Math.min(1, asm.vol / hull) * 100) / 100,
          x: r1((asm.x0 + asm.x1) / 2), y: r1((asm.y0 + asm.y1) / 2),
          z: r1((asm.z0 + asm.z1) / 2),
          w: r1(asm.x1 - asm.x0), h: r1(asm.y1 - asm.y0), d: r1(asm.z1 - asm.z0),
        });
      } else propDropped++;
      asm = null;
    };
    // Called by the guarded emitters with the primitive's axis-aligned extent.
    // Rotation is ignored — a conservative box is enough to say "something this
    // big stands here", and computing the true oriented hull per primitive would
    // cost more than the answer is worth.
    const absorb = (x0, y0, z0, x1, y1, z1) => {
      if (!(x0 <= x1) || !__isFinite(x0) || !__isFinite(y1)) return;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      // Attribute to the named placement that is still in range.
      if (curRec && __M.abs(cx - curAnchor[0]) <= OWN_R
                 && __M.abs(cz - curAnchor[2]) <= OWN_R) {
        const m = curRec._m || (curRec._m = { x0, y0, z0, x1, y1, z1 });
        if (x0 < m.x0) m.x0 = x0; if (x1 > m.x1) m.x1 = x1;
        if (y0 < m.y0) m.y0 = y0; if (y1 > m.y1) m.y1 = y1;
        if (z0 < m.z0) m.z0 = z0; if (z1 > m.z1) m.z1 = z1;
        return;
      }
      curRec = null;
      if (asm && (__M.abs(cx - asm.cx) > ASSEMBLY_R
                  || __M.abs(cz - asm.cz) > ASSEMBLY_R
                  || asm.count >= ASSEMBLY_MAX
                  || __M.max(x1, asm.x1) - __M.min(x0, asm.x0) > ASSEMBLY_EXTENT
                  || __M.max(z1, asm.z1) - __M.min(z0, asm.z0) > ASSEMBLY_EXTENT)) flushAsm();
      if (!asm) { asm = { x0, y0, z0, x1, y1, z1, cx, cz, count: 0, vol: 0 }; }
      // Summed primitive volume vs the hull's. A real building fills its box; a
      // scatter of lamp bases and fence posts spread over 30 m fills almost none
      // of it. Consumers that treat the box as solid — frame()'s occlusion
      // raster above all — need to know which they are holding.
      asm.vol += __M.max(x1 - x0, 0.05) * __M.max(y1 - y0, 0.05) * __M.max(z1 - z0, 0.05);
      if (x0 < asm.x0) asm.x0 = x0; if (x1 > asm.x1) asm.x1 = x1;
      if (y0 < asm.y0) asm.y0 = y0; if (y1 > asm.y1) asm.y1 = y1;
      if (z0 < asm.z0) asm.z0 = z0; if (z1 > asm.z1) asm.z1 = z1;
      asm.count++;
      // running centroid keeps a long facade run from anchoring on its first box
      asm.cx += (cx - asm.cx) / asm.count;
      asm.cz += (cz - asm.cz) / asm.count;
    };
    // A named placement ends whatever anonymous run was in progress, so its own
    // primitives are not folded into the neighbouring structure.
    const absorbBox = (c, sz) => absorb(c[0] - sz[0] / 2, c[1] - sz[1] / 2, c[2] - sz[2] / 2,
                                        c[0] + sz[0] / 2, c[1] + sz[1] / 2, c[2] + sz[2] / 2);
    const absorbUp = (c, r, h) => absorb(c[0] - r, c[1], c[2] - r,
                                         c[0] + r, c[1] + h, c[2] + r);

    track.props = { list: propList, spans: spanList, cap: PROP_CAP,
                    get count() { return propList.length; },
                    get spanCount() { return spanList.length; },
                    get dropped() { return propDropped; } };
    const finiteVec = (v, len, positive) =>
      Array.isArray(v) && v.length === len && v.every((x) => __isFinite(x) && (!positive || x > 0));
    const grid = nodeGrid(track);              // shared node grid (built in buildRoad)
    const _hitCand = new Array(n), _trkCand = new Array(n);   // reusable query scratch
    // True if a footprint covers the tarmac at any node it rises above. A
    // circular footprint is given by rad>0 at (cx,cz); otherwise an oriented
    // rectangle with unit XZ axes (arx,arz)/(afx,afz) and half-extents hx,hz.
    const onRoadHit = (cx, cz, topY, rad, arx, arz, afx, afz, hx, hz) => {
      // Only nodes within the footprint's max reach (evaluated at maxHw) can be
      // covered — query the shared grid instead of scanning all n nodes. This is
      // the O(prims·n) hot path (one call per emitted city pane). OR semantics,
      // so candidate order is irrelevant; the per-node test below is unchanged.
      const mh = grid.maxHw;
      const R = (rad > 0 ? rad + mh : __M.hypot(hx + mh, hz + mh)) + 2;
      const _cn = grid.query(cx, cz, R, _hitCand, false);
      for (let _ci = 0; _ci < _cn; _ci++) {
        const k = _hitCand[_ci];
        if (topY < py[k] - 0.3) continue;                 // sits below road here
        const w = hw[k];
        const dxc = px[k] - cx, dzc = pz[k] - cz;
        // Reach to the farthest footprint point: an oriented box can extend to its
        // half-DIAGONAL, not just max(hx,hz), so the prefilter must use the diagonal
        // or it will skip road nodes a large rotated box actually covers.
        // Far reject: the Minkowski test below expands the footprint by w on each
        // axis, so the prefilter reach must use the EXPANDED half-extents (a thin
        // box's hit corner can sit at hypot(hx+w, hz+w) from centre).
        const reach = (rad > 0 ? rad + w : __M.hypot(hx + w, hz + w)) + 2;
        if (dxc * dxc + dzc * dzc > reach * reach) continue;   // cheap far reject
        // Minkowski test: expand the footprint by the road half-width `w` and ask
        // whether the road CENTRE-line node falls inside it. This catches a prop
        // overhanging the tarmac even when the prop is THIN and oblique — e.g. a
        // tall building's narrow side face (0.5 m across) that sweeps over a
        // CURVING stretch of track. The previous version sampled five points
        // ACROSS the road and tested point-in-box; a 0.5 m-wide slab crossing the
        // road between those samples slipped through and walled the track off at
        // corners (Miami back-straight cityFront, etc.). Expanding the box by the
        // road radius and testing the single centre point is exact for that case
        // and cheaper (one test per node instead of five).
        const ex = px[k] - cx, ez = pz[k] - cz;
        if (rad > 0) {
          // circle footprint vs road capsule of radius w
          const rr = rad + w;
          if (ex * ex + ez * ez <= rr * rr) return true;
        } else {
          // oriented rectangle expanded by w on each axis
          const a = __M.abs(ex * arx + ez * arz), b = __M.abs(ex * afx + ez * afz);
          if (a <= hx + w && b <= hz + w) return true;
        }
      }
      return false;
    };
    const rejBox = (c, sz, basis) => {
      const r = basis ? basis[0] : [1, 0, 0], u = basis ? basis[1] : [0, 1, 0], f = basis ? basis[2] : [0, 0, 1];
      const topY = c[1] + __M.abs(sz[0] / 2 * r[1]) + __M.abs(sz[1] / 2 * u[1]) + __M.abs(sz[2] / 2 * f[1]);
      return onRoadHit(c[0], c[2], topY, 0, r[0], r[2], f[0], f[2], sz[0] / 2, sz[2] / 2);
    };
    const rejRad = (c, rad, h, basis) => {
      const u = basis ? basis[1] : [0, 1, 0];
      const topY = c[1] + __M.max(0, h * u[1]) + rad;     // generous top estimate
      return onRoadHit(c[0], c[2], topY, rad, 0, 0, 0, 0, 0, 0);
    };
    // Guarded wrappers shadow the raw emitter names for the whole of buildProps
    // (helpers + the api passed to def.scenery). Each returns false when dropped
    // so a caller can also skip its barrier record (e.g. place/building).
    const badPrimitive = (kind, c, size) => {
      diagnostics.invalid.push({ id: kind, reason: "non-finite primitive dimensions", center: c, size });
      return false;
    };
    // `_dryRun` / `_absorbOnly` honour graph.instance's prefer-instance path:
    // dry = guard only (no cull tally — the real pass tallies); absorbOnly =
    // terrain seating without triangles for GPU-instanced full nodes.
    const addBox = (o, c, sz, col, basis) => {
      if (!finiteVec(c, 3, false) || !finiteVec(sz, 3, true)) return badPrimitive("box", c, sz);
      if (rejBox(c, sz, basis)) { if (!o._dryRun) _culled++; return false; }
      if (o._dryRun) return true;
      if (o._absorbOnly) { absorbBox(c, sz); return true; }
      RAW.addBox(o, c, sz, col, basis); absorbBox(c, sz); return true;
    };
    const addCyl = (o, c, rad, h, col, seg, basis) => {
      if (!finiteVec(c, 3, false) || !__isFinite(rad) || rad <= 0 || !__isFinite(h) || h <= 0) return badPrimitive("cylinder", c, [rad, h]);
      if (rejRad(c, rad, h, basis)) { if (!o._dryRun) _culled++; return false; }
      if (o._dryRun) return true;
      if (o._absorbOnly) { absorbUp(c, rad, h); return true; }
      RAW.addCyl(o, c, rad, h, col, seg, basis); absorbUp(c, rad, h); return true;
    };
    const addCone = (o, c, rad, h, col, seg, basis) => {
      if (!finiteVec(c, 3, false) || !__isFinite(rad) || rad <= 0 || !__isFinite(h) || h <= 0) return badPrimitive("cone", c, [rad, h]);
      if (rejRad(c, rad, h, basis)) { if (!o._dryRun) _culled++; return false; }
      if (o._dryRun) return true;
      if (o._absorbOnly) { absorbUp(c, rad, h); return true; }
      RAW.addCone(o, c, rad, h, col, seg, basis); absorbUp(c, rad, h); return true;
    };
    const addFrustum = (o, c, rB, rT, h, col, seg, basis) => {
      if (!finiteVec(c, 3, false) || !__isFinite(rB) || rB <= 0 || !__isFinite(rT) || rT <= 0 || !__isFinite(h) || h <= 0) return badPrimitive("frustum", c, [rB, rT, h]);
      if (rejRad(c, __M.max(rB, rT), h, basis)) { if (!o._dryRun) _culled++; return false; }
      if (o._dryRun) return true;
      if (o._absorbOnly) { absorbUp(c, __M.max(rB, rT), h); return true; }
      RAW.addFrustum(o, c, rB, rT, h, col, seg, basis);
      absorbUp(c, __M.max(rB, rT), h); return true;
    };
    const addPrism = (o, c, sz, col, basis) => {
      if (!finiteVec(c, 3, false) || !finiteVec(sz, 3, true)) return badPrimitive("prism", c, sz);
      if (rejBox(c, sz, basis)) { if (!o._dryRun) _culled++; return false; }
      if (o._dryRun) return true;
      if (o._absorbOnly) { absorbBox(c, sz); return true; }
      RAW.addPrism(o, c, sz, col, basis); absorbBox(c, sz); return true;
    };
    const addPyramid = (o, c, sz, col, basis) => {
      if (!finiteVec(c, 3, false) || !finiteVec(sz, 3, true)) return badPrimitive("pyramid", c, sz);
      if (rejBox(c, sz, basis)) { if (!o._dryRun) _culled++; return false; }
      if (o._dryRun) return true;
      if (o._absorbOnly) { absorbBox(c, sz); return true; }
      RAW.addPyramid(o, c, sz, col, basis); absorbBox(c, sz); return true;
    };
    const addMountain = (o, c, baseR, h, opts) => {
      if (!finiteVec(c, 3, false) || !__isFinite(baseR) || baseR <= 0 || !__isFinite(h) || h <= 0) return badPrimitive("mountain", c, [baseR, h]);
      if (onRoadHit(c[0], c[2], c[1] + h, baseR, 0, 0, 0, 0, 0, 0)) { _culled++; return false; }
      RAW.addMountain(o, c, baseR, h, opts); absorbUp(c, baseR, h); return true;
    };
    // ---------- scene graph ----------
    // The model library + node list for this build (js/track/graph.js). A
    // migrated helper calls instance() instead of emitting primitives inline:
    // the model's ops are recorded ONCE in canonical space, then replayed here
    // through the guarded emitters above. Same guards, same geometry — but the
    // build now also leaves behind a description of WHAT stands WHERE, which is
    // what an instanced renderer and the agent view both want and neither can
    // recover from fused triangles.
    const graph = TrackGraph.create({ raw: RAW });
    track.graph = graph;
    const GUARDED = { addBox, addCyl, addCone, addFrustum, addPrism, addPyramid };
    // Unguarded replay set, for emitters that already bypass the on-road test on
    // purpose — crowd spectators are thousands of tiny boxes sitting safely
    // behind a stand's shell, and testing each one is pure cost. RAW.* returns
    // nothing, so wrap to report the primitive as landed; routing these through
    // GUARDED instead would silently start culling geometry that ships today.
    const rawOk = (fn) => (o, ...rest) => {
      if (o && (o._dryRun || o._absorbOnly)) return true;
      fn(o, ...rest); return true;
    };
    const UNGUARDED = {
      addBox: rawOk(RAW.addBox), addCyl: rawOk(RAW.addCyl), addCone: rawOk(RAW.addCone),
      addFrustum: rawOk(RAW.addFrustum), addPrism: rawOk(RAW.addPrism), addPyramid: rawOk(RAW.addPyramid),
    };
    // instance(key, place, build, meta, opts?) — returns the number of primitives
    // that survived the guards (0 = wholly suppressed, so the caller skips its
    // note()). opts.buf targets a different accumulator than the props soup:
    // window panes route their unlit half to glassBuf so it draws with the
    // reflective material. opts.unguarded picks the RAW set above.
    // Default props soup sets `_preferInstance` only when the backend can
    // actually draw batches (GLX/WGX/TLX). Headless verify/float-audit stubs
    // omit createInstancedBatch so they keep a full fuse — otherwise support
    // cells vanish from the soup and every roof reads as floating.
    const instance = (key, place, build, meta, opts) => {
      const buf = (opts && opts.buf) || out;
      const emit = opts && opts.unguarded ? UNGUARDED : GUARDED;
      if (buf === out && G && G.createInstancedBatch) buf._preferInstance = true;
      const n = graph.instance(key, place, build, meta, emit, buf);
      if (buf === out) buf._preferInstance = false;
      return n;
    };

    // Per-segment driving boundary (lateral limit from the centreline on each
    // side). Initialised to the default runoff, then TIGHTENED wherever a solid
    // barrier (wall/guardrail/tyre wall/grandstand) is actually placed, so the car
    // always stops just before a model instead of clipping into it. WALL_CLEAR is
    // the car's half-width + margin: the limit sits that far inside the barrier
    // face. recordBarrier() fills the boundary along a barrier's node range.
    const WALL_CLEAR = 1.1;
    const RUNOFF_DEFAULT = 9;   // loose default; tightened wherever a barrier sits
    track.barL = new Float32Array(n);
    track.barR = new Float32Array(n);
    for (let k = 0; k < n; k++) { track.barL[k] = hw[k] + RUNOFF_DEFAULT; track.barR[k] = hw[k] + RUNOFF_DEFAULT; }
    // Tighten one node's boundary on a side to a barrier at clearance `gap`.
    const markBarrier = (k, side, gap) => {
      const lim = Math.max(hw[k] - 1.2, hw[k] + gap - WALL_CLEAR);
      const arr = side > 0 ? track.barR : track.barL;
      if (lim < arr[k]) arr[k] = lim;
    };
    // Record a SOLID roadside model so the car stops before it: inner face at
    // `innerGap` beyond the road edge, spanning ±halfM metres along the track.
    // Only tightens where the model is within reach, so models out past the
    // runoff have no effect.
    const blockAt = (k, side, innerGap, halfM) => {
      const half = Math.max(0, Math.round((halfM || 0) / ds));
      for (let d = -half; d <= half; d++) markBarrier(((k + d) % n + n) % n, side, innerGap);
    };
    // Lowest track elevation. Large flat terrain planes (water, sand, lakes) and
    // tall distant backdrops (dunes, ridges, hills) are anchored to this baseline
    // rather than a single point's py — otherwise, on tracks with elevation
    // changes, a plane anchored at a high point floats above the view as a
    // "ceiling" or rises into the foreground as a wall when seen from a lower
    // section. Anchoring the base low keeps terrain below the road everywhere.
    let pyMin = Infinity;
    for (let i = 0; i < n; i++) if (py[i] < pyMin) pyMin = py[i];
    // Terrain surface height `dist` metres beyond the road edge at node k. Mirrors
    // the ribbon built in buildTerrain: the inner verts hug the road, the outer
    // ones ease (quadratically) down to the lap's low point. Roadside props anchor
    // to THIS instead of the road height, so on an elevated or embanked section
    // they sit on the sloping ground rather than floating at the old flat grade.
    const surface = track.surface || TrackSurface.profile(track.def, track);
    const groundYAt = (k, dist) => {
      return surface.heightAt(k, dist);
    };
    // Universal ground floor: one big flat slab at the lap's low point, sized to
    // reach well past the farthest scenery. The terrain ribbon only extends ~120 m
    // from the road, so without this, distant hills/skylines would sit over open
    // sky (reading as "floating"). Tucked just under the ribbon's far edge so it
    // only shows through the gap beyond it. Coloured from the circuit's ground.
    // WGX: skip — this fused props box is the brown chase void (hard lamp
    // triangles on two 1600 m faces). Distant fill is the floor mesh instead.
    if (!(G && typeof G.roadLutReady === "function")) {
      let gx = 0, gz = 0;
      for (let i = 0; i < n; i++) { gx += px[i]; gz += pz[i]; }
      gx /= n; gz /= n;
      let grad = 0;
      for (let i = 0; i < n; i++) grad = Math.max(grad, Math.hypot(px[i] - gx, pz[i] - gz));
      const gc = pal.grass || [0.2, 0.38, 0.18];
      // top sits at pyMin-3 — below the terrain ribbon's far edge and the water
      // planes (~pyMin-2.4) so it fills the gap without hiding lakes/sea.
      addBox(out, [gx, pyMin - 5, gz], [grad * 2 + 1600, 4, grad * 2 + 1600],
             [gc[0] * 0.9, gc[1] * 0.9, gc[2] * 0.9]);
    }
    // True if (x,z) lies on (or within `margin` of) the tarmac of ANY track
    // segment. Uses segment lateral distance (closest point on centerline →
    // perpendicular distance) rather than per-node circles, so hairpin interiors
    // don't create false-positive blobs that swallow outside-of-corner scenery.
    const onTrack = (x, z, margin) => {
      // A segment can only pass if one of its endpoints is within maxHw+margin+
      // segLen (a chord ≤ ds) of (x,z); query that neighbourhood of the shared
      // grid and test each candidate's forward segment. OR semantics — order
      // irrelevant; the per-segment test is unchanged.
      const R = grid.maxHw + margin + ds + 1;
      const _cn = grid.query(x, z, R, _trkCand, false);
      for (let _ci = 0; _ci < _cn; _ci++) {
        const i = _trkCand[_ci];
        const j = (i + 1) % n;
        const dx = px[j] - px[i], dz = pz[j] - pz[i];
        const len2 = dx * dx + dz * dz;
        if (len2 < 0.01) continue;
        const t = Math.max(0, Math.min(1, ((x - px[i]) * dx + (z - pz[i]) * dz) / len2));
        const cx = px[i] + t * dx, cz = pz[i] + t * dz;
        const lat = Math.hypot(x - cx, z - cz);
        const hwt = hw[i] + (hw[j] - hw[i]) * t;
        if (lat < hwt + margin) return true;
      }
      return false;
    };
    const frameAt = (frac) => {
      const k = Math.round(TrackSpace.wrap01(frac) * n) % n;
      return {
        k, c: [px[k], py[k], pz[k]],
        r: [track.rx[k], track.ry[k], track.rz[k]],
        u: upOf(track, k),
        t: [track.tx[k], track.ty[k], track.tz[k]],
        hw: hw[k],
      };
    };
    const models = TrackModels.create({
      out, water: waterBuf, diagnostics, n,
      preflight: (bounds) => !rejBox(bounds.center, bounds.size, bounds.basis),
      emitBox: (buf, c, size, col, basis) => RAW.addBox(buf, c, size, col, basis),
      frameAt,
      supportClear: (frame, spec) => {
        if (spec.supports === false) return true;
        const gap = spec.supportGap != null ? spec.supportGap : 1.5;
        const width = spec.supportWidth != null ? spec.supportWidth : 0.8;
        const height = Math.max(1, spec.clearance || 5);
        for (const side of [-1, 1]) {
          const o = side * (frame.hw + gap + width / 2);
          const c = [
            frame.c[0] + frame.r[0] * o + frame.u[0] * height / 2,
            frame.c[1] + frame.r[1] * o + frame.u[1] * height / 2,
            frame.c[2] + frame.r[2] * o + frame.u[2] * height / 2,
          ];
          if (rejBox(c, [width, height, spec.depth || 1.4], [frame.r, frame.u, frame.t])) return false;
        }
        return true;
      },
      groundHeight: groundYAt,
      groundPoint: (k, side, dist, y) => {
        const i = ((Math.round(k) % n) + n) % n;
        const r = [track.rx[i], track.ry[i], track.rz[i]];
        const o = side * (hw[i] + dist);
        return [px[i] + r[0] * o, y, pz[i] + r[2] * o];
      },
    });
    let sceneryTheme = null, landmarkKit = null, circuitKit = null;
    try {
      if (typeof SceneryThemes !== "undefined" && SceneryThemes &&
          typeof SceneryThemes.resolve === "function") {
        const themeName = def.sceneryTheme ||
          (def.street ? "street" : def.theme === "desert" ? "desert" : "permanent");
        sceneryTheme = SceneryThemes.resolve(
          themeName,
          def.sceneryThemeOverrides,
          { night: NIGHT, weather: track._weather || "dry" },
        );
      }
      if (sceneryTheme && typeof LandmarkKit !== "undefined" && LandmarkKit &&
          typeof LandmarkKit.create === "function") {
        landmarkKit = LandmarkKit.create({
          box: (stage, c, size, color, basis) => addBox(stage, c, size, color, basis),
          prism: (stage, c, size, color, basis) => addPrism(stage, c, size, color, basis),
          cylinder: (stage, c, radius, height, color, seg, basis) =>
            addCyl(stage, c, radius, height, color, seg, basis),
          frustum: (stage, c, rB, rT, h, color, seg, basis) =>
            addFrustum(stage, c, rB, rT, h, color, seg, basis),
        });
      }
      if (sceneryTheme && landmarkKit && typeof CircuitKit !== "undefined" && CircuitKit &&
          typeof CircuitKit.create === "function") {
        circuitKit = CircuitKit.create({
          models, landmarks: landmarkKit, theme: sceneryTheme,
          frameAt, groundHeight: groundYAt, hash,
        });
      }
    } catch (_) {
      sceneryTheme = landmarkKit = circuitKit = null;
    }
    const modelGroup = (id, bounds, emit, opts) => models.modelGroup(id, bounds, emit, opts);

    // ── Vertical placement helpers (docs/SCENERY-GROUNDING.md) ──────────────
    // Every guard in this file is HORIZONTAL (onTrack/rejBox/blockAt keep props
    // off the racing line); nothing asserted that a prop meets the ground, and
    // every floating-scenery defect found by tools/float-audit.cjs was vertical.
    // These three close that gap by expressing intent instead of arithmetic.
    const UPV = [0, 1, 0];

    // seat.*: emit a primitive standing ON `foot` — the point it rests on.
    // addBox/addPyramid centre their `c` while addPrism/addCyl/addCone/
    // addFrustum anchor at the BASE, and callers treating them alike produced
    // seven separate floating-roof defects. Going through seat.* makes that
    // mistake unexpressible: one convention, every primitive.
    const seat = {
      box:     (o, foot, sz, col, b) => addBox(o, vadd(foot, (b ? b[1] : UPV), sz[1] / 2), sz, col, b),
      prism:   (o, foot, sz, col, b) => addPrism(o, foot, sz, col, b),
      cyl:     (o, foot, rad, h, col, seg, b) => addCyl(o, foot, rad, h, col, seg, b),
      cone:    (o, foot, rad, h, col, seg, b) => addCone(o, foot, rad, h, col, seg, b),
      frustum: (o, foot, r0, r1, h, col, seg, b) => addFrustum(o, foot, r0, r1, h, col, seg, b),
    };

    // foundation(): fill from `top` down to the LOWEST ground under the
    // footprint. Samples corners AND centre, because a single groundYAt() reuse
    // across a wide model assumes flat ground (Imola's village stood 47 m clear
    // of its hillside that way). Sinks below grade so the seam never shows and
    // inherits addBox's on-track rejection.
    const foundation = (o, spec) => {
      spec = spec || {};
      const c = spec.center, size = spec.size, top = spec.top;
      if (!c || !size || !Number.isFinite(top)) return false;
      const b = spec.basis || [[1, 0, 0], UPV, [0, 0, 1]];
      const r = b[0], f = b[2];
      let lo = Infinity;
      for (const sx of [-0.5, 0, 0.5]) for (const sf of [-0.5, 0, 0.5]) {
        const x = c[0] + r[0] * sx * size[0] + f[0] * sf * size[1];
        const z = c[2] + r[2] * sx * size[0] + f[2] * sf * size[1];
        // terrainYAt skips triangles wider than 30 m when it bins the ribbon.
        // flatTerrain shelves (Montreal's 70 m island) are exactly that size,
        // so the build-time lookup returns null and the caller fallback sits
        // on the anchor — 2.7 m above the same mesh Tracks.terrainY / the
        // foundation spec then samples. Prefer the public sampler when the
        // coarse grid misses.
        let y = terrainYAt(x, z);
        if (y == null) y = terrainY(track, x, z);
        if (y != null && y < lo) lo = y;
      }
      if (!Number.isFinite(lo)) lo = Number.isFinite(spec.ground) ? spec.ground : NaN;
      if (!Number.isFinite(lo)) return false;
      const embed = spec.embed != null ? spec.embed : 0.6;
      const h = (top - lo) + embed;
      if (h <= 0.05) return false;
      return addBox(o, [c[0], lo - embed + h / 2, c[2]],
                    [size[0], h, size[1]], spec.col || [0.42, 0.43, 0.47], b);
    };

    // cantilever(): a head offset from a mast MUST carry a visible member.
    // Hungaroring's lamps omitted the arm and 168 heads hovered beside bare
    // poles — the exact signature float-audit reports.
    const cantilever = (o, top, outM, side, headSz, headCol, armCol, b) => {
      const rr = b ? b[0] : [1, 0, 0];
      const reach = Math.abs(outM);
      if (reach > 0.35)
        // Overrun both ends by 0.25 m so the member genuinely meets the mast at
        // one end and the head at the other — an arm that merely touches can
        // still read (and audit) as a gap.
        addBox(o, vadd(top, rr, side * outM / 2), [reach + 0.5, 0.18, 0.22],
               armCol || [0.30, 0.30, 0.34], b);
      addBox(o, vadd(top, rr, side * outM), headSz, headCol, b);
    };
    const overheadSpan = (spec) => models.overheadSpan(spec);
    const waterSurface = (k, side, gap, sz, col, opts) => {
      opts = opts || {};
      if (!finiteVec(sz, 3, true)) {
        diagnostics.invalid.push({ id: opts.id || "water", reason: "invalid water dimensions", size: sz });
        return false;
      }
      const r = [track.rx[k], track.ry[k], track.rz[k]];
      const o = side * (hw[k] + gap + sz[0] / 2);
      const center = [px[k] + r[0] * o, pyMin - 0.8 - sz[1] / 2, pz[k] + r[2] * o];
      if (onTrack(center[0], center[2], sz[0] / 2 + 4)) {
        diagnostics.suppressed.push({ id: opts.id || "water", required: !!opts.required, reason: "footprint rejected" });
        return false;
      }
      return models.waterSurface({ id: opts.id || `water-${k}`, center, size: sz, color: col, required: opts.required });
    };
    // A continuous sheet of water rasterised from FINE cells, instead of a
    // handful of big slabs. waterSurface() places one box per call and rejects
    // the WHOLE box if any part of it is near the road, with a sz/2+4 margin —
    // so a 46 m panel needs 27 m of clearance and a basin built from them ends
    // up as scattered rectangles separated by wide bare bands wherever the lap
    // folds back through the water. Same region here, but stepped in `cell`
    // metre squares: rejection is per-cell, so the sheet closes right up to the
    // road edge and the holes shrink to the road corridor itself.
    //
    // Cells follow the track's own frame (each along-step re-reads that node's
    // right vector), so the basin curves with the shoreline instead of being an
    // axis-aligned rectangle. Colour is ONE sea tone with a small per-cell
    // drift — the old code alternated two tones on a checkerboard, which is
    // most of what made the water read as tiles rather than as a surface.
    // The region is described in TRACK space (a window along the lap, a span
    // outward) but rasterised onto a fixed WORLD-XZ grid. Both halves matter.
    // Stepping in track space and emitting world-axis-aligned boxes does not
    // tile: the outward rays fan apart as the radius grows, so the basin breaks
    // into separated squares a hundred metres out even though every step was
    // uniform at the centreline. Splatting the track-space samples onto a world
    // grid and emitting one box per occupied cell makes neighbours abut exactly
    // by construction, at any curvature. Occupied cells are then merged into
    // flat quad runs, so the output is a sheet rather than a field of tiles.
    // Rasterise one node run into occupied world-grid cells. kFrom/kTo are raw
    // (may exceed n; wrapped here) so a caller can express either a window
    // around a station or a whole band of lap.
    const waterRaster = (kFrom, kTo, side, gap0, gap1, c) => {
      const step = c / 2;                       // sample finer than the grid
      const cells = new Map();
      for (let a = kFrom; a <= kTo; a++) {
        const k0 = ((a % n) + n) % n, k1 = (((a + 1) % n) + n) % n;
        for (let d = gap0; d <= gap1; d += step) {
          const o0 = side * (hw[k0] + d), o1 = side * (hw[k1] + d);
          const x0 = px[k0] + track.rx[k0] * o0, z0 = pz[k0] + track.rz[k0] * o0;
          const x1 = px[k1] + track.rx[k1] * o1, z1 = pz[k1] + track.rz[k1] * o1;
          // Walk the gap to the NEXT node's ray. On a corner that gap is many
          // times the centreline node spacing; subdividing it is what stops the
          // fan from opening holes in the outer basin.
          const sub = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / step));
          for (let i = 0; i < sub; i++) {
            const t = i / sub;
            const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
            cells.set(Math.floor(x / c) + "|" + Math.floor(z / c), 1);
          }
        }
      }
      return cells;
    };
    // Merge occupied cells into flat quad runs and emit them as the water sheet.
    const waterEmit = (cells, c, col, opts) => {
      opts = opts || {};
      // Keep only the cells that clear the road. Margin is the cell's own
      // half-width plus a small lip, NOT a fixed constant — that is what lets a
      // fine grid close right up to the kerb where a 46 m slab needed 27 m of
      // clearance and dropped out entirely.
      const rows = new Map();                   // iz -> sorted list of ix
      for (const key of cells.keys()) {
        const p = key.indexOf("|");
        const ix = +key.slice(0, p), iz = +key.slice(p + 1);
        if (onTrack((ix + 0.5) * c, (iz + 0.5) * c, c / 2 + 1.5)) continue;
        let a = rows.get(iz); if (!a) rows.set(iz, a = []);
        a.push(ix);
      }
      // Emit ONE merged sheet, not one box per cell. Per-cell boxes are what
      // made this read as a grid: each carried its own side walls and its own
      // shade, so every cell boundary was a visible edge. Runs of adjacent
      // cells in a row collapse into a single flat quad at a single colour, so
      // within a run there is no interior geometry at all and nothing to see
      // but water. Coplanar neighbouring runs leave no seam either.
      const y = pyMin - 0.8;
      const vert0 = waterBuf.pos.length / 3;
      let placed = 0;
      for (const [iz, list] of rows) {
        list.sort((a, b) => a - b);
        for (let i = 0; i < list.length; ) {
          let j = i;
          while (j + 1 < list.length && list[j + 1] === list[j] + 1) j++;
          const x0 = list[i] * c, x1 = (list[j] + 1) * c;
          const z0 = iz * c, z1 = (iz + 1) * c;
          emit(waterBuf, [[x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0]],
               col, [(x0 + x1) / 2, y - 10, (z0 + z1) / 2]);
          placed++;
          i = j + 1;
        }
      }
      // Record the SUCCESS too, not just the failure. This path only ever pushed
      // to `suppressed`, so a water band that built perfectly left no trace in
      // the ledger at all — it was neither emitted nor suppressed nor invalid.
      // Anything asking "did this model ship?" therefore got `false` for every
      // raster water body in the game, whatever happened. modelGroup and
      // waterSurface both log an `emitted` entry; this is the same record, with
      // the merged-run count that is this path's unit of work.
      if (placed && opts.id)
        diagnostics.emitted.push({ id: opts.id, required: !!opts.required,
                                   vertices: waterBuf.pos.length / 3 - vert0,
                                   water: true, runs: placed });
      if (!placed && opts.required)
        diagnostics.suppressed.push({ id: opts.id || "waterfield", required: true, reason: "no cell placed" });
      return placed;
    };
    // A basin around ONE station: ±halfLen metres of lap, gap0→gap1 outward.
    const waterField = (k, side, gap0, gap1, halfLen, cell, col, opts) => {
      const c = Math.max(4, cell || 12);
      const half = Math.max(1, Math.round(halfLen / ds));
      return waterEmit(waterRaster(k - half, k + half, side, gap0, gap1, c), c, col, opts);
    };
    // A continuous band of water along a RANGE of lap, s0→s1. This is the right
    // shape for a coastline: the old pattern of dropping N fixed panels at
    // evenly spaced fractions left the sea in stripes whenever the station
    // spacing exceeded the panel length (jeddah spaced 8 panels 278 m apart and
    // made them 100 m long, so two thirds of its Red Sea frontage was bare).
    const waterBand = (s0, s1, side, gap0, gap1, cell, col, opts) => {
      const c = Math.max(4, cell || 12);
      const k0 = Math.round(s0 * n) % n, k1 = Math.round(s1 * n) % n;
      const span = Math.abs(s1 - s0) >= 1 - 1e-9 ? n - 1 : ((k1 - k0) + n) % n;
      return waterEmit(waterRaster(k0, k0 + span, side, gap0, gap1, c), c, col, opts);
    };
    const groundPatch = (k, side, gap, sz, col, opts) => {
      opts = opts || {};
      if (!finiteVec(sz, 3, true)) {
        diagnostics.invalid.push({ id: opts.id || "ground-patch", reason: "invalid ground-patch dimensions", size: sz });
        return false;
      }
      const r = [track.rx[k], track.ry[k], track.rz[k]], u = upOf(track, k);
      const t = [track.tx[k], track.ty[k], track.tz[k]], pieces = Math.max(2, Math.round(opts.samples || 4));
      const midDist = gap + sz[0] / 2;
      const mid = [px[k] + r[0] * side * (hw[k] + midDist), groundYAt(k, midDist), pz[k] + r[2] * side * (hw[k] + midDist)];
      const emitted = modelGroup(opts.id || `ground-patch-${k}`, {
        center: mid, size: sz, basis: [r, u, t],
      }, (stage) => {
        const partW = sz[0] / pieces;
        for (let i = 0; i < pieces; i++) {
          const dist = gap + partW * (i + 0.5);
          const c = [
            px[k] + r[0] * side * (hw[k] + dist),
            groundYAt(k, dist) - sz[1] / 2,
            pz[k] + r[2] * side * (hw[k] + dist),
          ];
          RAW.addBox(stage, c, [partW, sz[1], sz[2]], col, [r, u, t]);
        }
      }, opts);
      if (emitted && opts.collision) {
        const halfFrac = (sz[2] / 2) / track.total;
        recordBarrier(k / n - halfFrac, k / n + halfFrac, side, gap);
      }
      return emitted;
    };
    const groundedSegments = (spec) => models.groundedSegments(spec);
    // Flat [x0,z0,x1,z1,halfW,…] run of every SOLID scenery footprint recorded
    // this build, in world XZ. A barrier face is a bare line (halfW 0); a solid
    // model — hedge, grandstand, building, placed prop — is the same line
    // inflated by its own half-width, so a clearance query accounts for the
    // obstacle's real bulk and not just the plane of one face.
    const barSegs = [];
    const SEG = 5;                      // stride of one barSegs record
    // (The widest-half-width accumulator that used to live here is gone —
    // barrierClear()'s cell sweep no longer widens by it. See the proof at that
    // call site: barGridInsert already buckets by inflated bounds, so the
    // allowance was being counted on both sides of the lookup.)
    // Append, and keep the spatial index LIVE rather than dropping it. Nulling
    // barGrid here made the next barrierClear() re-bucket every segment, and
    // hedge() is a query-then-dirty pair by construction (scenery-nature.js
    // queries the clearance, then indexSolid()s its own footprint) — so a
    // circuit calling hedge() in a loop rebuilt a monotonically growing index
    // once per call. Measured on redbull, which calls hedge() ~170 times from
    // inside every(36): 171 rebuilds, 938,569 segments re-bucketed, ~1.0 s, 41%
    // of its prop build. Incremental insert honours the same invariant the null
    // was protecting ("queries run mid-scenery") — the grid is never stale,
    // because it is never behind.
    const pushSeg = (x0, z0, x1, z1, w) => {
      const i = barSegs.length;
      barSegs.push(x0, z0, x1, z1, w);
      if (barGrid) barGridInsert(i);
    };
    // Tighten the driving boundary along a solid barrier placed from lap-fraction
    // s0→s1 on `side` at clearance `gap` beyond the road edge. Skips nodes where
    // the barrier geometry would be suppressed (a parallel stretch of track), so
    // we never raise a phantom wall the player can't see.
    // `tighten` separates the two things this used to conflate. Feeding the
    // spatial index is about where SOLID GEOMETRY stands; tightening barL/barR
    // is about where the CAR is allowed to go. They are not the same question,
    // and a catch fence is the case that proves it: it is solid enough that a
    // tree must not grow through it, but it sits back beyond the runoff, so
    // moving the driving limit out to meet it would change how the circuit
    // drives. indexBarrier() registers the geometry without touching physics.
    const scanBarrier = (s0, s1, side, gap, tighten) => {
      const k0 = Math.round(s0 * n) % n, k1 = Math.round(s1 * n) % n;
      // 0→1 denotes a complete lap. Modulo node conversion maps both endpoints
      // to zero, so preserve the authored full-range intent before wrapping.
      const span = Math.abs(s1 - s0) >= 1 - 1e-9 ? n - 1 : ((k1 - k0) + n) % n;
      const arr = side > 0 ? track.barR : track.barL;
      let prev = null;                  // previous recorded face point, for segments
      for (let i = 0; i <= span; i++) {
        const k = (k0 + i) % n;
        const r = [track.rx[k], track.ry[k], track.rz[k]];
        const o = side * (hw[k] + gap);
        const fx = px[k] + r[0] * o, fz2 = pz[k] + r[2] * o;
        if (onTrack(fx, fz2, 0.3)) { prev = null; continue; }
        if (tighten) {
          const lim = Math.max(hw[k] - 1.2, hw[k] + gap - WALL_CLEAR);
          if (lim < arr[k]) arr[k] = lim;
        }
        // Feed the spatial index below. `prev` resets on a suppressed node so we
        // never bridge a segment across a gap where no barrier is actually built.
        if (prev) pushSeg(prev[0], prev[1], fx, fz2, 0);
        prev = [fx, fz2];
      }
    };
    const recordBarrier = (s0, s1, side, gap) => scanBarrier(s0, s1, side, gap, true);
    const indexBarrier = (s0, s1, side, gap) => scanBarrier(s0, s1, side, gap, false);
    // Register a SOLID model's footprint (not just a face) so foliage and other
    // placement guards can see it. `s0→s1` on `side`, its inner face `gap`
    // beyond the road edge, `width` across. The recorded centreline sits half a
    // width out from the inner face and carries width/2 as its half-width, so
    // barrierClear() measures from the model's SURFACE. Purely geometric — it
    // never touches barL/barR, exactly like indexBarrier().
    const indexSolid = (s0, s1, side, gap, width) => {
      const halfW = Math.max(0, (width || 0) / 2);
      const k0 = Math.round(s0 * n) % n, k1 = Math.round(s1 * n) % n;
      const span = Math.abs(s1 - s0) >= 1 - 1e-9 ? n - 1 : ((k1 - k0) + n) % n;
      let prev = null;
      for (let i = 0; i <= span; i++) {
        const k = (k0 + i) % n;
        const o = side * (hw[k] + gap + halfW);
        const cx = px[k] + track.rx[k] * o, cz = pz[k] + track.rz[k] * o;
        if (onTrack(cx, cz, 0.3)) { prev = null; continue; }
        if (prev) pushSeg(prev[0], prev[1], cx, cz, halfW);
        prev = [cx, cz];
      }
    };
    // Point form, for a single boxy prop at node k rather than a run. `halfLen`
    // is its extent along the track, `halfW` across; the record is the box's
    // own centre line inflated by halfW.
    const indexSolidAt = (k, side, dist, halfW, halfLen) => {
      const kk = ((k % n) + n) % n;
      const o = side * (hw[kk] + dist);
      const cx = px[kk] + track.rx[kk] * o, cz = pz[kk] + track.rz[kk] * o;
      const L = Math.max(0, halfLen || 0);
      const tx = track.tx[kk] * L, tz = track.tz[kk] * L;
      pushSeg(cx - tx, cz - tz, cx + tx, cz + tz, Math.max(0, halfW || 0));
    };
    // ── Building-mass occupancy ───────────────────────────────────────────
    // Buildings come from three independent producers — cityFront's row, the
    // neonTower front/back rows, and bespoke per-track calls — and none of them
    // knows what the others already placed. Each steps by CENTRELINE arc
    // length while standing metres out from the road edge, where the true world
    // chord shrinks by (1 - curvature*distance), so on a street circuit's
    // corners their footprints simply share volume (baku: 8 m between adjacent
    // facades, 11.5 m between a row unit and a tower).
    //
    // Re-spacing the rows was tried and made things WORSE fleet-wide (478 ->
    // 488 severe interpenetration spots): narrowing a unit moves its centre,
    // which just relocates the collision to a different producer. So don't
    // re-space — let the mass that got there first WIN, and make the later one
    // yield. `massBlocked` answers "is this footprint already occupied", and
    // the caller drops it.
    //
    // Footprints are oriented rectangles; the test is a cheap separating-axis
    // check on the two rectangles' own axes (exact for the rectangle-vs-
    // rectangle case, unlike an AABB, which on a diagonal street over-reports
    // by metres and would delete half the skyline).
    // Spatial mass index (world XZ) — same CELL pattern as barSegs below.
    // PERF-FINDINGS: flat masses made massBlocked O(buildings²); SAT stays exact,
    // only candidate gathering is culled by the grid.
    const masses = [];
    const MASS_CELL = 24;
    let massGrid = null;
    const massCellKey = (cx, cz) => cx * 100003 + cz;
    const massGridInsert = (i) => {
      const m = masses[i], r = m.r;
      const cx0 = Math.floor((m.c[0] - r) / MASS_CELL), cx1 = Math.floor((m.c[0] + r) / MASS_CELL);
      const cz0 = Math.floor((m.c[2] - r) / MASS_CELL), cz1 = Math.floor((m.c[2] + r) / MASS_CELL);
      for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
        const key = massCellKey(cx, cz);
        let b = massGrid.get(key); if (!b) massGrid.set(key, b = []);
        b.push(i);
      }
    };
    const buildMassGrid = () => {
      massGrid = new Map();
      for (let i = 0; i < masses.length; i++) massGridInsert(i);
    };
    const massBlocked = (c, w, d, b, shrink) => {
      const ax = b[0], az = b[2];
      const hw1 = w / 2 * (shrink || 1), hd1 = d / 2 * (shrink || 1);
      if (!massGrid) buildMassGrid();
      if (!massGrid.size) return false;
      // Insert buckets by m.r; query by our half-extents — same inflated-AABB
      // proof as barrierClear (reach = hw1+hd1 misses nothing that circle-rejects).
      const reach = hw1 + hd1;
      const cx0 = Math.floor((c[0] - reach) / MASS_CELL), cx1 = Math.floor((c[0] + reach) / MASS_CELL);
      const cz0 = Math.floor((c[2] - reach) / MASS_CELL), cz1 = Math.floor((c[2] + reach) / MASS_CELL);
      for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
        const bucket = massGrid.get(massCellKey(cx, cz)); if (!bucket) continue;
        for (let j = 0; j < bucket.length; j++) {
          const m = masses[bucket[j]];
          const dx = c[0] - m.c[0], dz = c[2] - m.c[2];
          if (dx * dx + dz * dz > (hw1 + hd1 + m.r) * (hw1 + hd1 + m.r)) continue;
          let sep = false;
          for (const A of [[ax[0], ax[2]], [az[0], az[2]], [m.ax[0], m.ax[2]], [m.az[0], m.az[2]]]) {
            const L = Math.hypot(A[0], A[1]) || 1;
            const ux = A[0] / L, uz = A[1] / L;
            const p1 = hw1 * Math.abs(ax[0] * ux + ax[2] * uz) + hd1 * Math.abs(az[0] * ux + az[2] * uz);
            const p2 = m.hw * Math.abs(m.ax[0] * ux + m.ax[2] * uz) + m.hd * Math.abs(m.az[0] * ux + m.az[2] * uz);
            if (Math.abs(dx * ux + dz * uz) > p1 + p2) { sep = true; break; }
          }
          if (!sep) return true;
        }
      }
      return false;
    };
    const massAdd = (c, w, d, b) => {
      const i = masses.length;
      masses.push({ c: [c[0], c[1], c[2]], hw: w / 2, hd: d / 2,
                    ax: b[0], az: b[2], r: Math.hypot(w / 2, d / 2) });
      // Keep the grid CURRENT (massBlocked runs mid-scenery while rows keep
      // landing) — same incremental contract as pushSeg → barGridInsert.
      if (massGrid) massGridInsert(i);
    };
    // ── Spatial barrier index (world XZ) ──────────────────────────────────
    // Every existing guard in this engine is horizontal-vs-ROAD (onTrack,
    // rejBox, blockAt) or vertical (the support/grounding tests). None is
    // horizontal-vs-BARRIER — which is why tree crowns still grow through
    // catch fences. barL/barR cannot close that gap: they hold the DRIVING
    // limit, a per-node LATERAL number, so (a) a close fence records a SMALL
    // clearance and clamping against it can only ever push a prop out to the
    // 9 m runoff default, never past the fence, and (b) a barrier belonging to
    // a DIFFERENT part of the lap — Suzuka's pit straight running alongside
    // the Esses verge, Spa's Raidillon wrapping back onto Kemmel — is not
    // expressible in a per-node lateral table at all. Both cases are the same
    // question asked in the wrong space. Here the barrier's actual face is
    // stored as world-space SEGMENTS, so the query is a plain point-to-segment
    // distance that neither knows nor cares which node a wall came from.
    const BAR_CELL = 24;                // grid cell (m) — comfortably > any canopy
    // Built lazily on the first query, then kept CURRENT by pushSeg — which is
    // the only writer of barSegs, so the grid can never fall behind it.
    // forestEdge() queries mid-scenery, while barriers are still being
    // registered around it; a grid merely cached once would go stale and
    // silently under-report for everything planted afterwards.
    let barGrid = null;
    const barCellKey = (cx, cz) => cx * 100003 + cz;
    // Bucket ONE record. Shared by the full build and by pushSeg's incremental
    // insert, so both place a segment in exactly the same cells.
    const barGridInsert = (i) => {
      const x0 = barSegs[i], z0 = barSegs[i + 1], x1 = barSegs[i + 2], z1 = barSegs[i + 3];
      // Bucket by the INFLATED bounds: a wide record (a grandstand, a
      // building) reaches into cells its centre line never enters, and a
      // query in one of those cells must still find it.
      const w = barSegs[i + 4];
      const cx0 = Math.floor((Math.min(x0, x1) - w) / BAR_CELL), cx1 = Math.floor((Math.max(x0, x1) + w) / BAR_CELL);
      const cz0 = Math.floor((Math.min(z0, z1) - w) / BAR_CELL), cz1 = Math.floor((Math.max(z0, z1) + w) / BAR_CELL);
      for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
        const key = barCellKey(cx, cz);
        let b = barGrid.get(key); if (!b) barGrid.set(key, b = []);
        b.push(i);
      }
    };
    const buildBarGrid = () => {
      barGrid = new Map();
      for (let i = 0; i < barSegs.length; i += SEG) barGridInsert(i);
    };
    // Distance² from (x,z) to segment i of barSegs.
    const segDist2 = (i, x, z) => {
      const x0 = barSegs[i], z0 = barSegs[i + 1];
      const dx = barSegs[i + 2] - x0, dz = barSegs[i + 3] - z0;
      const len2 = dx * dx + dz * dz;
      let t = len2 > 1e-9 ? ((x - x0) * dx + (z - z0) * dz) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = x - (x0 + dx * t), ez = z - (z0 + dz * t);
      return ex * ex + ez * ez;
    };
    // True when NO recorded barrier face lies within `r` metres of (x,z).
    const barrierClear = (x, z, r) => {
      if (!barGrid) buildBarGrid();
      if (!barGrid.size) return true;
      // Each record carries its own half-width, so the test is against the
      // obstacle's SURFACE: clear iff distance to its centre line exceeds
      // r + halfW.
      //
      // The sweep does NOT need widening by barMaxHalf, because barGridInsert
      // already buckets every record by its INFLATED bounds (min-w .. max+w on
      // both axes) — the widening was double-counting the same allowance on
      // both sides of the lookup. Proof that reach = r misses nothing: suppose
      // record i is a hit, segDist2(i,p) < (r+w)^2, and let q be the closest
      // point on its centre line to p, so |q-p| < r+w. q lies within the
      // segment's axis ranges, so the square [q +/- w] is contained in the
      // record's inflated AABB and every cell it touches holds record i. Each
      // axis component of q-p is < r+w, so that square overlaps the query
      // square [p +/- r] on BOTH axes, hence they share a point, hence a cell —
      // a cell that is inside the r-sweep and holds the record. The one
      // precondition is that barGridInsert is the only writer of the grid,
      // which the note above (and buildBarGrid / pushSeg being its only
      // callers) already establishes.
      //
      // barMaxHalf is 6-10 m on the shipped scenery against BAR_CELL 24 and
      // r 3-8, so the sweep goes from ~4-9 cells to 1-4 on every query. The
      // callers are clearTreeDist (up to 9 walk-outs PER TREE) and hedge()'s
      // per-along-step probe, i.e. the barrier-index path that already has one
      // recorded second-scale defect against it (see the note at pushSeg).
      const reach = r;
      const cx0 = Math.floor((x - reach) / BAR_CELL), cx1 = Math.floor((x + reach) / BAR_CELL);
      const cz0 = Math.floor((z - reach) / BAR_CELL), cz1 = Math.floor((z + reach) / BAR_CELL);
      for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
        const b = barGrid.get(barCellKey(cx, cz)); if (!b) continue;
        for (let j = 0; j < b.length; j++) {
          const i = b[j], rr = r + barSegs[i + 4];
          if (segDist2(i, x, z) < rr * rr) return false;
        }
      }
      return true;
    };
    // Walk a candidate tree OUTWARD (never inward — inward is the road) until
    // its crown clears every recorded barrier face. Returns the adjusted trunk
    // distance, or null when nothing within reach is clear, in which case the
    // caller drops the tree: a missing tree in a gap with no room for one reads
    // as correct, a tree growing through a catch fence never does.
    const clearTreeDist = (k, side, dist, crown) => {
      const kk = ((k % n) + n) % n;
      const rx = track.rx[kk], rz = track.rz[kk];
      const at = (dd) => {
        const o = side * (hw[kk] + dd);
        return [px[kk] + rx * o, pz[kk] + rz * o];
      };
      // Barrier-clear AND road-clear, against the WHOLE lap. The distance is
      // measured from the anchor segment's edge, but a park circuit loops back
      // on itself: buenos_aires planted woodland 30 m off one straight and a
      // tree landed with its canopy 8.8 m from the CENTRELINE of the parallel
      // stretch across the loop — 3.5 m of foliage over that road's verge.
      // onTrack() is the world-space test against every segment, so a spot
      // that clears its own road but overhangs another one is rejected the
      // same way a fence conflict is: push out, or drop the tree.
      const ok = (p) => barrierClear(p[0], p[1], crown) && !onTrack(p[0], p[1], crown);
      let p = at(dist);
      if (ok(p)) return dist;
      for (let extra = 1.5; extra <= 12; extra += 1.5) {
        p = at(dist + extra);
        if (ok(p)) return dist + extra;
      }
      return null;
    };
    const place = (k, side, dist, sz, col) => {
      const r = [track.rx[k], track.ry[k], track.rz[k]];
      const t = [track.tx[k], track.ty[k], track.tz[k]];
      const u = upOf(track, k);
      // prop() places by CLEARANCE — it passes gap + sz[0]/2 — so two props at
      // the same station with the same gap land their inner faces on exactly the
      // same plane whatever their size. Same plane, same facing, zero gap: they
      // flicker against each other at any distance, and roadside props sit close
      // enough to the car to be very visible. Break the tie with a sub-decimetre
      // nudge keyed to the BOX SIZE as well as the station, so two differently
      // sized props at one station separate (two identical ones are a duplicate,
      // not a tie). Always OUTWARD, so nothing moves nearer the track, and
      // blockAt/indexSolidAt below keep the unnudged `dist` — the driving limit
      // does not move and stays conservative.
      const jitter = hash(k * 7.7 + sz[0] * 3.1 + sz[1] * 5.3 + sz[2] * 1.9) * 0.09;
      const o = side * (hw[k] + dist + jitter);
      const cx = px[k] + r[0] * o, cz = pz[k] + r[2] * o;
      // skip if this prop would overlap a parallel stretch of track
      if (onTrack(cx, cz, sz[0] / 2 + 1.5)) {
        noteSuppressed("place", `place SUPPRESSED at k=${k} side=${side}: dist=${dist} sz[0]=${sz[0]} (need dist>${(sz[0]/2+1.5).toFixed(1)})`);
        return;
      }
      // sink the base 0.8m below grade so prop bottoms tuck under the terrain
      // apron instead of co-planar Z-fighting where box meets ground. Anchored to
      // the terrain height at this lateral distance (not the road) so it sits on
      // the ground on elevated/embanked sections.
      // RENDERED terrain first: groundYAt is a closed-form cross-section and
      // drifts metres from the ribbon where `elevations` bend it (madrid's dip
      // at s=0.52 left the generic marshal post 4.3 m off its own ground).
      const gy = terrainYAt(cx, cz);
      const c = [cx, (gy !== null ? gy : groundYAt(k, dist)) + sz[1] / 2 - 0.8, cz];
      if (addBox(out, c, sz, col, [r, u, t]) === false) return;   // on-track: dropped, no phantom barrier
      note("prop", c, sz, { k, side });
      // solid box → the car must stop before its inner face (sz[0] across, sz[2] long)
      blockAt(k, side, dist - sz[0] / 2, sz[2] / 2);
      // …and the scenery engine must know a solid body physically stands here,
      // which blockAt does NOT say — it only moves the driving limit. Without
      // this, roadside foliage happily grows straight through every placed prop.
      indexSolidAt(k, side, dist, sz[0] / 2, sz[2] / 2);
    };
    // One lighting family: "lamps" canonical; "floodlights"/"lighting" aliases.
    const LIGHTING_KINDS = { lamps: 1, floodlights: 1, lighting: 1 };
    // Origin-invariant alias for RANDOM DRAWS only (placement still uses k).
    // Keeps scatter stable when startFrac moves — without it coplanar baselines jumped.
    const HKSHIFT = Math.round(TrackSpace.sceneryOriginDelta(def) * n);
    const HK = (k) => (((Math.round(k) - HKSHIFT) % n) + n) % n;
    // Phase every() by the same shift so the walk revisits the same places.
    const every = (m, fn) => {
      const stp = Math.max(1, Math.round(m / ds));
      for (let i = 0; i < n; i += stp) fn((i + HKSHIFT) % n);
    };
    const dressingExcluded = (kind, k, side) => {
      const rules = def.dressingExclusions;
      if (!rules || !rules.length) return false;
      const frac = (((k % n) + n) % n) / n;
      // These spans are RACING-space fractions authored beside the scenery they
      // protect ("no foliage across the pits"), so they travel with it when a
      // corrected start line moves the origin — otherwise the exclusion stays
      // put and the pit buildings it shielded grow trees again.
      const shift = TrackSpace.sceneryOriginDelta(def);
      for (const rule of rules) {
        const kinds = rule.kinds || (rule.kind ? [rule.kind] : ["all"]);
        let hit = kinds.includes("all") || kinds.includes(kind);
        // Any lighting-family rule matches any lighting-family query.
        if (!hit && LIGHTING_KINDS[kind]) hit = kinds.some((knd) => LIGHTING_KINDS[knd]);
        if (!hit) continue;
        if (rule.side != null && side != null && Number(rule.side) !== Number(side)) continue;
        const s0 = TrackSpace.wrap01((rule.s0 == null ? 0 : rule.s0) + shift);
        const s1 = TrackSpace.wrap01((rule.s1 == null ? 1 : rule.s1) + shift);
        const full = rule.s0 == null || rule.s1 == null || Math.abs(Number(rule.s1) - Number(rule.s0)) >= 1 - 1e-9;
        const inside = full || (s1 < s0 ? frac >= s0 || frac <= s1 : frac >= s0 && frac <= s1);
        if (inside) return true;
      }
      return false;
    };

    // --- safe-placement helpers (the rules learned from Monaco/Vegas walls) ---
    // prop(): place a roadside object by CLEARANCE. `gap` is how far the box's
    // inner face sits beyond the road edge, so however wide the box is it can
    // never reach the tarmac and loom as a wall against the car. Inherits
    // place()'s onTrack overlap guard and base-sink.
    const prop = (k, side, gap, sz, col) => place(k, side, gap + sz[0] / 2, sz, col);
    // groundPlane(): a large flat feature (water / sand / paddock apron) whose
    // top sits just below the LOCAL track height at k — never the global minimum,
    // which on elevation-changing circuits floats up as a ceiling or rises as a
    // wall. Skipped if it would overlap any stretch of track.
    const groundPlane = (k, side, gap, sz, col, water) => {
      return water
        ? waterSurface(k, side, gap, sz, col, { id: `ground-plane-water-${k}` })
        : groundPatch(k, side, gap, sz, col, { id: `ground-plane-${k}`, samples: 4 });
    };
    // backdrop(): a distant scenery box (skyline, hills, dunes) on the horizon.
    // Tall things go far enough back that they never clip the viewport edge, and
    // onTrack keeps them off any parallel stretch. Anchored to local py[k].
    // Box is track-aligned ([t,u,r] basis) so its large face always runs parallel
    // to the road — a forward camera only ever sees the thin sz[2] edge, never
    // the full sz[0]×sz[1] face regardless of the track's world-space heading.
    const backdrop = (k, side, dist, sz, col) => {
      const r = [track.rx[k], track.ry[k], track.rz[k]];
      const t = [track.tx[k], track.ty[k], track.tz[k]];
      const u = upOf(track, k);
      const o = side * (hw[k] + dist);
      const cx = px[k] + r[0] * o, cz = pz[k] + r[2] * o;
      if (onTrack(cx, cz, sz[0] / 2 + 6)) {
        Log.info("track", `backdrop SUPPRESSED at k=${k} side=${side}: dist=${dist} sz[0]=${sz[0]}`);
        return;
      }
      // distant scenery settles to the lap's low baseline (groundYAt past the last
      // ribbon vert returns it), so a ridge/skyline never floats on a high section
      const cy0 = groundYAt(k, dist) + sz[1] / 2 - 2;
      const greenDom = col[1] > col[0] && col[1] > col[2] * 1.05;
      // GREEN terrain → render as a ROUNDED organic mound (stacked frustums +
      // dome cap) instead of a boxy slab, so wooded hills read as hills. Radius
      // from the footprint; height from sz[1]. A small hash jitter keeps a run
      // of mounds from looking like identical bumps.
      if (greenDom) {
        const foot = groundYAt(k, dist) - 2;
        const R = Math.max(sz[0], sz[2]) * 0.5 * (0.92 + hash(k * 2.3 + side) * 0.2);
        const H = sz[1] * (0.9 + hash(k * 3.7 + side * 1.3) * 0.35);
        const c1 = [col[0], col[1], col[2]];
        const c3 = [col[0] * 0.92, col[1] * 0.94, col[2] * 0.92];   // shaded crown
        out._mat = MAT.FOLIAGE;
        addFrustum(out, [cx, foot, cz], R, R * 0.5, H * 0.5, c1, 7);  // rounded base
        addCone(out,    [cx, foot + H * 0.5, cz], R * 0.5, H * 0.5, c3, 7);  // dome cap
        out._mat = 0;
        return;
      }
      const isBld = sz[1] > 26 && sz[1] > sz[2];
      // Night skyline walls get a small glow floor so they aren't black planes.
      const bcol = (isBld && NIGHT)
        ? [Math.max(col[0], 0.20), Math.max(col[1], 0.19), Math.max(col[2], 0.24)] : col;
      // Warm/tan, non-building, non-green masses read as desert dunes/mesas.
      const sandy = !isBld && col[0] > 0.45 && col[0] > col[2] + 0.04 && col[1] > col[2];
      out._mat = isBld ? MAT.CONCRETE : sandy ? MAT.SAND : 0;
      addBox(out, [cx, cy0, cz], sz, bcol, [t, u, r]);
      out._mat = 0;
      // If this distant box reads as a BUILDING — tall, taller than it is deep,
      // and not green terrain — give it window bands + a parapet so a city
      // skyline doesn't render as flat dark planes. Wide/low/dune silhouettes
      // (dunes, mesas) are left as plain masses.
      if (isBld) {
        const lit = NIGHT;
        // Night skyline windows are HDR so the distant towers glow (and bloom)
        // as a lit skyline rather than dim grey bands — matches the near-building
        // glass curtain walls. Day keeps a reflective-glass tint.
        const win = lit ? [1.45, 1.28, 0.84]
                        : [Math.min(1, col[0] * 1.6 + 0.05), Math.min(1, col[1] * 1.6 + 0.05), Math.min(1, col[2] * 1.6 + 0.07)];
        const darkWin = [col[0] * 0.55, col[1] * 0.55, col[2] * 0.6];
        const floors = Math.max(2, Math.min(4, Math.round(sz[1] / 18)));
        const fh = sz[1] / floors;
        const base = cy0 - sz[1] / 2;
        out._mat = MAT.GLASS;
        for (let i = 1; i < floors; i++) {
          const wc = (lit && hash(k * 7.7 + i * 3.3 + dist * 0.1) < 0.34) ? darkWin : win;
          // band on the camera-facing (u × sz2) face; thin in up, proud in sz2
          addBox(out, [cx, base + (i + 0.5) * fh, cz], [sz[0] * 0.98, fh * 0.5, sz[2] * 1.03], wc, [t, u, r]);
        }
        // parapet cap so the roofline isn't a bare slab edge
        out._mat = MAT.METAL;
        addBox(out, [cx, base + sz[1] + 0.6, cz], [sz[0] * 1.02, 1.2, sz[2] * 1.04], col, [t, u, r]);
        out._mat = 0;
      }
    };

    // ---------- composite scenery models: js/track/scenery-*.js ----------
    // The composite trackside models are split into four Scenery*.create(ctx)
    // modules — nature (anchor + vegetation/landforms/crowds), structures
    // (along + barriers/gantry/marshals/signage/ferris wheel), city
    // (neonFacade/building/neonTower/cityFront/…) and identity (the shared
    // circuit-identity toolkit). ONE shared ctx per buildProps call carries
    // the output buffers, per-build state, guarded emitters and the guard/
    // grounding/boundary core; each module's returned helpers are assigned
    // back onto ctx so modules (and the passes below) reach each other only
    // through it. Creation order matters only for the create-time
    // destructures: nature (anchor) -> structures (along) -> city (building)
    // -> identity.
    const ctx = {
      // output buffers + per-build state
      out, glassBuf, waterBuf, track, def, theme, pal, n, ds, px, py, pz, hw,
      pyMin, NIGHT, MAT, lod,
      // guarded emitters + the raw escape hatch
      addBox, addCyl, addCone, addFrustum, addPrism, addPyramid, addMountain,
      emit, RAW, rejBox, rejRad,
      // scene graph: model library + one node per placement. `instance()` is the
      // migrated-emitter entry point — it defines a canonical model once and
      // replays it through the GUARDED emitters above, so a migrated helper
      // keeps the same suppression behaviour as its hand-written form.
      graph, instance,
      // guard / grounding / boundary core
      markBarrier, blockAt, recordBarrier, indexBarrier, clearTreeDist,
      indexSolid, indexSolidAt, barrierClear, massBlocked, massAdd, bankOffsetAt,
      seat, foundation, cantilever, groundYAt, terrainYAt, onTrack,
      frameAt, overheadSpan, models,
      // placement primitives + math helpers
      place, prop, backdrop, groundPlane, every,
      hash, upOf, cross, norm, lerp, vadd,
      // semantic prop registry (see note() above) — scenery modules call this
      // after their own guards so only props that actually ship are recorded
      note, noteSpan, noteSuppressed,
      // Per-circuit trackside-furniture FORM lookup, resolved the same way FURN
      // and BARRIER already are: KIT[def.id] || KIT_DEF[theme] || fallback. The
      // fallback the caller passes is always that emitter's CURRENT geometry,
      // so an absent table leaves all 40 circuits exactly as they were.
      kitOf: (family, fallback) => {
        const K = TrackSceneryData.KIT || {};
        const D = TrackSceneryData.KIT_DEF || {};
        const row = K[def.id] || D[theme] || D.green || {};
        return row[family] || fallback;
      },
    };
    Object.assign(ctx, SceneryNature.create(ctx));
    Object.assign(ctx, SceneryStructures.create(ctx));
    Object.assign(ctx, SceneryCity.create(ctx));
    Object.assign(ctx, SceneryIdentity.create(ctx));
    // Deploy-side grounding kit: the foliage guard + deferred treelines live in
    // scenery-nature (created above); the flush pass below and plantTree need them.
    const { canopyR, forestEdgeNow, deferredFoliage } = ctx;
    const { anchor, groundUnder, pine, tree, palm, conifer, peak, mountain, ridge,
            crowdBank, grandstand, grandstandEx, spectatorHill, bush, hedge, forestEdge,
            cypress, stonePine, broadleafFall, acacia, plane,
            along, wall, fence, guardrail, tyreWall, gantry, marshalPost,
            signBoard, signDigit, sponsorHoarding, cameraTower, ferrisWheel,
            bleacher, scaffoldStand, terrace, tieredBowl,
            building, house, motorhome, tower, billboard, cityFront,
            streetLamp, neonSign, neonTower,
            underpassPortal, floodMast, floodMastRing, ledFacadeBands,
            concreteCanyon, sailCanopy, gridshellCanopy, runoffApron,
            bankedKerbStrip, bowlSeatWall, pastelStreetRow,
            broadcastCompound } = ctx;

    const bt = BARRIER[def.id] || { a: [0.92, 0.92, 0.94], b: [0.85, 0.18, 0.16], c: [0.55, 0.57, 0.62], night: [0.18, 0.18, 0.22], tyre: [0.24, 0.22, 0.20] };
    const btSeq = [bt.a, bt.b, bt.c];

    // continuous barrier wall hugging both edges on street circuits — going off
    // means hitting a wall, not open grass. Day circuits get the track's armco
    // livery; dark sessions get its tinted night rail.
    if (def.street) {
      // Barriers are straight panels — span a few nodes each instead of one box
      // per ~4 m node, roughly halving the barrier vertex cost on long street laps.
      const WH = 1.1, WT = 0.4, STEP = 2;
      const barrierOffset = def.barrierGap != null ? def.barrierGap : 0.35;
      const panel = (kA, kB, col, side) => {
        const rA = [track.rx[kA], track.ry[kA], track.rz[kA]];
        const rB = [track.rx[kB], track.ry[kB], track.rz[kB]];
        const oA = side * (hw[kA] + barrierOffset), oB = side * (hw[kB] + barrierOffset);
        // py[] is the CENTRELINE height; on banked road the edge the barrier
        // hugs is lifted/dropped by the banking pivot (see mesh.js bankOffsetAt).
        const ax = px[kA] + rA[0] * oA, ay = py[kA] + bankOffsetAt(track, kA, oA), az = pz[kA] + rA[2] * oA;
        const bx = px[kB] + rB[0] * oB, by = py[kB] + bankOffsetAt(track, kB, oB), bz = pz[kB] + rB[2] * oB;
        const cx = (ax + bx) / 2, cy = (ay + by) / 2, cz = (az + bz) / 2;
        const len = Math.hypot(bx - ax, by - ay, bz - az) + 0.05;
        const f = norm([bx - ax, by - ay, bz - az]);
        const rr = norm(cross(f, upOf(track, kA)));
        instance(`street-barrier|${col.join(",")}`,
          { o: [cx, cy + WH / 2, cz], r: rr, u: [0, 1, 0], t: f, s: [1, 1, len] },
          (rec) => rec.box([0, 0, 0], [WT, WH, 1], col),
          { kind: "streetBarrier", k: kA, side });
        return [cx, cz];
      };
      for (const side of [-1, 1]) {
        for (let k = 0; k < n; k += STEP) {
          const kn = (k + STEP) % n, km = (k + 1) % n;
          const col = NIGHT ? bt.night : btSeq[Math.floor(k / (STEP * 3)) % 3];
          // Every panel is the same 0.4 x 1.1 m cross-section; only its length
          // and livery colour vary. One model per colour (three by day, one at
          // night) covers a whole street lap, with length on the node scale.
          //
          // A STRAIGHT panel chord-cuts the inside of a bend: at the skipped
          // middle node the chord sags INWARD from the nominal barrier line,
          // and the props-over-road audit samples the FULL road-mesh surface
          // (kerbs + verge, to 75% of its width) — vegas frac 0.678 measured
          // the chord 0.43 m inside its own line, hanging the 1.1 m panel
          // over the verge. Where the chord's midpoint gives up more than
          // 0.1 m of the gap, emit two single-node panels that follow the
          // curve instead — the cost lands only on the handful of apex spans.
          const oM = side * (hw[km] + barrierOffset);
          const qx = (px[k] + track.rx[k] * side * (hw[k] + barrierOffset)
                    + px[kn] + track.rx[kn] * side * (hw[kn] + barrierOffset)) / 2;
          const qz = (pz[k] + track.rz[k] * side * (hw[k] + barrierOffset)
                    + pz[kn] + track.rz[kn] * side * (hw[kn] + barrierOffset)) / 2;
          const exm = px[km] + track.rx[km] * side * hw[km];
          const ezm = pz[km] + track.rz[km] * side * hw[km];
          const clearM = ((qx - exm) * track.rx[km] + (qz - ezm) * track.rz[km]) * side;
          if (clearM < barrierOffset - 0.1) {
            panel(k, km, col, side);
            panel(km, kn, col, side);
          } else {
            panel(k, kn, col, side);
          }
        }
      }
      // Record the boundary for EVERY node (the geometry loop steps by 2, which
      // would leave gaps), both sides, at the barrier offset.
      const off = def.barrierGap != null ? def.barrierGap : 0.35;
      for (let k = 0; k < n; k++) { markBarrier(k, -1, off); markBarrier(k, 1, off); }
    }
    // floodlights for night tracks: generic mast ring (~22 m) covers these —
    // the old every-70 poles duplicated geometry on Bahrain/Singapore/etc.
    // (kept marker so night tracks still opt into buildTrackLights via def.night)
    // tire barriers at outside of tight corners on permanent (non-street) circuits
    if (!def.street) {
      // findCorners returns every local curvature peak, and two peaks a few
      // nodes apart both survive its `sm[k] >= sm[a] && sm[k] > sm[b]` test. Their
      // spans then overlap, and because both walk out in the SAME `step` stride
      // they can land on the identical node — emitting a byte-identical tyre box
      // twice. Two fully coincident boxes are the purest z-fight there is: every
      // face coplanar, same normal, zero gap, so they flicker at ANY distance.
      // Qatar carried 24 such pairs. Claim each (node, side) once.
      const stacked = new Set();
      for (const c of findCorners(track, 0.014)) {
        // +curv = LEFT turn (mesh.js banking comment; measured in agentview's
        // corner table), so the outside of a c.sign>0 corner is the RIGHT (+x)
        // side. The retired "+k = right" read here put every tyre barrier on
        // the corner INSIDE.
        const outside = c.sign > 0 ? 1 : -1;
        const lo = Math.max(1, Math.round(c.lo * 0.35));
        const hi = Math.max(1, Math.round(c.hi * 0.35));
        const step = Math.max(2, Math.round(3.5 / ds));
        for (let i = -lo; i <= hi; i += step) {
          const k = ((c.k + i) + n) % n;
          const claim = k * 2 + (outside > 0 ? 1 : 0);
          if (stacked.has(claim)) continue;
          stacked.add(claim);
          const r = [track.rx[k], track.ry[k], track.rz[k]];
          const t = [track.tx[k], track.ty[k], track.tz[k]];
          const u = upOf(track, k);
          const o = outside * (hw[k] + 2.2);
          // Banked road: py[k] is the centreline; the outside edge the wall
          // stands beside is lifted by the banking pivot (mesh.js bankOffsetAt).
          const wy = py[k] + bankOffsetAt(track, k, o);
          const slen = ds * step * 1.1;
          addBox(out, [px[k] + r[0] * o, wy + 0.45, pz[k] + r[2] * o],
                 [1.0, 0.9, slen], [0.24, 0.22, 0.20], [r, u, t]);
          // Themed conveyor-belt cap: a bright coloured stripe along the top of
          // the tyre stack, giving the city's corner barriers its identity.
          if (BARRIER[def.id]) addBox(out, [px[k] + r[0] * o, wy + 0.94, pz[k] + r[2] * o],
                 [1.06, 0.18, slen], bt.tyre, [r, u, t]);
          // record the tyre barrier along its span so the car stops just short of it
          for (let d = 0; d < step; d++) markBarrier((k + d) % n, outside, 2.2);
        }
        // markBarrier only moves the DRIVING limit; it does not tell the scenery
        // engine that a metre-wide stack of tyres physically stands here. These
        // corner barriers were the second-largest obstacle class in the
        // surviving canopy hits, so register the geometry too.
        indexBarrier((((c.k - lo) % n + n) % n) / n, (((c.k + hi) % n + n) % n) / n, outside, 2.2);
      }
    }

    // ── Trackside SIGNAGE: corner-number boards + braking markers + pit speed.
    // Prefer curated FIA turn apexes (def.turns from CircuitMarkings; all
    // shipped circuits have a table). Fall back to curvature-peak detection
    // only if a def somehow lacks turns.
    {
      // NOTE: signBoard's `gap` forwards straight to anchor(k,side,gap), which
      // already adds hw[k] internally (dist = "beyond the edge") — passing
      // hw[k]+N here would double-count it and place every board ~2x too far
      // out. Pass the clearance alone, matching every other gap-based call in
      // this file (building/grandstand/marshalPost/…).
      let laneCorners;
      if (def.turns && def.turns.length) {
        laneCorners = def.turns.map((frac) => {
          const k = Math.round((((frac % 1) + 1) % 1) * n) % n;
          const sign = Math.sign(curvature(track, k * ds)) || 1;
          return { k, sign, lo: 14 };
        });
      } else {
        laneCorners = findCorners(track, 0.007).slice().sort((a, b) => a.k - b.k);
      }
      laneCorners.forEach((c, idx) => {
        // Same convention fix as the tyre barriers above: outside of a
        // c.sign>0 (LEFT) corner is the +x side.
        const outside = c.sign > 0 ? 1 : -1;
        signBoard(c.k, outside, 3.5, "corner", idx + 1);
        // Braking trio (3->2->1 stripes counting down to the apex) on roughly
        // half the corners, spaced back along the approach — avoids clutter on
        // every single bend while still reading as a real trackside kit.
        if (hash(c.k * 3.1 + 7) > 0.5) {
          const lo = Math.max(6, c.lo || 14);
          const offs = [Math.round(lo * 0.85), Math.round(lo * 0.5), Math.round(lo * 0.18)];
          [3, 2, 1].forEach((stripes, si) => {
            const kk = ((c.k - offs[si]) % n + n) % n;
            signBoard(kk, outside, 3.0, "braking", stripes);
          });
        }
      });
      // One pit-entry speed-limit disc near the end of the lap — real
      // speed-limit signage is mostly a pit-lane feature, not scattered
      // trackside, so a single instance per circuit is the honest amount.
      const spk = Math.round(n * 0.965) % n;
      signBoard(spk, -1, 4, "speed", def.street ? 60 : 80);
    }

    const fz = FURN[def.id] || FURN_DEF[theme] || FURN_DEF.green;
    // Per-tree foliage variation: a real forest is never one flat green. Each
    // tree gets a jittered brightness + a warm/cool hue drift, and a small
    // fraction of broadleaf trees turn autumnal gold/rust — so a stand of trees
    // reads as mixed natural foliage rather than identical clones.
    const folVary = (base, seed) => {
      const lift = 0.68 + hash(seed * 3.1) * 0.62;        // WIDE brightness spread (deep shade → bright young)
      const warm = (hash(seed * 7.7) - 0.45) * 0.24;      // stronger yellow-green ↔ blue-green drift
      return [Math.max(0, Math.min(1, base[0] * lift + warm)),
              Math.max(0, Math.min(1, base[1] * lift + warm * 0.3)),
              Math.max(0, Math.min(1, base[2] * lift - warm * 0.7))];
    };
    const plantTree = (k, side, dist, h) => {
      const seed = k * 1.7 + side * 0.9 + dist;
      let col = folVary(fz.fol, seed);
      // Autumn / flowering accent — a gold-rust or amber tree dotted through
      // broadleaf stands (≈22%) so a treeline shows seasonal colour, not one green.
      if (fz.tree === "broad" && hash(seed * 5.5) < 0.22)
        col = [0.60 + hash(seed) * 0.28, 0.34 + hash(seed * 2.1) * 0.22, 0.10 + hash(seed * 3.3) * 0.10];
      // `dist` is the clearance wanted for the canopy's INNER EDGE, matching
      // forestEdge()'s contract — push the TRUNK out by the crown's reach. The
      // scatter used to pass dist straight through as a trunk distance with no
      // canopy allowance, so any tree it dropped within (barrier gap + crown
      // radius) of a catch fence grew straight through it. Suzuka was worst hit:
      // fences cover ~32% of its lap.
      // FURN.tree used to resolve to exactly THREE silhouettes — palm, fir or
      // broad — so 18 circuits shared one tree shape on the generic roadside
      // scatter that runs on every lap. The species library grew to nine during
      // the identity pass but nothing outside a circuit's own scenery() could
      // reach it. SPECIES names now pass straight through.
      const SPECIES = { cypress: 1, stonePine: 1, broadleafFall: 1, acacia: 1, plane: 1 };
      // FURN.treeCrown reshapes the broadleaf the scatter plants — the one
      // foliage pass that runs on every circuit. canopyR keys off the same
      // name so the fence guard clears what the crown actually spans.
      const CROWNS = { vase: 1, weeping: 1, columnar: 1 };
      const crownForm = CROWNS[fz.treeCrown] ? fz.treeCrown : "round";
      const kind = SPECIES[fz.tree] ? fz.tree
        : fz.tree === "palm" ? "palm" : fz.tree === "fir" ? "fir"
        : crownForm !== "round" ? crownForm : "broad";
      const crown = canopyR(kind, h);
      // Spatial barrier guard — the canopy allowance above only clears the
      // barrier belonging to THIS node, and the hits that survived it were with
      // walls belonging to other parts of the lap.
      const d = clearTreeDist(k, side, dist + crown, crown);
      if (d == null) return;
      if (kind === "palm") palm(k, side, d, h, col);
      else if (kind === "fir") conifer(k, side, d, h, col);
      else if (kind === "cypress") cypress(k, side, d, h, col);
      else if (kind === "stonePine") stonePine(k, side, d, h, col);
      else if (kind === "broadleafFall") broadleafFall(k, side, d, h, col);
      else if (kind === "acacia") acacia(k, side, d, h, col);
      else if (kind === "plane") plane(k, side, d, h, col);
      else tree(k, side, d, h, col, crownForm !== "round" ? { crown: crownForm } : undefined);
    };
    // Furniture streetLamp pass retired — mast pass draws fz.lamp posts + lampPosts.

    // Roadside trees — every circuit, per-track species/tint, set back behind the
    // edge. Forest/green circuits get a denser stand (a cluster of a few trees at
    // staggered depths, each with its own varied colour) so the treeline reads as
    // real mixed woodland; street circuits keep a sparser line.
    // DEFERRED to after def.scenery() — see the call site. plantTree()'s barrier
    // guard queries the world-XZ index, and almost every barrier on a circuit is
    // recorded by the track's own scenery() callback, which has not run yet at
    // this point in the build. Scattering here would query an index holding only
    // the handful of barriers the generic passes registered, and re-introduce
    // exactly the crowns-through-fences the guard exists to prevent.
    const plantRoadsideTrees = () => {
    if (fz.tree && fz.tree !== "none") {
      const step = fz.sparse ? 30 : (def.street ? 24 : 18);   // street denser than before; sparse = coastal scrub
      every(step, (k) => {
        const side = hash(HK(k) * 41) < 0.5 ? -1 : 1;
        if (dressingExcluded("foliage", k, side)) return;
        const baseH = fz.tree === "palm" ? 8 : 6;
        const cluster = fz.sparse ? 1
          : def.street ? (hash(HK(k) * 13) < 0.5 ? 1 : 2)              // streets: 1–2 per stand
          : 2 + Math.floor(hash(HK(k) * 13) * 2);                      // green: 2–3 per stand
        for (let i = 0; i < cluster; i++) {
          const dist = (def.street ? 6 : 8) + hash(HK(k) * 3 + side + i * 4.4) * (def.street ? 4 : 14);
          // Spread a stand over neighbouring nodes (k, k+1, k-1). WRAP it — the
          // third tree of the stand at k=0 resolved to node -1, and an
          // out-of-range index reads undefined off the typed arrays and NaNs
          // the entire props buffer (see anchor()).
          const kt = ((k + (i % 2) - (i > 1 ? 1 : 0)) % n + n) % n;
          plantTree(kt, side, dist, baseH + hash(HK(k) * 5 + i * 2.7) * 6);
        }
      });
    }
    };

    // marshal post + signal board every 270 m on alternating sides (skip street circuits with continuous barriers)
    if (!def.street) {
      every(270, (k) => {
        const side = hash(HK(k) * 7) < 0.5 ? -1 : 1;
        place(k, side, 25, [0.55, 1.3, 0.55], [0.95, 0.55, 0.08]);
        place(k, side, 25, [1.2, 0.75, 0.08], [0.95, 0.95, 0.97]);
      });
    }

    if (theme === "green") {
      // FURN already plants real trees; legacy box trunk/canopy forest removed.
      // occasional grandstand
      every(140, (k) => place(k, hash(HK(k)) < 0.5 ? -1 : 1, 14, [4, 6, 22], [0.5, 0.5, 0.55]));
    } else if (theme === "desert") {
      every(34, (k) => { for (const side of [-1, 1]) if (hash(HK(k) + side) > 0.6) place(k, side, 8 + hash(HK(k)) * 10, [2 + hash(HK(k)) * 3, 1.5, 2], [0.62, 0.5, 0.34]); });
    } else if (theme === "street_day" || theme === "street_night" || theme === "modern") {
      const style = STYLES[def.id] || THEME_DEF[theme] || THEME_DEF.modern;
      const cn = (k, s) => style.neon[Math.floor(hash(k * 3 + s) * style.neon.length) % style.neon.length];
      // Per-building tone: keeps the track's single dark NIGHT tone, but picks a
      // VARIED daytime facade colour from the style's dayPal so the city in
      // daylight is a mix of stone/cream/terracotta/glass instead of flat grey.
      const dpal = style.dayPal;
      const toneFor = (k, s) => {
        if (!(dpal && dpal.length)) return { n: style.tone && style.tone.n, d: style.tone && style.tone.d };
        // Cluster adjacent buildings into short colour RUNS (floor(k/…)) and bias
        // the pick toward the palette's leading entries (cl²) so each track reads
        // as a cohesive place with a signature material plus a few accents,
        // rather than every building a different random colour.
        const cl = hash(Math.floor(k / 2.4) * 2.3 + s * 4.2);
        const idx = Math.floor(cl * cl * dpal.length) % dpal.length;
        return { n: style.tone && style.tone.n, d: dpal[idx] };
      };
      // neonAmt per building: day = plain; night = neon buildings bright, the rest
      // (general/regular buildings) get just a touch of neon so the city still
      // sparkles without being a wall of neon.
      const naFor = (k, side) => {
        if (!NIGHT) return 0;
        return hash(k * 7.7 + side * 2.1) < style.bias
          ? 0.55 + hash(k * 9.3 + side) * 0.45
          : 0.10 + hash(k * 11.1 + side) * 0.10;
      };
      const pickKind = (k, s, na) => {
        if (na > 0.5 && style.neonKinds.length && hash(k * 4.4 + s) < 0.3)
          return style.neonKinds[Math.floor(hash(k * 6.6 + s) * style.neonKinds.length) % style.neonKinds.length];
        return style.kinds[Math.floor(hash(k * 2.3 + s) * style.kinds.length) % style.kinds.length];
      };
      // Front row — dense.
      every(18, (k) => {
        for (const side of [-1, 1]) {
          if (hash(HK(k) * 17 + side * 4) < 0.12 || dressingExcluded("city", k, side)) continue;
          const s = hash(HK(k) * 5 + side), na = naFor(HK(k), side);
          const h = style.fh[0] + s * style.fh[1], w = 8 + s * 10, d = 8 + hash(HK(k) * 9 + side) * 9;
          neonTower(k, side, 13 + s * 12, w, h, d, cn(HK(k), side), pickKind(HK(k), side, na), toneFor(HK(k), side), na);
        }
      });
      // Back row — taller, set further back, staggered, for skyline depth.
      every(26, (k) => {
        for (const side of [-1, 1]) {
          if (hash(HK(k) * 23 + side * 7) < 0.34 || dressingExcluded("city", k, side)) continue;
          const s = hash(HK(k) * 11 + side * 2), na = naFor(HK(k) * 1.3, side);
          const h = style.bh[0] + s * style.bh[1], w = 11 + s * 12, d = 11 + s * 10;
          neonTower(k, side, 40 + s * 30, w, h, d, cn(HK(k) * 1.7, side), pickKind(HK(k) * 1.9, side, na), toneFor(HK(k) * 1.7, side), na);
        }
      });
      // Sign blades + low retail boxes dressing the gaps.
      every(34, (k) => {
        const side = hash(HK(k) * 13) < 0.5 ? -1 : 1;
        if (dressingExcluded("city", k, side)) return;
        const lc = cn(HK(k) * 3.3, side);
        if (NIGHT && style.bias > 0.3 && hash(HK(k) * 19) < 0.5) neonSign(k, side, 8 + hash(HK(k)) * 4, 10 + hash(HK(k) * 2) * 10, lc);
        else { const rc = toneFor(HK(k) * 2.7, side).d || [0.5, 0.5, 0.54]; place(k, side, 9, [9, 4 + hash(HK(k)) * 3, 7], NIGHT ? [0.13, 0.13, 0.16] : rc); place(k, side, 9, [9.3, 1.0, 7.3], NIGHT ? lc : [lc[0] * 0.4 + 0.3, lc[1] * 0.4 + 0.3, lc[2] * 0.4 + 0.3]); }
      });
      // Occasional illuminated billboard accent (more on high-neon circuits).
      if (style.bias > 0.25) every(80, (k) => {
        const side = hash(HK(k) * 31) < 0.5 ? -1 : 1;
        if (dressingExcluded("city", k, side)) return;
        const neon = cn(HK(k) * 5.5, side);
        prop(k, side, 6, [1.0, 6, 1.0], [0.10, 0.10, 0.12]);
        prop(k, side, 6, [1.2, 3.4, 5], NIGHT ? neon : [neon[0] * 0.5 + 0.25, neon[1] * 0.5 + 0.25, neon[2] * 0.5 + 0.25]);
      });
    }

    // --- main grandstand + pit complex on the start/finish straight ---
    // A crude 112 m fallback slab down each side of the first ~100 m of the lap.
    // It predates the per-circuit scenery callbacks and is unconditional, so on
    // any circuit that builds its own pit complex it lands ON TOP of the bespoke
    // model (Monza's Tribuna Centrale and pit canopy, for one). Circuits that
    // dress their own start/finish straight opt out with `ownPitStraight: true`;
    // everything else keeps the fallback so no circuit loses its pit lane.
    const crowd = def.night ? [0.45, 0.28, 0.3] : [0.78, 0.42, 0.32];
    for (let i = 0; i < (def.ownPitStraight ? 0 : 7); i++) {
      const k = (i * 4) % n;
      place(k, -1, 14, [6, 11, 16], [0.5, 0.5, 0.56]);     // grandstand shell
      crowdBank(k, -1, 8, 16, 7, 4.2,                        // speckled tiered crowd
                [crowd[0] * 0.4, crowd[1] * 0.4, crowd[2] * 0.4]);
      place(k, 1, 12, [7, 5.5, 16], [0.83, 0.83, 0.86]);    // pit building
      // Pit complex window bands: two glowing glass strips on the track-facing
      // face after dark — garages work through the night at a race meeting.
      if (NIGHT) {
        const pa = anchor(k, 1, 8.35), pb = [pa.r, pa.u, pa.t];
        addBox(out, vadd(pa.c, pa.u, 2.0), [0.14, 1.3, 13], [1.34, 1.24, 0.96], pb);
        addBox(out, vadd(pa.c, pa.u, 3.9), [0.14, 0.9, 13], [1.10, 1.14, 1.22], pb);
      }
    }

    // ── Shared scenery toolkit (identity pass) lives in
    // js/track/scenery-identity.js (SceneryIdentity) — created above. ──


    // Place a BAKED MODEL from the asset pack (assets/pack, built by
    // `node tools/assets.mjs bake-model`) at a trackside anchor. This is the one
    // scenery helper whose geometry is not generated here — it is a real modelled
    // asset baked down to the game's own vertex format, MAT id included.
    //
    // Returns FALSE and emits nothing when the pack has no such model, which is
    // the default state of a fresh checkout. Circuits must therefore treat it as
    // an ENHANCEMENT and keep their procedural fallback:
    //
    //     if (!bakedModel("grandstand_tifosi", K(0.12), -1, 14))
    //       grandstand(K(0.12), -1, 14, 40);
    //
    // Never async: Assets prefetches every model at boot precisely so that prop
    // placement cannot vary with network timing (js/render/assets.js modelSync).
    function bakedModel(id, k, side, dist, opts) {
      if (typeof Assets === "undefined" || !Assets.modelSync) return false;
      const mesh = Assets.modelSync(id);
      if (!mesh) return false;
      const o = opts || {};
      const a = anchor(k, side, dist);
      if (!a || !isFinite(a.c[0]) || !isFinite(a.c[1]) || !isFinite(a.c[2])) return false;
      // Footprint guard: pack models have no UV-local "inner face" — the mesh
      // AABB is centred on the anchor. Without this, a suburban block on a
      // reversed street circuit (Monaco) can sit with its body over a foldback
      // of the racing line while the anchor itself clears.
      const sc = o.scale != null ? o.scale : 1;
      let hx = 4 * sc, hz = 4 * sc;
      if (mesh.pos && mesh.pos.length >= 3) {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (let i = 0; i < mesh.pos.length; i += 3) {
          const x = mesh.pos[i], z = mesh.pos[i + 2];
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        }
        if (Number.isFinite(minX)) {
          hx = Math.max(0.5, (maxX - minX) * 0.5 * sc);
          hz = Math.max(0.5, (maxZ - minZ) * 0.5 * sc);
        }
      }
      const clear = def.street ? 2.5 : 1.0;
      if (rejBox(a.c, [hx * 2 + clear * 2, 8, hz * 2 + clear * 2], [a.r, a.u, a.t])) {
        Log.warn("scenery", `bakedModel SUPPRESSED id=${id} at k=${k} side=${side}: dist=${dist} (footprint over track)`);
        return false;
      }
      // Face the track by default: yaw from the track tangent, flipped on the
      // right-hand side so a model authored facing +Z always looks at the road.
      const yaw = o.rotY != null ? o.rotY
                : Math.atan2(a.t[0], a.t[2]) + (side < 0 ? Math.PI / 2 : -Math.PI / 2);
      return TrackGeom.addMesh(out, mesh, {
        x: a.c[0], y: a.c[1] + (o.lift || 0), z: a.c[2],
        rotY: yaw, scale: sc,
        tint: o.tint || null, mat: o.mat,
      });
    }

    // ---------- circuit-registered light fixtures ----------
    // The generic mast pass below owns every ORDINARY lamp on every circuit, and
    // js/game/lighting.js emits one point light per exported mast lens. That
    // covers roadside posts and flood banks — but not a fixture the circuit
    // builds itself, and there is exactly one shape of those that matters: a
    // luminaire the circuit had to model by hand because no mast could stand
    // there (a tunnel soffit, a canopy underside, a portal reveal). Without a
    // registration path those fixtures are painted geometry that casts nothing.
    //
    // lampPost() lets a bespoke scenery() hand back the world position of a lens
    // it has already drawn, and the light follows the same fixture-anchored rule
    // as every other lamp: no light without something visible emitting it.
    // Positions are RAW WORLD coordinates (like the px/py/pz arrays handed to
    // scenery) and are deliberately NOT remapped by transformSceneryApi — a
    // reversed lap's bespoke scenery computes them off the same arrays.
    const customLamps = [];
    const CUSTOM_LAMP_CAP = 96;
    // floodMast / floodMastRing registrations — separate from lampPost's 96-cap
    // tunnel/soffit budget. A full-lap Musco ring is hundreds of fixtures; the
    // custom cap is for rare hand-placed luminaires.
    const mastLamps = [];
    const MAST_LAMP_CAP = 512;
    const lampPost = (spec) => {
      spec = spec || {};
      const p = spec.pos;
      if (!finiteVec(p, 3, false)) {
        diagnostics.invalid.push({ id: spec.id || "lamp-post", reason: "non-finite lamp position" });
        return false;
      }
      if (customLamps.length >= CUSTOM_LAMP_CAP) return false;
      const k = Number.isFinite(spec.k) ? ((Math.round(spec.k) % n) + n) % n : 0;
      const rec = { k, side: spec.side === -1 ? -1 : 1, x: p[0], y: p[1], z: p[2],
                    kind: typeof spec.kind === "string" ? spec.kind : "led",
                    custom: true };
      // ALWAYS: this fixture burns in daylight too. Ordinary lamps only reach the
      // shader once the session is dark; a tunnel's are on at noon, and the bore
      // is in permanent shadow, so gating them on nightfall would leave the one
      // place on the circuit that genuinely needs light as the one place without.
      if (spec.always) rec.always = true;
      if (finiteVec(spec.aim, 3, false)) rec.aim = [spec.aim[0], spec.aim[1], spec.aim[2]];
      if (Number.isFinite(spec.energy)) rec.energy = Math.max(0, spec.energy);
      if (Number.isFinite(spec.radius)) rec.radius = Math.max(1, spec.radius);
      customLamps.push(rec);
      return true;
    };
    // Called by SceneryIdentity.floodMast at draw time (looked up off ctx).
    // Marks custom so buildTrackLights does not invent neon-spill washers on
    // top of a modelled stadium bank.
    const registerMastLamp = (spec) => {
      spec = spec || {};
      const p = spec.pos;
      if (!finiteVec(p, 3, false)) return false;
      if (mastLamps.length >= MAST_LAMP_CAP) return false;
      const k = Number.isFinite(spec.k) ? ((Math.round(spec.k) % n) + n) % n : 0;
      const rec = { k, side: spec.side === -1 ? -1 : 1, x: p[0], y: p[1], z: p[2],
                    kind: typeof spec.kind === "string" ? spec.kind : "flood_bank",
                    custom: true, mast: true };
      if (Number.isFinite(spec.energy)) rec.energy = Math.max(0, spec.energy);
      if (Number.isFinite(spec.radius)) rec.radius = Math.max(1, spec.radius);
      mastLamps.push(rec);
      return true;
    };
    ctx.registerMastLamp = registerMastLamp;

    // Per-circuit bespoke scenery lives in js/circuits/<id>.js (def.scenery).
    if (def.scenery) {
      let sceneryApi = {
        out, track, def, theme, pal, n, ds, px, py, pz, hw, pyMin,
        // Session darkness (chosen time of day) — lets bespoke scenery render a lit
        // night version vs a daytime version of the same structure.
        night: NIGHT,
        // Procedural surface-material ids (js/render/glx.js applyMaterial/applyMaterialNormal).
        // Tag a block of geometry by setting out._mat = MAT.<NAME> before the add*()
        // calls that should carry it, then out._mat = 0 (MAT.FLAT) to stop. Applies to
        // BOTH the day/night colour tint AND a real light-catching bump — no images,
        // no UVs. See docs/SCENERY-API.md.
        MAT,
        // Named atmosphere / colour packs (js/track/scenery-data.js)
        ATM, COL,
        place, prop, backdrop, groundPlane, groundYAt,
        // World-XZ ground query, exposed to circuits because its ABSENCE is
        // what makes Trap B (docs/SCENERY-GROUNDING.md §2) so easy to write:
        // groundYAt is a NODE query, so a circuit walking a tangent away from
        // the centreline had nothing to ask and reused one anchor's height
        // across tens of metres of slope. Returns null off the rendered
        // ribbon; callers fall back to whatever they were using before.
        terrainYAt,
        // ...and the same query WITH a fallback, which is what circuits want off
        // the ribbon (long runs, distant landmarks). mugello and shanghai each
        // hand-rolled this during the grounding sweep; it falls back to the same
        // closed form tools/float-audit.cjs does, so engine and audit agree.
        groundUnder, frameAt,
        addBox, every, onTrack,
        modelGroup, overheadSpan, lampPost, waterSurface, waterField, waterBand, groundPatch, groundedSegments,
        seat, foundation, cantilever,
        // Resolved data and opt-in architectural/facility helpers. Merely binding
        // these does not emit geometry; each circuit remains responsible for calls.
        sceneryTheme, landmarkKit, circuitKit,
        modelDiagnostics: diagnostics,
        ferrisWheel, hash, upOf, cross, norm, lerp, vadd,
        // richer primitives (world coords): non-cube shapes
        addPrism, addPyramid, addCone, addCyl, addFrustum, addMountain, anchor, along,
        // landscape + vegetation
        pine, tree, palm, bush, hedge, peak, mountain, ridge, forestEdge, conifer,
        // ...plus the species the six above cannot shape (columnar / parasol /
        // autumn-lobed / flat-topped thorn / pollarded avenue)
        cypress, stonePine, broadleafFall, acacia, plane,
        // spectator terracing (informal grass banks — see docs/SCENERY-API.md)
        spectatorHill,
        // open seating — the stand forms grandstandEx is not (no back shell)
        bleacher, scaffoldStand, terrace, tieredBowl,
        // structures
        building, house, motorhome, tower, grandstand, grandstandEx, billboard,
        gantry, marshalPost, cameraTower, cityFront,
        // seven-segment numerals on an arbitrary face. Takes raw basis vectors
        // rather than (k, side), so — like addBox — it needs no reverse remap.
        signDigit,
        // shared identity-pass toolkit
        underpassPortal, floodMast, floodMastRing, ledFacadeBands,
        concreteCanyon, sailCanopy, gridshellCanopy, runoffApron,
        bankedKerbStrip, bowlSeatWall, pastelStreetRow, broadcastCompound,
        // signage
        signBoard, sponsorHoarding,
        // barriers / track furniture
        wall, fence, guardrail, tyreWall, recordBarrier,
        // Footprint reservation. A circuit that builds a large prop from raw
        // primitives — a farmhouse, a campsite, a stand — has no way to tell
        // the foliage pass that the ground is taken, so the roadside scatter
        // and the treelines grow straight through it. Every ENGINE emitter
        // already calls indexSolid for exactly this reason; circuit files
        // could not, which is why Mugello's casali had to be abandoned and
        // Silverstone's campsites pushed out to 200 m.
        //
        // Safe to expose because foliage is already DEFERRED to after
        // def.scenery() (see the call site below): anything a circuit reserves
        // is in the index before a single tree is placed. Purely geometric —
        // like indexBarrier it never touches barL/barR, so it cannot move the
        // driving limits.
        indexSolid,
        // baked asset pack — returns false (and emits nothing) with no pack
        bakedModel, bakedModels: () => (typeof Assets !== "undefined" ? Assets.models() : []),
      };
      // Reversed lap: flip the s-fraction (s → 1-s), node index (k → n-k) and
      // side (±1 → ∓1) of every placement helper so bespoke scenery authored for
      // the original direction lands at the correct physical spot and side. This
      // keeps barriers (recordBarrier fills barR/barL) aligned with the road.
      // Direct px[k]/upOf(k) reads inside scenery (a handful, cosmetic only) are
      // not remapped — they stay internally consistent on the reversed centreline.
      // The third case is `sceneryStartFrac`: a FORWARD, racing-space def whose
      // start line has been corrected still needs its scenery rotated back onto
      // the origin it was authored against. Those defs took neither branch
      // above — racing space is the identity remap — so without this they slid
      // round the lap with the line, silently and by thousands of vertices.
      // The wrap stays a no-op when the shift is zero, so untouched circuits
      // are bit-for-bit unchanged.
      if (def.reverse || def.sceneryCoordinates === "source" || TrackSpace.sceneryOriginDelta(def))
        sceneryApi = transformSceneryApi(sceneryApi, def, n);
      def.scenery(sceneryApi);
    }

    // Foliage runs LAST, once every barrier on the circuit is registered, so the
    // world-XZ guard in clearTreeDist() sees the finished set: the per-track
    // treelines queued by forestEdge() during scenery, then the generic roadside
    // scatter deferred out of the FURN pass above.
    for (const a of deferredFoliage) forestEdgeNow.apply(null, a);
    plantRoadsideTrees();

    // Generic lamp masts — EVERY circuit gets them (visible day and night).
    // Street posts and flood banks share one lampPosts list / buildTrackLights
    // bake (same 22 m stride, hw+6 offset, side parity) so each pool reads as
    // cast by a real mast. Street/modern circuits get slim posts with an arm
    // over the track; open circuits get tall flood banks. The lens uses a bright
    // albedo so the prop-emissive (ramped up as the sun drops) makes it glow at
    // night. Theme tints the lens warm (desert) / cool (street/modern) / neutral.
    {
      const stTheme = theme === "street_night" || theme === "street_day" || theme === "modern";
      const mastH = stTheme ? 9 : 13;
      const poleCol = [0.16, 0.16, 0.19];
      const dens = (typeof LightTune !== "undefined" && LightTune.LT &&
        typeof LightTune.LT.lampDensity === "number" && LightTune.LT.lampDensity > 0)
        ? LightTune.LT.lampDensity : 1;
      const mstride = Math.max(1, Math.round((22 / dens) / ds));  // matches buildTrackLights + LAMP DENSITY
      let mi = 0;
      // ── LAMP KIND — decided HERE, once, per post (single source of truth) ──
      // The visible lens albedo and the point light buildTrackLights emits (colour, cone,
      // energy, volumetric weight, glare) all key off this kind, so the fixture
      // you see always matches the light it casts. Authentic CCT spread:
      // sodium 2100K / halogen 3000K / metal-halide 4300K / LED 5000K /
      // heritage globe 2700K / broadcast flood bank 5700K / orange work lamp.
      // Night lens albedos are HDR-ish (>1) so brighter kinds bloom bigger via
      // the emissive path; day albedos stay ≤~1.05 so sun doesn't blow them out.
      const LENS_NIGHT = {
        flood_bank: [1.30, 1.33, 1.40], halide: [1.10, 1.20, 1.18],
        sodium:     [1.32, 0.86, 0.42], halogen: [1.26, 1.06, 0.62],
        led:        [1.16, 1.24, 1.36], globe:   [1.28, 1.00, 0.58],
        work:       [1.12, 0.78, 0.40], fluor:   [1.06, 1.22, 1.02],
      };
      const LENS_DAY = {
        flood_bank: [1.00, 1.01, 1.04], halide: [0.94, 0.99, 0.98],
        sodium:     [1.04, 0.88, 0.62], halogen: [1.02, 0.94, 0.72],
        led:        [0.96, 1.00, 1.05], globe:   [1.04, 0.94, 0.70],
        work:       [0.98, 0.82, 0.58], fluor:   [0.92, 1.00, 0.90],
      };
      // Heritage-globe streets (Monaco, Baku) run globes; other cities mix
      // sodium/LED/halogen; open circuits mix metal-halide/halogen/sodium with
      // the odd work lamp; the pit straight is always broadcast flood banks.
      const globeStreet = fz.lamp === "globe";
      const pickKind = (k, roll) => {
        const frac = k / n;
        if (frac < 0.045 || frac > 0.985) return "flood_bank";
        if (stTheme) {
          if (globeStreet && roll < 0.55) return "globe";
          // Modern venues mix in cool-greenish fluorescent service lighting.
          if (theme === "modern" && roll >= 0.70 && roll < 0.88) return "fluor";
          return roll < 0.42 ? "sodium" : roll < 0.72 ? "led" : "halogen";
        }
        if (roll < 0.07) return "work";
        return roll < 0.50 ? "halide" : roll < 0.78 ? "halogen" : "sodium";
      };
      // Export the EXACT world position + kind of every visible lens so game.js
      // buildTrackLights emits its point light from the real fixture — glare
      // halo, specular streak and volumetric beam all anchor to geometry.
      // onTrack-suppressed masts are simply absent, so no light without a mast.
      track.lampPosts = [];
      for (let k = 0; k < n; k += mstride, mi++) {
        const side = (mi % 2 === 0) ? 1 : -1;
        if (dressingExcluded("lamps", k, side)) continue;
        const a = anchor(k, side, 6);
        if (onTrack(a.c[0], a.c[2], 1.2)) continue;
        const kind = pickKind(k, hash(mi * 13.7 + 3.1));
        const lensCol = (NIGHT ? LENS_NIGHT : LENS_DAY)[kind];
        const b = [a.r, a.u, a.t];
        // Radius bumped 0.17->0.26: at the shadow map's default texel density
        // (~0.03-0.09m/texel across the 32-96m SHADOW DISTANCE range) a 0.34m
        // pole was only ~3.6-11 texels wide — thin enough that its shadow
        // silhouette pops in/out as it crosses texel boundaries while driving
        // past, and masts repeat every ~22m (buildTrackLights' stride), so the
        // aliasing reads as a regular "picket fence" of stripes sweeping toward
        // the camera. Widening the footprint (~1.5x) reduces how often a
        // texel-boundary crossing flips the whole silhouette; the visible pole
        // is only modestly thicker (barely perceptible at driving distance).
        // Does not fully eliminate thin-caster aliasing — a proper fix would
        // need a separate, shadow-only fatter proxy mesh.
        addCyl(out, a.c, 0.26, mastH, poleCol, 6, b);
        const top = vadd(a.c, a.u, mastH);
        let lens;
        if (kind === "globe") {
          // Heritage twin-globe head: two glowing spheres on a short crossbar.
          addBox(out, top, [1.6, 0.16, 0.3], poleCol, b);
          for (const e of [-1, 1])
            addBox(out, vadd(vadd(top, a.r, -side * 0.2 + e * 0.55), a.u, 0.28), [0.55, 0.6, 0.55], lensCol, b);
          lens = vadd(vadd(top, a.r, -side * 0.2), a.u, 0.28);
        } else if (stTheme) {
          const arm = vadd(top, a.r, -side * 1.0);
          addBox(out, arm, [2.0, 0.26, 0.45], poleCol, b);
          lens = vadd(arm, a.r, -side * 0.85);
          addBox(out, lens, [0.9, 0.42, 0.66], lensCol, b);
        } else {
          addBox(out, top, [2.6, 1.0, 1.2], [0.70, 0.70, 0.74], b);
          lens = vadd(top, a.r, -side * 0.7);
          addBox(out, lens, [2.2, 0.8, 0.4], lensCol, b);
        }
        track.lampPosts.push({ k, side, x: lens[0], y: lens[1], z: lens[2], kind });
      }
    }
    // Circuit-registered fixtures ride the same export, so buildTrackLights needs
    // no second code path — they are lamp posts that happened to be modelled by a
    // scenery() callback instead of by the generic mast pass. Appended AFTER it
    // because that pass assigns track.lampPosts fresh. Mast lamps from
    // floodMast()/floodMastRing() follow the same rule (fixtures that emit).
    for (const lamp of customLamps) track.lampPosts.push(lamp);
    for (const lamp of mastLamps) track.lampPosts.push(lamp);
    track.hasAlwaysLamps = customLamps.some((lamp) => lamp.always);

    // bridge supports: pillars from the ground up to the raised deck, set a
    // little along the deck from the exact crossing so they clear the lower road
    // Anchored with the SAME dressing shift buildCenterline uses to raise the
    // deck ((b.s + _sceneryShift) % 1) — reading b.s raw put Suzuka's four pillar
    // pairs at racing frac 0.817 while the deck they support is at 0.437.
    // Same omission class as the bankZones fix (ed5a310f).
    // NOTE (measured, suzuka — the only def with `bridges`): pillars at hw+0.7
    // with half-extent 0.8 were always culled by rejBox (0.7 < hw+0.8). Emit
    // through RAW so the supports beside the raised deck actually ship.
    const brs = def.bridges;
    if (brs) for (const b of brs) {
      const kc = Math.round(TrackSpace.wrap01(b.s + (def._sceneryShift || 0)) * n) % n;
      for (const off of [-18, -9, 9, 18]) {
        const k = ((kc + off) % n + n) % n;
        const deckY = py[k];
        if (deckY < 1) continue;
        const r = [track.rx[k], track.ry[k], track.rz[k]];
        const tg = [track.tx[k], 0, track.tz[k]];
        for (const side of [-1, 1]) {
          const o = side * (hw[k] + 2.0);
          RAW.addBox(out, [px[k] + r[0] * o, deckY / 2 - 0.3, pz[k] + r[2] * o],
                 [1.6, deckY + 0.4, 1.6], [0.42, 0.42, 0.47], [r, [0, 1, 0], tg]);
          blockAt(k, side, 2.0, 1);   // solid pillar at the deck edge
        }
      }
    }
    if (out.pos.length === 0) addBox(out, [px[0] + 30, 1, pz[0]], [2, 2, 2], [0.4, 0.4, 0.4]);
    {
      const sk = Object.keys(_suppressed);
      if (sk.length) Log.warn("scenery", def.id + ": suppressed " + sk.map((k) => k + "=" + _suppressed[k]).join(" "));
      if (_culled) Log.info("track", `${def.id}: culled ${_culled} on-track primitive(s)`);
    }
    flushAsm();          // the last anonymous run has no successor to close it
    // Swap every named record's guessed envelope for what it actually emitted.
    for (const rec of propList) {
      const m = rec._m;
      if (!m) continue;
      const r1 = (v) => Math.round(v * 10) / 10;
      rec.x = r1((m.x0 + m.x1) / 2); rec.y = r1((m.y0 + m.y1) / 2);
      rec.z = r1((m.z0 + m.z1) / 2);
      rec.w = r1(m.x1 - m.x0); rec.h = r1(m.y1 - m.y0); rec.d = r1(m.z1 - m.z0);
      rec.measured = true;
      delete rec._m;
    }
    Log.info("track", "buildProps done " + def.id + " verts=" + (out.pos.length / 3));
    return { out: TrackModels.sealGeometry(out), glass: TrackModels.sealGeometry(glassBuf), water: TrackModels.sealGeometry(waterBuf) };
  }

  function buildGate(track) {
    const out = { pos: [], nrm: [], col: [], idx: [] };
    // Always-on red-leg start/finish arch (drawn every circuit). Per-track
    // gantry() calls are separate scenery — both can coexist at the line.
    // Sit the gate ~15 m BEFORE the start/finish along the lap centreline —
    // NOT along node-0's tangent chord. On a curved pit straight the chord
    // drifts off the racing line (COTA/Shanghai/Jeddah were 4–8 m sideways,
    // planting one red leg on the asphalt).
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

  // Chequered start/finish line: a grid of black/white squares laid as a thin
  // decal across the road at s=0, sitting a hair above the asphalt and following
  // the local road basis (so it banks/slopes with the surface).
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
    return out;
  }

  // ---------- circuit layouts (turn += LEFT, lengths in meters pre-SCALE) ----------
  // palettes
  function dayPal(o) {
    const p = Object.assign({
      zenith: [0.18, 0.40, 0.78], horizon: [0.62, 0.74, 0.88], sun: [1, 0.96, 0.85],
      grass: [0.18, 0.42, 0.16], runoff: [0.55, 0.42, 0.28], fog: [0.62, 0.74, 0.88],
      asphalt: [0.16, 0.17, 0.19], line: [0.95, 0.95, 0.98],
      fogDensity: 0.0017, kerbA: [0.85, 0.12, 0.12], kerbB: [0.95, 0.95, 0.95], concrete: [0.50, 0.48, 0.44],
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
      fogDensity: 0.0023, kerbA: [0.85, 0.12, 0.12], kerbB: [0.92, 0.92, 0.92], concrete: [0.42, 0.40, 0.38],
      ambientSky: [0.62, 0.64, 0.76], ambientGround: [0.44, 0.44, 0.48],
      sunColor: [0.7, 0.72, 0.8], sunDir: [0.1, 0.9, 0.2],
    }, o);
    if (o && o.fogColor && o.fog == null) p.fog = o.fogColor;
    p.sunDir = norm(p.sunDir);
    return p;
  }

  // Circuit definitions live in js/circuits/<id>.js — each registers itself on the
  // global TrackDefs list (loaded before this engine). Palette is resolved here
  // from the `night` flag; bridges/elevations/street travel with each def.
  const DEFS = (typeof window !== "undefined" && window.TrackDefs) || [];

  // Surveyed elevation profile lookup. js/track/circuit-elevations.js (baked offline
  // by tools/bake-elevation.mjs from SRTM) registers CircuitElevations[id] as an
  // array of metres, relative to the start, sampled evenly by arc-fraction. When
  // present it supersedes the authored cosine `elevations` bumps for that
  // circuit. Returns null when no profile is loaded (the shipped default) —
  // callers fall back to the authored bumps on null, so 0 would be a real
  // elevation and would flatten the circuit instead.
  function elevationAt(id, frac) {
    const prof = (typeof CircuitElevations !== "undefined") && CircuitElevations[id];
    if (!prof || !prof.length) return null;
    const M = prof.length, f = (((frac % 1) + 1) % 1) * M;
    const i = Math.floor(f) % M, j = (i + 1) % M, t = f - Math.floor(f);
    return prof[i] + (prof[j] - prof[i]) * t;
  }
  function hasRealElevation(id) {
    return (typeof CircuitElevations !== "undefined") && !!(CircuitElevations[id] && CircuitElevations[id].length);
  }

  // Real circuit centerlines (js/track/geo-paths.js): projected OSM traces in metres.
  // We use the real layout instead of the authored segment lists. Points are
  // kept flat (y = 0) unless a surveyed elevation profile is loaded — the old
  // per-segment elevation distributed a vertical residual that tilted the whole
  // loop, which is the height glitch on Monaco; the profile path closes the
  // elevation seam explicitly instead.
  function realPoints(id, baseHW) {
    const path = (typeof CircuitPaths !== "undefined") && CircuitPaths[id];
    if (!path) return null;
    const N = path.pts.length;
    const real = hasRealElevation(id);
    let pts = path.pts.map((p, i) => [p[0], real ? elevationAt(id, i / N) : 0, p[1], baseHW, 0]);
    // light closed-loop smoothing to take the digitisation jitter off the
    // raw trace so the Catmull-Rom pass doesn't overshoot at noisy vertices
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
      // close the elevation loop: ramp out any start↔end residual so the lap
      // meets itself seamlessly (same idea as the xz closure in centerline()).
      const eEnd = pts[N - 1][1] - pts[0][1];
      for (let i = 0; i < N; i++) pts[i][1] -= eEnd * (i / (N - 1));
    }
    return pts;
  }

  // Overlay half-width zones onto control points (CircuitPaths traces ignore segs
  // `w:` — this is how Castle Section / hairpin squeezes land on real layouts).
  // zones: [{ s0, s1, hw, ease? }] — s0→s1 may wrap (s1 < s0). Soft edges via ease
  // (lap fraction, default 0.025). Multiple zones: lowest hw wins at each node.
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
      // A REAL grand prix distance for this circuit, by the actual regulation:
      // the fewest laps exceeding 305 km (Monaco alone runs to 260 km). Derived
      // from lengthKm rather than authored as 40 numbers, so a circuit whose
      // length is corrected gets the right race without a second edit — and so
      // there is no table to fall out of step. Spa 44, Monza 53, Silverstone 52.
      // lengthKm is stored to 1 dp, which can leave a circuit one lap off its
      // real figure (Monaco reads 79 against a true 78); the shape of the race
      // is what this is for, not the record book.
      gpLaps: Math.ceil((d.id === "monaco" ? 260 : 305) / (d.lengthKm || 5)),
      night: d.night, theme: d.theme, lengthKm: d.lengthKm,
      // Retired / off-calendar circuit: playable everywhere, but NOT a
      // championship round (see SEASON below).
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
      // `pal` note in js/game/atmosphere.js); nobody swept the rest. The guard
      // in tests/unit/circuit-def-fields.test.mjs is what stops the sixth.
      sunAzimBias: d.sunAzimBias,
      sceneryTheme: d.sceneryTheme,
      sceneryThemeOverrides: d.sceneryThemeOverrides || null,
      ownPitStraight: !!d.ownPitStraight,
      undulate: d.undulate,
      // bespoke per-circuit scenery (js/circuits/<id>.js); run by buildProps
      scenery: d.scenery || null,
      // surveyed elevation (if js/track/circuit-elevations.js is loaded) is baked into
      // the points below and supersedes the authored cosine bumps.
      elevations: hasRealElevation(d.id) ? null : (d.elevations || null),
      // Half-width overlays for CircuitPaths traces (segs `w:` is ignored there).
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
      // Curated FIA-aligned sector splits + turn apexes (js/track/markings.js).
      // Authored in RACING-LAP space (post startFrac/reverse) — do not fmap.
      sectors: (typeof CircuitMarkings !== "undefined" && CircuitMarkings[d.id] && CircuitMarkings[d.id].sectors) || null,
      turns:   (typeof CircuitMarkings !== "undefined" && CircuitMarkings[d.id] && CircuitMarkings[d.id].turns)   || null,
    };
    // PERF-FINDINGS: boot ran realPoints/centerline for all 40 circuits (24.0 ms)
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

  // Run the eager-LIST points pipeline once, then pin `def.points` as a plain
  // array so later reads skip the accessor. Closed over by the LIST getter and
  // by ensurePoints (buildCenterline).
  function materializeListPoints(def, d) {
    let pts = realPoints(d.id, d.baseHW) || centerline(d.segs, d.baseHW);
    // Lap-direction + start-line transform.
    //  • `reverse`   flips the traversal so the loop is driven the other way.
    //  • `startFrac` rotates the start/finish line to a chosen fraction of the
    //    ORIGINAL trace (0 = the trace's own first point).
    // The centreline control points and the elevation/bridge s-anchors are
    // remapped here; the matching scenery/barrier s-remap happens when the
    // bespoke scenery() runs (buildProps), driven by def._startFrac/_reverse.
    const phi = TrackSpace.wrap01(def.startFrac || 0);
    // The AUTHORING origin for anything that was tuned by eye against the
    // rendered road — see below. Equals `phi` unless the def declares that its
    // dressing predates a start-line correction.
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
      // hwZones stay on the NARROWER guard: they are a source-space index range
      // applied to the control points by index, so they are already origin-
      // independent, and running the remap on a def whose phi is 0 would still
      // wrap an authored s1 of exactly 1 down to 0 and blank the zone.
      if (def.hwZones && (def.reverse || phi)) {
        // Reverse flips endpoint order — swap so [s0,s1] stays a short forward arc
        // (otherwise s1 < s0 wraps and the zone covers most of the lap).
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
  // buildCenterline is the only build entry that needs the array; LIST.find
  // metadata consumers never pay.
  function ensurePoints(def) {
    return def.points;
  }

  // THE CHAMPIONSHIP CALENDAR. `LIST` is every playable circuit; `SEASON` is the
  // subset that forms a season. They used to be the same array, which meant
  // `season.round` doubled as a LIST index — so any circuit added to the game
  // silently became a championship round. Classics are excluded here instead, and
  // season code indexes SEASON (via seasonIndex) rather than LIST.
  const SEASON = LIST.filter((t) => !t.classic);

  // LIST index of a season round (0-based). -1 once the calendar is exhausted,
  // which is the same signal `round >= SEASON.length` gives the callers.
  function seasonIndex(round) {
    const t = SEASON[round];
    return t ? LIST.indexOf(t) : -1;
  }

  // world -> track projection (project) and the barrier-derived driving
  // boundary (wallAt) live in js/track/spline.js — destructured above.
  // Rendered ground height at world (x,z): the max Y of any terrain triangle
  // covering that point (vertical ray-cast against the stashed terrain geometry).
  // Returns null if no terrain covers the point. Debug aid — finds where the
  // carved terrain ends up so props can be checked for floating / gaps.
  // Uniform XZ bucket grid over the terrain triangles, built once per track and
  // keyed on the geometry object so a rebuild invalidates it. Every triangle is
  // inserted into every cell its XZ bounding box touches, so querying one cell
  // sees exactly the triangles the linear scan would have found containing the
  // point — the answer is identical, not approximate.
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

  // Rendered-terrain height at a world XZ, or null where the ribbon doesn't
  // cover. Was a linear scan of EVERY terrain triangle — ~58k on Monza — and
  // buildProps anchors every prop through it, so the cost landed on track build
  // as well as on callers. The grid keeps the same answer 23-177x faster.
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

  // Barycentric containment in XZ, returning the higher of `best` and this
  // triangle's interpolated height. Shared by both terrainY paths so the grid
  // cannot drift from the scan.
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

  function setKeepGeometry(value) {
    keepGeometry = !!value;
    return keepGeometry;
  }

  return { LIST, SEASON, seasonIndex, build, buildCenterline, sample, curvature, onKerb, banking, bankAngle, project, wallAt, terrainY, setKeepGeometry };
})();
