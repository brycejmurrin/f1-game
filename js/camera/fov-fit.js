const CamFovFit = (function () {
  "use strict";

  const HFOV_MAX = 86 * Math.PI / 180;
  const HFOV_MIN = 60 * Math.PI / 180;
  const HFOV_BOOST_MAX = 110 * Math.PI / 180;
  const FOVY_MAX = 100 * Math.PI / 180;
  const ASPECT_EPS = 0.0001;

  function vfovForHfov(hfov, aspect) {
    return 2 * Math.atan(Math.tan(hfov / 2) / Math.max(aspect, ASPECT_EPS));
  }

  function hfovFromVfov(fovY, aspect) {
    return 2 * Math.atan(Math.tan(fovY / 2) * Math.max(aspect, ASPECT_EPS));
  }

  const FOVY_FALLBACK = 60 * Math.PI / 180;

  function fitFovY(fovYRad, aspect, opts) {
    const authored = (typeof fovYRad === "number" && isFinite(fovYRad) && fovYRad > 0)
      ? fovYRad : FOVY_FALLBACK;
    if (opts && opts.cine) return authored;
    const a = (typeof aspect === "number" && isFinite(aspect) && aspect > 0) ? aspect : 1;
    let fovY = authored;
    const fovYCap = vfovForHfov(HFOV_MAX, a);
    fovY = Math.min(fovY, fovYCap);
    const boost = opts && typeof opts.boost === "number" && isFinite(opts.boost) ? opts.boost : 0;
    if (boost && a >= 1 && authored - boost > 0) {
      fovY = Math.min(Math.min(authored - boost, fovYCap) + boost, Math.max(fovY, vfovForHfov(HFOV_BOOST_MAX, a)));
    }
    if (a < 1) {
      const fovYFloor = vfovForHfov(HFOV_MIN, a);
      fovY = Math.max(fovY, fovYFloor);
      if (fovY > FOVY_MAX) fovY = FOVY_MAX;
    }
    return (fovY > 0 && isFinite(fovY)) ? fovY : FOVY_FALLBACK;
  }

  return {
    fitFovY,
    hfovFromVfov,
    HFOV_MAX,
    HFOV_MIN,
    HFOV_BOOST_MAX,
    FOVY_MAX,
  };
})();
Object.freeze(CamFovFit);
