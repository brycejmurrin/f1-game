// inputs-hash — per-job verdict-cache path sets (#1712).
//
// The declared path set for each tree-only job must cover what that job's
// scripts read; a nightly NO_MEMO=1 run is the auditor for stale skips.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { carSourceFiles } from "../../tools/lib/car-source-vm.mjs";
import {
  JOB_INPUTS, JOB_NAMES, inputsHash, expandInputPaths, coverageReport,
  guardsExpectedPaths, sweepsPartsExpectedPaths,
} from "../../tools/ci/inputs-hash.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CI_YML = fs.readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8");

test("JOB_INPUTS names the tree-only jobs the plan lists", () => {
  assert.deepEqual([...JOB_NAMES].sort(), ["guards", "sweeps-parts"].sort());
  for (const job of JOB_NAMES) {
    assert.ok(Array.isArray(JOB_INPUTS[job]) && JOB_INPUTS[job].length > 0, job);
  }
});

test("guards path set covers what Structural guards / tooling-fast read", () => {
  const report = coverageReport("guards", guardsExpectedPaths());
  assert.equal(report.ok, true, `missing from guards hash: ${report.missing.join(", ")}`);
});

test("sweeps-parts path set covers the parts-census roots (geometry-paths PARTS_ERE)", async () => {
  const report = coverageReport("sweeps-parts", sweepsPartsExpectedPaths());
  assert.equal(report.ok, true, `missing from sweeps-parts hash: ${report.missing.join(", ")}`);
  const { PARTS_ERE, partsFiles } = await import("../../tools/ci/geometry-paths.mjs");
  const ere = PARTS_ERE();
  assert.match(ere, /js\/car\//);
  assert.match(ere, /parts-sweep/);
  assert.deepEqual(partsFiles(), carSourceFiles("parts"), "trigger uses the census default ordered profile");
  const helper = "tools/lib/car-source-vm.mjs";
  assert.ok(new RegExp(ere).test(helper), "profile changes must trigger the census");
  assert.ok(expandInputPaths(JOB_INPUTS["sweeps-parts"]).includes(helper),
    "profile changes must invalidate a cached census verdict");
});

test("inputsHash is stable for the same tree and changes when a declared file changes", () => {
  const a = inputsHash("guards", { root: ROOT, nodeVersion: "v22.0.0-test" });
  const b = inputsHash("guards", { root: ROOT, nodeVersion: "v22.0.0-test" });
  assert.equal(a, b);
  assert.match(a, /^[a-f0-9]{64}$/);
  const otherNode = inputsHash("guards", { root: ROOT, nodeVersion: "v22.0.0-other" });
  assert.notEqual(a, otherNode, "node version is part of the hash");
  const parts = inputsHash("sweeps-parts", { root: ROOT, nodeVersion: "v22.0.0-test" });
  assert.notEqual(a, parts, "different jobs must not share a hash accidentally");
});

test("expandInputPaths walks directories and skips missing leaves", () => {
  const files = expandInputPaths(["package.json", "no/such/path.json", "tools/ci/inputs-hash.mjs"], ROOT);
  assert.ok(files.includes("package.json"));
  assert.ok(files.includes("tools/ci/inputs-hash.mjs"));
  assert.ok(!files.some((f) => f.includes("no/such")));
});

test("ci.yml wires lookup-only verdict cache for guards shards and honours NO_MEMO", () => {
  assert.match(CI_YML, /tools\/ci\/inputs-hash\.mjs guards/);
  assert.match(CI_YML, /lookup-only:\s*true/);
  assert.match(CI_YML, /NO_MEMO:/);
  // Nightly schedule forces NO_MEMO so the auditor always runs the work.
  assert.match(CI_YML, /NO_MEMO: \$\{\{ github\.event_name == 'schedule' && '1' \|\| '' \}\}/);
  // sweeps-parts path set is declared here; ci.yml wiring waits on a follow-up
  // (deploy-tool.test.mjs pins that job's filter `if:` line).
  assert.ok(JOB_INPUTS["sweeps-parts"].length > 0);
  assert.match(CI_YML, /inputs-hash\.mjs sweeps-parts/);
});

// Copy the real owner into a checkout with no game sources. Merely asking for
// inputs must succeed without building a car or evaluating any classic script.
async function withPartsProfile(source, check) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-parts-trigger-"));
  try {
    for (const sub of ["tools/ci", "tools/lib"]) fs.mkdirSync(path.join(dir, sub), { recursive: true });
    fs.copyFileSync(path.join(ROOT, "tools/ci/geometry-paths.mjs"), path.join(dir, "tools/ci/geometry-paths.mjs"));
    fs.writeFileSync(path.join(dir, "tools/manifest.cjs"), 'module.exports = { TRACK_VM: ["js/core/log.js"] };');
    fs.writeFileSync(path.join(dir, "tools/lib/car-source-vm.mjs"), source);
    await check(await import(pathToFileURL(path.join(dir, "tools/ci/geometry-paths.mjs")).href));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test("parts input discovery does not read game files or evaluate a VM", async () => {
  const source = fs.readFileSync(path.join(ROOT, "tools/lib/car-source-vm.mjs"), "utf8");
  await withPartsProfile(source, ({ partsFiles, PARTS_ERE }) => {
    assert.deepEqual(partsFiles(), carSourceFiles("parts"));
    assert.ok(new RegExp(PARTS_ERE()).test("tools/lib/car-source-vm.mjs"));
  });
});

test("parts trigger rejects malformed and partial source profiles rather than silently skipping", async () => {
  for (const value of [null, [], ["js/car/parts.js"],
    ["js/core/log.js", "js/data/teams.js", "js/car/parts.js", null],
    ["js/core/log.js", "js/data/teams.js", "js/car/parts.js", "js/car/parts.js"]]) {
    await withPartsProfile(`export const carSourceFiles = () => ${JSON.stringify(value)};`,
      ({ partsFiles, PARTS_ERE }) => {
        assert.throws(partsFiles, /invalid or partial car source profile/);
        assert.throws(PARTS_ERE, /invalid or partial car source profile/);
      });
  }
});


test("changing only the car profile invalidates the parts verdict cache", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-parts-hash-"));
  try {
    fs.mkdirSync(path.join(dir, "tools/lib"), { recursive: true });
    const helper = path.join(dir, "tools/lib/car-source-vm.mjs");
    fs.writeFileSync(helper, "// profile revision one");
    const before = inputsHash("sweeps-parts", { root: dir });
    fs.writeFileSync(helper, "// profile revision two");
    assert.notEqual(inputsHash("sweeps-parts", { root: dir }), before);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});


test("changing only a shared unit helper invalidates the guards verdict cache", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-helper-hash-"));
  try {
    fs.mkdirSync(path.join(dir, "tests", "helpers"), { recursive: true });
    const helper = path.join(dir, "tests", "helpers", "shared-fixture.mjs");
    fs.writeFileSync(helper, "export const fixtureValue = 1;");
    const before = inputsHash("guards", { root: dir });
    fs.writeFileSync(helper, "export const fixtureValue = 2;");
    assert.notEqual(inputsHash("guards", { root: dir }), before,
      "a helper implementation change must not reuse a cached tooling verdict");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
