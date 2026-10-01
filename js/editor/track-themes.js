/* Apex 26 — TrackThemes: the custom track designer's THEME PRESETS. A preset is
   the bundle of def fields a shipped circuit authors by hand (theme, palette,
   terrain, furniture, stands, city style, pit mode) plus, from PR3 on, a
   GENERATED `scenery(api)` closure that adds what the engine's generic dressing
   does not (horizon, forest belts, stands at the slow corners, water, flood
   masts). Every colour comes from the packs js/track/scenery/data.js already
   ships (ATM / COL / STAND_LIVERIES), so a custom circuit reads as one of the
   game's own looks rather than a new one. Pure data + one factory; no DOM. */
const TrackThemes = (function () {
  "use strict";
  const { ATM, COL } = TrackSceneryData;

  // Picker / share-code order. The share code (TrackCodec, PR2) stores the INDEX
  // into this list, so append only — never reorder or remove.
  const ORDER = ["parkland", "alpine", "oasis", "desertnight", "harbour", "marina", "tilke", "autumn"];

  const pal = (base, extra) => Object.assign({}, base || {}, extra || {});

  const PRESETS = {
    parkland: {
      label: "PARKLAND GP", blurb: "Rolling deep-green grass, broadleaf tree belts, bright noon sun.",
      swatch: ["#2e7d32", "#9ccc65"],
      theme: "green", sceneryTheme: "park", night: false, street: false,
      pal: { grass: [0.20, 0.44, 0.18], sunDir: [0.5, 0.55, 0.3] },
      terrainOuter: 120, flatTerrain: false, elevStyle: "rolling",
      furniture: { tree: "broad", fol: [0.26, 0.42, 0.20], lamp: "none" },
      standSet: ["steel", "darkSteel", "concrete"],
    },
    alpine: {
      label: "ALPINE FOREST", blurb: "Dark pine walls, grey-blue haze, snowy ridges on the horizon.",
      swatch: ["#1b5e20", "#cfd8dc"],
      theme: "green", sceneryTheme: "park", night: false, street: false,
      pal: pal(ATM.alpineGreen),
      terrainOuter: 160, flatTerrain: false, elevStyle: "hilly",
      furniture: { tree: "fir", fol: [0.16, 0.32, 0.18], lamp: "none" },
      standSet: ["darkSteel", "alu", "scaffold"],
    },
    oasis: {
      label: "DESERT OASIS", blurb: "Ochre sand run-off, sparse palms, white-hot sun.",
      swatch: ["#c9a35b", "#f4e3b2"],
      theme: "desert", sceneryTheme: "desert", night: false, street: false,
      pal: pal(ATM.dustyBowl, { runoff: COL.desertSand }),
      terrainOuter: 120, flatTerrain: true, elevStyle: "flat",
      furniture: { tree: "palm", fol: [0.28, 0.40, 0.18], lamp: "arm", lc: [1.0, 0.80, 0.45], sparse: true },
      standSet: ["sandstone", "concrete", "alu"],
    },
    desertnight: {
      label: "DESERT NIGHT", blurb: "Floodlit sand, warm amber sky, long shadows.",
      swatch: ["#3e2723", "#ffb74d"],
      theme: "desert", sceneryTheme: "night-event", night: true, street: false,
      pal: pal(ATM.warmNight, { runoff: [0.30, 0.26, 0.20] }),
      terrainOuter: 120, flatTerrain: true, elevStyle: "flat",
      furniture: { tree: "palm", fol: [0.26, 0.38, 0.18], lamp: "arm", lc: [1.0, 0.82, 0.50], sparse: true },
      standSet: ["sandstone", "darkSteel", "alu"],
    },
    harbour: {
      label: "HARBOUR STREET", blurb: "Concrete walls, pastel façades, a marina beside the track.",
      swatch: ["#ffcc80", "#4fc3f7"],
      theme: "street_day", sceneryTheme: "street", night: false, street: true,
      pal: pal(ATM.rivieraDay),
      terrainOuter: 28, flatTerrain: false, elevStyle: "flat", baseHW: 6.0,
      furniture: { tree: "palm", fol: [0.25, 0.45, 0.22], lamp: "globe", lc: [1.0, 0.92, 0.70] },
      standSet: ["pastel", "scaffold", "alu"],
      pit: { mode: "street" },
      cityStyle: { neon: ["gold", "teal", "white", "rose"], dayPal: ["cream", "sand", "ochre", "terra", "peach"], bias: 0.12 },
    },
    marina: {
      label: "MARINA NIGHT", blurb: "Floodlit walls, neon skyline on dark water.",
      swatch: ["#0d1b2a", "#e040fb"],
      theme: "street_night", sceneryTheme: "night-event", night: true, street: true,
      pal: pal(ATM.coolNight),
      terrainOuter: 36, flatTerrain: false, elevStyle: "flat", baseHW: 6.0,
      furniture: { tree: "palm", fol: [0.22, 0.40, 0.18], lamp: "arm", lc: [0.90, 0.95, 1.0] },
      standSet: ["navy", "darkSteel", "alu"],
      pit: { mode: "street" },
      cityStyle: { neon: ["mag", "cyan", "violet", "teal"], bias: 0.55 },
    },
    tilke: {
      label: "TILKE MODERN", blurb: "Wide painted run-off, sleek stands and a tower, manicured grass.",
      swatch: ["#1e88e5", "#eceff1"],
      theme: "modern", sceneryTheme: "permanent", night: false, street: false,
      pal: { grass: [0.22, 0.44, 0.20], runoff: COL.aquaRunoff },
      terrainOuter: 120, flatTerrain: false, elevStyle: "flat",
      furniture: { tree: "plane", fol: [0.30, 0.46, 0.22], lamp: "post", lc: [0.95, 0.95, 1.0] },
      standSet: ["navy", "teal", "darkSteel"],
    },
    autumn: {
      label: "AUTUMN COUNTRYSIDE", blurb: "Amber trees, golden low sun, mist in the dips.",
      swatch: ["#bf360c", "#ffd54f"],
      theme: "green", sceneryTheme: "park", night: false, street: false,
      pal: { grass: [0.30, 0.38, 0.16], horizon: [0.80, 0.74, 0.62], fog: [0.78, 0.72, 0.62], sunColor: [1.0, 0.86, 0.62], sun: [1.0, 0.88, 0.60] },
      terrainOuter: 140, flatTerrain: false, elevStyle: "rolling",
      furniture: { tree: "broadleafFall", fol: [0.62, 0.34, 0.12], lamp: "none" },
      standSet: ["concrete", "terracotta", "steel"],
    },
  };

  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

  function has(id) { return Object.prototype.hasOwnProperty.call(PRESETS, id); }
  /** The preset, or parkland for an id this build does not know (an older or
   *  newer share code): the circuit still builds, in the default look. */
  function get(id) { return PRESETS[has(id) ? id : ORDER[0]]; }

  /** The def fields a design inherits from its theme — what js/editor/custom-tracks.js
   *  spreads into the raw def before TrackDef.fromRaw copies them onto the LIST entry. */
  function defFields(id) {
    const p = get(id);
    const out = {
      theme: p.theme, sceneryTheme: p.sceneryTheme, night: !!p.night, street: !!p.street,
      pal: clone(p.pal), terrainOuter: p.terrainOuter, flatTerrain: !!p.flatTerrain,
      furniture: clone(p.furniture), standSet: clone(p.standSet),
    };
    if (p.cityStyle) out.cityStyle = clone(p.cityStyle);
    if (p.pit) out.pit = clone(p.pit);
    return out;
  }

  // ── The generated scenery(api) closure ────────────────────────────────────
  // The engine's generic passes already give a custom circuit its barriers,
  // kit, roadside trees, marshals, pit complex and (street/modern) city blocks.
  // What they do not make — because no shipped circuit asked the ENGINE for
  // them — is everything beyond the ribbon: a horizon, forest belts, grandstands
  // where the action is, water, flood masts. Each preset gets those here, seeded
  // from the design (Hash32.unit — api.hash is only node-seeded, so two loops
  // with the same node count would share a scatter). Every placement stays
  // inside the api's own guards (onTrack footprint rejection, the mast caps) and
  // inside the fleet prop budget: belts cover at most ~35 % of the lap, the
  // horizon is at most 28 pieces beyond lapBounds().radius + 120.

  /** Build-time reads of the centreline the dressers share. */
  function survey(api) {
    const { track, n, px, pz, curv } = Object.assign({ curv: api.track.curv }, api);
    const total = track.total, ds = total / n;
    const K = 0.0035;   // TrackPit.PIT_K: "not actively cornering"
    // Straights: runs of |k| ≤ K, longest first, as lap fractions.
    const straights = [];
    let run = 0, start = 0;
    for (let i = 0; i < 2 * n; i++) {
      const k = i % n;
      if (Math.abs(curv[k]) <= K) { if (!run) start = k; run++; }
      else { if (run >= 50) straights.push({ s0: start / n, s1: ((start + run) % n) / n, lenM: run * ds, k0: start, k1: (start + run) % n }); run = 0; }
      if (i >= n && run > n) break;
    }
    straights.sort((a, b) => b.lenM - a.lenM);
    const uniq = straights.filter((s, i) => straights.findIndex((t) => t.k0 === s.k0) === i).slice(0, 6);
    // Slow corners: top |k| peaks ≥ 250 m from the start line and 300 m apart.
    const peaks = [];
    for (let k = 0; k < n; k++) {
      const v = Math.abs(curv[k]);
      if (v > 0.004 && v >= Math.abs(curv[(k - 1 + n) % n]) && v > Math.abs(curv[(k + 1) % n])) peaks.push({ k, v, left: curv[k] > 0 });
    }
    peaks.sort((a, b) => b.v - a.v);
    const slow = [];
    for (const p of peaks) {
      const sM = p.k * ds, fromStart = Math.min(sM, total - sM);
      if (fromStart < 250) continue;
      if (slow.some((q) => { let d = Math.abs(q.k - p.k) * ds; d = Math.min(d, total - d); return d < 300; })) continue;
      slow.push(p); if (slow.length >= 3) break;
    }
    // Outward side at a node: the right vector's component away from the centroid.
    const { cx, cz, radius } = api.lapBounds();
    const outward = (k) => ((px[k] - cx) * track.rx[k] + (pz[k] - cz) * track.rz[k]) >= 0 ? 1 : -1;
    // The farthest node from the centroid (where a shoreline reads best).
    let far = 0, fd = -1;
    for (let k = 0; k < n; k += 4) { const d = Math.hypot(px[k] - cx, pz[k] - cz); if (d > fd) { fd = d; far = k; } }
    const pitSide = (typeof TrackPit !== "undefined" && TrackPit.resolve) ? TrackPit.resolve(api.def).side : 1;
    return { n, total, ds, straights: uniq, slow, outward, far, cx, cz, radius, pitSide, K };
  }

  const rgb = (c, m) => [c[0] * m, c[1] * m, c[2] * m];

  /** Grandstands on the pit straight (opposite the pit complex) + banks at the slow corners. */
  function stands(api, sv, h, opts) {
    const { grandstandEx, spectatorHill } = api;
    const side = -sv.pitSide, L = sv.total;
    const startLen = Math.min(140, Math.max(60, sv.straights.length ? sv.straights[0].lenM * 0.25 : 90));
    grandstandEx(0.0, side, 18, startLen, null, null, { tiers: opts.tiers || 1, h: opts.h || 12, livery: opts.livery });
    if (opts.second !== false) grandstandEx((startLen + 40) / L, side, 18, Math.round(startLen * 0.7), null, null, { tiers: 1, h: 10, livery: opts.livery2 || opts.livery });
    sv.slow.slice(0, opts.hills != null ? opts.hills : 3).forEach((p, i) => {
      const f = p.k / sv.n, out = p.left ? 1 : -1;   // +k = LEFT turn: the outside of the bend is the right-hand side
      const half = 0.011 + h("hill", i) * 0.006;
      if (opts.stand && i === 0) grandstandEx(f, out, 20, 90, null, null, { tiers: 1, h: 11, livery: opts.livery });
      else spectatorHill(f - half, f + half, out, 24 + h("hillGap", i) * 8, { rows: 4 + Math.round(h("rows", i) * 2), density: 0.4 + h("dens", i) * 0.2, grass: opts.grass });
    });
  }
  /** Forest belts along the longest straights (and a sprinkling of corners), ≤ coverage of the lap. */
  function belts(api, sv, h, opts) {
    const { forestEdge } = api;
    let covered = 0;
    const budget = (opts.coverage || 0.35) * sv.total;
    const spans = sv.straights.map((s) => ({ s0: s.s0, s1: s.s1, lenM: s.lenM }));
    // Both sides of the longest straight, then alternate sides.
    spans.forEach((sp, i) => {
      if (covered >= budget) return;
      const sides = i === 0 ? [-1, 1] : [h("beltSide", i) < 0.5 ? -1 : 1];
      for (const side of sides) {
        if (covered >= budget) break;
        const gap = (opts.gap || 30) + h("beltGap", i * 2 + side) * 14;
        forestEdge(sp.s0, sp.s1, side, gap, { hMin: opts.hMin || 9, hMax: opts.hMax || 17, col: opts.col, col2: opts.col2, pineFrac: opts.pineFrac != null ? opts.pineFrac : 0.4, density: opts.density || 0.35 });
        if (opts.second) forestEdge(sp.s0, sp.s1, side, gap + 36, { hMin: (opts.hMin || 9) + 3, hMax: (opts.hMax || 17) + 5, col: opts.col2, col2: opts.col, pineFrac: opts.pineFrac != null ? opts.pineFrac : 0.4, density: 0.2 });
        covered += sp.lenM;
      }
    });
  }
  /** A ring of low ridges (or mountains) beyond the lap's reach. */
  function horizon(api, sv, h, opts) {
    const { ridge, mountain, pyMin } = api;
    const count = Math.min(28, opts.count || 24), r0 = sv.radius + (opts.rMin || 150), r1 = sv.radius + (opts.rMax || 260);
    for (let i = 0; i < count; i++) {
      const a = (i + (h("ringA", i) - 0.5) * 0.6) / count * Math.PI * 2;
      const rr = r0 + h("ringR", i) * (r1 - r0);
      const x = sv.cx + Math.cos(a) * rr, z = sv.cz + Math.sin(a) * rr;
      if (opts.mountain) {
        const w = (opts.w0 || 700) + h("ringW", i) * (opts.w1 || 400), hh = (opts.h0 || 260) + h("ringH", i) * (opts.h1 || 160);
        mountain(x, z, pyMin - 16, w, hh, { seg: 10 + Math.round(h("ringSeg", i) * 4), seed: 3 + i * 5, rough: opts.rough != null ? opts.rough : 0.3,
          snowline: opts.snowline != null ? opts.snowline : 1.6, snow: opts.snow, rock: opts.rock || [0.33, 0.32, 0.36], forest: opts.forest || [0.14, 0.24, 0.20] });
      } else {
        const len = (opts.len || 160) + h("ringL", i) * 80, w = (opts.wid || 36) + h("ringWd", i) * 14, hh = (opts.h0 || 10) + h("ringH", i) * (opts.h1 || 8);
        const col = opts.cols ? opts.cols[i % opts.cols.length] : [0.22, 0.42, 0.20];
        ridge(x, z, pyMin, a + Math.PI / 2 + (h("ringT", i) - 0.5) * 0.5, len, w, hh, col);
      }
    }
  }
  /** Water on the outward side of the farthest node (a coast, a lake), plus a second sheet ≥ ¼ lap away. */
  function shore(api, sv, h, opts) {
    const { waterSurface, K } = api;
    const n = sv.n;
    const place = (k, tag) => waterSurface(k, sv.outward(k), opts.gap || 30, opts.size || [700, 0.2, 900], opts.col || [0.18, 0.38, 0.56], { id: "custom-water-" + tag });
    place(sv.far, "a");
    if (opts.second !== false) place(K(((sv.far / n) + 0.25 + h("shore", 1) * 0.5) % 1), "b");
  }
  function floods(api, sv, h, opts) {
    const step = Math.max(60, sv.total / 200);   // ≤ 400 masts: under the 512 lamp cap with room for the pit flood banks
    api.floodMastRing(step, { dist: opts.dist || 28, h: opts.h || 26, cool: opts.cool !== false, pool: true });
  }
  function oasis(api, sv, h, opts) {
    // One pool on the inside of the lap, where there is most room; false when the footprint is rejected.
    const inside = -sv.outward(sv.far);
    api.waterSurface(sv.far, inside, 60, [140, 0.3, 90], opts.col || [0.16, 0.42, 0.48], { id: "custom-oasis" });
  }

  const DRESS = {
    parkland(api, sv, h) {
      belts(api, sv, h, { coverage: 0.35, gap: 40, col: [0.20, 0.40, 0.18], col2: [0.26, 0.42, 0.20], pineFrac: 0.2, hMin: 9, hMax: 16 });
      stands(api, sv, h, { tiers: 2, h: 13 });
      horizon(api, sv, h, { count: 24, h0: 10, h1: 6, cols: [[0.22, 0.42, 0.20], [0.20, 0.38, 0.18]] });
    },
    alpine(api, sv, h) {
      belts(api, sv, h, { coverage: 0.5, gap: 30, col: [0.12, 0.28, 0.14], col2: [0.16, 0.32, 0.18], pineFrac: 0.85, hMin: 14, hMax: 24, density: 0.3, second: true });
      stands(api, sv, h, { tiers: 1, h: 11, hills: 2, second: false });
      horizon(api, sv, h, { mountain: true, count: 12, rMin: 900, rMax: 1500, w0: 700, w1: 400, h0: 260, h1: 160, rough: 0.3, snowline: 0.55, snow: [0.95, 0.96, 1.0], rock: [0.33, 0.32, 0.36], forest: [0.14, 0.24, 0.20] });
    },
    oasis(api, sv, h) {
      horizon(api, sv, h, { count: 28, rMin: 180, rMax: 320, len: 200, wid: 46, h0: 14, h1: 14, cols: [[0.74, 0.60, 0.40], [0.70, 0.56, 0.38]] });
      oasis(api, sv, h, {});
      stands(api, sv, h, { tiers: 1, h: 12, hills: 1, grass: [0.62, 0.52, 0.34] });
    },
    desertnight(api, sv, h) {
      horizon(api, sv, h, { count: 28, rMin: 180, rMax: 320, len: 200, wid: 46, h0: 14, h1: 14, cols: [[0.36, 0.30, 0.22], [0.32, 0.27, 0.20]] });
      oasis(api, sv, h, { col: [0.06, 0.12, 0.18] });
      stands(api, sv, h, { tiers: 1, h: 12, hills: 1, grass: [0.30, 0.26, 0.20] });
      floods(api, sv, h, { cool: false });
    },
    harbour(api, sv, h) {
      shore(api, sv, h, { col: [0.18, 0.38, 0.56] });
      stands(api, sv, h, { tiers: 1, h: 9, hills: 0, livery: "alu", livery2: "scaffold" });
    },
    marina(api, sv, h) {
      shore(api, sv, h, { col: [0.04, 0.08, 0.14] });
      stands(api, sv, h, { tiers: 1, h: 9, hills: 0, livery: "navy", livery2: "alu" });
      floods(api, sv, h, { cool: true, dist: 26, h: 22 });
    },
    tilke(api, sv, h) {
      stands(api, sv, h, { tiers: 3, h: 16, hills: 2, stand: true, livery: "navy", livery2: "teal" });
      // The hotel over the pit straight, set back behind the stands.
      if (api.building) api.building(api.K(0.03), -sv.pitSide, 120, 30, 60, 30, { kind: "slab" });
      horizon(api, sv, h, { count: 20, h0: 6, h1: 5, cols: [[0.24, 0.44, 0.22]] });
    },
    autumn(api, sv, h) {
      belts(api, sv, h, { coverage: 0.4, gap: 34, col: [0.66, 0.36, 0.12], col2: [0.52, 0.28, 0.10], pineFrac: 0.1, hMin: 9, hMax: 16 });
      stands(api, sv, h, { tiers: 1, h: 11, hills: 3, livery: "terracotta" });
      horizon(api, sv, h, { count: 24, rMin: 160, rMax: 300, h0: 12, h1: 10, cols: [[0.36, 0.40, 0.18], [0.44, 0.38, 0.16]] });
    },
  };

  /** The generated `scenery(api)` closure for a design. An inline closure beats
   *  the js/circuits/scenery registry (build-props.js resolves def.scenery
   *  first) and tells game.js's ensureScenery there is nothing to fetch. Every
   *  draw is seeded from the design, so the same share code dresses the same
   *  circuit on every machine. A dresser that throws leaves the generic
   *  dressing standing: the build must never strand on a theme. */
  function sceneryFor(design) {
    const themeId = has(design && design.theme) ? design.theme : ORDER[0];
    const seed = (design && design.seed) >>> 0 || 1;
    return function customScenery(api) {
      const h = (tag, i) => Hash32.unit(seed, themeId, tag, i == null ? 0 : i);
      try {
        const sv = survey(api);
        DRESS[themeId](api, sv, h);
        Log.info("track", "custom scenery " + api.def.id + " theme=" + themeId + " straights=" + sv.straights.length + " slow=" + sv.slow.length);
      } catch (e) {
        Log.warn("track", "custom scenery " + themeId + " failed — generic dressing only: " + (e && e.message || e));
      }
    };
  }

  return { ORDER, PRESETS, has, get, defFields, sceneryFor, survey, DRESS };
})();
Object.freeze(TrackThemes);
