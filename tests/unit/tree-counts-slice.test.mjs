// tree-counts-slice.test.mjs — the two structural-debt counters of #6920 (U0.1): source-slice tests and
// module-presence typeof guards. Behaviour over injected text; the ratchet that enforces them is U0.R.
//
// Run: node --test tests/unit/tree-counts-slice.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { AT_REF, sourceSliceTestsReport, sourceSliceTests, typeofGuardsReport, typeofGuards } from "../../tools/check/tree-counts.mjs";

const JS = "js" + "/a.js";
const NF = "new " + "Function(";
const G = new Set(["PitLane"]);
const slice = (text) => sourceSliceTestsReport([{ file: "t/x", text }]);
const guards = (text) => typeofGuardsReport([{ file: ["js", "x.js"].join("/"), text }], G);
const total = (rows) => rows.reduce((n, r) => n + r.count, 0);

test("sourceSliceTests needs both a function rebuild and a js/ read", () => {
  assert.deepEqual(slice(`const s = fs.readFileSync("${JS}", "utf8"); ${NF}s)();`), [{ file: "t/x", count: 1 }]);
  assert.equal(slice(`${NF}"return 1")();`).length, 0, "no js/ read");
  assert.equal(slice(`fs.readFileSync("${JS}", "utf8");`).length, 0, "no rebuild");
  assert.equal(slice(`read("${JS}"); ${NF}a)(); ${NF}b)();`)[0].count, 2, "count of calls");
});

test("one added slice test raises the count by exactly 1", () => {
  const f = (n) => ({ file: `t/${n}`, text: `read("${JS}"); ${NF}s)();` });
  assert.equal(sourceSliceTestsReport([f("a")]).length + 1, sourceSliceTestsReport([f("a"), f("b")]).length);
});

test("typeofGuards counts module-global guards only", () => {
  assert.equal(guards(`if (typeof PitLane !== "undefined") {}`).length, 1);
  assert.equal(guards(`typeof PitLane === 'function'`).length, 1);
  assert.equal(guards(`typeof OffscreenCanvas !== "undefined"`).length, 0, "platform check");
  assert.equal(guards(`typeof window !== "undefined"`).length, 0);
  assert.equal(guards(`// typeof PitLane !== "undefined"\n/* typeof PitLane === "object" */`).length, 0, "comments");
  assert.equal(guards(`const s = 'typeof PitLane !== "undefined"';`).length, 0, "string");
});

test("one added guard raises the count by exactly 1", () => {
  const a = `if (typeof PitLane !== "undefined") {}`;
  assert.equal(total(guards(a + "\n" + a)), total(guards(a)) + 1);
});

test("live tree: reducers equal the sum of their rows", () => {
  const s = sourceSliceTestsReport(), t = typeofGuardsReport();
  assert.ok(sourceSliceTests() > 0 && Number.isFinite(sourceSliceTests()));
  assert.ok(typeofGuards() > 0 && Number.isFinite(typeofGuards()));
  assert.equal(sourceSliceTests(), s.length);
  assert.equal(typeofGuards(), t.reduce((n, r) => n + r.count, 0));
});

test("AT_REF.typeofGuards reads a ref", () => {
  assert.equal(typeof AT_REF.typeofGuards, "function");
  const n = AT_REF.typeofGuards("HEAD");
  assert.ok(Number.isFinite(n) && n > 0);
});
