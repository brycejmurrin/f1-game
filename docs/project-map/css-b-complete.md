# CSS B — complete source map

Scope: sorted `css/*.css` positions 18–34, all 17 files. Read on 2026-10-27. This is source inspection, not a browser/computed-style verdict. No CSS or JS was changed. Parent lane owns verification.

## Full-read ledger

SHA-256 identifies the exact bytes inspected. Ranges are inclusive, contiguous, and cover every line; initially truncated combined reads were replaced by bounded reads of the affected ranges. Alphabetical assignment order is not cascade order.

| Position | File | Lines read | SHA-256 |
|---|---|---|---|
| 18 | `css/menu-destinations.css` | 1–204 | `704643f763aaf5fb7c28ccd5f4adba157ccd9ee9740c3e2380304191ef025c73` |
| 19 | `css/menus.css` | 1–300, 301–600, 601–877 | `a951584a190be9e59323eb0f677692bec86a75177f692a862270967e97dfc117` |
| 20 | `css/overlays.css` | 1–300, 301–600, 601–900, 901–1200, 1201–1469 | `9b84e3b6694cd8d7798cdd42353791f1dd80e74659dfd09470084bc37f34e101` |
| 21 | `css/photo-studio.css` | 1–128 | `629360b3692a594629bb4711be47385bd20983319b08c314f06b267777549f34` |
| 22 | `css/player-tools.css` | 1–18 | `173da10b8a310a1b80f9a55efa7fac934178fe74c8052c6be0cc32e269a43412` |
| 23 | `css/race-setup.css` | 1–350, 351–700, 701–706 | `57666de08cc805e268a7df72e2086c242b19a127db6cd9e5efc4ecf3a70ab061` |
| 24 | `css/responsive.css` | 1–326 | `ad18c02c6d0d619aa2045efae0fb631597af34af1a2fc4570a5de648af4feb01` |
| 25 | `css/save-health.css` | 1–10 | `9839f10874ad0cb2061adad224753b192eab6641fe83a2c46db972a970f31be7` |
| 26 | `css/select.css` | 1–300, 301–600, 601–889 | `ca90ecb457815ab61688c223965cfe17f9e3e558c660a73dc301208eaddf9a8f` |
| 27 | `css/settings-controls.css` | 1–300, 301–600, 601–749 | `3be50ee11d44a2ba8e5783c52eaf0265da641df430769f8bd35e40621d964e4b` |
| 28 | `css/settings.css` | 1–350, 351–409 | `da52e2a70175ab93644502a1c10c0c68a28f3cd3fd3b7873a83f2110f5d273e5` |
| 29 | `css/title.css` | 1–350, 351–372 | `91f4e53ca14b06075c998270706cfa72fe34c917b1b897380bb68cace15313cf` |
| 30 | `css/tokens.css` | 1–350, 351–700, 701–1050, 1051–1361 | `baba959f43def9a6140099f4554f763dcf5566df1182bb9a8afd12dbceba007a` |
| 31 | `css/touch-controls.css` | 1–350, 351–700, 701–914 | `96a3af411fc54426627a36bcce1e565513ab23dbc7a66a655fa43a69514bf188` |
| 32 | `css/track-detail.css` | 1–232 | `b39afb0b28ca00df1989f02382adc867a072cbeef440038d47ef204088387c90` |
| 33 | `css/tuner.css` | 1–350, 351–700, 701–1050, 1051–1400, 1401–1509 | `50f6c5c0d39e3acb7a7bd95ac02b72dbfc729de7904cd3c1025f29fb668e82ac` |
| 34 | `css/watch-transport.css` | 1–100 | `345bd16fff70982c7efe1955fa74c71cbf46fe804ab298dfcdbe464f31f7600a` |

The ledger partitions denote coverage, not an assertion that each terminal invocation used exactly those boundaries. `touch-controls.css` was read as 1–320, 321–640, 641–914; `tuner.css` as 1–350, 351–700, 701–1050, 1051–1509; `title.css` and `track-detail.css` in one bounded read. All other complete short files were read together with explicit output caps.

## Load and cascade contracts

`tools/manifest.cjs:486–522` is the authoritative CSS order and blocking/deferred roster. `tokens.css:13` declares `reset < base < components < hud < overlays`. Later named layers win normal declarations before specificity; important declarations reverse layer priority. No `responsive` layer appears in that initial list: `menu-destinations.css` introduces it later, so its normal declarations outrank all five earlier layers. Within one layer, specificity then source order decides.

Blocking title styles include tokens, components, title, menus, responsive, menu-destinations. Settings, select, race setup, tuners, HUD, overlays and photo/watch styles belong to the deferred print-to-all set. `[hidden] { display:none !important }` in responsive is the general hard stop; appearance PEEK deliberately uses stronger important declarations to reveal selected hidden shells. Closed modal guards must survive winning-layer layout rules. A numeric z-index cannot outrank a native modal top layer.

Sizing contracts: hardware safe-area padding belongs to unzoomed hosts; menu zoom belongs to children/sheets. `--vwz/--vhz/--svhz` compensate viewport units in menu zoom. `--hud-z`, fit caps and control scale form distinct driving axes. Tap tokens are typed `@property` lengths; `--compact-at` and `--tall-at` do not inherit. `--sf-h/--sf-y` do inherit so the pseudo thumb receives measured geometry. A bounded scroller needs a definite remaining track, `min-height:0`, contained vertical pan and an explicit horizontal overflow policy.

Shared state writers were checked with attached apex-lsp outlines: SheetShape (`js/ui/sheet-shape.js:36`, observe 319, reclassify 468); SettingRow (build 192, wire 152, paint 83); Menus (`js/ui/select-screen.js:12`, create 15); RaceSettings (create 153); TitleMenu (organize 17, repairDestinations 59); TitleFx (applyMotion 117); ScreenLooks (apply 304, peek 370); PhotoStudio; WatchTransport (create 10); SaveHealth (mount 73); EditorWorkspace; DockLayout; PlatformSession; SettingsSearch; UiExperience. DOM/string evidence below uses literal selector/state searches; these are appropriate text queries, not JS symbol-resolution substitutes.

## Selector and controller map, by entire file

### menu-destinations.css — 1–204

The `responsive` layer owns destination restructuring, label suppression, compact-wide placements, dense tall/desktop grid, conditional chip clearance, explicit width/side/row preferences, and the 12rem/20rem title-menu container adjustments. Its selector families are `#menu-buttons > .menu-destination`, `.menu-destination-label`, `.mb-sub`, `.btn-ico`, every `#menu-{hero,retention,primary,garage,explore,create,secondary}`, title-brand/meta/art controls, `.dh-developer-tools`, `.sf-scroll`, root `data-title-*`, and body shape/density.

These are real dynamic DOM, not missing shell IDs: `js/ui/title-menu.js:6–54` moves the existing buttons into destination groups and creates `menu-garage`, `menu-create`, group headings and two shortcut buttons. Play contains Race/TT/Friend/Season/Practice; Garage occupies the sixth compact cell; Watch/Data share Explore; Photo/Designer/Visual Studio share Create; utilities include settings/saves/help. `repairDestinations` remounts orphaned nodes without replacing handlers. `js/data/hub.js:190` creates the developer details. `index.html:2274` is the original shell topology and is deliberately different from the organized topology. Editing compact primary/garage placement must preserve pointer separation; the narrow container rule intentionally leaves primary's composition intact.

### menus.css — 1–877

Components-layer title door identity and geometry: base group widths/balanced rows, `.mb-sub`, `.minibtn`, career hero, leading-edge plates and opacity hover pseudos; brand/meta/sound/disclaimer/build tag; body `--compact-at/--wide-at`; live-home and scene subgrid; tall and wide compact arrangements; title-car frame/opacity; constrained-viewport geometry/text zoom split. All menu IDs are shell or TitleMenu-owned as above. `#soundbtn` and disclaimer are in the brand tree, not independent fixed controls. `#mb-career-sub` is refreshed by TitleMenu.create; continue/daily visibility and text are also owned there.

Body `data-shape/data-density` comes from SheetShape.classifyBody (`js/ui/sheet-shape.js:402–438`), using viewport dimensions divided by UI scale and a hysteretic aspect threshold. Live-home flags come from pre-paint shell and `js/ui/experience.js`. `.sf-scroll` comes from `js/ui/scroll-fade.js`. Compact media cap changes geometry zoom to `--ui-compact-scale`, preserves enlarged text via residual multiplier, and rederives local viewport/tap metrics. Safe centering plus child scrolling is essential: parent overflow cannot reliably recover a zoomed child outside its box. Later destination-layer rules can supersede component layout regardless of added ID specificity.

### overlays.css — 1–1469

The overlays-layer portion covers portrait rotate gate/actions, results-specific footer/table/playback layout, popup appearance controls, persistence warning, How to Play reading/contents layouts, graphics recovery, friend lobby and phone-controller pairing, install/update chips, deferred large-screen select/HUD adjustments, and shared screen-look/PEEK controls. The trailing components block owns `.pane-pair`, `.pair-side/.pair-main/.pair-foot-full`, shared `.res-*` classification rows, `.sel-label`, contents rails for HTP/career guide/history, and stint detail disclosure.

`#rotate-device` and actions exist at `index.html:643`; `js/game.js:4277–4305` measures it through `rotate-measure`, while 8767–8784 owns `rotate-ok` and the portrait-racing preference. Help/photo classes suppress the opaque blocker; pause native-open/hidden seams suppress it with important declarations. The coarse-pointer, width ≤743 and height ≤956 query is narrower than generic portrait orientation. `#nogl` is shell recovery DOM and explicitly restates hidden before flex styling.

`#results`, standings and HTP are shell dialogs. `js/ui/results-sheet.js:105` creates the ranking region and :174 stint strip; `js/ui/results-story.js:7` stamps `data-results-part`; `js/camera/results-cam.js:91–92` owns `data-results-playback=playing`. Classification consumers also include career and qualifying: changing `.res-row.you` or podium ordering affects all of them. Player ink/background comes after podium so it wins, with explicit metal position/border cues retained. Actual player sticky rule is top-only. Narrow results hide points only where a position sibling exists, preserving TT clock cells. Results settle is scoped to results and gated on OS motion.

`#save-warning` shell is at `index.html:783`; `js/ui/select-screen.js:26–66` toggles visibility/collapse and recovery text, and mounts SaveHealth at :143. Banner yields during racing/open dialogs because those controls would be inert. SaveHealth's panel is a separate components stylesheet below.

Friend lobby shells start at `index.html:2497`; `js/net/lobby.js` builds roster/remove/verification state (`vs-roster-remove` at :1222). `.vs-*` covers pick/exchange/wait/roster/room-code/scanner/status/QR flows, with compact head-close placement and sheet-shape two-step columns. Phonepad IDs are Settings shell and pairing UI. QR raster retains white machine-readable quiet zone and pixelated scaling. `#install-chip` is PlatformSession's install control; `#update-chip` is update-check UI. Their hidden/modal/race conditions matter more than nominal z-index 9000. Home-motion/install/iOS overlap formulas cross into touch-controls and experience.

ScreenLooks writes root `data-look-{screen}-{knob}` only off defaults (`js/ui/screen-looks.js:304`); `data-appearance-peek` temporarily reveals closed/hidden shells behind modal settings. Shared knobs include width, density thresholds, tap heights, radii, scrims/backdrops and heading alignment; popup positioning excludes track-detail. The actual pane-pair users are career, carsetup and season-setup, not the current selector. Pair-on hoists panes with `display:contents`; default unknown/off must remain a valid stacked scroller. Side action foot and optional full foot use `min-content` to avoid a spanning scroller inflating action chrome.

### photo-studio.css — 1–128

Overlays-layer `#photo-studio/#ps-*` owns transparent composition host, busy veil, bounded right sheet, local body scrolling, file input/stepper/select tap floors, lighting tabs/groups, shot library, preview and aspect/grid guide. Body photo-studio-open suppresses rotate gate, old freecam overlays and photo bar; photo-mode sticks/altitude are fitted into scene space beside the dock or above the ≤640px bottom sheet. A short wide screen narrows dock to 34vw.

`index.html:2163` supplies the empty host. `js/ui/photo-studio.js:141` builds guide/grid, :233–237 toggles active lighting groups/tabs, :365 builds sheet, :399–400 writes aria-busy, :412 writes aspect/grid, :483/:537 toggles studio body class. Thus `.active`, `aria-busy`, `data-aspect` and `data-grid` are actual controller contracts. Touch zoom uses its own available-width/height cap; sheet zoom and controller zoom must not be conflated.

### player-tools.css — 1–18

Components-layer `.settings-find*` styles injected Settings search; `.player-tool-panel/.player-tool-row/.player-tool-note` styles setup comparison and other player utility forms; `.race-message-list` styles message history; `.cs-liv-ed-inspect` is livery inspector action. `js/ui/settings-search.js:158–163` constructs search section/list. `js/garage/setup-trials.js:102/:125` creates comparison panels. Pause direct-child panels span full grid/body width. Inputs retain full-width shrink constraints, while row controls wrap and keep tap floors.

### race-setup.css — 1–706

Components-layer season setup (`#ss-*`), shared vertical circuit list (`.track-row*`, `.trb-*`, `.track-group-head`), race setup (`#race-settings/#rs-*`), duel picker (`.duel-option*`), customization (`#customize/#cz-*`, `.cz-*`), and trailing touch text floors. Season setup uses pane-pair at 620 local px, keeps wide compact pair, and restores one body scroller on unknown/off pair. Compact pair moves foot beside head; pool becomes two columns while calendar rows retain controls. Three-chip calendar rows use one chip-tall grid; four-chip sprint rows keep wrapping flex.

RaceSettings.create/buildRaceSettings (`js/race/race-settings.js:153/:178`) owns race shell rows/presets/help/draft; SettingRow supplies control parts. Race setup deliberately retains requested UI zoom, disables shared fit shrinking (`--fit-at:0`) and becomes one page scroller for tall/compact sheets. Row/fold grid becomes two columns at 640 local px unless explicit root race-cols overrides it. The duel button emulates a 7rem value column plus two chip regions using shrinking phantom space; this is coupled to race-specific select width. Narrow ≤360 query removes step buttons and exposes native select affordance.

Customization shell and `js/career/custom-team.js` own `.cz-off`, finish active state, logos, swatches and paint folds (examples :209–219). Wide sheets grid customization rows; paint wrapper, separator and preview span columns. RaceSetup's trailing text floors reach selector and title families too, and duplicate select.css's trailing floor list. These are deliberate cross-screen matches, not file-local ownership.

### responsive.css — 1–326

Overlays-layer viewport composition only plus global hidden, reduced motion/paused title, forced-colors/contrast fixes, `.pad-ring`, root title-layout transformations/width/layout/side settings, title PEEK and title editor. Large landscape and portrait branches guard noncompact body density. Coarse tablet landscape alone reframes art. TitleLayout (`js/ui/title-layout.js`) writes root title and editor attributes and mounts `#tl-*`; ScreenLooks writes peek; TitleFx writes motion and title-paused/intro state. PhonePad supplies pad-ring focus. Explicit layout uses individual translate/scale plus zoom to compose with animation transform.

The global important hidden stop is critical during deferred CSS. Reduced-motion in-game override covers rotate gate as well as menus; OS fallback is in tokens. Forced colors preserves button edges and hero border hierarchy. Title edit disables descendants' pointer events so drag selects the whole piece; resize handle/editor bar remain outside piece zoom.

### save-health.css — 1–10

Components-layer `.save-health`, `.save-health-panel`, `.save-health-history` covers the recovery disclosure/history added by SaveHealth.mount (`js/ui/save-health.js:73–121`). The controller creates panel hidden at :78; its explicit hidden restatement beats grid. Recovery actions wrap, full-width shrinking avoids long history payloads forcing overflow, and history select uses theme-relative surface. Root warning placement belongs to overlays, not this file.

### select.css — 1–889

Components-layer selector host/sheet/body/shelf/filter/search, horizontal flag tiles, season/read-only/tooltips/favorites, appearance tile/rows/name/strip settings, hero still/map/caption/stats/elevation/detail door, team picker `.team-*`/`.tm-*`, shared `.chip-row/.sel-chip/.sel-edit`, section headings and season calendar `.sur-*`, followed by touch floors. `index.html:2396` supplies current `.sheet` with no pane-pair. Menus.create (`js/ui/select-screen.js`) fills tiles, data-mode/done/fav/kind/tip/country cues and preview; openTrackDetail at :1326 owns the detail map, flags and corner class map.

Selector stack has one sideways strip and vertically bounded hero section; wide ≥620 local px uses still/stats columns; compact-wide overrides to lower-third layout; tall narrow hero is height capped against a size container. Compact hides repeated metadata rather than circuit identity. Canvas is zero-sized/invisible until controller writes data-drawn; visibility remains off for hero height ≤110 local px. Still/map button remains the detail door. Search stays 16px for iOS focus, gains its own row in tall shape. Team tile wraps complete driver pair while summary card ellipsizes; auto-fill floors use min(240px,100%) and max-content rows.

Shared `.sel-chip` means changes affect race/season setup and other screens. `.active` selected look uses plate/red border; motion adds chip press transition only under no-preference. Season list rows are readouts, their contained chips are controls. Literal names such as CLASSICS and round/tooltip attributes are data generated by Menus, not disconnected CSS.

### settings-controls.css — 1–749

Components-layer enumerated `.set-row` structure, race strategy `#rs-plan-*`, key/controller bindings, calibration and settings body/preset sizing, injected graphics status, `.pm-doors`, wide settings grids/display named areas, HUD checklist, metrics/disclosure/fold readout grammar, advanced steering, logo upload, desktop phone-control hiding, and setting-dependency markers. SettingRow.build/wire/paint owns label + div + previous/select/next structure; SettingsSearch/SettingsNav own index/page state; key-binds owns armed rebinding buttons; hud-elements creates checklist/reason DOM; setting-deps writes data-dep-off/reason and disabled states.

Shared select basis is 8rem, pad brand 8.5rem, drill native width, voice names 14rem; race-setup overrides its own values to 7rem. Race data-step controls have larger tap floor without affecting duel button. High-specificity settings button restatements restore chevron squares against broad `.pm-group button` geometry; final wide-row overrides let select cluster shrink. Wide sections use grid max-content rows; slider/heading/full action spans must remain full-row. Disclosure summaries wrap whole data-fold units, use leading custom arrows and actual native details state. Disabled controls keep layout and receive reasons rather than disappearing. Logo input label is the visible target.

### settings.css — 1–409

Components-layer Settings shell/index/page, `.pm-group/.pm-group-h/.pm-pad-tools`, full action buttons, files save/restore/share subnav, driving/practice/review/progress disclosures, accessibility reading clearance, appearance swatches/color/hex/replay controls, tune-over/revert markers, settings range geometry and light footer tokens. Shell appears at `index.html:896`; scripts mount the specialized pages. Settings root cap follows safe width, body is the sole scroll pane and native bar is hidden for ScrollFade. Headline wraps at enlarged UI size.

Broad button rules apply height/tap and left alignment; later carve-outs for presets/audio/doors/custom swatches/actions are semantic requirements. Appearance `.pm-accent-chip` uses aria-selected and concrete --chip/--chip-ink, distinct from root palette controls. `.tune-over` and `.tune-revert` expose saved-versus-inherited scaling. Dark/light footer override lives in components because base tokens alone cannot beat components' footer background. The wide `.pm-group` controller layout from settings-controls remains subject to the explicit files flex page exception.

### title.css — 1–372

Components-layer `.btn-ico`, title overlay/safe area/child zoom, title-car SVG fill/stroke/tone/trail/ink and per-shape opacity, title intro data-stage/--i/--n sequencing, wordmark and underline. Shell static SVG groups carry presentation attributes; `tools/gen/title-art.mjs` generates them. CSS group fill intentionally wins presentation fill; trail requires explicit CSS url fill. Child zoom excludes decorative title-car via zoom:normal. Tall art returns in menus.css's dedicated grid band; an apparent hidden rule here is not final behavior.

TitleFx owns intro/motion/wash/art root attributes; data-intro occurs once and focus cancels per-door entrance. Animations use backwards fill so final presentation returns to declared styles. Reduced motion and reduced transparency have separate purposes. SVG frame transform-origin is view-box 0 0; moving art with a default center origin would also reframe it. Underline width equals the actual wordmark. Menu identity and geometry are split between this file, menus, responsive and destination layer.

### tokens.css — 1–1361

The base foundation plus layer order, three blocking font faces, view-transition pseudo animations and motion fallback; forced colors; registered scroll/tap/shape properties; root semantic colors/safe-area/layout/typography/tracking/radii/plate/elevation/gradients/motion; body touch ladder; root menu/HUD/control scaling and compact residuals; coarse defaults; compensated units; team accents; menu accent/theme/system/text-size/CVD/high contrast; always-dark race scopes; generic reset/input selection/html/body/canvas/droplets/button/disabled/focus styles; viewport and measured-sheet compact spacing.

Root attributes come from appearance-opts, scale, title-fx, HUD/team and pre-paint shell. SheetShape reads computed registered thresholds, writes local data-density/shape/pair/rail and keyboard/fit variables; scroll-fade writes sf geometry. Fonts declare title faces only; numeric HUD faces are deferred in fonts-hud. HUD, announce and metrics explicitly re-resolve dark tokens so light menu inheritance cannot recolor race surfaces. Selected state grammar is plate/red border, focus white/dark theme-relative ring, data-fold words are readouts. Team identity is decorative except paired contrast-checked accent ink. Force-color swatches/flag intentionally retain content colors.

Touch ladder is selected by absence of body.desktop, while initial defaults use coarse-pointer media. Those systems must continue to agree with Input.touchControlsNeeded/scale defaults. Generic focus lives in base so components can override; inverse-scale ring floor avoids losing visibility below 100%. Generic input/textarea/contenteditable opt back into selection after universal UI selection suppression. Canvas driving owns gestures; menu scrollers opt into native pan. Important OS motion fallback applies globally outside layers.

### touch-controls.css — 1–914

Overlays-layer literal portrait ladder and `.touchbtn/.pedal/.shiftbtn/.steerbtn` state color/opacity, throttle latch and boost energy --e, OT/aero armed/on/dead, drag anchor, iOS install banner, mirror/reposition mode, manual/button/touch positioning, landscape flex docks/groups and independent control zoom/floors, HUD instrument cluster grids and desktop row/narrow adjustments, pause/camera/picker/restore controls and HUD-hidden exceptions.

Static buttons/docks are in index shell. `js/game.js:2774–2798` resolves touch visibility/mode and toggles steer-buttons; :319 toggles mirror-controls. Input owns held/latch/drag state; HUD updates armed/on/dead and energy --e. DockLayout writes data-dock-edit (`js/ui/dock-layout.js:168–169`) and saved offsets. HUD fit writes height/width caps; those are distinct from requested menu UI scale. Landscape `.dock .touchbtn` becomes static, making earlier fixed bottom/right values irrelevant there. Groups are indivisible flex items; BUTTONS mode reduces instrument columns rather than stacking thumb targets offscreen. Desktop's ≥1100 row gets a wider tach and one flat line; body.steer-buttons follows later and can override that grid.

HUD hidden keeps touch driving controls and live WORK ON CAR while hiding readouts; desktop can hide all HUD. Restore eye moves pause aside and shows transient hint; camera picker is a nonmodal fixed corner grid. iOS banner passes pointers except dismiss and has explicit hidden; compact-wide places it under brand. Theme-stable dark fills and ink are scoped directly so menu-light cannot make the driving controls disappear.

### track-detail.css — 1–232

Overlays-layer standings body, track-detail closed/hidden guard, inner sheet cap, canvas wrap/map fit, scrollable facts/DRS/corner/readout/legend/favorite/flags, viewport portrait and landscape arrangements; trailing portrait HUD camera/sectors/limits and cockpit/helmet hide rules. Actual shell is `index.html:2682` `.sheet` inside dialog, not a bare full-bleed flex host. Menus.openTrackDetail (`js/ui/select-screen.js:1326`) fills metadata/flags/map, :1393–1396 builds legend and :1440–1449 maps corner semantic classes.

Canvas maximums/object-fit provide a CSS backstop to asynchronous JS aspect fit. Portrait map uses a bounded top band and facts get remaining height; landscape facts rail has desktop and tall-map variations. HUD suffix is cross-domain: camera layout body data-hl-set and user-placed data-hl-user decide touch visibility. Cockpit floating speed/gear hide only when appropriate; helmet with wheel LCD hides unplaced duplicate speed. Editing circuit layout in this file must not accidentally remove these later HUD contracts.

### tuner.css — 1–1509

Primarily components layer; later standalone hud layer owns pc-toggle overrides. Covers right-docked lighting/camera/flyby/freecam/garage-arrival shells and shared --dock-w/--dock-px; flying reduced furniture; preview exit; tab/group/help/section/slider/export/foot vocabulary; camera tuned state; flyby pose/status/ops; freecam snaps/lens/photo overlays; audio/Spotify/music rows; preset/options/disclosure primitives; compact strip/rail-on/rail-off/flying arrangements; per-editor camera/lighting/flyby tap/portrait fixes; stacked lighting+flyby dock; garage angle map; final EditorWorkspace preview/edit furniture.

Shell IDs live in index for lighting/camera/flyby/arrival; freecam and workspace furniture may be built dynamically. Controllers are `js/lighting/tuner-panel.js`, `js/camera/tuner-panel.js`, free-cam/photo-kit, `js/garage/arrival.js`, `js/audio/panel.js`, `js/audio/spotify.js`. EditorWorkspace is verified at `js/ui/editor-workspace.js:31/:54`: adds editor-workspace and writes data-editor-view. Final high-specificity workspace rules intentionally convert older rail grids to shared flex editor, hide legacy heads, provide ew toolbar/title/tools and preview mode. Thus earlier compact grid descriptions do not describe every modern workspace.

Dock width is body-published so photo flight controls know painted occupied space; root defaults are zero. Normal cap 380px/88vwz, flying 300px/46vwz, rail 560px/70vwz, overlapping lighting+flyby 360px/40vwz. Hardware insets divide by actual sheet effective zoom. Compact state comes from local density threshold 620, rail 640; no viewport-only inference is sufficient. Unknown/off rails must preserve reachable action/footer. Tab strips contain pan-x and suppress native scrollbar. Native ranges use inverse-scale --slider; values wrap onto their own line instead of vanishing. Audio disclosures/settings button exceptions cross settings styles; final pc-toggle styles must be in real hud layer, not nested components.hud.

### watch-transport.css — 1–100

Hud-layer `.watch-transport` and all `[data-wt]` parts style playback controls, driver/camera fields, timeline/seek/event markers, event caption/director, chapter disclosure/picker/jump and responsive tower clearance. `WatchTransport.create` builds section at `js/ui/watch-transport.js:44`, node helper stamps data-wt at :21, markers stamp data-kind at :72; :114/:161 toggles body.watch-controls-on. Event kinds pit/fastest/pass/sc use semantic timing colors with important backgrounds. In watch mode CSS suppresses driving HUD/buttons/helmet pseudo and caps broadcast tower; other screens/photo hide transport. Short-wide chapters use ::details-content flex; unsupported engines keep native stack. Narrow and short-width rules both affect tower cap, so last matching source rule is relevant.

## Verified stale or misleading comments

These are source contradictions, not claims that runtime is broken. They remain untouched because this lane is documentation-only.

| Location | Comment claim | Current evidence / implication |
|---|---|---|
| `tokens.css:129–141`, :162–179, :300, :1342 | ScrollFade and SheetShape live under the former game directory’s scrollfade / sheetshape modules. | Current files are `js/ui/scroll-fade.js` and `js/ui/sheet-shape.js`; attached LSP resolves SheetShape there. Navigation paths are stale. |
| `tokens.css:1349–1357` | Overlay has no data-density and moving it under attribute is future work. | SheetShape.classifyBody :402 calls classifyDensity; menus.css repeatedly consumes body density to restructure overlay. The viewport spacing backstop can still matter, but this stated reason is obsolete. |
| `tokens.css:814–816` (UI scale prose) | Default 1.0 on every pointer. | Coarse block :920–926 sets UI scale 1.09; nearby later prose acknowledges it. Treat coarse declarations/scale defaults as truth. |
| `race-setup.css:500–505` | Race columns override the 440px query above; core knobs in responsive. | Actual two-column query is 640px at :496; shared screen-look core is in overlays.css. |
| `race-setup.css:554–557` | Race row has its own 8rem value and rules are in game.js. | Immediate live select declaration :545–552 uses 7rem; buildRaceSettings lives in RaceSettings module :178. |
| `settings-controls.css:28–39` | Do not narrow race selects to 7rem; it cannot fit. | Race-specific 7rem + reduced tracking/padding in race-setup :523–552 deliberately does exactly that after later measurements. Shared 8rem rule remains correct for non-race settings. |
| `overlays.css:1183 onward` pane-pair rationale and :1280 examples | Selector uses pane-pair with preview as side/list as main. | select.css:6–13 explicitly retired pair, index.html:2396 has class sheet only. Primitive remains active for career/carsetup/season setup. |
| `overlays.css:1324 onward` player-row prose | Sticky to both top and bottom edges. | Actual .res-row.you rule is top-only; inner corrective comment explains bottom removed to avoid covering podium. |
| `track-detail.css:2–5` | Fullscreen modal/original split byte-identical cascade. | Current #td-inner is bounded sheet (1100px, min(100%,54rem)); source now includes later redesigns. This is historical provenance, not current equivalence. |
| `overlays.css:192–207` popup appearance exclusion explanation | Track-detail is a full-bleed column flex host. | Current track-detail uses dialog + inner sheet, with row/column body. The exclusion remains a real selector contract, but the described layout is stale. |
| `title.css:123` and other references to tall blocks below | Tall re-show blocks are at end of this file. | Actual tall band re-show/transform blocks are in menus.css. |
| `touch-controls.css:19–25`, :320–322 | Portrait racing is blocked outright. | Rotate gate offers RACE IN PORTRAIT and body.rotate-ok bypass, wired in game.js:8767–8784. Fixed portrait fallback is reachable. |
| `touch-controls.css:147–148` | AERO is green. | Actual AERO rule is blue and later corrective comment says blue; BOOST owns green. |
| `touch-controls.css:680–723` budget narrative | Both controls/cluster zoom with hud-scale 1.15; dock wraps reverse. | Current dock zoom uses independent hud-btn scale/fit, default HUD 1 and buttons 1.25; dock declaration is nowrap. Numeric historical budget is not present implementation. |
| `tuner.css:57–62` | UI scale ships 1 on every pointer, formerly 1.15. | Coarse default in tokens is 1.09. Dock compensation remains necessary. |
| `settings.css:87–89` | Every interactive setting row exactly tap-tall; label overlays track. | Later rules explicitly allow auto action heights and .tune-row labels are position:static at :376 onward. Treat as old design description. |

## Verification limits and hand-off

All assigned files were read in full; no browser, source edit, commit or test process was started in this sublane. DOM/controller relationships above were checked against literal shell/state/builders and attached LSP outlines. Historical contrast/fit/performance numbers in CSS comments were read as provenance, not re-measured. This document makes no visual pass claim and does not label selectors dead solely because a shell search missed dynamically generated nodes. Parent lane should run the docs-only integrity checks once after all documentation edits are assembled.
