// Shared camera-rig fixture: the REAL camera solvers (drive-*.js, feel.js,
// extra-rigs.js, vantage.js) on a synthetic CURVED track, so corner lead, bend
// hang and bank are exercised instead of a straight stub (test-review R1-05/R1-18).
// CamTune is a stub whose cornerLead/cornerHang return null = the rig's shipped default.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CAM_FILES = ["js/camera/drive-chase.js", "js/camera/drive-broadcast.js", "js/camera/drive-onboard.js",
  "js/camera/feel.js", "js/camera/extra-rigs.js", "js/camera/vantage.js"];

export function runFiles(ctx, files) {
  for (const f of files) vm.runInContext(readFileSync(join(ROOT, f), "utf8"), ctx, { filename: f });
}
export function camTune(state) {
  return { get: () => 0, cornerLead: () => null, cornerHang: () => (state.hang == null ? null : state.hang),
    speedFov: () => 1, bob: () => 1,
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
  const state = { hang: null, fovAdd: 0 };
  const ctx = vm.createContext(Object.assign({ console, Math, Object, Array, Number, JSON, Float64Array,
    CamTune: camTune(state), Log: { info() {}, warn() {}, debug() {} } }, extraCtx || {}));
  runFiles(ctx, ["js/core/mat4.js"].concat(files || CAM_FILES));
  ctx.Tracks = synthTracks();
  const cams = vm.runInContext("GameCams", ctx), feel = vm.runInContext("CamFeel", ctx);
  cams.init({ vmax: 72 });
  return { ctx, cams, feel, state };
}
export const BEND = [[400, 0], [Math.PI * 60, 1 / 60], [300, 0], [Math.PI * 90 * 2 / 3, -1 / 90], [600, 0]];
