# Issue dependencies and finding work

## Finding work

Search, never page `list_issues` (its pages miss issues): GitHub MCP `search_issues` with
`repo:brycejmurrin/f1-game is:issue is:open label:ready -label:claimed -label:blocked -label:epic`. An `epic` is a
parent; its sub-issues are the work. In a Claude cloud session `gh api search/*` is refused (repo-scoped REST only).

## Native `blocked_by`

For an issue blocked by another issue, record the relationship with GitHub's native
`GET` / `POST /repos/{owner}/{repo}/issues/{issue_number}/dependencies/blocked_by` REST API. Read both issue scopes
and existing relationships first; the POST body takes the blocking issue's numeric `id` as `issue_id`, not its issue
number. Add only a real prerequisite, not a test-only relationship. The authenticated cloud route was verified on
2026-10-29: #3971 is blocked by #1578 (HTTP 201 and GET readback).

## The `blocked` label

The native relation records the dependency; the `blocked` label is a compatibility projection while the dispatch
Action and the ready search above still filter labels (neither reads native blockers). The label also covers gates
without a blocking issue, such as an explicit maintainer deferral. Check the actual prerequisite before removing a
stale label. Do not replace complete label lists or remove another owner's relationship merely to make an issue
launchable. Evidence and reproducible counts: `docs/notes/AGENT-WORK-TRACKING-2026-10-14.md`.
