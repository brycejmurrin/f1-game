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
