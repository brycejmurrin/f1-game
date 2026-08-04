/* Apex 26 — QUALIFYING: one flying lap, and the simulated times it is measured
   against.

   THE SHAPE OF THE SESSION. Qualifying is not a new game `state` — it is a new
   `session` (see the flow/session axes in game.js). The player's hot lap is
   already implemented: it is a time trial. One car on track, no AI, lap timing,
   lap validity, ghost recording. So quali runs `session = "quali"` down that same
   path and the state machine is untouched.

   WHY THE AI TIMES ARE MODELLED, NOT DRIVEN. Running twenty-one AI cars around a
   lap of real physics would be exact, but it costs a second or more of frozen UI
   on a phone. Instead this is a proper quasi-steady lap simulation — the standard
   forward/backward pass every lap-time tool uses:

     1. the cornering-limited speed at each sample, sqrt(LAT_MAX·grip / |k|)
     2. a FORWARD pass capping how fast the car can have accelerated to
     3. a BACKWARD pass capping how late it can still brake for what is coming

   It reads the same LAT_MAX / BRAKE / ACCEL constants the driving model does and
   the same curvature the road is built from, so it responds correctly to the
   circuit, the car and the driver without a fudge factor calibrated per track. A
   pure `length / speed` estimate cannot do that — and would put the player's real
   lap on a scale that does not mean anything.

   DETERMINISM. The per-driver spread comes from Career.rnd (a stateless hash),
   never simRnd — drawing from the physics stream here would make qualifying
   change the race that follows it.

   Live game state comes through the ctx façade handed to Quali.create(ctx) (see
   the `G` object in game.js). Consumes globals Tracks, Teams, DriverRatings,
   Career, GameAudio. Must load BEFORE js/game.js (see index.html). */
const Quali = (function () {
  "use strict";

// How many samples of the centreline to integrate. The track is stored at ~1 m
// resolution; every 4th point is plenty for a lap time and keeps the whole
// simulation well under a frame even on a slow phone.
const STEP = 4;

// A flying lap is not a race stint: tyres are fresh, the car is light, and the
// driver is taking one committed run at it. Race pace sits a few percent off
// qualifying pace, and this is the factor that separates them.
const QUALI_TRIM = 1.035;

// How far a driver's one-lap execution can stray, before consistency scales it.
// ±0.6% on a 90 s lap is a little over half a second — enough that the order is
// not simply the car order, not so much that it is a lottery.
const EXEC_SPREAD = 0.012;

function create(G) {
  const { $, els } = G;

  // The classification for the session just run: [{driverId, code, name, team,
  // t, gap, isPlayer}], fastest first. Null until a session has been held.
  let classification = null;

  // ---------- the lap-time model ----------

  // Corner-limited, then acceleration-limited, then braking-limited. `vCap` is the
  // car's straight-line ceiling in m/s; `grip` scales the friction circle for wet.
  function lapTime(track, vCap, grip) {
    const n = track.n, total = track.total;
    const m = Math.max(8, Math.floor(n / STEP));
    const ds = total / m;
    const latMax = G.LAT_MAX * grip;
    const accel = G.ACCEL * grip;
    const brake = G.BRAKE * grip;

    // 1. cornering limit at each sample
    const v = new Float64Array(m);
    for (let i = 0; i < m; i++) {
      const k = Math.abs(Tracks.curvature(track, (i / m) * total));
      // A dead-straight sample has k ~ 0, which would divide to Infinity — the
      // straight-line ceiling is the answer there.
      v[i] = k > 1e-5 ? Math.min(vCap, Math.sqrt(latMax / k)) : vCap;
    }

    // 2. forward pass — you cannot arrive faster than you could accelerate to.
    // Wraps once past the end so the start/finish line is not a false reset.
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

  // The straight-line ceiling for one car, in m/s — the same product the per-car
  // update uses for vmax, so a faster car here is a faster car on track.
  function capFor(c) {
    const dd = GameTables.DIFF[G.difficulty] || GameTables.DIFF.normal;
    return G.vTop() * c.tierV * c.skill * dd.ai * QUALI_TRIM;
  }

  // One car's qualifying lap. Deterministic for a given (career seed, round, car).
  function simLap(c, track, grip, round) {
    const base = lapTime(track, capFor(c), grip);
    const r = DriverRatings.get(c.code, c.tier, Career.devFor(c.team && c.team.id, c.seat));
    // Execution: a driver who is not consistent is not slower on average, just
    // less likely to put the whole lap together on the one run that counts.
    const spread = EXEC_SPREAD * (1 - r.consistency / 100);
    const draw = Career.rnd(round, "quali", c.driverId || c.code) - 0.5;
    return base * (1 + draw * 2 * spread);
  }

  // ---------- running a session ----------

  // Simulate every car, including the player, and RETURN the rows without
  // storing them. Split from simulate() so a probe (__apex.qualiSim) can read the
  // model on any track without overwriting a real weekend's classification.
  // `playerTime` overrides the player's row when they actually drove the lap.
  function compute(playerTime) {
    const track = G.track;
    if (!track || !G.cars.length) return null;
    const grip = G.gripMult();
    const round = Career.active() ? Career.round() : 0;

    const rows = G.cars.map((c) => ({
      driverId: c.driverId, code: c.code, name: c.name,
      team: c.team && c.team.id, isPlayer: !!c.isPlayer,
      t: (c.isPlayer && playerTime > 0) ? playerTime : simLap(c, track, grip, round),
      car: c,
    }));
    rows.sort((a, b) => a.t - b.t);
    const pole = rows[0].t;
    rows.forEach((r, i) => { r.pos = i + 1; r.gap = +(r.t - pole).toFixed(3); r.t = +r.t.toFixed(3); });
    return rows;
  }

  // Run the session for real: compute and keep the result as THE classification.
  function simulate(playerTime) {
    const rows = compute(playerTime);
    if (rows) classification = rows;
    return rows;
  }

  // Read-only: the model's times for the current track, classification untouched.
  function preview(playerTime) {
    const rows = compute(playerTime);
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
    return classification
      ? classification.map(({ car, ...row }) => row)   // drop the live car ref
      : null;
  }
  function clear() { classification = null; }

  // ---------- the sheet ----------

  function build() {
    const body = $("q-table");
    if (!body) return;
    body.textContent = "";
    if (!classification) return;
    for (const r of classification) {
      const team = Teams.LIST.find((t) => t.id === r.team);
      const row = document.createElement("div");
      const podium = r.pos === 1 ? " p1" : r.pos === 2 ? " p2" : r.pos === 3 ? " p3" : "";
      row.className = "res-row" + podium + (r.isPlayer ? " you" : "");
      const pos = document.createElement("span"); pos.className = "res-pos"; pos.textContent = r.pos;
      const sw = document.createElement("span"); sw.className = "res-swatch";
      sw.style.background = G.cssCol(team ? team.color : [0.5, 0.5, 0.5]);
      const nm = document.createElement("span"); nm.className = "res-name"; nm.textContent = r.code + "  " + r.name;
      const tm = document.createElement("span"); tm.className = "res-pts q-time";
      // Pole shows an absolute lap time; everyone else shows the gap to it, which
      // is the number that actually says something about the session.
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

  function open() { build(); $("quali").hidden = false; ScrollFade.refresh(); }
  function close() { $("quali").hidden = true; }

  return { simulate, preview, order, results, clear, build, open, close, lapTime, capFor };
}

return { create, STEP, QUALI_TRIM, EXEC_SPREAD };
})();
