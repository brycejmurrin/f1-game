/* Apex 26 — Tracks: circuit registry + build orchestrator + world queries.
 * The engine itself lives in three sibling files sharing the TracksKit
 * namespace (load order matters — see docs/MODULE-GRAPH.md):
 *   tracks-spline.js   centreline / sampling / curvature
 *   tracks-mesh.js     road / terrain / kerb / gate mesh builders
 *   tracks-scenery.js  props, city generator, buildProps
 * This file keeps the public Tracks.* API unchanged. */
"use strict";

const Tracks = (function () {
  const {
    SCALE, norm, centerline, buildCenterline, sample, curvature,
    buildRoad, buildTerrain, buildFloor, buildGate, buildStartLine,
    onKerb, bankAngle, banking, buildProps,
  } = TracksKit;

  // Full build: centreline + 3D meshes (road/terrain/props/gate) uploaded to the
  // GPU. This is the heavy one — only needed to actually render/drive a circuit.
  function build(def, opts) {
    const track = buildCenterline(def);
    // Session darkness drives whether buildings/skyline light their windows.
    // Falls back to the track's default (def.night) when not specified.
    track._night = opts && opts.night != null ? !!opts.night : !!def.night;
    if (typeof GLX !== "undefined" && GLX.createMesh) {
      track.meshes.floor = GLX.createMesh(buildFloor(track));
      track.meshes.road = GLX.createMesh(buildRoad(track));
      const terrainGeo = buildTerrain(track);
      track.terrainGeo = terrainGeo;   // raw geometry kept for the groundY() debug probe
      track.meshes.terrain = GLX.createMesh(terrainGeo);
      const _props = buildProps(track);
      // Chunked + frustum-culled: the city/props mesh is huge (up to ~5 M verts),
      // and most of it is off-screen each frame — drawing only visible XZ cells
      // (and only shadow-casting cells inside the light frustum) is the big win.
      track.meshes.props = GLX.createChunkedMesh ? GLX.createChunkedMesh(_props.out, 72) : GLX.createMesh(_props.out);
      track.meshes.glass = GLX.createMesh(_props.glass);
      track.meshes.water = GLX.createMesh(_props.water);
      track.meshes.gate = GLX.createMesh(buildGate(track));
      track.meshes.startline = GLX.createMesh(buildStartLine(track));
    }
    return track;
  }



  // ---------- circuit layouts (turn +=right, lengths in meters pre-SCALE) ----------
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
    p.sunDir = norm(p.sunDir);
    return p;
  }

  // Circuit definitions live in js/tracks/<id>.js — each registers itself on the
  // global TrackDefs list (loaded before this engine). Palette is resolved here
  // from the `night` flag; bridges/elevations/street travel with each def.
  const DEFS = (typeof window !== "undefined" && window.TrackDefs) || [];

  // Surveyed elevation profile lookup. js/circuit-elevations.js (baked offline
  // by tools/bake-elevation.mjs from SRTM) registers CircuitElevations[id] as an
  // array of metres, relative to the start, sampled evenly by arc-fraction. When
  // present it supersedes the authored cosine `elevations` bumps for that
  // circuit. Returns 0 when no profile is loaded (the shipped default).
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

  // Real circuit centerlines (js/circuits.js): projected OSM traces in metres.
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

  const LIST = DEFS.map((d) => {
    const def = {
      id: d.id, name: d.name, gp: d.gp, country: d.country, laps: 3,
      night: d.night, theme: d.theme, lengthKm: d.lengthKm,
      palette: (d.night ? nightPal : dayPal)(d.pal || {}),
      street: !!d.street, banked: !!d.banked, bridges: d.bridges || null,
      barrierGap: d.barrierGap || null,
      terrainOuter: d.terrainOuter,
      flatTerrain: !!d.flatTerrain,
      // bespoke per-circuit scenery (js/tracks/<id>.js); run by buildProps
      scenery: d.scenery || null,
      // surveyed elevation (if js/circuit-elevations.js is loaded) is baked into
      // the points below and supersedes the authored cosine bumps.
      elevations: hasRealElevation(d.id) ? null : (d.elevations || null),
      reverse: !!d.reverse,
      startFrac: d.startFrac || 0,
    };
    def.points = realPoints(d.id, d.baseHW) || centerline(d.segs, d.baseHW);
    // Lap-direction + start-line transform.
    //  • `reverse`   flips the traversal so the loop is driven the other way.
    //  • `startFrac` rotates the start/finish line to a chosen fraction of the
    //    ORIGINAL trace (0 = the trace's own first point).
    // The centreline control points and the elevation/bridge s-anchors are
    // remapped here; the matching scenery/barrier s-remap happens when the
    // bespoke scenery() runs (buildProps), driven by def._startFrac/_reverse.
    const phi = (((def.startFrac || 0) % 1) + 1) % 1;
    if (def.reverse || phi) {
      const P = def.points, N = P.length, out = new Array(N);
      const o = (((Math.round(phi * N) % N) + N) % N);
      for (let i = 0; i < N; i++) out[i] = def.reverse ? P[(((o - i) % N) + N) % N] : P[(i + o) % N];
      def.points = out;
      def._startFrac = phi;
      const fmap = def.reverse ? (s) => (((phi - s) % 1) + 1) % 1 : (s) => (((s - phi) % 1) + 1) % 1;
      if (def.elevations) def.elevations = def.elevations.map((e) => Object.assign({}, e, { s: fmap(e.s) }));
      if (def.bridges)    def.bridges    = def.bridges.map((b) => Object.assign({}, b, { s: fmap(b.s) }));
    }
    return def;
  });

  // ---------- world -> track projection ----------
  // Project a world ground point (wx, wz) onto the centreline polyline and return
  // its arc-length s, signed lateral offset (along the local `right`, matching the
  // (s,x) model's x), the nearest node index, the tangent heading, and the
  // perpendicular distance. This is the inverse of sample()+offset and the bridge
  // that lets the car physics live in world space while gameplay still reasons in
  // (s, lateral). `hint` (an arc-length s from last frame) restricts the search to
  // a small window of segments so it's O(1) per car; omit it for a full search.
  function project(track, wx, wz, hint) {
    const n = track.n, L = track.total, ds = L / n;
    const px = track.px, pz = track.pz, rx = track.rx, rz = track.rz, tx = track.tx, tz = track.tz;
    let bestD2 = Infinity, bestCost = Infinity, bestK = 0, bestT = 0, bestCx = 0, bestCz = 0;
    // Continuity bias: when we have a hint (last frame's arc-length), prefer the
    // segment closest to it ALONG THE LAP, not just in space. At a hairpin the
    // inbound and outbound legs are only metres apart but far apart in s, so a car
    // running slightly wide could otherwise snap onto the wrong leg and teleport
    // its lap distance (phantom wrong-way / lost progress). Penalising arc-length
    // jumps breaks that tie toward the continuous choice; it only changes the
    // outcome when two segments are near-equidistant in space.
    const hs = (hint != null && isFinite(hint)) ? (((hint % L) + L) % L) : -1;
    const CONT = 0.08;                    // weight of the arc-length penalty
    function evalSeg(i) {
      const j = (i + 1) % n;
      const ax = px[i], az = pz[i];
      const dx = px[j] - ax, dz = pz[j] - az;
      const len2 = dx * dx + dz * dz || 1e-6;
      let t = ((wx - ax) * dx + (wz - az) * dz) / len2;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const cx = ax + t * dx, cz = az + t * dz;
      const ex = wx - cx, ez = wz - cz;
      const d2 = ex * ex + ez * ez;
      let cost = d2;
      if (hs >= 0) {
        let da = Math.abs(((i + t) * ds) - hs); da = Math.min(da, L - da);
        cost += CONT * da * da;
      }
      if (cost < bestCost) { bestCost = cost; bestD2 = d2; bestK = i; bestT = t; bestCx = cx; bestCz = cz; }
    }
    if (hint != null && isFinite(hint)) {
      const h = ((Math.round(hint / ds) % n) + n) % n;
      const W = 16;                       // ±16 nodes around last position
      for (let d = -W; d <= W; d++) evalSeg(((h + d) % n + n) % n);
    } else {
      for (let i = 0; i < n; i++) evalSeg(i);
    }
    const j = (bestK + 1) % n;
    const s = ((bestK + bestT) * ds) % L;
    // signed lateral offset along the interpolated right vector (ground plane)
    let r0 = rx[bestK] + (rx[j] - rx[bestK]) * bestT;
    let r2 = rz[bestK] + (rz[j] - rz[bestK]) * bestT;
    const rl = Math.hypot(r0, r2) || 1; r0 /= rl; r2 /= rl;
    const lat = (wx - bestCx) * r0 + (wz - bestCz) * r2;
    // tangent heading (same convention as centreline: dir = (sin θ, cos θ))
    const h0 = tx[bestK] + (tx[j] - tx[bestK]) * bestT;
    const h2 = tz[bestK] + (tz[j] - tz[bestK]) * bestT;
    const heading = Math.atan2(h0, h2);
    return { s, lat, k: bestK, heading, dist: Math.sqrt(bestD2) };
  }

  // Driving boundary (max |lateral| from the centreline) at arc-length s on a
  // side (sideSign >= 0 = right/+x, < 0 = left). Derived from where solid barriers
  // were placed (see buildProps), so the car stops just before a model. Uses the
  // tighter of the two bracketing nodes — conservative, never lets the car past a
  // barrier at a node transition.
  function wallAt(track, s, sideSign) {
    const arr = sideSign >= 0 ? track.barR : track.barL;
    const n = track.n, L = track.total;
    if (!arr) {                                   // pre-build fallback
      const i0 = (((Math.round(s / L * n) % n) + n) % n);
      return track.hw[i0] + (track.def && track.def.street ? -0.8 : 9);
    }
    let f = (((s % L) + L) % L) / L * n;
    const i = Math.floor(f) % n, j = (i + 1) % n;
    return Math.min(arr[i], arr[j]);
  }

  // Rendered ground height at world (x,z): the max Y of any terrain triangle
  // covering that point (vertical ray-cast against the stashed terrain geometry).
  // Returns null if no terrain covers the point. Debug aid — finds where the
  // carved terrain ends up so props can be checked for floating / gaps.
  function terrainY(track, x, z) {
    const g = track.terrainGeo; if (!g) return null;
    const pos = g.pos, idx = g.idx; let best = null;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const ax = pos[a], az = pos[a + 2], bx = pos[b], bz = pos[b + 2], cx = pos[c], cz = pos[c + 2];
      // barycentric in XZ
      const v0x = cx - ax, v0z = cz - az, v1x = bx - ax, v1z = bz - az, v2x = x - ax, v2z = z - az;
      const d00 = v0x * v0x + v0z * v0z, d01 = v0x * v1x + v0z * v1z, d11 = v1x * v1x + v1z * v1z, d20 = v2x * v0x + v2z * v0z, d21 = v2x * v1x + v2z * v1z;
      const den = d00 * d11 - d01 * d01; if (Math.abs(den) < 1e-9) continue;
      const u = (d11 * d20 - d01 * d21) / den, vv = (d00 * d21 - d01 * d20) / den;
      if (u < -0.01 || vv < -0.01 || u + vv > 1.01) continue;
      const y = pos[a + 1] + u * (pos[c + 1] - pos[a + 1]) + vv * (pos[b + 1] - pos[a + 1]);
      if (best === null || y > best) best = y;
    }
    return best;
  }

  return { LIST, build, buildCenterline, sample, curvature, onKerb, banking, bankAngle, project, wallAt, terrainY };
})();
