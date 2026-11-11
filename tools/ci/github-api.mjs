#!/usr/bin/env node
/**
 * @doc The one GitHub REST client: token on curl stdin, 5xx/429 backoff, ETag/304 GETs, JSON bodies; repo constants.
 * @section runner
 * @skill steward
 *
 * Extracted from the retired ready-full-cap.mjs (#3013). Since 2026-10-26
 * (docs/notes/TOOLING-CONSOLIDATION-2026-10-26.md) it is the ONLY client:
 * ci-watch's ETag client, ready-gate's no-retry client, deploy.mjs's ghApi and
 * advisoryGet and remote-group's dispatch all call it.
 *
 *   api(pathQs, opts)      → { json } | { error }   (2xx; `cached: true` on a 304 reuse)
 *   request(pathQs, opts)  → { status, json, text, etag, cached?, error? }  (any status; error only when curl failed)
 *
 * `pathQs` is relative to repos/<REPO>/ or a full https:// URL.
 * opts: method (GET), body (JSON-encoded onto curl's stdin config), token
 * (else githubToken(); `anonymous: true` lets a tokenless GET go out bare),
 * etags (a Map-like url → { etag, json } store, bounded by etagMax; If-None-Match on a hit, a 304
 * reuses the stored body — free against the primary rate limit), timeoutS, follow
 * (curl -L: a job-log 302 to blob storage; curl drops the auth header off-host),
 * retries (backoff list), sleepSync, run (spawnSync stand-in), env, gh.
 *
 * Conditional requests: https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api#use-conditional-requests
 * Backoff: https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api#handle-rate-limit-errors-appropriately
 */
import { spawnSync } from "node:child_process";
import { githubToken, NO_TOKEN_HINT } from "./github-token.mjs";

export const REPO = "brycejmurrin/f1-game";
export const DEPLOY = "claude/f1-game-project-26h3ng";

/** Backoff before each retry of a 5xx/429 (1 s, 2 s, 4 s), then the error stands. */
export const RETRY_DELAYS_MS = [1000, 2000, 4000];
/** Entries an ETag store keeps before it drops the oldest (LRU by insertion). */
export const ETAG_CACHE_MAX = 256;
const defaultSleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

export const urlFor = (pathQs) => /^https?:\/\//.test(pathQs) ? pathQs : `https://api.github.com/repos/${REPO}/${pathQs}`;

function requestOnce(pathQs, { run = spawnSync, env = process.env, gh, token, anonymous = false,
  method = "GET", body, etags, etagMax = ETAG_CACHE_MAX, timeoutS = 30, follow = false } = {}) {
  if (token === undefined) token = githubToken(gh !== undefined ? { env, gh } : { env });
  if (!token && !anonymous) return { error: NO_TOKEN_HINT };
  const url = urlFor(pathQs);
  const conditional = method === "GET" && etags;
  const prior = conditional ? etags.get(url) : undefined;
  // -w: the status code, the response ETag and Retry-After on the last line (`%header{}`, curl >= 7.84).
  const args = ["-sS", ...(follow ? ["-L"] : []), "--max-time", String(timeoutS), ...(token ? ["-K", "-"] : []),
    ...(method !== "GET" ? ["-X", method] : []), "-w", "\n%{http_code} %header{etag} %header{retry-after}",
    "-H", "Accept: application/vnd.github+json", "-H", "X-GitHub-Api-Version: 2022-11-28",
    // Revalidate stored HTTP responses when polling mutable CI/PR state (RFC 9111 §5.2.1.4).
    "-H", "Cache-Control: no-cache",
    ...(prior ? ["-H", `If-None-Match: ${prior.etag}`] : []),
    url];
  // `-K -` reads a curl config from stdin: the auth header and the JSON body
  // both ride there (curl's quoted-value escapes are JSON's \" and \\), so
  // neither the token nor the payload ever reaches argv.
  let input = token ? `header = "Authorization: Bearer ${token}"\n` : undefined;
  if (body !== undefined && token) {
    input += `header = "Content-Type: application/json"\ndata-binary = ${JSON.stringify(JSON.stringify(body))}\n`;
  }
  // maxBuffer: one page of 100 open PRs passed spawnSync's 1 MB default on
  // 2026-10-14 (ENOBUFS, empty stderr → "curl failed").
  const r = run("curl", args, { encoding: "utf8", maxBuffer: 64 << 20, ...(input !== undefined ? { input } : {}) });
  if (r.status !== 0) return { error: (r.stderr || r.error?.code || "curl failed").trim() };
  const out = (r.stdout || "").split("\n");
  // Split on single spaces: an absent header prints as an empty field ("429  3": no ETag, Retry-After 3).
  const [codeText = "", etag = "", retryAfter = ""] = (out.pop() || "").replace(/\r/g, "").replace(/^\s+/, "").split(" ");
  const status = Number(codeText);
  if (status === 304 && prior) return { status: 200, json: prior.json, text: "", etag: prior.etag, cached: true };
  const text = out.join("\n");
  let json = null, bad = false;
  if (text.trim()) { try { json = JSON.parse(text); } catch { bad = true; } }
  if (conditional && status === 200 && !bad && etag) {
    etags.delete(url);
    etags.set(url, { etag, json });
    if (etags.size > etagMax) etags.delete(etags.keys().next().value);
  }
  return { status, json, text, etag, ...(retryAfter ? { retryAfter: Number(retryAfter) } : {}), ...(bad ? { badJson: true } : {}) };
}

/** Longest Retry-After a CLI waits out in-process; a longer one is returned as the error. */
export const MAX_RETRY_AFTER_S = 10;

/** Any status back (curl failures only as `error`), with 5xx/429 retried.
 *  GitHub: with `retry-after` present, "you should not retry your request until
 *  after that many seconds has elapsed" (best-practices page, read 2026-10-26), so
 *  a 429 honours it: up to MAX_RETRY_AFTER_S it is slept, past that the 429
 *  stands (a CLI that blocks a minute looks hung); no header → the backoff list. */
export function request(pathQs, opts = {}) {
  const { retries = RETRY_DELAYS_MS, sleepSync: nap = defaultSleepSync } = opts;
  for (let attempt = 0; ; attempt++) {
    const r = requestOnce(pathQs, opts);
    const retryable = r.status === 429 || (r.status >= 500 && r.status < 600);
    if (!retryable || attempt >= retries.length) return r;
    if (r.retryAfter > MAX_RETRY_AFTER_S) return r;
    nap(r.retryAfter > 0 ? r.retryAfter * 1000 : retries[attempt]);   // GitHub's problem, not ours: back off and ask again
  }
}

/**
 * The common shape: `{ json }` on 2xx (a 204 is `{ json: null }`), else `{ error }`.
 * @param {string} pathQs
 * @param {{ run?: typeof spawnSync, env?: NodeJS.ProcessEnv, gh?: () => string|null, retries?: number[], sleepSync?: (ms: number) => void,
 *   etags?: Map<string, {etag: string, json: any}>|null, etagMax?: number, method?: string, body?: any, token?: string|null, anonymous?: boolean, timeoutS?: number, follow?: boolean }} [opts]
 */
export function api(pathQs, opts = {}) {
  const r = request(pathQs, opts);
  if (r.error) return { error: r.error };
  if (!(r.status >= 200 && r.status < 300)) return { error: `HTTP ${r.status}` };
  if (r.badJson) return { error: "bad JSON" };
  return r.cached ? { json: r.json, cached: true } : { json: r.json };
}
