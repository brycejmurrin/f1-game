# Fleet A transcript audit, 2026-10-24 → 2026-10-26

Reviewer A·R2 (`claude:session_016jTZC5nB2TPhJvvbLjnkyx`), launched by OrchA 33
(`claude:session_014ehnzVXXXbXpmaNrA6VWSP`) on Bryce's ask, typed in OrchA 33's
session 2026-10-25 ~20:30 PT: "Spawn a session to deeply read Claude fleet a
chats and transcripts to find issues or ways to help agents or our roles or
skills or anything". Findings only: nothing under `.claude/**` is changed here.
§Proposed diffs holds the exact text for OrchA 33 to put to Bryce.

## Method

- **Session index.** I saved one `list_sessions` page (`mine: true`,
  `limit: 100`, about 274k characters) to a file and parsed it with
  `python3 -I`. A second inline page of 10 covered the newest sessions. Fleet
  A from 10-23 19:00Z on is 44 sessions; the 37 opened from 10-24 on cost
  **$693** in total (19 Opus, 15 Sonnet, 3 Fable).
- **Bus.** `fleet-bus.mjs read --last 300 --json` covers 10-24 05:18Z →
  10-26 03:35Z. I parsed it offline: types, recipients, empty lines, and
  READY→DONE latency per PR.
- **Transcripts.** Two read-only subagents each saved `list_events` pages
  (`limit: 100`, no `kinds` filter) and digested them with
  `tools/ci/session-transcript.mjs` (`--summary`, `--only errors|turns`,
  `--grep`). This follows `agent-fleet/references/transcripts.md`. Digests:
  `scratch/fleet-a-audit/b1/`, `b2/` (not committed).
  - b1 (11 sessions): OrchA 31 `session_01HSfCWDrTnZEjnSMscphs89`, OrchA 32
    `session_015RjYfV7nHwhiepaqQbUuAk`, OrchA 33 (live, read only), A·R1 ×4
    (`session_017fKpag1PXzu9mBReqtPg6X`, `session_01Ko7XWVUWU32sMVXhewTxGS`,
    `session_01Gw61XfuKqRA4hXbgMNVmwy`, `session_01St33K2h8cqFdWeWY1LMgLg`),
    A·T1 `session_016wPTxszmxyxxXKN8Y5Qsvn`, A·T2
    `session_01BSSzUj5tzNK8ykJk433Z9W`, A·W57
    `session_017S4fYMhEPQgVZHizeFJHpL`, Sync `session_011eKSAUfi58o6oKPi3LoufQ`.
  - b2 (15 sessions): W50 `session_012FhNfs9XvpJUo6FvCgvKkc`, H10
    `session_012GHn3wz5viqzGibR47ZZ46`, W49 `session_01QGxJ2kociCLUhUAqyFpbBN`,
    W47 `session_01XdBTxDAyVk2nZfvkq8DC89`, H11 `session_01JKD3dJUji4edJToFC9tgkg`,
    H13 `session_01TcuHBHRjWo1arKJHxV8PB7`, H12 `session_01JhStx9KqDDME3kqNRDruuh`,
    H18 `session_01CNJA8ECFcTzYvXV1DN5bta`, H16 `session_01MwXqyCfiZQNegsZamsCctB`,
    W45 `session_0142jEDWuu4rWGUB15jEoNgP`, owner #3692
    `session_017zgWpzsTWD3NsqabEPiv8C`, O4 `session_011uRMn29iFsyJLCBq2JZxTE`,
    O3 `session_01ELQk4QJzRyBREZxyMrvP7b`, W56 `session_01MrkRrPzuR87WyjAxEzHe4E`,
    owner #3700 `session_01LSsK2pE8uiPTU5gbMtpNdz` (live, read only).
- **Coverage limit.** 100 events cover 10–30 minutes of a big session, and
  the pages run 0.2–1.0M characters. So the digests show each session's tail
  (hand-off and idle phase) and the middle of the expensive runs is unread.
  `post_turn_summary` and the index's usage figures fill some of that gap.
  Each row is marked **C** (I re-checked it in a digest, the bus or the code)
  or **P** (one subagent's reading, with event ids, not re-checked).
- **Not repeated** (prior audits): short and echo wakes and redundant
  `ReadNotifications` (CLAUDE-TRANSCRIPT-MINING-2026-10-19 #1–3); typed bus
  verbs, the train, and attribution (ORCHESTRATION-AUDIT-A-B-2026-10-22 #1,
  2, 4); the Stop-hook nag (AGENT-RETRO-2026-10-17 #4,
  STOP-HOOK-H1-BRYCE-2026-10-18); and the cross-account inbox, the
  orchestrator.md hand-off contradiction and the LIVE-line pitfall
  (CROSS-ACCOUNT-INBOX-2026-10-25). Where they recur here, the rows below
  quantify them and are marked KNOWN.

## Headline

Most of the rules that would have prevented the losses below already exist in
prose. They were not followed, because nothing enforces them. Examples: the
context soft cap (orchestrator.md item 12), the quota gate (orchestrator.md
§Pre-launch quota check), and "the check-in stops at READY" (role-pr-owner.md
step 3). The highest-value fixes are therefore mechanical: a hook or tool that
measures and refuses. More prose would not help. The one exception is
AskUserQuestion, which no rule covers today and which cost the most wall time.

## Ranked findings

Cost is the session's own `usage.cost_usd` or a delta between turns. Size: S
≤ ½ day, M ≤ 2 days, L more.

| # | Finding | Evidence (session · event) | Cost / time | Fix | Where | Size | |
|---|---|---|---|---|---|---|---|
| 1 | **AskUserQuestion parks a fleet session until Bryce answers, and every tick, message and merge queues behind it.** OrchA 32 asked at ~07:19Z 10-24 and got the answer at 22:47Z 10-25. It then said "Almost a day has passed… Re-reading the whole board" and told a worker "your 06:49Z message only reached me now". The bus has no line at all from 09:06Z 10-24 to 22:51Z 10-25 (37.8 h). PRs that were already READY waited 40 h for DONE: #3706 2 592 min, #3741 2 426, #3718 2 404, #3713 2 378. W47, a worker, asked Bryce the same #3719 question 3 times in ~3 h (04:08, 05:57, 06:59Z) and sat "Waiting on permission: AskUserQuestion". | `session_015RjYfV7nHwhiepaqQbUuAk` f2447f84, dc771415, 22:48:32 SAY; `session_01XdBTxDAyVk2nZfvkq8DC89` 35ab065c, 2189fb1e, 03287be8 | 15.5 h orchestrator stall; 4 PRs +40 h to merge | Workers and owners never call AskUserQuestion: they send QUESTION to the orchestrator. The orchestrator calls it only when the fleet has nothing else to do, and arms nothing that depends on the answer. Otherwise it asks in its reply text and keeps ticking. **Bryce's call**: memory `ask-via-askuserquestion` says he wants AskUserQuestion. | worker.md §Escalate, orchestrator.md, memory note | S | C |
| 2 | **No size cap is enforced, and four different caps are in circulation.** launch-policy says 150k for workers and 200k for orchestrators. Lane prompts said 300k/$25 (b1) or 400k/$45 (W50, H18). This audit's own brief says 200k. Final contexts: OrchA 31/32/33 624k/651k/712k; W50 771k, W47 720k, W49 700k, H10 680k, H11 589k, H12 561k, H18 550k, H16 497k, W45 495k, H13 490k. All three orchestrators handed off only when Bryce said so ("Have them all handoff", "Let's handoff"). Autocompact sits at ~784k of 980k, so nothing forces a stop earlier. | index usage; `session_01HSfCWDrTnZEjnSMscphs89` 00:50:23 USER; `session_015RjYfV7nHwhiepaqQbUuAk` 22:56:55 USER; `session_01CNJA8ECFcTzYvXV1DN5bta` 04b43474 ("531k used") | most of the $693; cache reads 70–269M tokens per top session | A Stop/PostToolUse hook reads the live context from the last `usage` row in `transcript_path`. Past the soft cap it injects "hand off now"; past the hard cap it refuses non-hand-off tools. One cap table, and launch prompts quote it, never invent one. | new hook `context-cap.py`, launch-policy.md | M | C |
| 3 | **A fresh session starts at ~105k context, not the 50–60k launch-policy assumes.** The relay and test sessions sat at 105–108k after 1–3 turns and $0.23–0.29. So the Sync card's `STOP AT: 100k` and the docs-only owner's 100k cap are below the floor. A 150k worker has ~45k of working room. | index: `session_01Ko7XWVUWU32sMVXhewTxGS` 105k, `session_017fKpag1PXzu9mBReqtPg6X` 108k, `session_016wPTxszmxyxxXKN8Y5Qsvn` 108k; Sync `session_011eKSAUfi58o6oKPi3LoufQ` 125k | every cap below ~150k is unreachable | Re-measure the base (`/context` in a fresh session), then set caps as base + working room. Cut base load: the skill list, the deferred-tool list and MCP instructions are most of it. | launch-policy.md, role-sync.md, AGENTS.md size | S | C |
| 4 | **Lanes stay alive for days after READY, paying full context per wake.** W50 ran 10-24 02:34 → 10-26 00:42 and W49 10-24 02:17 → 10-26 01:29. W49 made 5 `send_later` check-ins after READY at ~$0.75 each (~$4.4 on one page), only waiting on merge order, which role-pr-owner step 3 already forbids. Orchestrator idle wakes cost $0.27–0.45 for 2–3 steps at 650–700k, so a 3-min tick costs ~$6–8/h. | `session_01QGxJ2kociCLUhUAqyFpbBN` 2e46dd6c, dcb11e0a, 31df1703, 4be1fc1c, f3945804; `session_014ehnzVXXXbXpmaNrA6VWSP` 03:28:26 | ~$0.2–0.75 per idle wake; ~2 days alive each | A worker ends at READY. The orchestrator archives READY workers whose PR has no open item (fleet-archive rule: "idle an hour" plus READY sent). Tick cadence scales with context (3 min under 200k, 10 min above, hand off past the cap). | role-pr-owner.md, running.md, fleet-archive.mjs | S | C |
| 5 | **The quota gate was bypassed.** `rate_limit_info` reads `seven_day allowed_warning` on every session launched from 03:16Z on, this one included. OrchA 33 launched 6 sessions between 03:15:55 and 03:22:13Z and A·R2 at 03:35Z. orchestrator.md says "At `allowed_warning` or worse, launch nothing". | `session_014ehnzVXXXbXpmaNrA6VWSP` 15944d59, a19227f3 (create_session rows at 03:15:55 … 03:22:13) | 7 launches into a 75 % weekly quota | A PreToolUse hook on `mcp__claude-code-remote__create_session` requires a receipt from `launch-gate.mjs <saved get_session>` that is under 2 min old and shows `status: allowed`. This is the same receipt pattern as merge-gate. A Bryce-typed launch ask (like this audit) can be recorded as an explicit override in the receipt. | new tool + hook | M | C (launches) / P (warning time) |
| 6 | **Hand-off splits the brain and loses the queue.** Workers kept writing to the old orchestrator, which kept deciding: OrchA 31 sent 5 forwards after launching OrchA 32, and OrchA 32 sent 5 messages and made 2 PR decisions after launching OrchA 33 (~$3.9). OrchA 31's brief lived in gitignored `scratch/` and was force-added to a queue branch, then patched 3 times. OrchA 33 found 16 unowned PRs only after Bryce asked "drafts or prs not owned". OrchA 31 sent "HANDOFF NOW" as 14 separate identical `send_message` calls. | `session_01HSfCWDrTnZEjnSMscphs89` 5a275a57, 00:50:39–00:51:22, 00:53:38/00:57:24/00:59:09; `session_015RjYfV7nHwhiepaqQbUuAk` 68473279, a494538c; `session_014ehnzVXXXbXpmaNrA6VWSP` 03:19:33–03:20:54 | ~$4 + 1–2 h of re-discovery per hand-off | The successor's first act messages every live lane with the new id. The predecessor's last act is to stop deciding: it only answers "re-send to <id>". Keep a committed queue file with an owner column (`fleet-queue.mjs`) and run an ownership check on every tick. Add a broadcast verb to agent-msg. | orchestrator.md §Hand-off, running.md, tools | M | P |
| 7 | **A foreign push onto an owned PR branch led to a stalled owner and then a re-PR.** A Cursor agent pushed sync `19555a88` onto Codex #3692. The owner asked Bryce for an OK to push over it, got no answer across 3 check-ins, and handed off. ~16 h later O4 re-PR'd it as #3744 (merged `638f184e`). Separately, a sync merge `19075a7a` landed on H13's #3718 while H13's own gate was running, and the gate was wasted. | `session_017zgWpzsTWD3NsqabEPiv8C` 87dd623b; `session_011uRMn29iFsyJLCBq2JZxTE` 51d09996; `session_01TcuHBHRjWo1arKJHxV8PB7` e40e0a66 | ~$28 over 2 owners, 16 h | If a foreign push lands and nobody answers within 30 min, re-PR from a fresh branch at once; this is a standing rule, so do not ask Bryce. `sync-pr.mjs` refuses a branch whose owner holds a live claim. | existing-pr.md, steward, sync-pr.mjs | S | P |
| 8 | **The A·R1 relay took 4 sessions and 2 triggers and delivered nothing (KNOWN, quantified).** It produced 2 "(empty message)" relays and a `cse_`→`session_` lookup ERROR. R1#2's `trig_0167423WL2ef41ZQSAWdXwv1` looks orphaned. R1#4 was archived 4 min in, despite its brief saying "never archive yourself". T1 and T2 ran the same A→B POST test twice. The inbox route that does work (`claude:fleet-a-inbox`) also posted 1 empty line (bus `856cd4c2`). | R1 ×4 ids above; `session_01St33K2h8cqFdWeWY1LMgLg` 02:44:36 ERROR | $1.26 + Bryce's attention | Retire the relay role (CROSS-ACCOUNT-INBOX already concludes this). OrchA 33 should `get_trigger` `trig_0167…` and delete it if it is orphaned. Apply the payload guard to the inbox routine. | role list, Bryce web UI | S | C |
| 9 | **Stale state baked into timer prompts.** OrchA 33's tick still said "merges paused" after Bryce resumed merges. W57's check-in targeted a superseded head `9926fa2c`. | `session_014ehnzVXXXbXpmaNrA6VWSP` 73a720b1; `session_017S4fYMhEPQgVZHizeFJHpL` 03:28:58 | 2 wasted wakes, plus the risk of acting on stale state | Tick prompts carry no state: "read `<queue file>` and the bus". Re-arm the check-in on every push. | orchestrator.md §First acts, role-pr-owner.md | S | P |
| 10 | **An INCIDENT has no end.** It stayed in force after its fix because nobody posted "lifted". merge-gate refused #3713 on `pacing=FAIL` until OrchA 32 lifted it by hand. | `session_015RjYfV7nHwhiepaqQbUuAk` f87de8c1, 7a440105 | 1 refusal plus diagnosis | An INCIDENT names its fix SHA and auto-lifts on green Pages for it. merge-gate prints the INCIDENT line it is honouring. | fleet-bus.mjs, merge-gate.mjs | S | P |
| 11 | **`sync-pr.mjs` does not cure `docs/agent-index.json`**, which is generated by `tools/docs/gen-agent-index.mjs`. The Sync lane stopped there and hand-merged with `checkout --theirs` + gen, a hand merge that AGENTS.md forbids. `deploy.mjs` `cureableConflicts()` lists shell, ratchets, package.json, tools/README.md and the output catalog, but not agent-index. | `session_011eKSAUfi58o6oKPi3LoufQ` 03:07:59–03:08:25; `tools/ci/deploy.mjs` cureableConflicts | 1 hand merge | Add agent-index.json to `cureableConflicts()` (take either side, then regenerate). | tools/ci/deploy.mjs | S | C |
| 12 | **Waits fought the harness in the Sync lane.** One 22-step, 1 359 s turn: it ran `tooling-fast` serially, killed it and re-ran with `--jobs=3` (~10 min lost). `wait-for --timeout 900` overran Bash's 600 s cap and was backgrounded twice, `sleep 240` was refused, and the turn ended in a hand-rolled `until pgrep` waiter. | `session_011eKSAUfi58o6oKPi3LoufQ` 03:09:45, 03:19:59, 03:29:57, 03:30:07 | ~20 min | The role card names the exact pair: `tooling-fast --jobs=3` as ONE `run_in_background` task, then `wait-for --timeout 540`. `wait-for.mjs` caps its own `--timeout` at 590 s in the foreground. | role-sync.md, wait-for.mjs | S | P |
| 13 | **Hunts with no dry-round stop.** H11 (Fable) spent $40 on 25 subagents (code-hunter ×10, verifier ×5, physics-auditor ×5, scout ×5) and a 1 197 s turn. It found no player-facing defect and shipped 3 test pins (#3687). H10 (Fable) spent $13.53 on a single 10-step hand-off turn at 680k. | `session_01JKD3dJUji4edJToFC9tgkg` TURN 02:13:26; `session_012GHn3wz5viqzGibR47ZZ46` 1717d61f, e64fa6a2 | $40 for 0 defects; $13.5 for one turn | The hunter card stops after a dry round 1 and caps fan-out per round. Fable lanes get a short cap: worker-model memory already says Fable only when Bryce names it. | role-hunter.md | S | P |
| 14 | **Bus addressing hides lines from watchers.** 16 of 300 lines carry a PR number as `to` (`#3706`, `#3764`, …), and a `read --to A` watcher never sees them. Codex's REQUEST to A·W49 went to `#3706`. 53 HANDOFF lines carry an inline `[INFO]`/`[REQUEST]`/`[QUESTION]` prefix in place of a type (KNOWN #4, quantified). 3 lines are empty (DAD ×2 at 00:07Z, inbox ×1). | bus `6d544594`, `25871a1f`, `28c802c7`, `6939cff8`, `856cd4c2` | missed peer requests | `fleet-bus.mjs send` refuses a `--to` that is not a letter, a session id or `*`, and refuses empty text. A PR goes in `--pr`. | fleet-bus.mjs | S | C |
| 15 | **ready-gate refuses on the Plan item that only going ready can tick** ("now: … ready-gate 0, READY to OrchA 33"). Each case cost an extra body edit and a re-run. | `session_017S4fYMhEPQgVZHizeFJHpL` 03:23:30; `session_012GHn3wz5viqzGibR47ZZ46` 02:43:35/02:44:18 | 2 sessions × 1 cycle | The template's last item is post-ready, or ready-gate exempts an item that starts `READY to`. ready-gate prints the open line verbatim. | PR template, ready-gate.mjs | S | P |
| 16 | **`safety-bans-hook.test.mjs` goes red when a browser run is live on the box** (the index.html "allow" cases meet the live-run guard). W47 spent ~4 turns diagnosing it. | `session_01XdBTxDAyVk2nZfvkq8DC89` 9c4cbb46, c97266db | ~4 turns | Stub `live-run.py` in the test, so the guard check is hermetic. | tests/unit | S | P |
| 17 | **The harness Stop hook vs held pushes (KNOWN, quantified).** It fired 4× in 2 min on W50 at 771k (~$3) and drove 3 extra `ci-watch --once` polls while a Monitor was armed. | `session_012FhNfs9XvpJUo6FvCgvKkc` 87a27019, 1939f05d, 8c19aea1, 971e06a5 | ~$3 | Push the held commit to a side branch, or a stop-guard marker (STOP-HOOK-H1 still open). | user-level hook (Bryce) | S | C |
| 18 | **Archived with work in flight.** W56 ("CI watch, tooling-fast, macOS census still running on #3766") and O3 ("#3693 gate running … then #3696") are archived. Who archived them is not on the pages read. | `session_01MrkRrPzuR87WyjAxEzHe4E` post_turn_summary; `session_01ELQk4QJzRyBREZxyMrvP7b` c0edd461 | possible hand-off loss | `fleet-archive.mjs` refuses a session whose `post_turn_summary` names running work or whose owned PR is still open. | fleet-archive.mjs | S | P |
| 19 | **Tool-name mix-up.** A·T1 called in-process `SendMessage` with a `session_` id ("No agent named … reachable") and then fell back to `send_message`. OrchA 31 hit 2 permission denials grepping its own `.jsonl` transcript. | `session_016wPTxszmxyxxXKN8Y5Qsvn` 02:41:17; `session_01HSfCWDrTnZEjnSMscphs89` | 1 error, 2 denials | Launch template: "cross-session = `mcp__claude-code-remote__send_message`; `SendMessage` is in-process only". | launch-policy.md | XS | P |
| 20 | **Echo and confirmation wakes (KNOWN, CLAUDE-TRANSCRIPT-MINING #2) recur** at ~$0.4 each at 500k+ in H10, W45, H12, H16, H18 and W56. | b2 digests | ~$2–3 | Covered by #2/#4 here: smaller sessions make each echo cheap. | — | — | P |

## What worked (make it standard)

- **Merge discipline held.** Every merge read (#3706 `10175d81`, #3713,
  #3744 `638f184e`, #3756, H11's `68942c7c`) had a merge-gate receipt and two
  verified parents, then a bus DONE and a Pages watch. Nobody pushed over live
  CI and nobody cancelled an Actions run.
- **Relayed authority was refused correctly.** R1#1 would not create a trigger
  on an orchestrator's word. Bryce's grants were quoted verbatim with times in
  every launch read.
- **Structured hand-offs worked where they were used.** H16 and H18 left
  their PRs ready at STOP AT and those PRs merged. W56 and O4 picked up from a
  bus HANDOFF + `send_message` + claims released + triggers deleted. W57 ran a
  clean READY loop (`ci-watch --once` → ready-gate → Plan → ready → `READY
  #3767 <sha>`).

## Proposed diffs (`.claude/**`; not applied: Bryce decides via OrchA 33)

**D1: `.claude/skills/agent-fleet/references/worker.md` §Escalate** (finding 1)

```diff
 - you hit a cap (captures, ~400 messages, ~90 min with no OWNED push).
+
+Never call AskUserQuestion from a worker, owner, hunter or sync lane: it parks
+the session (no events, ticks or messages) until Bryce answers, and W47 sat
+3 h on one (audit 2026-10-26 #1). The question goes to the orchestrator as
+`QUESTION`; it decides or asks Bryce.
```

**D2: `.claude/skills/agent-fleet/references/orchestrator.md`, before
`## Hand-off to a successor`** (findings 1, 6). The first bullet depends on
Bryce's choice, because memory `ask-via-askuserquestion` prefers the tool:

```diff
+### Asking Bryce without stalling the fleet
+
+An open AskUserQuestion blocks this session: ticks, lane messages and PR
+events queue until he answers (OrchA 32: 15.5 h, four READY PRs +40 h;
+audit 2026-10-26 #1). Ask it only when nothing else in the fleet can move;
+otherwise put the question, its options and your default in the reply text,
+keep ticking, and act on the default after <N> min if the choice is
+reversible.
+
```

and in §Hand-off step 1 FIRST steps:

```diff
-     predecessor, arm the tick and the hourly safety net, one message to each
-     lane, the queue branch.
+     predecessor, arm the tick and the hourly safety net, one message to each
+     lane naming the new orchestrator id (lanes keep writing to the old one
+     otherwise; audit 2026-10-26 #6), the queue branch.
+   - the predecessor, once the successor is LIVE, decides nothing: every
+     inbound gets one line, "re-send to <successor id>".
```

**D3: `.claude/skills/agent-fleet/references/launch-policy.md` line 89** (finding 3)

```diff
-    session reports disagree (race-1 said "120k (237k used)"). A fresh session starts at about 50-60k base (a fresh PR owner read ~56k per call).
+    session reports disagree (race-1 said "120k (237k used)"). A fresh session starts at about 105k base on 2026-10-26
+    (relay/test sessions 105–108k after 1–3 turns); every soft cap is base + working room, so no cap below ~150k.
```

with `role-sync.md` `STOP AT: 100k` changed to `150k`, and the 100k
docs-only and watcher rows changed to 150k. All of these change once the base
is re-measured.

**D4: `.claude/skills/agent-fleet/references/role-sync.md` §The loop step 3**
(finding 12)

```diff
-3. Validate with the PR's own fast checks, then `sync-pr.mjs <branch> --push` once. Never sync and merge in one run.
+3. Validate with the PR's own fast checks (`tooling-fast --changed --jobs=3` as ONE `run_in_background` task, then
+   `node tools/ci/wait-for.mjs --timeout 540 …`; never `sleep`, never a foreground wait over 590 s), then
+   `sync-pr.mjs <branch> --push` once. Never sync and merge in one run.
```

**D5: `.claude/skills/agent-fleet/references/role-pr-owner.md` step 3**
(finding 4). The rule is already there; add the reason and the end state:

```diff
    orchestrator's tick reads it; the subscription still wakes you on a red).
+   After READY, delete the check-in (`delete_trigger`) and end the turn; a 600k
+   owner pays ~$0.75 per wake to learn its queue position (W49, audit
+   2026-10-26 #4).
```

**D6: new hook `.claude/hooks/context-cap.py`** (finding 2), wired in
`.claude/settings.json` as `PostToolUse` (matcher `.*`) and `Stop`. Sketch:
read `transcript_path` from the hook input, take the last assistant row's
`usage` (`input_tokens + cache_read_input_tokens +
cache_creation_input_tokens`), and read the soft cap from
`APEX_STOP_AT_K`, else from the session title's role prefix through the
launch-policy table. Past soft: `additionalContext` "context <n>k ≥ soft
cap <s>k: finish this unit, push, HANDOFF (launch-policy §Size stop)". Once
per 25k. Past hard (soft + 50k): `decision: block` on tools other than
git, Bash `fleet-bus`/`agent-msg`, `send_message`, `create_session`,
`update_pull_request`. Test: a unit test with a synthetic transcript.

**D7: new PreToolUse hook on `^mcp__claude-code-remote__create_session$`**
(finding 5). It requires `artifacts/launch-gate/receipt.json` (under 2 min old,
`rate_limit_info.status == "allowed"` or `override: "<Bryce's quoted ask>"`),
written by the tool in Q1.

## Quick wins in `tools/` (listed, not implemented)

| Q | Change | Finding |
|---|---|---|
| Q1 | new `launch-gate.mjs <saved get_session>` in tools/ci: writes the D7 receipt; `--override "<quote>"` | 5 |
| Q2 | `deploy.mjs` `cureableConflicts()`: add `docs/agent-index.json` (either side, then `gen-agent-index.mjs`) | 11 |
| Q3 | `fleet-bus.mjs send`: refuse `--to` not in {letter, `claude:`/`cursor:`/`codex:`/`grok:` id, `*`}; refuse empty text; add `--pr` | 14 |
| Q4 | `fleet-bus.mjs` INCIDENT `--fix <sha>`: auto-lift on green Pages for that sha; `merge-gate.mjs` prints the honoured INCIDENT line | 10 |
| Q5 | `fleet-archive.mjs`: refuse when `post_turn_summary` says running/gate/census or the owned PR is open; honour a `no-archive` tag | 4, 18 |
| Q6 | `sync-pr.mjs`: refuse while another session holds a `who-is-on-it` claim on the branch | 7 |
| Q7 | `wait-for.mjs`: cap a foreground `--timeout` at 590 s with a message naming `run_in_background` | 12 |
| Q8 | `ready-gate.mjs`: exempt a Plan item that starts `READY to`, and print the open item verbatim | 15 |
| Q9 | `agent-msg.mjs --to fleet:<L>`: one broadcast instead of N `send_message` calls | 6 |
| Q10 | `tests/unit/safety-bans-hook.test.mjs`: stub `live-run.py` so a live browser run cannot flip it | 16 |
| Q11 | `fleet-queue.mjs`: a committed queue file (PR, head, state, owner, next) that ticks read and hand-offs carry | 6, 9 |

## Decisions for Bryce (via OrchA 33)

1. AskUserQuestion policy (D1, D2): workers never; the orchestrator only when
   the fleet is otherwise idle. Or keep the tool everywhere and accept the
   stalls.
2. One cap table, enforced by a hook (D6): the values, and whether the hard
   cap blocks or only warns.
3. A quota gate as a hook (D7, Q1), with a typed-override path.
