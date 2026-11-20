# Audit — Apex 26 (browser racing game), build 1695

Cold audit of the tree as shipped on this branch: static HTML/CSS/JS, three.js in `vendor/`, no build step,
no documentation. Everything below was learned from the code and from running the game.

## How it was done

- **Ran it.** Served the folder with `python3 -m http.server` and drove it with headless Chromium (Playwright):
  title, every menu destination, track select, race setup, and races. The machine only has a software
  rasterizer (a CPU profile of a race shows 98.9 % of the time in native raster code, not in the game's
  JavaScript), so real frame rates could not be measured here. Races were instead run through the game's own
  test API (`window.__apex`, `js/agent/apex.js`): `headless(true)` + `step(1/60, n)` advances the real
  simulation, so a 5-lap, 22-car race takes about 20 s.
- **Read it.** About 235,000 lines of JavaScript outside `vendor/`, in 628 files. The reading was split
  across parallel sub-audits by subsystem; each had to prove a claim by executing the real code (in the page
  or in Node) or by quoting it. I re-checked the claims ranked below against the code myself.
- **Tooling.** A type-checker-backed code-intelligence tool (`tools/mcp/lsp-mcp.mjs`, from the base branch)
  was used for definitions, callers and diagnostics. I fixed several defects in it on the way (see the end).

Each finding says how it was confirmed: **ran** (reproduced in the browser or simulation), **executed**
(real function run in Node or in the page with the shown input), **measured**, or **read**.

## Findings, ranked by impact on a player

### 1. The pages' own Content-Security-Policy blocks most of their inline scripts — **ran**

`index.html:5` allows inline scripts only by SHA-256 hash, and four of its seven inline scripts no longer
match any listed hash (`index.html:7`, `:93`, `:162`, `:337`). `controller.html:5` has the same problem for
three of its four (`controller.html:15`, `:285`, `:438`). Chromium logs "Executing inline script violates
the following Content Security Policy directive" for each on every load. What is lost:

- **No service worker.** `index.html:93-161` is the only place `sw.js` is registered. Measured:
  `navigator.serviceWorker.getRegistrations()` returns 0. So no offline play, no install-time caching, and
  every visit depends on the HTTP cache for ~790 requests (finding 17).
- **No error screen and no recovery.** `index.html:162-334` installs the global error overlay,
  `window.__apexReportError`, and the RELOAD / BACK TO MENU buttons. Measured: after an uncaught error,
  `#__err_overlay` does not exist and `typeof window.__apexReportError === "undefined"`. Together with
  finding 8 this turns any persistent frame error into a silent freeze.
- **No build number.** The same script sets `window.__APEX_BUILD`; it is `undefined`, so lazily loaded
  scripts are requested as `…?v=0` (`js/core/script-loader.js:34`) and never change cache key between builds.
- **No double-tap / pinch guard on phones** (`index.html:7-39`).
- **The phone-controller page is dead.** `controller.html:438` is the script that wires the whole page
  (`PhonePad.pad({...})`). Ran: the CONNECT button has no handler and `window.__apexPad` is undefined.

Likely cause: the inline scripts were edited (their comments are gone) without recomputing the hashes.

### 2. Track limits: one long excursion counts as several strikes, and the HUD implies a reset — **ran**

`js/game.js:3368-3389`. In a race the fourth strike costs 5 s and so does every strike after it. That part
is the documented rule — How To Play says "the fourth and every one after it in the race cost five seconds
each" (`index.html:2482`) — so it is **not** a bug, and I did not change it. (An earlier draft of this audit
ranked it as one; reading the help text corrected that.) What remains:

- `c.offT = -2` (`:3373`) re-arms the timer while the car is still off the road, so one continuous 8 s on the
  grass counted three strikes (+15 s once past the fourth). A player who spins onto the grass and takes time
  to rejoin is charged repeatedly for one mistake.
- The HUD shows four dots and "TRACK LIMITS n/4" (`js/ui/hud.js:1359-1367`), which reads as a counter that
  starts again after the penalty; time trial and qualifying do reset it at four (`js/game.js:3380`).

### 3. The gap to the car ahead/behind is not a time gap and swings about 3× within a lap — **ran**

`js/ui/hud.js:253` shows `dist / vFloor`, where `vFloor = Math.max(player.speed, G.vTop() * 0.26)`
(`:1313`); `js/ui/hud-relative.js:116` and `js/ui/hud-strategy.js:107,127` do the same. It is distance
divided by the player's *current* speed, so it balloons in slow corners. In a 6-lap Bahrain race the same
car ahead read 4.29 s at 244 m and 13.0 s at 305 m thirty seconds later. The undercut/cover cues compare this
number with pit-lane loss, so they flicker.

### 4. Changing team between season rounds strands your points on the old seat — **ran**

Season points are keyed by seat (`js/game.js:832`, `js/core/store.js:647`: `teamId + ":" + driverIndex`),
and the team picker stays available mid-season (`js/ui/select-screen.js`, `#sel-car` is hidden only when the
season is complete). The team setting is also shared with single-race mode, so running one Grand Prix in
another car between rounds moves your season seat. Ran: 3 points scored as Red Bull seat 0, switched to
Haas; the final table credits those points to the AI now in that seat and the player has 0.

### 5. Damage can never be repaired when tyre wear is OFF — **ran**

`js/race/pit-lane.js:21`: `enabled() { return !!(z() && G.tyres && G.tyres.on()); }` — the whole pit lane is
switched off with tyre wear, but damage is a separate race-setup option (`js/race/race-settings.js:383`).
Ran with tyres OFF and damage HANDLING: after a front hit the pit cannot be armed, and a lap later front
grip is still 0.876 of normal. With tyres REAL the same hit is repaired at the stop. Related, read only:
`js/race/damage-handling.js` applies handling loss to the player's car only, never to AI cars.

### 6. AI cars ram and queue behind a car stopped in a corner — **ran**

Player held stationary on the racing line: at Bahrain (30 % of the lap) 19 hits within about 10 s of the
field arriving; at Monaco 67 hits and 52 AI rescue teleports, with cars stuck behind for 13–23 s. On a
straight the same parked car is avoided cleanly. The player is then retired as "stationary" after 60 s, and
the race is force-classified 75 s later even if nobody has finished (`js/race/race-control.js:27`): in a
2-lap test the results screen came up with 0 of 22 cars finished.

### 7. A setup comparison overwrites your tuned setup, and a reload makes that permanent — **executed**

`js/garage/setup-trials.js:44` writes the baseline (or candidate) to the persistent setup key; the setup to
restore lives only in a module variable (`:7`). Reload during the comparison run and `SetupTune.get` returns
the works baseline; the tuned candidate is gone. Two related share-code defects in `js/ui/share-code.js`:

- **Undo does nothing in a career but reports success** (`:312`): the restore filter
  `/^(setup|livery|livery\.custom)\.[a-z0-9_-]+$/` rejects career keys (`careerSetup.<flavour>.<slot>.<team>`,
  `js/garage/setup-tune.js:11-13`). Ran: import, UNDO → "Share code undone", setup unchanged.
- **Livery codes do not reach a My Team car**: the import writes the free-play keys, but a My Team career
  reads the livery from the career identity (`js/car/custom-liveries.js:58-66`). Ran: "Livery loaded", car
  unchanged.

### 8. Eight consecutive bad frames stop the game for good, with nothing on screen — **ran**

`js/game.js:4833-4840`: once `LoopHealth.fault(e)` returns false (`js/perf/loop-health.js:160-166`, 8 in a
row or 240 total) the frame is not rescheduled. The only caller of `LoopHealth.recover()` is the BACK TO MENU
button in the inline script that finding 1 blocks. Ran with an injected fault: `stopped: true` after about
133 ms, and no frames after the fault was removed.

### 9. A full disk silently drops settings — **ran**

`js/core/store.js:137-147`: when a write through the "raw" lane fails, `rawSet` records the failure but
never notifies subscribers, unlike `write()` at `:105`. The "not saving" warning (`js/ui/select-screen.js:46`)
only reacts to that notification. Ran with localStorage filled to quota: `rawSet('musicVol', …)` returned
false, nothing was stored, the setting appeared to apply, and `#save-warning` stayed hidden. 55 call sites
use this lane.

### 10. Saving a shared copy of your own circuit silently renames it; bad track links vanish — **ran**

- `js/editor/custom-tracks.js:92-105,277`: a custom circuit's id hashes its geometry only, so saving a
  friend's copy of the same layout replaces your entry's name and country with theirs, with no prompt.
- `js/editor/custom-tracks.js:496-497`: a `#track=` link that fails to decode (the usual case: truncated by a
  chat app) is stripped from the URL and only logged. Ghost and setup links do announce the failure.

### 11. The performance governor accepts a sustained slowdown instead of shedding quality — **executed**

`js/perf/governor.js:83,264,271,276`. With automatic resolution on (the default) the "normal" frame time
drifts up to the slow one during the ~5 s resolution retry, so the quality-tier branch never fires.
Synthetic 60 Hz trace, 30 s at 30 fps: ends at tier 0 with 30 fps accepted as normal; with auto-resolution
off the same trace sheds and recovers 60 fps. Also:

- `js/perf/loop-health.js:87-92` calls an unbound `document.getElementById` (`const g = document.getElementById; g("carsetup")`),
  which throws "Illegal invocation"; the catch returns false, so the garage and race-setup screens never
  count as cover for the stall watchdog.
- `js/perf/race-entry-profile.js:231-241` tests `typeof G` and `typeof loadingScreen`, which are locals of
  `js/game.js`, never globals — the countdown exemption is always false.
- When the watchdog reloads it also sets `apex26.envProbeOff` / `apex26.perChunkOff` in localStorage
  permanently (`js/perf/loop-health.js:120`); on phones one tier shed lasts the whole session
  (`js/perf/governor.js:260`).

### 12. Penalties: unlabeled reasons and a false start for holding the throttle — **ran**

- `js/game.js:397` and `:406` add safety-car-overtake and blue-flag penalties without setting `penaltyWhy`.
  The results sheet (`js/ui/results-sheet.js:365`) then shows a bare "+10s", or attributes the total to
  whichever other penalty did set a reason. Ran: `pen=40, penaltyWhy=null`.
- Holding the throttle through the lights gives "+5s FALSE START" with the car stationary
  (`js/game.js:2780`, `js/race/sporting-regs.js`, threshold 0.12). Probably intended, but players used to
  pre-loading the throttle will read it as a bug.

### 13. HUD and results-screen display errors — **ran**

- Desktop helmet camera: the default layout is applied with touch values before the `desktop` class is set
  (`js/ui/hud-layout.js:90`), so the gearbox overlaps the energy gauge until the layout is next re-applied.
- Touch landscape (844×390): penalty and radio cards are clipped mid-line (`css/hud.css:722,791-795`);
  "+5s PENALTY — OVERTAKING UNDER CAUTION" loses "UNDER CAUTION".
- "POS -/22" for the whole countdown (`js/ui/hud.js:1143-1144`); grid position is known.
- Results list contacts before the first line crossing as "LAP 0" (`js/race/race-insights.js:35`,
  `js/ui/results-sheet.js:331`).
- Captions: "SPOKEN ONLY" behaves exactly like "ON" (`js/ui/captions.js:79`), and the spotter shows no text
  at all with sound off (`js/race/spotter.js:81`).
- Phone portrait (390×844): the "Add to Home Screen" banner covers SETTINGS / HOW TO PLAY / SAVES until
  dismissed.

### 14. Smaller rule and mode defects — **ran / executed**

- **Daily challenge rolls over at local midnight** (`js/race/daily-challenge.js:13-15`). At the same instant
  Auckland gets a different track and weather from London, and a shared daily link opens the recipient's
  day (`js/ui/title-flow.js:108-109`).
- **Career driver code is not checked against the grid** (`js/career/career-ui.js:1605`). Choosing "VER"
  gives two VERs in the standings, a goal reading "Finish ahead of VER", and that driver's ratings.
- **CATCH-UP stops helping cars more than half a lap behind** (`js/physics/ai-band.js`): the nearest 7 cars
  ran +18 %, the other 14 got nothing, so the option spreads the field out.
- **Wet races:** every AI car makes an intermediate-to-intermediate stop it does not need, and the plan bar
  shows a dry S/M/H plan (`js/race/pit-lane.js:606-607`).
- **The designer rejects 9 of the 52 shipped circuits** when used as a START FROM template, and FIX ALL
  cannot repair two of them (Silverstone, Korea).

### 15. Watch / broadcast mode — **ran / executed**

- The overlay shows 20 rows for a 22-car field (`js/overlay/render.js:4`, `overlay.html` tower height); a
  player in P21–P22 never sees their row.
- "OVERTAKE — X PASSED Y" appears when Y retires (`js/race/tv-graphics.js:70` ranks only running cars).
- The FASTEST LAP card can never appear (`js/race/tv-graphics.js:9` reads fields no car has).

### 16. Multiplayer and security — **executed / ran**

- A modified guest can cheat trivially and the host accepts it: lap credit only requires `total/200` s
  between laps and position may jump anywhere (`js/net/netplay.js:35,57-71`); qualifying accepts any time
  over a fixed 20 s (`js/net/quali-wire.js:9`).
- A link with `?apex=1&bridge=<n>` on a device that holds a bridge token posts device facts to that issue
  number with no prompt (`js/core/lazy-bundles.js:580`, `js/agent/apex-bridge.js:538-548`). The token only
  ever goes to api.github.com for the one hard-coded repository, and commands are accepted only from the
  owner, so impact is low.
- `apex26.tiltDeg` from localStorage reaches `innerHTML` unescaped (`js/input/steer-tuning.js:246,254-257`,
  `js/ui/dom.js:14-18`). Not script execution (the CSP blocks it) and only reachable by editing storage.
- Checked and sound: peer messages are whitelisted and size-capped, names render through `textContent`,
  share codes survive deflate bombs and 3,000 mutations, the rendezvous worker validates size, slot and
  method, Spotify uses PKCE with state checking.

### 17. Load weight — **measured**

First load of the title screen: **792 requests, 13.6 MB** uncompressed, about 350 of them render-blocking
`defer` scripts; then lazy bundles for tracks, garage, audio and circuits. Many files are fetched four times
(workers re-importing the same scripts). With no service worker (finding 1) nothing is precached.

### 18. Dead and duplicated code, structure — **measured / read**

- About 18 MB of shipped assets are referenced by no runtime code: `assets/atlases/*.png` (15 MB) and
  `assets/source/*.blend` (2.4 MB).
- `js/render/shared/puddles.js` is loaded on every page (`index.html:2811`) and used by nothing. About 100
  exported functions have no caller and no textual mention anywhere else (e.g. `CareerBackup.writeSlot`,
  `SeasonCal.resetConfig`, seven `TrackDesigner` setters).
- `sw.js` content-hash and integrity checks are inert: every static reference is `?v=dev` and `index.html`
  has no hash block, so `verifyHashedResponse` / `reuseHashed` (`sw.js:530,549`) never match.
- Three ignored arguments: `js/physics/wall-clamp.js:101` passes the street-circuit flag to
  `AiDrive.wallAiScrub()`, which takes none (`js/physics/ai-drive.js:853`), so AI wall scrub is the same on
  street circuits; `js/game.js:2715-2716`; `js/car/cockpit-rig.js:241`.
- Structure a new maintainer will trip on: `js/game.js` is one 5,534-line async function; `index.html` is
  294 KB with 1,302 ids and 20 dialogs; 310 ordered `defer` scripts share one global scope (570 top-level
  names, 2,035 `typeof X !== "undefined"` guards); 30 globals are declared twice, once as a placeholder stub
  (`js/audio/stub.js`, `js/race/session-stub.js`) and again by a lazy bundle; three full renderers
  (three.js WebGPU by default, WebGL2 fallback, raw WebGPU opt-in) are parallel reimplementations; the
  lazy-file list is maintained by hand in both `js/roster.js` and `sw.js:184-500`.

## Checked and found sound

- **Simulation:** fixed 1/60 s physics step with an accumulator capped at 5 steps (`js/game.js:4883-4898`);
  no NaN or Infinity in any car field across full races on Bahrain, Monaco, Silverstone, Spa, Imola and
  Zandvoort, including pit stops, safety car, red flag and retirements; lap, sector and finish logic correct;
  a race after a heavy session is bit-identical to the same seed after a trivial one.
- **Leaks:** heap, DOM nodes, listeners and textures are flat from race 1 to race 3.
- **Pit stops:** stationary time 2.2 s at both 1/60 and 1/30 steps; two-compound rule enforced for player and
  AI and waived in the wet; ERS store stays within [0, 1].
- **Season and career maths:** six simulated career seasons and seasons with sprints, drop rounds and
  fastest-lap points; driver and constructor totals agree every round; tie-breaks correct; a round cannot be
  replayed or re-rolled by reloading.
- **Data:** all 52 circuits build with closed loops, sane widths, racing line inside the road, valid pit
  lanes; meta, lore and elevation ids all match.
- **Menus:** every title destination opens, closes on Escape and returns focus; modal focus traps hold;
  no duplicate ids; no missing locale keys; ~135 save keys survive ten kinds of garbage values.
- **Static checks:** no file is unloaded and no reference is broken; no call anywhere to a module or
  factory member that does not exist (checked against 488 modules and 503 factory shapes); a 30-rule lint
  found only intentional idioms.

## Not covered

Real frame rates and GPU behaviour (software rasterizer only); real touch, tilt, gamepad and VR hardware;
multiplayer with a live peer; audible audio and system text-to-speech; Firefox and Safari; the raw WebGPU
renderer (no adapter on this machine). All 25 sub-audits reported; their later findings are in the addendum.

## Addendum — findings from the later sub-audits

Not folded into the ranking above; A1–A3 and A14 would sit in the top ten.

- **A1. Voice packs fail on slow connections and re-download every 30 s** — **ran**. `js/audio/voice-pack.js`
  used one 15 s timer for the manifest, the whole binary and the hash check; the default announcer pack is
  4.0 MB, so anything under about 2.1 Mbps got a silent announcer. Fixed (fix 10).
- **A2. Settings uses about 58 % of a phone's width** — **ran**. `css/settings.css:3`. Fixed (fix 11).
- **A3. On desktop the keyboard and controller binding tables are hidden** — **ran**. `js/ui/key-binds.js:249`;
  settings search says the bindings are "unavailable on this device". Fixed (fix 12).
- **A4. A daily-challenge link announces one circuit and opens another** — **ran**.
  `js/ui/title-flow.js:105-109`: when the link's day is not the recipient's local day, the banner still names
  the sender's track ("Daily challenge — MONACO") while the recipient's own daily (Albert Park in the test)
  opens. The help text says the daily is "the same for every player" (`index.html:2527`); it is keyed on the
  local date (finding 14).
- **A5. Practice "saved best" is shared across circuits and cars in races** — **ran**.
  `js/race/race-insights.js:104` keys on `G.records.key()`, which is only set in time trial
  (`js/game.js:1454`); a braking drill in a Monaco race overwrote the Bahrain entry. The braking score is raw
  stopping distance, so braking from a lower speed always sets a "NEW BEST" (`:150-152`).
- **A6. One play with a wrong device clock wipes daily history and freezes the streak** — **executed**.
  `js/race/daily-challenge.js:46-55`: a day dated a year ahead prunes every earlier day and the streak cannot
  grow until that date arrives.
- **A7. In toggle-throttle mode a controller that drops out silently comes back accelerating** — **ran**.
  `js/input/input.js` (`pollGamepad`, the no-pad branch around `:1118-1140`) clears the throttle but not the
  toggle latch, and does not pause the game as a real disconnect event does.
- **A8. RESET GARAGE TO DEFAULTS deletes career car setups** — **read**. `js/ui/settings-export.js:412,630`
  matches the `careerSetup.` prefix, while its tooltip says "Career and settings are never touched" (`:1042`).
- **A9. The iOS "Add to Home Screen" banner covers title buttons and passes taps through** — **ran**.
  `css/touch-controls.css:79-88` (`pointer-events: none`), `js/ui/platform-session.js:57-87`. At a real
  Safari viewport (390×664) it covers HOW TO PLAY and SAVES & DATA; tapping the banner opens the hidden
  button underneath.
- **A10. Focus is lost after visiting race setup** — **ran**. Title → RACE → RACE SETUP → Escape → Escape
  leaves focus on `<body>` (likely `js/ui/modal.js:202` recording a stale opener).
- **A11. Smaller:** Data Hub tab labels collide at 320 px wide without touch; at 320×568 seven title
  destinations hide behind the sticky bottom row with no scroll cue; five text styles fail WCAG AA contrast
  (`css/carsetup.css:313,354`, `css/data.css:296`); `GameAudio.collision` throws on a non-finite side value
  (`js/audio/engine.js:1894`, not reachable with finite car positions); turning sound off as the very first
  click still downloads 3.6 MB of audio; `ReplayBuf.lerpCar` loops forever on an infinite heading
  (`js/camera/replay-buf.js:51`, no producer found); the same race seed only reproduces on the first race
  after a page load (`js/game.js:1341,1522,3446`).

- **A12. A lap-challenge link whose `~` was percent-encoded is refused when opened but accepted when
  pasted** — **ran**. `js/ui/share-code.js` `codeFrom`. Fixed (fix 15).
- **A13. The circuit detail panel stays empty if opened while the circuit is loading** — **ran**.
  `js/ui/select-screen.js:1109-1131`. Fixed (fix 16).
- **A14. Service-worker update path** — **ran**. After a release, a slow connection turned the cached game
  into the browser's error page (`sw.js`, navigation handler, `BUST_WAIT_MS`), and a restarted worker could
  report a build it had not installed, which made the page refuse every lazy load. Both fixed (fixes 17, 18).
  Still open: offline, TRACK DESIGNER does nothing and says nothing (`js/editor/` is never precached;
  `js/editor/custom-tracks.js:398` only logs), while Settings says the core game is ready offline.
- **A15. An AI shove on the player is about twice the designed cap** — **executed**.
  `js/physics/collide.js:431` caps the speed a human gains from an AI hit per pass, but
  `resolveCollisions` runs up to 4 passes (`:504`); a rear-end at 20 vs 50 m/s gave +4.79 m/s against a cap
  of 2.93.
- **A16. Wind is on in time trial but ghosts and leaderboards ignore it** — **ran / read**.
  `js/race/race-settings.js:263` shows WIND (default REAL) in time trial, physics applies it
  (`js/game.js:2991,3641`), and the record key has no wind field (`js/race/session-records.js:30-35`), so
  laps with and without wind share one leaderboard and gusts make laps vary run to run.
- **A17. Career import accepts an unknown team or an impossible round** — **ran**.
  `js/career/career-backup.js:82`, `js/career/save-migrate.js:272-275`. With team "nosuchteam" the player
  silently races and is paid as Verstappen; `season.round: 500` is accepted. Also: opening the new-career
  wizard on an empty slot and leaving changes which career "continue" resumes (`js/career/career-ui.js:248`).
- **A18. SPOKEN LANGUAGE offers languages the game cannot speak** — **read**. `js/audio/panel.js:65`,
  `js/audio/radio-voice.js:388`: any choice but English turns off the recorded voice and has a system voice
  of that language read the English text, or nothing if none is installed.
- **A19. Text and units:** the results screen names a "VS FRIEND" button that is called RACE A FRIEND
  (`js/ui/results-sheet.js:481`); the HUD markup says KM/H but shows KPH; the cockpit gauge and pit-lane
  sign ignore the mph setting (`js/car/cockpit-rig.js:616`, `js/garage/pit-signs.js:69`); "CLOUDY" in race
  setup is "OVERCAST" in the summary and in-race banner (`js/race/race-settings.js:4,280`); daily history
  prints raw seconds (`js/ui/title-menu.js:135-136`); two tooltips show source paths (`index.html:2682`).
  Translation is dormant: 23 tagged nodes of about 1,190 in `index.html` and about 800 hard-coded strings.
- **A20. In a championship sprint the setup sheet and forecast use the full race lap count** — **executed**.
  `js/race/race-settings.js:280,353` against `js/game.js:1438`; the forecast differed from the weather
  actually raced in 130 of 200 seeds.
- **A21. Licensing, as shipped:** `assets/sfx/f1_engine.mp3` and the six music tracks have no licence on
  record (disclosed in the credits); real team, driver and supplier names are used with a disclaimer that
  covers only the Formula 1 marks. THIRD-PARTY-NOTICES matches `vendor/` and `assets/`.

- **A22. Spamming RECOVER CAR gave a much faster, fully valid race lap** — **ran**. `js/game.js:3812-3824`:
  recover straightened the car on the racing line and kept its speed, with no cooldown, so full throttle
  plus recover three times a second lapped Bahrain in 97.2 s against 135–138 s driven and a 120.6 s fastest
  AI lap; the wrong-way auto-rescue likewise U-turned the car at 200 km/h. Would rank in the top five.
  Fixed (fix 22).
- **A23. A car stopped on the racing line gets about 60 s of green flag before it is removed** — **ran**.
  `js/race/stopped-cars.js:21`, `js/game.js:3842`, `js/physics/ai-drive.js:610`: the caution resets the
  stationary-retirement timer, which then only starts when the caution has ended.
- **A24. A debris safety car always ends after about 6 s** — **ran**. `js/physics/debris-world.js:654,836`
  despawns resting debris after 4 s and `js/race/race-control.js:347` only holds 6 s, so the field never
  bunches.

- **A25. The circuit search filters the list but did not change the selected circuit** — **ran**.
  `js/ui/select-screen.js:441-444`: typing "monza" and pressing RACE SETUP started Bahrain. Fixed (fix 23).
- **A26. BACK TO MENU on the error screen did nothing for anyone not using VR** — **ran**.
  `LoopHealth.recover()` needs `XrBoot.chainWindowRaf()`, whose tick function was only stored once the lazy
  VR bundle had loaded (`js/xr/xr-boot.js:168,211`). Fixed (fix 24).
- **A27. Helmet-camera visor reflections never render for normal players** — **ran**.
  `js/fx/visor-optics.js:214-234` reads the scene from `G` (not a global) and falls back to the test API
  `window.__apex`, which only exists on localhost or with `?apex`, `?debug`, `?report` or the metrics
  overlay. With it removed in a real race the visor layer painted 0 times; with it, it paints.
- **A28. A slow first load can permanently switch a player from the three.js renderer to WebGL2** —
  **ran**. `js/render/renderer-boot.js`: the 15 s boot step covers a 1.16 MB vendor import; a timeout leaves
  the boot canary set, the next normal load is forced to WebGL2 without trying three, and after two such
  loads the preference is overwritten ("retired").
- **A29. A setup or livery link overwrites saved data with no prompt and its single undo slot can be lost**
  — **executed**. `js/ui/title-flow.js:95-131`, `js/ui/share-code.js:321-345`: applying the same link twice,
  or two links in a row, then UNDO, does not bring back the player's own setup.
- **A30. First-run experience** — **ran**. SOUND ON is shown before any audio exists and the first click
  mutes the game (`js/audio/stub.js:97-118`); browser Back after the chequered flag leaves the game and
  loses the result (`js/ui/platform-session.js:302`, `js/ui/deep-link.js:31-37`); a refresh mid-race drops
  the race with no warning or resume; on a 1.6 Mbps connection the menu is drawn at 5 s but its buttons stay
  inert until 35 s, with only a wordless stripe as progress; race-setup values are clipped at 390 px wide
  ("DEFAUI"); the ERS readout is clipped in phone landscape.
- **A31. Results announcements pile up** — **ran**. `js/ui/results-sheet.js:120` leaves one observer per
  race quit during the ceremony; the next results screen reads out those earlier winners to screen readers.
- **A32. Vendored code** — **executed / read**. Everything in `vendor/` is byte-identical to its npm release
  (three.js rebuilds identically from the pristine build plus the ten recorded patches) except
  `vendor/trystero-0.25.4/core/action-wire.js`, which carries a local change not noted anywhere, and the
  three.js Inspector addon, which cannot load because `Storage.js` was not vendored (developer-only).
  `?metrics=1` (or the backquote/F9 toggle) loads the full test API on a production origin.

**Adversarial re-check.** A separate sub-audit was told to refute the first thirteen findings, working
against the branch as fixed. It confirmed the allowlist, penalty-reason, watchdog, save-warning and
track-link fixes hold; confirmed the performance-governor finding with its own traces (30–43 fps accepted
with automatic resolution on; the phone tier latch survives into the next race); judged the false start,
the 75 s forced classification and the per-strike track-limits penalty to be intended; and found A26.

## Fixes

See "Fix log" at the end of this file; each fix is its own commit with how it was verified.

## Tooling notes

`tools/mcp/lsp-mcp.mjs` and `jsconfig.json` come from the base branch (`npm install`, then
`bash tools/mcp/lsp-mcp.sh callers <symbol>`). Changes made here, each a separate commit:

- TypeScript 7.0.2's language server drops the first reference to a name inside a non-global scope when it
  precedes the declaration (81 of 965 bindings in eight large files lost a reference; the only call of
  `tickBody` was invisible). The tool now cross-checks with lexical scope analysis, and `package.json` pins
  `7.1.0-dev.20261119.1`, where the server is correct. Move to 7.1 stable when it ships.
- Globals assigned through `self.` / `globalThis.`, members added after the declaration, a missing
  `types/game-ctx.d.ts`, methods of factory-built objects, and `callers file:line` on factory-local
  functions all failed or returned nothing; fixed.
- Code outside `js/` (inline scripts, `sw.js`, the other pages, `worker/`) is not indexed; results now list
  text matches there.
- 57 variables declared as `let x = null` and later assigned from a factory were untyped for the checker
  (documented TypeScript behaviour). They now carry an inline `@type` comment — comment-only, 43 lines in
  22 files — which took the language server from resolving 0 of 728 member reads on them to 581.

## Fix log

### Fix 1 — inline-script hashes (finding 1)

Recomputed the SHA-256 allowlist in `index.html:5` (4 of 7 hashes replaced) and `controller.html:5` (3 of 4).
No script changed. Verified in Chromium, before → after: CSP violations on `index.html` 4 → 0; service
worker registrations 0 → 1 (installs in 6 s, 634 files cached, and the title screen reloads offline with
all 17 menu buttons); `window.__APEX_BUILD` undefined → 1695; an uncaught error now shows the error overlay;
`controller.html` violations 3 → 0 and `window.__apexPad` exists. Any future edit to an inline script needs
the same recomputation — moving them to files would remove the trap.

### Fix 2 — penalty reasons (finding 12)

`js/game.js`: safety-car-overtake and blue-flag penalties now record a reason through a small
`notePenaltyWhy` helper (same accumulate-without-duplicates behaviour the track-limits code already had).
Verified in simulated races, before → after: storm race with safety car, `pen=40, penaltyWhy=null` →
`pen=40, "overtaking under caution"`; lapped-player race, `pen=20, null` → `pen=20, "ignoring blue flags"`.
The tool's diagnostics report 0 new errors in `js/game.js`.

### Fix 3 — stall watchdog cover check (finding 11)

`js/perf/loop-health.js:87-92` called `document.getElementById` through an unbound reference, which throws
"Illegal invocation"; the surrounding `catch` returned false, so the garage and race-setup screens never
counted as cover. Now called on `document` directly. Verified in Chromium by feeding the watchdog six 1.5 s
frame gaps, sheds before → after: garage open 1 → 0, race setup open 1 → 0, neither open 1 → 1 (control).

### Fix 4 — failed settings writes now raise the "not saving" warning (finding 9)

`js/core/store.js`: `rawSet` and `rawDel` notify subscribers when the write fails, as `write()` already did
(guarded against re-entry, in case a subscriber writes in response). Verified in Chromium with localStorage
filled to quota, before → after: `rawSet` still returns false and nothing reaches disk in both, but
`#save-warning` hidden → shown. The title screen boots with no page errors.

### Fix 5 — countdown position readout (finding 13)

`js/ui/hud.js:1143`: falls back to the grid position while the rank is not yet computed. Verified in a
simulated start from P11: `-/22` → `11/22` during the countdown.

### Fix 6 — "LAP 0" on the results screen (finding 13)

`js/ui/results-sheet.js:331`: clamps the incident lap to 1, as the debrief and HUD already do. Verified with a
contact recorded after lights-out and before the line: `LAP 0 · Car contact` → `LAP 1 · Car contact`.

### Fix 7 — share-code undo in a career (finding 7)

`js/ui/share-code.js:312`: the restore filter now also accepts career setup keys
(`careerSetup.<flavour>.<slot>.<team>`), so UNDO and the rollback after a failed import restore them.
Verified in Chromium in a driver career (key `careerSetup.driver.0.haas`): setup {3,3,30,45,58}, import
{11,11,15,80,50}, UNDO → before the fix still {11,…} while reporting success; after it {3,3,30,45,58}. The
same sequence outside a career still restores correctly. The other two parts of finding 7 are not fixed:
the setup-comparison overwrite needs a persisted recovery record, and My Team livery import needs a design
decision about where career liveries live.

### Fix 8 — broken track links now say so (finding 10)

`js/editor/custom-tracks.js:497`: a `#track=` link that fails to decode announces "THAT TRACK LINK IS
INCOMPLETE OR CORRUPT", matching what setup and ghost links already do. Verified in Chromium with a
truncated code and a garbage code: no message → the message appears (banner and screen-reader live region);
the hash is still removed; a bad `#share=` link behaves as before. The silent rename when saving a shared
copy of your own circuit is not fixed — it needs a prompt, which is a design decision.

### Fix 9 — broadcast overlay shows the whole 22-car field (finding 15)

`js/overlay/render.js:4` `MAX_ROWS` 20 → 22 and the `.ov-tower` height in `overlay.html` 680 → 748 px
(22 rows × 34 px). Verified in Chromium at 1920×1080 by sending a 22-car frame with the player in P22:
visible rows 20 → 22 and the player's highlighted row hidden → shown; `?rows=10` still shows 10. The other
two broadcast defects (false "OVERTAKE" on a retirement, FASTEST LAP card never shown) are not fixed; they
only appear in real-race replays, which could not be exercised here.

### Fix 10 — voice packs no longer fail on slow connections (addendum A1)

`js/audio/voice-pack.js`: the fixed 15 s limit covered the manifest, the whole binary and the integrity check,
so a pack could only load if several megabytes arrived within 15 s, and after failing it was downloaded
again every 30 s. The limit is now a stall timer: it restarts whenever data arrives (the binary is read as a
stream) and allows a 1.5 s grace after a quiet period so callbacks queued behind a busy main thread can run.
The SHA-256 check is unchanged. Verified in Chromium with caches off: fast network, loads in 0.1 s before
and after; 2 Mbps, the 4.0 MB announcer pack failed at exactly 15.0 s → loads in 16.7 s; a binary that never
arrives still fails (15.0 s → 16.5 s).

### Fix 11 — Settings uses the full width of a phone (addendum A2)

`css/settings.css:3`: the sheet width was computed in unscaled pixels and then shrunk again by the sheet's
`zoom` (phones default to 70 % UI scale), so Settings rendered about 58 % as wide as the screen. The width
is now divided by the scale, the same pattern `css/carsetup.css:11` uses. Verified in Chromium, rendered
width before → after: iPhone 13 portrait 225 → 322 px of 390; landscape 496 → 708 px of 750; desktop
1280×720 unchanged at 1020 px; no horizontal overflow at any size.

### Fix 12 — key and controller binding tables on desktop (addendum A3)

`js/ui/key-binds.js`: the tables rendered before `body.desktop` was set and never again, so on desktop they
stayed hidden and settings search said "Keyboard bindings is unavailable on this device". They now
re-render when the class changes. Verified at 1280×800: both sections hidden → shown.

### Fix 13 — desktop helmet-camera HUD layout (finding 13)

`js/ui/hud-layout.js`: the layout re-applies when the pointer kind changes, for the same root cause as fix
12. Verified at 1280×800: `#hud-gearbox` gets its layout attribute (missing before), so it no longer sits
under the energy gauge.

### Fix 14 — toggle throttle after a silent controller drop (addendum A7)

`js/input/input.js`: the no-controller branch of `pollGamepad` now clears the throttle and look-back toggle
latches. Verified in a live session with a stubbed gamepad, toggle mode: tap RT (throttle on), remove the pad
with no disconnect event, return it idle → throttle before the fix `true`, level 1; after it `false`, 0.

### Fix 15 — percent-encoded lap-challenge links (addendum A12)

`js/ui/share-code.js` `codeFrom`: a code that arrives already extracted from the URL (so it starts with
`APX…`) is now percent-decoded before parsing. Verified in Chromium: `APXC1.l.bahrain%7E-%7E91234` refused
as corrupt → accepted as a 1:31.234 lap challenge; the unencoded form and the `#share=` form still work, and
a malformed escape is still refused.

### Fix 16 — circuit detail opened while the circuit is still loading (addendum A13)

`js/ui/select-screen.js` `openTrackDetail`: the panel read corners, zones and elevation once and never
again, so opened early it showed "0 turns", no corner list and a blank map until closed and reopened. It now
repaints when the circuit file arrives, if it is still open on the same circuit. Verified in Chromium with
Spa's circuit file delayed 9 s: 14 s after opening, "0 turns", 0 corners, blank map → "19 turns", 19 corners,
map drawn.

### Fix 17 — a slow connection after a release no longer replaces the game with an error page (addendum A14)

`sw.js` (navigation handler): when the new shell (`?b=<build>`) does not arrive within 15 s the worker now
serves the cached shell, where it used to return `Response.error()`. Verified in Chromium with
`version.json` advanced to 1696 and the shell delayed 20 s: the tab ended on `chrome-error://chromewebdata/`
→ it ends on the working 1695 title screen. This path only became live again with fix 1, which re-enabled
the service worker.

### Fix 18 — the service worker only reports a build it has installed (addendum A14)

`sw.js` `localGeneration`: the build from the network's `version.json` is reported only once its install has
settled. Verified with `version.json` at 1696, the shell at 1695 and the worker restarted: reported
generation 1696 → 1695, and TRACK DESIGNER went from refused ("UPDATE READY — RELOAD TO CONTINUE", with the
reload serving 1695 again) to opening. A normal install (634 files) and an offline reload still work.

### Fix 19 — the gap readouts are now time gaps (finding 3)

`js/ui/hud-readouts.js` gains a small per-car history of (race distance, race time), sampled on the HUD
tick. The gap to a car is "now minus the time the car ahead was where the car behind is now"; it replaces
distance ÷ the player's current speed in the gap readout (`js/ui/hud.js`), the relative tower
(`js/ui/hud-relative.js`) and the undercut cue (`js/ui/hud-strategy.js`). When the history does not reach
(more than about a lap apart, or a lapped car) the old estimate is still used. Verified in the same seeded
4-lap Bahrain race, comparing the displayed gap ahead with a true time gap recorded every physics step
(249 samples): 90th-percentile error 0.26 s → 0.06 s, worst 0.49 s → 0.13 s. The remainder is the readout's
existing smoothing.

### Fix 20 — a daily link from another day no longer names the wrong circuit (addendum A4)

`js/ui/share-code.js`: when the link's day is not the recipient's day, the result is marked expired and the
message reads "That daily challenge has ended — here is today's." It used to say "Daily challenge — MONACO"
while opening the recipient's own, different daily. Verified in Chromium with a link dated yesterday: old
message naming the sender's circuit → the new message; a link dated today is unchanged. The underlying
cause — the daily is keyed on the local date although the help says it is the same for every player — is a
design decision and is not changed.

### Fix 21 — a reload during a setup comparison no longer loses your setup (finding 7)

`js/garage/setup-trials.js`: when a comparison writes a trial setup it also stores a small recovery record
(the setup to restore and the trial setup it wrote; key registered in `js/core/save-schema-registry.js`).
On the next load, garage visit or comparison, if the saved setup is still exactly the trial one, the
original is restored; if the player has changed it since, it is left alone. Cancelling clears the record.
Verified in Chromium with the comparison's launch stubbed: tuned {3,9,33,44,59}, baseline arm running,
reload → before the fix the works baseline {8,6,22,62,56} stayed; after it the tuned setup is back and no
record remains. Cancel still restores, and a setup edited by hand after the interruption is not overwritten.

### Fix 22 — RECOVER CAR no longer keeps the car's speed (addendum A22)

`js/game.js` `rescuePlayer`: the car is put back on the line at the recovery speed (16 m/s × pace) instead of
keeping whatever speed it had. Verified in a simulated Bahrain race with full throttle and recover pressed
three times a second for a lap: before, that lap took 97.19 s (valid, no penalty, player up to P1); after,
the car is held at 16 m/s and did not complete the lap in the time the same test allows (P22). A single
recover still gives a stopped car its 16 m/s push. The wrong-way auto-rescue uses the same function.

### Fix 23 — the circuit search now selects what it shows (addendum A25)

`js/ui/select-screen.js` `applyTrackSearch`: when the selected circuit is filtered out, the first visible
match is selected, as the filter chips already do. Verified in Chromium: typing "monza" left BAHRAIN selected
and RACE SETUP opened "BAHRAIN · … · 3 LAPS" → MONZA is selected, previewed and opened; typing keeps focus in
the search box; a query with no match leaves the selection alone and shows the empty message.

### Fix 24 — BACK TO MENU on the error screen works (addendum A26)

`js/xr/xr-boot.js` `bind`: the frame function is stored when the game binds it, not only once the VR bundle
has loaded, so `LoopHealth.recover()` can restart the loop. Verified in Chromium by forcing the loop to stop
(eight faulting frames) and pressing BACK TO MENU: frames in the next 3 s 0 → 165, loop stopped → running,
overlay left up → dismissed.

## What is not fixed, and why

- **Needs a design decision:** changing team mid-season (finding 4); damage with tyre wear OFF (5); the
  daily challenge keyed on the local date (14); RESET GARAGE deleting career setups (A8); My Team livery
  codes (7); a prompt before a share link overwrites a setup (A29) or renames a circuit (10); the false
  start for a held throttle (12); refresh and browser Back losing a race (A30).
- **Needs tuning on real hardware or across circuits, which this machine cannot do:** the performance
  governor (11); AI avoidance of a stopped car (6); the AI shove cap (A15); safety-car and stopped-car
  timing (A23, A24); renderer retirement on a slow first load (A28).
- **Larger than a safe single change:** visor reflections for normal players (A27); practice bests keyed per
  circuit (A5); wind in time-trial record keys (A16, changes which existing records match); career import
  validation (A17); voice language options (A18); load weight and unreferenced assets (17, 18).
- **Small and safe but left for lack of time:** the results-announcement observer (A31), the text and unit
  inconsistencies (A19), the two remaining broadcast-graphics defects (15), and the iOS banner (A9).

## Corrections to my own fixes (found by an independent review of the fix commits)

- **Fix 23 regression — TODAY'S CHALLENGE did nothing with a search typed.** The search auto-select also ran
  on every list rebuild, so in time trial with "monza" typed, pressing the daily chip selected the daily
  circuit, hid it, clicked the first visible match and thereby stopped the daily. The auto-select now runs
  only from the search input and the daily chip clears the query. Verified: chip not pressed with MONZA
  still selected → "DAILY STANDARD · SINGAPORE", pressed, Singapore selected; the original fix still works.
- **Fix 19 regression — relative tower gaps for cars on another lap.** The tower picks cars by on-track
  distance but the timed lookup used raw race distance, so on circuits shorter than about 5.1 km a car a
  lap up or down showed about a lap time (a car 29 m ahead read "-99.4"). The lookup is now shifted by the
  lap difference. Verified in a seeded 12-lap Monaco race with the player lapped: rows wrong by more than
  2 s, 1044 of 1796 → 0. The relative tower is off by default and on in the broadcast HUD profile.

The same review read the other fix commits and found them sound; details are in its report.

## Fix log, continued (third and fourth waves)

### Fix 25 — visor reflections render for normal players (addendum A27)

`js/fx/visor-optics.js`, `js/game.js`: the game hands `VisorOptics` a scene source directly
(`VisorOptics.setSource`) instead of the visor reading it through the test API. Verified in a
production-like page (https origin, `navigator.webdriver` hidden, no test API), Bahrain, helmet camera:
shown false / 0 paints / canvas hidden → shown true / 7 paints / 8 glints / canvas visible.

### Fix 26 — visor bloom and glare follow the lighting tune (new)

`js/fx/visor-optics.js` `readKnobs` read the lighting tune through the test API too, so production was stuck
at the defaults. It now reads `LightKnobs.LT`. Verified in the same page: low and high glare/bloom settings
give lamp strength 0.72 and 1.2.

Proposed but **not applied**: clearing the renderer boot canary when a hung start never claimed the canvas
(A28, patch in the sub-audit's notes). It stops a slow first load from retiring the three.js renderer, but
a machine whose GPU driver hangs would then wait 15 s on every boot instead of being retired after two —
a trade-off for the owner.
