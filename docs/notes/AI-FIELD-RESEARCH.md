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

## The F1-like pace spread, and what n=5 says about this file (2026-09-09)

The owner's design call: the field should look like F1 — closer, fewer passes.
`TIER_V` and the driver-skill constants were compressed by the same factor
(0.347) about the MEASURED FIELD MEAN, so the mean is invariant by construction
and only the spread moves:

| | before | after |
|---|---|---|
| tierV span | 6.16 % | 2.10 % |
| skill span | 3.19 % | 1.10 % |
| **product span** | **8.64 %** | **2.92 %** |
| field mean | 0.9323 | 0.9322 |

Lap time held in the SIM, not just in the arithmetic — monza normal 120.68 ->
121.60 s (+0.76 %), spa 151.15 -> 150.15 s (-0.66 %), opposite directions, so no
systematic shift. The difficulty steps also got more consistent between
circuits (spa easy-vs-normal +8.12 % -> +5.47 %).

### What it did to the racing — measured at n=5 on BOTH trees

| monza, 240 s | baseline | compressed |
|---|---|---|
| strings out to | 1505 [1087–1524] m | 1122 [1053–1298] m |
| order flips | 146 [109–165] | **200 [148–211]** |
| settled passes | 25 [19–35] | 23 [20–38] |
| oscillation | 88 (61 %) | 131 (68 %) |
| nose-to-tail | 23.5 [14.8–24.4] % | 26.3 [23.8–30] % |

| monaco, 240 s | baseline | compressed |
|---|---|---|
| strings out to | 4130 **[1337–7807]** m | 1502 **[925–4237]** m |
| order flips | 39 [27–55] | 46 [32–78] |
| settled passes | 22 [15–31] | 18 [16–29] |
| oscillation | 7 (19 %) | 14 (30 %) |

**Read this table for what it does NOT say.** At monaco NOTHING is established:
every range overlaps almost completely, and the baseline stringing range alone
spans 1337–7807 m — nearly six-fold. At monza only two effects survive the
ranges: order flips ROSE (146 -> 200, ranges barely touching) and nose-to-tail
time rose. Stringing did not improve provably at either circuit.

### Compressed again to the FASTEST era's gap (1.46 %), and a wrong prediction

The owner's follow-up: calibrate to whichever era is fastest. The ground-effect
cars (2022-24) near-matched Monza's 2003/04 average-speed record and ran the
tightest field F1 has had — all twenty inside ONE SECOND in 2023 Brazilian
qualifying, ~1.4 %. (The outright fastest single laps are 2019-21, but that
field was WIDER, Mercedes being dominant, so "fastest era" does not name one
number by itself.) Same method, factor 0.174 from the originals, about the
field mean: product span 8.64 % -> **1.46 %**, mean 0.9323 -> 0.9322.

| monza, n=5 | baseline 8.47 % | 2.92 % | 1.43 % |
|---|---|---|---|
| strings out to | 1505 [1087–1524] m | 1122 [1053–1298] | 1071 [964–1157] |
| order flips | 146 [109–165] | 200 [148–211] | 185 [155–222] |
| settled passes | 25 [19–35] | 23 [20–38] | 32 [24–57] |
| oscillation | 88 (61 %) | 131 (68 %) | 113 (62 %) |
| nose-to-tail | 23.5 [14.8–24.4] % | 26.3 [23.8–30] % | **28.0 [24.8–30.5] %** |

| monaco, n=5 | baseline 8.47 % | 1.43 % |
|---|---|---|
| strings out to | 4130 [1337–7807] m | 3872 [991–5883] |
| order flips | 39 [27–55] | 51 [43–55] |
| settled passes | 22 [15–31] | 21 [13–30] |
| oscillation | 7 (19 %) | 18 (35 %) |
| nose-to-tail | 12.3 [11.6–12.9] % | **14.7 [13.4–15.5] %** |

**I predicted the flip count would rise again at 1.46 %, and it did not** — 200
-> 185 median, ranges overlapping, so no change established between the two
compressions. The reasoning behind the prediction ("tighter pace means more
shuffling") was wrong and should not be built on. The likelier mechanism: at
near-identical pace a car cannot COMPLETE a pass on raw speed, so the passes
that happen come from ERS, the pace biorhythm and the slipstream rather than
from one car simply out-driving another all lap.

What the ranges actually establish, against the 8.47 % baseline:

- **Nose-to-tail time is up at BOTH circuits with no overlap at all** — 23.5 ->
  28.0 % at monza, 12.3 -> 14.7 % at monaco. Cars spend more of the race in
  each other's gearbox, which is the F1 look and the point of the change.
- Oscillation count up at monaco (7 [4–12] -> 18 [10–26]).
- PROBABLE: flips up at monza (146 [109–165] -> 185 [155–222]); stringing down
  at monza (overlap only 1087–1157, medians well apart).
- NOT ESTABLISHED anywhere: settled passes, and monaco stringing — that metric
  still ranges 991–5883 m on one tree and proves nothing.

Lap time held again: monza normal 120.68 -> 121.30 s (+0.51 %), and the
difficulty steps are intact (easy +4.31 % against +4.32 % before, hard -3.81 %
against -3.18 %).

So the SPREAD half of "like F1" is done and measured. The remaining half is
that overtaking is not hard enough, and that is AI-side work.

### The correction this forces on the rest of this file

**Field stringing is too noisy to carry a claim, and this file has been
carrying claims on it all day.** "Monaco stringing halved" in the dirty-air
work, "strings out 4461 -> 3785 m" for the pass hysteresis, and the first
version of THIS section's "1548 -> 1122 m" were all single runs against single
runs. A metric whose own baseline ranges 1337–7807 m cannot resolve a 2x
difference at n=5, let alone at n=1. Every stringing number in this file that
is not written with a range should be read as an anecdote.

The instrument was built to stop exactly this, and the error was still made
once more after building it — comparing a single old run to a new median — which
is why the rule now has its own line: **compare like with like, n=5 to n=5, or
say nothing.**

### Where "like F1" actually stands

The spread is F1-like and that part is certain, because it is definitional.
What is missing is the OTHER half of what makes F1 look like F1: overtaking is
genuinely hard there. Twenty-one cars on near-identical pace with easy passing
produce a train that trades places constantly — the monza flip count rising is
that, and it is the honest cost of this change.

`DIRTY_AIR` was tried as the lever (0.35 -> 0.60 measured flips 200 -> 165,
settled 23 -> 29, oscillation 68 % -> 62 %) and REVERTED. It is anchored to the
FIA's own CFD (~20 % of downforce lost at 20 m, ~35 % at 10 m) and it is
symmetric with the player by design, so raising it past the physical reference
to fix AI churn would make a player's car handle unphysically in traffic. The
next lever is on the AI side — `AiDrive.otWant`'s attack thresholds, or a
longer post-pass lockout — not the aero model.

## Which AI instrument can actually resolve a change (2026-09-09)

Measured with `--runs 5`, and the two tools are not in the same league.

**`ai-line.mjs` — apex depth is TIGHT.** Five seeds at monza, field rebuilt each
run:

| corner | apex median | range |
|---|---|---|
| s=2068, len 128 m | 6.03 m | **0.042 m** |
| s=2451, len 52 m | 3.69 m | **0.185 m** |
| s=4685, len 288 m | 5.97 m | **0.022 m** |

**`ai-field.mjs` — pass counts are WIDE.** Three seeds, 60 s at monza: settled
passes 8 **[7–29]**, flips 25 [15–52].

So the aero term's 0.60 m at s=2451 was **over 3× the widest re-race range**
there, and 15–30× the range at the other two corners: unambiguous, and the
paired A/B that caught it now has an error bar under it rather than an
assertion. The pass-hysteresis "27 → 19", by contrast, sits inside a four-fold
spread and remains unproven.

The practical rule, and it inverts the order things were reached in today:
**for a change to the AI's DRIVING MODEL, measure the line first.** It resolves
sub-100 mm moves on a handful of runs. Field behaviour needs many runs to say
anything about a small effect, and lap time (`ai-pace.mjs`) can move the right
way while the driving gets worse — which is exactly what happened.

One thing the range exposes that is NOT a defect to fix: `ai-racecraft-vm`'s
apex threshold is 3.5 m, and s=2451 measures 3.69 m median in isolation with a
0.185 m range — roughly one range-width of headroom, the tightest of the three
corners by an order of magnitude. (In-suite it reads higher, ~4.07 m, because
the spec runs after three other tests with the RNG stream advanced.) A future
change could trip that corner without being wrong. The answer is to measure with
`ai-line --runs 5` before concluding, NOT to widen the threshold — it is
measuring a real property and it caught a real defect today.

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

**UPDATE, later the same day — the caveat below was too kind, and the
instrument now says so.** `ai-field.mjs --runs N` (added 2026-09-09) seeds and
REBUILDS the field per run. Three runs of 60 s at monza:

    settled passes   8 [7–29]        order flips   25 [15–52]
    field strings    344 [209–374] m -> 561 [308–564] m
    nose-to-tail     24.4 [18.2–33.9] % of car-time

A **four-fold** spread in settled passes across three seeds. The monza
"27 → 19" above is comfortably inside that, so it is **not evidence of
anything** and should not be read as the hysteresis making monza worse; nor is
monaco's 15 → 22 established, though its other metrics all moved the same way.
The right reading of the shipped change is: the mechanism is sound, and its
effect size is below what a single run can resolve.

Building the flag also found that the obvious implementation is a lie. Setting
`__apex.seed()` after boot changes NOTHING — the AI's in-race decisions are
deterministic given the field, and the randomness enters at CAR CREATION — so
the first cut reported a range of ZERO across seeds 1/2/3. A zero range reads
as "this metric is rock solid" when it actually meant "the knob is not
connected", which is worse than having no instrument at all. The seed has to be
set and the field REBUILT (`apex.seed(n)` then `race()`), which apex.js's own
comment describes. Seed 1 + rebuild reproduces the boot field exactly, so
`--runs 1` is unchanged and the older single-run numbers stay comparable.

The original caveat, kept because it is the general rule: **every number in
this file that is not marked with a range is a single run.**
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

## 2026-09-14 — the straight-line defence: a real defect fixed, and NO measurable benefit

`e9a9f56ca` shipped a fix to `AiDrive.defendPull` and said so in its own subject:
"the effect is UNPROVEN". This is the measurement that closes that, and the
answer is **no measurable benefit**.

**The defect was real.** On a straight the function derived the side to cover
from curvature (`coverSide = -Math.sign(kA)`), and on a straight `kA ≈ 0`, so
`-Math.sign(0)` is not a direction and the function returned 0. The AI never
defended a straight at all — no covering the line into turn 1, no breaking the
tow — and `defendOnce`'s "one defensive move per straight" limiter had nothing it
could ever limit. The fix covers the side the attacker is lining up on.

**Why the obvious experiment is worthless here, measured.** Before running
anything real I calibrated the chaos floor: a SHAM arm — the pre-change guard
plus a `(1 + 1e-3)` multiplier on the *corner* pull, ≤ 0.6 mm of lateral target
on a pull that maxes at 0.635 m — against the unmodified tree, monza, seed 1,
240 s:

| | finishing order | straight-episode pass rate | lead prog |
|---|---|---|---|
| off | RUS, PIA, ANT, LEC, GAS … | 0.2994 | 11747.3 m |
| sham (0.6 mm) | VER, LEC, PIA, ANT, RUS … | 0.2743 | 11735.5 m |

A physically meaningless perturbation reshuffles the finish and moves the pass
rate by **0.025**. The real change moved it by 0.054 and 0.013 on two piloted
seeds. **The treatment effect at one seed is the size of a perturbation with no
physical meaning**, so "run races with and without and count overtakes" cannot
answer this question on any number of seeds this box can afford. (At `eps = 1e-9`
the runs stayed byte-identical over 120 s, so the divergence has a threshold —
`1e-3` is the calibration knob, `1e-9` is not.)

**The instrument that can answer it.** `tools/check/defend-duel.mjs`: every other car
retired, two AI cars staged on an auto-detected straight (the whole 18–70 m
lookahead window under `defendPull`'s own `|kA| ≤ 0.004` for 380 m), 8 s per cell,
**both arms run back-to-back on the same cell inside one session**, so a
difference is the branch and not the session. The same cell reproduces to the
digit — there is no chaos to average over.

**Result — monza, drivers 0/1, 1260 cells (6 fracs × 7 gaps × 10 lateral offsets
× 3 closing speeds):**

| | ON | OFF |
|---|---|---|
| straight-defend samples (anti-vacuity) | **105 516** | **0** |
| passes completed | 253 / 1260 | 259 / 1260 |
| median defender advance per 8 s | 472.2 m | 467.7 m |

| outcome flips | |
|---|---|
| cells changed | 28 of 1260 (2.2 %) |
| held where it previously failed | **17** |
| lost where it previously held | **11** |
| one-sided binomial vs a fair coin | **p = 0.172** |

Conditioning on the 469 cells where the cover actually moved the car — i.e.
where the treatment did something — sharpens it rather than rescuing it:

| | |
|---|---|
| flipped to defended / to passed | 11 / 7 (p = 0.240) |
| median Δ end gap | **+0.000 m**, 154 up / 150 down |
| median Δ defender advance | +1.10 m |

**The pre-registered rule** (declared before the run: PROVEN needs ≥ 20 cells
changed AND ≥ 4:1 toward defended, p < 0.01) is **not met** — 28 cells, 1.55:1,
p = 0.172. The end-gap split of 154/150 is a coin.

**What this licenses saying.** The branch is live and fires hard, the defect it
fixed was real, and the cover costs the defender nothing (+1.1 m advance, +0.000 m
gap — it is not a self-inflicted time loss). It does **not** measurably improve
pass resistance. Keep it as a correctness fix; do not claim it as a racecraft
improvement.

Stopped after one driver pair, deliberately, because the design pre-registered
"run one pair first and stop if it is flat". It is flat. Sweeping more pairs until
one looked favourable would be fishing, and this file already carries one entry
whose headline turned out to be the author's own measurement error.

## 2026-09-14 — the pass latch engaged outside its own release window

`js/game.js` releases the pass latch when the blocker is more than 16 m ahead
("lost it: no penalty"), but the ENGAGE condition had no gap term at all —
`if (!c.passOf && c.passCool <= 0 && moveOn)`. So a car could commit to a pass on
a blocker already outside the window and drop it on the next frame, with no
cooldown to stop it re-latching the same car immediately. Both ends now read one
constant, `AI_PASS_LATCH_M`, so they cannot drift apart again.

MEASURED with `scratch/churn-probe2.mjs`, monza, **6 seeds**, 120 s, paired
against the same tree with the bound stashed:

| | before | after |
|---|---|---|
| engagements | 790 | **465** (−41 %) |
| released as "lost it" | 325 | **20** (−94 %) |
| started beyond 16 m | 49.7 % | **0** |
| median engagement duration | 0.58 s | **1.27 s** |
| under 1 s | 64.6 % | 44.1 % |
| completed passes | **62** | **51** (−18 %) |
| completion rate, engagements inside 16 m | 0.116 | 0.110 |

**Read the last two rows before the first four.** The bound does exactly what it
says structurally — no engagement now starts outside the window, and abandoned
latches all but vanish — but the per-engagement completion rate is FLAT
(0.116 → 0.110). This does not make the AI better at passing. It makes it stop
attempting passes it could never complete, and that costs ~18 % of completions.
Whether that is a gain depends on the target, and this file's own calibration says
the field is far too pass-happy (29 settled passes per 240 s against 30.9 per real
RACE), so fewer attempts and fewer completions is directionally right rather than
a regression. It is a behaviour change with a real cost, not a free win.

**The n=3 reading was wrong, and in the flattering direction.** At 3 seeds
completions appeared to RISE (30 → 32) and the change looked free; at 6 seeds they
fall 18 %. Same instrument, same track, same code. This is the third entry in this
file to record a result that reversed when the sample grew — the others being the
pace-spread n=5 section and the straight-line defence above — and the pattern is
always the same: the small sample flattered the change being tested.

Guards 178/178, ai-drive 57/57, ai-racecraft-vm 4/4. `js/game.js` grew 3 lines /
1 code line for the named constant; both ceilings raised by exactly that.
