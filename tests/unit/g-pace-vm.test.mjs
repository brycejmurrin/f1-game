/* g-pace-vm.test.mjs — the G.pace member (#7129, #6483 row 1): PaceMath's PACE conversions on the façade.
 *
 * Consumers used to re-derive these by hand (`G.vTop() / PhysicsConsts.VMAX`, `v * VMAX / G.vTop()`,
 * `Math.max(G.PACE, 0.05)`). G.pace is bound to game.js's own PaceMath instance, so every consumer reads the
 * very numbers the driving model uses. This pins, on the REAL js/game.js in the Node VM, over PACE values at and
 * below the 0.05 floor, inside the slider range and above 1:
 *   - G.pace.vStd / aStd are the driving model's vStd / aStd, to the bit (PaceMath's formula, live PACE);
 *   - G.pace.vScale * VMAX === G.vTop() (the vScale the old inline sites computed as vTop()/VMAX);
 *   - G.pace.k === Math.max(G.PACE, 0.05) to the bit, the floor incident-sim's promotion thresholds and
 *     collide's sevV / capV multiply by: equal factors give bit-identical thresholds.
 *
 * Run: node --test tests/unit/g-pace-vm.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

const PACES = [0, 0.03, 0.44, 1, 1.3];
const SPEEDS = [0, 1, 12.5, 41.3, 72, 88.8];
let g = null, VMAX = 0, PHYS0 = null;
before(async () => {
  g = await createGame({ storage: { trackId: "monza" } });
  PHYS0 = { ...g.apex.tuning() };
  ({ VMAX } = g.sandbox.PhysicsConsts);
});
after(() => { if (g) { g.apex.setPhysics(PHYS0); g.close(); } });

function atPace(p) {
  g.G.PACE = p;
  assert.equal(g.G.PACE, p, `PACE ${p} took`);
}

test("G.pace is one frozen member with the four PaceMath conversions", () => {
  const P = g.G.pace;
  assert.ok(P && Object.isFrozen(P), "G.pace is a frozen view");
  assert.equal(typeof P.vStd, "function");
  assert.equal(typeof P.aStd, "function");
  assert.equal(typeof P.vScale, "number");
  assert.equal(typeof P.k, "number");
  assert.equal(g.G.pace, P, "one object, not rebuilt per read");
});

for (const p of PACES) {
  test(`PACE ${p}: G.pace.vStd / aStd are PaceMath's formulas to the bit`, () => {
    atPace(p);
    const vTop = g.G.vTop();
    const k = Math.max(p, 0.05);
    assert.equal(vTop, VMAX * k, "vTop() is VMAX · max(PACE, 0.05)");
    for (const v of SPEEDS) {
      assert.equal(g.G.pace.vStd(v), v * VMAX / vTop, `vStd(${v})`);
      assert.equal(g.G.pace.aStd(v), v / k, `aStd(${v})`);
    }
  });
  test(`PACE ${p}: G.pace.vScale is vTop()/VMAX and round-trips to vTop()`, () => {
    atPace(p);
    assert.equal(g.G.pace.vScale, g.G.vTop() / VMAX, "the quotient the inline sites computed");
    assert.equal(g.G.pace.vScale * VMAX, g.G.vTop(), "vScale · VMAX === vTop()");
  });
  test(`PACE ${p}: G.pace.k is the 0.05 floor, live`, () => {
    atPace(p);
    assert.equal(g.G.pace.k, Math.max(g.G.PACE, 0.05), "the factor incident-sim and collide multiply by");
  });
}
