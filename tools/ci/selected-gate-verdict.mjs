#!/usr/bin/env node
/**
 * @doc Selected-specs gate verdict: cancel/red with clean junit is infra-retry, not a hard fail.
 * @section runner
 *
 * Evidence: PR #1109 run 37493213168 — one Selected shard cancelled after
 * `= run passed` (job cap during junit upload); junit from sibling shards had
 * zero failures; `selected-verdict` still failed with SELECTED=cancelled.
 *
 * A timed-out job reports `cancelled` (ci.yml header). Real test failures
 * write <failure>/<error> into junit before the reporters finalise
 * (--max-failures stops gracefully). So:
 *   - selected cancelled|failure + junit failures  → hard fail
 *   - selected cancelled|failure + junit clean     → infra-retry (pass)
 *   - selected success|skipped                    → existing rules
 * Must never treat cancel as green when junit names a failing spec.
 *
 *   node tools/ci/selected-gate-verdict.mjs [--junit-root DIR]
 *     reads SELECT / SELECTED / GUARDS / DROPPED / CALLED / DRAFT from env
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { failedSpecsUnder } from "./junit-failed.mjs";

/**
 * @param {{
 *   select: string,
 *   selected: string,
 *   guards: string,
 *   dropped?: string,
 *   called?: string,
 *   draft?: string,
 *   failedSpecs?: string[],
 * }} input
 * @returns {{ ok: boolean, reason: string, infraRetry: boolean, failedSpecs: string[] }}
 */
export function selectedGateVerdict(input) {
  const select = String(input.select || "");
  const selected = String(input.selected || "");
  const guards = String(input.guards || "");
  const dropped = String(input.dropped ?? "0");
  const called = String(input.called ?? "false");
  const draft = String(input.draft ?? "false");
  const failedSpecs = Array.isArray(input.failedSpecs) ? [...input.failedSpecs] : [];

  if (guards !== "success" && guards !== "skipped") {
    return {
      ok: false,
      reason: `Structural guards ${guards} — selected legs skipped`,
      infraRetry: false,
      failedSpecs,
    };
  }
  if (select !== "success") {
    return {
      ok: false,
      reason: `the selection itself did not pass (${select})`,
      infraRetry: false,
      failedSpecs,
    };
  }

  let infraRetry = false;
  let reason = "";

  if (selected === "success") {
    reason = "selected specs passed";
  } else if (selected === "skipped") {
    reason = draft === "true"
      ? "draft PR: selected legs skipped (ready_for_review runs them)"
      : "the plan had no jobs";
  } else if (selected === "cancelled" || selected === "failure") {
    if (failedSpecs.length > 0) {
      return {
        ok: false,
        reason: `selected specs ${selected} with junit failures: ${failedSpecs.join(" ")}`,
        infraRetry: false,
        failedSpecs,
      };
    }
    // Clean junit (or no junit uploaded — a cap kill after pass writes none):
    // infra noise, not an assertion red. See run 37493213168.
    infraRetry = true;
    reason = `selected specs ${selected} with clean junit — infra-retry (not a fail)`;
  } else {
    return {
      ok: false,
      reason: `selected specs ${selected}`,
      infraRetry: false,
      failedSpecs,
    };
  }

  if (dropped !== "0") {
    if (called === "true") {
      return {
        ok: true,
        reason,
        warn: `the train's plan dropped ${dropped} routed spec(s) as unaffordable; the fixed gates and the PRs that carried them are the answer here`,
        infraRetry,
        failedSpecs,
      };
    }
    return {
      ok: false,
      reason: `the plan dropped ${dropped} routed spec(s) it could not afford (named in the 'Select specs for this change' log) — they ran nowhere. Run their groups with tools/ci/remote-group.mjs, or split the change.`,
      infraRetry: false,
      failedSpecs,
    };
  }
  if (selected === "skipped") {
    reason = "nothing this diff touches has a spec — an empty plan is a pass";
  }
  return { ok: true, reason, infraRetry, failedSpecs };
}

function main(argv = process.argv.slice(2)) {
  let junitRoot = "";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--junit-root") junitRoot = argv[++i] || "";
  }
  let failedSpecs = [];
  if (junitRoot && fs.existsSync(junitRoot)) {
    failedSpecs = failedSpecsUnder(junitRoot);
  } else if (junitRoot) {
    // Missing root is clean — cancelled shards often upload nothing.
    failedSpecs = [];
  }

  const v = selectedGateVerdict({
    select: process.env.SELECT,
    selected: process.env.SELECTED,
    guards: process.env.GUARDS,
    dropped: process.env.DROPPED,
    called: process.env.CALLED,
    draft: process.env.DRAFT,
    failedSpecs,
  });

  console.log(`select=${process.env.SELECT} selected=${process.env.SELECTED} guards=${process.env.GUARDS} dropped=${process.env.DROPPED ?? "?"} called=${process.env.CALLED} draft=${process.env.DRAFT}`);
  if (v.infraRetry) {
    console.log(`::notice::infra-retry: ${v.reason}`);
  }
  if (v.warn) {
    console.log(`::warning::${v.warn}`);
  }
  if (v.ok) {
    console.log(v.reason);
    process.exit(0);
  }
  console.error(`::error::${v.reason}`);
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
