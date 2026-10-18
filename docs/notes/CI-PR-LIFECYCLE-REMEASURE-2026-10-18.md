# PR CI lifecycle — 24 h re-measure (#2213, epic #1949)

**Window:** 24 h ending 2026-10-18T04:51Z (UTC).  
**Tool:** `node tools/ci/measure-pr-ci-after-close.mjs --hours 24 --json --max-runs 120`  
**Scope:** `ci.yml` `pull_request` runs into deploy branch `claude/f1-game-project-26h3ng`; jobs with `status: completed` only; run wall times exclude `cancelled` / `skipped` / `stale` and runs under 3 min wall (draft fast-tier noise).

## Results (2026-10-18 run)

| Metric | 2026-10-15 baseline (#2213) | 2026-10-18 |
|--------|-----------------------------|------------|
| Job-minutes starting **after** PR closed | **11 %** (1,831 / 17,393) | **0.00 %** (0 / 1,550) |
| Peak UTC hour (by run count) | (not recomputed) | **22** (6 runs) |
| Median PR **run** wall in peak hour | — | **11.2 min** |

Sample: 120 runs, 15 PRs, 459 completed jobs, 1,550 job-minutes counted.

Raw JSON: `/opt/cursor/artifacts/measure-pr-ci-24h.json` on the measuring agent.

## Done-when (#2213 / epic #1949)

| Criterion | Met? |
|-----------|------|
| Post-close job-minutes **< 1 %** | **Yes** (0.00 % in this window; small sample of closed PRs — no post-close job starts observed) |
| Peak-hour median PR wall **≤ 20 min** (epic #1949) | **Yes** (11.2 min at UTC 22) |

Workflow experiment (`closed` trigger cancel) remains out of scope for this PR (hooks forbid unsanctioned workflow edits; Bryce decision on auto-cancel).

## How to reproduce

```sh
node tools/ci/measure-pr-ci-after-close.mjs --hours 24
node --test tests/unit/measure-pr-ci-after-close.test.mjs
```

Fixes #2213 (re-measure + note). Epic #1949: peak-hour median criterion ticked for this window; sub-issues for workflow cancel experiment remain open.
