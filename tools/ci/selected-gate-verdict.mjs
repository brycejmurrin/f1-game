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
 *     reads DOWNLOAD_FAILED (the artifact download steps' outcome) and SELECT / SELECTED / GUARDS / DROPPED / CALLED / DRAFT / REUSED / REUSED_RUN
 *     / GROUP_ACCEPT / GROUP_RUNS / GROUP_WHY (dropped-group-runs.mjs: a separate run covered the dropped specs, #5480) from env
 *     and SHARDS (the select job's `shards` plan JSON: every spec it names must have a junit testcase, #5403; a REUSED
 *     verdict inherits that check: reuse-draft-selected.mjs requires the draft run's own verdict job, which applied it to
 *     the same plan, to have passed)
 *     (DRAFT=true: a dropped spec warns instead of redding — the draft plan is the 5-min budget, 2026-11-03)
 *   node tools/ci/selected-gate-verdict.mjs --tally <leg> [--junit-in DIR]
 *     a selected shard's own last step: prints ONE `apex-selected-tally` notice (its testcase count and tested specs)
 *
 * LOST FILE ≠ RAN NOTHING (#5802). A shard whose JOB concluded success but whose junit artifact is missing or 404s
 * is an infrastructure miss: the workflow retries the download once, then this file reads the shard's own tally
 * annotation (check-run annotations of this run attempt's jobs, GITHUB_TOKEN). Only a green job with EXACTLY one tally
 * of at least one testcase stands in for its junit (recoverLostJunit); a tally of 0 tests is the shard that ran
 * nothing (#5334) and stays red, as does a shard with no tally, two tallies, or a job that did not succeed.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { failedSpecsUnder, unattributedFailuresFrom, testcaseCount, testedSpecsFrom } from "./junit-failed.mjs";

const JUNIT_PREFIX = "spec-timings-junit-selected-";
/** The shard tally annotation's title (one per selected job, written by its last step from its own junit). */
export const TALLY_TITLE = "apex-selected-tally";
/** The `selected` matrix job's name; its jobs are "<this> (<matrix values>)", prefixed "<caller> / " when called. */
export const SELECTED_JOB = "Selected specs (change-aware gate)";
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

/** The specs the select job PLANNED: the union of every `shards` row's space-separated `specs`. `null` when no plan
 *  was handed in (pure callers, an older workflow); `{ error }` when one was handed in and cannot be read, which the
 *  verdict fails closed on rather than reading as "nothing planned" (#5403).
 *  A row with `circuits` set (the circuit lane, APEX_CIRCUITS) is left out: there a per-circuit loop spec
 *  (select-specs CIRCUIT_FILTERED_TESTS, e.g. tracks-walls-a / -b, each half of the roster) legitimately collects zero
 *  tests when the scoped circuit is in the other half. Such a row is still held by the per-shard rule (a started shard
 *  with no testcase is red), and Playwright fails a run whose specs collect nothing at all. */
export function plannedSpecs(shardsJson) {
  const raw = String(shardsJson ?? "").trim();
  if (!raw) return null;
  let rows;
  try { rows = JSON.parse(raw); } catch (e) { return { error: `the plan (SHARDS) is not JSON: ${e.message}` }; }
  if (!Array.isArray(rows)) return { error: "the plan (SHARDS) is not a list of shard rows" };
  const out = new Set();
  for (const r of rows) {
    if (!r || typeof r.specs !== "string") return { error: "a plan row (SHARDS) has no `specs` string" };
    if (String(r.circuits || "").trim()) continue;
    for (const s of r.specs.split(/\s+/)) if (s) out.add(s.replace(/^\.\//, ""));
  }
  return { specs: [...out].sort() };
}

/** Every spec with at least one <testcase> in any junit.xml under `root` (all shards, any layout). */
export function ranSpecsUnder(root) {
  const out = new Set();
  const stack = root ? [root] : [];
  while (stack.length) {
    const d = stack.pop();
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) stack.push(f);
      else if (e.name === "junit.xml") for (const s of testedSpecsFrom(fs.readFileSync(f, "utf8"))) out.add(s);
    }
  }
  return [...out].sort();
}

/** A shard's own tally from its reporter folders (root/test-results-N/junit.xml): testcases and tested specs. */
export function tallyUnder(root) {
  let tests = 0;
  const specs = new Set();
  let dirs = [];
  try { dirs = fs.readdirSync(root).filter((d) => d.startsWith("test-results-")); } catch { /* none */ }
  for (const d of dirs) {
    let xml = "";
    try { xml = fs.readFileSync(path.join(root, d, "junit.xml"), "utf8"); } catch { continue; }
    tests += testcaseCount(xml);
    for (const s of testedSpecsFrom(xml)) specs.add(s);
  }
  return { tests, specs: [...specs].sort() };
}

/** The workflow command a shard prints: `::notice title=apex-selected-tally::{json}` (% CR LF escaped). Pure. */
export function tallyLine(leg, { tests, specs }) {
  const msg = JSON.stringify({ leg: String(leg), tests, specs });
  return `::notice title=${TALLY_TITLE}::${msg.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A")}`;
}

/** An annotation message back to { leg, tests, specs }; null when it is not a well-formed tally. Pure. */
export function parseTally(message) {
  let j;
  try { j = JSON.parse(String(message || "")); } catch { return null; }
  if (!j || typeof j.leg !== "string" || !j.leg || !Number.isInteger(j.tests) || j.tests < 0 || !Array.isArray(j.specs)) return null;
  if (!j.specs.every((x) => typeof x === "string")) return null;
  return { leg: j.leg, tests: j.tests, specs: j.specs };
}

/** Does a green matrix's evidence have a gap a lost artifact could explain (download failed, a started shard with no
 *  junit, no marker at all, or a planned spec with no testcase)? Pure. */
export function evidenceGap(ev) {
  if (!ev) return false;
  if (ev.downloadFailed || ev.started.length === 0 || ev.started.some((n) => !ev.junit.includes(n))) return true;
  if (ev.planned && !ev.planned.error) {
    const ran = new Set(ev.ran || []);
    return (ev.planned.specs || []).some((x) => !ran.has(x));
  }
  return false;
}

/**
 * THE SHARD'S OWN WORD FOR A LOST FILE (#5802). Pure. `jobs`: this run attempt's jobs as
 * [{ name, conclusion, notes: [{ title, message }] | null }] (null = the lookup failed: nothing is recovered);
 * `planRows`: the plan's shard count, or null when unknown.
 * A selected job counts only if it concluded `success` and carries EXACTLY one well-formed tally with tests > 0 and a
 * named spec; that tally then stands in for its leg's lost marker, junit and ran specs. A failed download is cleared
 * only when every planned shard is such a job (job count === planRows). Every other check in judgeSpecs still runs
 * on the result, so a zero-test shard (its tally says 0), an untallied one and a missing planned spec stay red.
 * @returns {{ evidence: object, recovered: string[], zero: string[] }}
 */
export function recoverLostJunit(ev, jobs, { planRows = null } = {}) {
  if (!ev || !Array.isArray(jobs)) return { evidence: ev, recovered: [], zero: [] };
  const shardJobs = jobs.filter((j) => String(j?.name || "").includes(SELECTED_JOB));
  const usable = new Map();
  const zero = [];
  for (const j of shardJobs) {
    const tallies = (j.notes || []).filter((n) => n && n.title === TALLY_TITLE).map((n) => parseTally(n.message));
    if (j.conclusion !== "success" || tallies.length !== 1 || !tallies[0]) continue;
    const t = tallies[0];
    if (t.tests > 0 && t.specs.length > 0) usable.set(t.leg, t);
    else zero.push(t.leg);
  }
  const all = Number.isInteger(planRows) && planRows > 0 && shardJobs.length === planRows && usable.size === planRows;
  if (ev.downloadFailed && !all) return { evidence: ev, recovered: [], zero };
  const started = new Set(ev.started), junit = new Set(ev.junit), ran = new Set(ev.ran || []);
  const recovered = [];
  for (const [leg, t] of usable) {
    if (!junit.has(leg) || !started.has(leg) || t.specs.some((x) => !ran.has(x))) recovered.push(leg);
    started.add(leg); junit.add(leg);
    for (const x of t.specs) ran.add(x);
  }
  return {
    evidence: { ...ev, downloadFailed: false, started: [...started].sort(), junit: [...junit].sort(), ran: [...ran].sort(), recovered: recovered.sort() },
    recovered: recovered.sort(), zero,
  };
}

/**
 * @param {{
 *   select: string,
 *   selected: string,
 *   guards: string,
 *   dropped?: string,
 *   unrepresented?: string,
 *   called?: string,
 *   draft?: string,
 *   reused?: string, reusedRun?: string,
 *   groupAccept?: string, groupRuns?: string, groupWhy?: string,
 *   failedSpecs?: string[],
 *   evidence?: { started: string[], junit: string[], downloadFailed?: boolean,
 *     planned?: { specs?: string[], error?: string } | null, ran?: string[] },
 * }} input
 * @returns {{ ok: boolean, reason: string, infraRetry: boolean, failedSpecs: string[] }}
 */
export function selectedGateVerdict(input) {
  const v = selectedGateVerdictCore(input);
  // Groups the runner fan-out left out (every spec in the group over budget): never silent, never a verdict of their own.
  const groups = String(input.unrepresented || "").trim().split(/\s+/).filter(Boolean);
  if (groups.length) v.reason += ` — not run on this PR: ${groups.join(", ")}, nightly rota covers them`;
  return v;
}
function selectedGateVerdictCore(input) {
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
      // THE PLAN IS THE CLAIM PER SPEC (#5403 part 2). A shard with ONE testcase passed the check above even when the
      // other specs it was handed never ran (a spec that failed to collect, a filter that matched nothing), and a
      // planned shard that never started at all left no marker to miss. Every spec the plan named needs a testcase.
      if (ev.planned) {
        if (ev.planned.error) {
          return { ok: false, reason: `selected specs success, but ${ev.planned.error} — cannot check each planned spec ran; failing closed`, infraRetry: false, failedSpecs };
        }
        const ran = new Set(ev.ran || []);
        const missing = (ev.planned.specs || []).filter((s) => !ran.has(s));
        if (missing.length > 0) {
          const shown = missing.slice(0, 8).join(", ") + (missing.length > 8 ? ` (+${missing.length - 8} more)` : "");
          return { ok: false, reason: `selected specs success, but ${missing.length} planned spec(s) left no junit testcase in any shard: ${shown} — they did not run (or their upload was lost); re-run, never read it as a pass`, infraRetry: false, failedSpecs };
        }
      }
    }
    reason = "selected specs passed";
    if (ev?.recovered?.length) reason += ` (the junit of ${ev.recovered.join(", ")} was lost; each shard's job concluded success and its own tally annotation names its tests, #5802)`;
  } else if (selected === "skipped" && String(input.reused ?? "") === "true") {
    // A PASSED RUN ON THE SAME TREE WAS REUSED (#5426; keyed on the merge tree since #6585). select's reuse step
    // (tools/ci/reuse-draft-selected.mjs) proved another run tested this base and merge tree with the same plan green
    // on attempt 1, no run on those bytes is red, and the deploy tip is unmoved. Only a non-draft PR run may claim it,
    // and it must name the run it reused.
    const run = String(input.reusedRun ?? "");
    if (!/^\d+$/.test(run)) {
      return { ok: false, reason: `the selected legs were skipped as reused, but no reused run id was given (REUSED_RUN=${JSON.stringify(run)}) — failing closed`, infraRetry: false, failedSpecs };
    }
    if (draft === "true" || called === "true") {
      return { ok: false, reason: "the selected legs were skipped as reused on a run that is not a ready pull request — only a non-draft pull request run reuses a passed verdict", infraRetry: false, failedSpecs };
    }
    reason = `selected specs reused from run ${run} (same head, same base, deploy tip unmoved, same plan; green on attempt 1)`;
  } else if (selected === "skipped") {
    reason = draft === "true" && called !== "true"
      ? "browser execution deferred until ready for review; use tools/ci/remote-group.mjs for a draft run"
      : "no selected job ran: an empty plan is a pass for paths exempted by the selector";
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
    if (!droppedKnown) {
      return { ok: false, reason: `the plan's dropped-spec count is unreadable (DROPPED=${JSON.stringify(dropped)}, not a number) — failing closed; check the select job's 'dropped' output`, infraRetry: false, failedSpecs };
    }
    // THE SEPARATE RUN COUNTS (#5480; Bryce 2026-11-11 "Count the separate run"). The verdict job's group-runs step
    // (tools/ci/dropped-group-runs.mjs) accepted only if every dropped spec ran green in a browser-group run on this
    // head and this base, attempt 1, llvmpipe; it names the run(s). Anything else is the red below.
    const runs = String(input.groupRuns ?? "");
    if (String(input.groupAccept ?? "") === "true" && /^\d+(,\d+)*$/.test(runs)) {
      return { ok: true, reason: `${reason}; the plan's ${dropped} dropped spec(s) ran green in browser-group run(s) ${runs.split(",").join(", ")} (same head, same base, attempt 1, llvmpipe)`, infraRetry, failedSpecs };
    }
    const why = String(input.groupWhy ?? "").trim();
    return {
      ok: false,
      reason: `the plan dropped ${dropped} routed spec(s) it could not afford (named in the 'Select specs for this change' log)${why ? `, and no separate run counts: ${why}` : ""}. `
        + "What counts: every dropped spec green in ONE browser-group run per group on this head and this base, first attempt, default GL — "
        + "`node tools/ci/remote-group.mjs <group>` on the pushed branch (it tests the PR's merge ref), BEFORE the ready flip (this job waits at most 7 min for one still running, then reds); "
        + "after a red like this one, run it, then flip the PR to draft and back to ready (a new ready run on the same head; never a re-run of this one). "
        + "A failed, cancelled, re-run or branch-head group run does not count, nor does one on another base than this run's (the deploy tip moved between them: run it again). Or split the change.",
      infraRetry: false,
      failedSpecs,
    };
  }
  return { ok: true, reason, infraRetry, failedSpecs };
}

function gh(args) {
  const r = spawnSync("gh", ["api", ...args], { encoding: "utf8", maxBuffer: 64 << 20 });
  return r.status === 0 ? r.stdout : null;
}
const parseJson = (t) => { try { return t == null ? null : JSON.parse(t); } catch { return null; } };
function jobPages(text) {
  if (text == null) return null;
  try {
    const out = [];
    for (const page of text.split(/(?=\{"total_count")/)) if (page.trim()) out.push(...(JSON.parse(page).jobs || []));
    return out;
  } catch { return null; }
}

/** This run attempt's selected jobs with their annotations (GITHUB_TOKEN, actions: read + checks: read); null on any
 *  lookup failure. Only called on a green matrix whose evidence has a gap. */
function liveShardJobs(env = process.env) {
  const repo = env.GITHUB_REPOSITORY, run = env.GITHUB_RUN_ID, attempt = env.GITHUB_RUN_ATTEMPT || "1";
  if (!repo || !/^\d+$/.test(String(run || ""))) return null;
  const jobs = jobPages(gh([`repos/${repo}/actions/runs/${run}/attempts/${attempt}/jobs?per_page=100`, "--paginate"]));
  if (!jobs) return null;
  const out = [];
  for (const j of jobs) {
    if (!String(j?.name || "").includes(SELECTED_JOB)) continue;
    const notes = j.conclusion === "success" ? parseJson(gh([`repos/${repo}/check-runs/${j.id}/annotations?per_page=100`])) : [];
    out.push({ name: j.name, conclusion: j.conclusion, notes: Array.isArray(notes) ? notes : null });
  }
  return out;
}

function planRowCount(shardsJson) {
  try { const rows = JSON.parse(String(shardsJson ?? "")); return Array.isArray(rows) ? rows.length : null; } catch { return null; }
}

function main(argv = process.argv.slice(2)) {
  const t = argv.indexOf("--tally");
  if (t >= 0) {
    const j = argv.indexOf("--junit-in");
    console.log(tallyLine(argv[t + 1] || "", tallyUnder(j >= 0 ? argv[j + 1] || "" : "artifacts")));
    return;
  }
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
  let evidence = { ...shardEvidence(junitIn, startedIn), downloadFailed: process.env.DOWNLOAD_FAILED === "true",
    planned: plannedSpecs(process.env.SHARDS), ran: ranSpecsUnder(junitIn) };
  // SHARD_TALLIES=1 is set by ci.yml's verdict step only: a local or unit-test run never calls the API.
  if (process.env.SHARD_TALLIES === "1" && process.env.SELECTED === "success" && evidenceGap(evidence)) {
    const jobs = liveShardJobs();
    const r = recoverLostJunit(evidence, jobs, { planRows: planRowCount(process.env.SHARDS) });
    console.log(jobs ? `shard tallies: ${jobs.length} selected job(s); recovered ${r.recovered.join(", ") || "none"}${r.zero.length ? `; ran nothing by their own tally: ${r.zero.join(", ")}` : ""}` : "shard tallies: the jobs/annotations lookup failed; nothing recovered");
    evidence = r.evidence;
  }

  const v = selectedGateVerdict({
    select: process.env.SELECT,
    selected: process.env.SELECTED,
    guards: process.env.GUARDS,
    dropped: process.env.DROPPED,
    unrepresented: process.env.UNREPRESENTED,
    called: process.env.CALLED,
    draft: process.env.DRAFT,
    reused: process.env.REUSED,
    reusedRun: process.env.REUSED_RUN,
    groupAccept: process.env.GROUP_ACCEPT,
    groupRuns: process.env.GROUP_RUNS,
    groupWhy: process.env.GROUP_WHY,
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
