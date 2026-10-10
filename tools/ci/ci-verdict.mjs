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
 * `selected` defers to `selected-verdict` when that job succeeded: a matrix
 * shard can report `cancelled` (job-cap kill after a clean pass — run
 * 37493213168) while selected-verdict marks infra-retry from clean junit.
 * Without the deferral, CI would stay red even after the gate's own verdict
 * passed. When selected-verdict failed, that row already fails the aggregator.
 *
 * It also fails when it was handed nothing: NEEDS unset / empty / `{}` exits 2,
 * and a payload with no `success` at all (everything skipped) fails with exit 1.
 *
 *   node tools/ci/ci-verdict.mjs                 # reads NEEDS env (toJSON(needs))
 *   node tools/ci/ci-verdict.mjs --json          # print {ok,bad} instead of exit
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ADVISORY = new Set(["baseline-trial"]);

/** Jobs whose red/cancel is owned by another needed job when that owner is green. */
export const DEFER_TO = Object.freeze({ selected: "selected-verdict" });

/**
 * @param {Record<string, { result?: string }>} needs
 * @param {{ advisory?: Iterable<string>, deferTo?: Record<string, string> }} [opts]
 * @returns {{ ok: boolean, bad: string[], skipped: string[], passed: string[] }}
 */
export function verdict(needs, opts = {}) {
  const advisory = new Set(opts.advisory || ADVISORY);
  const deferTo = opts.deferTo || DEFER_TO;
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
    const owner = deferTo[name];
    if (owner && needs[owner] && String(needs[owner].result || "") === "success"
        && (result === "failure" || result === "cancelled")) {
      // selected-verdict already judged the change-aware gate (incl. cancel +
      // clean junit → infra-retry). Do not double-fail CI on the matrix rollup.
      skipped.push(`${name}: deferred to ${owner} (${result})`);
      continue;
    }
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
  // Skipped-only is not green either: when every needed job was skipped (a
  // workflow whose gates all hung off one input) nothing was actually checked.
  // (A named core set is deliberately NOT required: a smoke_only dispatch runs
  // only `smoke`, a fast-tier run skips `guards`/`unit-plan` by design.)
  if (bad.length === 0 && passed.length === 0) {
    bad.push("no needed job succeeded — every result was skipped or advisory, so nothing was verified");
  }
  return { ok: bad.length === 0, bad, skipped, passed };
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
  const v = verdict(needs);
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
