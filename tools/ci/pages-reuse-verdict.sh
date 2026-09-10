#!/usr/bin/env bash
# @doc Pages gate reuse: prints `reuse=true` (+source/run) when this tree already passed CI as this commit or a parent.
# @section runner
#
# pages-reuse-verdict.sh <commit-sha>
#
# A merge made through GitHub is a NEW commit, so every PR merge used to pay
# the full ~15-minute gate a second time even when the PR run had tested the
# very same files. The tree is the proof: when the merge commit's tree equals
# a parent's tree, the same bytes were already gated — same workflow file,
# same tests, same result — and the gate can be reused instead of re-run.
#
# Candidates, in order: the commit itself, then each parent whose tree hash
# equals this commit's. A candidate counts when GitHub holds a COMPLETED,
# SUCCESSFUL run for its exact head_sha of either ci.yml (a branch push or a
# pull_request run — both run every gate job) or pages.yml (an earlier deploy
# of the same tree). Anything else — a failed run, a cancelled run, a run of
# another workflow, a run that never happened — means "run the gate".
#
# A pull_request run tests GitHub's merge ref, not the PR head. That is still
# sound here: this only reuses such a run when merging the base into the head
# produced the head's own tree, so the earlier, older base merged into it the
# same way. A merge whose base moved has a different tree and no candidate.
#
# Every failure of the lookup (no `gh`, an API error) is a `reuse=false`: the
# cost of being wrong that way is one gate run, which is what happens today.
#
# stdout is GITHUB_OUTPUT lines — reuse=, source=, run= — so the workflow
# appends it directly; the reasoning goes to stderr. Needs a checkout deep
# enough to see the parents (fetch-depth: 0) and GH_TOKEN with actions:read.
set -eu
SHA="${1:?commit sha}"
REPO="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY}"

say() { echo "$*" >&2; }
verdict() { printf 'reuse=%s\nsource=%s\nrun=%s\n' "$1" "$2" "$3"; }
tree_of() { git rev-parse --verify -q "$1^{tree}" 2>/dev/null; }

TREE="$(tree_of "$SHA")" || { say "::warning::$SHA is not in this checkout; running the full gate"; verdict false "" ""; exit 0; }

candidates="$SHA"
for parent in "$SHA^1" "$SHA^2"; do
  p="$(git rev-parse --verify -q "$parent" 2>/dev/null)" || continue
  if [ "$(tree_of "$p")" = "$TREE" ]; then
    say "parent $p has the same tree as $SHA"
    candidates="$candidates $p"
  else
    say "parent $p has a different tree"
  fi
done

for c in $candidates; do
  json="$(gh api "repos/$REPO/actions/runs?head_sha=$c&status=success&per_page=30" 2>/dev/null)" \
    || { say "::warning::could not list workflow runs for $c; running the full gate"; continue; }
  hit="$(printf '%s' "$json" | node -e '
    let s = ""; process.stdin.on("data", (d) => s += d).on("end", () => {
      let runs = []; try { runs = JSON.parse(s).workflow_runs || []; } catch (_) {}
      const self = process.env.GITHUB_RUN_ID || "";
      const gate = (r) => r.status === "completed" && r.conclusion === "success" && String(r.id) !== self && (
        (r.path === ".github/workflows/ci.yml" && (r.event === "push" || r.event === "pull_request")) ||
        (r.path === ".github/workflows/pages.yml" && (r.event === "push" || r.event === "workflow_dispatch")));
      const r = runs.find(gate);
      if (r) process.stdout.write(`${r.path} ${r.event} ${r.html_url || r.id}`);
    });')"
  if [ -n "$hit" ]; then
    say "REUSING the gate: $c already passed ${hit% *}"
    verdict true "$c" "${hit##* }"
    exit 0
  fi
  say "no successful gate run recorded for $c"
done

say "no reusable gate for $SHA; running the full gate"
verdict false "" ""
