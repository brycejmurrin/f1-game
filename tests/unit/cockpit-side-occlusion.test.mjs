/*
 * No road through the cockpit's SIDES (Bryce 2026-11-18, iPhone, HELMET cam:
 * "from cockpit view or helmet camera in the cockpit I can see through the
 * sides to the [road] on the far left and right").
 *
 * The cause, measured on the real Car3D cockpit build: each shoulder bolster
 * was an open shell (crown only), and a wide onboard lens's 0.3 m near plane
 * slices through it at the frame's sides, so the lower corners looked through
 * the missing inner, outer and bottom walls to the tarmac.
 *
 * This casts the frustum's LOWER-SIDE rays (left and right edge, the bottom 40%
 * of the frame) from the live eye of HELMET and COCKPIT, every seat and body,
 * through the real CamFovFit lens at rest and at the speed-widened maximum, at
 * every phone landscape aspect from 16:9 to 2.2:1, and requires each to meet
 * FRONT-FACING car geometry (GLX and TLX cull back faces) beyond the near plane
 * before it meets the ground plane. Node VM, no browser (~1 s).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { loadCar3D } from "../../tools/car/cockpit-pale-sweep.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const run = (ctx, f, tail = "") => vm.runInContext(fs.readFileSync(f, "utf8") + tail, ctx, { filename: absSrc(f) });
const lens = vm.createContext({ Math, Object, Number, isFinite, Float32Array });
run(lens, "js/core/mat4.js");
run(lens, "js/camera/fov-fit.js", "\n;this.CamFovFit = CamFovFit;");
run(lens, "js/camera/fov-mode.js", "\n;this.CamFov = CamFov;");
const { CamFovFit, CamFov } = lens;

const store = new Map();
const opts = vm.createContext({
  Math, JSON, Object, Array, Number, console, location: { search: "" },
  GameStore: { store: { raw: (k) => (store.has(k) ? store.get(k) : null), rawSet: (k, v) => { store.set(k, v); return true; } } },
  Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
});
run(opts, "js/camera/cockpit-opts.js", "\n;this.CockpitOpts = CockpitOpts;");
const { CockpitOpts } = opts;

const { Car3D, Teams, Parts } = loadCar3D();
const TEAM = (Teams.LIST || Teams.ALL)[0];

const NEAR = 0.3;                   // the onboard lens (viewState().lens.near)
const HELMET_EYE_FWD = 0.05;        // js/camera/vantage.js
const HEAD_LAT = 0.055 * 0.45;      // vantage.js HEAD_MAX.lat: the head leans 2.5 cm to the outside
const ASPECTS = [16 / 9, 2.0, 2.17, 2.2];
// Outside the cockpit opening: the bolsters' inner edge sits at 0.255-0.307 m (car3d.js), the floor rail ends at 0.78 m.
const OPENING_X = 0.32, CAR_X = 0.78;
let over = 0, checked = 0;

function triangles(m) {
  const P = m.pos, I = m.idx, tris = [];
  for (let k = 0; k < I.length; k += 3) {
    const a = I[k] * 3, b = I[k + 1] * 3, c = I[k + 2] * 3;
    const A = [P[a], P[a + 1], P[a + 2]], e1 = [P[b] - A[0], P[b + 1] - A[1], P[b + 2] - A[2]], e2 = [P[c] - A[0], P[c + 1] - A[1], P[c + 2] - A[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    tris.push({ A, e1, e2, n });
  }
  return tris;
}
// Nearest FRONT-FACING hit along E + s*d, d un-normalised with a forward
// component of 1, so s IS the view depth and the near plane is s >= NEAR.
function hitDepth(tris, E, d) {
  let best = Infinity;
  for (const { A, e1, e2, n } of tris) {
    if (n[0] * d[0] + n[1] * d[1] + n[2] * d[2] >= 0) continue;   // back face: culled
    const h = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
    const det = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2]; if (Math.abs(det) < 1e-12) continue;
    const f = 1 / det, s = [E[0] - A[0], E[1] - A[1], E[2] - A[2]];
    const u = f * (s[0] * h[0] + s[1] * h[1] + s[2] * h[2]); if (u < 0 || u > 1) continue;
    const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
    const v = f * (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]); if (v < 0 || u + v > 1) continue;
    const t = f * (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]);
    if (t >= NEAR && t < best) best = t;
  }
  return best;
}

// Highest surface of the car straight below (x, z), any facing; -1 = no car there.
function topAt(tris, x, z) {
  let best = -1;
  for (const { A, e1, e2 } of tris) {
    const ax = A[0], az = A[2], bx = ax + e1[0], bz = az + e1[2], cx = ax + e2[0], cz = az + e2[2];
    const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz); if (Math.abs(det) < 1e-12) continue;
    const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det;
    if (l1 < 0 || l2 < 0 || l1 + l2 > 1) continue;
    const y = A[1] + l2 * e1[1] + (1 - l1 - l2) * e2[1];
    if (y > best) best = y;
  }
  return best;
}
// Where a ray that reached the road first ran under the car's top surface outside the opening, or null.
function underCar(tris, E, d, ground) {
  for (let s = NEAR; s < ground; s += 0.02) {
    const x = E[0] + s * d[0], y = E[1] + s * d[1], z = E[2] + s * d[2];
    if (Math.abs(x) < OPENING_X) continue;
    if (Math.abs(x) > CAR_X) return null;
    if (y < topAt(tris, x, z) - 0.005) return `x ${x.toFixed(2)} y ${y.toFixed(2)} z ${z.toFixed(2)}`;
  }
  return null;
}

// The fitted vertical FOV the race camera renders with (game.js: CamFovFit over CamFov's authored lens).
function fovY(mode, sp, deploy, aspect) {
  const deg = CamFov.modeFov(mode, sp, deploy), boost = CamFov.modeBoost(mode, sp, deploy);
  return CamFovFit.fitFovY(deg * Math.PI / 180, aspect, { boost: boost * Math.PI / 180 });
}

function leaks(body, mode) {
  const built = Car3D.build([0.1, 0.1, 0.6], [1, 1, 1], { teamId: TEAM.id, noWheels: true, noDriver: true, cockpit: true, cockpitBody: body,
    halo: true, parts: Parts.getVisualTiers(Parts.DEFAULTS, TEAM) });
  const tris = triangles(built), out = [];
  for (const seat of ["std", "low", "high", "fwd"]) {
    const L = CockpitOpts.layout(undefined, seat);
    const eyeZ = L.eyeF + (mode === "helmet" ? HELMET_EYE_FWD : 0);
    for (const aspect of ASPECTS) for (const [sp, dep] of [[0, false], [1, true]]) {
      const fy = fovY(mode, sp, dep, aspect), ty = Math.tan(fy / 2), tx = ty * aspect;
      const pitch = Math.atan2(-0.15, 30);   // vantage.js: the driver aims 30 m ahead, 0.15 m under the eye
      const cp = Math.cos(pitch), spch = Math.sin(pitch);
      for (const side of [-1, 1]) for (const lean of [-HEAD_LAT, 0, HEAD_LAT]) for (const ny of [-1, -0.9, -0.8, -0.7, -0.6]) {
        const E = [lean, L.eyeU, eyeZ];
        // camera-space (side*tx, ny*ty, 1) pitched about x: forward stays the depth axis
        const cy = ny * ty, d = [side * tx, cy * cp + spch, cp - cy * spch];
        const s = hitDepth(tris, E, d), ground = d[1] < 0 ? E[1] / -d[1] : Infinity;
        if (s < ground) { checked++; continue; }
        // It reached the road. Over the shoulder is a real view (the track beside the car); THROUGH the
        // side is the bug: somewhere outside the cockpit opening the ray ran BELOW the car's own top
        // surface (the shoulder crown, the sidepod) without meeting a face.
        const under = underCar(tris, E, d, ground);
        if (under === null) { over++; continue; }
        checked++;
        out.push(`${mode} ${body} seat ${seat} aspect ${aspect.toFixed(2)} sp ${sp} side ${side} lean ${lean.toFixed(3)} row ${ny}: road at depth ${ground.toFixed(2)} m, under the car's top at ${under}`);
      }
    }
  }
  return out;
}

for (const mode of ["helmet", "cockpit"]) {
  test(`${mode}: the lower sides of the frame meet the car, not the road, 16:9 to 2.2:1`, () => {
    const bad = [];
    for (const body of ["standard", "sculpted", "wide", "tapered", "stepped"]) bad.push(...leaks(body, mode));
    assert.deepEqual(bad.slice(0, 12), [], `${bad.length} lower-side rays reach the road`);
    assert.ok(checked > 1000, `the sweep cast ${checked} through-the-side rays`);
  });
}

test("the speed-widened onboard lens at 2.17:1 is the case Bryce saw: 86 deg HFOV at rest, 107 at full speed and deploy", () => {
  const fy = fovY("helmet", 1, true, 2.17), h = CamFovFit.hfovFromVfov(fy, 2.17) * 180 / Math.PI;
  assert.equal(Math.round(h), 107);
  const rest = CamFovFit.hfovFromVfov(fovY("helmet", 0, false, 2.17), 2.17) * 180 / Math.PI;
  assert.equal(Math.round(rest), 86);
});
