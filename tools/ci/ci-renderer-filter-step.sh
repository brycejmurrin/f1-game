#!/usr/bin/env bash
# @doc Renderer path filter step (plan job).
# @section runner
set -u
run_all() { echo "renderer=true" >> "$GITHUB_OUTPUT"; echo "RUNNING RENDERER SPECS: $1"; exit 0; }
case "${EVENT:-}" in
  push|pull_request) ;;
  *) run_all "event is '${EVENT:-}', not a push/pull_request" ;;
esac
BEFORE="${BEFORE:-}"
[ "${EVENT:-}" = pull_request ] && BEFORE="$(bash tools/ci/ci-pr-base.sh "${BEFORE}")"
case "${BEFORE:-}" in
  ""|0000000000000000000000000000000000000000) run_all "no before-sha (new branch, first push)" ;;
esac
git cat-file -e "${BEFORE}^{commit}" 2>/dev/null || run_all "before-sha $BEFORE unreachable (force push?)"
CHANGED=$(git diff --name-only "$BEFORE" "$GITHUB_SHA") || run_all "git diff failed"
echo "--- changed files ---"; echo "$CHANGED"; echo "---------------------"
SPECS_FILE="${RUNNER_TEMP:-.}/gfx-specs.txt"
node -e 'const s=require("./package.json").scripts["test:gfx"]||"";const m=s.match(/tests\/specs\/[^\s]+/g)||[];if(!m.length)process.exit(1);process.stdout.write(m.join("\n")+"\n")' > "$SPECS_FILE" \
  || run_all "could not read the gfx spec list out of package.json"
echo "--- gfx specs ---"; cat "$SPECS_FILE"; echo "-----------------"
if printf '%s\n' "$CHANGED" | grep -qE '^(js/render/|js/lighting/|playwright(\.gpu)?\.config\.js$|tests/helpers/)' \
  || printf '%s\n' "$CHANGED" | grep -qxF -f "$SPECS_FILE"; then
  echo "renderer=true" >> "$GITHUB_OUTPUT"
  echo "RUNNING RENDERER SPECS: the diff touches the renderer, its lighting modules, a gfx spec or the launch config"
else
  echo "renderer=false" >> "$GITHUB_OUTPUT"
  echo "SKIPPING RENDERER SPECS: nothing in this diff reaches the renderer"
fi
