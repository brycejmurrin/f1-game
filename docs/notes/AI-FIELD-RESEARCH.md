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
- The AI's corner model has **no downforce term** (`js/physics/ai-drive.js:301`)
  while the player's grip rises 65 % with speed: superhuman in hairpins (2.2×
  a player's available grip at Monaco), conservative in fast corners.
- `js/physics/ai-drive.js:609` returns 0 whenever there is no curvature 18–70 m
  ahead, so **the AI cannot defend on a straight** — the most recognisable
  defensive move in the sport is structurally impossible.
- On easy, `0.851 × 1.18 = 1.004` beats `DIFF.hard.ai = 0.980`: a lapped AI on
  easy has a higher top speed than any car on hard.
