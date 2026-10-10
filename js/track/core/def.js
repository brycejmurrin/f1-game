/* Apex 26 — TrackDef: the def FACTORY. A raw circuit def (js/circuits/<id>.js,
   pushed onto window.TrackDefs) becomes a Tracks.LIST entry here: the palette
   (dayPal/nightPal), the SRTM elevation readers, the real-centreline point
   builder (realPoints/applyHwZones) and the field-by-field copy that
   circuit-def-fields.test.mjs pins. Moved verbatim out of js/track/tracks.js
   (2026-10-01) so a circuit can be built from a def that was never a script
   tag — the custom track designer's js/editor/custom-tracks.js calls
   fromRaw() on a stored design — and so tracks.js stays under its ratchet.
   Nothing here is id-keyed: the def is the single home of a circuit's data. */
const TrackDef = (function () {
  "use strict";
  const { norm } = TrackGeom;
  const __M = Math;

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

  // CATMULL-ROM, not linear. X/Z has always been a spline; interpolating Y
  // linearly creases the road at every one of the 64 samples, so the car crests
  // a kink each ~60 m. What a driver feels is the CHANGE of gradient, not the
  // gradient, so that reads as "abrupt" even inside the baker's 8% slope clamp
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
    // path.pts are [x, z] (shipped + custom plan) or [x, z, y] when a custom
    // design carries per-node heights (Track Designer). Arc length always uses
    // the plan (x, z); y is survey / authored height, never lateral.
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

  // THE LIST ENTRY: a known shape copied field by field off the authored def
  // (tests/unit/circuit-def-fields.test.mjs pins that every authored key either
  // survives this copy or is declared engine-only). `custom` marks a circuit the
  // track designer registered at runtime (js/editor/custom-tracks.js): never in
  // SEASON, hidden from the online lobby, excluded from the roster-count pins.
  function fromRaw(d) {
    const def = {
      id: d.id, name: d.name, gp: d.gp, country: d.country, laps: 3,
      // Fewest laps covering the regulation race distance (TrackSceneryData.GP_DISTANCE_KM).
      // `lengthKm` is one decimal, so five circuits came out a lap off the real race:
      // an authored integer `gpLaps` (> 3) overrides the derivation.
      gpLaps: Number.isInteger(d.gpLaps) && d.gpLaps > 3 ? d.gpLaps
        : Math.ceil((TrackSceneryData.GP_DISTANCE_KM[d.id] || TrackSceneryData.GP_DISTANCE_KM.default) / (d.lengthKm || 5)),
      night: d.night, theme: d.theme, lengthKm: d.lengthKm,
      classic: !!d.classic, custom: !!d.custom,
      palette: (d.night ? nightPal : dayPal)(d.pal || {}),
      street: !!d.street, banked: !!d.banked, bankZones: d.bankZones || null, bridges: d.bridges || null,
      // Designer / optional circuit surface: kerb ribbon profile + berms on
      // banked corners. Absent → engine defaults (flat kerbs, no forced berms).
      ...(d.kerbStyle === "sausage" || d.kerbStyle === "rumble" || d.kerbStyle === "flat" ? { kerbStyle: d.kerbStyle } : {}),
      ...(d.berms === true || d.berms === false ? { berms: !!d.berms } : {}),
      barrierGap: d.barrierGap || null,
      terrainOuter: d.terrainOuter,
      // Opt-in gradual outer terrain descent; absent/invalid preserves the
      // legacy definition shape and profile on all other circuits.
      ...(Number.isFinite(d.terrainFalloffStart) && d.terrainFalloffStart >= 30 &&
          d.terrainFalloffStart < Math.max(0.5, Number(d.terrainOuter) || (d.street ? 28 : 120))
        ? { terrainFalloffStart: d.terrainFalloffStart } : {}),
      flatTerrain: !!d.flatTerrain,
      // The terrain's own material layer beyond the runoff verge (js/track/core/mesh.js
      // ribbon()): "SAND" / "SNOW" for the track designer's desert and alpine
      // themes, "CONCRETE" for a street circuit's paved verges; absent stays
      // absent so untouched defs keep their golden hashes
      // (tests/unit/track-def-factory.test.mjs).
      ...(d.terrainMat === "SAND" || d.terrainMat === "SNOW" || d.terrainMat === "CONCRETE" ? { terrainMat: d.terrainMat } : {}),
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
      // Opt-in centripetal centreline (tracks.js buildCenterline). Copied only when
      // authored: an absent key keeps every other def's metadata hash unchanged.
      ...(d.splineAlpha != null ? { splineAlpha: d.splineAlpha } : {}),

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
      // sectors → thirds), real centreline and dressing rows (formerly the js/track/scenery/data.js
      // id tables) — all READ OFF THE BUILT DEF: the same trap as the seven above.
      sectors: d.sectors || null, turns: d.turns || null, path: d.path || null,
      lineHints: d.lineHints || null,   // authored racing-line hints per turn (TrackLine.bake)
      barrier: d.barrier || null, furniture: d.furniture || null, kit: d.kit || null,
      standSet: d.standSet || null, cityStyle: d.cityStyle || null,
    };
    // PERF-FINDINGS: realPoints for all 40 circuits costs 24.0 ms at boot,
    // and a session builds exactly one. Keep LIST.length===40 and every
    // metadata field copied as today; defer points (+ startFrac remaps /
    // elevation fmap / applyHwZones) until first access. The getter replaces
    // itself with a data property after materializing the SAME pipeline —
    // bit-identical once touched. Tracks.build →
    // buildCenterline calls ensurePoints so the heavy path never sees a getter.
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

  return { dayPal, nightPal, elevationAt, hasRealElevation, realPoints, applyHwZones, fromRaw, materializeListPoints };
})();
Object.freeze(TrackDef);
