/* Apex 26 — CamFx: the chase-cam ACCELERATION SURGE and the render-only IMPACT
   HOLD + FLASH (#7095, #6543 I1 + I3, D-053). LAZY_RACE_SESSION: the eager boot
   wall has no room, and both effects only exist in a race. vantage.js and the
   two impact sites (game.js car contact, wall-clamp.js street walls) typeof-guard
   it, so before the session bundle lands nothing changes. Render-only by
   construction: nothing here writes a car, the clock or the sim; game.js's
   feel.hitStop (a sim slow-down) is a different thing and is untouched.
   Tests: tests/unit/cam-surge-hold.test.mjs. */
const CamFx = (function () {
  "use strict";

  const clamp = M4.clamp;
  const store = typeof GameStore !== "undefined" ? GameStore.store : null;
  const K_HOLD = "impactHold";           // SETTINGS › CAMERA FEEL › IMPACT HOLD (js/camera/feel.js row)

  /* I1 SURGE. The chase/far eye slides back along the view with normalised
     longitudinal acceleration, so a launch or a corner exit pulls the car away
     from the lens. aN = aStd(axEstSm) / ACCEL, 0..1 on throttle (braking keeps
     vantage's CHASE_G_DOLLY). SURGE_LAMBDA 14 is a first-order lag, tau 71 ms
     (Done-when: < 150 ms). Comfort halves it. A one-shot solve (no dt) returns
     0, so snapCam and the unit framings stay the shipped pose. */
  const SURGE_M = Object.freeze({ chase: 0.5, far: 0.8 });
  const SURGE_LAMBDA = 14;
  const ACCEL_REF = typeof PhysicsConsts !== "undefined" && PhysicsConsts.ACCEL > 0 ? PhysicsConsts.ACCEL : 7;
  const VMAX_REF = typeof PhysicsConsts !== "undefined" && PhysicsConsts.VMAX > 0 ? PhysicsConsts.VMAX : 72;
  const _surge = Object.create(null);
  function surgeScale(comfort) { return comfort ? 0.5 : 1; }
  // vTop is the pace-scaled top speed vantage normalises by: VMAX_REF / vTop is aStd's 1 / PACE.
  function surgeN(ax, vTop) {
    const k = vTop > 0 ? VMAX_REF / vTop : 1;
    return clamp((ax || 0) * k / ACCEL_REF, 0, 1);
  }
  function surge(mode, aN, dt, comfort) {
    const m = SURGE_M[mode];
    if (!m) return 0;
    if (!(dt > 0)) { _surge[mode] = 0; return 0; }
    const target = clamp(aN || 0, 0, 1) * m * surgeScale(comfort);
    const cur = _surge[mode] || 0;
    return (_surge[mode] = cur + (target - cur) * (1 - Math.exp(-SURGE_LAMBDA * dt)));
  }

  // vantage.js's chase/far branch: the metres to pull the eye back this frame.
  function chase(mode, extra, vTop) {
    return surge(mode === "far" ? "far" : "chase", surgeN(extra.att.axEstSm, vTop), extra.dt, extra.reduceMotion);
  }

  /* I3 HOLD + FLASH. A hard hit freezes the external camera's EYE for
     HOLD_MIN..HOLD_MIN+HOLD_SPAN s of wall time (the aim keeps the car in frame;
     the rig's own damping eases the eye back) and flashes the screen once. The
     setting OFF skips both; comfort / REDUCE MOTION skips both (the flash reads
     the comfort last seen by the player's solve, holdEye's `comfort`); onboard
     skips only the hold (the rig rides the eye). */
  const HOLD_MIN_SEV = 0.3, HOLD_MIN = 0.05, HOLD_SPAN = 0.07, FLASH_MAX = 0.22, FLASH_MS = 260;
  let holdT = 0, holdHave = false, _comfort = false;   // _comfort: holdEye's last `comfort` (extra.reduceMotion)
  const _eye = [0, 0, 0];
  function holdOn() {
    const v = store ? store.get(K_HOLD, true) : true;
    return v !== false && v !== "off" && v !== "0";
  }
  function impact(sev) {
    if (!(sev >= HOLD_MIN_SEV) || !holdOn()) return false;
    const n = clamp(sev, 0, 1);
    holdT = Math.max(holdT, HOLD_MIN + HOLD_SPAN * n);
    if (!_comfort) flash(FLASH_MAX * n);
    return true;
  }
  // vantage.js, last on the live solve. True when it wrote the held eye.
  function holdEye(eye, onboard, dt, comfort) {
    _comfort = !!comfort;
    if (!(dt > 0) || comfort) { holdT = 0; holdHave = false; return false; }
    const live = holdT > 0 && !onboard;
    holdT = Math.max(0, holdT - dt);
    if (!live) { holdHave = false; return false; }
    if (!holdHave) { _eye[0] = eye[0]; _eye[1] = eye[1]; _eye[2] = eye[2]; holdHave = true; return false; }
    eye[0] = _eye[0]; eye[1] = _eye[1]; eye[2] = _eye[2];
    return true;
  }
  // One self-ending Web Animation: no per-frame paint, and nothing can be left lit
  // when the race camera stops solving. Under #hud at z-index -1, like the speed vignette.
  let _flashEl = null;
  function flash(a) {
    if (typeof document === "undefined" || !document.createElement) return;
    if (!_flashEl) {
      _flashEl = document.createElement("div");
      _flashEl.id = "impact-flash";
      _flashEl.setAttribute("aria-hidden", "true");
      _flashEl.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:-1;opacity:0;" +
        "background:radial-gradient(ellipse at center,rgba(255,255,255,.35) 0%,rgba(255,255,255,.9) 100%)";
      const hud = document.getElementById("hud");
      if (hud) hud.insertBefore(_flashEl, hud.firstChild);
      else if (document.body) document.body.appendChild(_flashEl);
    }
    if (typeof _flashEl.animate === "function")
      _flashEl.animate([{ opacity: a }, { opacity: 0 }], { duration: FLASH_MS, easing: "ease-out" });
  }
  function hold(eye, onboard, extra) { return holdEye(eye, onboard, extra.dt, extra.reduceMotion); }
  function reset() { holdT = 0; holdHave = false; for (const k in _surge) delete _surge[k]; }
  function state() { return { on: holdOn(), t: holdT, held: holdHave }; }

  return Object.freeze({ K_HOLD, SURGE_LAMBDA, surge, surgeN, surgeScale, chase, impact, holdEye, hold, holdOn, reset, state });
})();
// A cut (setCamMode, snapGameCam, a restart's snap): no hold or surge carries into the new vantage (#7350).
if (typeof Scopes !== "undefined") Scopes.register("camera-mode", { id: "cam-fx", on: ["cut"], touches: ["impact-hold"], exit: () => CamFx.reset() });
