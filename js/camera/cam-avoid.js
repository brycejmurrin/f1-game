/* Apex 26 — broadcast-camera wall / building avoidance for open circuits.
 * Street circuits already clamp lateral offset via vantage.js `corr`; open
 * circuits only had a soft ground floor, so heli / side / cinematic / low could
 * sit inside a grandstand or tower. This module steps the eye toward the road
 * when it is inside a solid prop box, then lifts over any remaining roof using
 * FlybySeq.clearEye (same solid set as the flyby planner). Broadcast-only —
 * never touches car forces. */
const CamAvoid = (function () {
  "use strict";

  const MODES = { heli: 1, side: 1, cinematic: 1, low: 1 };
  const MARGIN = 2.0;          // metres of facade clear (matches FlybySeq CLEAR_M spirit)
  const STEP = 1.5;            // lateral step toward the centreline per try
  const MAX_STEP = 12;         // bound the work per frame
  const IN_MIN = 1.5;          // never step closer than hw + this

  function applies(mode) { return !!MODES[mode]; }

  /** True when FlybySeq reports the eye inside a solid prop (building, stand…). */
  function blocked(track, eye, margin) {
    if (!track || typeof FlybySeq === "undefined" || !FlybySeq.insideProp) return null;
    return FlybySeq.insideProp(track, eye, margin == null ? MARGIN : margin);
  }

  /**
   * Pull `eye` out of solid props. Mutates eye in place; returns it.
   * `frame` is the road sample at the car (`{ p, r, hw }`) used to step inward.
   * Street circuits are already corridor-clamped; they only get the lift net.
   */
  function freeEye(track, eye, frame) {
    if (!track || !eye) return eye;
    const street = !!(track.def && track.def.street);
    if (!street && frame && frame.p && frame.r) {
      const hw = frame.hw > 0 ? frame.hw : 7;
      for (let i = 0; i < MAX_STEP; i++) {
        if (!blocked(track, eye, MARGIN)) break;
        const dx = frame.p[0] - eye[0], dz = frame.p[2] - eye[2];
        const len = Math.hypot(dx, dz);
        if (len < 0.05) break;
        const lat = (eye[0] - frame.p[0]) * frame.r[0] + (eye[2] - frame.p[2]) * frame.r[2];
        const abs = Math.abs(lat);
        if (abs <= hw + IN_MIN) break;   // already at the road edge — lift instead
        const step = Math.min(STEP, abs - hw);
        eye[0] += (dx / len) * step;
        eye[2] += (dz / len) * step;
        // Lost width → a little crane height (street corr does the same trade).
        eye[1] += step * 0.25;
      }
    }
    if (typeof FlybySeq !== "undefined" && FlybySeq.clearEye) {
      FlybySeq.clearEye(track, eye, MARGIN);
    }
    return eye;
  }

  return Object.freeze({ applies, blocked, freeEye, MODES, MARGIN, STEP });
})();
