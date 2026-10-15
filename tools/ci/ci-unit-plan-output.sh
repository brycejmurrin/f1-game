#!/usr/bin/env bash
# @doc pick-unit-slices --github-output for CI plan job (same logic as unit-plan).
# @section runner
set -u
case "${EVENT:-}" in
  schedule|workflow_dispatch)
    node tools/ci/pick-unit-slices.mjs --all --github-output
    exit 0
    ;;
esac
BASE=""
if [ "${CALLED:-}" = "true" ]; then
  BASE="${LIVE_BEFORE:-}"
elif [ "${EVENT:-}" = "pull_request" ]; then
  BASE="$(bash tools/ci/ci-pr-base.sh "${PR_BASE:-}")"
elif [ "${EVENT:-}" = "push" ]; then
  if [ "$(bash tools/ci/base-green.sh "${PUSH_BEFORE:-}")" = green ]; then
    BASE="${PUSH_BEFORE:-}"
  else
    echo "the previous tip ${PUSH_BEFORE:-?} is not known green: every slice runs" >&2
    node tools/ci/pick-unit-slices.mjs --all --github-output
    exit 0
  fi
fi
case "${BASE}" in
  ""|0000000000000000000000000000000000000000)
    echo "no base SHA — fail-safe --all" >&2
    node tools/ci/pick-unit-slices.mjs --all --github-output
    exit 0
    ;;
esac
if ! git cat-file -e "${BASE}^{commit}" 2>/dev/null; then
  echo "base $BASE unreachable — fail-safe --all" >&2
  node tools/ci/pick-unit-slices.mjs --all --github-output
  exit 0
fi
node tools/ci/pick-unit-slices.mjs --since "$BASE" --github-output
