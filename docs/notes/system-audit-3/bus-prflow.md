# Fleet bus + PR flow — third pass (read-only, 2026-10-26 16:45Z, tip b07a5ac6f)
Inputs: bus-800.txt (25 06:29Z→26 16:31Z; note the dump is "800 new since cursor", `--last` was ignored) + 9 lines peeked
since e57bda1 (to 16:37Z); merges-24h.txt (74 PR merges, 59 branch-sync merges); claims.txt; pr-board.txt; GitHub REST
(46 open PRs, pages.yml runs); `fleet-owner.mjs --no-fetch` on #3802 and #3751 diffs; `handoffMisuse()` from the tip
replayed over all 440 HANDOFF bodies. Scripts in my scratchpad; nothing tracked was edited.

## Measurements
- Bus types (800): HANDOFF 440, READY 109, DONE 85, GAME-SLOT 71, BLOCKED 50, INFO 18, GREEN 12, INCIDENT 10, QUESTION 3,
  REQUEST 2. Senders: claude 489, cursor 148 (35 ids), grok 142 (DAD 135, AMQ 7), codex 17, github:merge-done 3.
- After #3811 merged (16:20Z) there are only 21 lines (12 in the dump + 9 peeked): HANDOFF 7, BLOCKED 6, READY 3, INFO 2,
  ROTATE 1 (first ever, 5154298), GAME-SLOT 1, DONE 1. LEND 0. No refusal is visible, but three HANDOFFs the tip would
  refuse or should refuse got through (see F1/F2).
- Replaying the tip's `handoffMisuse` over the 440 historic HANDOFFs: 198 would now be refused (INFO 92, ROTATE 41,
  LEND 36, REQUEST 15, QUESTION 14) and 242 still pass, including 60 worker `LIVE D·Wxx …` status lines, 16 SPAWN lines,
  `ORCH B DORMANT`, `[FROM FLEET X via inbox]` relays, `DF CLAIM/RELEASE`, and `#3700 [QUESTION]` (the `^\[` anchor misses it).
- Duplicates: DONE twice for #3702, #3771, #3784 (the last two are hook first, then ORCH B, both before #3811). READY
  ≥2× for 26 PRs (#3576 ×4, #3800 ×4, one per tip-sync head; #3814 twice within one minute, 5770d5a + 413aa6a).
- Merge flow (74 merges/24 h, every one got a DONE, median merge→DONE 0 min): first READY→merge is 203 min median for game
  PRs (p90 939, n=30) and 17 min for non-game PRs (p90 54, n=21). For the 22 merges after 09:28Z the median is 341 min.
  DAD merged 26, A orchestrators 22, B orchestrators 15, other sessions 9, hook only 2. Merge→Pages-live (first green
  pages.yml run whose head contains the merge): game median 19 min (p90 34, max 117), non-game 25. No bus line marks
  Pages green: GREEN (12) is only ever used for PR CI, so DONE→Pages cannot be read from the bus.
- Bryce: #3784 is the only merge with no session DONE before the hook ("presumed Bryce UI merge"). 16/74 merges carry no
  `Merged-by:` trailer, but 15 of those had a session DONE, so the trailer gap is the sessions', not Bryce's. 62 bus
  lines quote a Bryce grant with a PT time; 29 of them are DAD relays.
- Open PRs: 46 (pr-board saw 41; #3743 is stacked on a non-deploy base and is invisible to it). 17 PRs carry a malformed
  `MERGE-HOLD:` (no lift:/until:); 13 of them read "MERGE-HOLD: DAD merges (do not remove)". Ready + clean + green and
  still open: #3700 (62 h), #3725 (61 h), #3731 (60 h), #3751 (17 h), #3765, #3768, #3782 (12–15 h), #3816, #3730 (slot).
- `fleet-bus who`: A live (13:41Z), B live (16:35Z); C, D, E, H none. D (DAD) is the busiest fleet (260 lines to:D,
  26 merges) yet has no `ORCH D LIVE` line, so every "resolve: fleet-bus.mjs who <X>" fails for D.
- Claims: 100 rows, 57 STALE (>120 min); 25 rows name 20 PRs merged in the window and were never released; 37 rows are
  recorded on the deploy branch name (Cursor agents claim from `claude/f1-game-project-26h3ng`); 12 claim the generated
  `tools/shot/scenery-locations.json`. fleet-owner now prints GENERATED for it, so #3811's fix works (#3802: 5 held,
  6 generated).
- BLOCKED today: 46. They waited on: the held scenery-locations.json or a LEND for it, 22 (14:21–15:18Z, 11 workers);
  DAD's "RULE 7.3" Pages window, 8; ratchet/assertPins, 6; `run-ci` label 403, 3; NEEDS-DECISION, 3; already fixed on
  tip, 2. Asks answered within 30 min: Cursor 28/43, DAD 6/12.

## Findings
| id | what is wrong | evidence | cost to Bryce | one-line fix | conf | status |
|---|---|---|---|---|---|---|
| F1 | Running sessions keep the tool version they booted with. A fleet-bus fix does not reach the seed, the orchestrators or the Cursor workers until they pull | 16:34Z dc731ab `SEED B SPAWNED` sent as HANDOFF by seed 01KLkpSQ, 14 min after #3811 (the tip refuses that body: handoffMisuse→INFO) | every tooling fix lags by a session lifetime (seed: 2 h+), and an audit can't measure its own fix | fleet-bus/agent-msg read `git rev-parse origin/<deploy>:fleet-bus.mjs and warn or refuse when the local blob differs; or the seed runs tools via `git worktree` of the tip | high | NEW |
| F2 | DAD tells workers to `send LIVE`, but LIVE is not a bus type, so 23 of 26 worker status lines since then went out as HANDOFF, and the tip's classifier lets `LIVE D·Wxx` through | DAD eb91b74 15:18Z, 9399c2a, 9220d2e, 01b8f8f 16:27Z (same correction ×5); TYPES at fleet-bus.mjs:76 has no LIVE; replay: 60 `LIVE …` HANDOFFs pass | HANDOFF filters still wake on worker chatter, and DAD spends a line every ~20 min re-teaching | add `^LIVE\b` and `DORMANT`, `SPAWN … ORCH` (→ROTATE/INFO) to handoffMisuse; either accept `LIVE` as an alias of INFO or tell DAD the real verb | high | NEW (gap in #3811 fix) |
| F3 | handoffMisuse's LEND rule (`\b(lend\|lent)\b`) refuses real hand-offs and coordination that only mention a lent PR | replay: 36 →LEND, about 6 actual lends; f2741bf (a genuine ORCH B SPAWN hand-off) and ec0b887/d3e283b would be refused and need `merger:` | an orchestrator's successor hand-off is bounced at size-stop, its worst moment | match LEND only when the body starts with lend/LEND or carries `merger:`; never refuse a body starting `SPAWN` | high | NEW |
| F4 | `MERGE-HOLD: DAD merges` is still used as an ownership label, and the gates still test presence only | 13 open D PRs (#3802–#3818); #3800's well-formed version is `lift: DAD \| until: merge by DAD`; merge-gate.mjs:337 `hasMergeHold` | DAD must hand-strip each hold before every merge; any other merger is vetoed; 17 malformed holds total | merge-gate/ready-gate reject a hold without `lift:`+`until:`; route the merger via the fleet block `merger:` | high | STILL OPEN (audit-2 F7) |
| F5 | Fleet D has no resolvable orchestrator, and neither do C, E or H, while their PR bodies still name them | `who D/C/E/H` → none; #3763 fleet E, #3783 H, #3788 C, but B launched owners at 16:16Z (fleet-claims B-pr3763/3783/3788); #3700's worker is `claude:A-owner (D-lent)`, not an id | READY via `who` fails for D's 260-line lane; orphan bodies mislead pr-board (FL column E/H/C) | DAD posts `ROTATE ORCH D LIVE grok:DAD` once a session (or `who` accepts `HB D LIVE`); adoption rewrites the body fleet block | high | STILL OPEN (audit-2 #4, D part NEW) |
| F6 | Game PRs wait hours from READY to merge, and it got worse after #3785 | game READY→merge median 203 min, p90 939; after 09:28Z 341 min (n=22); #3646 684, #3724 938, #3648 751; 3 ready+clean+green PRs >60 h (#3700 #3725 #3731) | ~9 ready PRs idle; #3725/#3731 are "D-lent game" (bus b411b6d) but the body says fleet A and the A owner claim is 13 h STALE: nobody owns the merge | pr-board ARM/merge list per merger; a lent PR's body names its merger; `pr-board --alarm` on >12 h ready+green | high | STILL OPEN (audit-2 #4/#10) |
| F7 | The merge-time ratchet union traps PRs: neither side is over the ceiling, but the merge is | #3763 0f3bf7c 16:23Z (8437>8420, PR 8413); #3700 OrchA f41dcb0 15:43Z (8424>8420, merge-gate refuses) | #3700 is ready+green and blocked 62 h; #3763 is blocked on Bryce's typed word | sync-pr/merge-gate print the per-side delta and the pins the tip added; the ratchet compares the PR's own delta against the tip | med | NEW framing (audit-2 F7/F14 covered the doors) |
| F8 | DAD's "RULE 7.3" (hold draft→ready/run-ci while Pages runs ≥10 min) exists nowhere in the repo, and workers file each wait as BLOCKED | 8 BLOCKED lines (452a702 04:16Z … f829bda 16:35Z); grep finds no rule 7.3; the AGENTS.md rule says a wait is a Plan item | 8 false BLOCKED wakes for D, plus ready flips delayed 10–30 min each | write the rule into fleet-core (or drop it), and post waits as INFO / a Plan item | med | NEW |
| F9 | Relayed Bryce grants are honoured inconsistently: lends relayed by DAD were acted on, a ratchet raise relayed by DAD was refused | 240cd1e / 97fbfa0 "Bryce yes (DAD)" → B acted (f23b794, 71b14bd); a204c60 16:25Z "relayed 'Raise limit' not acted on" | Bryce types twice; #3763 blocked until he finds the owner session | a per-grant table in authority.md: what a DAD relay may grant (lend, merge order) vs what needs typed words (ratchet, hold lift) | med | NEW |
| F10 | Claims never get released at merge, and Cursor claims are keyed on the deploy branch | 25 claim rows on 20 merged PRs; 57/100 STALE; 37 rows `f1-game-project-26h3ng-<session>` | who-is-on-it prints 100 rows, 57 of them noise; a deploy-branch claim reads as "someone is on the tip" | merge-done.mjs releases claims naming the merged PR or branch; claims reject the deploy branch as a key | high | NEW |
| F11 | READY re-sends per sync head, and same-head duplicates | #3800 READY ×4 (one per tip-sync), #3814 5770d5a+413aa6a same head 1 min apart (pre-#3811); auto-idem keys on sha so per-head resends remain | each re-READY wakes D's merger | READY after a clean-behind tip-sync is not needed (no sync for clean-behind); refuse READY when the PR's last READY head is an ancestor and the diff only adds a tip merge | med | STILL OPEN (audit-2 #11, partly fixed) |
| F12 | #3743 (18 h, stacked on cursor/astra-deep-hunt-r5-1024) and #3798 (ready, DIRTY, no fleet block, 3/4 Plan) have no owner | REST open list; pr-board filters base, so #3743 never appears | a silent orphan; #3798's purpose (unblock Pages after #3766) is moot since Pages is green | pr-board lists non-deploy-base PRs; close or adopt #3798 | med | #3798 STILL OPEN, #3743 NEW |

Fixed since audit 2 and verified: generated paths print GENERATED (fleet-owner on #3802/#3751); no non-session `--as`
ids since 12:00Z (all claude ids resolve against sessions-page, or are Fleet A's other account); the first ROTATE
appeared; ORCH B's last tenure was 114 min (01M5i67, 14:41–16:35Z) against ~45–60 before. But 01Nr lasted 20 min.
