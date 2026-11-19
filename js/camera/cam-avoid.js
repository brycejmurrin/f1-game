const CamAvoid = (function () {
  "use strict";

  const MODES = { heli: 1, side: 1, cinematic: 1, low: 1 };
  const MARGIN = 2.0;
  const STEP = 1.5;
  const MAX_STEP = 12;
  const IN_MIN = 1.5;

  const ROAD_PAD = 2.0;
  const ROAD_TOL = 0.5;

  function applies(mode) { return !!MODES[mode]; }

  function blocked(track, eye, margin) {
    if (!track || typeof FlybySeq === "undefined" || !FlybySeq.insideProp) return null;
    return FlybySeq.insideProp(track, eye, margin == null ? MARGIN : margin);
  }

  const _rs = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 10 };

  function roadClear(track, eye, margin) {
    if (typeof Tracks === "undefined" || !Tracks.project || !Tracks.sample) return false;
    if (!blocked(track, eye, margin)) return false;
    const pr = Tracks.project(track, eye[0], eye[2], null, eye[1]);
    if (!pr) return false;
    Tracks.sample(track, pr.s, _rs);
    if (Math.abs(pr.lat) > (_rs.hw || 7) + ROAD_PAD) return false;
    const box = blocked(track, eye, 0);
    if (!box) return true;
    const hw = _rs.hw || 7, c = Math.max(-hw, Math.min(hw, pr.lat));
    const qx = _rs.p[0] + _rs.r[0] * c, qz = _rs.p[2] + _rs.r[2] * c, qy = _rs.p[1];
    return Math.abs(qx - box.x) < box.w / 2 + ROAD_PAD && Math.abs(qz - box.z) < box.d / 2 + ROAD_PAD &&
      qy > box.y - box.h / 2 - ROAD_TOL && qy < box.y + box.h / 2;
  }

  function freeEye(track, eye, frame) {
    if (!track || !eye) return eye;
    if (!blocked(track, eye, MARGIN) || roadClear(track, eye, MARGIN)) return eye;
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
        if (abs <= hw + IN_MIN) break;
        const step = Math.min(STEP, abs - (hw + IN_MIN));
        eye[0] += (dx / len) * step;
        eye[2] += (dz / len) * step;
        eye[1] += step * 0.25;
      }
    }
    if (typeof FlybySeq !== "undefined" && FlybySeq.clearEye && !roadClear(track, eye, MARGIN)) {
      FlybySeq.clearEye(track, eye, MARGIN);
    }
    return eye;
  }

  return Object.freeze({ applies, blocked, roadClear, freeEye, MODES, MARGIN, STEP });
})();
