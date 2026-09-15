# Racing depth: implementation register

Base: `6b2a1e0eb2f9533547f4af01ba2fd4845cfdb135`, following PR #140.
Scope: every remaining opportunity in the September 14 mechanics survey. This
register distinguishes implementation from validation and larger dependencies.

## Implemented in this branch

- Oriented car contact geometry: four separating axes, contact normal/support
  points, inelastic linear/angular impulse and fixed-orientation linear sweeps.
  The existing low-yaw response remains; full rotated geometry blends in from
  20 to 60 degrees. AI cosmetic lean does not rotate the collision body.
  Sweeps reject teleports, network ownership and incident-simulation ownership.
  They are not continuous rotational collision detection or network rollback.
- Practice: sector, controlled braking, trail braking and slalom objectives on
  unscored checkpoints. Clean completions persist separately as versioned
  circuit/configuration mastery. Retries restore the selected checkpoint drill.
- Strategy: observed tyre-life and stop-payback estimates, with unknown values
  before sufficient evidence; completed clean-sector energy consumption and
  remaining-charge estimates. Forecast samples clear after discontinuities and
  meaningful weather changes. Stop payback is not an opponent undercut simulator.
- Ordered, bounded incident/penalty/pit journal, pause-menu review and trace export.
- Ghost arc-speed comparison at matching elapsed lap time in driving telemetry.
- Connection panel showing measured round-trip time, interpolation delay and
  disconnect guidance. This does not claim seamless rejoining.
- AI passing candidates reject continuously intersecting lane-change paths and
  approaching traffic; occupied sides yield to following. Existing attack,
  commitment and caution gates remain. Latest candidate reasons are visible in
  the pause menu and exported with the driving trace. The prediction assumes
  rivals hold their current lateral lane over a short horizon.

## Acceptance and remaining work

| Area | State / next acceptance requirement |
|---|---|
| Contact geometry/angular impulses | Focused tests cover geometry, energy, sweep, ownership; real driving and collision browser gates remain |
| Handling shoulder/post-peak/relaxation | Pending telemetry experiments; preserve unassisted steering and stability thresholds |
| Torque-balanced wheels, brake temperature/fade | Pending coupled wheel/chassis integration and low-speed/stopping-distance evidence |
| AI candidate planner | Implemented; multi-seed field pace/contact/pass measurements and browser racing scenarios remain |
| AI yield/exit corridor scoring, rival/team explanations | Existing yield/team rules retained; explicit candidate comparisons beyond passing remain |
| Spatial wetness/drainage/drying/puddles | Pending shared spatial surface field across physics, strategy and all renderers |
| Separate pit road | Latest base already includes lateral physical pit positioning; branching geometry and merge clearance remain |
| Handling damage/repairs | Pending component damage coupled to stable contact severity, with optional mode and repair behavior |
| Stint/energy estimates | Implemented measured forecasts; opponent undercut/overcut, race-length calibration and weekend allocations remain |
| Manual sector energy plan | Pending selectable deployment policy plus record/network identity |
| Practice/mastery/timeline | Implemented; rendered desktop/mobile interactions remain |
| Career practice/sponsors/reliability/regulations | Mastery has separate persistence; career rewards, choices and season migrations remain |
| Axle/proximity audio and verbosity | Pending prioritized audio/caption integration and interrupt behavior |
| Accessibility/device profiles | Pending input-equivalence audit and real touch/gamepad evidence |
| Connection quality/reconnect | Measured panel implemented; real multi-peer disconnect/rejoin tests and rejoining lifecycle remain |
| Result cards/highlights | Pending class-labeled export and bounded deterministic replay capture |
| Renderer reference/parity | Pending fixed material scene and positive GLX/WGX/TLX boot evidence |
| Sustained graphics | Pending 10-minute device runs; local VM has no real GPU or usable browser |
| Shimmer/compressed textures/trackside art | Pending renderer/asset changes measured against fixed references and upload/frame budgets |
| Photo mode | Already exists; retain and test with presentation changes |
| Ranked authority | Separate protocol/product project; current peer-owned casual model remains |

## Validation record

Focused collision batch: 34/34 passed. Practice/strategy and existing coherence:
15/15 passed. AI candidate and insights batch: 12/12 passed. No thresholds were
loosened. Full fast verification and field measurements are recorded when run.
Initial guards found metadata drift (new test registration, type declaration,
coverage counts and added static menu nodes); these are explicitly repaired.
The game.js code-line budget remains unchanged. After the requested UI correction,
68 static nodes above the base support shared setting rows, help text, and the
How to Play guide; no CSS classes or dialog layers were added.

The first full fast gate passed 190/191 files; its sole failure was the frozen
module scanner requiring the repository’s exact IIFE/tail convention. The three
new modules now use that convention. A follow-up verifies the UI revision.

Final targeted verification: 178/178 precommit guards and 79/79 focused UI,
module-convention and insights checks passed. The actual browser flow passed
2/2 at 1280×800 and 844×390, with zero page errors: coach select, checkpoint,
retry, compound selection, Back ladder and How to Play’s Driving anchor.
Screenshots were inspected. Results: `artifacts/test-results-39053/junit.xml`.

Cloud Browser had rejected localhost and the earlier Chromium installer failed.
A subsequently available `/opt/apex-browser/chromium` enabled this Playwright
run through the repository runner, with one worker and headless 3D mode.
This verifies rendered DOM and interaction, not live GPU performance or driving
feel. The full collision/physics browser groups, real-GPU and multi-peer
reconnection scenarios remain unrun.

## Driving page and How to Play

The user reported that the live pause controls broke established UI patterns
and did not explain what the coach does. Pause now offers a DRIVING door into
the existing SettingsNav sheet, also reachable from title Settings. The shared
SettingRow handles ON/OFF, practice goal and tyre selection. Plain-language help
explains text-tip examples, player control, checkpoint eligibility and the
unscored session. Data export and AI reasoning sit in SESSION REVIEW. The guide
has a DRIVING contents link with matching labels, usage steps, coach-tip meanings,
practice goals, pit strategy and data export. No new dialog or CSS system exists.

## Validation follow-up: the coach and the drills judged the wrong signals

The user reported that the coach "doesn't really work" and that practice
"doesn't check what you did". Driving the real `js/game.js` in the node VM
(`tools/lib/game-vm.cjs`) reproduced both:

- The braking-into-turn tip gated on `axFrac > 0.8`, the friction-circle share.
  Full braking in the dry plateaus at `BRAKE / LONG_GRIP` = 22 / 34 = 0.64
  (measured 0.64 from 55 m/s on monza), so the tip could only fire in the wet.
  It now reads braking effort against the brake ceiling (`-axEstSm / BRAKE`,
  the engine's own `brakeFade` scalar): 0.99 under a full dry brake.
- The trail and slalom drills read the shaped stick command. A pad deflection
  of 0.35 reads 0.11 after `STEER_EXPO` (measured), under both the 0.15 and 0.2
  gates, while the car pulled 7.2 m/s² of lateral acceleration and changed
  direction eleven times in eight seconds. Drills now count the car's lateral
  acceleration (3 m/s² arms a side), and the trail drill no longer needs a
  partial pedal, which a keyboard cannot produce.
- The braking drill completed on any brake sample above 0.5 followed by any
  stop: a three-frame tap and a ten-second coast passed as "Completed" and
  banked mastery. The stop now needs the brake held on 80 % of the slowing
  samples, is scored by stopping distance from the first firm brake (which
  repeats from a restored checkpoint), and a stop without firm braking or with
  the brake released early fails with that reason.
- A finished drill wrote only to the journal; the driver saw nothing until they
  opened the pause menu. The verdict now announces on screen with the measured
  result, and the pause menu shows the reason for a failed attempt.

Evidence: `tests/unit/race-insights.test.mjs` (signal semantics, reasons,
announcements), `tests/unit/driving-coach.test.mjs` (the dry-brake plateau
fires the tip; a trailed brake at a third of the ceiling does not) and
`tests/unit/mechanics-integration-vm.test.mjs` (the real car: coast fails,
held brake scores 0.9–1.6× v²/2a, pad slalom completes, the tip fires on
tarmac). The VM cannot expire an announcement (the timer decays in a render
frame the stubbed renderer faults on), so the tip test boots its own instance.

### Second pass: more goals, more tips, less menu

- Three more practice goals, each scored by the number the driver can act on:
  CORNER (opens after 0.3 s of sustained cornering, closes after 0.5 s without
  it so a chicane's flip stays one corner; reports time, minimum and exit
  speed), FULL LAP (timed line to line from the exact `_lapTimeAtLine` the
  crossing keeps, since practice laps never enter the records) and LAUNCH
  (must start stopped; timed from the first throttle to half of top speed).
- Every attempt is kept per goal for the session and the DRIVING page shows
  the count, how many were clean, the session best and the saved best with
  its completion count; checkpoint messages name the goal.
- The RECOVER key (R by default) is TRY AGAIN while a practice checkpoint is
  saved, so a retry no longer needs the pause menu; elsewhere it rescues as
  before (`js/game.js`, one merged line).
- Three more coach tips: COASTING (no pedal at speed for 1.2 s), X-MODE in a
  corner (flaps open above 6 m/s² of lateral load; auto aero never reaches
  it) and TRACK LIMITS, which is an event: the game only announces the
  warning ladder in the broadcast HUD, so the coach explains a new warning
  within 3 s, ignoring the count it first saw and the reset after a penalty.

Evidence: the same three files. The VM test for the corner goal drives Curva
Grande with a test-side pure-pursuit driver (positive steer turns right); the
driving-help assist alone cannot hold the car through a corner at speed, so
the assist is not a stand-in for a driver in tests. shellNodes rose 1602 → 1613
for the help text (`docs/notes/CEILING-HISTORY.md`).

### Third pass: where, how far off, and what to practise

The first two passes made the feedback correct and specific. It still could not
answer the two questions a driver actually asks: *where am I losing it* and
*what do I do about it*.

- **Tips are filed under a turn.** Each tip records the curated FIA turn it
  happened at, read from `def.turns` — authored apex positions in racing-lap
  fractions, the same frame `sectorAt()` reads `def.sectors` in, and read raw
  exactly as `js/ui/track-maps.js` and `js/agent/agentview.js` read it. This is
  authored data, not a `Tracks.curvature()` read, so it adds no row to the
  physics table; nothing but a sentence consumes it. The review lists the top
  locations, and a circuit without curated turns simply shows none.
- **The review ranks and prescribes.** Counts sort most-repeated first, and a
  tip earned three times names the practice goal that drills it (braking tips →
  trail braking, front-grip → corner, track limits → sector, and so on). That
  is the first link from the coach to the drills; they were two features in one
  panel before.
- **The braking drill reports what modulation cost.** It now records the hardest
  deceleration the car actually produced during the attempt and reports
  `v²/2a` at that figure against the real stopping distance: "stopped 125 m from
  144 km/h · 25 m of it below your hardest braking". The reference is measured,
  not modelled, so tyres, weather, car mods and surface are already in it and it
  cannot drift from the sim the way a constant would.

Evidence: unit tests for turn labelling (including the wrap across the start
line, a tip on a straight naming no turn, and a circuit with no curated turns),
the ranking, the suggestion threshold, and the braking slack in three cases
(eased, held at the peak, and no deceleration data at all). The frame is proven
on real geometry rather than a fixture in
`tests/unit/mechanics-integration-vm.test.mjs`: monza's curated apexes are
cross-checked against independently detected curvature peaks, and a real
coasting tip on the approach to turn 4 is filed as Turn 4.

A harness note worth keeping: `announceT` is a lexical `let` inside `js/game.js`,
so a VM test cannot clear it from the context — only a render frame decays it,
and the stubbed renderer faults on one. Any VM test that needs a SECOND coach
tip therefore needs its own `createGame` instance, because the first tip's
message holds the coach in `waiting` forever.

## Technical references

- https://box2d.org/documentation/md_collision.html — separating axes and swept
  collision concepts; implementation is local, with no copied tuning constants.
- https://nvidia-omniverse.github.io/PhysX/physx/5.4.1/docs/Vehicles.html — the
  distinction between wheel dynamics, tyre force and chassis response; physical
  wheelspin/lockup is not claimed by cosmetic wheel animation.
