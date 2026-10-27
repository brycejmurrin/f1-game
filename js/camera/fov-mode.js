/* Apex 26 — one speed-FOV curve for every player camera. vantage.js asks CamFeel.modeFov, which forwards here, so the recipe is not buried in look-back and shake. */
const CamFov = (function () {
  "use strict";

  const clamp = M4.clamp;

  /* Shared speed FOV: FOV = base + widen * spN * scale + depBoost.
     Modes that used to ignore speed (tcam / side / heli) pass scale < 1 so they
     share the curve without jumping to chase-like widen. */
  function speedFov(base, widen, spN, scale, depBoost) {
    const s = scale == null ? 1 : scale;
    const n = clamp(spN, 0, 1);
    return base + widen * n * s + (depBoost || 0);
  }

  // Per-mode FOV recipe. scale defaults to 1; mild scales restore a curve where FOV was fixed.
  const FOV_BY_MODE = Object.freeze({
    cockpit:    { base: 64, widen: 14, scale: 1,   dep: 3 },
    hood:       { base: 64, widen: 14, scale: 1,   dep: 3 },
    visor:      { base: 64, widen: 14, scale: 1,   dep: 3 },
    helmet:     { base: 64, widen: 14, scale: 1,   dep: 3 },   // the cockpit's lens; the visor frame is CSS
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

  // `sp` is the FOV speed blend (0..1). vantage.js passes CamTune-scaled
  // `spFov` so COMFORT › SPEED FOV still lands; look-ahead keeps full spN.
  function modeFov(mode, sp, deploy) {
    const r = FOV_BY_MODE[mode] || FOV_BY_MODE.chase;
    return speedFov(r.base, r.widen, sp, r.scale, (deploy ? 1 : 0) * r.dep);
  }

  return { speedFov, modeFov, FOV_BY_MODE };
})();
Object.freeze(CamFov);
