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
 * THE LANE IS A PLACE NOW — js/track/core/pit.js (TrackPit) builds the pit
 * complex once per track: the entry road, the fast lane, the working lane,
 * the wall and the row of garages. This module reads that model for the
 * window, the side and each team's box, and keeps what was always its own:
 * the state machine, the commitment gesture, the cue and the stop. The
 * geometry-free arithmetic below survives as the fallback for a track built
 * without a model (the VM tests build centrelines by hand).
 */
const PitLane = (function () {
  "use strict";

  const clamp = M4.clamp;

  // Lane geometry, in METRES along the lap rather than as a fraction of it.
  // A fraction would make Spa's lane (7 km lap) twice Monaco's, which is
  // backwards — a pit lane is a building, not a share of a circuit. Measured
  // from the start/finish line, which is where every circuit's pit straight is
  // (racing coordinates put the line at s = 0; see TrackSpace).
  const ENTRY_M = 260;     // the LONGEST the lane may open before the line (TrackPit.ENTRY_MAX; was 400)
  const ENTRY_MIN = 150;   // ...and the shortest that is still a lane
  const EXIT_M = 110;      // where it closes, after the line (TrackPit.EXIT_M; was 130)
  const BOX_M = 40;        // the stop, this far before the line

  // ── WHERE THE LANE OPENS IS A PROPERTY OF THE CIRCUIT ─────────────────────
  // It used to be a flat 320 m on all 52, which is circuit-blind and measurably
  // wrong: at Monza that lands the entry INSIDE PARABOLICA. The gesture that
  // calls a stop is "hold the car on the pit side and keep it there", and a car
  // holding any lateral line through a corner is doing the hard part of driving
  // — traced, a car entering the old window and steering zero drifted 6.4 m to
  // 0.74 m and missed its box. Asking for the pit side mid-corner asks the
  // wrong thing.
  //
  // So walk BACK from the start/finish line and open the window where the last
  // corner lets go. Real pit entries are on the pit straight for this exact
  // reason.
  //
  // CURVATURE CHANNEL: **surface**, and classified in docs/PHYSICS.md before it
  // landed. This is the aero-zones pattern exactly — fixed zones computed ONCE
  // per circuit from the static arc, gating a driver-INITIATED action (there
  // the X button, here calling a stop) identically for every car, with no force
  // path and nothing read per frame. The arc decides WHERE the pit lane is, the
  // same way it decides where a kerb is; it never reaches a driving car.
  //
  // THE THRESHOLD IS LOOSER THAN A DRS ZONE'S ON PURPOSE. aero-zones uses
  // 0.0014 (r >= ~700 m) because a zone must be a PROPER straight — at a slacker
  // bar Monaco sprouted four of them. A pit entry needs much less: not "straight"
  // but "not actively cornering", i.e. road where holding a line is not itself
  // the challenge. 0.0035 is r ~= 285 m, which a car at the pit limit takes
  // without noticing.
  const PIT_K = 0.0035;
  const PIT_STEP = 8;      // m between samples, as aero-zones uses

  /** How far before the line the pit straight starts, clamped to a length that
   *  is still a pit lane. Pure, static, once per circuit. */
  function entryRunM(track) {
    const L = track.total;
    if (!(L > 0) || typeof Tracks === "undefined" || !Tracks.curvature) return ENTRY_M;
    let d = 0;
    for (; d < ENTRY_M; d += PIT_STEP) {
      const s = ((-(d + PIT_STEP / 2)) % L + L) % L;
      if (Math.abs(Tracks.curvature(track, s)) > PIT_K) break;   // the corner
    }
    return clamp(d, ENTRY_MIN, ENTRY_M);
  }

  // The speed limit, as a fraction of the speed ENVELOPE rather than a literal
  // m/s. 80 km/h against a 259 km/h car is the real ratio (FIA 2025 Sporting
  // Regs Art. 34.7, carried into 2026 as B1.6.3a), and expressing it this way is
  // what makes it a vStd() threshold: at any OVERALL SPEED setting the limiter
  // sits at the same place on the dial, so the pit loss a player measures does
  // not move when they change the pace slider.
  const LIMIT_FRAC = 22.2 / 72;      // 80 km/h of a 259 km/h envelope
  // The speed a car would carry through the pit complex if it stayed out, as a
  // fraction of the envelope. A pit straight is a STRAIGHT, so this is near the
  // top of the range and well above the lap average (0.56 at Monaco to 0.64 at
  // Spa, from the pole model) — see lossS().
  const STRAIGHT_V = 0.85;
  const LIMIT_FRAC_STREET = 16.7 / 72;   // 60 km/h — the PAINTED street lane's fallback; a built complex carries its own limitKph (TrackPit)

  // How long the car is held in the box. Real stationary time is 2.0-2.5 s
  // (record 1.80 s); this is deterministic on purpose — a random stop time
  // would make a strategy call a coin flip and would break replay determinism,
  // which js/race/reliability.js is equally careful about.
  const BOX_S = 2.2;   // was 2.4: the 2025 field's median stationary time is ~2.2 s

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
  // SINCE THE 2026-09 REDESIGN the lane on every circuit is the COMPLEX
  // (TrackPit, js/track/core/pit.js): a ribbon beside the road behind a real
  // pit wall, bays on the row — the FULL set on permanent circuits, the
  // STREET set between a street circuit's walls (docs/research/
  // STREET-PIT-LANES-PLAN-2026-09.md). laneUniform() is null there; the road
  // carries the geometry. What follows describes the PAINTED strip that a
  // `def.pit.mode: "narrow"` opt-out keeps, and a track built without a model:
  //
  // THE PAINTED LANE IS THE OUTERMOST STRIP OF THE ROAD across the window,
  // separated from the racing surface by a painted line — not a separate road
  // behind the wall. Two earlier attempts at a driveable lane out beyond the
  // road edge died (see the header); on-road costs no geometry, moves no
  // boundary and leaves the car on tarmac, so neither failure can return.
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
  /** The lane's width on a track whose road was WIDENED for it. There the lane
   *  is the added tarmac, so it is the full LANE_W and the racing surface keeps
   *  every metre it had — which is the whole point of widening rather than
   *  carving. A track that was not widened (a street circuit, or a centreline
   *  built by hand in a test) falls back to yielding, as before. */
  function laneWidthOn(track, hw) {
    return track && track.pitW ? track.pitW.laneW : laneWidth(hw);
  }
  /** This car's row in the pit lane, or -1 when it has no team. Teams.LIST
   *  order is the garage order, which is how a real lane is laid out and is
   *  stable for a season. Defensive about Teams for the same reason pickFor is
   *  defensive about Career: this module is loaded by tests that stub neither. */
  function teamRow(c) {
    const t = c && c.team;
    if (!t || typeof Teams === "undefined" || !Teams.LIST) return -1;
    const id = typeof t === "object" ? t.id : t;
    return Teams.LIST.findIndex(function (x) { return x.id === id; });
  }
  // HOW FAR OUT OF THE LANE A CAR MAY BE AND STILL STOP. The painted line is the
  // lane's INNER EDGE, so a 2.0 m car parked with its centre exactly on it is
  // half in; asking for the centre would be asking for a metre of precision the
  // camera cannot show. A metre of tolerance means "most of the car is in the
  // lane" and nothing looser: at Monaco's narrowed 2.86 m lane it still refuses
  // a car sitting on the racing line.
  const BOX_LAT = 1.0;
  // SQUARE IN THE BOX. `BOX_LAT` above is the LANE test — "most of the car is
  // in the working lane" — and it was also, wrongly, the whole of the stop's
  // lateral condition: a car anywhere from the corridor edge to the garage
  // wall latched, and the AI's own diagonal halted it four fifths of the way
  // across (`laneX`), so nobody ever parked in their bay. A stop needs the car
  // SQUARE: centred on its own box and pointing down the lane, the way a crew
  // can actually work on it. These two are that condition, and they bind on
  // the player and the AI alike.
  const BOX_SQUARE_LAT = 1.2;   // m from the box's own centre (the car is 2.0 m wide)
  const BOX_SQUARE_RAD = 0.22;  // rad off the lane's tangent — 12.6°, a crooked car, not a parked one
  const SQUARE_BY_M = 6;        // …and the AI's lateral move is COMPLETE this far before the box
  // ── A ROW OF BOXES, NOT ONE POINT ────────────────────────────────────────
  // Every car used to stop at the SAME arc position, and since the lane became
  // a place, at the same lateral position too — so two cars pitting on the same
  // lap occupied the same patch of tarmac. A pit lane is a row of garages, and
  // modelling it as one is the kind of thing you only notice when two cars do
  // it at once.
  //
  // 14 m is a real garage pitch (an F1 box is ~12-15 m of lane frontage), and
  // with the 12 rows in Teams.LIST that is 154 m of boxes — which fits the
  // window with room at both ends (the earliest lands well past the entry road,
  // the latest well short of the exit).
  //
  // TEAMMATES SHARE A BOX, and that is correct rather than a limitation: a real
  // team has ONE pit box, which is exactly why stacking two cars in a single
  // window costs the second one so much time.
  //
  // It costs no pit loss. The box moves; the distance through the window at the
  // limiter does not, so where a team's garage sits changes where you stop and
  // nothing about what the stop is worth.
  // ONE PITCH, THE BAY'S. TrackPit.PITCH is the garage frontage the setup
  // screen's room is built to, the paint is spaced by and the doors stand at;
  // read at call time so this file still loads in a bare VM (the unit harness
  // loads pit.js beside it).
  const pitch = () => (typeof TrackPit !== "undefined" ? TrackPit.PITCH : 11);
  // Where POLE sits, in metres before the start/finish line. Mirrors
  // TrackMesh.gridSlot's own 14 m; a second copy is the lesser evil here
  // because js/track/ loads first and has no business knowing what a pit box is.
  const GRID_POLE_M = 14;
  const COMMIT_M = 120;       // the entry road, for the cue's "PIT ENTRY" phase
  // The pit CUE's two thresholds. Module scope because they are EXPORTED and
  // the session below is the only other reader: the export list carried its
  // own copies of both literals, so tuning the cue here would have left
  // PitLane.CUE_M/CUE_WEAR quietly describing the old behaviour to every
  // caller that reads them.
  const CUE_M = 550;          // start the cue counting down this far out
  const CUE_WEAR = 0.55;      // …or not at all, on a set with life left in it
  // How much lane a car needs in front of it for a commitment to mean anything:
  // arm the limiter closer than this to your own box and there is no room left
  // to slow down for it.
  const COMMIT_CLEAR = 25;
  // The room left ahead of pole's slot for the first box. It is DERIVED from
  // COMMIT_CLEAR rather than picked: a gap smaller than the run-up a commitment
  // needs anchors the row somewhere pole cannot legally call a stop from, which
  // is the whole failure this anchoring exists to fix. The extra 15 m is one
  // car's braking slop on top of the bare minimum.
  const GRID_CLEAR = COMMIT_CLEAR + 15;
  const COMMIT_S = 0.55;      // held, in seconds
  const COMMIT_V = 0.10;      // of the speed envelope: a parked car is not pitting
  // ON THE COMPLEX the commitment is the lane's own tarmac: the car's centre
  // this far past the lane's inner edge (the road edge at the peel, the wall
  // line once it has grown), so most of the car is on the pit road. The old
  // painted line sat 3.2 m INSIDE the road, and a car holding the pit-side
  // third of the pit straight for half a second armed the limiter on the
  // racing line — from the grid, in traffic, on every circuit.
  const COMMIT_IN = 0.5;
  // A LOCAL car that committed and then held the racing surface again for this
  // long has changed its mind: un-armed, limiter off. Without it a lane touched
  // by mistake meant 80 km/h to the exit line with KEEP RIGHT on screen, and
  // the limiter waiting at the line next lap too.
  const ABORT_S = 1.0;
  // An AI braking for its box never goes below this until it is laterally IN
  // the box: lateral authority is zero at a standstill, so a car braked to
  // nothing beside its box could never reach it — it sat there, rescue put it
  // on the racing line, and Monaco's field gridlocked on the pit straight.
  const CRAWL_V = 3;
  // THE APPROACH (AI only — laneX and entryV, both applied to !c.human): an
  // armed AI takes the pit side of the road for the last APPROACH_M before
  // the entry road, and is capped to reach the limit AT the entry line on an
  // ENTRY_BRAKE m/s² curve. Without both it turned in at the line, from the
  // racing line at racing speed: it met the grown wall on the verge side
  // (off-road, rescued into the lane — every stop on Bahrain, measured) and
  // ran the first seconds of the lane over the limit. ROAD_IN is the line
  // inside the road edge the peel starts on and the blend ends on.
  const APPROACH_M = 200;
  const ENTRY_BRAKE = 10;
  const ROAD_IN = 1.6;
  // The working lane only over the last WORK_IN_M into the box, on a DIAGONAL
  // from the fast lane — the box before ours is one pitch (11 m) back and
  // holds another team's car: a car that moved over 40 m out ran into it
  // (Monaco, traced: 15 m/s to 0 in a second, welded for a minute) — and
  // never out of it: a serviced car pulls into the fast lane at once, or it
  // crawls behind the next box's stop at the queue floor (measured: 33 s
  // from box to exit, by rescue pulses, with the whole field on one lap).
  const WORK_IN_M = 20;
  // Where the exit wall ends (TrackPit.EXIT_WALL_W, the ribbon's share of
  // its width); the bare VM tests load this file without the model.
  const EXIT_WALL_W = typeof TrackPit !== "undefined" && TrackPit.EXIT_WALL_W != null ? TrackPit.EXIT_WALL_W : 0.45;

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
    // THE ENGINE OWNS THE WINDOW NOW, because it is road geometry: tracks.js
    // widens the tarmac across it (pitWiden), so a second copy of the arithmetic
    // here could drift from the road it describes. entryRunM stays as the
    // fallback for a track built without it (the VM tests build centrelines by
    // hand) and as the place the reasoning is written down.
    // THE MODEL FIRST. A built track carries the complex, and its window, its
    // side and its limit ARE the zone — a def's overrides still win field by
    // field, as they always did.
    const model = track.pit;
    if (model) {
      return {
        sIn: model.sIn, sOut: model.sOut, sBox: wrap(-(z.boxM != null ? z.boxM : BOX_M)),
        lenM: model.lenM,
        // km/h over the 259 km/h envelope, the same ratio LIMIT_FRAC encodes.
        limitFrac: z.limitFrac != null ? z.limitFrac : (model.limitKph / 3.6) / 72,
        boxS: z.boxS != null ? z.boxS : BOX_S,
        side: model.side,
      };
    }
    const eng = typeof Tracks !== "undefined" && Tracks.pitWindow ? Tracks.pitWindow(track) : null;
    const entryM = z.entryM != null ? z.entryM : (eng ? eng.entryM : entryRunM(track));
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

    /** The limit as a NUMBER TO SHOW: `limit()` is raw m/s at the current pace,
     *  so `limit() * 3.6` is not the speedo's km/h — the speedo reads `dashKph`
     *  (vStd, where PACE cancels). The board on the wall paints the authored 80
     *  or 60, the speedo reads 80 while the limiter holds, and the cue printed
     *  67: the one number the driver compares against the speedo was the odd
     *  one out, and at pace 0.84 it was 13 km/h low. */
    function limitKphShown() {
      const l = limit();
      return Number.isFinite(l) ? G.dashKph(l) : Infinity;
    }

    /** Where THIS CAR's box sits, as a distance into the window. The zone's
     *  sBox is the row's ANCHOR; a team's garage is offset from it by its row,
     *  centred so the row straddles the anchor rather than growing off one end.
     *
     *  A car with NO team gets the anchor itself — which is the behaviour every
     *  caller had before there was a row, and is what keeps a stubbed or
     *  synthetic car (the VM tests, a replicated net rival before its team
     *  arrives) landing somewhere sane instead of in row 0's garage.
     *
     *  Clamped into the window with room at both ends: a box before the entry
     *  road could not be committed to, and one past the exit could not be
     *  reached. On a short circuit the window is capped at a third of the lap,
     *  so this is what stops the row spilling out of it. */
    /** The ribbon's extent in THIS WINDOW's through-metres, or null where the
     *  circuit has no separate lane and the painted one covers the whole window. */
    function ribbonRange(zz, L) {
      if (typeof Tracks === "undefined" || !Tracks.pitLaneSpan || !G.track) return null;
      const sp = Tracks.pitLaneSpan(G.track);
      if (!sp) return null;
      const a = throughM(zz, sp.sIn, L);
      return { a, b: a + sp.lenM };
    }
    function boxThroughFor(c, zz, L) {
      // THE MODEL'S ROW: the box the paint is at and the door stands behind.
      // A car with no team, or one the row does not know, takes the MY TEAM
      // bay at the end — reachable, and nobody else's.
      const model = G.track && G.track.pit;
      if (model && model.row && model.row.boxes.length) {
        const t = c && c.team;
        const id = t ? (typeof t === "object" ? t.id : t) : null;
        let i = TrackPit.rowOf(model, id);
        if (i < 0) i = model.row.boxes.length - 1;
        return model.row.boxes[i].through;
      }
      const row = teamRow(c);
      const n = row < 0 ? 1 : Teams.LIST.length;
      const BOX_PITCH = pitch();
      const span = (n - 1) * BOX_PITCH;
      // THE ROW HAS TO START PAST THE GRID, or a stop on lap 1 is reachable only
      // by whoever happens to drive the right team. The grid sits INSIDE the pit
      // window — TrackMesh.gridSlot puts P1 14 m before the line and each slot
      // 8 m further back — so a car on pole begins at through (entryM - 14),
      // which at Monza is 386 m into a 530 m window. With the row anchored at
      // BOX_M before the line it ran 283-437, so pole started past eight of the
      // eleven boxes and had to complete a whole lap to reach them.
      //
      // Anchor the row's FIRST box just past pole's slot instead. The clamp
      // still wins where the window cannot hold the whole row — on a short
      // entry the row compresses toward the exit rather than spilling out of
      // it — so this raises lap-1 reachability as far as the geometry allows
      // without ever putting a box somewhere it cannot be driven to.
      const poleS = ((-GRID_POLE_M % L) + L) % L;
      const wantFirst = throughM(zz, poleS, L) + GRID_CLEAR;
      // THE ROW IS LAID OUT INSIDE THE LANE, not inside the window, wherever a
      // separate ribbon exists. The two used to be the same stretch of road, so
      // the window served; once the ribbon could be trimmed short of a pinch it
      // stopped serving, and the last teams' boxes sat past the end of the
      // tarmac on five circuits. The floor also drops to the ribbon's own start
      // rather than COMMIT_M: that constant was the old entry-road commit cap,
      // and boxes nearer the entry are strictly better for reaching one on lap 1.
      const rib = ribbonRange(zz, L);
      const lo = rib ? rib.a + 20 : COMMIT_M + 20;
      const hi = Math.max(lo, (rib ? rib.b : zz.lenM) - 30 - span);
      const first = clamp(Math.max(wantFirst, throughM(zz, zz.sBox, L) - span / 2), lo, hi);
      if (row < 0) return first + span / 2;     // no team: the row's own middle
      return first + row * BOX_PITCH;
    }

    // Estimate the lane's net time cost. The road-speed estimate is explicit;
    // it is advice, not a promise of a free stop or a guaranteed rejoin place.
    function estimate(c) {
      const zz = z();
      if (!zz) return null;
      const flag = G.cautionInfo ? G.cautionInfo().level : 0;
      if (flag >= 4) return null;
      // The road the car would be on instead: slowed by the flag, never above
      // the pit straight's own speed. Same loss formula, slower road — which is
      // exactly why a stop under a caution is cheap.
      const roadFrac = Math.min(STRAIGHT_V, flag === 3 ? 0.45 : flag === 2 ? 0.6 : 1);
      const loss = lossAt(roadFrac);
      const behind = (G.cars || []).filter(o => o !== c && !o.retired && !o.finished && o.prog < c.prog)
        .sort((a, b) => b.prog - a.prog)[0];
      const gapS = behind ? (c.prog - behind.prog) / Math.max(1, behind.speed || G.vTop() * roadFrac) : null;
      return { lossS: loss, gapS, marginS: gapS == null ? null : gapS - loss, caution: flag >= 2, estimated: true };
    }
    function choices(c) {
      if (!G.tyres) return [];
      const list = ownedTyres().map(o => G.tyres.optionRecord(o));
      const automatic = pickFor(c);
      if (automatic && !list.some(r => r.id === automatic.id)) list.push(automatic);
      return list;
    }
    function selectNext(c, id) {
      if (!c || !c.local || c.pitState === "box") return false;
      if (id == null || id === "auto") { c.pitNext = null; return true; }
      const record = choices(c).find(r => r.id === id);
      if (!record) return false;
      setNext(c, record); return true;
    }

    /** How far this car still has to go to reach its box, in metres (-1 when it
     *  is not in the window, and negative once it is past). */
    function toBox(c) {
      const zz = z(), t = G.track;
      if (!zz || !t || !c || !inWindow(zz, c.s, t.total)) return -1;
      return boxThroughFor(c, zz, t.total) - throughM(zz, c.s, t.total);
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
    const BOX_CUE_M = 90;       // …and start counting the metres down this far from the box
    // ASK FOR THE WORKING LANE ONLY WHEN IT IS TIME TO TAKE IT. Reported, with
    // a screenshot of the cue reading KEEP RIGHT at the top of the lane: "it's
    // wrongly telling me to stay right before it's my time to pull over."
    // True — the ask rode the whole 90 m countdown, so a driver doing the right
    // thing (down the fast lane, turn in late, as a real stop is driven) was
    // told they were wrong for four seconds. The instruction now waits until
    // the move is due: 36 m is a second and a half at the 80 km/h limit, and
    // three bay pitches, so it is late enough to mean something and early
    // enough to act on.
    const MOVE_M = 36;
    const SERVED_S = 1.2;       // "GO GO GO" lasts this long after the release
    const MERGE_S = 3;          // a car this close behind on the exit is CLOSING
    // THE FIRST STOP, TAUGHT. Three lines — the road, the line, the gate — each
    // once per session, and none at all once a stop has been completed
    // (apex26.pitTaught). The road, the crest and the gate are in the world
    // now; the words point at them.
    const _said = {};
    let _lastCue = null;
    function taught() { return G.store && G.store.get ? !!G.store.get("pitTaught", 0) : false; }
    function teach(k, msg) {
      if (_said[k] || taught()) return;
      _said[k] = true;
      if (G.announce) G.announce(msg, 2.2, "race");
    }
    /** The nearest car behind on the racing surface that is on this car
     *  inside MERGE_S at its own speed — the one a merging car has to see. */
    function closingCar(c) {
      const cars = G.cars || [];
      let best = null, bestGap = MERGE_S;
      for (let i = 0; i < cars.length; i++) {
        const o = cars[i];
        if (o === c || o.retired || o.finished || inLane(o) || !(o.prog < c.prog)) continue;
        const gap = (c.prog - o.prog) / Math.max(1, o.speed || 0);
        if (gap < bestGap) { bestGap = gap; best = o; }
      }
      return best;
    }
    /** Metres from a serviced car to the end of the exit road (the exit line
     *  on a painted lane), 0 once past it. */
    function toExit(c) {
      const zz = z(), t = G.track;
      if (!zz || !t) return 0;
      const p = t.pit, end = p && !p.painted && p.sB != null ? p.sB : zz.sOut;
      const d = ((end - c.s) % t.total + t.total) % t.total;
      return d > zz.lenM + exitRoadM() + 50 ? 0 : d;
    }
    /** The exit road past the exit line, metres (0 on a painted lane). */
    function exitRoadM() {
      const t = G.track, p = t && t.pit;
      return p && !p.painted && p.sB != null ? ((p.sB - p.sOut) % t.total + t.total) % t.total : 0;
    }
    /** This car's box to the end of the exit road, for the bar. */
    function exitLen(c) {
      const zz = z(), t = G.track;
      return Math.max(1, zz.lenM - boxThroughFor(c, zz, t.total) + exitRoadM());
    }
    /** Is a stop worth making for this car right now — any ONE of a used set,
     *  the wrong tread for the conditions, a free stop under caution. The
     *  cue's own gate, and the minimap's (js/ui/hud.js): one function, so the
     *  marker on the map and the words on the HUD can never disagree. */
    function worthStopping(c) {
      if (!enabled() || !c || c.retired || c.finished) return false;
      const wear = G.tyres.spent(c);
      const wrongTread = !!c.tyre && (c.tyre.tread || 0) !== TyreModel.treadFor(G.raceWeather, G.roadWetness && G.roadWetness());
      const caution = G.cautionInfo ? G.cautionInfo() : null;
      const free = !!caution && caution.level >= 2 && caution.level < 4 && wear >= 0.35;
      return wear >= CUE_WEAR || wrongTread || free;
    }
    // `frac` is the distance BAR's fill (js/ui/hud.js --pit-dist): 0 at the
    // start of a countdown, 1 at its end. The last cue given to the local car
    // is kept (lastCue) so the engineer can wait while it is giving a direction.
    function cue(c) {
      const r = cueOf(c);
      if (c && c.local) _lastCue = r;
      return r;
    }
    function cueOf(c) {
      if (!enabled() || !c || !c.local || c.retired || c.finished) return null;
      const st = c.pitState || "none";
      if (st === "box") return { phase: "box", text: "STOP", dist: 0, frac: 1 };
      if (st === "lane") {
        // APPROACHING THE BOX AND NOT IN THE LANE: say which way. A stop that
        // silently does not happen is the cruellest thing this module could
        // ship — the driver did everything else right and gets no reason.
        const togo = toBox(c);
        if (togo > -BOX_TOL && togo < BOX_CUE_M) {
          Tracks.sample(G.track, c.s, _smp);
          const zz = z(), frac = 1 - togo / BOX_CUE_M;
          // FAR OUT: the box is coming, and the lane you want is the one you
          // are in. Count it down; do not ask for the working lane yet.
          if (togo > MOVE_M) {
            return { phase: "lane", text: "STAY IN LANE · BOX " + Math.round(togo) + "m", dist: togo, frac };
          }
          if (!inBoxLat(c, _smp.hw || 0, zz.side)) {
            return { phase: "keep", text: zz.side > 0 ? "KEEP RIGHT" : "KEEP LEFT", dist: 0, frac };
          }
          // WHERE THE BOX IS. This distance was already being computed here and
          // thrown away to show the speed limit instead — so the one number a
          // driver cannot possibly work out was the one the HUD withheld. There
          // is no mark on the road, and since each team's box sits at its own
          // place in the row, a player cannot even learn a fixed distance from
          // the line: it depends which car they are in.
          teach("gate", "STOP ON THE GLOWING GATE");
          // PULL IN: the working lane is one more step toward the wall, and
          // this is the moment to take it — the box is the next thing.
          if (togo > BOX_TOL) {
            return { phase: "near-box", text: "PULL IN · " + Math.round(togo) + "m", dist: togo, frac };
          }
          // AT THE BOX. A stop needs the car SQUARE in it, so when it is not,
          // say THAT rather than "STOP HERE" — a driver stopped on the right
          // arc, crooked or half a lane wide, would otherwise be told they had
          // arrived and then get no stop and no reason.
          return boxSquare(c, _smp, zz.side)
            ? { phase: "stop", text: "STOP HERE", dist: 0, frac: 1 }
            : { phase: "square", text: "SQUARE IT UP", dist: 0, frac: 1 };
        }
        // Past the box by more than the latch allows: no crew here, go round.
        if (togo < -BOX_TOL * 2) return { phase: "missed", text: "BOX MISSED", dist: togo, frac: 0 };
        teach("line", "HOLD THE LANE — STOP AT YOUR CREST");
        // STAY IN LANE, all the way from the line to the box: the instruction
        // is continuous, and the limit rides along with it.
        return { phase: "lane", text: "STAY IN LANE · " + Math.round(limitKphShown()) + " LIMIT", dist: 0, frac: 0 };
      }
      if (st === "out") {
        // THE EXIT ROAD used to be silence — and it is where a serviced car
        // rejoins at the limit into traffic at racing speed. GO for a moment
        // after the release; MERGE, naming the car, while one is closing on
        // the track side; otherwise the metres to the end of the road.
        if ((c.pitOutT || 0) > 0) return { phase: "served", text: "GO GO GO", dist: 0, frac: 1 };
        const o = closingCar(c);
        if (o) return { phase: "merge", text: "MERGE — " + (o.code || "CAR") + " CLOSING", dist: 0, frac: 1 };
        const m = toExit(c);
        return m > 0 ? { phase: "out", text: "EXIT " + Math.round(m) + "m", dist: m, frac: clamp(1 - m / exitLen(c), 0, 1) } : null;
      }
      const d = toEntry(c);
      if (d < 0 || d > CUE_M) return null;
      if (c.pitArmed) {
        // …AND WHAT WILL BE FITTED. The stop is booked by a gesture, and a
        // driver could not tell a wet stop from a slick stop until the wheels
        // were on. Armed beats the wear gate: a stop that IS called is shown.
        const next = nextFor(c);
        // "BOX BOX" as the engineer says it (see the note in engineer.js): the
        // repeat is the call, and it reads as a radio instruction rather than
        // as a label on the screen.
        return { phase: "armed", text: "STAY IN LANE · BOX BOX" + (next && next.code ? " — " + next.code : ""), dist: 0, frac: 1 };
      }
      if (!worthStopping(c)) return null;
      // ON THE ENTRY ROAD — the peel on the complex (sA→sIn), or the first
      // COMMIT_M past the line on a painted lane — say what to DO, not a
      // distance: the instruction is the lane, and holding it is the gesture.
      if (roadOf(c) === "entry" || (d === 0 && throughM(z(), c.s, G.track.total) <= COMMIT_M)) {
        // SAY WHAT TO DO, not just where you are. "PIT ENTRY" names the place
        // and assumes you already know the gesture — and the gesture is the one
        // thing nobody can guess, because there is no button to find. The first
        // time it is spelt out; after that the short form, since by then the
        // instruction is noise.
        teach("road", "PIT ENTRY — TAKE THE PIT ROAD TO BOX");
        return { phase: "enter", text: "HOLD THE LANE", dist: 0, frac: 1 };
      }
      if (d === 0) return null;   // in the window but past the entry road
      return { phase: "near", text: "PIT " + Math.round(d) + "m", dist: d, frac: 1 - d / CUE_M };
    }

    /** A stopping envelope onto the box: how fast a car may be HERE and still be
     *  stopped by the time it arrives. AI-ONLY by contract — game.js applies it
     *  only to `!c.human`, because braking onto the mark is the player's job. */
    function approachV(c) {
      // Serviced (or being serviced): the envelope is spent. It used to hold a
      // car that had stopped short of the box's centre — inside the tolerance,
      // the stop latched — at ZERO after the tyres went on, until a rescue
      // pulsed it past the mark (every stop, both circuits measured).
      if (c.pitState === "out" || c.pitState === "box") return Infinity;
      const togo = toBox(c);
      if (togo < 0) return Infinity;                 // not in the window, or past the box
      const v = Math.sqrt(2 * BOX_BRAKE * Math.max(0, togo - BOX_TOL * 0.5));
      if (v >= CRAWL_V) return v;
      // Not laterally in the box yet: keep crawling (CRAWL_V) so the lateral
      // pull can still land it; past the box it goes round again. This asks
      // `inBoxLat`, the ACHIEVABLE test, and must keep asking it — see the
      // note in boxSquare for what asking the strict one did to the AI.
      Tracks.sample(G.track, c.s, _smp);
      return inBoxLat(c, _smp.hw || 0, z().side) ? v : CRAWL_V;
    }

    /** The APPROACH envelope onto the entry line: how fast an armed car may be
     *  HERE and still be at the limit when the limiter meets it. AI-ONLY by
     *  contract, like approachV — game.js applies it to `!c.human` — and only
     *  ahead of the line: a car armed a lap early keeps its racing speed. */
    function entryV(c) {
      const d = toEntry(c);
      if (!(d > 0)) return Infinity;
      const lim = limit();
      return Math.sqrt(lim * lim + 2 * ENTRY_BRAKE * Math.max(0, d - 4));
    }

    /** The EXIT ROAD's hold: the limit until the blend has brought a serviced
     *  car inside the road edge. Where the road turns in soon after the exit
     *  line the blend is ROAD_MIN long (Bahrain: 30 m into T1), and a car
     *  released to racing speed at the line ran off its end onto the grass
     *  (21 of 21 exits, measured). AI-only by contract, like entryV. */
    function exitV(c) {
      if (!c || c.pitState !== "out" || roadOf(c) !== "exit") return Infinity;
      Tracks.sample(G.track, c.s, _smp);
      return Math.abs(c.x || 0) > (_smp.hw || 0) - 0.5 ? limit() : Infinity;
    }

    /** Which pit ROAD this car is on outside the window — "entry" (the peel,
     *  sA→sIn) or "exit" (the blend, sOut→sB) — or null. The ribbon exists on
     *  both, the limiter on neither. */
    function roadOf(c) {
      const p = G.track && G.track.pit;
      if (!p || !c || p.painted) return null;
      const L = G.track.total;
      if (inWindow({ sIn: p.sA, sOut: p.sIn }, c.s, L)) return "entry";
      if (inWindow({ sIn: p.sOut, sOut: p.sB }, c.s, L)) return "exit";
      return null;
    }

    /** Is this car serving a stop right now? A STATE, not a position — so a car
     *  merely running wide on the start/finish straight never gets the limiter,
     *  and a car beached off the road never reads as pitting. */
    function inLane(c) {
      if (!c) return false;
      if (c.pitState === "lane" || c.pitState === "box") return true;
      // Serviced and driving away: still IN the lane until the exit line —
      // the limiter stays on and the car stays on the pit road, because now
      // there is a wall between it and the track. update() clears the state
      // the moment the car leaves the window.
      return c.pitState === "out" && inWindowOf(c);
    }

    /** Is the pit limiter holding this car? `inLane` plus the EXIT ROAD, which
     *  a served car is still on after the window ends — one predicate, because
     *  everything the lane forbids it forbids for exactly this long: the speed
     *  cap (game.js), and overtake and X-mode, which are not a driver's to use
     *  between the entry line and the exit. It lifts at the exit, not at the
     *  box, so a car cannot light the boost up on its way out of the complex. */
    function held(c) {
      return inLane(c) || (!!c && c.pitState === "out" && roadOf(c) === "exit");
    }

    /** Inside the window at all — the arc test alone, without the lateral one. */
    function inWindowOf(c) {
      const zz = z(), t = G.track;
      return !!(zz && t && c && inWindow(zz, c.s, t.total));
    }

    function arm(c, on) {
      if (!c || !enabled()) return false;
      c.pitArmed = on == null ? !c.pitArmed : !!on;
      // The place the stop was called from: what it cost is said at the release.
      if (c.pitArmed && !(c.pitPos0 > 0)) c.pitPos0 = rankOf(c);
      return c.pitArmed;
    }
    function rankOf(c) { const r = G.ranked; return r ? r.indexOf(c) + 1 : 0; }
    /** The release. The chip says GO for SERVED_S, and a LOCAL car gets the
     *  stop summarised — the time held, the place it comes out in and what the
     *  stop cost: numbers the game always had and never said. A completed stop
     *  also ends the teach. */
    function release(c, zz) {
      c.pitOutT = SERVED_S;
      if (!c.local) return;
      const pos = rankOf(c), k = c.pitPos0 > 0 && pos > 0 ? c.pitPos0 - pos : 0;
      const places = k === 0 ? "" : ", " + (k > 0 ? "+" : "") + k + (Math.abs(k) === 1 ? " PLACE" : " PLACES");
      // The stop's REAL length, work included: a summary that reported 2.2 s
      // after twenty seconds in the garage would be the one number the driver
      // knows is wrong.
      const held = zz.boxS + (c.pitWorked || 0);
      if (G.announce) G.announce("STOP " + held.toFixed(1) + "s" + (c.pitWorked > 0 ? " — WORK DONE" : "") + (pos > 0 ? " — P" + pos + places : ""), 2.2, "race");
      c.pitPos0 = 0; c.pitWorked = 0;
      if (G.store && G.store.set) G.store.set("pitTaught", 1);
    }

    // ── WORKING ON THE CAR MID-STOP ──────────────────────────────────────────
    // Asked: a button, while pitting, that opens the GARAGE to change parts or
    // the set-up. Real F1 cannot: a part change is a garage job and the car is
    // out of the race for minutes, which is why the regulations do not need to
    // forbid it. So the honest game version is not "no" — it is that work COSTS
    // TIME. The hold is extended by WORK_S, once, and only if something
    // actually changed: opening the garage to look at the car is free, and a
    // stop you spent fifteen seconds on is a stop the field drove past.
    const WORK_S = 15;
    /** Can this car be worked on right now? The LOCAL player only, stopped in
     *  its own box, while the crew is still on it. Not on the way in, not on
     *  the way out: the car is on jacks for exactly this window. */
    function canWork(c) {
      return !!(c && c.local && !c.retired && !c.finished &&
                c.pitState === "box" && (c.pitT || 0) > 0);
    }
    /** Charge the stop for the work and return the seconds added. Idempotent in
     *  the sense that matters: the caller decides whether anything CHANGED, and
     *  a visit that changed nothing must not call this at all. */
    function addWork(c) {
      if (!canWork(c)) return 0;
      c.pitWorked = (c.pitWorked || 0) + WORK_S;
      c.pitT = (c.pitT || 0) + WORK_S;
      return WORK_S;
    }

    // Is this car, RIGHT NOW, holding the line into the pits? Pure apart from
    // the track sample, and each clause is one way of not meaning it — see the
    // COMMIT_* block for which. Order matters only for cost: the cheap
    // rejections come first so the spline sample is reached by almost nobody.
    const _smp = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
    /** How wide the lane is here — the full width on a widened track (the lane
     *  IS the added tarmac), the yielding width on one that was not. */
    function lw(hw) { return laneWidthOn(G.track, hw); }
    /** The lane's inner edge — the painted line — as a lateral x. On a widened
     *  track this lands exactly where the road edge USED to be, which is what
     *  makes the racing surface unchanged and the lane genuinely new road. */
    function laneEdge(hw, side) { return (hw - lw(hw)) * side; }
    /** THE SEPARATE RIBBON at this arc position, or null. On the 34 circuits
     *  whose walls leave room, Tracks builds a second road beside the racing
     *  surface and this is where it is; everywhere else there is only paint.
     *
     *  EVERYTHING MOVES ONTO IT. Where a car serving a stop SITS, where its box
     *  is, and — since the complex (TrackPit) gave the lane a real ENTRY ROAD
     *  that peels off the racing surface — the COMMITMENT too: a driver takes
     *  the entry road they can see, and being on it is the commitment
     *  (`committing`, COMMIT_IN). The commitment stayed on the painted line
     *  inside the road for a while after the ribbon existed, and that line,
     *  3.2 m in from the edge, is racing surface: holding it for half a second
     *  armed the limiter on the pit straight — from the grid, on every circuit. */
    function ribbonAt(s) {
      if (typeof Tracks === "undefined" || !Tracks.pitLaneAt || !G.track || s == null) return null;
      return Tracks.pitLaneAt(G.track, s);
    }
    /** The BOX's lateral centre: where a car serving a stop sits, and the
     *  number a driver, a test or an agent aims at. On the complex that is the
     *  working lane; on a painted lane, the strip's middle. */
    function laneCentre(hw, side, s) {
      const rib = ribbonAt(s);
      if (rib) return rib.workCentre != null ? rib.workCentre : rib.centre;
      return (hw - lw(hw) * 0.5) * side;
    }
    /** The FAST lane's centre — where a car transits the complex at the
     *  limiter between the entry and its box — and, on the ENTRY and EXIT
     *  ROADS, the line onto and off it: the wall line plus half the fast band
     *  (the road edge plus the same, while the wall is still growing), blended
     *  with a line ROAD_IN inside the road edge by the ribbon's width, so the
     *  peel and the blend are ONE continuous target a yaw-limited heading can
     *  follow. The ribbon's own centre was the target on both roads, and it
     *  sits 3.75 m off the road edge the moment the ribbon exists: the AI
     *  lagged it outward onto the grass on nearly every exit (15 of 18 stops
     *  on Bahrain, rescued back onto the road). Falls back to the box line. */
    function laneDrive(hw, side, s, lead) {
      const rib = ribbonAt(s);
      if (!rib) return laneCentre(hw, side, s);
      const p = G.track.pit;
      // `lead` (the ENTRY road): the wall line where the wall WILL stand, so
      // the car is on the lane side of it before it grows — it grows over the
      // road's last `grow` metres (16 m on Bahrain), faster than a heading can
      // follow, and a car still on the road side when it stood was clamped to
      // its track face and left on the verge (traced). Off the exit road the
      // target follows the wall DOWN, the line a car can actually hold.
      const inner = rib.inner * side + (lead ? p.off.fastIn * (1 - rib.v) : 0);
      const fastC = inner + p.bands.fast * 0.5;
      const roadC = hw - ROAD_IN;
      let x = roadC + (fastC - roadC) * rib.w;
      // Off the exit road, while the EXIT WALL stands (the ribbon at least
      // EXIT_WALL_W of its width), the line stays on the lane side of it —
      // the wall slides to the road edge with its own fade (verge · v) — and
      // from where the wall ends it blends from THAT line to the road, not
      // from the lane's centre: a target that jumped inward when the wall
      // ended left the car a heading to build and 2.8 m behind it (traced).
      if (!lead) {
        const hold = hw + p.bands.verge * rib.v + 1.45;
        if (rib.w >= EXIT_WALL_W) x = Math.max(x, hold);
        // Squared, so the target drops fastest the moment the wall ends and
        // is inside the road edge with the ribbon still under the car: a
        // sub-linear blend (0.6) held it out longest exactly where the car
        // has the least road left, and every stop ended on the grass (traced).
        else x = roadC + (hold - roadC) * Math.pow(rib.w / EXIT_WALL_W, 2);
      }
      return side * x;
    }
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
      const rib = ribbonAt(c && c.s);
      // On the complex the threshold is the lane's INNER EDGE less the same
      // tolerance: a car whose centre is BOX_LAT inside the line still has
      // most of itself on the pit road. No floor is needed — the lane is always
      // outside `hw`, so the racing line can never satisfy it, which is what
      // the floor below exists to guarantee on a painted lane.
      if (rib) return (c.x || 0) * side >= rib.inner * side - BOX_LAT;
      return (c.x || 0) * side >= Math.max(1, hw - lw(hw) - BOX_LAT);
    }
    /** Laterally IN THE BOX: the WORKING lane (F1 SR B1.7.1(e) — the inner
     *  lane is the only place work is done). A car halted in the fast lane
     *  has not reached its box, exactly as it would not in the real thing.
     *  On a painted lane there is one strip and this is inLaneLat. */
    function inBoxLat(c, hw, side) {
      const rib = ribbonAt(c && c.s);
      if (rib && rib.workIn != null) return (c.x || 0) * side >= rib.workIn * side - BOX_LAT;
      return inLaneLat(c, hw, side);
    }
    /** Is THIS car's box already occupied by someone else? One bay per team
     *  means the only car that can take yours is your team-mate, but the test
     *  is on the BOX ARC rather than on the team so a future row that shares a
     *  bay any other way is covered by construction. A car on the jacks holds
     *  it; a car merely queueing does not, or two waiting cars would deadlock. */
    function boxBusy(c) {
      const zz = z(), t = G.track;
      if (!zz || !t || !c) return false;
      const cars = G.cars;
      if (!cars || cars.length < 2) return false;
      const mine = boxThroughFor(c, zz, t.total);
      for (let i = 0; i < cars.length; i++) {
        const o = cars[i];
        if (o === c || !o || o.retired || o.pitState !== "box") continue;
        if (Math.abs(boxThroughFor(o, zz, t.total) - mine) < 1e-6) return true;
      }
      return false;
    }

    /** SQUARE IN THE BOX — the stop's real lateral condition, for every car.
     *
     *  `inBoxLat` only asks that the car has REACHED the working lane, and on
     *  its own it let a stop happen anywhere from the corridor edge to the
     *  garage wall, at any angle. Two more things have to be true before a crew
     *  can work on a car: it is centred on its OWN box (the row is a row —
     *  `laneCentre` reads this car's), and its nose points down the lane.
     *
     *  The angle is checked only where a live heading exists. `c.head` is the
     *  world heading the bicycle model integrates for the local player
     *  (js/game.js); an AI's is written at resets and rescues only, so reading
     *  it for an AI would fail a stop on a stale number rather than on how the
     *  car is actually parked. What binds the AI is the lateral test above it,
     *  and `laneX` now finishes its move SQUARE_BY_M before the box so the car
     *  arrives on the centre instead of four fifths of the way across. */
    function boxSquare(c, smp, side) {
      if (!inBoxLat(c, (smp && smp.hw) || 0, side)) return false;
      // THE STRICT TEST IS THE DRIVER'S. An AI is placed by `laneX` and arrives
      // at a crawl, where its steering authority is almost nothing, so asking
      // it for the box's CENTRE is asking for something it cannot do — and a
      // gate you cannot pass is a deadlock, not a standard. Measured both ways
      // on a 6-lap Bahrain with the field stopping (scratch/pit-traffic.cjs):
      // gating the latch on it stopped all twelve AI 4 m short of their own box
      // at x −15.5 against a centre of −18.25, stopped, and a stopped car
      // cannot steer; letting them CRAWL until square instead filled the lane
      // with fourteen cars over 16 sim minutes and never cleared it. What
      // makes an AI park straight is its LINE — `laneX` finishes its move
      // SQUARE_BY_M before the box — not a test at the end of it.
      if (!c.local) return true;
      const want = laneCentre((smp && smp.hw) || 0, side, c && c.s);
      if (Math.abs((c.x || 0) - want) > BOX_SQUARE_LAT) return false;
      if (!(Number.isFinite(c.head) && smp && smp.t)) return true;
      let rel = c.head - Math.atan2(smp.t[0], smp.t[2]);
      while (rel > Math.PI) rel -= 2 * Math.PI;
      while (rel < -Math.PI) rel += 2 * Math.PI;
      return Math.abs(rel) <= BOX_SQUARE_RAD;
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
      if (!zz || !c) return want;
      // GUIDED: a car serving a stop (the limiter's own set), a serviced car
      // still on the EXIT ROAD, and an armed AI on the ENTRY ROAD — the lane
      // peels off the racing surface there, and an AI that only turned in at
      // the entry line crossed the verge and the wall band to reach it, then
      // crossed them back the moment the exit line cleared its state.
      const road = roadOf(c);
      const guided = inLane(c) || (c.pitState === "out" && road === "exit") ||
                     (!c.human && c.pitArmed && road === "entry");
      if (!guided) {
        // THE APPROACH: an armed AI holds the pit side of the road for the
        // last APPROACH_M before the entry road, so the peel starts from the
        // edge and not from the racing line. Not from a lap away: an AI armed
        // past its own box stays on the racing line until next time round.
        const p = G.track && G.track.pit;
        if (!c.human && c.pitArmed && p && !p.painted && road == null && !inWindowOf(c)) {
          const d = toEntry(c) - p.entryRoadM;
          if (d > 0 && d < APPROACH_M) return (hw - ROAD_IN) * zz.side;
        }
        return want;
      }
      // The FAST lane through the complex, the WORKING lane for the last
      // stretch into the box — and the fast lane again the moment the stop is
      // done — the move a real stop makes.
      const togo = inWindowOf(c) ? toBox(c) : -Infinity;
      const fast = laneDrive(hw, zz.side, c.s, road === "entry");
      if (c.pitState === "out" || !(togo > -BOX_TOL && togo < WORK_IN_M)) return fast;
      // The diagonal: the fast lane WORK_IN_M out, the working lane's centre
      // SQUARE_BY_M BEFORE the box — not at it. The move used to finish at the
      // box itself, and since the AI halts BOX_TOL/2 short, it parked four
      // fifths of the way across: inside `inBoxLat`'s line, which was all the
      // latch asked, but not in its bay. Now the car is on the centre before it
      // arrives and stops square, which is what `boxSquare` requires of it.
      const span = Math.max(1, WORK_IN_M - SQUARE_BY_M);
      const u = Math.min(1, Math.max(0, (WORK_IN_M - togo) / span));
      return fast + (laneCentre(hw, zz.side, c.s) - fast) * u;
    }
    function committing(c, zz, L) {
      if (c.offroad || c.wrongWay || c.rescueT > 0) return false;
      if (!((c.speed || 0) > G.vTop() * COMMIT_V)) return false;
      // ANYWHERE FROM THE WINDOW OPENING UP TO YOUR OWN BOX. It used to be the
      // first COMMIT_M metres only — "past this you have gone by the entry road
      // and are racing the straight" — and that made a stop at the START of a
      // lap impossible on half the calendar: the GRID SITS INSIDE THE WINDOW
      // (pole 14 m before the line), so on a long-entry circuit every car begins
      // past the entry road. Measured: at Monza and Hungaroring pole starts at
      // through 386 and the back of the grid at 218, against a 0-120 commit
      // zone. Nobody could call a stop from the grid at all.
      //
      // Committing after your own box is still refused, because there is
      // nothing left to commit TO. What stops a car that merely ran wide from
      // calling a stop is the other three conditions, which are untouched: far
      // over the painted line, HELD for COMMIT_S, and moving forwards on the
      // road. Those are what carry the guard; the arc limit never did much
      // beyond excluding the grid.
      // (On the entry road, before the line, `at` would wrap to a lap: the box
      // is ahead by construction.)
      const at = inWindowOf(c) ? throughM(zz, c.s, L) : -1;
      if (at > boxThroughFor(c, zz, L) - COMMIT_CLEAR) return false;
      // ON THE LANE'S OWN TARMAC where there is one: the complex's entry road
      // peels off the racing surface, and a driver commits by driving onto it —
      // the car's centre COMMIT_IN past the lane's inner edge, which is the
      // road edge at the peel and the wall line once the wall has grown. A car
      // anywhere on the road, grid slots included, can never satisfy it.
      const rib = ribbonAt(c.s);
      if (rib) return (c.x || 0) * zz.side >= rib.inner * zz.side + COMMIT_IN;
      Tracks.sample(G.track, c.s, _smp);
      // INSIDE THE PAINTED LANE, not past an abstract fraction of the road. The
      // commitment test and the stripe a driver can see are the same line,
      // which is the whole point of painting it: before this, the gesture asked
      // you to aim at nothing.
      const hw = _smp.hw || 0;
      return (c.x || 0) * zz.side >= laneEdge(hw, zz.side) * zz.side;
    }

    /** The numbers the lit shaders paint THIS CAR's BOX from: how far into the
     *  window it sits, and how long it is. Null when there is no lane, or no
     *  car with a team to have a box in the row.
     *
     *  It is the PLAYER's box and not the whole row on purpose. A real lane is a
     *  row of garages and drawing all twelve would be more faithful — but the
     *  question a driver is actually asking at 80 km/h is "which one is mine",
     *  and eleven boxes that are not theirs answer it worse than one that is. */
    function boxUniform() {
      const zz = z(), t = G.track, car = G.player;
      if (!enabled() || !zz || !t || !car) return null;
      if (t.pit && !t.pit.painted) return null;
      return [boxThroughFor(car, zz, t.total), BOX_TOL * 0.75];
    }

    /** The four numbers the lit shaders paint the PAINTED lane from, or null.
     *  A built track carries the complex, whose tarmac and paint are geometry
     *  (TrackMesh.buildPitLane), so this is null wherever there is a ribbon —
     *  street circuits included, since they build the STREET set. Only a
     *  `pit.mode: "narrow"` model is `painted` and keeps the shader lane, as
     *  does a track built without a model. */
    function laneUniform() {
      const zz = z(), t = G.track;
      if (!enabled() || !zz || !t) return null;
      if (t.pit && !t.pit.painted) return null;
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
      // A FINISHED car still runs the machine: one held in its box at the
      // flag is serviced and released, one on the lane keeps its state to the
      // exit (game.js coasts it down the lane). They used to freeze in
      // whatever state the flag found them and pile up in the lane.
      if (!c || !enabled() || c.retired) return;
      const st = c.pitState || "none";
      const zz = z(), L = G.track.total;
      if (st === "out" && c.pitOutT > 0) c.pitOutT = Math.max(0, c.pitOutT - dt);   // the GO chip's clock
      // The player's reference plan is re-cut once per lap (replan).
      if (c.local && c.human && c.pitPlan && c.lap !== c._planLap) { c._planLap = c.lap; if ((c.lap || 0) > 1) replan(c); }
      // The commitment lands: armed, the crew told what to ready. With no
      // button there is no other moment the compound choice becomes visible.
      const commitNow = () => {
        c.pitCommitT = 0; c.pitCommitted = true;
        arm(c, true);
        const next = nextFor(c);
        if (G.announce) G.announce("PIT ENTRY — LIMITER ON" + (next ? " — " + next.code : ""), 1.6, "race");
      };
      if (!inWindowOf(c)) {
        // A serviced car keeps "out" down the EXIT ROAD past the exit line, so
        // laneX guides it off the lane where the ribbon blends back (the
        // limiter is already off: inLane's "out" clause needs the window).
        if (st === "out" && roadOf(c) === "exit") return;
        // Left the window. A car that was in the box and never finished the stop
        // (a red flag, a reset) is released rather than stuck holding. A LOCAL
        // car's commitment is per pass: a stop it did not make is not carried
        // to the next lap, where the limiter would meet it at the line. An
        // AI's plan (pitArmed) is, by design — it comes in next time round.
        // THE `st !== "none"` GUARD IS LOAD-BEARING, and a 2026-09-20 survey
        // finding that called the local clear "wrongly conditional" is wrong.
        // THE ENTRY ROAD IS OUTSIDE THE WINDOW — that is why the commit logic
        // below lives in this branch — so this runs every tick while a car
        // approaches. Clearing pitArmed/pitCommitted unconditionally here wipes
        // the commitment made on the previous tick before the block below can
        // read it, and the commit/abort state machine never advances.
        // tests/unit/pit-lane-vm.test.mjs:101 catches it in one assertion.
        if (st !== "none") { c.pitState = "none"; c.pitT = 0; if (c.local) { c.pitArmed = false; c.pitCommitted = false; } }
        // THE ENTRY ROAD, before the entry line: where a LOCAL car commits —
        // holding the lane's tarmac arms the stop, and the limiter waits for
        // the line — and where it can still change its mind, by holding the
        // road again for ABORT_S; past the line the wall stands between the
        // two. (An AI is armed by its plan and steered onto the road by laneX.)
        if (c.local && roadOf(c) === "entry") {
          if (!c.pitArmed) {
            c.pitCommitT = committing(c, zz, L) ? (c.pitCommitT || 0) + dt : 0;
            if (c.pitCommitT >= COMMIT_S) commitNow();
          } else if (c.pitCommitted) {
            Tracks.sample(G.track, c.s, _smp);
            c.pitAbortT = inLaneLat(c, _smp.hw || 0, zz.side) ? 0 : (c.pitAbortT || 0) + dt;
            if (c.pitAbortT >= ABORT_S) {
              c.pitAbortT = 0; c.pitCommitted = false; c.pitArmed = false;
              if (G.announce) G.announce("PIT ENTRY ABORTED", 1.4, "race");
            }
          }
        }
        return;
      }
      if (st === "box") {
        c.pitT = (c.pitT || 0) - dt;
        if (c.pitT <= 0) { c.pitState = "out"; c.pitT = 0; release(c, zz); }
        return;
      }
      if (st === "out") return;                       // serviced; drive away
      // NO BUTTON: the driver commits by holding the line into the pits. Only
      // the local player — an AI car is armed by its own strategy (think), and
      // a networked rival is integrated by its owner, so neither steers itself
      // into a stop here.
      if (!c.pitArmed && c.local) {
        c.pitCommitT = committing(c, zz, L) ? (c.pitCommitT || 0) + dt : 0;
        if (c.pitCommitT >= COMMIT_S) commitNow();
      }
      if (!c.pitArmed && !inLane(c)) return;          // not coming in
      const at = throughM(zz, c.s, L), boxAt = boxThroughFor(c, zz, L);
      // Armed but already PAST its own box — an AI's plan fires at the lap
      // tick, and the line sits inside the window, past the row on most
      // circuits: nothing to stop for this pass. Stay armed and unlimited, and
      // come in next time round. (It used to take the limiter for the rest of
      // the window, leave still armed, and stop a lap later.)
      if (st === "none" && at > boxAt + BOX_TOL * 2) return;
      // …and, on the complex, armed but NOT ON THE LANE: the wall stands past
      // the entry line, so a car still on the racing surface here cannot get
      // in this time round — it races on and takes the entry road next lap.
      // An AI whose plan fired at the line (the grid sits inside the window,
      // Bahrain: at 151 m, box ahead) used to turn in through the wall: on the
      // limiter on the racing line, clamped to the wall's track face, off-road
      // on the verge, and rescued into the lane (11 stops of 21, measured).
      if (st === "none" && ribbonAt(c.s)) {
        Tracks.sample(G.track, c.s, _smp);
        if (!inLaneLat(c, _smp.hw || 0, zz.side)) return;
      }
      // Called the stop and reached the window: the limiter is on from here.
      c.pitState = "lane";
      // WAIT YOUR TURN. Teammates SHARE a box — the row is one bay per team, by
      // design — so two cars of one team stopping on the same lap aim at the
      // same patch of tarmac, and the second drove into the first. Measured on
      // a 6-lap Bahrain with the field stopping (scratch/pit-traffic.cjs):
      // Audi and Cadillac both had their pair in the complex at once. A busy
      // box is not a box: the car keeps its limiter and its lane, misses the
      // latch below, and takes the stop on the next pass of it — which is what
      // a real crew's "hold, hold" is.
      if (boxBusy(c)) return;
      // The box: reached when the car has driven far enough in — and not too
      // far: a car halted two garages down is not at its crew — and only once
      // slow enough to have actually STOPPED there. Blowing through the box at
      // the limit misses the stop, exactly as it would in the real thing.
      if (at >= boxAt - BOX_TOL && at <= boxAt + BOX_TOL * 2 && Math.abs(c.speed) < G.vTop() * BOX_SPEED_FRAC) {
        // AND IN THE LANE. Sampled only here, after the two cheap tests, so the
        // spline read costs one car for one tick per stop. A car stopped on the
        // racing line has not reached its box — the crew is not standing there
        // — which is also what makes the stop cost the lateral move rather than
        // handing it over for free.
        Tracks.sample(G.track, c.s, _smp);
        if (!boxSquare(c, _smp, zz.side)) return;
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
      const want = TyreModel.treadFor(G.raceWeather, G.roadWetness && G.roadWetness());
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
        return G.tyres.planLaps(r.life, G.lapsTarget) >= lapsLeft;
      });
      const pool = lasts.length ? lasts : right;
      return pool.reduce(function (best, r) {
        if (!best) return r;
        return lasts.length ? (r.life < best.life ? r : best)
                            : (r.life > best.life ? r : best);
      }, null);
    }

    // A selected compound is a preference, not permission to fit the wrong
    // tread after the weather changes. Resolve it once for every surface that
    // names or fits the set, so the entry radio, armed cue and crew agree.
    function nextFor(c) {
      const automatic = c && (c.local || c.pitNext) ? pickFor(c) : null;
      const selected = c && c.pitNext;
      if (!selected || !automatic) return selected || automatic;
      return (selected.tread || 0) === (automatic.tread || 0) ? selected : automatic;
    }

    // What a stop actually does. One place, so a player stop, an AI stop and a
    // test-driven stop cannot diverge.
    function serviceCar(c) {
      // An AI car's next set was chosen by its plan (setNext); a PLAYER's is
      // chosen here, from what they own and what the race needs. Refitting
      // c.tyreOpt unconditionally — which is what this did — meant a player who
      // stopped in the rain bolted on another slick, the exact loop the AI's
      // weather rule exists to prevent.
      const next = nextFor(c);
      G.tyres.fit(c, next || (c.tyreOpt ? G.tyres.optionRecord(c.tyreOpt) : G.tyres.classRecord(c.tyreClass || "medium")));
      c.pitNext = null;
      // No banner here: this runs as the car STOPS, and "GO GO GO" at the start
      // of the hold was a lie for the whole of it. The release says it (release).
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
    /** The lap the pit loss is measured against. `G.referencePole()` is the
     *  curvature-integrated lap (Quali.lapTime), so it knows Monaco from Monza;
     *  the old `total / (0.55·vTop)` was a flat fraction of TOP speed and could
     *  not — it ran 2 % long at Monaco and 16 % at Spa, always in the direction
     *  that made a stop look cheap. Race pace is a few per cent off a pole lap
     *  (fuel, tyres, no tow): 1.03 puts Bahrain at 123.9 s against a measured
     *  124.1. Falls back to the old estimate where no pole model is wired. */
    const RACE_PACE = 1.03;
    function referenceLapS() {
      const pole = G.referencePole ? G.referencePole() : 0;
      if (pole > 0) return pole * RACE_PACE;
      const t = G.track;
      return t && t.total > 0 ? t.total / Math.max(1, G.vTop() * 0.6) : 100;
    }

    function planFor(roll, player, laps) {
      const zz = z();
      if (!zz) return null;
      // ONE loss, the same one the STRATEGY row shows. This used to carry its
      // own second formula (a 0.55·vTop reference against the HUD's 0.75), so
      // the planner priced a stop at 7.3 s, the player was told 9.0, and the
      // race charged 15.0 — measured, docs/research/PIT-NEXT-STEPS-2026-09.md §4f.
      const loss = lossS();
      const n = laps > 0 ? laps : G.lapsTarget;
      const lapRefS = referenceLapS();
      const pitLossLaps = clamp(loss / Math.max(1, lapRefS), 0.02, 0.9);
      // THE PLAYER'S plan is a REFERENCE — the plan the pit wall would run —
      // never executed (think() keeps its human guard): it honours the stop
      // count the STRATEGY row pinned for this circuit, if any.
      const pin = player ? pinnedStops() : null;
      const plan = AiDrive.stintPlan({
        laps: n,
        lifeLaps: (cls) => G.tyres.planLaps(TyreModel.AI_CLASS[cls].life, n),
        pitLossLaps, roll, stops: pin,
      });
      if (plan) { plan.pitLossLaps = pitLossLaps; plan.pin = pin; }
      return plan;
    }
    /** The STRATEGY row's pin for this circuit: a stop count, or null for AUTO. */
    function pinKey() { const t = G.track, d = t && t.def; return "pitPlan." + ((d && d.id) || (t && t.id) || "track"); }
    function pinnedStops() {
      const v = G.store && G.store.get ? G.store.get(pinKey(), "auto") : "auto";
      return v == null || v === "auto" ? null : Math.max(0, Math.min(2, v | 0));
    }
    function setPinnedStops(v) { if (G.store && G.store.set) G.store.set(pinKey(), v == null ? "auto" : (v | 0)); }
    /** The lane's net cost in seconds at racing speed — the number that makes
     *  a 2-stop at Monaco read as the mistake it is. `estimate` refines it
     *  under a caution; this is the plain figure the STRATEGY row shows. */
    function lossS() { return lossAt(STRAIGHT_V); }
    /** …at a given fraction of the envelope for the road outside the lane, so
     *  the caution estimate is the SAME formula at a slower road rather than a
     *  third copy of it (there were three, all different, all under). */
    function lossAt(roadFrac) {
      const zz = z();
      if (!zz) return 0;
      // THE WHOLE COMPLEX IS DRIVEN AT THE LIMIT, not just the lane: game.js
      // clamps the entry road and the exit road off the same number. Counting
      // only `lenM` charged Bahrain 256 m where the car is actually slow for
      // 406, and the planner then bought stops it could not afford.
      const p = G.track && G.track.pit;
      const slowM = p && !p.painted ? p.lenM + p.entryRoadM + p.exitRoadM : zz.lenM;
      // On track that span is taken at PIT-STRAIGHT speed. The lap average is
      // the wrong reference — the pit straight is one of the fastest parts of
      // any circuit, and using the average understates what the lane costs.
      const straight = Math.max(1, G.vTop() * roadFrac);
      // …and the stop also costs the brake down to the limit and the drive back
      // up, which happen OUTSIDE the span. Lost time for a speed change is
      // (v1-v2)^2 / (2*v1) per unit of accel, both ways.
      const aUp = G.aTop ? Math.max(1, G.aTop()) : 12, aDn = G.BRAKE ? Math.max(1, G.BRAKE) : 35;
      const dv = Math.max(0, straight - Math.max(1, limit()));
      const swing = (dv * dv) / (2 * straight) * (1 / aUp + 1 / aDn);
      return Math.max(zz.boxS, slowM / Math.max(1, limit()) + zz.boxS - slowM / straight + swing);
    }

    /** The player's plan, read for the HUD: the stops, the next box lap and
     *  how the race stands against it. Pure of the DOM; hud.js paints it. */
    function planInfo(c) {
      const plan = c && c.pitPlan;
      if (!plan || !enabled()) return null;
      const done = c.pitStops || 0, lap = c.lap || 0, stops = plan.stops || 0;
      const next = plan.lapsAt[done];
      const cls = plan.seq[done + 1], code = cls && TyreModel.AI_CLASS[cls] ? TyreModel.AI_CLASS[cls].code : "";
      const label = stops ? stops + "-STOP" : "NO STOP";
      if (next == null) return { text: "PLAN " + label + (stops ? " · DONE" : ""), state: "", stops, next: null, lapsToStop: null, code };
      const lapsToStop = next - lap;
      const caution = G.cautionInfo ? G.cautionInfo() : null;
      const est = caution && caution.level >= 2 && caution.level < 4 ? estimate(c) : null;
      const busy = !!c.pitArmed || (c.pitState && c.pitState !== "none");
      let state = "", text = "PLAN " + label + " · BOX L" + next + (code ? " " + code : "");
      if (busy) state = "";
      else if (est && est.marginS > 0 && lapsToStop <= (typeof AiDrive !== "undefined" && AiDrive.STRAT ? AiDrive.STRAT.CAUTION_REACH : 6)) { state = "free"; text = "FREE STOP · BOX NOW" + (code ? " " + code : ""); }
      else if (lapsToStop <= 0) { state = "now"; text = "BOX BOX BOX" + (code ? " · " + code : ""); }
      else if (lapsToStop === 1) { state = "soon"; text = "BOX NEXT LAP" + (code ? " · " + code : ""); }
      return { text, state, stops, next, lapsToStop, code };
    }
    /** A rival's window, for the gap chips: "IN" while it is stopping, "P<lap>"
     *  when its planned stop is within three laps, else "". */
    function windowOf(o) {
      if (!o || !o.pitPlan) return "";
      if (o.pitState && o.pitState !== "none") return "IN";
      const n = o.pitPlan.lapsAt[o.pitStops || 0];
      if (n == null) return "";
      const d = n - (o.lap || 0);
      return d >= 0 && d <= 3 ? "P" + n : "";
    }
    /** Once per lap for the local player: re-cut the plan over the laps left,
     *  on the set that is on the car and the life it has left. Adopted only
     *  when the next stop moves by two laps or more — the stagger is a lap by
     *  design — and said once when it is. Advice, so it may change its mind;
     *  the AI's plan does not (its stop reasons are pitNow's three). */
    function replan(c) {
      const plan = c.pitPlan, zz = z();
      if (!plan || !zz || !G.tyres || !c.tyre || typeof AiDrive === "undefined") return false;
      const done = c.pitStops || 0, lap = Math.max(1, c.lap || 1);
      const lapsLeft = G.lapsTarget - lap + 1;
      const oldNext = plan.lapsAt[done];
      if (lapsLeft < 2 || oldNext == null) return false;
      // planLaps, not lifeLaps: the level-free nominal is only right at `real`
      // (1.0), and the SHIPPED DEFAULT is `light` (0.55), where a set lasts
      // 1.82x longer. The first plan (plan(), above) and the pit-now compound
      // pick both learned this; the per-lap re-cut did not, so every replan
      // argued against the plan it was revising and pulled the next stop
      // earlier on tyres the car had not used. See TyreModel.planLaps.
      const lifeLaps = (cls) => G.tyres.planLaps(TyreModel.AI_CLASS[cls].life, G.lapsTarget);
      // `start` must be one of the planner's THREE classes — that is the
      // alphabet AiDrive.stintPlan sequences future stints in — so a player's
      // catalog compound still rounds to the nearest of them here.
      const cls = c.tyre.id && TyreModel.AI_CLASS[c.tyre.id] ? c.tyre.id : (c.tyreClass || "medium");
      /* firstLife DOES NOT ROUND. stintPlan's own contract calls it "the laps
         that set has left — the first stint is run on what is on the car, not
         on a fresh set's life", and it was being derived from `cls`, which for
         every human is the "medium" fallback: a catalog id is not an AI_CLASS
         key and c.tyreClass is null for humans. So a player on any compound had
         the re-cut priced on 0.74 life. A hypersoft (0.30) was planned for
         2.47x the laps it has, and every per-lap replan argued the stop later
         than the tyre could reach. The fitted record carries its own life —
         read that. */
      const fittedLife = Number.isFinite(c.tyre.life) ? c.tyre.life : TyreModel.AI_CLASS[cls].life;
      const firstLife = Math.max(1, G.tyres.planLaps(fittedLife, G.lapsTarget) * (1 - G.tyres.spent(c)));
      const stops = plan.pin != null ? Math.max(0, plan.pin - done) : null;
      const rel = AiDrive.stintPlan({ laps: lapsLeft, lifeLaps, pitLossLaps: plan.pitLossLaps || AiDrive.STRAT.PIT_LOSS_FALLBACK, roll: 0.5,
                                      start: cls, firstLife, stops });
      if (!rel) return false;
      const newNext = rel.stops > 0 ? lap - 1 + rel.lapsAt[0] : null;
      if (newNext != null && Math.abs(newNext - oldNext) < 2) return false;
      if (newNext == null && rel.stops === 0 && plan.stops - done === 0) return false;
      plan.seq = plan.seq.slice(0, done + 1).concat(rel.seq.slice(1));
      plan.stints = plan.stints.slice(0, done).concat(rel.stints);
      plan.stops = done + rel.stops;
      plan.lapsAt = plan.lapsAt.slice(0, done).concat(rel.lapsAt.map((k) => lap - 1 + k));
      if (G.announce) G.announce(newNext != null ? "NEW PLAN — BOX LAP " + newNext : "NEW PLAN — NO MORE STOPS", 2.2, "info");
      return true;
    }

    /** Does this AI car call its stop this tick? The plan says WHEN; AiDrive.pitNow
     *  owns the three reasons to ignore it, and this owns the state they read.
     *  A PLANNED stop arms the moment the lap counter turns — at the line,
     *  which is inside the window — and is served at the END of that lap, the
     *  next time round: "box on lap N". The lap in between costs nothing (an
     *  armed AI is only held to the pit side within APPROACH_M, and entryV is
     *  unbounded that far out), so the hunt counts it as h_armedAtLine, not
     *  as a stop that failed to happen. */
    function think(c) {
      const plan = c && c.pitPlan;
      // A HUMAN's plan is advice (planFor): nothing here ever arms it.
      if (!plan || c.human || c.pitArmed || (c.pitState && c.pitState !== "none")) return "";
      const stopsLeft = plan.stops - (c.pitStops || 0);
      const nextAt = plan.lapsAt[c.pitStops || 0];
      // WRONG TYRE FOR THE CONDITIONS, in either direction: slicks in the rain
      // AND wets on a drying track. This is the recourse docs/PHYSICS.md said a
      // dry->rain arc did not have.
      const wantTread = TyreModel.treadFor(G.raceWeather, G.roadWetness && G.roadWetness());
      const wrongTread = !!c.tyre && (c.tyre.tread || 0) !== wantTread;
      const caution = G.cautionInfo ? G.cautionInfo() : null;
      const why = AiDrive.pitNow({
        stopsLeft,
        lapsToStop: nextAt == null ? 99 : nextAt - (c.lap || 0),
        cautionLevel: caution ? caution.level : 0,
        wear: G.tyres.spent(c),
        wrongTread,
        // …so the worn rule can ask whether the stop has laps left to pay for
        // itself (AiDrive.wornPays).
        lapsLeft: Math.max(0, (G.lapsTarget || 0) - (c.lap || 0)),
        pitLossLaps: plan.pitLossLaps,
      });
      if (!why) return "";
      // A weather stop fits what the WEATHER wants; any other stop follows the
      // plan. Without the first branch a car pits, fits another slick, is still
      // wrong, and pits again — a stop every lap.
      const wetCls = TyreModel.classForTread(wantTread);
      const lifeLaps = (cls) => G.tyres.planLaps(TyreModel.AI_CLASS[cls].life, G.lapsTarget);
      const lapsLeft = Math.max(1, G.lapsTarget - (c.lap || 0));
      const planned = plan.seq[(c.pitStops || 0) + 1];
      const want = wrongTread ? (wetCls || AiDrive.compoundFor(lapsLeft, lifeLaps))
                 : (planned || AiDrive.compoundFor(lapsLeft, lifeLaps));
      arm(c, true);
      setNext(c, G.tyres.classRecord(want));
      c.pitWhy = why;
      return why;
    }


    // ── THE STOP, SEEN: the jacks and the wheels ─────────────────────────
    // Render-only numbers for a car HELD in its box, read off the hold's own
    // clock (pitT counts boxS down): up on the jacks in the first 12 %, the
    // four wheels off outward along their axles from 15 % to 27 %, the new
    // set on from 68 % to 80 %, down in the last 12 %. Nothing here moves
    // the physics; js/car/car-draw.js lifts and slides the wheels by these,
    // js/game.js lifts the body. One shared record, no per-frame allocation.
    const _anim = { lift: 0, off: 0, u: -1 };
    const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
    function stopAnim(c) {
      const zz = z();
      _anim.lift = 0; _anim.off = 0; _anim.u = -1;
      if (!c || c.pitState !== "box" || !zz || !(zz.boxS > 0)) return _anim;
      const u = Math.min(1, Math.max(0, 1 - (c.pitT || 0) / zz.boxS));
      _anim.u = u;
      _anim.lift = 0.22 * (u < 0.5 ? ease(u / 0.12) : ease((1 - u) / 0.12));
      _anim.off = 0.55 * (u < 0.5 ? ease((u - 0.15) / 0.12) : ease((0.80 - u) / 0.12));
      return _anim;
    }

    function reset(c) {
      if (!c) return;
      c.pitArmed = false; c.pitState = "none"; c.pitT = 0; c.pitNext = null; c.pitStops = 0; c.pitWhy = "";
      c.pitCommitT = 0; c.pitAbortT = 0; c.pitCommitted = false; c.pitOutT = 0; c.pitPos0 = 0;
      // The teach is per SESSION, not per page load — and over for good once
      // a stop has been completed (release).
      if (c.local) { for (const k in _said) delete _said[k]; _lastCue = null; }
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
        boxM: +boxThroughFor(car, zz, L || 1).toFixed(1),
        atM: +at.toFixed(1),
        // RAW m/s * 3.6, matching physState().speed's raw m/s — this is the
        // enforced CAP an agent or a spec compares a speed against, not the
        // number on the HUD (limitKphShown, the speedo's scale).
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
        // …and IN THE BOX: the working lane, which is where a stop latches.
        inBoxLat: lat ? inBoxLat(car, lat.hw, zz.side) : false,
        laneX: lat ? +laneCentre(lat.hw, zz.side, car && car.s).toFixed(2) : null,
        // The fast lane's centre here — the line a car transits the complex on.
        driveX: lat ? +laneDrive(lat.hw, zz.side, car && car.s).toFixed(2) : null,
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

    return { zoneOf: () => z(), limit, toBox, approachV, entryV, exitV, stopAnim, inLane, held, roadOf, inWindow: inWindowOf,
             arm, update, reset, info, setNext, serviceCar, planFor, think,
             pickFor, ownedTyres, choices, selectNext, estimate, committing, commitFrac, toEntry, cue,
             worthStopping, canWork, addWork, workS: WORK_S, boxBusy,
             cueM: CUE_M, boxCueM: BOX_CUE_M, moveM: MOVE_M,
             boxTol: BOX_TOL, squareByM: SQUARE_BY_M, squareLat: BOX_SQUARE_LAT,
             servedS: SERVED_S, mergeS: MERGE_S, lastCue: () => _lastCue,
             planInfo, windowOf, replan, lossS, pinnedStops, setPinnedStops,
             laneEdge, laneCentre, laneDrive, laneUniform, boxUniform, laneX, inLaneLat, inBoxLat,
             boxSquare: (c) => { const zz = z(); if (!zz || !c || !G.track) return false;
                                 Tracks.sample(G.track, c.s, _smp); return boxSquare(c, _smp, zz.side); },
             boxThroughFor: (c) => { const zz = z(); return zz && G.track ? boxThroughFor(c, zz, G.track.total) : -1; } };
  }

  return { create, zoneOf, inWindow, throughM,
           ENTRY_M, EXIT_M, BOX_M, LIMIT_FRAC, LIMIT_FRAC_STREET, BOX_S, BOX_SPEED_FRAC,
           BOX_TOL, BOX_BRAKE, PIT_SIDE, COMMIT_M, COMMIT_S, COMMIT_V, COMMIT_CLEAR,
           GRID_POLE_M,
           CUE_M, CUE_WEAR, LANE_W, LANE_MIN, MIN_RACING, BOX_LAT,
           BOX_SQUARE_LAT, BOX_SQUARE_RAD, SQUARE_BY_M,
           get BOX_PITCH() { return pitch(); }, laneWidth, teamRow, ENTRY_MIN, PIT_K, entryRunM };
})();
Object.freeze(PitLane);
