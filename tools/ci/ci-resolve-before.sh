#!/usr/bin/env bash
# @doc Resolves the selected-specs CI base (`EVENT`/`PUSH_BEFORE`/`PR_BASE`); a Pages call with no base selects all.
# @section runner
# Resolve comparison base for the selected-specs gate.
# Prints BEFORE on stdout. Env: EVENT, PUSH_BEFORE, PR_BASE, CALLED.
#
# A PAGES CALL NEVER FALLS BACK TO HEAD~1 (2026-09-25). On the train
# (CALLED=true, ci.yml passes inputs.concurrency_key != '') the base is the LIVE
# commit, and pages.yml documents an empty one as "unknown — every filter in
# ci.yml reads empty as run everything". The sweeps, parts and ship filters do;
# this resolver used to answer HEAD~1, so a train whose live SHA could not be
# read selected specs for its LAST COMMIT only — a one-commit slice of a tip
# that may carry dozens of unpublished commits. On a Pages call an empty, zero
# or unreachable base now resolves to git's EMPTY TREE: every tracked file is
# "changed", so the selector routes every group and names what its budget
# cannot hold (fail safe, like the filters). A branch push or PR keeps HEAD~1.
set -eu
EVENT="${EVENT:-push}"
PUSH_BEFORE="${PUSH_BEFORE:-}"
PR_BASE="${PR_BASE:-}"
CALLED="${CALLED:-false}"
# `git hash-object -t tree /dev/null`: git knows this object without storing it.
EMPTY_TREE=4b825dc642cb6eb9a060e54bf8d69288fbee4904
select_all() {
  echo "::warning::SELECTING EVERYTHING on a Pages call: $1 — diffing against the empty tree, never HEAD~1" >&2
  printf '%s' "$EMPTY_TREE"
  exit 0
}
case "$EVENT" in
  push) BEFORE="$PUSH_BEFORE" ;;
  pull_request) BEFORE="$PR_BASE" ;;
  # Merge queue: the proposed merge's base (ci.yml passes merge_group.base_sha
  # as PR_BASE). Keep this event working; enabling the queue is a repo setting.
  merge_group) BEFORE="$PR_BASE" ;;
  # THE NIGHTLY'S CHANGE-AWARE LANE: everything the last day of merges routed.
  # A per-change selection can only afford 15 minutes, so a routed spec that
  # loses the packing (menu-traversal, ui-redesign, 2026-09-29) otherwise waits
  # for its group's night in the 11-night rota. Base = the tip a day ago.
  schedule) BEFORE="$(git rev-list -1 --first-parent --before='24 hours ago' HEAD 2>/dev/null || true)" ;;
  *) echo "::error::SELECTED GATE FAILED CLOSED: unsupported event '$EVENT'" >&2; exit 1 ;;
esac
# A PULL REQUEST'S BASE IS THE TEST COMMIT'S FIRST PARENT (2026-09-30): the
# event's base.sha lags one sync behind the base refs/pull/N/merge was built
# on, so the base's own recent commits read as this PR's diff (ci-pr-base.sh).
[ "$EVENT" = pull_request ] && BEFORE="$(bash "$(dirname "$0")/ci-pr-base.sh" "$BEFORE")"
case "${BEFORE:-}" in
  ""|0000000000000000000000000000000000000000)
    [ "$CALLED" = "true" ] && select_all "no live commit to diff against (before_sha empty)"
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
  [ "$CALLED" = "true" ] && select_all "live commit $BEFORE is unreachable"
  echo "::error::SELECTED GATE FAILED CLOSED: comparison base $BEFORE is unreachable" >&2
  exit 1
}
printf '%s' "$BEFORE"
