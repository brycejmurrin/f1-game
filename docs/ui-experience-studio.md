# UI experience and studio acceptance contract

APEX's UI combines a team paddock home, clear race preparation, broadcast replay
controls and an appearance/photo studio. This document defines the agreed
experience and its acceptance checks. It is a product and engineering contract;
an unchecked criterion is not a claim that a feature has shipped or passed.
Current architecture and navigation remain documented in [UI-MAP.md](UI-MAP.md),
[ARCHITECTURE-MAP.md](ARCHITECTURE-MAP.md) and [ARCHITECTURE.md](ARCHITECTURE.md).

## Visual direction

The three concept references show a garage scene beside a readable home action
panel, an appearance workspace with preset/profile controls beside a large
preview, and a broadcast replay with persistent transport under the action.
Their composition and hierarchy are the target: car and team atmosphere, one
obvious next action, stable information surfaces and progressive detail. The
main home/garage background must render APEX's actual in-game 3D car and garage
assets. Generated concept photographs are not runtime backgrounds or fallback
assets. The existing static SVG can remain an optional static/recovery look;
personal photos are a separate optional background choice. Photorealism,
illustrative brand marks and exact concept button count are not promises.

Dark surfaces, a restrained accent, clear type and consistent spacing carry
across screens. Light theme and high contrast receive the same deliberate
treatment. Decorative scenes must never determine whether a user can read a
button, finish setup or leave a dialog. Phone layouts retain the same actions in
a single useful reading order rather than shrinking desktop columns.

Existing depth is the foundation: live 3D Garage and arrivals, tuners, title
layout controls, standard/minimal/broadcast HUD profiles, reduced motion,
per-screen appearance, career saves, telemetry, replay seek/director/PIP and
photo free camera. Improvements expose and connect these capabilities.

## Acceptance matrix

Each row describes observable behavior and the current source seam to preserve.
Use deterministic state/DOM checks for behavior and screenshots for visual
review. Rendered verification belongs to the root verification process; do not
run a second browser process to check these rows.

| ID | Area | Required behavior and useful checks | Existing source seam |
| --- | --- | --- | --- |
| A1 | Appearance presets | Preset cards show a selected state and a meaningful sample. A preset changes appearance settings coherently; driving, career and audio state are untouched. | `js/ui/appearance-opts.js`, `js/ui/screen-looks.js`, `css/tokens.css` |
| A2 | Named profiles | Save/load/delete profiles preserves valid appearance values across reload. Invalid or older stored fields safely fall back. A profile's name is treated as text. Built-in choices remain recoverable. | `js/core/store.js`, appearance modules |
| A3 | Scope | Global versus current-screen scope is visible. Changing one screen does not silently change another. Reset explicitly identifies and clears its scope; inherited versus overridden values remain understandable. | Screen looks and title/pause/selection options |
| A4 | Preview and undo | Home, Career, Race Setup, HUD and Popup examples use the effective theme, accent, scale, density and contrast. Preview/device changes do not mutate a career or start a race. Undo/Revert restores the stated snapshot; live autosave versus unapplied draft is clearly identified. | Appearance controls and existing live per-screen previews |
| A5 | Accent ink | Named, custom, pale and team accents produce readable text on filled buttons, selected cards and chips in both themes. Menu and HUD accents stay independent. Tyre/flag/sector colors retain their racing meaning. | `AppearanceOpts.pickInk` behavior, `css/tokens.css`, `js/ui/hud.js` |
| A6 | Motion | Effective OS/app reduced motion governs CSS and JavaScript arrivals, ambient camera/sky, part focus and result reveals. Motion Off is stable. Essential replay/racing continues; Skip remains available for cinematic sequences. | Appearance/motion preferences, view transitions, garage arrival, render loop |
| H1 | Home scene | Selected team/car is consistent with Garage. Home supports Garage, Night garage, Studio, Circuit and Pit lane, plus Mix environments. Auto camera varies Hero/Front/Side/Rear each Home visit; fixed angles persist in appearance profiles. These use actual in-game 3D assets through the existing renderer seam, not generated photography. The existing SVG/static look provides an optional legible recovery path. Menu actions remain usable before scene compilation completes. | `js/ui/title-menu.js`, `js/game.js`, `js/garage/scene.js` |
| H2 | Scene lifecycle | Leaving/reopening home, rotating or changing scenes avoids duplicate loops/resources and stale presentation. Photo keeps the chosen environment and angle through composition; a later Home visit advances Mix once. Hidden documents stop unnecessary visual work. Menu/studio preview never advances race physics or changes the next event. | Game render/tick separation, renderer readiness, visibility lifecycle |
| H3 | Home doors | Watch Real Races, Practice and Photo Studio are discoverable. Existing conditional Continue, multiplayer, season and controller doors remain reachable. Continue identifies the save/mode and next event. | Title action wiring and career summary |
| W1 | Transport | WATCH visibly exposes play/pause, speed, followed driver and camera/director state. Pointer, touch and keyboard operate the same underlying replay. Controls do not accidentally become driving inputs. | `js/race/real-replay.js`, `js/race/broadcast.js` |
| W2 | Timeline and events | Seek is bounded; current time/lap updates after seeking. Previous/next moment and event markers derive from available race events. Empty/no-events/end states remain useful and do not invent incidents. | Real replay seek/skip and race-book events |
| W3 | Follow ownership | AUTO, temporary manual selection and FOLLOW LOCK are understandable. Lock prevents automatic retargeting; returning to AUTO restores existing director behavior. Driver/camera/timing tower selections agree. | Existing director manual override and selected-driver state |
| W4 | Race invitation and data | Watch/Drive routes clearly distinguish selected driver, distance and trace availability. Large position downloads retain focus, scroll and expanded rows. Progress/failure/retry is visible; cached/stale/historical context remains explicit. | `js/data/real-race-tab.js`, `js/data/hub.js` |
| W5 | Telemetry guidance | Comparison shortcuts configure existing channels and lane roles. Reference/compare roles are explicit; existing full traces, speed markers and cross-session behavior remain available. No unavailable metric is fabricated. | `js/data/telemetry.js` |
| G1 | Part focus | Selecting a category/part frames and identifies its relevant physical region. Reduced motion uses an immediate or static equivalent. Manual camera controls and reset still work; no permanent debug highlight remains. | `js/garage/setup-sheet.js`, setup camera and car mesh |
| G2 | Fit feedback | Fitted/owned/research states and before/after stats/cost stay truthful. Focus/highlight cannot purchase or fit a part on its own. Contextual Done clearly names Race Setup or the actual destination. | Part economy and Garage opener/Done flow |
| G3 | Facility atmosphere | Visible facility/achievement dressing reflects the active career and valid facility state. Loading a different save removes stale dressing. Free-build and unavailable facility states degrade cleanly. | Career facilities, Garage scene |
| C1 | Career brief | Next event, funds, objectives and pending signing/offers are visible before dense management. The primary action follows career state; recovered/conflicted/unsaved saves remain correctly communicated. | `js/career/career-ui.js`, `docs/CAREER.md` |
| C2 | Career sections | Calendar, car/development, team and season record reduce scrolling without hiding wages, sponsor, regulations, slots or backup controls. Navigation/focus order follows the displayed sections on desktop and phone. | Existing Season Hub and native dialog root |
| C3 | Season story | Timeline/milestones derive from existing rounds, results, contracts and regulations. Unplayed rounds are visually distinct from completed ones; empty/new seasons remain clear. Selection opens appropriate existing detail. | Career history/calendar/season state |
| C4 | Result explanation | Personal result, gains, penalties, stints, awards and championship/career settlement are grouped clearly. Reveal motion happens once and respects reduced motion. Required settlement/next action remains reachable and existing results Escape restrictions remain intact. | `js/ui/results-sheet.js` |
| P1 | Pause brief | Circuit, lap, position and current race status reflect the paused session. Resume remains dominant. Strategy, Practice and Debrief doors open the intended existing controls directly and return predictably. | Pause markup, Driving settings, coach/pit/journal |
| P2 | Context and Back | Pre-race mode/circuit/car context survives nested dialogs. Back/Close describes or reaches the actual origin, including title versus pause, Garage versus picker and nested Data Hub comparisons. | `js/ui/modal.js`, `js/ui/settings-tabs.js`, opener callbacks |
| P3 | Dialog/save grammar | Native modal focus/inert behavior remains. Closing returns focus to the originating control where possible. Autosaved preferences, draft setups and explicit livery saves are labeled consistently; destructive inline confirmation states have clear consequences and disarm behavior. | Modal wrapper, save/import/delete and livery/season flows |
| F1 | Photo composition | Existing free camera gains useful aspect/frame/grid choices and a clear creation entry. Framing guides are UI-only; exported crop matches the selected aspect. Exit restores prior pause/replay/HUD state and camera ownership. | `js/camera/photo-cam.js`, `js/camera/free-cam.js` |
| F2 | Image export | Capture uses the current presented backend frame; export produces a nonblank image with the intended scene/crop and no composition controls. Busy/failure/success feedback is honest. Export does not globally change renderer retention or graphics quality. | `js/render/gfx.js`, software present seam, capture integration |
| F3 | Photo background | Set as Background stores a bounded image and a durable reference, survives reload when storage succeeds, and falls back safely if missing/evicted. Reset/remove releases image resources and does not clear unrelated settings or saves. | Appearance scene choice, `js/core/store.js`, local image storage |
| X1 | Responsive/input | Essential actions are reachable at phone widths, landscape, desktop and large text/UI scale. No two-direction scrolling is required for settings. Touch/pad/keyboard focus and safe areas remain supported. | Existing layout tooling, SettingsNav and menu input |
| X2 | Recovery | Renderer/storage/API failures offer useful task-specific feedback and recovery while preserving context. Existing session-only and stale-data behavior remains truthful. Contributor Export remains accessible with a clear purpose. | Renderer picker, GameStore, Data Hub error handling |

## Browser API contracts and integration risks

### Capture the presented image

`HTMLCanvasElement.toBlob()` defaults to PNG, can call its callback with `null`,
and can throw `SecurityError` if the canvas is not origin-clean. Treat all three
outcomes explicitly. A `download` attribute is a request to download and a
suggested name; it is not evidence that the browser wrote a file.

WebGL's drawing buffer may be cleared after compositing. Capture immediately
after drawing or enqueue capture in the existing render loop. Globally enabling
`preserveDrawingBuffer` prevents possible optimizations and is not required for
a properly timed capture. Calling a draw helper for capture must not step
physics, advance a replay or alter camera state.

APEX also has asynchronous/software presentation. Select the actually presented
surface and respect backend readiness, including `awaitSoftPresent()` and
`#game-soft` where applicable. A nonzero main-canvas size alone is not proof of
a fresh rendered frame. Backend boot/capture evidence remains subject to the
renderer rules; a software capture does not establish real-device performance.

### Bound image lifetime and storage

IndexedDB accepts image `Blob`s directly and is suitable for image payloads;
small appearance metadata remains in the existing `apex26.*` preference store.
Do not persist an object URL as a permanent reference. A transaction's `complete`
event establishes successful commit; a request's `onsuccess` does not by itself
establish transaction completion. Handle open/blocked/error/abort/quota outcomes
and only report durable storage after the transaction commits.

Browser storage is best effort by default and may be cleared or evicted. A missing
stored image needs a deliberate default background. Avoid replacing a valid
background reference before the new image is available. If image import is
asynchronous, ignore obsolete completions after the user resets or selects
another image.

`createImageBitmap()` supports decoding and resizing, including orientation
options. Close decoded bitmaps after use. Object URLs retain their backing
objects until released; revoke them after removal/replacement or when export
consumption is safely finished, rather than before a preview or download can
use them. Bound imported image dimensions and output size to avoid turning a
single background choice into unbounded CPU/memory work.

### Motion and performance

`prefers-reduced-motion` reports an operating-system preference for reducing
nonessential motion. Apply the effective preference to JavaScript scene/camera
animation as well as CSS. Background-motion controls and cinematic Skip are
separate useful controls. WCAG 2.3.3 is **AAA** and concerns interaction-triggered
animation; automatically initiated moving content is addressed separately by
2.2.2. This contract does not claim whole-product WCAG conformance.

Use `transform` and `opacity` for short UI transitions where appropriate, and
measure repaint/layout work before animating other properties. Stop unnecessary
ambient updates when `document.visibilityState` is `hidden`. Preserve the
existing renderer governor and fallback behavior; proposed home imagery is not
a reason to invent frame-rate or device-performance claims.

## Research provenance

The source facts below informed the design and API contracts. The acceptance
matrix is an APEX proposal, not a claim that these references implement APEX.
Public sources were read on 2026-10-01.

| Source | Verified fact used |
| --- | --- |
| [GT7 Garage manual](https://www.gran-turismo.com/us/gt7/manual/home/01) | Garage includes movies of the current car alongside settings/collection. |
| [GT7 Scapes manual](https://www.gran-turismo.com/gb/gt7/manual/scapes/01) | Curated locations, favorites, random picks and time/weather filters. |
| [GT7 settings sheets](https://www.gran-turismo.com/us/gt7/manual/carsettings/02) | Named, duplicated and applied saved settings sheets. |
| [Forza visual accessibility](https://support.forza.net/hc/en-us/articles/46524064744851-Forza-Motorsport-Accessibility-Support) | Independent menu/HUD scale/contrast, UI/world colors and moving-background control. |
| [F1 Manager broadcast presentation](https://news.xbox.com/en-us/2023/07/27/f1-manager-23-launches-july-31/) | Timing tower, incident replay and immersive broadcast cameras. |
| [Xbox UI navigation guidance](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/112) | Consistent control placement, logical focus and digital-input navigation. |
| [Xbox motion guidance](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/117) | Pause/disable background motion and optional opaque surfaces behind text. |
| [Canvas toBlob](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob) | PNG fallback, null callback, origin-clean requirement. |
| [WebGL screenshot timing](https://webglfundamentals.org/webgl/lessons/webgl-tips.html) | Capture after draw or inside render loop; retained buffers prevent optimizations. |
| [Canvas context attributes](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext) | Context acquisition and `preserveDrawingBuffer` meaning. |
| [Anchor download](https://developer.mozilla.org/en-US/docs/Web/API/HTMLAnchorElement/download) | Download intent/name does not establish actual download completion. |
| [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) and [transaction completion](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/complete_event) | Blob storage and successful commit semantics. |
| [Storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) | Best-effort storage, quota errors, private browsing and eviction. |
| [ImageBitmap decoding](https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap) and [close](https://developer.mozilla.org/en-US/docs/Web/API/ImageBitmap/close) | Resize/orientation options and decoded resource disposal. |
| [Blob URL lifetime](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Schemes/blob) | Backing-object retention, explicit revocation and premature-revocation pitfalls. |
| [Reduced motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) and [WCAG 2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) | OS preference and exact scope of interaction-animation guidance. |
| [Animation performance](https://web.dev/articles/animations-guide) and [visibility lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilitychange_event) | Compositing-friendly properties and stopping hidden-page tasks. |

## Validation record

The focused unit suites check visual-only profile scope and persistence,
contrast ink, effective reduced motion, camera ownership/restoration, replay
seek and follow lock, asynchronous photo capture/storage, career-derived
calendar/facility data and practice-versus-race result scoring. Home framing
projects the real car silhouette at desktop, landscape phone and portrait phone
sizes. The front Home camera stays inside the doorway; circuit and pit-lane
subjects use the free menu pane. Native Garage camera presets keep their own
framing and controls.

Rendered browser checks cover changing/fixed Home angles, mixed environments,
actual garage preview capture, circuit/pit-lane backgrounds, PNG download,
Photo Mode return paths, readable Appearance presets and landscape phone
layouts. Browser evidence and verdicts belong in `artifacts/ui-experience/`
and `artifacts/logs/`; the six static menu identity snapshots deliberately hide
the renderer. Generated concepts are design references only.

The Appearance examples represent the selected theme and screen; the native
advanced controls provide exact layout previews. Circuit/pit-lane thumbnails
do not reuse a stale garage capture. Software-rendered screenshots establish
composition and capture behavior, not performance on a player's GPU. Live
OpenF1 download/retry behavior and full remote browser groups need separate
coverage; a visible Watch entry or a replay fixture does not establish a live
API result. The acceptance matrix above remains a checklist, not a blanket
claim that every criterion has passed.
