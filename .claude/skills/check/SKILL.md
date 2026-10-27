---
name: check
description: "Use when the user types \"check\" or asks status: is it green, live, still running, branch state? Not PR sweeps or reds (steward) or test picks (check-changes)."
user-invocable: true
---

# /check — one status answer, ≤ 5 lines

Read-only. Run what applies, in this order, then answer in this shape (drop a
line that does not apply; no Plan dump, no narration):

```
PR #<n> <draft|ready|merged|none> · <branch>
head <sha7> · <pushed|unpushed|dirty>
CI: <the `= ci …` line>
run: <the `= run …` line | none>
live: <yes|no|unknown> (<live sha7>)
```

Never start a run, push or re-run anything to answer.

1. `node tools/ci/session-status.mjs --pr` — branch, push/dirty state and PR/CI
   snapshot. It does not read the PR's Plan or Next step. Use `git rev-parse HEAD`
   when the snapshot has no head SHA. No PR is not evidence that no run exists.
2. `node tools/ci/ci-watch.mjs --sha <head> --once` — the `= ci …` line
   (`running (0 failed)` is not stale; `none` = the push started no run).
3. Only when step 1 shows a live run (or `artifacts/logs/` has a log newer than
   the head commit): `node tools/ci/test-bg.mjs --status`, and the `= run …`
   line of `artifacts/logs/<group>.log` (anchor on
   `^= (run (passed|failed|timedout|interrupted)|bg exit)`).
4. Live build: `bash tools/ci/pages-live-sha.sh https://brycejmurrin.github.io/f1-game/`
   (agent `deploy-research` for more than the sha), then
   `git merge-base --is-ancestor <head> <live sha>` — exit 0 means live; exit 1
   means not live only in a full clone. If `git rev-parse --is-shallow-repository`
   prints `true`, first run `git fetch --deepen=200 origin claude/f1-game-project-26h3ng`
   (or `--unshallow`) and retry. Any other result — an empty live read, a missing
   commit, exit 128 — is unknown, never "not live". Run this only when liveness
   is asked; a merged topic commit can be live while the local branch is still a
   topic branch.

A red job: name the failing job and test in the CI line and say the next step
is agent `ci-red-triage`, then `steward`. /check itself only reports; the
session that owns the PR still treats the red as work now (AGENTS.md rule 13).
Several PRs → `node tools/ci/session-status.mjs --pr <n>` per PR (seconds);
`node tools/ci/pr-board.mjs` gives one line per PR but takes ~100 s, so run it
in the background or only when asked for the whole board.
