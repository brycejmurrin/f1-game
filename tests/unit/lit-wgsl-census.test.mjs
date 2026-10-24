/* lit-wgsl-census.test.mjs — the hashing/diff core of tools/perf/lit-wgsl-census.mjs (#3672). No browser.
 * Run: node --test tests/unit/lit-wgsl-census.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliseWgsl, classify, summarise, diffSummaries } from "../../tools/perf/lit-wgsl-census.mjs";

const litFs = (n, extra = "") =>
  `@binding( 2 ) @group( 0 ) var nodeUniform${n}_sampler : sampler_comparison;\n@binding( 3 ) @group( 0 ) var nodeUniform${n} : texture_depth_2d;\n` +
  `var<uniform> NodeBuffer_${1000 + n} : NodeBuffer_${1000 + n}Struct;\n@fragment fn main() { let nodeVar0 = 1; ${extra} }\n` + "// pad\n".repeat(4000);

test("normaliseWgsl: build-order renumbering normalises equal, a real edit does not", () => {
  assert.equal(normaliseWgsl(litFs(12)), normaliseWgsl(litFs(47)));
  assert.notEqual(normaliseWgsl(litFs(12)), normaliseWgsl(litFs(12, "let x = textureLoad();")));
});

test("normaliseWgsl: distinct names keep distinct slots, a repeat (incl. its _sampler twin) keeps its slot", () => {
  const n = normaliseWgsl("nodeUniform3 nodeUniform9 nodeUniform3_sampler nodeUniform9");
  assert.equal(n, "nodeUniform#0 nodeUniform#1 nodeUniform#0_sampler nodeUniform#1");
});

test("classify: lit = large fragment with a comparison sampler; small or vertex-only is not", () => {
  assert.deepEqual(classify(litFs(1)), { stage: "fs", lit: true });
  assert.equal(classify("@fragment fn f(){} sampler_comparison").lit, false);
  assert.equal(classify("@vertex fn v(){}").stage, "vs");
});

test("summarise + diffSummaries: identical -> unchanged; renumber -> changed but namesOnly; edit -> changed", () => {
  const mods = (...codes) => codes.map((code, i) => ({ label: i ? "fragment" : "vertex", code }));
  const base = summarise(mods("@vertex fn v(){}", litFs(12)));
  const same = diffSummaries(base, summarise(mods("@vertex fn v(){}", litFs(12))));
  assert.equal(same.changed, false);
  assert.equal(same.familyChanged, false);

  const renum = diffSummaries(base, summarise(mods("@vertex fn v(){}", litFs(47))));
  assert.equal(renum.familyChanged, true);
  assert.equal(renum.namesOnly, 1);
  assert.equal(renum.litAdded, 1);

  const edit = diffSummaries(base, summarise(mods("@vertex fn v(){}", litFs(12, "let y = 1;"))));
  assert.equal(edit.familyChanged, true);
  assert.equal(edit.namesOnly, 0);
});

test("diffSummaries: a non-lit module change leaves the lit family hash alone", () => {
  const m = (v) => [{ label: "vertex", code: v }, { label: "fragment", code: litFs(5) }];
  const d = diffSummaries(summarise(m("@vertex fn a(){}")), summarise(m("@vertex fn b(){}")));
  assert.equal(d.changed, true);
  assert.equal(d.familyChanged, false);
});

test("summarise: a module created twice is one row (capture length must not move the counts or the hash)", () => {
  const a = { label: "fragment", code: litFs(5) }, v = { label: "vertex", code: "@vertex fn v(){}" };
  const once = summarise([v, a]), twice = summarise([v, a, a, v, a]);
  assert.equal(twice.rows.length, 2);
  assert.equal(twice.familyHash, once.familyHash);
  assert.equal(twice.allHash, once.allHash);
});
