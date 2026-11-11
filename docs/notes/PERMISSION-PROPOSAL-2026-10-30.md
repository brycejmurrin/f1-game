# Permission proposal: unattended lanes (draft for Bryce, 2026-10-30)

Bryce asked for a draft on 2026-10-30 (dispatcher AskUserQuestion, "Draft it for me"). Proposal 1 is **applied** (Bryce granted "Implement the fixes", 2026-10-30 ~07:40Z; PR number in the PR
titled "hooks: ready-flip via gh api allowed with a fresh ready-gate receipt"); 2 and 3 are not.
`.claude/hooks/**` and `.claude/settings*.json` need his explicit yes (`.claude/rules/claude-config.md`). The evidence
is `docs/notes/ORCHESTRATION-REVIEW-2026-10-29.md`, Part 1 finding 1 and Part 2 finding 1: about 3 h lost across 4
sessions to prompts nobody could answer.

## The three blocked actions, and why each blocked

| action | who blocks it | today | cost seen |
|---|---|---|---|
| draft→ready flip via `gh api -X POST repos/brycejmurrin/f1-game/pulls/<n>/ccr/ready_for_review` | repo hook: `.claude/hooks/shellparse.py` line ~1027 returns `("ask", P.ASK_READY, ep)` unconditionally | asks every time, even with a fresh ready-gate receipt | #4107 ~40 min, rejected; #4108 68 min; perf hunts #5/#6 75–108 min |
| `gh api -X DELETE repos/brycejmurrin/f1-game/issues/<n>/labels/needs-owner` (the launch prompt's adopt step) | auto-mode classifier (`[External System Writes]`), not a repo hook | denied in ≥ 4 of 11 workers | `needs-owner` left on owned PRs; the next dispatcher cycle may relaunch |
| `gh api -X POST repos/brycejmurrin/f1-game/actions/workflows/land.yml/dispatches` (re-gate one PR) | repo hook `ASK_DISPATCH` (line ~1053) and the classifier (`[Merge Without Review]`) | asks / denied | #3981 stale `gate` from 10-29 13:18Z |

The MCP route for the flip (`update_pull_request draft:false`) is already gated correctly: `github-mcp-guard.sh` denies
it without a fresh `artifacts/ready-gate/<pr>.json` receipt and allows it with one. The `gh api` route should behave
the same way.

## Proposed changes (narrowest first)

1. **Ready flip — make the hook match the MCP guard. (applied)** In `shellparse.py`, return `ask` for `…/ccr/ready_for_review`
   only when there is no fresh ready-gate receipt for that PR's live head. Reuse the receipt check
   `merge_policy.py` already applies to the MCP route. With a receipt, the hook passes; without one it denies with the
   `DENY_GATE_READY` text. Hook edit, Bryce's yes needed. No settings change.

2. **`needs-owner` removal — take it out of the worker.** No permission change. The dispatcher strips `needs-owner`
   and posts the adoption comment at launch (it already posts `dispatch: launched … as <session>`). The launch template
   then drops the step. This is in the "Dispatcher hygiene" fix PR. Optional, if Bryce prefers the worker to keep the
   step: a settings allow rule for exactly
   `Bash(gh api -X DELETE repos/brycejmurrin/f1-game/issues/*/labels/needs-owner)`.

3. **Stale `gate` re-check — remove the need to dispatch.** No permission change. `land.yml` gains `edited` (PR body)
   on `pull_request_target`, plus a scheduled sweep that re-gates a `land` PR whose `gate` is older than its newest
   green `CI`. This is in the "Landing gaps" fix PR. The manual `land.yml` dispatch stays an ask (it can arm a merge),
   and removing and re-adding `land` stays the human workaround.

## What stays exactly as it is

Merge, arm, `hold` removal, squash or rebase, run cancels, force pushes and deploy-branch pushes keep their current
deny or ask. Nothing above lets a session merge.

## To apply

Bryce answers "apply 1" (and optionally "apply 2b"). A Bryce-attended session makes the hook edit in its own PR, with
`tests/unit/` coverage for the receipt and no-receipt cases.
