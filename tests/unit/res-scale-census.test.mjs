import test from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "../../tools/gfx/res-scale-census.mjs";

test("res-scale-census parseArgs: defaults", () => {
  const o = parseArgs([]);
  assert.equal(o.track, "monza");
  assert.deepEqual(o.scales, [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.7, 1]);
  assert.equal(o.json, null);
});

test("res-scale-census parseArgs: overrides, scale clamp, ls prefixing", () => {
  const o = parseArgs(["--track", "spa", "--scales", "1,0.4,0.75,2", "--settle", "0", "--json", "a.json", "--ls", "bloom=0"]);
  assert.equal(o.track, "spa");
  assert.deepEqual(o.scales, [1, 0.75]);
  assert.equal(o.settle, 1);
  assert.equal(o.json, "a.json");
  assert.deepEqual(o.ls, { bloom: "0" });
});

test("res-scale-census parseArgs: unknown flag throws", () => {
  assert.throws(() => parseArgs(["--nope"]), /unknown argument/);
});
