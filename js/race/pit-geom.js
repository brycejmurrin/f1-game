/* Apex 26 — PIT GEOMETRY (PitGeom): the lane window, box row and widths the state machine reads, including the surface curvature channel entryRunM. */
var PitGeom = (function () {
  "use strict";

  const clamp = M4.clamp;

  // Lane geometry, in METRES along the lap rather than as a fraction of it.
  // A fraction would make Spa's lane (7 km lap) twice Monaco's, which is
  // backwards — a pit lane is a building, not a share of a circuit. Measured
  // from the start/finish line, which is where every circuit's pit straight is
  // (racing coordinates put the line at s = 0; see TrackSpace).
  const ENTRY_M = 260;     // the LONGEST the lane may open before the line (TrackPit.ENTRY_MAX; was 400)
  const ENTRY_MIN = 150;   // ...and the shortest that is still a lane
  const EXIT_M = 110;      // where it closes, after the line (TrackPit.EXIT_M)
  const BOX_M = 40;        // the stop, this far before the line

  // ── WHERE THE LANE OPENS IS A PROPERTY OF THE CIRCUIT ─────────────────────
  // A flat distance (320 m on all 52) is circuit-blind: at Monza it lands the
  // entry INSIDE PARABOLICA. The gesture that calls a stop is "hold the car on
  // the pit side and keep it there", and holding a lateral line through a
  // corner is the hard part of driving — traced, a car entering that window
  // and steering zero drifted 6.4 m to 0.74 m and missed its box.
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
  // The lane on every circuit is the COMPLEX
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
  // One stop point would put two cars pitting on the same lap on the same patch
  // of tarmac. A pit lane is a row of garages.
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
  // the session below is the only other reader: one definition, so tuning the
  // cue here cannot leave PitLane.CUE_M/CUE_WEAR describing stale values.
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
    return !!zone && inSpan(zone.sIn, zone.sOut, s, L);
  }
  // inWindow on two bare arcs: roadOf asks it for every AI on every step (laneX), and a zone literal per ask
  // was ~2.5k objects/s of garbage on a 22-car field (perf-debug-e5b2).
  function inSpan(a, b, s, L) {
    const v = ((s % L) + L) % L;
    return a <= b ? (v >= a && v <= b) : (v >= a || v <= b);
  }

  // Distance travelled INTO the window, 0 at the entry and lenM at the exit.
  // Used for the box test and for the lane's own progress readout.
  function throughM(zone, s, L) {
    const v = ((s % L) + L) % L;
    return ((v - zone.sIn) % L + L) % L;
  }

  return { ENTRY_M, ENTRY_MIN, EXIT_M, BOX_M, PIT_K, entryRunM, LIMIT_FRAC, STRAIGHT_V, LIMIT_FRAC_STREET, BOX_S, BOX_SPEED_FRAC, BOX_TOL, BOX_BRAKE, PIT_SIDE, LANE_W, LANE_MIN, MIN_RACING, laneWidth, laneWidthOn, teamRow, BOX_LAT, BOX_SQUARE_LAT, BOX_SQUARE_RAD, SQUARE_BY_M, pitch, GRID_POLE_M, COMMIT_M, CUE_M, CUE_WEAR, COMMIT_CLEAR, GRID_CLEAR, COMMIT_S, COMMIT_V, COMMIT_IN, ABORT_S, CRAWL_V, APPROACH_M, ENTRY_BRAKE, ROAD_IN, WORK_IN_M, EXIT_WALL_W, zoneOf, inWindow, inSpan, throughM };
})();
Object.freeze(PitGeom);
