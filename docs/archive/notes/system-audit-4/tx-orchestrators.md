# Slice: every orchestrator + seed session since 10-19 (fourth pass, 2026-10-26 ~17:20Z)
Inputs: 38 Fleet B orchestrator sessions + 2 seeds from sessions-p1/p2.json (no Fleet A, Merge Desk or other-fleet orchestrator is on this account: `get_session session_01FYKKz1…` (OrchA 36) → not found); bus-full.txt; pass-3 pages for O1/q16/q15/seed.
Ran: `list_events` kinds user/assistant/result on all 40 (newest page each, plus O2 p2), parsed with my own script + `session-transcript.mjs`; result-event `total_cost_usd` (cumulative); bus DONE/HANDOFF/LIVE parse; `git merge-base` to date when each rule reached the tip. Ledger: `scratch/sysaudit4/tx-orch/ledger.csv` (40 rows), `analysis.json`, pages `tx-orch/<label>-p*.txt`.

## Ledger summary (B; the full row per session is in ledger.csv)
| era (boot window) | n | cost | median life (boot→hand-off) | $/h alive | ctx at hand-off | merges | launches | $/merge | $/wake |
|---|---|---|---|---|---|---|---|---|---|
| E0 10-19..10-22 (O9–O26) | 18 | $462 | 26 min | $9.4 | 143–231k when stated; finals to 762k | 103 | 86 | $4.5 | ~$0.2–0.5 |
| E1 10-25 23:05 → 09:28Z, before #3785 (O-fresh, O-next, q1–q13) | 15 | $91.6 | 40 min | $9.1 | 156–226k (median 197k: the brief's "boot + 100k") | 14 | 41 | $6.5 | ≤$0.22–0.47 (median 0.29) |
| E2 #3785 on tip → 14:40 (q14, q15, q16) | 3 | $31.8 | 53 min (q15: 238) | $6.2 | q14 195k, q15 **314k**, q16 restart | 5 | 10 | $6.4 | q15 $0.33 (13:11–14:30) |
| E3 after the 14:57 message and #3811 (O1, O2) | 2 | $14.1 | 113 min (O1); O2 alive 37+ min | $5.9 | O1 ~270k (final 291k) | 4 | 12 | $3.5 | O1 $0.24; O2 $0.16 |
| seeds: 01Qv3Hq (iOS, Sonnet, 10-19→10-26 14:30) / 01KLkpS (Sonnet, 14:37→) | 2 | $24.95 / $1.02 | 158 h / idle | — | 593k / 142k | 0 | 33 / 2 | — | $0.76 / $0.51 per launch |
E0's three uncapped sessions (O23 $93 over 7.3 h, O24 $139 over 9.8 h ending at 762k ctx, O26 $102 over 22 h) are $334 = 72 % of E0. All B since 10-25 23:05: 21 sessions, $138.5, 22 merges.

## Answers
**1. Per-wake cost and lifetime at each fix.**
- **#3785 (09:28Z)** put the 300k cap, "no tick" and "no PR subscription" rules on the tip. Median life went from 40 to 53 min and $/h from $9.1 to $6.2. q15 lived 238 min, but it booted from the queue branch, overran to 314k, subscribed to #3795 (13:35:25) and ran a 47-turn hour. Per-wake did not drop: $0.33 in q15's window against an E1 median of ≤$0.29.
- **The 14:57Z message** changed O1 (pass 3, confirmed here): $0.46 → $0.24 per wake, 9.8 → 2.8 tool calls per wake, no sibling `get_session`.
- **#3811 (16:20Z)**: O1's last 8 wakes cost $0.29 each (the hand-off turn included). O2 measured $0.16/wake over 3 turns and $4.59 for its first 37 min. Its 17:08 turn (an AskUserQuestion, a launch and 7 messages) cost $4.11 cumulative at 17:09:47.
- Net: lifetime is up about 3× since E1 (40 → 113 min) and $/h is down about 35 %. The per-wake floor is ~$0.10 at ~220k context (q12 08:42 $0.097, q14 10:17 $0.107).

**2. Largest cost class now: rotation (boot + hand-off).**
- Boot turn: O1 14:44:45 $1.52 (26 steps); q16 14:26:22 $1.92 (41 steps).
- Outgoing tail after SPAWN: $0.38–1.05 (q15: $3.38 over 9 turns).
- 18 B rotations on 10-26 come to ≈ $40–47 of $138 (~30 %).
- In O1 alone: Bryce-prompted turns $3.23 (34 %), boot + hand-off $2.57 (27 %), routine wakes $3.05, duplicate/no-op wakes $0.71 (7 %).
- One rotation costs as much as 12–24 wakes at 220–400k context, so at today's rates a later hand-off is cheaper.

**3. Rules still broken.** See the findings below (F1, F3–F7), each with session, time and the rule's home.

**4. Questions Bryce got that the rules already answered (quoted).**
- q11 07:39:12: "…That leaves 8 that are idle and finished or handed off. Which should I archive?" `fleet-core.md` "Archive by `node fleet-archive.mjs" already answers this; the tool's own header cites "may I archive?" as the question it retires.
- q15 13:37:31: "…each still carries a MERGE-HOLD left by Fleet C's worker. The conditions that hold set … are now met. Only you can lift a MERGE-HOLD." `fleet-core.md`: a hold a worker wrote may be lifted by its writer, Bryce, or the orchestrator.
- seed2 14:39:03: "May the orchestrator launch worker sessions while the seven_day limit is at allowed_warning?" Bryce had already answered "launch freely" at 14:24 (pass 3 T1). Root cause: F1.
- Legitimate questions: q15 13:56:52 (a merge the gate refuses), seed 14:16:33 (Bryce had said stand down), O2 17:08:19 (PR trains, a new mechanism).

**5. Fleet A vs B (bus only; A runs on another account).**
- A: 13 LIVE orchestrators (OrchA22–36) from 10-22 07:58 to 10-26 16:55, median life ~4.9 h (0.9–49 h), 2–17 merges each.
- On 10-26, A used 4 orchestrators (33–36) for 21 merges. B used 18 for 22 merges.
- A rotates on "context soft cap" or when Bryce asks (bus 80599c9c4, 16:54Z). B rotated on the brief's "boot + 100k" until 09:28Z.
- A's cost cannot be read from here.

## Clean (checked, fine)
- O1 and O2 made no sibling `get_session` after 14:57Z, and no orchestrator subscribed to a PR after q15 13:35:25.
- O1 used the safety net as written: `send_later 53` at 14:41:25 and 15:37:48, and one account-wide FLEET BUS WATCH (`create_trigger` hourly with `new=True`, 14:48:38). It was never duplicated.
- O2 applied `fleet-archive.mjs` (17:09:56, "0 archive, 40 keep") and refused a premature self-archive request. That is the first orchestrator run of the tool on these pages.
- In O1, q16 and O2, every merge was preceded by `merge-gate.mjs --pr N` with its log captured. Every non-Bryce merge carried a DONE line.
- The Sonnet seed costs $0.51 per launch, against $0.76 for the 158-hour Bryce-opened seed. It confirms each child with `get_session`, which role-seed.md:49 asks for.
- Every E1 hand-off stayed under its cap. q15 (314k) is the only overrun since 09:28Z.

## Findings
| id | finding | evidence | cost to Bryce | one-line fix | conf | status |
|---|---|---|---|---|---|---|
| F1 | The rulebook says "at `allowed_warning` launch nothing" in two homes, but AGENTS.md says "launches sessions (the quota gate wins)" and Bryce keeps granting launches. Every launch during the warning week therefore turns into a Bryce question, or into a hand-written "allowed" receipt. | launch-policy.md:18, role-seed.md:43–44. The seed's 10:17:55 note told q15 to "launch no workers without asking Bryce"; seed asks at 14:16:33 and seed2 at 14:39:03; O1 wrote receipts by hand (pass 3 T2); **O2 17:08:53** `cat > artifacts/logs/gs-self.json <<'EOF'` right after the gate refused a 374-s-old page. | ≥5 Bryce round trips today; forged-receipt risk | Make the gate refusal-only (`rejected`/overage) and record warning launches; or put Bryce's standing grant with a weekly launch budget in launch-policy.md | high | STILL OPEN (T1, T2, pass3 #1) + NEW root cause |
| F2 | Rotation is the largest overhead class: 18 B orchestrators on 10-26 against A's 4 for the same merge count. | Boot $1.52/$1.92 (above); tails $0.38–3.38 (o14, ofresh, q1, q10, q15, o1); 21 vs 22 merges by bus DONE | ~$40–47/day, plus Bryce re-briefing at each restart (q16 14:31–14:37) | Hand off by cost, not tokens: keep the session while (ctx − boot) × wakes/h stays under one rotation (≈$2.4); try the compaction pilot (launch-policy.md:84) or a 450k cap | med | NEW (measured) |
| F3 | A per-session hourly cron was created after #3785 had retired it. | q16 14:21:11 `create_trigger cron "0 * * * *"` "OrchB hourly safety net". Earlier crons: q12 07:38 (38 * * * *), q14 09:26:44 (26 * * * *), both "check get_session used_tokens". Home: orchestrator.md §First acts 3–4 ("no per-session cron of any kind") | ~1 wasted wake/h each ($0.10–0.25) | PreToolUse hook: refuse `create_trigger` with `persistent_session_id` in a role:orchestrator session | high | NEW |
| F4 | Orchestrators archive with `archive_session` directly, not with `fleet-archive.mjs`, and ask Bryce instead. | 26 direct calls: q3 03:02:48 (×6, incl. relay 015dWW), q7 04:23:53, q11 07:40:10 (×4, after asking), q16 14:28:58–14:31:44 (×15, incl. the Bryce-opened iOS seed 01Qv3Hq at 14:30:22). Home: fleet-core.md "Archive by …fleet-archive.mjs; never a session Bryce opened" | 1 Bryce question; a Bryce-opened seed archived (he had asked "cleanup all") | Hook: `archive_session` in role:orchestrator requires a fresh fleet-archive receipt naming that id | high | NEW |
| F5 | orchestrator.md contradicts itself on `get_session`. | :39 "Never `get_session` a worker you launched", but :156 "`get_session` on any session before assigning it a PR" and :159 "read `get_session` … for every roster id first". Breaks: q15 13:27:37, O1 14:48:56 (×3), o21/o25 hand-offs | ~10k tokens per call (orchestrator.md:40) | Rewrite :156/:159 to read `list_sessions` + `session-transcript --summary` | high | NEW |
| F6 | Hand-rolled sleeps and the chained `git add && git commit` continue across the population. | Sleeps: O1 14:43:30, 14:47:18, 16:34:45; seed2 14:40:21 `sleep 45`. Chains: 8 of 40 sessions (o14 03:15:30, o20 06:10:21, ofresh 23:12:59, q1 00:45:40, q7 04:22:46, q10 06:19:59, q15 14:13:32, o1 16:33:00). Homes: AGENTS.md rule 4 / fleet-core "never poll in a shell loop"; rule 12 | ~$0.3/h; prose drift | `wait-for --bus-who`; settle rule 12 one way (pass 3 T4/T9) | high | STILL OPEN (T4, T9) |
| F7 | Questions and requests go out on the bus as HANDOFF. | 12 `[QUESTION]`/`[REQUEST]` HANDOFF lines from B orchestrators, e.g. ofresh a235d9dc1 23:10:52, q12 1b2b7bfbb 08:21:48, q15 eed731bce 13:30:54…71ac92af0 13:37:01. Home: fleet-bus types | Filters miss them; the HANDOFF channel is noisy | The refuser rejects a `[QUESTION]`/`[REQUEST]` prefix under HANDOFF | high | STILL OPEN (pass3 bus 1) |
| F8 | The Bryce-opened seed ran 6.5 days to 593k context, so every wake re-read ~590k. | 01Qv3Hq $24.95 for 33 launches; final ask at 14:16:33 | ~$0.25 more per launch than the Sonnet seed | The seed hands itself off at 200k like any role; the seed2 pattern is already right | med | NEW |

## Not done
- **Transcript coverage.** I read complete transcripts only for O1, q16 and seed2 (pass-3 pages), q15 13:11–14:30 and O2 17:07–17:11. For the other 35 sessions I read the newest 100 events only. Turn and tool counts there are lower bounds, and per-wake figures are upper bounds.
- **Inline pages.** Five page-1 results came back inline and could not be saved as files (O18, O19, O-next, q12, q14). Their numbers are recorded in `tx-orch/inline-notes.txt`.
- **Fleet A.** A's sessions are not readable from this account, so A's costs, turns and Bryce prompts are unknown and the comparison is bus-only. I did not use `FLEET_A_OAUTH_TOKEN`.
- **Out of scope.** The relay sessions (R2) and the iOS "New session" and "Cursor SDK" sessions are not in this slice.
- **Wasted-turn classes not counted population-wide:** duplicate events, Monitor re-arms and queue re-reads (pass 3 T5 has the O1 numbers).
