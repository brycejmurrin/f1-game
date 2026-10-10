/* Apex 26 — procedural 2026 F1 car. Car3D.build(color, color2) -> plain {pos,nrm,col,mat,idx} for gfx.createMesh. Local space: +Z forward, +Y up, origin on the gr… */
"use strict";
const Car3D = (function () {
  const SURFACES = Object.freeze({
    custom: 0, paint: 20, carbon: 21, rubber: 22,
    metal: 23, glass: 24, visor: 32,   // 32 is glass-like but DIELECTRIC, not chrome: glsl-lit.js baseRefl
    emissive: 25, functionalEmissive: 25, panel: 26, mirror: 27, sidewall: 33,   // 33: satin tyre sidewall (glsl-lit.js)
  });
  // A livery FINISH is a surface-id remap on painted vertices, not a material
  // uniform: the shaders classify car surfaces 20-33 and branch per id, so a new
  // finish costs an id in that chain (js/render/glx/shaders/glsl-lit.js and its WGSL/TSL
  // mirrors) and one row here. `carbon` gets id 31 rather than reusing
  // SURFACES.carbon (21): 21 keeps the vertex colour, so pointing the finish at
  // it just rendered flatter TEAM-COLOURED paint. 31 darkens the albedo to bare
  // weave, and leaving 21 alone keeps genuinely carbon PARTS looking as they did.
  // Also the ORDER the garage's finish chips render in: js/garage/setup-sheet.js builds that
  // row as ["gloss", ...Object.keys(FINISH_SURFACE)] rather than keeping its own
  // copy, because the copy drifted — the row grew from three finishes to seven
  // and the spec asserting a count of 3 stayed behind, red and unnoticed for as
  // long as it took to run a 2.5-hour browser group. Gloss is absent by design:
  // it is the default and remaps nothing.
  const FINISH_SURFACE = Object.freeze({
    satin: 26, chrome: 27, matte: 28, carbon: 31, brushed: 29, pearl: 30,
  });
  const DARK   = [0.05, 0.05, 0.05];
  const CARBON = [0.07, 0.07, 0.08];
  const VISOR  = [0.08, 0.08, 0.09];          // tinted visor
  const PANEL  = [0.82, 0.82, 0.86];          // matte sponsor / number plate
  const TYRE   = [0.06, 0.06, 0.07];
  const RIM    = [0.11, 0.11, 0.13];
  const HUB    = [0.28, 0.28, 0.31];
  const INTAKE = [0.03, 0.03, 0.04];          // radiator inlet void
  const HALO   = [0.17, 0.17, 0.19];          // brushed-titanium cockpit-protection hoop
  // Category-neutral chassis datums. Parts may dress and reshape bodywork around
  // these, but the wheel/physics reference points never move.
  const AXLES = Object.freeze({ frontZ: 1.7, rearZ: -1.6, wheelY: 0.34 });
  const CHASSIS = Object.freeze({
    floor: Object.freeze({ cx: 0, cy: 0.07, cz: -0.3, sx: 1.5, sy: 0.085, sz: 3.2 }),
    nose: Object.freeze([
      // NOSE TIP. It was z 3.18 — 460 mm AHEAD of the front wing's main-plane
      // leading edge (frontCascade's first element leads at z 2.72) and 400 mm
      // ahead of the endplate (z 2.66), so the car's frontmost bodywork was a
      // pencil of nose hanging in clear air with nothing under it. No F1 car
      // has ever been shaped that way: the front wing leads, and the nose tip
      // lands ON the cascade, roughly over the first flap (LE z 2.50). It also
      // made the car 5.87 m long against a 3.30 m wheelbase (AXLES 1.7/−1.6);
      // the 2026 regulations cap the wheelbase at 3400 mm and the cars that
      // result are ~5.4 m overall. 2.60 puts the tip 120 mm behind the wing LE
      // and takes the car to 2.72 → −2.69 = 5.41 m. TEAM_STYLE.noseTipZ still
      // swings ±0.10 around it, so the longest nose on the grid (williams,
      // +0.10 → 2.70) still sits behind the wing it should sit behind.
      Object.freeze({ z: 2.60, y: 0.245, w: 0.115, h: 0.072, t: 0.68 }),
      Object.freeze({ z: 2.00, y: 0.315, w: 0.36, h: 0.235, t: 0.86 }),
      Object.freeze({ z: 1.05, y: 0.350, w: 0.48, h: 0.36, t: 0.82 }),
    ]),
    monocoque: Object.freeze([
      Object.freeze({ z: 1.05, y: 0.355, w: 0.48, h: 0.38, t: 0.80 }),
      Object.freeze({ z: 0.05, y: 0.395, w: 0.60, h: 0.48, t: 0.72 }),
    ]),
    cockpit: Object.freeze([
      Object.freeze({ z: 0.05, y: 0.415, w: 0.58, h: 0.44, t: 0.68 }),
      Object.freeze({ z: -0.55, y: 0.435, w: 0.50, h: 0.48, t: 0.50 }),
    ]),
  });

  const DEFAULT_WING = Object.freeze({ flaps: 3, arch: 0.70, twist: 0.22, teCurve: 0.10, chordTaper: 0.32, foot: 1.15, canard: 1, tipRise: 0.028 });
  const W = (o) => Object.freeze(Object.assign({}, DEFAULT_WING, o));
  const DEFAULT_STYLE = Object.freeze({ noseTipZ: 0, noseSlim: 1, noseDroop: 0,
    airbox: 1, fin: 0, mirror: 0, inlet: 0, wingStyle: DEFAULT_WING,
    inletH: 0, inletW: 0, undercutD: 0, waist: 0, floorStep: 0, coverCrown: 0 });
  // Chassis relief on the STOCK garage recipe. inletH/inletW/undercutD/waist/
  // floorStep/coverCrown are metres (or metre-scale offsets) so a 4 cm pair
  // gap is a real silhouette change, not a paint swap. Showcase: Mercedes
  // narrow + deep undercut, Red Bull tall inlet, McLaren wide low mouth,
  // Haas slab. Every constructor gets a distinct combo; My Team stays 0.
  // wingStyle is the 2026 front-wing cascade recipe (#1026); both live on TEAM_STYLE.
  const TEAM_STYLE = Object.freeze({
    mercedes:    Object.freeze({ noseTipZ:  0.08, noseSlim: 0.84, noseDroop: -0.028,  airbox: 1.00, fin: 0, mirror: 1, inlet: -0.022, inletH:  0.000, inletW: -0.055, undercutD:  0.045, waist: -0.040, floorStep:  0.020, coverCrown:  0.010, wingStyle: W({ arch: 0.48, twist: 0.16, teCurve: 0.070, chordTaper: 0.24, foot: 1.00, tipRise: 0.018 }) }),
    ferrari:     Object.freeze({ noseTipZ:  0,    noseSlim: 1.04, noseDroop: -0.024,  airbox: 0.82, fin: 0, mirror: 0, inlet:  0.018, inletH:  0.020, inletW:  0.015, undercutD:  0.010, waist: -0.015, floorStep: -0.010, coverCrown:  0.025, wingStyle: W({ arch: 0.88, twist: 0.26, teCurve: 0.12, chordTaper: 0.34, foot: 1.22, tipRise: 0.036 }) }),
    mclaren:     Object.freeze({ noseTipZ: -0.06, noseSlim: 0.92, noseDroop:  0.040,  airbox: 1.00, fin: 0, mirror: 2, inlet: -0.028, inletH: -0.035, inletW:  0.055, undercutD:  0.015, waist:  0.010, floorStep: -0.020, coverCrown:  0.050, wingStyle: W({ arch: 0.64, twist: 0.28, teCurve: 0.13, chordTaper: 0.36, canard: 2, tipRise: 0.032 }) }),
    redbull:     Object.freeze({ noseTipZ:  0.06, noseSlim: 0.88, noseDroop: -0.012,  airbox: 0.92, fin: 0, mirror: 0, inlet:  0,     inletH:  0.050, inletW: -0.015, undercutD:  0.025, waist: -0.050, floorStep:  0.015, coverCrown:  0.035, wingStyle: W({ flaps: 2, arch: 0.52, twist: 0.17, teCurve: 0.075, foot: 1.05, tipRise: 0.020 }) }),
    alpine:      Object.freeze({ noseTipZ:  0,    noseSlim: 1.10, noseDroop:  0,      airbox: 1.00, fin: 1, mirror: 1, inlet:  0.014, inletH:  0.015, inletW:  0.025, undercutD: -0.015, waist:  0.020, floorStep:  0.005, coverCrown: -0.010, wingStyle: W({ arch: 0.92, twist: 0.25, teCurve: 0.11, foot: 1.24, canard: 2, tipRise: 0.034 }) }),
    racingbulls: Object.freeze({ noseTipZ:  0.04, noseSlim: 0.95, noseDroop:  0,      airbox: 1.10, fin: 0, mirror: 0, inlet: -0.024, inletH:  0.030, inletW: -0.035, undercutD:  0.020, waist: -0.025, floorStep: -0.015, coverCrown:  0.015, wingStyle: W({ flaps: 2, arch: 0.50, twist: 0.18, teCurve: 0.080, tipRise: 0.022 }) }),
    haas:        Object.freeze({ noseTipZ: -0.04, noseSlim: 1.10, noseDroop: -0.012,  airbox: 1.04, fin: 0, mirror: 0, inlet:  0.028, inletH:  0.005, inletW:  0.030, undercutD: -0.040, waist:  0.045, floorStep:  0.030, coverCrown:  0.000, wingStyle: W({ flaps: 2, arch: 0.42, twist: 0.14, teCurve: 0.058, chordTaper: 0.22, foot: 0.95, canard: 1, tipRise: 0.016 }) }),
    williams:    Object.freeze({ noseTipZ: -0.10, noseSlim: 1.16, noseDroop: -0.022,  airbox: 0.96, fin: 1, mirror: 1, inlet:  0.012, inletH: -0.020, inletW:  0.040, undercutD: -0.020, waist:  0.030, floorStep: -0.025, coverCrown: -0.015, wingStyle: W({ arch: 0.80, twist: 0.22, teCurve: 0.10, foot: 1.26, tipRise: 0.030 }) }),
    audi:        Object.freeze({ noseTipZ: -0.05, noseSlim: 1.08, noseDroop:  0,      airbox: 1.12, fin: 1, mirror: 2, inlet:  0.020, inletH:  0.035, inletW:  0.010, undercutD:  0.005, waist:  0.000, floorStep:  0.010, coverCrown:  0.040, wingStyle: W({ arch: 0.72, twist: 0.23, teCurve: 0.090, canard: 2, tipRise: 0.026 }) }),
    astonmartin: Object.freeze({ noseTipZ:  0.05, noseSlim: 0.96, noseDroop: -0.030,  airbox: 0.96, fin: 0, mirror: 1, inlet: -0.030, inletH: -0.010, inletW: -0.040, undercutD:  0.035, waist: -0.030, floorStep:  0.025, coverCrown:  0.020, wingStyle: W({ arch: 0.50, twist: 0.27, teCurve: 0.115, chordTaper: 0.34, tipRise: 0.030 }) }),
    cadillac:    Object.freeze({ noseTipZ: -0.02, noseSlim: 1.02, noseDroop:  0,      airbox: 1.00, fin: 1, mirror: 2, inlet:  0.010, inletH:  0.010, inletW: -0.020, undercutD: -0.010, waist:  0.015, floorStep: -0.005, coverCrown: -0.020, wingStyle: W({ arch: 0.70, twist: 0.20, teCurve: 0.086, canard: 2, foot: 1.16, tipRise: 0.024 }) }),
  });
  function teamStyleOf(teamId) {
    return (teamId && TEAM_STYLE[teamId]) || DEFAULT_STYLE;
  }

  /* WHO WEARS THE LID, for a team whose number is not a 2026 seat. A legend or a
     MY TEAM driver must never inherit a grid driver's design through a shared
     number (ten legends carry the neutral 1 = Norris), so those teams key the
     helmet on the person: opts.helmetKey, else the legend's code, else the typed
     custom number. A 2026 team returns null and keeps its hand-made design. */
  function helmetKey(opts) {
    if (!opts) return null;
    if (opts.helmetKey != null) return opts.helmetKey;
    const id = opts.teamId;
    if (id === "custom") return "custom#" + opts.num;
    if (typeof Legends === "undefined") return null;
    if (typeof id === "string" && id.indexOf("legend_") === 0) {
      const l = Legends.byId(id.slice(7));
      return l ? l.code : null;
    }
    if (id === "legends") {
      // The player's slot carries only a number: a unique one names the legend.
      const hit = Legends.LIST.filter((l) => (l.num || 1) === (opts.num || 1));
      return hit.length === 1 ? hit[0].code : "LGD#" + (opts.num || 1);
    }
    return null;
  }
  function styledNoseStations(style) {
    const s = style || DEFAULT_STYLE;
    if (s === DEFAULT_STYLE || (!s.noseTipZ && s.noseSlim === 1 && !s.noseDroop)) return CHASSIS.nose;
    const tip = CHASSIS.nose[0], mid = CHASSIS.nose[1];
    return [
      { z: tip.z + s.noseTipZ, y: tip.y + s.noseDroop,
        w: tip.w * s.noseSlim, h: tip.h * s.noseSlim, t: tip.t },
      { z: mid.z, y: mid.y + s.noseDroop * 0.4,
        w: mid.w * (1 + (s.noseSlim - 1) * 0.4), h: mid.h, t: mid.t },
      CHASSIS.nose[2],
    ];
  }

  const geometry = CarGeometry.create({ SURFACES, CARBON, DARK, INTAKE, TYRE, RIM, HUB, HALO, VISOR, PANEL });
  const { addTri, addQuad, addLoft, addBox, addBlock, addSpan, foilThick, FOIL_CAMBER,
    foilAt, addWingFoil, addStationLoft, addTopBevel, addBeveledSpan, addBeamBetween,
    addFairedArm, addWishboneWeb, addTube } = geometry;

  // Smooth a curved skin by averaging coincident face normals, before caps.
  // Stays in Car3D (cockpit tub / stem callers); not part of the shared geometry extract.
  function smoothSkin(out, start) {
    const normals = new Map();
    for (let i = start; i < out.pos.length / 3; i++) {
      const k = out.pos.slice(i * 3, i * 3 + 3).join(","), n = normals.get(k) || [0, 0, 0];
      for (let j = 0; j < 3; j++) n[j] += out.nrm[i * 3 + j];
      normals.set(k, n);
    }
    for (let i = start; i < out.pos.length / 3; i++) {
      const n = normals.get(out.pos.slice(i * 3, i * 3 + 3).join(",")), L = Math.hypot(...n);
      for (let j = 0; j < 3; j++) out.nrm[i * 3 + j] = n[j] / (L || 1);
    }
  }

  // A BODY span: rounded when CarShade is on for this build (js/car/car-shade.js), else trapezoid + crease.
  let _round = false;
  // Engine-cover loft detail: garage / player / near (hi) densifies the cross-
  // section and adds rear COVER_Z rings; field body and silhouette (mid/far)
  // keep the cheap 4-point / COVER_Z table so track LOD budgets do not grow.
  let _coverHi = true;
  function bodySpan(out, a, b, col, bevel) { if (_round) CarShade.loft(out, a, b, col, addTri); else { addSpan(out, a, b, col, col); addTopBevel(out, a, b, bevel, col); } }

  // Halo hoop centreline, matched to the real halo's front view: the top bar
  // reads LEVEL but is gently ROUNDED — a shallow arch that rises RISE toward
  // the centre and blends into the legs through tangent shoulders — never a
  // peak or a dip toward the middle (the two failure modes this replaced).
  // Three sections: a rear leg easing up from each collar (quadratic, zero
  // slope where it meets the crown), and the crown bar swept as a
  // half-ellipse in x-z with the sin-shaped RISE on top.
  const HALO_RISE = 0.012;                   // shallow arch: ~1.2 cm at centre
  function haloHoopPath(rearX, rearY, rearZ, midX, midZ, crownY, apexZ, barSteps = 6) {
    const LEG = 4, BAR = barSteps, pts = [];
    for (let i = 0; i < LEG; i++) {          // left leg: collar -> crown
      const t = i / LEG;
      pts.push([-(rearX + (midX - rearX) * t),
                rearY + (crownY - rearY) * t * (2 - t),
                rearZ + (midZ - rearZ) * t]);
    }
    for (let i = 0; i <= BAR; i++) {         // crown bar: level, gently arched
      const a = Math.PI * (1 - i / BAR);
      pts.push([Math.cos(a) * midX,
                crownY + HALO_RISE * Math.sin(a),
                midZ + (apexZ - midZ) * Math.sin(a)]);
    }
    for (let i = 1; i <= LEG; i++) {         // right leg: crown -> collar
      const t = i / LEG;
      pts.push([midX + (rearX - midX) * t,
                crownY + (rearY - crownY) * t * t,
                midZ + (rearZ - midZ) * t]);
    }
    return pts;
  }

  const { addWheel, buildWheel, buildWheelLayers } = CarWheels.create({
    geometry, SURFACES, TYRE, INTAKE,
  });

  const TYRE_BAND     = { 0: [0.92, 0.92, 0.90], 1: [0.85, 0.10, 0.08], 2: [0.95, 0.15, 0.05] };
  const BRAKE_CALIPER = { 0: null, 1: null, 2: [0.75, 0.08, 0.05] };
  // Side-on endplate height: aero level + rearSweep + fin (tier0 ≤ tyre crown).
  const REAR_TYRE_CROWN = AXLES.wheelY + 0.34, REAR_WING_TOP = 1.00;
  function endplateGeom(aLvl, style) {
    const aN = Math.max(0, Math.min(1, (aLvl || 0) / 4));
    const st = (style && typeof style === "object") ? style : AERO_STYLE_DEF;
    const sweep = Math.max(-0.06, Math.min(0.20, st.rearSweep != null ? st.rearSweep : 0.03));
    const fin = Math.max(0.55, Math.min(1.45, st.fin != null ? st.fin : 1));
    const lift = Math.pow(aN, 0.85), topLift = Math.pow(lift, 1.15);
    const sweepN = Math.max(0, (sweep + 0.02) / 0.14);
    const finN = Math.max(0, (fin - 0.55) / 0.90);
    // Grow UP from a low plank, capped at REAR_WING_TOP = a real wing's ~1.0 m (lvl 1-4 0.79/0.85/0.91/0.95; the #784 rise reached 1.58 m).
    const rise = Math.min(REAR_WING_TOP - (REAR_TYRE_CROWN - 0.02),
      Math.pow(topLift, 0.6) * (0.29 + 0.03 * sweepN + 0.03 * finN));
    const topY = (REAR_TYRE_CROWN - 0.02) + rise, sy = 0.22 + 0.80 * rise;   // bottom = topY - sy stays ≈ 0.44–0.53
    const cy = topY - 0.015 - sy * 0.5;
    const chord = 0.48 + 0.24 * topLift, rearZ = -2.69, frontZ = rearZ + chord;
    const profile = (z, sectionCy, sectionSy) => ({
      z, cy: sectionCy, sy: sectionSy,
      bottom: sectionCy - sectionSy * 0.5,
      top: sectionCy + sectionSy * 0.5,
    });
    return {
      cy, sy, chord,
      front: profile(frontZ, cy - 0.035, sy * 0.76),
      rear: profile(rearZ, cy + 0.015, sy),
    };
  }
  const FW_MOVEABLE = 2;
  const AERO_STYLE_DEF = { frontSweep: 0.04, frontTaper: 0.98, frontRise: 0.04,
                           rearSweep: 0.03, rearTaper: 0.98 };
  function wingOf(style) { return (style && style.wingStyle) || DEFAULT_WING; }
  function wingFoilOf(st, i) {
    const w = (st && st.wingStyle) || st || DEFAULT_WING;
    const k = Math.max(0, Math.min(1, i / 2));
    return { twist: (w.twist || 0) * (0.55 + 0.55 * k),
             teCurve: (w.teCurve || 0) * (0.60 + 0.55 * k),
             chordTaper: (w.chordTaper || 0) * (0.55 + 0.55 * k),
             tipRise: (w.tipRise || 0) * (0.50 + 0.50 * k) };
  }
  function frontCascade(aLvl) {
    const a = aLvl;
    const els = [
      [2.72, 0.048, 2.40, 0.086, 1.00, 0.024],   // main plane (structure, never moves)
      [2.50, 0.092, 2.24, 0.146, 0.98, 0.020],   // flap 1
    ];
    if (a >= 1) els.push([2.34, 0.148, 2.10, 0.212, 0.95, 0.018]);   // flap 2
    if (a >= 3) els.push([2.20, 0.200, 1.98, 0.272, 0.92, 0.016]);   // flap 3
    if (a >= 4) els.push([2.08, 0.256, 1.88, 0.328, 0.88, 0.014]);   // flap 4
    return els;
  }
  // How many of them the mesh still bakes. Never the main plane.
  function frontBakedCount(aLvl) {
    const n = frontCascade(aLvl).length;
    return n - Math.min(FW_MOVEABLE, n - 1);
  }
  // BOTH LINEAGES FOUND THIS INDEPENDENTLY and measured the same widest vertex
  // (±1.045 at the endplate footplate). The deploy side's fix is kept because it
  // is the better-calibrated one: FW_SPAN is set by the WIDEST aero option
  // rather than the default, and it ships tests/unit/car-front-wing-width.test.mjs
  // to hold the invariant across all 31. This side's 0.87-plus-CAR_HALF-clamp is
  // dropped as the wing's span budget; CAR_HALF stays, because it also bounds
  // the endplate kick, the floor edge rails and the diffuser exit, which the
  // span constant alone does not reach.
  // The front tyre's outer face — addWheel(s*0.79, …, width 0.32) below, so
  // 0.79 + 0.16. It is also the car's widest point, 1.90 m across, which is
  // EXACTLY the 2026 maximum: the track is already regulation-correct.
  const FRONT_TYRE_OUTER = 0.79 + 0.32 / 2;
  // A front wing is NARROWER than the car it is bolted to. The rules cap it
  // ~100 mm inboard of the tyre face on each side (1800 mm against a 2000 mm
  // car in 2022-25; ~1700 against 1900 for 2026), and that gap is the whole
  // point of the endplate — the wake is pushed AROUND the outside of the tyre.
  // The widest vertex is the endplate footplate, which grows outboard as
  // `epX + s*(PLATE.footW * 0.23)`: uncapped, every endplate spec clears the
  // 0.95 tyre face (1.016 / 1.045 / 1.089 / 1.067), a 2.09 m wing on a 1.90 m
  // car that reads head-on like a wing bolted to a narrower car.
  // 0.715 is set by the WIDEST option, not the default: sweeping all 31 aero
  // options, `outwash_max` and `reg26_concept` reach span + 0.240 (the spec-3
  // endplate's outboard kick plus its curled outwash lip, which is more than
  // the footplate adds). At 0.715 that lands at 0.945, just inboard of the
  // 0.950 tyre face; the default endplate lands at 0.840, a 1.68 m wing on a
  // 1.90 m car against the regulation 1700/1900. The invariant — no aero
  // option puts the wing outboard of the tyre — is held by
  // tests/unit/car-front-wing-width.test.mjs across every option, because
  // calibrating on the default alone lets two specs sit 5 mm proud.
  const FW_SPAN = 0.715;
  function frontHalf(aLvl) {
    return FW_SPAN * (aLvl <= 0 ? 0.74 : (aLvl === 1 ? 0.88 : 1.0));
  }
  // FRONT-WING ENDPLATE profiles, and the ONE function that places the plate.
  // Hoisted out of the builder because the decal mesh has to land on the plate
  // at every aero recipe: the plate's height, its outboard kick and even its
  // thickness move with the level and the `plate` pick, so a decal drawn from
  // literals floats in clear air on three of the four profiles — the same trap
  // numberBoard() exists to close on the rear wing. Mesh and decal both read
  // this.
  const FRONT_PLATE = [
    { hF: 0.16, hR: 0.30, kick: 0.020, footW: 0.09, footZ: 0.46, arch: 0 },
    { hF: 0.22, hR: 0.40, kick: 0.060, footW: 0.13, footZ: 0.54, arch: 0 },
    { hF: 0.30, hR: 0.54, kick: 0.100, footW: 0.19, footZ: 0.62, arch: 1 },
    // 3: outwash spec — tall plate whose TOP EDGE ROLLS OUTBOARD (roll: 1
    // adds the curled lip below), the 2026 field's signature endplate.
    { hF: 0.28, hR: 0.50, kick: 0.120, footW: 0.16, footZ: 0.58, arch: 0, roll: 1 },
  ];
  function frontPlateGeom(aLvl, aero) {
    const lvl = aLvl == null ? 2 : aLvl;
    const pick = aero && aero.plate != null ? aero.plate : 1;
    const P = FRONT_PLATE[Math.max(0, Math.min(3, Math.round(pick)))];
    const half = frontHalf(lvl);
    const w = lvl >= 4 ? 0.060 : (lvl <= 0 ? 0.028 : 0.044);
    const x = half + 0.03;
    const kick = Math.min(P.kick, Math.max(0, CAR_HALF - half - 0.03 - w * 0.5 - 0.006));
    return { P, w, kick,
             front: { z: 2.66, x, y: 0.135, h: P.hF, t: 0.62 },
             rear:  { z: 1.98, x: x + kick, y: 0.245, h: P.hR, t: 0.78 } };
  }
  // FIA overall-width envelope, half. The 2026 regulations cap car width at
  // 1900 mm, which is also exactly where this model already draws the front
  // tyres (x 0.79 + half of the 0.32 tread). NOTHING may sit outside it — and
  // the front-wing endplate cluster did: anchored at fwHalf + 0.03 = 0.95 and
  // then kicked OUTBOARD by up to 0.12 at its rear station, with the footplate
  // pushed a further 0.23 x footW out on top, the built body measured x 1.045.
  // A front wing wider than the car it is bolted to, and wider than the tyre it
  // exists to feed, is the one proportion every reference photo settles. The
  // floor rails and the diffuser answer to it too — both measured outside the
  // envelope at the catalog's widest floor. Re-measured over every team crossed
  // with every single-option recipe, the widest point on the car is now 0.9476.
  const CAR_HALF = 0.95;
  // Extra incidence the CLOSED (Z-mode) pose takes on top of the element's own
  // baked angle. Without it the travel is only the element's natural 12-16 deg,
  // which is accurate but barely reads; with it a downforce wing is visibly
  // steeper AND has real angle to give back when it opens.
  // Per wing, because the two do not do the same job. A 2026 rear wing runs
  // 30-40 deg of flap in its downforce setting and gives essentially all of it
  // back in X-mode — that is where the lap time is. The front wing only trims
  // enough to keep the balance, and is boxed in by the nose above it besides.
  // The front is ZERO, and that is a fix rather than a shrug. A front cascade is
  // designed to nest: each element's trailing edge passes ~12 mm under the
  // leading edge of the one above it. Adding bite rotates every element steeper
  // about a hinge near its nose, which swings that trailing edge UP — straight
  // through its neighbour. Measured at maximum downforce, the shipped 0.20
  // buried flap 2's trailing edge 15 mm inside flap 3. The cascade's own drawn
  // attitude already IS the downforce pose; the front's travel comes from
  // flattening it, not from over-rotating it first.
  // Front travel used to be ZERO bite + a TE-near hinge (0.80). That opens a
  // slot the cascade hides, so the garage silhouette did not change at all
  // between CORNER and STRAIGHT. Mid-chord hinge + a little bite makes the
  // trailing edge drop in X-mode — the cascade reads as two steps, not one
  // plank. Rear bite is the DRS-style slot; a bit more of it so the crown
  // line is obvious from wingRear.
  const Z_BITE = { front: 0.12, rear: 0.55 };
  // Where each element pivots, as a fraction of its own chord: 0 = leading edge,
  // 1 = trailing edge.
  // wingRear looks at the TRAILING edge. A TE-near hinge (0.80) left that edge
  // still, so CORNER vs STRAIGHT read as the same black slab plus a telltale
  // strip. Mid-chord on BOTH wings drops the TE in X-mode (the flap goes
  // flatter) and lifts the LE off the mainplane (the DRS slot). The front
  // stays mid-chord for the same reason — a LE-near hinge hid the cascade
  // under the nose.
  const HINGE = { front: 0.52, rear: 0.45 };
  const OPEN_FRAC = { front: 2.2, rear: 2.6 };
  // Underside of the NOSE where it overhangs the front wing, as (z, y) samples
  // measured off the built body. This is a hard ceiling: at max downforce the
  // baked top flap already passes within ~12 mm of it, so an unconditional bite
  // swings that element straight through the nose. Outside this z band nothing
  // overhangs the wing, hence the Infinity guards.
  // The ceiling the front-wing flap solve clears. Its two numbers were frozen
  // copies of the DEFAULT nose underside, and styledNoseStations() moves the
  // real one per team — the mid station drops by noseDroop * 0.4 — so on
  // astonmartin (-0.030) the surface the wing must clear sat ~14 mm BELOW what
  // this table reported, against ~14 mm of margin at aLvl 4. Threading the team
  // into solveFlapsGeom would put it in that memo's key for a correction
  // smaller than one 0.01 rad step of the search; the WORST droop over every
  // shipped style is one number, can only make the solver back off MORE, and is
  // DERIVED, so it cannot go stale the way the copies did.
  const NOSE_DROOP_FLOOR = (function () {
    const zMid = CHASSIS.nose[1].z, zTip = CHASSIS.nose[0].z;
    let worst = 0;
    for (const k of Object.keys(TEAM_STYLE)) {
      const st = TEAM_STYLE[k], d = st.noseDroop || 0;
      if (d >= 0) continue;                       // a raised nose only adds room
      const tipZ = zTip + (st.noseTipZ || 0);
      for (const z of [2.00, 2.16]) {             // the window NOSE_UNDER covers
        const t = Math.max(0, Math.min(1, (z - zMid) / (tipZ - zMid)));
        worst = Math.min(worst, d * (0.4 + 0.6 * t));
      }
    }
    return worst;                                 // <= 0, metres
  })();
  const NOSE_UNDER = [[1.96, Infinity], [2.00, 0.294 + NOSE_DROOP_FLOOR],
                      [2.10, 0.414 + NOSE_DROOP_FLOOR], [2.16, Infinity]];
  const NOSE_GAP = 0.005;        // m of daylight to keep under it
  function noseUnderAt(z) {
    if (z <= NOSE_UNDER[0][0] || z >= NOSE_UNDER[NOSE_UNDER.length - 1][0]) return Infinity;
    for (let i = 1; i < NOSE_UNDER.length; i++) {
      const [z1, y1] = NOSE_UNDER[i], [z0, y0] = NOSE_UNDER[i - 1];
      if (z <= z1) {
        if (!isFinite(y0) || !isFinite(y1)) return Infinity;
        return y0 + (y1 - y0) * (z - z0) / (z1 - z0);
      }
    }
    return Infinity;
  }
  function elemPoint(e, d, t) {
    const ang = e.natural + d, c = Math.cos(ang), s = Math.sin(ang);
    const u = (t - e.hinge) * e.chord;
    const mid = e.py + u * s - FOIL_CAMBER * e.chord * 4 * t * (1 - t);
    const h = e.thick * 0.5 * foilThick(t);
    return { z: e.pz - u * c, top: mid + h, bot: mid - h };
  }
  function elemRecord(le, te, thick, hinge) {
    const chord = Math.hypot(le[0] - te[0], te[1] - le[1]);
    return {
      chord, thick, hinge,
      natural: Math.atan2(te[1] - le[1], le[0] - te[0]),
      pz: le[0] + (te[0] - le[0]) * hinge,
      py: le[1] + (te[1] - le[1]) * hinge,
    };
  }
  function elemTopAt(e, d, z) {
    const N = 32;
    let prev = elemPoint(e, d, 0);
    for (let k = 1; k <= N; k++) {
      const cur = elemPoint(e, d, k / N);
      if ((z <= prev.z && z >= cur.z) || (z >= prev.z && z <= cur.z)) {
        const f = (z - prev.z) / ((cur.z - prev.z) || 1e-9);
        return prev.top + (cur.top - prev.top) * f;
      }
      prev = cur;
    }
    return null;
  }
  // What the engine cover stacks, in ONE place, because every layer used to
  // carry its own literal and three had drifted into each other: the heat
  // shield's top face reached top+0.017 against a tail decal at top+0.008 (300
  // of its 640 mm inside the plate, on every car — heatShield is 1 on the stock
  // engine), the spine vent's landed on that plane bit-exactly, and on the
  // flank the accent pinstripe was 0.9 mm off the band's plane while the
  // service hatch stood 9 mm PROUD of it. Bodywork sits UNDER the livery, the
  // way a real vinyl runs over the tail panels — and the way to get it there is
  // to SINK the bodywork, not to float the decal: the shield lost 9 mm of stand
  // rather than the crest gaining it, because a logo hovering off the crown
  // reads worse from the side than a flatter heat plate does from anywhere.
  const COVER_STACK = Object.freeze({
    vent: 0.005, shield: 0.008, decal: 0.013,        // crown, from cover.top
    flankTrim: 0.009, flankDecal: 0.014,             // flank, from coverFlankX
  });
  const SLOT_MIN = 0.003;   // m of daylight to keep in a cascade slot
  function hinged(id, wing, zLead, yLead, zTrail, yTrail, planform, prev) {
    const dz = zLead - zTrail, dy = yTrail - yLead;
    const chord = Math.sqrt(dz * dz + dy * dy);
    const natural = Math.atan2(dy, dz);
    const thick = planform ? planform.thick : 0;
    const want = planform && planform.hinge != null ? planform.hinge : HINGE[wing];
    let hinge = want, pz = 0, py = 0, best = -1;
    for (let h = want; h >= 0.14; h -= 0.02) {
      const r = solvePoses(h);
      if (!r) continue;
      const travel = r.bite - r.open;
      if (travel > best + 1e-6) { best = travel; hinge = h; pz = r.pz; py = r.py; }
    }
    if (best < 0) {   // nothing clears anywhere — keep the requested pivot
      pz = zLead + (zTrail - zLead) * want; py = yLead + (yTrail - yLead) * want;
      hinge = want;
    }
    const solved = solvePoses(hinge);
    return Object.assign({
      id, wing,
      z: pz, y: py,              // PIVOT, in car-local metres — what the draw hangs it at
      le: [zLead, yLead], te: [zTrail, yTrail],   // what buildFlapGeom emits
      chord, natural, hinge,
      zAngle: solved ? solved.bite : 0,
      xAngle: solved ? solved.open : -natural,
    }, planform);

    function solvePoses(h) {
      const qz = zLead + (zTrail - zLead) * h, qy = yLead + (yTrail - yLead) * h;
      const self = { chord, thick, hinge: h, natural, pz: qz, py: qy };
      // Two things a front element must not enter: the nose overhang above it,
      // and the element it nests over. Sampled far more finely than the mesh's
      // own stations — the nose underside ramp and the element cross at a point
      // with no reason to coincide with a vertex, and testing only FOIL_T steps
      // straight over it, which is how a 21 mm intersection at maximum
      // downforce passed a check that was "already sampling the section".
      // The neighbour matters at the OPEN end: a cascade is stacked with ~12 mm
      // slots, and rotating one element flat drops its forward half through the
      // trailing edge of the one ahead. It is posed at ITS pose for the same end
      // of the travel, since every element is driven off the one blend.
      const CLEAR_N = 40;
      // Applies to BOTH wings. noseUnderAt() is Infinity everywhere behind the
      // nose, so the rear simply never trips that half of the test — there is no
      // need for the wing to exempt itself, and exempting it was what left the
      // rear stack unchecked.
      const clears = (d, prevDelta) => {
        for (let k = 0; k <= CLEAR_N; k++) {
          const p = elemPoint(self, d, k / CLEAR_N);
          const ceil = noseUnderAt(p.z);
          if (isFinite(ceil) && p.top > ceil - NOSE_GAP) return false;
          if (prev) {
            const below = elemTopAt(prev, prevDelta, p.z);
            if (below != null && p.bot < below + SLOT_MIN) return false;
          }
        }
        return true;
      };
      // Back each end off in small steps until it fits. The closed search runs
      // PAST zero: clamping there quietly asserts that the element's own baked
      // attitude must be safe, which at maximum downforce it is not. Returning
      // null when an end cannot be placed at all is what lets the hinge search
      // above reject this pivot instead of shipping an intersection.
      const relax = (from, dir, prevDelta) => {
        for (let i = 0; i <= 120; i++) {
          const a = from + dir * 0.01 * i;
          if (clears(a, prevDelta)) return a;
        }
        return null;
      };
      const bite = relax(Z_BITE[wing], -1, prev ? prev.zAngle : 0);
      if (bite == null) return null;
      const open = relax(-natural * OPEN_FRAC[wing], +1, prev ? prev.xAngle : 0);
      return { bite, open: open == null ? bite : open, pz: qz, py: qy };
    }
  }
  // SOLVED ONCE PER (level, recipe), NEVER PER FRAME.
  // aeroFlapsGeom is not a table lookup — hinged() SEARCHES for each element's
  // pivot: up to 9 candidate hinges, each solving two end poses, each backing
  // off in up to 121 steps, each step sampling 41 points against the nose
  // underside and the element below. That is per element, and a wing has five
  // to eight of them.
  // drawAeroFlaps (js/game.js) calls this for EVERY CAR, EVERY FRAME, because a
  // rival's wings opening is the point of the feature. At one car — a time
  // trial — the solver is merely expensive. At twenty-two it is the frame, and
  // that is exactly how it presented: time trial fine, a race slow enough that
  // the resolution governor bottomed out and started shedding features, which
  // read as a broken renderer rather than a slow one.
  // Nothing in the result depends on the car or on the blend: the records carry
  // both end poses (zAngle/xAngle) and drawAeroFlaps interpolates between them
  // at draw time. So the whole search is a pure function of (aLvl, recipe), and
  // memoising it is not an optimisation so much as fixing a category error.
  // Bounded by five levels times the handful of aero recipes in the catalog.
  // Callers MUST treat the records as immutable — they are shared now.
  const _flapSpecs = new Map();
  const _flapSig = new WeakMap();
  function flapSig(st0) {
    let sig = _flapSig.get(st0);
    if (sig === undefined) {
      const w = st0.wingStyle || st0;
      sig = [st0.frontSweep, st0.frontTaper, st0.frontRise,
             st0.rearSweep, st0.rearTaper, st0.drs || 0,
             w.twist || 0, w.teCurve || 0, w.chordTaper || 0, w.tipRise || 0]
        .map((v) => +v || 0).join(",");
      _flapSig.set(st0, sig);
    }
    return sig;
  }
  // Per-STYLE-object front cache (style -> Map(level -> records)): a one-entry
  // last-args cache missed on every car change (each car has its own recipe).
  const _flapByStyle = new WeakMap();
  function aeroFlapsGeom(aLvl, style) {
    const st0 = (style && typeof style === "object") ? style : AERO_STYLE_DEF;
    let byLvl = _flapByStyle.get(st0), hit = byLvl && byLvl.get(aLvl); if (hit) return hit;
    const key = aLvl + "|" + flapSig(st0);
    hit = _flapSpecs.get(key);
    if (!hit) {
      hit = solveFlapsGeom(aLvl, st0);
      for (let i = 0; i < hit.length; i++) hit[i].cacheKey = key + "|" + i;
      _flapSpecs.set(key, hit);
    }
    if (!byLvl) _flapByStyle.set(st0, byLvl = new Map());
    byLvl.set(aLvl, hit); return hit;
  }
  function solveFlapsGeom(aLvl, style) {
    // A style must be a RECIPE OBJECT (see aeroStyleOf). Anything else — most
    // dangerously the truthy tier NUMBER getVisualTiers stores under .aero —
    // would have .frontSweep read off it as undefined and clamped into NaN,
    // NaN-ing every vertex downstream. Refuse to let that class of misuse make
    // the wing invisible again.
    const a = aLvl, st = (style && typeof style === "object") ? style : AERO_STYLE_DEF;
    const frontSweep = Math.max(-0.08, Math.min(0.22, st.frontSweep));
    const frontTaper = Math.max(0.72, Math.min(1.08, st.frontTaper));
    const frontRise = Math.max(-0.03, Math.min(0.16, st.frontRise));
    const rearSweep = Math.max(-0.06, Math.min(0.20, st.rearSweep));
    const rearTaper = Math.max(0.72, Math.min(1.08, st.rearTaper));
    const els = frontCascade(a), baked = frontBakedCount(a), fwHalf = frontHalf(a);
    const out = [];
    // Solved in cascade order, each element handed the one it nests over: the
    // neighbour's own solved poses are what bound this one's travel, so the
    // chain has to be built bottom-up. A baked neighbour never moves, hence the
    // zero poses on its record.
    for (let i = baked; i < els.length; i++) {
      const e = els[i], p = els[i - 1];
      const prev = p
        ? Object.assign(elemRecord([p[0], p[1]], [p[2], p[3]], p[5], i - 1 < baked ? 0 : HINGE.front),
                        i - 1 < baked ? { zAngle: 0, xAngle: 0 }
                                      : { zAngle: out[out.length - 1].zAngle,
                                          xAngle: out[out.length - 1].xAngle })
        : null;
      const extra = wingFoilOf(st, i);
      out.push(hinged("front" + i, "front", e[0], e[1], e[2], e[3], {
        half: fwHalf * e[4], thick: e[5], taper: frontTaper,
        sweep: frontSweep * (0.75 + i * 0.10),
        rise: frontRise * (0.65 + i * 0.12) + extra.tipRise,
        attachHalf: fwHalf + 0.03,
        upsweep: i === els.length - 1 && (wingOf(st).flaps || 3) >= 3 ? { fwHalf, e } : null,
        twist: extra.twist, teCurve: extra.teCurve, chordTaper: extra.chordTaper,
      }, prev));
    }
    const ep = endplateGeom(a, st), crownY = ep.rear.top - 0.018;
    const upperTrailY = crownY - ((a >= 4 || (st.drs || 0)) ? 0.075 : 0);
    const rearMain = Object.assign(
      elemRecord([-2.30, upperTrailY - 0.270], [-2.52, upperTrailY - 0.225], 0.024, 0),
      { zAngle: 0, xAngle: 0 });
    let below = rearMain;
    const addRear = (id, le, te, thick, sweepMul) => {
      const el = hinged(id, "rear", le[0], le[1], te[0], te[1], {
        half: id === "rearTop" ? 0.50 : 0.51, thick, taper: rearTaper,
        sweep: rearSweep * sweepMul, attachHalf: 0.50, rise: 0,
      }, below);
      out.push(el);
      below = Object.assign(elemRecord(le, te, thick, el.hinge),
                            { zAngle: el.zAngle, xAngle: el.xAngle });
    };
    if (a >= 2) {
      addRear("rearMid", [-2.34, upperTrailY - 0.170], [-2.56, upperTrailY - 0.115], 0.022, 0.9);
    }
    addRear("rear", [-2.38, upperTrailY - 0.075], [-2.64, upperTrailY], 0.026, 1);
    if (a >= 4 && !(st.drs || 0)) {
      addRear("rearTop", [-2.42, crownY - 0.055], [-2.66, crownY], 0.022, 1.1);
    }
    return out;
  }
  function buildFlapGeom(el, col, finish) {
    const out = { pos: [], nrm: [], col: [], mat: [], idx: [] };
    // The element exactly as the wing build emits it...
    addWingFoil(out, {
      zLead: el.le[0], yLead: el.le[1], zTrail: el.te[0], yTrail: el.te[1],
      half: el.half, thick: el.thick, taper: el.taper,
      sweep: el.sweep, rise: el.rise, attachHalf: el.attachHalf,
      twist: el.twist, teCurve: el.teCurve, chordTaper: el.chordTaper,
    }, col, SURFACES.paint);
    if (el.upsweep) {
      const { fwHalf, e } = el.upsweep;
      for (const sgn of [-1, 1]) {
        addSpan(out, { z: e[2], x: sgn * (fwHalf * e[4] - 0.05), y: e[3], w: 0.16, h: e[5] * 1.5 },
                     { z: e[2] - 0.04, x: sgn * (fwHalf + 0.02), y: e[3] + 0.085, w: 0.09, h: e[5] * 1.6 }, col);
      }
    }
    for (let i = 0; i < out.pos.length; i += 3) {
      out.pos[i + 1] -= el.y;
      out.pos[i + 2] -= el.z;
    }
    // Livery FINISH remap, exactly as build() does for the baked mesh: the flaps
    // are the wing's own paint, so a satin/chrome car must carry the finish here
    // too. A gloss / absent finish leaves the array byte-identical (no remap).
    const finishSurface = FINISH_SURFACE[finish];
    if (finishSurface) {
      for (let i = 0; i < out.mat.length; i++) {
        if (out.mat[i] === SURFACES.paint) out.mat[i] = finishSurface;
      }
    }
    return out;
  }
  function aeroFlapAim(aLvl, wing, style) {
    const els = aeroFlapsGeom(aLvl, style).filter((e) => e.wing === wing);
    let y = 0, z = 0;
    for (const e of els) {
      y += (e.le[1] + e.te[1]) * 0.5;
      z += (e.le[0] + e.te[0]) * 0.5;
    }
    return [0, y / els.length, z / els.length];
  }
  // REGIONS.wing — the rear-wing sponsor band, on the flap's TOP SKIN at its
  // REST attitude, not the recipe's DESIGN CHORD, where no flap is ever drawn:
  // drawAeroFlaps hangs each one at its pivot and rotates it by zAngle
  // (0.34 rad at EVERY level), so a design-chord band floats ~90 mm over a
  // parked car and buries itself ~30 mm with the wing open. A guard against
  // the element's axis-aligned BOUNDING BOX cannot see that: the rotation
  // makes the box tall enough to swallow the error.
  // It cannot FOLLOW the flap — baked into the static decal mesh, flap drawn
  // separately with no atlas UVs of its own — so rest is the pose it is authored
  // for and it lifts off as the wing opens, as the sponsor does on the real
  // element; making it follow means giving buildFlapGeom a UV channel. The
  // TOPMOST rear surface carries it (`rearTop` at max downforce, the baked DRS
  // plane with that package); both would otherwise draw straight over it. Chord
  // fractions clear the leading curl and the trailing edge, HALF is inside the
  // element's own 0.51, the span is cut into addWingFoil's own five segments so
  // the band follows the sweep, `proud` is along the local normal, not +Y.
  const WING_BAND = Object.freeze({ tF: 0.17, tR: 0.83, half: 0.44, proud: 0.005, seg: 5 });
  function wingBandGeom(aLvl, style) {
    const a = aLvl == null ? 2 : aLvl;
    const st = (style && typeof style === "object") ? style : AERO_STYLE_DEF;
    const W = WING_BAND;
    let spec = null, pivot = null, ang = 0, elem = "";
    if (st.drs) {
      // A DRS package BAKES an extra plane over the whole moveable stack (see
      // part("rearWing")). It never rotates, so it is both the surface the camera
      // sees and the one that keeps the band attached at every wing angle.
      const crownY = endplateGeom(a, st).rear.top - 0.018;
      const rearSweep = Math.max(-0.06, Math.min(0.20, st.rearSweep));
      const rearTaper = Math.max(0.72, Math.min(1.08, st.rearTaper));
      spec = { zLead: -2.44, yLead: crownY - 0.050, zTrail: -2.60, yTrail: crownY,
               half: 0.49, thick: 0.016, taper: rearTaper, sweep: rearSweep * 1.15,
               rise: 0, attachHalf: 0.50 };
      elem = "drs";
    } else {
      const flaps = aeroFlapsGeom(a, st);
      let fg = null;
      for (const f of flaps) if (f.wing === "rear") fg = f;   // the TOPMOST one
      if (!fg) return null;
      // Exactly what buildFlapGeom hands addWingFoil, and exactly the pose
      // drawAeroFlaps hangs it at with the wing closed.
      spec = { zLead: fg.le[0], yLead: fg.le[1], zTrail: fg.te[0], yTrail: fg.te[1],
               half: fg.half, thick: fg.thick, taper: fg.taper, sweep: fg.sweep,
               rise: fg.rise, attachHalf: fg.attachHalf };
      pivot = { y: fg.y, z: fg.z };
      ang = fg.zAngle;
      elem = fg.id;
    }
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const pose = (p) => {
      const top = p.y + p.h;
      if (!pivot) return { y: top, z: p.z };
      const dy = top - pivot.y, dz = p.z - pivot.z;
      return { y: dy * ca - dz * sa + pivot.y, z: dy * sa + dz * ca + pivot.z };
    };
    const st8 = [];
    for (let i = 0; i <= W.seg; i++) {
      const x = -W.half + (2 * W.half) * (i / W.seg);
      const f = pose(foilAt(spec, x, W.tF)), r = pose(foilAt(spec, x, W.tR));
      const dz = r.z - f.z, dy = r.y - f.y, len = Math.hypot(dz, dy) || 1e-9;
      const n = [0, -dz / len, dy / len];
      st8.push({ x,
                 front: { y: f.y + n[1] * W.proud, z: f.z + n[2] * W.proud },
                 rear:  { y: r.y + n[1] * W.proud, z: r.z + n[2] * W.proud },
                 nrm: n });
    }
    return { half: W.half, stations: st8, elem };
  }
  // Number board anchored low on the plate; shrinks on the tier-0 plank.
  function numberBoard(aLvl, style) {
    const ep = endplateGeom(aLvl, style), gap = 0.05;
    // Cap with mid front/rear height so the board stays inside the plate
    // (parts-physics boardInside) — on sy 0.22, ep.sy-gap-0.02 alone overshoots.
    const midH = ((ep.front.top - ep.front.bottom) + (ep.rear.top - ep.rear.bottom)) * 0.5;
    const h = Math.min(0.20, Math.max(0.12, Math.min(ep.sy - gap - 0.02, midH - 2 * gap - 0.008)));
    return { cy: ep.cy - ep.sy * 0.5 + gap + h * 0.5, h };
  }
  // The blade OUTLINES a livery may pick (liv.finShape). "standard" is the one
  // frozen shape every car carried; the others keep its base line — the root
  // into the engine cover and the decal maths below are both written against
  // baseLE/baseTE — and move only the top corners. topLE.y === topTE.y in every
  // shape, for the level-crown reason finTop() explains. "none" is a real id
  // with no geometry: build() skips the block and car-mesh skips the decal.
  const FIN_SHAPES = Object.freeze({
    standard: Object.freeze({
      baseLE: [-0.65, 0.7935], topLE: [-1.15, 0.97],
      topTE:  [-1.65, 0.97],   baseTE: [-1.70, 0.6197],
      halfBase: 0.022, halfTop: 0.014,
    }),
    // Raked: the leading edge sweeps back to a short crown — the 2023 RB19 look.
    swept: Object.freeze({
      baseLE: [-0.65, 0.7935], topLE: [-1.38, 0.97],
      topTE:  [-1.66, 0.97],   baseTE: [-1.70, 0.6197],
      halfBase: 0.022, halfTop: 0.012,
    }),
    // A short rear blade: half the chord, rooted where the cover is already low.
    stub: Object.freeze({
      baseLE: [-1.18, 0.7100], topLE: [-1.42, 0.93],
      topTE:  [-1.65, 0.93],   baseTE: [-1.70, 0.6197],
      halfBase: 0.020, halfTop: 0.013,
    }),
    // Ferrari's SF-26 fin: a tall front blade dropping a step to a lower rear
    // section (Motorsport.com, 2026 early tech trends). The outline is the FRONT
    // blade — the panel and badge sit on it — and `step` is the lower block
    // build() adds behind it. baseTE is the standard base line at z -1.45.
    stepped: Object.freeze({
      baseLE: [-0.65, 0.7935], topLE: [-1.15, 0.97],
      topTE:  [-1.43, 0.97],   baseTE: [-1.45, 0.6611],
      halfBase: 0.022, halfTop: 0.014,
      step: Object.freeze({ top: 0.885, baseTE: [-1.70, 0.6197] }),
    }),
  });
  // Detail picks a livery carries that are MESH, not paint, so their id lists
  // live here beside FIN_SHAPE_IDS rather than in LiveryTex.
  // T-cam: the real rule paints car 1's housing black and car 2's yellow — the
  // one on-car cue that says which of a team's two drivers this is
  // (autoevolution, onboard-camera colours). "team" is the accent housing the
  // game shipped; "auto" reads the driver slot off Teams.
  const TCAM_IDS = Object.freeze(["team", "auto", "black", "yellow"]);
  const TCAM_BLACK = Object.freeze([0.05, 0.05, 0.06]);
  const TCAM_YELLOW = Object.freeze([0.96, 0.78, 0.08]);
  function tcamColour(pick, teamId, num, accent) {
    if (pick === "black") return TCAM_BLACK;
    if (pick === "yellow") return TCAM_YELLOW;
    if (pick === "auto") {
      const t = typeof Teams !== "undefined" && Teams.LIST && Teams.LIST.find((x) => x.id === teamId);
      const first = t && t.drivers && t.drivers[0] ? t.drivers[0].num : null;
      return (first != null && num != null && num !== first) ? TCAM_YELLOW : TCAM_BLACK;
    }
    return accent;
  }
  // Engine-cover cooling: "gills" are the rows of slits on the flanks that real
  // teams swap track to track (Autosport 2024 tech gallery); "spine" is one
  // slot along the ridge (AMR24), ahead of the shark-fin root so the two never meet.
  const COVER_VENT_IDS = Object.freeze(["none", "gills", "spine"]);
  // SPINE HEIGHT (liv.spineHeight): how tall the engine-cover crown runs behind
  // the roll hoop. "raised" and "high" lift the crown's TOP line only — the
  // floor of the cover and the sidepods stay put — and taper the lift toward
  // the tail (SPINE_TAIL), so the cover reads as a dorsal hump running back
  // from the hoop (the no-fin 2026 look) rather than a taller box. The lift
  // enters through bodyAnchors, so everything mounted off coverAt(z).top —
  // service panels, vents, the spine slot, the fin root and the spine crest
  // decal in car-mesh — rides up with the skin. The fin's TOP stays where the
  // regulation ceiling puts it (finTop), so a raised spine shortens the blade
  // rather than pushing it up: the real-car trade-off, and it keeps the fin
  // decal exactly where sharkFinPanel/Badge place it. "high" (0.93) sits
  // under the hoop's rear crown (0.938); "dorsal" (0.96) runs level with the
  // hoop itself and is capped under its front crown (0.968), the regulation
  // top of the car — the real 2026 cover, a tall spine with no fin, whose
  // FLANK is where the number and the mark go (liv.spineSide, car-mesh).
  const SPINE_HEIGHT_IDS = Object.freeze(["standard", "raised", "high", "dorsal"]);
  const SPINE_RISE = Object.freeze({ standard: 0, raised: 0.06, high: 0.10, dorsal: 0.13 });
  const SPINE_TAIL = 0.45;   // fraction of the lift that survives at the tail (z -2.0)
  const spineRise = (id) => SPINE_RISE[id] || 0;
  // ENGINE-COVER CROSS-SECTION — one profile for the loft, the flank band and
  // the crest strip in car-mesh, and every detail bolted to the cover. Per
  // side, bottom to crown: the FLANK from (x, bottom) up to the SHOULDER at
  // (0.72x, top - d), then two facets rounding over to a flat crown ±0.32x
  // wide at `top`. d is 18 % of the height, so the shoulders round in
  // proportion at every spine height and the crown reads as a hump rather
  // than a single-trapezoid box ("less squared off"). The shoulder x is the
  // trapezoid's crown x, so the flank plane matches it and coverAt(z).top is
  // the crown centre.
  // Garage/near (`dense`): CarShade.densifyCoverPts samples shoulder→crown as
  // a quarter-ellipse (mid/far keep the four-point polyline). pts[0]/pts[1]
  // stay foot/shoulder so coverFlankX and car-mesh drapes do not move.
  const COVER_SHOULDER = 0.72, COVER_CROWN = 0.32, COVER_DROP = 0.18;
  function coverProfile(c, dense) {
    const h = c.top - c.bottom, d = h * COVER_DROP;
    const ck = Math.max(-0.04, Math.min(0.06, c.k || 0));
    const cr = Math.max(0.20, COVER_CROWN - ck * 2.4);
    const keys = [[c.xb != null ? c.xb : c.x, c.bottom], [c.x * COVER_SHOULDER, c.top - d],
                  [c.x * 0.55, c.top - d * 0.32], [c.x * cr, c.top]];
    const pts = (dense && typeof CarShade !== "undefined" && CarShade.densifyCoverPts)
      ? CarShade.densifyCoverPts(keys) : keys;
    return { x: c.x, bottom: c.bottom, top: c.top, shoulder: keys[1][1], d, pts, keys };
  }
  // x of the flank skin at height y (clamped to the flank) — where a side-
  // mounted detail (panel, louvre, cable, pinstripe) actually touches the car.
  function coverFlankX(c, y) {
    const p = coverProfile(c);
    const v = Math.max(0, Math.min(1, (y - p.bottom) / (p.shoulder - p.bottom)));
    return c.xb != null ? c.xb + (p.pts[1][0] - c.xb) * v : p.x * (1 - (1 - COVER_SHOULDER) * v);
  }
  // y of the cover skin over |x| — the crown, a facet, or the flank top.
  function coverSurfaceY(c, x) {
    const p = coverProfile(c), ax = Math.abs(x);
    for (let i = p.pts.length - 1; i > 0; i--) {
      const [xi, yi] = p.pts[i], [xo, yo] = p.pts[i - 1];   // inner → outer
      if (ax <= xi) return yi;
      if (ax <= xo) return yi + (yo - yi) * (ax - xi) / (xo - xi);
    }
    return p.bottom;
  }
  const FIN_SHAPE_IDS = Object.freeze(Object.keys(FIN_SHAPES).concat(["none"]));
  const FIN = FIN_SHAPES.standard;
  const finOf = (shape) => FIN_SHAPES[shape] || FIN;
  const finMix = (a, b, t) => a + (b - a) * t;
  // `fin` is the aero recipe's blade-height scale, applied about the base line
  // so the fin grows upward and its root stays where the engine cover put it.
  // EVERY reader of the fin outline goes through here, because the livery decal
  // is placed off the same numbers: sharkFinPanel() and sharkFinBadge() bilinear
  // between base and top, so a top that moves without them detaches the graphic
  // from the blade it is painted on.
  // Scaled about the FROZEN base line, not the cover-rooted one, so the mesh and
  // the decal agree on where the top is. The mesh's real root may sit lower
  // (part("sharkFin") drops it into the engine cover); that only grows the blade
  // BELOW the decal, which is why lowering is safe and raising is not.
  // ONE height for both ends, so the crown stays LEVEL. Scaling each end about
  // its own base does not: the trailing base sits 174 mm below the leading one,
  // so at fin 1.44 the trailing top would come out 76 mm ABOVE the leading top
  // and the fin would grow a wedge crown — measured, and it walked the livery
  // decal off the blade. topLE and topTE are equal at stock for exactly this
  // reason; the scale keeps them equal.
  const finTop = (fin, shape) => {
    const F = finOf(shape);
    const f = Math.max(0.55, Math.min(1.45, fin || 1));
    return F.baseLE[1] + (F.topLE[1] - F.baseLE[1]) * f;
  };
  // THE BLADE'S ROOT — one function for the mesh AND the decal. build() used to
  // solve it privately and only ever DOWNWARD, because sharkFinPanel/Badge had
  // no way to be told the base had moved; the cost was the other direction, and
  // every shipped 2026 team sets spineHeight "dorsal" (crown 0.939 against a
  // frozen base of 0.7935 — 113 mm of a 176 mm panel inside the cover).
  // FIN_MIN_BLADE keeps the maths from inverting when a cover tops the
  // regulation fin line (quali_engine + dorsal reaches 1.021 against 0.97).
  const FIN_MIN_BLADE = 0.005;
  function sharkFinRoot(anchors, fin, shape) {
    const F = finOf(shape), tp = finTop(fin, shape);
    const coverTop = (z, y0) => {
      const c = anchors && anchors.coverAt ? anchors.coverAt(z) : null;
      return c && c.top != null ? c.top : y0;
    };
    const cLE = coverTop(F.baseLE[0], F.baseLE[1]), cTE = coverTop(F.baseTE[0], F.baseTE[1]);
    const cap = (y) => Math.min(y, tp - FIN_MIN_BLADE);
    return {
      // The MESH root, buried 10 mm so no daylight shows under the blade…
      bLE: cap(cLE - 0.010), bTE: cap(cTE - 0.010),
      // …and the DECAL base, which is where the blade EMERGES. A fixed fraction
      // of the buried blade put the bottom of the panel back inside the cover on
      // a tall crown; the graphic starts at the skin instead.
      dLE: cap(cLE + 0.001), dTE: cap(cTE + 0.001),
      top: tp,
      // How much blade stands above the crown at the leading edge. car-mesh
      // declines to paint a graphic when there is not enough of it to read.
      clear: tp - cLE,
    };
  }
  // `root` is a sharkFinRoot() result, or absent for the frozen base line —
  // which is what every legacy caller and the garage lightbox still get.
  const finBaseLE = (F, root) => (root ? root.dLE : F.baseLE[1]);
  const finBaseTE = (F, root) => (root ? root.dTE : F.baseTE[1]);
  function finXAt(z, y, proud, fin, shape, root) {
    const F = finOf(shape), tp = finTop(fin, shape);
    const u = (z - F.baseLE[0]) / (F.baseTE[0] - F.baseLE[0]);   // along the base edge
    const yBase = finMix(finBaseLE(F, root), finBaseTE(F, root), Math.max(0, Math.min(1, u)));
    const v = Math.max(0, Math.min(1, (y - yBase) / (tp - yBase)));
    return finMix(F.halfBase, F.halfTop, v) + proud;
  }
  function sharkFinPanel(inset, proud, fin, shape, root) {
    const F = finOf(shape);
    const i = inset != null ? inset : 0.05;
    const p = proud != null ? proud : 0.002;
    const tp = finTop(fin, shape);
    const vBase = Math.max(i, 0.18);
    const at = (u, v) => {
      // bilinear over the outline: u = 0 leading → 1 trailing, v = 0 base → 1 top.
      const bz = finMix(F.baseLE[0], F.baseTE[0], u), by = finMix(finBaseLE(F, root), finBaseTE(F, root), u);
      const tz = finMix(F.topLE[0],  F.topTE[0],  u), ty = tp;
      return { x: finMix(F.halfBase, F.halfTop, v) + p,
               y: finMix(by, ty, v), z: finMix(bz, tz, v) };
    };
    return [at(i, vBase), at(1 - i, vBase), at(1 - i, 1 - i), at(i, 1 - i)];
  }
  // v0/v1 are FRACTIONS of the blade, not absolute heights: at fin 0.55 the top
  // is at y 0.890, and a fixed 0.725..0.955 window would hang the badge off
  // the end of the fin. u0/u1 are fractions of the BASE for the same reason
  // across shapes: the stub's base is half the standard chord, and an
  // absolute z -1.235 would put the badge's front edge off its nose.
  // On the standard shape these fractions reproduce z -1.235 / -1.465 exactly.
  // The WIDTH is not a fraction, though: it is the standard badge's aspect
  // (0.23 m over its 0.153 m height at fin 1) re-applied to each shape's own
  // blade height, centred on the same base fraction. Read as a fraction of the
  // chord, the stub's half-length base squashed the horse to 0.11 m across a
  // 0.14 m tall box — measured on the studio render — and every traced mark
  // would have narrowed with it. Height is taken at fin scale 1 on purpose:
  // the aero recipe's blade height already stretches the standard badge, and
  // that is shipped behaviour on every AI car, so the width must not follow it.
  const FIN_BADGE = Object.freeze({ uMid: 0.7 / 1.05, wStd: 0.23, v0: 0.32, v1: 0.88 });
  const badgeHeight1 = (F) => {
    const yB = finMix(F.baseLE[1], F.baseTE[1], FIN_BADGE.uMid);
    return (F.topLE[1] - yB) * (FIN_BADGE.v1 - FIN_BADGE.v0);
  };
  const BADGE_ASPECT = FIN_BADGE.wStd / badgeHeight1(FIN);
  function sharkFinBadge(proud, fin, shape, root) {
    const F = finOf(shape);
    const p = proud != null ? proud : 0.0022;   // just outside the graphic panel
    const B = FIN_BADGE, tp = finTop(fin, shape);
    const chord = F.baseLE[0] - F.baseTE[0];
    const half = Math.min(0.45, BADGE_ASPECT * badgeHeight1(F) / chord / 2);
    const u0 = B.uMid - half, u1 = B.uMid + half;
    const zAt = (u) => finMix(F.baseLE[0], F.baseTE[0], u);
    const yAt = (u, v) => { const yB = finMix(finBaseLE(F, root), finBaseTE(F, root), u); return yB + (tp - yB) * v; };
    const at = (u, v) => { const z = zAt(u), y = yAt(u, v); return { x: finXAt(z, y, p, fin, shape, root), y, z }; };
    return [at(u0, B.v0), at(u1, B.v0), at(u1, B.v1), at(u0, B.v1)];
  }
  // Where the 2026 amber "stopped / under 20 km/h" lamps sit (The Race, 2026
  // rear-lights explainer): the outboard face of each mirror housing. The same
  // numbers the mirror section of build() uses, so a team style or a wider
  // stalk carries the lamp with it. Cached per (team, scale): game.js asks
  // once per drawn car per frame, and a fresh pair of objects there is garbage
  // in the hot loop.
  const _mirrorAnchorCache = new Map(), _mirrorAnchorLast = new Map();   // last: teamId -> [raw scale, anchors], no key string on a hit
  function mirrorLightAnchors(teamId, mirrorScale) {
    const last = _mirrorAnchorLast.get(teamId); if (last && last[0] === mirrorScale) return last[1];
    const mScale = Math.max(0.85, Math.min(1.35, mirrorScale || 1));
    const k = teamId + "|" + mScale.toFixed(3);
    let a = _mirrorAnchorCache.get(k);
    if (a) { _mirrorAnchorLast.set(teamId, [mirrorScale, a]); return a; }
    const mSty = teamStyleOf(teamId).mirror;
    const mx = (0.34 + (mSty === 1 ? 0.035 : 0)) * mScale;
    const mW = mSty === 1 ? 0.235 : 0.215;
    const y = 0.735 + (mSty === 2 ? -0.032 : 0);
    a = Object.freeze([{ x: -(mx + mW / 2 + 0.004), y, z: 0.26 }, { x: mx + mW / 2 + 0.004, y, z: 0.26 }]);
    _mirrorAnchorCache.set(k, a); _mirrorAnchorLast.set(teamId, [mirrorScale, a]); return a;
  }
  // The COCKPIT build's mirror GLASS faces (the driver-facing side of the
  // face(0.012, mz-0.038) block in build()'s ckpt branch), 1 mm toward the eye:
  // car-draw.js lays a sky-tint fallback there while the HUD mirror pass is not
  // drawing. Per side [a,b,c,d] (inboard-low, outboard-low, outboard-high, inboard-high).
  const _ckMirrorCache = new Map();
  let _ckLastIn = {}, _ckLastQ = null;   // last raw scale -> quads: the per-frame call builds no toFixed key
  function cockpitMirrorGlass(mirrorScale) {
    if (mirrorScale === _ckLastIn) return _ckLastQ;
    const mScale = Math.max(0.85, Math.min(1.35, mirrorScale || 1)), k = mScale.toFixed(3);
    if (_ckMirrorCache.has(k)) { _ckLastIn = mirrorScale; return (_ckLastQ = _ckMirrorCache.get(k)); }
    const mx = 0.60 * mScale, mW = 0.215, mH = 0.075, mY = 0.780, toe = 0.030, ins = 0.012, z = 0.92 - 0.038 - 0.001;
    const y0 = mY - mH / 2 + ins, y1 = mY + mH / 2 - ins, zi = z + toe * ins / mW, zo = z + toe * (1 - ins / mW);
    const q = [-1, 1].map((s) => { const xi = s * (mx - mW / 2 + ins), xo = s * (mx + mW / 2 - ins);
      return [[xi, y0, zi], [xo, y0, zo], [xo, y1, zo], [xi, y1, zi]]; });
    _ckMirrorCache.set(k, q); _ckLastIn = mirrorScale; return (_ckLastQ = q);
  }
  function mergeRecipe(defaults, recipe) {
    return Object.assign(defaults, recipe || {});
  }
  function buildEngineParts(recipe, tier) {
    return mergeRecipe({
      in: tier === 0 ? 0.52 : tier === 2 ? 1.65 : 1,
      snork: tier === 2 ? 1 : 0, twin: tier === 2 ? 1 : 0,
      inlet: tier === 0 ? 0 : tier === 2 ? 2 : 1,
      outlet: tier === 0 ? 0 : tier === 2 ? 2 : 1,
      podWidth: 1, shoulderHeight: 1, undercut: 1,
      coke: 1, tailWidth: 1, coverHeight: 1,
      servicePanel: tier === 2 ? 3 : 1, heatShield: 1,
      chimney: 0,
      // 2026 intake lip. 0 none (shipped) · 1 thin mouth ring · 2 ring + cheeks.
      scoopLip: 0,
    }, recipe);
  }
  function buildAeroParts(recipe, tier) {
    const lvl = tier === 0 ? 0 : tier === 2 ? 4 : 2;
    return mergeRecipe({
      lvl, beam: tier === 2 ? 1 : 0, drs: 0,
      vane: lvl >= 4 ? 3 : lvl >= 3 ? 2 : lvl >= 1 ? 1 : 0,
      plate: 1, casc: null, swan: 0, tvane: null,
      duct: 0, board: 0, slot: 0,
      frontSweep: 0.04, frontTaper: 0.98, frontRise: 0.04,
      rearSweep: 0.03, rearTaper: 0.98,
      floorEdge: 1, floorCut: 0.04, diffuserRise: 1, fin: 1,
    }, recipe);
  }
  function buildSuspensionParts(recipe, tier) {
    return mergeRecipe({
      ride: tier === 0 ? 0.060 : tier === 2 ? -0.048 : 0,
      arm: tier === 0 ? 0.85 : tier === 2 ? 1.3 : 1,
      push: tier === 2 ? 1 : 0, pull: 0,
      wishbone: 1, toe: 1,
      // Visible inboard rocker fairing on the tub top: 0 none / 1 split blister / 2 full cover.
      rocker: 0,
      // Transverse third (heave) element: 0 none / 1 damper + spring pack + links.
      heave: 0,
    }, recipe);
  }
  function buildBrakeParts(recipe, tier) {
    return mergeRecipe({
      cal: BRAKE_CALIPER[tier], duct: tier === 0 ? 0.5 : tier === 2 ? 1.9 : 1,
      rim: null, caliperPos: 0, coverOpen: tier === 2 ? 1 : 0,
      rotor: tier === 2 ? 2 : 1, rotorScale: tier === 2 ? 1.12 : 1,
      // null = derive the duct fairing from `duct` (the shipped behaviour).
      scoop: null,
      // Disc face pattern seen through an open cover: 0 plain / 1 drilled / 2 slotted.
      discFace: 0,
      // Caliper hardware: 0 shipped 3-box peek / 1 Brembo monobloc / 2 six-piston radial.
      caliper: 0,
    }, recipe);
  }
  function buildTyreParts(recipe, tier) {
    // sidewall: raised lettering ring(s) on the tyre face. 0 flush / 1 ring / 2 double.
    return mergeRecipe({ band: TYRE_BAND[tier], shoulder: 0,
      sidewall: 0 }, recipe);
  }
  function buildErsParts(recipe, tier, accent) {
    // coolerIntake: pack cooling mouth on the pod shoulder. 0 none / 1 NACA lip / 2 lip + louvres.
    return mergeRecipe({ led: tier === 2 ? accent : null, pack: 1,
      cells: tier === 2 ? 6 : 3, conduit: 0, blister: 0, coolerIntake: 0 }, recipe);
  }
  function buildGearboxParts(recipe, tier) {
    return mergeRecipe({
      strakes: tier === 2 ? 5 : 0, fin: tier === 2 ? 1 : 0,
      strakeH: 0.13, finSY: 0.14, finSZ: 0.28,
      casing: tier === 2 ? 3 : 0, louvres: 0, heat: 0,
      caseWidth: 1,
      heatFins: 0, ribs: 0,
    }, recipe);
  }
  function buildFuelParts(recipe, tier) {
    return mergeRecipe({
      cap: tier === 2 ? [0.95, 0.28, 1.5] : [0.55, 0.52, 0.60],
      flame: [1.15, 0.42, 0.14],
      line: 1, filler: 0,
      hatch: 0, vent: 0,
      // breather: NACA duct beside the filler. 0 none / 1 duct / 2 duct + standpipe.
      breather: 0,
    }, recipe);
  }
  function buildExhaustParts(recipe) {
    return mergeRecipe({
      pipes: null, bore: 1, flare: 0, wastegate: 0, wrap: 0,
      lip: 0, shield: 0,
    }, recipe);
  }
  function buildFloorParts(recipe) {
    return mergeRecipe({ fences: 5, fenceH: 1, skid: 0, edgeLip: 0,
      plank: 0, gurney: 0, scroll: 0 }, recipe);
  }
  function buildWheelParts(recipe) {
    // deflector: 2026 over-wheel deflector above each FRONT wheel. 0 none / 1 plane / 2 biplane + endplate.
    return mergeRecipe({ spokes: 0, tape: 0, dish: 0, nut: null, gunNut: 0,
      deflector: 0 }, recipe);
  }
  function buildCockpitParts(recipe) {
    // halo: hoop profile. 0 regulation round tube / 1 slim low-profile / 2 fenced crown.
    // headrest: 0 flat rim / 1 raised horseshoe / 2 winged pad.
    // mirror: outboard span scale for the mirror stalks and housings, 1 = stock.
    return mergeRecipe({ haloBlade: 0, haloWing: 0, camPods: 0, screen: 0,
      halo: 0, headrest: 0, mirror: 1 }, recipe);
  }
  function buildPartRecipes(T, accent) {
    const tier = (id) => T[id] != null ? T[id] : 1;
    const recipe = (id) => T._visual && T._visual[id] || null;
    return {
      engine: buildEngineParts(recipe("engine"), tier("engine")),
      aero: buildAeroParts(recipe("aero"), tier("aero")),
      suspension: buildSuspensionParts(recipe("suspension"), tier("suspension")),
      brakes: buildBrakeParts(recipe("brakes"), tier("brakes")),
      tyres: buildTyreParts(recipe("tyres"), tier("tyres")),
      ers: buildErsParts(recipe("ers"), tier("ers"), accent),
      gearbox: buildGearboxParts(recipe("gearbox"), tier("gearbox")),
      fuel: buildFuelParts(recipe("fuel"), tier("fuel")),
      exhaust: buildExhaustParts(recipe("exhaust")),
      floor: buildFloorParts(recipe("floor")),
      cockpit: buildCockpitParts(recipe("cockpit")),
      wheels: buildWheelParts(recipe("wheels")),
    };
  }
  function aeroLevelOf(T) {
    T = T || {};
    return buildAeroParts(T._visual && T._visual.aero, T.aero != null ? T.aero : 1).lvl;
  }
  function aeroStyleOf(T) {
    T = T || {};
    return buildAeroParts(T._visual && T._visual.aero, T.aero != null ? T.aero : 1);
  }

  // The monocoque span is a CLOSED block, so its rear face is a solid wall the
  // driver's eye (car-local z -0.18) looks straight into. BOTH its z and its
  // top edge are depth-raster measurements, not styling — the shared z 0.05 ate
  // the steering wheel, and a too-tall cap at z 0.45 then ate the nose. Numbers
  // and method: docs/notes/OCCLUSION-PROBE.md §4. The cockpit span (z 0.05..-0.55) is
  // dropped: the tub around/behind the seat, already modelled by the bolsters.
  const CKPT_MONO_REAR = Object.freeze({ z: 0.45, y: 0.32, w: 0.552, h: 0.16, t: 0.752 });
  function buildSharedChassis(out, c1, rideDY, noseStations, ckpt, edgeAt) {
    const floor = CHASSIS.floor;
    if (_round) CarShade.floor(out, floor, Math.max(floor.cy + rideDY, 0.052), edgeAt, CARBON, addTri); else addBox(out, floor.cx, Math.max(floor.cy + rideDY, 0.052), floor.cz,
           floor.sx, floor.sy, floor.sz, CARBON);
    const nose = noseStations || CHASSIS.nose;
    bodySpan(out, nose[0], nose[1], c1, 0.022);
    bodySpan(out, nose[1], nose[2], c1, 0.028);
    const monoR = ckpt ? CKPT_MONO_REAR : CHASSIS.monocoque[1];
    // COCKPIT: this span is the tub the driver sits IN — the deck under the
    // wheel and the rear wall above it, 0.65 m from the eye. In body paint it
    // is the flat slab players report below the steering wheel: on ferrari
    // (c1 [0.86,0,0]) the largest unbroken one-colour surface in the lower
    // field, hidden by the wheel only while the aim is level and filling the
    // bottom of the frame the moment it pitches down. Carbon is what a real
    // tub is and what the pieces bracketing it already use (inner tub wall,
    // instrument shroud — both INTAKE). The vanity hood ON TOP of this span
    // and the nose beyond keep the livery; external builds never take this
    // branch. Measured on ferrari at the widest shipped framing (78 deg, 2.17):
    // lower-field rays landing on body paint under the wheel (|yaw| < 25 deg)
    // 1073 -> 658 of 13430; the flanks the driver SHOULD see keep their paint.
    const monoC = ckpt ? CARBON : c1;
    // THE OPENING HAS TO CLEAR THE WHEEL. The driver's hands and the wheel sit
    // at z 0.17-0.21, so an aperture starting at the cockpit span's own front
    // (z 0.05) roofs them with solid monocoque where no camera can see them —
    // a slot with a head in it. The exterior monocoque therefore stops CLOSED
    // at z 0.28 and the aperture carries on from there; the first-person build
    // keeps its one closed span (its own dash geometry lives inside it).
    const MONO_APEX_Z = 0.28;
    const monoAt = (z) => { const A = CHASSIS.monocoque[0], B = CHASSIS.monocoque[1];
      const f = (A.z - z) / (A.z - B.z), L = (a, b) => a + (b - a) * f;
      return { z, y: L(A.y, B.y), w: L(A.w, B.w), h: L(A.h, B.h), t: L(A.t, B.t) }; };
    const monoApex = monoAt(MONO_APEX_Z);
    bodySpan(out, CHASSIS.monocoque[0], ckpt ? monoR : monoApex, monoC, 0.032);
    if (ckpt) return;
    // SPLITTER / TEA-TRAY. The floor's leading edge is z 1.30 and there was
    // nothing at all ahead of it, so from any low front-three-quarter camera the
    // car ran out of underbody half a metre before the nose did. The tray is the
    // flat blade under the nose, the stem the vertical that ties it up into the
    // chassis — the T the name comes from. Rides with rideDY like the floor it
    // extends, or it would float when the car is raised.
    addSpan(out, { z: 1.58, y: 0.058 + rideDY, w: 0.36, h: 0.028, t: 0.92 },
                 { z: 1.30, y: 0.062 + rideDY, w: 0.64, h: 0.030, t: 0.96 }, CARBON);
    addBox(out, 0, 0.132 + rideDY, 1.44, 0.10, 0.125, 0.26, CARBON);
    // THE COCKPIT APERTURE. As ONE closed loft the deck over the driver is a
    // filled surface the helmet merely pierces, and the head reads as sitting
    // on the car rather than in it. addLoft emits all six faces and there is no CSG here,
    // so the hole has to come from HOW the span is built: a tub capped at the
    // seat floor, a rail either side, and the well closed behind.
    // Every number below is measured off the span's own stations, not styled:
    // the tub bottom is 0.195 the whole way, the deck top runs 0.635 -> 0.660
    // and the top half-width 0.197 -> 0.150. Rails come out ~4.5 cm across at
    // the coaming at BOTH ends because the opening narrows toward the headrest
    // as the tub does — held straight, the rear rail is 1 cm and vanishes.
    const CK_A = CHASSIS.cockpit[0], CK_B = CHASSIS.cockpit[1];
    const CK_REAR_Z = -0.33;    // behind the headrest; the tub aft of it stays closed
    const CK_FLOOR_Y = 0.47;    // seat floor — the helmet's neck rim sits at 0.490
    const ckAt = (z) => { const f = (CK_A.z - z) / (CK_A.z - CK_B.z), L = (a, b) => a + (b - a) * f;
      return { z, y: L(CK_A.y, CK_B.y), w: L(CK_A.w, CK_B.w), h: L(CK_A.h, CK_B.h), t: L(CK_A.t, CK_B.t) }; };
    const ckTop = (st) => st.y + st.h / 2, ckBot = (st) => st.y - st.h / 2;
    const ckOpen = (z) => 0.150 + (0.200 - 0.150) *
      Math.max(0, Math.min(1, (z - CK_REAR_Z) / (CK_A.z - CK_REAR_Z)));   // clamped: unbounded, the
      // forward extension widened it past the tub and left a 16 mm rail
    // tub half-width at any height (the flank leans in linearly from w/2 at the
    // bottom to t*w/2 at the deck)
    const CK_TOP_T = 0.86;
    const ckT = (st) => Math.max(st.t, CK_TOP_T);
    const ckFlank = (st, y) => (st.w / 2) +
      (ckT(st) * st.w / 2 - st.w / 2) * ((y - ckBot(st)) / (ckTop(st) - ckBot(st)));
    const ckSide = (st) => ckFlank(st, CK_FLOOR_Y);
    // THE COCKPIT SIDE SWEEPS DOWN toward the front, as a real one does — it is
    // highest at the headrest and lowest at the driver's hands. Level at the
    // deck line it buried the VISOR: the aperture spans y 0.612-0.700 (helmets.js
    // VISOR_T0/T1 0.40-0.66 through SHAPE.Y about the 0.630 temple) against a
    // coaming at 0.660, so 55% of it sat behind the rail and the driver had no
    // face. Dropping the front 50 mm puts the rail at ~0.605 abreast of the
    // helmet, just under the visor's lower edge, and clears the whole aperture.
    // Raising the HELMET instead was the obvious move and the wrong one: the
    // rear spoiler and both headrest recipes are keyed to its y, and the pads
    // are already flush under the airbox intake at 0.715.
    const CK_NOSE_DROP = 0.050;
    const ckRailTop = (st) => ckTop(st) -
      CK_NOSE_DROP * ((st.z - CK_REAR_Z) / (CK_A.z - CK_REAR_Z));
    const ckMid = ckAt(CK_REAR_Z);
    // The aperture runs across TWO loft tables — the monocoque ahead of z 0.05
    // and the cockpit span behind it — so it is built as two segments rather
    // than one, each a straight loft between its own pair of stations.
    const CK_SEGS = [[monoApex, monoAt(CK_A.z)], [CK_A, ckMid]];
    // 1. THE TUB UNDER THE OPENING — same flanks, capped at the seat floor.
    const ckLower = (st) => ({ z: st.z, y: (ckBot(st) + CK_FLOOR_Y) / 2, w: st.w,
                               h: CK_FLOOR_Y - ckBot(st), t: ckSide(st) / (st.w / 2) });
    for (const [f0, r0] of CK_SEGS) if (_round) CarShade.cTub(out, [f0, r0].map((st) => Object.assign({}, st, { t: ckFlank(st, ckRailTop(st)) / (st.w / 2), open: ckOpen(st.z), rail: ckRailTop(st) })), CK_FLOOR_Y, c1, addTri); else addSpan(out, ckLower(f0), ckLower(r0), c1);
    // 2. A RAIL EACH SIDE, floor to deck. Explicit corners, because frame()
    //    centres the top on the bottom and a rail's inner face is vertical
    //    while its outer follows the flank inboard.
    for (const sgn of [1, -1]) for (const seg of CK_SEGS) {
      const q = [];
      for (const st of seg) {
        const rt = ckRailTop(st);
        const xi = sgn * ckOpen(st.z), xo = sgn * ckSide(st), xt = sgn * ckFlank(st, rt);
        q.push([xi, CK_FLOOR_Y, st.z], [xo, CK_FLOOR_Y, st.z], [xt, rt, st.z], [xi, rt, st.z]);
      }
      if (!_round) addBlock(out, q, c1);   // rounded build: the rails are the C of CarShade.cTub above
      // Dark liner on the inner face: addBlock paints one colour, and a
      // body-paint cockpit wall reads as a painted trough, not a carbon tub.
      const li = [];
      for (const st of seg) {
        const rt = ckRailTop(st);
        const xi = sgn * ckOpen(st.z), xn = sgn * (ckOpen(st.z) - 0.006);
        li.push([xn, CK_FLOOR_Y, st.z], [xi, CK_FLOOR_Y, st.z], [xi, rt, st.z], [xn, rt, st.z]);
      }
      addBlock(out, li, DARK, null, SURFACES.carbon);
      // 3. COAMING: the padded lip the driver's shoulders sit inside.
      addLoft(out, seg[1].z, sgn * (ckOpen(seg[1].z) + 0.022), ckRailTop(seg[1]) + 0.007, 0.050, 0.016,
                   seg[0].z, sgn * (ckOpen(seg[0].z) + 0.023), ckRailTop(seg[0]) + 0.007, 0.052, 0.016,
              DARK, SURFACES.carbon);
    }
    // 4. THE FLOOR and the rear bulkhead — without them the opening is a hole
    //    straight through the car and you see the track through the driver.
    addLoft(out, ckMid.z, 0, CK_FLOOR_Y - 0.006, 2 * ckOpen(ckMid.z), 0.012,
                 monoApex.z, 0, CK_FLOOR_Y - 0.006, 2 * ckOpen(monoApex.z), 0.012, DARK, SURFACES.carbon);
    addBox(out, 0, (CK_FLOOR_Y + ckTop(ckMid)) / 2, ckMid.z + 0.008,
           2 * ckOpen(ckMid.z), ckTop(ckMid) - CK_FLOOR_Y, 0.016, DARK, SURFACES.carbon);
    // 5. The tub AFT of the headrest stays a closed block, as it was (a body span: rounded with CarShade).
    // Bevel only the CLOSED section: over the aperture the rails stop short of
    // the deck corners, so a full-span crease would hang in mid-air.
    bodySpan(out, ckMid, CK_B, c1, 0.028);
  }

  function sidepodStation(side, z, inner, outer, innerBottom, outerBottom, innerTop, outerTop) {
    return [
      [side * inner, innerBottom, z], [side * outer, outerBottom, z],
      [side * outer, outerTop, z], [side * inner, innerTop, z],
    ];
  }

  function sampleStations(stations, z) {
    if (z >= stations[0].z) return Object.assign({}, stations[0], { z });
    if (z <= stations[stations.length - 1].z)
      return Object.assign({}, stations[stations.length - 1], { z });
    for (let i = 0; i < stations.length - 1; i++) {
      const a = stations[i], b = stations[i + 1];
      if (z <= a.z && z >= b.z) {
        const t = (a.z - z) / (a.z - b.z), out = { z };
        for (const key of Object.keys(a)) {
          if (key !== "z") out[key] = a[key] + (b[key] - a[key]) * t;
        }
        return out;
      }
    }
    return Object.assign({}, stations[0], { z });
  }

  function sidepodStations(eng, style) {
    const podWidth = Math.max(0.72, Math.min(1.28, eng.podWidth));
    const shoulder = Math.max(0.76, Math.min(1.28, eng.shoulderHeight));
    const undercut = Math.max(0.72, Math.min(1.38, eng.undercut));
    const coke = Math.max(0.72, Math.min(1.38, eng.coke));
    const tailWidth = Math.max(0.70, Math.min(1.30, eng.tailWidth));
    const inletH = style ? (style.inletH || 0) : 0;
    const inletW = style ? (style.inletW || 0) : 0;
    const undercutD = style ? (style.undercutD || 0) : 0;
    const waistK = style ? (style.waist || 0) : 0;
    const outerFront = 0.66 * podWidth + inletW;
    const outerShoulder = 0.70 * podWidth + inletW * 0.35;
    const outerWaist = (0.58 - 0.08 * (coke - 1)) * podWidth + waistK;
    const outerTail = (0.38 - 0.09 * (coke - 1)) * tailWidth + waistK * 0.35;
    const inletFloor = 0.235 + 0.11 * (undercut - 1);
    const shoulderTop = 0.49 + 0.23 * (shoulder - 1);
    const inletBias = style ? (style.inlet || 0) : 0;
    // THE UNDERCUT. The pod section is a quad from [inner, innerBottom] to
    // [outer, outerBottom]; when outerBottom sits BELOW innerBottom the
    // bodywork's lower surface falls away outboard and the pod runs straight
    // down to the floor as a slab-sided box. That is what these stations did
    // from z 0.22 rearward — outerBottom 0.105-0.12 against a floor rail whose
    // top is ~0.128, so there was no channel at all over the whole length of
    // the pod, and the `undercut` knob did not even reach four of the seven
    // stations. On every ground-effect car since 2022 the undercut is the
    // defining shape of the sidepod: the lower surface climbs as it goes
    // outboard, and you can see daylight between the pod's belly and the floor
    // edge from any front-three-quarter camera. outerBottom is now ABOVE
    // innerBottom at every station and every value of the knob (checked at both
    // clamps, 0.72 and 1.38), which is the undercut, and the knob deepens it
    // everywhere instead of only at the inlet. The pod's visible FLANK is
    // shorter by ~85 mm at the shoulder as a result; the sponsor board and its
    // decal are both sized in pod fractions, so they track it together.
    return [
      { z: 0.62, inner: 0.30, outer: outerFront, innerBottom: inletFloor,
        outerBottom: 0.258 + 0.09 * (undercut - 1) + undercutD * 0.70,
        innerTop: 0.45 + inletBias + inletH, outerTop: 0.46 + inletBias * 0.6 + inletH * 0.85 },
      { z: 0.50, inner: 0.298, outer: outerFront * 0.97 + outerShoulder * 0.03,
        innerBottom: 0.218 + 0.12 * (undercut - 1),
        outerBottom: 0.232 + 0.10 * (undercut - 1) + undercutD * 0.85,
        innerTop: 0.448 + inletBias * 0.55 + inletH * 0.70,
        outerTop: 0.455 + inletBias * 0.35 + inletH * 0.55 },
      { z: 0.22, inner: 0.29, outer: outerShoulder,
        innerBottom: 0.20 + 0.13 * (undercut - 1),
        outerBottom: 0.208 + 0.11 * (undercut - 1) + undercutD,
        innerTop: shoulderTop + inletH * 0.15, outerTop: shoulderTop - 0.015 + inletH * 0.08 },
      { z: -0.38, inner: 0.28, outer: outerShoulder * 0.55 + outerWaist * 0.45,
        innerBottom: 0.162 + 0.10 * (undercut - 1),
        outerBottom: 0.176 + 0.09 * (undercut - 1) + undercutD * 0.55,
        innerTop: shoulderTop * 0.68 + (0.42 + 0.10 * (shoulder - 1)) * 0.32,
        outerTop: (shoulderTop - 0.015) * 0.62 + (0.38 + 0.08 * (shoulder - 1)) * 0.38 },
      { z: -0.62, inner: 0.27, outer: outerWaist,
        innerBottom: 0.14 + 0.08 * (undercut - 1),
        outerBottom: 0.160 + 0.07 * (undercut - 1) + undercutD * 0.35,
        innerTop: 0.42 + 0.10 * (shoulder - 1),
        outerTop: 0.38 + 0.08 * (shoulder - 1) },
      { z: -1.05, inner: 0.25, outer: outerWaist * 0.42 + outerTail * 0.58,
        innerBottom: 0.134, outerBottom: 0.146,
        innerTop: 0.355 + 0.07 * (shoulder - 1),
        outerTop: 0.318 + 0.04 * (shoulder - 1) },
      { z: -1.48, inner: 0.23, outer: outerTail, innerBottom: 0.13,
        outerBottom: 0.134, innerTop: 0.30 + 0.05 * (shoulder - 1), outerTop: 0.27 },
    ];
  }

  const _anchorCache = new WeakMap();
  const _anchorNullKey = {};   // stand-in for a null/undefined parts (legacy bodies)
  function bodyAnchors(parts, teamId, spineHeight, round) {
    const outer = parts || _anchorNullKey;
    let byTeam = _anchorCache.get(outer);
    if (!byTeam) { byTeam = new Map(); _anchorCache.set(outer, byTeam); }
    // The livery's spine lift shares the per-parts map: a "standard" (or
    // absent) spine keys exactly as before, so no caller that never heard of
    // it sees a different object.
    const rise = spineRise(spineHeight);
    const tk = (teamId || "") + (rise ? "|" + spineHeight : "") + (round ? "|r" : "");   // round: the rounded car's coke-bottle shape (CarShade)
    const hit = byTeam.get(tk);
    if (hit) return hit;
    const built = buildBodyAnchors(parts, teamId, rise, round);
    byTeam.set(tk, built);
    return built;
  }

  function buildBodyAnchors(parts, teamId, rise, round) {
    rise = rise || 0;
    const T = parts || {};
    const tier = T.engine != null ? T.engine : 1;
    const eng = buildEngineParts(T._visual && T._visual.engine, tier);
    const style = teamStyleOf(teamId);
    const coverHeight = Math.max(0.78, Math.min(1.28, eng.coverHeight));
    const crown = style.coverCrown || 0;
    // Two stations only. A third (z -1.13) made coverAt non-linear and broke
    // car-shade: downwash gap vs cover.bottom, and cokeFoot xb<=x. coverCrown
    // pinches x and peaks the profile — it must NOT lift coverAt().top or
    // spineHeight "high"/"dorsal" walk through the roll-hoop cap (fin-design).
    // CarShade.coverLoft already walks COVER_Z through coverAt.
    const coverStations = [
      { z: -0.55, x: 0.28 * eng.tailWidth * (1 - crown * 0.6),
        bottom: 0.52 + 0.08 * (coverHeight - 1) - 0.31 * coverHeight,
        top: 0.52 + 0.08 * (coverHeight - 1) + 0.31 * coverHeight + rise, k: crown },
      { z: -2.00, x: 0.13 * eng.tailWidth,
        bottom: 0.42 - 0.17 * coverHeight, top: 0.42 + 0.17 * coverHeight + rise * SPINE_TAIL, k: crown * 0.45 },
    ];
    const podStations = round ? CarShade.downwash(sidepodStations(eng, style), (z) => sampleStations(coverStations, z).bottom, eng.coke) : sidepodStations(eng, style);   // rounded: the downwash ramp
    const noseStations = styledNoseStations(style).map((station) => ({
      z: station.z, side: station.w * 0.5, topSide: station.w * station.t * 0.5,
      bottom: station.y - station.h * 0.5, top: station.y + station.h * 0.5,
    }));
    return {
      key: [eng.podWidth, eng.shoulderHeight, eng.undercut, eng.coke,
            eng.tailWidth, eng.coverHeight, rise,
            style === DEFAULT_STYLE ? "" : (teamId || "")].join(",") + (round ? "|r" : ""),
      podAt(z) {
        const p = sampleStations(podStations, z);
        return { z, x: p.outer, inner: p.inner, bottom: p.outerBottom, top: p.outerTop,
                 innerBottom: p.innerBottom, innerTop: p.innerTop };
      },
      coverAt(z) { const c = sampleStations(coverStations, z); return round ? CarShade.cokeFoot(c, coverStations, eng.coke) : c; },   // rounded: the pinched foot, c.xb
      noseAt(z) { return sampleStations(noseStations, z); },
      podStations: podStations.map((p) => Object.freeze(Object.assign({}, p))),
    };
  }

  // A radiator mouth that reads as a HOLE. The shipped inlet was one flat dark
  // slab pinned on the pod face — two triangles, no relief — and at the audit
  // camera's ~6 mm per pixel a 5 mm proud box is under one pixel, so every
  // engine tier photographed the same rectangle in a slightly different size.
  // This is a proud lip ring, four throat walls raking to 70% of the opening
  // over `depth`, and a dark core face at the back of the duct: 55 mm of throat
  // is ~9 px of visible recession from any camera that is not dead astern.
  function addInletMouth(out, x, y, z, w, h, lipC, depth, lip) {
    const D = depth == null ? 0.055 : depth;
    const L = lip == null ? 0.012 : lip;
    const T = 0.010, K = 0.70;
    // Two bars, not four: the lower edge sits into the undercut and the inboard
    // edge faces the chassis, so a full ring costs 24 tris a side for two
    // surfaces no camera on this car ever sees.
    if (L > 0) {
      addBox(out, x, y + (h + L) * 0.5, z + 0.008, w + L * 2, L, 0.020, lipC, SURFACES.paint);
      addBox(out, x + Math.sign(x) * (w + L) * 0.5, y, z + 0.008, L, h + L * 2, 0.020,
             lipC, SURFACES.paint);
    }
    for (const u of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      addSpan(out,
        { z, x: x + u[0] * w * 0.5, y: y + u[1] * h * 0.5,
          w: u[0] ? T : w, h: u[1] ? T : h },
        { z: z - D, x: x + u[0] * w * 0.5 * K, y: y + u[1] * h * 0.5 * K,
          w: u[0] ? T : w * K, h: u[1] ? T : h * K },
        INTAKE, null, SURFACES.carbon);
    }
    addBox(out, x, y, z - D - 0.008, w * K, h * K, 0.016, DARK);
  }

  function buildSidepodBodywork(out, c1, eng, anchors) {
    const data = anchors || bodyAnchors({ engine: 1, _visual: { engine: eng } });
    const stations = data.podStations;
    if (_round) CarShade.podLoft(out, stations, c1, INTAKE, addTri);
    else for (const side of [-1, 1]) {
      addStationLoft(out, stations.map((p) => sidepodStation(side, p.z, p.inner, p.outer,
        p.innerBottom, p.outerBottom, p.innerTop, p.outerTop)), c1, INTAKE);
    }
    const inletP = data.podAt(0.62);
    const shoulderP = data.podAt(0.18);
    const flankP = data.podAt(-0.10);
    const floorP = data.podAt(0.0);
    const conduitP = data.podAt(-0.65);
    const tailP = data.podAt(-1.48);
    return {
      inlet: { z: 0.625, x: (inletP.inner + inletP.x) * 0.5,
               y: (inletP.innerBottom + inletP.innerTop) * 0.5,
               width: inletP.x - inletP.inner, height: inletP.innerTop - inletP.innerBottom },
      shoulder: { x: shoulderP.x + 0.008, y: shoulderP.top - 0.012, z: 0.18 },
      flank: { x: flankP.x + 0.008, y: (flankP.bottom + flankP.top) * 0.5, z: -0.10 },
      floorEdge: { x: floorP.x + 0.012, y: floorP.bottom + 0.012 },
      conduit: { x: conduitP.x + 0.012, y: conduitP.top + 0.018, z: -0.65 },
      tail: { x: tailP.x, y: (tailP.bottom + tailP.top) * 0.5, z: -1.48 },
    };
  }

  function buildEngineCoverBodywork(out, c1, accentC, eng, anchors, rise, sideMark, trimAft) {
    const coverHeight = Math.max(0.78, Math.min(1.28, eng.coverHeight));
    rise = rise || 0;
    // t was 0.0 — frame() puts BOTH top corners on the centreline, so the engine
    // cover was a triangular tent that came to a zero-width knife along its
    // whole length. Three things were wrong with that. A real cover is a
    // rounded hump with a flat-ish crown, and the shark fin (halfBase 0.022)
    // stood on a ridge with no width to stand on. Worse, everything anchored
    // off anchors.coverAt(z).x — which is the BOTTOM half-width — and drawn at
    // a y near .top was floating in clear air: at the default recipe a service
    // panel sat 0.21 m outboard of the surface it is bolted to, and the crest
    // sponsor quad in js/car/car-mesh.js (drawn at cover.top + 0.008, spanning
    // ±x*0.72) was a flat plate hanging over a knife edge. 0.72 is that 0.72:
    // it makes the crown exactly as wide as the decal that is painted on it,
    // and pulls every cover-mounted detail back to within ~0.06 m of the skin.
    // The spine lift is TOP-ONLY: centre up by half, height up by the whole,
    // which is exactly the coverStations top line in bodyAnchors (the floor
    // y - h/2 is unchanged). The two must agree or the crest decal floats.
    const front = { z: -0.55, y: 0.52 + 0.08 * (coverHeight - 1) + rise / 2,
                    w: 0.56 * eng.tailWidth, h: 0.62 * coverHeight + rise, t: 0.72 };
    const rear = { z: -2.00, y: 0.42 + rise * SPINE_TAIL / 2, w: 0.26 * eng.tailWidth,
                   h: 0.34 * coverHeight + rise * SPINE_TAIL, t: 0.70 };
    // The loft is three stacked blocks over coverProfile — flank, lower facet,
    // upper facet + crown — at the two anchor stations (the same numbers as
    // `front`/`rear` above, which other parts still read for their datums).
    // Flat path always uses the four KEYS (3 stacked blocks). Rounded garage/
    // near densifies the CROSS-SECTION only — COVER_Z stays shared with the
    // flank-decal drape (car-mesh) so mid rings never leave the band floating.
    const pf = coverProfile(anchors.coverAt(front.z)), pr = coverProfile(anchors.coverAt(rear.z));
    const loftKeys = (c) => { const p = coverProfile(c); return { pts: p.keys || p.pts }; };
    if (_round) {
      CarShade.coverLoft(out, anchors, _coverHi ? ((c) => coverProfile(c, true)) : loftKeys,
        front.z, rear.z, c1, addTri);
    } else for (let k = 0; k < 3; k++) {
      const ring = (p, z) => {
        const q = p.keys || p.pts;
        return [[-q[k][0], q[k][1], z], [q[k][0], q[k][1], z],
                [q[k + 1][0], q[k + 1][1], z], [-q[k + 1][0], q[k + 1][1], z]];
      };
      addBlock(out, ring(pf, front.z).concat(ring(pr, rear.z)), c1, c1);
    }
    // The accent pinstripe runs the flank just under the crease, across the
    // SPINE SIDE band — which is the WHOLE flank, z -0.66..-1.90 — so with a
    // mark on it the trim starts aft of the MARK instead: a real number
    // interrupts the trim. -1.26 is "aft of the mark" only while the mark is at
    // f 0.19, so a crown that moved the design hands its own station in trimAft
    // (see build). COVER_STACK.flankTrim keeps the trim out of the decal PLANE.
    const stripeFront = anchors.coverAt(trimAft || (sideMark ? -1.26 : -0.825)), stripeRear = anchors.coverAt(-1.675);
    // The pinstripe runs the flank just under the shoulder crease, ON the skin.
    const sfY = coverProfile(stripeFront).shoulder - 0.03, srY = coverProfile(stripeRear).shoulder - 0.025;
    for (const side of [-1, 1]) {
      addSpan(out,
        { z: stripeFront.z, x: side * (coverFlankX(stripeFront, sfY) + COVER_STACK.flankTrim - 0.005), y: sfY,
          w: 0.010, h: 0.012 },
        { z: stripeRear.z, x: side * (coverFlankX(stripeRear, srY) + COVER_STACK.flankTrim - 0.005), y: srY,
          w: 0.010, h: 0.012 }, accentC);
    }
    const mid = anchors.coverAt(-1.30);
    return {
      front, rear,
      coolingX: Math.max(0.08, mid.x * 0.78),
      coolingY: mid.top - 0.12,
      tailVentY: rear.y + rear.h * 0.20,
    };
  }

  function applyBodySplit(out, i0, i1, leftC, rightC) {
    for (let i = i0; i < i1; i++) {
      if (out.mat[i] !== SURFACES.paint) continue;
      const c = out.pos[i * 3] < 0 ? leftC : rightC;
      out.col[i * 3] = c[0]; out.col[i * 3 + 1] = c[1]; out.col[i * 3 + 2] = c[2];
    }
  }

  function build(color, color2, opts) {
    const noWheels = opts && opts.noWheels;
    const teamId = opts && opts.teamId;
    // Field body / silhouette = mid & far track LODs: keep the cheap cover.
    // Player, garage, and painted rivals get the dense garage/near cover.
    _coverHi = !(opts && (opts.field || opts.silhouette));
    Log.info("car", "build" + (teamId ? " " + teamId : ""));
    const out = { pos: [], nrm: [], col: [], mat: [], idx: [] };
    const sections = [];
    const part = (name) => {
      const at = out.pos.length / 3;
      if (sections.length) sections[sections.length - 1].to = at;
      sections.push({ name, from: at, to: at });
    };
    const c1 = color  || [0.8, 0.05, 0.05];
    // COCKPIT accent dimming — the wheel has always done this (getCockpitWheel
    // tints livery to 40-45%); the body trim needs it too. Accent elements sit
    // 0.8-2.9 m from the eye over a big solid angle, so a near-white accent
    // (ferrari's c2 IS [1,1,1]) stops reading as a stripe and becomes a flat
    // pale slab: 75 of 6095 view rays landed on pure white before this
    // (tools/car/cockpit-pale-sweep.mjs). The darkest channel decides, so a SATURATED
    // accent keeps its identity and only white/silver comes down. External
    // cameras always get the full-strength livery.
    const _ckAcc = (c) => {
      if (!(opts && opts.cockpit) || !c) return c;
      const mn = Math.min(c[0], c[1], c[2]);
      if (mn < 0.45) return c;
      const k = 0.42 / mn;
      return [c[0] * k, c[1] * k, c[2] * k];
    };
    const c2 = _ckAcc(color2 || [0.9, 0.9, 0.1]);
    const liv = (opts && opts.livery) || {};
    const accentC = _ckAcc(liv.accent) || c2;
    // EVERY livery paint that lands in the driver's view goes through _ckAcc,
    // not just the accent. The first pass dimmed c2/accent/wing/fin and left
    // nose, pod, halo, stripe and noseStripe at full strength — 72 pale values
    // across the shipped liveries, and the ones that matter most are the
    // closest: `pod` is the sidepod shoulders left and right of the eye, and
    // `halo` is 0.5 m in front of the face. Only the BODY (c1) stays exempt,
    // deliberately — a white car really is white, and dimming it would
    // misreport the livery (see tests/unit/cockpit-pale-surfaces.test.mjs).
    // _ckAcc is a no-op outside the cockpit build and on any colour whose
    // darkest channel is under 0.45, so saturated paint keeps its identity.
    const noseC = _ckAcc(liv.nose) || null;
    const podC  = _ckAcc(liv.pod)  || null;
    const wingC = _ckAcc(liv.wing) || c2;   // flap colour (front + rear) — c2 keeps today's look
    // WING FLAPS "carbon" (liv.wingCarbon): every flap, front and rear, in bare weave — the
    // launch-photo look on the MCL40 and the SF-26. Colour AND surface: the flap sites pass
    // SURFACES.paint explicitly, so a CARBON colour alone would render as dark paint.
    const wingCarbon = liv.wingCarbon === "carbon";
    const wingSurf = wingCarbon ? SURFACES.carbon : SURFACES.paint, wingCol = wingCarbon ? CARBON : wingC;
    const rearC = wingCarbon ? CARBON : (_ckAcc(liv.rearWing) || c2);   // REAR WING block (IBM blue, Visa white) — c2 keeps today's look
    const coverC = _ckAcc(liv.cover) || c1;
    const bandProxy = liv.spineTint || c2;
    const finRaw = (typeof LiveryTex !== "undefined" && LiveryTex.resolveFinPaint)
      ? LiveryTex.resolveFinPaint(teamId, liv, coverC, bandProxy, c1, c2)
      : (liv.fin || c2);
    const finC  = _ckAcc(finRaw) || finRaw;   // shark-fin plate — finHandoff + liv.fin
    // ENGINE COVER (liv.cover): the cover loft in its own colour — the SF-26's
    // white top over a red chassis, the W17's silver over black. Absent = c1,
    // today's look. Airbox mesh lips use airboxMeshColour (wrap sun > cover).
    // BODY SPLIT (liv.bodySplit === "lr"): Cadillac-style L/R body. Left (x<0)
    // keeps c1, right (x>=0) takes c2. Applied as a paint-only recolour over the
    // chassis→livery sections so carbon / wings / glass stay untouched. It wins over `lower` (CarShade.lowerZone).
    const bodySplitLR = liv.bodySplit === "lr";
    const haloTint = _ckAcc(liv.halo) || null;
    const T = (opts && opts.parts) || {};
    const tier = (id) => T[id] != null ? T[id] : 1;
    const ersC2 = tier("ers") === 2 ? [c2[0]*1.8, c2[1]*1.8, c2[2]*1.8] : c2;
    const design = buildPartRecipes(T, ersC2);
    const suspT = tier("suspension");
    const suspStyle = design.suspension;
    const engStyle = design.engine;
    const brakeStyle = design.brakes;
    const tyreStyle = design.tyres;
    const ersStyle = design.ers;
    const gbStyle = design.gearbox;
    const fuelStyle = design.fuel;
    const aeroStyle = design.aero;
    out.flapInfo = null;   // filled in once wingC/aLvl are resolved, below
    const exhStyle = design.exhaust;
    const floorStyle = design.floor;
    const cockpitStyle = design.cockpit;
    const wheelStyle = design.wheels;
    const teamStyle = teamStyleOf(opts && opts.teamId);
    const ckpt = opts && opts.cockpit;   // hoisted: buildSharedChassis needs it
    // ownHalo (exterior builds only): the cockpit build's halo (opts.halo, the
    // player's COCKPIT halo choice; 0 = none) replaces the factory hoop and its
    // head-surround attachments (blade, wing, cam pods, screen). The player's
    // first-person shadow caster (car-draw.js cockpitShadowMesh): the real car
    // around the seat, but nothing over the cockpit the player cannot see.
    const exHalo = !ckpt && !(opts && opts.ownHalo);
    const shade = !ckpt && typeof CarShade !== "undefined" && (opts && opts.smooth != null ? !!opts.smooth : CarShade.on(teamId));
    const anchors = bodyAnchors(T, opts && opts.teamId, liv.spineHeight, shade);   // rounded: coke foot + downwash ramp
    const floorEdge = Math.max(0.72, Math.min(1.35, aeroStyle.floorEdge));
    const floorCut = Math.max(0, Math.min(0.24, aeroStyle.floorCut));
    // Same envelope the front wing now respects: at the catalog's widest floor
    // recipe the edge rails measured x 0.970 and the diffuser 0.960, outside the
    // 1900 mm car. The rails carry an edge lip and a gurney another ~45 mm
    // outboard of whatever this returns, so the cap leaves that much room.
    const floorX = (k) => Math.min(CAR_HALF - 0.055, k * floorEdge);
    const floorStep = teamStyle.floorStep || 0;
    const floorStepY = floorStep * 0.85;
    const floorEdgeAt = (z) => {   // hoisted too: the rounded floor plate (CarShade.floor) follows it
      const t = Math.max(0, Math.min(1, (0.78 - z) / 2.36));
      return floorX(0.70 + floorStep - 0.16 * Math.max(0, t - 0.5) * 2);
    };

    part("chassis");
    _round = shade;
    const bodySplitFrom = out.pos.length / 3;
    const rideDY = suspStyle ? suspStyle.ride : (suspT === 0 ? 0.060 : suspT === 2 ? -0.048 : 0);
    buildSharedChassis(out, c1, rideDY, styledNoseStations(teamStyle), ckpt, floorEdgeAt);

    part("hood");
    // Driver-eye deck and shoulders (official F1 / Sky visor cams).
    const hF = ckpt ? { z: 1.10, y: 0.50, w: 0.50, h: 0.10, t: 0.66 }
                    : { z: 1.15, y: 0.435, w: 0.30, h: 0.09, t: 0.64 };
    // The cowl stays ahead of the wheel and rises to its surround, beneath
    // the raised hand position; the exterior aperture keeps its own datums.
    // Deck width, height, shoulder flare, waist and forward crown per design.
    const profiles = { standard:[0,0,0,0,0], sculpted:[-0.045,-0.008,0.025,-0.040,0.026],
      wide:[0.12,0,0.11,0.025,0.010], tapered:[-0.08,-0.015,-0.045,-0.020,-0.040], stepped:[0.04,0,0.055,-0.025,0.038] };
    const profile = profiles[ckpt && opts.cockpitBody] || profiles.standard;
    const hR = ckpt ? { z: 0.62, y: 0.604, w: 0.62, h: 0.118, t: 0.58 }
                    : { z: 0.30, y: 0.545, w: 0.42, h: 0.13, t: 0.58 };   // stops at the aperture (0.28), top 0.610 onto the tub line
    hR.w += profile[0]; hR.y += profile[1];
    const deck = ckpt ? [hF, { z: 0.86, y: 0.56, w: 0.58, h: 0.12, t: 0.62 }, hR] : [hF, hR];
    for (let i = 0; i < deck.length - 1; i++) {
      bodySpan(out, deck[i], deck[i + 1], c1, 0.026);
    }
    // Exterior crown stripe follows the deck. In cockpit it foreshortens into
    // a slab (a white accent hit the centre ray at 0.69 m), so it stays outside.
    if (!ckpt) {
      const deckTop = (z) => {
        const t = Math.max(0, Math.min(1, (hF.z - z) / (hF.z - hR.z)));
        return (hF.y + hF.h / 2) + ((hR.y + hR.h / 2) - (hF.y + hF.h / 2)) * t + 0.026;
      };
      addSpan(out, { z: 0.85, y: deckTop(0.85) + 0.008, w: 0.09, h: 0.016 },
                   { z: 0.05, y: deckTop(0.05) + 0.008, w: 0.11, h: 0.016 },
              ersC2, null, SURFACES.paint);
    }

    part("bolsters");
    if (ckpt) {
      for (const s of [-1, 1]) {
        // Six shoulder stations resolve the curvature beside the driver's arms.
        const stations = [[1.50,0.30,0.52,0.62],[0.94,0.280,0.52,0.702],[0.44,0.255,0.50,0.735],
          [-0.12,0.282,0.50,0.749],[-0.80,0.307,0.55,0.754],[-2.56,0.32,0.55,0.754]];
        const rings = stations.map(([z,inner,outer,y])=>{
          const waist = Math.exp(-Math.pow((z-0.15)/0.65,2));
          outer += profile[2] + profile[3]*waist;
          const top=Math.min(0.754,y+profile[4]*Math.exp(-Math.pow((z-0.55)/0.40,2)));
          const x=inner+(outer-inner)*0.38; // visor refs: crowned lip, not a broad painted shelf
          return [[s*inner,0.34,z],[s*outer,0.30,z],[s*outer,top-0.080,z],
            [s*(outer-0.035),top-0.025,z],[s*x,top,z],[s*(inner+0.014),y-0.008,z],[s*inner,y-0.040,z]];
        });
        const start=out.pos.length/3;
        for(let i=0;i<rings.length-1;i++) for(let j=2;j<6;j++) {
          const a=rings[i], b=rings[i+1];
          if(s>0) addQuad(out,a[j],b[j],b[j+1],a[j+1],c1); else addQuad(out,a[j+1],b[j+1],b[j],a[j],c1);
        }
        smoothSkin(out,start);
        for(const i of [0,rings.length-1]) for(let j=1;j<6;j++) {
          const q=rings[i]; if((i===0)===(s>0)) addTri(out,q[0],q[j],q[j+1],c1); else addTri(out,q[0],q[j+1],q[j],c1);
        }
        addTube(out,rings.map(q=>q[6]),0.008,4,CARBON,SURFACES.carbon);
      }
      addBox(out, 0, 0.36, 0.60, 0.66, 0.13, 0.16, CARBON);
      addBox(out, 0, 0.345, 0.54, 0.52, 0.10, 0.05, INTAKE);   // dark instrument shroud
      // Dark six-point harness webbing avoids a pale slab across the lap.
      const WEB = [0.10, 0.11, 0.14];
      for (const s of [-1, 1]) {
        addQuad(out, [s*0.15,0.700,-0.30],[s*0.22,0.700,-0.30],[s*0.09,0.437,0.155],[s*0.02,0.437,0.155],WEB,SURFACES.carbon);
        addQuad(out, [s*0.245,0.398,0.064],[s*0.245,0.398,0.126],[s*0.052,0.425,0.199],[s*0.052,0.425,0.137],WEB,SURFACES.carbon);
      }
      addBox(out, 0, 0.432, 0.176, 0.088, 0.078, 0.034, [0.32, 0.32, 0.36], SURFACES.metal);
    } else {
      for (const s of [-1, 1]) {
        (_round ? CarShade.blockFn(addTri, { r: [0, 0.03, 0.07, 0.02] }) : addBlock)(out, [   // rounded: outer shoulder r 70 mm
          [s*0.24, 0.42, 0.14], [s*0.40, 0.42, 0.14], [s*0.40, 0.60, 0.10], [s*0.24, 0.58, 0.10],
          [s*0.24, 0.44, -0.42], [s*0.40, 0.44, -0.42], [s*0.40, 0.62, -0.44], [s*0.24, 0.60, -0.44],
        ], c1);
      }
    }

    part("sidepods");
    const podGeom = buildSidepodBodywork(out, c1, engStyle, anchors);
    // TRAP: `proud` is measured off anchors.podAt(z).x, which is the LOFT
    // CONTROL width, NOT the rendered pod surface. Measured, the two diverge by
    // 18 mm at z 0.2 and 99 mm at z -0.4, so a thin line laid the default 8 mm
    // proud is BURIED inside the bodywork over most of the pod's length. That
    // is fine for the callers below — they are tall panels whose top or bottom
    // edge clears the surface — but a flank CREASE anchored this way renders
    // identically to no change at all (two rendered attempts). Anything
    // that has to sit ON the flank must sample the built surface instead.
    function addPodFlankSpan(zFront, zRear, yFrac, height, col, surface, proud, fracH) {
      // Never bridge a detail across a loft crease: each segment follows the
      // same station interval as the underlying sidepod surface.
      const stops = [zFront, ...anchors.podStations.map((p) => p.z)
        .filter((z) => z < zFront && z > zRear), zRear].sort((a, b) => b - a);
      for (const side of [-1, 1]) {
        for (let i = 0; i < stops.length - 1; i++) {
          const a = anchors.podAt(stops[i]), b = anchors.podAt(stops[i + 1]);
          addSpan(out,
            { z: stops[i], x: side * (a.x + (proud || 0.008)),
              y: a.bottom + (a.top - a.bottom) * yFrac,
              w: 0.016, h: fracH ? (a.top - a.bottom) * height
                                 : Math.min(height, (a.top - a.bottom) * 0.78) },
            { z: stops[i + 1], x: side * (b.x + (proud || 0.008)),
              y: b.bottom + (b.top - b.bottom) * yFrac,
              w: 0.016, h: fracH ? (b.top - b.bottom) * height
                                 : Math.min(height, (b.top - b.bottom) * 0.78) },
            col, null, surface);
        }
      }
    }

    for (const side of [-1, 1]) {
      addSpan(out,
        { z: 0.78, x: side * floorX(0.69), y: 0.108 + rideDY + floorStepY, w: 0.062, h: 0.048 + Math.max(0, floorStepY) * 0.35 },
        { z: -0.42 - floorCut, x: side * floorX(0.72), y: 0.114 + rideDY + floorStepY * 0.55, w: 0.052, h: 0.054 + Math.abs(floorStepY) * 0.25 },
        CARBON, null, SURFACES.carbon);
      addSpan(out,
        { z: -0.48 + floorCut, x: side * floorX(0.70), y: 0.116 + rideDY + floorStepY * 0.45, w: 0.048, h: 0.052 },
        { z: -1.58, x: side * floorX(0.54 + floorCut * 0.35),
          y: 0.150 + rideDY + floorStepY * 0.25, w: 0.040, h: 0.068 },
        CARBON, null, SURFACES.carbon);
      addBox(out, side * floorX(0.71), 0.128 + rideDY + floorStepY * 0.5, -0.45,
             0.038, 0.016 + Math.abs(floorStepY) * 0.4, 0.058, CARBON, SURFACES.carbon);
    }
    // 2026 floor leading-edge devices — up to five vortex teeth across the
    // width (motorsport.tech Issue-12). Chase only: they sit under the nose
    // and never enter the onboard frame.
    if (!ckpt) {
      for (const x of [-0.48, -0.24, 0, 0.24, 0.48]) {
        addBox(out, x, 0.078 + rideDY, 0.82, 0.058, 0.030, 0.11, CARBON, SURFACES.carbon);
      }
    }
    const aSlot = Math.max(0, Math.min(1, Math.round((aeroStyle && aeroStyle.slot) || 0)));
    if (aSlot && !ckpt) {
      for (const s of [-1, 1]) {
        const ex = floorEdgeAt(-1.42);
        addBox(out, s * (ex - 0.04), 0.095 + rideDY, -1.48, 0.10, 0.035, 0.16, INTAKE);
        addBox(out, s * (ex + 0.02), 0.088 + rideDY, -1.48, 0.055, 0.018, 0.12, CARBON);
      }
    }

    part("engineCover");
    let coverGeom = null;
    if (!ckpt) {
      const engT = tier("engine");
      const inScale = (engStyle ? engStyle.in : (engT === 0 ? 0.52 : engT === 2 ? 1.65 : 1.0)) * teamStyle.airbox;
      const engSnork = engStyle ? !!engStyle.snork : engT === 2;
      // Roll hoop / snorkel / intake lips: airboxMeshColour (wrap sun wins).
      const airboxC = (typeof LiveryTex !== "undefined" && LiveryTex.airboxMeshColour)
        ? (_ckAcc(LiveryTex.airboxMeshColour(teamId, liv, coverC)) || coverC)
        : coverC;
      (_round ? (o, a, b, c, f) => CarShade.loft(o, a, b, c, addTri, { frontCol: f }) : addSpan)(out, { z: -0.28, y: 0.76, w: 0.30 * inScale, h: 0.20 * inScale, t: 0.55 },
                   { z: -0.75, y: 0.74, w: 0.26 * inScale, h: 0.18 * inScale, t: 0.55 }, airboxC, INTAKE);
      // PRINCIPAL ROLL STRUCTURE. C12.4.1 requires structure at [XC 55, 0, 968]
      // — y 0.968 here, the tallest mandated point on the car
      // (docs/notes/COCKPIT-DATUMS.md). Nothing occupied it: the airbox crowned at
      // 0.76 + 0.10*inScale (0.86 at the default tier), the rear wing peaked
      // ~0.97, and the car's silhouette therefore had its highest point at the
      // BACK — inverted from every real car, where the hoop leads and the wing
      // sits under it. The T-camera assembly (pod + bar) rides this blade's
      // crown via the snorkel-aware podY below — not a literal at y 0.955.
      // Height is regulation and therefore FIXED — an engine spec buys mouth
      // width (`in` still scales w), not a taller roll structure.
      const hoopF = 0.76 + 0.10 * inScale, hoopR = 0.74 + 0.09 * inScale;
      (_round ? (o, a, b, c) => CarShade.loft(o, a, b, c, addTri, { n: 16 }) : addSpan)(out, { z: -0.33, y: (hoopF + 0.968) / 2, w: 0.15 * inScale,
                     h: Math.max(0.03, 0.968 - hoopF), t: 0.40 },
                   { z: -0.63, y: (hoopR + 0.938) / 2, w: 0.13 * inScale,
                     h: Math.max(0.03, 0.938 - hoopR), t: 0.38 }, airboxC);
      // A SPINE SIDE mark claims the flank band; culled ids leave panels alone.
      // Under wrap, trim aft tracks FLANK_SEEN so the pinstripe/hatch clear the mid-flank design.
      const sideMark = (liv.spineSide || "none") !== "none" && (!globalThis.LiveryTex || !LiveryTex.SPINE_SIDE_IDS || LiveryTex.SPINE_SIDE_IDS.includes(liv.spineSide));
      const trimAft = (sideMark && (liv.spineLogo || "logo") === "wrap"
        && typeof LiveryTex !== "undefined" && LiveryTex.FLANK_SEEN)
        ? LiveryTex.FLANK.zF - LiveryTex.FLANK_SEEN * LiveryTex.FLANK.zLen : 0;
      coverGeom = buildEngineCoverBodywork(out, coverC, accentC, engStyle, anchors, spineRise(liv.spineHeight), sideMark, trimAft);
      // Optional scoop lip on the roll-hoop mouth (recipe-gated; default 0).
      const scoopLip = Math.max(0, Math.min(2, Math.round((engStyle && engStyle.scoopLip) || 0)));
      if (scoopLip >= 1) {
        addBox(out, 0, 0.855, -0.265,
               0.27 * inScale, 0.032, 0.030, INTAKE);
      }
      if (scoopLip >= 2) {
        for (const s of [-1, 1]) {
          addBox(out, s * (0.115 * inScale), 0.835, -0.295,
                 0.045, 0.055, 0.055, CARBON);
        }
      }
      if (engSnork) {
        const sk = 0.78 + inScale * 0.32;
        const mouth = { z: -0.12, y: 0.96, w: 0.15 * sk, h: 0.10 * sk, t: 0.62 };
        const crest = { z: -0.38, y: 1.02, w: 0.12 * sk, h: 0.13 * sk, t: 0.55 };
        const merge = { z: -0.68, y: 0.88, w: 0.10 * sk, h: 0.09 * sk, t: 0.50 };
        addSpan(out, mouth, crest, airboxC, INTAKE);
        addBeveledSpan(out, crest, merge, 0.010, airboxC, null);
        addBox(out, 0, mouth.y + 0.01, mouth.z + 0.01,
               mouth.w * 0.72, mouth.h * 0.55, 0.04, INTAKE);
        if (scoopLip >= 1) {
          addBox(out, 0, mouth.y + mouth.h * 0.35, mouth.z + 0.02,
                 mouth.w * 0.88, 0.022, 0.028, CARBON);
        }
        const lf = anchors.coverAt(-0.80), lr = anchors.coverAt(-1.40);
        const lfY = coverProfile(lf).shoulder - 0.06, lrY = coverProfile(lr).shoulder - 0.06;
        for (const s of [-1, 1])
          addSpan(out,
            { z: lf.z, x: s*(coverFlankX(lf, lfY) + 0.004), y: lfY, w: 0.015, h: 0.10 },
            { z: lr.z, x: s*(coverFlankX(lr, lrY) + 0.004), y: lrY, w: 0.015, h: 0.10 }, CARBON);
      }
      // T-CAMERA POD. Every car on the grid carries one and the roll hoop was
      // bare without it — it is the highest point of the silhouette, so it is in
      // shot from every external camera and reads even at grid distance. Rides
      // on the hoop crown, which the snorkel raises by ~0.22 m, so both variants
      // anchor off the same computed top rather than a literal. Team-coloured
      // housing with a dark forward face: addSpan takes a separate front-cap
      // colour, so the lens costs no triangles of its own.
      const podY = (engSnork ? 1.085 : 0.76 + 0.10 * inScale) + 0.052;
      const podZ = engSnork ? -0.34 : -0.26;
      addBox(out, 0, podY - 0.048, podZ - 0.015, 0.028, 0.055, 0.030, CARBON, SURFACES.carbon);
      // Housing colour is the livery's T-CAM pick (tcamColour): the shipped
      // accent by default, or the real black / yellow driver code.
      addSpan(out, { z: podZ + 0.055, y: podY, w: 0.118, h: 0.056, t: 0.88 },
                   { z: podZ - 0.062, y: podY - 0.003, w: 0.101, h: 0.050, t: 0.82 },
              tcamColour(liv.tcam, opts && opts.teamId, opts && opts.num, accentC), [0.05, 0.05, 0.06]);
      addBox(out, 0, podY + 0.002, podZ + 0.062, 0.052, 0.026, 0.012,
             [0.02, 0.02, 0.03], SURFACES.metal);   // lens boss on the front face
      // T-CAMERA BAR — the horizontal wing of the T. Shares podY/podZ with the
      // housing: a literal at the C12.4.1 blade (y 0.955 in part("helmet")) left
      // the bar ~15 cm under every snorkel pod (McLaren factory |barY−podY| =
      // 0.182). Bodywork, not driver — draw it whether or not a helmet is in.
      addBox(out, 0, podY - 0.010, podZ, 0.30, 0.055, 0.06, DARK);
      addBox(out, 0, podY + 0.023, podZ, 0.03, 0.02, 0.03, [0.12, 0.75, 0.28], SURFACES.paint);

      const engOutlet = engStyle && engStyle.outlet != null ? engStyle.outlet
                      : (engT === 2 ? 2 : engT === 0 ? 0 : 1);
      if (engOutlet >= 1) {
        for (const s of [-1, 1]) {
          if (engOutlet === 3) {
            const cp = anchors.coverAt(-1.42);
            const cx = s * (cp.x * 0.72), cy = coverSurfaceY(cp, cx);   // rooted at the shoulder
            addSpan(out,
              { z: -1.34, x: cx, y: cy - 0.02, w: 0.085, h: 0.040, t: 0.80 },
              { z: -1.50, x: cx, y: cy + 0.04, w: 0.055, h: 0.095, t: 0.65 },
              CARBON);
            addBox(out, cx, cy + 0.095, -1.44, 0.042, 0.016, 0.070, INTAKE);
          } else {
            const n = engOutlet === 2 ? 4 : 2;
            for (let i = 0; i < n; i++) {
              const gf = anchors.coverAt(-1.13), gr = anchors.coverAt(-1.47);
              const gfY = coverProfile(gf).shoulder - 0.02 - i*0.040, grY = coverProfile(gr).shoulder - 0.02 - i*0.040;
              addSpan(out,
                { z: gf.z, x: s*(coverFlankX(gf, gfY) + 0.008), y: gfY, w: 0.02, h: 0.018 },
                { z: gr.z, x: s*(coverFlankX(gr, grY) + 0.008), y: grY, w: 0.02, h: 0.018 },
                engOutlet === 2 ? DARK : CARBON);
            }
          }
        }
        // Central hot-air vent slot at the tail of the cover (broad-cooling specs).
        if (engOutlet >= 2) addBox(out, 0, coverGeom.tailVentY, -1.72, 0.13, 0.05, 0.18, INTAKE);
      }
      const servicePanels = Math.max(0, Math.min(4, Math.round(engStyle.servicePanel || 0)));
      // With a SPINE SIDE mark on the flank the panels move aft of it: a grey
      // hatch through the race number is the one thing a real livery never
      // shows. A hatch is DETAIL, not content, so where both want a station the
      // HATCH moves — aft of trimAft, which under a wrap is where the rear tyre
      // covers the flank anyway: it still reads from hero/top/rear, a sponsor
      // name only from the side. The flank ends at z -1.90, so that start fits
      // three hatches, not a fourth hung off the back of the bodywork.
      const pz0 = trimAft ? trimAft - 0.065 : sideMark ? -1.36 : -0.82;
      const pdz = sideMark ? 0.15 : 0.19, pn = Math.min(servicePanels, trimAft ? 3 : 4);
      for (const s of [-1, 1]) for (let i = 0; i < pn; i++) {
        const z = pz0 - i * pdz, p = anchors.coverAt(z);
        // Sunk to COVER_STACK.flankTrim: a hatch is a panel line, not a blister,
        // and the drape has to run over it. At 19 mm it stands PROUD of the
        // flank decal, a grey rectangle through any full-flank design.
        addBox(out, s*(coverFlankX(p, p.top - 0.18) + COVER_STACK.flankTrim - 0.009), p.top - 0.18, z,
          0.018, 0.10, 0.13, [0.24,0.24,0.27], SURFACES.metal);
      }
      if (engStyle.heatShield) {
        const p = anchors.coverAt(-1.58);
        // No wider than the flat crown, or its edges hang over the shoulders,
        // and no taller than COVER_STACK.shield — the livery drape goes over it.
        const sh = 0.014;
        addBox(out, 0, p.top + COVER_STACK.shield - sh / 2, -1.58,
          Math.min(0.18 * engStyle.heatShield, 1.9 * COVER_CROWN * p.x),
          sh, 0.30, [0.30,0.28,0.26], SURFACES.metal);
      }
      // Team-style DORSAL FIN along the engine-cover ridge: 1 = low blade,
      // 2 = tall blade. A SECONDARY ridge blade distinct from the sharkFin
      // tail plate below (which every non-cockpit car carries). Body-colour
      // plate with an accent crest line — a strong per-team silhouette tell
      // from chase and TV cameras. Starts behind the snorkel zone (z −0.95)
      // so the two never intersect. Garage/near: rounded loft so the ridge
      // is not a square plank where it meets the rear wing (Cadillac et al.).
      if (teamStyle.fin) {
        const finH = teamStyle.fin >= 2 ? 0.19 : 0.095;
        const ff = anchors.coverAt(-0.95), fr = anchors.coverAt(-1.85);
        const bladeF = { z: ff.z, y: ff.top + finH * 0.5, w: 0.016, h: finH };
        const bladeR = { z: fr.z, y: fr.top + finH * 0.33, w: 0.014, h: finH * 0.66 };
        const crestF = { z: ff.z, y: ff.top + finH + 0.006, w: 0.020, h: 0.014 };
        const crestR = { z: fr.z, y: fr.top + finH * 0.66 + 0.005, w: 0.018, h: 0.012 };
        if (_round && _coverHi) {
          CarShade.loft(out, bladeF, bladeR, c1, addTri, { n: 10 });
          CarShade.loft(out, crestF, crestR, accentC, addTri, { n: 8 });
        } else {
          addSpan(out, bladeF, bladeR, c1);
          addSpan(out, crestF, crestR, accentC);
        }
      }
      // Engine-spec identification dots across the airbox intake lip.
      const engLed = engT === 2 ? [0.95, 0.22, 0.10] : engT === 0 ? [0.12, 0.82, 0.38] : [0.90, 0.62, 0.12];
      for (const lx of [-0.06, 0, 0.06])
        addBox(out, lx, 0.868, -0.30, 0.02, 0.014, 0.02, engLed, SURFACES.metal);
      // FUEL: per-option filler cap colour. Rooted on the cover skin the same
      // way the tank breather is — literals at y 0.795/0.828/0.85 left the
      // collar floating ~13 cm over a short cover and buried under a tall one.
      const fuelColor = fuelStyle ? fuelStyle.cap : (tier("fuel") === 2 ? [0.95, 0.28, 1.5] : [0.55, 0.52, 0.60]);
      const fuelDisplay = fuelColor.map((value) => Math.min(value, 1));
      const fuelX = 0.12, fuelZ = -0.50;
      const fy = coverSurfaceY(anchors.coverAt(fuelZ), fuelX);
      addBox(out, fuelX, fy - 0.018, fuelZ, 0.075, 0.05, 0.12, [0.10, 0.10, 0.12], SURFACES.carbon);   // housing
      const fuelSurface = SURFACES.metal;
      addBox(out, fuelX, fy + 0.015, fuelZ, 0.10,  0.02, 0.15, fuelDisplay, fuelSurface);            // collar ring (proud)
      addBox(out, fuelX, fy + 0.037, fuelZ, 0.035, 0.03, 0.05, fuelDisplay, fuelSurface);            // cap dot
      const fuelFiller = Math.max(0, Math.min(2, Math.round(fuelStyle.filler || 0)));
      if (fuelFiller >= 1) {
        const fuelPorts = [{ x: fuelX, z: fuelZ, s: 1 }];
        if (fuelFiller >= 2) fuelPorts.push({ x: fuelX, z: -0.66, s: 0.85 });
        for (const p of fuelPorts) {
          const s = p.s;
          const py = coverSurfaceY(anchors.coverAt(p.z), p.x);
          addBeveledSpan(out,
            { z: p.z + 0.082 * s, x: p.x, y: py - 0.001, w: 0.108 * s, h: 0.036 * s, t: 0.88 },
            { z: p.z - 0.086 * s, x: p.x, y: py - 0.015, w: 0.060 * s, h: 0.022 * s, t: 0.70 },
            0.007 * s, [0.10, 0.10, 0.12], null, SURFACES.carbon);
          addBox(out, p.x, py + 0.055, p.z, 0.042 * s, 0.028 * s, 0.042 * s,
                 [0.22, 0.22, 0.24], fuelSurface);
          addBox(out, p.x, py + 0.073, p.z, 0.050 * s, 0.010 * s, 0.050 * s,
                 fuelDisplay, fuelSurface);
          const r = 0.016 * s, capY = py + 0.081, n = 6;
          const ctr = [p.x, capY, p.z];
          for (let i = 0; i < n; i++) {
            const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
            addTri(out, ctr,
              [p.x + Math.cos(a1) * r, capY, p.z + Math.sin(a1) * r],
              [p.x + Math.cos(a0) * r, capY, p.z + Math.sin(a0) * r],
              [0.06, 0.06, 0.07], SURFACES.carbon);
          }
        }
        if (fuelFiller >= 2) {
          addSpan(out,
            { z: fuelZ, x: 0.02, y: fy + 0.032, w: 0.018, h: 0.018 },
            { z: fuelZ, x: 0.02, y: fy + 0.132, w: 0.014, h: 0.014 },
            fuelDisplay, null, fuelSurface);
          addBox(out, 0.02, fy + 0.143, fuelZ, 0.016, 0.012, 0.016, fuelDisplay, fuelSurface);
        }
      }
      const fuelHatch = Math.max(0, Math.min(1, Math.round(fuelStyle.hatch || 0)));
      if (fuelHatch) {
        const lift = fuelFiller >= 1 ? 0.055 : 0.028;
        const hy0 = coverSurfaceY(anchors.coverAt(-0.40), fuelX);
        const hy1 = coverSurfaceY(anchors.coverAt(-0.58), fuelX);
        addSpan(out,
          { z: -0.40, x: fuelX, y: hy0 + 0.059, w: 0.108, h: 0.012, t: 0.92 },
          { z: -0.58, x: fuelX, y: hy1 + 0.059 + lift, w: 0.096, h: 0.010, t: 0.88 },
          [0.08, 0.08, 0.09], null, SURFACES.carbon);
        addBox(out, fuelX, hy0 + 0.057, -0.405, 0.092, 0.010, 0.016,
               [0.24, 0.24, 0.26], SURFACES.metal);
      }
      const fuelVent = Math.max(0, Math.min(1, Math.round(fuelStyle.vent || 0)));
      if (fuelVent) {
        addSpan(out,
          { z: fuelZ, x: 0.205, y: fy + 0.032, w: 0.016, h: 0.016 },
          { z: fuelZ, x: 0.205, y: fy + 0.117, w: 0.012, h: 0.012 },
          fuelDisplay, null, fuelSurface);
        addBox(out, 0.205, fy + 0.127, fuelZ, 0.014, 0.012, 0.014,
               [0.10, 0.10, 0.12], SURFACES.carbon);
      }
      // Tank breather across the spine from the filler (filler x +0.12, vent
      // x +0.205 — the breather mirrors at -0.185 so nothing overlaps):
      // 0 none / 1 sunk NACA duct / 2 duct + overflow standpipe.
      const fuelBreather = Math.max(0, Math.min(2, Math.round(fuelStyle.breather || 0)));
      if (fuelBreather > 0) {
        const cb = anchors.coverAt(-0.56), cbY = coverSurfaceY(cb, 0.185);   // on the shoulder facet
        addBox(out, -0.185, cbY + 0.004, -0.56, 0.052, 0.012, 0.085, INTAKE);
        addBox(out, -0.185, cbY + 0.012, -0.61, 0.058, 0.006, 0.020, CARBON, SURFACES.carbon);
        if (fuelBreather >= 2) {
          addSpan(out,
            { z: -0.62, x: -0.185, y: cbY + 0.010, w: 0.014, h: 0.014 },
            { z: -0.62, x: -0.185, y: cbY + 0.078, w: 0.011, h: 0.011 },
            fuelDisplay, null, fuelSurface);
          addBox(out, -0.185, cbY + 0.088, -0.62, 0.016, 0.012, 0.016,
                 [0.10, 0.10, 0.12], SURFACES.carbon);
        }
      }
      if (fuelStyle.line) {
        const lineFront = anchors.coverAt(-0.56);
        const lineRear = anchors.coverAt(-1.30);
        const ly = coverSurfaceY(lineFront, fuelX);
        addSpan(out,
          { z: -0.56, x: fuelX, y: ly - 0.011, w: 0.018 * fuelStyle.line, h: 0.018 },
          { z: -1.30, x: coverFlankX(lineRear, lineRear.top - 0.15) + 0.006, y: lineRear.top - 0.15,
            w: 0.015 * fuelStyle.line, h: 0.015 },
          fuelDisplay, null, fuelSurface);
      }
    }

    // SPONSOR BOARD. The titleA wordmark is podDecal(R.titleA, 0.32, 0.80), so
    // the board must cover yFrac 0.32..0.80 — centre 0.56, height 0.48 x pod
    // height (the fracH=true call below). A board shorter than its decal spills
    // the glyph tops and tails onto the body paint, forcing one ink to serve a
    // pale board and the paint at once — which is why 70% of liveries once fell
    // back to a halo; the fractional sizing keeps the mark WHOLLY on the board
    // at every station so liverytex can ink it for that one colour.
    // Sized in POD FRACTIONS so each band tracks the taper and nothing overlaps:
    // the accent band holds the strip (yFrac 0.08..0.30), the board holds titleA
    // (0.32..0.80), and the accentC flash below sits at 0.88 with its lower edge
    // no deeper than 0.8195 at any station. Clean gaps at every station.
    // PANEL is a fixed pale grey and in cockpit the board carries NO decal
    // (drawCarDecals swaps in the nose-number quad), so it is a bare light
    // panel on the near plane. Its sibling flash is !ckpt-gated; this was not.
    // External keeps it — it is the substrate titleA is inked on.
    if (!ckpt) addPodFlankSpan(0.46, -0.34, 0.56, 0.48, PANEL, null, 0.008, true);
    addPodFlankSpan(0.46, -0.34, 0.19, 0.22, c2, null, 0.008, true);

    // ERS: a color-coded ENERGY-CELL strip on the coke-bottle shoulder, plus a
    // recipe-gated 2026 hybrid tell: pack blister and/or HV conduit run.
    // Runs ABOVE the sponsor band (titleA y 0.19–0.45) so it never washes the wordmark.
    const ersLed = ersStyle ? ersStyle.led : (tier("ers") === 2 ? ersC2 : null);
    const ersPack = ersStyle ? ersStyle.pack : 1.0;
    const ersGlow = ersLed
      ? ersLed.map((value) => Math.min(value, 1))
      : [1.00, 0.42, 0.08];
    if (ersLed) {
      const half = 0.16 + (ersPack - 0.9) * 0.09;
      addPodFlankSpan(podGeom.conduit.z + half + 0.025, podGeom.conduit.z - half - 0.025,
                      0.91, 0.06, [0.03, 0.03, 0.04], SURFACES.carbon, 0.018);
      addPodFlankSpan(podGeom.conduit.z + half, podGeom.conduit.z - half,
                      0.97, 0.03, ersGlow, SURFACES.metal, 0.025);
      const cells = Math.max(1, Math.min(8, Math.round(ersStyle.cells || 3)));
      for (const side of [-1, 1]) for (let i = 0; i < cells; i++) {
        const z = podGeom.conduit.z + half - (i + 0.5) * (half * 2 / cells);
        const p = anchors.podAt(z);
        addBox(out, side*(p.x + 0.032), p.top + 0.006, z,
          0.016, 0.032, Math.max(0.025, half * 1.5 / cells),
          ersGlow, SURFACES.metal);
      }
    }
    const ersBlister = Math.max(0, Math.min(2, Math.round((ersStyle && ersStyle.blister) || 0)));
    if (ersBlister > 0 && !ckpt) {
      const bS = 0.92 + 0.18 * Math.max(0, ersPack - 1);
      for (const side of [-1, 1]) {
        const z0 = ersBlister >= 2 ? -0.78 : -0.84;
        const z1 = ersBlister >= 2 ? -1.28 : -1.12;
        const pf = anchors.coverAt(z0), pr = anchors.coverAt(z1);
        // The blister rides the shoulder facet: its y is the skin's at 0.52x.
        addBeveledSpan(out,
          { z: z0, x: side * (pf.x * 0.52), y: coverSurfaceY(pf, pf.x * 0.52) + 0.010 * bS,
            w: 0.090 * bS, h: 0.032 * bS, t: 0.78 },
          { z: z1, x: side * (pr.x * 0.52), y: coverSurfaceY(pr, pr.x * 0.52) + 0.006 * bS,
            w: 0.068 * bS, h: 0.022 * bS, t: 0.70 },
          0.007, CARBON);
        const nSlot = ersBlister >= 2 ? 2 : 1;
        for (let i = 0; i < nSlot; i++) {
          const z = z0 - 0.06 - i * 0.14;
          const p = anchors.coverAt(z);
          addBox(out, side * (p.x * 0.52), coverSurfaceY(p, p.x * 0.52) + 0.026 * bS, z,
            0.055 * bS, 0.010, 0.036, INTAKE);
        }
        if (ersBlister >= 2) {
          const p = anchors.coverAt(z1 + 0.04);
          addBox(out, side * (p.x * 0.50), coverSurfaceY(p, p.x * 0.50) + 0.018 * bS, z1 + 0.02,
            0.040 * bS, 0.016, 0.028, INTAKE);
        }
      }
    }
    const ersConduit = Math.max(0, Math.min(2, Math.round((ersStyle && ersStyle.conduit) || 0)));
    if (ersConduit > 0 && !ckpt) {
      const cables = ersConduit >= 2 ? 2 : 1;
      for (const side of [-1, 1]) {
        const pod = anchors.podAt(-0.62);
        const c0 = anchors.coverAt(-0.82);
        const cMid = anchors.coverAt(-1.22);
        const c2e = anchors.coverAt(-1.68);
        for (let k = 0; k < cables; k++) {
          const yo = k * -0.028;
          const xo = k * 0.010 * side;
          const pPack = [side * (pod.x + 0.022 + xo), pod.top + 0.018 + yo, -0.62];
          // Cables run the flank just under the shoulder crease, on the skin.
          const eY = coverProfile(c0).shoulder - 0.02 + yo, mY = coverProfile(cMid).shoulder - 0.02 + yo,
                kY = coverProfile(c2e).shoulder - 0.02 + yo;
          const pEnter = [side * (coverFlankX(c0, eY) + 0.016 + xo), eY, c0.z];
          const pMid = [side * (coverFlankX(cMid, mY) + 0.016 + xo), mY, cMid.z];
          const pK = [side * (coverFlankX(c2e, kY) + 0.014 + xo), kY, c2e.z];
          addBeamBetween(out, pPack, pEnter, 0.022, ersGlow, SURFACES.metal);
          addBeamBetween(out, pEnter, pMid, 0.020, ersGlow, SURFACES.metal);
          addBeamBetween(out, pMid, pK, 0.018, ersGlow, SURFACES.metal);
        }
        addBox(out, side * (pod.x + 0.028), pod.top + 0.014, -0.62,
          0.030, 0.028, 0.038, [0.10, 0.10, 0.12], SURFACES.carbon);
        addBox(out, side * (c2e.x + 0.018), c2e.top - 0.038, c2e.z,
          0.026, 0.032, 0.040, [0.10, 0.10, 0.12], SURFACES.carbon);
        if (ersConduit >= 2) {
          for (let i = 0; i < 2; i++) {
            const z = -0.96 - i * 0.28;
            const p = anchors.coverAt(z);
            addBox(out, side * (p.x + 0.022), p.top - 0.050, z,
              0.028, 0.036, 0.044, [0.10, 0.10, 0.12], SURFACES.carbon);
          }
        }
      }
    }
    // Pack cooling mouth on the pod shoulder ahead of the energy-cell strip:
    // 0 none / 1 low NACA lip / 2 lip + louvre grille behind it.
    const ersIntake = Math.max(0, Math.min(2, Math.round((ersStyle && ersStyle.coolerIntake) || 0)));
    if (ersIntake > 0 && !ckpt) {
      for (const side of [-1, 1]) {
        const p = anchors.podAt(-0.30);
        addBox(out, side * (p.x - 0.02), p.top + 0.008, -0.30, 0.11, 0.016, 0.14, INTAKE);
        addBox(out, side * (p.x - 0.02), p.top + 0.020, -0.38, 0.12, 0.010, 0.030,
               CARBON, SURFACES.carbon);
        if (ersIntake >= 2) {
          for (let i = 0; i < 3; i++) {
            const z = -0.46 - i * 0.05, pl = anchors.podAt(z);
            addBox(out, side * (pl.x - 0.02), pl.top + 0.012, z, 0.10, 0.008, 0.028,
                   CARBON, SURFACES.carbon);
          }
        }
      }
    }

    part("bodyDetail");
    const engInlet = engStyle && engStyle.inlet != null ? engStyle.inlet
                   : (tier("engine") === 2 ? 2 : tier("engine") === 0 ? 0 : 1);
    for (const s of [-1, 1]) {
      const inlet = podGeom.inlet;
      if (engInlet === 0) {
        // Letterbox: the shallowest duct on the grid, and no lip at all.
        addInletMouth(out, s * inlet.x, inlet.y, inlet.z,
                      inlet.width * 0.75, inlet.height * 0.38, c1, 0.034, 0);
      } else if (engInlet === 2) {
        addInletMouth(out, s * inlet.x, inlet.y, inlet.z,
                      inlet.width * 0.92, inlet.height * 0.82, c1, 0.075, 0.016);
        // Splitter bar across the throat — a wide mouth needs one or it reads
        // as a missing panel rather than a radiator.
        addBox(out, s * inlet.x, inlet.y, inlet.z - 0.030,
               inlet.width * 0.86, 0.012, 0.014, CARBON, SURFACES.carbon);
      } else if (engInlet === 3) {
        for (const dx of [-1, 1])
          addInletMouth(out, s * (inlet.x + dx * inlet.width * 0.22), inlet.y, inlet.z,
                        inlet.width * 0.34, inlet.height * 0.88, c1, 0.060, 0.010);
      } else {
        // Reverse-P (2026 field majority): tall inboard stem, not a square scoop.
        addInletMouth(out, s * (inlet.x - inlet.width * 0.12),
                      inlet.y + inlet.height * 0.08, inlet.z,
                      inlet.width * 0.48, inlet.height * 0.88, c1, 0.055, 0.012);
      }
      const fenceN = Math.max(0, Math.min(6, Math.round(floorStyle.fences)));
      const fenceH = Math.max(0.6, Math.min(1.6, floorStyle.fenceH));
      const fenceStep = fenceN > 1 ? 1.08 / (fenceN - 1) : 0;
      // Floor fences sit outboard of the pod. Keep their tops under the
      // sponsor board (yFrac 0.32..0.80) so a side ray hits the board first
      // (body-split). TEAM_STYLE inlet/undercut can drop that band onto a
      // stock-height fence.
      const fenceCap = (z) => {
        const pod = anchors.podAt(z);
        return pod.bottom + 0.28 * (pod.top - pod.bottom);
      };
      const fenceFit = (y, h, cap) => {
        const top = y + h * 0.5;
        if (top <= cap) return { y, h };
        const room = Math.max(0.018, cap - (y - h * 0.5));
        return { y: cap - room * 0.5, h: room };
      };
      for (let i = 0; i < fenceN; i++) {
        const fz = 0.42 - i * fenceStep;
        const ex = floorEdgeAt(fz);
        const cap = fenceCap(fz);
        const a = fenceFit(0.152 + rideDY + 0.058 * fenceH, 0.132 * fenceH, cap);
        const b = fenceFit(0.168 + rideDY + 0.062 * fenceH, 0.145 * fenceH, cap);
        addSpan(out,
          { z: fz + 0.095, x: s * (ex + 0.014), y: a.y, w: 0.028, h: a.h },
          { z: fz - 0.095, x: s * (ex + 0.038), y: b.y, w: 0.022, h: b.h },
          CARBON);
      }
      const edgeLip = Math.max(0, Math.min(1, floorStyle.edgeLip || 0));
      if (edgeLip > 0) {
        const ef = floorEdgeAt(0.50), er = floorEdgeAt(-1.10);
        addSpan(out,
          { z: 0.50, x: s * (ef + 0.006), y: 0.080 + rideDY,
            w: 0.014, h: 0.038 + 0.022 * edgeLip },
          { z: -1.10, x: s * (er + 0.006), y: 0.094 + rideDY,
            w: 0.012, h: 0.034 + 0.020 * edgeLip },
          CARBON, null, SURFACES.carbon);
        addBeveledSpan(out,
          { z: 0.50, x: s * (ef + 0.030 + 0.048 * edgeLip), y: 0.118 + rideDY,
            w: 0.038 + 0.055 * edgeLip, h: 0.012 },
          { z: -1.10, x: s * (er + 0.028 + 0.042 * edgeLip), y: 0.138 + rideDY,
            w: 0.032 + 0.048 * edgeLip, h: 0.010 },
          0.004, accentC, null, SURFACES.paint);
      }
      if (Math.round(floorStyle.gurney || 0) > 0) {
        const er = floorEdgeAt(-1.10);
        addBox(out, s * (er + 0.028 + 0.042 * Math.max(0, edgeLip)), 0.154 + rideDY, -1.12,
               0.026, 0.024, 0.014, CARBON, SURFACES.carbon);
      }
      if (Math.round(floorStyle.scroll || 0) > 0) {
        const es = floorEdgeAt(-1.12), et = floorEdgeAt(-1.38);
        addSpan(out,
          { z: -1.08, x: s * (es + 0.010), y: 0.128 + rideDY, w: 0.022, h: 0.028 },
          { z: -1.38, x: s * (et + 0.016), y: 0.172 + rideDY, w: 0.018, h: 0.050 },
          CARBON, null, SURFACES.carbon);
      }
      const TI = [0.62, 0.60, 0.56];
      const skids = Math.max(0, Math.min(2, Math.round(floorStyle.skid || 0)));
      for (let i = 0; i < skids; i++) {
        const sz = 0.30 - i * 1.10;
        const z0 = sz + 0.16, z1 = sz - 0.16;
        addSpan(out,
          { z: z0, x: s * (floorEdgeAt(z0) - 0.09), y: 0.062 + rideDY, w: 0.20, h: 0.010 },
          { z: z1, x: s * (floorEdgeAt(z1) - 0.09), y: 0.062 + rideDY, w: 0.20, h: 0.010 },
          CARBON, null, SURFACES.carbon);
        addBox(out, s * (floorEdgeAt(sz) - 0.09), 0.050 + rideDY, sz, 0.145, 0.014, 0.22,
               TI, SURFACES.metal);
        for (const bz of [sz + 0.09, sz - 0.09]) {
          addBox(out, s * (floorEdgeAt(bz) - 0.012), 0.070 + rideDY, bz, 0.014, 0.008, 0.014,
                 [0.50, 0.48, 0.44], SURFACES.metal);
        }
      }
    }
    if (Math.round(floorStyle.plank || 0) > 0 && !ckpt) {
      const PLANK = [0.52, 0.40, 0.22];
      addSpan(out,
        { z: 0.58, x: 0, y: 0.038 + rideDY, w: 0.30, h: 0.012 },
        { z: -1.36, x: 0, y: 0.038 + rideDY, w: 0.28, h: 0.012 },
        PLANK, null, SURFACES.panel);
      addBox(out, 0, 0.036 + rideDY,  0.55, 0.30, 0.010, 0.08, [0.62, 0.60, 0.56], SURFACES.metal);
      addBox(out, 0, 0.036 + rideDY, -1.32, 0.28, 0.010, 0.08, [0.62, 0.60, 0.56], SURFACES.metal);
    }
    const engChimney = Math.max(0, Math.min(3, Math.round(engStyle.chimney || 0)));
    for (const s of [-1, 1]) for (let i = 0; i < engChimney; i++) {
      const z = -0.16 - i * 0.30, p = anchors.podAt(z);
      const cx = s * Math.max(0.16, p.x - 0.055);
      addSpan(out,
        { z: z + 0.048, x: cx, y: p.top + 0.016, w: 0.078, h: 0.028, t: 0.85 },
        { z: z - 0.048, x: cx, y: p.top + 0.068, w: 0.050, h: 0.078, t: 0.70 },
        CARBON);
      addBox(out, cx, p.top + 0.112, z - 0.012, 0.040, 0.014, 0.060, INTAKE);
    }
    const aDuct = Math.max(0, Math.min(2, Math.round((aeroStyle && aeroStyle.duct) || 0)));
    if (aDuct > 0 && !ckpt) {
      for (const s of [-1, 1]) {
        const p = anchors.podAt(0.18);
        const x = s * Math.max(0.22, p.x - 0.04);
        if (aDuct === 1) {
          addBox(out, x, p.top + 0.018, 0.20, 0.11, 0.026, 0.20, INTAKE);
        } else {
          addBeveledSpan(out,
            { z: 0.38, x: x, y: p.top + 0.042, w: 0.10, h: 0.052, t: 0.55 },
            { z: -0.02, x: s * Math.max(0.20, p.x - 0.08), y: p.top + 0.022, w: 0.08, h: 0.038, t: 0.70 },
            0.008, CARBON);
          addBox(out, x, p.top + 0.052, 0.36, 0.068, 0.020, 0.075, INTAKE);
        }
      }
    }

    part("livery");
    // Nose TIP z moves per team (TEAM_STYLE.noseTipZ, ±0.10): the cap and both
    // stripes must end at the STYLED tip, not a shared literal, or the paint
    // floats past a short nose (haas) / stops short of a long one (williams).
    // anchors.noseAt clamps y/w beyond the tip station, so only the z endpoints
    // need deriving. Every nose graphic below is now expressed as a distance
    // BEHIND the tip for the same reason the cap already was — the tip moved
    // 580 mm rearward when the nose was cut back to sit behind the front wing,
    // and a literal 2.70 would have painted a stripe in mid-air ahead of it.
    const styledTipZ = styledNoseStations(teamStyle)[0].z;
    const noseAccentRear = anchors.noseAt(1.60), noseAccentFront = anchors.noseAt(styledTipZ - 0.04);
    addLoft(out, 1.60, 0, noseAccentRear.top + 0.008, 0.09, 0.016,
           styledTipZ - 0.04, 0, noseAccentFront.top + 0.008, 0.05, 0.014, c2);
    // Spine accent along the ROLL-STRUCTURE crown, not the airbox roof it used
    // to lie on: the blade now occupies z -0.33..-0.63 and a flat band at
    // y 0.862 would be buried inside it. A span follows the crown's rearward
    // fall for the same twelve triangles the box cost.
    addSpan(out, { z: -0.28, y: 0.972, w: 0.060, h: 0.030 },
                 { z: -0.66, y: 0.944, w: 0.050, h: 0.026 }, c2);

    for (const s of [-1, 1]) {
      const nf = anchors.noseAt(styledTipZ - 0.12), nr = anchors.noseAt(2.025);
      addSpan(out,
        { z: nf.z, x: s*(nf.side + 0.006), y: (nf.bottom + nf.top) * 0.5, w: 0.012, h: 0.040 },
        { z: nr.z, x: s*(nr.side + 0.006), y: (nr.bottom + nr.top) * 0.5, w: 0.012, h: 0.040 },
        accentC);
    }
    // NOSE RUNNING LIGHTS — a pair of HDR white markers on the nose flanks just
    // behind the tip, plus a thin bar across the crown. NOT a regulation part:
    // real cars carry no nose DRL, and the only mandated lamp is the rear rain
    // light modelled elsewhere. This is a styling read — the >1 albedo blooms at
    // night and gives the car a forward-facing signature at grid distance.
    // Restored, not invented. The original pass placed it at literal z 2.62 and
    // 2.70; the tip is now styledTipZ (~2.60) after the nose was cut back 580 mm,
    // so those literals sit AHEAD of the car and the geometry was silently lost.
    // Re-expressed off noseAt() like every other nose graphic here, which is also
    // what lets the drlNoseMaxGap assertion mean something.
    // glass, never SURFACES.emissive: id 25 is functionalEmissive, contractually
    // RESERVED for the rain light (parts-physics "reserves emissive surfaces for
    // the FIA rain light" treats any other position as an offender), and paint is
    // capped at albedo <= 1, which a 2.4 white is not. A lens is the honest class.
    if (!ckpt) {
      const drlC = [2.4, 2.4, 2.7];
      for (const s of [-1, 1]) {
        const n = anchors.noseAt(styledTipZ - 0.14);
        addBox(out, s * (n.side + 0.005), n.bottom + (n.top - n.bottom) * 0.42, n.z,
               0.014, 0.026, 0.028, drlC, SURFACES.glass);
      }
      const drlBar = anchors.noseAt(styledTipZ - 0.05);
      addBox(out, 0, drlBar.top + 0.005, drlBar.z, 0.13, 0.010, 0.020, drlC, SURFACES.glass);
    }
    if (!ckpt) addPodFlankSpan(0.425, -0.025, 0.88, 0.035, accentC, SURFACES.paint, 0.012);

    const stripeC = _ckAcc(liv.stripe) || null;   // monocoque crest runs z 0.05..1.05 — right under the eye
    const stripeTipZ = styledTipZ - 0.04;
    const stripeMidZ = (1.55 + stripeTipZ) * 0.5;   // the taper waypoint, halfway up the styled nose
    if (stripeC) {
      const ns314 = anchors.noseAt(stripeTipZ), ns270 = anchors.noseAt(stripeMidZ);
      const ns155 = anchors.noseAt(1.55), ns105 = anchors.noseAt(1.05);
      addLoft(out, stripeMidZ, 0, ns270.top + 0.012, 0.075, 0.014,
             stripeTipZ, 0, ns314.top + 0.012, 0.040, 0.012, stripeC);
      addLoft(out, 1.55, 0, ns155.top + 0.012, 0.13, 0.016,
             stripeMidZ, 0, ns270.top + 0.012, 0.075, 0.014, stripeC);
      // CHASE ONLY, exactly as the hood's accent stripe above: these two runs
      // start at z 0.05 — 0.25 m from the eye, AT the near plane — then go 1.5 m
      // down the centre of the view at 0.12 m wide. Measured 739 of 24045 view
      // rays, yaw -13..13 pitch -35..-9, wholly inside the WHEEL'S own window,
      // so they foreshorten into a slab across it instead of reading as a
      // stripe; _ckAcc only makes it grey. The nose run below (1.55 → tip) is
      // 1.75 m out and under 4 deg, and stays. Guard: cockpit-crest-stripe.
      if (!ckpt) addLoft(out, 1.05, 0, ns105.top + 0.012, 0.12, 0.016,
             1.55, 0, ns155.top + 0.012, 0.13, 0.016, stripeC);
      if (!ckpt) addLoft(out, 0.05, 0, 0.655, 0.12, 0.022, 1.05, 0, 0.545, 0.13, 0.022, stripeC);   // monocoque → hood crest
      if (!ckpt) addSpan(out, { z: -0.27, y: 0.984, w: 0.080, h: 0.020 },
                              { z: -0.67, y: 0.954, w: 0.070, h: 0.018 }, stripeC);  // spine band over the roll structure
      if (!ckpt) {
        addLoft(out, -0.94, 0, 0.775, 0.075, 0.02, -0.64, 0, 0.948, 0.07, 0.02, stripeC); // roll structure → cover ridge drop
        addLoft(out, -1.95, 0, 0.600, 0.060, 0.02, -0.94, 0, 0.775, 0.075, 0.02, stripeC); // engine-cover ridge run to the tail
      }
    }
    const noseStripeC = _ckAcc(liv.noseStripe) || null;
    if (noseStripeC) {
      const ns155 = anchors.noseAt(1.55), ns270 = anchors.noseAt(stripeMidZ), ns314 = anchors.noseAt(stripeTipZ);
      addLoft(out, 1.55, 0, ns155.top + 0.016, 0.115, 0.014,
             stripeMidZ, 0, ns270.top + 0.016, 0.064, 0.012, noseStripeC);
      addLoft(out, stripeMidZ, 0, ns270.top + 0.016, 0.064, 0.012,
             stripeTipZ, 0, ns314.top + 0.016, 0.036, 0.010, noseStripeC);
    }

    if (noseC) {
      const capRearZ = styledTipZ - 0.38;
      const nt = anchors.noseAt(styledTipZ), nb = anchors.noseAt(capRearZ);
      const capF = { z: styledTipZ + 0.005, y: (nt.bottom + nt.top) * 0.5, w: nt.side*2 + 0.010, h: nt.top - nt.bottom + 0.010, t: 0.70 };
      const capR = { z: capRearZ, y: (nb.bottom + nb.top) * 0.5, w: nb.side*2 + 0.010, h: nb.top - nb.bottom + 0.010, t: 0.86 };
      // Rounded nose (CarShade): the cap wraps it at the nose's own taper instead of poking square corners past it.
      if (_round) CarShade.capLoft(out, capF, capR, nt, nb, noseC, addTri); else addSpan(out, capF, capR, noseC);
    }
    // Proud 0.006 keeps the pod panel UNDER the sponsor board (0.008): a board is
    // applied over the paint, not buried by it. At 0.016 the panel sat proud of
    // the board and covered it, so on every pod-set livery the sidepod wordmark
    // was actually sitting on the pod colour while being inked for the board.
    if (podC) addPodFlankSpan(0.45, 0.11, 0.60, 0.22, podC, SURFACES.paint, 0.006);

    const deckF = anchors.noseAt(2.15), deckR = anchors.noseAt(1.69), deckW = (a) => Math.min(0.28, a.topSide*1.75);
    const deckY = (a) => a.top + 0.010 - (_round ? CarShade.sink(a, deckW(a) / 2) : 0);   // rounded nose: edges seat on the skin
    addLoft(out, deckR.z, 0, deckY(deckR), deckW(deckR), 0.018, deckF.z, 0, deckY(deckF), deckW(deckF), 0.018, c1);
    const camPod = anchors.noseAt(1.55);
    addBox(out, 0, camPod.top + 0.045, 1.55, 0.06, 0.08, 0.15, DARK);

    if (bodySplitLR) applyBodySplit(out, bodySplitFrom, out.pos.length / 3, c1, c2); else if (liv.lower && !ckpt && !(opts && opts.silhouette) && typeof CarShade !== "undefined") CarShade.lowerZone(out, bodySplitFrom, out.pos.length / 3, c1, liv.lower, anchors, SURFACES.paint);   // two-tone body (CarShade.lowerZone)

    part("cockpit");
    // Exterior head surround stays out of the dedicated driver-eye mesh.
    if (!ckpt) {
      // Recipe-gated HEADREST behind the helmet: 0 flat rim (shipped) / 1 raised
      // horseshoe pad / 2 winged pad. Front face stays behind the helmet dome
      // (centre z -0.075, r 0.145 -> rear extent -0.220); pad tops stay under
      // the airbox intake underside (y 0.715). Rounded builds draw the whole
      // recipe as CarShade pipes (no stacked addBox cushions).
      const headrest = Math.max(0, Math.min(2, Math.round(cockpitStyle.headrest || 0)));
      const PAD = [0.08, 0.08, 0.10];
      if (_round) {
        CarShade.headrest(out, headrest === 0 ? DARK : PAD, addTri,
                          headrest === 0 ? null : SURFACES.carbon, headrest);
      } else {
        addBox(out, 0, 0.74, -0.18, 0.60, 0.06, 0.07, DARK); // rear hoop (flat build)
        if (headrest === 1) {
          addBox(out, 0, 0.655, -0.30, 0.34, 0.075, 0.10, PAD, SURFACES.carbon);
          for (const s of [-1, 1])
            addBox(out, s * 0.20, 0.645, -0.16, 0.06, 0.065, 0.24, PAD, SURFACES.carbon);
        } else if (headrest === 2) {
          addBox(out, 0, 0.665, -0.31, 0.36, 0.095, 0.11, PAD, SURFACES.carbon);
          for (const s of [-1, 1]) {
            addBox(out, s * 0.21, 0.675, -0.22, 0.05, 0.075, 0.16, PAD, SURFACES.carbon);
            addBox(out, s * 0.215, 0.700, -0.13, 0.04, 0.028, 0.10, PAD, SURFACES.carbon);
          }
        }
      }
    }
    if (!exHalo && opts && opts.halo) {
      const faired = opts.halo === 4;
      const hk = faired || opts.halo === true ? 1 : [0, 0.64, 1, 1.44][Math.max(1, Math.min(3, opts.halo | 0))];
      const path = haloHoopPath(0.30,0.765,-0.80,0.28,0.18,faired?1.10:1.045,0.62,faired?24:10);
      const hc = haloTint || (faired ? CARBON : HALO);
      if (faired) {
        const start=out.pos.length/3;
        // Broad carbon roof; underside curves smoothly into the central Y.
        // Swept crown rises toward the nose so its upper edge reads level
        // from the seat, instead of projecting as a deep U over the road.
        for (const p of path) p[1] = Math.max(0.765,0.82 + 0.39*(p[2]+0.20) - 0.028);
        const rings = path.map((p,i) => {
          const a=path[Math.max(0,i-1)], b=path[Math.min(path.length-1,i+1)];
          const dx=b[0]-a[0], dz=b[2]-a[2], len=Math.hypot(dx,dz);
          const nx=-dz/len*0.038, nz=dx/len*0.038;
          const low=p[1]-0.035*Math.max(0,p[2]+0.20)/0.82-0.15*Math.exp(-p[0]*p[0]/0.0081);
          return [[p[0]+nx,p[1]+0.028,p[2]+nz],[p[0]-nx,p[1]+0.028,p[2]-nz],
            [p[0]-nx,low,p[2]-nz],[p[0]+nx,low,p[2]+nz]];
        });
        for(let i=0;i<rings.length-1;i++)for(let j=0;j<4;j++)
          addQuad(out,rings[i][j],rings[i+1][j],rings[i+1][(j+1)%4],rings[i][(j+1)%4],hc,SURFACES.carbon);
        smoothSkin(out,start);
        for(const i of [0,rings.length-1]) { const q=i===0?rings[i].slice().reverse():rings[i]; addQuad(out,q[0],q[1],q[2],q[3],hc,SURFACES.carbon); }
      } else { // Visor refs: lower nearby side crown; apex and rear mounts stay fixed.
        for(const p of path) p[1]-=0.055*Math.min(1,Math.max(0,(p[2]+0.80)/0.98))*Math.pow(Math.abs(p[0])/0.28,2);
        const start=out.pos.length/3;
        addTube(out,path,0.029*hk,10,hc,SURFACES.carbon);
        for(let i=start;i<out.pos.length/3;i++) out.pos[i*3+1]=path[Math.floor((i-start)/10)][1]+(out.pos[i*3+1]-path[Math.floor((i-start)/10)][1])*0.64;
        smoothSkin(out,start);
      }
      // Carbon fairing: a narrow stem blending into a broad Y at the crown.
      const stem = faired ? [[0.67,0.014,0.026],[0.90,0.018,0.025],[0.95,0.026,0.028],
        [1.00,0.045,0.031],[1.05,0.077,0.034],[1.10,0.135,0.036]]
        : [[0.67,0.014,0.026],[0.93,0.018,0.025],[1.059,0.060,0.031]];
      const stemStart=out.pos.length/3;
      for (let i=0;i<stem.length-1;i++) {
        const ring = (v) => [[-v[1]*hk,v[0],0.62-v[2]*hk],[v[1]*hk,v[0],0.62-v[2]*hk],
          [v[1]*hk,v[0],0.62+v[2]*hk],[-v[1]*hk,v[0],0.62+v[2]*hk]];
        const a=ring(stem[i]), b=ring(stem[i+1]);
        for (let j=0;j<4;j++) addQuad(out,a[j],b[j],b[(j+1)%4],a[(j+1)%4],hc,SURFACES.carbon);
      }
      smoothSkin(out,stemStart);
    }
    // Shared exterior centreline for the fairing and part("halo") below.
    const haloSty = Math.max(0, Math.min(2, Math.round(cockpitStyle.halo || 0)));
    const hr = haloSty === 1 ? 0.024 : 0.028;
    const crownY = 0.845 - (haloSty === 1 ? 0.008 : 0);
    const hoop = exHalo ? haloHoopPath(0.235, 0.505, -0.46, 0.30, 0.02, crownY, 0.49) : null, hoopT = hoop && _round ? CarShade.fine(hoop, 3) : hoop;   // rounded: a spline through it
    const haloBlade = Math.max(0, Math.min(2, Math.round(exHalo ? cockpitStyle.haloBlade || 0 : 0)));
    if (haloBlade > 0) {
      const bladeC = haloTint || HALO;
      // Co-axial fairing follows the hoop's curve, 8–11 mm proud (no coplanar faces).
      if (haloBlade === 1) {
        // Low fairing: shoulders + crown bar only (path pts 3..11 of 15).
        addTube(out, _round ? CarShade.fine(hoop, 3, 3, 12) : hoop.slice(3, 12), hr + 0.008, _round ? 12 : 6, bladeC, SURFACES.metal);
      } else {
        // Full shroud: the whole hoop, plus the centre spine riding clear of
        // the fatter tube.
        addTube(out, hoopT, hr + 0.011, _round ? 12 : 6, bladeC, SURFACES.metal);
        addBeveledSpan(out,
          { z: 0.50, x: 0, y: 0.904, w: 0.083, h: 0.032, t: 0.50 },
          { z: 0.30, x: 0, y: 0.892, w: 0.050, h: 0.027, t: 0.55 },
          0.008, bladeC, null, SURFACES.metal);
      }
    }
    if (cockpitStyle.haloWing && exHalo) {
      const wingC = haloTint || HALO;
      addBeveledSpan(out,
        { z: 0.18, x: 0, y: 0.875, w: 0.32, h: 0.016, t: 0.50 },
        { z: -0.02, x: 0, y: 0.868, w: 0.24, h: 0.012, t: 0.42 },
        0.005, wingC, null, SURFACES.metal);
      for (const s of [-1, 1]) {
        addBox(out, s * 0.155, 0.872, 0.08, 0.010, 0.028, 0.10, wingC, SURFACES.metal);
      }
    }
    const camPods = Math.max(0, Math.min(2, Math.round(exHalo ? cockpitStyle.camPods || 0 : 0)));
    for (let i = 0; i < camPods; i++) {
      const s = i === 0 ? -1 : 1;
      addBeamBetween(out,
        [s * 0.11, 0.760, -0.20],
        [s * 0.12, 0.812, -0.14],
        0.014, DARK);
      addBox(out, s * 0.12, 0.818, -0.118, 0.030, 0.026, 0.042, DARK);
      addBox(out, s * 0.12, 0.818, -0.094, 0.016, 0.014, 0.008, VISOR, SURFACES.glass);
    }
    if (cockpitStyle.screen && exHalo) {
      addLoft(out, 0.48, 0, 0.655, 0.40, 0.028,
                   0.62, 0, 0.720, 0.20, 0.022, DARK);
      addLoft(out, 0.495, 0, 0.668, 0.34, 0.018,
                   0.605, 0, 0.710, 0.16, 0.014, VISOR, SURFACES.glass);
      for (const s of [-1, 1]) {
        addLoft(out, 0.50, s * 0.16, 0.690, 0.10, 0.020,
                     0.58, s * 0.06, 0.730, 0.06, 0.016, DARK);
      }
    }

    part("mirrors");
    const mSty = ckpt ? 0 : teamStyle.mirror;
    // Placement is REGULATION (docs/notes/COCKPIT-DATUMS.md): the body must lie inside
    // RV-MIRROR-BODY, Y 470..680 x Z 640..720. At x 0.44 / y 0.735 ours sat
    // inboard of that volume AND above its ceiling — reported as "floating".
    const mz = ckpt ? 0.92 : 0.24;
    const mScale = Math.max(0.85, Math.min(1.35, cockpitStyle.mirror || 1));
    const mx = ((ckpt ? 0.60 : 0.34) + (mSty === 1 ? 0.035 : 0)) * mScale;
    const msx = (ckpt ? 0.54 : 0.30) * mScale;
    const mY = (ckpt ? 0.780 : 0.735) + (mSty === 2 ? -0.032 : 0);
    const mW = mSty === 1 ? 0.235 : 0.215;   // swept style: wider housing
    const mH = mSty === 1 ? 0.065 : 0.075;
    for (const s of [-1, 1]) {
      // Tapered aero arm (wide at the tub, narrow at the housing) instead of a
      // flat box — real F1 mirror stalks are swept aero elements, not a plain post.
      // C3.7.5: the Inner Stay "must intersect Mirror Body and Mid Chassis". The
      // ckpt root is BURIED in the crown (a start at 0.68 is 17 cm above it,
      // attached to nothing). Move the crown and this must move with it.
      const xi = s * (msx - 0.04), xo = s * mx;
      const sB = ckpt ? 0.655 : 0.68;    // root buried in the cockpit shoulder
      const sR = ckpt ? 0.025 : 0.04;    // rise: must span crown -> housing underside
      const aY = mY - (ckpt ? 0.780 : 0.735);   // style drop carries into the stalk too
      const stalkTop = ckpt ? mY - mH / 2 + 0.006 : sB + sR*1.5 + aY;
      const stalkZ = mz + (ckpt ? 0.025 : 0); // tuck the stay behind the glass
      addBlock(out, [
        [xi, sB + aY, mz - (ckpt ? 0.026 : 0.045)], [xi, sB + aY, mz + (ckpt ? 0.026 : 0.045)], [xi, sB + sR + aY, mz + (ckpt ? 0.026 : 0.045)], [xi, sB + sR + aY, mz - (ckpt ? 0.026 : 0.045)],
        [xo, (ckpt ? stalkTop-0.016 : sB+sR*.75+aY), stalkZ - (ckpt ? 0.012 : 0.020)], [xo, (ckpt ? stalkTop-0.016 : sB+sR*.75+aY), stalkZ + (ckpt ? 0.012 : 0.020)],  [xo, stalkTop, stalkZ + (ckpt ? 0.012 : 0.020)], [xo, stalkTop, stalkZ - (ckpt ? 0.012 : 0.020)],
      ], DARK);
      // Glass goes on the face TOWARD the viewer (-z). At mz+0.066 it sits
      // 8 mm BEYOND the housing's own back face, and the driver AND the chase
      // camera see carbon, never the reflective surface.
      // Housing as an 8-corner block with the outboard face pulled BACK in z —
      // the C14.2.2 d i inboard toe (~25°): real mirrors angle at the driver,
      // and the cant is what stops the housing reading as a shoebox.
      const toe = ckpt ? 0.030 : 0.045;
      const hy0 = mY - mH / 2, hy1 = mY + mH / 2;
      const xIn = s * (mx - mW / 2), xOut = s * (mx + mW / 2);
      (_round ? (o, q, c, f, sf) => CarShade.housing(o, q, c, addTri, sf) : addBlock)(out, [
        [xIn, hy0, mz - 0.03], [xOut, hy0, mz - 0.03 + toe], [xOut, hy1, mz - 0.03 + toe], [xIn, hy1, mz - 0.03],
        [xIn+s*(ckpt ? 0.018 : 0), hy0+(ckpt ? 0.008 : 0), mz + 0.03], [xOut-s*(ckpt ? 0.018 : 0), hy0+(ckpt ? 0.008 : 0), mz + 0.03 + toe], [xOut-s*(ckpt ? 0.018 : 0), hy1-(ckpt ? 0.008 : 0), mz + 0.03 + toe], [xIn+s*(ckpt ? 0.018 : 0), hy1-(ckpt ? 0.008 : 0), mz + 0.03],
      ], [0.09, 0.09, 0.11], null, SURFACES.carbon);
      // Recessed glass and carbon bezel share the housing's cant. A flat
      // glass box on a swept housing reads as a detached grey rectangle.
      const face = (inset, z, depth) => {
        const xi=xIn+s*inset, xo=xOut-s*inset, y0=hy0+inset, y1=hy1-inset;
        const zi=z+toe*inset/mW, zo=z+toe*(1-inset/mW);
        return [[xi,y0,zi],[xo,y0,zo],[xo,y1,zo],[xi,y1,zi],
          [xi,y0,zi+depth],[xo,y0,zo+depth],[xo,y1,zo+depth],[xi,y1,zi+depth]];
      };
      if (ckpt) {
        addBlock(out,face(0.004,mz-0.035,0.006),[0.035,0.04,0.045],null,SURFACES.carbon);
        addBlock(out,face(0.012,mz-0.038,0.003),[0.38,0.40,0.42],null,SURFACES.mirror);
      } else {
        if (_round) addBlock(out,face(0.010,mz-0.036,0.008),[0.10,0.11,0.14],null,SURFACES.glass); else addBox(out,s*mx,mY,mz-0.032,mW*0.97,mH*0.80,0.012,[0.10,0.11,0.14],SURFACES.glass);
        if (_round) addBlock(out,face(0.018,mz-0.039,0.004),[0.46,0.56,0.78],null,SURFACES.glass); else addBox(out,s*mx,mY,mz-0.038,0.200,0.050,0.008,[0.46,0.56,0.78],SURFACES.glass);   // rounded: glass canted with the housing
      }
      if (!ckpt) {
        // Top winglet + the C3.7.5 OUTER stay down to the tub shoulder — the
        // two details every 2026 housing carries.
        addBox(out, s*mx, hy1 + 0.008, mz + 0.01, mW * 0.9, 0.008, 0.055, DARK, SURFACES.carbon);
        addBeamBetween(out, [s * (mx + mW * 0.38), hy0, mz + 0.02],
                            [s * (msx + 0.06), 0.60, mz + 0.10], 0.012, DARK, SURFACES.carbon);
      }
    }

    part("driver");
    // A DRIVER, not a floating head. The aperture was the right size and still
    // did not read as a cockpit, because a cockpit reads as an OCCUPIED SPACE:
    // a hole with one helmet hovering in it is a hole. Shoulders rising out of
    // the seat, arms reaching forward and a wheel under the hands are what say
    // "someone is sitting in there" — three shapes, 0 textures, and they do
    // more for the look than every millimetre of rim geometry did.
    // Sized off the opening rather than styled: the coaming abreast of the
    // driver sits at ~0.626 and the seat floor at 0.47, so the shoulders top
    // out at 0.585 — 4 cm proud of the floor's far side and 4 cm UNDER the
    // rail, which is what leaves a visible gap of tub either side instead of
    // a shoulder line jammed against the coaming. Half-width 0.145 against an
    // opening half-width of 0.184 keeps the suit clear of the rails.
    // EXTERIOR ONLY. The first-person build draws the driver's own wheel
    // (getCockpitWheel) and must not also carry a torso, which would sit in
    // the camera; noDriver drops the lot for the studio's empty-car shots.
    // `silhouette` is the shadow-caster path: the torso sits inside the tub
    // so it cannot change a sun/lamp silhouette, and paying for it on a
    // depth map is wasted fill.
    const sil = !!(opts && opts.silhouette);
    if (!ckpt && !(opts && opts.noDriver) && !sil) {
      // The suit takes the TEAM ACCENT, as a real one does. A neutral dark suit
      // was invisible: it sat in a dark liner inside a shadowed well and the
      // whole occupant read as more black smudge, which is the failure this
      // geometry exists to fix. Dimmed so a white accent (ferrari c2 is
      // [1,1,1]) does not read as a pale slab in the cockpit sweep.
      const SUIT = [c2[0] * 0.62 + 0.05, c2[1] * 0.62 + 0.05, c2[2] * 0.62 + 0.05];
      const GLOVE = [0.07, 0.07, 0.08];
      // torso: seat floor to shoulder, tapering forward into the chest
      addLoft(out, -0.22, 0, 0.5275, 0.290, 0.115,
                    0.00, 0, 0.5225, 0.250, 0.105, SUIT, SURFACES.carbon);
      // arms out to the wheel, and the wheel under them
      for (const sgn of [-1, 1]) {
        addBeamBetween(out, [sgn * 0.112, 0.556, -0.045], [sgn * 0.086, 0.508, 0.170],
                       0.046, SUIT, SURFACES.carbon);
        addBox(out, sgn * 0.086, 0.505, 0.178, 0.052, 0.055, 0.050, GLOVE, SURFACES.carbon);
      }
      // The wheel is a 2026 YOKE, not a rim: a flat squared-off crossbar with a
      // boss, which is what the hands above are holding.
      addBox(out, 0, 0.508, 0.192, 0.230, 0.052, 0.028, DARK, SURFACES.carbon);
      addBox(out, 0, 0.512, 0.206, 0.086, 0.062, 0.022, [0.14, 0.15, 0.17], SURFACES.carbon);
    }

    part("helmet");
    if (!(opts && opts.noDriver)) {
      // The driver's head: helmets.js owns the lid. cy is the TEMPLE line. At
      // 0.630 the crown sat at 0.749 under a cockpit surround topping out at
      // 0.765 — the head was BELOW the tub, and a design nobody can see is the
      // defect this module exists to fix. 0.715 clears it by 82 mm, and still
      // passes 43 mm under the halo at 0.890.
      const des = Helmets.designFor(opts && opts.num, c1, helmetKey(opts));
      // Paint-edge splits (~+2k tris on busy lids) matter when the helmet is
      // large on screen (player body, garage, cockpit). Field AI bodies are
      // tens of pixels; depth silhouettes never see paint. Both drop to 0.
      const field = !!(opts && opts.field);
      Helmets.build(out, 0, 0.715, -0.075, des, {
        paint: SURFACES.paint, glass: SURFACES.visor,
        maxSplit: (sil || field) ? 0 : undefined, simplePaint: sil || field,
      });
      // No boxes bolted on here: the rear gurney, top intake and visor strip are
      // lofts on the shell itself (helmets.js buildAero), built with the lid.
    }

    // NOT in the first-person build: it spans z -0.305..-0.175 and y 0.715..
    // 0.805, so against a driver's eye at (0.72, -0.20) its front face is 2.5 cm
    // from the camera and it straddles the eye line. Measured via the engine's
    // own occlusion raster: `player` 20.4% of the frame at distM 0.2 — this box
    // was the dark mass across the view, and the thing "cutting" the wheel.
    if (!ckpt) addBox(out, 0, 0.76, -0.24, 0.15, 0.09, 0.13, INTAKE);

    // T-camera bar + LED live next to the snorkel-aware pod in part("engineCover").

    part("halo");
    if (exHalo) {
      const haloC = haloTint || HALO, haloS = haloTint && Math.max(...haloTint) - Math.min(...haloTint) > 0.15 ? SURFACES.paint : SURFACES.metal;   // a COLOURED livery hoop is paint (Alpine pink: the metal env mirror washed it white); grey stays metal (titanium, Cadillac chrome)
      // Round titanium hoop with a LEVEL, gently arched top bar: one
      // continuous tube, collars (±0.235, 0.505, -0.46) rising to a crown
      // that holds y 0.845 (+HALO_RISE shallow arch) from mid to mid while
      // sweeping to the front apex (z 0.49) — round in plan, never peaking or
      // dipping toward the centre. r 0.028 keeps the square-section outer
      // envelope the haloBlade/haloWing/camPods attachments above were placed
      // against, so they land on the hoop. haloSty/hr/crownY and the hoop path itself
      // (haloHoopPath(0.235, 0.505, -0.46, 0.30, 0.02, crownY, 0.49)) are
      // computed once beside the blade fairing above, which wraps the SAME
      // centreline as a co-axial tube.
      // Front centre pillar rises to y 0.83 — overlapping the flat bar's
      // underside (0.845 - 0.028 = 0.817) by ~1.3 cm, never stopping short.
      if (_round) CarShade.strut(out, [0, 0.53, 0.47], [0, 0.83, 0.47], 0.05, 0.035, haloC, addTri, haloS, { taper: 0.8, n: 10 }); else addBox(out, 0, 0.68, 0.47, 0.035, 0.30, 0.05, haloC, haloS);
      addTube(out, hoopT, hr, _round ? 12 : 6, haloC, haloS);
      // The real strut SPLITS into a V at the top, meeting the ring at two
      // points either side of the apex — the wishbone silhouette head-on.
      for (const s of [-1, 1])
        addBeamBetween(out, [0, 0.775, 0.468], [s * 0.105, crownY - hr * 0.4, 0.474],
                       0.015, haloC, haloS);
      if (haloSty === 2) {
        // Fenced hoop: three small crest vanes riding the crown bar (hoop
        // indices 5/7/9 = mid-left, apex, mid-right of the 7-point bar).
        for (const hi of [5, 7, 9]) {
          const p = hoop[hi];
          addBox(out, p[0], p[1] + hr + 0.012, p[2], 0.012, 0.026, 0.055,
                 haloC, haloS);
        }
      }
    }

    part("exhaust");
    // Tip radius for the rain light. Cockpit: cheap stub (!ckpt has full tips).
    let exhTipRForLamp = 0.07;
    const exhTwin = exhStyle.pipes != null ? exhStyle.pipes >= 3
      : (engStyle ? !!engStyle.twin : tier("engine") === 2);
    if (ckpt) {
      addTube(out, [[0, 0.40, -2.04], [0, 0.40, -2.20]], 0.07, 6,
              [0.16, 0.16, 0.17], SURFACES.metal);
    } else {
    const exhBore = Math.max(0.7, Math.min(1.5, exhStyle.bore));
    // Floor the BASE radius for twins, then scale by bore — clamping after bore
    // collapsed hyper_scav (1.30) onto sig_audi_exh (1.133) at 0.095.
    const exhBase = engStyle ? (engStyle.twin ? 0.09 : (engStyle.in < 0.9 ? 0.05 : 0.07))
                          : (tier("engine") === 0 ? 0.05 : tier("engine") === 2 ? 0.09 : 0.07);
    const exhR = (exhTwin ? Math.max(exhBase, 0.076) : exhBase) * exhBore;
    const fuelFlame = fuelStyle && fuelStyle.flame || [1.15, 0.42, 0.14];
    const fTwin = [fuelFlame[0]*0.9, fuelFlame[1]*0.9, fuelFlame[2]*0.9];
    const exhMetal = [0.16, 0.16, 0.17], exhFlareC = [0.18, 0.18, 0.19];
    const glazeOf = (rgb) => rgb.map((value) => Math.min(value * 0.45, 0.65));
    const exhDia = (cx, cy, z, r) => [
      [cx, cy - r, z], [cx + r, cy, z], [cx, cy + r, z], [cx - r, cy, z],
    ];
    const EXH_OUT = 0.34;
    // Twins low beside the crash structure; single tip in the rain-light cavity.
    const EXH_Y = exhTwin ? 0.40 : 0.50;
    const heatOf = (c) => { const g = glazeOf(c);
      return [exhMetal[0]*0.55+g[0]*0.45, exhMetal[1]*0.55+g[1]*0.45, exhMetal[2]*0.55+g[2]*0.45]; };
    const tipZ = exhTwin ? -2.55 : -2.58;   // at/behind rain-light plane
    const exits = exhTwin ? [-EXH_OUT, EXH_OUT] : [0];
    const tipRShow = exhTwin ? exhR : Math.max(exhR * 1.35, 0.095);
    if (exhTwin) {
      addTube(out, [[0, EXH_Y, -2.00], [0, EXH_Y, -2.10]], exhR * 0.55, 8,
              exhMetal, SURFACES.metal);
    }
    for (const cx of exits) {
      if (exhTwin) {
        const s = Math.sign(cx) || 1;
        addTube(out, [[s * 0.08, EXH_Y, -2.05], [cx, EXH_Y, -2.30]], exhR * 0.85, 8,
                exhMetal, SURFACES.metal);
        addTube(out, [[cx, EXH_Y, -2.28], [cx, EXH_Y, tipZ]], exhR, 8,
                exhMetal, SURFACES.metal);
      } else {
        addTube(out, [[0, EXH_Y, -2.04], [0, EXH_Y, tipZ]], tipRShow * 0.85, 8,
                exhMetal, SURFACES.metal);
      }
      const flame = exhTwin ? fTwin : fuelFlame, rPipe = tipRShow;
      addTube(out, [[cx, EXH_Y, tipZ + 0.10], [cx, EXH_Y, tipZ + 0.01]],
              rPipe * 1.08, 8, heatOf(flame), SURFACES.metal);
      addStationLoft(out, [
        exhDia(cx, EXH_Y, tipZ + 0.08, rPipe),
        exhDia(cx, EXH_Y, tipZ, rPipe * 1.08),
      ], exhMetal, null, SURFACES.metal);
      addBox(out, cx, EXH_Y, tipZ + 0.008, rPipe * 1.55, rPipe * 1.55, 0.018,
             [0.05, 0.04, 0.04], SURFACES.carbon);
      addBox(out, cx, EXH_Y, tipZ - 0.004, rPipe * (exhTwin ? 1.25 : 1.05),
             rPipe * (exhTwin ? 1.25 : 1.05), 0.014, glazeOf(flame), SURFACES.metal);
    }
    if (exhTwin && (exhStyle.wastegate || 0) >= 1) {
      addBox(out, 0, EXH_Y + exhR + 0.055, tipZ + 0.02, EXH_OUT * 2.05, 0.028, 0.045,
             exhMetal, SURFACES.metal);
    }
    const exhFlare = Math.max(0, Math.min(1, exhStyle.flare || 0));
    if (exhFlare > 0) {
      // Megaphone open rim at the rear face (no solid tip — keeps the rain light).
      const flareMul = exhTwin ? 0.55 : 1.15;
      for (const cx of exits) {
        const tip = tipRShow * (1 + flareMul * exhFlare);
        const z0 = tipZ + 0.08, z1 = tipZ + 0.005;
        addStationLoft(out, [exhDia(cx, EXH_Y, z0, tipRShow), exhDia(cx, EXH_Y, z1, tip)],
                       exhFlareC, null, SURFACES.metal);
        addStationLoft(out, [exhDia(cx, EXH_Y, z1, tip * 1.05), exhDia(cx, EXH_Y, z1 - 0.012, tip * 1.12)],
                       [0.22, 0.22, 0.24], null, SURFACES.metal);
      }
    }
    if (exhStyle.wrap) {
      for (const cx of exits) {
        addBox(out, cx, EXH_Y, -2.10, exhR * 1.18, exhR * 1.18, 0.06,
               [0.72, 0.70, 0.66], SURFACES.panel);
        addBox(out, cx, EXH_Y, -2.06, exhR * 1.24, exhR * 1.12, 0.045,
               [0.68, 0.66, 0.62], SURFACES.panel);
        if (!exhTwin) {
          addBox(out, 0, EXH_Y, -1.96, exhR * 1.14, exhR * 1.22, 0.045,
                 [0.74, 0.72, 0.67], SURFACES.panel);
          addBox(out, 0, EXH_Y, -2.02, exhR * 1.30, 0.012, 0.012,
                 [0.22, 0.22, 0.24], SURFACES.metal);
        }
      }
    }
    const exhGates = Math.max(0, Math.min(2, Math.round(exhStyle.wastegate || 0)));
    for (let i = 0; i < exhGates; i++) {
      const s = i === 0 ? -1 : 1;
      const gx = exhTwin ? s * (EXH_OUT * 0.55) : s * 0.075;
      const tipX = exhTwin ? s * EXH_OUT * 0.72 : s * 0.098;
      addSpan(out, { z: -2.02, x: gx, y: 0.47, w: 0.036, h: 0.036 },
                   { z: tipZ + 0.06, x: tipX, y: 0.53, w: 0.030, h: 0.030 },
              [0.20, 0.20, 0.22], null, SURFACES.metal);
      addBox(out, tipX, 0.535, tipZ + 0.05, 0.034, 0.034, 0.028,
             [0.22, 0.22, 0.24], SURFACES.metal);
      addBox(out, tipX, 0.535, tipZ + 0.032, 0.020, 0.020, 0.012,
             glazeOf(fTwin), SURFACES.metal);
    }
    const exhLip = Math.max(0, Math.min(2, Math.round(exhStyle.lip || 0)));
    if (exhLip >= 1) {
      for (const cx of exits) {
        const colR = exhR * (1 + (exhTwin ? 0.18 : 0.22) * exhLip);
        addBox(out, cx, EXH_Y, tipZ + (exhTwin ? 0.14 : 0.22),
               colR * (exhTwin ? 2.0 : 2.15), colR * (exhTwin ? 2.0 : 2.15),
               exhTwin ? 0.06 : 0.09, CARBON, SURFACES.carbon);
        if (!exhTwin) {
          addBox(out, 0, EXH_Y, tipZ + 0.16, colR * 1.95, colR * 1.95, 0.03,
                 [0.20, 0.20, 0.22], SURFACES.metal);
        }
      }
    }
    if (exhLip >= 2 && !exhTwin) {
      const colR = exhR * 1.44;
      addBox(out, 0, EXH_Y, tipZ + 0.28, colR * 2.35, colR * 2.35, 0.06, CARBON, SURFACES.carbon);
    }
    if (exhStyle.shield) {
      for (const cx of exits) {
        addBox(out, cx, EXH_Y + tipRShow + 0.028, tipZ + (exhTwin ? 0.16 : 0.22),
               Math.max(exhTwin ? 0.10 : 0.12, tipRShow * (exhTwin ? 2.4 : 2.6)), 0.010,
               exhTwin ? 0.14 : 0.16, [0.32, 0.30, 0.28], SURFACES.metal);
        if (!exhTwin) {
          for (const s of [-1, 1]) {
            addBox(out, s * (tipRShow + 0.022), EXH_Y + tipRShow * 0.45, tipZ + 0.22,
                   0.010, tipRShow * 1.05, 0.13, [0.28, 0.26, 0.24], SURFACES.metal);
          }
        }
      }
    }
    exhTipRForLamp = tipRShow * (exhFlare > 0 && !exhTwin ? (1 + 1.15 * exhFlare) : 1);
    }

    part("sharkFin");
    // liv.finShape picks the outline (FIN_SHAPES); "none" builds no blade at
    // all, and car-mesh reads the same field to leave the decal off too.
    const finShape = liv.finShape || "standard";
    if (!ckpt && finShape !== "none") {
      const F = finOf(finShape);
      const fb = F.halfBase, ft = F.halfTop;
      // The base follows the engine cover in BOTH directions — sharkFinRoot(),
      // the same function car-mesh places the decal from, so the graphic cannot
      // be left behind by a crown that moved. (Lowering only costs 113 mm of the
      // panel inside the cover on every shipped dorsal car.)
      const fRoot = sharkFinRoot(anchors, aeroStyle && aeroStyle.fin, finShape);
      const bLE = fRoot.bLE, bTE = fRoot.bTE;
      const root = (z, y0) => {
        const c = anchors.coverAt(z);
        return c && c.top != null ? c.top - 0.010 : y0;
      };
      // Blade height. The fin is 12 triangles carrying the largest flat plate at
      // the highest point on the car, so this is the cheapest silhouette on the
      // whole body — and it had no recipe at all.
      const tp = finTop(aeroStyle && aeroStyle.fin, finShape);
      addBlock(out, [
        [-fb, bLE, F.baseLE[0]], [fb, bLE, F.baseLE[0]],
        [ft, tp, F.topLE[0]],    [-ft, tp, F.topLE[0]],
        [-fb, bTE, F.baseTE[0]], [fb, bTE, F.baseTE[0]],
        [ft, tp, F.topTE[0]],    [-ft, tp, F.topTE[0]],
      ], finC);
      if (F.step) {
        // The lower rear section of a stepped fin, scaled about the base line
        // by the same aero factor as the blade so the step stays proportional.
        const S = F.step, f = Math.max(0.55, Math.min(1.45, (aeroStyle && aeroStyle.fin) || 1));
        const tp2 = F.baseTE[1] + (S.top - F.baseTE[1]) * f;
        const bTE2 = root(S.baseTE[0], S.baseTE[1]);
        addBlock(out, [
          [-fb, bTE, F.baseTE[0]],   [fb, bTE, F.baseTE[0]],
          [ft, tp2, F.baseTE[0]],    [-ft, tp2, F.baseTE[0]],
          [-fb, bTE2, S.baseTE[0]],  [fb, bTE2, S.baseTE[0]],
          [ft, tp2, S.baseTE[0] + 0.03], [-ft, tp2, S.baseTE[0] + 0.03],
        ], finC);
      }
    }
    // COVER VENTS (liv.coverVents; ids in COVER_VENT_IDS). Dark carbon boxes just
    // proud of the cover — a decal would need an atlas region the flanks lack.
    const vents = liv.coverVents || "none";
    if (!ckpt && vents === "gills") {
      for (const s of [-1, 1]) for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) {
        const z = -0.98 - i * 0.11, p = anchors.coverAt(z);
        if (!p) continue;
        const gy = coverProfile(p).shoulder - 0.025 - r * 0.045;   // on the flank, under the crease
        addBox(out, s * (coverFlankX(p, gy) + 0.006), gy, z, 0.012, 0.014, 0.075, CARBON, SURFACES.carbon);
      }
    } else if (!ckpt && vents === "spine") {
      // Along the ridge where it is FREE — of the fin root AND of the crest decal
      // (car-mesh maps REGIONS.crest onto z -0.62..-1.28): the first cut ran the
      // slot straight through the horse, measured in the studio. A full-chord fin
      // roots at z -0.65, so only the short gap behind the airbox is open; with a
      // stub or no fin and no spine crest the bare ridge ahead of the root takes
      // a long slot (the AMR24 look); with no fin but a crest it sits behind the
      // crest. Nowhere else is honest, so nowhere else is offered.
      const finRootZ = finShape === "none" ? -1.70 : finOf(finShape).baseLE[0];
      const crestOn = (liv.spineLogo || "logo") !== "none";
      let zc = -0.56, len = 0.14;
      if (!crestOn && finRootZ < -1.0) { len = Math.min(0.5, (-0.66 - finRootZ) - 0.06); zc = -0.69 - len / 2; }
      else if (crestOn && finShape === "none") { zc = -1.47; len = 0.30; }
      const p = anchors.coverAt(zc);
      // Sunk to COVER_STACK.vent: a slot is a hole, so it sits UNDER the drape.
      const vh = 0.008;
      if (p) addBox(out, 0, p.top + COVER_STACK.vent - vh / 2, zc, 0.05, vh, len, CARBON, SURFACES.carbon);
    }

    part("sponsorBoard");
    const aeroT = tier("aero");
    const aLvl = aeroStyle && aeroStyle.lvl != null
      ? aeroStyle.lvl : (aeroT === 0 ? 0 : aeroT === 2 ? 4 : 2);
    const ws = wingOf(teamStyle);
    out.flapInfo = { aLvl, style: Object.assign({}, aeroStyle, { wingStyle: ws }), col: wingCol, finish: liv.finish };

    const nb = numberBoard(aLvl, aeroStyle);
    for (const s of [-1, 1]) {
      addBox(out, s*0.527, nb.cy, -2.42, 0.012, nb.h, 0.30, c1);
    }

    part("frontWing");
    // COCKPIT-ONLY front wing. The real cascade below is correct and, from a
    // seated eye, invisible: MEASURED 12.9 deg below the sightline, which is
    // UNDER the hood crest (9.8), so it rasterised 0.01% of frame. The
    // first-person body is its own mesh, so it carries its own wing where the
    // driver can see it — 8.5 deg down, between nose deck (7.1) and hood
    // crest. View-only by design; the chase car's wing is untouched.
    // Rastered at canvas res it lands at x 228..615, y 226..313 of 844x390 —
    // on screen, below centre, and still hard to see: 20208 px alone, 6901
    // surviving (bolsters 9029, hood 2214, mirrors 1526), in the flap colour
    // against a dark surround. So the plane takes the PRIMARY livery colour
    // and rises to 0.47 (8.0 deg down, just under the nose deck's 7.1).
    if (ckpt) {
      addBox(out, 0, 0.47, 2.30, 1.62, 0.040, 0.44, c1, SURFACES.paint);
      for (const s of [-1, 1])
        addBox(out, s*0.84, 0.55, 2.30, 0.035, 0.20, 0.48, wingCol, wingSurf);
    }
    const aBeam = aeroStyle ? (aeroStyle.beam || 0) : (aeroT === 2 ? 1 : 0);
    const aDrs  = aeroStyle ? (aeroStyle.drs  || 0) : 0;
    const frontSweep = Math.max(-0.08, Math.min(0.22, aeroStyle.frontSweep));
    const frontTaper = Math.max(0.72, Math.min(1.08, aeroStyle.frontTaper));
    const frontRise = Math.max(-0.03, Math.min(0.16, aeroStyle.frontRise));

    const fwHalf = frontHalf(aLvl);               // half-span (endplate sits just outside)
    const fwElems = frontCascade(aLvl);
    const fwBaked = frontBakedCount(aLvl);
    for (let i = 0; i < fwBaked; i++) {
      const e = fwElems[i], half = fwHalf * e[4], extra = wingFoilOf(ws, i);
      addWingFoil(out, {
        zLead: e[0], yLead: e[1], zTrail: e[2], yTrail: e[3],
        half, thick: e[5], taper: frontTaper,
        sweep: frontSweep * (0.75 + i * 0.10),
        rise: frontRise * (0.65 + i * 0.12) + extra.tipRise,
        attachHalf: fwHalf + 0.03,
        twist: extra.twist, teCurve: extra.teCurve, chordTaper: extra.chordTaper,
      }, i === 0 ? c1 : wingCol, i === 0 ? SURFACES.paint : wingSurf);
    }
    const aPlate = Math.max(0, Math.min(3, Math.round(
      aeroStyle.plate != null ? aeroStyle.plate : 1)));
    // The plate table and its placement live at module scope (frontPlateGeom):
    // the decal mesh reads the same numbers, or it floats.
    const _fp = frontPlateGeom(aLvl, aeroStyle), PLATE = _fp.P;
    const aArch = aeroStyle.arch != null
      ? Math.max(0, Math.min(1, Math.round(aeroStyle.arch))) : (PLATE.arch || 0);
    const aGill = aeroStyle.gill != null
      ? Math.max(0, Math.min(4, Math.round(aeroStyle.gill))) : (aPlate >= 2 ? 3 : 0);
    const aCasc = Math.max(0, Math.min(3, Math.round(aeroStyle.casc != null ? aeroStyle.casc
      : (aLvl >= 4 ? 3 : (aLvl >= 3 ? 2 : (aLvl >= 1 ? 1 : 0))))));
    for (const s of [-1, 1]) {
      const epW = _fp.w;
      // The plate's LEADING edge stays flush with the foil tip (attachHalf =
      // fwHalf + 0.03) — that is the one place the two actually meet. What was
      // wrong is the outboard `kick` on the trailing station: real endplates are
      // near-parallel to the centreline and win their outwash from the shape of
      // the tip, not by leaning 120 mm out of the car. Clamp it to whatever room
      // CAR_HALF leaves once the plate's own thickness is paid for.
      const epX = s * _fp.front.x;
      const epKick = _fp.kick;
      const archN = ws.arch != null ? ws.arch : (aArch ? 1 : 0.45);
      const bevel = Math.min(0.014, epW * 0.28);
      addBeveledSpan(out,
        { z: 2.66, x: epX, y: 0.135, w: epW, h: PLATE.hF, t: _fp.front.t },
        { z: 2.30, x: epX + s*epKick*0.42, y: 0.190 + archN * 0.008, w: epW * 0.93,
          h: (PLATE.hF + PLATE.hR) * 0.5 + archN * 0.038, t: 0.70 },
        bevel, c2);
      addBeveledSpan(out,
        { z: 2.30, x: epX + s*epKick*0.42, y: 0.190 + archN * 0.008, w: epW * 0.93,
          h: (PLATE.hF + PLATE.hR) * 0.5 + archN * 0.038, t: 0.70 },
        { z: 1.98, x: epX + s*epKick, y: 0.245, w: epW * 0.88, h: PLATE.hR, t: _fp.rear.t },
        bevel, c2);
      const footW = Math.min(PLATE.footW * (ws.foot || 1), (CAR_HALF - Math.abs(epX) - 0.02) * 2);
      addBox(out, epX - s * (footW * 0.08), 0.034, 2.50, footW * 0.92, 0.016, 0.50, CARBON);
      addBeveledSpan(out,
        { z: 2.58, x: epX + s * (footW * 0.20), y: 0.050, w: 0.032, h: 0.022, t: 0.55 },
        { z: 2.14, x: epX + s * (footW * 0.14 + epKick * 0.25), y: 0.058, w: 0.028, h: 0.030, t: 0.70 },
        0.005, CARBON);
      addBeveledSpan(out,
        { z: 2.58, x: s * (fwHalf * 0.52), y: 0.058, w: 0.012, h: 0.050, t: 0.50 },
        { z: 2.20, x: s * (fwHalf * 0.70), y: 0.066, w: 0.010, h: 0.044, t: 0.68 },
        0.005, CARBON);
      // ARCH and GILL were welded to the plate tier: an arch existed only on
      // plate 2 and gills only on plate >= 2, so four plate profiles were four
      // fixed combinations rather than a plate crossed with two choices. Null
      // keeps every shipped recipe exactly where it was.
      addBeveledSpan(out,
        { z: 2.62, x: epX + s*0.010, y: 0.135 + PLATE.hF * 0.5 + archN * 0.028, w: 0.032, h: 0.020 },
        { z: 2.06, x: epX + s*(epKick + 0.010), y: 0.245 + PLATE.hR * 0.46, w: 0.028, h: 0.016 },
        0.006, aArch ? c1 : CARBON);
      if (aGill > 0) {
        // GILLS. The rear endplate has had its louvre stack for ages; the
        // front plate — the one a chase camera actually fills the frame with —
        // had a blank outboard face. Recessed slots, proud of the plate so they
        // read as cuts rather than z-fighting decals.
        for (let i = 0; i < aGill; i++) {
          const gz = 2.42 - i * 0.15;
          addBox(out, epX + s * (epKick * 0.55 + 0.010), 0.185 + PLATE.hF * 0.30 + i * 0.026, gz,
                 0.014, 0.020, 0.11, INTAKE, SURFACES.carbon);
        }
      }
      if (aPlate >= 2) {
        // FILLET at the plate-to-main-plane junction: the hard 90 deg corner
        // there is the last unfaired intersection on the front wing. This one
        // IS a property of the plate, so it stays on the plate tier.
        addBeveledSpan(out,
          { z: 2.60, x: epX - s * 0.030, y: 0.150, w: 0.060, h: 0.030, t: 0.35 },
          { z: 2.26, x: epX - s * 0.026, y: 0.178, w: 0.050, h: 0.024, t: 0.30 },
          0.006, c1);
      }
      if (PLATE.roll) {
        // Rolled top edge: a lip leaning OUTBOARD off the plate crown, wider
        // and more canted at the rear — the outwash curl, not a straight rail.
        addBeveledSpan(out,
          { z: 2.58, x: epX + s * 0.012, y: 0.135 + PLATE.hF * 0.5 + 0.006, w: 0.040, h: 0.014, t: 0.45 },
          { z: 2.02, x: epX + s * epKick, y: 0.245 + PLATE.hR * 0.5 - 0.004, w: 0.044, h: 0.012, t: 0.40 },
          0.006, c2);
      }
      // Canard / dive-plane: first element is a horizontal strake on the
      // outer face (the 2026 flick); extras stay as the older cascade vanes.
      const nCan = Math.max(aCasc, ws.canard || 0);
      for (let i = 0; i < nCan; i++) {
        if (i === 0) {
          addBeveledSpan(out,
            { z: 2.60, x: epX + s * 0.030, y: 0.152, w: 0.095, h: 0.016, t: 0.45 },
            { z: 2.30, x: epX + s * 0.058, y: 0.172, w: 0.115, h: 0.013, t: 0.62 },
            0.004, CARBON);
        } else {
          const cz = 2.52 - i * 0.18, cy = 0.170 + i * 0.058;
          addBeveledSpan(out,
            { z: cz,        x: s * (fwHalf - 0.03), y: cy,         w: 0.018, h: 0.12, t: 0.55 },
            { z: cz - 0.22, x: epX + s*0.012,       y: cy + 0.070, w: 0.018, h: 0.18, t: 0.70 },
            0.008, c1);
        }
      }
      if (_round) CarShade.strut(out, [s*0.09, 0.085, 2.54], [s*0.09, 0.275, 2.40], 0.16, 0.040, c1, addTri, null, { n: 10, taper: 0.72 });
      else addFairedArm(out, [s*0.09, 0.275, 2.40], [s*0.09, 0.085, 2.54], 0.040, c1, SURFACES.paint);
    }

    const aVane = aeroStyle && aeroStyle.vane != null ? aeroStyle.vane
                : (aLvl >= 4 ? 3 : aLvl >= 3 ? 2 : aLvl >= 1 ? 1 : 0);
    if (!ckpt && aVane > 0) {
      for (const s of [-1, 1]) {
        // Primary vane — always present.
        addBeveledSpan(out,
          { z: 1.15, x: s*0.73, y: 0.30, w: 0.014, h: 0.22, t: 0.50 },
          { z: 0.81, x: s*0.73, y: 0.30, w: 0.014, h: 0.22, t: 0.50 },
          0.006, CARBON);
        // FOOTPLATE under it. Every real bargeboard cluster turns out into a
        // horizontal foot at its base; without one the default car (vane 1) had
        // a single blade standing in clear air on each side, which is the one
        // configuration most of the grid actually runs. Outboard of the aVane>=3
        // turning vane at x 0.60 and of the `board` wakeboard at x 0.48-0.58, so
        // the three never share a volume.
        addBeveledSpan(out,
          { z: 1.15, x: s*0.725, y: 0.196, w: 0.135, h: 0.016, t: 0.74 },
          { z: 0.81, x: s*0.735, y: 0.204, w: 0.115, h: 0.014, t: 0.82 },
          0.005, CARBON);
        if (aVane >= 2) addBeveledSpan(out,
          { z: 0.87, x: s*0.66, y: 0.26, w: 0.014, h: 0.17, t: 0.50 },
          { z: 0.57, x: s*0.66, y: 0.26, w: 0.014, h: 0.17, t: 0.50 },
          0.006, CARBON);
        if (aVane >= 3) {
          // Curved triple cascade: a swept forward vane + a canted footplate vane.
          addBeveledSpan(out,
            { z: 1.28, x: s*0.70, y: 0.28, w: 0.02, h: 0.20 },
            { z: 0.98, x: s*0.62, y: 0.24, w: 0.02, h: 0.26 },
            0.008, CARBON);
          addBox(out, s*0.60, 0.19, 0.86, 0.16, 0.014, 0.36, CARBON);   // horizontal turning vane
        }
      }
    }
    // 2026 in-wash WAKEBOARD (`board`) — the regulated floor-board / bargeboard
    // return, inboard of the turning-vane cluster so the two never occupy the
    // same volume. 0 none · 1 vertical fence · 2 fence + horizontal foot.
    const aBoard = Math.max(0, Math.min(2, Math.round((aeroStyle && aeroStyle.board) || 0)));
    if (aBoard > 0 && !ckpt) {
      for (const s of [-1, 1]) {
        addBeveledSpan(out,
          { z: 1.38, x: s * 0.48, y: 0.20, w: 0.014, h: aBoard === 2 ? 0.20 : 0.14, t: 0.45 },
          { z: 0.92, x: s * 0.58, y: 0.24, w: 0.012, h: aBoard === 2 ? 0.16 : 0.12, t: 0.60 },
          0.006, CARBON);
        if (aBoard >= 2) addBeveledSpan(out,
          { z: 1.22, x: s * 0.44, y: 0.145, w: 0.15, h: 0.016, t: 0.70 },
          { z: 0.86, x: s * 0.56, y: 0.165, w: 0.12, h: 0.014, t: 0.80 },
          0.005, CARBON);
      }
    }

    part("rearAssembly");
    if (!ckpt) {
      const rwLift = (aLvl - 2) * 0.045;        // gentler vertical shift (beam-wing ref)
      const _ep    = endplateGeom(aLvl, aeroStyle);
      const epSY   = _ep.sy;   // grows with lvl + rearSweep + fin (side silhouette)
      const epCY   = _ep.cy;
      for (const s of [-1, 1]) {   // rounded build: a shaped plate with its crown (CarShade.endplate)
        if (_round) CarShade.endplate(out, _ep, s, DARK, rearC, wingSurf, addTri); else addBeveledSpan(out,
          { z: _ep.front.z, x: s*0.50, y: _ep.front.cy, w: 0.040, h: _ep.front.sy, t: 0.58 },
          { z: _ep.rear.z, x: s*0.50, y: _ep.rear.cy, w: 0.040, h: _ep.rear.sy, t: 0.72 },
          0.012, DARK);
        // Endplate WINDOWS + louvres. The old 18 mm flush slots sat inside the
        // plate thickness and read as a blank black slab from wingRear. Proud
        // raked cuts catch the bay light; two larger recesses read as DRS
        // cut-outs (void, not painted lines).
        for (let i = 0; i < 2; i++) {
          const wy = epCY + epSY * 0.12 - i * 0.11;
          addSpan(out, { z: -2.18, x: s * 0.538, y: wy + 0.028, w: 0.028, h: 0.055, t: 0.78 },
                       { z: -2.46, x: s * 0.522, y: wy - 0.012, w: 0.022, h: 0.042, t: 0.62 },
                  INTAKE, null, SURFACES.carbon);
        }
        for (let i = 0; i < 5; i++) {
          const ly = epCY + epSY * 0.42 - i * 0.048;
          addSpan(out, { z: -2.20, x: s * 0.536, y: ly + 0.014, w: 0.022, h: 0.022, t: 0.82 },
                       { z: -2.42, x: s * 0.524, y: ly - 0.012, w: 0.018, h: 0.018, t: 0.64 },
                  INTAKE, null, SURFACES.carbon);
        }
        if (!_round) addBeveledSpan(out,
          { z: _ep.front.z, x: s*0.50, y: _ep.front.top, w: 0.046, h: 0.018, t: 0.70 },
          { z: _ep.rear.z, x: s*0.50, y: _ep.rear.top, w: 0.046, h: 0.018, t: 0.85 },
          0.006, rearC, null, wingSurf);
      }
      const rearSweep = Math.max(-0.06, Math.min(0.20, aeroStyle.rearSweep));
      const rearTaper = Math.max(0.72, Math.min(1.08, aeroStyle.rearTaper));
      const crownY = _ep.rear.top - 0.018;
      const upperTrailY = crownY - (aLvl >= 4 || aDrs ? 0.075 : 0);
      const rearWing = (zLead, yLead, zTrail, yTrail, half, thick, col, scale) =>
        addWingFoil(out, {
          zLead, yLead, zTrail, yTrail, half, thick,
          taper: rearTaper, sweep: rearSweep * (scale == null ? 1 : scale), rise: 0,
          attachHalf: 0.50,
        }, col, wingSurf);
      rearWing(-2.30, upperTrailY - 0.270, -2.52, upperTrailY - 0.225,
        0.51, 0.024, c1, 0.8);
      const aSwan = aeroStyle && aeroStyle.swan ? 1 : 0;
      if (aSwan) {
        const mainTopY = upperTrailY - 0.225 + 0.016;
        for (const s of [-1, 1]) {
          addSpan(out, { z: -1.98, x: s*0.16, y: 0.46, w: 0.048, h: 0.13 },
                       { z: -2.26, x: s*0.16, y: mainTopY + 0.075, w: 0.036, h: 0.095 }, DARK);
          addSpan(out, { z: -2.26, x: s*0.16, y: mainTopY + 0.075, w: 0.036, h: 0.060 },
                       { z: -2.44, x: s*0.16, y: mainTopY + 0.012, w: 0.030, h: 0.048 }, DARK);
        }
      } else if (!_round) {   // rounded build: ONE central pylon (below) carries the wing
        for (const s of [-1, 1]) {
          addSpan(out, { z: -1.98, x: s*0.14, y: 0.46, w: 0.05, h: 0.13 },
                       { z: -2.34, x: s*0.14, y: epCY + 0.01, w: 0.042, h: 0.10 }, DARK);
        }
      }
      if (_round) CarShade.strut(out, [0, 0.44, -1.96], [0, upperTrailY - 0.255, -2.40], 0.14, 0.06, DARK, addTri, null, { taper: 0.75, n: 10 }); else addSpan(out, { z: -1.96, x: 0, y: 0.44, w: 0.09, h: 0.14 },
                   { z: -2.36, x: 0, y: epCY, w: 0.07, h: 0.10 }, DARK);   // central spine mount (rounded: a lens pylon ending in the main plane)
      const aTvane = aeroStyle && aeroStyle.tvane != null
        ? (aeroStyle.tvane ? 1 : 0) : (aLvl >= 4 && !aDrs ? 1 : 0);
      if (aTvane) {
        addWingFoil(out, {
          zLead: -1.935, yLead: epCY + 0.188, zTrail: -2.025, yTrail: epCY + 0.212,
          half: 0.17, thick: 0.014, taper: 0.90, sweep: 0.018, rise: 0.006,
        }, rearC, wingSurf);
        addBox(out, 0, (0.56 + epCY + 0.19) / 2, -1.98, 0.03, epCY + 0.19 - 0.56, 0.025, DARK);
      }
      if (aBeam) {
        // Prominent beam wing slung low under the main plane, spanning the crash structure.
        rearWing(-2.36, 0.64 + rwLift * 0.4, -2.58, 0.68 + rwLift * 0.4,
          0.46, 0.022, c1, 0.65);
      }
      if (aDrs) {
        // Active-aero DRS: an extra open slot flap proud of the top flap.
        rearWing(-2.44, crownY - 0.050, -2.60, crownY, 0.49, 0.016, rearC, 1.15);
      }
      const drsSX = aLvl >= 3 ? 0.16 : 0.13;
      // DRS actuator pod + the slot-gap rail it sits on. The pod used to be a
      // 5 cm brick lost on the crown; a taller raked housing and a carbon
      // strip under the top flap make the mechanism (and the open slot) read
      // from wingRear.
    addSpan(out, { z: -2.40, x: 0, y: epCY + 0.268, w: drsSX, h: 0.070, t: 0.70 },
                 { z: -2.62, x: 0, y: epCY + 0.292, w: drsSX * 0.72, h: 0.048, t: 0.50 },
            DARK);
    addBox(out, 0, epCY + 0.236, -2.50, 0.42, 0.010, 0.20, CARBON, SURFACES.carbon);

      // Lamp above tip centreline so stock/megaphone mouth rim stays visible.
      const tipR = exhTipRForLamp, lampY = 0.545;
      const lampW = Math.min(0.042, tipR * 0.70), lampH = Math.min(0.052, tipR * 0.85);
      addSpan(out, { z: -2.47, x: 0, y: lampY, w: 0.14, h: 0.16, t: 0.78 },
                   { z: -2.57, x: 0, y: lampY, w: 0.115, h: 0.13, t: 0.62 }, DARK);
      addBox(out, 0, lampY, -2.585, lampW * 1.15, lampH * 1.10, 0.034,
             [1.55, 0.16, 0.11], SURFACES.emissive);
      addBox(out, 0, lampY, -2.60, lampW * 0.38, lampH * 0.36, 0.016,
             [1.85, 0.18, 0.10], SURFACES.emissive);   // rain-light core (bloom-capped)

      const diffW  = (0.72 + aLvl * 0.145) * Math.max(0.78, Math.min(1.3, aeroStyle.floorEdge));
      const diffH1 = (0.40 + aLvl * 0.325) *
        Math.max(0.72, Math.min(1.4, aeroStyle.diffuserRise));
      // THE DIFFUSER. This was one closed loft, and from directly behind — the
      // view a chase camera holds for most of a lap — it read as a featureless
      // grey slab the full width of the car with the brake light floating on it.
      // The diffuser is the most
      // recognisable thing about the back of an F1 car and none of it was there.
      // Built as two tunnels either side of the crash structure: a ramped
      // ceiling, an outer wall, strakes, and a gurney across the trailing edge.
      // Every piece is a thin CLOSED solid rather than an open quad, so the
      // winding cannot come out inside-out on a surface you only ever see from
      // one side. Both knobs still drive it — floorEdge the width, diffuserRise
      // the ceiling — so the sweep's amplitude for them goes up, not down.
      const dHalf = Math.min(CAR_HALF - 0.04, 0.56 * diffW);   // half-width at the exit
      const dThr  = 0.46 * diffW;                    // half-width at the throat
      const dKeel = 0.12;                            // crash structure half-width
      const dFloor = 0.105;
      const dRise = 0.30 * Math.max(0.72, Math.min(1.4, aeroStyle.diffuserRise));
      const yCE = dFloor + dRise, yCT = dFloor + 0.055 * diffH1 / 0.4;
      const DIFF_IN = [0.045, 0.045, 0.055];
      for (const s of [-1, 1]) {
        const cxE = s * (dKeel + dHalf) / 2, cxT = s * (dKeel + dThr) / 2;
        const wE = dHalf - dKeel, wT = dThr - dKeel;
        if (_round) CarShade.tunnel(out, s, dKeel, dThr, dHalf, dFloor, yCT, yCE, DIFF_IN, CARBON, addTri, SURFACES.carbon); else addLoft(out, -2.52, cxE, yCE, wE, 0.035, -1.95, cxT, yCT, wT, 0.035,
                DIFF_IN, SURFACES.carbon);                              // ramped ceiling (rounded: ceiling + wall as one curved shell)
        if (!_round) addLoft(out, -2.52, s * dHalf, (dFloor + yCE) / 2, 0.030, yCE - dFloor,
                     -1.95, s * dThr,  (dFloor + yCT) / 2, 0.030, yCT - dFloor,
                CARBON, SURFACES.carbon);                               // outer wall
        addBox(out, cxE, dFloor, -2.235, wE, 0.028, 0.57, CARBON, SURFACES.carbon);
        for (let k = 0; k < 3; k++) {
          const f = 0.22 + k * 0.28;
          addLoft(out, -2.50, s * (dKeel + wE * f), (dFloor + yCE) / 2, 0.028, (yCE - dFloor) * 0.90,
                       -2.02, s * (dKeel + wT * f), (dFloor + yCT) / 2, 0.022, (yCT - dFloor) * 0.90,
                  DIFF_IN, SURFACES.carbon);                            // strake
        }
      }
      addLoft(out, -2.58, 0, 0.195, 2 * dKeel * 0.82, 0.15,
                   -1.95, 0, 0.170, 2 * dKeel * 1.10, 0.13, DARK, SURFACES.carbon);
      addBox(out, 0, yCE + 0.030, -2.525, 2 * dHalf, 0.030, 0.020, rearC, wingSurf);

      const gbStrakes = gbStyle ? gbStyle.strakes : (tier("gearbox") === 2 ? 5 : 0);
      const gbFin = gbStyle ? gbStyle.fin : (tier("gearbox") === 2 ? 1 : 0);
      const gbStrakeH = gbStyle && gbStyle.strakeH ? gbStyle.strakeH : 0.13;
      const gbCasing  = gbStyle ? (gbStyle.casing  || 0) : (tier("gearbox") === 2 ? 3 : 0);
      const gbLouvres = gbStyle ? (gbStyle.louvres || 0) : 0;
      const gbHeat    = gbStyle ? (gbStyle.heat    || 0) : 0;
      const gbFinSY   = gbStyle && gbStyle.finSY ? gbStyle.finSY : 0.14;
      const gbFinSZ   = gbStyle && gbStyle.finSZ ? gbStyle.finSZ : 0.28;
      const gbHeatFins = gbStyle ? Math.max(0, Math.min(5, Math.round(gbStyle.heatFins || 0))) : 0;
      const gbRibs     = gbStyle ? Math.max(0, Math.min(3, Math.round(gbStyle.ribs || 0))) : 0;
      const gbCaseWmul = Math.max(0.75, Math.min(1.35, (gbStyle && gbStyle.caseWidth) || 1));
      if (gbStrakes > 0) {
        const half = (gbStrakes - 1) / 2;
        for (let i = 0; i < gbStrakes; i++) {
          addBox(out, (i - half) * 0.24, 0.13 + gbStrakeH / 2, -2.20, 0.015, gbStrakeH, 0.42, CARBON);
        }
      }
      let gbCw = 0, gbCh = 0;
      if (gbCasing > 0) {
        gbCw = (0.15 + gbCasing * 0.05) * gbCaseWmul;
        gbCh = 0.13 + gbCasing * 0.03;
        addBox(out, 0, 0.44, -1.92, gbCw * 1.08, gbCh * 1.12, 0.04, CARBON, SURFACES.carbon);
        addSpan(out,
          { z: -1.94, y: 0.44, w: gbCw * 1.02, h: gbCh, t: 0.90 },
          { z: -2.12, y: 0.435, w: gbCw, h: gbCh * 0.96, t: 0.88 },
          CARBON, null, SURFACES.carbon);
        if (gbCasing >= 2) {
          addSpan(out,
            { z: -2.12, y: 0.42, w: gbCw * 0.92, h: gbCh * 0.82, t: 0.88 },
            { z: -2.26, y: 0.40, w: gbCw * 0.58, h: gbCh * 0.62, t: 0.85 },
            DARK, null, SURFACES.carbon);
        }
        if (gbCasing >= 3) {
          for (const s of [-1, 1]) {
            addBox(out, s * (gbCw * 0.5 + 0.012), 0.44, -2.04, 0.02, gbCh * 0.9, 0.22,
                   [0.09, 0.09, 0.10], SURFACES.carbon);
            addBox(out, s * (gbCw * 0.42), 0.32, -2.00, 0.04, 0.05, 0.10, DARK);
          }
        }
      }
      if (gbRibs > 0) {
        const ribW = gbCasing > 0 ? gbCw * 0.48 : 0.16;
        const ribH = gbCasing > 0 ? gbCh * 0.72 : 0.10;
        for (const s of [-1, 1]) for (let i = 0; i < gbRibs; i++) {
          addBox(out, s * ribW, 0.44, -1.96 - i * 0.07,
                 0.012, ribH, 0.04, CARBON, SURFACES.carbon);
        }
      }
      if (gbLouvres > 0) {
        const hx = gbCasing > 0 ? (gbCw * 0.5 + 0.018) : 0.135;
        for (const s of [-1, 1]) for (let i = 0; i < gbLouvres; i++) {
          const y = 0.52 - i * 0.038;
          addBox(out, s * hx, y, -2.02, 0.028, 0.012, 0.18, INTAKE);
          addBox(out, s * (hx + 0.012), y + 0.008, -2.00, 0.012, 0.008, 0.16, CARBON);
        }
      }
      if (gbHeat) {
        const hw = gbCasing > 0 ? Math.max(0.16, gbCw * 0.88) : 0.19;
        addBox(out, 0, 0.55, -2.06, hw, 0.014, 0.28, [0.30, 0.30, 0.34], SURFACES.metal);
      }
      if (gbHeatFins > 0) {
        const half = (gbHeatFins - 1) / 2;
        const span = gbCasing > 0 ? Math.max(0.12, gbCw * 0.70) : 0.14;
        const step = gbHeatFins > 1 ? span / (gbHeatFins - 1) : 0;
        for (let i = 0; i < gbHeatFins; i++) {
          addBox(out, (i - half) * step, 0.575, -2.06, 0.010, 0.045, 0.22,
                 [0.30, 0.30, 0.34], SURFACES.metal);
        }
      }
      if (gbFin) addBox(out, 0, 0.27 + gbFinSY / 2, -2.30, 0.02, gbFinSY, gbFinSZ, CARBON);
    }

    part("brakeDucts");
    const brakesT = tier("brakes");
    const ductMul = brakeStyle ? brakeStyle.duct : (brakesT === 0 ? 0.5 : brakesT === 2 ? 1.9 : 1.0);
    const brakeScoop = Math.max(0, Math.min(2, Math.round(
      brakeStyle && brakeStyle.scoop != null ? brakeStyle.scoop : (ductMul >= 1.3 ? 1 : 0))));
    for (const s of [-1, 1]) {
      (_round ? CarShade.boxFn(addTri, { r: 0.028 }) : addBox)(out, s*0.60, 0.28, AXLES.frontZ + 0.19, 0.06, 0.20 * ductMul, 0.13 * ductMul, DARK);   // rounded: a stadium section
      // The duct was a plain prism with no MOUTH — the same flat-dark-face
      // defect the radiator inlet had, and addInletMouth() was written for it
      // this session and never applied here. No lip: a brake duct's leading
      // edge is a knife, not a flange, and the lip bars are what make the
      // helper dear.
      // Not in the COCKPIT build: from the seat the front ducts are behind the
      // wheels and outside the visor, so 120 triangles of throat would render
      // where nothing can look at them — and the cockpit ceiling is the tighter
      // of the two.
      if (!ckpt) addInletMouth(out, s * 0.60, 0.28, AXLES.frontZ + 0.19 + 0.065 * ductMul,
                               0.05, 0.15 * ductMul, DARK, 0.045 * ductMul, 0);
      // Big-brake spec: a horizontal duct winglet scooping over each front wheel.
      if (brakeScoop >= 1) addBox(out, s*0.65, 0.42, AXLES.frontZ + 0.16, 0.11, 0.02, 0.15, CARBON);
      if (brakeScoop >= 1) {
        addBox(out, s*0.65, 0.355, AXLES.frontZ + 0.22, 0.08, 0.055, 0.04, INTAKE);
        addBox(out, s*0.65, 0.395, AXLES.frontZ + 0.245, 0.09, 0.012, 0.03, CARBON);
        addBox(out, s*0.65, 0.315, AXLES.frontZ + 0.245, 0.09, 0.012, 0.03, CARBON);
      }
      if (brakeScoop >= 2) {
        addBox(out, s*0.705, 0.38, AXLES.frontZ + 0.15, 0.014, 0.12, 0.17, CARBON);
        addBox(out, s*0.655, 0.20, AXLES.frontZ + 0.11, 0.10, 0.016, 0.20, CARBON);
        addBox(out, s*0.595, 0.32, AXLES.frontZ + 0.14, 0.014, 0.10, 0.16, CARBON);
      }
      if (!ckpt) (_round ? CarShade.boxFn(addTri, { r: 0.028 }) : addBox)(out, s*0.58, 0.30, AXLES.rearZ - 0.20, 0.06, 0.18 * ductMul, 0.12 * ductMul, DARK);
      if (brakeScoop >= 1 && !ckpt) {
        addBox(out, s*0.58, 0.355, AXLES.rearZ - 0.275, 0.07, 0.040, 0.045, INTAKE);
        addBox(out, s*0.58, 0.385, AXLES.rearZ - 0.295, 0.08, 0.010, 0.028, CARBON);
      }
    }

    part("suspension");
    const wbMul = suspStyle ? suspStyle.arm : (suspT === 0 ? 0.85 : suspT === 2 ? 1.3 : 1.0);
    const wbPush = suspStyle ? suspStyle.push : (suspT === 2 ? 1 : 0);
    const wbPull = suspStyle && suspStyle.pull ? 1 : 0;
    const armTh = 0.026 * wbMul, suspC = [0.11, 0.11, 0.13];
    const rockerLvl = Math.max(0, Math.min(2, Math.round(suspStyle.rocker || 0)));
    const heaveOn = Math.max(0, Math.min(1, Math.round(suspStyle.heave || 0)));
    const fairArms = !!(wbPush || wbPull || rockerLvl || heaveOn);
    const drawArm = fairArms ? addFairedArm : _round ? (o, a, b, th, c, sf) => CarShade.strut(o, a, b, th * 1.9, th * 0.62, c, addTri, sf, { n: 6 }) : addBeamBetween;   // rounded: a lens section
    // Inboard damper barrel + rocker link, the mechanism a real tub carries
    // under its blister. Gated on the existing `rocker` knob, so the default
    // car (rocker 0) is untouched and only fitted suspension gains hardware.
    function suspHardware(y, px) {
      for (const sd of [-1, 1]) {
        addBox(out, sd * px, y + 0.020, 1.02, 0.030, 0.030, 0.115,
               [0.30, 0.30, 0.34], SURFACES.metal);            // damper barrel
        addBox(out, sd * px, y + 0.020, 0.955, 0.022, 0.022, 0.028,
               [0.55, 0.52, 0.20], SURFACES.metal);            // spring collar
        addBeamBetween(out, [sd * px, y + 0.020, 1.08], [sd * (px + 0.055), y - 0.012, 1.13],
                       0.013, suspC, SURFACES.carbon);          // rocker link
      }
    }
    if (rockerLvl === 1) {
      for (const s of [-1, 1]) {
        addLoft(out, 0.88, s * 0.11, 0.545 + rideDY, 0.10, 0.036,
                1.12, s * 0.09, 0.530 + rideDY, 0.08, 0.028, CARBON);
      }
      addBeamBetween(out, [-0.10, 0.545 + rideDY, 0.98],
        [0.10, 0.545 + rideDY, 0.98], 0.016, suspC, SURFACES.carbon);
      suspHardware(0.545 + rideDY, 0.11);
    } else if (rockerLvl === 2) {
      addLoft(out, 0.72, 0, 0.555 + rideDY, 0.28, 0.050,
              1.18, 0, 0.515 + rideDY, 0.22, 0.038, CARBON);
      for (const s of [-1, 1]) {
        addBox(out, s * 0.075, 0.590 + rideDY, 0.94, 0.028, 0.055, 0.055,
               [0.24, 0.24, 0.27], SURFACES.metal);
        addBox(out, s * 0.12, 0.568 + rideDY, 0.96, 0.055, 0.012, 0.08,
               CARBON, SURFACES.carbon);
      }
      suspHardware(0.575 + rideDY, 0.075);
      if (!ckpt) {
        addLoft(out, -1.38, 0, 0.520 + rideDY, 0.18, 0.042,
                -1.14, 0, 0.500 + rideDY, 0.14, 0.032, CARBON);
      }
    }
    if (heaveOn) {
      const hy = 0.562 + rideDY, hz = 0.99;
      addBox(out, 0, hy, hz, 0.20, 0.030, 0.030,
             [0.26, 0.26, 0.29], SURFACES.metal);
      addBox(out, 0, hy + 0.020, hz - 0.038, 0.09, 0.024, 0.050,
             CARBON, SURFACES.carbon);
      for (const s of [-1, 1]) {
        const px = rockerLvl === 2 ? 0.075 : rockerLvl === 1 ? 0.11 : 0.18;
        const py = (rockerLvl === 2 ? 0.575 : rockerLvl === 1 ? 0.545 : 0.505) + rideDY;
        const pz = rockerLvl === 2 ? 0.94 : 0.98;
        addBeamBetween(out, [s * 0.09, hy, hz], [s * px, py, pz],
                       armTh * 0.5, suspC, SURFACES.carbon);
      }
    }
    const wishboneSpread = 0.20 * Math.max(0.72, Math.min(1.3, suspStyle.wishbone));
    const toeScale = Math.max(0.7, Math.min(1.35, suspStyle.toe));
    // INBOARD PICKUPS. Every arm on the car started at a hardcoded x 0.29-0.33
    // while the bodywork it bolts to is far narrower at the axle stations: the
    // nose flank measures x 0.19-0.21 at the front axle and the engine cover
    // 0.15-0.17 at the rear, so the wishbones, track rods and pushrods all
    // began 0.10-0.16 m outboard of the chassis, floating in clear air with a
    // visible gap between arm root and body from any three-quarter camera.
    // Sample the SAME anchors the bodywork lofts from — the arms then follow a
    // team's nose style and an engine's tailWidth instead of ignoring both.
    const inNose = (z) => anchors.noseAt(z).side - 0.012;
    const inTail = (z) => Math.max(0.14, anchors.coverAt(z).x - 0.012);
    for (const s of [-1, 1]) {
      // Wishbone PLANE SPREAD. 0.27/0.43 put the two pickups 160 mm apart on an
      // upright that lives inside a 462 mm rim (rimR = 0.68 x 0.34): a real
      // upright uses nearly the whole rim, lower joint low in the wheel and
      // upper joint high, which is what gives an F1 front end its splayed-V
      // silhouette. 0.22/0.47 is a 250 mm spread, still 50 mm clear of the rim
      // at each end. The upright casting below grows to span it.
      const fLower = [s*0.69, 0.22 + rideDY, AXLES.frontZ];
      const fUpper = [s*0.69, 0.47 + rideDY, AXLES.frontZ];
      const fLowZ = [AXLES.frontZ - wishboneSpread, AXLES.frontZ + wishboneSpread];
      for (const z of fLowZ) {
        drawArm(out, [s*inNose(z), 0.225 + rideDY, z], fLower, armTh, suspC, SURFACES.carbon);
        drawArm(out, [s*inNose(z), 0.42 + rideDY, z], fUpper, armTh, suspC, SURFACES.carbon);
      }
      if (fairArms) {
        addWishboneWeb(out, [s*inNose(fLowZ[0]), 0.225 + rideDY, fLowZ[0]],
          [s*inNose(fLowZ[1]), 0.225 + rideDY, fLowZ[1]], fLower, suspC, SURFACES.carbon);
        addWishboneWeb(out, [s*inNose(fLowZ[0]), 0.42 + rideDY, fLowZ[0]],
          [s*inNose(fLowZ[1]), 0.42 + rideDY, fLowZ[1]], fUpper, suspC, SURFACES.carbon);
      }
      drawArm(out, [s*inNose(AXLES.frontZ - 0.16), 0.34 + rideDY, AXLES.frontZ - 0.16],
        [s*0.69, 0.35 + rideDY, AXLES.frontZ - 0.04*toeScale],
        armTh*0.72*toeScale, suspC, SURFACES.carbon);
      // An upright is a CASTING: wide at the lower wishbone pickup, narrow at
      // the top. `addSpan` with a tapered front frame is the same 12 triangles
      // as the cube it replaces.
      addSpan(out, { z: AXLES.frontZ + 0.05, x: s * 0.69, y: 0.345 + rideDY, w: 0.055, h: 0.29, t: 0.55 },
                   { z: AXLES.frontZ - 0.05, x: s * 0.69, y: 0.345 + rideDY, w: 0.048, h: 0.27, t: 0.62 },
              [0.18, 0.18, 0.20], null, SURFACES.metal);
      if (wbPush) {
        const outer = wbPull ? fUpper : fLower;
        const iX = inNose(AXLES.frontZ - 0.05);
        const inner = wbPull ? [s*iX,0.20+rideDY,AXLES.frontZ-0.05]
          : [s*iX,0.455+rideDY,AXLES.frontZ-0.05];
        drawArm(out, outer, inner, armTh*0.82, suspC, SURFACES.carbon);
      }
      if (!ckpt) {
        const rLower = [s*0.67, 0.235 + rideDY, AXLES.rearZ];
        const rUpper = [s*0.67, 0.485 + rideDY, AXLES.rearZ];
        const rLowZ = [AXLES.rearZ - wishboneSpread*0.9, AXLES.rearZ + wishboneSpread*0.9];
        for (const z of rLowZ) {
          drawArm(out, [s*inTail(z), 0.25 + rideDY, z], rLower, armTh, suspC, SURFACES.carbon);
          drawArm(out, [s*inTail(z), 0.47 + rideDY, z], rUpper, armTh, suspC, SURFACES.carbon);
        }
        if (fairArms) {
          addWishboneWeb(out, [s*inTail(rLowZ[0]), 0.25 + rideDY, rLowZ[0]],
            [s*inTail(rLowZ[1]), 0.25 + rideDY, rLowZ[1]], rLower, suspC, SURFACES.carbon);
          addWishboneWeb(out, [s*inTail(rLowZ[0]), 0.47 + rideDY, rLowZ[0]],
            [s*inTail(rLowZ[1]), 0.47 + rideDY, rLowZ[1]], rUpper, suspC, SURFACES.carbon);
        }
        drawArm(out, [s*inTail(AXLES.rearZ + 0.16), 0.36 + rideDY, AXLES.rearZ + 0.16],
          [s*0.67, 0.36 + rideDY, AXLES.rearZ + 0.04*toeScale],
          armTh*0.72*toeScale, suspC, SURFACES.carbon);
      addSpan(out, { z: AXLES.rearZ + 0.05, x: s * 0.67, y: 0.36 + rideDY, w: 0.055, h: 0.29, t: 0.55 },
                   { z: AXLES.rearZ - 0.05, x: s * 0.67, y: 0.36 + rideDY, w: 0.048, h: 0.27, t: 0.62 },
              [0.18, 0.18, 0.20], null, SURFACES.metal);
        if (wbPush) {
          const outer = wbPull ? rUpper : rLower;
          const iX = inTail(AXLES.rearZ + 0.04);
          const inner = wbPull ? [s*iX,0.22+rideDY,AXLES.rearZ+0.04]
            : [s*iX,0.53+rideDY,AXLES.rearZ+0.04];
          drawArm(out, outer, inner, armTh*0.82, suspC, SURFACES.carbon);
        }
        // DRIVESHAFT. Nothing spanned gearbox to upright, so from directly
        // behind — a chase camera's view for most of a lap — the rear wheels
        // floated with clear air where the drive is. Sits on the axle line at
        // upright height, with a CV boot at each end; six sides because it is
        // small and half-hidden behind the tyre from every angle but dead
        // astern, which is the one angle that matters here.
        addTube(out, [[s * 0.155, 0.36 + rideDY, AXLES.rearZ],
                      [s * 0.605, 0.36 + rideDY, AXLES.rearZ]],
                0.032, 6, [0.22, 0.22, 0.25], SURFACES.metal);
        for (const bx of [0.185, 0.575])
          addBox(out, s * bx, 0.36 + rideDY, AXLES.rearZ, 0.052, 0.062, 0.062,
                 [0.10, 0.10, 0.12], SURFACES.carbon);   // CV boot
      }
    }

    part("wheels");
    if (!noWheels) {
      const tyreBand = tyreStyle && tyreStyle.band || TYRE_BAND[tier("tyres")];
      // Per-option caliper accent peeking through the rim spokes, else tier.
      const caliperColor = brakeStyle ? brakeStyle.cal : BRAKE_CALIPER[brakesT];
      const rimColor = brakeStyle && brakeStyle.rim;   // premium alloy rims (else default dark)
      for (const s of [-1, 1]) {
        addWheel(out, s*0.79, AXLES.wheelY, AXLES.frontZ, 0.34, 0.32,
          tyreBand, caliperColor, rimColor, false, tyreStyle, null, brakeStyle, wheelStyle);
        addWheel(out, s*0.76, AXLES.wheelY, AXLES.rearZ, 0.34, 0.38,
          tyreBand, caliperColor, rimColor, false, tyreStyle, null, brakeStyle, wheelStyle);
      }
      // 2026 over-wheel deflector above each FRONT wheel (tyre crown y 0.68):
      // 0 none / 1 single plane on a stalk / 2 biplane + outboard endplate.
      const wDefl = Math.max(0, Math.min(2, Math.round((wheelStyle && wheelStyle.deflector) || 0)));
      if (wDefl > 0) {
        for (const s of [-1, 1]) {
          addBeveledSpan(out,
            { z: AXLES.frontZ + 0.20, x: s * 0.79, y: 0.745, w: 0.30, h: 0.012, t: 0.70 },
            { z: AXLES.frontZ - 0.16, x: s * 0.77, y: 0.775, w: 0.26, h: 0.010, t: 0.70 },
            0.004, CARBON, null, SURFACES.carbon);
          addBeamBetween(out, [s * 0.66, 0.46, AXLES.frontZ + 0.17],
                              [s * 0.72, 0.740, AXLES.frontZ + 0.16], 0.016,
                         [0.11, 0.11, 0.13], SURFACES.carbon);
          if (wDefl >= 2) {
            addBeveledSpan(out,
              { z: AXLES.frontZ + 0.14, x: s * 0.80, y: 0.805, w: 0.24, h: 0.010, t: 0.70 },
              { z: AXLES.frontZ - 0.12, x: s * 0.78, y: 0.828, w: 0.20, h: 0.009, t: 0.70 },
              0.004, CARBON, null, SURFACES.carbon);
            addBox(out, s * 0.935, 0.775, AXLES.frontZ + 0.02, 0.012, 0.085, 0.30,
                   CARBON, SURFACES.carbon);
          }
        }
      }
    }

    const finishSurface = FINISH_SURFACE[liv.finish];
    if (finishSurface) {
      for (let i = 0; i < out.mat.length; i++) {
        if (out.mat[i] === SURFACES.paint) out.mat[i] = finishSurface;
      }
    }

    _round = false;
    _coverHi = true;
    if (shade && !sil) CarShade.smooth(out, { skip: [SURFACES.emissive] });   // a shadow caster keeps the shape; depth never reads normals
    // Close the last section and measure each from the vertices it emitted.
    if (sections.length) sections[sections.length - 1].to = out.pos.length / 3;
    if (opts && opts.measure) out.parts = sections.filter((sec) => sec.to > sec.from).map((sec) => {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity,
          z0 = Infinity, z1 = -Infinity;
      for (let i = sec.from * 3; i < sec.to * 3; i += 3) {
        if (out.pos[i] < x0) x0 = out.pos[i]; if (out.pos[i] > x1) x1 = out.pos[i];
        if (out.pos[i + 1] < y0) y0 = out.pos[i + 1]; if (out.pos[i + 1] > y1) y1 = out.pos[i + 1];
        if (out.pos[i + 2] < z0) z0 = out.pos[i + 2]; if (out.pos[i + 2] > z1) z1 = out.pos[i + 2];
      }
      const r2 = (v) => Math.round(v * 100) / 100;
      return { name: sec.name, vertices: sec.to - sec.from,
               sizeM: [r2(x1 - x0), r2(y1 - y0), r2(z1 - z0)],
               centreM: [r2((x0 + x1) / 2), r2((y0 + y1) / 2), r2((z0 + z1) / 2)],
               boundsZ: [r2(z0), r2(z1)] };
    });
    return out;
  }

  function buildComplete(color, color2, opts) {
    const out = build(color, color2, opts);
    const info = out.flapInfo;
    if (!info) return out;
    for (const el of aeroFlapsGeom(info.aLvl, info.style)) {
      // The livery finish rides flapInfo: build()'s own paint->finish remap
      // runs before these flaps are appended, so without it a satin/chrome
      // car got gloss top flaps from this path.
      const g = buildFlapGeom(el, info.col, info.finish);
      const base = out.pos.length / 3;
      for (let i = 0; i < g.pos.length; i += 3) {
        // delta 0: undo only the hinge translation buildFlapGeom applied.
        out.pos.push(g.pos[i], g.pos[i + 1] + el.y, g.pos[i + 2] + el.z);
        out.nrm.push(g.nrm[i], g.nrm[i + 1], g.nrm[i + 2]);
        out.col.push(g.col[i], g.col[i + 1], g.col[i + 2]);
      }
      if (g.mat) for (const m of g.mat) out.mat.push(m);
      for (const k of g.idx) out.idx.push(base + k);
    }
    return out;
  }

  return { build, buildComplete, buildWheel, buildWheelLayers, bodyAnchors, SURFACES, FINISH_SURFACE,
           PANEL_COL: PANEL,
           TYRE_BAND, BRAKE_CALIPER, AXLES, CHASSIS,
           TEAM_STYLE, teamStyleOf,
           endplate: endplateGeom, numberBoard, frontPlate: frontPlateGeom,
           wingBand: wingBandGeom,
           aeroFlaps: aeroFlapsGeom, aeroFlapAim, buildFlapGeom,
           sharkFin: FIN, sharkFinPanel, sharkFinBadge, sharkFinRoot, FIN_SHAPES, FIN_SHAPE_IDS,
           TCAM_IDS, COVER_VENT_IDS, mirrorLightAnchors, cockpitMirrorGlass, SPINE_HEIGHT_IDS, spineRise,
           coverProfile, coverFlankX, coverSurfaceY, COVER_STACK,
           aeroLevelOf, aeroStyleOf };
})();
