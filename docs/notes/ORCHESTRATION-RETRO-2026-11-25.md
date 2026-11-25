# Orchestration retro — one orchestrator day of transcripts, PRs and CI (2026-11-25)

Kind: measurement · Re-measure-by: 2026-12-09

A PROPOSAL plus measurements. Bryce, 2026-11-25 ~02:25Z (Nov 24, 6:25 PM PT), relayed in the orchestrator's brief:
"launch a session to review all sessions transcripts from the last couple days as well as git history etc. make this
thorough including prompts tools skills invoked where it got stuck where it used too many tokens or waited when
they could've not blocked and done stuff in parallel etc so we can improve our orchestration". This PR changes no skill,
hook, workflow or config; Bryce picks from §Ranked improvements.

**Window:** 2026-11-24 17:39Z → 2026-11-25 02:27Z (Nov 24, 9:39 AM → 6:27 PM PT), the life of orchestrator
`session_017Yzwxzch8ixiVZuLUxQGt6` so far. The account's session list holds nothing between 2026-11-19 04:03Z and
2026-11-24 17:39Z, so "the last couple of days" is this one run. Baselines: `ORCHESTRATION-REVIEW-2026-11-11.md`
(cited as 11-11 #n) and `PROCESS-REVIEW-2026-11-24.md`.

## Metrics

| Metric | Value |
|---|---|
| Sessions | 95: the orchestrator plus 94 children (`create_session` ×95 in 39 bursts; largest 12 at 17:45Z, 10 at 18:35Z) |
| Cost | **$578.16**: orchestrator $145.02 (25%); workers median $3.51, p90 $8.94, 7 over the $10 soft cap, 39 over $5 |
| Tokens | 1,901 M cache-read, 18.6 M cache-write, 4.0 M output. A worker starts at about 177k context; median worker ends at 187k, max 460k; the orchestrator at 712k after one compaction (23:01Z) |
| PRs | 98 touched; **58 merged** (50 first-parent merges on the deploy branch, 4 of them trains; 280 files, +7,798 / −1,162); 6 closed unmerged; 34 open at 02:27Z, 24 of them carrying `land` |
| Ready → merge | median **35 min** (n 51), p90 368, max 692 (#6307). `land` → merge median 33 min, p90 91 |
| Actions | about 1,485 runs, about 5,740 completed run-minutes. `land.yml` 492 completed runs (plus 325 skipped), **2,597 run-min (45%)**, more than `ci.yml` (2,395). Pages 42 runs: 17 green, **21 cancelled**, 4 red |
| Deploy-tip reds | 3 episodes: time-trial spec at 23:59Z, a date-bomb `test:guards` at 00:07Z, `perf-idle-pipeline-churn` from 01:00Z (still red at 02:39Z) |
| Refusals | Orchestrator: 3 `actions_run_trigger` (github-mcp-guard), 1 `issue_write` label list, 1 force-with-lease push, 1 `sleep`. Workers: 0 `permission_denials` in 130 sampled results, but 7 of 8 sampled sessions hit a ready/merge-gate `plan`-row refusal for an open `**now:**`, 2 subagent hand-backs refused by `subagent-contract`, 6 sessions stalled on a `tip-red` sync refusal |
| Bryce | 115 typed prompts (median 60 s after a turn ended), about 35 of them Claude Link choreography; 22 `AskUserQuestion` calls (21 answered, 1 denied); `config-ok` on 11 PRs (2 his own taps on PROTECTED paths), `ratchet-raise` on 7 |

Sources (raw pulls in `scratch/retro-2026-11-25/`, gitignored): `get_session` for all 95 sessions (`usage.tsv`); the
orchestrator's whole transcript, 63 pages (`orch-notes.md`); `result` and `user` events of 8 top-cost workers plus
one cheap control (`workers-notes.md`); `issues/<n>/timeline` of every merged PR (`timeline.tsv`); `actions/runs` since
17:00Z (`runs-all.tsv`); failed jobs of the five tip runs; Board #1780 comments; `git log` of the deploy branch.
Event ids are the first 8 characters of an event uuid.

## Top 15 findings

| # | Finding | Evidence |
|---|---|---|
| 1 | **The orchestrator is a quarter of the spend, and its context is the reason.** At 600–700k context every tool call re-reads the whole window; 594 M of the fleet's 1,901 M cache-read tokens are its own. It carried Claude Link choreography, 40k-char transcript reads and 48k-char `actions_list` dumps inline, and was never rotated. | `get_session` usage $145.02, 712,545 tokens at 02:24:26 (`c29c4b9a`); one compaction 23:01–23:02Z (`ad33cc6b`→`63aa674e`); outputs 48,354 chars at 02:01:50, 40,677 at 02:23:54, 33,334 at 22:16:02 |
| 2 | **The orchestrator could not dispatch Pages or CI for 2 h** (the `APEX_ORCH_ENV` gap). `github-mcp-guard.sh` did not see it as the orchestrator: Bryce dispatched Pages by hand, a worker sat `blocked` on that run, and the cure was a guard edit under the hatch at Bryce's "Yes". An environment variable set mid-session loads only on restart. | refusals 00:20:47 `312e9c21`, 02:19:53 `6a441ef0`, 02:19:54 `5626f2d9`; Bryce's dispatch run 45517460758 (00:21Z); env switch 02:18:41, variable 02:18:59; "Change the guard temporarily" 02:20:36, dispatch OK 02:21:12 `d8f76068`, reverted 02:21:21; worker `xkYrf…` `2000f8f0` (00:21) |
| 3 | **A deploy-tip red went 63 min without an owner, and Bryce found it.** The first signal was the scheduled CI run on `dc8ebfdc` (perf-idle-pipeline-churn) at 01:00Z, then a Pages `deploy` failure at 01:38Z and the same spec on `a9e75a2f` at 01:55Z. The orchestrator was between 45-min cycles and Claude Link rounds. The 23:59Z red, by contrast, was caught in 4 min because it fell inside a cycle. | runs 45521203604 (01:00Z), 45520829110 (01:38Z), 45527000416 (01:55Z); Bryce 02:01:02 `c8f4d0f5` "Reminder deploy was red"; reply 02:01:45 `2aa269f4` "I'd missed that"; fixer launched 02:03:04 `9a4bc856`; Board #1780 bulletin 02:03:11. Contrast 00:03:29 `ca59e73e` |
| 4 | **One date-bomb red was fixed five times.** `docs/notes/BOOST-FIRST-PRESS-MIRRORED-2026-11-03.md` aged past the 21-day window at a date boundary and turned `test:guards` red on the tip. Every worker whose floor went red archived it in its own diff, because no bulletin said one fix was in flight. | Pages 45513979133 (Structural guards, 00:07Z); the archive in #6404, #6405, #6411 (in their file lists), #6406 (merged 00:19Z), #6407 (closed 00:15Z) |
| 5 | **A green train sat unarmed for 95 min.** #6382's gate passed at 22:52Z, but auto-merge was never armed; the orchestrator closed it as stale at 00:27Z, 35 s after Bryce asked "What's up with 6334". #6334 went from ready to merge in 368 min, the window's p90. | #6382 timeline (closed 00:27:53Z); orchestrator 22:52:52 `017debae`, 00:27:50 `812791e2`; Bryce 00:27:15 `66e4ffc4`; Land retry runs for pr=6334 |
| 6 | **`land.yml` is the biggest Actions consumer.** It ran about 8 completed runs per merge (plus 5–6 skipped ones), with up to three retry attempts per head on one PR. | `runs-all.tsv`: Land 283 success + 97 cancelled + 2 failed, Land retry 92 + 20 + 2: 2,597 of about 5,740 run-min; retries for pr=6421, 6422, 6423 at attempts 1–3; research PR from `session_017Yzwxy…pGubx2dd` (#6379) |
| 7 | **Half the Pages runs were cancelled, so many merges never got a tip verdict of their own.** Each merge's push cancels the running Pages train. A completed green run takes 23 min on average, against 6–7 merges an hour, so the tip verdict lags and a red cannot be pinned on one merge (finding 3's 01:00Z red surfaced on the scheduled CI run first). | Pages 21 of 42 cancelled (`runs-all.tsv`), e.g. 45521835714, 45523813580, 45525512827, 45526251978 in 00:55–01:36Z; avg green 22.9 min |
| 8 | **A worker's first turn is about a third of its cost.** Every worker starts at about 177k context (instructions plus about 70 MCP schemas: BrowserStack, Drive, TinyFish, Docs, Academy and others it never calls). The first turn is $40.3 of $115.5 across the 8 sampled workers, and 46–50% in four of them. 11-11 D4 asked for a worker environment without unused connectors; it is still open. | `workers-notes.md`: bridge `38180f68` $6.25, ttgarage `d88387ea` $5.50, desktop `58721dfe` $5.00, corner `c22bdf26` $4.84; control session $0.73 first turn at 14 API turns |
| 9 | **Workers idle 45–135 min on CI and the gate, then pay for each wake at full context.** Wake turns of 6 API turns or fewer cost $21.5 (19%), $0.12–0.80 each at 300–460k context. The Photo Studio worker spent about $3.4 waiting on the red tip, hit its context limit at 01:04Z one step before ready/land, and needed a second session to flip it. | garage `zp6zU…` idle 135 min (74% of its span); hunt `5f3f7c00` 54 min in the gate; photo `64c23c82` hand-off at 460k; follow-up `session_017YzwxyAGNhyCCVUyw6xZCk` (CONTINUE PR 6403) |
| 10 | **The `**now:**` Plan item still trips the gate, a repeat of 11-11 #15.** 7 of 8 sampled workers hit a ready-gate `plan-open` or a merge-gate `plan=FAIL` refusal for an unticked `now:`, each costing one more turn and some a gate cycle. | garage 00:15 and 00:41, hunt 21:50, steppers 23:54, ttgarage 23:17, desktop 02:22:49, corner 01:30Z (`workers-notes.md`); `.github/pull_request_template.md:23` |
| 11 | **Waiting rules were broken on both sides.** The orchestrator armed 11 timed "Orchestrator cycle" `send_later` check-ins (45 min) and ran sleep or until-loops; workers ran the floor in the foreground (`timeout 600000`), `sleep 60` and `sleep 100`, and one background `until … sleep 3` poll that woke the session twice in 24 s. AGENTS.md rules 4 and 13. | orchestrator check-ins 17:47:01 → 02:15:56; until-loops 00:06:35 `6c5212d1`, 00:34:42 `a0d9e98a`; `sleep 60` refused 21:50:55 `18363835`; ttgarage floors 22:29 and 23:00; desktop `sleep 100` 01:24; bridge poll 00:59:56 (`38180f68`, `49575fd1`) |
| 12 | **Device checks cost Bryce a third of his prompts.** About 35 of 115 prompts were Claude Link plumbing ("ready for link", "opening link 2", "retry") in four bursts. Two Claude Link `AskUserQuestion` prompts sat 12 and 20 min with the orchestrator idle behind them. | bursts 19:46–20:20, 21:42–22:15, 23:58–00:06, 00:40–01:08Z; questions 23:34:35 `183d131a`, 23:42:52 `7a91a6b2` (answered about 23:55Z) |
| 13 | **Briefs drop template fields.** 4 of 8 sampled briefs had no `STOP AT`, one was 1.3k chars with no evidence, none arranged its human steps although `ratchet-raise` was needed on 7 PRs, and one had its scope widened twice mid-run. The one full-template brief (ttgarage) idled least among the large sessions. PR 6349 was launched twice, 3 min apart. | `workers-notes.md` (bridge, desktop, corner, steppers); `ratchet-raise` adds 22:11–00:37Z on #6389, #6392, #6393, #6411; orchestrator 17:46:41 and 17:49:50 `d4754651` |
| 14 | **Subagent report-format refusals cost re-emits.** `subagent-contract` refused a finding-verifier hand-back and a pr-reviewer hand-back for row shape; each re-emit turn cost $0.7–1.5. #6409 (merged 01:10Z) tightened the check after both, so re-measure. | hunt 21:14:27 (`PreToolUse:SubagentHandback`), desktop 01:48:52 |
| 15 | **Sessions stop at a prompt or a refusal where nobody looks.** Four children ended `need_input`: a close refused at permission (#6370), a ready-gate "safety check" refusal (#6402), an undecided Dependabot major (#6349), and the context-cap hand-off. At 02:24Z the orchestrator itself was blocked on an `archive_session` permission prompt, because it runs in `default` mode while every worker runs in `auto`. Bryce's 02:39Z cancel of queued CI, so the red-tip fixer got runners, was the same gap: no runner priority for a `deploy:red` PR. | `usage.tsv` status rows `EF1RcfDJ`, `t3hexXB3`, `YHJ2iYcX`, `vdGb6wV1`; orchestrator `get_session` 02:24Z `need_input` "Archive Session"; orchestrator PAUSE message 02:38:23Z |

**What worked (keep):** throughput. 58 merges in 8.8 h against a median ready→merge of 35 min, with one-PR workers. The
27 adoption sessions (`CONTINUE PR …`) cost a median $1.44 and landed the Codex backlog in about 3 h. The 23:59Z red
was caught and triaged by a subagent within 4 min. `AskUserQuestion` (from 22:36Z) got most answers in 13–142 s.

## Ranked improvements

Saving is per day at today's rate. PROTECTED = merge-gate `PROTECTED_CONFIG_PATH` (needs Bryce's own `config-ok`).
Effort: S < 1 h, M a session, L several.

| Rank | Change | Kind · home | PROTECTED | Effort | Expected saving |
|---|---|---|---|---|---|
| 1 | **Rotate the orchestrator at 400k context.** Hand off through skill `handoff` to a fresh orchestrator (task list, Plan, owned PRs, armed ids), and route large reads (other transcripts, `actions_list`, run logs) through a subagent or a file plus `jq` (findings 1, 3) | brief · `.claude/skills/dispatcher/references/orchestrator-brief.md` §While workers run; skill `handoff` | no | S | about $60–80 of $145 (per-call re-read at 300k against 650k) |
| 2 | **Prove the orchestrator role at session start.** `session-start.sh` prints `orchestrator: yes/no (APEX_ROLE, APEX_ORCH_ENV)` from the same predicate `github-mcp-guard.sh` uses, and the orchestrator brief makes that line step 0. Bryce pre-sets `APEX_ORCH_ENV` on the orchestrator environment before he starts it (finding 2) | hook · `.claude/hooks/session-start.sh`, `.claude/hooks/github-mcp-guard.sh`; env settings | **yes** | S | 2 h of blocked dispatch and a hatch edit per occurrence |
| 3 | **Auto-post tip-red.** A small workflow on a failed `pages.yml` or scheduled `ci.yml` run on the deploy branch posts the failing job and test to Board #1780 and adds `deploy:red`, so the orchestrator (and #6428's bulletin) wakes on an event, not a cycle (findings 3, 4) | workflow · `.github/workflows/tip-red.yml` (new) + skill `steward` §Red 3 | no (routine CI path) | M | 60 min of ownerless red per episode; 4 duplicate fix PRs |
| 4 | **Land the in-flight cures first: T1 (#6436) and date-bomb (#6437).** Auto-close an unarmed green train, and run a nightly knowledge-gc so a note never ages into a red (findings 4, 5) | workflow · `tools/ci/merge-train.mjs` + `land.yml` (#6436), `knowledge-gc.yml` + `pages-red-tip.yml` (#6437; the second re-arms Pages after a docs-only fix, the manual 00:21Z dispatch of finding 2) | #6436 yes (`merge-train.mjs`, `land.yml`) | — (open PRs) | 95 min per stuck train; a tip red per aged note |
| 5 | **Cut `land.yml` churn (#6379).** Drop label and status triggers that only re-evaluate an unchanged head, and coalesce retries per head (finding 6) | workflow · `.github/workflows/land.yml` | **yes** | M | about 1,500 run-min per day, the largest single CI item |
| 6 | **A lean worker environment** with no BrowserStack, Drive, TinyFish, Docs or Academy connectors, used as the explicit worker `environment_id` (11-11 D4) (finding 8) | env · cloud environment + `orchestrator-brief.md` §Before launching | no (Bryce's settings) | S | maybe 50k of the 177k start; $1–2 per worker, $100+ per day at 90 workers |
| 7 | **`ship-pr` writes the `now:` tick.** On a `plan-open` refusal, print the exact replacement Plan body (`now:` ticked with the draft-run sha, the rest moved to `land:`), or have the template's `now:` drop out once the draft CI is green (finding 10) | tool · `tools/ci/ship-pr.mjs`; template `.github/pull_request_template.md` | no (ship-pr is routine; ready-gate.mjs is protected, so leave its rule) | S | one turn and up to a gate cycle in 7 of 8 workers |
| 8 | **End the worker at `land`, not at merge.** Since `land` PRs are re-owned on red by dispatch or the orchestrator (steward §After land), drop the re-subscribe in steward §Land 4 so the session stops paying wake turns at 300k+ context while it sits in the queue (finding 9) | skill · `.claude/skills/steward/SKILL.md` §Land 4 | no | S | about $20 per day of wake turns; no context-cap hand-offs at the last step |
| 9 | **One device-check window per wave.** Batch every PR's Claude Link check into one scripted round (the orchestrator lists them, then Bryce opens one link), instead of per-PR "ready for link" exchanges (finding 12) | memory/brief · `.claude/memory/phone-checks-via-claude-link.md` (memory PR), `orchestrator-brief.md` | no (memory needs its own PR) | S | about 30 Bryce prompts per day; 30 min of orchestrator idle |
| 10 | **Generate and lint worker briefs.** A `tools/ci/brief.mjs` fills the template (`STOP AT`, `HUMAN STEPS` prefilled with `ratchet-raise` when the diff will grow a ratcheted file, the tip-red state), refuses a brief missing a field, and de-duplicates a launch whose `ISSUE`/`CONTINUE PR` target is already live (finding 13) | tool · `tools/ci/brief.mjs` (new) + `orchestrator-brief.md` §The brief | no | M | duplicate launches; mid-run scope churn |
| 11 | **A wait linter.** Have `bash-guard.sh` refuse `until …; sleep` / `while …; sleep` poll loops and a foreground `tooling-fast` without `run_in_background`, pointing at Monitor (rules 4, 13); orchestrator cycles stay at most one per 50 min and are skipped while a subscription or a Board event is armed (finding 11) | hook · `.claude/hooks/bash-guard.sh`; brief | **yes** | S | poll wakes and blocked turns; the 01:00Z red would have woken via rank 3 instead |
| 12 | **Runner priority for the tip fix.** `ci.yml` gives a `deploy:red` PR's run a reserved concurrency slot, or the orchestrator's cancel of queued PR runs becomes a logged `steward` §CI act, not Bryce's (finding 15) | workflow · `.github/workflows/ci.yml`; skill `steward` §CI | no | M | Bryce's manual queue cancel; minutes to tip green |
| 13 | **The orchestrator runs in `auto` like its workers**, with `archive_session`, `send_message` and `create_session` allowed, so it never stalls on a prompt Bryce cannot see from the task list (finding 15) | settings · `.claude/settings.json` `permissions.allow` / session mode | **yes** | S | blocked orchestrator turns (02:24Z) |
| 14 | **`child-health.mjs` reports `need_input` children** (status_category, status_detail) as their own row, and the orchestrator routes each to the Needs-Bryce list or a CONTINUE brief (finding 15) | tool · `tools/ci/child-health.mjs` | no | S | ownerless refusals (#6370, #6402) |
| 15 | **Re-measure the subagent hand-back contract after #6409** and paste the exact FINDING row example into each reporter card's output section (finding 14) | agents · `.claude/agents/pr-reviewer.md`, `finding-verifier.md` | no (agent cards are routine config) | S | about $1–3 per day of re-emits |

Not proposed: more parallelism. The window was limited by Pages and land churn (ranks 3, 5), not by worker count; the
p90 ready→merge (368 min) is one stuck train, not queueing.

## Method notes and limits

- Costs are `get_session` `usage.cost_usd` at 02:30Z; live sessions keep spending, so the totals are a floor.
- Worker patterns come from 8 top-cost sessions plus one control (130 result events), not from all 94; the brief
  fields were read from each session's first user event.
- Run-minutes are run wall time (`run_started_at` → `updated_at`), not billed job-minutes; the 1,000-row search cap
  was avoided by splitting the window at 20:45Z.
- The orchestrator's typed prompts were separated from synthetic injections (subagent hand-backs, skill loads, the
  compaction summary) by `inbound_origin`; 4 were interrupts.
