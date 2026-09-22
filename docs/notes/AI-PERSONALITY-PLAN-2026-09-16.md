# AI driver personality — plan (2026-09-16)

A plan, not a change. Read against `js/data/driver-ratings.js`,
`js/physics/ai-drive.js`, `js/game.js`, the AI instruments in `tools/check/`
and `docs/notes/AI-FIELD-RESEARCH.md`, plus published prior art.

## 1. The system already exists. The data is what is broken.

There are FIVE authored axes, not four: pace, craft, awareness, consistency,
experience, 0–100, twenty-two authored rows with a hashed fallback and
career deltas on top. Each is already consumed in several real decisions —
craft drives overtake fire rate, the permanent pull, late braking while
attacking, defend magnitude, lane adaptation, pass hold and launch hands;
awareness drives the stuck threshold, follow padding, contact give, the
overtake awareness multiplier, the energy bank gate, let-pass delay and
reaction time; experience drives steer damping, unstuck pull, pass cooldown
and the post-pass lockout; consistency drives the skill jitter, brake
thresholds, the pace biorhythm's amplitude, mistake chance and qualifying
execution spread. Launch plans, a pace biorhythm, tyre-taste rolls, house
style, team orders and a complete mistake model are all already per car.

**The defect is that the five axes are one axis.** Pearson correlation over
the authored rows:

| pair | r |
|---|---|
| craft ~ awareness | 0.93 |
| awareness ~ consistency | 0.96 |
| craft ~ consistency | 0.92 |
| pace ~ craft | 0.87 |
| pace ~ consistency | 0.87 |
| pace ~ experience | 0.46 |

Everything downstream is monotone in "good", so a fast driver also attacks
more, brakes later, defends harder, errs less and starts better. That is a
quality dial with five outputs — precisely the single difficulty scalar this
work is meant to escape — and no amount of new wiring in the racecraft layer
fixes it while the correlations sit near 0.9.

## 2. Two latent defects found on the way

- **`c.errCount` is written, never read, never cleared.** It is absent from
  the racing-scratch clear and from the episode-transient list, which makes
  it a latent episode-diff failure that only hides because a short rollout
  rarely trips a mistake.
- **No instrument counts mistakes.** None of the pace, field, line, human or
  duel instruments report them, so the mistake model is currently
  unfalsifiable. That must be fixed before any axis that claims to change
  error behaviour can be gated.

## 3. What the prior art actually offers

Every mechanism worth copying is plain parameterisation; only the learned
systems need infrastructure this project does not have.

- **rFactor 2 per-driver records** are the closest prior art: aggression
  gives other cars less room when passing and when following, raises pass
  frequency, and raises the endurance before abandoning a pass; composure is
  the frequency of intentional mistakes, scheduled as bad-driving zones.
- **iRacing rosters** add optimism — confidence in one's own skill, where
  low means lifting early and high means optimal braking markers — and
  smoothness, where low means more oversteer. Optimism is the cheapest
  believable mistake axis in the industry, and it is signed: over-confidence
  is a cost, not a quality.
- **Assetto Corsa Competizione** frames aggression as a conflict-resolution
  weight: how much the car cares about the racing line versus how much it
  cares that you are in the spot it wants.
- **Gran Turismo Sophy** is out of scope as machine learning, but its
  reported lesson transfers: a week before its first exhibition the agent
  was deliberately crashing and blocking. Aggression without an explicit
  etiquette cost degenerates.
- **Forza's Drivatar** needs a telemetry pipeline this project has no
  equivalent of.

The industry's signed axes are aggression, optimism or composure, and
smoothness. All three are trade-offs rather than qualities, which is exactly
the property the current table lacks.

## 4. The design rule that keeps personality from becoming difficulty

A style axis is signed, zero-mean across the grid, excluded from the overall
rating and from the skill draw, and may never appear in the top-speed
product. The invariant to pin in a unit test is that top speed is the
existing product of base speed, pace, tier, skill, difficulty, biorhythm,
tyre and band, with no style term anywhere. Difficulty scales how well the
field drives; personality scales what it chooses.

Zero-mean is enforced by construction rather than hope: assign style values
by the interleaved alternating-sign pattern the grid builder already uses
for lane preference, over the grid sorted by overall rating, so the sum is
about zero and the assignment is deterministic and seed-free.

## 5. Axes, ranked

1. **Decorrelate the table and add a style block.** Not an axis; the
   precondition for every axis. Re-author the ratings so craft, awareness
   and consistency are not monotone in pace, targeting correlations below
   0.5 while keeping each column's mean and the grid ordering. No new
   decision code at all — every existing consumer immediately spreads.
2. **Aggression.** Wires into overtake fire rate, the attack threshold, pass
   hold, lateral clearance, contact give, follow padding and the one defend
   move. The player sees one car appear from three lengths back and leave
   half a width, and another shadow for two laps.
3. **Composure.** Consistency already owns baseline error rate; composure
   owns the derivative — how much a chaser inside six tenths degrades this
   driver. It replaces a hard-coded pressure coefficient in the mistake
   chance with a range.
4. **Energy bias.** One term in the boost thresholds. Energy is conserved
   either way, so mean lap time cannot move.
5. **Line style**, early versus late apex. The one axis the repo can prove
   cheaply, because the line instrument resolves to a few centimetres. It
   carries a caveat: apex depth is lap time, so the trade must be
   corner-type dependent and verified per circuit, and it will likely trip
   an existing apex threshold that must be pinned to a fixed driver rather
   than widened.
6. **Tyre care**, gated on wear being enabled, and last because it is the
   only accepted axis that re-baselines the physics characterization.
7. **Qualifying bias.** One term in the qualifying model, zero race risk,
   only legible across a season.

## 6. The mistake model

It already exists and is built correctly for this. Mistake chance is rolled
once per braking zone at the zone transition, never while alongside another
car, and the roll is a hash of the seed, grid position, lap and zone key
rather than a draw from the seeded stream — which is what keeps the
one-draw-per-car contract that the determinism tests depend on. The error
runs a late phase and then a gather phase.

New mistake kinds belong on the same hash with a category namespace added to
the key, so a second error type draws an independent stream without
perturbing the first. No new draw from the seeded stream on the AI path.
Every new per-car field must be either cleared on reset or listed as an
episode transient.

### Baseline, five seeds (2026-09-22)

`node tools/check/ai-field.mjs --runs 5 --diff normal` (monza, 21 AI cars,
240 s, wear off) reads **0.040 [0.02-0.06] mistakes per car per 100 s**,
2 [1-3] total over 5040 racing car-seconds. That settles an open question:
a single run taken earlier read 0.020 and was briefly read as a drop. It is
the LOW END OF THE RANGE, not a regression — `--seed` does not vary anything
on a single run (the seed is set and the field rebuilt only by `--runs`), so
one sample here is reproducibility, never precision. Step 1's gate ("the
counter non-zero, medians unchanged") holds: the model is live and its rate
is where it was documented. No retune is owed.

Read the median against this range, never a single number against 0.040.

## 7. Order, each with a gate

Capture baselines first at five seeds. Then:

1. Instrument the mistake model: clear the counter, expose it, report
   mistakes per car per hundred seconds. Gate: episode diff clean, replay
   byte-identical, medians unchanged, and the counter non-zero — if the
   shipped field never errs, the model is inert and step three is pointless.
2. Decorrelate the table and add the style block. Data only. Gate: pace
   within half a percent at all three difficulty levels on three circuits,
   field spread inside its published range, line depths inside theirs,
   career and qualifying tests green.
3. Aggression, wired only to fire rate, attack threshold and pass hold.
   Gate: the duel instrument with paired drivers must show completion
   monotone in attacker aggression, pre-registered; field passes and
   oscillation must not rise.
4. Aggression's spacing half. Gate: contact against a driven player must not
   rise above the shipped baselines. This is the step most likely to fail;
   revert this half and keep the previous step if it does.
5. Composure, gated on the new counter. 6. Energy bias. 7. Qualifying bias.
8. Line style, optional. 9. Tyre care, optional and last.

Steps one to seven should re-baseline nothing, because no term reaches the
speed product, the difficulty terms or the tyre model. If a gate forces a
pace-ladder re-cut, that is the signal a style axis leaked into the speed
product: fix the leak rather than re-cut the ladder.

## 8. Rejected, with reasons

- **Patience** is the negative pole of aggression and is already spread
  across pass hold, pass cooldown and let-pass delay. A separate axis would
  be a second knob fighting the first.
- **Defensiveness** was measured: the straight-line defend branch changed
  twenty-eight of one thousand two hundred and sixty cells with no
  significant effect on pass resistance. An axis whose only seam is a
  decision proven invisible cannot be gated.
- **Willingness to make contact** is the top end of aggression; separating
  them gives two knobs on the same clearance rule.
- **Error rate** is consistency, already consumed four ways.
- **Recovery from mistakes** is not an axis; it is one line making the
  gather multiplier depend on experience.
- **Wet-weather skill** is a second difficulty slider in a costume while the
  AI has a single wet grip scalar.
- **Learned personas** need training and telemetry infrastructure this
  project does not have.

## 9. Risks

Mean-pace invariance is not mean-result invariance: an aggressive tail
passes more, and the field is already calibrated near the generous end.
More aggression means more contact, more incident takeovers and more
cautions, a second-order effect the AI instruments do not measure — watch
contact share and the incident tests rather than lap time. And every
measurement taken at three seeds in this repository has reversed at five or
six, three times, always flattering the change: five seeds minimum, and a
difference inside the range is unproven.

## 10. Step one shipped, 2026-09-16 — and it fails its own gate

`c.errCount` is cleared by `clearRacingScratch` (so a re-grid starts a race at
zero, beside `c.hits` and `c.cuts`), listed in `EPISODE_TRANSIENTS` (the leak
§2 predicted was real — the guard never caught it only because a four-second
rollout rarely trips a mistake), exposed as `err` on `__apex.cars()`, and
reported by `tools/check/ai-field.mjs` as mistakes per car per 100 s.

**The gate was "the counter non-zero". On the shipped field it is zero.**

Monza, normal, 21 AI cars, measured by wrapping `AiDrive.mistakeChance` to
count rolls as well as hits:

| window | rolls | mean chance | expected | observed |
|---|---|---|---|---|
| 300 s | 362 | 0.00248 | 0.90 | 0 |
| a longer race | 465 | 0.00237 | 1.10 | 1 |
| 5 seeds x 240 s | — | — | ~4.5 | 0 [0–3] |

So the model is not broken and the plumbing works — the counter does tick, and
zero against an expectation of 0.9 is exactly what a Poisson draw looks like.
It is the RATE that makes it inert. The roll fires 5.5 to 6.1 times per car per
lap (only in baked attack zones, never while alongside, never during an error
already in progress) at about 0.0024 each, which is **0.013 mistakes per car
per lap — one per car per 75 laps**. The shipped default race is three laps, so
the whole 21-car field is expected to make about **0.8 mistakes per race**. A
player will never see one.

**What that does to the ranking in §5.** Composure (item 3) is an axis that
scales the derivative of a rate this low; against 0.8 mistakes a race, any
setting of it is invisible, and no instrument at any seed count could separate
two values of it. It cannot be sold or gated as written. Either the base rate
is revisited first — which is a behaviour change with its own baselines, not
part of this instrumenting step — or composure moves below the axes that do not
depend on it. Items 1, 2 and 4 are unaffected: decorrelation, aggression and
energy bias all act on decisions that fire constantly.

This is the instrument doing its job. Before it existed, "the AI makes
mistakes under pressure" was a sentence in a design doc with no number behind
it, and the first axis built on it would have shipped, measured nothing, and
been tuned against noise.

One defect found and fixed in the instrument itself on the way: the first cut
divided by `--seconds x cars`, but the default race ends before a 240 s window
does, so a finished car was charged for time it was not racing. The denominator
is accumulated racing car-seconds now, and it is reported alongside the rate.
