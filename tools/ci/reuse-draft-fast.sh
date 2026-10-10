#!/usr/bin/env bash
# @doc On ready_for_review, reuse a green draft fast-tier run for the same PR head SHA.
# @section runner
#
# reuse-draft-fast.sh
#
# Prints GITHUB_OUTPUT `reuse=true|false`. True only when this run is
# `ready_for_review` AND GitHub holds a completed successful ci.yml
# pull_request run for the exact PR head SHA (the draft that just went green).
# Callers skip the expensive fast-tier STEPS (names still report) and still
# run ready-only jobs (smoke, sweeps, renderer, selected).
#
# THE BASE MUST NOT HAVE MOVED (15-F5, 2026-10-10). A pull_request run tests
# refs/pull/N/merge: the head merged into the base tip AT THAT TIME. Marking
# ready hours later puts the new run on a newer base, and the merge-dependent
# checks the reuse skips (tooling A/B, ratchet comparison, test:audit, the node
# slices) are exactly the ones that fail on a semantic merge. So the draft run
# is reused only when the base branch has taken no commit since it started.
#
# Fail-safe: any lookup problem is reuse=false (run the fast tier again).
set -eu
ACTION="${GITHUB_EVENT_ACTION:-}"
HEAD="${PR_HEAD_SHA:-}"
REPO="${GITHUB_REPOSITORY:?}"
BASE_REF="${PR_BASE_REF:-}"
say() { echo "$*" >&2; }

if [ "$ACTION" != "ready_for_review" ]; then
  say "reuse-draft-fast: action=$ACTION — not ready_for_review"
  echo "reuse=false"
  exit 0
fi
case "$HEAD" in ""|0000000000000000000000000000000000000000)
  say "reuse-draft-fast: no PR head sha"
  echo "reuse=false"
  exit 0
  ;;
esac
command -v gh >/dev/null 2>&1 || { say "reuse-draft-fast: no gh"; echo "reuse=false"; exit 0; }
json="$(gh api "repos/$REPO/actions/runs?head_sha=$HEAD&status=success&per_page=30" 2>/dev/null)" \
  || { say "reuse-draft-fast: runs API failed"; echo "reuse=false"; exit 0; }
hit="$(printf '%s' "$json" | node -e '
  let s = ""; process.stdin.on("data", (d) => s += d).on("end", () => {
    let runs = []; try { runs = JSON.parse(s).workflow_runs || []; } catch (_) {}
    const self = process.env.GITHUB_RUN_ID || "";
    const r = runs.find((x) => x.status === "completed" && x.conclusion === "success"
      && String(x.id) !== self && x.path === ".github/workflows/ci.yml"
      && x.event === "pull_request");
    if (r) process.stdout.write(`${r.id} ${r.run_started_at || r.created_at || ""}`);
  });')"
if [ -n "$hit" ]; then
  started="${hit#* }"
  hit="${hit%% *}"
  # The base branch's tip commit date, against the moment the draft run started.
  tip="$( [ -n "$BASE_REF" ] && gh api "repos/$REPO/commits/$BASE_REF" --jq '.commit.committer.date' 2>/dev/null )" || tip=""
  moved="$(node -e '
    const t = Date.parse(process.argv[1]), r = Date.parse(process.argv[2]);
    process.stdout.write(Number.isFinite(t) && Number.isFinite(r) ? (t > r ? "moved" : "same") : "unknown");
  ' "$tip" "$started")"
  if [ "$moved" != same ]; then
    say "reuse-draft-fast: base $BASE_REF tip ($tip) is $moved against the draft run $hit (started $started) — merge-dependent checks must re-run"
    echo "reuse=false"
    exit 0
  fi
fi
if [ -n "$hit" ]; then
  say "reuse-draft-fast: reusing ci.yml run $hit for head $HEAD"
  echo "reuse=true"
  echo "run=$hit"
else
  say "reuse-draft-fast: no green PR ci.yml run on $HEAD"
  echo "reuse=false"
fi
