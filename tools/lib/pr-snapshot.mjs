// @doc Shared per-PR GitHub reads (list, PR, files, checks, runs, jobs, comments) behind one ETag cache on disk.
//
// WHY (system audit 2026-10-26 §7, docs/notes/TOOLING-CONSOLIDATION-2026-10-26.md).
// pr-board, session-status --pr, needs-sync, queue-depth and fleet-owner each
// built their own "my PR" view out of the same five GETs, uncached, so one
// pr-board sweep at 44 open PRs cost ~133–220 requests and every agent paid it
// again a minute later. Every read here is a CONDITIONAL GET through
// tools/ci/github-api.mjs: the URL's last ETag rides in If-None-Match and a 304
// reuses the stored body. GitHub: "making a conditional request does not count
// against your primary rate limit if a 304 response is returned"
// (https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api#use-conditional-requests),
// so a re-sweep of an unchanged board is close to free. The store persists in
// artifacts/pr-snapshot/etags.json (ignored), shared by every tool on the box.
//
//   import { createSnapshot } from "../lib/pr-snapshot.mjs";
//   const snap = createSnapshot();             // or { request } in tests
//   const prs = snap.openPrs();                // { json: [...] } | { error }
//   ... snap.save();                           // persist the ETag store
//
// Every method returns github-api's shape ({ json } | { error }); `stats()`
// counts requests and 304 reuses for the tool's footer.
//
// POOL (audit3 tools T1, audit4 A3): a serial sweep was 137 GETs at a median 533 ms through the proxy (~100 s per
// pr-board call), and a 304 still costs its round trip. `prefetch(paths)` sends a whole round in ONE
// `curl --parallel --parallel-max POOL` (token on stdin, each URL's If-None-Match in its own `next` block) and fills
// the memo; any URL that did not come back 200/304 is left to the serial get() (its 5xx/429 backoff). GitHub's
// guidance: "make requests for a single user or client ID serially" is about mutations and the secondary limit of
// 100 concurrent requests; a pool of 6 GETs stays far below it
// (https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api#about-secondary-rate-limits, read
// 2026-10-26). curl: https://curl.se/docs/manpage.html#-Z and #-K (`next` in a config file), curl >= 7.84 for %header{}.
//
// STORE (tools T12): bodies are kept (a 304 must return them), but the file is gzipped and capped by bytes
// (CACHE_MAX_BYTES of JSON, oldest first out) as well as by entries: 15.3 MB of JSON was ~50 MB at the entry cap.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { api, DEPLOY, urlFor } from "../ci/github-api.mjs";
import { githubToken } from "../ci/github-token.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const CACHE_FILE = path.join(ROOT, "artifacts/pr-snapshot/etags.json");
/** Stored URLs: four per PR at ~60 open PRs, plus the shared lists. */
export const CACHE_MAX = 600;
/** Serialized-JSON bytes the store keeps before it drops its oldest entries (gzipped on disk, ~10x smaller). */
export const CACHE_MAX_BYTES = 24 << 20;
/** Concurrent GETs in one prefetch round. */
export const POOL = 6;

/** A Map loaded from `file`: gzip or (legacy) plain JSON; missing, unreadable or malformed → empty. */
export function loadStore(file = CACHE_FILE) {
  try {
    const buf = fs.readFileSync(file);
    const text = buf[0] === 0x1f && buf[1] === 0x8b ? zlib.gunzipSync(buf).toString("utf8") : buf.toString("utf8");
    const raw = JSON.parse(text);
    return new Map(Object.entries(raw && typeof raw === "object" ? raw : {}).filter(([, v]) => v && typeof v.etag === "string"));
  } catch { return new Map(); }
}
/** Drop the oldest entries until the serialized store fits `maxBytes`. Returns the store. */
export function capStore(store, maxBytes = CACHE_MAX_BYTES) {
  const size = new Map([...store].map(([k, v]) => [k, k.length + JSON.stringify(v).length + 6]));
  let total = [...size.values()].reduce((a, b) => a + b, 0);
  for (const k of [...store.keys()]) {
    if (total <= maxBytes) break;
    total -= size.get(k);
    store.delete(k);
  }
  return store;
}
/** Write the store gzipped and byte-capped, atomically (tmp + rename); a failure is silent: the cache is an optimisation. */
export function saveStore(store, file = CACHE_FILE, { maxBytes = CACHE_MAX_BYTES } = {}) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, zlib.gzipSync(JSON.stringify(Object.fromEntries(capStore(store, maxBytes))), { level: 4 }));
    fs.renameSync(tmp, file);
  } catch { /* advisory */ }
}

/** curl config for one parallel round: per URL its own block (auth, If-None-Match, output, write-out). Pure. */
export function batchConfig(urls, { token, store = null, outFor }) {
  const q = (s) => JSON.stringify(String(s));
  return urls.map((url, i) => {
    const prior = store?.get(url);
    return [`url = ${q(url)}`, `output = ${q(outFor(i))}`, `max-time = 30`,
      `header = ${q(`Authorization: Bearer ${token}`)}`, `header = "Accept: application/vnd.github+json"`,
      `header = "X-GitHub-Api-Version: 2022-11-28"`, `header = "Cache-Control: no-cache"`,
      ...(prior ? [`header = ${q(`If-None-Match: ${prior.etag}`)}`] : []),
      `write-out = ${q(`=${i} %{http_code} %header{etag}\n`)}`].join("\n");   // never a leading @: curl reads -w @x from file x
  }).join("\nnext\n") + "\n";
}
/** `=<i> <code> <etag>` write-out lines → Map(i → { status, etag }). Pure. */
export function parseBatchOut(stdout) {
  const out = new Map();
  for (const line of String(stdout || "").split("\n")) {
    const m = /^=(\d+) (\d{3}) ?(.*)$/.exec(line.replace(/\r$/, ""));
    if (m) out.set(Number(m[1]), { status: Number(m[2]), etag: m[3].trim() });
  }
  return out;
}

/**
 * GET `urls` in one `curl --parallel` (ETag-aware). Map(url → { json, cached? }) holding ONLY the 200/304 answers;
 * null when it cannot run (no token, curl missing). The store is updated like github-api's conditional GET.
 */
export function batchGet(urls, { store = null, env = process.env, gh, run = spawnSync, pool = POOL, etagMax = CACHE_MAX,
  dir = path.join(ROOT, "artifacts", "pr-snapshot") } = {}) {
  if (!urls.length) return new Map();
  const token = githubToken(gh !== undefined ? { env, gh } : { env });
  if (!token) return null;
  let tmp;
  try {
    fs.mkdirSync(dir, { recursive: true });
    tmp = fs.mkdtempSync(path.join(dir, "batch-"));
    const outFor = (i) => path.join(tmp, `${i}.json`);
    const r = run("curl", ["-sS", "--parallel", "--parallel-max", String(pool), "-K", "-"],
      { input: batchConfig(urls, { token, store, outFor }), encoding: "utf8", maxBuffer: 16 << 20 });
    if (r.error) return null;
    const out = new Map();
    for (const [i, { status, etag }] of parseBatchOut(r.stdout)) {
      const url = urls[i], prior = store?.get(url);
      if (status === 304 && prior) { out.set(url, { json: prior.json, cached: true }); continue; }
      if (status !== 200) continue;
      let json;
      try { json = JSON.parse(fs.readFileSync(outFor(i), "utf8")); } catch { continue; }
      out.set(url, { json });
      if (store && etag) {
        store.delete(url);
        store.set(url, { etag, json });
        if (store.size > etagMax) store.delete(store.keys().next().value);
      }
    }
    return out;
  } catch { return null; } finally { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); }
}

/** The request paths every snapshot method uses (so a prefetch hits the same memo keys). */
export const paths = {
  openPrs: (page = 1) => `pulls?state=open&base=${encodeURIComponent(DEPLOY)}&per_page=100&page=${page}`,
  pr: (n) => `pulls/${n}`,
  checkRuns: (sha) => `commits/${sha}/check-runs?per_page=100`,
  ciRuns: (sha) => `actions/workflows/ci.yml/runs?head_sha=${sha}&per_page=20`,
  jobs: (runId, page = 1) => `actions/runs/${runId}/jobs?per_page=100&page=${page}`,
  comments: (n, count) => `issues/${n}/comments?per_page=100&page=${Math.max(1, Math.ceil(count / 100))}`,
  recentCiRuns: () => "actions/workflows/ci.yml/runs?per_page=100",
};

/**
 * @param {{ request?: (pathQs: string) => {json?: any, error?: string, cached?: boolean},
 *   run?: Function, env?: object, gh?: Function, cacheFile?: string|null }} [opts]
 *   request: injected transport (tests); otherwise github-api's api() with the
 *   ETag store. cacheFile: null keeps the store in memory only.
 */
export function createSnapshot(opts = {}) {
  const cacheFile = opts.cacheFile === undefined ? CACHE_FILE : opts.cacheFile;
  const store = opts.request ? null : (cacheFile ? loadStore(cacheFile) : new Map());
  const counts = { requests: 0, cached: 0 };
  const memo = new Map();   // one process never asks GitHub the same URL twice
  const transport = opts.request
    || ((p) => api(p, { run: opts.run, env: opts.env, gh: opts.gh, etags: store, etagMax: CACHE_MAX }));
  const get = (pathQs) => {
    const key = urlFor(pathQs);
    if (memo.has(key)) return memo.get(key);
    counts.requests += 1;
    const r = transport(pathQs);
    if (r?.cached) counts.cached += 1;
    if (!r?.error) memo.set(key, r);
    return r;
  };
  /** Fetch every not-yet-memoised path in one parallel round (opts.batch in tests; a no-op for an injected
   *  `request` without one). Failures are not memoised: the serial get() asks again with its backoff. */
  const batch = opts.batch !== undefined ? opts.batch
    : opts.request ? null
    : (urls) => batchGet(urls, { store, env: opts.env, gh: opts.gh, run: opts.run });
  function prefetch(list) {
    const urls = [...new Set((list || []).map(urlFor))].filter((u) => !memo.has(u));
    if (!batch || urls.length < 2) return 0;
    const got = batch(urls);
    if (!got) return 0;
    counts.requests += urls.length;
    for (const [url, r] of got) {
      if (r?.cached) counts.cached += 1;
      memo.set(url, r);
    }
    return got.size;
  }

  /** Every open PR into the deploy branch (paged; at most 5 pages). */
  function openPrs() {
    const all = [];
    for (let page = 1; page <= 5; page++) {
      const r = get(paths.openPrs(page));
      if (r.error) return { error: r.error };
      const batch = Array.isArray(r.json) ? r.json : [];
      all.push(...batch);
      if (batch.length < 100) break;
    }
    return { json: all };
  }
  /** Open PRs whose head is `owner:branch` (any base). */
  const prsForBranch = (branch, owner = "brycejmurrin") =>
    get(`pulls?head=${owner}:${encodeURIComponent(branch)}&state=open&per_page=10`);
  const pr = (n) => get(paths.pr(n));
  /** Changed files of a PR (paged, GitHub caps the list at 3,000). */
  function files(n) {
    const all = [];
    for (let page = 1; page <= 30; page++) {
      const r = get(`pulls/${n}/files?per_page=100&page=${page}`);
      if (r.error) return { error: r.error };
      const batch = Array.isArray(r.json) ? r.json : [];
      all.push(...batch);
      if (batch.length < 100) break;
    }
    return { json: all };
  }
  const checkRuns = (sha) => get(paths.checkRuns(sha));
  /** ci.yml runs on one head sha. */
  const ciRuns = (sha) => get(paths.ciRuns(sha));
  /** Every workflow's runs on one head sha (session-status). */
  const allRuns = (sha) => get(`actions/runs?head_sha=${sha}&per_page=50`);
  /** The newest 100 ci.yml runs, any event: one call that answers most heads. */
  const recentCiRuns = () => get(paths.recentCiRuns());
  function jobs(runId) {
    const all = [];
    for (let page = 1; ; page++) {
      const r = get(paths.jobs(runId, page));
      if (r.error) return { error: r.error };
      const batch = r.json?.jobs || [];
      all.push(...batch);
      if (batch.length < 100) break;
    }
    return { json: all };
  }
  /** The newest page of issue comments (ascending order: the last page holds them). */
  const comments = (n, count) => get(paths.comments(n, count));

  return {
    get, prefetch, openPrs, prsForBranch, pr, files, checkRuns, ciRuns, allRuns, recentCiRuns, jobs, comments,
    stats: () => ({ ...counts }),
    save: () => { if (store && cacheFile) saveStore(store, cacheFile); },
  };
}

/**
 * Index `recentCiRuns()` by head sha. A head counts as covered only when one of
 * its runs is inside the page; a head with no run there needs its own
 * `ciRuns(sha)` read (a draft with no CI, or a run older than the page).
 */
export function runsByHead(runs) {
  const by = new Map();
  for (const r of runs || []) {
    if (!r?.head_sha) continue;
    if (!by.has(r.head_sha)) by.set(r.head_sha, []);
    by.get(r.head_sha).push(r);
  }
  return by;
}
