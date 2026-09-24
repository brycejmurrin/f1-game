/* Apex 26 — TrackBuildProps: buildProps orchestration (guards + theme dress + scenery API + lamps + pits).
   Mechanical peel from js/track/tracks.js (Phase 1 readability). Tracks.build calls TrackBuildProps.build.
   Guards stay nested here for a later guards.js PR; scenery(api) contract stays frozen (112 members). */
const TrackBuildProps = (function () {
  "use strict";

  const { MAT, cross, norm, vadd, emit, addBox, addPrism, addPyramid,
          addCone, addCyl, addFrustum, addMountain } = TrackGeom;
  const { curvature } = TrackSpline;
  const { upOf, hash, findCorners, bankOffsetAt, nodeGrid } = TrackMesh;
  const lerp = M4.lerp, __M = Math, __isFinite = Number.isFinite;

  const RAW = { addBox, addCyl, addCone, addFrustum, addPrism, addPyramid, addMountain };

  function transformSceneryApi(api, def, n) {
    const RK = (k) => TrackSpace.sceneryNode(def, k, n);
    const RS = (s) => TrackSpace.sceneryFrac(def, s);
    const SIDE = (side) => def.reverse ? -side : side;
    const w = Object.assign({}, api);
    // (k, side, ...rest): index + side based
    for (const name of ["place", "prop", "backdrop", "groundPlane", "anchor", "pine", "tree",
                        "palm", "conifer", "building", "house", "motorhome", "tower", "billboard",
                        "marshalPost", "bush", "signBoard", "ferrisWheel", "floodMast", "runoffApron",
                        "cameraTower", "broadcastCompound", "waterSurface",
                        "cypress", "stonePine", "broadleafFall", "acacia", "plane"]) {
      const f = api[name]; if (f) w[name] = (k, side, ...r) => f(RK(k), SIDE(side), ...r);
    }
    // (id, k, side, ...rest): the MODEL ID comes first. bakedModel must take the
    // same origin shift and reverse flip as the procedural call it stands in for
    // — unwrapped, the baked asset stood 2/3 of a lap away on every shifted
    // circuit that ships one — but it cannot ride the (k, side) list above,
    // because that list remaps argument 0, and argument 0 here is a string.
    // Measured before this line existed: across the 15 call sites on vegas,
    // monaco, spa, monza and silverstone, all 152 calls reached
    // Assets.modelSync as NaN (or, on a source-space def, a node number
    // coerced out of the id), so modelSync never matched a model, bakedModel
    // always returned false, and the whole baked pack was dead on every
    // circuit that asks for it — invisible because the `if (!bakedModel(…))`
    // fallback quietly drew the procedural shape instead.
    if (api.bakedModel)
      w.bakedModel = (id, k, side, ...r) => api.bakedModel(id, RK(k), SIDE(side), ...r);
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
    // (s0, s1, stepM, fn, tag?): fraction range, no side.
    // Remap the span into engine frame (same as wall/fence), but hand the
    // callback AUTHORIZED-frame k. along walks engine nodes; wrapped helpers
    // then apply sceneryNode once. Passing engine k through made every
    // anchor/tree/place/bakedModel inside the callback double-shift (Imola
    // ~1.8 km / Spa ~277 m — docs/BUGS.md S1). Engine-internal ctx.along
    // (wall/fence closures) is untouched and stays single-shift.
    if (api.along) w.along = (s0, s1, stepM, fn, tag) => {
      const range = TrackSpace.sceneryRange(def, s0, s1);
      if (typeof fn !== "function") return api.along(range.s0, range.s1, stepM, fn, tag);
      return api.along(range.s0, range.s1, stepM, (kEng, spacing) => {
        fn(TrackSpace.sceneryNodeToAuthored(def, kEng, n), spacing);
      }, tag);
    };
    // (s, …): single fraction, no side (gantry / underpass portal)
    if (api.gantry) w.gantry = (s, ...r) => api.gantry(RS(s), ...r);
    if (api.underpassPortal) w.underpassPortal = (s, ...r) => api.underpassPortal(RS(s), ...r);

    // Six more entry points take a node index or a lap fraction and are absent
    // from the lists above, so they never moved with the rest: `groundPatch`
    // (34 circuits), `overheadSpan` (18), `circuitKit` (16), `groundedSegments`
    // (9), `waterField`, and the `frameAt` lookup itself. That gap is why
    // Miami's Turnpike overpass and Singapore's kit-built pit building were the
    // last two required models left in the road after the origin move.
    //
    // Default: ORIGIN SHIFT ONLY — no side flip, no reverse/mirror remap. That
    // is deliberate and conservative: the same emitters are unremapped on the
    // reverse-only circuits (monaco, kyalami, paul_ricard) TODAY, so giving
    // them the full treatment here would silently move already-shipped geometry.
    //
    // Exception: `sceneryLapMirror` circuits (singapore): ONLY frameAt and
    // overheadSpan take the mirrored remapS — the portal-deck case that landed
    // ~half a lap from anchor()-placed supports. The k-keyed helpers and
    // circuitKit stay SHIFT-ONLY on purpose: singapore's authored fracs are
    // tuned against shift-only (the KOLD legend in js/circuits/singapore.js).
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
      const remapS = doMirror ? RS : SS;
      for (const name of ["groundPatch", "waterField"]) {
        const f = api[name]; if (f) w[name] = (k, side, ...r) => f(SK(k), side, ...r);
      }
      if (api.frameAt) w.frameAt = (frac, ...r) => api.frameAt(remapS(frac), ...r);
      if (api.overheadSpan) w.overheadSpan = (spec) => api.overheadSpan(
        spec && Number.isFinite(spec.frac) && !spec.rawFrac
          ? Object.assign({}, spec, { frac: remapS(spec.frac) }) : spec);
      if (api.groundedSegments) w.groundedSegments = (spec) => api.groundedSegments(
        spec && Array.isArray(spec.points)
          ? Object.assign({}, spec, { points: spec.points.map((pt) => Object.assign({}, pt, { k: SK(pt.k) })) })
          : spec);
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

  // Painted lens albedo per lamp kind (js/lighting/track-lights.js LAMP_KINDS):
  // over-white at night so the head glows in the props draw, plain by day.
  const LENS_NIGHT = {
    flood_bank: [1.30, 1.33, 1.40], halide: [1.10, 1.20, 1.18],
    sodium:     [1.32, 0.86, 0.42], halogen: [1.26, 1.06, 0.62],
    led:        [1.16, 1.24, 1.36], globe:   [1.28, 1.00, 0.58],
    work:       [1.12, 0.78, 0.40], fluor:   [1.06, 1.22, 1.02],
    signal:     [1.55, 0.22, 0.18],
  };
  const LENS_DAY = {
    flood_bank: [1.00, 1.01, 1.04], halide: [0.94, 0.99, 0.98],
    sodium:     [1.04, 0.88, 0.62], halogen: [1.02, 0.94, 0.72],
    led:        [0.96, 1.00, 1.05], globe:   [1.04, 0.94, 0.70],
    work:       [0.98, 0.82, 0.58], fluor:   [0.92, 1.00, 0.90],
    signal:     [1.15, 0.24, 0.20],
  };

  function build(track) {
    Log.info("track", "buildProps start " + (track.def && track.def.id));
    const { NC, DC, BLD, CROWD_DAY, WINTINTS, HOUSE_WALLS, HOUSE_ROOFS,
            MOTORHOME_BODY, SIGN_SEG, SIGN_DIGIT, FURN_DEF,
            THEME_DEF, ATM, COL, resolveCityStyle } = TrackSceneryData;
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
    const out = TrackModels.scratch();
    const glassBuf = TrackModels.scratch();
    const waterBuf = TrackModels.scratch();
    // Cells already emitted this build — overlapping waterBand/waterField calls
    // skip duplicates instead of stacking coplanar quads (docs/BUGS.md S7).
    const waterOccupied = new Set();
    const def = track.def, theme = def.theme, pal = def.palette, ds = track.total / n;
    const NIGHT = track._night != null ? track._night : !!def.night;

    // Rendered-terrain raycast for exact prop anchoring: anchor-based props
    // (walls, fences, trees) sit on the ACTUAL carved/clipped terrain ribbon
    // rather than the closed-form groundYAt approximation, so they never float
    // or sink where the ribbon is lowered (corner-inside verges, the channel cut
    // through an elevation mound — Miami s≈0.11). Triangles are binned into a
    // coarse XZ grid so each lookup is ~O(1); huge distant triangles are skipped
    // (props are never that far out — those fall back to groundYAt).
    const _tg = track.terrainGeo;
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

    // Hard guarantee: NO scenery primitive may sit on the racing surface.
    // Every shape — the helpers below AND the raw emitters handed to each
    // circuit's bespoke scenery() — funnels through these guarded wrappers.
    // Before emitting, a primitive's ground footprint is tested against the
    // tarmac at road height; if it covers any part of the road it is dropped
    // whole, so a misplaced or self-overlapping prop (common on street
    // circuits whose straights run close in world space) can never enclose the
    // chase camera or wall off the track. Sub-grade slabs (water, the universal
    // ground floor) sit below road level and are exempt via the topY check.
    let _culled = 0;
    const _suppressed = Object.create(null), _superseded = Object.create(null);
    const noteSuppressed = (kind, msg) => {
      // A drop the PIT COMPLEX caused is not the guard margin's: the prop stood
      // where the engine now builds the lane, the wall or the garages. It goes
      // on its own counter so the guard suites keep measuring the guard.
      const bag = _pitReject ? _superseded : _suppressed;
      bag[kind] = (bag[kind] || 0) + 1;
      if (Log.enabled("scenery", Log.DEBUG)) Log.debug("scenery", msg);
    };
    const diagnostics = track.modelDiagnostics = {
      emitted: [], suppressed: [], invalid: [], unsafe: [],
      suppressedCounts: _suppressed,   // per-kind guard drops (tests/unit/scenery-guards)
      supersededByPit: _superseded,    // per-kind drops the pit complex caused (js/track/core/pit.js)
    };

    // Everything buildProps places goes straight into vertex buffers and is then
    // anonymous: the footprint list and spatial hash below are function-local and
    // die with this call, so after a build nothing can answer "is there a
    // grandstand on my left". The renderer's 72 m chunk AABBs locate scenery MASS
    // but cannot name it.
    //
    // note() records the semantic placements only — a tree, a building, a
    // grandstand — NOT every primitive. Vegas emits ~94k primitives; a tree alone
    // is a trunk plus several canopy tiers, so recording primitives would cost far
    // more and say far less. Consumed by __apex.scene() (js/agent/agentview.js).
    //
    // Recording happens at the point of emission, AFTER each emitter's on-track
    // and mass-collision guards, so a suppressed prop never enters the registry —
    // the list describes what actually stands there.
    const PROP_CAP = 40000;
    const propList = [];
    let propDropped = 0;
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
      asm.vol += __M.max(x1 - x0, 0.05) * __M.max(y1 - y0, 0.05) * __M.max(z1 - z0, 0.05);
      if (x0 < asm.x0) asm.x0 = x0; if (x1 > asm.x1) asm.x1 = x1;
      if (y0 < asm.y0) asm.y0 = y0; if (y1 > asm.y1) asm.y1 = y1;
      if (z0 < asm.z0) asm.z0 = z0; if (z1 > asm.z1) asm.z1 = z1;
      asm.count++;
      // running centroid keeps a long facade run from anchoring on its first box
      asm.cx += (cx - asm.cx) / asm.count;
      asm.cz += (cz - asm.cz) / asm.count;
    };
    const absorbBox = (c, sz) => absorb(c[0] - sz[0] / 2, c[1] - sz[1] / 2, c[2] - sz[2] / 2,
                                        c[0] + sz[0] / 2, c[1] + sz[1] / 2, c[2] + sz[2] / 2);
    const absorbUp = (c, r, h) => absorb(c[0] - r, c[1], c[2] - r,
                                         c[0] + r, c[1] + h, c[2] + r);

    track.props = { list: propList, spans: spanList, cap: PROP_CAP,
                    get count() { return propList.length; },
                    get spanCount() { return spanList.length; },
                    get dropped() { return propDropped; } };
    // Plain loop — the every() form allocated a closure per call (~200k calls/build).
    const finiteVec = (v, len, positive) => {
      if (!Array.isArray(v) || v.length !== len) return false;
      for (let i = 0; i < len; i++) {
        const x = v[i];
        if (!__isFinite(x) || (positive && !(x > 0))) return false;
      }
      return true;
    };
    const grid = nodeGrid(track);              // shared node grid (built in buildRoad)
    const _hitCand = new Array(n), _trkCand = new Array(n);   // reusable query scratch
    // THE PIT COMPLEX IS ROAD to the guards: on the pit side, across the
    // window, a node's half-width grows by the complex's footprint, so no prop
    // — a tree, a hull, a kit building — can be placed on the lane, the wall,
    // the apron or the garages. The complex's own furniture (SceneryPits) uses
    // the RAW emitters and never asks.
    const pitKeep = track.pit ? track.pit.keep : null, pitSide = track.pit ? track.pit.side : 0;
    const pitV = track.pit ? track.pit.v : null, pitVerge = track.pit ? track.pit.bands.verge : 0;
    const pitMax = (() => { let m = 0; if (pitKeep) for (let k = 0; k < n; k++) if (pitKeep[k] > m) m = pitKeep[k]; return m; })();
    // The pit complex is ONE window of the lap, but its keep-out (pitMax,
    // ~30 m) widened every guard query everywhere: onRoadHit + onTrack were the
    // top self-time of a build. Pay the wide radius only where the query can
    // reach a pit node at all — its circle, plus a grid cell's diagonal
    // (node grid CELL = 10 m, so a returned node may sit ~14.2 m outside R),
    // against the pit nodes' bounding box. Elsewhere no pit node can be a
    // candidate, so the pit branch cannot fire and the road branch rejects
    // beyond rad + hw anyway: the result is identical, measured byte-for-byte
    // on all 52 circuits (bug hunt 2026-09-22; props phase ~20 % faster).
    const pitBox = (() => {
      if (!pitKeep || !(pitMax > 0)) return null;
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let k = 0; k < n; k++) if (pitKeep[k] > 0) {
        if (px[k] < x0) x0 = px[k]; if (px[k] > x1) x1 = px[k];
        if (pz[k] < z0) z0 = pz[k]; if (pz[k] > z1) z1 = pz[k];
      }
      return x0 <= x1 ? { x0, x1, z0, z1 } : null;
    })();
    const PIT_GATE_PAD = 15;
    const nearPit = (x, z, r) => !!pitBox && x + r + PIT_GATE_PAD >= pitBox.x0 && x - r - PIT_GATE_PAD <= pitBox.x1 &&
      z + r + PIT_GATE_PAD >= pitBox.z0 && z - r - PIT_GATE_PAD <= pitBox.z1;
    // The complex's footprint at node k as a lateral RANGE on the pit side,
    // [beyond the verge, its far edge]: the verge itself stays placeable, so a
    // gantry leg or a marshal post can still stand between the track and the
    // wall exactly as it does on a real pit straight.
    const pitFastIn = track.pit ? track.pit.off.fastIn : 0;
    const inPitFootprint = (k, lat, halfLat, outerMargin) => {
      if (!pitKeep || !(pitKeep[k] > 0)) return false;
      // The verge AND the platform stay placeable (a gantry leg, a post, a
      // marshal stand on a real pit straight); the lane tarmac onward is the
      // complex's alone. `outerMargin` is a clearance a caller asks for from
      // the OUTER edge only — clearTreeDist asks with the crown radius, so a
      // tree pushes out until its crown clears the garages instead of
      // standing at the line with its crown through the roofs. Nobody else
      // asks: a lake's or a backdrop's road clearance is not a pit clearance
      // (Shanghai's required lake was superseded the moment it was).
      const a0 = hw[k] + Math.max(pitVerge, pitFastIn * pitV[k]) + 0.3, a1 = hw[k] + pitKeep[k];
      const c = lat * pitSide;
      return c + halfLat > a0 && c - halfLat - (outerMargin || 0) < a1;
    };
    // Set by onRoadHit when the hit was the PIT COMPLEX rather than the road,
    // so a rejected model can be recorded as superseded rather than as a
    // failure: a circuit's hand-placed pit block, tower or bay now stands
    // where the engine builds the complex, and dropping it is the intent.
    let _pitReject = false;
    const onRoadHit = (cx, cz, topY, rad, arx, arz, afx, afz, hx, hz, botY) => {
      const mhFull = grid.maxHw + pitMax;
      const rFull = (rad > 0 ? rad + mhFull : __M.hypot(hx + mhFull, hz + mhFull)) + 2;
      const mh = nearPit(cx, cz, rFull) ? mhFull : grid.maxHw;
      // The complex keeps FOOTINGS out, not a crown: a RADIAL primitive (a
      // tree's canopy tier) whose underside is well above the road may reach
      // over the complex's edge, the way a crown reaches over a verge. Testing
      // every tier of a tree at the edge dropped its middle and kept its top,
      // which the float sweep reported on thirty circuits. Boxes never get
      // the exemption: a building's upper storey over the complex with its
      // ground floor superseded is the same float from the other side.
      const R = (rad > 0 ? rad + mh : __M.hypot(hx + mh, hz + mh)) + 2;
      const _cn = grid.query(cx, cz, R, _hitCand, false);
      for (let _ci = 0; _ci < _cn; _ci++) {
        const k = _hitCand[_ci];
        if (topY < py[k] - 0.3) continue;                 // sits below road here
        const w = hw[k];
        if (pitKeep && pitKeep[k] > 0 && !(botY > py[k] + 2.5)) {
          // The pit complex: the footprint's lateral reach at this node against
          // the complex's range, provided the node lies along the footprint.
          const lat = (cx - px[k]) * track.rx[k] + (cz - pz[k]) * track.rz[k];
          const along = (cx - px[k]) * track.tx[k] + (cz - pz[k]) * track.tz[k];
          const halfLat = rad > 0 ? rad : __M.abs(arx * track.rx[k] + arz * track.rz[k]) * hx + __M.abs(afx * track.rx[k] + afz * track.rz[k]) * hz;
          const halfAlong = rad > 0 ? rad : __M.abs(arx * track.tx[k] + arz * track.tz[k]) * hx + __M.abs(afx * track.tx[k] + afz * track.tz[k]) * hz;
          if (__M.abs(along) <= halfAlong + ds && inPitFootprint(k, lat, halfLat)) { _pitReject = true; return true; }
        }
        const dxc = px[k] - cx, dzc = pz[k] - cz;
        // Reach to the farthest footprint point: an oriented box can extend to its
        // half-DIAGONAL, not just max(hx,hz), so the prefilter must use the diagonal
        // or it will skip road nodes a large rotated box actually covers.
        // Far reject: the Minkowski test below expands the footprint by w on each
        // axis, so the prefilter reach must use the EXPANDED half-extents (a thin
        // box's hit corner can sit at hypot(hx+w, hz+w) from centre).
        const reach = (rad > 0 ? rad + w : __M.hypot(hx + w, hz + w)) + 2;
        if (dxc * dxc + dzc * dzc > reach * reach) continue;   // cheap far reject
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
      _pitReject = false;
      const r = basis ? basis[0] : [1, 0, 0], u = basis ? basis[1] : [0, 1, 0], f = basis ? basis[2] : [0, 0, 1];
      const topY = c[1] + __M.abs(sz[0] / 2 * r[1]) + __M.abs(sz[1] / 2 * u[1]) + __M.abs(sz[2] / 2 * f[1]);
      return onRoadHit(c[0], c[2], topY, 0, r[0], r[2], f[0], f[2], sz[0] / 2, sz[2] / 2);
    };
    const rejRad = (c, rad, h, basis, crown) => {
      _pitReject = false;
      const u = basis ? basis[1] : [0, 1, 0];
      const topY = c[1] + __M.max(0, h * u[1]) + rad;     // generous top estimate
      // A CROWN (cone, frustum) hands its underside over so it may reach over
      // the complex's edge — the base centre, not `c - rad`: a 16 m tier 10 m
      // up read as a footing with the radius taken off, and Monza's poplars
      // lost their lowest tier. A cylinder is a post or a mast: a footing,
      // whose head must not outlive it.
      return onRoadHit(c[0], c[2], topY, rad, 0, 0, 0, 0, 0, 0, crown ? c[1] + __M.min(0, h * u[1]) : undefined);
    };
    const badPrimitive = (kind, c, size) => {
      // COPY c: graph.xform hands out a pooled triple, and this record outlives the op.
      diagnostics.invalid.push({ id: kind, reason: "non-finite primitive dimensions",
        center: Array.isArray(c) ? c.slice() : c, size });
      return false;
    };
    // Tri-state verdict cache (1=pass 0=culled 2=invalid): the graph's fuse
    // replay reuses the dry run's guard verdicts — mechanism in graph.instance.
    const addBox = (o, c, sz, col, basis) => {
      const tv = o._replayVerdicts;
      if (tv) { const v = tv[o._vIdx++]; if (v !== 1) return v === 0 ? (_culled++, false) : badPrimitive("box", c, sz); }
      else {
        if (!finiteVec(c, 3, false) || !finiteVec(sz, 3, true)) { if (o._recVerdicts) o._recVerdicts[o._vIdx++] = 2; return badPrimitive("box", c, sz); }
        if (rejBox(c, sz, basis)) { o._pitRejected = _pitReject; if (o._recVerdicts) o._recVerdicts[o._vIdx++] = 0; if (!o._dryRun) _culled++; return false; }
        if (o._recVerdicts) o._recVerdicts[o._vIdx++] = 1;
        if (o._dryRun) return true;
      }
      if (o._absorbOnly) { absorbBox(c, sz); return true; }
      RAW.addBox(o, c, sz, col, basis); absorbBox(c, sz); return true;
    };
    const addCyl = (o, c, rad, h, col, seg, basis) => {
      const tv = o._replayVerdicts;
      if (tv) { const v = tv[o._vIdx++]; if (v !== 1) return v === 0 ? (_culled++, false) : badPrimitive("cylinder", c, [rad, h]); }
      else {
        if (!finiteVec(c, 3, false) || !__isFinite(rad) || rad <= 0 || !__isFinite(h) || h <= 0) { if (o._recVerdicts) o._recVerdicts[o._vIdx++] = 2; return badPrimitive("cylinder", c, [rad, h]); }
        if (rejRad(c, rad, h, basis)) { o._pitRejected = _pitReject; if (o._recVerdicts) o._recVerdicts[o._vIdx++] = 0; if (!o._dryRun) _culled++; return false; }
        if (o._recVerdicts) o._recVerdicts[o._vIdx++] = 1;
        if (o._dryRun) return true;
      }
      if (o._absorbOnly) { absorbUp(c, rad, h); return true; }
      RAW.addCyl(o, c, rad, h, col, seg, basis); absorbUp(c, rad, h); return true;
    };
    const addCone = (o, c, rad, h, col, seg, basis) => {
      const tv = o._replayVerdicts;
      if (tv) { const v = tv[o._vIdx++]; if (v !== 1) return v === 0 ? (_culled++, false) : badPrimitive("cone", c, [rad, h]); }
      else {
        if (!finiteVec(c, 3, false) || !__isFinite(rad) || rad <= 0 || !__isFinite(h) || h <= 0) { if (o._recVerdicts) o._recVerdicts[o._vIdx++] = 2; return badPrimitive("cone", c, [rad, h]); }
        if (rejRad(c, rad, h, basis, true)) { o._pitRejected = _pitReject; if (o._recVerdicts) o._recVerdicts[o._vIdx++] = 0; if (!o._dryRun) _culled++; return false; }
        if (o._recVerdicts) o._recVerdicts[o._vIdx++] = 1;
        if (o._dryRun) return true;
      }
      if (o._absorbOnly) { absorbUp(c, rad, h); return true; }
      RAW.addCone(o, c, rad, h, col, seg, basis); absorbUp(c, rad, h); return true;
    };
    const addFrustum = (o, c, rB, rT, h, col, seg, basis) => {
      const tv = o._replayVerdicts;
      if (tv) { const v = tv[o._vIdx++]; if (v !== 1) return v === 0 ? (_culled++, false) : badPrimitive("frustum", c, [rB, rT, h]); }
      else {
        if (!finiteVec(c, 3, false) || !__isFinite(rB) || rB <= 0 || !__isFinite(rT) || rT <= 0 || !__isFinite(h) || h <= 0) { if (o._recVerdicts) o._recVerdicts[o._vIdx++] = 2; return badPrimitive("frustum", c, [rB, rT, h]); }
        if (rejRad(c, __M.max(rB, rT), h, basis, true)) { o._pitRejected = _pitReject; if (o._recVerdicts) o._recVerdicts[o._vIdx++] = 0; if (!o._dryRun) _culled++; return false; }
        if (o._recVerdicts) o._recVerdicts[o._vIdx++] = 1;
        if (o._dryRun) return true;
      }
      if (o._absorbOnly) { absorbUp(c, __M.max(rB, rT), h); return true; }
      RAW.addFrustum(o, c, rB, rT, h, col, seg, basis);
      absorbUp(c, __M.max(rB, rT), h); return true;
    };
    const addPrism = (o, c, sz, col, basis) => {
      const tv = o._replayVerdicts;
      if (tv) { const v = tv[o._vIdx++]; if (v !== 1) return v === 0 ? (_culled++, false) : badPrimitive("prism", c, sz); }
      else {
        if (!finiteVec(c, 3, false) || !finiteVec(sz, 3, true)) { if (o._recVerdicts) o._recVerdicts[o._vIdx++] = 2; return badPrimitive("prism", c, sz); }
        if (rejBox(c, sz, basis)) { o._pitRejected = _pitReject; if (o._recVerdicts) o._recVerdicts[o._vIdx++] = 0; if (!o._dryRun) _culled++; return false; }
        if (o._recVerdicts) o._recVerdicts[o._vIdx++] = 1;
        if (o._dryRun) return true;
      }
      if (o._absorbOnly) { absorbBox(c, sz); return true; }
      RAW.addPrism(o, c, sz, col, basis); absorbBox(c, sz); return true;
    };
    const addPyramid = (o, c, sz, col, basis) => {
      const tv = o._replayVerdicts;
      if (tv) { const v = tv[o._vIdx++]; if (v !== 1) return v === 0 ? (_culled++, false) : badPrimitive("pyramid", c, sz); }
      else {
        if (!finiteVec(c, 3, false) || !finiteVec(sz, 3, true)) { if (o._recVerdicts) o._recVerdicts[o._vIdx++] = 2; return badPrimitive("pyramid", c, sz); }
        if (rejBox(c, sz, basis)) { o._pitRejected = _pitReject; if (o._recVerdicts) o._recVerdicts[o._vIdx++] = 0; if (!o._dryRun) _culled++; return false; }
        if (o._recVerdicts) o._recVerdicts[o._vIdx++] = 1;
        if (o._dryRun) return true;
      }
      if (o._absorbOnly) { absorbBox(c, sz); return true; }
      RAW.addPyramid(o, c, sz, col, basis); absorbBox(c, sz); return true;
    };
    const addMountain = (o, c, baseR, h, opts) => {
      if (!finiteVec(c, 3, false) || !__isFinite(baseR) || baseR <= 0 || !__isFinite(h) || h <= 0) return badPrimitive("mountain", c, [baseR, h]);
      if (onRoadHit(c[0], c[2], c[1] + h, baseR, 0, 0, 0, 0, 0, 0)) { _culled++; return false; }
      RAW.addMountain(o, c, baseR, h, opts); absorbUp(c, baseR, h); return true;
    };
    const graph = TrackGraph.create({ raw: RAW });
    track.graph = graph;
    const GUARDED = { addBox, addCyl, addCone, addFrustum, addPrism, addPyramid };
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
    const blockAt = (k, side, innerGap, halfM) => {
      const half = Math.max(0, Math.round((halfM || 0) / ds));
      for (let d = -half; d <= half; d++) markBarrier(((k + d) % n + n) % n, side, innerGap);
    };
    let pyMin = Infinity;
    for (let i = 0; i < n; i++) if (py[i] < pyMin) pyMin = py[i];
    const surface = track.surface || TrackSurface.profile(track.def, track);
    const groundYAt = (k, dist, side) => {
      return surface.heightAt(k, dist, side);
    };
    // The universal ground slab that stood here (a 1600 m addBox under the lap's
    // low point) is gone: buildFloor's mesh already reaches >= 1400 m past the
    // track on every backend, WGX had dropped the slab for its lamp artefacts,
    // and its top fought the terrain on 34 circuits (439 pairs).
    const onTrack = (x, z, margin, pitMargin) => {
      _pitReject = false;
      const rFull = grid.maxHw + pitMax + margin + ds + 1;
      const R = nearPit(x, z, rFull) ? rFull : grid.maxHw + margin + ds + 1;
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
        if (pitKeep && pitKeep[i] > 0) {
          // The POINT against the complex — not the point plus the road
          // margin, which is a clearance from the racing surface and would
          // push a gantry leg or a post off the verge it belongs on — and only
          // where the point lies ALONGSIDE this node: the query radius reaches
          // the whole complex width, so without the along-track bound a post
          // 40 m past the exit road read as inside the last easing node.
          const al = (x - px[i]) * track.tx[i] + (z - pz[i]) * track.tz[i];   // along, from node i
          if (al >= -ds && al <= ds) {
            const sl = (x - px[i]) * track.rx[i] + (z - pz[i]) * track.rz[i];   // signed lateral
            // The caller's road margin counts on the OUTER edge too, capped
            // at 3 m: a hedge asks with its half-width and then emits a box of
            // that width, and a base that passed as a point 15 cm outside
            // the edge shipped the lump on top of a box the guard dropped.
            // The cap keeps a lake's or a backdrop's half-width (their
            // "margin") from superseding a required model whole.
            const outer = __M.max(pitMargin || 0, __M.min(margin || 0, 3));
            if (inPitFootprint(i, sl, 0, outer)) { _pitReject = true; return true; }
          }
        }
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
      // true = clear; false = on the road; "pit" = inside the pit complex, which
      // modelGroup records as superseded rather than as a required failure.
      preflight: (bounds) => (!rejBox(bounds.center, bounds.size, bounds.basis) ? true : (_pitReject ? "pit" : false)),
      emitBox: (buf, c, size, col, basis) => RAW.addBox(buf, c, size, col, basis),
      // A grounded point (node, side, metres beyond the edge, half-width)
      // inside the pit complex: the RAW landform emitters ask this chord by
      // chord, since they never pass the footprint guard.
      inPit: (k, side, dist, halfLat) => {
        const kk = ((Math.round(k) % n) + n) % n;
        if (!inPitFootprint(kk, side * (hw[kk] + dist), halfLat)) return false;
        _superseded.groundedSegments = (_superseded.groundedSegments || 0) + 1;
        return true;
      },
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
          // A leg on the pit complex is tolerated: a gantry or a bridge over
          // the pit straight has to stand somewhere, and a pier on the apron
          // is what a real one does.
          if (rejBox(c, [width, height, spec.depth || 1.4], [frame.r, frame.u, frame.t]) && !_pitReject) return false;
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
          // The engine builds the garages from track.pit now; a circuit's
          // kit.pitBuilding() call is honoured as a no-op so nothing lands twice.
          pitBuilt: !!(track.pit && track.pit.hasBays),
        });
      }
    } catch (_) {
      sceneryTheme = landmarkKit = circuitKit = null;
    }
    const modelGroup = (id, bounds, emit, opts) => models.modelGroup(id, bounds, emit, opts);

    // Every guard in this file is HORIZONTAL (onTrack/rejBox/blockAt keep props
    // off the racing line); nothing asserted that a prop meets the ground, and
    // every floating-scenery defect found by tools/track/float-audit.cjs was vertical.
    // These three close that gap by expressing intent instead of arithmetic.
    const UPV = [0, 1, 0];

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
        let y = terrainYAt(x, z);
        if (y == null) y = Tracks.terrainY(track, x, z);
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
      const rows = new Map();                   // iz -> sorted list of ix
      for (const key of cells.keys()) {
        const p = key.indexOf("|");
        const ix = +key.slice(0, p), iz = +key.slice(p + 1);
        if (onTrack((ix + 0.5) * c, (iz + 0.5) * c, c / 2 + 1.5)) continue;
        if (waterOccupied.has(key)) continue;
        waterOccupied.add(key);
        let a = rows.get(iz); if (!a) rows.set(iz, a = []);
        a.push(ix);
      }
      const y = pyMin - 0.82;   // 2 cm below prior sheet — overlapping bands z-fight less (S5/S7)
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
    const waterBand = (s0, s1, side, gap0, gap1, cell, col, opts) => {
      const c = Math.max(4, cell || 12);
      const k0 = Math.round(s0 * n) % n, k1 = Math.round(s1 * n) % n;
      const span = Math.abs(s1 - s0) >= 1 - 1e-9 ? n - 1 : ((k1 - k0) + n) % n;
      return waterEmit(waterRaster(k0, k0 + span, side, gap0, gap1, c), c, col, opts);
    };
    let patchSeq = 0;
    const groundPatch = (k, side, gap, sz, col, opts) => {
      opts = opts || {};
      if (!finiteVec(sz, 3, true)) {
        diagnostics.invalid.push({ id: opts.id || "ground-patch", reason: "invalid ground-patch dimensions", size: sz });
        return false;
      }
      const r = [track.rx[k], track.ry[k], track.rz[k]], u = upOf(track, k);
      const t = [track.tx[k], track.ty[k], track.tz[k]], pieces = Math.max(2, Math.round(opts.samples || 4));
      // Every patch's top sat AT groundY, so overlapping patches (zolder's dusk
      // sand over its apron) shared one plane, as did a plinth flush with the
      // ground. A per-call slot lifts each 1-5 MIN_SEP: five calls in a row
      // never share a plane.
      const lift = (1 + patchSeq++ % 5) * TrackGeom.MIN_SEP;
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
            groundYAt(k, dist) - sz[1] / 2 + lift,
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
      // Sign-safe wrap: callers hand in `s - halfFrac`, which goes negative for
      // a span crossing the start line, and JS % keeps the sign — a negative k
      // read undefined rx/ry (NaN face) and wrote arr[-k] as a silent no-op, so
      // the pre-seam part of the span got no limit tightening and no index.
      const k0 = ((Math.round(s0 * n) % n) + n) % n, k1 = ((Math.round(s1 * n) % n) + n) % n;
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
      // Same sign-safe wrap as scanBarrier — negative s0 crossed the seam.
      const k0 = ((Math.round(s0 * n) % n) + n) % n, k1 = ((Math.round(s1 * n) % n) + n) % n;
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
    const indexSolidAt = (k, side, dist, halfW, halfLen) => {
      const kk = ((k % n) + n) % n;
      const o = side * (hw[kk] + dist);
      const cx = px[kk] + track.rx[kk] * o, cz = pz[kk] + track.rz[kk] * o;
      const L = Math.max(0, halfLen || 0);
      const tx = track.tx[kk] * L, tz = track.tz[kk] * L;
      pushSeg(cx - tx, cz - tz, cx + tx, cz + tz, Math.max(0, halfW || 0));
    };
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
      if (massGrid) massGridInsert(i);
    };
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
      // The crown is also the clearance from the PIT COMPLEX (the fourth
      // argument): a tree planted at its trunk's radius stood at the garage
      // line with its crown through the bay roofs.
      const ok = (p) => barrierClear(p[0], p[1], crown) && !onTrack(p[0], p[1], crown, crown);
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
      const jitter = hash(k * 7.7 + sz[0] * 3.1 + sz[1] * 5.3 + sz[2] * 1.9) * 0.09;
      const o = side * (hw[k] + dist + jitter);
      const cx = px[k] + r[0] * o, cz = pz[k] + r[2] * o;
      // skip if this prop would overlap a parallel stretch of track
      if (onTrack(cx, cz, sz[0] / 2 + 1.5)) {
        noteSuppressed("place", `place SUPPRESSED at k=${k} side=${side}: dist=${dist} sz[0]=${sz[0]} (need dist>${(sz[0]/2+1.5).toFixed(1)})`);
        return;
      }
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
    const HKSHIFT = Math.round(TrackSpace.sceneryOriginDelta(def) * n);
    const HK = (k) => (((Math.round(k) - HKSHIFT) % n) + n) % n;
    // Phase every() by the same shift so the walk revisits the same places.
    const every = (m, fn) => {
      const stp = Math.max(1, Math.round(m / ds));
      for (let i = 0; i < n; i += stp) fn((i + HKSHIFT) % n);
    };
    // dressingExclusions are authored in the def's scenery frame, exactly like
    // the range helpers on the api (wall / hedge / cityFront …), so each window
    // goes through TrackSpace.sceneryRange and its side flips on a reversed lap
    // — the rule then sits where the circuit's own bespoke calls land. This
    // used to add the origin shift alone: on singapore (reverse + mirror) the
    // "no generic city under my cityFront facades" rules landed on the other
    // side of the road, a third of a lap away. Resolved ONCE per build; an
    // absent s0/s1 still means the whole lap.
    const exclusionRules = (def.dressingExclusions || []).map((rule) => {
      const kinds = rule.kinds || (rule.kind ? [rule.kind] : ["all"]);
      const open = rule.s0 == null || rule.s1 == null;
      const r = open ? { s0: 0, s1: 1 } : TrackSpace.sceneryRange(def, Number(rule.s0), Number(rule.s1));
      const full = open || Math.abs(r.s1 - r.s0) >= 1 - 1e-9;
      const side = rule.side == null ? null : (def.reverse ? -Number(rule.side) : Number(rule.side));
      return { kinds, side, s0: r.s0, s1: r.s1, full };
    });
    const dressingExcluded = (kind, k, side) => {
      if (!exclusionRules.length) return false;
      const frac = (((k % n) + n) % n) / n;
      for (const rule of exclusionRules) {
        let hit = rule.kinds.includes("all") || rule.kinds.includes(kind);
        // Any lighting-family rule matches any lighting-family query.
        if (!hit && LIGHTING_KINDS[kind]) hit = rule.kinds.some((knd) => LIGHTING_KINDS[knd]);
        if (!hit) continue;
        if (rule.side != null && side != null && rule.side !== Number(side)) continue;
        const inside = rule.full || (rule.s1 < rule.s0 ? frac >= rule.s0 || frac <= rule.s1 : frac >= rule.s0 && frac <= rule.s1);
        if (inside) return true;
      }
      return false;
    };

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
      // noteSuppressed, NOT a bare Log.info: this was the only guard in the file
      // that dropped geometry without recording it, so its drops reached no
      // test, no tool and no __apex hook. Given a counter it reported 539
      // suppressed backdrops fleet-wide, 295 at redbull alone (43 % of its
      // calls) — none of it previously observable.
      // MARGIN LEFT ALONE ON PURPOSE. sz[0] is the length ALONG the tangent
      // (addBox below uses basis [t, u, r]; the reach toward the road is
      // sz[2]/2), so this is the along-track-as-radial shape already fixed for
      // billboards in scenery-city.js. The correction is NOT a swap: measured,
      // an oriented footprint test suppresses MORE (618 vs 539) — it recovers
      // 11 and drops 90 that currently render. Numbers and the decision:
      // docs/PERF-FINDINGS.md 2u.
      if (onTrack(cx, cz, sz[0] / 2 + 6)) {
        noteSuppressed("backdrop", `backdrop SUPPRESSED at k=${k} side=${side}: dist=${dist} sz[0]=${sz[0]}`);
        return;
      }
      // distant scenery settles to the lap's low baseline (groundYAt past the last
      // ribbon vert returns it), so a ridge/skyline never floats on a high section
      const cy0 = groundYAt(k, dist) + sz[1] / 2 - 2;
      const greenDom = col[1] > col[0] && col[1] > col[2] * 1.05;
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
      if (isBld) {
        const lit = NIGHT;
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

    const ctx = {
      // output buffers + per-build state
      out, glassBuf, waterBuf, track, def, theme, pal, n, ds, px, py, pz, hw,
      pyMin, NIGHT, MAT, lod,
      // guarded emitters + the raw escape hatch
      addBox, addCyl, addCone, addFrustum, addPrism, addPyramid, addMountain,
      emit, RAW, rejBox, rejRad,
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
      kitOf: (family, fallback) => {
        const D = TrackSceneryData.KIT_DEF || {};
        const row = def.kit || D[theme] || D.green || {};
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

    const bt = def.barrier || { a: [0.92, 0.92, 0.94], b: [0.85, 0.18, 0.16], c: [0.55, 0.57, 0.62], night: [0.18, 0.18, 0.22], tyre: [0.24, 0.22, 0.20] };
    const btSeq = [bt.a, bt.b, bt.c];

    if (def.street) {
      const WH = 1.1, WT = 0.4, STEP = 2;
      const barrierOffset = def.barrierGap != null ? def.barrierGap : 0.35;
      const panel = (kA, kB, col, side) => {
        const rA = [track.rx[kA], track.ry[kA], track.rz[kA]];
        const rB = [track.rx[kB], track.ry[kB], track.rz[kB]];
        const oA = side * (hw[kA] + barrierOffset), oB = side * (hw[kB] + barrierOffset);
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
      // The panel stands ON the pit lane where the complex owns the ground
      // (Baku: on the entry road's tarmac; Monaco, Singapore, Vegas: in the
      // platform band 15-40 cm from the complex's own wall), so the pit side
      // skips every node the keep-out covers — the complex's wall and
      // TrackPit.openBoundary take over there.
      const pitOwned = (k, side) => pitKeep && side === pitSide && pitKeep[k] > 0;
      for (const side of [-1, 1]) {
        for (let k = 0; k < n; k += STEP) {
          const kn = (k + STEP) % n, km = (k + 1) % n;
          if (pitOwned(k, side) || pitOwned(kn, side)) continue;
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
      const off = def.barrierGap != null ? def.barrierGap : 0.35;
      for (let k = 0; k < n; k++) for (const side of [-1, 1]) if (!pitOwned(k, side)) markBarrier(k, side, off);
    }
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
          const wy = py[k] + bankOffsetAt(track, k, o);
          const slen = ds * step * 1.1;
          addBox(out, [px[k] + r[0] * o, wy + 0.45, pz[k] + r[2] * o],
                 [1.0, 0.9, slen], [0.24, 0.22, 0.20], [r, u, t]);
          if (def.barrier) addBox(out, [px[k] + r[0] * o, wy + 0.94, pz[k] + r[2] * o],
                 [1.06, 0.18, slen], bt.tyre, [r, u, t]);
          // record the tyre barrier along its span so the car stops just short of it
          for (let d = 0; d < step; d++) markBarrier((k + d) % n, outside, 2.2);
        }
        indexBarrier((((c.k - lo) % n + n) % n) / n, (((c.k + hi) % n + n) % n) / n, outside, 2.2);
      }
    }

    // Prefer the def's curated `turns`; curvature peaks only if a def lacks them.
    {
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
        const outside = c.sign > 0 ? 1 : -1;
        signBoard(c.k, outside, 3.5, "corner", idx + 1);
        if (hash(c.k * 3.1 + 7) > 0.5) {
          const lo = Math.max(6, c.lo || 14);
          const offs = [Math.round(lo * 0.85), Math.round(lo * 0.5), Math.round(lo * 0.18)];
          [3, 2, 1].forEach((stripes, si) => {
            const kk = ((c.k - offs[si]) % n + n) % n;
            signBoard(kk, outside, 3.0, "braking", stripes);
          });
        }
      });
      const spk = Math.round(n * 0.965) % n;
      signBoard(spk, -1, 4, "speed", def.street ? 60 : 80);
    }

    const fz = def.furniture || FURN_DEF[theme] || FURN_DEF.green;
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
      if (fz.tree === "broad" && hash(seed * 5.5) < 0.22)
        col = [0.60 + hash(seed) * 0.28, 0.34 + hash(seed * 2.1) * 0.22, 0.10 + hash(seed * 3.3) * 0.10];
      const SPECIES = { cypress: 1, stonePine: 1, broadleafFall: 1, acacia: 1, plane: 1 };
      const CROWNS = { vase: 1, weeping: 1, columnar: 1 };
      const crownForm = CROWNS[fz.treeCrown] ? fz.treeCrown : "round";
      const kind = SPECIES[fz.tree] ? fz.tree
        : fz.tree === "palm" ? "palm" : fz.tree === "fir" ? "fir"
        : crownForm !== "round" ? crownForm : "broad";
      const crown = canopyR(kind, h);
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
      every(140, (k) => {
        const side = hash(HK(k)) < 0.5 ? -1 : 1;
        // The generic pit-straight grandstand below owns k 0-28 on -1 at gap
        // 14; a -1 shed there landed in it (the 4.00 m box pair at frac 0.000
        // on 29 circuits' clip audits). ownPitStraight circuits have no stand.
        if (side < 0 && !def.ownPitStraight && k <= 7 * 4 + 4) return;
        place(k, side, 14, [4, 6, 22], [0.5, 0.5, 0.55]);
      });
    } else if (theme === "desert") {
      every(34, (k) => { for (const side of [-1, 1]) if (hash(HK(k) + side) > 0.6) place(k, side, 8 + hash(HK(k)) * 10, [2 + hash(HK(k)) * 3, 1.5, 2], [0.62, 0.5, 0.34]); });
    } else if (theme === "street_day" || theme === "street_night" || theme === "modern") {
      const style = resolveCityStyle(def.cityStyle, theme) || THEME_DEF[theme] || THEME_DEF.modern;
      const cn = (k, s) => style.neon[Math.floor(hash(k * 3 + s) * style.neon.length) % style.neon.length];
      const dpal = style.dayPal;
      const toneFor = (k, s) => {
        if (!(dpal && dpal.length)) return { n: style.tone && style.tone.n, d: style.tone && style.tone.d };
        const cl = hash(Math.floor(k / 2.4) * 2.3 + s * 4.2);
        const idx = Math.floor(cl * cl * dpal.length) % dpal.length;
        return { n: style.tone && style.tone.n, d: dpal[idx] };
      };
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
        // The post stands INSIDE the panel's depth, not flush with it: both at
        // gap 6 put their roadside faces on one plane (place()'s size-hashed
        // jitter is ≤ 9 cm apart) — 22 same-facing coplanar pairs across seven
        // street circuits (2026-09-22, coplanar-audit --why --raw). 0.3 m in
        // from either panel face clears that jitter by 20 cm.
        prop(k, side, 6.3, [0.6, 6, 0.6], [0.10, 0.10, 0.12]);
        prop(k, side, 6, [1.2, 3.4, 5], NIGHT ? neon : [neon[0] * 0.5 + 0.25, neon[1] * 0.5 + 0.25, neon[2] * 0.5 + 0.25]);
      });
    }

    // NIGHT, not def.night: `track._night` carries the BUILD's override (a
    // day race at a night circuit, or the reverse), and every other branch in
    // buildProps — including the neon two lines up — reads it. This one kept
    // the authored default, so the pit-straight crowd wore the wrong tint
    // whenever the override disagreed with the def.
    // The pit building that stood here is the complex's row now (SceneryPits):
    // on a +1 circuit it was superseded, on a -1 circuit it stood on the
    // wrong side. Only the grandstand remains.
    const crowd = NIGHT ? [0.45, 0.28, 0.3] : [0.78, 0.42, 0.32];
    for (let i = 0; i < (def.ownPitStraight ? 0 : 7); i++) {
      const k = (i * 4) % n;
      place(k, -1, 14, [6, 11, 16], [0.5, 0.5, 0.56]);     // grandstand shell
      crowdBank(k, -1, 8, 16, 7, 4.2,                        // speckled tiered crowd
                [crowd[0] * 0.4, crowd[1] * 0.4, crowd[2] * 0.4]);
    }

    // Place a BAKED MODEL from the asset pack (assets/pack, built by
    // `node tools/gen/assets.mjs bake-model`) at a trackside anchor. This is the one
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
    // placement cannot vary with network timing (js/render/shared/assets.js modelSync).
    // A baked mesh's axis-aligned extent in its own space, cached on the mesh:
    // Assets hands back the same object for every stamp of an id, and the pack
    // is 36 models, so this runs a few dozen times per build at most.
    function meshBox(mesh) {
      if (mesh.__aabb) return mesh.__aabb;
      const p = mesh.pos;
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let i = 0; i < p.length; i += 3) {
        if (p[i] < x0) x0 = p[i];         if (p[i] > x1) x1 = p[i];
        if (p[i + 1] < y0) y0 = p[i + 1]; if (p[i + 1] > y1) y1 = p[i + 1];
        if (p[i + 2] < z0) z0 = p[i + 2]; if (p[i + 2] > z1) z1 = p[i + 2];
      }
      return (mesh.__aabb = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, cz: (z0 + z1) / 2,
                              w: x1 - x0, h: y1 - y0, d: z1 - z0 });
    }

    function bakedModel(id, k, side, dist, opts) {
      if (typeof Assets === "undefined" || !Assets.modelSync) return false;
      const mesh = Assets.modelSync(id);
      if (!mesh) return false;
      const o = opts || {};
      const a = anchor(k, side, dist);
      if (!a || !isFinite(a.c[0]) || !isFinite(a.c[1]) || !isFinite(a.c[2])) return false;
      const yaw = o.rotY != null ? o.rotY
                : Math.atan2(a.t[0], a.t[2]) + (side < 0 ? Math.PI / 2 : -Math.PI / 2);
      // THE ONE PROP EMITTER WITH NO ROAD GUARD, until now. addBox, addCyl,
      // addCone, addFrustum, addPrism and addPyramid all go through GUARDED,
      // which rejects anything standing on the racing surface; addMesh never
      // did, so a baked model could be stamped straight across the track, and
      // one was. Monza's kenney_ind_building-d is anchored 60 m off node 17 at
      // the Variante del Rettifilo, where the track turns ~90 degrees, so 60 m
      // "outward" lands back ON the road two corners along: its window band,
      // 2.22 x 0.20 m in baked colour [0.25,0.25,0.29], sat 0.75 m over the
      // racing line (docs/notes/DEFECT-LEDGER.md).
      //
      // The box is the mesh's own extent, scaled and yawed exactly as addMesh
      // transforms its vertices (geom.js: x' = x*cs + z*sn + X, z' = -x*sn +
      // z*cs + Z), so the guard measures what ships. Callers write
      // `if (!bakedModel(...)) building(...)` and that fallback is itself
      // guarded, so a rejected stamp degrades to nothing, not to a raw box.
      const bb = meshBox(mesh), sc = o.scale != null ? o.scale : 1;
      const cs = __M.cos(yaw), sn = __M.sin(yaw);
      const cx = bb.cx * sc, cz = bb.cz * sc;
      const wc = [a.c[0] + cx * cs + cz * sn,
                  a.c[1] + (o.lift || 0) + bb.cy * sc,
                  a.c[2] - cx * sn + cz * cs];
      const wsz = [(bb.w * __M.abs(cs) + bb.d * __M.abs(sn)) * sc, bb.h * sc,
                   (bb.w * __M.abs(sn) + bb.d * __M.abs(cs)) * sc];
      if (rejBox(wc, wsz)) { _culled++; return false; }
      return TrackGeom.addMesh(out, mesh, {
        x: a.c[0], y: a.c[1] + (o.lift || 0), z: a.c[2],
        rotY: yaw, scale: o.scale != null ? o.scale : 1,
        tint: o.tint || null, mat: o.mat,
      });
    }

    // Three lamp registries, one record shape (js/lighting/track-lights.js
    // reads them all off track.lampPosts): a circuit's own fixtures (`custom`),
    // the shared masts (`mast`: radius is a FLOOR there) and the pit complex's
    // canopy luminaires (`pit`, registered by SceneryPits after the build).
    const customLamps = [], mastLamps = [], pitLamps = [];
    const CUSTOM_LAMP_CAP = 96, MAST_LAMP_CAP = 512, PIT_LAMP_CAP = 32;
    const lampRec = (spec, defKind, tag) => {
      const p = spec.pos;
      const k = Number.isFinite(spec.k) ? ((Math.round(spec.k) % n) + n) % n : 0;
      const rec = { k, side: spec.side === -1 ? -1 : 1, x: p[0], y: p[1], z: p[2],
                    kind: typeof spec.kind === "string" ? spec.kind : defKind, custom: true };
      if (tag) rec[tag] = true;
      if (spec.entry) rec.entry = true;   // the pit ENTRANCE lamps (SceneryPits), told apart from the canopy's
      if (spec.always) rec.always = true;
      if (finiteVec(spec.aim, 3, false)) rec.aim = [spec.aim[0], spec.aim[1], spec.aim[2]];
      if (finiteVec(spec.aimAt, 3, false)) rec.aimAt = [spec.aimAt[0], spec.aimAt[1], spec.aimAt[2]];
      if (Number.isFinite(spec.energy)) rec.energy = Math.max(0, spec.energy);
      if (Number.isFinite(spec.radius)) rec.radius = Math.max(1, spec.radius);
      return rec;
    };
    const lampPost = (spec) => {
      spec = spec || {};
      if (!finiteVec(spec.pos, 3, false)) {
        diagnostics.invalid.push({ id: spec.id || "lamp-post", reason: "non-finite lamp position" });
        return false;
      }
      if (customLamps.length >= CUSTOM_LAMP_CAP) return false;
      customLamps.push(lampRec(spec, "led", null));
      return true;
    };
    const registerMastLamp = (spec) => {
      spec = spec || {};
      if (!finiteVec(spec.pos, 3, false) || mastLamps.length >= MAST_LAMP_CAP) return false;
      mastLamps.push(lampRec(spec, "flood_bank", "mast"));
      return true;
    };
    const registerPitLamp = (spec) => {
      spec = spec || {};
      if (!finiteVec(spec.pos, 3, false) || pitLamps.length >= PIT_LAMP_CAP) return false;
      pitLamps.push(lampRec(spec, "led", "pit"));
      return true;
    };
    ctx.registerMastLamp = registerMastLamp;

    // THE CIRCUIT'S BESPOKE SCENERY, resolved from window.TrackScenery rather
    // than off the def. The closure is ~27 KB per circuit and all 40 together
    // were 1,083 KB of a 4.96 MB boot script wall — for a session that builds
    // exactly one of them. js/circuits/scenery/<id>.js is LAZY_SCENERY: no
    // <script> tag, fetched by game.js for the circuit about to be built.
    // `|| def.scenery` keeps an inline closure working, which is what the Node
    // build harnesses and any not-yet-split circuit rely on.
    // def.scenery FIRST: an inline closure is an explicit override (a harness
    // probe, or a circuit not yet split) and should beat the registry, which is
    // just where the shipped closures now live.
    const sceneryFn = def.scenery || (typeof window !== "undefined"
      && window.TrackScenery && window.TrackScenery[def.id]) || null;
    // A circuit that HAS a scenery file but whose closure is not resident builds
    // bare — road and terrain, no bespoke dressing. That is a legal state (the
    // generic dressing still runs) and an almost invisible one, so say it out
    // loud: silent bare builds are the failure mode the whole split risks.
    // Warn whenever the closure is absent, NOT only when the registry exists but
    // lacks this id. The narrower condition was useless in the case that
    // actually happened: a harness that never loaded js/circuits/scenery/ at all
    // leaves window.TrackScenery undefined, so the warning it needed most was
    // the one it could not reach.
    if (!sceneryFn) Log.warn("track", "no scenery closure for " + def.id + " — building bare");
    if (sceneryFn) {
      // Frac -> node, UN-shifted: the `Math.round(s * n) % n` that 37 circuit
      // files each declared locally. The wrapped helpers (transformSceneryApi)
      // remap the node they are handed, so this stays raw — it is copied, never
      // wrapped, on shifted / reversed circuits.
      // NORMALISED: JS `%` keeps the dividend's sign, so a frac just below 0
      // (a prop placed `s - 0.002` behind a node near the start line) indexed
      // a negative slot. Ten of the circuit-local copies this replaced carried
      // the unnormalised form; Okayama's alone wrapped.
      const K = (s) => ((Math.round(s * n) % n) + n) % n;
      // Lap centroid + the farthest node's distance from it, for horizon rings.
      // Computed once, lazily, in the exact order the 30 local copies summed
      // (sequential px[i] sum / n, then max hypot) so their rings stay
      // vertex-identical.
      let _lapBounds = null;
      const lapBounds = () => {
        if (_lapBounds) return _lapBounds;
        let cx = 0, cz = 0;
        for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
        cx /= n; cz /= n;
        let radius = 0;
        for (let i = 0; i < n; i++) radius = Math.max(radius, Math.hypot(px[i] - cx, pz[i] - cz));
        return (_lapBounds = Object.freeze({ cx, cz, radius }));
      };
      let sceneryApi = {
        out, track, def, theme, pal, n, ds, px, py, pz, hw, pyMin,
        K, lapBounds,
        night: NIGHT,
        MAT,
        ATM, COL,
        place, prop, backdrop, groundPlane, groundYAt,
        // World-XZ ground query, exposed to circuits because its ABSENCE is
        // what makes Trap B (docs/SCENERY-GROUNDING.md §2) so easy to write:
        // groundYAt is a NODE query, so a circuit walking a tangent away from
        // the centreline had nothing to ask and reused one anchor's height
        // across tens of metres of slope. Returns null off the rendered
        // ribbon; callers fall back to whatever they were using before.
        terrainYAt,
        groundUnder, frameAt,
        addBox, every, onTrack,
        modelGroup, overheadSpan, lampPost, waterSurface, waterField, waterBand, groundPatch, groundedSegments,
        seat, foundation, cantilever,
        sceneryTheme, landmarkKit, circuitKit,
        modelDiagnostics: diagnostics,
        ferrisWheel, hash, upOf, cross, norm, lerp, vadd,
        addPrism, addPyramid, addCone, addCyl, addFrustum, addMountain, anchor, along,
        pine, tree, palm, bush, hedge, peak, mountain, ridge, forestEdge, conifer,
        cypress, stonePine, broadleafFall, acacia, plane,
        spectatorHill,
        bleacher, scaffoldStand, terrace, tieredBowl,
        building, house, motorhome, tower, grandstand, grandstandEx, billboard,
        gantry, marshalPost, cameraTower, cityFront,
        signDigit,
        underpassPortal, floodMast, floodMastRing, ledFacadeBands,
        concreteCanyon, sailCanopy, gridshellCanopy, runoffApron,
        bankedKerbStrip, bowlSeatWall, pastelStreetRow, broadcastCompound,
        signBoard, sponsorHoarding,
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
        bakedModel,
      };
      if (def.reverse || def.sceneryCoordinates === "source" || TrackSpace.sceneryOriginDelta(def))
        sceneryApi = transformSceneryApi(sceneryApi, def, n);
      sceneryFn(sceneryApi);
    }

    // Foliage runs LAST, once every barrier on the circuit is registered, so the
    // world-XZ guard in clearTreeDist() sees the finished set: the per-track
    // treelines queued by forestEdge() during scenery, then the generic roadside
    // scatter deferred out of the FURN pass above.
    for (const a of deferredFoliage) forestEdgeNow.apply(null, a);
    plantRoadsideTrees();

    // The painted LENS of a fixture, per lamp kind: over-white at night (the
    // props draw glows any over-white vertex colour, js/game.js floodEmit) so
    // the head reads as lit, plain by day. The masts below and the pit
    // canopy luminaires (SceneryPits) both paint from this one table, so the
    // lens always matches the light track-lights.js emits for the kind.
    const lensAlbedo = (kind) => (NIGHT ? LENS_NIGHT : LENS_DAY)[kind] || LENS_DAY.led;
    {
      const stTheme = theme === "street_night" || theme === "street_day" || theme === "modern";
      const mastH = stTheme ? 9 : 13;
      const poleCol = [0.16, 0.16, 0.19];
      const dens = (typeof LightTune !== "undefined" && LightTune.LT &&
        typeof LightTune.LT.lampDensity === "number" && LightTune.LT.lampDensity > 0)
        ? LightTune.LT.lampDensity : 1;
      const mstride = Math.max(1, Math.round((22 / dens) / ds));  // matches buildTrackLights + LAMP DENSITY
      let mi = 0;
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
      // `lamp: "none"` MEANS NONE. This pass ran unconditionally and read
      // fz.lamp only to pick a STYLE, so the 31 circuits that declare no
      // lighting got a 13 m floodlight mast every 22 m anyway — measured, Spa
      // 345 of them and Watkins Glen 266, both daylight circuits whose whole
      // character is trees at arm's length and no run-off. Singapore, a night
      // race that actually wants lamps, carries 245. docs/SCENERY-API.md has
      // always said this pass is "keyed off `fz.lamp`"; it was not, and this is
      // the line that makes the document true.
      //
      // The START-LINE FLOOD BANKS survive the gate: every circuit lights its
      // own pit lane, and that is what pickKind returns for the first and last
      // 1.5% of the lap. No night race declares "none" (checked across all 52),
      // so nothing here can put a circuit in the dark.
      const noMasts = fz.lamp === "none";
      track.lampPosts = [];
      for (let k = 0; k < n; k += mstride, mi++) {
        const side = (mi % 2 === 0) ? 1 : -1;
        if (dressingExcluded("lamps", k, side)) continue;
        const a = anchor(k, side, 6);
        if (onTrack(a.c[0], a.c[2], 1.2)) continue;
        const kind = pickKind(k, hash(mi * 13.7 + 3.1));
        if (noMasts && kind !== "flood_bank") continue;
        const lensCol = lensAlbedo(kind);
        const b = [a.r, a.u, a.t];
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
          const x = px[k] + r[0] * o, z = pz[k] + r[2] * o;
          // RAW skips rejBox, so nothing else stops a pillar standing in the
          // OTHER road: its own deck edge is 1.2 m clear at hw + 2, so an
          // onTrack hit here is the lower carriageway. On suzuka's oblique
          // crossover one stood 4 m inside the lower road's tarmac (frac 0.439,
          // lateral -3.0), a 9 m column the lower road drove straight through.
          if (onTrack(x, z, 0.8)) continue;
          RAW.addBox(out, [x, deckY / 2 - 0.3, z],
                 [1.6, deckY + 0.4, 1.6], [0.42, 0.42, 0.47], [r, [0, 1, 0], tg]);
          blockAt(k, side, 2.0, 1);   // solid pillar at the deck edge
        }
      }
    }
    if (out.pos.length === 0) addBox(out, [px[0] + 30, 1, pz[0]], [2, 2, 2], [0.4, 0.4, 0.4]);
    {
      const sk = Object.keys(_suppressed);
      if (sk.length) Log.warn("scenery", def.id + ": suppressed " + sk.map((k) => k + "=" + _suppressed[k]).join(" "));
      const pk = Object.keys(_superseded);
      if (pk.length) Log.info("scenery", def.id + ": superseded by the pit complex " + pk.map((k) => k + "=" + _superseded[k]).join(" "));
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
    // THE PIT COMPLEX, last — after the bespoke scenery and the generic
    // dressing have been kept out of it. Platform, wall, boards, lights and
    // the row of garages, every position off track.pit (js/track/scenery/pits.js).
    if (typeof SceneryPits !== "undefined" && track.pit) {
      const pits = SceneryPits.build({ track, out, rawBox: RAW.addBox, upOf, bankOffsetAt, curvature: (s) => curvature(track, s),
                                       night: NIGHT, lensAlbedo, registerLamp: registerPitLamp });
      // The mast/custom concat above has run; nothing reads lampPosts before
      // buildProps returns (the bake is per frame), so the canopy goes on last.
      for (const lamp of pitLamps) track.lampPosts.push(lamp);
      track.pitBuilt = pits;   // kept, not just logged: `wall` false is invisible from the buffers
      Log.info("track", `pits ${track.def.id}: ${pits.bays} bays, wall ${pits.wall}, ${pitLamps.length} lamps`);
    }
    return { out, glass: TrackModels.sealGeometry(glassBuf), water: TrackModels.sealGeometry(waterBuf) };
  }

  return { build };
})();
