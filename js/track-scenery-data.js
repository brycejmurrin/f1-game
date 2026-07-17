/* Apex 26 — static scenery data tables for js/tracks.js buildProps().
   Pure constants (no closure state): per-track street-furniture + barrier
   liveries, crowd/sign/house/motorhome palettes, and the city generator's
   neon/daylight palettes + building-style tables. Hoisted out of buildProps
   so the placement logic and the data can evolve separately. Must load
   BEFORE js/tracks.js (see index.html and tools/verify-track.cjs). */
const TrackSceneryData = (function () {
  "use strict";

  // UNIFIED CITY GENERATOR — every city circuit gets its own character via a
  // per-track STYLE: a distinct neon palette, a building-MODEL mix (regular
  // building silhouettes + a few bright "neon" types), a concrete tone, and a
  // neonBias (how many buildings are neon vs plain). At night EVERY building
  // gets at least a touch of neon; by day they're plain detailed concrete. Two
  // staggered rows give depth; sign blades + retail boxes dress the gaps.
  const NC = {
    mag: [0.95, 0.15, 0.55], cyan: [0.18, 0.85, 0.98], gold: [1.00, 0.78, 0.12],
    violet: [0.62, 0.22, 1.0], blue: [0.22, 0.48, 1.0], orange: [1.00, 0.42, 0.08],
    red: [1.0, 0.16, 0.22], teal: [0.0, 0.92, 0.78], white: [0.86, 0.92, 1.0],
    green: [0.25, 1.0, 0.45], pink: [1.0, 0.30, 0.62], lime: [0.66, 1.0, 0.22],
    ice: [0.55, 0.82, 1.0], yellow: [1.0, 0.92, 0.25], purple: [0.82, 0.30, 0.96],
    rose: [1.0, 0.45, 0.55], amber: [1.00, 0.55, 0.12],
  };

  // Daytime facade colours — real building materials so a city in daylight
  // isn't a wall of grey concrete. Warm stone/terracotta read as masonry
  // (small punched windows via neonTower's `med` path); cool tones read as
  // glass. Per-track `dayPal` arrays below pick a varied mix per circuit.
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

  // Tiered grandstand running along the track: a raked seating wedge (prism on
  // its side reads as a rake), a back shell and a flat roof slab on posts.
  // Uses addBox directly to avoid place()'s per-box onTrack guard, which fires
  // false-positives at hairpins (La Source at Spa, etc.). Single guard uses the
  // crowd inner face — only skips if the seating literally overlaps the tarmac.
  // Varied spectator clothing for a DAY crowd — a realistic mix of neutrals
  // (denim, grey, white, khaki) with pops of team colour so a packed stand
  // reads as thousands of individuals, not a flat painted slab.
  const CROWD_DAY = [
    [0.82, 0.82, 0.84], [0.74, 0.72, 0.68], [0.30, 0.34, 0.52], [0.20, 0.24, 0.34],
    [0.78, 0.20, 0.20], [0.86, 0.52, 0.16], [0.90, 0.82, 0.28], [0.24, 0.48, 0.28],
    [0.20, 0.44, 0.66], [0.66, 0.24, 0.42], [0.52, 0.54, 0.58], [0.90, 0.90, 0.92],
    [0.40, 0.26, 0.18], [0.14, 0.16, 0.20], [0.86, 0.40, 0.46], [0.30, 0.62, 0.60],
  ];

  // Per-building window tint when lit: a spread of warm office light, cool
  // daylight-balanced glass and the occasional saturated accent so a long
  // street wall shimmers with colour instead of one flat hue. HDR-boosted in
  // building(), so these are kept near 1.0 here.
  const WINTINTS = [
    [0.98, 0.86, 0.56], [0.92, 0.82, 0.60],   // warm office
    [0.62, 0.76, 1.00], [0.72, 0.84, 0.98],   // cool glass
    [1.00, 0.70, 0.85], [0.70, 0.95, 0.90],   // soft accents
  ];

  // House: small RESIDENTIAL massing — one box + a gabled/hipped roof + a
  // chimney + a door and two windows. Deliberately much simpler/cheaper than
  // building() and uses a warm render/stone/terracotta palette so villages and
  // farmhouses read as homes, not office towers. (k, side, gap, w, h, d, opts)
  // matches building()'s signature: w = depth away from the road (along `r`),
  // d = frontage width parallel to the road (along `t`).
  const HOUSE_WALLS = [[0.86, 0.80, 0.68], [0.80, 0.62, 0.46], [0.74, 0.72, 0.70], [0.70, 0.50, 0.38]];

  const HOUSE_ROOFS = [[0.42, 0.20, 0.14], [0.32, 0.32, 0.35], [0.36, 0.24, 0.16]];

  // Motorhome / team hospitality unit: a two-tier coach body + a slide-out
  // AWNING CANOPY on posts (the signature paddock look — every real F1 team
  // motorhome has one), a window ribbon, a roof AC unit, and a team-colour
  // accent stripe along the base. Paddock rows on several tracks used to be
  // 3 stacked plain boxes per unit — this is the purpose-built replacement.
  // (k, side, gap, w, h, d, opts): w = depth away from the road (along `r`),
  // d = length along the road (along `t`), matching building()/house().
  const MOTORHOME_BODY = [[0.90, 0.90, 0.92], [0.85, 0.86, 0.90], [0.94, 0.92, 0.86]];

  // Trackside SIGNAGE: corner-number boards, circular speed-limit discs, and
  // diagonal red/white braking-distance boards — the classic FIA trackside
  // kit. No such model existed anywhere in the codebase before this; every
  // real circuit is covered in these and their absence was a genuine gap.
  // 7-segment digit rects in LOCAL unit space [x0,x1,y0,y1] (0..1 square).
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

  // Per-circuit barrier identity — each city gets its own armco livery (two
  // alternating day stripe colours + a tinted night rail) so no two street
  // walls look alike. Themes nod to each locale: Monaco classic red/white,
  // Vegas casino gold/black, Madrid & Mexico national colours, Miami pastel
  // vice, Saudi green at Jeddah, Azerbaijan teal at Baku, etc. `tyre` is the
  // conveyor-belt cap colour for the corner tyre stacks (Miami/Shanghai/Mexico).
  // Each theme cycles THREE stripe colours (locale / national palette) for a
  // richer, more identifiable wall than a two-tone armco. `night` is the
  // tinted dark rail; `tyre` the conveyor cap for corner tyre stacks.
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

  // ── Per-track street / scenery furniture: lamp posts + roadside trees ──
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
    madrid:    { tree: "broad", fol: [0.30, 0.40, 0.18], lamp: "post",  lc: [1.0, 0.90, 0.66] },
    miami:     { tree: "palm",  fol: [0.20, 0.48, 0.22], lamp: "post",  lc: [1.0, 0.78, 0.85] },
    shanghai:  { tree: "broad", fol: [0.24, 0.42, 0.22], lamp: "post",  lc: [0.90, 0.96, 1.0] },
    mexico:    { tree: "broad", fol: [0.32, 0.44, 0.18], lamp: "post",  lc: [1.0, 0.86, 0.55] },
    // Sakhir: sparse desert — cool-white lamps, thin palm line (not oasis green)
    bahrain:   { tree: "palm",  fol: [0.30, 0.40, 0.18], lamp: "arm",   lc: [0.88, 0.94, 1.0], sparse: true },
    qatar:     { tree: "palm",  fol: [0.28, 0.40, 0.18], lamp: "arm",   lc: [0.90, 0.95, 1.0], sparse: true },
    abudhabi:  { tree: "palm",  fol: [0.26, 0.42, 0.20], lamp: "arm",   lc: [1.0, 0.82, 0.50] },
    spa:         { tree: "fir",   fol: [0.14, 0.31, 0.21], lamp: "none" },                 // dark Ardennes spruce, blue-green
    silverstone: { tree: "broad", fol: [0.28, 0.45, 0.22], lamp: "none" },                 // English oak copses, mid-green
    monza:       { tree: "broad", fol: [0.16, 0.34, 0.17], lamp: "none" },                 // deep royal-park canopy
    suzuka:      { tree: "broad", fol: [0.24, 0.46, 0.24], lamp: "none" },                 // mixed Japanese hill forest
    interlagos:  { tree: "palm",  fol: [0.26, 0.48, 0.20], lamp: "none" },                 // warm subtropical
    zandvoort:   { tree: "fir",   fol: [0.40, 0.45, 0.29], lamp: "none", sparse: true },   // coastal dune scrub — thin + pale
    redbull:     { tree: "fir",   fol: [0.17, 0.40, 0.22], lamp: "none" },                 // lush emerald alpine spruce
    imola:       { tree: "broad", fol: [0.24, 0.41, 0.21], lamp: "none" },                 // riverbank poplar/willow/oak
    hungaroring: { tree: "broad", fol: [0.44, 0.44, 0.19], lamp: "none", sparse: true },   // dry straw-olive, dusty bowl
    cota:        { tree: "broad", fol: [0.32, 0.39, 0.18], lamp: "none" },                 // dry Texas live oak
    montreal:    { tree: "fir",   fol: [0.20, 0.42, 0.23], lamp: "none" },                 // lush island maple/conifer
    albert_park: { tree: "broad", fol: [0.28, 0.46, 0.22], lamp: "none" },                 // tidy Melbourne parkland
  };

  const FURN_DEF = {
    green:        { tree: "broad", fol: [0.26, 0.42, 0.20], lamp: "none" },
    desert:       { tree: "palm",  fol: [0.28, 0.40, 0.18], lamp: "arm",   lc: [1.0, 0.80, 0.45] },
    street_night: { tree: "broad", fol: [0.22, 0.40, 0.20], lamp: "arm",   lc: [0.90, 0.95, 1.0] },
    street_day:   { tree: "broad", fol: [0.28, 0.44, 0.22], lamp: "globe", lc: [1.0, 0.90, 0.70] },
    modern:       { tree: "broad", fol: [0.26, 0.42, 0.20], lamp: "post",  lc: [0.95, 0.95, 1.0] },
  };

  // fh / bh = front / back-row height [min, range]. Real-circuit character:
  // Vegas/Singapore tall; Baku = low sandstone Old City + tall flame towers;
  // Monaco = SHORT tan Mediterranean apartment blocks; Jeddah/Madrid/Miami mid.
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
  };

  const THEME_DEF = {
    street_night: { neon: [NC.mag, NC.cyan, NC.gold, NC.violet, NC.teal], bias: 0.5, fh: [16, 48], bh: [34, 80], kinds: BLD, neonKinds: ["screen", "clad"], tone: null,
                    dayPal: [DC.stone, DC.greyblue, DC.cream, DC.tan, DC.slate, DC.paleblue, DC.sand] },
    street_day:   { neon: [NC.gold, NC.teal, NC.white, NC.rose], bias: 0.16, fh: [9, 19], bh: [14, 30], kinds: ["setback", "slab", "podium", "tiered"], neonKinds: [], tone: { n: [0.22, 0.19, 0.15], d: [0.82, 0.77, 0.66] },
                    dayPal: [DC.cream, DC.sand, DC.tan, DC.stone, DC.ochre, DC.terra, DC.peach] },
    modern:       { neon: [NC.cyan, NC.blue, NC.white, NC.violet, NC.teal], bias: 0.3, fh: [14, 40], bh: [30, 74], kinds: ["setback", "slab", "cylinder", "podium", "spire", "fin", "antenna", "dome"], neonKinds: ["clad", "antenna"], tone: { n: [0.16, 0.16, 0.18], d: [0.62, 0.62, 0.66] },
                    dayPal: [DC.white, DC.paleblue, DC.greyblue, DC.slate, DC.stone, DC.teal, DC.cream] },
  };

  // Named atmosphere / colour packs for scenery(api) and track `pal` merges.
  // Tracks may Object.assign into def.pal or read ATM/COL from api / TrackSceneryData.
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

  return { NC, DC, BLD, CROWD_DAY, WINTINTS, HOUSE_WALLS, HOUSE_ROOFS, MOTORHOME_BODY, SIGN_SEG, SIGN_DIGIT, BARRIER, FURN, FURN_DEF, STYLES, THEME_DEF, ATM, COL };
})();
