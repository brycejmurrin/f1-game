# AI HARD pace vs a strong player (2026-11-25)

Summary: HARD's best car was 2.9-3.8 % slower than a lap at the player's own grip envelope, because the player has
`PLAYER_GRIP` 1.15 that the AI never gets and HARD's corner authority was capped at the AI's envelope (1.0). HARD
`corner` is now 1.072 = sqrt(1.15): the best HARD car is within 1.0 % of the reference on three circuits.

Kind: measurement · Re-measure-by: 2027-02-25

Complaint: Bryce, 2026-11-25 ~07:38Z, "even in hard I'm still way beating them".

## The reference lap

A strong player, measured without a human: the AI controller driving the PLAYER's envelope. The fastest tier-0
car alone on the circuit (seed 1, wear off), skill 1, top speed at `BAND_CEIL` (1.0, the player's own `vTop()`
scale) and corner authority sqrt(`PLAYER_GRIP`) = 1.0724 of the AI grip envelope. Corner speed goes with the root
of lateral grip, so that is the corner speed a same-spec player has. It keeps the AI's line, and does not use the
extra kerb or a human's line choice, so a very strong human can still beat it a little.

## Why HARD could not get there

`game.js` `updateCarBrakePlan` gave `AiDrive.brakeTarget` `diffCorner = min(1/skill, min(1, corner x (1+band)) x
paceTrim)`, so skill x diffCorner, the corner speed relative to the AI's own envelope, never passed 1.0 at any
level. The AI's envelope is the player's without `PLAYER_GRIP` (`AiDrive.lateralScale`: "PLAYER_GRIP's assist
headroom is NOT copied"). Top speed is held at 0.985 for the best HARD car on purpose (the straight stays the
player's, `consts.js` DIFF note), so the corners were the whole gap.

The fix, `AiDrive.diffCorner(corner, skill, band, trim)`: the ceiling is the level's own `corner`, floored at 1.
EASY (0.93) and NORMAL (0.97) are bit for bit unchanged. HARD's 1.072 sits at the player's envelope;
`tests/unit/mechanics-coherence.test.mjs` refuses any level above sqrt(PLAYER_GRIP), the corner twin of the
straight-line rule. The kinematic AI tracks the road, so a higher target is not an actuator problem: zero
off-track samples in every run below. `Quali.carLap` mirrors the ceiling (`cornerCeil`).

## Solo laps (seed 1, wear off, best of two flying laps, `scratch` harness on `ai-solo.mjs`'s method)

Gap to the reference, fastest car / field median:

| circuit | reference | HARD corner 1.00 (before) | 1.04 | **1.0724 (shipped as 1.072)** | 1.10 | NORMAL |
|---|---:|---:|---:|---:|---:|---:|
| Monza | 114.03 s | +2.9 % / +5.2 % | +1.8 / +4.1 | **+1.0 / +3.3** | +0.4 / +2.7 | +9.6 / +12.2 |
| Red Bull Ring | 88.25 s | +3.3 / +5.7 | +2.1 / +4.3 | **+1.0 / +3.2** | +0.1 / +2.4 | +9.1 / +11.7 |
| Suzuka | 115.90 s | +3.8 / +6.3 | +2.2 / +4.7 | **+1.0 / +3.4** | +0.2 / +2.4 | +10.1 / +12.7 |

1.10 is faster but out-corners the player's own car, which the coherence test refuses. The remaining 1 % at the
front is top speed (0.985 vs 1.0), kept by design. The median-to-front gap is the field-spread lane
(sibling worker), not this one.

Pinned: `tests/unit/ai-difficulty-pace-vm.test.mjs` (RUS alone, out lap + one flying lap, Monza and Red Bull Ring,
every level as a ratio to the reference, +-0.4 %).

## Racecraft (ai-tactics, HARD, 5 laps, 3 seeds; median [min..max])

"base" is the deploy tip `d520d375`; "corner" is this PR's ceiling alone (defend reserve off); "both" is the PR.

| metric | Monza base | corner | both | Red Bull base | corner | both |
|---|---:|---:|---:|---:|---:|---:|
| race seconds | 599 | 590 | 588 | 468 | 455 | 456 |
| settled passes / car / lap | 1.64 [1.06..1.73] | 1.56 [1.55..1.68] | 1.38 [1.31..1.69] | 1.37 [1.25..1.51] | 1.20 [1.06..1.35] | 1.28 [1.16..1.33] |
| passes on a straight % | 78.4 | 75.6 | 71.7 | 76.4 | 77.5 | 72.9 |
| attack success % | 24.3 | 23.0 | 22.6 | 23.8 | 25.1 | 23.4 |
| stuck episodes > 10 s | 54 | 55 | 70 | 49 | 54 | 62 |
| stuck episodes > 30 s | 6 | 5 | 5 | 7 | 4 | 4 |
| side-by-side resolved as a pass % | 53.8 | 51.7 | 49.5 | 53.1 | 57.7 | 56.5 |
| AI-AI contact episodes | 17 [16..25] | 17 [17..25] | 13 [11..17] | 21 [16..23] | 15 [14..22] | 19 [17..27] |

The ceiling alone is racecraft-neutral: no new contact, no dive-bomb signal (contact flat or down, inside-pass share
inside the base range). The defend reserve adds stuck-behind time (episodes > 10 s +15 Monza, +8 Red Bull): a
defender keeps its charge for the next straight instead of draining it, so trains hold longer. Its pace win is the
#6546 measurement (car-time on a flat battery 18 % -> 0); the trade-off is named on the PR.

## Also in this PR: ERS defend reserve (#6546 P1)

`AiDrive.wantBoost` deployed to defend with no energy floor, so a train ran on a flat battery. Defending now needs
charge above 0.25 (the `desperate` floor). Pinned in `tests/unit/ai-drive.test.mjs`.
