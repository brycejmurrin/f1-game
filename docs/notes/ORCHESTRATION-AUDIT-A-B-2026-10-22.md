# Orchestration audit: Fleets A and B (2026-10-22)

A read-only audit of how the Claude fleets (A and B) orchestrate, ending in a
ranked improvement list. Bryce asked for it at 2:17 AM PT on 2026-10-22, and
DAD (Fleet D) relayed the ask to OrchA 23. Fleet D's parallel audit (DAD) and
Merlin's ideas are folded in under §Fleet D merge-in and marked in the ranking.
Times are UTC (Z), with Pacific given where a time matters.

Evidence comes from five sources:

- **Transcripts** of 8 orchestrators and 17 workers, read through
  `list_events` and `tools/ci/session-transcript.mjs`.
- **The fleet bus**, `fleet-bus.mjs read --last 400` (01:55Z 10-21 to 09:18Z 10-22).
- **The `pages.yml` run history** (`gh run list`), plus one run's jobs.
- **The queue branches** (`cursor/orcha2{2,3}-queue-*`, `cursor/orchb26-queue-o26q`).
- **The repo's own rules**: AGENTS.md, `.claude/skills/agent-fleet/**`,
  `tools/ci/merge-gate.mjs`, `pages.yml` and `ci.yml`.

Limits:

- Fleet B ran on Bryce's second account. Its sessions return `not found`
  from this account, so Fleet B is seen only through the bus (102 of 401
  lines) and its queue branch.
- One 100-event page covers 1 to 15 minutes of a live session. Whole-session
  counts come from the bus, the queue files and GitHub, not from full transcripts.
- Thinking text is not in transcripts, so the audit sees what a session did,
  not why.

## Executive summary

The fleets are good at the parts the repo has turned into tools:

- **Gated merges.** All 10 orchestrator merges tonight pinned
  `expectedHeadSha`, checked for two parents and posted DONE.
- **Launch briefs.** The W6 brief got a worker to a draft PR in 6.5 min with
  no questions.
- **Hand-backs.** 15 of 17 workers sent READY/GREEN/DONE with the SHA, run id
  and job counts.
- **Authority.** Every relayed grant was correctly refused.

They lose most of their time and money in four places, all coordination
rather than coding:

1. **Pages starvation that no rule could stop.** From 05:45Z to 09:17Z there
   were 21 `pages.yml` runs: 2 succeeded and 19 were cancelled. Nothing
   shipped between 08:18Z (1:18 AM PT) and at least 09:17Z, and 7 game merges
   were left unshipped.
   - Every rule (GAME-SLOT, merge-gate pacing, tonight's rule 7 freeze) binds
     only sessions that choose to call `merge-gate.mjs`.
   - Three merges landed inside the freeze within 12 min (#3519 09:12Z, #3550
     09:22Z, #3548 09:24Z). #3517 merged 3 min after the gate refused it.
   - One RUNNING train (d5725d7c) was also cancelled mid-gate, which rule 7
     assumes cannot happen.
   - The mechanism has to live in GitHub, not in agent prose.
2. **Merges nobody can attribute.** Every merge shows `merged_by=brycejmurrin`,
   agents' merges included, so the bus has 13 lines that guess "merged
   outside the bus, likely Bryce". Pacing, the slot and the ABSENT rule all
   depend on knowing who merged.
3. **Expensive waiting.**
   - Orchestrators ran at 584–619k context against their 200k soft cap,
     costing about $24/h.
   - About 31 notification wakes between ticks cost about $0.27 each.
   - The "3-min" tick really ran every 4.4–7.9 min.
   - Workers spent about 39% of read cost on wakes that only acknowledged an
     event.
   - F2, H1 and W10 went over the $15 worker cap ($19.55, $16.28, $16.15).
   - The 10-17 retro had already ranked giant-context wakes first ($353), so
     this is a known problem coming back.
4. **Duplicate and orphaned work.**
   - Merlin opened 5 PRs on issues Fleet A had held since 08:30 (#3534,
     #3544, #3546, #3547, #3549). All were closed.
   - A·H2 and A·W4 overlapped (#3533/#3535).
   - OrchB 26's wave 27 left no PR, and OrchA 22 relaunched the same issues
     (#3519, #3523).
   - Fleet A had no orchestrator on the bus for about 35 h (10-20 18:58Z to
     10-22 05:55Z).
   - L22 waited 7 h 15 m from READY to merge and re-sent READY to three
     successive orchestrators.

The top three changes:

1. Make the train bind everyone. Now: `merge-gate` refuses while any
   Pages run is queued or running (DAD agrees). Later, if Bryce decides: a
   GitHub merge queue so his merges are paced too. That is on hold, because
   a user-owned repo probably lacks the setting and the queue drops the
   pinned-head receipt.
2. Make every merge attributable with a post-push "ungated merge" detector.
3. Type the bus and cut orchestrator wake cost (real context caps, no
   per-PR events into orchestrators). Each is a change to one or two named files.

## Combined A+D decision list

| status | items |
|---|---|
| **Agreed by A and D** (DAD, 09:37Z) | 1a train row in merge-gate · 2 UNGATED detector (trailer, then DONE, 10 min, flag only) · 3 rule 7 corrections · 7 claim before launch · 10 one-command merge |
| **Proposed by A, D not yet asked** | 4 typed bus verbs (D3 asks for the same) · 5 acknowledgement-only wake cuts (DAD scoped it) · 8 READY to the fleet letter · 9 one writer per branch (D5) · 11 grant classes · 12 succession doc fix · 14 timeouts · 16 workers never merge (D4) · 17 auditor-page hygiene (D) |
| **Bryce decides** | 1b merge queue (on hold; probably needs an org-owned repo) · 6 cap values · 13 hourly bus-watch end condition · 15 Cursor hooks · open questions 2 and 5 |

## Ranked improvements

Ranked by impact × effort. **Both** = applies to Claude and Cursor fleets;
**A/B** or **D** = one side. Sources: A = this audit, D = DAD's audit,
M = Merlin's bus line 82c824f (09:19Z).

| # | change | impact | effort | applies | sources |
|---|---|---|---|---|---|
| 1 | Train mechanism that binds every merger (1a now; 1b merge queue: Bryce's decision, on hold) | high | M | Both + Bryce | A, D4, M |
| 2 | Attribute every merge; flag ungated ones | high | S | Both | A |
| 3 | Correct rule 7's two wrong assumptions | high | S | Both | A |
| 4 | Typed bus verbs, reject unknown | med | S | Both | A, D3, M3 |
| 5 | Cut orchestrator and worker wake cost | high | M | Both | A, D6 |
| 6 | Caps from measurement, enforced each tick (cap values: Bryce's decision) | med | S | Both | A, D9/10 |
| 7 | Claim before launch, for every agent | high | S | Both + Merlin | A, D1, M2 |
| 8 | READY addressed to the fleet letter; successor drains the backlog | med | S | A/B | A |
| 9 | One writer per branch; unknown-pusher alarm | med | S | Both | A, D5, M7 |
| 10 | One-command merge (gate, merge, parents, DONE) | low-med | S | Both | A, D4 |
| 11 | Anticipated follow-ups in USER GRANTS | med | S | A/B | A, M4 |
| 12 | Fix the orchestrator.md succession contradiction | low | XS | A/B | A |
| 13 | End condition on the hourly bus-watch routine | low | XS | A | A |
| 14 | Long-running local checks: explicit timeouts, one gate at a time | low | XS | Both | A |
| 15 | Cursor-side hooks for the bans bash-guard enforces (Bryce's decision) | med | M | D | D2 |
| 16 | Workers never merge, arm or send DONE, as one AGENTS.md line | med | XS | Both | D4 |
| 17 | Owner and brief hygiene: one owner per PR, idle-DIRTY nudge, no sleep, pre-flight checks, end-state message | med | S | Both | D |

### 1. A train mechanism that binds every merger (Both, and Bryce's merges)

**Evidence.**

- **Pages runs 05:45Z–09:17Z:** 2 success, 19 cancelled. Only 9f9db7fc
  (08:18Z) and bb82cf74 (06:02Z) shipped. Each cancellation was a pending
  train replaced by a newer push to the deploy branch, which is
  `pages.yml`'s `pages-train-<ref>` group (`queue: single`).
- **Runner saturation.** 64–87 jobs ran against 40 Linux slots, so a pending
  train never reached a runner before the next merge replaced it.
- **Merges inside the freeze.** Rule 7 was agreed at 09:11Z (2:11 AM PT).
  Within 12 min, #3519 (09:12Z), #3550 (09:22Z) and #3548 (09:24Z) merged
  under Bryce's account. Each replaced the pending train: f9b8f5af replaced
  1003be69.
- **#3517.** `merge-gate` refused it at 09:03Z (2 open Plan items, pacing),
  and it was merged directly 3 min later.
- **`running.md` already said this.** "After a merge, if a Pages run is
  pending and none running, hold further merges until one starts" has been
  in `running.md` since 10-17. A rule in a skill reaches only the sessions
  that load it.

**Change.**

- **(a) Now, agents.** `tools/ci/merge-gate.mjs` gets a `train` row. It
  refuses while ANY `pages.yml` run on the deploy branch is `queued` or
  `in_progress`, including the `:41` cron run, and prints the blocking run
  id in the receipt. This is rule 7.6 of #3548, still a follow-up. It
  applies to tools, tests and game PRs, because all three start a train
  (see #3). Prose-only PRs skip it. GAME-SLOT stays for game paths.
  DAD agrees, with these terms.
- **(b) HOLD: Bryce's decision.** A merge queue on
  `claude/f1-game-project-26h3ng` would be the stronger fix, but two things
  argue against it now.
  - **It may not exist here.** GitHub announced merge queue for public
    repositories owned by organizations, and for private ones on Enterprise
    Cloud. `brycejmurrin/f1-game` is user-owned, so the setting is probably
    unavailable unless the repo moves to a (free) organization. That needs
    checking in the branch-protection settings or the rulesets API before
    any plan relies on it
    ([GA changelog](https://github.blog/changelog/2023-07-12-pull-request-merge-queue-is-now-generally-available/)).
  - **It drops our safeguards.** Even where available, it drops the pinned
    `expectedHeadSha`, the gate receipt and the gate-written trailer that
    #2 relies on. DAD's terms are: only after the freeze, group size 2, and
    a written rollback path.

  If Bryce wants it, the trial settings are:
  - merge method "merge" (supported, which keeps the two-parent rule);
  - "Maximum pull requests to merge" 4 and build concurrency 1–2;
  - add `merge_group:` to `ci.yml`'s triggers.

  A queue paces Bryce's UI merges too, because he presses "Merge when ready"
  and the queue decides when. Merging a group of N PRs as one base update
  means one train instead of N replaced ones. Verify that a group lands as
  a single push before relying on it. The `CI` required check would need to
  report on `merge_group`, and the queue replaces GAME-SLOT and most of
  merge-gate's pacing row. This is the change DAD also ranked (D4).
- **(c) Until then, and if the queue is rejected.** A visible banner: a TRAIN line on the
  bus (#4) plus the draft-PR status `session-status.mjs` prints. This is
  weaker, because it relies on whoever merges reading it.

### 2. Attribute every merge; flag ungated ones (Both)

**Evidence.**

- GitHub records `merged_by=brycejmurrin` with no app for the orchestrators'
  own merges too (#3502, #3521, #3525).
- The bus carries 13 "merged outside the bus / likely Bryce" guesses
  (#3407, #3238, #3392, #3517, #3519, #3550, …). Fleet D, Merlin or a Cursor
  agent merging with Bryce's token would look identical.
- The adaptive plan's rule 4 ("a merge Bryce makes himself counts as taking
  the slot") cannot be applied without this.

**Change.** `merge-gate.mjs` already writes `artifacts/merge-gate/<n>.json`.
Add a small `push`-triggered job, or a `fleet-bus.mjs` sweep each
orchestrator runs per tick. For each merge commit on the deploy branch:

1. Check the gate-written trailer first, then a `DONE <PR> <sha>` line.
2. If neither appears within 10 min, post one line per SHA:
   `UNGATED #<PR> <sha> <author-of-merge-event>`.

It flags only; it never reverts or holds anything (DAD's amendment). Pacing and the ABSENT rule
then read facts instead of guesses. Tool: `tools/ci/fleet-bus.mjs`, or a new merge-audit script under `tools/ci/`.

### 3. Correct rule 7's two wrong assumptions (Both)

**Evidence.**

- **Rule 7.2 is wrong about docs.** It says docs merges "also replace the
  pending train". `pages.yml`'s push trigger has `paths-ignore` for
  `docs/**`, `**/*.md`, `.claude/**`, `.cursor/**` and `.codex/**`. A merge
  touching only those starts no run, so it cannot replace one. A `tools/` or
  `tests/` merge DOES start a train, and merge-gate's pacing row
  (`GAME_PATHS`) does not pace those.
- **Rule 7 assumes a running train is safe.** Run 39746153624 (d5725d7c)
  started at 08:13:29Z. Its gate jobs ran from 08:20Z, and Structural
  guards, smoke and several selected specs had passed. It was cancelled
  08:41–08:42Z with 10 selected-spec legs still waiting for runners.
  Nothing in `pages.yml` or `ci.yml` should cancel a running deploy gate:
  the workflow group, `pages-gate-*` and `pages` all have
  `cancel-in-progress: false`, and the reusable ci gets a unique
  `concurrency_key`. The bus records Bryce cancelling a running run by hand
  at 07:20Z (14c22efe) to let the lens deploy. A manual cancel is the
  likely cause here too. The hooks refuse agents' cancels.

**Change.** Amend #3548 rule 7.2 to "no tools/tests/game merges while a
train is pending; docs-only and `.claude/` merges may flow". Note that a
manual cancel of a running train costs its whole gate (about 20–30 min of
runner time). Then decide with Bryce whether he wants a "deploy now" path
that does not cancel (open question 2).

### 4. Typed bus verbs; reject unknown (Both)

**Evidence.**

- `fleet-bus.mjs` `TYPES` has 8 verbs.
- HANDOFF is 173 of 401 lines (43%), used for heartbeats ("HB D LIVE"),
  train state ("PAGES JAMMED", "TRAIN … queued"), discussions, webhook
  mirrors, adoption notices, and workers re-stating "MERGE-HOLD stays; will
  NOT merge". D·DP3 alone posted 9 such lines.
- #3548 asks for `TRAIN` and `HB` lines that the tool has no verb for.
- DAD: 8 of 29 D runs had failed sends. Merlin asks for a LIVE type.
- One INCIDENT was posted by mistake for an FYI (85bcb7e, 19:03Z).

**Change.**

- Add the verbs TRAIN, HB, ADOPT, CLAIM and INFO (LIVE already exists as an
  `ORCH <x> LIVE` text convention; make it a verb).
- Give `fleet-bus.mjs read` a `--type` filter.
- Have workers post progress on their own PR, not the bus. The bus carries
  READY, BLOCKED and DONE only.

File: `tools/ci/fleet-bus.mjs` plus its test.

### 5. Cut orchestrator and worker wake cost (Both)

**Evidence.**

| orchestrator | context | cost |
|---|---|---|
| OrchA 23 | 584k | $29.68 in about 80 min (about $24/h) |
| OrchA 22 | 619k | $47.43 in 2 h 09 m |
| Orch 21 | — | $57 over 17.6 h |

- OrchA 23 had 31 notification wakes between ticks at about $0.27 each.
  Its chained 3-min tick really ran every 4.4–7.9 min (mean about 5.8),
  because `send_later` counts from the end of a long turn.
- **Workers.** Turns of 3 steps or fewer that only acknowledged an event
  were $4.85 of $12.51 read. Each one cost $0.17–0.33 on Opus at
  250–400k context, against $0.03–0.08 on Sonnet. The sources:
  - check-suite events with nothing to act on (W2, H1, F4);
  - check-ins firing after a merge (F2, H1);
  - Monitor end notices repeating a verdict already sent (F4).
- DAD counted 95 `sleep`s in D runs (D6).
- The external numbers agree: multi-agent systems use about 15× the tokens
  of chat, and tokens explain about 80% of the performance variance
  (Anthropic, below). Waiting tokens are pure cost.

**Change.** Cut acknowledgement-only wakes, the ones that end with nothing
done. The 30-min idle wake (safety-net check-in) stays, because it catches
lost events (DAD's amendment).

- **(a)** Orchestrators subscribe to no PRs. PR events go to owners; the
  orchestrator reads `pr-board` once per tick. The watcher memory already
  says "no per-PR subscriptions".
- **(b)** The tick message runs one script that prints only the deltas
  since the last tick: bus lines `--to <letter>`, PR state changes and train
  state. It ends the turn with no tool calls when the delta is empty.
- **(c)** Owners `delete_trigger` their check-ins and unsubscribe at merge
  (role-pr-owner.md).
- **(c2)** CI wakes only for the head SHA. A check-suite event for an older
  head is acknowledged without a turn of work. Briefs say "no `sleep`; act
  on the wake event" (DAD: 95 sleeps in D runs).
- **(d)** Enforce the orchestrator hand-off at the 200k soft cap. Both
  orchestrators read tonight ran three times past it.

Files: `references/running.md` §Bus routine, `role-pr-owner.md`, a new
tick-delta script under `tools/ci/`.

### 6. Caps from measurement, enforced each tick (Both; the cap values are Bryce's decision)

**Evidence.**

- Worker `STOP AT 150k`: W6 passed 157k after 9 min.
- A fresh session starts at about 50–60k, because the always-loaded
  surface is large: AGENTS.md is 28 KB, and `agent-fleet` SKILL.md plus its
  references are 102 KB.
- W2 reached 260k, F2 402k, and W10 420k (forced a second session; #3082
  cost $23.81 across two).
- Fleet rule files changed in 34 commits over the 5 days since 10-17, so
  every brief and memory risks being stale.

**Change.**

- Set the worker soft cap to about 250k and the orchestrator cap to
  300k with a hard hand-off, and record the figures in
  `launch-policy.md` §Size stop.
- Run `fleet-flags.mjs` each tick (it already flags cost over cap), and
  interrupt plus hand off a session over cap.
- Shrink the shared brief to a stable header plus a per-wave delta (D10,
  M8).

### 7. Claim before launch, for every agent (Both and Merlin)

**Evidence.**

- Merlin's 5 duplicate drafts were on issues Fleet A lanes had held since
  08:30.
- #3533/#3535 overlapped because a retracted relay raced A·H2.
- Issue #2209 (kinks) used about 7 sessions over about 10 h.
- Codex sessions 8d42 and 7c2e collided (#3407/#3423, bus bc236eb).
- DAD: 3 D launches hit held paths within minutes (D1). Fleet D posted 5
  stand-down lines in 3 minutes (05:02–05:05Z).

**Change.**

- A `launch-check.mjs <globs|issue#>` that runs `who-is-on-it`,
  `fleet-owner` and an open-PR search, and exits non-zero on overlap.
- Every launcher calls it before `create_session` or an equivalent:
  orchestrators, Merlin, DAD.
- A CLAIM bus verb (#4) with a TTL makes the claim visible across hosts.

Sizing waves by free path families (D1) follows from the same check.

### 8. READY to the fleet letter; the successor drains the backlog (A/B)

**Evidence.**

- 7 of 17 workers felt orchestrator churn:
  - L22 re-sent READY to ORCH19, ORCH20 and ORCH21 and waited 7 h 15 m;
  - L28's `send_message` to a cross-account "OrchB 23" failed;
  - W10's hand-off went to archived ORCH14;
  - A·F3 kept reporting to OrchA 22 after the hand-off.
- The first OrchA 23 launch died in 33 s, and Bryce had to type a retry.
- Fleet A had no orchestrator for about 35 h.

**Change.**

- Workers send READY on the bus `--to A`, not to a session id, and
  `send_message` only to the id `fleet-bus.mjs who A` returns at send time.
- The successor's first tick reads every READY since the predecessor's last
  DONE, so nothing waits on a dead id.
- The #3548 HB/ABSENT rule covers the 35-h gap: the live fleet merges the
  absent fleet's gated green PRs.

Files: `references/worker.md`, `references/orchestrator.md` §Hand-off.

### 9. One writer per branch; unknown-pusher alarm (Both)

**Evidence.**

- An unknown Cursor agent (bc-4f8efad5) pushed into #3517.
- A Cursor agent co-edited #3540 (W2 accepted it).
- DAD's D5 asks for one writer per branch with subagents read-only.
- Merlin's 7th idea is fleet-prefixed branches plus a WHOIS line.

**Change.**

- The `fleet` block's `worker:` is the branch's sole writer. In-session
  subagents are read-only; a subagent that writes does it in its own
  worktree branch, which the writer merges.
- Before every push, the writer runs `git log HEAD..origin/<branch>`. A
  commit it did not make stops the push and goes to the orchestrator (DAD's
  amendment).
- `pr-board.mjs` flags a head commit whose author or committer is not that
  writer, and an `INCIDENT` follows (adaptive plan rule 6).
- Never `@cursor`-mention to stop it.

### 10. One-command merge (Both)

**Evidence.**

- Orchestrators did gate → merge → two-parent check → DONE correctly 10 of
  10 times, but it takes four tool steps each wake.
- merge-gate ran 11 times in OrchA 23's window for 3 merges.

**Change.** `merge-gate.mjs --pr <n> --merge` performs the merge with
`expectedHeadSha`, verifies the parents and posts DONE. That is one call,
one receipt and fewer tokens. The hook still requires the receipt.

### 11. Anticipated follow-ups in USER GRANTS (A/B)

**Evidence.**

- Refusals of relayed asks were correct in 4 sessions (F4, KOWN, A·F1,
  A·F4). Each fix cost a new session carrying Bryce's quote.
- `orchestrator.md` hard line 8 already says to name the next item.
- Merlin asks for "one pre-authorized write route per fleet".

**Change.**

- Quote one grant covering a CLASS ("follow-up PRs on issues #A–#B in these
  globs") rather than a PR number.
- Have the orchestrator name 2–3 next items in the first brief.

Keep the authority rule itself (see §Keep).

### 12. Fix the succession contradiction in `orchestrator.md` (A/B)

**Evidence.** Hand-off step 2 says "Never a scheduled task, a routine or
`create_new_session_on_fire` for a successor". The section above it,
"succession past the lineage cap", prescribes exactly a one-shot
`create_new_session_on_fire` trigger.

**Change.** Keep one path: seed `SPAWN ORCH` at depth ≥ 7, plus the trigger
path only if the seed is absent. Delete the other.

### 13. End condition on the hourly bus-watch routine (A)

**Evidence.**

- `trig_01JY5wYatqkrVwPXPsMD1ryZ` ("Fleet bus watch (A+D liveness)") was
  created at 08:57Z at Bryce's request.
- It runs at `57 * * * *` and starts a fresh Sonnet session every hour with
  push notifications on.
- It has no end date, and no queue file lists it.

**Change.**

- Record it in the orchestrator queue file with an owner and a stop rule,
  for example disable it when no fleet work is live.
- Have the watcher stop itself after 3 quiet runs.

Bryce decides.

### 14. Long local checks: explicit timeouts, one gate at a time (Both)

**Evidence.**

- W3's `test:tooling-fast` was killed at the 30-min `run_in_background`
  default at about 455 of 830 tests.
- W2 ran two `deploy --gate-only` at once.
- W10 pushed over its own live full tier and cancelled shards.

**Change.**

- AGENTS.md rule 4 names `timeout: 3600000` for `tooling-fast` and the
  gate.
- `deploy.mjs --gate-only` refuses a second concurrent run, as
  `test-bg.mjs` already does.

### 15. Cursor-side hooks (D; Bryce's decision)

DAD's D2: `bash-guard.sh` does not run in Cursor cloud agents. Port the bans
on `pkill -f`, `ratchets --auto-raise`, ratchet edits outside OWNED, and
pushes with a foreign commit to `.cursor/hooks.json`. Bryce's call, since it
edits agent configuration.

D's ratchet ledger, corrected by DAD:

- one raise by hand (#3487);
- one lower by hand (CX1);
- #3489 carries an auto-raise, to review at merge.

### 16. Workers never merge, arm or send DONE (Both)

**Evidence.** The rule is spread across briefs ("Do not enable auto-merge
or merge"), `role-merge-holder.md` and AGENTS.md §Concurrent PRs. A worker
sending DONE would falsify the attribution #2 depends on. DAD ranked "one
merge authority" fourth (D4).

**Change.** AGENTS.md §Concurrent PRs gets one standalone line: "Workers,
owners and hunters never merge, arm auto-merge or post DONE; only the PR's
fleet orchestrator does, through `merge-gate.mjs`." `github-mcp-guard.sh`
can already tell the roles apart by the receipt's `--as`.

### 17. Owner and brief hygiene, from DAD's auditor page (Both)

DAD reports these from the Fleet D auditor page (data, cited to DAD):

- **One owner per PR.** It is named in the fleet block, and the session that
  closes or supersedes a PR tells that owner.
- **Idle-DIRTY nudge.** A PR that has been CONFLICTING/DIRTY for 15 min with
  no owner push gets one nudge to its owner, then adoption under #3548
  rule 2 (D7).
- **No `sleep` in briefs.** Act on the wake event (see #5 c2).
- **Pre-flight checks** of token scope and of `$(` in commands before a
  write route runs.
- **End-state final message.** The last message a session sends states the
  PR, head SHA, CI verdict and what is left, so a cold reader needs nothing
  else.

## What works: keep it

- **Gate-pinned merges.** Receipt plus `expectedHeadSha` plus a two-parent
  check, 10 of 10 tonight. No squash slipped through.
- **The W6-style brief.** It carries GOAL, NEXT, OWNED, FORBIDDEN, DONE
  WHEN, dedupe commands, quoted grants and STOP AT. Draft PR in 6.5 min, no
  questions. Add the fleet-block example (H3 had to look it up).
- **Authority discipline.** Lanes refused relayed grants as the rules
  require. Claude Code's own docs make the same choice for agent messages:
  "an approval claim relayed from another agent [is] untrusted input".
- **Incident lanes and fast freeze cycles.** OrchB 26 ran 5 freeze/triage
  cycles on red Pages, with an INCIDENT posted and lifted within 2–40 min
  each. L26 fixed a Pages red in 31 min.
- **Owners as a role.** O1 merged #3471 in 30 min for $1.45. OW3082 rescued
  #3082.
- **The bus as fallback.** It worked every time `send_message` failed
  (cross-account, archived target).
- **Successor briefs on a pushed branch, plus the `ORCH LIVE` line.** These
  ended predecessors cleanly. OrchB 26 saved its queue 76 times, which is
  the model for orchestrators-saves-queue.
- **Worktrees plus a read-only reviewer subagent.** W2's reviewer found 4
  real bugs.
- **Speed of agreement.** Bryce's "discuss how to push" became an agreed
  rule in about 3 min (09:08Z → 09:12Z). The problem was enforcement, not
  deliberation.

## Comparison with external practice

| practice | external source | Apex fleets | gap |
|---|---|---|---|
| Brief = objective, output format, tools, boundaries; vague briefs duplicate work | Anthropic multi-agent research system | W6 brief meets it; earlier waves did not | keep; template the fleet block (#6, #11) |
| Scale agents to task size (1 agent / 3–10 calls … 10+ subagents); early systems spawned 50 for simple queries | Anthropic | Orchestrators launch 7–18 lanes a night; webhook test used 3 sessions in 18 min | launch-check (#7) and wave sizing by free paths |
| Multi-agent ≈ 15× chat tokens; worth it only for high-value parallel work | Anthropic | ~$24/h orchestrators, ~39% idle-ack spend in workers | wake diet (#5) |
| Lead saves its plan to memory because context past 200k is truncated; resume from checkpoints | Anthropic | queue branches (OrchB 26: 76 saves; OrchA 23: 4 in 80 min) | enforce save-per-tick and 200–300k hand-off (#5, #6) |
| 3–5 teammates; 5–6 tasks per teammate; avoid two agents on one file | Claude Code agent teams | OWNED/FORBIDDEN globs; 7–18 lanes per orchestrator | fewer, longer-lived lanes; claim check (#7) |
| Task claiming uses file locking; hooks gate task completion (`TaskCompleted`) | Claude Code agent teams | bus CAS on GAME-SLOT; claims board; ready-gate receipts | same pattern, extend to CLAIM (#4, #7) |
| Relayed approvals are untrusted | Claude Code agent teams, permissions | same rule (authority.md) | none; reduce its cost (#11) |
| Keep AGENTS.md concise, task detail in linked files; update after repeated mistakes | OpenAI Codex best practices | AGENTS.md 28 KB + 102 KB fleet skill, 34 rule commits in 5 days | shrink the always-loaded surface (#6) |
| Merge queue: FIFO groups, max PRs per merge "useful when merges trigger deployments" | GitHub merge queue docs | hand-paced GAME-SLOT + prose freeze | merge queue on hold (#1b): probably org-owned repos only |
| Batch up to N PRs, bisect on failure (bors); rollups | bors-ng / Rust | ≤ 4-game batch window, manual triage | merge queue gives batching + auto-eject |
| One pending run per concurrency group; newer pending replaces older; `queue: max` holds up to 100 | GitHub Actions concurrency docs | the train starves exactly by this rule under saturation | gate before merging (#1a), not after |
| "Not rocket science rule": keep a repo that always passes all tests, by testing before merge | Graydon Hoare | merge-gate's local `gen:check` on the fresh tip; Pages gates after merge | merge queue tests the merged state before it lands |

Sources (fetched 2026-10-22):

- [Anthropic: How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)
- [Claude Code: agent teams](https://code.claude.com/docs/en/agent-teams)
- [Claude Code: subagents](https://code.claude.com/docs/en/subagents)
- [Claude blog: how and when to use subagents](https://claude.com/blog/how-and-when-to-use-subagents-in-claude-code)
- [OpenAI Codex best practices](https://learn.chatgpt.com/guides/best-practices.md) (redirected from developers.openai.com; summarised via search)
- [GitHub: managing a merge queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)
- [GitHub Actions: concurrency](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/control-the-concurrency-of-workflows-and-jobs)
- [Rust internals: bors rollups](https://internals.rust-lang.org/t/batched-merge-rollup-feature-has-landed-on-bors/1019)
- [bors.tech](https://bors.tech/) (bors-ng retiring in favour of GitHub merge queues)
- [Graydon Hoare: the not rocket science rule](https://graydon2.dreamwidth.org/1597.html)
- Cursor background-agent guidance is secondary only: [morphllm guide](https://www.morphllm.com/cursor-background-agents). Verify against Cursor's own docs before relying on it.

## Open questions for Bryce

1. **Merge queue trial (#1b): your decision, on hold.** It probably needs
   the repo moved to an organization first, because a user-owned repo may
   not offer the setting. DAD's terms are: only after the freeze, groups of
   2, with a rollback path. Would you press "merge when ready" instead
   of "merge"? It is the one change that paces your merges as well as the
   agents'. Without it, rule 7 binds agents only.
2. **"Deploy now".** When you want one PR live fast (the lens at 07:20Z),
   cancelling the running train costs its gate. Is a workflow-dispatched
   "priority train" acceptable instead, given that it still queues for
   runners?
3. **Caps.** Raise worker STOP AT to about 250k and orchestrators to 300k
   with a hard hand-off (#6)? Or keep 150k/200k and accept more hand-offs?
4. **Hourly bus watch (#13).** Keep it running, give it an end, or stop it
   when no fleet is live?
5. **Merlin and D on the claims board (#7).** Should Merlin and DAD be
   required to run the same launch check before opening PRs?
6. **Cursor hooks (#15).** Port bash-guard's bans to `.cursor/hooks.json`?

## Fleet D merge-in

Source: DAD (Fleet D coordinator), relayed by OrchA 23 at 09:20Z.
DAD's amendments were relayed at 09:37Z. D agrees with 1a, 2, 3, 7 and 10,
with the terms now written into those items. Canvas:
cursor.com/canvas/store-e11ec754-…/cb35133f-… (not reachable from here).
D's ranking, mapped to the combined list above:

| D# | DAD's finding | combined # | applies |
|---|---|---|---|
| 1 | fleet-owner + who-is-on-it on OWNED before launch; size waves by free path families (3 launches hit held paths) | 7 | Both |
| 2 | Cursor hooks for pkill -f, ratchet auto-raise, out-of-OWNED ratchet edits, foreign-commit pushes | 15 | D |
| 3 | strict bus verbs that reject unknown ones (8 of 29 D runs had failed sends) | 4 | Both |
| 4 | one merge authority in AGENTS.md (workers never merge, arm or send DONE); trial GitHub merge queue | 16, 10; 1b (hold) | Both |
| 5 | one writer per branch; subagents read-only; HEAD..origin check | 9 | Both |
| 6 | act on wake events instead of sleeping (95 sleeps) | 5 (c2), 17 | Both (D: sleeps; A/B: idle-ack wakes) |
| 7 | nudge idle DIRTY PRs at 15 min | 17 | Both |
| 8 | size effort to the task | 5, 6 | Both |
| 9 | pick models from measured outcomes | 6 (Opus median $10.95 vs Sonnet $2.59 across 17 A workers) | Both |
| 10 | short shared brief, per-wave delta | 6 | Both |
| — | ratchet ledger (corrected): 1 hand raise (#3487), 1 hand lower (CX1); #3489 auto-raise reviewed at merge | 15 | D |
| — | auditor page: one owner per PR, closer tells owner, no sleep in briefs, token-scope and `$(` checks, head-SHA-only CI wakes, end-state final message | 17, 5 | Both |

Overlaps with A's own evidence:

- relayed-grant refusals (#11);
- Merlin's duplicates (#7);
- Pages starvation (#1, #3);
- the unknown Cursor pusher on #3517 (#9).

Merlin's ideas (bus 82c824f) map to:

| Merlin's idea | combined # |
|---|---|
| 1. Checkpoint and publish early; done = delivered and read back | #8 and the PUSH line already in briefs |
| 2. CLAIM line with a lease TTL | #7 |
| 3. Typed bus with LIVE | #4 |
| 4. One pre-authorized write route | #11 |
| 5. Generated-file freshness as a CI merge gate | already merge-gate's `gen` row; extend it to the queue in #1b |
| 6. Heavy suites take a bus lease | #14 |
| 7. Fleet-prefixed branches plus WHOIS | #9 |
| 8. One FLEET-RULES doc every brief links | #6 |
