# Backlog check-in: 2026-10-29

Issue: [#1518](https://github.com/brycejmurrin/f1-game/issues/1518).
This completes the two-week check-in requested by the
[original October 14 research](../archive/notes/AGENT-WORK-TRACKING-2026-10-14.md).
That research is archived; this live path records the later measurement and capability check.
The current coordination contract is [WORKERS.md](../WORKERS.md), not the archived claims/bus procedure.

## Issue volume

Measured from the authenticated GitHub search API on **2026-10-29, approximately 00:20 UTC**.
The two completed UTC weeks are October 15–21 and October 22–28, inclusive.
Every query includes `repo:brycejmurrin/f1-game is:issue`, excluding pull requests.
All responses reported `incomplete_results: false`.

| UTC dates | Opened | Closed | Opened minus closed |
|---|---:|---:|---:|
| 2026-10-15 through 2026-10-21 | 440 | 427 | +13 |
| 2026-10-22 through 2026-10-28 | 70 | 207 | −137 |
| Both weeks | 510 | 634 | −124 |

The current open-issue search returned **59**, below the research's approximate 250-open-issue point for
reconsidering Linear. The current volume does not justify a tracker migration. Continue using GitHub Issues
and measure again if the backlog grows or labels cease to make the work usable.

These counts are issue records matching `created:` or their current `closed:` timestamp, not an immutable
transition ledger. Reopened issues and repeated close/reopen cycles can change historical search counts.
Closed includes completed, not-planned and duplicate dispositions; it does not mean 634 technical fixes.
The 59-open snapshot includes the maintainer's October 29 deferrals, which are outside the two full weeks.

Reproduce the five searches; `total_count` is the count, not the number of returned rows:

```sh
gh api -X GET search/issues -f q='repo:brycejmurrin/f1-game is:issue created:2026-10-15..2026-10-21' -f per_page=1 --jq '{total_count,incomplete_results}'
gh api -X GET search/issues -f q='repo:brycejmurrin/f1-game is:issue closed:2026-10-15..2026-10-21' -f per_page=1 --jq '{total_count,incomplete_results}'
gh api -X GET search/issues -f q='repo:brycejmurrin/f1-game is:issue created:2026-10-22..2026-10-28' -f per_page=1 --jq '{total_count,incomplete_results}'
gh api -X GET search/issues -f q='repo:brycejmurrin/f1-game is:issue closed:2026-10-22..2026-10-28' -f per_page=1 --jq '{total_count,incomplete_results}'
gh api -X GET search/issues -f q='repo:brycejmurrin/f1-game is:issue is:open' -f per_page=1 --jq '{total_count,incomplete_results}'
```

## Native dependency write: verified

Read the current official
[issue-dependency REST documentation](https://docs.github.com/en/rest/issues/issue-dependencies?apiVersion=2022-11-28)
on October 29. It documents listing, adding and removing native `blocked_by` relationships. The add operation
requires Issues write permission and the blocking issue's numeric `id`, not its issue number.
The current documentation's request examples use API version `2026-03-10`; the live check used that version.

The meaningful relationship was [#3971](https://github.com/brycejmurrin/f1-game/issues/3971), which explicitly
follows the optional handling-damage work in [#1578](https://github.com/brycejmurrin/f1-game/issues/1578).
Both issues were open. The #3971 body describes carrying #1578's setting into room rules; the prerequisite
implementation is still in PR #3970. Before the write, GET returned an empty dependency list.

Exactly one dependency POST was made at **2026-10-29 00:21:19 UTC**:

```sh
gh api -X POST -H 'Accept: application/vnd.github+json' -H 'X-GitHub-Api-Version:2026-03-10' repos/brycejmurrin/f1-game/issues/3971/dependencies/blocked_by -F issue_id=5844656283
```

It returned **HTTP 201 Created**, exit 0. A subsequent GET returned issue `number: 1578`,
`id: 5844656283`, `state: open`, confirming that #3971 is blocked by #1578:

```sh
gh api -H 'X-GitHub-Api-Version:2026-03-10' 'repos/brycejmurrin/f1-game/issues/3971/dependencies/blocked_by?per_page=100'
```

No fake issue, temporary relationship, token output or credential change was needed. The result verifies this
authenticated cloud route, not every provider's credentials. The relationship is genuine backlog state and
remains in place; do not rerun the POST as a probe or remove it merely to repeat this measurement.

## Dependency convention

Use native relations as the record of issue-to-issue prerequisites. Follow the procedure in WORKERS.md:
inspect both scopes and existing relations before writing, and use the numeric blocker ID.
Retain the `blocked` label as the dispatcher/search compatibility projection until those consumers read native
relationships. The label remains appropriate for non-issue gates such as an explicit maintainer deferral.
A successful REST write does not mean that the dispatcher has automatically gained dependency awareness.

This is a documentation and backlog-state check-in. It changes no gameplay, dispatcher implementation,
credentials or service configuration.
