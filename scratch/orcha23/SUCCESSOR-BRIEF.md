# [Orchestrator] A·O24 · fleet · Opus — successor brief from OrchA 23

Predecessor: OrchA 23, session_01LCwqz3kpiVuXkjy8YyJprp (2026-10-22 07:58Z–09:40Z). Read its transcript for detail:
list_events session_01LCwqz3kpiVuXkjy8YyJprp, kinds ["user","assistant"]. Bryce's messages are its "user" turns.
Standing authority: AGENTS.md §Concurrent PRs (merge by gate, archive by rule, launch, PR bodies, Pages dispatch).
Times: Pacific = UTC−7. Bryce plays on an iPhone (844x390 landscape, touch). Report changes only. Decisions go to Bryce via AskUserQuestion.

## FIRST (in order)
1. Read: AGENTS.md, .claude/rules/fleet-core.md, skill agent-fleet (orchestrator.md incl. §Talking to other fleets
   [on PR #3551's branch until it merges], running.md §Bus routine, comms.md), and
   docs/notes/FLEET-ADAPTIVE-COORDINATION-2026-10-22.md (MERGED #3548: rules 1-7; rule 7 = TRAIN DISCIPLINE).
   Also draft #3568 docs/notes/ORCHESTRATION-AUDIT-A-B-2026-10-22.md (audit, 15 ranked items; it corrects 2 facts in rule 7).
2. Env: check presence and length only: GROK_API_KEY, APEX_AGENT_WEBHOOK_URL, APEX_AGENT_WEBHOOK_AUTH.
3. Bus: `node tools/ci/fleet-bus.mjs send HANDOFF --to '*' --as claude:<you> "ORCH A LIVE claude:<you> (replaces session_01LCwqz3kpiVuXkjy8YyJprp, OrchA 23)"`.
   send_message OrchA 23 "ORCH A LIVE <id>" (it then deletes its tick and safety net and stops).
   Webhook DAD (INFO, ORCH A LIVE <id>).
4. Timers: a 3-min send_later TICK chain plus an hourly create_trigger safety net (`0 * * * *`, initiation human_request) bound to you.
   KEEP the account-wide FLEET BUS WATCH routine trig_01JY5wYatqkrVwPXPsMD1ryZ (hourly :57, fresh Sonnet session).
   Never recreate it. It flags an orchestrator silent ≥30 min, so post a bus line at least every 25 min.
5. One message to each live lane with your id (table below). Keep your queue branch cursor/orcha24-queue-<hash>.

## How to talk to other fleets
- Fleet D = DAD (Cursor/Grok coordinator, bus id grok:51005e68-c822-4e8b-b2dd-d8b31ec726a0). Reach it on the agent webhook:
  `curl -sS -o /dev/null -w '%{http_code}' -X POST "$APEX_AGENT_WEBHOOK_URL" -H "Authorization: $APEX_AGENT_WEBHOOK_AUTH" -H "Content-Type: application/json" --data @file.json`
  (JSON {from:"A",to:"D",type:INFO|QUESTION|REQUEST|INCIDENT,pr,text}). Use agent-msg.mjs once D's #3518 merges.
  Mirror each message on the bus as a HANDOFF line. DAD replies straight into your session or on the bus.
  The raw curl works in this environment only because ~/.claude/settings.json autoMode.environment allows it, and that file is LOST with a new container.
  If auto mode refuses the curl, use the repo allow rule `Bash(node tools/ci/agent-msg.mjs send *)` (#3525, merged) once #3518 lands, or ask Bryce.
- Merlin = Bryce's personal agent (bus id claude:a31d6408-2b46-4d4e-8503-bbec7e5a07cf), reachable on the bus only. It files issues and opens
  drafts (merlin/* branches) and never merges. For overlaps Bryce chose "compare, keep best".
- Bryce 09:34Z: "Whatever you decide, discuss". Any cross-fleet decision (merge/train rules, shared tooling, another fleet's PRs)
  goes to bus + webhook first and takes amendments. Then act, or AskUserQuestion Bryce.
- Never @cursor on GitHub (it wakes that PR's Cursor agent; bc-4f8efad5 on #3517 is on nobody's visible account).

## STATE at 09:40Z
- PAGES STARVED: last green Pages 9f9db7fc at 08:18Z. Train e8630e9d is queued since 09:23Z. Runners: 146 Linux jobs vs 40 slots, 107 queued.
  RULE 7 FREEZE IN FORCE: no merges while a pages.yml run is queued or running, no ready-marking, no run-ci, no pushes to READY PRs.
  On green: post TRAIN green + BATCH OPEN, merge ≤4 game PRs back to back (GAME-SLOT + fresh merge-gate each, merge commit,
  check 2 parents, DONE), then the non-game ones, then BATCH CLOSED and tell lanes the freeze is lifted.
  A manual pages.yml dispatch is Fleet A's job, once, and only if the queue drains and the train is still idle.
- Unattributed merges: #3504 #3517 #3519 #3550 #3526 #3548 merged as brycejmurrin with no DONE. Claude transcripts, Merlin and D all
  deny merging, so it was probably Bryce by hand (inference). OrchA 23 asked him; read the answer in its transcript.
- Tip b7558127. Tonight OrchA 23 merged #3502 #3521 #3525; Bryce or unknown merged the rest.

## Lanes (all Fleet A, auto mode, launched by OrchA 22/23)
| slot | session | model | PRs / state | next |
|---|---|---|---|---|
| A·H2 | session_017pqnJgpqQpVF7g6ovncKse | Opus | #3533 lobby H3-7 + host-MENU blank fix (draft, fast green 56a696ee); held for TRAIN green | ready-gate → READY → FINAL; then archive |
| A·F3 | session_01N6GgoLRuwh8KPKCZQzyfb1 | Sonnet | #3553 explorer report (draft); #3550 merged | FINAL after #3553; rest of #2906 is a separate lane |
| A·W1 | session_01Fsqv6M8vKK4dPQ4feEXz4P | Opus | #3536 boot: 3514 3513 + 3515 low-prio preload (draft); Merlin ideas folded | remote groups queued; READY after green |
| A·W2 | session_01JiMURvzGUNueuJd6GB5Qj2 | Opus | #3538 (3511 garage wall clock), #3540 (3510 stall watchdog) | READY after green |
| A·W3 | session_01Wnxkrd19h9eKZkUW6XQfEk | Sonnet | #3532 (3505 quarantine renew), #3537 (3507 verdict skips), #3539 (3506 renumber) | READY after green |
| A·W4 | session_01JW6FonSaKB24Dmua4vxcEy | Opus | #3541 (H3-10 + H3-9), #3542 (H3-11 QR) | READY after green |
| A·W5 | session_01LbyfrAbJw1GJttfbEixYnv | FABLE (Bryce's pick) | helmet visor rework, branch cursor/visor-optics-f5a1; apex.js visorScene hook OK'd (apex.js HELD by D #3479, coordinate) | gallery + PR |
| A·W6 | session_01L67YcMZy5zTpG7MA8Rtnyp | Opus | #3554 (3516 pre-sync START) | READY after green |
| A·W7 | session_01XK6UZ9VmijmeXdYUymqWGJ | Opus | shared safety hooks .claude + .cursor (Bryce "Yes, write both"); may hit protected-path refusal → Bryce approves in its session; DAD reviews the Cursor half | PR |
| A·W8 | session_01Byxj7sVEAtPuSYDiSLx7Gf | Sonnet | merge attribution: merge-gate Merged-by trailer + detector (bus line + PR comment, flag only) | PR |
| A·X1 | session_01Jxz6BMpucD8Gm23RmWTptJ | Opus | audit draft #3568 (never ready; Bryce decides) | combined A+D decision list with DAD |
Archived tonight: A·H1 A·H3 A·R1 A·F1 A·F2 A·F4.

## My open PRs
- #3551 docs(agent-fleet): orchestrator webhook how-to + launch template (PARALLEL/NEXT/DEDUPE, hard lines 15-17) + successor brief items. Draft, fast green. Ready in the batch.
- #3552 memory: Fable only when named; "discuss decisions with fleets". Draft. Ready in the batch.

## Bryce decisions in force (2026-10-22)
- "Be more adaptable ..." → adaptive plan (merged #3548). Train discipline agreed 09:11Z with D's amendments (GAME-SLOT and a fresh gate per PR in a batch; only A dispatches).
- Merge attribution: trailer + detector, "Bus + PR comment" (A·W8). DONE stays mandatory.
- Shared hooks: "Yes, write both" (A·W7).
- Duplicates with Merlin: "Compare, keep best". Closed 3549 3547 3534 3546 3544.
- Idle sessions: archive them or give them parallel work; launch new sessions for more.
- Fable only when he names it (the visor).
- Lanes refuse relayed grants (correct). New scope = new launch with his words quoted (hard line 15).
- A+D agreed after the audits: one-merge-authority + mandatory fleet-owner pre-launch → a separate AGENTS.md/skill PR, after Bryce reads both audits.
  Strict bus verbs → D·W15 after #3518. Ratchets: hook auto-absorb only, no hand raises.

## Open asks for Bryce
- Did he merge #3504 #3517 #3519 #3550 #3526 #3548 by hand?
- The 6 open questions in audit #3568, plus whether to trial the GitHub merge queue (it changes how everyone merges).
- Carried over: which ideas to build (galleries), xAI spend limit, GROK_API_KEY as a CI secret.

## Artifacts
- Visor A/B gallery (old captures): https://claude.ai/artifact/WKFsGpg2mfX5uJNVUcJddk (source scratchpad of OrchA 23, gone with its container; A·W5 will publish its own).
