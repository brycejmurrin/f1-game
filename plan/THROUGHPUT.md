# Landing throughput — 2026-11-23T08:00Z → 2026-11-25T09:00Z (49 h)

Read-only. Raw data: `scratch/scope/throughput/` (`rows.json` merged PRs, `open-rows.json`, `failures.json`,
`trains.json`, `runs-*.jsonl`, `st/` gate statuses, `pr/` events+comments, `jobs/` sampled job lists).
Lane: browser = the diff touches `js/`, `css/`, `index.html` or `sw.js`; else fast. Hours, median / p90.

| metric | value |
|---|---|
| unit PRs merged (excl. 12 train PRs) | **167** (124 browser, 43 fast); 3.4/h over 49 h |
| merges/h while the queue was fed (11-24T17 → 11-25T09, 16 h) | **6.6/h** (105); peak hours 16 (train of 9) and 12 |
| hours with zero land requests → zero merges | 11-23 10–17Z, 11-24 11–17Z: supply-limited by day, serial-limited at night |
| median gap between merges | 8.9 min (p25 5.0); 18 gaps were 0 (cars of one train) |
| land.yml gate run (success) | 5.3 min, p90 16; 2,610 Land runs in 49 h (1,027 skipped, 353 cancelled, 332 retries) |
| open→ready, all | 0.35 / 8.3 |
| ready+land→merge, all | **0.80 / 3.8** (solo 0.57 / 1.9; train cars 2.66 / 5.7) |
| created→merge, all | 2.05 / 11.5 |
| land→merge > 2 h | 35 of 167 (21 %); 21 of those 35 finally landed as train cars |
| trains opened / merged / red / stale | 22 / **12** (31 cars, mean 2.6, max 9) / 5 / 4 (+1 closed, no result) |
| merged train, open→merge | 0.39 / 0.52 h; train CI 7–47 min (median ~16) |
| CI `pull_request` runs | 537: 454 ok (10.2 / 33.5 min), 45 failure, 32 cancelled (6 %), 0 timed_out |
| CI runs per merged PR | fast 2 (p90 5), browser 3 (p90 4) |
| runner-min per PR (20 sampled) | fast ~65 (7–161, ~25–35 jobs run); browser ~174 (88–314, ~55–70 jobs run) |
| one full-tier run | ~30 jobs run of 42–48 listed, ~117 runner-min |
| Pages runs | 142: 81 ok (22.7 / 37.1 min), 54 cancelled (pending replaced, designed), 5 failure (4 in 23:44–01:36Z) |
| runners right now (09:00Z) | 18 jobs in progress, 0 queued; 8 zombie runs from 2026-11-11 (#5410) still listed `queued` |

| lane / size | n | open→ready | ready+land→merge | total |
|---|---|---|---|---|
| fast | 43 | 0.18 / 2.0 | **0.42** / 5.2 | 1.47 / 8.0 |
| browser | 124 | 0.54 / 8.4 | 0.88 / 3.1 | 2.21 / 11.8 |
| <100 lines | 65 | 0.20 / 8.1 | 0.60 / 3.4 | 1.48 / 9.2 |
| 100–400 | 73 | 0.46 / 8.1 | 0.95 / 3.8 | 2.20 / 10.8 |
| >400 (25 browser, 4 fast) | 29 | 0.60 / 13.4 | 0.63 / 4.6 | 2.93 / 14.5 |
| browser <100 / 100–400 / >400 | 44 / 55 / 25 | 0.25 / 0.63 / 0.80 | 0.70 / 0.99 / 0.80 | 1.52 / 2.24 / **4.27** |
| fast <100 / 100–400 | 21 / 18 | 0.13 / 0.32 | 0.40 / 0.46 | 1.10 / 1.59 |

Caveat, merged_by: every merge, label and ready flip is by `brycejmurrin` (agents and `LAND_TOKEN` act as his
account, no `performed_via_github_app`), and there are 0 `auto_merge_enabled` events (arm merges directly). The API
cannot split Bryce's hand merges from the bot's; all 167 carried `land`, so treat them all as the land route.

## 1. Why PRs fail to land fast (35 slow merged + 20 open `land`; a PR can show several signals)

| cause (signal) | slow merged | open now |
|---|---|---|
| tip-moved re-gating loop (≥2 "deploy tip moved" / "error, will retry" gate statuses) | 17 | 6 |
| ended as a train car after the solo route stalled | 21 | – |
| base=WAIT: red deploy tip (Pages red 4× 11-24 23:44 → 11-25 01:36) | 11 | 0 |
| gate passed ≥2× but never armed (#6528 orphan: #6444 4 passes, #6451, #6335, #6334) | 5 (21 of all 167 passed ≥2×) | – |
| stranded: gate pending "re-gating" for 1–5 h, retry budget spent (#6431 03:41, #6466 05:08, #6436 05:15, #6514 08:02) | – | 4 |
| conflict (dirty) / needed a sync by an adopter | 5 | 4 (#6549, #6466, #6431, train #6540) |
| owner archived → adoption comment needed | 13 (34 of all 167) | 7 |
| retest=FAIL on the merge result (all 4 = red train #6346 bisect set, then train #6348 merged) | 4 | 0 |
| gen/ratchets FAIL on merge (fragment overage) | 0 solo; 3 of 5 red trains | 1 (#6549) |
| config=FAIL (waits for Bryce's `config-ok`) | 2 | 1 (#6541) |
| plan=FAIL (unticked Plan / CI red) | 1 | 2 (#6566, #6522) |
| cancelled CI (cancel-in-progress on a new push; no timeouts seen) | 27 cancelled runs on merged PRs, never the sole cause | – |
| runner queue wait | job start median 0–2.8 min in the sample; not a cause today (PR #6574 reports 10–30 min Pages queues earlier tonight) | – |

Mechanism: every merge moves the tip, which invalidates every other `land` PR's gate (one arm per run, `RETRY_MAX`
3 immediate re-gates per head). The solo route therefore tops out at about one merge per gate cycle (~6–9 min ⇒
6–10/h) however many PRs wait; a deeper queue only adds re-gates (53 Land runs/h). Only trains beat it (16/h hour).

## 2. Trains (land.yml `train-screen` + `train` → `tools/ci/merge-train.mjs`)

- Fires on the :17/:47 sweep and after each successful Pages run; ONE train open at a time; up to `TRAIN_MAX` 10
  cars (oldest first, `priority` first), each car's own rows must pass and the screen folds them with
  `ratchetsOnMerge`; a conflicting car is left out. A red train (CI or gate) closes and the next is capped at
  floor(n/2) (bisect, 24 h window); a car alone in a red train is barred until its head changes. A moved car
  closes the train `stale` and it rebuilds.
- Today a car whose own gate already passed is skipped ("it arms alone"); that is the #6528 orphan: lose 3 arm
  races to a moving tip, budget spent, never boarded (#6444 sat ~1h20m). Hence trains carried only 31 of 167 merges,
  mostly PRs that had already stalled solo (car land→merge 2.66 h vs solo 0.57 h: selection bias, not train cost).
- Red train causes: 3 gate (gen/ratchets/retest), 2 CI. Stale: 4 (a car pushed). 1 red → the bisect re-ran the same
  3 cars as #6348 and merged 20 min later; the 9-car #6430 went stale, rebuilt as #6462 and merged 9 cars in 24 min.
- **PR #6561** (open, `land`, `config-ok` by Bryce 08:14Z, gate re-gating on a moved tip at 09:03Z): every green
  unarmed `land` PR boards (orphans included, a lone orphan rides a 1-car train), `TRAIN_MAX` 10 → 12, screen budget
  12 → 16 min, and the train re-snaps a car's own `lines`/`codeLines` ratchet fragment (removing the stale-fragment
  red). Expected per-car red rate 0.105 → ~0.085. This turns trains into the default lane.
- **PR #6574** (draft): Pages reuses a PR's passed merge-ref gate (5 of 40 recent deploys, ~12 %), drafts run 2 guard
  jobs instead of 4, and short solo browser legs pack (66 → 58 legs on a 25-merge train plan). Frees runners; does
  not change the serial merge limit.

## 3. Recommendations

1. **Land #6561 first, then #6574**, before shaping anything else; both change what follows. #6561 is the single
   biggest lever: with trains as the default, a 12-car train every ~25–40 min is 15–25 merges/h vs 6.6/h solo.
2. **PR size: 1 unit, under ~400 changed lines.** Browser >400 lines took 4.27 h total vs 1.52 h for <100 (more
   draft time, more specs, more retries); fast-lane size barely matters (1.1–1.6 h).
3. **Combine 2–3 units into one PR only when** they are the same lane AND the same files/area (two `hud.js` edits
   that would conflict anyway, a docs+skill pair, a tooling trio), the sum stays <400 lines and none needs Bryce's
   `config-ok`. Fast-lane combining is cheap (~65 runner-min, no spec retries). **Never combine browser units across
   areas**: the spec set is the union, a flaky spec re-runs or sinks the whole PR, and after #6561 the train already
   gives batching at merge time for free. Never put a protected-path change with ordinary work (config=FAIL blocks all).
4. **In flight: keep ~10–12 ready+`land` (one train's worth), not 22.** At 22 the extra PRs only re-gate. Launch
   about 6 workers/h overnight (≈4 browser, 2 fast), adjusting to merges of the previous hour: launch = merged last
   hour + (12 − queue depth)/2. CI capacity is not the cap: ~40 runners ≈ 2,400 runner-min/h ≈ 12 browser PRs/h after
   Pages (~23 min/deploy) and trains; serialization is.
5. **Ordering.** (a) A red tip first: while Pages is red (base=WAIT, 11 of 35 slow PRs), launch the fix-forward and
   hold new `land` flips. (b) Shared hot files (`js/game.js`, `js/ui/hud.js`, `css/`, `sw.js`, `tests/data/ratchets.d`)
   go in ONE serial chain: the next unit starts from the tip after the previous merged; conflicting cars are left
   out of trains and need an adopter (4 dirty now). (c) Flip fast-lane PRs to `land` in a burst so they share one
   train; a train with no browser car should route no browser legs (unverified: train CI ranged 7–47 min, not split by lane). (d) Oldest first otherwise;
   use `priority` only for a red-tip fix or #6561-class tooling.
6. **No-human playbook** (each act logged in the PR or orchestrator issue):
   - Gate `pending` "re-gating" for >45 min with no Land run in flight (today: #6431, #6466, #6436, #6514): dispatch
     `land.yml` with `pr=<n>` through the GitHub MCP (a dispatch is the orchestrator's reversible act and touches no
     label). Toggle `land` only where the session's own comments show an agent added it; the API shows every label
     as `brycejmurrin`, so provenance must come from the PR log, never from the event actor.
   - Gate `success` and not merged for >20 min (orphan): same dispatch until #6561 lands; after it, nothing (it boards).
   - `ci=FAIL`/`plan=FAIL` or dirty with the owner archived: launch `CONTINUE PR #n` at once (34 of 167 merges needed
     an adopter; the adopted slow PRs sat 2.6–11.5 h land→merge).
   - Sync only when `dirty` or the gate reports `retest=FAIL`/`ratchets=FAIL`; a merely-behind green PR is gated on the
     merge result anyway, and every push restarts CI (~10–33 min) and stales its train.
   - config=FAIL / ratchet-raise: one `needs-decision` batch for Bryce per hour, not per PR.
   - Red train: do nothing; the bisect retries within ~30 min. A car barred alone: CONTINUE PR on that car.
   - Cancelled CI with 0 failures: check for a newer run in the same group (designed) before treating it as a timeout.
7. **Tooling candidates (file as issues, not now):**
   a. Retry budget per (head, tip) or a sweep that re-gates any `gate` pending "re-gating" older than 30 min whatever
      the budget (4 PRs stranded 1–5 h right now).
   b. Lane-aware trains: build fast-only and browser trains separately (or bisect by lane/area first), so a flaky
      browser spec never sinks docs/tooling cars and fast trains skip browser legs.
   c. Cancel the 8 zombie `queued` runs of 2026-11-11 (#5410, Land / Phone shots) and add a sweep for runs queued >24 h.
   d. Two trains in flight (one building while one gates) once #6561's red rate holds below 0.1: doubles train cadence.
   e. Record the arm actor (app vs Bryce) in the merge commit or a status, so hand merges can be measured.
