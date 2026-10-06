---
name: Apex open-PR status matrix
description: >-
  Use when building or refreshing the Apex (f1-game) open-PR and CI status
  matrix with gh (no clone).
---
# Apex open-PR status matrix

Use when the user wants a thorough open-PR / CI status for Apex (f1-game).

## Steps
1. `gh pr list -R brycejmurrin/f1-game --state open --limit 100 --json number,title,isDraft,mergeable,headRefName,baseRefName,updatedAt,createdAt,url`
2. Write `/workspace/apex-status-YYYY-MM-DD/open-prs.json` and a markdown table `open-prs.md`.
3. For ready (non-draft) PRs, run `gh pr checks <n> -R brycejmurrin/f1-game` (non-zero exit on fails is OK). Classify GREEN / PENDING / RED.
4. Spot-check newest drafts and any known reds.
5. Summarize to the user: open count, draft/ready, green/red/pending, collision notes (`cursor/*` count), top oldest + newest.

## Rules
- No local clone.
- Agents never arm auto-merge; only CI Watch arms SQUASH on ready PRs. This skill is read/report unless the user asked to fix reds. Never merge/arm from here.
- Prefer one executor for the matrix build.
- Summarize `cursor/<topic>-<hash>` collision notes; do not rename legacy `claude/<topic>` heads.
