#!/usr/bin/env node
/**
 * @doc Import-safe GET-only GitHub REST helper (token on stdin, 64 MB buffer) plus the repo constants the CI tools share.
 * @section runner
 * @skill steward
 *
 * Extracted from the retired ready-full-cap.mjs (#3013); importers keep one
 * curl door, and no tool counts ready PRs any more. Retries transient 5xx /
 * 429 the same way ci-watch.mjs does (W18f: shared callers had no backoff).
 */
import { spawnSync } from "node:child_process";
import { githubToken, NO_TOKEN_HINT } from "./github-token.mjs";

export const REPO = "brycejmurrin/f1-game";
export const DEPLOY = "claude/f1-game-project-26h3ng";
export const CI_PATH = ".github/workflows/ci.yml";

/** Backoff before each retry of a 5xx/429 (1 s, 2 s, 4 s), then the error stands. */
export const RETRY_DELAYS_MS = [1000, 2000, 4000];
const defaultSleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function apiOnce(pathQs, { run = spawnSync, env = process.env, gh } = {}) {
  const token = githubToken(gh !== undefined ? { env, gh } : { env });
  if (!token) return { error: NO_TOKEN_HINT };
  const r = run("curl", ["-sS", "--max-time", "30", "-K", "-", "-w", "\n%{http_code}",
    "-H", "Accept: application/vnd.github+json", "-H", "X-GitHub-Api-Version: 2022-11-28",
    "-H", "Cache-Control: no-cache",
    `https://api.github.com/repos/${REPO}/${pathQs}`],
  // maxBuffer: one page of 100 open PRs passed spawnSync's 1 MB default on
  // 2026-10-14 (ENOBUFS, empty stderr → "curl failed"), so every ready flip
  // lost its cap check.
  { encoding: "utf8", maxBuffer: 64 << 20, input: `header = "Authorization: Bearer ${token}"\n` });
  if (r.status !== 0) return { error: (r.stderr || r.error?.code || "curl failed").trim() };
  const out = (r.stdout || "").split("\n");
  const code = Number(out.pop());
  try { return code === 200 ? { json: JSON.parse(out.join("\n")) } : { error: `HTTP ${code}` }; }
  catch { return { error: "bad JSON" }; }
}

/**
 * @param {string} pathQs
 * @param {{ run?: typeof spawnSync, env?: NodeJS.ProcessEnv, gh?: () => string|null, retries?: number[], sleepSync?: (ms: number) => void }} [opts]
 */
export function api(pathQs, opts = {}) {
  const { retries = RETRY_DELAYS_MS, sleepSync: nap = defaultSleepSync } = opts;
  for (let attempt = 0; ; attempt++) {
    const r = apiOnce(pathQs, opts);
    const err = r.error || "";
    const retryable = /^HTTP (429|5\d\d)$/.test(err);
    if (!retryable || attempt >= retries.length) return r;
    nap(retries[attempt]);
  }
}
