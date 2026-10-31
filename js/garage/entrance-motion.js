/* Blender-authored entrance motion. Samples are bay metres/radians, never race state. */
const GarageEntranceMotion = (function () {
  "use strict";
  const FIELDS = Object.freeze(["x", "z", "yaw", "wheelRoll", "steer", "heave", "pitch"]);
  const WHEEL_RADIUS = 0.34;   // fitted CarWheels tyre radius, matched in the Blender source
  const MIRROR = new Set(["x", "yaw", "steer"]);
  let checked = null, usable = false;
  function data() {
    const d = typeof GarageEntranceMotionData === "undefined" ? null : GarageEntranceMotionData;
    if (d === checked) return usable ? d : null;
    checked = d; usable = !!d && d.version === 1 && Array.isArray(d.columns)
      && FIELDS.every((key, i) => d.columns[i] === key)
      && [d.lane, d.back].every((rows) => Array.isArray(rows) && rows.length >= 2
        && rows.every((row) => Array.isArray(row) && row.length === FIELDS.length && row.every(Number.isFinite)));
    return usable ? d : null;
  }
  // Linear interpolation preserves the baked contact envelope and cannot overshoot
  // a doorway or a steering stop. Authored samples provide the easing themselves.
  function sample(phase, progress, side = 1, out = {}) {
    const d = data();
    if (!d || (phase !== "lane" && phase !== "back")) return null;
    const rows = d[phase], u = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
    const f = u * (rows.length - 1), i = Math.min(rows.length - 2, Math.floor(f)), k = f - i;
    for (let c = 0; c < FIELDS.length; c++) {
      const key = FIELDS[c], a = rows[i][c], b = rows[i + 1][c];
      out[key] = (a + (b - a) * k) * (side < 0 && MIRROR.has(key) ? -1 : 1);
    }
    out.wheelDistance = out.wheelRoll * WHEEL_RADIUS;   // signed metres: decreases while backing
    return out;
  }
  // Timeline comes from GarageArrival: all tuner/result timing stays at its
  // facade. Sampling has no clock, DOM, crew or camera ownership to cancel.
  function pose(seconds, timeline, side = 1, out = {}) {
    if (!timeline || !(timeline.lane > 0) || !(timeline.back > 0)) return null;
    const t = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    const backAt = timeline.door + timeline.lane + timeline.pause;
    return t <= backAt ? sample("lane", (t - timeline.door) / timeline.lane, side, out)
      : sample("back", (t - backAt) / timeline.back, side, out);
  }
  let checkedCamera = null, usableCamera = false;
  function cameraData() {
    const d = data(), c = d && d.camera;
    if (c === checkedCamera) return usableCamera ? c : null;
    checkedCamera = c; usableCamera = !!c && c.version === 1 && Array.isArray(c.segments) && c.segments.length > 0;
    let end = 0;
    if (usableCamera) for (let i = 0; i < c.segments.length; i++) {
      const s = c.segments[i];
      if (!s || !Number.isFinite(s.u0) || !Number.isFinite(s.u1) || s.u0 !== end || !(s.u1 > s.u0 && s.u1 <= 1)
          || !Array.isArray(s.points) || s.points.length !== 4
          || !s.points.every((p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite))
          || (i === 0 ? s.sourceEndpoint !== true : !!s.sourceEndpoint)
          || (i === c.segments.length - 1 ? s.fitEndpoint !== true : !!s.fitEndpoint)) { usableCamera = false; break; }
      if (i && s.points[0].some((v, j) => v !== c.segments[i - 1].points[3][j])) { usableCamera = false; break; }
      if ((s.sourceEndpoint && s.points[0].some((v, j) => v !== s.points[1][j]))
          || (s.fitEndpoint && s.points[2].some((v, j) => v !== s.points[3][j]))) { usableCamera = false; break; }
      end = s.u1;
    }
    usableCamera = usableCamera && end === 1;
    return usableCamera ? c : null;
  }
  // Exact cubic controls authored in Blender, in game XYZ and normalized time.
  // Only the first source pair and final exterior pair adapt to live cameras;
  // fixed doorway controls cannot be dragged through a jamb by viewport fit.
  function camera(progress, sourceEye, destinationEye, out) {
    const c = cameraData();
    if (!c || !Number.isFinite(progress) || !sourceEye || !destinationEye || !out
        || sourceEye.length !== 3 || destinationEye.length !== 3
        || !sourceEye.every(Number.isFinite) || !destinationEye.every(Number.isFinite)
        || destinationEye[2] < 6.8 || destinationEye[1] < 1.7) return false;
    const u = Math.max(0, Math.min(1, progress));
    if (u === 0) { for (let j = 0; j < 3; j++) out[j] = sourceEye[j]; return true; }
    if (u === 1) { for (let j = 0; j < 3; j++) out[j] = destinationEye[j]; return true; }
    const ss = c.segments;
    let i = 0;
    while (i < ss.length - 1 && u > ss[i].u1) i++;
    const s = ss[i], p = s.points, t = (u - s.u0) / (s.u1 - s.u0), v = 1 - t;
    const b0 = v * v * v, b1 = 3 * v * v * t, b2 = 3 * v * t * t, b3 = t * t * t;
    for (let j = 0; j < 3; j++) {
      // Capture each destination scalar before writing: destinationEye may be out.
      const a = s.sourceEndpoint ? sourceEye[j] : p[0][j], b = s.sourceEndpoint ? sourceEye[j] : p[1][j];
      const d = s.fitEndpoint ? destinationEye[j] : p[3][j], cc = s.fitEndpoint ? destinationEye[j] : p[2][j];
      out[j] = b0 * a + b1 * b + b2 * cc + b3 * d;
    }
    return true;
  }
  return Object.freeze({ sample, pose, camera, cameraAvailable: () => !!cameraData(), WHEEL_RADIUS, available: () => !!data() });
})();
