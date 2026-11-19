const CamFov = (function () {
  "use strict";

  const clamp = M4.clamp;

  function speedFov(base, widen, spN, scale, depBoost) {
    const s = scale == null ? 1 : scale;
    const n = clamp(spN, 0, 1);
    return base + widen * n * s + (depBoost || 0);
  }

  const FOV_BY_MODE = Object.freeze({
    cockpit:    { base: 64, widen: 14, scale: 1,   dep: 3 },
    hood:       { base: 64, widen: 14, scale: 1,   dep: 3 },
    visor:      { base: 64, widen: 14, scale: 1,   dep: 3 },
    helmet:     { base: 64, widen: 14, scale: 1,   dep: 3 },
    overhead:   { base: 46, widen: 0,  scale: 1,   dep: 0 },
    heli:       { base: 36, widen: 8,  scale: 0.5, dep: 2 },
    reverse:    { base: 60, widen: 12, scale: 1,   dep: 0 },
    side:       { base: 44, widen: 6,  scale: 0.5, dep: 0 },
    cinematic:  { base: 50, widen: 10, scale: 1,   dep: 0 },
    low:        { base: 55, widen: 13, scale: 1,   dep: 0 },
    tcam:       { base: 46, widen: 8,  scale: 0.5, dep: 2 },
    rear:       { base: 58, widen: 12, scale: 1,   dep: 2 },
    drift:      { base: 55, widen: 15, scale: 1,   dep: 3 },
    chase:      { base: 57, widen: 6,  scale: 1,   dep: 3 },
    far:        { base: 61, widen: 6,  scale: 1,   dep: 3 },
  });

  function modeFov(mode, sp, deploy) {
    const r = FOV_BY_MODE[mode] || FOV_BY_MODE.chase;
    return speedFov(r.base, r.widen, sp, r.scale, (deploy ? 1 : 0) * r.dep);
  }

  function modeBoost(mode, sp, deploy) {
    const r = FOV_BY_MODE[mode];
    return r ? speedFov(0, r.widen, sp, r.scale, (deploy ? 1 : 0) * r.dep) : 0;
  }

  return { speedFov, modeFov, modeBoost, FOV_BY_MODE };
})();
Object.freeze(CamFov);
