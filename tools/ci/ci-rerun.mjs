#!/usr/bin/env node
/**
 * @doc Guarded CI re-run: refuses a superseded run (head_sha ≠ PR head), a live run, or a second re-run.
 * @section runner
 * @skill steward
 *
 * AGENTS.md rule 8/9 and the flake policy: re-run a failed job at most once, and
 * only for infra/timeout. The trap this closes (2026-10-15, PR #1800): a base
 * update superseded run 38656987018 — ci.yml's PR concurrency group is
 * `ci-<head.ref>` with cancel-in-progress — so it read "cancelled, 0 failed",
 * which looks like a timeout. Re-running it put a run for the OLD head_sha back
 * into that group, and it cancelled the fresh run on the new head. A superseded
 * PR run must never be re-run; watch the new head's run instead.
 *
 *   node tools/ci/ci-rerun.mjs <run_id>            # re-run the failed jobs (default) after the checks
 *   node tools/ci/ci-rerun.mjs <run_id> --all      # re-run the whole run
 *   node tools/ci/ci-rerun.mjs <run_id> --dry-run  # print the verdict, POST nothing
 *   node tools/ci/ci-rerun.mjs <run_id> --again    # allow a run already on attempt ≥ 2 (say why in the PR)
 *
 * REFUSES (exit 1, nothing posted) when:
 *   - the run is not completed (GitHub answers 403 "This workflow is already running")
 *   - the run concluded success (nothing to re-run)
 *   - the run is a pull_request run whose head_sha is no longer its PR's head (superseded)
 *   - run_attempt ≥ 2 without --again (the one-re-run rule)
 * Exit: 0 posted (or --dry-run ok), 1 refused, 2 bad args, 3 no token / API error.
 *
 * REST (read 2026-10-15):
 *   https://docs.github.com/en/rest/actions/workflow-runs#get-a-workflow-run
 *   https://docs.github.com/en/rest/actions/workflow-runs#re-run-a-workflow
 *   https://docs.github.com/en/rest/actions/workflow-runs#re-run-failed-jobs-from-a-workflow-run
 *     (POST …/runs/{id}/rerun and …/rerun-failed-jobs → 201 Created)
 *   https://docs.github.com/en/rest/pulls/pulls#get-a-pull-request (head.sha)
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { api, REPO } from "./ready-full-cap.mjs";   // import-safe GET (token on stdin, 64 MB buffer)
import { githubToken, NO_TOKEN_HINT } from "./github-token.mjs";
import { exitIfHelp } from "../lib/cli-args.mjs";

/** Pure verdict. `run` is a GET-a-workflow-run body; `prHead` the PR's current
 *  head sha (null when the run is not a PR run or the PR could not be read). */
export function decide(run, prHead, { again = false } = {}) {
  if (!run || typeof run !== "object") return { ok: false, reason: "no run" };
  if (run.status !== "completed") return { ok: false, reason: `run is ${run.status || "not completed"} — GitHub refuses a re-run until every job ends` };
  if (run.conclusion === "success") return { ok: false, reason: "run already succeeded — nothing to re-run" };
  if (run.event === "pull_request" || run.event === "pull_request_target") {
    if (!prHead) return { ok: false, reason: "PR run but the PR head could not be read — refusing rather than risk cancelling a newer run" };
    if (prHead !== run.head_sha) {
      return { ok: false, reason: `superseded: run head ${String(run.head_sha).slice(0, 9)} ≠ PR head ${prHead.slice(0, 9)} — re-running it would join ci-<head.ref> and cancel the live run; watch the new head instead` };
    }
  }
  if ((run.run_attempt || 1) >= 2 && !again) return { ok: false, reason: `already re-run (attempt ${run.run_attempt}) — the one-re-run rule; pass --again only with a reason in the PR` };
  return { ok: true, reason: `run ${run.id} on ${String(run.head_sha).slice(0, 9)} (attempt ${run.run_attempt || 1}, ${run.conclusion})` };
}

/** The PR number a run belongs to: its own `pull_requests` list (same-repo PRs). */
export function prNumberOf(run) {
  const prs = Array.isArray(run?.pull_requests) ? run.pull_requests : [];
  return prs.length ? prs[0].number : null;
}

function post(pathQs, { run = spawnSync, env = process.env } = {}) {
  const token = githubToken({ env });
  if (!token) return { error: NO_TOKEN_HINT };
  const r = run("curl", ["-sS", "--max-time", "30", "-K", "-", "-X", "POST", "-o", "/dev/null", "-w", "%{http_code}",
    "-H", "Accept: application/vnd.github+json", "-H", "X-GitHub-Api-Version: 2022-11-28",
    `https://api.github.com/repos/${REPO}/${pathQs}`],
  { encoding: "utf8", input: `header = "Authorization: Bearer ${token}"\n` });
  if (r.status !== 0) return { error: (r.stderr || "curl failed").trim() };
  const code = Number((r.stdout || "").trim());
  return code === 201 ? { ok: true } : { error: `HTTP ${code}` };
}

async function main(argv) {
  exitIfHelp(argv, `usage: node tools/ci/ci-rerun.mjs <run_id> [--all] [--dry-run] [--again]
  Re-runs a CI run's failed jobs (--all: the whole run) only when it is completed, not green,
  not superseded (a PR run's head_sha must still be its PR head) and not already re-run.
  Exit: 0 posted / dry-run ok, 1 refused, 2 bad args, 3 no token or API error.`);
  const id = argv.find((a) => /^\d+$/.test(a));
  const unknown = argv.find((a) => a.startsWith("-") && !["--all", "--dry-run", "--again"].includes(a));
  if (!id || unknown) { console.error(`ci-rerun: usage: ci-rerun.mjs <run_id> [--all] [--dry-run] [--again]${unknown ? ` (unknown ${unknown})` : ""}`); return 2; }
  const r = api(`actions/runs/${id}`);
  if (r.error) { console.error(`ci-rerun: ${r.error}`); return 3; }
  const run = r.json;
  let prHead = null;
  const n = prNumberOf(run);
  if (n) { const p = api(`pulls/${n}`); if (!p.error) prHead = p.json?.head?.sha || null; }
  const v = decide(run, prHead, { again: argv.includes("--again") });
  if (!v.ok) { console.log(`= rerun refused — ${v.reason}`); return 1; }
  if (argv.includes("--dry-run")) { console.log(`= rerun ok (dry run) — ${v.reason}`); return 0; }
  const res = post(`actions/runs/${id}/${argv.includes("--all") ? "rerun" : "rerun-failed-jobs"}`);
  if (res.error) { console.error(`ci-rerun: POST failed: ${res.error}`); return 3; }
  console.log(`= rerun posted — ${v.reason}${argv.includes("--all") ? " (whole run)" : " (failed jobs)"}`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then((c) => process.exit(c));
}
