// auth-error.mjs — one classifier for "the GitHub credential is gone" (W2, 2026-10-26).
// @doc isAuthError(textOrErr): HTTP 401 / Bad credentials / revoked token / git or gh auth failure; AUTH_EXIT 77, AUTH_LINE.
//
// WHY. A watcher or sync whose token expired read the 401 as "API error" and
// retried or re-armed for hours (CODEX-ARCHIVE-MINING-2026-10-26: waiters that
// kept polling after the session's GitHub token was revoked). An expired
// credential is not transient: no retry, no re-arm fixes it. Every tool that
// talks to GitHub (ci-watch, sync-pr, pr-board, queue-depth) prints the one
// line `= auth expired — stop` and exits AUTH_EXIT, so the caller — an agent
// reading the line, or a Monitor — stops instead of retrying.
//
// AUTH_EXIT is 77 (sysexits.h EX_NOPERM): unused by every caller, whose own
// codes are 0-5 and 124. A 403 is NOT an auth error (rate limit, a missing
// scope, a protected branch): only a 401 or an explicit credential message is.
//
//   isAuthError("HTTP 401")                       → true
//   isAuthError(new Error("fetch failed: fatal: Authentication failed for …")) → true
//   isAuthError({ status: 401 })                  → true
//   exitOnAuth(err, { tool: "sync-pr" })          → prints AUTH_LINE, exits 77 (no-op when not an auth error)

export const AUTH_EXIT = 77;
export const AUTH_LINE = "= auth expired — stop";

const PATTERNS = [
  /\bHTTP 401\b/,
  /\b401\b[^\n]{0,20}\bUnauthorized\b/i,
  /\bBad credentials\b/i,
  /\btoken\b[^\n]{0,40}\brevoked\b/i,
  /\brevoked\b[^\n]{0,40}\btoken\b/i,
  /\bAuthentication failed\b/i,
  /\bRequires authentication\b/i,
  /\bgh auth login\b/i,
  /\bnot logged in(?:to)? any (?:GitHub )?hosts?\b/i,
  /\bauthentication token\b[^\n]{0,40}\b(?:expired|invalid)\b/i,
  /\bInvalid username or (?:password|token)\b/i,
  /\bcould not read Username for\b/i,
];

/** The text an error carries: a string, an Error's message (+ stderr), or a `{ error, stderr, message }` record. */
function textOf(x) {
  if (x == null) return "";
  if (typeof x === "string") return x;
  return [x.message, x.error, x.err, x.stderr, x.text].filter((s) => typeof s === "string").join("\n");
}

/** True when `textOrErr` says the credential is missing, expired or revoked. Pure. */
export function isAuthError(textOrErr) {
  if (textOrErr && typeof textOrErr === "object" && (textOrErr.status === 401 || textOrErr.code === 401)) return true;
  const t = textOf(textOrErr);
  return !!t && PATTERNS.some((re) => re.test(t));
}

/** On an auth error: print AUTH_LINE (stdout) and the cause (stderr), then exit AUTH_EXIT. Returns false otherwise.
 *  `exit`/`out`/`err` are injectable for tests. */
export function exitOnAuth(textOrErr, { tool = "", exit = process.exit, out = (l) => console.log(l), err = (l) => console.error(l) } = {}) {
  if (!isAuthError(textOrErr)) return false;
  out(AUTH_LINE);
  err(`${tool ? tool + ": " : ""}${textOf(textOrErr).split("\n").find((l) => l.trim()) || "HTTP 401"} — refresh the GitHub credential; retrying will not help (exit ${AUTH_EXIT})`);
  exit(AUTH_EXIT);
  return true;
}
