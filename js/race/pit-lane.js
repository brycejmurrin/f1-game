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
 * geometry-free arithmetic lives in PitGeom, the fallback for a track built
 * without a model (the VM tests build centrelines by hand).
 */
var PitLane = (function () {
  "use strict";

  const clamp = M4.clamp;
  const {
    ENTRY_M, ENTRY_MIN, EXIT_M, PIT_K, entryRunM, LIMIT_FRAC, STRAIGHT_V, LIMIT_FRAC_STREET, BOX_SPEED_FRAC, BOX_TOL, BOX_BRAKE, PIT_SIDE, LANE_W, LANE_MIN, MIN_RACING, laneWidth, laneWidthOn, teamRow, BOX_LAT, BOX_SQUARE_LAT, BOX_SQUARE_RAD, SQUARE_BY_M, pitch, GRID_POLE_M, COMMIT_M, CUE_M, CUE_WEAR, COMMIT_CLEAR, GRID_CLEAR, COMMIT_S, COMMIT_V, COMMIT_IN, ABORT_S, CRAWL_V, APPROACH_M, ENTRY_BRAKE, ROAD_IN, WORK_IN_M, EXIT_WALL_W, zoneOf, inWindow, inSpan, throughM,
  } = PitGeom;


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

    /** The limit IN THE SPEEDO'S UNIT: hud.js runs dashKph through
     *  AppearanceOpts.speed(), so under SPEED UNITS: MPH the cue said "80 LIMIT"
     *  against a speedo reading 50 on the limiter. km/h stays the bare number
     *  (the wall board's); any other unit names itself ("50 MPH"). */
    function limitText() {
      const k = limitKphShown();
      const AO = typeof AppearanceOpts !== "undefined" ? AppearanceOpts : null;
      if (!AO || typeof AO.speed !== "function" || !Number.isFinite(k)) return String(Math.round(k));
      const unit = typeof AO.unitLabel === "function" ? AO.unitLabel() : "KM/H";
      return AO.speed(k) + (unit === "KM/H" ? "" : " " + unit);
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
      // separate ribbon exists: the ribbon can be trimmed short of a pinch, and
      // laid out in the window the last teams' boxes sit past the end of the
      // tarmac (five circuits). The floor is the ribbon's own start rather than
      // COMMIT_M (the entry-road commit cap): boxes nearer the entry are
      // strictly better for reaching one on lap 1.
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
      const flag = cautionLevel();
      if (flag >= 4) return null;
      // The road the car would be on instead: slowed by the flag, never above
      // the pit straight's own speed. Same loss formula, slower road — which is
      // exactly why a stop under a caution is cheap.
      const roadFrac = Math.min(STRAIGHT_V, flag === 3 ? 0.45 : flag === 2 ? 0.6 : 1);
      const loss = lossAt(roadFrac);
      let behind = null;   // the nearest car behind in race distance — one pass, no per-tick filter/sort
      for (const o of G.cars || []) {
        if (o !== c && !o.retired && !o.finished && o.prog < c.prog && (!behind || o.prog > behind.prog)) behind = o;
      }
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
    // The flag level without raceCtl.info()'s per-call object (think() asks
    // per AI per tick). cautionInfo stays the fallback for a ctx without it.
    function cautionLevel() {
      if (G.cautionLevel) return G.cautionLevel();
      return G.cautionInfo ? G.cautionInfo().level : 0;
    }
    /** The nearest car behind on the racing surface that is on this car
     *  inside MERGE_S at its own speed — the one a merging car has to see. */
    function closingCar(c) {
      const cars = G.cars || [];
      const L = G.track && G.track.total;
      if (!(L > 0)) return null;
      let best = null, bestGap = MERGE_S;
      for (let i = 0; i < cars.length; i++) {
        const o = cars[i];
        if (o === c || o.retired || o.finished || inLane(o)) continue;
        // Behind ON THE TRACK, not in race distance: the leader arriving to
        // lap you has MORE prog, and a lapped car right behind has far less —
        // a prog test skipped the one and filtered out the other.
        const behind = ((c.s - o.s) % L + L) % L;
        if (!(behind > 0 && behind < L * 0.5)) continue;
        const gap = behind / Math.max(1, o.speed || 0);
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
      const wrongTread = !!c.tyre && (c.tyre.tread || 0) !== TyreModel.treadFor(G.raceWeather, G.trackWetness && G.trackWetness());
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
        return { phase: "lane", text: "STAY IN LANE · " + limitText() + " LIMIT", dist: 0, frac: 0 };
      }
      if (st === "out") {
        // THE EXIT ROAD is not silent: it is where a serviced car rejoins at
        // the limit into traffic at racing speed. GO for a moment
        // after the release; MERGE, naming the car, while one is closing on
        // the track side; otherwise the metres to the end of the road.
        const o = closingCar(c);
        if ((c.pitOutT || 0) > 0) return { phase: "served", text: o ? "GO — " + (o.code || "CAR") + " CLOSING" : "GO GO GO", dist: 0, frac: 1 };
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
      // Serviced (or being serviced): the envelope is spent. Otherwise a car
      // that stopped short of the box's centre (inside the tolerance, the stop
      // latched) is held at ZERO after the tyres go on, until a rescue pulses it
      // past the mark (every stop, both circuits measured).
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
      // The curve ends at the START of the entry road, not at the line: the
      // peel to the lane happens ON the road, and a car let through it at 25-30
      // m/s (the curve's value 30 m out) cannot move 9 m sideways in 30 m — it
      // met the wall at the road's end clamped to its track face (x -7.8, 8 of
      // 21 on a Suzuka weather stop), was not in the lane at the line, and went
      // round again, every lap. On the road itself: the limit.
      const p = G.track && G.track.pit;
      const road = p && !p.painted ? p.entryRoadM || 0 : 0;
      return Math.sqrt(lim * lim + 2 * ENTRY_BRAKE * Math.max(0, d - road - 4));
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
      if (inSpan(p.sA, p.sIn, c.s, L)) return "entry";
      if (inSpan(p.sOut, p.sB, c.s, L)) return "exit";
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
      // DISARMING DROPS IT, because the stop it was stamped for is off and the
      // guard below refuses to re-stamp a positive value: without this, arm →
      // cancel → arm again later summarised the second stop against the first
      // one's grid position, no red flag needed.
      if (!c.pitArmed) c.pitPos0 = 0;
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
      // One line per stop: the player at info, the AI field at debug (20 cars).
      Log[c.local ? "info" : "debug"]("race", "Pit stop done car=" + c.code + " lap=" + c.lap + " stop=" + (c.pitStops || 0) +
        " held=" + ((zz ? zz.boxS : 0) + (c.pitWorked || 0)).toFixed(1) + "s pos=" + rankOf(c) + (c.pitWorked > 0 ? " work" : ""));
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
      // on a 6-lap Bahrain with the field stopping:
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
      // SQUARE_BY_M BEFORE the box — not at it: the AI halts BOX_TOL/2 short, so
      // a move finishing at the box parks it four fifths of the way across,
      // inside `inBoxLat`'s line but not in its bay. On the centre before it
      // arrives, it stops square, which is what `boxSquare` requires of it.
      const span = Math.max(1, WORK_IN_M - SQUARE_BY_M);
      const u = Math.min(1, Math.max(0, (WORK_IN_M - togo) / span));
      return fast + (laneCentre(hw, zz.side, c.s) - fast) * u;
    }
    function committing(c, zz, L) {
      if (c.offroad || c.wrongWay || c.rescueT > 0) return false;
      if (!((c.speed || 0) > G.vTop() * COMMIT_V)) return false;
      // ANYWHERE FROM THE WINDOW OPENING UP TO YOUR OWN BOX, not the first
      // COMMIT_M metres only: the GRID SITS INSIDE THE WINDOW (pole 14 m before
      // the line), so on a long-entry circuit every car begins past the entry
      // road. Measured: at Monza and Hungaroring pole starts at through 386 and
      // the back of the grid at 218, against a 0-120 commit zone.
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

    const _boxU = [0, 0], _laneU = [0, 0, 0, 0];   // the per-frame uniform rows: one array each, not two fresh ones a frame while a stop is armed

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
      _boxU[0] = boxThroughFor(car, zz, t.total); _boxU[1] = BOX_TOL * 0.75;
      return _boxU;   // pooled: read by the frame's uniform upload within the same frame, never retained
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
      _laneU[0] = zz.sIn; _laneU[1] = zz.lenM; _laneU[2] = zz.side; _laneU[3] = t.total;
      return _laneU;   // pooled (see boxUniform)
    }

    /** How far through the commitment dwell this car is, 0-1. The HUD's cue. */
    function commitFrac(c) {
      return c ? clamp((c.pitCommitT || 0) / COMMIT_S, 0, 1) : 0;
    }

    // The state machine, one tick. Deliberately small: ARMED -> LANE (the driver
    // actually put the car out there) -> BOX (held, tyres changed) -> OUT (back
    // on the road). Nothing here MOVES the car — the lane is driven, so entry and
    // exit are the driver's job and the only thing this owns is the stop itself.
    // The commitment lands: armed, the crew told what to ready. With no
    // button there is no other moment the compound choice becomes visible.
    // A function of the car, not a closure built per car per update() (PERF-HUNT-2 S10).
    function commitNow(c) {
      c.pitCommitT = 0; c.pitCommitted = true;
      arm(c, true);
      const next = nextFor(c);
      if (G.announce) G.announce("PIT ENTRY — LIMITER ON" + (next ? " — " + next.code : ""), 1.6, "race");
    }
    function update(c, dt) {
      // A FINISHED car still runs the machine: one held in its box at the
      // flag is serviced and released, one on the lane keeps its state to the
      // exit (game.js coasts it down the lane), rather than freezing in
      // whatever state the flag found it and piling up in the lane.
      if (!c || c.retired) return;
      // Disabling tyre wear closes the pit feature, but a car already owned by
      // its state machine must first be released. Returning with `box`/`lane`
      // intact leaves game.js applying zero speed/the limiter forever.
      if (!enabled()) { clearArm(c); c.pitNext = null; return; }
      const st = c.pitState || "none";
      // think() guards ARMING on the last lap / a flagged leader, but an AI that
      // armed on lap L-1 and missed its entry (it comes in next time round) was
      // still armed past it: the stop paid nothing and was taken anyway.
      // …EXCEPT a car that still owes its second dry compound: a stop re-cut late (or a missed pass at a
      // pre-line box) lands in the final lap, and clearing it there ends in applyCompoundRule's DSQ.
      // The leader's flag is the same last lap for a lapped car still owing it: same exemption, and the
      // per-step flagNow() memo rather than a field scan per armed AI per tick.
      if (!c.human && c.pitArmed && st === "none" && !owesCompound(c) &&
          ((G.lapsTarget > 0 && (c.lap || 0) >= G.lapsTarget) || flagNow())) clearArm(c);
      const zz = z(), L = zoneFor.total;   // zoneFor IS G.track here: enabled() above saw z() non-null (one façade read, PERF-HUNT-2 S7)
      if (st === "out" && c.pitOutT > 0) c.pitOutT = Math.max(0, c.pitOutT - dt);   // the GO chip's clock
      // Every plan is re-cut once per lap (replan): the player's reference, and
      // an AI's own — not a real race's scripted stops, which are the record.
      if (c.pitPlan && c.lap !== c._planLap && (c.human ? c.local : !c.pitPlan.scripted)) { c._planLap = c.lap; if ((c.lap || 0) > 1) replan(c); }
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
        // THE `st !== "none"` GUARD IS LOAD-BEARING; the local clear is not
        // "wrongly conditional".
        // THE ENTRY ROAD IS OUTSIDE THE WINDOW — that is why the commit logic
        // below lives in this branch — so this runs every tick while a car
        // approaches. Clearing pitArmed/pitCommitted unconditionally here wipes
        // the commitment made on the previous tick before the block below can
        // read it, and the commit/abort state machine never advances.
        // tests/unit/pit-lane-vm.test.mjs ("a commitment is made on the ENTRY
        // ROAD…") catches it in one assertion.
        if (st !== "none") { c.pitState = "none"; c.pitT = 0; if (c.local) { arm(c, false); c.pitCommitted = false; } }
        // THE ENTRY ROAD, before the entry line: where a LOCAL car commits —
        // holding the lane's tarmac arms the stop, and the limiter waits for
        // the line — and where it can still change its mind, by holding the
        // road again for ABORT_S; past the line the wall stands between the
        // two. (An AI is armed by its plan and steered onto the road by laneX.)
        if (c.local && roadOf(c) === "entry") {
          if (!c.pitArmed) {
            c.pitCommitT = committing(c, zz, L) ? (c.pitCommitT || 0) + dt : 0;
            if (c.pitCommitT >= COMMIT_S) commitNow(c);
          } else if (c.pitCommitted) {
            Tracks.sample(G.track, c.s, _smp);
            c.pitAbortT = inLaneLat(c, _smp.hw || 0, zz.side) ? 0 : (c.pitAbortT || 0) + dt;
            if (c.pitAbortT >= ABORT_S) {
              c.pitAbortT = 0; c.pitCommitted = false; arm(c, false);
              if (G.announce) G.announce("PIT ENTRY ABORTED", 1.4, "race");
            }
          }
        }
        return;
      }
      if (st === "box") {
        // Fit the fresh set once the wheels are OFF (stopAnim mid-hold), not
        // at latch: fitting at latch made the compound stripe change before
        // anything moved, so the axle slide read as "no tyre swap". Ensure a
        // fit still lands before release if the hold is cut short.
        if (!c.pitFitted) {
          const a = stopAnim(c);
          if (a.u >= 0.50) { serviceCar(c); c.pitFitted = true; }
        }
        c.pitT = (c.pitT || 0) - dt;
        if (c.pitT <= 0) {
          if (!c.pitFitted) { serviceCar(c); c.pitFitted = true; }
          c.pitState = "out"; c.pitT = 0; release(c, zz);
        }
        return;
      }
      if (st === "out") return;                       // serviced; drive away
      // NO BUTTON: the driver commits by holding the line into the pits. Only
      // the local player — an AI car is armed by its own strategy (think), and
      // a networked rival is integrated by its owner, so neither steers itself
      // into a stop here.
      if (!c.pitArmed && c.local) {
        c.pitCommitT = committing(c, zz, L) ? (c.pitCommitT || 0) + dt : 0;
        if (c.pitCommitT >= COMMIT_S) commitNow(c);
      }
      if (!c.pitArmed && !inLane(c)) return;          // not coming in
      const at = throughM(zz, c.s, L), boxAt = boxThroughFor(c, zz, L);
      // Armed but already PAST its own box — an AI's plan fires at the lap
      // tick, and the line sits inside the window, past the row on most
      // circuits: nothing to stop for this pass. Stay armed and unlimited, and
      // come in next time round (not take the limiter for the rest of the
      // window, leave still armed, and stop a lap later).
      if (st === "none" && at > boxAt + BOX_TOL * 2) return;
      // …and, on the complex, armed but NOT ON THE LANE: the wall stands past
      // the entry line, so a car still on the racing surface here cannot get
      // in this time round — it races on and takes the entry road next lap.
      // An AI whose plan fired at the line (the grid sits inside the window,
      // Bahrain: at 151 m, box ahead) would turn in through the wall: on the
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
      // a 6-lap Bahrain with the field stopping:
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
        // The set is fitted mid-hold (see the box branch above) so the wheels
        // leave with the old compound and come back with the new one.
        c.pitFitted = false;
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
      const want = TyreModel.treadFor(G.raceWeather, G.trackWetness && G.trackWetness());
      const list = ownedTyres().map(function (o) { return tyres.optionRecord(o); });
      // TREAD FIRST, and it is not a preference. The wrong tread costs whole
      // seconds a lap and no compound choice makes that up. A career save that
      // owns no wet tyre still gets one, from the class ladder: the alternative
      // is a player who literally cannot respond to the weather, which is the
      // "no recourse" docs/PHYSICS.md warned about, reintroduced by an economy.
      let right = list.filter(function (r) { return (r.tread || 0) === want; });
      if (!right.length) {
        const cls = TyreModel.classForTread(want);
        return cls ? tyres.classRecord(cls) : (list[0] || null);
      }
      // THE RULE BEFORE THE STOPWATCH. A car that still owes its second dry
      // compound must not be refitted with the letter it has run: "the fastest
      // set that reaches the flag" picked a Super Soft off a Soft — "S" twice —
      // and endRace disqualified the player for obeying AUTO. Only when a set
      // of another letter is owned; a garage of one letter cannot comply.
      const log = c.tyreLog;
      if (want === 0 && twoCompoundApplies() && typeof SportingRegs !== "undefined" && SportingRegs.compoundShort(log)) {
        const ran = new Set((log || []).map(function (e) { return e && e.code; }));
        const fresh = right.filter(function (r) { return !ran.has(r.code); });
        if (fresh.length) right = fresh;
      }
      // pitStops already counts this box; until fitting, it is THIS stint.
      // …and THE PLAN'S LETTER, when it names one: the HUD and the engineer say
      // "BOX L12 H", so the crew fits an H unless the rule above forbids it.
      const plan = c.pitPlan, cls = plan && plan.seq ? plan.seq[(c.pitStops || 0) + (c.pitState === "box" && !c.pitFitted ? 0 : 1)] : null;
      const code = cls && TyreModel.AI_CLASS[cls] ? TyreModel.AI_CLASS[cls].code : null;
      const planned = code ? right.filter(function (r) { return r.code === code; }) : [];
      if (planned.length) right = planned;
      // Then the strategist's rule: the FASTEST set that still reaches the
      // flag. Softer is faster and shorter-lived, so among the sets that go the
      // distance take the shortest-lived one; if nothing reaches, take the set
      // that gets closest and accept that there is another stop coming.
      const lapsLeft = Math.max(1, lapsToFlag(c));
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
      // An AI's set is a CLASS record from its own ladder, never a row of the
      // player's garage: keep it on the tread the road wants (refreshAiNext).
      if (c && !c.local && !c.human && c.pitNext) { refreshAiNext(c); return c.pitNext; }
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
      const next = nextFor(c), from = c.tyre ? c.tyre.id : "none";
      G.tyres.fit(c, next || (c.tyreOpt ? G.tyres.optionRecord(c.tyreOpt) : G.tyres.classRecord(c.tyreClass || "medium")));
      Log[c.local ? "info" : "debug"]("race", "Pit tyres fitted car=" + c.code + " lap=" + c.lap + " stop=" + (c.pitStops || 0) + " tyre=" + from + "->" + (c.tyre ? c.tyre.id : "none"));
      c.pitNext = null;
      // No banner here: this runs as the car STOPS, and "GO GO GO" at the start
      // of the hold was a lie for the whole of it. The release says it (release).
    }

    /** The compound this car will fit at its next stop (a TyreModel record). */
    function setNext(c, record) { if (c) c.pitNext = record || null; }

    /** The AI class a stop fits. A weather stop fits what the WEATHER wants; any
     *  other stop follows the plan. Without the first branch a car pits, fits
     *  another slick, is still wrong, and pits again — a stop every lap. */
    function aiClassFor(c, wantTread, wrongTread) {
      const wetCls = TyreModel.classForTread(wantTread);
      const lifeLaps = (cls) => G.tyres.planLaps(TyreModel.AI_CLASS[cls].life, G.lapsTarget);
      const lapsLeft = Math.max(1, lapsToFlag(c));
      // In the box before the fit pitStops already counts THIS stop (pickFor / nextCode's own slot).
      const plan = c.pitPlan, planned = plan && plan.seq ? plan.seq[(c.pitStops || 0) + (c.pitState === "box" && !c.pitFitted ? 0 : 1)] : null;
      // …and in a wet race EVERY stop fits the wet tread: the plan's classes are
      // dry, so a planned stop on inters bolted on a slick, which was then the
      // wrong tread, and the car pitted again a lap later.
      return wrongTread ? (wetCls || AiDrive.compoundFor(lapsLeft, lifeLaps))
           : wantTread > 0 && wetCls ? wetCls
           : (planned || AiDrive.compoundFor(lapsLeft, lifeLaps));
    }
    /** An armed AI whose tread stopped matching the road (wetness crossed a
     *  threshold between the arm and the box: routine in a mixed arc) is
     *  re-chosen from the AI class ladder, so serviceCar never falls back to
     *  pickFor — the PLAYER's catalogue / owned rows, with no pace offset. */
    function refreshAiNext(c) {
      const wantTread = TyreModel.treadFor(G.raceWeather, G.trackWetness && G.trackWetness());
      if ((c.pitNext.tread || 0) === wantTread) return;
      setNext(c, G.tyres.classRecord(aiClassFor(c, wantTread, !!c.tyre && (c.tyre.tread || 0) !== wantTread)));
    }

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
     *  a flat `total / (0.55·vTop)` fraction of TOP speed cannot — it runs 2 %
     *  long at Monaco and 16 % at Spa, always making a stop look cheap. Race pace is a few per cent off a pole lap
     *  (fuel, tyres, no tow): 1.03 puts Bahrain at 123.9 s against a measured
     *  124.1. Falls back to that flat estimate where no pole model is wired. */
    const RACE_PACE = 1.03;
    function referenceLapS() {
      const pole = G.referencePole ? G.referencePole() : 0;
      if (pole > 0) return pole * RACE_PACE;
      const t = G.track;
      return t && t.total > 0 ? t.total / Math.max(1, G.vTop() * 0.6) : 100;
    }

    /** The planner's class for a dry HUD letter (S/M/H), else null. A catalog
     *  set is not an AI_CLASS key, but its letter is its class (codeForLife). */
    const CLASS_OF_CODE = { S: "soft", M: "medium", H: "hard" };
    function classOfCode(code) { return CLASS_OF_CODE[code] || null; }

    function planFor(roll, player, laps, car) {
      const zz = z();
      if (!zz) return null;
      // ONE loss, the same one the STRATEGY row shows. A second formula here
      // priced a stop at 7.3 s while the player was told 9.0 and the race
      // charged 15.0 — measured, docs/research/PIT-NEXT-STEPS-2026-09.md §4f.
      const loss = lossS();
      const n = laps > 0 ? laps : G.lapsTarget;
      const lapRefS = referenceLapS();
      const pitLossLaps = clamp(loss / Math.max(1, lapRefS), 0.02, 0.9);
      // THE PLAYER'S plan is a REFERENCE — the plan the pit wall would run —
      // never executed (think() keeps its human guard): it honours the stop
      // count the STRATEGY row pinned for this circuit, if any.
      const pin = player ? pinnedStops() : null;
      // …and it starts on THE SET THE PLAYER IS ON. With no `start` every player
      // got one plan whatever was fitted — "hard, BOX L11" for a hypersoft that
      // is gone by lap 4 — and its two-compound guarantee was about a tyre the
      // car was not on. A wet set or no car: the planner picks, as before.
      const rec = player && car ? TyreModel.startRecord(car) : null;   // what gridUp is about to fit (c.tyre is last race's)
      const start = rec && !(rec.tread > 0) ? classOfCode(rec.code) : null;
      // An AI's taste is its roll widened by its temper (AiDrive.tasteRoll):
      // a rookie gambles, a veteran runs the book. Kept on the plan, so the
      // lap-by-lap re-cut keeps the same driver's taste.
      if (!player && car && AiDrive.tasteRoll) roll = AiDrive.tasteRoll(roll, car);
      const plan = AiDrive.stintPlan({
        laps: n,
        lifeLaps: (cls) => G.tyres.planLaps(TyreModel.AI_CLASS[cls].life, n),
        pitLossLaps, roll, stops: pin, twoCompound: twoCompoundRule(n),
        start: start || undefined,
        firstLife: start && Number.isFinite(rec.life) ? G.tyres.planLaps(rec.life, n) : undefined,
      });
      if (plan) { plan.pitLossLaps = pitLossLaps; plan.pin = pin; plan.roll = roll; }
      return plan;
    }
    /** FIA 2026 SR B6.3.6: a DRY *Race* uses two dry compounds. Not below
     *  TWO_COMPOUND_MIN_LAPS — the game's short races (3-7 laps) would be
     *  one forced stop and nothing else — and never in a SPRINT: the article
     *  names the Race only, so a sprint leg of a season weekend forced a stop
     *  no real team makes. The PLAYER is held to it too: endRace disqualifies
     *  a car that ran one dry compound (js/race/sporting-regs.js), and
     *  compoundDue() is the engineer's warning with COMPOUND_WARN_LAPS left.
     *  Only where a stop is possible at all (enabled(): a lane and wear on). */
    const TWO_COMPOUND_MIN_LAPS = 8;
    function sprintLeg() {
      return !!G.seasonMode && typeof SeasonCal !== "undefined" && SeasonCal.stage(G.season) === "sprint";
    }
    function twoCompoundRule(laps) {
      return laps >= TWO_COMPOUND_MIN_LAPS
        && TyreModel.treadFor(G.raceWeather, G.trackWetness && G.trackWetness()) === 0
        && !sprintLeg();
    }
    const COMPOUND_WARN_LAPS = 5;
    function twoCompoundApplies() { return enabled() && twoCompoundRule(G.lapsTarget); }
    /** Racing laps still owed including the lap the car is ON.
     *  `c.lap` counts S/F crossings (grid 0; winner flags at lapsTarget+1), so
     *  remaining = lapsTarget - lap + 1. pickFor / think / wetLapsToStop once
     *  used lapsTarget - lap and were one short of the flag. */
    function lapsToFlag(c) {
      return Math.max(0, (G.lapsTarget || 0) - ((c && c.lap) || 0) + 1);
    }
    /** The player still owes the second compound with the race nearly run. */
    function owesCompound(c) {
      return !!c && twoCompoundApplies() && typeof SportingRegs !== "undefined" && SportingRegs.compoundShort(c.tyreLog);
    }
    function compoundDue(c) {
      if (!c || !twoCompoundApplies() || typeof SportingRegs === "undefined") return false;
      return lapsToFlag(c) <= COMPOUND_WARN_LAPS && SportingRegs.compoundShort(c.tyreLog);
    }
    /** The STRATEGY row's pin for this circuit: a stop count, or null for AUTO. */
    function pinKey(id) { const t = G.track, d = t && t.def; return "pitPlan." + ((typeof id === "string" && id.trim() ? id : null) || (d && d.id) || (t && t.id) || "track"); }
    function pinnedStops(id) {
      const v = G.store && G.store.get ? G.store.get(pinKey(id), "auto") : "auto";
      return v == null || v === "auto" ? null : Math.max(0, Math.min(2, v | 0));
    }
    function setPinnedStops(v, id) { if (G.store && G.store.set) G.store.set(pinKey(id), v == null ? "auto" : (v | 0)); }
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
    function planInfo(c, readouts) {
      const plan = c && c.pitPlan;
      if (!plan || !enabled()) return null;
      const done = c.pitStops || 0, lap = c.lap || 0, stops = plan.stops || 0;
      const next = plan.lapsAt[done];
      const code = nextCode(c);
      const label = stops ? stops + "-STOP" : "NO STOP";
      if (next == null) return { text: "PLAN " + label + (stops ? " · DONE" : ""), state: "", stops, next: null, lapsToStop: null, code };
      const lapsToStop = next - lap;
      const caution = G.cautionInfo ? G.cautionInfo() : null;
      let est = null;
      if (caution && caution.level >= 2 && caution.level < 4) {
        // Optional synchronous HUD-tick reads; null is a computed result.
        if (readouts && readouts.player === c) {
          if (readouts.estimate === undefined) readouts.estimate = estimate(c);
          est = readouts.estimate;
        } else est = estimate(c);
      }
      const busy = !!c.pitArmed || (c.pitState && c.pitState !== "none");
      let state = "", text = "PLAN " + label + " · BOX L" + next + (code ? " " + code : "");
      if (busy) state = "";
      else if (est && est.marginS > 0 && lapsToStop <= (typeof AiDrive !== "undefined" && AiDrive.STRAT ? AiDrive.STRAT.CAUTION_REACH : 6)) {
        state = "cheap";
        const loss = est.lossS != null ? Math.round(est.lossS) : null;
        text = "CHEAPER STOP" + (loss != null ? " · ~" + loss + "s" : "") + " · BOX NOW" + (code ? " " + code : "");
      }
      else if (lapsToStop <= 0) { state = "now"; text = "BOX BOX BOX" + (code ? " · " + code : ""); }
      else if (lapsToStop === 1) { state = "soon"; text = "BOX NEXT LAP" + (code ? " · " + code : ""); }
      return { text, state, stops, next, lapsToStop, code };
    }
    /** The letter the next stop fits. For the local car that is what the crew
     *  WILL fit (nextFor — a selection, or AUTO's pick, which honours the plan
     *  and the two-compound rule); the plan's own letter otherwise. The HUD
     *  said "BOX L12 H" while AUTO bolted on an M. */
    function nextCode(c) {
      const plan = c && c.pitPlan;
      if (c && c.local) { const r = nextFor(c); if (r && r.code) return r.code; }
      const cls = plan && plan.seq ? plan.seq[(c.pitStops || 0) + (c.pitState === "box" && !c.pitFitted ? 0 : 1)] : null;
      return cls && TyreModel.AI_CLASS[cls] ? TyreModel.AI_CLASS[cls].code : "";
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
     *  design — and said once when it is. Advice, so it may change its mind.
     *  AN AI RE-CUTS TOO, silently and on its own taste (plan.roll): a set
     *  wearing slower than planned is run longer, a faster one is stopped
     *  sooner. How small a move it acts on is its temper — an alert wall
     *  (TEMPER.react) takes a one-lap change, the rest wait for two. It never
     *  re-cuts on a wet tread or in a wet race (think() owns those stops),
     *  nor while a stop is already armed, nor before two laps on the set. */
    function planBLine(oldNext, newNext) {
      if (newNext == null) return "PLAN B — NO MORE STOPS, MANAGE TO THE FLAG";
      if (oldNext == null) return "PLAN B — TYRES WON'T LAST, BOX LAP " + newNext;
      return newNext < oldNext ? "PLAN B — TYRES WEARING FAST, BOX LAP " + newNext
                               : "PLAN B — TYRES HOLDING UP, EXTEND TO LAP " + newNext;
    }
    function replan(c) {
      const plan = c.pitPlan, zz = z();
      if (!plan || !zz || !G.tyres || !c.tyre || typeof AiDrive === "undefined") return false;
      const ai = !c.human;
      const wantTread = TyreModel.treadFor(G.raceWeather, G.trackWetness && G.trackWetness());
      // The weather call owns a tread change; do not price a stint on the wrong set.
      if (!ai && (c.tyre.tread || 0) !== wantTread) return false;
      if (ai && (c.pitArmed || (c.pitState && c.pitState !== "none") || (c.tyre.tread || 0) > 0
          || TyreModel.treadFor(G.raceWeather, G.trackWetness && G.trackWetness()) > 0
          || (G.tyres.lapsOn ? G.tyres.lapsOn(c) : 0) < 2
          || (c.lap || 0) - (c._recutLap || -99) < AiDrive.STRAT.REPLAN_GAP)) return false;
      const done = c.pitStops || 0, lap = Math.max(1, c.lap || 1);
      const lapsLeft = lapsToFlag({ lap });
      const oldNext = plan.lapsAt[done];
      // NO `oldNext == null` EXIT. It sat here, so a plan that said NO STOP —
      // or whose stops were all served — could never be revised: tyres going
      // at twice the planned rate, the HUD still said "PLAN NO STOP".
      if (lapsLeft < 2) return false;
      /* THE RATE THIS DRIVER IS ACTUALLY WEARING THE SET AT. planLaps is a clean
         lap at load 1.0; kerbs, slides and a heavy right foot run well past it,
         and a plan priced at 1.0 told a player whose set was gone in 3 laps
         there was no stop. Measured wear per completed lap on this set gives
         the laps it has left; the ratio to the nominal is carried to the sets
         still to come (plan.loadK), and survives a stop, where the new set has
         no laps of its own to measure yet. */
      const fittedLife = Number.isFinite(c.tyre.life) ? c.tyre.life : TyreModel.AI_CLASS.medium.life;
      const nominal = G.tyres.planLaps(fittedLife, G.lapsTarget);
      const spent = G.tyres.spent(c);
      const onSet = G.tyres.lapsOn ? G.tyres.lapsOn(c) : 0;
      // …against the FUEL the set has carried: wear runs (1 + FUEL_WEAR·fuel)
      // faster on a full tank, and the planner re-applies that to every stint,
      // so a load factor that kept it read high early and sank as the tank
      // emptied — the stop crept a lap later every re-cut (9 AI re-cuts a car
      // in a 50-lap race, measured). The mean fuel over the laps on this set.
      const midFuel = clamp(1 - (lap - onSet / 2) / Math.max(1, G.lapsTarget), 0, 1);
      const fuelMul = 1 + AiDrive.STRAT.FUEL_WEAR * midFuel;
      if (onSet >= 1 && spent > 0) plan.loadK = clamp(nominal * spent / (onSet * fuelMul), 0.6, 2.5);
      const loadK = plan.loadK || 1;
      const lifeLaps = (cls) => G.tyres.planLaps(TyreModel.AI_CLASS[cls].life, G.lapsTarget) / loadK;
      // Wet advice follows the fitted set's measured life, then the actual
      // next wet set. The dry planner cannot represent either wet class.
      const wetCls = c.tyre.tread > 0 ? TyreModel.classForTread(c.tyre.tread) : null;
      let wetRel = null;
      if (!ai && wetCls) {
        const next = nextFor(c) || c.tyre;
        const fresh = Math.max(1, G.tyres.planLaps(next.life, G.lapsTarget) / loadK);
        let left = lapsLeft, at = 0;
        let life = G.tyres.lapsLeft ? G.tyres.lapsLeft(c) : null;
        if (life == null) life = nominal / loadK * (1 - Math.min(1, spent));
        wetRel = { seq: [wetCls], lapsAt: [], stops: 0 };
        while (life < left) {
          const stint = Math.max(1, Math.floor(life));
          at += stint; left -= stint;
          wetRel.lapsAt.push(at); wetRel.seq.push(TyreModel.classForTread(next.tread));
          wetRel.stops++;
          // Integrate the falling fuel load across each replacement stint.
          // fresh is the zero-fuel budget: n laps consume n*(a-b*n).
          const n = Math.max(1, G.lapsTarget), k = AiDrive.STRAT.FUEL_WEAR;
          const a = 1 + k * clamp(1 - (lap - 1 + at) / n, 0, 1), b = k / (2 * n);
          life = fresh >= left * (a - b * left) ? left : 2 * fresh / (a + Math.sqrt(a * a - 4 * b * fresh));
        }
        // Keep a requested extra stop where there is room; a pin cannot make
        // a worn wet set last longer, so safety may require more than the pin.
        const pinned = plan.pin == null ? 0 : Math.max(0, plan.pin - done);
        while (wetRel.stops < pinned && wetRel.stops < lapsLeft - 1) {
          const edges = [0].concat(wetRel.lapsAt, [lapsLeft]);
          let split = 0;
          for (let i = 1; i < edges.length - 1; i++) if (edges[i + 1] - edges[i] > edges[split + 1] - edges[split]) split = i;
          wetRel.lapsAt.splice(split, 0, Math.floor((edges[split] + edges[split + 1]) / 2));
          wetRel.seq.push(TyreModel.classForTread(next.tread)); wetRel.stops++;
        }
      }
      // `start` must be one of the planner's THREE classes — the alphabet
      // stintPlan sequences in — and a catalog set's letter IS its class. A
      // wet set uses wetRel above; firstLife belongs to the dry planner.
      const cls = wetCls || classOfCode(c.tyre.code);
      const firstLife = cls ? Math.max(1, nominal / loadK * (1 - spent)) : undefined;
      const stops = plan.pin != null ? Math.max(0, plan.pin - done) : null;
      // WHAT WAS RUN, not what was planned: the stint log. `used` was the plan's
      // own history, so a player who refitted the same letter was told "NO MORE
      // STOPS" by a re-cut that believed the rule already met. And a car that
      // has met it (or run a wet set) owes nothing: no constraint at all.
      const log = Array.isArray(c.tyreLog) ? c.tyreLog : [];
      const used = log.slice(0, -1).map((e) => classOfCode(e && e.code)).filter(Boolean);
      const owes = typeof SportingRegs === "undefined" || SportingRegs.compoundShort(log);
      const rel = wetRel || AiDrive.stintPlan({ laps: lapsLeft, lifeLaps, pitLossLaps: plan.pitLossLaps || AiDrive.STRAT.PIT_LOSS_FALLBACK, roll: ai && plan.roll != null ? plan.roll : 0.5,
                                      start: cls || undefined, firstLife, stops,
                                      twoCompound: twoCompoundRule(G.lapsTarget) && owes, used });
      if (!rel) return false;
      const newNext = rel.stops > 0 ? lap - 1 + rel.lapsAt[0] : null;
      // A re-cut is for a real surprise: two laps for the player and an alert
      // AI wall, three for the rest.
      const minMove = wetRel ? 1 : !ai ? 2 : AiDrive.strategyTemper(c).react >= AiDrive.STRAT.TEMPER.REACT_MIN ? 2 : 3;
      const sameTread = plan.seq[done] === cls && (!wetRel || plan.stops === done + rel.stops);
      if (sameTread && newNext != null && oldNext != null && Math.abs(newNext - oldNext) < minMove) return false;
      if (sameTread && newNext == null && oldNext == null) return false;
      plan.seq = plan.seq.slice(0, done).concat(cls ? [cls] : plan.seq.slice(done, done + 1)).concat(rel.seq.slice(1));
      // THE STOPS MADE, where they were made: the log's fit laps, not the plan's.
      // An early stop left lapsAt naming a lap that never happened, and the
      // re-cut's first stint counts only from THIS lap, so the strip stopped
      // summing to the race. The set on the car runs from its fit to its stop.
      const made = log.length === done + 1 ? log.slice(1).map((e) => e.lap0) : plan.lapsAt.slice(0, done);
      plan.lapsAt = made.concat(rel.lapsAt.map((k) => lap - 1 + k));
      const at = [0].concat(plan.lapsAt, [G.lapsTarget]);
      plan.stints = at.slice(1).map((v, i) => Math.max(0, v - at[i]));
      plan.stops = done + rel.stops;
      if (ai) { c.pitReplans = (c.pitReplans || 0) + 1; c._recutLap = c.lap || 0; return true; }
      // PLAN B, with the reason — the measured wear is why it changed, and a
      // driver told "tyres wearing fast" knows what to do with the next lap.
      if (G.announce) G.announce(planBLine(oldNext, newNext), 2.2, "info");
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
    /** The two cars a pit wall watches, in seconds at OUR pace (the measure
     *  engineer.js uses): `behind` — the car DIRECTLY behind, within
     *  COVER_GAP_S, is in the lane now (the undercut on us); `stuck` — a car
     *  within STUCK_GAP_S ahead, not yet stopped, on no fresher rubber
     *  (think() latches it: STUCK_LAPS of it before the undercut). */
    const _rivals = { behind: false, stuck: false };
    function rivalsOf(c) {
      _rivals.behind = false; _rivals.stuck = false;
      const v = Math.max(1, c.speed || 1), S = AiDrive.STRAT;
      let next = null, nextGap = Infinity;
      let ahead = null, aheadGap = Infinity;
      for (const o of G.cars) {
        if (o === c || o.retired || o.finished) continue;
        const gap = ((c.prog || 0) - (o.prog || 0)) / v;
        if (gap > 0 && gap < nextGap) { next = o; nextGap = gap; }
        else if (gap < 0 && -gap < aheadGap) { ahead = o; aheadGap = -gap; }
      }
      _rivals.behind = !!next && nextGap < S.COVER_GAP_S && !!(next.pitState && next.pitState !== "none");
      // The car DIRECTLY ahead, not whoever in the window happens to be last
      // in the array. A backmarker two seconds up the road was latching the
      // undercut while the car we were stuck behind had already stopped.
      if (ahead && aheadGap < S.STUCK_GAP_S) {
        const inLane = !!(ahead.pitState && ahead.pitState !== "none");
        if (!inLane && (ahead.pitStops || 0) <= (c.pitStops || 0)) _rivals.stuck = true;
      }
      return _rivals;
    }
    /** Laps to this car's stop on a WET set, from the wet class's life rather
     *  than the dry plan: 99 (no stop) when the set on the car reaches the
     *  flag (G.tyres.lapsLeft, measured, with the 1.1 margin `fits` uses);
     *  otherwise midway between the first lap a fresh wet reaches the flag and
     *  the lap this one is gone — the split that wastes least of either set. */
    function wetLapsToStop(c, tread) {
      const lap = c.lap || 0, left = lapsToFlag(c);
      if (!G.tyres.lapsLeft || !G.tyres.lapsOn) return 99;
      const fresh = G.tyres.planLaps(TyreModel.AI_CLASS[TyreModel.classForTread(tread)].life, G.lapsTarget) / (c.pitPlan.loadK || 1);
      // The measured rate only after two laps on the set (replan's rule): one
      // lap after a stop read 27 % and stopped two fresh wets again, measured.
      const onSet = G.tyres.lapsOn(c) >= 2 ? G.tyres.lapsLeft(c) : fresh * (1 - Math.min(1, G.tyres.spent(c)));
      if (onSet == null || onSet * 1.1 >= left) return 99;
      return Math.max(0, Math.round(((G.lapsTarget - fresh) + (lap + onSet)) / 2) - lap);
    }
    const _pitCtx = { stopsLeft: 0, lapsToStop: 0, rivalBehindBoxed: false, stuckBehind: false, rivalUsed: false, fits: true,
      react: 0, attack: 0, cautionLevel: 0, wear: 0, wrongTread: false, lapsLeft: 0, pitLossLaps: 0, scripted: false };
    // Born Double, values kept: the 0s are Smi fields, and the first fractional temper / wear split the map (PERF-HUNT-5).
    _pitCtx.react = _pitCtx.attack = _pitCtx.wear = 0.5; _pitCtx.react = _pitCtx.attack = _pitCtx.wear = 0;
    // RaceControl.flagOut(G.cars) once per step, not once per AI (perf plan C-2:
    // 21 scans of the field a step). game.js brackets its car loop with
    // stepBegin/stepEnd; nothing inside that loop finishes or retires a car
    // (finishes settle in settleLineStep after it), so every think() in it reads
    // the same answer. Outside the bracket (tests, dev hooks) it scans live.
    let _flagStep = false, _flagMemo = null;
    function stepBegin() { _flagStep = true; _flagMemo = null; }
    function stepEnd() { _flagStep = false; _flagMemo = null; }
    function flagNow() {
      if (_flagStep && _flagMemo !== null) return _flagMemo;
      const out = typeof RaceControl !== "undefined" && RaceControl.flagOut(G.cars);
      if (_flagStep) _flagMemo = out;
      return out;
    }
    function think(c) {
      const plan = c && c.pitPlan;
      if (c && c.pitNext && !c.human && !c.local) refreshAiNext(c);   // armed, before the early return below
      // A HUMAN's plan is advice (planFor): nothing here ever arms it.
      if (!plan || c.human || c.pitArmed || (c.pitState && c.pitState !== "none")) return "";
      // The flying-start run-up hands the player's car to the AI for a few
      // seconds (js/race/flying-start.js); its plan is still the player's.
      if (G.flyingStart && G.flyingStart.owns(c)) return "";
      // The last lap, or the leader already flagged: no stop pays (the player's
      // engineer has the same finalLap guard). A lapped AI still boxed for wets.
      if ((G.lapsTarget > 0 && (c.lap || 0) >= G.lapsTarget) || flagNow()) return "";
      // A red flag (4) is not a pit window: the field is held and the restart clears arms.
      if (cautionLevel() >= 4) return "";
      let stopsLeft = plan.stops - (c.pitStops || 0);
      const nextAt = plan.lapsAt[c.pitStops || 0];
      // WRONG TYRE FOR THE CONDITIONS, in either direction: slicks in the rain
      // AND wets on a drying track. This is the recourse docs/PHYSICS.md said a
      // dry->rain arc did not have.
      const wantTread = TyreModel.treadFor(G.raceWeather, G.trackWetness && G.trackWetness());
      const wrongTread = !!c.tyre && (c.tyre.tread || 0) !== wantTread;
      // ON THE RIGHT WET TYRE THE DRY PLAN'S LAPS MEAN NOTHING: plan.lapsAt was
      // cut for slicks, and every stop in a wet race refits the wet class
      // (below), so a 2-stop dry plan stopped a wet twice and a wet that could
      // reach the flag still came in on the slick's lap. The wet stint is
      // re-cut on the wet class's own life (wetLapsToStop).
      const wetRun = wantTread > 0 && !wrongTread;
      let lapsToStop = nextAt == null ? 99 : nextAt - (c.lap || 0);
      if (wetRun) { lapsToStop = wetLapsToStop(c, wantTread); stopsLeft = lapsToStop < 99 ? 1 : 0; }
      const wear = G.tyres.spent(c);
      // The cars around it, only when a rival rule could fire (a stop near, a
      // used set): the scan is a pass over the field, per AI per tick.
      const near = stopsLeft > 0 && lapsToStop <= AiDrive.STRAT.UNDERCUT_REACH && wear >= AiDrive.STRAT.UNDERCUT_MIN_WEAR
        ? rivalsOf(c) : null;
      const temper = near ? AiDrive.strategyTemper(c) : null;
      // STUCK for a lap, not a corner: latched on the progress it started at.
      if (near && near.stuck) { if (c._stuckFrom == null) c._stuckFrom = c.prog || 0; }
      else c._stuckFrom = null;
      const stuckLong = c._stuckFrom != null && (c.prog || 0) - c._stuckFrom >= AiDrive.STRAT.STUCK_LAPS * G.track.total;
      // Would the NEXT set carry the car from a stop now to its own planned
      // stop (or the flag)? A rival call that answers no is not taken — nor a
      // CAUTION stop: pulled up to CAUTION_REACH laps forward onto a set that
      // cannot reach the flag, the "free" stop bought a second one. Bahrain,
      // 12 laps, SC on lap 2: 19 of 21 one-stop plans ran two stops, 2 ran three.
      const caution = cautionLevel();
      let fits = true;
      if (near || (caution >= 2 && caution < 4 && stopsLeft > 0 && lapsToStop <= AiDrive.STRAT.CAUTION_REACH)) {
        // (On a wet run the next set is the wet class, run to the flag.)
        const nextCls = wetRun ? TyreModel.classForTread(wantTread) : plan.seq[(c.pitStops || 0) + 1];
        const nextStop = wetRun ? null : plan.lapsAt[(c.pitStops || 0) + 1];
        const life = nextCls && TyreModel.AI_CLASS[nextCls] ? G.tyres.planLaps(TyreModel.AI_CLASS[nextCls].life, G.lapsTarget) / (plan.loadK || 1) : Infinity;
        fits = (nextStop != null ? nextStop : G.lapsTarget) - (c.lap || 0) <= life * 1.1;
      }
      // ONE context, every field rewritten per call (pitNow is pure and keeps nothing):
      // a 13-field literal per AI per tick was ~1.3k objects/s of garbage.
      const q = _pitCtx;
      q.stopsLeft = stopsLeft;
      q.lapsToStop = lapsToStop;
      q.rivalBehindBoxed = !!(near && near.behind); q.stuckBehind = !!(near && near.stuck && stuckLong);
      q.rivalUsed = !!c._rivalStop; q.fits = fits;
      q.react = temper ? temper.react : 0; q.attack = temper ? temper.attack : 0;
      q.cautionLevel = caution;   // per AI per tick: the allocation-free read
      q.wear = wear;
      q.wrongTread = wrongTread;
      // …so the worn rule can ask whether the stop has laps left to pay for
      // itself (AiDrive.wornPays).
      q.lapsLeft = lapsToFlag(c);
      q.pitLossLaps = plan.pitLossLaps;
      q.scripted = !!plan.scripted;   // a real race's plan (js/race/real-race.js planFor)
      const why = AiDrive.pitNow(q);
      if (!why) return "";
      const want = aiClassFor(c, wantTread, wrongTread);
      arm(c, true);
      setNext(c, G.tyres.classRecord(want));
      c.pitWhy = why;
      if (why === "cover" || why === "undercut") c._rivalStop = true;
      return why;
    }


    // ── THE STOP, SEEN: the jacks and the wheels ─────────────────────────
    // Render-only numbers for a car HELD in its box, read off the hold's own
    // clock (pitT counts boxS down): up on the jacks in the first 12 %, the
    // four wheels off outward along their axles from 15 % to 27 %, the new
    // set fitted at 50 % (while they are fully off), the new set on from
    // 68 % to 80 %, down in the last 12 %. Nothing here moves the physics;
    // js/car/car-draw.js lifts and slides the wheels by these, js/game.js
    // lifts the body. One shared record, no per-frame allocation.
    const _anim = { lift: 0, off: 0, u: -1 };
    _anim.lift = _anim.off = _anim.u = 0.5; _anim.lift = _anim.off = 0; _anim.u = -1;   // born Double, like _pitCtx
    const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
    function stopAnim(c) {
      const zz = z();
      _anim.lift = 0; _anim.off = 0; _anim.u = -1;
      if (!c || c.pitState !== "box" || !zz || !(zz.boxS > 0)) return _anim;
      // pitWorked extends the hold past boxS; the visual is keyed on the
      // service half only so a garage visit does not freeze the jacks mid-air.
      const span = zz.boxS;
      const remain = Math.min(span, Math.max(0, (c.pitT || 0) - (c.pitWorked || 0)));
      const u = Math.min(1, Math.max(0, 1 - remain / span));
      _anim.u = u;
      _anim.lift = 0.22 * (u < 0.5 ? ease(u / 0.12) : ease((1 - u) / 0.12));
      _anim.off = 0.55 * (u < 0.5 ? ease((u - 0.15) / 0.12) : ease((0.80 - u) / 0.12));
      return _anim;
    }

    function reset(c) {
      if (!c) return;
      c.pitArmed = false; c.pitState = "none"; c.pitT = 0; c.pitNext = null; c.pitStops = 0; c.pitWhy = "";
      c.pitCommitT = 0; c.pitAbortT = 0; c.pitCommitted = false; c.pitOutT = 0; c.pitPos0 = 0;
      c.pitFitted = false; c.pitReplans = 0; c._recutLap = null; c._planLap = null; c._rivalStop = false; c._stuckFrom = null;
      // The teach is per SESSION, not per page load — and over for good once
      // a stop has been completed (release).
      if (c.local) { for (const k in _said) delete _said[k]; _lastCue = null; }
    }

    /** The IN-PROGRESS half of reset(), and nothing else.
     *
     *  A red flag is not a new race: pitStops, pitNext and the plan are the
     *  car's STRATEGY and must survive it (game.js redFlagRestart says the same
     *  of energy, tyreClass and phaseRoll). What must not survive is a stop
     *  that was in flight when the flag flew — the arm, the commitment and the
     *  lane state — because the restart teleports every car onto a grid box
     *  that, on most circuits, sits INSIDE the pit window. inLane(c) then keeps
     *  answering true, so game.js's vmax branch holds the car at the pit
     *  limiter and laneDrive steers it onto the lane offset: the player leaves
     *  a standing start unable to exceed ~20 m/s at full throttle until the arc
     *  walks them out of the window, measured at ~750 ticks (12 s) on Monza.
     *  update()'s left-the-window branch, the only other place that clears
     *  these, by construction cannot fire while the car is inside it. */
    function clearArm(c) {
      if (!c) return;
      // A stop is counted at the box latch but the set is fitted mid-hold: a
      // re-grid before the fit leaves on the OLD set, so that stop never
      // happened — keeping it spent the plan's next stop (think() reads
      // lapsAt[pitStops]) and left the car one stop short of its strategy.
      if (c.pitState === "box" && !c.pitFitted) c.pitStops = Math.max(0, (c.pitStops | 0) - 1);
      c.pitArmed = false; c.pitState = "none"; c.pitT = 0;
      c.pitCommitT = 0; c.pitAbortT = 0; c.pitCommitted = false; c.pitOutT = 0;
      c.pitFitted = false;
      // ...and the three the SUMMARY is computed from. release() clears these,
      // but only for a stop that COMPLETED; an attempt the flag interrupted
      // left the rank it was called from and the work already done on the car,
      // and arm() re-stamps pitPos0 only when it is not already positive — so
      // the driver's next real stop announced a place-swing and a held time
      // measured against the aborted one.
      c.pitPos0 = 0; c.pitWorked = 0; c.pitWhy = "";
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
        // THE STOP, SEEN — lift/off/u for a car in its box (null otherwise),
        // and whether the fresh set has been fitted yet. The browser pit-lane
        // spec asserts crew draws and the axle slide against these.
        anim: (car && car.pitState === "box") ? (function () {
          const a = stopAnim(car);
          return { lift: +a.lift.toFixed(3), off: +a.off.toFixed(3), u: +a.u.toFixed(3),
                   fitted: !!car.pitFitted };
        })() : null,
      };
    }

    // Race teardown: the zone cache keys on the track object, and kept the last race's track until the next z().
    function releaseTrack() { zone = null; zoneFor = null; }
    return { zoneOf: () => z(), releaseTrack, limit, toBox, approachV, entryV, exitV, stopAnim, inLane, held, roadOf, inWindow: inWindowOf,
             arm, update, reset, clearArm, info, setNext, serviceCar, planFor, think, stepBegin, stepEnd,
             pickFor, ownedTyres, choices, selectNext, estimate, committing, commitFrac, toEntry, cue,
             worthStopping, canWork, addWork, workS: WORK_S, boxBusy,
             cueM: CUE_M, boxCueM: BOX_CUE_M, moveM: MOVE_M,
             boxTol: BOX_TOL, squareByM: SQUARE_BY_M, squareLat: BOX_SQUARE_LAT,
             servedS: SERVED_S, mergeS: MERGE_S, lastCue: () => _lastCue,
             planInfo, nextCode, nextFor, windowOf, replan, lossS, pinnedStops, setPinnedStops, twoCompoundApplies, compoundDue,
             laneEdge, laneCentre, laneDrive, laneUniform, boxUniform, laneX, inLaneLat, inBoxLat,
             boxSquare: (c) => { const zz = z(); if (!zz || !c || !G.track) return false;
                                 Tracks.sample(G.track, c.s, _smp); return boxSquare(c, _smp, zz.side); },
             boxThroughFor: (c) => { const zz = z(); return zz && G.track ? boxThroughFor(c, zz, G.track.total) : -1; } };
  }

  // Module surface kept to what tests / always-loaded call sites actually read.
  // BOX_BRAKE, COMMIT_V, CUE_WEAR, BOX_SQUARE_*, SQUARE_BY_M stay destructured for
  // create() internals (and instance fields like squareByM); they are not frozen
  // here. BOX_M / BOX_S never had an external reader on PitLane.
  return { create, zoneOf, inWindow, throughM,
           ENTRY_M, EXIT_M, LIMIT_FRAC, LIMIT_FRAC_STREET, BOX_SPEED_FRAC,
           BOX_TOL, PIT_SIDE, COMMIT_M, COMMIT_S, COMMIT_CLEAR,
           GRID_POLE_M,
           CUE_M, LANE_W, LANE_MIN, MIN_RACING, BOX_LAT,
           get BOX_PITCH() { return pitch(); }, laneWidth, teamRow, ENTRY_MIN, PIT_K, entryRunM };
})();
Object.freeze(PitLane);
