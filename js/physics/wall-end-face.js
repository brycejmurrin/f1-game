/* Apex 26 — WALL END FACE: the one case the lateral wall clamp gets wrong.
 *
 * WallClamp pins c.x to the barrier at the car's NEW s. Where the barrier steps
 * inward along the track (a pit-wall taper, the end of a run-off) a car that was
 * inside the old, wider limit lands outside the new one and the pin teleports
 * it sideways by the whole step — measured 9 m on Monaco's pit entry, 9 m at
 * Monza's pit exit (docs/notes/DEFECT-LEDGER.md "Pit-edge end-face clamp").
 *
 * That step is not a side wall, it is the END of a wall: the car meets a face
 * square on. So the response is along-track — hold s, scrub the speed, keep the
 * lateral position — until the driver steers past the face. Anything below
 * FACE_DROP is a slope the normal clamp already handles. Reads the same limits
 * as WallClamp (ContactGeometry.wallLimits); touches no tunable or curvature,
 * so nothing here reaches the player's assists-off feel. */
const WallEndFace = (function () {
  "use strict";

  const FACE_DROP = 1.5;      // m: a limit that tightens by more than this in one step is a face
  const FACE_KEEP = 0.2;      // fraction of speed kept on the tick a face is met
  const _prev = { r: 0, l: 0, laneMin: 0, side: 0 };
  const _post = { r: 1e9, l: 1e9, minOut: 0, side: 0 };

  // Called by WallClamp.apply BEFORE the lateral pin, with the limits at the new
  // s. Returns true when it held the car at the face (c.s restored, speed scrubbed).
  function apply(c, track, lim, dt) {
    if (!c.human || c._prevS == null) return false;
    let ds = c.s - c._prevS;
    const L = track.total;
    if (ds > L / 2) ds -= L; else if (ds < -L / 2) ds += L;
    if (!(ds > 1e-6) || ds > 20) return false;           // only forward travel, never a teleport
    ContactGeometry.wallLimits(track, c._prevS, c.x, _prev, _post);
    const right = c.x > lim.r;
    if (!right && !(c.x < -lim.l)) return false;
    const oldLim = right ? _prev.r : _prev.l, newLim = right ? lim.r : lim.l;
    if (!(oldLim - newLim > FACE_DROP)) return false;
    if (Math.abs(c.x) > oldLim) return false;            // already outside the old wall: an ordinary pin
    c.s = c._prevS;                                       // the face stops the car where it was
    c.speed *= FACE_KEEP;
    c.wallT = 0.35;
    return true;
  }

  return { apply, FACE_DROP };
})();
Object.freeze(WallEndFace);
