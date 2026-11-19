"use strict";
const AiCorridor = (function () {
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
  function acceleration(car) {
    return Number.isFinite(car.corridorAccel) ? Math.max(-40, Math.min(20, car.corridorAccel)) : 0;
  }
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
    const ownAccel = acceleration(car);
    for (let oi = 0; oi < cars.length; oi++) {
      const other = cars[oi];
      if (other === car || other.retired || other.finished) continue;
      const oProg = snap(other, "_snapProg", other.prog), oX = snap(other, "_snapX", other.x), oSpeed = snap(other, "_snapSpeed", other.speed);
      const raw = oProg - car.prog;
      const gap = ((raw + total / 2) % total + total) % total - total / 2;
      const closing = oSpeed - car.speed;
      const accel = acceleration(other) - ownAccel;
      const absGap = gap < 0 ? -gap : gap;
      const absA = accel < 0 ? -accel : accel;
      const travel = (closing < 0 ? -closing : closing) * seconds + 0.5 * absA * seconds * seconds;
      const s2 = gap + closing * seconds + .5 * accel * seconds * seconds;
      const absS2 = s2 < 0 ? -s2 : s2;
      const vs2 = closing + accel * seconds;
      const travel2 = (vs2 < 0 ? -vs2 : vs2) * 0.5 + 0.5 * absA * 0.25;
      const crossPossible = !(absGap - travel > 5.2) || !(absS2 - travel2 > 5.2);
      if (crossPossible) {
        if (crosses(gap, oX - car.x, closing, -lateral / seconds, seconds, accel)
          || crosses(s2, oX - out.target, vs2, 0, .5, accel)) {
          out.reason = other === blocker ? "cannot clear the blocker in time" : "traffic in the passing lane"; return;
        }
      }
      const aheadOk = !ctx.street && other !== blocker && gap > 0 && gap < reach;
      if (aheadOk && Math.abs(oX - out.target) < 2.2
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
    out.of = blocker;
    return out;
  }
  function planAllows(plan, blocker) {
    return !plan || plan.of !== blocker || !!plan.side;
  }
  return Object.freeze({ choose, planAllows });
})();
Object.freeze(AiCorridor);
