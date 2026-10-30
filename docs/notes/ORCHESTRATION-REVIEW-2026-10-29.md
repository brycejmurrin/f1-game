# Orchestration review: the 2026-10-29 dispatcher day, and the three days before it

A process review, not a code review. Part 1 covers the dispatcher session
`session_01BEw9UGzHxvbNVpc6VPxEth` (2026-10-29 07:33Z → 10-30 05:00Z) and the 11 workers it
launched or adopted. Each worker transcript was read by a read-only reviewer subagent through
`list_events`, and their findings are merged below with the dispatcher's own view. Part 2, the 10-27 → 10-30 scan
of the other 29 sessions, is appended when those reviews finish. Times are UTC.

## Outcome

About 20 open PRs at 07:25Z became 1 by 19:15Z: 19 merged or closed. #3981 remains, green and labelled
`land`, but its `gate` status went stale (finding 4). Bryce answered 3 batched AskUserQuestion rounds:
the holds on #4062, #4076 and #4137, the #4179 CSS ceiling, #4096 ceremony default-on, #4076 close, the
#4190 phone check, and the #4192 follow-up (#4203).

The losses were waiting, not wrong work.

## Findings, ranked by cost

1. **Unattended workers blocked on interactive prompts: about 3 h in total.**
   - The ceremony-chain worker waited about 40 min on `gh api -X POST …/pulls/4107/ccr/ready_for_review; gh api … labels[]=land`.
     The prompt went unanswered and was finally rejected. The same call had passed without a prompt for #4101 and #4104.
   - The #4108 worker waited 68 min on the same ready flip; ready-gate had printed `= ready-gate passed` 2 s earlier.
   - The launch prompt's first step, `gh api -X DELETE …/labels/needs-owner`, was denied by the auto-mode classifier
     (`[External System Writes]`) in at least 4 of 11 workers, so `needs-owner` stayed on owned PRs.
   - Fix: give unattended lanes one blessed ready-flip route (ready-gate → MCP `update_pull_request draft:false` →
     `land`). Add a rule that a prompt unanswered for 2 min switches routes. The dispatcher posts the adoption comment and
     strips `needs-owner` at launch, so the worker no longer has to.
   - Owner: Bryce, because permission settings are his call.

2. **The local floor is 10–21 min and still misses merge-ref reds.**
   - `tooling-fast --changed` widened to the full ~712-file suite on every generated-file diff (`index.html`, `sw.js`,
     `impact-map.json`), on `.github/actions/*`, and after every deploy-tip merge.
   - Measured: 630–1261 s per run, at about 6 runs per worker in the ceremony chain.
   - It still missed reds that exist only on GitHub's merge ref: `fixture-consumer-audit` FLOOR, the assertPins ratchet,
     and `agentHelp` size.
   - Fix: map generated files back to their source instead of widening. A sync-only merge (nothing authored beyond the
     merge) runs `gen:check` + docs-integrity locally and leaves the rest to CI. `--quiet` must name the failing files.

3. **Known reds were rediscovered in every PR.**
   - The eager-shell budget (`boot-load-budget.test.mjs`, 325) hit 4 PRs, each after a full floor. #3981 and #4108 then
     both asked for 326; #4108 solved it by moving RaceCeremony into `LAZY_RACE_SESSION`.
   - `agent-config.test.mjs` #38 (`claude plugin validate`) fails in every cloud container. About 8 sessions each spent
     a pass proving it was environmental.
   - Every new module needs the same set: VM stubs (`race-session-lazy`, `results-cam`, `ui-sheets-audit`),
     `types/game-ctx.d.ts`, `agent-index.json`, and the assert-pin ratchet.
   - Fix: skip #38 when the `claude` CLI cannot validate. Put "the eager shell is full: new modules go in the lazy lists"
     in `.claude/rules/game-code.md`. Have `pick-tests` print a new-global checklist.

4. **`land.yml` gaps leave the `gate` status stale.**
   - `land.yml` has no `edited` trigger. Ticking or striking Plan items in the body never re-gates, so #3981 shows
     `plan=FAIL` from 13:18Z with a closed Plan.
   - On #3970 `gate` sat at `pending` after CI passed.
   - A `land.yml` dispatch from a session was refused as `[Merge Without Review]`.
   - Fix: add `edited` (body only) to the `pull_request_target` types, plus a scheduled sweep that re-gates any `land` PR
     whose `gate` is older than its last CI success.
   - Workaround today: remove and re-add `land`.

5. **Tool defects.**
   - `sync-pr.mjs` regenerates `tools/shot/scenery-locations.json` after staging, so the merge commit fails
     (`merge commit failed: guards: cache miss`) and `MERGE_HEAD` is lost. This hit #4125 and #4108; both were redone by
     hand.
   - The `sw.js` stamp-regex line and the `tools/manifest.cjs` lazy lists re-conflicted on every sync of the ceremony
     chain, 4 times at about 15 min each.
   - `wait-for.mjs` silently caps a foreground `--timeout` above 590 s (about 8 repeated waits).
   - AGENTS.md rule 4's example `'^= '` never matches `test-bg` logs, whose lines are `[hh:mm:ss] = run passed`. That cost
     19 min of dead waiting.
   - `test-bg.mjs` rejects `-g`/`--grep`.
   - Fix: stage after the regen. Generate the `sw.js` stamp list from the manifest. Make `wait-for` refuse instead of
     cap. Correct the example regex. Accept `--grep`.

6. **Dispatching errors (the dispatcher's own).**
   - A takeover was launched onto #4187 while a Cursor agent was still pushing it. The worker lost 57 min before
     `bash-guard` refused the foreign push.
   - #4096's worker was launched while its prerequisite #4108 was unmerged, and idled 4.4 h.
   - The dispatcher's worker process was restarted about 15 times, which delayed the batched Bryce questions by about 4 h.
   - Fix: run a foreign-activity probe before launch (another author's commit, or a non-Claude lane, on the head within
     2 h). Launch a dependent only when its prerequisite merges. Ask Bryce at the start of a cycle, before long work.

7. **`subscribe_pr_activity` fails with no reason on some PRs** (#3970, #3981, sometimes #4062). The fallback,
   `ci-watch.mjs`, caps at 30 min. Fix: document the fallback in docs/WORKERS.md §4 (`ci-watch --once`, then `@parent`),
   and ask the platform for a reason string.

8. **Noise.**
   - `stop-hook-git-check.sh` fired about 20 times on deliberate holds and stand-downs, and counted unpushed commits
     against the topic branch instead of the deploy tip.
   - `gh pr view` returns `HTTP 403: GitHub GraphQL is not available` but is still shown in docs and skills.
   - `protect-files.sh` flags a branch-switching `git checkout -B` as a generated-file edit.
   - `.claude/skills/steward/references/cancelled-and-sync.md` is referenced but missing.

## What worked

- Launch prompts that carried the Hand-off block, `STOP AT`, exact numbers and the known container-only failure. #4090
  went from launch to merge in about 30 min.
- `ci-red-triage` named the exact test and assertion within seconds each time. `ready-gate`'s plan-open message names
  the unticked item.
- The foreign-push guard stopped a bad push. Stand-downs and cap hand-offs (Plan, Hand-off, `needs-owner`,
  `send_message`) were clean.
- One re-run, then treat a second failure as real: this caught #4195's real merge interaction instead of calling it a
  flake.

## Part 2: sessions 2026-10-27 → 10-30

Pending: five read-only reviewer batches over the remaining 29 sessions; see `scratch/session-review/{A..E}.md`.
