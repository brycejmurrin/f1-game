/* Shared pit-crew draw helpers. Motion, service, choreography and the arrival
 * clock call these; the bay crew in scene-crew.js keeps its own batch. */
const GarageCrewDraw = (function () {
  "use strict";
  const acc = () => ({ pos: [], nrm: [], col: [], mat: [], idx: [] });
  // Smoothstep, clamped. The arrival shutter and the service phases share it.
  const ease = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
  // Yaw about Y, then an optional local X tilt. rx 0 is a prop on the bay;
  // the service jack's pump is the tilt. Column-major, written into m.
  function place(m, x, y, z, yaw, rx = 0) {
    const c = Math.cos(yaw), s = Math.sin(yaw), cx = Math.cos(rx), sx = Math.sin(rx);
    m[0] = c; m[1] = 0; m[2] = -s; m[3] = 0;
    m[4] = s * sx; m[5] = cx; m[6] = c * sx; m[7] = 0;
    m[8] = s * cx; m[9] = -sx; m[10] = c * cx; m[11] = 0;
    m[12] = x; m[13] = y; m[14] = z; m[15] = 1;
    return m;
  }
  // Parent * local. M4.mulTo, so the in-race stop does not keep a second product.
  function mul(out, a, b) { return M4.mulTo(out, a, b); }
  return Object.freeze({ acc, ease, place, mul });
})();
