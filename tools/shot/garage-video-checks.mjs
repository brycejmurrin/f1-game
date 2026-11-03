#!/usr/bin/env node
// @doc Pure garage-video clip flags: ends-early, car-still, camera-oob, never-finishes.
// @skill playwright-probe
//
// Shared by tools/shot/garage-video.mjs (headless recorder) and its unit tests.
// No browser, no Chromium — pass a clip timing/sample object, get flags back.
//
// Usage (library):
//   import { flagClip, buildMatrix, GARAGE_BOUNDS } from "./garage-video-checks.mjs";
//   const { flags, ok } = flagClip(clip);
//
// See docs/notes/GARAGE-VIDEO-HARNESS.md.

/** Bay AABB the arrival / Blender-rig tests already pin (metres, car at origin). */
export const GARAGE_BOUNDS = Object.freeze({
  xMin: -5.4, xMax: 5.4,
  yMin: 0.3, yMax: 3.6,
  zMin: -6.4, zMax: 6.4,
});

/** STYLE ids shipped by GarageArrival.STYLES (arrival.js). */
export const STYLE_IDS = Object.freeze([
  "broadcast", "cinema", "documentary", "showcase", "nightshift",
  "rainready", "heritage", "qualify",
]);

/** Angle ids the harness walks by default (presets + fixed cams + Blender rigs). */
export const ANGLE_IDS = Object.freeze([
  "cut", "left", "right", "high", "low", "door", "director",
  "crane", "orbit", "dolly", "rear", "drone", "steadicam",
]);

export const DIR_IDS = Object.freeze(["in", "out", "home"]);

/** Flag ids written into timing.json / flags.json. */
export const FLAG_IDS = Object.freeze([
  "ends-early",
  "car-still",
  "camera-oob",
  "never-finishes",
]);

const DEFAULTS = Object.freeze({
  /** Recorded length must be at least this fraction of expectedSec. */
  earlyRatio: 0.85,
  /** Max car xz travel below this (m) ⇒ car-still. */
  stillM: 0.35,
  /** Wall wait past expectedSec × this without active:false ⇒ never-finishes. */
  hangRatio: 1.5,
  /** Samples after this fraction of expectedSec must include active:false. */
  finishBy: 1.05,
});

function num(v, fallback = NaN) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Stable clip id: style-angle-dir-tuneSlug. */
export function clipId({ style = "default", angle = "cut", dir = "in", tune = null } = {}) {
  const tuneSlug = tuneSlugOf(tune);
  return [style || "default", angle || "cut", dir || "in", tuneSlug].join("-");
}

export function tuneSlugOf(tune) {
  if (!tune || typeof tune !== "object") return "tune-default";
  const keys = Object.keys(tune).sort();
  if (!keys.length) return "tune-default";
  return "tune-" + keys.map((k) => `${k}=${tune[k] === null ? "auto" : tune[k]}`).join("_");
}

/**
 * Cartesian product of style × angle × dir × tune rows.
 * @param {{ styles?: string[], angles?: string[], dirs?: string[], tunes?: object[] }} opts
 */
export function buildMatrix({
  styles = ["broadcast", "cinema"],
  angles = ["cut", "crane"],
  dirs = ["in", "out"],
  tunes = [{}, { hold: 0 }],
} = {}) {
  const S = styles.length ? styles : ["default"];
  const A = angles.length ? angles : ["cut"];
  const D = dirs.length ? dirs : ["in"];
  const T = tunes.length ? tunes : [{}];
  const rows = [];
  for (const style of S) {
    for (const angle of A) {
      for (const dir of D) {
        for (const tune of T) {
          const row = { style: style === "default" ? null : style, angle, dir, tune: { ...tune } };
          row.id = clipId({ style: row.style || "default", angle, dir, tune: row.tune });
          rows.push(row);
        }
      }
    }
  }
  return rows;
}

/** Max horizontal travel of the car across samples (metres). */
export function carTravelM(samples) {
  const list = Array.isArray(samples) ? samples : [];
  if (list.length < 2) return 0;
  const first = list[0];
  let max = 0;
  for (const s of list) {
    const dx = num(s.x, 0) - num(first.x, 0);
    const dz = num(s.z, 0) - num(first.z, 0);
    const d = Math.hypot(dx, dz);
    if (d > max) max = d;
  }
  return max;
}

/** True when any sample's eye is outside the bay AABB. */
export function cameraOutsideBounds(samples, bounds = GARAGE_BOUNDS) {
  const list = Array.isArray(samples) ? samples : [];
  const hits = [];
  for (let i = 0; i < list.length; i++) {
    const eye = list[i] && list[i].eye;
    if (!Array.isArray(eye) || eye.length < 3) continue;
    const [x, y, z] = eye.map((v) => num(v));
    if (![x, y, z].every(Number.isFinite)) continue;
    if (x < bounds.xMin || x > bounds.xMax
      || y < bounds.yMin || y > bounds.yMax
      || z < bounds.zMin || z > bounds.zMax) {
      hits.push({ i, t: list[i].t, eye: [x, y, z] });
    }
  }
  return hits;
}

/** Recorded shorter than expected × earlyRatio. */
export function endsEarly({ recordedSec, expectedSec, earlyRatio = DEFAULTS.earlyRatio } = {}) {
  const rec = num(recordedSec);
  const exp = num(expectedSec);
  if (!(exp > 0) || !(rec >= 0)) return false;
  return rec < exp * earlyRatio;
}

/**
 * Clip that never reaches inactive, or hangs on the wall clock.
 * hold=0 is a known tuner edge (zero-length HOLD BEAT): still must finish —
 * when samples stay active or wallSec overshoots, flag never-finishes.
 */
export function neverFinishes({
  samples, expectedSec, wallSec, finishBy = DEFAULTS.finishBy, hangRatio = DEFAULTS.hangRatio,
} = {}) {
  const exp = num(expectedSec);
  const wall = num(wallSec);
  const list = Array.isArray(samples) ? samples : [];
  if (exp > 0 && wall > exp * hangRatio) {
    const sawInactive = list.some((s) => s && s.active === false);
    if (!sawInactive) return true;
  }
  if (!list.length) return exp > 0; // expected a show, got no samples
  const last = list[list.length - 1];
  if (last && last.active === true) {
    const t = num(last.t, 0);
    if (!(exp > 0) || t >= exp * finishBy - 1e-6) return true;
  }
  // Expected duration collapsed (bad tune) — nothing can finish.
  if (!(exp > 0)) return true;
  return false;
}

/**
 * Flag one recorded/sampled clip.
 * @returns {{ ok: boolean, flags: string[], detail: object }}
 */
export function flagClip(clip = {}, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const samples = clip.samples || [];
  const flags = [];
  const detail = {};

  const early = endsEarly({
    recordedSec: clip.recordedSec, expectedSec: clip.expectedSec, earlyRatio: cfg.earlyRatio,
  });
  if (early) {
    flags.push("ends-early");
    detail.early = { recordedSec: clip.recordedSec, expectedSec: clip.expectedSec, earlyRatio: cfg.earlyRatio };
  }

  const travel = carTravelM(samples);
  detail.carTravelM = travel;
  if (samples.length >= 2 && travel < cfg.stillM) {
    flags.push("car-still");
    detail.still = { travelM: travel, stillM: cfg.stillM };
  }

  const oob = cameraOutsideBounds(samples, cfg.bounds || GARAGE_BOUNDS);
  if (oob.length) {
    flags.push("camera-oob");
    detail.oob = { count: oob.length, first: oob[0] };
  }

  const hung = neverFinishes({
    samples, expectedSec: clip.expectedSec, wallSec: clip.wallSec,
    finishBy: cfg.finishBy, hangRatio: cfg.hangRatio,
  });
  if (hung) {
    flags.push("never-finishes");
    detail.hang = {
      expectedSec: clip.expectedSec, wallSec: clip.wallSec,
      lastActive: samples.length ? samples[samples.length - 1].active : null,
      hold: clip.tune && Object.prototype.hasOwnProperty.call(clip.tune, "hold") ? clip.tune.hold : undefined,
    };
  }

  return { ok: flags.length === 0, flags, detail };
}

/** Summarise a timing.json clips array into a flags report. */
export function flagReport(clips, opts = {}) {
  const rows = (clips || []).map((c) => {
    const r = flagClip(c, opts);
    return { id: c.id, ok: r.ok, flags: r.flags, detail: r.detail, style: c.style, angle: c.angle, dir: c.dir, tune: c.tune };
  });
  const flagged = rows.filter((r) => !r.ok);
  return {
    ok: flagged.length === 0,
    total: rows.length,
    flagged: flagged.length,
    byFlag: FLAG_IDS.reduce((acc, id) => {
      acc[id] = flagged.filter((r) => r.flags.includes(id)).map((r) => r.id);
      return acc;
    }, {}),
    rows,
  };
}

/** Parse `hold:0,speed:1.5` / `hold=0` tokens into a tune object. */
export function parseTuneToken(token) {
  const out = {};
  const raw = String(token || "").trim();
  if (!raw || raw === "default") return out;
  for (const part of raw.split(",")) {
    const m = part.trim().match(/^([a-zA-Z][a-zA-Z0-9]*)[=:](.+)$/);
    if (!m) throw new Error(`bad tune token ${JSON.stringify(part)} (want key=value)`);
    const key = m[1];
    const v = m[2];
    if (v === "auto" || v === "null") out[key] = null;
    else if (v === "true" || v === "false") out[key] = v === "true";
    else if (v !== "" && Number.isFinite(+v)) out[key] = +v;
    else out[key] = v;
  }
  return out;
}

/** Expand `--tune=hold:0,hold:auto` into discrete tune objects (one key-set each, product of multi-key groups is not taken here — each comma piece that is a full object uses `|`). */
export function parseTuneList(arg) {
  const raw = String(arg == null ? "" : arg).trim();
  if (!raw || raw === "default") return [{}];
  // `a|b` = alternate full tunes; within one piece, commas are fields of ONE tune.
  return raw.split("|").map((piece) => parseTuneToken(piece));
}

export function parseCsvList(arg, all) {
  const raw = String(arg == null ? "" : arg).trim();
  if (!raw) return [];
  if (raw === "all") return [...all];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}
