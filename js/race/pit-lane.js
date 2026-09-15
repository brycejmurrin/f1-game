/* Apex 26 — PIT LANE: the other half of the sentence js/physics/tyre-model.js
 * opened. Wear makes the compound choice mean something; this is what lets a
 * driver do anything about it.
 *
 * IT IS A REAL LANE YOU DRIVE, NOT A SCRIPTED CUTAWAY, and that is the whole
 * design decision. Pit loss in the real sport runs 18-30 s and varies by
 * circuit — Spa 18.4 s because its lane bypasses La Source, Imola 28.1 s — and
 * that variation is what decides one stop against two
 * (docs/research/TYRE-STRATEGY-DESIGN.md §2.6, §2.8). A hardcoded penalty
 * cannot express it. Here the loss FALLS OUT of the geometry: lane length
 * divided by the speed limit, against racing the same stretch, plus the time
 * stood still. Change the lane and the strategy changes with it.
 *
 * THE LANE IS A STATE, NOT A PLACE — and that was decided by measurement, not
 * by preference. docs/research/TYRE-STRATEGY-DESIGN.md §5.2 proposed a real
 * driveable lane out beyond the road edge, with the abstract version as the
 * fallback "if a prototype measures badly". It was built, driven, and it
 * measured badly, twice:
 *
 *  1. FORCING the pit-side boundary open so a lane always existed put that
 *     boundary through the scenery. At Monaco the barriers hug the road, and a
 *     car running wide had its lap distance jump 250 m as the projection
 *     snapped to the neighbouring leg (physics-fixes.spec.js caught it). A
 *     half-plane `inLane` test also made a car beached far off the road read as
 *     "in the pit lane", which broke the beached-car auto-rescue.
 *  2. FITTING the lane to the room that already exists gives no lane anywhere.
 *     Measured at Monza, the narrowest pit-side clearance across the window is
 *     2.4 m — because the scenery places a PIT WALL there, which is exactly
 *     what a real circuit has. A real pit lane sits on the FAR side of that
 *     wall and is reached by its own entry road, and a track that is one ribbon
 *     with one arc coordinate cannot express "go around the wall".
 *
 * So the lane is longitudinal only: inside the window, a car that has CALLED a
 * stop is speed-limited, and at the box it is held. Pit loss is still emergent
 * and still per-circuit — window length over the limit, plus the stop — which
 * is the property that made the driveable lane attractive in the first place
 * (real pit loss runs 18-30 s and that spread is what decides one stop against
 * two). What is lost is the picture: no lateral lane, no garages, no crew.
 *
 * It also means this module changes NO geometry and reads none: `hw`, both
 * boundaries and the road mesh are untouched, so nothing downstream can break
 * the way (1) did.
 *
 * THE GAP THAT WAS HERE IS CLOSED. It read: a car held in the box sits on the
 * racing surface, so the field has to go around it — and pulling it off-line
 * needs somewhere to be pulled to, which is the geometry we do not have.
 * PAINTING the lane gave us somewhere: a 2.4-3.2 m strip of real tarmac on the
 * pit side, inside the road, with a line a driver can see. So the stop happens
 * IN it (laneX, and the box's lateral condition below). The ribbon is still one
 * ribbon and no boundary moved — what changed is that the strip now means
 * something to the cars as well as to the eye.
 *
 * WHAT IS STILL MISSING, stated rather than quietly dropped: garages, a crew,
 * and a lane BEHIND the pit wall. Those need a road that branches, which is the
 * thing this engine cannot express — so they are not a to-do, they are a
 * different track engine.
 */
const PitLane = (function () {
  "use strict";

  const clamp = M4.clamp;

  // Lane geometry, in METRES along the lap rather than as a fraction of it.
  // A fraction would make Spa's lane (7 km lap) twice Monaco's, which is
  // backwards — a pit lane is a building, not a share of a circuit. Measured
  // from the start/finish line, which is where every circuit's pit straight is
  // (racing coordinates put the line at s = 0; see TrackSpace).
  const ENTRY_M = 320;     // where the lane opens, before the line
  const EXIT_M = 130;      // ...and closes, after it
  const BOX_M = 40;        // the stop, this far before the line

  // The speed limit, as a fraction of the speed ENVELOPE rather than a literal
  // m/s. 80 km/h against a 259 km/h car is the real ratio (FIA 2025 Sporting
  // Regs Art. 34.7, carried into 2026 as B1.6.3a), and expressing it this way is
  // what makes it a vStd() threshold: at any OVERALL SPEED setting the limiter
  // sits at the same place on the dial, so the pit loss a player measures does
  // not move when they change the pace slider.
  const LIMIT_FRAC = 22.2 / 72;      // 80 km/h of a 259 km/h envelope
  const LIMIT_FRAC_STREET = 16.7 / 72;   // 60 km/h — Monaco, Singapore, Melbourne, Zandvoort

  // How long the car is held in the box. Real stationary time is 2.0-2.5 s
  // (record 1.80 s); this is deterministic on purpose — a random stop time
  // would make a strategy call a coin flip and would break replay determinism,
  // which js/race/reliability.js is equally careful about.
  const BOX_S = 2.4;

  // How slow the car has to be at the box for the stop to count. A fraction of
  // the speed envelope, so it rides OVERALL SPEED like the limiter does.
  const BOX_SPEED_FRAC = 0.06;
  // A BOX IS A LENGTH OF PIT LANE, NOT A POINT. Without this the latch is a
  // knife edge on `at >= boxAt`: a driver braking onto the mark stops a few
  // centimetres short, the test never fires, and the car sits stationary in the
  // pits forever with the stop un-served. Measured exactly that way before the
  // tolerance existed. Real boxes are about this long, so it is also the right
  // number rather than merely a safe one.
  const BOX_TOL = 8;
  // How hard a car brakes for its own box, m/s^2. Only the AI reads this: for a
  // human, stopping on the mark is the skill, and a game that braked for you
  // would be running the one part of a pit stop the driver actually does.
  const BOX_BRAKE = 6;

  // ── COMMITTING TO THE STOP, WITHOUT A BUTTON ──────────────────────────────
  // THERE IS NO PIT CONTROL. You call a stop the way a driver does — by putting
  // the car on the pit side at the entry and keeping it there. A button made
  // the stop a MODE you toggle; this makes it a line you take, which is both
  // the real gesture and one fewer thing on a phone screen.
  //
  // The whole difficulty is telling that apart from a car that merely ran wide
  // at the entry, which is the exact failure the half-plane `inLane` had (see
  // the header). Four conditions do it, and each is there for a specific way of
  // being wrong:
  //
  //   COMMIT_M     only at the ENTRY, not anywhere in the window. Past this you
  //                have gone by the entry road and are racing the straight.
  //   COMMIT_FRAC  a long way over, not a drift. Deliberate, not a wobble.
  //   COMMIT_S     HELD. A run-wide is transient; a pit entry is sustained, and
  //                a dwell is what separates a gesture from a mistake.
  //   COMMIT_V     and moving, forwards, on the road. A spun or beached car at
  //                the entry commits to nothing — that is the beached-car case
  //                the header's failure (1) describes, refused by construction.
  //
  // +x is RIGHT, and the generic pit building goes on side +1 (js/track/tracks.js
  // buildProps places the grandstand at -1 and the pit building at +1), so that
  // is the default side. A circuit may say otherwise via `def.pitZone.side`.
  const PIT_SIDE = 1;
  // THE LANE IS THE OUTERMOST STRIP OF THE ROAD across the window, separated
  // from the racing surface by a painted line. It is not a separate road behind
  // the wall, and that is a decision rather than a shortcut: this track engine
  // is one ribbon with one arc coordinate, so a road that branches off and
  // rejoins cannot be expressed — which is why both earlier attempts died (see
  // the header). On-road costs no geometry, moves no boundary and leaves the
  // car on tarmac, so neither failure can return. What it does not give is
  // garages, a crew, or a lane behind the wall.
  //
  // MUST MATCH PIT_LANE_W in the three lit shaders (glsl-lit.js, wgsl-chunks.js,
  // tsl-lit.js) — the painted line IS the lane edge, and a driver steering at
  // what they can see has to land inside what the model calls the lane.
  // tests/unit/pit-lane.test.mjs asserts all four agree.
  // A FLAT 3.2 m LANE IS WRONG ON THE NARROWEST CIRCUIT, and that was measured
  // rather than guessed: across all 51 built circuits the pit-window half-width
  // runs 4.93 m (Monaco) to 8.0 m (Spa/Silverstone/Shanghai). At Monaco a flat
  // lane takes 32% of a 9.9 m road and leaves 6.7 m to race on — on the one
  // circuit where overtaking is already impossible. Everywhere else it leaves
  // 8.8 m or more.
  //
  // So the lane yields to the RACING SURFACE rather than the other way round:
  // never leave less than MIN_RACING, which is two 2 m cars with a metre
  // between them and a metre either side. Only Monaco is narrowed (to 2.86 m);
  // every other circuit keeps the full 3.2 m.
  const LANE_W = 3.2;
  const LANE_MIN = 2.4;      // a car is 2.0 m — below this it is not a lane
  const MIN_RACING = 7.0;    // two cars side by side, with room
  function laneWidth(hw) {
    return Math.min(LANE_W, Math.max(LANE_MIN, 2 * hw - MIN_RACING));
  }
  // HOW FAR OUT OF THE LANE A CAR MAY BE AND STILL STOP. The painted line is the
  // lane's INNER EDGE, so a 2.0 m car parked with its centre exactly on it is
  // half in; asking for the centre would be asking for a metre of precision the
  // camera cannot show. A metre of tolerance means "most of the car is in the
  // lane" and nothing looser: at Monaco's narrowed 2.86 m lane it still refuses
  // a car sitting on the racing line.
  const BOX_LAT = 1.0;
  const COMMIT_M = 120;       // commit only this far into the window
  const COMMIT_S = 0.55;      // held, in seconds
  const COMMIT_V = 0.10;      // of the speed envelope: a parked car is not pitting

  // Resolve the lane for a built track: absolute arc positions, the side, the
  // width and the limit. A circuit def may override any field through
  // `def.pitZone`; none currently does, and the defaults above are deliberately
  // uniform so every one of the 42 circuits has a working lane on day one.
  // Per-circuit lengths are what make pit loss vary, and they are authored later.
  function zoneOf(track) {
    if (!track || !(track.total > 0)) return null;
    const L = track.total;
    const z = (track.def && track.def.pitZone) || {};
    const wrap = (v) => ((v % L) + L) % L;
    const entryM = z.entryM != null ? z.entryM : ENTRY_M;
    const exitM = z.exitM != null ? z.exitM : EXIT_M;
    // A very short circuit cannot carry a 450 m lane: cap the window at a third
    // of the lap so the lane can never swallow the whole track.
    const cap = L / 3;
    const inM = Math.min(entryM, cap * 0.7), outM = Math.min(exitM, cap * 0.3);
    const zone = {
      sIn: wrap(-inM), sOut: wrap(outM), sBox: wrap(-(z.boxM != null ? z.boxM : BOX_M)),
      lenM: inM + outM,
      limitFrac: z.limitFrac != null ? z.limitFrac
        : (track.def && track.def.street ? LIMIT_FRAC_STREET : LIMIT_FRAC),
      boxS: z.boxS != null ? z.boxS : BOX_S,
      side: z.side === -1 ? -1 : PIT_SIDE,
    };
    return zone;
  }

  // Is arc position `s` inside the window? The window wraps the start/finish
  // line by construction, so this is a wrapped-interval test and not a compare.
  function inWindow(zone, s, L) {
    if (!zone) return false;
    const a = zone.sIn, b = zone.sOut;
    const v = ((s % L) + L) % L;
    return a <= b ? (v >= a && v <= b) : (v >= a || v <= b);
  }

  // Distance travelled INTO the window, 0 at the entry and lenM at the exit.
  // Used for the box test and for the lane's own progress readout.
  function throughM(zone, s, L) {
    const v = ((s % L) + L) % L;
    return ((v - zone.sIn) % L + L) % L;
  }

  function create(G) {
    Log.info("game", "PitLane.create");
    let zone = null, zoneFor = null;

    // Cached per built track: zoneOf is pure but this runs per car per tick.
    function z() {
      const t = G.track;
      if (!t) return null;
      if (zoneFor !== t) { zoneFor = t; zone = zoneOf(t); }
      return zone;
    }

    // A lane exists wherever wear does — there is no geometry to have room for.
    function enabled() { return !!(z() && G.tyres && G.tyres.on()); }

    /** The speed cap inside the lane, in m/s at the CURRENT pace scale. */
    function limit() {
      const zz = z();
      return zz ? G.vTop() * zz.limitFrac : Infinity;
    }

    /** How far this car still has to go to reach its box, in metres (-1 when it
     *  is not in the window, and negative once it is past). */
    function toBox(c) {
      const zz = z(), t = G.track;
      if (!zz || !t || !c || !inWindow(zz, c.s, t.total)) return -1;
      return throughM(zz, zz.sBox, t.total) - throughM(zz, c.s, t.total);
    }

    /** Metres from this car FORWARD to the pit entry, 0 once inside the window. */
    function toEntry(c) {
      const zz = z(), t = G.track;
      if (!zz || !t || !c) return -1;
      if (inWindow(zz, c.s, t.total)) return 0;
      const d = ((zz.sIn - c.s) % t.total + t.total) % t.total;
      return d;
    }

    // THE CUE, because a gesture nobody can see is not a control. With no pit
    // button, the window has to announce itself: how far to the entry, which way
    // to go, and what the car is doing once it is in there. Returned as data so
    // the HUD stays a painter and this stays the one place that knows the rules.
    //
    // It is NOT shown every lap. A permanent PIT prompt is wallpaper — the
    // driver stops reading it, which is worse than no cue. It appears when a
    // stop is actually worth making: the set is meaningfully used, or the tread
    // is wrong for the conditions, or a caution is out and a stop is cheap.
    const CUE_M = 550;          // start counting down this far out
    const BOX_CUE_M = 90;       // …and start asking for the lane this far from the box
    const CUE_WEAR = 0.55;      // …or not at all, on a set with life left in it
    function cue(c) {
      if (!enabled() || !c || !c.local || c.retired || c.finished) return null;
      const st = c.pitState || "none";
      if (st === "box") return { phase: "box", text: "STOP", dist: 0 };
      if (st === "lane") {
        // APPROACHING THE BOX AND NOT IN THE LANE: say which way. A stop that
        // silently does not happen is the cruellest thing this module could
        // ship — the driver did everything else right and gets no reason.
        const togo = toBox(c);
        if (togo > -BOX_TOL && togo < BOX_CUE_M) {
          Tracks.sample(G.track, c.s, _smp);
          const zz = z();
          if (!inLaneLat(c, _smp.hw || 0, zz.side)) {
            return { phase: "keep", text: zz.side > 0 ? "KEEP RIGHT" : "KEEP LEFT", dist: 0 };
          }
        }
        return { phase: "lane", text: Math.round(limit() * 3.6) + " LIMIT", dist: 0 };
      }
      if (st === "out") return null;
      const d = toEntry(c);
      if (d < 0 || d > CUE_M) return null;
      // Worth making? Any ONE of: a used set, the wrong tread, a free stop.
      const wear = G.tyres.spent(c);
      const wrongTread = !!c.tyre && (c.tyre.tread || 0) !== TyreModel.treadFor(G.raceWeather);
      const caution = G.cautionInfo ? G.cautionInfo() : null;
      const free = !!caution && caution.level >= 2 && wear >= 0.35;
      if (!(wear >= CUE_WEAR || wrongTread || free)) return null;
      if (c.pitArmed) return { phase: "armed", text: "BOX", dist: 0 };
      // Inside the entry road: say GO, not a distance — the distance is zero and
      // what the driver needs now is the direction.
      if (d === 0 && throughM(z(), c.s, G.track.total) <= COMMIT_M) {
        return { phase: "enter", text: "PIT ENTRY", dist: 0 };
      }
      if (d === 0) return null;   // in the window but past the entry road
      return { phase: "near", text: "PIT " + Math.round(d) + "m", dist: d };
    }

    /** A stopping envelope onto the box: how fast a car may be HERE and still be
     *  stopped by the time it arrives. AI-ONLY by contract — game.js applies it
     *  only to `!c.human`, because braking onto the mark is the player's job. */
    function approachV(c) {
      const togo = toBox(c);
      if (togo < 0) return Infinity;                 // not in the window, or past the box
      return Math.sqrt(2 * BOX_BRAKE * Math.max(0, togo - BOX_TOL * 0.5));
    }

    /** Is this car serving a stop right now? A STATE, not a position — so a car
     *  merely running wide on the start/finish straight never gets the limiter,
     *  and a car beached off the road never reads as pitting. */
    function inLane(c) {
      return !!(c && (c.pitState === "lane" || c.pitState === "box"));
    }

    /** Inside the window at all — the arc test alone, without the lateral one. */
    function inWindowOf(c) {
      const zz = z(), t = G.track;
      return !!(zz && t && c && inWindow(zz, c.s, t.total));
    }

    function arm(c, on) {
      if (!c || !enabled()) return false;
      c.pitArmed = on == null ? !c.pitArmed : !!on;
      return c.pitArmed;
    }

    // Is this car, RIGHT NOW, holding the line into the pits? Pure apart from
    // the track sample, and each clause is one way of not meaning it — see the
    // COMMIT_* block for which. Order matters only for cost: the cheap
    // rejections come first so the spline sample is reached by almost nobody.
    const _smp = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
    /** The lane's inner edge — the painted line — as a lateral x. */
    function laneEdge(hw, side) { return (hw - laneWidth(hw)) * side; }
    /** The lane's lateral CENTRE: where the box is and where a car in it sits. */
    function laneCentre(hw, side) { return (hw - laneWidth(hw) * 0.5) * side; }
    /** Is this car laterally IN the lane (within BOX_LAT of it)? Written in
     *  "toward the pit side" coordinates — x * side — so one comparison serves
     *  both sides and there is no sign to get wrong.
     *
     *  THE FLOOR IS NOT DECORATION. On a road narrow enough that the lane plus
     *  its tolerance spans the whole width, the threshold goes negative, the
     *  RACING LINE counts as the pit box, and the stop becomes free wherever you
     *  happen to halt. No built circuit is that narrow — Monaco, the narrowest
     *  at hw 4.93, still leaves 1.07 m — so this is a guard against a circuit
     *  authored later, which is exactly the kind of quiet reversal that would
     *  never show up as a failing test on the 51 that exist today. Half a car
     *  is the least that can honestly be called "off the racing line". */
    function inLaneLat(c, hw, side) {
      return (c.x || 0) * side >= Math.max(1, hw - laneWidth(hw) - BOX_LAT);
    }
    /** Where a car SERVING A STOP should be laterally — the lane's centre — or
     *  `want` unchanged for every other car. game.js hands its finished
     *  racing-line target through this, so the override is one expression at the
     *  end of the AI's lateral chain rather than a branch inside it, and no
     *  bias, defence or hold-line can pull a limited car back onto the racing
     *  surface. AI-ONLY BY CONSTRUCTION: the human car never reaches that line,
     *  and that is deliberate — the lane is DRIVEN (see the COMMIT block), so
     *  the car is never taken off you. What the player gets instead is the box's
     *  own lateral condition: stop on the racing line and the stop does not
     *  happen, exactly as it would not in the real thing. */
    function laneX(c, hw, want) {
      const zz = z();
      return zz && inLane(c) ? laneCentre(hw, zz.side) : want;
    }
    function committing(c, zz, L) {
      if (c.offroad || c.wrongWay || c.rescueT > 0) return false;
      if (!((c.speed || 0) > G.vTop() * COMMIT_V)) return false;
      if (throughM(zz, c.s, L) > COMMIT_M) return false;
      Tracks.sample(G.track, c.s, _smp);
      // INSIDE THE PAINTED LANE, not past an abstract fraction of the road. The
      // commitment test and the stripe a driver can see are now the same line,
      // which is the whole point of painting it: before this, the gesture asked
      // you to aim at nothing.
      const hw = _smp.hw || 0;
      return (c.x || 0) * zz.side >= laneEdge(hw, zz.side) * zz.side;
    }

    /** The four numbers the lit shaders paint the lane from, or null. */
    function laneUniform() {
      const zz = z(), t = G.track;
      if (!enabled() || !zz || !t) return null;
      return [zz.sIn, zz.lenM, zz.side, t.total];
    }

    /** How far through the commitment dwell this car is, 0-1. The HUD's cue. */
    function commitFrac(c) {
      return c ? clamp((c.pitCommitT || 0) / COMMIT_S, 0, 1) : 0;
    }

    // The state machine, one tick. Deliberately small: ARMED -> LANE (the driver
    // actually put the car out there) -> BOX (held, tyres changed) -> OUT (back
    // on the road). Nothing here MOVES the car — the lane is driven, so entry and
    // exit are the driver's job and the only thing this owns is the stop itself.
    function update(c, dt) {
      if (!c || !enabled() || c.retired || c.finished) return;
      const st = c.pitState || "none";
      if (!inWindowOf(c)) {
        // Left the window. A car that was in the box and never finished the stop
        // (a red flag, a reset) is released rather than stuck holding.
        if (st !== "none") { c.pitState = "none"; c.pitT = 0; }
        return;
      }
      const zz = z(), L = G.track.total;
      if (st === "box") {
        c.pitT = (c.pitT || 0) - dt;
        if (c.pitT <= 0) { c.pitState = "out"; c.pitT = 0; }
        return;
      }
      if (st === "out") return;                       // serviced; drive away
      // NO BUTTON: the driver commits by holding the line into the pits. Only
      // the local player — an AI car is armed by its own strategy (think), and
      // a networked rival is integrated by its owner, so neither steers itself
      // into a stop here.
      if (!c.pitArmed && c.local) {
        c.pitCommitT = committing(c, zz, L) ? (c.pitCommitT || 0) + dt : 0;
        if (c.pitCommitT >= COMMIT_S) {
          c.pitCommitT = 0;
          arm(c, true);
          // Say what the crew has ready. With no button to press there is no
          // other moment where the compound choice becomes visible, and the
          // limiter coming on wants an explanation the same tick it arrives.
          const next = pickFor(c);
          if (G.announce) G.announce("PIT ENTRY — LIMITER ON" + (next ? " — " + next.code : ""), 1.6, "race");
        }
      }
      if (!c.pitArmed && !inLane(c)) return;          // not coming in
      // Called the stop and reached the window: the limiter is on from here.
      c.pitState = "lane";
      // The box: reached when the car has driven far enough in, and only once
      // slow enough to have actually STOPPED there. Blowing through the box at
      // the limit misses the stop, exactly as it would in the real thing.
      const at = throughM(zz, c.s, L), boxAt = throughM(zz, zz.sBox, L);
      if (at >= boxAt - BOX_TOL && Math.abs(c.speed) < G.vTop() * BOX_SPEED_FRAC) {
        // AND IN THE LANE. Sampled only here, after the two cheap tests, so the
        // spline read costs one car for one tick per stop. A car stopped on the
        // racing line has not reached its box — the crew is not standing there
        // — which is also what makes the stop cost the lateral move rather than
        // handing it over for free.
        Tracks.sample(G.track, c.s, _smp);
        if (!inLaneLat(c, _smp.hw || 0, zz.side)) return;
        c.pitState = "box";
        c.pitT = zz.boxS;
        c.pitArmed = false;
        c.pitStops = (c.pitStops || 0) + 1;
        serviceCar(c);
      }
    }

    // ── ALLOCATION ───────────────────────────────────────────────────────────
    // §6's opportunity, and it needs no new system: real F1 gives each driver
    // 13 sets to allocate across a weekend, Apex has no practice sessions to
    // allocate across — but career already tracks WHICH PARTS YOU OWN. So a
    // stop may fit any compound the player owns, and the career economy becomes
    // the allocation rule for free. A player who bought only hypersofts has a
    // fast car and no strategy; one who owns a hard and a soft has a choice.

    /** The tyre rows this car may fit: everything, or what career says it owns. */
    function ownedTyres() {
      const cat = Parts.CATALOG.find(function (x) { return x.id === "tyres"; });
      const opts = (cat && cat.options) || [];
      const team = G.player && G.player.team;
      // Career.owned() is null outside a career, and null for another team's
      // car, so this is already the quick-race answer: every row is available.
      const own = team && typeof Career !== "undefined" && Career.owned
        ? Career.owned(team.id) : null;
      return own ? opts.filter(function (o) { return own.has(o.id); }) : opts;
    }

    /** The set a stop should fit for this car — a TyreModel record, or null. */
    function pickFor(c) {
      const tyres = G.tyres;
      if (!tyres || !c) return null;
      const want = TyreModel.treadFor(G.raceWeather);
      const list = ownedTyres().map(function (o) { return tyres.optionRecord(o); });
      // TREAD FIRST, and it is not a preference. The wrong tread costs whole
      // seconds a lap and no compound choice makes that up. A career save that
      // owns no wet tyre still gets one, from the class ladder: the alternative
      // is a player who literally cannot respond to the weather, which is the
      // "no recourse" docs/PHYSICS.md warned about, reintroduced by an economy.
      const right = list.filter(function (r) { return (r.tread || 0) === want; });
      if (!right.length) {
        const cls = TyreModel.classForTread(want);
        return cls ? tyres.classRecord(cls) : (list[0] || null);
      }
      // Then the strategist's rule: the FASTEST set that still reaches the
      // flag. Softer is faster and shorter-lived, so among the sets that go the
      // distance take the shortest-lived one; if nothing reaches, take the set
      // that gets closest and accept that there is another stop coming.
      const lapsLeft = Math.max(1, G.lapsTarget - (c.lap || 0));
      const lasts = right.filter(function (r) {
        return TyreModel.lifeLaps(r.life, G.lapsTarget) >= lapsLeft;
      });
      const pool = lasts.length ? lasts : right;
      return pool.reduce(function (best, r) {
        if (!best) return r;
        return lasts.length ? (r.life < best.life ? r : best)
                            : (r.life > best.life ? r : best);
      }, null);
    }

    // What a stop actually does. One place, so a player stop, an AI stop and a
    // test-driven stop cannot diverge.
    function serviceCar(c) {
      // An AI car's next set was chosen by its plan (setNext); a PLAYER's is
      // chosen here, from what they own and what the race needs. Refitting
      // c.tyreOpt unconditionally — which is what this did — meant a player who
      // stopped in the rain bolted on another slick, the exact loop the AI's
      // weather rule exists to prevent.
      const next = c.pitNext || (c.local ? pickFor(c) : null);
      G.tyres.fit(c, next || (c.tyreOpt ? G.tyres.optionRecord(c.tyreOpt) : G.tyres.classRecord(c.tyreClass || "medium")));
      c.pitNext = null;
      if (c.isPlayer && G.announce) G.announce("TYRES ON — GO GO GO", 1.6, "race");
    }

    /** The compound this car will fit at its next stop (a TyreModel record). */
    function setNext(c, record) { if (c) c.pitNext = record || null; }

    // ── STRATEGY ─────────────────────────────────────────────────────────────
    // The plan is AiDrive's (stintPlan); what lives here is the race state it
    // needs and the state its decisions write. Kept in this module rather than
    // in game.js because the pit state machine is already here — and because
    // game.js is ratcheted and this is not game-loop work.

    /** Draw a stint plan for one AI car. PIT LOSS IS DERIVED FROM THE LANE, in
     *  laps, so a circuit whose lane costs more really does see fewer stops —
     *  which is the whole reason pit loss was kept emergent. */
    function planFor(roll) {
      const zz = z();
      if (!zz) return null;
      // A representative racing speed for the pit straight, as a fraction of the
      // envelope: fast enough to be a straight, slow enough not to be a peak.
      const raceV = Math.max(1, G.vTop() * 0.55);
      const lapRefS = G.track && G.track.total > 0 ? G.track.total / raceV : 100;
      const lossS = zz.lenM / Math.max(1, limit()) - zz.lenM / raceV + zz.boxS;
      return AiDrive.stintPlan({
        laps: G.lapsTarget,
        lifeLaps: (cls) => TyreModel.lifeLaps(TyreModel.AI_CLASS[cls].life, G.lapsTarget),
        pitLossLaps: clamp(lossS / Math.max(1, lapRefS), 0.02, 0.9),
        roll,
      });
    }

    /** Does this AI car call its stop this tick? The plan says WHEN; AiDrive.pitNow
     *  owns the three reasons to ignore it, and this owns the state they read. */
    function think(c) {
      const plan = c && c.pitPlan;
      if (!plan || c.pitArmed || (c.pitState && c.pitState !== "none")) return "";
      const stopsLeft = plan.stops - (c.pitStops || 0);
      const nextAt = plan.lapsAt[c.pitStops || 0];
      // WRONG TYRE FOR THE CONDITIONS, in either direction: slicks in the rain
      // AND wets on a drying track. This is the recourse docs/PHYSICS.md said a
      // dry->rain arc did not have.
      const wantTread = TyreModel.treadFor(G.raceWeather);
      const wrongTread = !!c.tyre && (c.tyre.tread || 0) !== wantTread;
      const caution = G.cautionInfo ? G.cautionInfo() : null;
      const why = AiDrive.pitNow({
        stopsLeft,
        lapsToStop: nextAt == null ? 99 : nextAt - (c.lap || 0),
        cautionLevel: caution ? caution.level : 0,
        wear: G.tyres.spent(c),
        wrongTread,
      });
      if (!why) return "";
      // A weather stop fits what the WEATHER wants; any other stop follows the
      // plan. Without the first branch a car pits, fits another slick, is still
      // wrong, and pits again — a stop every lap.
      const wetCls = TyreModel.classForTread(wantTread);
      const lifeLaps = (cls) => TyreModel.lifeLaps(TyreModel.AI_CLASS[cls].life, G.lapsTarget);
      const lapsLeft = Math.max(1, G.lapsTarget - (c.lap || 0));
      const planned = plan.seq[(c.pitStops || 0) + 1];
      const want = wrongTread ? (wetCls || AiDrive.compoundFor(lapsLeft, lifeLaps))
                 : (planned || AiDrive.compoundFor(lapsLeft, lifeLaps));
      arm(c, true);
      setNext(c, G.tyres.classRecord(want));
      c.pitWhy = why;
      return why;
    }

    function resetCommit(c) { if (c) c.pitCommitT = 0; }

    function reset(c) {
      if (!c) return;
      c.pitArmed = false; c.pitState = "none"; c.pitT = 0; c.pitNext = null; c.pitStops = 0; c.pitWhy = "";
      c.pitCommitT = 0;
    }

    function info(c) {
      const zz = z();
      if (!zz) return null;
      const car = c || G.player;
      const L = G.track ? G.track.total : 0;
      const at = car && L ? throughM(zz, car.s, L) : -1;
      // ONE sample for both lateral answers below, and only inside the window:
      // info() is a per-frame HUD read, so an unconditional spline sample here
      // would be a lap's worth of them for every car on the circuit.
      let lat = null;
      if (car && inWindowOf(car)) { Tracks.sample(G.track, car.s, _smp); lat = { hw: _smp.hw || 0 }; }
      return {
        enabled: enabled(),
        lenM: +zz.lenM.toFixed(1),
        // Where the box is, and how far into the window this car has come — both
        // measured from the entry. A driver (and AiDrive in the strategy phase)
        // needs these to know when to stop: without them the only way to find the
        // box is to crawl the whole lane looking for it.
        boxM: +throughM(zz, zz.sBox, L || 1).toFixed(1),
        atM: +at.toFixed(1),
        limitKph: +(limit() * 3.6).toFixed(1),
        boxS: zz.boxS,
        armed: !!(car && car.pitArmed),
        state: (car && car.pitState) || "none",
        inLane: !!(car && inLane(car)),
        // The LATERAL half, and WHERE it is, both measured at this car's own
        // arc position. Two separate needs: "the state machine says lane" and
        // "the car is actually in the strip" are different questions, and a
        // stop that will not latch is always the second one — while `laneX` is
        // the number a driver, a test or an agent has to aim the car at, which
        // a nominal-half-width constant cannot give (the pit-window half-width
        // runs 4.93 m at Monaco to 8.0 m at Spa, so the lane centre moves by
        // over three metres across the calendar). Both are null/false outside
        // the window, where there is no answer and no sample worth paying for.
        inLaneLat: lat ? inLaneLat(car, lat.hw, zz.side) : false,
        laneX: lat ? +laneCentre(lat.hw, zz.side).toFixed(2) : null,
        inWindow: !!(car && inWindowOf(car)),
        stops: (car && car.pitStops) || 0,
        // How far through the commitment dwell — 0 unless the car is holding
        // the line into the pits right now. There is no button; this is it.
        commit: +commitFrac(car).toFixed(3),
        side: zz.side,
        // The four numbers the lit shaders paint the lane from, exactly as the
        // frame carries them: (entry s, window length, side, lap length). Null
        // means no lane is armed and nothing is painted — which is the first
        // thing to check when the lane is invisible.
        lane: laneUniform(),
        laneEdgeX: +laneEdge(7, zz.side).toFixed(2),   // at a nominal 7 m half-width
      };
    }

    return { zoneOf: () => z(), limit, toBox, approachV, inLane, inWindow: inWindowOf,
             arm, update, reset, info, setNext, serviceCar, planFor, think,
             pickFor, ownedTyres, committing, commitFrac, resetCommit, toEntry, cue,
             laneEdge, laneCentre, laneUniform, laneX, inLaneLat };
  }

  return { create, zoneOf, inWindow, throughM,
           ENTRY_M, EXIT_M, BOX_M, LIMIT_FRAC, LIMIT_FRAC_STREET, BOX_S, BOX_SPEED_FRAC,
           BOX_TOL, BOX_BRAKE, PIT_SIDE, COMMIT_M, COMMIT_S, COMMIT_V,
           CUE_M: 550, CUE_WEAR: 0.55, LANE_W, LANE_MIN, MIN_RACING, BOX_LAT, laneWidth };
})();
Object.freeze(PitLane);
