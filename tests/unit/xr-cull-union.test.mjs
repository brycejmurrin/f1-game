/* xr-cull-union — XR culls with ONE frustum that holds both eyes (R3-RENDER-3).
 *
 * XrBoot.applyEyes writes frame.viewProj, which is the only CULL input in XR:
 * TLX begin() latches it for present()'s chunk cull, game.js drawWorldMeshes
 * culls the instanced prop batches and the cars through it; each eye then
 * renders with its own matrices (presentXR). WebXR per-eye projections are
 * asymmetric (outer ~52 deg, inner ~42 deg on a Quest), so eye 0's planes drop
 * the wedge only the right eye sees — 11 % of its prop triangles at Monaco
 * (scratch/hunt3-render/xr-cull.cjs). The real xr-rig.js / xr-boot.js /
 * frustum.js in a VM: every point either eye can see survives the cull, the
 * union is not much looser than the two eyes, a mono/one-viewport frame keeps
 * eye 0 exactly, and flat frames are untouched. No browser (~0.1 s).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const read = (rel) => fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

function load() {
  const ctx = vm.createContext({ Math, Float32Array, Float64Array, Array, Number, Object, Infinity });
  seedLog(ctx);
  for (const f of ["js/core/mat4.js", "js/render/shared/frustum.js", "js/xr/xr-rig.js", "js/xr/xr-boot.js"])
    vm.runInContext(read(f).replace(/^const\b/gm, "var"), ctx, { filename: f });
  ctx.XrSession = { isPresenting: () => ctx.presenting !== false, setAnchor() {}, eyeFrames: () => ctx.eyes };
  return ctx;
}

// An XRView.projectionMatrix: asymmetric, GL clip space.
function proj(lDeg, rDeg, uDeg, dDeg, n = 0.1, f = 1000) {
  const t = (d) => Math.tan(d * Math.PI / 180) * n;
  const l = -t(lDeg), r = t(rDeg), top = t(uDeg), b = -t(dDeg);
  const m = new Float32Array(16);
  m[0] = 2 * n / (r - l); m[5] = 2 * n / (top - b); m[8] = (r + l) / (r - l); m[9] = (top + b) / (top - b);
  m[10] = -(f + n) / (f - n); m[11] = -1; m[14] = -2 * f * n / (f - n);
  return m;
}
// An XRView pose (reference space): head yaw/pitch, eye offset along the head's right, an outward cant.
function pose(xOff, yawDeg = 0, pitchDeg = 0, cantDeg = 0) {
  const y = (yawDeg + cantDeg) * Math.PI / 180, p = pitchDeg * Math.PI / 180;
  const cy = Math.cos(y), sy = Math.sin(y), cp = Math.cos(p), sp = Math.sin(p);
  const hy = yawDeg * Math.PI / 180;
  // R = Ry(yaw + cant) * Rx(pitch), column-major; position = head right * xOff + 1.2 up
  const m = new Float32Array([cy, 0, -sy, 0, sy * sp, cp, cy * sp, 0, sy * cp, -sp, cy * cp, 0,
    Math.cos(hy) * xOff, 1.2, -Math.sin(hy) * xOff, 1]);
  return m;
}
function eyesFor(ctx, views) {
  const anchor = { eye: [10, 2, 30], fwd: [0.6, 0, 0.8], up: [0, 1, 0] };
  return views.map((v) => {
    const bag = { view: new Float32Array(16), proj: new Float32Array(16), viewProj: new Float32Array(16),
      invProj: new Float32Array(16), invViewProj: new Float32Array(16), eye: [0, 0, 0], viewport: v.viewport || { x: 0, y: 0, width: 960, height: 1000 } };
    const view = ctx.XrRig.invertRigidTo(new Float32Array(16), v.pose);
    return ctx.XrRig.composeEye(anchor, view, v.proj, bag);
  });
}
const planesOf = (ctx, vp) => { const p = [0, 1, 2, 3, 4, 5].map(() => new Float32Array(4)); ctx.Frustum.extractPlanes(vp, p); return p; };
const inside = (pl, p) => pl.every((q) => q[0] * p[0] + q[1] * p[1] + q[2] * p[2] + q[3] >= 0);
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// Every point either eye sees must survive the cull frustum; boxes: if any of
// their corners/centre is in an eye, aabbInFrustum(cull) must keep them.
function check(ctx, label, views) {
  ctx.eyes = eyesFor(ctx, views);
  const frame = { viewProj: new Float32Array(16) };
  assert.ok(ctx.XrBoot.applyEyes(frame, [0, 0, 0], [0, 0, 1], [0, 1, 0]), label + ": presenting returns the eyes");
  const pc = planesOf(ctx, frame.viewProj), pe = ctx.eyes.map((e) => planesOf(ctx, e.viewProj));
  const r = rng(7);
  let seen = 0, missed = 0, cullOnly = 0, boxMiss = 0;
  for (let i = 0; i < 40000; i++) {
    const c = [10 + (r() - 0.5) * 1200, 2 + (r() - 0.3) * 200, 30 + (r() - 0.5) * 1200];
    const h = r() * 12;
    const mn = [c[0] - h, c[1] - h, c[2] - h], mx = [c[0] + h, c[1] + h, c[2] + h];
    const eyeSees = pe.some((pl) => inside(pl, c));
    if (eyeSees) { seen++; if (!inside(pc, c)) missed++; } else if (inside(pc, c)) cullOnly++;
    const pts = [c]; for (let k = 0; k < 8; k++) pts.push([k & 1 ? mx[0] : mn[0], k & 2 ? mx[1] : mn[1], k & 4 ? mx[2] : mn[2]]);
    if (pts.some((p) => pe.some((pl) => inside(pl, p))) && !ctx.Frustum.aabbInFrustum(pc, mn, mx)) boxMiss++;
  }
  assert.ok(seen > 2000, label + ": the fixture puts points in view (" + seen + ")");
  assert.equal(missed, 0, label + ": points an eye sees that the cull drops");
  assert.equal(boxMiss, 0, label + ": boxes an eye sees that the cull drops");
  return { frame, seen, missed, cullOnly };
}

const QUEST = { L: proj(52, 42, 42, 50), R: proj(42, 52, 42, 50) };

test("a Quest-class asymmetric pair: the cull keeps everything the RIGHT eye sees, and stays tight", () => {
  const ctx = load();
  const r = check(ctx, "quest", [{ pose: pose(-0.0315), proj: QUEST.L }, { pose: pose(0.0315), proj: QUEST.R }]);
  assert.ok(r.cullOnly / r.seen < 0.02, "the union adds < 2 % beyond the two eyes (" + (r.cullOnly / r.seen * 100).toFixed(2) + " %)");
  assert.notEqual(r.frame.viewProj, ctx.eyes[0].viewProj, "the cull frustum is not eye 0's");
  assert.equal(r.frame.view, ctx.eyes[0].view, "the camera matrices stay eye 0's (presentXR applies each eye)");
  assert.equal(r.frame.proj, ctx.eyes[0].proj);
});

test("head turned and pitched, and canted displays: still nothing an eye sees is culled", () => {
  const ctx = load();
  check(ctx, "yaw/pitch", [{ pose: pose(-0.032, 35, -12), proj: QUEST.L }, { pose: pose(0.032, 35, -12), proj: QUEST.R }]);
  check(ctx, "canted", [{ pose: pose(-0.032, 0, 0, 10), proj: proj(60, 35, 45, 45) }, { pose: pose(0.032, 0, 0, -10), proj: proj(35, 60, 45, 45) }]);
  check(ctx, "uneven up/down", [{ pose: pose(-0.03), proj: proj(50, 40, 38, 52) }, { pose: pose(0.03), proj: proj(40, 50, 44, 46) }]);
});

test("one drawn eye (IWER mono: a zero-width right view) keeps eye 0's matrix exactly; flat frames are untouched", () => {
  const ctx = load();
  ctx.eyes = eyesFor(ctx, [{ pose: pose(0), proj: QUEST.L }, { pose: pose(0), proj: QUEST.R, viewport: { x: 0, y: 0, width: 0, height: 0 } }]);
  const frame = { viewProj: null };
  ctx.XrBoot.applyEyes(frame, [0, 0, 0], [0, 0, 1], [0, 1, 0]);
  assert.equal(frame.viewProj, ctx.eyes[0].viewProj);
  ctx.presenting = false;
  const flatVP = new Float32Array(16), flat = { viewProj: flatVP };
  assert.equal(ctx.XrBoot.applyEyes(flat, [0, 0, 0], [0, 0, 1], [0, 1, 0]), null);
  assert.equal(flat.viewProj, flatVP, "not presenting: frame.viewProj is the game's own");
});

test("a non-perspective eye falls back to eye 0 rather than culling with a broken frustum", () => {
  const ctx = load();
  const ortho = new Float32Array(16); ortho[0] = ortho[5] = 0.01; ortho[10] = -0.001; ortho[15] = 1;
  ctx.eyes = eyesFor(ctx, [{ pose: pose(-0.03), proj: QUEST.L }, { pose: pose(0.03), proj: ortho }]);
  const frame = { viewProj: null };
  ctx.XrBoot.applyEyes(frame, [0, 0, 0], [0, 0, 1], [0, 1, 0]);
  assert.equal(frame.viewProj, ctx.eyes[0].viewProj);
});
