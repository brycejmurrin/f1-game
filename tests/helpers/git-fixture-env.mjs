// tests/helpers/git-fixture-env.mjs — keep fixture git away from the CALLER's
// repository (issue #1807). Importing this module removes every
// repository-local GIT_* variable from process.env, so git and every tool or
// hook a test spawns (all inherit process.env) find their repo from `cwd`.
//
// Why: a git hook runs with those variables exported. Measured with git 2.43:
// a pre-commit hook in a linked worktree (every .claude/worktrees/ agent) sees
// an absolute GIT_DIR and GIT_INDEX_FILE, and `git commit -a` / `git commit
// <path>` point GIT_INDEX_FILE at the caller's index.lock / next-index lock.
// A test that builds a fixture repo and runs `git` with only `cwd:` set then
// acts on the caller: on 981169627 a pre-commit test:guards run checked the
// real worktree out onto ci-coverage's fixture branch `feature`.
//
// A per-call `env:` would miss the tools and hooks under test that run git
// themselves, so the scrub is process-wide; node --test runs each file in its
// own process. Safe for the git calls aimed at ROOT: no unit test reads the
// staged index, and with GIT_DIR unset git rediscovers ROOT from `cwd`.
// IMPORT IT FIRST in any test that runs git against a fixture repo;
// tests/unit/git-fixture-env.test.mjs fails a file that creates one without it.
//
// The list is git's own (`git rev-parse --local-env-vars`,
// https://git-scm.com/docs/git-rev-parse#Documentation/git-rev-parse.txt---local-env-vars),
// unioned with a fallback so a git that cannot answer still scrubs the known set.
import { spawnSync } from "node:child_process";
import os from "node:os";

const FALLBACK = [
  "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_CONFIG", "GIT_CONFIG_PARAMETERS", "GIT_CONFIG_COUNT",
  "GIT_OBJECT_DIRECTORY", "GIT_DIR", "GIT_WORK_TREE", "GIT_IMPLICIT_WORK_TREE", "GIT_GRAFT_FILE",
  "GIT_INDEX_FILE", "GIT_NO_REPLACE_OBJECTS", "GIT_REPLACE_REF_BASE", "GIT_PREFIX", "GIT_SHALLOW_FILE",
  "GIT_COMMON_DIR",
];

// GIT_CONFIG_COUNT's payload rides in GIT_CONFIG_KEY_<n> / GIT_CONFIG_VALUE_<n>.
function strip(env, names) {
  const out = { ...env };
  for (const k of names) delete out[k];
  for (const k of Object.keys(out)) if (/^GIT_CONFIG_(KEY|VALUE)_\d+$/.test(k)) delete out[k];
  return out;
}

/** Every repository-local GIT_* name: git's list plus the fallback, computed once. */
export const GIT_LOCAL_ENV_VARS = (() => {
  // Asked from a neutral cwd with the known set already gone, so a hostile
  // GIT_DIR cannot make the question itself fail.
  const r = spawnSync("git", ["rev-parse", "--local-env-vars"], { cwd: os.tmpdir(), env: strip(process.env, FALLBACK), encoding: "utf8" });
  const listed = r.status === 0 ? r.stdout.split("\n").map((s) => s.trim()).filter(Boolean) : [];
  return Object.freeze([...new Set([...FALLBACK, ...listed])]);
})();

/** A copy of `env` without any repository-local GIT_* variable. */
export function stripGitLocalEnv(env = process.env) {
  return strip(env, GIT_LOCAL_ENV_VARS);
}

/** Remove them from process.env in place (what importing this module does); returns the names removed. */
export function scrubGitLocalEnv() {
  const clean = stripGitLocalEnv(process.env);
  const removed = Object.keys(process.env).filter((k) => !(k in clean));
  for (const k of removed) delete process.env[k];
  return removed;
}

scrubGitLocalEnv();
