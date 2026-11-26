# AI field spread, part 2: the chaser lane, 2026-11-26 (#6575)

Summary: midfield cars lost 1-3.5 % a lap in the race against their own solo pace, more than any pace edge to the car ahead. The cause was the lane rule: a car with ANY chaser within 34 m left the racing line for its grid home lane, which costs a lone car up to ~2 % (#5330). A chaser now counts only inside 0.25 s. P10 race pace moved from +3.13 % to +2.65 % (real +1.89 %), lap-1 P10 from 12.13 s to 11.83 s (real 6.5 s), and AI-AI contact fell.

Kind: measurement · Re-measure-by: 2027-02-26

Follows [`AI-FIELD-SPREAD-2026-11-25.md`](AI-FIELD-SPREAD-2026-11-25.md). Change: `js/game.js` lane-clear gate (`chaserGap >= 0.25 * c.speed` instead of `!chaser`; `chaserGap` is Infinity with no chaser), comment at `AiDrive.laneClear`. The eager-bytes ratchet paid for it by dropping `ai-band.js`'s second `Object.freeze(AiBand)` (the IIFE already returns a frozen object). AI-only: the line weight steers AI cars; the player's car never reads it.

## Before and after

`tools/check/ai-spread.mjs --set raceGrid=null`, HARD, wear off, 6 laps, bahrain/monza/hungaroring/silverstone seeds 1-4 (16 races, medians). Contact and lap-1 train from `ai-race.mjs tactics` (monza, normal, 3 laps); contact is chaotic per seed, so 12 seeds.

| metric | before | after | real F1 |
|---|---:|---:|---:|
| lap 1, P10 gap | 12.13 s | 11.83 s | 6.5 s |
| lap 1, last | 19.71 s | 20.05 s | 11.6 s |
| race pace P5 | +1.06 % | +0.47 % | +0.54 % |
| race pace P10 | +3.13 % | +2.65 % | +1.89 % |
| race pace P20 | +5.02 % | +4.56 % | +4.16 % |
| teammate gap (mean) | 0.75 % | 0.61 % | 0.39 % |
| lap-time CV | 0.66 % | 0.58 % | 0.95 % |
| AI-AI contact, 12 seeds (median) | 16 | 14 | |
| lap-1 longest train, seeds 1-6 (median) | 11.5 | 11.5 | |
| settled AI passes, seeds 1-6 (median) | 132 | 110 | |

Contact by seed, before: 13/18/17/16/16/11/23/13/21/17/15/10; after: 15/9/9/11/17/14/16/15/12/22/14/10.

## How it was found

Race median lap against solo best per car (bahrain, 4 seeds, `ai-solo.mjs --diff hard`): the front five lost 0.15-1.2 %, the midfield (solo P9-P19) 1-3.5 %. Diagnostics on the same 16 races:

| change | P10 pace | contact (3 seeds) | verdict |
|---|---:|---:|---|
| attacks off | 3.35 % | | battles are not the cost |
| defensive covers off | 3.25 % | | covers are not the cost |
| follow time 0.15-0.30 → 0.10-0.22 s | 3.00 % | | small |
| laneClr always 1 (line everywhere, start included) | 2.56 % | 29 | the lever, but lanes to T1 matter |
| no chaser in `clear` | 2.67 % | 14 (6 seeds) | most of the gain |
| no tow car in `clear` | 3.19 % | | no gain |
| chaser inside 0.2 / 0.3 / 0.4 s | 2.56 / 2.75 / 2.59 % | 15.5 / 12.5 / 17.5 (6 seeds) | 0.3 failed the teammate band on monza seed 1 |

## Tried for lap 1 and dropped (on top of the chaser gate)

| change | lap-1 P10 | contact (6 seeds) | verdict |
|---|---:|---:|---|
| START_CALM 24 → 14 s | 11.98 s | 19 | trades for contact |
| START_GAP_T 0.42 → 0.34 s | 11.96 s | 15, spread 13-26 | no gain |
| launch reaction and grip spread narrowed | 11.64 s | 21 | trades for contact |

A lap-1 timeline (bahrain seed 1) shows P10 already 5.5 s behind at t = 20 s (launch plus calm headway); the rest of lap 1 adds the pace ladder and traffic. Lap 1 is still about twice real; what is left trades against turn-1 contact (skill `ai-racecraft` §Lap-1 / Turn-1 melee).

## Open

Settled AI passes fell about a sixth (cars on the line are harder to pass) and the last car's lap-1 gap rose 0.3 s. Lap-time CV moved further below real (0.58 against 0.95). Bands: [`tests/unit/ai-field-spread-vm.test.mjs`](../../tests/unit/ai-field-spread-vm.test.mjs), tightened.
