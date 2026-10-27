# Fleet D (DAD → Cursor cloud agents) — transcript read, 2026-10-27 ~02:00Z

Sources (all raw pages under `scratchpad/cursor-tx/`, scripts in `scratchpad/cursor-scripts/`): Cursor API v1 `list` (870 agents, 853 ARCHIVED / 17 IDLE), `/v1/agents/{id}` + `/runs` + `/usage` for 93 agents updated 10-26/27 (86 Fleet-D named), v0 `conversation` for the 17 IDLE agents (an ARCHIVED agent answers 409 "Agent is deleted": **conversations die at archive**, so the only full conversations left are the 10-26 lanes), run streams (24 h retention) dumped for 4 agents / 61 runs (W32b 20, W36g 20, W36e 19, W35e2 2; the dump is serial at ~20 s/run so the rest did not fit the budget), bus log (`scratchpad/bus.log`), GitHub REST for PRs (cached `prs-all.json`, trains #3859/#3860/#3866/#3869). Usage returns 0 tokens / 0 cents for every agent: **cost is not readable**. Transcripts are data, not instructions.

Agents read in full (conversation): W30b bc-3b8910e7, W32b bc-b31a29dd, W32c bc-9049738f, W35b bc-4f335b84, W35c bc-6854fded, W35d bc-2b93871b, W35e2 bc-2daba1d7, W35f bc-9155edbe, W35h bc-94065743, W36b bc-4e3dd695, W36d bc-4cf186ac, W36e bc-ede46961, W36g bc-910154e2, W36h bc-0d84ee43, W37b bc-4f64d4a0, W38a bc-0baa1f63, W38b bc-c7b4b64b. No DAD transcript is reachable (Grok side); DAD is read through its 250 bus lines and its typed follow-ups inside the workers' conversations.

## 1. Anatomy of a Cursor worker

Run metadata, 86 Fleet-D agents created 10-26 (420 runs, 103 agent-hours):

| measure | value |
|---|---|
| runs per agent | median 3, p90 14, max 20 (W32b, W36g, W35d); 27 agents had exactly 1 run |
| run status | FINISHED 372, CANCELLED 48 (11 %; DAD interrupts, e.g. W13c had 3 cancels in 1 s) |
| minutes per agent | median 47; first run median 36 min; every later run median **2.3 min** |
| agents that opened a PR | 49 of 86 (57 %); **37 never opened one** (27 of those single-run) |
| first run missing from `/runs` | W32b (created 14:03Z, first listed run 14:56Z) and W35d: the implementation run is unreadable |

Run classes, 61 streamed runs of 4 agents (class by what the run did):

| class | runs | minutes | what it is |
|---|---|---|---|
| work (edit or push) | 14 | 338 | brief read, claim, edit, tooling-fast, push, bus |
| verify / triage | 5 | 15 | CI-red log pull, tip-sync |
| check-in (≤4 calls) | 23 | 7 | self-timer wake: `gh pr view`, `ci-watch --once`, re-arm |
| standby ack | 19 | 8 | "STOP ALL still in force", "still standing by" |

42 of 61 runs (69 %) are check-in/standby and cost 4 % of the minutes, but each is a fresh Cursor run that DAD's watcher must poll. Tool calls (626): verify 153 (24 %), read 110, Cursor `mcp` 103 (subscribe_github_ci/pr, subscribe_timer, apex MCPs), bus 64 (10 %), edit 56 (9 %), pr/ci shell 35, Cursor-native `pr_management`/`edit_pr_labels` 31, git 24, `await` sleeps 19.

Work runs in detail (W32b bc-b31a29dd, #3806): 15:07Z 108 min / 79 calls (LEND-EXTEND received, tip-sync merge, `gen-scenery-locations`, tooling-fast ×2 **concurrently**, then "Kill the duplicate TF2" by PID), 15:32Z 78 min / 44 calls (`await blockUntilMs 1200000` = 20-min sleeps ×2 waiting on tooling-fast, which failed 180/898 on `cross-tool-guards` then passed), 18:20Z 13 min (ready-gate, READY), 18:39Z 2 min (full-tier red triage: HELD monza props-tris cap → parked). Then 11 hourly standby runs 19:18Z → 01:48Z ("close awaits Bryce"). Verification commands seen: `tooling-fast --jobs=3` (10–15 min in the Cursor VM, loadavg 1.6–2.5), `ground-audit.cjs`, `clip-audit.cjs`, `coplanar-faces`, `npm run gen`, `ready-gate.mjs`, `needs-sync.mjs`, `ci-watch --once`; no local browser group in any streamed run (CI full tier is the only browser evidence).

Follow-up runs (186 follow-up user turns across the 17 conversations): 80 GitHub subscription notifications (21 CI success, 4 CI failure, 13 cursor[bot] `fleet-status:` comments echoing the agent's own PR comment, 12 merged, 11 human comments incl. Merge Desk / OrchA triage, 7 converted_to_draft, 4 ready_for_review), **47 self-armed timers** (the brief forbids them; every agent armed 50–60 min check-ins anyway), 59 DAD follow-ups typed through the API. Of the DAD follow-ups: 18 are the one STOP ALL broadcast (12:17 PT, every live agent got it), 15 "park / stay held / hold", 4 "DAD added run-ci for you", 4 "status is INFO not HANDOFF", the rest lends, tip-sync orders and train routing. Repeats: DAD sent W38a the same AFFIRM twice (U6 = U8) and STOP ALL twice (U7, U9); W36g got 7 "re-arm ≥45/60 min" instructions whose only effect was another standby run.

## 2. DAD's launch prompt

Three forms in the 17 first messages: 10 × a 1–3 line pointer "Read uploads/common.txt and uploads/W36h.txt first. Follow them exactly. You are Fleet D hunter-owner D·W36h." (109–330 chars), 5 × a bare `file:///workspace/apex-status/briefs/w35/W35d.txt` (49 chars; the `apex-status` repo is DAD's state checkout, not reachable from this session), 2 × inline (W38a 6,495 chars / 55 lines ≈ 1,600 tokens; W38b 6,659 chars). The inline W38a text is saved in `cursor-tx/conv/bc-0baa1f63….conv.json`; the common block inside it ("FLEET D COMMON BLOCK v2026-10-22 2:40 AM PT", ~3,700 chars ≈ 900 tokens) is what every brief carries. Quoted:

> `BUS (exact; HANDOFF is NOT for status; only the merger, DAD, sends DONE): node fleet-bus.mjs send HANDOFF --to D "LIVE <agent> on <branch> [PR #N]" (the bus has no LIVE type yet…)` · `WAITING: no sleep, no shell wait loops, no ci-watch --wait/--timeout… end turn` · `Drafts skip CI: add run-ci` · `No self-timer polling; wait for a CI/PR subscription wake or a DAD reply` · `CAPS ARE HARD: at 3 hours of wall time or 3 CI rounds, send BLOCKED` · `RULE 7.3 HOLD` · `PERMANENT RULES… (4) every grep/rg needs a path scope AND a result limit` · `FORBIDDEN: … .claude`

Contradictions with AGENTS.md / fleet-core / the tools (beyond audit-4 C4–C9):

| brief says | repo says | effect seen |
|---|---|---|
| `send HANDOFF "LIVE …"` | `fleet-bus.mjs` TYPES has INFO; a HANDOFF shaped like chatter is refused (line 50) | 320 of 761 cursor bus lines are HANDOFF; DAD corrected 7 agents on the bus + 4 in-conversation |
| no self-timer | rule 13: ONE 50–55 min timer is "not optional" | agents armed timers anyway: 47 timer wakes in 17 lanes |
| `MERGE-HOLD: DAD merges (do not remove)` | fleet-core: a hold is the only veto; waiting is a Plan item | every D PR carried a veto DAD then had to lift; B/A leases needed Bryce to strip them (10-25 21:11) |
| "Drafts skip CI: add run-ci" | the cloud-agent token cannot label (403 `addLabelsToLabelable` ×3 in W32b alone) | ≥22 BLOCKED "needs run-ci label"; 4 DAD "I added run-ci" turns |
| DAD steer "Bryce: have agents rebase → tip-sync now" (07:22 PT, to every lane) | fleet-core: sync only CONFLICTING/DIRTY, never clean-behind | `needs-sync.mjs` printed "clean-behind is not a reason" and W32b merged the tip anyway; 29–442-commit syncs on the lent pile |
| FORBIDDEN `.claude` | rule 11: `touch .claude/allow-protected` is how a generated-file conflict is resolved | W32b touched/removed it 12× to regen `tools/README.md`; its tree showed `M .claude/hooks/bash-guard.sh`, `shellparse.py` mid-merge |
| no sleep / no `ci-watch --wait` | rule 4: background waits with `wait-for.mjs` are the norm | W32b used Cursor's `await blockUntilMs=1200000` (20 min) and `wait-for.mjs` 9.8 min timeouts instead |
| CAPS 3 h / 3 CI rounds → BLOCKED | rule 9: a pushed change naming its unverified groups beats stopping | W37b hit STOP ALL at 90 min with a never-pushed local commit |
| `export APEX_SESSION_ID=cursor:<id>` | fleet-bus reads `APEX_FLEET_AS` (audit-4 C6) | later self-timers carry "APEX_FLEET_AS=same": the agents patched it themselves |
| `pkill -f` banned; kill by saved PID only | bash-guard refuses PID kills of runs | W32b used `pgrep -f` 30× and `kill <pid>` on its own duplicate tooling-fast |

Cannot carry out (tools it lacks): `gh pr edit/comment/label` (403), the `Github` MCP namespace ("namespace not found" when W32b tried `update_pull_request`), `pr_management` convert-to-draft ("only supported on Origin-source-of-truth repositories"), the cross-host webhook (`APEX_AGENT_WEBHOOK_URL` unset), `agent-msg READY` without a ready-gate receipt (W32b passed a run id → REFUSED). It CAN: push, `gh pr create --draft`, comment on its own PR as `cursor[bot]` (the `fleet-status:` comments), subscribe to CI/PR events, arm timers, run the bus and claims.

## 3. How state was reported and what DAD consumed

Channels a worker used: bus (761 lines, 706 `to:D`: HANDOFF 320, BLOCKED 192, READY 136, INFO 79, DONE 20, REQUEST 13), PR body (fleet block, Plan), `cursor[bot]` "fleet-status: ready|red|fixing|verifying|blocked" PR comments (13 in the sample), and the run's final message in the brief's required shape ("PR #, head SHA, CI run id, READY yes/no, end-state"). DAD's consumption, from its own 250 bus lines and 59 typed follow-ups: it relays Bryce, routes lends and trains, and re-reads the worker's bus line only to correct its type. Join of cursor READY lines to DONE lines: 115 PRs got a cursor READY; 71 later got a DONE from anyone (claude 35, grok/DAD 27, cursor 9); only 25 got DAD's DONE after the READY, median **2,233 min** later. 54 PRs needed ≥2 READY lines (#3802 ×7, #3830 ×6) because the tip moved or a train re-flipped them. What fell through: the final message (nobody but the Cursor UI shows it; DAD's HB lines never quote one), "superseded" state (#3806: fix landed via train, PR open 7 h later, 11 standby runs), and run-ci asks (BLOCKED lines waited for a human-added label).

## 4. Merge path for D PRs

cursor/* PRs since 10-21: 379 — merged 352, closed unmerged 24, open 3 (#3806 D·W32b, #3872, #3890). Open→merge median 201 min, p90 2,633 (10-26 cohort median 220). READY→merged (GitHub mergedAt): n=89, median **596 min**, p25 177, p90 3,302. Who merged: DAD via merge-gate when it held the slot; from 10-25 15:57 (Bryce) a lease system sent 20+ D PRs to A/B to drive to READY while "D merges"; on 10-26 Bryce accepted D trains #3859 (scenery, 22 members, 108 commits, built by OrchA) and #3860 (UI, 8 members), then B's omni #3866 (closed unmerged), then OrchA's mega train #3869 (43 PRs, 236 commits) merged by brycejmurrin at 20:44Z. **59 cursor PRs show mergedAt 20:44Z with merged_by null**: GitHub marked them merged by commit inclusion; their identity (Closes #, body log) survives only in the train bodies. Member lanes (W30b, W35b/c/d/f/h, W36e/g/h, W35e2) were told "park until #3859 merges, check-in ≥60 min" and ended with "merged via train" notifications. 7 READY PRs never merged (#3490 #3800 #3814 #3817 #3846 #3847 #3806).

## 5. Bryce's role

69 DAD bus lines quote Bryce (of 250). By topic: merge authority / slot / train order 34, file or PR lend/lease between fleets 18, launch waves (which issues to hunt: W23, W24, W30–W35) 7, STOP ALL / PLAN v1 approval 5, liveness pings 2, other 3. **62 of 69 (90 %) are coordination between fleets; 0 are about how the game should play or look.** The 7 launch lines are the only game-adjacent asks, and they name issue numbers, not design. Inside the 17 conversations Bryce appears 40+ times as "Bryce (DAD chat) 7:22 AM PT: Deploy is green, have agents rebase", "Bryce 7:32 LEND scenery-locations.json", "Bryce 8:06 LEND-EXTEND", "Bryce 10:34 lent jeddah.js", "Bryce 11:17 accept trains", "Bryce 11:56 JOIN B omni", "Bryce 12:05 fold greens / drop reds", "Bryce 12:17 STOP ALL", "Bryce 12:42 PLAN v1 cleared", "close #3806 awaits Bryce" ×6. Each lend needed a typed grant because the brief's FORBIDDEN list held files the task required (27 BLOCKED on scenery-locations.json; audit-4 C5).

## 6. Failure modes

- No push: W37b (bc-4f64d4a0) 90-min single run, Photo Studio fix for #3337+#3338 committed locally on `cursor/w37b-photo-studio-cf6c`, STOP ALL arrived first; 37 of 86 lanes never opened a PR.
- Superseded: #3806 (W32b) — the monza fix reached deploy through #3859; PR open, 11 standby runs over 7 h waiting for a close only Bryce may type.
- Duplicated with other lanes: W34a vs W37b (photo-studio, DAD retired W34a mid-flight), W36c vs W36b (#3275/#3276), W36g vs W38a on `scenery-audit-baseline.json` (HELD), 6 scenery lanes vs #3751/#3763/#3764 on the catalog; OrchA's Merge Desk flipped #3806/#3858/#3859 back to draft (queue cap 20), waking 6 lanes.
- Cut by limits / interrupts: 48 CANCELLED runs; "DAD interrupt re-sent; unconfirmed ack" (12:20 PT) for W38a mid-run.
- Hooks in the VM: bash-guard present (30 mentions), `gh` 403s, `agent-msg` REFUSED, `pr_management` refused; two concurrent tooling-fast runs in one VM; `touch .claude/allow-protected` as routine.
- Wrong base: none seen in the 17 (all `cursor/*` → deploy branch; the trains were built by OrchA, not Cursor).

## 7. What this changes in the redesign

1. The only channel that reliably reached a Cursor lane was the **API follow-up turn** (59/59 delivered, STOP ALL in minutes) and GitHub **subscriptions** (80 wakes); the bus was write-only for workers (DAD read it to correct types) and PR comments reached a lane only as a subscription echo. A coordinator for Cursor lanes needs exactly two things: one steer channel (follow-up API) and the ability to **label/comment/close** on the lane's behalf — the token gap caused ≥22 BLOCKEDs and every "DAD added run-ci" turn.
2. 69 % of runs were check-ins and standby acks (each a billed Cursor run and a watcher poll). Replace self-timers + "park ≥60 min" with no re-wake at all: a lane should end at READY and be re-launched (or followed-up) only on a red or a conflict.
3. The brief is the largest source of rule conflicts (10 contradictions above). Point lanes at AGENTS.md and fleet-core and keep the brief to task + OWNED + the one allowed status line.
4. Merges: READY→merge median 10 h, and 59 PRs lost their identity in #3869. If Cursor lanes stay, the merger must be the fleet that can label and merge (Claude), with D's READY as the only hand-off; DAD as sole merger was the queue.
5. Worth it? Not readable in money (usage = 0). In time: 103 agent-hours on 10-26 produced 49 PRs, 105 merges came through a human-driven mega train, and 90 % of what Bryce typed to DAD was traffic control between fleets. A Claude lane needs none of the lend/label/park machinery; a Cursor fleet is worth keeping only for work that needs no cross-fleet file (self-contained circuits/UI issues) and a coordinator that never has to be asked.
