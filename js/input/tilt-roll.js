"use strict";

const TiltRoll = (function () {
  const DEG = Math.PI / 180;

  function rollDeg(beta, gamma, angle) {
    if (beta == null && gamma == null) return null;
    const b = (beta || 0) * DEG, g = (gamma || 0) * DEG;
    const cb = Math.cos(b), sb = Math.sin(b);
    const cg = Math.cos(g), sg = Math.sin(g);
    const gx = sg * cb;
    const gy = -sb;
    const gz = -cg * cb;
    let h, v;
    switch ((((angle || 0) % 360) + 360) % 360) {
      case 90:  h = -gy; v = Math.hypot(gx, gz); break;
      case 180: h = -gx; v = Math.hypot(gy, gz); break;
      case 270: h =  gy; v = Math.hypot(gx, gz); break;
      default:  h =  gx; v = Math.hypot(gy, gz); break;
    }
    return Math.atan2(h, v) / DEG;
  }

  function screenAngle(win, scr) {
    const w = win !== undefined ? win : (typeof window !== "undefined" ? window : null);
    const s = scr !== undefined ? scr : (typeof screen !== "undefined" ? screen : null);
    if (w && typeof w.orientation === "number" && Number.isFinite(w.orientation)) {
      return ((w.orientation % 360) + 360) % 360;
    }
    if (s && s.orientation && typeof s.orientation.angle === "number" && Number.isFinite(s.orientation.angle)) {
      return ((s.orientation.angle % 360) + 360) % 360;
    }
    return 0;
  }

  return { rollDeg, screenAngle };
})();
Object.freeze(TiltRoll);
