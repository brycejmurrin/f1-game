/* Apex 26 — car body geometry builders (wings, fins, chassis, pods, cover, part recipes).
 * create() receives palette + mesh primitives + chassis datums from Car3D.
 * Pure move from js/car/car3d.js — no number or behaviour change.
 */
"use strict";
const CarBodyGeom = (function () {
  // chine (B·D1e concept bodies, opt-in per pod station via podShape.chine, metres): the outer-top
  // corner becomes a sloped band with a crisp crease at the top, one that reads in the mesh itself. Shared with
  // CarShade.podRing, so the flat and rounded builds cut the same facet. 4 mm floor keeps the
  // ring count fixed along a body that fades its chine out.
  function chineCut(ch, w, h) {
    // A steep tumblehome band (24 deg off the flank, under smooth()'s 55 deg crease, so it
    // shades soft) meeting the top at 66 deg, a crisp line: a 45 deg chamfer would smooth away.
    const d = Math.max(0.004, Math.min(ch, 0.56 * w, 0.25 * h));
    return { x: d * 0.8, y: d * 1.8 };
  }
  function create(context) {
    const {
      SURFACES, CARBON, DARK, INTAKE, PANEL,
      TYRE_BAND, BRAKE_CALIPER,
      AXLES, CHASSIS, DEFAULT_STYLE, DEFAULT_WING, TEAM_STYLE, BODY_STYLES = {}, teamStyleOf,
      geometry, shadeFlags,
    } = context;
    const { addTri, addQuad, addLoft, addBox, addBlock, addSpan, foilThick, FOIL_CAMBER,
      foilAt, addWingFoil, addStationLoft, addTopBevel, addBeveledSpan, addBeamBetween,
      addFairedArm, addWishboneWeb, addTube } = geometry;

  function styledNoseStations(style) {
    const s = style || DEFAULT_STYLE;
    if (s.noseCurve) return curvedNoseStations(s);
    if (s === DEFAULT_STYLE || (!s.noseTipZ && s.noseSlim === 1 && !s.noseDroop)) return CHASSIS.nose;
    const tip = CHASSIS.nose[0], mid = CHASSIS.nose[1], root = CHASSIS.nose[2];
    // Concept bodies (coverLift set): push the WHOLE cone in Z and scale mid/root
    // height hard so a side silhouette moves, not only a tip past the front wing.
    const sil = s.fitBodyDetails || Math.abs(s.coverLift || 0) > 1e-6 || !!s.fitSeat;   // fitSeat: a concept body with a flat cover
    const midSlim = s.noseMidSlim == null ? 1 + (s.noseSlim - 1) * (sil ? 0.85 : 0.55) : s.noseMidSlim;
    const midZ = mid.z + (s.noseTipZ || 0) * (sil ? 0.72 : 0.45);
    // Anteater/wedge (low tip) also drop the mid cone; needle keeps a low slim mid.
    const midY = mid.y + (s.noseDroop || 0) * (sil ? 0.85 : 0.45)
      + (sil ? (s.noseSlim < 0.7 || s.noseLow ? -0.04 : 0) + (s.noseSlim > 1.2 ? 0.03 : 0) : 0);   // noseLow: a widened low snout keeps its drop
    // Every concept body, fitBodyDetails included, roots on CHASSIS.nose[2] (#3111 tip rule).
    if (sil || s.fitSeat) return conceptNose(s, [   // fitted bodies keep this seam even with a level cover
      { z: tip.z + s.noseTipZ, y: tip.y + s.noseDroop,
        w: tip.w * s.noseSlim, h: tip.h * (s.noseTipH == null ? s.noseSlim : s.noseTipH), t: tip.t },
      { z: midZ, y: midY, w: mid.w * midSlim, h: mid.h * (s.noseMidH == null ? midSlim : s.noseMidH), t: mid.t },
    ]);
    return [
      { z: tip.z + s.noseTipZ, y: tip.y + s.noseDroop,
        w: tip.w * s.noseSlim, h: tip.h * (s.noseTipH == null ? s.noseSlim : s.noseTipH), t: tip.t },
      { z: midZ, y: midY, w: mid.w * midSlim, h: mid.h * (s.noseMidH == null ? midSlim : s.noseMidH), t: mid.t },
      { z: root.z + (s.noseTipZ || 0) * (sil ? 0.28 : 0.12),
        y: root.y + (s.noseDroop || 0) * (sil ? 0.35 : 0.15)
          + (sil ? (s.noseSlim < 0.7 || s.noseLow ? -0.025 : 0) : 0),
        w: root.w * (s.noseRootSlim == null ? 1 + (s.noseSlim - 1) * (sil ? 0.45 : 0.2) : s.noseRootSlim),
        h: root.h * (s.noseRootH == null ? 1 + (s.noseSlim - 1) * (sil ? 0.55 : 0.25) : s.noseRootH), t: root.t },
    ];
  }
  // The four Blender studies keep the tub datum but use a broad, downturned
  // cone. Width is independent of thickness; widening must not lower the belly
  // into the front-wing ceiling. All attachment readers use these same rings.
  function curvedNoseStations(s) {
    const tip = CHASSIS.nose[0], root = CHASSIS.nose[2];
    const zTip = tip.z + s.noseTipZ, wTip = tip.w * s.noseSlim;
    const topR = root.y + root.h / 2, bottomR = root.y - root.h / 2;
    const topT = tip.y + s.noseDroop + tip.h / 2;
    const bottomT = Math.max(tip.y + s.noseDroop - tip.h / 2, bottomR + 0.030);
    return Object.assign(Array.from({ length: 9 }, (_, i) => {
      const f = 1 - i / 8, top = topR + (topT - topR) * Math.pow(f, s.noseCurve);
      const bottom = bottomR + (bottomT - bottomR) * f;
      const u = i / 2, k = Math.min(3, Math.floor(u));
      const width = s.nosePlan ? s.nosePlan[k] + (s.nosePlan[k + 1] - s.nosePlan[k]) * (u - k)
        : wTip + (root.w - wTip) * Math.pow(1 - f, 0.45);
      return { z: root.z + (zTip - root.z) * f, y: (top + bottom) / 2,
        // Carry the shoulder forward over the axle before rounding into the
        // tip. A wide end alone still leaves a needle-shaped upper surface.
        w: width,
        h: top - bottom, t: root.t + (0.90 - root.t) * f };
    }), { curve: true });
  }

  // Continuous closed skin; interior stations carry no overlapping caps.
  function closedSkin(out, rings, col) {
    for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < rings[i].length; j++) {
      const k = (j + 1) % rings[i].length, a = rings[i][j], b = rings[i][k];
      const c = rings[i + 1][j], d = rings[i + 1][k];
      addTri(out, a, c, b, col); addTri(out, b, c, d, col);
    }
    for (const [ring, reverse] of [[rings[0], false], [rings[rings.length - 1], true]])
      for (let j = 1; j < ring.length - 1; j++)
        addTri(out, ring[0], ring[reverse ? j + 1 : j], ring[reverse ? j : j + 1], col);
  }
  function noseFlankX(p, y, round) {
    if (!round) return p.side + (p.topSide - p.side) * Math.max(0, Math.min(1, (y - p.bottom) / (p.top - p.bottom)));
    const ring = CarShade.ring({ z: p.z, y: (p.top + p.bottom) / 2,
      h: p.top - p.bottom, w: p.side * 2, t: p.topSide / p.side }, 16);
    let x = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      if ((y - a[1]) * (y - b[1]) <= 0 && Math.abs(b[1] - a[1]) > 1e-9)
        x = Math.max(x, a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]));
    }
    return x;
  }
  // A concept nose (#3111) keeps its tip and mid, the stations that carry its
  // silhouette, under two seams the old recipe broke:
  //  - ROOT: pinned to CHASSIS.nose[2], the section the monocoque starts from.
  //    Moving it with noseTipZ opened a ~150 mm gap to the tub on the long
  //    noses (no triangle crossed z 1.12) and on brick/barge put a .78 x .64
  //    root over a .48 x .38 tub, its bottom at y 0.03 through the tea-tray.
  //  - UNDERSIDE over the front wing (z 1.96-2.16, the flap solver's NOSE_UNDER
  //    window): never lower than the lowest TEAM nose there. The flap ceiling
  //    is derived from the team noses; a fat or drooped concept cone (brick
  //    -78 mm) sat below it, so a flap solved against it could enter the nose.
  //    The tip and mid rise together by the deficit, so the cone keeps its
  //    depth and simply rides higher.
  const NOSE_WING_Z = [1.96, 2.00, 2.10, 2.16];
  let _teamNoseFloor = null;
  function noseBottomAt(st, z) {
    const n = st.length;
    if (z >= st[0].z) return st[0].y - st[0].h * 0.5;
    for (let i = 0; i < n - 1; i++) {
      const a = st[i], b = st[i + 1];
      if (z <= a.z && z >= b.z) {
        const t = (a.z - z) / (a.z - b.z);
        return (a.y - a.h * 0.5) + ((b.y - b.h * 0.5) - (a.y - a.h * 0.5)) * t;
      }
    }
    return st[n - 1].y - st[n - 1].h * 0.5;
  }
  function teamNoseFloor() {
    if (_teamNoseFloor) return _teamNoseFloor;
    const styles = [DEFAULT_STYLE, ...Object.values(TEAM_STYLE)];
    _teamNoseFloor = NOSE_WING_Z.map((z) => Math.min(...styles.map((st) => noseBottomAt(styledNoseStations(st), z))));
    return _teamNoseFloor;
  }
  function conceptNose(s, cone) {
    const root = CHASSIS.nose[2];   // every concept body, fitBodyDetails included (#3111 tip rule)
    let st = [...cone, { z: root.z, y: root.y, w: root.w, h: root.h, t: root.t }];
    if (st[1].z < root.z + 0.15) st[1].z = root.z + 0.15;    // keep the mid ahead of the pinned root
    // noseStep (preview bodies only): the 2012 "platypus" step — the tub's crown
    // runs on to z root+0.14, past the hood's front (1.15; a step at root+0.06
    // left the hood hanging 15 cm over the lowered cone), then drops by noseStep
    // in 5 cm, bottom unchanged, and the cone runs on lower.
    const step = Math.max(0, Math.min(0.22, s.noseStep || 0));
    if (step) {
      st.splice(2, 0, { z: root.z + 0.19, y: root.y - step * 0.5, w: root.w * 0.93, h: root.h - step, t: root.t },
                      { z: root.z + 0.14, y: root.y, w: root.w * 0.96, h: root.h, t: root.t });
      if (st[1].z < root.z + 0.34) st[1].z = root.z + 0.34;   // keep the mid ahead of the step
    }
    // The underside is linear in the tip/mid lift; behind the mid only the
    // mid's share of the root-to-mid blend moves, so divide by that share.
    if (s.noseSculpt) st = curvedNose(st, s.sculptSparse ? 2 : 4);
    const free = s.noseSculpt ? st.length - 1 : 2;
    const floor = teamNoseFloor(), up = st.map((p, i) => (i < free ? Object.assign({}, p, { y: p.y + 1 }) : p));
    let lift = 0;
    NOSE_WING_Z.forEach((z, i) => {
      const d = floor[i] - noseBottomAt(st, z), gain = noseBottomAt(up, z) - noseBottomAt(st, z);
      if (d > 0 && gain > 1e-6) lift = Math.max(lift, d / gain);
    });
    if (lift > 0) for (let i = 0; i < free; i++) st[i].y += lift;
    return st;
  }

  // Monotone Hermite sections make the four reference noses curved in profile,
  // not two straight wedges. The pinned tub seam and wing-clearance lift remain.
  function curvedNose(st, steps) {   // steps per segment: 2 = the shared default's triangle budget
    const h = [st[0].z - st[1].z, st[1].z - st[2].z];
    const sample = (key, segment, t) => {
      const values = st.map(p => key === "top" ? p.y + p.h / 2 : key === "bottom" ? p.y - p.h / 2 : p[key]);
      const d = [(values[1] - values[0]) / h[0], (values[2] - values[1]) / h[1]];
      const m = d[0] * d[1] <= 0 ? 0 : 2 / (1 / d[0] + 1 / d[1]);
      const slopes = [d[0], m, d[1]], a = values[segment], b = values[segment + 1];
      return (2*t*t*t - 3*t*t + 1)*a + (t*t*t - 2*t*t + t)*h[segment]*slopes[segment]
        + (-2*t*t*t + 3*t*t)*b + (t*t*t - t*t)*h[segment]*slopes[segment + 1];
    };
    const out = [];
    for (let segment = 0; segment < 2; segment++) for (let i = 0; i < steps; i++) {
      const t = i / steps, top = sample("top", segment, t), bottom = sample("bottom", segment, t);
      out.push({ z: st[segment].z - h[segment]*t, y: (top + bottom)/2, h: top - bottom,
        w: sample("w", segment, t), t: sample("t", segment, t) });
    }
    return out.concat(st[2]);
  }

  // A BODY span: rounded when CarShade is on for this build (js/car/car-shade.js), else trapezoid + crease.
  // shadeFlags.round / shadeFlags.coverHi are owned by Car3D.build (mutated for the build, then reset).
  function bodySpan(out, a, b, col, bevel) { if (shadeFlags.round) CarShade.loft(out, a, b, col, addTri); else { addSpan(out, a, b, col, col); addTopBevel(out, a, b, bevel, col); } }

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
    // epChord (B·D3c, opt-in): a shorter plate, rear edge fixed; it still spans the
    // whole wing (main plane LE -2.30) and the number board (-2.27..-2.57).
    const ec = st.epChord ? Math.max(0.6, Math.min(1, +st.epChord)) : 1;
    const chord = Math.max(ec < 1 ? 0.43 : 0, (0.48 + 0.24 * topLift) * ec), rearZ = -2.69, frontZ = rearZ + chord;
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
  function wingOf(style) {
    const w = (style && style.wingStyle) || DEFAULT_WING;
    // wsFlat (B·D3c KEEL) resolves HERE, so the baked wing and every flown-flap
    // consumer (garage, track, cache key) agree: no curl, tip rise or ears. The
    // team's twist stays: the cascade's footplate strake is seated against it.
    return style && style.wsFlat
      ? Object.assign({}, w, { teCurve: 0, chordTaper: 0, tipRise: 0, flaps: 2, canard: 0 })
      : w;
  }
  // The rear MAIN PLANE section [zLead, yLead, zTrail, yTrail] under the flap
  // stack's trailing edge `u`. rwGap (B·D3c KEEL, opt-in, m): the plane drops and
  // flattens (trailing edge drops more), opening a wider slot under the flap.
  // `ep` (endplateGeom) caps the drop: the trailing edge stays 3 cm above the
  // plate's lower edge, so the plane always seats in both plates.
  function rearMainOf(u, st, ep) {
    let g = st && st.rwGap ? Math.max(0, Math.min(0.08, +st.rwGap)) : 0;
    if (g && ep) g = Math.max(0, Math.min(g, u - 0.225 - Math.max(ep.front.bottom, ep.rear.bottom) - 0.03));
    return g ? [-2.30, u - 0.270 - g * 0.6, -2.52, u - 0.225 - g]
             : [-2.30, u - 0.270, -2.52, u - 0.225];
  }
  function wingFoilOf(st, i) {
    const w = st && st.wsFlat ? wingOf(st) : (st && st.wingStyle) || st || DEFAULT_WING;
    const k = Math.max(0, Math.min(1, i / 2));
    return { twist: (w.twist || 0) * (0.55 + 0.55 * k),
             teCurve: (w.teCurve || 0) * (0.60 + 0.55 * k),
             chordTaper: (w.chordTaper || 0) * (0.55 + 0.55 * k),
             tipRise: (w.tipRise || 0) * (0.50 + 0.50 * k), wave: w.wave || 0 };
  }
  // fwGap (B·D3c KEEL, opt-in, m): each flap stands g higher than the one under
  // it, so the slots between the elements open up. Absent = the shipped stack.
  function frontCascade(aLvl, st) {
    const a = aLvl;
    const els = [
      [2.72, 0.048, 2.40, 0.086, 1.00, 0.024],   // main plane (structure, never moves)
      [2.50, 0.092, 2.24, 0.146, 0.98, 0.020],   // flap 1
    ];
    if (a >= 1) els.push([2.34, 0.148, 2.10, 0.212, 0.95, 0.018]);   // flap 2
    if (a >= 3) els.push([2.20, 0.200, 1.98, 0.272, 0.92, 0.016]);   // flap 3
    if (a >= 4) els.push([2.08, 0.256, 1.88, 0.328, 0.88, 0.014]);   // flap 4
    const g = st && st.fwGap ? Math.max(0, Math.min(0.03, +st.fwGap)) : 0;
    if (g) for (let i = 1; i < els.length; i++) { els[i][1] += g * i; els[i][3] += g * i; }
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
  // B·D3c concept-sheet endplates (aero `epShape`, opt-in; absent = the
  // `plate` table above). Heights stay inside FRONT_PLATE's own range.
  // 1 RIFT: low nose, raked-up tail. 2 DELTA: tall, for up-swept flaps.
  // 3 SERPENT: rolled crown over curled flaps. 4 KEEL: tall square plate, flat top.
  const EP_SHAPES = [null,
    { hF: 0.14, hR: 0.46, kick: 0.040, footW: 0.12, footZ: 0.54, arch: 0 },
    { hF: 0.28, hR: 0.54, kick: 0.050, footW: 0.13, footZ: 0.56, arch: 1 },
    { hF: 0.22, hR: 0.48, kick: 0.040, footW: 0.14, footZ: 0.58, arch: 0, roll: 1 },
    { hF: 0.30, hR: 0.36, kick: 0.010, footW: 0.12, footZ: 0.52, arch: 0 },
  ];
  function frontPlateGeom(aLvl, aero) {
    const lvl = aLvl == null ? 2 : aLvl;
    const pick = aero && aero.plate != null ? aero.plate : 1;
    const shape = aero && aero.epShape ? EP_SHAPES[Math.max(1, Math.min(4, Math.round(aero.epShape)))] : null;
    const P = shape || FRONT_PLATE[Math.max(0, Math.min(3, Math.round(pick)))];
    const half = frontHalf(lvl);
    const w = lvl >= 4 ? 0.060 : (lvl <= 0 ? 0.028 : 0.044);
    const x = half + 0.03;
    const kick = Math.min(P.kick, Math.max(0, CAR_HALF - half - 0.03 - w * 0.5 - 0.006));
    return { P, w, kick,
             front: { z: 2.66, x, y: 0.135, h: P.hF, t: 0.62 },
             rear:  { z: shape ? 2.06 : 1.98, x: x + kick, y: 0.245, h: P.hR, t: 0.78 } };
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
  // FRONT WING ONLY — the rear is one rigid flap, solved by rearFlap() below.
  // Extra incidence the CLOSED (Z-mode) pose takes on top of the element's own
  // baked angle. The front wing only trims enough to keep the balance, and is
  // boxed in by the nose above it besides.
  // The front used to be ZERO, and that is a fix rather than a shrug. A front cascade is
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
  // plank.
  const Z_BITE = { front: 0.12 };
  // Where each element pivots, as a fraction of its own chord: 0 = leading edge,
  // 1 = trailing edge.
  // Mid-chord drops the TE in X-mode, so the cascade reads from wingFront; a
  // LE-near hinge (what C3.10.10 actually asks for) hid it under the nose.
  const HINGE = { front: 0.52 };
  const OPEN_FRAC = { front: 2.2 };
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
    for (const st of [...Object.values(TEAM_STYLE), ...Object.values(BODY_STYLES)]) {
      const d = st.noseDroop || 0;
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
  // The flap solves ask a neighbour's top at ~40 z's per pose, ~120 poses per end, ~20
  // pivots: rebuilding its 33-point line per ask was ~33 M elemPoint calls and 0.16-1.2 s a
  // recipe (perf hunt 7). The line depends only on (e, d), so it is built once; the walk and
  // its float ops are unchanged, so every answer is bit-identical.
  const _topLines = new WeakMap();
  function elemTopLine(e, d) {
    let byD = _topLines.get(e), line = byD && byD.get(d);
    if (line) return line;
    const N = 32, z = new Float64Array(N + 1), top = new Float64Array(N + 1);
    for (let k = 0; k <= N; k++) { const p = elemPoint(e, d, k / N); z[k] = p.z; top[k] = p.top; }
    if (!byD) _topLines.set(e, byD = new Map());
    byD.set(d, line = { z, top });
    return line;
  }
  function elemTopAt(e, d, z) {
    const L = elemTopLine(e, d), zs = L.z, tops = L.top;
    for (let k = 1; k < zs.length; k++) {
      const z0 = zs[k - 1], z1 = zs[k];
      if ((z <= z0 && z >= z1) || (z >= z0 && z <= z1)) {
        const f = (z - z0) / ((z1 - z0) || 1e-9);
        return tops[k - 1] + (tops[k] - tops[k - 1]) * f;
      }
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
  const CLEAR_FT = Array.from({ length: 41 }, (_, k) => foilThick(k / 40));   // solvePoses' CLEAR_N = 40 stations
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
      // elemPoint(self, d, k / CLEAR_N) inlined, its cos/sin hoisted per pose and foilThick tabled:
      // the same expressions in the same order, so bit-identical (perf hunt 7).
      const clears = (d, prevDelta) => {
        const ang = self.natural + d, c = Math.cos(ang), s = Math.sin(ang);
        for (let k = 0; k <= CLEAR_N; k++) {
          const t = k / CLEAR_N, u = (t - self.hinge) * self.chord;
          const mid = self.py + u * s - FOIL_CAMBER * self.chord * 4 * t * (1 - t);
          const hh = self.thick * 0.5 * CLEAR_FT[k], pz = self.pz - u * c;
          const ceil = noseUnderAt(pz);
          if (isFinite(ceil) && mid + hh > ceil - NOSE_GAP) return false;
          if (prev) {
            const below = elemTopAt(prev, prevDelta, pz);
            if (below != null && mid - hh < below + SLOT_MIN) return false;
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
  // THE REAR WING'S "RW FLAP" (FIA 2026 Section C, C3.11.6). The main plane
  // is fixed; EVERY element above it moves as one rigid body ("maintain the
  // geometric relationship between all parts of RW Flap") about ONE axis on Y,
  // between the flap's mid-point and its rearmost point in X, and Straight
  // Mode is only a DECREASE in incidence. The rear used to go through hinged()
  // like the front: each element on its own axis at 45 % chord (the FRONT
  // half), opened by 2.6x its own angle, so the top flap went from +48 deg to
  // -26 deg — leading edge above the trailing edge — and swung its nose up
  // through the plane over it. docs/notes/REAR-WING-ACTIVE-AERO-2026-10-19.md.
  // Incidence of the primary ("rear") element at each end, rad: a downforce
  // 2026 flap in Corner Mode, flattened to just positive in Straight Mode.
  const REAR_INC = Object.freeze({ corner: 0.56, straight: 0.035 });
  // Pivot station over the flap's X extent, 0 = its front, 1 = its rearmost
  // point. The regs allow 0.5..1; short of 1 the leading edge keeps the lever
  // arm to open a DRS-sized (~85 mm) slot while the trailing edge barely moves.
  const REAR_PIVOT = 0.72;
  function rearFlap(stack, main) {
    let front = -Infinity, back = Infinity;
    for (const [, le, te] of stack) { front = Math.max(front, le[0]); back = Math.min(back, te[0]); }
    const pz = front + (back - front) * REAR_PIVOT;
    const [, ple, pte] = stack.find((el) => el[0] === "rear");
    const t = Math.max(0, Math.min(1, (pz - ple[0]) / (pte[0] - ple[0])));
    const py = ple[1] + (pte[1] - ple[1]) * t;   // on the primary's chord line
    const natural = Math.atan2(pte[1] - ple[1], ple[0] - pte[0]);
    // A design-pose point rotated about the pivot, exactly as drawAeroFlaps does.
    const rot = (z, y, d) => {
      const dy = y - py, dz = z - pz, c = Math.cos(d), s = Math.sin(d);
      return [dy * s + dz * c + pz, dy * c - dz * s + py];
    };
    // The stack is rigid, so its own slots never change: only the LOWEST
    // element can reach the fixed main plane, and only it is checked.
    const low = elemRecord(stack[0][1], stack[0][2], stack[0][3], 0);
    const clears = (d) => {
      for (let k = 0; k <= 40; k++) {
        const p = elemPoint(low, 0, k / 40), q = rot(p.z, p.bot, d);
        const under = elemTopAt(main, 0, q[0]);
        if (under != null && q[1] < under + SLOT_MIN) return false;
      }
      return true;
    };
    const relax = (from, dir) => {
      for (let i = 0; i <= 60; i++) { const d = from + dir * 0.01 * i; if (clears(d)) return d; }
      return null;
    };
    const zAngle = relax(REAR_INC.corner - natural, -1) ?? 0;
    const xAngle = Math.min(zAngle, relax(REAR_INC.straight - natural, +1) ?? zAngle);
    return stack.map(([id, le, te, thick, sweepMul, half, paint]) => ({
      id, wing: "rear", z: pz, y: py, le, te, thick, half, sweepMul, paint: paint || null,
      chord: Math.hypot(le[0] - te[0], te[1] - le[1]),
      natural: Math.atan2(te[1] - le[1], le[0] - te[0]),
      hinge: (pz - le[0]) / (te[0] - le[0]),   // the pivot's station on THIS chord; off-line for all but "rear"
      zAngle, xAngle,
    }));
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
      const w = st0.wsFlat ? wingOf(st0) : st0.wingStyle || st0;
      sig = [st0.frontSweep, st0.frontTaper, st0.frontRise,
             st0.rearSweep, st0.rearTaper, st0.drs || 0, st0.rwBowl || 0,
             w.twist || 0, w.teCurve || 0, w.chordTaper || 0, w.tipRise || 0, w.wave || 0]
        .map((v) => +v || 0).join(",");
      // The top flap's ears are topology, not foil shape: key a non-default flap
      // count (the default keeps its legacy text).
      const flaps = wingOf(st0).flaps || 3;
      if (flaps !== (DEFAULT_WING.flaps || 3)) sig += "|flaps:" + flaps;
      // B·D3c shape fields join the key only when set, so shipped keys keep their text.
      const ext = [st0.fwCurve, st0.fwStep, st0.rwRise, st0.rwCurve, st0.rwPlanes, st0.epChord].map((v) => +v || 0);
      if (ext.some((v) => v)) sig += "|" + ext.join(",");
      if (st0.rwGap || st0.fwGap) sig += "|gap:" + (+st0.rwGap || 0) + "," + (+st0.fwGap || 0);
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
  // B·D3c tip lift, applied to EVERY element of a wing alike so the slots
  // between elements keep their gap at every span station. Front: fwCurve
  // (quadratic curl) + fwStep (stepped flaps). Rear: rwRise (linear) +
  // rwCurve (quadratic). Returns {} when unset, so shipped specs stay as they were.
  function shapeLift(st, wing) {
    const c = Math.max(0, Math.min(0.14, +(wing === "front" ? st.fwCurve : st.rwCurve) || 0));
    const r = Math.max(0, Math.min(0.10, +(wing === "front" ? st.fwStep : st.rwRise) || 0));
    if (!c && !r) return {};
    // A lifted front tip climbs toward the tyre's axle height, where its forward
    // bulge reaches furthest: move the tip 6 cm forward with it.
    return wing === "front" ? { rise2: c, riseStep: r, tePull: 0.06 } : { rise: r, rise2: c };
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
    const els = frontCascade(a, st), baked = frontBakedCount(a), fwHalf = frontHalf(a);
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
      out.push(hinged("front" + i, "front", e[0], e[1], e[2], e[3], Object.assign({
        half: fwHalf * e[4], thick: e[5], taper: frontTaper,
        sweep: frontSweep * (0.75 + i * 0.10),
        rise: frontRise * (0.65 + i * 0.12) + extra.tipRise,
        attachHalf: fwHalf + 0.03,
        // A B·D3c lifted tip IS the curl: no team ears on top of it (they reach the tyre).
        upsweep: i === els.length - 1 && (wingOf(st).flaps || 3) >= 3 && !shapeLift(st, "front").rise2
          && !shapeLift(st, "front").riseStep ? { fwHalf, e } : null,
        twist: extra.twist, teCurve: extra.teCurve, chordTaper: extra.chordTaper, wave: extra.wave,
      }, shapeLift(st, "front")), prev));
    }
    const ep = endplateGeom(a, st), crownY = ep.rear.top - 0.018;
    const upperTrailY = crownY - ((a >= 4 || (st.drs || 0)) ? 0.075 : 0);
    const rm = rearMainOf(upperTrailY, st, ep);
    const rearMain = elemRecord([rm[0], rm[1]], [rm[2], rm[3]], 0.024, 0);
    const stack = [];   // [id, le, te, thick, sweepMul, half, paint?] bottom-up
    // rwPlanes 1 (B·D3c concept wings): one broad flap over the main plane, no mid
    // element, top element or separate DRS plane, the sheet's two-plane wing.
    const single = (st.rwPlanes | 0) === 1;
    if (a >= 2 && !single) stack.push(["rearMid", [-2.34, upperTrailY - 0.170], [-2.56, upperTrailY - 0.115], 0.022, 0.9, 0.51]);
    stack.push(["rear", [-2.38, upperTrailY - 0.075], [-2.64, upperTrailY], 0.026, 1, 0.51]);
    if (single) { /* the "rear" flap alone */ }
    else if (a >= 4 && !(st.drs || 0)) stack.push(["rearTop", [-2.42, crownY - 0.055], [-2.66, crownY], 0.022, 1.1, 0.50]);
    // The drs plane car3d.js used to bake STATIC over this stack. It is part of
    // the RW Flap too, so it flies with it, in the livery's rearWing colour.
    if ((st.drs || 0) && !single) stack.push(["rearDrs", [-2.44, crownY - 0.050], [-2.60, crownY], 0.016, 1.15, 0.49, "rearWing"]);
    for (const el of rearFlap(stack, rearMain)) {
      out.push(Object.assign(el, { taper: rearTaper, sweep: rearSweep * el.sweepMul, attachHalf: 0.50, rise: 0, bowl: st.rwBowl || 0 },
        shapeLift(st, "rear")));
    }
    return out;
  }
  function buildFlapGeom(el, col, finish, surface) {
    if (surface === "carbon") col = CARBON;
    const out = { pos: [], nrm: [], col: [], mat: [], idx: [] };
    // The element exactly as the wing build emits it...
    addWingFoil(out, {
      zLead: el.le[0], yLead: el.le[1], zTrail: el.te[0], yTrail: el.te[1],
      half: el.half, thick: el.thick, taper: el.taper,
      sweep: el.sweep, rise: el.rise, attachHalf: el.attachHalf,
      twist: el.twist, teCurve: el.teCurve, chordTaper: el.chordTaper, wave: el.wave, bowl: el.bowl,
      rise2: el.rise2, riseStep: el.riseStep, tePull: el.tePull,
    }, col, surface === "carbon" ? SURFACES.carbon : SURFACES.paint);
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
    if (surface === "carbon") {
      // Upsweep spans also belong to the flap; keep every vertex bare weave.
      for (let i = 0; i < out.mat.length; i++) out.mat[i] = SURFACES.carbon;
    } else CarMaterials.applyFinish(out, finish);
    return CarGeometry.weld(out);
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
  // TOPMOST rear surface carries it (`rearTop` at max downforce, `rearDrs` with
  // a DRS package); both would otherwise draw straight over it. Chord
  // fractions clear the leading curl and the trailing edge, HALF is inside the
  // element's own 0.51, the span is cut into addWingFoil's own five segments so
  // the band follows the sweep, `proud` is along the local normal, not +Y.
  const WING_BAND = Object.freeze({ tF: 0.17, tR: 0.83, half: 0.44, proud: 0.005, seg: 5 });
  function wingBandGeom(aLvl, style) {
    const a = aLvl == null ? 2 : aLvl;
    const st = (style && typeof style === "object") ? style : AERO_STYLE_DEF;
    const W = WING_BAND;
    let fg = null;
    for (const f of aeroFlapsGeom(a, st)) if (f.wing === "rear") fg = f;   // the TOPMOST one
    if (!fg) return null;
    // Exactly what buildFlapGeom hands addWingFoil, and exactly the pose
    // drawAeroFlaps hangs it at with the wing closed.
    const spec = { zLead: fg.le[0], yLead: fg.le[1], zTrail: fg.te[0], yTrail: fg.te[1],
                   half: fg.half, thick: fg.thick, taper: fg.taper, sweep: fg.sweep,
                   rise: fg.rise, attachHalf: fg.attachHalf, wave: fg.wave, bowl: fg.bowl, rise2: fg.rise2, riseStep: fg.riseStep };
    const elem = fg.id, ca = Math.cos(fg.zAngle), sa = Math.sin(fg.zAngle);
    const pose = (p) => {
      const dy = p.y + p.h - fg.y, dz = p.z - fg.z;
      return { y: dy * ca - dz * sa + fg.y, z: dy * sa + dz * ca + fg.z };
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
    const h = c.top - c.bottom, d = h * (c.sculptShoulder ? 0.32 : COVER_DROP);
    const ck = Math.max(-0.04, Math.min(0.06, c.k || 0));
    const cr = Math.max(0.20, COVER_CROWN - ck * 2.4);
    const keys = [[c.xb != null ? c.xb : c.x, c.bottom], [c.x * COVER_SHOULDER, c.top - d],
                  [c.x * 0.55, c.top - d * 0.32], [c.x * cr, c.top]];
    let pts = (dense && typeof CarShade !== "undefined" && CarShade.densifyCoverPts)
      ? CarShade.densifyCoverPts(keys) : keys;
    if (c.smoothSpine) {
      pts = keys.slice(0, 2);
      for (let i = 1; i < 8; i++) {
        const a = i / 8 * Math.PI / 2;
        pts.push([keys[3][0] + (keys[1][0] - keys[3][0]) * Math.cos(a),
          keys[1][1] + (keys[3][1] - keys[1][1]) * Math.sin(a)]);
      }
      pts.push(keys[3]);
    } else if (c.curve) {
      // Keep the painted flank/shoulder datums; round only the roof above them.
      pts = [keys[0], keys[1]];
      for (let i = 1; i <= 6; i++) {
        const a = i * Math.PI / 12;
        pts.push([keys[3][0] + (keys[1][0] - keys[3][0]) * Math.cos(a),
          keys[1][1] + (c.top - keys[1][1]) * Math.sin(a)]);
      }
    }
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
  // sduct (#3411): the S-DUCT exit on the nose crown: a carbon ramp rising rearward with a dark
  // throat and exit slot between two lips (the inlet under the nose is not drawn: no camera sees it).
  function addNoseSDuct(out, anchors, c1) {
    const a = anchors.noseAt(1.56), b = anchors.noseAt(1.26);
    const ramp = (z, n, rise, w) => ({ z, x: 0, y: n.top + rise / 2, w, h: rise, t: 0.92 });
    const rr = ramp(1.26, b, 0.048, 0.18);
    addSpan(out, ramp(1.56, a, 0.010, 0.15), rr, CARBON, null, SURFACES.carbon);
    // throat: 3 mm proud of the ramp's top skin, so it never shares its plane
    const top = (r, w) => ({ z: r.z, x: 0, y: r.y + r.h / 2 + 0.003, w, h: 0.006 });
    addSpan(out, top(ramp(1.50, anchors.noseAt(1.50), 0.010 + 0.038 * 0.2, 0.15), 0.07),
                 top(rr, 0.11), INTAKE, null, SURFACES.carbon);
    addBox(out, 0, rr.y + 0.004, 1.256, 0.13, 0.030, 0.008, INTAKE);   // the exit mouth
    for (const s of [-1, 1]) addSpan(out,
      { z: 1.52, x: s * 0.080, y: a.top + 0.006, w: 0.010, h: 0.012 },
      { z: 1.25, x: s * 0.098, y: b.top + 0.035, w: 0.012, h: 0.070 }, c1);
  }

  function buildAeroParts(recipe, tier) {
    const lvl = tier === 0 ? 0 : tier === 2 ? 4 : 2;
    // 2026 regulation defaults (factory signatures already stamp these in
    // parts.js — #1198): no beam wing, universal active flaps, mandated
    // in-wash bargeboard. Catalog options that omit the fields inherit here;
    // `beam_wing` keeps an explicit beam:1 for career/fantasy picks.
    return mergeRecipe({
      lvl, beam: 0, drs: 1,
      vane: lvl >= 4 ? 3 : lvl >= 3 ? 2 : lvl >= 1 ? 1 : 0,
      plate: 1, casc: null, swan: 0, tvane: null,
      duct: 0, sduct: 0, board: 1, slot: 0,
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

  const CKPT_MONO_REAR = Object.freeze({ z: 0.45, y: 0.32, w: 0.552, h: 0.16, t: 0.752 });
  function buildSharedChassis(out, c1, rideDY, noseStations, ckpt, edgeAt, measure, noseC) {
    const floor = CHASSIS.floor;
    if (shadeFlags.round) CarShade.floor(out, floor, Math.max(floor.cy + rideDY, 0.052), edgeAt, CARBON, addTri); else addBox(out, floor.cx, Math.max(floor.cy + rideDY, 0.052), floor.cz,
           floor.sx, floor.sy, floor.sz, CARBON);
    const nose = noseStations || CHASSIS.nose;
    if (nose.curve) {
      const from = out.pos.length / 3;
      closedSkin(out, nose.map((p) => shadeFlags.round ? CarShade.ring(p, 16) : [
        [p.w / 2, p.y - p.h / 2, p.z], [p.w * p.t / 2, p.y + p.h / 2, p.z],
        [-p.w * p.t / 2, p.y + p.h / 2, p.z], [-p.w / 2, p.y - p.h / 2, p.z],
      ]), noseC || c1);
      if (measure) out.noseSkin = { from, to: out.pos.length / 3 };
    } else for (let i = 0; i < nose.length - 1; i++) bodySpan(out, nose[i], nose[i + 1], c1, i ? 0.028 : 0.022);
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
    for (const [f0, r0] of CK_SEGS) if (shadeFlags.round) CarShade.cTub(out, [f0, r0].map((st) => Object.assign({}, st, { t: ckFlank(st, ckRailTop(st)) / (st.w / 2), open: ckOpen(st.z), rail: ckRailTop(st) })), CK_FLOOR_Y, c1, addTri); else addSpan(out, ckLower(f0), ckLower(r0), c1);
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
      if (!shadeFlags.round) addBlock(out, q, c1);   // rounded build: the rails are the C of CarShade.cTub above
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

  function sidepodStation(side, z, inner, outer, innerBottom, outerBottom, innerTop, outerTop, chine) {
    const c = chine == null ? null : chineCut(chine, outer - inner, outerTop - outerBottom);
    return [
      [side * inner, innerBottom, z], [side * outer, outerBottom, z],
      ...(c ? [[side * outer, outerTop - c.y, z], [side * (outer - c.x), outerTop, z]] : [[side * outer, outerTop, z]]),
      [side * inner, innerTop, z],
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
    // Concept bodies set coverLift ≠ 0: push inletH onto the pod TOP line so
    // tall/low inlets read in side view (DAD #2924: need ≥ SUBTLE_PCT in side).
    // TEAM_STYLE has no coverLift — keep the old mild shoulder coupling.
    const sil = style && (style.fitBodyDetails || Math.abs(style.coverLift || 0) > 1e-6 || !!style.fitSeat);
    const shoulderTop = 0.49 + 0.23 * (shoulder - 1) + inletH * (sil ? 0.95 : 0);
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
    const waistTop = 0.42 + 0.10 * (shoulder - 1) + (sil ? inletH * 0.70 : 0);
    const waistOuterTop = 0.38 + 0.08 * (shoulder - 1) + (sil ? inletH * 0.55 : 0);
    const stations = [
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
        innerTop: shoulderTop + (sil ? 0 : inletH * 0.15),
        outerTop: shoulderTop - 0.015 + (sil ? 0 : inletH * 0.08) },
      { z: -0.38, inner: 0.28, outer: outerShoulder * 0.55 + outerWaist * 0.45,
        innerBottom: 0.162 + 0.10 * (undercut - 1),
        outerBottom: 0.176 + 0.09 * (undercut - 1) + undercutD * 0.55,
        innerTop: shoulderTop * 0.68 + waistTop * 0.32,
        outerTop: (shoulderTop - 0.015) * 0.62 + waistOuterTop * 0.38 },
      { z: -0.62, inner: 0.27, outer: outerWaist,
        innerBottom: 0.14 + 0.08 * (undercut - 1),
        outerBottom: 0.160 + 0.07 * (undercut - 1) + undercutD * 0.35,
        innerTop: waistTop, outerTop: waistOuterTop },
      { z: -1.05, inner: 0.25, outer: outerWaist * 0.42 + outerTail * 0.58,
        innerBottom: 0.134, outerBottom: 0.146,
        innerTop: 0.355 + 0.07 * (shoulder - 1) + (sil ? inletH * 0.18 : 0),
        outerTop: 0.318 + 0.04 * (shoulder - 1) + (sil ? inletH * 0.12 : 0) },
      { z: -1.48, inner: 0.23, outer: outerTail, innerBottom: 0.13,
        outerBottom: 0.134,
        innerTop: 0.30 + 0.05 * (shoulder - 1) + (sil ? inletH * 0.08 : 0),
        outerTop: 0.27 + (sil ? inletH * 0.05 : 0) },
    ];
    // Opt-in ring relief: [width, roof, belly] offsets in metres. Keep the seven
    // canonical stations, so all decals, inlets and detail anchors follow the skin.
    if (style && style.podRelief) stations.forEach((p, i) => {
      const d = style.podRelief[i];
      p.outer += d[0];
      p.innerTop += d[1]; p.outerTop += d[1];
      p.innerBottom += d[2]; p.outerBottom += d[2];
    });
    // Enforce after all relief, including narrowing at the tail, so supplier
    // engine differences cannot close a concept's duct or invert its flank.
    if (style && style.minPodSpan) for (const p of stations)
      p.outer = Math.max(p.outer, p.inner + style.minPodSpan);
    const st = stations.map(podShaped(style && style.podShape)).map(clampPodStation);
    // Ease the undercut's lower line: an inner station whose outerBottom creases
    // more than 3° (5-9° at z 0.50 on every car) moves part-way onto its
    // neighbours' chord (up to four passes; the ends and the undercut gap stay). The
    // gentler aft stations stay put: the flank details are pinned to them.
    const crease = (a, b, c) => Math.abs(Math.atan2(a.outerBottom - b.outerBottom, a.z - b.z) - Math.atan2(b.outerBottom - c.outerBottom, b.z - c.z));
    for (let pass = 0; pass < 4; pass++) {
      const ob = st.map((p) => p.outerBottom);
      const ease = st.map((p, i) => i > 0 && i < st.length - 1 && crease(st[i - 1], p, st[i + 1]) > 0.0524);
      for (let i = 1; i < st.length - 1; i++) {
        if (!ease[i]) continue;
        const a = st[i - 1], b = st[i + 1], k = (a.z - st[i].z) / (a.z - b.z);
        const chord = ob[i - 1] + (ob[i + 1] - ob[i - 1]) * k;
        st[i].outerBottom = Math.max(st[i].innerBottom + 0.004, ob[i] + (chord - ob[i]) * 0.6);
      }
    }
    // Concept-only span floor: supplier engines may be narrower than the concept's
    // additive waist/inlet cuts. Preserve an open duct and outward-facing flank;
    // legacy recipes omit this control and retain their original streams.
    if (style && style.minPodSpan) for (const p of st)
      p.outer = Math.max(p.outer, p.inner + style.minPodSpan);
    // Aft shoulder relief changes the existing rings; decals sample these same stations.
    if (style && style.waistH) for (const p of st) {
      const k = Math.max(0, 1 - Math.abs(p.z + 0.62) / 0.90);
      p.innerTop += style.waistH * k; p.outerTop += style.waistH * k;
    }
    return st;
  }

  // podShape (B·D1d concept bodies, opt-in; absent = shipped): per-station metre offsets on the
  // seven pod stations, front to rear — top (both tops), out (outer half-width), bot (outer belly;
  // + raises it = deeper undercut), chine (outer-top chamfer depth, see chineCut). The validity clamp below still runs after it.
  function podShaped(ps) {
    if (!ps) return (p) => p;
    return (p, i) => Object.assign(p, {
      innerTop: p.innerTop + (ps.top ? ps.top[i] : 0), outerTop: p.outerTop + (ps.top ? ps.top[i] : 0),
      outer: p.outer + (ps.out ? ps.out[i] : 0), outerBottom: p.outerBottom + (ps.bot ? ps.bot[i] : 0) },
      ps.chine ? { chine: ps.chine[i] } : null);
  }
  // Post-styling validity pass (#3111). The style offsets are raw metres and
  // BODY_STYLES carries 4-10x the TEAM_STYLE ranges, so on a narrow or low-
  // shouldered engine a concept body walked its pod inside out: wedge's
  // inletH -0.26 put the top 18 cm under the bottom, needle's inletW -0.24
  // put the outer edge inboard of the inner one on the Honda/Audi/Aston pods,
  // brick/barge's undercutD -0.16 hung the belly 16 cm below the inboard edge,
  // and inletH +0.28 lifted the shoulder through the mirror housings (y 0.698
  // up). Each floor below sits UNDER the worst team x catalog-engine value at
  // its station (body-styles.test.mjs pins that), so every grid car is
  // bit-identical and only an out-of-envelope body is moved. Order matters:
  // cap the top, widen, keep the belly in the team undercut envelope, then
  // restore height by lowering the belly toward the floor rail before raising
  // the top — a low concept pod stays low instead of turning tall.
  const POD_MIN_W = { "0.62": 0.10, "0.5": 0.10, "0.22": 0.12, "-0.38": 0.10, "-0.62": 0.06, "-1.05": 0.04, "-1.48": 0.02 };
  const POD_MIN_H = { "0.62": 0.10, "0.5": 0.10, "0.22": 0.12, "-0.38": 0.12, "-0.62": 0.12, "-1.05": 0.10, "-1.48": 0.08 };
  const POD_TOP_MAX = 0.65;          // under every mirror housing (lowest bottom ~0.666)
  const POD_BELLY_MIN = 0.13;        // floor-rail top: the belly never goes under it
  const POD_UNDERCUT_MIN = -0.04;    // haas: the deepest reversed undercut on the grid
  function clampPodStation(p) {
    const minW = POD_MIN_W[String(p.z)], minH = POD_MIN_H[String(p.z)];
    p.innerTop = Math.min(p.innerTop, POD_TOP_MAX);
    p.outerTop = Math.min(p.outerTop, POD_TOP_MAX);
    if (p.outer < p.inner + minW) p.outer = p.inner + minW;
    if (p.outerBottom < p.innerBottom + POD_UNDERCUT_MIN - 1e-9) p.outerBottom = p.innerBottom + POD_UNDERCUT_MIN;
    for (const e of ["inner", "outer"]) {
      const bk = e + "Bottom", tk = e + "Top";
      if (p[tk] - p[bk] >= minH) continue;
      p[bk] = Math.max(POD_BELLY_MIN, Math.min(p[bk], p[tk] - minH));
      if (p[tk] < p[bk] + minH) p[tk] = p[bk] + minH;
    }
    // Lowering the inner belly can leave the outer one under the envelope
    // again; and a reversed undercut stops at the floor rail (or the inboard
    // belly, when a grid car's already sits under the rail).
    if (p.outerBottom < p.innerBottom + POD_UNDERCUT_MIN - 1e-9) p.outerBottom = p.innerBottom + POD_UNDERCUT_MIN;
    const bellyFloor = Math.min(p.innerBottom, POD_BELLY_MIN);
    if (p.outerBottom < bellyFloor) p.outerBottom = bellyFloor;
    if (p.outerTop < p.outerBottom + minH) p.outerTop = p.outerBottom + minH;
    return p;
  }

  // New concepts opt into detail fitting; legacy recipes keep their emitted streams.
  function fitBodyDetails(anchors, style) {
    if (!style.fitBodyDetails) return null;
    return {
      floorStep(step, ride) {
        const bottom = Math.max(CHASSIS.floor.cy + ride, 0.052) - CHASSIS.floor.sy / 2;
        const needed = (base, down, up = down) => {
          const dy = bottom - base - ride; return dy / (dy > 0 ? up : down);
        };
        return Math.max(step * 0.85, -0.030, needed(0.084, 1, 0.825), needed(0.087, 0.675, 0.425),
          needed(0.090, 0.45), needed(0.116, 0.25), needed(0.120, 0.70, 0.30));
      },
      noseMount(side) {
        const z = Math.min(2.40, CHASSIS.nose[0].z + style.noseTipZ - 0.065), n = anchors.noseAt(z);
        const w = Math.min(anchors.noseAt(z - 0.060).side, anchors.noseAt(z + 0.060).side);
        const seat = style.noseSeat != null ? style.noseSeat : style.podSculpt ? -0.012 : 0.012;
        return [side * Math.min(0.09, Math.max(0, w * 0.40 - 0.020)), n.bottom + seat, z];
      },
      coverStripe(out, color) {
        const band = (z, w) => { const c = anchors.coverAt(z), p = coverProfile(c);
          return [z, 0, coverSurfaceY(c, 0) + COVER_STACK.vent - 0.010,
            Math.min(w, p.pts[p.pts.length - 1][0] * 1.8), 0.020]; };
        const front = band(-0.64, 0.070), mid = band(-0.94, 0.075), rear = band(-1.95, 0.060);
        if(anchors.coverStops) {
          const zs=[-0.64,...anchors.coverStops.filter(z=>z< -0.64&&z> -1.95),-1.95];
          const width=z=>z>= -0.94 ? 0.070+0.005*(-0.64-z)/0.30 : 0.075-0.015*(-0.94-z)/1.01;
          for(let i=0;i<zs.length-1;i++) addLoft(out,...band(zs[i+1],width(zs[i+1])),...band(zs[i],width(zs[i])),color);
          return;
        }
        addLoft(out, ...mid, ...front, color); addLoft(out, ...rear, ...mid, color);
      },
      tVane(vane) {
        // Cover crown bounds every inner-span point; pay for foil thickness/camber
        // and the decal layer before raising the unchanged foil as one rigid shape.
        const skin = Math.max(coverSurfaceY(anchors.coverAt(vane.zLead), 0), coverSurfaceY(anchors.coverAt(vane.zTrail), 0));
        const lift = Math.max(0, skin + COVER_STACK.decal + 0.018 - vane.yLead);
        vane.yLead += lift; vane.yTrail += lift;
        return { foot: coverSurfaceY(anchors.coverAt(-1.98), 0) - 0.006, head: foilAt(vane, 0, 0.5).y };
      },
    };
  }

  const CONCEPT_POD_Z = [0.62, 0.50, 0.22, -0.10, -0.38, -0.62, -0.90, -1.15, -1.48];
  const CONCEPT_PODS = Object.freeze({
    rift: { span: [1,.98,1.15,1.08,.85,.72,.69,.75,.82], depth: [.012,.025,.09,.12,.13,.11,.07,.025,.012] },
    keel: { span: [.84,.86,.90,.92,.92,.94,.96,.98,.98] },
    delta: { span: [.98,1.05,1.20,1.15,.96,.82,.78,.79,.85], depth: [.012,.025,.045,.055,.07,.06,.04,.02,.012] },
    serpent: { span: [1,.98,1.18,1.04,.70,.66,.86,.88,.86], depth: [.012,.02,.04,.08,.11,.12,.07,.025,.012] },
    // Independent recipes: keep the shared reference-body profiles above intact.
    // Roof relief is a vertical depth below the pod top; Caldra's broad hollow and
    // Talven's narrow channel keep distinct sections, not merely different spans.
    caldra: { shape: "rift", span: [1.08,1.08,1.35,1.15,.70,.55,.55,.65,.80], depth: [.015,.035,.10,.14,.15,.12,.08,.03,.012], channel: [.35,.84,.062] },
    rovik: { shape: "keel", span: [1.10,1.12,1.15,1.10,1.06,1,1,.98,.95], roofDrop: .065 },
    senzo: { shape: "delta", span: [1.02,1.10,1.40,1.36,1.12,.88,.72,.66,.65], depth: [.012,.025,.04,.06,.075,.07,.04,.02,.012], roof: [.045,.06,.055,.02,-.035,-.08,-.10,-.065,0] },
    talven: { shape: "serpent", span: [.95,1,1.16,1.04,.66,.55,1.10,1.02,.80], depth: [.012,.025,.05,.10,.14,.14,.08,.03,.012], channel: [.38,.66,.105], roof: [0,0,0,0,0,.015,.02,.01,0] },
    orvex: { shape: "keel", span: [.66,.68,.72,.70,.64,.65,.70,.76,.85], roofDrop: .012 },
    nacrel: { shape: "rift", span: [1.20,1.30,1.30,1.25,1.15,1.10,1,.90,.90], depth: [.012,.015,.025,.035,.05,.045,.03,.02,.012], roofDrop: .105 },
  });
  // Shape only opt-in bodies, AFTER supplier downwash. Interpolate the original
  // station floors explicitly: the legacy clamp's tables have only seven Z keys.
  function conceptPodStations(stations, profile) {
    const recipe = CONCEPT_PODS[profile];
    const shape = recipe.shape || profile;
    const floors = Object.keys(POD_MIN_W).map(Number).sort((a, b) => b - a)
      .map((z) => ({ z, width: POD_MIN_W[String(z)], height: POD_MIN_H[String(z)] }));
    const shaped = CONCEPT_POD_Z.map((z, i) => {
      const p = sampleStations(stations, z), f = sampleStations(floors, z);
      p.outer = Math.min(0.88, p.inner + Math.max(f.width, (p.outer - p.inner) * recipe.span[i]));
      const roofDrop = recipe.roofDrop || (shape === "keel" ? 0.018 : shape === "delta" || shape === "serpent" ? 0.006 : 0);
      p.innerTop += (recipe.roof ? recipe.roof[i] : 0) - roofDrop;
      p.outerTop += (recipe.roof ? recipe.roof[i] : 0) - roofDrop;
      for (const edge of ["inner", "outer"]) {
        const b = edge + "Bottom", t = edge + "Top";
        p[t] = Math.min(POD_TOP_MAX, p[t]);
        p[b] = Math.max(0.13, Math.min(POD_TOP_MAX - f.height, p[b], p[t] - f.height));
        p[t] = Math.min(POD_TOP_MAX, Math.max(p[t], p[b] + f.height));
      }
      p.outerBottom = Math.max(p.outerBottom, p.innerBottom + POD_UNDERCUT_MIN);
      p.outerTop = Math.min(POD_TOP_MAX, Math.max(p.outerTop, p.outerBottom + f.height));
      return p;
    });
    if (shape === "serpent") {
      // Supplier taper can overwhelm a factor-only recovery. Pin a real outer
      // bulge behind the waist, then return continuously to the supplier tail.
      shaped[6].outer = Math.min(.88, Math.max(shaped[6].outer, shaped[5].outer + .025, shaped[8].outer + .025));
      shaped[7].outer = (shaped[6].outer + shaped[8].outer) * .5;
    }
    return shaped;
  }
  function conceptPodRing(p, profile, index) {
    const recipe = CONCEPT_PODS[profile];
    profile = recipe.shape || profile;
    const x = p.outer, w = x - p.inner, b = p.outerBottom, h = p.outerTop - b;
    if (profile === "keel") return [[p.inner,p.innerBottom], [x-w*.06,b], [x,b+h*.12],
      [x,b+h*.90], [x-w*.12,p.outerTop], [p.inner,p.innerTop]];
    const depth = Math.min(recipe.depth[index], w * 0.55);
    // The forward channel stays BELOW the original 32..88% sponsor landing.
    // Behind its rear edge it climbs, exposing a tall inset wall and silver lip.
    const aft = Math.max(0, Math.min(1, (-p.z - .34) / .45));
    const roof = .25 + aft * (profile === "serpent" ? .43 : .36);
    const ring = [[p.inner,p.innerBottom], [x-w*.06,b], [x,b+h*.045],
      [x-depth,b+h*.105], [x-depth,b+h*roof], [x,b+h*(roof+.035)],
      [x,b+h*.94], [x-w*(profile === "delta" ? .28 : .10),p.outerTop],
      [p.inner+w*.25,p.innerTop], [p.inner,p.innerTop]];
    if (profile === "rift") ring.splice(8,1);   // one continuous silver inner-roof facet
    if (recipe.channel) {
      const [lo,hi,d] = recipe.channel, fade = Math.sin(Math.PI * index / 8);
      const roofAt = (u) => p.innerTop + (p.outerTop - p.innerTop) * u;
      // Keep a finite shoulder at either side and a closed, recessed roof.
      const y = (u) => Math.max(p.innerBottom + .08, roofAt(u) - d * fade);
      ring.splice(8, ring.length - 9, [p.inner+w*(hi+.05),roofAt(hi+.05)],
        [p.inner+w*hi,y(hi)], [p.inner+w*lo,y(lo)], [p.inner+w*(lo-.05),roofAt(lo-.05)]);
    }
    return ring;
  }
  // Ear clipping, rather than a centre fan: the recessed ring is concave.
  function conceptPodCap(points) {
    const cross = (a,b,c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    const ids = points.map((_,i) => i), triangles = [];
    while (ids.length > 3) {
      let found = false;
      for (let j=0;j<ids.length;j++) {
        const a=ids[(j+ids.length-1)%ids.length], b=ids[j], c=ids[(j+1)%ids.length];
        if (cross(points[a],points[b],points[c]) <= 1e-12) continue;
        const inside = ids.some((k) => k!==a && k!==b && k!==c &&
          cross(points[a],points[b],points[k]) >= -1e-12 && cross(points[b],points[c],points[k]) >= -1e-12 &&
          cross(points[c],points[a],points[k]) >= -1e-12);
        if (inside) continue;
        triangles.push([a,b,c]); ids.splice(j,1); found=true; break;
      }
      if (!found) throw new Error("Invalid concept pod section");
    }
    triangles.push(ids.slice()); return triangles;
  }
  // Average along each longitudinal strip only. Separate cross-section edges
  // never share a group, even where their positions coincide at a hard lip.
  function smoothConceptPodStrips(out, strips) {
    const groups = new Map();
    for (const strip of strips) for (let v=strip.start;v<strip.end;v+=3) {
      const key=strip.edge+"|"+out.pos[v]+","+out.pos[v+1]+","+out.pos[v+2];
      let g=groups.get(key);
      if (!g) { g={sum:[0,0,0],vertices:[]}; groups.set(key,g); }
      for (let k=0;k<3;k++) g.sum[k]+=out.nrm[v+k];
      g.vertices.push(v);
    }
    for (const g of groups.values()) {
      const length=Math.hypot(...g.sum);
      if (length<1e-12) continue;
      for (const v of g.vertices) for (let k=0;k<3;k++) out.nrm[v+k]=g.sum[k]/length;
    }
  }
  function buildConceptPods(out, stations, profile, c1) {
    const shape = CONCEPT_PODS[profile].shape || profile;
    for (const side of [-1,1]) {
      const rings = stations.map((p,i) => conceptPodRing(p,profile,i));
      const strips = shadeFlags.round && (shape==="rift" || shape==="serpent") ? [] : null;
      const xyz = (p,z) => [side*p[0],p[1],z];
      const tri = (a,b,c,col,surface) => side > 0 ? addTri(out,a,b,c,col,surface) : addTri(out,a,c,b,col,surface);
      for (let r=0;r<rings.length-1;r++) for (let e=0;e<rings[r].length;e++) {
        const start=out.pos.length;
        const j=(e+1)%rings[r].length, A=rings[r], B=rings[r+1];
        const dark=shape!=="keel" && e>=1 && e<=4, col=dark?INTAKE:c1, sf=dark?SURFACES.carbon:SURFACES.paint;
        tri(xyz(A[e],stations[r].z),xyz(B[e],stations[r+1].z),xyz(B[j],stations[r+1].z),col,sf);
        tri(xyz(A[e],stations[r].z),xyz(B[j],stations[r+1].z),xyz(A[j],stations[r].z),col,sf);
        if (strips) strips.push({edge:e,start,end:out.pos.length});
      }
      if (strips) smoothConceptPodStrips(out,strips);
      for (const front of [true,false]) {
        const r=front?0:rings.length-1, ring=rings[r], caps=conceptPodCap(ring), z=stations[r].z;
        const area = (t) => { const [a,b,c]=t.map((i)=>ring[i]); return Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])); };
        const opening=front && shape==="delta" ? caps.reduce((best,t)=>area(t)>area(best)?t:best,caps[0]) : null;
        for (const t of caps) {
          const v=t.map((i)=>xyz(ring[i],z));
          if (t!==opening) { if (front) tri(v[0],v[1],v[2],c1,SURFACES.paint); else tri(v[0],v[2],v[1],c1,SURFACES.paint); continue; }
          const centre=v[0].map((_,k)=>(v[0][k]+v[1][k]+v[2][k])/3);
          const lip=v.map((p)=>p.map((n,k)=>centre[k]+(n-centre[k])*.82));
          const throat=lip.map((p)=>[centre[0]+(p[0]-centre[0])*.78,centre[1]+(p[1]-centre[1])*.78,z-.065]);
          for (let k=0;k<3;k++) {
            const j=(k+1)%3;
            tri(v[k],v[j],lip[j],c1,SURFACES.paint); tri(v[k],lip[j],lip[k],c1,SURFACES.paint);
            tri(lip[k],lip[j],throat[j],INTAKE,SURFACES.carbon); tri(lip[k],throat[j],throat[k],INTAKE,SURFACES.carbon);
          }
          tri(throat[0],throat[1],throat[2],INTAKE,SURFACES.carbon);
        }
      }
    }
  }

  const COVER_LIFT_TOP = 0.92;   // a concept coverLift ends under the hoop crown (0.946 at z -0.55)
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
    // coverLift (BODY_STYLES only): metres on the crown TOP for silhouette.
    // Clamped so a concept body cannot walk the cover through the roll-hoop
    // cap the way an unclamped spineHeight would; TEAM_STYLE leaves it 0.
    const lift = Math.max(-0.16, Math.min(0.22, style.coverLift || 0));
    // ...and the front crown, where the hoop blade stands (z -0.33..-0.63,
    // crown 0.968..0.938), stops at COVER_LIFT_TOP: anteater/arched/wedge's
    // +0.18..0.20 put it ~100 mm OVER the regulation hoop top on every factory
    // engine (#3111). Only a positive lift is capped, so TEAM_STYLE (lift 0)
    // and the sunken concept covers are unchanged; the tail keeps the full
    // lift, which is what reads as a rising or humped cover in side view.
    const crownBase = 0.52 + 0.08 * (coverHeight - 1) + 0.31 * coverHeight;
    const liftF = lift > 0 ? Math.min(lift, Math.max(0, COVER_LIFT_TOP - crownBase - rise)) : lift;   // a spine rise spends the budget first
    // Two stations only. A third (z -1.13) made coverAt non-linear and broke
    // car-shade: downwash gap vs cover.bottom, and cokeFoot xb<=x. coverCrown
    // pinches x and peaks the profile — it must NOT lift coverAt().top or
    // spineHeight "high"/"dorsal" walk through the roll-hoop cap (fin-design).
    // coverLift is the separate silhouette knob for concept bodies.
    // CarShade.coverLoft already walks COVER_Z through coverAt.
    let coverStations = [
      { z: -0.55, x: 0.28 * eng.tailWidth * (1 - crown * 0.6),
        bottom: 0.52 + 0.08 * (coverHeight - 1) - 0.31 * coverHeight,
        top: crownBase + rise + liftF, k: crown },
      { z: -2.00, x: 0.13 * eng.tailWidth,
        bottom: 0.42 - 0.17 * coverHeight,
        top: 0.42 + 0.17 * coverHeight + rise * SPINE_TAIL + lift * SPINE_TAIL + (style.coverTailLift || 0), k: crown * 0.45 },
    ];
    const sculpt = style.podSculpt;
    const coverKnots = [-0.55, -0.66, -0.90, -1.13, -1.28, -1.47, -1.70, -1.90, -2.00];
    // #3417: authored complete pods default to CONCEPT_SCULPT sparse station density (opt out with sparse:false).
    const sparseSculpt = !!(sculpt && sculpt.sparse !== false);
    const coverStops = !(sculpt && sculpt.complete) ? null : sparseSculpt ? coverKnots.filter((_, i) => i % 2 === 0)   // sparse: the shared default's triangle budget
      : coverKnots.flatMap((z, i) => i < coverKnots.length - 1 ? [z, (z + coverKnots[i + 1]) / 2] : [z]);
    if (coverStops) {
      const ends = coverStations;
      coverStations = coverStops.map(z => {
        const c = sampleStations(ends, z), t = Math.max(0, Math.min(1, (-0.55 - z) / 1.45));
        const arch = Math.sin(Math.PI * t), roof = (sculpt.coverArch || 0) * arch;
        return Object.assign({}, c, { x: c.x * (1 + (sculpt.coverBulge || 0) * arch),
          top: Math.max(c.bottom + 0.12, Math.min(COVER_LIFT_TOP, c.top + roof)) });
      });
    }
    let podStations = round ? CarShade.downwash(sidepodStations(eng, style), (z) => sampleStations(coverStations, z).bottom, eng.coke) : sidepodStations(eng, style);   // rounded: the downwash ramp
    const podProfile = CONCEPT_PODS[style.podProfile] ? style.podProfile : null;
    if (podProfile) podStations = conceptPodStations(podStations, podProfile);
    const podSample = (z) => {
      if (!sculpt || !round || z >= podStations[0].z || z <= podStations[podStations.length - 1].z) return sampleStations(podStations, z);
      for (let i = 0; i < podStations.length - 1; i++) {
        const a = podStations[i], b = podStations[i + 1];
        if (z > a.z || z < b.z) continue;
        const t = (a.z - z) / (a.z - b.z), s = t * t * (3 - 2 * t), p = { z };
        for (const key of Object.keys(a)) if (key !== "z") p[key] = a[key] + (b[key] - a[key]) * s;
        return p;
      }
      return sampleStations(podStations, z);
    };
    // Thirds depart from the linear chord; a smoothstep midpoint does not.
    const podStops = sculpt && round && !style.sculptSparse && !sparseSculpt ? podStations.flatMap((p, i) => i === 0 || i >= podStations.length - 2 ? [p]
      : [p, ...[1 / 3, 2 / 3].map(t => podSample(p.z + (podStations[i + 1].z - p.z) * t))]) : podStations;
    const noseStations = styledNoseStations(style).map((station) => ({
      z: station.z, side: station.w * 0.5, topSide: station.w * station.t * 0.5,
      bottom: station.y - station.h * 0.5, top: station.y + station.h * 0.5,
    }));
    return {
      key: [eng.podWidth, eng.shoulderHeight, eng.undercut, eng.coke,
            eng.tailWidth, eng.coverHeight, rise,
            style === DEFAULT_STYLE ? "" : (teamId || "")].join(",") + (round ? "|r" : ""),
      podAt(z) {
        const p = podSample(z);
        return { z, x: p.outer, inner: p.inner, bottom: p.outerBottom, top: p.outerTop,
                 innerBottom: p.innerBottom, innerTop: p.innerTop };
      },
      coverAt(z) {
        const c = sampleStations(coverStations, z);
        if (style.spineCurve) {
          const f = Math.max(0, Math.min(1, (-0.55 - z) / 1.45));
          c.top += style.spineCurve * Math.sin(Math.PI * f);
          c.curve = true;
        }
        const p = round ? CarShade.cokeFoot(c, coverStations, eng.coke) : c;   // rounded: the pinched foot, c.xb
        return sculpt ? Object.assign({}, p, { xb: c.x * 0.56, sculptShoulder: true, smoothSpine: !!sculpt.complete }) : p;
      },
      noseAt(z) { return sampleStations(noseStations, z); },
      noseStops: style.noseSculpt ? noseStations.map(p => p.z) : null,
      podProfile,
      curvedCover: !!style.spineCurve,
      podStations: podStations.map((p) => Object.freeze(Object.assign({}, p))),
      podStops, podSculpt: sculpt,
      coverStops,
      podRing(z, side) { return sculptPodRing(podSample(z), side, sculpt); },
      podRoof: sculpt ? (z, u) => sculptPodRoof(podSample(z), u, sculpt) : null,
      // Roof height under a roof part at x (half-width hw): the control top, or on a sculpted
      // roof its mid-slope there (neither sunk nor floating; B·H13 D4 buried 22-44 mm).
      podSeatY(z, x, hw) {
        if (!sculpt) return this.podAt(z).top;
        let lo = Infinity, hi = -Infinity, near = null;
        for (let u = 0; u <= 1.0001; u += 0.05) { const r = sculptPodRoof(podSample(z), u, sculpt);
          if (!near || Math.abs(r[0] - x) < Math.abs(near[0] - x)) near = r;
          if (Math.abs(r[0] - x) <= hw) { lo = Math.min(lo, r[1]); hi = Math.max(hi, r[1]); } }
        return hi > -Infinity ? (lo + hi) / 2 : near[1];
      },
      podFlank(z, fraction) {
        const p = podSample(z), y = p.outerBottom + (p.outerTop - p.outerBottom) * fraction;
        if (!sculpt) return [p.outer, y, z];
        const ring = sculptPodRing(p, 1, sculpt);
        for (let i = 1; i < 4; i++) if (y <= ring[i + 1][1]) {
          const a = ring[i], b = ring[i + 1], t = (y - a[1]) / (b[1] - a[1]);
          return [a[0] + (b[0] - a[0]) * t, y, z];
        }
        return ring[4];
      },
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

  // One continuous skin. The belly rolls into the shoulder rather than leaving
  // a vertical slab; podFlank drapes graphics over these same cross sections.
  // The roof from the inner edge (u 0) to the outer top (u 1): a channel dips it, a crown lifts it.
  function sculptPodRoof(p, u, sculpt) {
    const height = p.outerTop - p.outerBottom;
    const linear = p.innerTop + (p.outerTop - p.innerTop) * u;
    const depth = Math.min(Math.max(0, sculpt?.channel || 0), height * 0.42);
    return [p.inner + (p.outer - p.inner) * u, linear - depth * Math.pow(Math.sin(Math.PI * u), 2)
      + (sculpt?.crown || 0) * Math.sin(Math.PI * u)];
  }
  function sculptPodRing(p, side, sculpt) {
    const span = p.outer - p.inner, height = p.outerTop - p.outerBottom;
    const t = Math.max(0, Math.min(1, (0.50 - p.z) / 1.55));
    const waist = (sculpt?.waist || 0) * Math.pow(Math.sin(Math.PI * t), 2);
    const roof = (u) => { const r = sculptPodRoof(p, u, sculpt); return [side * r[0], r[1], p.z]; };
    const q = [[side * p.inner, p.innerBottom, p.z],
      [side * (p.outer - span * (sculpt?.belly || 0)), p.outerBottom, p.z],
      [side * (p.outer - span * (0.14 + waist)), p.outerBottom + height * 0.22, p.z],
      [side * p.outer, p.outerBottom + height * 0.65, p.z],
      [side * (p.outer - span * 0.06), p.outerTop, p.z],
      ...(sculpt && sculpt.sparse !== false ? [roof(0.5)] : [roof(0.75), roof(0.5), roof(0.25)]), roof(0)];
    return side < 0 ? q.reverse() : q;
  }

  function sculptPodLoft(out, data, color) {
    for (const side of [-1, 1]) {
      const rings = data.podStops.map(p => data.podRing(p.z, side));
      for (let r = 0; r < rings.length - 1; r++) for (let k = 0; k < rings[r].length; k++) {
        const j = (k + 1) % rings[r].length;
        const q = [rings[r][k], rings[r + 1][k], rings[r + 1][j], rings[r][j]];
        const flank = side > 0 ? 3 : 4;
        if (data.podSculpt.complete && k === flank && data.podStops[r].z <= -0.38 && data.podStops[r + 1].z >= -1.05)
          recessedPodExit(out, q, side, data.podSculpt.exitDepth, color);
        else addQuad(out, ...q, color);
      }
      for (const [boundary, front] of [[rings[0], true], [rings[rings.length - 1], false]]) {
        let ring = boundary;
        const centre = ring.reduce((m, p) => m.map((v, i) => v + p[i] / ring.length), [0, 0, 0]);
        if (front && (shadeFlags.round || data.podSculpt.complete)) {
          // Painted rolled rim around a separate recessed carbon duct, not a
          // black cap covering the entire front section of the sidepod.
          const mouth = data.podSculpt.mouth || 0.78, depth = data.podSculpt.ductDepth || 0.065;
          const lip = boundary.map(p => [centre[0] + (p[0] - centre[0]) * mouth,
            centre[1] + (p[1] - centre[1]) * mouth, p[2] + 0.006]);
          ring = lip.map(p => [centre[0] + (p[0] - centre[0]) * 0.88,
            centre[1] + (p[1] - centre[1]) * 0.88, p[2] - depth]);
          centre[2] -= depth - 0.006;
          for (let i = 0; i < ring.length; i++) {
            const j = (i + 1) % ring.length;
            addQuad(out, boundary[i], lip[i], lip[j], boundary[j], color);
            addQuad(out, lip[i], ring[i], ring[j], lip[j], INTAKE);
          }
        }
        for (let i = 0; i < ring.length; i++) {
          const j = (i + 1) % ring.length;
          if (front) addTri(out, centre, ring[i], ring[j], INTAKE);
          else addTri(out, centre, ring[j], ring[i], color);
        }
      }
    }
  }

  // Replace a shoulder face with an annulus, four recessed walls and a carbon
  // back. This is a cut into the emitted skin, not a dark panel laid on paint.
  function recessedPodExit(out, q, side, depth, color) {
    const c = q.reduce((a, p) => a.map((v, i) => v + p[i] / 4), [0, 0, 0]);
    const rim = q.map(p => p.map((v, i) => c[i] + (v - c[i]) * (i === 2 ? 0.76 : 0.54)));
    const back = rim.map(p => [p[0] - side * (depth || 0.05), p[1], p[2]]);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      addQuad(out, q[i], q[j], rim[j], rim[i], color);
      addQuad(out, rim[i], rim[j], back[j], back[i], INTAKE, SURFACES.carbon);
    }
    addQuad(out, ...back, DARK, SURFACES.carbon);
  }

  // A single closed shell in both LODs; all rings are also decal/detail anchors.
  function completeCoverLoft(out, anchors, color) {
    const rings = anchors.coverStops.map(z => {
      const p = coverProfile(anchors.coverAt(z), shadeFlags.round && shadeFlags.coverHi).pts;
      return p.map(([x, y]) => [x, y, z]).concat(p.slice().reverse().map(([x, y]) => [-x, y, z]));
    });
    for (let r = 0; r < rings.length - 1; r++) for (let k = 0; k < rings[r].length; k++) {
      const j = (k + 1) % rings[r].length;
      addQuad(out, rings[r][k], rings[r + 1][k], rings[r + 1][j], rings[r][j], color);
    }
    for (const [ring, front] of [[rings[0], true], [rings[rings.length - 1], false]]) {
      const c = ring.reduce((a, p) => a.map((v, i) => v + p[i] / ring.length), [0, 0, 0]);
      for (let k = 0; k < ring.length; k++) {
        const j = (k + 1) % ring.length;
        if (front) addTri(out, c, ring[k], ring[j], color); else addTri(out, c, ring[j], ring[k], color);
      }
    }
  }

  function buildSidepodBodywork(out, c1, eng, anchors, facet) {   // facet (B·D1d Delta): flat-panel pods inside a rounded build
    const data = anchors || bodyAnchors({ engine: 1, _visual: { engine: eng } });
    const stations = data.podStations;
    const chined = !data.podSculpt && stations.some((p) => p.chine != null);   // one point count for every station
    if (data.podSculpt) sculptPodLoft(out, data, c1);
    else if (data.podProfile) buildConceptPods(out, stations, data.podProfile, c1);
    else if (shadeFlags.round && !facet) CarShade.podLoft(out, stations, c1, INTAKE, addTri);
    else for (const side of [-1, 1]) {
      addStationLoft(out, stations.map((p) => sidepodStation(side, p.z, p.inner, p.outer,   // chined: five-corner sections
        p.innerBottom, p.outerBottom, p.innerTop, p.outerTop, chined ? (p.chine || 0) : null)), c1, INTAKE);
    }
    // The chine's crease line: a dark seam 2 mm proud ON the crease (the ring's own corner, so it
    // sits on the built skin), so the crease reads on a pale body where the two faces both blow out.
    if (chined) for (const side of [-1, 1]) for (let i = 0; i < stations.length - 1; i++) {
      const seam = (p) => { const c = chineCut(p.chine || 0, p.outer - p.inner, p.outerTop - p.outerBottom);
        return { z: p.z, x: side * (p.outer - c.x), y: p.outerTop + 0.003, w: 0.018, h: 0.010 }; };
      if ((stations[i].chine || 0) > 0.008) addSpan(out, seam(stations[i]), seam(stations[i + 1]), INTAKE, null, SURFACES.carbon);
    }
    const inletP = data.podAt(0.62);
    const shoulderP = data.podAt(0.18);
    const flankP = data.podAt(-0.10);
    const floorP = data.podAt(0.0);
    const conduitP = data.podAt(-0.65);
    const tailP = data.podAt(-1.48);
    const profile = CONCEPT_PODS[data.podProfile];
    return {
      conceptInlet: !!profile && (profile.shape || data.podProfile) === "delta",
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
    const rear = { z: anchors.curvedCover ? -1.96 : -2.00, y: 0.42 + rise * SPINE_TAIL / 2, w: 0.26 * eng.tailWidth,
                   h: 0.34 * coverHeight + rise * SPINE_TAIL, t: 0.70 };
    // The loft is three stacked blocks over coverProfile — flank, lower facet,
    // upper facet + crown — at the two anchor stations (the same numbers as
    // `front`/`rear` above, which other parts still read for their datums).
    // Flat path always uses the four KEYS (3 stacked blocks). Rounded garage/
    // near densifies the CROSS-SECTION only — COVER_Z stays shared with the
    // flank-decal drape (car-mesh) so mid rings never leave the band floating.
    const pf = coverProfile(anchors.coverAt(front.z)), pr = coverProfile(anchors.coverAt(rear.z));
    const loftKeys = (c) => { const p = coverProfile(c); return { pts: p.keys || p.pts }; };
    const skinFrom = out.pos.length / 3;
    if (anchors.coverStops) completeCoverLoft(out, anchors, c1);
    else if (anchors.curvedCover) {
      // Shared flat/rounded skin: nine longitudinal rings, capped only at the
      // ends. The roof and every decal/detail sample the same coverAt/profile.
      const rings = Array.from({ length: 9 }, (_, i) => {
        const z = front.z + (rear.z - front.z) * i / 8;
        const p = coverProfile(anchors.coverAt(z)).pts;
        return p.map(([x, y]) => [x, y, z]).concat(p.slice().reverse().map(([x, y]) => [-x, y, z]));
      });
      closedSkin(out, rings, c1);
    } else if (shadeFlags.round) {
      CarShade.coverLoft(out, anchors, shadeFlags.coverHi ? ((c) => coverProfile(c, true)) : loftKeys,
        front.z, rear.z, c1, addTri);
    } else for (let k = 0; k < 3; k++) {
      const ring = (p, z) => {
        const q = p.keys || p.pts;
        return [[-q[k][0], q[k][1], z], [q[k][0], q[k][1], z],
                [q[k + 1][0], q[k + 1][1], z], [-q[k + 1][0], q[k + 1][1], z]];
      };
      addBlock(out, ring(pf, front.z).concat(ring(pr, rear.z)), c1, c1);
    }
    const skin = { from: skinFrom, to: out.pos.length / 3 };
    // The accent pinstripe runs the flank just under the crease, across the
    // SPINE SIDE band — which is the WHOLE flank, z -0.66..-1.90 — so with a
    // mark on it the trim starts aft of the MARK instead: a real number
    // interrupts the trim. -1.26 is "aft of the mark" only while the mark is at
    // f 0.19, so a crown that moved the design hands its own station in trimAft
    // (see build). COVER_STACK.flankTrim keeps the trim out of the decal PLANE.
    const stripeFront = anchors.coverAt(trimAft || (sideMark ? -1.26 : -0.825)), stripeRear = anchors.coverAt(-1.675);
    // The pinstripe runs the flank just under the shoulder crease, ON the skin.
    const sfY = coverProfile(stripeFront).shoulder - 0.03, srY = coverProfile(stripeRear).shoulder - 0.025;
    const stripeStops = [stripeFront.z, ...(anchors.coverStops || []).filter(z => z < stripeFront.z && z > stripeRear.z), stripeRear.z];
    for (let i = 0; i < stripeStops.length - 1; i++) for (const side of [-1, 1]) {
      const a = anchors.coverAt(stripeStops[i]), b = anchors.coverAt(stripeStops[i + 1]);
      const yAt = c => anchors.coverStops ? coverProfile(c).shoulder - (0.03 - 0.005 * (stripeFront.z - c.z) / (stripeFront.z - stripeRear.z)) : (c.z === stripeFront.z ? sfY : srY);
      const ay = yAt(a), by = yAt(b);
      addSpan(out,
        { z: a.z, x: side * (coverFlankX(a, ay) + COVER_STACK.flankTrim - 0.005), y: ay,
          w: 0.010, h: 0.012 },
        { z: b.z, x: side * (coverFlankX(b, by) + COVER_STACK.flankTrim - 0.005), y: by,
          w: 0.010, h: 0.012 }, accentC);
    }
    const mid = anchors.coverAt(-1.30);
    return {
      front, rear, skin,
      coolingX: Math.max(0.08, mid.x * 0.78),
      coolingY: mid.top - 0.12,
      tailVentY: rear.y + rear.h * 0.20,
    };
  }

    return {
      styledNoseStations, noseFlankX, bodySpan, haloHoopPath,
      endplateGeom, wingOf, wingFoilOf, frontCascade, frontBakedCount, frontHalf, frontPlateGeom,
      aeroFlapsGeom, solveFlapsGeom, buildFlapGeom, aeroFlapAim, wingBandGeom, numberBoard, shapeLift, rearMainOf,
      FIN_SHAPES, FIN_SHAPE_IDS, FIN, sharkFinRoot, sharkFinPanel, sharkFinBadge, finOf, finTop,
      COVER_VENT_IDS, SPINE_HEIGHT_IDS, spineRise, COVER_STACK,
      coverProfile, coverFlankX, coverSurfaceY,
      mirrorLightAnchors, cockpitMirrorGlass,
      buildPartRecipes, aeroLevelOf, aeroStyleOf,
      buildSharedChassis, bodyAnchors, fitBodyDetails, addInletMouth,
      buildSidepodBodywork, buildEngineCoverBodywork, addNoseSDuct, CAR_HALF, COVER_CROWN,
    };
  }
  return { create, chineCut };
})();
Object.freeze(CarBodyGeom);
