/* Apex 26 — lens-only FOV delta for every live camera family. The rig (vantage.js) places the eye; this adds degrees, or null when the mode is not a lens family. Chase, broadcast and onboard keep the reads they had when they were three files. Public surface is apply() only (CamFeel.drive); family helpers stay internal. */
const DriveLens = (function () {
  "use strict";

  function abs(v) { return v < 0 ? -v : v; }

  function chase(mode, eye, tgt, ctx) {
    const sp = ctx.sp, yaw = ctx.yaw, brake = ctx.brake, slip = ctx.slip;
    if (mode === "chase") return 4 * sp + 2 * abs(yaw) + 2 * brake;
    if (mode === "far") return 7 * sp + 0.4 * abs(yaw);
    if (mode === "drift") return 3 * sp + 6 * abs(yaw) + 4 * abs(slip);
    if (mode === "low") return 5 * sp;
    if (mode === "reverse") return 1.5 * sp;
    return null;
  }

  function n(v) {
    return typeof v === "number" && isFinite(v) ? v : 0;
  }
  function read(ctx) {
    ctx = ctx || {};
    return { sp: n(ctx.sp), yaw: n(ctx.yaw), brake: n(ctx.brake), slip: n(ctx.slip) };
  }
  function broadcast(mode, eye, tgt, ctx) {
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

  function spOf(ctx) { return (ctx && ctx.sp) || 0; }
  function brakeOf(ctx) { return (ctx && ctx.brake) || 0; }
  function onboard(mode, eye, tgt, ctx) {
    if (mode === "cockpit" || mode === "helmet") return 1.5 * spOf(ctx) + 1 * brakeOf(ctx);   // HELMET is the cockpit from inside the lid
    if (mode === "visor") return 1 * spOf(ctx);
    if (mode === "hood") return 2 * spOf(ctx) + 1.5 * brakeOf(ctx);
    if (mode === "tcam") return 2.5 * spOf(ctx);
    if (mode === "rear") return 1 * spOf(ctx) + 4 * brakeOf(ctx);
    return null;
  }

  // Same order CamFeel.drive used when the families were three globals: chase, then broadcast, then onboard.
  function apply(mode, eye, tgt, ctx) {
    let delta = chase(mode, eye, tgt, ctx);
    if (delta == null) delta = broadcast(mode, eye, tgt, ctx);
    if (delta == null) delta = onboard(mode, eye, tgt, ctx);
    return delta;
  }

  return { apply };
})();
Object.freeze(DriveLens);
