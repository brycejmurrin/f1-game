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
| B1 | `tests/data/tooling-fast-timings.json` covers 396 of 855 files and was last rewritten 2026-10-19 (local box, `--jobs=3`). `applyFileShard` packs the 459 unmeasured files at a fallback cost and `scheduleLongestFirst` starts them FIRST in each shard (log: `132 with a recorded duration, 153 unmeasured scheduled first`). | CONFIRMED | Simulation (LPT pack with the table, 4-slot greedy run with CI-median truth) reproduces the observed split: 7.39 / 6.30 / 4.79 min vs measured means 6.44 / 6.69 / 5.28 and mean-max 7.39. With a CI-median table: 6.01 / 6.01 / 6.01. | −1.4 min per fast-tier and Pages-gate run on the critical path, 0 extra job-min |
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

## After B1: the first run-ci run (40055143256, `4d8649df`)

| shard | table (min of file time) | actual (min of file time) | ratio | step wall |
|---|---:|---:|---:|---:|
| A (1/3) | 24.0 | 28.3 | 1.18 | 7.4 |
| B (2/3) | 24.0 | 17.1 | 0.71 | 4.3 |
| C (3/3) | 24.0 | 15.3 | 0.64 | 4.0 |

The table now splits the work evenly (24.0 min of file time per shard, against
the old table's 7.58 / 6.27 / 5.13 min walls). On this run, though, every file
in A ran about 18 % slower than its median, and every file in B and C about
30 % faster. One shard's files slow down together, so this is runner speed
(GitHub-hosted runners vary by job), not packing: no table can fix it. B1
therefore removes the systematic imbalance (the old table made C 2.4 min
lighter than A on average), while the remaining spread of up to ±30 % per job
is runner noise. Judge B1 by the mean slowest-shard wall over many runs:
`node tools/ci/tooling-timings.mjs` re-reads the newest green runs and prints
the predicted walls, and the 18-run baseline above was 7.39 min mean, 7.57 p50.

B6 (new, measured here): with ±30 % runner speed per job, the wall of the
slowest of N shards grows with N even at perfect balance. A fourth shard (B2)
still cuts each shard's work by a quarter, so its gain survives the noise;
re-running a slow-runner shard does not (never re-run for speed).

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
