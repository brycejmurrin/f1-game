#!/usr/bin/env bash
# @doc Was this commit gated green? Prints `green`, `red` or `unknown` for a sha from its ci.yml / pages.yml runs.
# Full description: prints `green`, `red` or `unknown` for a sha: a completed, successful ci.yml or pages.yml run on that
# exact head_sha.
# @section runner
#
# base-green.sh <sha>
#
# THE DELTA GATE ON A DEPLOY PUSH (2026-09-30). A pull request's node plan and
# sweeps scope to the diff (a circuit-only diff builds one circuit), and the
# deploy-branch push that merges it then rebuilt the whole fleet again — the
# same delta, ~6 runner-minutes, on the theory that "the tip is gated whole".
# The tip IS gated whole, inductively: when the previous tip passed its gate
# and this push's diff against it was gated for what it touched, the new tip
# holds. The one thing that breaks the induction is a RED previous tip — a
# circuit-only fix on top of an engine red must not narrow to the circuit and
# hand the engine red a green. So the push scopes only when its `before` was
# gated green, and this script is that one question.
#
# green:   GitHub holds a COMPLETED, SUCCESSFUL run of ci.yml or pages.yml
#          whose head_sha is exactly <sha>.
# red:     runs exist for <sha>, none of them succeeded.
# unknown: no run for <sha>, no `gh`, an API error, an empty sha.
#
# FAIL SAFE: only `green` may narrow anything. Callers treat `red` and
# `unknown` alike — run everything. Needs GH_TOKEN with actions:read and
# GITHUB_REPOSITORY (both set in the jobs that call this).
set -u
SHA="${1:-}"
REPO="${GITHUB_REPOSITORY:-}"
say() { echo "$*" >&2; }
case "$SHA" in ""|0000000000000000000000000000000000000000) say "base-green: no sha"; echo unknown; exit 0 ;; esac
[ -n "$REPO" ] || { say "base-green: GITHUB_REPOSITORY unset"; echo unknown; exit 0; }
command -v gh >/dev/null 2>&1 || { say "base-green: no gh on PATH"; echo unknown; exit 0; }
runs="$(gh api "repos/$REPO/actions/runs?head_sha=$SHA&per_page=30" 2>/dev/null)" || { say "base-green: runs API failed for $SHA"; echo unknown; exit 0; }
verdict="$(printf '%s' "$runs" | node -e '
  let s = ""; process.stdin.on("data", (d) => s += d).on("end", () => {
    let list = []; try { list = JSON.parse(s).workflow_runs || []; } catch (_) { process.stdout.write("unknown"); return; }
    const gate = list.filter((r) => r.status === "completed" && /\/(ci|pages)\.yml$/.test(r.path || ""));
    if (!gate.length) { process.stdout.write("unknown"); return; }
    process.stdout.write(gate.some((r) => r.conclusion === "success") ? "green" : "red");
  });')" || verdict=unknown
say "base-green: $SHA is $verdict"
echo "$verdict"
