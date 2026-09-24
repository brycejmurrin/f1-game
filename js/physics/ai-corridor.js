/* AI-only reachable passing lanes. Read-only traffic inputs, no randomness. */
"use strict";
const AiCorridor = (function () {
  // Restrict to the lateral overlap interval, then find the exact extrema
  // of longitudinal displacement under bounded observed acceleration. This
  // catches a rival accelerating into the lane without padding every gap.
  function crosses(s, x, vs, vx, seconds, accel = 0) {
    let enter = 0, leave = seconds;
    if (Math.abs(vx) < 1e-8) { if (Math.abs(x) >= 2.2) return false; }
    else {
      const a = (-2.2 - x) / vx, b = (2.2 - x) / vx;
      enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b));
    }
    if (enter >= leave) return false;
    const first = s + vs * enter + .5 * accel * enter * enter;
    const last = s + vs * leave + .5 * accel * leave * leave;
    let lo = Math.min(first, last), hi = Math.max(first, last);
    if (Math.abs(accel) > 1e-8) {
      const turn = -vs / accel;
      if (turn > enter && turn < leave) { const p = s + vs * turn + .5 * accel * turn * turn; lo = Math.min(lo, p); hi = Math.max(hi, p); }
    }
    return lo < 5.2 && hi > -5.2;
  }
  // Sanity-limit collision impulses, not normal BRAKE-scale deceleration.
  // Bound each car independently: our braking can close a following rival.
  function acceleration(car) {
    return Number.isFinite(car.corridorAccel) ? Math.max(-40, Math.min(20, car.corridorAccel)) : 0;
  }
  function candidate(ctx, car, blocker, cars, total, clear, side, out) {
    const room = side > 0 ? Math.min(ctx.roomR, ctx.roadR) : Math.min(ctx.roomL, ctx.roadL);
    out.side = side; out.score = -Infinity; out.reason = "road too narrow";
    out.target = blocker.x + side * clear;
    if (room < clear || out.target < car.x - ctx.roadL || out.target > car.x + ctx.roadR) return;
    const lateral = out.target - car.x;
    const seconds = Math.max(.4, Math.min(1.6, Math.abs(lateral) / 2.4));
    out.seconds = seconds;
    for (const other of cars) {
      if (other === car || other.retired || other.finished) continue;
      const raw = other.prog - car.prog;
      const gap = ((raw + total / 2) % total + total) % total - total / 2;
      const closing = other.speed - car.speed;
      // Observed motion only: no privileged knowledge of another driver's input.
      const accel = acceleration(other) - acceleration(car);
      if (crosses(gap, other.x - car.x, closing, -lateral / seconds, seconds, accel)
        || crosses(gap + closing * seconds + .5 * accel * seconds * seconds,
          other.x - out.target, closing + accel * seconds, 0, .5, accel)) {
        out.reason = other === blocker ? "cannot clear the blocker in time" : "traffic in the passing lane"; return;
      }
    }
    out.reason = "clear passing lane";
    out.score = Math.min(room, 8) * .25 - seconds + (AiDrive.otSide(ctx) === side ? .3 : 0);
  }
  function choose(ctx, car, blocker, cars, total, clear, out = {}) {
    out.left = out.left || {}; out.right = out.right || {};
    candidate(ctx, car, blocker, cars, total, clear, -1, out.left);
    candidate(ctx, car, blocker, cars, total, clear, 1, out.right);
    const best = out.left.score > out.right.score ? out.left : out.right;
    out.side = Number.isFinite(best.score) ? best.side : 0;
    out.reason = out.side ? (out.side < 0 ? "pass left" : "pass right") : "follow: no reachable passing lane";
    return out;
  }
  return Object.freeze({ choose });
})();
Object.freeze(AiCorridor);
