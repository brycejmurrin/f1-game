// pick-tests — the SELECTOR's own contract.
//
// tests/unit/test-groups.test.mjs already asserts every group pick-tests names
// exists in package.json. That is the output vocabulary. What was unguarded is
// everything upstream of it: how the tool decides WHICH FILES changed, and the
// shape of the machine-readable answer CI is meant to consume.
//
// Both had already failed silently. `--since <ref>` swallowed the ref as an
// explicit path, so it reported the literal string "HEAD~3" as the only changed
// file and printed "nothing to run" — for any diff, forever — while the
// change-aware CI design in docs/archive/research/TEST-AUDIT-2026-08.md §3 was written
// on top of it. A selector that wrongly says "run nothing" is the one failure
// mode that ships regressions, so it gets a test.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEPLOY_BRANCH } from "../../tools/pick-tests.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const run = (...args) =>
  execFileSync("node", ["tools/pick-tests.mjs", "--json", ...args],
               { cwd: ROOT, encoding: "utf8" });
const json = (...args) => JSON.parse(run(...args));

test("--json reports a reason CI can branch on, not prose", () => {
  const r = json("js/game/hud.js");
  assert.equal(r.reason, "matched");
  assert.ok(Array.isArray(r.files) && Array.isArray(r.groups));
  for (const g of r.groups) {
    assert.equal(typeof g.group, "string");
    assert.equal(g.script, `test:${g.group}`);
    assert.equal(typeof g.because, "string");
  }
});

test("a file no rule claims reports 'unmatched', not an empty success", () => {
  // The distinction CI depends on: "nothing changed, run nothing" and "things
  // changed but I cannot route them, run EVERYTHING" are opposite instructions
  // and the prose output renders both as a sentence.
  const r = json("spike/README.md");
  assert.equal(r.reason, "unmatched");
  assert.deepEqual(r.groups, []);
});

test("--since takes a REF, and does not read it as a path", () => {
  // The regression this pins. Before the fix `files` was ["HEAD"] — the ref
  // itself — and `reason` was "unmatched", i.e. "nothing to run" for a diff
  // that certainly had files in it.
  //
  // HEAD, not HEAD~1: CI's guards job checks out SHALLOW (`actions/checkout@v4`
  // with no fetch-depth), where HEAD~1 does not exist and git fails with
  // "ambiguous argument". HEAD resolves in every clone and pins the same
  // property — the ref must not end up in the FILE list.
  const r = json("--since", "HEAD");
  assert.ok(!r.files.includes("HEAD"), "the ref leaked into the file list");
  const real = execFileSync("git", ["diff", "--name-only", "HEAD"],
                            { cwd: ROOT, encoding: "utf8" }).trim();
  const expected = real ? real.split("\n").filter(Boolean) : [];
  assert.deepEqual(r.files.slice().sort(), expected.slice().sort());
});

test("explicit paths still win over every other mode", () => {
  const r = json("js/car/parts.js");
  assert.deepEqual(r.files, ["js/car/parts.js"]);
});

test("the default diff base is the DEPLOY branch, which pages.yml names", () => {
  // main is a stale diverged fork here, so merge-basing against it returns an
  // ancient commit and the changed-file set balloons to most of the repo —
  // the tool giving up silently, dressed as an answer. Asserting the constant
  // against pages.yml is what keeps the two from drifting apart.
  const yml = fs.readFileSync(path.join(ROOT, ".github/workflows/pages.yml"), "utf8");
  const m = yml.match(/branches:\s*\[\s*([^\]\s]+)\s*\]/);
  assert.ok(m, "pages.yml no longer declares a deploy branch in the expected form");
  assert.equal(DEPLOY_BRANCH, m[1],
    "tools/pick-tests.mjs DEPLOY_BRANCH disagrees with .github/workflows/pages.yml");
});
