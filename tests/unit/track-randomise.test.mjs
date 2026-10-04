// track-randomise — js/editor/randomise.js over the REAL engine: every
// RANDOMISE lap is CLOCKWISE as built (Σk over the curvature LUT is −2π;
// +k = LEFT turn), TrackShape.signedArea reads that loop POSITIVE (and its
// reverse negative — the sign convention the flip depends on), and the start
// line sits with the longer part of the straight BEHIND it (the grid side),
// because the start is placed after the direction flip, 60 % along the run.
//
// Run: node --test tests/unit/track-randomise.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { bootEditor, design } from "../helpers/editor-vm.mjs";

/** Σ k·ds over the built centreline: ±2π for a simple loop. */
function sumK(tr) { let s = 0; const ds = tr.total / tr.n; for (let k = 0; k < tr.n; k++) s += tr.curv[k] * ds; return s; }

test("randomise: 30 seeds build clockwise (Σk < 0) with the grid side of the start straight ≥ the exit side", { timeout: 120000 }, () => {
  const { TR, V, S } = bootEditor();
  const rows = [];
  for (let seed = 1; seed <= 30; seed++) {
    const g = TR.generate(seed);
    const b = V.build(design({ pts: g.pts, seed }));
    assert.ok(b && b.tr, `seed ${seed} builds`);
    const k = sumK(b.tr);
    assert.ok(Math.abs(Math.abs(k) - 2 * Math.PI) < 0.05, `seed ${seed}: a simple loop (Σk ${k.toFixed(3)})`);
    assert.ok(k < 0, `seed ${seed}: clockwise as built (Σk ${k.toFixed(3)})`);
    assert.ok(S.signedArea(g.pts) > 0, `seed ${seed}: a clockwise loop reads positive`);
    const back = V.straightRun(b.tr, 0, -1, 3000), fwd = V.straightRun(b.tr, 0, +1, 3000);
    assert.ok(back >= fwd, `seed ${seed}: ${back} m behind the line ≥ ${fwd} m ahead`);
    rows.push(`${seed}:${back}/${fwd}`);
  }
  console.log("randomise start straight back/fwd (m): " + rows.join(" "));
});

test("signedArea: the reversed loop builds anticlockwise (Σk > 0) and reads negative", () => {
  const { TR, V, S } = bootEditor();
  const g = TR.generate(5);
  const rev = g.pts.slice().reverse();
  const b = V.build(design({ pts: rev, seed: 5 }));
  assert.ok(sumK(b.tr) > 0, "reversed: left-turning as built");
  assert.ok(S.signedArea(rev) < 0, "reversed: negative area");
});

// ── DESIGNED RANDOMISE: TrackRandom.design / mutate, scored by TrackInsight ──
// design() runs 16 seeds through the validator and ranks the green ones by a
// style's score (TrackInsight.rate); mutate() is MORE LIKE THIS's nudge. Both
// are deterministic per seed, so a card is a seed and a test can pin one.
const DZ = (() => {
  const b = bootEditor(), I = b.ctx.TrackInsight, base = design({ pts: [] });
  const opts = { check: b.V.check, score: I.rate, base };
  return Object.assign(b, { I, base, opts, run: (seed, style) => b.TR.design(seed, style, opts) });
})();
const sig = (list) => list.map((c) => [c.seed, c.pts]);

test("design: the top four are deterministic, unique, best first, all green; 16 seeds well under 2 s", () => {
  const { TR, V, run } = DZ;
  // CPU time, not wall time (2026-10-04): tooling-fast runs this beside other
  // files and other agents' work, and at loadavg 36 the same 16 seeds read
  // 3061 ms of WALL time. The bound is about the design search's work.
  const t0 = process.cpuUsage();
  const a = run(11, "MIXED");
  const used = process.cpuUsage(t0), ms = (used.user + used.system) / 1000;
  console.log(`  design(n=16, MIXED): ${ms.toFixed(0)} ms, top ${a.map((c) => c.seed + ":" + c.score.toFixed(2)).join(" ")}`);
  assert.ok(ms < 2000, "n=16 in " + ms.toFixed(0) + " ms");
  assert.equal(a.length, 4, "four candidates");
  assert.deepEqual(sig(run(11, "MIXED")), sig(a), "the same seeds and points twice");
  assert.equal(new Set(a.map((c) => c.seed)).size, 4, "unique seeds");
  for (let i = 1; i < a.length; i++) assert.ok(a[i - 1].score > a[i].score || (a[i - 1].score === a[i].score && a[i - 1].seed < a[i].seed), "sorted by score, ties by seed");
  for (const c of a) {
    assert.ok(Number.isFinite(c.score) && c.feats && c.tr && c.stats, "score, feats, tr, stats ride along");
    assert.ok(V.check(design({ pts: c.pts })).ok, "seed " + c.seed + " is green");
    for (const k of ["Hc", "Hv", "F"]) assert.ok(c.feats[k] >= 0 && c.feats[k] <= 1, k + " in 0–1: " + c.feats[k]);
    assert.ok(c.feats.P >= 0 && c.feats.P <= 4 && c.feats.C > 0 && c.feats.A >= 0);
  }
  assert.equal(TR.designSeed(11, 0), DZ.ctx.Hash32.mix((11 + 0x9e3779b9) >>> 0), "seed_i = mix(base + (i+1)·φ)");
});

test("score: the plan's formulas; the three styles do not all agree on the top seed", () => {
  const { I, run } = DZ;
  const f = { Hc: 0.5, Hv: 0.6, F: 0.4, C: 4, P: 2, A: 1 };
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, a + " vs " + b);
  near(I.score(f, "FAST"), 2 * 0.4 + 0.5 * 2 + 0.5 * 0.6 - 0.3 * 1 - 0.2 * (4 - 3));
  near(I.score(f, "TECHNICAL"), 1.5 * 0.5 + 0.4 * 4 - 0.4 + 0.2 * 2 - 0.3 * 1);
  near(I.score(f, "MIXED"), 0.5 + 0.6 + 0.3 * 2 - 0.3 * 1);
  near(I.score(Object.assign({}, f, { C: 2 }), "FAST"), 2 * 0.4 + 0.5 * 2 + 0.5 * 0.6 - 0.3 * 1, "FAST's corners are free up to 3/km");
  const rows = [];
  for (const seed of [1, 2, 3]) {
    const top = ["FAST", "TECHNICAL", "MIXED"].map((st) => run(seed, st)[0].seed);
    rows.push(top);
    console.log(`  base ${seed}: FAST ${top[0]} · TECHNICAL ${top[1]} · MIXED ${top[2]}`);
  }
  assert.ok(rows.some((t) => new Set(t).size > 1), "a style changes the winner on at least one base seed");
});

test("mutate: point 0 and the start straight stay, 2–3 points move ≤ 60 m, on the lattice, green", () => {
  const { TR, base, run } = DZ;
  const check = (pts) => DZ.V.check(Object.assign({}, base, { pts }));
  const top = run(1, "FAST");
  let n = 0;
  for (const c of top.slice(0, 2)) for (let j = 0; j < 3; j++) {
    const seed = DZ.ctx.Hash32.mix((c.seed + j) >>> 0), m = TR.mutate(c.pts, seed, { check });
    assert.ok(m.ok && m.verdict && m.verdict.ok, "variant " + j + " of " + c.seed + " is green");
    const again = TR.mutate(c.pts, seed, { check });
    assert.deepEqual([again.pts, again.moved], [m.pts, m.moved], "deterministic per seed");
    assert.deepEqual(m.pts[0], c.pts[0], "point 0 (the start line) stays");
    assert.ok(m.pts.every((p) => Number.isInteger(p[0] * 4) && Number.isInteger(p[1] * 4)), "lattice");
    assert.ok(m.moved.length >= 2 && m.moved.length <= 3, m.moved.length + " points picked");
    if (m.pts.length === c.pts.length) {
      const moved = c.pts.map((p, i) => Math.hypot(m.pts[i][0] - p[0], m.pts[i][1] - p[1])).filter((d) => d > 0);
      assert.ok(moved.length >= 2 && moved.length <= 3, moved.length + " points moved");
      assert.ok(moved.every((d) => d <= 60), "≤ 60 m: " + moved.map((d) => d.toFixed(1)).join(", "));
      n++;
    }
    const a = TR.longestStraight(c.pts), b = TR.longestStraight(m.pts), N = a.dense.length;
    const d = Math.min(Math.abs(a.start - b.start), N - Math.abs(a.start - b.start)) * 4;
    assert.ok(d <= 50, "the start straight begins within 50 m: " + d);
    // The picks are > 300 m from point 0 both ways round the control loop.
    const arc = [0]; for (let i = 0; i < c.pts.length; i++) { const p = c.pts[i], q = c.pts[(i + 1) % c.pts.length]; arc.push(arc[i] + Math.hypot(q[0] - p[0], q[1] - p[1])); }
    for (const i of m.moved) assert.ok(arc[i] > 300 && arc[c.pts.length] - arc[i] > 300, "pick " + i + " clear of the start");
  }
  assert.ok(n >= 3, "most variants keep every point (" + n + "/6 compared point by point)");
  assert.equal(TR.mutate([[0, 0], [100, 0], [100, 100]], 1).ok, false, "a loop with no point 300 m from the start cannot move");
});
