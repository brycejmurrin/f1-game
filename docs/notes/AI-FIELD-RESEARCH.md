# What the AI field actually does, and what a real one does (2026-09-08)

Written because "the AI bunch up" turned out to be four different things, two of
which were my own measurement errors. Instrument: `tools/check/ai-field.mjs`.

## Baselines, shipped tree, before any change

| | Monza normal | Monza hard | Monaco normal |
|---|---|---|---|
| pace spread (`tierV * skill`) | 8.64 % | 8.64 % | 8.64 % |
| field strings out over 240 s | 344 → 1592 m | 353 → 1440 m | 364 → **9233 m** |
| settled passes | 29 | 24 | 16 |
| oscillation (pairs swapping 3+ times) | **57 %** | 52 % | 29 % |
| nose-to-tail median / longest | 2.0 / 23.3 s | 2.0 / 22.5 s | 2.5 / **92 s** |

## Calibration against real F1

| ours | real | ratio |
|---|---|---|
| 8.64 % field pace spread | 2025: whole field within **1.52 s/lap** race pace ≈ 1.7 % of a 90 s lap; widest recent seasons ≈ 4 % | **2–5× too wide** |
| 604 → 1555 m in 240 s | ≈ 250 m over the same distance | **~4× too fast** |
| 29 settled passes in 240 s | **30.9 overtakes per RACE** (2025); 32.8 (2024) | far too many |

Sources: [motorsport.com on 2026 field spread](https://www.motorsport.com/f1/news/weds-f1s-2026-reset-spreads-field-out-to-its-widest-since-2017/10812730/),
[F1Technical 2025 overtake counts](https://www.f1technical.net/news/28118).
Overtake counts vary by what is counted (lap 1, pit cycles, lapped cars) — take
the order of magnitude, not the digit.

**Two opposite problems in one field.** It strings out several times too fast
*and* individual pairs get stuck together. A constant wide pace spread can only
integrate; that is the stringing. The oscillation is separate and is not
explained by pace: oscillating pairs differ by 1.34 % of pace, settled pairs by
1.20 % — indistinguishable, and one pair oscillates six times on a 1.79 % gap.

## Dirty air — the missing term

There was no wake penalty anywhere in the tree. The tow gave +4.5 % of top
speed (`AiDrive.towGain`) and cost nothing, so **following was strictly and
only beneficial**. With a median adjacent-car pace gap of 0.484 %, a slipstream
was worth about nine grid positions of pace, unopposed — which is a mechanism
for pairs trading places indefinitely.

Real figures, for the magnitude: the FIA's own CFD has the **2025** cars losing
roughly **20 % of downforce at 20 m and 35 % at 10 m**; the 2022 regulations
targeted 4 % / 18 %, and the 2026 baseline is ~10 % / 20 %.
Sources: [Formula1.com on the 2022 car](https://www.formula1.com/en/latest/article/10-things-you-need-to-know-about-the-all-new-2022-f1-car.4OLg8DrXyzHzdoGrbqp6ye),
[The Race on the FIA CFD data](https://www.the-race.com/formula-1/exclusive-new-data-f1-aero-losses-ruining-close-racing/).

**Note the direction before reaching for it.** Dirty air is what CREATES DRS
trains. It is the right term for realism and the wrong one for "make them bunch
up less" — measured here, it halved Monaco's absurd stringing (9233 → 4461 m)
and cut Monza's order flips 18 %, but LENGTHENED close-following episodes
(longest 23 → 41 s at Monza). Both effects are the same mechanic working.

## Prior art worth stealing (not yet done)

- **Rubber banding done properly** — Nic Melder, who wrote Codemasters' racing
  AI, specifies a **dead zone** around the player, **forward banding** (slow the
  cars ahead) as well as reverse, a separate **first-place band** keyed to the
  P1–P2 gap, hard **disables at the race start** (banding into T1 is "the
  antithesis of what we want") and when lapping, and — the important one —
  modifying **driver skill** (braking points, corner speed) rather than power,
  "as the drivers are still in the same cars and so no 'cheating' is happening".
  Ours multiplies `vmax`, is reverse-only, and has none of the disables.
  [Game AI Pro ch.42](https://www.gameaipro.com/GameAIPro/GameAIPro_Chapter42_A_Rubber-Banding_System_for_Gameplay_and_Race_Management.pdf).
  Measured caveat: our band contributes **0.9 % for five seconds and then
  0.00 %** unless the player is leading by hundreds of metres, so it is not the
  cause of anything a mid-pack player sees.
- **Narrow the spread, add a biorhythm** — skill should map onto ~98–99 %, and
  "a 1 % variation accumulated over several laps can have a surprisingly large
  effect"; variety comes from a slow waveform on skill instead, making a driver
  briefly vulnerable without being permanently slower. A constant spread
  integrates; an oscillating one does not.
  [Game AI Pro ch.38](https://www.gameaipro.com/GameAIPro/GameAIPro_Chapter38_An_Architecture_Overview_for_AI_in_Racing_Games.pdf) §38.4.
- **Race-pace script / positional groups** — Pure banded AI to a *scripted
  position in the race* rather than to the player's bumper, with target points
  that move over the race and are switched off in the final 20–25 %.
  [Jimenez, "The Pure Advantage"](https://www.gamedeveloper.com/design/the-pure-advantage-advanced-racing-game-ai).
- **Overtake as a utility state with hysteresis and an abort cooldown** — and
  "not every overtaking opportunity should be taken". Ours has cooldowns on the
  ATTACKER after a failure but nothing stops a just-passed car counter-attacking
  immediately. [Game AI Pro ch.38](https://www.gameaipro.com/GameAIPro/GameAIPro_Chapter38_An_Architecture_Overview_for_AI_in_Racing_Games.pdf) §38.5.2.
- **Persona axes that are not speed** — iRacing exposes Skill, Aggression,
  **Optimism** ("believes he is more skilled than he actually is" → late braking
  and running wide), Smoothness and Age per driver, plus a field-wide Skill
  Range. Optimism is the cheapest believable mistake model going.
  [iRacing AI Rosters](https://www.iracing.com/airoster-/).

Out of scope: Forza's Drivatar and GT Sophy both need training pipelines this
project does not have.

## Open, with citations, from the code audit

- `js/game.js:4823` starts the corner look **12 m ahead**, so the AI's real
  corner speed is `sqrt(vC² + 449)`, not `vC`. Worth **6.9 % of lap time at
  Monza and 12.3 % at Monaco** — several times the entire easy→hard range — and
  it flattens skill and difficulty in slow corners, which is why hard is only
  1.6 % faster than normal.
- ~~The AI's corner model has **no downforce term**~~ — FIXED 2026-09-09, see
  "Downforce in the AI's corner model" below. (The first cut of this row also
  claimed the AI was "superhuman in hairpins, 2.2× a player's grip": wrong, and
  withdrawn. The player's `aeroGrip` is `1 + DOWNFORCE·(v/vTop)²`, which tends
  to **1.0** as the speed goes to zero — at a Monaco hairpin the two models were
  within ~3 %. The asymmetry was one-sided and lived entirely in the FAST
  corners, where the player had up to 65 % more grip than the AI credited
  itself with.)
- `js/physics/ai-drive.js:609` returns 0 whenever there is no curvature 18–70 m
  ahead, so **the AI cannot defend on a straight** — the most recognisable
  defensive move in the sport is structurally impossible.
- ~~On easy, `0.851 × 1.18 = 1.004` beats `DIFF.hard.ai = 0.980`~~ — FIXED
  2026-09-09 (`BAND_CEIL` in js/game.js caps a banded AI at the top of the
  ladder, `DIFF.hard.ai · (1 + DIFF.hard.band)` = 0.9996). It only ever bit on
  easy, at gaps past ~640 m, and it is a monotonicity fix rather than a
  measurable pace change.

## Downforce in the AI's corner model, and pass hysteresis (2026-09-09)

Two changes, measured together because the second exists to pay for the first.

**1. `brakeTarget` gained the aero term the player has always cornered on.**
`js/game.js`'s `aeroGrip` is `1 + DOWNFORCE·aeroDfMult·(v/vTop)²`; the AI sized
every corner off a flat `latMax`, i.e. its STANDING-START grip, and was
correspondingly timid wherever the corner is fast. The corner speed is now a
fixed point rather than a plain sqrt, because the grip that sets `vC` depends on
`vC`: with `A = latMax·bankMu·grip·skill²/k`, `vC² = A/(1 − A·df/vTop²)`, and a
non-positive denominator means the corner is not the limit — `vTop` is. `df: 0`
restores the old model exactly, which is why `tests/unit/ai-drive.test.mjs`
(which builds its ctx by hand) still passes unchanged.

Field-median lap time, `tools/check/ai-pace.mjs`, HEAD vs the change:

| circuit | easy | normal | hard |
|---|---|---|---|
| monza  | 125.90 → 125.50 (−0.32 %) | 120.68 → 120.57 (−0.09 %) | 116.85 → 116.72 (−0.11 %) |
| monaco | 83.60 → 82.27 (−1.59 %)\* | 82.20 → 82.38 (+0.22 %) | 81.93 → 81.07 (−1.05 %) |
| spa    | 163.42 → 153.43 (−6.11 %) | 151.15 → 147.65 (−2.32 %) | 146.98 → 142.48 (−3.06 %) |

\* the monaco/easy run timed only 19 of 21 cars, so its median is over a
different sample than the base's 21 — do not read that cell as a pace change.

The size of the gain tracks how fast the circuit's corners are, which is the
prediction: Spa (Pouhon, Blanchimont, Eau Rouge) moves several per cent, Monza
(three chicanes and straights) barely moves at all. **The difficulty ladder got
more consistent circuit to circuit**, which was the point:

| easy vs normal | HEAD | now |   | hard vs normal | HEAD | now |
|---|---|---|---|---|---|---|
| monza | +4.32 % | +4.09 % | | monza | −3.18 % | −3.19 % |
| spa   | +8.12 % | +3.92 % | | spa   | −2.76 % | −3.50 % |

Monza and Spa now agree to within 0.2 points on the easy step and 0.3 on the
hard step, against 3.8 and 0.4 before. Monaco stays the outlier at ≈0 %
separation between easy and normal — a corner-limited circuit barely reads a
GROUND-SPEED scale, which is a property of `DIFF` being a speed multiplier and
not something this change caused.

`DIFF` was NOT re-scaled, for the reason the 2026-09-08 note in
`js/physics/consts.js` already gives: the drift is circuit-dependent (−0.09 %
monza, +0.22 % monaco, −2.32 % spa at normal) and a global multiplier cannot
express it — holding Spa would put Monza 2.3 % off the pace it is calibrated to.

**2. A completed pass now locks out the counter-attack.** Change 1 alone made
the racing WORSE by the measure that matters, because more cars ran nose to
tail: `tools/check/ai-field.mjs` at monza went 109 order flips / 27 settled /
59 % oscillation to 151 / 22 / 74 %. Nothing in the pass machinery distinguished
a completed pass from a re-pass — the cooldowns were all on the ATTACKER after a
FAILURE — so the passed car simply attacked straight back. It now takes the same
`2 × passCooldown` "threshold endured" lockout the lunge-abandon branch already
uses, scaled by its OWN experience, and never written onto a human.

| `ai-field.mjs`, normal, 240 s | HEAD | aero only | aero + hysteresis |
|---|---|---|---|
| monza flips / settled / oscillation | 109 / 27 / 59 % | 151 / 22 / 74 % | 144 / 27 / 63 % |
| monza strings out to | 1548 m | 1375 m | 1376 m |
| monza nose-to-tail | 20.3 % | 24.6 % | 22.5 % |
| monaco flips / settled / oscillation | 28 / 15 / 18 % | 34 / 18 / 29 % | 73 / 40 / 26 % |
| monaco strings out to | 4461 m | 3865 m | 3785 m |

Read honestly: settled passes are up (monza level, monaco 15 → 40) and the
oscillation SHARE is back near baseline, but the absolute oscillation count is
still above HEAD at both circuits, because there is simply more close running
than there was. The 8.6 % pace spread — five times the real 2025 field's
1.7 % — remains the untouched root cause of both the stringing and the flip
count, and needs a design decision rather than a defect fix.

Monza's numbers were byte-identical at `1 ×` and `2 ×` the cooldown: after a
pass on that layout the pair separates for longer than either timer anyway, so
the constant only bites at Monaco. `2 ×` was kept to match the existing
lunge-abandon branch rather than introduce a second constant.
