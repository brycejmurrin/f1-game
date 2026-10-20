// B·D4 design preview (2026-10-19, throwaway branch): five opt-in visual fields
// for wheels / brakes / cockpit, each carried by one STYLE candidate.
//  - OFF by default: no non-candidate option and no factory preset sets one, so
//    every shipped car builds the same mesh it did before.
//  - VISIBLE: each candidate's mesh moves past the parts-sweep WEAK floor
//    (20 mm Hausdorff) and a 10 cm moved patch against its `equivalent`.
//
// Run: node --test tests/unit/design-preview-wheels.test.mjs   (~10 s, no browser)
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadParts, buildCar, compare, THRESHOLDS } from "../../tools/car/parts-sweep.mjs";

const M = loadParts();
const FIELDS = { wheels: ["spokeSplit", "blownAxle"], brakes: ["drum"], cockpit: ["mirrorMount", "mirrorFrame"] };
const CANDIDATES = [
  ["wheels", "style_wheels_ysplit"], ["wheels", "style_wheels_blownaxle"], ["brakes", "style_brakes_drum"],
  ["cockpit", "style_cockpit_halomirror"], ["cockpit", "style_cockpit_mirrorframe"],
];
const candIds = new Set(CANDIDATES.map((c) => c[1]));

test("the preview fields are registered and only the candidates set them", () => {
  const reg = M.Parts.VISUAL_FIELD_REGISTRY.geometry;
  const bad = [];
  for (const [cat, keys] of Object.entries(FIELDS)) {
    for (const k of keys) assert.ok(reg[cat].includes(k), `${cat}.${k} registered`);
    for (const o of M.Parts.CATALOG.find((c) => c.id === cat).options) {
      const set = keys.filter((k) => o.visual && o.visual[k]);
      if (set.length && !candIds.has(o.id)) bad.push(`${cat}/${o.id}: ${set}`);
    }
  }
  assert.deepEqual(bad, []);
  for (const team of M.Teams.LIST) {
    const v = M.Parts.getVisualTiers(M.Parts.getFactorySetup(team), team)._visual;
    for (const [cat, keys] of Object.entries(FIELDS))
      for (const k of keys) assert.ok(!(v[cat] && v[cat][k]), `${team.id} factory ${cat}.${k} off`);
  }
});

for (const [cat, id] of CANDIDATES) {
  test(`${cat}/${id} reads against its equivalent`, () => {
    const opt = M.Parts.CATALOG.find((c) => c.id === cat).options.find((o) => o.id === id);
    const base = { ...M.Parts.DEFAULTS };
    const A = buildCar(M, "mclaren", { ...base, [cat]: opt.equivalent });
    const B = buildCar(M, "mclaren", { ...base, [cat]: id });
    const r = compare(A, B);
    assert.ok(r.dHaus * 1000 >= THRESHOLDS.WEAK_MM, `${id}: Hausdorff ${(r.dHaus * 1000).toFixed(1)} mm`);
    assert.ok(r.movedArea >= THRESHOLDS.MOVED_AREA_M2, `${id}: moved ${r.movedArea.toFixed(4)} m2`);
  });
}
