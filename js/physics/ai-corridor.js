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
  // The per-tick traffic snapshot (game.js stamps _snapProg/_snapX/_snapSpeed on
  // every car before any updateCar runs), so a rival moved earlier in the tick
  // does not look ~1.3 m further along and the answer cannot depend on array
  // order. Live value when a car carries no snapshot (bare tests, first tick).
  function snap(o, key, live) { const v = o[key]; return Number.isFinite(v) ? v : live; }
  function candidate(ctx, car, blocker, cars, total, clear, side, out) {
    const room = side > 0 ? Math.min(ctx.roomR, ctx.roadR) : Math.min(ctx.roomL, ctx.roadL);
    out.side = side; out.score = -Infinity; out.reason = "road too narrow";
    out.target = snap(blocker, "_snapX", blocker.x) + side * clear;
    if (room < clear || out.target < car.x - ctx.roadL || out.target > car.x + ctx.roadR) return;
    const lateral = out.target - car.x;
    const seconds = Math.max(.4, Math.min(1.6, Math.abs(lateral) / 2.4));
    out.seconds = seconds;
    const reach = Math.max(car.speed, 10) * 1.5;
    const blockerSpeed = snap(blocker, "_snapSpeed", blocker.speed);
    const passT = Math.min(8, ((ctx.blockerGap || 0) + 6.3) / Math.max((ctx.freeSpeed || car.speed) - (ctx.blockerVmax || blockerSpeed), (ctx.vTop || 72) / 72));
    for (const other of cars) {
      if (other === car || other.retired || other.finished) continue;
      const oProg = snap(other, "_snapProg", other.prog), oX = snap(other, "_snapX", other.x), oSpeed = snap(other, "_snapSpeed", other.speed);
      const raw = oProg - car.prog;
      const gap = ((raw + total / 2) % total + total) % total - total / 2;
      const closing = oSpeed - car.speed;
      // Observed motion only: no privileged knowledge of another driver's input.
      const accel = acceleration(other) - acceleration(car);
      if (crosses(gap, oX - car.x, closing, -lateral / seconds, seconds, accel)
        || crosses(gap + closing * seconds + .5 * accel * seconds * seconds,
          oX - out.target, closing + accel * seconds, 0, .5, accel)) {
        out.reason = other === blocker ? "cannot clear the blocker in time" : "traffic in the passing lane"; return;
      }
      // LOOK DOWN THE LANE, not just beside it: a car ahead in the target lane
      // that we would catch before the pass is done (blocker gap + a car
      // length, at our closing rate on the blocker) is the next blocker — the
      // move pulls out only to queue again. Within 1.5 s of road.
      if (!ctx.street && other !== blocker && gap > 0 && gap < reach && Math.abs(oX - out.target) < 2.2
        && gap - (car.speed - oSpeed) * passT < 6) { out.reason = "traffic ahead in the passing lane"; return; }
    }
    out.reason = "clear passing lane";
    out.score = Math.min(room, 8) * .25 - seconds + AiDrive.passSideBonus(ctx, side);
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
