# AI field spread against real F1, 2026-11-25 (PR #6564)

Summary: the AI field was not too tight. In percent it was as wide as real F1 or wider. The RANDOM grid default made races look bunched because fast cars started behind slow ones. Bryce chose QUALIFYING as the default grid, which brings teammate gap and lap noise most of the way to real; lap 1 and the P10 midfield still run wide.

Kind: measurement · Re-measure-by: 2027-02-25

Real targets: calibration issue #6565 (2026 season, 15 dry races, Jolpica laps). Instrument: [`tools/check/ai-spread.mjs`](../../tools/check/ai-spread.mjs) (AI-only VM race: gaps to the leader by position at each lap, race pace by pace rank as the median green lap against the fastest car's, teammate gap, lap-time CV). Medians of 16 races: bahrain, monza, hungaroring and silverstone at seeds 1-4, HARD, 6 laps, wear off.

| metric | RANDOM grid (old default) | QUALIFYING default (tier proxy) | real F1 |
|---|---:|---:|---:|
| lap 1, P10 gap | 11.3 s | 12.8 s | 6.5 s |
| race pace P5 | +1.68 % | +1.02 % | +0.54 % |
| race pace P10 | +3.34 % | +2.97 % | +1.89 % |
| race pace P20 | +6.85 % | +5.57 % | +4.16 % |
| teammate gap (mean) | 1.43 % | 0.91 % | 0.39 % |
| lap-time CV | 1.57 % | 0.63 % | 0.95 % |

Each car alone (`tools/check/ai-solo.mjs`, HARD) is already close to real: P10 +2.07 %, teammates 0.28-0.31 %, 3.8-4.3 % fastest to slowest. The in-race excess is traffic, not the pace ladder. TIER_V and SKILL_SPAN were not changed.

## Tried and dropped (same 16 races, or 4-6 where named)

| change | effect | verdict |
|---|---|---|
| dirty air off | P10 pace 2.3-3.4 % → 2.8-3.9 % (4 races) | no help |
| pacePhase amplitude 0.016/0.005 → 0.006/0.002 | teammates 1.59 → 1.20 %, P10 pace 3.27 → 3.81 %, CV unchanged | not a clear win |
| START_GAP_T 0.42 → 0.22 s | lap-1 P10 12.4 → 11.5 s; lap-1 contact 16 → 22, longest lap-1 train 11 → 12 (3-lap ai-tactics, 3 seeds) | trades for contact |
| TRAIL_PUSH 0.02 → 0 | P10 pace 2.97 → 3.02 %, teammates 0.91 → 0.89 % | no effect |

Solo laps vary by 0.03 %, so pacePhase does not cause the lap-to-lap noise; traffic does.

## Open

Lap 1 runs about twice the real gaps. Part of that is lap length: our laps are 100-122 s against real 90-96 s. The rest is the calm start's headway, and that trades against turn-1 contact (skill `ai-racecraft` §Lap-1 / Turn-1 melee). P10 race pace is still about 1 % over real; it is traffic cost in the midfield, not the pace ladder. Bands: [`tests/unit/ai-field-spread-vm.test.mjs`](../../tests/unit/ai-field-spread-vm.test.mjs).

## Full distance (#7094, 2026-11-27)

Kind: measurement · Re-measure-by: 2027-02-27

Real-length races, AI-only, HARD, wear off, shipped grid (`--set raceGrid=null`), tip fc8646e2: bahrain 57 laps and monza 53 laps, seeds 1-2 (about 2.7 min each).

| race | P10 pace | P20 pace | teammates | lap CV | lapped at the flag | P10 gap at the flag |
|---|---:|---:|---:|---:|---:|---:|
| bahrain 1 | +1.89 % | +3.37 % | 0.34 % | 1.00 % | 13 | 138 s |
| bahrain 2 | +2.08 % | +3.24 % | 0.25 % | 0.83 % | 14 | 147 s |
| monza 1 | +2.19 % | +3.73 % | 0.33 % | 0.85 % | 13 | 145 s |
| monza 2 | +2.20 % | +3.42 % | 0.30 % | 0.95 % | 13 | 141 s |
| real F1 | +1.89 % | +4.16 % | 0.39 % | 0.95 % | about 7 | |

The post-normalisation HARD pace ladder sits on the real one (P10 1.89-2.20 %, P20 below real). The lapped count does not: 13-14 of 21 against about 7 (band 4-10). The ladder alone puts P10 about a lap down over 57 laps, so the excess is traffic loss in the midfield, not pace. The P10 pace pin is in the test; the lapped-car assertion waits on a decision (tune traffic loss, or accept and record).

### Where the lapped count comes from (#7178, 2026-11-27)

The extra lapped cars are not traffic loss. Bahrain 57 laps, HARD, shipped grid, tip 2bf756de + PR #7174:

- P10's gap grows by exactly its pace deficit: `ratePct.p10` 1.88 % against race pace P10 1.89 % (seed 1), 1.98 % against 2.08 % (seed 2). If traffic cost the midfield time, the gap would grow faster than the median lap deficit.
- Mean lap minus median lap, summed over the race (per car, seed 1, a throwaway per-car lap logger over the same VM race): the leader RUS 10 s, P2-P6 17-28 s, the lapped midfield 8-27 s. Traffic costs the front and the midfield about the same.
- Tyre wear on (`--wear real`) does not change it: 13 and 14 lapped, P10 pace 1.99 % and 1.93 %.
- The arithmetic: a car is on the lead lap only if lap-1 gap + 56 × deficit < 1 lap. With a 121 s lap and an 11 s lap-1 gap, the deficit must stay under 1.62 %. Real P10 pace (+1.89 %) is over that, so the 11th car is lapped at real pace alone, in a race with no neutralisation.
- The VM race has none: without Rapier there is no debris, yellow, VSC or safety car (`tools/lib/game-vm.cjs`, the incidents note). Real races bunch the field under SC/VSC, and since 2021 lapped cars unlap themselves behind the safety car. That is where the real count of about 7 comes from.

So the 4-10 band cannot be met with the pace pin (P10 1.2-2.6 %) at the real P10 pace without either a flatter midfield ladder or neutralisations in the measured race. The choice is on #7148 (#7178 row).
