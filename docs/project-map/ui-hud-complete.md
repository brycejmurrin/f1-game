# HUD complete-read map

Completed 2026-10-27 at checkout HEAD `64809115e276d7a2b03ccf5678773a001e817db3`. Scope: **all 12 `js/ui/hud*.js` files, 6,428 lines**, including comments and private implementation. Source was displayed in the bounded, nontruncated ranges below. The three files previously completed in [ui-complete.md](ui-complete.md) (damage, skin, tyres) were also reread here; this report does not claim the rest of `js/ui/` complete. No source edits, browser runs or commits.

Read prerequisites: root `AGENTS.md` and `.claude/skills/code-nav/SKILL.md`. Attached apex-lsp `lsp_references` was queried with `files: true`, full output, for every module. Outlines were additionally queried for the nine larger modules. The outline parser reports zero exports for several `return Object.freeze({...})` modules; their public contracts below are from the fully read source, not an inference of no exports.

## Exact coverage ledger

SHA-256 identifies the actual working-tree bytes read. Ranges are inclusive and collectively cover each full file.

| File | Lines | Displayed ranges | SHA-256 |
|---|---:|---|---|
| `js/ui/hud-arrange.js` | 614 | 1–300; 301–614 | `3063e683eed366496e22c7f0dedb7c935ea33086a9248f394a82b021f75f2b18` |
| `js/ui/hud-damage.js` | 77 | 1–77 | `b4d2b1f2c590fb712876e127ef50cc39f1c6c8d4c55b265e2bfb064a668a0869` |
| `js/ui/hud-elements.js` | 273 | 1–200; 201–273 | `dd6fae0a8af4336f2763017995dd5494f302c7a65e0aac601c23395023f81e1e` |
| `js/ui/hud-inputs.js` | 259 | 1–259 | `e88b9a658220096da7d8fdab48ea58d9a61fd5a9f6779df9e7888db8ee3fff61` |
| `js/ui/hud-layout.js` | 1355 | 1–340; 341–680; 681–1020; 1021–1355 | `512a4ce001b63fcad4003139cb36aa041fe36be45c5c8cdb1d9248e4aa514895` |
| `js/ui/hud-minimap.js` | 287 | 1–287 | `859d014f80f3bd14aa1df12aacce88597c9aa0919ae08d6752fbcfb8f76c70ea` |
| `js/ui/hud-readouts.js` | 308 | 1–308 | `4a47a3a0d4ea19791fd29f6199d25302f623e95d92d6af3eee4643b805cef8c0` |
| `js/ui/hud-relative.js` | 339 | 1–339 | `342ccab8160df88da89c637ebd9f1a45e103e87f3a98606fc2e9a7f0808d86b6` |
| `js/ui/hud-skin.js` | 86 | 1–86 | `0d2d2b6087b994fb06dc0f25b143cba4f1ac44f6f27ba5e16fa6369dde2b8352` |
| `js/ui/hud-strategy.js` | 201 | 1–201 | `c8b31a62d69464fb8f701b4b5c1c5d5fd7b6ae1b59f155b83a615c88c9f8c73b` |
| `js/ui/hud-tyres.js` | 88 | 1–88 | `4a63f61a5a22bf11a50f12e2a8eeae0c9f1dcfdfe5887be655c0416ebd17f444` |
| `js/ui/hud.js` | 2541 | 1–320; 321–640; 641–960; 961–1280; 1281–1600; 1601–1920; 1921–2240; 2241–2541 | `34025c6524ab09293553ea05907cc0e3b063a1d31b00a17e2f6707960477355f` |

## Contracts and integrations

| Module | Contract and implementation ownership | LSP consumer files outside itself (reference count) |
|---|---|---|
| `GameHud` | `create(G)` returns `updateHud`, map/fit invalidation, sector flash, per-race reset, phone-fit sync and lane-cache counters. Global wrappers forward fit/sync to the live instance; `vpKey` shares cached viewport. Instruments, input sampling and best-lap trace run per frame; other painting uses a 100 ms wall-clock gate. Hidden painting preserves sampling and spoken race information, then forces refit/repaint on return. | hud-arrange (8), dock-layout (4), hud-layout (4), survey-hud (4), hud-elements (3), hud-relative (3), game (1) |
| `HudLayout` | Schema v4: style × cockpit/helmet/other × explicit `{x,y,s}`. Positive finite sizes, finite offsets, no viewport clamp of manual entries. Explicit shipped values still mean manual; reset deletes ownership. Applies CSS variables/data attributes, reparents manual bottom instruments, fits automatic offsets, packs phone instruments, then places secondary panels around fixed obstacles. Exposes get/set/reset/all/migrate/preset/visibility/hiddenReason/fit helpers and constants; settings numeric drafts commit on change/blur. | hud-arrange (28), hud (10), hud-elements (4), camera/mode-switch (2) |
| `HudArrange` | Pure drag/pinch/step/clash helpers plus `create(G)` → setEditing/isEditing/selected. Uses HudLayout's same schema and visibility mapping. Captures pointer events to prevent pedals receiving edits, pins gesture camera/style, batches writes in rAF, adopts painted positions before ownership transfer, supplies/restores sample content, restores dialogs/focus, handles keyboard moves and rotation exit. | game (3) |
| `HudElements` | Preference `hudElements`, default-on ordinary pieces, opt-in strat/inputs, profile-dependent REL. `setMany` persists one grouped change. `apply` paints body hide tokens, invalidates fit and refreshes checkbox reasons. `effective` describes preference/mode/session/data availability; `configure` injects live context and requirement navigation. Self-starting apply/UI and store subscription. | hud-layout (7), hud (6), hud-arrange (5), game (2), hud-inputs (2), hud-relative (2), hud-strategy (2) |
| `HudInputs` | 90-sample 30 Hz ring over three seconds, records resolved throttleDemand/brakeDemand/steerCommand. `frame(G,player,dtMs,paint,suppressed)` samples separately from visual work; resets on player/suppression/large hitch. Canvas draws at 100 ms, labels at 1 s; reduced motion uses still bars. Detached `snapshot`, reset and pause-sheet review; direct exported `trace` is mutable, so consumers needing isolation must use snapshot. | hud (7), game (2) |
| `HudMinimap` | `create(G,deps)` → draw/invalidate. Dependencies: cached viewport, team color, replay ghost, reduced motion and fit-key getter. Caches background by local CSS dimensions × DPR × zoom × manual size, bounded ratio 3; draws sector metals, aero zones, pit path and current car/ghost markers. Normalizes negative arcs and skips nonfinite positions. Cache invalidation is required on track changes. | hud (1) |
| `HudReadouts` | Shared pure lap/gap/energy/brake-bias/speed/cue helpers plus factory-owned `lapTrace` and `speaker`. Gaps use hundredths below 9.995 s, broadcast always hundredths, signed REL/tower gaps cap at 99+. Speed digits clamp 0–999; `spdPlate` returns a pooled object overwritten by its next call. Best-lap trace validates continuous samples before adoption; speaker defers to foreign live-region content. | hud-relative (4), car/car-draw (3), car/car-mesh (3), race/broadcast (3), hud (2) |
| `HudRelative` | Road neighbours, not race rank: two ahead/self/two behind, wrapped signed arc and lap relationship; 0.3 EMA resets when neighbour changes. `tick`, select/format/label helpers, rows, fitRows/refit/fitKey. Per-row write caches; phone fit drops farthest occupied rows while retaining self; user placement bypasses automatic fit. Team memo writes presentation cache on shared team record. | hud (13) |
| `HudStrategy` | Pure format/window/hysteresis/undercut/cover helpers and `tick(G,player,sharedReadouts)`. Race + wear gate; reads tyre model, pit estimate/plan and race-order neighbours. Shares same-tick spent/left/plan/estimate with HUD. Undercut compares wear and one-loss positive gap; cover allows loss+2 s, can trigger immediately for an already boxing follower. No car-state writes. | hud (3) |
| `HudDamage` | paint/sync/level/text/label. Reads Damage; shows strictly beyond SHOW, quantizes part severity and percentages for DOM signature, reports every qualifying damaged part in aria label. Called at HUD tick. | hud (2) |
| `HudSkin` | skinAccent(team,G) delegates appearance overrides, clears inline overrides for real constructors, otherwise chooses root text/bg ink by WCAG luminance contrast against runtime team color. | hud (2) |
| `HudTyres` | band/state/label/compoundChip/paint plus constants. Heat bands ±0.55 temperature window; writes temperature data, optional colourblind compound cue, and spoken compound/heat/life/plan. | hud (2) |

Paths in the consumer column are relative to `js/`, with `ui/` omitted for UI files. Counts include every reference in that file, not just calls, and exclude module declarations in their own file.

### Update and layout flow

`game.js` owns lifecycle and supplies G; GameHud orchestrates the frame, reads physics/race models and paints static `index.html` handles. It constructs HudMinimap and its own HudReadouts trace/speaker. A HUD tick resolves camera/profile/visibility classes, fits canonical zoom-1 budgets, paints final band/control caps, then paints race readouts, REL and STRATEGY, stamps phone clearance, and draws the minimap. Sector crossing explicitly calls flashSector so delta compares against the prior tick's sector best.

HudElements owns binary preferences; map/gaps/mirror retain their real SettingRow handlers. HudLayout maps layout pieces to these preferences (tower is five toggles), and both editors reuse that mapping. HudLayout automatic placement treats manual readouts as fixed obstacles and clears automatic properties when manual ownership begins. Manual bottom pieces leave `.hud-bottom` for `#hud`, with original parent/sibling retained for reset. HudArrange temporarily removes hide tokens, creates dimmed ghosts and sample nodes without destroying producer nodes, then restores producer visibility/text on exit.

Fit state is deliberately layered: viewport cache, CSS-root cache, intrinsic gap-width cache, full-fit memo/backstop/ResizeObserver, radio lane rect cache, painted radio collapse memo, phone clash stamp and HudRelative row fit memo. Setting changes explicitly invalidate fit because attribute-only changes evade body class keys. Fonts reset learned gap widths. HudLayout also schedules a double-rAF and 120 ms pack follow-up to catch panels painted after fit; hidden-attribute and ResizeObserver hooks rerun placement. These are display corrections, never saved into player geometry.

LiveRegion is the shared announcement writer: flags use flag priority, HudReadouts speaker uses HUD priority. Hidden visual HUD does not mute those announcements. Race reset clears input history, lap trace, speaker/live-region state, prior position/lap holds, energy baseline and gap decorations.

## Proven comment inaccuracies (source unchanged)

| Location | Claim | Source evidence and correction |
|---|---|---|
| `js/ui/hud-relative.js:2` | RELATIVE is “shipped off”. | HudElements.shippedOf at lines 70–71 returns on for broadcast, and its element table documents the exception. Say off in Standard/Minimal and on in Broadcast. |
| `js/ui/hud.js:197` | MOVE & SIZE keeps one cockpit layout and one for the rest. | HudLayout.SETS at line 70 and schema at lines 9–12 specify cockpit, helmet, other for each of three profiles. Say three camera sets per style. |
| `js/ui/hud.js:571` | Top-row radio placement is “Never in BROADCAST”. | radioTopSlot at lines 741–744 explicitly considers every profile, voids bcast and uses the tower free slots. Remove the exclusion. |
| `js/ui/hud-strategy.js:24` | Cover requires follower “within one pit loss”. | behindThreat at line 80 accepts `gapS <= lossS + 2`; the in-pit branch returns true at line 81 before planned-window/wear tests. Describe the two-second allowance and immediate in-pit branch. |
| `js/ui/hud-layout.js:23` | Hidden reason greys out “sliders”. | build at lines 1225 onward creates unrestricted native number fields; draft editing commits on change/blur. Other comments at lines 27, 33 and local names also retain slider-era wording. Say numeric fields. |

These are directly demonstrable documentation mismatches. Historical performance measurements, claimed browser behavior and accessibility outcomes in comments were read but not independently remeasured; no runtime defect is established by this map.

## Verification limits

This is a source and LSP map, with full file coverage, not browser or gameplay validation. LSP reference results cover the project's JS source graph; tests, HTML/CSS selectors and runtime lookup conventions require their own evidence. No dead-code claim follows from a low reference count. Prior UI ledger coverage outside this HUD subset remains as recorded in ui-complete.md.
