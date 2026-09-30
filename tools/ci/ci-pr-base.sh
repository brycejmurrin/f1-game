#!/usr/bin/env bash
# @doc The base a pull_request checkout diffs against: the test commit's FIRST PARENT, else the fallback given.
# Full description: the base a pull_request checkout must diff against: the test commit's FIRST PARENT (the base tip
# GitHub actually merged), else the fallback given.
# @section runner
#
# `pull_request.base.sha` IS ONE SYNC BEHIND (2026-09-30). On the first PR runs
# after #494 merged, the node-suites plan step saw the three workflow files
# #494 changed as part of EVERY PR's diff and fail-safed into running every
# script — the PRs had not touched them. The event's base.sha is the base tip
# as of the PR's previous update, while actions/checkout checks out
# refs/pull/N/merge, which GitHub builds on the CURRENT base tip. Diffing an
# old base against a merge made on a newer one reports the base's own recent
# commits as the PR's change, and on a branch that takes a merge every few
# minutes that is nearly every run. The sweeps, parts and renderer filters
# had the same defect for as long as they diffed a PR: the fleet rebuilt on
# any PR whose base had taken a circuit merge since its last sync.
#
# The commit under test names its own base: refs/pull/N/merge is a merge
# commit whose first parent is the base tip it was built on. Prints that when
# HEAD has two parents; otherwise (a checkout of the head ref, a push, a Pages
# call, a test repo) prints the fallback unchanged, so every caller keeps its
# documented fail-safe path when this cannot answer.
#
#   BEFORE="$(bash tools/ci/ci-pr-base.sh "$PR_BASE")"
set -u
FALLBACK="${1:-}"
if git rev-parse -q --verify 'HEAD^2' >/dev/null 2>&1; then
  git rev-parse 'HEAD^1'
else
  printf '%s\n' "$FALLBACK"
fi
