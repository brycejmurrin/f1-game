/* Apex 26 — SoakRun: the hands-free half of PhoneRecorder (AUTO SOAK).

   One tap on SETTINGS > METRICS > PHONE TEST > AUTO SOAK starts a wet race on a
   fixed circuit with the full grid and the chase camera, drives the PLAYER car
   itself, records for SOAK_MIN minutes with PhoneRecorder, then stops, parks
   the car under the pause menu and leaves SHARE ready. Nothing here runs until
   start(): no listener, timer or rAF exists while idle.

   HOW THE CAR IS DRIVEN. The player car is NOT switched to AI physics. This
   module only synthesises the INPUT, through the same seam tests use
   (G._testInput, read by inputOf() for the local car), so the human physics
   path, the assists and the settings the player chose are exactly what a real
   race runs. The law is tests/specs/autopilot.spec.js's closed loop, as run by
   tools/gfx/gpu-game-check.mjs: a braking envelope over look-ahead curvature
   plus pure pursuit. THE ARC RULE: that law reads Tracks.curvature() and the
   road to steer the player, which the arc rule forbids in a real race. It is
   reachable ONLY through start() (a deliberate soak, never a default, never a
   setting that persists) and clears _testInput the moment it stops, so a normal
   race and every assist-off rule are untouched. Classified in docs/PHYSICS.md §Curvature
   channels as assist-gated (soak-only input synthesiser, gated by start()).

   DRIVE (#6397). drive() lends the same law to an agent: the phone bridge's `drive` command (to the pit box, or an
   autopilot lap) and __apex.rollout's named policies ("autopilot", "box"). It is the same input-only seam with the
   same gate — reachable only from a bridge or agent command, released on stop, pause, quit, a hidden page or a
   real touch — and its lane lines are PitLane's own (laneX, laneDrive, entryV, approachV). DRIVE below.

   THE PAGE MUST STAY IN THE FOREGROUND. iOS Safari pauses a hidden or locked
   page (game.js pauses on document.hidden), so a soak that is backgrounded just
   stops; the game already holds a screen wake lock during a race
   (js/core/wake-lock.js). */
const SoakRun = (function () {
  "use strict";

  const SOAK_MIN = 15;
  const TRACK_ID = "monza";
  const LAPS = 40;                     // far more than 15 min of racing: the flag never ends the soak
  const DISTS = []; for (let d = 5; d <= 160; d += 6) DISTS.push(d);
  const VMAX = 94, KP = 2.4;
  // Autopilot envelope (tests/specs/autopilot.spec.js): dry 13/24, wet 9/16.
  // GPU TEST / lap bench pass weather:"dry"; AUTO SOAK defaults to wet.
  const A_LAT_DRY = 13, A_BRAKE_DRY = 24;
  const A_LAT_WET = 9, A_BRAKE_WET = 16;

  let _G = null;
  let _run = null;                     // { raf, t0, started, ... } while active
  let _last = { state: "idle", reason: "" };

  function wrapPi(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

  // The road under the player, as probe()/scan() in js/agent/apex.js read it.
  function probe(G) {
    const P = G.player, T = G.track;
    if (!P || !T) return null;
    const smp = G.smp;
    Tracks.sample(T, P.s, smp);
    const angle = P.head != null ? wrapPi(Math.atan2(smp.t[0], smp.t[2]) - P.head) : 0;
    return { x: P.x, angle, k: Tracks.curvature(T, P.s), hw: smp.hw, speed: P.speed, s: P.s };
  }

  // Wet family (atmosphere wxWet): wet / rain / storm. Everything else is dry grip.
  function envelope(G) {
    const w = G && G.raceWeather;
    if (w === "wet" || w === "rain" || w === "storm") return { aLat: A_LAT_WET, aBrake: A_BRAKE_WET };
    return { aLat: A_LAT_DRY, aBrake: A_BRAKE_DRY };
  }

  // One control frame: returns the _testInput to hold until the next frame. `aim` (the bridge drive, below) bends
  // the same law onto a lane: `x` a lateral to pursue instead of the centreline, `vMax` a cap under the envelope,
  // `hold` a car meant to stop (no stall push, no off-road lift, no brake into reverse).
  function control(G, st, dt, aim) {
    const p = probe(G);
    if (!p) return null;
    const T = G.track, P = G.player;
    const { aLat, aBrake } = envelope(G);
    let kSteer = p.k;
    const steerLook = Math.max(9, p.speed * 0.4);
    let vT = Math.abs(p.k) > 1e-4 ? Math.sqrt(aLat / Math.abs(p.k)) : VMAX;
    for (let j = 0; j < DISTS.length; j++) {
      const d = DISTS[j];
      const k = Tracks.curvature(T, G.wrapS(P.s + d));
      if (d <= steerLook) kSteer = k;
      const vCorner = Math.abs(k) > 1e-4 ? Math.sqrt(aLat / Math.abs(k)) : VMAX;
      const vAllow = Math.sqrt(vCorner * vCorner + 2 * aBrake * d);
      if (vAllow < vT) vT = vAllow;
    }
    vT = Math.max(11, Math.min(VMAX, vT));
    if (aim && aim.vMax != null) vT = Math.max(0, Math.min(vT, aim.vMax));
    st.hold = Math.min(vT, st.hold + 30 * dt); vT = st.hold;   // ease the target up from a standstill
    const L = Math.max(8, Math.min(38, p.speed * 0.6));
    const latTarget = kSteer * L * L * 0.5 + (aim && aim.x != null ? aim.x : 0);
    let steer = M4.clamp(KP * (Math.atan2(latTarget - p.x, L) - p.angle), -1, 1);
    if (aim && aim.hold) {   // the lane is off the ribbon's hw and the stop IS a stall: neither rule below applies
      st.stalled = 0; st.lastS = p.s;
      return { steer, throttle: p.speed < vT, brake: p.speed > vT * 1.04 && p.speed > 0.2 };
    }
    const offRoad = !(aim && aim.x != null) && Math.abs(p.x) - p.hw > 0.4;
    if (st.lastS != null && p.s - st.lastS < 0.05) st.stalled++; else st.stalled = 0;   // no progress along the arc (a standing start counts, harmlessly)
    st.lastS = p.s;
    let throttle = p.speed < vT, brake = p.speed > vT * 1.04;
    if (st.stalled > 10) { steer = M4.clamp(steer, -0.4, 0.4); throttle = true; brake = false; }
    else if (offRoad) throttle = false;
    if (st.stalled > 420 && G.rescuePlayer) { st.stalled = 0; try { G.rescuePlayer(); } catch (_) { /* no rescue: keep trying */ } }
    return { steer, throttle, brake };
  }

  function log(msg) { try { Log.info("game", "SoakRun " + msg); } catch (_) { /* Log not loaded */ } }

  // A hidden or locked page is paused by game.js and cannot soak: end the run rather than leave input held.
  function onHidden() { if (typeof document !== "undefined" && document.hidden) finish("hidden"); }

  function finish(reason) {
    const G = _G; const r = _run;
    if (!r) return false;
    _run = null;
    try { document.removeEventListener("visibilitychange", onHidden); } catch (_) { /* no document */ }
    if (r.raf !== null) cancelAnimationFrame(r.raf);
    if (G && r.raf !== null) {
      G._testInput = null;     // the real Input owns the car again the instant the soak ends
      // The game's own PAUSE button (G has no setPaused member; the pause menu then shows SHARE's panel).
      try { const b = document.getElementById("pausebtn"); if (b && !G.paused) b.click(); } catch (_) { /* pause is a courtesy */ }
    }
    try { if (r.recording) PhoneRecorder.stop(r); } catch (_) { /* recorder gone */ }
    _last = { state: "done", reason, minutes: +((performance.now() - r.t0) / 60000).toFixed(2) };
    log("end " + reason);
    return true;
  }

  function tick(ts) {
    const r = _run; const G = _G;
    if (!r) return;
    r.raf = requestAnimationFrame(tick);
    const dt = r.prev ? Math.min(0.1, Math.max(0.001, (ts - r.prev) / 1000)) : 1 / 60;
    r.prev = ts;
    if (G.state === "race") {
      if (!r.started) {
        r.started = true; r.tRace = performance.now();
        try { r.recording = PhoneRecorder.start(r); } catch (_) { /* recorder missing: the drive still runs */ }
        log("racing");
      }
      const inp = control(G, r.st, dt);
      if (inp) G._testInput = inp;
      if (performance.now() - r.tRace >= r.minutes * 60000) finish("complete");
    } else if (r.started && G.state !== "count") {
      finish("left-race");     // the player quit, or the session ended under us
    } else if (performance.now() - r.t0 > 5 * 60000) {
      finish("never-started"); // a build that never reached the lights
    }
  }

  async function start(opts) {
    const G = _G;
    opts = opts || {};
    if (!G || _run || _drv) return false;
    const i = Tracks.LIST.findIndex((t) => t.id === (opts.track || TRACK_ID));
    if (i < 0) return false;
    try {
      if (G.closeSettings) G.closeSettings();
      G.trackIdx = i; G.seasonMode = false; G.timeTrial = false; G.duel = false;
      G.raceLaps = LAPS;
      if (G.endWeatherSession) G.endWeatherSession();
      G.raceWeather = opts.weather || "wet"; G.raceTimeOfDay = opts.tod || "default";   // GPU TEST runs it dry; BENCHMARK (bench-run.js) asks for rain / night
    } catch (e) { try { Log.warn("game", "SoakRun start refused: " + (e && e.message)); } catch (_) { /* Log not loaded */ } return false; }
    const run = _run = { raf: null, t0: performance.now(), tRace: 0, prev: 0, started: false, minutes: opts.minutes > 0 ? opts.minutes : SOAK_MIN,
      st: { hold: 30, stalled: 0, lastS: null } };
    _last = { state: "starting", reason: "" };
    try { document.addEventListener("visibilitychange", onHidden); } catch (_) { /* no document */ }
    log("start " + (opts.track || TRACK_ID) + " " + (opts.weather || "wet") + " " + _run.minutes + " min");
    let outcome;
    try {
      const request = G.startRace();
      outcome = await (request && request.outcome || request);
    } catch (_) {
      if (_run === run) finish("start-failed");
      return false;
    }
    if (_run !== run) return false;
    if (outcome === false || (outcome && outcome.kind && outcome.kind !== "committed")) {
      finish("start-failed");
      return false;
    }
    try {   // the chase camera (js/camera/mode-switch.js CAM_MODES); GPU TEST asks for helmet, where the mirror is up
      const ix = CamModes.CAM_MODES.findIndex((m) => m.id === (opts.cam || "chase"));
      if (ix >= 0) G.setCamMode(ix, { persist: false });   // the player's saved camera stays theirs
    } catch (_) { /* camera stays as the player had it */ }
    run.raf = requestAnimationFrame(tick);
    return true;
  }

  // ── DRIVE: agent control of the player car, for the phone bridge (`drive`, js/agent/apex-bridge.js) and
  // __apex.rollout({policy:"<name>"}). The same seam and the same law as the soak: G._testInput only, `control`
  // above, bent onto the pit lane by PitLane's OWN targets (laneX / laneDrive / entryV / approachV — the lines and
  // envelopes the AI is steered by), so nothing here is a second controller. THE ARC RULE: like start(), it exists
  // only between drive() (a bridge or agent command) and endDrive(), persists nothing, and lets go on stop, a quit, a
  // pause, a hidden page or a real touch/key (an isTrusted event; the bridge's own taps are synthetic).
  const POLICY_NAMES = ["autopilot", "box"];
  const _ps = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
  // A named closed-loop policy: { name, step(dt) → input, done() → reason|null, phase() }.
  function policy(name, opts) {
    const G = _G;
    if (!G || POLICY_NAMES.indexOf(name) < 0) return null;
    const o = opts || {};
    const st = { hold: Math.max(0, (G.player && G.player.speed) || 0), stalled: 0, lastS: null };
    const lap0 = (G.player && G.player.lap) || 0, laps = o.laps > 0 ? o.laps : 0;
    let done = null, phase = name === "box" ? "lap" : "drive", still = 0, armed = false;
    const box = (dt) => {
      const c = G.player, pits = G.pits, T = G.track, zz = pits && pits.zoneOf ? pits.zoneOf() : null;
      if (!zz) { done = "no-pit-lane"; return null; }
      if (c.pitState === "box") { done = "box"; phase = "box"; return { steer: 0, throttle: false, brake: false }; }
      if (c.pitState === "out") { done = "released"; return null; }
      if (!c.pitArmed && c.pitState !== "lane") {
        if (!pits.arm(c, true)) { done = "lane-closed"; return null; }
        armed = true;
      }
      const L = T.total, pl = T.pit, complex = !!(pl && !pl.painted);
      Tracks.sample(T, c.s, _ps);
      const hw = _ps.hw || 0, side = zz.side;
      const aim = {};
      if (pits.inLane(c)) {
        phase = "lane"; aim.hold = true;
        const togo = pits.boxThroughFor(c) - pits.info(c).atM;
        if (togo < -PitGeom.BOX_TOL * 2) { done = "missed"; return null; }
        aim.vMax = Math.min(pits.limit(), pits.approachV(c));
        if (togo > pits.moveM + 10) aim.x = pits.laneX(c, hw, c.x || 0);   // the fast lane
        else {
          // THE BAY. A steered car makes its own diagonal, so aim at the bay's centre and slow for the move; a car
          // not yet square crawls (under the latch speed) until it is, and one stopped short creeps on.
          aim.x = pits.laneCentre(hw, side, c.s);
          const sq = pits.boxSquare(c);
          aim.vMax = Math.min(10, sq ? aim.vMax : Math.max(aim.vMax, PitGeom.CRAWL_V));
          still = Math.abs(c.speed) < 0.3 ? still + dt : still;
          if (still > 1.5) aim.vMax = PitGeom.CRAWL_V;
        }
      } else if (complex && PitGeom.inSpan(pl.sA, pl.sIn, c.s, L)) {
        phase = "entry"; aim.x = pits.laneDrive(hw, side, c.s, true); aim.vMax = pits.entryV(c);
      } else if (PitGeom.inWindow(zz, c.s, L)) {
        // Over the line, a tick before the state turns to "lane"; past the box (or the grid): round again.
        if (pits.info(c).atM <= pits.boxThroughFor(c)) { phase = "entry"; aim.x = pits.laneDrive(hw, side, c.s, false); aim.vMax = pits.limit(); }
        else phase = "lap";
      } else {
        const d = pits.toEntry(c) - (complex ? pl.entryRoadM || 0 : 0);
        if (d < PitGeom.APPROACH_M) { phase = "approach"; aim.vMax = pits.entryV(c); if (complex) aim.x = (hw - PitGeom.ROAD_IN) * side; }
        else phase = "lap";
      }
      return control(G, st, dt, aim.x != null || aim.vMax != null ? aim : null);
    };
    return {
      name,
      step(dt) {
        if (done || !G.player || !G.track) return null;
        const inp = name === "box" ? box(dt) : control(G, st, dt);
        if (!done && laps && (G.player.lap || 0) - lap0 >= laps) done = "laps";
        return inp;
      },
      done: () => done,
      phase: () => phase,
      // Let go short of the box: a stop this driver called and the car never reached is called off, or the limiter
      // would meet the player at the next pit line.
      release() {
        const c = G.player;
        if (armed && c && c.pitArmed && (c.pitState || "none") === "none" && G.pits) G.pits.arm(c, false);
        armed = false;
      },
    };
  }

  let _drv = null, _drvLast = null;
  function onRealInput(e) { if (e && e.isTrusted) endDrive("touch"); }
  const REAL = ["pointerdown", "touchstart", "keydown"];
  function endDrive(reason) {
    const G = _G, d = _drv;
    if (!d) return null;
    _drv = null;
    if (d.raf !== null) cancelAnimationFrame(d.raf);
    try { for (const t of REAL) window.removeEventListener(t, onRealInput, true); } catch (_) { /* no window */ }
    try { document.removeEventListener("visibilitychange", onDriveHidden); } catch (_) { /* no document */ }
    if (G) G._testInput = null;     // the real Input owns the car again
    try { d.pol.release(); } catch (_) { /* the session is gone */ }
    const c = G && G.player;
    _drvLast = { reason, policy: d.pol.name, inBox: !!(c && c.pitState === "box"), ms: Math.round(performance.now() - d.t0),
      laps: c ? (c.lap || 0) - d.lap0 : 0, steps: d.steps, pit: c ? c.pitState || "none" : null };
    log("drive end " + reason);
    for (const f of d.waiters) f(_drvLast);
    return _drvLast;
  }
  function onDriveHidden() { if (typeof document !== "undefined" && document.hidden) endDrive("hidden"); }
  function driveTick(ts) {
    const d = _drv, G = _G;
    if (!d) return;
    d.raf = requestAnimationFrame(driveTick);
    const dt = d.prev ? Math.min(0.1, Math.max(0.001, (ts - d.prev) / 1000)) : 1 / 60;
    d.prev = ts;
    if (G.paused) { endDrive("paused"); return; }
    if (G.state !== "race" && G.state !== "count") { endDrive("state:" + G.state); return; }
    if (performance.now() - d.t0 > d.ms) { endDrive(d.secs ? "seconds" : "timeout"); return; }
    if (G.state !== "race") return;   // the lights: wait for them
    const inp = d.pol.step(dt);
    const ph = d.pol.phase(), c = G.player;
    if (ph !== d.phase) { d.phase = ph; d.steps.push({ phase: ph, t: +((performance.now() - d.t0) / 1000).toFixed(1), s: Math.round(c.s), kph: Math.round(c.speed * 3.6) }); }
    const why = d.pol.done();
    if (why) { endDrive(why); return; }
    G._testInput = inp;
  }
  // drive({to:"box"} | {laps:n} | {seconds:n}, ms) → resolves with endDrive's record. Refused while a soak runs.
  function drive(opts) {
    const G = _G, o = opts || {};
    if (!G) return Promise.reject(new Error("SoakRun not bound"));
    if (_run) return Promise.reject(new Error("a soak is running"));
    if (G.state !== "race" && G.state !== "count") return Promise.reject(new Error("drive needs a running session (state " + G.state + ")"));
    if (G.paused) return Promise.reject(new Error("the session is paused"));
    if (G.netPlay && G.netPlay.active && G.netPlay.active()) return Promise.reject(new Error("not in a friend race"));
    if (_drv) endDrive("replaced");
    const pol = policy(o.to === "box" ? "box" : "autopilot", { laps: o.laps });
    const secs = o.seconds > 0 ? o.seconds : 0;
    const d = _drv = { pol, secs, raf: null, prev: 0, t0: performance.now(), lap0: (G.player && G.player.lap) || 0, phase: null, steps: [], waiters: [],
      ms: Math.max(1000, Math.min(600000, secs ? secs * 1000 : o.ms > 0 ? o.ms : 240000)) };
    const p = new Promise((res) => d.waiters.push(res));
    try { for (const t of REAL) window.addEventListener(t, onRealInput, true); } catch (_) { /* no window */ }
    try { document.addEventListener("visibilitychange", onDriveHidden); } catch (_) { /* no document */ }
    log("drive " + (o.to || (o.laps ? o.laps + " laps" : secs + " s")));
    d.raf = requestAnimationFrame(driveTick);
    return p;
  }
  function driveStatus() {
    const d = _drv, c = _G && _G.player;
    if (!d) return Object.assign({ active: false }, _drvLast ? { last: _drvLast } : null);
    return { active: true, policy: d.pol.name, phase: d.phase, ms: Math.round(performance.now() - d.t0), steps: d.steps,
      pit: c ? c.pitState || "none" : null, kph: c ? Math.round(c.speed * 3.6) : null };
  }

  // probe stays module-local (start/control use it). SOAK_MIN / TRACK_ID stay exported for harness.
  return {
    SOAK_MIN, TRACK_ID, control,
    create(G) { _G = G; return this; },
    // GPU TEST's boost phase (gpu-test-run.js): BOOST on/off for the driven car, set directly (no tap, so the
    // touch/audio-unlock path stays out of the reading). Returns whether the player is deploying right now.
    boost(on) {
      const p = _G && _G.player;
      if (!p) return false;
      if (typeof on === "boolean") p.boostOn = on;
      return !!p.deploying;
    },
    start, stop: (why) => finish(why || "stopped"),
    POLICY_NAMES, policy, drive, driveStop: (why) => endDrive(why || "stopped"), driveStatus, driving: () => !!_drv,
    active: () => !!_run,
    status: () => Object.assign({}, _last, _run ? { state: _run.started ? "racing" : "starting",
      elapsedMin: _run.started ? +((performance.now() - _run.tRace) / 60000).toFixed(2) : 0, minutes: _run.minutes } : null),
  };
})();

Object.freeze(SoakRun);
