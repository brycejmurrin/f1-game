---
name: check
description: "Use when the user types \"check\" or asks status: is it green, live, still running? One ≤5-line answer."
user-invocable: true
---

# /check — one status answer, ≤ 5 lines

Read-only. Run what applies, in this order, then answer in at most five lines
(PR, head sha, CI verdict, run progress, live or not). No Plan dump, no
narration. Never start a run, push or re-run anything to answer.

1. `node tools/ci/session-status.mjs --pr` — branch, head sha, PR, Plan, Next step.
2. `node tools/ci/ci-watch.mjs --sha <head> --once` — the `= ci …` line
   (`running (0 failed)` is not stale; `none` = the push started no run).
3. A live browser run: `node tools/ci/test-bg.mjs --status`, and the `= run …`
   line of `artifacts/logs/<group>.log` (anchor on `^= (run|bg exit)`).
4. Live build: `bash tools/ci/pages-live-sha.sh https://brycejmurrin.github.io/f1-game/`
   (agent `deploy-research` for more than the sha), then
   `git merge-base --is-ancestor <head> <live sha>` — ancestor means live.
   Skip 4 when the head is not on the deploy branch.

A red job: name the failing job and test in the answer line and start
`ci-red-triage`; a red is work, not a status. Several PRs → `node
tools/ci/pr-board.mjs`, one line per PR.
