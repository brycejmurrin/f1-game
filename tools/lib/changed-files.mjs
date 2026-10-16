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
// Call sites still on `--name-only` (listed in the PR that added this helper):
// pick-tests, verify-change, change-kind, deploy.mjs's own unions and ci.yml's
// shell filters. The three selection tools of the pull-request gate use this.
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
