/* AI-only reachable passing lanes. Read-only traffic inputs, no randomness. */
"use strict";
const AiCorridor = (function () {
  // Continuous slab intersection catches traffic between the endpoints too.
  function crosses(s, x, vs, vx, seconds) {
    let enter = 0, leave = seconds;
    for (let axis = 0; axis < 2; axis++) {
      const p = axis ? x : s, v = axis ? vx : vs, half = axis ? 2.2 : 5.2;
      if (Math.abs(v) < 1e-8) { if (Math.abs(p) >= half) return false; continue; }
      const a = (-half - p) / v, b = (half - p) / v;
      enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b));
      if (enter >= leave) return false;
    }
    return enter < leave;
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
      // Current lane hold is the prediction, not knowledge of a rival's input.
      if (crosses(gap, other.x - car.x, closing, -lateral / seconds, seconds)
        || crosses(gap + closing * seconds, other.x - out.target, closing, 0, .5)) {
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
