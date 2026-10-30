# Orchestration roles as skills — 2026-10-30

Bryce (2026-10-30, relayed by the dispatcher): "Can we analyze our orchestration system and make things more clear.
I.e setup our roles as skills like worker doc should be a skill."

## Roles and what each must know

| role | who | must know |
|---|---|---|
| **dispatcher** | ONE persistent session per Claude account, woken hourly | the cycle and launch gate, the lock, quota, the six rules, ask-once, pause/resume, hand-off at 300k |
| **worker (lane)** | a launched session: one issue or `CONTINUE PR #n`, one PR | claim, draft PR, floor, watch, land, cap, ask-by-label, takeover, already-fixed |
| **PR owner / steward** | any session that holds a PR's head (a worker, or a hand-started one) | red triage, sync, push-once, "live" |
| **reviewer subagent** | `.claude/agents/*` spawned by a session | its brief, read-only, Sonnet |
| **in-session `worker` subagent** | `.claude/agents/worker.md`, spawned by a parent | OWNED/FORBIDDEN paths, SendMessage to `main`, no push unless told |
| **Bryce-attended session** | Bryce at the keyboard | `/ship`, `/check`, `/handoff`; AskUserQuestion is allowed |

## Where each role's knowledge lived (before)

- The worker's whole procedure was `docs/WORKERS.md` §The contract (9 items, ~70 lines), plus AGENTS.md rules 12–13, plus
  steward, ship, handoff. A launch prompt said "Read docs/WORKERS.md and follow it", so a worker read 256 lines
  of which ~110 (dispatcher internals, `LAND_TOKEN`, Cursor/Codex vendor notes) were not its role.
- The dispatcher procedure was split between WORKERS.md §The dispatcher (rules, guards) and the header of
  `tools/ci/dispatch.mjs` (the scheduled task's prompt, the cycle). No skill, so a fresh dispatcher session had to find both.
- Efficiency rules for the dispatcher (300k hand-off, ask once, pause an idle trigger, Sonnet reviewers, a denial is
  final) lived in `docs/notes/EFFICIENCY-REVIEW-2026-10-30.md` and one line each in `handoff`/WORKERS.md.

## Duplication and gaps found

1. Land mechanics (`ship-pr.mjs`, flip, label) were written in WORKERS.md §5 and again in `ship` step 6.
2. The "subscribe fails" fallback was in WORKERS.md §4 and again in `steward` override 7.
3. The dispatcher's wake/launch order existed twice (WORKERS.md summary, `dispatch.mjs` header) — the header stays the
   one home of the exact commands; the skill links it.
4. Gap: nothing said which skills a role loads and in what order, nor that the in-session `worker` subagent is a
   different thing from the launched worker.
5. Gap: no skill routed "I am the dispatcher" or "I was launched as a worker".

## Target layout (decided, not asked)

- `.claude/skills/worker` — the launched lane's contract from the worker's seat (HOME of the nine contract items,
  land mechanics, cap, takeover). Links `steward`, `ship`, `handoff`, `check-changes` instead of copying.
- `.claude/skills/dispatcher` — the hourly cycle, guards, six rules, launch procedure, efficiency rules (HOME). The exact
  command order stays in the `tools/ci/dispatch.mjs` header (forbidden to edit here; E2 owns it); the skill states
  the decisions and links the header.
- `docs/WORKERS.md` — stays, because every launch prompt and several hooks and tests name it. It becomes the entry
  page plus SHARED reference: where work is, issue dependencies, the Hand-off block format, the labels, Per vendor
  (untouched; PR #4237 edits it), `LAND_TOKEN`, what no longer exists. §The contract and §The dispatcher stay as
  headings holding the numbered one-line index (so `contract item 6`, `§5` and `§The dispatcher` pointers in
  `dispatch.mjs`, hooks, steward, ship and handoff still resolve) and link to the skill that owns the text.
- Roles that stay as they are: `steward` (the PR-owner overrides), `ship` (flip and `land` steps), `handoff`,
  `check`. Each gets only a pointer fix where it restated a moved rule.
- `.claude/agents/worker.md` stays distinct (an in-session subagent); it gains a cross-link, and the `worker` skill says
  which is which.
- Routes: AGENTS.md §Agent extensions names both new skills; the README table gets two rows.

## Why not delete WORKERS.md

Seven places outside my OWNED paths read it by name or by section (`dispatch.mjs` launch prompts, `context-cap.py`,
`launch-gate.py`, `merge_policy.py`, `ship-pr.mjs`, the Cursor plugin skills, `dispatch.test.mjs`). Keeping the file
and its headings lets those stand; a follow-up can retarget the launch prompts to "load skill `worker`" once E2's
`dispatch.mjs` work lands.
