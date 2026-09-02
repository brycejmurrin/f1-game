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

const EXEC_SPREAD = 0.012;

function create(G) {
  Log.info("game", "Quali.create");
  const { $ } = G;

  let classification = null;
  let _kCache = new Float64Array(0), _kCacheTrack = null;   // |curvature| per sample

  function lapTime(track, vCap, grip) {
    const n = track.n, total = track.total;
    const m = Math.max(8, Math.floor(n / STEP));
    const ds = total / m;
    const latMax = G.LAT_MAX * grip;
    // aTop(), not the bare ACCEL: the straight-line ceiling below is G.vTop(),
    // which IS pace-scaled, so a bare ACCEL had the modelled field reaching a
    // halved cap at undiminished pace-5 acceleration — simulated times that
    // drifted away from driven ones the moment the pace slider left 5.
    const accel = G.aTop() * grip;
    const brake = G.BRAKE * grip;

    // 1. cornering limit at each sample. The |curvature| samples are pure
    // track geometry — cached across the ~22 per-car calls of one sheet
    // compute; only the grip/vCap-dependent v derivation stays per-car.
    if (_kCacheTrack !== track || _kCache.length !== m) {
      _kCacheTrack = track;
      _kCache = new Float64Array(m);
      for (let i = 0; i < m; i++) _kCache[i] = Math.abs(Tracks.curvature(track, (i / m) * total));
    }
    const v = new Float64Array(m);
    for (let i = 0; i < m; i++) {
      const k = _kCache[i];
      v[i] = k > 1e-5 ? Math.min(vCap, Math.sqrt(latMax / k)) : vCap;
    }

    for (let pass = 0; pass < 2; pass++)
      for (let i = 0; i < m; i++) {
        const j = (i + 1) % m;
        const reach = Math.sqrt(v[i] * v[i] + 2 * accel * ds);
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

  function capFor(c) {
    const dd = GameTables.DIFF[G.difficulty] || GameTables.DIFF.normal;
    return G.vTop() * c.tierV * c.skill * dd.ai * QUALI_TRIM;
  }

  // What a STANDING start costs, in seconds, for a car whose flying pace is
  // `cap`. lapTime() integrates a lap that is already up to speed, so a car
  // leaving the line from rest is behind that model by the time it loses
  // accelerating to it: reaching v under constant a takes v/a and covers
  // v^2/(2a), a distance the flying lap covers in v/(2a) — so the loss is the
  // difference, v/(2a). Roughly two and a half seconds at F1 pace, and it
  // applies to every modelled car exactly as it applies to the driven one.
  function standingLoss(cap) {
    // Same scale as `cap`, which comes from G.vTop(): both pace-scaled, so the
    // standing loss stays ~2.5 s at every pace instead of ballooning as the
    // numerator shrank against a fixed denominator.
    return cap / (2 * Math.max(G.aTop() || 12, 1));
  }

  // One car's qualifying lap. Deterministic for a given (seed, round, car).
  //
  // The seed is passed in rather than taken from Career.rnd(), which hashes on
  // `career.seed` with no inCareer() gate. A career save is LOADED AT BOOT (so the
  // title can offer CONTINUE), so a one-off Grand Prix was drawing its grid off
  // whichever career happened to be on the device, at whatever round it was
  // sitting on: delete the career and the same sim seed produced a different
  // grid, and two players on the same seed never agreed. Career.hash is exported
  // for exactly this substitution — js/game/reliability.js already does it.
  function simLap(c, track, grip, round, seed) {
    const cap = capFor(c);
    const base = lapTime(track, cap, grip) + standingLoss(cap);
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
    const round = inCareer ? Career.round() : (G.seasonMode ? G.seasonRound : 0);
    const seed = inCareer ? Career.data().seed : G.simSeed();
    const real = drivenMap(driven);

    const rows = G.cars.map((c) => ({
      driverId: c.driverId, code: c.code, name: c.name,
      team: c.team && c.team.id, isPlayer: !!c.isPlayer,
      human: !!(real && real.has(c.driverId)),
      t: (real && real.get(c.driverId) > 0) ? real.get(c.driverId) : simLap(c, track, G.gripMult(c), round, seed),
      car: c,
    }));
    rows.sort((a, b) => a.t - b.t);
    const pole = rows[0].t;
    rows.forEach((r, i) => { r.pos = i + 1; r.gap = +(r.t - pole).toFixed(3); r.t = +r.t.toFixed(3); });
    return rows;
  }

  function persistOrder() {
    const s = G.season;
    if (!s || !classification) return;
    // A provisional all-AI sheet is not a weekend result — writing it here is
    // what made every openQuali() throw away a driven grid. Friend races must
    // not stamp Career/season either: the lobby can sit on an active career
    // save, and netPlay.active() is the "this is a room, not a championship"
    // bit. (This used to probe NetPlay.isOn(), which exists on neither the
    // module nor the instance — the guard was dead and a VS FRIEND quali
    // overwrote the real weekend's stored grid.)
    if (!classification.some((r) => r.human)) return;
    if (G.netPlay && G.netPlay.active && G.netPlay.active()) return;
    if (typeof Career !== "undefined" && Career.conflicted && Career.conflicted()) return;
    s.qualiOrder = classification.map((r) => ({
      id: r.driverId, t: r.t, human: !!r.human,
    }));
    // Stamp the circuit: an order restored onto a different track is a
    // grid drawn from the wrong lap times.
    s.qualiTrack = (G.track && G.track.def && G.track.def.id) || null;
    try {
      if (typeof Career !== "undefined" && Career.inCareer && Career.inCareer()) Career.save();
      else if (G.store) G.store.set("season", s);
    } catch (_) { /* persist is best-effort */ }
  }

  function restoreFromSeason() {
    const raw = G.season && G.season.qualiOrder;
    if (classification || !Array.isArray(raw) || !raw.length) return !!classification;
    const here = (G.track && G.track.def && G.track.def.id) || null;
    if (G.season.qualiTrack && here && G.season.qualiTrack !== here) return false;
    const byId = new Map();
    if (G.cars) for (const c of G.cars) byId.set(c.driverId, c);
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
      };
    });
    const pole = classification[0] && classification[0].t > 0 ? classification[0].t : 0;
    for (const r of classification) r.gap = pole && r.t > 0 ? +(r.t - pole).toFixed(3) : 0;
    return true;
  }

  function simulate(driven) {
    const rows = compute(driven);
    if (rows) { classification = rows; persistOrder(); }
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
  // In-memory only. openQuali() used to call this and wipe a driven grid
  // every time the sheet reopened. Pass true (quit-to-menu, post-GP award
  // already deletes) when THIS weekend's order must not come back.
  function forgetOrder() {
    const s = G.season;
    if (!s || !s.qualiOrder) return;
    delete s.qualiOrder;
    delete s.qualiTrack;
    try {
      if (typeof Career !== "undefined" && Career.inCareer && Career.inCareer()) Career.save();
      else if (G.store) G.store.set("season", s);
    } catch (_) { /* persist is best-effort */ }
  }
  function clear(forget) {
    classification = null;
    if (forget) forgetOrder();
  }

  // Restore a driven persist, or draw a fresh provisional. Does not wipe
  // qualiOrder — that was the sheet-reopen bug.
  function begin() {
    restoreFromSeason();
    if (classification) return classification;
    return simulate(0);
  }

  function build() {
    const body = $("q-table");
    if (!body) return;
    body.textContent = "";
    if (!classification) return;
    for (const r of classification) {
      const team = Teams.LIST.find((t) => t.id === r.team);
      const row = document.createElement("div");
      const podium = r.pos === 1 ? " p1" : r.pos === 2 ? " p2" : r.pos === 3 ? " p3" : "";
      // A DRIVEN lap is marked. compute() has always worked out r.human — a
      // real time substituted for a simulated one — and then thrown it away
      // here, so three rivals' actual laps were drawn identically to the
      // eighteen the model guessed. On a sheet whose whole job is "who was
      // quick", not saying which times are real is the one thing it must not
      // leave out. `you` still marks the local player, exactly as before.
      const driven = r.human && !r.isPlayer ? " q-real" : "";
      row.className = "res-row" + podium + (r.isPlayer ? " you" : "") + driven;
      const pos = document.createElement("span"); pos.className = "res-pos"; pos.textContent = r.pos;
      const sw = document.createElement("span"); sw.className = "res-swatch";
      sw.style.background = G.cssCol(team ? team.color : [0.5, 0.5, 0.5]);
      const nm = document.createElement("span"); nm.className = "res-name";
      nm.textContent = r.code + "  " + r.name;
      if (driven) {
        const tag = document.createElement("span");
        tag.className = "q-real-tag";
        tag.textContent = " DRIVEN";
        nm.appendChild(tag);
      }
      const tm = document.createElement("span"); tm.className = "res-pts q-time";
      tm.textContent = r.pos === 1 ? G.fmtTime(r.t) : "+" + r.gap.toFixed(3);
      row.append(pos, sw, nm, tm);
      body.appendChild(row);
    }
    const title = $("q-title");
    if (title) {
      const you = classification.find((r) => r.isPlayer);
      title.textContent = you ? "QUALIFYING — P" + you.pos : "QUALIFYING";
    }
  }

  function open() { Log.info("game", "Quali.open"); build(); $("quali").hidden = false; ScrollFade.refresh(); }
  function close() { Log.info("game", "Quali.close"); $("quali").hidden = true; }

  return { simulate, preview, order, results, clear, begin, forgetOrder, build, open, close, lapTime, capFor };
}

return { create, STEP, QUALI_TRIM, EXEC_SPREAD };
})();
