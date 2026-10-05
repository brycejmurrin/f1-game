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
  ["tools/track/audit-circuit.cjs", /audit-circuit/],
  ["tools/check/ai-pace.mjs", /ai-pace/],
  ["tools/check/ai-field.mjs", /ai-field/],
  ["tools/check/ai-line.mjs", /ai-line/],
  ["tools/check/ai-human.mjs", /ai-human/],
  ["tools/check/player-dyn.mjs", /player-dyn/],
  ["tools/check/physics-tune-sweep.mjs", /physics-tune-sweep/],
  ["tools/car/career-economy.mjs", /career-economy/],
  // 2026-10-05 skill test-drive: four subagents booted Chromium by running
  // `apex-eval --help` (it took --help as a track id); the rest answered --help
  // with a poll, a default run, a stack trace or exit 1.
  ["tools/shot/apex-eval.mjs", /apex-eval/],
  ["tools/car/render-car.mjs", /render-car/],
  ["tools/car/spine-station.mjs", /spine-station/],
  ["tools/check/check-physics.mjs", /check-physics/],
  ["tools/check/vstd-lint.mjs", /vstd-lint/],
  ["tools/ci/ci-watch.mjs", /ci-watch/],
  ["tools/ci/bump-cache.mjs", /bump-cache/],
  ["tools/ci/test-solo.mjs", /test-solo/],
  ["tools/track/verify-track.cjs", /verify-track/],
  ["tools/track/float-audit.cjs", /float-audit/],
  // Round 2 (same day): shot.mjs, livery-contrast, rtc-e2e and glx-call-census
  // booted Chromium (or ran a 2-minute sweep) on --help in the improvement
  // drive; graph-parity printed "nothing to compare"; gen-shell took an
  // unknown flag as WRITE mode.
  ["tools/shot/shot.mjs", /shot\.mjs/],
  ["tools/car/livery-contrast.mjs", /livery-contrast/],
  ["tools/net/rtc-e2e.mjs", /rtc-e2e/],
  ["tools/track/graph-parity.cjs", /graph-parity/],
  ["tools/gfx/glx-call-census.mjs", /glx-call-census/],
  ["tools/gen/gen-shell.mjs", /gen-shell/],
];

test("gen-shell.mjs refuses an unknown flag instead of writing", () => {
  const r = spawnSync(process.execPath, ["tools/gen/gen-shell.mjs", "--bogus"], { cwd: ROOT, encoding: "utf8", timeout: 20000 });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /unknown argument --bogus/);
  assert.doesNotMatch(r.stdout, /written|unchanged/);
});

for (const [rel, want] of CASES) {
  test(`${path.basename(rel)} --help exits 0 before work`, () => {
    const r = spawnSync(process.execPath, [rel, "--help"], {
      cwd: ROOT, encoding: "utf8", timeout: 10000,
    });
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.match(r.stdout, want);
  });
}
