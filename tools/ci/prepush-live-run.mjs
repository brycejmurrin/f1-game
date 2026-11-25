#!/usr/bin/env node
/**
 * @doc Warn-only pre-push notice: this branch's PR is READY and a ci.yml run on the head you are replacing is still running.
 * @section runner
 * @skill steward
 *
 * A push to a ready PR cancels its in-flight ci.yml run (`cancel-in-progress`
 * on the `ci-pr-<n>` group, which is right; #6536 R1). The browser review
 * (#6557 P5) measured 21 ready runs cancelled in 2.73 days at a median
 * 209 job-min each, about 1.5k job-min/day, and D-046 found 77% of 140
 * cancelled CI wall-hours were heads replaced mid-run. Skill steward §Push
 * already says "never push while a CI run on your head is still running";
 * this prints that rule at the moment it applies. It NEVER blocks a push
 * (Bryce, #6557, 2026-11-25: "warn-only"): every outcome exits 0, and
 * a missing token, offline box or API error prints nothing.
 *
 *   node tools/ci/prepush-live-run.mjs --branch <name> --sha <remote head sha>
 *
 * .githooks/pre-push calls it once per updated branch ref that already
 * exists on the remote, with a short timeout. APEX_PREPUSH_NOTICE=0 skips it.
 */
import { pathToFileURL } from "node:url";
import { api, REPO } from "./github-api.mjs";

/** ci.yml run states that a push to the same `ci-pr-<n>` group would cancel. */
export const LIVE_STATES = ["queued", "in_progress", "waiting", "pending", "requested"];

/** The notice text for one ready PR and its runs on `sha`, or null when nothing would be cancelled. */
export function liveRunNotice({ pr, runs, sha }) {
  if (!pr || pr.draft) return null;
  const live = (runs || []).filter((r) => r && r.head_sha === sha && r.event === "pull_request" && LIVE_STATES.includes(r.status));
  if (!live.length) return null;
  const lines = live.map((r) => `  ${r.status} ${r.html_url || `run ${r.id}`}`);
  return [
    `pre-push: NOTICE — PR #${pr.number} is READY and this push cancels its ci.yml run on ${String(sha).slice(0, 9)}:`,
    ...lines,
    "  Skill steward §Push (D-046): batch the round's fixes and push once that run has finished. This is a warning; the push goes ahead.",
  ].join("\n");
}

/** Look the PR and its runs up; any API failure answers null (never a reason to block or print). */
export function lookup(branch, sha, { get = api } = {}) {
  const opts = { timeoutS: 5, retries: [] };
  const owner = REPO.split("/")[0];
  const prs = get(`pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}&per_page=5`, opts);
  const pr = Array.isArray(prs.json) ? prs.json[0] : null;
  if (!pr || pr.draft) return null;
  const runs = get(`actions/workflows/ci.yml/runs?head_sha=${encodeURIComponent(sha)}&per_page=20`, opts);
  if (!runs.json || !Array.isArray(runs.json.workflow_runs)) return null;
  return liveRunNotice({ pr, runs: runs.json.workflow_runs, sha });
}

function main(argv) {
  if (process.env.APEX_PREPUSH_NOTICE === "0" || process.env.GITHUB_ACTIONS === "true") return;
  const val = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const branch = val("--branch"), sha = val("--sha");
  if (!branch || !/^[0-9a-f]{40}$/.test(sha || "")) return;
  const notice = lookup(branch, sha);
  if (notice) console.error(notice);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  try { main(process.argv.slice(2)); } catch { /* warn-only: never fail a push */ }
  process.exitCode = 0;
}
