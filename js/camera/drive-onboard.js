/* Apex 26 — drive feel for cameras bolted to the car. A few centimetres of eye motion clips the bodywork, so speed and brake live in the lens. */
const DriveOnboard = (function () {
  "use strict";

  const MODES = ["cockpit", "hood", "visor", "tcam", "rear"];

  // Metres. These are the whole pose budget — no pull-back, no lateral eye.
  const HOOD_DIVE = 0.04;        // eye drop on full brake (nose dive from the hood)
  const TCAM_LIFT = 0.06;        // eye rise at full speed
  const TCAM_DIVE = 0.03;        // eye drop on full brake
  const TCAM_AIM = 0.08;         // target dip on full brake
  const REAR_AIM = 0.15;         // max lateral aim shift on full yaw

  function spOf(ctx) { return (ctx && ctx.sp) || 0; }
  function brakeOf(ctx) { return (ctx && ctx.brake) || 0; }

  function yawOf(ctx) {
    const y = (ctx && ctx.yaw) || 0;
    if (y > 1) return 1;
    if (y < -1) return -1;
    return y;
  }

  // View-right from the horizontal look (tgt − eye). Positive yaw aims that way.
  // No scratch vector: right is (−dz, dx) / |look.xz|.
  function aimRear(eye, tgt, yaw) {
    if (!yaw || !eye || !tgt) return;
    const dx = tgt[0] - eye[0];
    const dz = tgt[2] - eye[2];
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return;
    const scale = (yaw * REAR_AIM) / len;
    tgt[0] += -dz * scale;
    tgt[2] += dx * scale;
  }

  function apply(mode, eye, tgt, ctx) {
    if (mode === "cockpit") return 1.5 * spOf(ctx) + 1 * brakeOf(ctx);
    if (mode === "visor") return 1 * spOf(ctx);
    if (mode === "hood") {
      eye[1] -= HOOD_DIVE * brakeOf(ctx);
      return 2 * spOf(ctx) + 1.5 * brakeOf(ctx);
    }
    if (mode === "tcam") {
      const sp = spOf(ctx);
      const brake = brakeOf(ctx);
      eye[1] += TCAM_LIFT * sp - TCAM_DIVE * brake;
      tgt[1] -= TCAM_AIM * brake;
      return 2.5 * sp;
    }
    if (mode === "rear") {
      aimRear(eye, tgt, yawOf(ctx));
      return 1 * spOf(ctx) + 4 * brakeOf(ctx);
    }
    return null;
  }

  return { apply: apply, modes: MODES };
})();
Object.freeze(DriveOnboard);
