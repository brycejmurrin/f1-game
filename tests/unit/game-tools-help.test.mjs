/* game-tools-help.test.mjs — expensive game-systems CLIs must answer --help
 * without booting the VM / Chromium. Measured 2026-10-01: --help on
 * physics-tune-sweep, player-dyn, career-economy and several ai-* tools
 * silently ran the full measurement.
 *
 * Run: node --test tests/unit/game-tools-help.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const CASES = [
  ["tools/check/ai-pace.mjs", /ai-pace/],
  ["tools/check/ai-field.mjs", /ai-field/],
  ["tools/check/ai-line.mjs", /ai-line/],
  ["tools/check/ai-human.mjs", /ai-human/],
  ["tools/check/player-dyn.mjs", /player-dyn/],
  ["tools/check/physics-tune-sweep.mjs", /physics-tune-sweep/],
  ["tools/car/career-economy.mjs", /career-economy/],
];

for (const [rel, want] of CASES) {
  test(`${path.basename(rel)} --help exits 0 before work`, () => {
    const r = spawnSync(process.execPath, [rel, "--help"], {
      cwd: ROOT, encoding: "utf8", timeout: 10000,
    });
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.match(r.stdout, want);
  });
}
