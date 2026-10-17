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
  const A_LAT_WET = 9, A_BRAKE_WET = 16;   // the autopilot spec's 13/24 are dry numbers

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

  // One control frame: returns the _testInput to hold until the next frame.
  function control(G, st, dt) {
    const p = probe(G);
    if (!p) return null;
    const T = G.track, P = G.player;
    let kSteer = p.k;
    const steerLook = Math.max(9, p.speed * 0.4);
    let vT = Math.abs(p.k) > 1e-4 ? Math.sqrt(A_LAT_WET / Math.abs(p.k)) : VMAX;
    for (let j = 0; j < DISTS.length; j++) {
      const d = DISTS[j];
      const k = Tracks.curvature(T, G.wrapS(P.s + d));
      if (d <= steerLook) kSteer = k;
      const vCorner = Math.abs(k) > 1e-4 ? Math.sqrt(A_LAT_WET / Math.abs(k)) : VMAX;
      const vAllow = Math.sqrt(vCorner * vCorner + 2 * A_BRAKE_WET * d);
      if (vAllow < vT) vT = vAllow;
    }
    vT = Math.max(11, Math.min(VMAX, vT));
    st.hold = Math.min(vT, st.hold + 30 * dt); vT = st.hold;   // ease the target up from a standstill
    const L = Math.max(8, Math.min(38, p.speed * 0.6));
    const latTarget = kSteer * L * L * 0.5;
    let steer = M4.clamp(KP * (Math.atan2(latTarget - p.x, L) - p.angle), -1, 1);
    const offRoad = Math.abs(p.x) - p.hw > 0.4;
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
    if (r.raf) cancelAnimationFrame(r.raf);
    if (G) {
      G._testInput = null;     // the real Input owns the car again the instant the soak ends
      // The game's own PAUSE button (G has no setPaused member; the pause menu then shows SHARE's panel).
      try { const b = document.getElementById("pausebtn"); if (b && !G.paused) b.click(); } catch (_) { /* pause is a courtesy */ }
    }
    try { if (typeof PhoneRecorder !== "undefined" && PhoneRecorder.isOn()) PhoneRecorder.stop(); } catch (_) { /* recorder gone */ }
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
        try { PhoneRecorder.start(); } catch (_) { /* recorder missing: the drive still runs */ }
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

  function start(opts) {
    const G = _G;
    opts = opts || {};
    if (!G || _run) return Promise.resolve(false);
    const i = Tracks.LIST.findIndex((t) => t.id === (opts.track || TRACK_ID));
    if (i < 0) return Promise.resolve(false);
    try {
      if (G.closeSettings) G.closeSettings();
      G.trackIdx = i; G.seasonMode = false; G.timeTrial = false; G.duel = false;
      G.raceLaps = LAPS;
      if (G.endWeatherSession) G.endWeatherSession();
      G.raceWeather = "wet"; G.raceTimeOfDay = "default";
    } catch (e) { try { Log.warn("game", "SoakRun start refused: " + (e && e.message)); } catch (_) { /* Log not loaded */ } return Promise.resolve(false); }
    _run = { raf: 0, t0: performance.now(), tRace: 0, prev: 0, started: false, minutes: opts.minutes > 0 ? opts.minutes : SOAK_MIN,
      st: { hold: 30, stalled: 0, lastS: null } };
    _last = { state: "starting", reason: "" };
    try { document.addEventListener("visibilitychange", onHidden); } catch (_) { /* no document */ }
    log("start " + (opts.track || TRACK_ID) + " wet " + _run.minutes + " min");
    return Promise.resolve(G.startRace()).then(() => {
      if (!_run) return false;
      try {   // the chase camera (js/camera/mode-switch.js CAM_MODES)
        const ix = CamModes.CAM_MODES.findIndex((m) => m.id === "chase");
        if (ix >= 0) G.setCamMode(ix, { persist: false });   // the player's saved camera stays theirs
      } catch (_) { /* camera stays as the player had it */ }
      _run.raf = requestAnimationFrame(tick);
      return true;
    }, () => { finish("start-failed"); return false; });
  }

  return {
    SOAK_MIN, TRACK_ID, control, probe,
    create(G) { _G = G; return this; },
    start, stop: (why) => finish(why || "stopped"),
    active: () => !!_run,
    status: () => Object.assign({}, _last, _run ? { state: _run.started ? "racing" : "starting",
      elapsedMin: _run.started ? +((performance.now() - _run.tRace) / 60000).toFixed(2) : 0, minutes: _run.minutes } : null),
  };
})();

Object.freeze(SoakRun);
