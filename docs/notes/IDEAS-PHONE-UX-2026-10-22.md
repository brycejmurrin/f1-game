# Phone UX, HUD and presentation ideas — 2026-10-22

Fleet A, slot A·I2 (ideas worker). Scope: what an iPhone player at **844×390
landscape, touch** sees and touches — controls, HUD, menus, onboarding,
broadcast feel, garage/photo, sharing, perceived performance, PWA,
accessibility. Gameplay, racing and mode ideas belong to sibling A·I1. Nothing
here is implemented. Bryce picks; the orchestrator files the issues.

**Evidence.** 13 captures from the working tree at `72408e99` (SwiftShader, no
GPU): 11 menu screens via
`node tools/ui/layout-audit.mjs --gallery --viewports=ios-iphone-landscape-844`
and 2 race-HUD cells via `apex_hud_shot` (`phone-landscape-844x390`, shipped
preset, Monza; chase + BUTTONS steer, cockpit + TOUCH steer). The screenshots
appear side by side with mock-ups in the Claude Artifact **"Apex 26 phone UX
ideas"** (link in the PR body). `publish-evidence.mjs --publish` was refused
(HTTP 403: this session type cannot create releases), so the images live only
in the artifact and in `artifacts/ideas-ux/` locally. Rebuild them with the two
commands above. The headless captures use a `jump()` fixture, so lap-1 numbers
(gear 8, 257 km/h at 0:00.10) are staged, not a bug.

**Prior art checked, not re-proposed.** Shipped already: the coach marks
(`js/ui/onboard.js`), the 20 s instant-replay ring (`js/camera/replay-buf.js`),
the live TV director (`js/camera/director.js`), result share cards
(`js/share/share-card.js`), phone-as-controller (`js/input/phone-pad.js`),
LEFT-HANDED dock and AUTO throttle (`js/ui/dock-layout.js`,
`js/input/input.js`), the install chip and the A2HS fullscreen note
(`js/ui/platform-session.js:80`), home-screen shortcuts
(`js/ui/deep-link.js`), the portrait `#rotate-device` card (`index.html`), and the opt-in RELATIVE box (`js/ui/hud-relative.js`).
Filed already: #1608 (Next-GP tile, .ics), #3339 (garage livery scroll),
#3263–#3274 (HUD preset and MOVE & SIZE overlaps), #3302 (install chip
stacking), #3311 (rotation sheds quality tier). Plans:
`docs/plans/2026-09-30-broadcast-feel.md`,
`docs/plans/2026-10-04-share-cards.md`,
`docs/plans/2026-10-04-pwa-shortcuts-calendar.md`,
`docs/notes/HUD-PHONE-LAYOUT-PLAN-2026-10-10.md`.

## Research (cited)

- **Apple HIG, game controls**: frequently used controls are at least 44×44 pt
  and menus at least 28×28 pt. Controls sit near the thumbs, out of the Home
  indicator and Dynamic Island, with secondary controls at the top. A press
  state must be visible "even when their finger is covering the control" and
  should pair with sound and haptics. Controls should be shown or hidden "to
  reflect gameplay". Glyphs should name the action, not "A, X, or R1".
  <https://developer.apple.com/design/human-interface-guidelines/game-controls>
  (read via the page's JSON source).
- **iOS web haptics**: WebKit has no Vibration API. Since Safari 17.4/18 a
  `<input type="checkbox" switch>` fires the system haptic when its label is
  clicked, and the `ios-haptics` package wraps this trick.
  <https://npmjs.com/package/ios-haptics>,
  <https://azukiazusa.dev/en/blog/ios-safari-web-haptics>,
  <https://github.com/ionic-team/ionic-framework/issues/29942>. One unverified
  page says Apple patched it in iOS 26.5
  (<https://rapidtoolset.com/en/tool/ios-haptics-tester>), so it needs testing
  on Bryce's phone.
- **Orientation and fullscreen on iPhone**: `screen.orientation.lock` is
  unsupported in every iOS Safari version
  (<https://caniuse.com/mdn-api_screenorientation_lock>). Element fullscreen is
  only partial (<https://caniuse.com/fullscreen>). `MediaRecorder` has been
  supported since iOS Safari 14.5 (<https://caniuse.com/mediarecorder>).
- **F1 TV 2026**: the world-feed tower moved to one-decimal gaps at the 2026
  Australian GP, and a battery graphic was tried and then dropped
  (<https://www.gpfans.com/en/f1-news/1078428/f1-2026-tv-broadcast-new-timing-tower-graphic>,
  <https://racingnews365.com/f1-boss-claims-fans-dont-care-about-crucial-missing-tv-graphic>).
  Apple TV's F1 presentation aims at "restrained graphics" that are easy to
  absorb at a glance
  (<https://www.motorsport.com/f1/news/f1-to-experiment-more-with-new-tv-graphic-1033527/3078154/>).
- **Mobile racers**: Real Racing 3 ships brake assist (auto-brake and
  downshift) on by default, plus HUD customisation
  (<https://www.appspy.com/real-racing/review/>,
  <https://9to5mac.com/2013/10/16/real-racing-3-ios-app-updated-w-ferraris-hud-customization-new-tracks-challenges/>).
  The F1 2016 mobile port let players hand only the brakes to the game
  (<https://www.redbull.com/in-en/f1-2016-for-mobile-tutorial-guide>). Mario
  Kart Tour has auto-accelerate, swipe steering and an adjustable Smart Steering
  strength (<https://www.mariowiki.com/Mario_Kart_Tour>,
  <https://www.pocketgamer.com/mario-kart-tour/mario-kart-tour-cheats-tips-custom-control-settings-for-victory/>).
  Reviewers note that touch input is all-or-nothing next to analogue triggers
  (<https://racinggames.gg/misc/what-is-a-good-racing-game-for-mobile>).
- **Onboarding**: get players into core play within about a minute, teach one
  mechanic at a time, and put nothing ahead of the fun
  (<https://blog.playio.co/mobile-game-onboarding-retention>,
  <https://adriancrook.com/?p=8055>). The heuristics study is Thomsen et al.,
  IFIP 2016 (<https://dl.ifip.org/IFIP-LNCS-9926/hal-01640269>).

## Things that look broken or outdated today

Bryce suspected that some panels are old or inaccurate. Each row below names
its capture (the file stem in the artifact) and was seen at 844×390.

| # | What | Capture | Anchor | Confidence |
|---|---|---|---|---|
| B1 | **Two strategy panels say the same thing.** The top-left plate (`S ~5L · PLAN NO STOP`) and the left TYRES card (`S ~5L / PIT LOSS ~23 s / NEXT NO STOP`) are both on screen | `phoneL-chase-steer-buttons` | `js/ui/hud-strategy.js`, `js/ui/hud-tyres.js` | high |
| B2 | **Coach radio card clips its own sentence**: `"ENERGY FULL — LIFT OR DEPLOY ON STRAIGHTS` loses its last line | `phoneL-chase-steer-buttons` | `#announce` lane, `js/ui/captions.js` | high |
| B3 | **Gap chip with no name**: `▲ 75.9` under the map has no driver code and no unit, because the shorten rung drops the code first (`js/ui/hud.js:370`, `gapText` at `:2310`) | both HUD captures | `js/ui/hud.js` | high |
| B4 | **Order box reads oddly**: `P22 VER` sits above `P1 RUS +17.6 S +1L` / `P2 BOT +17.7 S +1L`, which shows a lapped gap on lap 1. It may be fixture-driven (`jump()`), so it needs a real-start check | both HUD captures | `js/ui/hud-relative.js` / tower | medium (verify) |
| B5 | **Data Hub shows "▸ Developer tools"** (GPS TRACE EXPORT) to every player, as the first line under the tabs | `datahub__…` | `js/data/hub.js:190` (`developer: true` tab at `:47`) | high |
| B6 | **Results sheet fits only 2.5 drivers**: every row carries its own `▸ TYRE STINTS` disclosure line | `results__…` | `js/ui/results-sheet.js:165` `stintStrip` | high |
| B7 | **Circuit strip is unnamed flags**: Monaco and Indonesia-style red/white flags look identical, and the two USA flags sit side by side (Miami/COTA/Vegas) with no name, outline or date | `select__…` | `js/ui/select-screen.js` | high |
| B8 | **Night badge vs loading card**: the picker shows `BAHRAIN ☾`, but the loading card says `TIME DAY`. This may be correct (a default ToD versus a badge for the real race), but it reads as a contradiction | `select__…`, `loading__…` | `js/ui/loading-screen.js` | medium (verify) |
| B9 | **Garage header wraps**: `FREE BUILD — no budget limit` takes three lines next to a duplicate `∞ FREE BUILD: ON` pill, and only one part option shows above the fold | `garage__…` | garage sheet `#cs-*` | high |
| B10 | **Title grid has mixed iconography**: 9 doors have icons, while VISUAL STUDIO, SETTINGS, USE AS CONTROLLER, HOW TO PLAY and SAVES & DATA have none. All 16 subtitles (`.mb-sub`) are hidden at this height, so DAILY TIME TRIAL never says "TODAY'S CHALLENGE" | `title__…` | `index.html` `#mb-*`, `js/ui/title-layout.js` | high |
| B11 | **Career "Next race" preview is a dark night shot with floating white boxes** (props). It is the first image of the career hub | `careerhub__…` | `js/ui/experience.js`; scenery #3342 | medium |
| B12 | **Settings rows hide behind help text**: CONTROLS shows two settings per screen, and RACE SETTINGS spends two rows on `▸ About laps` / `▸ About weather` | `settingscontrols__…`, `racesettings__…` | `index.html` `#pm-*`, `.adv-help` | high |

## The ideas

Score = impact (1–5) × confidence (1–5) ÷ effort (S=1, M=2, L=4). "Phone fit"
means it works at 844×390 with thumbs.

### Controls and feel

**1. Context touch cluster: show only what you can press now.**
- Pitch: shrink the right-hand cluster (BOOST, OT, AERO, BRAKE, GAS) to the
  buttons that are live. OT appears only inside an overtake window, and AERO
  only when the mode can toggle.
- Why: HIG says "show and hide virtual controls to reflect gameplay". Today a
  greyed OT disc takes thumb space for the whole lap (`phoneL-chase-steer-buttons`).
- Today: always-on discs from `js/input/hold-buttons.js`, placed by
  `js/ui/dock-layout.js`.
- Sketch: add an `available()` predicate per button, fade it in 120 ms with a
  short pulse on arrival, and keep the slot reserved so nothing shifts under the
  thumb.
- Files: `js/input/hold-buttons.js`, `js/ui/dock-layout.js`, `css/hud.css`.
- Effort M · risk: muscle memory, so keep positions fixed · phone fit: high ·
  **score 4×3/2 = 6**

**2. Press glow that shows past the thumb.**
- Pitch: a ring that blooms outside the disc edge, plus an optional click tick.
- Why: HIG asks for a press state "they can see even when their finger is
  covering the control". The current press state is a colour change under the
  thumb.
- Sketch: `box-shadow` / `outline` ring at +10 px with `:active` and
  `[data-held]`, and a 4 ms click through `GameAudio`.
- Files: `css/hud.css`, `js/input/hold-buttons.js`.
- Effort S · risk: low · fit: high · **score 3×4/1 = 12**

**3. Real iPhone haptics via the `switch` checkbox.**
- Pitch: kerb rumble, gear shift, lights out and contact taps on an iPhone,
  which today gets none (`hapticsSupported()` hides the row,
  `js/input/haptics.js`).
- Why: HIG pairs press states with haptics, and the switch trick is the only
  WebKit path (cited above).
- Sketch: a hidden `<label><input type=checkbox switch></label>` actuator in
  `index.html`, clicked by `InputHaptics` at no more than ~10 Hz, coarse
  (single, double or triple tap only). Feature-detect with a one-time
  calibration tap.
- Files: `js/input/haptics.js`, `index.html`, `js/input/steer-tuning.js` (row
  gate).
- Effort M · risk: Apple may have patched it (iOS 26.5, unverified), and it must
  only fire from a user-gesture chain, so test on Bryce's phone first · fit:
  high · **score 4×2/2 = 4**

**4. Control chooser with moving pictures, on first launch.**
- Pitch: three big cards (TILT, BUTTONS, TOUCH), each a 2-second looping
  diagram, with AUTO throttle and LEFT-HANDED as toggles on the same card.
- Why: CONTROLS today is text ("TILT leans the phone. BUTTONS adds on-screen
  arrows…", `settingscontrols__…`). AUTO throttle and LEFT-HANDED exist but sit
  deep in settings. Real Racing 3 and F1 Mobile put the brake assist choice up
  front.
- Files: new sheet in `index.html`, `js/input/steer-tuning.js`,
  `js/ui/onboard.js` (show once).
- Effort M · risk: low · fit: high · **score 4×3/2 = 6**

**5. Swipe the top bar to change camera.**
- Pitch: a horizontal swipe on the POS/LAP/TIME strip cycles cameras, so the
  CHASE / COCKPIT pill can shrink to an icon.
- Why: HIG says to put secondary controls at the top and use simple gestures.
  It frees about 90 px of the top-right row.
- Files: `js/ui/hud.js`, `js/camera/mode-switch.js`.
- Effort S · risk: accidental swipes, so require a 40 px+ horizontal swipe ·
  **score 2×3/1 = 6**

### HUD readability

**6. One strategy readout, not two (fixes B1).**
- Pitch: merge the top-left plan plate into the TYRES card. Outside the pit
  window, collapse it to a 1-line chip (`S · 5L`), and expand it only when the
  window opens or the engineer calls a stop.
- Why: duplication costs about 110×50 px at 844×390, and Apple TV's F1 style is
  "restrained graphics".
- Files: `js/ui/hud-strategy.js`, `js/ui/hud-tyres.js`,
  `js/ui/hud-elements.js` (shipped flags).
- Effort S · risk: HUD layout specs (`tests/specs/hud-layout.spec.js`) ·
  **score 4×4/1 = 16**

**7. Gap chip keeps its name (fixes B3).**
- Pitch: drop the decimal before dropping the driver code: `▲ RUS 76s` before
  `▲ 75.9`. Show `+1L` for lapped cars.
- Why: a bare number does not say whom the gap is to, and F1 TV itself went to
  one decimal.
- Files: `js/ui/hud.js` (shorten rung near `:370`, `gapText`),
  `js/ui/hud-readouts.js`.
- Effort S · risk: low · **score 3×4/1 = 12**

**8. Radio card never clips (fixes B2).**
- Pitch: phone lines get a short form (`DEPLOY ON STRAIGHTS`). The full line
  goes to the race-message history, and if the text is still too long the card
  grows one line instead of clipping.
- Files: `js/ui/captions.js`, `js/ui/race-message-history.js`, coach source
  strings.
- Effort S · **score 3×4/1 = 12**

**9. Battle strip (F1-TV style).**
- Pitch: when the gap to the car ahead or behind is under 1.0 s, the gap chips
  give way to one strip:
  `VER ▸ 0.4 ◂ RUS` with a closing/opening arrow and a tow icon.
- Why: it is the most-watched TV graphic, and the data is already in `G.ranked`
  and `player.towing` (`js/ui/hud.js:2300`).
- Files: `js/ui/hud-readouts.js`, `css/hud.css`.
- Effort M · **score 4×4/2 = 8**

**10. Live lap-delta bar for time trial and practice.**
- Pitch: a thin bar under the top strip, green or red, growing from the centre
  with `−0.23`, measured against best or ghost.
- Why: it is a standard sim HUD element and gives instant feedback without
  reading digits. No delta bar exists today (grep).
- Files: `js/ui/hud.js` (new readout), `js/car/ghost-share.js` / ghost samples
  for the reference.
- Effort M · **score 4×4/2 = 8**

**11. One-decimal gaps on phone (option).**
- Pitch: as on F1 TV 2026, the tower and chips show `+1.2`, not `+1.234`, below
  1000 px of width.
- Files: `js/ui/hud.js` `gapForm`.
- Effort S · **score 2×4/1 = 8**

### Menus and first 60 seconds

**12. Circuit strip with names and outlines (fixes B7).**
- Pitch: each chip shows the flag, a 3-letter code (MON, MIA, LVG) and the
  track outline from the minimap path. Long-press a chip for the date and
  length.
- Why: identical flags, and 52 circuits found by flag alone.
- Files: `js/ui/select-screen.js`, `js/ui/hud-minimap.js` (outline painter),
  `css/` select sheet.
- Effort S · **score 4×5/1 = 20**

**13. Title: one hero, one CONTINUE, the rest under MORE.**
- Pitch: a big "QUICK RACE" hero on the last circuit and car, a CONTINUE card
  (career round 4, Daily or last mode), then 6 doors, with tools (Photo, Track
  Designer, Visual Studio, Saves, Controller) behind MORE.
- Why: 16 equal tiles with hidden subtitles (B10). Onboarding research says to
  get to play in under a minute.
- Files: `index.html` `#mb-*`, `js/ui/title-layout.js`,
  `js/ui/experience.js`.
- Effort M · risk: deep links (`js/ui/deep-link.js`) and menu specs ·
  **score 5×3/2 = 7.5**

**14. "Drive now" first launch.**
- Pitch: the first-ever tap lands in a 1-lap Monza run with AUTO throttle and
  braking aids on. The existing coach marks (`js/ui/onboard.js`) teach as you
  go, and the control chooser (#4) appears after the lap, not before.
- Why: research says to get to the fun in under 60–90 s. Today the path is
  title → mode → select → setup → loading.
- Files: `js/ui/onboard.js`, `js/race/race-settings.js`, `js/ui/experience.js`.
- Effort M · **score 5×3/2 = 7.5**

**15. Help as a tap-icon, not a row (fixes B12).**
- Pitch: replace `▸ About laps` / `.adv-help` paragraphs with an ⓘ next to the
  label that opens a popover, so 4 rows of controls fit instead of 2.
- Files: `index.html` settings and race-settings markup,
  `js/ui/menu-nav.js` (focus), `css/`.
- Effort M · risk: a11y focus order, screen readers · **score 3×4/2 = 6**

**16. Hide Developer tools from players (fixes B5).**
- Pitch: render the `dh-developer-tools` `<details>` only under `DevFlags` or
  `?dev=1`.
- Files: `js/data/hub.js:190`.
- Effort S · **score 3×5/1 = 15**

**17. Results that fit a phone (fixes B6).**
- Pitch: inline the stint strip as a 6 px bar on each row and add one
  `STINTS ▸` toggle in the header. The sheet opens scrolled to the player row,
  and that row stays sticky.
- Why: 2.5 rows visible now, about 7 after.
- Files: `js/ui/results-sheet.js` (`stintStrip` `:165`, row build `:403`),
  `css/overlays.css`.
- Effort S · **score 4×5/1 = 20**

**18. Garage: parts as a swipe carousel.**
- Pitch: show the selected part tab as horizontal cards (name, stat deltas, cost
  chip) above the CLOSE row. Fold FREE BUILD into one pill (B9).
- Why: one option is visible above the fold today, and #3339 reports deep
  scroll.
- Files: garage sheet in `index.html` `#cs-*`, `js/garage/*`.
- Effort M · **score 3×3/2 = 4.5**

### Broadcast, replay and sharing

**19. Auto replay chip after a pass or a hit.**
- Pitch: after an overtake or contact, a `▶ REPLAY` chip shows for 4 s. A tap
  plays the last 6 s from `ReplayBuf` with director cuts, then resumes
  (solo only, and the race pauses).
- Why: the replay ring and director are already built but sit behind the pause
  card scrub.
- Files: `js/camera/replay-buf.js`, `js/camera/director.js`, `js/ui/hud.js`.
- Effort M · **score 4×4/2 = 8**

**20. Share a 10-second clip.**
- Pitch: record the replay playback with `canvas.captureStream()` and
  `MediaRecorder` (mp4 on iOS 14.5+), then `navigator.share({files})`.
- Why: clips beat stills for sharing, and `share-card.js` already does share
  and download.
- Files: a new module `js/<new>/share/clip.js` (proposed path), `js/share/share-card.js` (delivery).
- Effort L · risk: SwiftShader can't prove it, frame drops while recording, and
  memory on a phone · **score 5×2/4 = 2.5**

**21. Pre-race "grid card" loading screen.**
- Pitch: the loading card becomes a broadcast lower-third, with the track map
  in sector colours, DRS/OT zones, weather, your grid slot and one tip. A tap
  starts the race once ready.
- Why: the current card overlays the title menu (`loading__…`), so the title
  bleeds through.
- Files: `js/ui/loading-screen.js`.
- Effort M · **score 3×3/2 = 4.5**

**22. Livery share code as QR plus a card.**
- Pitch: in the garage livery tab, SHARE paints a share-card with the car render
  and a QR/`#livery=` code, reusing the share-card pipeline.
- Files: `js/share/share-card-layout.js`, garage livery UI.
- Effort M · **score 3×3/2 = 4.5**

### Performance, PWA and accessibility

**23. Prefetch the track while the player is in setup.**
- Pitch: start fetching and building the chosen circuit when RACE SETUP opens,
  not at START, so the loading card mostly vanishes.
- Files: `js/ui/loading-screen.js`, `js/ui/select-screen.js`, track build entry
  (`Assets.modelsReady()` path).
- Effort M · risk: memory on a phone if the player switches tracks, so cancel on
  change · **score 4×2/2 = 4**

**24. Tell the player when the phone throttles.**
- Pitch: when the perf governor drops a tier (thermal or Low Power,
  `js/perf/governor.js` `autoTier`), show a 2 s toast such as "Phone is hot,
  smoothing to 30 fps". Pause offers a one-tap BATTERY SAVER that pins the low
  tier.
- Why: a silent quality drop reads as a bug ("it got blurry"). Players accept
  a drop they are told about.
- Files: `js/perf/governor.js` (event), `js/ui/hud.js` toast,
  `js/ui/pause-opts.js`.
- Effort S · risk: toast spam, so allow one per session per direction ·
  **score 3×3/1 = 9**

**25. Title icon pass (fixes B10).**
- Pitch: give every title door an icon glyph (HIG: symbols that communicate the
  action), and on short landscape show `.mb-sub` for the hero only.
- Files: `index.html` `#mb-*`, `css/`.
- Effort S · **score 2×5/1 = 10**

## TOP 10

| Rank | Idea | Score | Effort |
|---|---|---|---|
| 1 | #17 Results that fit a phone | 20 | S |
| 2 | #12 Circuit strip with names and outlines | 20 | S |
| 3 | #6 One strategy readout, not two | 16 | S |
| 4 | #16 Hide Developer tools from players | 15 | S |
| 5 | #2 Press glow past the thumb | 12 | S |
| 6 | #7 Gap chip keeps its name | 12 | S |
| 7 | #8 Radio card never clips | 12 | S |
| 8 | #25 Title icon pass | 10 | S |
| 9 | #24 Tell the player when the phone throttles | 9 | S |
| 10 | #19 Auto replay chip | 8 | M |

**Bigger bets** (lower score because of effort, but highest impact): #13
title hero + CONTINUE, #14 "Drive now" first launch, #9 battle strip, #10
lap-delta bar, #3 iPhone haptics.

## Issue drafts for the TOP 10

Each draft is ready to paste. The orchestrator files only the ones Bryce picks.

### 1. Results sheet: fit 7 drivers on a phone (inline tyre stints)
Body: At 844×390 the results sheet shows 2.5 drivers, because every row
carries its own `▸ TYRE STINTS` disclosure line (`js/ui/results-sheet.js:165`
`stintStrip`). Render the stint strip as a thin bar inside the row, move the
text detail behind one header toggle, open the sheet scrolled to the player
row, and keep that row sticky.
Acceptance: ≥ 6 classified rows visible at `ios-iphone-landscape-844` (layout-audit `results`); player row in view on open; stint text still reachable by keyboard and screen reader (`aria-label` unchanged); results specs green.

### 2. Circuit picker: name each flag chip and add its outline
Body: The picker's strip is unnamed flags. Monaco and Indonesia-style flags
look the same, and there are three USA chips. Add a 3-letter code and a mini
outline to each chip, and a long-press for date and length
(`js/ui/select-screen.js`).
Acceptance: every chip has a visible code and an accessible name; chips ≥ 44×44 CSS px; layout-audit `select` clean at 844×390 and 667×375.

### 3. HUD: merge the duplicate strategy plate into the TYRES card
Body: Two HUD panels show the same compound, laps and plan (top-left plate and
TYRES card, chase cam, shipped preset). Keep one, collapsed to a single line
outside the pit window, and expand it when the window opens
(`js/ui/hud-strategy.js`, `js/ui/hud-tyres.js`).
Acceptance: shipped preset at `phone-landscape-844x390` shows one strategy readout; `apex_hud_shot` 0 findings; `hud-layout.spec.js` green.

### 4. Data Hub: hide "Developer tools" from players
Body: `js/data/hub.js:190` renders a `Developer tools` disclosure (GPS TRACE
EXPORT) as the first line of the hub for everyone. Gate it behind the dev flag.
Acceptance: no developer disclosure without the flag; still reachable with it; data-hub specs green.

### 5. Touch buttons: press glow visible around the thumb
Body: The HIG game-controls page asks for a press state visible "even when
their finger is covering the control". Add an outer ring glow on held
buttons, and optionally a click tick.
Acceptance: held state paints ≥ 8 px outside the disc edge; no layout shift; reduced-motion respected.

### 6. Gap chip: keep the driver code when space is short
Body: On a phone the gap chip renders `▲ 75.9` with no driver. Shorten the
number before dropping the code (`js/ui/hud.js` shorten rung near `:370`).
Acceptance: at 844×390 the chip always shows a 3-letter code; lapped cars read `+1L`.

### 7. Radio/coach card: no clipped sentences on a phone
Body: The coach line `ENERGY FULL — LIFT OR DEPLOY ON STRAIGHTS` is cut
mid-word at 844×390. Add a short form for phones, keep the full text in the
message history, and grow by one line rather than clip.
Acceptance: no radio card has `scrollHeight > clientHeight` in the HUD survey quick matrix.

### 8. Title: icons on every door
Body: VISUAL STUDIO, SETTINGS, USE AS CONTROLLER, HOW TO PLAY and SAVES & DATA
have no icon, while the other doors do. Add glyphs that name the action.
Acceptance: all title doors carry an `aria-hidden` icon; title layout specs green at 844×390.

### 9. Perf: tell the player when the phone throttles
Body: When `js/perf/governor.js` lowers `autoTier` (thermal or Low Power), the
picture softens with no explanation. Emit an event, show one short toast, and
add a BATTERY SAVER toggle in pause that pins the low tier.
Acceptance: a tier drop shows the toast at most once per direction per session; BATTERY SAVER persists under an `apex26.` key; no change to tier logic.

### 10. Auto replay chip after an overtake or contact
Body: Offer a 4 s `▶ REPLAY` chip after a pass or a hit. A tap replays the last
6 s from `ReplayBuf` with director cuts, then returns (solo only).
Acceptance: chip appears only in solo; replay never mutates race state (determinism spec); tap target ≥ 44 pt.
