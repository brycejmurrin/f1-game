// stale-rows.mjs — which stale baseline rows a fleet sweep fails on (#2183).
// @doc Which stale baseline rows a fleet sweep fails: all locally, a PR's own circuits on a PR, none on the train (#2183).
// Full description: a cap above the measurement is a lie, but the lie is usually someone ELSE's improvement — a shared
// scenery fix merged elsewhere — and failing it on every PR reddened every geometry PR's full tier for a row it never
// touched (2026-10-15, #2138). On a pull request a stale row fails only for a circuit the diff touches
// (circuitsTouched, the sweeps job's own scoping source), or for every row when the diff edits that baseline file.
// Other stale rows are advisories. Local runs are strict for every row; non-PR CI (train, nightly) is advisory,
// the ratchets.json LOOSE precedent: an improvement never blocks shipping. Growth over a cap fails everywhere,
// and nothing here can raise a cap. Shared by prop-clipping (clip-baseline.json) and scenery-ground-audit
// (scenery-audit-baseline.json).
// @section runner
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { circuitsTouched } from "../ci/select-specs.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function prChangedFiles(env = process.env) {
  try {
    const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const ref = git("merge-base", `origin/${env.GITHUB_BASE_REF}`, "HEAD");
    return { ref, files: git("diff", "--name-only", ref, "HEAD").split("\n").filter(Boolean) };
  } catch { return null; }
}

/** null = every row strict, else the Set of strict circuit ids. `baselinePath` is repo-relative. */
export function staleStrictIds(baselinePath, env = process.env, changed = () => prChangedFiles(env)) {
  if (!env.GITHUB_EVENT_NAME) return null;
  if (env.GITHUB_EVENT_NAME !== "pull_request") return new Set();
  const diff = changed();
  if (!diff) return null;                 // cannot read the diff: fail safe, strict
  if (diff.files.includes(baselinePath)) return null;
  return new Set(circuitsTouched(diff.files, diff.ref).ids);
}
