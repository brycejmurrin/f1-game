# UI map — navigation and DOM

This is the lookup map for Apex 26's menu web: where a title-screen action
leads, which overlays can appear along the way, and which stable DOM roots an
agent can inspect.

For the current end-to-end routes and repeatable regression journeys, use
[USAGE-PATHS.md](ARCHITECTURE-MAP.md). The dated navigation observations below are
historical; in particular, current Garage forward/back and newer title doors
are traced in that map.

> **Source date:** 2026-09-18
>
> **Live walk:** [brycejmurrin.github.io/f1-game/](https://brycejmurrin.github.io/f1-game/)
>
> **Source cross-check:** `js/ui/layers.js`, `js/ui/settings-tabs.js` and
> `index.html` on `claude/f1-game-project-26h3ng`

The navigation half records what the live Pages build exposed on that date; it
is observation, not a promise that every action was exercised. The Garage and
pause menu were mapped under the agent API's headless mode so the weak survey
box did not have to render another frame. The DOM half is source-derived and
deliberately inventories major regions rather than every setting, button and
generated row.

## A. Navigation sitemap and mode web

### At a glance

```text
#overlay  TITLE
├─ CAREER MODES ──> #career ──> DRIVER CAREER | MY TEAM
├─ RACE ──────────> #select ──> #track-detail? ──> #race-settings ──> race
├─ TIME TRIAL ────> #select (variant) ──────────> settings ─────────> race
├─ RACE A FRIEND ─> #vsfriend
├─ SEASON ────────> #season-setup ──> customise ──> #race-settings ─> race
├─ DATA HUB ──────> #datahub
├─ TRACK DESIGNER > #trackdesigner (canvas + rail + MY CIRCUITS; SAVE / RACE / TIME TRIAL → #select; SHARE / EXPORT / IMPORT; a #track=<code> link opens it at boot, and #select's EDIT IN DESIGNER chip reopens a saved circuit)
├─ GARAGE ────────> #carsetup / #customize
├─ SETTINGS ──────> #pmsettings (→ #tl-editor, #garrival)
└─ HOW TO PLAY ───> #howtoplay

race
├─ HUD / #pausebtn ──> #pausemenu ──> #pmsettings?
├─ race flow ────────> #quali | #standings | #results
└─ tools ────────────> #lighting | #camtune | #flyby (→ #freecam) | #garrival | #photo-controls
```

`?` means optional. Pause was walked headlessly; the race-flow and visual-tuner
branches remain source-backed rather than end-to-end walkthroughs.

### Title (`#overlay`)

| Action | Button | Destination |
|---|---|---|
| Career Modes | `#mb-career` | Driver Career or My Team |
| Race | `#mb-race` | One Grand Prix |
| Time Trial | `#mb-tt` | Player against the clock |
| Race a Friend | `#mb-vs` | Private 2–4 player race |
| Season | `#mb-season` | Configurable championship |
| Data Hub | `#mb-data` | Schedule, standings, results, live data, telemetry and export |
| Garage | `#mb-garage` | Car setup/customisation |
| Settings | `#mb-settings` | Settings index |
| How to Play | `#mb-help` | Anchored help sheet |
| Use as Controller | `#mb-phonepad` | Phone only: opens `controller.html` to type another screen's room code. Hidden unless the pointer is coarse (`syncPointerKind()` in `js/game.js`) |

The title also carries the sound toggle, Apex 26 branding, grid/circuit summary
and unofficial disclaimer.

#### Settings (`#pmsettings`)

Settings opens at an index, then pushes one page at a time:

| Door | Trigger | Panel root | Page title |
|---|---|---|---|
| Controls | `#pm-open-controls` | `#pm-panel-controls` | CONTROLS |
| Driving | `#pm-open-driving` | `#pm-panel-driving` | DRIVING |
| Display | `#pm-open-display` | `#pm-panel-display` | DISPLAY |
| Appearance | `#pm-open-appearance` | `#pm-panel-appearance` | APPEARANCE |
| Driving Aids | `#pm-advanced` | `#advanced` | DRIVING AIDS |
| Music & Sound | `#pm-audio` | `#audioset` | MUSIC & SOUND |

Back pops to the Settings index; Back from the index returns to the title.
Escape closes the sheet. Values below are the observed live state, not a
defaults contract.

**Controls.** Throttle `HOLD`; Left-handed `OFF`; Gears `AUTO`; Active Aero
`MANUAL`. Other actions are Reset Keys, Button Names `AUTO`, Calibrate Stick,
Set Up a Wheel and Reset Controller. STEER THIS GAME WITH A PHONE (`#pm-phonepad`)
mints a room code and shows it with a QR for `controller.html#pad=CODE`
(`#pm-phonepad-box`). On a touch device, `#pm-phonepad-go` is the phone's end of
the same pairing (`js/input/phone-pad.js`; the protocol is in
[MULTIPLAYER.md](MULTIPLAYER.md) §Phone as controller).

| Device | Bindings shown |
|---|---|
| Keyboard | `←/A` and `→/D` steer; `↑/W` gas; `↓/S` brake; `SPACE` boost; `X` overtake; `Z` active aero; `E` upshift; `Q/SHIFT` downshift; `C` camera; `B` look back; `R` recover; `P` pause |
| Controller | `RT/A` gas; `LT/B` brake; `X` boost; `Y` overtake; D-pad Up active aero; `RB/LB` shift; View camera; right stick look back; left stick recover; Menu pause |

**Driving.** Driving Coach `ON`. Doors lead to Practice a Section, Pit Strategy
(Next Tyres `AUTO`) and an empty Session Review.

**Display.**

- HUD `ON`; Style `STANDARD`; Layout `FULL`; Map `ON`;
  Gaps `ON`; Line Colour `F1`; Line Opacity `NORMAL`; Brake Cue `OFF`.
- HUD and touch size/opacity `100%`, Panel Opacity `100%` (`#pm-panelopacity`,
  the plates behind the readouts; HIGH CONTRAST keeps them solid); Metrics Overlay `OFF`; Page `GOV`;
  Side `AUTO`; Size `S`.
- Renderer `THREE.JS`; Resolution `AUTO`; Fullscreen `OFF`; Upscale `OFF`;
  Occlusion `OFF`; Debris `ON`; Graphics `HIGH`.
- Cockpit Halo `ON`; Turn Chasing `40%`.
- `#pm-display-adv` holds Advanced Visuals. Lighting Tuner, Camera Tuner and
  Flyby Shot Editor are disabled outside a race and open separate docks.

**Appearance.** One help line, then closed folds whose summaries read
`SHIPPED` or `CUSTOM`. Every fold but GENERAL previews by PEEK
(`js/ui/screen-looks.js`): while a knob changes, `html[data-appearance-peek]`
ghosts the settings page and shows the real screen behind it (a closed dialog
is displayed without touching `hidden`/`open`; an empty screen gets a
stand-in). PEEK holds it; a tap or Esc returns.

- `#pm-general`, GENERAL (the shell's), with the live menu / HUD preview:
  - COLOURS: Theme, Menu Accent (swatches, custom hex), HUD Accent.
  - READABILITY: UI Size `100%` (`#pm-uiscale`, moved here from Display), Text
    Size, High Contrast, Speed Units, Help Text `SHOW` (`#pm-helptext`; HIDE
    drops the grey `.adv-help` lines in Settings and race setup, keeping status
    lines, live regions and `data-help="keep"` warnings/readouts).
  - MOTION: Motion `ON` (global: menus, camera shake, flyby).
- `#pm-pausemenu`, PAUSE MENU (`js/ui/pause-opts.js` + `lookPause`; rows mount
  into `#pm-pausemenu-body` at runtime): Layout `GRID` (LIST, COMPACT, WIDE,
  SIDEBAR), Side `CENTRE`, Background `FULL`, Confirm Quit `ON`, then Button
  Height `100%`, Card Width `100%`, Button Gap `100%`, Corners `ROUND`, Button
  Style `FILLED`, Text Align `CENTRE`, Vertical Position `MIDDLE`, Music Card
  `SHOW`, Build Tag `SHOW`; RESET PAUSE MENU, PEEK.
- `#pm-titlescreen`, TITLE SCREEN (`js/ui/title-layout.js`): Title Intro
  `FULL`, Menu Wash `FULL`, Title Art `ON`, the TITLE LAYOUT sub-fold
  (`#pm-titlelayout`, built at runtime), Replay Intro, PEEK (title screen only).
- Built by `js/ui/screen-looks.js` (`#pm-look-<screen>`), each with the shared
  core — Width `100%`, Density `AUTO`, Button Height `100%`, Corners `ROUND`,
  Background `FULL`, Headings `LEFT` — where it applies, plus its own, RESET and
  PEEK:
  - DATA HUB (`#datahub`): Row Height `SHIPPED`, Tab Style `FILLED`, Row
    Stripes `OFF` (no Density: the card is fit-managed).
  - TRACK SELECTOR (`#select`): Tile Size `100%`, Strip Rows `1`, Tile Names
    `SHOW`, Strip Position `TOP`.
  - RACE SETTINGS (`#race-settings`): Columns `AUTO`, Presets `CARDS`.
  - CAREER (`#career`, Driver Career and My Team): Columns `AUTO`, Left Column
    `49%`, Column Order `SHIPPED`.
  - GARAGE (`#carsetup`; no Width / Background): Panel Side `RIGHT` (LEFT moves
    the car to the right), Panel Width `100%`, Panel `SHIPPED`, Stat Bars `SHOW`.
  - POPUPS (every `dialog.screen.dim` except settings, pause and race
    settings): Position `MIDDLE`, Table Rows `SHIPPED`.

**Steering & Assists.** Preset `STANDARD`; Overall Speed `84%`; Feel `NORMAL`;
Tilt `8`; Aids `OFF`; Driving Help `LOW`; Racing Line `OFF`, plus an Advanced
door.

**Music & Sound.** Music `ON`, source `ALL`, volume `6`; SFX `ON`, volume `2`;
Team Radio `OFF`; Engine Tone `TEAM` with pitch/roughness sliders; Spotify
`OFF`.

#### How to Play (`#howtoplay`)

`#htp-contents` is an anchor index, not a Next/Back slide sequence.

| Anchor | Section |
|---|---|
| `#htp-controls` | Quick Start — Keyboard, Controller and Touch/Mobile expanders |
| `#htp-racing` | Boost |
| `#htp-pits` | Pit Stops — Tyre Wear Runs Them |
| `#htp-driving` | Driving Coach |
| `#htp-setup` | Camera |
| `#htp-modes` | Race |
| `#htp-friends` | Race a Friend |

`#htp-close` closes the sheet and returns to the title.

#### Data Hub (`#datahub`)

| Tab | Observed surface |
|---|---|
| Schedule | Year selection (2026–2023) and event/session browsing |
| Standings | Championship standings |
| Results | Grand Prix and session filters |
| Live | Weather, classification, refresh and auto-refresh |
| Telemetry | Driver chips such as NOR and VER |
| Export | Gather, then Download; download begins disabled |
| Race It | One real Grand Prix, lap by lap, from OpenF1 timing (`js/data/real-race-tab.js`). Pick a DRIVE AS seat, then START or JUMP IN at any lap. LOAD pulls every car's real positions; then HIGHLIGHTS or WATCH FROM L*n* replays the race, with its own WATCH CAMERA pick. `js/race/real-race.js` stages it |

Session filters include P1, P2, P3, Qualifying and Race. Close returns to the
title.

**The pre-race card for a real race.** JUMP IN, WATCH and HIGHLIGHTS close the
hub and go through the same pre-race screen as RACE!: the `#loading` card with
its flyby and the announcer. `RealRace.launch(…, { intro: true })` calls
`G.raceIntro`, which hides the title (`#overlay`) behind the card. The card reads
`RealRace.intro()`: the real event's title, the driver whose seat you take, the
start lap and the race so far. A mid-race JUMP IN is a rolling start. The AI
drives your car for a few seconds while a big countdown on the start lights
(`G.handoverCount`) runs to GO, then hands it to you.

### Career modes (`#career`)

The career hub offers three Driver Career slots, three My Team slots, a guide
for each flavour, and Main Menu.

Starting an empty slot stays within the career flow:

1. Choose `DRIVER` or `MY TEAM`.
2. Driver path: team offers (“Who will have you”), driver identity
   (name/code/number), then lead or second seat.
3. My Team path: create an own twelfth team.
4. Review the relevant career guide.
5. Start Career.

The live walk explored the Driver setup and switched to My Team, but did not
press Start Career. Supporting layers include `#career-offers`,
`#career-history`, `#career-guide` and `#teampicker`.

### One Grand Prix (`#select` → `#race-settings`)

1. Choose `ALL`, `SEASON` or `CLASSICS` (plus `♥ FAVOURITES` once any circuit
   is starred), optionally search, then select a circuit. `F` on a focused
   tile stars or unstars it; a starred tile wears a small ♥ badge.
2. Read the circuit card: layout, location, length, turns, direction,
   elevation, DRS, slowest corner and night tag.
3. Optionally open `#track-detail` for the map, elevation graph, DRS and turn
   classes, and the `☆ FAVOURITE` / `★ FAVOURITE` toggle (`#track-detail-fav`,
   built in JS, `aria-pressed`; stored as `apex26.favTracks`); close returns to
   the picker.
4. `BACK` returns to title, `YOUR CAR` opens Garage, and `NEXT` opens Race
   Settings.
5. Configure laps, weather, conditions, time of day, difficulty, grid,
   cautions, Duel, driving line, tyre wear, strategy and reliability. A solo
   one-off GP opens a new circuit on the laps (a rung, or FULL), weather, time
   of day and MIXED it last STARTED with (`apex26.raceDraft`); time trial, the
   Daily, championship rounds and a VS FRIEND room keep their own staging.
6. `RACE!` starts the session.

Observed session values are only examples, not defaults. In particular, the
walk showed Cautions On from persisted preferences while the product default
can be Off.

### Time Trial (`#select`, mode variant)

The picker adds Daily Standard / Today and Daily Open to the All, Season and
Classics filters. Its footer remains Back / Your Car / Next. The settings pass
exposes the time-trial subset (laps, weather, time and driving line), then
`RACE!`. The live walk did not start the run.

### Race a Friend (`#vsfriend`)

The lobby starts with `HOST A RACE`, `JOIN A FRIEND`, `NEW CODE`,
`ENTER CODE`, and `CLOSE`.

- Host: copy link/code, show code, accept an answer by scan or paste, connect.
- Join: scan or paste an invite, then generate an answer.

No peer connection was attempted in the source walk.

### Season (`#season-setup` → `#race-settings`)

The setup screen presents the 24-round calendar, next-race card, Circuit Detail,
Customise Season, Your Car, Next and Back.

Customise Season can reorder or remove rounds; apply Full, 12, 8, 5, Classics,
Shuffle or Reverse presets; configure qualifying, sprint, race distance,
points, fastest-lap point and dropped scores; and add classics. Next opens the
season variant of Race Settings. Qualifying grid was disabled in the observed
state. No race was started.

### Garage (`#carsetup` / `#customize`)

Garage is reachable from the title or any `YOUR CAR` action. `#cs-tabs`
populates only after `#carsetup` opens.

| Tab | `data-cs-cat` |
|---|---|
| Team | `team` |
| Engine | `engine` |
| Aero | `aero` |
| Susp | `suspension` |
| Brakes | `brakes` |
| Tyres | `tyres` |
| ERS | `ers` |
| Gearbox | `gearbox` |
| Fuel | `fuel` |
| Exhaust | `exhaust` |
| Floor | `floor` |
| Cockpit | `cockpit` |
| Wheels | `wheels` |
| Setup | `tune` |
| Livery | `livery` |

The camera disclosure `#cs-cam` reveals `#cs-cam-panel`. Its car views are
Hero, Front, Side, Rear and Top; wing framing also provides Wing Front and Wing
Rear. `#cs-aero` toggles the live active-aero wing demonstration.

### Pause and in-race layers

After `await __apex.race("monza")`, `#pausebtn` opens `#pausemenu`.

| Control | ID | Result |
|---|---|---|
| Resume | `#pm-resume` | Return to the race |
| Restart Race | `#pm-restart` | Restart the current race (with Confirm Quit ON, the first press arms: "TAP AGAIN") |
| Settings… | `#pm-settings` | Open the same Settings index used from title |
| How to Play… | `#pm-howto` | Open the help sheet |
| Standings | `#pm-standings` | Open championship standings; hidden outside a championship |
| Quit to Menu | `#pm-quit` | Leave the race for the title (with Confirm Quit ON, the first press arms: "TAP AGAIN") |

The pause card also has Previous, Pause and Next track controls in its music
strip. Pause Settings exposes the same Controls, Driving, Display, Steering &
Assists and Music & Sound doors documented above.

Other in-race roots are:

- `#lighting`, `#camtune` and `#flyby` — visual tuner docks.
- `#freecam` — the FREE CAMERA dock, the flyby editor's sub-mode (`#fb-freecam`
  in `#fb-head`, as `#pc-toggle` is the lighting tuner's). It flies with
  `#photo-controls` from the previewed frame on the flyby lens; SET SHOT START /
  END write the view into the selected shot; DONE, EXIT or Escape return to the
  editor, and resume/quit close it.
- `#garrival` — the GARAGE ARRIVAL TUNER dock (`#pm-garrival` under Display →
  Advanced Visuals; `js/garage/arrival.js`). Opens outside a race too; DONE or
  Escape returns to Settings. Four MOMENTS, each configured on its own: RACE START
  (the RACE! drive-out), PIT IN (WORK ON CAR), PIT OUT (the stop's release) and
  RACE END (the next non-pit garage visit after a race, flavoured by `#ga-result`'s
  WIN / PODIUM / POINTS / FINISHED / RETIRED). The tabs `#ga-moment-<start|pitIn|pitOut|home>`
  (lifted into the workspace's sequence row) pick which moment every row, STYLE, the
  BAY CAMERA (`#ga-bay-shot`), RESET and PREVIEW act on; `#ga-copy-all` gives the other
  three its look. Rows that mean nothing for a moment hide (`GarageArrival.ROW_MOMENTS`).
  GARAGE ANGLE picks a camera or a preset (DIRECTOR, or CUSTOM's `#ga-shots-row`
  per-shot pickers); CAMERA HEIGHT, CAMERA MOVE (still / push in / pull out /
  drift), HANDHELD and FINAL SHOT ZOOM shape the shots; SHUTTER SHOT, HOLD BEAT,
  CAR SPEED and END BEAT set their lengths; SEQUENCE LIGHTING (a garage lighting
  mood held while it plays; AFTER-RACE LIGHTING picks one by result), DOOR GLOW,
  CAPTIONS and CINEMA BARS (`body[data-ga-bars]`) set the look; REAR LIGHT, SLOW-MO AT THE DOOR and ENGINE SOUND ON ARRIVAL round it off. PREVIEW
  (`#ga-preview`, the toolbar's Preview too) plays the picked moment's saved
  settings once in the garage room (`js/garage/setup-camera.js`
  startArrivalPreview) with `#garrival-inner` hidden; it ends by itself, on DONE
  or on Escape, and a paused race redraws its own frame after. Refused while the
  GARAGE or the drive-out owns the room.
- `#tl-editor` — the TITLE LAYOUT editor's docked bar (`#pm-tl-edit`, EDIT ON
  TITLE SCREEN…, under Appearance → TITLE SCREEN → TITLE LAYOUT;
  `js/ui/title-layout.js`).
  Title screen only (disabled while `#overlay` is hidden). Hides `#pmsettings`,
  sets `html[data-tl-edit]` and makes `#menu-buttons`, `#menu-brand` and
  `#tl-art` (a proxy over `#title-car`) draggable; `#tl-handle` sizes the
  selected piece. DONE or Escape returns to the fold. It is left out of the
  title's background isolation (`TopModal.syncMenuIsolation`) and MenuNav's
  arrows (they move the piece).
- `#photo-controls` — free-camera overlay.
- `#quali`, `#standings` and `#results` — session flow.
- `#rotate-device` — portrait race blocker.

The camera cycle (CAM button, `C` key; `js/camera/mode-switch.js`) includes
VISOR: the cockpit view without its steering wheel and dash (`js/camera/vantage.js`).
When a phone links as the controller, the screen switches to VISOR, because the
phone in your hand is the wheel. It switches back when the phone leaves, unless
you picked another camera meanwhile (`VISOR_CAM` in `js/game.js`).

### Mapping on a weak box

The successful live Pages walk used `?apex=1` and set these preferences before
the first page script (for example with Playwright `addInitScript`):

```js
localStorage.setItem("apex26.gfxBackend", "webgl2");
localStorage.setItem("apex26.gfxPreset", JSON.stringify("low"));
localStorage.setItem("apex26.resMode", JSON.stringify("low"));
localStorage.setItem("apex26.forceMobileTier", "1");
localStorage.setItem("apex26.debris", "0");
localStorage.setItem("apex26.devApi", "1");
```

It then called `__apex.headless(true)` before opening Garage or starting the
race. Headless mode lets runtime DOM populate while skipping the 3D draw path:

```js
__apex.headless(true);
await __apex.race("monza");
```

This is a mapping technique, not a player setting or evidence of a product
defect. It freezes the canvas, so disable headless mode and await a present
before any screenshot or pixel assertion. Explicit `webgl2` avoids a deferred
backend claim on a weak box, but cannot manufacture WebGL2 when the browser has
no context.

## B. DOM layer and ID inventory

### Layer model

`UiLayers.DEFS` is the canonical list of 30 screen-sized roots. A layer gates
driving/menu input unless its definition explicitly sets `gate: false`.

| Layer root | Gates? | Role |
|---|---:|---|
| `#overlay` | no | Title/main menu |
| `#rotate-device` | no | Portrait-orientation race blocker |
| `#pausemenu` | yes | Pause dialog |
| `#pmsettings` | yes | Pause/title Settings sheet |
| `#select` | yes | Circuit and mode selection |
| `#season-setup` | yes | Season calendar and format setup |
| `#career` | yes | Career page and season hub |
| `#career-offers` | yes | End-of-season offers |
| `#career-history` | yes | Career history |
| `#career-guide` | yes | Career guide |
| `#teampicker` | yes | Team selection |
| `#vsfriend` | yes | Multiplayer lobby |
| `#race-settings` | yes | Pre-race settings |
| `#duel-picker` | yes | Duel rival picker (opened from `#rs-duel-open`) |
| `#quali` | yes | Qualifying |
| `#standings` | yes | Championship standings |
| `#results` | yes | Race results |
| `#customize` | yes | My Team customisation |
| `#carsetup` | yes | Garage with live car preview |
| `#howtoplay` | yes | Help/tutorial |
| `#spotifypanel` | yes | Spotify playback |
| `#track-detail` | yes | Fullscreen circuit detail |
| `#lighting` | yes | Lighting tuner |
| `#camtune` | yes | Camera tuner |
| `#flyby` | yes | Flyby shot editor |
| `#freecam` | yes | Free camera panel |
| `#garrival` | yes | Garage arrival tuner (and its PREVIEW) |
| `#tl-editor` | yes | Title layout editor bar (title screen) |
| `#photo-controls` | yes | Free-camera controls |
| `#datahub` | yes | Data and telemetry hub |
| `#trackdesigner` | yes | Track designer (custom circuits) |

`#overlay` is non-gating because no car is being driven while the title is
open. `#rotate-device` is non-gating so Escape and driving keys still reach the
race beneath its opaque, media-query-controlled blocker.

Most roots are real `<dialog>` elements and begin hidden. The non-dialog
screen/region roots are `#lighting`, `#camtune`, `#flyby`, `#freecam`, `#garrival`, `#tl-editor`, `#photo-controls`,
`#carsetup`, `#career` and `#select`.

### Major shell and race IDs

| ID | Kind | Purpose |
|---|---|---|
| `#__err_overlay` | runtime overlay | Inline uncaught-error display |
| `#game` | canvas | WebGL driving surface, not a menu layer |
| `#nogl` | fallback | WebGL2 unsupported message |
| `#loading` | transient screen | Pre-race loading/status |
| `#hud` | race chrome | Full-screen in-race HUD |
| `#pausebtn` | race chrome | Opens `#pausemenu` |
| `#hud-restore` | race chrome | Restores a hidden HUD |
| `#dlg-pause` | heading | Pause dialog label |
| `#pm-resume` | pause action | Resume the current race |
| `#pm-restart` | pause action | Restart the current race |
| `#pm-settings` | pause action | Open the shared Settings sheet |
| `#pm-howto` | pause action | Open How to Play |
| `#pm-standings` | pause action | Championship-only standings |
| `#pm-quit` | pause action | Quit to the title |
| `#photo-controls` | overlay | Click-through free-camera controls |

### Title, Settings and help IDs

| Root | Important descendants |
|---|---|
| `#overlay` | `#menu-brand`, `#menu-buttons`, `#menu-hero`, `#menu-primary`, `#menu-explore`, `#menu-secondary`; title actions `#mb-career`, `#mb-daily`, `#mb-race`, `#mb-tt`, `#mb-vs`, `#mb-season`, `#mb-watch`, `#mb-practice`, `#mb-photo`, `#mb-garage`, `#mb-data`, `#mb-settings`, `#mb-help` |
| `#pmsettings` | `#pmsettings-inner`, `#dlg-settings`, `#pm-settings-body`, `#pm-settings-index` |
| Settings pages | `#pm-panel-controls`, `#pm-panel-driving`, `#pm-panel-display`, `#pm-panel-appearance`, `#pm-display-adv`, `#advanced`, `#audioset` |
| `#howtoplay` | `#howtoplay-inner`, `#htp-contents`, `#htp-controls`, `#htp-racing`, `#htp-pits`, `#htp-driving`, `#htp-setup`, `#htp-modes`, `#htp-friends`, `#htp-close` |
| `#spotifypanel` | `#spotifypanel-inner` |

`#dlg-settings` is mutable: `SettingsNav` updates it as the page stack changes.

### Picker, season and pre-race IDs

| Root | Important descendants / related roots |
|---|---|
| `#select` | `#sel-inner`, `#sel-body`, `#sel-shelf`, `#sel-tracks`, `#sel-track-section`, `#sel-track-preview` |
| `#track-detail` | `#track-detail-body` |
| `#season-setup` | `#ss-inner`, `#ss-body`, `#ss-cal`, `#ss-pool` |
| `#teampicker` | `#sel-teams` (generated listbox) |
| `#race-settings` | `#rs-body` |
| Session dialogs | `#quali`, `#standings`, `#results` |

### Career, multiplayer and Garage IDs

| Root | Important descendants / related roots |
|---|---|
| `#career` | `#cr-inner`, `#cr-body`, `#cr-left`, `#cr-right` |
| Career dialogs | `#career-offers`, `#career-guide`, `#career-history` |
| `#vsfriend` | `#vsfriend-inner`, `#vs-body` |
| `#carsetup` | `#cs-inner`, `#cs-body`, `#cs-tabs`, `#cs-options`, `#cs-cam`, `#cs-cam-panel`, `#cs-aero` |
| `#customize` | `#cz-body` |

### Tuner and data IDs

| Root | Important descendants |
|---|---|
| `#lighting` | `#lighting-inner`, `#lt-rail`, `#lt-rows` |
| `#camtune` | `#camtune-inner`, `#ct-rail`, `#ct-rows` |
| `#flyby` | `#flyby-inner`, `#fb-rail`, `#fb-rows` |
| `#freecam` | Runtime-built `#freecam-inner` (`#fc-status`, `#fc-rows`: `#fc-speed`, `#fc-roll`, `#fc-fov`, `#fc-snap-car`, `#fc-corner-prev`/`-next`, `#fc-lens-race`/`-flyby`, `#fc-copy-view`, `#fc-copy-pose`, `#fc-out`); `#fc-close` is the boot-time Escape target |
| `#datahub` | Runtime-built inner UI; `#dh-close-btn` is the boot-time Escape target |
| `#trackdesigner` | Runtime-built body and foot (`js/editor/designer.js`); the shell ships `#td-title` (its accessible name) and `#td-close` (the boot-time Escape target) |

The tuner `*-rail` roots hold fixed headers/mode controls; `*-rows` receive
generated controls.

### CSS ownership

| Entry point | UI responsibility |
|---|---|
| `css/tokens.css` | Tokens, fonts, base canvas/body rules and cascade order |
| `css/components.css` | Shared `.screen`, `.sheet` and `.pane` primitives |
| `css/menus.css` | Title menu and circuit picker |
| `css/tuner.css` | Lighting tuner and shared advanced/tuning controls |
| `css/carsetup.css` | Garage, tabs, options, livery and creator UI |
| `css/hud.css` | HUD, start lights and photo controls |
| `css/overlays.css` | Touch controls, results and How to Play |
| `css/responsive.css` | Viewport and orientation adjustments |
| `css/track-detail.css` | Track detail, standings and orientation fixes |
| `css/career.css` | Career hub, setup and dialogs |
| `css/data.css` | Data Hub and telemetry popups |

For the shared component grammar and viewport axes behind these files, continue
to [COMPONENTS.md](COMPONENTS.md). For focus, Escape and menu behavior changes,
use the `ui-menu-a11y` skill rather than treating this map as an interaction
specification.

---

## UI explorer

> Merged from `UI-EXPLORER.md` on 2026-11-03 (docs/plans/2026-11-03-agent-surface-reset.md §4.9, D-001); links that named that page land here.

`node tools/ui/explorer.mjs all` produces `artifacts/ui-explorer/index.html` and
machine-readable evidence. Open the HTML directly in Chrome; no report server is
needed. Use `--out /absolute/directory` to keep a run outside the checkout.

The eight modes share one Chromium and run sequentially. The default screenshot
budget is 25; `--max-shots 0` collects DOM/ARIA without images. Capture-budget
exhaustion is partial coverage, never a pass. Probe completion and UI correctness
are distinct: inspect the findings even when the command exits zero.

Menus use the shipped Three.js path. Scene diagnostics default to explicit GLX
(`--scene-backend webgl2`) for software-rendered inspection. Use
`--scene-backend three` for renderer-specific investigation; its review-angle
presentations exceeded the local deadline during development. A GLX scene pass
does not establish Three.js pixel equivalence. The selected backend is recorded.
Scene diagnostics use an 800 × 500 viewport; review angles hide the HUD. Fresh
presentation and pixel checks run before pausing rendering for DOM/ARIA capture.

| Mode | What it does | Evidence and limits |
|---|---|---|
| `missions` | Fresh-profile journeys: wet Monaco, create a livery, find controls from a race | Real actionable clicks and saved replay recipes, Playwright traces, checkpoint screenshots. Guided routes are separate from independent discoverability testing. |
| `atlas` | Builds a graph from observed before/after states and actions | Catalog coverage, clickable state evidence and unexplored roots. Unvisited does not mean unreachable. |
| `transitions` | Samples a real settings transition while it happens | Serial timestamped filmstrip plus Chromium performance trace. Sample spacing includes screenshot cost; this is not fixed-frame-rate video. |
| `responsive` | Resizes an open settings sheet, rotates back, enlarges root text and samples keyboard focus in a touch context | DOM boxes, advisory target/overflow findings, ARIA and images. Chromium emulation does not establish Safari behavior; fixed-pixel text may not enlarge. |
| `faults` | Aborts or delays asset requests, tests offline reload, restores connectivity and exercises settings | Interception receipts, failed requests and recovery evidence. No intercepted request is reported as incomplete injection. Fresh contexts block service workers, so this is not a service-worker recovery test. |
| `accessibility` | Samples Tab traversal and Escape, captures accessible structure and names | Bounded focus history and DOM screening, not WCAG certification or a complete focus graph. Canvas geometry needs scene evidence. |
| `minimize` | Replays an exact declarative bug oracle in a fresh context per candidate and removes unnecessary actions | Original/minimized counts, replay budget, completeness and replay JSON. Baseline false, replay errors and budget exhaustion stay explicit. Deletion-1-minimal is not globally shortest. |
| `scene` | Reconstructs a supplied game frame, or investigates an explicit circuit station, then captures alternate views | Camera/visible-scene JSON, original reproduction, original screenshot and two orbits. Review angles use a measured local station and 600 m far plane; the original frame retains its original lens. An image alone cannot locate its world geometry. |

Examples:

```sh
node tools/ui/explorer.mjs --list
node tools/ui/explorer.mjs all --out artifacts/ui-explorer/review
node tools/ui/explorer.mjs responsive --max-shots 4
node tools/ui/explorer.mjs replay artifacts/ui-explorer/evidence/first-race-final.replay.json
node tools/ui/explorer.mjs minimize failing-scenario.json --max-attempts 8
node tools/ui/explorer.mjs scene --repro player-repro.json --reference reported-frame.jpg
node tools/ui/explorer.mjs scene --track monaco --frac 0.4
node tools/ui/explorer.mjs scene --track monaco --frac 0.4 --scene-views 45,225
```

A replay is data, not executable JavaScript. Actions are `click` (selector or exact
role/name), `fill`, `select`, `press`, `viewport`, `textScale`, `offline`, `reload`,
`wait`, `checkpoint` and explicit `scene`. The schema rejects unknown fields and
unbounded numbers. Bug oracles select a specific visible element, text, console
message, actual game track/weather/state, or layout finding. Console matching uses literal text, not injected code.
Attach a specific oracle before minimizing; reaching a generic timeout does not
prove the original defect reproduced. Every candidate begins with empty storage.

### Browser plugin missions

Generate a hint-free task for the connected Browser Use tool:

```sh
node tools/ui/explorer.mjs brief --mission first-race --url https://your-pinned-preview/
```

The JSON contains a bounded `task`, deadline and cost cap matching Browser Use's
automation arguments. Run it through the connected tool, then retain its actual
result alongside this report. A hosted browser cannot reach this container's
localhost automatically. Use a reachable preview pinned to the intended commit.
No independent plugin run is claimed by producing a task brief. The other mission
IDs are `customize-car` and `return-settings`. Goals contain no selectors or debug
API hints; compare their real action histories against guided routes to find
discoverability problems.

### Reviewing evidence

The HTML uses local relative assets and inline styles, with no JavaScript, so it
works through `file://` and script-disabled previews. Capability links navigate
to observations; status badges retain the coverage result. Expand an observation
for actions, DOM state, console errors and replay instructions. Report JSON and
embedded JSON downloads use ordinary links.
Open `*.trace.zip` using Playwright Trace Viewer. Import
`settings-performance.trace.json` into Chrome DevTools Performance.
Screenshots are visual evidence; DOM findings are advisory, not screenshot-based
assertions. Do not turn a screenshot difference alone into a confirmed bug.

No product files are changed by exploration. Fresh contexts isolate settings and
liveries. The toolkit uses the repository harness, occupancy lock and teardown,
refuses a busy software-rendering host, and does not run browsers in subagents.

Sources checked during design:

- [Playwright locators and ARIA snapshots](https://playwright.dev/docs/api/class-locator#locator-aria-snapshot)
- [Context routing and service workers](https://playwright.dev/docs/api/class-browsercontext#browser-context-route)
- [Playwright tracing](https://playwright.dev/docs/api/class-tracing)
- [Chromium tracing protocol](https://chromedevtools.github.io/devtools-protocol/tot/Tracing/)
- [Chrome Recorder](https://developer.chrome.com/docs/devtools/recorder/overview)

---

## Capture and publish a design review

> Merged from `CAPTURE-REVIEW.md` on 2026-11-03 (docs/plans/2026-11-03-agent-surface-reset.md §4.9, D-001); links that named that page land here.

The matrix runner captures part details with one owned garage browser. Run a
read-only plan first; it includes the source fingerprint and discovered browser
path. Browser availability does not prove launch or native presentation.

```sh
node tools/shot/design-matrix.mjs --part=sidepod,frontWing --angles=headOn,grazing --backend=three --run=materials --plan
node tools/shot/design-matrix.mjs --part=sidepod,frontWing --angles=headOn,grazing --backend=three --run=materials
```

Comma-separated variants are separate shots. Semicolon-separated assignments
form a mixed-field recipe; quote the whole argument in a shell:

```sh
node tools/shot/design-matrix.mjs --run=cobalt '--variants=pod=#225bb4;podFinish=satin;coverFinish=pearl;part.aero=style_aero_spoon'
```

Other controls: `--colours=dark,mid,light`, `--lights=lamp,off,keyHi,keyLo`,
`--baseline=podFinish=gloss`, `--fill=0.7`, `--fov=45`, `--viewport=1280x720`,
`--phone`, `--batch=1/3`, `--bounds=@file.json`, `--out=artifacts/my-run`.
Dimensions are limited to 1600×900 and DPR 1. The Linux software-rendering
container's load must be below 3. As in the underlying garage tool, that
absolute Linux load limit does not apply to shared macOS runners.

Use identical arguments plus `--resume` to continue a run. Source revision,
tracked changes, non-hidden untracked runtime/tool source, backend, camera and
plan must match. Missing or modified images redo the whole baseline group.
Legacy manifests without source receipts require a new run. `--index-only`
checks and rebuilds the indexes without launching a browser and returns a
failure when the selected coverage is incomplete. Batches share the full plan;
the index reports full coverage while the command reports selected coverage.

The runner writes `manifest.json`, `gallery.json`, `sheet.html` and PNGs under
`artifacts/` or `scratch/`. Gallery records include image hashes, source identity,
backend, readiness, camera and design recipe. Startup and command waits are
bounded. Missing Chromium fails before capture output is created. The tool never
installs a browser or replaces game frames with geometry projections.

### Export a portable site collection

The authored, styled Design Lab frontend is versioned under
[`sites/design-lab/`](../sites/design-lab/README.md). Its README
explains how to pair the exact site HTML/CSS/JS with the existing capture data
and assets. The portable exporter below remains a separate generated view.

The gallery exporter accepts matrix `gallery.json` or an existing Design Lab
`captures.json`. It validates every file against its recorded SHA-256, decodes
image dimensions, preserves each source revision, design recipe and historical
status, and groups native screenshots separately from geometry previews and
unverified visuals. Missing hashes or corrupt files fail the entire export.

```sh
node tools/shot/capture-gallery.mjs --input=artifacts/design-matrix/materials/gallery.json --assets=artifacts/design-matrix/materials --out=artifacts/materials-site --plan
node tools/shot/capture-gallery.mjs --input=artifacts/design-matrix/materials/gallery.json --assets=artifacts/design-matrix/materials --out=artifacts/materials-site
```

Output includes `artifacts/materials-site/index.html`,
`artifacts/materials-site/gallery.js`, `gallery.json` and
content-addressed `assets/`. The output directory must be new or empty and
contained in the checkout's artifact roots. These files can be included in a
Sites deployment. Exporting does not upload, recapture, or reattribute old shots
to a newer deploy revision. Native screenshots require recorded backend,
readiness and capture method; a hash match alone proves only file identity.

Process lifecycle reference: https://nodejs.org/api/child_process.html#event-close

### When the local browser cannot run

The `Capture gallery` workflow runs the same native matrix and exporter on
`macos-latest`, matching the repository's existing garage-before capture route.
Commit `.github/capture-gallery-request.json` on your branch, then dispatch the
workflow from it (`gh workflow run capture-gallery.yml --ref <branch>`); a push
alone no longer starts a run. The runner captures the exact
workflow SHA, limits the request to 24 images and the job to 15 minutes, and
uploads PNGs, source/camera receipts and a portable gallery for seven days.
It grants only read access to repository contents and does not cancel a running
capture when another request arrives. Output directories cannot be overridden.

Validate the request locally with `node tools/shot/run-capture-request.mjs --plan`.
The request is an argument array passed without a shell; semicolons in mixed
recipes remain part of one value.

An HTTP 200 response does not prove a browser archive downloaded. In this Work
environment, the Chromium CDN returned a 195-byte HTML page titled "Site
Unavailable" instead of a ZIP. The cloud browser also reported "WebGL2
unavailable" in the actual car studio. Use the CI route for native captures in
that situation; the static gallery preview alone cannot verify game rendering.
