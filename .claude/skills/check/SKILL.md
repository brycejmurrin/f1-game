---
name: check
description: "Use when the user types \"check\" or asks status: is it green, live, still running, branch state? Not PR sweeps or reds (steward) or test picks (check-changes)."
user-invocable: true
---

# /check — one status answer, ≤ 5 lines

Read-only. Run what applies, in this order, then answer in at most five lines
(PR, head sha, CI verdict, run progress, live or not). No Plan dump, no
narration. Never start a run, push or re-run anything to answer.

1. `node tools/ci/session-status.mjs --pr` — branch, push/dirty state and PR/CI
   snapshot. It does not read the PR's Plan or Next step. Use `git rev-parse HEAD`
   when the snapshot has no head SHA. No PR is not evidence that no run exists.
2. `node tools/ci/ci-watch.mjs --sha <head> --once` — the `= ci …` line
   (`running (0 failed)` is not stale; `none` = the push started no run).
3. A live browser run: `node tools/ci/test-bg.mjs --status`, and the `= run …`
   line of `artifacts/logs/<group>.log` (anchor on
   `^= (run (passed|failed|timedout|interrupted)|bg exit)`).
4. Live build: `bash tools/ci/pages-live-sha.sh https://brycejmurrin.github.io/f1-game/`
   (agent `deploy-research` for more than the sha), then
   `git merge-base --is-ancestor <head> <live sha>` — exit 0 means live;
   exit 1 establishes non-ancestry only with sufficient history (a shallow
   checkout may lack the connecting commits); otherwise report unknown and
   let deploy-research recover the relevant history. Other failures mean unknown. An empty live
   read or missing local commit is unknown, not "not live"; use deploy-research
   for recovery. Run this only when liveness is asked; a merged topic commit
   can be live even while the local branch is still a topic branch.

A red job: name the failing job and test in the answer line and say the next
step is agent `ci-red-triage`, then `steward`. /check only reports: it does not
start the triage or a fix unless the user asks. Several PRs → `node
tools/ci/pr-board.mjs`, one line per PR.
