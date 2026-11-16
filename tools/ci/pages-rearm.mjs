#!/usr/bin/env node
// @doc Re-arm the Pages train when its queue dropped the deploy tip's own run (#5530).
//
//   node tools/ci/pages-rearm.mjs              # print the decision
//   node tools/ci/pages-rearm.mjs --dispatch   # and dispatch pages.yml on the deploy branch when it says rearm
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
  try {
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
