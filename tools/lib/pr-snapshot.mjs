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
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { api, DEPLOY, urlFor } from "../ci/github-api.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const CACHE_FILE = path.join(ROOT, "artifacts/pr-snapshot/etags.json");
/** Stored URLs: four per PR at ~60 open PRs, plus the shared lists. */
export const CACHE_MAX = 600;

/** A Map loaded from `file` (missing, unreadable or malformed → empty). */
export function loadStore(file = CACHE_FILE) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    return new Map(Object.entries(raw && typeof raw === "object" ? raw : {}).filter(([, v]) => v && typeof v.etag === "string"));
  } catch { return new Map(); }
}
/** Write the store atomically (tmp + rename); a failure is silent: the cache is an optimisation. */
export function saveStore(store, file = CACHE_FILE) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(store)));
    fs.renameSync(tmp, file);
  } catch { /* advisory */ }
}

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

  /** Every open PR into the deploy branch (paged; at most 5 pages). */
  function openPrs() {
    const all = [];
    for (let page = 1; page <= 5; page++) {
      const r = get(`pulls?state=open&base=${encodeURIComponent(DEPLOY)}&per_page=100&page=${page}`);
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
  const pr = (n) => get(`pulls/${n}`);
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
  const checkRuns = (sha) => get(`commits/${sha}/check-runs?per_page=100`);
  /** ci.yml runs on one head sha. */
  const ciRuns = (sha) => get(`actions/workflows/ci.yml/runs?head_sha=${sha}&per_page=20`);
  /** Every workflow's runs on one head sha (session-status). */
  const allRuns = (sha) => get(`actions/runs?head_sha=${sha}&per_page=50`);
  /** The newest 100 ci.yml runs, any event: one call that answers most heads. */
  const recentCiRuns = () => get("actions/workflows/ci.yml/runs?per_page=100");
  function jobs(runId) {
    const all = [];
    for (let page = 1; ; page++) {
      const r = get(`actions/runs/${runId}/jobs?per_page=100&page=${page}`);
      if (r.error) return { error: r.error };
      const batch = r.json?.jobs || [];
      all.push(...batch);
      if (batch.length < 100) break;
    }
    return { json: all };
  }
  /** The newest page of issue comments (ascending order: the last page holds them). */
  const comments = (n, count) => get(`issues/${n}/comments?per_page=100&page=${Math.max(1, Math.ceil(count / 100))}`);

  return {
    get, openPrs, prsForBranch, pr, files, checkRuns, ciRuns, allRuns, recentCiRuns, jobs, comments,
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
