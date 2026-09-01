#!/usr/bin/env bash
# @doc Resolves the base SHA for the selected-specs CI gate from `EVENT` / `PUSH_BEFORE` / `PR_BASE` (falls back to `HEAD~1`).
# @section runner
# Resolve comparison base for the selected-specs gate.
# Prints BEFORE on stdout. Env: EVENT, PUSH_BEFORE, PR_BASE.
set -eu
EVENT="${EVENT:-push}"
PUSH_BEFORE="${PUSH_BEFORE:-}"
PR_BASE="${PR_BASE:-}"
case "$EVENT" in
  push) BEFORE="$PUSH_BEFORE" ;;
  pull_request) BEFORE="$PR_BASE" ;;
  *) echo "::error::SELECTED GATE FAILED CLOSED: unsupported event '$EVENT'" >&2; exit 1 ;;
esac
case "${BEFORE:-}" in
  ""|0000000000000000000000000000000000000000)
    if git rev-parse --verify HEAD~1 >/dev/null 2>&1; then
      BEFORE="$(git rev-parse HEAD~1)"
      echo "::warning::no event comparison base for $EVENT; falling back to HEAD~1 ($BEFORE)" >&2
    else
      echo "::error::SELECTED GATE FAILED CLOSED: no valid comparison base for $EVENT (and HEAD~1 unreachable)" >&2
      exit 1
    fi
    ;;
esac
git cat-file -e "${BEFORE}^{commit}" 2>/dev/null || {
  echo "::error::SELECTED GATE FAILED CLOSED: comparison base $BEFORE is unreachable" >&2
  exit 1
}
printf '%s' "$BEFORE"
