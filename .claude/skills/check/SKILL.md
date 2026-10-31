---
name: check
description: "Use when the user types \"check\" or asks for status: is my PR green, merged, live or still running? Not for: fixing a red PR → steward; choosing tests → check-changes."
user-invocable: true
---

# /check — one status answer, ≤ 6 lines

Read-only. Run what applies, in this order, then answer in this shape (drop a
line that does not apply; no Plan dump, no narration):

```
PR #<n> <draft|ready|merged|none> · <branch>
head <sha7> · <pushed|unpushed|dirty>
CI: <the `= ci …` line>
gate: <success|pending|failure|absent> (<its description>)
run: <the `= run …` line | none>
live: <yes|no|unknown> (<live sha7>)
```

Green = `CI` success AND the `gate` status success on the PR head. "gate" means three things here; only the
third is the ruleset's: `ready-gate.mjs` (the draft→ready receipt), `Structural guards` (the job it reads), and
`land.yml`'s `gate` COMMIT STATUS. Never start a run, push or re-run anything to answer.

1. `node tools/ci/session-status.mjs --summary --pr` — branch, push/dirty state and PR/CI
   snapshot. It finds OPEN PRs only: "no open PR" may mean merged — check with `gh api "repos/brycejmurrin/f1-game/pulls?state=all&head=brycejmurrin:<branch>"`
   (or MCP `search_pull_requests`), then pass `--pr <n>`. Use `git rev-parse HEAD` when the
   snapshot has no head SHA. No PR is not evidence that no run exists.
2. `node tools/ci/ci-watch.mjs --sha <head> --once` — the `= ci …` line (its default floor is the PR's last run-ci/ready/reopen event, so an older head reads `none`: add `--since none` to look further back). Anything but `passed` is not green:
   `running (0 failed)` is not stale; `none` = the push started no run; `hollow` = a draft without `run-ci`;
   `superseded (merged)` → re-read with `--sha <merge sha> --pages`; `superseded (new head …)` → re-read on that
   sha; `blocked` = conflicts; `unknown` = no API evidence.
3. The `gate` line: `gh api repos/brycejmurrin/f1-game/commits/<head>/statuses`, newest `context: gate` (ci-watch does not
   read statuses). Absent on a draft or a PR without `land` is expected; for one PR's land readiness (Plan, LAND/WAIT)
   `node tools/ci/pr-board.mjs --pr <n>`.
4. Only when step 1 shows a live run (or `artifacts/logs/` has a log newer than
   the head commit): `node tools/ci/test-bg.mjs --status`, and the `= run …`
   line of `artifacts/logs/<group>.log` (anchor on
   `= (run (passed|failed|timedout|interrupted)|bg exit)`).
5. Live build, only when liveness is asked: agent `deploy-research` returns the live `apex-sha` (never curl
   github.io from the main context; steward §7). Then `git merge-base --is-ancestor <head> <live sha>` — exit 0
   means live; exit 1 means not live only in a full clone. If `git rev-parse --is-shallow-repository` prints
   `true`, first run `git fetch --deepen=200 origin claude/f1-game-project-26h3ng` (or `--unshallow`) and retry.
   Any other result — an empty live read, a missing commit, exit 128 — is unknown, never "not live". A merged
   topic commit can be live while the local branch is still a topic branch.

A red job: name the failing job and test in the CI line and say the next step
is agent `ci-red-triage`, then `steward`. /check itself only reports; the
session that owns the PR still treats the red as work now (AGENTS.md rule 13).
Several PRs → `node tools/ci/session-status.mjs --summary --pr <n>` per PR (seconds); the whole board
(`node tools/ci/pr-board.mjs`) is slow, so run it in the background or only when asked for it.
