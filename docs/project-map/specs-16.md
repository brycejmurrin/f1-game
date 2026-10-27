# Browser specs map — batch 16

Static inspection of 160,000 assigned bytes. Evidence JSON records whole-file plan hashes, separate assigned-part/chunk hashes, exact intersecting case and assertion spans, and local LSP results. No browser, tests, network, game runtime, source edits, staging, or commit.

## Scope and boundaries

| Spec | Assigned half-open bytes | Coverage |
|---|---:|---|
| ui-redesign | 20346–65399 | Tail of the catalogue/garage/settings case, then ten complete cases. Starts inside an assertion expression; setup and earlier assertions belong to batch 15. Ends at EOF. |
| ui-resize | 0–31527 | Whole file: helpers, both describes and seven cases. |
| ui-scale | 0–83420 | Helpers and 23 case declarations, including parameterized matrices. Ends inside the race-setup case's touch swipe helper, before native-scroller settlement and later assertions. Remaining bytes belong to batch 17. |

## ui-redesign tail

Shared fixtures and waitReady/awaitTrackBuild calls are visible as usage here; their definitions and global hooks precede the assigned range. Geometry is measured from DOM and computed style; in-page clicks and forced sheet reclassification are common. These are layout contracts, with targeted keyboard interaction tests, rather than universal pointer actionability evidence.

| Intersecting case | Contract and target |
|---|---|
| catalogue, garage, settings, data table, compact multiplayer fit (partial) | Tail verifies garage tab End selection/label association; ten named Settings doors at 200%; advanced panel fit; synthetic Last Race table containment; compact VS HOST/JOIN one row and CLOSE in head; 110 CSS-pixel minimap after zoom/animation settlement; compact lighting tabs/scroll owner; camera radio menu, End/Escape focus restoration, and pause dismissal. |
| duel rival sheet | Field fold opens fourteen roster choices without search; current choice focused; selecting Senna closes picker and updates value/accessibility label. |
| garage categories | Two labeled rows separate performance from floor/cockpit/wheels/setup/livery; livery announces default/custom state. |
| How to Play contents | Eight named links have real targets; safe-area portrait strip sits above one scrollable body; friend link reaches target; desktop becomes left rail. |
| Career guide and standings | Forced title standings opening checks uncapped leftover-height scroller; Career guide has wide rail and tall strip; qualifying anchor reaches body. Forced unhide bypasses season eligibility. |
| balanced control rows | Visible utility/Explore/Settings doors use flex rows with full final row; excludes SettingsSearch from balance count. |
| throttle help and backup | Three throttle modes update concise notes; comparison disclosure toggles; save/restore/share panels select exclusively and align below nav across three viewports; invalid import produces status. No valid import/export round trip. |
| landscape team picker | Mobile 844×390 wrapped driver bodies remain inside tile bounds after animations settle. |
| shared narrow sheets | 320×568, 568×320 and desktop at 100/200%: long substituted labels fit chrome, body keeps 44px capacity and scroll end contains content; Escape restores HELP focus. Explicitly CSS reflow rather than native browser zoom. |
| Data Hub constructors | Routed deterministic driver/constructor standings for four teams; constructor names do not truncate at 844×390. |
| compact VS CLOSE | Mobile context waits deferred styles and finite animations; clipped head foot retains skewed CLOSE corners within 0.5px. |

The synthetic table is removed before VS flow; long labels are restored after each narrow-sheet iteration. Sheets are explicitly closed between flows. Network route fixtures and page DOM live in the per-test page; no repository files are modified.

## ui-resize

Imports fixtures (test/expect/BOOT_MS), factory-seat and garage-sheet support. loadAt pins an empty factory McLaren before navigation; beforeEach pins normal text, contrast off and garage home. waitReady stops drawing for DOM cases; openGarage waits populated sheet and three warm-up frames. readState collects classification, rounded width, zoom, horizontal overflow and DONE viewport containment together.

| Case | Contract |
|---|---|
| resize matches fresh | Fresh baselines at desktop, landscape, portrait and short-wide; same-session walk must converge to shape/pair/density/width, no horizontal overflow, reachable DONE. Convergence wait catches timeout before explicit assertions. |
| rotation does not ratchet | Three landscape/portrait cycles return classifications and width to initial portrait, keep DONE reachable; uses 250ms fixed pauses. |
| UI SIZE reclassifies | Short-wide density normal→compact→normal at 50→150→50%, with no viewport change; at 150% checks overflow and DONE. |
| extreme UI size | 734×343 at 200% preserves requested root scale 2 while effective fit yields below 2; option pane ≥24px and DONE on screen. |
| keyboard inset | Injected --kb=120px reaches unzoomed screen padding and tightens fit while action remains visible; removal restores padding/zoom. It tests inset consumption, not actual visualViewport keyboard detection, pinch or URL-bar guards. |
| density reaches spacing | Lighting at 393×659/115% is compact at its own 620px threshold despite inactive viewport queries: nowrap sideways tab strip, 13px padding, reachable footer. |
| GLX aspect | Only case keeps renderer running; desktop→portrait→landscape canvas client ratio agrees with GLX.aspect within 0.01; 300s budget and 15s polling. Does not establish other backend correctness. |

Relative fresh-load comparisons cannot catch a classifier broken identically on both sides; comments record that disabling classifyDensity only fails the explicit scale case. The scale watcher itself is not proven necessary because current garage width also changes with scale. Keyboard CSS is removed and reclassified after injection; test pages isolate other localStorage/DOM changes.

## ui-scale

fixtures plus ui-device-profile support coherent mobile identity, touch and DPR 1 in explicit phone cells. Main matrix pins previous-look preferences (normal text, contrast off, garage home), uses six scales 50/100/115/130/150/200 and both 852×393/393×852 orientations. boot, toTitle and open reuse one boot per case; they directly reset overlay visibility and dispatch DOM clicks, finish finite animations and wait briefly. PROBE intersects clipping ancestors: scrollable ancestry permits offscreen list content; unscrollable shown fraction below 90% is reported clipped; horizontal overflow uses a 1px tolerance. This heuristic is not a complete hit-test or clipping proof.

| Case or matrix | Contract |
|---|---|
| every main screen fits (12 generated cases) | Title, select, garage, race settings, help and settings all open with measurable controls; no offscreen/clipped reports or sideways root/document scroll. |
| blurbs and Career intro (9 generated cases) | Three landscape widths × 100/150/200%; visible text has no line clamp, firing ellipsis or preset-card overflow; captions intentionally hidden may skip caption assertions. |
| race events/HUD changes | HUD scaling, readouts, damage, camera and repeated fitting leave touch control sizes/positions stable within 0.5px; independent button scale can shrink. |
| larger BUTTON SIZE | 125/150/200/300% remains monotone, on screen and clear of CAM/PAUSE; 125% pedal footprint is 90px. |
| BUTTON SIZE reset | Independent touch default 125%, override marker/revert lifecycle, in-page revert click and later HUD changes preserve default. |
| independent axes | UI/HUD tokens change independently; button default/override independent; out-of-range UI clamps to API max; null forgets stored override. |
| title navigation 200% | Portrait, short landscape and browser-zoom-equivalent CSS viewport: compact within six rendered frames, no geometry transitions, brand zoom 1, buttons 1.25, requested text ≥33px; scroll RACE into view and pointer-click to select. Frame starvation bounded by BOOT_MS per frame. |
| desktop Home 200% | 1280×742 and 1920×1080: one 2× zoom, no nested doubling, subtitles contained, RACE visible, last door scroll-reachable. Injects returning-player subtitles. |
| stored bounds | Preboot UI 500/HUD -40 clamp applied tokens and displayed slider/labels to live API bounds. |
| Settings stack | Display/control doors hide index, BACK returns index; layout remains one column across landscape/portrait. |
| HUD clusters | Bahrain race, headless DOM checks at all scales; visible clusters remain on screen, visible controls ≥23.5px, dockSeen prevents entirely vacuous touch coverage. Hidden/missing individual clusters are skipped. |
| broadcast map clearance | Tilt/broadcast defaults, injected safe areas; 2 HUD ×3 button scales clear controls/tower while preserving map size, controls and storage; repeated fit stable; custom map placement survives and gets no clearance offsets. |
| inspector bindings/provenance | Real slider keyboard action joins runtime/saved state, CSS source lines, accessible name and diff; DOM-only value mismatch detected; reload proves persistence; phone snapshots retain matching binding; no pageerrors. |
| inspector reachability | Synthetic fixture: name concatenation, inherited fieldset disability, blocked/offscreen/axis clipping, boxless display:contents, duplicate IDs and pressed state; successful real action on boxless child; lazy game hook throws if invoked. |
| adaptive CSS | Synthetic media-query fixture: responsive sweep restores viewport; stable settlement, tokens/visualViewport/scrollability/CSS provenance and layout diff distinguish layout from setting change. |
| flattened Garage tabs | Three-view sweep: stable, hit-testable tabs, boxless ancestors do not clip, no error overlay/pageerrors; real tab selection succeeds. |
| absent animation frames | Stub rAF never delivers: bounded zero-frame/provisional report without retry; pending request cancelled and viewport restored. |
| tuner mappings | SCREENS navigation; camera keyboard value maps saved value; lighting key maps runtime but saved status explicitly unmapped. |
| hysteresis paths | Synthetic width thresholds: forward/reverse phases detect exactly one intentional state difference at 395px; viewport restored. |
| alternating classification | Synthetic rAF toggle never settles; ≤120 frames and bounded state/evidence history; finally stops toggle. |
| container/inherited CSS | Synthetic named container resolves column layout and inherited custom property; container geometry available but query condition explicitly unavailable. |
| native audit provenance | Synthetic audit rows with matching, failed and pointer-mismatched environments yield comparable/skipped/incomparable; only matched finding joins selector. |
| adaptive race task (partial; large/larger generated) | Touch/current text preferences; preset disclosure and QUICK→CUSTOM state, native selects, help visibility; eight viewport/scale cells preserve selections/open folds; measured weather glyph fit and portrait first-editable-row capacity; starts trusted CDP swipe at 667px. Later swipe settlement, assertions and cleanup outside range must not be inferred. |

Inspector cases write JSON reports through testInfo outputPath; adaptive task also writes help and initial-cell screenshots, which are evidence artifacts rather than pixel assertions. inspectResponsive cases explicitly verify viewport restoration. Inspector synthetic DOM/RAF overrides are page-local; alternating fixture uses finally. The map case preserves stored custom layout and the keyboard case in resize removes its token. No explicit afterEach appears in these assigned whole files; shared fixture teardown is external support.

## Production navigation and limits

Local apex-lsp definition lookup resolves SheetShape.reclassify to the measured/pruned sheet walk and body classification in sheet-shape. It reports an untyped-window text fallback, so this is not checker-confirmed alias resolution. GameHud.invalidateFit references resolve to thirteen production references across hud-arrange, dock-layout, hud-elements, hud-layout, survey-hud and hud. Core implementation targets are sheet-shape, scale, hud, hud-layout, index markup and responsive/menu/garage/dialog CSS; inspector cases additionally target inspector, transitions and audit-evidence support. Exact production locations and lookup limitations are retained in JSON. Reading these specifications proves their intended assertions only; no execution verdict is claimed.
