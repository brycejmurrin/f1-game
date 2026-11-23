// @doc `git diff` path lists naming BOTH ends of a rename, so a file moved out of a watched directory still routes its rules.
//
// WHY (ledger M36, 2026-10-09). `git diff --name-only` runs with rename
// detection on and lists only the DESTINATION of a moved file. The selection
// tools route by path (js/circuits/ -> the circuit slices, js/track/ -> the
// fleet, js/physics/ -> the driving model), so a source file `git mv`d out of
// its directory showed up under its new name alone and the old directory's
// rules never fired. `--name-status` reports `R<score>\told\tnew`; this
// returns old AND new (a copy, `C`, lists both as well), plus every plain
// A/M/D/T path, in diff order, unique.
//
// Callers (2026-10-26): pick-tests, pick-unit-slices, verify-change and
// deploy.mjs changedPaths(). Still on `--name-only`: ratchets.mjs's changed-file
// read (another lane's file), change-kind and ci.yml's shell filters.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Parse `git diff --name-status -z` output into unique paths, rename/copy
 *  sources included. Pure, so the format handling is testable without a repo. */
export function parseNameStatusZ(out) {
  const f = String(out || "").split("\0");
  if (f[f.length - 1] === "") f.pop();
  const paths = [];
  for (let i = 0; i < f.length;) {
    const status = f[i++];
    const two = /^[RC]/.test(status);
    const a = f[i++];
    if (a !== undefined && a !== "") paths.push(a);
    if (two) { const b = f[i++]; if (b !== undefined && b !== "") paths.push(b); }
  }
  return [...new Set(paths)];
}

/** Paths changed by `git diff <args>` (e.g. [ref], ["--cached"], [`a...b`]),
 *  rename sources included. Throws like execFileSync when git fails. */
export function changedPaths(args = [], { cwd = ROOT, run = execFileSync } = {}) {
  const out = run("git", ["diff", "--name-status", "-z", "-M", ...args], { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return parseNameStatusZ(out);
}

/** Untracked, not-ignored paths (`git ls-files --others --exclude-standard`).
 *  A new file is invisible to `git diff <base>` until `git add`, and AGENTS.md's
 *  loop runs the selectors BEFORE staging (audit W6, 2026-11-10). */
export function untrackedPaths({ cwd = ROOT, run = execFileSync } = {}) {
  const out = run("git", ["ls-files", "--others", "--exclude-standard", "-z"], { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return String(out || "").split("\0").filter(Boolean);
}

/** The diff base a branch's selection is measured against: the merge-base of
 *  HEAD with `origin/<branch>`, else with the local `<branch>`. Null when
 *  neither resolves (a shallow or unfetched clone): callers must REFUSE then,
 *  never fall back to HEAD~1 — the last commit's selection read as green for
 *  the whole branch (audit W6, 2026-11-10). git's stderr is swallowed: the
 *  caller prints one "no deploy base" line instead of a `fatal:` per ref. */
export function resolveDeployBase(branch, { cwd = ROOT, run = execFileSync } = {}) {
  for (const ref of [`origin/${branch}`, branch]) {
    try {
      const sha = String(run("git", ["merge-base", "HEAD", ref], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }) || "").trim();
      if (sha) return { ref, sha };
    } catch (_) { /* try the next ref */ }
  }
  return null;
}

/** The refusal text when resolveDeployBase answers null. */
export function noDeployBaseMessage(branch, tool) {
  return `[${tool}] no deploy base: neither origin/${branch} nor ${branch} resolves to a merge-base with HEAD — nothing selected, nothing verified.\n`
    + `  Fetch it (\`git fetch origin ${branch}\`; a shallow clone needs \`git fetch --unshallow\`) or name the files / --since <ref> explicitly.`;
}

/** Paths changed against `base` in the WORKING TREE (committed, staged and
 *  unstaged edits) plus untracked files, rename sources included. */
export function changedWithUntracked(base, opts = {}) {
  return [...new Set([...changedPaths([base], opts), ...untrackedPaths(opts)])];
}
