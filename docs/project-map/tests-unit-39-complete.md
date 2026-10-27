# Unit group 39 — complete source map

Read-only mapping at `8a222466bc83de7cdbe6a42989f19f7824ce4c06`. All 18 assigned test files (4,736 lines), including every setup/helper/comment/template, were read completely in separately returned, untruncated source slices of at most 100 lines and 10,000 characters. 222 top-level test cases are mapped below. No tests, browser, source edits or commits were performed.

Case ranges include the test call. Assertion spans are direct assert calls merged only when adjacent; they are evidence locations, not copied predicates. Assertions in shared helpers are called out in fixture notes; loops may execute a span repeatedly. Case names express the expected behavior; the final column records interpretation and practical limits.

## Production navigation evidence

Attached apex-lsp definitions resolved PitSigns (`js/garage/pit-signs.js:8`), SceneryPits (`js/track/scenery/pits.js:9`), PlayerForces (`js/physics/player-forces.js:13`), PostFxOpts (`js/ui/post-fx-opts.js:12`), SettingsExport (`js/ui/settings-export.js:36`), SettingsSearch (`js/ui/settings-search.js:2`), SetupPresets (`js/garage/setup-presets.js:2`), GarageSurfaceInspection (`js/garage/surface-inspection.js:2`), RaceMessageHistory (`js/ui/race-message-history.js:3`), SettingsNav (`js/ui/settings-tabs.js:6`). Body reads confirmed PitSigns.upload 146–165, tyreSat 21–23, gate 38–42, reveal 139–154, inspection create 14–43 and preset preview 88–95. LSP marks unused direct-member queries for tyreSat/create/preview as module-file fallback, with export/caller coverage unverified. GameAudio.collision resolves real engine 2812 plus stub noop 13: runtime bundle order matters; this test explicitly loads engine.

Local bounded source reads additionally checked platform install 116–150, guards-verdict 89–166, pr-board 130–217, poll-live-shell 208–270, perf/lib 32–87, clip-audit 129–200. tools/ function landmarks below came from local source declarations. Paths named only inside scratch fixtures (for example code.js, tiny-pass.test.mjs, actual-guard.test.mjs, effective-ratchet.test.mjs, pending.txt, main.json, other.json, outside.json and example.test URLs) describe generated fixture content, not missing tracked production files.

## Read ledger and hashes

| Test file | Full read ranges | SHA-256 | Cases |
|---|---|---|---:|
| `tests/unit/pit-signs.test.mjs` | 1–100, 101–200, 201–300, 301–400, 401–403 | `0a33b9406b8c4ed492b06f8cc1adfc46c89f3f955e6d33ec88b1f5f25d7fad42` | 10 |
| `tests/unit/platform-session-install.test.mjs` | 1–76 | `75d44cea13b855aaea145f75da2e5b8520cd5f9523c4b681b4dd2aa87190c8af` | 2 |
| `tests/unit/player-collision-side.test.mjs` | 1–100, 101–144 | `c86a09b58ca2b11b632b94680686086628cb013997ba5a4869864816d4a677e1` | 4 |
| `tests/unit/player-dynamics-shipped-vm.test.mjs` | 1–100, 101–117 | `14ba29e91a9e11a43f62deaf854bc499536fab9c298d9b8d9e84933cc78057da` | 10 |
| `tests/unit/player-dynamics-vm.test.mjs` | 1–100, 101–200, 201–300, 301–400, 401–500, 501–513 | `f9fde3f0d300e414645824a222d08c008f5a8059d8e665828b9a0e023e7dcd59` | 25 |
| `tests/unit/player-forces.test.mjs` | 1–100, 101–200, 201–300, 301–309 | `b13b6ee6f81b655731c512289f42590bbafc60c5367680df2e447daebb521597` | 8 |
| `tests/unit/player-tools-backup.test.mjs` | 1–100, 101–148 | `90b723cde83f87a173a7e597d68c9f47ab995d334c988ef057be0e335596c565` | 8 |
| `tests/unit/player-tools-ui.test.mjs` | 1–100, 101–150, 151–200, 201–300, 301–350 | `c405eff535cd9c5270e409c90208917587049f9f630c77b9a7f69b66be396ff9` | 28 |
| `tests/unit/poll-live-shell.test.mjs` | 1–100, 101–200, 201–240 | `813cf7f86c1edf68b2d404343176de0e58bedfc1c20fe8a080d5c64e811b795e` | 14 |
| `tests/unit/post-fx-opts.test.mjs` | 1–100, 101–142 | `00c127645a9c2d5f80ae8e43f81f30192749fcb243731d7c8f7aef32f7087b49` | 5 |
| `tests/unit/pr-board.test.mjs` | 1–100, 101–200, 201–300, 301–400, 401–432 | `5b2b4638e8beebc93e619297d868bb48a6fe8a9887399df246d34ea580a359a6` | 32 |
| `tests/unit/pr-body.test.mjs` | 1–100, 101–126 | `b74544fa76d3024c89c38a4dea9d05c14b96bffc2059a63d97b7420f4f745426` | 11 |
| `tests/unit/pre-commit-guards.test.mjs` | 1–100, 101–200, 201–300, 301–400, 401–500, 501–600, 601–700, 701–742 | `50c9052bf3bb78426f0103f4f6fe1018aa48ceff927cb544a30a0f2ba8aeafb4` | 27 |
| `tests/unit/prepush-gate-coverage.test.mjs` | 1–100, 101–149 | `ecd915b405287fd1cf90fd1f75a9214f4899f7d4316c0a0882613859ba4de003` | 4 |
| `tests/unit/process-dashboard.test.mjs` | 1–100, 101–200, 201–300, 301–304 | `2d42743f7467dd919d79bcb41ed48d75148c7bd8decbb172e71851968ac72589` | 11 |
| `tests/unit/profile-lib.test.mjs` | 1–100, 101–200, 201–245 | `e0c91466db812894fa6af4d7817f05efaccd98a036859f1b039ba6c79a46cf54` | 14 |
| `tests/unit/profile-mcp.test.mjs` | 1–57 | `7f5b34f0e24ba63c91357731b0357b3cd57ddf96f7276241232b2daaa29329a9` | 5 |
| `tests/unit/prop-clipping.test.mjs` | 1–100, 101–200, 201–239 | `a6cbce21c518f2f661f0273ea563a5eacd55ed2a9c8d1c6e188e31ceddd98fee` | 4 |

## Cases and fixture boundaries

### pit-signs.test.mjs

Fixture/setup: Track-build VM cached by circuit; built() trims primitive captures and releases geometry (21–50). Painter VM (230–235) uses real pit constants and painter with absent DOM or recording canvas/livery/GPU stubs. Four fixture circuit IDs (26), Nürburgring approach counterexample, scoped fleet and three colour kits.

Limit: Numeric geometry and stub upload/draw evidence; no actual canvas pixels or GPU rendering.

| Case name | Case lines | Assertion spans | Production target | Meaning / limit |
|---|---|---|---|---|
| every built complex lays out twelve fascia quads, one per bay, in row order, on the lintel | 56–189 | 60–61, 70–72, 75, 77, 81, 89–90, 93, 95–96, 98, 101–102, 106–109, 112, 115, 119, 123, 126, 128, 132–133, 136, 139, 142, 144–146, 149, 152, 157–158, 162, 166–167, 171, 173–174, 176, 181–182, 187 | js/track/scenery/pits.js:9 + js/track/core/pit.js | Checks all quad families: counts/order/team identity, normals, placements, winding, atlas UVs and no props UV pollution; three complex layouts. |
| the approach boards walk back past the circuit's own scenery instead of standing in it | 191–210 | 203, 206, 208 | js/track/scenery/pits.js:9 + js/track/core/pit.js | At least one approach survives and displaced boards stay within walk allowance; Nürburgring far-board counterexample. |
| a painted lane has no signs; a street complex signs its bays like any other | 212–217 | 215–216 | js/track/scenery/pits.js:9 + js/track/core/pit.js | Narrow override suppresses signs while Monaco street mode supplies twelve. |
| the row carries each team's code for the painter | 219–224 | 222–223 | js/track/scenery/pits.js:9 + js/track/core/pit.js | Mercedes code and every nonempty short code reach row boxes. |
| a bare VM is unsupported and uploads nothing, without throwing | 237–246 | 239, 243–245 | js/garage/pit-signs.js:146 upload/free/draw/paintAtlas | Feature detection refuses upload/draw without recording GPU calls. |
| with a canvas and the livery painter it paints twelve cells and uploads one texture + one texMesh | 248–299 | 258, 263–264, 268–270, 275–276, 278–281, 284, 287, 293–296, 298 | js/garage/pit-signs.js:146 upload/free/draw/paintAtlas | Records team crests/text, atlas dimensions, primary/signal meshes, distance/hidden draw gate and free. |
| a phone on GRAPHICS: HIGH (isMobile, not mobileTier) still gets the half-size pit-sign atlas | 301–322 | 312, 317, 320 | js/garage/pit-signs.js:146 upload/free/draw/paintAtlas | Both mobile flag combinations halve atlas; desktop retains full dimensions. |
| every circuit with a pit wall builds one | 332–344 | 343 | js/track/scenery/pits.js:9 + js/track/core/pit.js | Scoped fleet records wall-built flag for each wall-bearing pit. |
| an upload that throws after the texture landed frees the texture and the mesh it made | 346–367 | 364–366 | js/garage/pit-signs.js:146 upload/free/draw/paintAtlas | Second-mesh throw frees prior texture/mesh and clears handles. |
| the garage-bay cache holds typed arrays, places them identically, and a phone keeps none between builds (M-1) | 369–403 | 377–380, 384, 393–394, 399, 401 | js/track/scenery/pits.js:9 packBay/cache + js/track/core/geom.js | Typed cache saves memory, preserves uploaded float bits and clears only on mobile builds. |

### platform-session-install.test.mjs

Fixture/setup: Source-slices installChip IIFE (20–22); boot (24–42) records fake event listeners, hidden chip/row, timer callbacks and shared Map storage; dismissed prompt promises are deterministic.

Limit: Extracted install flow only; timer callbacks run immediately and no browser installation occurs.

| Case name | Case lines | Assertion spans | Production target | Meaning / limit |
|---|---|---|---|---|
| after the 20 s toast, and on every later launch, the stashed install prompt is one tap away in Settings | 44–68 | 46, 48, 50–51, 53–54, 56, 58–59, 61, 65, 67 | js/ui/platform-session.js:116–150 installChip | Shared event lifecycle, row visibility and single-use prompt counters in extracted IIFE. |
| the chip's tap and the row share one stashed event | 70–76 | 74–75 | js/ui/platform-session.js:116–150 installChip | Shared event lifecycle, row visibility and single-use prompt counters in extracted IIFE. |

### player-collision-side.test.mjs

Fixture/setup: Audio source bundle (18–20), recording WebAudio context/params (22–69), boot (71–98); fetches remain held and timers inert; engine can be suppressed for allocation checks.

Limit: Node counts and pan telemetry; no audible stereo, real AudioContext or waveform identity proof.

| Case name | Case lines | Assertion spans | Production target | Meaning / limit |
|---|---|---|---|---|
| collision(): default side 0 matches centred blip+noise (unchanged) | 100–117 | 106–107, 110, 113–116 | js/audio/engine.js:2812 collision/contact pool | Pins allocation-path/pan telemetry for stated collision arguments; node counters do not prove byte-identical sound. |
| collision(): side -1 and +1 pan through the contact pool | 119–128 | 121–124, 126–127 | js/audio/engine.js:2812 collision/contact pool | Pins allocation-path/pan telemetry for stated collision arguments; node counters do not prove byte-identical sound. |
| collision(): out-of-range side is clamped to the panner limits | 130–136 | 133, 135 | js/audio/engine.js:2812 collision/contact pool | Pins allocation-path/pan telemetry for stated collision arguments; node counters do not prove byte-identical sound. |
| collision(): side 0 explicit still uses centred path (no pool pan latch) | 138–144 | 142–143 | js/audio/engine.js:2812 collision/contact pool | Pins allocation-path/pan telemetry for stated collision arguments; node counters do not prove byte-identical sound. |

### player-dynamics-shipped-vm.test.mjs

Fixture/setup: before/after (32–38) create real game VM on Monza, shipped seat, normal difficulty and manual throttle; measure(g,0) shared. within helper assertion at 40 is used by band cases.

Limit: Shipped Red Bull kit/default-store bench; finite bands/relative handling are not browser or subjective driving validation.

| Case name | Case lines | Assertion spans | Production target | Meaning / limit |
|---|---|---|---|---|
| the shipped seat is the GarageDefaults team and parts sheet, read through the game's own store | 42–51 | 45–50 | tools/lib/game-vm.cjs:549–563 SEATS/seatReport + js/data/garage-defaults.js | Shared shipped-seat bench result; stated finite/balance/handling invariant under fixed setup. |
| the pin seat is still McLaren on an empty sheet | 53–56 | 54–55 | tools/lib/game-vm.cjs:549–563 SEATS/seatReport + js/data/garage-defaults.js | Shared shipped-seat bench result; stated finite/balance/handling invariant under fixed setup. |
| every measurement is finite | 58–58 | 58 | tools/check/player-dyn.mjs:35 bench / :66 measure → js/physics/player-forces.js:13 + js/game.js | Shared shipped-seat bench result; stated finite/balance/handling invariant under fixed setup. |
| braking and acceleration sit in the shipped car's measured bands | 60–71 | 40 (within helper) | tools/check/player-dyn.mjs:35 bench / :66 measure → js/physics/player-forces.js:13 + js/game.js | Measured numeric bands through within() assertion at line 40; intentional retunes/default-kit changes can require new evidence. |
| cornering sits in the shipped car's measured bands | 73–80 | 40 (within helper) | tools/check/player-dyn.mjs:35 bench / :66 measure → js/physics/player-forces.js:13 + js/game.js | Measured numeric bands through within() assertion at line 40; intentional retunes/default-kit changes can require new evidence. |
| trail braking at 55 m/s keeps at least 0.6× coasting yaw (capacity-scaled ellipse) | 82–89 | 83–88 | tools/check/player-dyn.mjs:35 bench / :66 measure → js/physics/player-forces.js:13 + js/game.js | Shared shipped-seat bench result; stated finite/balance/handling invariant under fixed setup. |
| the throttle charges the driven rear axle, never the undriven front | 91–97 | 93–94, 96 | tools/check/player-dyn.mjs:35 bench / :66 measure → js/physics/player-forces.js:13 + js/game.js | Shared shipped-seat bench result; stated finite/balance/handling invariant under fixed setup. |
| a stamp on the brakes mid-corner does not spin the shipped car toward the apex | 99–103 | 101–102 | tools/check/player-dyn.mjs:35 bench / :66 measure → js/physics/player-forces.js:13 + js/game.js | Shared shipped-seat bench result; stated finite/balance/handling invariant under fixed setup. |
| full lock at 45 m/s stays bounded and never spins | 105–109 | 106–108 | tools/check/player-dyn.mjs:35 bench / :66 measure → js/physics/player-forces.js:13 + js/game.js | Shared shipped-seat bench result; stated finite/balance/handling invariant under fixed setup. |
| more lock is more lateral g up to the front's limit, then no more | 111–117 | 114–115 | tools/check/player-dyn.mjs:35 bench / :66 measure → js/physics/player-forces.js:13 + js/game.js | Shared shipped-seat bench result; stated finite/balance/handling invariant under fixed setup. |

### player-dynamics-vm.test.mjs

Fixture/setup: Shared real game VM on dry Monza, normal difficulty, empty-sheet pin seat, manual throttle (19–28); bench/measure import real player-dyn. Later cases re-enter tracks, park rivals, pin position/wear, override live Input, or create independent manual/wheel-state games (457–469); restoration in finally/after.

Limit: Deterministic VM steps at sampled speeds/tracks/conditions; does not establish human feel or live input device behavior.

| Case name | Case lines | Assertion spans | Production target | Meaning / limit |
|---|---|---|---|---|
| every measurement is finite | 30–30 | 30 | tools/check/player-dyn.mjs:35 bench / :66 measure → js/physics/player-forces.js:13 + js/game.js | Checks stated relative handling or regression outcome in controlled game VM; cleanup restores inputs/temporary tuning where coded. |
| the lateral force peaks and falls: past the peak a tyre gives LESS, not the same | 32–39 | 35–36, 38 | tools/check/player-dyn.mjs:35 bench / :66 measure → js/physics/player-forces.js:13 + js/game.js | Checks stated relative handling or regression outcome in controlled game VM; cleanup restores inputs/temporary tuning where coded. |
| a flick at full lock gains heading, but pays for it in front slip past the peak | 41–44 | 42–43 | tools/check/player-dyn.mjs:35 bench / :66 measure → js/physics/player-forces.js:13 + js/game.js | Checks stated relative handling or regression outcome in controlled game VM; cleanup restores inputs/temporary tuning where coded. |
| the throttle charges the driven rear axle, never the undriven front | 46–53 | 48–49, 52 | tools/check/player-dyn.mjs:35 bench / :66 measure → js/physics/player-forces.js:13 + js/game.js | Checks stated relative handling or regression outcome in controlled game VM; cleanup restores inputs/temporary tuning where coded. |
| on the throttle the rear pays the ellipse and the front pays for the weight it loses — no power-on oversteer without a slip ratio | 55–65 | 62–64 | tools/check/player-dyn.mjs:35 bench / :66 measure → js/physics/player-forces.js:13 + js/game.js | Checks stated relative handling or regression outcome in controlled game VM; cleanup restores inputs/temporary tuning where coded. |
| braking wins over a held throttle: the rear is not charged for thrust that braking does not make | 67–86 | 81, 83–84 | tools/check/player-dyn.mjs:35 bench / :66 measure → js/physics/player-forces.js:13 + js/game.js | Checks stated relative handling or regression outcome in controlled game VM; cleanup restores inputs/temporary tuning where coded. |
| frontUtil is 1.0 where the front's lateral force peaks (the front curve peaks at CURVE_PEAK_X_F, not pi/2) | 88–119 | 90, 109–110, 112–113, 118 | tools/check/player-dyn.mjs:35 bench / :66 measure → js/physics/player-forces.js:13 + js/game.js | Checks stated relative handling or regression outcome in controlled game VM; cleanup restores inputs/temporary tuning where coded. |
| lifting off near the limit rotates the car (lift-off oversteer) | 121–123 | 122 | tools/check/player-dyn.mjs:35 bench / :66 measure → js/physics/player-forces.js:13 + js/game.js | Checks stated relative handling or regression outcome in controlled game VM; cleanup restores inputs/temporary tuning where coded. |
| trail braking into a corner rotates the car more than coasting in | 125–135 | 126, 131–134 | tools/check/player-dyn.mjs:35 bench / :66 measure → js/physics/player-forces.js:13 + js/game.js | Checks stated relative handling or regression outcome in controlled game VM; cleanup restores inputs/temporary tuning where coded. |
| a stamp on the brakes mid-corner at the limit does not spin the car toward the apex | 137–144 | 141–143 | tools/check/player-dyn.mjs:35 bench / :66 measure → js/physics/player-forces.js:13 + js/game.js | Checks stated relative handling or regression outcome in controlled game VM; cleanup restores inputs/temporary tuning where coded. |
| full lock at 45 m/s washes wide and never spins | 146–150 | 147–149 | tools/check/player-dyn.mjs:35 bench / :66 measure → js/physics/player-forces.js:13 + js/game.js | Checks stated relative handling or regression outcome in controlled game VM; cleanup restores inputs/temporary tuning where coded. |
| more lock is more lateral g up to the front's limit, then no more (understeer-limited) | 152–158 | 155–156 | tools/check/player-dyn.mjs:35 bench / :66 measure → js/physics/player-forces.js:13 + js/game.js | Checks stated relative handling or regression outcome in controlled game VM; cleanup restores inputs/temporary tuning where coded. |
| grass never becomes a braking shortcut across pace, worn tyres and weak brakes | 162–197 | 178, 181, 192 | tools/check/player-dyn.mjs:35 bench / :66 measure → js/physics/player-forces.js:13 + js/game.js | Pinned grass placement avoids collision/rescue confounds; compares pedal/surface behavior across stated pace/wear/brake inputs. |
| grass braking stays monotonic and can stop below the drag floor with worn weak brakes | 199–228 | 215–216, 226 | tools/check/player-dyn.mjs:35 bench / :66 measure → js/physics/player-forces.js:13 + js/game.js | Pinned grass placement avoids collision/rescue confounds; compares pedal/surface behavior across stated pace/wear/brake inputs. |
| a stopped car with residual lateral velocity comes to rest laterally (Coulomb bleed) | 237–254 | 249–251 | tools/check/player-dyn.mjs:35 bench / :66 measure → js/physics/player-forces.js:13 + js/game.js | Checks stated relative handling or regression outcome in controlled game VM; cleanup restores inputs/temporary tuning where coded. |
| brake at a standstill on a spa DESCENT reverses at the flat-ground rate | 262–291 | 274, 284, 287–289 | tools/check/player-dyn.mjs:35 bench / :66 measure → js/physics/player-forces.js:13 + js/game.js | Checks stated relative handling or regression outcome in controlled game VM; cleanup restores inputs/temporary tuning where coded. |
| the world path carries the body slip the dynamics integrate (travel − heading == atan2(vLat, u)) | 304–326 | 319–320, 322–323 | tools/check/player-dyn.mjs:35 bench / :66 measure → js/physics/player-forces.js:13 + js/game.js | World displacement slip sign and value match body dynamics; requires enough nontrivial-slip samples. |
| reversing on the brake does not lock the wheels or grow a flat spot | 332–346 | 341–344 | tools/check/player-dyn.mjs:35 bench / :66 measure → js/physics/player-forces.js:13 + js/game.js | Checks stated relative handling or regression outcome in controlled game VM; cleanup restores inputs/temporary tuning where coded. |
| a player reversing past a parked car alongside keeps its reverse speed | 351–369 | 360, 365–366 | tools/check/player-dyn.mjs:35 bench / :66 measure → js/physics/player-forces.js:13 + js/game.js | Checks stated relative handling or regression outcome in controlled game VM; cleanup restores inputs/temporary tuning where coded. |
| a car facing backwards on a climb is fed by gravity, not slowed by it | 373–395 | 380, 393 | tools/check/player-dyn.mjs:35 bench / :66 measure → js/physics/player-forces.js:13 + js/game.js | Checks stated relative handling or regression outcome in controlled game VM; cleanup restores inputs/temporary tuning where coded. |
| manual gearbox: throttle leaves reverse within 0.5 s (no rescue) | 401–423 | 414, 418–421 | tools/check/player-dyn.mjs:35 bench / :66 measure → js/physics/player-forces.js:13 + js/game.js | Checks stated relative handling or regression outcome in controlled game VM; cleanup restores inputs/temporary tuning where coded. |
| a light LIVE analog brake: the weight-transfer estimate tracks the decel actually applied | 425–446 | 442–444 | tools/check/player-dyn.mjs:35 bench / :66 measure → js/physics/player-forces.js:13 + js/game.js | Checks stated relative handling or regression outcome in controlled game VM; cleanup restores inputs/temporary tuning where coded. |
| wheel state ON: a dry stop and launch are unchanged and never lock or spin | 472–487 | 483–486 | js/physics/wheel-state.js + js/physics/player-forces.js:13 + js/game.js | Opt-in ON/OFF paired simulations isolate wheel-slip coupling; dry shared fixture precedes grass case. |
| wheel state ON: over the circle the front locks and the stop gets longer | 488–496 | 494–495 | js/physics/wheel-state.js + js/physics/player-forces.js:13 + js/game.js | Opt-in ON/OFF paired simulations isolate wheel-slip coupling; dry shared fixture precedes grass case. |
| wheel state ON: full throttle on grass spins the rear and pulls slower | 497–513 | 510–512 | js/physics/wheel-state.js + js/physics/player-forces.js:13 + js/game.js | Opt-in ON/OFF paired simulations isolate wheel-slip coupling; dry shared fixture precedes grass case. |

### player-forces.test.mjs

Fixture/setup: load (26–57) runs real math/consts/tyres/vehicle/forces with neutral SetupTune, DebrisWorld and Input stubs. Synthetic car/context states isolate step; legacyRearCue replaces only peak divisor for paired feedback counterexample. Optional real wheel-state loaded at 270.

Limit: Single-step synthetic physics; neutral setup/debris/tyres exclude full game integration except separate dynamics suites.

| Case name | Case lines | Assertion spans | Production target | Meaning / limit |
|---|---|---|---|---|
| PlayerForces.create exposes step and tyreSat | 59–71 | 61–63, 69–70 | js/physics/player-forces.js:13 create/step | Checks stated force/API/state invariant with real module and controlled synthetic car context. |
| tyreSat opposes slip (negative of mu · lateralCurve) | 73–83 | 77, 79, 81–82 | js/physics/player-forces.js:21 tyreSat | Checks stated force/API/state invariant with real module and controlled synthetic car context. |
| step writes axle/force/yaw fields without NaN (wear off) | 85–123 | 117, 119, 122 | js/physics/player-forces.js:13 create/step | Checks stated force/API/state invariant with real module and controlled synthetic car context. |
| brake-to-reverse does not snap front slip by ~2·steer (dirS blend) | 125–171 | 163–164, 167–170 | js/physics/player-forces.js:13 create/step | Small crossing-of-zero slip jump plus distinct full reverse term; one assertion uses a permissive nonzero-sign alternative. |
| NaN driverDelta or non-finite dt must not poison car state | 173–216 | 208, 213–215 | js/physics/player-forces.js:13 create/step | Checks stated force/API/state invariant with real module and controlled synthetic car context. |
| coach telemetry records the applied wake loss and assistance without changing forces | 218–236 | 231, 234–235 | js/physics/player-forces.js:13 create/step | Asserts telemetry values and used aero multiplier; title claims force neutrality but no paired full force-state equality here. |
| rear cue compares each axle to its own edge without changing any force integration | 239–264 | 253–255, 257–260, 262–263 | js/physics/player-forces.js:13 create/step | Legacy-divisor counterexample removes false rear rumble while force vectors stay identical; braking-capacity telemetry stays advisory. |
| WheelState front-slip grip loss reaches yaw below the substep boundary | 268–309 | 301–302, 306–307 | js/physics/player-forces.js:13 create/step + js/physics/wheel-state.js | Checks stated force/API/state invariant with real module and controlled synthetic car context. |

### player-tools-backup.test.mjs

Fixture/setup: boot (13–37) uses Map-backed raw/JSON store with write ledger, real tune/presets/controller normalizers, fake audio/default quality, and Input reapply that throws. profile/library builders (38–39) author strict records.

Limit: VM normalizers/storage plus source-text reload contract; no real file picker, quota persistence or reload.

| Case name | Case lines | Assertion spans | Production target | Meaning / limit |
|---|---|---|---|---|
| new settings export canonical defaults and strict authored lanes | 41–55 | 43–46, 48–51, 53–54 | js/ui/settings-export.js:36 collect/applySettings/collectGarage/applyGarage + js/input/controller-profiles.js + js/garage/setup-presets.js:2 | Checks serialized schema acceptance/normalization and stored-data preservation/round-trip; writes recorded in fake store. |
| ALL and CHANGED round-trip physical profiles without immediate input reapplication | 57–72 | 62–64, 69, 71 | js/ui/settings-export.js:36 collect/applySettings/collectGarage/applyGarage + js/input/controller-profiles.js + js/garage/setup-presets.js:2 | Checks serialized schema acceptance/normalization and stored-data preservation/round-trip; writes recorded in fake store. |
| profile imports reject unsupported or malformed containers and enforce 16-device cap | 74–86 | 81, 84–85 | js/ui/settings-export.js:36 collect/applySettings/collectGarage/applyGarage + js/input/controller-profiles.js + js/garage/setup-presets.js:2 | Checks serialized schema acceptance/normalization and stored-data preservation/round-trip; writes recorded in fake store. |
| profile normalizer uses real bounded clean policy for axes and bindings | 88–95 | 92–94 | js/ui/settings-export.js:36 collect/applySettings/collectGarage/applyGarage + js/input/controller-profiles.js + js/garage/setup-presets.js:2 | Checks serialized schema acceptance/normalization and stored-data preservation/round-trip; writes recorded in fake store. |
| named setups export and import in garage only, retaining mechanical values | 97–110 | 99–101, 103–106, 108–109 | js/ui/settings-export.js:36 collect/applySettings/collectGarage/applyGarage + js/input/controller-profiles.js + js/garage/setup-presets.js:2 | Checks serialized schema acceptance/normalization and stored-data preservation/round-trip; writes recorded in fake store. |
| strict preset shape rejects whole malformed or unsupported library without replacing stored data | 112–125 | 123 | js/ui/settings-export.js:36 collect/applySettings/collectGarage/applyGarage + js/input/controller-profiles.js + js/garage/setup-presets.js:2 | Checks serialized schema acceptance/normalization and stored-data preservation/round-trip; writes recorded in fake store. |
| named preset context survives garage backups while malformed metadata cannot replace the library | 127–143 | 130, 132–134, 140–141 | js/ui/settings-export.js:36 collect/applySettings/collectGarage/applyGarage + js/input/controller-profiles.js + js/garage/setup-presets.js:2 | Checks serialized schema acceptance/normalization and stored-data preservation/round-trip; writes recorded in fake store. |
| import UI retains its existing durable-success reload path | 145–148 | 146–147 | js/ui/settings-export.js:36 collect/applySettings/collectGarage/applyGarage + js/input/controller-profiles.js + js/garage/setup-presets.js:2 | Regex/source absence pins reload-based import path; no UI execution. |

### player-tools-ui.test.mjs

Fixture/setup: host (10–23) uses mini-dom with real absent-ID behavior, event map and source VM; storage (24–32) tracks durability/revisions; presets (33–37) loads real tune/library. Individual cases inject camera, audio, Input, routing and timers; final contour case extracts actual game callback and camera branch.

Limit: Mini DOM and injected dependencies; no browser layout, screen reader, rendered outline or actual cross-tab event delivery.

| Case name | Case lines | Assertion spans | Production target | Meaning / limit |
|---|---|---|---|---|
| HUD direction/percent fallback mirrors only its own formatted label, including SHIPPED | 38–45 | 42–44 | js/ui/aria-state.js AriaState.sync | Runs real UI module against mini DOM and explicit dependency stubs; verifies stated state/focus/storage behavior. |
| setting search recognizes player terms and never changes target values | 46–55 | 48–52, 54 | js/ui/settings-search.js:2 find/create/:139 reveal + js/ui/settings-tabs.js:6 SettingsNav | Runs real UI module against mini DOM and explicit dependency stubs; verifies stated state/focus/storage behavior. |
| setting search exposes the lazily-built appearance and screen layout controls | 56–68 | 58–59, 61–62, 66–67 | js/ui/settings-search.js:2 find/create/:139 reveal + js/ui/settings-tabs.js:6 SettingsNav + appearance-studio.js/screen-looks.js registration | Source pins producer registration plus injected catalog queries; does not run full lazy producers. |
| settings result navigation and BACK restore the query and selected result focus | 69–78 | 73, 76–77 | js/ui/settings-search.js:2 find/create/:139 reveal + js/ui/settings-tabs.js:6 SettingsNav | Runs real UI module against mini DOM and explicit dependency stubs; verifies stated state/focus/storage behavior. |
| rivals and boost searches reveal their audio controls without changing the sound | 79–112 | 90, 96, 98, 101, 105–108, 110 | js/ui/settings-search.js:2 find/create/:139 reveal + js/ui/settings-tabs.js:6 SettingsNav | Runs real UI module against mini DOM and explicit dependency stubs; verifies stated state/focus/storage behavior. |
| named presets are per team, bounded, full validated tunes, and non-applying on save | 113–122 | 116–121 | js/garage/setup-presets.js:2 save/preview/apply/remove/mount + js/garage/setup-tune.js | Runs real UI module against mini DOM and explicit dependency stubs; verifies stated state/focus/storage behavior. |
| preset confirmation refuses newer local or foreign setup/library changes | 123–131 | 125–126, 128, 130 | js/garage/setup-presets.js:2 save/preview/apply/remove/mount + js/garage/setup-tune.js | Runs real UI module against mini DOM and explicit dependency stubs; verifies stated state/focus/storage behavior. |
| preset delete leaves fitted setup unchanged and unsupported libraries untouched | 132–137 | 134, 136 | js/garage/setup-presets.js:2 save/preview/apply/remove/mount + js/garage/setup-tune.js | Runs real UI module against mini DOM and explicit dependency stubs; verifies stated state/focus/storage behavior. |
| preset writes disclose session-only durability rather than claiming durable storage | 138–141 | 140 | js/garage/setup-presets.js:2 save/preview/apply/remove/mount + js/garage/setup-tune.js | Runs real UI module against mini DOM and explicit dependency stubs; verifies stated state/focus/storage behavior. |
| camera-only surface inspection captures once, switches immediately and restores the exact snapshot | 142–149 | 146–148 | js/garage/surface-inspection.js:14 create/controls | Runs real UI module against mini DOM and explicit dependency stubs; verifies stated state/focus/storage behavior. |
| race transcript includes delivered race/count cards only, bounds20 and clears a session | 150–157 | 152, 154–156 | js/ui/race-message-history.js:3 delivered/rows/clear | Runs real UI module against mini DOM and explicit dependency stubs; verifies stated state/focus/storage behavior. |
| race mix UI reports a refused sample and STOP cancels an active one | 158–165 | 162–164 | js/ui/race-mix-controls.js create/refresh | Runs real UI module against mini DOM and explicit dependency stubs; verifies stated state/focus/storage behavior. |
| controller profile UI resets only through Input and refreshes via its device event | 166–172 | 170–171 | js/ui/controller-profile-controls.js create/dispose | Runs real UI module against mini DOM and explicit dependency stubs; verifies stated state/focus/storage behavior. |
| SettingsNav keeps a search-result target focus and BACK restores the chosen result | 173–182 | 180–181 | js/ui/settings-search.js:2 find/create/:139 reveal + js/ui/settings-tabs.js:6 SettingsNav | Runs real UI module against mini DOM and explicit dependency stubs; verifies stated state/focus/storage behavior. |
| confirmed deletion refuses a library changed by another tab | 183–187 | 186 | js/garage/setup-presets.js:2 save/preview/apply/remove/mount + js/garage/setup-tune.js | Runs real UI module against mini DOM and explicit dependency stubs; verifies stated state/focus/storage behavior. |
| quiet card refreshes update one history card and preserve its actual initial race time | 188–196 | 190, 193–195 | js/ui/race-message-history.js:3 delivered/rows/clear | Runs real UI module against mini DOM and explicit dependency stubs; verifies stated state/focus/storage behavior. |
| condition-aware cues remain opt-in and change advice toggles only | 197–204 | 201, 203 | js/ui/condition-cue-controls.js create | Runs real UI module against mini DOM and explicit dependency stubs; verifies stated state/focus/storage behavior. |
| SettingsNav page lifecycle fires after lazy audio settles for programmatic routes without selection sounds | 205–214 | 211–213 | js/ui/settings-search.js:2 find/create/:139 reveal + js/ui/settings-tabs.js:6 SettingsNav | Runs real UI module against mini DOM and explicit dependency stubs; verifies stated state/focus/storage behavior. |
| search rejects a CSS-hidden desktop steering control and does not claim focus succeeded | 215–224 | 219, 221, 223 | js/ui/settings-search.js:2 find/create/:139 reveal + js/ui/settings-tabs.js:6 SettingsNav | Runs real UI module against mini DOM and explicit dependency stubs; verifies stated state/focus/storage behavior. |
| unavailable search feedback is visible on the destination page and clears on BACK | 225–233 | 229, 231–232 | js/ui/settings-search.js:2 find/create/:139 reveal + js/ui/settings-tabs.js:6 SettingsNav | Runs real UI module against mini DOM and explicit dependency stubs; verifies stated state/focus/storage behavior. |
| settings search distinguishes steering bias, visual guide and relocated tools | 235–259 | 252, 254, 257 | js/ui/settings-search.js:2 find/create/:139 reveal + js/ui/settings-tabs.js:6 SettingsNav | Runs real UI module against mini DOM and explicit dependency stubs; verifies stated state/focus/storage behavior. |
| relocated search destinations show unavailable feedback in their own page | 261–269 | 265, 267 | js/ui/settings-search.js:2 find/create/:139 reveal + js/ui/settings-tabs.js:6 SettingsNav | Runs real UI module against mini DOM and explicit dependency stubs; verifies stated state/focus/storage behavior. |
| search unavailable feedback uses the shared route panel lookup | 271–280 | 275, 278–279 | js/ui/settings-search.js:2 find/create/:139 reveal + js/ui/settings-tabs.js:6 SettingsNav | Runs real UI module against mini DOM and explicit dependency stubs; verifies stated state/focus/storage behavior. |
| preset preview reveals proposed differences before confirmation and retains keyboard focus without applying | 281–296 | 289–293, 295 | js/garage/setup-presets.js:2 save/preview/apply/remove/mount + js/garage/setup-tune.js | Runs real UI module against mini DOM and explicit dependency stubs; verifies stated state/focus/storage behavior. |
| inspection outlines are steady, replace the previous surface and expire with exact camera restoration | 297–309 | 302, 304–308 | js/garage/surface-inspection.js:14 create/controls | Runs real UI module against mini DOM and explicit dependency stubs; verifies stated state/focus/storage behavior. |
| inspection timeout updates semantic controls and disposal stops detached editor updates | 310–317 | 314–316 | js/garage/surface-inspection.js:14 create/controls | Runs real UI module against mini DOM and explicit dependency stubs; verifies stated state/focus/storage behavior. |
| garage contour borrows the current decal mesh adapter for procedural and loaded-GLB body modes | 318–335 | 321, 330–334 | js/game.js previewDecalMesh injection + js/garage/setup-camera.js contour draw branch | Actual extracted adapter receives current procedural/GLB flag and livery/parts, then skips absent getter; no raster check. |
| a double-tapped SAVE keeps the success message: the name clears and SAVE disables | 337–350 | 342, 344, 346–349 | js/garage/setup-presets.js:2 save/preview/apply/remove/mount + js/garage/setup-tune.js | Runs real UI module against mini DOM and explicit dependency stubs; verifies stated state/focus/storage behavior. |

### poll-live-shell.test.mjs

Fixture/setup: SHA and shellHtml fixtures (24–30), injected fetchText/isAncestor/wait/log; workflow text for timeout budget. example.test URLs are synthetic descriptors, no requests made by this mapping.

Limit: Snapshot logic and injected fetch polling; no live Pages/CDN/ancestry transport proof.

| Case name | Case lines | Assertion spans | Production target | Meaning / limit |
|---|---|---|---|---|
| parseShellMetas requires exactly one apex-build and one apex-sha | 32–39 | 34–35, 37–38 | tools/ci/poll-live-shell.mjs:35 parseShellMetas | Checks stated parsing/poll outcome with authored snapshot/fetch sequence and injected time/ancestry. |
| parseVersionJson tolerates missing sha and rejects junk | 41–46 | 42–45 | tools/ci/poll-live-shell.mjs:51 parseVersionJson | Checks stated parsing/poll outcome with authored snapshot/fetch sequence and injected time/ancestry. |
| evaluateLiveSnapshot matches exact build and sha | 48–57 | 55–56 | tools/ci/poll-live-shell.mjs:81 evaluateLiveSnapshot | Checks stated parsing/poll outcome with authored snapshot/fetch sequence and injected time/ancestry. |
| evaluateLiveSnapshot passes when a newer build superseded this sha | 59–69 | 67–68 | tools/ci/poll-live-shell.mjs:81 evaluateLiveSnapshot | Checks stated parsing/poll outcome with authored snapshot/fetch sequence and injected time/ancestry. |
| evaluateLiveSnapshot does not pass a divergent newer live sha | 71–81 | 79–80 | tools/ci/poll-live-shell.mjs:81 evaluateLiveSnapshot | Checks stated parsing/poll outcome with authored snapshot/fetch sequence and injected time/ancestry. |
| evaluateLiveSnapshot waits while live build is still behind | 83–93 | 90–92 | tools/ci/poll-live-shell.mjs:81 evaluateLiveSnapshot | Checks stated parsing/poll outcome with authored snapshot/fetch sequence and injected time/ancestry. |
| backoffMs grows then caps | 95–102 | 96–98, 100–101 | tools/ci/poll-live-shell.mjs:137 backoffMs | Checks stated parsing/poll outcome with authored snapshot/fetch sequence and injected time/ancestry. |
| pollLiveShell survives a rejecting fetch, sleeps with backoff, and recovers | 104–122 | 119–121 | tools/ci/poll-live-shell.mjs:208 pollLiveShell | Checks stated parsing/poll outcome with authored snapshot/fetch sequence and injected time/ancestry. |
| pollLiveShell that never fetches ends in a timeout naming the fetch error | 124–132 | 130–131 | tools/ci/poll-live-shell.mjs:208 pollLiveShell | Checks stated parsing/poll outcome with authored snapshot/fetch sequence and injected time/ancestry. |
| worst-case poll plus overhead fits inside the verify-live job timeout | 134–162 | 139–144, 146, 150, 156–161 | tools/ci/poll-live-shell.mjs:153 worstCasePollMs + .github/workflows/pages.yml | Checks stated parsing/poll outcome with authored snapshot/fetch sequence and injected time/ancestry. |
| pollLiveShell logs last live values and fails on timeout | 164–184 | 180–183 | tools/ci/poll-live-shell.mjs:208 pollLiveShell | Checks stated parsing/poll outcome with authored snapshot/fetch sequence and injected time/ancestry. |
| pollLiveShell returns superseded without requiring exact build equality | 186–202 | 200–201 | tools/ci/poll-live-shell.mjs:208 pollLiveShell | Checks stated parsing/poll outcome with authored snapshot/fetch sequence and injected time/ancestry. |
| pollLiveShell eventually matches after behind snapshots | 204–223 | 221–222 | tools/ci/poll-live-shell.mjs:208 pollLiveShell | Checks stated parsing/poll outcome with authored snapshot/fetch sequence and injected time/ancestry. |
| pollLiveShell cache-busts every fetch with a query unique per attempt and per file pair | 225–240 | 235, 237–239 | tools/ci/poll-live-shell.mjs:208 pollLiveShell | Checks stated parsing/poll outcome with authored snapshot/fetch sequence and injected time/ancestry. |

### post-fx-opts.test.mjs

Fixture/setup: Real defaults VM, module source, shell/game source (20–29); load (31–46) records SettingRow wire specs and raw store. Last case stubs PerfGov shed flag.

Limit: Switch state and strength objects/source wiring; no measured pass skipping or backend GPU timing.

| Case name | Case lines | Assertion spans | Production target | Meaning / limit |
|---|---|---|---|---|
| it claims pm-ssao and pm-godrays, and the shell declares both rows with their selects | 48–60 | 50, 52–54, 58–59 | js/ui/post-fx-opts.js:12 state/UI; :38 gate; applyLookShed + js/data/settings-defaults.js + index.html/js/game.js | Checks real option state/strength transformation and source wiring; no backend executes. |
| both ship ON: an unset key reads ON from the shipped SettingsDefaults | 62–70 | 63–64, 66–69 | js/ui/post-fx-opts.js:12 state/UI; :38 gate; applyLookShed + js/data/settings-defaults.js + index.html/js/game.js | Checks real option state/strength transformation and source wiring; no backend executes. |
| each row flips its own pass only, and persists through its own key | 72–93 | 75–78, 81–83, 86–88, 91 | js/ui/post-fx-opts.js:12 state/UI; :38 gate; applyLookShed + js/data/settings-defaults.js + index.html/js/game.js | Checks real option state/strength transformation and source wiring; no backend executes. |
| gate() zeroes EVERY strength a switched-off pass is gated on, and nothing of the other pass | 95–110 | 100, 102, 104, 106, 108–109 | js/ui/post-fx-opts.js:12 state/UI; :38 gate; applyLookShed + js/data/settings-defaults.js + index.html/js/game.js | Checks real option state/strength transformation and source wiring; no backend executes. |
| applyLookShed zeros look-defining strengths when lookPostShed is true | 112–142 | 137, 139–141 | js/ui/post-fx-opts.js:12 state/UI; :38 gate; applyLookShed + js/data/settings-defaults.js + index.html/js/game.js | Checks real option state/strength transformation and source wiring; no backend executes. |

### pr-board.test.mjs

Fixture/setup: base/fullJobs/ctx (13–19), guard/prObj (130–135), fakeApi (165–187) implement paged request responses. Injected curl runner records arguments/stdin; snapshot store uses scratch artifacts and fake 304 response.

Limit: Read-only decision/render/transport contracts on fabricated PRs; no GitHub action or actual API permission check.

| Case name | Case lines | Assertion spans | Production target | Meaning / limit |
|---|---|---|---|---|
| defaults come from github-api | 21–24 | 22–23 | tools/ci/pr-board.mjs decide:130/suggest:160 | Checks stated priority/derived-state/transport behavior using authored PR/run/check records. |
| suggest: ARM — ready, not armed, gate passed, overall CI succeeded | 26–28 | 27 | tools/ci/pr-board.mjs decide:130/suggest:160 | Checks stated priority/derived-state/transport behavior using authored PR/run/check records. |
| suggest: ready PR waits for overall CI success even after guards pass | 30–37 | 33–34, 36 | tools/ci/pr-board.mjs decide:130/suggest:160 | Checks stated priority/derived-state/transport behavior using authored PR/run/check records. |
| suggest: ARM needs the gate; a pending or absent gate waits | 39–42 | 40–41 | tools/ci/pr-board.mjs decide:130/suggest:160 | Checks stated priority/derived-state/transport behavior using authored PR/run/check records. |
| suggest: READY — draft, green, gate passed; there is no ready cap (2026-10-16) | 44–51 | 46–50 | tools/ci/pr-board.mjs decide:130/suggest:160 | Checks stated priority/derived-state/transport behavior using authored PR/run/check records. |
| suggest: a draft waits while ci runs, without the gate, or when the fast tier is not green | 53–60 | 55–59 | tools/ci/pr-board.mjs decide:130/suggest:160 | Checks stated priority/derived-state/transport behavior using authored PR/run/check records. |
| suggest: SYNC — dirty, and it outranks FIX and ARM | 62–66 | 63–65 | tools/ci/pr-board.mjs decide:130/suggest:160 | Checks stated priority/derived-state/transport behavior using authored PR/run/check records. |
| suggest: FIX — ci failed on the head, or Structural guards failed | 68–73 | 69–72 | tools/ci/pr-board.mjs decide:130/suggest:160 | Checks stated priority/derived-state/transport behavior using authored PR/run/check records. |
| suggest: FOREIGN-ARM — armed with squash or rebase (MERGE-COMMIT-ONLY); wins over everything | 75–79 | 76–78 | tools/ci/pr-board.mjs decide:130/suggest:160 | Checks stated priority/derived-state/transport behavior using authored PR/run/check records. |
| suggest: NONE — armed with MERGE and healthy; never ARM again | 81–86 | 83–85 | tools/ci/pr-board.mjs decide:130/suggest:160 | Checks stated priority/derived-state/transport behavior using authored PR/run/check records. |
| suggest: ARM waits on a MERGE-HOLD line and at MAX_ARMED armed repo-wide | 88–93 | 89–92 | tools/ci/pr-board.mjs decide:130/suggest:160 | Checks stated priority/derived-state/transport behavior using authored PR/run/check records. |
| hasMergeHold: a line STARTING with MERGE-HOLD:, outside comments, is the only veto | 95–101 | 96–100 | tools/ci/pr-board.mjs hasMergeHold:66 | Pins body-line MERGE-HOLD parser; evaluate also honors hold label, not exercised by this case. |
| suggest: READY waits while the draft's Plan has open items | 103–108 | 105–107 | tools/ci/pr-board.mjs decide:130/suggest:160 | Checks stated priority/derived-state/transport behavior using authored PR/run/check records. |
| decide returns a reason with every action | 110–116 | 113–114 | tools/ci/pr-board.mjs decide:130/suggest:160 | Checks stated priority/derived-state/transport behavior using authored PR/run/check records. |
| ciState: none, live beats finished, newest conclusion otherwise | 118–128 | 119–125, 127 | tools/ci/pr-board.mjs ciState:99 | Checks stated priority/derived-state/transport behavior using authored PR/run/check records. |
| evaluate: sorts, derives ci/gate/failing jobs, and every green draft is READY | 137–152 | 147–151 | tools/ci/pr-board.mjs evaluate:177/render:218 | Checks stated priority/derived-state/transport behavior using authored PR/run/check records. |
| render: header, one line per PR, a footer; empty board says so | 154–163 | 158–160, 162 | tools/ci/pr-board.mjs evaluate:177/render:218 | Checks stated priority/derived-state/transport behavior using authored PR/run/check records. |
| measure pages the open PR list (101 PRs) and reads every PR | 189–197 | 193–196 | tools/ci/pr-board.mjs measure:248 | Checks stated priority/derived-state/transport behavior using authored PR/run/check records. |
| measure: failing jobs come from the failed run; --pr reads one PR | 199–214 | 208–209, 212–213 | tools/ci/pr-board.mjs measure:248 | Checks stated priority/derived-state/transport behavior using authored PR/run/check records. |
| measure --pr counts armed siblings across every PR page, without reading their CI details | 216–239 | 229, 232–237 | tools/ci/pr-board.mjs measure:248 | Checks stated priority/derived-state/transport behavior using authored PR/run/check records. |
| measure --pr refreshes the selected PR's armed state after listing siblings | 241–249 | 248 | tools/ci/pr-board.mjs measure:248 | Checks stated priority/derived-state/transport behavior using authored PR/run/check records. |
| measure --pr on a PR that is closed or targets another base is a bad-args error | 251–259 | 255–257 | tools/ci/pr-board.mjs measure:248 | Checks stated priority/derived-state/transport behavior using authored PR/run/check records. |
| measure: any API error fails the whole board with the error text | 261–271 | 265–267, 270 | tools/ci/pr-board.mjs measure:248 | Checks stated priority/derived-state/transport behavior using authored PR/run/check records. |
| measure without a token reports the hint (no request leaves the box) | 273–279 | 276–278 | tools/ci/pr-board.mjs measure:248 | Checks stated priority/derived-state/transport behavior using authored PR/run/check records. |
| only GET requests are ever issued: every curl the default transport spawns is a bare GET | 281–304 | 292–293, 295, 297, 299–302 | tools/ci/pr-board.mjs measure:248 | Checks stated priority/derived-state/transport behavior using authored PR/run/check records. |
| evaluate + render: PLAN is done/items from the body, HOLD is flagged, a sweep never arms past MAX_ARMED | 307–324 | 317–320, 322–323 | tools/ci/pr-board.mjs evaluate:177/render:218 | Checks stated priority/derived-state/transport behavior using authored PR/run/check records. |
| suggest: a MERGE-HOLD: body never yields ARM or READY, at any gate/ci state | 330–345 | 335, 338–339, 343–344 | tools/ci/pr-board.mjs decide:130/suggest:160 | Checks stated priority/derived-state/transport behavior using authored PR/run/check records. |
| suggest: an open Plan item (ready-gate plan-open) never yields ARM | 347–359 | 350–353, 357–358 | tools/ci/pr-board.mjs decide:130/suggest:160 | Checks stated priority/derived-state/transport behavior using authored PR/run/check records. |
| --alarm: ready + green + no hold + no ci run for 12 h is a stall; drafts, holds, reds and fresh pushes are not | 365–380 | 372–373, 375–379 | tools/ci/pr-board.mjs stalled:315/alarmLines:319 | Checks stated priority/derived-state/transport behavior using authored PR/run/check records. |
| measure: one recent ci.yml page answers covered heads; only uncovered heads get their own runs read | 382–394 | 388–391, 393 | tools/ci/pr-board.mjs measure:248 | Checks stated priority/derived-state/transport behavior using authored PR/run/check records. |
| pr-snapshot: one process never asks the same URL twice; errors are not memoised; stats count requests | 400–410 | 404–405, 407–409 | tools/lib/pr-snapshot.mjs:52 loadStore/:72 saveStore/:155 createSnapshot/:250 runsByHead | Checks stated priority/derived-state/transport behavior using authored PR/run/check records. |
| pr-snapshot: the ETag store round-trips through artifacts/ and a 304 reuse is counted | 412–432 | 418, 420, 425–427, 429, 431 | tools/lib/pr-snapshot.mjs:52 loadStore/:72 saveStore/:155 createSnapshot/:250 runsByHead | Checks stated priority/derived-state/transport behavior using authored PR/run/check records. |

### pr-body.test.mjs

Fixture/setup: BODY multiline Markdown fixture (11–32) has commented examples, live Plan/status/fleet; injected request/log in final main case records GET/PATCH/POST without network.

Limit: String transforms and mocked transport; no remote conflict resolution/ETag locking.

| Case name | Case lines | Assertion spans | Production target | Meaning / limit |
|---|---|---|---|---|
| planItems ignores items inside HTML comments and numbers in order | 34–38 | 36–37 | tools/ci/pr-body.mjs :64 planItems | Checks targeted Markdown transform or injected transport sequence while preserving unrelated text. |
| tick appends evidence, drops **now:**, touches nothing else | 40–46 | 42–45 | tools/ci/pr-body.mjs :93 tickItem | Checks targeted Markdown transform or injected transport sequence while preserving unrelated text. |
| strike keeps the item listed and closed; defer closes with [~] | 48–56 | 50–51, 53–55 | tools/ci/pr-body.mjs :101 strikeItem/:109 deferItem + ready-gate planVerdict | Checks targeted Markdown transform or injected transport sequence while preserving unrelated text. |
| now moves the single marker | 58–64 | 60–63 | tools/ci/pr-body.mjs :115 nowItem | Checks targeted Markdown transform or injected transport sequence while preserving unrelated text. |
| add appends after the last item, inside Plan | 66–71 | 68–70 | tools/ci/pr-body.mjs :128 addItem | Checks targeted Markdown transform or injected transport sequence while preserving unrelated text. |
| status replaces the block, keeps the comment and other sections | 73–78 | 75–77 | tools/ci/pr-body.mjs :142 setStatus | Checks targeted Markdown transform or injected transport sequence while preserving unrelated text. |
| fleet updates a key (keeping its comment) or adds one | 80–87 | 82, 84–86 | tools/ci/pr-body.mjs :155 setFleet | Checks targeted Markdown transform or injected transport sequence while preserving unrelated text. |
| --fleet never reads or edits a block inside <!-- --> (verify #37b): the template example stays untouched | 89–96 | 91–92, 94–95 | tools/ci/pr-body.mjs :155 setFleet/fleetEntries | Checks targeted Markdown transform or injected transport sequence while preserving unrelated text. |
| applyEdits changes only the targeted item (a concurrent edit survives) | 98–103 | 101–102 | tools/ci/pr-body.mjs :170 applyEdits | Checks targeted Markdown transform or injected transport sequence while preserving unrelated text. |
| parseEdits: pairing and unknown flags | 105–111 | 106–108, 110 | tools/ci/pr-body.mjs :209 parseEdits | Checks targeted Markdown transform or injected transport sequence while preserving unrelated text. |
| main: re-reads the live body, PATCHes once, dry-run writes nothing, labels via POST | 113–126 | 117–120, 123–125 | tools/ci/pr-body.mjs :236 main | Checks targeted Markdown transform or injected transport sequence while preserving unrelated text. |

### pre-commit-guards.test.mjs

Fixture/setup: cleanEnv/scratchRepo (35–60), tiny guards/roster/spawn (62–84); throwaway Git repositories under artifacts. Stub npm sleeps exercise timeout; nativeHookRepo (482–516) copies real hook/helper, unrelated generators stubbed. realRatchetHookRepo (608–631) adds real ratchets/merge-hygiene/reason helper. Template test bodies at 498–505 and 622–625 are fixture content, not additional suite cases.

Limit: Would execute real Git/hooks only in throwaway repos, except real-checkout CLI check. No commits/hooks were run during this mapping.

| Case name | Case lines | Assertion spans | Production target | Meaning / limit |
|---|---|---|---|---|
| OK_REL and FRESH_MS match bash-guard's shared verdict cache (#2889) | 86–92 | 87–88, 90–91 | tools/ci/guards-verdict.mjs:110 checkVerdict/:126 runGuards + .claude/hooks/bash-guard.sh | Checks stated guard provenance/cache/index/timeout outcome using scratch Git/hook fixtures; no real project commit. |
| check hits a fresh green write-tree and misses after re-stage | 94–124 | 106–107, 112–113, 120 | tools/ci/guards-verdict.mjs:110 checkVerdict/:126 runGuards + .githooks/pre-commit | Checks stated guard provenance/cache/index/timeout outcome using scratch Git/hook fixtures; no real project commit. |
| run writes the cache only when green and the worktree matches the index | 126–167 | 136–138, 149–152, 159–163 | tools/ci/guards-verdict.mjs:110 checkVerdict/:126 runGuards + .githooks/pre-commit | Checks stated guard provenance/cache/index/timeout outcome using scratch Git/hook fixtures; no real project commit. |
| CLI check message shape on the real checkout | 169–180 | 176, 178 | tools/ci/guards-verdict.mjs:110 checkVerdict/:126 runGuards + .githooks/pre-commit | Checks stated guard provenance/cache/index/timeout outcome using scratch Git/hook fixtures; no real project commit. |
| isFreshHit rejects a mismatched tree | 182–197 | 191, 193 | tools/ci/guards-verdict.mjs:110 checkVerdict/:126 runGuards + .githooks/pre-commit | Checks stated guard provenance/cache/index/timeout outcome using scratch Git/hook fixtures; no real project commit. |
| pre-commit skips the suite on a cache hit and honours git config apex.guardTimeout | 199–287 | 266–272, 281–283 | tools/ci/guards-verdict.mjs:110 checkVerdict/:126 runGuards + .githooks/pre-commit | Checks stated guard provenance/cache/index/timeout outcome using scratch Git/hook fixtures; no real project commit. |
| bash-guard skips the suite on a guards-verdict cache hit and honours git config apex.guardTimeout | 289–364 | 352–354, 358–360 | tools/ci/guards-verdict.mjs:110 checkVerdict/:126 runGuards + .claude/hooks/bash-guard.sh | Checks stated guard provenance/cache/index/timeout outcome using scratch Git/hook fixtures; no real project commit. |
| shipped pre-commit still early-exits on APEX_SKIP_GUARDS and CLAUDECODE | 366–373 | 368–372 | tools/ci/guards-verdict.mjs:110 checkVerdict/:126 runGuards + .githooks/pre-commit | Source-shape pins only; runtime skip/timeout evidence is in neighboring fixture cases. |
| shipped bash-guard shares guards-verdict check and apex.guardTimeout with pre-commit | 375–380 | 377–379 | tools/ci/guards-verdict.mjs:110 checkVerdict/:126 runGuards + .claude/hooks/bash-guard.sh | Source-shape pins only; runtime skip/timeout evidence is in neighboring fixture cases. |
| a passing subset cannot certify the full guards roster; a complete rerun recovers | 383–401 | 392–396, 399–400 | tools/ci/guards-verdict.mjs:110 checkVerdict/:126 runGuards + .githooks/pre-commit | Checks stated guard provenance/cache/index/timeout outcome using scratch Git/hook fixtures; no real project commit. |
| guards cannot cache a different tree staged during execution | 403–420 | 415–419 | tools/ci/guards-verdict.mjs:110 checkVerdict/:126 runGuards + .githooks/pre-commit | Checks stated guard provenance/cache/index/timeout outcome using scratch Git/hook fixtures; no real project commit. |
| failed and interrupted reruns invalidate an earlier green cache | 422–434 | 431–432 | tools/ci/guards-verdict.mjs:110 checkVerdict/:126 runGuards + .githooks/pre-commit | Checks stated guard provenance/cache/index/timeout outcome using scratch Git/hook fixtures; no real project commit. |
| unavailable Git observations never establish a clean cacheable tree | 436–451 | 447–450 | tools/ci/guards-verdict.mjs:110 checkVerdict/:126 runGuards + .githooks/pre-commit | Checks stated guard provenance/cache/index/timeout outcome using scratch Git/hook fixtures; no real project commit. |
| the default guard runner executes every file even inside another Node test runner | 453–478 | 465–467, 471–473 | tools/ci/guards-verdict.mjs:110 checkVerdict/:126 runGuards + .githooks/pre-commit | Checks stated guard provenance/cache/index/timeout outcome using scratch Git/hook fixtures; no real project commit. |
| native hook refuses a partially staged failing source hidden by an unstaged passing correction | 518–542 | 526–531, 535–536, 540–541 | tools/ci/guards-verdict.mjs:110 checkVerdict/:126 runGuards + .githooks/pre-commit | Checks stated guard provenance/cache/index/timeout outcome using scratch Git/hook fixtures; no real project commit. |
| native hook honours commit -a's temporary index without committing the stale staged source | 544–556 | 551–555 | tools/ci/guards-verdict.mjs:110 checkVerdict/:126 runGuards + .githooks/pre-commit | Checks stated guard provenance/cache/index/timeout outcome using scratch Git/hook fixtures; no real project commit. |
| pathspec commit cannot reuse a verdict for the original index; rejection preserves both indexes | 558–575 | 565–570, 573–574 | tools/ci/guards-verdict.mjs:110 checkVerdict/:126 runGuards + .githooks/pre-commit | Checks stated guard provenance/cache/index/timeout outcome using scratch Git/hook fixtures; no real project commit. |
| matching native-hook cache remains valid for its staged tree despite a later unstaged edit | 577–591 | 582, 586–590 | tools/ci/guards-verdict.mjs:110 checkVerdict/:126 runGuards + .githooks/pre-commit | Checks stated guard provenance/cache/index/timeout outcome using scratch Git/hook fixtures; no real project commit. |
| native hook refuses worktree provenance lost during an otherwise green suite | 593–606 | 601–605 | tools/ci/guards-verdict.mjs:110 checkVerdict/:126 runGuards + .githooks/pre-commit | Checks stated guard provenance/cache/index/timeout outcome using scratch Git/hook fixtures; no real project commit. |
| native auto-raise commits a new topic fragment and leaves unrelated untracked files alone | 633–646 | 640–645 | tools/ci/guards-verdict.mjs:110 checkVerdict/:126 runGuards + .githooks/pre-commit + tools/check/ratchets.mjs and tools/hooks/ratchet-reason.mjs | Checks stated guard provenance/cache/index/timeout outcome using scratch Git/hook fixtures; no real project commit. |
| native auto-raise updates a tracked topic fragment through commit -a's active index | 648–656 | 652–655 | tools/ci/guards-verdict.mjs:110 checkVerdict/:126 runGuards + .githooks/pre-commit + tools/check/ratchets.mjs and tools/hooks/ratchet-reason.mjs | Checks stated guard provenance/cache/index/timeout outcome using scratch Git/hook fixtures; no real project commit. |
| native pathspec auto-generation refuses without changing the user's index or committing a missing ceiling | 658–675 | 665–674 | tools/ci/guards-verdict.mjs:110 checkVerdict/:126 runGuards + .githooks/pre-commit + tools/check/ratchets.mjs and tools/hooks/ratchet-reason.mjs | Checks stated guard provenance/cache/index/timeout outcome using scratch Git/hook fixtures; no real project commit. |
| a clean no-generation pathspec commit preserves an unrelated staged path | 677–687 | 683–686 | tools/ci/guards-verdict.mjs:110 checkVerdict/:126 runGuards + .githooks/pre-commit + tools/check/ratchets.mjs and tools/hooks/ratchet-reason.mjs | Checks stated guard provenance/cache/index/timeout outcome using scratch Git/hook fixtures; no real project commit. |
| native auto-lowering stages deletion of an emptied tracked topic fragment | 689–698 | 694–697 | tools/ci/guards-verdict.mjs:110 checkVerdict/:126 runGuards + .githooks/pre-commit + tools/check/ratchets.mjs and tools/hooks/ratchet-reason.mjs | Checks stated guard provenance/cache/index/timeout outcome using scratch Git/hook fixtures; no real project commit. |
| a no-change ratchet run stages no ratchet paths or unrelated files | 700–711 | 707–710 | tools/ci/guards-verdict.mjs:110 checkVerdict/:126 runGuards + .githooks/pre-commit + tools/check/ratchets.mjs and tools/hooks/ratchet-reason.mjs | Checks stated guard provenance/cache/index/timeout outcome using scratch Git/hook fixtures; no real project commit. |
| a red ratchet run leaves the user's staged tree and unrelated files intact | 713–726 | 720–725 | tools/ci/guards-verdict.mjs:110 checkVerdict/:126 runGuards + .githooks/pre-commit + tools/check/ratchets.mjs and tools/hooks/ratchet-reason.mjs | Checks stated guard provenance/cache/index/timeout outcome using scratch Git/hook fixtures; no real project commit. |
| pre-existing untracked ratchet inputs refuse before generation and are never auto-staged | 728–742 | 736–741 | tools/ci/guards-verdict.mjs:110 checkVerdict/:126 runGuards + .githooks/pre-commit + tools/check/ratchets.mjs and tools/hooks/ratchet-reason.mjs | Checks stated guard provenance/cache/index/timeout outcome using scratch Git/hook fixtures; no real project commit. |

### prepush-gate-coverage.test.mjs

Fixture/setup: Real groups, unit directory listing, TOOLING_FAST_FILES and gateNodeSuites; explicit SWEEPS_ONLY map (57–83), gateCoverage helper (88–100) asserts group existence at 96.

Limit: Roster/source consistency; does not execute any listed gate or prove those suites pass.

| Case name | Case lines | Assertion spans | Production target | Meaning / limit |
|---|---|---|---|---|
| every unit file is run by the pre-push gate, or named here with the group that runs it | 105–114 | 109–113 | tools/ci/tooling-fast.mjs TOOLING_FAST_FILES + tools/ci/deploy.mjs gateNodeSuites/gateOnly/main + tests/groups.json/.github/workflows/ci.yml | Evaluates configured coverage/exemptions or source placement; no listed suite is executed. |
| the exemption list has no stale entries | 116–126 | 122, 125 | tools/ci/tooling-fast.mjs TOOLING_FAST_FILES + tools/ci/deploy.mjs gateNodeSuites/gateOnly/main + tests/groups.json/.github/workflows/ci.yml | Evaluates configured coverage/exemptions or source placement; no listed suite is executed. |
| the gate's node half is derived, not hard-coded | 128–136 | 134–135 | tools/ci/tooling-fast.mjs TOOLING_FAST_FILES + tools/ci/deploy.mjs gateNodeSuites/gateOnly/main + tests/groups.json/.github/workflows/ci.yml | Evaluates configured coverage/exemptions or source placement; no listed suite is executed. |
| deploy.mjs runs test:sweeps-parts unconditionally, in the deploy and in --gate-only | 138–149 | 145–147 | tools/ci/tooling-fast.mjs TOOLING_FAST_FILES + tools/ci/deploy.mjs gateNodeSuites/gateOnly/main + tests/groups.json/.github/workflows/ci.yml | Evaluates configured coverage/exemptions or source placement; no listed suite is executed. |

### process-dashboard.test.mjs

Fixture/setup: Checked-in runs.json fixture (31), custom inline runs and job fixtures, fetch/delay hooks reset in finally. Fixture contains full/fast/cancelled CI, four deploy runs and flake events.

Limit: Synthetic statistical reduction and transport retries; does not measure current CI latency or publish metrics.

| Case name | Case lines | Assertion spans | Production target | Meaning / limit |
|---|---|---|---|---|
| familyOf strips a matrix cell and keeps the job's own parentheses | 33–54 | 34–53 | tools/ci/process-dashboard.mjs :107 familyOf/:120 isFullJob | Checks stated reducer/statistics/pagination/retry result against fixed data or source workflow. |
| percentile is nearest-rank | 56–61 | 57–60 | tools/ci/process-dashboard.mjs :128 percentile | Checks stated reducer/statistics/pagination/retry result against fixed data or source workflow. |
| reducer derives every number from the checked-in fixture | 63–115 | 65–68, 71–76, 79, 82–85, 88, 90–93, 95–103, 105–108, 110–114 | tools/ci/process-dashboard.mjs :179 reduceDashboard | Checks stated reducer/statistics/pagination/retry result against fixed data or source workflow. |
| a run that only finished the selected verdict is neither tier | 117–137 | 135–136 | tools/ci/process-dashboard.mjs :179 reduceDashboard | Checks stated reducer/statistics/pagination/retry result against fixed data or source workflow. |
| a draft-skip run and a sweeps rollup do not move the tier or the family | 139–199 | 193–195, 197–198 | tools/ci/process-dashboard.mjs :179 reduceDashboard | Checks stated reducer/statistics/pagination/retry result against fixed data or source workflow. |
| time ratchets fail only over the ceiling, and a thin sample is skipped | 201–216 | 210–211, 213–215 | tools/ci/process-dashboard.mjs :357 checkTimeRatchets | Checks stated reducer/statistics/pagination/retry result against fixed data or source workflow. |
| the comparison markdown names the 2026-09-16 column and this window | 218–224 | 220–223 | tools/ci/process-dashboard.mjs :377 formatMarkdown | Checks stated reducer/statistics/pagination/retry result against fixed data or source workflow. |
| the scheduled workflow publishes to metrics and checks ratchets only there | 226–238 | 228–237 | tools/ci/process-dashboard.mjs constants + .github/workflows/process-dashboard.yml | Checks stated reducer/statistics/pagination/retry result against fixed data or source workflow. |
| #2233 / W18f: attachJobs pages 30 at a time (per_page=100 502'd the nightly) | 240–270 | 262–266 | tools/ci/process-dashboard.mjs :529 attachJobs | Checks stated reducer/statistics/pagination/retry result against fixed data or source workflow. |
| ghJson retries a transient 502 then returns JSON (process-dashboard run 39578940130) | 272–289 | 284–285 | tools/ci/process-dashboard.mjs :444 ghJson | Checks stated reducer/statistics/pagination/retry result against fixed data or source workflow. |
| ghJson does not retry a permanent 404 | 291–304 | 299–300 | tools/ci/process-dashboard.mjs :444 ghJson | Checks stated reducer/statistics/pagination/retry result against fixed data or source workflow. |

### profile-lib.test.mjs

Fixture/setup: run span fixture (10), synthetic CPU trees, scenario builder (75–77). profileCallbacks (102–112) AST-extracts real prepareRace/measureSteps; shared assert at 107 validates extraction. Temporary saved JSON/CPU profiles and symlink exercise CLI; mocked apex/page records setup, step, cleanup.

Limit: Saved-artifact math/validation and mocked profile callbacks; no Chromium capture or actual performance win.

| Case name | Case lines | Assertion spans | Production target | Meaning / limit |
|---|---|---|---|---|
| median and aggregate: median across repeats, spread = max-min | 12–16 | 13, 15 | tools/perf/lib.mjs:5–109 aggregate/diff/verdict/scenario/formatters | Checks stated saved-profile math/identity/CLI rejection contract with synthetic or mocked inputs. |
| a delta inside the spread is noise, outside it is a WIN / REGRESS | 18–26 | 21, 23, 25 | tools/perf/lib.mjs:5–109 aggregate/diff/verdict/scenario/formatters | Checks stated saved-profile math/identity/CLI rejection contract with synthetic or mocked inputs. |
| fewer than 3 repeats prove nothing; raf is info; a span on one side only is n/a | 28–35 | 30, 32–34 | tools/perf/lib.mjs:5–109 aggregate/diff/verdict/scenario/formatters | Checks stated saved-profile math/identity/CLI rejection contract with synthetic or mocked inputs. |
| tables render and sort by p50 | 37–41 | 39–40 | tools/perf/lib.mjs:5–109 aggregate/diff/verdict/scenario/formatters | Checks stated saved-profile math/identity/CLI rejection contract with synthetic or mocked inputs. |
| intervalStats | 43–46 | 44–45 | tools/perf/lib.mjs:5–109 aggregate/diff/verdict/scenario/formatters | Only empty input and lower median are pinned, not every percentile field. |
| summariseCpu: self vs total, fn filter | 49–56 | 54–55 | tools/perf/query.mjs:17 summariseCpu/CLI | Checks stated saved-profile math/identity/CLI rejection contract with synthetic or mocked inputs. |
| incomparable: arms with different capture modes never read as noise/WIN/REGRESS | 58–66 | 60–61, 63, 65 | tools/perf/lib.mjs:5–109 aggregate/diff/verdict/scenario/formatters | Checks stated saved-profile math/identity/CLI rejection contract with synthetic or mocked inputs. |
| saved profiles require complete matching workload, capture and observed renderer | 79–98 | 81–82, 84, 88, 90, 94, 96–97 | tools/perf/lib.mjs:5–109 aggregate/diff/verdict/scenario/formatters | Checks stated saved-profile math/identity/CLI rejection contract with synthetic or mocked inputs. |
| profile race setup seeds before creation, awaits readiness and rejects an unbuilt world | 114–142 | 126, 129, 133, 135, 137, 139, 141 | tools/perf/profile.mjs:73 prepareRace | Checks stated saved-profile math/identity/CLI rejection contract with synthetic or mocked inputs. |
| profile fixed-step samples require real motion, count the final partial batch and restore input/rendering | 144–163 | 149, 153–155, 157–158, 160, 162 | tools/perf/profile.mjs:150 measureSteps | Checks stated saved-profile math/identity/CLI rejection contract with synthetic or mocked inputs. |
| query CLI never awards a win to incompatible or unknown saved profiles; matching captures retain noise rule | 165–189 | 174, 178, 181–182, 184, 186–187 | tools/perf/query.mjs:17 summariseCpu/CLI | Checks stated saved-profile math/identity/CLI rejection contract with synthetic or mocked inputs. |
| CPU summaries preserve full source and column identity, including pipe characters | 192–207 | 201–206 | tools/perf/query.mjs:17 summariseCpu/CLI | Checks stated saved-profile math/identity/CLI rejection contract with synthetic or mocked inputs. |
| CPU summaries reject cyclic and ambiguous saved trees instead of hanging or misattributing samples | 209–220 | 216–217, 219 | tools/perf/query.mjs:17 summariseCpu/CLI | Checks stated saved-profile math/identity/CLI rejection contract with synthetic or mocked inputs. |
| query CLI handles shared flag spellings and rejects invalid limits, cyclic artifacts and symlink escapes | 222–245 | 233, 236, 238, 241, 243 | tools/perf/query.mjs:17 summariseCpu/CLI | Checks stated saved-profile math/identity/CLI rejection contract with synthetic or mocked inputs. |

### profile-mcp.test.mjs

Fixture/setup: call (12–15) invokes MCP in APEX_MCP_MOCK mode; argvOf parses result, refused helper assertions 20–22 require structured refusal. Descriptive artifacts/profiles/vegas-spans.json path is a dry-run input, not a required fixture file.

Limit: Tool schemas, argv and refusal only; dryRun never captures profile or opens browser.

| Case name | Case lines | Assertion spans | Production target | Meaning / limit |
|---|---|---|---|---|
| apex_profile is a direct browser tool next to apex_profile_query; the job kind is still listed | 25–30 | 27, 29 | tools/mcp/apex-tools-mcp.mjs tool schemas/guarded dispatch → tools/perf/profile.mjs and tools/perf/query.mjs | Parses structured mock/dry-run results; rejection helper at 20–22 is part of assertion evidence. |
| apex_job_start kind profile dryRun: profile.mjs argv with mode, repeat and base | 32–36 | 34–35 | tools/mcp/apex-tools-mcp.mjs tool schemas/guarded dispatch → tools/perf/profile.mjs and tools/perf/query.mjs | Parses structured mock/dry-run results; rejection helper at 20–22 is part of assertion evidence. |
| profile job refuses a base that looks like a flag and an unknown mode | 38–41 | shared helper; see fixture notes | tools/mcp/apex-tools-mcp.mjs tool schemas/guarded dispatch → tools/perf/profile.mjs and tools/perf/query.mjs | Parses structured mock/dry-run results; rejection helper at 20–22 is part of assertion evidence. |
| apex_profile_query dryRun: query.mjs, artifacts-only path | 43–47 | 45 | tools/mcp/apex-tools-mcp.mjs tool schemas/guarded dispatch → tools/perf/profile.mjs and tools/perf/query.mjs | Parses structured mock/dry-run results; rejection helper at 20–22 is part of assertion evidence. |
| apex_profile dryRun: the same profile.mjs argv as the job kind; bad base and mode refused | 49–57 | 52–53 | tools/mcp/apex-tools-mcp.mjs tool schemas/guarded dispatch → tools/perf/profile.mjs and tools/perf/query.mjs | Parses structured mock/dry-run results; rejection helper at 20–22 is part of assertion evidence. |

### prop-clipping.test.mjs

Fixture/setup: Real clip-baseline JSON (153–155), cached clip-audit --all child (159–163), scoped manifest roster, stale-row policy injection. --lower copies baseline into scratch directory and deletes it in finally.

Limit: Detector severe-location ratchet, not zero intersections or visual acceptability. Soft pairs, emission adjacency and shape filters omit some overlaps; crowd-mound false positives documented at 40–50.

| Case name | Case lines | Assertion spans | Production target | Meaning / limit |
|---|---|---|---|---|
| prop interpenetration stays within the per-circuit baseline | 165–181 | 173, 180 | tools/track/clip-audit.cjs:129 analyse/CLI --lower + tools/track/clip-baseline.json + tools/lib/circuit-scope.cjs | Checks measured severe-location caps or lowering policy via real audit and scoped roster. |
| stale-row policy: strict locally, scoped to the diff on a PR, advisory on the train | 190–201 | 192–198, 200 | tools/lib/stale-rows.mjs:28 staleStrictIds | Checks measured severe-location caps or lowering policy via real audit and scoped roster. |
| clip-audit --lower ratchets one row down and is idempotent | 203–221 | 215–216, 219 | tools/track/clip-audit.cjs:129 analyse/CLI --lower + tools/track/clip-baseline.json + tools/lib/circuit-scope.cjs | Checks measured severe-location caps or lowering policy via real audit and scoped roster. |
| baseline has no stale entries — a cap below the measured count is a lie | 223–239 | 232, 238 | tools/track/clip-audit.cjs:129 analyse/CLI --lower + tools/track/clip-baseline.json + tools/lib/circuit-scope.cjs | Despite title wording, implementation rejects unknown measured IDs and caps ABOVE measurements where strict; growth is separate case. |

## Additional fixture evidence

`tests/unit/fixtures/process-dashboard/runs.json` was fully read at 1–100 and 101–146; SHA-256 `e3d5128dbda7f38b2a8014a109501aaf0edd17bd59093d6a169e83d4486d384b`. CI rows 7–119 contain one full 840-second run, cancelled same-SHA re-gate, and 360-second fast run; pages rows 120–145 contain success/cancel/failure/success with 840/60/120/600-second walls; flake rows 3–6 carry one red and one non-red event. These fixed values explain the reducer expectations; they are not current operational observations.

Scope completion: all 18 assigned files and all 222 top-level cases mapped. Embedded string-template tests are fixture programs, not extra top-level cases. Source review only: test outcomes remain unverified.
