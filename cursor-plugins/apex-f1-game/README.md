# Apex F1 Game plugin

Local Cursor plugin bundling reusable Apex 26 (`brycejmurrin/f1-game`) skills for Grok bots and cloud agents.

## Skills
- Apex cloud-agent launch
- Apex specialty handoff
- Apex open-PR status matrix
- Apex Insights digest
- Apex UI screenshot runbook
- Apex garage collision guard
- Apex CI and Pages watch

## Install
Already under `~/.cursor/plugins/local/apex-f1-game/` for local discovery. To share: publish as a marketplace plugin or copy this folder.

## Ship defaults
Repo `https://github.com/brycejmurrin/f1-game`. Deploy / ship branch `claude/f1-game-project-26h3ng`. Topic work: `cursor/<topic>-<hash>` draft PRs into ship. Model `default` (Auto) only.

Launch/handoff/CI rules follow repo `AGENTS.md` plus `docs/notes/AGENT-STALL-HANDOFF-SYNC-2026-10-05.md` and `docs/notes/APEX-STEWARD-CARD-2026-10-05.md`. Specialty bots never arm auto-merge themselves; Merge Desk owns merge-when-green (MERGE commit only).
