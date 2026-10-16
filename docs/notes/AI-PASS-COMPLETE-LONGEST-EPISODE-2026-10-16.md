# AI pass completion: why the longest stuck episode does not move (#2356)

Measured 2026-10-16 on the deploy tip after #1545, monza, `ai-race.mjs tactics --track monza --laps 8 --runs 1 --seed N --json` (~3 min per seed; three seeds in parallel fit four cores).

## Baseline (tip)

| seed | longest episodes | AI-AI contact episodes |
|---|---|---|
| 1 | OCO<BOT 134 s +0.40 %, RUS<GAS 111 s +0.88 % | 18 |
| 2 | ALB<BOT 172 s +0.44 %, ANT<HAD 114 s +0.61 % | 22 |
| 3 | HAD<COL 124 s +0.43 %, PIA<HAD 97 s +0.50 % | 46 |

Done-when (<= 60 s on every seed, both tracks) is far off, and the +0.88 % and +0.98 % pairs (above `PASS_EDGE`) also sit 100 s+, so the edge floor is not the only blocker.

## Diagnosis: the "stuck" pairs are not in the queue

The instrument counts a pair as following when the interval is under 1.0 s. Probing ALB<BOT (seed 2) every 10 s: the gap is 15-45 m at 40-50 m/s, `queueT` stays 0-2 s for the whole 170 s, `passHunger` returns 1.00. The queue window is `max(16, follow + 6)` m, so a 20-45 m dirty-air train never builds `queueT`, and every hunger/concede knob keyed on `queueT` is inert for exactly the longest pairs.

## Tried, worse (reverted)

1. Graded edge floor falling from 0.7 % to 0.3 % with `queueT` 15 -> 45 s (`paceEdgeN`/`passHunger`/`coverConcede`): only seed 1's 0.40 % pair moved; seeds 2 and 3 byte-identical (queueT never gets there).
2. Same floor driven by a new `trailT` (time within 1 s of the same car): longest episodes got LONGER (seed 2 ANT<HAD 114 -> 242 s, seed 3 HAD<COL 124 -> 236 s), total stuck time up on seeds 1-2 (2636 -> 3082, 2181 -> 3033 s), AI-AI contact 18 -> 39 on seed 1.

## Next step for whoever picks this up

Make the follower able to close a 20-45 m gap on a +0.4 % car at all (a wider run/tow model, or a deliberate attack-zone plan) rather than lowering the hunger floor; judge by `stuck.longest` over >= 5 seeds per track with `contact.aiAiEpisodes` not above baseline. Probe script shape: step the VM and print `queueT`, gap, `passOf`, `defendSide` for a named pair every 10 s.
