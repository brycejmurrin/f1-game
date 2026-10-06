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
# Fail-safe: any lookup problem is reuse=false (run the fast tier again).
set -eu
ACTION="${GITHUB_EVENT_ACTION:-}"
HEAD="${PR_HEAD_SHA:-}"
REPO="${GITHUB_REPOSITORY:?}"
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
    if (r) process.stdout.write(String(r.id));
  });')"
if [ -n "$hit" ]; then
  say "reuse-draft-fast: reusing ci.yml run $hit for head $HEAD"
  echo "reuse=true"
  echo "run=$hit"
else
  say "reuse-draft-fast: no green PR ci.yml run on $HEAD"
  echo "reuse=false"
fi
