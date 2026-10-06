# Pages single-flight, 2026-10-06

## What hurt

Merge-when-green landed several ready PRs in a short window. Tip ship-fast
runs for middle SHAs were cancelled (pending replaced under `ship-fast`), and
`poke-train` could still dispatch `pages.yml` for a tip whose push CI was
still `in_progress` — e.g. Pages run
[37497278920](https://github.com/brycejmurrin/f1-game/actions/runs/37497278920)
for `85de0ac` while tip CI
[37496991170](https://github.com/brycejmurrin/f1-game/actions/runs/37496991170)
had not finished.

## What changed

1. **Workflow-level concurrency** on `pages.yml`: group `pages-train-${{ github.ref }}`,
   `cancel-in-progress: false`. One train runs; at most one pending waits; live
   publishes are never cancelled.
2. **`poke-train` tip gate** in `ci.yml`: skip the poke when any Pages run on
   the branch is not completed; when the tip has moved, poke only if that tip
   SHA already has a completed successful push CI run.

## What did not change

- Job-level `pages-gate-*` / `pages` groups (still no cancel).
- Cron backstop and manual `workflow_dispatch`.
- Agents must not cancel other sessions' CI or dual-dispatch Pages by hand.
