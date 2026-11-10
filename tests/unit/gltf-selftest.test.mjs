// GLB LOADER SELF-TEST, run by node --test. tools/gfx/gltf-selftest.mjs is the
// only check of js/render/shared/gltf.js's mirrored-node winding swap (a node
// with an odd number of negative scale axes must swap index 2/3 of every
// triangle, or its faces render inside out), and until 2026-11-10 nothing ran
// it. This runs it green on the shipped loader, then on a COPY with the swap
// disabled and requires a red — so the self-test is proven to see the bug it
// exists for. The copy lives under artifacts/ and js/ is never written.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SELFTEST = path.join(ROOT, "tools/gfx/gltf-selftest.mjs");
const LOADER = path.join(ROOT, createRequire(import.meta.url)("../../tools/manifest.cjs").PATHS.GLTF);

const run = (env = {}) => spawnSync(process.execPath, [SELFTEST],
  { cwd: ROOT, encoding: "utf8", timeout: 60000, env: { ...process.env, ...env } });

test("gltf-selftest passes on the shipped loader", () => {
  const r = run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /ALL TESTS PASSED/);
  assert.doesNotMatch(r.stdout, /\bFAIL\b/);
});

test("gltf-selftest goes red when the mirrored-node winding swap is removed", () => {
  const src = fs.readFileSync(LOADER, "utf8");
  const GUARD = "if (mirrored) {";
  assert.equal(src.split(GUARD).length - 1, 1, `expected exactly one \`${GUARD}\` in ${path.relative(ROOT, LOADER)}`);
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "gltf-selftest-"));
  try {
    const mutant = path.join(dir, "gltf.mutant.js");
    fs.writeFileSync(mutant, src.replace(GUARD, "if (false && mirrored) {"));
    const r = run({ APEX_GLTF_SELFTEST_SRC: mutant });
    assert.equal(r.status, 1, "the self-test must exit 1 on the mutant:\n" + r.stdout + r.stderr);
    assert.match(r.stdout, /FAIL {2}winding swapped to \[0,2,1\]/);
    assert.match(r.stdout, /FAIL {2}negative opts\.scale swaps winding/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.equal(fs.readFileSync(LOADER, "utf8"), src, "js/ is untouched");
});
