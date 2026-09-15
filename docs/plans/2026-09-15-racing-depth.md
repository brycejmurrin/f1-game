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

## Technical references

- https://box2d.org/documentation/md_collision.html — separating axes and swept
  collision concepts; implementation is local, with no copied tuning constants.
- https://nvidia-omniverse.github.io/PhysX/physx/5.4.1/docs/Vehicles.html — the
  distinction between wheel dynamics, tyre force and chassis response; physical
  wheelspin/lockup is not claimed by cosmetic wheel animation.
