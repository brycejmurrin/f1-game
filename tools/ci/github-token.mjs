#!/usr/bin/env node
/**
 * @doc Resolve a GitHub token for read-only Actions tools: env first, then `gh auth token`.
 * @section runner
 * @skill check-changes
 *
 * Cloud agent / Cursor boxes often have `gh` authenticated but no
 * `GH_TOKEN`/`GITHUB_TOKEN` in the environment. ci-watch and remote-group then
 * reported `no GH_TOKEN / GITHUB_TOKEN` even though `gh api` worked. Prefer the
 * env (CI Actions injects GITHUB_TOKEN); fall back to `gh auth token` once.
 *
 * Never log the token. Never put it in argv (callers still send it via curl -K).
 *
 *   import { githubToken } from "./github-token.mjs";
 *   const token = githubToken(); // string | null
 */
import { spawnSync } from "node:child_process";

/** @returns {string|null} */
function ghAuthToken() {
  try {
    const r = spawnSync("gh", ["auth", "token"], {
      encoding: "utf8",
      timeout: 8000,
      // Windows: avoid flashing a console; harmless elsewhere.
      windowsHide: true,
    });
    if (r.status !== 0) return null;
    const t = String(r.stdout || "").trim();
    return t || null;
  } catch {
    return null;
  }
}

/**
 * @param {{ env?: NodeJS.ProcessEnv, gh?: () => string|null }} [opts]
 * @returns {string|null}
 */
export function githubToken(opts = {}) {
  const env = opts.env || process.env;
  const fromEnv = env.GH_TOKEN || env.GITHUB_TOKEN;
  if (fromEnv) return String(fromEnv);
  const gh = typeof opts.gh === "function" ? opts.gh : ghAuthToken;
  return gh() || null;
}

export const NO_TOKEN_HINT =
  "no GH_TOKEN / GITHUB_TOKEN (export one, or run: gh auth login)";
