// #4967 — tier rows on the OUTSIDE of a bend must close up, on every tier.
//
// curveTier() caps a row at spacing·(1 + bend·lateral). The cap had the bend
// sign inverted (its κ is negative on a left turn, lateral is +right) and
// tieredBowl passed the base gap for every tier, so outside rows were cut
// SHORTER than the centreline step, more for every tier further back: Foro
// Sol, Monza and Imola bowls showed bays gapping on the outside of the bend.
//
// This test loads the real stands.js fresh in the track-build VM (the shipped
// SceneryStands is frozen), runs it with the circuit's own along()/anchor()
// and a recording addBox. Every riser on the outside of a moderate bend (its
// neighbour chords longer than the centreline step) must be no more than
// CUT_MAX shorter than the shorter of those chords, on every tier.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { buildContext } = require(path.join(ROOT, "tools/lib/track-build-vm.cjs"));
const SRC = fs.readFileSync(path.join(ROOT, "js/track/scenery/stands.js"), "utf8");
// The rule sizes a row to its SHORTER neighbour chord at its inner edge, less a
// swing and a 4 cm pad: up to ~0.6 m short of the centre chord on these bends.
const CUT_MAX = 0.75; // metres

// Every tieredBowl riser box on `id`, tagged with its along() station and tier.
function bowlRisers(id) {
  const env = buildContext();
  const Fresh = vm.runInContext(`(function(){${SRC}\n;return SceneryStands;})()`, env.sandbox);
  const runs = [];
  const orig = env.sandbox.TrackScenery[id];
  env.sandbox.TrackScenery[id] = function (api) {
    const real = api.tieredBowl;
    api.tieredBowl = function (s0, s1, side, gap, opts) {
      const o = opts || {};
      const run = { s0, side, ds: api.ds, step: o.step || 8, tierDepth: o.tierDepth != null ? o.tierDepth : 5.6,
        base: o.base != null ? o.base : 3.0, rise: o.rise != null ? o.rise : 3.3, risers: [] };
      let station = null;
      const ctx = Object.create(api);
      Object.assign(ctx, {
        out: {}, rejBox: () => false, noteSpan() {}, indexSolid() {},
        addCyl() {}, addFrustum() {}, addPrism() {},
        addBox(_o, c, size, _col, b) {
          if (!station || Math.abs(size[0] - run.tierDepth * 0.93) > 1e-6) return;
          const t = Math.round((size[1] - run.base) / run.rise);
          run.risers.push({ ...station, t, c: c.slice(), seg: size[2], tan: b[2].slice() });
        },
      });
      const along = (a0, a1, stepM, fn, tag) => api.along(a0, a1, stepM, (k, spacing) => {
        station = { k, spacing };
        try { fn(k, spacing); } finally { station = null; }
      }, tag);
      Fresh.create(ctx, along).tieredBowl(s0, s1, side, gap, opts);
      runs.push(run);
      return real.apply(this, arguments);
    };
    return orig(api);
  };
  const track = env.Tracks.build(env.Tracks.LIST.find((d) => d.id === id), {});
  const n = track.px.length;
  env.release(track);
  return { runs, n };
}

function cutShort(id) {
  const { runs, n } = bowlRisers(id);
  const bad = [];
  let outside = 0;
  const alongM = (A, B) => {
    const tx = A.tan[0] + B.tan[0], tz = A.tan[2] + B.tan[2], tl = Math.hypot(tx, tz) || 1;
    return Math.abs(((B.c[0] - A.c[0]) * tx + (B.c[2] - A.c[2]) * tz) / tl);
  };
  const turn = (A, B) => Math.acos(Math.max(-1, Math.min(1,
    (A.tan[0] * B.tan[0] + A.tan[2] * B.tan[2]) /
    ((Math.hypot(A.tan[0], A.tan[2]) * Math.hypot(B.tan[0], B.tan[2])) || 1))));
  for (const run of runs) {
    const byTier = new Map();
    for (const r of run.risers) (byTier.get(r.t) || byTier.set(r.t, []).get(r.t)).push(r);
    for (const [t, rs] of byTier) {
      for (let i = 1; i + 1 < rs.length; i++) {
        const P = rs[i - 1], A = rs[i], N = rs[i + 1];
        const nb = Math.round(A.spacing / run.ds);
        // Neighbouring stations only: a row dropped between them is not a gap.
        if (((A.k - P.k) + n) % n !== nb || ((N.k - A.k) + n) % n !== nb) continue;
        // Hairpin folds are capped by curvature on purpose, not filled.
        if (turn(P, A) > 0.35 || turn(A, N) > 0.35) continue;
        const chord = Math.min(alongM(P, A), alongM(A, N));
        if (chord < A.spacing * 1.02) continue; // not on the outside of the bend
        if (chord > A.spacing * 1.8) continue; // at curveTier's 1.85× ceiling, by design
        outside++;
        const short = chord - A.seg;
        if (short > CUT_MAX) bad.push({ s0: +run.s0.toFixed(3), side: run.side, tier: t, k: A.k, chord: +chord.toFixed(2), seg: +A.seg.toFixed(2) });
      }
    }
  }
  return { outside, bad };
}

// imola's bowl sits on the inside of its bend: no outside pairs to check.
for (const id of ["mexico", "monza"]) {
  test(`${id} tieredBowl: outside-of-bend rows are not cut short, any tier (#4967)`, () => {
    const { outside, bad } = cutShort(id);
    assert.ok(outside > 0, `${id}: expected outside-of-bend riser pairs`);
    assert.deepEqual(bad.slice(0, 10), [], `${id}: ${bad.length} of ${outside} outside rows cut > ${CUT_MAX} m short of their neighbour chord`);
  });
}
