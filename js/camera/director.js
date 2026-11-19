"use strict";
const Director = (function () {
  const SHOTS = (typeof Broadcast !== "undefined" && Broadcast.SHOTS)
    ? Broadcast.SHOTS.slice()
    : ["side", "heli", "tcam", "chase", "cinematic", "low"];
  const SHOT_MIN_S = (typeof Broadcast !== "undefined" && Broadcast.SHOT_MIN_S) || 5;
  const SHOT_MAX_S = (typeof Broadcast !== "undefined" && Broadcast.SHOT_MAX_S) || 14;
  const BATTLE_S = 1.0;
  const FINISH_SHOTS = ["chase", "side", "heli", "cinematic"];

  function battles(cars, vScale) {
    if (typeof Broadcast !== "undefined" && Broadcast.battles) return Broadcast.battles(cars, vScale);
    const out = [];
    for (let i = 1; i < cars.length; i++) {
      const a = cars[i - 1], b = cars[i];
      const v = Math.max(b.speed || 0, 20 * (vScale > 0 ? vScale : 1));
      const g = (a.prog - b.prog) / v;
      if (g >= 0 && g < BATTLE_S) out.push({ key: b.key, ahead: a.key, gapS: g, score: g + i * 0.08 });
    }
    return out.sort((x, y) => x.score - y.score);
  }
  function shotFor(kind, onAir, n) {
    if (typeof Broadcast !== "undefined" && Broadcast.shotFor) return Broadcast.shotFor(kind, onAir, n);
    const pool = SHOTS.filter((s) => s !== onAir);
    return pool.length ? pool[(n | 0) % pool.length] : onAir;
  }

  function decideCut(st) {
    const age = st.wall - st.lastCut;
    if (age < SHOT_MIN_S) return null;
    const running = st.running || [];
    if (!running.length) return null;
    const fight = battles(running, st.vScale)[0];
    if (age < SHOT_MAX_S) {
      if (!fight) return null;
      if (st.subject && fight.key === st.subject) return null;
      const shot = shotFor("pass", st.onAirShot, st.cuts || 0);
      return { subject: fight.key, kind: "pass", shot };
    }
    let subject = fight ? fight.key : null;
    let kind = fight ? "pass" : null;
    if (!subject) {
      const n = Math.min(3, running.length);
      subject = running[(st.cuts || 0) % n].key;
    }
    const shot = shotFor(kind, st.onAirShot, st.cuts || 0);
    return { subject, kind, shot };
  }

  function wantOn(st) {
    if (st.net) return false;
    if (st.modeId === "tv") return true;
    if (st.autoSpectate && (st.finished || st.retired)) return true;
    return false;
  }

  const _wantSt = { net: false, modeId: "", autoSpectate: false, finished: false, retired: false };

  let _live = null;
  function live() { return _live; }

  function create(G, eligible = () => true) {
    Log.info("game", "Director.create");
    let wall = 0, lastCut = -1e9, cuts = 0, onAirShot = null, subject = null;
    let ownCamera = null, autoSpectate = true, forcedTv = false, prevMode = -1;
    let spectating = false;
    const scratchEye = [0, 0, 0], scratchTgt = [0, 0, 0];
    const bankScratch = { dy: 0, roll: 0 };
    const _shotExtra = {}, _shotCarPos = [0, 0];
    let _solveShot = null, _solveS = 0, _solveX = 0, _solveSpeed = 0, _dbgCam = null;
    const solve = () => G.camVantage(_solveShot, _solveS, _solveX, _solveSpeed, 0, _shotExtra);

    function camIdx(id) {
      const modes = typeof CamModes !== "undefined" ? CamModes.CAM_MODES : [];
      return modes.findIndex((m) => m.id === id);
    }
    function modeId() {
      const modes = typeof CamModes !== "undefined" ? CamModes.CAM_MODES : [];
      const m = modes[G.camMode];
      return m ? m.id : "";
    }
    const runRows = [], runOut = [];
    function runningList() {
      const cars = G.cars || [];
      let n = 0;
      for (let i = 0; i < cars.length; i++) {
        const c = cars[i];
        if (!c || c.retired || c.finished) continue;
        let r = runRows[n];
        if (!r) { r = { key: null, prog: 0, speed: 0 }; runRows[n] = r; }
        r.key = c; r.prog = c.prog || 0; r.speed = c.speed || 0;
        runOut[n++] = r;
      }
      runOut.length = n;
      runOut.sort((a, b) => b.prog - a.prog);
      return runOut;
    }
    function clearDbg(snap) {
      const released = ownCamera && G.dbgCam === ownCamera;
      if (released) G.dbgCam = null;
      ownCamera = null;
      if (released && snap && G.snapGameCam) G.snapGameCam();
    }
    function applyShot(car, shot, dt, cut) {
      if (!car || !G.track || !G.camVantage) return false;
      const extra = _shotExtra;
      extra.att = car; extra.noLook = true; extra.frameSubject = true; extra.dt = cut ? 0 : (dt > 0 ? dt : 0); extra.snap = !!cut;
      extra.carPos = null; extra.carHead = undefined;
      const pose = G.camPoseOf ? G.camPoseOf(car) : null;
      let s = car.s || 0, x = car.x || 0;
      if (pose) {
        s = pose.s; x = pose.x;
        if (pose.carPos) { _shotCarPos[0] = pose.carPos[0]; _shotCarPos[1] = pose.carPos[1]; extra.carPos = _shotCarPos; extra.carHead = pose.carHead; }
      } else if (car.px != null && car.pz != null) {
        _shotCarPos[0] = car.px; _shotCarPos[1] = car.pz; extra.carPos = _shotCarPos;
        extra.carHead = car.head || 0;
      }
      const bank = typeof Tracks !== "undefined" && Tracks.banking ? Tracks.banking(G.track, s, x, bankScratch, true) : null;
      extra.bankDy = bank ? bank.dy : 0;
      _solveShot = shot; _solveS = s; _solveX = x; _solveSpeed = car.speed || 0;
      const v = typeof CamFeel !== "undefined" && CamFeel.scoped ? CamFeel.scoped("tv:", solve) : solve();
      if (!v || !v.eye || !v.tgt) return false;
      scratchEye[0] = v.eye[0]; scratchEye[1] = v.eye[1]; scratchEye[2] = v.eye[2];
      scratchTgt[0] = v.tgt[0]; scratchTgt[1] = v.tgt[1]; scratchTgt[2] = v.tgt[2];
      if (!_dbgCam) _dbgCam = { eye: scratchEye, target: scratchTgt, fov: 55, far: 6000 };
      _dbgCam.fov = v.fov || 55;
      ownCamera = G.dbgCam = _dbgCam;
      onAirShot = shot;
      subject = car;
      return true;
    }
    function ensureTvMode() {
      if (modeId() === "tv") return;
      const i = camIdx("tv");
      if (i < 0 || !G.setCamMode) return;
      prevMode = G.camMode;
      G.setCamMode(i, { persist: false });
      forcedTv = true;
    }
    function tick(dt) {
      const st = G.state;
      if (st !== "race" && st !== "count") { clearDbg(); return; }
      if (!eligible() || G.photoMode) { clearDbg(); return; }
      if (G.dbgCam && G.dbgCam !== ownCamera) { ownCamera = null; return; }
      if (G.paused) {
        if (modeId() !== "tv") clearDbg(true);
        return;
      }
      const net = !!(G.netPlay && G.netPlay.active && G.netPlay.active());
      const player = G.player;
      const finished = !!(player && player.finished);
      const retired = !!(player && player.retired);
      const ws = _wantSt;
      ws.net = net; ws.modeId = modeId(); ws.autoSpectate = autoSpectate; ws.finished = finished; ws.retired = retired;
      if (!wantOn(ws)) {
        if (forcedTv && modeId() === "tv") {  }
        clearDbg(!net && modeId() !== "tv");
        return;
      }
      if (autoSpectate && (finished || retired) && !net && !spectating) {
        spectating = true; ensureTvMode();
        subject = null; onAirShot = null; cuts = 0; lastCut = -1e9;
      }
      if (modeId() !== "tv") { clearDbg(true); return; }

      if (!ownCamera) { subject = null; onAirShot = null; lastCut = -1e9; }

      wall += dt > 0 ? dt : 0;
      if (subject && onAirShot && !subject.retired && !subject.finished && wall - lastCut < SHOT_MIN_S) {
        applyShot(subject, onAirShot, dt, false);
        return;
      }
      const running = runningList();
      if (subject && (subject.retired || subject.finished) && running.length) {
        subject = null; onAirShot = null; lastCut = -1e9;
      }
      const decision = decideCut({
        wall, lastCut, cuts, onAirShot, subject,
        vScale: G.vTop && typeof PhysicsConsts !== "undefined" ? G.vTop() / PhysicsConsts.VMAX : 1,
        running: running.length ? running : (player ? [{ key: player, prog: player.prog || 0, speed: player.speed || 0 }] : []),
      });
      if (decision) {
        if (spectating) decision.shot = FINISH_SHOTS[cuts % FINISH_SHOTS.length];
        lastCut = wall; cuts++;
        applyShot(decision.subject, decision.shot, dt, true);
        Log.debug("game", "Director.cut kind=" + (decision.kind || "-") + " shot=" + decision.shot
          + " car=" + (decision.subject && decision.subject.code ? decision.subject.code : "-"));
      } else if (subject && onAirShot) {
        applyShot(subject, onAirShot, dt, false);
      } else if (running[0]) {
        lastCut = wall; cuts++;
        applyShot(running[0].key, shotFor(null, null, 0), dt, true);
      }
    }
    function reset() {
      wall = 0; lastCut = -1e9; cuts = 0; onAirShot = null; subject = null;
      if (forcedTv && prevMode >= 0 && modeId() === "tv" && G.setCamMode) G.setCamMode(prevMode, { persist: false });
      forcedTv = false; spectating = false; prevMode = -1; clearDbg();
    }
    function status() {
      return {
        on: modeId() === "tv" && !!ownCamera && G.dbgCam === ownCamera,
        shot: onAirShot,
        cuts,
        subject: subject && subject.code ? subject.code : null,
        autoSpectate,
        wall: +wall.toFixed(2),
      };
    }
    function setAutoSpectate(v) { autoSpectate = !!v; return autoSpectate; }

    const api = { tick, reset, status, setAutoSpectate, decideCut, wantOn };
    _live = api;
    return api;
  }

  return {
    create, live, decideCut, wantOn, battles, shotFor,
    SHOTS, SHOT_MIN_S, SHOT_MAX_S,
  };
})();
Object.freeze(Director);
