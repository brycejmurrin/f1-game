# Garage ↔ race transitions — inventory and plan (#4745)

Kind: design · Re-measure-by: 2026-12-04 (re-read the four owners below; line numbers drift, names do not).

Bryce's ask: four animated moments — race start, pit in (+ work), pit out, race end — and a garage menu that
hands cleanly into and out of each. Inventory below is read from the tree at the deploy tip, not from the docs.

## The one engine

`js/garage/arrival.js` (`GarageArrival`) is a pure pose table per direction: `pose` ("in", pit stop),
`poseOut` ("out", drive-out), `poseHome` ("home", after the race). `create().start/step/finish` plays "in" and
"home" with the chrome overlay (`#cs-arrival`, `SKIP TO WORK`, Esc = skip). `js/garage/setup-camera.js` plays
"out" through a separate path (`startDriveOut` / `stepDriveOut`), driven by `js/game.js` `studioOpen`.
All of it is bay-local (metres, car at origin): it never touches `player`/physics, so the physics contract holds
by construction. Settings: the GARAGE ARRIVAL tuner (`garageArrival` store key, `GarageArrival.settings`).

## The four moments — what exists

| # | Moment | Owner | State |
|---|---|---|---|
| 1 | Race start: garage → track | `game.js studioOpen/studioDone` → `setupCam.startDriveOut` (`poseOut`) | EXISTS. Plays on every RACE!, tap skips (`studioSkip`), skipped for watch/mid-race joins/automation. Ends with the flyby; no pit-lane run to the grid is drawn in the bay (the bay scene ends at the door). |
| 2 | Pit in → work on car | `openPitWork` → `openGarage("pit")` → `setupCam.startArrival()` (`pose`) | EXISTS. Arrival with crew, SKIP TO WORK. The track-side approach (car turning into the pit lane) is the race camera, not an animation of its own. |
| 3 | Pit out: work done → track | `cs-done`/`cs-back` → `closePitWork()` | MISSING. DONE tears the sheet down (`leaveGarage`) and the race resumes at once; the "out" show exists (`poseOut`) but is only wired to race start. |
| 4 | Race end → garage | `noteResult` (game.js:3010) → `setupCam.startHome` (`poseHome`, RESULTS flavours) | PARTIAL. Plays on the NEXT garage visit after the race (up to 30 min later), not "after the flag, ahead of the results"; nothing animates between the chequered flag and the results screen. |

## Garage menu by moment (today)

- Start: `openGarage("menu"|"select"|"career"…)`; DONE → settings → RACE! → moment 1.
- Pit: `garageReturn === "pit"`; paused world, no pause card; DONE and BACK both = `closePitWork` (price only if the
  spec changed, `pits.addWork`).
- After race: results screen → GARAGE button; `startHome` plays when `pendingHome` is fresh.

## Gaps, ranked (most missing first)

1. **Pit out has no animation** (moment 3). Slice A.
2. Race end does not bring the car home before the results (moment 4): a transition from `endRace`/chequered into
   the home show, then results over the garage. Slice B (needs care: results flow, `RaceCeremony.eligible`, podium beat).
3. Race start stops at the garage door (moment 1): the pit-lane run to the grid is not shown in the bay show. Slice C,
   design-heavy — camera framing and timing are Bryce's call (`needs-decision` with options when we get there).
4. Pit in has no track-side beat (moment 2): the arrival starts in the bay. Slice D, same caveat.
5. Menu: no explicit per-moment hand-off copy (what the player can change at start / mid-race / after). Folded into
   slices as each moment lands; no separate PR unless a gap shows.

## Slice A — pit out (this PR)

Design, mechanism-first:
- `GarageArrival.create().start({ out: true })` plays the existing `poseOut` through the same chrome and SKIP control as
  the pit arrival (`dir = "out"`); no new pose math.
- `setupCam.startPitOut(done)`: runs it at `PIT_OUT_SPEED` (the tuner's speed × 1.6 — a stop must feel short), and calls
  `done()` exactly once when the show ends or is skipped. Nothing is skipped silently: reduced-motion, tuner off and
  automation fall through to `done()` at once (the old behaviour).
- `game.js`: the pit DONE/BACK calls `setupCam.startPitOut(closePitWork)`; the world stays paused (`paused = true`)
  for the whole show, so the player's car cannot move and no control is live (physics contract, `docs/PHYSICS.md`).
  A second DONE tap during the show = skip.
- Evidence: unit test on the pure piece (the show ends, `done` fires once, skip fires it once, fall-throughs fire it
  at once); browser behaviour is left to the CI shard (no local browser).

Not decided (needs Bryce's eyes): the exact speed-up and whether the crew-clearing beat is worth its seconds. Default
shipped is 1.6× and the tuner's own camera; one comment will carry options if CI evidence shows it reads long.

## Slice A2 — every moment configured on its own (Bryce, 2026-11-04 chat: "I want each configurable separately fully and ui fixed")

The GARAGE ENTER & LEAVE tuner had three preview buttons over ONE settings object: the angle, shots, crew,
lighting, timing and the bay camera were shared, and `shotsFor` read PIT STOP and AFTER RACE as the same "in".
Now:
- Store: `garageArrival` keeps its flat fields as the shared base (old saves play unchanged) plus
  `moments.{start,pitIn,pitOut,home}`, each that moment's full settings once edited (`GarageArrival.settingsFor`,
  `saved`). PIT OUT's base speed is 1.6× (`MOMENT_BASE`), replacing the hard-coded rate.
- Every player: race start reads `start`, WORK ON CAR `pitIn`, the release `pitOut`, the way home `home`; a
  preview plays its moment; the bay-camera layer (`garageCamera.moments`, `GarageCameraOptions.forMoment`) too.
- UI: four MOMENT tabs head the tuner (the workspace's always-visible row), every row edits the picked moment,
  rows that mean nothing there hide (`ROW_MOMENTS`), one PREVIEW plays it, COPY TO ALL MOMENTS and a per-moment
  RESET sit in the tools fold. Each moment has its own PLAY ANIMATIONS switch (RACE END's absorbs PLAY AFTER A RACE).

## Slice B — race end, track → garage (#4745 moment 4)

- `RaceCeremony` reveals the results sheet through one hook: when the ceremony reaches `results` (podium done, or its
  beats skipped by the player) and was not harness-seeked, `G.raceEndHome(reveal)` (game.js) opens the bay and plays the
  existing `poseHome` show (`setupCam.startRaceEnd`); the sheet appears when it ends or is skipped (SKIP / Esc / tap). A reset
  mid-show (quit) never resurrects the sheet (`phase === "results"` guard).
- Same gates as before: `garageArrival.moments.home.enabled` / AFTER THE RACE, reduced motion and automation fall
  through to the sheet at once; no pending result note = no show. The note is consumed, so the later garage visit
  does not replay it.
- Bay-local and the race is over: no control exists to move (`docs/PHYSICS.md`). No new module; the code is ~25 lines
  in already-resident files (boot budget).
- Not run: browser evidence (CI shard). Open for Bryce: whether the show should also open the garage MENU after it
  (today it hands straight to the results; GARAGE stays reachable from MENU).

## Slice C — race start, garage → track (#4745 moment 1)

Inventory (read from the tree at 1f3a0e9b):
- `game.js studioOpen` plays `setupCam.startDriveOut` (`GarageArrival.poseOut`, tuner moment `start`) while the circuit
  builds. `studioDone` holds the empty-lane shot until the build is done, then cuts to the opening flyby
  (`FlybySeq.DEFAULT`: wide, landmarks, turns, then the `grid*` shots that end among the front rows).
- The bay is bay-local (metres, car at origin) and never touches `player`/physics; the flyby is broadcast-only, so
  the physics contract holds by construction. Nothing between the bay door and the first flyby shot shows the pit lane
  or the car reaching its grid box: that is the gap.

Options for the missing beat (design-heavy; framing and length are Bryce's call, no browser available to an agent):
1. **Leave as is** (bay show → flyby → grid). Zero risk, no new code.
2. **Pit-exit flyby shot** (recommended): one extra data-only shot at the head of `FlybySeq.DEFAULT` anchored at the pit
   exit (`at: "start"`/`"slot"`), the player's model rolling pit exit → grid box on the existing menu-field mover, ~2 s,
   tap-skippable with the flyby. Lazy, no boot-path code.
3. **Continuous run**: stream the track scene into the bay show so the car drives door → lane → box in one take.
   Highest cost (scene must be built before the show; collides with the build-while-animating design).

Status: awaiting Bryce's pick (`needs-decision`); nothing shipped for this moment yet. Not run: browser evidence.
