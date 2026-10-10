#!/usr/bin/env node
/**
 * @doc Cap concurrent ready-PR full-tier CI: refuse mark-ready when ≥N ready PRs already run full CI.
 * @section runner
 * @skill steward
 *
 * Merge Desk / CI Watch gate (AGENTS.md §Concurrent PRs). Ready PRs each start
 * a ~40-job full-tier `ci.yml` run; stacking many at once during a merge burst
 * saturates the 40-job account limit (docs/notes/CI-MERGE-BURST-2026-10-03.md).
 * Draft PRs stay on the uncapped fast tier — this tool never counts them.
 *
 * GitHub workflow concurrency can only serialize to one run per group, so the
 * desk check is the right place for a 2–3 slot cap. Default MAX_LIVE = 3.
 *
 *   node tools/ci/ready-full-cap.mjs              # exit 0 under cap, 1 at/over
 *   node tools/ci/ready-full-cap.mjs --json
 *   node tools/ci/ready-full-cap.mjs --cap 2
 *   node tools/ci/ready-full-cap.mjs --exclude cursor/my-branch
 *
 * Exit: 0 room to mark ready, 1 refuse (at/over cap), 2 bad args, 3 no token/API.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { githubToken, NO_TOKEN_HINT } from "./github-token.mjs";
import { exitIfHelp } from "../lib/cli-args.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const REPO = "brycejmurrin/f1-game";
export const DEPLOY = "claude/f1-game-project-26h3ng";
export const CI_PATH = ".github/workflows/ci.yml";
/** Max ready PRs allowed to hold an in-progress or queued full-tier ci.yml run. */
export const MAX_LIVE = 3;

/**
 * @param {string} pathQs
 * @param {{ run?: typeof spawnSync, env?: NodeJS.ProcessEnv, gh?: () => string|null }} [opts]
 */
export function api(pathQs, { run = spawnSync, env = process.env, gh } = {}) {
  const token = githubToken(gh !== undefined ? { env, gh } : { env });
  if (!token) return { error: NO_TOKEN_HINT };
  const r = run("curl", ["-sS", "--max-time", "30", "-K", "-", "-w", "\n%{http_code}",
    "-H", "Accept: application/vnd.github+json", "-H", "X-GitHub-Api-Version: 2022-11-28",
    "-H", "Cache-Control: no-cache",
    `https://api.github.com/repos/${REPO}/${pathQs}`],
  { encoding: "utf8", input: `header = "Authorization: Bearer ${token}"\n` });
  if (r.status !== 0) return { error: (r.stderr || "curl failed").trim() };
  const out = (r.stdout || "").split("\n");
  const code = Number(out.pop());
  try { return code === 200 ? { json: JSON.parse(out.join("\n")) } : { error: `HTTP ${code}` }; }
  catch { return { error: "bad JSON" }; }
}

/**
 * Ready (non-draft) open PRs into the deploy branch that currently have a
 * queued or in_progress pull_request ci.yml run. Pure: inject lists.
 *
 * @param {Array<{number:number, title?:string, head:{ref:string}, draft?:boolean}>} prs
 * @param {Array<{path?:string, event?:string, status?:string, head_branch?:string, id?:number, html_url?:string}>} runs
 * @param {{ exclude?: Iterable<string>, cap?: number }} [opts]
 */
export function evaluate(prs, runs, opts = {}) {
  const cap = opts.cap ?? MAX_LIVE;
  const exclude = new Set(opts.exclude || []);
  const ready = (prs || []).filter((p) => p && p.draft === false && p.head?.ref && !exclude.has(p.head.ref));
  const byBranch = new Map(ready.map((p) => [p.head.ref, p]));
  const liveStatuses = new Set(["queued", "in_progress", "waiting", "requested", "pending"]);
  const liveCi = (runs || []).filter((r) =>
    r
    && r.path === CI_PATH
    && r.event === "pull_request"
    && liveStatuses.has(r.status)
    && r.head_branch
    && byBranch.has(r.head_branch));
  /** @type {Map<string, {number:number, title:string, headRefName:string, status:string, runId?:number, url?:string}>} */
  const slots = new Map();
  for (const r of liveCi) {
    const pr = byBranch.get(r.head_branch);
    const cur = slots.get(r.head_branch);
    // Newest / most-active status wins when several runs exist for one branch.
    if (!cur || (r.id || 0) > (cur.runId || 0)) {
      slots.set(r.head_branch, {
        number: pr.number,
        title: pr.title || "",
        headRefName: r.head_branch,
        status: r.status,
        runId: r.id,
        url: r.html_url,
      });
    }
  }
  const list = [...slots.values()].sort((a, b) => a.number - b.number);
  const count = list.length;
  const ok = count < cap;
  return { ok, count, cap, slots: list, exclude: [...exclude] };
}

/** One human line for desks / PR bodies. */
export function reportLine(v) {
  if (!v) return "ready-full-cap: no verdict";
  const heads = v.slots.map((s) => `#${s.number}(${s.status})`).join(" ");
  if (v.ok) {
    return `ready-full-cap: ${v.count}/${v.cap} ready full-tier live — room to mark ready${heads ? ` [${heads}]` : ""}`;
  }
  return `ready-full-cap: REFUSE mark-ready — ${v.count}/${v.cap} ready PRs already have in-progress/queued full-tier CI${heads ? `: ${heads}` : ""}. Wait for a slot; draft fast-tier stays uncapped.`;
}

function parseArgs(argv) {
  const out = { json: false, cap: MAX_LIVE, exclude: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") out.json = true;
    else if (a === "--cap") {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n < 1) return { error: `--cap needs a positive integer (got ${argv[i]})` };
      out.cap = Math.floor(n);
    } else if (a === "--exclude") {
      const b = argv[++i];
      if (!b) return { error: "--exclude needs a branch name" };
      out.exclude.push(b);
    } else if (a === "--help" || a === "-h") out.help = true;
    else return { error: `unknown arg: ${a}` };
  }
  return out;
}

/**
 * Fetch open PRs + live ci.yml runs and evaluate. Injectable `request` for tests.
 * @param {{ request?: typeof api, cap?: number, exclude?: string[] }} [opts]
 */
export function measure(opts = {}) {
  const request = opts.request || api;
  const prs = [];
  for (let page = 1; page <= 5; page++) {
    const r = request(`pulls?state=open&base=${encodeURIComponent(DEPLOY)}&per_page=100&page=${page}`);
    if (r.error) return { ok: false, error: r.error, count: null, cap: opts.cap ?? MAX_LIVE, slots: [] };
    const batch = Array.isArray(r.json) ? r.json : [];
    prs.push(...batch);
    if (batch.length < 100) break;
  }
  const runs = [];
  // ci.yml's pull_request runs only, and every page (15-F11): the repo-wide first 100 runs
  // filled with other workflows and sibling fan-out in a merge burst, so older queued ready-PR
  // runs fell off and the count read under the cap.
  for (const status of ["in_progress", "queued"]) {
    for (let page = 1; page <= 10; page++) {
      const r = request(`actions/workflows/ci.yml/runs?event=pull_request&status=${status}&per_page=100&page=${page}`);
      if (r.error) return { ok: false, error: r.error, count: null, cap: opts.cap ?? MAX_LIVE, slots: [] };
      const batch = r.json?.workflow_runs || [];
      runs.push(...batch);
      if (batch.length < 100) break;
    }
  }
  return evaluate(prs, runs, { cap: opts.cap, exclude: opts.exclude });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  exitIfHelp(argv, `usage: node tools/ci/ready-full-cap.mjs [--cap N] [--exclude <branch>] [--json]

Merge Desk: refuse marking a draft ready when ≥N (default ${MAX_LIVE}) ready PRs
already have in-progress or queued full-tier ci.yml. Draft fast-tier is uncapped.
Exit 0 = room, 1 = refuse, 2 = bad args, 3 = API/token.`);
  const args = parseArgs(argv);
  if (args.error) {
    console.error(`ready-full-cap: ${args.error}`);
    process.exit(2);
  }
  const v = measure({ cap: args.cap, exclude: args.exclude });
  if (v.error) {
    console.error(`ready-full-cap: ${v.error}`);
    process.exit(3);
  }
  if (args.json) {
    console.log(JSON.stringify({ ...v, line: reportLine(v) }, null, 2));
  } else {
    console.log(reportLine(v));
    if (!v.ok) {
      for (const s of v.slots) {
        console.log(`  #${s.number} ${s.headRefName} ${s.status}${s.url ? ` ${s.url}` : ""} — ${s.title}`);
      }
    }
  }
  process.exit(v.ok ? 0 : 1);
}
