# UI map — navigation and DOM

This is the lookup map for Apex 26's menu web: where a title-screen action
leads, which overlays can appear along the way, and which stable DOM roots an
agent can inspect.

> **Source date:** 2026-09-18  
> **Live walk:** [brycejmurrin.github.io/f1-game/](https://brycejmurrin.github.io/f1-game/)  
> **Source cross-check:** `js/ui/layers.js`, `js/ui/settings-tabs.js` and
> `index.html` on `claude/f1-game-project-26h3ng`

The navigation half records what the live Pages build exposed on that date; it
is observation, not a promise that every action was exercised. Garage's deep
part/livery panels, the full How to Play contents, and the in-race pause chrome
remain **partial**. The DOM half is source-derived and deliberately inventories
major regions rather than every setting, button and generated row.

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

`?` means optional. The last three race branches are source-backed but were not
walked in the live pass.

### Title (`#overlay`)

The title exposes:

- `CAREER MODES` — Driver Career or My Team
- `RACE` — one Grand Prix
- `TIME TRIAL` — player against the clock
- `RACE A FRIEND` — private 2–4 player race
- `SEASON` — configurable championship
- `DATA HUB`, `GARAGE`, `SETTINGS`, and `HOW TO PLAY`
- sound toggle, Apex 26 branding, grid/circuit summary and unofficial disclaimer

#### Settings (`#pmsettings`)

Settings opens at an index, then pushes one page at a time:

| Door | Panel root | Page title |
|---|---|---|
| Controls | `#pm-panel-controls` | CONTROLS |
| Driving | `#pm-panel-driving` | DRIVING |
| Display | `#pm-panel-display` | DISPLAY |
| Steering & Assists | `#advanced` | STEERING & ASSISTS |
| Music & Sound | `#audioset` | MUSIC & SOUND |

Back pops to the Settings index; Escape closes the sheet. Lighting, camera and
flyby tuning are separate in-race docks, not Settings pages.

#### How to Play (`#howtoplay`) — partial

The title opens a help sheet with section navigation at `#htp-contents`; Back
returns to the title. The live pass confirmed the controls/help surface but did
not catalogue every slide or instruction.

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

### Garage (`#carsetup` / `#customize`) — partial

Garage is reachable from the title or any `YOUR CAR` action. The confirmed
surface includes camera, active aero, free build, setup works, livery,
team/driver selection, team editing, save/load, Back and Done. Its category
rail includes team, engine, aero, suspension, brakes, tyres, ERS, gearbox,
fuel, exhaust, floor, cockpit and wheels.

Repeated deep-panel exploration exhausted the browser tab, so part editors,
livery subpanels and save/load depth are not a complete navigation contract.

### In-race and end-of-session layers — partial

The live walk did not start a race. Source establishes the following roots:

- `#hud` and `#pausebtn`; pause opens `#pausemenu`.
- `#pmsettings` can be used as the pause/title Settings sheet.
- `#lighting`, `#camtune` and `#flyby` are tuner docks.
- `#photo-controls` is the free-camera overlay.
- `#quali`, `#standings` and `#results` cover session flow.
- `#rotate-device` blocks portrait race presentation.

The exact pause actions, nested pause chrome and all session-to-session edges
remain intentionally undocumented until a complete in-race walk replaces this
partial section.

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
| `#photo-controls` | overlay | Click-through free-camera controls |

### Title, Settings and help IDs

| Root | Important descendants |
|---|---|
| `#overlay` | `#menu-brand`, `#menu-buttons`, `#menu-hero`, `#menu-primary`, `#menu-secondary` |
| `#pmsettings` | `#pmsettings-inner`, `#dlg-settings`, `#pm-settings-body`, `#pm-settings-index` |
| Settings pages | `#pm-panel-controls`, `#pm-panel-driving`, `#pm-panel-display`, `#advanced`, `#audioset` |
| `#howtoplay` | `#howtoplay-inner`, `#htp-contents` |
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
| `#carsetup` | `#cs-inner`, `#cs-body`, `#cs-tabs`, `#cs-options` |
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
