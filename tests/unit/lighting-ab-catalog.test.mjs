// lighting-ab-catalog — every knob in tools/lighting/ab-lighting.mjs must match its source file
// EXACTLY ONCE. Retuning or renaming a lighting constant without updating the catalog fails
// here, so the offline A/B harness can never silently rot. Node-only, so it lives in the unit
// tier (it used to ride the browser spec tests/specs/lighting-ab.spec.js, which paid a Chromium
// worker for a file scan).
//
// Run: node --test tests/unit/lighting-ab-catalog.test.mjs   (npm run test:tooling-fast)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { KNOBS, FREEZE_FLICKER, FREEZE_FLICKER_FILE } from "../../tools/lighting/ab-lighting.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const at = (rel) => join(ROOT, rel);

test("A/B knob catalog matches the source exactly (1 hit per knob)", () => {
  assert.ok(KNOBS.length > 5, `only ${KNOBS.length} catalog knobs — the import broke`);
  const srcCache = {};
  const problems = [];
  for (const k of KNOBS) {
    const src = srcCache[k.file] || (srcCache[k.file] = readFileSync(at(k.file), "utf8"));
    const n = src.split(k.find).length - 1;
    if (n !== 1) problems.push(`${k.id}: "${k.find.slice(0, 60)}..." found ${n}x in ${k.file}`);
    if (k.find === k.b) problems.push(`${k.id}: A and B are identical`);
  }
  // The flicker-freeze patch is applied with a silent .includes() guard in the
  // variant server — a stale string just stops freezing (noisy night A/Bs)
  // without any error, so it must be pinned here like the knobs.
  const ff = srcCache[FREEZE_FLICKER_FILE] || readFileSync(at(FREEZE_FLICKER_FILE), "utf8");
  const nFF = ff.split(FREEZE_FLICKER[0]).length - 1;
  if (nFF !== 1) problems.push(`FREEZE_FLICKER: "${FREEZE_FLICKER[0].slice(0, 60)}..." found ${nFF}x in ${FREEZE_FLICKER_FILE}`);
  assert.deepEqual(problems, [], problems.join("\n"));
});
