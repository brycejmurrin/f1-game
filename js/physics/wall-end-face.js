const WallEndFace = (function () {
  "use strict";

  const FACE_DROP = 1.5;
  const FACE_KEEP = 0.2;
  const FIXED_DT = 1 / 60;
  const _prev = { r: 0, l: 0, laneMin: 0, side: 0 };
  const _post = { r: 1e9, l: 1e9, minOut: 0, side: 0 };

  function apply(c, track, lim, dt) {
    if (!c.human || c._prevS == null) return false;
    let ds = c.s - c._prevS;
    const L = track.total;
    if (ds > L / 2) ds -= L; else if (ds < -L / 2) ds += L;
    if (!(Math.abs(ds) > 1e-6) || Math.abs(ds) > 20) return false;
    ContactGeometry.wallLimits(track, c._prevS, c.x, _prev, _post);
    const right = c.x > lim.r;
    if (!right && !(c.x < -lim.l)) return false;
    const oldLim = right ? _prev.r : _prev.l, newLim = right ? lim.r : lim.l;
    if (!(oldLim - newLim > FACE_DROP)) return false;
    if (Math.abs(c.x) > oldLim) return false;
    c.s = c._prevS;
    c.speed *= Number.isFinite(dt) && dt > 0 ? Math.pow(FACE_KEEP, dt / FIXED_DT) : FACE_KEEP;
    c.wallT = 0.35;
    c.wasOnWall = true;
    return true;
  }

  return { apply };
})();
Object.freeze(WallEndFace);
