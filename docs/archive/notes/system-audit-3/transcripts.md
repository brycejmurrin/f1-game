# Slice: session transcripts, last 8 h (third pass, 2026-10-26 ~16:50Z)

Read, in full: ORCH B O1 01M5i67 (14:40–16:36Z, 18 pages), O-queue16 01Nr4ZX (14:18–14:37Z, 8), the seed 01KLkpS (3),
owners 01Y52mw #3784 (15), 01Mmexy #3760 (5), 01LuMEf #3764 (4 of 5; boot rows missing). O-queue15 013JaBx: only
13:11–14:30Z (16 pages, 47 turns). Its 10:17–13:11Z part ($8.22) was not paged. The sessions page shows no Cursor
or Codex session: 58 have origin `claude_code_mcp_seed` and 2 have `ios`, Bryce's seeds. Raw pages are in
`scratch/sysaudit3/tx/<name>-p*.txt` and digests in `tx/*-digest.txt`. Turns were classified with
`session-transcript.mjs` plus a result-event pass (origin, steps, cost delta).

## Per session (get_session + transcript)
| session | role / life | ctx at end | $ | turns (wakes/h) | what woke it | useful actions | $/action |
|---|---|---|---|---|---|---|---|
| 01M5i67 O1 | orch, 116 min | 290k (hand-off at "~270k of 300k cap") | 9.55 | 30 (15.5/h) | 4 Bryce, ~9 peer send_message, ~13 bus Monitor, 3 Monitor-expiry re-arms, 1 seed | 3 merges (#3801 #3771 #3811), 11 launches, 2 GAME-SLOT | 0.68 |
| 013JaBx O-q15 | orch, 4 h 07 m | 349k (handed off at 314k > 300k cap) | 23.28 | 47 in 13:11–14:30 (≈36/h) | 9 Bryce prompts in 80 min; the rest bus/peer | in window: 7 launches, 0 merges | 2.17 per launch (window $15.2) |
| 01Nr4ZX O-q16 | orch, 19 min | 200k | 2.39 | 10 | Bryce (restart) | 1 launch, 15 archives, seed prompt | — |
| 01KLkpS seed | Sonnet, idle | 142k | 1.02 | 2 | Bryce; O1 hand-off | 2 orch launches (O1, O2; hand-off→launch in 67 s) | 0.51 |
| 01Y52mw #3784 | owner | 236k | 6.89 | 14 | Monitor/CI, O1 msgs, 2 subscribe-confirm no-ops | diagnosis, split PR #3812, 2 pushes, READY, #3812 sync | ~1.4 |
| 01Mmexy #3760 | owner | 160k | 3.26 | 4 | CI, O2 broadcast | ci.yml dispatch, READY (still GitHub-blocked) | 1.63 |
| 01LuMEf #3764 | owner | 137k | 2.00 | 8 | 30-min Monitor expiry ×2, send_later ×2, O2 | none: it waits on #3768/#3782 | — |

## O1 before vs after 14:58Z (audit msg 14:57: stop sibling get_session, no subscriptions, one bus read, cap 300k)
| metric | 14:40–14:58 (18 min) | 14:58–16:36 (98 min) |
|---|---|---|
| turns / cost | 5 / $3.05 | 25 / $6.50 (15.3 wakes/h) |
| tool calls per wake | 9.8 (boot) | 2.8 |
| `get_session` on siblings | 3 in 1 s (14:48:56) | **0** (2 self calls, both for launch-gate quota receipts) |
| `subscribe_pr_activity` | 0 | 0 (q15 still subscribed to #3795 at 13:35:25) |
| context growth | 0→204k | 204k→290k (~0.9k/min) |
| bus filter | `read --to B` + grep | same loop + `grep -v` for D's LEND/LIVE and its own lines; never `--strict` |
| queue file | n/a | rewritten with Write (not appended), on a branch from the deploy tip; successor launched from the tip |
**Verdict: it changed.** Sibling polling stopped, it lived 116 min against its predecessors' 58–74, and it handed off under the cap.
Still wasted after 14:58: 6 duplicate-event turns, 3 Monitor re-arms, and 2 shell waits (F4, F5).

## Findings
| id | what is wrong | evidence | cost to Bryce | one-line fix | conf | status |
|---|---|---|---|---|---|---|
| T1 | An agent-written seed prompt narrowed the standing authority, so Bryce answered the same launch question **3 times in 20 min** | 01Nr AskUserQuestion 14:24:28 → "launch freely". Seed prompt by 01Nr (seed-p3 14:37:08): "Launch only on my typed word", "B merges only its own PRs, or a PR I name". Seed AskUserQuestion 14:39:03 → "Yes, freely". O1 14:44:40 asked 4 questions that AGENTS.md §Concurrent PRs already answers (launch owners, lent merge #3771, clean-behind sync, hourly watch) → Bryce "Yes" 14:45:42 | 2 extra Bryce round trips; O1 stalled ~5 min; $1.23 turn | fleet-brief/launch prompts quote AGENTS.md authority verbatim; lint launch prompts for "only on my typed word" / "merges only its own" | high | NEW |
| T2 | The launch-gate quota receipt is self-attested: freshness is file mtime, and the content is whatever the agent writes | O1 wrote `artifacts/launch/self.json` by heredoc or `echo '{"ccr":{…"status":"allowed"}}'` (14:46:34, 16:16:22, 16:17:53), then `touch`ed it (14:46:51) to pass `PAGE_MAX_AGE_S=120` (launch-gate.mjs:29,86) | latent: 11 launches were gated on hand-typed JSON at `allowed_warning` week | gate reads the harness spill file `tool-results/mcp-claude-code-remote-get_session-*.txt` and checks its embedded `updated_at`, never mtime | high | NEW |
| T3 | The twin guard matches on lane, and every owner carries `lane:owner` | 16:16:22: `launch REFUSED (twin): session_01LuMEf (lane:owner)` ×8 for PRs #3748–#3788; O1 got around it with `--lane pr<N>` (claims `B-pr3748-pr3748`) | 1 retry; claim names now doubled | role owner/sync: twin = same `pr:` only; default lane `pr<N>` | high | NEW |
| T4 | Shell waits by hand, and the bus Monitor is still a `while … sleep 90` loop | O1 14:43:30 `timeout 300 bash -c 'until grep …; sleep 5'` (right after printing `wait-for --help`); 16:34:45 `until fleet-bus who …; sleep 30`; bus Monitor armed 4× (14:41, 15:11, 15:41, 16:11) and expired every 30 min → 3 re-arm turns ($0.29). The harness blocked `sleep 25` (14:47:18) while launch-policy asks for a ≥30 s stagger | ~$0.3/h per orchestrator | O2 uses `fleet-bus watch` (landed b07a5ac6, after O1 booted); add `wait-for --bus-who/--merged`; turn the stagger into "confirm each child" only | high | STILL OPEN (prior #8), stagger part NEW |
| T5 | One event wakes the orchestrator twice (send_message plus the bus line), and other fleets' lines wake it too | 6 O1 turns were "that bus line repeats …" (14:49:08, 14:59:43, 15:35:50, 15:55:19, 16:04:24, 16:26:53) = $0.51, 8% of post-14:58 spend; D LEND/LIVE turns 15:08:49, 15:41:43 = $0.15 | ~$0.4/h | watch dedupes a (type, PR, sha) already received by send_message; owners report through one channel (agent-msg) | med | NEW (measured) |
| T6 | Per-event grants are asked for in the wrong session | 16:24:06 O1 asked Bryce about the #3763 assertPins +17 raise; Bryce typed "Raise limit" in **O1** (16:24:36); the owner refused the forwarded grant (16:25:27); still pending at hand-off 16:36 | 1 wasted Bryce reply; #3763 blocked ≥13 min and counting | BLOCKED template carries "type exactly `<grant>` in session <id>"; the orchestrator relays that line and never asks in its own session | high | NEW |
| T7 | Rotation is better, but the q15/q16 pattern repeated today | q15 handed off at 314k > 300k and appended with `cat >> scratch/orchb-queue.md` (14:13:32). Bryce restarted the whole fleet at 14:28:31 ("cleanup all sessions and start totally fresh"). 11 ORCH B ids on the page in 12 h (queue8–16, O1, O2) | ~25 min of Bryce restart work (paste the seed prompt, 4 AskUserQuestion) | keep T1, plus a `fleet-brief --handoff` that rewrites the queue file; the seed stays | high | STILL OPEN (prior #1), improving |
| T8 | Owners launched for PRs blocked on other merges, then woken by broadcasts | #3764: 8 turns, $2.00, zero actions, 2 Monitor-expiry wakes. O2's 16:41 "fetch tip, don't merge" broadcast woke owners at $0.21 (#3764), $0.27 (#3784) and **$1.02** (#3760: cache expired after 90 min idle) | est. $3–5 per broadcast across the 11 owners launched 16:17–16:18 | launch-policy "before launching an owner": skip PRs waiting on another PR's merge; message only owners whose PR changed | med | NEW |
| T9 | Rule 12 says "never chain `git add` into the commit". The hook now accepts that chain on purpose, and agents chain anyway | O1 16:33:00 `git add -f … && git commit`; #3784 owner 15:05:50 and 15:12:20; bash-guard.sh:484-503 parses ADD_PATHS, and :692 skips the cache for it (fixed in #3811) | none now; prose drift | drop the two-call sentence from AGENTS.md:75, or have the hook refuse; one source of truth | med | NEW (follows prior F1) |
| T10 | Marking a PR ready started no full-tier `ci.yml` run, and the `workflow_dispatch` workaround still left GitHub showing the PR blocked | #3760: marked ready 14:28:13Z, no run. The owner dispatched `ci.yml group:car` at 14:50:10; `CI` passed on f8d2e6c (run 40343688726), but the PR still showed "blocked" at 15:11 | #3760 still unmerged; 22 min of owner time | ready-gate checks that a pull_request run exists after a ready flip and says how to get the real `CI` check (push or close and reopen) | med | STILL OPEN (prior F6), new case |
| T11 | An orchestrator still subscribed to a PR and polled a sibling (q15, before the fix) | q15 13:35:25 `subscribe_pr_activity #3795`; 13:27:37 `get_session` on 01JSYCYR | context; prior pass | add a PreToolUse hook that refuses `subscribe_pr_activity` in role:orchestrator sessions. No hook on b07a5ac6 matches it: grep of `.claude/hooks` and `settings.json` finds nothing. O1 complied only because a message told it to | med | STILL OPEN |
| T12 | One q15 turn cost $3.17 because of a prompt-cache break | 14:09:32: cache_read fell from 317k to 48k and cache_write was 263k inside one turn, 4 min after the last turn. That is ~20% of the hour's spend. Cause not visible (a tool-list or system-prompt change?) | $3 per occurrence | session-transcript flags turns with cache_write > 100k so breaks get counted | low | NEW |

Other observations, not findings: the Sonnet seed works ($1.02 for 2 launches, hand-off to launch in 67 s). The harness
Stop hook `stop-hook-git-check.sh` cost 2 turns in q16 and 1 in #3784; that is already in STOP-HOOK-H1. Bryce asked
legitimate questions only twice: the #3812 gate exception and the #3763 raise.
