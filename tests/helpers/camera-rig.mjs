// Shared camera-rig fixture: the REAL camera solvers (drive-*.js, feel.js,
// extra-rigs.js, vantage.js) on a synthetic CURVED track, so corner lead, bend
// hang and bank are exercised instead of a straight stub (test-review R1-05/R1-18).
// CamTune is a stub whose cornerLead/cornerHang return null = the rig's shipped default (state.lead / state.hang override).
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { absSrc } from "./abs-src.mjs";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CAM_FILES = ["js/camera/fov-mode.js", "js/camera/drive-lens.js",
  "js/camera/feel.js", "js/camera/extra-rigs.js", "js/camera/vantage-ride.js", "js/camera/vantage.js"];

export function runFiles(ctx, files) {
  for (const f of files) vm.runInContext(readFileSync(join(ROOT, f), "utf8"), ctx, { filename: absSrc(f) });
}
export function camTune(state) {
  return { get: () => 0, cornerLead: () => (state.lead == null ? null : state.lead), cornerHang: () => (state.hang == null ? null : state.hang),
    speedFov: () => (state.spFov == null ? 1 : state.spFov), bob: () => 1,
    apply: (_m, _e, _t, fov) => (state.fovAdd ? Math.max(20, Math.min(110, fov + state.fovAdd)) : fov) };
}

/* ---------------- synthetic track (straights + constant-curvature arcs; +k = left) ---------------- */
export function makeTrack(segs, opts = {}) {
  const ds = 4;
  const total0 = segs.reduce((a, b) => a + b[0], 0);
  const n = Math.round(total0 / ds), total = n * ds;
  const px = new Float64Array(n), pz = new Float64Array(n), py = new Float64Array(n), tx = new Float64Array(n),
    tz = new Float64Array(n), kk = new Float64Array(n);
  let x = 0, z = 0, h = 0;
  for (let i = 0; i < n; i++) {
    const sI = i * ds; let acc = 0, k = 0;
    for (const sg of segs) { if (sI < acc + sg[0]) { k = sg[1]; break; } acc += sg[0]; }
    px[i] = x; pz[i] = z; tx[i] = Math.sin(h); tz[i] = Math.cos(h); kk[i] = k;
    h -= k * ds; x += Math.sin(h) * ds; z += Math.cos(h) * ds;
  }
  return { total, n, px, py, pz, tx, tz, kk, hw: new Float64Array(n).fill(opts.hw || 7), def: opts.def || {} };
}
/* ---------------- straight elevation track (R1-18) ----------------
   A straight along +Z with the elevation profile heightAt(s), at buildCenterline's 4 m node spacing, carrying
   what the ground clamp reads: rx/ry/rz and a street `surface.heightAt` shelf just under the road (TrackSurface.profile's
   shape). tx/tz/kk make it a valid synthTracks() input, so the same real rig solves it. */
export function makeElevationTrack(heightAt, { total = 4000, hw = 6 } = {}) {
  const n = Math.round(total / 4), ds = total / n;
  const px = new Float64Array(n), py = new Float64Array(n), pz = new Float64Array(n),
    tx = new Float64Array(n), tz = new Float64Array(n).fill(1), kk = new Float64Array(n);
  for (let k = 0; k < n; k++) { pz[k] = k * ds; py[k] = heightAt(k * ds); }
  const rx = new Float64Array(n).fill(1), ry = new Float64Array(n), rz = new Float64Array(n);
  return { total, n, px, py, pz, tx, tz, kk, rx, ry, rz, hw: new Float64Array(n).fill(hw), def: { street: true },
    surface: { heightAt: (k, beyond) => py[((Math.round(k) % n) + n) % n] - 0.12 - beyond * 0.004 } };
}
/* The real rig with corner lead pinned to 0 (the ride-height maths is what these tests assert); `tune` swaps in a custom CamTune,
   `files` narrows the loaded scripts (e.g. vantage.js alone for a no-CamFeel solve). */
export function loadElevationRig(tune, files) {
  const rig = loadRig(tune ? { CamTune: tune } : null, files);
  rig.state.lead = 0;
  return rig.cams;
}

export function synthTracks() {
  const at = (arr, track, s) => {
    const n = track.n, L = track.total; let v = s % L; if (v < 0) v += L;
    const fi = v / L * n, i = Math.floor(fi) % n, j = (i + 1) % n;
    return arr[i] + (arr[j] - arr[i]) * (fi - Math.floor(fi));
  };
  return {
    sample(t, s, out) {
      out.p[0] = at(t.px, t, s); out.p[1] = at(t.py, t, s); out.p[2] = at(t.pz, t, s);
      const a = at(t.tx, t, s), b = at(t.tz, t, s), l = Math.hypot(a, b) || 1;
      out.t[0] = a / l; out.t[1] = 0; out.t[2] = b / l;
      out.r[0] = out.t[2]; out.r[1] = 0; out.r[2] = -out.t[0];
      out.hw = at(t.hw, t, s); return out;
    },
    curvature: (t, s) => at(t.kk, t, s),
    banking: (_t, _s, _l, scr) => { if (scr) { scr.dy = 0; scr.roll = 0; return scr; } return { dy: 0, roll: 0 }; },
  };
}
export function loadRig(extraCtx, files) {
  const state = { hang: null, lead: null, fovAdd: 0 };
  const ctx = vm.createContext(Object.assign({ console, Math, Object, Array, Number, JSON, Float64Array,
    CamTune: camTune(state), Log: { info() {}, warn() {}, debug() {} } }, extraCtx || {}));
  runFiles(ctx, ["js/core/mat4.js"].concat(files || CAM_FILES));
  ctx.Tracks = synthTracks();
  // `files` may leave CamFeel out (a vantage-only solve has no easing and no lens shaping).
  const cams = vm.runInContext("GameCams", ctx), feel = vm.runInContext("typeof CamFeel === 'undefined' ? null : CamFeel", ctx);
  if (cams.init) cams.init({ vmax: 72 });
  return { ctx, cams, feel, state };
}
export const BEND = [[400, 0], [Math.PI * 60, 1 / 60], [300, 0], [Math.PI * 90 * 2 / 3, -1 / 90], [600, 0]];
