"use strict";
// PARENT LOCKSTEP: script before js/car/car3d.js
/* Apex 26 — Car3D active-aero solver (endplate, cascade, hinge search).
   Extracted from Car3D. Mesh emission (buildFlapGeom / addWingFoil) stays in
   js/car/car3d.js. FOIL_CAMBER / foilThick MOVE here — Car3D.addWingFoil reads
   them off this global. Must load BEFORE js/car/car3d.js. */
const Car3DFlaps = (function () {
  // Half-thickness distribution, normalised to peak at 1. t^0.5 gives the
  // square-root nose growth that reads ROUND at four stations; (1-t)^1.1 runs
  // out to a genuinely sharp trailing edge. Thickness reaching zero at both ends
  // is also what closes the section without needing cap geometry.
  const FOIL_PEAK = Math.pow(0.5 / 1.6, 0.5) * Math.pow(1 - 0.5 / 1.6, 1.1);
  const foilThick = (t) => Math.pow(t, 0.5) * Math.pow(1 - t, 1.1) / FOIL_PEAK;
  // Camber as a fraction of chord. F1 wings are INVERTED, so the mean line bows
  // DOWN off the chord line and the suction side is the underside.
  const FOIL_CAMBER = 0.05;

  // Rear-wing endplate geometry as a function of downforce level (0..4). SINGLE
  // SOURCE OF TRUTH — Car3D.build AND the driver-number decal in game.js
  // (via Car3D.endplate / Car3D.numberBoard) both read this, so the endplate
  // number tracks the plate at every downforce setting instead of a fixed height
  // that only fits one wing. Concave (pow 0.7) growth: rises fast at low DF then
  // flattens so max-DF doesn't tower. cy = vertical centre, sy = full height.
  function endplateGeom(aLvl) {
    const aN = (aLvl || 0) / 4;
    const cy = 0.60 + 0.20 * Math.pow(aN, 0.7);
    const sy = 0.28 + 0.30 * Math.pow(aN, 0.7);
    const profile = (z, sectionCy, sectionSy) => ({
      z, cy: sectionCy, sy: sectionSy,
      bottom: sectionCy - sectionSy * 0.5,
      top: sectionCy + sectionSy * 0.5,
    });
    return {
      cy, sy, chord: 0.54,
      front: profile(-2.15, cy - 0.035, sy * 0.76),
      rear: profile(-2.69, cy + 0.015, sy),
    };
  }
  // ACTIVE AERO — the wing's OWN top elements, made moveable.
  //
  // These are NOT extra parts laid over the wing (the first cut of this was, and
  // it looked exactly like what it was: a bolt-on). The top FW_MOVEABLE flaps of
  // the front cascade and the top plane of the rear wing are LEFT OUT of the
  // baked car mesh entirely and drawn instead as separate meshes that rotate —
  // so the car at rest is geometrically identical to before, and X-mode rotates
  // the real elements flat.
  //
  // Each spec is canonical: hinge at the ORIGIN with the chord running back
  // along -z at zero incidence. `zAngle` is the element's own natural incidence
  // (so drawing at zAngle reproduces the baked pose exactly) and `xAngle` is 0 —
  // "open" means aligned with the airflow, not merely less steep.
  const FW_MOVEABLE = 2;
  const AERO_STYLE_DEF = { frontSweep: 0.04, frontTaper: 0.98, frontRise: 0.04,
                           rearSweep: 0.03, rearTaper: 0.98 };
  // The front cascade table — the SINGLE definition, consumed both by the build
  // (for the elements it still bakes) and by aeroFlapsGeom (for the ones it
  // does not). [zLead, yLead, zTrail, yTrail, chordWMul, thick].
  // NB aLvl is NOT an integer — several catalog options use fractional levels
  // (1.15, 3.25, 3.6 …) and the wing build compares them raw. Truncating here
  // silently gave those options a different endplate height and half-span than
  // the mesh they were merged into.
  function frontCascade(aLvl) {
    const a = aLvl;
    const els = [
      [2.72, 0.048, 2.40, 0.086, 1.00, 0.024],   // main plane (structure, never moves)
      [2.50, 0.092, 2.24, 0.146, 0.98, 0.020],   // flap 1
    ];
    if (a >= 1) els.push([2.34, 0.148, 2.10, 0.212, 0.95, 0.018]);   // flap 2
    // Flaps 3 and 4 sit 10 mm and 30 mm lower than they first shipped. The stack
    // was drawn climbing into the nose overhang: at maximum downforce the top
    // element passed ~21 mm THROUGH the nose underside, which no rotation can
    // undo because the intersection is at the element's own rest attitude. The
    // drop is the largest the slot gaps above them will take (flap 3 keeps 11 mm
    // of daylight to flap 2, which is a slot, not a coincidence).
    if (a >= 3) els.push([2.20, 0.200, 1.98, 0.272, 0.92, 0.016]);   // flap 3
    if (a >= 4) els.push([2.08, 0.256, 1.88, 0.328, 0.88, 0.014]);   // flap 4
    return els;
  }
  // How many of them the mesh still bakes. Never the main plane.
  function frontBakedCount(aLvl) {
    const n = frontCascade(aLvl).length;
    return n - Math.min(FW_MOVEABLE, n - 1);
  }
  function frontHalf(aLvl) {
    // Same comparisons the build uses, on the RAW level: `aLvl === 1` is false
    // for 1.15, which is exactly the distinction a truncation destroys.
    return 0.92 * (aLvl <= 0 ? 0.74 : (aLvl === 1 ? 0.88 : 1.0));
  }
  // Extra incidence the CLOSED (Z-mode) pose takes on top of the element's own
  // baked angle. Without it the travel is only the element's natural 12-16 deg,
  // which is accurate but barely reads; with it a downforce wing is visibly
  // steeper AND has real angle to give back when it opens.
  //
  // Per wing, because the two do not do the same job. A 2026 rear wing runs
  // 30-40 deg of flap in its downforce setting and gives essentially all of it
  // back in X-mode — that is where the lap time is. The front wing only trims
  // enough to keep the balance, and is boxed in by the nose above it besides.
  //
  // The front is ZERO, and that is a fix rather than a shrug. A front cascade is
  // designed to nest: each element's trailing edge passes ~12 mm under the
  // leading edge of the one above it. Adding bite rotates every element steeper
  // about a hinge near its nose, which swings that trailing edge UP — straight
  // through its neighbour. Measured at maximum downforce, the shipped 0.20
  // buried flap 2's trailing edge 15 mm inside flap 3. The cascade's own drawn
  // attitude already IS the downforce pose; the front's travel comes from
  // flattening it, not from over-rotating it first.
  const Z_BITE = { front: 0, rear: 0.34 };
  // Where each element pivots, as a fraction of its own chord: 0 = leading edge,
  // 1 = trailing edge.
  //
  // This is the thing that makes an opening wing read as opening. Rotating about
  // the LEADING edge (which is what this did) changes incidence but leaves the
  // hinge line — the point nearest the element ahead — exactly where it was, so
  // the SLOT never opens and the whole gesture reads as a plank tilting. A real
  // DRS/X-mode flap pivots near its TRAILING edge: the leading edge swings up and
  // away from the element in front of it and daylight appears through the wing,
  // which is both the mechanism and the visual.
  //
  // The rear goes almost fully trailing-edge-pivoted, as the real actuator does.
  // The front stays near its LEADING edge, which is both what the real hardware
  // does (a front flap pivots on the slot-gap brackets at its nose, not on an
  // endplate actuator) and what the packaging allows: the cascade elements are
  // stacked ~12 mm apart and live under the nose overhang, so a leading edge
  // that swings has nowhere to swing to — it clashes with the element in front
  // of it going one way and the bodywork going the other. The front's opening
  // therefore reads mostly as the trailing edge dropping, which is correct.
  const HINGE = { front: 0.80, rear: 0.86 };
  // How much of its own incidence each wing gives up in X-mode. The rear goes to
  // flat, which is what a 2026 rear wing does and where the straight-line gain
  // comes from. The front only TRIMS: a front wing that flattened would both
  // throw the balance to the rear and, at maximum downforce, have to swing its
  // top flap up through the nose overhang to get there. Trimming is the real
  // behaviour and it is also the one that fits in the space available.
  const OPEN_FRAC = { front: 1, rear: 1 };
  // Underside of the NOSE where it overhangs the front wing, as (z, y) samples
  // measured off the built body. This is a hard ceiling: at max downforce the
  // baked top flap already passes within ~12 mm of it, so an unconditional bite
  // swings that element straight through the nose. Outside this z band nothing
  // overhangs the wing, hence the Infinity guards.
  const NOSE_UNDER = [[1.96, Infinity], [2.00, 0.294], [2.10, 0.414], [2.16, Infinity]];
  const NOSE_GAP = 0.005;        // m of daylight to keep under it
  function noseUnderAt(z) {
    if (z <= NOSE_UNDER[0][0] || z >= NOSE_UNDER[NOSE_UNDER.length - 1][0]) return Infinity;
    for (let i = 1; i < NOSE_UNDER.length; i++) {
      const [z1, y1] = NOSE_UNDER[i], [z0, y0] = NOSE_UNDER[i - 1];
      if (z <= z1) {
        // An Infinity endpoint means "nothing overhangs the wing out here", so a
        // slice touching one is UNCONSTRAINED — not pinned to whatever its finite
        // neighbour happened to measure. Pinning it (which is what this did)
        // invents a 0.294 m ceiling across z 1.96-2.00, and that phantom ceiling
        // is low enough that the top cascade flap at maximum downforce has no
        // valid attitude at all: every pose the solver tries "fails", so it falls
        // back to an unclamped one and the flap ends up drawn through the nose.
        if (!isFinite(y0) || !isFinite(y1)) return Infinity;
        return y0 + (y1 - y0) * (z - z0) / (z1 - z0);
      }
    }
    return Infinity;
  }
  // A hinged wing element. The mesh is emitted by the SAME addWingFoil call
  // the baked wing used, merely translated so the PIVOT is at the origin — so
  // the angles here are DELTAS from the element's own baked
  // incidence, not absolute attitudes. That matters: at delta 0 the element is
  // byte-for-byte the one the mesh used to contain. Building it flat and
  // rotating instead (the first attempt) displaced every vertex by up to 172 mm,
  // because addWingFoil's rise/sweep/thickness terms are applied in the CAR
  // frame and a whole-element rotation drags them off-axis with it.
  //
  // zAngle is the extra bite the closed pose takes on, CLAMPED per element to
  // that element's own headroom under the nose, so a closed wing is as steep as
  // it can be without any part of it entering the bodywork. xAngle is -natural:
  // rotating back by exactly the baked incidence lands the element FLAT.
  // A point on a wing element's section at chordwise t and pose delta d, in
  // car-local (z, y). `e` is the compact record below, shared by baked and
  // moveable elements so the clearance maths does not care which is which.
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
  // Upper surface height of element `e` at car-local z when posed at delta `d`,
  // or null if it does not reach that far along the car.
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
  const SLOT_MIN = 0.003;   // m of daylight to keep in a cascade slot
  function hinged(id, wing, zLead, yLead, zTrail, yTrail, planform, prev) {
    const dz = zLead - zTrail, dy = yTrail - yLead;
    const chord = Math.sqrt(dz * dz + dy * dy);
    const natural = Math.atan2(dy, dz);
    const thick = planform ? planform.thick : 0;
    const want = planform && planform.hinge != null ? planform.hinge : HINGE[wing];
    // The hinge is SEARCHED, not asserted. A pivot far back gives the most
    // leading-edge swing — the thing that actually opens a slot — but it also
    // drags the element's whole rear half up toward the nose when it flattens,
    // and on the top cascade flap at maximum downforce the pivot itself ends up
    // above the nose underside, so NO angle clears. Walking the pivot forward
    // trades swing for headroom. Trying the candidates and keeping whichever
    // yields the most usable travel beats picking one number and discovering per
    // downforce level which elements it happens to lock solid.
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

    // Solve the two end poses for a candidate pivot, or null if either end
    // cannot be placed without entering the nose or the element below.
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
      // An element with a placeable closed pose but no placeable open one is
      // PARKED, not forced open: it holds its downforce attitude. Better one
      // flap that does not move than one drawn through the bodywork, and the
      // packaging that causes it is real — the top cascade flap at maximum
      // downforce genuinely has the nose 20 mm above it.
      return { bite, open: open == null ? bite : open, pz: qz, py: qy };
    }
  }
  // SOLVED ONCE PER (level, recipe), NEVER PER FRAME.
  //
  // aeroFlapsGeom is not a table lookup — hinged() SEARCHES for each element's
  // pivot: up to 9 candidate hinges, each solving two end poses, each backing
  // off in up to 121 steps, each step sampling 41 points against the nose
  // underside and the element below. That is per element, and a wing has five
  // to eight of them.
  //
  // drawAeroFlaps (js/game.js) calls this for EVERY CAR, EVERY FRAME, because a
  // rival's wings opening is the point of the feature. At one car — a time
  // trial — the solver is merely expensive. At twenty-two it is the frame, and
  // that is exactly how it presented: time trial fine, a race slow enough that
  // the resolution governor bottomed out and started shedding features, which
  // read as a broken renderer rather than a slow one.
  //
  // Nothing in the result depends on the car or on the blend: the records carry
  // both end poses (zAngle/xAngle) and drawAeroFlaps interpolates between them
  // at draw time. So the whole search is a pure function of (aLvl, recipe), and
  // memoising it is not an optimisation so much as fixing a category error.
  // Bounded by five levels times the handful of aero recipes in the catalog.
  //
  // Callers MUST treat the records as immutable — they are shared now.
  const _flapSpecs = new Map();
  // The six-field signature depends ONLY on the recipe object, and callers hand
  // the same memoised recipe every frame (game.js's teamDecalState caches it), so
  // resolve it once per object rather than rebuilding an array, a map closure and
  // a join on every lookup. aeroFlapsGeom is called per car per frame by
  // drawAeroFlaps, so that key build was pure churn.
  const _flapSig = new WeakMap();
  function flapSig(st0) {
    let sig = _flapSig.get(st0);
    if (sig === undefined) {
      // The same six fields the flap MESH cache keys on — the only ones the
      // planform and the rear slot height read.
      sig = [st0.frontSweep, st0.frontTaper, st0.frontRise,
             st0.rearSweep, st0.rearTaper, st0.drs || 0]
        .map((v) => +v || 0).join(",");
      _flapSig.set(st0, sig);
    }
    return sig;
  }
  function aeroFlapsGeom(aLvl, style) {
    const st0 = (style && typeof style === "object") ? style : AERO_STYLE_DEF;
    // RAW aLvl, not (aLvl | 0). Several catalog options use FRACTIONAL levels
    // (see frontCascade) and solveFlapsGeom below reads the exact value, so
    // truncating here made 2.2 and 2.8 share one cache slot: whichever solved
    // first served both, and the other option silently wore the wrong flaps.
    const key = aLvl + "|" + flapSig(st0);
    let hit = _flapSpecs.get(key);
    if (!hit) {
      hit = solveFlapsGeom(aLvl, st0);
      // Stamp each element with its resolved identity. js/game/carmesh.js keys its
      // GPU mesh cache on exactly (level, recipe, element index) and used to
      // recompute that signature itself, per flap per car per frame — four more
      // array-map-join builds on top of this one. Now it just reads the stamp.
      for (let i = 0; i < hit.length; i++) hit[i].cacheKey = key + "|" + i;
      _flapSpecs.set(key, hit);
    }
    return hit;
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
      out.push(hinged("front" + i, "front", e[0], e[1], e[2], e[3], {
        half: fwHalf * e[4], thick: e[5], taper: frontTaper,
        sweep: frontSweep * (0.75 + i * 0.10),
        rise: frontRise * (0.65 + i * 0.12),
        attachHalf: fwHalf + 0.03,
        // The bold outboard upsweep hangs off the TOP element's trailing edge.
        // That element is always one of the moveable ones, so the kick has to
        // travel WITH it — anchoring it to the top still-baked element instead
        // (an earlier attempt) silently moved it 172 mm on the car at rest.
        upsweep: i === els.length - 1 ? { fwHalf, e } : null,
      }, prev));
    }
    // Rear: the 2026 rule is that every element EXCEPT the bottom mainplane
    // rotates, so on a three-plane wing the top two move and the mainplane is
    // structure. Below aLvl 2 the wing only has two planes, so only the top one
    // moves — still "all but the mainplane".
    // The slot height depends on `drs` as well as the level — the build reserves
    // it with (aLvl >= 4 || aDrs), so dropping drs here would leave the plane
    // floating 75 mm off its own slot on every DRS-option car.
    const ep = endplateGeom(a), crownY = ep.rear.top - 0.018;
    const upperTrailY = crownY - ((a >= 4 || (st.drs || 0)) ? 0.075 : 0);
    // Chained the same way the front cascade is, and for the same reason: rear
    // planes are stacked in slots too, and nothing was checking them. With the
    // elements now sweeping 35 deg instead of a flat sheet tilting, an unchecked
    // stack is one that quietly passes through itself at some blend nobody looked
    // at. The mainplane below is structure, so it enters the chain at zero.
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
    // The proud max-downforce top plane. It used to be BAKED, which put the
    // topmost element of the tallest wing on the grid among the parts that do
    // not move — directly contradicting the rule the rest of this function
    // implements, and leaving the one plane a following car actually sees frozen
    // while the two beneath it swept. It is an element like any other.
    if (a >= 4 && !(st.drs || 0)) {
      addRear("rearTop", [-2.42, crownY - 0.055], [-2.66, crownY], 0.022, 1.1);
    }
    return out;
  }

  // Mid-chord of a wing's moveable section, car-local metres — what the GARAGE
  // wing views aim at. For the multi-element front it is the group midpoint.
  // Off the LEADING/TRAILING edges, not off the pivot: the pivot sits at a
  // different fraction of the chord per wing, so aiming at it would frame the
  // rear wing off its own trailing edge.
  function aeroFlapAim(aLvl, wing, style) {
    const els = aeroFlapsGeom(aLvl, style).filter((e) => e.wing === wing);
    let y = 0, z = 0;
    for (const e of els) {
      y += (e.le[1] + e.te[1]) * 0.5;
      z += (e.le[0] + e.te[0]) * 0.5;
    }
    return [0, y / els.length, z / els.length];
  }
  // The driver-number board on the endplate: a fixed-height board anchored LOW,
  // its bottom a small gap above the plate base. The plate base barely moves with
  // DF (~0.46 → 0.51) while the top shoots up, so a low anchor reads grounded on
  // the short low-DF plate and low-on-a-tall-plate for max DF — never floating.
  function numberBoard(aLvl) {
    const ep = endplateGeom(aLvl), h = 0.20;
    return { cy: ep.cy - ep.sy * 0.5 + 0.05 + h * 0.5, h };
  }

  return {
    FOIL_CAMBER, foilThick,
    endplateGeom, frontCascade, frontBakedCount, frontHalf,
    aeroFlapsGeom, aeroFlapAim, numberBoard,
  };
})();
