# Browser specs — batch 12

Read all 160,000 assigned UTF-8 bytes in 28 individually returned chunks of at most 8,000 bytes. Source hashes, half-open byte ranges, case and matcher spans, fixtures, selectors and hook spans are in specs-12-evidence.json. No tests, browser sessions or runtime probes were run. LSP source navigation alone checked production uses.

Qatar is a tail-only partial file/case; smoke is a prefix ending inside its circuit-picker case. Structural case endpoints in evidence come from parsing the source and do not claim semantic reading outside assigned bytes. Parameterized declarations represent multiple runtime cases. Assertions inside helpers are listed at file scope as well as case-local spans.

| Source | Assigned bytes | Coverage and setup | Limits and cleanup |
|---|---:|---|---|
| qatar-foundation.spec.js | [6178, 8828) | Day/night geometry tail: props <310000 vertices, required hero emissions, finite bounded walls, nullable terrain gap ≤0.18; night-only lights and brighter daytime ambient. | Case setup and earlier assertions belong to group11; this range begins inside the session loop. Only tail semantics are mapped. |
| quali.spec.js | [0, 22975) | Qualifying session, 22-seat plausible deterministic spread, reroll prevention, exact sheet/grid and player slot, every round, GP isolation; car/driver/circuit pace; one flying lap and AI handover, standing GP; BACK/MENU and optional GP qualifying. | Virgin Playwright pages because menu screen state is essential; 844×390; boot/race asset-log waits use RACE_BUILD_MS; heavy two-build cases slow; no sensor/pixel claims. |
| race-control.spec.js | [0, 5686) | Shipped caution false gives coherent GREEN and three sectors; setter writes true/false JSON strings and false survives reload; requested hazards include total/worst/sectors. | Shared helper import, loadTrack monza day/dry headless for state; reload case restores caution true. Browser scope is wiring/storage; threshold/hysteresis/host-guest machine rules are outside it. |
| race-cycle-memory.spec.js | [0, 10697) | Monza/Spa race→drive→flag→menu, garage between circuits; forced GC leaves exactly current track in race and ≤1 at menu. Post-warm heap hard gate, optional strict soft heap/audio slope. | 844×390 touch TLX, census init+CDP HeapProfiler; WARM_CYCLES+1, 600 drive steps, 20-minute case. Final menu waits 3 seconds quiet. Logs heap/audio/renderer counts and annotations; renderer counts diagnostic only; clearInput after driving. |
| real-race.spec.js | [0, 17906) | WATCH accessible names/Enter/Space and pressed state; real grid/seat, scaled tyre stops and retirements, scripted SC hold/release; midlap rolling placement and four-second handover; replay follow/speed clock; intro event card and hidden title. | Virgin pages; synthetic four-driver six-lap Baku script, two trace cars. Headless simulation, explicit step; watched replay freeze prevents wall-clock drift. Keyboard Equal/Period; MutationObserver captures intro transitions. No full historical dataset fidelity proof. |
| redbull-foundation.spec.js | [0, 4219) | Red Bull day/night migrated foundation: racing coordinates, terrain outer 28–72, 50–58m relief, crest/low placement and slope <0.14; clean finite geometry/models, heroes, walls >99% tight, nullable clearance ≤0.18. | 240-second virgin page; await race thenables before diagnostics; 800 profile samples and eight terrain probes; pageerror collection. Finite samples are not exhaustive terrain proof. |
| render-boot.spec.js | [0, 8037) | GLX positive live WebGL2 identity; TLX three marker+WebGL2; unset backend follows adapter availability. Each needs GPU reader, zero errors, positive aspect and presented canvas dimensions. | Helper fixture; console errors exclude favicon. Init storage pins backend/forceGL; auto branch requests adapter. Cheap selectable boot gate, no declared slow timeout; WGX and image quality outside scope. |
| render-lifecycle.spec.js | [0, 3831) | GLX backing follows three portrait/landscape rotations and resize counts; simulated hidden pauses race and bfcache counted; context-loss event triggers navigation and live replacement context. | 844×390↔390×844; 180-second configure, BOOT_MS/TRACK_MS, three frame waits. lifecycle reset at boot; synthetic visibility and context-loss hooks do not emulate every OS lifecycle. |
| rotation-recovery.spec.js | [0, 5920) | Portrait recovery dialog explains rotation lock, transfers/restores focus via controls; standard gamepad routes buttons to recovery without throttle/brake/steer/boost/shift leakage; exit restores menu/body class. | 390×844 mobile touch, Bahrain, each 300 seconds. Injected 17-button pad and Input reset/poll; press helper releases each edge; gamepad test headless. Fresh context contains patched navigator. |
| scenery-kits.spec.js | [0, 7603) | Shared kits expose permanent palette, budgets 50000/25000/10000 and expected method sets. Five circuits resolve street/desert/park/permanent/night-event themes, emit ≥2 bounded kit models and no kit failures. | 300-second configure; pre-navigation wrapper hooks both TrackDefs and lazy TrackScenery setter. Binding-only Silverstone suppresses actual placement; other cases call original scenery. Wait build before reading, headless. Five parameter expansions from one declaration. |
| season-format.spec.js | [0, 13716) | Seeded custom calendars include classics and end at their own last round; qualifying off, classic ten-point win, editable preset laps. Sprint pays eight without closing round; separate GP qualifying on same track, full distance and total33; stage survives reload; complete season routes final standings. | 844×390 virgin pages; idempotent seasonCfg/reliability-off init scripts preserve season save; headless. win helper waits park readiness before flag. GP fits second dry compound. Screen editor itself is outside seeded rules scope. |
| season.spec.js | [0, 8758) | Default season flags, 10/25/57 lap races exceed 360 seconds; leaving restores GP circuit; scored round opens standings; legacy custom driver code points migrate to stable custom:0 identity and edited results name. | 844×390 virgin pages, real garage→settings→quali navigation, headless, scripted park/finish and short waits. Three lap-count expansions; no real race driving/visual proof. |
| settings-reload.spec.js | [0, 3744) | Nine driving/HUD SettingRows persist raw stored bytes and painted live selection after reload; direct steer touch, mirrored body and driving-line mode signals. | 844×390 mobile touch; init-free fresh storage. DOM change events perform real setters, race sheet lazy wiring readiness awaited. Most rows checked by UI readback, three by independent signal. |
| sliders.spec.js | [0, 25900) | Nine granular sliders move mapped tuning in correct direction with label/storage; corrupted store clamps to each boundary. Steering exponent/lock affect turn bursts; pace lifts player/AI ground speed while preserving dial/gears, full gearbox and manual limiter. Macros fan out, presets mirror, advanced disclosure and custom state. | Helper fixture diagnostics; Monza step simulation. Straight sampled from 60 positions, field parked, peak rather than final speeds, clearInput after bursts; accumulated init scripts seed high/low reload. No DeviceOrientationEvent end-to-end sensor coverage. |
| smoke.spec.js | [0, 18358) | Assigned smoke cases cover jump/park state, clicked race start, nonblank grid PNG >5000 bytes without console errors, first-frame driving-line data, and partial circuit-picker/garage/team-picker navigation. | Fresh pages in assigned declarations (sharedTest imported for later scope). Headless only during menu/build or after real presented frame for screenshots; physics freeze alone insufficient. Track/boot waits scale test budget. PNG size is smoke, not visual regression. Range ends mid picker action; subsequent assertions excluded. |

Production navigation: RealRace.launch has two production uses in DataRealRace.create.launchRace, plus its definition/export. DrivingLine.mode resolves by a declared text-match fallback to the agent adapter and SettingDeps. Quali.order returns definition/export only via a module-file fallback, so direct callers remain unverified. Exact query results and paths are retained in evidence.

Case index (inclusive source lines; **partial** means the assignment cuts the case):

**qatar-foundation.spec.js**

- L6–157: Qatar uses the shared track foundation contracts **partial**

**quali.spec.js**

- L67–74: a championship weekend opens with qualifying
- L76–93: a one-off Grand Prix still goes straight to the race
- L95–108: the field is classified with a plausible spread
- L110–120: the model is deterministic — same track, same times
- L122–129: running the session hides SIMULATE — it cannot be re-rolled
- L137–149: the race grid IS the qualifying order, car for car
- L151–163: the player starts where they qualified, not P12
- L165–192: every round of a season qualifies, not just the first
- L194–223: a qualifying grid never leaks into the Grand Prix that follows it
- L231–243: a faster car and a better driver both make the lap quicker
- L245–260: the model responds to the circuit, not just the car
- L278–282: the session is one lap, not two
- L284–306: a FLYING lap: the car rolls in at speed before the line, AI-driven, then hands over
- L308–320: a Grand Prix still starts from a standstill
- L331–340: BACK returns to race settings, one step, with nothing run
- L342–352: ...and the weekend can be entered again from there
- L354–362: BACK becomes MENU once the session has been run
- L391–402: OFF goes straight to the lights from P12, as it always has
- L404–424: ON runs the session and the grid comes out of it
- L426–439: a championship forces it on, and says so rather than hiding it

**race-control.spec.js**

- L26–48: the layer boots at the shipped default and reports a coherent GREEN
- L50–94: the setting survives a reload
- L96–108: hazards are reported alongside the state on request

**race-cycle-memory.spec.js**

- L85–165: racing circuit after circuit keeps at most one world in memory

**real-race.spec.js**

- L37–70: WATCH director buttons expose their visible names and retain keyboard control
- L73–129: launch() grids the real order, seats the player, lays the plans, and race control holds the scripted flag
- L133–190: launch() at a later lap arms in the countdown and drops the field in where it stood on the first green frame
- L194–250: launch() with the positions loaded recreates the field as puppets: the camera on the seat, follow and speed keys, nobody driving
- L257–283: launch({intro}) — the Data Hub's JUMP IN — shows the pre-race card naming the real event, then starts the race

**redbull-foundation.spec.js**

- L7–97: Red Bull Ring owns a safe migrated alpine foundation

**render-boot.spec.js**

- L110–120: GLX boots as the bare WebGL2 path and presents a frame
- L122–130: TLX boots, installs its three marker, and presents a frame
- L132–151: an unset backend boots TLX when a GPU adapter exists, else GLX

**render-lifecycle.spec.js**

- L28–43: rotate 844x390 <-> 390x844: backing store follows the viewport
- L45–60: simulated hidden tab pauses the race; bfcache return is counted
- L62–76: context loss is observed, then the page reloads to a live context

**rotation-recovery.spec.js**

- L38–53: portrait blocker explains rotation lock and opens controls safely
- L55–106: a gamepad routes to the blocker's buttons, not the car
- L108–115: portrait blocker can exit the race

**scenery-kits.spec.js**

- L79–119: shared scenery kits are bound and Silverstone diagnostics stay finite
- L128–163: `${trackId} emits validated ${themeName} kit facilities` (parameterized)

**season-format.spec.js**

- L87–98: runs the circuits it names, in the order it names them
- L100–108: a classic circuit is a legal round
- L110–129: a shortened calendar crowns its champion at ITS last round
- L137–144: qualifying OFF grids the race without ever opening the sheet
- L146–152: the classic points table pays 10 for a win, not 25
- L154–164: the format PRESELECTS the LAPS row without taking it over
- L172–186: a sprint scores its own table and leaves the round open
- L188–219: the Grand Prix follows on the SAME circuit and closes the round
- L221–238: a sprint's points survive quitting to the menu mid-weekend
- L244–264: shows a terminal screen and opens final standings instead of another race

**season.spec.js**

- L50–55: info() reports seasonMode:true
- L58–67: `does not end a ${laps}-lap race at 360 seconds` (parameterized)
- L70–86: leaving season restores the saved Grand Prix circuit
- L94–112: standings button appears after round 1 completes
- L114–132: standings panel opens and shows drivers table
- L134–186: migrates legacy code points to a stable identity before a custom code edit

**settings-reload.spec.js**

- L33–69: each driving and HUD SettingRow choice is stored and live again after a reload at 844x390

**sliders.spec.js**

- L71–83: `${s.id} is wired: changes its value the right way, label + storage` (parameterized)
- L98–132: a store value outside a slider's own range clamps to its boundary notch, not an extrapolation
- L147–154: LINEARITY: higher slider (more linear) turns more for the same part-input
- L156–166: STEER LOCK: higher slider allows a larger max turn at full lock
- L168–231: OVERALL SPEED lifts BOTH the player's and the AI's top speed
- L244–288: OVERALL SPEED leaves the dial→gear mapping identical
- L294–329: OVERALL SPEED reaches the full gearbox and dial at every setting
- L335–374: OVERALL SPEED clears the old top-gear limiter in MANUAL gears
- L404–421: STEERING levels fan out to the cornering keys and mirror active state
- L423–431: TILT SENSITIVITY macro drives tiltDeg / maxTilt
- L433–445: DRIVING HELP and RACING LINE buttons set their store keys
- L447–455: presets light up the matching simplified controls
- L457–467: ADVANCED toggle shows and hides the granular sliders
- L469–475: editing a granular Advanced slider updates the simplified view

**smoke.spec.js**

- L223–238: jump() sets player speed and lateral offset
- L241–251: park() skips countdown and positions player
- L254–261: race starts and __apex hook is available
- L264–273: grid start renders a non-blank frame
- L276–300: the DRIVING LINE is built for the circuit on the first frame it is on
- L303–345: the select screen is a circuit picker, and YOUR CAR opens the garage **partial**

