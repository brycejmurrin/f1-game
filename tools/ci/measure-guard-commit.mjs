#!/usr/bin/env node
/**
 * @doc Measure commit-guard wall time vs a direct test:guards run (#2647).
 * @skill check-changes
 *
 *   node tools/ci/measure-guard-commit.mjs
 *   node tools/ci/measure-guard-commit.mjs --json
 *
 * Read-only: spawns npm/node under the repo root; prints one `= measure-guard …` line.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { exitIfHelp } from "../lib/cli-args.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readLoadavg() {
  try {
    const line = fs.readFileSync("/proc/loadavg", "utf8").trim();
    const [l1, l5, l15] = line.split(/\s+/).map(Number);
    return { raw: line, l1, l5, l15, loaded: l1 >= 3 };
  } catch {
    return { raw: null, l1: null, l5: null, l15: null, loaded: false };
  }
}

function wall(cmd, args, opts = {}) {
  const t0 = Date.now();
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", env: { ...process.env, ...opts.env } });
  return { ms: Date.now() - t0, status: r.status, signal: r.signal };
}

/** @param {number[]} xs */
export function median(xs) {
  const a = xs.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export function measureGuardCommit({ runs = 2 } = {}) {
  const load = readLoadavg();
  const guardRuns = [];
  const hookPathRuns = [];
  for (let i = 0; i < runs; i++) {
    guardRuns.push(wall("npm", ["run", "--silent", "test:guards"]).ms);
    hookPathRuns.push(wall("bash", ["-lc", "node tools/check/ratchets.mjs --auto-raise >/dev/null && npm run --silent test:guards"]).ms);
  }
  const hookSrc = fs.readFileSync(path.join(ROOT, ".claude/hooks/bash-guard.sh"), "utf8");
  const fanOutMitigation = /pre-commit-guards\.lock/.test(hookSrc) && /write-tree/.test(hookSrc);
  const innerCap = Number(hookSrc.match(/APEX_GUARD_TIMEOUT:-(\d+)/)?.[1] || 160);
  return {
    at: new Date().toISOString(),
    loadavg: load,
    innerCapSec: innerCap,
    loadedCapSec: load.loaded ? 300 : innerCap,
    directGuardsMs: { samples: guardRuns, medianMs: median(guardRuns) },
    hookPathMs: { samples: hookPathRuns, medianMs: median(hookPathRuns) },
    fanOutMitigation,
    note: fanOutMitigation
      ? "bash-guard.sh queues on artifacts/pre-commit-guards.lock and reuses a green write-tree verdict (2026-10-17 #2685); duplicate PreToolUse filters were the measured overrun vs a lone test:guards."
      : "no flock/write-tree cache in bash-guard.sh",
  };
}

function reportLine(v) {
  const d = v.directGuardsMs.medianMs;
  const h = v.hookPathMs.medianMs;
  return `= measure-guard direct_median=${d == null ? "?" : Math.round(d)}ms hook_path_median=${h == null ? "?" : Math.round(h)}ms load1=${v.loadavg.l1 ?? "?"} fan_out_fix=${v.fanOutMitigation}`;
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  const argv = process.argv.slice(2);
  exitIfHelp(argv, `usage: node tools/ci/measure-guard-commit.mjs [--json] [--runs N]`);
  const json = argv.includes("--json");
  const runsArg = argv.find((a, i) => argv[i - 1] === "--runs");
  const v = measureGuardCommit({ runs: runsArg ? Math.max(1, Number(runsArg) || 2) : 2 });
  if (json) console.log(JSON.stringify(v, null, 2));
  else console.log(reportLine(v));
}
