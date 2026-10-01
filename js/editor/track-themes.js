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

  /** The generated `scenery(api)` closure for a design. PR1 ships the hook and
   *  the engine's generic dressing (barriers, kit, trees, pits, themed city);
   *  PR3 fills in the horizon, belts, stands and water per preset, seeded from
   *  design.seed. An inline closure beats the js/circuits/scenery registry
   *  (build-props.js resolves def.scenery first) and tells game.js's
   *  ensureScenery there is nothing to fetch. */
  function sceneryFor(design) {
    const themeId = design && design.theme;
    return function customScenery(api) {
      if (api && api.def) Log.info("track", "custom scenery " + api.def.id + " theme=" + (has(themeId) ? themeId : ORDER[0]) + " (generic dressing only until PR3)");
    };
  }

  return { ORDER, PRESETS, has, get, defFields, sceneryFor };
})();
Object.freeze(TrackThemes);
