# Browser specs batch 04

Mapped 160,000 assigned UTF-8 bytes across 12 text files. `specs-04-evidence.json` records whole-file, assigned-part and bounded-read hashes, every intersecting case and assertion site, imports and hooks. Assertions are static sites; loop-generated cases multiply at runtime. No tests or browser sessions were run.

## `tests/specs/cota-foundation.spec.js`

COTA elevation range 28–36 m, crest at 4–12% lap; terrain/props cannot pierce road; day/night model suppression, overhead clearance, geometry and finite safe barriers.

Assigned [2497, 7281); whole 7281 bytes; 2 intersecting case declarations, 16 assertion sites. Partial file: enclosing declarations may extend outside this assignment.

Cases (source lines; exact byte spans and matcher sites in JSON):

- 22–116: keeps the back-straight crest in place and terrain below the road corridor **partial case**.
- 118–143: emits complete hero, overhead, barrier, and geometry contracts by day and night.

## `tests/specs/css-player-smoke.spec.js`

Trusted pointer hit targets fit a short touch viewport and own centre hit points; two pause/resume cycles release navigation and preserve race state.

Assigned [0, 3695); whole 3695 bytes; 1 intersecting case declarations, 13 assertion sites. Complete file.

Cases (source lines; exact byte spans and matcher sites in JSON):

- 8–77: trusted pointer can reach pause and resume repeatedly.

## `tests/specs/custom-team.spec.js`

Saving paint releases old custom decal and chase/cockpit body variants and builds new resources; independent livery keyboard actions preserve selection and require confirmed deletion.

Assigned [0, 14182); whole 14182 bytes; 3 intersecting case declarations, 16 assertion sites. Complete file.

Cases (source lines; exact byte spans and matcher sites in JSON):

- 58–151: custom-team color save frees and rebuilds its decal texture.
- 153–235: custom-team save frees every cached car-body mesh variant.
- 237–285: custom livery actions are independent keyboard buttons.

## `tests/specs/data-lifecycle.spec.js`

Deferred API races obey newest selection per picker; caching distinguishes recent/historic sessions; refresh coalesces, AUTO waits for settlement; observers/timers retire and native modals keep background inert with focus restoration.

Assigned [0, 22861); whole 22861 bytes; 11 intersecting case declarations, 53 assertion sites. Complete file.

Cases (source lines; exact byte spans and matcher sites in JSON):

- 31–68: superseded schedule responses retire native countdown observers.
- 174–221: meeting session lists refresh recent meetings but retain historic lists.
- 223–243: latest year response owns the meeting options.
- 245–266: latest meeting response owns the session options.
- 268–295: latest telemetry driver response owns the driver chips.
- 297–326: LIVE and TELEMETRY picker requests do not invalidate each other.
- 328–351: LIVE refreshes coalesce and AUTO schedules only after settlement.
- 353–394: closing the hub clears the NEXT GP countdown interval.
- 396–416: deselecting every telemetry driver synchronously restores the empty state.
- 418–476: data hub exposes modal tabs, traps focus, and restores its opener.
- 478–513: telemetry popup is a labelled modal and restores driver focus.

## `tests/specs/debris.spec.js`

Shipped off means no WASM fetch or physics work; explicit opt-in and wall impacts spawn capped debris; seeded episodes agree within 1e-9 on one platform.

Assigned [0, 16113); whole 16113 bytes; 5 intersecting case declarations, 27 assertion sites. Complete file.

Cases (source lines; exact byte spans and matcher sites in JSON):

- 155–189: off by the shipped default: inert, no rapier fetch.
- 198–239: opt in via apex26.debris='1': rapier loads and the side-world runs.
- 241–266: enable + wall hit spawns debris (lastImpact fires, live > 0).
- 268–290: determinism: seeded episodes replay with identical counts + positions.
- 292–309: pool cap respected (mobile-tier value via apex26.debrisCap).

## `tests/specs/dev-tools-dom.spec.js`

finishRace creates visible populated classification in field order; HUD visibility toggles; two screenshots are artifacts, not pixel assertions.

Assigned [0, 3463); whole 3463 bytes; 5 intersecting case declarations, 6 assertion sites. Complete file.

Cases (source lines; exact byte spans and matcher sites in JSON):

- 26–34: finishRace shows the results panel.
- 36–41: results table is populated after finishRace().
- 43–58: uses current field order for results classification.
- 60–66: hud(false) hides the HUD element.
- 68–74: hud(true) restores the HUD element.

## `tests/specs/dev-tools.spec.js`

Public agent API shapes, invalid-input returns and state transitions across catalog, race, camera, freeze/HUD/weather, telemetry, placement, mesh and physics controls.

Assigned [0, 24430); whole 24430 bytes; 54 intersecting case declarations, 121 assertion sites. Complete file.

Cases (source lines; exact byte spans and matcher sites in JSON):

- 43–49: returns array with at least 20 circuits.
- 51–60: each entry has id, name, and sequential index.
- 62–67: bahrain is in the list.
- 73–82: returns at least 10 teams with engine field.
- 84–91: Mercedes team has engine 'Mercedes'.
- 99–105: loads a track by id and returns metadata.
- 107–112: returns false for unknown track id.
- 114–120: race() with wet sets weather.
- 126–131: transitions state to results.
- 133–138: returns false when no race is loaded.
- 145–150: track is null before race loads.
- 152–158: returns track id and total after race starts.
- 160–165: state changes after finishRace().
- 167–172: timeTrial and seasonMode are false in normal race.
- 174–182: tt() sets timeTrial:true.
- 190–197: returns current mode and available modes list.
- 199–203: can switch to cockpit mode.
- 205–210: can switch back to chase mode.
- 212–216: returns false for unknown mode.
- 222–230: returns eye, tgt arrays and fov number.
- 236–244: returns camMode, frozen, weather, state.
- 246–250: frozen is true after park().
- 252–257: dbgCamActive is true after view({}).
- 259–265: dbgCamActive is false after view('chase').
- 273–277: returns current frozen state when called with no args.
- 279–286: freeze(false) unfreezes; freeze(true) refreezes.
- 292–298: returns true when HUD is visible during a race.
- 300–304: hud(false) reports hidden.
- 306–311: hud(true) reports visible again.
- 319–323: returns current weather string with no arg.
- 325–330: setting 'wet' returns 'wet'.
- 332–337: toggling back to dry works.
- 345–355: returns x, angle, k, hw, speed, s after park().
- 357–361: player is near centreline after park(0.1, 0).
- 367–377: returns required fields including lap and wrongWay.
- 379–388: exposes combined-slip traction circle fields.
- 390–404: slipFactor drops when braking hard.
- 410–418: returns player car data when called with no index.
- 420–425: carAt(0) returns first car in cars list.
- 427–431: carAt(999) returns null for out-of-range index.
- 433–437: finished field is false during a live race.
- 443–448: returns array with at least 2 entries.
- 450–454: exactly one car has p: true (the player).
- 462–468: returns array of fractions for Monza.
- 474–482: returns world coords and tangent for fraction 0.5.
- 488–495: returns barrier stats without NaN for Monza.
- 503–513: repositions player car and returns physState.
- 519–524: returns empty object after clearing.
- 532–540: teleports player to the given lap fraction.
- 546–556: 180° aim sets the car pointing backwards.
- 562–567: single distance returns one reading.
- 569–574: array of distances returns one reading per entry.
- 582–589: setPhysics changes a param visible in tuning().
- 591–601: setInput and clearInput work together.

## `tests/specs/drift.spec.js`

Pace-pinned bicycle model remains finite and bounded, loose rear increases slip, steering release aligns, grip limits yaw, and speed steering changes partial-lock response.

Assigned [0, 7973); whole 7973 bytes; 6 intersecting case declarations, 12 assertion sites. Complete file.

Cases (source lines; exact byte spans and matcher sites in JSON):

- 49–61: default car is stable at the limit: full lock washes wide, never spins.
- 63–70: SLIDE loosens the rear: more slip than planted.
- 72–88: slide self-aligns: release the steering and the slip decays.
- 90–110: cornering is grip-limited: yaw rate doesn't run away with speed.
- 112–135: high drift + aggressive steering never NaNs or flies off.
- 137–155: SPEED STEER: higher keeps more turn-in at high speed.

## `tests/specs/elevation-tracks.spec.js`

Hydrated banking audits pivot symmetry/transition grades and real named bowls; chase camera counter-rolls; 40-track slope sweeps and 2 banked tracks retain finite forward drivable motion with explicit assist.

Assigned [0, 24191); whole 24191 bytes; 7 intersecting case declarations, 27 assertion sites. Complete file.

Cases (source lines; exact byte spans and matcher sites in JSON):

- 96–122: banking pivots around the centreline with smooth edge transitions.
- 124–151: Zandvoort banking peaks at Hugenholtz and Arie Luyendyk.
- 153–164: Madrid converts La Monumental's 24 percent bank to degrees.
- 166–183: bank roll matches the road surface slope.
- 185–209: chase camera follows the road bank instead of showing a sideways wall.
- 212–390: ${…}: slope gravity behaves + road-following holds on the grade.
- 394–436: ${…}: banked corner is drivable and stays on the road.

## `tests/specs/engine-audio-offline.spec.js`

Seeded 44.1 kHz mono offline renders at four revs rise in pitch within max(25Hz,8%) of scheduling; screech raises band energy >5% and toggles skid gate.

Assigned [0, 7873); whole 7873 bytes; 1 intersecting case declarations, 9 assertion sites. Complete file.

Cases (source lines; exact byte spans and matcher sites in JSON):

- 29–181: OfflineAudioContext engine pitch tracks rev; screech layer crossfade is audible.

## `tests/specs/f1-track-accuracy.spec.js`

Complete hydrated roster matches pinned reference mappings, direction and normalized shape validator; shared OSM lineage proves pipeline fidelity rather than independent accuracy.

Assigned [0, 8634); whole 8634 bytes; 1 intersecting case declarations, 4 assertion sites. Complete file.

Cases (source lines; exact byte spans and matcher sites in JSON):

- 83–165: every game circuit matches its pinned real-circuit reference.

## `tests/specs/gamepad.spec.js`

Synthetic standard pads exercise driving deadzones/analog pedals, digital ramp, edge latches, menu gating, disconnect/reprobe and focus-loss release; navigation shares keyboard seam.

Assigned [0, 21801); whole 31093 bytes; 18 intersecting case declarations, 55 assertion sites. Partial file: enclosing declarations may extend outside this assignment.

Cases (source lines; exact byte spans and matcher sites in JSON):

- 81–88: an idle pad does not steer and is reported connected.
- 90–108: left-stick deflection steers, with a centre dead zone.
- 110–135: the d-pad ramps to full lock instead of teleporting there.
- 137–148: triggers and face buttons drive throttle / brake.
- 150–176: face/shoulder buttons fire edge-triggered actions exactly once.
- 178–187: on the title overlay the pad routes to menu-nav, never the driving latches.
- 189–211: disconnecting a held driving pad clears controls and reconnects neutrally.
- 213–234: a transient getGamepads() hole recovers WITHOUT a gamepadconnected event.
- 236–267: keyboard driving remains active after using a HUD button.
- 290–299: window blur releases held keyboard, pointer, and touch input.
- 301–327: blur and hidden release remote steering until a fresh sample.
- 329–339: document becoming hidden releases held keyboard, pointer, and touch input.
- 366–374: D-pad down moves focus onto the open menu.
- 376–384: the left stick navigates too, past the steering dead zone.
- 386–394: D-pad left, right and up also seed focus.
- 396–402: the right stick navigates when the left stick is centred.
- 406–415: trigger travel is analog.
- 417–431: A activates the focused control **partial case**.

## Fixtures, targets and limits

Most files use diagnostic fixtures; custom-team, dev-tools and offline audio use the shared worker page. Data lifecycle assembles the manifest data roster in a native dialog with stubbed deferred APIs; debris uses isolated boots and factory-seat pinning; gamepad reloads and resets Input before each case. Custom-team restores monkey patches in afterEach. Offline audio restores Math.random in finally and clears storage/reloads before rendering. Elevation uses default sequential mode, explicit circuit hydration and restores roadFollow in slope probes; banked probes end with assist enabled on their isolated page. Gamepad navigator and visibility substitutions end with the page lifetime.

Production navigation used attached apex-lsp: DebrisWorld.active resolves to physics/debris-world; Input.poll to input/input; Tracks.banking has camera/render/agent/physics callers; GameAudio.initOffline resolves to audio/engine with an explicit text-match limitation. Hook presence and state transitions do not prove visual quality, physical hardware controller behavior, cross-platform Rapier determinism, network service reliability or real speaker output. Track accuracy distinguishes independent pinned traces from shared-source OSM traces.

COTA begins within its first case; its setup/constants are outside this batch. Gamepad ends inside “A activates the focused control”; its later assertions and remaining cases belong to the next batch. JSON includes full enclosing AST boundaries solely for attribution.

## Cleanup findings

- Gamepad navigation commentary still says driving deadzone 0.14; the driving case documents and asserts 0.05.
- Elevation introduction says climbs accelerate; its actual minimum is continued forward motion above half the launch speed.
- Resource probes, local state, shared-page restore hooks and output galleries have explicit ownership; no deletion or runtime changes are proposed from static inspection.
