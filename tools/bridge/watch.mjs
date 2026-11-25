#!/usr/bin/env node
/**
 * @doc Phone-bridge watcher for Monitor: one line per new OWNER `apex-result`/hello; rate-limit backoff; never posts.
 * Polls every ~5 s with an ETag (304s are free).
 * @skill phone-bridge
 *
 *   node tools/bridge/watch.mjs --issue <n> [--repo o/r] [--since ISO] [--every 5] [--exit-on <cmd comment id>] [--minutes 60]
 *
 * stdout, one line per event (what Monitor streams back):
 *   hello id=<c> at=<ISO> sha=<facts.sha> render=<facts.render>
 *   result id=<c> re=<cmd id> cmd=<name> ok=<true|false> <json, cut at 400 chars>
 * stderr: backoff and error notes. The token (GH_TOKEN / GITHUB_TOKEN / `gh auth token`) goes only in the
 * Authorization header: never argv, a URL or a log line. Comments by anyone but the OWNER are ignored (public repo).
 * Issue #6582 unit 10; the page side is js/agent/apex-bridge.js.
 */
import { githubToken, NO_TOKEN_HINT } from "../ci/github-token.mjs";
import { pathToFileURL } from "node:url";
import { exitIfHelp } from "../lib/cli-args.mjs";

const USAGE = `usage: node tools/bridge/watch.mjs --issue <n> [--repo o/r] [--since ISO] [--every 5] [--exit-on <cmd comment id>] [--minutes 60]
  Watches the phone-bridge issue; prints one line per new OWNER \`apex-result\` or hello comment; never posts.
  --issue <n>      bridge issue number (required)
  --repo o/r       repository (default brycejmurrin/f1-game)
  --since ISO      ignore comments created before this time
  --every <s>      poll interval in seconds (min 2, default 5)
  --exit-on <id>   exit once the result replying to this command comment arrives
  --minutes <m>    time budget (default 60)
  exit: 0 done or budget spent, 1 auth/404, 2 bad args, 3 no token`;

const RESULT_RE = /```apex-result[ \t]*\n([\s\S]*?)```/;
export const LOW = 200; // remaining calls under this: slow down
export const FLOOR = 25; // remaining calls under this: wait for the reset
export const MAX_WAIT_MS = 15 * 60_000;

/** Parse a comment body's apex-result fence; null when there is none or it is not JSON. */
export function parseResult(body) {
  const m = RESULT_RE.exec(String(body || ""));
  if (!m) return null;
  try { const o = JSON.parse(m[1]); return o && typeof o === "object" ? o : null; } catch { return null; }
}

/** One stdout line for a parsed reply. */
export function formatEvent(c, msg) {
  if (msg.hello) {
    const f = msg.facts || {};
    const render = typeof f.render === "object" ? JSON.stringify(f.render) : f.render;
    return `hello id=${c.id} at=${c.created_at} sha=${f.sha ?? "?"} render=${render ?? "?"}`;
  }
  let json = JSON.stringify(msg);
  if (json.length > 400) json = json.slice(0, 400) + "…";
  return `result id=${c.id} re=${msg.re ?? "?"} cmd=${msg.cmd ?? "?"} ok=${msg.ok !== false} ${json}`;
}

/** New OWNER replies created at/after `since`, not yet seen; marks them seen. Oldest first. */
export function pickEvents(comments, state) {
  const out = [];
  const list = (Array.isArray(comments) ? comments : []).slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.id - b.id);
  for (const c of list) {
    if (!c || state.seen.has(c.id)) continue;
    if (c.author_association !== "OWNER") continue;
    if (String(c.created_at) < state.since) continue;
    const msg = parseResult(c.body);
    if (!msg) continue;
    state.seen.add(c.id);
    out.push({ c, msg, line: formatEvent(c, msg) });
  }
  return out;
}

/**
 * The wait before the next poll, from the last response.
 * @param {{status:number, headers:{get(n:string):string|null}}|null} res null = a network error
 * @param {{baseMs:number, now:number, errors:number}} ctx
 * @returns {{ms:number, why:string|null}}
 */
export function nextDelay(res, { baseMs, now, errors }) {
  if (!res) return { ms: Math.min(60_000, baseMs * 2 ** Math.min(errors, 4)), why: `network error x${errors}` };
  const h = (n) => res.headers.get(n);
  const remaining = h("x-ratelimit-remaining") == null ? null : Number(h("x-ratelimit-remaining"));
  const resetMs = h("x-ratelimit-reset") == null ? null : Number(h("x-ratelimit-reset")) * 1000;
  const untilReset = resetMs == null ? null : Math.max(0, resetMs - now) + 1000;
  const retryAfter = h("retry-after") == null ? null : Number(h("retry-after")) * 1000;
  if (res.status === 403 || res.status === 429) {
    const ms = retryAfter ?? (remaining === 0 && untilReset != null ? untilReset : 60_000);
    return { ms: Math.min(MAX_WAIT_MS, Math.max(baseMs, ms)), why: `rate limited (${res.status})` };
  }
  if (res.status >= 500) return { ms: Math.min(60_000, baseMs * 2 ** Math.min(errors, 4)), why: `server ${res.status}` };
  if (remaining != null && remaining < FLOOR && untilReset != null)
    return { ms: Math.min(MAX_WAIT_MS, Math.max(baseMs, untilReset)), why: `rate limit ${remaining} left: waiting for the reset` };
  if (remaining != null && remaining < LOW) return { ms: baseMs * 4, why: `rate limit ${remaining} left: polling slower` };
  return { ms: baseMs, why: null };
}

export function parseArgs(argv) {
  const o = { repo: "brycejmurrin/f1-game", every: 5, minutes: 60, since: null, issue: null, exitOn: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    if (k === "--issue") { o.issue = Number(v); i++; }
    else if (k === "--repo") { o.repo = v; i++; }
    else if (k === "--since") { o.since = v; i++; }
    else if (k === "--every") { o.every = Math.max(2, Number(v) || 5); i++; }
    else if (k === "--minutes") { o.minutes = Number(v) || 60; i++; }
    else if (k === "--exit-on") { o.exitOn = Number(v); i++; }
    else throw new Error(`unknown argument ${k}`);
  }
  if (!Number.isInteger(o.issue) || o.issue <= 0) throw new Error("--issue <n> is required");
  if (!/^[\w.-]+\/[\w.-]+$/.test(o.repo)) throw new Error("--repo must be owner/name");
  return o;
}

/**
 * Poll loop. Every request is a GET; resolves with the exit reason.
 * @param {object} o parseArgs output
 * @param {{fetch:Function, token:string, out:(s:string)=>void, err:(s:string)=>void, sleep:(ms:number)=>Promise<void>, now:()=>number, maxPolls?:number}} io
 */
export async function watch(o, io) {
  const start = io.now();
  const state = { since: o.since || new Date(start).toISOString().replace(/\.\d+Z$/, "Z"), seen: new Set() };
  const url = `https://api.github.com/repos/${o.repo}/issues/${o.issue}/comments?per_page=100&since=${encodeURIComponent(state.since)}`;
  const headers = { Authorization: `Bearer ${io.token}`, Accept: "application/vnd.github+json", "User-Agent": "apex-bridge-watch" };
  let etag = null, errors = 0, polls = 0, lastWhy = null;
  io.err(`watching issue #${o.issue} for OWNER apex-result / hello since ${state.since}`);
  for (;;) {
    if (io.now() - start > o.minutes * 60_000) return "time";
    if (io.maxPolls != null && polls >= io.maxPolls) return "polls";
    polls++;
    let res = null;
    try {
      res = await io.fetch(url, { method: "GET", headers: etag ? { ...headers, "If-None-Match": etag } : headers });
    } catch (e) {
      errors++;
      io.err(`fetch failed: ${String(e && e.message).slice(0, 120)}`);
    }
    if (res) {
      if (res.status === 200) {
        errors = 0;
        etag = res.headers.get("etag") || null;
        for (const ev of pickEvents(await res.json(), state)) {
          io.out(ev.line);
          if (o.exitOn != null && Number(ev.msg.re) === o.exitOn) return "exit-on";
        }
      } else if (res.status === 304) errors = 0;
      else if (res.status === 401 || res.status === 404) { io.err(`GitHub ${res.status}: check the token's repo access and the issue number`); return "auth"; }
      else errors++;
    }
    const d = nextDelay(res, { baseMs: o.every * 1000, now: io.now(), errors });
    if (d.why && d.why !== lastWhy) io.err(`backoff ${Math.round(d.ms / 1000)} s: ${d.why}`);
    lastWhy = d.why;
    await io.sleep(d.ms);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  exitIfHelp(process.argv.slice(2), USAGE);
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (e) { console.error(String(e.message)); process.exit(2); }
  const token = githubToken();
  if (!token) { console.error(NO_TOKEN_HINT); process.exit(3); }
  const why = await watch(o, {
    fetch: globalThis.fetch, token,
    out: (s) => console.log(s), err: (s) => console.error(s),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)), now: () => Date.now(),
  });
  console.error(`watch ended: ${why}`);
  process.exit(why === "auth" ? 1 : 0);
}
