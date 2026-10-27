# Fleet bus — measured behaviour, 2026-10-19 → 10-27 (3735 lines, `origin/claude/fleet-bus`)

Source: scratchpad `bus.log` (commit order). Scripts: `scratchpad/an/{parse,q1,q2b,q3,q5,q10,q11}.py`.
Caveat: 9 senders (all `grok:*`, 3 `codex:*`, 1 `claude:a31d…`) stamp Pacific time, not UTC — 231 backward
steps in the raw log; the parser shifts those senders +7 h (4 residual >30 min steps). All times below are UTC.

## 0. Shape
| | |
|---|---|
| lines / day | 10-19 403 · 10-20 581 · 10-21 226 · 10-22 418 · 10-23 506 · 10-24 411 · 10-25 110 · **10-26 1063** · 10-27 17 |
| hosts | claude 2279 · cursor 761 · codex 356 · grok 287 · github 10 · no-host (`from:A·H13`, `B·L4`…) 42 |
| senders | 545 distinct, 112 posted exactly once; 168 distinct senders on 10-26 alone |
| types | HANDOFF **1847 (49 %)** · READY 476 · DONE 450 · BLOCKED 273 · GAME-SLOT 210 · INFO 196 · INCIDENT 119 · GREEN 89 · REQUEST 26 · LEASE 22 · ROTATE 14 · QUESTION 12 · LEND 1 |
| typed chat | INFO/REQUEST/QUESTION/ROTATE/LEND exist only from 10-26 (249 lines); before that everything rode as HANDOFF |
| body | median 182 chars, p90 489, 178 lines > 600 chars |

## 1. Orchestrator churn
86 `ORCH <X> LIVE` announcements from **63 distinct orchestrator sessions**; only 14 used the ROTATE type (all 10-26/27), the rest went as HANDOFF `to:*`. The sessions' own ordinals reached **OrchA 36** and **OrchB 26** in 8 days.

| fleet | 10-19 | 10-20 | 10-21 | 10-22 | 10-23 | 10-24 | 10-25 | 10-26 | 10-27 | LIVE lines | successive sessions | lifetime median / mean / max |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A | 0* | 0* | 0 | 6 | 7 | 1 | 3 | 16 | 2 | 35 | 23 | **2.2 h** / 5.2 h / 46 h |
| B | 0* | 15 | 1 | 0 | 0 | 0 | 3 | 24 | 2 | 45 | 41 | **0.7 h** / 4.2 h / 116 h |
| D (DAD) | | | 1 | | 1 | | | 3 | | 5 | 4 | 47 h |
| C | | | | | | 1 | | | | 1 | | |
\* 10-19/20 A-side lines used `ORCH12 → ORCH13` wording, not "LIVE", so they are undercounted here (ordinals ORCH9…ORCH19 all appear on 10-19).

- 10-26: **ORCH B rotated 22 times between 00:47 and 19:38** (one every ~52 min), e.g. `10-26 03:25 HANDOFF to:* … ORCH B LIVE claude:session_01WYAj… (succeeds session_012x87…)` then `03:42 … ORCH B LIVE claude:session_017qTc… (succeeds session_01WYAj…)`. Two sessions re-announced themselves ("LIVE again", "re-live; fixes who-B parse").
- 10-20: 15 B rotations (OrchB 8 → 24 in one day).
- Consequence: 13 lines say direct `send_message` returned not-found and relay through the bus instead: `10-20 09:43 HANDOFF … Relay from W5 (send_message to OrchB 22 says not-found): #2993 …`.

## 2. Request/response health (BLOCKED, QUESTION, REQUEST)
"Answered" tiers: T1 = a later line from another sender `to:` that sender or `to:#pr`; T2 = +body names the sender's session id; T3 = +any later line from another host naming the same PR within 48 h (includes DONE/GAME-SLOT, so it is an upper bound).

| type | n | T1 answered | T2 | T3 | T1 median latency | never (T3) |
|---|---|---|---|---|---|---|
| BLOCKED | 273 | **32 (12 %)** | 56 (21 %) | 225 (82 %) | 7 min (p75 36) | 48 |
| QUESTION | 12 | 5 (42 %) | 8 | 11 | 5 min | 1 |
| REQUEST | 26 | 8 (31 %) | 13 | 23 | 4 min | 3 |

- 192 of 273 BLOCKED are **cursor workers → `to:D`** (Fleet D status reports to DAD, who answers off-bus on the Cursor agent): 31 start `#none`, 82 mention the `run-ci` label / `gh 403`, 11 are byte-identical repeats. `10-23 … BLOCKED to:D from:cursor:bc-c3220ea8… #3641 needs run-ci label (gh 403 addLabelsToLabelable; hollow draft/fast CI …)`.
- Never addressed at any tier: `10-19 01:45 BLOCKED to:orchestrator from:codex:coordination-20261019 … rejected HTTP429 …` (plus its 01:50 twin); `10-26 14:58 QUESTION to:B from:claude:session_01Y52m… #3784 BLOCKED 3784 full tier red on budget …` and its two follow-ups (#3812) — three questions to an ORCH B that rotated 3× that afternoon.
- 12 cursor `REQUEST to:D … add run-ci label (token 403)` on 10-26 have no on-bus reply at all.

## 3. READY → DONE
- 468 READY lines over **319 PRs**; 443 DONE lines over 407 PRs. **216 READY'd PRs (68 %) got a DONE; 103 never did** (e.g. #3026 #3126 #3465 #3800 …). 191 PRs were DONE with no READY ever posted.
- Latency first READY → first DONE: **median 1.3 h**, p25 0.3 h, p75 6.7 h, max 81 h; 3 DONEs precede their READY.
- READY repeats per PR: 1×222 · 2×69 · 3×15 · 4×7 · 5×3 · 6×2 · 8×1. 71 PRs were re-READY'd by the **same** sender. Worst: **#3576 READY 8 times** (10-22 17:15 → 10-26 02:13, three different senders, pairs of identical lines 1 min apart) ; #3021 6× (`10-20 15:24/16:59/17:37/18:08 from:claude:W15`).
- GAME-SLOT → DONE median **1 min** (109 pairs, p75 2 min): the slot is a stamp posted seconds before merging, not a reservation others can see in time.

## 4. Noise
| measure | value |
|---|---|
| broadcasts `to:*` | **1468 / 3735 = 39 %** (HANDOFF 624, DONE 396, GAME-SLOT 205, INCIDENT 103) |
| HANDOFF that is a real successor hand-off | **~108 of 1847 (6 %)** |
| HANDOFF misuse breakdown | LIVE announcements 327 · `[INFO]`/`[REQUEST]`/`[QUESTION]`-tagged chat 214 · DF CLAIM/RELEASE 43 · SPAWN 37 · SEED 37 · HB 16 · GAME-SLOT-in-HANDOFF 13 · webhook mirror 8 · untagged status ("OrchA 33: …", "ORCH B …") ~1000 |
| HANDOFF share by day | 67 % · 55 % · 34 % · 40 % · 43 % · 68 % · 72 % · 41 % · 6 % (typed chat arrives 10-26) |
| duplicate DONE | 32 PRs with >1 DONE (36 extra lines); #3021/#3460/#3485/#3611 ×3 — e.g. `10-20 18:57 DONE … from:claude:W15 DONE 3021 merged` / `18:58 DONE … Fleet A drained: #3021 merged` / `18:58 DONE … DONE #3021 2a4c9a13`; 5 of 10 `github:merge-done` hook DONEs duplicate an orchestrator's |
| GAME-SLOT | 223 lines (13 wrapped as HANDOFF); 16 with no later DONE for that PR; 22 PRs slotted more than once (#3636 ×12, #3634 ×9, #2982 ×7) |
| heartbeats | 36 (grok DAD 32: `HB D LIVE (DAD) 21:11Z: merge_pause+launch_pause ON …`, cadence 28 min, 23 of them on 10-26) |
| double-posts | 34 lines posted to a second address within 2 min; 53 byte-identical (sender, body) repeats; 23 `[FROM FLEET A via inbox]` mirror relays |
| idempotency keys | 229 lines carry `[idem:…]` (all 10-26+) |
| GREEN | 89 lines that no reader acts on (to:B 29, to:A 22, to:* 12) |
| LEASE | 22 lines, all 10-19; the lease was retired 17:50Z the same day |

## 5. Incidents
119 INCIDENT lines = 71 open/update + 48 lift; clustered by topic within 3 h → **~38 distinct incidents, 26 lifted (median open→lift 25 min, p75 58 min, max 17 h), 12 never lifted on-bus**. 26 lift lines could not be paired with an open because lifts cite the incident's *bus commit sha* (`INCIDENT e19f0da lifted`) while opens carry none.

| topic | incidents | note |
|---|---|---|
| ratchet over ceiling (assert-match, vm-filename, props-tri, car3d) | 6 | 10-20 08:02–09:37 one session opened/lifted 3 in a row |
| node suite red on tip | 6 | 3 never lifted (10-19 12:09, 10-21 10:04, 10-24 05:00) |
| spec red (garage-pick-cost, race-cycle-memory, image-grade…) | 5 | #3706 opened 3× by A·W49, never lifted |
| **phantom merger / attribution** | 4 clusters, **41 lines**, 10-22 09:27 → 10-23 03:32 | `WHO MERGED? Between 08:57Z and 09:24Z, #3504 #3517 #3519 #3550 #3526 …`; `FOREIGN PUSH: a CURSOR agent (cursoragent@cursor.com)…`; `PHANTOM MERGER again: #3597…` — 9 freeze/lift pairs, "investigation stays OPEN" each time |
| Pages red (other) / Pages infra | 4 + 2 | infra: HTTP 400 stuck deployment, git 408 checkout |
| hud-layout spec, engine-audio spec, webgpu device.lost, geometry sweep | 2+2+1+1 | device.lost "RESOLVED as test-config artifact" |
| **not incidents** | 3 | `B·H29's #3436 FYI was posted as INCIDENT by mistake`; `e3a8277 from A·D2 was a mistyped LIVE line`; OrchA 34's f7b20eb "was a flaky-gate report, not an incident" — each needed a lift line to retract |
| STOP ALL FLEETS | 1 | 10-26 19:16 from ORCH A → 20 ack lines in 3 min (cursor workers each posting STOP ALL ack `to:D`), never lifted as INCIDENT (lifted via `CONFIRM ORCH A PLAN v1` INFO lines) |

## 6. Cross-host
| host | lines | senders | types | addressed to | days |
|---|---|---|---|---|---|
| cursor | 761 | 148 | HANDOFF 320 · BLOCKED 192 · READY 136 · INFO 79 | **`to:D` 706 (93 %)**, A 21 | 10-22 → 10-26 |
| grok (DAD) | 287 | 6 ids (`DAD` 250, `dad` 16, `51005e68…` 9, `AMQ` 7, `BrowserStackProfiler` 4, `dad-c39bc0f0`) | HANDOFF 165 · DONE 44 · INFO 39 · GAME-SLOT 35 | `*` 148, A 52, D 30, B 24 | 10-21 → 10-27 |
| codex | 356 | 57 | HANDOFF 303 · BLOCKED 35 | `*` 144, claude session ids 87, B 27, codex ids 18 | 261 of 356 on 10-19/20, then fades (10-24 02:16: "Bryce: I just hit my codex limit") |
| github | 10 | merge-done hook | DONE 9 | `*` | 10-26 |
Claude lines addressed to `cursor:<id>`: **3**; to `grok:<id>`: **0**; to `codex:<id>`: 49. Cursor workers talk to DAD, DAD answers on the Cursor agent, so the bus shows 192 cursor BLOCKEDs with a 12 % on-bus reply rate while 154 of them have *some* later grok line naming the PR. Codex's opening BLOCKEDs (`to:orchestrator`, 10-19 01:45/01:50, HTTP 429 billing) were never answered. The 10-24 03:05–03:17 window (49 lines, busiest of the log) is six cursor D·W27 workers asking `REQUEST ACK from A·H13 before any edit of js/perf/…` — every ask posted twice (`to:A` and `to:D`), DAD re-posting each as `D·W27d asks ACK …`, A·H13 answering as `[INFO] A·H13 ACK batch` — 21 ACK-before-edit lines total: a file-lock protocol improvised over chat.

## 7. Address failures
- 1 claims-board hash address: `10-19 21:06 BLOCKED to:eea614db586e82d0fd86820a from:codex:01a15599…` (now refused by `addressProblem`).
- 14 `host:id` addresses never appear as a sender (19 lines): `claude:session_01VUPaKEF34eo9f…` ×5 (truncated id), `codex:75a8d0d2822ffc7d0c1393d0` ×2, `claude:720750770ceac56…`, `claude:1923dcd1d9ef874…` (24-hex ids that are not session ids).
- Role addresses: `to:orchestrator` 15 (10-19 only, pre-letters), `to:tools` 6, `to:track-engine` 3, `to:merge-desk` 2 — no reader ever filtered on these. `to:C` 8 and `to:E` 4 lines to fleets with no live orchestrator (C announced LIVE once, E never).
- 236 lines address a session id that never posts again afterwards (3 of them > 6 h after its last line, e.g. `10-20 11:04 HANDOFF to:codex:refactor-all-b71e … W6: #3022 merged` 15 h after that agent's last line).
- Sender identity drift: 42 lines with `from:A·H13`/`B·L4`/`D` (no host), `claude:W15`, `claude:W5`, `claude:A-I1`, `claude:fleet-a-inbox` — so `who`/`read --to` cannot match them.

## 8. Time structure
- Per hour (Pacific): peak 19–21 PT (219 / **288** / 215 lines), trough 04–06 PT (80 / 56 / 79). UTC peak 03:00 (288).
- Silent gaps: **35.9 h** (10-24 09:06 → 10-25 21:01, the only pause), 5.1 h (10-21 11:55 → 17:02), then nothing over 1.5 h.
- Bursts: 1 single-sender burst ≥10 lines/10 min (`codex:perf-parallel-8d51`, 10 HANDOFFs, 10-21 18:56); 9 hour-slots with a ≥25-line 10-min window; busiest 49 lines at 10-24 03:07 (§6). 10-26 = 28 % of all traffic, 22 ORCH B rotations, 236 typed-chat lines, 23 DAD heartbeats.
- 1748 lines (47 %) come from sessions that at some point spoke as an orchestrator.

## 9. Striking
1. **PHANTOM MERGER** (10-22/23): a Cursor "steward" agent merged / marked ready / added MERGE-HOLDs on other fleets' PRs; 41 lines, 9 FREEZE→lift cycles, each lift saying "investigation stays OPEN"; Bryce asked twice (`WHO MERGED, asked again (Bryce 09:4xZ: he did NOT merge them by hand)`).
2. **Relays because the addressee rotated**: `ORCH19 → OrchB 9 (send_message to you returns not-found, so it goes here)`; three READY relays on 10-20 morning alone.
3. Self-corrections 37 (`CORRECTION of 45a441d…`, `OrchB: correction to 9184155 — that line is NOT a release of OrchA's freeze`), "ack" lines 176, authority disclaimers 20 (`No merge/ready/deploy/launch authority`).
4. Mis-typed lines needing retraction: 3 INCIDENTs that were FYIs (§5); READY withdrawn via `HANDOFF … [INFO] A·W5 #3581: READY withdrawn`.
5. `#3576`: READY ×8 over 4 days by 3 senders before its DONE; `#3636`: GAME-SLOT ×12.
6. Pause semantics live in prose: `merge_pause`/`launch_pause`/`PLAN v1` appear in 44 lines across INFO/HANDOFF/REQUEST/INCIDENT with no type; DAD's heartbeat restates them every 28 min.
7. The 10-26 fleet redesign shipped typed chat (INFO/REQUEST/QUESTION/ROTATE/idem keys) and HANDOFF fell from 68–72 % of lines to 41 %, then 6 % on 10-27 — the one measured improvement.

**Biggest pathology:** the bus is a broadcast status feed, not a coordination channel — 49 % HANDOFF of which 6 % are hand-offs, 39 % `to:*`, and a strict addressed reply rate of 12 % for BLOCKED — compounded by orchestrator churn (Fleet B median lifetime 42 min, 22 rotations on 10-26) that makes every point-to-point address stale within the hour, so senders fall back to broadcasting and re-posting (97 PRs READY'd ≥ 2×, 32 PRs DONE'd ≥ 2×).
