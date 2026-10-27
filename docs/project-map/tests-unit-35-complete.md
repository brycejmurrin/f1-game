# Unit batch 35 — complete source map

All 26 files (4,954 lines) read fully in individually returned ≤100-line source windows; each source response stayed under 10,000 characters. Aggregate response truncation was repaired by rereading the affected windows. No tests, browser, source edits or commits were performed. This records assertion intent, not pass results. SHA-256 is over current file bytes.

Navigation used the local code-nav shell LSP, not the connected remote checkout. Successful outlines: Onboard, PaceMath, OverlayFeed, OverlayRender, TvGraphics, RaceControl, Particles, Parts, Input, Collide, js/agent/apex.js. Definitions: Assets→js/render/shared/assets.js:4; Car3D.build→js/car/car3d.js:237; Input.rumble→js/input/haptics.js:130; Input.setHaptics→js/input/haptics.js:7; OvertakeMode.lines/prepare/consume→js/race/overtake-mode.js:76/123/136. Apex/AgentObs/AgentAct were unresolved aliases, corrected to ApexApi through file outline and obs symbol lookup (:1702). G.updateCar is not a façade member; bounded local source located updateCar at js/game.js:4820. Tools outside js were navigated by source text.

Production windows directly inspected: js/game.js:5070–5148 (scan gate and vStd arming), js/car/parts.js:847–906 (availability/equivalent resolve), js/agent/apex.js:1702–1795 (scan and done), sw.js:1035–1105 (own-page fallback), tools/lib/over-road-scan.cjs:40–115 (covered-neighbor and provenance). LSP outline anchors below are navigation evidence rather than claims that whole production files were read.

Rows give complete test call range, assertion/helper-call line spans, production target, and semantic meaning. For generated calls the shared lexical range is retained and concrete variants are identified in the fixture/meaning. Shared fixtures are read in full with each file; their dependencies are mapped, not executed.

## tests/unit/node-plan.test.mjs

SHA-256 `d92a2e53cba3dbbcae2442cd91ba5bc62e37df1fd713d513941a69bd6163fa44`; full read 1–275; windows 1–100, 101–200, 201–275.

Fixture and limits: Real CI workflow/group registry and tooling-fast roster; execute callbacks record argv instead of launching suites. Paths passed to plan are hypothetical diffs; unknown/new/nowhere fixtures deliberately need not exist.

Target: tools/ci/node-plan.mjs:92,148,165,183,253; tools/ci/run-group.mjs:24,35; .github/workflows/ci.yml.

| Case (source name) | Full range | Assertion / helper spans | Target | Meaning / boundary |
|---|---|---|---|---|
| every scoped script is a gate script, and every group it names exists | 26–34 | 29, 30, 32, 33 | tools/ci/node-plan.mjs; tools/ci/deploy.mjs; tests/groups.json | Gate membership and browser ownership. Limits above apply. |
| a UI-only diff skips the VM slices; the fast scripts are never in the plan's hands | 36–47 | 38, 39, 40, 41, 43, 44, 45, 46 | tools/ci/node-plan.mjs:92,148,165,183,253 | UI diff skips expensive VM work and exports thinning. Limits above apply. |
| known unit ownership narrows the node plan, while tooling-fast and unknown files stay safe | 49–67 | 51, 52, 53, 56, 57, 58, 62, 63, 65, 66 | tools/ci/node-plan.mjs:92,148,165,183,253 | Known unit ownership narrows and unknown unit fails safe. Limits above apply. |
| PR matched plans skip only tooling-fast ∩ always-on topical; --all and fail-safe do not | 69–102 | 74, 76, 77–78, 83, 87, 88, 91, 92, 96, 97, 98, 99, 101 | tools/ci/node-plan.mjs:92,148,165,183,253 | No duplicate floor/topical overlap and full plans retain all files. Limits above apply. |
| matched PR runners preserve generated flags, exact remaining rosters and isolation | 104–136 | 108–110, 113, 115, 116, 117, 127–129, 130, 133, 134 | tools/ci/run-group.mjs:24,35; tools/ci/run-node-group.mjs | Filtered runners preserve argv isolation environments and stop after failed phase. Limits above apply. |
| a circuit-only diff runs the elevation twin narrowed to that circuit | 138–143 | 140, 141, 142 | tools/ci/node-plan.mjs:92,148,165,183,253 | Circuit diff exports imola scope. Limits above apply. |
| a circuit-only diff skips the scripts whose files never build that circuit (read, not listed) | 145–167 | 150, 151, 152, 153, 156, 159, 160, 162, 163, 164, 165, 166 | tools/ci/node-plan.mjs:92,148,165,183,253 | Actual circuit consumers narrow imola/portimao/monza and unreadable scripts fail safe. Limits above apply. |
| a game.js diff runs every VM slice, unscoped | 169–173 | 171, 172 | tools/ci/node-plan.mjs:92,148,165,183,253 | Engine edit runs all VM slices without circuit scope. Limits above apply. |
| fail safe: no diff, an infra path, a unit file, a harness, or an unrouted path runs everything | 175–187 | 182, 183, 184, 186 | tools/ci/node-plan.mjs:92,148,165,183,253 | Empty infra harness unknown diff selects every scoped script. Limits above apply. |
| ci.yml: the node-suites job plans on a pull request and guards exactly the scoped scripts | 189–246 | 190, 191, 193, 194, 195, 196, 201, 208, 210, 211, 212, 213, 215, 216, 221, 224–226, 234–236, 237, 239, 240, 242–243, 244–245 | .github/workflows/ci.yml; tests/groups.json | Workflow text retains PR base resolution dynamic shards planned guards thinning and parseable npm gate. Limits above apply. |
| a spec edit: an ADAPTED spec runs vm-page; a twinned spec's group runs no VM script (2026-10-05) | 248–258 | 253, 254, 256, 257 | tools/ci/node-plan.mjs:92,148,165,183,253 | Adapted logging runs page-a while browser twin edit stays browser-owned. Limits above apply. |
| L9: a circuit an ADAPTED spec builds keeps test:vm-page in the plan (2026-10-09) | 260–275 | 266, 267, 268, 269, 270, 272, 273, 274 | tools/ci/node-plan.mjs:92,148,165,183,253 | Adapted runner circuit union retains cota page-b and excludes unrelated dijon. Limits above apply. |

## tests/unit/nontext-contrast.test.mjs

SHA-256 `07acce8010e0563f21f792d5ffd79302ac370ea062abd2a68b17aaa78ae4f370`; full read 1–543; windows 1–100, 101–200, 201–300, 301–400, 401–500, 501–543.

Fixture and limits: cssRules helper and local sRGB/OKLab resolver/cascade; modeled shipped panel opacity and black/asphalt/mid-grey backgrounds, nine themes. Static math does not prove browser cascade, all user opacity choices, all imagery or accessibility overall.

Target: css/tokens.css; css/hud.css; css/components.css; css/overlays.css.

| Case (source name) | Full range | Assertion / helper spans | Target | Meaning / boundary |
|---|---|---|---|---|
| the focus ring clears 3:1 against every surface it can land on | 188–204 | 200–203 | css/tokens.css; css/hud.css; css/components.css; css/overlays.css | Focus ratio at least 3 across enumerated surfaces. Limits above apply. |
| the focus ring is a light neutral, not the brand red | 206–218 | 210–212, 214–215, 216–217 | css/tokens.css; css/hud.css; css/components.css; css/overlays.css | White focus token and minimum two-pixel outline distinguish keyboard focus. Limits above apply. |
| the selected boundary is perceivable against the ground and the idle edge | 222–236 | 228–230, 233–235 | css/tokens.css; css/hud.css; css/components.css; css/overlays.css | Selected red boundary clears ground and own fill. Limits above apply. |
| the idle control edge is exempt, and this test says why out loud | 238–252 | 246–248, 249–251 | css/tokens.css; css/hud.css; css/components.css; css/overlays.css | Idle labeled edge exemption deliberately preserves approximately 1.55 ratio. Limits above apply. |
| every var(--accent) consumer is decoration, so the dark team skins are exempt | 281–302 | 291–296, 301 | css/tokens.css; css/hud.css; css/components.css; css/overlays.css | Accent consumer counts freeze documented ornamental uses across all stylesheets. Limits above apply. |
| a team accent may be dark, but --red and --focus must not follow it | 304–318 | 310, 313–316 | css/tokens.css; css/hud.css; css/components.css; css/overlays.css | Team scopes may only override accent and its ink. Limits above apply. |
| every team's --accent-ink is READABLE on that team's --accent, and is the better of the two candidates | 320–348 | 336, 341–343, 344–346 | css/tokens.css; css/hud.css; css/components.css; css/overlays.css | Each team ink is the higher-contrast theme-independent neutral and clears 4.5. Limits above apply. |
| every token LIGHT re-points is restated, at its :root value, on every in-race overlay | 480–499 | 482, 484, 490, 491, 496, 498 | css/tokens.css; css/hud.css; css/components.css; css/overlays.css | Overlay scopes repeat dark/light and high-contrast tokens. Limits above apply. |
| the radio card, readouts, chips, flags and metrics clear 4.5:1 (text) / 3:1 (state) in every theme | 501–509 | 508 | css/tokens.css; css/hud.css; css/components.css; css/overlays.css | All modeled text/state pairs meet 4.5/3 across themes and scenes. Limits above apply. |
| anti-vacuity: the scope as it shipped before fails LIGHT the way it was reported | 511–522 | 519, 520, 521 | css/tokens.css; css/hud.css; css/components.css; css/overlays.css | Deleting scope reproduces low-contrast historical failure as resolver control. Limits above apply. |
| colour vision: a WARNING never reads as a HIT, and damage levels 1 / 2 / 3 stay three colours | 524–543 | 542 | css/tokens.css; css/hud.css; css/components.css; css/overlays.css | Warning hit and middle damage colors retain OKLab lightness separation in default/CVD modes. Limits above apply. |

## tests/unit/nurburgring-eifel-horizon.test.mjs

SHA-256 `1c2ba334dfd1a1411944d4af7512bd29f25095ddb5eb81f727c6d150d01f03ed`; full read 1–35; windows 1–35.

Fixture and limits: Source regex over committed scenery; checks authored options and placement spelling, no terrain raster or landmark visibility.

Target: js/circuits/scenery/nurburgring.js.

| Case (source name) | Full range | Assertion / helper spans | Target | Meaning / boundary |
|---|---|---|---|---|
| nurburgring mountain rock[] stays spruce-green (no beige sand mesas) | 14–23 | 16, 19–20, 21 | js/circuits/scenery/nurburgring.js | At least four rock palettes are green-dominant within spruce intensity band. Limits above apply. |
| nurburgring Burg Nürburg is compass-placed NNE on a forested cone | 25–35 | 26, 27–28, 29–30, 33, 34 | js/circuits/scenery/nurburgring.js | Burg landmark identity 10-degree bearing engine compass conversion and green cone are authored. Limits above apply. |

## tests/unit/obs-act-edge-vm.test.mjs

SHA-256 `8d4fc34428730a8c40727d0fcc231f94e8522bc0e78a102c5767cfbe16316a9f`; full read 1–232; windows 1–100, 101–200, 201–232.

Fixture and limits: One createGame Monza VM; restore tuning/headless before each race, helper assertions closeTo/gt/lt; three generated seam cases use monaco/suzuka/spa. JSON physics hooks only, no rendered/browser claim.

Target: js/agent/apex.js:1702-1795; js/game.js:6235,6531; js/race/race-control.js:117.

| Case (source name) | Full range | Assertion / helper spans | Target | Meaning / boundary |
|---|---|---|---|---|
| act(input, dt, 0) returns current obs without advancing s | 39–46 | 45 | js/agent/apex.js:1702-1795; js/game.js:6235,6531; js/race/race-control.js:117 | Zero-step act leaves position unchanged. Limits above apply. |
| act(null, dt, 0) with n=0 also does not advance physics | 48–54 | 53 | js/agent/apex.js:1702-1795; js/game.js:6235,6531; js/race/race-control.js:117 | Null-input zero-step act also leaves position unchanged. Limits above apply. |
| act with n=1 advances further than n=0 | 56–63 | 62 | js/agent/apex.js:1702-1795; js/game.js:6235,6531; js/race/race-control.js:117 | One act step advances farther than zero. Limits above apply. |
| reset(0.999) places player near end of lap without incrementing lap | 67–75 | 72, 73, 74 | js/agent/apex.js:1702-1795; js/game.js:6235,6531; js/race/race-control.js:117 | Reset near end places car within 50m without lap increment. Limits above apply. |
| driving past finish line from frac=0.999 increments lap counter | 77–88 | 87 | js/agent/apex.js:1702-1795; js/game.js:6235,6531; js/race/race-control.js:117 | Forward seam traversal increments lap within 120 steps. Limits above apply. |
| scan returns finite values immediately after reset near seam | 90–99 | 93, 95, 96, 97 | js/agent/apex.js:1702-1795; js/game.js:6235,6531; js/race/race-control.js:117 | Immediate seam scan has finite curvature width and walls. Limits above apply. |
| scan returns no NaN at 5 positions near s = track.total | 103–116 | 115 | js/agent/apex.js:1702-1795; js/game.js:6235,6531; js/race/race-control.js:117 | Five near-end scan positions never produce nonfinite values. Limits above apply. |
| scan distances wrap correctly — each point is beyond the previous | 118–127 | 123, 124, 125, 126 | js/agent/apex.js:1702-1795; js/game.js:6235,6531; js/race/race-control.js:117 | Wrapped scan retains distances 10/30/60 and positive width. Limits above apply. |
| clearR and clearL are positive for scan at wrap-around positions | 129–134 | 133 | js/agent/apex.js:1702-1795; js/game.js:6235,6531; js/race/race-control.js:117 | Both current clearances positive at seam. Limits above apply. |
| done is false immediately after reset() | 138–141 | 140 | js/agent/apex.js:1702-1795; js/game.js:6235,6531; js/race/race-control.js:117 | Reset is not terminal. Limits above apply. |
| done is false during normal forward driving | 143–151 | 150 | js/agent/apex.js:1702-1795; js/game.js:6235,6531; js/race/race-control.js:117 | Normal forward run stays nonterminal. Limits above apply. |
| done becomes true when wrong-way is active | 153–165 | 164 | js/agent/apex.js:1702-1795; js/game.js:6235,6531; js/race/race-control.js:117 | Wrong-way makes episode terminal. Limits above apply. |
| done resets to false after reset() clears wrong-way | 167–181 | 179, 180 | js/agent/apex.js:1702-1795; js/game.js:6235,6531; js/race/race-control.js:117 | Reset clears wrong-way terminal state. Limits above apply. |
| obs() returns no NaN or Infinity at 20 positions around full lap | 185–200 | 199 | js/agent/apex.js:1702-1795; js/game.js:6235,6531; js/race/race-control.js:117 | Twenty full-lap samples keep selected observation/scan fields finite. Limits above apply. |
| reward object fields are always finite numbers | 202–214 | 213 | js/agent/apex.js:1702-1795; js/game.js:6235,6531; js/race/race-control.js:117 | Sixty step rewards have finite speed offtrack wall components. Limits above apply. |
| scan near seam is finite on ${trackId} | 219–231 | 230 | js/agent/apex.js:1702-1795; js/game.js:6235,6531; js/race/race-control.js:117 | Generated monaco/suzuka/spa near-seam scans remain finite with positive width. Limits above apply. |

## tests/unit/offline-precache-nav.test.mjs

SHA-256 `6ecb3f39febe5057e601330e3fbe5bc388265a566ffe5a0bdf27baf0b297e23e`; full read 1–143; windows 1–100, 101–143.

Fixture and limits: VM service worker, fake https://apex.test origin, Map caches and mocked fetch; NAV_RACE_MS alone is accelerated to microtask. Build321 and response bodies are fixtures. No real installation/network timing.

Target: sw.js:58,680,1054-1098; tools/gen/gen-shell.mjs:232.

| Case (source name) | Full range | Assertion / helper spans | Target | Meaning / boundary |
|---|---|---|---|---|
| a stalled controller.html navigation is never answered with the game shell (late network wins) | 61–78 | 75, 77 | sw.js:58,680,1054-1098; tools/gen/gen-shell.mjs:232 | Stalled other-page navigation waits for late network instead of game shell. Limits above apply. |
| offline, an uncached controller.html fails honestly instead of opening the game | 80–84 | 83 | sw.js:58,680,1054-1098; tools/gen/gen-shell.mjs:232 | Uncached offline controller returns Response.error. Limits above apply. |
| offline, a precached controller.html answers under its own URL | 86–89 | 88 | sw.js:58,680,1054-1098; tools/gen/gen-shell.mjs:232 | Own cached controller URL serves controller. Limits above apply. |
| the game's own addresses still fall back to the precached shell on a slow link | 91–96 | 94 | sw.js:58,680,1054-1098; tools/gen/gen-shell.mjs:232 | Game root and subdirectory aliases can use game fallback. Limits above apply. |
| install seeds controller.html as an optional (non-fatal) precache | 98–112 | 111 | sw.js:58,680,1054-1098; tools/gen/gen-shell.mjs:232 | Install caches optional controller page. Limits above apply. |
| install seeds locales/manifest.json as optional (English-only locale scaffold) | 114–129 | 127, 128 | sw.js:58,680,1054-1098; tools/gen/gen-shell.mjs:232 | Install fetches and caches optional locale manifest. Limits above apply. |
| an install where controller.html 404s still completes (optional, not essential) | 131–143 | 142 | sw.js:58,680,1054-1098; tools/gen/gen-shell.mjs:232 | Controller 404 does not abort install or create cache entry. Limits above apply. |

## tests/unit/offtrack-edges-vm.test.mjs

SHA-256 `d6789cd1152240ba4f0477517c46a5cd76be0b6dfc3fd3280b80cd05009aac5a`; full read 1–56; windows 1–56.

Fixture and limits: Monza createGame VM, reset tuning and pace1; actual post collision stepping. Placement-specific numeric tolerances, no fleet collision sweep.

Target: js/game.js:6235,6531; js/physics/collide.js:281.

| Case (source name) | Full range | Assertion / helper spans | Target | Meaning / boundary |
|---|---|---|---|---|
| a gantry leg stops a car from the road side, 1.1 m short of its face | 31–40 | 39 | js/game.js:6235,6531; js/physics/collide.js:281 | Gantry post pushes road-side overlap to face with car clearance. Limits above apply. |
| the grass behind a gantry leg is not walled off, and a car there stays outside it | 42–56 | 49, 55 | js/game.js:6235,6531; js/physics/collide.js:281 | Runoff remains accessible and outer overlap resolves outward rather than snapping onto road. Limits above apply. |

## tests/unit/offtrack-vm.test.mjs

SHA-256 `051d65b8d16778855ee86174367afe1a82f57d48c3b9e9a5c3f11b44454a3b81`; full read 1–166; windows 1–100, 101–166.

Fixture and limits: Single game VM with fresh tuning/headless, Monza dry pace1 except final Bahrain case; controlled grass/tarmac launches and explicit input cleanup. No browser/input device or image coverage.

Target: js/game.js:6235,6531; js/race/race-control.js:117.

| Case (source name) | Full range | Assertion / helper spans | Target | Meaning / boundary |
|---|---|---|---|---|
| prog tracks s: forward driving advances prog ≈ s-progress | 39–51 | 49, 50 | js/game.js:6235,6531; js/race/race-control.js:117 | Forward progress agrees with arc advance within 2m. Limits above apply. |
| facing backwards and throttling DECREASES progress (no forward cheat) | 53–64 | 63 | js/game.js:6235,6531; js/race/race-control.js:117 | Backward facing throttle decreases progress. Limits above apply. |
| wrong-way is flagged when driving against the track | 66–80 | 79 | js/game.js:6235,6531; js/race/race-control.js:117 | Reverse travel eventually sets wrong-way. Limits above apply. |
| brake at a standstill crawls the car backwards (reverse), then throttle recovers | 82–95 | 92, 93, 94 | js/game.js:6235,6531; js/race/race-control.js:117 | Brake reverses at bounded crawl and throttle restores forward speed. Limits above apply. |
| driving onto grass and back recovers (slowed off, speeds up on return) | 97–117 | 115, 116 | js/game.js:6235,6531; js/race/race-control.js:117 | Matched grass/tarmac launches prove offroad slowdown and recovery. Limits above apply. |
| auto-rescue: a wrong-way car is recovered to the racing line facing forward | 119–136 | 133, 134, 135 | js/game.js:6235,6531; js/race/race-control.js:117 | Wrong-way rescue restores center line and clears wrong-way. Limits above apply. |
| auto-rescue: a car beached deep off-track is recovered | 138–151 | 150 | js/game.js:6235,6531; js/race/race-control.js:117 | Beached runoff car returns to line. Limits above apply. |
| stopped on-track: throttle held is never stuck at 0; gas released is left parked | 153–166 | 164, 165 | js/game.js:6235,6531; js/race/race-control.js:117 | Stopped Bahrain car moves under throttle and remains parked with released gas. Limits above apply. |

## tests/unit/onboard.test.mjs

SHA-256 `ba4869b8df7ad1c516def49f11dc2cffb7a559f156edbef41849976fabfa0c84`; full read 1–288; windows 1–100, 101–200, 201–288.

Fixture and limits: Module VM with stub binding tables, BrakeCue report, player flags, announce recorder and Map store. Source regex denies selected geometry/car-write spellings; does not prove whole-program isolation or real banner paint.

Target: js/ui/onboard.js:29,97.

| Case (source name) | Full range | Assertion / helper spans | Target | Meaning / boundary |
|---|---|---|---|---|
| the brake mark fires once when the cue is genuinely urgent, and is remembered | 69–83 | 72, 75, 76, 78, 79, 82 | js/ui/onboard.js:29,97 | Urgent brake cue fires once and persists bitmask. Limits above apply. |
| overtake and aero fire on their own signals, and two marks never land together | 85–100 | 89, 91, 93, 95, 96, 98, 99 | js/ui/onboard.js:29,97 | Independent signals use priority and eight-second separation. Limits above apply. |
| a coach mark never stomps a race message, and never speaks outside a race | 102–118 | 106, 109, 114, 117 | js/ui/onboard.js:29,97 | Busy announcement and non-race states suppress marks. Limits above apply. |
| a paused race shows no mark, and the mark survives to the resume | 120–129 | 124, 125, 128 | js/ui/onboard.js:29,97 | Paused race preserves unseen mark until resume. Limits above apply. |
| the wording names the control the player actually has | 131–141 | 134, 137, 140 | js/ui/onboard.js:29,97 | Touch and keyboard wording follows available controls. Limits above apply. |
| a rebound key is what the mark names | 148–160 | 158–159 | js/ui/onboard.js:29,97 | Rebound two-slot aero keys appear in order. Limits above apply. |
| a controller is named by its buttons, not by a keyboard key | 162–166 | 165 | js/ui/onboard.js:29,97 | Active controller names actual button. Limits above apply. |
| an idle connected controller does not override the player's active keyboard | 168–178 | 171–172, 176–177 | js/ui/onboard.js:29,97 | Idle connected pad does not steal active keyboard prompt. Limits above apply. |
| the aero mark waits for the ARM, and never fires in auto mode | 180–205 | 187, 190, 191, 197, 204 | js/ui/onboard.js:29,97 | Aero requires armed manual closed flap rather than proximity. Limits above apply. |
| a red-flag standing restart does not burn one of the two races | 207–220 | 214, 216, 219 | js/ui/onboard.js:29,97 | Red-flag restart with nonzero race clock preserves race budget. Limits above apply. |
| it stops after two races even with a mark unseen, and reset() puts it back | 222–232 | 225, 227, 228, 230, 231 | js/ui/onboard.js:29,97 | Race cap ends prompts and reset restores state. Limits above apply. |
| harvest clip cue fires once on a full pack at straight-line pace | 234–247 | 242, 243, 244, 246 | js/ui/onboard.js:29,97 | Full energy at straight pace yields one harvest message. Limits above apply. |
| the module reads reports only — no Tracks, no curvature, no car writes | 249–254 | 250, 251, 252, 253 | js/ui/onboard.js:29,97 | Static guard disallows track geometry and selected car-write forms. Limits above apply. |
| the race budget survives a reload: two races in one session, a third start in the next, done | 259–271 | 263, 264, 266, 268, 270 | js/ui/onboard.js:29,97 | Race budget persists across reload and reset clears stored count. Limits above apply. |
| a mark the banner refuses stays unseen and fires once the banner accepts it | 276–288 | 281, 282, 285, 286, 287 | js/ui/onboard.js:29,97 | Rejected banner delivery remains unseen until accepted retry. Limits above apply. |

## tests/unit/ot-ahead-scan-gate.test.mjs

SHA-256 `18f1388f5276b62a765420f30837edc5c7dbcbabf316cc8b3e1ac369eaf6e2df`; full read 1–86; windows 1–86.

Fixture and limits: Real Monza game VM wraps Collide.scanOtAhead to count and record radius, retires other cars, pins AI crossing/allowance state. Functional call counts, no measured runtime speedup.

Target: js/game.js:5070-5139; js/physics/collide.js:250; js/race/overtake-mode.js:76.

| Case (source name) | Full range | Assertion / helper spans | Target | Meaning / boundary |
|---|---|---|---|---|
| the ahead scan is skipped in clear air with no allowance, and runs when OT energy is held | 44–56 | 50, 54 | js/game.js:5070-5139; js/physics/collide.js:250; js/race/overtake-mode.js:76 | No allowance/no crossing skips scan while held energy scans each step. Limits above apply. |
| the ahead scan runs on the step that crosses the detection line while detection is open, and not when it is closed | 58–72 | 64, 70 | js/game.js:5070-5139; js/physics/collide.js:250; js/race/overtake-mode.js:76 | Open detection crossing scans and safety-car closed crossing skips. Limits above apply. |
| a held allowance keeps a finite, positive ahead-search radius while reversing | 74–86 | 82, 84 | js/game.js:5070-5139; js/physics/collide.js:250; js/race/overtake-mode.js:76 | Reverse held allowance scans with finite positive radius. Limits above apply. |

## tests/unit/output-level-mcp.test.mjs

SHA-256 `7e16509142609b2ca90f32c55023b5d327452c85fd8319f5ab681365a10e08d9`; full read 1–395; windows 1–100, 101–200, 201–300, 301–395.

Fixture and limits: Real gateway child around inline fake JSONL MCP process in isolated temp root. Synthetic echo/collision/failure tools, split streams, delayed schemas and grandchildren. Does not contact a live MCP server. Windows skips process-group cleanup cases.

Target: tools/mcp/output-level-mcp.mjs:29,37,54,58,131.

| Case (source name) | Full range | Assertion / helper spans | Target | Meaning / boundary |
|---|---|---|---|---|
| annotation hints equal to the MCP 2025-06-18 defaults are dropped; the rest pass through | 59–69 | 60, 61–62, 63, 64, 66, 67, 68 | tools/mcp/output-level-mcp.mjs:29,37,54,58,131 | Default MCP hints and duplicate annotation title removed while nondefaults survive. Limits above apply. |
| help starts no executable and documents presentation levels | 71–74 | 73 | tools/mcp/output-level-mcp.mjs:29,37,54,58,131 | Help exits cleanly without starting nonexistent executable. Limits above apply. |
| paginated schemas retain upstream constraints and full output schema; collision is explicit | 76–97 | 79, 80, 81, 83, 84, 85, 86, 87, 88, 91, 92, 93, 94, 96 | tools/mcp/output-level-mcp.mjs:29,37,54,58,131 | Paginated schema decoration retains constraints and resolves parameter/name collisions. Limits above apply. |
| compact and diagnostic retain artifacts; full is exact; reading never repeats the action | 99–119 | 104, 105, 106, 107, 108, 109, 111, 114, 115, 116, 117, 118 | tools/mcp/output-level-mcp.mjs:29,37,54,58,131 | Compact/diagnostic save exact full artifacts and local reading never reruns actions. Limits above apply. |
| collection reader restores exact fetched rows and refuses incompatible options | 121–135 | 130, 131, 132, 133, 134 | tools/mcp/output-level-mcp.mjs:29,37,54,58,131 | Collection pages restore saved rows and reject incompatible requests. Limits above apply. |
| initialize, progress, cancellation, bidirectional ids including null, concurrent replies and upstream errors survive | 137–159 | 140, 141, 142, 145, 146, 148, 150, 153, 154, 155, 156, 157, 158 | tools/mcp/output-level-mcp.mjs:29,37,54,58,131 | Protocol metadata progress bidirectional null/zero ids cancellation concurrency and errors survive. Limits above apply. |
| JSONL buffering accepts split input; stdin EOF terminates own child | 161–169 | 165, 167, 168 | tools/mcp/output-level-mcp.mjs:29,37,54,58,131 | Split JSONL input and EOF owned-child cleanup work. Limits above apply. |
| upstream failure exits gateway and does not expose upstream stderr | 171–175 | 173, 174 | tools/mcp/output-level-mcp.mjs:29,37,54,58,131 | Upstream death preserves exit code and hides private stderr. Limits above apply. |
| spawn failure closes gateway promptly | 177–182 | 181 | tools/mcp/output-level-mcp.mjs:29,37,54,58,131 | Missing executable yields prompt actionable failure. Limits above apply. |
| output schema local references retain their original target after adding the envelope | 185–192 | 189, 190, 191 | tools/mcp/output-level-mcp.mjs:29,37,54,58,131 | Output-schema refs relocate while example data remains literal. Limits above apply. |
| cancellation while discovering schemas never dispatches the cancelled action | 194–201 | 199, 200 | tools/mcp/output-level-mcp.mjs:29,37,54,58,131 | Cancelled schema discovery never invokes upstream action. Limits above apply. |
| original retrieval restores saved image blocks without executing the action again | 203–217 | 210, 211, 212, 213, 216 | tools/mcp/output-level-mcp.mjs:29,37,54,58,131 | Original artifact retrieval restores image blocks and enforces full/size constraints. Limits above apply. |
| failure stderr is retained privately with an actionable artifact reference | 219–228 | 222, 224, 225, 226, 227 | tools/mcp/output-level-mcp.mjs:29,37,54,58,131 | Failure stderr artifact is private mode0600 and stderr exposes only reference. Limits above apply. |
| stdin EOF lets the upstream perform graceful cleanup before escalation | 230–237 | 235, 236 | tools/mcp/output-level-mcp.mjs:29,37,54,58,131 | EOF gives child opportunity for graceful cleanup. Limits above apply. |
| EOF bounds ignored SIGTERM and cleans the owned grandchild process group | 248–258 | 255, 256, 257 | tools/mcp/output-level-mcp.mjs:29,37,54,58,131 | POSIX EOF cleanup kills ignored-SIGTERM owned descendants. Limits above apply. |
| closed object branches in composed input schemas accept the presentation key | 260–270 | 265, 266, 267, 268, 269 | tools/mcp/output-level-mcp.mjs:29,37,54,58,131 | Closed composed root schemas accept stripped presentation key. Limits above apply. |
| same-object local refs accept outputLevel without opening nested values or original definitions | 272–290 | 280, 283, 284, 285, 287, 288, 289 | tools/mcp/output-level-mcp.mjs:29,37,54,58,131 | Same-object local refs decorate root while preserving nested restrictions and name collisions. Limits above apply. |
| nested root refs retain the original argument restrictions | 292–305 | 302, 303, 304 | tools/mcp/output-level-mcp.mjs:29,37,54,58,131 | Nested root references preserve closed original schemas. Limits above apply. |
| same-instance reference cycles terminate while being decorated | 307–316 | 314, 315 | tools/mcp/output-level-mcp.mjs:29,37,54,58,131 | Reference cycle decoration terminates and preserves originals. Limits above apply. |
| local refs inside an embedded resource use its own definitions | 318–338 | 328, 330, 331, 332, 333, 334, 335, 337 | tools/mcp/output-level-mcp.mjs:29,37,54,58,131 | Embedded resource refs use local rather than outer definitions. Limits above apply. |
| a root resource id is retained once while local refs are relocated | 340–354 | 347, 349, 351, 352, 353 | tools/mcp/output-level-mcp.mjs:29,37,54,58,131 | Root resource id appears once while original refs relocate. Limits above apply. |
| retrieval tool name avoids upstream names regardless of pagination order | 357–370 | 361, 363, 367, 369 | tools/mcp/output-level-mcp.mjs:29,37,54,58,131 | Retrieval name avoids collisions across pagination. Limits above apply. |
| unexpected root exit cleans the owned grandchild before gateway completion | 372–381 | 379, 380 | tools/mcp/output-level-mcp.mjs:29,37,54,58,131 | Unexpected root death cleans owned descendants before completion. Limits above apply. |
| opaque empty cursors and tool-list changes preserve discovery and collision safety | 383–395 | 387, 388, 390, 394 | tools/mcp/output-level-mcp.mjs:29,37,54,58,131 | Empty cursor and tools-list-change invalidate discovery safely. Limits above apply. |

## tests/unit/output-surface.test.mjs

SHA-256 `82671cf4f01b37608e0cd27048773b145cd749fb34cdbf55b570fe1c2d70171e`; full read 1–90; windows 1–90.

Fixture and limits: Real tool walk/package/MCP config/policy catalog plus fake lib/check/env path+source inventory. Static flag mentions are not executable CLI guarantees.

Target: tools/gen/gen-output-surface.mjs:24,38,52,59,63,132,138; docs/agent-output/policies.json.

| Case (source name) | Full range | Assertion / helper spans | Target | Meaning / boundary |
|---|---|---|---|---|
| static inventory distinguishes commands from libraries, data and ambiguous modules | 12–20 | 13, 14, 15, 16, 17, 18, 19 | tools/gen/gen-output-surface.mjs:24,38,52,59,63,132,138; docs/agent-output/policies.json | Classifier separates libraries ambiguous modules data assets and command candidates. Limits above apply. |
| catalog covers every file, npm command and configured MCP route without fake native flags | 22–71 | 24, 25, 27, 28, 29, 30, 31, 32, 34, 36, 37, 38, 41, 43, 44, 45, 46, 47, 48, 50, 51, 53, 55, 56, 57, 59, 60, 61, 64, 67, 68, 69 | tools/gen/gen-output-surface.mjs:24,38,52,59,63,132,138; docs/agent-output/policies.json | Catalog covers all real files scripts MCP routes and policies without redundant arrays/aggregates. Limits above apply. |
| static flag mentions are labelled and generation is deterministic | 73–81 | 77, 78, 79, 80 | tools/gen/gen-output-surface.mjs:24,38,52,59,63,132,138; docs/agent-output/policies.json | Fixture flag mentions labeled static and reversed input order renders identically to committed catalog. Limits above apply. |
| generator help, unknown arguments and a clean --check never write | 83–90 | 87, 88 | tools/gen/gen-output-surface.mjs:24,38,52,59,63,132,138; docs/agent-output/policies.json | Help unknown argument and clean check return expected statuses without writing catalog. Limits above apply. |

## tests/unit/over-road-scan.test.mjs

SHA-256 `9bb9d5ea790f48d37f969eb6cb3ee18157b90ae0ecf55b23a963869f32a81ac9`; full read 1–78; windows 1–78.

Fixture and limits: Synthetic square/triangle meshes and 60-sample straight reference line; grade and deck fractions controlled. Tests scanner not a shipped circuit build.

Target: tools/lib/over-road-scan.cjs:13-115.

| Case (source name) | Full range | Assertion / helper spans | Target | Meaning / boundary |
|---|---|---|---|---|
| a 0.5 m intrusion reads the same over a flat road and a 5 % grade (#1942) | 38–42 | 39, 41 | tools/lib/over-road-scan.cjs:13-115 | Half-meter obstruction remains equal on flat and five-percent grade. Limits above apply. |
| a smooth climb aliased into a triangle's footprint is still cleared (#1942) | 44–53 | 50, 52 | tools/lib/over-road-scan.cjs:13-115 | Covered smooth-climb alias clears but actual lifted triangle fails. Limits above apply. |
| a neighbour must lie under the triangle to count, whatever its height (#1942) | 55–60 | 59 | tools/lib/over-road-scan.cjs:13-115 | Tall neighbors outside footprint cannot erase obstruction. Limits above apply. |
| crossover verdict is monotonic: the same same-deck intrusion fails at 1, 1.6 and 3 m (#1944) | 62–70 | 66, 67, 69 | tools/lib/over-road-scan.cjs:13-115 | Same-deck crossover intrusions fail monotonically at 1/1.6/3m. Limits above apply. |
| another deck of a crossover is skipped by provenance, not by magnitude (#1944) | 72–78 | 75, 77 | tools/lib/over-road-scan.cjs:13-115 | Only alternate-deck provenance exempts crossover road geometry. Limits above apply. |

## tests/unit/overlay-feed.test.mjs

SHA-256 `24e1bca195bda7b7641649ef675145c54c1cfa5bda4c62fd7d38933bc3e915df`; full read 1–269; windows 1–100, 101–200, 201–269.

Fixture and limits: VM Broadcast/feed/render/TV modules, two synthetic ranked cars and mini DOM. No actual broadcast transport, OBS integration, browser layout or pixel rendering.

Target: js/overlay/feed.js:22,57,90,109,179,214; js/overlay/render.js:7,26,161; js/race/tv-graphics.js:14,44.

| Case (source name) | Full range | Assertion / helper spans | Target | Meaning / boundary |
|---|---|---|---|---|
| battle uses Broadcast's strict one-second gate | 29–33 | 31, 32 | js/overlay/feed.js:22,57,90,109,179,214 | Battle gate uses strict under-one-second Broadcast gap. Limits above apply. |
| sector colours and glyphs match the HUD predicate | 35–46 | 38, 39, 40, 41, 44, 45 | js/overlay/feed.js:22,57,90,109,179,214 | Sector tone/glyph cases and HUD source predicates agree. Limits above apply. |
| frame schema maps ranked cars without writing them | 48–66 | 59, 60–63, 64, 65 | js/overlay/feed.js:22,57,90,109,179,214 | Ranked frame maps intervals tyres/pit/player without writing cars. Limits above apply. |
| diff omits unchanged parts and sends a full frame every two seconds | 68–87 | 72, 76, 77, 78, 79, 82, 85, 86 | js/overlay/feed.js:22,57,90,109,179,214 | Differ omits stable sections and sends full frame at 2s. Limits above apply. |
| caption ids dedupe and unsupported schema versions are rejected | 89–98 | 95, 96, 97 | js/overlay/feed.js:22,57,90,109,179,214 | Caption id dedupes and schema version rejects unsupported frames. Limits above apply. |
| cleared caption id can re-arm on a later patch (dispose the latch) | 100–111 | 106, 108–110 | js/overlay/feed.js:22,57,90,109,179,214 | Clear publishes null and permits same caption id later. Limits above apply. |
| leaving race forces battle:null on the differ so overlays cannot stick | 113–120 | 118, 119 | js/overlay/feed.js:22,57,90,109,179,214 | Race exit explicitly clears battle. Limits above apply. |
| overlay source is display-only | 122–128 | 125–126 | js/overlay/feed.js; js/overlay/render.js | Static overlay source does not reach geometry or selected car fields. Limits above apply. |
| query options clamp scale/rows and select chroma + side | 130–136 | 134–135 | js/overlay/render.js:7,26,161 | Query options clamp scale/rows and select side/chroma. Limits above apply. |
| overlay boot enables chroma styles only for a selected chroma colour | 138–162 | 159, 160, 161 | js/overlay/render.js:7,26,161 | Only explicit supported chroma enables keyed root dataset. Limits above apply. |
| painter builds fixed rows once, moves by transform and skips unchanged text | 164–192 | 180, 183, 187, 190, 191 | js/overlay/render.js:7,26,161 | Painter builds fixed row pool transforms positions and skips stable text. Limits above apply. |
| painter merges differ patches and hides battle after the race ends | 194–230 | 213, 214, 218, 219, 223, 224, 227, 228, 229 | js/overlay/render.js:7,26,161 | Painter merges partial frames preserves tower and disposes battle/clear latches. Limits above apply. |
| TV graphics diffs ranked order into a pass lower-third and fastest-lap banner | 239–248 | 244, 246, 247 | js/race/tv-graphics.js:14,44 | TV rank diff detects pass and fastest banner. Limits above apply. |
| TV graphics paint only in the broadcast HUD profile | 250–262 | 257, 260, 261 | js/race/tv-graphics.js:14,44 | TV graphics visible only in broadcast HUD profile. Limits above apply. |
| overlay page explicitly owns transparent and chroma backgrounds and is staged | 264–269 | 266, 267, 268 | overlay.html; tools/desktop/stage-files.mjs | HTML declares transparent/chroma backgrounds and desktop staging includes overlay. Limits above apply. |

## tests/unit/overtake-mode.test.mjs

SHA-256 `613581f93325be48b63a1c4abfe2caf6dd075f052217c20d7c10294f4d92d453`; full read 1–324; windows 1–100, 101–200, 201–300, 301–324.

Fixture and limits: Pure-module VM with 5000m synthetic track/cars; RaceControl stubs tyre classification/debris/store/network ownership. Tests rules in isolation, not actual force integration or regulation completeness.

Target: js/race/overtake-mode.js:27-153; js/race/race-control.js:246,682,729; js/track/core/space.js; js/physics/consts.js.

| Case (source name) | Full range | Assertion / helper spans | Target | Meaning / boundary |
|---|---|---|---|---|
| 0.5 MJ maps onto the battery unit: 1/8 of the 4 MJ Energy Store window | 41–49 | 43, 44, 45, 46, 47, 48 | js/race/overtake-mode.js:27–153; js/physics/consts.js | Half-MJ allowance converts to one eighth battery unit and old cooldown is absent. Limits above apply. |
| crossed() is a wrap-safe forward crossing and ignores teleports and reverses | 51–60 | 53, 54, 55, 56, 57, 58, 59 | js/race/overtake-mode.js:27–153; js/physics/consts.js | Crossing handles wrap endpoints reverse teleport and NaN. Limits above apply. |
| the detection line defaults to 90 % of the lap and a circuit's otDetectFrac goes through TrackSpace | 62–70 | 64, 65, 68, 69 | js/race/overtake-mode.js:27–153; js/physics/consts.js | Detection defaults to 90 percent and applies authored scenery shift/wrap. Limits above apply. |
| under 1 s at the detection line EARNS it; the timing line GRANTS it for one lap; unused, it expires | 72–95 | 78, 80, 81, 82, 85, 86, 87, 92, 94 | js/race/overtake-mode.js:27–153; js/physics/consts.js | Detection earns activation grants and next unused lap expires. Limits above apply. |
| opening-lap grant survives the gate-closed Activation so it is usable on lap 2 | 97–119 | 106, 108, 109, 113, 114, 118 | js/race/overtake-mode.js:27–153; js/physics/consts.js | Opening-lap grant survives closed gate until lap2 then expires. Limits above apply. |
| 1.0 s is not 'less than one second', and a closed detection (SC, low grip) earns nothing | 121–129 | 127 | js/race/overtake-mode.js:27–153; js/physics/consts.js | Strict one-second boundary closed detection and infinite gap earn nothing. Limits above apply. |
| a car shoved back over the line and re-crossing is neither re-granted nor stripped | 131–141 | 137, 140 | js/race/overtake-mode.js:27–153; js/physics/consts.js | Backward recross cannot duplicate or strip activation allowance. Limits above apply. |
| spending: a full allowance lasts exactly otTimeFor(c) seconds; the human's button toggles, the AI's fire runs it out | 143–172 | 147, 148, 149, 150, 152, 158, 159, 160, 161, 169, 170, 171 | js/race/overtake-mode.js:27–153; js/physics/consts.js | Human toggles and AI full deployment spend correct allowance duration. Limits above apply. |
| below the speed floor the push pauses (not cancelled); a closed gate cancels it | 174–185 | 180, 181, 182, 184 | js/race/overtake-mode.js:27–153; js/physics/consts.js | Speed-floor pause preserves energy while closed gate cancels. Limits above apply. |
| braking pauses the push (not cancelled): the allowance survives a braking zone, then spends again | 187–209 | 196, 199, 202, 203, 204, 207 | js/race/overtake-mode.js:27–153; js/physics/consts.js | Braking pauses both human and AI energy until release. Limits above apply. |
| LOW GRIP (B7.2.2(d)): treaded-tyre conditions switch Overtake off and say so once | 227–253 | 229, 230, 231, 233, 236, 237, 238, 239, 241, 243, 248, 252 | js/race/race-control.js:246,682,729 | Wet tyre conditions disable gates and announce once per race/reset then drying restores. Limits above apply. |
| NO PASSING UNDER A CAUTION, AI TOO: the car ahead in the running order is a speed ceiling once close | 255–272 | 260, 261, 263, 264, 268, 269, 271 | js/race/race-control.js:246,682,729 | Caution speed ceiling skips fair/retired cars and closes queue safely. Limits above apply. |
| SAFETY CAR QUEUE (B5.13): the leader runs SC pace, a car > 1 s adrift closes up faster, a queued car holds | 274–304 | 281, 282, 283, 285, 286, 289, 291, 292, 295, 298, 302, 303 | js/race/race-control.js:246,682,729 | Safety-car queue pace catch-up blends by gap skips retired/pit cars and scales with pace. Limits above apply. |
| two-phase OT charges this tick's actual thrust and pauses coast/brake immediately | 306–324 | 309, 311, 312, 315, 318, 319, 323 | js/race/overtake-mode.js:27–153; js/physics/consts.js | Prepare/consume charge actual same-tick thrust pause coast/brake toggle off and fractionally consume last energy. Limits above apply. |

## tests/unit/pace-arming-vm.test.mjs

SHA-256 `70700931d7fd2c6a1357bf6d0638ab4530013d7456736f405a2ccf3cca92411c`; full read 1–92; windows 1–92.

Fixture and limits: Real Monza game VM at pace0.5/1/1.3; direct car allowance/lap/speed placement and longest aero-zone midpoint. Boundary samples are threshold±1.5, not exact equality.

Target: js/game.js:5098,5138; js/physics/consts.js.

| Case (source name) | Full range | Assertion / helper spans | Target | Meaning / boundary |
|---|---|---|---|---|
| the consts under test are the vStd thresholds this file assumes | 62–65 | 63, 64 | js/game.js:5098,5138; js/physics/consts.js | Game constants equal expected standard-speed thresholds. Limits above apply. |
| overtake arms at the same vStd at every pace — not at the same real m/s | 67–80 | 76, 77 | js/game.js:5098,5138; js/physics/consts.js | Overtake arming follows vStd at each pace with open race gate. Limits above apply. |
| X-mode arms at the same vStd at every pace — not at the same real m/s | 82–92 | 89 | js/game.js:5098,5138; js/physics/consts.js | X arming follows vStd at each pace inside activation zone. Limits above apply. |

## tests/unit/pace-math.test.mjs

SHA-256 `b499b9545298fdf31c929be35b80178cef9ec5dc7c38f536250b13e106fe3482`; full read 1–136; windows 1–100, 101–136.

Fixture and limits: VM math/constants and configurable dependency getters; immutable captured golden values and three car profiles plus null/empty. Historical equivalence does not establish physical realism.

Target: js/race/pace-math.js:22; tests/data/pace-math-golden.json.

| Case (source name) | Full range | Assertion / helper spans | Target | Meaning / boundary |
|---|---|---|---|---|
| PaceMath global is frozen; create returns the named surface | 67–76 | 69, 74 | js/race/pace-math.js:22; tests/data/pace-math-golden.json | Frozen module exposes named callable API. Limits above apply. |
| pins vTop/vStd/aStd/gearHi/rpmFor across PACE values (pre-refactor) | 78–95 | 80, 83, 84, 85, 86, 87, 88, 89, 91–92 | js/race/pace-math.js:22; tests/data/pace-math-golden.json | Golden speed/acceleration/gear/RPM values match across pace cases. Limits above apply. |
| pins X-mode / ERS / aeroDfMult car snaps (pace-invariant; pre-refactor) | 97–103 | 100, 102 | js/race/pace-math.js:22; tests/data/pace-math-golden.json | Golden aero/ERS car profiles stay pace invariant. Limits above apply. |
| pins wet (lowGrip) half-trade on X-mode gains (pre-refactor) | 105–112 | 109, 110, 111 | js/race/pace-math.js:22; tests/data/pace-math-golden.json | Wet low-grip half-trade matches golden. Limits above apply. |
| paceRef caches per cars identity and track.n | 114–136 | 121, 122, 123, 127, 128, 132, 133, 135 | js/race/pace-math.js:22; tests/data/pace-math-golden.json | Cache keys cars identity only: track size change remains cached until cars identity changes. Limits above apply. |

## tests/unit/pack-content-address.test.mjs

SHA-256 `a2a3859cf70f5a54dfa3f4c1fae46acc7f7093941f9923ee91b3ff988e7308f0`; full read 1–177; windows 1–100, 101–177.

Fixture and limits: Map-cache service worker at fake apex.test plus mocked assets fetch; synthetic a/b 32hex hashes and x.bin path. Committed manifest tested for hash shape only, not recomputed digest.

Target: sw.js:902,944,948; js/render/shared/assets.js:4; assets/pack/manifest.json.

| Case (source name) | Full range | Assertion / helper spans | Target | Meaning / boundary |
|---|---|---|---|---|
| a ?h=<md5> pack URL is answered from the cache with no network request | 76–85 | 82, 84 | sw.js:902,944,948 | Hashed cache hit avoids network even across generations. Limits above apply. |
| a ?h= pack miss fetches once and stores under the hashed URL; the next request is a hit | 87–97 | 90, 92, 94, 96 | sw.js:902,944,948 | Hashed miss fetches once stores exact URL and hits next time. Limits above apply. |
| the manifest and bare pack URLs stay network-first | 99–113 | 109, 112 | sw.js:902,944,948 | Manifest bare pack and invalid hash stay network first. Limits above apply. |
| a rebaked md5 is a different URL, so the old cached entry cannot answer it | 116–125 | 122, 124 | sw.js:902,944,948 | New md5 URL cannot use old hash entry. Limits above apply. |
| a failed hashed fetch is an error response, never a cached error | 127–133 | 130, 132 | sw.js:902,944,948 | 404 hashed result is returned but never cached. Limits above apply. |
| model and strip requests carry ?h=<md5> from the manifest | 151–167 | 160, 161 | js/render/shared/assets.js:4 | Model and material-strip URLs inherit manifest hashes while missing hash stays bare. Limits above apply. |
| the committed manifest hashes every model and strip it names | 169–177 | 171 | assets/pack/manifest.json | Every manifest model and high/low strip has lowercase 32hex hash. Limits above apply. |

## tests/unit/pack-png-bytes.test.mjs

SHA-256 `67987422a63b05e8e5fae1e7fcccc425a7771c1fd9d8fa4208ad9ed5b7fed125`; full read 1–267; windows 1–100, 101–200, 201–267.

Fixture and limits: VM real loader with disk pack and recording texture-array backend; independent sharp byte reference, synthetic RGBA filtered PNG/IDAT, injected stream and Uint8Array faults. No GPU upload correctness/performance measurement.

Target: js/render/shared/assets.js:4; assets/pack/manifest.json.

| Case (source name) | Full range | Assertion / helper spans | Target | Meaning / boundary |
|---|---|---|---|---|
| the shipped ${tier} strips decode to sharp's bytes, layer for layer, without createImageBitmap or a GL readback | 71–92 | 74, 75, 76, 81, 82, 84, 86, 87, 88, 91 | js/render/shared/assets.js:4; assets/pack/manifest.json | Generated high/low cases compare all present strip layers byte-for-byte to sharp without bitmap decode. Limits above apply. |
| every PNG filter type (none/sub/up/average/paeth), split IDATs and an ancillary text chunk decode exactly | 130–145 | 137, 138, 141, 143 | js/render/shared/assets.js:4; assets/pack/manifest.json | Synthetic five filters split IDAT and ancillary text preserve bytes and sparse absence. Limits above apply. |
| sparse PNG decode bounds its raw destination to needed rows and drains unused stream bytes | 170–183 | 177, 178, 180, 181 | js/render/shared/assets.js:4; assets/pack/manifest.json | Destination bounds to highest requested layer rows rather than entire strip. Limits above apply. |
| fragmented PNG output keeps exact layer bytes and consumes the whole stream after its prefix fills | 185–198 | 191, 192, 193, 194, 195 | js/render/shared/assets.js:4; assets/pack/manifest.json | Fragmented offset stream views preserve bytes and drain all trailing output. Limits above apply. |
| raw destination allocation failure falls back before starting a decompression stream | 200–221 | 215, 216, 217, 218, 219 | js/render/shared/assets.js:4; assets/pack/manifest.json | Allocation failure falls back before constructing stream. Limits above apply. |
| short or late-failing PNG streams keep the ImageBitmap fallback | 223–235 | 230, 231, 232 | js/render/shared/assets.js:4; assets/pack/manifest.json | Short prefix or late stream error falls back to bitmap. Limits above apply. |
| unload during PNG inflation drains but never uploads or starts bitmap fallback | 237–249 | 244, 245, 246, 247 | js/render/shared/assets.js:4; assets/pack/manifest.json | Unload mid-inflate drains and prevents upload/fallback. Limits above apply. |
| falls back to the ImageBitmap decode: ${why} | 257–266 | 262, 263, 264 | js/render/shared/assets.js:4; assets/pack/manifest.json | Generated fallback cases cover no decompressor color-tagged palette and corrupt streams. Limits above apply. |

## tests/unit/pad-haptics.test.mjs

SHA-256 `2315da2c11fcd292d2201ddcb04d5c26b0e942e33a702926ae4126d9e73abb0e`; full read 1–329; windows 1–100, 101–200, 201–300, 301–329.

Fixture and limits: Input VM with synthetic Xbox/Gecko actuators, recording promises/events and controlled clock; no physical motor/browser API validation.

Target: js/input/haptics.js:7,130; js/input/input.js:1766,1856.

| Case (source name) | Full range | Assertion / helper spans | Target | Meaning / boundary |
|---|---|---|---|---|
| lock-up channel plays trigger-rumble on the left trigger only | 78–90 | 85, 86, 87, 88, 89 | js/input/haptics.js:7,130; js/input/input.js:1766,1856 | Brake channel drives left trigger only. Limits above apply. |
| throttle channel (wheelspin) plays trigger-rumble on the right trigger only | 92–101 | 98, 99, 100 | js/input/haptics.js:7,130; js/input/input.js:1766,1856 | Throttle channel drives right trigger only. Limits above apply. |
| handles / omitted channel stays on dual-rumble even when trigger-rumble exists | 103–115 | 111, 112, 113, 114 | js/input/haptics.js:7,130; js/input/input.js:1766,1856 | Handles/default use dual rumble. Limits above apply. |
| a pad without trigger-rumble falls back to dual-rumble for brake | 117–126 | 122, 124, 125 | js/input/haptics.js:7,130; js/input/input.js:1766,1856 | Unsupported trigger actuator falls back. Limits above apply. |
| TRIGGER HAPTICS off forces dual-rumble for brake/throttle | 128–140 | 137, 138, 139 | js/input/haptics.js:7,130; js/input/input.js:1766,1856 | Trigger setting off routes brake/throttle to grips. Limits above apply. |
| haptics scale 0 plays nothing | 142–150 | 149 | js/input/haptics.js:7,130; js/input/input.js:1766,1856 | Zero master scale emits nothing. Limits above apply. |
| a rejected playEffect promise is swallowed | 152–169 | 162, 163, 165 | js/input/haptics.js:7,130; js/input/input.js:1766,1856 | Rejected effect promise cannot leak unhandled rejection. Limits above apply. |
| visibility-hidden rejection does not throw | 171–181 | 178, 179 | js/input/haptics.js:7,130; js/input/input.js:1766,1856 | Hidden document effect rejection remains caught. Limits above apply. |
| mixer: a lock-up and a kerb in one frame play together — one effect, both motors | 190–208 | 198, 200, 202, 203, 204, 205, 207 | js/input/haptics.js:7,130; js/input/input.js:1766,1856 | Same-frame lockup and kerb mix with motor maxima and no stable replay. Limits above apply. |
| mixer: when the shorter pulse ends the longer one is re-played alone | 210–224 | 218, 221, 222, 223 | js/input/haptics.js:7,130; js/input/input.js:1766,1856 | Short pulse expiry remixes longer remaining pulse with remaining duration. Limits above apply. |
| mixer: preempted by its own newer effect is the design; preempted by anything else re-plays | 226–246 | 235, 237, 245 | js/input/haptics.js:7,130; js/input/input.js:1766,1856 | Foreign preemption retries but own newer effect preemption does not. Limits above apply. |
| mixer: NotSupportedError on trigger-rumble folds the triggers into the grips from then on | 248–260 | 255, 258, 259 | js/input/haptics.js:7,130; js/input/input.js:1766,1856 | NotSupported trigger rejection permanently remixes to grips. Limits above apply. |
| Firefox legacy pulse(): a rejection is caught too | 262–281 | 278, 279 | js/input/haptics.js:7,130; js/input/input.js:1766,1856 | Legacy pulse rejection also handled. Limits above apply. |
| mixer: OFF stops the actuator and discards queued pulses without reviving them | 283–298 | 291, 294, 296, 297 | js/input/haptics.js:7,130; js/input/input.js:1766,1856 | Off resets actuator clears queued pulses and cannot resurrect on re-enable. Limits above apply. |
| mixer: strength and trigger changes remix live pulses without extending their duration | 300–318 | 306, 307, 308, 310, 311, 312, 314, 315, 316, 317 | js/input/haptics.js:7,130; js/input/input.js:1766,1856 | Strength/trigger changes remix live durations without extending them. Limits above apply. |
| mixer: OFF sends a zero-duration stop on actuators without reset | 320–329 | 325, 326, 327, 328 | js/input/haptics.js:7,130; js/input/input.js:1766,1856 | Actuator lacking reset receives zero-duration zero-magnitude stop. Limits above apply. |

## tests/unit/particles-dirty.test.mjs

SHA-256 `cad70b152f7e2368306587bd3be5c9fce6961eacdf729e40a35280f2317640c9`; full read 1–305; windows 1–100, 101–200, 201–300, 301–305.

Fixture and limits: Seeded RNG0xd117, stub lighting/wind/governor and recording drawParticles backend; controlled eye/time/knobs, allocation counter and copied upload digest. CPU expansion/upload intent only, no real GPU.

Target: js/fx/particles.js:59,89,327,356,468,480,523,583.

| Case (source name) | Full range | Assertion / helper spans | Target | Meaning / boundary |
|---|---|---|---|---|
| continuous rainfall scales the bounded particle field and clears stale geometry at zero | 37–49 | 43, 46, 48 | js/fx/particles.js:59,89,327,356,468,480,523,583 | Continuous rainfall scales field and zero discards stale geometry then recovers. Limits above apply. |
| rain streaks drift with the actual race wind vector | 51–62 | 61 | js/fx/particles.js:59,89,327,356,468,480,523,583 | Opposite actual wind vectors move seeded streak accordingly. Limits above apply. |
| arc and static drizzle have the same density with phone caps and custom drizzle settings | 64–75 | 73 | js/fx/particles.js:59,89,327,356,468,480,523,583 | Arc/static drizzle same density across mobile and custom drizzle settings. Limits above apply. |
| parked rain expands at most ~30x/s (not every frame, not frozen) until the eye leaves the cell | 77–110 | 86, 87, 89, 99, 100, 101, 102, 108, 109 | js/fx/particles.js:59,89,327,356,468,480,523,583 | Stationary rain updates near30Hz skips upload on clean frames and cell change dirties. Limits above apply. |
| pool update dirties so moving smoke keeps uploading | 112–124 | 119, 122, 123 | js/fx/particles.js:59,89,327,356,468,480,523,583 | Live smoke expands each update. Limits above apply. |
| clear() disposes the pool and flare latch so draw cannot resurrect them | 126–145 | 133, 134, 137, 138, 140, 144 | js/fx/particles.js:59,89,327,356,468,480,523,583 | Clear removes pool/flared data while leaving independently controlled rain. Limits above apply. |
| one-frame flares refresh additive data while clean rain reuses alpha | 148–162 | 155, 156, 157, 158, 160, 161 | js/fx/particles.js:59,89,327,356,468,480,523,583 | Additive flare refreshes independently from clean alpha rain. Limits above apply. |
| rain offsets wrap across several widths in either camera direction | 164–177 | 170, 173, 174 | js/fx/particles.js:59,89,327,356,468,480,523,583 | Large camera jumps wrap drop offsets within bounded volume. Limits above apply. |
| rain dirty latch compares scratch slots and does not build a knob string | 193–200 | 198, 199 | js/fx/particles.js:59,89,327,356,468,480,523,583 | Static dirty function uses scratch slots rather than knob strings. Limits above apply. |
| a parked sub-30 Hz frame stays clean until a rain knob or speed bucket changes | 202–230 | 211, 212, 215, 216, 221, 225, 229 | js/fx/particles.js:59,89,327,356,468,480,523,583 | Sub30Hz clean frame dirties on knob speed bucket wind direction or rain rate change. Limits above apply. |
| drizzle, rain and storm reseeds reuse one tier-cap buffer | 232–263 | 259, 260, 261 | js/fx/particles.js:59,89,327,356,468,480,523,583 | First tier buffer allocates but drizzle/rain/storm reseeds reuse it. Limits above apply. |
| seeded smoke, flares and rain keep the same upload bytes | 265–305 | 300, 304 | js/fx/particles.js:59,89,327,356,468,480,523,583 | Copied seeded mixed uploads reproduce fixed digest2712992901. Limits above apply. |

## tests/unit/parts-copy-w13c.test.mjs

SHA-256 `ac41e5be6b897beea133193a895dba0fabab1941670f8825d849ab16cdf7550f`; full read 1–84; windows 1–84.

Fixture and limits: loadParts real catalog; wording/visual recipe truth checks, not built wheel mesh or official-rule revalidation.

Target: js/car/parts.js:8; js/car/car-wheels.js.

| Case (source name) | Full range | Assertion / helper spans | Target | Meaning / boundary |
|---|---|---|---|---|
| any wheels/tyres desc that mentions cover has cover:1 on the recipe | 28–40 | 38–39 | js/car/parts.js:8; js/car/car-wheels.js | Any cover claim requires cover recipe flag. Limits above apply. |
| #3410 wheels/standard no longer claims an aero cover | 42–47 | 44, 45, 46 | js/car/parts.js:8; js/car/car-wheels.js | Standard open rim recipe and wording avoid cover claim. Limits above apply. |
| #3415 dished and aero_disc describe open dish, not a sealed cover | 49–59 | 52, 53, 54, 55, 56, 57, 58 | js/car/parts.js:8; js/car/car-wheels.js | Dished/aero_disc remain explicitly open with no cover claims. Limits above apply. |
| #3409 role-colour compounds keep official white/yellow/red/green/blue wording | 61–84 | 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83 | js/car/parts.js:8; js/car/car-wheels.js | Role compound descriptions use white yellow red green blue and multi-groove wet wording without obsolete C4/C5 colors. Limits above apply. |

## tests/unit/parts-distinct-mesh.test.mjs

SHA-256 `9b3efd7c53ad4edebe1c713fa318c84bb1bfead665d152d984723b32e2839179`; full read 1–115; windows 1–100, 101–115.

Fixture and limits: Real geometry builder and eligible team selection; memoized FNV over quantized positions/colors/material ids. Hash change does not prove visible difference and cross-team differences deliberately excluded.

Target: js/car/parts.js:883,1026; js/car/car3d.js:237; tools/car/parts-sweep.mjs:96.

| Case (source name) | Full range | Assertion / helper spans | Target | Meaning / boundary |
|---|---|---|---|---|
| every catalog option builds a car distinct from every other in its category | 75–95 | 92, 93–94 | js/car/parts.js:883,1026; js/car/car3d.js:237; tools/car/parts-sweep.mjs:96 | More than250 options have unique same-team within-category mesh signatures. Limits above apply. |
| no option leaves the car exactly as the team's default | 97–115 | 114 | js/car/parts.js:883,1026; js/car/car3d.js:237; tools/car/parts-sweep.mjs:96 | Every nondefault legal option differs from its teams default mesh. Limits above apply. |

## tests/unit/parts-factory-key.test.mjs

SHA-256 `30424be66313b8919b1402b9d2f8df141352863e59a2c482e545465d063e2716`; full read 1–35; windows 1–35.

Fixture and limits: loadParts real teams/presets with literal expected category order and selected complete keys. Does not build meshes.

Target: js/car/parts.js:947,951.

| Case (source name) | Full range | Assertion / helper spans | Target | Meaning / boundary |
|---|---|---|---|---|
| the key is the factory option id of every catalog category, in catalog order | 17–23 | 18, 19–20, 21–22 | js/car/parts.js:947,951 | Catalog-order keys match explicit McLaren/Ferrari literals. Limits above apply. |
| a manufacturer-engine team keys its engine slot by the manufacturer, not its own name | 25–28 | 26, 27 | js/car/parts.js:947,951 | RedBull/Ford and Aston/Honda use manufacturer engine identifiers. Limits above apply. |
| every real team has its own key | 30–35 | 33, 34 | js/car/parts.js:947,951 | All noncustom nonlegend teams have distinct full-length keys. Limits above apply. |

## tests/unit/parts-ladder.test.mjs

SHA-256 `0cd2231bac383475239b797dd1b8a50f3377f4bf7d2acdaa2e25f7df01dab41a`; full read 1–140; windows 1–100, 101–140.

Fixture and limits: Real catalog sweep over dry stat utility weights and exact price hull; source-read career cap/multipliers; injected impossible trap/gift rows. Dense finite weights do not prove all player preferences and wet advantage is an explicit exception.

Target: tools/car/parts-ladder.mjs:99,119,172,182; js/car/parts.js:8,947,960; js/career/career.js.

| Case (source name) | Full range | Assertion / helper spans | Target | Meaning / boundary |
|---|---|---|---|---|
| no PAID option is strictly dominated by a cheaper one | 30–37 | 36 | tools/car/parts-ladder.mjs:99,119,172,182; js/car/parts.js:8,947,960; js/career/career.js | Paid options have no cheaper stat dominator. Limits above apply. |
| never-optimal rows are a downward-only ratchet, and the exemptions are named | 39–58 | 55–57 | tools/car/parts-ladder.mjs:99,119,172,182; js/car/parts.js:8,947,960; js/career/career.js | Exactly intermediate/full wet remain dry-utility dead exceptions. Limits above apply. |
| no category is flat on a stat the player is asked to choose over | 60–67 | 66 | tools/car/parts-ladder.mjs:99,119,172,182; js/car/parts.js:8,947,960; js/career/career.js | Every category varies all offered stat dimensions. Limits above apply. |
| a SIGNATURE row never changes the pecking order it clones | 69–86 | 85 | tools/car/parts-ladder.mjs:99,119,172,182; js/car/parts.js:8,947,960; js/career/career.js | Signature cost and effective stats equal equivalent row. Limits above apply. |
| the career budget cap clears the dearest works car and stays under the top shelf | 88–120 | 95, 107–109, 110, 115, 117, 119 | js/career/career.js; js/car/parts.js:947,960 | Derived budget cap affords all works cars excludes full top shelf and actually binds a top rung. Limits above apply. |
| liveSet is deterministic and exact in price | 122–140 | 130, 131, 134, 137, 138, 139 | tools/car/parts-ladder.mjs:99,119,172,182; js/car/parts.js:8,947,960; js/career/career.js | Deterministic live set rejects injected trap accepts free gift and meets sampling floor. Limits above apply. |

## tests/unit/parts-locked-equivalent.test.mjs

SHA-256 `b801287c7a09df3c918086f5f20f7937d40d326f5c0318bdf43f3f42887efbd5`; full read 1–106; windows 1–100, 101–106.

Fixture and limits: loadParts real McLaren/Audi catalog and synthetic same-id legends factory objects; compares resolved ids/bands, not rendered car images.

Target: js/car/parts.js:847-906,947,951,1026.

| Case (source name) | Full range | Assertion / helper spans | Target | Meaning / boundary |
|---|---|---|---|---|
| a legal McLaren signature still resolves to itself | 30–34 | 32, 33 | js/car/parts.js:847-906,947,951,1026 | Legal McLaren signature resolves itself and orange band. Limits above apply. |
| locked sig_mercedes_tyre draws its equivalent (medium), not a foreign band | 36–52 | 41, 42, 47, 48, 49, 50, 51 | js/car/parts.js:847-906,947,951,1026 | Unavailable Mercedes tyre resolves medium option label/band. Limits above apply. |
| locked sig_rb_street draws supersoft, not the medium default | 54–66 | 57, 58, 63, 64, 65 | js/car/parts.js:847-906,947,951,1026 | Unavailable RB street resolves supersoft instead of default medium. Limits above apply. |
| getVisualTiers agrees with resolveSetup for a locked signature | 68–74 | 71, 72, 73 | js/car/parts.js:847-906,947,951,1026 | Visual-tier ids/recipe agree with locked-signature resolution. Limits above apply. |
| Audi factory Neuburg Compound band is team color2 (not supersoft magenta) | 76–87 | 78, 81, 82, 83, 85, 86 | js/car/parts.js:847-906,947,951,1026 | Audi Neuburg factory tyre uses Audi second color and compound_c4 equivalent. Limits above apply. |
| two teams of one id with different `factory` resolve their own factory build | 92–106 | 98, 99, 100, 101, 104–105 | js/car/parts.js:847-906,947,951,1026 | Same-id different factory objects have independent cached builds and factoryless legends uses defaults. Limits above apply. |

## tests/unit/parts-visual-distinctness.test.mjs

SHA-256 `e77094eaf8e26418e59c06d69ccfe80ba46b137377d760457f86001805b05f0a`; full read 1–188; windows 1–100, 101–188.

Fixture and limits: One lazy parallel geometry census with visibility/area/displacement thresholds, eligible teams and resolved equivalents; no browser render. Attribution case may return early on completely healthy census; it validates numeric shape only.

Target: tools/car/parts-sweep.mjs:133,171,668,700,749,855; js/car/parts.js:8; js/car/car3d.js:237.

| Case (source name) | Full range | Assertion / helper spans | Target | Meaning / boundary |
|---|---|---|---|---|
| flapSig hashes every recipe field the flap solver reads | 38–47 | 45, 46 | tools/car/parts-sweep.mjs:133,171,668,700,749,855; js/car/parts.js:8; js/car/car3d.js:237 | Flap cache signature includes every solver-read recipe field. Limits above apply. |
| the catalog census is what the rest of this file assumes | 49–62 | 50, 59, 60, 61 | js/car/parts.js:8 | Catalog census fixes12 categories357 options128 signature60 style. Limits above apply. |
| a SIGNATURE or STYLE option is a pure reskin: same cost, same four stat multipliers | 64–84 | 83 | js/car/parts.js:8 | Signature/style cost and all effective stats match same-category equivalent. Limits above apply. |
| every option resolves to itself under an eligible team | 86–91 | 90 | tools/car/parts-sweep.mjs:133,171,668,700,749,855; js/car/parts.js:8; js/car/car3d.js:237 | All eligible options resolve themselves without broken rows. Limits above apply. |
| no option is INVISIBLE | 93–100 | 97–99 | tools/car/parts-sweep.mjs:133,171,668,700,749,855; js/car/parts.js:8; js/car/car3d.js:237 | No classified invisible option. Limits above apply. |
| no option only SLIDES its vertices along a surface that does not move | 102–105 | 103–104 | tools/car/parts-sweep.mjs:133,171,668,700,749,855; js/car/parts.js:8; js/car/car3d.js:237 | No pure tangent-slide option. Limits above apply. |
| no option's only change is INTERNAL | 107–110 | 108–109 | tools/car/parts-sweep.mjs:133,171,668,700,749,855; js/car/parts.js:8; js/car/car3d.js:237 | No internal-only visible change. Limits above apply. |
| COLOUR-ONLY is confined to its declared allow-list | 112–130 | 127–129 | tools/car/parts-sweep.mjs:133,171,668,700,749,855; js/car/parts.js:8; js/car/car3d.js:237 | Only three named fuel grades may be color-only. Limits above apply. |
| WEAK is a downward-only ratchet | 132–145 | 143–144 | tools/car/parts-sweep.mjs:133,171,668,700,749,855; js/car/parts.js:8; js/car/car3d.js:237 | Weak class ceiling remains zero. Limits above apply. |
| classify is a pure function of the measured row | 147–159 | 151, 152, 153, 154, 155, 156, 157, 158 | tools/car/parts-sweep.mjs:133,171,668,700,749,855; js/car/parts.js:8; js/car/car3d.js:237 | Synthetic classifier rows exercise baseline broken invisible color slide OK internal weak. Limits above apply. |
| attribute names the inert key on a flagged row | 161–169 | 168 | tools/car/parts-sweep.mjs:133,171,668,700,749,855; js/car/parts.js:8; js/car/car3d.js:237 | Flagged row attribution emits numeric displacement when available. Limits above apply. |
| catalogRows picks a team that can actually see each option | 171–180 | 176, 177, 178 | tools/car/parts-sweep.mjs:133,171,668,700,749,855; js/car/parts.js:8; js/car/car3d.js:237 | Catalog rows choose real eligible teams and signature equivalents. Limits above apply. |
| parts-sweep.mjs --help exits 0 without sweeping | 182–188 | 186, 187 | tools/car/parts-sweep.mjs:133,171,668,700,749,855; js/car/parts.js:8; js/car/car3d.js:237 | Help exits successfully without running sweep. Limits above apply. |

## Synthetic paths and noncoverage

`https://apex.test`, example.invalid resource IDs, build321 cache names, x.bin/a.png/n.png, unknown script/fixture group, isolated.test.mjs/ordinary.test.mjs, unregistered/nowhere test names, lib/pure/check/x/env/x catalog files, /nonexistent and /no-such-executable are test inputs, not missing repository production paths. output-level harness roots and graceful-cleanup/grandchild.pid files exist only when its tests run. This reading created none of them. `absSrc` supplies real source labels to VM code; it does not run a browser. Generated variants: obs seam monaco/suzuka/spa; PNG high/low plus four fallback reasons. No tests were executed, so no green verdict, timing, GPU, hardware, network, rendered accessibility or visual sign-off is implied.
