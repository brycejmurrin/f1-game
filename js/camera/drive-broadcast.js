/* Apex 26 — per-mode drive offsets for the broadcast cameras.
   Each rig moves on its own (a heli is not a side cam is not a fixed
   trackside). Mutates eye / aim only and returns an FOV delta in degrees,
   or null when the mode is not one of these eight. Never touches car state.
   ctx is already smoothed: sp 0..1, yaw −1..1, brake 0..1, slip −1..1.
   +yaw noses toward +right; the outside of that turn is −right. */
const DriveBroadcast = (function () {
  "use strict";

  function axes(eye, tgt) {
    let fx = tgt[0] - eye[0], fz = tgt[2] - eye[2];
    const fl = Math.hypot(fx, fz) || 1;
    fx /= fl; fz /= fl;
    return { fx: fx, fz: fz, rx: fz, rz: -fx };
  }

  function n(v) {
    return typeof v === "number" && isFinite(v) ? v : 0;
  }

  function read(ctx) {
    ctx = ctx || {};
    return { sp: n(ctx.sp), yaw: n(ctx.yaw), brake: n(ctx.brake), slip: n(ctx.slip) };
  }

  /* Heavy helicopter: climbs and backs off with speed, swings wide to the
     outside, and does not dive on the brakes. */
  function heli(eye, tgt, c) {
    const a = axes(eye, tgt);
    const sp = c.sp, yaw = c.yaw, slip = c.slip;
    eye[1] += 1.6 * sp;
    eye[0] -= a.fx * (4.5 * sp);
    eye[2] -= a.fz * (4.5 * sp);
    eye[0] -= a.rx * (6 * yaw);
    eye[2] -= a.rz * (6 * yaw);
    eye[0] -= a.rx * (1.5 * slip);
    eye[2] -= a.rz * (1.5 * slip);
    return 8 * sp + 3 * Math.abs(yaw);
  }

  /* TV tracking car, already outside the corner: speed runs the eye ahead
     along the view instead of chasing, with only a small extra swing. */
  function side(eye, tgt, c) {
    const a = axes(eye, tgt);
    const sp = c.sp, yaw = c.yaw;
    eye[0] += a.fx * (1.5 * sp);
    eye[2] += a.fz * (1.5 * sp);
    eye[1] += 0.3 * sp;
    eye[0] -= a.rx * (1.5 * yaw);
    eye[2] -= a.rz * (1.5 * yaw);
    return 5 * sp;
  }

  /* Crane: short pull-back, a modest rise, and a small outside swing so
     the head does not whip. No brake tuck. */
  function cinematic(eye, tgt, c) {
    const a = axes(eye, tgt);
    const sp = c.sp, yaw = c.yaw;
    eye[0] -= a.fx * (2 * sp);
    eye[2] -= a.fz * (2 * sp);
    eye[1] += 1.2 * sp;
    eye[0] -= a.rx * (2 * yaw);
    eye[2] -= a.rz * (2 * yaw);
    return 4 * sp;
  }

  /* Top-down: speed lifts and eases the eye back. Yaw must not slide it
     off the car, and braking does not drop it. */
  function overhead(eye, tgt, c) {
    const a = axes(eye, tgt);
    const sp = c.sp;
    eye[1] += 2.2 * sp;
    eye[0] -= a.fx * (1.5 * sp);
    eye[2] -= a.fz * (1.5 * sp);
    return 3 * sp;
  }

  /* Loose tether: the highest chase lift, a long pull-back, and a wide
     outside / slip swing. Brake is ignored. */
  function drone(eye, tgt, c) {
    const a = axes(eye, tgt);
    const sp = c.sp, yaw = c.yaw, slip = c.slip;
    eye[1] += 2.0 * sp;
    eye[0] -= a.fx * (5 * sp);
    eye[2] -= a.fz * (5 * sp);
    eye[0] -= a.rx * (5 * yaw);
    eye[2] -= a.rz * (5 * yaw);
    eye[0] -= a.rx * (2 * slip);
    eye[2] -= a.rz * (2 * slip);
    return 6 * sp + 2 * Math.abs(yaw);
  }

  /* Battle frame: medium chase, a little height, a moderate outside swing
     so both cars stay in shot. Brake dips the aim only — the eye is not
     shoved toward the cars. */
  function rival(eye, tgt, c) {
    const a = axes(eye, tgt);
    const sp = c.sp, yaw = c.yaw, brake = c.brake;
    eye[0] -= a.fx * (2.5 * sp);
    eye[2] -= a.fz * (2.5 * sp);
    eye[1] += 0.8 * sp;
    eye[0] -= a.rx * (2 * yaw);
    eye[2] -= a.rz * (2 * yaw);
    tgt[1] -= 0.2 * brake;
    return 6 * sp;
  }

  /* Wall camera. The eye stays put; the aim may nod down under braking.
     No lateral swing. */
  function pitwall(eye, tgt, c) {
    tgt[1] -= 0.15 * c.brake;
    return 2 * c.sp;
  }

  /* Fixed corner camera. Eye and aim do not move; the lens opens slightly
     with speed and a hair with steering. */
  function trackside(eye, tgt, c) {
    return 3 * c.sp + 0.5 * Math.abs(c.yaw);
  }

  function apply(mode, eye, tgt, ctx) {
    const c = read(ctx);
    if (mode === "heli") return heli(eye, tgt, c);
    if (mode === "side") return side(eye, tgt, c);
    if (mode === "cinematic") return cinematic(eye, tgt, c);
    if (mode === "overhead") return overhead(eye, tgt, c);
    if (mode === "drone") return drone(eye, tgt, c);
    if (mode === "rival") return rival(eye, tgt, c);
    if (mode === "pitwall") return pitwall(eye, tgt, c);
    if (mode === "trackside") return trackside(eye, tgt, c);
    return null;
  }

  return {
    apply: apply,
    modes: ["heli", "side", "cinematic", "overhead", "drone", "rival", "pitwall", "trackside"],
  };
})();
Object.freeze(DriveBroadcast);
