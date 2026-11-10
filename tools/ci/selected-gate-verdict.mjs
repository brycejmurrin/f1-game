#!/usr/bin/env node
/**
 * @doc Selected-specs gate verdict: failed or cancelled shards require a successful rerun.
 * @section runner
 *
 * Clean sibling JUnit is useful diagnostics, but cannot prove that every
 * planned leg ran: checkout/install can fail before a started marker exists.
 * Failure/cancellation therefore stays red even with clean available JUnit.
 * Started shards without JUnit and artifact download errors get explicit
 * diagnostics. Successful or genuinely empty plans retain the normal rules.
 *
 *   node tools/ci/selected-gate-verdict.mjs [--junit-root DIR] [--junit-in DIR] [--started-in DIR]
 *     reads DOWNLOAD_FAILED (the artifact download steps' outcome) and SELECT / SELECTED / GUARDS / DROPPED / CALLED / DRAFT from env
 *     (DRAFT=true: a dropped spec warns instead of redding — the draft plan is the 5-min budget, 2026-11-03)
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
  // ONE matched artifact is extracted FLAT into the root (no `<artifact-name>/` folder): a single-shard draft leaves
  // started-in/marker.txt (its content is the shard name) and junit-in/test-results-*/junit.xml. Read that layout as
  // the one shard, or every single-shard plan reads "no shard left a run-step marker" (#5282, run 42767850104).
  let started = names(startedIn, STARTED_PREFIX);
  let flatShard = "";
  if (started.length === 0) {
    try { flatShard = fs.readFileSync(path.join(startedIn, "marker.txt"), "utf8").trim(); } catch { /* no flat marker */ }
    if (flatShard) started = [flatShard];
  }
  const junitDirs = names(junitIn, JUNIT_PREFIX).map((shard) => [shard, path.join(junitIn, JUNIT_PREFIX + shard)]);
  if (junitDirs.length === 0 && flatShard) junitDirs.push([flatShard, junitIn]);
  const junit = [];
  for (const [shard, dir] of junitDirs) {
    const stack = [dir];
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
  return { started, junit };
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
  // A red `Structural guards` is reported by its own check and keeps `CI` red
  // (ci-verdict needs guards), so this check judges only the change-aware specs
  // and no longer repeats it (2026-10-16 CI jobs review: 9 of 9 guards-red runs
  // painted four red rows for one cause). It never turns a spec failure green.
  const guards = String(input.guards || "");
  const v = judgeSpecs(input);
  if (guards !== "success" && guards !== "skipped") {
    v.reason += ` (Structural guards ${guards}: reported by that check, which keeps CI red)`;
  }
  return v;
}

function judgeSpecs(input) {
  const select = String(input.select || "");
  const selected = String(input.selected || "");
  const dropped = String(input.dropped ?? "0");
  // "" / "?" / "abc" is an unreadable count (the select job's output went missing), not "dropped N": still fail closed, but say so.
  const droppedKnown = /^\d+$/.test(dropped);
  const called = String(input.called ?? "false");
  const draft = String(input.draft ?? "false");
  const failedSpecs = Array.isArray(input.failedSpecs) ? [...input.failedSpecs] : [];

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
    // A GREEN MATRIX IS A CLAIM, THE JUNIT IS THE EVIDENCE (#5241 G5). `success` was taken at its word, so a shard
    // that reached its run step and executed nothing read as "selected specs passed". When this job was handed the
    // shard evidence (main() always is; pure callers may omit it), every started shard must have left a junit with
    // at least one testcase. Checked on green run 42740553927: 29 markers, 29 junits. A lost upload (the junit step
    // is continue-on-error telemetry) reds here too: missing execution evidence needs a re-run (docs/VERIFICATION.md §5).
    const ev = input.evidence;
    if (ev) {
      if (ev.downloadFailed) {
        return { ok: false, reason: "selected specs success, but the shard junit could not be read (artifact download failed) — a green without execution evidence is not a pass; re-run this job", infraRetry: false, failedSpecs };
      }
      const empty = ev.started.filter((n) => !ev.junit.includes(n));
      if (empty.length > 0) {
        return { ok: false, reason: `selected specs success, but shard(s) ${empty.join(", ")} reached the run step and left no junit with a testcase — they ran zero tests (or lost the upload); re-run the failed evidence, never read it as a pass`, infraRetry: false, failedSpecs };
      }
      if (ev.started.length === 0) {
        return { ok: false, reason: "selected specs success, but no shard left a run-step marker — nothing shows a selected spec ran", infraRetry: false, failedSpecs };
      }
    }
    reason = "selected specs passed";
  } else if (selected === "skipped") {
    // A draft runs the selected legs too since 2026-11-03 (one 5-min shard), so
    // a skipped matrix means the same thing on every PR: the plan had no jobs.
    reason = "the plan had no jobs";
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
    // A sibling's clean JUnit cannot prove a leg that died before its marker
    // ran. Without the complete expected matrix, only success proves completion.
    return { ok: false, reason: `selected specs ${selected} — clean junit does not prove every planned shard ran; re-run the failed job`, infraRetry: false, failedSpecs };
  } else {
    return {
      ok: false,
      reason: `selected specs ${selected}`,
      infraRetry: false,
      failedSpecs,
    };
  }

  if (dropped !== "0") {
    // A DRAFT WARNS (2026-11-03): its plan is the 5-min budget, so a routed spec
    // it cannot afford is expected there; the ready run (10 min) or
    // remote-group.mjs runs it, and only those verdicts red on it.
    if (draft === "true") {
      return {
        ok: true,
        reason,
        warn: !droppedKnown ? `the draft plan's dropped-spec count is unreadable (DROPPED=${JSON.stringify(dropped)}); check the select job's outputs` : `the draft plan (5-min budget) dropped ${dropped} routed spec(s); the ready run's 10-min plan or tools/ci/remote-group.mjs runs them, and those verdicts red on it`,
        infraRetry,
        failedSpecs,
      };
    }
    if (called === "true") {
      return {
        ok: true,
        reason,
        warn: !droppedKnown ? `the train's dropped-spec count is unreadable (DROPPED=${JSON.stringify(dropped)}); the fixed gates and the PRs that carried them are the answer here` : `the train's plan dropped ${dropped} routed spec(s) as unaffordable; the fixed gates and the PRs that carried them are the answer here`,
        infraRetry,
        failedSpecs,
      };
    }
    return {
      ok: false,
      reason: !droppedKnown ? `the plan's dropped-spec count is unreadable (DROPPED=${JSON.stringify(dropped)}, not a number) — failing closed; check the select job's 'dropped' output` : `the plan dropped ${dropped} routed spec(s) it could not afford (named in the 'Select specs for this change' log) — they ran nowhere. Run their groups with tools/ci/remote-group.mjs, or split the change.`,
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
