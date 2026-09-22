/* baseline-blessing.mjs — the `_blessed` provenance stamp a regenerated
 * baseline carries, and the one function that recomputes its hash.
 *
 * Shared by the writer (tests/specs/physics-characterization.spec.js under
 * APEX_UPDATE_BASELINE=1) and the guard (tests/unit/physics-baseline-provenance
 * .test.mjs), so the two cannot disagree about what is hashed: the scenario
 * traces, canonical 2-space JSON, `_blessed` itself excluded.
 */
import crypto from "node:crypto";
import cp from "node:child_process";

export const BLESSED_KEY = "_blessed";

/** sha256 of the baseline's DATA (every key but `_blessed`), as the file
 *  serialises it. Parsing the committed file and hashing again must give the
 *  same string, which is what makes a hand-edited number visible. */
export function dataHash(obj) {
  const data = {};
  for (const k of Object.keys(obj)) if (k !== BLESSED_KEY) data[k] = obj[k];
  return crypto.createHash("sha256").update(JSON.stringify(data, null, 2)).digest("hex");
}

/** HEAD's full sha, or null when git is not available (a tarball checkout). */
export function headSha(cwd) {
  try {
    return cp.execSync("git rev-parse HEAD", { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || null;
  } catch (_) { return null; }
}

/** The stamp written beside the data. `reason` is the operator's sentence. */
export function blessing(data, reason, opts = {}) {
  return {
    sha: opts.sha === undefined ? headSha(opts.cwd) : opts.sha,
    reason: String(reason),
    at: opts.at || new Date().toISOString(),
    hash: dataHash(data),
  };
}
