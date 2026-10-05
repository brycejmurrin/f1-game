/* Apex 26 — assist-gated audio driving cues (braking tone + L/R corner calls).
   DrivingCues.create(G). Own slider `audioCues` (1 = OFF). Reads Tracks.curvature
   only when the slider is ON — never the race-radio / coach text queue.
   Distinct timbre from GameAudio.brakeCue; ducks while BrakeCue is already
   pulsing. Product #9: docs/notes/PRODUCT-BRAINSTORM-2026-09-16.md. */
const DrivingCues = (function () {
  "use strict";

  const FIXED_DT = (typeof PhysicsConsts !== "undefined" && PhysicsConsts.FIXED_DT) || 1 / 60;
  const LOOK_LO = 0.9, LOOK_HI = 2.0;
  const K_CALL = 0.012;          // |k| above this is a corner worth calling
  const CALL_COOLDOWN_M = 80;    // metres of arc between calls
  const BRAKE_GATE = 0.14;
  const PERIOD_LO = 0.50, PERIOD_HI = 0.11;
  const clamp = M4.clamp;   // shared scalar helper (js/core/mat4.js)

  // v1 = OFF. v2..10 = cues on; lookahead grows with the notch.
  function fromSlider(v) {
    const n = +v;
    if (!(n > 1)) return { on: false, lookSec: 1.2 };
    return { on: true, lookSec: LOOK_LO + (LOOK_HI - LOOK_LO) * (n - 2) / 8 };
  }
  function labelOf(v) { return v <= 1 ? "OFF" : "CUES " + v; }

  // Pure: same aNeed shape as BrakeCue, kept here so the module can unit-test
  // without loading brake-cue.js. Output 0..1 only — never a brake command.
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

  // Sign of peak curvature ahead: +1 = LEFT (+k), -1 = RIGHT, 0 = straight.
  function cornerSide(track, s0, lookM, samples) {
    if (!track || typeof Tracks === "undefined" || !(lookM > 0)) return 0;
    const L = track.total || 1;
    const n = Math.max(2, samples | 0);
    let bestK = 0, bestAbs = 0;
    for (let i = 1; i <= n; i++) {
      const dist = lookM * i / n;
      const s = ((s0 + dist) % L + L) % L;
      const k = Tracks.curvature(track, s);
      const a = Math.abs(k);
      if (a > bestAbs) { bestAbs = a; bestK = k; }
    }
    if (bestAbs < K_CALL) return 0;
    return bestK > 0 ? 1 : -1;
  }

  // Metres ahead of s0 where the called corner ends: from the NEAREST entry of
  // `side` in the window (first sample with k*side >= K_CALL), walk on until the
  // turn opens (|k| < K_CALL/2, hysteresis so a double-apex dip stays one turn)
  // or flips side. Nearest — not sharpest — so a sharper second turn already in
  // the lookahead does not stretch exit past the first. Capped at one lap / 3 km.
  const EXIT_STEP_M = 5, EXIT_CAP_M = 3000;
  function cornerExit(track, s0, lookM, samples, side) {
    if (!track || typeof Tracks === "undefined" || !(lookM > 0) || !side) return 0;
    const L = track.total || 1;
    const n = Math.max(2, samples | 0);
    let entryD = 0, found = false;
    for (let i = 1; i <= n; i++) {
      const dist = lookM * i / n;
      const k = Tracks.curvature(track, ((s0 + dist) % L + L) % L) * side;
      if (k >= K_CALL) { entryD = dist; found = true; break; }
    }
    if (!found) return 0;
    const cap = Math.min(L, EXIT_CAP_M);
    let d = entryD;
    while (d < cap) {
      d += EXIT_STEP_M;
      const k = Tracks.curvature(track, ((s0 + d) % L + L) % L) * side;
      if (k < K_CALL * 0.5) break;
    }
    return Math.min(d, cap);
  }

  let inst = null;

  function create(G) {
    Log.info("audio", "DrivingCues.create");
    let level = 1;
    let cfg = fromSlider(level);
    let nextBrakeT = 0, lastMs = 0, lastU = 0;
    // callArmed: a SAME-side call needs the called turn to be behind the car —
    // either the window ran straight, or the car has travelled past that turn's
    // exit (callExitM, metres from lastCallS). Distance alone re-called a turn
    // still inside the lookahead every CALL_COOLDOWN_M (a 400 m sweeper said "L"
    // six times); straight-only re-arming missed a second same-side turn after a
    // straight shorter than the window.
    let lastCallS = null, lastCallSide = 0, callArmed = true, callExitM = 0;
    let brakeFired = 0, callFired = 0;

    function setLevel(v) {
      if (typeof v === "number" && isFinite(v)) {
        level = clamp(v, 1, 10);
        cfg = fromSlider(level);
      }
    }

    // Inject ADVANCED row (keeps shellNodes flat). Sits after PREDICTIVE CUE.
    (function ensureSlider() {
      if (typeof document === "undefined" || !G.$) return;
      if (G.$("pm-audiocues")) return;
      const cue = G.$("pm-brakecue");
      const row = cue && cue.closest ? cue.closest("label") : null;
      const host = row && row.parentNode;
      if (!host) return;
      const lab = document.createElement("label");
      lab.className = "tune-row";
      lab.innerHTML = '<span class="tune-label">AUDIO DRIVING CUES <b id="pm-audiocues-v">OFF</b></span>'
        + '<input id="pm-audiocues" type="range" min="1" max="10" step="1" value="1" '
        + 'aria-label="Audio driving cues: braking tone and left right corner calls">';
      host.insertBefore(lab, row.nextSibling);
    })();

    function tick() {
      // OFF path: no curvature reads, no audio. Assists-off contract.
      if (!cfg.on || !G || G.paused || G.state !== "race") {
        nextBrakeT = 0; lastU = 0; lastMs = 0;
        lastCallS = null; lastCallSide = 0; callArmed = true; callExitM = 0;   // a new race (or a resume) starts with no call pending
        return;
      }
      const p = G.player, track = G.track;
      if (!p || !track || typeof Tracks === "undefined" || p.finished || p.retired) {
        lastU = 0;
        return;
      }
      const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
      const dt = lastMs ? Math.min(0.1, (now - lastMs) / 1000) : FIXED_DT;
      lastMs = now;

      const PC = (typeof PhysicsConsts !== "undefined") ? PhysicsConsts : {};
      const lat = PC.LAT_MAX || 22, brake = PC.BRAKE || 22;
      const vt = (G.vTop ? G.vTop() : 0) || (PC.VMAX || 72);
      const lookLo = 28 * Math.max(vt / (PC.VMAX || 72), 0.05);
      const lookHi = Math.max(lookLo, vt * vt / (2 * Math.max(brake, 1)));
      const look = clamp(Math.abs(p.speed) * cfg.lookSec, lookLo, lookHi);
      const L = track.total || 1;
      const nS = clamp(Math.round(look / 30), 4, 16);

      let u = 0;
      for (let i = 1; i <= nS; i++) {
        const dist = look * i / nS;
        const s = ((p.s + dist) % L + L) % L;
        const k = Tracks.curvature(track, s);
        const ui = urgencyOf(p.speed, k, dist, p.axEstSm, lat, brake);
        if (ui > u) u = ui;
      }
      lastU = u;

      // Braking tone — duck when the existing PREDICTIVE CUE owns the pulse.
      const brakeCueBusy = (typeof BrakeCue !== "undefined") && BrakeCue.on
        && BrakeCue.on() && BrakeCue.debug && (BrakeCue.debug().urgency || 0) >= BRAKE_GATE;
      if (u >= BRAKE_GATE && !brakeCueBusy) {
        nextBrakeT -= dt;
        if (nextBrakeT <= 0) {
          nextBrakeT = PERIOD_LO + (PERIOD_HI - PERIOD_LO) * u;
          if (G.soundOn && typeof GameAudio !== "undefined" && GameAudio.driveBrakeTone) {
            GameAudio.driveBrakeTone(u);
            brakeFired++;
          }
        }
      } else {
        nextBrakeT = 0;
      }

      // Corner call — once per turn, +k = LEFT.
      const side = cornerSide(track, p.s, look * 0.85, nS);
      // Re-arm once the called turn is behind the car (forward arc past callExitM).
      // Forward-only (fwd < L/2): a rewind/flashback behind lastCallS wraps the
      // long way (~L) and must not re-arm. side===0 alone is not enough — a
      // flashback onto the straight before the same turn would re-arm and call it
      // twice.
      if (!callArmed && lastCallS != null) {
        const fwd = ((p.s - lastCallS) % L + L) % L;
        if (fwd >= callExitM && fwd < L * 0.5) callArmed = true;
      }
      if (side !== 0) {
        const ds = lastCallS == null ? Infinity
          : Math.min(Math.abs(p.s - lastCallS), L - Math.abs(p.s - lastCallS));
        if (side !== lastCallSide || (callArmed && ds > CALL_COOLDOWN_M)) {
          lastCallS = p.s;
          lastCallSide = side;
          callArmed = false;
          callExitM = cornerExit(track, p.s, look * 0.85, nS, side);
          if (G.soundOn && typeof GameAudio !== "undefined" && GameAudio.cornerCall) {
            GameAudio.cornerCall(side > 0 ? "L" : "R");
            callFired++;
          }
        }
      }
    }

    function debug() {
      return {
        level, on: cfg.on, lookSec: +cfg.lookSec.toFixed(2),
        urgency: +lastU.toFixed(3), brakeFired, callFired, lastCallSide,
      };
    }

    inst = { tick, setLevel, debug, fromSlider, urgencyOf, cornerSide, on: () => cfg.on };
    return inst;
  }

  return Object.freeze({
    create, fromSlider, urgencyOf, cornerSide, labelOf,
    tick() { if (inst) inst.tick(); },
    on() { return !!inst && inst.on(); },
    debug() { return inst ? inst.debug() : null; },
    setLevel(v) { if (inst) inst.setLevel(v); },
  });
})();
