#!/usr/bin/env bash
# Full "Select specs for this change" step body. Env: EVENT, PUSH_BEFORE, PR_BASE, GITHUB_OUTPUT
set -eu
fail() { echo "::error::SELECTED GATE FAILED CLOSED: $1"; exit 1; }
chmod +x tools/ci-resolve-before.sh 2>/dev/null || true
if [ -x tools/ci-resolve-before.sh ] || [ -f tools/ci-resolve-before.sh ]; then
  BEFORE="$(EVENT="${EVENT:-}" PUSH_BEFORE="${PUSH_BEFORE:-}" PR_BASE="${PR_BASE:-}" bash tools/ci-resolve-before.sh)" \
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
node tools/select-specs.mjs --since "$BEFORE" --failed-from .selected-failed.txt --json > sel.json \
  || fail "selector failed"
node -e '
  const r = require("./sel.json");
  if (r.reason === "unmatched") {
    console.error("SELECTED GATE FAILED CLOSED: changed files matched no selection rule");
    process.exit(1);
  }
  const specs = r.selected.map((s) => s.file).join(" ");
  console.log(`reason=${r.reason}; groups: ${r.groups.join(", ") || "(none)"}`);
  console.log(`fits ${r.testsFit} tests; selected ${r.testsSelected} across ${r.selected.length} specs`);
  for (const s of r.overBudgetSpecs)
    console.log(`EXCLUDED (declares ${s.ownTimeoutSec}s timeout): ${s.file} (${s.tests} tests)`);
  for (const s of r.coveredByFixedGates)
    console.log(`COVERED BY FIXED BLOCKING GATE: ${s.file} (${s.tests} tests)`);
  for (const s of r.skipped) console.log(`SKIPPED (over budget): ${s.file} (${s.tests} tests)`);
  require("fs").appendFileSync(process.env.GITHUB_OUTPUT, `specs=${specs}\n`);
'
