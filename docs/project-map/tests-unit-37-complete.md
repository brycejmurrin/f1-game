# Unit tests group 37 — complete static map

Read-only mapping of all ten files in unit-batches group `37`: **4,899 lines**. Every test file was returned in separate contiguous chunks of at most 100 lines (each under 10,000 characters), without truncation; ranges below are one-based and inclusive. No tests, oracle CLIs, browsers or hardware probes were executed. Test names describe intended contracts; the meaning/limits column records the actual evidence type and notable weaker assertions.

Assertion spans include complete assertion-call ranges, including helper assertions where listed. Loops reuse those spans; generated case expansions are enumerated explicitly: 203 test declarations expand to 213 registered cases (nine characterization scenarios and three native contact-sheet outcomes). Production anchors are source navigation, not test results.

## Source identities and full-read ranges

| File | Full read | SHA-256 |
|---|---|---|
| tests/unit/phone-pad.test.mjs | 1–2084; chunks 1–100, 101–200, 201–300, 301–400, 401–500, 501–600, 601–700, 701–800, 801–900, 901–1000, 1001–1100, 1101–1200, 1201–1300, 1301–1400, 1401–1500, 1501–1600, 1601–1700, 1701–1800, 1801–1900, 1901–2000, 2001–2084 | e94a5c48687f1f14fe1c5c40b954244ab846aeb7aed59c668f9d83b5720e70b9 |
| tests/unit/phone-recorder.test.mjs | 1–328; chunks 1–100, 101–200, 201–300, 301–328 | 05e7b24d28b626641246daf30c400abfbf22ffc393e64605ccced8df822aac06 |
| tests/unit/phone-touch-surface.test.mjs | 1–766; chunks 1–100, 101–200, 201–300, 301–400, 401–500, 501–600, 601–700, 701–766 | 0cf509d753fece6fdda70b85e1c060257b486d9a927f1ecd8fed89388ad32ad1 |
| tests/unit/photo-kit.test.mjs | 1–169; chunks 1–100, 101–169 | d0271e8fbcaeeddffe8713d8e79c3b3d94c8544be8bc6ee267cbc5c4a0ab1f39 |
| tests/unit/photo-studio.test.mjs | 1–776; chunks 1–100, 101–200, 201–300, 301–400, 401–500, 501–600, 601–700, 701–776 | 9814a544a51c753dd007d94eeff7832a094bfba52581f933b085e3cb3814c0d1 |
| tests/unit/photomode-hold.test.mjs | 1–246; chunks 1–100, 101–200, 201–246 | 17be559060c0825602d6ec17dac1caacc7563372efa8f05a53d93a170ff1b462 |
| tests/unit/physics-baseline-provenance.test.mjs | 1–131; chunks 1–100, 101–131 | ea76547b110acdea505d0b6a5acb00b2f155a037094582a9733275c7b32ca491 |
| tests/unit/physics-characterization-vm.test.mjs | 1–173; chunks 1–100, 101–173 | 3d9fe047a5a53f3122569a4ba65ecc014c9c8d55fc060d11867995df2206f9fd |
| tests/unit/physics-feel-vm.test.mjs | 1–122; chunks 1–100, 101–122 | c9dc29f0e8fd7605ba7f08a43af7a40c30478af60879d9c50e96108df80f12a2 |
| tests/unit/physics-oracle.test.mjs | 1–104; chunks 1–100, 101–104 | 5c4d380419b996d9c31982565b032276827b3ac3ec45e95b267862979fdfa268 |

## Production navigation and fixtures

Applied repository `.claude/skills/code-nav/SKILL.md`. Shell fallback `bash tools/mcp/lsp-mcp.sh outline … --concise` resolved PhonePad, Input, TiltRoll-related input owners, PhoneRecorder, PhotoKit, PhotoStudio, Photomode and PlatformSession. `Vehicle` definition and PlayerForces outline were also inspected; Vehicle is only shared scratch data, so longitudinal assertions correctly target game.js. A guessed longitudinal.js path did not exist; the actual logic was located in game.js source. Input outline was intentionally bounded to exported first-page anchors; no claim of exhaustive internal-symbol navigation.

| Key | Production source and relevant ranges |
|---|---|
| P | js/input/phone-pad.js; encodeSample 69–73; decodeSample 74–84; encodeHud 88–93; decodeHud 94–98; decodeEvent 116–124; padUrl 146–155; codeFromUrl 156–162; link 221–308; host 315–480; padSession 488–590; paintHud 600–638; pad 647–1205 |
| I | js/input/input.js; requestGyro 289–325; calibrate 335–343; remoteSample 369–409; remoteLost 454–458; steer 1813–1816; poll 1856–1865; reset 2385–2440 |
| T | js/input/tilt-roll.js; rollDeg 18–34 |
| S | js/ui/platform-session.js; wirePhone 203–309; phonePadDash 233–253 |
| R | js/perf/phone-recorder.js; numericLeaves 68–80; liveEnv 185–197; create 200–303; download 314–328; share 331–345; copy 346–364 |
| K | js/camera/photo-kit.js; marksFor 32–36; saveMark 39–56; deleteMark 58–67; createLookSession 75–95; applyDof 122–137; mountLookControls 97–119 |
| F | js/ui/photo-studio.js; library 41–69; download 76–84; create 85–759; capture 638–647; close 492–508; savePhoto 656–671; contactSheet 742–756; album 734–741 |
| H | js/camera/photo-cam.js; create 5–293; photoKeyHandler 133–168; wirePhotoHold 225–245; updatePhotoCam 51–86 |
| C | CSS/shell anchors: css/overlays.css:36–42 rotate controls; css/touch-controls.css:31–37 label/gap tokens, 503–517 and 568–576 label floors, 764/797 top-control typography; css/hud.css:67 button zoom; js/ui/hud.js:523 side-aware dock selection and :1038 fitHud; index.html:41–50 gesture handler registration. Hover/overscroll scans intentionally quantify over every physical CSS file, rather than one symbol. |
| G | js/game.js; syncRotateBlocker 4277–4303; tickBody 8502–8615 |
| L | js/game.js; deploy scaling 5118; top-gear limiter 5191–5203; brake/deploy and integrator 5494–5556 |
| B | tests/helpers/baseline-blessing.mjs; dataHash 17–21; blessing 31–38 |
| O | tools/check/physics-oracle.mjs; encodeNumber 54–61; recipes 65–78; unpackGhost 97–107; bootPinned 140–152; header 133–137; main 245–278 |

Additional sources: css/tokens.css, touch-controls.css, hud.css, overlays.css, responsive.css, components.css, title.css, menus.css and physical css/*.css; index.html/controller.html; tools/manifest.cjs; tools/desktop/stage-files.mjs; pages workflow; AndroidManifest.xml; appearance-opts.js; xr-rig.js/xr-input.js; camera/feel.js; garage/setup-sheet.js and production scene catalogs; perf/render-rate.js; tools/perf/devicefarm-iphone.mjs; tests/data/physics-baseline.json; tests/specs/physics-characterization.spec.js; tools/lib/game-vm.cjs; tools/check/track-oracle.mjs:33–49 grid, 54–73 main. These are dependencies or static contract targets, not additional unit files claimed fully read. Fake relay/game URLs, OFFER/ANSWER tokens, blob:* and vm-snippet:* filenames are descriptive injected fixtures, not live services or source paths.

## tests/unit/phone-pad.test.mjs

Fixture/setup: Global eval loads NetBytes/NetTransport/TiltRoll/PhonePad (23–32); extracted phonePadDash over stub G (36–44); bootInput (51–95) runs real M4, bindings, pad-menu, haptics, hold-buttons and Input with a hand clock and inert DOM. fakeTimers (99–114), pair (121–143), lcd (146–154), fakeEl (643–658), hostHarness (955–974), wakePad (1573–1608) inject loopback, signalling, permission and wake-lock completions.

Scope/limits: VM/loopback and fake elements; no physical sensors, radio, RTC/relay service, browser focus rendering or mobile OS permission verification.

| Case name and range | Assertion spans | Production target | Meaning / limits |
|---|---|---|---|
| a sample round-trips, and junk / a foreign protocol / an out-of-range pedal never reach Input (160–172) | 162–164, 166, 169–171 | P.decodeSample:74–84; P.encodeSample:69–73 | Codec precision/null handling and malformed rejection; wild numeric pedals/roll are clamped (despite title wording). |
| events: only the named edges decode, haptics are bounded, the rest is dropped (174–181) | 175–180 | P.decodeEvent:116–124; P.encodeEvent:113–113; P.encodeHaptic:114–114 | Real phone/input math through deterministic transport or explicit callback injection; observes the named values/edges and cleanup. |
| the dash round-trips, is refused by the sample decoder, and clamps every field (183–198) | 187–191, 193–197 | P.decodeHud:94–98; P.encodeHud:88–93; P.decodeSample:74–84; P.encodeSample:69–73; P.teamHex:126–130; P.fmtLap:132–136 | Wire/painted fake LCD fields, flags and sampler values asserted; layout CSS checks are textual. |
| the pairing URL lands on controller.html beside the game with the code in the FRAGMENT (200–208) | 201–207 | P.padUrl:146–155; P.codeFromUrl:156–162 | Real phone/input math through deterministic transport or explicit callback injection; observes the named values/edges and cleanup. |
| TiltRoll: the roll the phone sends is the roll the game would have read itself (214–226) | 216–217, 219–225 | T.rollDeg:18–34 | Real phone/input math through deterministic transport or explicit callback injection; observes the named values/edges and cleanup. |
| a tilted phone steers through Input's tilt pipeline — the same filter, dead zone and slew as the local sensor (232–258) | 234, 238–240, 248, 253, 257 | I.steer:1813–1816; I.remoteActive:356–358; I.simTiltReset:482–485; I.simTilt:470–480 | Real phone/input math through deterministic transport or explicit callback injection; observes the named values/edges and cleanup. |
| RECALIBRATE zeroes the phone's current roll, and the roll is what debugState reports (260–270) | 264, 267–269 | I.steer:1813–1816; I.calibrate:335–343; I.debugState:2476–2480 | Real phone/input math through deterministic transport or explicit callback injection; observes the named values/edges and cleanup. |
| the phone's pedals reach throttle()/braking() and their travel reaches the levels (272–289) | 275, 277–278, 280–282, 284, 286, 288 | I.throttle:1867–1869; I.braking:1871–1873; I.throttleLevel:1880–1885; I.brakeLevel:1886–1891; I.lookingBack:1951–1951 | Real phone/input math through deterministic transport or explicit callback injection; observes the named values/edges and cleanup. |
| a button edge crosses on the reliable channel exactly once, and PAUSE reaches the game's callback (291–306) | 294–295, 297–299, 301, 303–305 | I.consumeShiftUp:1911–1915; I.consumeOvertake:1899–1903; I.consumeBoostToggle:1893–1897 | Real phone/input math through deterministic transport or explicit callback injection; observes the named values/edges and cleanup. |
| an OLDER sample arriving after a newer one is dropped, never applied (308–321) | 316–317, 320 | P.encodeSample:69–73; I.steer:1813–1816 | Real phone/input math through deterministic transport or explicit callback injection; observes the named values/edges and cleanup. |
| the desktop's vibrate() is forwarded to the phone while it is the live source (323–330) | 329 | PhonePad (P), Input (I), TiltRoll (T), PlatformSession (S) | Real phone/input math through deterministic transport or explicit callback injection; observes the named values/edges and cleanup. |
| a capable phone exposes haptics on pairing, respects strength/off, and hides on disconnect (332–350) | 336, 338–339, 343, 346, 348–349 | PhonePad (P), Input (I), TiltRoll (T), PlatformSession (S) | Real phone/input math through deterministic transport or explicit callback injection; observes the named values/edges and cleanup. |
| a phone without a vibrator does not advertise haptics (352–357) | 355–356 | I.remoteActive:356–358 | Real phone/input math through deterministic transport or explicit callback injection; observes the named values/edges and cleanup. |
| missing, malformed, or wrong-protocol phone capabilities cannot enable haptics (359–370) | 368 | PhonePad (P), Input (I), TiltRoll (T), PlatformSession (S) | Real phone/input math through deterministic transport or explicit callback injection; observes the named values/edges and cleanup. |
| phone capabilities arriving before both RTC channels open survive the host open callback (372–385) | 378, 380, 382, 384 | P.link:221–308 | Real phone/input math through deterministic transport or explicit callback injection; observes the named values/edges and cleanup. |
| silence makes the source stale in 700 ms, and the keyboard takes over meanwhile (387–406) | 391, 394, 396–397, 403–404 | I.steer:1813–1816; I.remoteActive:356–358 | Real phone/input math through deterministic transport or explicit callback injection; observes the named values/edges and cleanup. |
| a silent phone cannot leave its last roll steering through local tilt mode (408–429) | 417, 419, 421–425, 427 | I.setSteerMode:2021–2036; I.remoteSample:369–409; I.steer:1813–1816; I.remoteActive:356–358; I.throttle:1867–1869; I.braking:1871–1873; I.lookingBack:1951–1951 | Real phone/input math through deterministic transport or explicit callback injection; observes the named values/edges and cleanup. |
| local gyro reacquires steering after a phone expires or disconnects (431–459) | 447, 450, 456–457 | I.setSteerMode:2021–2036; I.requestGyro:289–325; I.remoteSample:369–409; I.steer:1813–1816; I.remoteLost:454–458; I.tiltActive:345–347 | Real phone/input math through deterministic transport or explicit callback injection; observes the named values/edges and cleanup. |
| the dash reaches the phone ~15 Hz on the unreliable channel and paints the wheel's LCD (461–501) | 464, 468, 470, 473–484, 487–490, 492, 494, 496, 498, 500 | P.paintHud:600–638 | Wire/painted fake LCD fields, flags and sampler values asserted; layout CSS checks are textual. |
| the LCD says Q / PRAC where the race HUD does, not a race position (R2-08) (503–520) | 507, 509, 511, 513, 515, 517–519 | P.paintHud:600–638; P.decodeHud:94–98; P.encodeHud:88–93 | Wire/painted fake LCD fields, flags and sampler values asserted; layout CSS checks are textual. |
| the control modes reach the wheel's layout: no paddles on AUTO gears, no GAS zone on AUTO throttle, AERO greyed on AUTO or no zones (522–549) | 526–527, 529, 531–532, 534, 536–537, 539, 542, 545–548 | P.paintHud:600–638; P.decodeHud:94–98; P.encodeHud:88–93 | Wire/painted fake LCD fields, flags and sampler values asserted; layout CSS checks are textual. |
| closing the link drops the pedals and the source at once and unhooks the haptics (551–565) | 555, 558–562, 564 | I.throttle:1867–1869; I.remoteActive:356–358; I.steer:1813–1816 | Real phone/input math through deterministic transport or explicit callback injection; observes the named values/edges and cleanup. |
| Input.reset() clears the remote command without disconnecting its next fresh sample (567–590) | 571–572, 575–580, 584–587, 589 | I.reset:2385–2440; I.remoteSample:369–409; I.steer:1813–1816; I.throttle:1867–1869; I.remoteActive:356–358; I.remoteSteers:362–362; I.lookingBack:1951–1951; I.debugState:2476–2480; I.remoteLost:454–458 | Real phone/input math through deterministic transport or explicit callback injection; observes the named values/edges and cleanup. |
| the registered blur reset releases phone tilt until a fresh axis sample arrives (592–616) | 596, 599–601, 606–609, 613–615 | P.encodeSample:69–73; I.steer:1813–1816; I.remoteActive:356–358; I.throttle:1867–1869; I.remoteSteers:362–362 | Real phone/input math through deterministic transport or explicit callback injection; observes the named values/edges and cleanup. |
| menu pad: the phone's nav events land on the gamepad's menu seam (arrows, activate, back) (618–637) | 621, 629, 632–636 | I.remoteEvent:434–442 | Real phone/input math through deterministic transport or explicit callback injection; observes the named values/edges and cleanup. |
| pad(): GAS and BRAKE keep the strongest contact and clear travel on release or blur (660–709) | 674–675, 690 | P.pad:647–1205 | Synthetic DOM contacts/keys/timers observe transmitted state and cleanup for the named gesture. |
| the phone controller accepts a full private relay token and explains an incomplete one (711–719) | 715–718 | P.pad:647–1205 | Real phone/input math through deterministic transport or explicit callback injection; observes the named values/edges and cleanup. |
| a fresh phone learns the private Worker only on CONNECT, with its token confined to the fragment (721–743) | 726–727, 738–739, 741–742 | P.padUrl:146–155; P.pad:647–1205 | Real phone/input math through deterministic transport or explicit callback injection; observes the named values/edges and cleanup. |
| public QR clears a previous private document override, while invalid relay metadata makes no network request (745–761) | 754, 756–758, 760 | P.pad:647–1205; P.padUrl:146–155 | Real phone/input math through deterministic transport or explicit callback injection; observes the named values/edges and cleanup. |
| pad(): the page's pedals, paddles and LCD are wired through to the wire and back (763–892) | 783, 785, 787–789, 799–801, 805–806, 809, 812–813, 816, 820, 825, 830, 832, 834, 837, 840, 847, 850–852, 856–857, 859, 862–865, 868, 873–874, 876, 878–885, 889–891 | P.link:221–308; P.pad:647–1205; I.steer:1813–1816; I.throttle:1867–1869; I.throttleLevel:1880–1885; I.consumeShiftUp:1911–1915; I.calibrate:335–343; I.consumeOvertake:1899–1903 | End-to-end synthetic press/ease/floor/release, one-shot edges, repeat/stick timing, rim and LCD, disconnect reset. |
| pad(): a lost lift on the menu stick or a held arrow is caught by the all-fingers-up / hidden nets (hunt3 7-F5) (894–945) | 915, 924–926, 929, 938–940 | P.link:221–308; P.pad:647–1205 | Synthetic DOM contacts/keys/timers observe transmitted state and cleanup for the named gesture. |
| host(): prepares, mints a code, paints the QR, waits, links on the phone's answer, then closes the room (976–1003) | 979–983, 986–991, 994, 997–1000, 1002 | P.padUrl:146–155; I.remoteActive:356–358 | Injected room/answer callbacks assert phase, transport and UI ownership across the named outcome; no real signalling. |
| host(): an unreadable answer goes back to waiting; a room that will not open fails; cancel while waiting tears down (1005–1031) | 1009–1010, 1012, 1016–1017, 1021–1022, 1029–1030 | PhonePad (P), Input (I), TiltRoll (T), PlatformSession (S) | Injected room/answer callbacks assert phase, transport and UI ownership across the named outcome; no real signalling. |
| host(): a linked phone whose WIRE dies is hosted again on the SAME code; the phone's own goodbye is final (R3-PHONE-3) (1033–1074) | 1045, 1047–1049, 1051–1054, 1056, 1059–1061, 1068, 1070–1071, 1073 | I.remoteActive:356–358 | Injected room/answer callbacks assert phase, transport and UI ownership across the named outcome; no real signalling. |
| a phone with no motion sensor is pedals and buttons only: it never blocks the local steering (1076–1090) | 1081–1084, 1086, 1089 | I.setSteerMode:2021–2036; I.remoteActive:356–358; I.remoteSteers:362–362; I.throttle:1867–1869; I.debugState:2476–2480; I.steer:1813–1816 | Real phone/input math through deterministic transport or explicit callback injection; observes the named values/edges and cleanup. |
| pad(): SCAN reads the game's QR in the page, fills the code and connects; a refused camera says so (1092–1124) | 1105, 1107–1108, 1112–1114, 1117–1119, 1123 | P.pad:647–1205 | Synthetic DOM contacts/keys/timers observe transmitted state and cleanup for the named gesture. |
| link(): the phone's focus wears .pad-ring (a browser may not draw it), until a real key or pointer takes over (1126–1160) | 1147, 1149, 1151, 1153, 1155, 1157, 1159 | P.link:221–308; P.padSession:488–590 | Real phone/input math through deterministic transport or explicit callback injection; observes the named values/edges and cleanup. |
| controller.html carries exactly the manifest's CONTROLLER subset and both roll ends load TiltRoll (1166–1244) | 1170–1175, 1177–1180, 1185–1189, 1192–1196, 1200–1202, 1205–1212, 1217, 1219, 1221–1225, 1232, 1234, 1238, 1240, 1242–1243 | PhonePad (P), Input (I), TiltRoll (T), PlatformSession (S) | Static manifest/order/staging/door/camera/layout/gesture/importmap/ID agreement; not live page interaction. |
| controller.html's pre-paint look gives a fresh phone the GAME's defaults (R3-PHONE-7) (1246–1267) | 1252, 1263–1266 | PhonePad (P), Input (I), TiltRoll (T), PlatformSession (S) | Runs pre-paint script with empty/saved storage and pins four game default choices. |
| the Android shell holds a permission for every device API the web code calls (R3-ARCHITECTURE-12) (1269–1277) | 1274–1276 | PhonePad (P), Input (I), TiltRoll (T), PlatformSession (S) | Manifest declares VIBRATE/CAMERA; not runtime Android grant/use. |
| host cancellation wins over a late answer, successful or rejected (1279–1291) | 1287–1289 | PhonePad (P), Input (I), TiltRoll (T), PlatformSession (S) | Injected room/answer callbacks assert phase, transport and UI ownership across the named outcome; no real signalling. |
| host closes a room that arrives after cancellation and ignores its late failure (1293–1303) | 1298, 1301–1302 | PhonePad (P), Input (I), TiltRoll (T), PlatformSession (S) | Injected room/answer callbacks assert phase, transport and UI ownership across the named outcome; no real signalling. |
| closed phone sessions ignore late packets and open callbacks (1305–1319) | 1317 | P.link:221–308; P.padSession:488–590; P.encodeSample:69–73; P.encodeHud:88–93; P.encodeHaptic:114–114 | Real phone/input math through deterministic transport or explicit callback injection; observes the named values/edges and cleanup. |
| a phone connecting before hostRoom returns still closes the late room without losing the link (1321–1329) | 1325, 1327–1328 | PhonePad (P), Input (I), TiltRoll (T), PlatformSession (S) | Real phone/input math through deterministic transport or explicit callback injection; observes the named values/edges and cleanup. |
| PlatformSession: out of a race (no player) the dash still goes out, so the phone shows its MENU PAD (1331–1360) | 1349, 1353, 1355, 1358 | P.decodeHud:94–98; P.encodeHud:88–93; P.paintHud:600–638 | Real platform module with host/load stubs asserts sampler, camera or attempt replacement ownership. |
| an XR stick steers directly: no tilt filter lag, and lamp 1's calibrate cannot capture it (1364–1378) | 1368–1369, 1372, 1374–1375, 1377 | I.remoteSample:369–409; I.remoteSteers:362–362; I.steer:1813–1816; I.calibrate:335–343; I.debugState:2476–2480; I.remoteLost:454–458 | Real phone/input math through deterministic transport or explicit callback injection; observes the named values/edges and cleanup. |
| phone samples bunched into one millisecond still reach the filter (1380–1391) | 1390 | I.remoteSample:369–409; I.steer:1813–1816 | Real phone/input math through deterministic transport or explicit callback injection; observes the named values/edges and cleanup. |
| XR from a cold start: the first injected stick sample is finite all the way through Input (1396–1436) | 1410, 1412–1413, 1415–1419, 1424, 1426, 1432, 1435 | I.steer:1813–1816; I.throttleLevel:1880–1885; I.brakeLevel:1886–1891; I.lookingBack:1951–1951; I.remoteLost:454–458; I.poll:1856–1865 | Real phone/input math through deterministic transport or explicit callback injection; observes the named values/edges and cleanup. |
| wheel pedal axes never feed onboard free-look; an ordinary right stick still does (1438–1465) | 1452, 1455–1456, 1460, 1464 | I.setPadAxisMap:708–737; I.poll:1856–1865; I.throttleLevel:1880–1885; I.brakeLevel:1886–1891 | Real phone/input math through deterministic transport or explicit callback injection; observes the named values/edges and cleanup. |
| PlatformSession: STOP cancels a pending phone load and a fresh attempt owns its host (1467–1497) | 1480–1481, 1483, 1486–1487, 1489–1490, 1492–1494, 1496 | PhonePad (P), Input (I), TiltRoll (T), PlatformSession (S) | Real platform module with host/load stubs asserts sampler, camera or attempt replacement ownership. |
| host(): private relay swaps one offer/answer and the linked phone can drive (1499–1520) | 1508–1514, 1518–1519 | P.padUrl:146–155; P.encodeSample:69–73; I.throttleLevel:1880–1885; I.remoteActive:356–358 | Injected room/answer callbacks assert phase, transport and UI ownership across the named outcome; no real signalling. |
| host(): cancelling a private exchange ignores a late answer and closes the transport (1522–1532) | 1529, 1531 | PhonePad (P), Input (I), TiltRoll (T), PlatformSession (S) | Injected room/answer callbacks assert phase, transport and UI ownership across the named outcome; no real signalling. |
| host(): expired private pairing clears the QR and frees a fresh attempt (1534–1558) | 1541–1542, 1545–1550, 1554–1556 | PhonePad (P), Input (I), TiltRoll (T), PlatformSession (S) | Injected room/answer callbacks assert phase, transport and UI ownership across the named outcome; no real signalling. |
| host(): private exchange and unreadable-answer failures release their transport (1560–1571) | 1567–1569 | PhonePad (P), Input (I), TiltRoll (T), PlatformSession (S) | Injected room/answer callbacks assert phase, transport and UI ownership across the named outcome; no real signalling. |
| phone wake lock is released on pairing failure, including acquisition arriving after failure (1610–1623) | 1618, 1620–1621 | PhonePad (P), Input (I), TiltRoll (T), PlatformSession (S) | Explicit promise/event ordering asserts acquisition release and current-attempt ownership; no OS sentinel. |
| phone disconnect releases its lock; stale release events cannot clear a reconnect's lock (1625–1636) | 1629, 1633–1635 | PhonePad (P), Input (I), TiltRoll (T), PlatformSession (S) | Real phone/input math through deterministic transport or explicit callback injection; observes the named values/edges and cleanup. |
| page exit cancels pending pairing; its late lock and answer cannot affect a fresh connection (1638–1651) | 1643, 1647–1650 | PhonePad (P), Input (I), TiltRoll (T), PlatformSession (S) | Explicit promise/event ordering asserts acquisition release and current-attempt ownership; no OS sentinel. |
| the phone names which end died and re-dials the same code after its own wire drops (R3-PHONE-3) (1653–1683) | 1665, 1668–1669, 1673–1674, 1676, 1679, 1681 | PhonePad (P), Input (I), TiltRoll (T), PlatformSession (S) | Real phone/input math through deterministic transport or explicit callback injection; observes the named values/edges and cleanup. |
| a refused wake lock does not block pairing or reacquisition on visibility return (1685–1692) | 1688, 1691 | PhonePad (P), Input (I), TiltRoll (T), PlatformSession (S) | Explicit promise/event ordering asserts acquisition release and current-attempt ownership; no OS sentinel. |
| a transport closing during controller session setup cannot strand its wake lock or reconnect (1694–1701) | 1696, 1698–1700 | PhonePad (P), Input (I), TiltRoll (T), PlatformSession (S) | Explicit promise/event ordering asserts acquisition release and current-attempt ownership; no OS sentinel. |
| host recovery timing comes only from actual public subscription and clears on cancel (1703–1716) | 1708–1709, 1711–1713, 1715 | PhonePad (P), Input (I), TiltRoll (T), PlatformSession (S) | Injected room/answer callbacks assert phase, transport and UI ownership across the named outcome; no real signalling. |
| PlatformSession MAKE NEW CODE cancels the current owner before replacement and private relay has no countdown (1718–1734) | 1729–1730, 1732 | PhonePad (P), Input (I), TiltRoll (T), PlatformSession (S) | Real platform module with host/load stubs asserts sampler, camera or attempt replacement ownership. |
| host(): an expired pairing room takes the QR down, says so for a phone, and frees the button (#2198) (1738–1751) | 1742, 1744–1749 | PhonePad (P), Input (I), TiltRoll (T), PlatformSession (S) | Injected room/answer callbacks assert phase, transport and UI ownership across the named outcome; no real signalling. |
| phone: a failed re-dial is retried on a backoff, and links with no CONNECT tap (#2198) (1756–1792) | 1769, 1771–1772, 1774–1775, 1777, 1784, 1787–1788, 1790 | PhonePad (P), Input (I), TiltRoll (T), PlatformSession (S) | Real phone/input math through deterministic transport or explicit callback injection; observes the named values/edges and cleanup. |
| phone hold controls accept Space and Enter without cancelling another held contact (1794–1823) | 1801, 1804, 1807, 1809, 1812, 1814, 1818, 1820 | P.pad:647–1205 | Synthetic DOM contacts/keys/timers observe transmitted state and cleanup for the named gesture. |
| requestSensor attaches deviceorientation once across arm + connect (D·W18d) (1825–1868) | 1851–1855, 1857, 1860–1861 | P.pad:647–1205; P.encodeHello:115–115 | Synthetic DOM contacts/keys/timers observe transmitted state and cleanup for the named gesture. |
| phone touch steering restores the remaining held arrow and ignores old-key repeats (1870–1906) | 1881, 1884, 1887, 1892, 1894, 1896, 1898, 1902, 1904 | P.pad:647–1205; P.encodeHello:115–115 | Synthetic DOM contacts/keys/timers observe transmitted state and cleanup for the named gesture. |
| last-touch fallback releases fingers while preserving keyboard pedals and steering (1908–1943) | 1927, 1929–1932, 1936 | P.pad:647–1205; P.encodeHello:115–115 | Synthetic DOM contacts/keys/timers observe transmitted state and cleanup for the named gesture. |
| menu stick releases outside its target when pointer capture is refused (1945–1974) | 1960, 1962, 1964–1966 | P.pad:647–1205 | Synthetic DOM contacts/keys/timers observe transmitted state and cleanup for the named gesture. |
| menu stick survives WebKit capture transfer but releases when hidden (1976–2012) | 1989, 1992–1994, 1996, 1998–1999, 2002, 2005 | P.pad:647–1205 | Synthetic DOM contacts/keys/timers observe transmitted state and cleanup for the named gesture. |
| phone controls ignore secondary mouse presses while keeping primary and touch input (2014–2035) | 2022–2026, 2030, 2032 | P.pad:647–1205 | Synthetic DOM contacts/keys/timers observe transmitted state and cleanup for the named gesture. |
| continuous input keeps the 15 ms cap: slides coalesce into the next pump, edges go at once (audit4 UB4/UB5) (2037–2057) | 2045, 2047, 2049, 2051, 2053, 2055–2056 | P.padSession:488–590; P.decodeSample:74–84 | Synthetic DOM contacts/keys/timers observe transmitted state and cleanup for the named gesture. |
| touch steering: strip width read once per gesture, aria-valuenow an integer percent (audit4 UB4) (2059–2084) | 2072, 2076–2080, 2082 | P.pad:647–1205; P.encodeHello:115–115 | Synthetic DOM contacts/keys/timers observe transmitted state and cleanup for the named gesture. |

## tests/unit/phone-recorder.test.mjs

Fixture/setup: renderRate (23–27) loads real RenderRate; load (29–33) evaluates recorder with supplied globals. fakeEnv (35–44) supplies monotonic/wall clocks, numeric samples and memory storage. Device Farm declarations are source-extracted into a fake-rAF VM (122–148); download tests supply Blob/File, anchors and URL providers.

Scope/limits: Synthetic cadence and gate approvals are not GPU/display presentation or real device throughput; share, clipboard and download APIs are injected.

| Case name and range | Assertion spans | Production target | Meaning / limits |
|---|---|---|---|
| nothing runs until start() (46–54) | 51–53 | R.create:200–303 | Hand-stepped recorder state/clock and stored JSON assert the named cadence, cap or serialization contract. |
| start captures facts once, then samples on 2048 frames and on the 2 min timer (56–75) | 60–62, 66–68, 70–71, 73–74 | R.create:200–303 | Hand-stepped recorder state/clock and stored JSON assert the named cadence, cap or serialization contract. |
| a 30 Hz page (Low Power Mode) reads as 30 Hz (77–85) | 84 | R.create:200–303 | Hand-stepped recorder state/clock and stored JSON assert the named cadence, cap or serialization contract. |
| phone recordings distinguish rAF callbacks from forced render-gate rates and auto halving (87–105) | 96–103 | R.create:200–303 | Hand-stepped recorder state/clock and stored JSON assert the named cadence, cap or serialization contract. |
| phone recordings retain render-rate transitions and identify counter resets (107–119) | 113–114, 117–118 | R.create:200–303 | Hand-stepped recorder state/clock and stored JSON assert the named cadence, cap or serialization contract. |
| Device Farm rAF samplers label callback cadence and retain gate counters at forced rates (121–150) | 142–148 | PhoneRecorder (R), RenderRate, tools/perf/devicefarm-iphone.mjs | Runs all three extracted rAF samplers at off/30/45 gate modes while callback cadence remains 60Hz. |
| serialize is valid JSON, mirrored to storage after each sample, and re-adoptable (152–168) | 158–163, 165–167 | R.create:200–303 | Hand-stepped recorder state/clock and stored JSON assert the named cadence, cap or serialization contract. |
| a long soak is capped, not unbounded (170–178) | 176–177 | R.create:200–303 | Hand-stepped recorder state/clock and stored JSON assert the named cadence, cap or serialization contract. |
| numericLeaves keeps numbers and booleans, flattens one level, drops strings (180–184) | 183 | R.numericLeaves:68–80 | Hand-stepped recorder state/clock and stored JSON assert the named cadence, cap or serialization contract. |
| live readers never throw without the game and never touch the GPU timer (186–199) | 190–192, 196–198 | R.liveEnv:185–197 | Injected module getters expose read-only sampled metadata; lexical const reachability is exercised. |
| live sample reads PerfGov and GLX but writes neither (201–217) | 211–216 | PhoneRecorder (R), RenderRate, tools/perf/devicefarm-iphone.mjs | Injected module getters expose read-only sampled metadata; lexical const reachability is exercised. |
| share: files via navigator.share, download fallback, cancel is not an error (219–237) | 223–225, 227, 232–234, 236 | R.share:331–345 | Injected browser API success/refusal/cancellation and resource lifetime paths; no system chooser. |
| copy: clipboard first, textarea + execCommand second (239–252) | 242–243, 249–251 | R.copy:346–364 | Injected browser API success/refusal/cancellation and resource lifetime paths; no system chooser. |
| file name carries the start stamp; how-to is six lines (254–258) | 256–257 | R.fileName:306–309 | Hand-stepped recorder state/clock and stored JSON assert the named cadence, cap or serialization contract. |
| quick mode records facts and stops itself at 30 s with start and stop samples only (260–274) | 269–273 | R.create:200–303 | Hand-stepped recorder state/clock and stored JSON assert the named cadence, cap or serialization contract. |
| each live sample carries the renderer path and per-subsystem span ms (276–284) | 280–281, 283 | PhoneRecorder (R), RenderRate, tools/perf/devicefarm-iphone.mjs | Injected module getters expose read-only sampled metadata; lexical const reachability is exercised. |
| reads game modules that are top-level consts, not window properties (the real page shape) (286–300) | 293, 296–299 | R.liveEnv:185–197 | Injected module getters expose read-only sampled metadata; lexical const reachability is exercised. |
| repeated recorder downloads release superseded blobs and keep the current link valid (302–328) | 313–320, 324, 326–327 | R.download:314–328 | Injected browser API success/refusal/cancellation and resource lifetime paths; no system chooser. |

## tests/unit/phone-touch-surface.test.mjs

Fixture/setup: CSS source/rule helpers and cached parsed styles (53–70); scans physical css/*.css for hover and merged source for declaration checks. makeDom executes inline shell scripts (331–379). bootInput (438–467) runs real input stack with explicit sensor permissions, pad list, clock, logger, intervals and mini nodes. paintedLabelPx (710–713) is a test-side arithmetic model.

Scope/limits: Authored CSS and arithmetic do not measure computed layout, actual safe areas, device tap delivery or screenshots. Header 29–47 explicitly leaves collision/portrait geometry/device activation concerns for device evidence. Hover fine-pointer exceptions: race-setup.css and dialogs.css.

| Case name and range | Assertion spans | Production target | Meaning / limits |
|---|---|---|---|
| the portrait blocker's buttons sit on the touch rung, not the 24px WCAG floor (74–88) | 77–78, 81–83, 85, 87 | CSS/shell (C), Input (I) | Parsed declaration/source contract for the named selectors/tokens; does not measure rendered geometry or hardware behavior. |
| the dock's tap rungs clear 44px at both width tiers (90–146) | 93, 96–97, 105–108, 111–112, 118–121, 124–125, 127, 129–133, 135, 137–140, 145 | CSS/shell (C), Input (I) | Parsed declaration/source contract for the named selectors/tokens; does not measure rendered geometry or hardware behavior. |
| buttons-mode modifier taps ride the hold rung like pedals and steer (148–164) | 150–152, 157–163 | CSS/shell (C), Input (I) | Parsed declaration/source contract for the named selectors/tokens; does not measure rendered geometry or hardware behavior. |
| fixed ladder uses 12px --btn-gap so AERO / OT / BOOST do not merge (166–171) | 168–170 | CSS/shell (C), Input (I) | Parsed declaration/source contract for the named selectors/tokens; does not measure rendered geometry or hardware behavior. |
| the tallest dock column fits a 390px landscape phone at HUD SIZE 200 %, and fitHud's cap is wired as the net (175–230) | 182, 185, 187, 196, 200–201, 205–206, 211–213, 219–221, 223, 225–226 | CSS/shell (C), Input (I) | CSS ladder arithmetic checks tilt at 100/150/200%, buttons at 100/150% and source-wired fit cap; not overlap-free geometry. |
| every anchor inside a --hud-z zoom divides its safe-area inset by --hud-z (234–254) | 237, 239, 253 | CSS/shell (C), Input (I) | Parsed declaration/source contract for the named selectors/tokens; does not measure rendered geometry or hardware behavior. |
| every :hover rule in css/ is gated on (hover: hover) — a tap sticks :hover on iOS (258–275) | 273–274 | CSS/shell (C), Input (I) | Parsed declaration/source contract for the named selectors/tokens; does not measure rendered geometry or hardware behavior. |
| JS hover-only UI skips touch / (hover: none) so a tap does not latch a tooltip (277–286) | 279–282, 284–285 | CSS/shell (C), Input (I) | Parsed declaration/source contract for the named selectors/tokens; does not measure rendered geometry or hardware behavior. |
| every scroll container contains its overscroll (no chaining into the page behind) (288–298) | 297 | CSS/shell (C), Input (I) | Parsed declaration/source contract for the named selectors/tokens; does not measure rendered geometry or hardware behavior. |
| double-tap zoom is refused while menu pinch remains native and driving owns its gestures (300–329) | 303–304, 316–321, 323–328 | CSS/shell (C), Input (I) | Parsed declaration/source contract for the named selectors/tokens; does not measure rendered geometry or hardware behavior. |
| rapid control taps keep their native click while background double taps are guarded (331–356) | 344–345, 351–352, 354–355 | CSS/shell (C), Input (I) | Executes actual inline shell guard against mini-DOM events and inspects preventDefault; native delivery unmeasured. |
| Safari GestureEvents keep menu pinch zoom and are cancelled on the game and HUD (358–379) | 372–373, 375–376, 378 | CSS/shell (C), Input (I) | Executes actual inline shell guard against mini-DOM events and inspects preventDefault; native delivery unmeasured. |
| in-race chrome and the blocker are anchored inside the safe area (381–409) | 384–385, 387–388, 391–392, 394, 398, 404–408 | CSS/shell (C), Input (I) | Parsed declaration/source contract for the named selectors/tokens; does not measure rendered geometry or hardware behavior. |
| non-HUD menu hosts pad with the safe-area tokens (411–433) | 414, 418, 425–429, 431–432 | CSS/shell (C), Input (I) | Parsed declaration/source contract for the named selectors/tokens; does not measure rendered geometry or hardware behavior. |
| local tilt releases on blur and hide until a fresh reading, preserving its calibrated centre (469–492) | 482, 486–490 | I.setSteerMode:2021–2036; I.requestGyro:289–325; I.steer:1813–1816; I.calibrate:335–343; I.tiltActive:345–347; I.debugState:2476–2480 | Real Input in VM; explicit event, permission promise, clock and pad-list transitions assert the named ownership/neutral state. |
| a stalled local sensor expires even when invalid events keep arriving, and restarts on a fresh sample (494–510) | 499, 501, 505–506, 508–509 | I.setSteerMode:2021–2036; I.requestGyro:289–325; I.calibrate:335–343; I.steer:1813–1816; I.tiltActive:345–347 | Real Input in VM; explicit event, permission promise, clock and pad-list transitions assert the named ownership/neutral state. |
| obsolete gyro permission outcomes cannot reattach a sensor or mutate a newer attempt (512–534) | 519, 521–524, 528–532 | I.setSteerMode:2021–2036; I.requestGyro:289–325; I.debugState:2476–2480 | Real Input in VM; explicit event, permission promise, clock and pad-list transitions assert the named ownership/neutral state. |
| requestGyro: a grant clears an earlier refusal, and leaving tilt detaches the sensor (536–559) | 541–543, 546–550, 553–554, 556–558 | I.setSteerMode:2021–2036; I.requestGyro:289–325 | Real Input in VM; explicit event, permission promise, clock and pad-list transitions assert the named ownership/neutral state. |
| requestGyro: an explicit iOS "denied" is a refusal with nothing attached (561–567) | 564–566 | I.setSteerMode:2021–2036; I.requestGyro:289–325 | Real Input in VM; explicit event, permission promise, clock and pad-list transitions assert the named ownership/neutral state. |
| requestGyro without the iOS permission API attaches straight away; without the sensor it refuses (569–578) | 572–574, 576–577 | I.setSteerMode:2021–2036; I.requestGyro:289–325 | Real Input in VM; explicit event, permission promise, clock and pad-list transitions assert the named ownership/neutral state. |
| gamepaddisconnected re-reads the live list: a second pad keeps the pad path connected (580–593) | 586, 589, 592 | CSS/shell (C), Input (I) | Real Input in VM; explicit event, permission promise, clock and pad-list transitions assert the named ownership/neutral state. |
| requestGyro: only a RESOLVED refusal (or no sensor API) is hard-denied; a rejected call is transient (595–619) | 605–608, 610–611, 613–615, 617–618 | I.setSteerMode:2021–2036; I.requestGyro:289–325 | Real Input in VM; explicit event, permission promise, clock and pad-list transitions assert the named ownership/neutral state. |
| a gamepad without the standard mapping is logged once, and never remapped (621–636) | 627, 629–630, 635 | I.poll:1856–1865 | Real Input in VM; explicit event, permission promise, clock and pad-list transitions assert the named ownership/neutral state. |
| HUD: OFF on touch hides the readouts but keeps the driving controls (hunt3 7-F2) (638–656) | 654–655 | CSS/shell (C), Input (I) | Parsed declaration/source contract for the named selectors/tokens; does not measure rendered geometry or hardware behavior. |
| final pad disconnect neutralizes free look immediately and through recovery probes (658–667) | 662, 664, 666 | I.poll:1856–1865; I.lookStick:1958–1958 | Real Input in VM; explicit event, permission promise, clock and pad-list transitions assert the named ownership/neutral state. |
| opt-in input debug readout names live and stale remote pedal ownership (670–680) | 673, 675–676, 678–679 | I.remoteSample:369–409 | Real Input in VM; explicit event, permission promise, clock and pad-list transitions assert the named ownership/neutral state. |
| an empty pad poll clears free look without requiring a disconnect event (683–689) | 687–688 | I.poll:1856–1865; I.lookStick:1958–1958 | Real Input in VM; explicit event, permission promise, clock and pad-list transitions assert the named ownership/neutral state. |
| a spare pad disconnect preserves held action edge baselines (691–700) | 697, 699 | I.poll:1856–1865; I.consumeCameraCycle:1923–1927 | Real Input in VM; explicit event, permission promise, clock and pad-list transitions assert the named ownership/neutral state. |
| dock touch labels keep a 10 CSS-px painted floor under --hud-z-dock (715–766) | 718–719, 722–725, 728–731, 734–736, 739–740, 743, 745, 750–751, 754–755, 762–765 | CSS/shell (C), Input (I) | Source tokens plus test-side formula bound painted label text at 10px for listed zoom/font matrix; no computed box. |

Shared assertions outside test bodies: px helper 68 and rung helper 70 validate literal token shapes; their failures participate in callers.

## tests/unit/photo-kit.test.mjs

Fixture/setup: load (12–21) executes real PhotoKit with clamp/logger; memStore (23–30) is a Map-backed get/set store. Look-session tests use plain state/setter; mount test uses hand-built elements/listeners.

Scope/limits: Pure camera metadata, storage and DOM protocol only; DoF is an overlay hint, not a rendered optical-depth assertion. Wiring cases are text checks.

| Case name and range | Assertion spans | Production target | Meaning / limits |
|---|---|---|---|
| nextGrid cycles off → thirds → golden → off (32–37) | 34–36 | K.nextGrid:69–72 | Real PhotoKit against memory/setter/DOM stubs; asserts the named state, ordering or bounded catalog. |
| saveMark / marksFor round-trip per track, capped at MAX_MARKS (39–55) | 52–54 | K.saveMark:39–56; K.marksFor:32–36 | Real PhotoKit against memory/setter/DOM stubs; asserts the named state, ordering or bounded catalog. |
| applyDof writes cam.dof and drives overlay CSS vars (57–74) | 67–71, 73 | K.applyDof:122–137 | Real PhotoKit against memory/setter/DOM stubs; asserts the named state, ordering or bounded catalog. |
| free-cam.js wires GRID / SAVE MARK / DoF controls (76–82) | 78–81 | PhotoKit (K), free-cam.js, PhotoStudio (F) | Source-presence wiring guard only; no execution of enclosing free-camera/Studio lifetime. |
| named bookmarks remain independently reachable after deleting a selected older mark (84–95) | 88, 90, 92, 94 | K.saveMark:39–56; K.marksFor:32–36; K.deleteMark:58–67 | Real PhotoKit against memory/setter/DOM stubs; asserts the named state, ordering or bounded catalog. |
| photo looks expose the six named free-camera presets (97–104) | 99–103 | PhotoKit (K), free-cam.js, PhotoStudio (F) | Real PhotoKit against memory/setter/DOM stubs; asserts the named state, ordering or bounded catalog. |
| applying looks then ending the session restores the exact lighting snapshot (106–128) | 120–127 | K.createLookSession:75–95 | Real PhotoKit against memory/setter/DOM stubs; asserts the named state, ordering or bounded catalog. |
| look sessions never persist and an unknown preset changes nothing (130–141) | 138–140 | K.createLookSession:75–95 | Unknown look leaves state unchanged and active null; no persistence backend is actually exercised. |
| mountLookControls lists every preset in the free-camera panel (143–161) | 155–157, 159–160 | K.mountLookControls:97–119 | Real PhotoKit against memory/setter/DOM stubs; asserts the named state, ordering or bounded catalog. |
| Photo Studio binds looks to free-camera lifetime so exit restores the snapshot (163–169) | 165–168 | PhotoKit (K), free-cam.js, PhotoStudio (F) | Source-presence wiring guard only; no execution of enclosing free-camera/Studio lifetime. |

## tests/unit/photo-studio.test.mjs

Fixture/setup: boot (11–82) uses makeDom, real SettingRow and PhotoStudio, stub FreeCam/garage/Tracks/light setters, fake 2D canvas, pixels/bitmap and optional NativeDownload/IndexedDB. photoDb (116–169) serializes transactions, stages writes and injects enqueue/request/commit failures; seededPhotos/plain/turn (170–172). teamLooks (678–691) extracts real setup-sheet lookRowSpecs over stateful scene stubs; final case loads actual garage catalogs.

Scope/limits: CPU/mini-DOM behavior; fake pixels and encoders do not establish renderer quality. Simulated serialized DB transactions do not prove real multi-tab IndexedDB; native chooser, browser focus timing and visual layout remain browser/device gates.

| Case name and range | Assertion spans | Production target | Meaning / limits |
|---|---|---|---|
| Home circuit photo borrows a subject, places its complete pose, and returns ownership (84–111) | 92, 98, 100–102, 104, 107–108, 110 | F.open:448–491; F.hasCar:415–415; F.close:492–508 | Real Studio with mini-DOM and injected storage/camera/export dependencies observes the named state and cleanup. |
| centre crops preserve composition across aspect ratios and filenames stay safe (173–179) | 175–178 | F.crop:15–19; F.filename:14–14 | Real Studio with mini-DOM and injected storage/camera/export dependencies observes the named state and cleanup. |
| capture draws before reading a live backbuffer, omits DOM overlays and downloads actual image (180–188) | 181–187 | F.open:448–491; F.capture:638–647; F.state:733–733; F.exportPhoto:648–655; F.close:492–508 | Injected readback/presentation/encoding and operation ordering assert session-safe composition; no renderer hardware. |
| native photo export awaits the share outcome and reports a cancelled or failed download (189–211) | 198–204, 207, 209 | F.open:448–491; F.capture:638–647; F.exportPhoto:648–655; F.state:733–733 | Real Studio with mini-DOM and injected storage/camera/export dependencies observes the named state and cleanup. |
| library DOWNLOAD shares the in-flight guard with PNG export and permits retry after a cancelled share (213–229) | 222–223, 225, 227–228 | F.open:448–491; F.capture:638–647; F.savePhoto:656–671; F.exportPhoto:648–655 | Real Studio with mini-DOM and injected storage/camera/export dependencies observes the named state and cleanup. |
| closing and reopening during a photo export stays usable and ignores stale completion feedback (231–246) | 240, 242–243, 245 | F.open:448–491; F.capture:638–647; F.exportPhoto:648–655; F.close:492–508; F.state:733–733 | Real Studio with mini-DOM and injected storage/camera/export dependencies observes the named state and cleanup. |
| #3656: a live view below native resolution captures at renderScale 1, then restores the live scale (247–264) | 254–255, 257–258, 262–263 | F.open:448–491; F.capture:638–647; F.state:733–733 | Injected readback/presentation/encoding and operation ordering assert session-safe composition; no renderer hardware. |
| software presentation is awaited while raw pixels are captured before compositing (265–274) | 271–273 | F.open:448–491; F.capture:638–647 | Injected readback/presentation/encoding and operation ordering assert session-safe composition; no renderer hardware. |
| a backend without readback falls back to an immediate canvas copy (275–281) | 278–280 | F.open:448–491; F.capture:638–647 | Injected readback/presentation/encoding and operation ordering assert session-safe composition; no renderer hardware. |
| closing while readback is pending prevents an obsolete capture entering a reopened studio (282–287) | 286 | F.open:448–491; F.capture:638–647; F.close:492–508; F.state:733–733 | Injected readback/presentation/encoding and operation ordering assert session-safe composition; no renderer hardware. |
| a delayed save retains its original photo and cannot clear a reopened capture's busy state (288–304) | 298–300, 303 | F.open:448–491; F.capture:638–647; F.savePhoto:656–671; F.close:492–508; F.state:733–733 | Injected readback/presentation/encoding and operation ordering assert session-safe composition; no renderer hardware. |
| garage camera snapshot is restored and a borrowed FreeCam returns only on normal exit (305–312) | 307, 310–311 | F.open:448–491; F.close:492–508 | Real Studio with mini-DOM and injected storage/camera/export dependencies observes the named state and cleanup. |
| pre-existing photo mode keeps its pose on normal exit (313–316) | 315 | F.open:448–491; F.close:492–508 | Real Studio with mini-DOM and injected storage/camera/export dependencies observes the named state and cleanup. |
| DONE paints a busy state before restoring the scene (Escape door stays live) (317–343) | 326–333, 336, 338–342 | F.open:448–491; F.close:492–508; F.state:733–733 | Queued fake frames/microtasks exercise close/focus generation guards and enabled Escape door; no browser paint. |
| DONE waits until after the caller's first restored paint before focusing (344–362) | 352, 355–356, 358–359, 361 | F.open:448–491; F.close:492–508 | Queued fake frames/microtasks exercise close/focus generation guards and enabled Escape door; no browser paint. |
| queued opener focus cannot steal focus from a reopened Studio or a detached caller (363–376) | 368, 372, 375 | F.open:448–491; F.close:492–508 | Queued fake frames/microtasks exercise close/focus generation guards and enabled Escape door; no browser paint. |
| an import finishing after close is discarded and its bitmap is released (377–384) | 383 | F.open:448–491; F.close:492–508; F.state:733–733 | Real Studio with mini-DOM and injected storage/camera/export dependencies observes the named state and cleanup. |
| missing IndexedDB uses a visit-only library and localStorage quota failure remains recoverable (385–392) | 387–391 | F.open:448–491; F.capture:638–647; F.savePhoto:656–671; F.setBackground:23–30; F.state:733–733 | Real Studio with mini-DOM and injected storage/camera/export dependencies observes the named state and cleanup. |
| menu background stays inert unless Appearance Scene is My photo (395–414) | 401, 403–404, 406, 412–413 | F.open:448–491; F.capture:638–647; F.savePhoto:656–671; F.close:492–508 | Real Studio with mini-DOM and injected storage/camera/export dependencies observes the named state and cleanup. |
| failed PNG encoding reports a recoverable error instead of creating a bogus download (415–418) | 417 | F.open:448–491; F.capture:638–647; F.exportPhoto:648–655 | Real Studio with mini-DOM and injected storage/camera/export dependencies observes the named state and cleanup. |
| Studio uses canonical sheet regions and enumerated controls with a persistent capture/done footer (420–433) | 423–427, 429–430, 432 | F.open:448–491; F.state:733–733 | Injected readback/presentation/encoding and operation ordering assert session-safe composition; no renderer hardware. |
| Studio suspends a borrowed FreeCam's guides and restores them on returning to its owner (434–437) | 436 | F.open:448–491; F.close:492–508 | Real Studio with mini-DOM and injected storage/camera/export dependencies observes the named state and cleanup. |
| concurrent Studio saves in separate instances keep exactly six durable photos (439–448) | 444–447 | F.open:448–491; F.capture:638–647; F.savePhoto:656–671 | Serialized staged DB fixture distinguishes request success/commit; bounds six durable rows, rollback and session-safe feedback. |
| saving repairs a previously oversized library in the same transaction (449–454) | 452–453 | F.open:448–491; F.capture:638–647; F.savePhoto:656–671 | Serialized staged DB fixture distinguishes request success/commit; bounds six durable rows, rollback and session-safe feedback. |
| save remains busy and unannounced until the write transaction commits (455–462) | 458–459, 461 | F.open:448–491; F.capture:638–647; F.savePhoto:656–671; F.state:733–733 | Serialized staged DB fixture distinguishes request success/commit; bounds six durable rows, rollback and session-safe feedback. |
| put, prune, and commit failures roll back all durable changes and retain a visit-only photo (463–472) | 467–470 | F.open:448–491; F.capture:638–647; F.savePhoto:656–671; F.state:733–733 | Serialized staged DB fixture distinguishes request success/commit; bounds six durable rows, rollback and session-safe feedback. |
| equal timestamps prune deterministically by ID instead of request or enumeration order (474–478) | 477 | F.open:448–491; F.capture:638–647; F.savePhoto:656–671 | Serialized staged DB fixture distinguishes request success/commit; bounds six durable rows, rollback and session-safe feedback. |
| a committed save from a closed Studio retains its original metadata without touching a reopened session (479–489) | 486–487 | F.open:448–491; F.capture:638–647; F.savePhoto:656–671; F.close:492–508; F.state:733–733 | Serialized staged DB fixture distinguishes request success/commit; bounds six durable rows, rollback and session-safe feedback. |
| the SUBJECT row shows only when the door offers one, and hands the other pick back without changing anything itself (490–513) | 493–495, 497–500, 502, 504–505, 507–508, 510–511 | F.open:448–491; F.state:733–733; F.close:492–508 | Real Studio with mini-DOM and injected storage/camera/export dependencies observes the named state and cleanup. |
| leaks #1: closing the studio releases the composed canvas and its preview source (515–525) | 516–517, 520, 522–524 | F.open:448–491; F.capture:638–647; F.state:733–733; F.close:492–508; F.exportPhoto:648–655 | Real Studio with mini-DOM and injected storage/camera/export dependencies observes the named state and cleanup. |
| deferred capture keeps its requested composition; recrop retains the uncropped frame (527–545) | 535–537, 539, 541, 544 | F.open:448–491; F.capture:638–647; F.close:492–508 | Injected readback/presentation/encoding and operation ordering assert session-safe composition; no renderer hardware. |
| coaching is optional DOM content; presets cannot move a pending capture (547–556) | 551, 553, 555 | F.open:448–491; F.capture:638–647; F.close:492–508 | Injected readback/presentation/encoding and operation ordering assert session-safe composition; no renderer hardware. |
| contact sheet captures three sequential renderer frames and labels one bounded PNG (558–566) | 560–565 | F.contactSheet:742–756 | Injected readback/presentation/encoding and operation ordering assert session-safe composition; no renderer hardware. |
| contact sheet awaits native export success (568–592) | 577–581, 584, 587, 591 | F.contactSheet:742–756 | Three generated cases: success resolves true; write failure and share cancellation reject with the identical error after awaiting native save. |
| contact sheet awaits native export write failure (568–592) | 577–581, 584, 587, 591 | F.contactSheet:742–756 | Three generated cases: success resolves true; write failure and share cancellation reject with the identical error after awaiting native save. |
| contact sheet awaits native export share cancellation (568–592) | 577–581, 584, 587, 591 | F.contactSheet:742–756 | Three generated cases: success resolves true; write failure and share cancellation reject with the identical error after awaiting native save. |
| album exposes bounded safe read-only thumbnails and recovers with visit photos (594–602) | 596–599, 601 | F.album:734–741; F.open:448–491; F.capture:638–647; F.savePhoto:656–671 | Real Studio with mini-DOM and injected storage/camera/export dependencies observes the named state and cleanup. |
| Studio state exposes monotonic session generation across same-open reentry (604–609) | 606, 608 | F.open:448–491; F.state:733–733; F.close:492–508 | Real Studio with mini-DOM and injected storage/camera/export dependencies observes the named state and cleanup. |
| #1895: the Home title art does not paint over a live Photo Studio subject (611–615) | 613–614 | PhotoStudio (F), SettingRow; garage lookRowSpecs/catalogs | CSS text guard hides title art only for ready Home overlay while Studio is open. |
| Photo Lighting clones the profile store, writes via ltSet, and restores the exact original reference on close (617–640) | 620, 622–627, 630–632, 634–635, 638–639 | F.open:448–491; F.close:492–508 | Session previews clone/restore profile reference or exact time/weather/arc; garage visibility guards checked. |
| Photo Lighting stays out of the garage subject (642–647) | 645–646 | F.open:448–491 | Session previews clone/restore profile reference or exact time/weather/arc; garage visibility guards checked. |
| Time & weather preview changes the session live and every reset or close restores it, arc included (649–666) | 654, 656, 659–660, 662, 665 | F.open:448–491; F.close:492–508 | Session previews clone/restore profile reference or exact time/weather/arc; garage visibility guards checked. |
| Time & weather group stays out of the garage subject (668–673) | 671–672 | F.open:448–491 | Session previews clone/restore profile reference or exact time/weather/arc; garage visibility guards checked. |
| garage photo offers the Team tab's room, crew and lighting rows and writes the state the Team tab reads (692–720) | 697–700, 702–705, 710–711, 713–714, 716–717, 719 | F.open:448–491; F.close:492–508 | Real Team row specs/catalogs feed fake scene setters; selection persists and repaint callbacks are counted. |
| race and replay photo modes keep TIME & WEATHER and never show the garage rows (721–733) | 726, 728–729, 732 | F.open:448–491; F.close:492–508 | Real Team row specs/catalogs feed fake scene setters; selection persists and repaint callbacks are counted. |
| closing the studio drops the library rows; reopening repaints them (737–746) | 740, 742, 745 | F.open:448–491; F.capture:638–647; F.savePhoto:656–671; F.close:492–508 | Real Team row specs/catalogs feed fake scene setters; selection persists and repaint callbacks are counted. |
| all shipped garage styles and lighting remain shared by Team and both garage photo entry points (748–776) | 766–768, 772–773, 775 | F.open:448–491; F.close:492–508 | Real Team row specs/catalogs feed fake scene setters; selection persists and repaint callbacks are counted. |

teamLooks shared source-boundary assertion 681 runs for garage row/catalog cases. Contact-sheet native loop expands exactly three named cases; all other parameter loops stay within one registered test.

## tests/unit/photomode-hold.test.mjs

Fixture/setup: symbolSource and direct slices load syncRotateBlocker/tickBody from real game.js (30–96), with renderer/network/physics counters and render-rate stubs. boot (98–125) uses makeDom, real input stack and Photomode.create with mutable camera, key and pointer events.

Scope/limits: Extracted VM paths and synthetic event ownership; no browser capture implementation, keyboard default activation, real online simulation or rendering measured.

| Case name and range | Assertion spans | Production target | Meaning / limits |
|---|---|---|---|
| rotation never resurfaces the pause card over an active photo camera (30–40) | 38 | G.syncRotateBlocker:4277–4303 | Source-extracted game function executes ownership branches with explicit state/counters; no full game boot. |
| rotation keeps foreground Settings above Pause until Settings closes (42–67) | 53, 56–57, 60, 63, 66 | G.syncRotateBlocker:4277–4303 | Source-extracted game function executes ownership branches with explicit state/counters; no full game boot. |
| online Photo camera input integrates while shared physics continues; solo Photo holds physics (69–96) | 92–94 | G.tickBody:8502–8615; H.updatePhotoCam:51–86 | Source-extracted game function executes ownership branches with explicit state/counters; no full game boot. |
| Photo Studio buttons keep activation and arrows while WASD still flies and keyups release (127–148) | 133, 135, 137–138, 142–143, 146–147 | H.enterPhotoMode:87–101; H.updatePhotoCam:51–86; H.wirePhotoHold:225–245; H.photoKeyHandler:133–168 | Real Photomode/input with synthetic keys/pointers asserts alias/contact ownership; no browser native capture/default actions. |
| #pc-restore and Studio buttons keep Space activation on keydown AND keyup (#3562) (150–164) | 160, 162 | H.enterPhotoMode:87–101; H.wirePhotoHold:225–245; H.photoKeyHandler:133–168 | Real Photomode/input with synthetic keys/pointers asserts alias/contact ownership; no browser native capture/default actions. |
| either UP key can be released while its other physical alias keeps flying upward (166–179) | 174, 177 | H.enterPhotoMode:87–101; H.updatePhotoCam:51–86; H.wirePhotoHold:225–245; H.photoKeyHandler:133–168 | Real Photomode/input with synthetic keys/pointers asserts alias/contact ownership; no browser native capture/default actions. |
| either Shift can be released while the other keeps the photo camera boosted (181–193) | 191 | H.enterPhotoMode:87–101; H.updatePhotoCam:51–86; H.wirePhotoHold:225–245; H.photoKeyHandler:133–168 | Real Photomode/input with synthetic keys/pointers asserts alias/contact ownership; no browser native capture/default actions. |
| ignored Studio Space and stale alias keyups do not cancel a different held key (195–214) | 201, 204, 206, 209, 213 | H.enterPhotoMode:87–101; H.exitPhotoMode:102–119; H.updatePhotoCam:51–86; H.wirePhotoHold:225–245; H.photoKeyHandler:133–168 | Real Photomode/input with synthetic keys/pointers asserts alias/contact ownership; no browser native capture/default actions. |
| fly-cam UP hold survives the boundary pointerleave and a capture steal; a hidden button releases (216–234) | 221, 223, 225, 228, 231, 233 | H.wirePhotoHold:225–245; H.photoKeyHandler:133–168 | Real Photomode/input with synthetic keys/pointers asserts alias/contact ownership; no browser native capture/default actions. |
| opposite altitude holds cancel together and releasing either preserves the other pointer (236–246) | 241, 243–244 | H.wirePhotoHold:225–245; H.photoKeyHandler:133–168 | Real Photomode/input with synthetic keys/pointers asserts alias/contact ownership; no browser native capture/default actions. |

## tests/unit/physics-baseline-provenance.test.mjs

Fixture/setup: Reads committed baseline and baseline-blessing helper (26–36). landedOn (68–77) is test-local ancestry logic fed real git metadata or synthetic repeated-character commit IDs in mutation case.

Scope/limits: Metadata/integrity, not physical correctness or cryptographic authenticity. Hash is unkeyed. Missing git/history/boundary/shallow non-parent ancestry may explicitly skip; dirty baseline must stamp current HEAD. Reason test enforces type/length, timestamp parseability (not strict ISO syntax).

| Case name and range | Assertion spans | Production target | Meaning / limits |
|---|---|---|---|
| the baseline carries a _blessed stamp with a stated reason (38–43) | 39–42 | tests/helpers/baseline-blessing.mjs (B), baseline/spec/VM twin | Metadata/helper/static-reader integrity guard; no simulation or physical quality assertion. |
| the data hash matches — the numbers were written by the spec, not by hand (45–49) | 46–48 | tests/helpers/baseline-blessing.mjs (B), baseline/spec/VM twin | Recomputed unkeyed SHA256 detects data/stamp disagreement; cannot establish who wrote the values. |
| the blessing sha is a full commit id (51–53) | 52 | tests/helpers/baseline-blessing.mjs (B), baseline/spec/VM twin | Metadata/helper/static-reader integrity guard; no simulation or physical quality assertion. |
| the stamp names the tree the baseline was measured on (79–102) | 88, 101 | tests/helpers/baseline-blessing.mjs (B), baseline/spec/VM twin | Dirty HEAD equality or landing-parent/full-history ancestry; missing/boundary/shallow ambiguity explicitly skips. |
| a stale or copied stamp fails the landing check (mutation) (104–114) | 107–113 | tests/helpers/baseline-blessing.mjs (B), baseline/spec/VM twin | Metadata/helper/static-reader integrity guard; no simulation or physical quality assertion. |
| blessing() is what the writer stamps: hash over data only, reason verbatim (116–122) | 119–121 | tests/helpers/baseline-blessing.mjs (B), baseline/spec/VM twin | Stamp key set and data-only hash mutation are asserted; reason verbatim is described in title but not directly asserted. |
| neither reader of the baseline depends on the stamp: both iterate SCENARIOS by name (124–131) | 127–130 | tests/helpers/baseline-blessing.mjs (B), baseline/spec/VM twin | Metadata/helper/static-reader integrity guard; no simulation or physical quality assertion. |

## tests/unit/physics-characterization-vm.test.mjs

Fixture/setup: Single createGame Monza/dry boot (115–120), closed afterward. Nine literal scenarios (34–52), 6 base fields plus 4 wide/3 AI fields (53–56). browserScenarios (60–77) parses only serializable AST data. run (130–153) seeds/resets, stages input, steps 1/60 and rounds to 1e-4 every 15 stage steps; clears input.

Scope/limits: Exact agreement with stored Chromium trace at sampled/rounded fields only; no rendering, real-time scheduling or independent physics truth. This file must never regenerate the baseline.

| Case name and range | Assertion spans | Production target | Meaning / limits |
|---|---|---|---|
| the complete ordered scenario recipes match the browser spec (80–88) | 82–87 | tools/lib/game-vm.cjs, js/game.js updateCar/update, __apex hooks; browser spec and baseline | AST ordered recipe equality plus textual sampling/rounding/columns/factory-seat guards. |
| recipe parity detects changes invisible to scenario-name checks (90–104) | 95–96, 100, 103 | tools/lib/game-vm.cjs, js/game.js updateCar/update, __apex hooks; browser spec and baseline | Mutates duration, steer, offset, throttle, boost, weather, AI index and reverses recipe/stage order to prove parity sensitivity. |
| A3: characterization boot pins dry weather and zero wetness (122–128) | 123–127 | tools/lib/game-vm.cjs, js/game.js updateCar/update, __apex hooks; browser spec and baseline | VM dry enum, zero wetness/frame default and neutral tyre grip are asserted. |
| “straight-line accel” reproduces the browser baseline number for number (157–172) | 159, 161, 164, 167–168 | tools/lib/game-vm.cjs, js/game.js updateCar/update, __apex hooks; browser spec and baseline | Each named scenario compares every sampled rounded field and row width/count with committed baseline; first field mismatch reports context. |
| “steady corner load” reproduces the browser baseline number for number (157–172) | 159, 161, 164, 167–168 | tools/lib/game-vm.cjs, js/game.js updateCar/update, __apex hooks; browser spec and baseline | Each named scenario compares every sampled rounded field and row width/count with committed baseline; first field mismatch reports context. |
| “trail brake into rotation” reproduces the browser baseline number for number (157–172) | 159, 161, 164, 167–168 | tools/lib/game-vm.cjs, js/game.js updateCar/update, __apex hooks; browser spec and baseline | Each named scenario compares every sampled rounded field and row width/count with committed baseline; first field mismatch reports context. |
| “off-track recovery” reproduces the browser baseline number for number (157–172) | 159, 161, 164, 167–168 | tools/lib/game-vm.cjs, js/game.js updateCar/update, __apex hooks; browser spec and baseline | Each named scenario compares every sampled rounded field and row width/count with committed baseline; first field mismatch reports context. |
| “right-hand loaded corner” reproduces the browser baseline number for number (157–172) | 159, 161, 164, 167–168 | tools/lib/game-vm.cjs, js/game.js updateCar/update, __apex hooks; browser spec and baseline | Each named scenario compares every sampled rounded field and row width/count with committed baseline; first field mismatch reports context. |
| “boost and x-mode on the straight” reproduces the browser baseline number for number (157–172) | 159, 161, 164, 167–168 | tools/lib/game-vm.cjs, js/game.js updateCar/update, __apex hooks; browser spec and baseline | Each named scenario compares every sampled rounded field and row width/count with committed baseline; first field mismatch reports context. |
| “kerb strike” reproduces the browser baseline number for number (157–172) | 159, 161, 164, 167–168 | tools/lib/game-vm.cjs, js/game.js updateCar/update, __apex hooks; browser spec and baseline | Each named scenario compares every sampled rounded field and row width/count with committed baseline; first field mismatch reports context. |
| “ai car launch” reproduces the browser baseline number for number (157–172) | 159, 161, 164, 167–168 | tools/lib/game-vm.cjs, js/game.js updateCar/update, __apex hooks; browser spec and baseline | Each named scenario compares every sampled rounded field and row width/count with committed baseline; first field mismatch reports context. |
| “wet right-hand corner” reproduces the browser baseline number for number (157–172) | 159, 161, 164, 167–168 | tools/lib/game-vm.cjs, js/game.js updateCar/update, __apex hooks; browser spec and baseline | Each named scenario compares every sampled rounded field and row width/count with committed baseline; first field mismatch reports context. |

Shared assertions: browserScenarios property/literal parser 68, 71, 75; invoked by parity cases. Nine scenario expansions share assertion spans 159, 161, 164, 167–169 and execution recipe 130–153. Base 6 fields; wide adds yawRate/gear/aeroX/energy; AI launch adds ai.s/ai.x/ai.speed.

## tests/unit/physics-feel-vm.test.mjs

Fixture/setup: Single Monza VM boot with physics snapshot (27–30); fresh/startRace (33–39) restore tuning/headless state and pin pace. clearRoad retires rivals (41); straightFrac picks longest nonwrapping aero zone (43–48). Manual/auto case creates two additional preference-pinned VMs, closed in finally.

Scope/limits: Pinned Monza isolated-road short horizons and selected pace values. Manual test enforces a lower bound vs auto, not symmetric equality or arbitrary-track/gear coverage.

| Case name and range | Assertion spans | Production target | Meaning / limits |
|---|---|---|---|
| BOOST speeds the build-up by the same factor at every OVERALL SPEED (50–75) | 71–73 | js/game.js longitudinal/deploy/gear logic (L), real game-vm harness | Acceleration-time boost ratio >1.3 at pace .44/1.34 and ratios agree within 5%; energy held full and X disabled. |
| BOOST held through a brake neither drains the battery nor reads as deploying (77–99) | 92–93, 96–97 | js/game.js longitudinal/deploy/gear logic (L), real game-vm harness | Brake and brake+throttle never deploy or lose starting energy; gas-only control deploys and drains. |
| manual 8th reaches the same top speed as auto on a Monza straight (101–122) | 120–121 | js/game.js longitudinal/deploy/gear logic (L), real game-vm harness | Manual eighth after 8s must reach auto minus .5m/s; auto must exceed 61.5m/s; not exact equality. |

## tests/unit/physics-oracle.test.mjs

Fixture/setup: Imports real oracle helpers; creates scratch/oracle-test-* directory, removed by after (25–27). Synthetic GHOST (35–44) packs 40 samples with f64 steer, constant throttle, RLE brake, uint8 flags and explicit seed/state. CLI args use 30 physics steps/50 track rows; assertSame (50–53) compares byte buffers. Paths/blob URLs here are fixtures, not live endpoints.

Scope/limits: If run, fresh-process determinism on the same tree for short Monza horizons; not a comparison with the TypeScript port or proof of model correctness. This mapping did not invoke either CLI.

| Case name and range | Assertion spans | Production target | Meaning / limits |
|---|---|---|---|
| encodeNumber keeps what JSON drops (55–58) | 57 | tools/check/physics-oracle.mjs, tools/check/track-oracle.mjs (O), real game-vm | JSON replacer preserves -0/NaN/±Infinity and finite double identity. |
| unpackGhost decodes every packedV3 channel form (60–67) | 62–66 | tools/check/physics-oracle.mjs, tools/check/track-oracle.mjs (O), real game-vm | Dense-f64, constant, RLE and uint8 ghost channels decode at explicit boundaries. |
| physics-oracle: two runs, byte-identical traces (69–91) | 74–76, 78–82, 85–86, 88–90 | tools/check/physics-oracle.mjs, tools/check/track-oracle.mjs (O), real game-vm | Two fresh short CLI runs must match every output byte; recipe-derived files, header/hash, finite fields and ghost initial replay checked. |
| track-oracle: two runs, byte-identical grids (93–104) | 96–97, 99–103 | tools/check/physics-oracle.mjs, tools/check/track-oracle.mjs (O), real game-vm | Two fresh CLI runs byte-match 50-row Monza grid; arc spacing, five lateral fractions and wall/width availability checked. |

assertSame helper assertions 51–52 run for both CLI determinism cases; they compare file sets and each file buffer.

## Dependency identities

Hashes identify the mapping snapshot; only the ten test files above are claimed fully read.

| Source/dependency | SHA-256 |
|---|---|
| js/input/phone-pad.js | 0015e4767169ff8dde36e477303ae45deb2caaf2ccef51b5a03ba2140c5ec286 |
| js/input/input.js | cb7c8f371e27b0b5862fafc0327f896f80f778948e7a7778ea8380707c356de2 |
| js/input/tilt-roll.js | a5ca4a83926bd456d354e4433b112c88772ae02be12fd883f5427eeb88facd92 |
| js/ui/platform-session.js | a95c6d6cc78b4f9241e50f5bd1996f5dca89179471fc2a0415e6f8ebd3862658 |
| js/perf/phone-recorder.js | 26186b9dd46f6e14d9c34d27a708e4d2e4dc94b972e13a9c08d86cedec918017 |
| js/camera/photo-kit.js | f82eb10d7cc6f2427c231a539dc84e487986d11de9c4e23bf48fe8bc24dcfe53 |
| js/ui/photo-studio.js | 0500788578b2e2b2730d2c3344fe26be3550e7a1e4cf4c0f2b3b83e499889e9f |
| js/camera/photo-cam.js | a2cbe21c7affdd99fc0a444678a46372dc08a9036fe67b051bc2eb68e2b0db66 |
| js/game.js | 20990458b493b2cdf6633be6df1eae91c6b820068be48522788d09467130334d |
| tests/helpers/baseline-blessing.mjs | 39d0a5af068a3571ad638bc2757e6cbfc78bfbe742187d7047849777548834b4 |
| tools/check/physics-oracle.mjs | 25d1f9ff284d1b6624ace1a0dab7653a1482e554b7a03fc1d2cc2e0ff5559581 |
| tests/helpers/mini-dom.mjs | 3406f017e765ad4cfef78493aafa8da95846a0e1cb9d28b28a53abd2b296e5c1 |
| tests/helpers/css-rules.mjs | 31386fa434392a93826b1f8197b310378bf00eead431d10fd38a5130b9866a28 |
| tests/helpers/css-source.mjs | 434b8bcb5a8b1b7ff7e3d52b292f8d0a1726db49dbc655b85538bcb005df571a |
| tests/helpers/abs-src.mjs | f33a40d278e2ec7ab00571e2020304a9c21b300861bba501c799947560e32d47 |
| tests/helpers/game-source.mjs | 2128e7f89b961235d0521d5d516cf57867296e3f1f841abe1c5cc8d9c283b044 |
| tests/helpers/render-rate-stub.mjs | 8e98deac8199df280c14e24d089de791183a4e17a027674e3a48cfcdaf8a72d6 |
| tests/helpers/seed-log.mjs | b4104089fb78794e16e7e40d8f467d7e49f8deb0a9ed260d6f387bfa2d1f69c1 |
| tools/lib/game-vm.cjs | 2fc70b5f4181bc698cbfdc51b6052e253f9b0fffab4fcd00ddfcb7ec0504ddc0 |
| tests/data/physics-baseline.json | d5752d46f0ee3121c2d2c5ce8fa51b93ba10dd01f3449b86cb6ebe989ab525c4 |
| tests/specs/physics-characterization.spec.js | dc94edab511dc752a94aa90d585e3e603d4dfb2bb5b9b800014034ef7b3cb5ca |
| tools/check/track-oracle.mjs | 237b1e396b10b58147c98ab4b4a5dd5e6a495af34f4684a422959975409acde8 |
| js/perf/render-rate.js | 2d90c3668a64a9cbdb515ecbbe8b4be8fcb34445c229cbb89a8446ca45d4bd82 |

No execution verdict is implied by this map. The repository docs-only checks are left to the coordinating lane because this lane was expressly prohibited from running tests.

Additional static contract snapshot hashes:

| Source | SHA-256 |
|---|---|
| css/tokens.css | baba959f43def9a6140099f4554f763dcf5566df1182bb9a8afd12dbceba007a |
| css/touch-controls.css | 96a3af411fc54426627a36bcce1e565513ab23dbc7a66a655fa43a69514bf188 |
| css/hud.css | ae4d6a5649088bc03a468e0d0686bc0a333f613440ffd78edb351ab41e1f75b1 |
| css/overlays.css | 9b84e3b6694cd8d7798cdd42353791f1dd80e74659dfd09470084bc37f34e101 |
| css/responsive.css | ad18c02c6d0d619aa2045efae0fb631597af34af1a2fc4570a5de648af4feb01 |
| css/components.css | 4ee6791677c6309cb555eec91252f08769541be22184ecf9ea4d8f203255bebf |
| css/title.css | 91f4e53ca14b06075c998270706cfa72fe34c917b1b897380bb68cace15313cf |
| css/menus.css | a951584a190be9e59323eb0f677692bec86a75177f692a862270967e97dfc117 |
| index.html | 198787c00ff4055628ee7c524dff5453c5bc90ee6724948304d4f41d32499348 |
| controller.html | 9e5d6e92b826d28db4595e2e117e08d314c54682afee618f4e7ee80211618d46 |
| js/ui/hud.js | 34025c6524ab09293553ea05907cc0e3b063a1d31b00a17e2f6707960477355f |
| js/garage/setup-sheet.js | 4c6302ec91946cfb134e8155d314e421844d73524d6f3dac5e679efba699f4da |
| tools/manifest.cjs | bc6440de131fd98aa6f8eb7df5a6ba09b9796d256b01379869e37389f31abbeb |
| tools/perf/devicefarm-iphone.mjs | 4a3ca9447691d2809bdf9c10d3d05ddc15efce1be4fd7ce53a7aa67fa2e97052 |
| js/xr/xr-input.js | d6fc33e4ce2d193c698cb2231610dbebfdc378c95ccca549e06590b683260979 |
| js/camera/feel.js | bc6df3f6398155b28ed58caf59cd067edc38955d8ce4438a2da1ed7cacc1b7e6 |
| js/ui/appearance-opts.js | 3823dd593b57a221c4045347e7100f3e7111c96cfcd15bc651f105b6e4987720 |
| mobile/android/app/src/main/AndroidManifest.xml | a882afa810fb7c399c1947d2e42173832071b6b1a0e2e909467490f03a27df9b |
