/* Apex 26 — Helmets: one painted helmet design per driver.

   The helmet used to be the team's own paint — a papaya dome inside a papaya
   car, invisible in every view but the closest (measured 2026-09-08, McLaren
   from above: the only thing that read was a 10 cm accent stripe). A helmet is
   the one part of a racing car that belongs to the PERSON, and at the distances
   this game is played at — the car ahead, the mirror, a replay — it is the only
   way to tell two team-mates apart.

   A design is a BASE colour plus ZONES painted over it in order, each zone a
   region of the dome in helmet coordinates:

     t    latitude, 0 at the crown, 1 at the bottom rim
     az   azimuth in degrees: 0 FRONT, 90 the driver's right, 180 rear, 270 left

   The zone kinds are the vocabulary real helmet painters use — a cap over the
   crown, a band around the shell, a stripe front-to-back, a quartered wedge, a
   chevron opening down the face, a roundel on the temple. Everything is
   evaluated per VERTEX and written into the car mesh's own colour array, so a
   design costs no texture, no draw call and no atlas space: js/car/car3d.js
   hands `painter()` to addDome, which already carries a colour per vertex.

   Designs are keyed by RACE NUMBER, which is what the car build is given
   (opts.num) and what stays stable when a driver changes team. A number with no
   design — a career driver, a custom grid — gets one generated from the number
   itself, so every car on track still has a distinct head. */
const Helmets = (function () {
  "use strict";

  // The palette the designs draw from. Named so a design reads as a sentence.
  const C = {
    white:  [0.93, 0.94, 0.96], bone:   [0.86, 0.84, 0.78], silver: [0.66, 0.69, 0.74],
    black:  [0.07, 0.07, 0.08], carbon: [0.13, 0.14, 0.16], graphite: [0.24, 0.25, 0.28],
    red:    [0.85, 0.09, 0.11], crimson:[0.62, 0.05, 0.10], coral:  [0.95, 0.35, 0.30],
    orange: [0.98, 0.45, 0.05], papaya: [1.00, 0.50, 0.00], amber:  [0.95, 0.65, 0.10],
    yellow: [0.98, 0.84, 0.10], gold:   [0.83, 0.68, 0.22], lime:   [0.78, 0.92, 0.15],
    green:  [0.10, 0.60, 0.25], forest: [0.05, 0.35, 0.20], mint:   [0.35, 0.85, 0.55],
    teal:   [0.00, 0.71, 0.67], cyan:   [0.20, 0.80, 0.88], sky:    [0.45, 0.75, 0.95],
    blue:   [0.10, 0.35, 0.85], navy:   [0.05, 0.10, 0.32], royal:  [0.15, 0.25, 0.70],
    purple: [0.45, 0.20, 0.70], violet: [0.62, 0.35, 0.85], pink:   [0.95, 0.45, 0.72],
  };

  // ── zones ────────────────────────────────────────────────────────────────
  // Each returns true where it paints. `az` wraps, so a stripe at 0 spans the
  // nose and a wedge may cross the front.
  // Shortest angle between two azimuths, 0..180 — the +540 wrap keeps a
  // negative modulus off the result, so a stripe over the nose is the same
  // width whether the vertex reads 359 degrees or 1.
  const dAz = (a, b) => Math.abs(((a - b) % 360 + 540) % 360 - 180);
  const inAz = (az, a0, a1) => {
    const s = ((a0 % 360) + 360) % 360, e = ((a1 % 360) + 360) % 360, p = ((az % 360) + 360) % 360;
    return s <= e ? (p >= s && p <= e) : (p >= s || p <= e);
  };
  const ZONES = {
    // the crown, down to latitude t1
    cap: (z, t) => t <= z.t1,
    // a ring around the shell
    band: (z, t) => t >= z.t0 && t <= z.t1,
    // a stripe from crown to rim, centred on an azimuth. Two of them (0 and
    // 180) make the classic front-to-back centre stripe.
    stripe: (z, t, az) => dAz(az, z.az) <= z.w,
    // an azimuth sector: halves, quarters, a painted temple
    wedge: (z, t, az) => inAz(az, z.az0, z.az1),
    // a V that opens as it runs down the face
    chevron: (z, t, az) => t >= z.t0 && t <= z.t1 &&
      dAz(az, z.az) <= z.w * (0.15 + 0.85 * (t - z.t0) / Math.max(1e-3, z.t1 - z.t0)),
    // a round patch. The azimuth width is divided by sin(latitude) so the patch
    // stays round as it climbs toward the pole, where the slices converge.
    spot: (z, t, az) => {
      const lat = Math.max(0.15, Math.sin(t * Math.PI / 2));
      const x = dAz(az, z.az) / 90 * lat, y = t - z.t;
      return x * x + y * y <= z.r * z.r;
    },
    // a rectangle in (t, az) — a panel on the temple, a block on the jaw. cap,
    // band and stripe are each this with one side let go; having it whole is
    // what lets a design put a mark SOMEWHERE rather than round the whole head.
    patch: (z, t, az) => t >= z.t0 && t <= z.t1 && dAz(az, z.az) <= z.w,
    // A STRIPE THAT SWEEPS AND TAPERS as it runs down the shell. This is the
    // shape modern helmet design is actually built from — a flash that starts
    // narrow at the crown, widens, and rakes back toward the ear — and it is
    // the one thing a band and a stripe together cannot make between them. A
    // chevron is this with sweep 0 and a fixed ratio of widths.
    flash: (z, t, az) => {
      if (t < z.t0 || t > z.t1) return false;
      const f = (t - z.t0) / Math.max(1e-3, z.t1 - z.t0);
      return dAz(az, z.az + z.sweep * f) <= z.w0 + (z.w1 - z.w0) * f;
    },
    // Deterministic speckle: a doodle, a star field, a spatter. Hashed on the
    // cell, so a driver's helmet is mottled the same way in every session and
    // on every machine — a Math.random() here would shimmer between builds.
    // GIVE IT THE MESH'S OWN GRID (n = RINGS, m = SLICES). One cell per vertex
    // is the crispest a per-vertex speckle can be; any other cell size beats
    // against the tessellation and comes out as mush.
    fleck: (z, t, az) => {
      if (t < z.t0 || t > z.t1) return false;
      const r = Math.floor(t * z.n), c = Math.floor((((az % 360) + 360) % 360) / (360 / z.m));
      const h = Math.sin(r * 127.1 + c * 311.7 + z.seed * 74.7) * 43758.5453;
      return h - Math.floor(h) < z.d;
    },
  };

  // ── the grid ─────────────────────────────────────────────────────────────
  // READ OFF THE REFERENCE PHOTOGRAPHS, driver by driver, rather than invented
  // in each driver's colours as these were before. Six zones and a base cannot
  // carry a sponsor board or Norris's doodle, so what each design keeps is what
  // survives to the distance the game is played at: the base, where the shell
  // changes colour, and the one or two marks that tell the pair apart. No
  // lettering and no logos — none of the vocabulary can draw them.
  //
  // MEASURED, then written. tools/car/helmet-trace.mjs projects this shell into
  // a side-on photograph of the real grid and reads the paint off the pixels at
  // every (t, az) of the mesh; `--report` reduces that to each driver's true
  // palette. It corrected six designs I had written from looking: Antonelli
  // wears no tricolore, Alonso no orange, Verstappen's red is at the CROWN with
  // the navy under it rather than the reverse, Sainz runs far more yellow than
  // red, Albon's pale pink is an accent on a white lid rather than the shell,
  // and Norris's fluoro was buried under more black than he actually carries.
  // What the trace CANNOT settle is exact band positions — at 250 pixels a
  // helmet, with the shoot's own shading and shadow, the vertical structure is
  // too noisy to paint from, so those stay hand-set against the photographs.
  //
  // ONE DRIVER IN THREE WEARS HIS OWN CAR. Leclerc's lid is Ferrari red,
  // Hulkenberg's is Audi black, Bottas's is Cadillac black, Verstappen's and
  // Hadjar's are Red Bull navy — and a helmet the colour of the car it sits in
  // is the defect this module exists to fix. Each of those takes the SECOND
  // colour of the real design as its base instead of the first: Leclerc's white
  // lower half under a red crown, Hulkenberg's graphite for black, Verstappen's
  // royal for navy. The design still reads as itself; it just stops
  // disappearing. `near()` below is the check, and every base clears it.
  //
  // t 0 is the crown, 1 the neck rim, and the VISOR OWNS 0.40 TO 0.66 across
  // the front 76 degrees. Paint in that band shows at the temples and the back
  // of the head and is hidden across the face, which is exactly how a real
  // design wraps one — but it means A CHEVRON DOWN THE FACE IS A CHEVRON
  // INSIDE THE APERTURE. Every one of them here ran to 0.66 on the first pass
  // and showed as a sliver of colour at the brow. They stop at 0.44 now, on
  // the band above the aperture where a real painter puts them, and the marks
  // that belong below it are bands at 0.68 and down.
  const z = {
    cap: (t1, c) => ({ k: "cap", t1, c }),
    band: (t0, t1, c) => ({ k: "band", t0, t1, c }),
    stripe: (az, w, c) => ({ k: "stripe", az, w, c }),
    wedge: (az0, az1, c) => ({ k: "wedge", az0, az1, c }),
    chevron: (az, w, t0, t1, c) => ({ k: "chevron", az, w, t0, t1, c }),
    spot: (az, t, r, c) => ({ k: "spot", az, t, r, c }),
    patch: (az, w, t0, t1, c) => ({ k: "patch", az, w, t0, t1, c }),
    flash: (az, w0, w1, t0, t1, sweep, c) => ({ k: "flash", az, w0, w1, t0, t1, sweep, c }),
    fleck: (t0, t1, n, m, d, seed, c) => ({ k: "fleck", t0, t1, n, m, d, seed, c }),
    // A KEYLINE: the thin line of a second colour that runs alongside every
    // real graphic and is most of why one reads as a design rather than as a
    // dipped shell. Two flat blocks meeting is a toy; a keyline between them is
    // a paint job. 0.055 wide, not as thin as one would be drawn — under the
    // ring spacing of the mesh a keyline has no vertex to live on and vanishes
    // from the game while still showing in the preview.
    key: (t, c) => ({ k: "band", t0: t, t1: t + 0.055, c }),
    // The pair on both temples — most side graphics are mirrored, and writing
    // them out twice is how one of them ends up 4 degrees off.
    sides: (f) => [f(90), f(270)],
  };
  // A centre stripe is the pair: over the nose and over the tail.
  const centre = (w, c) => [z.stripe(0, w, c), z.stripe(180, w, c)];

  const DESIGNS = {
    // Mercedes: a sky-blue crown over a navy lower two-thirds, white flashes
    // raked back off the temples, the join picked out in white.
    63: { name: "RUS", base: C.sky, alt: C.white, visor: C.black, zones: [
      z.band(0.56, 0.955, C.navy), z.key(0.505, C.white), z.patch(180, 34, 0.16, 0.40, C.navy),
      ...z.sides((a) => z.flash(a, 8, 20, 0.10, 0.55, 24, C.white)), ...centre(9, C.white), z.key(0.90, C.sky)] },
    // Mercedes: navy under a white crown, the tricolore run down the brow, an
    // orange skirt at the rim.
    12: { name: "ANT", base: C.royal, alt: C.sky, visor: C.silver, zones: [
      z.cap(0.20, C.white), z.key(0.20, C.carbon), z.flash(0, 10, 46, 0.14, 0.44, 0, C.orange),
      z.flash(0, 5, 24, 0.14, 0.44, 0, C.white), ...z.sides((a) => z.patch(a, 22, 0.26, 0.40, C.white)),
      z.band(0.70, 0.80, C.white), z.key(0.80, C.carbon), z.band(0.88, 0.955, C.orange)] },
    // Ferrari: red to the brow, white below it, black under the aperture. The
    // base is the WHITE half so the lid separates from the car (see near()).
    16: { name: "LEC", base: C.white, alt: C.navy, visor: C.black, zones: [
      z.cap(0.42, C.red), z.key(0.420, C.black), ...z.sides((a) => z.flash(a, 6, 16, 0.10, 0.39, 24, C.white)),
      z.band(0.68, 0.76, C.black), z.key(0.76, C.red), ...centre(7, C.black), z.band(0.90, 0.955, C.red)] },
    // Ferrari: the plain yellow lid. Almost all of the design is the absence of
    // one — a black line under the aperture, a white centre, a red skirt.
    44: { name: "HAM", base: C.yellow, alt: C.violet, visor: C.black, zones: [
      ...centre(10, C.white), ...z.sides((a) => z.flash(a, 5, 14, 0.08, 0.42, 24, C.black)),
      z.band(0.68, 0.74, C.black), z.key(0.74, C.white), z.band(0.90, 0.955, C.red)] },
    // McLaren: fluoro lime under a black doodle. The doodle is a fleck — the
    // pattern is too fine to draw and too coarse to leave out.
     1: { name: "NOR", base: C.lime, alt: C.cyan, visor: C.black, zones: [
      z.fleck(0.06, 0.95, 20, 28, 0.30, 3, C.black), z.cap(0.09, C.black),
      ...z.sides((a) => z.patch(a, 13, 0.20, 0.60, C.black)),
      z.key(0.74, C.papaya), z.band(0.86, 0.92, C.black), z.key(0.92, C.papaya)] },
    // McLaren: black shell, papaya crown and face flash, a lime skirt.
    81: { name: "PIA", base: C.carbon, alt: C.teal, visor: C.amber, zones: [
      z.cap(0.13, C.papaya), z.key(0.13, C.lime), z.flash(0, 8, 30, 0.14, 0.42, 0, C.papaya),
      ...z.sides((a) => z.flash(a, 6, 16, 0.16, 0.58, 24, C.papaya)),
      z.band(0.78, 0.88, C.lime), z.key(0.745, C.papaya), z.band(0.90, 0.955, C.papaya)] },
    // Red Bull: navy crown, red face flash, white band. Royal rather than navy
    // as the base, or it vanishes into a Red Bull.
    33: { name: "VER", base: C.royal, alt: C.orange, visor: C.black, zones: [
      z.cap(0.22, C.red), z.key(0.22, C.white), z.flash(0, 12, 46, 0.16, 0.44, 0, C.navy),
      ...z.sides((a) => z.flash(a, 9, 24, 0.18, 0.62, 24, C.navy)),
      z.band(0.68, 0.80, C.white), z.key(0.625, C.navy), z.band(0.88, 0.955, C.navy)] },
    // Red Bull: fluoro lime with a navy crown and an orange flash.
     6: { name: "HAD", base: C.white, alt: C.royal, visor: C.black, zones: [
      z.cap(0.42, C.carbon), z.key(0.42, C.lime), z.flash(0, 10, 34, 0.16, 0.40, 0, C.lime),
      ...z.sides((a) => z.flash(a, 8, 20, 0.16, 0.40, 24, C.lime)),
      z.band(0.66, 0.86, C.carbon), z.key(0.605, C.lime), z.band(0.88, 0.955, C.navy)] },
    // Alpine: pale blue mottle over a navy lower half, pink at the rim.
    10: { name: "GAS", base: C.sky, alt: C.white, visor: C.silver, zones: [
      z.fleck(0.04, 0.58, 20, 28, 0.24, 7, C.white), z.band(0.60, 0.90, C.navy), z.key(0.545, C.white),
      ...z.sides((a) => z.flash(a, 7, 18, 0.14, 0.57, 24, C.white)), ...centre(8, C.white),
      z.band(0.90, 0.955, C.pink)] },
    // Alpine: Argentine white and sky blue, pink down the centre.
    43: { name: "COL", base: C.white, alt: C.crimson, visor: C.black, zones: [
      z.band(0.24, 0.40, C.sky), z.key(0.185, C.navy), z.key(0.40, C.navy),
      ...z.sides((a) => z.flash(a, 6, 16, 0.12, 0.39, 24, C.pink)), ...centre(10, C.pink),
      z.band(0.68, 0.82, C.navy), z.key(0.82, C.sky), z.band(0.90, 0.955, C.navy)] },
    // Racing Bulls: pink over white, navy skirt.
    40: { name: "LAW", base: C.pink, alt: C.forest, visor: C.silver, zones: [
      z.cap(0.16, C.white), z.key(0.16, C.navy), ...z.sides((a) => z.flash(a, 8, 22, 0.16, 0.60, 24, C.white)),
      z.band(0.66, 0.88, C.white), z.key(0.605, C.navy), ...centre(7, C.navy), z.band(0.88, 0.955, C.navy)] },
    // Racing Bulls: sky blue, navy crown, a red centre.
    41: { name: "LIN", base: C.sky, alt: C.crimson, visor: C.black, zones: [
      z.cap(0.24, C.navy), z.key(0.24, C.red), ...z.sides((a) => z.flash(a, 7, 20, 0.16, 0.58, 24, C.navy)),
      ...centre(9, C.red), z.band(0.70, 0.84, C.white), z.key(0.84, C.navy), z.band(0.90, 0.955, C.navy)] },
    // Haas: red with a carbon crown and skirt, white down the centre.
    31: { name: "OCO", base: C.red, alt: C.white, visor: C.black, zones: [
      z.cap(0.16, C.carbon), z.key(0.16, C.white), ...z.sides((a) => z.flash(a, 8, 22, 0.18, 0.62, 24, C.carbon)),
      ...centre(10, C.white), z.band(0.72, 0.88, C.carbon), z.key(0.665, C.white), z.band(0.90, 0.955, C.white)] },
    // Haas: navy-blue with fluoro lime through the face and the jaw.
    87: { name: "BEA", base: C.royal, alt: C.coral, visor: C.black, zones: [
      z.cap(0.16, C.carbon), z.key(0.16, C.lime), z.flash(0, 9, 32, 0.12, 0.42, 0, C.lime),
      ...z.sides((a) => z.flash(a, 7, 16, 0.16, 0.58, 24, C.lime)),
      z.band(0.66, 0.86, C.white), z.key(0.605, C.carbon), z.band(0.88, 0.955, C.carbon)] },
    // Williams: navy with the Spanish red-and-yellow doubled down the face and
    // raked back over each temple.
    55: { name: "SAI", base: C.navy, alt: C.mint, visor: C.black, zones: [
      z.flash(0, 9, 30, 0.14, 0.42, 0, C.yellow), z.flash(0, 4, 13, 0.14, 0.42, 0, C.red),
      ...z.sides((a) => z.flash(a, 7, 16, 0.16, 0.60, 24, C.yellow)),
      z.band(0.66, 0.86, C.white), z.key(0.605, C.royal), z.band(0.88, 0.955, C.navy)] },
    // Williams: pale pink under a white crown, royal-blue graphics, navy jaw.
    23: { name: "ALB", base: C.white, alt: C.forest, visor: C.gold, zones: [
      z.cap(0.22, C.pink), z.key(0.22, C.navy), z.flash(0, 10, 38, 0.14, 0.44, 0, C.royal),
      ...z.sides((a) => z.flash(a, 8, 20, 0.16, 0.60, 24, C.pink)),
      z.band(0.72, 0.86, C.navy), z.key(0.665, C.pink), z.band(0.90, 0.955, C.white)] },
    // Audi: black with green graphics and a scatter of white stars. Graphite
    // rather than black, or it is an Audi-coloured lid in an Audi.
    27: { name: "HUL", base: C.graphite, alt: C.white, visor: C.black, zones: [
      z.cap(0.10, C.black), z.flash(0, 10, 34, 0.12, 0.44, 0, C.green),
      ...z.sides((a) => z.flash(a, 7, 18, 0.16, 0.60, 24, C.green)),
      z.fleck(0.10, 0.62, 20, 28, 0.07, 11, C.white), z.band(0.84, 0.955, C.green), z.key(0.785, C.white)] },
    // Audi: white with a Brazilian green crown and yellow keyline, navy jaw.
     5: { name: "BOR", base: C.white, alt: C.crimson, visor: C.black, zones: [
      z.cap(0.17, C.green), z.key(0.17, C.yellow),
      ...z.sides((a) => z.flash(a, 8, 20, 0.16, 0.60, 24, C.carbon)),
      z.band(0.68, 0.86, C.carbon), z.key(0.625, C.yellow), z.band(0.88, 0.955, C.green)] },
    // Aston Martin: cyan with a yellow brow band and an orange skirt.
    14: { name: "ALO", base: C.cyan, alt: C.crimson, visor: C.gold, zones: [
      z.cap(0.20, C.navy), z.band(0.24, 0.38, C.yellow), z.key(0.185, C.yellow), z.key(0.38, C.navy),
      ...z.sides((a) => z.flash(a, 8, 20, 0.16, 0.60, 24, C.gold)),
      z.band(0.66, 0.84, C.white), z.key(0.605, C.navy), z.band(0.88, 0.955, C.navy)] },
    // Aston Martin: near-black with the team's green through the centre.
    18: { name: "STR", base: C.carbon, alt: C.coral, visor: C.black, zones: [
      z.cap(0.14, C.forest), z.key(0.14, C.silver), ...centre(11, C.forest),
      ...z.sides((a) => z.flash(a, 7, 18, 0.16, 0.60, 24, C.forest)),
      z.band(0.68, 0.80, C.forest), z.key(0.80, C.silver), z.band(0.90, 0.955, C.silver)] },
    // Cadillac: fluoro lime with a black crown and face, red at the rim.
    11: { name: "PER", base: C.lime, alt: C.royal, visor: C.black, zones: [
      z.cap(0.22, C.black), z.key(0.22, C.white), z.flash(0, 12, 40, 0.18, 0.46, 0, C.black),
      ...z.sides((a) => z.flash(a, 9, 24, 0.18, 0.62, 24, C.black)),
      z.band(0.70, 0.84, C.black), z.key(0.645, C.red), z.band(0.88, 0.955, C.red)] },
    // Cadillac: black with blue through it. Royal as the base, or it is a black
    // lid in a black car.
    77: { name: "BOT", base: C.royal, alt: C.amber, visor: C.silver, zones: [
      z.cap(0.20, C.black), z.key(0.20, C.sky), z.flash(0, 12, 44, 0.14, 0.44, 0, C.black),
      ...z.sides((a) => z.flash(a, 10, 26, 0.16, 0.62, 24, C.black)),
      z.band(0.68, 0.86, C.black), z.key(0.625, C.sky), z.band(0.88, 0.955, C.sky)] },
  };

  // A number nobody on the 2026 grid carries — a career driver, a custom grid,
  // a replay of an old save. Deterministic in the number, so the same driver
  // keeps the same head across sessions, and built from the same vocabulary so
  // it sits beside the hand-designed ones without looking generated.
  const WHEEL = [C.red, C.blue, C.yellow, C.white, C.green, C.violet, C.orange, C.cyan, C.pink, C.lime, C.teal, C.crimson];
  const pick = (n, off) => WHEEL[(((n * 7 + off * 5) % WHEEL.length) + WHEEL.length) % WHEEL.length];
  function generated(num) {
    const n = Math.abs(num | 0);
    const base = pick(n, 0), mark = pick(n + 3, 1), trim = pick(n + 7, 2);
    const zones = [[z.cap(0.24, mark), ...centre(10, trim)],
                   [z.band(0.26, 0.40, mark), z.band(0.72, 0.84, trim)],
                   [z.chevron(0, 40, 0.20, 0.66, mark), z.band(0.70, 0.82, trim)],
                   [z.wedge(200, 340, mark), z.cap(0.18, trim)]][n % 4];
    return { name: "#" + n, base, visor: C.black, zones, generated: true };
  }

  /* The design for a race number. `teamC` is the car's own primary paint. Six
     of the grid wear their team's own colour — a black helmet in a black Audi,
     Ferrari red on Ferrari red — and a helmet that matches the car it sits in
     is the thing this module exists to fix. Each of those designs names an
     `alt` base, CHOSEN rather than computed: an earlier pass multiplied the
     base toward white or black instead, which turned Leclerc salmon and
     Antonelli's tricolore into three greys on grey. */
  const near = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 0.30;
  function designFor(num, teamC) {
    const d = (num != null && DESIGNS[num]) || generated(num == null ? 0 : num);
    if (!teamC || !d.alt || !near(d.base, teamC)) return d;
    return { name: d.name, base: d.alt, visor: d.visor, zones: d.zones, generated: d.generated, shifted: true };
  }

  /* (t, az) -> colour, for one vertex of the shell. Zones paint in order, so a
     later one covers an earlier one exactly as a painter's masks would.
     Returns the base where nothing claims the vertex. */
  function painter(design) {
    const zones = design.zones || [];
    return function (t, az) {
      let c = design.base;
      for (let i = 0; i < zones.length; i++) {
        const zz = zones[i], test = ZONES[zz.k];
        if (test && test(zz, t, az)) c = zz.c;
      }
      return c;
    };
  }

  /* THE VISOR IS PART OF THE PAINTED SHELL, not a box bolted to it. It used to
     be a slab 0.41 m wide across a 0.29 m helmet — wider than the head, buried
     in the shell at its middle and sticking out either side, which is most of
     why the old helmet read as a lump. As a region of the shell it takes the
     aperture's real shape, every design paints around it, and the vertices it
     covers are handed the glass surface so it catches the sky like a visor.

     A letterbox, as on a real lid: much wider than it is tall, sat between the
     brow and the nose, its top edge curving down as it runs to the temples. */
  const TRIM = [0.10, 0.10, 0.11];
  const VISOR_T0 = 0.40, VISOR_T1 = 0.66, VISOR_AZ = 76;   // measured off the front mockup: 40% to 66% down
  /* The aperture, optionally GROWN by a margin. Grown by a hair it gives the
     gasket — the dark rubber surround every real eye port is sealed with, and
     the line that makes the visor read as a hole in the shell instead of a
     patch of paint on it. Free: no zone, no vertex, every design gets one. */
  function visorAt(t, az, grow) {
    const t0 = VISOR_T0 - grow, t1 = VISOR_T1 + grow;
    if (t < t0 || t > t1) return false;
    const f = (t - t0) / (t1 - t0);
    return dAz(az, 0) <= (VISOR_AZ + grow * 110) * Math.min(1, 1.55 * Math.sin(Math.PI * f));
  }
  const isVisorEdge = (t, az) => !visorAt(t, az, 0) && visorAt(t, az, 0.020);
  function isVisor(t, az) {
    if (t < VISOR_T0 || t > VISOR_T1) return false;
    // A LENS, not a rectangle: widest across the eyes, closing toward the brow
    // above and the nose below, which is the shape of the aperture in the
    // reference lid. A rectangular port reads as a stripe painted round the
    // head; this one reads as a hole you can see out of.
    // Full width across the eyes, closing at the brow above and the nose
    // below: a big aperture, but one that stops before the temples. Pushed
    // wider it becomes a band wrapping right round the head (measured at
    // AZ 80 with a 3.2 ramp — the shell read as a helmet wearing a blindfold);
    // pulled narrower it is a letterbox slot, which is what "dorky" looked
    // like. The 1.55 ramp holds full width across the middle half.
    const f = (t - VISOR_T0) / (VISOR_T1 - VISOR_T0);
    return dAz(az, 0) <= VISOR_AZ * Math.min(1, 1.55 * Math.sin(Math.PI * f));
  }

  /* (t, az) -> { c, glass } for one vertex of the shell: the design's paint,
     or the visor. */
  function shell(design) {
    const paint = painter(design);
    const visor = design.visor || C.black;
    return function (t, az) {
      if (isVisor(t, az)) return { c: visor, glass: true };
      if (isVisorEdge(t, az)) return { c: TRIM, glass: false };   // the gasket round the eye port
      if (t >= 0.955) return { c: TRIM, glass: false };   // the dark band round the neck opening
      return { c: paint(t, az), glass: false };
    };
  }

  /* ── the shape ──────────────────────────────────────────────────
     TRACED, not judged by eye. Four rounds of eyeballing a reference photo
     produced four wrong shells, so the numbers below come out of the
     photographs themselves: a grid of twenty side-on team portraits, flooded
     from the white background to a mask, split into blobs, and each helmet's
     front and back reach recorded at sixty-one heights. The eleven silhouettes
     that survived intact (a white crown leaks into a white backdrop and
     truncates the blob — that shows up as a height well under the field's) were
     mirrored to a common facing, scaled by their own height, and reduced to a
     median. W, F and B are that median. What the trace settled —

       THE PROFILE IS SMOOTH. The old table stepped the silhouette: a brow
       standing proud, the aperture recessed under it, a chin bar jutting out
       below. None of that is in the photographs. The outline runs as one clean
       curve from crown to rim, and the face reads entirely from the PAINT —
       the visor aperture — not from bumps in the outline. Those steps are what
       "shape weird" was looking at.

       AND IT IS FATTEST LOW, NOT AT THE BROW. The furthest-forward and
       furthest-back points both sit at about 60% of the height, level with the
       jaw, not up at the eyes. The old table put the maximum reach at 80% and
       92%, which pushed the mass into a chin block.

       NEAR-SYMMETRIC FRONT TO BACK. Measured, the two reaches differ by under
       a centimetre over most of the height — the front leads slightly through
       the brow, the back leads slightly through the temples. The old table had
       the front out 5 cm ahead at the jaw.

       PROPORTION. Median length:height across the eleven is 1.21 — a lid is a
       fifth longer front-to-back than it is tall. The rim is still two thirds
       of the maximum length: it ends at the neck, it does not taper to a point.

     The cross-section between those reaches stays a mild superellipse,
     |x/w|^n + |z/d|^n = 1: an oval from above, squared off just enough to keep
     the sides from bulging. Above 2.4 it went slab-flat and read as a bucket.

     W IS TRACED TOO, off a straight-on front shot, which is the one view that
     shows it. Derived instead from the length it was 8% too wide and widest in
     the wrong place: measured, the shell holds its maximum width over a long
     flat band from 40% to 57% of the height and then falls away, and it is
     0.81 as wide as it is tall. Guessed, it bulged.

     The rim is cut at 97% of the photographed height. Below that the outline
     rounds off to a point in every view — that is the bottom EDGE curving away
     from the camera, not the shell narrowing — and taking it literally closed
     the model to a slit.

     The crown row is the one number NOT taken from the trace. Photographed,
     the topmost row of a silhouette is a few pixels of a curve; sampled
     straight it gives the shell a small flat cap, and the straight line the
     table draws from there to the next row creased the dome into a corner.
     The apex is closed to a point instead and the rows below it follow the
     trace, which is the dome the photographs actually show.

       t   0 at the crown, 1 at the neck rim
       Y   height above the temple line, metres
       W   half width; F reach ahead of centre; B reach behind; N squareness */
  const SHAPE = {
    T: [0.000, 0.012, 0.028, 0.050, 0.080, 0.120, 0.170, 0.230, 0.300, 0.380, 0.460, 0.540, 0.620, 0.700, 0.780, 0.850, 0.910, 0.960, 1.000],
    Y: [0.119, 0.116, 0.112, 0.106, 0.099, 0.089, 0.076, 0.061, 0.043, 0.023, 0.003, -0.017, -0.037, -0.057, -0.078, -0.095, -0.110, -0.123, -0.133],
    W: [0.000, 0.013, 0.031, 0.046, 0.058, 0.070, 0.080, 0.089, 0.097, 0.103, 0.104, 0.104, 0.103, 0.100, 0.096, 0.090, 0.081, 0.067, 0.056],
    F: [0.000, 0.023, 0.037, 0.051, 0.072, 0.090, 0.109, 0.120, 0.126, 0.131, 0.144, 0.152, 0.158, 0.157, 0.151, 0.142, 0.133, 0.121, 0.114],
    B: [0.000, 0.023, 0.038, 0.052, 0.070, 0.075, 0.092, 0.110, 0.127, 0.140, 0.146, 0.149, 0.157, 0.155, 0.148, 0.141, 0.132, 0.123, 0.116],
    N: [2.05, 2.06, 2.08, 2.11, 2.14, 2.17, 2.20, 2.23, 2.25, 2.26, 2.26, 2.25, 2.23, 2.20, 2.16, 2.13, 2.10, 2.07, 2.05],
  };
  /* Reads a profile column at any t. CATMULL-ROM, not linear: a helmet has no
     straight edges, and joining nineteen sampled rows with nineteen straight
     segments puts a visible crease at every one of them. The worst was at the
     crown, where the shell goes from a point to nearly half its width in a
     twentieth of its height — linear, that is a cone with a hard rim round it,
     and it read as a flat cap sat on top of the lid. The spline runs the same
     rows as one continuous curve. Ends are clamped by repeating the end row,
     which holds the flat cut at the neck. */
  function tab(arr, t) {
    const T = SHAPE.T, n = T.length;
    if (t <= T[0]) return arr[0];
    if (t >= T[n - 1]) return arr[n - 1];
    let i = 1;
    while (i < n - 1 && t > T[i]) i++;
    const f = (t - T[i - 1]) / (T[i] - T[i - 1]);
    const p0 = arr[Math.max(0, i - 2)], p1 = arr[i - 1], p2 = arr[i], p3 = arr[Math.min(n - 1, i + 1)];
    const f2 = f * f, f3 = f2 * f;
    return 0.5 * ((2 * p1) + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f2 + (-p0 + 3 * p1 - 3 * p2 + p3) * f3);
  }
  /* A point on the shell. `a` is the azimuth in radians, 0 over the nose,
     growing toward the driver's right — the same frame the designs use. The
     superellipse is solved for the radius along that direction. */
  function pointAt(t, a) {
    const w = Math.max(1e-4, tab(SHAPE.W, t)), n = tab(SHAPE.N, t);
    const dx = Math.sin(a), dz = Math.cos(a);
    const d = Math.max(1e-4, dz >= 0 ? tab(SHAPE.F, t) : tab(SHAPE.B, t));
    const r = 1 / Math.pow(Math.pow(Math.abs(dx / w), n) + Math.pow(Math.abs(dz / d), n), 1 / n);
    return [r * dx, tab(SHAPE.Y, t), r * dz];
  }

  /* THE MESH IS THE CEILING ON THE DESIGN, not the vocabulary. Per-vertex
     colour can only draw what a vertex lands on: at 12 rings the gaps in t
     were 0.09, so a keyline 0.024 wide fell BETWEEN two rings and did not
     exist in the game at all — it showed in the per-pixel preview and nowhere
     else. At 18 slices a 12-degree flash spanned less than one 20-degree slice
     and smeared into its neighbours instead of reading as a stripe.

     20 x 28 puts the gaps at about 0.05 in t and 12.9 degrees in azimuth,
     which is what the keylines and the raked temple flashes below need to
     survive into a frame. 1120 triangles against 432; the ceiling in
     tests/unit/car-wing-foil.test.mjs moves with it and says why.

     Still biased to the crown — a real lid is blunt on top, 45% of its width
     by a twentieth of the way down, so the first ring has to land inside that
     twentieth or the dome tessellates as a flat cap. f^1.25 puts it at 0.024
     and keeps the lower half near enough uniform for the bands. */
  const RINGS = 20, SLICES = 28;
  const ringT = (i) => Math.pow(i / RINGS, 1.25);
  function build(out, cx, cy, cz, design, S) {
    const skin = shell(design);
    const i0 = out.pos.length / 3;
    const clamp1 = (c) => [Math.min(c[0], 1), Math.min(c[1], 1), Math.min(c[2], 1)];
    for (let r = 0; r <= RINGS; r++) {
      const t = ringT(r);
      for (let sl = 0; sl < SLICES; sl++) {
        const a = (sl / SLICES) * Math.PI * 2;
        const p = pointAt(t, a);
        const du = 0.5 / RINGS, da = Math.PI / SLICES;
        const pu = pointAt(Math.min(1, t + du), a), pd = pointAt(Math.max(0, t - du), a);
        const pr = pointAt(t, a + da), pl = pointAt(t, a - da);
        const tu = [pu[0] - pd[0], pu[1] - pd[1], pu[2] - pd[2]];
        const ta = [pr[0] - pl[0], pr[1] - pl[1], pr[2] - pl[2]];
        let nx = ta[1] * tu[2] - ta[2] * tu[1];
        let ny = ta[2] * tu[0] - ta[0] * tu[2];
        let nz = ta[0] * tu[1] - ta[1] * tu[0];
        const m = Math.hypot(nx, ny, nz) || 1;
        nx /= m; ny /= m; nz /= m;
        if (r === 0) { nx = 0; ny = 1; nz = 0; }          // the pole, where both tangents vanish
        const v = skin(t, (a * 180 / Math.PI + 360) % 360);
        const c = clamp1(v.c);
        out.pos.push(cx + p[0], cy + p[1], cz + p[2]);
        out.nrm.push(nx, ny, nz);
        out.col.push(c[0], c[1], c[2]);
        out.mat.push(v.glass ? S.glass : S.paint);
      }
    }
    for (let r = 0; r < RINGS; r++) {
      for (let sl = 0; sl < SLICES; sl++) {
        const s2 = (sl + 1) % SLICES;
        const a = i0 + r * SLICES + sl, b = i0 + r * SLICES + s2;
        const c = i0 + (r + 1) * SLICES + s2, d = i0 + (r + 1) * SLICES + sl;
        out.idx.push(a, b, c, a, c, d);
      }
    }
    return out;
  }

  return { DESIGNS, COLORS: C, designFor, painter, shell, isVisor, generated, ZONES, SHAPE, pointAt, build,
           RINGS, SLICES, ringT };   // the tessellation, so a preview can show what the MESH carries
})();
