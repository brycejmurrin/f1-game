# Build / CI wall-time hunt — 2026-10-24 (A·H16)

Lane: developer and CI wall time without weakening any gate. Measured first,
ranked by minutes saved per day × risk. Prior art (do not re-report):
`CI-WALL-TIME-HUNT-2026-10-21.md` (F5, F10–F12 open), `CI-TOOLING-RESEARCH-2026-10-21.md`,
`CI-SELECTION-PLAN-2026-10-16.md`, `COMMIT-GUARD-CACHE-2026-10-19.md`,
`COMPILE-CACHE-TRIAL-2026-10-18.md`, `PREPUSH-GATE-LADDER.md`.

## Sources

- `origin/metrics:process-dashboard.md` (generated 2026-10-23T09:39Z, 60 ci.yml runs).
- Actions REST through `tools/ci/github-api.mjs`: job and step timings of the
  newest 60 completed ci.yml runs and 12 pages.yml runs (2026-10-24 ~01:50Z).
- Per-file `PASS … duration=` lines from the `Structural guards (tooling A/B/C)`
  logs of six green PR runs: 40050551457 40049093922 40048414428 40048298047
  40048291537 40047496884 (855 of 855 tooling-fast files, 6 samples each).
- Runner size: ubuntu-latest on a public repo is 4 vCPU / 16 GB
  (https://docs.github.com/en/actions/reference/runners/github-hosted-runners),
  so CI's `--jobs=4` matches the core count.

## Where the fast tier spends its wall

The draft fast tier (run-ci label) is guards A/B/C + seconds-long jobs, so
its wall is the slowest of the three tooling shards (dashboard: fast tier p50
10.6 min, p90 13.7; guards family p50 6.5, p90 9.8). The same three shards
also sit on the Pages gate (`ci / Structural guards (tooling *)`), where they
are the critical path whenever no oversize hud-layout spec leg runs
(runs 40047165244, 40045948002).

Tooling-fast step only, 18 green runs where all three shards ran:

| shard | mean (min) |
|---|---:|
| A (1/3) | 6.44 |
| B (2/3) | 6.69 |
| C (3/3) | 5.28 |
| slowest per run (the wall) | mean 7.39, p50 7.57 |
| perfect balance (mean of the three) | 6.14 |

## Findings

| id | lever | verdict | evidence | minutes |
|---|---|---|---|---|
| B1 | `tests/data/tooling-fast-timings.json` covers 396 of 855 files and was last rewritten 2026-10-19 (local box, `--jobs=3`). `applyFileShard` packs the 459 unmeasured files at a fallback cost and `scheduleLongestFirst` starts them FIRST in each shard (log: `132 with a recorded duration, 153 unmeasured scheduled first`). | CONFIRMED (cause) · win UNCONFIRMED | Simulation (LPT pack with the table, 4-slot greedy run with CI-median truth) reproduces the observed split: 7.39 / 6.30 / 4.79 min vs measured means 6.44 / 6.69 / 5.28 and mean-max 7.39. With a CI-median table: 6.01 / 6.01 / 6.01. | predicted −1.4 min; NOT confirmed on 2 runs (7.4, 7.5 vs 7.39 baseline), see §After B1 |
| B2 | Four tooling shards instead of three. | PROPOSED | Same simulation with fresh timings: 4.51 min × 4. One more runner per run (~0.4 min setup: checkout 0.1 + setup-apex 0.1 + hash/cache). | a further −1.5 min wall; +~0.4 job-min per run |
| B3 | The table rots again: every new test file is unmeasured until someone runs `--record` locally, and local timings are a different machine and `--jobs`. | PROPOSED | 459 files went unmeasured in 5 days. Fix: a harvest CLI that folds the CI shard logs' per-file durations (median) into the table, run by the existing timings bot or by hand. | keeps B1's −1.4 min |
| B4 | `npm run test:tooling-fast` (the pre-push floor every session runs) defaults to `--jobs=1`. | MEASURING | see §Local floor | — |

## Local floor

This container (4 cores, one session):

| run | wall |
|---|---:|
| `npm run test:tooling-fast` (default `--jobs=1`), 856 files | ~47 min: the sum of per-file times; stopped after 5 files (≈40 s each) |
| `tooling-fast.mjs --jobs=3` | 966 s and 962 s (16.1 min), loadavg ~5 |

B4 (auto `--jobs=2` on a quiet box) is its own PR, which OrchA 32 approved with conditions.

## After B1: two run-ci runs — NOT CONFIRMED

| run | shard | table (min of file time) | actual (min of file time) | ratio | step wall |
|---|---|---:|---:|---:|---:|
| 40055143256 (`4d8649df`) | A (1/3) | 24.0 | 28.3 | 1.18 | 7.4 |
| | B (2/3) | 24.0 | 17.1 | 0.71 | 4.3 |
| | C (3/3) | 24.0 | 15.3 | 0.64 | 4.0 |
| 40056252968 (`3a3b6c30`) | A (1/3) | 24.0 | 28.4 | 1.19 | 7.5 |
| | B (2/3) | 24.0 | 21.6 | 0.90 | 5.5 |
| | C (3/3) | 24.0 | 23.3 | 0.97 | 6.1 |

The table splits the work evenly on paper, yet the slowest shard ran 7.4 and
7.5 min, the same as the 18-run baseline (7.39 mean, 7.57 p50). Shard A's files
ran 18–19 % over their medians on BOTH runs, so that is not random runner speed
(B and C moved between 0.64 and 0.97). It is not load either: mean loadavg was
6.2 / 6.8 / 6.7 across A / B / C. A's two longest files (`apex-tools-mcp`
237–241 s, median 221; `real-replay-vm` 171–174 s, median 148) both start at
t=0. My working hypothesis is that per-file durations depend on what runs beside
them (both spawn child processes), so medians taken under the OLD packing
misprice the new one. Next: re-harvest from runs on the new packing
(`node tools/ci/tooling-timings.mjs --runs 6`), which folds that context back
in, and check the slowest-shard wall again. Until then B1 is a coverage fix
(855/855 files measured, none started blind) and a tool, not a measured win.
No regression either: 7.4 / 7.5 are inside the baseline's spread.

## Re-consider: existing levers

| lever | keep / revisit / drop | why |
|---|---|---|
| guards verdict cache keyed on inputs hash `./` (#1712) | keep | whole-tree key, so it only hits on re-runs of an identical tree; correct and cheap |
| draft reuse on ready_for_review (reuse-draft-fast.sh) | keep | removes a full guards re-run per ready flip |
| blob-less full-history checkout (C6) | keep | 25 s → 9 s measured |
| `--bail` on CI shards | keep | red shards stop early |
| longest-first packing by committed timings (516d02e0) | revisit → B1/B3 | right design, stale data |
| Chromium binary cache | drop (already rejected) | restore ≈ download (CI-TOOLING-RESEARCH idea 8) |
| hud-layout four-way split (F10) | still open | critical path of Pages/full tier when hud-layout is selected (9.4–11.0 min legs in runs 40043898081, 40042330271) |
