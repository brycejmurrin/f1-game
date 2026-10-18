#!/usr/bin/env node
// @doc Commit-hook ratchet absorb: 20 lines silent, 40 with a Ratchet-Reason trailer.
// @skill slim-bloat
/**
 * ratchet-reason.mjs — the absorb rule for `ratchets.mjs --auto-raise`.
 *
 * A ceiling that an extract just lowered is slack. The old hook spent that
 * slack back, 40 lines at a time, with no message. Silent growth now stops
 * at ABSORB_SILENT. A commit whose message contains a `Ratchet-Reason:`
 * trailer (its own line, non-empty text after the colon) may still absorb
 * up to ABSORB_WITH_REASON. Past that, the raise stays a deliberate `--update`.
 *
 * The trailer is read from APEX_COMMIT_MESSAGE, or from COMMIT_EDITMSG when
 * git is inside a hook (GIT_INDEX_FILE is set). A bare `node … --auto-raise`
 * from the shell guard has neither, so it uses the silent cap.
 */
import fs from "node:fs";
import cp from "node:child_process";

export const ABSORB_SILENT = 20;
export const ABSORB_WITH_REASON = 40;
export const TRAILER = "Ratchet-Reason:";

/** The trailer text, or null when the message does not carry one. */
export function trailerReason(message) {
  if (!message) return null;
  const m = String(message).match(/^Ratchet-Reason:[ \t]*(\S.*)$/m);
  return m ? m[1].trim() : null;
}

/** How many lines `--auto-raise` may absorb for this commit message. */
export function absorbLimit(message) {
  return trailerReason(message) ? ABSORB_WITH_REASON : ABSORB_SILENT;
}

/** The message the commit hook can see, or "" when this is not a commit. */
export function readCommitMessage(env = process.env) {
  if (env.APEX_COMMIT_MESSAGE != null) return env.APEX_COMMIT_MESSAGE;
  if (!env.GIT_INDEX_FILE) return "";
  try {
    const file = cp.execFileSync("git", ["rev-parse", "--git-path", "COMMIT_EDITMSG"], { encoding: "utf8" }).trim();
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}
