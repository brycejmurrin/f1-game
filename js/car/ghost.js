/*
 * Ghost: records the player's lap and replays the best one as a translucent
 * "ghost" car to race against — the core time-attack loop. This is a pure data
 * layer: game.js feeds it a sample each frame (lap time + track position) and
 * asks it where the ghost is at a given lap time; game.js owns the drawing.
 *
 * A lap is stored as parallel arrays of (t, s, x): t = seconds into the lap,
 * s = arc-distance along the centreline, x = lateral offset in metres. That is
 * everything needed to reconstruct the ghost's pose via Tracks.sample(track, s)
 * offset by x — no need to store world coords or heading. Best lap per circuit
 * persists in localStorage so it survives reloads.
 */
"use strict";

const Ghost = (function () {
  const KEY = "apex26.ghost.v1";
  const OLD_KEY = "apex_ghost_v1";   // pre-convention key; migrated once on load
  const HZ = 20;                 // samples per second while recording
  const MIN_SAMPLES = 8;         // ignore degenerate "laps"

  // One-time migration: adopt any store saved under the old, non-conforming key.
  (function migrateKey() {
    try {
      if (typeof localStorage === "undefined") return;
      if (localStorage.getItem(KEY) === null) {
        const old = localStorage.getItem(OLD_KEY);
        if (old !== null) {
          localStorage.setItem(KEY, old);
          localStorage.removeItem(OLD_KEY);
        }
      }
    } catch (e) { /* storage disabled — nothing to migrate */ }
  })();

  let trackId = null;
  let best = null;               // { time, t:[], s:[], x:[] } for current track
  let rec = null;                // in-progress lap: { t:[], s:[], x:[] }
  let lastSampleT = -1;

  function round(v, p) { const m = Math.pow(10, p || 0); return Math.round(v * m) / m; }

  function loadStore() {
    try {
      if (typeof localStorage === "undefined") return {};
      return JSON.parse(localStorage.getItem(KEY)) || {};
    } catch (e) { return {}; }
  }
  function saveStore(o) {
    try {
      if (typeof localStorage !== "undefined") localStorage.setItem(KEY, JSON.stringify(o));
    } catch (e) { Log.warn("car", "ghost save fail"); }
  }

  // Call when a circuit is loaded. Pulls that circuit's stored best lap (if any)
  // for playback and resets the recorder.
  function setTrack(id) {
    trackId = id;
    const g = loadStore()[id];
    best = (g && g.s && g.s.length >= MIN_SAMPLES) ? g : null;
    rec = null;
    lastSampleT = -1;
    Log.info("car", "ghost load " + id + (best ? " ok" : " none"));
  }

  function hasGhost() { return !!best; }
  function bestTime() { return best ? best.time : Infinity; }

  // Begin recording a fresh lap (call at each lap start / lights-out).
  function startLap() {
    rec = { t: [], s: [], x: [] };
    lastSampleT = -1;
  }

  // Record one frame. t = seconds since this lap began; s = arc-distance along
  // the centreline; x = lateral offset (m). Throttled to HZ so storage stays
  // small regardless of frame rate. Reverse-progress samples are discarded so
  // the timed lap remains in the monotonic distance domain used by timeAt().
  function record(t, s, x) {
    if (!rec) return;
    if (rec.t.length && t - lastSampleT < 1 / HZ) return;
    if (rec.s.length && s < rec.s[rec.s.length - 1]) return;
    lastSampleT = t;
    rec.t.push(round(t, 3));
    rec.s.push(round(s, 2));
    rec.x.push(round(x, 2));
  }

  // Call when a lap completes. Stores it as the new best for this circuit if it
  // beats the stored time. Returns true on a new record.
  function finishLap(lapTime) {
    if (!rec || rec.t.length < MIN_SAMPLES) { rec = null; return false; }
    const done = rec;
    rec = null;
    if (lapTime < bestTime()) {
      best = { time: round(lapTime, 3), t: done.t, s: done.s, x: done.x };
      if (trackId != null) {
        const store = loadStore();
        store[trackId] = best;
        saveStore(store);
        Log.info("car", "ghost save " + trackId);
      }
      return true;
    }
    return false;
  }

  // Binary search: largest index with arr[i] <= val.
  function findFloorIndex(arr, val) {
    let lo = 0, hi = arr.length - 1;
    if (val <= arr[0]) return 0;
    if (val >= arr[hi]) return hi;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (arr[mid] <= val) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  // Where is the best-lap ghost at lap time t? Returns { s, x } (interpolated)
  // or null if there is no ghost / playback is disabled. game.js turns this into
  // a pose with Tracks.sample(track, s) offset laterally by x.
  function at(t) {
    if (!best) return null;
    const ts = best.t, ss = best.s, xs = best.x, n = ts.length;
    if (n === 0) return null;
    if (t >= ts[n - 1]) return { s: ss[n - 1], x: xs[n - 1], done: true };
    if (t <= ts[0]) return { s: ss[0], x: xs[0], done: false };
    const i = findFloorIndex(ts, t);
    const j = Math.min(i + 1, n - 1);
    const span = ts[j] - ts[i];
    const f = span > 1e-6 ? Math.max(0, Math.min(1, (t - ts[i]) / span)) : 0;
    return { s: ss[i] + (ss[j] - ss[i]) * f, x: xs[i] + (xs[j] - xs[i]) * f, done: false };
  }

  // Inverse lookup: given the player's current arc-distance s, return the ghost's
  // lap time when it was at that same position. Uses binary search on best.s[];
  // record() retains only forward-progress samples. Returns null without a ghost.
  function timeAt(s) {
    if (!best || !best.s || !best.s.length) return null;
    const ss = best.s, ts = best.t, n = ss.length;
    if (n === 0) return null;
    if (s <= ss[0]) return ts[0];
    if (s >= ss[n - 1]) return ts[n - 1];
    const lo = findFloorIndex(ss, s);
    const j = Math.min(lo + 1, n - 1);
    const span = ss[j] - ss[lo];
    const f = span > 0.1 ? Math.max(0, Math.min(1, (s - ss[lo]) / span)) : 0;
    return ts[lo] + (ts[j] - ts[lo]) * f;
  }

  // Wipe the stored best for one circuit (null = all). Used by a "clear records"
  // control and useful in tests.
  function clear(id) {
    const store = loadStore();
    if (id == null) { saveStore({}); }
    else { delete store[id]; saveStore(store); }
    if (id == null || id === trackId) { best = null; }
  }

  return {
    setTrack, startLap, record, finishLap, at, timeAt,
    hasGhost, bestTime, clear,
  };
})();

// Allow use under Node for unit tests (and as a browser global otherwise).
if (typeof module !== "undefined" && module.exports) module.exports = Ghost;
