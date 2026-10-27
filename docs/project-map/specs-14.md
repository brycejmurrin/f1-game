# Browser specs batch 14

Static source map of all 160,000 assigned UTF-8 bytes. Half-open byte ranges and one-based inclusive lines are recorded in specs-14-evidence.json. No tests, browser, network or game runtime were run. Whole-file parsing supplies boundaries only; it does not extend raw-read coverage.

## time-trial.spec.js

Assigned bytes [28389, 38152); partial file.

Tail only: settings/help UI-size matrix continues inside an already-open case. Checks coach step cycling, unavailable practice/strategy explanations, review disclosure, keyboard/Back routes, help anchors and readable layout. Visible scale sweep is 40, 80, 100, 130, 150 and 200%; minimum target 23.5px, pane height >70px, overflow ≤1px and paragraph/pane ratio >0.5. Screenshots at 100/150/200%; zoom-measurements attachment in finally. Earlier setup/matrix declarations belong to batch 13.

| Case declaration lines | Intended contract | Coverage |
|---|---|---|
| 545–691 | settings, help and Back remain readable and reachable | Partial case; assigned intersection only; 49 expect sites |

## title-menu-rotation.spec.js

Assigned bytes [0, 19796); whole file.

Phone/tablet rotation and title Home fit: synthetic orientation/resize events, 1700ms settling, fake visualViewport late iOS settle, settings round trip and live/static Home. Reachability checks elementFromPoint at door centres; no stuck keyboard band (>1px), portrait tall/landscape wide, short landscape compact. Home fit uses eight cells including two 200% cells, 44px targets, row height spread ≤1px, ratio ≤1.5 and ≤1px overflow. Fake viewport getters last for the isolated page; no explicit restore.

| Case declaration lines | Intended contract | Coverage |
|---|---|---|
| 110–198 | portrait ↔ landscape keeps doors reachable and --kb clear | Complete declaration; 7 expect sites |
| 200–225 | settings open/close across a rotation leaves the title usable | Complete declaration; 3 expect sites |
| 232–312 | a mismatched mid-rotation --kb clears when sizes land after the events | Complete declaration; 5 expect sites |
| 374–399 | every door is a consistent tile, nothing clips or splits a word | Complete declaration; 9 expect sites |

## tlx-probes.spec.js

Assigned bytes [0, 43997); whole file.

TLX forced three/WebGL2 with 45s boot-step override, fixture BOOT_MS and test.slow. Measures backend install, opaque WebGL context, day/night passes, skid geometry, chunk culling/source-array release, opt-in 64px reflection cube, GPU-timer software gate, facade mesh builds, shared uniform buffers and decal ownership. Monza/Singapore are deterministic scenes. Presented-frame helper gates screenshots; PNG >5000 bytes is a nonblank heuristic, not visual correctness. Atomic wait snapshots avoid co-present races; polling 100ms with 60/90s or remaining-budget (≤300s) bounds. Some cases stop rendering after a presented frame. Decal loop frees each mesh twice, expects 40 disposals/no retained scene object, frees texture in finally. Timer disabled after reading; shared-uniform control navigates a second page. Software timer/PCSS results do not prove hardware quality.

| Case declaration lines | Intended contract | Coverage |
|---|---|---|
| 62–86 | boots with the TLX backend installed on the GLX object | Complete declaration; 5 expect sites |
| 88–105 | the shipped unset backend boots TLX when a GPU adapter exists | Complete declaration; 2 expect sites |
| 107–125 | the canvas is OPAQUE — the tag in alpha can never become opacity | Complete declaration; 2 expect sites |
| 127–142 | track renders a non-blank frame on TLX (M2 world geometry) | Complete declaration; 2 expect sites |
| 144–185 | M4 shadow subsystem arms on a day race (car map per-frame, lamp idle) | Complete declaration; 9 expect sites |
| 187–235 | M8 post chain resolves a day race (HDR target, bloom live) | Complete declaration; 8 expect sites |
| 237–275 | M8 godray path arms on a night race (lamp snapshot consumed) | Complete declaration; 4 expect sites |
| 277–299 | M5 sky arms on a race frame and honours the night gate | Complete declaration; 4 expect sites |
| 301–353 | M6 FX paths record on a night race (glow halos, blob shadows, decals) | Complete declaration; 7 expect sites |
| 355–455 | M6 skid batch records after a hard driven stint | Complete declaration; 5 expect sites |
| 457–484 | M7 chunked path culls and frees the source arrays on a street circuit | Complete declaration; 6 expect sites |
| 486–556 | M9 env probe captures a full cube on a parked race (car reflections live) | Complete declaration; 6 expect sites |
| 558–581 | M9 gpuTimer is contract-legal on WebGL2 (off on software GL, live on real GL) | Complete declaration; 5 expect sites |
| 583–601 | M4 shadow-state hooks report through the TLX surface (car + lamp) | Complete declaration; 4 expect sites |
| 603–634 | M10 track builds its meshes through the injected TLX backend (façade wiring) | Complete declaration; 7 expect sites |
| 636–682 | the lit frame block is ONE shared uniform buffer per program, not one per draw | Complete declaration; 6 expect sites |
| 684–694 | menu is reachable and canvas is sized (no-track begin/present path) | Complete declaration; 3 expect sites |
| 699–724 | freeing batched decal meshes removes their hidden scene objects | Complete declaration; 2 expect sites |

## touch-buttons.spec.js

Assigned bytes [0, 9507); whole file.

Nine declarations: arrow ramp/release, two-finger GAS capture-steal survival, adaptive speed reduction and analog slide, OFF compatibility, slider persistence/label and ordered OFF>MID>FULL. Uses synthetic PointerEvents and public Input values. Four pump reads with 120ms gaps; final comparison uses eleven fixed 20ms steer steps. Slider is driven through real input events. Shared touch helper resets each test.

| Case declaration lines | Intended contract | Coverage |
|---|---|---|
| 18–27 | holding an arrow builds toward lock over time | Complete declaration; 3 expect sites |
| 29–36 | releasing returns to centre | Complete declaration; 2 expect sites |
| 43–79 | holding GAS survives tapping a turn arrow | Complete declaration; 6 expect sites |
| 91–102 | at rest, adaptive still reaches lock at the old rate | Complete declaration; 1 expect sites |
| 104–130 | at speed a tap is a correction, not an instant yank | Complete declaration; 3 expect sites |
| 132–145 | sliding opposite the steer direction eases like an analog trigger | Complete declaration; 3 expect sites |
| 147–156 | adaptive off ignores analog travel — a tap still aims at full lock | Complete declaration; 1 expect sites |
| 158–175 | the Advanced slider persists and the label tracks it | Complete declaration; 5 expect sites |
| 177–200 | a mid slider is slower than off and faster than full, at the same speed | Complete declaration; 3 expect sites |

## touch-pedals.spec.js

Assigned bytes [0, 7023); whole file.

Seven declarations: brake full/partial/dead-zone/release, throttle modulation and keyboard priority, then mode switches through pause menu while a race runs. Important limit: the case named throttle travel survives to physics asserts Input.throttleLevel only; it does not measure car acceleration. Auto-throttle is inferred from mode === touch and compared with GAS visibility; sampled speed is unused. Anti-vacuity requires >1 mode, not every mode. Shared helper isolates input reset.

| Case declaration lines | Intended contract | Coverage |
|---|---|---|
| 27–33 | a plain press is still full travel | Complete declaration; 2 expect sites |
| 35–45 | sliding up the screen eases the pedal off | Complete declaration; 4 expect sites |
| 47–51 | a small tremor does not modulate the pedal | Complete declaration; 1 expect sites |
| 53–63 | throttle travel survives to the physics | Complete declaration; 3 expect sites |
| 65–70 | releasing clears travel | Complete declaration; 2 expect sites |
| 72–79 | a keyboard press outranks a part-open pedal | Complete declaration; 1 expect sites |
| 97–134 | auto-throttle and the GAS button can never disagree, across mode switches | Complete declaration; 2 expect sites |

## touch-steer.spec.js

Assigned bytes [0, 7646); whole file.

Nine declarations: anchored proportional drag, translation invariance, left sign, clamp, release ramp, most recently moved finger, non-touch ignoring drags and mid-drag mode reset. Raw changedTouches dispatch targets game canvas; no race needed. Input.ready prevents pre-init listener races; 844×390 touch viewport. Release asserts ~0.2 after one clamped tick then zero after pump. These synthetic events prove listener/public-input behavior, not physical-device gesture delivery.

| Case declaration lines | Intended contract | Coverage |
|---|---|---|
| 34–40 | a tap steers nothing — it only sets the anchor | Complete declaration; 1 expect sites |
| 42–55 | steering is proportional to how far the finger has travelled | Complete declaration; 3 expect sites |
| 57–71 | the drag is relative, so the same gesture works anywhere on the glass | Complete declaration; 1 expect sites |
| 73–77 | dragging left steers left | Complete declaration; 1 expect sites |
| 79–83 | full lock is reachable and clamped | Complete declaration; 1 expect sites |
| 85–99 | lifting off ramps back to centre instead of snapping | Complete declaration; 3 expect sites |
| 101–111 | the most recently MOVED finger steers, not the most recently placed | Complete declaration; 1 expect sites |
| 113–120 | tilt and button modes ignore canvas drags entirely | Complete declaration; 1 expect sites |
| 122–130 | switching mode mid-drag cannot leave lock latched | Complete declaration; 2 expect sites |

## track-designer.spec.js

Assigned bytes [0, 62268); partial file.

Designer lazy title door, named modal/tabs, responsive map/profile/sidebar, draft/save identity and recovery, atomic reviewed collection import, seed determinism/lattice/undo/stamps, picker/race integration, themes/props persistence, share links/export/edit chip, freehand point floor, corner replacement, elevation range gestures, repair preview/apply, generated candidate cards and TEST HERE/quit return. Responsive matrix has fourteen touch cells and seven workspace cells; draft reload two widths; final bridge/water/terrain case two sizes. bootClean wipes custom storage once per page session to preserve reload evidence; seeded randomise waits pending=false and ok; headless mode keeps state checks cheap. Downloads and screenshots are artifacts; clipboard is blocked to exercise focused share-code fallback. Ending range cuts the final desktop/phone case before its last assertions; batch 15 owns the remainder.

| Case declaration lines | Intended contract | Coverage |
|---|---|---|
| 26–85 | short and scaled phones keep both views and every workspace reachable at ${width}x${height}@${scale} | Complete declaration; 9 expect sites |
| 86–106 | touch scrolling keeps the map, profile and scenery sections reachable | Complete declaration; 3 expect sites |
| 110–205 | workspace organization preserves controls and scroll across modes and library at ${viewport.width}x${viewport.height}@${viewport.scale} | Complete declaration; 28 expect sites |
| 240–271 | draft recovery and saved identity survive reload at ${viewport.width}px | Complete declaration; 6 expect sites |
| 274–300 | library collection file imports atomically and preserves the open draft | Complete declaration; 9 expect sites |
| 302–367 | the title door opens the designer; a randomised design validates green and saves into MY CIRCUITS | Complete declaration; 28 expect sites |
| 369–400 | RACE from the designer lands on the picker with the custom circuit chosen; it builds and the field drives it | Complete declaration; 10 expect sites |
| 402–424 | a new theme with a scenery option: WINTER SNOW · NIGHT · PACKED saves, lists as a night circuit and builds | Complete declaration; 6 expect sites |
| 426–537 | scenery props palette: place / remove / save / reload keeps authored props | Complete declaration; 32 expect sites |
| 539–562 | a saved circuit survives a reload: the registry re-appends it and the stored id resolves | Complete declaration; 6 expect sites |
| 564–607 | a share link boots straight into the designer with the design, strips its fragment, and the picker's EDIT chip reopens a saved circuit | Complete declaration; 11 expect sites |
| 609–636 | a freehand stroke becomes a closed loop and DELETE respects the point floor | Complete declaration; 6 expect sites |
| 638–663 | TURNS row selects a span and REPLACE re-stamps it green | Complete declaration; 11 expect sites |
| 665–769 | HILLY preset writes node heights; the preview's py rises | Complete declaration; 32 expect sites |
| 771–806 | FIX ALL turns a deliberately short loop green and SAVE enables | Complete declaration; 13 expect sites |
| 808–835 | TECHNICAL shows 4 cards; USE is green | Complete declaration; 6 expect sites |
| 837–882 | TEST HERE drives from the selected point and returns | Complete declaration; 10 expect sites |
| 885–960 | designer workspace authors bridges, water and landscapes on ${size} | Partial case; assigned intersection only; 17 expect sites |

## Production navigation and limits

Input.steer resolves to input.js:1813 and a game.js:5693 updateCarLateral use. TrackDesigner.save resolves to designer.js:794 with race, SAVE button and testHere uses; LSP labels this module fallback, so export/caller coverage is unverified. CustomTracks.exportCollection similarly resolves to custom-tracks.js:410 with fallback coverage limits. SheetShape.reclassify is a labelled text match in sheet-shape.js:468 and screen-looks.js:325–326. GLX.freeMesh is invisible on the checker facade; symbol discovery finds the TLX method in tlx.js:5031 plus alternate backends, so no complete callers claim is made.

Support: fixtures.js imports provide test/expect, loadTrack and boot/build waits; presented-canvas.js provides frame/screenshot gates (implementations not reread here). touch-input.js was read in full: it sets touch viewport and per-test ready/reset hooks; pump performs four reads with 120ms gaps. No explicit shared afterEach is declared by these specs; page fixture lifetime isolates synthetic state and storage overrides. Console/page-error checks and diagnostic attachments are selective, not a comprehensive error scrape for every case.
