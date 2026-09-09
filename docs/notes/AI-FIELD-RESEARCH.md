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

## The AI's planner and its actuator disagree about grip (2026-09-09)

**A downforce term was added to the AI's corner model and then REVERTED the
same day, because measuring it found a bigger defect underneath.** Read this
section as the record of that, not as a description of shipped behaviour.

### What was tried, and why it was wrong

`js/game.js`'s `aeroGrip` is `1 + DOWNFORCE·aeroDfMult·(v/vTop)²`, so a
PLAYER's lateral grip is 65 % higher at the top speed than at rest, while
`brakeTarget` sized every corner off a flat `latMax`. That looked like a plain
player/AI asymmetry, and the fix looked like giving the AI the same term.

It is not, and the reason is that **the AI does not simulate lateral grip the
way the player does at all.** The player integrates a slip model whose `muBase`
carries `aeroGrip`. The AI takes a kinematic lateral step (`js/game.js`, the
`c.x +=` line in `updateCar`):

    c.x += steer * STEER_VMAX * aiLat * gripScale * kerbGrip * gripMult(c) * ...

with `gripScale = 1 - clamp((vStd(speed) - 20)/(VMAX - 20), 0, 1) * 0.28`, and
its yaw-rate cap is `AI_YAW_LAT * LAT_MAX * gripMult(c) / vAbs`. **Neither has
an aero term, and `gripScale` FALLS by up to 28 % with speed.**

So the change put the AI's planner and its actuator in OPPOSITE directions:
planned grip rising 65 % with speed, available grip falling 28 %. The AI planned
entry speeds it could not physically turn at, arrived too fast and washed out of
the apex. `tests/unit/ai-racecraft-vm.test.mjs` caught it, and an instrumented
A/B against the pre-change tree says it was not a threshold graze:

| monza corner | before | with the aero term |
|---|---|---|
| s0=2068, len 128 m | apex 5.969 m inside | 5.978 m (unchanged) |
| **s0=2451, len 52 m** | **apex 4.068 m** | **3.467 m** |

0.60 m of apex depth at the SHORT corner, nothing at the long one — the shape a
planner/actuator mismatch makes, since the long corners were bounded by other
limits anyway.

### The real defect, now measured rather than asserted

**The AI's corner planner and its lateral actuator model grip differently, and
with opposite slopes in speed.** That is worth fixing properly, and there are
two honest directions, neither of them a one-liner:

- make the PLANNER match the ACTUATOR — give `brakeTarget` the same `gripScale`
  taper, so the AI plans for grip that falls with speed. More conservative in
  fast corners, and it needs its own measurement pass;
- or give the ACTUATOR aero so both rise — a much larger physics change that
  moves every AI car's cornering everywhere and needs full re-measurement.

Until one of those is done, `brakeTarget` staying on flat `latMax` is the
CONSISTENT choice, because it at least does not contradict the actuator.

### The lap-time table the reverted change produced

Kept because it is real measurement and the next attempt should not have to
re-take it. `tools/check/ai-pace.mjs`, field median, HEAD vs the aero term:

| circuit | easy | normal | hard |
|---|---|---|---|
| monza  | 125.90 → 125.50 (−0.32 %) | 120.68 → 120.57 (−0.09 %) | 116.85 → 116.72 (−0.11 %) |
| monaco | 83.60 → 82.27 (−1.59 %)\* | 82.20 → 82.38 (+0.22 %) | 81.93 → 81.07 (−1.05 %) |
| spa    | 163.42 → 153.43 (−6.11 %) | 151.15 → 147.65 (−2.32 %) | 146.98 → 142.48 (−3.06 %) |

\* the monaco/easy run timed only 19 of 21 cars, so its median is over a
different sample than the base's 21 — not a pace change.

Note what this table does NOT prove. Spa getting 2.3 % faster is the AI
planning more speed, not the AI carrying more speed *well*; the apex
measurement above is what happens to the line while that lap time falls. A
faster lap from a planner that outruns its actuator is not an improvement, and
this is the trap the pace instrument alone walks into — `ai-pace.mjs` and
`ai-field.mjs` measure time, stringing and passes, and NOTHING about line
geometry. That gap is why this reached a deploy gate instead of being caught at
my desk.

## A completed pass locks out the counter-attack (2026-09-09, SHIPPED)

Independent of the reverted change above, and kept. Nothing in the pass
machinery distinguished a completed pass from a re-pass — every cooldown was on
the ATTACKER after a FAILURE — so the car that had just been passed attacked
straight back. It now takes the same `2 × passCooldown` "threshold endured"
lockout the lunge-abandon branch already uses, scaled by its OWN experience, and
never written onto a human.

`tools/check/ai-field.mjs`, normal, 240 s, re-measured with the aero term
REVERTED so the column describes what actually ships:

| | HEAD | hysteresis only (shipped) |
|---|---|---|
| monza flips / settled / oscillation | 109 / 27 / 59 % | 154 / 19 / 63 % |
| monza strings out to | 1548 m | 1524 m |
| monza nose-to-tail | 20.3 % | 23.5 % |
| monaco flips / settled / oscillation | 28 / 15 / 18 % | 39 / 22 / 18 % |
| monaco strings out to | 4461 m | **7807 m** |
| monaco nose-to-tail | 13.3 % | 12.3 % |

**Monaco is a clear win and Monza is ambiguous, and I am not going to pretend
otherwise.** Monaco gains half again as many settled passes (15 → 22) at an
unchanged 18 % oscillation share, strings the field out to 7.8 km against
4.5 km, and cuts close-following car-time — that is the field bunching LESS,
which was the ask. Monza goes the other way on the metric that matters most:
settled passes fall 27 → 19 while total flips rise, i.e. more churn resolving
into fewer clean passes, which is the opposite of what the mechanism predicts.

The honest caveat on all of it: **every number in this file is a single run.**
The sim is deterministic, so a repeat reproduces exactly — but that is
REPRODUCIBILITY, not low variance across conditions, and a 240 s race is
chaotic enough that one behavioural change reshuffles the whole field. Nothing
here establishes that a 27 → 19 swing at one circuit is the change rather than
the reshuffle. An n-run spread per condition is the missing instrument, and
until it exists these tables should be read as direction, not magnitude.

It ships anyway because the MECHANISM is principled and independently
motivated — a completed pass being instantly undone is not racing, and the
lockout matches the published overtake-FSM hysteresis in the prior-art section
above — and because the alternative on the table was shipping nothing while a
measured Monaco improvement sat unclaimed. If the Monza figure holds up under a
proper n-run measurement, the constant is the thing to revisit first.

Monza's numbers were byte-identical at `1 ×` and `2 ×` the cooldown: after a
pass on that layout the pair separates for longer than either timer anyway, so
the constant only bites at Monaco. `2 ×` was kept to match the existing
lunge-abandon branch rather than introduce a second constant.
