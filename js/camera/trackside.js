/* Apex 26 — TRACKSIDE fixed cameras: one eye per measured corner, outside the
 * fence, auto-switching as the subject car passes. Appended CAM_MODES id
 * "trackside" (mode-switch.js); vantage.js asks pose() each frame. Pure track /
 * prop geometry — broadcast-only, no sim RNG, no car forces. */
const TracksideCams = (function () {
  "use strict";

  const FENCE = 1.5;           // metres beyond half-width (or barrier)
  const HEIGHT = 4.8;          // metres above the road
  const LOOK_UP = 0.9;
  const HYST_M = 18;           // hold the previous cam until the car is this far past the next
  const FOV = 42;
  const FOV_NEAR = 50;         // car filling the lens
  const FOV_FAR = 18;          // long lens so a car down the straight stays readable
  const FOV_SPAN = 16;         // metres of circuit the lens is framed to hold
  const _smp = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
  const _eye = [0, 0, 0], _tgt = [0, 0, 0];

  function wrapS(track, s) {
    const L = track.total || 1;
    s %= L; return s < 0 ? s + L : s;
  }

  /** Arc distance of `b` ahead of `a` on a loop of length `L` (0..L). */
  function ahead(a, b, L) {
    let d = b - a;
    if (d < 0) d += L;
    return d;
  }

  /** Build fixed cameras for a built track (cached on the track object). */
  function build(track) {
    if (!track) return [];
    if (track._tsCams) return track._tsCams;
    const out = [];
    if (typeof FlybySeq !== "undefined" && FlybySeq.cornerS) {
      FlybySeq.cornerS(track, 1);
    }
    const corners = track._fbCorners || [];
    for (let i = 0; i < corners.length; i++) {
      const n = i + 1;
      const s = wrapS(track, (corners[i].f || 0) * track.total);
      const side = (typeof FlybySeq !== "undefined" && FlybySeq.cornerSide)
        ? FlybySeq.cornerSide(track, n) : ((n % 2) ? 1 : -1);
      Tracks.sample(track, s, _smp);
      let lat = (_smp.hw || 7) + FENCE;
      if (track.def && track.def.street && Tracks.wallAt) {
        const w = Tracks.wallAt(track, s, side > 0 ? 1 : -1);
        if (w > 0) lat = Math.min(lat, w + FENCE);
      }
      const eye = [
        _smp.p[0] + _smp.r[0] * side * lat,
        _smp.p[1] + HEIGHT,
        _smp.p[2] + _smp.r[2] * side * lat,
      ];
      // Prefer a clear eye (open-circuit buildings) without re-planning the slot.
      if (typeof CamAvoid !== "undefined") {
        CamAvoid.freeEye(track, eye, _smp);
      } else if (typeof FlybySeq !== "undefined" && FlybySeq.clearEye) {
        FlybySeq.clearEye(track, eye);
      }
      out.push({
        n: n,
        s: s,
        eye: eye,
        lookS: s,
        fov: FOV,
      });
    }
    // Sort by arc so pick() walks in track order.
    out.sort((a, b) => a.s - b.s);
    track._tsCams = out;
    return out;
  }

  /** Index of the camera the car has most recently passed (with hysteresis). */
  function pick(cams, s, total, prev) {
    if (!cams || !cams.length) return 0;
    const L = total || 1;
    const ss = wrapS({ total: L }, s);
    let best = 0, bestBehind = Infinity;
    for (let i = 0; i < cams.length; i++) {
      const behind = ahead(cams[i].s, ss, L);   // how far the car is past this cam
      if (behind < bestBehind) { bestBehind = behind; best = i; }
    }
    const prevIdx = ((prev | 0) % cams.length + cams.length) % cams.length;
    if (prevIdx !== best) {
      // Stick with the previous cam until the car is HYST_M past the new one's s,
      // so a weave near a corner does not flicker.
      const pastNew = ahead(cams[best].s, ss, L);
      if (pastNew < HYST_M) return prevIdx;
    }
    return best;
  }

  /**
   * Live pose for vantage.js. Mutates nothing on the car; caches the active
   * index on the track. `extra.carPos` (when present) aims at the subject car.
   */
  function pose(track, s, x, extra) {
    const cams = build(track);
    if (!cams.length) return null;
    const prev = track._tsIdx | 0;
    const idx = pick(cams, s, track.total, prev);
    track._tsIdx = idx;
    const c = cams[idx];
    _eye[0] = c.eye[0]; _eye[1] = c.eye[1]; _eye[2] = c.eye[2];
    if (extra && extra.carPos) {
      // vantage free-world path passes [px, pz]; keep a 3-vector path for tests.
      const cp = extra.carPos;
      if (cp.length >= 3) {
        _tgt[0] = cp[0]; _tgt[1] = cp[1] + LOOK_UP; _tgt[2] = cp[2];
      } else {
        Tracks.sample(track, wrapS(track, s), _smp);
        _tgt[0] = cp[0]; _tgt[1] = _smp.p[1] + LOOK_UP; _tgt[2] = cp[1];
      }
    } else {
      Tracks.sample(track, wrapS(track, c.lookS), _smp);
      _tgt[0] = _smp.p[0]; _tgt[1] = _smp.p[1] + LOOK_UP; _tgt[2] = _smp.p[2];
    }
    // A fixed 42° lens makes the car a speck once it is a straight away, and
    // a fisheye when it passes the camera. Hold ~FOV_SPAN metres of circuit
    // in frame and clamp so neither end blows out.
    const dist = Math.hypot(_tgt[0] - _eye[0], _tgt[1] - _eye[1], _tgt[2] - _eye[2]) || 1;
    let fov = 2 * Math.atan((FOV_SPAN * 0.5) / dist) * (180 / Math.PI);
    if (fov < FOV_FAR) fov = FOV_FAR;
    if (fov > FOV_NEAR) fov = FOV_NEAR;
    return { eye: _eye, tgt: _tgt, fov: fov, index: idx, count: cams.length, n: c.n };
  }

  function status(track) {
    if (!track) return { count: 0, index: 0 };
    const cams = build(track);
    return { count: cams.length, index: track._tsIdx | 0, n: cams.length ? cams[track._tsIdx | 0].n : 0 };
  }

  return Object.freeze({ build, pick, pose, status, FENCE, HEIGHT, HYST_M, FOV });
})();
