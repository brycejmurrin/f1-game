# CI, workflows and the Pages train: third pass (window 2026-10-25 16:30Z to 2026-10-26 16:45Z)

Data: Actions REST API through the agent proxy (it authenticates curl; the MCP list output has no `conclusion` field).
I read 1,020 runs and 7,292 jobs (`filter=all`), plus failed-job logs. Raw files are in the scratchpad `ci/` dir
(runs.ndjson, jobs/, logs/). The repo is **public**, so standard runners cost $0. The dollar figures use list price
(Linux $0.008/min, macOS $0.08/min) and show what this would cost on a private repo.

## Per workflow, 24 h
| workflow | runs | fail | cancel | median wall | Linux min | macOS min | $ list |
|---|---|---|---|---|---|---|---|
| ci.yml | 376 (369 PR, 6 dispatch, 1 cron) | 33 | 43 | 6.5 | 13,797 | 492 | 149.72 |
| pages.yml | 66 | 2 (+2 green only on attempt 2) | 8 (pending trains replaced, 0 jobs, by design) | 14.2 | 4,240 | 301 | 57.98 |
| gpu-census.yml | 38 (23 push, 14 dispatch) | 0 (14 since 10-12) | 0 | 4.7 | 6 | 115 | 9.27 |
| browser-group.yml | 38 dispatch | 0 | 0 | 7.2 | 719 | 0 | 5.75 |
| lit-wgsl-advisory.yml | 132 (120 before 09:28Z, 12 after) | 0 (none since 10-12) | 1 | 2.4 | 301 | 0 | 2.41 |
| fleet.yml | 138 (132 dispatch) | 4 | 26 | 2.1 | 293 | 0 | 2.35 |
| spec-timings / merge-attribution / ci-cancel-on-close | 67 / 75 / 76 | 0 / 0 / 0 (none since 10-18 / 10-12 / 10-12) | 0 | 1.0 / 0.3 / 0.1 | 77 / 23 / 7 | 0 | 0.87 |
| flake-tally, desktop, process-dashboard, ratchets-fold | 5, 7, 1, 1 | 0 | 0 | ≤2.7 | 10 | 0 | 0.08 |
| **total** | 1,020 | | | | **19,473** | **908** | **228.42/day ≈ $6.9k/month list, $0 actual** |

- **Workflows with 0 runs in 7 days:** car-shot (last run 10-03), import-models (10-02), repo-size (10-02), prune-branches (10-18),
  archive-evidence (10-19), hud-survey (never), webkit-leg (never) and changelog-fold (never; added at 09:28Z today).
- **Cost of a verdict:** a ci.yml run uses 38 runner-min. A **Pages publish uses 84 runner-min** (4,541 min over 54 green trains).
  Exact-tree reuse saved 2 of 59 trains.
- **Minutes wasted:** failed ci runs used 3,697 Linux-equivalent minutes and cancelled runs 1,203. Linux queue time was
  p50 0.03 min, p90 3.4 min, max 19.4 min (7,215 jobs). macOS queue time was p90 0.6 min.

## The train (pages.yml)
- **Push to live:** median **18.1 min**, p90 **29.3 min**, max 115.6 min (n=59 pushes). The figure in AGENTS.md (about 20 / 27) still holds.
- **Replaced while pending:** 8 trains. Red on attempt 1: 4 of 57.
  - Two failed on `race-cycle-memory` and were green on attempt 2 (40292151072, 40299869625).
  - 40295725338 (#3759): Structural guards B failed `docs/TESTING.md's file counts match the files on disk`, plus `garage-out-before-card` ("time trial from the menu").
  - 40322290836 (#3766): `garage-out-before-card` failed on both attempts. #3795 fixed it at 13:59Z. Nothing was published from 12:00Z to 14:20Z.
- **Stale greens:**
  - #3759's last green PR run started at 08:16:55Z. #3737 merged at 08:25Z and added unit files. #3759 merged at 08:55Z. The file-count red is that combination.
  - #3766 went green at 10:41Z and merged at 12:24Z with merges in between (already reported in pass 2).

## Ratchets on this tip (b07a5ac6f; origin is 7 ahead)
- `ratchets.mjs --check` and `APEX_RATCHET_ABSOLUTE=1 … --check` both report "32 metrics on 10 files + 16 tree-wide, all at or under their ceilings".
- `tests/data/ratchets.d` holds **75 fragments**, both locally and on the origin tip.
- The fold dispatch ran at **14:49:10Z** as run 40343209239, not 15:05Z. Details are in F1.

## Schedules over 7 days: last run vs cron
| workflow | cron | runs in 7 d | lateness / last run |
|---|---|---|---|
| ci | 04:17 daily | 7/7 | 4.6–5.8 h late (last 10:05Z) |
| gpu-census | 05:47 | 7/7 | 4.0–5.8 h late |
| process-dashboard | 04:47 | 7/7 | 4.4–5.8 h late |
| garage-before | 10:23 | 7/7 | 3.7–6.6 h late (last 10-25 14:27Z; today's not yet seen at 16:45Z) |
| pages | 41 */6 | 38 | fine |
| flake-tally | 06:19 + 17 */2 | **39/91 (43%)** | |
| fleet | 23,53 * * * * | **42/336 (12.5%)** | |
| ratchets-fold | weekly → daily (#3785, 09:28Z) | **0** | last scheduled run 10-19 13:20Z (failure). The Monday 10-26 slot never fired. |
| changelog-fold | Mon 06:37 | 0 | first possible run 11-02 |
| merge-attribution | 15:29 (new today 14:01Z) | 0 | none yet |

## Findings
| id | what is wrong | evidence | cost to Bryce | fix (one line) | conf | status |
|---|---|---|---|---|---|---|
| F1 | **ratchets-fold cannot open its PR and reports success.** `gh pr create` is refused: "GitHub Actions is not permitted to create or approve pull requests". The step swallows the refusal into a `::warning` and the job ends green. | Run 40343209239 log. It pushed bot/ratchets-fold 95166e5de and dispatched ci 40343625571 (green, 15:03Z), but no PR exists (only #3066, opened by hand on 10-19). The guard "Skip while a fold PR is open" (ratchets-fold.yml:68-75) never trips, so every daily run will repeat this. changelog-fold.yml:83-86 has the same code. | The fold that pass 2 recommended did not land: 75 fragments remain. From 10-27 the fold will fail silently every day; changelog-fold will too from 11-02. Nobody on the bus has noticed (claims.txt:39 shows only the bot push). | Open the PR from bot/ratchets-fold now (its CI is green). Either enable "Allow GitHub Actions to create and approve pull requests" or make the fallback `exit 1` and post a bus/issue line. | high | NEW |
| F2 | **The merge gate still accepts stale greens.** The tip re-check covers only gen:check and ratchets (merge-gate.mjs:233-266), not tooling-fast or specs. | 63 of 75 PR merges in 24 h had ≥1 other merge between their last green start and the merge (median age 38 min). After pass 2: #3724 merged 15:41Z, 734 min after its green, with 49 merges in between. #3636 waited 3,378 min. Caused trains 40295725338 and 40322290836. | 2 of 4 red trains in the window, a 140-min publish gap and fix PRs | For game PRs, refuse when the green run started before the newest tip merge that touches the PR's test or impact set, and re-dispatch ci.yml | high | STILL OPEN (pass 2 #1/#13) |
| F3 | **Unit-test flakes have no quarantine path, and tooling-fast bails on the first one.** | census-verdict.test.mjs #11 "ENOTEMPTY: rmdir …/census-gate-*/repo/.git/objects" (job 121697629888, run 40358594840, 16:28Z), with "bail: 135 of 225 file(s) not started". safety-bans-hook.test.mjs #5 'deny' !== 'allow' at loadavg 6.6, 84 s (job 121332098249); run 40247506963 was green on attempt 2. flaky-quarantine.json covers specs only. | One false red per occurrence (about 7 min fast tier plus an agent triage) | census-verdict.test.mjs:261/309: `-c gc.auto=0` plus `rmSync({maxRetries:3})`. Give the hook test a timeout that does not depend on load. Rule 9: list attempt-2 passes. | med | NEW |
| F4 | **race-cycle-memory heap limit (≤10 MiB/cycle) went red 6 times; it is not quarantined.** | PR runs 40271755087, 40278034271, 40280842337 (10.8–20.3 MiB). **macOS Metal job 121412375337: 37.2 MiB.** Trains 40292151072 and 40299869625 were green only on attempt 2. No failure since 09:35Z. | 2 train re-runs (about 20 min of train wall time) | Close it if still quiet at 10-27 09:35Z; otherwise quarantine with an expiry | med | STILL OPEN (pass 2 #8), plus new macOS evidence |
| F5 | **Cron delivery is lossy.** GitHub drops most sub-hourly crons and delays daily ones by 4–7 h. | fleet got 42 of 336 expected runs (12.5%). flake-tally got 39 of 91 (43%). Daily crons arrive 3.7–6.6 h late (table above). The ratchets-fold Monday slot was lost when #3785 rewrote the cron before the delayed run fired. | Silent gaps. Anything timed by cron (ratchets fold, nightly ci, flake tally) runs half a day late or not at all. | Make fleet.yml hourly, or dispatch-only (it already gets 132 dispatches/day). process-dashboard should flag a scheduled workflow with no run in more than 2× its period. | high (data) | NEW (pass 2 #4 covered only the fold) |
| F6 | **Authoring reds that the commit hook does not catch.** `output-surface.test.mjs` ("catalog covers every file, npm command…") and the TESTING.md count test are in tooling-fast, not `test:guards`. | The catalog test was red 4 times in 24 h: runs 40268162639, 40293152462, 40294843104, and 40352349347 (#3811's own branch, 15:44Z). The count test was red twice on PRs and once on the train. | About 7 min of CI and one push cycle each, 7 times a day | Add both to `test:guards` if each runs in under 2 s, or to `verify-change --fast` | med | NEW |
| F7 | **The release gate re-pays the full ci.yml on every merge commit.** | 84 runner-min per publish. Reuse happened on 2 of 59 trains because most merge trees differ from the PR's merge ref. | 4,541 min/day, $58/day list. Free while the repo is public. | Keep the train. If the repo goes private, reuse the PR verdict when the tip delta does not touch the PR's impact set. | med | NEW (cost framing) |
| F8 | **macOS minutes are 4.5% of the minutes but 32% of list dollars.** | 908 macOS min/day: ci Metal 33 jobs / 492 min, train Metal 19 / 301, gpu-census 21 / 115 | $73/day list, $0 actual. The train's Metal leg is its critical path (pass 2 #3). | Run the Metal leg only when render paths change (pass 2 #3) | med | STILL OPEN |
| F9 | **fleet.yml fails on its own snapshot race.** | 3 of 4 failures were "issue #N missing from coverage snapshot; retry before applying" (40355072939, 40333137753, 40331722938); 1 was a 504. 26 runs were cancelled as replaced pending runs. | A red Actions entry that agents may triage; the board is stale until the next dispatch | fleet-board.mjs: re-snapshot and retry once in-process instead of throwing | med | NEW |
| F10 | **Zero-signal, high-volume workflows.** | ci-cancel-on-close (76), merge-attribution (75), spec-timings (67): 218 runs/day, 0 failures since 10-12/10-18. 7 dispatch-only workflows idle for ≥7 d. | About 110 runner-min/day and a noisy Actions list | Fold merge-attribution and spec-timings into pages.yml's post-publish job; archive the idle dispatch-only workflows | med | STILL OPEN (pass 2 #10) |
