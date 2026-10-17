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
  ["tools/check/ai-stuck.mjs", /ai-stuck/],
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

// #1708: the remaining tools/car and tools/gfx content CLIs (the issue's own
// `grep -L 'cli-args\|help'` check named them) plus two tools/track probes.
// Six of these launch Chromium or a full 40-circuit build when run, so --help
// must print a usage line and exit 0 fast, and a typo'd flag must be REFUSED
// through tools/lib/cli-args.mjs (audit-aero forwards to render-car, whose
// own flag set refuses it) — never ignored on the way to a full run.
const PARSED = [
  "tools/car/audit-aero.mjs",
  "tools/car/audit-parts.mjs",
  "tools/car/cockpit-pale-sweep.mjs",
  "tools/car/crest-sweep.mjs",
  "tools/car/logo-authored-sweep.mjs",
  "tools/car/trace-logo.mjs",
  "tools/gfx/batch-visible-probe.mjs",
  "tools/gfx/chunk-reach.cjs",
  "tools/gfx/chunk-share-census.mjs",
  "tools/gfx/frame-hitch.mjs",
  "tools/gfx/road-lut-census.mjs",
  "tools/gfx/tlx-pack-check.cjs",
  "tools/track/track-verts.cjs",
  "tools/track/startline-probe.cjs",
];
// Measured 2026-10-15: every --help above returns in < 1 s idle; 10 s is the
// "launched nothing" bar (a Chromium boot or a 40-circuit build takes longer).
const FAST_MS = 10000;
const runFast = (rel, flag) => {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [rel, flag], { cwd: ROOT, encoding: "utf8", timeout: FAST_MS, killSignal: "SIGKILL" });
  return { ...r, ms: Date.now() - t0 };
};

for (const rel of PARSED) {
  const base = path.basename(rel);
  test(`${base} --help prints usage and exits 0 without launching (#1708)`, () => {
    const r = runFast(rel, "--help");
    assert.equal(r.error, undefined, `${base} --help did not return within ${FAST_MS} ms (${r.error && r.error.code})`);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.match(r.stdout, new RegExp(`^usage: node ${rel.replace(/\./g, "\\.")}`, "m"));
    assert.ok(r.ms < FAST_MS, `${base} --help took ${r.ms} ms`);
  });
  test(`${base} --no-such-flag exits non-zero before work (#1708)`, () => {
    const r = runFast(rel, "--no-such-flag");
    assert.equal(r.error, undefined, `${base} --no-such-flag did not return within ${FAST_MS} ms (${r.error && r.error.code})`);
    assert.notEqual(r.status, 0, r.stdout);
    assert.match(r.stderr, /unknown flag --no-such-flag/);
  });
}

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
