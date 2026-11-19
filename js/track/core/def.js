const TrackDef = (function () {
  "use strict";
  const { norm } = TrackGeom;
  const __M = Math;

  function dayPal(o) {
    const p = Object.assign({
      zenith: [0.18, 0.40, 0.78], horizon: [0.62, 0.74, 0.88], sun: [1, 0.96, 0.85],
      grass: [0.18, 0.42, 0.16], runoff: [0.55, 0.42, 0.28], fog: [0.62, 0.74, 0.88],
      asphalt: [0.16, 0.17, 0.19], line: [0.95, 0.95, 0.98],
      fogDensity: 0.0017, kerbA: [0.85, 0.12, 0.12], kerbB: [0.95, 0.95, 0.95],
      ambientSky: [0.45, 0.52, 0.62], ambientGround: [0.22, 0.22, 0.18],
      sunColor: [1, 0.95, 0.82], sunDir: [0.4, 0.72, 0.3],
    }, o);
    if (o && o.fogColor && o.fog == null) p.fog = o.fogColor;
    p.sunDir = norm(p.sunDir);
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

  function realPoints(id, path, baseHW) {
    if (!path || !path.pts || !path.pts.length) throw new Error("Tracks: circuit \"" + id +
      "\" has no `path` — js/circuits/" + id + ".js must carry `path: { len, pts }` (tools/track/import-circuit-path.mjs emits it)");
    const real = hasRealElevation(id);
    const src = path.pts;
    const N = src.length;
    const arc = new Float64Array(N + 1);
    for (let i = 1; i <= N; i++) { const a = src[i - 1], b = src[i % N]; arc[i] = arc[i - 1] + __M.hypot(b[0] - a[0], b[1] - a[1]); }
    let pts = src.map((p, i) => {
      const authored = !real && p.length >= 3 && Number.isFinite(+p[2]) ? +p[2] : 0;
      return [p[0], real ? elevationAt(id, arc[i] / arc[N]) : authored, p[1], baseHW, 0];
    });
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
      const wrap = s1 < s0;
      const inside = wrap ? (s >= s0 || s <= s1) : (s >= s0 && s <= s1);
      if (inside) return 1;
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

  function fromRaw(d) {
    const def = {
      id: d.id, name: d.name, gp: d.gp, country: d.country, laps: 3,
      gpLaps: Number.isInteger(d.gpLaps) && d.gpLaps > 3 ? d.gpLaps
        : Math.ceil((TrackSceneryData.GP_DISTANCE_KM[d.id] || TrackSceneryData.GP_DISTANCE_KM.default) / (d.lengthKm || 5)),
      night: d.night, theme: d.theme, lengthKm: d.lengthKm,
      classic: !!d.classic, custom: !!d.custom,
      palette: (d.night ? nightPal : dayPal)(d.pal || {}),
      street: !!d.street, banked: !!d.banked, bankZones: d.bankZones || null, bridges: d.bridges || null,
      ...(d.kerbStyle === "sausage" || d.kerbStyle === "rumble" || d.kerbStyle === "flat" ? { kerbStyle: d.kerbStyle } : {}),
      ...(d.berms === true || d.berms === false ? { berms: !!d.berms } : {}),
      barrierGap: d.barrierGap || null,
      terrainOuter: d.terrainOuter,
      ...(Number.isFinite(d.terrainFalloffStart) && d.terrainFalloffStart >= 30 &&
          d.terrainFalloffStart < Math.max(0.5, Number(d.terrainOuter) || (d.street ? 28 : 120))
        ? { terrainFalloffStart: d.terrainFalloffStart } : {}),
      flatTerrain: !!d.flatTerrain,
      ...(d.terrainMat === "SAND" || d.terrainMat === "SNOW" || d.terrainMat === "CONCRETE" ? { terrainMat: d.terrainMat } : {}),
      sceneryCoordinates: d.sceneryCoordinates || "legacy",
      sceneryLapMirror: !!d.sceneryLapMirror,
      dressingExclusions: d.dressingExclusions || null,
      tyreSeverity: d.tyreSeverity,
      sunAzimBias: d.sunAzimBias,
      sceneryTheme: d.sceneryTheme,
      sceneryThemeOverrides: d.sceneryThemeOverrides || null,
      ownPitStraight: !!d.ownPitStraight,
      pit: d.pit || null,
      undulate: d.undulate,
      scenery: d.scenery || null,
      elevations: hasRealElevation(d.id) ? null : (d.elevations || null),
      hwZones: d.hwZones || null,
      ...(d.splineAlpha != null ? { splineAlpha: d.splineAlpha } : {}),
      ...(d.revision != null ? { revision: d.revision } : {}),

      reverse: !!d.reverse,
      startFrac: d.startFrac || 0,
      sceneryStartFrac: d.sceneryStartFrac != null ? d.sceneryStartFrac : null,
      sectors: d.sectors || null, turns: d.turns || null, path: d.path || null,
      lineHints: d.lineHints || null,
      barrier: d.barrier || null, furniture: d.furniture || null, kit: d.kit || null,
      standSet: d.standSet || null, cityStyle: d.cityStyle || null,
    };
    Object.defineProperty(def, "points", {
      configurable: true,
      enumerable: true,
      get() { return materializeListPoints(def, d); }
    });
    return def;
  }

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
      const fmap = (s) => TrackSpace.toRacingFrac({ startFrac: phiAuthor, reverse: def.reverse }, s);
      if (def.elevations) def.elevations = def.elevations.map((e) => Object.assign({}, e, { s: fmap(e.s) }));
      if (def.bridges)    def.bridges    = def.bridges.map((b) => Object.assign({}, b, { s: fmap(b.s) }));
      if (def.hwZones && (def.reverse || phi)) {
        def.hwZones = def.hwZones.map((z) => {
          return Object.assign({}, z, TrackSpace.range(def, z.s0, z.s1, "source"));
        });
      }
    }
    if (def.hwZones) applyHwZones(pts, def.hwZones, d.baseHW);
    Object.defineProperty(def, "points", {
      value: pts, writable: true, configurable: true, enumerable: true
    });
    return pts;
  }

  return { elevationAt, hasRealElevation, fromRaw };
})();
Object.freeze(TrackDef);
