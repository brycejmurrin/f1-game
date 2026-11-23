/* track-from-projection-vm.test.mjs — js/game.js trackFrom(), the player's
 * (px, pz) → (s, x) read, against the true perpendicular foot.
 *
 * A point is driven along an offset path (x fixed) through the three tightest
 * corners of three circuits with the game's own predictor (s + v·dt / frenetH,
 * frenetH clamped 0.45..1.8 as in game.js), and every frame's read is compared
 * with the foot the path was built from. TWO_STEP is the read as it stood
 * until 2026-11-10 (two plain `s += along` steps), kept here as the reference:
 *   - ON THE ROAD (|x| ≤ hw - 0.5) the shipped read must be no worse than the
 *     two-step read anywhere, and bit-identical wherever the two-step read had
 *     already converged (residual under TF_TOL) — the no-behaviour-change proof;
 *   - just PAST THE INSIDE EDGE (hw + 0.5) the two-step read trailed the car
 *     by up to 2.4 m (Sochi s≈5496), the shipped read must stay within 1 m.
 *     Nearer the centre of curvature a point has two perpendicular feet and
 *     no read is "right" (the audit's 7-15 m readings were there), so paths
 *     whose h dips under 0.1 are skipped.
 * No curvature reaches the read itself: the corners are FOUND with
 * Tracks.curvature here, in the test, and trackFrom measures h by secant.
 * Run: node --test tests/unit/track-from-projection-vm.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

const CIRCUITS = ["fuji", "sochi", "bahrain"];
const TF_TOL = 0.05;   // game.js trackFrom's miss tolerance after the two plain steps
let g = null;
before(async () => { g = await createGame({ storage: { trackId: CIRCUITS[0] } }); });
after(() => { if (g) g.close(); });

function rig() {
  const G = g.G, T = g.sandbox.Tracks, tr = G.track, L = tr.total;
  const smp = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
  const wrap = (s) => { s %= L; return s < 0 ? s + L : s; };   // game.js wrapS, to the bit
  const at = (s) => {
    T.sample(tr, wrap(s), smp);
    const rl = Math.hypot(smp.r[0], smp.r[2]) || 1, tl = Math.hypot(smp.t[0], smp.t[2]) || 1;
    return { px: smp.p[0], pz: smp.p[2], rx: smp.r[0] / rl, rz: smp.r[2] / rl, tx: smp.t[0] / tl, tz: smp.t[2] / tl, hw: smp.hw };
  };
  const world = (s, x) => { const a = at(s); return [a.px + a.rx * x, a.pz + a.rz * x]; };
  const h = (s, x) => {
    const A = world(s - 2, x), B = world(s + 2, x), C = world(s - 2, 0), D = world(s + 2, 0);
    return Math.hypot(B[0] - A[0], B[1] - A[1]) / Math.hypot(D[0] - C[0], D[1] - C[1]);
  };
  const along = (px, pz, s) => { const a = at(s); return (px - a.px) * a.tx + (pz - a.pz) * a.tz; };
  // The read until 2026-11-10, verbatim but for the out-param.
  const TWO_STEP = (px, pz, sp) => {
    let s = wrap(sp);
    for (let i = 0; i < 2; i++) {
      const a = along(px, pz, s);
      if (Math.abs(a) < 1e-3) break;
      s = wrap(s + Math.max(-12, Math.min(12, a)));
    }
    return s;
  };
  const tightest = (n) => {
    const ks = [];
    for (let s = 0; s < L; s += 1) ks.push({ s, k: Math.abs(T.curvature(tr, s)) });
    ks.sort((a, b) => b.k - a.k);
    const out = [];
    for (const c of ks) { if (out.every((o) => Math.min(Math.abs(o.s - c.s), L - Math.abs(o.s - c.s)) > 80)) out.push(c); if (out.length === n) break; }
    return out;
  };
  // Drive the offset path [s0-60, s0+60] at v; returns per-frame {err, ...} for both reads.
  const drive = (s0, x, v) => {
    const dt = 1 / 60, rows = [];
    let sT = s0 - 60, sNew = wrap(sT), sOld = wrap(sT);
    const d = (a, b) => { let e = a - wrap(b); if (e > L / 2) e -= L; if (e < -L / 2) e += L; return e; };
    while (sT < s0 + 60) {
      sT += v * dt / Math.max(h(sT, x), 0.05);
      const [px, pz] = world(sT, x);
      const pred = (s) => s + v * dt / Math.min(Math.max(h(s, x), 0.45), 1.8);
      const pNew = pred(sNew), pOld = pred(sOld);
      // Same input to both: is the shipped read identical where TWO_STEP converged?
      const same = TWO_STEP(px, pz, pNew), res = Math.abs(along(px, pz, same));
      sNew = g.G.trackFrom(px, pz, pNew).s;
      sOld = TWO_STEP(px, pz, pOld);
      rows.push({ eNew: Math.abs(d(sNew, sT)), eOld: Math.abs(d(sOld, sT)), converged: res < TF_TOL, identical: sNew === same });
    }
    return rows;
  };
  return { at, h, tightest, drive };
}

for (const id of CIRCUITS) {
  test(`${id}: on the road the read is unchanged where it had converged, and never worse`, async () => {
    await g.race(id);
    const r = rig();
    let frames = 0, converged = 0;
    for (const c of r.tightest(3)) {
      const hw = r.at(c.s).hw;
      for (const x of [-(hw - 0.5), -hw / 2, 0, hw / 2, hw - 0.5]) {
        for (const v of [15, 45]) {
          for (const row of r.drive(c.s, x, v)) {
            frames++;
            if (row.converged) {
              converged++;
              assert.ok(row.identical, `${id} s=${c.s} x=${x.toFixed(2)} v=${v}: a converged two-step read changed`);
            }
            // Never worse, up to the band the secant stops in (TF_TOL of miss at h ≥ 0.45).
            assert.ok(row.eNew <= Math.max(row.eOld, TF_TOL / 0.45),
              `${id} s=${c.s} x=${x.toFixed(2)} v=${v}: shipped read ${row.eNew.toFixed(3)} m off, two-step ${row.eOld.toFixed(3)} m`);
          }
        }
      }
    }
    assert.ok(converged / frames > 0.9, `only ${converged}/${frames} on-road frames converged in two steps — the identity proof covers too little`);
  });
}

test("past the inside edge of a tight corner the read follows the car (Sochi trailed 2.4 m)", async () => {
  let worstOld = 0, cases = 0;
  for (const id of CIRCUITS) {
    await g.race(id);
    const r = rig();
    for (const c of r.tightest(12)) {
      const hw = r.at(c.s).hw;
      // The inside is where h < 1. Keep the path clear of the centre of curvature
      // (h ≥ 0.1 all along it): nearer, a point has two perpendicular feet and
      // no read is "right".
      const side = r.h(c.s, hw) < 1 ? 1 : -1;
      const x = side * (hw + 0.5);
      let hMin = Infinity;
      for (let s = c.s - 60; s <= c.s + 60; s += 2) hMin = Math.min(hMin, r.h(s, x));
      if (hMin < 0.1) continue;
      for (const v of [15, 30]) {
        const rows = r.drive(c.s, x, v);
        const eNew = Math.max(...rows.map((o) => o.eNew)), eOld = Math.max(...rows.map((o) => o.eOld));
        worstOld = Math.max(worstOld, eOld); cases++;
        assert.ok(eNew < 1, `${id} s=${c.s} x=${x.toFixed(2)} v=${v}: read trailed ${eNew.toFixed(2)} m (two-step ${eOld.toFixed(2)} m)`);
      }
    }
  }
  assert.ok(cases >= 6, `only ${cases} past-the-edge paths — the corner pick found too few`);
  assert.ok(worstOld > 1.5, `the two-step read never trailed > 1.5 m (worst ${worstOld.toFixed(2)}) — this case no longer reproduces the bug`);
});
