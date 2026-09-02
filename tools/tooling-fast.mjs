#!/usr/bin/env node
// @doc Sequential runner behind `npm run test:tooling-fast`: one unit file at a time, per-file timing; exports the list.
// @section runner
/**
 * tooling-fast.mjs — run the structural unit suites SEQUENTIALLY with progress.
 *
 * `npm run test:tooling-fast` used to dump ~80 files into one `node --test`
 * invocation, which parallelises by default and floods the terminal. This
 * runner executes one file at a time (`node --test --test-concurrency=1`) and
 * logs start/end/pass/fail/duration for each to stdout and
 * `artifacts/logs/tooling-fast-suite.log`.
 *
 *   node tools/tooling-fast.mjs                  # full suite
 *   node tools/tooling-fast.mjs tests/unit/x…    # subset (same logging)
 *
 * The file list is the source of truth for coverage (test-coverage-audit
 * imports TOOLING_FAST_FILES). Keep package.json as `node tools/tooling-fast.mjs`.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOGDIR = path.join(ROOT, "artifacts/logs");
// NOT "tooling-fast.log": that is the path tools/test-bg.mjs gives the
// tooling-fast GROUP log, and writing the suite summary there truncated the
// group's START header out from under the child's appends.
const LOGFILE = path.join(LOGDIR, "tooling-fast-suite.log");

/** @type {readonly string[]} */
export const TOOLING_FAST_FILES = Object.freeze([
  "tests/unit/ghost.test.mjs",
  "tests/unit/test-coverage-audit.test.mjs",
  "tests/unit/fixture-consumer-audit.test.mjs",
  "tests/unit/quick-validate.test.mjs",
  "tests/unit/track-accuracy-validator.test.mjs",
  "tests/unit/track-foundation.test.mjs",
  "tests/unit/track-maps-corners.test.mjs",
  "tests/unit/track-preview-plan.test.mjs",
  "tests/unit/circuit-axis.test.mjs",
  "tests/unit/circuit-def-fields.test.mjs",
  "tests/unit/backend-surface-parity.test.mjs",
  "tests/unit/godray-keep-nearest.test.mjs",
  "tests/unit/lamp-chunks.test.mjs",
  "tests/unit/all-lights-fill.test.mjs",
  // Both node-only and both under half a second: the catalog LADDER (no paid
  // option dominated by a cheaper one, no row that is never optimal) and the
  // garage's per-vertex MATERIAL column. Neither was in the edit loop, which
  // for the garage one defeats its whole purpose — a dropped material column
  // looks exactly like the bug it guards against.
  "tests/unit/parts-ladder.test.mjs",
  "tests/unit/garage-mesh.test.mjs",
  "tests/unit/curvature-channels.test.mjs",
  "tests/unit/storage-key-prefix.test.mjs",
  "tests/unit/no-bare-console.test.mjs",
  "tests/unit/light-store-cond-layer.test.mjs",
  "tests/unit/scenery-kits.test.mjs",
  "tests/unit/albert-park-foundation.test.mjs",
  "tests/unit/baku-migration.test.mjs",
  "tests/unit/image-grade-shaders.test.mjs",
  "tests/unit/chunked-index-ranges.test.mjs",
  "tests/unit/span-kinds.test.mjs",
  "tests/unit/load-order.test.mjs",
  "tests/unit/global-registry.test.mjs",
  "tests/unit/game-ctx-surface.test.mjs",
  "tests/unit/vstd-invariant.test.mjs",
  "tests/unit/deploy-staging.test.mjs",
  "tests/unit/perf-sentinel.test.mjs",
  "tests/unit/telemetry-trace.test.mjs",
  "tests/unit/data-api-status.test.mjs",
  "tests/unit/scenery-api-contract.test.mjs",
  "tests/unit/floodmast-lamp-register.test.mjs",
  "tests/unit/cdmcp-measure.test.mjs",
  "tests/unit/tools-runnable.test.mjs",
  "tests/unit/css-play.test.mjs",
  "tests/unit/menu-capture.test.mjs",
  "tests/unit/report-server.test.mjs",
  "tests/unit/tinyfish-mcp.test.mjs",
  "tests/unit/probe-mcp.test.mjs",
  "tests/unit/apex-tools-mcp.test.mjs",
  "tests/unit/mcp-smoke.test.mjs",
  "tests/unit/agent-surface.test.mjs",
  "tests/unit/docs-integrity.test.mjs",
  "tests/unit/generated-docs.test.mjs",
  "tests/unit/skill-progressive.test.mjs",
  "tests/unit/component-inventory.test.mjs",
  "tests/unit/sheet-per-screen.test.mjs",
  "tests/unit/css-class-ratchet.test.mjs",
  "tests/unit/test-groups.test.mjs",
  "tests/unit/pick-tests.test.mjs",
  "tests/unit/cache-bump-only.test.mjs",
  "tests/unit/test-observed.test.mjs",
  "tests/unit/evaluate-scope-lint.test.mjs",
  "tests/unit/assert-audit.test.mjs",
  "tests/unit/cross-file-paths.test.mjs",
  "tests/unit/ci-coverage.test.mjs",
  "tests/unit/select-budget.test.mjs",
  "tests/unit/select-specs.test.mjs",
  "tests/unit/tests-split.test.mjs",
  "tests/unit/wait-polling.test.mjs",
  "tests/unit/track-graph.test.mjs",
  "tests/unit/lighting-campaign.test.mjs",
  "tests/unit/assets-pack.test.mjs",
  "tests/unit/import-models.test.mjs",
  "tests/unit/import-models-workflow.test.mjs",
  "tests/unit/css-layers.test.mjs",
  "tests/unit/css-media-disjoint.test.mjs",
  "tests/unit/uilayers-modal-order.test.mjs",
  "tests/unit/module-size.test.mjs",
  "tests/unit/gfx-backend-canary.test.mjs",
  "tests/unit/gfx-debug-overlay.test.mjs",
  "tests/unit/car-presentation-canary.test.mjs",
  "tests/unit/car-wing-foil.test.mjs",
  // ~22 s, the slowest entry here, and deliberately in THIS list rather than
  // test:sweeps: sweeps is skipped by ci.yml when a push cannot move circuit
  // geometry, and a parts-mesh regression is exactly the kind that would then
  // sail through. tooling-fast runs unconditionally in the deploy gate, which is
  // the whole point — the front-wing assertion this file ports sat red on the
  // deploy tip through five consecutive green Pages runs because the browser
  // group that held it is not gated at all.
  "tests/unit/car-mesh-anchors.test.mjs",
  // The three raster/spawn-heavy car files (cockpit-pale-surfaces 69 s,
  // crest-marks 41 s, slider-effect 42 s — 48 % of this loop, measured
  // 2026-09-01) run in test:node-slow: CI guards always, locally when
  // pick-tests names it (js/car/ or tools/slider-effect.mjs).
  "tests/unit/physics-baseline-present.test.mjs",
  "tests/unit/deploy-stamp.test.mjs",
  "tests/unit/deploy-tool.test.mjs",
  // The Node VM game harness (tools/game-vm.cjs): boots js/game.js headless in
  // ~300 ms and reproduces tests/data/physics-baseline.json EXACTLY, so the
  // driving-model gate runs here in seconds rather than in a browser job.
  "tests/unit/game-vm.test.mjs",
  "tests/unit/physics-characterization-vm.test.mjs",
  "tests/unit/webgpu-lifecycle.test.mjs",
  "tests/unit/renderer-soft-lifecycle.test.mjs",
  "tests/unit/shared-math.test.mjs",
  "tests/unit/store-cross-tab.test.mjs",
  "tests/unit/comment-citations.test.mjs",
  "tests/unit/race-control.test.mjs",
  "tests/unit/ai-drive.test.mjs",
  "tests/unit/brake-cue.test.mjs",
  "tests/unit/factory-ai-setup.test.mjs",
  "tests/unit/career-settle.test.mjs",
  "tests/unit/season-cal.test.mjs",
  "tests/unit/incident-gate.test.mjs",
  "tests/unit/debris-step-skip.test.mjs",
  "tests/unit/camera-ride.test.mjs",
  "tests/unit/hooks-documented.test.mjs",
  "tests/unit/source-integrity.test.mjs",
  "tests/unit/scroll-strips.test.mjs",
  "tests/unit/css-comments.test.mjs",
  "tests/unit/css-tokens.test.mjs",
  "tests/unit/css-token-adoption.test.mjs",
  "tests/unit/silent-catch.test.mjs",
  "tests/unit/light-presets.test.mjs",
  "tests/unit/light-store-copy.test.mjs",
  "tests/unit/light-grid.test.mjs",
  "tests/unit/lighting-reapply.test.mjs",
  "tests/unit/lamp-density.test.mjs",
  "tests/unit/lighting-rebuild.test.mjs",
  "tests/unit/lighting-tuner-sweep.test.mjs",
  "tests/unit/perf-governor.test.mjs",
  "tests/unit/terrain-normals.test.mjs",
  "tests/unit/aero-zones-turns.test.mjs",
  "tests/unit/ui-improve-pass.test.mjs",
  "tests/unit/menu-nav-spatial.test.mjs",
  "tests/unit/ui-journey-career.test.mjs",
  "tests/unit/ui-journey-session.test.mjs",
  "tests/unit/ui-journey-race.test.mjs",
  "tests/unit/pause-hud-layout.test.mjs",
  "tests/unit/phone-touch-surface.test.mjs",
  "tests/unit/title-menu-even.test.mjs",
  "tests/unit/change-driver-tools.test.mjs",
  "tests/unit/trim-comments.test.mjs",
  "tests/unit/metrics.test.mjs",
  "tests/unit/perf-try.test.mjs",
]);

const loadavgLine = () => {
  try {
    const [a, b, c] = os.loadavg().map((n) => n.toFixed(2));
    return `loadavg=${a} ${b} ${c}`;
  } catch (_) {
    return "loadavg=?";
  }
};

const fmtDur = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`);

/**
 * Run the structural suites one file at a time.
 * @param {string[]} [files]
 * @param {{ logPath?: string }} [opts]
 * @returns {{ ok: boolean, passed: number, failed: number, results: object[] }}
 */
export function runToolingFast(files = [...TOOLING_FAST_FILES], opts = {}) {
  const logPath = opts.logPath || LOGFILE;
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const lines = [];
  const emit = (msg) => {
    const line = `[tooling-fast] ${msg}`;
    console.log(line);
    lines.push(line);
  };

  const suiteStart = Date.now();
  const startedAt = new Date(suiteStart).toISOString();
  emit(`suite start at=${startedAt} files=${files.length} concurrency=1 ${loadavgLine()}`);

  const results = [];
  let passed = 0;
  let failed = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const n = i + 1;
    const abs = path.isAbsolute(file) ? file : path.join(ROOT, file);
    const rel = path.relative(ROOT, abs);
    const t0 = Date.now();
    emit(`START ${n}/${files.length} ${rel} at=${new Date(t0).toISOString()} ${loadavgLine()}`);

    if (!fs.existsSync(abs)) {
      failed++;
      const dur = Date.now() - t0;
      emit(`FAIL  ${n}/${files.length} ${rel} duration=${fmtDur(dur)} reason=missing-file`);
      results.push({ file: rel, ok: false, durationMs: dur, exit: null, missing: true });
      continue;
    }

    const r = spawnSync(process.execPath, ["--test", "--test-concurrency=1", abs], {
      cwd: ROOT,
      encoding: "utf8",
      env: process.env,
      maxBuffer: 16 * 1024 * 1024,
    });
    const dur = Date.now() - t0;
    const ok = r.status === 0;
    if (ok) passed++; else failed++;
    const verdict = ok ? "PASS" : "FAIL";
    emit(`${verdict}  ${n}/${files.length} ${rel} duration=${fmtDur(dur)} exit=${r.status} ${loadavgLine()}`);
    if (!ok) {
      const text = ((r.stdout || "") + (r.stderr || "")).replace(/\r/g, "");
      const notoks = text.split("\n").filter((L) => /^not ok /.test(L));
      if (notoks.length) {
        emit(`  | failed ${notoks.length} subtest(s):`);
        for (const L of notoks) emit(`  | ${L}`);
      }
      // Assertion bodies sit under each `not ok` TAP block. Keep them short
      // (name/error/expected/actual) so a FAIL is diagnosable without dumping
      // the whole TAP stream into the sequential log.
      const detail = text.split("\n").filter((L) =>
        /^\s+(error:|name: 'AssertionError'|expected:|actual:|operator:)/.test(L));
      for (const L of detail.slice(0, 40)) emit(`  | ${L.trimEnd()}`);
      if (detail.length > 40) emit(`  | … ${detail.length - 40} more assertion lines`);
      if (!notoks.length && !detail.length) {
        const tail = text.trim().split("\n").slice(-20);
        for (const L of tail) emit(`  | ${L}`);
      }
    }
    results.push({ file: rel, ok, durationMs: dur, exit: r.status });
  }

  const suiteDur = Date.now() - suiteStart;
  const ok = failed === 0;
  emit(`suite end at=${new Date().toISOString()} duration=${fmtDur(suiteDur)} ` +
    `passed=${passed} failed=${failed} ${loadavgLine()}`);
  emit(`= run ${ok ? "passed" : "failed"} (${passed} passed, ${failed} failed)`);

  fs.writeFileSync(logPath, lines.join("\n") + "\n");
  return { ok, passed, failed, results, logPath };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const files = args.length ? args : [...TOOLING_FAST_FILES];
  const { ok } = runToolingFast(files);
  process.exit(ok ? 0 : 1);
}
