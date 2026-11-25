---
name: handoff
description: "Use when asked for a handoff or a prompt for a new session, the context is long or near its limit, or a worker hits its cap. Not for: editing skills → agent-config; driving a PR → steward."
user-invocable: true
---

# /handoff — a paste-ready cold-start prompt

A new session starts with no memory and an unfetched branch, so the hand-off
carries everything it needs. Never write a `HANDOFF` file to the repo root: a
cold clone cannot see it.

The cap is the brief's `STOP AT` line (`start+<N>k`: a budget above the first turn's context); `.claude/hooks/context-cap.py` advises on live context against it and refuses
spawns over the hard cap; a session without a brief has no cap and hands off when the user asks or the context is
long. Before idling, write the follow-up prompts into the PR's Hand-off block. Model names and messaging routes are
host-specific; use only exposed host capabilities.

Endings by audience (steps 1–2 are shared):

- **Attended** (the user asked, or the context is long; no brief, so no cap advisory): steps 1–3, then output the
  prompt in chat in ONE code block. Add no `needs-owner` unless the user leaves the PR to the fleet.
- **Unattended owner at its cap or stuck** (skill `steward` §Lane 5; `context-cap.py` advises against the cap in
  `tools/ci/worker-prompt.md`): steps 1–2, then add `needs-owner` (MCP `issue_write`: the live list plus it, skill `steward` `references/labels.md`)
  and end. No chat prompt: the takeover reads only the Hand-off
  block and the Plan; the orchestrator launches it once no live owner names the PR.
- **Orchestrator at ~400k context** (retro 2026-11-25: one orchestrator held 594M of 1,901M cache-read tokens):
  write the handoff as a comment on the orchestration tracking issue or PR (open PRs, live sessions, decisions
  pending, Bryce's grants quoted with their times, held items, the full task list), launch a fresh orchestrator with
  `create_session` (environment_id `env_019j6UuJTdHnhCNbThaF5CRy`, "f1-game orchestrator"; permission_mode `auto`)
  whose prompt links that comment, then stop. No chat prompt; the successor reads the comment, rebuilds the task list
  before acting, re-creates the two standing routines and disables the predecessor's (dispatcher
  `references/orchestrator-brief.md` §Standing routines).
- **Quota wall** (a usage-limit warning or a 429 `usage_limit_reached`; six workers died on one at 2026-11-18
  22:32–23:37Z and two lost uncommitted work, #5844): do step 1 and refresh the Hand-off block NOW, before the
  next call, then end without arming a check-in; every wake re-hits the wall. Long waits: AGENTS.md rule 12.

1. **Push first.** A dirty tree or unverified work: commit it as WIP anyway, in two calls (`git add <paths>`, then
   `git commit`; AGENTS.md rule 12), and list what is unverified as **Not run**. If the commit hook's guards
   refuse, fix that guard row, or leave those paths unstaged and list them as "uncommitted, lost with this
   container". Then `git push -u origin <branch>` and confirm on the remote:
   `git ls-remote origin refs/heads/<branch>` shows `git rev-parse HEAD`.
2. **Facts**: `node tools/ci/session-status.mjs --summary --pr` for branch/PR/CI state (its Markdown feeds
   **Verified / Not run**; it is not the Hand-off block). Read the PR body for its Plan and Next step with
   GitHub MCP `pull_request_read` (or `gh api repos/brycejmurrin/f1-game/pulls/<n> -q .body`). No PR yet → open a
   DRAFT PR (skill `steward` §Open): the body is the durable log. Refresh its Plan and the ` ```handoff ` fence
   (`head`, `owner`, `next`; `.github/pull_request_template.md`) with `update_pull_request`.
3. **The prompt**, in this order:
   - repo `brycejmurrin/f1-game`, branch, pushed head sha, PR number and URL
   - first: ADOPT the PR (skill `steward` §Lane 3): comment `adopts PR #<n> — <host>:<session id>`,
     remove `needs-owner` if set (MCP `issue_write`: the live list minus it, skill `steward` `references/labels.md`; an
     orchestrator-launched owner may already have done this), set `owner:` in the Hand-off block
   - Goal in one sentence; Plan: the done / now / next items from the PR body
   - what is not run, unverified or red, with the exact command to reproduce
   - accessible evidence links; ignored `artifacts/` or `scratch/` paths are
     local to the old workspace unless separately transferred or published. Read back the updated PR body;
     a successful update records the hand-off, but does not prove a successor was launched or acknowledged it
   - first commands: inspect `git status` and read `AGENTS.md`; fetch `origin <branch>`, resolve
     `FETCH_HEAD` and compare it with the recorded pushed head. Create an isolated worktree from that SHA
     when another session owns the checkout; never switch its branch. Run
     `node tools/ci/session-status.mjs --summary --pr` from the resolved checkout
   - skills to load (`.claude/skills/README.md`), and the user's grants quoted
     with their time; no merge grant is implied
   - the rest of AGENTS.md `# Compact instructions` that applies: the `hold`,
     `needs-decision` and `claimed` labels you set, a run in flight and its log
     path (`artifacts/logs/<name>.log`), armed Monitor / background-task ids (so the
     successor can stop them), OWNED / FORBIDDEN paths
4. Under ~25 lines. Link the PR for detail instead of pasting it. The PR body's
   Hand-off block is the one hand-off a lane leaves behind.

A hunt or survey session ends by filing: its ranked findings become `ready` issues (one per finding) or ONE tracking
issue before the session ends; findings left in branch notes are lost (the UI hunts left 12 and 17 bugs there). Give
every hunt an id nothing else carries and a `docs/notes/` index entry linking its reports.
