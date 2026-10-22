# [Orchestrator] A·O24 · fleet · Opus — successor brief from OrchA 23 (session_01LCwqz3kpiVuXkjy8YyJprp)

TITLE: [Orchestrator] A·O24 · fleet · Opus — Fleet A gated merges, lanes, bus routine
TAGS: fleet:a role:orchestrator scope:fleet
MODEL: claude-opus-5-5. The orchestrator handles merges, routing and Bryce's calls.
Standing authority: AGENTS.md §Concurrent PRs. Refresh this file at hand-off; its state is as of the timestamp in QUEUE.md.

## FIRST (in order)
1. Read AGENTS.md, .claude/rules/fleet-core.md, skill agent-fleet: orchestrator.md (launch template, hard lines 1-17, §Talking to other fleets), running.md §Bus routine, comms.md, communication.md.
2. Check env secrets by presence and length only: GROK_API_KEY, APEX_AGENT_WEBHOOK_URL, APEX_AGENT_WEBHOOK_AUTH.
3. Bus: `fleet-bus.mjs send HANDOFF --to '*' "ORCH A LIVE claude:<you> (replaces session_01LCwqz3kpiVuXkjy8YyJprp, OrchA 23)"`. Then send_message OrchA 23 "ORCH A LIVE <id>".
4. Timers: a 3-min send_later tick plus an hourly create_trigger safety net bound to your session. The account-wide FLEET BUS WATCH (trig_01JY5wYatqkrVwPXPsMD1ryZ, :57) stays; never recreate it.
5. Post a bus line at least every 30 min (the watch flags 30 min of silence as ABSENT).
6. One message to each live lane with your id. Keep your own queue branch cursor/orcha24-queue-<hash>.

## Coordination
- Fleet D: DAD (grok:51005e68-c822-4e8b-b2dd-d8b31ec726a0). Reach it on the agent webhook (agent-msg.mjs once #3518 lands, else curl plus a bus mirror). It replies on the bus or straight into your session.
- Adaptive A+D plan: docs/notes/FLEET-ADAPTIVE-COORDINATION-2026-10-22.md (#3548; Bryce said "Yes, merge it"). It covers liveness, ADOPT, pacing by Pages state, a 30-min GAME-SLOT TTL, and seats.
- Merlin (claude:a31d6408…, Bryce's personal agent) files issues and opens drafts and never merges. Before launching on an issue, check its PRs. For overlaps Bryce chose "compare, keep best".
- Unknown Cursor agents can be attached to PRs (bc-4f8efad5 on #3517). Never @cursor on GitHub. Only Bryce can stop them.
- Bryce merges game PRs himself too. Count his merges as taking the slot.

## Bryce decisions in force (2026-10-22, Pacific = UTC-7)
- Webhook permissions: repo allow rule (#3525 merged) plus container autoMode context.
- "Be more adaptable to the state of pages, the open prs, seats … if a branch hasn't been worked on in a bit it's fair to take" → the adaptive plan.
- Idle sessions: archive them or give them parallel work (worktrees and subagents); launch new sessions for more work.
- Visor rework on Fable (A·W5): Fable only when Bryce names it.
- Lanes refuse relayed grants. New scope means a new launch with his words quoted.
