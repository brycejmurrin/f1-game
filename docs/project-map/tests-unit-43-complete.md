# Unit group 43 complete source map

Mapped at `8a222466bc83de7cdbe6a42989f19f7824ce4c06`. All 20 manifest files were read in full: 4,948 lines. Each source-return call held one file slice, at most 100 lines and 10,000 characters, with no truncated result. No tests, browser, source edit or commit was performed. Assertions below are exact AST call spans, not predicate dumps. Case ranges include the test call; loop-generated names remain templates, with expansion explained in fixtures.

Navigation: AGENTS.md and `.claude/skills/code-nav/SKILL.md` read; attached apex-lsp outline/definition calls resolved runtime anchors. `G.redFlagRestart` first resolves only its GameCtx contract; direct `redFlagRestart` resolved implementation at `js/game.js:1654`. RealReplay.trackTrace definition returned a module-file fallback with export/caller coverage unverified; its body was read at 110–159. Tool files outside js were inspected by textual declaration navigation. Anchors are navigation evidence, not a claim every production body was read.

Shared fixture `tests/helpers/real-replay-fixtures.mjs` was read at 1–100 and 101–136; SHA-256 `416c96384a3b950e355682fee33ff0a7529aae90a58e27c92995cee7b062b536`. It defines scriptIn (22–29), 2 Hz line traces (32–36), transportReplay (38–56), direct media focus fixture (58–79), audioHarness (83–97), visible transport DOM (100–116), and rewritten watchEnvironment (118–135). Real recording: `tests/fixtures/openf1-baku-2026-race.json`; synthetic example.test media URLs never identify fetched assets.

## tests/unit/real-race.test.mjs

Full read: 1–1088; SHA-256 `76090b53c67a943c0d1b780482e2196987f89d310911741e830c747a6e791f9d`.

VM loads real director, data builder, teams and AI corner constants; straight 6 km Tracks stub and spy G callbacks isolate director decisions. Baku OpenF1 recording drives numeric expectations; optional real TyreModel validates historical set age. IDB and transport doubles model asynchronous cache/cancellation, not browser persistence or HTTP reliability. Production anchors: `js/race/real-race.js:37; js/data/real-race-tab.js:154`.

| Case name / meaning | Case range | Assertion spans | Target |
|---|---|---|---|
| lap mapping: identity at full distance, proportional and in range when condensed | 102–112 | 104, 105, 106, 107, 108, 109, 110, 111 | RealRace / DataRealRace; `R.realLapFor`, `R.simLapFor` |
| the pace table: a field median per lap, each driver relative to it, pit and missing laps neutral | 114–131 | 119, 120, 122, 123, 124, 125, 126, 128, 129, 130 | RealRace / DataRealRace; `R.paceTable`, `R.cumTable` |
| the real strategy becomes the pit plan the pit lane executes, at full and condensed distance | 133–161 | 137, 139, 140, 141, 143, 144, 145, 151, 152, 154, 155, 157, 158, 159, 160 | RealRace / DataRealRace; `R.planFor`, `R.dnfAtFor`, `R.cautionsFor` |
| every 2026 driver takes a roster seat by code; a stranger takes a free seat of their team | 163–178 | 166, 167, 168, 169, 174, 177 | RealRace / DataRealRace; `R.mapField` |
| the pace multiplier: behind means faster, ahead means slower, a slow real lap means slower, all clamped | 180–190 | 182, 183, 184, 185, 186, 187, 188, 189 | RealRace / DataRealRace; `R.paceMul` |
| stage() seats the player, sets the session, and stop() restores every setting it touched | 192–234 | 197, 199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 213, 214, 215, 217, 218, 219, 222, 224, 226, 227, 228, 229, 231, 232–233 | RealRace / DataRealRace; `R.create`, `rr.isActive`, `rr.stage`, `rr.current`, `rr.launch`, `rr.stop` |
| WATCH predicates follow the live director without constructing diagnostic snapshots | 236–262 | 238, 243, 244, 245, 247, 248, 249, 251, 252, 254, 255, 256, 258, 260 | RealRace / DataRealRace; `R.isWatch`, `R.create`, `rr.isActive`, `rr.isWatch`, `rr.stage`, `rr.stop` |
| arming lays the real grid, plans, compounds and retirements over the field on the first countdown frame | 264–309 | 271, 275, 276, 277, 278, 280, 281, 282, 283, 284, 285, 286, 287, 293, 295, 296, 297, 299, 300, 303, 306, 308 | RealRace / DataRealRace; `R.create`, `rr.stage`, `rr.update`, `rr.status` |
| a seat with no real driver did not start; a real driver of a team the roster lacks is left out | 311–323 | 321, 322 | RealRace / DataRealRace; `R.create`, `rr.stage`, `rr.update` |
| the closed loop: the field on its real timeline gets open-loop pace; a car dropped behind is told to push | 325–359 | 343, 345, 346, 352, 353, 354, 355, 356, 357, 358 | RealRace / DataRealRace; `R.create`, `rr.stage`, `rr.update`, `R.cumTable`, `R.paceTable`, `rr.status` |
| safety-car windows fly on the leader's lap and hand back at the window's end | 361–400 | 373, 375, 377, 379, 381, 387, 388, 389, 393, 399 | RealRace / DataRealRace; `R.create`, `rr.stage`, `rr.update`, `rr.stop` |
| fieldAt(): the race as it stood at the start of a lap — who was where, on what, and who was already out | 402–434 | 404, 407, 408, 410, 411, 413, 415, 420, 421, 422, 423, 428, 429, 430, 433 | RealRace / DataRealRace; `R.fieldAt`, `R.cumTable` |
| fieldAt keeps published trace time separate from the filled pace clock | 436–457 | 441, 442, 446–447, 449–450, 453, 455–456 | RealRace / DataRealRace; `R.fieldAt` |
| a mid-race jump-in drops every car where it was, on its set, with the clock and the reference seeded | 459–508 | 465, 468, 469, 470, 472, 475, 476, 478, 479, 480, 481, 482, 483, 484, 485, 486, 487, 488, 490, 491, 492, 493, 494, 497, 498, 501, 506, 507 | RealRace / DataRealRace; `R.create`, `rr.stage`, `rr.update`, `rr.status`, `R.fieldAt`, `R.paceTable`, `rr.stop` |
| the gain is per sim lap at a condensed distance, and a red-flag lap rewind is followed, not measured | 510–539 | 526, 531, 532, 537, 538 | RealRace / DataRealRace; `R.create`, `rr.stage`, `rr.update`, `R.cumTable`, `R.paceTable`, `R.realLapFor`, `rr.status`, `R.paceMul` |
| rain in the real race turns the sky here: the start lap's weather, then an arc when it starts or stops | 541–566 | 549, 552, 559, 561, 563, 565 | RealRace / DataRealRace; `R.create`, `rr.stage`, `rr.stop`, `rr.update` |
| rain that stops before the arc has turned the sky re-targets the arc back to dry | 571–587 | 583, 586 | RealRace / DataRealRace; `R.create`, `rr.stage`, `rr.update` |
| the review's fixes: a filled cum row, a DSQ that saw the flag, the kept stops, the fuel lap, a done window, one stint log | 589–636 | 596, 597, 598, 601, 602, 617, 618, 621–622, 624, 625, 626, 627, 628, 630, 631, 632, 635 | RealRace / DataRealRace; `R.cumTable`, `R.paceTable`, `R.fieldAt`, `R.dnfAtFor`, `R.create`, `rr.stage`, `rr.update`, `R.simLapFor`, `R.cautionsFor` |
| arm marks a DSQ finisher with c.dsq; endRace sees published classification | 641–683 | 659, 660, 661, 662, 663, 664, 666, 667, 668, 669, 670, 681, 682 | RealRace / DataRealRace; `rr.status`, `rr.isWatch`, `R.create`, `rr.stage`, `rr.update`, `G.endRace`, `rr.stop` |
| a JUMP IN records the clock it seeded, so the race's hard cap counts from the join (RaceControl.finishDelay) | 685–703 | 692, 696, 697, 699, 702 | RealRace / DataRealRace; `R.create`, `rr.raceT0`, `rr.stage`, `rr.update`, `R.paceTable`, `R.fieldAt`, `rr.stop` |
| a RESTART from the results puts the start lap's weather back before the grid | 705–721 | 719, 720 | RealRace / DataRealRace; `R.create`, `rr.stage`, `rr.update` |
| a mid-race jump-in is a ROLLING start: the seat car is driven for four seconds at speed, counted down ON SCREEN, then control passes | 723–761 | 732, 733, 734, 735, 736, 738, 740, 741, 742, 744, 745, 746, 747, 749, 750, 757, 758, 759, 760 | RealRace / DataRealRace; `R.create`, `rr.stage`, `rr.update`, `rr.status` |
| the rolling hand-over re-zeroes the input (Input.calibrate) once, when the wheel passes — as FlyingStart's does | 763–781 | 777, 779, 780 | RealRace / DataRealRace; `R.create`, `rr.stage`, `rr.update` |
| dropSpeed: FULL speed for the road ahead — vTop on a straight, the AI's entry budget before a hairpin, never below the floor | 783–800 | 787, 793, 794, 797, 798 | RealRace / DataRealRace; `R.dropSpeed` |
| launch({intro}) goes through the pre-race screen; intro() describes the event and the seat until the lights | 802–833 | 809, 810, 811–812, 814–815, 816, 817, 819, 823, 828, 831, 832 | RealRace / DataRealRace; `R.create`, `rr.intro`, `rr.launch`, `rr.update`, `rr.stop`, `tab.split` |
| situation(): Leclerc at lap 40 of Baku — place, gaps, tyres, stops, flags, retirements, the lead, the fastest lap | 836–857 | 839, 840, 841, 843, 844, 845, 846, 847, 848, 849, 850, 851, 852, 853, 855, 856 | RealRace / DataRealRace; `R.situation` |
| situation() is strictly causal: nothing from the lap you join onward changes the read | 859–876 | 873, 875 | RealRace / DataRealRace; `R.situation` |
| situation() from lap 1 is the real grid: pole, the front row, your slot and your tyres | 878–889 | 881, 882, 883, 884, 885, 887, 888 | RealRace / DataRealRace; `R.situation`, `R.properName` |
| RESTART / RACE AGAIN (a new field with no menu frame between) re-arms the real race: grid, hand-over and plate afresh | 891–910 | 900, 907, 908, 909 | RealRace / DataRealRace; `R.create`, `rr.stage`, `rr.update`, `rr.status` |
| JUMP IN never lands past the seat's own retirement, and the seat's reliability counts only the laps it drives | 912–932 | 915, 923, 930, 931 | RealRace / DataRealRace; `R.create`, `rr.stage` |
| fetchTraces never caches a set with a failed request (a hub closed mid-load, a dropped connection) | 934–956 | 942, 947, 948, 949, 950, 953, 954, 955 | RealRace / DataRealRace; `D.fetchTraces` |
| race traces share one IndexedDB connection and keep only the newest TRACE_MAX races | 982–1002 | 990, 991, 994, 995, 996, 997, 999, 1000, 1001 | RealRace / DataRealRace; `D.tracePut`, `D.traceGet` |
| leaving the tab mid-download drops the queued position requests; a pick here re-renders the sibling tabs | 1004–1028 | 1020, 1022, 1024, 1027 | RealRace / DataRealRace; `D.create`, `tab.cancel`, `tab.loadTraces`, `tab.loadRealRace` |
| JUMP IN preserves historical set age with the production tyre clock | 1031–1048 | 1041, 1043, 1046 | RealRace / DataRealRace; `R.create`, `rr.stage`, `G.tyres.setLevel`, `rr.update`, `rr.status`, `G.tyres.lapsOn` |
| cancelled WATCH does not create position requests after a delayed IndexedDB cache miss | 1050–1069 | 1058, 1068 | RealRace / DataRealRace; `D.create`, `tab.loadTraces`, `tab.cancel`, `tab.positionsSettled` |
| cancelling a fulfilled WATCH request before packing rejects without caching partial work | 1071–1083 | 1081, 1082 | RealRace / DataRealRace; `D.fetchTraces` |
| fetchTraces preserves its rejected-promise contract when already cancelled | 1085–1088 | 1087 | RealRace / DataRealRace; `D.fetchTraces` |

## tests/unit/real-replay-audio-focus.test.mjs

Full read: 1–274; SHA-256 `a20e2a72a7996268223794a312e53c68644d8ec2c301375041075f24574b5e54`.

Shared transportReplay/directRadioReplay/audioHarness supply synthetic traces, media events and context generations. Assertions establish focus ownership and puppet speed/rev inputs, not audible output, audio hardware timing or native MutationObserver scheduling. Production anchors: `js/race/real-replay.js:260`.

| Case name / meaning | Case range | Assertion spans | Target |
|---|---|---|---|
| WATCH: the pause card cuts a real team radio clip mid-sentence, as a hidden tab does | 8–37 | 27, 28, 32, 33, 35 | RealReplay audio lifecycle; `replay.start`, `replay.tick`, `replay.status`, `replay.stop` |
| WATCH: a rotate-block pause that re-hides the card in the same task still cuts team radio | 47–89 | 72, 73, 79, 81, 82, 87 | RealReplay audio lifecycle; `replay.start`, `replay.tick`, `replay.status`, `replay.stop` |
| WATCH OpenF1 team radio routes through GameAudioRadioFx.playWatchMedia (FX chain + duck) | 91–122 | 116, 117, 118, 119, 121 | RealReplay audio lifecycle; `replay.start`, `replay.tick`, `replay.stop` |
| WATCH direct Audio fallback focuses only audible playing and releases on interruption | 124–182 | 128, 129, 131, 134, 136, 138, 140, 142, 144, 146, 148, 150, 152, 154, 156, 158, 159, 160, 161, 163, 165, 166, 167, 169, 171, 173, 175, 177, 178, 179, 180 | RealReplay audio lifecycle; `replay.tick`, `a.emit`, `replay.setPaused`, `replay.seek`, `replay.stop` |
| WATCH fallback rejects stale events and play failures without releasing a newer owner | 184–209 | 193, 194, 197, 198, 201, 202, 206, 207 | RealReplay audio lifecycle; `replay.tick`, `replay.stop` |
| WATCH fallback callbacks from a previous audio context cannot claim or release focus | 211–232 | 219, 220, 221, 225, 227, 229, 230 | RealReplay audio lifecycle; `replay.tick`, `replay.stop` |
| WATCH transport pause hands the audio a stopped car, and playing again brings the speed back | 234–246 | 237, 240, 241, 244 | RealReplay audio lifecycle; `replay.seek`, `replay.tick`, `replay.setPaused`, `replay.stop` |
| WATCH at 4x: c.speed is the trace's real m/s (camera, CamFeel, ExtraRigs read it); the rate rides apart for the revs | 248–260 | 254, 255, 257, 258 | RealReplay audio lifecycle; `replay.setSpeed`, `replay.seek`, `replay.tick`, `replay.stop` |
| WATCH a car whose trace has ended drops to idle revs instead of keeping its last rpm | 262–274 | 265, 269, 270, 271, 272 | RealReplay audio lifecycle; `replay.seek`, `replay.tick`, `replay.stop` |

## tests/unit/real-replay-broadcast.test.mjs

Full read: 1–446; SHA-256 `1569bda80911e2d4e892b963099e2f45c66ae218f06c9776beaf200f5d6a1828`.

Mixes isolated module VMs and createGame Baku integration. Real timing fixture plus synthetic positions validates tower, cuts, PiP and keyboard ownership; VM DOM and mirror state do not establish rendered inset quality or native key focus behavior. Production anchors: `js/race/broadcast.js:49; js/race/real-replay.js:260`.

| Case name / meaning | Case range | Assertion spans | Target |
|---|---|---|---|
| WATCH event cursor preserves equal-time dispatch, caption bounds, rewinds, restart and reel cuts | 14–39 | 24, 26, 27, 29, 31, 33, 34, 37 | Broadcast / RealReplay; `replay.start`, `replay.tick`, `replay.seek`, `replay.setSpeed`, `replay.skip`, `replay.stop` |
| BROADCAST event windows retain stable ties and absolute shown indices without rereading race history | 42–69 | 61, 62, 67, 68 | Broadcast / RealReplay; `B.nextEvent` |
| BROADCAST tower: the grid at lights out, the leader and gaps at the last line, the car out last, the fastest lap once it is set | 71–102 | 78, 79, 84, 85, 86, 88, 89, 92, 94, 95, 96, 99, 100 | Broadcast / RealReplay; `B.towerAt`, `B.fmtGap` |
| BROADCAST towerAt: pools rows and skips rebuild when the timing-line sample is unchanged | 104–126 | 115, 116, 117, 120, 122, 123, 124 | Broadcast / RealReplay; `B.towerAt`, `B.towerSample` |
| BROADCAST director rules: the tightest battle up the order first, the next event by weight, never the same shot twice | 128–141 | 134, 136, 137, 138, 139 | Broadcast / RealReplay; `B.battles`, `B.nextEvent`, `B.shotFor` |
| BROADCAST holds an event through its aftermath and keeps the wall-clock minimum at every replay rate | 143–181 | 159, 161, 164, 166, 170, 174, 178 | Broadcast / RealReplay; `B.create`, `bc.tick`, `bc.start`, `bc.setLocked`, `bc.resetTiming`, `bc.manual`, `bc.setAuto`, `bc.stop` |
| BROADCAST battles: reuses one pooled array across calls (Director / PiP / ExtraRigs hot path) | 183–200 | 191, 192, 193, 197, 198 | Broadcast / RealReplay; `B.battles` |
| BROADCAST battles: the crawl floor rides the pace scale when the caller passes vTop()/VMAX (4-F6) | 202–213 | 208, 209, 210, 212 | Broadcast / RealReplay; `B.battles` |
| BROADCAST in WATCH (camera AUTO): the tower goes up, the director cuts to the car in the next event with a new shot, a follow key hands the picture over, the results take it down | 215–288 | 227, 228, 230, 231, 234, 238, 246, 247, 248, 249, 252, 260, 262, 264, 266, 274, 275, 277, 279, 283, 285, 286 | Broadcast / RealReplay; `RR.launch`, `RR.status`, `R.highlightsFor`, `RR.replay` |
| BROADCAST PiP pick: the followed car's battle partner (the car BEHIND when sandwiched), else the car in the next event, never the followed car | 290–312 | 296, 297, 298, 299, 300, 301, 305, 306, 307, 308, 309, 310 | Broadcast / RealReplay; `B.pipPick` |
| BROADCAST PiP in WATCH with no battle (3 s apart): the inset is still up, on the car behind | 314–332 | 327, 328, 329 | Broadcast / RealReplay; `RR.launch`, `RR.status`, `RR.replay` |
| WATCH in-game AUTO: a picked shot hands the viewer the picture, AUTO hands it back at once; the commentary hears the replay | 334–369 | 348, 349, 350, 351, 354, 356, 358, 361, 364, 366, 367 | Broadcast / RealReplay; `RR.launch`, `RR.replay`, `rp.autoOn`, `rr.debug`, `rp.setAuto`, `RR.status`, `rp.takePicture`, `R.highlightsFor`, `rp.seek` |
| BROADCAST PiP in WATCH: two cars 8 m apart put the partner in the inset (labelled, through the mirror pass); the results clear it | 371–400 | 384, 385, 386, 388, 389, 393, 396, 398 | Broadcast / RealReplay; `RR.launch`, `RR.status`, `RR.replay` |
| BROADCAST manual camera ownership keeps the on-air shot and AUTO baseline current | 402–414 | 405, 407, 409, 412 | Broadcast / RealReplay; `replay.start`, `replay.status`, `replay.takePicture`, `replay.setLocked`, `replay.setAuto`, `replay.eventStep`, `replay.stop` |
| WATCH broadcast: the running order's speeds are the cars' own, whatever the replay rate (battles()/PiP/director read them) | 416–446 | 431–432, 441, 442, 443, 444, 445 | Broadcast / RealReplay; `R.create`, `replay.start`, `replay.seek`, `replay.tick`, `replay.stop`, `B.battles` |

## tests/unit/real-replay-captions.test.mjs

Full read: 1–138; SHA-256 `83ecc9e0db5b48f7270879970bd58395c8aec85e1b8c4d107d6b6b922122e288`.

Local fixture runs production replay with accepted-caption queue and synthetic traces. Real radio modules in first case distinguish ending from clearance. Queue drain is modeled; no live announcer, audio playback or renderer evidence. Production anchors: `js/race/real-replay.js:186`.

| Case name / meaning | Case range | Assertion spans | Target |
|---|---|---|---|
| WATCH captions SC/VSC ending before clearance and still announces the actual green | 39–69 | 54, 55, 60, 61, 63, 64–65, 66 | RealReplay / RaceRadio; `R.highlightsFor`, `R.reelFor`, `replay.start`, `replay.tick`, `replay.stop` |
| fallback replay captions cannot drain across seeks, stop, restart or finish | 71–99 | 77, 79, 81, 83, 85, 87, 89, 92, 94, 95, 96 | RealReplay / RaceRadio; `replay.tick`, `replay.status`, `replay.setPaused`, `replay.follow`, `replay.seek`, `replay.stop`, `replay.start` |
| fallback replay captions retain each intended highlight and expire on manual and automatic reel cuts | 101–114 | 105, 106, 108, 109, 111 | RealReplay / RaceRadio; `replay.tick`, `replay.skip`, `replay.status`, `replay.stop` |
| fallback replay radio captions share timeline ownership whether audio is playing or muted | 116–129 | 120, 121, 123, 125, 127 | RealReplay / RaceRadio; `replay.tick`, `replay.seek`, `replay.stop` |
| the speed caption names the seat's real driver, not the roster car it sits in | 131–138 | 137 | RealReplay / RaceRadio; `replay.follow` |

## tests/unit/real-replay-frame-fit.test.mjs

Full read: 1–179; SHA-256 `90aebee0cae9d7e9f94477052c05582d707e3c1a98224db6c91f6702610a5b7c`.

Baku locationExcerpt is recorded 2 Hz data; later cases use production Monza/Suzuka geometry or crossing doubles. Exhaustive old-search oracle and exact floats pin optimization equivalence. Sampled geometric correctness does not prove every circuit/feed frame. Production anchors: `js/race/real-replay.js:27`.

| Case name / meaning | Case range | Assertion spans | Target |
|---|---|---|---|
| Russell's real lap lands on the game's Baku centreline: mirrored, turned, forward, 5.9 km | 17–55 | 22, 26, 27, 28, 32, 36, 38, 41, 44, 46, 47, 48, 49, 53 | RealReplay fit/projection; `R.fitFrame`, `R.trackTrace`, `R.mapPoint`, `R.sampleAt`, `R.buildTraces` |
| frame-fit spatial search preserves exhaustive nearest matches, ties, and the exact Baku fit | 57–93 | 60, 82, 87, 90 | RealReplay fit/projection; `R.fitFrame` |
| trackTrace reuses one transform while mapPoint still observes mutable fits | 95–114 | 104, 109, 110, 113 | RealReplay fit/projection; `R.trackTrace`, `R.mapPoint` |
| WATCH projection recovers telemetry gaps on straights, corners and the lap seam | 116–145 | 137–138, 141 | RealReplay fit/projection; `R.trackTrace` |
| gap recovery keeps the established branch through a crossing with an identical world point | 147–164 | 162, 163 | RealReplay fit/projection; `R.trackTrace` |
| WATCH gap recovery preserves both actual Suzuka crossing branches | 166–179 | 176–177 | RealReplay fit/projection; `R.trackTrace` |

## tests/unit/real-replay-transport.test.mjs

Full read: 1–738; SHA-256 `ed4bfb7dc3735f9d15963523649ccd75150890045e95a77c544354599798cfd6`.

Shared synthetic two-driver fixture runs real replay+broadcast; selected cases add actual camera mode and XR boot modules with DOM/XR callbacks stubbed. Parameterized cases cover ownership entry/exit orders and overlapping reel choices. This is state/presentation-contract evidence, not browser accessibility, headset rendering or visual QA. Production anchors: `js/race/real-replay.js:260; js/ui/watch-transport.js:10`.

| Case name / meaning | Case range | Assertion spans | Target |
|---|---|---|---|
| HIGHLIGHTS no-driver cuts replace retired subjects only while AUTO owns the picture | 12–35 | 20, 27, 28, 29–30, 32 | RealReplay / WatchTransport / camera ownership; `replay.start`, `replay.status`, `replay.tick`, `replay.takePicture`, `replay.setLocked`, `replay.stop` |
| WATCH AUTO handoff updates the actual camera and cockpit HUD immediately, including paused reels | 37–89 | 61, 62, 66, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 81, 82, 84, 85, 86, 87 | RealReplay / WatchTransport / camera ownership; `replay.stop`, `replay.start`, `G.setCamMode`, `replay.takePicture`, `replay.seek`, `replay.setPaused`, `replay.status`, `replay.setAuto`, `replay.autoOn` |
| WATCH transport pause holds the replay clock, and seek reposes ended and rewound drivers before snapping | 91–108 | 94, 96, 97, 98, 99, 100, 102, 104, 105, 106 | RealReplay / WatchTransport / camera ownership; `replay.setPaused`, `replay.tick`, `replay.status`, `replay.seek`, `replay.stop` |
| WATCH paused follow refreshes the inset before snapping without advancing playback | 110–127 | 117, 119, 120, 121, 122, 123, 125 | RealReplay / WatchTransport / camera ownership; `replay.tick`, `replay.setPaused`, `replay.status`, `replay.follow`, `replay.stop` |
| WATCH follow lock survives director holds and event navigation, AUTO releases it, and restart clears playback state | 129–146 | 133, 134, 136, 137, 138, 139, 141, 142, 144, 145 | RealReplay / WatchTransport / camera ownership; `replay.setLocked`, `replay.tick`, `replay.status`, `replay.seek`, `replay.setPaused`, `replay.eventStep`, `replay.setAuto`, `replay.autoOn`, `replay.stop` |
| WATCH paused event navigation paints the final subject and event shot in one camera snap | 148–160 | 155, 156, 157, 158 | RealReplay / WatchTransport / camera ownership; `replay.setPaused`, `replay.eventStep`, `replay.status`, `replay.stop` |
| WATCH timeline changes reset commentary at the new clock and pose before snapping | 162–179 | 169, 172, 177 | RealReplay / WatchTransport / camera ownership; `replay.seek`, `replay.eventStep`, `replay.start`, `replay.skip`, `replay.stop` |
| HIGHLIGHTS opens with the event's shot and preserves manual subject and camera across cuts | 181–210 | 190, 191, 192, 196, 197, 198, 199, 200, 201, 203, 207 | RealReplay / WatchTransport / camera ownership; `replay.start`, `replay.status`, `replay.takePicture`, `replay.tick`, `replay.setPaused`, `replay.skip`, `replay.setAuto`, `replay.eventStep`, `replay.stop` |
| HIGHLIGHTS scrub into a reel gap follows the next item's driver before its event (#2196) | 212–231 | 221, 224, 225, 226, 228, 229 | RealReplay / WatchTransport / camera ownership; `replay.start`, `replay.status`, `replay.seek`, `replay.tick`, `replay.stop` |
| HIGHLIGHTS NEXT onto a reel item lands on it, and the clock never runs back (#2196) | 233–253 | 240, 242, 243, 244, 249 | RealReplay / WatchTransport / camera ownership; `replay.start`, `replay.status`, `replay.eventStep`, `replay.tick`, `replay.stop` |
| automatic HIGHLIGHTS stays forward and announces overlapping ${next.kind}@${next.t} once (${spoken ? "commentary" : "captions"}) | 256–288 | 268, 274, 277, 278, 279, 282, 283, 284, 285, 286 | RealReplay / WatchTransport / camera ownership; `replay.start`, `replay.status`, `replay.tick`, `replay.stop` |
| manual HIGHLIGHTS skip, chapter and seek retain intentional replay of overlapping lead-ins | 291–312 | 301, 305, 306, 308, 309 | RealReplay / WatchTransport / camera ownership; `replay.start`, `replay.tick`, `replay.status`, `replay.skip`, `replay.seekEvent`, `replay.seek`, `replay.stop` |
| overlapping automatic cuts keep active radio while large steps skip exhausted holds into the next forward segment | 314–341 | 330, 331, 332, 334, 335, 336, 337, 339 | RealReplay / WatchTransport / camera ownership; `replay.start`, `replay.tick`, `replay.status`, `replay.stop` |
| a short automatic forward cut does not re-fire a radio event inside the new caption window | 343–362 | 355, 357, 359, 360 | RealReplay / WatchTransport / camera ownership; `replay.start`, `replay.tick`, `replay.status`, `replay.stop` |
| WATCH paused seek repaints the timing tower and race clock without advancing the director | 364–380 | 371, 375, 376, 377, 378 | RealReplay / WatchTransport / camera ownership; `replay.tick`, `replay.setPaused`, `replay.status`, `replay.seek`, `replay.stop` |
| WATCH manual and automatic reel cuts release radio and reset timeline presentation before snapping | 382–418 | 402, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414, 415 | RealReplay / WatchTransport / camera ownership; `replay.start`, `replay.setLocked`, `replay.tick`, `replay.setPaused`, `replay.skip`, `replay.status`, `replay.stop` |
| WATCH toolbar exposes working pointer controls, honest event labels and photo ownership, then tears down | 420–494 | 446, 447, 448, 449, 453, 454, 455, 456, 457, 459, 460, 462, 464, 465, 468, 469, 470, 471, 472, 474, 475, 476, 479, 481, 483, 485, 487, 489, 490, 491, 492, 493 | RealReplay / WatchTransport / camera ownership; `ui.start`, `ui.tick`, `ui.paint`, `ui.stop` |
| WATCH transport: no aria-pressed on PLAY, and a focused, playing timeline is not re-announced | 501–539 | 523, 524, 527, 529, 533, 535, 537 | RealReplay / WatchTransport / camera ownership; `ui.start`, `ui.paint`, `ui.stop` |
| WATCH playable events exclude unavailable footage and NEXT cannot stick at the trace endpoint | 541–555 | 545, 546, 547, 548, 549, 550, 551, 552, 553 | RealReplay / WatchTransport / camera ownership; `replay.start`, `replay.setPaused`, `replay.describe`, `replay.eventStep`, `replay.status`, `replay.seek`, `replay.stop` |
| HIGHLIGHTS chapter jumps retain overlapping event identity instead of replaying the earlier cut | 557–575 | 564, 565, 566, 567, 569, 570, 572, 573 | RealReplay / WatchTransport / camera ownership; `replay.start`, `replay.setPaused`, `replay.status`, `replay.tick`, `replay.seekEvent`, `replay.stop` |
| HIGHLIGHTS playable bounds preserve pre-grid footage, clamp cuts and finish at the loaded endpoint | 577–592 | 582, 583, 584, 585, 587, 588, 590, 591 | RealReplay / WatchTransport / camera ownership; `replay.start`, `replay.status`, `replay.seek`, `replay.eventStep`, `replay.setLocked`, `replay.setPaused`, `replay.skip`, `replay.tick`, `replay.stop` |
| HIGHLIGHTS with no playable events falls back to the available full replay | 594–604 | 598, 600, 601, 602 | RealReplay / WatchTransport / camera ownership; `replay.start`, `replay.status`, `replay.tick`, `replay.stop` |
| WATCH unavailable driver selection stays honest and never locks the previous subject | 606–624 | 610, 611, 614, 615, 616, 618, 619, 621, 622 | RealReplay / WatchTransport / camera ownership; `replay.setPaused`, `replay.seek`, `replay.status`, `replay.stop` |
| HIGHLIGHTS rejects missing and ended subject footage before nearby pass suppression | 626–641 | 633, 634, 638, 639 | RealReplay / WatchTransport / camera ownership; `replay.start`, `replay.describe`, `replay.status`, `replay.stop` |
| WATCH/XR camera owners restore FAR with ${entry} entry and ${exit} exit | 681–701 | 685, 688, 692, 695, 696, 697, 699, 700 | RealReplay / WatchTransport / camera ownership; `replay.stop`, `G.setCamMode` |
| WATCH AUTO and highlight cuts retain XR cockpit, then resume the WATCH owner | 705–722 | 708, 712, 713, 714, 716, 718, 719, 721 | RealReplay / WatchTransport / camera ownership; `replay.setAuto`, `replay.status`, `replay.tick`, `replay.autoOn`, `replay.stop` |
| WATCH restart under XR replaces only its own token and preserves manual WATCH controls | 724–738 | 728, 730, 732, 733, 735, 737 | RealReplay / WatchTransport / camera ownership; `G.setCamMode`, `replay.takePicture`, `replay.stop` |

## tests/unit/real-replay-vm.test.mjs

Full read: 1–405; SHA-256 `90d9a09bddfec04e7de442656028f9c53630088990ac20ebbe3eebc46f77a4ef`.

createGame uses real Baku build and scriptIn recording; synthetic line traces isolate puppet behavior. watchEnvironment rewrites lap starts to ten-second intervals, flags and rain intentionally. Tests cover recorded classification/lifecycle rather than actual historical position fidelity or GPU output. Production anchors: `js/race/real-race.js:383; js/race/real-replay.js:260`.

| Case name / meaning | Case range | Assertion spans | Target |
|---|---|---|---|
| the highlights list every moment of the race in time order, and the reel keeps the cuts | 21–50 | 26, 27, 31, 32, 34, 36, 38, 39, 41, 43, 45, 46, 47, 48 | RealRace / RealReplay game integration; `R.highlightsFor`, `R.reelFor` |
| WATCH: the field becomes puppets on the countdown frame, the camera on the seat; follow, speed, a car whose data ends, the flag | 52–115 | 61, 65, 66, 67, 68, 69, 71, 72, 74, 75, 79, 80, 81, 82, 83, 85, 86, 87, 88, 91, 96, 97, 98, 99, 107, 109, 111, 112, 113 | RealRace / RealReplay game integration; `RR.launch`, `RR.status`, `G.setCamMode`, `RR.replay` |
| WATCH official finishers and disqualifications survive the full game's result settlement | 117–152 | 130, 131, 134, 135, 136, 137, 138, 140, 141, 142, 145, 147, 149, 150 | RealRace / RealReplay game integration; `RR.launch`, `RR.replay` |
| JUMP IN with the positions loaded drops each car exactly where its trace says | 154–188 | 171, 172, 173, 176, 177, 178, 179, 180, 181, 183, 184, 185, 186 | RealRace / RealReplay game integration; `RR.launch`, `RR.status` |
| JUMP IN samples published trace time when a timing gap separates it from the pace clock | 190–213 | 200, 207, 208, 209, 210–211 | RealRace / RealReplay game integration; `RR.fieldAt`, `RR.launch`, `RR.status` |
| WATCH snaps after posing on mid-race entry and seek, and releases camera ownership on restart | 215–241 | 229, 230, 232, 233, 236, 237, 238, 239 | RealRace / RealReplay game integration; `R.create`, `replay.start`, `replay.seek`, `replay.stop` |
| WATCH final results use published finish and DNF evidence rather than position download endings | 243–266 | 249, 250, 251, 252, 253, 254, 255, 256, 257, 258, 262, 263, 264 | RealRace / RealReplay game integration; `replay.seek`, `replay.tick`, `replay.start`, `replay.stop` |
| WATCH with a missing, empty or truncated winner trace completes on usable positions and preserves official order | 268–289 | 276, 277–278, 280, 282, 283, 284, 285, 287 | RealRace / RealReplay game integration; `replay.start`, `replay.status`, `replay.tick`, `replay.stop` |
| WATCH terminal classification preserves DNS and DSQ without inventing accidents | 291–303 | 297, 298, 299, 300 | RealRace / RealReplay game integration; `replay.tick`, `replay.stop` |
| WATCH terminal results use published driver identities while retaining roster seat preferences | 305–321 | 315, 316, 317, 318, 319 | RealRace / RealReplay game integration; `replay.tick`, `replay.stop` |
| WATCH seeks restore recorded flags immediately, and a paused red never restarts the puppet field | 323–342 | 327, 328, 329, 330, 331, 334, 335, 336, 337, 338, 339, 340 | RealRace / RealReplay game integration; `replay.setPaused`, `replay.seek`, `replay.status`, `G.quitToMenu` |
| WATCH entry and paused seeks take weather from the recording, independent of completed future rain | 344–364 | 348, 349, 353, 355, 356, 357, 358, 359, 360 | RealRace / RealReplay game integration; `replay.status`, `replay.setPaused`, `G.trackWetness`, `replay.seek`, `G.quitToMenu` |
| WATCH takes its recorded flag ownership through the normal starting countdown | 366–386 | 376, 379, 380, 382, 383 | RealRace / RealReplay game integration; `RR.launch`, `replay.setPaused`, `replay.status`, `replay.seek`, `G.quitToMenu` |
| WATCH seeks and playing show recorded sets including a same-compound restop | 388–405 | 395, 397, 398, 399, 400, 402 | RealRace / RealReplay game integration; `replay.setPaused`, `replay.seek`, `replay.tick`, `G.quitToMenu` |

## tests/unit/rear-wing-active-aero.test.mjs

Full read: 1–131; SHA-256 `ff3fefeff34a309b0812d30e7043d6a485b284d9df84a038206ea170d173ff74`.

loadParts loads production geometry/catalog. All catalog recipes are sampled analytically at open/closed poses; stub mesh creation inspects color buffers/cache identity. Bounds are gameplay geometry contracts, not independent FIA certification or rendered visual proof. Production anchors: `js/car/car-body-geom.js:666; js/car/car-mesh.js:772`.

| Case name / meaning | Case range | Assertion spans | Target |
|---|---|---|---|
| the RW Flap is ONE rigid body: one pivot, one pair of end angles | 48–59 | 51, 53, 54, 55, 56 | Car3D / CarMesh |
| the pivot lies in the REAR half of the flap, inside its height band | 61–73 | 67–68, 71 | Car3D / CarMesh |
| Straight Mode flattens every element — never past flat, never steeper | 75–86 | 79, 80, 81, 82–83 | Car3D / CarMesh |
| the slot opens: the leading edge rises a DRS-sized amount, the trailing edge barely moves | 88–102 | 98, 100 | Car3D / CarMesh |
| the drs plane flies with the stack, in the livery's REAR WING colour | 104–131 | 111, 114, 115, 125, 126, 128, 129 | Car3D / CarMesh; `CarMesh.init`, `C.aeroStyleOf`, `C.aeroFlaps`, `CarMesh.getAeroFlapSet` |

## tests/unit/rear-wing-drs-rail.test.mjs

Full read: 1–168; SHA-256 `5311759ae361be3686ff420546146bf4b90c4e49feffe373914f9ac071a9d857`.

Five named recipes, closed chord samples and copied anchor constants establish modeled clearances; final mesh witness checks outwash_max vertices so copied anchors alone cannot conceal a revert. It does not sweep intermediate opening poses/all possible recipes. Production anchors: `js/car/car3d.js:237; js/car/car-body-geom.js:666`.

| Case name / meaning | Case range | Assertion spans | Target |
|---|---|---|---|
| DRS rail sits in the closed rear↔rearDrs slot (#3413) | 79–109 | 89–90, 104–105 | Car3D rear assembly |
| DRS actuator pod sits above the closed top rear flap (#3413) | 111–123 | 120–121 | Car3D rear assembly |
| outwash_max rearAssembly rail verts stay under the closed flap skin | 125–168 | 136, 157, 166–167 | Car3D rear assembly; `Car3D.build` |

## tests/unit/red-flag-fuel-vm.test.mjs

Full read: 1–27; SHA-256 `654f1b447aa32ae5085a76d32c38dc2c54d48dd3b4fff99bf96bcf0d227a8518`.

createGame Monza with real tyre wear; direct crossing calls distinguish classification rewind from physical fuel burn. No fuel-consumption measurement across every track. Production anchors: `js/game.js:1654`.

| Case name / meaning | Case range | Assertion spans | Target |
|---|---|---|---|
| red-flag replay preserves burned fuel and burns the repeated lap | 8–27 | 14, 15, 16, 17, 20, 21, 25 | redFlagRestart / RaceControl / TyreModel; `G.tyres.fuelAccelMul`, `G.tyres.fuelVmaxMul`, `G.redFlagRestart`, `R.lineTransition` |

## tests/unit/red-flag-pit-vm.test.mjs

Full read: 1–127; SHA-256 `aeed59e15b19f93ccb42d4036fc17f0fd870026c9ce30468e0922870e67dd7c2`.

Shared Monza VM timeline: first test seeds interrupted pit fields; second consumes restart state; third seeds pre/post-fit stops. Final independent VM pins physical tyre age over repeated restarts. Peak speed avoids end-window collision sensitivity. Production anchors: `js/game.js:1654`.

| Case name / meaning | Case range | Assertion spans | Target |
|---|---|---|---|
| a red flag clears a stop in flight but keeps the strategy behind it | 34–56 | 47, 49, 50, 51, 52, 54, 55 | redFlagRestart / pit/tyre state; `a.redFlag` |
| the car is not held at the pit limiter after the standing restart | 58–76 | 73–75 | redFlagRestart / pit/tyre state |
| a stop the red flag interrupts before the set is fitted is not counted | 78–92 | 83, 88, 89, 90, 91 | redFlagRestart / pit/tyre state; `a.redFlag` |
| red-flag grids and their first crossing preserve physical tyre age | 95–127 | 108, 112, 113, 114, 115, 119, 120, 123, 125 | redFlagRestart / pit/tyre state; `G.tyres.setLevel`, `G.tyres.fit`, `G.tyres.lapsOn`, `G.tyres.lapsLeft` |

## tests/unit/red-flag-vm.test.mjs

Full read: 1–165; SHA-256 `9040c0080bb8923166c68efd0903cfd356510232a8085975a53240a001806f90`.

Shared Monza VM timeline plus independent false-start and queue games. Directly seeded laps/progress isolate distance bookkeeping; ten-second red queue checks no stuck accumulation before live restart timeout. Not a complete race-control procedure simulation. Production anchors: `js/game.js:1654`.

| Case name / meaning | Case range | Assertion spans | Target |
|---|---|---|---|
| red-flag restart keeps penalty reasons, permits a second false start, and a new race clears both | 26–60 | 34, 42, 48, 49, 50, 51, 52, 54, 55, 57, 58 | redFlagRestart / grid/AI state; `a.race`, `a.redFlag` |
| red flag: laps step back one, prog sits behind the line, the player faces down the road | 62–104 | 71, 87, 91, 92–93, 94, 96, 97, 98, 102, 103 | redFlagRestart / grid/AI state; `a.jump`, `a.redFlag` |
| after the restart the first crossing puts the field back on the lap it was on, not one further | 106–118 | 115, 116, 117 | redFlagRestart / grid/AI state |
| a fresh grid-up still zeroes errCount — only a NEW race resets the instrument | 120–125 | 124 | redFlagRestart / grid/AI state; `G.gridUp` |
| a car just behind a leader that has crossed is NOT a lap down after the restart | 127–143 | 138, 139, 140, 142 | redFlagRestart / grid/AI state; `G.redFlagRestart` |
| a queue held under the red flag is parked, not wedged: no AI accrues stuckT | 145–165 | 161, 162, 163 | redFlagRestart / grid/AI state; `G.applyCaution`, `G.cautionLevel` |

## tests/unit/redbull-orbit-clear.test.mjs

Full read: 1–51; SHA-256 `e7ebede629e8b88c21fa5976811baa3ba0a092adc8f4eaa3839728f43ba4363c`.

Real Red Bull geometry at four fixed hot fractions and one azimuth/elevation/distance. Eye and transmissivity probes establish those sampled clearances; no camera sweep or pixel visibility claim. Production anchors: `js/camera/flyby-seq.js:172; js/camera/flyby-sight.js:237`.

| Case name / meaning | Case range | Assertion spans | Target |
|---|---|---|---|
| redbull scenery-orbit: eye clear of solids at #3364 hot fracs | 30–40 | 35, 39 | FlybySeq / FlybySight; `a.orbit` |
| redbull scenery-orbit: sightline open at #3364 hot fracs | 42–51 | 50 | FlybySeq / FlybySight; `a.orbit` |

## tests/unit/reject-lint.test.mjs

Full read: 1–103; SHA-256 `2d98fff922e0950dc4daf522801e0ca01871b216d90e9ab0fd39a166deb86f3c`.

Inline source snippets pin promise-discard recognition, ownership and false positives; final count scans current js tree. Static pattern lint does not execute browser promise APIs or prove all asynchronous rejections handled. Production anchors: `tools/check/reject-lint.mjs:86`.

| Case name / meaning | Case range | Assertion spans | Target |
|---|---|---|---|
| a discarded promise API inside try{} is flagged | 36–40 | 38, 39 | lintSource / count |
| the rejection arm clears it | 42–46 | 45 | lintSource / count |
| playEffect is flagged on any receiver — only the haptic actuator has it | 48–51 | 49, 50 | lintSource / count; `a.playEffect` |
| a value the caller owns is not a site | 53–61 | 60 | lintSource / count |
| synchronous close()/resume() receivers are not flagged | 67–75 | 74 | lintSource / count |
| the guarded spellings of the same discard are flagged too | 81–88 | 87 | lintSource / count |
| guarding the rejection still clears the guarded spellings | 90–94 | 93 | lintSource / count |
| a parse failure is reported, never swallowed as clean | 96–99 | 98 | lintSource / count |
| js/ is clean — no rejection reaches the overlay | 101–103 | 102 | lintSource / count |

## tests/unit/release-provenance.test.mjs

Full read: 1–34; SHA-256 `1d6f674b919486a41a5021bfa8de51b590f31d02f49cd2773da84aa81c9ad3d9`.

Inline stamped HTML and symbolic SHA strings exercise pure parsing/classification/reporting only; no network/live deployment or actual git ancestry lookup. Production anchors: `tools/ci/release-provenance.mjs:24`.

| Case name / meaning | Case range | Assertion spans | Target |
|---|---|---|---|
| release provenance parses the stamped live shell metadata | 5–16 | 11–15 | parseLiveShell / ancestryVerdict / renderMarkdown |
| release provenance rejects an untrusted live sha | 18–21 | 19, 20 | parseLiveShell / ancestryVerdict / renderMarkdown |
| release provenance distinguishes exact deploy from newer source | 23–27 | 24, 25, 26 | parseLiveShell / ancestryVerdict / renderMarkdown |
| release provenance markdown keeps the source/live distinction visible | 29–34 | 31, 32, 33 | parseLiveShell / ancestryVerdict / renderMarkdown |

## tests/unit/reliability.test.mjs

Full read: 1–159; SHA-256 `adf313d45aecdbe56012524aacb13390ec04cd288d8dc1c37f7a557ec00e867d`.

Production hash, career, Parts catalog and reliability run in VM; Math.random throws. Fixed-seed large synthetic fields test deterministic distributions, not empirical racing DNF frequencies; storage/track metadata are doubles. Production anchors: `js/race/reliability.js:41`.

| Case name / meaning | Case range | Assertion spans | Target |
|---|---|---|---|
| OFF (the shipped default) plans nothing and clears a stale plan | 58–66 | 63, 64, 65 | Reliability; `R.arm`, `R.plan`, `R.isLevel` |
| a plan is a pure function of the seed: same seed, same field; another seed, another | 68–76 | 73, 74, 75 | Reliability; `R.plan`, `R.arm` |
| a weaker tier retires more often, and LOW halves the risk | 78–84 | 82, 83 | Reliability; `R.plan`, `R.arm` |
| every planned retirement lands inside the race, with a known reason | 86–93 | 89, 90, 91 | Reliability; `R.plan`, `R.arm` |
| anonymous cars (no driverId/code) still draw distinct DNF plans | 95–103 | 100, 101–102 | Reliability; `R.arm`, `R.plan` |
| team development buys risk back: a developed team retires less, a neglected one more, and OFF career means no relief | 108–119 | 116, 117, 118 | Reliability |
| buildQuality scores the fitted engine and gearbox by cost: dearest = 1, cheapest below it, absent = 0 | 121–138 | 133, 134, 136, 137 | Reliability; `R.buildQuality` |
| the player's developed engine and gearbox cut their DNF risk ~a third — offline only, never networked | 140–151 | 148, 149, 150 | Reliability |
| a tier outside 0..4 clamps to the nearest tier instead of indexing past TIER_RISK | 153–159 | 156, 157, 158 | Reliability; `R.plan`, `R.arm` |

## tests/unit/remote-group.test.mjs

Full read: 1–265; SHA-256 `6081d99614db87d06ed9beec33391e1fdd921afe58d9efb741a0a4f97d54c9f5`.

Pure exported helpers, repository package/workflow text, synthetic timing DB/run logs, usage child processes and local disposable git repos. Test source contains temp-repo setup but no tests were executed for this map. No dispatch/network/runner-performance evidence. Spec-like fake strings and example logs are descriptive fixtures, not source dependencies. Production anchors: `tools/ci/remote-group.mjs:66`.

| Case name / meaning | Case range | Assertion spans | Target |
|---|---|---|---|
| the browser groups are package.json's Playwright scripts, and only those | 20–25 | 22, 23, 24 | remote-group CLI / browser-group workflow |
| plan: a real group and a listed shard count give the matrix; anything else is refused | 27–35 | 28, 29, 30, 33, 34 | remote-group CLI / browser-group workflow |
| CLI: bare invoke / --help print usage — never 'not a group name: undefined' | 37–49 | 38, 43, 44, 45, 47, 48 | remote-group CLI / browser-group workflow |
| the workflow reads its matrix from the plan input, has no plan job, and never interpolates an input into a shell line | 51–70 | 52, 53, 55, 57, 58, 61, 62, 63, 65, 66, 67, 69 | remote-group CLI / browser-group workflow |
| groupFiles: a plain file list (globs expanded) is packable; --project, an env prefix or a node group is not | 85–98 | 86, 87, 88, 89, 90, 94, 95, 97 | remote-group CLI / browser-group workflow |
| expectedSec: the measured whole-run wall when a CI bucket has enough samples, else declared tests × rate | 100–105 | 101, 102, 104 | remote-group CLI / browser-group workflow |
| shardPlan: LPT by measured time; a fat spec is cut into native --shard pieces that avoid sharing a runner; never more shards than units | 107–139 | 109, 110, 113, 114, 115, 116, 117, 119, 122, 123, 127, 128, 130, 131, 132, 133, 137, 138 | remote-group CLI / browser-group workflow |
| runShardArgs: the plan is untrusted text — every unit is checked against the group's script; count plans use --shard | 141–174 | 144, 145, 147, 148, 149, 150, 153, 154, 157, 158, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173 | remote-group CLI / browser-group workflow; `a.startsWith` |
| liveRun: a live run of THIS group on THIS sha is reused, else the newest green one; another sha, group or branch is not | 176–185 | 181, 182, 183, 184 | remote-group CLI / browser-group workflow |
| workers: empty is left empty for parseWorkers; resolveWorkers fills the GL+group default | 187–198 | 188, 189, 190, 191, 192, 193, 194, 195, 197 | remote-group CLI / browser-group workflow |
| pickRun: the newest dispatch of THIS group on THIS branch since the dispatch | 200–215 | 210, 211, 212, 213, 214 | remote-group CLI / browser-group workflow |
| failLines: the reporter's failures from a shard log, Actions timestamps stripped | 217–231 | 224–228, 229, 230 | remote-group CLI / browser-group workflow |
| groupVerdict: a red shard is a red even when the run is still going; cancelled is not green | 233–243 | 237, 238, 239, 240, 241, 242 | remote-group CLI / browser-group workflow |
| --ref still refreshes origin/<branch>: the sha, the green lookup and the workflow check read it | 245–265 | 258, 260, 264 | remote-group CLI / browser-group workflow |

## tests/unit/render-final-contracts.test.mjs

Full read: 1–226; SHA-256 `52dde46b9979f222dbba9d08710b92f94848ea628f5f05b66e05eea2be508828`.

Source-extracted production functions/blocks execute with minimal renderer doubles; projection uses real Three Matrix4/PerspectiveCamera and one game VM. Parameterized warm teardown and material-cap cases expand at runtime. Counters/state establish contracts, not successful backend boot or pixels. Production anchors: `js/render/three/tlx.js:174; js/render/gfx.js:239`.

| Case name / meaning | Case range | Assertion spans | Target |
|---|---|---|---|
| tier-4 recovery keeps inverse projection current through ordinary camera switches | 15–42 | 25, 28–29, 35, 38, 40 | TLX / Gfx / GLX / projection |
| tier 4 keeps the main camera view and inverse projection current across lens changes | 45–83 | 49, 52, 56–57 | TLX / Gfx / GLX / projection |
| coalesced teardown retires object and owned geometry once (warm=${warm}) | 84–97 | 90, 91, 92, 94, 95, 96 | TLX / Gfx / GLX / projection |
| releaseGeometry holds its wrappers until a scene render, bounded by DROP_LATER_MAX | 100–118 | 106, 108, 110, 111, 114, 115, 117 | TLX / Gfx / GLX / projection |
| releaseGeometry holds the coalesced run too (the instanced lit program's last holder); a direct _coDrop does not | 119–130 | 127, 129 | TLX / Gfx / GLX / projection |
| material-array detail ${requested} respects cap ${cap} | 131–134 | 133 | TLX / Gfx / GLX / projection |
| alternate init revocation prevents late canvas claim and publication | 136–142 | 138, 139, 141 | TLX / Gfx / GLX / projection; `G.createInitOwner`, `G.create` |
| alternate init records a context already claimed before timeout | 143–147 | 146 | TLX / Gfx / GLX / projection; `G.createInitOwner` |
| GLX particle buffers retain independent stream payloads and refresh cross-stream epochs | 149–161 | 158, 159, 160 | TLX / Gfx / GLX / projection |
| TLX particle streams refresh when identity, epoch or count changes | 163–175 | 172, 173, 174 | TLX / Gfx / GLX / projection |
| expanded renderer details shows post degradation and deliberate retry, clears on replacement | 177–187 | 182, 183, 184, 185, 186 | TLX / Gfx / GLX / projection |
| material-array detail stays identical between placeholder and late pack upload | 190–193 | 192 | TLX / Gfx / GLX / projection |
| post health distinguishes bounded recovering and exhausted degradation with a bounded reason | 195–204 | 198, 199, 201, 203 | TLX / Gfx / GLX / projection |
| terminal renderer fallback marks degradation and refuses post retry without lit/FX | 207–216 | 214, 215 | TLX / Gfx / GLX / projection |
| post health becomes healthy only after successful post presentation | 219–226 | 222, 224, 225 | TLX / Gfx / GLX / projection |

## tests/unit/render-lighting-prep.test.mjs

Full read: 1–30; SHA-256 `22022f9fcc07c3a8c2c0e7916d6aa0188930f818342203ce9ecf73793078b50c`.

symbolSource slices source to pin extracted phase ownership and ordering after sunPass. Comment/shape-sensitive guards do not execute lighting or prove unchanged visual behavior. Production anchors: `js/game.js:6976`.

| Case name / meaning | Case range | Assertion spans | Target |
|---|---|---|---|
| renderLightingPrep is a named sibling of render() and owns the lighting-prep body | 9–20 | 12, 13, 14, 15, 16–17, 18–19 | renderLightingPrep / render |
| render() calls renderLightingPrep after the sun shadow pass, same order as before the extract | 22–30 | 26, 27, 28–29 | renderLightingPrep / render |

## tests/unit/render-rate.test.mjs

Full read: 1–194; SHA-256 `4f88d14f9b080f5151ab3b1700f762958b55f1c6743658c9276c392211b3557e`.

Fresh source VM and synthetic frame intervals establish cadence/time accounting; final source-shape case checks gate placement around render/HUD. No physical phone refresh, browser rAF or measured performance claim. XR test title mentions carry flushing but assertions only prove every presenting tick draws. Production anchors: `js/perf/render-rate.js:51`.

| Case name / meaning | Case range | Assertion spans | Target |
|---|---|---|---|
| a desktop draws every frame even at 144 Hz | 45–50 | 48, 49 | RenderRate / tickBody; `R.active` |
| a phone at 60 Hz, 90 Hz or 30 Hz draws every frame | 52–59 | 56, 57 | RenderRate / tickBody; `R.active` |
| a phone at 120 Hz trips after a sustained fast cadence, then draws every second rAF | 61–69 | 64, 66, 68 | RenderRate / tickBody; `R.active` |
| no time is lost: the skipped frame's dt and ms are paid into the next drawn frame | 71–78 | 74, 76, 77 | RenderRate / tickBody; `R.active` |
| it leaves when the cadence slows, and flushes the carried time on the next frame | 80–91 | 83, 87, 88, 90 | RenderRate / tickBody; `R.active` |
| a stall or tab resume is not a cadence sample | 93–98 | 97 | RenderRate / tickBody; `R.observe`, `R.state` |
| gate pays a 100 ms frame and does not pay a gap past it or a backwards stamp | 100–130 | 103, 104, 105, 111, 112, 113, 116, 117, 118, 121, 122, 123, 125, 127, 128, 129 | RenderRate / tickBody |
| an immersive session is never gated, and returning from it flushes the carry | 132–138 | 135, 137 | RenderRate / tickBody; `R.active` |
| apex26.renderRate overrides the device class | 140–149 | 143, 146, 148 | RenderRate / tickBody |
| physics is untouched: the fixed-step loop runs before the gate and the gate wraps only render + HUD | 151–168 | 159–160, 161, 162, 163, 165, 166, 167 | RenderRate / tickBody; `RenderRate.gate` |
| drew() reports the last gate verdict (PerfGov.tick judges only intervals that began at a draw) | 170–178 | 172, 175, 177 | RenderRate / tickBody; `R.drew`, `R.observe`, `R.gate` |
| force draws a live preview, flushes skipped time and restarts half-frame phase | 181–194 | 183, 184, 185, 186, 187, 189, 190, 191, 192, 193 | RenderRate / tickBody; `R.gate`, `R.drew`, `R.force`, `R.dt`, `R.ms`, `R.state` |

## Reading and coverage limits

199 test declarations mapped (parameterized loops expand declarations into multiple runtime cases). Helper assertions inside fixtures or local helper functions can be reached in addition to the direct assertion spans; shared replay start preconditions live at fixture lines 53 and 94–95. Source extraction boundary checks are included as assertions, but are weaker than executing complete modules. Historical data is fixture-bound; rates, selected geometry stations and seeded distribution thresholds are finite samples. Notable assertion limits: the real-race “review’s fixes” case (589–636) ends by checking a newly-created caution window is not done; it does not itself assert that a previously consumed window stays suppressed after rewind. The “seat with no real driver” case (311–323) asserts the missing roster seat DNS marker, not the title’s absent-team exclusion branch. The release provenance exact-deploy/source test also checks the merge-base result, using symbolic strings rather than real hashes. No pass/fail verdict is implied by this source map.

## Production navigation index

Runtime anchors below came from attached apex-lsp (module outlines and definitions); target method names in case rows are the test's local aliases. Tool anchors came from declaration source inspection.

| Production home | Symbol → line |
|---|---|
| `js/race/real-race.js` | realLapFor 37; simLapFor 42; paceTable 50; cumTable 92; planFor 119; dnfAtFor 149; cautionsFor 157; properName 178; situation 185; mapField 283; fieldAt 310; paceMul 346; dropSpeed 371; create 383; static isWatch 965 |
| `js/data/real-race-tab.js` | build 154; traceGet 521; tracePut 547; packTrace 573; fetchTraces 621; create 714 |
| `js/race/real-replay.js` | fitFrame 27; mapPoint 98; trackTrace 110; sampleAt 166; highlightsFor 186; reelFor 211; buildTraces 233; create 260 |
| `js/race/broadcast.js` | crossAt 49; towerSample 75; towerAt 98; fmtGap 161; nextEvent 175; battles 195; pipPick 218; shotFor 237; create 243 |
| `js/ui/watch-transport.js` | clock 5; create 10 |
| `js/car/car-body-geom.js` | aeroFlapsGeom 666 (Car3D.aeroFlaps export alias at car3d line 2894) |
| `js/car/car-mesh.js` | init 6; getAeroFlapSet 772 |
| `js/game.js` | redFlagRestart 1654; renderLightingPrep 6976 |
| `js/camera/flyby-seq.js` / `js/camera/flyby-sight.js` | insideProp 172 / transmit 237 |
| `js/race/reliability.js` | buildQuality 41; arm 65; plan 90; isLevel 101 |
| `js/perf/render-rate.js` | init 51; active 69; observe 74; force 90; gate 95; state 131 |
| `js/render/three/tlx.js` | create 174; dropWrapper 3943; materialArrayAnisotropy 4799 |
| `js/render/gfx.js` | createInitOwner 239 |
| `tools/check/reject-lint.mjs` | lintSource 86; lintAll 130; count 144; source body read 86–145 |
| `tools/ci/release-provenance.mjs` | parseLiveShell 24; ancestryVerdict 38; renderMarkdown 48; source bodies read 24–80 |
| `tools/ci/remote-group.mjs` | resolveWorkers 66; browserGroups 73; parseWorkers 80; planMatrix 85; groupFiles 109; expectedSec 124; shardPlan 144; runShardArgs 185; liveRun 223; pickRun 236; failLines 246; groupVerdict 257; fetchOrigin 282 |

Additional production bodies read through bounded LSP: Reliability.arm 65–88; RealReplay.trackTrace 110–159; RenderRate.gate 95. Broad create-function anchors identify closure-owned lifecycle behavior; they do not imply independently resolved lines for every nested method.

## Fixture and production fingerprint inventory

These hashes record bytes used for navigation/fixture provenance, not full-read claims beyond the ranges above.

| Path | SHA-256 |
|---|---|
| `tests/fixtures/openf1-baku-2026-race.json` | `90733ce5cee211dd9fc470a883e802ce1a24cba3aa5768dbd17d3b8f7583df12` |
| `tests/helpers/real-replay-fixtures.mjs` | `416c96384a3b950e355682fee33ff0a7529aae90a58e27c92995cee7b062b536` |
| `tools/lib/game-vm.cjs` | `2fc70b5f4181bc698cbfdc51b6052e253f9b0fffab4fcd00ddfcb7ec0504ddc0` |
| `tools/car/parts-sweep.mjs` | `60df9d4b5ad7080a9c7a4444d892078d271c89030bbedf429efe1f7d01602949` |
| `js/race/real-race.js` | `1b3bada58c2751a5a2b53aca082f6626a209933a130616f3e9513e72a6e5cd11` |
| `js/race/real-replay.js` | `484a8beeed419a7435f3e95774a3f85470d028cfca5a941a92b337717f108165` |
| `js/race/broadcast.js` | `1e3394765127925cc00ecfcef3274456b5ea783a7049d0d0bdf861e53486ddfb` |
| `js/data/real-race-tab.js` | `66a53dd8451e268658c52130ff44da3078fece6f16fe3aea1c6e50af7170a1d7` |
| `js/ui/watch-transport.js` | `f367bd5b61e53587a26c949c12a0943b97b696c14d3ccd256f6cb1e8fa425181` |
| `js/car/car-body-geom.js` | `64e03e1a29424dc31a400125dd58c08d4cc6bb49b5600b61f9922b9774df4ecf` |
| `js/car/car3d.js` | `d2ca91950cf1e65dc4161bda35b23148b409095016ed6618ca8ff7d0f714483e` |
| `js/car/car-mesh.js` | `c13a3031510b4f20ac8c658c300a2e8bcee98f0599c658c5fd59d80deae28003` |
| `js/game.js` | `20990458b493b2cdf6633be6df1eae91c6b820068be48522788d09467130334d` |
| `js/race/reliability.js` | `1750f1fe0e92074989e79320b9b2da5a6d4ecceb1f990b526844dd1e9331e0f8` |
| `js/perf/render-rate.js` | `2d90c3668a64a9cbdb515ecbbe8b4be8fcb34445c229cbb89a8446ca45d4bd82` |
| `js/render/three/tlx.js` | `58669a10791324112e956d2b63adefd0c2b793147945a148d2eda447340922a2` |
| `js/render/gfx.js` | `879c63bb0eb55022f20b43c55e218cba220c896af7dc1da995f5712cd7f9ea3d` |
| `tools/check/reject-lint.mjs` | `4f5fd1ce551a5f0af18149cdc329a17fea496d2c9a031b49ce7419cd2342c46c` |
| `tools/ci/release-provenance.mjs` | `01c2ec15897ab8dbbf91a4c39c311a293c47ecebd1499d1d234dbbf7a6e7f0e3` |
| `tools/ci/remote-group.mjs` | `6a0623f4d8a0691b3b50f7a50c0db59573f95a515c9fd0054c2e767c3abf4644` |
