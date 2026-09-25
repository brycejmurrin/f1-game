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
# SUCCESSFUL run for its exact head_sha of either ci.yml (a pull_request run,
# or a push run on any branch EXCEPT the deploy branch — a deploy-branch push
# is the FAST tier, guards and node suites only, and never a gate) or
# pages.yml (an earlier deploy of the same tree). Anything else — a failed
# run, a cancelled run, a run of another workflow, a fast-tier run, a run that
# never happened — means "run the gate". Run 2237 (2026-09-10) reused the
# merge commit's own fast-tier run before this exclusion existed.
# DEPLOY_BRANCH must be set (pages.yml's workflow env); without it no push run
# counts at all, which fails safe into the gate.
#
# A DRAFT PR's run is the fast tier too (2026-09-24, ci.yml decision 1c): it
# concludes success with smoke and the geometry sweeps SKIPPED. The runs
# listing does not say whether the PR was a draft, so a pull_request run
# counts only when its jobs show the sweeps job actually ran and passed; a
# jobs lookup that fails is, as everywhere here, "run the gate".
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
# fast_run: the FAST-tier ci.yml run (a deploy-branch push: guards, node
# suites, sweeps-parts, driving-model, selection) that already passed on this
# exact tree, when there is one. Never a reason to skip the gate — the train
# still runs the browser smoke, the geometry sweeps and the parts census (whose
# filter diffs a base, so it is not tree-only) — but the tree-only jobs it
# already passed give the same answer on the same bytes, so ci.yml's
# `fast_tier_run` input skips them (2026-09-16; a deploy push paid ~12 min of
# fast tier and then ~14 min of full tier, serially, with no job shared).
FAST_RUN=""
verdict() { printf 'reuse=%s\nsource=%s\nrun=%s\nfast_run=%s\n' "$1" "$2" "$3" "$FAST_RUN"; }
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
  # The fast tier on the same tree, remembered for the verdict either way.
  if [ -z "$FAST_RUN" ]; then
    FAST_RUN="$(printf '%s' "$json" | node -e '
      let s = ""; process.stdin.on("data", (d) => s += d).on("end", () => {
        let runs = []; try { runs = JSON.parse(s).workflow_runs || []; } catch (_) {}
        const self = process.env.GITHUB_RUN_ID || "";
        const deployBranch = process.env.DEPLOY_BRANCH || "";
        const fast = (r) => r.status === "completed" && r.conclusion === "success" && String(r.id) !== self
          && r.path === ".github/workflows/ci.yml" && r.event === "push" && deployBranch !== "" && r.head_branch === deployBranch;
        const r = runs.find(fast);
        if (r) process.stdout.write(String(r.id));
      });')"
    [ -n "$FAST_RUN" ] && say "fast tier already green on $c: ci.yml run $FAST_RUN (its tree-only jobs are reused)"
  fi
  hit="$(printf '%s' "$json" | node -e '
    let s = ""; process.stdin.on("data", (d) => s += d).on("end", () => {
      let runs = []; try { runs = JSON.parse(s).workflow_runs || []; } catch (_) {}
      const self = process.env.GITHUB_RUN_ID || "";
      const deployBranch = process.env.DEPLOY_BRANCH || "";
      // A push run is a full gate only OFF the deploy branch (there it is the fast tier).
      const fullPush = (r) => r.event === "push" && deployBranch !== "" && r.head_branch !== deployBranch;
      const gate = (r) => r.status === "completed" && r.conclusion === "success" && String(r.id) !== self && (
        (r.path === ".github/workflows/ci.yml" && (fullPush(r) || r.event === "pull_request")) ||
        (r.path === ".github/workflows/pages.yml" && (r.event === "push" || r.event === "workflow_dispatch" || r.event === "schedule")));
      for (const r of runs.filter(gate)) console.log(`${r.id} ${r.path} ${r.event} ${r.html_url || r.id}`);
    });')"
  while read -r id path event url; do
    [ -n "$id" ] || continue
    if [ "$event" = pull_request ]; then
      full="$(gh api "repos/$REPO/actions/runs/$id/jobs?per_page=100" 2>/dev/null | node -e '
        let s = ""; process.stdin.on("data", (d) => s += d).on("end", () => {
          let jobs = []; try { jobs = JSON.parse(s).jobs || []; } catch (_) {}
          if (jobs.some((j) => j.name === "Per-circuit geometry sweeps" && j.conclusion === "success")) process.stdout.write("yes");
        });')" || full=""
      if [ "$full" != yes ]; then say "run $id is a pull_request run whose sweeps did not run (a draft PR: fast tier) — not a gate"; continue; fi
    fi
    say "REUSING the gate: $c already passed $path $event"
    verdict true "$c" "$url"
    exit 0
  done <<EOF_HITS
$hit
EOF_HITS
  say "no successful gate run recorded for $c"
done

say "no reusable gate for $SHA; running the full gate"
verdict false "" ""
