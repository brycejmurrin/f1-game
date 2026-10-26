// git-push.mjs — `git push` that never prompts and survives one dropped connection (W2, 2026-10-26).
// @doc gitPush(args): git push with GIT_TERMINAL_PROMPT=0, one retry on a sideband/hung-up disconnect; {code,out,err,attempts}.
//
// WHY. Two failure shapes cost whole sessions (CODEX-ARCHIVE-MINING-2026-10-26):
//   1. A push with no usable credential waited on a terminal prompt nobody could
//      answer. GIT_TERMINAL_PROMPT=0 makes git fail at once ("terminal prompts
//      disabled"), which tools/lib/auth-error.mjs reads as an auth error.
//   2. The agent proxy drops long pushes mid-pack ("unexpected disconnect while
//      reading sideband packet", "the remote end hung up unexpectedly"). One
//      retry clears it; a second identical failure is reported, not looped.
// A push that landed before the drop retries as "Everything up-to-date" (exit 0),
// so the retry is safe. An auth failure is never retried.
//
//   import { gitPush } from "../lib/git-push.mjs";
//   const r = gitPush(["origin", "local:remote"], { cwd: ROOT });   // { code, out, err, attempts }
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isAuthError } from "./auth-error.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const TRANSIENT = [
  /unexpected disconnect while reading sideband packet/i,
  /the remote end hung up/i,
];

/** True for a dropped-connection push failure worth ONE retry (never an auth failure). Pure. */
export function isTransientPushError(text) {
  const t = String(text || "");
  return !isAuthError(t) && TRANSIENT.some((re) => re.test(t));
}

const sleepSync = (ms) => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); };

/** `git push <args>` with GIT_TERMINAL_PROMPT=0 and one retry on a transient disconnect.
 *  `run`, `sleep` and `log` are injectable for tests. */
export function gitPush(args, { cwd = ROOT, env = process.env, run = spawnSync, sleep = sleepSync, retryDelayMs = 3000, log = () => {} } = {}) {
  const once = () => {
    const r = run("git", ["push", ...args], { cwd, encoding: "utf8", env: { ...env, GIT_TERMINAL_PROMPT: "0" } });
    return { code: r.status, out: String(r.stdout || "").trim(), err: String(r.stderr || "").trim() };
  };
  let r = once();
  let attempts = 1;
  if (r.code !== 0 && isTransientPushError(`${r.err}\n${r.out}`)) {
    log(`push dropped (${(r.err.split("\n").find((l) => TRANSIENT.some((re) => re.test(l))) || "disconnect").trim()}) — retrying once`);
    sleep(retryDelayMs);
    r = once();
    attempts = 2;
  }
  return { ...r, attempts };
}
