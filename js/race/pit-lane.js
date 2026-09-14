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
 * KNOWN GAP: a car held in the box sits on the racing surface, so the field has
 * to go around it. Pulling it off-line needs somewhere to be pulled to, which is
 * the geometry this fallback exists because we do not have.
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
      if (!c.pitArmed && !inLane(c)) return;          // not coming in
      // Called the stop and reached the window: the limiter is on from here.
      c.pitState = "lane";
      // The box: reached when the car has driven far enough in, and only once
      // slow enough to have actually STOPPED there. Blowing through the box at
      // the limit misses the stop, exactly as it would in the real thing.
      const at = throughM(zz, c.s, L), boxAt = throughM(zz, zz.sBox, L);
      if (at >= boxAt - BOX_TOL && Math.abs(c.speed) < G.vTop() * BOX_SPEED_FRAC) {
        c.pitState = "box";
        c.pitT = zz.boxS;
        c.pitArmed = false;
        c.pitStops = (c.pitStops || 0) + 1;
        serviceCar(c);
      }
    }

    // What a stop actually does. One place, so a player stop, an AI stop and a
    // test-driven stop cannot diverge.
    function serviceCar(c) {
      const next = c.pitNext || null;
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

    function reset(c) {
      if (!c) return;
      c.pitArmed = false; c.pitState = "none"; c.pitT = 0; c.pitNext = null; c.pitStops = 0; c.pitWhy = "";
    }

    function info(c) {
      const zz = z();
      if (!zz) return null;
      const car = c || G.player;
      const L = G.track ? G.track.total : 0;
      const at = car && L ? throughM(zz, car.s, L) : -1;
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
        inWindow: !!(car && inWindowOf(car)),
        stops: (car && car.pitStops) || 0,
      };
    }

    return { zoneOf: () => z(), limit, toBox, approachV, inLane, inWindow: inWindowOf,
             arm, update, reset, info, setNext, serviceCar, planFor, think };
  }

  return { create, zoneOf, inWindow, throughM,
           ENTRY_M, EXIT_M, BOX_M, LIMIT_FRAC, LIMIT_FRAC_STREET, BOX_S, BOX_SPEED_FRAC,
           BOX_TOL, BOX_BRAKE };
})();
Object.freeze(PitLane);
