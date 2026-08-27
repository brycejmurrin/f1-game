/* Apex 26 — braking CUE: pulse RATE that says when to brake, never brakes for you.
   BrakeCue.create(G). Consumes Tracks + PhysicsConsts at call time (not eval).
   Research: docs/research/DRIVING-CONTROLS-RESEARCH.md (Forza BDA pulse rate). */
const BrakeCue = (function () {
  "use strict";

  const LOOK_LO = 0.7, LOOK_HI = 2.3;   // seconds of lookahead at notch 2 / 10
  const URGENCY_GATE = 0.12;            // below this the corner is already made
  const PERIOD_LO = 0.55, PERIOD_HI = 0.09;
  const SAMPLES = 4;
  const clamp = M4.clamp;

  // v1 = OFF. v2..10 = CUE on, lookahead linear in seconds.
  function fromSlider(v) {
    const n = +v;
    if (!(n > 1)) return { on: false, lookSec: 1.4 };
    return { on: true, lookSec: LOOK_LO + (LOOK_HI - LOOK_LO) * (n - 2) / 8 };
  }
  function labelOf(v) { return v <= 1 ? "OFF" : "CUE " + v; }

  // Pure: how hard you still need to slow for a corner of curvature k in `dist`
  // metres, given current speed and the braking you are already doing.
  // aNeed = (v² − vCorner²) / (2s); vCorner = sqrt(LAT * min(1/|k|, 2000)).
  function urgencyOf(speed, k, dist, axEstSm, latMax, brake) {
    const v = Math.abs(speed || 0);
    if (v < 8 || !(dist > 0)) return 0;
    const radius = 1 / Math.max(Math.abs(k || 0), 1e-5);
    const vC = Math.sqrt(Math.max(latMax, 1) * Math.min(radius, 2000));
    if (v <= vC + 0.8) return 0;
    const aNeed = (v * v - vC * vC) / (2 * Math.max(dist, 8));
    const already = Math.max(0, -(axEstSm || 0));
    const remain = Math.max(0, aNeed - already * 0.85);
    return clamp(remain / Math.max(brake, 1), 0, 1);
  }

  let inst = null;

  function create(G) {
    let level = 6;          // slider notch; 1 = OFF
    let cfg = fromSlider(level);   // recomputed only when the slider moves
    let nextT = 0;
    let lastMs = 0;
    let lastU = 0;

    function setLevel(v) {
      if (typeof v === "number" && isFinite(v)) { level = clamp(v, 1, 10); cfg = fromSlider(level); }
    }

    function tick() {
      if (!cfg.on || !G || G.paused || G.state !== "race") { nextT = 0; lastU = 0; lastMs = 0; return; }
      const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
      const dt = lastMs ? Math.min(0.1, (now - lastMs) / 1000) : 1 / 60;
      lastMs = now;
      const p = G.player, track = G.track;
      if (!p || !track || typeof Tracks === "undefined" || p.finished || p.retired) {
        lastU = 0; return;
      }
      const PC = window.PhysicsConsts || {};
      const lat = PC.LAT_MAX || 22, brake = PC.BRAKE || 22;
      const look = clamp(Math.abs(p.speed) * cfg.lookSec, 28, 120);
      const L = track.total || 1;
      let u = 0;
      for (let i = 1; i <= SAMPLES; i++) {
        const dist = look * i / SAMPLES;
        const s = ((p.s + dist) % L + L) % L;
        const k = Tracks.curvature(track, s);
        const ui = urgencyOf(p.speed, k, dist, p.axEstSm, lat, brake);
        if (ui > u) u = ui;
      }
      lastU = u;
      if (u < URGENCY_GATE) { nextT = 0; return; }
      nextT -= dt;
      if (nextT > 0) return;
      nextT = PERIOD_LO + (PERIOD_HI - PERIOD_LO) * u;
      if (G.soundOn && window.GameAudio && GameAudio.brakeCue) GameAudio.brakeCue(u);
      if (navigator.vibrate) {
        try { navigator.vibrate(8 + (u * 16) | 0); } catch (_) { /* advisory */ }
      }
      if (window.Input && Input.rumble) Input.rumble(0.10 + u * 0.22, 45);
      if (window.Log && Log.enabled && Log.enabled("game", Log.DEBUG))
        Log.debug("game", "brake cue u=" + u.toFixed(2));
    }

    function debug() {
      return { level, on: fromSlider(level).on, lookSec: +fromSlider(level).lookSec.toFixed(2), urgency: +lastU.toFixed(3) };
    }

    inst = { tick, setLevel, debug, fromSlider, urgencyOf };
    return inst;
  }

  return {
    create,
    fromSlider,
    urgencyOf,
    labelOf,
    tick() { if (inst) inst.tick(); },
    debug() { return inst ? inst.debug() : null; },
    setLevel(v) { if (inst) inst.setLevel(v); },
  };
})();
