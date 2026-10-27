# Unit tests group 41 — complete source map

Scope: all 10 files assigned by `unit-batches.json` group 41, 4,954 lines. Read every source line in individually returned windows of at most 100 lines; a truncated aggregate radio output was repaired with a fresh untruncated 1101–1200 read. This is source analysis only: **no tests, browser runs, or production/test edits were performed**. Assertion spans below include every direct `assert.*` call inside each test declaration, including branch/loop assertions; spans identify source, not a verdict. Parameterized expansions are described below.

## Read ledger

| File | Complete read ranges | SHA-256 |
|---|---|---|
| `tests/unit/race-flow-fixes-vm.test.mjs` | 1–100, 101–200, 201–300, 301–400, 401–500, 501–600, 601–700, 701–800, 801–900, 901–1000, 1001–1100, 1101–1189 | `95626dd4a6b8a54f4a76d4ba83c0a097fdb4abc9fc201b5495b93d1abe89ff35` |
| `tests/unit/race-flow-vm.test.mjs` | 1–100, 101–103 | `8bdef9daabf27a0e881ade74fb70024fbdc277cc04bbdfc7f2fa861d3d70850e` |
| `tests/unit/race-insights.test.mjs` | 1–100, 101–200, 201–300, 301–400, 401–500, 501–600, 601–694 | `b31c3bec6212bbd8014a2dfad79966a1876c73852b58b7641cc0457cdf580aa0` |
| `tests/unit/race-radio.test.mjs` | 1–100, 101–200, 201–300, 301–400, 401–500, 501–600, 601–700, 701–800, 801–900, 901–1000, 1001–1100, 1101–1200, 1201–1300, 1301–1400, 1401–1459 | `b03e98e72aa7d5e65da37ad5a79f2a1fc04ff43bd5dbae79e959a3573504ac16` |
| `tests/unit/race-retain-vm.test.mjs` | 1–97 | `c6b84d47f1ab3b3efad8d9fb5cd83761e7d04806aec49bc24fe6162d5bde03f6` |
| `tests/unit/race-session-fixes.test.mjs` | 1–100, 101–121 | `a221acc3bd86ae63ac46c386301ef9367aaf363d73fcf2dcf69a4f6d25e6b75a` |
| `tests/unit/race-session-lazy.test.mjs` | 1–100, 101–151 | `341d8341234fb15e7d4fe7bd4c4e9dde3eea6c875a6e3c0b5396197711eaa8c5` |
| `tests/unit/race-settings-pitplan-key.test.mjs` | 1–100, 101–159 | `e34be43fed6540607b1fecd2a8f78cce6cf1e71af512023ca917a78b41a172c5` |
| `tests/unit/race-settings-vm.test.mjs` | 1–100, 101–200, 201–300, 301–400, 401–500, 501–600, 601–658 | `668923a964291f1ad876be8d2f20995975d054674abfc0d5c25519b044571655` |
| `tests/unit/race-setup-sheets.test.mjs` | 1–100, 101–200, 201–300, 301–323 | `e27480f4efe3f63cd8551d2f368cbdd30fb0862e59db1d78d7d1fd8334f13b55` |

## Fixtures, boundaries, and navigation evidence

`race-flow-fixes-vm`, `race-flow-vm`, `race-retain-vm`, `race-session-fixes`, `race-settings-pitplan-key`, and the live portions of `race-settings-vm` boot `tools/lib/game-vm.cjs` (real game scripts, inert browser/graphics/DOM, controlled timers and physics). Monza is the main track; Bahrain serves pit-work wake-lock tests, Spa drives selection/build transitions, and the retention sequence also uses Suzuka, Monaco and Silverstone. Synthetic placements deliberately bypass complete driving routes. No VM result establishes rendered phone geometry, GPU behavior, real audio playback, real browser wake locks, or general heap growth.
`race-flow-vm` shares a before/after game and ordered state, with AI-only field and seed 17. `race-retain-vm` shares a game, exposes V8 GC only after boot, performs four GC/event-loop turns, and uses WeakRef object reachability rather than memory totals; the garage DOM is explicitly deferred to a browser spec.
`race-flow-fixes-vm` uses barrier hooks in RaceEntryProfile, DOM screen IDs extracted from actual index.html, a portrait-only matchMedia stub, ReplayBuf.create interception, a fake auto-releasing wake-lock sentinel, and source slices of the hit-stop clock. `vm-snippet:game-hit-stop-clock` is a descriptive VM filename, not a repository file. The Baku real-race cases load `tests/fixtures/openf1-baku-2026-race.json`, DataRealRace.build and the STR seat. Optional carMeshes:false avoids unrelated mesh work.
`race-insights` runs RaceInsights alone against hand-updated car/time/sector state, 300 m track, Map store, announcements, fake network and tyre grips. Grid/rival fixtures introduce synthetic opponents and pace history; cooling helpers complete a selected measured lap. The Ghost speed case loads the real Ghost separately with stub store/log. It does not drive the physics model or UI.
`race-radio` loads real RadioVoice, RadioLines, RaceFacts, RaceRadio in one realm seeded with Log and three camera IDs. Its `race()` and 60 Hz `sim()` are kinematic 3200/3000 m fields, not game.js. `watch()` injects real-name/busy hooks. Selected cases add real Spotter, RaceControl, AnnounceBanner, RaceEngineer and TyreModel, with synthetic voice pack and DOM. Message regexes constrain current phrasebook wording; many prose titles are broader than their actual assertions (notably name presence at 273, corner load at 297, FINISH ownership at 363, per-pair 40 s at 612).
`race-session-lazy` uses fake roster, script append/onload replacement, never-resolving loads and short slow/deadline thresholds. A path in that fake LAZY_RACE_SESSION roster describes what the injected script would load; appendChild does not execute a real pit-lane script. `race-settings-vm` and `race-setup-sheets` also use `tests/helpers/mini-dom.mjs`, JSON-backed Map storage, fake Tracks and SettingRow; literal fake Monaco 79 is fixture data, not canonical real-circuit distance. Grid functions are lifted source with SportingRegs and stub season rank; those cases do not run the entire grid setup.
Helpers imported by these files: `tests/helpers/game-source.mjs` (composed game slices/symbolSource), `fn-source.mjs`, `abs-src.mjs` (diagnostic source labels), `seed-log.mjs`, `mini-dom.mjs`, `css-rules.mjs`, `css-source.mjs`. CSS tests parse declarations and source ownership; they do not prove layout/scroll behavior. Descriptive `test` track/class IDs and stub script labels are not nonexistent production dependencies.

LSP used attached `apex_lsp` definition/outline calls for RaceInsights, RaceRadio, RaceFacts, RadioLines, RadioVoice, RaceSettings, SessionEntry, RaceEntryProfile, WeatherArc, PitLane, LazyBundles, LoadingScreen.failed, Ghost.speedAt and RaceControl.finishPending. LSP resolves RaceRadio to both real `race-radio.js:37` and `session-stub.js:100`; Ghost.speedAt is an explicitly labeled text-match fallback because of CommonJS scope. `G.startRace`/`G.quitToMenu` resolve to type contract rows 809/816, not implementation bodies. `G.setPaused` returns “has no member”; the local implementation is separately source-mapped at game.js:9249–9282. Bounded bodies are navigation excerpts, not full-production-file read claims. Source AST ranges establish target boundaries; all tests themselves were read fully.

## Production target key

`game.*` means `js/game.js`: beachedAt 369; simSeed 585–591; sectorAt 1055–1062; gridRule 1611–1614; gridOrderFor 1615–1644; redFlagRestart 1654–1735; clearRacingScratch 1849–1856; dropTrackWorld 1949–1954; raceArmedSentinel 1959; loadTrack 2014–2034; scheduleFlybyTrack 2252–2312; startRaceBody 2471–2719; startRace 2734–2771; endRace 2903–3026; startRaceFromSheet 3978–3987; raceIntroFromSheet 3997–4028; raceIntro 4029–4095; closeRaceSheets 4256–4262; syncRotateBlocker 4277–4303; quitToMenu 4340–4421; releaseFieldScratch 4446–4450; update 4460–4740; updateCar 4820–5300; updateCarBrakePlan 5303–5492; updateCarAdvance 6235–6527; rescuePlayer 6531–6557; checkRetirements 6610–6620; coast 6625–6660; render 7239–8457; tickBody 8502–8615; openQualiBody 8940–8957; openPitWork 9107–9113; closePitWork 9117–9127; setPaused 9249–9282; postFinishWait/skipToResults 9286–9287. Large ranges identify owning functions, not an assertion that every statement is covered.
`RaceInsights.*` means `js/race/race-insights.js`: event 75–77; reset 79; startDrill 80–151; mastery 218–221; finishDrill 222–288; finishCooling 295–311; observeCooling 312–333; observeDrill 334–395; observeRival 401–502; update 503–556; forecast 557–581; network 582–591; debrief 602–616; settle 621–629; summary 630; returned journal/attempt copies 631–632. `Ghost.speedAt`: `js/car/ghost.js` 398–403.
`RaceRadio.*` means `js/race/race-radio.js`: durFor 59–68; create 70–773; reset 145–152; resetTimeline 157–166; offer 179–192; best 194–203; speak 205–235; tvLive 242–246; underLoad 248–251; refreshLastLap 255–265; engineerEvent 268–399; engineerState 402–459; tvEvent 465–545; update 573–629; pump 633–658; request 661–681; replayEvent 686–723; setWatching 725–730; setChat 732–738; setComm 739–744. `RaceFacts.*`: `js/race/race-facts.js`, create 35–396; reset 49–56; timeAt/gap 72–88; rank 124–129; observe 142–388. `RadioLines.*`: `js/race/radio-lines.js`, POOLS 27 onward, fill 136, timeText 153, create 185. `RadioVoice.plan`: `js/audio/radio-voice.js` 234 onward.
`RaceSettings.*` means `js/race/race-settings.js`: presetValues 89–103; matchPreset 106–113; sheetTitle 117–124; draftOf 133–139; draftFor 142–151; buildRaceSettings 178–272; planTrackId 323; paintPlan 327–362; wireRaceSettings 388–424; ensureCustomPreset 501–521; presetDisclosure 525–542; paintHelpDisclosures 548–564; paintPresetState 566–588; applyPreset 590–605; openRaceSettings 622–647; openSettingSearch 651–660; wireButtons 662–719. `WeatherArc.*`: `js/race/weather-arc.js`, planFor 150–157, startChangeable 176–190, endSession 215–220, tick 451–496. `PitLane` is `js/race/pit-lane.js` create 395 onward; stub pin storage is `js/race/session-stub.js` 60–72. LazyBundles.ensureRaceSession is `js/core/lazy-bundles.js` 46 onward; LoadingScreen.failed is `js/ui/loading-screen.js` 975–992; manifest roster is `tools/manifest.cjs` 1041 onward. `RaceControl` owns `js/race/race-control.js` (finishPending 21–30). Other named integration owners are actual runtime dependencies, with evidence hashed below; they are not substitutes for the row-specific primary owners.

Additional LSP owner cross-check: RealRace is `js/race/real-race.js:2` (launch 463–471); DataRealRace is `js/data/real-race-tab.js:2`; DailyChallenge is `js/race/daily-challenge.js:2` (select 58–78, open 82–87, stop 177–183); `QualiModel` is not a symbol (LSP error retained here), and `lsp_symbols Quali` resolves the actual `Quali` in `js/race/quali-model.js:2` (medalFor 80–84, referencePole 207–211, simulate 385–390). SeasonCal.drawRound is `js/career/season-cal.js` 632–635; CustomTracks.afterStart is `js/editor/custom-tracks.js` 538–540; UiExperience.resumeArm is `js/ui/experience.js` 57–63; PlatformSession.create is `js/ui/platform-session.js` 5–485; ReplayBuf.breakTimeline is `js/camera/replay-buf.js` 123–125. Spotter has real and stub declarations; real update is `js/race/spotter.js` 95–154. AnnounceBanner.announce/tick are `js/race/announce-banner.js` 103–153/155–173. RaceEngineer also has real and stub declarations; real update is `js/race/engineer.js` 489–530. PitLane real pinnedStops/setPinnedStops are `js/race/pit-lane.js` 1560–1564 and planFor 1490–1523. These AST boundaries supplement the primary key above.

## Cases

### `tests/unit/race-flow-fixes-vm.test.mjs`

| Exact test declaration name | Test range | Assertion call spans | Production target | Meaning and limit |
|---|---|---|---|---|
| a red flag holds the field: no stuck-rescue kicks for the AI, no rescue for a player on the throttle | 57–92 | 64, 89–90 | game.updateCar / rescuePlayer | 12 s red hold: zero >5 m/s AI kicks and player rescue stamps; spread field isolates red gate. |
| finishers coast home at the floor and never collide with each other | 94–119 | 116–117 | game.coast / update | 9 s staggered finishers: no contact and first car keeps rolling; artificial finished state. |
| the only human retiring retires only the AI it had already PASSED the failure point of | 121–141 | 135–139 | game.checkRetirements / endRace | Solo DNF cap ends results; only already-reached AI hydraulic failure retires; unreached gearbox stays live. |
| AI auto-rescue: a car crawling in the run-off builds its rescue timer; one at race pace does not | 143–161 | 154–155, 159 | game.updateCar / beachedAt | Grass crawl timer exceeds 1 s and rejoins; 45 m/s edge rejoin stays below 0.5 s. |
| a RECOVER or shift-up tapped during the start lights never fires at green | 163–185 | 169, 174, 176–178, 183 | game.update / Input.clearDriveEdges | Grid RECOVER/shift latch clears; gear remains first; live RECOVER is a positive control. |
| a track build that ends during the countdown leaves the race's crash sentinel armed | 187–200 | 194, 196, 198 | game.raceArmedSentinel / loadTrack | Mobile-only raceActive storage remains 1 across count-state loadTrack. |
| a car that reverses over a sector line never records the fragment as a field sector best | 202–222 | 214, 216, 219–220 | game.updateCarAdvance | Reverse S2→S1 then forward does not bank a sub-10 s sector fragment. |
| a backlogged frame reports only the whole steps it drops, never the remainder it carries | 224–239 | 235–237 | game.tickBody | Five-step clamp reports positive whole dropped steps; sub-step remainder excluded. |
| WAITING FOR PLAYERS squelches and speaks on its first show, not on every 3 s refresh | 241–258 | 247, 253–256 | game.update / AnnounceBanner | 20 s pumped wait retains card and records exactly one sting; voice itself unobserved. |
| quitToMenu() during a race load cancels it: the body does not go on to count the grid down | 270–303 | 286–287, 290, 292–293, 298–301 | game.startRace / quitToMenu / SessionEntry | Held cancellable body resolves false; immediate cancellation has canceled/superseded outcome; no round increment. |
| a second startRace() after the first passed raceIndex++ joins it: one race, round +1, state stays count | 305–328 | 318–319, 321, 325–326 | game.startRace / RaceEntryProfile.runSession | Mesh-warm barrier after round increment shares identical promise; one round and count state. |
| manual RECOVER does nothing to a car serving a pit stop; on the track it still puts the car back | 330–346 | 335, 340, 344 | game.update / rescuePlayer | Boxed RECOVER leaves rescue stamp; track RECOVER changes it. |
| startRaceBody aborts to the menu when the race-session bundle failed to load (source-level) | 348–357 | 354–356 | game.startRaceBody | Only composed source regex/order proves load failure abort before audio; no failing-loader runtime here. |
| RESUME holds a solo race ~1.2 s on the start plate, a pause cancels it, and a net race resumes at once | 359–403 | 364, 372, 375–377, 380, 382, 388, 390–392, 400 | game.setPaused / UiExperience | Solo resume holds physics through 1.1 s, restarts 3/2/1, retains RECOVER; network bypasses hold. |
| a flag that falls under the pause closes the pause tools: no lt-open / photo mode / previewed night into RACE AGAIN (2-F1) | 404–424 | 409, 415–416, 418–422 | game.endRace | endRace closes tuner/photo mode and restores previewed time of day; no visual assertion. |
| QUIT from the pit WORK garage closes it at the title without starting the engine (2-F2) | 426–443 | 433, 438–441 | game.quitToMenu | Pit WORK quit closes carsetup/preview and starts no engine loop. |
| championship NEXT ROUND -> qualifying sheet hides the finished race's HUD, so BACK x3 reaches a clean title (2-F3) | 445–461 | 452, 455–456, 458–459 | game.openQualiBody | Next-round qualifying enters menu and hides HUD/lights; asserted before actual BACK sequence. |
| 3.1 a race started on a portrait phone does not start the engine / rain under the rotate blocker | 470–483 | 479–481 | game.startRaceBody / syncRotateBlocker | Portrait media-query stub pauses countdown; startEngine/startRain never invoked while paused. |
| 3.2 a real race (Data Hub JUMP IN) is never diverted into a qualifying sheet when GRID = QUALIFYING LAP | 485–502 | 498–500 | RealRace.launch / game.startRace | Baku fixture launched in STR seat stays race despite quali grid preference. |
| 3.4 practice is per-session: quitToMenu and the top of startRace clear it before the loading card reads it | 504–518 | 510, 512, 515 | game.startRace / quitToMenu | Practice clears on quit and synchronously on start before awaited body. |
| 3.5 quitToMenu after a time trial restores the race tyre model | 520–531 | 524, 526, 528–529 | game.quitToMenu / WeatherArc.endSession | TT disables tyre model; menu restores stored real wear. |
| 3.6 the derived MIXED-weather plan is cached until a setting it reads changes; a host's assigned plan survives settings applied after it | 533–560 | 539–540, 543–544, 546, 550, 552, 557–558 | WeatherArc.planFor | Plan identity caches until laps/weather/track/chip changes; explicit host object survives. |
| 3.12 a finished or retired car's squeal / smoke / ERS cue state is zeroed by its early-out, not frozen at the last value | 562–583 | 573–580 | game.updateCar | Finished/retired early-outs clear skid/brake/throttle/deploy/tow/wake; collision timer decays. |
| 7.6 the AI's mistake-roll key for a braking zone just past the start line is wrapped, like its siblings | 585–597 | 594–595 | game.updateCarBrakePlan | Injected near-line braking-zone key remains within current lap arc. |
| 3.11 race, Daily, race: stopping the Daily resumes the sim stream where it was, instead of rewinding it to the seed | 599–618 | 606, 608, 610–611, 613–614, 616 | DailyChallenge / game.simSeed | Daily takes seed/stream over, stop restores original stream position; explicit seed setter still rewinds. |
| 3.10 pause-menu RESTART does not run the old race through the async start window | 620–642 | 627, 629, 631, 634–635, 637–640 | game.startRace / tickBody | Async restart freezes old race clock until new cars/count reset; field identity anchors window. |
| 3.10b pause-menu RESTART keeps the build plate up and the governor off until the new grid commits (#3283) | 644–668 | 651, 655–656, 661–663, 666 | game.render / startRace | 120 ms rebuild frames retain loading plate and identical governor EMA; stub render errors caught. |
| 3.14 qualifying: TO THE GRID plays the garage drive-out before the countdown (state menu, then the garage), not the card straight up | 686–703 | 695, 699–701 | game.startRaceFromSheet | Quali SIM→GO enters garage while menu, session becomes race; does not inspect complete cinematic. |
| 3.14 qualifying: DRIVE plays the garage drive-out too, and stays the one-lap session | 705–720 | 716–718 | game.startRaceFromSheet | Quali DRIVE enters garage while menu and keeps quali session. |
| 3.14 season NEXT RACE with qualifying off: the garage drive-out, then the race; a headless page still starts at once | 722–747 | 733, 738–739, 741–743 | game.startRaceFromSheet | Season next retains flow; interactive garage versus headless immediate count. |
| launch: Data Hub JUMP IN (opts.intro) plays the garage drive-out before the countdown; a bare launch() still starts at once | 751–776 | 767–769, 771–772 | RealRace.launch / game.raceIntroFromSheet | Baku intro option enters garage; bare launch skips it and counts immediately. |
| launch: a TIME TRIAL and the DAILY, started from RACE SETTINGS, play the garage drive-out; TRY AGAIN after a trial stays a quick restart | 778–804 | 788, 791–793, 797, 800–801 | RaceSettings.wireButtons / game.startRaceFromSheet | TT/Daily start uses garage; post-results TRY AGAIN skips garage and starts quickly. |
| the shell marks every pause-reachable sheet .screen (the sweep's contract) | 816–820 | 818–819 | index.html .screen | Shell tag scan requires all listed pause sheets and loading to carry screen class. |
| QUIT over the pit-stop garage closes it: no turntable, no stale RETURN TO RACE on the title | 822–840 | 828–829, 831–833, 838 | game.quitToMenu / closeRaceSheets | Quit clears pit preview/return route; stale DONE opens settings rather than dead race. |
| the portrait blocker's EXIT under ${sheet.slice(3).toUpperCase()} leaves no race sheet over the title | 843–858 | 851, 853–854, 856 | game.quitToMenu / closeRaceSheets | Expands SETTINGS/STANDINGS/HOWTO; rotate EXIT reveals overlay and closes listed sheets. |
| NEXT ROUND's qualifying sheet hides the finished race's HUD | 861–874 | 866–867, 870–872 | game.openQualiBody | Network qualifying helper closes results and finished HUD; mini-DOM screen list explicitly supplied. |
| a red-flag restart breaks the instant-replay timeline (the re-grid is a teleport, not motion) | 876–900 | 889, 892, 896–898 | game.redFlagRestart / ReplayBuf | ReplayBuf.create interception observes exactly one breakTimeline at red regrid. |
| POST-FINISH (solo): the player's flag does not end the race while an AI is still running; SKIP settles it | 919–931 | 922–924, 926, 928–929 | game.postFinishWait / skipToResults | Player flag waits for AI; pause SKIP ends results without inventing rival finish. |
| POST-FINISH (solo): QUIT TO MENU after the flag settles the result first | 933–943 | 936–937, 940–941 | game.quitToMenu / endRace | Post-flag quit classifies player first before menu teardown. |
| PLAYER DNF (solo): the race keeps running for the field instead of ending 2.2 s later; the cap ends it as a short run | 945–961 | 955–956, 958–959 | RaceControl.finishDelay / game.update | 10 s DNF keeps race running; 90 s cap ends short run with no finisher. |
| a hidden tab under WORK ON CAR shows no pause card, stays the garage's pause, and QUIT takes the garage down | 998–1020 | 1002–1004, 1006–1008, 1010–1011, 1016–1018 | game.setPaused / quitToMenu | Hidden/visible tab round trip keeps garage pause/card ownership; quit releases wake sentinel. |
| the garage's pause never drops the wake lock: the return to the tab re-holds it, and RETURN TO RACE races with it held | 1022–1042 | 1029, 1031–1032, 1035–1037, 1040 | game.setPaused / closePitWork / PlatformSession | Platform hide releases, visible reacquires once; return coalesces; race end releases. |
| QUIT preserves settlement while a ${timing} penalty opportunity is pending | 1060–1083 | 1065, 1067, 1069–1071, 1076–1079, 1081 | game.quitToMenu / RaceControl.finishPending | Expands pre-existing/late +10 s: SKIP/QUIT cannot bypass rival opportunity; rival wins and repeat quit does not resettle. |
| new session clears a deferred finish QUIT | 1085–1095 | 1090–1091, 1093 | game.startRace | Start removes pending quit; normal mid-race quit remains immediate. |
| the finishing-step pass uses its governing flag across ${ending} | 1097–1121 | 1114–1117, 1119 | game.update / RaceControl line-step | Expands green→SC and SC→green: finishing pass penalty uses pre-transition governing flag once. |
| restarted MIXED weather progresses from the fresh race clock | 1123–1134 | 1131–1132 | WeatherArc.startChangeable | Restart MIXED has t0=0 and t=90 after old race clock was 180. |
| impact slow motion clips the final frame to the remaining hold and keeps multiplayer unscaled | 1148–1159 | 1153–1156 | game.tickBody hit-stop | Source-sliced clock over solo/network, zero/30/60/120 Hz dt and partial hold; scale bounded and remainder clipped. |
| impact slow motion loses the same bounded simulation time at 30/60/120Hz and irregular frame partitions | 1161–1176 | 1172–1173 | game.tickBody hit-stop | 0.1 s partitions including irregular frames lose exactly 85% of bounded solo hold; network loses none. |
| deferred QUIT completes when the corrected-time opportunity expires, retaining unfinished classification | 1179–1189 | 1184–1187 | game.quitToMenu / update | 12 s stepping completes deferred menu quit only after corrected finish time; unfinished rival stays unfinished. |

### `tests/unit/race-flow-vm.test.mjs`

| Exact test declaration name | Test range | Assertion call spans | Production target | Meaning and limit |
|---|---|---|---|---|
| a scripted safety car is withdrawn on release, and OVERTAKE stays off until the leader's next crossing | 45–64 | 48–49, 51, 53–54, 56, 59–63 | game.update / RaceControl / otEnabled | Shared Monza AI-only seed 17: held SC withdraws within 1 s; OVERTAKE waits leader crossing. |
| quit-to-menu then start again hands the next race a clean flag, pass-watch, pit and tyre state | 66–86 | 69, 71–72, 75–83, 85 | game.quitToMenu / startRaceBody | Shared boot: menu/new race resets flag debt/pits/tyres/clock and bounds pending timers to baseline+2. |
| a red flag re-grids the field on the stopped clock and leaves no flag flying at the restart | 88–103 | 90, 93, 95–102 | game.redFlagRestart / update | Standing red regrid keeps stopped clock, shared lap, no pits/caution; field subsequently crosses. |

### `tests/unit/race-insights.test.mjs`

| Exact test declaration name | Test range | Assertion call spans | Production target | Meaning and limit |
|---|---|---|---|---|
| race journal records event edges in order without repeating sustained contact | 20–30 | 23, 25, 27–29 | RaceInsights.update / event / journal | Penalty/limits/contact edges preserve order, suppress sustained contact, cap journal128 and return copies. |
| energy forecast requires full clean sectors, excludes the initial partial, and clears on weather change | 31–41 | 34, 38, 40 | RaceInsights.update / forecast | Initial partial excluded; three full sectors yield 0.3 energy/lap; wetness change clears. |
| stint estimate is measured, waits half a lap and stays unknown with wear disabled | 42–49 | 44–46, 48 | RaceInsights.forecast | 140 m insufficient; 150 m gives4.5 laps; wear-off/new stint erase estimate. |
| teleports cannot create tyre history or clean sector mastery | 50–57 | 54–56 | RaceInsights.update / observeDrill | 800 m jump invalidates drill and forecast without mastery save. |
| controlled braking drill finishes once, scores stopping distance and records bounded separate mastery | 58–69 | 61, 64–68 | RaceInsights.finishDrill / mastery | Clean10 m stop saves best/completed once, announces practice tier, and returns defensive summary. |
| the braking verdict measures how much distance went below the car's own hardest braking | 70–85 | 82–84 | RaceInsights.observeDrill / finishDrill | 125 m stop versus measured peak8 deceleration gives100 m limit and25 m slack. |
| a stop held at the peak the whole way reports no slack, and a stop with no braking evidence reports none either | 86–104 | 94–96, 102–103 | RaceInsights.observeDrill / finishDrill | Peak-held80 m has zero slack; missing deceleration has null limit/slack and plain text. |
| a brake tap followed by a coast to a stop is not a controlled stop | 105–115 | 111–114 | RaceInsights.observeDrill / finishDrill | Brake tap/coast fails explicit brake-released reason, no save, retry announce and journal. |
| stopping without ever braking firmly fails the braking drill with its reason | 116–121 | 119–120 | RaceInsights.observeDrill | Weak0.2 brake stop fails firm-braking reason. |
| a contact marks the drill dirty with the first reason; retry clears observation history | 122–128 | 125, 127 | RaceInsights.update / observeDrill | Contact wins first dirty reason; restarted clean attempt forgets previous dirt. |
| rejected ${mode} start preserves the active attempt and measured forecasts | 129–144 | 138–143 | RaceInsights.startDrill | Braking/trail rejected at29.9 preserves existing free drill, forecast, summary and journal. |
| a braking drill admitted at the minimum speed can finish using its first brake sample | 145–153 | 148, 151–152 | RaceInsights.startDrill / observeDrill | Speed30 minimum admits and first firm sample can complete clean mastery. |
| a transient ${name} on the first drill sample prevents clean mastery | 155–162 | 160–161 | RaceInsights.update / observeDrill | Contact/offroad/retirement transient on first sample prevents clean result/save. |
| trail braking needs the car turning while braking and at the release, on a digital brake too | 164–178 | 167, 171, 174, 176–177 | RaceInsights.observeDrill | Stick alone insufficient; actual lateral acceleration and turning release permit digital trail. |
| trail braking that ends in a stop is a failed attempt | 179–185 | 183–184 | RaceInsights.observeDrill | Stopping before trail release fails with reason. |
| slalom counts direction changes of the car, not of the stick | 186–201 | 190, 194, 196, 198–200 | RaceInsights.observeDrill | Stick wiggles do not count; actual six lateral sign changes complete clean slalom. |
| a sector drill announces its time and a stationary slow car is not a direction change | 202–209 | 205, 207–208 | RaceInsights.observeDrill | Slow5 m/s lateral flips do not count; sector crossing completes3 s and announcement. |
| sector mastery follows timing boundaries while other saved drill scores remain valid | 210–232 | 218, 223, 225–227, 229–231 | RaceInsights.mastery | Legacy split-free sector best ignored; changed splits use separate record; braking/lap preserved. |
| drill speeds read through G.dashKph, the speedometer scale, not raw m/s (PACE) | 233–242 | 238, 241 | RaceInsights.kmhOf / finishDrill | Injected dashKph PACE scaling changes braking171 and launch214 labels. |
| launch drill needs a stopped car and is timed from the first throttle to half of top speed | 243–252 | 245–246, 250–251 | RaceInsights.startDrill / observeDrill | Moving launch refused; throttle starts timer, half-top threshold scores2 s. |
| corner drill opens on sustained cornering, bridges a chicane flip, and reports minimum and exit speed | 253–268 | 257, 259, 262–263, 266–267 | RaceInsights.observeDrill | Twitch ignored, sustained corner opens; quick chicane flip remains one attempt; min/exit labels. |
| a corner drill that stops fails with where it stopped | 269–277 | 272, 276 | RaceInsights.observeDrill | Stop before corner and within corner produce distinct failure reasons. |
| a full-lap drill times the lap at the line, announces the start, and fails a backward crossing | 278–292 | 282, 286–287, 290–291 | RaceInsights.observeDrill | Line interpolation91.234 used; start announcement waits line; backwards crossing dirties. |
| attempts are kept per goal as bounded copies and mastery reads the saved best for this class | 293–307 | 300–306 | RaceInsights.finishDrill / attempts / mastery | Twelve attempts cap to newest10, copied defensively; best2/completed12; reset clears attempts. |
| network status reports measured values and clear disconnected guidance | 308–313 | 309, 311–312 | RaceInsights.network | No net returns null; measured60 RTT/130 delay and disconnected false reported. |
| ghost speed derives from recorded arc samples and refuses time outside the lap | 314–323 | 320, 322 | Ghost.speedAt | Recorded linear20 m/s arc gives20 at4.5; missing/outside lap null; store stub only. |
| the round debrief condenses the journal to what costs race craft, biggest cause first | 324–343 | 331–332, 334, 337–338, 341–342 | RaceInsights.debrief | Warnings/penalty/contact grouped by racecraft cost, lap set deduplicated; pit/tyres excluded. |
| a faultless race has an empty debrief, and reset clears it | 344–352 | 347, 349, 351 | RaceInsights.debrief / reset | Clean drive empty debrief; contact creates row; reset empties. |
| a race start drill needs the grid and a field, and says which is missing | 367–376 | 370, 373, 375 | RaceInsights.startDrill | Start needs stopped player and other cars; refusal/acceptance follows fixture field. |
| a race start scores the places gained, ends at the first corner, and ranks more places as better | 378–395 | 380, 391–394 | RaceInsights.observeRival / finishDrill | Clean gained place after sustained first corner scores-1 and P2→P1 text. |
| a race start that never gets away fails with that reason rather than scoring zero | 397–404 | 399, 402–403 | RaceInsights.observeRival | Eight stationary seconds fail never-got-away rather than zero score. |
| the rival drills refuse with the reason, and OVERTAKE refuses a mismatched pace outright | 426–447 | 429–430, 433–434, 437–438, 442–443, 446 | RaceInsights.startDrill / samplePace | No field, too-far/too-close wake and10% pace mismatch refuse; matched pace admits. |
| SLIPSTREAM scores METRES CLOSED, negated so mastery ranks more as better | 449–460 | 451, 455–459 | RaceInsights.observeRival | Real towing while closing30 m completes with negated >20 m score and tow duration. |
| OVERTAKE fails the attempt when the AI simply let you through | 462–474 | 464, 471–473 | RaceInsights.observeRival | Rival letPassT3 exceeds awareness-derived concession delay: completed pass is dirty. |
| DEFEND needs a real attack, and banks the seconds you survived | 476–501 | 480, 485–486, 491, 497–500 | RaceInsights.observeRival | No passOf commitment fails; identity-linked attack then give-up yields negative held seconds. |
| BACKMARKERS counts cars cleared and scores the TIME, not the racecraft | 503–524 | 514, 520–523 | RaceInsights.observeRival | Three seen-ahead slower opponents cleared cleanly score positive elapsed time. |
| BACKMARKERS never scores a FASTER car that merely crosses the half-lap wrap | 526–544 | 536, 542–543 | RaceInsights.observeRival | Faster car half-lap wrap never supplies third backmarker credit. |
| BACKMARKERS refuses when nothing ahead is actually slower | 546–554 | 552–553 | RaceInsights.startDrill | Equal pace opponent refuses with NO SLOWER TRAFFIC. |
| BACKMARKERS credits each distinct opponent once — re-passing one car is not three-car mastery | 556–573 | 562, 571–572 | RaceInsights.observeRival | Repassing same opponent three times remains incomplete; distinct identities required. |
| BACKMARKERS still finishes when three distinct slower cars are cleared | 575–590 | 583, 586–589 | RaceInsights.observeRival | Three distinct slower cars finish clean with cleared3/3 duration text. |
| incident timeline: penalty, invalid lap and contact persist in order with reasons, and re-settling never duplicates | 591–604 | 595–597, 600–601, 603 | RaceInsights.settle / update | Penalty/contact/invalid log persists ordered reasons once per settle; reset creates second session. |
| material weather change restarts measured tyre life without changing the stint | 605–619 | 608, 610, 612–614, 616, 618 | RaceInsights.update / forecast | Wetness0.04 keeps history, cumulative0.08 resets; new half-lap estimates only wet segment. |
| energy history restarts at interruption ${JSON.stringify(transition)} | 622–639 | 628, 630–631, 635, 638 | RaceInsights.update / forecast | Four interruptions clear all energy sectors and rebuild only after three clean full sectors. |
| selected cooling lap reports start/end measurements without awarding mastery | 653–661 | 655–660 | RaceInsights.observeCooling / finishCooling | Cooling measured grain-10pp/grip+5%, null score/no mastery; recovery copied. |
| cooling verdict does not promise recovery from grain alone or dominant blisters | 662–669 | 666–667 | RaceInsights.finishCooling | Grain or grip alone and dominant blister cases report no recovery; blisters retain warning. |
| cooling lap invalidates ${reason} rather than publishing a recovery | 678–682 | 681 | RaceInsights.observeCooling | Fourteen environmental/continuity interruptions fail with null recovery/score. |
| cooling goal refuses scored/tyres-off starts and ignores the partial lap before the timing line | 683–694 | 684–685, 688–689, 692–693 | RaceInsights.startDrill / observeCooling | Scored/tyres-off cooling refused; partial lap excluded; reset clears active/last drill. |

### `tests/unit/race-radio.test.mjs`

| Exact test declaration name | Test range | Assertion call spans | Production target | Meaning and limit |
|---|---|---|---|---|
| every phrasebook line can be spoken inside its own card | 51–70 | 58, 68–69 | RadioLines.POOLS / RadioVoice.plan / RaceRadio.durFor | Every current pool variant with LONG slots must fit planned card life; >100 variants; no playback/audio-duration measurement. |
| a pool remembers recent picks: never the same line twice in a row | 72–81 | 78 | RadioLines.create | Seed7 four-variant pool sampled 50 picks; adjacent repeats forbidden only. |
| a slot that cannot be filled skips the variant rather than saying half a line | 83–91 | 84, 86–90 | RadioLines.fill / create / formatting | Missing slot suppresses variant; six picks choose PLAIN; gap/time/surname formats pinned. |
| the timing-loop gap is the time between two cars at the same line, not prog/speed | 136–149 | 148 | RaceFacts timing checkpoints | 600 timing steps with last-moment braking retain approximately 1 s checkpoint gap. |
| a pass counts only once the new order has HELD | 151–166 | 161, 163–165 | RaceFacts.observe pass pairs | Half-second nose-ahead emits zero; sustained move emits one pass with identity/P1. |
| a pending pass fires on the hold boundary tick and only once | 178–186 | 181, 183–185 | RaceFacts.observe pass pairs | 0.25 s steps fire exactly at 1 s hold boundary and never repeat. |
| a pending pair that leaves the comparison span starts fresh when it returns | 188–203 | 194, 196, 198, 200–202 | RaceFacts.observe pair pruning | Out-of-span pair drops pending history; returned pair needs new baseline then fresh 1 s reversal. |
| a single car moving back a checkpoint preserves unrelated pending passes | 205–214 | 210, 212–213 | RaceFacts.observe pair resets | Unrelated D checkpoint rollback preserves A/B pending pass and identity. |
| reset and a replacement field discard pending pairs and keep current car identities | 216–235 | 224, 227, 229–233 | RaceFacts.reset / observe | Both reset and cloned replacement field rebase; subsequent event points to current objects. |
| the caution edge reads the allocation-free cautionLevel() when the facade has it | 237–256 | 248–250, 253–255 | RaceFacts.observe / order | cautionLevel emits one edge with zero allocating cautionInfo calls; order returns distinct copies. |
| a car in the pit lane is not overtaken — that is a pit stop | 258–269 | 267–268 | RaceFacts.observe pit edges | Pit entry emits one pitIn and zero passes. |
| gaining a place is called, by name, once the pass holds | 273–281 | 279–280 | RaceRadio.engineerEvent / engineerState / tvEvent / update; RaceFacts.observe | P2 info call appears after held player gain; message predicate does not require rival name despite title. |
| a burst of lost places is ONE call with the net change, not one call per car | 283–295 | 292–294 | RaceRadio.engineerEvent / engineerState / tvEvent / update; RaceFacts.observe | Six lost places yield one P7 info call containing net-loss language. |
| nothing below tier 5 is said while the driver is braking or loaded up in a corner | 297–307 | 303, 306 | RaceRadio.pump / underLoad / tvLive | Braking blocks ordinary info then release emits queued P2; corner load itself not injected here. |
| a defend call for a car that has already dropped back is dropped, not said late | 309–319 | 317–318 | RaceRadio.engineerState / offer / best | Blocked defend line expires when rival falls back before card frees. |
| chatter OFF silences the race engineer; flags still reach the card through race control | 321–328 | 327 | RaceRadio.setChat / setComm / update | Chatter off yields no race-radio lines including caution; external race-control card path not exercised. |
| a safety car is tier 5: it goes out even over a busy card and a loaded car | 330–339 | 337–338 | RaceRadio.pump / underLoad / tvLive | SC warning still accepted with busy card and full brake. |
| commentary talks only while the player is watching — a TV camera — unless set to ALWAYS | 341–351 | 344, 347, 350 | RaceRadio.pump / underLoad / tvLive | Cockpit suppresses TV; heli emits lights-out; ALWAYS permits commentary on cockpit. |
| the result is called with the position, after the flag | 353–361 | 360 | RaceRadio.engineerEvent / engineerState / tvEvent / update; RaceFacts.observe | Flagged P3 in four-car field yields podium/position call. |
| the result call IS the flag card: it is on the air within half a second of the line, and game.js's FINISH! stands down for it | 363–377 | 368, 370, 374, 376 | RaceRadio.engineerEvent / engineerState / tvEvent / update; RaceFacts.observe | callsResult false before update, true live, P2 within 0.5 s; OFF returns false; game FINISH source not asserted. |
| RADIO CHECK answers on demand with the position and both gaps | 379–392 | 389–390 | RaceRadio.engineerEvent / engineerState / tvEvent / update; RaceFacts.observe | Input latch request returns P2 with 1.7/2.5 s measured gaps on protected race channel. |
| a second race starts with a fresh radio — game.js never ticks it between races | 396–408 | 407 | RaceRadio.engineerEvent / engineerState / tvEvent / update; RaceFacts.observe | Replacing field and rewinding clock after 200 s still allows next race P2 call. |
| the result is the order the flag fell in, not the cars array (finPos is 0 until endRace) | 410–420 | 417–419 | RaceRadio.engineerEvent / engineerState / tvEvent / update; RaceFacts.observe | Player at array index0 but second finisher gets exactly one P2, no win language. |
| a retirement ahead is told once, as the new place — never as a pass on the car behind | 422–432 | 430–431 | RaceRadio.engineerEvent / engineerState / tvEvent / update; RaceFacts.observe | Retirement ahead emits one new P3/BBB call; no extra position call. |
| a nearby AI mistake triggers engineer + commentary radio lines | 434–454 | 452–453 | RaceRadio.engineerEvent / engineerState / tvEvent / update; RaceFacts.observe | Injected errCount edge yields both engineer attack text and TV mistake naming AAA. |
| a red-flag restart does not read the bunched-up grid as the car ahead closing 6 s a lap | 456–464 | 463 | RaceRadio.engineerEvent / engineerState / tvEvent / update; RaceFacts.observe | Backward red-grid arc resets pace history; no quicker/closing calls in next 30 s. |
| a RADIO CHECK on the tick a safety car comes out does not swallow the safety car | 466–476 | 474 | RaceRadio.engineerEvent / engineerState / tvEvent / update; RaceFacts.observe | Simultaneous Input request and SC retains safety-car event. |
| RaceRadio reads and writes only its own two settings | 478–486 | 480–481, 483–485 | RaceRadio.setChat / setComm / update | Normal/TV defaults, chatty/on persistence, invalid chat level refusal; later APIs own extra settings. |
| a car flagged second is never told it won, whatever it overshot the line by | 524–532 | 530 | RaceRadio.engineerEvent / engineerState / tvEvent / update; RaceFacts.observe | Forty overshoot offsets never label second flagged player winner. |
| after your own stop, the next place gained is called as a gain, not 'DOWN 4' | 534–549 | 547–548 | RaceRadio.engineerEvent / engineerState / tvEvent / update; RaceFacts.observe | Own pit stop resets told-position baseline; later gain calls P6 without stale lost-four text. |
| a lapped player hears the last lap on the last lap, and nothing after the flag but the result | 551–558 | 556–557 | RaceRadio.engineerEvent / engineerState / tvEvent / update; RaceFacts.observe | Lapped player gets last-lap line; engineer debug log ends with result. |
| gaps closed under the safety car are not called as pace after the restart | 560–569 | 568 | RaceRadio.engineerEvent / engineerState / tvEvent / update; RaceFacts.observe | SC compression never becomes false pace-rate language after green. |
| a car that dropped three places at once does not fire a stale pass when it meets them again | 571–580 | 579 | RaceRadio.engineerEvent / engineerState / tvEvent / update; RaceFacts.observe | Three-place rollback then encounter emits no stale front-change language. |
| lap times round before they split: 119.97 s is 2:00.0 | 582–585 | 583–584 | RadioLines.timeText | 119.97 rounds to 2:00.0 before minute split; ordinary 92.44 stays 1:32.4. |
| two cars swapping the lead again and again get one lead-change call per 30 s, not one per swap | 587–601 | 599–600 | RaceRadio.engineerEvent / engineerState / tvEvent / update; RaceFacts.observe | Twelve swaps across minute produce 1–3 lead calls; per-name phrase predicate bounds output. |
| 'out of reach' is an end-of-race call: never on lap one of a short race | 604–610 | 609 | RaceRadio.engineerEvent / engineerState / tvEvent / update; RaceFacts.observe | Chatty short race first minute has no out-of-reach language. |
| commentary leaves room: at least 10 s between ordinary lines, and one pass call per pair per 40 s | 612–631 | 628, 630 | RaceRadio.engineerEvent / engineerState / tvEvent / update; RaceFacts.observe | Ordinary non-lead comm messages stay >=10 s apart and at least two occur; 40 s pair claim not separately asserted. |
| a driver who has finished hears nothing more but their result — not a safety car for the others | 633–644 | 637, 643 | RaceRadio.engineerEvent / engineerState / tvEvent / update; RaceFacts.observe | Finished driver receives no subsequent engineer SC; commentary allowed. |
| paused (a VS FRIEND race keeps running under the menu), the radio holds its lines | 646–656 | 653, 655 | RaceRadio.pump / underLoad / tvLive | Paused keeps output empty; unpause drains pending news. |
| an urgent line refused by a full card queue is offered again, not lost | 658–667 | 665–666 | RaceRadio.pump / underLoad / tvLive | First three urgent race-card refusals are retried and final lap eventually accepted. |
| a player flagged first with a time penalty is not told they won when a rival crosses inside it | 670–681 | 675, 678–680 | RaceRadio.engineerEvent / engineerState / tvEvent / update; RaceFacts.observe | Five-second penalty defers result; rival at +3 s yields one P2, no win. |
| a penalised player flagged last still hears the result before endRace (no one left running) | 683–694 | 692–693 | RaceRadio.engineerEvent / engineerState / tvEvent / update; RaceFacts.observe | No running rivals permits penalized P3 result within 2 s. |
| under a safety car a place changing is not called as a move | 696–705 | 704 | RaceRadio.engineerEvent / engineerState / tvEvent / update; RaceFacts.observe | SC position swap emits no move/praise language. |
| a lap that ends green but ran under a VSC is not called slow | 707–720 | 719 | RaceRadio.engineerEvent / engineerState / tvEvent / update; RaceFacts.observe | Lap containing VSC but ending green never gets slow-lap criticism. |
| a red-flag re-grid reorders the field without a pass being called, then or after the lights | 722–737 | 735–736 | RaceRadio.engineerEvent / engineerState / tvEvent / update; RaceFacts.observe | Count-state reordered regrid emits neither false pass nor second lights-out. |
| a penalised player who takes the flag last hears the result before race control ends the race | 739–748 | 746–747 | RaceRadio.engineerEvent / engineerState / tvEvent / update; RaceFacts.observe | Finished+retired rival mix permits one penalized P3 before 2.2 s deadline. |
| a one-lap race still gets attack and defend calls: it is all last lap | 750–755 | 754 | RaceRadio.engineerEvent / engineerState / tvEvent / update; RaceFacts.observe | One-lap race still emits rival-named attack/range text. |
| a rival's lap time that arrives after its lap count (VS FRIEND) is still timed, and can take the fastest lap | 757–769 | 768 | RaceFacts.observe lap edges | Delayed rival lastLap after lap edge still overtakes player fastest record. |
| two finishers are ordered by their own flag times, not by the tick the radio saw them cross | 771–781 | 780 | RaceFacts rank / finish events | Actual finishT puts rival first although observed a tick later. |
| everyone in: a penalty-held finish is released before endRace, not lost | 783–804 | 802–803 | RaceFacts.observe / RaceControl.finishDelay | RaceFacts+RaceControl simulated finish loop ends and releases player finish event beforehand. |
| reset() forgets the last race's pit exit, so this race's pace rates are not muted | 806–823 | 821–822 | RaceFacts.reset | Reset clears stale t300 pit exit; pace rate appears; no-reset negative control remains null. |
| the TV last lap follows the LEADER's laps: a retired player still hears it | 825–832 | 831 | RaceRadio.engineerEvent / engineerState / tvEvent / update; RaceFacts.observe | Retired player still hears TV leader last lap. |
| a player racing on the lead lap hears the last lap once — the engineer's, not the commentator's too | 834–845 | 836, 838, 840–842, 844 | RaceRadio.engineerEvent / engineerState / tvEvent / update; RaceFacts.observe | Lead-lap active engineer calls last lap once without duplicate TV; chatter OFF relinquishes ownership. |
| queued driving advice is discarded when a caution starts, the driver retires, or a pit stop begins | 847–859 | 852, 857 | RaceRadio.engineerState / offer / best | Three changes (caution/retirement/pit) delete previously pending attack. |
| a queued low-battery warning is dropped after the battery recovers | 861–867 | 864, 866 | RaceRadio.engineerState / offer / best | Recovered energy deletes pending battery warning. |
| a flag accepted into the card queue retains a live validity check | 869–878 | 875, 877 | RaceRadio.engineerEvent / speak | Accepted VSC card validity flips false after current flag changes. |
| reset removes old facts and prevents a status reply from the previous session | 880–888 | 882, 884–887 | RaceRadio.reset / request | Reset clears facts/log and request; next update rebuilds facts. |
| alongside traffic holds routine radio but a safety-car instruction still goes through | 890–903 | 896–897, 899, 901 | RaceRadio.pump / Spotter | Stub occupied spotter blocks routine chatter; SC passes; clear traffic unlocks. |
| local yellow instructions use the protected race channel | 905–909 | 908 | RaceRadio.engineerEvent / speak | Local yellow uses warning kind. |
| a WATCH speaks the replay's highlights through the commentator, on any camera, by the REAL names | 921–940 | 925, 927–928, 934, 937–938 | RaceRadio.setWatching / replayEvent / resetTimeline / request | Pass/pit/out/fastest/SC highlights map real hook names/time on any camera; zero engineer output. |
| a WATCH that starts mid-race (or rewinds) never calls LIGHTS OUT, and says no engineer line | 942–949 | 947–948 | RaceRadio.setWatching / replayEvent / resetTimeline / request | Rewind mid-WATCH emits neither lights-out nor engineer messages. |
| rewinding a WATCH releases future cooldowns and allows the replayed pass to be heard | 951–965 | 957, 961–962, 964 | RaceRadio.setWatching / replayEvent / resetTimeline / request | Backward cut frees future cooldown, replay pass speaks once anew; immediate repeat still suppressed. |
| an explicit WATCH timeline cut drops pending copy and can accept its new event before the next update | 967–982 | 973, 976, 978, 980–981 | RaceRadio.setWatching / replayEvent / resetTimeline / request | Explicit forward seek clears pending lead and accepts destination retire event before update. |
| a WATCH timeline cut halts the active voice and invalidates already accepted announcement cards | 984–1006 | 993–994, 997–998, 1002–1003, 1005 | RaceRadio.setWatching / replayEvent / resetTimeline / request | Timeline cut halts voice once and invalidates downstream accepted card; ending WATCH invalidates new card too. |
| RADIO CHECK stays silent during WATCH, including a real team radio clip | 1008–1019 | 1013, 1015, 1018 | RaceRadio.setWatching / replayEvent / resetTimeline / request | Manual request empty both with and without replay clip; live control answers. |
| a WATCH holds its commentary while a real team radio clip plays, and says it after | 1021–1031 | 1027, 1030 | RaceRadio.setWatching / replayEvent / resetTimeline / request | Busy real-radio hook holds commentary then releases exactly one line. |
| a WATCH has no spotter: no 'car left' round a puppet, and a live race still gets one | 1033–1069 | 1065, 1067–1068 | RaceRadio.setWatching / replayEvent / resetTimeline / request | Real Spotter with fake pack calls Car left live; WATCH emits none and reports trafficBusy false. |
| trafficSide: the spotter's left/right occupancy reaches the HUD with the spoken spotter OFF and no pack | 1071–1114 | 1094–1095, 1098, 1100, 1102, 1104, 1106, 1108, 1110, 1113 | RaceRadio.setWatching / replayEvent / resetTimeline / request | Real Spotter returns left/right/both/clear despite speech OFF/no pack; pause/WATCH clear occupancy. |
| replayEvent outside a WATCH, with commentary OFF, or after the WATCH ends is a no-op | 1116–1129 | 1119, 1122–1123, 1127–1128 | RaceRadio.setWatching / replayEvent / resetTimeline / request | No WATCH, commentary OFF, or ended WATCH rejects replayEvent. |
| observe reuses one answer: f is the latest facts, ev only this tick's events | 1136–1152 | 1142, 1145–1149, 1151 | RaceFacts.observe reusable answers | observe reuses wrapper/facts, clears prior events, preserves current lap/fastest and clears missing-player result. |
| observe ranks the field at 10 Hz, not every physics step | 1157–1176 | 1173, 1175 | RaceFacts.observe rankAcc | Intercepted byRace sorts occur 1–10 times in 60 updates while clock stays current; allocation CPU benchmark absent. |
| WATCH rewind rebases cooldowns so later distinct commentary can speak | 1178–1186 | 1182, 1185 | RaceRadio.resetTimeline / replayEvent | 600→60 rewind lets distinct faster lap commentary speak before old time catches up. |
| current caution invalidates delayed TV and replay flags through the real announce queue | 1188–1232 | 1195, 1219, 1223–1225, 1231 | RaceRadio.tvEvent / replayEvent / AnnounceBanner | Real banner queue discards accepted stale SC and permits green plus valid VSC/SC/red/green once. |
| last-lap urgent retries refresh the battle and retain one final-lap reminder | 1234–1261 | 1241, 1252, 1254–1257, 1259 | RaceRadio.refreshLastLap / engineerEvent | Four refused-final-lap scenarios refresh lead/ahead/defend/calm copy; exactly one accepted reminder. |
| accepted live race cards cannot survive a new field or a radio reset | 1263–1287 | 1271–1272, 1274, 1279, 1285 | RaceRadio.reset / speak validity | Accepted SC remains valid during pause, invalidates immediately on field replacement or reset, never revives. |
| commentary OFF permanently discards accepted WATCH copy without suppressing new news | 1290–1308 | 1297–1298, 1300, 1302, 1306–1307 | RaceRadio.setComm / speak validity | Commentary OFF→ON permanently discards accepted WATCH copy; fresh green remains valid. |
| the real announce queue plays a burst in priority order, penalty-hit over penalty-warn over warning, capped at QMAX | 1338–1350 | 1341, 1348–1349 | AnnounceBanner.announce / tick | Real bounded banner burst starts FIRST/hit/pw and sheds weakest comm; not browser rendering. |
| engineer lines and a BOX call survive a saturated announce queue; announce-refused stays bounded | 1363–1414 | 1405–1406, 1410, 1412–1413 | RaceRadio.pump / AnnounceBanner / RaceEngineer.update | Real tyre model/engineer/banner saturated 35 s retains engineer output, <80 refusals, and BOX on stop lap. |
| engineer OFF permanently invalidates accepted last-lap copy, including OFF then ON | 1416–1432 | 1422–1426, 1428, 1431 | RaceRadio.setChat / speak validity / queue | OFF persists and permanently invalidates accepted last-lap; new SC after normal remains valid. |
| engineer OFF clears refused pending urgent copy before chatter is re-enabled | 1434–1444 | 1438, 1440, 1443 | RaceRadio.setChat / speak validity / queue | OFF clears refused urgent internal queue; ON does not revive old last-lap offer. |
| engineer chatter changes preserve accepted WATCH commentary and valid non-OFF modes | 1446–1459 | 1450, 1452, 1456–1458 | RaceRadio.setChat / speak validity / queue | Engineer setting changes preserve TV generation and non-OFF/invalid edits preserve accepted engineer card. |

### `tests/unit/race-retain-vm.test.mjs`

| Exact test declaration name | Test range | Assertion call spans | Production target | Meaning and limit |
|---|---|---|---|---|
| after qualifying -> race -> QUIT TO MENU, cars is the race's field, not the qualifying field | 43–64 | 50, 52, 58, 63 | game.startRaceBody / quitToMenu | Real one-car qualifying then full race retains race array identity on quit. |
| monza -> QUIT TO MENU -> spa: the monza track object is collected | 66–76 | 71, 75 | game.releaseFieldScratch / clearRacingScratch / dropTrackWorld | WeakRef/explicit GC proves old Monza object collectable immediately after Spa build, before Spa step. |
| five circuits raced in a row: only the last stays reachable | 80–94 | 93 | game.releaseFieldScratch / clearRacingScratch / dropTrackWorld | Five raced circuits all collect after sixth build; no heap-size/browser/garage-DOM claim. |

### `tests/unit/race-session-fixes.test.mjs`

| Exact test declaration name | Test range | Assertion call spans | Production target | Meaning and limit |
|---|---|---|---|---|
| 1: sprint and GP qualifying of one round draw different fields through the real model | 53–63 | 57, 59–61 | Quali.simulate / SeasonCal.drawRound | Real sprint/race stages differ deterministically; GP drawRound retains original round. |
| 3: ANY deleted quali lap is NO TIME, never the model's (a valid lap keeps its own time) | 65–80 | 69–70, 72, 76, 78 | game.updateCarAdvance / endRace / Quali | Incident-invalid qualifying produces NO TIME; valid lap positive control retains real time. |
| 5: S1+S2+S3 equals the lap time — S3 closes at the line, not a whole step past it | 82–107 | 100, 102, 104–105 | game.updateCarAdvance / RaceControl.lineTransition | Injected sector crossings make sum equal lap within 1e-9; lap interpolation removes overshoot. |
| 6: a committed startRace calls CustomTracks.afterStart (the armed test-drive return is placed) | 109–121 | 118–119 | game.startRace / CustomTracks.afterStart | Armed custom return dispatches same object once after committed start. |

### `tests/unit/race-session-lazy.test.mjs`

| Exact test declaration name | Test range | Assertion call spans | Production target | Meaning and limit |
|---|---|---|---|---|
| manifest keeps session-stub on FULL and pit-lane in LAZY_RACE_SESSION | 15–22 | 17–21 | tools/manifest.cjs FULL + LAZY_RACE_SESSION | Static manifest membership pins stub/full and lazy pit/radio; coach remains FULL. |
| session stub installs PitLane/Reliability and create() is inert | 24–45 | 30–32, 34–35, 37–39, 41–44 | session-stub.js | Inert stub API/defaults only; no live pit/reliability behavior implied. |
| ensureRaceSession reinjects real PitLane and calls onRaceSessionReady | 47–94 | 90–93 | LazyBundles.ensureRaceSession / ScriptLoader | Synthetic appendChild replaces PitLane flag and onload; one readiness callback and requested URL. |
| ensureRaceSession slow load shows SLOW CONNECTION on the loading card | 97–122 | 121 | LazyBundles.ensureRaceSession / LoadingScreen.slowNotice | Never-loaded fake script plus 30 ms slow threshold changes loading text by 120 ms; not real network. |
| LoadingScreen.failed shows Retry + Back to menu and resolves the choice | 125–145 | 138–139, 141, 144 | LoadingScreen.failed | Mini DOM clicks each button and checks promise retry/back; hidden loading returns back. |
| startRace retries the race-session load on Retry and quits to menu on Back | 147–151 | 149–150 | game.startRaceBody | Source regex pins retry loop and failure teardown; does not perform a failed start. |

### `tests/unit/race-settings-pitplan-key.test.mjs`

| Exact test declaration name | Test range | Assertion call spans | Production target | Meaning and limit |
|---|---|---|---|---|
| STRATEGY after a pick: the pin is asked and written for the selected circuit, no plan from the built one | 25–104 | 43, 53, 56–64, 67–69, 71, 73–74, 76–77, 80, 83, 85–86, 89, 92–93, 100, 102 | RaceSettings.planTrackId / paintPlan / wireRaceSettings; PitLane pin storage | Real PitLane over held Monza world reads/writes selected Spa; validates AUTO, malformed/custom/legacy IDs and repaint after flyby builds Spa. |
| fresh STRATEGY pins persist through the lazy PitLane handoff | 107–159 | 117–118, 121–122, 124–126, 128–129, 136, 139, 141, 144, 147–148, 154–155, 157 | session-stub.js pin storage → PitLane pin storage | Fresh stub persists namespace pins without world; replacing real model shares stored Spa selection and row continues working. |

### `tests/unit/race-settings-vm.test.mjs`

| Exact test declaration name | Test range | Assertion call spans | Production target | Meaning and limit |
|---|---|---|---|---|
| FULL is the circuit's own distance and differs between circuits | 46–49 | 47–48 | Tracks.LIST gpLaps | Monaco full exceeds Spa and Silverstone; roster data assertion. |
| a lap count on the ladder survives a circuit change | 51–56 | 54–55 | RaceSettings.buildRaceSettings | Room-mode 25 rung survives Silverstone→Monaco. |
| a FULL race picked on a shorter circuit is FULL on a longer one (below-full snap) | 58–62 | 60–61 | RaceSettings.buildRaceSettings | Shorter full snaps upward to Monaco full. |
| a FULL race picked on a longer circuit is FULL on a shorter one (above-full snap) | 64–68 | 66–67 | RaceSettings.buildRaceSettings | Longer full snaps downward to Spa full. |
| time trial keeps its own ladder and never snaps to a grand prix distance | 70–75 | 73 | RaceSettings.buildRaceSettings | TT rung 4 stays 4 across Monaco. |
| solo setup initializes once per track and preserves a draft on re-entry | 77–87 | 79, 83–86 | RaceSettings.openRaceSettings | Solo first entry defaults 3, same-track edit survives re-entry, new circuit resets. |
| REMEMBER LAST RACE SETUP: a stored raceDraft opens the next solo circuit in the live game | 89–107 | 94–97, 99–101, 106 | RaceSettings.openRaceSettings / draftFor | Stored 10/rain/night/MIXED and FULL/fog restore; deleting draft returns default 3. |
| settings search reveals tyre wear without staging or normalizing the race draft and returns to search | 150–165 | 154–159, 161–164 | RaceSettings.openSettingSearch / wireButtons | Search navigation preserves draft/store, invokes arrival/return once; ordinary entry still defaults. |
| settings search cannot reveal race preferences during a live, championship, TT or room session | 167–174 | 170, 173 | RaceSettings.openSettingSearch | Live race, TT, career, season and room refuse search without callbacks. |
| REMEMBER LAST RACE SETUP: START with 10 / rain / night opens the next circuit the same way | 176–189 | 178–179, 182–183, 185–188 | RaceSettings.wireButtons / draftOf / openRaceSettings | START saves exact draft once; next circuit restores 10/rain/night/MIXED. |
| REMEMBER LAST RACE SETUP: FULL is a rung, so it maps to the new circuit's FULL | 191–206 | 196–197, 199, 202–205 | RaceSettings.draftFor / draftOf | FULL token adapts 44→79; numeric rung survives or caps, malformed drafts rejected. |
| REMEMBER LAST RACE SETUP: championship, time trial, the Daily and a VS FRIEND room neither save nor restore | 208–236 | 218–220, 224, 230, 234–235 | RaceSettings.openRaceSettings / wireButtons | Season/career/TT/Daily/room neither restore nor save draft; lobby confirm starts no race. |
| a championship's 57 LAPS is clamped to a shorter FULL, never raised to a longer one (ed11e6108) | 238–260 | 247, 249–250, 252–254 | RaceSettings.buildRaceSettings / SeasonCal.formatLaps | Real 57-lap season remains 57 at Monaco and clamps down at Spa. |
| NEXT ROUND clamps the format distance to the next circuit's FULL, and restores it after a short one | 262–287 | 283–285 | game.startRaceBody / results next handler | Configured long→short→long next-round route runs 57→full→57. |
| REVERSE TOP 10 flips the qualifying top ten and leaves 11+ as they qualified | 304–309 | 307–308 | game.gridOrderFor / SportingRegs | Pure lifted code reverses top ten only; null qualifying order remains null. |
| REVERSE STANDINGS grids the last-placed driver first, championship only | 311–318 | 314–315, 317 | game.gridRule / gridOrderFor | Pure standings reverse applies only championship and respects supplied sprint result. |
| STANDINGS (champ) grids a no-qualifying championship in points order (FIA 2026 SR B2.5.4(a)) | 320–334 | 325–326, 328–330, 332–333 | game.gridOrderFor / SeasonCal.rank | Pure points order consumes one discarded draw/car; empty table defaults without draws. |
| REVERSE STANDINGS on round 1 (nobody scored) grids on pace order, as STANDINGS does | 336–344 | 341–343 | game.gridOrderFor | All-zero reverse standings defaults to pace without draws. |
| a qualifying championship and a time trial ignore the rule; RANDOM spends one draw per car | 346–356 | 349–350, 354–355 | game.gridOrderFor | Quali/TT bypass rules; random deterministic draw vector sorts expected order once/car. |
| RANDOM falls back to the pace order in a room — peers share no seed | 358–371 | 367–368, 370 | game.gridOrderFor | Network random returns null without draws; same vector still sorts solo. |
| REVERSE STANDINGS spends the grid jitter it does not use, so the stream does not shift | 373–384 | 382–383 | game.gridOrderFor | Reverse standings consumes grid jitter once/car to preserve stream position. |
| RANDOM in the live game: the same seed grids the same field, and it is not the pace order | 386–407 | 395–398, 400, 402, 404, 406 | game.gridOrderFor / game façade setters | Actual seed11 random repeats, differs tier; façade validates grid/quali boolean view. |
| the medal ladder is monotone and the reference pole slows with the pace slider | 411–427 | 413–418, 421, 425 | Quali.medalFor / referencePole | Gold/silver/bronze thresholds and invalid times; halved PACE slows Monza pole >30%. |
| a MIXED race arms a weather arc at the start and walks it; the plan is the seed's | 434–464 | 439–442, 448–449, 453–454, 458, 461–462 | WeatherArc.planFor / startChangeable / tick | Seed/counter plan repeats; explicit fog200 wins; arc moves weather then menu restores dry. |
| a time trial never arms the arc, and MIXED off means no arc | 474–483 | 477, 481 | WeatherArc.startChangeable | TT and MIXED-off starts have no weather arc. |
| TODAY's challenge stages the day's circuit as a time trial with the day's seed | 487–496 | 489–493, 495 | DailyChallenge.open | Fixed date Daily starts TT on chosen track/weather/seed and ends on quit. |
| a red flag re-grids in race order to re-run the current lap, keeps the clock, and resumes at lights-out | 500–529 | 508, 510–511, 513, 516–521, 524–525, 527 | game.redFlagRestart | Red restart preserves order/clock, rewinds one lap, stops all cars, refuses second call, resumes. |
| the STRATEGY row follows TYRE WEAR: hidden when wear is off, a pin persisted per circuit when on | 536–566 | 543–544, 547–548, 550–551, 553, 555, 557, 559–560, 563 | RaceSettings.paintPlan / PitLane | Wear gates strategy; actual pin storage/AUTO and 2-stop three-stint bar/loss text. |
| paintPlan hides STRATEGY when the live model is off, even if the store says wear is on | 568–590 | 573–574, 581–582, 585 | RaceSettings.paintPlan | Regex and live model disagreement hide row/bar until model enabled. |
| tile -> SETTINGS -> weather/time chips -> RACE! builds the world once; only a build-key change restarts | 602–658 | 624, 627, 629, 637–639, 642–643, 647–648, 651, 653–656 | game.scheduleFlybyTrack / raceIntro | Instrumented paced build: weather/day-equivalent reuse; dark restarts once; RACE joins without sync rebuild; render errors ignored. |

### `tests/unit/race-setup-sheets.test.mjs`

| Exact test declaration name | Test range | Assertion call spans | Production target | Meaning and limit |
|---|---|---|---|---|
| matchPreset: 3-lap default draft is CUSTOM (null); weekend/quick/endurance match | 109–122 | 111–114, 116–118, 121 | RaceSettings.matchPreset / presetValues | Pure full=57 cases distinguish CUSTOM/default and three named presets. |
| sheetTitle: WEEKEND · QUALIFYING FIRST when weekend matches and quali is next | 124–133 | 125–132 | RaceSettings.sheetTitle | Pure title precedence covers qualifying, completed quali, custom, practice, TT and room. |
| paintPresetState lights CUSTOM when no preset matches; weekend lights weekend | 135–160 | 140–147, 149, 152, 154–159 | RaceSettings.paintPresetState / ensureCustomPreset | Mini DOM checks CUSTOM non-writable/disabled/hint/pressed; weekend state and START QUALIFYING. |
| preset disclosure keeps its open state and hides when presets do not apply | 162–179 | 167–168, 172–174, 177–178 | RaceSettings.presetDisclosure | Disclosure node/open state survives repaint; TT hides both summary and row. |
| setting help preserves descriptions, open state and hidden-row ownership across paints | 181–245 | 212–215, 217–224, 228–232, 238–240, 243–244 | RaceSettings.paintHelpDisclosures | Seeded help retains aria-describedby/node/text/open state; duel/status/live stay direct and hidden mixed row owns disclosure. |
| race-setup.css keeps a display-only rule for #rs-preset-custom | 247–250 | 249 | css/race-setup.css #rs-preset-custom | Parsed declaration pins default cursor only; no rendered pointer evidence. |
| race presets restore balanced wrap and a --tap floor (phone portrait 2×2) | 252–277 | 255–270, 273–275 | css/race-setup.css #rs-presets | Parsed responsive rules pin balanced basis/tap floor/captions and reject orientation contexts; no pixel layout proof. |
| season-setup uses dark color-scheme so native thumbs follow Apex chrome | 281–285 | 283–284 | css/race-setup.css #season-setup | Parsed dark/light theme color-scheme declarations only. |
| paired panes theme thin scrollbars and suppress the ScrollFade double bar | 287–297 | 290–296 | css/race-setup.css paired panes | Parsed paired-pane thin scrollbar/padding/pseudo-element rules; no native scrollbar screenshot. |
| stacked season setup keeps one themed scroll owner on #ss-body | 299–307 | 302–306 | css/menus.css family stacked season setup | Composed menus CSS pins one stacked scroll owner and visible pane overflow. |
| preset chips are a balanced-row with a quarter-row basis (no REVERSE orphan) | 309–317 | 310, 312–316 | SeasonUI preset markup / css/race-setup.css #ss-presets | Season source markup regex plus parsed quarter-row basis/min/max widths; wrapping itself unrendered. |
| .track-row:hover is gated on (hover: hover) and (pointer: fine) | 320–323 | 322 | css/race-setup.css .track-row:hover | Parsed hover rule context must combine fine pointer and hover capability. |

## Parameterized declarations and helper assertions

Each table row maps one source declaration; generated cases are not omitted: flow-fixes portrait EXIT expands pm-settings, pm-standings, pm-howto; finish QUIT expands pre-existing/late; governing flag expands green-to-SC/SC-to-green. Insights rejected start expands braking/trail; first sample expands contact/offroad/retirement; energy interruption expands stint increment, compound change, wear rollback, pit lane; cooling invalidation expands off track, contact, pit, invalid lap, caution, stint, compound, wear rollback, weather, track replacement, lost measurement, practice ended, position jump, clock reset. Loops within a test are scenarios in that declaration rather than extra test registrations.
Assertions in reusable helpers outside a declaration also contribute: flow-fixes `pitGarage` line 986 checks initial wake lock and `justFinishedPlayer` line 1056 checks finished-player/unfinished-rival preconditions; `impactClock` line 1140 checks snippet boundaries. flow-vm `fresh` line 40 checks new field identity. race-session-fixes `flyingLap` line 49 checks real crossing. Nested callback `assert.fail` at settings-vm 170/173 is included in the declaration spans. No assertion-free declaration was treated as a runtime pass.

## Evidence hashes for production, fixture, and helper dependencies

| Path | SHA-256 |
|---|---|
| `js/game.js` | `20990458b493b2cdf6633be6df1eae91c6b820068be48522788d09467130334d` |
| `js/race/race-insights.js` | `43f5438cdf48522439d1cba58eac6e732aabd14bc8013d5d9d95fd46ca8e29e4` |
| `js/race/race-radio.js` | `0a2a4008e68347afffea98bc1b5de29e1dc459c0d98a2431576683535ce12196` |
| `js/race/race-facts.js` | `2b742656c2b681033316d33b94f49600a206ef93c941820824c1ae55e51a94c4` |
| `js/race/radio-lines.js` | `947f41fc4181ac09642c80056cef4fc9217a405c2572b4afe2850e77f13bd021` |
| `js/audio/radio-voice.js` | `f8a98e7ab66d88105f2db793bea781da8ecfb49bfdc86fb2618e6a248248968a` |
| `js/race/race-settings.js` | `ce990121d0c41f64547ecd8a7d6f811b7bd1861f19f6f4879c180ce41d15c0f5` |
| `js/race/session-stub.js` | `3d4901ac0bfdcf9025225759fc35020068c42b4dd1fb2fd5e43aad3eb1e78d1f` |
| `js/race/session-entry.js` | `f91d5eeb0a5072d3f85f6e0b4f86056af512fda0697c1e6813ab9b618362dee7` |
| `js/perf/race-entry-profile.js` | `34aeba8a5d0bc643aa5b886369c5096176b4d1e31a4bf5ffa952562128a7715e` |
| `js/race/weather-arc.js` | `f37f07774dd376bb19dfaa88c0894b099cb7b542b46caf8ebbd81f2370bc8b1f` |
| `js/race/pit-lane.js` | `a18b42d5620d85cb61c3fa5e6b99ac9cb2df45312aeedde44fe11ae13da15d1b` |
| `js/race/race-control.js` | `1dfaf228a9906bc173fdccad5e6605514cc530fdc48ff9883935813c80dd67ca` |
| `js/core/lazy-bundles.js` | `1a25b67bbb1041ef6d4d50cf1c988d101b9ec9026993cb930ff1accec9660e52` |
| `js/core/script-loader.js` | `4fa6f897fc043cf45ffc0b564ac03d9b50a5510e7442289ddd0c0c02d4d22762` |
| `js/ui/loading-screen.js` | `10e41fe7df89e96271b724ecfb35c433f67b46a05bdf3a1a9d14e8e14614c2a5` |
| `js/car/ghost.js` | `873140e9265c5060d0994a888fabcf2f5c26f6da92a0ab386c725480e2ed2321` |
| `js/race/spotter.js` | `a52c0b2b273ba0a5a2870737b42b800253ca4abaa4c8ac88e65588ec19d42931` |
| `js/race/announce-banner.js` | `8ac250c9f99150e7acad993e88a5a2937b8070895cf677ace50d1f22568809eb` |
| `js/race/engineer.js` | `cd435157a1c854c286818c26cfec5cae0ef0e1af7509ca8cf79faeaeb14d6d87` |
| `js/physics/tyre-model.js` | `e106913104138c815ed086a6ba34753b3393770de166e1a80d3eb9404c98aea1` |
| `js/data/real-race-tab.js` | `66a53dd8451e268658c52130ff44da3078fece6f16fe3aea1c6e50af7170a1d7` |
| `js/race/real-race.js` | `1b3bada58c2751a5a2b53aca082f6626a209933a130616f3e9513e72a6e5cd11` |
| `js/career/season-ui.js` | `6cdc235d596f846f9f06e2d499bd971481da327096ff3c8327dfcf0aefeb5274` |
| `tools/manifest.cjs` | `bc6440de131fd98aa6f8eb7df5a6ba09b9796d256b01379869e37389f31abbeb` |
| `tools/lib/game-vm.cjs` | `2fc70b5f4181bc698cbfdc51b6052e253f9b0fffab4fcd00ddfcb7ec0504ddc0` |
| `index.html` | `198787c00ff4055628ee7c524dff5453c5bc90ee6724948304d4f41d32499348` |
| `css/race-setup.css` | `57666de08cc805e268a7df72e2086c242b19a127db6cd9e5efc4ecf3a70ab061` |
| `css/menus.css` | `a951584a190be9e59323eb0f677692bec86a75177f692a862270967e97dfc117` |
| `tests/fixtures/openf1-baku-2026-race.json` | `90733ce5cee211dd9fc470a883e802ce1a24cba3aa5768dbd17d3b8f7583df12` |
| `tests/helpers/game-source.mjs` | `2128e7f89b961235d0521d5d516cf57867296e3f1f841abe1c5cc8d9c283b044` |
| `tests/helpers/fn-source.mjs` | `3f40d63e82348c9e48ed950481386b75d3f8c17c03502748aa600d1444ae9e19` |
| `tests/helpers/abs-src.mjs` | `f33a40d278e2ec7ab00571e2020304a9c21b300861bba501c799947560e32d47` |
| `tests/helpers/seed-log.mjs` | `b4104089fb78794e16e7e40d8f467d7e49f8deb0a9ed260d6f387bfa2d1f69c1` |
| `tests/helpers/mini-dom.mjs` | `3406f017e765ad4cfef78493aafa8da95846a0e1cb9d28b28a53abd2b296e5c1` |
| `tests/helpers/css-rules.mjs` | `31386fa434392a93826b1f8197b310378bf00eead431d10fd38a5130b9866a28` |
| `tests/helpers/css-source.mjs` | `434b8bcb5a8b1b7ff7e3d52b292f8d0a1726db49dbc655b85538bcb005df571a` |
| `js/race/daily-challenge.js` | `4bc3631c088a32d91bad20d9f18a5254bb06d497cd8261b5f9296c00c1333a06` |
| `js/race/quali-model.js` | `862483da27e204ea2224d9b408971948e4f0822d88f93cdb81e26f364b7cd205` |
| `js/career/season-cal.js` | `f7a455b7b37beeed3b796b8608569662ecbcabb157e5de342adf52de63b9163f` |
| `js/editor/custom-tracks.js` | `060b22134e9f11d71158ef90887683f1a99133c998c7b13b549bcadc45bed9f6` |
| `js/ui/experience.js` | `43b625515fa11b9a9b38856f8e0c1fed9da96267104c9eee4266efb98e442be7` |
| `js/ui/platform-session.js` | `a95c6d6cc78b4f9241e50f5bd1996f5dca89179471fc2a0415e6f8ebd3862658` |
| `js/camera/replay-buf.js` | `531a8e9df6a0911a67bac103e5fc138b6e9cca0b17f4194947262b90d351a344` |
| `js/race/sporting-regs.js` | `16b56fc69ebb783d47fa19c2658d6d368c56fc0a0c656899615f6203dcb06652` |
