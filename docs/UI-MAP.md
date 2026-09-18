# UI map — navigation and DOM

This is the lookup map for Apex 26's menu web: where a title-screen action
leads, which overlays can appear along the way, and which stable DOM roots an
agent can inspect.

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
├─ GARAGE ────────> #carsetup / #customize
├─ SETTINGS ──────> #pmsettings
└─ HOW TO PLAY ───> #howtoplay

race
├─ HUD / #pausebtn ──> #pausemenu ──> #pmsettings?
├─ race flow ────────> #quali | #standings | #results
└─ tools ────────────> #lighting | #camtune | #flyby | #photo-controls
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

The title also carries the sound toggle, Apex 26 branding, grid/circuit summary
and unofficial disclaimer.

#### Settings (`#pmsettings`)

Settings opens at an index, then pushes one page at a time:

| Door | Trigger | Panel root | Page title |
|---|---|---|---|
| Controls | `#pm-open-controls` | `#pm-panel-controls` | CONTROLS |
| Driving | `#pm-open-driving` | `#pm-panel-driving` | DRIVING |
| Display | `#pm-open-display` | `#pm-panel-display` | DISPLAY |
| Steering & Assists | `#pm-advanced` | `#advanced` | STEERING & ASSISTS |
| Music & Sound | `#pm-audio` | `#audioset` | MUSIC & SOUND |

Back pops to the Settings index; Back from the index returns to the title.
Escape closes the sheet. Values below are the observed live state, not a
defaults contract.

**Controls.** Throttle `HOLD`; Left-handed `OFF`; Gears `AUTO`; Active Aero
`MANUAL`. Other actions are Reset Keys, Button Names `AUTO`, Calibrate Stick,
Set Up a Wheel and Reset Controller.

| Device | Bindings shown |
|---|---|
| Keyboard | `←/A` and `→/D` steer; `↑/W` gas; `↓/S` brake; `SPACE` boost; `X` overtake; `Z` active aero; `E` upshift; `Q/SHIFT` downshift; `C` camera; `B` look back; `R` recover; `P` pause |
| Controller | `RT/A` gas; `LT/B` brake; `X` boost; `Y` overtake; D-pad Up active aero; `RB/LB` shift; View camera; right stick look back; left stick recover; Menu pause |

**Driving.** Driving Coach `ON`. Doors lead to Practice a Section, Pit Strategy
(Next Tyres `AUTO`) and an empty Session Review.

**Display.**

- UI Size `100%`; HUD `ON`; Style `STANDARD`; Layout `FULL`; Map `ON`;
  Gaps `ON`; Line Colour `F1`; Line Opacity `NORMAL`; Brake Cue `OFF`.
- HUD and touch size/opacity `100%`; Metrics Overlay `OFF`; Page `GOV`;
  Side `AUTO`; Size `S`.
- Renderer `THREE.JS`; Resolution `AUTO`; Fullscreen `OFF`; Upscale `OFF`;
  Occlusion `OFF`; Debris `ON`; Graphics `HIGH`.
- Cockpit Halo `ON`; Turn Chasing `40%`.
- `#pm-display-adv` holds Advanced Visuals. Lighting Tuner, Camera Tuner and
  Flyby Shot Editor are disabled outside a race and open separate docks.

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

Session filters include P1, P2, P3, Qualifying and Race. Close returns to the
title.

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

1. Choose `ALL`, `SEASON` or `CLASSICS`, optionally search, then select a
   circuit.
2. Read the circuit card: layout, location, length, turns, direction,
   elevation, DRS, slowest corner and night tag.
3. Optionally open `#track-detail` for the map, elevation graph, DRS and turn
   classes; close returns to the picker.
4. `BACK` returns to title, `YOUR CAR` opens Garage, and `NEXT` opens Race
   Settings.
5. Configure laps, weather, conditions, time of day, difficulty, grid,
   cautions, Duel, driving line, tyre wear, strategy and reliability.
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
| Restart Race | `#pm-restart` | Restart the current race |
| Settings… | `#pm-settings` | Open the same Settings index used from title |
| How to Play… | `#pm-howto` | Open the help sheet |
| Standings | `#pm-standings` | Open championship standings; hidden outside a championship |
| Quit to Menu | `#pm-quit` | Leave the race for the title |

The pause card also has Previous, Pause and Next track controls in its music
strip. Pause Settings exposes the same Controls, Driving, Display, Steering &
Assists and Music & Sound doors documented above.

Other in-race roots are:

- `#lighting`, `#camtune` and `#flyby` — visual tuner docks.
- `#photo-controls` — free-camera overlay.
- `#quali`, `#standings` and `#results` — session flow.
- `#rotate-device` — portrait race blocker.

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

`UiLayers.DEFS` is the canonical list of 26 screen-sized roots. A layer gates
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
| `#photo-controls` | yes | Free-camera controls |
| `#datahub` | yes | Data and telemetry hub |

`#overlay` is non-gating because no car is being driven while the title is
open. `#rotate-device` is non-gating so Escape and driving keys still reach the
race beneath its opaque, media-query-controlled blocker.

Most roots are real `<dialog>` elements and begin hidden. The non-dialog
screen/region roots are `#lighting`, `#camtune`, `#flyby`, `#photo-controls`,
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
| `#overlay` | `#menu-brand`, `#menu-buttons`, `#menu-hero`, `#menu-primary`, `#menu-secondary`; title actions `#mb-career`, `#mb-race`, `#mb-tt`, `#mb-vs`, `#mb-season`, `#mb-data`, `#mb-garage`, `#mb-settings`, `#mb-help` |
| `#pmsettings` | `#pmsettings-inner`, `#dlg-settings`, `#pm-settings-body`, `#pm-settings-index` |
| Settings pages | `#pm-panel-controls`, `#pm-panel-driving`, `#pm-panel-display`, `#pm-display-adv`, `#advanced`, `#audioset` |
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
| `#datahub` | Runtime-built inner UI; `#dh-close-btn` is the boot-time Escape target |

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
