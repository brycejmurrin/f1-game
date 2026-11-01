# Traffic tactics recipe

All in `ai-drive.js` / `ai-corridor.js`; state in game.js's per-car AI update (find the caller as in `ratings.md`; PHYSICS.md §Racecraft tactics).

- **Follow gap** is a TIME (`followGap`: s0 + v·T, T 0.15-0.30 s; tight 0.05 s when a pass is
  latched/armed or towing). Queue window `max(16, follow+6)`.
- **Pass side** = inside of the NEXT corner (`c.kTurn`, `passSideBonus`). Get a run with
  `runExtra` / `latchLate`; lane look-ahead is `AiCorridor`.
- **Attack roll** per zone: `attemptRoll`, never `simRnd`.
- **Level pair**: the car on the outside of the next corner yields; commit-or-yield after 2 s
  (`sbsCommitT`). Any flip → `repassLock`, and the passer becomes a wide blocker.
- **Defending** mid-train / adjacent lane / predicted side: `defendPull`. Opening calm: `startCalm`
  (full while launching, then fades to 0 over the last 10 s of `START_CALM` after the launch ends).
- **Human blocker**: judged by `paceVmax` (`paceSample` profile); a held line arms `humanYieldT`
  at a quarter rate. `kTurn` never reaches a human pair in collide.js.
- **STREETS** (`track.street`) keep the metre gap and the old pass gates (no look-ahead /
  latchLate / runExtra / 0.8 side bonus / wide lockout blocker): those cost monaco passes.
- Measure: `ai-race.mjs tactics`.

## Pass completion (faster stuck behind slower)

Permanent circuits only (`!track.street`). A ≥ ~0.7 % pace edge (`PASS_EDGE`) that
sits in the queue raises **passHunger** (1..~2.2 from `queueT` + edge × craft): it
stretches `runExtra` and lifts `towGain` on the straight, and the same edge lowers
`otWant`'s margin. Edge is the larger of
`paceVmax` (m/s over vTop) and scripted pace (`tierV×skill`, unitless, compared as
a ratio — the same one `ai-tactics` uses for stuck dpace) via `pairEdgeN`. The defender's **coverConcede** (edge × awareness ×
experience; AI-AI only — a human chaser must keep the cover so `humanYieldT`
still sees an intruding lean) scales `defendPull` down and returns 0 at ≥ 0.70 (ai-drive.js `coverConcede`; `sbsConcedes` uses the same cut)
so `defendOnce` does not spend the one-move-per-straight on a lost cover —
`CONCEDE_EDGE_FULL` 0.008 so a ≥0.8 % pair zeros cover (pinned by `tests/unit/ai-pass-complete.test.mjs`). Hunger
does not raise `otFireRate`, `otShouldFire` or `latchLate` (a reverted bump raised contact). Instead: towGain
+65 % slipstream, and a conceding defender tucks sooner (`sbsCommitT` 1.15 s,
`sbsEase` 0.94). ERS `wantBoost` catch also arms on the same pace edge when
live speeds are queue-levelled. Streets ignore every knob above. Unit pins:
`tests/unit/ai-pass-complete.test.mjs`.

## Lap-1 / Turn-1 melee (cars racing each other into contact)
Merely aggressive dives into contact are here; launches, debris and the `c1Pileup` takeover are
race-incidents-control. "Dive-bombs" (late lunges into a corner, esp. turn 1) are NOT
`otFireRate`: it never reads calm. Find the lunge rule via `lsp_references` on
`AiDrive.sideLevel`. Knobs, in the order a dive is decided:
1. `attackOK` quality ≥ 0.32 — `startCalm` cuts it via `ctx.calm` toward `START_ATTACK`
   (it does NOT touch `otFireRate`), plus `passReach` (half alongside by the turn-in?).
2. game.js's lunge rule abandons a move still not half alongside at `toTurnIn < 6`.
3. `brakeTarget` late-brake and optimism (`references/brake-target.md`) — how deep the dive goes.
4. `startGapT` headway, the tight follow gap (`followGap`), `passSideBonus`, `sbsCommitT`.
Measure BEFORE and after, same seeds:
`node tools/check/ai-race.mjs tactics --track monza --laps 3 --runs 5` — compare `byLap` lap 1
against later laps (a lap-1-only excess is calm/startGapT; every lap is attackOK/late-brake)
and the swap-back count. Confirm on a second circuit; no per-track constant: these are field-wide rules, so a
Monza-only fix is wrong.
