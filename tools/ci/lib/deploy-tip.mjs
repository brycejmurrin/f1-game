// deploy-tip.mjs — is the deploy tip red on CODE? The newest COMPLETED pages.yml run on the deploy branch, read
// through its jobs. Shared by merge-gate's `base` row, needs-sync's `tip-red` verdict and dispatch's fixer launch
// (#5425; docs/notes/ORCHESTRATION-REVIEW-2026-11-11.md draft I1, decision 1 "Gate holds merges, one fixer").
// @doc Is the deploy tip red on code? Newest completed pages.yml run + its jobs; a Pages-side publish failure is not.
// @section runner
//
// A PLATFORM failure is not a code red: pages.yml's `deploy` job marks a Pages-side publish failure (both publish
// attempts failed after the recheck) with the step PLATFORM_STEP failing — the real case is run 42880431465
// (2026-11-10, head 1421575a: every ci / … job green, `deploy` failed in "Publish to Pages (retry)", PLATFORM_STEP
// and "Deploy verdict"). That one excuse is the only one: any other failed job, or a `deploy` failure WITHOUT the
// marker (a refusal under the Pages lock is a fixer's job, as dispatch already treats it), is a code red.
// Pure except readDeployTip, whose `request` is injected (github-api.mjs's { json, error } shape).

/** pages.yml's REST-visible marker (job `deploy`): `failure` only when both publish attempts failed after the recheck. */
export const PLATFORM_STEP = "Pages publish failed (platform)";
/** The pages.yml job that carries PLATFORM_STEP. */
export const DEPLOY_JOB = "deploy";
/** Job conclusions that are a red (the same set merge-gate's ci retry row uses). */
export const RED_CONCLUSIONS = new Set(["failure", "timed_out", "startup_failure"]);
/** Run conclusions that are a failed train. */
const RED_RUN = new Set(["failure", "timed_out", "startup_failure"]);

/** Did the `deploy` job's PLATFORM_STEP fail in `jobs` (the run's jobs list)? Pure. */
export const platformStepFailed = (jobs) => (jobs || []).some((j) => j?.name === DEPLOY_JOB
  && (j.steps || []).some((st) => st?.name === PLATFORM_STEP && st.conclusion === "failure"));

/** The failed jobs that are a CODE red: every red job, less the `deploy` job when its PLATFORM_STEP failed. Pure. */
export function codeRedJobs(jobs) {
  const platform = platformStepFailed(jobs);
  return (jobs || []).filter((j) => RED_CONCLUSIONS.has(j?.conclusion) && !(platform && j.name === DEPLOY_JOB));
}

/**
 * The tip's state from the newest completed pages.yml run and its jobs. Pure.
 * @param {object|null} run   workflow run (id, conclusion, head_sha) or null when the branch has no completed run
 * @param {object[]|null} jobs that run's jobs (latest attempt); null when not read (a green run needs none)
 * A failed run is "platform" ONLY when the marker step failed and no other job is red; a failed run with no red job
 * at all (a startup_failure with no jobs — a pages.yml syntax error — or every job cancelled) is a code red: the
 * row fails closed. `runAt` is the run's created_at, so an escape label can be bound to this red (merge-gate base).
 * @returns {{ state: "green"|"code-red"|"platform"|"none", runId: number|null, runAt: string|null, jobs: string[], evidence: string }}
 */
export function tipState(run, jobs = null) {
  if (!run) return { state: "none", runId: null, runAt: null, jobs: [], evidence: "no completed pages.yml run on the deploy branch" };
  const id = run.id ?? null, sha = String(run.head_sha || "").slice(0, 8), runAt = run.created_at || null;
  const at = `pages.yml run ${id} on ${sha || "?"}`;
  if (!RED_RUN.has(run.conclusion)) return { state: "green", runId: id, runAt, jobs: [], evidence: `${at} concluded ${run.conclusion || "?"}` };
  const red = codeRedJobs(jobs);
  if (!red.length && platformStepFailed(jobs)) {
    return { state: "platform", runId: id, runAt, jobs: [], evidence: `${at} concluded ${run.conclusion}, not on code: only job \`${DEPLOY_JOB}\` failed, at step "${PLATFORM_STEP}" (Pages side)` };
  }
  if (!red.length) return { state: "code-red", runId: id, runAt, jobs: [], evidence: `${at} concluded ${run.conclusion} with no job red and no Pages-side marker (${(jobs || []).length} job(s) listed): counted as code` };
  const names = red.map((j) => j.name);
  const shown = names.slice(0, 3).map((n) => `\`${n}\``).join(", ") + (names.length > 3 ? ` and ${names.length - 3} more` : "");
  return { state: "code-red", runId: id, runAt, jobs: names, evidence: `${at} concluded ${run.conclusion} on code: failed job(s) ${shown}` };
}

/** Run conclusions that say nothing about the tip (a cancelled or skipped train): the read looks past them. */
const SILENT_RUN = new Set(["cancelled", "skipped", "neutral", "stale"]);
/** Read the tip: the newest completed pages.yml run on `branch` that is not cancelled or skipped (of the newest 20),
 *  then (only when it failed) its jobs, every page. A response without its array is an error, never "none" or "green".
 *  → tipState(...) | { error }. `request(path)` → { json, error }. */
export function readDeployTip(branch, request) {
  const r = request(`actions/workflows/pages.yml/runs?branch=${encodeURIComponent(branch)}&status=completed&per_page=20`);
  if (r?.error) return { error: `pages.yml runs on ${branch}: ${r.error}` };
  if (!Array.isArray(r?.json?.workflow_runs)) return { error: `pages.yml runs on ${branch}: no workflow_runs array in the response` };
  const run = r.json.workflow_runs.find((x) => !SILENT_RUN.has(x?.conclusion)) || null;
  if (!run || !RED_RUN.has(run.conclusion)) return tipState(run);
  const jobs = [];
  for (let page = 1; page <= 10; page++) {
    const j = request(`actions/runs/${run.id}/jobs?filter=latest&per_page=100&page=${page}`);
    if (j?.error) return { error: `jobs of pages.yml run ${run.id}: ${j.error}` };
    if (!Array.isArray(j?.json?.jobs)) return { error: `jobs of pages.yml run ${run.id}: no jobs array in the response` };
    const rows = j.json.jobs;
    jobs.push(...rows);
    if (rows.length < 100) return tipState(run, jobs);
  }
  return { error: `jobs of pages.yml run ${run.id}: more than 10 pages` };
}
