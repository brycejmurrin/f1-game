#!/usr/bin/env bash
# @doc The CI "select specs for this change" step body: base via `ci-resolve-before.sh`, then `select-specs.mjs --since`.
# @section runner
# Full "Select specs for this change" step body. Env: EVENT, PUSH_BEFORE, PR_BASE, CALLED, GITHUB_OUTPUT
# CALLED=true (a Pages call): an empty/unreachable base selects everything
# (ci-resolve-before.sh diffs against the empty tree), never HEAD~1.
set -eu
fail() { echo "::error::SELECTED GATE FAILED CLOSED: $1"; exit 1; }
# No `chmod +x` here: the helper is run through `bash`, and it is committed 100644, so a chmod made it a
# MODIFIED path in the very diff select-specs reads. Every PR then listed it as a changed infra path
# (reason=infra on 20 of 20 sampled runs, 2026-11-09), which made the "unmatched" fail-closed branch
# below unreachable and hid the CSS-only narrowing (docs/notes/TEST-TRUTH-HUNT-2026-11-09.md G2).
if [ -f tools/ci/ci-resolve-before.sh ]; then
  BEFORE="$(EVENT="${EVENT:-}" PUSH_BEFORE="${PUSH_BEFORE:-}" PR_BASE="${PR_BASE:-}" CALLED="${CALLED:-false}" bash tools/ci/ci-resolve-before.sh)" \
    || fail "could not resolve comparison base"
else
  case "${EVENT:-}" in
    push) BEFORE="${PUSH_BEFORE:-}" ;;
    pull_request) BEFORE="${PR_BASE:-}" ;;
    *) fail "unsupported event '${EVENT:-}'" ;;
  esac
  case "${BEFORE:-}" in
    ""|0000000000000000000000000000000000000000)
      if git rev-parse --verify HEAD~1 >/dev/null 2>&1; then
        BEFORE="$(git rev-parse HEAD~1)"
        echo "::warning::no event comparison base; falling back to HEAD~1 ($BEFORE)"
      else
        fail "no valid comparison base for ${EVENT:-}"
      fi
      ;;
  esac
  git cat-file -e "${BEFORE}^{commit}" 2>/dev/null || fail "comparison base $BEFORE is unreachable"
fi
# THE FRESHEST TIMING RECORD (2026-09-29). spec-timings.yml accumulates every
# deploy-branch run on bot/spec-timings and the committed file is refreshed
# only by a hand merge; select-budget.mjs unions this copy in via
# APEX_SPEC_TIMINGS. Fail soft: no branch, no file, bad JSON -> committed only.
# Not --depth=1: on this full clone that writes a shallow graft.
OVERLAY="${RUNNER_TEMP:-.}/bot-spec-timings.json"
if git fetch -q origin +refs/heads/bot/spec-timings:refs/remotes/origin/bot/spec-timings 2>/dev/null \
   && git show refs/remotes/origin/bot/spec-timings:tests/data/spec-timings.json > "$OVERLAY" 2>/dev/null \
   && node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$OVERLAY" 2>/dev/null; then
  export APEX_SPEC_TIMINGS="$OVERLAY"
  echo "timings: committed record + bot/spec-timings overlay"
else
  echo "timings: bot/spec-timings unavailable; committed record only"
fi
node tools/ci/select-specs.mjs --since "$BEFORE" --failed-from .selected-failed.txt \
  ${BUDGET_MIN:+--budget-min "$BUDGET_MIN"} ${OVERFLOW_SHARDS:+--overflow-shards "$OVERFLOW_SHARDS" --stale-first} --json > sel.json \
  || fail "selector failed"
node -e '
  const r = require("./sel.json");
  if (r.reason === "unmatched") {
    console.error("SELECTED GATE FAILED CLOSED: changed files matched no selection rule");
    process.exit(1);
  }
  if (r.reason === "partial")
    console.log(`::warning::SELECTION PARTIAL: ${r.unmatched.length} changed path(s) match no selection rule (${r.unmatched.slice(0, 6).join(", ")}); the boot floor runs for them`);
  const specs = r.selected.map((s) => s.file).join(" ");
  console.log(`reason=${r.reason}; groups: ${r.groups.join(", ") || "(none)"}`);
  if (r.reason === "infra")
    console.log(`::warning::SELECTION NARROWER THAN THE CHANGE: ${r.tracked.length} tracked/infra path(s) changed (${r.tracked.slice(0, 4).join(", ")}); the edited/imported specs still run, the fixed gates own the rest`);
  console.log(`fits ${r.secFit} s (unmeasured specs at the fallback rate, measured specs at their own median); selected ${r.testsSelected} tests (${r.secSelected} s) across ${r.selected.length} specs; ${(r.oversize || []).length} outside the budget`);
  if ((r.circuitsTouched || []).length)
    console.log(`circuits touched: ${r.circuitsTouched.join(", ")}${(r.circuits || []).length ? " (circuit-only diff: per-circuit loops run these alone via APEX_CIRCUITS)" : " (not circuit-only: the whole fleet runs)"}`);
  for (const s of (r.overBudgetRun || []))
    console.log(`OVER-BUDGET POOL (routed; declares ${s.ownTimeoutSec}s/test, runs in an overbudget job): ${s.file} (${s.tests} tests)`);
  // A DROPPED spec is an annotation, not a plain log line: selected-verdict
  // fails a pull request on any of them (2026-10-04), and the annotation is
  // what names it on the checks page of the PR.
  for (const s of r.overBudgetSpecs)
    console.log(`::warning::DROPPED (declares ${s.ownTimeoutSec}s/test; the over-budget pool is full): ${s.file} (${s.tests} tests)`);
  for (const s of r.coveredByFixedGates)
    console.log(`COVERED BY FIXED BLOCKING GATE: ${s.file} (${s.tests} tests)`);
  for (const s of (r.coveredByManualOptIn || []))
    console.log(`COVERED BY MANUAL OPT-IN (env-gated; not a selected-gate verdict): ${s.file} (${s.tests} tests)`);
  // Named, never silent (#5241 G3): these left the browser legs; node-plan / pick-unit-slices run their twins.
  for (const s of (r.coveredByVmTwin || []))
    console.log(`COVERED BY A VM TWIN (no browser leg; its node slice runs it): ${s.file} (${s.tests} tests) -> ${s.twin}`);
  for (const s of (r.unreachable || []))
    console.log(`::warning::UNREACHABLE by this gate (declares ${s.tests} tests, over the whole ${r.secFit} s budget): ${s.file}`);
  for (const s of (r.unreadable || []))
    console.log(`::error::DROPPED (unreadable selected spec): ${s.file}`);
  for (const s of (r.overflow || []))
    console.log(`OVERFLOW (routed; packed into the plan past the budget): ${s.file} (${s.tests} tests)`);
  for (const s of (r.spill || []))
    console.log(`SPILL (overflow full; runs in a bounded spill job): ${s.file} (${s.tests} tests)`);
  // Past overflow AND spill: never a quiet skip. An error annotation names it
  // on the PR checks page, and `dropped` below reds selected-verdict.
  for (const s of r.skipped) console.log(`::error::DROPPED (over budget; overflow AND spill are full — NOT RUN ANYWHERE): ${s.file} (${s.tests} tests) — run its group with tools/ci/remote-group.mjs or split the change`);
  for (const s of (r.oversize || []))
    console.log(`OVERSIZE (outside the budget, packed by expected time, ~${s.sec} s): ${s.file} (${s.tests} tests)`);
  const shards = r.shards || [];
  for (const j of shards)
    console.log(`JOB ${j.name}: ${j.tests} tests, ~${j.sec} s expected, ${j.timeout} min cap${j.shard ? `, --shard=${j.shard}` : ""}${j.circuits ? `, APEX_CIRCUITS=${j.circuits}` : ""}`);
  // DROPPED: routed specs this plan will NOT run — over budget, bigger than the
  // whole cap, or squeezed out. selected-verdict reads it to tell two very different
  // skips apart: a plan that is empty because the diff affects no spec, and a
  // plan that is empty because every spec it affects was unaffordable. The
  // second was counted as a pass, and it is exactly the renderer case — six gfx
  // specs declaring 240-540 s against a 180 s cap, so a js/render diff emptied
  // the plan and poked the train with nothing having booted a backend.
  const dropped = (r.overBudgetSpecs || []).length + (r.unreachable || []).length
    + (r.skipped || []).length + (r.unreadable || []).length;
  console.log(`dropped ${dropped} routed spec(s) this plan cannot run`);
  require("fs").appendFileSync(process.env.GITHUB_OUTPUT,
    `specs=${specs}\nshards=${JSON.stringify(shards)}\nany=${shards.length ? "true" : "false"}\n`
    + `dropped=${dropped}\nreason=${r.reason}\ncircuits=${(r.circuits || []).join(",")}\n`
    + `unrepresented=${(r.runnerUnrepresented || []).join(" ")}\n`);
  // Groups the runner fan-out could not represent (every spec over budget) are said where a person reads them.
  if ((r.runnerUnrepresented || []).length && process.env.GITHUB_STEP_SUMMARY) {
    require("fs").appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `**Not run on this PR:** ${r.runnerUnrepresented.join(", ")} (runner fan-out; every spec in the group is over budget), nightly rota covers them\n`);
  }
  // AN EMPTY PLAN IS A PASS ONLY FOR A DOCS-ONLY (OR EMPTY) DIFF (audit W31).
  // select() puts the boot floor in every other plan; a code diff that still
  // has no job and dropped nothing (a drop reds the verdict on its own) means
  // the selection is broken: fail closed.
  if (!shards.length && !dropped && !["none", "docs"].includes(r.reason)) {
    console.error(`SELECTED GATE FAILED CLOSED: a ${r.reason} diff produced an empty plan (the boot floor is missing)`);
    process.exit(1);
  }
'
