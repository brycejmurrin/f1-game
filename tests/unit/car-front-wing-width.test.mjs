// The front wing is NARROWER than the car it is bolted to.
//
// This is a regulation invariant, not a style preference. F1 caps the front
// wing roughly 100 mm inboard of the front tyre's outer face on each side
// (1800 mm against a 2000 mm car in 2022-25; ~1700 against 1900 for 2026), and
// that gap is what the endplate exists to use — the wake is pushed AROUND the
// outside of the tyre. A wing wider than the tyres is not a car.
//
// Ours was. Measured on the default build, the widest vertex in the whole car
// was (±1.045, 0.042, 2.570) — the endplate footplate, which grows outboard —
// against a tyre face at 0.950. The car was 2.09 m across the WING and 1.90 m
// across the WHEELS, where 1.90 m is exactly the 2026 maximum: the track was
// already right and the wing was the outlier.
//
// Swept over EVERY aero option rather than the default, because calibrating on
// the default alone is precisely what left `outwash_max` and `reg26_concept`
// sitting 5 mm proud — their spec-3 endplate adds an outboard kick and a curled
// outwash lip that the default endplate does not have.
import test from "node:test";
import assert from "node:assert/strict";
import { loadParts } from "../../tools/car/parts-sweep.mjs";

const M = loadParts();
// addWheel(out, s*0.79, AXLES.wheelY, AXLES.frontZ, 0.34, 0.32, …) in
// js/car/car3d.js — centre 0.79, width 0.32, so the outer face is 0.95 and the
// car is 1.90 m across. Restated here on purpose: if someone widens the track,
// this test should fail until they re-read the wing against it.
const FRONT_TYRE_OUTER = 0.79 + 0.32 / 2;

function wingHalfWidth(aeroId) {
  const setup = aeroId ? { aero: aeroId } : {};
  const tiers = M.Parts.getVisualTiers ? M.Parts.getVisualTiers(setup) : {};
  const d = M.Car3D.buildComplete([0.8, 0.4, 0.1], [0.1, 0.1, 0.1],
    { parts: tiers || {}, measure: true });
  const fw = (d.parts || []).find((p) => p.name === "frontWing");
  assert.ok(fw, `no frontWing section built for aero=${aeroId || "(default)"}`);
  return Math.abs(fw.centreM[0]) + fw.sizeM[0] / 2;
}

test("no aero option puts the front wing outboard of the front tyre", () => {
  const aero = M.Parts.CATALOG.find((c) => c.id === "aero");
  assert.ok(aero && aero.options.length >= 20,
    "expected the full aero catalog, got " + (aero ? aero.options.length : 0));
  const proud = [];
  for (const opt of aero.options) {
    const half = wingHalfWidth(opt.id);
    if (half > FRONT_TYRE_OUTER) proud.push(`${opt.id} ${half.toFixed(3)}`);
  }
  assert.deepEqual(proud, [],
    `front wing wider than the tyre face ${FRONT_TYRE_OUTER.toFixed(3)} m ` +
    `(a wing wider than the car is not a car)`);
});

test("the front wing still fills the width a wing should", () => {
  // The other direction, so "fix" the above by shrinking the wing to nothing
  // fails too. Real ratio is 1700/1900 = 0.895 of the tyre-face width; hold the
  // default within a sane band of it rather than pinning an exact number.
  const half = wingHalfWidth(null);
  const ratio = half / FRONT_TYRE_OUTER;
  assert.ok(ratio >= 0.82 && ratio <= 0.95,
    `default front wing is ${(ratio * 100).toFixed(1)}% of the tyre-face ` +
    `half-width; the regulation ratio is ~89.5%`);
});
