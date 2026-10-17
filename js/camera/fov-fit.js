/* Apex 26 — aspect-aware vertical FOV fit.
 *
 * camFov / vantage FOVs are VERTICAL. A fixed VFOV on a wide screen blows the
 * horizontal field out (car looks tiny); on a narrow portrait screen the same
 * VFOV collapses HFOV so the car fills the frame and the corner ahead vanishes.
 *
 * HFOV_MAX (86°) — landscape CAP: zoom in so the car stays readable. Unchanged
 * from the previous inline formula in game.js.
 *
 * HFOV_MIN (60°) — portrait FLOOR: widen VFOV so phone/portrait race views keep
 * a usable horizontal field. 60° is roughly a comfortable phone-held-landscape
 * horizontal FOV; below that the nose eats the frame and the braking zone
 * disappears. Justification: chase/cockpit at aspect ≈0.46 with a 64–78° VFOV
 * only delivered ~32–40° HFOV before this floor.
 *
 * FOVY_MAX (~100°) — hard ceiling so an ultra-narrow aspect cannot open into a
 * fisheye. At aspect 0.46 the floor wants ~103° VFOV for a full 60° HFOV; the
 * ceiling soft-limits HFOV a few degrees under the floor there.
 *
 * cine: return the authored VFOV untouched (crane/editor framing stays as framed).
 * Square and landscape (aspect >= 1) keep the old cap-only path.
 */
const CamFovFit = (function () {
  "use strict";

  const HFOV_MAX = 86 * Math.PI / 180;
  const HFOV_MIN = 60 * Math.PI / 180;
  const FOVY_MAX = 100 * Math.PI / 180;
  const ASPECT_EPS = 0.0001;

  /** Vertical FOV that yields exactly `hfov` at `aspect`. */
  function vfovForHfov(hfov, aspect) {
    return 2 * Math.atan(Math.tan(hfov / 2) / Math.max(aspect, ASPECT_EPS));
  }

  /** Horizontal FOV implied by vertical FOV at `aspect` (for tests / probes). */
  function hfovFromVfov(fovY, aspect) {
    return 2 * Math.atan(Math.tan(fovY / 2) * Math.max(aspect, ASPECT_EPS));
  }

  /**
   * @param {number} fovYRad  authored / damped vertical FOV (radians)
   * @param {number} aspect   width/height (gfx.aspect)
   * @param {{cine?: boolean}} [opts]
   * @returns {number} fitted vertical FOV (radians)
   */
  function fitFovY(fovYRad, aspect, opts) {
    if (opts && opts.cine) return fovYRad;
    let fovY = fovYRad;
    // Cap: landscape — same formula as the former game.js inline block.
    const fovYCap = vfovForHfov(HFOV_MAX, aspect);
    fovY = Math.min(fovY, fovYCap);
    // Floor and ceiling belong to portrait only; preserve authored long lenses
    // on square/landscape screens, including normal TRACKSIDE cameras.
    if (aspect < 1) {
      const fovYFloor = vfovForHfov(HFOV_MIN, aspect);
      fovY = Math.max(fovY, fovYFloor);
      if (fovY > FOVY_MAX) fovY = FOVY_MAX;
    }
    return fovY;
  }

  return {
    fitFovY,
    hfovFromVfov,
    HFOV_MAX,
    HFOV_MIN,
    FOVY_MAX,
  };
})();
Object.freeze(CamFovFit);
