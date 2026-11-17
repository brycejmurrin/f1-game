#!/usr/bin/env node
/**
 * @doc Aggregate GitHub Actions `needs` results into one required-check verdict.
 * @section runner
 *
 * Skipped required checks block merging. Path-filtered jobs therefore cannot
 * be required by name; this script is the one stable check (`ci-verdict` /
 * job name `CI`). A needed job that is skipped by its `if:` is a pass. A
 * needed job that failed or was cancelled fails the aggregator. Advisory jobs
 * (continue-on-error) never fail it.
 *
 * Failed or cancelled selected jobs remain red even if sibling JUnit is clean.
 * No successful verdict may substitute for execution of the planned tests.
 *
 * FULL-TIER STRICTNESS (#2664): `REQUIRE_SUCCESS=a,b,c` names jobs that must be `success`, not skipped. The workflow sets
 * it only for a non-draft PR run, where a job skipped by `if:` would read as success and a hollow run would look green.
 *
 * LEGIBILITY (#3507): a green `CI` carries the FAILURES of its needed jobs, not their execution. `summary(needs, v)` renders
 * which jobs ran and passed vs which were skipped, and main() appends it to $GITHUB_STEP_SUMMARY.
 *
 * It also fails when it was handed nothing: NEEDS unset / empty / `{}` exits 2,
 * and a payload with no `success` at all (everything skipped) fails with exit 1.
 *
 *   node tools/ci/ci-verdict.mjs                 # reads NEEDS env (toJSON(needs))
 *   node tools/ci/ci-verdict.mjs --json          # print {ok,bad} instead of exit
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ADVISORY = new Set();

/**
 * @param {Record<string, { result?: string }>} needs
 * @param {{ advisory?: Iterable<string> }} [opts]
 * @returns {{ ok: boolean, bad: string[], skipped: string[], passed: string[] }}
 */
export function verdict(needs, opts = {}) {
  const advisory = new Set(opts.advisory || ADVISORY);
  const require = [...(opts.require || [])];
  const bad = [];
  const skipped = [];
  const passed = [];
  if (!needs || typeof needs !== "object" || Array.isArray(needs)) {
    return { ok: false, bad: ["needs payload missing"], skipped, passed };
  }
  // An aggregator handed NOTHING must not read as green: a dropped `env: NEEDS:`
  // line or a renamed key would otherwise pass every PR.
  if (Object.keys(needs).length === 0) {
    return { ok: false, bad: ["needs payload empty — no job results to judge"], skipped, passed };
  }
  for (const [name, row] of Object.entries(needs)) {
    const result = row && typeof row === "object" ? String(row.result || "") : "";
    if (advisory.has(name)) {
      if (result === "success" || result === "skipped" || result === "failure") {
        skipped.push(`${name}: advisory (${result || "empty"})`);
        continue;
      }
      if (result === "cancelled") {
        bad.push(`${name}: cancelled`);
        continue;
      }
      bad.push(`${name}: unknown result ${JSON.stringify(result)}`);
      continue;
    }
    if (result === "success") passed.push(name);
    else if (result === "skipped") skipped.push(name);
    else if (result === "failure" || result === "cancelled") bad.push(`${name}: ${result}`);
    else bad.push(`${name}: unknown result ${JSON.stringify(result)}`);
  }
  for (const name of require) {
    const result = needs[name] && typeof needs[name] === "object" ? String(needs[name].result || "") : "";
    if (result !== "success") bad.push(`${name}: required to succeed on a full-tier run, got ${result || "missing"}`);
  }
  // A PLAN THAT SAID "RUN" AND A JOB THAT DID NOT (#5241 G5). `skipped` is a pass above because a path-filtered job
  // skips legitimately — but the select job's own outputs (toJSON(needs) carries them) say when it may not: a plan
  // with browser legs (`any`) owes a `selected` result, a successful selection owes its verdict job, and on a
  // full-tier PR run a plan with node slices (`any_node`) owes `node-suites` (drafts and the train skip it by
  // design, D1/D2 2026-10-16). Each was a green before: REQUIRE_SUCCESS names none of the three.
  const res = (job) => (needs[job] && typeof needs[job] === "object" ? String(needs[job].result || "") : "");
  const sel = needs.select && typeof needs.select === "object" ? needs.select : null;
  if (sel) {
    const out = sel.outputs && typeof sel.outputs === "object" ? sel.outputs : {};
    // The one sanctioned skip (#5426): a ready flip whose select job proved the same-sha draft verdict reusable.
    // The verdict job still has to pass (and is in the full tier's REQUIRE_SUCCESS); it re-checks the claim.
    const reused = out.selected_reused === "true" && /^\d+$/.test(String(out.selected_reused_run || ""));
    if (out.any === "true" && "selected" in needs && res("selected") === "skipped" && !reused)
      bad.push("selected: skipped, but the plan has browser legs (select.outputs.any=true) — the selected specs did not run");
    if (sel.result === "success" && "selected-verdict" in needs && res("selected-verdict") === "skipped")
      bad.push("selected-verdict: skipped after a successful selection — nothing judged the selected specs");
    if (opts.fullTier && out.any_node === "true" && "node-suites" in needs && res("node-suites") === "skipped")
      bad.push("node-suites: skipped on a full-tier run whose plan has node slices (select.outputs.any_node=true) — the VM twins and unit slices did not run");
  }
  // Skipped-only is not green either: when every needed job was skipped (a
  // workflow whose gates all hung off one input) nothing was actually checked.
  // (A named core set is deliberately NOT required: a called run may skip
  // jobs by its inputs, and the jobs list is ci.yml's to shape.)
  if (bad.length === 0 && passed.length === 0) {
    bad.push("no needed job succeeded — every result was skipped or advisory, so nothing was verified");
  }
  return { ok: bad.length === 0, bad, skipped, passed };
}

/**
 * Markdown for the job summary: executed-and-passed jobs vs skipped ones, so a reader of a green `CI` can tell what ran.
 * @param {{ ok: boolean, bad: string[], skipped: string[], passed: string[] }} v
 * @param {string[]} [require]
 */
export function summary(v, require = []) {
  const list = (a) => (a.length ? a.map((x) => `\`${x}\``).join(", ") : "none");
  return [
    `### CI verdict: ${v.ok ? "PASS" : "FAIL"}`,
    "",
    `- **Executed and passed (${v.passed.length}):** ${list(v.passed)}`,
    `- **Skipped by \`if:\` or advisory (${v.skipped.length}) — NOT verified by this run:** ${list(v.skipped)}`,
    `- **Required to have run (${require.length}):** ${list(require)}`,
    ...(v.bad.length ? ["", "**Failures:**", ...v.bad.map((b) => `- ${b}`)] : []),
    "",
    "A green `CI` means no needed job failed; a skipped job did not execute, and only the required set above must have succeeded.",
    "",
  ].join("\n");
}

/**
 * A CI success on run attempt N > 1 (#5241 G5, AGENTS.md rule 9: a pass that needed a retry is a red until the PR
 * names it). Measured: #5190 merged on run 42730286157 attempt 2 after attempt 1 failed tests/unit/perf-hot-bench.test.mjs.
 * Pure. `attempt` is the newest attempt of the ci.yml run that carries the green `CI`; `previous` the conclusion of
 * attempt N-1 (`actions/runs/<id>/attempts/<n>`), "" when unread; `body` the PR body. A cancelled previous attempt is
 * the designed dedupe or a timeout re-queue, not a red. The escape is a body line `re-run: <what failed> — <why>`,
 * which is what rule 9 asks for; without it the verdict is not ok.
 * @returns {{ ok: boolean, rerun: boolean, evidence: string }}
 */
export function rerunVerdict({ attempt = 1, previous = "", body = "" } = {}) {
  const n = Number(attempt) || 1;
  if (n <= 1) return { ok: true, rerun: false, evidence: "first attempt" };
  const prev = String(previous || "");
  if (prev === "cancelled" || prev === "skipped") return { ok: true, rerun: true, evidence: `attempt ${n} after a ${prev} attempt ${n - 1} (no red was re-run)` };
  const named = /^[ \t>*-]*re-run:[ \t]*\S.*$/im.exec(String(body || "").replace(/<!--[\s\S]*?-->/g, ""));
  if (named) return { ok: true, rerun: true, evidence: `attempt ${n} after attempt ${n - 1} ${prev || "of unknown conclusion"}; named in the PR body: "${named[0].trim().slice(0, 120)}"` };
  return { ok: false, rerun: true, evidence: `CI is green only on attempt ${n} (attempt ${n - 1}: ${prev || "conclusion unread"}) — a pass that needed a retry is a red (AGENTS.md rule 9): fix or quarantine the test, or name the re-run in the PR body as \`re-run: <what failed> — <why it was infra>\`` };
}

function main(argv = process.argv.slice(2)) {
  let needs;
  if (!process.env.NEEDS || !process.env.NEEDS.trim()) {
    console.error("::error::ci-verdict: NEEDS is unset or empty — the workflow did not hand over toJSON(needs)");
    process.exit(2);
  }
  try {
    needs = JSON.parse(process.env.NEEDS);
  } catch (e) {
    console.error(`::error::ci-verdict: NEEDS is not JSON (${e.message})`);
    process.exit(2);
  }
  if (!needs || typeof needs !== "object" || !Object.keys(needs).length) {
    console.error("::error::ci-verdict: NEEDS holds no job results");
    process.exit(2);
  }
  const require = String(process.env.REQUIRE_SUCCESS || "").split(",").map((x) => x.trim()).filter(Boolean);
  const v = verdict(needs, { require, fullTier: require.length > 0 });
  // This job cannot read attempt N-1 (no token here); it can say that it is one. The binding check is merge-gate's
  // ciRetryVerdict (the `ci` row): it reads every earlier attempt's jobs and refuses after any failed one, whatever
  // the body says (#5404: a `re-run:` body line does not lift it there, so this warning does not promise that).
  const attempt = Number(process.env.GITHUB_RUN_ATTEMPT || 1) || 1;
  if (attempt > 1) console.log(`::warning::CI verdict on run attempt ${attempt}: a pass that needed a retry is a red (AGENTS.md rule 9) — merge-gate refuses it if an earlier attempt had a failed job; push a fresh commit, or quarantine the test by name`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary(v, require)); } catch { /* the summary is advisory */ }
  }
  if (argv.includes("--json")) {
    console.log(JSON.stringify(v, null, 2));
    process.exit(v.ok ? 0 : 1);
  }
  if (!v.ok) {
    for (const b of v.bad) console.error(`::error::CI verdict: ${b}`);
    console.error(`ci-verdict FAILED (${v.bad.length})`);
    process.exit(1);
  }
  console.log(`ci-verdict PASS (${v.passed.length} success, ${v.skipped.length} skipped/advisory)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
