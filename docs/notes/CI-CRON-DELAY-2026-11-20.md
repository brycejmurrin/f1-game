# Scheduled-run delay and queue quiet hours, 2026-11-20

Summary: GitHub starts this repo's daily scheduled runs 6 to 10.5 h late (median about 8 h), and the late
start put the nightly and the ratchets fold into the busiest hours of the queue (09-14 UTC). The ci.yml nightly
cron moves from 04:17 to 16:17 UTC and ratchets-fold from 06:17 to 17:17 UTC, so the measured delay lands their
starts in the quiet window (about 21-05 UTC, quietest 00-02 UTC).

Kind: measurement · Re-measure-by: 2026-12-20 (check the new starts land 22-03 UTC; the delay is GitHub's, not ours).

## Method
Actions REST API, read-only, 2026-11-06 to 2026-11-20. Delay = `created_at` minus that day's cron time, for
every `event=schedule` run of each daily workflow (`run_started_at` equals `created_at` on all of them). Load =
runs in flight (`run_started_at` to `updated_at`, capped at 3 h) per minute for ci.yml, pages.yml,
browser-group.yml and phone-shots.yml, fetched per workflow per day (the repo-wide listing caps at 1000 a day
and land.yml fills it), averaged by hour of day over 11-06 to 11-19. Run-level, not job-level: a ci.yml run is
the unit that holds runners, and ci.yml is about 90 % of the in-flight count.

## Delay (hours late, n = 15 days unless noted)
| workflow | cron (UTC) | min | median | max |
|---|---|---|---|---|
| ci.yml nightly | 04:17 | 6.76 | 8.35 | 9.10 |
| process-dashboard | 04:47 | 6.58 | 8.27 | 9.17 |
| gpu-census | 05:47 | 6.15 | 8.00 | 9.13 |
| ratchets-fold | 06:17 | 6.64 | 8.54 | 9.90 |
| garage-before | 10:23 | 6.17 | 7.59 | 10.49 |
| changelog-fold (n=2) | Mon 06:37 | 9.77 | 9.99 | 10.22 |
| knowledge-gc (n=2) | Mon 07:23 | 9.72 | 9.97 | 10.22 |
| desktop (n=2) | Wed 09:41 | 7.73 | 8.21 | 8.68 |

The delay moves together across workflows on a day (11-20: 8.3-9.1 h for all five dailies) and does not depend
on the cron hour across 04:17-10:23. pages.yml's 6-hourly cron is a second sample: the 12:41 UTC slot started
19-22 UTC (about 6.5-9.5 h late) and the 00:41 slot about 07 UTC. Sub-hourly crons are mostly dropped (land.yml
`17,47`: 54 runs of 672 slots; flake-tally: 63 of 182).

## Load by hour (mean ci.yml runs in flight; the other three add at most 1.2 in any hour)
| UTC | PT | ci.yml | | UTC | PT | ci.yml |
|---|---|---|---|---|---|---|
| 00 | 16 | 2.95 | | 12 | 04 | 11.33 |
| 01 | 17 | 2.46 | | 13 | 05 | 10.38 |
| 02 | 18 | 3.78 | | 14 | 06 | 9.41 |
| 03 | 19 | 5.10 | | 15 | 07 | 6.78 |
| 04 | 20 | 3.68 | | 16 | 08 | 5.55 |
| 05 | 21 | 4.24 | | 17 | 09 | 8.51 |
| 06 | 22 | 5.56 | | 18 | 10 | 8.17 |
| 07 | 23 | 5.83 | | 19 | 11 | 7.19 |
| 08 | 00 | 6.90 | | 20 | 12 | 7.33 |
| 09 | 01 | 10.87 | | 21 | 13 | 5.32 |
| 10 | 02 | 12.47 | | 22 | 14 | 4.85 |
| 11 | 03 | 11.54 | | 23 | 15 | 3.65 |

Load is bursty by day: 10 of 14 days were near idle all day, and the four burst days (11-10, 11-11, 11-18,
11-19) carried most of it. On those four, 00-03 UTC averaged 8.0 / 15.4 / 0.0 / 8.9 runs in flight against
32.0 / 47.8 / 52.8 / 25.0 at 09-14 UTC, so the quiet window holds on the days that matter.

## The change
- ci.yml nightly `17 16 * * *`: with the measured delay it starts 23:03-01:23 UTC (median 00:38).
- ratchets-fold `17 17 * * *` (`13 17 * * *` since 2026-11-21, off the shared :17 minute): starts 23:55-03:11 UTC (median 01:49), after the nightly.
- Untouched: gpu-census (05:47, starts about 14 UTC, still in the busy window), process-dashboard,
  garage-before, land.yml and pages.yml. gpu-census stays staggered from the nightly
  (`tests/unit/ci-gpu-census.test.mjs`).

If the starts drift out of 22-03 UTC when re-measured, the delay changed with the cron hour; re-measure before
moving again.

## The red nightlies (11-18, 11-19, 11-20)
- 11-20 (44739348355, 322c63a3): no test failed. The 60-min schedule plan's over-budget pool (9 jobs, 3240 s) was
  full, so it DROPPED `perf-boost-press-pipelines.spec.js` and `race-cycle-memory.spec.js`, and
  `selected-gate-verdict.mjs` reds any dropped spec outside a draft or the train. Fix (orchestrator's decision, on
  Bryce's delegation, 2026-11-20 ~19:09Z): `schedule` alone gets `NIGHTLY_OVER_BUDGET_SHARDS = 12` (4320 s). A
  whole-suite route on tip a671f12b with the bot/spec-timings overlay needs 3608 s (11 jobs); 12 leaves ~20 %.
  The verdict stays strict.
- 11-19 (44529427931): two load flakes, first seen: perf-frametime's ratio gate (p50 950 ms vs 516.6 ms baseline)
  and shipped-defaults' pit-stop boot wait (requestAdapter() no answer in 4 s, 45 s timeout). Not quarantined.
- 11-18 (44309493009): `css-critical-path.test.mjs` blocking CSS 239056 B vs < 239000; fixed on the tip
  (238481 B, a 519 B margin). The Metal renderer job hit its 30-min cap (a timeout).
