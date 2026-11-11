#!/usr/bin/env bash
# @doc On ready_for_review, reuse a green draft fast-tier run for the same PR head SHA and base SHA.
# @section runner
#
# reuse-draft-fast.sh            # the reuse question (stdout: GITHUB_OUTPUT lines)
# reuse-draft-fast.sh --record   # tooling A only: record this run's guards scope (see THE RECORD)
#
# Prints GITHUB_OUTPUT `reuse=true|false`. True only when this run is
# `ready_for_review` AND GitHub holds a completed successful ci.yml
# pull_request run for the exact PR head SHA (the draft that just went green),
# on its FIRST attempt, tested against the SAME base SHA as this run.
# Callers skip the expensive fast-tier STEPS (names still report) and still
# run ready-only jobs (smoke, sweeps, renderer) and the selected legs (a draft
# ran them on a smaller budget; see the note at the bottom).
#
# THE BASE MUST NOT HAVE MOVED (15-F5, 2026-10-10). A pull_request run tests
# refs/pull/N/merge: the head merged into the base tip AT THAT TIME. Marking
# ready hours later puts the new run on a newer base, and the merge-dependent
# checks the reuse skips (tooling A/B, ratchet comparison, test:audit, the node
# slices) are exactly the ones that fail on a semantic merge. The base each run
# tested is the first parent of its merge commit; the draft run's is read from
# its record, this run's from its own checkout, and they must be the same SHA.
# (This compared the base tip's committer date with the run's start until
# 2026-11-10; a re-run resets `run_started_at`, and a date is not a commit.)
#
# A RE-RUN IS NOT A FIRST-TIME PASS (2026-11-10). A run whose `run_attempt` is
# above 1 failed or was cancelled at least once on this head; it is never
# reused, so the ready run tests the head again.
#
# THE RECORD. Tooling A writes one annotation, title `apex-guards`, message
# `mode=<full|changed|unknown> base=<sha|none>`: the guards scope it ran (or the
# scope of the draft it reused) and the base SHA its merge commit sits on.
# Annotations are readable through the check-runs API (a job's id is its check
# run id), so a later run can ask what an earlier one tested. `mode` is also a
# step output (`guards_mode`). tools/ci/pages-reuse-verdict.sh reads the same
# record and reuses only a `mode=full` run.
#
# Fail-safe: any lookup problem is reuse=false (run the fast tier again).
set -eu
REPO="${GITHUB_REPOSITORY:?}"
say() { echo "$*" >&2; }

# The base SHA this checkout's merge commit sits on: its first parent, read from
# the commit object so a shallow checkout answers too. Empty off a pull_request.
current_base() {
  [ "${GITHUB_EVENT_NAME:-pull_request}" = pull_request ] || return 0
  git cat-file -p HEAD 2>/dev/null | sed -n 's/^parent //p' | head -1
}

if [ "${1:-}" = "--record" ]; then
  mode="${SCOPE_MODE:-${REUSED_MODE:-}}"
  case "$mode" in full|changed) ;; *) mode=unknown ;; esac
  base="$(current_base)"
  echo "::notice title=apex-guards::mode=$mode base=${base:-none}"
  [ -n "${GITHUB_OUTPUT:-}" ] && echo "guards_mode=$mode" >> "$GITHUB_OUTPUT"
  exit 0
fi

ACTION="${GITHUB_EVENT_ACTION:-}"
HEAD="${PR_HEAD_SHA:-}"
no() { say "reuse-draft-fast: $*"; echo "reuse=false"; exit 0; }

[ "$ACTION" = "ready_for_review" ] || no "action=$ACTION — not ready_for_review"
case "$HEAD" in ""|0000000000000000000000000000000000000000) no "no PR head sha" ;; esac
command -v gh >/dev/null 2>&1 || no "no gh"
BASE="${CURRENT_BASE:-$(current_base)}"
[ -n "$BASE" ] || no "this run's base SHA is unknown — run the fast tier"
json="$(gh api "repos/$REPO/actions/runs?head_sha=$HEAD&status=success&per_page=30" 2>/dev/null)" || no "runs API failed"
hit="$(printf '%s' "$json" | node -e '
  let s = ""; process.stdin.on("data", (d) => s += d).on("end", () => {
    let runs = []; try { runs = JSON.parse(s).workflow_runs || []; } catch (_) {}
    const self = process.env.GITHUB_RUN_ID || "";
    const r = runs.find((x) => x.status === "completed" && x.conclusion === "success"
      && String(x.id) !== self && x.path === ".github/workflows/ci.yml"
      && x.event === "pull_request");
    if (r) process.stdout.write(`${r.id} ${Number(r.run_attempt) || 1}`);
  });')"
[ -n "$hit" ] || no "no green PR ci.yml run on $HEAD"
attempt="${hit#* }"; hit="${hit%% *}"
[ "$attempt" = 1 ] || no "ci.yml run $hit passed on attempt $attempt, not its first — run the fast tier"

# A GREEN RUN IS NOT A RUN THAT TESTED ANYTHING (#2184, 2026-10-15). A skipped
# job reports success, so a run whose fast-tier jobs skipped (until 2026-11-03 a
# draft that had not opted in, or a label-noise run; still any run cancelled-then-green
# by a cancelled shard) concludes success while testing nothing. Reuse only a
# run whose tooling A shard really ran and passed, and whose record names a base.
# THE `selected` LEGS ARE NOT REUSED HERE: a draft runs selected on a 5-min
# budget, ready on 10, so their shard layouts differ. Only the tree-only
# fast-tier STEPS reuse here; tools/ci/reuse-draft-selected.mjs (#5426) reuses
# the legs when the two plans name the same specs, nothing was dropped and the
# deploy tip has not moved since this same base.
job="$(gh api "repos/$REPO/actions/runs/$hit/jobs?per_page=100" 2>/dev/null | node -e '
  let s = ""; process.stdin.on("data", (d) => s += d).on("end", () => {
    let jobs = []; try { jobs = JSON.parse(s).jobs || []; } catch (_) {}
    const a = jobs.filter((j) => j.name === "Structural guards (tooling A)");
    if (a.length === 1 && a[0].conclusion === "success") process.stdout.write(String(a[0].id || ""));
  });')" || job=""
[ -n "$job" ] || no "ci.yml run $hit concluded success but its tooling A shard did not run and pass (a skip-only run) — run the fast tier"
record="$(gh api "repos/$REPO/check-runs/$job/annotations?per_page=100" 2>/dev/null | node -e '
  let s = ""; process.stdin.on("data", (d) => s += d).on("end", () => {
    let rows = []; try { rows = JSON.parse(s); } catch (_) {}
    const r = (Array.isArray(rows) ? rows : []).find((a) => a && a.title === "apex-guards");
    const m = r && /^mode=(full|changed|unknown) base=([0-9a-f]{40}|none)$/.exec(String(r.message || "").trim());
    if (m) process.stdout.write(`${m[1]} ${m[2]}`);
  });')" || record=""
[ -n "$record" ] || no "ci.yml run $hit has no readable guards record — run the fast tier"
mode="${record%% *}"; drafted="${record#* }"
[ "$drafted" = "$BASE" ] || no "draft run $hit tested base $drafted, this run tests $BASE — merge-dependent checks must re-run"
say "reuse-draft-fast: reusing ci.yml run $hit for head $HEAD on base $BASE (guards $mode)"
echo "reuse=true"
echo "run=$hit"
echo "guards_mode=$mode"
