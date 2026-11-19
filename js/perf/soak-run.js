const SoakRun = (function () {
  "use strict";

  const SOAK_MIN = 15;
  const TRACK_ID = "monza";
  const LAPS = 40;
  const DISTS = []; for (let d = 5; d <= 160; d += 6) DISTS.push(d);
  const VMAX = 94, KP = 2.4;
  const A_LAT_DRY = 13, A_BRAKE_DRY = 24;
  const A_LAT_WET = 9, A_BRAKE_WET = 16;

  let _G = null;
  let _run = null;
  let _last = { state: "idle", reason: "" };

  function wrapPi(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

  function probe(G) {
    const P = G.player, T = G.track;
    if (!P || !T) return null;
    const smp = G.smp;
    Tracks.sample(T, P.s, smp);
    const angle = P.head != null ? wrapPi(Math.atan2(smp.t[0], smp.t[2]) - P.head) : 0;
    return { x: P.x, angle, k: Tracks.curvature(T, P.s), hw: smp.hw, speed: P.speed, s: P.s };
  }

  function envelope(G) {
    const w = G && G.raceWeather;
    if (w === "wet" || w === "rain" || w === "storm") return { aLat: A_LAT_WET, aBrake: A_BRAKE_WET };
    return { aLat: A_LAT_DRY, aBrake: A_BRAKE_DRY };
  }

  function control(G, st, dt) {
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
    st.hold = Math.min(vT, st.hold + 30 * dt); vT = st.hold;
    const L = Math.max(8, Math.min(38, p.speed * 0.6));
    const latTarget = kSteer * L * L * 0.5;
    let steer = M4.clamp(KP * (Math.atan2(latTarget - p.x, L) - p.angle), -1, 1);
    const offRoad = Math.abs(p.x) - p.hw > 0.4;
    if (st.lastS != null && p.s - st.lastS < 0.05) st.stalled++; else st.stalled = 0;
    st.lastS = p.s;
    let throttle = p.speed < vT, brake = p.speed > vT * 1.04;
    if (st.stalled > 10) { steer = M4.clamp(steer, -0.4, 0.4); throttle = true; brake = false; }
    else if (offRoad) throttle = false;
    if (st.stalled > 420 && G.rescuePlayer) { st.stalled = 0; try { G.rescuePlayer(); } catch (_) {  } }
    return { steer, throttle, brake };
  }

  function log(msg) { try { Log.info("game", "SoakRun " + msg); } catch (_) {  } }

  function onHidden() { if (typeof document !== "undefined" && document.hidden) finish("hidden"); }

  function finish(reason) {
    const G = _G; const r = _run;
    if (!r) return false;
    _run = null;
    try { document.removeEventListener("visibilitychange", onHidden); } catch (_) {  }
    if (r.raf) cancelAnimationFrame(r.raf);
    if (G) {
      G._testInput = null;
      try { const b = document.getElementById("pausebtn"); if (b && !G.paused) b.click(); } catch (_) {  }
    }
    try { if (typeof PhoneRecorder !== "undefined" && PhoneRecorder.isOn()) PhoneRecorder.stop(); } catch (_) {  }
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
        try { PhoneRecorder.start(); } catch (_) {  }
        log("racing");
      }
      const inp = control(G, r.st, dt);
      if (inp) G._testInput = inp;
      if (performance.now() - r.tRace >= r.minutes * 60000) finish("complete");
    } else if (r.started && G.state !== "count") {
      finish("left-race");
    } else if (performance.now() - r.t0 > 5 * 60000) {
      finish("never-started");
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
      G.raceWeather = opts.weather || "wet"; G.raceTimeOfDay = opts.tod || "default";
    } catch (e) { try { Log.warn("game", "SoakRun start refused: " + (e && e.message)); } catch (_) {  } return Promise.resolve(false); }
    _run = { raf: 0, t0: performance.now(), tRace: 0, prev: 0, started: false, minutes: opts.minutes > 0 ? opts.minutes : SOAK_MIN,
      st: { hold: 30, stalled: 0, lastS: null } };
    _last = { state: "starting", reason: "" };
    try { document.addEventListener("visibilitychange", onHidden); } catch (_) {  }
    log("start " + (opts.track || TRACK_ID) + " " + (opts.weather || "wet") + " " + _run.minutes + " min");
    return Promise.resolve(G.startRace()).then(() => {
      if (!_run) return false;
      try {
        const ix = CamModes.CAM_MODES.findIndex((m) => m.id === (opts.cam || "chase"));
        if (ix >= 0) G.setCamMode(ix, { persist: false });
      } catch (_) {  }
      _run.raf = requestAnimationFrame(tick);
      return true;
    }, () => { finish("start-failed"); return false; });
  }

  return {
    SOAK_MIN, TRACK_ID, control,
    create(G) { _G = G; return this; },
    boost(on) {
      const p = _G && _G.player;
      if (!p) return false;
      if (typeof on === "boolean") p.boostOn = on;
      return !!p.deploying;
    },
    start, stop: (why) => finish(why || "stopped"),
    active: () => !!_run,
    status: () => Object.assign({}, _last, _run ? { state: _run.started ? "racing" : "starting",
      elapsedMin: _run.started ? +((performance.now() - _run.tRace) / 60000).toFixed(2) : 0, minutes: _run.minutes } : null),
  };
})();

Object.freeze(SoakRun);
