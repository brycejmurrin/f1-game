# Garage ↔ race transitions — inventory and plan (#4745)

Kind: design · Re-measure-by: 2026-12-11 (re-read the four owners below; line numbers drift, names do not).

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

## Slice A — pit out

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

## Slice A2 — every moment configured on its own (DEFERRED)

Shipped once in #4755 and erased by the 2026-11-06 rollback. It was most of that PR's +508/-330 and blew the eager boot
budget once; with ~6 KB of headroom it does not fit as it was. Re-land as its own PR after measuring the bytes. Until
then PIT OUT and RACE END read the one shared `garageArrival` object, and PIT OUT's pace is `PIT_OUT_SPEED` (1.6×).

## Slice B — race end, track → garage (#4745 moment 4): NOT BUILT, by decision

#4905 played the home show between the podium and the results sheet. Bryce, 2026-11-11 ~08:42Z (relayed by
orchestrator A): "Only when I tap GARAGE": the results follow the podium as today, and the home show plays only when he
then picks GARAGE, ending in the garage menu. That is the shipped `startHome` path (game.js `openSetup(); setupCam.startHome(from)`),
so the re-land drops #4905. Reduced motion skips it (`arrival.start` finishes at once).

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

Decision: Bryce picked **option 2** (`decision: 2`, PR #4908, 2026-11-04 ~22:01Z).

Shipped (option 2):
- `FlybySeq.DEFAULT` opens on a new `pit-exit` shot (7 % of the flyby, ~2 s at the usual length; the other opening
  shots gave up 7 % between them). New anchor `{ at: "pitexit", off, x, y }` = `track.pit.sOut` (the line when a
  circuit has no pit complex). Registered in `AT_KINDS` (flyby-seq, flyby-panel, bake-flyby) and the panel's POSE_FIELDS.
- `rollHero` (shot flag `roll: "pitexit"`) drives the player's MENU model along the pit-lane centre from 30 m before
  the exit line to 28 m past it at 22 m/s; the next shot's `restoreHero()` puts it back on its grid box. Broadcast-only:
  the menu field is scenery, no player physics runs and no control exists (`docs/PHYSICS.md`).
- The flyby is skipped with the existing tap/skip; `shotAt(0)` is now `pit-exit` (test updated).
- Not run: browser evidence (camera framing is an eyes-on call for Bryce; the eye is 34→20 m behind the exit line at
  1.5→1.3 m, fov 44→38, look 6→26 m past it). Tune the numbers in the shot, not the code.

## Re-land, 2026-11-11 (one PR: C, and A without A2)

The 2026-11-06 rollback erased #4755, #4905 and #4908. C and A are re-applied from their PR refs onto e3c7ba8, minus A2
and B (above). Changes from the originals: under reduced motion the pit-exit shot leaves the car on its box (`rollHero` is
gated off; the flyby's camera move itself is unchanged, as before), and PIT OUT reads the shared settings (no `settingsFor`).
The race-start drive-out still plays under reduced motion in calm mode (game.js "never skips it"), and that is
unchanged, by Bryce's call (2026-11-11): an open question, not a change.

GPU objects: C moves an existing menu-field model during the pre-race flyby; A plays in the bay, which is resident
during a stop. None of them builds an object during a lap (perf-idle-pipeline-churn).

## Slice D — pit in, track-side beat (not built)

Options for Bryce (issue comment): 1 none (the bay arrival stays the whole show); 2 a broadcast camera cut at the
pit-entry line while the car runs the lane (camera only, no physics, ~2 s, tap skips); 3 a short approach shot held
in the bay before the back-in (bay-local, uses the existing authored entrance). Pick: 2.
