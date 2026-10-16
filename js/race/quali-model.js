/* Apex 26 — QUALIFYING: one flying lap, and the simulated times it is measured against. THE SHAPE OF THE SESSION. Qualifying is not a new game `state` — it is a n… */
const Quali = (function () {
  "use strict";

  const STEP = 4;

  // The one calibration constant: it scales the straight-line ceiling the model
  // integrates against, so it sets where the simulated field sits relative to a lap
  // actually driven in this game.
  //
  // MEASURED, and the guess it replaced was 27% out. This shipped at 1.035, reasoned
  // from "a flying lap is a few percent quicker than a race stint" — but a
  // quasi-steady model drives the theoretical friction limit, and the AI does not: it
  // carries margin, brakes early, and does not take the optimal line. That gap is
  // what this closes, and it is far larger than the quali-versus-race delta the
  // original figure was reasoning about.
  //
  // Calibrated by letting the game's own AI race and comparing its BEST CLEAN LAP
  // (best of several — any single lap may be traffic-affected, and a qualifying lap
  // has no traffic) against what this model predicted for that same car:
  //
  //     1.035 -> model at 0.83 of the driven lap    (17% optimistic: pole unreachable)
  //     0.89  -> 0.895
  //     0.82  -> 0.930
  //     0.75  -> 0.976   <- here, and the fit now agrees with itself
  //
  // A ratio near 0.97 is the target: the simulated pole sits just inside the best lap
  // the AI actually manages, so a player matching AI pace qualifies mid-field and
  // pole is achievable but has to be earned. Above 1.0 would hand out free poles.
  //
  // The spread across circuits is sd 0.012-0.03, and THAT is the load-bearing result:
  // the model's shape is right — it reads track character on its own — so one
  // constant calibrates every circuit rather than each needing a reference lap.
  //
  // The response is sublinear (much of a lap is cornering-limited by
  // sqrt(latMax/k), which this does not scale), so do not solve for it
  // algebraically. Re-measure whenever the driving model changes: drive a clean
  // lap, compare against qualiSim()'s field times, and trim this constant until
  // pole sits just ahead of a good driven lap.
  const QUALI_TRIM = 0.75;

  // ...BUT ONLY AT PACE 1, which is where it was fitted (R3-RACE-INTEGRITY-1). The
  // trim throttles the straight-line cap, and how much of a lap that cap governs
  // moves with OVERALL SPEED: corners are absolute (sqrt(latMax/k)), the cap and
  // ACCEL are pace-scaled. Model lap / the same AI car's driven lap, medians:
  //
  //     PACE        0.44    1.0    1.34
  //     monza      1.215  0.994  0.936     (a free pole at 0.44: TT gold
  //     monaco     1.058  0.904  0.933      needed 244 s, the AI drove 186 s)
  //
  // The missing term is the car's own drag curve: updateCar pulls
  // ACCEL·PACE·(1 - v/vmax), so the distance a car needs to near its top speed
  // grows with PACE, while this model pulled a flat ACCEL right up to the cap.
  // So the PACE-1 calibration stays the ANCHOR and the pace dependence comes from
  // a model that carries that curve (no straight trim; the car runs to its own
  // free pace) — paceLap() below: lap(PACE) = trimmed lap at PACE 1 ·
  // shape(PACE) / shape(1). PACE 1 is today's model to the bit.
  //
  // Fitted (grid search against each AI car's first clean racing lap, VM,
  // AI-only field) over monza, monaco, spa, silverstone, hungaroring, suzuka
  // and bahrain at PACE 0.44 / 0.7 / 1.34; model/driven relative to that
  // circuit's own PACE-1 value:
  //
  //     shape            worst     (monza 0.44 / 1.34, monaco 0.44 / 1.34)
  //     none (trim only)  26.2 %   1.222 / 0.942, 1.170 / 1.032
  //     CORNER 1.0         5.3 %
  //     CORNER 1.1         3.0 %   1.000 / 0.993, 0.972 / 1.030
  //
  // CORNER scales the flat corner cap for what it leaves out (the AI's
  // downforce and kerb use); an explicit aero term fitted worse than it.
  // tests/unit/quali-pace-parity-vm.test.mjs holds the result.
  const PACE_CORNER = 1.1;

  const EXEC_SPREAD = 0.012;

  // Time-trial MEDALS as multiples of the reference pole (referencePole below):
  // gold beats the modelled pole, silver is within 3 %, bronze within 7 %.
  const MEDALS = [["gold", 1.0], ["silver", 1.03], ["bronze", 1.07]];
  const MEDAL_RANK = { bronze: 1, silver: 2, gold: 3 };
  function medalFor(t, pole) {
    if (!(t > 0) || !(pole > 0)) return null;
    for (const [m, k] of MEDALS) if (t <= pole * k) return m;
    return null;
  }

  function create(G) {
    Log.info("game", "Quali.create");

    let classification = null;
    // The circuit `classification` belongs to. The PERSIST carries the same stamp
    // (s.qualiTrack) and restoreFromSeason() refuses a mismatch — but the in-memory
    // copy short-circuits that check, so without this stamp a classification
    // outlived its weekend: award() drops the persist when a round scores and the
    // memory survived, so from round 2 on qualiResults() stayed truthy, the sheet
    // was never offered, and every grid came off round 1's times.
    let classTrack = null;
    // The MODE `classification` belongs to — the same stamp as s.qualiMode. A
    // one-off GP and a standalone championship share ONE season object, so a
    // one-off GP's driven order at Monza passed the circuit check and gridded
    // season round 1 at Monza (bug hunt 2026-09-27).
    let classMode = null;
    let _kCache = new Float64Array(0), _kCacheTrack = null;   // |curvature| per sample; _kCacheTrack is a def ID, never the track (see below)

    // The circuit now loaded, in the same form persistOrder() stamps.
    function hereId() { return (G.track && G.track.def && G.track.def.id) || null; }
    // The session mode, in the same form persistOrder() stamps: "gp" (one-off),
    // "season" (standalone championship) or "career:<flavour>:<slot>".
    function modeId() {
      if (typeof Career !== "undefined" && Career.inCareer && Career.inCareer()) {
        const sl = Career.slot ? Career.slot() : null;
        return "career:" + (sl ? sl.flavour + ":" + sl.i : "?");
      }
      return G.seasonMode ? "season" : "gp";
    }

    // `shape` (paceLap only): { pace, free, corner } — integrate at that PACE
    // with the car's drag curve to `free` and corner caps scaled by `corner`.
    function lapTime(track, vCap, grip, shape) {
      const n = track.n, total = track.total;
      const m = Math.max(8, Math.floor(n / STEP));
      const ds = total / m;
      const latMax = G.LAT_MAX * grip;
      // aTop(), not the bare ACCEL: the straight-line ceiling below is G.vTop(),
      // which IS pace-scaled, so a bare ACCEL had the modelled field reaching a
      // halved cap at undiminished pace-5 acceleration — simulated times that
      // drifted away from driven ones the moment the pace slider left 5.
      const accel = (shape ? G.aTop() / paceNow() * shape.pace : G.aTop()) * grip;
      const brake = G.BRAKE * grip;
      const vFree = shape ? shape.free : 0, cornerK = shape ? shape.corner : 1;

      // 1. cornering limit at each sample. The |curvature| samples are pure
      // track geometry — cached across the ~22 per-car calls of one sheet
      // compute; only the grip/vCap-dependent v derivation stays per-car.
      // KEY ON IDENTITY, NOT THE OBJECT. Holding `track` here pinned the whole
      // thing — roadGeo (_keepPositions), terrainGeo, _lights, map, the
      // px/py/pz/rx/rz/hw centreline arrays, lampPosts, def — until the NEXT
      // quali sheet on a DIFFERENT circuit. Qualify at Monza, quit, then race Spa
      // and Silverstone and Monaco: Monza is still strongly reachable from module
      // scope the whole time. quitToMenu() clears five other caches and never
      // knew about this one. A def id is all the invalidation needs; track-lights.js's
      // _postNodeMemo (a WeakMap keyed on track) is the same lesson.
      const _kId = (track && track.def && track.def.id) || null;
      if (_kCacheTrack !== _kId || _kCache.length !== m) {
        _kCacheTrack = _kId;
        _kCache = new Float64Array(m);
        for (let i = 0; i < m; i++) _kCache[i] = Math.abs(Tracks.curvature(track, (i / m) * total));
      }
      const v = new Float64Array(m);
      for (let i = 0; i < m; i++) {
        const k = _kCache[i];
        v[i] = k > 1e-5 ? Math.min(vCap, Math.sqrt(latMax / k) * cornerK) : vCap;
      }

      for (let pass = 0; pass < 2; pass++)
        for (let i = 0; i < m; i++) {
          const j = (i + 1) % m;
          const a = vFree ? accel * Math.max(0.02, 1 - v[i] / vFree) : accel;
          const reach = Math.sqrt(v[i] * v[i] + 2 * a * ds);
          if (v[j] > reach) v[j] = reach;
        }

      // 3. backward pass — you cannot still be going that fast if you must brake.
      for (let pass = 0; pass < 2; pass++)
        for (let i = m - 1; i >= 0; i--) {
          const j = (i + 1) % m;
          const reach = Math.sqrt(v[j] * v[j] + 2 * brake * ds);
          if (v[i] > reach) v[i] = reach;
        }

      // 4. integrate. Trapezoid on speed is the right average over a segment.
      let t = 0;
      for (let i = 0; i < m; i++) {
        const j = (i + 1) % m;
        t += (2 * ds) / Math.max(v[i] + v[j], 1);
      }
      return t;
    }

    // max(PACE, 0.05), read through vTop() (= VMAX · that) like every pace read.
    // A stub without VMAX (unit VMs) reads as PACE 1: today's model.
    function paceNow() { const vm = PhysicsConsts.VMAX; return vm > 0 ? G.vTop() / vm : 1; }

    // A car's free pace (the AI's own top speed) at the current PACE.
    function freeFor(tierV, skill) {
      const dd = PhysicsConsts.DIFF[G.difficulty] || PhysicsConsts.DIFF.normal;
      return G.vTop() * tierV * skill * dd.ai;
    }
    function capFor(c) { return freeFor(c.tierV, c.skill) * QUALI_TRIM; }

    // The flying lap of a car whose free pace is `free`: the QUALI_TRIM lap at
    // PACE 1, carried to the current PACE by the shape model (see PACE_CORNER).
    function paceLap(track, free, grip) {
      const p = paceNow();
      const free1 = free / p;
      // The anchor: today's trimmed model, evaluated at PACE 1.
      const anchor = lapTime(track, free1 * QUALI_TRIM, grip, { pace: 1, free: 0, corner: 1 });
      if (p === 1) return anchor;
      const shape = (q) => lapTime(track, free1 * q, grip, { pace: q, free: free1 * q, corner: PACE_CORNER });
      return anchor * shape(p) / shape(1);
    }
    function carLap(c, track, grip) { return paceLap(track, freeFor(c.tierV, c.skill), grip); }

    // The reference POLE a time-trial medal is measured against: a top-rated
    // driver (skill 1) in the tier-0 car on a flying lap — the same model
    // capFor()/lapTime() grid a field with (both flying laps) — at the
    // current pace, difficulty and weather grip. 0 with no track loaded.
    function referencePole() {
      const track = G.track;
      if (!track || !track.n) return 0;
      return paceLap(track, freeFor(Teams.TIER_V[0], 1), G.gripMult());
    }

    // One car's qualifying lap. Deterministic for a given (seed, round, car).
    //
    // The seed is passed in rather than taken from Career.rnd(), which hashes on
    // `career.seed` with no inCareer() gate. A career save is LOADED AT BOOT (so the
    // title can offer CONTINUE), so a one-off Grand Prix was drawing its grid off
    // whichever career happened to be on the device, at whatever round it was
    // sitting on: delete the career and the same sim seed produced a different
    // grid, and two players on the same seed never agreed. Career.hash is exported
    // for exactly this substitution — js/race/reliability.js already does it.
    function simLap(c, track, grip, round, seed) {
      // A FLYING lap, like the player's (js/race/flying-start.js): no standing start to charge.
      const base = carLap(c, track, grip);
      const r = DriverRatings.get(c.code, c.tier, Career.devFor(c.team && c.team.id, c.seat));
      const spread = EXEC_SPREAD * (1 - r.consistency / 100);
      const draw = Career.hash(seed, round, "quali", c.driverId || c.code) - 0.5;
      return base * (1 + draw * 2 * spread);
    }

    function drivenMap(driven) {
      if (!driven) return null;
      if (typeof driven === "number") {
        if (!(driven > 0)) return null;
        const me = G.cars.find((c) => c.isPlayer);
        return me ? new Map([[me.driverId, driven]]) : null;
      }
      if (driven instanceof Map) return driven.size ? driven : null;
      const m = new Map();
      for (const k of Object.keys(driven)) if (driven[k] > 0) m.set(k, driven[k]);
      return m.size ? m : null;
    }

    function compute(driven) {
      const track = G.track;
      if (!track || !G.cars.length) return null;
      const inCareer = Career.inCareer();
      // Round selection, narrowest fix: a non-career SEASON championship advances
      // season.round, so use it there (else the execution draw was frozen identical
      // every round). A one-off Grand Prix has no round dimension and must stay at a
      // constant 0 — routing it through raceIndex made the grid depend on how many
      // races the session had already run, which the career-isolation grid test
      // (correctly) forbids. Career keeps its own round.
      // drawRound(), not season.round: a sprint weekend runs TWO qualifying sessions
      // on one round, and the bare round gave both the identical field and grid
      // (reliability, launch, AI mistakes and weather already draw this way).
      const round = inCareer ? Career.round()
        : (G.seasonMode ? (typeof SeasonCal !== "undefined" && SeasonCal.drawRound && G.season ? SeasonCal.drawRound(G.season) : G.seasonRound) : 0);
      // The year too — see Career.seasonSeed; a standalone Season's own stamped
      // seed (SeasonCal.luckSeed), so a reload cannot re-roll qualifying luck.
      const seed = inCareer ? Career.seasonSeed()
        : G.flow === "season" && G.season && typeof SeasonCal !== "undefined" && SeasonCal.luckSeed
          ? SeasonCal.luckSeed(G.season, G.simSeed()) : G.simSeed();
      const real = drivenMap(driven);

      const rows = G.cars.map((c) => ({
        driverId: c.driverId, code: c.code, name: c.name,
        team: c.team && c.team.id, isPlayer: !!c.isPlayer,
        human: !!(real && real.has(c.driverId)),
        t: (real && real.get(c.driverId) > 0) ? real.get(c.driverId) : simLap(c, track, G.gripMult(c), round, seed),
        car: c,
      }));
      // NO TIME (driven = Infinity: every lap deleted for track limits) sits
      // behind the whole field, a second per row apart, and says so.
      let slow = 0;
      for (const r of rows) if (Number.isFinite(r.t) && r.t > slow) slow = r.t;
      for (const r of rows) if (!Number.isFinite(r.t)) { slow += 1; r.t = slow; r.noTime = true; }
      rows.sort((a, b) => a.t - b.t);
      const pole = rows[0].t;
      rows.forEach((r, i) => { r.pos = i + 1; r.gap = +(r.t - pole).toFixed(3); r.t = +r.t.toFixed(3); });
      return rows;
    }

    // Career owns its own save when one is active; otherwise the season object
    // persists through the plain store. Best-effort: a write failure here must
    // not stop qualifying from proceeding.
    function persistSeason(s) {
      try {
        if (typeof Career !== "undefined" && Career.inCareer && Career.inCareer()) Career.save();
        else if (typeof SeasonCal !== "undefined") SeasonCal.save(s);
      } catch { /* persist is best-effort */ }
    }

    function seatKey(driverId, team) { return driverId + "|" + (team && team.id || team || ""); }

    function persistOrder() {
      const s = G.season;
      if (!s || !classification) return;
      // A provisional all-AI sheet is not a weekend result — writing it here is
      // what made every openQuali() throw away a driven grid. Friend races must
      // not stamp Career/season either: the lobby can sit on an active career
      // save. The lobby owns qualifying BEFORE NetPlay adopts its sessions;
      // the active race flag alone cannot identify this phase.
      if (!classification.some((r) => r.human)) return;
      if (G.netLobby && G.netLobby.qualifying && G.netLobby.qualifying()) return;
      if (G.netPlay && G.netPlay.active && G.netPlay.active()) return;
      if (typeof Career !== "undefined" && Career.conflicted && Career.conflicted()) return;
      if (typeof SeasonCal !== "undefined" && SeasonCal.conflicted && SeasonCal.conflicted()) return;
      // A one-off GP runs on the standalone season's object: it must never
      // overwrite the grid a season (or career) round is keeping for CONTINUE.
      if (modeId() === "gp" && s.qualiOrder && s.qualiMode !== "gp") return;
      // noTime rides along: its t is the synthetic slowest+1, which a restore
      // would otherwise paint as a real "+1.000" lap (and DRIVEN) on the sheet.
      s.qualiOrder = classification.map((r) => r.noTime
        ? { id: r.driverId, t: r.t, human: !!r.human, noTime: true }
        : { id: r.driverId, t: r.t, human: !!r.human });
      // And whose weekend it was: a team or driver change makes the order a
      // stranger's lap times under the new seat (see seatKey).
      const me = classification.find((r) => r.isPlayer);
      if (me) s.qualiSeat = seatKey(me.driverId, me.team);
      else delete s.qualiSeat;
      // Stamp the circuit: an order restored onto a different track is a
      // grid drawn from the wrong lap times.
      s.qualiTrack = hereId();
      s.qualiMode = modeId();   // and the mode — see classMode
      persistSeason(s);
    }

    function restoreFromSeason() {
      // A classification stamped for ANOTHER circuit is this weekend's grid drawn
      // from the wrong lap times — the same rule qualiTrack applies to the persist
      // three lines up. Drop it before the short-circuit below, so results(),
      // order() and begin() all inherit the check.
      const mode = modeId();
      if (classification && ((classTrack && hereId() && classTrack !== hereId()) ||
                             (classMode && classMode !== mode))) {
        classification = null; classTrack = null; classMode = null;
      }
      const raw = G.season && G.season.qualiOrder;
      if (classification || !Array.isArray(raw) || !raw.length) return !!classification;
      const here = hereId();
      if (G.season.qualiTrack && here && G.season.qualiTrack !== here) return false;
      // An unstamped (pre-2026-09-27) order is accepted as before.
      if (G.season.qualiMode && G.season.qualiMode !== mode) return false;
      const byId = new Map();
      if (G.cars) for (const c of G.cars) byId.set(c.driverId, c);
      // An imported/older save may name a driver twice or one no longer in
      // the field. Length alone lets duplicate rows through to order(), which
      // then grids the same car twice and omits another live car.
      const ids = raw.map((e) => e && typeof e === "object" ? e.id : e);
      if (ids.length !== byId.size || new Set(ids).size !== byId.size ||
          ids.some((id) => !byId.has(id))) return false;
      // The order is the PLAYER's weekend: a different seat (team or driver
      // swapped since) refuses it, as another circuit does. An unstamped
      // (older) order is accepted as before.
      const seat = G.season.qualiSeat;
      if (seat) {
        const me = G.cars && G.cars.find((c) => c.isPlayer);
        if (me && seatKey(me.driverId, me.team) !== seat) return false;
      }
      classification = raw.map((entry, i) => {
        const obj = entry && typeof entry === "object";
        const driverId = obj ? entry.id : entry;
        const car = byId.get(driverId);
        return {
          driverId,
          pos: i + 1,
          t: obj && entry.t > 0 ? entry.t : 0,
          gap: 0,
          code: car ? car.code : "",
          name: car ? car.name : "",
          team: car && car.team ? (car.team.id || car.team) : null,
          isPlayer: !!(car && car.isPlayer),
          human: !!(obj && entry.human),
          ...(obj && entry.noTime ? { noTime: true } : null),
        };
      });
      classTrack = G.season.qualiTrack || here;
      classMode = G.season.qualiMode || mode;
      const pole = classification[0] && classification[0].t > 0 ? classification[0].t : 0;
      for (const r of classification) r.gap = pole && r.t > 0 ? +(r.t - pole).toFixed(3) : 0;
      return true;
    }

    function simulate(driven) {
      const rows = compute(driven);
      if (rows) { classification = rows; classTrack = hereId(); classMode = modeId(); persistOrder(); }
      Log.info("game", "Quali.simulate n=" + (rows ? rows.length : 0));
      return rows;
    }

    // Read-only: the model's times for the current track, classification untouched.
    function preview(driven) {
      const rows = compute(driven);
      return rows ? rows.map(({ car, ...row }) => row) : null;
    }

    // The grid order gridUp() consumes, mapped onto the LIVE cars by driverId.
    //
    // It must not return the car objects the classification captured: startRace()
    // calls makeCars() again, so by the time the grid is built those references are
    // orphans. Handing them over placed twenty-two cars nobody was driving and left
    // the real field at prog 0 — where fieldState() then reported Teams.LIST order
    // and looked plausible enough to pass a careless check.
    //
    // Returns null unless every live car is accounted for, so a partial map falls
    // back to the normal grid instead of placing half a field.
    function order(live) {
      restoreFromSeason();
      if (!classification || !live || !live.length) return null;
      const byId = new Map(live.map((c) => [c.driverId, c]));
      const out = [];
      for (const r of classification) {
        const c = byId.get(r.driverId);
        if (c) out.push(c);
      }
      return out.length === live.length ? out : null;
    }
    function results() {
      restoreFromSeason();
      if (!classification || !classification.some((r) => r.t > 0)) return null;
      return classification.map(({ car, ...row }) => row);   // drop the live car ref
    }
    // In-memory only — openQuali() must not call this, or reopening the sheet
    // wipes a driven grid. Pass true (quit-to-menu, post-GP award
    // already deletes) when THIS weekend's order must not come back.
    function forgetOrder() {
      const s = G.season;
      if (!s || !s.qualiOrder) return;
      delete s.qualiOrder;
      delete s.qualiTrack;
      delete s.qualiMode;
      delete s.qualiSeat;
      persistSeason(s);
    }
    function clear(forget) {
      classification = null;
      classTrack = null; classMode = null;
      if (forget) forgetOrder();
    }

    // Restore a driven persist, or draw a fresh provisional. Does not wipe
    // qualiOrder — that was the sheet-reopen bug.
    function begin() {
      restoreFromSeason();
      if (classification) return classification;
      return simulate(0);
    }

    // The classification as the SHEET draws it (js/ui/quali-sheet.js): the
    // current rows, live car refs dropped, no restore — build() always read the
    // in-memory classification as-is, and this keeps that contract. null when
    // nothing has been simulated or restored.
    function rows() {
      return classification ? classification.map(({ car, ...row }) => row) : null;
    }

    return { simulate, preview, order, results, rows, clear, begin, forgetOrder, lapTime, capFor, carLap, referencePole };
  }

  return { create, STEP, QUALI_TRIM, EXEC_SPREAD, MEDALS, MEDAL_RANK, medalFor };
})();
Object.freeze(Quali);
