/* Apex 26 — DriveChase: live dolly / swing / FOV for the five chase-family cams.
   Caller has already smoothed ctx { sp, yaw, brake, slip }. Each mode owns its
   own amounts — do not fold these back into one shared curve. Mutates eye/tgt.
   +yaw / +slip swing the eye to the OUTSIDE of the turn (−right). +brake is
   nose-down. Pull-back (positive metres) moves the eye away from the target. */
const DriveChase = (function () {
  "use strict";

  const MODES = ["chase", "far", "drift", "low", "reverse"];

  function axes(eye, tgt) {
    let fx = tgt[0] - eye[0], fz = tgt[2] - eye[2];
    const fl = Math.hypot(fx, fz) || 1;
    fx /= fl; fz /= fl;
    return { fx: fx, fz: fz, rx: fz, rz: -fx };
  }

  function abs(v) { return v < 0 ? -v : v; }

  // Classic F1 chase: moderate speed dolly, real outside swing, brake dives in.
  function chase(eye, tgt, sp, yaw, brake, slip) {
    const a = axes(eye, tgt);
    const back = 2.0 * sp - 1.5 * brake;
    eye[0] -= a.fx * back;
    eye[1] += 0.4 * sp;
    eye[2] -= a.fz * back;
    const swing = 3.0 * yaw + 0.7 * slip;
    eye[0] -= a.rx * swing;
    eye[2] -= a.rz * swing;
    tgt[1] -= 0.4 * brake;
    return 4 * sp + 2 * abs(yaw) + 2 * brake;
  }

  // Lazy TV long lens: big dolly and lift, almost no lateral fuss.
  function far(eye, tgt, sp, yaw, brake, slip) {
    const a = axes(eye, tgt);
    const back = 3.4 * sp - 0.5 * brake;
    eye[0] -= a.fx * back;
    eye[1] += 0.9 * sp;
    eye[2] -= a.fz * back;
    const swing = 1.2 * yaw + 0.3 * slip;
    eye[0] -= a.rx * swing;
    eye[2] -= a.rz * swing;
    return 7 * sp + 0.4 * abs(yaw);
  }

  // Action cam: the slide is the shot. Slip owns the swing; dolly stays short.
  function drift(eye, tgt, sp, yaw, brake, slip) {
    const a = axes(eye, tgt);
    const back = 1.2 * sp - 0.3 * brake;
    eye[0] -= a.fx * back;
    eye[1] += 0.2 * sp;
    eye[2] -= a.fz * back;
    const swing = 2.5 * yaw + 4.5 * slip;
    eye[0] -= a.rx * swing;
    eye[2] -= a.rz * swing;
    return 3 * sp + 6 * abs(yaw) + 4 * abs(slip);
  }

  // Bumper: stay on the road. Almost no lift; brake drops eye and aim.
  function low(eye, tgt, sp, yaw, brake) {
    const a = axes(eye, tgt);
    const back = 1.6 * sp;
    eye[0] -= a.fx * back;
    eye[1] += 0.12 * sp - 0.25 * brake;
    eye[2] -= a.fz * back;
    const swing = 1.0 * yaw;
    eye[0] -= a.rx * swing;
    eye[2] -= a.rz * swing;
    tgt[1] -= 0.3 * brake;
    return 5 * sp;
  }

  // Already ahead of the car, looking back. Speed opens air; brake closes it.
  function reverse(eye, tgt, sp, yaw, brake) {
    const a = axes(eye, tgt);
    const back = 1.4 * sp - 1.0 * brake;
    eye[0] -= a.fx * back;
    eye[2] -= a.fz * back;
    const swing = 0.8 * yaw;
    eye[0] -= a.rx * swing;
    eye[2] -= a.rz * swing;
    return 1.5 * sp;
  }

  // apply mutates eye and tgt. Returns a FOV delta in degrees (may be 0 or negative).
  // Return null if mode is not one of yours.
  function apply(mode, eye, tgt, ctx) {
    if (mode !== "chase" && mode !== "far" && mode !== "drift" && mode !== "low" && mode !== "reverse") return null;
    const sp = ctx.sp, yaw = ctx.yaw, brake = ctx.brake, slip = ctx.slip;
    if (mode === "chase") return chase(eye, tgt, sp, yaw, brake, slip);
    if (mode === "far") return far(eye, tgt, sp, yaw, brake, slip);
    if (mode === "drift") return drift(eye, tgt, sp, yaw, brake, slip);
    if (mode === "low") return low(eye, tgt, sp, yaw, brake);
    return reverse(eye, tgt, sp, yaw, brake);
  }

  return { apply: apply, modes: MODES };
})();
