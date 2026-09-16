#!/usr/bin/env bash
# @doc Whose red is it? One line naming the last deploy-branch CI verdict below this head, with its failed job names.
# @section runner
#
# base-verdict.sh <head-sha> [deploy-branch]
#
# A red gate asks two different questions depending on one fact nobody has to
# hand: was the base already red? Train #2348 (2026-09-16) failed on
# `Per-circuit geometry sweeps` and `Selected specs` while the change under it
# was a tooling edit that could not touch either — and learning that cost a
# session several API calls and a log download, because the run summary names
# no test and no base. This prints the answer as one line before anyone asks:
#
#   ::notice::base 086e162 was red on: Per-circuit geometry sweeps, Selected specs
#
# THE BASE is the most recent COMPLETED ci.yml run on the deploy branch whose
# head commit is a strict ancestor of this head — strict, because a run of this
# very commit is this push, not what it landed on. Ancestry is asked of git, not
# of dates: a run on a branch tip that was never merged says nothing about what
# this tree was built on. A checkout with fetch-depth: 0 is therefore required;
# an absent commit is not an ancestor, so it is simply skipped.
#
# ADVISORY, ALWAYS. Every failure — no `gh`, an API error, no run below this
# head, a shallow checkout — prints one line saying so and exits 0. This must
# never turn a green gate red, so it takes no decisions and gates nothing; the
# step that runs it carries `continue-on-error` and `if: always()` as well.
#
# stdout is the ::notice:: line (Actions reads workflow commands there); the
# same verdict is appended to $GITHUB_STEP_SUMMARY when it is set, and the
# reasoning goes to stderr. Needs GITHUB_REPOSITORY and GH_TOKEN with
# actions:read (the token the `select` job already has).
set -eu
HEAD_SHA="${1:?head sha}"
BRANCH="${2:-${DEPLOY_BRANCH:-claude/f1-game-project-26h3ng}}"
REPO="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY}"

say() { echo "$*" >&2; }
# One verdict, two destinations: the log (as a ::notice::, which also lands in
# the run's annotations) and the job summary, when there is one.
emit() {
  echo "::notice::$1"
  [ -n "${GITHUB_STEP_SUMMARY:-}" ] || return 0
  { echo "### Base verdict"; echo; echo "$2"; echo; } >> "$GITHUB_STEP_SUMMARY"
}

runs="$(gh api "repos/$REPO/actions/runs?branch=$BRANCH&status=completed&per_page=50" 2>/dev/null)" || {
  emit "base verdict unavailable: could not list ci.yml runs on $BRANCH" \
       "Base verdict unavailable: could not list ci.yml runs on \`$BRANCH\`."
  exit 0
}

export HEAD_SHA
# sha<TAB>id<TAB>conclusion, newest first. The API already orders by created_at
# descending; this only filters to ci.yml and drops the run doing the asking.
candidates="$(printf '%s' "$runs" | node -e '
  let s = ""; process.stdin.on("data", (d) => s += d).on("end", () => {
    let list = []; try { list = JSON.parse(s).workflow_runs || []; } catch (_) {}
    const self = process.env.GITHUB_RUN_ID || "";
    const head = process.env.HEAD_SHA || "";
    const rows = list.filter((r) => r.status === "completed"
      && r.path === ".github/workflows/ci.yml"
      && String(r.id) !== self
      && r.head_sha && r.head_sha !== head);
    process.stdout.write(rows.map((r) => [r.head_sha, r.id, r.conclusion || "unknown"].join("\t")).join("\n"));
  });')" || candidates=""

BASE_SHA=""; BASE_RUN=""; BASE_CONC=""
while IFS=$'\t' read -r sha id conc; do
  [ -n "${sha:-}" ] || continue
  if ! git cat-file -e "$sha^{commit}" 2>/dev/null; then
    say "$sha is not in this checkout (shallow, or never merged here): skipped"
    continue
  fi
  if ! git merge-base --is-ancestor "$sha" "$HEAD_SHA" 2>/dev/null; then
    say "$sha is not an ancestor of $HEAD_SHA: skipped"
    continue
  fi
  BASE_SHA="$sha"; BASE_RUN="$id"; BASE_CONC="$conc"
  break
done <<EOF
$candidates
EOF

if [ -z "$BASE_SHA" ]; then
  emit "no completed ci.yml run on $BRANCH below $(echo "$HEAD_SHA" | cut -c1-7): this red, if any, has no base to compare against" \
       "No completed ci.yml run on \`$BRANCH\` below \`$(echo "$HEAD_SHA" | cut -c1-7)\` — nothing to compare this run against."
  exit 0
fi

SHORT="$(echo "$BASE_SHA" | cut -c1-7)"
RUN_URL="https://github.com/$REPO/actions/runs/$BASE_RUN"

if [ "$BASE_CONC" = "success" ]; then
  emit "base $SHORT was green — ci.yml run $BASE_RUN" \
       "base \`$SHORT\` was **green** ([ci.yml run $BASE_RUN]($RUN_URL))."
  exit 0
fi

# The job names, not the count: "red on: Selected specs" is the whole point.
# A job that was skipped or neutral is not a failure; a cancelled one is (it is
# how a timeout reports, and this workflow's header says so).
jobs="$(gh api "repos/$REPO/actions/runs/$BASE_RUN/jobs?per_page=100" 2>/dev/null)" || jobs=""
FAILED="$(printf '%s' "$jobs" | node -e '
  let s = ""; process.stdin.on("data", (d) => s += d).on("end", () => {
    let list = []; try { list = JSON.parse(s).jobs || []; } catch (_) {}
    const bad = new Set(["failure", "cancelled", "timed_out", "action_required"]);
    process.stdout.write(list.filter((j) => bad.has(j.conclusion)).map((j) => j.name).join(", "));
  });')" || FAILED=""

LABEL="red"
[ "$BASE_CONC" = "failure" ] || LABEL="red ($BASE_CONC)"
if [ -n "$FAILED" ]; then
  emit "base $SHORT was $LABEL on: $FAILED — ci.yml run $BASE_RUN" \
       "base \`$SHORT\` was **$LABEL on: $FAILED** ([ci.yml run $BASE_RUN]($RUN_URL))."
else
  emit "base $SHORT was $LABEL, no failing job named — ci.yml run $BASE_RUN" \
       "base \`$SHORT\` was **$LABEL**, with no failing job named ([ci.yml run $BASE_RUN]($RUN_URL))."
fi
