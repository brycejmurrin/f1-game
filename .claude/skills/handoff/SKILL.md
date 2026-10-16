---
name: handoff
description: "Use when the user asks for a handoff prompt, to continue in a new session, or a cold-start brief."
user-invocable: true
---

# /handoff — a paste-ready cold-start prompt

A new session starts with no memory and an unfetched branch, so the prompt
carries everything it needs. Output it in chat in one code block. Never write a
`HANDOFF` file to the repo root: a cold clone cannot see it (4 sessions lost
time to that).

1. **Push first.** `git status` clean, `git push -u origin <branch>`, then verify
   on the remote: `git ls-remote origin <branch>` equals `git rev-parse HEAD`.
2. **Facts**: `node tools/ci/session-status.mjs --pr` for the PR, Plan and Next
   step. If no PR exists yet, open the DRAFT PR (`/ship` step 2): the body is
   the durable log.
3. **The prompt**, in this order:
   - repo `brycejmurrin/f1-game`, branch, verified head sha, PR number and URL
   - Goal in one sentence; Plan: the done / now / next items from the PR body
   - what is not run or red, with the exact command to reproduce
   - first commands: `git fetch origin <branch> && git checkout <branch>`, then
     `node tools/ci/session-status.mjs --pr`
   - skills to load (`.claude/skills/README.md`), and the user's grants quoted
     with their time; no merge grant is implied
4. Under ~25 lines. Link the PR for detail instead of pasting it.
