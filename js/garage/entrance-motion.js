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
  return Object.freeze({ sample, pose, WHEEL_RADIUS, available: () => !!data() });
})();
