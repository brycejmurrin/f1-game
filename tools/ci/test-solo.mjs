#!/usr/bin/env node
// test-solo — re-run ONE spec (or one grep) alone, on a box that is actually
// @doc Re-runs ONE spec (or `-g` grep) alone at `APEX_WORKERS=1`, refusing to start until the box is quiet (`--max-load`).
// @section runner
// quiet, and refuse to pretend otherwise.
//
// AGENTS.md's standing rule is "a timeout on a busy box measures the machine,
// not the code — re-run that spec ALONE before believing it." That rule was a
// hand-rolled ritual: set APEX_WORKERS=1, eyeball /proc/loadavg, run
// tools/ci/run-playwright.mjs by hand, read the durations by eye. It was executed
// three times in one 2026-08-08 session, and the whole point of the ritual —
// that the box be quiet — is the step easiest to skip when you are in a hurry.
//
// This makes it a command that CANNOT skip that step:
//   1. It reads /proc/loadavg and REFUSES to start until the 1-minute average
//      is below a threshold (default cores/2), so a run started on a hot box —
//      the exact mistake that produces a false timeout — does not happen.
//   2. It runs at APEX_WORKERS=1. One Chromium, one SwiftShader, no contention
//      the run creates on itself.
//   3. It prints the load it ran at next to the verdict, so a PASS that still
//      took ~120 s (the lighting-tuner-grade case: a genuinely undersized
//      budget hiding among contention artefacts) is visible rather than filed
//      as "passed, contention, done".
//
// It does NOT change playwright.config.js's default of 2 local workers. That
// default is a deliberate breadth-vs-decisiveness trade (the second worker
// costs ~1.9x per test, accepted for covering more per wall-clock). This tool
// is the OTHER intent — one spec, decisively — and it deserves its own verb.
//
// Usage:
//   node tools/ci/test-solo.mjs tests/specs/career.spec.js
//   node tools/ci/test-solo.mjs tests/specs/career.spec.js -g "the sheet reports"
//   node tools/ci/test-solo.mjs --max-load 6 tests/specs/career.spec.js   # raise the gate
//   node tools/ci/test-solo.mjs --force tests/specs/career.spec.js        # skip the gate
//
// Exit code is the Playwright run's, so it composes in a script.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CORES = os.cpus().length;

// load1: the kernel's 1-minute load average. On Linux this is /proc/loadavg;
// os.loadavg() reads the same source and is the portable fallback (it returns
// [0,0,0] on Windows, which would defeat the gate — but this repo's box is
// Linux and CI is Linux, so the real number is what we get).
function load1() {
  try {
    return Number.parseFloat(readFileSync("/proc/loadavg", "utf8").split(/\s+/)[0]);
  } catch {
    return os.loadavg()[0];
  }
}

function parseArgs(argv) {
  const out = { force: false, maxLoad: Math.max(2, CORES / 2), rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force") out.force = true;
    else if (a === "--max-load") out.maxLoad = Number.parseFloat(argv[++i]);
    else out.rest.push(a);
  }
  return out;
}

const { force, maxLoad, rest } = parseArgs(process.argv.slice(2));

if (!rest.length || rest.includes("--help") || rest.includes("-h")) {
  console.error("usage: node tools/ci/test-solo.mjs [--force] [--max-load N] <spec.js> [-g <pattern>]");
  process.exit(2);
}

const load = load1();
const busy = load > maxLoad;
console.error(`[test-solo] box: ${CORES} cores, 1-min load ${load.toFixed(2)}, gate ${maxLoad.toFixed(1)}`);

if (busy && !force) {
  console.error(
    `[test-solo] REFUSING to run: load ${load.toFixed(2)} > ${maxLoad.toFixed(1)}.\n` +
    `            A timeout measured now would measure the box, not the code — which is\n` +
    `            the exact false signal this tool exists to prevent. Wait for the box to\n` +
    `            settle, or pass --force if you have a reason (and then do not trust a\n` +
    `            timeout from it).`);
  process.exit(3);
}
if (busy && force) {
  console.error(`[test-solo] --force: running on a hot box (${load.toFixed(2)}). A timeout from this run is NOT trustworthy.`);
}

const started = Date.now();
const runner = path.join(ROOT, "tools", "ci", "run-playwright.mjs");
const child = spawn(process.execPath, [runner, ...rest], {
  cwd: ROOT,
  // APEX_WORKERS=1 is the whole point — one worker, no self-contention.
  env: { ...process.env, APEX_WORKERS: "1" },
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  const endLoad = load1();
  console.error(
    `[test-solo] finished in ${secs}s at load ${endLoad.toFixed(2)} ` +
    `(started ${load.toFixed(2)}) — ${code === 0 ? "PASSED" : "FAILED"}.`);
  if (code === 0) {
    console.error(
      `[test-solo] PASS on a quiet box means a failure under load was contention, not a bug.\n` +
      `            If any test here ran anywhere near the 120 s budget even SOLO, the budget\n` +
      `            is the real problem — raise it with a written reason, do not shrug.`);
  } else {
    console.error(
      `[test-solo] FAIL on a quiet box is REAL. It is not the machine. Bisect it.`);
  }
  if (signal) { process.kill(process.pid, signal); return; }
  process.exit(code == null ? 1 : code);
});
