/* ship-filter-paths.test.mjs — ci.yml ship-filter reads stage-files.mjs.
 *
 * When pages.yml moved staging to tools/desktop/stage.mjs, the ship-filter's
 * regex over `cp … _site/` went empty and every Pages-train run paid for the
 * four smoke shards (ships=true). The filter must read the shared allow-list
 * and FAIL (not run_all) when that list is empty.
 *
 * Run: node --test tests/unit/ship-filter-paths.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  STAGE_DIRS,
  STAGE_ROOT_FILES,
  stagedNames,
} from "../../tools/desktop/stage-files.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CI = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");
const PAGES = readFileSync(join(ROOT, ".github/workflows/pages.yml"), "utf8");

/** Same emission the ship-filter job uses (sorted names, one per line). */
function emitStagedPathList() {
  const r = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", `
      import { stagedNames } from "./tools/desktop/stage-files.mjs";
      const names = [...stagedNames()].sort();
      if (!names.length) process.exit(1);
      process.stdout.write(names.join("\\n") + "\\n");
    `],
    { cwd: ROOT, encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stderr || r.stdout || "emit failed");
  return r.stdout.trim().split("\n").filter(Boolean);
}

test("stage-files.mjs allow-list is non-empty and has the expected 12 names", () => {
  const names = [...stagedNames()].sort();
  assert.ok(names.length > 0, "stagedNames() must never be empty");
  assert.equal(names.length, 12, `expected 12 staged names, got ${names.length}: ${names.join(",")}`);
  assert.equal(STAGE_ROOT_FILES.length + STAGE_DIRS.length, 12);
  assert.deepEqual(names, [...STAGE_ROOT_FILES, ...STAGE_DIRS].sort());
});

test("ship-filter reads stage-files.mjs and fails loudly on an empty list", () => {
  const ship = (CI.split("\n  ship-filter:")[1] || "").split("\n  smoke:")[0];
  assert.ok(ship, "ship-filter job missing");
  assert.match(ship, /tools\/desktop\/stage-files\.mjs/);
  assert.match(ship, /stagedNames/);
  assert.doesNotMatch(ship, /matchAll\(\/\^\\s\*cp/);
  assert.doesNotMatch(ship, /run_all "could not read the staged path list out of pages\.yml"/);
  // Empty list must exit 1 the job — never fall through to ships=true.
  assert.match(ship, /FATAL:.*empty|staged path list is empty/i);
  assert.match(ship, /exit 1/);
});

test("pages.yml stages via stage.mjs (same allow-list the ship-filter reads)", () => {
  assert.match(PAGES, /tools\/desktop\/stage\.mjs/);
  assert.match(PAGES, /--out _site/);
  assert.doesNotMatch(PAGES, /^\s*cp\s+(?:-r\s+)?\S+\s+_site\/\s*$/m);
});

test("emitted staged path list matches stage-files.mjs (ship-filter / Pages drift)", () => {
  const emitted = emitStagedPathList();
  assert.ok(emitted.length > 0, "emitted list must not be empty");
  assert.equal(emitted.length, 12);
  assert.deepEqual(emitted, [...stagedNames()].sort());
});
