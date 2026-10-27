# Browser specifications — batch 05

All 160,000 assigned UTF-8 bytes across 13 text parts were directly read. Byte ranges are half-open; evidence in `specs-05-evidence.json` records whole-file manifest verification, separate part/chunk hashes, individual read output IDs, imports/hooks, intersecting lexical cases and assertion locations. No tests or browser were run; these are contracts inspected in source, not passing results.

The gamepad assignment begins at byte 21801 inside an existing case; its opening setup and preceding assertions are unreviewed. The HUD layout assignment ends at byte 44921 inside the numeric editing case; later statements and recovery cases are unreviewed. AST enclosing boundaries are structural metadata only. All other assigned parts cover complete files. Parameterized declarations and helper assertions are lexical sites rather than runtime counts.

## `tests/specs/gamepad.spec.js`

Assigned bytes `[21801, 31093)`; 11 intersecting lexical case declarations, 26 lexical assertion sites.

| Aspect | Source contract |
|---|---|
| Fixture and hooks | shared/isolated fixture context precedes assigned tail; poll fake navigator pad and direct Input.poll |
| Targets | Input, MenuNav, TopModal/UiLayers; circuit select and pause dialog |
| Behavior | Menu focus seeding, B cancellation, shoulder/trigger menu paging, driving input isolation, repeat delay, larger menu deadzone with right-stick fallback |
| Limits | Only tail of suite is read; first intersecting case begins before assignment. Synthetic pad polls and DOM checks do not establish hardware compatibility. |
| Cleanup | Neutral pad release in repeat case; enclosing fixture setup/teardown outside assigned part unreviewed. |

| Case declaration | Enclosing lines | Coverage |
|---|---|---|
| A activates the focused control | 417–431 | Partial; reviewed byte intersection in JSON |
| A seeds focus rather than clicking when nothing is focused yet | 433–441 | Complete assigned case |
| B closes a plain-div screen via its data-esc-close control | 443–449 | Complete assigned case |
| B closes a native <dialog> screen (pause menu) | 459–476 | Complete assigned case |
| bumpers page the menu instead of shifting gears | 478–489 | Complete assigned case |
| triggers dispatch PageUp/PageDown, not the driving pedals | 491–504 | Complete assigned case |
| gamepad drives the car normally with no menu open (regression guard) | 506–526 | Complete assigned case |
| a held D-pad direction repeats after the initial delay, not before | 528–566 | Complete assigned case |
| an idle pad seeds focus when a menu opens, without a D-pad press | 568–576 | Complete assigned case |
| a later idle poll does not re-seed after focus is cleared | 578–588 | Complete assigned case |
| menu stick nav uses a larger deadzone than driving; right stick still falls back | 590–611 | Complete assigned case |

## `tests/specs/garage-aero.spec.js`

Assigned bytes `[0, 15227)`; 8 intersecting lexical case declarations, 40 lexical assertion sites.

| Aspect | Source contract |
|---|---|
| Fixture and hooks | sharedTest; toMenu then retry title garage entry, reset aero false + deterministic garageStep; phone side/viewport/safe tokens |
| Targets | SetupCamera, Car3D.aeroFlaps, SheetShape; garage aero/camera/livery DOM |
| Behavior | Closed hook error; shut default; eased opening/full travel/faster closing; meaningful flap geometry displacement; button label/pressed state; camera preservation; sun shafts off; bounded actionable camera drawer/editor |
| Limits | Geometry and live present option contracts are not raster proof of flap visibility or livery washout. Phone assertions cover listed shapes and two sides. |
| Cleanup | Returns via cs-done each phone iteration and removes side attribute. Shared aero reset handles module state on entry. |

| Case declaration | Enclosing lines | Coverage |
|---|---|---|
| with the garage closed, garageAero and garageStep say so | 94–104 | Complete assigned case |
| the demo starts shut | 106–110 | Complete assigned case |
| the flap EASES open and reaches full travel, then slams shut faster | 112–132 | Complete assigned case |
| full travel actually MOVES the wing geometry, by a visible amount | 134–156 | Complete assigned case |
| the AERO button drives the flap and shows its state | 161–179 | Complete assigned case |
| the AERO button never moves the camera (turntable and whole-car preset) | 183–199 | Complete assigned case |
| presentOpts keeps screen sun-shafts off after team switches | 206–219 | Complete assigned case |
| garage camera stays clickable and its drawer stays bounded on phones | 224–299 | Complete assigned case |

## `tests/specs/garage-close-one-click.spec.js`

Assigned bytes `[0, 2113)`; 1 intersecting lexical case declarations, 4 lexical assertion sites.

| Aspect | Source contract |
|---|---|
| Fixture and hooks | isolated fixture; 1280x800; toMenu; await garage not busy; Tyres tab; manually expose busy loading plate |
| Targets | Garage close control, loading overlay CSS/hit testing |
| Behavior | cs-done must be top element at center and a single actual mouse click returns to title |
| Limits | Synthetic busy plate is controlled reproduction, not load scheduling. |
| Cleanup | Page isolation; no explicit loading restoration beyond closing garage. |

| Case declaration | Enclosing lines | Coverage |
|---|---|---|
| busy #loading does not block cs-done after Tyres tab | 18–52 | Complete assigned case |

## `tests/specs/garage-first-frame.spec.js`

Assigned bytes `[0, 13165)`; 5 intersecting lexical case declarations, 28 lexical assertion sites.

| Aspect | Source contract |
|---|---|
| Fixture and hooks | plain Playwright fresh TLX boot per case; reduce motion variants; separate touch TLX WebGL2 suites; pageerror hook |
| Targets | Garage entry/prebuild first frame, presented-canvas oracle, garage arrival preview stop, setup pointer lifecycle |
| Behavior | Entry without panel input produces nonblack presented pixels; preview IN/OUT stoppable by 44px touch control with focus restored; blur/pagehide and close/reopen abandon stale pinch IDs while fresh orbit/pinch still work |
| Limits | Entry pixel capture deliberately skipAwait and no snapCam; touches use real taps for stop; synthetic PointerEvents integration does not validate native Safari/compositor timing. |
| Cleanup | Temporary chrome style removed in finally; previews stopped, tuner closed; gesture cancels/up; afterEach checks captured page errors. |

| Case declaration | Enclosing lines | Coverage |
|---|---|---|
| reduce-motion on: bay is non-black after Home → GARAGE | 131–138 | Complete assigned case |
| reduce-motion off: bay is non-black after Home → GARAGE (vt path) | 140–152 | Complete assigned case |
| PREVIEW IN and OUT can be stopped by a visible touch control | 159–195 | Complete assigned case |
| blur and pagehide abandon old pinch IDs before the next gesture | 257–266 | Complete assigned case |
| closing and reopening garage abandons the previous gesture | 268–274 | Complete assigned case |

## `tests/specs/garage-livery-churn.spec.js`

Assigned bytes `[0, 12110)`; 1 intersecting lexical case declarations, 9 lexical assertion sites.

| Aspect | Source contract |
|---|---|
| Fixture and hooks | isolated TLX three-devtools page; force menu world+done+not warming, unique secondary edits, GC and stable geometry baseline |
| Targets | CarMesh.flapState, TLX coState/memState, renderer backend textures, livery inputs |
| Behavior | After warmup 6 edits plus paused edit allocate zero new non-target GPU textures; flap sets/elements, runs, textures and sticky chunk+carSh+tex geometry do not grow |
| Limits | Not total geoLive leak proof: bay mesh oscillation excluded. Requires Chromium CDP GC and internal renderer hooks; finite edit sample. |
| Cleanup | Wrapper instrumentation scoped to isolated page; CDP session not explicitly detached; no resource/process launched by mapping. |

| Case declaration | Enclosing lines | Coverage |
|---|---|---|
| N paint edits in the garage leave GPU textures, flap meshes, flap runs, textures and settled geoLive flat (TLX) | 101–193 | Complete assigned case |

## `tests/specs/garage-livery-fit.spec.js`

Assigned bytes `[0, 7381)`; 4 intersecting lexical case declarations, 12 lexical assertion sites.

| Aspect | Source contract |
|---|---|
| Fixture and hooks | isolated fixture; touch mobile portrait/landscape; headless; UI scale reapplied after garage open |
| Targets | Livery/team garage options layout, zoom-aware content edge |
| Behavior | Options and visible descendants fit body/horizontal edges; true content overhang <=2px; default horizontal scroll <=6px; 75% team pair enabled |
| Limits | Vertical scrolling intentional; 75% excludes legacy scrollWidth phantom, evaluates zoom-adjusted padding. |
| Cleanup | Page isolation; writes measurement annotation and artifact JSONL when executed. |

| Case declaration | Enclosing lines | Coverage |
|---|---|---|
| #cs-options fits inside #cs-body | 93–93 | Complete assigned case |
| #cs-options fits at UI SIZE 75% | 94–96 | Complete assigned case |
| #cs-options fits inside #cs-body | 101–101 | Complete assigned case |
| #cs-options children stay inside content edge | 106–138 | Complete assigned case |

## `tests/specs/garage-out-before-card.spec.js`

Assigned bytes `[0, 24282)`; 8 intersecting lexical case declarations, 16 lexical assertion sites.

| Aspect | Source contract |
|---|---|
| Fixture and hooks | isolated fixture to prevent intro contamination; fullIntro automation opt-in; motion settings; timeline mutation observer/rAF/100ms sampler |
| Targets | LoadingScreen.isAutomation, GarageArrival/start race orchestration, RealRace.launch, Tracks.buildPaced; race settings/quali/results/Data Hub |
| Behavior | Garage-out must occur then required session card without overlap for reduce, Home vt, quick start, qualifying grid, season next, time trial/DAILY and scripted JUMP IN; reduce duration >6s; direct start joins one picker build and reaches lights |
| Limits | Timeline tolerates 120ms end boundary; synthetic script replaces Data Hub network; joins test wraps buildPaced, not engine performance evidence. |
| Cleanup | Stops interval/rAF/observer, quits/cancels intro and hides plate after each path; buildPaced wrapper restored in finally. |

| Case declaration | Enclosing lines | Coverage |
|---|---|---|
| reduce-motion: short garage-out completes before session card | 227–242 | Complete assigned case |
| view-transition / Home vt race: garage-out before flyby card | 244–250 | Complete assigned case |
| quick start (warm race-settings): garage-out before card | 252–263 | Complete assigned case |
| after qualifying: TO THE GRID plays garage-out before the card | 268–294 | Complete assigned case |
| season NEXT RACE with qualifying off: garage-out before the card | 296–336 | Complete assigned case |
| ${…} from the menu: garage-out before the session card | 358–364 | Complete assigned case |
| Data Hub JUMP IN: garage-out before the race card | 367–392 | Complete assigned case |
| joins the menu's build: one track build, and the race reaches the lights | 409–436 | Complete assigned case |

## `tests/specs/garage-pick-cost.spec.js`

Assigned bytes `[0, 8261)`; 1 intersecting lexical case declarations, 7 lexical assertion sites.

| Aspect | Source contract |
|---|---|
| Fixture and hooks | isolated TLX touch mobile; 4 distinct livery picks; wrapper counters + WeakMap source attribution, late frame settle |
| Targets | Car3D.build, LiveryTex.buildAtlas/swatchStats, renderer initTexture/backend createTexture |
| Behavior | Each pick adopts cards, zero repaints, <=1 car build, <=2 atlases, no repeated atlas upload and uploads <=own atlases; nonzero attribution guard |
| Limits | Count ceilings rather than wall time; atlas upload attribution excludes unrelated texture work and credits originating pick. |
| Cleanup | Instrumentation remains until isolated page disposal; no explicit wrapper restoration. |

| Case declaration | Enclosing lines | Coverage |
|---|---|---|
| a livery pick blits its cards and keeps car / atlas / texture work under a ceiling | 20–113 | Complete assigned case |

## `tests/specs/garage-prebuild.spec.js`

Assigned bytes `[0, 2927)`; 1 intersecting lexical case declarations, 8 lexical assertion sites.

| Aspect | Source contract |
|---|---|
| Fixture and hooks | sharedTest; toMenu; rearm prewarm(true) to discard preceding readiness |
| Targets | GaragePrebuild readiness/firstFrame preview LRU |
| Behavior | Own idle cycle reaches ready; preview meshes <=6; drawn readiness agrees with plan frames; menu visit finds prebuilt bay with nonnegative tapMs |
| Limits | Readiness/telemetry is not a latency upper bound or pixel signoff; unit logic tested separately. |
| Cleanup | Returns to menu. |

| Case declaration | Enclosing lines | Coverage |
|---|---|---|
| the idle title pre-builds the garage and GARAGE opens on it | 16–52 | Complete assigned case |

## `tests/specs/gpu-capture.spec.js`

Assigned bytes `[0, 3627)`; 3 intersecting lexical case declarations, 17 lexical assertion sites.

| Aspect | Source contract |
|---|---|
| Fixture and hooks | isolated GLX boot; force webgl2 and remove capture preference; Monza race for active modes |
| Targets | GPU capture dev hook, Spector and webgl-lint lazy scripts |
| Behavior | Default off loads no capture scripts; enabling reports requested mode; capture returns structured success summary or explained failure; lint returns typed findings report |
| Limits | Spector case permits ok:false reason, so does not require actual capture or command count >0; lint count may be zero. GLX only. |
| Cleanup | Fresh page per case; no explicit disable at end. |

| Case declaration | Enclosing lines | Coverage |
|---|---|---|
| gpuCapture is off by default and costs no Spector/webgl-lint script | 23–31 | Complete assigned case |
| spector mode returns a capture summary JSON on SwiftShader | 33–62 | Complete assigned case |
| webgl-lint mode returns findings JSON | 64–83 | Complete assigned case |

## `tests/specs/headless-api.spec.js`

Assigned bytes `[0, 12574)`; 24 intersecting lexical case declarations, 86 lexical assertion sites.

| Aspect | Source contract |
|---|---|
| Fixture and hooks | sharedTest landscape; load Monza and jump to initialize player; explicit reload for virgin-state cases |
| Targets | __apex headless/obs/act/reset and physics/input facade |
| Behavior | Headless toggles; observation schema, scan geometry, wet grip, reset placement/speed/lap/done; act throttle/brake/input clear and step count; 50-step loop yields valid final observation |
| Limits | Schema and simple physics checks do not validate controller quality, determinism across backends, or long-run stability; reset-uninitialized accepts false OR object. |
| Cleanup | Headless off restored in integration paths; reload isolates virgin checks; shared mutable weather/race state can persist unless loadRace resets it. |

| Case declaration | Enclosing lines | Coverage |
|---|---|---|
| returns false by default | 31–35 | Complete assigned case |
| can be set to true and read back | 37–44 | Complete assigned case |
| can be toggled off again | 46–54 | Complete assigned case |
| returns null before track load | 60–65 | Complete assigned case |
| returns full observation object after jump | 67–140 | Complete assigned case |
| done is false when driving normally | 142–146 | Complete assigned case |
| clearR and clearL are positive when on-track at centre | 148–156 | Complete assigned case |
| wallR > x (right wall is to the right of the car) | 158–162 | Complete assigned case |
| wet weather sets gripMult to 0.82 | 164–170 | Complete assigned case |
| returns obs on first call | 176–184 | Complete assigned case |
| throttle for 60 ticks increases speed from rest | 186–193 | Complete assigned case |
| braking reduces speed | 195–202 | Complete assigned case |
| input field in obs reflects what was passed to act | 204–212 | Complete assigned case |
| act(null) clears test input | 214–219 | Complete assigned case |
| n=10 steps advances further than n=1 | 221–231 | Complete assigned case |
| headless mode does not break act() | 233–243 | Complete assigned case |
| returns obs after reset | 249–254 | Complete assigned case |
| places player near the requested lap fraction | 256–264 | Complete assigned case |
| sets initial speed correctly | 266–270 | Complete assigned case |
| resets lap counter to 0 | 272–276 | Complete assigned case |
| done is false immediately after reset | 278–282 | Complete assigned case |
| can reset multiple times and always return valid obs | 284–297 | Complete assigned case |
| returns false when player not yet initialised | 299–312 | Complete assigned case |
| 50-step control loop completes with valid final obs | 318–336 | Complete assigned case |

## `tests/specs/hud-audit.spec.js`

Assigned bytes `[0, 4120)`; 8 intersecting lexical case declarations, 2 lexical assertion sites.

| Aspect | Source contract |
|---|---|
| Fixture and hooks | plain Playwright; landscape/portrait hasTouch; seed steering/manual storage then reload; parked Bahrain |
| Targets | HUD and touch control visibility, gallery screenshots |
| Behavior | Eight mode/orientation captures assert visible HUD and first steering/throttle control in buttons/touch modes |
| Limits | Screenshots are artifacts, no baseline/pixel comparison. Tilt only asserts HUD visibility; first matching control does not prove all controls. Rotate blocker is hidden for captures. |
| Cleanup | Fresh page contexts; gallery output only on execution. |

| Case declaration | Enclosing lines | Coverage |
|---|---|---|
| tilt auto-gear | 53–56 | Complete assigned case |
| tilt manual-gear | 57–60 | Complete assigned case |
| buttons | 61–64 | Complete assigned case |
| touch | 65–68 | Complete assigned case |
| tilt auto-gear | 75–78 | Complete assigned case |
| tilt manual-gear | 79–82 | Complete assigned case |
| buttons | 83–86 | Complete assigned case |
| touch | 87–90 | Complete assigned case |

## `tests/specs/hud-layout.spec.js`

Assigned bytes `[0, 44921)`; 5 intersecting lexical case declarations, 24 lexical assertion sites.

| Aspect | Source contract |
|---|---|
| Fixture and hooks | plain Playwright touch; pinned prior appearance defaults; boot/reload seeded steer/manual/profile; injected notch tokens; frozen/forced-fit race; HUD numeric editing fresh defaults |
| Targets | GameHud fit/sync/invalidate, CSS HUD/control geometry, shared probeHudElements/analyzeOverlap, HudLayout settings |
| Behavior | 24 view x steering x gears cells check controls present, pair clearance and safe area; three adaptive profile/camera cases; minimal profile removal cannot shrink band and hides analysis widgets while retaining driving readouts; numeric draft focus/viewport/persistence begins |
| Limits | Assignment stops inside numeric editing case after first x commit; its later assertions and recovery cases are unreviewed. Geometry only covers enumerated elements; portrait omits landscape plates under rotate gate; prior normal appearance is pinned, not shipped latest look. |
| Cleanup | Temporary minimal sector display override removed; freeze/headless and seeded storage scoped to page; numeric case teardown outside assigned span. |

| Case declaration | Enclosing lines | Coverage |
|---|---|---|
| ${…} / ${…} gears | 533–581 | Complete assigned case |
| no HUD element sits on another, and none leaves the safe area | 601–612 | Complete assigned case |
| hiding the sector box does not shrink every other cluster | 635–662 | Complete assigned case |
| drops the analysis widgets and keeps what you drive by | 679–698 | Complete assigned case |
| numeric HUD edits keep focused drafts visible and commit only valid completed values | 727–802 | Partial; reviewed byte intersection in JSON |

## Production usage evidence and operational limits

LSP resolves `CarMesh.flapState` to its car mesh definition/export and a production `BenchRun.memSample` call. `SetupCamera.presentOpts` and `GameHud.syncPhoneFit` return module-file fallbacks with internal use and exports; direct exported-call coverage remains unverified. Exact query summaries and source locations are in the evidence JSON.

The mapping started no runtime processes and changed no tests, browser code, or runtime source. No binaries occur in this group. Evidence records inspected source behavior only; screenshot outputs, telemetry and counters are not fresh measurements.
