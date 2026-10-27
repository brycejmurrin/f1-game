# Browser specs map — batch 15

Mapped all 160,000 assigned bytes across nine text parts with individually returned reads of at most 8,000 bytes. Whole-file manifest hashes match; evidence JSON separates whole-file, assigned-part and read-chunk hashes and records intersecting case/assertion spans. Static inspection only.

Track designer begins mid-assertion in its last case; UI redesign ends mid-assertion in its second case. Enclosing AST spans establish boundaries without claiming inspection beyond assigned bytes. Imports are support dependencies; boundary fleet/roster helpers were additionally read, and the shared fixture reset/teardown was inspected as an excerpt. No tests or browsers ran.

## tests/specs/track-designer.spec.js

Tail only: designer narrow-layout checks, save/reload of fjord theme and one snowpeak, raceAndBuild and no collected errors; prior setup is outside this assignment.

Assigned [62268,63162), partial file.

| Case lines | Contract | Direct assertion sites |
|---|---|---:|
| 885–960 (partial) | `designer workspace authors bridges, water and landscapes on ${size}` | 7 |

Support: fixtures.js.

## tests/specs/track-switch-memory.spec.js

TLX 960×540, ten alternating Monaco/Monza picker builds: exactly current track survives forced GC, at least 40 render objects, no nonpositive-used node cache states, and median post-second-visit growth ≤10 MiB over five visits. Finite sequence cannot prove absence of leaks.

Assigned [0,7523), whole file.

| Case lines | Contract | Direct assertion sites |
|---|---|---:|
| 62–113 | loading circuits one after another keeps one world in memory and does not grow | 7 |

Support: fixtures.js, mem-census.mjs, node:fs.

## tests/specs/track-switch-release.spec.js

TLX Monaco chunk arrays ≥262144 bytes must first exist, then all WeakRefs die after Monza presentation, settling and forced GC. Checks vertex-array release, not general memory bounds.

Assigned [0,2859), whole file.

| Case lines | Contract | Direct assertion sites |
|---|---|---:|
| 12–48 | a picked circuit's chunk vertex data is gone from the render objects after the next pick | 2 |

Support: fixtures.js, mem-census.mjs.

## tests/specs/tracks-walls-a.spec.js

First contiguous roster half, filtered by inScope: each circuit delegates boundary sampling and violation policy to shared helpers: built, finite, min boundary >1, max <60, optional pit boundary <24 and above min, and intrusion no deeper than 1.5 inside road. TRACK and APEX_CIRCUITS filter the sorted roster.

Assigned [0,1045), whole file.

| Case lines | Contract | Direct assertion sites |
|---|---|---:|
| 15–18 | `${id}: finite, sane driving boundary on both sides` | 1 |

Support: fixtures.js, tracks-walls-roster.js, tracks-walls-fleet.js.

## tests/specs/tracks-walls-b.spec.js

Second contiguous roster half, filtered by inScope: each circuit delegates boundary sampling and violation policy to shared helpers: built, finite, min boundary >1, max <60, optional pit boundary <24 and above min, and intrusion no deeper than 1.5 inside road. TRACK and APEX_CIRCUITS filter the sorted roster.

Assigned [0,1046), whole file.

| Case lines | Contract | Direct assertion sites |
|---|---|---:|
| 15–18 | `${id}: finite, sane driving boundary on both sides` | 1 |

Support: fixtures.js, tracks-walls-roster.js, tracks-walls-fleet.js.

## tests/specs/tracks-walls.spec.js

Live roster identity; street barriers within 3 of half-width; Montreal tight fraction >0.95; Monaco/Monza/Baku/Spa edge rams remain finite, lateral displacement <60, and recover inside road within 600 steps. Fresh pages isolate drift mutation.

Assigned [0,6540), whole file.

| Case lines | Contract | Direct assertion sites |
|---|---|---:|
| 38–43 | the swept circuit list matches what the game actually loads | 3 |
| 46–56 | `${id}: walled tight, as a street circuit` | 4 |
| 59–65 | full-lap visual barriers register collision boundaries across the wrap | 1 |
| 76–118 | `${circuitId}: driving hard into either edge stops bounded and recovers` | 4 |

Support: fixtures.js, tracks-walls-roster.js.

## tests/specs/ui-audit.spec.js

On-demand screenshot gallery with screen-readiness waits, not semantic or pixel assertions. Touch portrait/landscape broad screen catalogue; iPad/desktop five-screen subset. Landscape rotate case skips. API data mocked, some spinner waits deliberately swallowed.

Assigned [0,26776), whole file.

| Case lines | Contract | Direct assertion sites |
|---|---|---:|
| 70–74 | 01 main menu | 0 |
| 76–82 | 02 select screen | 0 |
| 84–96 | 03 customize my team | 0 |
| 98–106 | 04 car setup | 0 |
| 108–116 | 05 race settings | 0 |
| 118–124 | 06 how to play | 0 |
| 126–134 | 07 in-race HUD | 0 |
| 136–149 | 08 pause menu | 0 |
| 151–160 | 09 results screen | 0 |
| 162–170 | 10 f1 data hub | 0 |
| 172–178 | 11 time trial select | 0 |
| 180–198 | 12 in-race hood camera | 0 |
| 200–212 | 13 track detail modal | 0 |
| 214–231 | 14 advanced steering | 0 |
| 233–252 | 15 season standings panel | 0 |
| 254–261 | 16 standings | 0 |
| 263–270 | 17 wet weather HUD | 0 |
| 272–280 | 18 night race HUD | 0 |
| 282–297 | 19 cockpit camera | 0 |
| 299–308 | 20 TT results screen | 0 |
| 310–324 | 21 season results screen | 0 |
| 326–344 | 22 advanced steering expanded | 0 |
| 346–365 | 23 portrait rotate-device overlay | 0 |
| 347–347 | true | 0 |
| 367–375 | 24 data hub schedule tab | 0 |
| 377–386 | 25 data hub standings tab | 0 |
| 388–397 | 26 data hub results tab | 0 |
| 399–412 | 27 data hub live tab | 0 |
| 414–429 | 28 data hub telemetry tab | 0 |
| 434–440 | 29 career modes | 0 |
| 442–450 | 29b career setup | 0 |
| 452–459 | 29c career guide | 0 |
| 461–468 | 30 career hub | 0 |
| 470–481 | 31 qualifying sheet | 0 |
| 483–497 | 32 career offers | 0 |
| 532–536 | 01 main menu | 0 |
| 538–544 | 02 select screen | 0 |
| 546–552 | 06 how to play | 0 |
| 554–559 | 07 in-race HUD | 0 |
| 561–568 | 08 pause menu | 0 |

Support: fixtures.js, f1-api-mock.js, output-paths.js.

## tests/specs/ui-button-touch.spec.js

GLX touch and desktop behavior/geometry contracts: garage pans; camera long press; nested tuner pause lifecycle; pointer ownership/cancel; calibrated steering states; scroll containment; HUD editor visibility, focus, persistence, adaptive fitting and placement adoption; dock scheme isolation; help modes; appearance targets; emulated device identity. DPR 1 is geometry evidence, not native-phone raster/performance.

Assigned [0,92971), whole file.

| Case lines | Contract | Direct assertion sites |
|---|---|---:|
| 59–86 | vertical category buttons scroll both groups and still activate on a tap | 6 |
| 88–122 | the portrait category strip still scrolls horizontally over its buttons | 3 |
| 125–144 | CAM touch long-press keeps the picker open after normal capture release | 5 |
| 314–323 | Escape leaves tuner-owned photo mode and leaves the tuner open | 4 |
| 328–347 | fly-cam bar stays clear of the docked tuner panel with phone insets | 2 |
| 350–377 | Escape walks free cam -> tuner -> visual studio -> settings -> pause -> racing | 1 |
| 387–400 | Escape pauses a running race, and the menu survives the keyup | 1 |
| 402–410 | pause key leaves tuner-owned photo mode and restores race controls | 0 |
| 412–426 | gamepad pause leaves tuner-owned photo mode and restores race controls | 0 |
| 455–465 | a touch drag on the MOVE stick registers | 2 |
| 473–492 | a stick taken away mid-hold does not latch the camera on | 2 |
| 498–511 | #pc-restore brings the hidden photo UI back on a tap and on Space | 3 |
| 518–546 | a cancelled scene drag releases, and a foreign pointer cannot move it | 2 |
| 558–578 | `the LOOK stick clears the tuner panel at UI scale ${scale}` | 3 |
| 586–596 | calibrate button enabled in tilt mode | 2 |
| 602–614 | calibrate button disabled (still visible) in button mode | 2 |
| 620–630 | calibrate button disabled (still visible) in touch mode | 2 |
| 640–673 | buttons keep their positions when steer mode changes | 4 |
| 679–716 | opens the help sheet over the pause menu and BACK returns to it | 9 |
| 722–737 | throttle button visible in button mode | 1 |
| 743–764 | chips are compact inline and RACE! button is visible | 1 |
| 780–833 | the track strip owns an independent horizontal scroll area | 6 |
| 839–862 | the track strip contains horizontal scroll gestures | 3 |
| 868–886 | fits without scrolling in landscape | 1 |
| 1004–1045 | previews race readouts, owns keyboard focus and restores the title on exit | 18 |
| 1053–1055 | visibility stays consistent between the slider and on-screen editors on touch | 0 |
| 1057–1059 | adapts to short touch landscape sizes without ending the edit | 0 |
| 1064–1066 | visibility stays consistent between the slider and on-screen editors on desktop | 0 |
| 1068–1070 | adapts through narrow portrait and desktop sizes without losing selection | 0 |
| 1072–1093 | entry uses the populated toolbar size without a later position jump | 6 |
| 1096–1158 | drag moves a piece, − / + size it, RESET restores it, DONE gives the pause card back | 20 |
| 1160–1212 | HIDE removes a piece from the race, it stays a ghost while arranging, SHOW brings it back | 18 |
| 1214–1252 | keyboard radio moves one step and disabled readouts remain editable while paused | 7 |
| 1254–1328 | crowded optional previews remain editable after fitting at maximum sizes | 13 |
| 1330–1376 | a dragged radio card leaves auto-placement and stays where it was dropped; RESET hands it back | 6 |
| 1378–1404 | rotation exits Arrange and keeps restored Settings interactive above Pause | 6 |
| 1406–1428 | Escape ends arranging without driving the car | 2 |
| 1443–1504 | buttons offset persists across reload; tilt stays identity | 8 |
| 1506–1526 | RESET DOCK LAYOUT clears only the current scheme | 3 |
| 1533–1548 | HOW TO PLAY names every way to play | 5 |
| 1552–1589 | first keyboard move and resize keep an automatically cleared map at its painted origin | 15 |
| 1595–1606 | ADVANCED disclosure summary is at least --tap tall | 1 |
| 1614–1626 | preset tiles are three-up at 932x430, UI SIZE 150 | 2 |
| 1637–1651 | uses the requested CSS viewport, screen and input identity | 8 |

Support: fixtures.js, output-paths.js, ui-device-profile.mjs.

## tests/specs/ui-redesign.spec.js

Prefix only: initial portrait search and short-landscape selected-name visibility; main multi-surface case covers picker/garage up to stacked-garage assertions. Later settings/data/multiplayer assertions are outside assignment. Previous typography/home/camera defaults pinned; rendering headless.

Assigned [0,20346), partial file.

| Case lines | Contract | Direct assertion sites |
|---|---|---:|
| 29–70 | circuit picker initially exposes portrait search and short-landscape selected name | 7 |
| 72–729 (partial) | catalogue, garage, settings, data table, and compact multiplayer fit | 45 |

Support: fixtures.js, menu-readiness.mjs.

Production navigation: LSP places Tracks.build/free in the track engine and game lifecycle, HudLayout.get in HUD layout/arrange, DockLayout.apply in dock layout, and UiLayers.top in the layer manager. Dock apply was a module-file fallback and UiLayers a labelled untyped text match; neither establishes complete caller coverage.

Isolation and cleanup: standard fresh fixtures isolate storage, simulated gamepads, styles, headless mode and pointer state; shared boundary fixtures deliberately reuse race builds. The edge-ram cases use freshTest because drift is not reset by shared fixtures and explicitly clear input. Garage swipe CDP sessions detach in finally; memory probes enable HeapProfiler without explicit detach in these files. HUD drop-rule probing restores every changed DOM attribute in finally. Most editor tests exercise DONE/Escape/rotation restoration; remaining temporary state relies on page teardown. Captures and memory readings are artifacts, not visual correctness or player-device performance evidence.

Counts are static direct assertion sites, not expanded runtime tests. The HUD visibility/adaptive cases delegate to checkHudVisibilityEditors/checkAdaptiveHudEditor; pause-key/gamepad restoration delegates to expectNormalRaceControls. Their helper assertions and spans are recorded separately in the evidence JSON, so zero direct sites does not imply zero checks. Loop-based cases expand by viewport, scale, scheme or circuit. The portrait race-settings case title mentions compact chips, but its direct check only establishes the RACE button is visible. Dock reload replays an init-script seed, so it establishes boot restoration from seeded storage rather than a user edit surviving an unseeded reload.
