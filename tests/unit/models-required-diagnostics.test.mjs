// A required model that fails validation must leave a diagnostics.invalid row
// (overheadSpan frame/box rejection, groundedSegments with no grounded chord),
// not vanish untraced. #7243 member 1.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
function loadModels() {
  const sandbox = { console, Math, Array, Object, Number, Map, Set };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const f of ["js/core/log.js", "js/core/mat4.js", "js/track/scenery/guards.js", "js/track/scenery/models.js"])
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8").replace(/^const\b/gm, "var"), ctx, { filename: absSrc(f) });
  return sandbox.TrackModels || sandbox.SceneryModels;
}
const frame = { c: [0, 0, 0], r: [1, 0, 0], u: [0, 1, 0], t: [0, 0, 1], hw: 7 };
const mk = (extra = {}) => {
  const diagnostics = { emitted: [], suppressed: [], invalid: [], unsafe: [] };
  const models = loadModels().create({
    out: { pos: [], _n: 0 }, diagnostics, emitBox: () => {}, frameAt: () => frame,
    track: { total: 1000 }, ...extra,
  });
  return { models, diagnostics };
};

test("overheadSpan with zero depth leaves a diagnostics.invalid row", () => {
  const { models, diagnostics } = mk();
  assert.equal(models.overheadSpan({ id: "ov", required: true, clearance: 6, depth: 0 }), false);
  assert.equal(diagnostics.invalid.length, 1);
  assert.equal(diagnostics.invalid[0].id, "ov");
  assert.equal(diagnostics.invalid[0].required, true);
});

test("overheadSpan with a non-finite frame leaves a diagnostics.invalid row", () => {
  const { models, diagnostics } = mk({ frameAt: () => ({ ...frame, hw: NaN }) });
  assert.equal(models.overheadSpan({ id: "ov2", required: true, clearance: 6 }), false);
  assert.equal(diagnostics.invalid.length, 1);
});

test("groundedSegments with every chord null-grounded leaves a diagnostics.invalid row", () => {
  const { models, diagnostics } = mk({ groundHeight: () => NaN });
  assert.equal(models.groundedSegments({ id: "gs", required: true, points: [{ k: 1, side: 1, dist: 9 }, { k: 5, side: 1, dist: 9 }] }), false);
  assert.equal(diagnostics.invalid.length, 1);
  assert.equal(diagnostics.invalid[0].id, "gs");
});

test("groundedSegments with fewer than 2 points leaves a diagnostics.invalid row", () => {
  const { models, diagnostics } = mk({ groundHeight: () => 0 });
  assert.equal(models.groundedSegments({ id: "gs2", points: [] }), false);
  assert.equal(diagnostics.invalid.length, 1);
});
