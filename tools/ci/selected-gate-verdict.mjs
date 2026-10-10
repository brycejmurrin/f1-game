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
 *   - selected cancelled|failure + junit clean, EVERY shard that reached its
 *     run step left a junit with testcases         → infra-retry (pass)
 *   - selected cancelled|failure + a shard that STARTED its run step (it
 *     uploads a selected-started-* marker first) but left no readable junit
 *     (cap kill, crash, spec import error, a failed artifact download)
 *                                                   → hard fail (15-F2)
 *   - a shard that never reached the run step (checkout / install died) has no
 *     marker and stays infra noise.
 *   - selected success|skipped                    → existing rules
 * Must never treat cancel as green when junit names a failing spec — or when
 * it cannot say that no test body died.
 *
 *   node tools/ci/selected-gate-verdict.mjs [--junit-root DIR] [--junit-in DIR] [--started-in DIR]
 *     reads DOWNLOAD_FAILED (the artifact download steps' outcome) and SELECT / SELECTED / GUARDS / DROPPED / CALLED / DRAFT from env
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { failedSpecsUnder, unattributedFailuresFrom, testcaseCount } from "./junit-failed.mjs";

const JUNIT_PREFIX = "spec-timings-junit-selected-";
const STARTED_PREFIX = "selected-started-";

/** Shard evidence from the two downloaded artifact roots (download-artifact
 *  v8 puts each artifact in a folder named after it): which shards reached
 *  their run step, and which of those left a junit with at least one testcase. */
export function shardEvidence(junitIn, startedIn) {
  const names = (root, prefix) => {
    try { return fs.readdirSync(root).filter((d) => d.startsWith(prefix)).map((d) => d.slice(prefix.length)); } catch { return []; }
  };
  const junit = [];
  for (const shard of names(junitIn, JUNIT_PREFIX)) {
    const stack = [path.join(junitIn, JUNIT_PREFIX + shard)];
    let cases = 0;
    while (stack.length) {
      const d = stack.pop();
      let ents = [];
      try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
      for (const e of ents) {
        const f = path.join(d, e.name);
        if (e.isDirectory()) stack.push(f);
        else if (e.name === "junit.xml") cases += testcaseCount(fs.readFileSync(f, "utf8"));
      }
    }
    if (cases > 0) junit.push(shard);
  }
  return { started: names(startedIn, STARTED_PREFIX), junit };
}

/**
 * @param {{
 *   select: string,
 *   selected: string,
 *   guards: string,
 *   dropped?: string,
 *   called?: string,
 *   draft?: string,
 *   failedSpecs?: string[],
 *   evidence?: { started: string[], junit: string[], downloadFailed?: boolean },
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
    // Clean junit is infra noise, not an assertion red (run 37493213168). But
    // "no failures" read from NO junit is not clean: a shard that started its
    // run step and left no junit with testcases died mid-test (cap kill, crash,
    // a spec that failed to load) and nothing else reports it (15-F2).
    const ev = input.evidence;
    if (!ev || ev.downloadFailed) {
      return {
        ok: false,
        reason: `selected specs ${selected} and the shard junit could not be read (${ev ? "artifact download failed" : "no shard evidence"}) — cannot tell infra noise from a dead test body; re-run the job`,
        infraRetry: false,
        failedSpecs,
      };
    }
    const dead = ev.started.filter((n) => !ev.junit.includes(n));
    if (dead.length > 0) {
      return {
        ok: false,
        reason: `selected specs ${selected}: shard(s) ${dead.join(", ")} reached the run step but left no junit with testcases (killed by the job cap, crashed, or a spec failed to load) — their specs may not have run`,
        infraRetry: false,
        failedSpecs,
      };
    }
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
  let junitIn = "", startedIn = "";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--junit-in") junitIn = argv[++i] || "";
    if (argv[i] === "--started-in") startedIn = argv[++i] || "";
  }
  let failedSpecs = [];
  if (junitRoot && fs.existsSync(junitRoot)) {
    // Spec-attributed failures AND failures that name no spec (a load or setup
    // error has no classname) — both are a red.
    failedSpecs = [...failedSpecsUnder(junitRoot), ...failedSpecsUnder(junitRoot, unattributedFailuresFrom)];
  }
  const evidence = { ...shardEvidence(junitIn, startedIn), downloadFailed: process.env.DOWNLOAD_FAILED === "true" };

  const v = selectedGateVerdict({
    select: process.env.SELECT,
    selected: process.env.SELECTED,
    guards: process.env.GUARDS,
    dropped: process.env.DROPPED,
    called: process.env.CALLED,
    draft: process.env.DRAFT,
    failedSpecs,
    evidence,
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
