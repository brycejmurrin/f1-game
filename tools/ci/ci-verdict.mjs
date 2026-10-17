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
 * It also fails when it was handed nothing: NEEDS unset / empty / `{}` exits 2,
 * and a payload with no `success` at all (everything skipped) fails with exit 1.
 *
 *   node tools/ci/ci-verdict.mjs                 # reads NEEDS env (toJSON(needs))
 *   node tools/ci/ci-verdict.mjs --json          # print {ok,bad} instead of exit
 */
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
  // Skipped-only is not green either: when every needed job was skipped (a
  // workflow whose gates all hung off one input) nothing was actually checked.
  // (A named core set is deliberately NOT required: a called run may skip
  // jobs by its inputs, and the jobs list is ci.yml's to shape.)
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
  const require = String(process.env.REQUIRE_SUCCESS || "").split(",").map((x) => x.trim()).filter(Boolean);
  const v = verdict(needs, { require });
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
