/* Apex 26 — lens only for the chase family.
   vantage.js owns the pose: distance, corner lead, the brake tuck, the drift
   swing. This used to add a second dolly on top of that pose. It does not
   move the eye or the aim. The return is a FOV delta in degrees. */
const DriveChase = (function () {
  "use strict";

  const MODES = ["chase", "far", "drift", "low", "reverse"];

  function abs(v) { return v < 0 ? -v : v; }

  function apply(mode, eye, tgt, ctx) {
    const sp = ctx.sp, yaw = ctx.yaw, brake = ctx.brake, slip = ctx.slip;
    if (mode === "chase") return 4 * sp + 2 * abs(yaw) + 2 * brake;
    if (mode === "far") return 7 * sp + 0.4 * abs(yaw);
    if (mode === "drift") return 3 * sp + 6 * abs(yaw) + 4 * abs(slip);
    if (mode === "low") return 5 * sp;
    if (mode === "reverse") return 1.5 * sp;
    return null;
  }

  return { apply: apply, modes: MODES };
})();
