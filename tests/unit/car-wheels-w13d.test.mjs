// W13d (#3414): STYLE Arc Script / Raised Letters sidewall lettering must clear
// the parts-sweep 20 mm garage-readable Hausdorff floor vs their equivalents.
// Run: node --test tests/unit/car-wheels-w13d.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadParts, buildCar, compare, THRESHOLDS } from "../../tools/car/parts-sweep.mjs";

const M = loadParts();
const BASE = { ...M.Parts.DEFAULTS };
const CASES = [
  ["style_tyres_arcscript", "medium"],
  ["style_tyres_retroletter", "soft"],
];

for (const [id, eq] of CASES) {
  test(`tyres/${id} ΔHaus ≥ ${THRESHOLDS.WEAK_MM} mm vs ${eq}`, () => {
    const A = buildCar(M, "mclaren", { ...BASE, tyres: id });
    const B = buildCar(M, "mclaren", { ...BASE, tyres: eq });
    const r = compare(A, B);
    assert.ok(r.dHaus * 1000 >= THRESHOLDS.WEAK_MM,
      `${id}: Hausdorff ${(r.dHaus * 1000).toFixed(1)} mm (need ≥ ${THRESHOLDS.WEAK_MM})`);
    assert.ok(r.movedArea >= THRESHOLDS.MOVED_AREA_M2,
      `${id}: moved ${r.movedArea.toFixed(4)} m²`);
    // Same glyph count as before the boost — protrusion/height only.
    assert.ok(A.idx.length / 3 <= (B.idx.length / 3) * 1.6,
      `${id}: tris ${A.idx.length / 3} over 1.6× base ${B.idx.length / 3}`);
  });
}
