// changed-files.test.mjs — selection sees BOTH ends of a rename (ledger M36, 2026-10-09).
//
// `git diff --name-only` lists a moved file's destination only, so a source
// file moved out of js/circuits/ or js/track/ never fired the old directory's
// rules. tools/lib/changed-files.mjs reads --name-status and returns the
// rename/copy source too; select-specs, node-plan and pick-unit-slices use it.
//
// Run: node --test tests/unit/changed-files.test.mjs   (npm run test:tooling-fast)
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseNameStatusZ, changedPaths } from "../../tools/lib/changed-files.mjs";
import { pick } from "../../tools/ci/pick-unit-slices.mjs";

test("parseNameStatusZ reads plain statuses and both ends of R and C records", () => {
  const z = (...f) => f.join("\0") + "\0";
  assert.deepEqual(parseNameStatusZ(z("M", "a.js", "A", "b.js", "D", "c.js", "T", "d.js")), ["a.js", "b.js", "c.js", "d.js"]);
  assert.deepEqual(parseNameStatusZ(z("R100", "js/circuits/cota.js", "docs/PHYSICS.md", "M", "e.js")), ["js/circuits/cota.js", "docs/PHYSICS.md", "e.js"]);
  assert.deepEqual(parseNameStatusZ(z("C075", "old.js", "copy.js")), ["old.js", "copy.js"]);
  assert.deepEqual(parseNameStatusZ(z("M", "a b\tc.js")), ["a b\tc.js"], "-z keeps odd names whole");
  assert.deepEqual(parseNameStatusZ(z("M", "a.js", "M", "a.js")), ["a.js"], "unique");
  assert.deepEqual(parseNameStatusZ(""), []);
});

test("a real rename lists its source, and the circuit rules fire on it", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-rename-"));
  const g = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8", stdio: "pipe" }).trim();
  try {
    g("init", "-q"); g("config", "user.email", "t@t"); g("config", "user.name", "t");
    fs.mkdirSync(path.join(dir, "js/circuits"), { recursive: true }); fs.mkdirSync(path.join(dir, "docs"), { recursive: true });
    fs.writeFileSync(path.join(dir, "js/circuits/cota.js"), "// a circuit with enough body to be detected as a rename\n".repeat(20));
    g("add", "-A"); g("commit", "-qm", "base");
    g("mv", "js/circuits/cota.js", "docs/PHYSICS.md");
    g("commit", "-qam", "moved out of js/circuits");
    const withRenames = g("diff", "--name-only", "HEAD~1").split("\n");
    assert.deepEqual(withRenames, ["docs/PHYSICS.md"], "premise: --name-only loses the source");
    const paths = changedPaths(["HEAD~1"], { cwd: dir });
    assert.deepEqual(paths.sort(), ["docs/PHYSICS.md", "js/circuits/cota.js"]);
    // …which is what lets the directory's rules fire (the circuit slices) for a file that left it
    const slices = new Set(pick(paths).slices.keys());
    assert.ok(slices.has("vm-a1") && slices.has("page"), [...slices].join(","));
    assert.ok(!new Set(pick(["docs/PHYSICS.md"]).slices.keys()).has("vm-a1"), "the destination alone routed docs-only");
  } finally { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});
