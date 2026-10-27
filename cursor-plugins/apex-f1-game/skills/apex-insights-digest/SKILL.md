---
name: Apex Insights digest
description: >-
  Use when mining Apex cloud-agent transcripts and workspace surveys into a
  dated insights digest.
---
# Apex Insights digest

Use when producing or refreshing a cross-agent insights digest for Apex.

## Sources (read-only)
- `/workspace/cloud-agent-transcripts/` (prefer `tail -n 1` per file for final reports)
- `/workspace/apex-*/**/*.md` surveys, plans, status
- Open PR matrix under `/workspace/apex-status-*/` if present
- CloudAgent `list` / `dump` for gaps with no local transcript

## Output
Write `/workspace/apex-insights/digest-YYYY-MM-DD.md` with:
1. Recurring issues / collision zones
2. Unfinished follow-ups (cite PR/bc)
3. Duplicate or overlapping agent work
4. Ranked next actions, each a candidate `ready` issue
5. Gaps (agents with PR but no transcript)

End with five bullets for chat. Do not launch workers from this skill: a fix becomes a `ready` issue, and the
hourly dispatcher launches it within its caps (`tools/ci/dispatch.json`, `docs/WORKERS.md` §The dispatcher). A
close-out is the PR's ```handoff block (`docs/WORKERS.md` §The Hand-off block). Never merge or arm auto-merge.
