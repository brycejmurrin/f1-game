# Apex 26 — defect ledger

> Carved out of `ARCHITECTURE-REVIEW.md` §7-8 on 2026-09-03 (tree
> restructure Phase 5). The standing assessment — the founding bet, the physics
> authority, the `G` façade, the renderer seam, the lessons — stays there; this
> file is the register of what is still open and what is queued behind it.
> Everything already fixed is in [`../archive/2026-08-architecture-review-journal.md`](../archive/2026-08-architecture-review-journal.md).

## 7. Open defects

Verified against the current tree. Everything fixed has moved to the archived
journal; this is what remains.

**2026-09-22 (bug hunt) — career & saves: seven defects. FIXED.**
- DURABLE MIRROR lost the one case it exists for: a quota-refused save to an
  EXISTING key left the old value on disk, boot read it, `Career.load()`
  re-saved it, and the flush overwrote the newer mirrored copy. Rows now carry
  `lsOk`; restore prefers a refused (newer) row over the disk copy and drops
  the boot's stale re-save, and the flush waits for the restore
  (`store-cross-tab.test.mjs`, fails on the base).
- Reliability and qualifying luck hashed (seed, round, driver) — no year — so
  every season replayed the same retirements. `Career.seasonSeed()` mixes the
  year in (the 2026 season is unchanged).
- The last MY TEAM sponsor window ran past the finale in ~78 % of seasons and
  could never pay; it is now cut at the finale and asks/pays pro rata.
- `worksCost` and the AI car's factory decal/flap state (and the
  `teamMeshKey` memo) were cached without the regulation era; all are keyed on
  `Parts.legalityKey()` now.
- The hub's CHAMPIONSHIP top 5 ignored countback (now `SeasonCal.rank`);
  `migrateCareer` no longer downgrades a newer save's version; the garage bay
  cache keys include the sponsor pack and the career footer fields; the
  `__apex` garage hooks bust the preview key with the meshes.
- GHOST SHARE: a lap over ~80-90 s overflowed the 14 KiB link, and the
  DOWNLOAD offered instead could be imported nowhere. The link's copy is now
  thinned until it fits (the file keeps every sample), and `decode` accepts
  the file's JSON text (ready for an import control; none added here).

**2026-09-22 (bug hunt) — race flow: five defects, each reproduced in the
game-vm before its fix. FIXED.** (`tests/unit/race-flow-fixes-vm.test.mjs`,
`race-control.test.mjs`, `pit-lane.test.mjs`.)
- RED FLAG kicked the whole field: the red cap holds cars under the
  stuck-rescue gates, so every AI was "rescued" 1.2 → 11.8 m/s each
  aiRescueDelay and a player on the throttle was teleported (41 kicks, 3
  rescues in one 14 s procedure, re-ordering the restart grid by prog). The
  low-speed clauses now stand down while `raceCtl.level >= 4`.
- FINISHERS stopped dead ~v²/40 m past the line on one shared line:
  `coast()` held its floor for ONE step, then scrubbed to 0, and the next car
  home rear-ended it at 14-29 m/s. The floor now holds (`_coastHeld`), and
  two finished cars are never a collision pair.
- After a red-flag restart the 45 s re-arm hold masked EVERY caution level,
  all of it on green running (the countdown never ticks it). game.js clears
  the surface on the tick it takes the restart, so it now calls
  `raceCtl.clearHold()` there.
- `IncidentSim._lapCross` missed the chequered flag for a lapped car and had
  no backward branch (a car thrown back over the line gained a lap). Found
  here, but fixed on the deploy branch first (PR #215,
  `RaceControl.lineTransition`); this batch takes that fix.
- The only human RETIRING ended the race 2.2 s later (by design) but scored
  AI whose failure was already drawn from the mid-race snapshot; those
  retire now. Plus: camera `shake`/`hitStop` reset per race, the pit-exit
  MERGE cue uses the wrapped track gap (it never named a lapping leader), and
  per-AI-per-tick `cautionInfo()` objects / an unused `Tracks.sample` are gone.

**2026-09-22 (bug hunt) — prop guards paid the pit keep-out everywhere.
FIXED (perf).** `onRoadHit` / `onTrack` widened every query by `pitMax`
(~30 m), which only exists in the pit window, and were the top self-time of a
track build. The wide radius now applies only when the query circle (+ a
node-grid cell diagonal, 15 m) reaches the pit nodes' bounding box; nowhere
else can a pit node be a candidate. Measured: all 52 circuits byte-identical
(every mesh/instance buffer, diagnostics, superseded record, props counts),
props phase 36.3 s → 30.1 s summed over the fleet.

**2026-09-22 (bug hunt, 12 hunters + 8 validators) — `window.X` guards on a
top-level `const` are always false in a browser. FIXED.** A classic script's
top-level `const BrakeCue = …` is a global LEXICAL binding, not a window
property, so every `window.BrakeCue` / `window.GameAudio` / `window.Input`
guard (14 sites: steer-tuning, brake-cue, select-screen, key-binds,
race-settings) was false for every player. Dead in production: the pause
menu's BRAKE CUE slider (`BrakeCue.create` never ran — its label still read
"CUE n"), the menu select/tick sounds, `primeHaptics` at the start, and the
HAPTICS row's hide on devices without haptics. Every node test saw the
opposite because `tools/lib/game-vm.cjs` rewrites `^const` → `var`. Fixed
with `typeof X !== "undefined"`; `tests/unit/lexical-window-guard.test.mjs`
(in `test:guards`) now fails any `window|globalThis|self.Name` read of a
lexical global nothing assigns onto window. PRODUCT DECISION taken with it:
the brake cue's never-touched default is now notch 1 (OFF) — shipping the
fix at the old notch-4 default would have switched the cue on for everyone
and silenced the driving-line cue it outranks. Saved values and the
RELAX/STANDARD/PRO presets are unchanged.

**2026-09-22 — a baked BUILDING was stamped across monza's racing line, because
`bakedModel()` was the one prop emitter with no road guard. FIXED.**
`props-over-road.spec.js` reported `monza PROP 0.75m over road (cap 0.2)` at
frac 0.115: a flat 2.22 x 0.20 m face at y 0.70 over a road at y -0.05, lateral
-4.78, colour `[0.25,0.25,0.29]`. Reproduce the old failure in 22 s with
`TRACK=monza npm test -- tests/specs/props-over-road.spec.js`; it passes now.

**What it was.** `assets/pack/models/kenney_ind_building-d.bin`, a
10 x 18 x 15 m industrial building. `js/circuits/scenery/monza.js`'s `yards`
table places it at `["kenney_ind_building-d", 0.012, -1, 60]` — 60 m off node
17, which `_sceneryShift` resolves to node 142, the exit of the Variante del
Rettifilo. **The track turns about 90 degrees there**, so 60 m "outward" from
node 142 lands back ON the road at node ~165, two corners along. The building
is also sunk 2.1 m (its anchor takes the terrain height 60 m out), which is why
only one window band of it broke the surface. The colour is not a source
constant at all: `0.255,0.255,0.286` is baked into the model's vertex colours,
which is why grepping `js/` for it found nothing.

**Why nothing stopped it.** `addBox`, `addCyl`, `addCone`, `addFrustum`,
`addPrism` and `addPyramid` all go through `GUARDED` in `js/track/tracks.js`,
which rejects a primitive whose footprint is on the tarmac. `addMesh` was not
in that set and `bakedModel()` called it raw, so the one emitter that stamps
whole buildings was the one with no guard. Fixed by giving it the same
`rejBox` test, on the mesh's own extent scaled and yawed exactly as `addMesh`
transforms its vertices. Callers write `if (!bakedModel(...)) building(...)`
and that fallback is itself guarded, so a rejected stamp degrades to nothing.

**Why no test caught it, which is the more general defect.** Two independent
reasons, and both still hold for everything except monza:

1. `props-over-road.spec.js` declares `test.setTimeout(1500000)`, over the
   change-aware gate's 180 s per-test cap, so `select-specs.mjs` excludes it on
   every `js/track` and `js/circuits` diff. Its only schedule is the nightly
   rota, one night in eleven. It surfaced by accident, when an unrelated edit
   to the file made the selector rank it 0 and give it a shard of its own.
2. **Every node audit is blind to the whole asset pack.**
   `js/render/shared/assets.js` is in the manifest's `FULL` list and not in
   `TRACK_VM`, so `Assets` is undefined inside `tools/lib/track-build-vm.cjs`
   and `bakedModel()` returns false at its first line. All 36 baked models are
   invisible to `prop-clipping`, `scenery-grounding`, `coplanar-faces`,
   `road-under-floor` and `props-over-road.test.mjs` alike. OPEN: teaching the
   harness to supply `Assets` would close it, and
   `tests/unit/baked-model-road-guard.test.mjs` shows the shape — it carries
   its own pack loader because the harness has none.

**Measured with the pack made visible**: 15 of 52 circuits read over the
tolerance without the guard, 14 with it. Monza is the one the guard fixes. The
other 14 are the overhang class — a model anchored legally off-track whose
upper parts reach over it, which a footprint test cannot reject and this guard
does not claim to. Eight of those 14 (donington, istanbul, jerez, korea,
nurburgring, sepang, suzuka, vegas) are only visible at all once the pack is
loaded, and none of them is baselined anywhere. OPEN.

**2026-09-22 — the ~1.07 m reading on four circuits IS the pit wall's top cap,
and the specs sample past the tarmac to reach it. IDENTIFIED; the sampling is
OPEN.** jeddah, mosport, zandvoort and singapore all read 1.07 m over the road.
`js/track/scenery/pits.js:300` and `:319` sweep the pit wall's cap with the
profile `[[-0.07,1.0],[0.32,1.0],[0.32,1.07],[-0.07,1.07]]` in `WALL_TOP`
`[0.46,0.47,0.50]` — a 0.39 x 0.07 m section topping out at exactly 1.07. The
offending piece measures 1.91 x 0.09 x 3.84 m at y 1.03-1.12 in that colour, so
the identification is the geometry's own, not an inference.

**Two retractions, in order, because both were published.** The first
identification said "the pit wall", which was right. I then retracted it on the
grounds that the wall's inner edge stands 8.2-13.0 m out while the specs sample
at 6.15-6.9 m — but that measured `track.hw + pit.off.fastIn`, the FAST LANE's
inner edge at the garage row. This cap is the ENTRY/EXIT wall, whose lateral is
`hw + profile[0] + shift(k)` and which runs right at the tarmac edge: on
zandvoort it sits at 6.81 m against a 7.0 m half-width. So the retraction was
wrong and the original name was right. The lesson is the one the first mistake
should have taught: measure the object, not something that shares its colour.

**The real defect underneath is the sampling.** Both `props-over-road.spec.js`
and the foundation specs scale their lateral ladder by a half-width derived
from the ROAD MESH, which runs 1.2-1.3x the engine's `track.hw` because the
mesh carries verge and run-off out to 13 m. Their outermost sample lands OFF
the racing surface by construction, on whatever boundary structure lives there
— here, the pit wall a car is meant to stay inside. Baselined at 1.1 in
`props-over-road.spec.js` (jeddah, mosport, zandvoort, singapore),
`props-over-road.test.mjs` and `zandvoort-foundation.spec.js`, all citing each
other. Scaling by `track.hw` instead would let every one of those baselines go
back to `TOL`, and is the fix worth making. OPEN.

**And it is why no primitive covers the geometry.** `sweep()` in `pits.js` is a
local extrusion that builds its quads directly rather than through a
`TrackGeom` emitter, so `tools/lib/track-build-vm.cjs`'s wrappers record
nothing for it. Measured on zandvoort: 9,456 of 639,333 prop vertices (1.5 %)
belong to no captured primitive even after `shipped()`'s remap, in 9 gaps, and
the largest — 9,392 vertices, 1,174 eight-vertex pieces — is this sweep. No
audit that reasons about primitives can attribute any of it. OPEN, and the same
class as the asset-pack blindness above.
**2026-09-22 (wave 4/5) — `DIFF[difficulty]` had three siblings, and a garage
FILE could reach two of them. FIXED.** The 2026-09-22 crash was a persisted
string used as a table key with nothing validating it. Hunting the SHAPE rather
than the symptom found the rest of the family:

- **`idxOr`, js/game.js.** `x >= 0 && x < len` is not an index check, and this
  file carried it in BOTH spellings — each leaking the opposite way. `"abc"`
  fails `< 0 || >= len`, so the NEGATED form at boot passed it through; `""`
  passes `>= 0 && < len`, so the POSITIVE form in `restoreFreePlaySelection()`
  passed that. Either way `Teams.LIST[…]` is undefined and the first `team.id`
  read (js/garage/setup-sheet.js, js/car/car-draw.js) throws. The second site
  was found BY THE TEST: its first draft anchored on the shared substring and
  matched the wrong line. Five hand-rolled clamps are now one helper, and the
  guard asserts no sixth is written by hand.
- **`loadCustomTeam`, js/career/custom-team.js.** `syncCustomTeam()` pushed
  whatever sat under `apex26.customTeam` straight into `Teams.LIST`, and
  `SaveMigrate.seasonRoster()` does `team.drivers.forEach(...)` over that list
  at BOOT — so `{}` was a TypeError before the menu painted, on every start.
  The `id` half is quieter and just as real: the splice that removes the
  previous custom entry matches on `"custom"`, so a renamed team would have
  every sync push ANOTHER car onto the grid. Now repaired, not discarded — a
  bad roster is not a reason to lose the player's livery.
- **`garageValue`, js/ui/settings-export.js.** The liveries have been
  shape-checked since the file was written, under a header saying a file is
  player input and the garage does not defend itself. The four SINGLES —
  `team`, `driver`, `customTeam`, `customLogo` — fell through to a bare
  `return v`. That is the door the two above come in through: the feature's own
  LOAD GARAGE FILE button. Now shape-checked per key, and the trailing
  `return v` is a `return undefined` (default deny).

**The suite's own idea of a sound file contained the defect.** Three fixtures in
`settings-export.test.mjs` used `customTeam: { name: "X" }` — no `drivers` — and
one of them asserted it applied cleanly. That is most of why this survived: the
round-trip test was pinning the crashing shape as correct. The same file already
carried the lesson for liveries ("a fixture of bare numbers would round-trip to
[] and prove nothing about the round trip") and it had not been carried across.

**2026-09-22 — one trapped rapier step turned debris off for the whole SESSION.
FIXED.** `DebrisWorld._active` is the single boolean game.js reads to decide
whether debris, marbles, incident takeovers and the caution they feed exist at
all. `step()`'s catch lowers it and tears the world down — right for that race.
But `setEnabled()` was the only other writer and game.js never calls it: the
only ways back were `__apex.debris(true)` or the player flipping the DEBRIS
setting off and on. `reset()` — which exists precisely so nothing carries into
the next race, and which every restart path calls — never touched the latch. So
a single transient WASM fault took the surface down silently through every
restart and every new race until the tab was reloaded. `reset()` now recomputes
the same expression `setEnabled()` does, so DEBRIS OFF stays off and a load that
genuinely failed stays down.

**2026-09-22 — the fastest way onto the TIME TRIAL board was to leave the
circuit. FIXED.** The crossing gates `c.best`, the TT board, `G.ttRecord` and the
stored ghost on one latch, `incidentInvalidLap`, set by IncidentSim, the
red-flag restart and the coach. Track limits were not on it — they had a ladder
of their own: three warnings, then +5 s. That ladder prices a cut against the
race CLASSIFICATION, and a time trial has no classification, so in TT nothing
priced a cut at all. Measured in the VM harness: a lap driven off-track replaced
a 42.15 s record with 5 s and took the stored ghost with it. A counted cut
(game.js's own 1.2 s threshold, past the grace) now invalidates the lap in TIME
TRIAL only, and the warning line reads LAP INVALIDATED there instead of the
race ladder's n/4.

RECORDED, NOT FIXED, from the same hunt:

- **Race-mode `c.best` and the fastest-lap point still count a cut lap.** Real
  F1 invalidates for track limits; this game prices them at +5 s instead, which
  is a designed ladder and a balance decision, not an oversight. Changing it
  moves classification and the career `clean` objective, so it wants a driven
  lap and an owner, not a rider on a bug-fix batch.
- **A pit-lane lap can set the fastest lap. REJECTED as a defect** — F1 counts
  in-laps and out-laps for the fastest lap, and the pit lane is longer and
  speed-limited, so it is not an exploit route.
- **In a time trial the +5 s ladder still runs** alongside the invalidation
  above, announcing a penalty in a mode with nothing to apply it to.
- **Points and the fastest-lap bonus reach cars that never finished.**
  `js/career/season-cal.js` excludes only `c.retired`, not `!c.finished`, and
  `order` carries cars still running when the hard time cap ends a race
  (`raceT > 360 * lapsTarget`). Rare, and reachable only through that cap.

**2026-09-22 — three CONTROLLER buttons welded into one slab, and the guard
that could not see it. FIXED.** `.pm-pad-tools` was applied in `index.html` from
the day it shipped and defined in no stylesheet. With `.pm-group button
{ margin: 0; width: 100% }` above it, CALIBRATE STICK / SET UP A WHEEL / RESET
CONTROLLER measured 0.0 px apart at 844x390 where every other row in the panel
had 4. The class now rides the `.pm-group` rules themselves rather than
restating the numbers, so both densities stay in step.

**The reason nothing caught it is the finding.**
`tests/unit/component-inventory.test.mjs` guards DEFINED-but-unapplied — a rule
in `css/` that nothing wears, which costs bytes and nothing else. The mirror
direction was unguarded, and it is the expensive one: an element wearing a name
no rule matches READS as styled. `tools/check/class-usage.mjs` now sweeps it,
reading all four ways this tree applies a class (`class=`, `className`,
`classList`, and `Dom.el(tag, cls)` — the busiest by far; a scan without it sees
a third of the app) and skipping anything interpolated or concatenated rather
than guessing at a half-name. It asserts an EXPLAINED set, not an empty one:
17 names, of which 3 are queried by JS or by a spec locator and 14 carry their
reason in `KNOWN` beside the selector that does the real work.

**2026-09-22 — `hud-onboard`: a body class toggled on every camera switch that
nothing had read for eighteen days. FIXED (deleted).** It shipped 2026-09-04
with a rule stripping the minimap and the gap strip in any onboard view; the
SAME DAY, the per-widget MAP/GAPS settings replaced that rule and the write was
left behind. Its only guard was `assert.match(src, /hud-onboard/)` — a test that
the string is still typed, which passes forever over a toggle nobody reads. That
assertion is now the relation instead: every body class `js/ui/hud.js` toggles
must be one some stylesheet keys a rule on, with `hud-met-full` the single
exemption (AUTO is defined as the layout that hides nothing, so a rule for it
would be the bug).

**The design question it raised is answered NO.** `ONBOARD_IDS` groups cockpit,
hood and tcam but only cockpit gets the `cockpit-cam` declutter, which looked
like two cameras missing treatment. They are not: `js/game.js` gates the entire
wheel/halo/mirror RIG on `id === "cockpit"`, and `js/car/car-draw.js`'s
`drawCockpitRig` draws an in-world duplicate of every readout `cockpit-cam`
hides — gear, shift lights, speed, ERS, overtake, aero. The declutter exists
because cockpit renders those twice, not because onboard views should look
sparse. Hood and tcam have no duplicate, so hiding them there would delete
information with nothing replacing it. `ONBOARD_IDS` itself stays: it is live
for the MAP-AUTO default.

**2026-09-22 — the Display sub-panels are NOT missing a margin. REJECTED.** The
earlier entry below reads `pm-hud-sub`/`pm-renderer-sub` having no CSS as
Display sitting flush where Music & Sound does not. Measured the other way
round: `.pm-group` is a flex column with `gap: 6px` (4 compact) and the Display
folds carry `margin: 0` deliberately to sit in it, while `.as-sec` adds a margin
ON TOP of the same gap — so Sound is the outlier, not Display. Those class names
are family markers whose rules are ID-scoped on purpose ("so the class ratchet
does not move", css/components.css), and one is pinned by
`ui-improve-pass.test.mjs`. All four now carry that reason in `class-usage.mjs`'s
`KNOWN` rather than sitting unexplained.

**2026-09-22 — a `try`/`catch` cannot swallow a promise REJECTION, and this
shell turns one into a full-screen overlay. FIXED at four sites.** `index.html`
installs an `unhandledrejection` listener that paints `#__err_overlay` over the
running game. Its `error` sibling already carries a benign-noise exemption
(ResizeObserver); the rejection handler carries none. Four sites wrapped a
promise-returning Web API in `try`/`catch` with a comment naming the exact
failure they meant to absorb — and every one of those failures is spec'd as a
REJECTION, so the catch was inert and the overlay was not:

| site | API | when it rejects |
|---|---|---|
| `js/input/input.js` `rumble()` | `GamepadHapticActuator.playEffect` | `InvalidStateError` whenever `document.visibilityState === "hidden"` ([Gamepad spec](https://w3c.github.io/gamepad/#dom-gamepadhapticactuator-playeffect)) |
| `js/audio/engine.js` `rebuildCtx()` | `AudioContext.close` | `InvalidStateError` on an already-closed context ([Web Audio spec](https://webaudio.github.io/web-audio-api/#dom-audiocontext-close); Chrome rejects, Firefox resolves) |
| `js/audio/engine.js` hide path | `AudioContext.suspend` | same, on an already-closed context |
| `js/audio/spotify.js` `BACKEND.start/stop` | SDK `resume`/`pause` | undocumented; guarded defensively |

The `playEffect` one is the one that fires in ordinary play, and it is the
worst kind: `rumble()` runs on every collision, kerb and gear shift, so a
player who alt-tabs or whose phone locks while a rumble is in flight gets the
overlay over a live race. The AudioContext pair is next, because `rebuildCtx()`
is reached ONLY after a resume has already failed — i.e. with the context in
exactly the state `close()` refuses. The same file's three `ctx.resume()` calls
have always chained `.catch`, which is what makes these an omission rather than
a policy.

Fix: keep the `try`/`catch` (a bad receiver still throws synchronously) and add
the rejection arm — `const p = x.foo(); if (p && p.catch) p.catch(() => {});`.
Pinned by `tools/check/reject-lint.mjs` (a ZERO ratchet, not a frozen
population) and `tests/unit/reject-lint.test.mjs`. The lint names only APIs
whose promise-return is unambiguous, and disambiguates `close`/`play`/`pause`/
`resume` by receiver, because a rule that cried wolf at thirty WebSocket and
IndexedDB teardowns would be switched off inside a week.

**2026-09-22 — a Begin with no `finally` latched the whole game into a 64-pixel
cubemap. FIXED, with three more of its class.** `js/game.js`'s env-probe block
called `gfx.envFaceBegin`, drew the world, and called `gfx.envFaceEnd` — with
no `try`/`finally`. `envFaceBegin` raises GLX's `_envActive`, and `begin()`
branches on it EVERY frame to choose between the real scene target and the 64²
probe FBO; `envFaceEnd` is its only lowering, and `envProbeReset()` does not
touch it. So a throw out of `drawWorldMeshes` or `drawSky` left the latch up
for the life of the tab: the entire game rendered into a 64-pixel cubemap face
while the visible canvas held its last good frame. `tick()`'s `LoopHealth`
absorbs the transient fault and keeps going, so physics, AI and audio carried
on underneath — the exact shape of an "it just froze mid-race" report with
nothing in the console.

Three siblings fixed with it, all the same class and all found by asking the
same question of every bracket in the renderer:

- `js/render/glx/glx.js` `present` — post.js disables `DEPTH_TEST` for the
  fullscreen chain and re-enables it ~400 lines later, and nothing else
  re-asserts that flag per frame (`begin()`/`resetDrawState()` only re-sync
  `CULL_FACE`, `colorMask`, `polygonOffset`). A throw in between left depth
  testing off for the rest of the tab, so every opaque draw composited in
  submission order. Restored on the FAULT path only, so the happy path pays
  nothing.
- `js/render/glx/shadow.js` `shadowBegin` — a leftover `castCullVP` from the
  car (±42 m) or lamp (cone) pass culls every prop, tree and barrier out of the
  SUN's snap-cached map, because `chunked.js` and `gfx.shadowCullVP` both
  resolve `castCullVP || lightVP`. The car/lamp Ends clear it on the normal
  path and on their early returns; what they cannot cover is a throw between
  Begin and End. Cleared where the sun pass declares its own frustum, which
  makes it ordering-independent.

**2026-09-22 — a stop in flight survived a red flag and held the player at the
pit limiter through the restart. FIXED.** `redFlagRestart()` enumerates the
racecraft scratch a re-grid must not carry (`contactT`, `wrongWay`, `offT`,
`wallT`, `otT`, …) and deliberately keeps what is strategy — energy, tyreClass,
phaseRoll. The pit fields were in neither list, and they are both:
`pitStops`/`pitNext`/`pitPlan` are strategy and must survive, while
`pitState`/`pitArmed`/`pitCommitted` are an in-progress stop and must not.

The restart teleports every car onto a grid box, and on most circuits the grid
sits INSIDE the pit window — so a car holding the lane when the flag flew came
out of the standing start still reading `pits.inLane()`. game.js's `vmax`
branch held it at the pit limiter and `laneDrive` steered it onto the lane
offset. Measured on Monza before the fix: full throttle from lights-out and the
car could not pass ~20 m/s for ~750 physics ticks — about twelve seconds —
because `update()`'s "left the window" branch is the only other thing that
clears the arm, and by construction it cannot fire from inside the window. For
an AI car the same latch overrode its strategy: it circulated at pit-lane pace
and then made an unplanned stop the next time it passed the window.

Fix: a new `pits.clearArm(c)` — the in-progress half of `reset()` and nothing
else — called from `redFlagRestart()`'s per-car loop. Pinned by
`tests/unit/red-flag-pit-vm.test.mjs`, which fails on the old code in both
directions (the fields, and the speed after the restart).

**2026-09-22 — a red flag raised after any car had finished froze the field
every 45 s for the rest of the race. FIXED.** The red procedure ends in exactly
one restart request, and `raceCtl.takeRestart()` consumes it whether or not
`redFlagRestart()` runs. `redFlagRestart()` declines outright once any car has
finished — which is ordinary, not exotic: the leader takes the flag while a
mid-pack incident is still unfolding. The clean-up (`IncidentSim.reset`,
`DebrisWorld.reset`, `DebrisWorld.prime`) lived only INSIDE the re-grid, so
that combination held the whole field at `vmax * 0.02` for `RED_STOP +
RED_HOLD`, dropped silently back to green with the debris still on track, and —
since `finished` never goes back to false — let the same uncleared picture
raise the same dead red every `CAP_REARM_HOLD` for the rest of the race. Fix:
the declined path now runs the clean-up, which ends the cycle at its cause.

**2026-09-22 — a failed race start left the pre-race screen running forever.
FIXED.** The already-recorded "`startRace()` rejection left a half-torn screen"
fix routes a throw to `quitToMenu()`. `LoadingScreen.stop()` has exactly one
call site in the tree — `clearMenuScreens()`, which `startRaceBody()` reaches
near the END of its work — so a throw before that (the awaited
`ensureScenery`) never stopped the flyby. It stayed `active()` for the session:
its `window` pointerdown/keydown capture listeners were never removed, and both
`menuBlank` and the per-car draw-loop break gate on `!loadingScreen.active()`,
so the title screen went back to paying for all 22 parked cars — the cost a
comment in `render()` says was already fixed once by another route. Fix:
`quitToMenu()` stops it too; `stop()` is idempotent.

**2026-09-22 — Dijon lost a grandstand livery, because a typo in def data is
silent. FIXED. The same class in `furniture.tree` is OPEN, and the attempt to
fix it is the more useful record.** The def files are data and the engine looks
their strings up in tables; every lookup has a sensible fallback, so a word the
engine does not know never throws, never logs, and passes `verify-track`.

Dijon's `standSet: ["stone", …]` is not a `STAND_LIVERIES` key, so
`grandstandEx`'s `lib[name] || null` fell through to its default shell — which
is bit-identical to `"steel"`, making an authored three-way livery rotation a
two-way one with double-weight grey. Fixed to `"sandstone"`; a livery is colour
only, so it moves no geometry.

`furniture.tree: "pine"` (anderstorp, fuji, mont_tremblant, okayama, zolder) is
in neither `SPECIES` nor the two aliases beside it, so the dispatch falls
through to `"broad"` and five conifer-belt circuits — Sweden, Japan ×2, Québec,
the Ardennes — grow rounded broadleaf trees on the generic scatter pass. The
correct species is `"fir"`, which the other Nordic and Alpine circuits use.

**IT WAS CHANGED TO `"fir"`, AND REVERTED, AND THE REASON IS WORTH MORE THAN THE
FIX WOULD HAVE BEEN.** `canopyR` (`js/track/scenery/nature.js`) returns roughly
HALF the radius for `fir` that it does for `broad` — ~3.6 m vs ~6.6 m at h = 12
— and the scatter keeps props clear by `dist + crown`. So correcting the species
also halved the keep-out, and CI's per-circuit geometry sweep measured prop
interpenetration growing on every one of the five:

```
anderstorp 31 → 34    fuji 24 → 26    okayama 58 → 59
mont_tremblant 32 → 48                zolder 82 → 105
```

Registering `"pine"` in `SPECIES` instead is strictly worse: the emitter
dispatch has no pine branch, so it would keep the broadleaf mesh and take the
smaller clearance with it. The real fix is to check `canopyR("fir")` against
`conifer()`'s actual mesh extent — the comment directly above `canopyR` records
that same "GUARANTEED not to clip barriers" contract being found "~0.9 m
optimistic" once before, for broadleaf — and that is its own change with its own
sweep. Parked in `tests/unit/circuit-vocab.test.mjs`'s `KNOWN_UNHANDLED` with
these numbers attached, so the guard still fails on a NEW typo and this one
cannot be quietly forgotten.

**The process lesson is the durable half.** `deploy.mjs --gate-only` passed this
batch 21 suites green, and the regression was caught only by CI's per-circuit
geometry sweeps — the 14 files `PREPUSH-GATE-LADDER.md` says the whole gate
leaves out. A def edit that changes a SPECIES changes geometry, so it belongs
behind `npm run test:sweeps` locally before a push, not behind the gate.

**2026-09-22 — `world({since})` could not say a key had gone away. FIXED.**
`js/agent/agentview.js`'s `deltaOf` walks `Object.keys(next)`, so a field the
delta base carried and the new payload does not is never mentioned, and
`applyDelta` merges — the reconstruction keeps the stale value forever. The
reachable case is the one `agentHelp()` recommends: one `world({detail:"full"})`
to learn session/physics/tunables/terminal, then ride
`world({detail:"brief", since})` for the rest of the episode. Nothing requires
the detail level to match across a `since` chain, so `terminal.done` and
friends stayed pinned at whatever the full read said. Fix: a shrinking payload
takes the escape hatch this API already documents — the whole payload with
`deltaBase: null` and a note — rather than inventing a tombstone the wire
format has no room for. Pinned in `tests/unit/agent-view-vm.test.mjs` (both
that a shrink resyncs and that an ordinary same-detail chain is still a delta).

**2026-09-22 — three smaller ones, fixed with the batch.**
`js/render/three/tsl-lit.js`'s car and lamp PCF taps were hardcoded to the
DESKTOP map size (`1/1024`, `1.5/512`) while `tlx-shadow.js` shrinks both maps
to 256² under software GL and — unlike the mobile path, which nulls them —
keeps the feature ENABLED, so the filter collapsed to a fraction of a texel and
both shadows went hard and aliased while the sun's, which has always derived
`U.shadowTexel` from `SHD.sunSize`, stayed soft. `js/camera/photo-cam.js` had
no `window "blur"` release, so an alt-tab while holding W or the move stick
left the free camera flying (js/input/input.js wires exactly that listener for
exactly this reason). `js/career/career.js`'s `prizeFor(0)` returned
`PRIZE[-1]`, i.e. `undefined`, which would make `career.money` NaN for the rest
of a save — defensive, no caller reaches it today.

**2026-09-22 — the TELEMETRY tab coloured its compare delta backwards. FIXED.**
`js/data/telemetry.js` computes the compare gauge's delta and the lane board's
with the same expression and comments both the same way:

```js
const delta = timeAtDist(view.compare.cum, dP) - t;   // >0: compare is behind
const dl    = timeAtDist(lane.cum, dRef)     - t;     // >0: this lane is behind the ref
```

so `dh-pos` is the SLOWER side on each. `css/data.css` had
`.dh-laneboard-dl.dh-pos -> --slower` (right, and commented "behind the
reference") and `.dh-gdelta.dh-pos -> --faster` (inverted), fifty lines apart —
so comparing two drivers painted the TRAILING one green and the leader red.

**Neither half is wrong alone**, which is the whole reason it survived: the JS
sign is right, the CSS is valid, and each rule is individually plausible. Only
the PAIRING is wrong. A screenshot would not have caught it either — a green
number and a red number both look like a working widget unless you already know
which car is ahead. So `tests/unit/delta-sign-colour.test.mjs` asserts the
INVARIANT rather than the values: every delta class keyed on the ">0 = behind"
convention must resolve `.dh-pos` to the same token, and it first checks that
the source really does still use one convention, so the assertion cannot quietly
start measuring nothing. It fails 2 of 3 on the old CSS.

**2026-09-22 — four small UI/data findings, RECORDED not fixed.** Each is real
and each is cosmetic or inert; none is worth a rider on a bug-fix batch, and a
UI session with a browser should take them together:

- `js/ui/hud.js:123` toggles `hud-onboard` on `document.body` on every camera
  switch and **nothing reads it** — no CSS rule, no other JS (found independently
  by two agents). The interesting half is why it exists: `ONBOARD_IDS` groups
  `cockpit`, `hood` and `tcam`, but only `cockpit` gets HUD decluttering, via the
  separate and narrower `cockpit-cam` class (`css/track-detail.css`). So the dead
  toggle is a hint that HOOD and T-CAM are missing treatment COCKPIT has —
  a design question, not a deletion.
- `index.html:746,850,907` — Settings > Display's three collapsible sub-panels
  carry `pm-hud-sub` / `pm-renderer-sub`, which have zero CSS anywhere. The
  identical construct on the Music & Sound page uses `as-sec`, which
  `css/tuner.css` gives a bottom margin, so the Display sections sit flush where
  Sound's do not.
- `js/data/live.js:312`, `js/data/telemetry.js:940,950` — `dh-class-rows`,
  `dh-gdrscell`, `dh-gdeltacell` are applied and have no rules. Silent today
  because their compound siblings carry the layout; `dh-gdrs2` DOES have a
  modifier rule, which suggests these were meant to parallel it.
- `index.html:399-400` — `#hud-gap-ahead`/`#hud-gap-behind` carry `hud-gap`
  (singular), which nothing targets; all styling comes from `.hud-gaps > div`.
  Harmless, but a naming trap: removing the class does nothing, and a future
  `.hud-gap` rule would hit both children with no way to target one.

The mechanical sweep behind these is worth repeating rather than the list:
534 classes defined across `css/*.css` against 488 referenced from `index.html`
and `js/**`, with the **applied-but-undefined direction unguarded** —
`tests/unit/component-inventory.test.mjs` only checks the opposite one. 28
`!important` uses were each checked and none fights a token; the 11 same-selector
cross-file differences all sit in disjoint `@media (orientation:…)` blocks, i.e.
the deliberate per-viewport re-tuning `COMPONENTS.md` documents.

**2026-09-22 — `DIFF[difficulty]` undefined took every physics tick down. FIXED.**
`js/game.js` `updateCar()` read `DIFF[difficulty]` unguarded and dereferenced
`dd.ai` on the first AI car; `js/race/quali-model.js` already fell back to
`DIFF.normal`. The store held whatever string an imported settings file
carried — `js/ui/settings-export.js` `typeOk()` only compares `typeof`, so
`"difficulty": "medium"` passed and the next race threw a `TypeError` per
tick, human car included (the main loop has no try/catch around `updateCar`).
Fix: the game.js read falls back to `DIFF.normal`, and the SPEC row carries
`oneOf: ["easy", "normal", "hard"]`, which `applySettings` enforces (skipped,
not written). Pinned by `tests/unit/settings-export.test.mjs` (the allowlist
equals `Object.keys(PhysicsConsts.DIFF)`).

**2026-09-22 — the AI braked on slicks in the rain. FIXED.** Player braking
carries `gripMult(c) / gripMult()` (the tread's credit over a slick,
`docs/PHYSICS.md` §Braking) in both the speed step and `axEstTarget`; the AI
arm of the same expression did not, and its planner's `_aiBr.brake` never did.
An AI car's `tread: null` resolves to the right compound for CORNERING, so in
the rain the field cornered on wets and stopped on slicks, and a player on full
wets out-braked it by the whole ratio (~27 % at full wet). Fix: the ratio
applies to every car in both sites; it is exactly 1 in the dry, so dry pace is
untouched by construction (`ai-race.mjs pace --diff normal` identical
before/after).

**2026-09-22 — the ratchet-vs-base CI step was a no-op on deploy-branch
pushes. FIXED.** `ci.yml`'s "Ratchet ceilings vs the base" diffed against
`origin/claude/f1-game-project-26h3ng` on every non-PR event; on a push TO that
branch the remote ref already is the pushed tip, so every ceiling compared with
itself (zero rows, every run since PR #170). Fix: the push's `github.event.before`
on the deploy branch, with a `git cat-file` fallback to the remote ref when the
clone cannot show it (force-push, first push).

**2026-09-22 — a `startRace()` rejection left a half-torn screen. FIXED.**
`startRaceBody()` does its DOM/state work after `await ensureScenery`; the six
fire-and-forget callers (the un-awaited family below) never look at the
promise, so a throw there — e.g. `closeQualiToGrid` had already closed the
quali sheet and set `session = "race"` — left no HUD and no race under the
`unhandledrejection` overlay, and dismissing the overlay restored nothing. Fix:
the wrapper's `.catch` logs, calls `quitToMenu()` and rethrows, so awaited
callers still see the failure while the screen is the menu. Pinned by
`tests/unit/start-race-latch.test.mjs` (a stubbed `Tracks.build` throw →
rejection, `info().state === "menu"`, latch released).

**2026-09-22 — not a defect, recorded so it is not re-reported:** `RESET
RENDERER` leaves `apex26.gfxHigh` in place. `tests/unit/gfx-backend-canary.test.mjs`
pins this on purpose ("GRAPHICS quality is a player pref, not renderer crash
state"); a crash-looping phone on ULTRA is asked to change GRAPHICS, not reset
the renderer.

**2026-09-22 — the boot canary never armed on a pre-present crash. FIXED.**
`js/game.js` arms `apex26.gfxBackendProbe` (the boot canary the next-boot
strike logic near `backendPreference()` reads) only in one place: right
before `render()`'s own `gfx.present(po)` call, at the very end of the
function. If `render()` throws BEFORE reaching that line — a deterministic
fault, not the transient kind `LoopHealth.fault()` absorbs in `tick()` — the
probe was never written, so a crash that killed the loop on its very first
frame left no trace for the strike logic to find on the next cold boot. Fix:
the arm body is extracted into `armBackendProbe()` (same guard, same
try/catch — `!_backendProved && _backendBound && !_probeArmed`), called both
at the original render() site and from `tick()`'s fatal catch, just before
its `throw e`. Verified: `node --test tests/unit/gfx-backend-canary.test.mjs`
(174 pass, including a new pin that the fatal branch calls
`armBackendProbe(` before rethrowing) and `tests/unit/source-integrity.test.mjs`.

**2026-09-22 — `startRace()` had no re-entrancy guard. FIXED.** Six
fire-and-forget callers (`js/game.js:8799`, `:8805`, `:9157`, the pm-restart
handler, `js/race/daily-challenge.js:76`, `js/race/race-settings.js:393` —
the same un-awaited-`startRace` family the `career.spec.js` and
`quick-validate.mjs` entries above already describe from the OTHER side, a
caller that does not wait for it) could re-enter the function mid-build: a
double-click or a second trigger while a start was still awaiting
`ensureScenery()` began a second race build on top of the first, rather than
sharing it. Fix: the existing body is renamed `startRaceBody()`; `startRace()`
is now a thin latch that returns the SAME in-flight promise to a concurrent
caller and clears once it settles. Verified live (not a source pin): a new
`tests/unit/start-race-latch.test.mjs` boots the real game.js in the Node VM
harness (`tools/lib/game-vm.cjs`, ~3 s) and calls the actual `G.startRace()`
twice synchronously, asserting `p2 === p1`, then that a call after settling
gets a fresh promise.

**2026-09-14 — `test:input` was 20 red; 3 are now FIXED, 15 are pre-existing,
2 remain OPEN as real defects.** The whole group, accounted for, because a
partial account is what let the RELAX drift below sit for a week.

| failures | cause | state |
|---|---|---|
| 3 (`sliders`, `presets`) | `PRESETS.relax` left behind by the 2026-09-08 re-centring | **FIXED** — see the entry below |
| 2 (`sliders › OVERALL SPEED`) | the car reaches gear 5, not 8, flat out | **FIXED** on the deploy branch — see below |
| 4 (`gamepad.spec.js`) | the pad reads as absent: `Input.throttle()` false on button 7, analog trigger 0 | **OPEN**, pre-existing |
| 9 (`steering.spec.js`) | every one 103-142 s against a 120 s test timeout | box, not code |
| 2 (`camera-hooks`, `camera-tuner`) | 146 s / 44 s | box, not code |

Every "pre-existing" above is MEASURED, not assumed: each spec was re-run alone
on a quiet box against the tree and against a worktree at `a28b77d`, and came
back identical — `gamepad.spec.js` 4 failed / 23 passed on both, the same four
tests; `OVERALL SPEED` the same two with the same `Expected: 8, Received: 5`.

**`OVERALL SPEED`: RESOLVED by the deploy-branch merge (2026-09-14), and the
diagnosis is worth keeping.** The spec hardcoded `jump(0.1, …)` as its
"straight". Nothing steers the car in this test — road-follow and the racing
line both default to 0 — so on a curved stretch it drove straight off the road,
hit the grass drag, and settled on the off-track floor: **gear 5 of 8** and
14.75 m/s where 76.5 was wanted. Not a driving defect at all; the car was on
the grass. The deploy branch's fix is to locate a real straight first
(`straightFrac()` walks 60 fractions and takes the lowest |k|), which both
OVERALL SPEED tests now do. Verified on the merged tree: **4 passed**.

The lesson is the generalisable half: a driving spec that hardcodes a track
fraction is asserting something about GEOMETRY it never states, and circuit
geometry moves — the elevations were re-surveyed the same week this went red.

`gamepad.spec.js` fails on the pad being read at all: `Input.throttle()` comes
back false for button 7 held at 1.0, and the analog trigger reads a flat 0 where
0.4 was set. The four that fail are the ones that press BUTTONS; the ones that
only move the sticks pass. So the suspicion is the button path of
`pollGamepad`, or the synthetic pad the spec installs no longer matching what it
reads — not the bindings table, which is keyed by action id and cannot be
shifted by adding or removing an action (checked: removing the PIT bind is not
the cause).

**2026-09-14 — `career.spec.js` is 14 red and `time-trial.spec.js`'s two ghost
tests are red, on a CLEAN tree. OPEN → FIXED at the test layer (re-verified
2026-09-22: every `__apex.race(` in `career.spec.js` goes through its `armRace()`
helper, and `time-trial.spec.js` polls `ghostSaved()` for the deferred write).** Found while gating the tyre phases, and
proven pre-existing rather than assumed: the same specs were run alone on a
quiet box against this tree and against a worktree at `a28b77d`, the commit
before any of the tyre work.

```
career.spec.js       mine 14 failed / 87 passed    base 15 failed / 86 passed
time-trial.spec.js   mine  2 failed /  2 passed    base  2 failed /  2 passed   (-g ghost)
```

Every failure on this tree is also a failure at base — the set difference in the
regression direction is EMPTY, and base additionally fails
`the hire's contract › it expires`. So this is the tree's state, not a change's.

**Career: the same un-awaited `startRace` as the `quick-validate` entry below.**
The failing reads are all of one shape — `__apex.race("monza")` followed by a
SYNCHRONOUS read in the same `page.evaluate`:

```js
window.__apex.seed(5); window.__apex.race("monza");
for (let i = 0; i < 24; i++) { const c = window.__apex.carAt(i); if (!c) break; … }
expect(a.length).toBeGreaterThan(20);   // Received: 0
```

`race()` starts `startRace()` and does not await it, and `startRace`'s first
statement is `await ensureScenery(trackIdx)`, so the race arms in a LATER task
and a synchronous pass never sees it. Every other failure in the file is the
same thing wearing a different hat: `picked` null, `by("VER")` undefined, and a
team-development multiplier reading `0.98889` — which is not a wrong number, it
is the NEUTRAL one, before development applied.

**Time trial: not a race at all.** The second ghost test never boots a session —
it calls `Ghost.clear/setTrack/startLap/record/finishLap` and reads
`localStorage` directly — and still fails on `saved.s` with `saved` undefined.
So the ghost is not being persisted. `storage.persist denied` appears in these
logs, so a container that refuses persistent storage is the first thing to check
before touching `js/car/ghost.js`.

**The fix is the one already made for `quick-validate.mjs`**: poll for
`info().state` instead of reading synchronously after `race()`. Not attempted
here — it is fourteen specs in a file this change does not touch, and folding a
speculative rewrite of them into a tyre commit would bury both.

**2026-09-14 — `debris.spec.js › enabled by default` fails on `rapierFetches`. OPEN.**
Found while gating the tyre thermal layer; **pre-existing**, and proven so
rather than assumed — the same single spec fails identically on a worktree at
the parent commit `a28b77d`, on the same assertion line.

```
tests/specs/debris.spec.js:76
  expect(r.rapierFetches).toBeGreaterThan(0);
  Expected: > 0   Received: 0
```

**What is NOT wrong.** The three assertions above it pass: `active`, `enabled`,
`ready`, `stepped > 0` and `live > 0`. So Rapier loaded, the side-world ran, and
the seeded burst spawned debris — the physics under test is fine. What fails is
only the test's attempt to OBSERVE the load, via
`performance.getEntriesByType("resource")` filtered on `rapier`.

So the likely cause is in the observation, not the subsystem: a resource served
from the service-worker precache (or the bfcache) produces no Resource Timing
entry, and a slow boot on a loaded box can overflow the default 250-entry
resource buffer before the assertion reads it — this box takes ~80 s for the
test. Either would leave a working side-world with an empty fetch list.

**The fix is a test fix, not a source fix**, and it should assert the thing it
means: that Rapier is loaded (`ready` already says so) rather than that a
network entry was recorded. If the fetch really must be observed, the page needs
`performance.setResourceTimingBufferSize()` raised at boot and a
cache-state-independent probe. Not attempted here — it is nothing to do with
tyres, and a speculative edit to a spec this session cannot re-run cheaply
would be worse than the honest record.

**2026-09-14 — `tools/check/quick-validate.mjs` was red on a CLEAN tree. FIXED.**
Found while building the tyre/pit phases and confirmed not caused by them (the
whole working tree was stashed and it failed identically). It reported:

```
QUICK-VALIDATE FAIL:
  probe() invalid after race+step
```

with no console error and no page error behind it.

**Root cause, and it was unconditional — the tool had never worked.**
`__apex.race()` starts `startRace()` and does not await it. `startRace`'s very
first statement is `await ensureScenery(trackIdx)`, so it yields and the race
arms in a later task. `evaluateLiveProbe` ran race() / jump() / step() / probe()
in ONE synchronous pass inside a single `page.evaluate`, and a synchronous pass
never lets a microtask land — so the session was still in the menu
(`info().state === "menu"`, `track: null`), `probe()` returned null, and the
helper blamed the physics.

**Fix**: `evaluateLiveProbe` is async and polls `info().state` until the race is
`race` or `count` before touching the physics (180 s, matching the 11-33 s
SwiftShader track builds this box measures). `probeFailures` reports a race that
never armed as its own failure and stops there, because everything downstream of
it is unmeasured rather than failing — reporting both as `probe() invalid after
race+step` is what made the one red line useless.

It now passes, which makes it a working gate for the first time. Note it is
still browser-only and no gate runs it: `tests/unit/quick-validate.test.mjs`
covers the pure helpers (and now pins the arming wait), but the browser half is
run by hand.


**2026-09-10 — whole-tree audit, six slices, FIXED in one pass.** Seven
read-only agents audited the tree (game/physics, renderers, track engine and
all 80 circuit files, UI/data/PWA, multiplayer and the worker, tooling/CI, and
outside research on the vendored packages); six implementation agents then
fixed their slice under file ownership, and the integrator registered the new
modules, ran the guards and the no-browser suite, and named the unverified
groups. Everything below is code-read confirmed and unit-tested where a Node
harness exists; the browser groups and every real-GPU claim are listed as
unverified in the commit.

*Game loop / physics (`js/game.js`, `js/physics/*`, `js/race/*`).* Red-flag
restart kept `c.lap` while re-gridding 14 m before the line, so a car on its
last lap finished on the restart; it also zeroed every heading including the
player's (`seedPlayerPose()` now derives it from the grid tangent, shared with
`gridUp`). `player.px[0]` on a scalar made the lamp-shadow key always 0 and
froze the player's floodlight shadow. A caution only lowered `vmax`, so the
field was still rolling at a red-flag restart (real brake fraction under
level ≥ 2). AI `towing` never cleared and the human never paid dirty air in a
corner: the positions-only `wake` grip penalty is now separate from the
driver-gated tow benefit. The standing quali lap started at the P1 slot with
~1.7 s of untimed run-up. Closing-speed literals in the AI bands are pace-
scaled. Lapped cars are flagged at their next crossing once the leader has
finished (`RaceControl.flagOut/finishOrder`; the results sheet says `+N LAP`).
`gridUp` with a null player spliced the last car out. The collision resolver
is `js/physics/collide.js` (`Collide.create(G, collideFx)`); game.js is 305
lines lighter. `tests/unit/red-flag-vm.test.mjs` pins the restart.

*Renderers (`js/render/**`, `js/lighting/*`, `js/perf/*`).* One light budget
(`LightBudget`) replaces four restated constants, so TLX-lite's 16-slot cap
no longer drops the tail-lights the cull appended last; GLX now copies
`frame.roadChunkLamps` so per-chunk road lamps work on the default renderer;
WGX env-probe faces were vertically mirrored (fixed blind — needs the real-GPU
census); WGX alpha-write masking, env-face/shadow encoder ordering, retired
textures, the TLX mirror-release gate and car-pass cull VP, instanced VAO
cache invalidation, the pipeline-key bias packing, `hdrMode` on lite rungs,
and `quality-preset`'s unguarded store read. `PostCommon` holds the lens-dirt
canvas, keep-nearest, HDR-grade test, sun-screen gate and knob defaults for
all three post chains; `Frustum.bucketInstances` replaces three instance
bucketers.

*Track engine and circuits.* `verify-track.cjs` printed OK while stubbing
every console method; it now reports suppressed/invalid/unsafe counts and the
unique warnings (`--quiet` restores silence). `dressingExcluded` windows
skipped the `_sceneryShift`/side transform (Monaco's data converted, Singapore
now transformed). Qatar's verges were two-thirds footprint-rejected, Baku's
kit fired the swapped-dimensions warning 13× per boot, Imola's ground read was
half a lap away, four circuits emitted-then-culled up to 295 backdrops per
build. `api.K` and `api.lapBounds()` replace 37 local `K` helpers and 30
centroid loops; `bakedModels` left the contract (112 members). Madrid, Estoril
and Indianapolis carried wrong `lengthKm` (Madrid raced 56 laps instead of 57).

*UI / PWA / data / storage.* The service worker returned a browser error page
for any navigation that lost a 3 s race while online; a primitive ghost blob
made every later ghost save throw; Spotify's token refresh had no timeout;
save-migrate never coerced `deal`, `budgetLvl`, result rows or per-round
scores; `lastRace()` was empty until the season opener; asset fetches never
checked `r.ok`; non-passive touch listeners; `user-scalable=no`; HUD flag and
canvases without ARIA. `Dom.el/paintFold/fmtLap` replace five copies.
`navigator.storage.persist()` is requested, and `GameStore` mirrors career and
season keys into IndexedDB with a boot restore (`persistState().mirror`).

*Multiplayer.* A peer's quali time was never coerced (a string reached
`toFixed`); peer parts skipped the budget check; the handshake reported the
server's build, not the running shell's; a sub-step X left the camera live;
the worker allocated a Durable Object before its 405; a malformed ICE entry
bricked WebRTC for 55 min; `makeAnswer` had no re-entry guard; the room-code
envelope is v2 (random salt, slot AAD), plaintext relay envelopes are refused,
HELLO/READY are rate-limited, `predict()` shares `poseRemote`'s clamp, PONGs
match a sent id, code generation has no modulo bias, `BarcodeDetector` is
preferred over jsQR when present. The legacy Trystero room branch (340 lines)
is gone and the vendor is 0.25.4 (relay backoff, pruned relays). `NetBytes` is
the one byte-codec home.

*Tooling / tests / CI.* Eight unit suites (five garage, three steering) ran in
no gate; two of them were red at HEAD (Alpine cover designs at 0–3 %
visibility, Aston's flank crest, and the `noPlate` class on Ferrari/Red Bull
flanks) and are fixed in the paint code, thresholds untouched. Playwright is
one exact version with the browser path derived from `browsers.json`; sharp
carries the libheif fix; a `waitForTimeout` ratchet exists; test-bg's registry
write is atomic and its sweep regex knows the current layouts; ci.yml's inert
`smoke` input, over-wide sweep trigger and stale caps are fixed; nine dead
tools, `test-shards.sh`, four redundant groups and eight scripts are gone.
Every freezable module surface now ends with `Object.freeze`
(`tests/unit/frozen-globals.test.mjs`). The first push froze eight TEST
SEAMS with it — `NetTransport` (net-authority injects `prefetchIce`),
`AiDrive`, `Car3D`, `F1API`, `GLTF`, `GameAudio`, `Input`, `LampChunks` — and
each monkeypatch became a silent sloppy-mode no-op: CI's net-unit lost eight
LOBBY subtests and `physics-hotpath` measured 180 unwrapped steps. Those eight
are back in `mutable` with the seam named; the registry's `_doc` carries the
alias-aware scan to run before freezing anything else. The same push also
made the corrected `dressingExclusions` transform land Singapore's side-1
0.78–0.90 window for the first time, which removed the generic buildings the
Helix Bridge had been standing on (5 floating clusters); the bridge now has
four piers to the rendered ground.

*Already red on the deploy tip's nightly, not this branch's:* `ci.yml`'s
renderer-macos job (real Metal) failed on 2026-09-09 (run 34327512922, tip
0c0c4d9) with `tlx-probes` M6 (skid batch never records — 60 s timeout),
`lighting-ab` "night light budget" (`floodEmit` 0.0858 against the 0.78 the
spec pins for a desert night) and `lighting-ab` "night fog GLOWS" (fog band
63.6 against a > 84 floor); the 09-06 and 09-07 nightlies were green, so a
deploy-branch change between them owns all three. The two lighting-ab
failures reproduce on llvmpipe here (60.3 vs > 71.9; 0.0858), so they are
not GPU-specific. Nobody reads the nightly: the deploy's own gate is
change-aware and never runs this job.

The same job on the audit commit (run 34459030214, with diagnostics) added
three more reds — `tlx-probes` M8 (post chain reports off), M9 (env probe
never begins) and `image-grade-visual` "blacks" (captures of 448×252 then
512×288, so the render scale climbed mid-test) — and the pre-audit base
(852764c, run 34460549586) fails the same set: M8, M6, M9, an image-grade
NaN (there "shadows", the sibling test; the resize lands on whichever test
is running) and the two lighting-ab tests. So none of the six is the
audit's: the deploy-branch commits merged at 9cdde03 own them. M9 is
f9c25e5 (TLX opts out of the env probe unless `apex26.tlxEnvProbe` is
"1"; the spec now opts in, 8d805fe). M8 and the capture resize are the
governor shedding on the Metal runner (bloom is zeroed at autoTier ≥ 4,
auto-res steps the scale) plus `cfdafc6` "initialize renderer extras on
demand" — candidates, not proven: the runner's own frame time is the
input, and the base run's "FLAKY: 1 passed only on retry" says the same
box is noisy. Left to the deploy branch's owners.

With the governor attached to the failure messages (run 34462442429):
the image-grade NaN is auto-res — `scale 0.8, tier 0, autoTier 0, fps
31.8, floorMs 18.5, open window 558 frames / 134 slow / max 4366 ms` — the
Metal runner's boot stalls (shader compiles up to 4.4 s a frame) make the
governor step the render scale down inside the test, so the two captures
differ in size; no tier is shed. M8 fails on the bloom block with the tier
at 0, so it is not the autoTier ≥ 4 zeroing; the next Metal run carries
the diagnostics on that assertion too. M9 passes since 8d805fe. The
census (run 94, `apex26.tlxEnvProbe=1`, force=env) shows the TLX env
probe running on hardware — begins 12, ends 12, ready, envFail 0,
gpuErrors 0 — and the WGX leg rendering 233 frames with gpuErrors 0; the
census does not expose WGX envState, so the WGX env-face ordering is
exercised clean on Metal, not seen. "Fixed blind" stands for the pixels.

*Left open, with the approach recorded in the session plan:* the car-draw and
shadow-pass extractions (eval-order coupling), the `tests/` guards/vm split
(45 files cited by path from circuits and docs), the lobby/netplay roster fold
(two different ownership predicates), three.js r186 and Rapier 0.20 (real-GPU
census and debris re-tuning), the WGX env-probe confirmation, the physics
re-baseline, and Singapore's night prop budget spec.

**2026-09-09 — a mark painted in the colour it stands on, on 59 of 69
liveries. FIXED** — and the fourth case of two sessions on one defect.
`markPalette()` resolved a mark against the plate it would sit on, but two call
sites draw the mark WITHOUT its backing and deleted the plate afterwards, so the
colour was chosen to read on a shield that was then thrown away. Measured:
Ferrari's `bigmark` horse came out `rgb(242,245,250)` on a `#f2f5fa` cover —
**1.00:1, the cover's own colour**. The fix is `opts.noPlate`, resolving
plate-less at the call site instead of deleting the field after the fact;
`bare` is NOT this flag and cannot stand in for it, because `crestKeepsPlate`
keeps the shield through `bare: true` on exactly the marks that have one.

*The misreading is the reusable part.* This side measured the same defect from
the other end — an offline sweep scoring painted area per design — and got
`bigmark` at 20,960 px on McLaren and **0 px** on Ferrari and Red Bull, then
logged it as "nothing-drawn vs drawn-invisibly, undetermined" and moved on. The
metric scored contrast against the field, so a mark painted in the field's own
colour is indistinguishable from one never drawn: the zero meant INVISIBLE, not
ABSENT, and that sweep could not tell the two apart at all. The measurement was
sound; the interpretation attached to a zero was not — a metric that collapses
two states cannot arbitrate between them, and the honest next step was a second
instrument, not a note. `livery-contrast.mjs --team=ferrari` reports 0
large-area failures below 2:1 on the merged tree.

**2026-09-08 — three.js lost half the trackside scenery, and nothing could see
it. FIXED**, but the shape is worth keeping. A player reported missing scenery
on three.js; GLX was fine. Reproduced on real Apple hardware via `gpu-census`
on macos-latest (`anyHardware: true`, `softAdapter: false`, `gpuErrors: 0`):
GLX drew the barrier wall and debris fence, both three legs drew bare grass.
Root cause in `ARCHITECTURE.md` §Parity snapshot — the node-program cache key
dropped an instanced object's identity, and three compiles the instance-matrix
source buffer into the node graph, so 28 prop batches shared one program bound
to the first batch's transforms.

*Why every instrument read clean*, which is the reusable part: `gpuErrors 0`;
the cull agreed with GLX instance for instance (1060 / 35,672 verts at one
camera); `imesh.count`, `visible`, `parent`, `material` and the resident
`instanceMatrix` were all correct. The DATA was never wrong — the program it
was bound to was. Ruled out along the way, each with a same-camera A/B: the
ranged `instanceMatrix` upload (0 px change), the 1024-instance
uniform-buffer threshold (a synthetic cap-3000 InstancedMesh renders fine),
the geometry shared with tlx-shadow's caster pool, and the geometry itself (a
plain `Mesh` of it draws). What isolated it was adding `|obj<id>` to the key
before the track built: 24.8% of pixels move and the furniture returns.

*Why it cost so much*: `graph.js` skips the FUSE for a batched node, so there
is no soup copy behind a dropped batch — **48.2% of all prop geometry across
the roster is instanced-only** (79.6% Vegas, 77.9% Nürburgring, 74.2%
Hockenheim, 72.2% Spa). DebrisWorld's per-body fallback cannot see a skip
either: it feature-detects on the NAME, which is present and no-ops.

**2026-09-08 — every glass pane shipped twice. FIXED.** `scenery/city.js`
routes unlit window panes to `glassBuf`, and `tracks.js` only sets
`_preferInstance` on the default props buffer — so `replay()` wrote those panes
into the GLASS MESH and the same placements came back from `graph.batches()` as
an instanced unit-box batch that `tracks.js` uploaded on top, with the props
material, at the same depth. 56,048 instances / 1,345,152 verts roster-wide
(Vegas 22,127, Baku 12,613, Jeddah 11,617, Singapore 7,895); on ten circuits
the duplicate is the glass mesh vertex for vertex. `batches()` plain stays a
CAPABILITY report (six unit tests and `graph-parity.cjs` depend on that); the
fix is `batches({instancedOnly:true})` at the one caller that uploads. Visually
invisible — co-planar — so it was pure cost: a same-camera A/B on jeddah moves
0.03% of pixels.

**2026-09-08 — a re-grid inherited the last race's per-car scratch. FIXED,
TWICE, by two sessions in parallel — and the duplication is the lesson.**
`agent-determinism.spec.js` went red on the deploy branch (Pages 2095,
`14a1789e`). Three `run(42)` episodes in ONE page, and run 0 disagreed with runs
1 and 2, which agreed with each other. That first-run-only shape is the tell:
the first episode CREATES per-car scratch that no re-grid restores, so every
later episode starts warm.

The fix that matters is in `apex.js` `reset()`, from the session that owned the
lateral controller that broke it (`1ad520c5`, `9375f1ce`, `c5a9dd87`): the
clearing block now also deletes the fields **one car reads off ANOTHER** —
`_vmaxNow` (the blocker's pace `AiDrive.otWant` turns a pass on), `accSm`, and
`towing` — plus the controller's own `aiHead`/`aiBias`/`aiFam`. Those are
written every frame but READ on the first frame before their owner has been
updated, so a cold session sees `undefined` and falls back where a replayed one
sees the last episode's value. `lane` is the odd one out and re-seeds from
`lanePref` rather than being deleted, because it is already adapted before the
first episode rather than absent.

This side reached the same place independently and kept only the half that one
does not cover: `gridUp()` and `redFlagRestart()` clear `accSm` and restore
`lane` too, because a REAL PLAYER never calls `__apex.reset()`. Starting a
second race from the results screen, and a red-flag standing restart, both
re-grid through those paths, and a car sitting on a grid box is pulling nothing.
Neither clear draws `simRnd`, so the grid's draw-count contract holds.

*The duplication is worth recording.* Two sessions spent a working day each on
one defect, and both arrived by the same route — dump every primitive on all 22
cars at the start of three episodes, diff, and the leak names itself. Neither
reasoned it out; three code-read hypotheses were tried and measured wrong on
this side alone (the Red Bull livery commit, a lazily-built cache, the seeded
stream's draw count). **The measurement is cheap and the reasoning is not: on a
determinism break, dump and diff FIRST** — `node tools/check/episode-diff.mjs` is that procedure, and it names the field in about five seconds. A VM twin of the browser guard landed
with the other side's fix (`determinism-replay-vm.test.mjs`, in `test:game-vm`),
so this is now caught without a browser group; a second twin written here was
dropped on the merge rather than shipped beside it, which is the same
drifted-twin trap `2987dee4` added a guard for.

*Consolidated 2026-09-09.* Both fixes shipped and layered, leaving `reset()`
with THREE mechanisms for one defect: seven fields zeroed, an inline 19-field
delete list, and `EPISODE_TRANSIENTS` (25 fields) deleted last. The first two
were dead. Set-difference proves it — the inline list is a strict subset of
`EPISODE_TRANSIENTS`, all seven zeroed fields are in it too, and nothing between
them reads a car field, so the final loop already did their work and six fields
more (`contactT`, `kerbHapT`, `kerbSndT`, `offroad`, `towing`, `wheelLock`).
Worse than redundant: `c.accSm = 0` reads as "0 after reset" when the effective
value is `undefined`, which is the exact zero-versus-absent distinction this
entry turns on. Now one list, −16 lines, with `episode-diff.mjs` reporting the
same clean digest before and after.

**2026-08-18 cleanup sweep** tagged removals, false-positive dead exports, and
the next intended `game.js` extractions in
[`../archive/research/CLEANUP-SWEEP-2026-08-18.md`](../archive/research/CLEANUP-SWEEP-2026-08-18.md).

**2026-08-17 parallel survey** (provenance; several items absorbed): see
[`../archive/research/SURVEY-BUGS-PERF-2026-08-17.md`](../archive/research/SURVEY-BUGS-PERF-2026-08-17.md).
Career `trackIdx = -1`, VSC/SC player pace, net `predict()`, and Singapore
`lapMirror` portal remaps have landed in code. Remaining survey leftovers live
on the 08-18 perf-hunt board, not this register.

- **`Invalid CommandEncoder` on the owner's PHONE — almost certainly the
  documented BENIGN TRANSIENT, not a defect (2026-09-08).** The same screenshot
  that raised it answers it, and the answer was in `tlx.js` all along.
  `err 1` with `heal —` means ONE error in ONE present, and the heal's own
  threshold is `HEAL_MIN_FRAMES = 2` distinct presents *because*: "a healthy tab
  can raise exactly one transient (resize race, texture freed on a track
  switch, the capture path). Healing on `> 0` reloaded the second case." The
  heal is designed not to fire here, and it did not. The HUD also reads
  `LAP 1/3 TIME 0:03.60` — three and a half seconds in, which is when a
  warm-up transient (first pipeline creation, a texture upload) lands.

  **What would make it real, and neither is shown:** `err` climbing while
  driving, or `heal yes`. A single boot-time error on an otherwise healthy
  51 fps frame is the case this machinery exists to ignore. NO ACTION TAKEN on
  the renderer, and none appears warranted.

  The A/B below stays because it is opt-in and costs nothing, and because the
  reading above is a strong inference rather than a proof — if `err` is ever
  seen climbing, the suspect is already switchable in a reload.
  Reported from a real device, three/webgpu at Spa: `fps 51.4 / frame 19.5 ms`,
  `gfx: three/webgpu err 1 strikes 0 scale 0.75`, `gpu: Invalid
  CommandEncoder`, `tlx: blit —` (native present, no readback), `dc 559`. The
  world renders — trees, grandstands, the car — so the encoder recovered.

  **This is the only player-facing evidence in this file.** Every census leg
  has reported `gpuErrors 0`; this is the first error from the path a player
  actually takes, and it arrived by screenshot rather than by any instrument
  the project owns. It also, incidentally, settles the entry below it: 51.4 fps
  on the device against 4.9 in the census is the soft-blit gap, measured.

  **The code already describes this failure and assumes hardware is immune.**
  `tlx.js drawInstanced`: "Dawn bind[s] a 16-vertex vec3 as instance-rate …
  One failed draw invalidates the whole encoder … Skip the instanced scenery on
  that path; **real GPUs keep the batches**." `skipBatches()` gates on
  `_softAdapter && isWebGPU()`. But Dawn is Dawn on a phone too, and the
  assumption is now in doubt.

  **NOT fixed, and on the reading above probably nothing to fix.** Widening the gate to all WebGPU would shed
  48 % of all prop geometry (79.6 % Vegas, 77.9 % Nurburgring) from every real
  GPU to chase one recovered error. Instead `apex26.tlxSkipBatches=1` reverts
  the single suspect on the single device that has it, in a reload — the same
  idiom as `tlxForceHw` for the software side. `backendState()` now also
  reports `skipBatches` (the live verdict, not the inputs) and `gpuErrFrames`
  (DISTINCT presents an error landed in), which is what separates one bad frame
  at boot from every frame — `err 1` alone cannot.

  **Next, on the device:** set `apex26.tlxSkipBatches="1"`, reload, drive the
  same corner. Error gone → the instanced batches are the cause and the fix is
  a narrow one (the attribute layout, not the gate). Error stays → batches are
  exonerated and the next suspect is free. Either way `gpuErrFrames` says
  whether it is a boot one-off or per-frame, which decides whether it matters
  at all.

- **The deploy branch's three.js/WebGPU leg rendered a near-black frame on real
  Apple hardware — NOT REPRODUCING on the current head; handed over
  (2026-09-08).** Run 61 on `9b94175` reads `meanLuma` **44.6**, back in the
  43.9-48.4 family, so whatever `b53b022`/`9b94175` carried fixed it or it is
  intermittent. Two runs on `d4cd570` read 2.6 and that measurement stands;
  what does not stand is calling it live. Anyone reading this for a repro
  should start from `d4cd570`, not from the tip.

  **What run 61 did give is the diagnosis, out of that session's own new
  instrumentation** (`b48603b`, which added `begins`/`ends`/`mask` to
  `envState()`): the WebGPU leg reports `begins=3 ends=3 mask=7 ready=false`
  against the WebGL2 leg's `begins=674 ends=674 mask=3 ready=true`.
  `begins === ends` on both, so no face is lost between `envFaceBegin` and
  `envFaceEnd` — the producer is simply never CALLED again after three faces,
  which is neither of the two causes that commit's comment set out to
  separate ("faces lost in between" or "something clearing the mask"). The
  probe stops being driven. That is where to look.

  **Traced further (2026-09-08, same day).** The producer is not the problem
  and neither is `tlx.js`. `begins === ends` on both legs, so every
  `envFaceBegin` was matched by an `envFaceEnd` and each call completed; the
  WebGPU leg was simply ASKED three times in a ~35 s run that offers roughly
  forty opportunities. So the gate that stopped calling it is in `game.js`:

      player && !_envProbeOff && PerfGov.tier() < 1 && !paused && !dbgCam &&
      (frozen || (_frameNo & 3) === 0) && gfx.envFaceBegin &&
      LT.carEnvCube > 0.001 && !hideMeshes.cars

  `_envProbeOff` is only ever set from localStorage, so it is not that. The
  live term is **`PerfGov.tier() < 1`** — rung 1 of the governor's feature
  ladder IS "env probe off" — and `js/perf/governor.js`'s own header records
  the asymmetry that makes this bite one backend and not the other:

  > 1284, 25 s per backend: WebGL2 sat at scale 0.80 / tier 0 / 23 fps, while
  > WebGPU and three.js — where the scale lever did bite — reached tier 2

  Three faces is twelve frames at the every-fourth-frame throttle, ~2.4 s at
  the measured 4.9 fps: the probe runs briefly, the governor sheds it, and
  recovery is deliberately slow — "features come back only at full res under
  the same sustained headroom, one per ~4 s". A leg that sheds early may never
  get the six consecutive opportunities the cube needs inside a 35 s check.
  **The tier hypothesis is FALSIFIED — I tested my own inference and it is
  wrong (2026-09-08, an hour after writing it).** `gpu-game-check --backend
  three` in this container resolves to the SAME leg (`path: webgpu`, `engine:
  three.js r185 webgpu`) and reports `begins=896 ends=896 ready=true mask=3`
  with `tier=0 autoTier=0 scale=1` — on a box whose own governor recorded a
  6.7-SECOND worst frame. Slowness does not starve the probe, the governor
  never left rung 0 to shed it, and the cube latched. It also kills the
  broader reading I was one step from adopting: this backend is not inherently
  unable to drive the probe, because here it drives it 896 times. Whatever
  closes the gate is specific to the macOS runner, not to three-on-WebGPU.

  `tier=0` on both census legs was the reading that made the shed-and-recover
  story attractive; the local run shows tier 0 is simply where this leg sits.

  **ROOT CAUSE, from the census ARTIFACT rather than the summary (2026-09-08).**
  The verdict step prints `fps` and `floorMs` but not the frame COUNT, which is
  the number that settles this. Downloading run 61's artifact:

  | leg | `open.frames` | worst frame | elapsed | `begins` | `ready` |
  |---|---|---|---|---|---|
  | three → WebGL2 | **600** | 16.7 s | 49.7 s | 674 | true |
  | three → WebGPU | **5** | **11.4 s** | 39.1 s | 3 | false |

  **The WebGPU leg rendered FIVE frames in thirty-nine seconds**, one of them
  taking 11.4 s. There is no env-probe defect: six cube faces cannot be baked
  by a renderer that produces five frames. `begins=3` is the correct and
  expected behaviour of a healthy producer on a leg that barely runs, and every
  reading downstream of it — `ready=false`, the missing image-based ambient,
  the darker `meanLuma` — is a symptom of the frame count and nothing else.

  It also retro-explains the 2.6 / 44.6 / 66.7 luma spread that opened this
  entry: that is how many frames landed before the capture, not three different
  rendering faults.

  **The 600-vs-5 comparison is INVALID, and `docs/notes/PERF-FINDINGS.md`
  already says so in capitals: THE HARNESS RUNS THE TWO LEGS ON DIFFERENT
  PRESENT PATHS.** `tlx.js:235` — `_softBlit = !forceWebGL && _capPref !== "0"
  && (_softAdapter || _headless || _capPref === "1")`, with `_headless` =
  `/HeadlessChrome/i.test(ua)`. The census's WebGPU leg sets
  `apex26.tlxForceGL = "0"`, so under Playwright it SOFT-BLITS: a GPU readback
  plus `putImageData` every frame. The WebGL2 leg sets `"1"`, short-circuiting
  `_softBlit` to false. So 600 vs 5 is a readback path against a direct one,
  not one backend against another, and an 11.4-second frame is what a readback
  of a large target on a busy shared runner costs.

  **NOTHING IN THIS ENTRY IS EVIDENCE ABOUT A PLAYER.** On a Mac in a headed
  browser `_headless` is false and `_softAdapter` is false, so `_softBlit` is
  false and the native swapchain is used. Only a HEADED hardware run says
  anything about that path — the same caveat the WGX leg's `softPresent=true /
  headlessUa=true` line has carried all along, which I read past twice today.

  So the open question is narrower and far less alarming: **is the soft-blit
  readback so expensive on these runners that the census's WebGPU legs measure
  the HARNESS rather than the game?** If so the fix belongs to the census, not
  to `tlx.js`. A compile storm remains a candidate for part of it (`tlx.js`
  carries that note, and 593 programs at ~60 s on Monza is recorded there), but
  soft-blit is the larger and better-evidenced term and must be excluded first.
  NO PLAYER-FACING DEFECT HAS BEEN DEMONSTRATED anywhere in this entry.

  Superseded above: everything about the `game.js` gate. The gate is fine; it
  was asked three times because there were five frames to ask on. I spent two
  rounds on the callee and one on the caller before reading the frame count,
  which was in the artifact the whole time.

  For whoever picks this up: the cheap next measurement is to record WHICH
  term of the gate was false on the frames the probe did not run, not to add
  more counters inside `tlx.js`. The instrument there is already sufficient
  and has done its job — it is `game.js` that is silent.

  The original measurement follows.

- **(the d4cd570 measurement)** `gpu-census` on
  `claude/f1-game-project-26h3ng` at `d4cd570`, `macos-latest`, montreal:
  `meanLuma` **2.6** on the TLX/WebGPU leg while the other three legs of the
  SAME run are normal (webgl2 67, glx 73.8, wgx 79.3). Reproduced twice —
  runs 59 and 60. My own branch at `37627cc`, same image and track, reads 46.7
  on that leg, and the historical family is 43.9 / 46.7 / 48.4.

  **The documented confound does not explain it.** `docs/notes/PERF-FINDINGS.md`
  records a known non-defect where TLX/WebGPU renders darker because
  `envReady=false` leaves it with no image-based ambient, and the census
  workflow's own comments warn that a `meanLuma` comparison is only a
  comparison when both legs ran the same content (`tier` decides whether the
  env probe is live). Run 59 fit that shape (`envReady=false`, `tier=1`,
  `envFace=0`) and I retracted the finding on it. **Run 60 does not**:
  `envReady=true`, `envBlank=false`, `tier=0`, `envFace=2` — the same state as
  the 43.9–48.4 family — and still 2.6. So the retraction was wrong and the
  finding stands.

  **Where it is NOT.** `js/render/` is byte-identical between `f342eca` (my
  branch, 46.7) and the deploy tip (2.6), so no renderer change causes this.
  The delta is `js/perf/renderer-picker.js` (a new touch-device default for
  the stored backend), `js/car/car-mesh.js`, `js/car/car3d.js`,
  `js/car/liverytex.js`, `js/game.js`, `js/input/steer-tuning.js` and
  `js/ui/settings-export.js` — work from `claude/rendering-bugs-optimizations-3pstxj`
  and two other sessions. NOT investigated further and NOT touched: it is
  another session's in-flight work, and editing someone else's branch on a
  hunch is how two sessions end up fighting over one file.

  **The gate cannot see it, deliberately.** The census verdict fails on
  `gpuErrors`, `softAdapter` and `envFail`, never on appearance; the workflow
  argues a brightness floor "goes flaky and then gets widened to pass, which
  AGENTS.md forbids outright". That reasoning is sound and this entry is not a
  request to overturn it — but it does mean a black frame ships green, and the
  only thing standing between that and a player is somebody reading the
  summary. Worth a decision from the owner, not a unilateral threshold.

- **`aero-zones` "X-mode buys X_VMAX_GAIN of vmax" — NOT A DEFECT. The entry
  that stood here was mine and it was wrong (retracted 2026-09-08).** It
  recorded the spec as RED on three trees at ratios 1.1023 / 1.1023 / 1.0880
  against an expected 1.0957, measured through a scratch harness
  (`scratch/xmode.mjs`, since deleted). The spec is GREEN: 1/1 alone, and
  14/14 with the whole file in order, on the tip. Reproducing it in
  `tools/lib/game-vm.cjs` with the spec's OWN preconditions gives 1.09574
  against 1.09570 — inside the 3-decimal tolerance, no patch needed.

  The lesson is the entry, not the physics. `7212e79` (another session, the
  same morning) had already fixed the real cause: the human car tows since
  2026-09-03, so a rival inside the 34 m window in one sample and not the
  other moved `vmaxNow` by the slipstream rather than the flap. The spec now
  sends the field 800 m back and asserts `towing === 0` in both samples. My
  harness did not do either, so it measured the tow and I wrote the number
  down as a defect in the code. **A harness that does not reproduce a spec's
  preconditions is not evidence about that spec** — and inflation (1.1023 >
  1.0957) was the tell, since a car gaining MORE than the flap earns is a
  car getting something extra, not a broken multiplier.
- **TLX: every road decal (driving line, blob shadow, tyre mark, skid) was
  buried under the road — FIXED (2026-09-08).** `tsl-fx.js` `fxMaterial`
  copied GLX's `polygonOffset(-4,-8)`, but three honours the road's own
  `depthBias [-8,-16]` (game.js `_wmRoad*`) on both of its backends while
  GLX draws the road unbiased, so the decals failed the depth test on real
  hardware (gpu-census 48: chevrons on GLX and WGX, none on TLX, `gpuErrors
  0`) and on lavapipe. Now `-12/-24` — the road's bias plus GLX's margin;
  `tests/unit/gfx-backend-canary.test.mjs` pins the fx offset beyond the
  road's. Lesson: a submitted draw with zero GPU errors is not a drawn
  pixel; `backendState.line` reports the pooled mesh, the census reads the
  frame.
- **Montreal: a bridge support floats 2.72 m off the ground — FIXED in
  engine + circuit.** `foundation()` now falls back to `Tracks.terrainY` when
  the build-time 30 m triangle grid misses a `flatTerrain` shelf, and the
  casino footbridge opts out of `overheadSpan`'s auto-legs (`supports: false`)
  so the custom piers are the only feet. Browser spec not re-run in this
  session (load).
- **`hud-layout` `notched-landscape` — FIXED.** `#hud-sectors` top is
  `calc((8px + var(--tap) + 4px + var(--sat)) / var(--hud-z))` in
  `css/hud.css` (the old hard-coded 56 was desktop-`--tap` only and overlapped
  `#pausebtn` by 4 px on touch). The short-landscape override that pulled it
  UP to 52 is gone. Diagnosis that still applies: never pin HUD chrome to a
  pixel constant when a sibling is sized from `--tap`; convert the unscaled
  sum into the zoomed element's units (`--hud-z`) or the pair drifts at
  non-default HUD SIZE. Portrait `.hud-top`/`#pausebtn` overlap stays
  excluded — it sits behind `#rotate-device`.
- **`menu-keyboard` › "left/right move along a chip row without leaving it" is
  red — FIXED** (`js/ui/menu-nav.js` `step()` gained the `.chip-row` special case
  in d13a123a, 2026-09-16; re-verified against the tree 2026-09-22)
  (`tests/specs/menu-keyboard.spec.js`, the desktop keyboard/trackpad
  block). Confirmed PRE-EXISTING at `d7a1158` by a quiet-box A/B, both sides via
  `tools/ci/test-solo.mjs` and both started at load 1.24: `HEAD` fails in 20.6 s,
  base fails in 18.4 s. No timeout on either side, so it is an assertion, not
  contention. This is the SECOND red test in this file — the `#track-detail`
  dialog regression above owns "Tab cannot escape the track-detail dialog" — so
  the file is worth one pass rather than two separate fixes. It is the only
  failure in `test:ui`, which otherwise runs 100/100.
- **`props-over-road` on COTA and Indianapolis — geometry fix landed;
  browser re-measure not run in this session.** COTA's amphitheater now emits
  from its declared origin (the 8 m declared-vs-built offset). Indianapolis
  shortens the oval stand and colour-band chords that covered the infield at
  racing 0.33. Re-measure with `tools/track/measure-props-over-road.mjs` before
  treating the spec as green.

  **Both offenders are located and are the same class: a big bespoke
  `structure`, not foliage, barriers or lighting.** Measured with
  `TRACK=<id> PORT=<p> node tools/track/measure-props-over-road.mjs`, then matched to
  a prop by footprint via `a.scene({radius})` (`props[].at` / `sizeM`):
  - **COTA** max **4.79** at frac 0.877, world (709.1, 41.6). The intruding
    triangles stack vertically at one XZ point (`triY` 1.36 / 2.76 / 4.16), so
    it is a standing structure, not a canopy. Footprint match: `prop:274`,
    55.1 × 4.1 × 27.9 at (730.5, 0.8, 44.3) — the **Austin360 Amphitheater**
    `modelGroup("cota-amphitheater", …)` at `js/circuits/cota.js:83`, built from
    raw `addBox` calls (stage deck, PA towers, LED wall).
  - **Indianapolis** max **4.91** across fracs 0.323–0.336, world (183.8–185,
    453), `triY` 4.14–5.87. Footprint match: `prop:911`, 43.3 × 2.3 × 50.4 at
    (184.4, 0.8, 429.5). The XZ match is solid; its declared height does not
    span the offending `triY`, so the exact triangles likely belong to a taller
    sibling inside the same group — confirm before editing geometry.

  **A hypothesis that looked strong and is WRONG, recorded so it is not
  retried:** `a43691c` ("Combine track lamps and floodlights into one fixture
  system") postdates the spec baseline and stripped `"lamps"` from BOTH
  circuits' `dressingExclusions`, which reads like the cause. It is not — those
  exclusions are foliage/lighting-scoped and neither offender is foliage or a
  lamp. The remaining suspect is `7a17351` ("decouple scenery/road from the
  line"), which changed how authored scenery maps onto the racing line and
  would move the road under a structure authored beside it; `dressingExcluded()`
  shifts its windows by `TrackSpace.sceneryOriginDelta` (`js/track/tracks.js`
  ~:1450). Not confirmed — bisect it rather than believe this paragraph.

  **ROOT CAUSE, COTA — confirmed and measured.** An earlier note here said the
  footprint preflight "does not apply" to `modelGroup`/RAW emissions. That was
  WRONG: `js/track/scenery/models.js` does preflight every group. It just checks the
  wrong thing — it tests the bounds the author DECLARED and never looks at what
  was actually emitted, so a group can pass the guard and then put its geometry
  somewhere else. `cota-amphitheater` declares
  `center = vadd(vadd(a.c, a.r, 8), a.u, 13)` and emits its stage deck at the
  anchor, so the tested box sits 8 m further from the circuit than the geometry.
  `modelGroup` now measures this (`diagnostics.escaped`, read via
  `__apex.modelDiagnostics()`): the amphitheater escaped its declared box by
  **9.0 m along the RIGHT axis** — laterally, toward the track — which is the
  4.79 m of geometry over the racing line. The amphitheater now emits from
  that declared origin, and `modelGroup` re-runs the road preflight on the
  **emitted** oriented box (lateral footprint only — vertical apron slack is
  still a diagnostic, not a delete).

  **Indianapolis is NOT this bug.** Same instrument: 15 of its 21 groups escape
  their declared bounds, but every one is vertical (≤0.44 m aprons/greens) and
  **zero escape laterally**, so the declared-bounds gap cannot be what puts
  geometry over its road. Its offender still needs a cause. (COTA: 4 of 12
  escape; only the amphitheater does so sideways.) The vertical population is
  large enough on both circuits that any future promotion to a hard rejection
  must be lateral-only, or it will fail 40 circuits on harmless apron slack.
  Confirmed PRE-EXISTING at
  `d7a1158`, not introduced by the instancing-key hoist: `BASE=HEAD~1 node
  tools/track/graph-parity.cjs cota indianapolis` returns exact parity
  (max |Δpos| 0.0e+0 m), and a geometry test over identical geometry returns an
  identical verdict. Unseen because `test:scenery` is not in the CI smoke job —
  the same gap that let `agent-drive-bench` sit red, and the standing argument
  for why "a guard nobody runs is prose with extra steps" (§9).
- **`groundPatch`/`groundedSegments`/`waterField` take no side flip on a reverse
  circuit — RAISED AND NOT ACTIONED, deliberately.** An audit pass flagged that
  `js/track/tracks.js` wraps `tyreWall`/`wall`/`hedge` with
  `SIDE(side) = def.reverse ? -side : side` but wraps `groundPatch`/`waterField`
  with the origin-shift `SK()` only, so a runoff patch authored with the same
  literal `side` as its paired tyre wall lands on the opposite side of the
  corner (cited: `redbull.js:95` vs `:102-103`, `monza.js:230` vs `:228`,
  `cota.js:457` vs `:441`, `spa.js:230` vs `:226`).
  **The mechanism is real; the conclusion does not follow.** `tracks.js:277-280`
  states the default is ORIGIN SHIFT ONLY — "no side flip, no reverse/mirror
  remap … deliberate and conservative … giving them the full treatment here
  would silently move already-shipped geometry." Authors place these by eye
  against what the engine actually does, so a literal that disagrees with a
  wrapped sibling's is expected rather than evidence of misplacement.
  **This is the SECOND time an audit has read a documented asymmetry as a
  defect** (the first was `hwZones` index-vs-arc space, withdrawn the same day
  after the circuit files turned out to annotate both spaces). The lesson for
  the next pass: in `js/track/`, a convention that looks inconsistent between
  two emitters is usually written down within twenty lines of the code — read
  the surrounding comment before costing a fix.
  Settling any individual patch needs a rendered check per circuit
  (`__apex.render({what:"map"})` against `modelDiagnostics()` positions), not a
  code change; `tools/track/graph-parity.cjs` would show what any engine-level
  fix moved.

- **Per-circuit vertex budgets are ad hoc; the repo-wide gate is missing.**
  Qatar itself is resolved — cut 340,858 → 299,386 (a redundant street-lamp
  dressing pass and an over-tripled flood run) with the budget re-set to
  310,000, justified in the spec's own comment — but Vegas builds 1,825,925
  prop vertices (~80 MB of GPU buffer at the real interleave, against the
  ~100 MB where iOS jetsams the page) with **no cap at all**.
  ~~`verify-track.cjs` now fails `vegas` above 1 850 000 prop verts (measured
  ~1.83 M + slack). Other circuits stay uncapped.~~ **SUPERSEDED — checked
  2026-09-15.** The Vegas-only tripwire is gone and `verify-track.cjs` now
  carries a FLEET cap of 1 100 000 that every circuit is measured against, which
  is what this entry was asking for. Instancing has since taken Vegas itself to
  ~370 k, and the real hogs the old tripwire never covered are the ones the cap
  now binds: mexico 991 k, miami 794 k, jacarepagua 775 k (measured 2026-09-01,
  fleet median ~340 k). The cap sits ~10 % over the largest, so a circuit
  ballooning toward the ~2.2 M jetsam line fails in 2 s rather than on a phone.
- **The banked-reference measurement error is fixed locally, not durably.**
  Monza's 0.294 and Spa's 0.525 "terrain over road" readings were one root
  cause — probes measured against the unbanked centreline where `bankZones`
  lift the tarmac — and both foundation specs now add the `Tracks.banking()`
  term themselves. ~~The durable fix is still open~~ **DONE 2026-09-15:**
  `__apex.groundY()` now applies the banking term and returns `roadSurfaceY`,
  `bankDy` and `overRoad`. `roadY`/`gap` deliberately keep their raw-centreline
  meaning — changing `gap` underneath its readers would have re-baselined
  thirteen circuit specs in one commit, which is not a thing to do blind — so
  `overRoad` is the field new code reads.

  **One correction to this entry while closing it:** "no spec rebuilds a
  centreline" turned out to describe ONE spec, not three. Only
  `monza-foundation` duplicated `groundY`'s arithmetic, and its local
  `bankTrack` is now deleted (migration verified a numerical no-op — its own
  comment recorded the local build as "bit-identical to the live track", and the
  spec passes unchanged). `spa-` and `zandvoort-foundation` do something
  different: node-corridor scans over `nodeAt()` at lateral offsets derived from
  measured half-widths, where the local banking term is legitimate rather than
  duplicated. They are left alone deliberately.

  Still true, and still worth doing: the ~13 specs reading `.gap` should migrate
  to `.overRoad`. At their probe fracs the two are identical (which is why they
  pass), so it is low-risk churn rather than a fix — but it is what stops the
  next circuit author reading the trap field. Follow-up unchanged: Monza's
  Parabolica 4° camber cap lost half its written justification to this bug and
  should be reconsidered on its remaining merits.
- **A19 residue.** `css/overlays.css` still carries mutually inconsistent
  measured cluster widths in comments (the "467px" family) of which at least
  two are historical measurements of the pre-grid flex strip. Landscape
  hud-layout coverage is closed (`HUD_LANDSCAPE_ONLY` checks `.hud-top`,
  `.hud-gaps`, `#minimap`, `#hud-sectors`); portrait overlap stays excluded
  behind `#rotate-device`.
  **2026-09-03 — that "closed" was wrong, and it cost a shipped defect.**
  Naming those four selectors only ever bought HUD-vs-BUTTON pairs: the
  collision loop compared `hb × vis` and never `hb × hb`, and `unsafe` filtered
  `vis` alone, so two HUD clusters overlapping each other — or overrunning the
  notch — could not fail the spec. `.hud-gaps` painting over `.hud-top` on a
  notched landscape phone is exactly that case, reported from a real device.
  `fitHud`'s cap had never carried a `--sal`/`--sar` term either, so the
  measurement it was checked against was short by the whole inset. Both are
  fixed; the spec now runs `hb × hb` and includes the HUD boxes in `unsafe`.
- **A13 zoom/rect sites — closed.** `js/ui/css-zoom.js` (`CssZoom`) is the
  shared helper: `viewportRect` / `localBox` / `toLocalDelta` (+ a one-shot
  `rectsAreVisual` probe). Call sites: garage lens shift (`game.js`
  `renderSetupPreview`), `menunav` `nearestPane` + wheel→`scrollTop`,
  `sheetshape` thresholds via `localBox` (clientWidth, engine-safe). **Data hub
  now scales:** `.dh-card { zoom: var(--ui-scale) }` with `--svhz`-based heights;
  telemetry scrubber uses `CssZoom.viewportRect`.
- **No CSP.** `index.html` ships no Content-Security-Policy of any kind.

### 2026-09-16 — a guard suite that EDITED the thing it guards (ratchets)

`tests/unit/ratchets.test.mjs` proved the commit hook's bound by calling the
real `autoRaise({ maxRaise: 40 })` — with no dry run. On any tree that was over
a ceiling, running the SUITE wrote `tests/data/ratchets.json`.

The behaviour, seen while adding four DOM nodes for the Legends picker:

| run | result | side effect |
|---|---|---|
| 1 | `tooling-fast` FAILS, `shellNodes` over its ceiling | raises 1588 -> **1592** |
| 2 | `tooling-fast` PASSES | none — it raised it a moment ago |

Two things are wrong with that, and the second is the serious one. It presents
as a flake: a red that vanishes on re-run is the exact shape an agent learns to
dismiss, and it cost a confusing detour here. And a ceiling could be raised
with **no commit, no diff and no human** — the raise then rides into whatever
commit happens next, so the ratchet silently stops ratcheting. The commit
hook's auto-raise is the opposite: it writes deliberately AND stages the change
into the diff a person reads.

**Fixed.** `autoRaise` takes `dryRun`, which classifies without writing, and the
test passes it. The hook still calls it without, because there the write is the
point. Verified by reverting the silently-raised ceiling: the suite now reports
the SAME red twice and leaves the file untouched, where before it healed itself
between runs.

The general lesson is worth more than the fix: this suite and the twin-fidelity
gate both went in this session, and both first shipped in a state where they
could not fail for the reason they existed. A guard needs a test that it still
BITES, which is why `ratchets.test.mjs` has "the ratchet bites, in both
directions" and why the fidelity matrix keeps its refuted mutants.

### 2026-09-16 — the Monaco continuity test does not test continuity (found by building the fidelity gate)

`tests/specs/physics-fixes.spec.js` test 1 says of itself: "a guard that the
projection stays continuous (and that future changes don't reintroduce a
teleport)". Measured, it guards none of that. THREE separate mutations of
`project()` in `js/track/core/spline.js` leave it green:

| mutation | what it should destroy | twin | browser |
|---|---|---|---|
| `CONT = 0` | the arc-length penalty, removed | 2/2 green | **2/2 green** |
| `cost -= CONT * da * da` | the penalty INVERTED — snapping far from the last arc is now REWARDED | 2/2 green | **2/2 green** |
| `W = track.n` | the ±16-node locality window opened to a global nearest-point search (the pre-hint behaviour that caused the original teleports) | 2/2 green | not measured; two browser columns already agreed |

Both backends agree, so this is NOT a twin-fidelity hole — it is a hollow
test, and it costs ~110 s of browser every time it runs. The likely reason is
that `roadFollow: 0.7` holds the car close enough to the line that a hairpin
is never ambiguous, so no mutation of the tie-break can change the answer.

**Open, and deliberately not "fixed" by deleting it.** Before it can be cited
as projection coverage, someone has to find driving that makes the projection
genuinely ambiguous. The evidence is kept in `tests/data/mutants.json` under
`openQuestions` (deleting the mutants would delete the finding), and
`tests/unit/twin-fidelity.test.mjs` fails if that record is dropped.

**Found by building the gate, not by reading the test.** `tools/check/twin-fidelity.mjs`
exists because `tools/ci/twinned-specs.mjs`'s equal-test-count check is vacuous
for an ADAPTED spec — the twin IS the spec, so the counts match by
construction. The first mutant it ran reported "the twin SLEPT THROUGH this",
and checking the BROWSER column before believing that is what turned a wrong
conclusion ("the VM is blind") into the right one ("the test is hollow").
The gate ships green on the one verified mutant (`m-wall-scrub-flat`: caught
by the scrub test, correctly ignored by the continuity test).

### 2026-09-16 — Monaco now escalates to a RED FLAG where it raised no flag at all (product, found by benchmarking)

**Reproduced twice on an idle box, byte-identical both times**, and the same
spec run at a pre-session base does not reproduce it. Found while measuring
`tests/specs/physics-fixes.spec.js` for the process-speedup work, not by a
gate — the file is not twinned and only runs when `selected` picks it, which
is why nothing caught it.

| ref | race-control flag changes during the spec | test 1 (Monaco lap distance) |
|---|---|---|
| `22ea30d` (2026-09-15, pre-session) | **0** | pass (191.3 s) |
| `13ee765` (today's tip, LIVE at build 9147) | **6** | **fail** — `maxBackJump` 253.27, ceiling 5 |

The escalation, from the failing run's own log:

```
RaceControl flag GREEN -> YELLOW
RaceControl flag YELLOW -> VSC
RaceControl flag VSC -> SAFETY CAR
RaceControl flag SAFETY CAR -> RED FLAG
red flag: standing restart, 22 cars re-gridded at raceT 32.8
```

The 253 m "backwards jump" is not a projection bug: it is the standing
restart legitimately re-gridding the player. The assertion is sound; what
changed is that the scenario now produces a red flag. The spec drives
deliberately WIDE into the barriers (steer 0.3 / -0.3 / 0.6 with throttle,
3 x 1500 steps ~ 75 s of sim) with the full 22-car field — so in player terms:
**running wide at Monaco for half a minute now triggers a full race stoppage
and standing restart, where before it raised no flag at all.**

**BISECTED to `d402fd7` — `fix(pit): the stop is driven end to end — approach,
entry, box, queue, exit`** (146 commits, 8 steps, one commit between the last
good and the first bad). `js/race/race-control.js` is UNCHANGED; the
thresholds are untouched (YELLOW 3 / VSC 6 / SC 10 / **RED 16**).

The mechanism, from that commit's own diff: it makes THE PIT WALL solid. Its
comment says `TrackPit.openBoundary` had "left the wall itself as scenery a
car running wide drove straight through", and it now grows the wall in
(`wallR = Math.min(wallR, face - 1.1)`). The spec drives deliberately wide
along the pit straight, so where it used to pass through the wall it now
scrapes it, sheds debris, and the settled pieces are counted.

Measured hazard totals through the spec's own driving (`caution({hazards:true})`,
probe kept at `artifacts/bench/probe.spec.js`):

| ref | max hazard total | vs RED_MIN 16 |
|---|---|---|
| `22ea30d` (pre-session) | **11** | under |
| `13ee765` (tip, LIVE) | **17** | **over** |

Every hazard sits in sector 0 around frac 0.081 — the pit straight.

**Two hypotheses tested and REFUTED, recorded so nobody re-tests them.**
(1) The new tyre curve (`CURVE_FLOOR` 0.75 / 0.80, a fall past the peak where
tanh never fell): neutralised at the tip with `CURVE_FLOOR = 1.0`, and the red
flag still fired at the same race time, `maxBackJump` 253.36. (2) Monaco's new
`pit: { mode: "street", side: 1 }` def block: removed at the tip, red flag
still fired, 253.27. Neither is the cause.

**FIXED, on the test side only (2026-09-16).** `physics-fixes.spec.js` now
turns the caution layer off for the measurement (`__apex.caution(false)`, the
same door as the CAUTIONS row in RACE SETTINGS) and asserts
`caution().level === 0` afterwards, so if a flag ever flies again the test says
so instead of silently measuring a reposition. The 5 m ceiling is UNCHANGED —
this removes an unrelated subsystem's interference, it does not widen a
tolerance. Verified on an idle box: 2/2 green, zero flags raised, 112 s and
118 s (back to the 110.1 s its own header declares). Race control keeps its
coverage in its own specs; this file owns the projection.

**The product side is deliberately NOT changed.** The base was already at 11
of the 16 hazards needed to STOP A RACE, so there was almost no headroom, and
race control counts one car's own settled debris the same way it counts a
pile-up. A single player scraping a wall for half a minute should not be able
to red-flag a race. Owner: the race-incidents-control / pit-lane session —
decide whether the new wall contact rate is intended and whether RED_MIN is
still calibrated, before deciding whether the spec needs a guard against a
legitimate re-grid (it has none today — `physics-fixes.spec.js:69`).

**Two other things this measurement settled.** (1) The same file's OTHER test,
wall scrub, FAILED at the base and PASSES at the tip: the base ran two
Playwright workers on this 4-core box and the contention broke its timing
assertion, which is exactly what the 2026-09-16 one-worker change
(`playwright.config.js` `LOCAL_WORKERS`) was landed to stop. A measured fix.
(2) The `APEX_VM_PAGE=1` adapter runs this spec in 19 s and reports **2/2
green** — it never sees the red flag. That is the sharpest evidence yet for
the standing rule that the adapter is a pre-check ALONGSIDE the browser gate
and never a replacement: here the VM is blind to a live product regression.

### 2026-09-16 — the deploy tip's release train is red on the coplanar sweep (geometry, not tooling)

Found by the train on `f46cb99` (pages run 35068834342, 2026-09-16 07:35 UTC)
and on every full-tier run of the deploy tip since `80acf93` (`feat(pit): a
shorter lane, a signed entry, a walled exit, furnished bays, the stop seen`)
and its follow-ups (`c48d891` re-baselined floating scenery only; `5710a0c`
fixed the Abu Dhabi gridshell that `abudhabi-foundation.spec.js` caught).
`tests/unit/coplanar-faces.test.mjs` fails both ways:

| circuit | coplanar spots | baseline (`tools/track/coplanar-baseline.json`) |
|---|---|---|
| fuji | 17 | 16 |
| hungaroring | 20 | 18 |
| istanbul | 5 | 4 |
| magny_cours | 2 | 1 |
| redbull | 9 | 8 |
| albert_park | 7 | 8 (stale — must come DOWN) |

The growth is a real finding (a new same-facing coplanar face is a
z-fighting risk), so the baseline must not simply be raised: the check-changes
deploy reference says a grown count needs `node tools/track/coplanar-audit.cjs <id>`
and a dated note in the test file first — most likely the new pit-lane
building or wall sits flush on an existing face at those six circuits. The
albert_park entry must be lowered to 7 regardless. Until both land, every
train on the deploy branch fails at "Per-circuit geometry sweeps" and nothing
publishes; the tooling landing of 2026-09-16 (`docs/notes/AGENT-PROCESS-RESEARCH-2026-09-16.md`
§5) is on the tip and its fast tier is green, so the site will pick it up with
the first green train. Owner: the pit-lane session; this note is the hand-off.

**Closed the same morning, in three parts.** The pit-lane session audited the
six circuits and landed the coplanar baseline on `45fbd81`; its train
(pages run 35070243183) then went red one job later on two other things.
(1) `tools/track/float-audit.cjs abudhabi --why` named one floating cluster —
the Yas hotel gridshell's last arch at frac 0.989, 18 m over prop cells with
no leg beneath it after `5710a0c` moved both rear legs a node early —
and `b3f3bb3` keeps the rear-left leg under the arch (audit: 0 elevated
clusters). (2) `menu-baseline.spec.js` `garage-phone-landscape` was 6166 px
(2 %) off its golden: `5903510` shrank the garage tab labels to 9 px and
untrimmed a gap (SUSPENS… reads SUSP, the rows sit 3 px higher), so the golden
was STALE, not the render. Re-blessed 2026-09-16 from the runner's own
SwiftShader capture (artifact `golden-menus-runner`, run 35070786138) and
confirmed on this container (the two agree to 1-17 px — table above,
2026-09-01), with the diff reviewed by eye: labels and spacing only, every
row, chip and price intact. (3) The `selected` shards moved to Mesa llvmpipe
today; the shard carrying menu-baseline stays on SwiftShader, since the six
goldens are SwiftShader captures (ci.yml carve-out, pinned by
`tests/unit/ci-coverage.test.mjs`).

**LIVE.** The first green train after those three landed is pages run 2356 on
`1f04126` (2026-09-16 08:45 UTC): every job green, and the live shell now reads
`<meta name="apex-sha" content="1f04126…">` at build **9116**, up from the 9058
the site had been stuck on all morning. The tooling landing of 2026-09-16 rode
out with it.

### 2026-09-01 general survey — fixed, recorded, and the player-facing list

Fixed in the same session (each a two-line local change; browser groups
named in the commit): a one-tap reload from the in-race SETTINGS sheet
(RENDERER / THREE PATH / SCREENSHOTS / RESET RENDERER now arm a two-tap
confirm while `body[data-race]` is set, and GRAPHICS defers its boot-tier
reload to after the race); the time-trial ghost store's whole-blob
parse+stringify moved off the physics step (`requestIdleCallback`);
`teamMeshes`/`teamBodies` LRU invalidation without their order arrays (a
later eviction freed a LIVE mesh); `sectorValid` not cleared on a backward
line crossing (a fraction-of-a-second S3 could become a session best);
`gamepaddisconnected` killing input for a still-connected second pad; the
gyro listener never detached when leaving TILT; the shell reload dropping
`location.search`; `weatherArc` surviving `endRace`/`quitToMenu`; the
one-shot gesture listener registered `once:false`; `fitHud` re-measuring
10×/s unbounded while the layout was empty, with four selector queries per
tick.

Recorded, not fixed (PLAUSIBLE or a design call):
- **~~Menu state renders the full scene every frame~~** — mostly CLOSED by
  `menuBlank` (title/garage/career hide the canvas). Remaining: race-settings
  flyby still draws every frame with PerfGov race-gated. **Results freeze
  (2026-09-09):** `render()` returns on `state === "results"` (last race present
  kept); `endRace` calls `Particles.rainShow(false)`; env probe is race|count
  only.
- **~~GLX `cullInstances(batch, planes, {upload:false})`~~** — FIXED 2026-09-09:
  GLX now packs to `shadowIbo` like WGX's `shadowInstBuf`; camera ibo/cell-set
  cache survive a shadow recentre.
- **`sw.js` activate deletes every other cache generation** while the old
  shell is still running: its lazy fetches (scenery, data, net, deferred
  backends) miss the cache; offline after the swap a circuit builds bare.
  Needs a two-generation repro before changing the sweep.
- **Storage quota is shared** by ghost (uncapped, ~40 KB/track), six career
  slots and the API cache; only the API cache evicts, and only its own keys.
- **Ten direct `localStorage.setItem` sites** bypass `store.write`
  (bodyattitude, cockpit-opts, gfx-quality, metrics, perf, apex) — no
  `noteBroken`, no cross-tab invalidation.
- AI brake-look loop redoes three wrap chains per sample (`Tracks.nodeAt`
  would resolve the index once); netplay allocates one `{id,car}` per remote
  per publish; career migration branches on `.durable` instead of `.ok`.
  (`endRace` rain overlay cleared 2026-09-09.)

Player-facing improvements the code is one step from: coloured sector
splits (`sectorBests`/`sectorLast` are already on the façade); `LEADER` /
`P{n}/{n}` instead of a blank gap chip; a visible `RECOVERING 3…2…1`
before the auto-rescue teleport, cancellable by real progress; the flagged
sector stroked yellow on the minimap (it already strokes per-sector
colours); a centre-out ghost delta bar in place of the six-character text.

### 2026-09-02 UI round — the five agent passes, and the HUD list to screenshot

Five worktree agents (mobile touch, setup/garage/career, pause/settings/
results, menus/a11y, HUD feel) each fixed their CONFIRMED items with a
node test on `mini-dom` / `css-rules` and were merged in sequence; the
sheet-density classifier now judges a sheet by the ROOM it has, not its
content height (`sheetshape.js roomOwn` — RACE SETTINGS at 1280×800 had
kept the phone layout for good), and a lap count off the next circuit's
ladder snaps to that circuit's FULL below full as well as above. The HUD
pass landed eight items: a 3ch right-aligned speed slot (the figure and
KM/H shifted half a digit at every 100 km/h crossing), a latched redline
(92 % on / 89 % off — one threshold restarted the pulse every tick at the
limiter), `COOLDOWN n` for the overtake lockout (it read `OVERTAKE` at half
opacity), sector rows with the announce banner's ▼/▲ against `sectorBests`
(the "coloured sector splits" item above — landed), a plate and light ink
under the ENERGY label (it vanished below half charge), `#ff3b30` for brand
red used AS TEXT (S2 label, ghost delta — `#e10600` is ~4.2:1 at 12–14 px),
the minimap zone stroke in the AERO chip's blue (it was cyan), and a `-`
placeholder in the TIME box (`0:00.0` is a width `fmtTime` never prints).

PLAUSIBLE, code-read only — the screenshot list for the next live pass
(1280×800 unless stated; the HUD needs a running race, so the Chrome probe
after the browser groups, never during):
- A. LANDED (1185951b): the displayed gap is an EMA per slot (~0.3 s at 10 Hz), reset on a neighbour change — one braking tick no longer doubles the tenths (hud-feel unit case).
- B. CONFIRMED and LANDED: measured headless (aiPlace-staged rival, 2026-09-02) the block was 2 px with the ahead line empty and 17.6 px filled; `.hud-gaps > div:first-child { min-height: 1.3em }` pins the behind line (hud-feel pins the rule). A true P1 could not be staged headlessly — `jump()`/`setLap()` leave `player.prog`, so the field always ranks ahead.
- C. CHECKED, no change: the idle chip reads `AERO 463m` (distance to the next zone) at 844×390 and 1280×800 (artifacts/shots/20-hud-*, headless Bahrain race 2026-09-02).
- D. S3 label lime vs the PB-value lime — one hue, two meanings. `#hud-sectors` after a PB S3.
- E. CHECKED, no change: POS/LAP/TIME/BEST labels on the plate over Bahrain day sand read at 844×390 and 1280×800 (same shots).
- F. `#hud-flag` (top 100 px) vs the dropped `.hud-gaps` (top 62 px) on a short phone at HUD SIZE ≥ 150 %. 844×390, yellow flag, `:root[data-gap-drop]`.
- G. CHECKED, no change: `ENERGY` at 100 % over the lime fill reads at both viewports (same shots) — the halo carries it.
- H. Three unsynchronised blinkers (OT armed 0.8 s, redline 0.4 s, VSC 1 s) together. Bottom cluster under VSC with OT armed.
- No pit-lane indicator exists in the HUD (nothing to disambiguate; noted).

### Found by the 2026-09-01 deep pass (code-read, measured where stated; not browser-verified)

Fixed in the same pass and therefore NOT listed: the contact-shove lap
double-count (`shiftLong` moved `_prevS` with the car), the qualifying model
timing the AI field on slick grip, the claim-fail reload that was never
"once", `gfx.msaa()` reporting 4 on the direct-to-screen fallback, RAISE THE
CAP sold at rungs the derived `budgetCap()` already binds, the Vegas-only
prop-vert tripwire (now a fleet cap in `verify-track.cjs`), NIP-01 `OK=false`
visibility, and the CI sweeps filter that skipped
four suites' own sources. What remains:

- **Bank-zone re-seat has no distance cap** (`js/track/core/mesh.js` ~:228-246). A
  frac zone that lands on a straight is moved to the nearest unclaimed apex
  however far that is. Measured pre-reseat distances: watkins_glen 0.24 →
  951 m, estoril 0.075 → 693 m, mugello 0.88 → 690 m, jacarepagua 0.47 →
  609 m, hockenheim 0.335 → 533 m, indianapolis 0.88 → 434 m, paul_ricard
  0.07/0.64 → 395/345 m. At those distances the re-seat is the "real corner
  that is simply the wrong one" failure. Left as-is deliberately: capping the
  re-seat would bank a straight instead, and the honest fix is per-circuit —
  re-author those eight fracs against a reference and then cap at ~250 m.
- **~~The scenery-file `KOLD` shift disagrees with the engine's
  `_sceneryShift`~~ — RESOLVED (2026-09-01, Node-build measurement, no render
  needed).** The premise was wrong on both circuits. *Singapore*: `anchor()`
  is not raw — `transformSceneryApi` wraps every k-keyed helper as
  `f(sceneryNode(k), -side)` on this reverse + lap-mirror circuit, so the
  shift cancels and the node that meets a kit structure at authored frac `s`
  is the mirror inverse `(n - K(s)) % n` with the opposite side. The old KOLD
  put the pit beacon 1.4 km from the tower (accidentally "supported" by a
  city block); the "corrected" arc shift put it 33 m in the air. Fixed: the
  cone anchors at `(n - K(0.999)) % n`, side +1, lateral 53, +33.9 m — 0.06 m
  from the tower's roof centre, float and clip audits unchanged. *Monaco*:
  the -24-node index shift is an empirical calibration of the raw
  `px/rx/tx` readers; the engine's -51-node arc shift would move all seven
  sites 108 m earlier and drop the tunnel onto Portier. Every site is closer
  to its measured corner under the current shift, so only the comment
  claiming "the same formula the engine uses" was wrong — corrected in place.
- **~~A rival driving the CUSTOM team is never posed in VS FRIEND~~ — FIXED
  (2026-09-01, second pass).** `resolveSeatClash()` now treats a custom (MY
  TEAM) car as a seat that cannot be kept whatever the player's rank (a
  peer's grid holds no slot or wireId for it), moves the player to a free
  real-team seat and says why. Pinned by `net-lobby-lifecycle.test.mjs`;
  the `test:net` browser group was NOT run for it.
- **`CircuitElevations` is a dead branch** (`js/track/tracks.js` `hasRealElevation`
  / `elevationAt` / the `real` arm of `realPoints`): the global is defined only
  by `tools/gen/bake-elevation.mjs`, is in no manifest entry, so every circuit's
  elevation today is the synthetic `def.elevations` cosine bumps. Either wire
  the bake into `TRACK_VM` + the shell or delete the ~20 lines.
  > Errata (2026-09-22): this claim is stale. `js/track/circuit-elevations.js`
  > IS in `tools/manifest.cjs` (both `FULL` at :140 and `TRACK_VM` at :351,
  > ordered before `tracks.js` as its own comment there requires) and has its
  > own `<script>` tag in `index.html`; it currently ships real SRTM profiles
  > for 11 circuits (fuji, okayama, jerez, donington, anderstorp, brands_hatch,
  > zolder, dijon, buddh, mont_tremblant, mosport), each of which takes the
  > `real` arm in `tracks.js`. Every OTHER circuit still falls through to the
  > synthetic bumps, which may be the observation this entry was really
  > reaching for — but "dead branch, in no manifest entry" is not it.
- **Jeddah `startFrac` is in a corner** (`startline-probe`: mean |k| 0.0173
  over 120 m, first apex 1064 m later). Acknowledged in-file as known-wrong
  with no usable source; 39/40 pass.
- **Second-pass (2026-09-01) fixes from the plausible list**, each with a
  unit test where a node harness existed: `rescuePlayer` re-seeds the
  `rPrev*` render anchors; `quitToMenu` resets race control; `waitFor` rides
  out up to five consecutive transient relay errors (429/5xx/timeout/offline)
  instead of aborting the two-minute wait; a future-stamped `apex26.api.*`
  entry (clock stepped back) is neither served nor kept; `sdp.js` gained
  `C_RELAY6` and unwraps `::ffff:` mapped IPv4; an abandoned career draft
  restores the slot it was opened from; `settleRound` tolerates an unknown
  team id; driver standings break points ties by countback (`season.finishes`
  histogram, `SeasonCal.rank`) rather than insertion order.
- **Checked, not defects**: `IncidentSim._lapCross` skipping `reportLap` —
  a takeover lap is invalid and `updateCar` would not report it either;
  `prefetchIce` nulling the cache before a refresh — `iceServers()` already
  excludes credentials past `ICE_CRED_TTL_MS`, so the window is the 55→60 min
  validity tail only.
- **Plausible, still unverified**: the boot canary is armed before the
  ~550 KB deferred-backend fetch (a navigation during the download reads as a
  dead backend); a transient `checkFramebufferStatus` failure in `createTargets`
  disables post for the whole session with no retry (WGX has one).

### Found by the 2026-08 whole-codebase survey (unverified beyond a code read)

Each was found by reading the file, not by a failing test. The 2026-08-13
cleanup session worked most of this list off — the fixed entries are gone from
here and their narratives are in the archived journal — so what is left is what
survived a fix wave, plus what that session's own gates surfaced. Listed
most-load-bearing first.

- **Curvature-sign convention — SETTLED (`+k = LEFT`).** `js/track/core/spline.js`
  `curvatureRaw`, `findCorners` / `buildKerbs` in `js/track/core/mesh.js`,
  `js/game.js`, and the agent `CONVENTIONS` string all agree. Historical
  "+ = right" wording was comment drift; the physics-facing signs were already
  the measured convention. **Still do not flip any sign without a rendered
  lap** — the 2026-08-13 barrier fix stayed deliberately vertical-only for
  that reason.
- **The wall clamp is bypassed while `IncidentSim` owns the car — FIXED.**
  Product: `wallAt` stays the outer bound during R2 (the side-world has no
  barrier colliders). `postStep` now clamps `tf.x` and writes `px`/`pz` from
  the clamped `(s,x)`. `updateCar` still skips its own clamp while `owns()`
  is set — that is correct; the write-back is the remaining authority.
  Unit-tested in `tests/unit/incident-gate.test.mjs`.
- **Red Bull Ring's barrier coverage — FIXED (2026-08-13), and the mechanism
  was general.** tightFrac 0.225 was not missing dressing: sceneryRange()
  collapsed every authored full-lap span to zero width (wrap01(1) === 0)
  before the full-lap guard could see it, so lap-round barriers tightened
  ONE node per side on shifted circuits. Fixed in js/track/core/space.js by
  short-circuiting width >= 1 to {0, 1} — a whole lap is frame-invariant.
  Verified: fleet A/B shows redbull only (0.225 -> 1.000), characterization
  + redbull-foundation + tiny + guards all green.

- **`__apex.scene()` behind-camera bearing — SETTLED.** `behindCamera` means
  `|bearingDeg| > 90` (behind the look direction), not `project() === null`
  (behind the near plane). The spec asserts `> 90`. Monza's first behind
  corner at ~108° now flags correctly.
- **Title-screen CLS — FIXED, and the method is the point.** The title screen
  used to paint in the wrong shape and relay out: `body[data-density]` picks
  `#overlay`'s one- vs two-column grid, and `js/ui/sheet-shape.js` wrote it on
  `DOMContentLoaded`, behind all ~146 synchronous scripts. Measured on a quiet
  box at 852×393 over a gzip server: **CLS 0.5241** at `d7a1158`, now **0.0602
  and 0.0824** on two cold loads ("good" is under 0.1), via a tiny inline script
  at the top of `<body>` that reads both thresholds back out of CSS.
  Two wrong answers were measured and discarded on the way, both recorded in
  the code comments so they are not retried: (1) preloading the webfonts —
  `CLSCulprits` names `titillium-web-latin-600-normal.woff2`, but with the fonts
  landing at ~126 ms the shift was unchanged; (2) moving `sheetshape.js` to
  script #4 — that only makes it a RACE, and the same build on the same box
  scored 0.0824 and 0.5929 on consecutive loads depending on whether the script
  beat the first paint. Only something with no network dependency wins reliably.
  Three measurement traps cost most of the time here and are worth knowing: the
  service worker serves the previous build's precache, so a fresh ORIGIN (new
  port) is required per cold load; a loaded box reports incoherent timelines
  (a shift stamped before its own FCP); and `setTimeout` polling cannot observe
  anything during the synchronous script wall — sample in `requestAnimationFrame`,
  which runs before each paint, and read the computed values rather than a
  timestamp.
- **Cross-backend shading divergences the parity test cannot see**: TLX and
  WGX LIT now classify chrome (`SURFACES.mirror = 27`) and key wet reflections
  off `wetSheen` (porous ground no longer mirrors lamps). WGX FrameU `params9`
  carries `uAmbContactDark` / `uLampWallSpill` / `uWindowSunFlash` /
  `uSkyRimGlow`; SkyU `p5.x` is `uCloudDef`. WGX sky now ports the overcast
  grey-shift, twilight horizon bank, and azimuthal gradient. Remaining honest
  WGX gap is TAA (still off).
- **The relational agent policy — FIXED (2026-08-13).** The under-drive was
  never the speed caps: pure feedback steering cannot track road curvature
  at speed (traced: 13.9 m road departure at 55 m/s with steer 0.04). The
  bench policy now feeds forward from the road's published curvature
  (`ahead.pts` v^2/R) with a matching speed bound — Monza 251 -> 1543 m,
  Interlagos 1119 m, spec 5/5 green, floors untouched.

- **Test-quality gaps** (from the whole-`tests/` read). The
  `ui-button-touch` "throttle button visible" never-fail (`if (count > 0)`
  around its only `expect`) is **FIXED** — the expect is now unconditional.
  `menu-survey` and `parts-catalog` still join the known `ui-audit` gallery as
  assertion-light. The banked-reference measurement error (fixed in the Monza
  and Spa foundation specs with a local `Tracks.banking()` term) is still
  latent in **Zandvoort's** foundation spec and ~12 others whose probes miss a
  bankZone — the durable `groundY`/`overRoad` fix above is what retires the
  whole class. `tests/unit/coplanar-faces.test.mjs` now pins the sweep length
  to the circuit roster (the old `>= 24` floor is gone). The lone `.test.cjs`
  suite is invisible to the doc-count regexes.
- **A lapped driver's LIVE row — FIXED (2026-08-13).** `intervals()` now passes
  "+1 LAP"/"+2 LAPS" through as a string (null was indistinguishable from
  missing data) and `live.js` renders a string `timeDiff` as a bar-less
  label. A lap down is not a time gap and is no longer drawn as one.

- **`js/circuits/indianapolis.js` infield planting — FIXED (2026-08-13).** The
  dead `h < 0.5` selectors (unreachable after the `h < 0.55` guard) moved to
  0.775, the live range's midpoint: clumps plant on both sides and the
  dark-leaf variant renders. verify-track OK, float-audit unchanged.
- **The 2026-08 whole-tree audit's deferred list is the standing backlog for
  this section.** 143 verified findings, of which the fix-now batches took 30;
  the rest are recorded by area with file/line evidence in the dated audit
  record indexed from `docs/README.md`, and are not re-itemised here. The
  round-2 items that were verified still-open and deliberately left out of the
  fix-now batches are worth naming because they are small and near-miss:
  `js/net/handshake.js` `payload.k` null-deref and its missing deflate-bomb cap,
  `js/net/sdp.js` ascii CR/LF handling (these three are FIXED in the tree as of
  2026-09-22: `decodeCode()` shape-checks `payload.k`, `inflateBytes()` caps at
  `MAX_DECODED_BYTES`, `sdp.js` `unpack()` joins with CR LF and `strBytes()`
  refuses non-printable bytes), `js/data/telemetry.js`'s sprint badge,
  `js/render/glx/post.js` `hdrOk`, `js/render/three/tlx.js` `boxScale` (and a
  stale comment in `js/render/three/tlx-post.js`), and a lobby branch in
  `js/net/lobby.js`.
- **Smaller, catalogued but not itemised here**: the EXPORT data tab still
  hardcodes its year list; several dev tools have exit-0 error paths and
  hardcoded chromium/port assumptions. The full 11-part survey with line
  references is the backlog record for the cleanup.

---

**2026-09-10 — parts-mesh-cache eviction tests are budget-marginal on this box.**
`tests/specs/parts-mesh-cache.spec.js` "player body and cockpit caches keep at
most 3 visual keys" (240 s budget) and "wheel mesh cache keeps at most 8
tyre/brake pairs" (360 s) failed three times on the car-draw extraction
(32b04b9): twice with the second garage pick still "performing click action"
at the budget, once with the cockpit-mesh wait (20 s) expiring. The one run on
the pre-extraction commit 88f8515 passed at 222 s — 18 s under its budget.
Measured on both commits with the same script, idle box: opening the garage
10–34 s, an engine pick 33–38 s (tab click 17–19 s, option click 15–20 s —
Playwright's stability wait against a garage that renders at ~0.6 fps under
SwiftShader, one texture created and freed per frame on both commits), race
boot + park 23–27 s. Four iterations of that is ~300 s, so a 222 s pass is
the fast tail, not the norm. The spec's own mesh probe, installed on the
extraction, counts body=1 after park, cockpit=1 within 10 s of
`camera("cockpit")`, wheels=4, field=32 — the caches it audits are reached.
The moved code is byte-identical to the base modulo the façade rewrites
(`G.` / `deps.` / `PhysicsConsts.` / `M4.clamp` / `CamModes.CAM_MODES`; 616
lines, 0 diff). Verdict: not a regression; the test's budget assumes a
faster garage than this box has (its header already calls the 5→3 boot
change "UNVERIFIED IN A BROWSER"). Left as is — never widen a budget to make
a spec pass. Superseded the same hour by 2e09124 on the deploy branch, which
measured the same 23–29 s per click, gave `__apex.garageParts` a garage-closed
path (`recomputePlayerMods` on the façade) and re-wrote both tests to boot ONE
race and refit through the hook: body/cockpit eviction 156 s and green.

**2026-09-10 — an extracted module cannot carry game.js's eval-time destructures.**
Moving the shadow passes into `js/render/shared/shadow-pass.js` carried ~40
reads of `LT` with them. `LT` is not a global: game.js binds it at eval with
`const { TUNE_DEFS, LT, buildTrackLights } = LightTune;`, so in any other file
the name does not exist. Proven in the booted page — a strict function reading
`LT.shadowRange` at module scope answers `ReferenceError: LT is not defined`
(`typeof LT` does NOT, which is why a typeof probe is no test of this). Every
sun-map rebuild would have thrown.

**Corrected 2026-09-10, TWICE — the second correction is the one to read.**
The first version of this entry claimed nothing in the browser suite would have
caught the bug. I then re-broke the shadow pass, saw `menu-baseline.spec.js`
fail on three of its six golden PNGs, and "corrected" the entry to say the
goldens catch it. That was wrong, and wrong in the most ordinary way: I ran the
broken case without running the CONTROL. On the fixed tree the same three
goldens fail, with the same pixel counts to the pixel — 10319, 13520 and 49516
— so the injected bug changed nothing. Those three were already failing.

The structural reason is in the spec, and it is decisive: before it shoots,
`menu-baseline` calls `__apex.headless(true)` (stopping the render loop) and
sets `visibility:hidden` on `#game`. A dead shadow pass cannot appear in a shot
that stops the loop and hides the canvas. The goldens are a DOM identity gate —
colour, type, weight, spacing — and they are not, and cannot be made into, a
renderer gate while they do that.

So the original claim stands: nothing in the browser suite would have caught
this. `game-vm.test.mjs` passes with the bug in place, and a boot-only smoke
passes too, because `js/perf/loop-health.js` absorbs the per-frame throw (8
consecutive / 240 total, then it stops the loop) while `__apex.info().track`
keeps answering. The guard is the whole net for this class.

**The lesson is not about shadows.** Twice in one session an unverified claim
about test coverage went into a committed ledger entry, and the fix both times
was a two-minute control run. A claim that a test WOULD have caught something
is a claim about a test run that nobody has performed. Perform it, and run the
clean case in the same breath.

What caught it, before a single test, was
`tests/unit/global-registry.test.mjs`'s third rule — a call-time read must
resolve to some manifest global, a host name, or the `KNOWN_EXTERNAL_READS`
baseline. Fix: `const LT = LightTune.LT;` at `create()`. Verified live rather
than by inspection: instrumenting `GLX.shadowBegin` and recovering the sun
ortho half-width from the light VP, `LightTune.LT.shadowRange = 80` gives a
half-width of 80 and `= 30` gives 30, so the module reads the object the
tuner mutates. (`M4` is frozen, so patching `M4.orthoTo` to watch the box
silently no-ops — instrument the backend seam, not the math island.)

**The class, swept across the tree.** 158 real globals; game.js has 646
top-level names, of which 119 exist ONLY inside it as eval-time destructures —
`PhysicsConsts` 58 (`VMAX`, `ACCEL`, `BRAKE`…), `CarMesh` 15, `carDraw` 12,
`GameStore` 6, `LightTune` 3, `Teams` 2. Every one is a landmine for the next
extraction and every one fails LOUDLY: not a single game.js local shares a name
with a real global, so there is no silent-wrong-value variant of this bug, and
the guard sees all of them. Both shipped modules are clean under the same scan:
every name they read is a global, a `create()` parameter, or their own
declaration. The residual risk the guard cannot see is a create-time capture of
a REBINDABLE value — `const LT = LightTune.LT` is safe only because knobs.js
declares `const LT = {}` and mutates it in place (nothing in `js/` reassigns
it), whereas capturing `G.gfx` at create would freeze a null, since game.js
assigns `gfx` during boot. Rebindable state goes through the `G` getter; a
mutated-in-place object may be captured once.

**2026-09-10 — the renderer group on real Metal: 6 red -> 3, and what the 3 are.**
Three dispatched runs were needed to obtain a GPU verdict at all (the first two
were cancelled by hand). Run 3464 reported six failures with the adapter census
GREEN, so they are real-GPU results, not SwiftShader wearing Metal's name.
Four had causes readable from the run's own diagnostics and are fixed:

- `shadow.box` in `tools/lighting/ab-lighting.mjs` still named `js/game.js` for
  an expression the shadow-pass carve moved. MINE. Nothing local caught it: the
  assertion lives in a `gfx`-group browser spec, which the change-aware gate can
  never select. `tools/lighting/slider-effect.mjs` had the same miss with no
  test at all behind it.
- image-grade "blacks" read NaN because the governor's auto-res resized the
  framebuffer mid-test (scale 1 -> 0.7; captures 186,624 / 147,456 / 112,896 px;
  worst frame 8.5 s, 98 slow of 264). The suite diffs pixel ARRAYS, so `boot()`
  now pins the scale. Confirmed by run 3469: both captures 230,400 px.
- TLX M8 slept 600 ms then read `postState()`, whose block flags are written at
  the END of a pass and initialised false — so an early read says "every block
  off", which is what Metal reported WITH the governor at tier 0 and no
  shedding. That also kills the bloom-shed theory this ledger used to carry.
  Now a condition wait; green in 3469.
- lighting-ab pinned `floodEmit` at 0.78, but the code is
  `min(1, LT.floodEmitMul * 0.78)` and qatar|night|dry carries 0.11 —
  0.11 x 0.78 = 0.0858 exactly. Red on every runner since that palette moved.
  Now asserts the contract against the live multiplier.

**The three that remain are all "a real GPU is not SwiftShader", and none is
bent to pass.** Two were known; the third was hidden behind the first, because
the image-grade block is `mode: "serial"` and a failure skips the rest of it —
so fixing blacks REVEALED it rather than caused it:

| failure | on Metal | on this container |
|---|---|---|
| TLX M6 skid batch | premise holds (off-road, x=9.21, speed 29) but marks never record: `marks: 0, skidVerts: 0` | passes |
| lighting-ab night fog glow | foggy region comes back DARKER than dry (67.7 vs an 85.7 bar; 72.0 vs 104.8 on retry) and the dry reading itself moves run to run | passes |
| image-grade "shadows predominantly change dark pixels" | the knob moves BRIGHT pixels more: dark 35.7, bright 46.7, wanted dark >= 2x bright; darkSigned +34.8, brightSigned -44.1 | passes (verified 2026-09-10) |

Each needs an iteration loop on a Metal runner, which this container cannot
host. The rule that keeps them honest: never widen one of these tolerances to
get green — a software-GL pass is not evidence about a player's GPU, and a bent
bar would erase the only signal that says so.

**Re-read against the code (same day): two of the three were test defects,
and "a real GPU is not SwiftShader" was the wrong frame.** The image-grade diag
in 3469 carried the answer — `gov.tier 2, autoShed 2` on the first attempt,
`tier 4, autoShed 4` on the retry. A shadows-lift curve cannot darken
highlights by 44/255; `autoTier() >= 4` zeroing bloom/SSAO/godray
(`js/game.js` `po.*`) and `tier() >= 2` dropping SSR can. The test compared a
baseline at one tier with a "changed" frame at another. The fog test is the
same shape: `frame.lampFog` needs `frame.lights`, whose budget `tierShed()`
cuts at tier >= 1 (`js/lighting/frame-lights.js`), and the lamp halos are
bloom — the dry capture lands right after boot and the foggy one 3 s later on a
runner still shedding, which reads as fog darkening the sky and as "dry"
moving 10 points between attempts. Both pass here only because SwiftShader has
bottomed out at one tier before the first capture — a coincidence, not
evidence. And the scale pin from the previous entry made both WORSE:
`governor.js` falls straight through to the ladder once the scale lever is
gone ("the ladder is the only lever left"). No pin existed — `setUserTier` is a
floor. Added `PerfGov.setTierHold` / `__apex.govHold(true)` (no shed, no
restore), both specs hold the tier and assert it EQUAL at the two captures
before comparing pixels, so the next such failure names the governor.
M6 is not explained by this: `skids.draw` has no tier gate, the stamp lands on
the first laying frame (`js/fx/skidmarks.js`), and the premise numbers were
byte-identical to this container's — the timeout now dumps `state`, `offroad`,
`onKerb`, `skidIntensity`, `fxState()` and the governor so the next Metal run
says which link broke. Lesson for the table above: read the diag the failure
already printed before calling a failure hardware.

*M6, same day, from that diag run solo here:* `cam: "cockpit"` with every
gate term true (state race, offroad true, onKerb false, skidIntensity 0.5,
speed 29) and `marks: 0`. The stamp sat after the body draw, past the cockpit
rig's `continue` (`cockpitRigOnly`), and the shipped default camera is
`CAM_MODES[3]` = COCKPIT — so with the default camera the player never laid a
mark; rubber appeared only after a camera switch. A GAME defect, on every
backend and every GPU, that only the TLX spec happened to drive in the default
camera. Fixed by moving the stamp ahead of the branch (world state, not a
draw). The Metal "premise holds, marks never record" row above was this.
Confirmed on Metal by run 3477 (d6d05c7): M6 green in 32.7 s.

*Run 3477 also settled the other two rows — except that it did not settle
image-grade.* Run 3484 (faf182d) failed "shadows" again with `tier 0,
tierHold true`, scale 1, equal px, and the SAME numbers as 3469 (darkSigned
+34.8, brightSigned −43.4), and "blacks" read crushed blacks as +9.7
BRIGHTER on a retry after passing its first attempt. The tier was never the
image-grade cause (the fog and M6 stories above stand on their own
evidence). What moves between the two captures is the AI FIELD: boot()
parks the player and park() shoves the field 600 m back, and on a 30 fps
runner it drives back through the frame in the ~20 s between captures —
the bright-pixel set is 2 % of the frame and it is the cars. SwiftShader
at 1 fps advances the dt-clamped sim a few metres, so nothing enters and
the suite passes here. boot() now freezes physics (rendering and the grade
stay live) and the diag records the present generation and the freeze.
Run 3488 (496357e) then failed "shadows" FROZEN — `frozen: true`, gen 6 —
with the same numbers to a decimal (+34.87 / −43.34), and "blacks" read
+15.1 for blacks +1 and +10.8 for blacks −1: the changed captures are
brighter in the darks whichever way the knob goes. Knob-independent means
the two captures are of two SCENES, and the one thing that changes a parked,
frozen, clock-held scene by itself is the baked asset pack landing: its
texture-array upload replaces every procedural material, and the Metal logs
put it at 9-14 s after boot — inside a 30 fps box's boot-to-baseline window,
outside SwiftShader's. boot() now waits for the pack (uploaded, absent or
failed; a pack still in flight after 90 s is pinned off with matTex(0)) and
the diag records the pack state at each capture. Three wrong stories in a
row for this one test — tier, field, and now pack — each disproved by the
diag I had added for the previous one, which is the right way round.
Run 3493 (pack wait in): "shadows" red on BOTH attempts, pack uploaded at
the capture, same signature (+33.4 / −46); run 3495: red on attempt 1
(+32.4 / −38.6), green on the retry, job green — and the renderer job only
uploaded its report on failure, so the two JPEGs the test now attaches were
unretrievable exactly when they mattered. The upload is `always()` now,
and the diag records the capture state at the baseline as well as the
changed frame. Open: a deterministic-looking hardware-only signature that
comes and goes per ATTEMPT (a fresh worker each retry) — the pictures from
the next run are the next step, not another theory.
The pictures (run 3497, `shadows-baseline.jpg` / `shadows-changed.jpg`
attached by the test): the BASELINE is crisp and bloomless — hard halo
edges, no glow on the LEDs — and the CHANGED frame is soft and bloomed. Two
post chains, not a grade; here both captures are the soft kind. post.js now
records what each present() actually did (`_lastPath`: fxaa, upscale,
toLdr, bloom, ao, the readback buffer) and the diag carries it for both
captures, so the next hardware failure names the pass that differed.
Run 3500 (17bbf07) never got there: after 12 green TLX tests both workers
wedged in Playwright's "Create context" — before any spec code ran — and
sat 25 min each on the 30 min per-test budget (`--timeout=600000` x
test.slow()); cancelled by hand. A Chromium/GPU-process hang on the macOS
runner, not the diff. Re-dispatched as 3504: 48/48 green, no retries —
the first clean Metal run; "shadows" passed first time, so it is an
intermittent, and the post-path diag prints when it next fails.

*The Linux Smoke matrix on a `gfx` dispatch (runs 3495 and 3497, shard 4,
75-78 min each):* the six lighting tests timed out identically both times
— `applyRaceSettings tod=night` 226 s after page load, `wx=fog` 353 s, the
45 s boot waits and 420 s budgets long gone — and webgl-probes passed at
82-135 s a test. No assertion fired in either run; the box is ~10x this
container and the group's only real signal is the Metal job.
The fix was in the tests, not the matrix: not one of those six reads a
pixel — five assert the tuner's DOM and lightTune() state, the sixth
lightState().exposure — and `__apex.headless(true)` skips render()
outright. Booting them headless took the seven state-only tests (the
"weather() applies lighting live" one included) from ~3 min each here to
61 s for all seven; the fog-floor test alone went 726 s → 20 s. The M4/M8/
M9 budget-aware waits are capped at 300 s so the gpu config's 600 s x
test.slow() cannot let a dead probe burn 30 min per attempt. Skipping the
Smoke matrix for renderer groups stays on the table for the pixel specs,
no longer urgent. Measured on run 3505 (ef46b9e): all four Linux shards
green, shard 4 in 11 min (was 75-78).

*Run 3505's Metal job* moved the image-grade intermittent again: "blacks"
attempt 1 (crushed +9.7, the same brighter-either-way number as 3484/3488)
and "red gain" on its retry (green and blue moved 19.5 alongside red: a
whole-frame change, not a channel gain) — neither carried the post-path
diag, only "shadows" did. And the PASSING shadows pair the run attached is
crisp in BOTH frames — no bloom, hard halo edges, the lift visible in the
cockpit — so on Metal the ordinary capture is the crisp kind and a failing
pair is one where a capture came out soft and bloomed; here both are
always soft. All four two-capture tests now share one helper: frames
attached, capture state (gen, freeze, pack, post path) at each, and the
premise — same tier, same post path, a newer present — asserted before
any tonal maths, so the next failure names the pass that flipped.
Run 3509 (87720ea, the merged head) answered: "blacks" failed on both
attempts WITH THE PREMISE INTACT — `cap0.post` and `cap1.post` identical
(fxaa true, upscale false, toLdr true, bloom 0.6, ao 0.95, readFb
"default"), gen 4 → 6, frozen, pack uploaded — and crushed blacks read
+10.9 brighter, then +5.9. Not two post chains. The tell is
`readFb: "default"`: with FXAA on, the soft-present readback reads the
DEFAULT framebuffer after the draw. SwiftShader keeps that buffer; on
ANGLE-Metal with preserveDrawingBuffer false it is a swap-chain surface
whose contents after the draw are not guaranteed — hardware-only,
attempt-dependent, knob-independent, and a "changed" frame that looks like
a differently composed buffer (3497), all of it. The readback must read an
FBO the chain wrote, never the default framebuffer.
The "Create context" wedge recurred on the same run (2 of the last 4
Metal runs), both times while the other worker was inside M9's env probe;
the job sat 27 min on the 30 min per-test budget before a hand cancel.
The Metal job runs ONE worker now (two Chromium instances on one shared
GPU is the common factor of both wedges). And one more premise on the
image-grade pair, the last thing that can change a frozen, clock-held,
pack-loaded frame by itself: the env probe's ready state — on hardware
the cube is real and its reflections brighten the dark cockpit interior,
exactly the range "blacks" reads; SwiftShader clears the faces.
Run 3515 (8fbbdf3), the first with one worker: 48/48, no retries,
10.0 min — no slower than the two-worker runs (10-15 min), and no wedge. The fog-glow row stayed red WITH `tier [0,0]` —
dry 80.1, foggy 72.6, the same −9 % this container reads (65.4 → 60.1) — so
it was never the tier either: the sampled band is pure sky, the sky shader
carries no lamp-fog term (`glsl-sky.js`), and what the test measured was the
night-fog exposure floor, cut from the daytime 1.08 to 0.95 on 09-08 ("night
must stay night", the sibling test in the same file) plus the +0.35 cloud
cover fog adds. Two tests in one file asserted opposite things about the same
pixels; the glow one was measuring exposure. Rewritten to A/B the lamp-fog
knobs on one fogged frame (below). Two more from the same run: M9's env
probe reached face 2 of 6 in 60 s at tier 0 because the page rendered THREE
frames in that window (one 93 s frame — three's WebGL2-on-ANGLE program
compile); the Linux smoke shard died the same way at face 4 (56 s frame).
The producer runs every 4th frame live and EVERY frame frozen, so the spec
now freezes the parked car first — and the wait counts PRESENTS (ten past
the park, on what is left of the test's budget), not seconds: frozen, this
container still stood at face 5 with seven presents in a 60 s clock (one
73 s frame) while a parallel worker ran. image-grade red gain read 26.2 vs
a 29.6 bar once and passed its retry with no diag; it carries one now.
M8's 30 s post-chain wait burned a retry on both Metal runs (3477, 3484) at
42 s with the chain not yet presented once — the same first-frame compile —
and now spends the test's remaining budget like M9.

The fog-glow rewrite: one Singapore night-fog frame, clock held, tier held,
physics frozen; `lampFogBase`/`lampFogHaze` A/B'd OFF/ON/OFF/ON on the mid
band (distant facades and the fog wall, where the fog factor is largest);
the glow must add ≥ 3 % both times. Green here on the first run; the A/B
numbers attach to the report as `fog-glow-ab` on a pass too. What the
throwaway measurement before it showed, for the record: with raw
`page.screenshot` (no wait for a fresh present) three captures of one scene
read 60 → 78 → 82 with only time between them — a capture that lags the
knob write is a measurement of nothing.

### 2026-09-18 — two `steering.spec.js` ASSERTIONS are red, and the table above is stale about it

> **RESOLVED 2026-09-22 — the sign was inverted and the comment absorbed the bug.
> `symmetry` self-resolved (green on CI twice today); `curvature drift` was a
> real defect in the TEST, fixed. The section below is the diagnosis as it stood
> on 09-18 and is left intact; the resolution is the "2026-09-22 — a test that
> steered off the circuit" entry further down.**

The 2026-09-14 row reads `9 (steering.spec.js) | every one 103-142 s against a
120 s test timeout | box, not code`. That population was fixed at source in
`20e57ea174` (rAF-starved actionability, now DOM clicks). These two are not
that: they are assertion failures with stable numbers, and the row above reads
as "steering is a box problem" to anyone who greps this file for it.

Measured on the deploy tip `5a1a07fc`, alone, `--workers=1`, loadavg < 1 — so
NOT the box, by the same standard the 2026-09-14 entry sets:

| test | expected | received |
|---|---|---|
| `steering has authority to fight the curvature drift` | > 2 | **0.22689791898006817** |
| `symmetry: opposite inputs turn the heading by opposite, equal amounts` | < 0.012237385817734392 | **0.0254971875287886** |

**THE TWO HAVE DIFFERENT AGES, and that is the useful part.** Re-run in an
isolated worktree at `bdec4b123f` (2026-09-17 ~12:00, about 24 h earlier):
`curvature drift` fails there with the BYTE-IDENTICAL 0.22689791898006817, and
`symmetry` **passes**. So one is ≥ 24 h old and stable, the other regressed
inside a one-day window. Bisecting them as one thing would be a waste.

Why nothing reported either: `steering.spec.js` declares a 480 s test budget
against the change-aware gate's 180 s cap, so `select-specs.mjs` EXCLUDES it on
every push; its group `test:input` gets scheduled coverage only from the
nightly rota, which reaches `input` on **2026-09-22**. The rota (landed
2026-09-18, `tools/ci/nightly-group.mjs`) is what will surface these — this
entry exists so that night is a bisect of one day and a characterisation, not a
rediscovery from zero.

Not yet diagnosed, and deliberately not guessed at here. Two facts to start
from: the `driving-model` characterization job is GREEN on this tip, so
whatever moved is outside `physics-baseline.json`; and `curvature drift`
measures the DRIVER's authority with `roadFollow: 0`, where held lock moves the
car 0.23 m further than coasting over 75 ticks at 22 m/s against 2 m wanted —
so either its premise moved under it (as `OVERALL SPEED`'s hardcoded "straight"
did above) or player steering authority is genuinely near zero with assists
off, which the physics reference makes a product defect, not a test one.


### 2026-09-22 — a test that steered off the circuit, and eleven nights between it and anyone noticing

> **THE SPEC CHANGES BELOW WERE REVERTED OFF THE DEPLOY BRANCH THE SAME EVENING,
> and the reason is the more useful record.** PR #206 merged with `road-follow`
> still flaky. The Pages gate selects specs against the last PUBLISHED tree, not
> against the parent commit — so an edited `steering.spec.js` stays in the
> unpublished delta and is re-selected on EVERY Pages run until something
> publishes. `road-follow` then failed the gate on `66c24cef0` and again on
> `ed24bdfe7` (another session's commit), with `publishable`, `deploy` and
> `verify-live` skipped behind it each time. The train was down for every session
> on the branch, and it could not recover on its own: the file only leaves the
> delta once a publish succeeds, and `road-follow` had passed 1 of 5 CI attempts.
>
> So the spec was restored to its last published state to unblock the branch. The
> `curvature drift` sign fix and the `roadFollow 0.7 -> 0` restore go back on once
> the isolation flake is fixed; the diagnosis below is what they should be
> re-landed from. `deploy.mjs`'s `nightlyHealth()` and `--train` are unaffected
> and stayed.
>
> THE LESSON, which cost a stuck train to learn: a merge is not the last gate. A
> PR that is green because a flaky test happened to pass will be re-run by Pages
> against a different base, and on a shared deploy branch the cost of losing that
> coin flip is everyone's, not just the author's. "Green by luck" is not green,
> and saying so in the merge message does not make merging it sound.
>
> **Two more isolation defects to re-land with them** (found on PR #207's CI,
> 2026-09-22; the edits were withdrawn from that PR for the same train reason):
> 1. `road-follow` resets `roadFollow` to 0 only AFTER its loop, so a failed
>    expect leaves the assist at 0.6 on the worker-scoped page for every later
>    test (PR #207 run 35782782159: `racing-line assist off by default` 0.92 m
>    and `curvature drift` failed behind it). Fix: the reset in a `finally`.
> 2. `racing-line assist off by default` compares two identical runs, but
>    `jump()` resets only the player: the live field reaches the first corner
>    between them (0.92 m, a pass, then 1.52 m on one commit). Probed on
>    bahrain: a car within ~10 m moves the result; with every AI car
>    `aiPlace(i, frac + 0.5 + i * 0.004, 0, 0)`d before EACH run, 24/24 runs
>    were identical, and the file then passed that test and PULL/PUSH on CI
>    (run 35789365205). `curvature drift` runs unfrozen in the same corner and
>    ended in the wall (x -8.1, speed 0.96 → 1.81 < 2): it wants the same
>    freeze + field clear.


`steering has authority to fight the curvature drift` held lock with
`lockDir = Math.sign(k0)`. Under the measured convention `+k` is a LEFT turn, so
`+sign(k)` is the **outside** of the corner — the test's own sibling
(`road-follow`) asserts exactly that, `expect(Math.sign(dxOff)).toBe(Math.sign(off.before.k))`
for a car with no input running wide. So a test named *fight* the curvature drift
was steering a no-assist car FURTHER toward the outside, at 22 m/s, for 75 ticks.
It left the circuit inside the measurement.

The failing state says so, and says it identically on two machines:
`x = -8.100000381469727` against `hw 6.6`, `speed 0.0005 m/s`, `rescueT` climbing
past 0.68 — `js/game.js:6047`'s beached-and-stuck arm. Being a property of where
the car stopped rather than of the physics, the reported number wandered while
the code did not: **0.227** (dev box 09-18), **0.262** (dev box 09-22), **1.738**
(CI llvmpipe 09-22), on a deterministic fixed-timestep sim.

**Measured both directions** at the corner the test picks (bahrain, k0 -0.0204,
hw 7.00) — authority in metres, and whether the car was still on the circuit:

| regime | outward `+sign(k)` | inward `-sign(k)` |
|---|---|---|
| 13 m/s, 45 ticks | 0.764 on-road | 0.801 on-road |
| 13 m/s, 75 ticks | 1.587 on-road | 2.064 on-road |
| 22 m/s, 45 ticks | **-2.823** on-road | 4.069 on-road |
| 22 m/s, 75 ticks (the test's) | **-16.389 OFF-ROAD** | **9.505 on-road** |

Inward is monotonic and positive at every regime. Outward goes negative and
diverges.

The fix is the sign **and** the hold length, and the second half was found by
the guard rather than guessed at. With `lockDir` corrected and an on-road
assertion added, the first verification run failed on the **coasting baseline**:
`coasting ended 7.68 m off the centreline against a 7.00 m half-width`. Running
wide IS the drift this test is named after, and 1.25 s of it at 22 m/s leaves
the circuit with no input at all — so at 75 ticks there was no on-road
measurement to be had in EITHER arm, and the old assertion had been differencing
two excursions. At 45 ticks the baseline sits at x ~ -3.2 inside hw 7.00 and the
inward reading is 4.069 m, twice the floor. **Speed unchanged (22 m/s), floor
unchanged (2 m)** — shortening a hold until the car is still on the road is what
makes the number mean anything; widening the 2 m floor would have been the
tolerance change rule 9 forbids. The on-road guard stays, so this can never
silently grade an excursion again. Verified: the test passes (113 s on this
container), and the guard is proven live — it is what failed the first attempt.

**How the comment absorbed the bug is the transferable part.** When the curvature
convention was re-measured, the note at this line was rewritten to say
"`lockDir = +sign(k)` was named 'inward' when '+k = right-hand corner' was
believed; under the measured convention it is the outside. The assertion never
cared which side." The prose was updated to describe the new meaning of the old
code, and nobody re-derived whether the code still did what its NAME said. It
did not. A convention change is a change to every site that reads the
convention, not a documentation task.

**Why it sat red for five days**, which is the larger defect: `steering.spec.js`
declared `test.describe.configure({ timeout: 480_000 })`, and `select-specs.mjs`
excludes any spec declaring `>= SELECTED_GATE.perTestTimeoutSec` (180 s). So the
change-aware gate skipped it on EVERY push and its only scheduled coverage was
the nightly rota — `input` once every eleven nights. That night was 2026-09-22.
It ran, Smoke shard 1 FAILED on exactly this test, and the RUN reported
`cancelled` (two unrelated jobs were cancelled eight minutes later; `cancelled`
outranks `failure` in GitHub's rollup) — which AGENTS.md rule 8 tells every
session to read as a timeout. The one finding the rota exists to produce was
filed by the tooling as "the box was busy".

Both halves are fixed. `deploy.mjs` grew `nightlyHealth()` and a `--train` flag
that query the SCHEDULE event and report the JOB list rather than the rollup,
so every deploy now prints what last night's rotating group actually found. And
the 480 s declaration was re-measured: the figure predated Mesa llvmpipe
replacing SwiftShader on the browser jobs, and nothing in the file has needed it
since. Measured today — CI llvmpipe slowest test **26.2 s**; this container on
SwiftShader, one worker, slowest **139.9 s** (13 tests, 10 m 02 s wall;
road-follow 68.0 s, against the 343.5 s the header claimed). Now 170 s: clears
the slowest case by 21 % and is under the gate's cap, so `select-specs` selects
the file again (its own OVERSIZE shard, 13 tests).

**STILL OPEN, with two fixes refuted by measurement and the re-time held back
behind it.** `road-follow, when switched on, is active and changes the cornering
line` fails deterministically on this container at `0.15284059935810101` against
a `> 0.25` floor, and intermittently on CI — green twice on 2026-09-22 (32.0 s
and 22.8 s in the rota's `input` group), red on the very next run in the selected
gate. Same circuit every time (bahrain), deterministic fixed-timestep sim.

It was briefly QUARANTINED here and that was wrong on both counts: quarantining a
test to get a PR green is forbidden outright, and the quarantine note contained
the fix for the probe runs that had failed — "give the probe its own
`test.setTimeout`" — which had never been tried. One line; with
`test.setTimeout(900_000)` the sweep ran first time.

What the sweep measured, per sampled corner, `|on.x - off.x|` against the floor:

| frac | k | coast | throttle held | end speed |
|---|---|---|---|---|
| 0.0290 | 0.0092 | 0.3194 | 1.5084 | 3.81 -> 18.48 |
| 0.0676 | 0.0149 | 0.5645 | 1.5634 | 3.95 -> 18.20 |
| 0.1872 | 0.0162 | 0.5435 | 1.1058 | 4.71 -> 18.32 |
| 0.3618 | 0.0065 | 0.1676 | 0.8677 | 5.68 -> 17.99 |
| 0.4064 | -0.0102 | 0.1994 | 0.8896 | 5.79 -> 18.32 |

**Fix 1, holding throttle, was refuted by the full-file run.** It lifts the
weakest corner from 0.1676 to 0.8677, but at ~18 m/s the car ends ~2 km
downrange: the test went to 199.3 s against its own budget AND `racing-line
assist: PULL eases toward the line, PUSH sends it wider` broke two tests later
(8.066 against `< -0.2`) through the shared page. A regime change that leaks into
its neighbours is not a fix — and only the FULL-FILE run caught it; a single-test
run would have shipped it.

**Fix 2, raising the corner filter 0.012 -> 0.014, was refuted by the number
itself.** The reasoning was that the assist's effect scales with curvature and
crosses the floor near that threshold, so a corner drifting across it decides the
verdict. Plausible, and wrong: with 0.014 the test failed with the
BYTE-IDENTICAL 0.15284059935810101. The failing corner therefore has |k| >= 0.014
and is not in the table above at all.

**Which is the real finding: the probe never reproduced the bug.** Instrumenting
the loop removes the `continue`, so both arms run at every corner — and that
changes the shared page's state, hence which corners the real test then samples.
The measurement above describes a different corner set from the one that fails.
Any fix derived from it is guesswork, which is exactly what the two attempts
were.

**A REAL ISOLATION LEAK WAS FOUND AND FIXED HERE, and it is NOT what makes
road-follow fail.** Both halves matter.

The quarantine commit's own CI run is what exposed it. On `e66f1e406`, where
`road-follow` was `test.fixme`'d and did not run at all, the `oversize-steering`
shard STILL failed — on a different test, `racing-line assist: PULL eases toward
the line, PUSH sends it wider` (run 35769571096, 13/13 done, 1 failed). Locally
the same pattern appeared whenever `road-follow`'s behaviour was perturbed:

| what road-follow did | racing-line assist |
|---|---|
| ran as-is (failing at 0.1528) | passes |
| skipped entirely (`test.fixme`) | FAILS on CI |
| ran with throttle held (car ~2 km downrange) | FAILS, 8.066 |
| ran checking fewer corners (filter 0.014) | FAILS, 5.773 |

The cause was a one-line bug in `steering has authority to fight the curvature
drift`: it restored `roadFollow` to **0.7** when the shipped default is **0** —
which "by default nothing steers the car" two tests earlier pins explicitly.
`sharedTest` keeps ONE page per worker, so that wrong restore left the
DRIVING-HELP assist switched on for every later test landing on the same worker,
and which tests those are moves with the shard's worker assignment. A
deterministic suite whose result changes between runs, from one wrong constant.
`road-follow` restored to 0 correctly; this was the only site that did not.

Fixed, and verified: with the restore corrected the full file goes from two
failures to one — `racing-line assist` passes and only `road-follow` remains.

**But road-follow itself is unchanged by it**, still failing at the same
`0.15284059935810101`. So the leak was a genuine second defect that the
investigation surfaced, not the explanation for the first. Two things were wrong;
one is fixed.

**The experiment that is actually owed:** reproduce WITHOUT changing the loop's
control flow. Leave the `continue` in place, add only a write of `frac`, `k`,
`dxOff` and the diff for the corners the test itself checks, and give the test
its own `test.setTimeout`. Then the failing corner is named and its regime can be
judged. The deeper suspect is `sharedTest` page reuse: the car's `s` carries
across tests, `k` is read at the car's exact `s`, and every change made here
perturbed a later test — which is a test-isolation defect, not a physics one.

**Consequence for the gate: the 480 s -> 170 s re-time is HELD BACK.** It is one
line and it is ready, and it is what closes the eleven-night blind spot that let
the curvature-drift sign error live. But it puts this file into the BLOCKING
gate, and landing it while `road-follow` fails would turn every push touching
`js/input/` red for every session on the shared branch. The measurement behind
the re-time stands (CI llvmpipe slowest 26.2 s, this container 139.9 s, against a
declared 480 s); the blocker is the test.

`symmetry: opposite inputs turn the heading by opposite, equal amounts` is
**green**, twice on CI today (1.8 s and 1.3 s). It regressed inside a one-day
window on 09-18 and has since been fixed by someone else's change; recorded so
the next session does not bisect a resolved failure.

15 other specs still declare over-cap budgets (props-over-road and
terrain-over-road at 1500 s, image-grade-visual 480 s, lighting-ab and
instanced-draw 420 s, …). Each is the same bet this one lost. 61 of 119 specs
were never selected in the 30-day window `spec-staleness.mjs` measures.

## 8. Backlog

Deferred with reasoning, none lost:

- **game.js extraction candidates**, ranked by boundary crossings (§4): garage
  live preview ~415 ln (blocked on a car-drawing seam), camera disclosure
  ~324, pre-race screens ~261, liveries ~161, sky state ~107. (Cam modes was
  taken: `js/camera/mode-switch.js`.) The 2026-08-13 structure panel re-affirmed
  this list as the live decomposition plan and made it **forced rather than
  optional**: both ratchets are saturated (`js/game.js` and `js/agent/apex.js`
  each sit one line under their ceiling), so the next net-positive edit to
  either file fails the suite. Candidates may be **added** only after
  re-measurement by function body (brace count) — the gap-to-next-function
  method inflated `endRace` from 64 lines to "383" by attributing the
  un-extractable `G` façade block to it, and figures derived that way are
  discredited. The `updateCar()` and `render()` megablocks stay fenced.
- **`wrapDelta` / shared `clamp`/`lerp` — RESOLVED.** All three now live on
  `M4` (`js/core/mat4.js`, the 2nd script tag, so every consumer including the
  deferred backends can bind them at eval; they hang off the existing global
  rather than becoming a third one). Consumers ALIAS
  (`const clamp = M4.clamp;`), so hot paths keep their old call shape. 16 clamp
  copies, 6 lerps and 5 of the 7 arc-wrap sites migrated;
  `tests/unit/shared-math.test.mjs` pins the semantics and RATCHETS against a
  new private copy. The divergent `js/track/scenery/structures.js` clamp
  (`Math.max(lo, Math.min(hi, v))`) was **not a bug** — the two forms differ
  only above an inverted range, on `-0`, and on a non-number argument, and all
  eight of its call sites pass finite numbers with `lo < hi`; migrated anyway,
  proven vertex-for-vertex by `tools/track/graph-parity.cjs --all`. Deliberately
  LEFT inline: `updateCar()`'s signed wrap (physics inner loop, and its
  characterization golden is a browser spec), and `headInterp`/`yawVisInterp`,
  which fold an unbounded heading and need a loop rather than one fold.
- **Elevation-profile drawing duplicated in `js/ui/select-screen.js` — RESOLVED.**
  One local `drawElevProfile(cv, t, showEl)`; the only real difference between
  the two blocks was which element carries the `hidden` state.
- **`simTilt`/`tiltSteering`** now share `tiltTarget()`/`tiltSlew()`;
  `tests/specs/tilt-pipeline.spec.js` pins every stage so the next re-inlining fails.
- **Mobile-tier detection ×4 — RESOLVED.** `js/render/glx/glx.js` is the one copy
  and exports `isMobile` / `mobileTier`; `liverytex.js`, `wgx.js` and
  `js/game.js` read it. glx.js is the 11th tag and the deferred backends load
  last, so the value is always there. This fixes the defect the entry names:
  `js/game.js` re-sniffed navigator without `forceMobileTier`, so a desktop
  with the flag set still loaded an alternate backend — the "phone" path under
  test was never the phone path.
- **`TUNE_DEFS` hand-mirrors** — the registry is restated in six places.
- **`GameStore` cross-tab — RESOLVED.** `store.onForeignWrite`, armed by the
  module itself on `window.storage`. Not a merge (two divergent career saves
  have no defined join): a foreign `apex26.*` write drops that ONE cached key
  so the next read goes to disk, and bumps `rev`; a foreign `clear()` empties
  the cache. An unrelated key stays cached — invalidating everything would put
  `getItem`/`JSON.parse` back in the render loop, which is why `_cache` exists.
  Counted in `__apex.persistState().foreign`; pinned by
  `tests/unit/store-cross-tab.test.mjs`.
- **Assertion-free specs** — RESOLVED. `tests/specs/ui-audit.spec.js` (34 tests, 0
  `expect`) and the former `ui-desktop.spec.js` (5/0) were screenshot galleries
  presenting as tests. The second is now absorbed into the first as two more
  viewport rows, and the survivor is declared a capture harness: its own
  `test:gallery` group, run on demand, out of `test:ui`'s pass count.
  `tools/ci/assert-audit.mjs` now grades every test in the tree
  asserting/implicit/vacuous and `tests/unit/assert-audit.test.mjs` fails on a
  vacuous body anywhere outside that one allow-listed file.
- **`tests/manual/tracks-visual.spec.js` baselines were never generated** — the spec
  is skip-gated on the snapshot dir existing; generating 40 circuit baselines
  on Linux/SwiftShader is its own operation.
- **Catalogued dead exports — VERIFIED, and mostly not dead.** The ~60-item
  catalogue was walked in four batches before anything was deleted, and the
  verification is the finding: three of the renderer identifiers it listed
  **never existed in this branch's history** (they live only on a non-ancestor
  commit — the catalogue was written against a different lineage), and its claim
  that `assets.js` consumes `gltf.js` is false today. Most entries resolved to
  ALREADY-REMOVED, LIVE, or contract-pinned: `Career.isOwned` is live through
  three skill docs' console use, `TrackSpline.centerline()` and the authored-
  `segs` path are dormant **by design** (eval-time destructure, 25 circuits
  carry `segs:`, the new-track skill documents it), and the SRTM elevation
  branch is a guarded feature slot with a shipping bake tool. What was genuinely
  dead has been trimmed: `GLTF.load` and `Reliability.levels` deleted outright,
  plus export-object entries in `reliability.js`, `store.js`, `lighting.js` and
  `light-store.js` whose functions stay because they are internally live.
  Remaining owner decisions, evidence gathered but not acted on:
  `js/track/scenery/themes.js`'s `variants` tables (zero readers anywhere) and
  `CarMesh.getBoostFlame`.
- **The CSS class-count ratchet is installed; the collapses are not finished.**
  The 2026-08-13 panel recorded its non-installation as execution debt; a
  ceiling now exists in the ratchet idiom (`tests/data/ratchets.json`), alongside a shell
  node-count ceiling guarding the premise the keep-the-monolith ruling rests
  on. The first three one-surface collapses took the count 543 → 537; the
  remaining clusters are ordered **behind** the zoom/data-density migration
  where they touch the same surfaces.

---

- **`tlx-probes` M6 skid batch is red, and it predates this session's work.**
  The spec drives a hard slide on Monza, `freeze(true)`s so presented frames
  stamp, then waits for `GLX.__tlx.fxState().skidVerts > 0` — which never
  arrives, so the test hits its 360 s budget. A/B on a QUIET box: red at the
  session tip AND byte-identical red at the pre-batch commit `1aaf91b3`
  (same `page.waitForFunction ... Test timeout` signature), so nothing in
  the W4 near-miss batch caused it. ~~Note the coverage gap it exposes:
  `tlx-probes` is in no CI job~~ **CORRECTED 2026-09-15: it IS in one** — the
  `gfx` group (`tests/groups.json`), which runs on macos-latest, the one runner
  image with a hardware adapter. The accurate gap is narrower and still worth
  stating: that group runs on renderer diffs, nightly, or dispatch — NOT on the
  Pages deploy path — so a TLX regression can ship and only surface overnight.
  Diagnosing the skid batch needs a real GPU (a SwiftShader probe here is not
  evidence about `fxState().skidVerts`), i.e. a ci.yml dispatch on macos-latest
  rather than local work. Either TLX's fx path stopped
  stamping skids, or the spec's freeze-then-present premise no longer holds
  on the TLX backend — deciding which needs a TLX render trace, not a
  tolerance change. The other 14 TLX probes pass, including every shadow
  spec.

---

- **The garage double-blip was TWO bugs sharing one symptom, and only fixing
  both stopped it.** Reported 2026-09-10 as "two sounds when I click a button"
  in the part selector. The first, fixed in `5b2090177`, was a locked row:
  `Career.research()` succeeding played `uiSelect`, then the fit below played
  `uiSelect` again — one click, two blips of the SAME sound. Deleting the first
  would have been wrong (the unlock can succeed and the fit still refuse on
  budget, returning early, and that blip is that path's only feedback), so the
  contract became "at most once" via a `_blipped` latch. The user then reported
  it was still happening **on parts, not categories**, which is exactly the
  discriminator that finds the second: `framePreset()` frames the camera on the
  fitted part with `b.click()` on the view button — a SYNTHETIC click that
  replays that button's whole handler, `uiTick` included. So the fit sounded
  `uiSelect` and the camera sounded `uiTick`: two DIFFERENT sounds, which is
  why it survived a fix aimed at a doubled one. Deleting the handler's `uiTick`
  would silence a real press of that button, so the mute belongs at the
  synthetic call site (`G.soundOn = false` across the click, restored in a
  `finally`; `click()` dispatches synchronously, so the window is one
  statement). The livery editor's own `hero.click()` was the same shape and now
  routes through the same silenced helper. **The lesson is the discriminator,
  not the fix**: "still happening, on X not Y" is a bisect the reporter has
  already run for you, and the second cause was found by taking it literally
  rather than re-examining the first.

---

- **The four `gamepad.spec.js` failures logged above as OPEN do not reproduce:
  the file is 27/27 green (re-measured 2026-09-14, later the same day).** The
  entry above reads them as a real button-path defect — "the pad reads as
  absent: `Input.throttle()` false on button 7, analog trigger 0" — and that is
  the part that does not hold. Measured individually on a quiet box: both
  trigger cases pass in 2.8 min, the edge-trigger and HUD-button cases in
  4.2 min, the whole file in 10.4 min.

  The entry is left standing rather than edited, because HOW it went wrong is
  the useful part. Its own numbers say it: nine `steering` failures at
  "103-142 s against a 120 s test timeout" and two camera ones at "146 s / 44 s"
  are all budget, and the four gamepad cases are among the slowest in the group
  — so a `test:input` GROUP run on a loaded box produces exactly this shape.
  A group-level red was then attributed to a specific code path, and the
  attribution came with a plausible mechanism, which is what made it stick.

  **This is the same mistake as the `ui-button-touch` misdiagnosis recorded in
  TESTING-FIELD-NOTES the same day, pointing the opposite way.** There, four
  real test bugs (a wrong `selectOption` value, two tests outliving a redesign)
  were written off as the SwiftShader actionability stall. Here, slow tests were
  written up as a button-path defect. Both took a failure's SIGNATURE for its
  CAUSE, and both cost a later session an investigation. A group verdict is
  evidence about the GROUP; before a failure earns a named mechanism, re-run
  that spec ALONE.

  One hypothesis was eliminated before measuring, kept so it is not chased
  again: `pollGamepad()` returns early behind a 60-frame reprobe gate while
  `padConnected` is false, and the spec's `poll()` helper calls `Input.poll()`
  exactly once — which would look exactly like an absent pad. It cannot fire:
  the helper dispatches `gamepadconnected` first, and that listener
  (`js/input/input.js:2036`) sets `padConnected = true`.

  Still genuinely OPEN from that entry, and untouched here: `sliders › OVERALL
  SPEED`, where the car tops out in gear 5 of 8 and its sibling measures
  14.75 m/s against a > 76.5 expectation, over 1200 fixed sim ticks with no
  wall-clock dependence. That one is not a budget artefact and deserves the
  session the entry asks for.

---

- **The `sliders › OVERALL SPEED` entry is stale too: both cases pass.**
  Re-measured 2026-09-14 — "reaches the full gearbox and dial at every setting"
  and "clears the old top-gear limiter in MANUAL gears" pass together in 2.1 min,
  run alone on a quiet box. The whole file is 22/22 in 7.2 min, which also covers
  the third-case fix below.

  This one had to be MEASURED, not reasoned about, and the entry above is right
  about why: 1200 fixed `__apex.step(1/60, 60)` ticks is pure sim time with no
  wall-clock dependence, so "the box was loaded" could not have explained it the
  way it explains the four gamepad cases. It was the one claim in that entry that
  deserved a real investigation. The answer is that the fix had already landed —
  `straightFrac()` asks the track for its straightest point instead of standing
  at a hardcoded frac, because held at zero steer a car planted on a bend runs
  wide inside the first second, hits the off-track floor, and plateaus near half
  of vTop reporting **gear 5 where the test wants 8**. That is the reported
  symptom exactly, and it is a statement about where the test stood, not about
  the powertrain.

  **What the re-measurement did find is the quieter half of the same bug.** A
  THIRD case, "OVERALL SPEED lifts BOTH the player's and the AI's top speed",
  was still doing `park(0.0)` / `jump(0.0, 0, 0)` long after the helper landed —
  and PASSING, because it only asserts `fast > slow + 5` and running wide costs
  both samples about equally. So it measured from wherever frac 0.0 sits rather
  than from clear road, and would have become a real failure the moment someone
  tightened the assertion or the geometry moved under it. Now fixed to take the
  straight like its two siblings.

  The lesson worth carrying: a green test can still be measuring the wrong
  thing, and a relative assertion (`fast > slow`) will hide a systematic error
  that biases both sides. When a bug is traced to a hardcoded position, grep for
  the other hardcoded positions in the same file before closing it — two of the
  three here were fixed and the third was left, which is how it survived.

## FIXED — estoril scenery emitters did not land where their names say (2026-09-22)

Found while fixing the Parabolica's bank and gravel apron (PR #188). The
apron fix is landed and correct; this is the larger thing underneath it, left
open deliberately rather than half-moved.

**Measured, not inferred.** `def._sceneryShift` is 0.85616 for estoril, and it
applies UNIFORMLY to both scenery frac forms — verified against
`track.props.spans`, which reports emitted engine fracs:

| emitter (authored) | predicted engine | emitted span |
|---|---|---|
| `tyreWall(0.880, 0.925, -1)` | 0.7362, 0.7812 | **0.7360, 0.7810** |
| `fence(0.95, 0.06, -1)` | 0.8062, 0.9162 | **0.8060, 0.9160** |
| `guardrail(0.94, 0.06, 1)` | 0.7962, 0.9162 | **0.7960, 0.9160** |

Four-decimal agreement, so the shift is not in doubt. What IS wrong is that the
authored numbers do not put emitters on the features they are named for:

- `estoril-t1-gravel`, authored `K(0.078)`, emits at engine **0.934** — inside
  `pitLaneSpan` (sIn 3879.7 m, len 370 → engine 0.937-0.027), which is why it is
  suppressed "superseded by the pit complex". T1's apex is engine 0.1162.
- `estoril-stand-esses`, authored `K(0.140)`, emits at engine **0.996** — also
  in the pit lane, likewise suppressed.
- The Parabolica dressing cluster (gravel, tyre wall, spectator hill,
  billboards, marshal post; authored 0.865-0.935) emits at engine
  **0.721-0.791**. The Parabolica itself is engine 0.782-0.8635 (337 m of
  sustained curvature, R 122 m at the centroid), so the cluster dresses T13 and
  the approach and stops where the corner starts.

**No single frame reconciles them.** Read as engine-frame, `t1-gravel` at 0.078
is a sensible approach-to-T1 placement but the Parabolica cluster at 0.865-0.935
lands past the corner on the straight. Read as pre-start-line-move authoring,
T1 would be authored 0.260, which no emitter uses. So this is not one constant
to correct; the file appears to mix frames per emitter.

**Why nothing was moved.** The obvious correction — shift the Parabolica cluster
by +0.0663 authored so it covers engine 0.782-0.8635 — drops it squarely on the
pit complex, which occupies authored 0.94-0.06 (pit blocks 0.960/0.996, gantry
0.968, grandstand 0.955, fence and guardrail wrapping through 0.06). A move made
on the arithmetic alone would trade an undressed corner for props inside the
pits.

**What a real pass needs:** `track.props.spans` gives emitted engine fracs for
the span-based kinds (tyreWall, guardrail, fence) directly, and
`modelDiagnostics.suppressed/emitted` gives ids for the model kinds. Enumerate
every emitter in `js/circuits/scenery/estoril.js` through those two, compare
each against the feature its id names, and only then decide per emitter. The
sweeps' three baselines (coplanar 5, float 0, clip 1 severe) are the guard that
such a pass has not made things worse.

### Resolution, same day: the names were corrected, the props were not

The per-emitter enumeration this entry asked for was done. Under the shift, the
result is worse than "some emitters are off" — **not one of the twelve lands on
the feature its id names**, and two never render at all:

| id (before) | authored | engine | actually lands on | renamed to |
|---|---|---|---|---|
| `pit-terrace-a` | 0.960 | 0.8162 | T14, 26 m, R 110 | `parabolica-terrace-a` |
| `pit-terrace-b` | 0.996 | 0.8522 | T14, 123 m | `parabolica-terrace-b` |
| `stand-pit` | 0.005 | 0.8612 | T14 exit, R 76 | `stand-parabolica-exit` |
| `stand-t1` | 0.078 | 0.9342 | main straight | `stand-main-straight` |
| `stand-esses` | 0.140 | 0.9962 | PIT LANE — **suppressed** | `stand-pitlane-superseded` |
| `stand-parabolica` | 0.900 | 0.7562 | T13, 31 m | `stand-t13` |
| `t1-gravel` | 0.078 | 0.9342 | pit complex — **suppressed** | `pit-entry-gravel-superseded` |
| `esses-gravel` | 0.420 | 0.2762 | T5, 54 m | `t5-gravel` |
| `t12-gravel` | 0.780 | 0.6362 | T11, 72 m | `t11-gravel` |
| `parabolica-gravel-a/b/c` | 0.884-0.916 | 0.740-0.772 | T13 | `t13-gravel-a/b/c` |

**The obvious correction was tried and measured, and it is not a one-line def
edit.** Dropping `sceneryStartFrac` (shift -> 0) does fix the semantics
exactly: the three pit emitters land inside `pitLaneSpan` to the metre and the
terraces become "superseded by the pit complex", which is what a circuit's
hand-placed pit block is FOR, while `t1-gravel` and `stand-esses` come alive at
their own features. It also takes **coplanar 5 -> 0**. But it costs:

- **float 0 -> 1** (one elevated cluster)
- **clip 1 -> 3 severe**, including a **4.00 m / 1261 m3** collision at frac
  0.000 that SURVIVES retiring the hand-placed pit grandstand — so at least one
  more structure collides with the engine's pit complex underneath it
- **`estoril-aldeia` footprint rejected** — the village lands on the road

Best-fit analysis over the unambiguous emitters confirms no single constant
rescues it: shift 0 scores 195 m mean name-to-feature error, 0.938 scores
136 m, and the current 0.85616 scores **397 m** — worst of the three, yet the
one the geometry was tuned against. The dressing was settled where it sits;
`float 0` and `clip 1` at the current positions are the evidence.

So the names were corrected in place (zero geometric change — 192483 verts and
all three baselines identical before and after) and a banner at the top of
`js/circuits/scenery/estoril.js` records the arithmetic and the measured cost
of the move, so the next author neither places by name nor repeats the
experiment blind.

**Still open:** moving the dressing onto the features it names. That needs the
pit-complex collisions resolved emitter by emitter and a rendered lap to judge
it — a dressing pass, which is what this entry originally said and what the
attempt confirmed.

### 2026-09-22, later: the probe overturns the "tuned in place" reading

PR #193 concluded the dressing "was tuned where it sits" and corrected only the
names. **That conclusion was wrong**, and the reasoning that produced it was
wrong in an instructive way: `float 0` and `clip 1` were read as evidence the
layout was settled. Those audits cannot see a paddock on the wrong corner —
props auto-ground wherever they are, and a building in open air collides with
nothing. Clean baselines were silence, not agreement.

With the Chromium probe available, `agent.mjs estoril scene --at <frac>` says
plainly what stands where:

| location | shipped today | with `sceneryStartFrac` dropped |
|---|---|---|
| **frac 0.82 — the Parabolica** | 14 structures, gantry, grandstand, **5 motorhomes** | 28 pines, 3 trees, marshal post |
| **frac 0.97 — the pit straight** | 11 trees, **22 pines** | 22 structures, 2 gantries, grandstand, 2 motorhomes |

The shipped circuit has **the paddock parked on a fast corner and a pine forest
down the pit straight.** The swap is the right way round.

### Why dropping `sceneryStartFrac` is still not the fix

It is not a scenery-authoring offset. `_sceneryShift` is consumed by the ENGINE
as well, in four readers in `js/track/tracks.js`: `dress` in `buildCenterline`
(the shift applied to bridges and elevations), `shiftS` in
`transformSceneryApi`, the inverse `HKSHIFT` beside `indexSolidAt`, and the
`sceneryCoordinates` guard in `bakedModel`. Dropping it moves terrain and
engine geometry, not just props.

Measured with the circuit's scenery callback stubbed out entirely, so no
circuit prop is emitted at all:

- shift 0.85616 (shipped): **0 severe clips**
- shift 0: **1 severe clip — 4.00 m / 1261 m3 at frac 0.000**

That collision is engine-side pit geometry overlapping itself once the shift is
removed. No circuit emitter causes it: removing `motorhome`, `broadcastCompound`,
`grandstandEx`, both `pitBlock` terraces and the pit `scaffoldStand` each leaves
it unchanged. It also explains the float and the rejected `estoril-aldeia` — the
elevation profile moves with the same constant.

### What the fix actually requires

Not a def edit. Either (a) re-author the twelve emitters' fracs by -0.85616 so
they land on their features while the def's shift stays put for terrain and
engine geometry — but that divorces the circuit's paddock from wherever the
engine's pit structures sit, so it needs the engine consumer audited first; or
(b) drop the shift AND fix the engine-side pit overlap it exposes. Either way
the four `_sceneryShift` readers named above have to be understood together.

The probe A/B is the acceptance test: the Parabolica should read as trees, the
pit straight as structures.

### Closed the same day: the shift is gone and the acceptance test passes

`sceneryStartFrac: 0.96` removed. The acceptance test this entry named —
"the Parabolica should read as trees, the pit straight as structures" — now
passes:

| `agent.mjs estoril scene --at` | before | after |
|---|---|---|
| 0.82, the Parabolica | 14 structures, gantry, grandstand, 5 motorhomes | 28 pines, 3 trees, marshal post |
| 0.97, the pit straight | 11 trees, 22 pines | 22 structures, 2 gantries, grandstand, 2 motorhomes |

The two hand-placed pit terraces are now "superseded by the pit complex", which
is what a circuit's own pit block is for, and `estoril-aldeia` emits again.

**What unblocked it was measuring the clip count as a distribution rather than a
property.** The earlier attempt treated the shipped `clip 1 severe` as evidence
the layout was settled, so +2 read as damage. `place` has no prop-vs-prop check,
so any shift re-rolls every procedural placement. Sampling six values:

| `sceneryStartFrac` | severe clips |
|---|---|
| **0.96 (shipped)** | **1** |
| 0.80 / 0.60 / 0.40 / 0.00 | 3 |
| 0.20 | 4 |

0.96 was the outlier. Three is this circuit's normal draw, so raising the clip
baseline 1 -> 3 is a re-measurement, not a tolerance widened to pass a change.
Coplanar went the other way and the baseline came DOWN, 5 -> 0: the z-fighting
was the mis-seated dressing all along.

Two real regressions were fixed rather than absorbed, both emitters finally
landing where their `s = k / n` guards intended: `estoril-aldeia` moved
K(0.30) -> K(0.26) (its footprint reached a parallel stretch of road), and the
tree loop's inner lateral bound went 44 -> 48 m (one tree grounded 6.5 m up at
frac 0.219).

**Still true and still worth knowing:** `_sceneryShift` is read by the engine as
well as the scenery — `dress` in `buildCenterline`, `shiftS` in
`transformSceneryApi`, the inverse `HKSHIFT` beside `indexSolidAt`, and
`bakedModel`'s `sceneryCoordinates` guard. Removing it for a circuit moves
terrain and procedural dressing too, which is why this needed the probe A/B as
its gate rather than the audits alone. Any other circuit carrying a
`sceneryStartFrac` should be checked the same way, with the probe, before its
value is trusted.

## `sceneryStartFrac` audit — the other 29 circuits (2026-09-22)

Estoril's value was wrong and nothing had checked the 29 other circuits that
carry one. The start-line campaign (`docs/tracks/START-LINES.md`) moved many
lines to the real straight and preserved the OLD origin as `sceneryStartFrac`,
on the assumption that the scenery was authored against it. For a circuit whose
scenery was actually written against `startFrac: 0`, that preserved origin is a
bogus shift. The acceptance test is the probe
(`node tools/shot/agent.mjs <id> scene --at <frac> --radius 130 --limit 40`),
not the audits. float/clip/coplanar are blind to a paddock on a corner.

### portimao — FIXED (`sceneryStartFrac: 0.96` removed, shift 0.8462 -> 0)

Same defect as Estoril, same value. The pit lane is engine 0.944-0.024, and the
scenery's own numbers are written against that line: pit bays 0.942-0.996,
race control 0.992, T1 gravel 0.050, T5 gravel 0.300 (T5 apex 0.3012), braking
boards 0.012-0.030 ahead of T1 at 0.0757. Under the shift, all of it moved
0.154 of a lap back:

| `agent.mjs portimao scene --at` | shipped | fixed |
|---|---|---|
| 0.985, mid pit lane | 24 pines, 9 trees, 2 stone pines, 5 structures | 14 structures, 2 gantries, grandstand, 2 motorhomes, building, 2 billboards |
| 0.85, T15 (last corner) | grandstand, 3 motorhomes, gantry, 14 structures | 18 pines, 5 trees, 3 stone pines |
| 0.0757, T1 | 25 pines, 6 structures | 18 structures (T1 terracing), marshal post |

Node signature, before -> after: the four `portimao-pit-bay-*` and
`portimao-race-control` went from EMITTED (onto T15) to "superseded by the pit
complex", which is what a hand-placed pit block is for; `portimao-t5-gravel`
went from "footprint rejected" to emitted; `portimao-cut-t3` went from
"superseded by the pit complex" to emitted. Elevations moved with it: the
"drop into Turn 1" (s 0.045) and the "climb back to the pit straight" (s 0.93)
had been landing 0.154 early.

Knock-on fixes, measured one at a time, not absorbed:

- **`ownPitStraight: true`.** The engine's generic 7-box pit-straight stand
  (tracks.js, k 0-24, left) now sat inside the circuit's own
  `grandstandEx(0.005, -1, …)`: coplanar 1 -> 2, both spots at frac
  0.002/0.0085, 17-18 m left. It is the Monza precedent. The flag also removed a
  4.00 m / 1222 m3 box-vs-box clip at frac 0.000. **That spot is not
  Portimão's:** the same 4.00 m frac-0.000 box pair appears on about a dozen
  unshifted circuits (albert_park, buddh, buenos_aires, dijon, estoril, fuji,
  interlagos, korea, kyalami, magny_cours, …). Disabling every hand-placed
  emitter near the line left it in place, so it is engine-side. It is a lead
  worth its own entry.
- **Floating tree, frac 0.171.** A forestEdge tree inside the T4 hairpin (left),
  pushed ~40 m out by `clearTreeDist` into the terrain hollow between the two
  carriageways, grounded 1-12 m up. The belt now skips 0.168-0.181 on that
  side (bisected: narrower windows leave it floating).
- **`portimao-quinta-north` footprint rejected.** At 88 m it stood 7 m from
  the 0.369 carriageway's centreline. It is at 60 m now, 35 m clear (130 m is
  equally clear; 76-120 m all reject).
- **The forest belt grew through both hillside terraces** (0.470-0.530 left,
  0.835-0.890 right, both at the belt's 16 m gap). The belt skips them now. This
  was already true in the authored frame; the shift had only moved it.

Clip as a distribution (dressing as fixed, `sceneryStartFrac` swept; values
snap to control points, so the shift is shown):

| shift | 0.046 | 0.069 | 0.075 | 0.077 | 0.119 | 0.337 | 0.521 | 0.680 | 0.816 | 0.846 (shipped) | 0.853 | 0.882 | 0.961 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| severe clips | 59 | 51 | 50 | 50 | 57 | 46 | 62 | 51 | 55 | 54 | 47 | 55 | 52 |

Median 52. Shift 0 before the terrace carve measured 58, near the top of that
spread; the terrace-vs-forest carve took it to **51**. Every baseline came DOWN:
**clip 54 -> 51, coplanar 1 -> 0, float 1 -> 0.** None went up.
The acceptance test passes: `pit-complex.test.mjs`'s "a RAW landform yields to
the complex" used `portimao-cut-t3` as its fixture. That emitter only reached the
garages under the bogus shift and now dresses T3, so the fixture moved to
Hungaroring's hand-placed pit wall. That wall yields 21 chords whether or not
Hungaroring keeps its shift.

### The other 28 — triage, no changes made

Two measurements per circuit. (1) The probe at the middle of `pitLaneSpan`, on
the shipped tree. (2) A pure-node A/B over `track.props.list`, counting BUILT
props (structure/grandstand/motorhome/building/gantry/billboard/tower) against
TREES within 130 m of the pit-lane midpoint, plus the hand-placed pit block's
fate (`pitEmit` = `*-pit-bay-*`/`*-race-control` emitted, `pitSup` = models
superseded by the pit complex). It runs twice: as shipped, and with
`sceneryStartFrac` deleted. Calibrated on the two known cases first:

| control | shipped: built / trees / pitEmit | shift 0: built / trees / pitEmit |
|---|---|---|
| estoril (0.96) | 6 / **134** / 0 | 33 / 0 / 0 |
| portimao (0.96) | 10 / **115** / 5 | 24 / 28 / 0 |

"Shift 0" is a real candidate only where `startFrac` is 0 (or within 0.02 of
it). Where the line itself moved (brands_hatch, donington, jerez, monaco,
mont_tremblant, silverstone, vegas, zolder), dropping the value is not the
alternative, and those rows are signal only. To reproduce: `buildContext()` from
`tools/track/verify-track.cjs`, `build(def)` once as shipped and once after
`delete def.sceneryStartFrac`, then count `track.props.list` by kind within
130 m of node `round(mid * n)`, where mid is the centre of `Tracks.pitLaneSpan`.
Use a fresh `buildContext()` per mode, as this audit did.

**CONFIRMED — same defect, the paddock is on a corner.** The hand-placed pit block
(pit bays + race control, authored ~0.94-0.99 against `startFrac: 0`) emits
under the shift and is superseded by the pit complex without it. Probed where it
actually lands (authored 0.965 + shift):

| circuit | value -> shift | pit block lands | probe there | shipped -> shift 0 |
|---|---|---|---|---|
| catalunya — **FIXED**, see "catalunya — FIXED" below | 0.03 -> 0.138 | 0.103, 0.055 short of T1 | gantry, 21 structures, building, billboard | pitEmit 7 -> pitSup 7; pit-lane trees 12 -> 0 |
| istanbul | 0.98 -> 0.925 | 0.890, **on T12** (0.8884) | gantry, 23 structures, grandstand, 3 motorhomes | **FIXED**: value removed; see `### istanbul — FIXED` at the end of this file |
| mugello | 0.05 -> 0.133 | 0.098, 0.047 short of T1 | gantry, 22 structures, 4 motorhomes | **FIXED** (value removed; San Donato group also moved +0.08 to T1): see "mugello — FIXED" below |
| paul_ricard | 0.03 -> **0.923** | 0.888, **on T13** (0.8884) | gantry, 25 structures, 2 motorhomes | **FIXED**: frame AND side. Shift removed, and the pit straight mirrored (the paddock was authored on the LEFT, the complex and the real pits are on the RIGHT): pitEmit 5 -> pitSup 5. See § paul_ricard — FIXED at the end |
| sepang | 0.95 -> 0.882 | 0.847, 0.038 short of T14 | gantry, 20 structures, 14 palms | **FIXED**: pitEmit 6 -> pitSup 7; pit-lane trees 38 -> 18 ("sepang — FIXED", end of file) |

Each needs its own PR: remove the value, then work the knock-ons as Portimão
did (probe A/B, clip as a distribution, audits per emitter).

**LIKELY — the pit straight reads as woodland in the shipped build and clears
without the shift, but there is no hand-placed pit block to confirm the frame.**
Probe before touching any of them:

| circuit | value -> shift | pit-lane trees, shipped -> shift 0 | other tells |
|---|---|---|---|
| montreal | 0.915 -> 0.860 (`startFrac` 0.0198) | 84 -> 0 | pitSup 3 -> 7 (`park-lawn-l-*` and `kit:montreal:pit-building` already superseded) |
| mexico | 0.635 -> 0.724 | 133 -> 42 | pitSup 0 -> 3 |
| redbull | 0.1875 -> 0.295 | 105 -> 30 | probe at pit mid: 21 pines, 6 trees, 10 structures |
| cota | 0.515 -> 0.416 | 69 -> 14 | probe: 14 acacia, 14 trees, 8 pines at pit mid |
| suzuka | 0.6125 -> 0.620 (`startFrac` 0.9942) | 158 -> 100 | probe: 16 pines, 20 trees, 1 structure at pit mid |
| indianapolis | 0.05 -> 0.158 | 28 -> 0 | pitSup 0 -> 2; probe: 23 trees at pit mid |
| miami | 0.2325 -> 0.201 | 53 -> 15 | |
| monza | 0.0125 -> 0.087 | 57 -> 32 | pitSup 0 -> 1; `ownPitStraight` already set |
| albert_park | 0.0925 -> 0.102 | 102 -> 77 | parkland; probe at pit mid: 40 trees |
| silverstone | 0.64 -> 0.150 (`startFrac` 0.5224) | 127 -> 31 | line moved, so "shift 0" is not the alternative; needs the old frame worked out |

**READS CORRECTLY, OR SHIFT 0 IS NO BETTER — leave alone.** abudhabi (4/6 vs
17/21, both sparse), brands_hatch (probe: gantry, grandstand, 8 buildings, 8
structures), donington (probe: 9 structures, 2 motorhomes; A/B flat),
hungaroring (shift 0 is worse: built 23 -> 10), imola (A/B flat, trees 70 vs 85),
jerez (shipped better: built 81 vs 61; probe: 4 motorhomes, 29 props),
monaco (flat), mont_tremblant (forest either way, 392 vs 279), qatar (built 7 vs
26, but 41 footprint rejections both ways: its own problem, not the frame),
shanghai (flat), singapore (flat; mirror + shift circuit, see its KOLD legend),
spa (flat), vegas (flat), zolder (forest either way).

Every row here is a triage verdict, not a fix. Only the probe at the named
feature decides, one circuit per PR.

### sepang — FIXED (`sceneryStartFrac: 0.95` removed, shift 0.882 -> 0)

Same defect as Estoril and Portimão. The scenery, elevations and bankZones are
written against `startFrac: 0`: pit bays 0.955-0.999 and race control 0.010
against a pit lane at engine 0.953-0.020, T1 gravel 0.060 (T1 apex 0.0712), T15
gravel 0.885 (turns[13] 0.8852), the T1-T2 bank zone at 0.045. The shift moved
all of it 0.118 of a lap back, so the paddock stood at the end of the back
straight and the plantation ran down the pit straight.

| `agent.mjs sepang scene --at` (40 nearest) | shipped | fixed |
|---|---|---|
| 0.987, mid pit lane | 23 palms, 13 structures, bush | 25 structures, gantry, 2 motorhomes, billboard, 6 palms |
| 0.847, where the pit block landed | gantry, 20 structures, 14 palms, billboard | 29 palms, 7 structures, 2 bushes |
| 0.0712, T1 | 27 palms, 6 structures, 4 bushes | 22 structures (gravel, tyre wall, stand), grandstand, marshal post, 10 palms |

Node signature, before -> after: `sepang-pit-bay-1..5`, `sepang-race-control`
and `sepang-canopy-paddock` went from EMITTED to "superseded by the pit
complex". `sepang-klia-skyline` was "superseded by the pit complex" on the
shipped build too, so it never rendered in either frame (see below). Pit-lane
built/trees (130 m of the pit-lane midpoint) 28/38 -> 38/18.

Knock-ons, measured one at a time, not absorbed:

- **`ownPitStraight: true`.** The circuit's stepped main stand (along
  0.958-0.020, left, 12-31 m) now covers k 0-24, where the engine's generic
  7-box pit-straight stand ([6, 11, 16] at 14 m left) stands, so that box sat
  inside the circuit's stand. The flag removes it, and with it the 4.00 m /
  559 m3 generic-stand-vs-green-box clip at frac 0.000. What remains there
  (2.29 m) is the engine's green-theme `every(140)` box (tracks.js `place`,
  no exclusion hook) inside the circuit's stand: the engine-side frac-0.000
  lead from the Portimão entry, left alone.
- **Back ranks of the plantation reached the main stand.** The back straight
  runs 93-130 m from the pit straight, and the 3 far ranks (to 71 m) on its
  pit side met the stand and canopy (3 severe cone-x-box spots, 1.9-3.0 m, at
  0.964-0.977). `farPalm` now skips an anchor within 44 m of the pit straight
  (a positional guard over K(0.935..0.035), not a frac window).
- **Three models "footprint rejected" at shift 0.** `sepang-shade-walk-t1`
  52 -> 40 m and `sepang-shade-walk-t15` 46 -> 30 m (the first clear gaps of a
  sweep; 60-80 m and 36-64 m also reject). `sepang-klia-skyline` rejected on
  its authored infield side (+1) at every gap from 120 to 280 m (25 m from the
  0.464 carriageway at 180); on the outside (-1) it clears at 150-220 m, 256 m
  from any other road, so it moved side, same gap. It now renders for the
  first time in either frame.
- **Coplanar pair** between the stepped stand's last tier and
  `sepang-shade-walk-1` at 0.020: the walk moved to 0.024.
- **Bush vs the T15 light pole** (1.19 m): the jungle-scrub `openArea` starts
  at 0.88 instead of 0.90, so no scrub grows in the T15 hairpin's run-off.

Clip as a distribution (dressing as fixed, `sceneryStartFrac` swept; values
snap to control points, so the shift is shown):

| shift | 0 (fixed) | 0.076 | 0.098 | 0.132 | 0.231 | 0.302 | 0.356 | 0.480 | 0.567 | 0.654 | 0.707 | 0.882 (shipped) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| severe clips | 3 | 1 | 2 | 5 | 5 | 4 | 3 | 5 | 9 | 11 | 9 | 4 |

Median 4.5. Every baseline came DOWN or held: **clip 4 -> 3, coplanar 7 -> 0,
float 0 -> 0** (no row). The remaining three severe spots are the engine box
at frac 0.000 above and two spectator-hill tread pairs (1.49/1.47 m, nature.js
terrace rows on the inside of T11 at 0.653); the shipped build had a spot of
the same class at 0.523. No test used sepang's broken frame as a fixture.

### paul_ricard — FIXED (`sceneryStartFrac: 0.03` removed, shift 0.923 -> 0; pit straight mirrored)

**Why 0.03 became a 0.923 shift.** `buildCenterline` sets the shift to the arc
fraction at control point `round(sceneryStartFrac * N)`, renumbered into the
racing order. Paul Ricard is `reverse: true`, so that point is `N - round(0.03 N)`
= source vertex 7. That is the Tour hairpin, 450 m BEFORE the line in the
racing direction. On top of that, the OSM trace's vertex spacing is uneven
(300 m legs on the straight, 3-8 m through the hairpin), so 3 % of the
vertices is 7.7 % of the arc. The shift is the old start line's arc position,
computed correctly. The scenery was simply never authored against that start.

**Frame: the scenery is authored against `startFrac: 0`.** At shift 0:
- the pit block (0.950-0.010) sits inside `pitLaneSpan` (0.955-0.019);
- the Verrerie bank (0.070) is on T1 (0.087);
- the `dressingExclusions` "pits" foliage cut (0.92-0.10) covers the pit
  straight (0.925-0.087);
- the 0.88 elevation lands on Le Village (0.887-0.925).

Under the shift, every one of these was 0.077 early: the bank sat on the
straight and the pit block on T13.

**Why pitEmit stayed 5 at shift 0: the pit straight was mirrored.** Every
emitter authored `side: 1` lands on the racing LEFT (a reversed def has its
side negated by `transformSceneryApi`). The file put the whole paddock on the
left: bays, race control, slabs, motorhomes, apron, TV compound. The main
stand, debris fence and boards were on the right. The engine's pit complex
takes `pit.side` 1 by default, which is the RIGHT. That is the infield of this
clockwise lap, and it is where the real pits are: the pit exit rejoins on the
right of the main straight (PlanetF1 / motorsport.com on the 2018-19 pit-exit
changes). So at shift 0 the hand-built bays emitted on the left, facing the
complex across the track, and the main stand (right, 12 m) stood inside the
complex's footprint. `docs/tracks/paul_ricard.md` §4 carries the same mirror
("pit slab L, main grandstand R") and needs the same flip. It is not in this
PR's file scope.

**Fix** (`js/circuits/paul_ricard.js`, `js/circuits/scenery/paul_ricard.js`):
- Drop `sceneryStartFrac`.
- Mirror the pit straight. Bays, race control, the 4 slabs, motorhomes, the
  paddock apron and its lane lines, and the broadcast compound go to the right
  (`side: -1`). The main stand, debris fence and 3 billboards go to the left
  (`side: 1`). The guardrail stays left, in front of the stand. The pit-wall
  props and sponsor hoarding were already right.
- `ownPitStraight: true`: the circuit has its own 150 m main stand, and the
  engine's generic 7-box stand stood inside it (on the left, 14 m). Prop cells
  14357 -> 13919; clip minor spots 12 -> 11.

| probe (`scene --radius 130`) | shipped (shift 0.923) | fixed |
|---|---|---|
| mid pit lane 0.987 | 14 structures, 3 props, 2 bushes, 1 signboard; no gantry, stand, building or motorhome | gantry x2, grandstand L, 2 buildings R, 3 motorhomes R, billboard L, 19 structures (complex R, stand L) |
| 0.888, Le Village / T13 (where the block landed) | gantry, 25 structures, 2 motorhomes, building, billboard | 13 structures, 1 marshal post, 14 pines/trees + 4 bushes: a corner |
| T1 0.087 (Verrerie) | 16 structures, 16 pines/trees | 11 structures, 3 pines/trees (the authored "pits" foliage cut, 0.92-0.10, now covers the Verrerie run-off as written) |

Node A/B: built within 130 m of the mid pit lane 14 -> 26, pit-block
suppressions 0 -> 5 ("superseded by the pit complex"), pitEmit 5 -> 0.

**Knock-ons fixed:**
- **Slabs and one motorhome on the Tour hairpin.** On the right, 0.918-0.931
  and 0.90-0.94 reach the far leg of the hairpin (guard drops: building 2,
  motorhome 1). The slabs now start at 0.944, and motorhomes stand from 0.94
  on. Guard drops are back to the shipped `bush`/`runoffApron` set.
- **Cabanon on the road.** At shift 0, `anchor(K(0.235), -1, 90)` lands 1.4 m
  off the 0.26 leg of the hairpin complex (footprint rejected; shipped rejected
  its drywall instead). Gap 90 -> 120 is the smallest in a 10 m sweep that
  seats both. It is 23 m clear of that road.
- **A floating spectator** (float-audit, 4.81 m, frac 0.937). The bleacher at
  0.890-0.930 R had a tier dropped by the road guard, but the crowd figure on
  that tier was still placed. The figure is now skipped when `addBox` returns
  false for its tier. Trimming the stand's end (0.920-0.928) did not clear it.
- `pr-runoff-village-blue` ("emitted footprint rejected" in the shipped
  build) emits.

**Baselines.** Coplanar 5 -> 4 (lowered). Clip severe stays 0: paul_ricard
has no row, so the cap is 0. Float is clean (no row). Clip MINOR spots went
6 -> 11. As a distribution, the 12 `sceneryStartFrac` values below read 4-15
minor spots; 0 severe is the best draw, and 6 of the other 11 values have at
least 1 severe.

| value | none | 0.1 | 0.2 | 0.3 | 0.4 | 0.5 | 0.6 | 0.7 | 0.8 | 0.9 | 0.97 | 0.03 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| shift | 0 | .883 | .811 | .750 | .670 | .526 | .307 | .260 | .210 | .116 | .086 | .923 |
| severe / minor | **0 / 11** | 0/5 | 2/6 | 1/10 | 0/4 | 1/10 | 0/6 | 0/9 | 3/11 | 2/15 | 3/8 | 0/6 |

**Not fixed: the mid-lap dressing fits neither frame.** The corner-keyed
scenery was authored for an older centreline, not the OSM trace:
- Mistral chicane run-off at 0.44; the chicane is at 0.490-0.502.
- Signes run-off, bleacher, bank and tower at 0.545-0.565; Signes is at 0.713,
  so this lands mid-Mistral.
- Bosch bank at 0.64, on the straight.
- The 0.30 / 0.66 elevations.

No single shift fixes this: the offsets are +0.056 at the chicane and +0.148
at Signes. That needs a dressing pass against `def.turns`. The `hwZones` are
source-space and unaffected.

### catalunya — FIXED (`sceneryStartFrac: 0.03` removed, shift 0.138 -> 0)

The paddock and main straight are written against `startFrac: 0`: pit bays
0.944-0.999 and race control 0.985 sit in `pitLaneSpan` (engine 0.945-0.024),
the main stand is at 0.005 and the final-corner gravel at 0.930 (T14 apex
0.9226). **Unlike Portimão, the file is not in one frame.** The first-half
clusters (Repsol terrace 0.215, Seat chicane gravel 0.312, Campsa terrace 0.470)
land on their corners only under the 0.138 shift (0.353 vs 0.3446, 0.450 vs
0.432-0.442, 0.608 vs 0.6091), and the T1 cluster (gravel 0.065, terrace 0.090)
misses Elf (0.1576) in both frames, sitting mid-straight at shift 0 and past
T2 as shipped. So "delete the line" alone would have traded the pit fix for
four undressed corners. The fix is the line removed plus a per-cluster
re-author:

- **Pit block, main straight, La Caixa, final sector.** These stay as
  authored, now in the frame they were written in.
- **Repsol, Seat, Campsa clusters** (terrace, sunTerrace, gravel, tyre wall,
  spectator hill, flood mast, the "open infield bowl" exclusion in both the
  def and `openInfield`). Authored += 0.138, so they keep their shipped engine
  fracs.
- **T1 cluster.** Moved onto Elf (gravel 0.145, tyre wall 0.130-0.165, terrace
  0.160, catch fence 0.13-0.17) and onto its OUTSIDE: `Tracks.curvature` at
  0.1576 is -0.030, a right-hander, and the run-off had been on the inside.
  The orange stand stays inside at 0.145.
- **Guardrails.** Re-spanned `[0.17,0.43] [0.47,0.66] [0.72,0.89]`, so the gaps
  fall at the T1, Seat and La Caixa gravel traps and the pits again.
- **Def tables** (`elevations`, `bankZones`). Re-authored to their shipped
  ENGINE fracs, so terrain and banking do not move: max |Δpy| 0.33 m over 1163
  nodes (4-decimal rounding), bank identical. Three of the four elevation
  bumps already read right as shipped (the Renault climb 0.288, high ground
  before Campsa 0.548, the dip into La Caixa 0.728).

| `agent.mjs catalunya scene --at` | shipped | fixed |
|---|---|---|
| 0.9845, mid pit lane | 9 stone pines, 3 pines, 4 bushes, 5 structures | 19 structures, 2 gantries, grandstand, 2 motorhomes, building, 2 billboards |
| 0.103, where the pit block landed | gantry, 21 structures, building, billboard | 12 pines/stone pines, 3 trees, 8 bushes, 9 structures |
| 0.1576, T1 | 26 structures, gantry, motorhome, grandstand | 10 structures, grandstand, 2 marshal posts, 9 pines, 9 bushes |
| 0.345 / 0.44 / 0.609 (Repsol / Seat / Campsa) | unchanged: same clusters at the same engine fracs | unchanged |

Node A/B at the pit-lane midpoint: built 5 -> 27, trees 12 -> 0, the seven
pit-block models EMITTED -> "superseded by the pit complex".

Knock-ons, fixed rather than absorbed:

- **`ownPitStraight: true`.** The engine's generic 7-box stand (k 0-24, left,
  14 m) now stood inside the circuit's own 180 m `grandstandEx(0.005, -1)`,
  the Monza/Portimão precedent. It also removed the engine-side 4.00 m /
  1487 m3 box-vs-box clip at frac 0.000.
- **The T1 terrace folded into itself** (two 3.8 / 3.1 m clips at frac 0.474,
  33 m off the Seat hairpin) on the inside of T1-T2. It is on the outside now,
  which is clean at 0.150-0.170.
- **`sunTerrace` on a bend.** The final-sector terraces now sit on the curves
  they were written for, and the helper's fixed-length units overlapped on
  the inside (37 self-pairs, 3.5 m). Each row's unit is now scaled by its
  chord ratio to the centreline, shrink-only, so straights and outsides are
  unchanged.
- **Broadcast compound vs a paddock motorhome** (2.18 m). Both are now in one
  frame, and the motorhome loop keeps ±0.008 clear of K(0.912).

Clip as a distribution (final dressing, `sceneryStartFrac` swept; values snap
to control points, so the shift is shown):

| shift | 0 (fixed) | 0.138 (old) | 0.168 | 0.214 | 0.265 | 0.357 | 0.435 | 0.516 | 0.570 | 0.730 | 0.766 | 0.805 | 0.881 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| severe clips | **9** | 15 | 17 | 12 | 11 | 10 | 12 | 11 | 23 | 9 | 10 | 11 | 23 |

Baselines all come DOWN: **clip 22 -> 9, coplanar 1 -> 0, float 0 -> 0.** Nine
is the low end of this dressing's 9-23 spread, which is what it measures at
its own frame. No test used Catalunya's shifted frame as a fixture.

**Left alone, recorded:** `hwZones` are source-space (no shift ever applied),
and the "Seat / Wurth chicane" narrowing at 0.290-0.335 lies on the straight
before Repsol, 0.1 short of Seat (0.432). The width is physics, not dressing,
so it needs its own change. The Seat gravel is on the inside of a left-hander
exactly as shipped.

### mugello — FIXED (`sceneryStartFrac: 0.05` removed, shift 0.133 -> 0; San Donato moved to T1)

Same defect. The pit lane is engine 0.950-0.021 (garage row 0.991-0.016), and
most of the scenery is written against that line: pit bays 0.945-0.999, race
control 0.988, halls 0.925-0.964, Arrabbiata gravel 0.495 (curvature peaks
0.46-0.53), Bucine terrazza 0.858-0.902 (Bucine 0.86-0.90), and the elevation
comments ("rise onto the main straight" 0.92). The shift moved all of it 0.133
of a lap forward, standing the paddock on the run to San Donato and Bucine's
dressing on the main straight.

| `agent.mjs mugello scene --at` (40 nearest) | shipped | fixed |
|---|---|---|
| 0.985, mid pit lane | 18 trees, 9 cypress, 12 pines, 1 structure | 10 structures, 4 props, billboard, 2 signs within 40 m; trees from 40-50 m left |
| 0.098, where the pit block landed | gantry, 22 structures, 2 buildings, 4 motorhomes | 7 structures, 4 props, 3 trees |
| 0.1447, T1 San Donato | grandstand, 25 structures (the Luco dressing at 0.18-0.23) | grandstand, 24 structures, 6 signs, 2 marshal posts |
| 0.203, Luco | (above) | 21 trees/pines, 7 cypress |

The trees still in radius at mid pit lane are not the pit straight's: every
one of the 122 within 130 m is nearest the Biondetti carriageway (0.74-0.79),
which runs ~75 m to the left. Shipped, 141 of 268 were nearest the pit
straight itself (0.96-0.01); now none are.

Node signature, before -> after: `mugello-pit-bay-1..4` go from EMITTED to
"superseded by the pit complex". `mugello-race-control` still emits at shift 0,
and legitimately: at 0.988 it is 3 m of lap short of the garage row, where the
complex keeps out only 14.3 m, and its footprint is 21-35 m out. It is a tower
behind the pit-entry end, not a building on a corner.

**Not the frame: San Donato was authored 0.08 early in EVERY frame.** The whole
San Donato group (gravel, tyre wall, terrazza bowl, grandstandEx, marshal post,
camera tower, "corner 1" board, and the `bankZones` entry) sat at 0.048-0.098:
at shift 0 that is mid main straight, 0.075 before T1 (curvature -6 at 0.14,
-19 at 0.16). Shipped it was at 0.18-0.23, Luco and Poggio Secco. No start-line
frame puts it on the corner while keeping the pit block and Bucine on theirs,
so it was authored against an earlier centreline. It moved +0.08 (gravel to
0.140 and not 0.150: at 0.145-0.150 its 52 m patch cut back across its own
corner and was footprint-rejected), and `openArea`, the def's foliage
exclusion, the T1 forest belt and the spectator hill were cut back to
0.18 around it. The "Casanova-Savelli" group (0.29-0.334) now dresses
Materassi/Borgo San Lorenzo (0.30/0.32), a real corner pair; the real
Casanova-Savelli is 0.39-0.42. It stays, and the name is wrong, but it is not a
paddock on a corner.

Knock-on fixes, measured one at a time:

- **`ownPitStraight: true`.** The circuit has its own 160 m main stand
  (grandstandEx 0.005, left). The generic 7-box stand stood in it: a 4.00 m /
  1245 m3 box-vs-box clip at frac 0.000. The Monza and Portimão precedent.
- **Coplanar 0 -> 1 -> 0.** The red trim band fronting the main stand (gap 8,
  2 m thick) put its back face in the 9 m fence. On the old corner the
  curvature separated them. On the straight they coincide. Now at 7.6 m.
- **Floating pine, frac 0.633.** An `every(34)` pine 3.5 m off the Palagio
  carriageway. `pine()` clears the trunk and not the crown, so the road guard
  dropped the lower tiers and left the top cone 22 m up. The loop now skips a
  pine whose crown reaches the road.
- **`mugello-casale` footprint rejected.** At 0.500 +1 the Bucine carriageway
  runs 60-75 m out, and every gap from 50 to 135 m rejects. At 150 m its
  centre is 30 m past that edge. Trees from the Bucine side then grew 6.8 m
  into its tower (the engine's deferred foliage, and this file's own loops,
  which `spotTaken` does not stop). `indexSolid` books the yard for the
  former, and the loops skip it for the latter.
- **`broadcastCompound` guard-dropped** at 0.916 +1 74 m, 6.5 m from the
  Savelli carriageway (0.436). 68 m still drops. At 66 m it stands 10 m clear.

Clip as a distribution (dressing as fixed, `sceneryStartFrac` swept):

| shift | 0.065 | 0.133 (shipped) | 0.161 | 0.225 | 0.319 | 0.414 | 0.479 | 0.548 | 0.674 | 0.724 | 0.860 | 0.886 | 0.901 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| severe clips | 14 | 13 | 10 | 8 | 12 | 13 | 12 | 9 | 16 | 17 | 15 | 14 | 15 |

Median 13; shift 0 measures **10**. Baselines: **clip 22 -> 10**, coplanar
0 -> 0, float stays clean (no row). The 10 that remain are pre-existing
self-overlaps (the Casanova terrazza's rows, the spectator hills' tiers, vine
rows against roadside trunks). None of them is in the relocated San Donato
group. `pit-complex.test.mjs`'s race-control keep/tail test uses mugello for
the engine's ROW_TAIL, which does not depend on the scenery frame. It passes
unchanged, so no fixture moved.

### istanbul — FIXED (`sceneryStartFrac: 0.98` removed, shift 0.925 -> 0)

Same defect as Estoril and Portimão. Every emitter is keyed to `startFrac: 0`:
T1 gravel 0.055 against the T1 apex 0.0569, the T8 amphitheatre 0.34-0.46
against the T8 apexes 0.359-0.476, T13 gravel 0.905 against 0.9014, and pit bays
0.948-0.990 against the pit lane 0.951-0.021. The 0.925 shift moved all of it
back 0.075 of a lap.

Probe (`agent.mjs istanbul scene --at <f> --radius 130 --limit 40`, kinds of
the 40 nearest):

| at | shipped | fixed |
|---|---|---|
| 0.986 mid pit lane | 13 structures, grandstand | 22 structures, 2 gantries, 3 motorhomes, grandstand, 2 billboards |
| 0.890 T12 | gantry, 23 structures, grandstand, 3 motorhomes, building, billboard | 22 pines, 7 trees, 3 stone pines, 4 structures (T13 stand at 51 m) |
| 0.057 T1 | 19 pines, 8 trees, 2 stone pines, 3 bushes | 16 structures, grandstand, marshal post |

A/B (`scratch/ab.cjs` from the audit): pitEmit 7 -> pitSup 7, and the pit bays
and race control now read "superseded by the pit complex".

Knock-ons fixed:
- `istanbul-stone-portal` was footprint-rejected. At 0.930 the lap folds back,
  and at a 52 m gap the portal's 34 m face overhung the T13 carriageway (node
  0.909). It is now 44 m, about 6 m clear of that road's edge (it emits at 50 m and
  below).
- The T13 tyre wall's last stack at 0.922, the T14 apex, stood on the road (a
  `tyreWall=1` guard drop). The span now ends at 0.920.
- `ownPitStraight: true`: the main stand (`grandstandEx` 0.005, -1, gap 11) is
  the circuit's own pit-straight stand, and the generic 7-box stand (-1, gap 14)
  stood inside it. This also removes the engine-side 4.00 m / 876 m3
  box-vs-box clip at frac 0.000.

Left alone: the rest of the clip total is the T8 amphitheatre's stepped terrace
boxes overlapping each other on the curve (scenery lines 57/60), in either frame.
In the shipped frame those terraces sat on T3-T4 (0.19-0.24), with forest
growing through them.

Clip across 13 `sceneryStartFrac` values (the shift snaps to control points):

| value | 0.02 | 0.10 | 0.18 | 0.26 | 0.34 | 0.42 | 0.50 | 0.58 | 0.66 | 0.74 | 0.82 | 0.90 | 0.98 (shipped) | none |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| shift | 0.054 | 0.090 | 0.166 | 0.207 | 0.248 | 0.336 | 0.381 | 0.454 | 0.498 | 0.624 | 0.771 | 0.898 | 0.925 | 0 |
| clip | 11 | 31 | 23 | 25 | 29 | 27 | 24 | 27 | 20 | 11 | 23 | 23 | 13 | **6** |

Baselines all come down: clip 13 -> 6, coplanar 5 -> 0, float 0 -> 0.
verify-track: suppressed 7 (all superseded by the pit complex), 0 guard drops
(shipped: 2 `building` drops).
