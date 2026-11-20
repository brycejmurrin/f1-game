# Screen arrangement coverage

Kind: design
Deployment baseline `f8970a989e91055231703865d6f5596f6d44be74`. This inventory follows the doors in `index.html`, the input gates in `js/ui/layers.js`, and the modules that populate dialogs at runtime. The regions in the first table identify what the player encounters. The editor bindings below identify which parts can be adjusted independently. Both tables describe source inspection. Rendered checks belong in the PR evidence.

## Screens and routes

Screen IDs refer to the main document unless a filename is given. Settings keys omit the `apex26.` prefix. Standard menus use pointer, touch and keyboard with gamepad menu navigation where active. The native dialogs also participate in the browser focus stack. Dedicated input surfaces are called out separately.

| Screen and normal entry | DOM or module owner | Player regions and existing layout controls | Baseline placement owner |
| --- | --- | --- | --- |
| Title, first launch or Quit | `overlay`, title-flow, title-layout | Artwork, title and actions. Drag or nudge, scale, action group width and grid/stack/row, side swap, orientation copy | titleLayout |
| Title layout toolbar, Appearance → title | `tl-editor`, title-layout | Selected part, orientation, save/reset tools | titleLayout |
| Driver Career / My Team, Title → Career | `career`, career-ui and career-planning-ui | Dashboard, calendar, championship and dynamic management decisions. Split ratio, stacked columns, side | lookCareer |
| Career offers, guide, history, Career → corresponding action | `career-offers`, `career-guide`, `career-history`, career-ui | Contract list/actions, guidance and career records each have a separate root | Popup styling where targeted |
| Season, Title → Season | `season-setup`, season-ui | Championship setup, calendar and start actions | Popup styling where targeted |
| Track selector and track detail, Title → Race / Time Trial → circuit details | `select`, `track-detail`, select-screen and track-maps | Track strip, map, detail and actions. Selector tile size, strip position, row count and visibility | lookSelect; detail has its own dialog |
| Race setup, pre-race options | `race-settings`, index.html | Presets, configuration grid and start. Column count and density | lookRace |
| Friend lobby, Title → Race a Friend | `vsfriend`, js/net | Host/join, pairing instructions, player slots, race options | Popup styling where targeted |
| Team and rival pickers, race/career flow | `teampicker`, `duel-picker` | Team/rival options, selection and continuation | Popup styling where targeted |
| Garage, Title → Garage or pre-race setup | `carsetup`, garage/setup-sheet and setup-camera | 3D car and docked configuration panel. Side, separate panel width/height, stats visibility | lookGarage |
| Livery editor, Garage → appearance | `customize`, garage/livery-design-editor | Swatches, livery details, live car, actions | Garage/livery settings |
| Data Hub, Title → Data | `datahub`, data/hub | Tabs, current tab content, filters and dismissal. Schedule, standings, results, live, telemetry and Watch & Drive render different children. Tab style, row height, width, stripes | lookDatahub |
| Telemetry player, Data Hub → Telemetry → session | data/telemetry, telemetry-view, telemetry-player | Nested native modal with playback, traces, map and controls | Separate modal over Data Hub |
| Race HUD and HUD arrangement, race → Settings → HUD & Camera | hud-layout, hud-arrange, `hud-arrange-bar` | HUD widgets with movement and scale by HUD profile and camera group. Mirror includes a rendered viewport. Drag and keyboard | hudLayout |
| On-screen driving controls, touch race → Controls | dock-layout | Pedals, steering controls, action buttons, docks. Touch setup follows steering scheme | dockLayout, hudBtnShape |
| WATCH, Title → Watch / Data Hub → Watch & Drive → event | watch-transport, data/real-race-tab | Replay transport, timing, picture-in-picture. Both DOM and rendered race content | Watch/HUD owners |
| Pause, in race → Pause | `pausemenu`, pause-opts | Race context, action stack, quick doors and music card. Width, gap, button height and vertical position | lookPause |
| Settings, Title or Pause → Settings | `pmsettings`, settings-tabs, settings-search, setting-row, setting-deps | Index, active pane and Back. Controls, driving, display, appearance, accessibility, graphics, visual studio, progress, files, credits. Practice, strategy and review enter via pause doors | Per-feature GameStore keys; sheet-shape computes adaptive geometry |
| Appearance, Settings → Appearance | appearance-studio, layout-presets, screen-looks | Theme presets, named profiles, scopes, undo, layout presets, eight screen-look groups and illustrative previews | Appearance Studio and LayoutPresets |
| Audio and help, Settings → Music & Sound / Title or Pause → How to Play | `spotifypanel`, `howtoplay` | Playback/source/list and instructions/Back | Popup styling where targeted |
| Qualifying, standings and results, race progression or standings action | `quali`, `standings`, `results`, quali-sheet and results-sheet | Timing/classification, summary, story, continuation | Popup styling where targeted |
| Share-card preview, results → share | share/share-card-chips, `share-card-preview` | Native modal with export ratio, preview and save/share | Share-card module |
| Photo Studio, Title → Photo Studio or Pause → Photo | `photo-studio`, `photo-controls`, photo-studio | Studio options, capture, preview, crop guides and backgrounds. Capture geometry depends on aspect choice | Photo Studio |
| Track Designer, Title → Track Designer | `trackdesigner`, editor/designer and workspace | Map canvas, editing tools, elevation profile, inspection. Existing map-width split and size options | lookDesigner |
| Creative tuners, Settings → Visual Studio → tool | `lighting`, `camtune`, `flyby`, `freecam`, `garrival` | Lighting and camera panels, flyby shot list, free-camera actions, garage arrival controls. Some wrappers have zero-sized boxes and visible fixed children | Individual tuner modules |
| Loading and rotate prompts, start race / rotate a phone | `loading`, `rotate-device`, loading-screen | Transient informational/guard screens | Automatic layout |
| Renderer recovery, unavailable graphics backend | perf/renderer-picker | Error explanation, recovery choice and dismissal | Renderer preferences |
| Phone controller, paired handset or controller.html | controller.html, input/phone-pad-page | Pair/QR, wheel, menu navigation, layout dialog, move/size mode. Five zone presets, pedal arrangement, drag/scale/reset | Phone-local padLayout |
| Streaming overlay, open overlay.html as a broadcast source | overlay.html, overlay/render and bridge | Timing tower, sectors, battle and caption. Side selection and responsive stacking | Standalone overlay configuration |

The generic Popups setting applies a shared visual treatment. Each nested dialog still needs an explicit region binding to support independent arrangement. Data Hub filters and Career planning views replace descendants while the host stays open.

## Developer and diagnostic surfaces

The in-game `bench` dialog and standalone `bench.html` measure frame costs. `cockpit-view.html` is a standalone preview. The Data Hub GPS Trace Export tab declares `developer: true`. Bridge dialogs in js/agent and the tools/ HTML workbenches are diagnostic surfaces.

## Editor bindings and gaps

The shared editor reads `ScreenRegions` from js/ui/screen-regions.js. Each row below uses the on-screen button, pointer drag, direction buttons or keyboard. Fine/coarse adjustment, separate dimensions, scale and orientation drafts come from js/ui/screen-arranger.js. Apply stores sparse overrides under `screenPlacement` v1 by screen and orientation. A region must exist and have layout boxes when editing starts to appear in the selector. A binding alone does not establish that a control is reachable in every tab, scroll position or viewport.

| Host | Independently bound regions | Remaining coverage to check |
| --- | --- | --- |
| Settings | Navigation, settings content, footer | Search results, different open sections, large text and scrolling |
| Career | Navigation column, calendar column, actions | Returning from offers or planning; responsive stacking |
| Garage | Setup panel, car-view controls | Scene backdrop/car projection uses its existing owner; compare actual car visibility at changed panel widths |
| Selector / detail | Circuit list, preview, actions / heading, map, details | Canvas content, mobile strip and track switch |
| Pause | Summary, quick tools, music | Music requires active media |
| Season / race settings | Calendar, circuit pool, actions / heading, content, actions | Populated versus empty states |
| Results | Winner, classification, actions | Continue with a full classification and large text |
| Data Hub | Tabs, combined content and filters | Filters have no separate geometry; telemetry playback opens its own dialog |
| Telemetry detail / share-card preview | Session heading and traces / preview, size and actions | Verify real data and exported card after resizing |
| Designer | Drawing area, controls | Pointer-to-map coordinates and elevation edits after resizing |
| Photo Studio / camera controls | Studio panel, shot presets, actions / two movement sticks and camera controls | Crop preview and guides follow the export owner; compare export and preview |
| WATCH | Transport, timeline, chapters, timing and picture-in-picture | Verify the renderer follows the moved frame |
| Career offers, history, guide; team, friend and duel pickers; qualifying, standings and music | Heading, content and actions where present | Check each nested dialog, including a return to its invoking screen |
| Customize / How to Play | Content, color preview and actions / contents list, content and actions | Dynamic long text, nested scroll and focus order |
| Lighting, camera tuning, flyby, free camera and garage arrival | Heading, controls and actions where present | Zero-size host wrappers and runtime-built controls |
| Handset pairing / menu pad | Instructions, QR scanner, room code and connect / direction pad, status and actions | Paired-device transitions; wheel driving controls retain their own editor |
| Standalone broadcast | Tower, sectors, battle, caption | `overlay.html?arrange` exposes the entry; live events determine visible regions |
| Title, race HUD, phone wheel and touch docks | Existing dedicated editors retain their original regions, persistence and input conventions | Verify per-profile HUD, operating a control after leaving edit mode, and renderer-backed mirror |
| Loading, rotation blocker, graphics recovery and editor toolbars | Outside the shared screen registry | Continue using their built-in layouts. Appearance → Popups does not provide independent placement here |

## Using the shared controls

On the title, tap the toolbar’s region name to cycle through Buttons, Title and Car Drawing. Left/Right/Up/Down move the selection. **Fine** moves one percent per tap and **Coarse** moves five. Drag a piece to place it, or drag its corner to scale it. Keyboard arrows nudge, brackets cycle regions, and +/− adjust scale. Width reflows only the buttons. Undo reverses an edit. Reset screen restores the current orientation, including the shipped phone layout. Apply saves both orientations touched during the session. Cancel discards the session and returns focus to the opener.

Open the destination normally and choose **Arrange this screen**. Choose a visible region in the Region list or press it on the screen. Drag or use **Left**, **Right**, **Up** and **Down**. Choose **Fine** or **Coarse** to change the step. Width and Height change the region’s box; Scale changes its displayed size. **Move toolbar** exposes the area beneath the controls. **Undo** reverses a draft edit. **Reset region** clears the selected region’s overrides. **Reset screen** previews the shipped geometry for both orientations, including screen-specific legacy placement settings. Shared Popups preferences still apply. Choose **Apply** to keep the draft or **Cancel** to discard it. Other screens keep their settings.

### Design references

The four direction buttons support one-pointer operation without dragging. Keyboard support includes fine and coarse movement. [WCAG 2.5.7](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)

The editor uses a native modal, focuses its region picker, and returns focus to the invoking control on exit. Its scrollable controls use a 44 CSS pixel touch floor and reserve safe-area insets. [ARIA dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) · [WebKit safe areas](https://webkit.org/blog/7929/designing-websites-for-iphone-x/)

Selecting a HUD element on the live screen, making fine adjustments and explicitly saving follows interaction patterns from [Final Fantasy XIV](https://na.finalfantasyxiv.com/uiguide/know/know-hud/hud-layout.html) and [World of Warcraft](https://worldofwarcraft.blizzard.com/en-us/news/23837944).

### Rendered Career check

Chromium 154.0.8037.57, software rendering, build 1695 on the feature worktree, touch-capable browser context and mouse input. With reduced motion enabled, Right moved Career navigation from x=75.09 to 83.53 at 844×390. Width + increased it from 344.11 to 352.53 CSS pixels with 16px text. Rotating to 390×844 and back, applying, and reloading restored x=83.53 and width=352.53. The interaction then reset the screen. The baseline capture used the shipped landscape preset.

The local evidence bundle contains the baseline, edited landscape, portrait draft and the recorded browser output.

### Compatibility

Existing title, HUD, dock and per-screen layout owners continue to read their original keys. Additional regions use version 1 of `apex26.screenPlacement`, keyed by screen, orientation and region. Coordinates and dimensions are percentages of the layout viewport. Unset dimensions reflow with the shipped CSS. Named profiles and settings-file backups capture explicit overrides. Loading an older named profile preserves keys it never captured.

A second run on the integrated worktree changed title button size, dragged the Career navigation region with 15 mouse-move events, used Undo, then changed X and Width separately. The automated drag covered 35 horizontal pixels and 16 vertical pixels in 691 ms including input dispatch and rendering. Applying Endurance from Settings preserved both layouts. After reload, resetting Career retained Endurance and the saved title layout. This measurement uses Chromium software rendering and does not establish a handset frame rate.

In the 844×390 touch HUD preview, tapping Right saved the tower at X=1% for Standard / Helmet. Reload retained the setting. At 1280×800 with Drafting, large text and reduced motion, Garage panel width changed from 420 to 407.16 CSS pixels with unchanged 16px computed text. A 740×360 viewport with simulated asymmetric 42px/15px side insets kept the toolbar within the safe area. Cancel returned focus to Garage’s Arrange button.

On the Monza live race path, a 60-frame sample found the shared region editor unloaded and its modal closed. Software rendering under concurrent Node tests yielded a 12.67 s median and 20.23 s p95 frame interval. The subsequent attempt to tap Pause timed out waiting for a stable button. These measurements do not establish the performance of a player device.
