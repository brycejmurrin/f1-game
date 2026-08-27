// tests-split — the R2 move landed 2026-08-07 (178 moves, 218 files rewritten).
//
// This suite guarded the PLAN before the apply: 150+ moves derived from the
// tree, 100+ package.json rewrites, the ⚠ swallowed imports covered. Those
// assertions described the pre-split tree and went stale the moment --apply
// ran — the planner now correctly derives an EMPTY plan from a split tree, so
// "expected 150+ moves" stopped being a guard and became a fossil.
//
// What is worth pinning post-apply is the inverse pair:
//
//   1. the LIVE tree stays split — the planner finds nothing left to move.
//      A stray spec dropped at tests/ root turns this red, and the fix it
//      names is `node tools/tests-split.mjs --apply`, which files it.
//   2. the DERIVATION still works — proven on scratch trees, so the empty
//      live plan is a fact about the tree rather than a broken scanner.
//      (The first version of the tool had exactly that hazard: it took no
//      root argument, and a scratch-tree run silently found zero references.)
//
// History stays protected: the mover must never rewrite docs/archive/,
// docs/research/ or .claude/workflows/ — those describe the tree as it WAS,
// and rewriting them falsifies a record. That property is pinned on a scratch
// tree below now that the live plan is empty either way.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { moveMap, importRewrites, textRewrites, plan } from "../../tools/tests-split.mjs";

// ─── the live tree ───────────────────────────────────────────────────────────

test("the split is COMPLETE — the planner finds nothing left to move", () => {
  const p = plan();
  // Anti-vacuity anchor on the LIVE tree (the scratch-tree tests below prove
  // the derivation; this proves the walk saw the real tree): a broken walk
  // also returns an empty map, so require the split dirs to actually hold
  // the suite population before trusting "nothing to move".
  const root = new URL("../..", import.meta.url).pathname;
  const liveCount = fs.readdirSync(path.join(root, "tests/unit")).length +
                    fs.readdirSync(path.join(root, "tests/specs")).length;
  assert.ok(liveCount > 200,
    `only ${liveCount} files under tests/unit + tests/specs — the empty plan may be a broken walk`);
  assert.deepEqual([...p.map], [],
    "a test file sits at tests/ root — run `node tools/tests-split.mjs --apply` to file it");
  assert.deepEqual(p.imports.filter((r) => !r.parseError).map((r) => `${r.file}:${r.line} ${r.from}`), [],
    "a relative reference in tests/ or tools/ no longer matches its target's location");
  assert.deepEqual(p.text.map((r) => `${r.file}:${r.line} ${r.from}`), [],
    "a string reference still names a pre-split tests/ path");
});

test("the plan is complete — nothing in tests/ or tools/ fails to parse", () => {
  // A parse failure drops a file's references from the plan entirely, which
  // reads as "that file needed nothing".
  const bad = plan().imports.filter((r) => r.parseError);
  assert.deepEqual(bad.map((b) => `${b.file}: ${b.parseError}`), []);
});

// ─── the derivation, on scratch trees ────────────────────────────────────────

const scratch = (build) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "split-"));
  try { build(dir); } catch (e) { fs.rmSync(dir, { recursive: true, force: true }); throw e; }
  return dir;
};

test("applying the plan to a scratch tree moves files and fixes the specifier", () => {
  // End-to-end anti-vacuity on the derivation itself: build the smallest tree
  // with the shape that matters — a spec importing a sibling helper — and check
  // the planned specifier is the one that would resolve AFTER the move.
  const dir = scratch((d) => {
    fs.mkdirSync(path.join(d, "tests"), { recursive: true });
    fs.writeFileSync(path.join(d, "package.json"), "{}\n");
    fs.writeFileSync(path.join(d, "tests", "fixtures.js"), "export const x = 1;\n");
    fs.writeFileSync(path.join(d, "tests", "a.spec.js"),
      `import { x } from "./fixtures.js";\n`);
  });
  try {
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

test("every bucket routes by extension, and data/ and manual/ stay", () => {
  const dir = scratch((d) => {
    fs.mkdirSync(path.join(d, "tests", "data"), { recursive: true });
    fs.mkdirSync(path.join(d, "tests", "manual"), { recursive: true });
    fs.writeFileSync(path.join(d, "package.json"), "{}\n");
    fs.writeFileSync(path.join(d, "tests", "a.spec.js"), "");
    fs.writeFileSync(path.join(d, "tests", "b.test.mjs"), "");
    fs.writeFileSync(path.join(d, "tests", "c.test.cjs"), "");
    fs.writeFileSync(path.join(d, "tests", "helper.js"), "");
    fs.writeFileSync(path.join(d, "tests", "physics-baseline.json"), "{}\n");
    fs.writeFileSync(path.join(d, "tests", "data", "ref.json"), "{}\n");
    fs.writeFileSync(path.join(d, "tests", "manual", "probe.spec.js"), "");
  });
  try {
    const map = moveMap(dir);
    assert.equal(map.get("tests/a.spec.js"), "tests/specs/a.spec.js");
    assert.equal(map.get("tests/b.test.mjs"), "tests/unit/b.test.mjs");
    assert.equal(map.get("tests/c.test.cjs"), "tests/unit/c.test.cjs");
    assert.equal(map.get("tests/helper.js"), "tests/helpers/helper.js");
    assert.equal(map.get("tests/physics-baseline.json"), "tests/data/physics-baseline.json");
    for (const from of map.keys()) {
      assert.ok(!from.startsWith("tests/data/"), `${from} must stay`);
      assert.ok(!from.startsWith("tests/manual/"), `${from} must stay`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a snapshot directory follows its spec", () => {
  // Playwright resolves snapshot paths relative to the SPEC file, and these are
  // the repo's only golden baselines. A missed move reads as "baseline
  // missing", which --update-snapshots would then silently re-bless. (On the
  // live tree: tests/specs/menu-baseline.spec.js-snapshots sits beside its
  // spec, which the empty live plan above already asserts.)
  const dir = scratch((d) => {
    fs.mkdirSync(path.join(d, "tests", "menu.spec.js-snapshots"), { recursive: true });
    fs.writeFileSync(path.join(d, "package.json"), "{}\n");
    fs.writeFileSync(path.join(d, "tests", "menu.spec.js"), "");
    fs.writeFileSync(path.join(d, "tests", "menu.spec.js-snapshots", "shot.png"), "");
  });
  try {
    const map = moveMap(dir);
    assert.equal(map.get("tests/menu.spec.js-snapshots"), "tests/specs/menu.spec.js-snapshots");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("HISTORY IS NOT REWRITTEN — archive, research records, workflow scripts", () => {
  // The first plan reported 1219 string hits and the biggest contributors were
  // docs/archive/ and the dated audit records — 281 in a single raw workflow
  // dump. Those describe the tree as it WAS; rewriting them falsifies a
  // record. Same reference, two files: only the live doc gets a planned edit.
  const dir = scratch((d) => {
    fs.mkdirSync(path.join(d, "tests"), { recursive: true });
    fs.mkdirSync(path.join(d, "docs", "archive"), { recursive: true });
    fs.writeFileSync(path.join(d, "package.json"), "{}\n");
    fs.writeFileSync(path.join(d, "tests", "a.spec.js"), "");
    fs.writeFileSync(path.join(d, "docs", "LIVE.md"), "run tests/a.spec.js\n");
    fs.writeFileSync(path.join(d, "docs", "archive", "RECORD.md"), "ran tests/a.spec.js\n");
  });
  try {
    const rw = textRewrites(dir, moveMap(dir));
    assert.deepEqual(rw.map((r) => r.file), ["docs/LIVE.md"],
      "the mover must plan the live doc and leave the archived record alone");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
