---
name: check
description: "Use when the user types \"check\" or asks status: is it green, live, still running, this branch's state? Not sweeps (ci-watch) or fixing reds (steward)."
user-invocable: true
---

# /check — one status answer, ≤ 5 lines

Read-only. Run what applies, in this order, then answer in at most five lines
(PR, head sha, CI verdict, run progress, live or not). No Plan dump, no
narration. Never start a run, push or re-run anything to answer.

1. `node tools/ci/session-status.mjs --pr` — branch, head sha, PR, Plan, Next step.
   No PR and `= ci none`: answer "no PR, no run" with the branch and sha; do not search further.
2. `node tools/ci/ci-watch.mjs --sha <head> --once` — the `= ci …` line
   (`running (0 failed)` is not stale; `none` = the push started no run).
3. A live browser run: `node tools/ci/test-bg.mjs --status`, and the `= run …`
   line of `artifacts/logs/<group>.log` (anchor on `^= (run|bg exit)`).
4. Live build: `bash tools/ci/pages-live-sha.sh https://brycejmurrin.github.io/f1-game/`
   (agent `deploy-research` for more than the sha), then
   `git merge-base --is-ancestor <head> <live sha>` — ancestor means live.
   Skip 4 when the head is not on the deploy branch.

A red job: name the failing job and test in the answer line and say the next
step is agent `ci-red-triage`, then `steward`. /check only reports: it does not
start the triage or a fix unless the user asks. Several PRs → `node
tools/ci/pr-board.mjs`, one line per PR.
