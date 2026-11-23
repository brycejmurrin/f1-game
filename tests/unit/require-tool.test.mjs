// tests/helpers/require-tool.mjs — a missing external tool skips loudly (counted), or FAILS when the
// run opted in (APEX_REQUIRE_TOOLS, or the caller's strict switch = APEX_REQUIRE_LINT_BINS).
// Run: node --test tests/unit/require-tool.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { requireTool, skipSummary, toolRequired } from "../helpers/require-tool.mjs";

const rig = (env = {}, extra = {}) => {
  const counts = new Map(), logged = [], exits = [];
  const opts = { env, counts, log: (s) => logged.push(s), onExit: (fn) => exits.push(fn), ...extra };
  return { counts, logged, exits, opts, flush: () => exits.forEach((fn) => fn()) };
};

test("a present tool never skips, never counts, never hooks exit", () => {
  const r = rig({ APEX_REQUIRE_TOOLS: "1" }, { strict: true });
  const t = requireTool("naga", true, r.opts);
  assert.equal(t.missing, false);
  assert.equal(t.skip(), false);
  assert.equal(r.exits.length, 0);
  assert.equal(r.counts.size, 0);
});

test("missing and not opted in: skips with a reason, and the exit summary counts every skip", () => {
  const r = rig({ CI: "true" });            // bare CI is NOT an opt-in (decision B)
  const t = requireTool("glslangValidator", false, { ...r.opts, hint: "bash tools/env/install-lint-bins.sh glslang" });
  assert.equal(t.missing, true);
  assert.match(t.reason, /glslangValidator not installed - NOT CHECKED \(bash tools\/env\/install-lint-bins\.sh glslang\)/);
  for (let i = 0; i < 3; i++) assert.equal(t.skip(), t.reason);
  const u = requireTool("naga", false, r.opts);
  u.skip();
  requireTool("zizmor", false, r.opts);     // missing but never used by a test: no line
  assert.equal(r.exits.length, 1, "one exit hook per counter, however many tools");
  r.flush();
  assert.deepEqual(r.logged, ["# skipped 3: glslangValidator missing", "# skipped 1: naga missing"]);
});

test("missing and opted in: the strict switch fails the load", () => {
  const r = rig({}, { strict: true });
  assert.throws(() => requireTool("actionlint", false, r.opts), /actionlint not installed[\s\S]*failure here, not a skip/);
  assert.equal(r.counts.size, 0, "a failure is not counted as a skip");
});

test("missing and opted in by APEX_REQUIRE_TOOLS (all, or by id, case-insensitive)", () => {
  for (const v of ["1", "all", "*", "true"])
    assert.throws(() => requireTool("Pillow/numpy", false, rig({ APEX_REQUIRE_TOOLS: v }).opts), /Pillow\/numpy not installed/, v);
  const ids = ["pillow", "numpy"];
  assert.throws(() => requireTool("Pillow/numpy", false, { ...rig({ APEX_REQUIRE_TOOLS: "naga, NUMPY" }).opts, ids }));
  const other = requireTool("Pillow/numpy", false, { ...rig({ APEX_REQUIRE_TOOLS: "naga,zizmor" }).opts, ids });
  assert.equal(other.missing, true, "a list naming other tools does not require this one");
  for (const v of ["", "0", "false"]) assert.equal(toolRequired(ids, { APEX_REQUIRE_TOOLS: v }), false, JSON.stringify(v));
  assert.equal(toolRequired(["naga"], {}), false);
  assert.equal(toolRequired(["naga"], { APEX_REQUIRE_TOOLS: "glslangValidator,naga" }), true);
});

test("skipSummary drops zero counts and keeps order", () => {
  assert.deepEqual(skipSummary(new Map([["a", 2], ["b", 0], ["c", 1]])), ["# skipped 2: a missing", "# skipped 1: c missing"]);
});
