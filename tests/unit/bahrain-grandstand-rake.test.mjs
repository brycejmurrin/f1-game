// Positive seating rake for every grandstandEx call on bahrain.
//
// Root cause (2026-09): grandstandEx emitted the back shell / roof even when
// every crowdBank riser was rejected by rejBox on a neighbouring-leg fold.
// Bahrain's T1 stand (s=0.05 gap=24) and the far pit-straight stand (s=0.985
// gap=90) shipped as hollow boxes whose height-vs-lateral slope went negative
// — seats that "face the desert". The engine now suppresses a stand with no
// seating rows (and nudges the gap outward first); this test rebuilds bahrain,
// wraps api.grandstandEx the same way as scenery-briefs/_probe/stands.cjs, and
// asserts every call that emits keeps a positive rake with a plausible prim
// count. No relaxed threshold — a hollow shell fails.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "path";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { buildContext } = require(path.join(ROOT, "tools/lib/track-build-vm.cjs"));

function standRake(env, api, real, s, side, gap, len, shell, crowd, opts) {
  const from = env.mark();
  real.call(api, s, side, gap, len, shell, crowd, opts);
  const batch = env.prims.slice(from);
  const k = Math.round(s * api.n) % api.n;
  const aEdge = api.anchor(k, side, 0);
  const r = aEdge.r;
  const pts = [];
  for (const p of batch) {
    const cx = (p.minX + p.maxX) / 2;
    const cy = (p.minY + p.maxY) / 2;
    const cz = (p.minZ + p.maxZ) / 2;
    const lat = side * ((cx - aEdge.c[0]) * r[0] + (cz - aEdge.c[2]) * r[2]);
    pts.push({ lat, y: cy, h: p.maxY - p.minY });
  }
  const seating = pts.filter((p) => p.h < 3.5 && p.lat > gap - 2 && p.lat < gap + 20);
  const use = seating.length >= 3 ? seating : pts;
  let slope = 0;
  if (use.length >= 2) {
    let sx = 0, sy = 0, sxx = 0, sxy = 0, nPts = use.length;
    for (const p of use) { sx += p.lat; sy += p.y; sxx += p.lat * p.lat; sxy += p.lat * p.y; }
    const den = nPts * sxx - sx * sx;
    slope = Math.abs(den) < 1e-9 ? 0 : (nPts * sxy - sx * sy) / den;
  }
  return { s, side, gap, len, prims: batch.length, seating: seating.length, slope };
}

test("bahrain grandstandEx calls keep positive seating rake (no hollow shells)", () => {
  const env = buildContext();
  const def = env.Tracks.LIST.find((d) => d.id === "bahrain");
  assert.ok(def, "bahrain def");
  const orig = env.sandbox.TrackScenery.bahrain;
  assert.equal(typeof orig, "function", "bahrain scenery callback");
  const calls = [];
  env.sandbox.TrackScenery.bahrain = function (api) {
    const real = api.grandstandEx;
    api.grandstandEx = function (s, side, gap, len, shell, crowd, opts) {
      calls.push(standRake(env, api, real, s, side, gap, len, shell, crowd, opts));
    };
    return orig(api);
  };
  const track = env.Tracks.build(def, {});
  env.release(track);

  assert.ok(calls.length >= 20, `expected many grandstandEx calls, got ${calls.length}`);
  const bad = [];
  for (const c of calls) {
    // A fully suppressed stand (onTrack / no seating after nudge) emits 0
    // prims — that is the guarded outcome, not a hollow shell. Anything that
    // did emit must rise away from the track with a full crowd bank.
    if (c.prims === 0) continue;
    if (c.prims < 40) bad.push(`${c.s}@gap${c.gap}: hollow? ${c.prims} prims`);
    if (c.slope < 0.5) bad.push(`${c.s}@gap${c.gap}: slope ${c.slope.toFixed(3)} < 0.5`);
    if (c.seating < 20) bad.push(`${c.s}@gap${c.gap}: seating ${c.seating} < 20`);
  }
  assert.deepEqual(bad, [], "bahrain hollow / backwards stands:\n  " + bad.join("\n  "));
});

test("grandstandEx suppresses a shell when seating cannot clear rejBox", () => {
  // Rebuild bahrain with a probe that forces a stand onto the known fold at
  // s=0.985 gap=90 (pre-fix call site): seating cannot place at any nudge,
  // so the stand must emit ZERO prims — not a roof-only box.
  const env = buildContext();
  const def = env.Tracks.LIST.find((d) => d.id === "bahrain");
  let probe = null;
  env.sandbox.TrackScenery.bahrain = function (api) {
    const real = api.grandstandEx;
    const from = env.mark();
    real(0.985, 1, 90, 80, [0.86, 0.84, 0.78], [0.12, 0.28, 0.55],
      { roof: "cantilever", endWalls: true, pylons: true });
    probe = { prims: env.prims.length - from };
  };
  const track = env.Tracks.build(def, {});
  env.release(track);
  assert.ok(probe, "probe ran");
  assert.equal(probe.prims, 0,
    `fold-site stand must suppress entirely, got ${probe.prims} prims (hollow shell)`);
});
