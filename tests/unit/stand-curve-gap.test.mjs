// #2204 — tiered stands on a bend must close the outside-of-bend gap.
//
// terrace() used to emit straight boxes sized to the centreline step. On the
// outside of a curve that left saw-tooth gaps of about d·L/R between
// neighbouring stations. The emitter now scales each row by local curvature
// (seg ≈ spacing · (1 + κ · x)). This test rebuilds jerez, walks each
// terrace along() station at the back row, and asserts the along-track gap
// (projected onto the average tangent — not the raw Euclidean chord, which
// blows up across a hairpin fold) is ≤ 0.5 m whenever the row sits on a
// longer arc than the centreline step.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "path";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { buildContext } = require(path.join(ROOT, "tools/lib/track-build-vm.cjs"));

const OUTSIDE_GAP_MAX = 0.5; // metres — Done when of #2204

function measureTerraceGaps(api, real, s0, s1, side, gap, opts) {
  opts = opts || {};
  const rows = Math.round(opts.rows || 6);
  const dep = opts.depth != null ? opts.depth : 2.6;
  const step = opts.step || 7;
  const { along, anchor, n, ds, vadd, hw } = api;
  const stations = [];
  const nb = Math.max(1, Math.round(step / ds));
  along(s0, s1, step, (k, spacing) => {
    const a = anchor(k, side, gap);
    const back = side * (1.0 + (rows - 1) * dep);
    const p = vadd(a.c, a.r, back);
    const kn = [(k + nb) % n, (k - nb + n) % n].map((kk) => anchor(kk, side, gap));
    const prev = kn[1], next = kn[0];
    const e1x = a.c[0] - prev.c[0], e1z = a.c[2] - prev.c[2];
    const e2x = next.c[0] - a.c[0], e2z = next.c[2] - a.c[2];
    const l1 = Math.hypot(e1x, e1z) || 1, l2 = Math.hypot(e2x, e2z) || 1;
    const κ = Math.atan2(e1x * e2z - e1z * e2x, e1x * e2x + e1z * e2z) / ((l1 + l2) / 2);
    const hwk = (hw && hw[k] != null) ? hw[k] : 7.5;
    const x = side * (hwk + gap) + back;
    const scale = 1 + κ * x;
    // Mirror the emitter: Euclidean chord to neighbours, capped by curvature.
    let cMin = Infinity;
    for (const q of kn) {
      const pq = vadd(q.c, q.r, back);
      const d = Math.hypot(pq[0] - p[0], pq[1] - p[1], pq[2] - p[2]);
      if (d > 1e-6) cMin = Math.min(cMin, d);
    }
    const curveCap = spacing * Math.min(1.85, Math.max(0.15, scale));
    const seg = Math.min(cMin, curveCap) * 0.98;
    stations.push({ k, spacing, p, seg, t: a.t, κ, scale, back });
  });
  const gaps = [];
  for (let i = 0; i < stations.length - 1; i++) {
    const A = stations[i], B = stations[i + 1];
    const dk = Math.min((B.k - A.k + n) % n, (A.k - B.k + n) % n);
    if (dk !== nb) continue;
    // Along-track separation: project the back-row chord onto the average tangent.
    const tx = A.t[0] + B.t[0], tz = A.t[2] + B.t[2];
    const tl = Math.hypot(tx, tz) || 1;
    const tHat = [tx / tl, tz / tl];
    const dx = B.p[0] - A.p[0], dz = B.p[2] - A.p[2];
    const alongDist = Math.abs(dx * tHat[0] + dz * tHat[1]);
    const gapM = alongDist - A.seg / 2 - B.seg / 2;
    // Outside = this row's arc is longer than the centreline step.
    const outside = A.scale > 1.02 && B.scale > 1.02;
    // Gate only moderate bends whose along-track chord is actually longer than
    // the centreline step. Hairpin folds make the Euclidean back-row chord
    // leap across the apex; those are capped by curvature, not filled.
    const turn = Math.abs(A.κ * A.spacing);
    if (turn > 0.35 || Math.abs(B.κ * B.spacing) > 0.35) continue;
    if (alongDist < A.spacing * 0.95) continue;
    gaps.push({
      k: A.k, frac: A.k / n, along: alongDist, spacing: A.spacing, gap: gapM, outside,
      scale: A.scale, seg: A.seg,
    });
  }
  real.call(api, s0, s1, side, gap, opts);
  return gaps;
}

test("jerez terrace outside-of-bend gaps close to ≤ 0.5 m (#2204)", () => {
  const env = buildContext();
  const def = env.Tracks.LIST.find((d) => d.id === "jerez");
  assert.ok(def, "jerez def");
  const orig = env.sandbox.TrackScenery.jerez;
  assert.equal(typeof orig, "function", "jerez scenery callback");
  const allGaps = [];
  env.sandbox.TrackScenery.jerez = function (api) {
    const real = api.terrace;
    api.terrace = function (s0, s1, side, gap, opts) {
      allGaps.push(...measureTerraceGaps(api, real, s0, s1, side, gap, opts));
    };
    return orig(api);
  };
  const track = env.Tracks.build(def, {});
  env.release(track);

  assert.ok(allGaps.length > 10, `expected many terrace station pairs, got ${allGaps.length}`);
  const outside = allGaps.filter((g) => g.outside);
  assert.ok(outside.length > 0, "expected at least one outside-of-bend station pair");
  const bad = outside.filter((g) => g.gap > OUTSIDE_GAP_MAX);
  assert.deepEqual(
    bad.slice(0, 8).map((g) => ({
      frac: +g.frac.toFixed(3), gap: +g.gap.toFixed(3), along: +g.along.toFixed(3),
      scale: +g.scale.toFixed(3),
    })),
    [],
    `outside-of-bend gaps > ${OUTSIDE_GAP_MAX} m:\n` +
      bad.slice(0, 8).map((g) =>
        `  frac=${g.frac.toFixed(3)} gap=${g.gap.toFixed(3)} along=${g.along.toFixed(3)} scale=${g.scale.toFixed(3)}`).join("\n"),
  );
});

test("jerez clip-audit no longer lists tier-emitter self-pairs at severe depth (#2204)", () => {
  const { execFileSync } = require("node:child_process");
  const out = execFileSync(process.execPath, [
    path.join(ROOT, "tools/track/clip-audit.cjs"), "jerez", "--why",
  ], { encoding: "utf8", cwd: ROOT, timeout: 60000 });
  // Severe (≥1 m) self-pairs of terrace / spectatorHill / crowdBand are the
  // defect class. Minor (<1 m) residual pairs and place/bush cross-pairs are
  // out of scope.
  const severeTier = out.split("\n").filter((line) => {
    const m = line.match(/max\s+([\d.]+)m/);
    if (!m || parseFloat(m[1]) < 1.0) return false;
    return /structures\.js:\d+.*structures\.js:\d+/.test(line) ||
      /nature\.js:\d+.*nature\.js:\d+/.test(line) && /along/.test(line) ||
      /crowdBand.*crowdBand/.test(line);
  });
  assert.deepEqual(severeTier, [], "severe tier-emitter self-pairs still in clip-audit --why:\n" + severeTier.join("\n"));
});
