/* Apex 26 — QUALIFYING: one flying lap, and the simulated times it is measured against. THE SHAPE OF THE SESSION. Qualifying is not a new game `state` — it is a n… */
const Quali = (function () {
  "use strict";

  const STEP = 4;

  // CALIBRATION: two constants, fitted at the PACE the game SHIPS (#5783 Q1).
  //
  // A quasi-steady model drives the theoretical friction limit and the AI does not:
  // it carries margin, brakes early and does not take the optimal line. A ratio near
  // 0.97 (model lap / the same car's driven lap) is the target: the simulated pole
  // sits just inside the best lap the AI actually manages and pole has to be earned.
  // It does NOT put a player at AI pace mid-field today: the sheet is about a second
  // wide (see SPREAD below), so at 0.97 a lap at the AI's own pace is slower than
  // P22 almost everywhere (docs/notes/QUALI-REFIT-2026-11-18.md; #5786). Above 1.0
  // would hand out free poles — and that is what this file shipped until the refit.
  //
  // HISTORY. A straight-line trim (0.75 of the car's cap) was fitted at PACE 1 and
  // carried to other paces by a shape ratio (R3-RACE-INTEGRITY-1). At the shipped
  // PACE 0.84 it ran 0.9 % (Monaco) to 15 % (one-third of the calendar over 1.08)
  // SLOWER than the AI drives: Monza hard, sheet pole 132.2 s against the same cars'
  // best laps of 118.6-122.6 s, and time-trial gold a lap the AI beat by 6 %. Two
  // causes: the trim was fitted at another pace and on an older driving model, and
  // the corner caps ignored what the driven AI is charged in a corner — skill times
  // the level's `corner` (AiDrive ctx.diffCorner), so normal and easy read 1-3 %
  // off hard.
  //
  // NOW the lap is integrated at the CURRENT PACE on the car's own drag curve
  // (updateCar pulls ACCEL·PACE·(1 - v/vmax), so the distance a car needs to near
  // its top speed grows with PACE), to the car's own free pace, with corner caps
  // sqrt(latMax/k) · PACE_CORNER · skill · dd.corner; QUALI_TRIM scales the result.
  // PACE_CORNER scales the flat corner cap for what it leaves out (the AI's
  // downforce and kerb use); an explicit aero term, and brake or accel scales,
  // fitted no better.
  //
  // FITTED (VM; tables in docs/notes/QUALI-REFIT-2026-11-18.md): every circuit of the
  // calendar at easy / normal / hard, PACE 0.8396, each AI car's BEST of three laps
  // in clear air (thinned field), QUALI_TRIM solved so the median circuit sits on
  // 0.97. Per-circuit median model/driven, 52 circuits x 3 levels:
  //
  //                         min     median   max      level medians e/n/h
  //     shipped trim       0.993   1.080    1.230    1.093 / 1.083 / 1.062
  //     corner 1.15, no dd 0.924   0.974    1.015    0.965 / 0.972 / 0.986
  //     corner 1.15 · dd   0.930   0.970    1.005    0.972 / 0.970 / 0.969   <- here
  //
  // dd.corner is what puts the three levels on one line. CORNER 1.15 with skill
  // (~0.97 for most of the grid) is the PACE-1 shape fit's 1.1 for a median driver.
  // tests/unit/quali-absolute-parity-vm.test.mjs holds the band at the shipped PACE;
  // tests/unit/quali-pace-parity-vm.test.mjs holds 0.44 / 1.34 against PACE 1.
  //
  // Re-measure whenever the driving model changes: the absolute parity test's
  // diagnostics, or the calendar script in docs/notes/QUALI-REFIT-2026-11-18.md.
  //
  // QUALI_TRIM and this fit now place only referencePole (neutral wing, no circuit
  // factor; pit loss and the replay scale). Medals: referencePole("medal"). The FIELD's lap is carLap, below.
  // The driven field splits by the team's wing level as much as by tierV·skill
  // (Gasly and Ocon, same car tier and skill, 3.8 s apart alone at Monza; swapping
  // aeroLoad swaps their laps), so carLap reads the wing as well.
  const QUALI_TRIM = 0.92;
  const PACE_CORNER = 1.15;

  // THE FIELD'S LAP (carLap; referencePole keeps QUALI_TRIM and a neutral wing) is
  // the circuit's measured factor x the integrated lap, and the corner
  // cap also takes the car's wing as the driven AI is charged it (AiDrive.aeroGrip).
  // CALIB[id] is driven / integrated: the median, over AI works cars driving solo
  // qualifying flying laps at easy, normal and hard, of each timed lap over this model's
  // uncalibrated lap for the same car. GENERATED from tests/data/quali-calibration.json
  // by tools/gen/gen-quali-calib.mjs (`npm run gen`); the measurement itself is a tool
  // run, `node tools/check/quali-calibrate.mjs --update` (never in CI,
  // and not in tools/lib/generated-paths.mjs GENERATED_PATHS, which a merge regenerates).
  // RE-MEASURE when the AI's driving changes: tests/unit/quali-absolute-parity-vm.test.mjs
  // fails, the tool is re-run and the block regenerated. A circuit with no row (a
  // TRACK DESIGNER layout) takes CALIB_DEFAULT, the calendar median.
  // @gen-quali-calib start
  const CALIB = {
    abudhabi: 0.9386, albert_park: 0.9278, anderstorp: 0.9428, bahrain: 0.9408, baku: 0.9582, brands_hatch: 0.9352,
    buddh: 0.9308, buenos_aires: 0.9383, catalunya: 0.9359, cota: 0.9249, dijon: 0.9324, donington: 0.9534,
    estoril: 0.9422, fuji: 0.9248, hockenheim: 0.9513, hungaroring: 0.9305, imola: 0.9701, indianapolis: 0.9461,
    interlagos: 0.9390, istanbul: 0.9447, jacarepagua: 0.9314, jeddah: 0.9496, jerez: 0.9297, korea: 0.9320,
    kyalami: 0.9438, madrid: 0.9355, magny_cours: 0.9467, mexico: 0.9293, miami: 0.9372, monaco: 0.9610,
    mont_tremblant: 0.9638, montreal: 0.9480, monza: 0.9464, mosport: 0.9119, mugello: 0.9224, nurburgring: 0.9436,
    okayama: 0.9415, paul_ricard: 0.9221, portimao: 0.9654, qatar: 0.9473, redbull: 0.9274, sepang: 0.9458,
    shanghai: 0.9358, silverstone: 0.9213, singapore: 0.9454, sochi: 0.9379, spa: 0.9361, suzuka: 0.9260,
    vegas: 0.9382, watkins_glen: 0.9583, zandvoort: 0.9485, zolder: 0.9385,
  };
  const CALIB_DEFAULT = 0.9385;
  // @gen-quali-calib end
  const EXEC_SPREAD = 0.012;
  const QUALI_BIAS = 0.003;

  // Time-trial MEDALS as multiples of the medal pole (referencePole("medal") below):
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
    const _kAnon = new WeakMap();   // id-less tracks: keyed on the object, weakly, so it pins nothing (#4343)

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

    // A pending deletion belongs to this tab's weekend, not to a disposable
    // car or a completed grid. Keep one per mode/slot across reloads.
    const deletedLaps = new Map();
    function deletedLapScope(c) {
      const mode = modeId(), s = G.season;
      const day = mode !== "gp" && s ? SeasonCal.drawRound(s) : 0;
      const seed = mode === "season" ? s && s.seed : mode === "gp" ? 0 : Career.seasonSeed();
      return ["apex26.qualiDeleted." + mode, JSON.stringify([hereId(), day, seed, seatKey(c.driverId, c.team)])];
    }

    function pendingDeletion(key) {
      if (deletedLaps.has(key)) return deletedLaps.get(key);
      let value = null;
      try { value = sessionStorage.getItem(key); } catch (_) { /* tab storage unavailable */ }
      deletedLaps.set(key, value);
      return value;
    }

    function markDeletedLap(c, friend) {
      c.qualiCut = true;
      if (friend || c.lap < 1) return;
      const [key, stamp] = deletedLapScope(c);
      if (pendingDeletion(key) === stamp) return;
      deletedLaps.set(key, stamp);
      try { sessionStorage.setItem(key, stamp); } catch (_) { /* memory still covers a quit */ }
    }

    function hasDeletedLap(c, friend) {
      if (!c) return false;
      if (c.qualiCut) return true;
      if (friend) return false;
      const [key, stamp] = deletedLapScope(c);
      return pendingDeletion(key) === stamp;
    }

    function clearDeletedLap(c, friend) {
      if (!c || friend) return;
      const [key, stamp] = deletedLapScope(c);
      if (pendingDeletion(key) !== stamp) return;
      deletedLaps.set(key, null);
      try { sessionStorage.removeItem(key); } catch (_) { /* memory still covers a quit */ }
    }

    // `shape` (carLap): { pace, free, corner } — integrate at that PACE
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
      // A track with no def id has nothing to key on, and two of them with the
      // same sample count shared one cache (#4343): those key on the object
      // through a WeakMap instead, which pins nothing.
      const _kId = (track && track.def && track.def.id) || null;
      const anon = _kId == null && track && typeof track === "object";
      let kc = anon ? _kAnon.get(track) : (_kCacheTrack === _kId ? _kCache : null);
      if (!kc || kc.length !== m) {
        kc = new Float64Array(m);
        for (let i = 0; i < m; i++) kc[i] = Math.abs(Tracks.curvature(track, (i / m) * total));
        if (anon) _kAnon.set(track, kc);
        else { _kCacheTrack = _kId; _kCache = kc; }
      }
      const v = new Float64Array(m);
      for (let i = 0; i < m; i++) {
        const k = kc[i];
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

    // The difficulty row the driven AI reads (game.js falls back to normal the same way).
    function diffRow() { return PhysicsConsts.DIFF[G.difficulty] || PhysicsConsts.DIFF.normal; }
    // Its corner authority as the driven AI is charged it: skill × the level's `corner` (ctx.diffCorner; a stub row, 1).
    function cornerFor(skill) { const dc = diffRow().corner; return skill * (dc > 0 ? dc : 1); }
    // ...capped as the driven AI is (AiDrive.diffCorner).
    function cornerCeil() { const dc = diffRow().corner; return dc > 1 ? dc : 1; }
    // ...and its wing: AiDrive scales lateral grip by aeroGrip(aeroLoad), so corner speed goes with its root. A HUMAN
    // reads the SEAT's wing (the AI's there; a human pays for wing in top speed, #5791): no setup slider buys grid
    // places and the sheet ignores which seat is the player (career.spec); not the neutral wing (#5786).
    function seatWing(t) { const s = t && typeof Parts !== "undefined" && (Career.inCareer() && Career.aiSetup && Career.aiSetup(t) || Parts.getFactorySetup(t)); return s ? Parts.aeroLoad(s, t) : 0.5; }
    function wingFor(c) { return typeof AiDrive !== "undefined" && AiDrive.aeroGrip ? Math.sqrt(AiDrive.aeroGrip(c.human ? seatWing(c.team) : c.aeroLoad)) : 1; }
    function calibFor(track) {
      const id = track && track.def && track.def.id;
      return id != null && Object.prototype.hasOwnProperty.call(CALIB, id) ? CALIB[id] : CALIB_DEFAULT;
    }

    // `raw`: the integrated lap alone (what tools/check/quali-calibrate.mjs measures the factor against).
    // AiDrive.paceTrim (vmax, corners) as game.js drives the AI (#5330); a human reads its seat's; tier-less (referencePole's synthetic car), 1.
    function carLap(c, track, grip, raw) {
      const k = c.tier != null && typeof AiDrive != "undefined" && AiDrive.paceTrim ? AiDrive.paceTrim(Teams.TIER_V[c.tier] * c.skill) : 1;
      const free = G.vTop() * Math.min(PhysicsConsts.BAND_CEIL || 1, c.tierV * c.skill * diffRow().ai * k);
      const t = lapTime(track, free, grip, { pace: paceNow(), free, corner: PACE_CORNER * Math.min(cornerCeil(), cornerFor(c.skill) * k) * wingFor(c) });
      return raw ? t : calibFor(track) * t;
    }

    // The reference POLE a time-trial medal is measured against: a top-rated
    // driver (skill 1) in the tier-0 car on a flying lap — the same model
    // capFor()/lapTime() grid a field with (both flying laps) — at the
    // current pace, difficulty and weather grip. 0 with no track loaded.
    // The grip is the WEATHER'S TYRE on today's road, which is what every car in the session runs
    // (TyreModel.treadOf: no fitted tread => treadFor). A bare G.gripMult() is the slick column — in the wet
    // a lap no car drives, 0.4 % (wet) to 3.4 % (rain) slower than the field's own pole at Monza (#5585).
    // Dry is the same number either way.
    function referenceGrip() {
      const w = G.trackWetness ? G.trackWetness() : NaN;
      if (typeof TyreModel === "undefined" || !Number.isFinite(w)) return G.gripMult();
      return TyreModel.weatherGrip(TyreModel.treadFor(G.raceWeather, w), w);
    }
    function topLap(raw) { const t = G.track; return t && t.n ? carLap({ tierV: Teams.TIER_V[0], skill: 1 }, t, referenceGrip(), raw) : 0; }
    // Neutral wing. "medal" (TT, daily, records) is calibrated: gold 1.4-1.8 % under the AI pole everywhere, not
    // 3-7 % (decision C, audit 73); x0.9915 keeps that gap now the AI takes paceTrim (#5686, Bryce 2026-11-20 (b)).
    // Pit loss and the replay scale keep QUALI_TRIM.
    function referencePole(kind) { return kind === "medal" ? 0.9915 * topLap(false) : QUALI_TRIM * topLap(true); }

    // One car's qualifying lap. Deterministic for a given (seed, round, car).
    //
    // The seed is passed in, not Career.rnd() (career.seed, no inCareer() gate): a career save is LOADED AT
    // BOOT, so a one-off Grand Prix drew its grid off whichever career sat on the device, and two players on
    // the same seed never agreed. Career.hash is exported for this substitution (as js/race/reliability.js).
    function simLap(c, track, grip, round, seed) {
      // A FLYING lap, like the player's (js/race/flying-start.js): no standing start to charge.
      const base = carLap(c, track, grip);
      const r = DriverRatings.get(c.code, c.tier, Career.devFor(c.team && c.team.id, c.seat));
      const spread = EXEC_SPREAD * (1 - r.consistency / 100);
      const draw = Career.hash(seed, round, "quali", c.driverId || c.code) - 0.5;
      // Quali bias (#1566, style axis): ±QUALI_BIAS of a SIMULATED lap, keyed by driver code like the
      // spread above (not by which car is the player, or the grid would depend on the seat); a driven lap never gets here.
      return base * (1 + draw * 2 * spread) * (r.qualiBias ? 1 - QUALI_BIAS * DriverRatings.style01(r.qualiBias) : 1);
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
      let raw = G.season && G.season.qualiOrder;
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
      let ids = raw.map((e) => e && typeof e === "object" ? e.id : e);
      // A duel trims the field after qualifying: read the saved (full) order for the live pair.
      const duel = byId.size === 2 && G.cars.some((c) => c && c.duelRival);
      if (duel && new Set(ids).size === ids.length && [...byId.keys()].every((id) => ids.includes(id))) {
        raw = raw.filter((e, i) => byId.has(ids[i]));
        ids = ids.filter((id) => byId.has(id));
      }
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

    // forgetOrder / lapTime stay create()-local — begin() and the
    // pace helpers call them; no quali.forgetOrder / .lapTime / .capFor reader.
    return { simulate, preview, order, results, rows, clear, begin, carLap, referencePole,
      markDeletedLap, hasDeletedLap, clearDeletedLap };
  }

  // STEP / QUALI_TRIM / EXEC_SPREAD stay module-local — only create() and the
  // medal helpers are read outside this file.
  return { create, MEDALS, MEDAL_RANK, medalFor };
})();
Object.freeze(Quali);
