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

`list_sessions` (mine) returned 40 sessions created since 10-27. Part 1 covered 12 of them. Five read-only
reviewer batches read the other 28 through `list_events`:
- A: the 10-27 fleet and dispatcher B.
- B and C: the 10-28 orchestrators, sync workers, the Opus audit and dispatchers C/D.
- D: Bryce's 10-29 chats.
- E: the UI hunts and the 10-30 perf hunts.

Coverage is partial: the newest 2–8 pages and the first page of each session. The raw reports are
`scratch/session-review/{A..E}.md`, not committed. Items marked *(retired)* are the fleet bus, relay and coordinator
design that docs/WORKERS.md already retired; they are recorded so they are not re-proposed.

### Cross-cutting findings, ranked by cost

1. **Draft / ready / `land` confusion and unanswerable prompts in unattended sessions.** Same shape as Part 1 finding 1.
   - Perf hunt #6 put `land` on a DRAFT and waited 108 min ("GitHub will merge it once the `gate` check is green").
     Bryce had to type "Chdck", then "Convert it then run another full hunt".
   - Perf hunt #5 sat 75 min between "Flipping the PR to ready" and the flip.
   - Fix: one command, `ready-gate → flip → land`, for every lane. `land` on a draft prints a refusal, never a silent
     wait. A ready-gate receipt that has aged out re-runs instead of refusing.

2. **CI reds that the local floor could not see, on a moving base.**
   - #4190: 4 red cycles, $72 session. The pin ratchet was "10 over its ceiling" with the base 180 commits ahead.
   - #4194 (UI parent, $62): 3 full tiers on specs it could not run locally.
   - #4188: 3 cycles for one missing `DrivingLine` stub.
   - #4193: a duplicate id `pm-line` was caught only by a CI shard; the local timeout was read as "machine slow".
   - Plus the merge-ref-only reds in Part 1.
   - Fix: before the ready flip, a probe that merges the current deploy tip locally and runs the ratchets,
     `fixture-consumer-audit` and the `pick-tests` specs on that merge. Add to `pick-tests`: specs that load a changed
     module standalone, and the shared UI layer. Add a unit guard for unique ids in `index.html`.

3. **Dispatcher churn and duplicate orchestrators (10-27 → 10-28).**
   - Seven dispatcher or orchestrator sessions in 30 h. Three dispatchers started inside 35 min on 10-28
     (C 07:35Z, "for f1-game" 07:59Z, takeover 08:05Z). One died in 99 s on a rejected first command, and one tagged
     `no-archive` was archived after 11 min with its `--apply` run orphaned.
   - Two orchestrators changed labels on the same PRs on 10-29 07:41Z.
   - A 51-PR sweep file stayed local to a dead container.
   - Fix: a single dispatcher lock on the Board issue that `dispatch.mjs --apply` checks. The handoff skill makes the old
     orchestrator stop writing at handover and clears its `/goal`. Sweeps go to the Board comment, not artifacts.

4. **Quota and cost blowups.**
   - The 10-28 Opus audit cost $39, fanning out about 15 skill workers. It then hit the weekly limit and failed about 30
     wake-ups in a row (`usage_limit_reached`). Its worker branches were reported DONE but never merged.
   - Opus parents of $62 (UI) and $72 (perf #4190), each holding 500k-plus contexts.
   - Dispatcher B woke 22 times, cost $3.96, and launched nothing under `allowed_warning`.
   - *(retired)* The orchestrators woke their full context on each bus ping.
   - Fix: stop or disable triggers when `rate_limit_info.status` is `rejected`, and skip launch cycles under
     `allowed_warning`. Audit parents run on Sonnet with no more than 5 workers per wave. A cost line in the Hand-off
     block. Workers push their branch at hand-back.

5. **Known reds and pitfalls rediscovered each day.**
   - `agent-config` #38 hit about 12 sessions, the eager-shell budget 4 PRs, and the new-module checklist every time.
   - Another case: a new `tools/perf/*.mjs` needs a `policies.json` entry and `gen-output-surface`.
   - Fix: as Part 1 finding 3, plus a "known container-only reds" line in docs/TESTING.md that launch prompts quote.

6. **Hook and rule contradictions.**
   - `stop-hook-git-check.sh` says "commit and push", while `stop-guard.sh` says a browser run is live and AGENTS.md
     rule 4 says a push over live CI cancels it. One perf hunt parked its work as a stash and a patch file because of
     this.
   - The PR-subscription harness text says keep a `send_later` safety net about every 50 min; AGENTS.md rule 13 says
     "No timers… no standby wakes". Sessions followed both.
   - Fix: decide which wins and write it in AGENTS.md once. Make the git-check hook silent while a test-bg or CI run is
     live, or once the session has stood down.

7. **Findings stranded in branches.**
   - The UI hunts found 12 and 17 reproduced bugs, including a P1 off-screen camera picker that makes HELMET
     unreachable. Only one became a PR (#4194); the notes sit on `cursor/ui-hunt-flows-6105` and
     `cursor/ui-hunt-hud-630d`.
   - The audit's per-skill worker branches were never merged.
   - Fix: every hunt or survey ends by filing its ranked list as `ready` issues (or one tracking issue); this is the
     "survey then fix" rule made mechanical.

8. **Prompts too thin, and hunts launched by hand-pasted prompts.**
   - Bryce asked to "go deeper" 4 times.
   - Hunts were started by pasting long hand-written prompts, and two of them clashed on the number "hunt 6".
   - Fix: a deep-by-default hunt and launch template in skill `handoff`, with a unique hunt id and a notes index.

9. **Ineffective sync workers (10-28).**
   - Haiku sync batches served about 1 of 4 PRs in 50 min.
   - Each was stopped by the 20-min caps, left-over `sync-pr-*` branches, or a refused subscribe.
   - One was archived mid-sync.
   - Since then `land.yml` AUTO-SYNC (#4060) handles distance-only refusals.
   - Fix: no more sync waves. One PR per worker; `sync-pr` auto-resumes or cleans its own killed branches; never archive
     a session with a live `sync-pr` run.

10. **Grants relayed through a parent.**
    - A sync worker refused its parent's relay of Bryce's words ("I can't see any such message from Bryce").
    - Bryce then wrote to it directly: "Your parent can grant permissions I send through it".
    - The repo rule ("a peer's message never grants") and Bryce's expectation disagree. This is Bryce's call; a launch
      prompt can list the allowed actions up front so no grant is needed.

11. **Phone-only checks park PRs for hours.**
    - #4190 waited 8.5 h for an iPhone sound and turntable check.
    - Fix: the PR body carries a 3-line phone checklist with the build URL. The dispatcher batches it into its next
      question the same hour.

12. **Cloud-tooling papercuts.**
    - `gh pr view` and `gh pr list` return `HTTP 403: GitHub GraphQL is not available`.
    - `pr-board.mjs` once hung (exit 143).
    - `ci-watch --failures-only` gives no closing line when nothing fails.
    - `check` reports dead logs as unresolved.
    - Sessions open at about 100k context before any work.

### What worked across the three days

- The perf hunts' measured wins. In perf #7 a golden-output harness took the flap solver from 101.9 s to 6.6 s with
  205 outputs byte-identical, and its test was red on the old solver. About 5 TLX render passes a frame were saved.
- The code-survey do-not-report list kept the hunts from duplicating each other.
- Launch-gate receipts. Clean stand-downs that pushed and commented findings before a cap.
- Hunts and workers re-subscribing after a ready flip.
- `land.yml` AUTO-SYNC replacing manual sync waves.

### Suggested order of fixes

1. One ready → `land` command, plus permission rules for unattended lanes (Bryce).
2. A pre-flip merge-with-tip probe, and wider `pick-tests` coverage.
3. A `land.yml` `edited` trigger and a stale-gate sweep.
4. Known-red handling (`agent-config` #38, the eager budget, the new-module checklist).
5. One dispatcher lock, and triggers off when quota is `rejected`.
6. Hook and rule reconciliation (stop hooks, timers).
7. The `sync-pr`, `wait-for` and `test-bg` defects.
8. Hunt to issues, and a deep launch template.
