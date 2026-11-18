# Measured outcomes — what the fleet produced and cost (read 2026-10-27 01:30Z)

Sources: local `git log` of `origin/claude/f1-game-project-26h3ng` (shallow clone, history starts 2026-10-19, so
"14 days" is 8 days here; the 10-15 CI-clog note supplies the earlier point), GitHub REST via `gh api` (400 newest
PRs #3452–#3891; 60-PR event sample #3813–#3891; 5 open PRs), `pr-board.mjs`, `claude-code-remote` list_sessions
(200 newest, 10-20 01:28Z → 10-27 01:24Z), list_triggers, 5 `get_session` reads, and the notes named in §5.
Nothing below is a rule; every figure names its sample.

## 1. Merges onto the deploy branch

First-parent merge commits (= PR merges that landed) per day, all committed under `brycejmurrin`'s token:

| day | 10-20 | 10-21 | 10-22 | 10-23 | 10-24 | 10-25 | 10-26 | last 24 h |
|---|---|---|---|---|---|---|---|---|
| PR merges (first-parent) | 72 | 65 | 78 | 95 | 1 | 45 | 43 | 74 |
| ALL merge commits reachable (incl. tip→branch syncs) | 155 | 135 | 192 | 168 | 41 | 60 | 290 | — |
| GitHub "merged" PRs by merge day (400-PR sample) | — | 7* | 80 | 75 | 41 | 4 | 152 | — |

*partial day in the sample. 7-day totals: 399 first-parent merges vs 1,081 merge commits reachable, so ~63 % of merge
commits are sync merges of the tip into work branches, not landings. 10-26's 152 GitHub-merged vs 43 landings is the
mega-train effect (28 distinct PR numbers are named in train merge subjects; GitHub marks a PR merged when its head
becomes reachable). 10-24 was a near-stall (1 landing). Earlier point: 97 merges on 10-14 (CI-CLOG note).

Non-merge commits on the branch, last 7 days, by author: Claude 877 (63 %), Cursor Agent 360 (26 %), Bryce Murrin 117
+ brycejmurrin 25 (10 %), copilot-swe-agent 2. Eleven non-merge commits sit on the first-parent chain in 7 days
(author "Claude", e.g. `split: move the lazy-loader…`, `perf(boot): …`): direct pushes to the protected branch.
Branch namespace of merged PRs: `cursor/` 352, `merlin/` 8, `claude/` 6 — the host is not derivable from the prefix.

## 2. PR funnel (400 newest PRs, created 10-21 21:44Z → 10-27 00:01Z)

| created day | 10-21* | 10-22 | 10-23 | 10-24 | 10-25 | 10-26 | 10-27* |
|---|---|---|---|---|---|---|---|
| opened | 14 | 100 | 71 | 67 | 15 | 132 | 1 |
| merged | 14 | 93 | 70 | 64 | 14 | 110 | 1 |
| closed unmerged | 0 | 7 | 1 | 3 | 1 | 17 | 0 |
| still open | 0 | 0 | 0 | 0 | 0 | 5 | 0 |

- Outcome: 366 merged (91.5 %), 29 closed unmerged (7 %), 5 open. 55 of the 366 merged were still DRAFT when they
  merged (15 %: train absorption or gate bypass). Closed-unmerged median age 1.8 h; 7 of the 29 are train/feeder PRs
  superseded the same day (#3857 #3866 #3867 #3868 #3875 #3876 #3882), the rest docs/skill fixes and perf spikes.
- Open→merge: median 3.35 h, p75 10.9 h, p90 43.1 h, mean 10.8 h, max 88.6 h. Buckets: < 1 h 72, 1–3 h 99,
  3–12 h 107, 12–24 h 39, > 24 h 49.
- 60-PR event sample (#3813–#3891, merged): commits per PR median 2, p90 54, max 236 (trains); 22 single-commit;
  13 PRs with > 5 commits, 11 with > 10. 34 of 60 never had a `ready_for_review` event (merged as draft or via a
  train); 25 had one, 1 had two. Ready→merge median 127 min, p90 210 min. Force-pushes: 0.
- "Ready then went red" proxy: 8 of the 26 ready PRs received a push AFTER the ready flip (a fix after full-tier),
  6 of 26 went ready → draft → ready. 34 of 60 had NO commit after the PR was opened; for the other 26 the last commit
  → merge gap was median 170 min, p90 239 min. A typical PR is therefore finished when opened and spends its whole
  life (2–3 h) waiting on CI, the train, and the merge slot.

## 3. Open-PR backlog now (01:30Z; `pr-board.mjs` agrees: 4 × WAIT, 1 × FIX (HOLD))

| PR | draft | mergeable | CI on head | commits | head pushed | fleet block | board |
|---|---|---|---|---|---|---|---|
| #3806 D·W32b monza coplanar | yes, `run-ci` | DIRTY (conflicts with tip) | failure (sweeps) | 9 | 17:45Z (7.8 h) | D, `state: blocked`; `MERGE-HOLD: DAD merges` | FIX (HOLD) |
| #3872 Codex Cloud transcripts | yes | DIRTY | success | 6 | 21:06Z (4.4 h) | none | WAIT |
| #3880 memory: ratchet OK | yes, `run-ci` | clean/blocked | success | 1 | 21:02Z (4.5 h) | A, `state: pr-open` | WAIT |
| #3886 Codex archive mining | yes | clean/blocked | success | 3 | 23:17Z (2.2 h) | none | WAIT |
| #3890 codex hosted hooks | yes | clean/blocked | success | 1 | 23:08Z (2.4 h) | none | WAIT |

Live owner (branch pushed < 2 h ago): 0 of 5. Three were pushed 2.2–4.5 h ago by sessions now archived; #3806 is the
only one with a fleet claim and it has been `blocked` 7 h behind a hold on an external bot. Backlog on 10-15 05:20Z
for comparison: 62 open (56 draft, 6 ready). The queue is empty today because trains swept it, not because PRs merge
faster individually (median 3.35 h now vs p50 ~54 min CI wall then).

## 4. Sessions, rotations, timers (200 newest `mine:true`; 194 tagged `fleet:b`, 6 untagged)

| role tag | n | median final context | median life (updated−created) |
|---|---|---|---|
| worker | 59 | 193 k | 0.77 h |
| orchestrator | 39 | 222 k | 0.95 h |
| hunter | 32 | 352 k | 3.96 h |
| owner + pr-owner | 36 | 191 k / 170 k | 1.5 h / 2.4 h |
| sync | 13 | 193 k | 0.79 h |
| review + reviewer | 9 | 188 k / 131 k | 0.13 h / 0.08 h |
| design 5, relay 2, seed 1, untagged 4 | 12 | 571 k (design) | 3.6 h (design) |

- By day: 10-20 53, 10-21 31, 10-22 7, 10-23/24 none in this account, 10-25 10, 10-26 97, 10-27 2. Status: 196 archived,
  3 idle, 1 running; bucket FAILED 14, BLOCKED 2 (a 10-22 02:45Z batch of 6 workers/hunters all failed at launch).
- Orchestrator rotations: 39 orchestrator sessions in 8 days; 20 on 10-26 alone (B·O-queue … queue16, then O1–O5),
  i.e. one rotation every ~50 min; 22 of 39 titles say handoff/restart/queueN/retired. Models: Opus 165, Sonnet 32, Fable 3.
- Context caps: 161 of 195 sessions (83 %) ended above the 150 k STOP AT; 111 above 200 k; median 209 k, p90 488 k,
  max 777 k (a hunter). Sum of final contexts 51.2 M tokens.
- PRs per session title: 138 distinct PRs in 200 titles; #3759 had 7 sessions, #3764 5, #3784 4, #3772 4. 102 of 200
  titles name no PR (orchestrators, hunters, syncs, relays). No title says "no PR"/"unpushed"; the closest evidence of
  discarded work is §2's 29 closed-unmerged PRs and the two sampled workers below.
- `get_session` sample (usage field): ORCH B·O3 $12.84 for 1.5 h (266 k ctx, 38.9 M cache-read, 81 k out);
  ORCH B·O1 $9.57 for 1.9 h (291 k, 32.6 M cache-read); the live ORCH successor (ios "Project clone and understanding",
  bound to the safety net) $6.70 in its first 10 min (224 k, 11.2 M cache-read). Worker B·U1b $1.15 for 15 min
  (126 k) and worker B·U2 $2.72 for 21 min (149 k): both built omni-train PRs #3866/#3868 that were closed unmerged.
  Two of five sampled sessions carry `rate_limit_info: seven_day allowed_warning`.
- Scheduled tasks: 7 enabled — ORCH B safety net (one-shot 02:16Z, bound to the ios session), FLEET BUS WATCH (hourly
  fresh Sonnet session, ~1 min), Apex Fleet Board refresh (hourly fresh session since 10-19, ~1.3 min), Fleet B inbox
  relay (fire-only cron `17 10 29 2 *`, bound to relay session B·R1 whose bucket is FAILED), Backlog check-in #1518
  (10-28), Monthly knowledge audit. Of 26 disabled one-shots listed, 25 ended `auto_disabled_session_gone` (10-16 →
  10-20 PR-watch wakes at 15–30 min cadence, one per PR, fired into archived sessions); the three 10-26 check-ins were
  disabled normally. Fixed overhead today: 48 fresh cron sessions/day.

## 5. Cost baselines from the notes

- FLEET-COST-2026-10-19: Opus $4/$20 per MTok in/out, cache read $0.20; Sonnet half. Measured sessions: physics-2 Opus
  303 k ctx $16.34 (cache-read 54 %), render-2 Sonnet 419 k $10.05, fleet-watch-1 Sonnet 296 k $4.21 in 34 min (69 %
  cache-read), DEBUGGER-A 401 k $18.6. Model: a 150 k handoff instead of 300 k cuts cache-read $/work by ~43 %.
  Per-role STOP AT set: reviewer 120 k, worker/PR owner 150 k, watcher 100 k, orchestrator 200 k.
- AGENT-TOKEN-USE-2026-10-20/21: 9 Cursor runs, 533 calls, 1.8 M result chars (read_file 34 %, grep 23 %); 34 agents /
  101 runs / ~15 M result chars in one day; edit_file echo 27–33 % of input; 217 `get_mcp_tools` calls ≈ 500 K.
- AGENT-HISTORY-2026-10-26: DAD bot 441 typed turns in 25 days, 374 launches / 564 archives, 405 cloud-agent launches
  of which 386 (95 %) were PR babysitting, #2800 got 10 agents; median agent life 2.0 h (p90 15.8 h); 19 launches
  refused over 5 h at the plan limit; 75 unanswered-question nudges. Codex: 14 h 11 m of work for 195 prompts.
- CI-CLOG-SURVEY-2026-10-15: 1,564 Actions runs on 10-14 (770 ci.yml, 225 cancelled); 60 PR runs/hour; green PR run
  wall p50 ~54 min (16–105); per-job queue wait p50 10–13 min; 62 open PRs; 97 deploy merges on 10-14.
- TESTING-FIELD-NOTES / AGENTS.md: local browser group 30–45 min; gated publish median 23 min, p90 73 min (10-15
  bursts) → ~20 min median, p90 ~27 (23 trains, 10-26); macOS Metal leg +9 min median; browser-group.yml p50 14 min.

## 6. Five observations — throughput vs overhead

1. Coordination roughly equals production. 100 of 200 sessions were orchestrator/owner/sync/review/relay/seed, 96
   were worker/hunter/design. Sampled orchestrators cost $9.6–12.8 per ~1.5 h rotation; at 20 rotations on 10-26 that
   is on the order of $200/day of orchestration against workers at $1–3 each — and 43 landings that day.
2. PRs wait, they do not work. 34 of 60 merged PRs had no commit after opening; the median PR lives 3.35 h, of which
   ~2–3 h is last-commit/ready → merge. The binding constraint is the serialized gate (CI ~54 min, Pages 20–27 min,
   one GAME-SLOT), so adding workers raised the open-PR count (62 on 10-15), not landings (97 → 65–95/day).
3. Trains trade latency for discard. Mega-trains cleared the backlog (152 "merged" on 10-26 via 43 landings) but
   7 train PRs and the two sampled worker sessions ($3.87) were thrown away as superseded, and 63 % of all merge
   commits in 7 days are tip→branch syncs — pure conflict-service work caused by the long wait.
4. The context policy is not followed. 83 % of sessions ended above their STOP AT, orchestrators median 222 k, hunters
   352 k; with cache reads at 41–69 % of a session's bill (10-19 note) the rotation cadence of ~50 min is a symptom of
   contexts filling, not of work finishing — each handoff re-reads ~200 k.
5. Timers mostly fire into the void. 25 of 26 disabled one-shot check-ins ended `auto_disabled_session_gone`; the
   only wake-ups that reliably run are the hourly fresh-session crons (bus watch, board), which cost 48 sessions/day
   and do no PR work. The one live safety net is bound to an ios session, and the Fleet B inbox relay is bound to a
   FAILED session, so cross-fleet messages currently have no reliable receiver.
