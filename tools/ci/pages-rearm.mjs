#!/usr/bin/env node
// @doc Re-arm the Pages train when its queue dropped the deploy tip's own run (#5530).
//
//   node tools/ci/pages-rearm.mjs              # print the decision
//   node tools/ci/pages-rearm.mjs --dispatch   # and dispatch pages.yml on the deploy branch when it says rearm
//   node tools/ci/pages-rearm.mjs --red-tip [--dispatch]   # .github/workflows/pages-red-tip.yml: a prose-only push on a red tip
//
// WHY. pages.yml's `pages-train-<ref>` group keeps one running and one pending run, and a later ARRIVAL
// replaces the pending one. GitHub admits runs to a group in the order it evaluates them, which is not the
// order of their commits: on 2026-11-11 run #5108 (1c1ac46c, created 18:54:50Z) and run #5109 (240426c6,
// its child and the tip, created 18:54:52Z) entered in reverse, so #5109 took the pending slot at 18:54:53Z
// and #5108 replaced it at 18:55:08Z. The tip was left with no train until the next push.
// No concurrency key can order two arrivals, so the cure is on the other side: the run that DID survive
// looks, when it starts, at whether the tip lost its train this way, and dispatches one. The dispatched run
// joins the same group as the one pending run; a newer push replaces it exactly as before.
//
// Exit 0 always (a lookup or dispatch failure is a warning: the 6-hourly cron is still the backstop, and a
// red job here would turn a good publish red). Env: GITHUB_REPOSITORY, GITHUB_SHA, GITHUB_RUN_ID,
// DEPLOY_BRANCH, GH_TOKEN (actions: read; actions: write for --dispatch).
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * The decision, pure. `runs` are pages.yml runs on the deploy branch (REST shape: id, head_sha, status,
 * conclusion, created_at); `jobCount(run)` is the number of jobs that run ever started.
 * Rearm only on positive evidence of the #5530 loss, never on a guess:
 *   - this run is not the tip's (the tip's own run needs no help);
 *   - the tip HAS a Pages run (a prose-only tip starts none; that is the cron's);
 *   - none of the tip's runs is live (queued, pending, in progress: a train is coming);
 *   - none of them ran (a success, a failure, or a cancel after jobs started is a verdict, not a loss);
 *   - so every one of them was cancelled before any job started: replaced while pending.
 * @param {{ sha: string, tip: string, self?: string|number, runs: any[], jobCount: (run: any) => number }} q
 * @returns {{ rearm: boolean, reason: string }}
 */
export function decide({ sha, tip, self, runs, jobCount }) {
  if (!tip) return { rearm: false, reason: "tip unreadable" };
  if (sha === tip) return { rearm: false, reason: "this run is the tip's own train" };
  const mine = (runs || []).filter((r) => r.head_sha === tip && String(r.id) !== String(self ?? ""));
  if (!mine.length) return { rearm: false, reason: `tip ${tip.slice(0, 8)} has no Pages run (prose-only push, or its event is still in flight)` };
  const live = mine.find((r) => r.status !== "completed");
  if (live) return { rearm: false, reason: `tip ${tip.slice(0, 8)} already has run ${live.id} ${live.status}` };
  const ran = mine.find((r) => r.conclusion !== "cancelled" || jobCount(r) > 0);
  if (ran) return { rearm: false, reason: `tip ${tip.slice(0, 8)} was gated by run ${ran.id} (${ran.conclusion})` };
  const lost = mine.map((r) => r.id).join(", ");
  return { rearm: true, reason: `tip ${tip.slice(0, 8)} lost its train: run ${lost} was replaced while pending and nothing is queued for it` };
}

/** pages.yml's `on.push.paths-ignore`, verbatim: a push whose every path matches starts no train.
 *  tests/unit/ci-pages-train.test.mjs pins this list against pages.yml AND pages-red-tip.yml's `paths`. */
export const PROSE_GLOBS = ["docs/**", "**/*.md", ".claude/**", ".cursor/**", ".codex/**"];
export const isProse = (f) => /^(?:docs|\.claude|\.cursor|\.codex)\//.test(f) || /\.md$/.test(f);

/**
 * RED TIP, PROSE PUSH (2026-11-25). #6406 (docs-only) fixed a red deploy tip at 00:19Z, but pages.yml ignores prose
 * paths, so no train gated the fix and the tip read red until Bryce dispatched Pages by hand at 00:21Z. The
 * decision, pure: dispatch ONE train for a prose-only push exactly when
 *   - this push is still the tip (a newer push has its own event);
 *   - its diff is readable, complete and prose-only (any other path means pages.yml's own push trigger fired);
 *   - no Pages run on the branch is live (a train is coming; the single-flight group would take it anyway);
 *   - the newest completed Pages run on the branch failed (green or cancelled: nothing to cure).
 * Any such prose push re-arms, not only the one that is the fix: a README edit on a tip red for code dispatches one
 * gate that fails again. Accepted: the single-flight group and the live-run check bound it to one train at a time.
 * `files` names both ends of a rename (previous_filename), so a code file moved under docs/ is not prose-only.
 * @param {{ sha: string, tip: string, files: string[] | null, truncated?: boolean, runs: any[] }} q
 * @returns {{ rearm: boolean, reason: string }}
 */
export function decideRedTip({ sha, tip, files, truncated = false, runs }) {
  if (!tip) return { rearm: false, reason: "tip unreadable" };
  if (sha !== tip) return { rearm: false, reason: `${String(sha).slice(0, 8)} is no longer the tip (${tip.slice(0, 8)} is): its own push decides` };
  if (!Array.isArray(files) || !files.length || truncated) return { rearm: false, reason: "push diff unreadable or truncated; the cron is the backstop" };
  const code = files.find((f) => !isProse(f));
  if (code) return { rearm: false, reason: `not prose-only (${code}): pages.yml's own push starts the train` };
  const live = (runs || []).find((r) => r.status !== "completed");
  if (live) return { rearm: false, reason: `Pages run ${live.id} is already ${live.status}` };
  const last = (runs || []).filter((r) => r.status === "completed").sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
  if (!last) return { rearm: false, reason: "no completed Pages run on the branch" };
  if (!["failure", "timed_out", "startup_failure"].includes(last.conclusion))
    return { rearm: false, reason: `the newest Pages run ${last.id} is ${last.conclusion}: the tip is not red` };
  return { rearm: true, reason: `the newest Pages run ${last.id} (${String(last.head_sha).slice(0, 8)}) is ${last.conclusion} and this prose-only push started no train` };
}

const gh = (args) => execFileSync("gh", ["api", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

function main(argv) {
  const dispatch = argv.includes("--dispatch");
  const repo = process.env.GITHUB_REPOSITORY || "";
  const branch = process.env.DEPLOY_BRANCH || "";
  const sha = process.env.GITHUB_SHA || "";
  const out = (line) => {
    console.log(line);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
  };
  if (!repo || !branch || !sha) { console.log("::warning::pages-rearm: GITHUB_REPOSITORY, DEPLOY_BRANCH and GITHUB_SHA are required; nothing done"); return; }
  if (process.env.GITHUB_REF_NAME && process.env.GITHUB_REF_NAME !== branch) { console.log(`pages-rearm: not on ${branch}; nothing done`); return; }
  let verdict;
  if (argv.includes("--red-tip")) {
    try {
      const tip = gh([`repos/${repo}/git/ref/heads/${branch}`, "-q", ".object.sha"]).trim();
      const before = process.env.BEFORE || "";
      let files = null, truncated = false;
      if (/^[0-9a-f]{40}$/.test(before) && !/^0+$/.test(before)) {
        const cmp = JSON.parse(gh([`repos/${repo}/compare/${before}...${sha}`, "-q", "{n: (.files | length), files: [.files[] | .filename, (.previous_filename // empty)]}"]));
        files = cmp.files; truncated = cmp.n >= 300;   // the compare API lists at most 300 files
      }
      const runs = JSON.parse(gh(["-X", "GET", `repos/${repo}/actions/workflows/pages.yml/runs`,
        "-f", `branch=${branch}`, "-f", "per_page=20", "-q", "[.workflow_runs[] | {id, head_sha, status, conclusion, created_at}]"]));
      verdict = decideRedTip({ sha, tip, files, truncated, runs });
    } catch (e) {
      console.log(`::warning::pages-rearm --red-tip: lookup failed (${String(e.stderr || e.message).trim().split("\n")[0]}); not dispatching, the cron is the backstop`);
      return;
    }
  } else try {
    const tip = gh([`repos/${repo}/git/ref/heads/${branch}`, "-q", ".object.sha"]).trim();
    const runs = sha === tip ? [] : JSON.parse(gh(["-X", "GET", `repos/${repo}/actions/workflows/pages.yml/runs`,
      "-f", `branch=${branch}`, "-f", "per_page=50", "-q", "[.workflow_runs[] | {id, head_sha, status, conclusion, created_at}]"]));
    const jobCount = (r) => Number(gh([`repos/${repo}/actions/runs/${r.id}/jobs`, "-q", ".total_count"]).trim());
    verdict = decide({ sha, tip, self: process.env.GITHUB_RUN_ID, runs, jobCount });
  } catch (e) {
    console.log(`::warning::pages-rearm: lookup failed (${String(e.stderr || e.message).trim().split("\n")[0]}); not re-arming, the cron is the backstop`);
    return;
  }
  out(`**Re-arm**: ${verdict.rearm ? "yes" : "no"}: ${verdict.reason}`);
  if (!verdict.rearm || !dispatch) return;
  try {
    gh(["-X", "POST", `repos/${repo}/actions/workflows/pages.yml/dispatches`, "-f", `ref=${branch}`]);
    out(`dispatched pages.yml on ${branch}`);
  } catch (e) {
    console.log(`::warning::pages-rearm: dispatch failed (${String(e.stderr || e.message).trim().split("\n")[0]}); the tip waits for the next push or the cron`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) main(process.argv.slice(2));
