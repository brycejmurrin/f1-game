#!/usr/bin/env bash
# @doc The CI "select specs for this change" step body: base via `ci-resolve-before.sh`, then `select-specs.mjs --since`.
# @section runner
# Full "Select specs for this change" step body. Env: EVENT, PUSH_BEFORE, PR_BASE, GITHUB_OUTPUT
set -eu
fail() { echo "::error::SELECTED GATE FAILED CLOSED: $1"; exit 1; }
chmod +x tools/ci/ci-resolve-before.sh 2>/dev/null || true
if [ -f tools/ci/ci-resolve-before.sh ]; then
  BEFORE="$(EVENT="${EVENT:-}" PUSH_BEFORE="${PUSH_BEFORE:-}" PR_BASE="${PR_BASE:-}" bash tools/ci/ci-resolve-before.sh)" \
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
node tools/ci/select-specs.mjs --since "$BEFORE" --failed-from .selected-failed.txt --json > sel.json \
  || fail "selector failed"
node -e '
  const r = require("./sel.json");
  if (r.reason === "unmatched") {
    console.error("SELECTED GATE FAILED CLOSED: changed files matched no selection rule");
    process.exit(1);
  }
  const specs = r.selected.map((s) => s.file).join(" ");
  console.log(`reason=${r.reason}; groups: ${r.groups.join(", ") || "(none)"}`);
  if (r.reason === "infra")
    console.log(`::warning::SELECTION NARROWER THAN THE CHANGE: ${r.tracked.length} tracked/infra path(s) changed (${r.tracked.slice(0, 4).join(", ")}); the edited/imported specs still run, the fixed gates own the rest`);
  console.log(`fits ${r.secFit} s (${r.testsFit} tests at the fallback rate, measured specs at their own median); selected ${r.testsSelected} tests (${r.secSelected} s) across ${r.selected.length} specs; ${(r.oversize || []).length} oversize shard(s)`);
  for (const s of r.overBudgetSpecs)
    console.log(`EXCLUDED (declares ${s.ownTimeoutSec}s timeout): ${s.file} (${s.tests} tests)`);
  for (const s of r.coveredByFixedGates)
    console.log(`COVERED BY FIXED BLOCKING GATE: ${s.file} (${s.tests} tests)`);
  for (const s of (r.unreachable || []))
    console.log(`::warning::UNREACHABLE by this gate (declares ${s.tests} tests, over the whole ${r.secFit} s budget): ${s.file}`);
  for (const s of r.skipped) console.log(`SKIPPED (over budget): ${s.file} (${s.tests} tests)`);
  for (const s of (r.oversize || []))
    console.log(`OVERSIZE (affected by this change; its own shard): ${s.file} (${s.tests} tests)`);
  const shards = r.shards || [];
  // DROPPED: routed specs this plan will NOT run — over budget, bigger than the
  // whole cap, or squeezed out. `poke-train` reads it to tell two very different
  // skips apart: a plan that is empty because the diff affects no spec, and a
  // plan that is empty because every spec it affects was unaffordable. The
  // second was counted as a pass, and it is exactly the renderer case — six gfx
  // specs declaring 240-540 s against a 180 s cap, so a js/render diff emptied
  // the plan and poked the train with nothing having booted a backend.
  const dropped = (r.overBudgetSpecs || []).length + (r.unreachable || []).length
    + (r.skipped || []).length;
  console.log(`dropped ${dropped} routed spec(s) this plan cannot run`);
  require("fs").appendFileSync(process.env.GITHUB_OUTPUT,
    `specs=${specs}\nshards=${JSON.stringify(shards)}\nany=${shards.length ? "true" : "false"}\n`
    + `dropped=${dropped}\nreason=${r.reason}\n`);
'
