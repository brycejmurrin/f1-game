---
name: Apex cloud-agent launch
description: >-
  Use when launching a Cursor Auto cloud agent for Apex (f1-game): ship branch,
  prompt template, attachments, no twin agents.
---
# Apex cloud-agent launch

Use when launching a Cursor cloud agent for the Apex (f1-game) repo.

## Defaults
- Repo: `https://github.com/brycejmurrin/f1-game`
- Ship branch / `starting_ref`: `claude/f1-game-project-26h3ng`
- Model: `default` (Auto). If Auto is blocked by usage, tell the user and only then use an alternate they approve.
- Never clone the repo onto the box; cloud agent does coding.

## Prompt template (fill gaps)
1. **Goal** — outcome, not line edits.
2. **Context** — symptoms, PR number/URL, attached files/images.
3. **Constraints** — draft PR unless asked; do not merge; stay in lane (UI/cars/tracks/perf/audio/net).
4. **Success** — PR link or clear “no PR”; tests run / named not-run.
5. Invite the agent to verify its own diagnosis.

## Attachments
- Screenshots → `images: [{url: file:///…}]`
- Exports/JSON/logs → `files: [{url: file:///…}]`

## After launch
- Tell the user with agent URL + cursor-agent card.
- FYI the owning specialty bot (priority false) with bc id + title.
- Do not launch a twin for the same PR/task; `reply` to the existing agent instead.
