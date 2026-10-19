#!/usr/bin/env node
// live-run-check.mjs — advisory WARN when git push would cancel a live ci.yml run.
// @doc Prints WARN if this branch has in-progress ci.yml runs (3 s API lookup); exit 0 always.
// Full description: the third waste detector from measurement.md / #1714. bash-guard.sh
// (FORBIDDEN here; #2899) will wire this on `git push`; until then agents and tests call
// it directly. Lifted from verify-change.mjs's liveCiRuns (proxyFetch, 3 s cap, ci.yml
// path filter). Advisory only — never blocks. Refs #1714; bash-guard wiring is a follow-up.
// @skill check-changes
//
//   node tools/ci/live-run-check.mjs           # print WARN line(s) or nothing
//   node tools/ci/live-run-check.mjs --json    # { branch, runs, warn }
//   node tools/ci/live-run-check.mjs --help
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { proxyFetch } from "../lib/proxy-fetch.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const defaultGit = (args, { cwd = ROOT } = {}) => {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  return r.status === 0 ? String(r.stdout || "").trim() : "";
};

/**
 * Look up in-progress Actions runs on the current branch and keep only ci.yml.
 * Best-effort, unauthenticated-capable (public repo), 3 s cap, null on any failure.
 *
 * @param {{ git?: Function, fetch?: Function, timeoutMs?: number, cwd?: string, userAgent?: string }} [opts]
 * @returns {Promise<null | { branch: string, runs: Array<{ id: number, sha: string, url: string, path?: string }> }>}
 */
export async function liveCiRuns({
  git = defaultGit,
  fetch = proxyFetch,
  timeoutMs = 3000,
  cwd = ROOT,
  userAgent = "apex26-live-run-check",
} = {}) {
  try {
    const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], { cwd });
    const url = git(["remote", "get-url", "origin"], { cwd });
    const m = String(url).match(/github\.com[:/]([^/]+\/[^/.]+)/);
    if (!m || !branch || branch === "HEAD") return null;
    const api = `https://api.github.com/repos/${m[1]}/actions/runs?branch=${encodeURIComponent(branch)}&status=in_progress&per_page=5`;
    const res = await fetch(api, {
      signal: AbortSignal.timeout(timeoutMs),
      timeoutMs,
      headers: { Accept: "application/vnd.github+json", "User-Agent": userAgent },
    });
    if (!res || !res.ok) return null;
    const body = typeof res.json === "function" ? await res.json() : res;
    const runs = ((body && body.workflow_runs) || [])
      .filter((r) => /ci\.yml$/.test(r.path || ""))
      .map((r) => ({
        id: r.id,
        sha: String(r.head_sha || "").slice(0, 8),
        url: r.html_url || "",
        path: r.path || "",
      }));
    return { branch, runs };
  } catch (_) {
    return null;
  }
}

/** The advisory WARN line for N live ci.yml runs (measurement.md wording). */
export function warnLine(count, branch) {
  const n = Number(count) || 0;
  if (n <= 0) return null;
  const where = branch ? ` on ${branch}` : "";
  return `WARN: ${n} live ci.yml run${n === 1 ? "" : "s"}${where} — this push cancels them and loses their failures.`;
}

/** Format a liveCiRuns result into a warn string (or null). */
export function formatWarn(live) {
  if (!live || !live.runs || !live.runs.length) return null;
  return warnLine(live.runs.length, live.branch);
}

/** Run the check; returns { live, warn }. Never throws. */
export async function checkLiveRun(opts = {}) {
  const live = await liveCiRuns(opts);
  return { live, warn: formatWarn(live) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: node tools/ci/live-run-check.mjs [--json]
  Advisory: print WARN when this branch has in-progress ci.yml runs (3 s API lookup).
  Exit 0 always. Wire from bash-guard on git push (Refs #1714 / #2899).`);
    process.exit(0);
  }
  const { live, warn } = await checkLiveRun();
  if (argv.includes("--json")) {
    console.log(JSON.stringify({
      branch: live?.branch || null,
      runs: live?.runs || [],
      warn: warn || null,
    }, null, 2));
  } else if (warn) {
    console.log(warn);
  }
  process.exit(0);
}
