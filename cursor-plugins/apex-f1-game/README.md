# Apex F1 Game plugin

Local Cursor plugin bundling reusable Apex 26 (`brycejmurrin/f1-game`) skills for Cursor cloud agents.

## Skills
- Apex cloud-agent launch
- Apex PR hand-off
- Apex open-PR status matrix
- Apex Insights digest
- Apex UI screenshot runbook
- Apex garage collision guard
- Apex CI and Pages watch

## Install
Already under `~/.cursor/plugins/local/apex-f1-game/` for local discovery. To share: publish as a marketplace plugin or copy this folder.

## Ship defaults
Repo `https://github.com/brycejmurrin/f1-game`. Deploy branch `claude/f1-game-project-26h3ng`. Topic work: `cursor/<topic>-<hash>` draft PRs into it with `Closes #<n>`, `lane:cursor` and a ```handoff block. Model: `composer-2.5` routine; Grok 7 hard only (slug at launch); never `default`/Auto; dispatcher uses `hosts.cursor.model` in `tools/ci/dispatch.json`.

The work contract (claim, draft PR, hand-off, landing, the dispatcher and its caps in `tools/ci/dispatch.json`) is `docs/WORKERS.md`; repo rules are `AGENTS.md`. GitHub lands PRs; workers do not merge.
