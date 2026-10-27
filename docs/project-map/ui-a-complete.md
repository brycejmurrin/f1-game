# UI complete-read ledger — batch A

Read on 2026-10-27 against HEAD `64809115e276d7a2b03ccf5678773a001e817db3`. All eight assigned files were read in full, including comments and private implementation: **2,694 lines**. No source edits, browser runs, commits, or permission flags. Read `AGENTS.md` and `.claude/skills/code-nav/SKILL.md`; used attached apex-lsp references and outlines for every module.

## Exact read ledger

Ranges are inclusive, line-numbered displayed source, not search excerpts. A combined AppearanceStudio display was truncated; its second half was reread as 181–270 and 271–355 without truncation. All ranges below were visible in full.

| File in `js/ui/` | Full coverage / bounded reads | SHA-256 |
|---|---|---|
| appearance-opts.js | 1–589: 1–150, 151–300, 301–450, 451–589 | `3823dd593b57a221c4045347e7100f3e7111c96cfcd15bc651f105b6e4987720` |
| appearance-studio.js | 1–355: 1–180, 181–270, 271–355 | `963eeea6a39ddce588596f98c20e4b8fd9b56db86cc9f621a45cbb9edefee418` |
| captions.js | 1–268: 1–140, 141–268 | `c8b4970b575bbddaffff02f917f639c24c59ff9eebb43616ec3fb1f5d548b4ec` |
| cvd-palette.js | 1–173 | `819f5a3a053b76b25832b372dab63f0cff9bdd365ae20941271bed339afddd36` |
| dock-layout.js | 1–333: 1–170, 171–333 | `1b8b719d448b6a186e3a32ff701c4616a030a1602a2aa7f87dfb7e34ac909241` |
| experience.js | 1–601: 1–150, 151–300, 301–450, 451–601 | `43b625515fa11b9a9b38856f8e0c1fed9da96267104c9eee4266efb98e442be7` |
| flags.js | 1–198 | `cf7fd44e25ed446890a4f01c09a5c7270e66efd7984adc965dd51021d8831df5` |
| home-world.js | 1–177 | `f8033e6b52cc778de78294fbabfab173f4dc7bba741892432f7d5757ec8285d8` |

## Contracts and ownership

- **AppearanceOpts** (`appearance-opts.js:67–98,171–213,310–439,465–589`): frozen global over GameStore/SettingRow, no G. Evaluation applies preferences before paint; DOM readiness wires controls. Normalizes theme, accents/hex, text, contrast, CVD, icon, units and help; setters persist then apply/paint. `restore(values)` refreshes memory/DOM without persistence. `speed(kph)` converts only display using 1.609344. Team HUD leaves ownership to skin; brand HUD follows actual menu `--red`. `pickInk` caches root theme token RGB by OS/theme/contrast/root-class key. Preset chip keyboard navigation uses a single selected tab stop and avoids consuming synthetic vertical pad navigation.
- **AppearanceStudio** (`appearance-studio.js:8–68,75–159,200–264,265–355`): frozen visual-only snapshot/profile API; `VISUAL_KEYS` derives from DEFAULTS, `SCREEN_KEYS` controls scoped preset/profile/reset writes. Snapshot normalization whitelists enums, hex, scales/opacities, ScreenLooks and TitleLayout. Apply writes only changed keys, removes null motion, refreshes owning modules/hooks, tracks durability and bounded 30-entry undo. Cosmetic presets preserve motion/text size/UI scale/contrast/CVD/units. Profiles max12/name40. Scene listeners and `attach` hooks connect engine preview/photo opening; preview is illustrative and frame URLs restricted to image data/blob. Album requests use generation and visibility cancellation, validate max6 bounded image thumbnails, and choose only after background persistence succeeds. UI adopts existing appearance rows, observes open sheets and defers costly preview two rAFs.
- **Captions** (`captions.js:8–81,83–170,172–268`): frozen display-only radio/spotter/loading presentation. Store keys cover mode, size, position, opacity40–100, speaker ink. Twelve-entry transcript; quiet radio excluded; radio cards stay owned by announce-banner while spotter strip/loading text painted here. Speaker labels use RadioVoice mapping/player surname. Position/size/background/root CSS updated by `applyDom`; text-size multiplier comes from AppearanceOpts. Off clears displays; `restore` rereads store; SettingRow controls built after CVD anchor. `spoken` and `on` both show strip; speech delivery eligibility remains caller-owned.
- **CvdPalette** (`cvd-palette.js:11–95,97–173`): frozen semantic color table plus simulation/math API. Mode initialized from store; `set` normalizes/paints/notifies, does not persist. Off removes seven inline semantic CSS vars for cascade fallback. `hex/css/rgb01` supply JS colors; onChange appends listener (no unsubscribe). Machado severity1 linear matrices, linear/sRGB conversion, Lab and CIEDE2000 utilities support co-visible group evaluation. Source alone establishes the algorithms and tables, not their perceptual threshold/test verdict.
- **DockLayout** (`dock-layout.js:10–108,110–182,184–333`): frozen pure helpers plus `create(G)` controller; store shape is tilt/buttons/touch × L/R × x/y, clamped0–.35 usable-pad fractions. Applies inboard/up translations divided by effective CSS zoom; invalidates HUD fit. Editor hides/restores prior settings/pause dialogs; DONE/Escape exits, unexpected dialog open cancels restoration. Capture pointerdown suppresses gameplay buttons; matching pointer drag saves on up/cancel. Resize/orientation and steerMode/layout store events repaint. Factory returns apply/edit/setEditing/bag/scheme/resetCurrent; listeners are lifetime-scoped, no dispose.
- **UiExperience** (`experience.js:5–108,110–153,155–324,325–601`): frozen integration global. Practice title door wraps TT but owns practice flag/brief; other doors clear it in capture. `raceBrief(G)` handles watch/reel/follow, session/rank/lap/online/career objective. Solo resume plate 3/2/1 holds1.2s, webdriver bypass. `homeVariation` cycles20 persisted visits across5 environments/4 shots, reuses result. `openPhoto` hides callers, pauses race/watch, restores on close/failure and guards stale subject swaps. Factory wires pause/practice/title and owns garage/track Home orchestration, camera restoration, scene signature,120ms viewport settling,24Hz/one still present, failure fallback and readiness stamps. Appearance garage preview cancels stale requests, waits two frames, skips software path, captures max512-edge thumbnail then restores borrowed camera. Photo subject promises await rendered scene/world readiness up to20s and cancel on state/layer/page/newer choice. Factory returns render/stop/pause/preview/photo and track camera/readiness adapters.
- **Flags** (`flags.js:13–25,27–172,174–198`): frozen pure public code/svg/codes/countries; recipes generate cached inner SVG markup for32 countries plus chequered fallback. Country/recipe lookups enforce own keys for custom player text. Decorative by default; optional label adds img semantics. SVG is60×40 with preserveAspectRatio none; all recipes intentionally simplified. No DOM lifecycle.
- **HomeWorld** (`home-world.js:5–95,96–177`): frozen create-only module. Controller owns camera snapshot/restore and prepared track/pitlane pose, never starts race or draws. begin captures once, checks mode/shot/motion/context/view keys, delays prepare two rAF with generation invalidation. Eligibility/readiness/warming gates active/frames;24FPS credit plus explicit interactive/force. Track/pit samples and FlybySeq safety establish camera endpoints; invalid/missing geometry falls back to still saved pose. camera returns reused pose including pane shift/cut; caller must call didRender to consume pending frame/credit. End cancels preparation and restores camera.

## LSP evidence and limitations

Attached `lsp_references({symbol,files:true,outputLevel:"full"})` returned all file totals below, including declaration/export references. These are consumer navigation evidence, not dead-code conclusions.

| Symbol | Total references/files | External files (count) |
|---|---|---|
| AppearanceOpts |62/14; explicitly labelled text match because window.AppearanceOpts untyped | ui/hud-skin14; ui/hud-readouts8; car/car-draw5; race/engineer5; car/car-mesh4; data/telemetry-model4; race/race-insights4; camera/cockpit-preview3; ui/appearance-studio3; ui/captions3; ui/select-screen3; race/pit-lane2; ui/hud2 |
| AppearanceStudio |15/4 |ui/experience10; game2; ui/settings-export2 |
| Captions |20/5 |audio/announcer6; race/announce-banner6; race/spotter3; ui/appearance-opts3 |
| CvdPalette |8/2 |ui/appearance-opts6 |
| DockLayout |4/2 |game3 |
| UiExperience |18/4 |game7; ui/select-screen6; race/race-settings3 |
| Flags |14/4 |ui/select-screen8; editor/designer3; game1 |
| HomeWorld |4/2 |ui/experience2 |

All eight outline calls completed. Captions/CvdPalette/UiExperience/Flags/HomeWorld outlines expose their source return contracts. AppearanceOpts symbol outline selected cockpit-preview (shadow/fallback limitation); explicit file outline correctly exposed54 exports. AppearanceStudio and DockLayout outlines reported0 exported because their returns are Object.freeze expressions; actual source return at appearance-studio:353–354 and dock-layout:329–332 remains authority. `lsp_definition(AppearanceStudio.applySnapshot,body:true,maxLines:30)` found:102–120 via explicitly labelled module-file fallback, export/caller coverage unverified. No absence of references is treated as proof of unused API.

## Source-backed comment corrections to consider

These are documentation drift, not source changes made in this review.

1. `appearance-opts.js:4–5` says inline --red/--accent/--accent-ink are CUSTOM-only. Team menu writes --red at:183–185; brand HUD writes --accent/--accent-ink at:206–208; named HUD accents write them at:211–212. Describe per-mode inline ownership and CSS preset fallback instead.
2. `appearance-studio.js:31–32` refers to explicit motion `"on"`; current ENUMS motion is auto/reduce/off at:11. Its valid lesson is preserving unset OS/touch behavior, but the example value is stale. Null removes the key at:112.
3. `flags.js:3` says twenty-nine flags; RECIPES:104–172 currently has32 country recipes plus xx fallback. A read-only Node vm evaluation of `Flags.codes().length` returned32.
4. `flags.js:9` names select-screen as consumer only; LSP additionally resolves editor/designer and game. Expand consumers or omit the brittle list.
5. `flags.js:160–162` says12 Ashoka spokes drawn instead of24. The12 angles at:164 span half a turn and each line at:165–166 crosses the center, so the geometry has24 radial spokes (12 diameters). Correct the description to12 diameter strokes/24 spokes, or change the claimed simplification if a future design requires12 spokes.

Other examined header ownership promises match the local implementations; browser behavior, contrast thresholds, historical timing comments, external geometry references and tests were not independently validated here. Parent owns combined docs-only verification.
