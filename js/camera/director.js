/* Apex 26 — LIVE TV DIRECTOR (Director.create(G)): a broadcast-style camera
 * brain for the race the player is driving. Reuses Broadcast's pure cut policy
 * (battles / shotFor / dwell). When CAM_MODES id "tv" is on — or after the
 * player finishes/retires in solo — it picks a subject (battle / leader) and a
 * shot (side/heli/tcam/chase/cinematic/low), solves the vantage into G.dbgCam,
 * and never touches car forces or sim RNG. Curvature reaches it only through
 * GameCams.vantage (broadcast-only). Netplay: auto-spectate and TV cuts stay
 * off while netPlay.active() — pause does not own the shared sim. */
"use strict";
const Director = (function () {
  // Prefer Broadcast's shipped shot list and dwell when the module is loaded;
  // fall back to the same literals so a bare VM unit test still runs.
  const SHOTS = (typeof Broadcast !== "undefined" && Broadcast.SHOTS)
    ? Broadcast.SHOTS.slice()
    : ["side", "heli", "tcam", "chase", "cinematic", "low"];
  const SHOT_MIN_S = (typeof Broadcast !== "undefined" && Broadcast.SHOT_MIN_S) || 5;
  const SHOT_MAX_S = (typeof Broadcast !== "undefined" && Broadcast.SHOT_MAX_S) || 14;
  const BATTLE_S = 1.0;

  /** Progress-ordered running cars → Broadcast.battles shape. vScale: vTop()/VMAX — the director
   *  only cuts the SIM's race (eligible() keeps WATCH out), whose speeds are PACE-scaled. */
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

  /**
   * Pure cut decision. Mirrors Broadcast.direct: no cut before SHOT_MIN_S;
   * a battle (or leader rotate) only after SHOT_MAX_S unless an explicit
   * event kind is supplied. Returns null to hold, or { subject, kind, shot }.
   * st.vScale: battles()' speed scale (vTop()/VMAX); omitted = 1.
   */
  function decideCut(st) {
    const age = st.wall - st.lastCut;
    if (age < SHOT_MIN_S) return null;
    const running = st.running || [];
    if (!running.length) return null;
    const fight = battles(running, st.vScale)[0];
    // Under SHOT_MAX_S: only cut when a battle appears and we are not already
    // on its chaser (Broadcast cuts events early; live director treats a new
    // battle the same way once the min dwell has passed).
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

  /** Should the live director be driving the picture right now? */
  function wantOn(st) {
    if (st.net) return false;
    if (st.modeId === "tv") return true;
    if (st.autoSpectate && (st.finished || st.retired)) return true;
    return false;
  }

  let _live = null;
  function live() { return _live; }

  function create(G, eligible = () => true) {
    Log.info("game", "Director.create");
    let wall = 0, lastCut = -1e9, cuts = 0, onAirShot = null, subject = null;
    let ownCamera = null, autoSpectate = true, forcedTv = false, prevMode = -1;
    const scratchEye = [0, 0, 0], scratchTgt = [0, 0, 0];

    function camIdx(id) {
      const modes = typeof CamModes !== "undefined" ? CamModes.CAM_MODES : [];
      return modes.findIndex((m) => m.id === id);
    }
    function modeId() {
      const modes = typeof CamModes !== "undefined" ? CamModes.CAM_MODES : [];
      const m = modes[G.camMode];
      return m ? m.id : "";
    }
    function runningList() {
      const cars = G.cars || [];
      const out = [];
      for (let i = 0; i < cars.length; i++) {
        const c = cars[i];
        if (!c || c.retired || c.finished) continue;
        out.push({ key: c, prog: c.prog || 0, speed: c.speed || 0 });
      }
      out.sort((a, b) => b.prog - a.prog);
      return out;
    }
    function clearDbg() {
      if (ownCamera && G.dbgCam === ownCamera) G.dbgCam = null;
      ownCamera = null;
    }
    /* A CUT SOLVES ONE-SHOT; HOLDING A SHOT SOLVES WITH THE FRAME'S dt.
       vantage.js eases the corner side of heli/side/cinematic through
       CamFeel.follow ("a hard sign flip teleported the eye ~36 m") — but only
       when the solve carries a dt, and this one never did, so mid-shot every
       curvature sign flip jumped the HELI eye ~24-36 m and TV SIDE ~28-50 m in
       one frame. dt 0 on a cut keeps the cut whole (every follow lands on its
       target); `snap` lets the speed-open terms start where they belong.
       The subject pose is the INTERPOLATED one the car body is drawn at
       (G.camPoseOf, read after the physics step — game.js ticks this after it):
       the raw 60 Hz car.s/px/head held-then-jumped on a 90/120 Hz display.
       The follows run under CamFeel.scoped("tv:"): the player's own rig keeps
       solving (TV falls to the chase branch) and shared keys like "chaseBend"
       would otherwise be damped toward two different cars on alternate calls. */
    function applyShot(car, shot, dt, cut) {
      if (!car || !G.track || !G.camVantage) return false;
      const extra = { att: car, noLook: true, dt: cut ? 0 : (dt > 0 ? dt : 0), snap: !!cut };   // noLook: the PLAYER's look-back / glance never steers a TV shot
      const pose = G.camPoseOf ? G.camPoseOf(car) : null;
      let s = car.s || 0, x = car.x || 0;
      if (pose) {
        s = pose.s; x = pose.x;
        if (pose.carPos) { extra.carPos = [pose.carPos[0], pose.carPos[1]]; extra.carHead = pose.carHead; }
      } else if (car.px != null && car.pz != null) {
        extra.carPos = [car.px, car.pz];
        extra.carHead = car.head || 0;
      }
      const solve = () => G.camVantage(shot, s, x, car.speed || 0, 0, extra);
      const v = typeof CamFeel !== "undefined" && CamFeel.scoped ? CamFeel.scoped("tv:", solve) : solve();
      if (!v || !v.eye || !v.tgt) return false;
      scratchEye[0] = v.eye[0]; scratchEye[1] = v.eye[1]; scratchEye[2] = v.eye[2];
      scratchTgt[0] = v.tgt[0]; scratchTgt[1] = v.tgt[1]; scratchTgt[2] = v.tgt[2];
      ownCamera = G.dbgCam = { eye: scratchEye, target: scratchTgt, fov: v.fov || 55, far: 6000 };
      onAirShot = shot;
      subject = car;
      return true;
    }
    function ensureTvMode() {
      if (modeId() === "tv") return;
      const i = camIdx("tv");
      if (i < 0 || !G.setCamMode) return;
      prevMode = G.camMode;   // reset() hands the player's own camera back
      G.setCamMode(i, { persist: false });
      forcedTv = true;
    }
    function tick(dt) {
      const st = G.state;
      if (st !== "race" && st !== "count") { clearDbg(); return; }
      // WATCH and instant replay own the picture; Photo/tools may replace our
      // camera too. Release only our own object, before any auto-spectate cut.
      if (!eligible() || G.photoMode) { clearDbg(); return; }
      if (G.dbgCam && G.dbgCam !== ownCamera) { ownCamera = null; return; }
      if (G.paused) {
        if (modeId() !== "tv") clearDbg();   // a paused camera selection still takes effect
        return;   // hold the paused shot and dwell clock
      }
      const net = !!(G.netPlay && G.netPlay.active && G.netPlay.active());
      const player = G.player;
      const finished = !!(player && player.finished);
      const retired = !!(player && player.retired);
      if (!wantOn({ net, modeId: modeId(), autoSpectate, finished, retired })) {
        if (forcedTv && modeId() === "tv") { /* left on tv by us; still off if wantOn false only via net */ }
        clearDbg();
        return;
      }
      if (autoSpectate && (finished || retired) && !net) ensureTvMode();
      if (modeId() !== "tv") { clearDbg(); return; }

      wall += dt > 0 ? dt : 0;
      const running = runningList();
      // A subject that retired or took the flag leaves the shot now, not after SHOT_MAX_S.
      if (subject && (subject.retired || subject.finished) && running.length) {
        subject = null; onAirShot = null; lastCut = -1e9;
      }
      // After the player is done, include them as a spectate subject via follow
      // of the field only — still no force path.
      const decision = decideCut({
        wall, lastCut, cuts, onAirShot, subject,
        vScale: G.vTop && typeof PhysicsConsts !== "undefined" ? G.vTop() / PhysicsConsts.VMAX : 1,   // sim speeds (never WATCH, above)
        running: running.length ? running : (player && !player.retired ? [{ key: player, prog: player.prog || 0, speed: player.speed || 0 }] : []),
      });
      if (decision) {
        lastCut = wall; cuts++;
        applyShot(decision.subject, decision.shot, dt, true);
        Log.debug("game", "Director.cut kind=" + (decision.kind || "-") + " shot=" + decision.shot
          + " car=" + (decision.subject && decision.subject.code ? decision.subject.code : "-"));
      } else if (subject && onAirShot) {
        applyShot(subject, onAirShot, dt, false);   // keep dbgCam fresh as the car moves
      } else if (running[0]) {
        lastCut = wall; cuts++;
        applyShot(running[0].key, shotFor(null, null, 0), dt, true);
      }
    }
    function reset() {
      wall = 0; lastCut = -1e9; cuts = 0; onAirShot = null; subject = null;
      // Auto-spectate forced "tv" non-persistently; the next race starts on the player's mode.
      if (forcedTv && prevMode >= 0 && modeId() === "tv" && G.setCamMode) G.setCamMode(prevMode, { persist: false });
      forcedTv = false; prevMode = -1; clearDbg();
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
