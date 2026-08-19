/* Apex 26 — static scenery data tables for js/track/tracks.js buildProps(). Pure constants (no closure state): per-track street-furniture + barrier liveries, crow… */
const TrackSceneryData = (function () {
  "use strict";

  const NC = {
    mag: [0.95, 0.15, 0.55], cyan: [0.18, 0.85, 0.98], gold: [1.00, 0.78, 0.12],
    violet: [0.62, 0.22, 1.0], blue: [0.22, 0.48, 1.0], orange: [1.00, 0.42, 0.08],
    red: [1.0, 0.16, 0.22], teal: [0.0, 0.92, 0.78], white: [0.86, 0.92, 1.0],
    green: [0.25, 1.0, 0.45], pink: [1.0, 0.30, 0.62], lime: [0.66, 1.0, 0.22],
    ice: [0.55, 0.82, 1.0], yellow: [1.0, 0.92, 0.25], purple: [0.82, 0.30, 0.96],
    rose: [1.0, 0.45, 0.55], amber: [1.00, 0.55, 0.12],
  };

  const DC = {
    cream:   [0.86, 0.82, 0.72], sand:    [0.80, 0.71, 0.54], tan:     [0.74, 0.63, 0.47],
    stone:   [0.78, 0.76, 0.70], terra:   [0.74, 0.46, 0.34], brick:   [0.62, 0.40, 0.34],
    ochre:   [0.82, 0.63, 0.36], white:   [0.88, 0.88, 0.85], greyblue:[0.56, 0.62, 0.70],
    slate:   [0.48, 0.53, 0.60], paleblue:[0.66, 0.74, 0.83], teal:    [0.54, 0.70, 0.68],
    peach:   [0.92, 0.74, 0.61], pink:    [0.90, 0.69, 0.74], mint:    [0.72, 0.86, 0.77],
    aqua:    [0.62, 0.82, 0.84], lemon:   [0.92, 0.87, 0.62], coral:   [0.88, 0.55, 0.46],
    // darker greys + cool glass + muted metals for modern downtown cores
    concrete:[0.52, 0.53, 0.55], charcoal:[0.34, 0.36, 0.41], graphite:[0.27, 0.29, 0.34],
    steel:   [0.45, 0.50, 0.57], darkglass:[0.26, 0.34, 0.45], bluglass:[0.34, 0.44, 0.58],
    bronze:  [0.55, 0.45, 0.33], gold:    [0.72, 0.58, 0.30], copper:  [0.62, 0.42, 0.30],
  };

  const BLD = ["setback", "tiered", "podium", "slab", "twin", "jenga", "cylinder", "spire", "dome", "chevron", "notch", "fin", "antenna", "cross", "arch", "ziggurat", "drum", "hall"];

  const CROWD_DAY = [
    [0.82, 0.82, 0.84], [0.74, 0.72, 0.68], [0.30, 0.34, 0.52], [0.20, 0.24, 0.34],
    [0.78, 0.20, 0.20], [0.86, 0.52, 0.16], [0.90, 0.82, 0.28], [0.24, 0.48, 0.28],
    [0.20, 0.44, 0.66], [0.66, 0.24, 0.42], [0.52, 0.54, 0.58], [0.90, 0.90, 0.92],
    [0.40, 0.26, 0.18], [0.14, 0.16, 0.20], [0.86, 0.40, 0.46], [0.30, 0.62, 0.60],
  ];

  const WINTINTS = [
    [0.98, 0.86, 0.56], [0.92, 0.82, 0.60],   // warm office
    [0.62, 0.76, 1.00], [0.72, 0.84, 0.98],   // cool glass
    [1.00, 0.70, 0.85], [0.70, 0.95, 0.90],   // soft accents
  ];

  const HOUSE_WALLS = [[0.86, 0.80, 0.68], [0.80, 0.62, 0.46], [0.74, 0.72, 0.70], [0.70, 0.50, 0.38]];

  const HOUSE_ROOFS = [[0.42, 0.20, 0.14], [0.32, 0.32, 0.35], [0.36, 0.24, 0.16]];

  const MOTORHOME_BODY = [[0.90, 0.90, 0.92], [0.85, 0.86, 0.90], [0.94, 0.92, 0.86]];

  const SIGN_SEG = {
    top: [0.16, 0.84, 0.86, 1.00], mid: [0.16, 0.84, 0.44, 0.58], bottom: [0.16, 0.84, 0.00, 0.14],
    topL: [0.04, 0.20, 0.50, 0.94], topR: [0.80, 0.96, 0.50, 0.94],
    botL: [0.04, 0.20, 0.06, 0.50], botR: [0.80, 0.96, 0.06, 0.50],
  };

  const SIGN_DIGIT = {
    0: ["top", "topL", "topR", "botL", "botR", "bottom"], 1: ["topR", "botR"],
    2: ["top", "topR", "mid", "botL", "bottom"], 3: ["top", "topR", "mid", "botR", "bottom"],
    4: ["topL", "topR", "mid", "botR"], 5: ["top", "topL", "mid", "botR", "bottom"],
    6: ["top", "topL", "mid", "botL", "botR", "bottom"], 7: ["top", "topR", "botR"],
    8: ["top", "topL", "topR", "mid", "botL", "botR", "bottom"], 9: ["top", "topL", "topR", "mid", "botR", "bottom"],
  };

  const BARRIER = {
    monaco:    { a: [0.95, 0.95, 0.96], b: [0.86, 0.16, 0.15], c: [0.13, 0.28, 0.55], night: [0.20, 0.20, 0.24], tyre: [0.86, 0.16, 0.15] },  // red/white + Riviera navy
    vegas:     { a: [0.97, 0.84, 0.12], b: [0.10, 0.10, 0.12], c: [0.85, 0.12, 0.48], night: [0.28, 0.10, 0.32], tyre: [0.97, 0.84, 0.12] },  // casino gold/black + neon magenta
    singapore: { a: [0.92, 0.93, 0.96], b: [0.10, 0.34, 0.74], c: [0.90, 0.12, 0.18], night: [0.12, 0.16, 0.32], tyre: [0.10, 0.34, 0.74] },  // white/blue + flag red
    baku:      { a: [0.93, 0.94, 0.96], b: [0.00, 0.62, 0.58], c: [0.95, 0.45, 0.08], night: [0.08, 0.22, 0.22], tyre: [0.00, 0.62, 0.58] },  // teal/white + flame orange
    // Jeddah night: pale grey concrete rail (not solid green) + green/gold day accents
    jeddah:    { a: [0.95, 0.95, 0.96], b: [0.05, 0.52, 0.28], c: [0.95, 0.80, 0.12], night: [0.42, 0.44, 0.48], tyre: [0.05, 0.52, 0.28] },
    madrid:    { a: [0.90, 0.12, 0.14], b: [0.97, 0.81, 0.12], c: [0.55, 0.12, 0.42], night: [0.26, 0.13, 0.06], tyre: [0.97, 0.81, 0.12] },  // Spain red/gold + crimson-purple
    miami:     { a: [0.97, 0.32, 0.56], b: [0.08, 0.74, 0.78], c: [0.97, 0.80, 0.22], night: [0.30, 0.10, 0.32], tyre: [0.97, 0.32, 0.56] },  // vice pink/teal + sun gold
    shanghai:  { a: [0.90, 0.12, 0.14], b: [0.95, 0.95, 0.96], c: [0.97, 0.80, 0.12], night: [0.22, 0.10, 0.13], tyre: [0.90, 0.12, 0.14] },  // China red/white + gold
    mexico:    { a: [0.05, 0.55, 0.26], b: [0.95, 0.95, 0.96], c: [0.90, 0.12, 0.14], night: [0.09, 0.20, 0.11], tyre: [0.05, 0.55, 0.26] },  // flag green/white/red
    // Yas Marina: teal / magenta / amber accents on pale rails
    abudhabi:  { a: [0.90, 0.92, 0.94], b: [0.00, 0.72, 0.68], c: [0.92, 0.18, 0.55], night: [0.10, 0.18, 0.22], tyre: [1.00, 0.62, 0.18] },
  };

  // Every circuit — city, desert AND forest/green — gets its own incidental
  // models so no two tracks share trees and lighting. tree: palm|broad|fir|
  // none; lamp: arm|globe|post|none with a per-track tint. Green circuits get
  // distinct foliage tints + species (Spa/Red Bull pine, Monza royal-park deep
  // green, Zandvoort dune scrub, Interlagos tropical, autumnal mixes) layered
  // behind their existing scenery. Trees/lamps never call blockAt and respect
  // onTrack(), so they add depth without touching the driving boundary.
  const FURN = {
    monaco:    { tree: "palm",  fol: [0.28, 0.44, 0.22], lamp: "globe", lc: [1.0, 0.92, 0.70] },  // Riviera palms
    vegas:     { tree: "palm",  fol: [0.22, 0.42, 0.18], lamp: "arm",   lc: [1.0, 0.86, 0.55] },
    singapore: { tree: "palm",  fol: [0.16, 0.46, 0.20], lamp: "arm",   lc: [0.85, 0.95, 1.0] },
    baku:      { tree: "palm",  fol: [0.30, 0.42, 0.20], lamp: "globe", lc: [1.0, 0.82, 0.50] },  // Caspian boulevard palms
    jeddah:    { tree: "palm",  fol: [0.22, 0.44, 0.20], lamp: "arm",   lc: [1.0, 0.88, 0.60] },
    madrid:    { tree: "plane", fol: [0.40, 0.45, 0.27], lamp: "post",  lc: [1.0, 0.90, 0.66] },   // olive, not northern green
    miami:     { tree: "palm",  fol: [0.20, 0.48, 0.22], lamp: "post",  lc: [1.0, 0.78, 0.85] },
    shanghai:  { tree: "broad", fol: [0.24, 0.42, 0.22], lamp: "post",  lc: [0.90, 0.96, 1.0] },
    mexico:    { tree: "broad", fol: [0.32, 0.44, 0.18], lamp: "post",  lc: [1.0, 0.86, 0.55] },
    // Sakhir: sparse desert — cool-white lamps, thin palm line (not oasis green)
    bahrain:   { tree: "palm",  fol: [0.30, 0.40, 0.18], lamp: "arm",   lc: [0.88, 0.94, 1.0], sparse: true },
    qatar:     { tree: "palm",  fol: [0.28, 0.40, 0.18], lamp: "arm",   lc: [0.90, 0.95, 1.0], sparse: true },
    abudhabi:  { tree: "palm",  fol: [0.26, 0.42, 0.20], lamp: "arm",   lc: [1.0, 0.82, 0.50] },
    spa:         { tree: "fir",   fol: [0.14, 0.31, 0.21], lamp: "none" },                 // dark Ardennes spruce, blue-green
    silverstone: { tree: "broad", fol: [0.28, 0.45, 0.22], lamp: "none", treeCrown: "vase" },                 // English oak copses, mid-green
    monza:       { tree: "stonePine", fol: [0.16, 0.34, 0.17], lamp: "none" },                 // deep royal-park canopy
    suzuka:      { tree: "broad", fol: [0.24, 0.46, 0.24], lamp: "none" },                 // mixed Japanese hill forest
    interlagos:  { tree: "palm",  fol: [0.26, 0.48, 0.20], lamp: "none" },                 // warm subtropical
    zandvoort:   { tree: "fir",   fol: [0.40, 0.45, 0.29], lamp: "none", sparse: true },   // coastal dune scrub — thin + pale
    redbull:     { tree: "fir",   fol: [0.17, 0.40, 0.22], lamp: "none" },                 // lush emerald alpine spruce
    imola:       { tree: "cypress", fol: [0.24, 0.41, 0.21], lamp: "none" },                 // columnar spires
    hungaroring: { tree: "broad", fol: [0.44, 0.44, 0.19], lamp: "none", sparse: true, treeCrown: "columnar" },   // dry straw-olive, dusty bowl
    cota:        { tree: "acacia", fol: [0.32, 0.39, 0.18], lamp: "none" },                 // dry Texas live oak
    montreal:    { tree: "fir",   fol: [0.20, 0.42, 0.23], lamp: "none" },                 // lush island maple/conifer
    albert_park: { tree: "broad", fol: [0.28, 0.46, 0.22], lamp: "none", treeCrown: "vase" },                 // tidy Melbourne parkland
    hockenheim:    { tree: "fir",   fol: [0.11, 0.30, 0.15], lamp: "none" },                          // Hardtwald pine corridor
    nurburgring:   { tree: "fir",   fol: [0.09, 0.27, 0.14], lamp: "none" },                          // dark Eifel spruce, bluer than Spa
    catalunya:     { tree: "stonePine",   fol: [0.16, 0.32, 0.17], lamp: "post",  lc: [0.96, 0.96, 1.0], sparse: true },  // thin Catalan umbrella pine
    sepang:        { tree: "palm",  fol: [0.16, 0.40, 0.18], lamp: "arm",   lc: [1.0, 0.94, 0.72] },  // ordered oil-palm plantation
    istanbul:      { tree: "stonePine",   fol: [0.13, 0.30, 0.16], lamp: "post",  lc: [1.0, 0.90, 0.66], sparse: true },  // sparse Thracian hillside pine
    paul_ricard:   { tree: "stonePine",   fol: [0.14, 0.30, 0.16], lamp: "none",  sparse: true },           // bleached plateau — planting stays off the runoff
    portimao:      { tree: "stonePine",   fol: [0.14, 0.31, 0.16], lamp: "none",  sparse: true },           // thin Algarve pine; the elevation is the view
    sochi:         { tree: "broad", fol: [0.20, 0.44, 0.20], lamp: "globe", lc: [0.94, 0.96, 1.0], treeCrown: "columnar" },  // landscaped Olympic-park planting
    mugello:       { tree: "cypress", fol: [0.20, 0.44, 0.20], lamp: "none" },                          // Tuscan broadleaf behind the cypress ranks
    magny_cours:   { tree: "broad", fol: [0.22, 0.46, 0.22], lamp: "none", treeCrown: "weeping" },                          // Nivernais poplar and hedgerow
    indianapolis:  { tree: "broad", fol: [0.22, 0.42, 0.19], lamp: "post",  lc: [0.94, 0.96, 1.0] },  // clipped infield planting + service lighting
    buenos_aires:  { tree: "plane", fol: [0.30, 0.50, 0.24], lamp: "globe", lc: [1.0, 0.90, 0.68] },  // plátano avenues, city-park globes
    jacarepagua:   { tree: "palm",  fol: [0.18, 0.44, 0.20], lamp: "post",  lc: [1.0, 0.88, 0.62] },  // Rio coconut palm over restinga
    estoril:       { tree: "broad", fol: [0.29, 0.36, 0.19], lamp: "none", sparse: true, treeCrown: "vase" },  // grey-olive cork oak between the parasol pines
    kyalami:       { tree: "acacia", fol: [0.33, 0.38, 0.21], lamp: "none", sparse: true },  // grey-green thorn; sparse keeps the veld open
    watkins_glen:  { tree: "broadleafFall", fol: [0.56, 0.30, 0.13], lamp: "none" },                // turning scarlet-brown — the fall reads or it doesn't
  };

  const FURN_DEF = {
    green:        { tree: "broad", fol: [0.26, 0.42, 0.20], lamp: "none" },
    desert:       { tree: "palm",  fol: [0.28, 0.40, 0.18], lamp: "arm",   lc: [1.0, 0.80, 0.45] },
    street_night: { tree: "broad", fol: [0.22, 0.40, 0.20], lamp: "arm",   lc: [0.90, 0.95, 1.0] },
    street_day:   { tree: "broad", fol: [0.28, 0.44, 0.22], lamp: "globe", lc: [1.0, 0.90, 0.70] },
    modern:       { tree: "broad", fol: [0.26, 0.42, 0.20], lamp: "post",  lc: [0.95, 0.95, 1.0] },
  };

  // FURN keys a circuit's planting and lighting; KIT keys its barriers,
  // signage and marshal kit. Same rule, same fallback shape:
  //   KIT[def.id] || KIT_DEF[theme] || KIT_DEF.green
  // and every field is optional — an absent field falls back to that emitter's
  // own default, which is its pre-existing geometry.
  //
  // Why this table exists: marshalPost, billboard, fence, guardrail, tyreWall,
  // gantry, cameraTower and sponsorHoarding were ~870 calls of geometry that
  // was byte-identical on all 40 circuits, differing only in tint. They line
  // the whole lap and are in frame constantly, so they were the single largest
  // reason different circuits read as the same place — far more than the
  // grandstands, which are already well parameterised.
  //
  // BUDGET: tyre "double"/"pyramid" multiply the tyre count and fence
  // "hoarding"/"palisade" are heavier than mesh. They appear only on circuits
  // with measured headroom, never in KIT_DEF.
  const KIT = {
    monaco:      { marshal: "tent",      rail: "armco",       fence: "hoarding",  tyre: "tecpro",  board: "fascia",    gantry: "cantilever", camera: "scaffold",  hoarding: "barrierTop" },
    vegas:       { marshal: "hut",       rail: "armco",       fence: "chainlink", tyre: "tecpro",  board: "led",       gantry: "portal",     camera: "scaffold",  hoarding: "led" },
    singapore:   { marshal: "hut",       rail: "armco",       fence: "chainlink", tyre: "tecpro",  board: "led",       gantry: "truss",      camera: "scaffold",  hoarding: "led" },
    baku:        { marshal: "hut",       rail: "armco",       fence: "chainlink",  tyre: "tecpro",  board: "fascia",    gantry: "portal",     camera: "scaffold",  hoarding: "barrierTop" },
    jeddah:      { marshal: "hut",       rail: "armco",       fence: "chainlink",  tyre: "tecpro",  board: "led",       gantry: "portal",     camera: "monopole",  hoarding: "led" },
    miami:       { marshal: "kiosk",     rail: "armco",       fence: "chainlink", tyre: "tecpro",  board: "led",       gantry: "portal",     camera: "scaffold",  hoarding: "led" },
    madrid:      { marshal: "tent",      rail: "jersey",      fence: "hoarding",  tyre: "tecpro",  board: "led",       gantry: "cantilever", camera: "scaffold",  hoarding: "banner" },
    bahrain:     { marshal: "container", rail: "wArmco",      fence: "panelled",  tyre: "stack",   board: "monopole",  gantry: "portal",     camera: "monopole",  hoarding: "panel" },
    qatar:       { marshal: "container", rail: "wArmco",      fence: "panelled",  tyre: "airfence", board: "monopole", gantry: "portal",     camera: "monopole",  hoarding: "led" },
    abudhabi:    { marshal: "kiosk",     rail: "safer",       fence: "panelled",  tyre: "airfence", board: "led",      gantry: "truss",      camera: "monopole",  hoarding: "led" },
    shanghai:    { marshal: "kiosk",     rail: "wArmco",      fence: "panelled",  tyre: "stack",   board: "monopole",  gantry: "truss",      camera: "monopole",  hoarding: "panel" },
    cota:        { marshal: "kiosk",     rail: "safer",       fence: "panelled",  tyre: "tecpro",  board: "monopole",  gantry: "truss",      camera: "lattice",   hoarding: "panel" },
    sochi:       { marshal: "kiosk",     rail: "jersey",      fence: "panelled",  tyre: "tecpro",  board: "led",       gantry: "portal",     camera: "monopole",  hoarding: "led" },
    sepang:      { marshal: "kiosk",     rail: "armco",       fence: "mesh",  tyre: "stack",   board: "monopole",  gantry: "portal",     camera: "monopole",  hoarding: "panel" },
    paul_ricard: { marshal: "kiosk",     rail: "wArmco",      fence: "panelled",  tyre: "tecpro",  board: "monopole",  gantry: "portal",     camera: "monopole",  hoarding: "led" },
    catalunya:   { marshal: "kiosk",     rail: "wArmco",      fence: "leaning",   tyre: "stack",   board: "monopole",  gantry: "portal",     camera: "lattice",   hoarding: "panel" },
    portimao:    { marshal: "cabin",     rail: "wArmco",      fence: "leaning",   tyre: "stack",   board: "trivision", gantry: "box",        camera: "scaffold",  hoarding: "panel" },
    istanbul:    { marshal: "kiosk",     rail: "armco",       fence: "panelled",  tyre: "stack",   board: "monopole",  gantry: "portal",     camera: "monopole",  hoarding: "panel" },
    magny_cours: { marshal: "cabin",     rail: "wArmco",      fence: "mesh",      tyre: "stack",   board: "trivision", gantry: "box",        camera: "lattice",   hoarding: "panel" },
    spa:         { marshal: "cabin",     rail: "doubleArmco", fence: "leaning",   tyre: "stack",   board: "panel",     gantry: "truss",      camera: "lattice",   hoarding: "panel" },
    monza:       { marshal: "hut",       rail: "armco",       fence: "leaning",   tyre: "stack",   board: "arched",    gantry: "truss",      camera: "lattice",   hoarding: "panel" },
    imola:       { marshal: "cabin",     rail: "doubleArmco", fence: "leaning",   tyre: "stack",   board: "arched",    gantry: "box",        camera: "lattice",   hoarding: "panel" },
    silverstone: { marshal: "cabin",     rail: "armco",       fence: "mesh",      tyre: "stack",   board: "panel",     gantry: "truss",      camera: "lattice",   hoarding: "panel" },
    hockenheim:  { marshal: "bunker",    rail: "doubleArmco", fence: "leaning",   tyre: "stack",   board: "panel",     gantry: "truss",      camera: "lattice",   hoarding: "panel" },
    nurburgring: { marshal: "bunker",    rail: "doubleArmco", fence: "leaning",   tyre: "stack",   board: "panel",     gantry: "truss",      camera: "lattice",   hoarding: "panel" },
    zandvoort:   { marshal: "cabin",     rail: "armco",       fence: "palisade",  tyre: "stack",   board: "banner",    gantry: "box",        camera: "scaffold",  hoarding: "banner" },
    interlagos:  { marshal: "cabin",     rail: "armco",       fence: "mesh",      tyre: "stack",   board: "panel",     gantry: "box",        camera: "lattice",   hoarding: "panel" },
    suzuka:      { marshal: "kiosk",     rail: "wArmco",      fence: "panelled",  tyre: "stack",   board: "banner",    gantry: "truss",      camera: "lattice",   hoarding: "banner" },
    mugello:     { marshal: "cabin",     rail: "armco",       fence: "leaning",   tyre: "stack",   board: "arched",    gantry: "box",        camera: "lattice",   hoarding: "panel" },
    estoril:     { marshal: "cabin",     rail: "armco",       fence: "mesh",      tyre: "stack",   board: "trivision", gantry: "box",        camera: "scaffold",  hoarding: "panel" },
    kyalami:     { marshal: "cabin",     rail: "cable",       fence: "mesh",      tyre: "stack",   board: "panel",     gantry: "box",        camera: "lattice",   hoarding: "panel" },
    watkins_glen:{ marshal: "cabin",     rail: "armco",       fence: "mesh",      tyre: "stack",   board: "panel",     gantry: "box",        camera: "lattice",   hoarding: "panel" },
    buenos_aires:{ marshal: "cabin",     rail: "cable",       fence: "palisade",  tyre: "stack",   board: "arched",    gantry: "box",        camera: "lattice",   hoarding: "panel" },
    jacarepagua: { marshal: "cabin",     rail: "cable",       fence: "mesh",      tyre: "stack",   board: "panel",     gantry: "box",        camera: "lattice",   hoarding: "banner" },
    indianapolis:{ marshal: "tower",     rail: "safer",       fence: "chainlink", tyre: "stack",   board: "tower",     gantry: "truss",      camera: "lattice",   hoarding: "double" },
    montreal:    { marshal: "hut",       rail: "armco",       fence: "mesh",      tyre: "stack",   board: "panel",     gantry: "box",        camera: "lattice",   hoarding: "panel" },
    redbull:     { marshal: "cabin",     rail: "armco",       fence: "mesh",   tyre: "stack",   board: "banner",    gantry: "portal",     camera: "monopole",  hoarding: "banner" },
    hungaroring: { marshal: "hut",       rail: "armco",       fence: "mesh",      tyre: "stack",   board: "panel",     gantry: "box",        camera: "lattice",   hoarding: "panel" },
    mexico:      { marshal: "hut",       rail: "armco",       fence: "chainlink",  tyre: "tecpro",  board: "led",       gantry: "portal",     camera: "scaffold",  hoarding: "led" },
    albert_park: { marshal: "container", rail: "jersey",      fence: "chainlink", tyre: "tecpro",  board: "panel",     gantry: "box",        camera: "scaffold",  hoarding: "panel" },
  };

  const KIT_DEF = {
    green:        { marshal: "hut", rail: "armco", fence: "mesh", tyre: "stack", board: "panel", gantry: "box", camera: "lattice", hoarding: "panel" },
    desert:       { marshal: "hut", rail: "armco", fence: "mesh", tyre: "stack", board: "panel", gantry: "box", camera: "lattice", hoarding: "panel" },
    street_night: { marshal: "hut", rail: "armco", fence: "mesh", tyre: "stack", board: "panel", gantry: "box", camera: "lattice", hoarding: "panel" },
    street_day:   { marshal: "hut", rail: "armco", fence: "mesh", tyre: "stack", board: "panel", gantry: "box", camera: "lattice", hoarding: "panel" },
    modern:       { marshal: "hut", rail: "armco", fence: "mesh", tyre: "stack", board: "panel", gantry: "box", camera: "lattice", hoarding: "panel" },
  };

  const STYLES = {
    vegas:     { neon: [NC.mag, NC.gold, NC.red, NC.cyan, NC.violet, NC.pink, NC.orange], bias: 0.62, fh: [18, 50], bh: [44, 78],
                 kinds: ["setback", "tiered", "podium", "slab", "twin", "jenga", "dome", "fin", "ziggurat", "drum"], neonKinds: ["screen", "clad", "antenna"], tone: null,
                 dayPal: [DC.charcoal, DC.graphite, DC.concrete, DC.darkglass, DC.steel, DC.bluglass, DC.gold, DC.bronze, DC.sand] },
    singapore: { neon: [NC.cyan, NC.blue, NC.teal, NC.white, NC.green, NC.violet], bias: 0.42, fh: [20, 52], bh: [48, 88],
                 kinds: ["podium", "setback", "cylinder", "spire", "twin", "slab", "notch", "fin", "drum"], neonKinds: ["clad", "screen", "antenna"], tone: { n: [0.12, 0.13, 0.18], d: [0.44, 0.46, 0.50] },
                 dayPal: [DC.white, DC.bluglass, DC.greyblue, DC.teal, DC.steel, DC.paleblue, DC.darkglass, DC.stone] },
    baku:      { neon: [NC.orange, NC.red, NC.amber, NC.gold, NC.cyan, NC.white], bias: 0.40, fh: [10, 26], bh: [38, 84],
                 kinds: ["setback", "slab", "tiered", "podium", "spire", "cylinder", "dome", "chevron", "arch", "hall"], neonKinds: ["clad", "antenna"], tone: { n: [0.16, 0.14, 0.13], d: [0.62, 0.56, 0.46] },
                 dayPal: [DC.sand, DC.cream, DC.tan, DC.stone, DC.ochre, DC.terra, DC.paleblue] },
    jeddah:    { neon: [NC.gold, NC.teal, NC.green, NC.white, NC.cyan, NC.amber], bias: 0.46, fh: [16, 40], bh: [36, 78],
                 kinds: ["setback", "podium", "slab", "cylinder", "pyramid", "spire", "fin", "antenna", "arch"], neonKinds: ["screen", "clad"], tone: { n: [0.15, 0.14, 0.16], d: [0.50, 0.48, 0.42] },
                 dayPal: [DC.sand, DC.cream, DC.white, DC.ochre, DC.stone, DC.tan, DC.paleblue] },
    monaco:    { neon: [NC.gold, NC.teal, NC.white, NC.rose], bias: 0.12, fh: [9, 17], bh: [14, 28],
                 kinds: ["setback", "slab", "podium", "tiered", "chevron", "dome", "hall"], neonKinds: [], tone: { n: [0.22, 0.19, 0.15], d: [0.88, 0.81, 0.66] },
                 dayPal: [DC.cream, DC.peach, DC.tan, DC.ochre, DC.terra, DC.pink, DC.sand] },
    // IFEMA / Castilian campus: white / glass / steel / stone (not ochre brick canyon)
    madrid:    { neon: [NC.red, NC.gold, NC.white, NC.cyan, NC.violet], bias: 0.28, fh: [14, 38], bh: [30, 70],
                 kinds: ["setback", "slab", "cylinder", "podium", "spire", "dome", "chevron", "arch"], neonKinds: ["clad", "antenna"], tone: { n: [0.16, 0.16, 0.18], d: [0.64, 0.63, 0.66] },
                 dayPal: [DC.white, DC.bluglass, DC.steel, DC.stone, DC.paleblue, DC.concrete, DC.darkglass, DC.cream] },
    // Marsh campus, not megacity wall — lower back-row + neon bias
    shanghai:  { neon: [NC.cyan, NC.blue, NC.white, NC.teal, NC.purple, NC.pink], bias: 0.28, fh: [18, 42], bh: [36, 72],
                 kinds: ["cylinder", "spire", "setback", "podium", "twin", "slab", "fin", "notch", "antenna", "drum"], neonKinds: ["clad", "screen", "antenna"], tone: { n: [0.12, 0.13, 0.18], d: [0.46, 0.48, 0.52] },
                 dayPal: [DC.steel, DC.bluglass, DC.greyblue, DC.slate, DC.darkglass, DC.white, DC.teal, DC.stone] },
    mexico:    { neon: [NC.pink, NC.green, NC.orange, NC.gold, NC.cyan], bias: 0.34, fh: [12, 34], bh: [28, 64],
                 kinds: ["setback", "slab", "podium", "cylinder", "tiered", "chevron", "cross", "ziggurat", "drum"], neonKinds: ["clad", "screen"], tone: { n: [0.16, 0.15, 0.16], d: [0.58, 0.56, 0.53] },
                 dayPal: [DC.terra, DC.ochre, DC.cream, DC.coral, DC.sand, DC.brick, DC.tan] },
    miami:     { neon: [NC.pink, NC.cyan, NC.teal, NC.orange, NC.purple], bias: 0.44, fh: [11, 30], bh: [28, 68],
                 kinds: ["setback", "podium", "slab", "cylinder", "twin", "dome", "chevron", "drum", "hall"], neonKinds: ["clad", "screen"], tone: { n: [0.15, 0.14, 0.18], d: [0.58, 0.60, 0.64] },
                 dayPal: [DC.cream, DC.white, DC.peach, DC.pink, DC.aqua, DC.mint, DC.lemon] },
    catalunya:   { neon: [NC.gold, NC.red, NC.white, NC.orange], bias: 0.14, fh: [8, 18], bh: [14, 30],
                 kinds: ["hall", "slab", "podium", "setback", "chevron", "fin"], neonKinds: [], tone: { n: [0.20, 0.19, 0.17], d: [0.80, 0.78, 0.70] },
                 dayPal: [DC.white, DC.cream, DC.sand, DC.terra, DC.ochre, DC.stone, DC.tan] },
    // Estoril: Atlantic resort town — whitewash and terracotta, low and bright.
    estoril:     { neon: [NC.white, NC.gold, NC.teal, NC.rose], bias: 0.12, fh: [8, 16], bh: [12, 26],
                 kinds: ["setback", "chevron", "hall", "podium", "dome", "tiered"], neonKinds: [], tone: { n: [0.21, 0.20, 0.18], d: [0.86, 0.82, 0.72] },
                 dayPal: [DC.white, DC.cream, DC.peach, DC.terra, DC.sand, DC.paleblue, DC.pink] },
    // Speedway apron: red brick, steel sheds, water towers. Midwest, not modern.
    indianapolis:{ neon: [NC.white, NC.red, NC.gold, NC.blue], bias: 0.10, fh: [7, 15], bh: [11, 24],
                 kinds: ["hall", "slab", "chevron", "drum", "setback", "cross"], neonKinds: [], tone: { n: [0.19, 0.16, 0.15], d: [0.66, 0.52, 0.44] },
                 dayPal: [DC.brick, DC.white, DC.steel, DC.terra, DC.stone, DC.concrete, DC.paleblue] },
    // Rio: saturated render over the Barra flats, nothing corporate anywhere.
    jacarepagua: { neon: [NC.green, NC.gold, NC.cyan, NC.white], bias: 0.16, fh: [8, 20], bh: [14, 34],
                 kinds: ["setback", "slab", "podium", "hall", "chevron", "tiered"], neonKinds: [], tone: { n: [0.18, 0.19, 0.17], d: [0.78, 0.74, 0.64] },
                 dayPal: [DC.cream, DC.white, DC.paleblue, DC.peach, DC.steel, DC.aqua, DC.coral] },
    sochi:       { neon: [NC.white, NC.blue, NC.red, NC.gold, NC.cyan], bias: 0.24, fh: [12, 30], bh: [22, 52],
                 kinds: ["drum", "cross", "slab", "dome", "podium", "arch", "cylinder"], neonKinds: ["clad"], tone: { n: [0.15, 0.16, 0.19], d: [0.70, 0.71, 0.74] },
                 dayPal: [DC.white, DC.paleblue, DC.steel, DC.bluglass, DC.stone, DC.concrete, DC.greyblue] },
  };

  const THEME_DEF = {
    street_night: { neon: [NC.mag, NC.cyan, NC.gold, NC.violet, NC.teal], bias: 0.5, fh: [16, 48], bh: [34, 80], kinds: BLD, neonKinds: ["screen", "clad"], tone: null,
                    dayPal: [DC.stone, DC.greyblue, DC.cream, DC.tan, DC.slate, DC.paleblue, DC.sand] },
    street_day:   { neon: [NC.gold, NC.teal, NC.white, NC.rose], bias: 0.16, fh: [9, 19], bh: [14, 30], kinds: ["setback", "slab", "podium", "tiered"], neonKinds: [], tone: { n: [0.22, 0.19, 0.15], d: [0.82, 0.77, 0.66] },
                    dayPal: [DC.cream, DC.sand, DC.tan, DC.stone, DC.ochre, DC.terra, DC.peach] },
    modern:       { neon: [NC.cyan, NC.blue, NC.white, NC.violet, NC.teal], bias: 0.3, fh: [14, 40], bh: [30, 74], kinds: ["setback", "slab", "cylinder", "podium", "spire", "fin", "antenna", "dome"], neonKinds: ["clad", "antenna"], tone: { n: [0.16, 0.16, 0.18], d: [0.62, 0.62, 0.66] },
                    dayPal: [DC.white, DC.paleblue, DC.greyblue, DC.slate, DC.stone, DC.teal, DC.cream] },
  };

  const ATM = {
    coolNight: {
      zenith: [0.02, 0.03, 0.08], horizon: [0.06, 0.08, 0.14], fog: [0.05, 0.06, 0.10],
      fogDensity: 0.0026, ambientSky: [0.48, 0.54, 0.68], ambientGround: [0.28, 0.28, 0.32],
      sunColor: [0.55, 0.60, 0.72], grass: [0.10, 0.12, 0.11], runoff: [0.22, 0.22, 0.24],
    },
    warmNight: {
      zenith: [0.08, 0.04, 0.10], horizon: [0.22, 0.10, 0.18], fog: [0.14, 0.08, 0.12],
      fogDensity: 0.0024, ambientSky: [0.58, 0.42, 0.52], ambientGround: [0.40, 0.30, 0.28],
      sunColor: [0.85, 0.55, 0.40], grass: [0.14, 0.14, 0.12], runoff: [0.28, 0.24, 0.22],
    },
    dampArdennes: {
      zenith: [0.42, 0.48, 0.52], horizon: [0.58, 0.62, 0.64], fog: [0.55, 0.60, 0.62],
      fogDensity: 0.0032, ambientSky: [0.50, 0.54, 0.58], ambientGround: [0.28, 0.30, 0.26],
      sunColor: [0.88, 0.90, 0.92], grass: [0.14, 0.28, 0.16], runoff: [0.40, 0.38, 0.34],
    },
    britishOvercast: {
      zenith: [0.55, 0.62, 0.72], horizon: [0.72, 0.76, 0.82], fog: [0.68, 0.72, 0.78],
      fogDensity: 0.0020, ambientSky: [0.58, 0.62, 0.70], ambientGround: [0.30, 0.34, 0.28],
      sunColor: [0.92, 0.94, 0.96], grass: [0.16, 0.40, 0.18], runoff: [0.48, 0.46, 0.42],
    },
    dustyBowl: {
      zenith: [0.55, 0.62, 0.78], horizon: [0.78, 0.72, 0.58], fog: [0.72, 0.68, 0.55],
      fogDensity: 0.0022, ambientSky: [0.62, 0.58, 0.50], ambientGround: [0.40, 0.36, 0.28],
      sunColor: [1.0, 0.94, 0.78], grass: [0.42, 0.40, 0.22], runoff: [0.58, 0.50, 0.34],
    },
    alpineGreen: {
      zenith: [0.22, 0.48, 0.82], horizon: [0.55, 0.72, 0.88], fog: [0.58, 0.72, 0.82],
      fogDensity: 0.0016, ambientSky: [0.48, 0.58, 0.72], ambientGround: [0.24, 0.32, 0.22],
      sunColor: [1.0, 0.96, 0.88], grass: [0.12, 0.42, 0.18], runoff: [0.40, 0.42, 0.32],
    },
    rivieraDay: {
      zenith: [0.20, 0.48, 0.88], horizon: [0.70, 0.82, 0.92], fog: [0.72, 0.82, 0.90],
      fogDensity: 0.0014, ambientSky: [0.55, 0.62, 0.78], ambientGround: [0.36, 0.34, 0.28],
      sunColor: [1.0, 0.96, 0.88], grass: [0.22, 0.42, 0.20], runoff: [0.55, 0.52, 0.46],
    },
  };

  const COL = {
    aquaRunoff:  [0.12, 0.72, 0.78],   // Miami Dolphins apron
    basinTeal:   [0.08, 0.55, 0.62],   // Montreal Olympic Basin / river
    desertSand:  [0.72, 0.58, 0.38],   // warm tan runoff sandwich
  };

  const STAND_LIVERIES = {
    // Permanent-circuit steel and concrete
    steel:     { shell: [0.40, 0.41, 0.46], roof: [0.86, 0.88, 0.92], fascia: [0.44, 0.45, 0.50], crowd: [0.72, 0.40, 0.32] },
    darkSteel: { shell: [0.24, 0.26, 0.31], roof: [0.52, 0.55, 0.60], fascia: [0.28, 0.30, 0.35], crowd: [0.68, 0.36, 0.30] },
    concrete:  { shell: [0.58, 0.58, 0.56], roof: [0.78, 0.78, 0.76], fascia: [0.62, 0.62, 0.60], crowd: [0.66, 0.42, 0.34] },
    // Bare aluminium bleachers — uncovered temporary seating
    alu:       { shell: [0.74, 0.75, 0.78], roof: [0.88, 0.89, 0.92], fascia: [0.70, 0.71, 0.74], crowd: [0.62, 0.44, 0.38] },
    scaffold:  { shell: [0.50, 0.52, 0.56], roof: [0.68, 0.70, 0.74], fascia: [0.46, 0.48, 0.52], crowd: [0.60, 0.40, 0.36] },
    // Warm/regional families
    sandstone: { shell: [0.72, 0.64, 0.50], roof: [0.88, 0.84, 0.74], fascia: [0.68, 0.60, 0.47], crowd: [0.70, 0.46, 0.28] },
    terracotta:{ shell: [0.62, 0.40, 0.32], roof: [0.84, 0.78, 0.70], fascia: [0.58, 0.37, 0.30], crowd: [0.74, 0.38, 0.26] },
    pastel:    { shell: [0.80, 0.78, 0.82], roof: [0.92, 0.90, 0.94], fascia: [0.76, 0.74, 0.78], crowd: [0.58, 0.48, 0.62] },
    // Saturated / branded
    crimson:   { shell: [0.52, 0.12, 0.16], roof: [0.86, 0.86, 0.88], fascia: [0.46, 0.11, 0.14], crowd: [0.80, 0.24, 0.20] },
    navy:      { shell: [0.16, 0.22, 0.38], roof: [0.80, 0.83, 0.90], fascia: [0.15, 0.20, 0.34], crowd: [0.36, 0.44, 0.72] },
    teal:      { shell: [0.16, 0.38, 0.40], roof: [0.82, 0.88, 0.88], fascia: [0.15, 0.34, 0.36], crowd: [0.30, 0.62, 0.60] },
    orange:    { shell: [0.68, 0.34, 0.08], roof: [0.90, 0.88, 0.84], fascia: [0.62, 0.31, 0.07], crowd: [0.92, 0.52, 0.10] },
  };

  const STAND_SET_DEF = ["steel", "darkSteel", "concrete"];
  const STAND_SETS = {
    monza:       ["crimson", "concrete", "steel"],          // tifosi red + old park concrete
    imola:       ["crimson", "sandstone", "concrete"],        // Ferrari red over Imola's stone-and-terracotta town
    silverstone: ["navy", "steel", "alu"],                  // Silverstone blue
    spa:         ["darkSteel", "steel", "concrete"],
    suzuka:      ["navy", "orange", "steel"],                 // Honda crown orange; navy no longer clashes with Silverstone
    zandvoort:   ["orange", "alu", "scaffold"],               // Oranje army; two-thirds of capacity is trucked in
    redbull:     ["crimson", "steel", "alu"],
    hungaroring: ["concrete", "sandstone", "steel"],        // poured 1986 terracing; alu reads as steel at distance
    montreal:    ["alu", "steel", "teal"],                    // teal is the park's own colour (COL.basinTeal)
    interlagos:  ["concrete", "sandstone", "terracotta"],     // sun-bleached tropical concrete, not three greys
    mexico:      ["navy", "concrete", "steel"],             // Foro Sol blue buckets
    cota:        ["darkSteel", "sandstone", "alu"],         // T1 bleachers are real bleacher() now
    miami:       ["pastel", "teal", "alu"],
    vegas:       ["darkSteel", "scaffold", "alu"],
    baku:        ["scaffold", "sandstone", "steel"],
    jeddah:      ["scaffold", "sandstone", "darkSteel"],      // temporary tube on Corniche stone
    singapore:   ["scaffold", "teal", "darkSteel"],
    monaco:      ["scaffold", "pastel", "alu"],
    bahrain:     ["sandstone", "steel", "alu"],
    qatar:       ["sandstone", "steel", "concrete"],
    abudhabi:    ["darkSteel", "teal", "sandstone"],
    shanghai:    ["crimson", "alu", "darkSteel"],             // China red against modern steel
    albert_park: ["steel", "pastel", "alu"],                  // temporary park build, pale Melbourne palette
    madrid:      ["crimson", "sandstone", "steel"],         // the file hardcodes these at its own call sites
    hockenheim:    ["concrete", "darkSteel", "crimson"],        // Motodrom concrete bowl, German-GP red accents
    nurburgring:   ["darkSteel", "concrete", "alu"],        // cold Eifel steel and poured concrete
    catalunya:     ["pastel", "concrete", "terracotta"],    // bleached white render, warm Catalan trim
    sepang:        ["alu", "teal", "concrete"],             // aluminium under the fabric canopies
    istanbul:      ["sandstone", "crimson", "darkSteel"],     // pale Thracian stone, Turkish red, modern steel
    paul_ricard:   ["alu", "navy", "pastel"],               // clinical: aluminium against the blue runoff
    portimao:      ["terracotta", "concrete", "alu"],       // Algarve pantile over hillside terracing
    sochi:         ["alu", "teal", "darkSteel"],            // 2014 Olympic-park metal and glass
    mugello:       ["crimson", "terracotta", "concrete"],   // Ferrari red over Tuscan clay
    magny_cours:   ["navy", "alu", "concrete"],             // French blue on a plain 1990s facility
    indianapolis:  ["alu", "scaffold", "navy"],                 // bare bleachers; navy nods to the blue seat bands
    buenos_aires:  ["concrete", "scaffold", "pastel"],      // 1950s mass concrete + temporary tube
    jacarepagua:   ["concrete", "alu", "sandstone"],        // sun-bleached coastal concrete
    estoril:       ["scaffold", "terracotta", "pastel"],    // period tube stands + one masonry terrace
    kyalami:       ["sandstone", "orange", "concrete"],     // bleached masonry, red-oxide iron, raw terracing
    watkins_glen:  ["scaffold", "alu", "concrete"],         // club-built timber/steel, no colour at all
  };

  return { NC, DC, BLD, CROWD_DAY, WINTINTS, HOUSE_WALLS, HOUSE_ROOFS, MOTORHOME_BODY, SIGN_SEG, SIGN_DIGIT, BARRIER, FURN, FURN_DEF, STYLES, THEME_DEF, ATM, COL, STAND_LIVERIES, STAND_SETS, STAND_SET_DEF, KIT, KIT_DEF };
})();
