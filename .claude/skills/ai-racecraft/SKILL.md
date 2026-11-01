---
name: ai-racecraft
description: "Use when AI cars or rivals race wrong: overtakes/dive-bombs too aggressive or passive, brake targets, preferred lane, ERS deploy, AI stuck in traffic, wall or pit lane, driver ratings craft/awareness, ai-drive.js. Not the player's car → tune-physics; flags/crashes → race-incidents-control."
---

# AI racecraft — `AiDrive`, not the bicycle model

`js/physics/ai-drive.js` holds the pure rules (rating → behaviour maps); what stays in `game.js`:
`references/ratings.md`. Terms: OT = overtake; ERS =
energy recovery system (deploy and regen); X-mode = low-drag active aero.

## Gotchas

- No `simRnd()` draw in `ai-drive.js`, and some exports are test-only: both in `references/ratings.md`.
- "Dive-bombs" are NOT `otFireRate`: `references/tactics.md` §Lap-1 / Turn-1 melee. Prove a fix on
  two circuits, never per-track.
- Hot path (per car per tick, no allocation, `trailStep` order): `references/ratings.md` §Hot path.

## Workflow

1. Classify the complaint: one car's racing (this skill), the whole field's pace
   (`references/pace.md`), a stuck car, or out of scope (below).
2. Locate the knob: the ratings map, brake target, tactics or stuck recipe (References).
3. Measure BEFORE on fixed seeds: `node tools/check/ai-race.mjs tactics --track monza --runs 5`
   (or the instrument the reference names).
4. Edit the constant in `ai-drive.js` (or the named game.js caller).
5. Run the unit gate for that edit (`references/checks.md`), then re-measure with the
   same seeds on a second circuit.
6. Run `node tools/ci/pick-tests.mjs` and report the browser groups it names as not run.

## Do not

- Steer the **player** from curvature (AGENTS.md §Physics: the arc must not reach the driver).
- Touch `PACE` / grip / `ROAD_FOLLOW` → **tune-physics**.
- Change caution / VSC / SC / debris → **race-incidents-control**.
- Career rating deltas and the economy → **career-mode** (this skill owns how the axes drive the field).

## References

- [`references/ratings.md`](references/ratings.md) — read when tuning any `AiDrive` export: what `AiDrive` owns vs
  `game.js`, the ratings → behaviour table with unit pins, the hot-path rules.
- [`references/brake-target.md`](references/brake-target.md) — read when AI brakes too early, too late, or dives too deep.
- [`references/tactics.md`](references/tactics.md) — read for bunching, passing, defending, the player as blocker,
  pass completion, and the Lap-1 / Turn-1 melee (dive-bomb) recipe; STREETS (`track.street`)
  keep the old metre gap and pass gates.
- [`references/stuck.md`](references/stuck.md) — read when an AI car is wedged and never recovers. Discriminator:
  `__apex.caution().level` 0 with `speed < 7` and `stuckT` growing is this skill; level != 0
  or `caution().sinceT` growing is **race-incidents-control**.
- [`references/pace.md`](references/pace.md) — read when the complaint is the whole field's pace or a rubber band
  (`ai-band.js`), not how one car races.
- [`references/checks.md`](references/checks.md) — read when choosing the gate for an edit: the edit → unit-test
  table and every `ai-race.mjs` field instrument command.
