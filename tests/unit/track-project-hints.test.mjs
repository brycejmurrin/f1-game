/* track-project-hints.test.mjs — Tracks.project() recovers (s, lateral) from a world point, with
 * and without a hint, across several circuits, a lap seam and wrong hints (R3-21).
 *
 * WHY THIS EXISTS. tests/specs/projection.spec.js drives `__apex.projTest`, which hands project()
 * the TRUE s as its hint (js/agent/apex-track.js), so on one circuit (monza) the hinted window
 * always contains the answer: a perturbed hint, a hint across the lap seam and a hint a whole lap
 * away were never exercised. This runs the real track build in a VM (no browser) over several
 * circuits and pins what project() does for each kind of hint:
 *
 *   - no hint / the true hint: the answer to within one centreline node (4 m) of arc, 0.3 m lateral;
 *   - a hint off by up to 30 m (the previous frame's s): the window is ±16 nodes and the
 *     continuity term CONT·Δs² pulls the answer toward the hint, so the arc error stays under
 *     ~1.5 nodes — the bias is bounded, not zero;
 *   - a hint across the seam: the same bounds (the hint is wrapped, the window folds over n);
 *   - a hint a half lap away: the ±16-node window cannot contain the point, so project() lands
 *     nowhere near it. That is the contract (the caller drops a rejected hint and re-queries
 *     without one, which recovers exactly), pinned so a change to it is a deliberate one.
 *
 * Run: node --test tests/unit/track-project-hints.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { buildContext } = require("../../tools/track/verify-track.cjs");

const T = buildContext();
const CIRCUITS = ["monza", "albert_park", "spa", "baku", "silverstone", "monaco"];
const LATS = [-6, -3, 0, 3, 6];
const tracks = new Map(CIRCUITS.map((id) => [id, T.build(T.LIST.find((t) => t.id === id), { night: false })]));

const wrapDelta = (d, L) => { d %= L; if (d > L / 2) d -= L; if (d < -L / 2) d += L; return d; };

/** Project a world point built at (s, lat); hint(s) picks the hint (or undefined for none). */
function sweep(track, ss, hint) {
  const L = track.total, smp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0] };
  let worstS = 0, worstLat = 0, minS = Infinity;
  for (const s0 of ss) {
    const s = ((s0 % L) + L) % L;
    for (const lat of LATS) {
      T.sample(track, s, smp);
      const p = T.project(track, smp.p[0] + smp.r[0] * lat, smp.p[2] + smp.r[2] * lat, hint(s, L));
      const es = Math.abs(wrapDelta(p.s - s, L));
      worstS = Math.max(worstS, es); minS = Math.min(minS, es);
      worstLat = Math.max(worstLat, Math.abs(p.lat - lat));
    }
  }
  return { worstS, worstLat, minS };
}
const lap = (track, step = 0.013) => { const o = []; for (let f = 0; f < 1; f += step) o.push(f * track.total); return o; };
const seam = () => { const o = []; for (let d = -24; d <= 24; d += 4) o.push(d + 0.7); return o; };   // metres either side of s = 0

for (const id of CIRCUITS) {
  const track = tracks.get(id);

  test(`${id}: with no hint, and with the true hint, project() returns the built (s, lateral)`, () => {
    for (const [name, hint] of [["no hint", () => undefined], ["true hint", (s) => s]]) {
      const r = sweep(track, lap(track), hint);
      assert.ok(r.worstS < 1.5, `${name}: arc error ${r.worstS.toFixed(2)} m`);
      assert.ok(r.worstLat < 0.3, `${name}: lateral error ${r.worstLat.toFixed(2)} m`);
    }
  });

  test(`${id}: a hint off by up to 30 m biases the arc by under 1.5 nodes and the lateral by under 1 m`, () => {
    for (const off of [30, -30, 12, -12]) {
      const r = sweep(track, lap(track), (s) => s + off);
      assert.ok(r.worstS < 6, `hint ${off >= 0 ? "+" : ""}${off} m: arc error ${r.worstS.toFixed(2)} m`);
      assert.ok(r.worstLat < 1, `hint ${off} m: lateral error ${r.worstLat.toFixed(2)} m`);
    }
  });

  test(`${id}: across the lap seam the answer folds correctly, with and without a hint on the far side`, () => {
    const ss = seam();
    for (const [name, hint] of [["no hint", () => undefined], ["true hint", (s) => s],
      ["hint across the seam +30", (s) => s + 30], ["hint across the seam -30", (s) => s - 30]]) {
      const r = sweep(track, ss, hint);
      assert.ok(r.worstS < 6, `${name}: arc error ${r.worstS.toFixed(2)} m at the seam`);
      assert.ok(r.worstLat < 1, `${name}: lateral error ${r.worstLat.toFixed(2)} m at the seam`);
    }
  });

  test(`${id}: a hint half a lap away cannot find the point (its window is local); dropping the hint recovers it`, () => {
    const wrong = sweep(track, lap(track, 0.05), (s, L) => s + L / 2);
    assert.ok(wrong.minS > 100, `a wrong-lap hint still landed ${wrong.minS.toFixed(1)} m from the truth`);
    const fresh = sweep(track, lap(track, 0.05), () => undefined);
    assert.ok(fresh.worstS < 1.5 && fresh.worstLat < 0.3, "the unhinted re-query recovers exactly");
  });

  test(`${id}: +lateral is to the right of the centreline`, () => {
    const L = track.total, smp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0] };
    T.sample(track, 0.3 * L, smp);
    const q = (lat) => T.project(track, smp.p[0] + smp.r[0] * lat, smp.p[2] + smp.r[2] * lat, 0.3 * L);
    assert.ok(q(5).lat > 3.5, `right of centre projects ${q(5).lat.toFixed(2)}`);
    assert.ok(q(-5).lat < -3.5, `left of centre projects ${q(-5).lat.toFixed(2)}`);
    assert.ok(Math.abs(q(0).lat) < 0.25 && q(0).dist < 0.5, "a centreline point projects to lateral ~0");
  });
}
