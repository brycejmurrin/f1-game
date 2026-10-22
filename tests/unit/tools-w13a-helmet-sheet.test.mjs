/** W13a #3427 — helmet-sheet mkdir -p for nested --out under scratch/renders. */
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const TOOL = join(ROOT, "tools/car/helmet-sheet.mjs");

test("helmet-sheet creates parent dirs for a nested --out under scratch/renders", () => {
  const rel = "panels/w13a-test/nested-helmet.png";
  const out = join(ROOT, "scratch/renders", rel);
  rmSync(dirname(out), { recursive: true, force: true });
  assert.equal(existsSync(dirname(out)), false);

  const r = spawnSync(process.execPath, [TOOL, "--only=44", "--cell=80", "--view=front", `--out=${rel}`], {
    cwd: ROOT, encoding: "utf8", timeout: 60000,
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.ok(existsSync(out), `expected ${out}`);
  assert.ok((r.stdout || "").includes("helmets"), r.stdout);
  rmSync(dirname(out), { recursive: true, force: true });
});
