/* Apex 26 — lens only for cameras bolted to the car.
   A few centimetres of extra eye motion clips the bodywork, so speed and
   brake live in the lens. The eye stays where the rig put it. */
const DriveOnboard = (function () {
  "use strict";

  const MODES = ["cockpit", "hood", "visor", "tcam", "rear"];

  function spOf(ctx) { return (ctx && ctx.sp) || 0; }
  function brakeOf(ctx) { return (ctx && ctx.brake) || 0; }

  function apply(mode, eye, tgt, ctx) {
    if (mode === "cockpit") return 1.5 * spOf(ctx) + 1 * brakeOf(ctx);
    if (mode === "visor") return 1 * spOf(ctx);
    if (mode === "hood") return 2 * spOf(ctx) + 1.5 * brakeOf(ctx);
    if (mode === "tcam") return 2.5 * spOf(ctx);
    if (mode === "rear") return 1 * spOf(ctx) + 4 * brakeOf(ctx);
    return null;
  }

  return { apply: apply, modes: MODES };
})();
