#!/usr/bin/env bash
# @doc WebXR path filter step (plan job).
# @section runner
set -u
run_all() { echo "xr=true" >> "$GITHUB_OUTPUT"; echo "RUNNING test:xr: $1"; exit 0; }
case "${EVENT:-}" in
  push|pull_request) ;;
  *) run_all "event is '${EVENT:-}' (dispatch forces the suite)" ;;
esac
BEFORE="${BEFORE:-}"
[ "${EVENT:-}" = pull_request ] && BEFORE="$(bash tools/ci/ci-pr-base.sh "${BEFORE}")"
case "${BEFORE:-}" in
  ""|0000000000000000000000000000000000000000) run_all "no before-sha (new branch, first push)" ;;
esac
git cat-file -e "${BEFORE}^{commit}" 2>/dev/null || run_all "before-sha $BEFORE unreachable"
CHANGED=$(git diff --name-only "$BEFORE" "$GITHUB_SHA") || run_all "git diff failed"
echo "--- changed files ---"; echo "$CHANGED"; echo "---------------------"
if printf '%s\n' "$CHANGED" | grep -qE '^(js/xr/|tests/specs/vr-emulated\.spec\.js$|tests/helpers/iwer-install\.mjs$|tests/vendor/iwer-2\.5\.0\.min\.js$|playwright\.config\.js$|\.github/workflows/ci\.yml$)'; then
  echo "xr=true" >> "$GITHUB_OUTPUT"
  echo "RUNNING test:xr: the diff touches WebXR, IWER, or the xr-emulated project"
else
  echo "xr=false" >> "$GITHUB_OUTPUT"
  echo "SKIPPING test:xr: nothing in this diff reaches WebXR"
fi
