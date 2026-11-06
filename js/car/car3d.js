/* Apex 26 — procedural 2026 F1 car. Car3D.build(color, color2) -> plain {pos,nrm,col,mat,idx} for gfx.createMesh. Local space: +Z forward, +Y up, origin on the ground under the cockpit. Geometry builders live in car-body-geom.js; surfaces/finishes/palette in car-materials.js. */
"use strict";
const Car3D = (function () {
  const {
    SURFACES, FINISH_SURFACE,
    DARK, CARBON, VISOR, PANEL, TYRE, RIM, HUB, INTAKE, HALO,
    TYRE_BAND, BRAKE_CALIPER,
    TCAM_IDS, tcamColour,
  } = CarMaterials;

  // Category-neutral chassis datums. Parts may dress and reshape bodywork around
  // these, but the wheel/physics reference points never move.
  const AXLES = Object.freeze({ frontZ: 1.7, rearZ: -1.6, wheelY: 0.34 });
  const CHASSIS = Object.freeze({
    floor: Object.freeze({ cx: 0, cy: 0.07, cz: -0.3, sx: 1.5, sy: 0.085, sz: 3.2 }),
    nose: Object.freeze([
      // NOSE TIP. It was z 3.18 — 460 mm AHEAD of the front wing's main-plane
      // leading edge (frontCascade's first element leads at z 2.72) and 400 mm
      // ahead of the endplate (z 2.66). The nose now lands over the first flap
      // (LE z 2.50), behind the leading wing. The old tip also
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
    inletH: 0, inletW: 0, undercutD: 0, waist: 0, floorStep: 0, coverCrown: 0, coverLift: 0 });
  // Stock inlet, undercut, waist, floor and crown relief uses metre-scale offsets.
  // Each constructor gets a distinct combination; My Team uses DEFAULT_STYLE.
  // wingStyle owns the 2026 front-wing cascade recipe (#1026).
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
  // Livery silhouettes extend TEAM_STYLE with nose-section scales and metre-scale
  // waistH/coverLift/coverTailLift, reshaping the existing shared anchor stations.
  // Keep noseDroop >= the shipped floor; judge outlines in side and 3/4 views.
  // Concept shaping is on for every body (Bryce 2026-10-20): a body keeps its own
  // values and takes these where it set none. Designed pods (podProfile/podShape)
  // keep their own loft, since a pod sculpt would replace it. TEAM_STYLE is untouched.
  const CONCEPT_SCULPT = Object.freeze({ complete: true, sparse: true, coverArch: 0.035, coverBulge: 0.18, ductDepth: 0.12,
    mouth: 0.72, exitDepth: 0.07, channel: 0, crown: 0.035, belly: 0.34 });
  // A pod sculpt arches the cover itself, so the spine curve only fills in without one;
  // a stepped or pow-curved nose is already its own nose recipe.
  const withConceptDefaults = (styles) => Object.freeze(Object.fromEntries(Object.entries(styles).map(([id, s]) => {
    const podSculpt = s.podSculpt || (s.podProfile || s.podShape ? undefined : CONCEPT_SCULPT);
    return [id, Object.freeze(Object.assign({ fitSeat: 1, fitBodyDetails: true, minPodSpan: 0.08,
      spineCurve: podSculpt ? 0 : 0.03, noseSculpt: s.noseCurve == null && !s.noseStep,
      sculptSparse: s.podSculpt == null }, s, { podSculpt }))];   // authored sculpts keep full density
  })));
  const BODY_STYLES = withConceptDefaults({
    // Needle: spike nose past the wing, pencil tip+waist, tower inlet, sunken flat cover.
    needle:  Object.freeze({ noseTipZ:  0.55, noseSlim: 0.72, noseLow: true, noseTipH: 0.50, noseMidH: 0.50, noseDroop: -0.028, airbox: 0.22, fin: 0, mirror: 0, inlet: -0.100, inletH:  0.280, inletW: -0.240, undercutD:  0.200, waist: -0.260, floorStep:  0.100, coverCrown: -0.080, coverLift: -0.140, wingStyle: W({ arch: 0.22, twist: 0.06, teCurve: 0.020, chordTaper: 0.12, foot: 0.70, tipRise: 0.004 }) }),
    // Brick (reads): blunt fat nose, slab pods, tall airbox, raised box cover.
    brick:   Object.freeze({ noseTipZ: -0.32, noseSlim: 2.40, noseDroop:  0,     airbox: 2.00, fin: 1, mirror: 1, inlet:  0.120, inletH:  0.220, inletW:  0.240, undercutD: -0.160, waist:  0.260, floorStep:  0.100, coverCrown: -0.080, coverLift:  0.100, wingStyle: W({ flaps: 2, arch: 0.28, twist: 0.06, teCurve: 0.025, chordTaper: 0.12, foot: 0.75, canard: 0, tipRise: 0.006 }) }),
    // Anteater: long low snout (mid cone drops), flat low pods, humped cover.
    anteater: Object.freeze({ noseTipZ: 0.52, noseSlim: 0.82, noseLow: true, noseTipH: 0.48, noseMidH: 0.56, noseDroop: -0.028, airbox: 0.70, fin: 0, mirror: 2, inlet: -0.050, inletH: -0.240, inletW:  0.180, undercutD:  0.060, waist:  0.050, floorStep: -0.100, coverCrown:  0.260, coverLift:  0.180, wingStyle: W({ arch: 0.95, twist: 0.42, teCurve: 0.190, chordTaper: 0.48, canard: 2, tipRise: 0.065 }) }),
    // Arched: short stock nose, tower airbox + high cover crown, tall pods.
    arched:  Object.freeze({ noseTipZ:  0.02, noseSlim: 0.90, noseDroop: -0.022, airbox: 2.40, fin: 1, mirror: 0, inlet:  0.040, inletH:  0.280, inletW: -0.040, undercutD:  0.180, waist: -0.100, floorStep:  0.040, coverCrown:  0.280, coverLift:  0.200, wingStyle: W({ arch: 1.15, twist: 0.36, teCurve: 0.170, foot: 1.55, tipRise: 0.065 }) }),
    // Wedge: long low tip, scooped low inlet, rising high cover, tiny airbox.
    wedge:   Object.freeze({ noseTipZ:  0.52, noseSlim: 1.45, noseDroop: -0.028, airbox: 0.28, fin: 0, mirror: 1, inlet: -0.110, inletH: -0.260, inletW:  0.100, undercutD:  0.220, waist: -0.220, floorStep:  0.120, coverCrown:  0.200, coverLift:  0.200, wingStyle: W({ flaps: 2, arch: 0.55, twist: 0.20, teCurve: 0.090, chordTaper: 0.30, tipRise: 0.024 }) }),
    // Barge (reads): short fat blunt hull, wide low pods, heavy waist, low flat cover.
    barge:   Object.freeze({ noseTipZ: -0.32, noseSlim: 2.10, noseDroop: -0.006, airbox: 1.55, fin: 1, mirror: 2, inlet:  0.100, inletH: -0.060, inletW:  0.240, undercutD: -0.160, waist:  0.260, floorStep: -0.120, coverCrown: -0.080, coverLift: -0.100, wingStyle: W({ arch: 1.05, twist: 0.32, teCurve: 0.150, foot: 1.55, canard: 2, tipRise: 0.055 }) }),
    // Hammerhead: thin shovel tip on a narrow neck; broad low cooling shoulders.
    hammerhead: Object.freeze({ minPodSpan: 0.08, fitBodyDetails: true, noseSeat: 0.012, noseTipZ: -0.34, noseSlim: 4.10, noseDroop: 0.015, noseTipH: 0.55, noseMidSlim: 0.70, noseMidH: 0.65, airbox: 0.42, fin: 0, mirror: 2, inlet: 0.010, inletH: -0.040, inletW: 0.180, undercutD: 0.050, waist: 0.080, floorStep: -0.060, coverCrown: -0.040, coverLift: -0.120, wingStyle: W({ flaps: 2, arch: 0.24, twist: 0.08, foot: 0.78, canard: 0 }) }),
    // Swan: raised slim nose bridge over low pods and a sunken cover.
    swan: Object.freeze({ minPodSpan: 0.08, fitBodyDetails: true, noseSeat: 0.012, noseTipZ: 0.18, noseSlim: 0.84, noseLow: true, noseDroop: 0.200, noseTipH: 1.20, noseMidSlim: 0.86, noseMidH: 0.75, airbox: 0.38, fin: 0, mirror: 0, inlet: -0.030, inletH: -0.110, inletW: -0.100, undercutD: 0.060, waist: -0.080, floorStep: 0.030, coverCrown: 0.060, coverLift: -0.150, wingStyle: W({ arch: 1.08, twist: 0.32, foot: 1.40, tipRise: 0.050 }) }),
    // Manta: flat broad shoulders sweeping into a sharply pinched rear waist.
    manta: Object.freeze({ minPodSpan: 0.08, fitBodyDetails: true, noseSeat: 0.012, noseTipZ: -0.12, noseSlim: 1.80, noseDroop: 0.035, noseTipH: 0.70, noseMidSlim: 1.20, noseMidH: 0.80, airbox: 0.28, fin: 0, mirror: 2, inlet: 0.010, inletH: -0.040, inletW: 0.240, undercutD: 0.060, waist: -0.220, floorStep: -0.080, coverCrown: -0.060, coverLift: -0.140, wingStyle: W({ flaps: 2, arch: 0.32, twist: 0.10, chordTaper: 0.18, foot: 0.85 }) }),
    wasp: Object.freeze({ minPodSpan: 0.08, fitBodyDetails: true, noseSeat: 0.012, noseTipZ: 0.28, noseSlim: 0.86, noseTipH: 0.55, noseMidH: 0.62, noseLow: true, noseDroop: 0.040, airbox: 1.00, fin: 1, mirror: 1, inlet: -0.020, inletH: -0.080, inletW: -0.200, undercutD: 0.080, waist: 0.220, waistH: 0.230, floorStep: 0.070, coverCrown: 0.180, coverLift: 0.000, wingStyle: W({ arch: 0.80, twist: 0.26, chordTaper: 0.42, canard: 2 }) }),
    // Scorpion: low snout and front cover with a conspicuously rising tail crown.
    scorpion: Object.freeze({ minPodSpan: 0.08, fitBodyDetails: true, noseSeat: 0.012, noseTipZ: 0.40, noseSlim: 0.95, noseDroop: -0.020, noseTipH: 0.65, noseMidH: 0.75, airbox: 0.55, fin: 0, mirror: 1, inlet: 0.010, inletH: 0.040, inletW: -0.040, undercutD: 0.040, waist: -0.060, floorStep: 0.040, coverCrown: 0.140, coverLift: -0.150, coverTailLift: 0.390, wingStyle: W({ flaps: 2, arch: 0.95, twist: 0.34, foot: 1.40, tipRise: 0.045 }) }),
    // Blade: tall knife nose and upright radiator towers above a low flat cover.
    blade: Object.freeze({ minPodSpan: 0.08, fitBodyDetails: true, noseSeat: 0.012, noseTipZ: -0.10, noseSlim: 0.70, noseLow: true, noseDroop: 0.100, noseTipH: 2.60, noseMidSlim: 0.62, noseMidH: 1.70, airbox: 0.35, fin: 0, mirror: 0, inlet: 0.020, inletH: 0.260, inletW: -0.210, undercutD: 0.180, waist: -0.160, floorStep: 0.110, coverCrown: -0.080, coverLift: -0.130, wingStyle: W({ arch: 0.38, twist: 0.12, foot: 0.90, canard: 0 }) }),
    // B·D1 period bodies (Bryce's resized pick, 2026-10-20). fitSeat seats nose details
    // on the measured skin; sizes are cut to the shipped bodies' envelope (fin under
    // the roll hoop, noses within ~4 % of the tallest shipped one).
    // Highnose: 1990 Tyrrell 019 / Benetton B191 raised nose, slim cone, anhedral-ish wing.
    highnose: Object.freeze({ fitSeat: 1, noseTipZ: 0.16, noseSlim: 0.88, noseTipH: 0.62, noseMidH: 0.68, noseLow: true, noseDroop:  0.215, airbox: 1.00, fin: 0, mirror: 1, inlet:  0.020, inletH:  0.000, inletW:  0.020, undercutD:  0.040, waist: -0.040, floorStep:  0.020, coverCrown:  0.040, coverLift:  0.040, wingStyle: W({ arch: 1.10, twist: 0.30, teCurve: 0.14, foot: 1.40, tipRise: 0.060 }) }),
    // Sharkfin: 2008-11 / 2017 tall dorsal fin over a long raised cover, clutter wing.
    sharkfin: Object.freeze({ fitSeat: 1, noseTipZ: 0.25, noseSlim: 0.92, noseTipH: 0.70, noseMidH: 0.745, noseDroop: -0.020, airbox: 0.80, fin: 2, finH: 0.13, finRear: 2.0, finW: 0.018, mirror: 2, inlet: -0.020, inletH: -0.060, inletW:  0.160, undercutD:  0.080, waist: -0.060, floorStep:  0.040, coverCrown:  0.060, coverLift:  0.060, wingStyle: W({ flaps: 3, arch: 0.90, twist: 0.38, teCurve: 0.18, chordTaper: 0.44, canard: 2, tipRise: 0.050 }) }),
    // Downwash: 2023 RB19 — high wide mouth ramping steeply down to a low tail.
    lowline:  Object.freeze({ fitSeat: 1, noseTipZ: 0.20, noseSlim: 1.00, noseDroop: -0.028, airbox: 0.40, fin: 0, mirror: 0, inlet: -0.080, inletH: -0.200, inletW:  0.200, undercutD:  0.000, waist:  0.200, floorStep:  0.000, coverCrown:  0.000, coverLift: -0.160, wingStyle: W({ flaps: 2, arch: 0.30, twist: 0.10, teCurve: 0.04, chordTaper: 0.20, foot: 0.85, tipRise: 0.010 }) }),
    // Stepnose: 2012 Caterham CT01 / Ferrari F2012 — tall tub crown stepping down to a low cone.
    stepnose: Object.freeze({ fitSeat: 1, noseTipZ: 0.28, noseSlim: 1.00, noseDroop: -0.028, noseStep: 0.20, airbox: 1.30, fin: 1, mirror: 2, inlet:  0.040, inletH:  0.100, inletW:  0.060, undercutD:  0.060, waist: -0.060, floorStep:  0.030, coverCrown:  0.080, coverLift:  0.060, wingStyle: W({ flaps: 3, arch: 0.75, twist: 0.30, teCurve: 0.14, chordTaper: 0.40, canard: 2, tipRise: 0.040 }) }),
    // Auralis: high inlet shoulders, a dipped mid-pod roof and a narrow rear waist.
    auralis: Object.freeze({ minPodSpan: 0.08, fitBodyDetails: true, noseSculpt: true, noseTipZ: -0.16, noseSlim: 1.45, noseDroop: -0.028, noseTipH: 0.90, noseMidSlim: 1.08, noseMidH: 1.00, airbox: 0.70, fin: 0, mirror: 0, inlet: 0.010, inletH: 0.130, inletW: 0.100, undercutD: 0.120, waist: -0.100, floorStep: 0.040, coverCrown: -0.020, coverLift: -0.080, podRelief: Object.freeze([[0, 0, 0], [0, 0, 0], [0.04, -0.025, 0], [0.03, -0.015, 0.035], [0.03, 0.06, 0.045], [0, 0.02, 0], [0, 0, 0]].map(Object.freeze)), podSculpt: Object.freeze({ complete: true, coverArch: 0.065, coverBulge: 0.22, ductDepth: 0.14, mouth: 0.68, exitDepth: 0.08, channel: 0.090, crown: 0.015, belly: 0.34, waist: 0.36 }), wingStyle: W({ wave: 0, arch: 0.88, twist: 0.22, teCurve: 0.09, chordTaper: 0.28, foot: 1.10, canard: 0, tipRise: 0.030 }) }),
    // Cevora: high-set slender cooling pods expose a broad floor below a low straight cover.
    cevora: Object.freeze({ minPodSpan: 0.08, fitBodyDetails: true, noseSculpt: true, noseTipZ: -0.12, noseSlim: 1.25, noseDroop: -0.028, noseTipH: 0.80, noseMidSlim: 1.00, noseMidH: 0.92, airbox: 0.34, fin: 0, mirror: 0, inlet: 0.020, inletH: 0.090, inletW: -0.170, undercutD: 0.160, waist: -0.160, floorStep: 0.060, coverCrown: -0.070, coverLift: -0.130, podRelief: Object.freeze([[0, 0, 0.02], [0, 0.02, 0.05], [-0.08, 0.02, 0.06], [-0.06, 0.02, 0.06], [0, 0.01, 0.03], [0, 0, 0.01], [0, 0, 0]].map(Object.freeze)), podSculpt: Object.freeze({ complete: true, coverArch: -0.035, coverBulge: 0.08, ductDepth: 0.10, mouth: 0.80, exitDepth: 0.045, channel: 0, crown: 0.035, belly: 0.40 }), wingStyle: W({ wave: 0, flaps: 2, arch: 0.20, twist: 0.05, teCurve: 0.015, chordTaper: 0.12, foot: 0.72, canard: 0, tipRise: 0.003 }) }),
    // Vantrel: broad low triangular shoulders converge continuously toward the rear.
    vantrel: Object.freeze({ minPodSpan: 0.08, fitBodyDetails: true, noseSculpt: true, noseTipZ: -0.20, noseSlim: 1.95, noseDroop: -0.028, noseTipH: 1.00, noseMidSlim: 1.22, noseMidH: 1.02, airbox: 1.20, fin: 0, mirror: 1, inlet: 0.010, inletH: 0.030, inletW: 0.210, undercutD: 0.020, waist: -0.100, floorStep: -0.025, coverCrown: 0.060, coverLift: 0.020, podRelief: Object.freeze([[0, 0, 0], [0, 0, 0], [0.08, -0.02, 0], [0.05, -0.02, 0], [0.03, -0.01, 0], [0, 0, 0], [-0.02, 0, 0]].map(Object.freeze)), podSculpt: Object.freeze({ complete: true, coverArch: 0.035, coverBulge: 0.28, ductDepth: 0.12, mouth: 0.72, exitDepth: 0.07, channel: 0, crown: 0.035, belly: 0.22 }), wingStyle: W({ wave: 0, arch: 1.02, twist: 0.28, teCurve: 0.12, chordTaper: 0.34, foot: 1.25, canard: 0, tipRise: 0.040 }) }),
    // Orynth: narrow inlet, swelling raised aft shoulder and a low tapering cover.
    orynth: Object.freeze({ minPodSpan: 0.08, fitBodyDetails: true, noseSculpt: true, noseTipZ: -0.16, noseSlim: 1.42, noseDroop: -0.028, noseTipH: 0.88, noseMidSlim: 1.08, noseMidH: 0.96, airbox: 0.52, fin: 0, mirror: 2, inlet: -0.010, inletH: -0.020, inletW: 0.020, undercutD: 0.080, waist: -0.060, floorStep: 0.025, coverCrown: 0.080, coverLift: -0.100, podRelief: Object.freeze([[0, 0, 0], [-0.04, -0.02, 0], [-0.08, -0.04, 0], [0.07, 0.08, 0.08], [0.10, 0.14, 0.10], [-0.03, 0.03, 0], [-0.04, 0, 0]].map(Object.freeze)), podSculpt: Object.freeze({ complete: true, coverArch: 0.085, coverBulge: 0.18, ductDepth: 0.16, mouth: 0.66, exitDepth: 0.10, channel: 0.045, crown: 0.010, belly: 0.42, waist: 0.22 }), wingStyle: W({ wave: 0.015, arch: 0.75, twist: 0.24, teCurve: 0.10, chordTaper: 0.30, foot: 1.15, canard: 0, tipRise: 0.030 }) }),
    // B·D1d concept bodies (Bryce's 2026-10-20 sheet; sizes inside the shipped p75 but pod top, his one allowed overrun; wings: aero lane D3c, style_aero_*). Rift: pointed nose, flank scoop.
    rift:    Object.freeze({ fitSeat: 1, airScoop: 1, flankLip: 0.05, podShape: { chine: [0.036, 0.036, 0.030, 0.020, 0.010, 0.004, 0.004], top: [0.10, 0.12, 0.14, 0.15, 0.10, 0.04, 0.00], out: [0.030, 0.000, 0.010, 0.053, 0.046, 0.020, 0.000], bot: [0.03, 0.06, 0.08, 0.07, 0.04, 0.02, 0.00] }, flank: [0.30, -0.80, 0.58, 0.62, 0.48, 0.16], noseTipZ:  0.00, noseSlim: 0.88, noseDroop: -0.010, airbox: 1.00, fin: 0, mirror: 2, inlet: -0.030, inletH:   0.000, inletW: -0.040, undercutD:   0.080, waist: -0.040, floorStep:  0.040, coverCrown:   0.000, coverLift:  0.000, wingStyle: W({ arch: 0.85, twist: 0.30, teCurve: 0.14, chordTaper: 0.38, foot: 1.30, canard: 2, tipRise: 0.042 }) }),
    // Keel: long low flat nose, slab sides tapering straight back. Delta: chined nose, triangle cut-in. Serpent: S-curve waist and band.
    keel:    Object.freeze({ fitSeat: 1, airScoop: 1, flankLip: 0.04, flank: [0.40, -0.30, 0.56, 0.54, 0.34, 0.22], podShape: { chine: [0.004, 0.004, 0.032, 0.048, 0.040, 0.030, 0.020], top: [0.12, 0.12, 0.12, 0.12, 0.12, 0.08, 0.03], out: [0.060, 0.070, 0.074, 0.034, 0.036, 0.030, 0.000], bot: [-0.02, -0.03, -0.04, -0.03, -0.02, -0.01, 0.00] }, noseTipZ:  0.06, noseSlim: 0.86, noseDroop: -0.012, airbox: 1.00, fin: 0, mirror: 1, inlet:  0.010, inletH: 0.000, inletW:  -0.045, undercutD: 0.080, waist:   0.000, floorStep:  0.000, coverCrown:  0.000, coverLift:  0.000, wingStyle: W({ arch: 0.45, twist: 0.12, teCurve: 0.020, chordTaper: 0.10, foot: 0.90, canard: 1, tipRise: 0.004 }) }),
    delta:   Object.freeze({ fitSeat: 1, airScoop: 1, flankLip: 0.045, facet: 1, podShape: { chine: [0.060, 0.060, 0.055, 0.034, 0.022, 0.012, 0.008], top: [0.18, 0.15, 0.10, 0.04, 0.00, -0.02, -0.02], out: [0.060, 0.070, 0.074, 0.049, 0.045, 0.020, 0.000], bot: [0.07, 0.07, 0.05, 0.01, 0.00, 0.00, 0.00] }, flank: [0.26, -0.70, 0.40, 0.58, 0.66, 0.06], noseChine: 1, noseTipZ:  -0.04, noseSlim: 0.96, noseDroop: -0.016, airbox: 1.00, fin: 1, mirror: 0, inlet:  0.040, inletH: 0.000, inletW:   -0.045, undercutD:   0.080, waist: -0.030, floorStep:   0.020, coverCrown:   0.000, coverLift:  0.000, wingStyle: W({ arch: 1.10, twist: 0.34, teCurve: 0.16, chordTaper: 0.42, foot: 1.45, canard: 2, tipRise: 0.075 }) }),
    serpent: Object.freeze({ fitSeat: 1, airScoop: 1, flankLip: 0.04, podShape: { top: [0.13, 0.09, 0.02, -0.03, 0.05, 0.06, 0.02], out: [0.030, 0.030, 0.077, 0.054, 0.047, 0.040, 0.010], bot: [0.02, 0.04, 0.05, 0.02, 0.00, 0.00, 0.00] }, flank: [0.36, -0.85, 0.30, 0.70, 0.22, 0.14], noseTipZ:  0.00, noseSlim: 0.92, noseDroop: -0.010, airbox: 1.00, fin: 0, mirror: 1, inlet: -0.020, inletH: 0.000, inletW:  -0.045, undercutD:   0.080, waist: -0.040, floorStep:  0.030, coverCrown:   0.020, coverLift:   0.000, wingStyle: W({ arch: 0.95, twist: 0.40, teCurve: 0.20, chordTaper: 0.46, foot: 1.25, canard: 1, tipRise: 0.060 }) }),
    // Blender-derived studies: independent IDs from the Rift/Keel/Delta/Serpent
    // campaign. fitSeat keeps nose attachments on the measured skin; the existing
    // body anchors own pod/cover clearances and decal placement for these too.
    // Caldra: tapered beak, raised cooling shoulder and a deeply pinched waist.
    caldra: Object.freeze({ fitSeat: 1, nosePlan: Object.freeze([0.30, 0.40, 0.48, 0.48, 0.48]), noseCurve: 2.7, spineCurve: 0.04, podProfile: "caldra", noseTipZ: -0.04, noseSlim: 2.26087, noseDroop: -0.028, airbox: 0.88, fin: 0, mirror: 1, inlet: 0.010, inletH: 0.000, inletW: -0.040, undercutD: 0.120, waist: -0.100, floorStep: 0.035, coverCrown: 0.02, coverLift: 0.025, wingStyle: W({ clean: 1, canard: 0, arch: 0.55, twist: 0.18, teCurve: 0.065, chordTaper: 0.22, foot: 0.92, tipRise: 0.018 }) }),
    // Rovik: blunt shovel nose, long low cooling shelf and a flat spine.
    rovik: Object.freeze({ fitSeat: 1, nosePlan: Object.freeze([0.44, 0.46, 0.48, 0.48, 0.48]), noseCurve: 1.65, spineCurve: 0.012, podProfile: "rovik", noseTipZ: -0.16, noseSlim: 3.47826, noseDroop: -0.028, airbox: 0.68, fin: 0, mirror: 0, inlet: -0.040, inletH: -0.08, inletW: -0.080, undercutD: 0.065, waist: -0.03, floorStep: -0.015, coverCrown: 0.005, coverLift: -0.04, wingStyle: W({ clean: 1, canard: 0, arch: 0.2, twist: 0.06, teCurve: 0.02, chordTaper: 0.12, foot: 0.82, tipRise: 0.006 }) }),
    // Senzo: chined wedge nose and a broad triangular cooling shoulder.
    senzo: Object.freeze({ fitSeat: 1, nosePlan: Object.freeze([0.28, 0.36, 0.46, 0.48, 0.48]), noseCurve: 2.0, spineCurve: 0.008, podProfile: "senzo", noseTipZ: -0.06, noseSlim: 2.43478, noseDroop: -0.028, airbox: 1.05, fin: 0, mirror: 2, inlet: 0.060, inletH: -0.005, inletW: -0.05, undercutD: -0.020, waist: 0.02, floorStep: 0.025, coverCrown: 0.01, coverLift: -0.06, wingStyle: W({ clean: 1, arch: 0.72, twist: 0.22, teCurve: 0.09, chordTaper: 0.28, foot: 0.98, canard: 0, tipRise: 0.025 }) }),
    // Talven: spoon nose, S-curved pod waist and a visibly arched spine.
    talven: Object.freeze({ fitSeat: 1, nosePlan: Object.freeze([0.40, 0.36, 0.42, 0.48, 0.48]), noseCurve: 3.1, spineCurve: 0.07, podProfile: "talven", noseTipZ: -0.12, noseSlim: 3.13043, noseDroop: -0.028, airbox: 0.90, fin: 0, mirror: 0, inlet: -0.020, inletH: -0.005, inletW: -0.035, undercutD: 0.100, waist: -0.1, floorStep: 0.040, coverCrown: 0.03, coverLift: 0.035, wingStyle: W({ clean: 1, canard: 0, arch: 0.82, twist: 0.25, teCurve: 0.11, chordTaper: 0.3, foot: 1.02, tipRise: 0.03 }) }),
    // Orvex: raised slender bridge nose, tight upright pods and a high curved spine.
    orvex: Object.freeze({ fitSeat: 1, nosePlan: Object.freeze([.26,.27,.34,.46,.48]), noseCurve: 2.8, spineCurve: .055, podProfile: "orvex", noseTipZ: -.08, noseSlim: 2.26, noseDroop: .075, airbox: .72, fin: 0, mirror: 1, inlet: -.025, inletH: -0.08, inletW: -.080, undercutD: .11, waist: -.12, floorStep: .025, coverCrown: 0.02, coverLift: 0.025, wingStyle: W({ clean: 1, canard: 0, arch: .55, twist: .08, teCurve: .035, chordTaper: .18, foot: .88, tipRise: .02 }) }),
    // Nacrel: blunt low slab nose, full box shoulders and a low almost-level cover.
    nacrel: Object.freeze({ fitSeat: 1, nosePlan: Object.freeze([.46,.48,.48,.48,.48]), noseCurve: 1.1, spineCurve: .006, podProfile: "nacrel", noseTipZ: -.16, noseSlim: 3.65, noseDroop: -.028, airbox: .62, fin: 0, mirror: 2, inlet: .015, inletH: -0.04, inletW: .005, undercutD: .015, waist: .02, floorStep: .015, coverCrown: 0.005, coverLift: -0.04, wingStyle: W({ clean: 1, canard: 0, arch: .10, twist: .04, teCurve: .012, chordTaper: .08, foot: .82, tipRise: .004 }) }),
  });
  // Saved team swaps remain accepted; hide picker swaps until they differ visibly
  // in side and 3/4 review (previously only 2–5% of pixels changed).
  const ALLOW_TEAM_BODY_SWAP = false;
  const BODY_STYLE_IDS = Object.freeze([
    ...Object.keys(BODY_STYLES),
    ...(ALLOW_TEAM_BODY_SWAP ? Object.keys(TEAM_STYLE) : []),
  ]);
  function teamStyleOf(teamId) {
    return (teamId && (TEAM_STYLE[teamId] || BODY_STYLES[teamId])) || DEFAULT_STYLE;
  }
  // The style key a car's GEOMETRY is built from: the livery's bodyStyle when it
  // names a known body, else the team's own. Every geometry caller (Car3D.build,
  // decal anchors, mirror lights) resolves through this so they cannot disagree.
  // Team ids still resolve even when ALLOW_TEAM_BODY_SWAP is false (saved liveries).
  function bodyStyleKey(teamId, bodyStyle) {
    return bodyStyle && (TEAM_STYLE[bodyStyle] || BODY_STYLES[bodyStyle]) ? bodyStyle : teamId;
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

  const geometry = CarGeometry.create({ SURFACES, CARBON, DARK, INTAKE, TYRE, RIM, HUB, HALO, VISOR, PANEL });
  const { addTri, addQuad, addLoft, addBox, addBlock, addSpan, foilThick, FOIL_CAMBER,
    foilAt, addWingFoil, addStationLoft, addTopBevel, addBeveledSpan, addBeamBetween,
    addFairedArm, addWishboneWeb, addTube } = geometry;

  // shadeFlags.round / coverHi: mutated for one build(), then reset (was _round / _coverHi).
  const shadeFlags = { round: false, coverHi: true };
  // The driver's lid, in build() and alone for a teammate (CarMaterials.reseat). Paint-edge splits (~+2k tris on
  // busy lids) matter only large on screen: field AI bodies (tens of px) and depth silhouettes drop them to 0.
  function emitHelmet(out, opts, c1, liv, sil) {
    const des = Helmets.styled(Helmets.designFor(opts && opts.num, c1, helmetKey(opts)), liv.helmetStyle, liv.helmetBase, liv.helmetAccent), flat = sil || !!(opts && opts.field);
    Helmets.build(out, 0, 0.715, -0.075, des, { paint: SURFACES.paint, glass: SURFACES.visor, maxSplit: flat ? 0 : undefined, simplePaint: flat });
  }

  const { addWheel, buildWheel, buildWheelLayers } = CarWheels.create({
    geometry, SURFACES, TYRE, INTAKE,
  });

  const body = CarBodyGeom.create({
    SURFACES, CARBON, DARK, INTAKE, PANEL,
    TYRE_BAND, BRAKE_CALIPER,
    AXLES, CHASSIS, DEFAULT_STYLE, DEFAULT_WING, TEAM_STYLE, BODY_STYLES, teamStyleOf,
    geometry, shadeFlags,
  });
  const {
    styledNoseStations, noseFlankX, bodySpan, haloHoopPath,
    endplateGeom, wingOf, wingFoilOf, frontCascade, frontBakedCount, frontHalf, frontPlateGeom,
    aeroFlapsGeom, solveFlapsGeom, buildFlapGeom, aeroFlapAim, wingBandGeom, numberBoard, shapeLift, rearMainOf,
    FIN_SHAPES, FIN_SHAPE_IDS, FIN, sharkFinRoot, sharkFinPanel, sharkFinBadge, finOf, finTop,
    COVER_VENT_IDS, SPINE_HEIGHT_IDS, spineRise, COVER_STACK,
    coverProfile, coverFlankX, coverSurfaceY, COVER_CROWN,
    mirrorLightAnchors, cockpitMirrorGlass,
    buildPartRecipes, aeroLevelOf, aeroStyleOf,
    buildSharedChassis, bodyAnchors, fitBodyDetails, addInletMouth,
    buildSidepodBodywork, buildEngineCoverBodywork, addNoseSDuct, CAR_HALF,
  } = body;

  const { PH_HALO, PH_HOOP, PH_MIRROR, PH_RIM, FINISH_FIELDS, finishPass, refinish } = CarMaterials;   // finish stand-ins
  // One appearance recipe for baked geometry, moving flaps and decal anchors.
  // Fitted parts remain authoritative for performance, budget and ownership.
  const PART_STYLE_FIELDS = Object.freeze({
    engineShape: "engine", aeroShape: "aero", suspensionShape: "suspension", brakesShape: "brakes",
    tyresShape: "tyres", ersShape: "ers", gearboxShape: "gearbox", fuelShape: "fuel",
    exhaustShape: "exhaust", floorShape: "floor", cockpitShape: "cockpit", wheelsShape: "wheels",
  });
  function appearanceParts(fitted, liv) {
    let out = fitted;
    if (typeof Parts !== "undefined") for (const [key, category] of Object.entries(PART_STYLE_FIELDS)) {
      if (!liv[key] || liv[key] === "fitted") continue;
      const cat = Parts.CATALOG.find((c) => c.id === category);
      const option = cat && cat.options.find((o) => o.tag === "STYLE" && o.id === liv[key]);
      if (!option) continue;
      if (out === fitted) out = Object.assign({}, fitted, { _visual: Object.assign({}, fitted._visual), _ids: Object.assign({}, fitted._ids) });
      out[category] = option.visualTier != null ? option.visualTier : 1;
      out._visual[category] = Object.assign({ id: option.id, tier: out[category] }, option.visual); out._ids[category] = option.id;
    }
    return out;
  }

  function buildOne(color, color2, opts) {
    const noWheels = opts && opts.noWheels;
    const teamId = opts && opts.teamId;
    // Field body / silhouette = mid & far track LODs: keep the cheap cover.
    // Player, garage, and painted rivals get the dense garage/near cover.
    shadeFlags.coverHi = !(opts && (opts.field || opts.silhouette));
    Log.info("car", "build" + (teamId ? " " + teamId : ""));
    const out = { pos: [], nrm: [], col: [], mat: [], idx: [] };
    const sections = [];
    const part = (name) => {
      const at = out.pos.length / 3;
      if (sections.length) sections[sections.length - 1].to = at;
      sections.push({ name, from: at, to: at, ifrom: out.idx.length });   // ifrom: reseat finds the lid triangles
    };
    const zoneRanges = [], zone = (name, draw) => { const from = out.pos.length / 3; draw(); zoneRanges.push({ name, from, to: out.pos.length / 3 }); };   // #2796: livery-section paint that takes a zone's finish
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
    // chassis→livery sections so carbon / wings / glass stay untouched. It wins
    // over `lower` / `upper` (CarShade.lowerZone / upperZone).
    const bodySplitLR = liv.bodySplit === "lr";
    const haloTint = _ckAcc(liv.halo) || null;
    const endplateC = _ckAcc(liv.endplate) || null, haloMetal = PH_HALO;   // ENDPLATES (front else c2, rear else DARK); an explicit HALO FINISH lands on the titanium (#2796 1)
    const T = appearanceParts((opts && opts.parts) || {}, liv);
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
    const styleKey = bodyStyleKey(opts && opts.teamId, liv.bodyStyle);
    const teamStyle = teamStyleOf(styleKey);
    const ckpt = opts && opts.cockpit;   // hoisted: buildSharedChassis needs it
    // ownHalo (exterior builds only): the cockpit build's halo (opts.halo, the
    // player's COCKPIT halo choice; 0 = none) replaces the factory hoop and its
    // head-surround attachments (blade, wing, cam pods, screen). The player's
    // first-person shadow caster (car-draw.js cockpitShadowMesh): the real car
    // around the seat, but nothing over the cockpit the player cannot see.
    const exHalo = !ckpt && !(opts && opts.ownHalo);
    const shade = !ckpt && typeof CarShade !== "undefined" && (opts && opts.smooth != null ? !!opts.smooth : CarShade.on(teamId));
    const anchors = bodyAnchors(T, styleKey, liv.spineHeight, shade);   // rounded: coke foot + downwash ramp
    const bodyDetails = fitBodyDetails(anchors, teamStyle);
    const floorEdge = Math.max(0.72, Math.min(1.35, aeroStyle.floorEdge));
    const floorCut = Math.max(0, Math.min(0.24, aeroStyle.floorCut));
    // Same envelope the front wing now respects: at the catalog's widest floor
    // recipe the edge rails measured x 0.970 and the diffuser 0.960, outside the
    // 1900 mm car. The rails carry an edge lip and a gurney another ~45 mm
    // outboard of whatever this returns, so the cap leaves that much room.
    const floorX = (k) => Math.min(CAR_HALF - 0.055, k * floorEdge);
    // ≥ −0.03 (team worst −0.025): barge's −0.12 put the edge rail under the road (#3111 F6); fitBodyDetails fits its own (below).
    const floorStep = teamStyle.fitBodyDetails ? (teamStyle.floorStep || 0) : Math.max(-0.03, teamStyle.floorStep || 0);
    const floorEdgeAt = (z) => {   // hoisted too: the rounded floor plate (CarShade.floor) follows it
      // Rear taper eased in (C1) from t 0.3: the old hinge at t 0.5 (z -0.40)
      // creased the floor plate and everything riding its edge. Same ends.
      const t = Math.max(0, Math.min(1, (0.78 - z) / 2.36)), u = Math.max(0, (t - 0.3) / 0.7);
      return floorX(0.70 + floorStep - 0.16 * u * u);
    };

    part("chassis");
    shadeFlags.round = shade;
    const bodySplitFrom = out.pos.length / 3;
    const rideDY = suspStyle ? suspStyle.ride : (suspT === 0 ? 0.060 : suspT === 2 ? -0.048 : 0);
    const floorStepY = bodyDetails ? bodyDetails.floorStep(floorStep, rideDY) : floorStep * 0.85;
    // Curved studies paint the continuous nose skin, rather than a straight
    // tip overlay that hides their shoulders and cuts through the crown.
    const nosePaint = teamStyle.noseCurve ? noseC || c1 : c1;
    buildSharedChassis(out, c1, rideDY, styledNoseStations(teamStyle), ckpt, floorEdgeAt, opts && opts.measure, nosePaint);

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
      bodySpan(out, deck[i], deck[i + 1], nosePaint, 0.026);
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
        CarMaterials.smoothSkin(out,start);
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
      // Concept bodies (not the narrow-waisted needle, whose pods wrap the old block) seat the block between
      // the tub and the pod's inner wall: 0.24/0.40 ran 30-40 mm into both (#3156 row 2).
      const fit = BODY_STYLES[styleKey] === teamStyle && !(teamStyle.waist < -0.2), iF = fit ? 0.27 : 0.24;
      const bF = fit ? Math.min(0.40, anchors.podAt(0.12).inner + 0.004) : 0.40, bR = fit ? Math.min(0.40, anchors.podAt(-0.43).inner + 0.004) : 0.40;
      for (const s of [-1, 1]) {
        (shadeFlags.round ? CarShade.blockFn(addTri, { r: [0, 0.03, 0.07, 0.02] }) : addBlock)(out, [   // rounded: outer shoulder r 70 mm
          [s*iF, 0.42, 0.14], [s*bF, 0.42, 0.14], [s*bF, 0.60, 0.10], [s*iF, 0.58, 0.10],
          [s*0.24, 0.44, -0.42], [s*bR, 0.44, -0.42], [s*bR, 0.62, -0.44], [s*0.24, 0.60, -0.44],
        ], c1);
      }
    }

    part("sidepods");
    const podSkinFrom = out.pos.length / 3;
    const podGeom = buildSidepodBodywork(out, podC || c1, engStyle, anchors, !!teamStyle.facet);
    if (opts && opts.measure) out.podSkin = { from: podSkinFrom, to: out.pos.length / 3 };
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
      const stops = [zFront, ...(anchors.podStops || anchors.podStations).map((p) => p.z)
        .filter((z) => z < zFront && z > zRear), zRear].sort((a, b) => b - a);
      for (const side of [-1, 1]) {
        for (let i = 0; i < stops.length - 1; i++) {
          const a = anchors.podAt(stops[i]), b = anchors.podAt(stops[i + 1]);
            if (anchors.podSculpt) {
              const half = fracH ? height * 0.5 : Math.min(height / (a.top - a.bottom), 0.78) * 0.5;
              const cuts = [yFrac - half, ...[0.22, 0.65].filter(f => f > yFrac - half && f < yFrac + half), yFrac + half];
              const point = (z, f) => { const p = anchors.podFlank(z, f); return [side * (p[0] + 0.002), p[1], z]; };
              for (let k = 0; k < cuts.length - 1; k++) {
                const q = [point(stops[i], cuts[k]), point(stops[i + 1], cuts[k]),
                  point(stops[i + 1], cuts[k + 1]), point(stops[i], cuts[k + 1])];
                if (side < 0) q.reverse();
                addQuad(out, ...q, col, surface);
              }
              continue;
            }
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

    // Floor edge rail: ONE loft along floorEdgeAt (was two spans + a z -0.45 joint box, outer face
    // stepped 15-52 mm). Heights ease C1 from the z 0.78 to the -1.58 datums (flat to -0.15 like the
    // old front span, then its rear rise); floorCut keeps its flare; behind z -1.15 it tucks with the
    // rounded plate's tyre cut (CarShade.floor), soft-min'd, instead of running into the rear tyre.
    const railS = (z) => { const d = Math.max(0, -0.15 - z);
      return (0.0085 * (0.78 - z) + 0.0283 * (d < 0.6 ? d * d / 1.2 : d - 0.3)) / 0.052039; };
    const railQ = (z, f, r) => f + (r - f) * railS(z), railFlare = floorX(0.54 + floorCut * 0.35) - floorEdgeAt(-1.58);
    const railCap = (z) => { const u = Math.max(0, Math.min(1, (-1.15 - z) / 0.15));
      return (u <= 0 ? 0.705 + (z + 1.15) : 0.555 + 0.15 * (1 - u * u * (3 - 2 * u))) - 0.025; };
    const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
    const railAt = (z) => ({ z, x: smin(floorEdgeAt(z) + railFlare * ((0.78 - z) / 2.36) ** 2, railCap(z), 0.04),
      y: railQ(z, 0.108 + floorStepY, 0.150 + floorStepY * 0.25) + rideDY, w: railQ(z, 0.062, 0.040),
      h: railQ(z, 0.048 + Math.max(0, floorStepY) * 0.35, 0.068) });
    const railN = ckpt ? 5 : 13, railZ = (i) => 0.78 - i * 2.36 / (railN - 1);   // onboard: keep its tri budget
    const railTop = (z) => {   // the top AS MESHED (chords between stations): what the fences sit on
      const f = Math.max(0, Math.min(railN - 1 - 1e-9, (0.78 - z) / 2.36 * (railN - 1))), i = Math.floor(f);
      const a = railAt(railZ(i)), b = railAt(railZ(i + 1));
      return a.y + a.h / 2 + (b.y + b.h / 2 - a.y - a.h / 2) * (f - i);
    };
    zone("floor", () => { for (const side of [-1, 1]) {
      addStationLoft(out, Array.from({ length: railN }, (_, i) => {
        // Square floor: a bottom buried in the 1.5 m plate sits on its top instead (hidden either way).
        const r = railAt(railZ(i)), x = side * r.x, fl = CHASSIS.floor;
        const yb = !shade && r.x + r.w / 2 < fl.sx / 2 ? Math.max(r.y - r.h / 2, Math.max(fl.cy + rideDY, 0.052) + fl.sy / 2 + 0.003) : r.y - r.h / 2;
        return [[x - r.w / 2, yb, r.z], [x + r.w / 2, yb, r.z],
                [x + r.w / 2, r.y + r.h / 2, r.z], [x - r.w / 2, r.y + r.h / 2, r.z]];
      }), CARBON, null, SURFACES.carbon);
    } });
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
    let coverGeom = null, finTail = null;   // finTail: the fin's rear stations, for the sail into the rear wing
    if (!ckpt) {
      const engT = tier("engine");
      // ≤ 1.9 (grid max 1.85): arched x a 1.40 PU gave 3.36, hoop base over its 0.968 top (#3111 F5).
      const inScale = Math.min(teamStyle.fitBodyDetails ? 1.78 : 1.9, (engStyle ? engStyle.in : (engT === 0 ? 0.52 : engT === 2 ? 1.65 : 1.0)) * teamStyle.airbox);
      const engSnork = engStyle ? !!engStyle.snork : engT === 2;
      // Roll hoop / snorkel / intake lips: airboxMeshColour (wrap sun wins).
      const airboxC = (typeof LiveryTex !== "undefined" && LiveryTex.airboxMeshColour)
        ? (_ckAcc(LiveryTex.airboxMeshColour(teamId, liv, coverC)) || coverC)
        : coverC;
      (shadeFlags.round ? (o, a, b, c, f) => CarShade.loft(o, a, b, c, addTri, { frontCol: f }) : addSpan)(out, { z: -0.28, y: 0.76, w: 0.30 * inScale, h: 0.20 * inScale, t: 0.55 },
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
      (shadeFlags.round ? (o, a, b, c) => CarShade.loft(o, a, b, c, addTri, { n: 16 }) : addSpan)(out, { z: -0.33, y: (hoopF + 0.968) / 2, w: 0.15 * inScale,
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
      if (opts && opts.measure) out.coverSkin = coverGeom.skin;
      // Optional scoop lip on the roll-hoop mouth (recipe-gated; default 0).
      const scoopLip = Math.max(0, Math.min(2, Math.round((engStyle && engStyle.scoopLip) || 0)));
      // Seated on the mouth loft above (top 0.76 + 0.10*inScale, trapezoid t 0.55), not
      // literals: a 0.2-1.78 airbox scale left the lip 28-57 mm off its mouth (B·H13 D3).
      const mouthTop = 0.76 + 0.10 * inScale, mouthHW = (y) => 0.15 * inScale * (1 - 0.45 * (y - mouthTop + 0.20 * inScale) / (0.20 * inScale));
      // A tiny airbox (inScale < 0.56: needle, swan, blade…) has no room above the helmet for one.
      const lipOn = mouthTop - 0.016 >= 0.80;
      if (scoopLip >= 1 && lipOn) addBox(out, 0, mouthTop - 0.016, -0.265, 2 * mouthHW(mouthTop - 0.016), 0.032, 0.030, INTAKE);
      if (scoopLip >= 2 && mouthTop >= 0.85) for (const s of [-1, 1])   // cheeks hang 64 mm: clear of the helmet
        addBox(out, s * Math.min(0.115 * inScale, mouthHW(mouthTop - 0.036) - 0.012), mouthTop - 0.036, -0.295, 0.045, 0.055, 0.055, CARBON);
      // airScoop (B·D1d concept bodies, opt-in): a framed mouth — cheeks running back either side of
      // the airbox / snorkel (they read from the chase cam), a top bar, and a dark recessed panel
      // filling the opening, so the intake reads as a cut-out as on the sheet. Both airbox paths.
      const scoopFrame = (zF, halfW, top, bot, zTail, yTail, panelZ) => {
        const cw = 0.026;
        for (const s of [-1, 1]) {
          const x = s * (halfW + cw / 2 - 0.006);
          addSpan(out, { z: zF, x, y: (top + bot) / 2, w: cw, h: top - bot, t: 0.9 },
                       { z: zTail, x: x * 0.92, y: yTail, w: cw * 0.8, h: 0.06, t: 0.9 }, airboxC);
        }
        addBox(out, 0, top - 0.014, zF - 0.017, (halfW + cw) * 2 - 0.020, 0.028, 0.040, airboxC);
        addBox(out, 0, (bot + top - 0.028) / 2 + 0.0025, panelZ, halfW * 2 - 0.004, top - 0.028 - bot + 0.005, 0.030, INTAKE, SURFACES.carbon);
      };
      if (teamStyle.airScoop && !engSnork) scoopFrame(-0.255, 0.30 * inScale / 2, 0.952, 0.70, -0.46, 0.80, -0.300);
      if (engSnork) {
        const sk = 0.78 + inScale * 0.32;
        const mouth = { z: -0.12, y: 0.96, w: 0.15 * sk, h: 0.10 * sk, t: 0.62 };
        const crest = { z: -0.38, y: 1.02, w: 0.12 * sk, h: 0.13 * sk, t: 0.55 };
        const merge = { z: -0.68, y: 0.88, w: 0.10 * sk, h: 0.09 * sk, t: 0.50 };
        addSpan(out, mouth, crest, airboxC, INTAKE);
        addBeveledSpan(out, crest, merge, 0.010, airboxC, null);
        // fitSeat: a low cover / small airbox left this fixed-height snorkel 8-14 cm
        // in the air (lowline); fair its underside down into the cover.
        if (teamStyle.fitSeat) {
          const under = (z) => { const r = z > crest.z, A = r ? mouth : crest, B = r ? crest : merge, t = (A.z - z) / (A.z - B.z);
            const lo = A.y - A.h / 2 + (B.y - B.h / 2 - (A.y - A.h / 2)) * t + 0.012, c = anchors.coverAt(z).top - 0.015;
            return { z, y: (lo + c) / 2, w: (A.w + (B.w - A.w) * t) * 0.86, h: Math.max(0.02, lo - c) }; };
          addSpan(out, under(-0.31), under(crest.z), airboxC);   // front 3 cm behind the airbox mouth plane (z -0.28): no coplanar faces
          addSpan(out, under(crest.z), under(-0.64), airboxC);
        }
        addBox(out, 0, mouth.y + 0.01, mouth.z + 0.01,
               mouth.w * 0.72, mouth.h * 0.55, 0.04, INTAKE);
        if (teamStyle.airScoop) scoopFrame(mouth.z + 0.015, mouth.w / 2, mouth.y + mouth.h / 2 + 0.03,
          mouth.y - mouth.h / 2 - 0.012, crest.z, crest.y, mouth.z - 0.003);
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
              CarMaterials.tcamColour(liv.tcam, opts && opts.teamId, opts && opts.num, accentC), [0.05, 0.05, 0.06]);
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
        if (anchors.curvedCover) {
          const at = (z) => { const c = anchors.coverAt(z), q = coverProfile(c).pts;
            return { z, y: c.top + COVER_STACK.shield - sh / 2,
              w: Math.min(0.18 * engStyle.heatShield, 1.9 * q[q.length - 1][0]), h: sh }; };
          addSpan(out, at(-1.43), at(-1.73), [0.30,0.28,0.26], null, SURFACES.metal);
        } else addBox(out, 0, p.top + COVER_STACK.shield - sh / 2, -1.58,
          Math.min(0.18 * engStyle.heatShield, 1.9 * COVER_CROWN * p.x),
          sh, 0.30, [0.30,0.28,0.26], SURFACES.metal);
      }
      // SHOULDER LOUVRES (`louvre` 1-3 = 4/7/10 slats a side; 0 = none) AFT of the ERS blister
      // on the same facet (it buried a z -0.86 band), inboard of outlet 3, on the DENSE garage
      // profile (the four-key polyline coverSurfaceY reads sank the aft slats).
      const louvre = Math.max(0, Math.min(3, Math.round(engStyle.louvre || 0)));
      const lvB = ckpt ? 0 : Math.round((ersStyle && ersStyle.blister) || 0);
      const lvZ0 = lvB >= 2 ? -1.31 : lvB ? -1.15 : -0.86, [lvIn, lvOut] = engOutlet === 3 ? [0.30, 0.50] : [0.38, 0.70];
      const skinY = (p, x) => {
        const q = coverProfile(p, shadeFlags.round && shadeFlags.coverHi).pts, ax = Math.abs(x);
        let i = q.length - 1;
        while (i > 0 && ax > q[i - 1][0]) i--;
        if (i === 0) return p.bottom;
        const [xi, yi] = q[i], [xo, yo] = q[i - 1];
        return ax <= xi ? yi : yi + (yo - yi) * (ax - xi) / (xo - xi);
      };
      for (let i = 0, n = louvre * 3 + 1; louvre && i < n; i++) {
        const z = lvZ0 - i * 0.032, p = anchors.coverAt(z);
        // Each slat spans two skin samples (follows the camber); 24 mm section
        // 10 mm proud: rooted 2 mm in, clear of the 13 mm livery drape.
        for (const s of [-1, 1]) {
          const xa = s * p.x * lvIn, xb = s * p.x * lvOut;
          addBeamBetween(out, [xa, skinY(p, xa) + 0.010, z], [xb, skinY(p, xb) + 0.010, z], 0.024, DARK, SURFACES.carbon);
        }
      }
      // Team-style DORSAL FIN along the engine-cover ridge: 1 = low blade,
      // 2 = tall blade. A SECONDARY ridge blade distinct from the sharkFin
      // tail plate below (which every non-cockpit car carries). Body-colour
      // plate with an accent crest line — a strong per-team silhouette tell
      // from chase and TV cameras. Starts behind the snorkel zone (z −0.95)
      // so the two never intersect. Garage/near: rounded loft so the ridge
      // is not a square plank where it meets the rear wing (Cadillac et al.).
      if (teamStyle.fin) {
        const finH = teamStyle.finH || (teamStyle.fin >= 2 ? 0.19 : 0.095);
        const ff = anchors.coverAt(-0.95), fr = anchors.coverAt(-1.85);
        // finRear (preview bodies only): rear blade height as a share of finH;
        // > 1 rakes the fin UP toward the rear wing (2008-10 / 2017 shark fin).
        const finR = teamStyle.finRear ? Math.min(finH * teamStyle.finRear, 0.92 - fr.top) : finH * 0.66;
        // finW (preview): stays under the sharkFin plate's 32 mm so the plate's skin wins (no z-fight).
        const finW = teamStyle.finW || 0.016;
        const bladeF = { z: ff.z, y: ff.top + finH * 0.5, w: finW, h: finH };
        const bladeR = { z: fr.z, y: fr.top + (teamStyle.finRear ? finR * 0.5 : finH * 0.33), w: finW * 0.875, h: finR };
        const crestF = { z: ff.z, y: ff.top + finH + 0.006, w: 0.020, h: 0.014 };
        const crestR = { z: fr.z, y: fr.top + finR + 0.005, w: 0.018, h: 0.012 };
        if (teamStyle.finRear) finTail = { blade: bladeR, crest: crestR };
        if (shadeFlags.round && shadeFlags.coverHi) {
          CarShade.loft(out, bladeF, bladeR, c1, addTri, { n: 10 });
          CarShade.loft(out, crestF, crestR, accentC, addTri, { n: 8 });
        } else {
          addSpan(out, bladeF, bladeR, c1);
          addSpan(out, crestF, crestR, accentC);
        }
      }
      // Engine-spec identification dots across the airbox intake lip.
      const engLed = engT === 2 ? [0.95, 0.22, 0.10] : engT === 0 ? [0.12, 0.82, 0.38] : [0.90, 0.62, 0.12];
      // fitSeat: on the airbox lip itself (a small airbox left y 0.868 in the air), inside its width.
      const ledY = teamStyle.fitSeat ? 0.76 + 0.10 * inScale + 0.002 : 0.868, ledX = teamStyle.fitSeat ? Math.min(0.04, 0.10 * inScale) : 0.06;
      for (const lx of [-ledX, 0, ledX])
        addBox(out, lx, ledY, -0.30, 0.02, 0.014, 0.02, engLed, SURFACES.metal);
      // FUEL: per-option filler cap colour. Rooted on the cover skin the same
      // way the tank breather is — literals at y 0.795/0.828/0.85 left the
      // collar floating ~13 cm over a short cover and buried under a tall one.
      const fuelColor = fuelStyle ? fuelStyle.cap : (tier("fuel") === 2 ? [0.95, 0.28, 1.5] : [0.55, 0.52, 0.60]);
      const fuelDisplay = fuelColor.map((value) => Math.min(value, 1));
      const fuelX = 0.12, fuelZ = -0.50;
      // Not under the tub rim (CHASSIS.cockpit top 0.675): lowline's low cover buried it 33-55 mm (B·H13 D7).
      const fy = Math.max(coverSurfaceY(anchors.coverAt(fuelZ), fuelX), CHASSIS.cockpit[1].y + CHASSIS.cockpit[1].h / 2);
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
          // Cap: a closed 6 mm puck, not a one-sided disc (its open rim showed
          // once the hatch plank stopped hiding it).
          addBox(out, p.x, py + 0.081, p.z, 0.030 * s, 0.006, 0.030 * s, [0.06, 0.06, 0.07], SURFACES.carbon);
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
        // The fuel DOOR is a dark lip framing the filler collar, in the collar's
        // own plane. The old flat plank hung 59-114 mm over the airbox fairing:
        // a dark slab beside the helmet on every shipped car (haloBehind view).
        addBeveledSpan(out, { z: fuelZ + 0.088, x: fuelX, y: fy + 0.0125, w: 0.122, h: 0.012, t: 0.94 },
          { z: fuelZ - 0.088, x: fuelX, y: fy + 0.0125, w: 0.122, h: 0.012, t: 0.94 }, 0.004,
          [0.08, 0.08, 0.09], null, SURFACES.carbon);
        addBox(out, fuelX, fy + 0.019, fuelZ + 0.084, 0.092, 0.010, 0.012,
               [0.24, 0.24, 0.26], SURFACES.metal);   // hinge on the forward edge
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
    if (ersLed && !anchors.podSculpt) {   // reference shells enclose the cell strip under their continuous shoulder
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
    // LED STRIP (STYLE): a full-length lit strip down each pod shoulder in the pack's LED colour.
    if (!ckpt && ersStyle && ersStyle.ledStrip) addPodFlankSpan(0.45, -0.95, 0.99, 0.085, ersGlow, SURFACES.metal, 0.055);
    // FLANK (B·D1d bodies, opt-in [zF, zR, y0, y1, h0, h1]): a dark flank panel, centre y0→y1 and height h0→h1 (pod-height shares) front to rear.
    if (!ckpt && teamStyle.flank) {
      const [zF, zR, y0, y1, h0, h1] = teamStyle.flank;
      const stops = [zF, ...anchors.podStations.map((p) => p.z).filter((z) => z < zF && z > zR), zR].sort((a, b) => b - a);
      const at = (z, sd) => { const p = anchors.podAt(z), k = (zF - z) / (zF - zR), ph = p.top - p.bottom;
        return { z, x: sd * (p.x + 0.024), y: p.bottom + ph * (y0 + (y1 - y0) * k), w: 0.016, h: ph * (h0 + (h1 - h0) * k) }; };
      for (const sd of [-1, 1]) for (let i = 0; i < stops.length - 1; i++) addSpan(out, at(stops[i], sd), at(stops[i + 1], sd), INTAKE, null, SURFACES.carbon);
      // flankLip (opt-in, metres proud): a body-colour brow along the panel's top edge and a thinner sill
      // along its bottom (both inside the panel's height), so the dark panel reads as a recessed pocket.
      const lip = teamStyle.flankLip || 0;
      if (lip > 0) {
        const edge = (q, up, th) => ({ z: q.z, x: q.x + Math.sign(q.x) * (lip / 2 - 0.004), y: q.y + up * (q.h / 2 - th / 2 + 0.004), w: lip + 0.012, h: th });
        for (const sd of [-1, 1]) for (let i = 0; i < stops.length - 1; i++) {
          // lip stations sit off the panel's stop planes (+2 mm fore, -6 mm aft) and overlap their neighbour,
          // so no lip end cap is coplanar with a panel cap or another lip cap
          const a = at(stops[i] + 0.002, sd), b = at(stops[i + 1] - 0.006, sd);
          addSpan(out, edge(a, 1, 0.026), edge(b, 1, 0.026), c1);
          addSpan(out, edge(a, -1, 0.014), edge(b, -1, 0.014), c1);
        }
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
        // Clamps sit on the cable line (coverFlankX under the shoulder), not at the loft's
        // widest x: concept covers left them 58-156 mm off the skin (B·H13 D1/D2).
        const cableClip = (c, dx, w, h, d) => { const y = coverProfile(c).shoulder - 0.02;
          addBox(out, side * (coverFlankX(c, y) + dx), y, c.z, w, h, d, [0.10, 0.10, 0.12], SURFACES.carbon); };
        cableClip(anchors.coverAt(c2e.z + 0.06), 0.014, 0.026, 0.032, 0.040);   // ahead of the rear suspension pickups
        if (ersConduit >= 2) for (let i = 0; i < 2; i++) cableClip(anchors.coverAt(-0.96 - i * 0.28), 0.016, 0.028, 0.036, 0.044);
      }
    }
    // Pack cooling mouth on the pod shoulder ahead of the energy-cell strip:
    // 0 none / 1 low NACA lip / 2 lip + louvre grille behind it.
    const ersIntake = Math.max(0, Math.min(2, Math.round((ersStyle && ersStyle.coolerIntake) || 0)));
    if (ersIntake > 0 && !ckpt) {
      const roofY = (z, x, hw) => anchors.podSeatY(z, x, hw);   // a sculpted roof is not the control top
      for (const side of [-1, 1]) {
        const p = anchors.podAt(-0.30), x = p.x - 0.02;
        addBox(out, side * x, roofY(-0.30, x, 0.055) + (anchors.podRoof ? 0.006 : 0.008), -0.30, 0.11, 0.016, 0.14, INTAKE);
        addBox(out, side * x, roofY(-0.38, x, 0.06) + (anchors.podRoof ? 0.003 : 0.020), -0.38, 0.12, 0.010, 0.030,
               CARBON, SURFACES.carbon);
        if (ersIntake >= 2) {
          for (let i = 0; i < 3; i++) {
            const z = -0.46 - i * 0.05, xl = anchors.podAt(z).x - 0.02;
            addBox(out, side * xl, roofY(z, xl, 0.05) + (anchors.podRoof ? 0.002 : 0.012), z, 0.10, 0.008, 0.028,
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
      if (!podGeom.conceptInlet && !anchors.podSculpt) {
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
      }
      const fenceN = Math.max(0, Math.min(10, Math.round(floorStyle.fences)));
      const fenceH = Math.max(0.6, Math.min(2.25, floorStyle.fenceH));
      const fenceStep = fenceN > 1 ? 1.08 / (fenceN - 1) : 0;
      // Floor fences sit outboard of the pod and stay under the sponsor board
      // (yFrac 0.32..0.80) so a side ray hits the board first (body-split);
      // tall STYLE fences climbed to 0.58, into the board (#3111 F14).
      const fenceCap = (z) => {
        const pod = anchors.podAt(z);
        const frac = 0.28 + 0.02 * Math.max(0, Math.min(1, (fenceH - 1.0) / 1.25));
        return pod.bottom + frac * (pod.top - pod.bottom);
      };
      // One capped top line for the row (each fence capped itself off the stepped pod bottom: a
      // 99-210 mm staircase), straight nose-to-tail and dropped under every cap. The ends stay
      // upright plates (Bryce 2026-10-20: crisp fence edges; only the rail is smoothed).
      const fz0 = 0.515, fz1 = 0.325 - (fenceN - 1) * fenceStep;
      const capLine = (z) => fenceCap(fz0) + (fenceCap(fz1) - fenceCap(fz0)) * (fz0 - z) / (fz0 - fz1);
      let capDrop = 0;
      for (let i = 0; i < fenceN; i++) for (const dz of [0.095, 0, -0.095]) capDrop = Math.max(capDrop, capLine(0.42 - i * fenceStep + dz) - fenceCap(0.42 - i * fenceStep + dz));
      const fenceTop = (z) => Math.max(railTop(z) + 0.018, Math.min(0.160 + rideDY + 0.132 * fenceH, capLine(z) - capDrop));
      zone("floor", () => { for (let i = 0; i < fenceN; i++) {
        const fz = 0.42 - i * fenceStep;
        addStationLoft(out, [0.095, -0.095].map((dz) => {   // seated on the rail, overhanging its face by 8 mm
          const z = fz + dz, u = (0.095 - dz) / 0.19;
          const r = railAt(z), w = 0.028 - 0.006 * u, x = s * (r.x + r.w / 2 + w / 2 - 0.008);
          const yb = railTop(z) + 0.0006, yt = fenceTop(z);
          return [[x - w / 2, yb, z], [x + w / 2, yb, z], [x + w / 2, yt, z], [x - w / 2, yt, z]];
        }), CARBON);
      } });
      const edgeLip = Math.max(0, Math.min(2, floorStyle.edgeLip || 0));
      if (edgeLip > 0) {
        const ef = floorEdgeAt(0.50), er = floorEdgeAt(-1.10);
        addSpan(out,
          { z: 0.50, x: s * (ef + 0.006), y: 0.080 + rideDY,
            w: 0.014, h: 0.038 + 0.028 * edgeLip },
          { z: -1.10, x: s * (er + 0.006), y: 0.094 + rideDY,
            w: 0.012, h: 0.034 + 0.026 * edgeLip },
          CARBON, null, SURFACES.carbon);
        addBeveledSpan(out,
          { z: 0.50, x: s * (ef + 0.030 + 0.055 * edgeLip), y: 0.118 + rideDY,
            w: 0.038 + 0.065 * edgeLip, h: 0.012 + 0.006 * Math.max(0, edgeLip - 1) },
          { z: -1.10, x: s * (er + 0.028 + 0.050 * edgeLip), y: 0.138 + rideDY,
            w: 0.032 + 0.058 * edgeLip, h: 0.010 + 0.005 * Math.max(0, edgeLip - 1) },
          0.004, accentC, null, SURFACES.paint);
      }
      if (Math.round(floorStyle.gurney || 0) > 0) {
        const er = railAt(-1.12).x;   // sits on the rail top, wherever the tyre tuck put it
        addBox(out, s * (er + 0.012), railTop(-1.12) + 0.011, -1.12,
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
    if (!ckpt && aeroStyle && aeroStyle.sduct) addNoseSDuct(out, anchors, c1);   // #3411

    // BIG CAP (STYLE): a wide painted filler plate on the cover crown, so a fuel option reads from above.
    if (!ckpt && fuelStyle && fuelStyle.capBig) {
      const cz = -0.52, cyb = coverSurfaceY(anchors.coverAt(cz), 0);
      const capC = (fuelStyle.cap || [0.9, 0.5, 0.1]).map((v) => Math.min(v, 1));
      addBox(out, 0, cyb + 0.022, cz, 0.36, 0.050, 0.70, capC, SURFACES.metal);
      addBox(out, 0, cyb + 0.048, cz, 0.20, 0.028, 0.36, capC, SURFACES.metal);
      addBox(out, 0.14, cyb + 0.030, cz + 0.10, 0.10, 0.035, 0.18, capC, SURFACES.metal);
    }
    // SKIRT (STYLE): a painted strip down each floor edge. skirt≥2 widens it.
    // Ends 4 cm ahead of the rear tyre (was −1.50, 14 cm into it; #3111 F11).
    if (!ckpt && floorStyle && floorStyle.skirt) {
      const sk = Math.max(1, Math.min(2, Math.round(floorStyle.skirt)));
      const skF = 0.90, skR = AXLES.rearZ + AXLES.wheelY + 0.04;
      for (const s of [-1, 1])
        addBox(out, s * 0.76, Math.max(CHASSIS.floor.cy + rideDY, 0.052) + 0.03, (skF + skR) / 2,
               0.035 + 0.030 * (sk - 1), 0.07 + 0.04 * (sk - 1), skF - skR, sk >= 2 ? accentC : c2);
    }

    part("livery");
    // Nose TIP z moves per team (TEAM_STYLE.noseTipZ, ±0.10): the cap and both
    // stripes must end at the STYLED tip, not a shared literal, or the paint
    // floats past a short nose (haas) / stops short of a long one (williams).
    // noseAt clamps beyond the tip; derive z endpoints as distances behind it.
    // The old literal 2.70 painted mid-air after the tip moved 580 mm rearward.
    const styledTipZ = styledNoseStations(teamStyle)[0].z;
    // Paint and the crown lamp stay inside the styled crown, including the
    // pencil-thin concept noses. Keep authored widths wherever they still fit.
    const noseTrimW = (a, w) => Math.min(w, a.topSide * 1.8);
    const curvedNosePaint = (zA,zB,wA,wB,hA,hB,proud,col) => {
      const zs = [zA,...anchors.noseStops.filter(z => z > zA && z < zB).sort((a,b)=>a-b),zB];
      const mix = (a,b,z) => a+(b-a)*(z-zA)/(zB-zA);
      for (let i=0;i<zs.length-1;i++) {
        const a=anchors.noseAt(zs[i]),b=anchors.noseAt(zs[i+1]);
        addLoft(out,a.z,0,a.top+proud,noseTrimW(a,mix(wA,wB,a.z)),mix(hA,hB,a.z),
          b.z,0,b.top+proud,noseTrimW(b,mix(wA,wB,b.z)),mix(hA,hB,b.z),col);
      }
    };
    const noseAccentRear = anchors.noseAt(1.60), noseAccentFront = anchors.noseAt(styledTipZ - 0.04);
    // fitSeat: a concept cone bulges 27-98 mm over the straight 1.60-to-tip chord, which
    // buried the accent and z-fought where it crossed the skin (sharkfin 215 cm2). Follow
    // the skin in ~12 cm steps from the cockpit deck's front (2.15), which covers it behind.
    if (anchors.noseStops) curvedNosePaint(1.60,styledTipZ-0.04,0.09,0.05,0.016,0.014,0.008,c2);
    else if (teamStyle.fitSeat && styledTipZ - 0.04 > 2.27) {
      const z0 = 2.15, z1 = styledTipZ - 0.04, n = Math.ceil((z1 - z0) / 0.12), w = (z) => 0.09 + (0.05 - 0.09) * (z - 1.60) / (z1 - 1.60);
      for (let i = 0; i < n; i++) {
        const za = z0 + (z1 - z0) * i / n, zb = z0 + (z1 - z0) * (i + 1) / n, a = anchors.noseAt(za), b = anchors.noseAt(zb);
        addLoft(out, za, 0, a.top + 0.008, noseTrimW(a, w(za)), 0.015, zb, 0, b.top + 0.008, noseTrimW(b, w(zb)), 0.014, c2);
      }
    } else addLoft(out, 1.60, 0, noseAccentRear.top + 0.008, noseTrimW(noseAccentRear, 0.09), 0.016,
           styledTipZ - 0.04, 0, noseAccentFront.top + 0.008, noseTrimW(noseAccentFront, 0.05), 0.014, c2);
    // Spine accent along the ROLL-STRUCTURE crown, not the airbox roof it used
    // to lie on: the blade now occupies z -0.33..-0.63 and a flat band at
    // y 0.862 would be buried inside it. A span follows the crown's rearward
    // fall for the same twelve triangles the box cost.
    zone("engineCover", () => addSpan(out, { z: -0.28, y: 0.972, w: 0.060, h: 0.030 }, { z: -0.66, y: 0.944, w: 0.050, h: 0.026 }, c2));

    // noseChine (B·D1d Delta, opt-in): a ridge 4 mm proud along each upper edge of the cone (faceted read).
    const chine = (n, s, w) => ({ z: n.z, x: s * (n.side * 0.4 + (n.topSide || n.side) * 0.6 + 0.004), y: n.top - (n.top - n.bottom) * 0.18, w, h: w * 1.1 });
    if (teamStyle.noseChine) for (const s of [-1, 1]) addSpan(out, chine(anchors.noseAt(styledTipZ - 0.10), s, 0.014), chine(anchors.noseAt(1.20), s, 0.022), c1);
    for (const s of [-1, 1]) {
      const nf = anchors.noseAt(styledTipZ - 0.12), nr = anchors.noseAt(2.025);
      if (teamStyle.noseCurve) {
        // A broad curved flank needs short, seated paint strips rather than
        // a chord hung off its maximum bottom width.
        const n = Math.ceil((nf.z - nr.z) / 0.10), at = (z) => {
          const p = anchors.noseAt(z), x = noseFlankX(p, (p.bottom + p.top) / 2, shadeFlags.round);
          return { z, x: s * (x + 0.002), y: (p.bottom + p.top) / 2, w: 0.008, h: 0.018 };
        };
        for (let i = 0; i < n; i++) addSpan(out,
          at(nr.z + (nf.z - nr.z) * i / n), at(nr.z + (nf.z - nr.z) * (i + 1) / n), accentC);
      } else {
      const zs=[nf.z,...(anchors.noseStops || []).filter(z=>z<nf.z&&z>nr.z),nr.z];
      for(let i=0;i<zs.length-1;i++) {
        const a=anchors.noseAt(zs[i]),b=anchors.noseAt(zs[i+1]);
        addSpan(out,
          { z:a.z,x:s*(a.side+0.006),y:(a.bottom+a.top)*0.5,w:0.012,h:0.040 },
          { z:b.z,x:s*(b.side+0.006),y:(b.bottom+b.top)*0.5,w:0.012,h:0.040 },accentC);
      }
      }
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
        const y = n.bottom + (n.top - n.bottom) * 0.42;
        const x = teamStyle.noseCurve ? noseFlankX(n, y, shadeFlags.round) + 0.003 : n.side + 0.005;
        addBox(out, s * x, y, n.z,
               0.014, 0.026, 0.028, drlC, SURFACES.glass);
      }
      const drlBar = anchors.noseAt(styledTipZ - 0.05);
      addBox(out, 0, drlBar.top + 0.005, drlBar.z, noseTrimW(anchors.noseAt(drlBar.z + 0.010), 0.13), 0.010, 0.020, drlC, SURFACES.glass);
    }
    if (!ckpt) zone("sidepods", () => addPodFlankSpan(0.425, -0.025, 0.88, teamStyle.noseCurve ? 0.10 : 0.035, accentC, SURFACES.paint, 0.012, !!teamStyle.noseCurve));

    const stripeC = _ckAcc(liv.stripe) || null;   // monocoque crest runs z 0.05..1.05 — right under the eye
    const stripeTipZ = styledTipZ - 0.04;
    const stripeMidZ = (1.55 + stripeTipZ) * 0.5;   // the taper waypoint, halfway up the styled nose
    if (stripeC) {
      const ns314 = anchors.noseAt(stripeTipZ), ns270 = anchors.noseAt(stripeMidZ);
      const ns155 = anchors.noseAt(1.55), ns105 = anchors.noseAt(1.05);
      if(anchors.noseStops) {
        curvedNosePaint(stripeMidZ,stripeTipZ,0.075,0.040,0.014,0.012,0.012,stripeC);
        curvedNosePaint(1.55,stripeMidZ,0.13,0.075,0.016,0.014,0.012,stripeC);
      } else {
      addLoft(out, stripeMidZ, 0, ns270.top + 0.012, noseTrimW(ns270, 0.075), 0.014,
             stripeTipZ, 0, ns314.top + 0.012, noseTrimW(ns314, 0.040), 0.012, stripeC);
      addLoft(out, 1.55, 0, ns155.top + 0.012, noseTrimW(ns155, 0.13), 0.016,
             stripeMidZ, 0, ns270.top + 0.012, noseTrimW(ns270, 0.075), 0.014, stripeC);
      }
      // CHASE ONLY, exactly as the hood's accent stripe above: these two runs
      // start at z 0.05 — 0.25 m from the eye, AT the near plane — then go 1.5 m
      // down the centre of the view at 0.12 m wide. Measured 739 of 24045 view
      // rays, yaw -13..13 pitch -35..-9, wholly inside the WHEEL'S own window,
      // so they foreshorten into a slab across it instead of reading as a
      // stripe; _ckAcc only makes it grey. The nose run below (1.55 → tip) is
      // 1.75 m out and under 4 deg, and stays. Guard: cockpit-crest-stripe.
      if (!ckpt && anchors.noseStops) curvedNosePaint(1.05,1.55,0.12,0.13,0.016,0.016,0.012,stripeC);
      else if (!ckpt) addLoft(out, 1.05, 0, ns105.top + 0.012, 0.12, 0.016,
             1.55, 0, ns155.top + 0.012, noseTrimW(ns155, 0.13), 0.016, stripeC);
      if (!ckpt) addLoft(out, 0.05, 0, 0.655, 0.12, 0.022, 1.05, 0, 0.545, 0.13, 0.022, stripeC);   // monocoque → hood crest
      if (!ckpt) zone("engineCover", () => { addSpan(out, { z: -0.27, y: 0.984, w: 0.080, h: 0.020 },
                              { z: -0.67, y: 0.954, w: 0.070, h: 0.018 }, stripeC);  // spine band over the roll structure
        if (bodyDetails) bodyDetails.coverStripe(out, stripeC); else {
          addLoft(out, -0.94, 0, 0.775, 0.075, 0.02, -0.64, 0, 0.948, 0.07, 0.02, stripeC);
          addLoft(out, -1.95, 0, 0.600, 0.060, 0.02, -0.94, 0, 0.775, 0.075, 0.02, stripeC); } }); // engine-cover ridge run to the tail
    }
    const noseStripeC = _ckAcc(liv.noseStripe) || null;
    if (noseStripeC) {
      const ns155 = anchors.noseAt(1.55), ns270 = anchors.noseAt(stripeMidZ), ns314 = anchors.noseAt(stripeTipZ);
      if(anchors.noseStops) {
        curvedNosePaint(1.55,stripeMidZ,0.115,0.064,0.014,0.012,0.016,noseStripeC);
        curvedNosePaint(stripeMidZ,stripeTipZ,0.064,0.036,0.012,0.010,0.016,noseStripeC);
      } else {
      addLoft(out, 1.55, 0, ns155.top + 0.016, noseTrimW(ns155, 0.115), 0.014,
             stripeMidZ, 0, ns270.top + 0.016, noseTrimW(ns270, 0.064), 0.012, noseStripeC);
      addLoft(out, stripeMidZ, 0, ns270.top + 0.016, noseTrimW(ns270, 0.064), 0.012,
             stripeTipZ, 0, ns314.top + 0.016, noseTrimW(ns314, 0.036), 0.010, noseStripeC);
      }
    }

    if (noseC && !teamStyle.noseCurve) {
      const capRearZ = styledTipZ - 0.38;
      const nt = anchors.noseAt(styledTipZ), nb = anchors.noseAt(capRearZ);
      const capF = { z: styledTipZ + 0.005, y: (nt.bottom + nt.top) * 0.5, w: nt.side*2 + 0.010, h: nt.top - nt.bottom + 0.010, t: 0.70 };
      const capR = { z: capRearZ, y: (nb.bottom + nb.top) * 0.5, w: nb.side*2 + 0.010, h: nb.top - nb.bottom + 0.010, t: 0.86 };
      // Rounded nose (CarShade): the cap wraps it at the nose's own taper instead of poking square corners past it.
      if(anchors.noseStops) {
        const zs=[styledTipZ,...anchors.noseStops.filter(z=>z<styledTipZ&&z>capRearZ),capRearZ];
        const cap=(p,z)=>({z,y:(p.bottom+p.top)*0.5,w:p.side*2+0.010,h:p.top-p.bottom+0.010,t:p.topSide/p.side});
        for(let i=0;i<zs.length-1;i++) {
          const a=anchors.noseAt(zs[i]),b=anchors.noseAt(zs[i+1]);
          const f=cap(a,a.z+(i===0?0.005:0)),r=cap(b,b.z);
          if(shadeFlags.round) CarShade.capLoft(out,f,r,a,b,noseC,addTri); else addSpan(out,f,r,noseC);
        }
      } else if (shadeFlags.round) CarShade.capLoft(out, capF, capR, nt, nb, noseC, addTri); else addSpan(out, capF, capR, noseC);
    }
    // Proud 0.006 keeps the pod panel UNDER the sponsor board (0.008): a board is
    // applied over the paint, not buried by it. At 0.016 the panel sat proud of
    // the board and covered it, so on every pod-set livery the sidepod wordmark
    // was actually sitting on the pod colour while being inked for the board.
    if (podC && !anchors.podSculpt) zone("sidepods", () => addPodFlankSpan(0.45, 0.11, 0.60, 0.22, podC, SURFACES.paint, 0.006));   // a sculpted shell already wears podC

    const deckF = anchors.noseAt(2.15), deckR = anchors.noseAt(1.69), deckW = (a) => Math.min(0.28, a.topSide*1.75);
    const deckY = (a) => a.top + 0.010 - (shadeFlags.round ? CarShade.sink(a, deckW(a) / 2) : 0);   // rounded nose: edges seat on the skin
    const deckStops=[deckR.z,...(anchors.noseStops||[]).filter(z=>z>deckR.z&&z<deckF.z).sort((a,b)=>a-b),deckF.z];
    for(let i=0;i<deckStops.length-1;i++) {
      const a=anchors.noseAt(deckStops[i]),b=anchors.noseAt(deckStops[i+1]);
      addLoft(out,a.z,0,deckY(a),deckW(a),0.018,b.z,0,deckY(b),deckW(b),0.018,nosePaint);
    }
    // Nose camera: a small round barrel in the gap between the nose-top wordmark
    // (titleB, z 1.16..1.66) and the number deck (z 1.69..), lens forward. It was
    // a 6 x 8 x 15 cm box at z 1.55 that hid the wordmark on every car
    // (Bryce, 2026-10-20: "Shrink and round it").
    {
      // The driver-eye build has 4 triangles of headroom (cockpit-wheels budget):
      // five sides and only the tail it can see, 15 triangles against the box's 12.
      const cz0 = 1.652, cz1 = 1.690, cr = 0.016, n = ckpt ? 5 : 12, cy = anchors.noseAt(1.671).top + cr * 0.8;
      addTube(out, [[0, cy, cz0], [0, cy, cz1]], cr, n, DARK, SURFACES.carbon);
      // Same ring frame addTube builds for a +z path: n = (-sin, cos, 0).
      const ring = (z) => Array.from({ length: n }, (_, s) => { const a = (s / n) * Math.PI * 2; return [-Math.sin(a) * cr, cy + Math.cos(a) * cr, z]; });
      const back = ring(cz0), front = ring(cz1), tail = [0, cy, cz0 - 0.012], lens = [0, cy, cz1 + 0.001];
      for (let s = 0; s < n; s++) {
        const s2 = (s + 1) % n;
        addTri(out, tail, back[s2], back[s], DARK, SURFACES.carbon);      // rounded tail
        if (!ckpt) addTri(out, lens, front[s], front[s2], VISOR, SURFACES.glass);   // lens face
      }
    }

    // Two-tone body (CarShade): `lower` below the sidepod board line, `upper`
    // above it. bodySplit lr wins; cockpit / silhouette builds skip both.
    if (bodySplitLR) CarMaterials.applyBodySplit(out, bodySplitFrom, out.pos.length / 3, c1, c2);
    else if (!ckpt && !(opts && opts.silhouette) && typeof CarShade !== "undefined") {
      if (liv.lower) CarShade.lowerZone(out, bodySplitFrom, out.pos.length / 3, c1, liv.lower, anchors, SURFACES.paint);
      if (liv.upper) CarShade.upperZone(out, bodySplitFrom, out.pos.length / 3, c1, liv.upper, anchors, SURFACES.paint);
    }

    part("cockpit");
    // Exterior head surround stays out of the dedicated driver-eye mesh.
    if (!ckpt) zone("headrest", () => {
      // Recipe-gated HEADREST behind the helmet: 0 flat rim (shipped) / 1 raised
      // horseshoe pad / 2 winged pad. Front face stays behind the helmet dome
      // (centre z -0.075, r 0.145 -> rear extent -0.220); pad tops stay under
      // the airbox intake underside (y 0.715). Rounded builds draw the whole
      // recipe as CarShade pipes (no stacked addBox cushions).
      const headrest = Math.max(0, Math.min(2, Math.round(cockpitStyle.headrest || 0)));
      const PAD = [0.08, 0.08, 0.10];
      if (shadeFlags.round) {
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
    });
    let cockpitHaloFrom = 0, cockpitHaloTo = 0;
    if (!exHalo && opts && opts.halo) {
      cockpitHaloFrom = out.pos.length / 3;
      const faired = opts.halo === 4;
      const hk = faired || opts.halo === true ? 1 : [0, 0.64, 1, 1.44][Math.max(1, Math.min(3, opts.halo | 0))];
      const path = haloHoopPath(0.30,0.765,-0.80,0.28,0.18,faired?1.10:1.045,0.62,faired?24:10);
      const hc = opts.cockpitHalo && _ckAcc(opts.cockpitHalo.color) || haloTint || (faired ? CARBON : HALO);
      if (faired) {
        const start=out.pos.length/3;
        // Broad carbon roof; swept crown reads level from the seat, not a deep U over the road.
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
        CarMaterials.smoothSkin(out,start);
        for(const i of [0,rings.length-1]) { const q=i===0?rings[i].slice().reverse():rings[i]; addQuad(out,q[0],q[1],q[2],q[3],hc,SURFACES.carbon); }
      } else { // Visor refs: lower nearby side crown; apex and rear mounts stay fixed.
        for(const p of path) p[1]-=0.055*Math.min(1,Math.max(0,(p[2]+0.80)/0.98))*Math.pow(Math.abs(p[0])/0.28,2);
        const start=out.pos.length/3;
        addTube(out,path,0.029*hk,10,hc,SURFACES.carbon);
        for(let i=start;i<out.pos.length/3;i++) out.pos[i*3+1]=path[Math.floor((i-start)/10)][1]+(out.pos[i*3+1]-path[Math.floor((i-start)/10)][1])*0.64;
        CarMaterials.smoothSkin(out,start);
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
      CarMaterials.smoothSkin(out,stemStart);
      cockpitHaloTo = out.pos.length / 3;
    }
    // Shared exterior centreline for the fairing and part("halo") below.
    const haloSty = Math.max(0, Math.min(2, Math.round(cockpitStyle.halo || 0)));
    const hr = haloSty === 1 ? 0.024 : 0.028;
    const crownY = 0.845 - (haloSty === 1 ? 0.008 : 0);
    const hoop = exHalo ? haloHoopPath(0.235, 0.505, -0.46, 0.30, 0.02, crownY, 0.49) : null, hoopT = hoop && shadeFlags.round ? CarShade.fine(hoop, 3) : hoop;   // rounded: a spline through it
    const haloBlade = Math.max(0, Math.min(2, Math.round(exHalo ? cockpitStyle.haloBlade || 0 : 0)));
    if (haloBlade > 0) {
      const bladeC = haloTint || HALO;
      // Co-axial fairing follows the hoop's curve, 8–11 mm proud (no coplanar faces).
      if (haloBlade === 1) {
        // Low fairing: shoulders + crown bar only (path pts 3..11 of 15).
        addTube(out, shadeFlags.round ? CarShade.fine(hoop, 3, 3, 12) : hoop.slice(3, 12), hr + 0.008, shadeFlags.round ? 12 : 6, bladeC, haloMetal);
      } else {
        // Full shroud: the whole hoop, plus the centre spine riding clear of
        // the fatter tube.
        addTube(out, hoopT, hr + 0.011, shadeFlags.round ? 12 : 6, bladeC, haloMetal);
        addBeveledSpan(out,
          { z: 0.50, x: 0, y: 0.904, w: 0.083, h: 0.032, t: 0.50 },
          { z: 0.30, x: 0, y: 0.892, w: 0.050, h: 0.027, t: 0.55 },
          0.008, bladeC, null, haloMetal);
      }
    }
    if (cockpitStyle.haloWing && exHalo) {
      const wingC = haloTint || HALO;
      addBeveledSpan(out,
        { z: 0.18, x: 0, y: 0.875, w: 0.32, h: 0.016, t: 0.50 },
        { z: -0.02, x: 0, y: 0.868, w: 0.24, h: 0.012, t: 0.42 },
        0.005, wingC, null, haloMetal);
      for (const s of [-1, 1]) {
        addBox(out, s * 0.155, 0.872, 0.08, 0.010, 0.028, 0.10, wingC, haloMetal);
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
      // screen 2 (STYLE): a tall wrap-around aeroscreen over the halo's front —
      // taller glass + a painted brow so it reads against screen:1's short visor.
      if (cockpitStyle.screen >= 2) {
        addLoft(out, 0.45, 0, 0.690, 0.52, 0.028, 0.58, 0, 0.940, 0.42, 0.022, VISOR, SURFACES.glass);
        addLoft(out, 0.58, 0, 0.940, 0.44, 0.036, 0.64, 0, 0.975, 0.40, 0.032, c1);
        for (const s of [-1, 1]) {
          addLoft(out, 0.48, s * 0.20, 0.710, 0.12, 0.024,
                       0.60, s * 0.10, 0.900, 0.08, 0.018, VISOR, SURFACES.glass);
        }
      }
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
    const onHalo = !ckpt && exHalo && cockpitStyle.mirrorMount === 1;   // see mx below
    const mz = ckpt ? 0.92 : onHalo ? 0.12 : 0.24;
    const mScale = Math.max(0.85, Math.min(1.35, cockpitStyle.mirror || 1));
    // MIRROR HOUSING (liv.mirrorTint) / MIRROR FINISH (liv.mirrorFinish): the housing is carbon
    // today, which applyFinish never touches, so a tint or an explicit finish makes the housing
    // and stalk PAINT (the finish remap only rewrites paint ids). Both unset = today's mesh.
    const mTint = _ckAcc(liv.mirrorTint) || null;
    const mHouseC = mTint || [0.09, 0.09, 0.11], mHouseS = mTint ? SURFACES.paint : PH_MIRROR;
    const mStalkC = mTint || DARK;
    // B·D4 (opt-in, default off): mirrorMount 1 hangs the housings off
    // the halo's crown corners (Ferrari SF71H, 2018) instead of the tub shoulder.
    const mx = onHalo ? 0.45 * mScale : ((ckpt ? 0.60 : 0.34) + (mSty === 1 ? 0.035 : 0)) * mScale;
    const msx = (ckpt ? 0.54 : 0.30) * mScale;
    const mY = onHalo ? 0.830 : (ckpt ? 0.780 : 0.735) + (mSty === 2 ? -0.032 : 0);
    const mFrame = !ckpt && cockpitStyle.mirrorFrame === 1;
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
      if (onHalo) {
        // Two swept stays rooted ON the hoop centreline at its crown corner
        // (x 0.30, crownY, z ~0.02: fit-audit found 5.7 mm of air at 0.845)
        // out to the housing's inboard end, plus a lower brace.
        addBeamBetween(out, [s * 0.30, crownY, 0.03], [s * (mx - mW * 0.48), mY + 0.010, mz], 0.014, mStalkC, SURFACES.carbon);
        addBeamBetween(out, [s * 0.297, crownY - 0.004, -0.02], [s * (mx - mW * 0.48), mY - 0.022, mz + 0.01], 0.010, mStalkC, SURFACES.carbon);
      } else addBlock(out, [
        [xi, sB + aY, mz - (ckpt ? 0.026 : 0.045)], [xi, sB + aY, mz + (ckpt ? 0.026 : 0.045)], [xi, sB + sR + aY, mz + (ckpt ? 0.026 : 0.045)], [xi, sB + sR + aY, mz - (ckpt ? 0.026 : 0.045)],
        [xo, (ckpt ? stalkTop-0.016 : sB+sR*.75+aY), stalkZ - (ckpt ? 0.012 : 0.020)], [xo, (ckpt ? stalkTop-0.016 : sB+sR*.75+aY), stalkZ + (ckpt ? 0.012 : 0.020)],  [xo, stalkTop, stalkZ + (ckpt ? 0.012 : 0.020)], [xo, stalkTop, stalkZ - (ckpt ? 0.012 : 0.020)],
      ], mStalkC);
      // Glass goes on the face TOWARD the viewer (-z). At mz+0.066 it sits
      // 8 mm BEYOND the housing's own back face, and the driver AND the chase
      // camera see carbon, never the reflective surface.
      // Housing as an 8-corner block with the outboard face pulled BACK in z —
      // the C14.2.2 d i inboard toe (~25°): real mirrors angle at the driver,
      // and the cant is what stops the housing reading as a shoebox.
      const toe = ckpt ? 0.030 : 0.045;
      const hy0 = mY - mH / 2, hy1 = mY + mH / 2;
      const xIn = s * (mx - mW / 2), xOut = s * (mx + mW / 2);
      (shadeFlags.round ? (o, q, c, f, sf) => CarShade.housing(o, q, c, addTri, sf) : addBlock)(out, [
        [xIn, hy0, mz - 0.03], [xOut, hy0, mz - 0.03 + toe], [xOut, hy1, mz - 0.03 + toe], [xIn, hy1, mz - 0.03],
        [xIn+s*(ckpt ? 0.018 : 0), hy0+(ckpt ? 0.008 : 0), mz + 0.03], [xOut-s*(ckpt ? 0.018 : 0), hy0+(ckpt ? 0.008 : 0), mz + 0.03 + toe], [xOut-s*(ckpt ? 0.018 : 0), hy1-(ckpt ? 0.008 : 0), mz + 0.03 + toe], [xIn+s*(ckpt ? 0.018 : 0), hy1-(ckpt ? 0.008 : 0), mz + 0.03],
      ], mHouseC, null, mHouseS);
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
        if (shadeFlags.round) addBlock(out,face(0.010,mz-0.036,0.008),[0.10,0.11,0.14],null,SURFACES.glass); else addBox(out,s*mx,mY,mz-0.032,mW*0.97,mH*0.80,0.012,[0.10,0.11,0.14],SURFACES.glass);
        if (shadeFlags.round) addBlock(out,face(0.018,mz-0.039,0.004),[0.46,0.56,0.78],null,SURFACES.glass); else addBox(out,s*mx,mY,mz-0.038,0.200,0.050,0.008,[0.46,0.56,0.78],SURFACES.glass);   // rounded: glass canted with the housing
      }
      if (!ckpt) {
        // Top winglet + the C3.7.5 OUTER stay down to the tub shoulder — the
        // two details every 2026 housing carries.
        addBox(out, s*mx, hy1 + 0.008, mz + 0.01, mW * 0.9, 0.008, 0.055, DARK, SURFACES.carbon);
        // podShape bodies (B·D1d concepts): the stay's foot lands ON the pod top under it, not the stock 0.60 shoulder.
        const sp = teamStyle.podShape ? anchors.podAt(mz + 0.10) : null, sx = msx + 0.06;
        const stayY = sp ? sp.innerTop + (sp.top - sp.innerTop) * Math.max(0, Math.min(1, (sx - sp.inner) / Math.max(1e-6, sp.x - sp.inner))) : 0.60;
        if (!onHalo) addBeamBetween(out, [s * (mx + mW * 0.38), hy0, mz + 0.02],
                            [s * sx, stayY, mz + 0.10], 0.012, DARK, SURFACES.carbon);
      }
      if (mFrame) {
        // B·D4 (opt-in): 2019–21 framed mirror (Ferrari SF90/SF1000,
        // Red Bull RB16) — a lower aero blade and two vertical struts box the
        // housing, standing 22 mm off it so the frame reads as a ring of air.
        const g = 0.022, fy0 = hy0 - g, fy1 = hy1 + g, fxI = s * (mx - mW / 2 - g), fxO = s * (mx + mW / 2 + g);
        addBox(out, s * mx, fy1, mz + 0.012, mW + 2 * g + 0.012, 0.009, 0.075, DARK, SURFACES.carbon);
        addBox(out, s * mx, fy0, mz + 0.012, mW + 2 * g + 0.012, 0.009, 0.085, DARK, SURFACES.carbon);
        for (const fx of [fxI, fxO]) addBox(out, fx, (fy0 + fy1) / 2, mz + 0.016, 0.008, fy1 - fy0, 0.070, DARK, SURFACES.carbon);
        addBox(out, fxO + s * 0.004, fy0 - 0.020, mz + 0.03, 0.006, 0.040, 0.050, DARK, SURFACES.carbon);   // turning-vane foot
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
    // The driver's head: helmets.js owns the lid (emitHelmet). cy 0.715 is the TEMPLE line: at 0.630 the crown sat
    // at 0.749 under a cockpit surround topping out at 0.765 — the head was BELOW the tub. 0.715 clears it by 82 mm
    // and passes 43 mm under the halo at 0.890. No boxes bolted on: the rear gurney, top intake and visor strip
    // are lofts on the shell itself (helmets.js buildAero), built with the lid.
    if (!(opts && opts.noDriver)) emitHelmet(out, opts, c1, liv, sil);

    // NOT in the first-person build: it spans z -0.305..-0.175 and y 0.715..
    // 0.805, so against a driver's eye at (0.72, -0.20) its front face is 2.5 cm
    // from the camera and it straddles the eye line. Measured via the engine's
    // own occlusion raster: `player` 20.4% of the frame at distM 0.2 — this box
    // was the dark mass across the view, and the thing "cutting" the wheel.
    if (!ckpt) addBox(out, 0, 0.76, -0.24, 0.15, 0.09, 0.13, INTAKE);

    // T-camera bar + LED live next to the snorkel-aware pod in part("engineCover").

    part("halo");
    if (exHalo) {
      const haloC = haloTint || HALO, haloS = haloTint && Math.max(...haloTint) - Math.min(...haloTint) > 0.15 ? SURFACES.paint : PH_HOOP;   // a COLOURED livery hoop is paint (Alpine pink: the metal env mirror washed it white); grey stays metal (titanium, Cadillac chrome)
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
      if (shadeFlags.round) CarShade.strut(out, [0, 0.53, 0.47], [0, 0.83, 0.47], 0.05, 0.035, haloC, addTri, haloS, { taper: 0.8, n: 10 }); else addBox(out, 0, 0.68, 0.47, 0.035, 0.30, 0.05, haloC, haloS);
      addTube(out, hoopT, hr, shadeFlags.round ? 12 : 6, haloC, haloS);
      // The real strut SPLITS into a V at the top, meeting the ring at two
      // points either side of the apex — the wishbone silhouette head-on.
      for (const s of [-1, 1])
        addBeamBetween(out, [0, 0.775, 0.468], [s * 0.105, crownY - hr * 0.4, 0.474],
                       0.015, haloC, haloS);
      if (haloSty === 2) {
        // Fenced hoop: five tall crest vanes along the crown so Fenced Halo
        // reads against open_cell's bare hoop in a garage 3/4 shot.
        for (const hi of [4, 5, 7, 9, 10]) {
          const p = hoop[hi];
          if (!p) continue;
          addBox(out, p[0], p[1] + hr + 0.045, p[2], 0.030, 0.090, 0.120,
                 haloC, haloS);
          addBox(out, p[0], p[1] + hr + 0.095, p[2], 0.020, 0.028, 0.070,
                 accentC, SURFACES.paint);
        }
        // Painted brow bar across the crown — open_cell has none. It spans the
        // outermost vanes (hoop[4]/[10]) instead of floating at ±0.21 (#3111 F12).
        const bL = hoop[4], bR = hoop[10];
        if (bL && bR) addBox(out, 0, (bL[1] + bR[1]) / 2 + hr + 0.055, (bL[2] + bR[2]) / 2,
                             bR[0] - bL[0], 0.022, 0.10, accentC, SURFACES.paint);   // ends inside the vanes: no coplanar face
      }
    }

    part("exhaust");
    // Tip radius for the rain light. Cockpit: cheap stub (!ckpt has full tips).
    let exhTipRForLamp = 0.07;
    let exhTipLowY = 1, exhSleeveTopY = 0;   // a single tip: its bell's lowest point (Smooth Case plate) and its heat sleeve's top (DRS pod)
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
    const fuelFlame = _ckAcc(CarMaterials.zoneColour(liv.exhaustTint)) || fuelStyle && fuelStyle.flame || [1.15, 0.42, 0.14];   // EXHAUST HEAT (liv.exhaustTint) beats the fuel part's flame
    const fTwin = [fuelFlame[0]*0.9, fuelFlame[1]*0.9, fuelFlame[2]*0.9];
    const exhMetal = [0.16, 0.16, 0.17], exhFlareC = [0.18, 0.18, 0.19];
    const glazeOf = (rgb) => rgb.map((value) => Math.min(value * 0.45, 0.65));
    // Round exhaust pieces (Bryce 2026-10-19: no square plate on a round pipe). A
    // CLOSED 12-sided frustum r0@z0 → r1@z1 (discs share the rim vertices, so no
    // open edge); both windings; capCol paints the z1 disc (the glowing mouth).
    // ONE winding, facing away from (cx, cy, zc) — the solid's centre — so the
    // fit audit's inside test is not fooled by a double-sided shell.
    const exhCone = (cx, cy, z0, r0, z1, r1, col, surf, zc) => { for (let k = 0; k < 12; k++) {
      const a = k * Math.PI / 6, b = a + Math.PI / 6, P = (r, t, z) => [cx + r * Math.cos(t), cy + r * Math.sin(t), z];
      const q = [P(r0, a, z0), P(r0, b, z0), P(r1, b, z1), P(r1, a, z1)], c = r1 ? q[3] : q[2];
      const u = [q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]], v = [c[0] - q[0][0], c[1] - q[0][1], c[2] - q[0][2]];
      const m = [(q[0][0] + q[2][0]) / 2 - cx, (q[0][1] + q[2][1]) / 2 - cy, (q[0][2] + q[2][2]) / 2 - zc];
      const out1 = (u[1] * v[2] - u[2] * v[1]) * m[0] + (u[2] * v[0] - u[0] * v[2]) * m[1] + (u[0] * v[1] - u[1] * v[0]) * m[2] > 0;
      // r1 = 0 is a disc: ONE triangle (a quad with q[2] = q[3] left a zero-area, zero-normal tri).
      if (!r1) { if (out1) addTri(out, q[0], q[1], q[2], col, surf); else addTri(out, q[2], q[1], q[0], col, surf); }
      else if (out1) addQuad(out, q[0], q[1], q[2], q[3], col, surf); else addQuad(out, q[3], q[2], q[1], q[0], col, surf); } };
    const exhSolid = (cx, cy, z0, r0, z1, r1, col, surf, capCol) => { const zc = (z0 + z1) / 2;
      exhCone(cx, cy, z0, r0, z1, r1, col, surf, zc);
      exhCone(cx, cy, z0, r0, z0, 0, col, surf, zc); exhCone(cx, cy, z1, r1, z1, 0, capCol || col, surf, zc); };
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
        addTube(out, [[0, EXH_Y, -1.99], [0, EXH_Y, tipZ]], tipRShow * 0.85, 8,
                exhMetal, SURFACES.metal);
        // Its root, 1 cm inside the engine cover, is capped on addTube's own ring (x = r sin, y = r cos),
        // so the rim welds shut instead of reading as an open edge where the pylon no longer seals it.
        const capR = tipRShow * 0.85, ring = (j) => [capR * Math.sin(j / 4 * Math.PI), EXH_Y + capR * Math.cos(j / 4 * Math.PI), -1.99];
        for (let k = 0; k < 8; k++) addTri(out, [0, EXH_Y, -1.99], ring((k + 1) % 8), ring(k), exhMetal, SURFACES.metal);
      }
      const flame = exhTwin ? fTwin : fuelFlame, rPipe = tipRShow;
      addTube(out, [[cx, EXH_Y, tipZ + 0.10], [cx, EXH_Y, tipZ + 0.01]],
              rPipe * 1.08, 8, heatOf(flame), SURFACES.metal);
      // Round tip: a chamfered lip from a ring 5 mm inside the heat sleeve's mouth (1.08 r — a 12-gon
      // and the 8-gon share the 0/90/180/270° vertices, so it welds the sleeve; nearer the mouth its
      // cap z-fought the rain-light housing and lamp faces at -2.570/-2.568) down to the 0.86 r face.
      exhSolid(cx, EXH_Y, tipZ + 0.015, rPipe * 1.08, tipZ, rPipe * 0.86, exhMetal, SURFACES.metal, glazeOf(flame));
      exhCone(cx, EXH_Y, tipZ - 0.002, rPipe * 0.86, tipZ - 0.002, rPipe * 0.68, [0.05, 0.04, 0.04], SURFACES.carbon, tipZ + 0.04);   // carbon rim on the tip face
    }
    if (exhTwin && (exhStyle.wastegate || 0) >= 1) {
      addBox(out, 0, EXH_Y + exhR * 1.08 + 0.014, tipZ + 0.02, EXH_OUT * 2.05, 0.028, 0.045,   // rests on both heat sleeves
             exhMetal, SURFACES.metal);
    }
    const exhFlare = Math.max(0, Math.min(1, exhStyle.flare || 0));
    if (exhFlare > 0) {
      // Megaphone open rim at the rear face (no solid tip — keeps the rain light).
      const flareMul = exhTwin ? 0.55 : 1.15;
      for (const cx of exits) {
        // 0.8: a round flare of the old diamond's AREA, so it no longer swallows the rain light.
        const tip = tipRShow * (1 + flareMul * exhFlare) * 0.8;
        const z0 = tipZ + 0.08, z1 = tipZ + 0.005;
        const mouth = glazeOf(exhTwin ? fTwin : fuelFlame).map((v) => v * 0.6);   // the bell's face glows like the plain tip's
        exhSolid(cx, EXH_Y, z0, tipRShow * 1.08, z1, Math.max(tip, tipRShow * 1.08), exhFlareC, SURFACES.metal, mouth);
        exhSolid(cx, EXH_Y, z1, tip * 1.05, z1 - 0.012, tip * 1.12, [0.22, 0.22, 0.24], SURFACES.metal);
        exhCone(cx, EXH_Y, z1 - 0.013, tip * 0.92, z1 - 0.013, 0, mouth, SURFACES.metal, z1);   // glowing mouth inside the rim
      }
    }
    if (exhStyle.wrap) {
      for (const cx of exits) {
        // A single tip's pipe (r >= 1.15 exhR) swallows these two sleeves whole: they were
        // never seen, and their faces outvoted the crash box the pipe root sits in.
        if (exhTwin) addBox(out, cx, EXH_Y, -2.10, exhR * 1.18, exhR * 1.18, 0.06,
               [0.72, 0.70, 0.66], SURFACES.panel);
        if (exhTwin) addBox(out, cx, EXH_Y, -2.06, exhR * 1.24, exhR * 1.12, 0.045,
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
    const exhTint = Math.max(0, Math.min(2, Math.round(exhStyle.heatTint || 0)));
    const tintBands = exhTint === 2 ? [[0.40, 0.24, 0.52], [0.22, 0.26, 0.62], [0.30, 0.22, 0.50], [0.18, 0.30, 0.66]]
      : [[0.80, 0.64, 0.30], [0.66, 0.42, 0.26], [0.44, 0.30, 0.56], [0.22, 0.34, 0.68]];
    // gateStack (D6): wastegates stacked ABOVE the main tip on the centreline. Roots at ±0.024
    // run inside the rear-wing pylon (±0.045): at ±0.03 their side faces z-fought its walls.
    const gateStack = !!exhStyle.gateStack && !exhTwin;
    for (let i = 0; i < exhGates; i++) {
      const s = i === 0 ? -1 : 1;
      const gx = gateStack ? s * 0.024 : exhTwin ? s * (EXH_OUT * 0.55) : s * 0.075;
      const tipX = gateStack ? 0 : exhTwin ? s * EXH_OUT * 0.72 : s * 0.098;
      const gy = gateStack ? EXH_Y + tipRShow + 0.05 + i * 0.075 : 0.53;
      const gw = gateStack ? 0.050 : 0.030;
      addSpan(out, { z: -2.02, x: gx, y: gateStack ? gy - 0.04 : 0.47, w: 0.036, h: 0.036 },
                   { z: tipZ + 0.06, x: tipX, y: gy, w: gw, h: gw },
              [0.20, 0.20, 0.22], null, SURFACES.metal);
      addBox(out, tipX, gy + 0.005, tipZ + 0.05, gw + 0.010, gw + 0.010, 0.028,
             [0.22, 0.22, 0.24], SURFACES.metal);
      addBox(out, tipX, gy + 0.005, tipZ + 0.032, gw * 0.66, gw * 0.66, 0.012,
             glazeOf(fTwin), SURFACES.metal);
      // Stacked gates stand proud of the crash structure, tempered like the main tip.
      if (gateStack) addTube(out, [[0, gy + 0.005, tipZ + 0.06], [0, gy + 0.005, tipZ - 0.09]], gw * 0.75, 10,
                             exhTint ? tintBands[3 - i] : [0.62, 0.60, 0.58], SURFACES.metal);
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
    // D6 preview: heatTint = titanium temper bands behind the tip (1 straw→blue, 2 burnt
    // purple); hood = carbon visor overhanging a single exit, red-edged.
    const tintR = (exhTwin ? exhR : tipRShow * 0.85) * 1.08;   // one radius: a stepped run read as jagged rings
    // ONE closed run of 12-gon sleeves (no open tube ends): it starts where the tip's chamfer
    // (1.08 r → 0.86 r over 15 mm) reaches tintR, so its first ring sits on the tip; dark end cap = mouth.
    for (const cx of exhTint ? exits : []) {
      const zA = tipZ + 0.015 * Math.max(0, Math.min(1, (tintR - tipRShow * 0.86) / (tipRShow * 0.22)));
      const zE = tipZ - 0.10, zc = (zA + zE) / 2;
      let z = zA;
      tintBands.forEach((c, i) => { const z1 = tipZ - 0.01 - i * 0.03; exhCone(cx, EXH_Y, z, tintR, z1, tintR, c, SURFACES.metal, zc); z = z1; });
      exhCone(cx, EXH_Y, zA, tintR, zA, 0, tintBands[0], SURFACES.metal, zc);
      exhCone(cx, EXH_Y, zE, tintR, zE, 0, [0.04, 0.04, 0.04], SURFACES.carbon, zc);
    }
    if (exhStyle.hood && !exhTwin) {
      const hr = tipRShow * (1 + 1.15 * exhFlare) + 0.03;
      // The visor runs 2 cm further forward than its side plates, over the heat shield's tail, so the shield hangs from it.
      addBox(out, 0, EXH_Y + hr, tipZ - 0.01, hr * 2.4, 0.016, 0.32, CARBON, SURFACES.carbon);
      for (const s of [-1, 1]) addBox(out, s * hr * 1.2, EXH_Y + hr * 0.35, tipZ - 0.02, 0.014, hr * 1.4, 0.30, CARBON, SURFACES.carbon);
      addBox(out, 0, EXH_Y + hr + 0.014, tipZ - 0.16, hr * 2.4, 0.010, 0.02, [0.85, 0.12, 0.10], SURFACES.paint);
      // Mount: a carbon post from the heat sleeve's crown 3 mm into the visor (it hung on the DRS rail).
      const postLo = EXH_Y + tipRShow * 1.08 - 0.003, postHi = EXH_Y + hr - 0.008 + 0.003;
      addBox(out, 0, (postLo + postHi) / 2, tipZ + 0.05, 0.03, postHi - postLo, 0.04, CARBON, SURFACES.carbon);
    }
    exhTipRForLamp = tipRShow * (exhFlare > 0 && !exhTwin ? (1 + 1.15 * exhFlare) : 1);
    if (!exhTwin) exhTipLowY = EXH_Y - tipRShow * Math.max(1.08, exhFlare > 0 ? (1 + 1.15 * exhFlare) * 0.8 * 1.12 : 0);
    if (!exhTwin) exhSleeveTopY = EXH_Y + tipRShow * 1.08;
    // STACK (STYLE parts, 2026-10-18): an upswept tail-pipe stack over the crash
    // structure, 1 single / 2 twin, so an exhaust option reads from behind.
    const exhStack = Math.max(0, Math.min(2, Math.round(exhStyle.stack || 0)));
    for (let i = 0; i < exhStack; i++) {
      const sx = exhStack === 2 ? (i ? 0.16 : -0.16) : 0;
      addTube(out, [[sx, 0.46, -2.28], [sx, 0.78, -2.48], [sx, 1.08, -2.60]], 0.085 * exhBore, 8, [0.62, 0.60, 0.58], SURFACES.metal);
      addBox(out, sx, 1.12, -2.61, 0.20 * exhBore, 0.08, 0.18 * exhBore, fuelFlame.map((v) => Math.min(v, 1)), SURFACES.metal);
    }
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
    // wsFlat (B·D3c KEEL, opt-in): drop the team's curl / tip rise / ears so the
    // cascade reads as straight planks (resolved in wingOf).
    const ws = wingOf(aeroStyle && aeroStyle.wsFlat ? Object.assign({}, teamStyle, { wsFlat: 1 }) : teamStyle);
    out.flapInfo = { aLvl, style: Object.assign({}, aeroStyle, { wingStyle: ws }), col: wingCol,
      finish: CarMaterials.finishOf(liv, "wingFinish"), surface: wingCarbon ? "carbon" : "paint" };

    const nb = numberBoard(aLvl, aeroStyle);
    for (const s of (anchors.podSculpt ? [] : [-1, 1])) {
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
    // 2026: no beam by default (tier-2 used to imply beam:1). Active flaps
    // (drs) come from aeroStyleOf / buildAeroParts when a recipe omits them.
    const aBeam = aeroStyle ? (aeroStyle.beam || 0) : 0;
    const aDrs  = aeroStyle ? (aeroStyle.drs  || 0) : 1;
    const frontSweep = Math.max(-0.08, Math.min(0.22, aeroStyle.frontSweep));
    const frontTaper = Math.max(0.72, Math.min(1.08, aeroStyle.frontTaper));
    const frontRise = Math.max(-0.03, Math.min(0.16, aeroStyle.frontRise));

    const fwHalf = frontHalf(aLvl);               // half-span (endplate sits just outside)
    const fwElems = frontCascade(aLvl, aeroStyle);
    const fwBaked = frontBakedCount(aLvl);
    const fwMounts = [];
    for (let i = 0; i < fwBaked; i++) {
      const e = fwElems[i], half = fwHalf * e[4], extra = wingFoilOf(ws, i);
      const spec = {
        zLead: e[0], yLead: e[1], zTrail: e[2], yTrail: e[3],
        half, thick: e[5], taper: frontTaper,
        sweep: frontSweep * (0.75 + i * 0.10),
        rise: frontRise * (0.65 + i * 0.12) + extra.tipRise,
        attachHalf: fwHalf + 0.03,
        twist: extra.twist, teCurve: extra.teCurve, chordTaper: extra.chordTaper, wave: extra.wave,
        ...shapeLift(aeroStyle, "front"),
      };
      addWingFoil(out, spec, i === 0 && !anchors.podSculpt ? c1 : wingCol,
        i === 0 && !anchors.podSculpt ? SURFACES.paint : wingSurf);
      if (i === 0 && teamStyle.noseCurve) for (const s of [-1, 1]) {
        const p = foilAt(spec, s * 0.09, 0.55);
        fwMounts.push([p.x, p.y + p.h - 0.004, p.z]);
      }
    }
    const aPlate = Math.max(0, Math.min(3, Math.round(
      aeroStyle.plate != null ? aeroStyle.plate : 1)));
    // The plate table and its placement live at module scope (frontPlateGeom):
    // the decal mesh reads the same numbers, or it floats.
    const _fp = frontPlateGeom(aLvl, aeroStyle), PLATE = _fp.P;
    // B·D3c concept plates end 8 cm further forward (_fp.rear.z), clear of the
    // tyre's forward bulge; 0 on every shipped plate.
    const dzR = _fp.rear.z - 1.98;
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
        bevel, endplateC || c2);
      addBeveledSpan(out,
        { z: 2.30, x: epX + s*epKick*0.42, y: 0.190 + archN * 0.008, w: epW * 0.93,
          h: (PLATE.hF + PLATE.hR) * 0.5 + archN * 0.038, t: 0.70 },
        { z: 1.98 + dzR, x: epX + s*epKick, y: 0.245, w: epW * 0.88, h: PLATE.hR, t: _fp.rear.t },
        bevel, endplateC || c2);
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
        { z: 2.06 + dzR, x: epX + s*(epKick + 0.010), y: 0.245 + PLATE.hR * 0.46, w: 0.028, h: 0.016 },
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
          { z: 2.02 + dzR, x: epX + s * epKick, y: 0.245 + PLATE.hR * 0.5 - 0.004, w: 0.044, h: 0.012, t: 0.40 },
          0.006, c2);
      }
      // epTip (B·D3c RIFT, opt-in): an accent cap sleeved over the plate's
      // trailing top corner, 3 mm proud each side so it never z-fights the plate.
      if (aeroStyle.epTip) {
        const topR = 0.245 + PLATE.hR * 0.5, topM = 0.190 + archN * 0.008 + ((PLATE.hF + PLATE.hR) * 0.5 + archN * 0.038) * 0.5;
        const zR = _fp.rear.z, k = 0.13 / (2.30 - zR), topK = topR + (topM - topR) * k;
        addSpan(out, { z: zR + 0.13, x: epX + s * epKick * (0.42 + 0.58 * (1 - k)), y: topK - 0.040, w: epW * 0.88 + 0.006, h: 0.080 },
                     { z: zR - 0.005, x: epX + s * epKick, y: topR - 0.050, w: epW * 0.88 + 0.006, h: 0.100 }, accentC);
        // epTip 3 (KEEL, as the sheet draws it): a second accent tick on the plate's leading foot.
        if (aeroStyle.epTip >= 3) addSpan(out,
          { z: 2.665, x: epX, y: 0.135 - PLATE.hF * 0.5 + 0.035, w: epW + 0.006, h: 0.060 },
          { z: 2.54, x: epX + s * epKick * 0.42 * (0.12 / 0.36), y: 0.150 - PLATE.hF * 0.4 + 0.035, w: epW + 0.006, h: 0.060 }, accentC);
      }
      // Canard / dive-plane: first element is a horizontal strake on the
      // outer face (the 2026 flick); extras stay as the older cascade vanes.
      const nCan = ws.clean ? 0 : Math.max(aCasc, ws.canard || 0);
      for (let i = 0; i < nCan; i++) {
        if (i === 0) {
          addBeveledSpan(out,
            { z: 2.60, x: epX + s * 0.030, y: 0.152, w: 0.095, h: 0.016, t: 0.45 },
            { z: 2.30, x: epX + s * 0.058, y: 0.172, w: 0.115, h: 0.013, t: 0.62 },
            0.004, CARBON);
        } else {
          // Only where it ends on the endplate: behind a short plate it hung in clear air (B·H13 D6).
          const cz = 2.52 - i * 0.18, cy = 0.170 + i * 0.058;
          if (cz - 0.22 >= _fp.rear.z) addBeveledSpan(out,
            { z: cz,        x: s * (fwHalf - 0.03), y: cy,         w: 0.018, h: 0.12, t: 0.55 },
            { z: cz - 0.22, x: epX + s*0.012,       y: cy + 0.070, w: 0.018, h: 0.18, t: 0.70 },
            0.008, c1);
        }
      }
      // Raised nose (preview highnose, 1990 Tyrrell 019): the arm climbs to the
      // cone's underside and leans in under the slim nose — at 0.275 it stopped
      // 15 cm short and the wing hung in the air.
      // fitSeat, low cone (underside < 0.195 at the arm; lowline, stepnose): the fixed
      // 0.275 top buried 33-43 mm of arm in the cone. A short arm leans its 16 cm chord,
      // so its top rides ~40 mm over the end point: end 25 mm under the skin, top ~15 mm in. fitBodyDetails: its own noseMount.
      const armNose = (teamStyle.noseDroop || 0) > 0.06 || teamStyle.fitSeat ? anchors.noseAt(2.40) : null;
      const armLow = !!(teamStyle.fitSeat && (armNose.bottom < 0.195 || teamStyle.noseCurve));
      const armOff = teamStyle.noseCurve ? -0.020 : armLow ? -0.025 : (teamStyle.noseDroop || 0) > 0.06 ? 0.045 : null;
      const armX = armOff != null ? Math.min(teamStyle.noseCurve ? 0.06 : 0.09, armNose.side - 0.03) : 0.09, armY = armOff != null ? armNose.bottom + armOff : 0.275;
      const foot = teamStyle.noseCurve ? fwMounts[s < 0 ? 0 : 1] : [s*0.09, 0.085, 2.54];
      const noseMount = bodyDetails && !teamStyle.noseCurve ? bodyDetails.noseMount(s) : [s*armX, armY, 2.40];   // noseCurve seats its own arm
      // Short reference noses expose the old long white arms ahead of the tip.
      // Keep their feet on the structural main-plane chord; tuck them inboard
      // and use slim carbon supports rather than a painted projecting tusk.
      const tucked = !!anchors.noseStops;
      const armFoot = tucked ? [s*Math.min(0.065,Math.abs(noseMount[0])+0.015),0.085,Math.max(2.42,Math.min(2.54,noseMount[2]+0.03))] : foot;
      const supportC = tucked ? CARBON : c1;
      if (shadeFlags.round) CarShade.strut(out, armFoot, noseMount, tucked?0.09:0.16, tucked?0.025:0.040, supportC, addTri, null, { n: 10, taper: 0.72 });
      else addFairedArm(out, noseMount, armFoot, tucked?0.025:0.040, supportC, tucked?SURFACES.carbon:SURFACES.paint);
    }

    // fwBridge (opt-in): the 2008 BRIDGE WING (McLaren MP4-23, Renault R28):
    // a raised element spanning over the nose on two struts off the main plane.
    // The struts stand on the main plane's top (y 0.076 at z 2.56, 0.092 at
    // 2.46 at x 0.34, every team) and end inside the foil, so neither end floats.
    if (!ckpt && aeroStyle && aeroStyle.fwBridge) {
      addWingFoil(out, { zLead: 2.56, yLead: 0.505, zTrail: 2.34, yTrail: 0.540,
        half: 0.35, thick: 0.020, taper: 0.96, sweep: 0.03, rise: 0 }, wingCol, wingSurf);
      for (const s of [-1, 1]) addBeveledSpan(out,
        { z: 2.555, x: s * 0.34, y: (0.068 + 0.512) / 2, w: 0.016, h: 0.512 - 0.068, t: 0.62 },
        { z: 2.46,  x: s * 0.34, y: (0.084 + 0.527) / 2, w: 0.016, h: 0.527 - 0.084, t: 0.70 },
        0.005, endplateC || c2);
    }
    // xwing (opt-in): 1997-98 X-WINGS (Tyrrell 025): a winglet on a tall
    // pylon at each sidepod's leading shoulder, beside the cockpit.
    if (!ckpt && aeroStyle && aeroStyle.xwing) {
      for (const s of [-1, 1]) {
        // Winglet tips end mid-fence; the pylon foot follows the sidepod top's
        // slope (y 0.467-0.471 at z 0.03, 0.461-0.464 at z -0.07, every team)
        // and sinks 3-7 mm into it.
        addBeveledSpan(out,
          { z: 0.10, x: s * 0.62, y: 0.865, w: 0.30, h: 0.016, t: 0.55 },
          { z: -0.16, x: s * 0.62, y: 0.890, w: 0.30, h: 0.012, t: 0.70 },
          0.005, wingCol, null, wingSurf);
        addBeveledSpan(out,
          { z: 0.03,  x: s * 0.62, y: (0.464 + 0.875) / 2, w: 0.020, h: 0.875 - 0.464 },
          { z: -0.07, x: s * 0.62, y: (0.457 + 0.875) / 2, w: 0.020, h: 0.875 - 0.457 },
          0.003, DARK);
        for (const e of [-1, 1]) addBox(out, s * (0.62 + e * 0.15), 0.88, -0.03, 0.012, 0.075, 0.275, endplateC || c2);
      }
    }
    const aVane = aeroStyle && aeroStyle.vane != null ? aeroStyle.vane
                : (aLvl >= 4 ? 3 : aLvl >= 3 ? 2 : aLvl >= 1 ? 1 : 0);
    if (!ckpt && aVane > 0) zone("floor", () => {
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
    });
    // 2026 in-wash WAKEBOARD (`board`) — the regulated floor-board / bargeboard
    // return, inboard of the turning-vane cluster so the two never occupy the
    // same volume. 0 none · 1 vertical fence · 2 fence + horizontal foot.
    const aBoard = Math.max(0, Math.min(2, Math.round((aeroStyle && aeroStyle.board) || 0)));
    if (aBoard > 0 && !ckpt) zone("floor", () => {
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
    });

    part("rearAssembly");
    if (!ckpt) {
      const rwLift = (aLvl - 2) * 0.045;        // gentler vertical shift (beam-wing ref)
      const _ep    = endplateGeom(aLvl, aeroStyle);
      const epSY   = _ep.sy;   // grows with lvl + rearSweep + fin (side silhouette)
      const epCY   = _ep.cy;
      for (const s of [-1, 1]) {   // rounded build: a shaped plate with its crown (CarShade.endplate)
        if (shadeFlags.round) CarShade.endplate(out, _ep, s, endplateC || DARK, rearC, wingSurf, addTri); else addBeveledSpan(out,
          { z: _ep.front.z, x: s*0.50, y: _ep.front.cy, w: 0.040, h: _ep.front.sy, t: 0.58 },
          { z: _ep.rear.z, x: s*0.50, y: _ep.rear.cy, w: 0.040, h: _ep.rear.sy, t: 0.72 },
          0.012, endplateC || DARK);
        // Endplate WINDOWS + louvres. The old 18 mm flush slots sat inside the
        // plate thickness and read as a blank black slab from wingRear. Proud
        // raked cuts catch the bay light; two larger recesses read as DRS
        // cut-outs (void, not painted lines).
        // epChord (B·D3c concept plates): plain, short plates with no cut-outs.
        if (!aeroStyle.epChord) for (let i = 0; i < (teamStyle.wingStyle.clean ? 0 : 2); i++) {
          const wy = epCY + epSY * 0.12 - i * 0.11;
          addSpan(out, { z: -2.18, x: s * 0.538, y: wy + 0.028, w: 0.028, h: 0.055, t: 0.78 },
                       { z: -2.46, x: s * 0.522, y: wy - 0.012, w: 0.022, h: 0.042, t: 0.62 },
                  INTAKE, null, SURFACES.carbon);
        }
        if (!aeroStyle.epChord) for (let i = 0; i < (teamStyle.wingStyle.clean ? 0 : 5); i++) {
          const ly = epCY + epSY * 0.42 - i * 0.048;
          addSpan(out, { z: -2.20, x: s * 0.536, y: ly + 0.014, w: 0.022, h: 0.022, t: 0.82 },
                       { z: -2.42, x: s * 0.524, y: ly - 0.012, w: 0.018, h: 0.018, t: 0.64 },
                  INTAKE, null, SURFACES.carbon);
        }
        if (!shadeFlags.round) addBeveledSpan(out,
          { z: _ep.front.z, x: s*0.50, y: _ep.front.top, w: 0.046, h: 0.018, t: 0.70 },
          { z: _ep.rear.z, x: s*0.50, y: _ep.rear.top, w: 0.046, h: 0.018, t: 0.85 },
          0.006, rearC, null, wingSurf);
      }
      const rearSweep = Math.max(-0.06, Math.min(0.20, aeroStyle.rearSweep));
      const rearTaper = Math.max(0.72, Math.min(1.08, aeroStyle.rearTaper));
      const crownY = _ep.rear.top - 0.018;
      const upperTrailY = crownY - (aLvl >= 4 || aDrs ? 0.075 : 0);
      const rm = rearMainOf(upperTrailY, aeroStyle, _ep);   // the main plane section (rwGap moves it)
      const rearWing = (zLead, yLead, zTrail, yTrail, half, thick, col, scale, lift) =>
        addWingFoil(out, {
          zLead, yLead, zTrail, yTrail, half, thick,
          taper: rearTaper, sweep: rearSweep * (scale == null ? 1 : scale), rise: 0,
          attachHalf: 0.50, bowl: aeroStyle.rwBowl || 0, ...lift,
        }, teamStyle.wingStyle.clean && wingCarbon ? CARBON : col, wingSurf);
      // B·D3c rear tip lift (rwRise + rwCurve): the main plane takes the same
      // lift as the flown RW Flap (solveFlapsGeom), and each endplate grows a
      // tip fin over the wing's chord to meet the raised tips.
      const rLift = shapeLift(aeroStyle, "rear"), rTip = (rLift.rise || 0) + (rLift.rise2 || 0);
      // rwSpoon (opt-in, 0 = shipped): the 2022 SPOON main plane (Ferrari
      // F1-75, Red Bull RB18 low-drag): deep chord at the centre, scooped-down
      // narrow tips. Absent keeps the shipped call exactly.
      const aSpoon = Math.max(0, Math.min(1, +(aeroStyle && aeroStyle.rwSpoon) || 0));
      if (aSpoon) addWingFoil(out, {
        zLead: -2.30 + 0.04 * aSpoon, yLead: upperTrailY - 0.270, zTrail: -2.52 - 0.03 * aSpoon,
        yTrail: upperTrailY - 0.225, half: 0.51, thick: 0.026, taper: rearTaper,
        sweep: rearSweep * 0.8, rise: -0.070 * aSpoon, chordTaper: 0.55 * aSpoon,
        teCurve: 0.05 * aSpoon, attachHalf: 0.50,
      }, c1, wingSurf);
      else rearWing(rm[0], rm[1], rm[2], rm[3],
        0.51, 0.024, c1, 0.8, rLift);
      if (rTip > 0) for (const s of [-1, 1]) {
        const zM = Math.min(-2.22, _ep.front.z - 0.03), f = (zM - _ep.front.z) / (_ep.rear.z - _ep.front.z);
        const topM = _ep.front.top + (_ep.rear.top - _ep.front.top) * f, ov = 0.012;
        const fin = (z, top, h) => ({ z, x: s * 0.50, y: top - ov + (h + ov) / 2, w: 0.036, h: h + ov });
        // Starts on the plate crown 12 cm ahead of the wing, and stands 8 mm
        // proud of the plate's trailing face so a swept tip never overhangs it.
        const z0 = Math.min(zM + 0.12, _ep.front.z - 0.005), top0 = _ep.front.top + (_ep.rear.top - _ep.front.top) * (z0 - _ep.front.z) / (_ep.rear.z - _ep.front.z);
        addSpan(out, fin(z0, top0, 0.004), fin(zM, topM, rTip * 0.80), endplateC || DARK);
        addSpan(out, fin(zM, topM, rTip * 0.80), fin(_ep.rear.z - 0.008, _ep.rear.top, rTip + 0.012), endplateC || DARK);
        if ((aeroStyle.epTip || 0) >= 2) addSpan(out,
          { z: -2.50, x: s * 0.50, y: _ep.rear.top + rTip - 0.012, w: 0.042, h: 0.064 },
          { z: _ep.rear.z - 0.012, x: s * 0.50, y: _ep.rear.top + rTip - 0.012, w: 0.042, h: 0.064 }, accentC);
      }
      // A flat wing (KEEL) has no tip fin: as the sheet draws it, each plate's
      // trailing edge carries a tall accent stripe instead.
      else if ((aeroStyle.epTip || 0) >= 2) for (const s of [-1, 1]) {
        const h = _ep.rear.sy * 0.62, y = _ep.rear.top - 0.006 - h * 0.5;
        addSpan(out, { z: _ep.rear.z + 0.07, x: s * 0.50, y, w: 0.054, h },
                     { z: _ep.rear.z - 0.016, x: s * 0.50, y, w: 0.054, h }, accentC);
      }
      // Preview sharkfin (2017 style): the fin runs on as a sail whose foot ends
      // 8 mm into the main plane, instead of a 30 cm cut face 0.45 m short of the
      // wing. foilAt is the main plane's own section (same spec as rearWing above),
      // 30 % back along the centreline chord, so low-downforce wings are met too.
      if (finTail) {
        const m = foilAt({ zLead: rm[0], yLead: rm[1], zTrail: rm[2], yTrail: rm[3],
          half: 0.51, thick: 0.024, taper: rearTaper, sweep: rearSweep * 0.8, rise: 0, attachHalf: 0.50 }, 0, 0.30);
        const sailR = { z: m.z, y: m.y + m.h + 0.046, w: 0.010, h: 0.108 }, sz = m.z;
        const crestS = { z: sz, y: sailR.y + sailR.h * 0.5 + 0.004, w: 0.012, h: 0.010 };
        if (shadeFlags.round && shadeFlags.coverHi) {
          CarShade.loft(out, finTail.blade, sailR, c1, addTri, { n: 10 });
          CarShade.loft(out, finTail.crest, crestS, accentC, addTri, { n: 8 });
        } else {
          addSpan(out, finTail.blade, sailR, c1);
          addSpan(out, finTail.crest, crestS, accentC);
        }
      }
      const aSwan = aeroStyle && aeroStyle.swan ? 1 : 0;
      if (aSwan) {
        const mainTopY = rm[3] + 0.016;
        // rwPlanes 1 (B·D3c): the neck ends 8 mm into the main plane's own top skin
        // there (foilAt, lift included); the shipped constant left it 2.5 cm above.
        const seat = (aeroStyle.rwPlanes | 0) === 1 ? foilAt({ zLead: rm[0], yLead: rm[1], zTrail: rm[2], yTrail: rm[3],
          half: 0.51, thick: 0.024, taper: rearTaper, sweep: rearSweep * 0.8, rise: 0, attachHalf: 0.50, ...rLift }, 0.16, 0.64) : null;
        for (const s of [-1, 1]) {
          // ...and its foot starts as low as the spine mount's, on the engine cover.
          addSpan(out, seat ? { z: -1.98, x: s*0.16, y: 0.435, w: 0.048, h: 0.16 } : { z: -1.98, x: s*0.16, y: 0.46, w: 0.048, h: 0.13 },
                       { z: -2.26, x: s*0.16, y: mainTopY + 0.075, w: 0.036, h: 0.095 }, DARK);
          addSpan(out, { z: -2.26, x: s*0.16, y: mainTopY + 0.075, w: 0.036, h: 0.060 },
                       seat ? { z: seat.z, x: s*0.16, y: seat.y + seat.h + 0.016, w: 0.030, h: 0.048 }
                            : { z: -2.44, x: s*0.16, y: mainTopY + 0.012, w: 0.030, h: 0.048 }, DARK);
        }
      } else if (!shadeFlags.round) {   // rounded build: ONE central pylon (below) carries the wing
        for (const s of [-1, 1]) {
          // rwPlanes 1: no mid element at epCY, so the pylon climbs to the single flap's underside.
          // rwPlanes 1: no mid element at epCY, and the single flap's rest pose varies by
          // recipe, so the pylon ends inside the static main plane instead.
          const pyTop = (aeroStyle.rwPlanes | 0) === 1 ? rm[1] + (rm[3] - rm[1]) * (0.04 / 0.22) - 0.045 : epCY + 0.01;
          addSpan(out, { z: -1.98, x: s*0.14, y: 0.46, w: 0.05, h: 0.13 },
                       { z: -2.34, x: s*0.14, y: pyTop, w: 0.042, h: 0.10 }, DARK);
        }
      }
      if (shadeFlags.round) CarShade.strut(out, [0, 0.44, -1.96], [0, (aeroStyle.rwGap ? (rm[1] + rm[3]) * 0.5 - 0.0075 : upperTrailY - 0.255) - (aeroStyle.rwBowl || 0), -2.40], 0.14, 0.06, DARK, addTri, null, { taper: 0.75, n: 10 }); else addSpan(out, { z: -1.96, x: 0, y: 0.44, w: 0.09, h: 0.14 },
                   { z: -2.36, x: 0, y: epCY, w: 0.07, h: 0.10 }, DARK);   // central spine mount (rounded: a lens pylon ending in the main plane)
      const aTvane = aeroStyle && aeroStyle.tvane != null
        ? (aeroStyle.tvane ? 1 : 0) : (aLvl >= 4 && !aDrs ? 1 : 0);
      if (aTvane) {
        const vane = { zLead: -1.935, yLead: epCY + 0.188, zTrail: -2.025, yTrail: epCY + 0.212,
          half: 0.17, thick: 0.014, taper: 0.90, sweep: 0.018, rise: 0.006 };
        const mount = bodyDetails ? bodyDetails.tVane(vane) : null;
        addWingFoil(out, vane, rearC, wingSurf);
        addBox(out, 0, mount ? (mount.foot + mount.head) / 2 : (0.56 + epCY + 0.19) / 2, -1.98, 0.03, mount ? mount.head - mount.foot : epCY + 0.19 - 0.56, 0.025, DARK);
      }
      if (aBeam) {
        // Prominent beam wing slung low under the main plane, spanning the crash structure.
        rearWing(-2.36, 0.64 + rwLift * 0.4, -2.58, 0.68 + rwLift * 0.4,
          0.46, 0.022, c1, 0.65);
      }
      // beam2 (opt-in): the 2022-25 TWIN-ELEMENT beam wing (RB19, SF-23):
      // two stacked planes slung between the diffuser and the main plane,
      // clear of the rain light (y 0.465-0.625 at z -2.47..-2.60).
      if (aeroStyle && aeroStyle.beam2) {
        // The rear endplate stops near y 0.50, above the lower beam, so the
        // lower beam ends in a small plate hung flush off the endplate's inner
        // face (x 0.481); the upper beam runs into the endplate itself.
        addWingFoil(out, { zLead: -2.28, yLead: 0.455, zTrail: -2.44, yTrail: 0.480, half: 0.44,
          thick: 0.020, taper: rearTaper, sweep: rearSweep * 0.6, rise: 0, attachHalf: 0.47 }, c1, wingSurf);
        rearWing(-2.42, 0.655, -2.60, 0.690, 0.42, 0.018, CARBON, 0.6);
        for (const s of [-1, 1]) addBox(out, s * 0.4715, (0.43 + 0.60) / 2, -2.38, 0.022, 0.17, 0.22, endplateC || DARK);
      }
      // monkey (opt-in): the 2014-16 MONKEY SEAT (Mercedes W07): a small
      // twin-plane winglet over the crash structure on a single pylon.
      if (aeroStyle && aeroStyle.monkey) {
        // Both planes end mid-endplate (half 0.255); the pylon rises out of
        // the crash structure (top y 0.58-0.62 at z -2.08..-2.16).
        addWingFoil(out, { zLead: -2.00, yLead: 0.775, zTrail: -2.17, yTrail: 0.820,
          half: 0.255, thick: 0.018, taper: 0.92, sweep: 0, rise: 0 }, rearC, wingSurf);
        addWingFoil(out, { zLead: -2.15, yLead: 0.845, zTrail: -2.28, yTrail: 0.895,
          half: 0.255, thick: 0.014, taper: 0.92, sweep: 0, rise: 0 }, c1, wingSurf);
        addBox(out, 0, (0.56 + 0.79) / 2, -2.10, 0.030, 0.23, 0.10, DARK);
        for (const s of [-1, 1]) addBox(out, s * 0.255, 0.835, -2.14, 0.014, 0.16, 0.31, endplateC || DARK);
      }
      // aDrs (active-aero DRS slot flap) is not baked: rearFlap() (car-body-geom.js) flies it as "rearDrs" in rearC.
      const drsSX = aLvl >= 3 ? 0.16 : 0.13;
      // DRS pod + slot-gap rail (#3413): pod ABOVE the closed top-flap TE at
      // crownY, rail IN the rear↔rearDrs slot under the TE half only. Shipping
      // put both through the flap (rail crownY+3 mm, pod floor on crownY) →
      // horizontal banding on the wing-preset behind camera. Still crownY-anchored
      // (not epCY) so a low wing carries them. Heat-sleeve trim at z -2.50
      // (Cadillac Trumpet) unchanged: pod stops at z -2.49 when the sleeve is high.
      const podF = (2.49 - 2.40) / 0.22, f50 = 0.10 / 0.22;
      const flapTop = crownY + 0.022, podCy = flapTop + 0.035, podH = 0.070;
      const railY = crownY - 0.048, railZ = -2.56, railDepth = 0.08;
    // rwPlanes 1 (B·D3c): no DRS plane to sit on, so no pod or rail.
    if ((aeroStyle.rwPlanes | 0) !== 1) {
    addSpan(out, { z: -2.40, x: 0, y: podCy, w: drsSX, h: podH, t: 0.70 },
                 exhSleeveTopY > podCy + 0.024 * f50 - (podH - 0.022 * f50) / 2
                   ? { z: -2.49, x: 0, y: podCy + 0.024 * podF, w: drsSX * (1 - 0.28 * podF), h: podH - 0.022 * podF, t: 0.70 - 0.20 * podF }
                   : { z: -2.62, x: 0, y: flapTop + 0.059, w: drsSX * 0.72, h: 0.048, t: 0.50 },
            DARK);
    addBox(out, 0, railY, railZ, 0.42, 0.010, railDepth, CARBON, SURFACES.carbon);
    }

      // Lamp above tip centreline so stock/megaphone mouth rim stays visible.
      const tipR = exhTipRForLamp, lampY = 0.545;
      const lampW = Math.min(0.042, tipR * 0.70), lampH = Math.min(0.052, tipR * 0.85);
      addSpan(out, { z: -2.47, x: 0, y: lampY, w: 0.14, h: 0.16, t: 0.78 },
                   { z: -2.57, x: 0, y: lampY, w: 0.115, h: 0.13, t: 0.62 }, DARK);
      addBox(out, 0, lampY, -2.579, lampW * 1.15, lampH * 1.10, 0.018, DARK);   // #3412: dark body, only a 4 mm lens glows (clears tip -2.582, megaphone -2.588)
      addBox(out, 0, lampY, -2.590, lampW * 1.15, lampH * 1.10, 0.004, [1.55, 0.16, 0.11], SURFACES.emissive);
      addBox(out, 0, lampY, -2.5935, lampW * 0.38, lampH * 0.36, 0.003,
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
      // diffShape (floor, B·D3c, opt-in; 0/absent = the shipped tunnels): lower,
      // lighter diffusers after the concept sheet. rise scales the exit ceiling, n thin
      // fences of width w at h of the tunnel height, fan spreads them outward at the exit.
      const DS = [null,
        { rise: 0.55, n: 4, w: 0.012, h: 0.80, fan: 0 },      // 1 Shallow Tray
        { rise: 0.55, n: 2, w: 0.012, h: 0.85, fan: 0 },      // 2 Open Tray
        { rise: 0.80, n: 6, w: 0.010, h: 0.92, fan: 0.25 },   // 3 Fence Fan
        { rise: 0.65, n: 3, w: 0.014, h: 0.85, fan: 0.12 },   // 4 Swept Tray
      ][floorStyle && floorStyle.diffShape ? Math.max(1, Math.min(4, Math.round(floorStyle.diffShape))) : 0];
      const dRise = 0.30 * Math.max(0.72, Math.min(1.4, aeroStyle.diffuserRise)) * (DS ? DS.rise : 1);
      const yCE = dFloor + dRise, yCT = dFloor + 0.055 * diffH1 / 0.4;
      const DIFF_IN = [0.045, 0.045, 0.055];
      for (const s of [-1, 1]) {
        const cxE = s * (dKeel + dHalf) / 2, cxT = s * (dKeel + dThr) / 2;
        const wE = dHalf - dKeel, wT = dThr - dKeel;
        if (shadeFlags.round) CarShade.tunnel(out, s, dKeel, dThr, dHalf, dFloor, yCT, yCE, DIFF_IN, CARBON, addTri, SURFACES.carbon); else addLoft(out, -2.52, cxE, yCE, wE, 0.035, -1.95, cxT, yCT, wT, 0.035,
                DIFF_IN, SURFACES.carbon);                              // ramped ceiling (rounded: ceiling + wall as one curved shell)
        if (!shadeFlags.round) addLoft(out, -2.52, s * dHalf, (dFloor + yCE) / 2, 0.030, yCE - dFloor,
                     -1.95, s * dThr,  (dFloor + yCT) / 2, 0.030, yCT - dFloor,
                CARBON, SURFACES.carbon);                               // outer wall
        addBox(out, cxE, dFloor, -2.235, wE, 0.028, 0.57, CARBON, SURFACES.carbon);
        if (DS) for (let k = 0; k < DS.n; k++) {
          const f = (k + 1) / (DS.n + 1), fE = Math.min(0.94, f * (1 + DS.fan * f));
          addLoft(out, -2.50, s * (dKeel + wE * fE), (dFloor + yCE) / 2, DS.w, (yCE - dFloor) * DS.h,
                       -2.02, s * (dKeel + wT * f), (dFloor + yCT) / 2, DS.w * 0.8, (yCT - dFloor) * DS.h,
                  DIFF_IN, SURFACES.carbon);                            // thin fence
        }
        else for (let k = 0; k < 3; k++) {
          const f = 0.22 + k * 0.28;
          addLoft(out, -2.50, s * (dKeel + wE * f), (dFloor + yCE) / 2, 0.028, (yCE - dFloor) * 0.90,
                       -2.02, s * (dKeel + wT * f), (dFloor + yCT) / 2, 0.022, (yCT - dFloor) * 0.90,
                  DIFF_IN, SURFACES.carbon);                            // strake
        }
      }
      // ddiff (floor, opt-in): the 2009 DOUBLE DIFFUSER (Brawn BGP001): an
      // upper deck stacked over the legal tunnels, fed through a slot in the
      // step, with its own outer walls and a raised exit lip.
      if (floorStyle && floorStyle.ddiff) {
        const yU0 = yCE + 0.035, yU1 = yU0 + 0.15;
        for (const s of [-1, 1]) {
          addLoft(out, -2.56, s * (dKeel + dHalf * 0.82) / 2, yU1, dHalf * 0.82 - dKeel, 0.030,
                       -1.98, s * (dKeel + dThr * 0.80) / 2, yU0 + 0.02, dThr * 0.80 - dKeel, 0.030,
                  CARBON, SURFACES.carbon);                               // upper ceiling
          addLoft(out, -2.56, s * dHalf * 0.82, (yU0 + yU1) / 2, 0.026, yU1 - yU0,
                       -1.98, s * dThr * 0.80, yU0 + 0.01, 0.024, 0.03,
                  CARBON, SURFACES.carbon);                               // upper outer wall
          addBox(out, s * (dKeel + dThr * 0.80) / 2, yCT + 0.022, -1.98, dThr * 0.80 - dKeel, 0.014, 0.05,
                 INTAKE, SURFACES.carbon);                                // feed slot
        }
        addBox(out, 0, yU1 + 0.022, -2.565, 2 * dHalf * 0.82, 0.024, 0.018, rearC, wingSurf);
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
      const gbCaseWmul = Math.max(0.55, Math.min(1.45, (gbStyle && gbStyle.caseWidth) || 1));
      // STYLE cases: paint strakes / casing so they leave the under-wing shadow.
      // STYLE-only markers: heatFins rides factory/sig boxes too, which keep carbon strakes (#3111 F9).
      const gbPaint = !!(gbStyle && (gbStyle.rearFins || (gbStyle.caseWidth && gbStyle.caseWidth < 0.85)));
      const gbStrakeC = gbPaint ? accentC : CARBON;
      if (gbStrakes > 0) {
        const half = (gbStrakes - 1) / 2;
        for (let i = 0; i < gbStrakes; i++) {
          if (gbPaint) addBox(out, (i - half) * 0.24, 0.18 + gbStrakeH / 2, -2.28, 0.022, gbStrakeH, 0.55, gbStrakeC, SURFACES.paint);
          else addBox(out, (i - half) * 0.24, 0.13 + gbStrakeH / 2, -2.20, 0.015, gbStrakeH, 0.42, CARBON);
        }
      }
      let gbCw = 0, gbCh = 0;
      if (gbCasing > 0) {
        gbCw = (0.15 + gbCasing * 0.05) * gbCaseWmul;
        gbCh = 0.13 + gbCasing * 0.03;
        const caseC = gbPaint && gbCaseWmul < 0.85 ? c2 : CARBON;
        const caseS = gbPaint && gbCaseWmul < 0.85 ? SURFACES.paint : SURFACES.carbon;
        addBox(out, 0, 0.44, -1.92, gbCw * 1.08, gbCh * 1.12, 0.04, caseC, caseS);
        addSpan(out,
          { z: -1.94, y: 0.44, w: gbCw * 1.02, h: gbCh, t: 0.90 },
          { z: -2.12, y: 0.435, w: gbCw, h: gbCh * 0.96, t: 0.88 },
          caseC, null, caseS);
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
        // Smooth Case tell: a wide painted belly plate under the crash structure
        // that long_ratio never gets — readable from the rear camera.
        if (gbPaint && gbCaseWmul < 0.85 && gbStrakes === 0) {
          addBox(out, 0, 0.26, -2.32, 0.72, 0.12, 0.55, c2, SURFACES.paint);
          // A single tip whose bell dips under its top (Cadillac's rim sat 28 mm in it) gets a notch:
          // two plates either side of the bell's chord at y 0.38, 4 mm clear of the rim.
          const bellR = 0.50 - exhTipLowY, notch = exhTipLowY < 0.384 ? Math.sqrt(Math.max(0, bellR * bellR - 0.12 * 0.12)) + 0.004 : 0;
          if (!notch) addBox(out, 0, 0.34, -2.55, 0.58, 0.08, 0.18, accentC, SURFACES.paint);
          else for (const s of [-1, 1]) addBox(out, s * (notch + 0.29) / 2, 0.34, -2.55, 0.29 - notch, 0.08, 0.18, accentC, SURFACES.paint);
          addBox(out, 0, 0.48, -2.40, 0.50, 0.06, 0.30, c2, SURFACES.paint);
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
    // REAR FINS (STYLE): tall painted fins either side of the gearbox crash structure.
    if (!ckpt && gbStyle && gbStyle.rearFins) for (const s of [-1, 1]) {
      addBox(out, s * 0.28, 0.50, -2.28, 0.030, 0.42, 0.52, c1);
      addBox(out, s * 0.28, 0.72, -2.28, 0.08, 0.028, 0.52, CARBON);
      addBox(out, s * 0.28, 0.58, -2.50, 0.018, 0.22, 0.10, accentC, SURFACES.paint);
    }

    part("brakeDucts");
    const brakesT = tier("brakes");
    const ductMul = brakeStyle ? brakeStyle.duct : (brakesT === 0 ? 0.5 : brakesT === 2 ? 1.9 : 1.0);
    const brakeScoop = Math.max(0, Math.min(2, Math.round(
      brakeStyle && brakeStyle.scoop != null ? brakeStyle.scoop : (ductMul >= 1.3 ? 1 : 0))));
    for (const s of [-1, 1]) {
      (shadeFlags.round ? CarShade.boxFn(addTri, { r: 0.028 }) : addBox)(out, s*0.60, 0.28, AXLES.frontZ + 0.19, 0.06, 0.20 * ductMul, 0.13 * ductMul, DARK);   // rounded: a stadium section
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
      if (!ckpt) (shadeFlags.round ? CarShade.boxFn(addTri, { r: 0.028 }) : addBox)(out, s*0.58, 0.30, AXLES.rearZ - 0.20, 0.06, 0.18 * ductMul, 0.12 * ductMul, DARK);
      if (brakeScoop >= 1 && !ckpt) {
        addBox(out, s*0.58, 0.355, AXLES.rearZ - 0.275, 0.07, 0.040, 0.045, INTAKE);
        addBox(out, s*0.58, 0.385, AXLES.rearZ - 0.295, 0.08, 0.010, 0.028, CARBON);
      }
    }

    // BIG SCOOP (STYLE): an oversized brake-duct mouth proud of each FRONT tyre's leading edge.
    if (!ckpt && brakeStyle && brakeStyle.bigScoop) {
      const sc = (brakeStyle.cal || [0.85, 0.12, 0.10]).map((v) => Math.min(v, 1));
      const sm = Math.max(1, Math.min(1.45, (brakeStyle.rotorScale || 1) / 1.18));
      // Grows in x/y only, 1 cm ahead of the tread: a depth x sm sat 8 cm in the tyre (#3111 F10).
      const zB = AXLES.frontZ + AXLES.wheelY + 0.01;
      for (const s of [-1, 1]) {
        addBox(out, s * 0.60, 0.34, zB + 0.10, 0.20 * sm, 0.26 * sm, 0.20, DARK);
        addBox(out, s * 0.60, 0.34, zB + 0.22, 0.24 * sm, 0.28 * sm, 0.04, sc, SURFACES.metal);
      }
    }

    part("suspension");
    const wbMul = suspStyle ? suspStyle.arm : (suspT === 0 ? 0.85 : suspT === 2 ? 1.3 : 1.0);
    const wbPush = suspStyle ? suspStyle.push : (suspT === 2 ? 1 : 0);
    const wbPull = suspStyle && suspStyle.pull ? 1 : 0;
    const armTh = 0.026 * wbMul, suspC = (suspStyle && suspStyle.armTint) || [0.11, 0.11, 0.13];   // armTint: a painted STYLE kit
    const rockerLvl = Math.max(0, Math.min(2, Math.round(suspStyle.rocker || 0)));
    const heaveOn = Math.max(0, Math.min(1, Math.round(suspStyle.heave || 0)));
    const fairArms = !!(wbPush || wbPull || rockerLvl || heaveOn);
    const drawArm = fairArms ? addFairedArm : shadeFlags.round ? (o, a, b, th, c, sf) => CarShade.strut(o, a, b, th * 1.9, th * 0.62, c, addTri, sf, { n: 6 }) : addBeamBetween;   // rounded: a lens section
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
    // LAYOUT knobs (0 = shipped): `pullAt` pullrod at one axle (1 front, 2 rear), `antiDive`
    // tilts the front upper wishbone nose-down, `upright` raises the upper joint in the rim.
    const pullAt = Math.max(0, Math.min(2, Math.round(suspStyle.pullAt || 0))), pullF = wbPull && pullAt !== 2, pullR = wbPull && pullAt !== 1;
    const antiDive = Math.max(0, Math.min(1.5, suspStyle.antiDive || 0)) * 0.07;
    const upX = Math.max(0, Math.min(1.5, suspStyle.upright || 0)) * 0.07;
    // INBOARD PICKUPS. Every arm on the car started at a hardcoded x 0.29-0.33
    // while the bodywork it bolts to is far narrower at the axle stations: the
    // nose flank measures x 0.19-0.21 at the front axle and the engine cover
    // 0.15-0.17 at the rear, so the wishbones, track rods and pushrods all
    // began 0.10-0.16 m outboard of the chassis, floating in clear air with a
    // visible gap between arm root and body from any three-quarter camera.
    // Sample the SAME anchors the bodywork lofts from — the arms then follow a
    // team's nose style and an engine's tailWidth instead of ignoring both.
    const noseRoot = (side, z, y) => {
      const p = anchors.noseAt(z);
      if (!teamStyle.noseCurve) return [side * (p.side - 0.012), y, z];
      y = Math.max(p.bottom + 0.012, Math.min(p.top - 0.012, y));
      // Seat the full arm chord on a shoulder, including raised/low noses.
      const x = Math.max(...[-.04, 0, .04].map(d => noseFlankX(anchors.noseAt(z + d), y, shadeFlags.round))) - .004;
      return [side * x, y, z];
    };
    const inTail = (z) => Math.max(0.14, anchors.coverAt(z).x - 0.012);
    for (const s of [-1, 1]) {
      // Wishbone PLANE SPREAD. 0.27/0.43 put the two pickups 160 mm apart on an
      // upright that lives inside a 462 mm rim (rimR = 0.68 x 0.34): a real
      // upright uses nearly the whole rim, lower joint low in the wheel and
      // upper joint high, which is what gives an F1 front end its splayed-V
      // silhouette. 0.22/0.47 is a 250 mm spread, still 50 mm clear of the rim
      // at each end. The upright casting below grows to span it.
      const fLower = [s*0.69, 0.22 + rideDY, AXLES.frontZ];
      const fUpper = [s*0.69, 0.47 + upX + rideDY, AXLES.frontZ];
      const fLowZ = [AXLES.frontZ - wishboneSpread, AXLES.frontZ + wishboneSpread];
      const fUpY = (z) => 0.42 + upX * 0.6 + (z < AXLES.frontZ ? antiDive : -antiDive * 0.4) + rideDY;
      for (const z of fLowZ) {
        drawArm(out, noseRoot(s, z, 0.225 + rideDY), fLower, armTh, suspC, SURFACES.carbon);
        drawArm(out, noseRoot(s, z, fUpY(z)), fUpper, armTh, suspC, SURFACES.carbon);
      }
      if (fairArms) {
        addWishboneWeb(out, noseRoot(s, fLowZ[0], 0.225 + rideDY),
          noseRoot(s, fLowZ[1], 0.225 + rideDY), fLower, suspC, SURFACES.carbon);
        addWishboneWeb(out, noseRoot(s, fLowZ[0], fUpY(fLowZ[0])),
          noseRoot(s, fLowZ[1], fUpY(fLowZ[1])), fUpper, suspC, SURFACES.carbon);
      }
      drawArm(out, noseRoot(s, AXLES.frontZ - 0.16, 0.34 + rideDY),
        [s*0.69, 0.35 + rideDY, AXLES.frontZ - 0.04*toeScale],
        armTh*0.72*toeScale, suspC, SURFACES.carbon);
      // An upright is a CASTING: wide at the lower wishbone pickup, narrow at
      // the top. `addSpan` with a tapered front frame is the same 12 triangles
      // as the cube it replaces.
      addSpan(out, { z: AXLES.frontZ + 0.05, x: s * 0.69, y: 0.345 + upX / 2 + rideDY, w: 0.055, h: 0.29 + upX, t: 0.55 },
                   { z: AXLES.frontZ - 0.05, x: s * 0.69, y: 0.345 + upX / 2 + rideDY, w: 0.048, h: 0.27 + upX, t: 0.62 },
              [0.18, 0.18, 0.20], null, SURFACES.metal);
      if (wbPush) {
        const outer = pullF ? fUpper : fLower;
        const inner = noseRoot(s, AXLES.frontZ - 0.05, (pullF ? 0.20 : 0.455) + rideDY);
        if (pullF) inner[0] += s * armTh * 0.41;
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
          const outer = pullR ? rUpper : rLower;
          const iX = inTail(AXLES.rearZ + 0.04);
          const inner = pullR ? [s*iX,0.22+rideDY,AXLES.rearZ+0.04]
            : [s*iX,0.53+rideDY,AXLES.rearZ+0.04];
          drawArm(out, outer, inner, armTh*0.82, suspC, SURFACES.carbon);
        }
        // DRIVESHAFT. Nothing spanned gearbox to upright, so from directly
        // behind — a chase camera's view for most of a lap — the rear wheels
        // floated with clear air where the drive is. Sits on the axle line at
        // upright height, with a CV boot at each end; six sides because it is
        // small and half-hidden behind the tyre from every angle but dead
        // astern, which is the one angle that matters here.
        // Outboard end 3 mm into the upright casting (x 0.67 - w/2): 0.605 left
        // a 37 mm gap at the hub on every chassis (car-fit-audit).
        addTube(out, [[s * 0.155, 0.36 + rideDY, AXLES.rearZ],
                      [s * (0.67 - 0.0245), 0.36 + rideDY, AXLES.rearZ]],
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
      const wt = CarWheels.tints(liv);   // livery rimTint / caliperTint override the brakes catalog (unset = null)
      const caliperColor = wt.cal || (brakeStyle ? brakeStyle.cal : BRAKE_CALIPER[brakesT]);
      const rimColor = wt.rim || (wheelStyle && wheelStyle.rim) || (brakeStyle && brakeStyle.rim);   // premium alloy rims (else default dark)
      for (const s of [-1, 1]) {
        addWheel(out, s*0.79, AXLES.wheelY, AXLES.frontZ, 0.34, 0.32,
          tyreBand, caliperColor, rimColor, false, tyreStyle, null, brakeStyle, wheelStyle, wt.ink, PH_RIM);
        addWheel(out, s*0.76, AXLES.wheelY, AXLES.rearZ, 0.34, 0.38,
          tyreBand, caliperColor, rimColor, false, tyreStyle, null, brakeStyle, wheelStyle, wt.ink, PH_RIM);
      }
    }
    // Fixed deflectors belong to the chassis, including the split race body.
    // 2026 over-wheel deflector above each FRONT wheel (tyre crown y 0.68):
    // 0 none / 1 single plane on a stalk / 2 biplane + outboard endplate.
    const wDefl = Math.max(0, Math.min(2, Math.round((wheelStyle && wheelStyle.deflector) || 0)));
    if (wDefl > 0) zone("deflector", () => {
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
    });

    if (sections.length) sections[sections.length - 1].to = out.pos.length / 3;
    const fin = { sections, zoneRanges, dim: _ckAcc, smooth: shade && !sil };
    // opts.shadeKeep: an earlier build's _refinish.keep, handed over ONLY by a caller that knows the geometry is the
    // same (the garage's hull key: a colour-only livery change never moves a vertex). CarShade.smooth then skips its
    // geometry prep (~83 of a ~130 ms build here) and never writes to the shared object; a count mismatch starts fresh.
    const sk = opts && opts.shadeKeep;
    const keep = sk && sk.vt && sk.fx.length === out.idx.length / 3 && sk.cnt.length === out.pos.length / 3 + 1 ? sk : {};
    if (opts && opts.refinish) out._refinish = Object.assign(fin, { mat: out.mat.slice(), col: out.col.slice(), nrm: out.nrm.slice(), keep });
    shadeFlags.round = false;
    shadeFlags.coverHi = true;
    finishPass(out, liv, fin);
    if (ckpt && opts.cockpitHalo) for (let i = cockpitHaloFrom; i < cockpitHaloTo; i++) out.mat[i] = opts.cockpitHalo.surface;
    // Measure each closed section from the vertices it emitted.
    if (sil) out._releaseCpuMirror = true;   // TLX: car shadow casters only (plan M-2)
    if (opts && opts.measure) out.parts = sections.filter((sec) => sec.to > sec.from).map((sec) => {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity,
          z0 = Infinity, z1 = -Infinity;
      for (let i = sec.from * 3; i < sec.to * 3; i += 3) {
        if (out.pos[i] < x0) x0 = out.pos[i]; if (out.pos[i] > x1) x1 = out.pos[i];
        if (out.pos[i + 1] < y0) y0 = out.pos[i + 1]; if (out.pos[i + 1] > y1) y1 = out.pos[i + 1];
        if (out.pos[i + 2] < z0) z0 = out.pos[i + 2]; if (out.pos[i + 2] > z1) z1 = out.pos[i + 2];
      }
      const r2 = (v) => Math.round(v * 100) / 100;
      // from/to: the section's vertex range, for tools/car/car-fit-audit.mjs per-part joins.
      return { name: sec.name, vertices: sec.to - sec.from, from: sec.from, to: sec.to,
               sizeM: [r2(x1 - x0), r2(y1 - y0), r2(z1 - z0)],
               centreM: [r2((x0 + x1) / 2), r2((y0 + y1) / 2), r2((z0 + z1) / 2)],
               boundsZ: [r2(z0), r2(z1)] };
    });
    // Half the vertices are exact repeats; measure/refinish read vertex ranges (CarGeometry.weld).
    else if (!(opts && (opts.refinish || opts.noWeld))) {
      CarGeometry.weld(out);
      // The instanced far-field body only. Near rivals (field, no silhouette)
      // and shadow casters (silhouette, no field) stay on the full mesh.
      if (opts && opts.field && opts.silhouette && opts.noDriver && !opts.noSharedLod)
        CarGeometry.presentShared(out);
    }
    return out;
  }

  // opts.seats (#4219): teammates' bodies from this one build (CarMaterials.reseat; `lid` emits a seat's lid alone).
  function build(color, color2, opts) {
    if (!(opts && opts.seats && opts.seats.size && CarMaterials.seatable(opts))) return buildOne(color, color2, opts);
    const lid = (num) => { const h = { pos: [], nrm: [], col: [], mat: [], idx: [] }; emitHelmet(h, Object.assign({}, opts, { num }), color || [0.8, 0.05, 0.05], opts.livery || {}, false); return h; };
    return CarMaterials.reseat(buildOne(color, color2, Object.assign({}, opts, { refinish: true })), opts, lid);
  }
  function buildComplete(color, color2, opts) {
    const out = build(color, color2, opts);
    const info = out.flapInfo;
    if (!info) return out;
    for (const el of aeroFlapsGeom(info.aLvl, info.style)) {
      // flapInfo carries finish: build()'s paint→finish remap runs before append;
      // without it satin/chrome cars got gloss top flaps here.
      const g = buildFlapGeom(el, info.col, info.finish, info.surface);
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

  return { build, buildComplete, refinish, FINISH_FIELDS, PART_STYLE_FIELDS, appearanceParts, buildWheel, buildWheelLayers, bodyAnchors, SURFACES, FINISH_SURFACE,
           PANEL_COL: PANEL,
           TYRE_BAND, BRAKE_CALIPER, AXLES, CHASSIS,
           TEAM_STYLE, BODY_STYLES, BODY_STYLE_IDS, ALLOW_TEAM_BODY_SWAP, teamStyleOf, bodyStyleKey,
           endplate: endplateGeom, numberBoard, frontPlate: frontPlateGeom,
           wingBand: wingBandGeom,
           aeroFlaps: aeroFlapsGeom, aeroFlapAim, buildFlapGeom,
           sharkFin: FIN, sharkFinPanel, sharkFinBadge, sharkFinRoot, FIN_SHAPES, FIN_SHAPE_IDS,
           TCAM_IDS, COVER_VENT_IDS, mirrorLightAnchors, cockpitMirrorGlass, SPINE_HEIGHT_IDS, spineRise,
           coverProfile, coverFlankX, coverSurfaceY, COVER_STACK,
           aeroLevelOf, aeroStyleOf, styledNoseStations, haloHoopPath };   // the last two: LiveryStations decal fit
})();
