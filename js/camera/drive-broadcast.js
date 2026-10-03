/* Apex 26 — lens only for the broadcast cameras.
   The rig places the helicopter, the crane, the wall. This does not move
   them again. The return is a FOV delta in degrees, or null for another family. */
const DriveBroadcast = (function () {
  "use strict";

  function n(v) {
    return typeof v === "number" && isFinite(v) ? v : 0;
  }

  function read(ctx) {
    ctx = ctx || {};
    return { sp: n(ctx.sp), yaw: n(ctx.yaw), brake: n(ctx.brake), slip: n(ctx.slip) };
  }

  function apply(mode, eye, tgt, ctx) {
    const c = read(ctx);
    if (mode === "heli") return 8 * c.sp + 3 * Math.abs(c.yaw);
    if (mode === "side") return 5 * c.sp;
    if (mode === "cinematic") return 4 * c.sp;
    if (mode === "overhead") return 3 * c.sp;
    if (mode === "drone") return 6 * c.sp + 2 * Math.abs(c.yaw);
    if (mode === "rival") return 6 * c.sp;
    if (mode === "pitwall") return 2 * c.sp;
    if (mode === "trackside") return 3 * c.sp + 0.5 * Math.abs(c.yaw);
    return null;
  }

  return {
    apply: apply,
    modes: ["heli", "side", "cinematic", "overhead", "drone", "rival", "pitwall", "trackside"],
  };
})();
Object.freeze(DriveBroadcast);
