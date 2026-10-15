#!/usr/bin/env bash
# @doc Ship-filter step for ci.yml plan job (diff against live github-pages deployment).
# @section runner
set -u
run_all() { echo "ships=true" >> "$GITHUB_OUTPUT"; echo "RUNNING SMOKE: $1"; exit 0; }
IS_PR=false
case "${EVENT:-}" in
  push) ;;
  pull_request) [ "${CALLED:-}" = "true" ] || IS_PR=true ;;
  *) [ "${CALLED:-}" = "true" ] || run_all "event is '${EVENT:-}', not a push, a pull request or a Pages call" ;;
esac
PATHS_FILE="${RUNNER_TEMP:-.}/staged-paths.txt"
node --input-type=module -e '
  import { stagedNames } from "./tools/desktop/stage-files.mjs";
  const names = [...stagedNames()].sort();
  if (!names.length) {
    console.error("FATAL: tools/desktop/stage-files.mjs stagedNames() is empty");
    process.exit(1);
  }
  process.stdout.write(names.join("\n") + "\n");
' > "$PATHS_FILE" || { echo "FATAL: could not read staged path list from tools/desktop/stage-files.mjs"; exit 1; }
if ! [ -s "$PATHS_FILE" ]; then
  echo "FATAL: staged path list is empty — refusing to mark ships=true"
  exit 1
fi
echo "--- staged paths ($(wc -l < "$PATHS_FILE") entries) ---"; cat "$PATHS_FILE"; echo "--------------------"
shipped_hit() {
  while IFS= read -r p; do
    [ -n "$p" ] || continue
    if printf '%s\n' "$1" | grep -qE "^${p}(/|$)"; then printf '%s' "$p"; return 0; fi
  done < "$PATHS_FILE"
  return 1
}
if [ "$IS_PR" = true ]; then
  PR_FROM="$(bash tools/ci/ci-pr-base.sh "${PR_BASE:-}")"
  case "${PR_FROM:-}" in
    ""|0000000000000000000000000000000000000000) run_all "pull request with no comparison base" ;;
  esac
  git cat-file -e "${PR_FROM}^{commit}" 2>/dev/null || run_all "PR base $PR_FROM unreachable in this checkout"
  PR_CHANGED=$(git diff --name-only "$PR_FROM" "$GITHUB_SHA") || run_all "git diff against the PR base $PR_FROM failed"
  echo "--- this PR's own diff (against $PR_FROM) ---"; echo "$PR_CHANGED"; echo "---------------------------------------------"
  if printf '%s\n' "$PR_CHANGED" | grep -qx 'tests/specs/smoke.spec.js'; then
    run_all "the PR edits the fixed smoke spec itself"
  fi
  if HIT="$(shipped_hit "$PR_CHANGED")"; then run_all "the PR touches a shipped path ($HIT)"; fi
  echo "the PR's own diff ships nothing; checking that its base ships what is live before skipping"
fi
API="${GITHUB_API_URL:-https://api.github.com}/repos/${GITHUB_REPOSITORY}/deployments?environment=github-pages&per_page=20"
RESP=$(curl -sS -H "Authorization: Bearer ${GH_TOKEN}" \
             -H "Accept: application/vnd.github+json" "$API") \
  || run_all "could not reach the deployments API"
DEPLOYMENTS_FILE="${RUNNER_TEMP:-.}/pages-deployments.tsv"
printf '%s' "$RESP" | node -e '
  let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
    try {
      const j = JSON.parse(s);
      if (!Array.isArray(j)) process.exit(1);
      for (const d of j) {
        if (!d || !d.sha || !d.statuses_url) process.exit(1);
        process.stdout.write(`${d.sha}\t${d.statuses_url}\n`);
      }
    } catch (_) { process.exit(1); }
  });' > "$DEPLOYMENTS_FILE" || run_all "could not parse the deployments API reply"
[ -s "$DEPLOYMENTS_FILE" ] || run_all "no github-pages deployment recorded yet"
LIVE=""
while IFS=$'\t' read -r SHA STATUSES_URL; do
  STATUS_RESP=$(curl -sS -H "Authorization: Bearer ${GH_TOKEN}" \
                         -H "Accept: application/vnd.github+json" "${STATUSES_URL}?per_page=1") \
    || run_all "could not read deployment status for $SHA"
  STATE=$(printf '%s' "$STATUS_RESP" | node -e '
    let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
      try { const j = JSON.parse(s); if (Array.isArray(j) && j[0] && j[0].state) process.stdout.write(j[0].state); }
      catch (_) {}
    });') || run_all "could not parse deployment status for $SHA"
  case "$STATE" in
    success) LIVE="$SHA"; break ;;
    inactive|failure|error|queued|pending|in_progress) ;;
    *) run_all "deployment $SHA has no trustworthy status" ;;
  esac
done < "$DEPLOYMENTS_FILE"
case "${LIVE:-}" in "") run_all "no successful active github-pages deployment found" ;; esac
git cat-file -e "${LIVE}^{commit}" 2>/dev/null || run_all "live SHA $LIVE unreachable in this checkout"
CHANGED=$(git diff --name-only "$LIVE" "$GITHUB_SHA") || run_all "git diff against $LIVE failed"
echo "--- changed since live ($LIVE) ---"; echo "$CHANGED"; echo "----------------------------------"
if printf '%s\n' "$CHANGED" | grep -qx 'tests/specs/smoke.spec.js'; then
  run_all "the fixed smoke spec itself changed"
fi
if HIT="$(shipped_hit "$CHANGED")"; then run_all "the diff touches a shipped path ($HIT)"; fi
echo "ships=false" >> "$GITHUB_OUTPUT"
echo "SKIPPING SMOKE: nothing in this diff reaches _site/ — the deployed bytes are unchanged since $LIVE"
