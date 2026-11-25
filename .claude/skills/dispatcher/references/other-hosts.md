# Orchestrating from Codex or Cursor (no session messaging)

Read when the orchestrator is a Codex thread or a Cursor agent, for example because the Claude tokens ran out. Those
hosts cannot call `create_session`, `send_message` or `list_sessions`, so **GitHub is the whole bus**: the brief is an
issue comment, the state is the PR's Plan and Hand-off block, and the signals are labels. Facts and sources:
`docs/notes/MULTI-AGENT-CODEX-CURSOR-2026-11-25.md`. Per-host lane rules: skill `steward`
[`references/vendors.md`](../../steward/references/vendors.md). Everything else is the same as
[`orchestrator-brief.md`](orchestrator-brief.md).

## What changes from the Claude flow

| Claude orchestrator | Codex or Cursor orchestrator |
|---|---|
| `create_session` launches a worker | **Bryce launches.** No agent starts another agent through his login (`docs/AGENT-SURFACE.md` §Per vendor). Post the brief as an issue comment, and he opens a Codex cloud task, a Cursor agent or a Claude session on it. |
| `send_message` steers a running worker | Codex: a PR comment that starts `orchestrator:` and names the change; the worker reads it when it wakes or at its next checkpoint. Cursor's token posts no comments or labels ([`vendors.md`](../../steward/references/vendors.md)), so a Cursor orchestrator writes the change into its own PR's `next:` line and Bryce relays it. |
| `list_sessions` / `child-health.mjs` | `node tools/ci/pr-board.mjs --brief`: the LEASE column (`live`, `parked`, `lapsed`) and `churn:` replace the session list. A lapsed lease means the worker is gone: put the PR in the step 3 list for Bryce, who starts a `CONTINUE PR <n>` session (steward §Lane 3). |
| `subscribe_pr_activity` | steward [`references/host-watch.md`](../../steward/references/host-watch.md) §Codex and Cursor. |
| Subagent reviewers (`.claude/agents/`) | Per host: steward [`references/vendors.md`](../../steward/references/vendors.md) (Codex: built-ins only, point them at the card; Cursor loads the cards). No hook enforces the subagent rules there, so the prompt states them. |
| `config-ok` / `ratchet-raise` added by the orchestrator | Not on Codex or Cursor. Their writes come from another GitHub App (`chatgpt-codex-connector` on Codex), which the gate does not count as an agent's. Put the request in the PR's `next:` line for Bryce or a later Claude orchestrator. |

## The brief, as an issue comment

Post one comment per issue (on Cursor, hand it to Bryce to paste). It is the whole task for whichever host Bryce
starts. It is [`orchestrator-brief.md`](orchestrator-brief.md) §The brief with its message line replaced, because the
worker cannot message you. Every line must be checkable on GitHub.

```text
BRIEF for any host (Claude, Codex, Cursor). AGENTS.md and skill `steward` bind; this adds only task facts.
ASK (Bryce's words, with the time): "<quote>"
TASK: <the one unit; what a player or an agent sees when it is done>
EVIDENCE: <the repro or measurement and its command; JS symbols as apex-lsp calls>
STATE: deploy tip <sha> at <time>; open PRs on the same paths (shared, not a blocker: D-033): <list>; decisions already made: <comment URLs>
DONE WHEN: <the check that proves it, e.g. a named unit test or `verify-track <id>`>
BRANCH: Claude `claude/<topic>`; Cursor and Codex `cursor/<topic>-<hash>`; draft PR with `Closes #<n>` and `lane:<host>`
REPORT: only through the PR: Plan ticks, the Hand-off block (`owner:`, `next:`), `needs-decision` plus ONE comment
  (a Cursor worker writes both into `next:`).
STOP AT: start+<N>k (the form `context-cap.py` reads); at the cap push, refresh the Hand-off block with `owner: none` and stop.
```

## The loop, per checkpoint

1. `node tools/ci/pr-board.mjs --brief`, then read every PR whose head or labels changed since the last checkpoint.
2. A red on a live owner's head belongs to the owner. A lapsed lease gets one adoption comment, and Bryce or a Claude
   session takes it.
3. What needs Bryce goes in ONE list in his chat, first item first, each with its link and the exact `decision:` line.
4. Arm the next wake (the `subscribe_pr_activity` row of the table), then end the turn. No sleep or shell-poll loops
   (AGENTS.md rule 13).

When Claude tokens return, a Claude orchestrator takes over from GitHub alone. It needs no hand-over message, because
every brief, lease and decision is already on the issues and PRs.
