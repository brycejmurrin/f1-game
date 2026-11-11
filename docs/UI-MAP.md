# UI map — navigation and DOM

This is the lookup map for Apex 26's menu web: where a title-screen action
leads, which overlays can appear along the way, and which stable DOM roots an
agent can inspect.

For the current end-to-end routes and repeatable regression journeys, use
[usage paths](ARCHITECTURE-MAP.md#usage-paths-and-journey-checklist). The dated
navigation observations below are historical; Garage forward/back and the title
doors are traced in that map.

> **Live walk:** 2026-09-18, [brycejmurrin.github.io/f1-game/](https://brycejmurrin.github.io/f1-game/)
>
> **Source re-check:** 2026-11-10 — title doors, Settings pages, pause card,
> layer roots and CSS owners against `index.html`, `js/ui/title-menu.js`,
> `js/ui/settings-tabs.js`, `js/ui/layers.js` and `tools/manifest.cjs`

The navigation half records what the live Pages build exposed on the walk date,
corrected where the source has since moved; it is observation, not a promise
that every action was exercised. The Garage and pause menu were mapped under the
agent API's headless mode so the weak survey box did not have to render another
frame. The DOM half is source-derived and deliberately inventories major regions
rather than every setting, button and generated row.

## A. Navigation sitemap and mode web

### At a glance

```text
#overlay  TITLE
├─ #menu-hero: CAREER MODES ─> #career ──> DRIVER CAREER | MY TEAM
│              CONTINUE (when a hint is saved) · DAILY TIME TRIAL ─> #select (daily)
├─ Play:   RACE ───────> #select ──> #track-detail? ──> #race-settings ──> race
│          TIME TRIAL ─> #select (variant) ─────────> settings ─────────> race
│          RACE A FRIEND > #vsfriend
│          SEASON ─────> #season-setup ──> customise ──> #race-settings ─> race
│          PRACTICE ───> #select (practice) ──> settings ──> race
├─ Garage: GARAGE ─────> #carsetup / #customize
├─ Watch & Explore: WATCH ─> #datahub (WATCH & DRIVE tab) · DATA HUB ─> #datahub
├─ Create: PHOTO STUDIO ─> #photo-studio · TRACK DESIGNER ─> #trackdesigner
│          (canvas + rail + MY CIRCUITS; SAVE / RACE / TIME TRIAL → #select; SHARE / EXPORT / IMPORT;
│          a #track=<code> link opens it at boot, and #select's EDIT chip reopens a saved circuit)
│          VISUAL STUDIO ─> #pmsettings (VISUAL STUDIO page)
└─ Utilities: STANDINGS? ─> #standings · SETTINGS ─> #pmsettings (→ #tl-editor, #garrival)
              USE AS CONTROLLER? ─> controller.html · HOW TO PLAY ─> #howtoplay
              SAVES & DATA ─> #pmsettings (SAVES & DATA page)

race
├─ HUD / #pausebtn ──> #pausemenu ──> #pmsettings?
├─ race flow ────────> #quali | #standings | #results
└─ tools ────────────> #lighting | #camtune | #flyby (→ #freecam) | #garrival | #photo-controls
```

`?` means optional. Pause was walked headlessly; the race-flow and visual-tuner
branches remain source-backed rather than end-to-end walkthroughs.

### Title (`#overlay`)

The doors are grouped in the shell (`index.html`, `#menu-buttons`); the row
each door belongs to is `DESTINATION_GROUPS` in `js/ui/title-menu.js`, and
`#menu-hero` holds the career/continue/daily retention doors.

| Row | Doors (button id) | Destination |
|---|---|---|
| `#menu-hero` | `#mb-career`, `#mb-continue` (hidden without a usable hint), `#mb-daily` | Career slot picker; the saved career hub / Daily / last picker; today's Daily time trial |
| `#menu-primary` (Play) | `#mb-race`, `#mb-tt`, `#mb-vs`, `#mb-season`, `#mb-practice` | One GP, time trial, friend lobby, championship, practice goals |
| `#menu-garage` | `#mb-garage` | Car setup/customisation |
| `#menu-explore` (Watch & Explore) | `#mb-watch`, `#mb-data` | Data Hub on WATCH & DRIVE (`openDataHub("race")`); Data Hub |
| `#menu-create` (Create) | `#mb-photo`, `#mb-designer`, `#mb-visual` | Photo Studio; Track Designer; Settings on VISUAL STUDIO |
| `#menu-secondary` (Utilities) | `#mb-standings` (standalone season only), `#mb-settings`, `#mb-phonepad`, `#mb-help`, `#mb-saves` | Standings; Settings index; `controller.html`; How to Play; Settings on SAVES & DATA |

`#mb-visual` and `#mb-saves` are Settings shortcuts (`TitleMenu` `wireShortcuts`
→ `SettingsNav.showDirect`). `#mb-phonepad` is phone only: it opens
`controller.html` to type another screen's room code, and stays hidden unless the
pointer is coarse (an inline query in `index.html`, then `syncPointerKind()` in
`js/ui/platform-session.js`).

The title also carries the sound toggle, Apex 26 branding, grid/circuit summary
and unofficial disclaimer.

#### Settings (`#pmsettings`)

Settings opens at the door index (`#pm-settings-index`), then pushes one page
at a time. The routes, their titles, parents and panels are `routes` in
`SettingsNav` (`js/ui/settings-tabs.js`); the door buttons and panel roots are
in `index.html`. `#dlg-settings` shows the breadcrumb of page titles.

| Door (index button) | Trigger | Panel root | Page title | Holds |
|---|---|---|---|---|
| Controls | `#pm-open-controls` | `#pm-panel-controls` | CONTROLS | Feel/tilt, steering input, throttle, left-handed, tilt and stick calibration, phone pairing (`#pm-phonepad`, `#pm-phonepad-go`), key and controller bindings, wheel setup |
| Driving Aids | `#pm-open-driving` | `#pm-panel-driving` | DRIVING AIDS | Presets (ROOKIE / RELAX / STANDARD / PRO), driving help, steer assist, haptics, gears, active aero, driving coach, braking cues |
| HUD & Camera | `#pm-open-display` | `#pm-panel-display` | HUD & CAMERA | HUD on/style/layout, map, gaps, mirror, racing-line colour/opacity, HUD/button size and opacity, panel opacity (`#pm-panelopacity`) |
| Appearance | `#pm-open-appearance` | `#pm-panel-appearance` | APPEARANCE | `AppearanceStudio` (`js/ui/appearance-studio.js`): presets, profiles, MENU CUSTOMIZATION (`#pm-tl-edit` EDIT MAIN MENU, TITLE SCREEN fold), RACE HUD accents, Home scene; then the per-screen folds |
| Accessibility | `#pm-open-a11y` | `#pm-panel-a11y` | ACCESSIBILITY | Motion, keyboard focus and colourblind cues, built at runtime by `js/ui/a11y-opts.js` |
| Music & Sound | `#pm-audio` | `#audioset` | MUSIC & SOUND | Music (source, transport), sound effects and menu sounds, team radio and spotter, Spotify (`#spotifypanel`) |
| Saves & Data | `#pm-open-files` | `#pm-panel-files` | SAVES & DATA | Settings export/import/reset (`js/ui/settings-export.js`), save health (`js/ui/save-health.js`), Daily history |
| Graphics | `#pm-open-graphics` | `#pm-panel-graphics` | GRAPHICS | `#pm-display-adv` renderer fold: resolution, fullscreen/install, upscale, occlusion, debris, ambient occlusion, god-rays, background build, renderer and preset |
| Visual Studio | `#pm-open-visual` | `#pm-panel-visual` | VISUAL STUDIO | The tuner doors `#pm-lighting`, `#pm-camtune`, `#pm-flyby` (race only) and `#pm-garrival` |
| Progress | `#pm-open-progress` | `#pm-panel-progress` | PROGRESS | Licence badges |

Sub-page and session pages (no index door):

| Route | Opened from | Panel root | Page title |
|---|---|---|---|
| `advanced` | `#pm-advanced` on CONTROLS | `#advanced` | ADVANCED INPUT & HANDLING |
| `strategy` | pause `#pm-strategy` | `#pm-panel-strategy` | PIT STRATEGY |
| `practice` | pause `#pm-practice` | `#pm-panel-practice` | PRACTICE |
| `review` | pause `#pm-review` | `#pm-panel-review` | SESSION REVIEW |

Back pops to the parent page (the index, or CONTROLS for ADVANCED); Back from
the index returns to the caller. Escape closes the sheet. Default key and pad
bindings are `KEY_ACTIONS` in `js/input/bindings.js`, not restated here. Phone
pairing: `#pm-phonepad` mints a room code and shows it with a QR for
`controller.html#pad=CODE` (`#pm-phonepad-box`); on a touch device
`#pm-phonepad-go` is the phone's end of the same pairing (`js/input/phone-pad.js`;
the protocol is in [MULTIPLAYER.md](MULTIPLAYER.md) §Phone as controller).

**Appearance folds.** Every screen fold previews by PEEK
(`js/ui/screen-looks.js`): while a knob changes, `html[data-appearance-peek]`
ghosts the settings page and shows the real screen behind it (a closed dialog
is displayed without touching `hidden`/`open`; an empty screen gets a
stand-in). PEEK holds it; a tap or Esc returns.

- `#pm-general`, GENERAL: Speed Units and Help Text (`#pm-helptext`; HIDE drops
  the grey `.adv-help` lines in Settings and race setup, keeping status lines,
  live regions and `data-help="keep"` warnings/readouts). Theme, accents, UI
  size (`#pm-uiscale`), text size and contrast are the shell rows
  `#pm-appearance-menu` / `#pm-appearance-hud`, which `AppearanceStudio` adopts.
- `#pm-pausemenu`, PAUSE MENU (`js/ui/pause-opts.js` + `lookPause`; rows mount
  into `#pm-pausemenu-body` at runtime).
- `#pm-titlescreen`, TITLE SCREEN (`js/ui/title-layout.js`): Title Intro, Menu
  Wash, Title Art, the TITLE LAYOUT sub-fold (`#pm-titlelayout`, built at
  runtime), PEEK (title screen only).
- One fold per entry of `SCREENS` in `js/ui/screen-looks.js` (`#pm-look-<screen>`
  rows; each screen's knobs and defaults are in that registry): DATA HUB, TRACK
  SELECTOR, RACE SETTINGS, CAREER, GARAGE, TRACK DESIGNER and POPUPS, each with
  RESET and PEEK. `PEEK_ONLY` adds TITLE SCREEN and RACE HUD.

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

Tabs are `TABS` in `js/data/hub.js`:

| Tab | Surface |
|---|---|
| SCHEDULE | Year selection and event/session browsing |
| STANDINGS | Championship standings |
| RESULTS | Grand Prix and session filters |
| LIVE | Weather, classification, refresh and auto-refresh |
| TELEMETRY | Driver chips such as NOR and VER |
| WATCH & DRIVE | One real Grand Prix, lap by lap, from OpenF1 timing (`js/data/real-race-tab.js`). Pick a DRIVE AS seat, then START or JUMP IN at any lap. LOAD POSITIONS pulls every car's real positions; then HIGHLIGHTS or WATCH replays the race, with its own WATCH CAMERA pick. `js/race/real-race.js` stages it |
| GPS TRACE EXPORT | Developer tab behind the hub's ⋯ menu: gather, then download |

Session filters include P1, P2, P3, Qualifying and Race. Close returns to the
title.

**The pre-race card for a real race.** JUMP IN, WATCH and HIGHLIGHTS close the
hub and go through the same pre-race screen as START RACE: the `#loading` card with
its flyby and the announcer. `RealRace.launch(…, { intro: true })` calls
`G.raceIntro`, which hides the title (`#overlay`) behind the card. The card reads
`RealRace.intro()`: the real event's title, the driver whose seat you take, the
start lap and the race so far. A mid-race JUMP IN is a rolling start. The AI
drives your car for a few seconds while a big countdown on the start lights
(`G.handoverCount`) runs to GO, then hands it to you.

### Career modes (`#career`)

The career slot picker offers Driver Career and My Team slots (`SLOTS` per
flavour in `js/career/career.js`), a guide for each flavour, and Main Menu.

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
6. START RACE (`#rs-go`) starts the session.

Observed session values are only examples, not defaults. In particular, the
walk showed Cautions On from persisted preferences while the product default
can be Off.

### Time Trial (`#select`, mode variant)

The picker adds Daily Standard / Today and Daily Open to the All, Season and
Classics filters. Its footer remains Back / Your Car / Next. The settings pass
exposes the time-trial subset (laps, weather, time and driving line), then
START TIME TRIAL. The live walk did not start the run.

### Race a Friend (`#vsfriend`)

The lobby starts with `HOST A RACE`, `JOIN A FRIEND`, `NEW CODE`,
`ENTER CODE`, and `CLOSE`.

- Host: copy link/code, show code, accept an answer by scan or paste, connect.
- Join: scan or paste an invite, then generate an answer.

No peer connection was attempted in the source walk.

### Season (`#season-setup` → `#race-settings`)

The setup screen presents the season calendar, next-race card, Circuit Detail,
Customise Season, Your Car, Next and Back.

Customise Season can reorder or remove rounds; apply Full, 12, 8, 5, Classics,
Shuffle or Reverse presets; configure qualifying, sprint, race distance,
points, fastest-lap point and dropped scores; and add classics. Next opens the
season variant of Race Settings. Qualifying grid was disabled in the observed
state. No race was started.

### Garage (`#carsetup` / `#customize`)

Garage is reachable from the title or any `YOUR CAR` action. `#cs-tabs`
populates only after `#carsetup` opens: TEAM, then one tab per `Parts.CATALOG`
category (`js/car/parts.js`), then SETUP and LIVERY (`PSEUDO_CATS` in
`js/garage/setup-sheet.js`).

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
| Restart Race | `#pm-restart` | Restart the current race (with Confirm Quit ON, the first press arms: "TAP AGAIN"); disabled in an active friend race or armed friend qualifying |
| Settings… | `#pm-settings` | Open the same Settings index used from title |
| Race tools (`#pm-quick-doors`) | `#pm-strategy`, `#pm-review`, `#pm-practice`, `#pm-photo`, `#pm-howto`, `#pm-checkpoint` (REWIND & RETRY) | Session Settings pages, Photo Studio, How to Play, checkpoint save/retry/rewind; RECOVER CAR (`#pm-recover`, built in `js/game.js`) and REPLAY (`#pm-replay`, `js/camera/replay-buf.js`) join the tray at runtime |
| Standings | `#pm-standings` | Open championship standings; hidden outside a championship |
| Skip to Results | `#pm-skip-results` | Hidden except during the post-finish wait |
| Quit to Menu | `#pm-quit` | Leave the race for the title (with Confirm Quit ON, the first press arms: "TAP AGAIN") |

The pause card also has Previous, Play/Pause and Next track controls in its
music strip (`#pm-prev`, `#pm-play`, `#pm-skip`). Pause Settings opens the same
index documented above.

Other in-race roots are:

- `#lighting`, `#camtune` and `#flyby` — visual tuner docks.
- `#freecam` — the FREE CAMERA dock, the flyby editor's sub-mode (`#fb-freecam`
  in `#fb-head`, as `#pc-toggle` is the lighting tuner's). It flies with
  `#photo-controls` from the previewed frame on the flyby lens; SET SHOT START /
  END write the view into the selected shot; DONE, EXIT or Escape return to the
  editor, and resume/quit close it.
- `#garrival` — the GARAGE ENTER & LEAVE tuner dock (`#pm-garrival` on VISUAL
  STUDIO; `js/garage/arrival.js`). Opens outside a race too; DONE or
  Escape returns to Settings. Three sequences: PIT STOP (WORK ON CAR), RACE START
  (the START RACE drive-out) and AFTER THE RACE (the next non-pit garage visit after a
  race, flavoured by `#ga-result`'s WIN / PODIUM / POINTS / FINISHED / RETIRED).
  GARAGE ANGLE picks a camera or a preset (DIRECTOR, or CUSTOM's `#ga-shots-row`
  per-shot pickers); CAMERA HEIGHT, CAMERA MOVE (still / push in / pull out /
  drift), HANDHELD and FINAL SHOT ZOOM shape the shots; SHUTTER SHOT, HOLD BEAT,
  CAR SPEED and END BEAT set their lengths; SEQUENCE LIGHTING (a garage lighting
  mood held while it plays; AFTER-RACE LIGHTING picks one by result), DOOR GLOW,
  CAPTIONS and CINEMA BARS (`body[data-ga-bars]`) set the look; REAR LIGHT, SLOW-MO AT THE DOOR and ENGINE SOUND ON ARRIVAL round it off. PREVIEW PIT STOP / RACE START / AFTER RACE
  (`#ga-preview-in` / `#ga-preview-out` in the shell, `#ga-preview-home` built by `js/garage/arrival.js`) play the saved
  settings once in the garage room (`js/garage/setup-camera.js`
  startArrivalPreview) with `#garrival-inner` hidden; it ends by itself, on DONE
  or on Escape, and a paused race redraws its own frame after. Refused while the
  GARAGE or the drive-out owns the room.
- `#tl-editor` — the TITLE LAYOUT editor's docked bar (`#pm-tl-edit`, built by
  `js/ui/title-layout.js` and adopted by `AppearanceStudio` as EDIT MAIN MENU under
  Appearance → MENU CUSTOMIZATION).
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
you picked another camera meanwhile (`VISOR_CAM` in `js/ui/platform-session.js`).

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

`UiLayers.DEFS` (`js/ui/layers.js`) is the canonical list of screen-sized
roots; this table follows its order. A layer gates driving/menu input unless its
definition explicitly sets `gate: false`. "Element" is the shell tag in
`index.html` (JS: built at runtime).

| Layer root | Element | Gates? | Role |
|---|---|---:|---|
| `#overlay` | div | no | Title/main menu |
| `#hud-arrange-bar` | JS (`js/ui/hud-arrange.js`) | yes | HUD move-and-size bar |
| `#rotate-device` | div | no | Portrait-orientation race blocker |
| `#loading` | div | yes | Pre-race plate (`js/ui/loading-screen.js`) |
| `#pausemenu` | dialog | yes | Pause dialog |
| `#pmsettings` | dialog | yes | Pause/title Settings sheet |
| `#bench` | dialog | yes | BENCHMARK sheet |
| `#select` | div | yes | Circuit and mode selection |
| `#season-setup` | dialog | yes | Season calendar and format setup |
| `#career` | div | yes | Career page and season hub |
| `#career-offers` | dialog | yes | End-of-season offers |
| `#career-history` | dialog | yes | Career history |
| `#career-guide` | dialog | yes | Career guide |
| `#teampicker` | dialog | yes | Team selection |
| `#vsfriend` | dialog | yes | Multiplayer lobby |
| `#race-settings` | dialog | yes | Pre-race settings |
| `#duel-picker` | dialog | yes | Duel rival picker (opened from `#rs-duel-open`) |
| `#quali` | dialog | yes | Qualifying |
| `#standings` | dialog | yes | Championship standings |
| `#results` | dialog | yes | Race results |
| `#customize` | dialog | yes | My Team customisation |
| `#carsetup` | div | yes | Garage with live car preview |
| `#howtoplay` | dialog | yes | Help/tutorial |
| `#spotifypanel` | dialog | yes | Spotify playback |
| `#track-detail` | dialog | yes | Fullscreen circuit detail |
| `#lighting` | div | yes | Lighting tuner |
| `#camtune` | div | yes | Camera tuner |
| `#flyby` | div | yes | Flyby shot editor |
| `#freecam` | div | yes | Free camera panel |
| `#garrival` | div | yes | Garage enter & leave tuner (and its PREVIEW) |
| `#tl-editor` | div | yes | Title layout editor bar (title screen) |
| `#photo-controls` | div | yes | Free-camera controls |
| `#photo-studio` | div | yes | Photo Studio |
| `#datahub` | dialog | yes | Data and telemetry hub |
| `#trackdesigner` | dialog | yes | Track designer (custom circuits) |

`#overlay` is non-gating because no car is being driven while the title is
open. `#rotate-device` is non-gating so Escape and driving keys still reach the
race beneath its opaque, media-query-controlled blocker (the comment on its
`DEFS` entry has the full reasoning).

### Major shell and race IDs

| ID | Kind | Purpose |
|---|---|---|
| `#__err_overlay` | runtime overlay | Inline uncaught-error display |
| `#game` | canvas | 3D driving surface, not a menu layer |
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
| `#overlay` | `#menu-brand`, `#menu-buttons` and its rows (`#menu-hero` and the `DESTINATION_GROUPS` rows); the `#mb-*` doors listed under [Title](#title-overlay); `#soundbtn` |
| `#pmsettings` | `#pmsettings-inner`, `#dlg-settings`, `#pm-settings-body`, `#pm-settings-index` |
| Settings pages | the panel roots in the [Settings](#settings-pmsettings) tables (`SettingsNav` `routes`) |
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

The full sheet list and cascade order is `CSS` in `tools/manifest.cjs`; the
main owners:

| Entry point | UI responsibility |
|---|---|
| `css/tokens.css` | Tokens, fonts, base canvas/body rules and cascade layer order |
| `css/components.css` | Shared `.screen`, `.sheet` and `.pane` primitives |
| `css/menus.css` | Title menu and its destination rows |
| `css/title.css` | Title-screen identity and art |
| `css/select.css` | Circuit picker (`#select`) |
| `css/settings.css` | Settings door index and pages |
| `css/tuner.css` | Lighting tuner and shared advanced/tuning controls |
| `css/carsetup.css` | Garage, tabs, options, livery and creator UI |
| `css/hud.css` | HUD, start lights and photo controls |
| `css/touch-controls.css` | Touch controls |
| `css/overlays.css` | Results, How to Play and the portrait blocker |
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
