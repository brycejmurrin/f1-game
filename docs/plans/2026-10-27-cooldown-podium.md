# Cooldown lap, parc fermé and podium — plan, 2026-10-27

Status: PLAN (issue #1584, parent #1583). Docs only; the build slices at the end become sub-issues of #1584.

## Goal

After the chequered flag the race ends the way a broadcast does: the player's cooldown lap, the top three
rolling into parc fermé, a short podium moment, then the existing results sheet. It must work on Bryce's phone
(844×390 landscape, touch, TLX WebGPU on iPhone), cost nothing on the boot wall, and never hold the player
hostage: one tap skips to the sheet at every phase.

## What exists today (surveyed on the tip, 2026-10-27)

| piece | where | what it already gives |
|---|---|---|
| finish detection | `RaceControl.lineTransition` / `settleLine`, `js/race/race-control.js` | `c.finished`, `c.finishT` per car; no phase string |
| post-flag coast | `coast()` in `js/game.js` (the `c.finished` early return in `updateCar`) | every finished car already bleeds to a floor speed on the inside line, held at the pit limit in the lane. **This is a cooldown lap with no destination and no presentation.** |
| post-finish wait | `RaceControl.finishDelay`, `postFinish` in game.js | solo: keeps running up to `POST_FINISH_CAP` = 75 s after the player's flag while AIs finish; 2.2 s once all humans are done; skip via Enter / `#pm-skip-results` |
| end of race | `endRace()` in game.js | classifies, sets `c.finPos`, **settles points and career money**, then `resultsCam.onFlag()`, `buildResults()`, opens `<dialog id="results">` |
| camera | `ResultsCam` (`js/camera/results-cam.js`) | phases `idle/chequered/orbit/highlights/done`; side vantage 2.2 s then a 28 s orbit of the winner; highlights reel button. Disabled on mobile, at `PerfGov.tier() >= 2`, in netplay and WATCH |
| podium visuals | `ResultsStory` podium tiles (`js/ui/results-story.js`), `p1`-`p3` row classes (`js/ui/results-sheet.js`) | 2D podium already drawn inside the sheet |
| audio | crowd swell on the flag (`js/audio/crowd.js`), radio line `eng.podium`, `announcer.wrapUp` | reusable cues |
| pit complex | `TrackPit` (`js/track/core/pit.js`), `track.pit.row` (`s0`, `s1`, `tail`), `TrackPit.at(track, s)` (`workCentre`) | the bay row and its tail are the natural parc fermé; no anchor exists yet |
| hooks | `__apex.info().state` (`race`/`results`), `carState()`, `finishRace()` (jumps straight to `endRace`) | nothing exposes the post-finish wait or the ResultsCam phase |

No cooldown, parc fermé, ceremony or champagne code exists in `js/`.

## Decisions (Bryce delegated; recorded here)

1. **Settle first, present second.** `endRace()` is split into `settle(order)` (classification, points, career
   money: today's body up to `careerSettlement`) and `present()` (camera, sheet). Settlement runs at the moment
   it runs today, so quitting mid-ceremony can never lose points or money. The ceremony plays between the two.
2. **The cooldown lap is the existing coast, presented.** The player does NOT get control back in v1: `coast()`
   already drives every finished car and is deterministic, and handing control back would put a second physics
   path under the finished-car early return (physics-characterization territory). v1 dresses the coast: chase
   camera, a "COOLDOWN LAP · P2" banner, and a destination (slice 3). Driven cooldown is a later tier.
3. **Phone first, so not ResultsCam's gate.** ResultsCam's orbit is off on mobile and at PerfGov tier ≥ 2. The
   ceremony uses only the race camera rig plus cuts (no extra render passes), so it runs everywhere; the orbit
   stays where it is today.
4. **The podium is 2D over 3D in v1.** The three cars parked in parc fermé are the 3D subject; the podium itself is
   the `ResultsStory` tiles promoted to a full-width overlay for ~4 s. A modelled podium structure, figures and
   champagne are a later tier (each circuit's props-tris ratchet has ~0.5 % headroom, so a per-circuit structure
   needs its own budget plan).
5. **Skips.** Netplay and WATCH skip straight to the sheet (no replicated ceremony in v1). TIME TRIAL and
   practice have no podium. A setting `Post-race: FULL / QUICK / OFF` (`apex26.postRace`, default FULL; QUICK =
   podium card only) lives in the race settings.

## Phases and triggers

A pure phase machine, `PostRace` in a new `post-race.js` under js/race/ (`PostRace.create(G)`, LAZY_RACE_SESSION so it
costs nothing at boot; game.js must not grow — the split of `endRace` pays for the hook lines).

| phase | enters when | what happens | leaves when | skip |
|---|---|---|---|---|
| `flag` | the player's `c.finished` turns true | crowd swell (exists), banner "CHEQUERED FLAG · P<n>" | 2.5 s | tap / Enter → `sheet` |
| `cooldown` | after `flag`, while `finishDelay` still returns 0 (AIs running) | coast continues; banner "COOLDOWN LAP"; chase cam; position tower stays live | `finishDelay` > 0, i.e. today's `resultT` start (all running cars done, or the 75 s cap) | tap → `sheet` |
| `settle` | `resultT` reaches 0 (today: `endRace`) | `settle(order)` only: classification, points, money | immediately | — |
| `parc` | after `settle`, top three known | P1-P3 only, placed kinematically in the pit lane, blending from their coast pose to parc slots on `track.pit.row` tail, `TrackPit.at().workCentre`; cut to a side vantage on P1 | slots reached or 6 s | tap → `sheet` |
| `podium` | after `parc` | full-width podium card (P2-P1-P3 tiles, team colour, gap), radio `eng.podium` when the player is in the top three, camera holds on the parked cars | 4 s | tap → `sheet` |
| `sheet` | after `podium`, any skip, or the setting OFF | `present()`: today's `resultsCam.onFlag()` + `buildResults()`; highlights button as today | — | — |

Edge cases: a retired player (`dnf`) goes `flag`-less straight to `cooldown` presentation of the leader; a red-flag
result (`forcedOrder`) skips `cooldown`; a street circuit with `hasBays: false` parks in the lane at `row.s1`
offsets; a pit lane on the far side of the lap from the line (pit side vs finish) uses the existing coast
destination: cars keep coasting until they reach `pit.sIn`, held at the limit, so `parc` may start mid-lane.

## Camera plan

- `flag` / `cooldown`: the player's current camera, then the chase rig; no new rig.
- `parc`: `G.camVantage("side")` (the vantage ResultsCam already publishes), aimed at P1's slot; one cut, no blend
  across the pit wall (skill `f1-animation-cameras`: cuts that jump are the defect to avoid; a cut is fine, a
  half-blend through geometry is not).
- `podium`: hold the parc vantage, slight dolly (reuse `ResultsCam.orbitPose` maths at a fixed angle) where PerfGov
  tier < 2; static otherwise.
- `sheet`: unchanged (`resultsCam.onFlag()`).

## Phone layout (844×390 landscape, touch first)

- Banner: top-centre pill, one line, inside the safe area, ≤ 40 % of the width; never covers the position tower.
- A `SKIP ›` chip bottom-right at ≥ 44×44 px tap size; the whole canvas tap also skips (except during the first
  0.6 s, so the throttle finger lifting does not skip by accident).
- Podium card: three tiles side by side, 116 px tall max at 390 px height; names truncate with ellipsis; the
  existing `ResultsStory` tile markup and tokens (`--podium-place`), no new CSS classes (the tree `cssClasses`
  ratchet is shrink-only: use `data-*` attributes).
- `prefers-reduced-motion`: no dolly, no banner slide.

## `__apex` hooks

- `__apex.postRace()` → `{ phase, t, setting, subject: carIdx, parc: [{ carIdx, slot, s, x, reached }], skipped }`.
- `__apex.postRaceSkip()` → jumps to `sheet` (same path as the tap).
- `__apex.finishRace({ ceremony: true })` → marks cars finished and runs the phase machine instead of jumping to
  `endRace` (today's behaviour stays the default so existing specs keep their timing).
Each gets its comment for `node tools/gen/gen-hooks-table.mjs` and a `###` section in `docs/DEBUG-HOOKS.md`
(`tests/unit/hooks-documented.test.mjs`).

## Test plan

- Unit (toolingFast): a new unit file `post-race-phase.test.mjs` — the pure machine: phase order, every skip path,
  timeouts, netplay/WATCH/time-trial/setting OFF go straight to `sheet`, DNF and red-flag entries.
- VM: extend `tests/unit/race-flow-vm.test.mjs` — finish → settle happens exactly once and BEFORE `parc`; a quit
  during `podium` keeps the points (`SeasonCal` / `Career.scoreRound` called once).
- Browser: a new spec `post-race-flow.spec.js` in group `test:modes` (with season.spec.js) at 844×390,
  `hasTouch`: `finishRace({ ceremony: true })` → phases advance → `#results` opens; the SKIP chip is ≥ 44 px and
  skips from every phase; Escape/back never strands the player between phases. `results-cam.test.mjs` unchanged.
- Visual sign-off: one parc/podium screenshot per backend (TLX, GLX) via `shot.mjs`; never an assertion source.

## Build slices (each one PR)

- [ ] S1 — `PostRace` phase machine (pure) + `endRace` split into `settle`/`present` + `__apex.postRace` /
      `postRaceSkip` + unit test; no visual change (machine runs `flag → sheet` with today's timings).
- [ ] S2 — cooldown presentation: banner, chase cam, SKIP chip, the setting; phone layout check at 844×390.
- [ ] S3 — parc fermé: parc slots on `track.pit.row` tail (all circuits, street pits included), kinematic in-lap of
      P1-P3 after `settle`, side-vantage cut; VM test of slot placement on three circuits.
- [ ] S4 — podium card + audio cues + `finishRace({ceremony:true})` + the browser spec.
- [ ] Later tier (not filed now): driven cooldown lap; a modelled podium structure with a per-circuit tris budget;
      champagne/confetti particles; netplay-replicated ceremony; the manual pit-stop mini-game (#1583 tier 3).

## Risks

1. `endRace` is in game.js (ratcheted): the split must move lines out, not add them.
2. Settlement order: any ceremony code that runs before `settle` re-creates the "quit loses points" bug class.
3. The 75 s solo wait is already long; `cooldown` must keep the SKIP chip visible from its first frame.
4. Kinematic parc placement must not touch physics state that replays or determinism read (cars are `finished`
   and out of the physics step already; keep it that way).
