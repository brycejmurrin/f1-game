# Fleet B transcript audit — 2026-10-26

Bryce's ask, typed in OrchB at 20:34 PT on 2026-10-25: "Spawn a session to deeply read Claude fleet b chats and
transcripts to find issues or ways to help agents or our roles or skills or anything". Auditor: B·R3
(`session_018Eoa7nP176V7hSdjvntn8v`). This note is read-only evidence. Every proposal that touches `.claude/**`, a
tool or a test is listed as a proposal, not applied.

## Method and coverage

- **Sessions in scope.** Every `B·` session created from 2026-10-25 23:05Z to 2026-10-26 03:36Z (16:05–20:36 PT):
  30 sessions, **$91.61** total. That is 7 orchestrators ($36.92, 40 %), 8 L7 messaging-test lanes, 2 relays, and
  owners and syncs for the PRs Fleet D lent to B. The seed `session_01Qv3HqSwsMuESkV9sSvb4f1` was also read; it
  dates from 10-19. Before that window the newest B sessions are from 10-22, outside 48 h. Cost, context and status
  come from one saved `list_sessions` page (`external_metadata.usage`, `context_usage`, `post_turn_summary`).
- **Deep reads.** These sessions were paged with `list_events` and digested with `tools/ci/session-transcript.mjs`:
  the seed; orchestrators O-fresh, O-next (2 pages), queue (2), queue2 (2), queue3 (2), queue4 (3) and queue5 (4);
  L7 (2) and L7c; R1 (2); W1·L1 tests; owner #3732; sync #3576+#3684. That is 13 sessions and 28 pages, about
  9 MB of raw events. Per-turn context comes from the assistant `usage` blocks: input + cache read + cache write.
- **Prior art.** Not re-reported here: [TRANSCRIPT-MINING-2026-10-16](../../notes/TRANSCRIPT-MINING-2026-10-16.md),
  [CLAUDE-TRANSCRIPT-TOKEN-AUDIT-2026-10-18](CLAUDE-TRANSCRIPT-TOKEN-AUDIT-2026-10-18.md),
  [CLAUDE-TRANSCRIPT-MINING-2026-10-19](CLAUDE-TRANSCRIPT-MINING-2026-10-19.md) and
  [ORCHESTRATION-AUDIT-A-B-2026-10-22](ORCHESTRATION-AUDIT-A-B-2026-10-22.md). A row marked **recurring** is a known
  finding that is still live, with new numbers.
- **Not covered.** Thinking text (it arrives empty) and subagent sidechains. Only the newest 1–4 pages of each
  long session were read, so a Bryce message on an older page can be missing.
- **What stayed clean.** Hook refusals and classifier blocks were rare: 4 markers across 28 pages, none of which cost
  a turn. Every session ran in auto mode on the intended model, and no session was quota-parked: `rate_limit_info`
  read `allowed` in all 30.

## Ranked findings

Value: H = saves dollars or Bryce's time every day, M = saves it every week, L = hygiene.

| rank | symptom | evidence (session + time Z) | root cause | proposed fix (file / rule / tool) | est. value |
|---|---|---|---|---|---|
| 1 | **7 orchestrators in 4.5 h** (each lived 10–81 min), costing $36.92 (40 % of the fleet) | queue5 `01WYAjPb`: 101k context at its first tool call (03:25:16), 131k by 03:28 after the skill (8.3k chars), `orchb-queue.md` (16.7k chars) and 5 sends, then 185k at 03:36, 12 min in, against a 200k cap. queue4 `012x87N1` handed off at 192k after 24 min (seed 03:24:53, "at 192k context") | Boot uses ~65 % of the orchestrator's 200k soft cap. The cap was set when a fresh session cost 50–60k (row 2). The queue file only grows (15 `##` sections), and every successor reads all of it | `launch-policy.md` §Size stop: give the orchestrator a work budget, soft cap = measured boot + 100k (about 230k today), not a fixed 200k. `orchestrator.md` hand-off: the queue file keeps only the live state plus the last hand-off, and older sections move to `git log`. Re-measure after the change | H |
| 2 | **Base context about 100k**, double the recorded 50–60k | The 5 near-idle L7d–h test lanes ended at 100.6k–103.0k after 1–2 curls each. queue5's first assistant turn was 101,261 tokens. `launch-policy.md:89` and [BASE-CONTEXT-AUDIT-2026-10-19](../../notes/BASE-CONTEXT-AUDIT-2026-10-19.md) still say 50–60k | AGENTS.md, the rules, the MCP server instructions and the deferred-tool lists (6 servers, about 300 names) have grown since 10-19 | Re-run the base-context audit (agent `bloat-auditor` over AGENTS.md + rules + `.mcp.json` instructions), then update the figure in `launch-policy.md`. Every role cap depends on it | H |
| 3 | **Cross-fleet env names drifted across 3 schemes**, which took 8 test lanes and 2 relays ($8.31) to settle | L7b `01AeZcjF` expected `FLEET_A_INBOX_ID/TOKEN`. L7d/e (`01TkeuWE`, `01FLZj6v`) expected `APEX_A_INBOX_URL/TOKEN` and went need_input. L7c/g/h used `APEX_A_RELAY_URL/TOKEN`. Even `orchb-queue.md` gives both `APEX_B_INBOX_URL/TOKEN` (line 79) and `APEX_B_RELAY_URL` (line 84) for A→B | The names live only in a scratch queue file on `cursor/orchb-queue-b7f2`. On the deploy branch, `agent-msg.mjs` knows only `APEX_AGENT_WEBHOOK_*`. Each lane's brief guessed a different name | Settle one pair per direction (Bryce, row 18), then document it in `communication.md` and add `agent-msg.mjs --to <L>` reading `APEX_<L>_RELAY_URL/TOKEN` (the lost L7 diff, row 4). Test with ONE probe session that prints names only (`env \| grep -E '^(APEX\|FLEET)_' \| cut -d= -f1`), not one lane per guess | H |
| 4 | **Verified tool change lost**: L7's `agent-msg.mjs` routine-fire support (16 tests passing) was staged, never pushed, and the session was archived | L7 `01NP1X1u` at 02:03–02:23: "I'm still not committing, because you said 'wait'", repeated on 6 wakes. The harness Stop hook ("uncommitted changes… commit and push") fired on 6 turns. `git ls-remote` shows no `cursor/agent-msg-routine-7c3e`. The session was ARCHIVED by 03:29 | Bryce's "wait" (on the commit) was read as "do not commit". AGENTS.md rule 12 says to push at every checkpoint, so the two rules disagree. `fleet-archive.mjs` KEEPs a session with no PR ("archive by hand after reading it"), but it was archived by hand anyway | `fleet-core.md`: "wait" pauses PR, ready and merge, not WIP: commit and push the topic branch (no PR means no CI). The archive-by-hand step first runs `git ls-remote origin '<session branch>'` and refuses a branch that exists only in the container. Recover: the transcript holds only the edit script's first lines (L7 page 2, 02:04:04), so the change must be rewritten (row 11's tool) | H |
| 5 | **Fleet-D-lent PRs re-conflict while B waits on D to merge** | #3576 was resynced twice: sync `018q2mQM` (23:27–01:31, $5.40), then it "is conflicting again" after Fleet A's #3706, so a second sync `01EdRt5y` ran (01:31–02:14, $2.43). Owners `0139MAKf` ("green and mergeable; waiting on D to merge") and `016KNaCz` sat on 15-min check-ins | B can bring a lent PR to READY but has no merge authority on it. D merges on its own tick, and the deploy tip moves (A/D game merges on `game.js`) in the gap | Bryce/D decision: either the lender merges a READY lent PR within one tick, or lending also hands the merge to B through `merge-gate.mjs`. Until then, a lent PR's sync session stops at READY and does not re-sync on clean-behind (AGENTS.md "sync only when you must") | H |
| 6 | **Bryce types into the retired orchestrator**, and it acts | queue3 `01TUsAAd` handed off at 03:00. Bryce asked it "So now how do the messaging work between all" (03:01:47) and "Archive non needed ssssikns" (03:02:42), and it archived 6 sessions, then told the new orchestrator | After a hand-off nothing redirects Bryce. The old tab keeps its title, and its last reply names the successor id but not a link | `orchestrator.md` stand-down: `set_session_title` → `[Done → B·O-queueN] …`, and the final reply carries `https://claude.ai/code/<successor id>`. A typed ask that arrives after stand-down is forwarded to the successor in one `send_message` and answered with its link | M |
| 7 | **Seed is not tiny**: 452k context, $14.50 cumulative, 32 worker epochs | Seed `01Qv3HqS` 02:59:57 ctx 452,252. Each spawn wake costs ~$0.35 (03:00:20 $14.15 → 03:25:08 $14.50) | `role-seed.md:56` says "A seed's context stays tiny… it never needs a hand-off". In practice Bryce also chats in it from iOS, and the seed has no size stop | `role-seed.md`: a size stop at 150k: the seed asks Bryce for a fresh seed (one paste-in prompt), and chat with Bryce goes to the orchestrator, not the seed | M |
| 8 | **Archive rule contradicts itself** for a retired orchestrator | `orchestrator.md:229`: "The successor archives you by the archive rule". `fleet-archive.mjs` prints `KEEP … role orchestrator is never archived by an agent`, and fleet-core says the same. queue5 archived queue4 at 03:29:38 right after that KEEP line, on Bryce's "Let's archive old sessions" (03:29:04) | Three texts give two answers | One answer: `fleet-archive.mjs` returns ARCHIVE for an orchestrator whose successor's `ORCH <X> LIVE` is on the bus and which has no enabled triggers. fleet-core keeps "never a live orchestrator" | M |
| 9 | **The hand-off fan-out wakes every lane** for a no-op | queue5 sent 5 `send_message` at boot (03:25:52–03:26:03). R1 `01PfAQjr` woke at 03:01:31 and 03:26:16 only to say "no action". Owner `0139MAKf` woke at 01:44:51 to re-send status. 7 rotations × ~4 lanes is ~28 wake turns at 100–200k context | `orchestrator.md:210` lists "one message to each lane" as a FIRST step, but workers and relays already resolve the orchestrator with `fleet-bus.mjs who B` at send time | Drop the per-lane message and keep the bus `ORCH B LIVE` line plus the predecessor ack. A lane learns the new id when it next sends | M |
| 10 | **Phone typos block or misdirect agents** | R1 has been BLOCKED need_input since 02:34:55 on "what should I set the cars to" (= vars). L7c `01Aa91dz` 02:04:01 "Keep resying" → a 25-try curl loop, 9 fires, against its brief's "fire exactly once". queue3 "ssssikns" was read correctly | No rule says how to read a likely typo. One agent stopped, one widened its scope | `communication.md`: take the nearest in-context word, state the reading in one line ("reading 'cars' as 'vars'"), and proceed when the action is reversible. A brief's limit on outbound or repeated actions (fires, sends, merges) still wins over a terse typed word, and the agent asks once | M |
| 11 | **Hand-rolled curl retry loop** against a rate-limited routine fire endpoint | L7c 02:04:16: `for i in $(seq 1 25)… curl -X POST "$APEX_A_RELAY_URL"`. 8× HTTP 400 `routine_paused`, then 401 "OAuth access token has been revoked" at 02:12. The documented limit is 30/h | There is no tool for a routine fire, so the brief taught a raw curl recipe (`orchb-queue.md:91`) | Fold into the row 3 tool: `agent-msg.mjs --to <L>` fires once, backs off only on 429/5xx, stops on 4xx, and logs the request id. Briefs cite the tool, not curl | M |
| 12 | **Context overshoot persists** (recurring, 10-19 #7) | W1·L1 tests `01CnBRwU` 288k / $9.67 (worker soft 150k, hard 200k). queue3 297k / $10.60 (orch hard 250k). queue2 242k. Owner `0139MAKf` 214k. Sync `018q2mQM` 198k handed off correctly at "past 150k" | Caps are prose in the brief. `get_session used_tokens` updates only at turn end, and short wake turns never reach a checkpoint | Proposal (`.claude/hooks`, needs Bryce): a Stop or UserPromptSubmit hook that prints `context N k / cap C k` once over the soft cap and refuses new `create_session` and `Agent` spawns over the hard cap | M |
| 13 | **Env changes force orchestrator rotations** | O-fresh `01V2LkDF` lived 10 min: Bryce at 23:12:36 "Handoff to a new orchestrator I just fixed the env". queue3 → queue4 at 02:58 so that the successor "will run… with `APEX_A_RELAY_*` in its environment" | A container reads environment variables only at start. The orchestrator needs them only to POST cross-fleet | The orchestrator delegates cross-fleet POSTs to the long-lived relay (R1) or a one-shot sender session, so an env fix restarts at most that session, not the orchestrator. Add this to `orchestrator.md` §env | M |
| 14 | **Three wake sources per orchestrator** | queue5 boot armed a 3-min `send_later` tick (03:25:26), an hourly `create_trigger` (03:25:28) and a 60 s `while true; … fleet-bus.mjs read` Monitor (03:26:11). queue3 ran the same loop as background task `bjt45vbsv`. Short turns: queue3 8 of 9, queue2 5 of 7, O-next 3 of 5 | The 3-min tick and the 60 s bus Monitor overlap: both read the bus. fleet-core says "never poll in a shell loop" while the hand-off brief asks for one | Pick one: either the bus Monitor (it wakes only on a new line) plus the hourly safety net, or the 3-min tick, not both. `orchestrator.md` names which | M |
| 15 | **Duplicate sends** of the same DONE | L7c 02:03:51 and 02:03:53 sent the identical `DONE L7c …`, and again 02:12:29 / 02:12:31 (L7 and OrchB, with the bus line as a third copy) | The brief asked it to report to both its parent lane and the orchestrator | Report to the orchestrator only (the existing launch-policy rule "replies go to the orchestrator only"). The parent reads the bus | L |
| 16 | **Advisory hooks misfire in this audit session** (recurring, 10-19 #4) | `skill-hint.py` named `js-debugger` on a `<cross-session-message>` envelope. `lsp-hint` flagged `TURN` in a grep of a transcript digest | `ENVELOPE` skips `[SYSTEM NOTIFICATION` but not a cross-session message. lsp-hint treats any capitalised grep word as a JS symbol | `skill-hint.py`: skip prompts that open with `<cross-session-message`. `lsp-hint.py`: skip a grep whose path is outside `js/` | L |
| 17 | **Test lanes cost 100k each for one curl** | L7b, L7d–h: $0.40–0.75 each, 100–104k context, 1–2 minutes | A fresh session is the only way to read new env vars, and each one pays the base context of row 2 | Same fix as row 3 (one probe session for all names). Longer term, a `--bare` probe session with no skills or MCP, if the harness gains one | L |
| 18 | **Decisions waiting on Bryce, collected** | rows 3, 5, 12, 13 | — | See below | — |

## Proposals that need Bryce

`.claude/**` edits need Bryce's typed grant in the acting session (`.claude/rules/claude-config.md`). These are proposed
diffs, not applied:

1. **`agent-fleet/references/launch-policy.md` §Size stop** (rows 1, 2): replace "A fresh session starts at about
   50-60k base" with the re-measured figure. Change the orchestrator row from `200k` to `boot + 100k (measure boot at
   the first tick; ~230k on 2026-10-26)`.
2. **`agent-fleet/references/orchestrator.md`**: hand-off step 1 drops "one message to each lane" (row 9). Stand-down
   adds `set_session_title "[Done → <successor title>]"` and the successor link (row 6). The queue file keeps the live
   state plus the last hand-off only (row 1). A new §env says cross-fleet POSTs go through the relay or a sender
   session (row 13). Name ONE wake source (row 14).
3. **`agent-fleet/references/role-seed.md:56`** (row 7): replace "stays tiny… never needs a hand-off" with a 150k
   size stop and "chat goes to the orchestrator".
4. **`agent-fleet/references/communication.md`** (rows 3, 10): one canonical cross-fleet env table, and the
   typo-reading rule.
5. **`.claude/rules/fleet-core.md`** (row 4): "wait pauses PR / ready / merge, not WIP: still commit and push the
   topic branch". Also row 8's single archive answer.
6. **`.claude/hooks/skill-hint.py`, `lsp-hint.py`** (row 16), and a new context-cap hook (row 12). Hooks need
   Bryce's explicit yes.

Decisions only Bryce (with D and A) can make:

- **Row 3:** the canonical name pair for each direction (A→B and B→A). Suggested: `APEX_<L>_RELAY_URL` +
  `APEX_<L>_RELAY_TOKEN` in the SENDER's environment, where `<L>` is the receiving fleet. This retires
  `FLEET_<L>_INBOX_*` and `APEX_<L>_INBOX_*`.
- **Row 5:** whether lending a PR to B also lends the merge (through `merge-gate.mjs`), or whether D commits to
  merging a READY lent PR within one tick.

Tool and test changes, as proposals for a follow-up PR (not in this one):

- `tools/ci/agent-msg.mjs --to <L>` routine fire with once/backoff semantics (rows 3, 11), tested in
  `tests/unit/agent-msg.test.mjs`.
- `tools/ci/fleet-archive.mjs`: ARCHIVE a retired orchestrator (successor LIVE, no triggers). The hand-archive path
  checks `git ls-remote` for the session's branch (rows 4, 8).
- `tools/ci/session-transcript.mjs --ctx`: print per-turn context from the `usage` blocks, the measurement used for
  rows 1 and 2 here (a 30-line scratch script in this audit).

## Cost of this audit

28 `list_events` pages (each saved to a file, never printed whole) plus one `list_sessions` page, digested with
`session-transcript.mjs` and a scratch context script, with about 110k of this session's context used.
