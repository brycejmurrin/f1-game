// vm-filename-lint — every vm source load in tests/unit and tests/helpers names an absolute filename (#2961).
//
// V8 reports a vm script under the `filename` it was given and Node only turns an absolute path into a file:// URL, so
// a relative one is invisible to file-path breakpoints and to --experimental-test-coverage
// (docs/notes/NODE-DEBUGGING-2026-10-19.md §Q1). This runs the lint over the tree and pins its judgement on small inputs.
import test from "node:test";
import assert from "node:assert/strict";
import { lintSource, lintAll, count, countSrc } from "../../tools/check/vm-filename-lint.mjs";
import { pinVerdict } from "../../tools/check/ratchets.mjs";
import { absSrc } from "../helpers/abs-src.mjs";
import path from "node:path";

const kinds = (src) => lintSource(src).sites.map((s) => s.kind);

test("VF1 a relative or bare literal filename is flagged, for every vm entry point", () => {
  assert.deepEqual(kinds(`vm.runInContext(s, c, { filename: "js/game.js" });`), ["relative"]);
  assert.deepEqual(kinds(`vm.runInNewContext(s, c, { filename: "a.js" });`), ["relative"]);
  assert.deepEqual(kinds(`vm.runInThisContext(s, { filename: "js/game.js" });`), ["relative"]);
  assert.deepEqual(kinds(`new vm.Script(s, { filename: f });`), ["relative"]);
});

test("VF2 an absolute filename (call or ROOT-built) passes; a synthetic label names no file", () => {
  assert.deepEqual(kinds(`vm.runInContext(s, c, { filename: absSrc(f) });`), []);
  assert.deepEqual(kinds(`vm.runInContext(s, c, { filename: path.join(ROOT, f) });`), []);
  assert.deepEqual(kinds(`vm.runInContext(s, c, { filename: ROOT + "/js/game.js" });`), []);
  assert.deepEqual(kinds(`vm.runInContext(s, c, { filename: "vm-page:evaluate" });`), []);
});

test("VF3 a load with no filename is informational, and non-vm calls are ignored", () => {
  assert.deepEqual(kinds(`vm.runInContext(s, c);`), ["missing"]);
  assert.deepEqual(kinds(`vm.runInContext(s, c, { timeout: 5 });`), ["missing"]);
  assert.deepEqual(kinds(`foo.runInContext(s, c, { filename: "js/game.js" });`), []);
});

test("VF4 absSrc joins a repo-relative path onto ROOT and leaves an absolute one alone", () => {
  assert.ok(path.isAbsolute(absSrc("js/game.js")));
  assert.ok(absSrc("js/game.js").endsWith(path.join("js", "game.js")));
  assert.equal(absSrc("/x/y.js"), "/x/y.js");
});

test("VF5 the tree has no relative vm filename and every scanned file parses", () => {
  const results = lintAll();
  const bad = results.flatMap((r) => r.sites.filter((s) => s.kind === "relative").map((s) => `${r.file}:${s.line}`));
  assert.deepEqual(bad, [], "use absSrc(rel) from tests/helpers/abs-src.mjs");
  assert.deepEqual(results.filter((r) => r.parseError).map((r) => r.file), []);
  assert.ok(count(results, "missing") >= 0);
});

test("VF6 filename-less SOURCE loads are ratcheted (tree.vmSrcLoads), which only goes down; snippets stay free", async () => {
  const src = (code) => lintSource(code).sites.map((s) => !!s.src);
  assert.deepEqual(src(`vm.runInContext(SRC + "; this.X = X;", ctx);`), [true]);
  assert.deepEqual(src(`vm.runInContext(fs.readFileSync(f, "utf8"), ctx);`), [true]);
  assert.deepEqual(src(`vm.runInContext("X.y()", ctx);`), [false]);
  assert.deepEqual(src(`vm.runInContext(\`X.y()\`, ctx);`), [false]);
  const v = await pinVerdict("vmSrcLoads");
  assert.equal(v.value, countSrc(lintAll()), "ratchets.mjs counts what the lint counts");
  assert.ok(v.ok, `${v.value} filename-less source loads (ceiling ${v.ceiling}${v.base ? `; base ${v.base.value}/${v.base.ceiling}` : ""}): pass { filename: absSrc(rel) }`);
  if (v.value < v.ceiling) console.log(`vm-filename-lint: ${v.value} source loads, under the ceiling ${v.ceiling}: node tools/check/ratchets.mjs --update --lower-only`);
});
