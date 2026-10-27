# Unit group 24 — complete source map

Read-only mapping of all 13 planned files (4,685 lines). No test suite, browser, or game was run; no pass/fail claim follows. Sources were read to EOF in pages of at most 150 lines. A globally truncated early batch was reread in bounded returns. Line numbers and SHA-256 values below describe this working-tree snapshot.

## Evidence and limits

Case rows enumerate every syntactic `test(...)` registration, its complete call range, and exact assertion-call line spans (coalesced only when overlapping/adjacent). Assertions inside fixture callbacks are included when lexically inside the registration. Shared helper assertions and module-level guards are separately noted. Parameterized registrations expand at runtime: INPUTS background=false/true and three hidden-HUD modes in readouts. No predicates are reproduced.

B = VM/fake DOM/canvas behavior: validates supplied state and stubs, not browser CSS layout, GPU pixels, screen-reader output, real timing, physics, or performance on hardware. S = source contract: regex/string shape or hand-extracted function, vulnerable to equivalent rewrites and untested branches. G = synthetic geometry: validates collision classification on supplied rectangles, not rendered placement. A mixed row carries both limits. Source absence checks only exclude the named textual forms.

LSP navigation used the checkout fallback `bash tools/mcp/lsp-mcp.sh`: outlines for HudInputs, HudLayout, HudReadouts, HudRelative, HudStrategy and GameHud; definitions for HudLayout.hiddenReason and HudReadouts.spdDigits. The hiddenReason lookup explicitly reported module-file fallback and unverified export/caller coverage. The zero-export IIFE outlines for Inputs/Relative/Strategy therefore supply locations rather than a claim that public callers were resolved. Function bounds below were independently extracted from current source syntax.

Historical artifact paths, branch names, issue numbers, and approximate old source line numbers in comments/TODO strings are descriptive context, not current reference links. In particular the two hud-pins TODO tests remain TODO declarations; their assertions are mapped, not established failures or fixed behavior.

## Source inventory

| Fully read test source | Range | SHA-256 | Registrations |
|---|---|---|---|
| tests/unit/hud-inputs.test.mjs | 1–356 | 9a6a44e44703e57d93564b0e0d497c9f347225da9bd57ddc0e0d8fa82c4b0d92 | 17 |
| tests/unit/hud-layout-hidden.test.mjs | 1–152 | ac5d8a0b057c61ad4d29d2597fe5da9ec43bcc8d89b4ed1c87e16e48dce255f7 | 3 |
| tests/unit/hud-layout.test.mjs | 1–1635 | 635ffd302c4c3ec69e0bdd8570f8fdc72338ccc1216e40ae533f340a7617cb64 | 63 |
| tests/unit/hud-metrics-layout.test.mjs | 1–294 | ed08483f48ad51781d544fc8e4fb6f0ec0cb1081a6d3efae8455d53d7cfad1a2 | 11 |
| tests/unit/hud-minimap-pitmark.test.mjs | 1–80 | 928945072b243739bba4e29e0c48c617ff5fb2af8d884604abea7f2f4d534d4b | 3 |
| tests/unit/hud-pins.test.mjs | 1–290 | 51d543cf40c870f0bce510630b9e09205a064aea010b70ad83796898b63e5726 | 7 |
| tests/unit/hud-portrait-cluster.test.mjs | 1–94 | 37125525073cbda0747b8fa89533895f8ffff38be0d79987b76641d09bdf8d81 | 6 |
| tests/unit/hud-radio-slot.test.mjs | 1–168 | 754e85f54551952cc03fb5efed36a34e30a0c89c2d90c47da266fa53de390f71 | 2 |
| tests/unit/hud-readouts.test.mjs | 1–698 | 03aa042ffa43b8baa31639d223260a6f4527c2a336baadd770c48e6a40e2aa5d | 37 |
| tests/unit/hud-relative.test.mjs | 1–496 | 009b41bd525f2660c14b462fe1ac24ee244512a58583049c5a6640ff8c229fb7 | 18 |
| tests/unit/hud-speed-parity.test.mjs | 1–120 | 7ded879b283f8d44ec2062c057ebf623fce7efadf51b7590e99d33448bd8cc46 | 5 |
| tests/unit/hud-status-stack.test.mjs | 1–109 | 21b6d0bad5d57d31719624ae978629690a5d4bd134a39429f8bdc9ea2e173356 | 3 |
| tests/unit/hud-strategy.test.mjs | 1–193 | 62f0c6136a856a2f0d18c22b563a39c4f1c2c0a050852bb7545498bfb0046ca4 | 9 |

## Production and fixture inventory

These are current dependencies and contract targets, not a claim of full-file production review. Full source hashes fix the target version.

| Source | Range | SHA-256 | Role |
|---|---|---|---|
| js/ui/hud-inputs.js | 1–259 | e88b9a658220096da7d8fdab48ea58d9a61fd5a9f6779df9e7888db8ee3fff61 | trace buffer, sample/paint split, detached pause review |
| js/ui/hud-layout.js | 1–1355 | 512a4ce001b63fcad4003139cb36aa041fe36be45c5c8cdb1d9248e4aa514895 | schema v4 ownership, camera/style layouts, manual geometry, clearance and editor |
| js/ui/hud-readouts.js | 1–308 | 4a47a3a0d4ea19791fd29f6199d25302f623e95d92d6af3eee4643b805cef8c0 | gap/energy/speed/flags, lap reference and speech |
| js/ui/hud-relative.js | 1–339 | 342ccab8160df88da89c637ebd9f1a45e103e87f3a98606fc2e9a7f0808d86b6 | road neighbors, signed gap rows, phone fit caching |
| js/ui/hud-strategy.js | 1–201 | c8b31a62d69464fb8f701b4b5c1c5d5fd7b6ae1b59f155b83a615c88c9f8c73b | wear race strategy, undercut/cover, shared reads |
| js/ui/hud.js | 1–2541 | 34025c6524ab09293553ea05907cc0e3b063a1d31b00a17e2f6707960477355f | GameHud orchestration, fitting, instrumentation, hidden sampling and speech |
| js/ui/hud-minimap.js | 1–287 | 859d014f80f3bd14aa1df12aacce88597c9aa0919ae08d6752fbcfb8f76c70ea | visibility guard, cached pit glyph and ghost dots |
| js/ui/live-region.js | 1–110 | fa7f33bb32dd5969c997e473068141ebac23a13dc1b91d46e0b523f33952d6cc | prioritized single-writer announcement queue |
| js/camera/cam-groups.js | 1–44 | 9b66600b78e8e3fadda1b872fb7c6e301607c648be85e2865169e4bdf0945424 | shared onboard/cockpit/helmet tables |
| js/camera/mode-switch.js | 1–305 | 042ce57bb945fc87fed40198717e1db9b5dd44565025f8aab4407bed4accf920 | wheel LCD and camera markers |
| js/ui/hud-elements.js | 1–273 | dd6fae0a8af4336f2763017995dd5494f302c7a65e0aac601c23395023f81e1e | opt-in element list and preference visibility |
| js/ui/setting-row.js | 1–233 | 0288cc4db3293c9bc61c73d1ebd61f2a1a782520bb2c570c8806ac013366acde | native settings row build/wire/paint |
| js/ui/appearance-studio.js | 1–355 | 963eeea6a39ddce588596f98c20e4b8fd9b56db86cc9f621a45cbb9edefee418 | HUD layout jump target |
| js/ui/settings-export.js | 1–1348 | f88dcf1dfe421bd91f8777328723045a6c7336a375e81cb372a2137bccf8ebf3 | FULL default contract |
| js/game.js | 1–9554 | 20990458b493b2cdf6633be6df1eae91c6b820068be48522788d09467130334d | setting defaults, facade and speech wiring |
| js/car/car-draw.js | 1–2174 | e6f5ad077eb89dd69f6b24bc1cab6fe3b87a2e8f43867d9d11108d8cf41765e6 | wheel LCD, retro and classic dash paths |
| js/car/car-mesh.js | 1–2105 | c13a3031510b4f20ac8c658c300a2e8bcee98f0599c658c5fd59d80deae28003 | retro number format |
| js/race/overtake-mode.js | 1–155 | 69e498cd080c996b49caef0ddd9d17b96f378566d7734b2f1db6c678a67a8019 | harness dependency for HUD state |
| js/race/announce-banner.js | 1–184 | 8ac250c9f99150e7acad993e88a5a2937b8070895cf677ace50d1f22568809eb | radio single writer |
| js/ui/select-screen.js | 1–1540 | ebefdf18b0a6f804f902f4d3737f02cf3bb7414d21d27efa419b91256b14c1ac | save warning single writer |
| css/hud.css | 1–2526 | ae4d6a5649088bc03a468e0d0686bc0a333f613440ffd78edb351ab41e1f75b1 | HUD positioning, visibility, readout and radio contracts |
| css/tokens.css | 1–1361 | baba959f43def9a6140099f4554f763dcf5566df1182bb9a8afd12dbceba007a | fake computed-style defaults |
| css/track-detail.css | 1–232 | b39afb0b28ca00df1989f02382adc867a072cbeef440038d47ef204088387c90 | cockpit and helmet hide rules |
| css/watch-transport.css | 1–100 | 345bd16fff70982c7efe1955fa74c71cbf46fe804ab298dfcdbe464f31f7600a | replay hides driving HUD |
| css/components.css | 1–720 | 4ee6791677c6309cb555eec91252f08769541be22184ecf9ea4d8f203255bebf | pause submenu stylesheet entry |
| index.html | 1–3970 | 198787c00ff4055628ee7c524dff5453c5bc90ee6724948304d4f41d32499348 | static accessible markup |
| tools/manifest.cjs | 1–1691 | bc6440de131fd98aa6f8eb7df5a6ba09b9796d256b01379869e37389f31abbeb | CamGroups load order |
| tools/lib/hud-geometry.mjs | 1–148 | c98a90747e10fdfc6411546b1670a21e1a343242615ab63a6fc01be4175cc108 | synthetic overlap analysis |
| tests/specs/hud-layout.spec.js | 1–1832 | 164340a787ddb27d75ea0224f9a493c3deb80a2b1bb81d4ae74d3a3609ab7975 | extracted race/readiness helper and gap seed contract |
| tests/helpers/mini-dom.mjs | 1–186 | 3406f017e765ad4cfef78493aafa8da95846a0e1cb9d28b28a53abd2b296e5c1 | shared DOM/event/style approximation |
| tests/helpers/abs-src.mjs | 1–8 | f33a40d278e2ec7ab00571e2020304a9c21b300861bba501c799947560e32d47 | coverage filename attribution only |
| tests/helpers/css-source.mjs | 1–2 | 434b8bcb5a8b1b7ff7e3d52b292f8d0a1726db49dbc655b85538bcb005df571a | stylesheet-source resolution |
| tests/helpers/game-source.mjs | 1–84 | 2128e7f89b961235d0521d5d516cf57867296e3f1f841abe1c5cc8d9c283b044 | game facade/symbol source resolution |

## Production symbol spans

The following catalog is shared by target labels in the case tables. The larger GameHud.create closure is split into relevant functions; the fitPass algorithm extends beyond a single bounded read and was mapped by its current syntax span and source contracts.

- js/ui/hud.js: motionReduced 12–13; vpSync 41–41; create 47–2532; hText 67–67; hStyle 68–69; hUnstyle 70–70; hClass 71–71; hToggle 72–72; hAttr 73–73; hHidden 76–76; hData 77–81; replayGhost 82–82; resolveMetricsLayout 137–141; resolveHudVis 143–148; syncHudVisClasses 152–172; syncHudLayoutClasses 173–184; syncHudCamClasses 185–203; flashSector 207–214; sessionOf 217–219; paintHudDelta 221–264; signedFixed 266–269; buildSecRows 270–292; gapDecimals 348–353; gapSec 354–360; gapForm 361–396; gapText 402–406; gapsEmptySync 418–422; fitWatch 454–465; fitBoxesSettled 466–466; hlKey 481–481; syncComputedRootVars 503–518; pickDocks 523–523; layoutRect 539–563; invalidateLaneRects 614–619; laneRect 620–628; laneSafeInsets 629–640; announceLane 644–698; announceLaneLayoutKey 701–722; announceLaneTick 723–734; radioTopSlot 735–782; radioUnderRight 789–807; radioPaintedCollapse 811–850; radioPaintedKey 856–862; radioPaintedCollapseTick 863–868; mirrorClear 881–887; _hudRectsHit 890–894; _boostOnRightHalf 895–902; towerGapsPaintedClash 905–922; gapPaintedDrop 924–931; phonePaintedClash 933–959; phoneFitStampSync 961–1037; fitHud 1038–1147; fitPass 1150–1908; speedUnitEl 1921–1925; paintInstruments 1926–1950; syncAlong 1957–1960; hudPaintHidden 1964–1967; speakHud 1969–1992; updateHud 1994–2439; sayFlag 2451–2456; invalidateMap 2459–2459; resetRace 2465–2483; invalidateFit 2495–2507; syncPhoneFit 2518–2524.
- js/ui/hud-minimap.js: create 11–284; drawMinimap 23–236; mmRun 240–247; mmPitMark 252–277.
- js/ui/live-region.js: enqueue 36–51; write 52–64; pump 65–75; say 80–95; reset 98–101; state 104–106.
- js/ui/hud-layout.js: normEl 190–193; migrate 216–221; effective 225–229; all 231–234; profile 254–259; get 267–269; scaleOf 271–271; originOf 276–282; releaseAutomatic 287–295; ownBottom 300–314; apply 316–369; screenBounds 376–384; clampAxis 385–390; fit 401–473; packPhoneRects 509–598; clearPackMarks 599–616; packPhone 617–622; packPhonePrimary 623–684; clearControls 703–752; resetClearance 757–768; clearReadouts 770–889; revealMirror 911–928; mirrorMode 930–937; resetEl 959–965; resetSet 966–970; presetLayout 973–984; applyPreset 986–996; presetOf 998–1006; isShipped 1009–1013; setCam 1016–1022; visibilityIds 1098–1100; visibility 1103–1115; setVisibility 1116–1129; drawn 1131–1139; hiddenReason 1144–1159; build 1175–1336; paintVisibility 1222–1226; paintHidden 1295–1305.
- js/ui/hud-inputs.js: createTrace 36–49; reduced 68–68; bind 71–77; measure 79–90; draw 93–128; line 129–138; snapshot 142–150; paintReview 151–175; mountReview 176–190; flushReviewReset 192–196; reset 200–208; frame 211–248.
- js/ui/hud-strategy.js: fmtLaps 40–44; fmtLoss 46–48; fmtNext 50–54; fmtWindow 56–63; tyresShort 65–69; undercut 71–76; behindThreat 78–90; build 100–119; tick 124–198.
- js/ui/hud-relative.js: relDist 30–37; lapsApart 40–44; select 59–81; fmtGap 90–94; build 104–119; tick 131–182; geoKey 186–198; fitKey 203–218; fitRows 235–238; fitRowsNow 239–326; rowLabel 328–334; refit 337–337.
- js/ui/hud-readouts.js: lapsApart 17–20; lapGapText 24–27; gapDecimals 39–45; fmtGapSec 47–51; fmtGap 53–59; ersState 64–68; energy 71–77; bbText 80–84; spdUnits 94–99; spdUnit 101–103; spdDigits 110–122; spdPlate 131–135; blueFlag 142–156; lapTrace 164–206; reset 167–167; sample 169–193; timeAt 195–204; speaker 216–253; reset 219–219; push 220–223; tick 225–251; cbCuesOn 255–257; sectorTimingKind 260–265; flagCueKind 268–276; paintSectorRow 278–288; paintFlag 291–301.

## Cases

### tests/unit/hud-inputs.test.mjs

Fixture/harness spans: load 17–23; fakeDom 80–94. All use the inventory dependencies above. 

| Case call range | Assertion spans | Production target | Meaning pinned by assertions | Limits |
|---|---|---|---|---|
| 25–39 | 29–31, 33–36, 38 | HudInputs createTrace/frame/reset/coordinate mapping | ring buffer: oldest-first reads, wraps at capacity, clear | B |
| 41–61 | 53, 55, 58, 60 | HudInputs createTrace/frame/reset/coordinate mapping | paused preference changes clear input history before another HUD frame | B |
| 63–67 | 65–66 | HudInputs createTrace/frame/reset/coordinate mapping | the window is ~3 s at a fixed step | B |
| 69–78 | 71–77 | HudInputs createTrace/frame/reset/coordinate mapping | levelY / steerY map into the box and clamp | B |
| 96–121 | 103, 110–117, 120 | HudInputs createTrace/frame/reset/coordinate mapping | frame: off hides; on samples at a fixed step at any fps, sizes for DPR, reads only | B |
| 123–131 | 129–130 | HudInputs createTrace/frame/reset/coordinate mapping | reduced motion draws still bars, not a scrolling trace | B |
| 133–152 | 140–141, 143, 145–146, 148–151 | shell + HUD CSS + GameHud wiring | shell + sheet + toggles: the opt-in readouts are wired without class tokens | S |
| 158–173 | 161, 163–165, 168, 171–172 | shell + HUD CSS + GameHud wiring | touch INPUTS home clears PAUSE/CAM like #hud-limits (not through the sector strip) | B |
| 176–192 | 184–185, 187, 189–191 | HudInputs createTrace/frame/reset/coordinate mapping | input history starts fresh after every suppressed mode, off, player change and session reset | B |
| 194–216 | 200, 202, 206–208, 210–211, 213, 215 | HudInputs frame/review/snapshot/reset | pause review mounts empty, snapshots bounded detached data, and never samples or writes driving | B |
| 219–237 | 231, 234, 236 | HudInputs frame/review/snapshot/reset | disabled and suppressed cleared history does not repaint review or rewrite visibility each frame | B |
| 240–255 | 250–254 | HudInputs frame/review/snapshot/reset | review draws in visible CSS pixels with readable text and bounded DPR, repainting only while open | B |
| 258–269 | 266–268 | HudInputs frame/review/snapshot/reset | review T B S legend occupies separated rows even when all channels coincide | B |
| 271–289 | 285–288 | HudInputs frame/review/snapshot/reset | live HUD T B S legend stays on separated rows when pedals and steer coincide | B |
| 291–311 | 300–304, 307–310 | HudInputs createTrace/frame/reset/coordinate mapping | hidden paint keeps fixed-step input samples without canvas/DOM work and redraws on show | B |
| 313–323 | 319, 321–322 | HudInputs createTrace/frame/reset/coordinate mapping | hidden caller's live mode state overrides stale camera classes without changing trace policy | B |
| 325–356 | 341, 347–348, 352–354 | HudInputs frame/review/snapshot/reset | HUD-hidden resets clear the independent review (background=${background}) | B |
### tests/unit/hud-layout-hidden.test.mjs

Fixture/harness spans: fakeEl 18–27; loadHidden 29–57; foldEditor 59–99. All use the inventory dependencies above. Shared choose assertion at 94 validates selected control existence. 

| Case call range | Assertion spans | Production target | Meaning pinned by assertions | Limits |
|---|---|---|---|---|
| 101–110 | 105–106, 108–109 | HudLayout.hiddenReason/build.paintHidden; HudElements/SettingRow | menus: store MINIMAL hard-hides chips without body.hud-prof-minimal (#3273) | B |
| 112–124 | 120–121, 123 | HudLayout.hiddenReason/build.paintHidden; HudElements/SettingRow | menus: store COMPACT hard-hides tyre/sectors/chips without hud-met-compact (#3273) | B |
| 126–152 | 132–135, 137, 140–141, 147–151 | HudLayout.hiddenReason/build.paintHidden; HudElements/SettingRow | MOVE & SIZE fold disables numeric fields when the selected chip is preset-hidden | B |
### tests/unit/hud-layout.test.mjs

Fixture/harness spans: fakeEl 92–101; load 103–120; deskRect 373–391; load3 741–793; clsHas 1024–1024; visibilityEditor 1396–1426. All use the inventory dependencies above. Shared visibilityEditor.choose assertion at 1423 validates controls. 

| Case call range | Assertion spans | Production target | Meaning pinned by assertions | Limits |
|---|---|---|---|---|
| 19–50 | 22, 35–38, 44, 49 | hud-layout browser helper; GameHud.fitHud | HUD browser helper atomically holds producers, selects camera and refreshes the controlled HUD | B+S |
| 52–90 | 55–58, 60, 62, 69, 75–80, 87–89 | hud-layout browser helper; GameHud.fitHud | broadcast layout probe waits for paint, camera and published tower height, not collision results | B+S |
| 122–127 | 124–126 | HudLayout.isShipped | untouched: nothing stored, no element carries data-hl | B |
| 129–140 | 132–133, 135–139 | HudLayout.set | set writes only moved elements and paints --hl-* on that element | B |
| 142–149 | 144, 146–148 | HudLayout.set/resetEl | unbounded values survive; explicit reset clears the element and the store | B |
| 151–164 | 153–157, 159, 161–163 | HudLayout.camSet/setCam/isShipped | cockpit and other cameras keep separate layouts; setCam swaps them | B |
| 166–170 | 168–169 | HudLayout.isShipped/scaleOf | junk in the store reads as shipped | B |
| 172–178 | 174–177 | css/hud.css / track-detail.css | css/hud.css reads the tokens through one data-hl rule, compensated for band zoom | S |
| 185–191 | 188, 190 | css/hud.css / track-detail.css | no HUD position, size or MOVE & SIZE offset is measured in the large viewport (vh) | S |
| 196–210 | 200–203, 205–209 | css/hud.css / track-detail.css | phone portrait parks the minimap under the timing tower; other shapes keep the corner | B |
| 214–222 | 217–219, 221 | hud-layout browser helper; GameHud.fitHud | COMPACT metrics layout seeds a gap line before asserting .hud-gaps survives | S |
| 227–243 | 229–230, 233–234, 236–238, 240–242 | HudLayout.isShipped/get/setCam | cockpit ships a default strip beside the wheel; other ships zero | B |
| 245–262 | 248–249, 251, 253, 255–256, 258–259, 261 | HudLayout.set/get/isShipped/resetEl/resetSet | stored offsets override the cockpit default; reset returns to the default, not zero | B |
| 264–275 | 268, 272–273 | HudLayout.set | every element retains unbounded fractional values in every camera and style | B |
| 277–291 | 282, 284, 286–287, 289–290 | HudLayout.set/resetEl | invalid numeric edits retain prior values and explicit defaults remain owned until reset | B |
| 293–310 | 299–302, 306–309 | HudLayout.get/set | invalid first edits leave automatic ownership intact while valid defaults and mixed edits claim it | B |
| 312–326 | 317–318, 320–322, 324 | HudLayout.isShipped/get/set/resetEl | old layout formats are ignored and fresh edits/reset use the current schema | B |
| 328–341 | 334–336, 338, 340 | HudLayout.migrate/get/set | current layout imports and round trips contain plain position and size values only | B |
| 343–356 | 345, 347, 349–355 | HudLayout.presetLayout | presets are pure data laid over the set's shipped layout | B |
| 394–416 | 408, 411 | HudLayout.presetLayout | CLEAN, BIG and CORNERS clear the desktop row at 1280 and 1920 (hud-survey Y2 / Y3) | B |
| 418–432 | 423, 425–427, 430–431 | css/hud.css / track-detail.css | css/hud.css .hud-label keeps a 10 CSS-px painted floor under --hud-z | S |
| 434–456 | 436–442, 444, 446–448, 452–453, 455 | HudLayout.presetOf/applyPreset/get/set/isShipped | apply a preset to the edited set, tweak it, CUSTOM detection | B |
| 458–474 | 461–463, 466–467, 469–470, 472–473 | HudLayout.presetLayout/get/applyPreset | CORNERS on a touch cockpit does not pull ENERGY or TYRES onto the steer column | B |
| 476–482 | 478–481 | css/hud.css / track-detail.css | css/track-detail.css: cockpit hides only speed/gear, not the OT/AERO/ENERGY strip | B |
| 484–493 | 486, 488, 492 | css/hud.css / track-detail.css | touch cockpit: TYRES joins the strip's hide in the CSS and in hiddenReason (hud-survey Y1) | B |
| 495–512 | 499, 504, 506, 508, 510–511 | HudLayout.setCam/hiddenReason | touch cockpit with a wheel that has no screen (CLASSIC / NONE): the strip still hides; the gearbox does not | B+S |
| 514–530 | 525, 527, 529 | HudLayout.setCam | apply() paints body[data-hl-set] with the camera set on screen | B |
| 532–534 | 533 | HudLayout.apply/fit/clearReadouts | module has no Tracks / curvature reads | S |
| 536–558 | 556–557 | HudLayout.fit/get | fit retains a moved piece beyond the screen at its stored offset | B |
| 560–586 | 582–584 | HudLayout.apply/fit | fit preserves manual geometry across safe-area and visual-viewport changes | B |
| 588–619 | 612, 615–618 | HudLayout.setCam/fit | fit preserves independently edited pieces sharing an offset | B |
| 621–656 | 646, 651–652, 654–655 | HudLayout.setCam/fit | fit never brings an edited block on screen or pushes its edited neighbour | B |
| 658–695 | 690–694 | HudLayout.fit/get | fit leaves size-only edited pieces at their requested positions | B |
| 700–736 | 724–726, 732, 734–735 | HudLayout.fit/get | clearControls preserves manual placement and discards stale automatic clearance | B |
| 795–812 | 804, 806, 809, 811 | HudLayout.set/apply | queued style visibility preserves arrange ghosts and resumes after exit | B |
| 814–824 | 819–823 | HudLayout.migrate | current schema keeps style and camera entries independent, including explicit defaults | B |
| 826–845 | 828–829, 832–833, 835–841, 844 | HudLayout.profile/setCam/set/get/isShipped/resetSet | layouts are keyed by style: a STANDARD tower move does not paint in BROADCAST | B |
| 847–854 | 849, 851, 853 | HudLayout.profile | profile: the live body class while racing, else the stored HUD STYLE | B |
| 856–875 | 858–866, 869, 871–872, 874 | HudLayout.apply/fit/clearReadouts | CamGroups: one onboard table, a wheel-only cockpit-layout table; hud.js and hud-layout read it | B+S |
| 877–990 | 879–897, 901, 903–908, 911–913, 915–937, 940–941, 944–948, 956–957, 960, 965, 968, 971, 973, 979, 981, 986, 989 | HudLayout.hiddenReason | hiddenReason: classes name the reason; the live element has the last word | B+S |
| 992–1022 | 998, 1005, 1009–1012, 1018, 1020–1021 | HudLayout.hiddenReason/set | MIRROR: off is hard; soft-hidden until placed; placing turns MIRROR on | B |
| 1026–1029 | 1027–1028 | HudLayout.apply/fit/clearReadouts | empty #hud-sectors plate collapses — no junk gap before buildSecRows | S |
| 1031–1043 | 1033–1034, 1036, 1038–1039, 1042 | HudLayout.originOf/apply | edited TRACK LIMITS retains its origin when the automatic anchor changes | B |
| 1045–1052 | 1050–1051 | HudLayout.set | apply() asks GameHud to re-fit at once (typeof-guarded) | B |
| 1059–1084 | 1061–1064, 1066, 1068–1076, 1078, 1080–1081, 1083 | HudLayout.get/setCam/isShipped/set/resetEl | HELMET ships its own layout: the cockpit strip plus GEAR and SPEED on a desktop, a touch strip of its own on a phone | B |
| 1086–1120 | 1091, 1093, 1096, 1100–1101, 1105, 1107, 1109–1111, 1114–1115, 1118–1119 | css/hud.css / track-detail.css | touch HELMET hides only what the LCD glyph and the buttons carry; ENERGY and TYRES show (CSS and hiddenReason agree) | B+S |
| 1122–1167 | 1159–1164, 1166 | HudLayout.apply/fit/clearReadouts | every edited widget retains geometry through clearance and high-scale packing | B |
| 1169–1236 | 1197, 1205, 1212–1213, 1218–1220, 1227–1230, 1232, 1235 | HudLayout.clearReadouts | measured clearance protects instruments and controls without changing saved layouts | B+S |
| 1239–1243 | 1241–1242 | css/hud.css / track-detail.css | all temporarily corrected readouts restrict transitions to paint properties | S |
| 1245–1276 | 1265–1267, 1269–1270, 1273–1275 | HudLayout.clearReadouts/hiddenReason | optional strategy compacts, explains a drop, and restores when space returns | B |
| 1278–1293 | 1291–1292 | HudLayout.clearReadouts | clearance keeps an unobstructed readout inside hardware safe areas | B |
| 1295–1310 | 1306–1309 | HudLayout.clearReadouts | damage wraps into a narrow slot without dropping diagnostic text or saving | B+S |
| 1312–1327 | 1323–1326 | HudLayout.clearReadouts | a collapsed radio lane reopens for measured placement without changing settings | B |
| 1330–1355 | 1349–1350, 1352–1354 | HudLayout.clearReadouts/hiddenReason | optional input trace yields to occupied space and restores without saving | B |
| 1358–1392 | 1383–1386, 1388–1391 | HudLayout.clearReadouts | only the unplaced touch broadcast map clears pedals without resizing or saving | B |
| 1428–1459 | 1442–1445, 1448–1450, 1452–1453, 1456–1458 | HudLayout.get | numeric HUD drafts stay readable and commit once when moving between fields | B |
| 1461–1486 | 1471, 1473, 1478–1479, 1485 | HudLayout.apply/fit/clearReadouts | numeric HUD defers one committed preview across unchanged and invalid fields | B |
| 1488–1508 | 1497–1499, 1502–1504, 1507 | HudLayout.get | numeric HUD commits reject invalid drafts and retain explicit default ownership | B |
| 1510–1523 | 1515, 1517, 1519, 1521–1522 | HudLayout.apply/fit/clearReadouts | MOVE & SIZE visibility invokes original map/gaps/mirror owners and preserves AUTO | B |
| 1525–1544 | 1531–1532, 1535–1537, 1539, 1541–1543 | HudLayout.setVisibility | grouped tower visibility stays mixed until explicitly changed and writes one hide list | B |
| 1547–1570 | 1557, 1561–1564, 1566, 1568–1569 | HudLayout.setCam/shown/holdArrangePreview/fit/set/get | ARRANGE keeps the selected camera preview while settings are hidden, then releases it | B |
| 1573–1617 | 1606–1607, 1609–1610, 1614, 1616 | HudLayout.clearReadouts | clearance reuses an unchanged slot as an obstacle without writing zero corrections | B |
| 1619–1635 | 1621–1629, 1631–1634 | HudLayout.presetFits/applyPreset/presetOf | BIG, CORNERS and CLEAN are not offered on a touch phone (hud-survey 844x390: gearbox off-screen, readouts over the steer buttons) | B |
### tests/unit/hud-metrics-layout.test.mjs

Fixture/harness spans: module constants and synthetic box fixtures. All use the inventory dependencies above. 

| Case call range | Assertion spans | Production target | Meaning pinned by assertions | Limits |
|---|---|---|---|---|
| 11–56 | 14–18, 20–30, 46–48, 51, 53, 55 | GameHud visibility/fit; game settings; HUD CSS/shell | HUD metrics layout AUTO keeps every cluster and lets fitHud adapt | B+S |
| 67–84 | 69–71, 73–76, 78, 82–83 | GameHud visibility/fit; game settings; HUD CSS/shell | a forced LAYOUT name hides; AUTO and MAP/GAPS are untouched | S |
| 92–103 | 96, 99–102 | GameHud visibility/fit; game settings; HUD CSS/shell | MINIMAL drops widgets, and a hidden anchor cannot poison the fit | S |
| 109–162 | 112–115, 119, 123, 128–130, 136–139, 143–145, 148, 154–156, 158, 161 | GameHud visibility/fit; game settings; HUD CSS/shell | dropped gaps and the limits chip ride measured offsets | S |
| 164–178 | 167–169, 172–173, 175–177 | GameHud visibility/fit; game settings; HUD CSS/shell | HUD layout options live in a full-width pause submenu | S |
| 180–201 | 183, 193, 196, 200 | GameHud.fitHud; HudMinimap.drawMinimap | a hidden HUD does not keep measuring or painting the map | B+S |
| 207–218 | 211–214, 216–217 | GameHud visibility/fit; game settings; HUD CSS/shell | an unknown HUD layout falls back to the shipped FULL, and the studio jumps to the row that shows AUTO | S |
| 225–237 | 228–230, 233–236 | GameHud visibility/fit; game settings; HUD CSS/shell | TIMING and COMPACT drop the tyre readout but never the pit cue or the dwell feedback | S |
| 242–260 | 247–248, 258–259 | GameHud.paintInstruments; HudReadouts.spdPlate | paintInstruments paints SPD via HudReadouts.spdPlate (one MPH\|KPH plate) | B+S |
| 262–279 | 276, 278 | GameHud.paintInstruments; HudReadouts.spdPlate | paintInstruments never paints a negative speed in reverse; the wheel LCD and phone pad clamp to 0 (hunt3 4-F4) | B+S |
| 284–294 | 290–291, 293 | GameHud visibility/fit; game settings; HUD CSS/shell | tower slots reserve in em, and a late font load refits (#3064) | S |
### tests/unit/hud-minimap-pitmark.test.mjs

Fixture/harness spans: makeCtx 21–29; boot 31–48. All use the inventory dependencies above. Module-level assertion 19 checks the extracted glyph block exists. 

| Case call range | Assertion spans | Production target | Meaning pinned by assertions | Limits |
|---|---|---|---|---|
| 50–62 | 54, 56–61 | HudMinimap.mmPitMark | steady-state calls blit the cached glyph: font set once, no fillText on the target | B |
| 64–72 | 71 | HudMinimap.mmPitMark | a new radius, fill or ratio is a new glyph; the same key is reused | B |
| 74–80 | 79 | HudMinimap.mmPitMark | falls back to the direct draw when no 2d context is available | B |
### tests/unit/hud-pins.test.mjs

Fixture/harness spans: ctx2d 34–40; boot 48–181; paintAt 138–159. All use the inventory dependencies above. Fixed 844×390 geometry and synthetic CSS zoom; F-02 and F-06 are explicit TODOs. 

| Case call range | Assertion spans | Production target | Meaning pinned by assertions | Limits |
|---|---|---|---|---|
| 183–187 | 186 | GameHud.updateHud/fitHud/announceLane/radioTopSlot | pin: the radio lane is published on a touch phone with lit docks (harness sanity) | B |
| 189–202 | 192–193, 197–198, 201 | GameHud.updateHud/fitHud/announceLane/radioTopSlot | pin: the gap plate's empty flag follows its two lines (no root :has(), B·H11) | B |
| 204–231 | 218, 224, 227, 230 | GameHud.updateHud/fitHud/announceLane/radioTopSlot | pin: the 3 s same-key backstop re-fits only after a fitted box resized (B·H11) | B |
| 233–242 | 241 | GameHud.updateHud/fitHud/announceLane/radioTopSlot | pin: a HIDDEN readout never bounds the radio lane (visible-element-only obstacles) | B |
| 244–254 | 249, 251, 253 | GameHud.updateHud/fitHud/announceLane/radioTopSlot | pin F-02: the lane comes back after the docks hide and return with the same geometry | B; TODO |
| 256–268 | 266–267 | GameHud.updateHud/fitHud/announceLane/radioTopSlot | pin F-06: a radio card the fit collapsed off S3 stays collapsed for the rest of the tick | B; TODO |
| 270–290 | 277, 286, 288–289 | GameHud.updateHud/fitHud/announceLane/radioTopSlot | pin F-01: without Element.currentCSSZoom the top-band zoom converges instead of flip-flopping | B |
### tests/unit/hud-portrait-cluster.test.mjs

Fixture/harness spans: module constants and synthetic box fixtures. All use the inventory dependencies above. 

| Case call range | Assertion spans | Production target | Meaning pinned by assertions | Limits |
|---|---|---|---|---|
| 23–32 | 26–31 | HUD CSS + GameHud.fitHud/fitPass | CSS: touch TYRES dock-anchor is landscape-only (portrait stays in stack) | S |
| 34–41 | 35–40 | HUD CSS + GameHud.fitHud/fitPass | CSS: portrait phone parks TYRES above the bottom stack | S |
| 43–50 | 44–49 | HUD CSS + GameHud.fitHud/fitPass | fitHud: portrait path caps --hud-z-bot against the side button columns | B |
| 52–59 | 53–58 | HUD CSS + GameHud.fitHud/fitPass | CSS: portrait phone left-aligns the tower so it cannot cover #hud-sectors | S |
| 61–68 | 62–67 | HUD CSS + GameHud.fitHud/fitPass | CSS: portrait phone floors tower labels and sector times at 10 CSS px | S |
| 73–94 | 81–85, 93 | hud-geometry.analyzeOverlap/overlapArea | analyzeOverlap: tip portrait clash shapes are the failure mode we clear | G |
### tests/unit/hud-radio-slot.test.mjs

Fixture/harness spans: ctx2d 30–36; boot 38–93; fitHarness 95–129. All use the inventory dependencies above. 

| Case call range | Assertion spans | Production target | Meaning pinned by assertions | Limits |
|---|---|---|---|---|
| 131–146 | 134–135, 141–145 | GameHud.updateHud/fitHud/announceLane/radioTopSlot | BROADCAST lights the same #1504 radio home as STANDARD (regression: !bcast skipped the slot) | B |
| 148–168 | 151–167 | GameHud.updateHud/fitHud/announceLane/radioTopSlot | css/hud.css: one radio home per profile — no leftover broadcast 14svh, fallbacks stand down for both slots | S |
### tests/unit/hud-readouts.test.mjs

Fixture/harness spans: load 22–28; boot 177–227; loadRegion 319–332. All use the inventory dependencies above. 

| Case call range | Assertion spans | Production target | Meaning pinned by assertions | Limits |
|---|---|---|---|---|
| 30–42 | 32–38, 40–41 | HudReadouts "lapsApart / lapGapText | lapsApart / lapGapText: a lap or more is laps | B |
| 44–53 | 46–52 | HudReadouts "energy | energy: MJ of the 4 MJ store, deploy/harvest as glyph and words | B |
| 55–60 | 57–59 | HudReadouts "bbText | bbText: the set-up sheet's half-percent steps | B |
| 62–83 | 64–70, 72–73, 81–82 | HudReadouts "spdPlate | spdPlate: one MPH\|KPH plate — never KM/H, settings drive the unit | B |
| 85–107 | 88–95, 98, 100, 103, 106 | HudReadouts "colourblind HUD cues | colourblind HUD cues: flag and sector data attributes when on | B |
| 109–120 | 116–119 | HudReadouts "blueFlag | blueFlag: only a car a lap up, physically just behind, within ~1.2 s | B |
| 122–147 | 130, 132–134, 138, 144, 146 | HudReadouts "lapTrace | lapTrace: adopts a lap only when it became the new best, then interpolates | B |
| 149–168 | 158–159, 161, 166–167 | HudReadouts "speaker | speaker: position held 2 s, one line per 2 s, yields to the radio | B |
| 170–174 | 172–173 | HudReadouts "source | source: display-only — no Tracks / curvature / racing line, no car writes | S |
| 229–235 | 232, 234 | GameHud.updateHud/paintInstruments/speakHud/resetRace; HudReadouts | hud.js: a car a lap up reads +1L, not distance ÷ speed | B |
| 237–245 | 242–244 | GameHud.updateHud/paintInstruments/speakHud/resetRace; HudReadouts | hud.js: gear, tach and speed update every frame; the clock stays at 10 Hz | B |
| 247–274 | 258–259, 269, 271–273 | GameHud.updateHud/paintInstruments/speakHud/resetRace; HudReadouts | hud.js: SPD unit plate is MPH\|KPH (matches wheel LCD), not KM/H | B |
| 276–286 | 279, 281–283, 285 | GameHud.updateHud/paintInstruments/speakHud/resetRace; HudReadouts | hud.js: ENERGY number + state, BB chip, the energy fill has its own colour | B+S |
| 288–304 | 296–297, 300–303 | GameHud.updateHud/paintInstruments/speakHud/resetRace; HudReadouts | hud.js: race DELTA appears once a best lap exists, without a ghost | B |
| 306–313 | 309–312 | HudReadouts "shell | shell: every .hud-top box has an id the hide rules key on; no nth-child left | S |
| 334–343 | 336–342 | LiveRegion.say/enqueue/write/pump/reset | LiveRegion: a flag and a radio call in one tick are BOTH read, the flag first | B |
| 345–366 | 349–352, 354, 356, 358, 362–363, 365 | LiveRegion.say/enqueue/write/pump/reset | LiveRegion: a lower-priority line waits out the hold; stale HUD lines are dropped | B |
| 370–379 | 374–376, 378 | LiveRegion.say/enqueue/write/pump/reset | LiveRegion: a HUD line pushed back by a flag never supersedes a newer queued one | B |
| 385–393 | 389, 391–392 | LiveRegion.say/enqueue/write/pump/reset | LiveRegion: a burst past MAX_Q drops the least urgent, OLDEST line (not the newest) | B |
| 395–406 | 399–400, 402–405 | GameHud.updateHud/paintInstruments/speakHud/resetRace; HudReadouts | hud.js: the flag and the radio go through the one writer | S |
| 409–419 | 412, 414, 416, 418 | GameHud.updateHud/paintInstruments/speakHud/resetRace; HudReadouts | hud.js: POS is session-aware — TT, Q in qualifying, PRAC in practice, rank/field in a race | B |
| 421–427 | 424, 426 | GameHud.updateHud/paintInstruments/speakHud/resetRace; HudReadouts | hud.js: the gap chips carry no sign — the arrow is the direction, as RELATIVE agrees | B |
| 429–444 | 435–436, 439, 441, 443 | GameHud.updateHud/paintInstruments/speakHud/resetRace; HudReadouts | hud.js: the same car lapping the player AGAIN is a new blue flag, spoken again | B |
| 446–469 | 452–453, 457, 459–460, 462, 465–466, 468 | GameHud.updateHud/paintInstruments/speakHud/resetRace; HudReadouts | hud.js: the flag chip counts the give-back window down and names the car, without re-speaking the flag | B |
| 471–491 | 477, 480–482, 485–487, 490 | GameHud.updateHud/paintInstruments/speakHud/resetRace; HudReadouts | hud.js: the LIMITS chip carries ANY time penalty as +Ns, a caution-pass one included | B |
| 493–506 | 498–500, 502–505 | GameHud.updateHud/paintInstruments/speakHud/resetRace; HudReadouts | hud.js: resetRace clears the chips' carried state — team bar, tow, pit window, ghost tint | B |
| 509–520 | 516–519 | HudReadouts "R2-07 | R2-07: the chip behind a car a lap DOWN says -1L, REL's own spelling for it | B |
| 522–530 | 528 | HudReadouts "R2-06 | R2-06: a delta that ROUNDS to zero never paints -0.000 | B |
| 532–541 | 539 | HudReadouts "R2-06 | R2-06: the TT ghost chip takes its sign from the rounded value too | B |
| 543–562 | 554–556, 559–561 | HudReadouts "S4 | S4: before the first line crossing the ghost chip, delta and minimap dot do not run off the run-up clock | B |
| 564–582 | 571, 575, 578, 581 | HudReadouts "PERF-2 | PERF-2: a steady tick does not re-run announceLane's layout reads; a changed key does | B |
| 584–625 | 612–614, 621–624 | GameHud.updateHud/paintInstruments/speakHud/resetRace; HudReadouts | hud.js: ${mode} hidden skips visual work, preserves lap reference and repaints on show | B |
| 627–639 | 633–634, 636, 638 | GameHud.updateHud/paintInstruments/speakHud/resetRace; HudReadouts | hud.js: hidden camera changes retain INPUTS suppression policy without painting camera classes | B |
| 641–650 | 647, 649 | GameHud.updateHud/paintInstruments/speakHud/resetRace; HudReadouts | hud.js: hidden caution still speaks once, then show does not repeat the same flag | B |
| 652–667 | 655, 662–663, 666 | GameHud.updateHud/paintInstruments/speakHud/resetRace; HudReadouts | hud.js: fonts arriving while hidden invalidate without measuring, and show repaints | B |
| 669–683 | 677, 679, 682 | GameHud.updateHud/paintInstruments/speakHud/resetRace; HudReadouts | hud.js: hidden rank changes retain hold timing and speak once across show | B |
| 685–698 | 692, 695, 697 | GameHud.updateHud/paintInstruments/speakHud/resetRace; HudReadouts | hud.js: hidden blue-flag changes preserve per-car/per-lap speech across show | B |
### tests/unit/hud-relative.test.mjs

Fixture/harness spans: load 15–21. All use the inventory dependencies above. 

| Case call range | Assertion spans | Production target | Meaning pinned by assertions | Limits |
|---|---|---|---|---|
| 25–32 | 27–31 | HudRelative "relDist wraps into (-L/2, L/2]" | relDist wraps into (-L/2, L/2] | B |
| 34–42 | 38–41 | HudRelative "lapsApart | lapsApart: +1 lapping you, -1 a lap down, 0 on the same lap | B |
| 44–60 | 55–59 | HudRelative "select | select: two ahead and two behind BY ROAD, self in the middle, retired skipped | B |
| 62–73 | 67–72 | HudRelative "select | select: a short field leaves empty slots; the same row objects every call | B |
| 75–94 | 80–88, 91–93 | HudRelative "fmtGap | fmtGap: sign carries ahead/behind; hundredths under 10 s (the chip's spelling), tenths to 99, then 99+ | B |
| 96–101 | 98–100 | HudRelative "rowLabel says it in words (no colour-only meaning)" | rowLabel says it in words (no colour-only meaning) | B |
| 103–154 | 119, 123, 125–132, 137, 140–141, 144, 149, 153 | HudRelative tick/select/fmtGap | tick: off hides the box; on, it fills rows and never writes a car | B |
| 156–193 | 190–192 | HudRelative fitRows/refit/fitKey | fitRows does not slide past gearbox onto aero / the right dock | B |
| 195–219 | 218 | HudRelative fitRows/refit/fitKey | fitRows slides past OT when REL top already sits inside the control | B |
| 221–250 | 248–249 | HudRelative fitRows/refit/fitKey | fitRows caps max-height above an overlapping BRAKE | B |
| 252–284 | 281–282 | HudRelative fitRows/refit/fitKey | fitRows divides by --hud-scale when the fit removed --hud-z-top (HUD SIZE > 100 %, hunt3 1b-F2) | B |
| 286–323 | 316, 321–322 | HudRelative fitRows/refit/fitKey | fitRows resets left / max-height once the clash is gone (STEERING change, HUD SIZE, rotation) | B |
| 325–398 | 362–364, 370, 374, 378–380, 383, 386, 389–391, 396–397 | HudRelative fitRows/refit/fitKey | fitRows is stable across frozen rechecks and releases its fit when controls move | B |
| 400–402 | 401 | HudRelative "never reads track curvature (the arc must not reach the driver)" | never reads track curvature (the arc must not reach the driver) | S |
| 404–424 | 420, 423 | HudRelative fitRows/refit/fitKey | tick: a settled phone layout is fitted once, not forced to layout every 100 ms (bug-hunt 2 P9) | B |
| 426–451 | 445, 447, 450 | HudRelative fitRows/refit/fitKey | tick: the 1 Hz net is read-only — a settled card is never reset, a moved control still refits (audit4 UB6) | B |
| 453–476 | 470, 472, 475 | HudRelative fitRows/refit/fitKey | refit: the phone stamp sync's per-tick call skips a settled REL, refits when forced (#2151) | B |
| 478–496 | 493, 495 | HudRelative fitRows/refit/fitKey | fit key ignores ot-*/ax-* class churn on clearance controls (perf H7 row 11) | B |
### tests/unit/hud-speed-parity.test.mjs

Fixture/harness spans: loadReadouts 55–61. All use the inventory dependencies above. 

| Case call range | Assertion spans | Production target | Meaning pinned by assertions | Limits |
|---|---|---|---|---|
| 28–31 | 29–30 | dashKph; HudReadouts.spdDigits/spdPlate; GameHud.paintInstruments; wheel paths | game.js: dashKph is vStd(v) * 3.6, the one dash-scale accessor | S |
| 33–45 | 34–37, 40–44 | dashKph; HudReadouts.spdDigits/spdPlate; GameHud.paintInstruments; wheel paths | HUD and every wheel readout feed G.dashKph(<car>.speed) then HudReadouts.spdDigits | S |
| 47–52 | 50 | dashKph; HudReadouts.spdDigits/spdPlate; GameHud.paintInstruments; wheel paths | no readout converts raw ground speed (m/s * 3.6) on its own | S |
| 63–78 | 64–65, 71, 73–74, 77 | dashKph; HudReadouts.spdDigits/spdPlate; GameHud.paintInstruments; wheel paths | wheel LCD and HUD plate print the same number for one dash km/h (km/h and mph) | S |
| 80–120 | 83, 101, 104–105, 107, 110–111, 113, 115, 117, 119 | dashKph; HudReadouts.spdDigits/spdPlate; GameHud.paintInstruments; wheel paths | hidden instruments skip visual derivation and resume with current values and redline state | B+S |
### tests/unit/hud-status-stack.test.mjs

Fixture/harness spans: module constants and synthetic box fixtures. All use the inventory dependencies above. 

| Case call range | Assertion spans | Production target | Meaning pinned by assertions | Limits |
|---|---|---|---|---|
| 22–39 | 23–38 | HUD CSS + GameHud.fitHud/fitPass | fitHud publishes gaps-bottom and tyre-stack for the left/centre columns | B |
| 41–70 | 42–43, 46–54, 56–69 | HUD CSS + GameHud.fitHud/fitPass | CSS: flag and announce clear the gaps strip; tyre stack; strat under REL | S |
| 72–109 | 87–92, 105–108 | hud-geometry.analyzeOverlap/overlapArea | analyzeOverlap: phoneL broadcast 150% before-shapes are the failure mode | G |
### tests/unit/hud-strategy.test.mjs

Fixture/harness spans: load 15–21; fakeDom 66–75. All use the inventory dependencies above. 

| Case call range | Assertion spans | Production target | Meaning pinned by assertions | Limits |
|---|---|---|---|---|
| 23–35 | 25–34 | HudStrategy "fmtLaps / fmtLoss / fmtNext" | fmtLaps / fmtLoss / fmtNext | B |
| 39–50 | 41–49 | HudStrategy "behindThreat | behindThreat: rival behind due in on fresher rubber while our stop is near | B |
| 52–64 | 54–63 | HudStrategy "undercut | undercut: car ahead inside the pit-loss window on older tyres | B |
| 77–120 | 95, 98–107, 109, 111, 113, 115, 117, 119 | HudStrategy tick | tick: race + wear only; shows laps, loss, next, and the cue with the rival's code | B |
| 122–124 | 123 | HudStrategy "never reads track curvature (the arc must not reach the driver)" | never reads track curvature (the arc must not reach the driver) | S |
| 127–134 | 129–133 | HudStrategy "estimated pit window uses only finite canonical gap minus loss" | estimated pit window uses only finite canonical gap minus loss | B |
| 136–145 | 138–144 | HudStrategy "estimated tyres short of planned stop has hysteresis and suppresses unknown/no stop" | estimated tyres short of planned stop has hysteresis and suppresses unknown/no stop | B |
| 147–160 | 154–155, 157–159 | HudStrategy tick | strategy tick updates honest window and clears tyre warning on changed or unknown plan | B |
| 162–193 | 175, 177–178, 180–181, 183, 185, 189, 192 | HudStrategy tick | tick shares synchronous player reads, including computed null, and preserves standalone fallback | B |

## Coverage boundary

All planned sources and registrations are accounted for. Fake documents, canvas logs, frozen plain cars, manually delivered ResizeObserver entries, synchronous timers and fixed rects intentionally isolate policy. CSS source assertions, browser-helper extraction and the two before/after synthetic geometry examples do not prove the live layout is collision-free. Speed parity exercises one shared formatter and pins wheel call sites; it does not render a cockpit. The radius/fill/ratio-named pit glyph case changes radius and fill only: it does not mutate ratio mid-harness. INPUTS two background variants cover deferred review reset for no-player/suppressed/replacement, not all document visibility lifecycles. No browser, accessibility device, or hardware performance verification was performed.
