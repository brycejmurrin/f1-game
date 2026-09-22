/* coverage-merge.test.mjs — the contract of tools/ci/coverage-merge.mjs, the
 * only consumer of the raw V8 lists a flagged run writes.
 *
 * Three things can go silently wrong with coverage, and each is a case here:
 *   1. A url shape stops mapping to a source row (the served `?v=…` query, a
 *      `file://` from an absolute vm filename, a helper under tests/) — the
 *      file then reports 0 % or vanishes with no error.
 *   2. A node entry is measured against the WRONG text: the VM harnesses run
 *      `^const` → `var`, so the offsets index the rewritten source; attaching
 *      the raw file would shift every line after the first `const`.
 *   3. A normal run must write NOTHING: the helper is inert without
 *      APEX_JS_COVERAGE=1 (the tree-dirtying surprise AGENTS.md rule 2 forbids).
 *
 * The end-to-end case builds a synthetic node dump against a real js/ file and
 * merges it, so the monocart wiring (add → generate → lcov) is exercised, not
 * just our own filters.
 *
 * Run: node --test tests/unit/coverage-merge.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT, sourcePathOf, attachSource, readDir, mergeCoverage } from "../../tools/ci/coverage-merge.mjs";

test("sourcePathOf maps every url shape a run produces, and refuses the rest", () => {
  assert.equal(sourcePathOf("http://localhost:3456/js/core/log.js?v=dev"), "js/core/log.js");
  assert.equal(sourcePathOf("http://127.0.0.1:3999/js/core/log.js?v=0123abcd"), "js/core/log.js");
  assert.equal(sourcePathOf("http://localhost:3456/css/hud.css"), "css/hud.css");
  assert.equal(sourcePathOf(`file://${ROOT}/js/track/tracks.js`), "js/track/tracks.js");
  assert.equal(sourcePathOf(`${ROOT}/js/track/tracks.js`), "js/track/tracks.js");
  assert.equal(sourcePathOf("http://localhost:3456/tests/helpers/fixtures.js"), null, "the harness is not the product");
  assert.equal(sourcePathOf("http://localhost:3456/js/vendor/three.module.js"), null, "the vendored island is not ours");
  assert.equal(sourcePathOf("file:///somewhere/else/js/core/log.js"), null, "a file outside the repo is not a source");
  assert.equal(sourcePathOf("game-vm:prelude"), null, "the harness prelude has no file");
  assert.equal(sourcePathOf("node:internal/x"), null);
  assert.equal(sourcePathOf(undefined), null);
});

const REL = "js/core/hash32.js";
const raw = fs.readFileSync(path.join(ROOT, REL), "utf8");
const rewritten = raw.replace(/^const\b/gm, "var");
assert.notEqual(raw.length, rewritten.length, `${REL} must start a line with const for this fixture to mean anything`);

function entry(len, url = `file://${ROOT}/${REL}`) {
  return { scriptId: "1", url, functions: [{ functionName: "", isBlockCoverage: true, ranges: [{ startOffset: 0, endOffset: len, count: 1 }] }] };
}

test("attachSource picks the text V8 actually measured — rewritten for the VM, raw for the browser", () => {
  const vm = entry(rewritten.length);
  assert.ok(attachSource(vm));
  assert.equal(vm.source, rewritten, "the VM's offsets index the const→var text");
  const browser = entry(raw.length);
  assert.ok(attachSource(browser));
  assert.equal(browser.source, raw);
  const wrong = entry(raw.length + 7);
  assert.equal(attachSource(wrong), false, "a length that fits neither text is dropped, never mis-attributed");
  const withSource = { url: "http://localhost:3456/js/core/log.js?v=dev", source: "x", functions: [] };
  assert.ok(attachSource(withSource));
  assert.equal(withSource.source, "x", "a browser entry keeps the source it came with");
});

test("readDir takes both the bare list (browser) and the {result} dump (node), and counts junk instead of throwing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-cov-"));
  try {
    fs.writeFileSync(path.join(dir, "a.json"), JSON.stringify([entry(1)]));
    fs.writeFileSync(path.join(dir, "b.json"), JSON.stringify({ result: [entry(2), entry(3)] }));
    fs.writeFileSync(path.join(dir, "c.json"), "{not json");
    fs.writeFileSync(path.join(dir, "d.json"), JSON.stringify({ nothing: true }));
    fs.writeFileSync(path.join(dir, "e.txt"), "ignored");
    const r = readDir(dir);
    assert.equal(r.files, 4);
    assert.equal(r.bad, 2);
    assert.deepEqual(r.lists.map((l) => l.length), [1, 2]);
    assert.deepEqual(readDir(path.join(dir, "missing")), { lists: [], bad: 0, files: 0 });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("a node dump merges into an lcov report with one row per game source", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-cov-"));
  const out = path.join(dir, "report");
  try {
    fs.writeFileSync(path.join(dir, "node.json"), JSON.stringify({ result: [
      entry(rewritten.length),
      entry(10, "http://localhost:3456/tests/helpers/fixtures.js"),   // filtered out
    ] }));
    const r = await mergeCoverage({ inputs: [dir], outputDir: out, reports: ["lcovonly"] });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.entries, 1, "the helper entry was dropped before the merge");
    assert.equal(r.sources, 1);
    const lcov = fs.readFileSync(path.join(out, "lcov.info"), "utf8");
    assert.match(lcov, new RegExp(`^SF:${REL.replace(/[.]/g, "\\.")}$`, "m"), "the row is keyed by the repo-relative path, query stripped");
    assert.match(lcov, /^LF:\d+$/m);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("an empty union is a reported reason, never a throw (the reporter calls this after the verdict line)", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-cov-"));
  try {
    const r = await mergeCoverage({ inputs: [dir, path.join(dir, "missing")], outputDir: path.join(dir, "report") });
    assert.equal(r.ok, false);
    assert.match(r.reason, /no coverage entries/);
    assert.equal(fs.existsSync(path.join(dir, "report")), false, "nothing is written for nothing");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("the browser helper is inert without APEX_JS_COVERAGE=1", async () => {
  delete process.env.APEX_JS_COVERAGE;
  const m = await import("../helpers/js-coverage.js");
  assert.equal(m.COVERAGE, false);
  let touched = false;
  const page = { coverage: { startJSCoverage: async () => { touched = true; }, stopJSCoverage: async () => { touched = true; return []; } } };
  assert.equal(await m.startCoverage(page), false);
  assert.equal(await m.stopCoverage(page, "x"), "coverage off");
  assert.equal(touched, false, "no CDP call is made on an ordinary run");
  assert.match(m.COVERAGE_DIR, /artifacts[\\/]coverage-\d+$/, "a flagged run writes under a port-suffixed artifacts dir");
});
