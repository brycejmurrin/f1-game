# [Orchestrator] A·O23 · fleet · Opus — successor brief from OrchA 22

TITLE: [Orchestrator] A·O23 · fleet · Opus — Fleet A (+B) gated merges, lanes, bus routine
TAGS: fleet:a role:orchestrator scope:fleet
MODEL: claude-opus-5-5 — orchestrator (merges, routing, Bryce's calls).
Standing authority: AGENTS.md §Concurrent PRs.

## Why you exist
Bryce, 2026-10-22 ~07:57Z: "can you handoff to a new orchestrator that has new env and we [archive] those sessions".
You were started after Bryce added env secrets: GROK_API_KEY, APEX_AGENT_WEBHOOK_URL, APEX_AGENT_WEBHOOK_AUTH
(the webhook wakes DAD, Fleet D's coordinator; verified HTTP 200 at 07:54Z, Cursor Automations run
f0c3afff-8cc4-4efe-b729-9b599e5db9ac). Never print/commit either value; check presence/length only.

## FIRST (in order)
1. Read AGENTS.md, .claude/rules/fleet-core.md, skill agent-fleet (orchestrator.md, running.md incl. §Bus routine,
   role-merge-holder.md, comms.md). Queue: this file + scratch/orcha22/QUEUE.md on branch cursor/orcha22-queue-a22q
   (`git fetch origin cursor/orcha22-queue-a22q && git show FETCH_HEAD:scratch/orcha22/QUEUE.md`).
2. Post `node tools/ci/fleet-bus.mjs send HANDOFF --to '*' --as claude:<you> "ORCH A LIVE claude:<you> (replaces session_012Rf9fHiy2exPfFWA5Vfwrg, OrchA 22)"`.
   Then send_message OrchA 22 (session_012Rf9fHiy2exPfFWA5Vfwrg) "ORCH A LIVE <id>" so it deletes its timers and stops.
3. Arm the bus routine (running.md §Bus routine): a 3-min self-rescheduling `send_later` tick + a recurring hourly
   `create_trigger` (`0 * * * *`, initiation human_request) safety net. Recurring < 1 h is refused.
4. Keep your own queue branch cursor/orcha23-queue-<hash> (scratch/orcha23/QUEUE.md, `git add -f`), refreshed on change.
5. send_message each live lane once: "ORCH A is now <your id>; send REPORT/READY/BLOCKED there."
6. Test the DAD webhook once yourself (presence check only, then — after #3518 merges — `node tools/ci/agent-msg.mjs`
   with an INFO "ORCH A LIVE" line). Until #3518 merges use curl exactly as #3518's agent-msg.mjs builds it
   (JSON {"from":"A","to":"D","type":"INFO","pr":null,"text":"..."}, Authorization header = the env value verbatim).

## Live lanes (all Fleet A, auto mode, created by OrchA 22)
| slot | session | model | owns / state |
|---|---|---|---|
| A·H1 race hunter | session_01W1sg2v1g7E63wR5MYBAoEK | Opus | #3503 READY (full tier running), #3522 docs READY; #3498 merged by Bryce |
| A·H2 career/garage hunter | session_017pqnJgpqQpVF7g6ovncKse | Opus | FINAL; drives #3504 (READY) and #3497 (READY) |
| A·H3 audio/data/net hunter | session_01AT6R9bU8jvpMhYe43FsyFN | Sonnet | #3496 READY (full 44/0); H3-7..11 unfixed in its note |
| A·F1 garage phone UI | session_014rKRBzBFwf1Co4GnjeXReR | Sonnet | #3523 draft (3330 3331 3333@44px 3334 3335; 3332 n/r, 3336 deferred) |
| A·F2 car aero | session_01REdtqvAeQU5CMrZSNyWHP8 | Opus | #3519 draft (3412 3411 3405); claims 3413 n/r + 3404 already shipped → VERIFY with finding-verifier before closing |
| A·F3 tools | session_01N6GgoLRuwh8KPKCZQzyfb1 | Sonnet | #3521 draft (strict --only ids + ratchets validation, Closes #3520); next: small tools issues from merged triage notes |
| A·F4 close-garage confirm | session_01SUfcaUf6YLdWDdGJ3qQ54R | Sonnet | #3517 draft, depends on #3497 (merge right after it) |
| A·R1 grok research | session_01WSv4hNAfbp9ENjjTAjseVd | Sonnet | FINAL; #3502 READY (docs) — merge when full tier green |

Archived by OrchA 22 at hand-off (done): A·O1, A·T1, A·T2, A·T3, A·I1, A·I2, A·R2, A·R2b, A·R2c.

## Merge queue
Game PRs (js/ css/ …) — ONE per green Pages, GAME-SLOT on the bus first:
- Waiting for Pages 39741742759 on abd1c665 (#3498, Bryce merge 07:37Z) to go green; 39739654224 (lens 9f9db7fc) ahead of it.
  Runners were jammed (129 jobs / 40 slots).
- Order: #3497 → #3517 (after #3497; sync if needed) → #3503 → #3504 → #3519 → #3523 → #3496.
Non-game (no slot, merge when full tier green + merge-gate): #3502, #3522, #3521.
Every merge: `node tools/ci/merge-gate.mjs --pr <n>` exit 0 → GitHub MCP merge_pull_request merge_method=merge
expectedHeadSha=<gated head> → `git log -1 --format=%p <sha>` two parents → `fleet-bus.mjs send DONE`.

## Bryce decisions in force (2026-10-22)
- Lens (#3465) first — DONE (merged 9f9db7fc by Bryce).
- #3250 Escape on settings sub-page → keep two-step (hub) — closed.
- #3333 chips → 44 px. Logo upload saves instantly on BACK (by design). CLOSE GARAGE → same DISCARD EDITS? confirm (#3517).
- Issue edits/closes: orchestrator applies them (lanes refuse relayed grants); close only with tip evidence + finding-verifier CONFIRMED.
- Idle lanes do parallel work (worktrees, MCPs, subagents, web research).
- Claim text never contains '#n' (fleet.yml labels those issues `claimed`).

## Open follow-ups
- #3305 VALID (title grid clips at 844x390@200; Fleet D's title files) — not ours unless D releases.
- #3248 still slow (Title→Settings 92.9 ms handler, 30 ms forced layout) — D owns settings files.
- #3254 narrowed (1024x1366 Appearance 13 px; #3251/#3253 unchecked).
- A·I1 gallery https://claude.ai/artifact/3b5FFMpPiBxUfhtUCohhJc shows the round-1 ranking; the merged note is canonical.
- Bryce asks pending: which ideas to build (galleries: phone UX 6zLsCJzE9i6Z9EnDmXrRer, gameplay 3b5FFMpPiBxUfhtUCohhJc);
  xAI spend limit; GROK_API_KEY as a repo secret for CI (his call).
- Lessons: menu-fit `--only=<unknown>` printed nothing (fix in #3521); a subagent's GitHub issue writes can be blocked
  by auto mode — ask Bryce, then apply from the orchestrator.
