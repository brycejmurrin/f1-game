# Checks and field instruments

## Which check for which edit

Node checks, subagent-safe unless marked:

| Edit | Gate |
|---|---|
| OT fire, ERS, lane nudge, brake target | `node --test tests/unit/ai-drive.test.mjs` (~1 s) |
| otWant / pass latch / side yield | `ai-racecraft-vm.test.mjs` (read its header) |
| pass / defend / tactics | `ai-pass-complete.test.mjs` + `ai-pass-defend-vm.test.mjs` + `ai-trail-yield-vm.test.mjs` |
| stuck / rescue | `ai-stuck-vm.test.mjs` + `ai-pack-stuck-vm.test.mjs` |
| pace band | `ai-band.test.mjs` |
| field effect | `ai-race.mjs tactics` / `stuck` `--runs 5` (VM, below) |

`pick-tests` names the browser groups for an `ai-drive.js` edit (physics-core);
`collisions` is optional browser evidence, session only, in the background.

## Field instruments (VM, no browser)

```sh
# One dispatcher:
node tools/check/ai-race.mjs pace    [--track monza] [--diff normal]
node tools/check/ai-race.mjs field   [--track monza] [--seconds 240] [--runs 5]
node tools/check/ai-race.mjs tactics [--track monza] [--laps 8] [--runs 5] [--mode human --pace 0.97]  # intervals (s), stuck, swap-backs, lap 1
node tools/check/ai-race.mjs line    [--track monza]
node tools/check/ai-race.mjs human   [--track monza] [--runs 3]   # vs a PLAYER, not itself
node tools/check/ai-race.mjs ratings [--json]                     # Pearson / style zero-mean (no race)
node tools/check/ai-race.mjs stuck   [--track monza] [--seconds 240] [--runs 3]    # per-car stuckT episodes + rescue teleports (not dwell)
node tools/check/ai-race.mjs band    [--track monza] [--diff normal] [--seconds 90]  # catch-up rubber-band profile (forces aiPace=catchup)
# Race subcommands take --wear off|light|real (default off: no pits/deg, so the pit-lane rescue never runs).
# Direct: ai-pace/ai-field/ai-line/ai-human/ai-ratings/ai-band/ai-stuck.mjs;
# tyre strategy over a race, wear real (default --track bahrain --laps 10):
node tools/check/ai-strategy-census.mjs --track redbull --laps 10 [--json]
```
