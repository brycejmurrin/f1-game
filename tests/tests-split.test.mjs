// tests-split — the R2 move, as a reproducible plan rather than a checklist.
//
// AUDIT-SYNTHESIS §R2 lands as ONE commit across ~174 files, and five of its
// thirteen lockstep items are marked ⚠ "no guard turns red" — a missed rewrite
// there is green, not broken. This suite pins the two properties that make the
// tool trustworthy enough to run it:
//
//   1. the rewrites are DERIVED FROM THE TREE, so a reference nobody wrote down
//      is still found (this repo has already produced one — menu-fit.mjs's
//      swallowed dynamic import was found by a scanner, not by reading a plan);
//   2. it does not rewrite HISTORY. The first plan reported 1219 string hits
//      and the biggest contributors were docs/archive/ and the dated audit
//      records — 281 in a single raw workflow dump. Those describe the tree as
//      it WAS. Rewriting them falsifies a record, and inside a 174-file commit
//      nobody would see it.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { moveMap, importRewrites, textRewrites, plan } from "../tools/tests-split.mjs";

test("every spec, unit suite and helper lands in exactly one bucket", () => {
  const map = moveMap();
  const bucket = (p) => path.posix.dirname(p);
  for (const [from, to] of map) {
    if (from.endsWith(".spec.js")) assert.equal(bucket(to), "tests/specs", from);
    else if (/\.test\.(mjs|cjs)$/.test(from)) assert.equal(bucket(to), "tests/unit", from);
    else if (from.endsWith(".json")) assert.equal(bucket(to), "tests/data", from);
    else if (from.endsWith(".js")) assert.equal(bucket(to), "tests/helpers", from);
  }
  assert.ok(map.size > 150, `expected 150+ moves, got ${map.size}`);
});

test("tests/data and tests/manual do NOT move", () => {
  const map = moveMap();
  for (const from of map.keys()) {
    assert.ok(!from.startsWith("tests/data/"), `${from} must stay`);
    assert.ok(!from.startsWith("tests/manual/"), `${from} must stay`);
  }
});

test("a snapshot directory follows its spec", () => {
  // Playwright resolves snapshot paths relative to the SPEC file, and these are
  // the repo's only golden baselines. A missed move reads as "baseline
  // missing", which --update-snapshots would then silently re-bless.
  const map = moveMap();
  const snap = [...map].filter(([f]) => f.endsWith(".spec.js-snapshots"));
  assert.ok(snap.length >= 1, "no snapshot dir found — has menu-baseline moved?");
  for (const [, to] of snap) assert.equal(path.posix.dirname(to), "tests/specs");
});

test("HISTORY IS NOT REWRITTEN — archive, research records, workflow scripts", () => {
  const bad = textRewrites().filter((r) =>
    /^(docs\/archive\/|docs\/research\/|\.claude\/workflows\/)/.test(r.file));
  assert.deepEqual(bad.map((b) => `${b.file}:${b.line}`), [],
    "the mover would rewrite a historical record, which falsifies it rather than updating it");
});

test("the tool does not rewrite its own description of the move", () => {
  // Its header reads "tests/*.spec.js -> tests/specs/". Rewriting the left side
  // makes it a description of nothing.
  const bad = textRewrites().filter((r) => r.file === "tools/tests-split.mjs");
  assert.deepEqual(bad, []);
});

test("package.json's test:* scripts are the bulk of the string work", () => {
  // Sanity on the scan's aim: if this collapses, the scan has stopped seeing
  // the one file the whole split depends on.
  const pkg = textRewrites().filter((r) => r.file === "package.json");
  assert.ok(pkg.length > 100, `expected 100+ path rewrites in package.json, got ${pkg.length}`);
});

test("import rewrites are derived, and cover the ⚠ swallowed imports", () => {
  // tools/fit-audit.mjs and tools/menu-fit.mjs import ../tests/f1-api-mock.js
  // inside try/catch. Nothing goes red if the move misses them — the tools just
  // quietly audit an empty data hub forever. Nobody has to remember them,
  // because the scan finds them in the tree.
  const rw = importRewrites();
  for (const f of ["tools/fit-audit.mjs", "tools/menu-fit.mjs"]) {
    const hit = rw.find((r) => r.file === f && r.from.includes("f1-api-mock"));
    assert.ok(hit, `${f}'s swallowed import was not planned`);
    assert.equal(hit.to, "../tests/helpers/f1-api-mock.js");
  }
});

test("a spec's ./fixtures.js becomes ../helpers/fixtures.js", () => {
  const rw = importRewrites();
  const hit = rw.find((r) => r.file === "tests/smoke.spec.js" && r.from === "./fixtures.js");
  assert.ok(hit, "smoke.spec.js's fixtures import was not planned");
  assert.equal(hit.newFile, "tests/specs/smoke.spec.js");
  assert.equal(hit.to, "../helpers/fixtures.js");
});

test("a unit suite's ROOT climb deepens by one", () => {
  // ~40 suites resolve ROOT as dirname + "..". At tests/unit/ that is tests/,
  // and every read() against it silently returns the wrong file.
  const rw = importRewrites();
  const hit = rw.find((r) => r.file === "tests/load-order.test.mjs");
  assert.ok(hit, "load-order.test.mjs had no planned rewrite");
  assert.equal(hit.newFile, "tests/unit/load-order.test.mjs");
  assert.ok(hit.to.startsWith("../../"), `expected a ../../ climb, got ${hit.to}`);
});

test("tests/manual keeps its files but fixes its reach into helpers", () => {
  const rw = importRewrites().filter((r) => r.file.startsWith("tests/manual/"));
  assert.ok(rw.length > 0, "manual/ imports helpers and none was planned");
  for (const r of rw) {
    assert.equal(r.newFile, r.file, "a manual/ file must not move");
    assert.ok(r.to.includes("helpers/"), `${r.file}: ${r.to}`);
  }
});

test("the plan is complete — nothing in tests/ or tools/ fails to parse", () => {
  // A parse failure drops a file's references from the plan entirely, which
  // reads as "that file needed nothing".
  const bad = plan().imports.filter((r) => r.parseError);
  assert.deepEqual(bad.map((b) => `${b.file}: ${b.parseError}`), []);
});

test("applying the plan to a scratch tree moves files and fixes the specifier", () => {
  // End-to-end anti-vacuity on the derivation itself: build the smallest tree
  // with the shape that matters — a spec importing a sibling helper — and check
  // the planned specifier is the one that would resolve AFTER the move.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "split-"));
  try {
    fs.mkdirSync(path.join(dir, "tests"), { recursive: true });
    fs.writeFileSync(path.join(dir, "package.json"), "{}\n");
    fs.writeFileSync(path.join(dir, "tests", "fixtures.js"), "export const x = 1;\n");
    fs.writeFileSync(path.join(dir, "tests", "a.spec.js"),
      `import { x } from "./fixtures.js";\n`);
    const map = moveMap(dir);
    assert.equal(map.get("tests/a.spec.js"), "tests/specs/a.spec.js");
    assert.equal(map.get("tests/fixtures.js"), "tests/helpers/fixtures.js");
    const rw = importRewrites(dir, map);
    assert.equal(rw.length, 1);
    assert.equal(rw[0].to, "../helpers/fixtures.js");
    // and that specifier really does resolve from the new location
    const resolved = path.posix.normalize(
      path.posix.join(path.posix.dirname(rw[0].newFile), rw[0].to));
    assert.equal(resolved, "tests/helpers/fixtures.js");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
