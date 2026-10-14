# Traffic tactics recipe

All in `ai-drive.js` / `ai-corridor.js`, state in `updateCar` (PHYSICS.md
§Racecraft tactics): follow gap is a TIME (`followGap` s0 + v·T, T 0.15-0.30 s, tight 0.05 s when a pass is
latched/armed or towing; queue window `max(16, follow+6)`); pass side = inside of the NEXT corner (`c.kTurn`,
`passSideBonus`); get a run (`runExtra`/`latchLate`); lane look-ahead (AiCorridor);
per-zone attack roll (`attemptRoll`, never `simRnd`); level pair: outside of the next
corner yields, commit-or-yield after 2 s (`sbsCommitT`); any flip -> `repassLock` and
the passer is a wide blocker; defending mid-train / adjacent lane / predicted side
(`defendPull`); first 20 s calm (`startCalm`). A human blocker is judged by `paceVmax`
(`paceSample` profile), and a held line arms `humanYieldT` at a quarter rate.
`kTurn` never reaches a human pair in collide.js. STREETS (`track.street`) keep the metre
gap and the old pass gates (no look-ahead / latchLate / runExtra / 0.8 side bonus / wide
lockout blocker): they cost monaco passes. Measure: `ai-race.mjs tactics`.

## Pass completion (faster stuck behind slower)

Permanent circuits only (`!track.street`). A ≥ ~0.7 % pace edge (`PASS_EDGE`) that
sits in the queue raises **passHunger** (1..~2.2 from `queueT` + edge × craft): it
multiplies `otFireRate`, lowers `otWant`'s margin, latches early (`latchLate`),
stretches `runExtra`, and lifts `towGain` on the straight. Edge is the larger of
`paceVmax` and scripted pace (`tierV×skill`, same ratio as `ai-tactics` stuck
dpace) via `pairEdgeN`. The defender's **coverConcede** (edge × awareness ×
experience) scales `defendPull` down and returns 0 past ~0.80 so `defendOnce`
does not spend the one-move-per-straight on a lost cover — measured pre-fix as
covers.vsAI ~1000 with ~1 % pairs stuck 100–125 s (monza 3×3, 2026-10-14). ERS
`wantBoost` catch also arms on the same pace edge when live speeds are
queue-levelled. Streets ignore every knob above. Unit pins:
`tests/unit/ai-pass-complete.test.mjs`.

## Lap-1 / Turn-1 melee (cars racing each other into contact)
Merely aggressive dives into contact are here; launches, debris and the `c1Pileup` takeover are
race-incidents-control. Knobs: `startCalm` (first `START_CALM` s calm, scales attack rate via `ctx.calm`),
`startGapT`, the tight follow gap (`followGap`), `passSideBonus`, `sbsCommitT`. Instrument:
`node tools/check/ai-race.mjs tactics --track monza --laps 3 --runs 5` (read `byLap` lap 1 and swap-backs).
Tactic state lives in `updateCar` (`js/game.js`): `who-is-on-it --claim` before editing it (AGENTS.md).
