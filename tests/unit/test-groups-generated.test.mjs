// test-groups-generated.test.mjs — tests/groups.json is the ONE definition of
// a test group: package.json's `test:*` scripts and tooling-fast's file list
// are generated from it, and this fails the moment either drifts.
//
// Before this, a new group was three coordinated edits (a package.json script,
// the TOOLING_FAST_FILES array, a docs/TESTING.md row) and forgetting one
// failed nothing at the time — the coverage audit noticed later, or nobody did.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadGroups, commandFor, filesOnly } from "../../tools/gen/gen-test-groups.mjs";
import { TOOLING_FAST_FILES } from "../../tools/ci/tooling-fast.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const doc = loadGroups();

test("package.json and the tooling-fast list match tests/groups.json", () => {
  const r = spawnSync("node", ["tools/gen/gen-test-groups.mjs", "--check"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, `generated files are stale — run \`node tools/gen/gen-test-groups.mjs\`\n${r.stdout}${r.stderr}`);
});

test("every test:* script is a group, and every group is a script", () => {
  const scripts = Object.keys(pkg.scripts).filter((s) => s.startsWith("test")).sort();
  assert.deepEqual(scripts, Object.keys(doc.groups).sort(),
    "a test script with no groups.json entry (or the reverse) is exactly the drift this file exists to catch");
});

test("each group's command is the one its definition renders", () => {
  for (const [name, def] of Object.entries(doc.groups)) {
    assert.equal(pkg.scripts[name], commandFor(def), `${name} was hand-edited in package.json — edit tests/groups.json instead`);
  }
});

test("no group is left naming nothing", () => {
  // `node --test` with no file arguments EXITS 1. A group whose whole subject
  // moved away (test:webgpu-lifecycle, when WGX left for spike/backends/ on
  // 2026-09-03) becomes exactly that, and the fast gate does not run npm
  // groups — so it sailed through here and failed in the Pages gate instead,
  // several minutes into a deploy. Delete the group or give it files.
  // Only NODE groups: `node --test` with no paths exits 1, while a browser
  // group with no paths is the deliberate "let Playwright discover every spec"
  // shape that `test`, `test:update`, `test:render` and `test:headless` use.
  const empty = Object.entries(doc.groups)
    .filter(([, def]) => def.kind === "node" && (def.files || []).length === 0)
    .map(([name]) => name);
  assert.deepEqual(empty, [], "a node group with no files runs nothing and exits non-zero");
});

test("every file a group names exists on disk", () => {
  const missing = [];
  for (const [name, def] of Object.entries(doc.groups)) {
    for (const f of def.files || []) {
      if (f.includes("*")) continue; // a glob the runner expands
      if (!fs.existsSync(path.join(ROOT, f))) missing.push(`${name}: ${f}`);
    }
  }
  assert.deepEqual(missing, [], "a group naming a file that does not exist runs silently short");
});

test("toolingFast notes are comments, and the exported array is files only", () => {
  const entries = doc.toolingFast;
  assert.ok(entries.some((e) => e.startsWith("//")), "the notes explaining why a file is in the edit loop live in groups.json");
  assert.deepEqual(filesOnly(entries), [...TOOLING_FAST_FILES],
    "the runtime array must be the file entries alone — a note leaking into it would be run as a test path");
  for (const f of filesOnly(entries)) {
    assert.ok(fs.existsSync(path.join(ROOT, f)), `tooling-fast names ${f}, which does not exist`);
  }
});
