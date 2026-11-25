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
#6546 measurement (car-time on a flat battery 18 % -> 0). The 0.25 reserve was then re-tuned to 0.12 (next section),
which keeps the flat-battery fix and drops the stuck-behind cost.

## Also in this PR: ERS defend reserve (#6546 P1)

`AiDrive.wantBoost` deployed to defend with no energy floor, so a train ran on a flat battery. Defending now needs
charge above `DEFEND_FLOOR` 0.12. `wantBoost` has no difficulty gate, so this applies at EVERY level, unlike the corner
ceiling (EASY/NORMAL are bit-identical only for the ceiling). Pinned in `tests/unit/ai-drive.test.mjs`.

### Reserve A/B (HARD, 5 laps, seeds 1-3, wear off, on top of the corner ceiling)

`ai-tactics --diff hard --laps 5 --runs 3`, plus a flat-battery probe (AI car-time with energy <= 0.02, after 30 s,
pit cars excluded; a throwaway VM script, not committed). Stuck = faster-behind-slower episodes > 10 s, per seed and
summed; passes and attack success are medians.

| floor | circuit | stuck > 10 s | sum | faster-behind-slower s | passes / car / lap | attack success % | flat battery % |
|---|---|---|---:|---:|---:|---:|---|
| none (deploy tip) | Monza | 47/56/55 | 158 | 1544 | 1.56 | 23.0 | 11.7/13.6/11.1 |
| none (deploy tip) | Red Bull Ring | 64/54/54 | 172 | 1416 | 1.20 | 25.1 | 14.6/10.9/13.0 |
| 0.25 | Monza | 51/72/70 | 193 | 1762 | 1.38 | 22.6 | 0/0/0 |
| 0.25 | Red Bull Ring | 64/47/62 | 173 | 1575 | 1.28 | 23.4 | 0/0/0 |
| 0.25, released when the chaser is < 6 m | Monza | 52/58/75 | 185 | 1475 | 1.46 | 24.2 | 6.3/6.2/6.3 |
| 0.25, released when the chaser is < 6 m | Red Bull Ring | 54/47/50 | 151 | 1408 | 1.33 | 24.0 | 5.4/6.5/6.4 |
| **0.12 (shipped)** | Monza | 46/55/68 | 169 | 1401 | 1.44 | 25.1 | 0/0/0 |
| **0.12 (shipped)** | Red Bull Ring | 49/48/59 | 156 | 1282 | 1.43 | 27.1 | 0/0/0 |

0.12 keeps the flat battery at zero and has the least faster-behind-slower time, the most passes and the best attack
conversion. Against the deploy tip, stuck episodes are +11 at Monza (inside the seed spread: 46-68 per seed) and -16 at
Red Bull Ring. The release-on-attack variant brings the drain back (about 6 %) and is not better on stuck time.
