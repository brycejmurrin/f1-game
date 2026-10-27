> Coverage update: Initial bounded snapshot. Later complete core, network/input, data/career, audio and UI reports close its unread source rows. Use coverage.tsv for current status.

# Feature systems map

## Goal

Map the core services and player-facing feature systems from a fresh bounded inspection. This is a navigation report, not a completeness, correctness, or runtime certification.

## Source identity

Checkout `/workspace/f1-game`; branch `cursor/project-map-a84f`; source HEAD `ae73c67669bbb7fe4b54f58f78bcfb9c8b00aebb` (2026-10-27 UTC). Read root `AGENTS.md`, `.claude/skills/code-nav/SKILL.md`, and F1 Dev Tools guidance. Only this report was written by this slice. No source edits, browser, build, or tests.

## Inventory

Scope contains **165 JavaScript files, 71,551 lines** (splitlines count):

| Directory | Files | Lines | Main responsibility |
|---|---:|---:|---|
| `js/core` | 16 | 3,597 | Logging, persistence/schema, script/lazy loading, i18n, native/browser services |
| `js/ui` | 66 | 25,652 | Title/select/settings sheets, HUD, accessibility, layout, sharing and recovery UI |
| `js/input` | 9 | 5,857 | Keyboard/gamepad/touch/tilt, profiles, haptics, phone controller |
| `js/career` | 16 | 7,876 | Career economy/slots, calendar, regulations, development, backup/migration and screens |
| `js/data` | 22 | 8,242 | F1 API transport/mapping, Data Hub tabs, telemetry, static grid/defaults |
| `js/net` | 16 | 8,380 | Lobby/signalling/QR, WebRTC transport, clock/snapshot/session and game integration |
| `js/audio` | 20 | 11,947 | Lazy stub, WebAudio engine/mix, music, recorded/synthesized speech and cues |

## Architecture and data flow

The project uses browser script globals and IIFE factories. Root instructions identify `js/game.js` as the integration entry and `G` as its contract; this slice did not read that entry. `LazyBundles.create(deps)` reads generated `ApexRoster` groups and injected loading services. Its race-session loader retains successful files across retries, checks replacement of stub globals, and calls the ready hook only after a complete load (lines 13–80). Circuit data hydrates separately from picker metadata (lines 82–85). The audio stub exposes inert menu-safe methods and keeps the interruption callback for transfer to the real engine (`stub.js:8–21`). Exact whole-group loading order requires the manifest, outside this slice.

`GameStore` is a shared persistence seam: its header describes prefixed cached JSON plus uncached raw strings; LSP confirms a broad set of consumers. `SaveSchemaRegistry` declares owner/version/lane/validator metadata (header only). Career directly destructures store/migration services (`career.js:5`), maintains one active career and engagement state (79–82), and delegates stateless draws to `Hash32.unit` (84–95). The identity helper sanitizes a small allowlist of custom-team appearance keys before capture; it can use SettingsExport validation or bounded local fallbacks. Career UI/boot, planning, backup, restore points and season modules are distinct files; their transactional behavior was not audited.

Input's first 70 lines show module-owned held/toggle/edge states and separate free-look axes. Bindings, hold buttons, controller profiles, menu navigation and haptics are extracted peers (headers only). `TiltRoll` is a fully read pure gravity-to-screen-roll helper with modern/legacy screen-angle detection, shared with the phone controller. Steering priority in the input header is truncated in source; the actual arbitration function was not inspected.

UI separates layout/preferences and screens from in-race rendering. `GameHud.create(G)` uses a 100 ms HUD tick; the first 60 lines show viewport invalidation/settling and reduced-motion resolution. Small helpers supply readouts, minimap, tyre/damage/strategy/relative/input displays (headers only). TitleFlow, UiExperience, settings navigation, layers and modal integration remain only partially mapped. Fully read DeepLink strips the consumed query parameter, waits for a bare live title, clicks an existing door, and selects the schedule for next-GP; its retry window is bounded to 40 intervals of 250 ms.

F1API composes a paced F1Transport service with Jolpica and OpenF1 endpoints (`api.js:5–28`), applies endpoint-specific cache TTLs, maps raw results into screen-friendly fields, and computes current year per request. DataHub's actual tab table includes schedule, standings, results, live, telemetry, WATCH & DRIVE and developer GPS export (`hub.js:40–48`). Telemetry is split into controller, model, player, renderer and view files (headers only). External endpoint availability and cancellation behavior were not exercised.

Networking has transport/session/snapshot/game layers plus signalling/lobby UX. NetPlay's opening section defines a 20 Hz publish rate, 100 ms interpolation delay, 10 Hz host AI replication and silence grace rules. It distinguishes reliable events and clamps finite incoming car fields before using them (`netplay.js:33–81`). Fully read NetSpectate centralizes driver/spectator roles and publish permission. The rest of wire encoding, clocks, authority and reconnect behavior remains unreviewed.

Audio is deliberately lazy. WebAudio engine/soundtrack/signal/radio-FX modules are separate from browser speech synthesis; `radio-voice.js:3–9` explains that speech has no AudioContext node and cannot inherit the WebAudio gain/limiter. CarSfx reads player car/pit/wet state and sends bounded levels to GameAudio, suppressing replayed pit edges after race-clock rewind. Layer lifetime/performance claims elsewhere are comments rather than measured evidence here.

## File-by-file coverage

**Fully read** means the complete current file appeared in a bounded read. **Partial** means only the named opening range. **Header only / body unread** means the opening comment or first lines were sampled; it does not establish implementation. An initial 12-line inventory response was truncated, so no middle section of that response is counted as body coverage. A subsequent shorter header listing also had a small data-section omission; those files are conservatively marked inventory only below.

| File | Lines | Coverage |
|---|---:|---|
| `js/core/clipboard.js` | 85 | Header only; body unread |
| `js/core/dev-flags.js` | 117 | Header only; body unread |
| `js/core/dom-apply.js` | 59 | Header only; body unread |
| `js/core/hash32.js` | 31 | Fully read |
| `js/core/i18n-pseudo.js` | 34 | Header only; body unread |
| `js/core/i18n.js` | 300 | Header only; body unread |
| `js/core/lazy-bundles.js` | 842 | Partial: 1–85 |
| `js/core/log.js` | 210 | Header only; body unread |
| `js/core/mat4.js` | 98 | Header only; body unread |
| `js/core/menu-sheet-gate.js` | 127 | Header only; body unread |
| `js/core/native-download.js` | 173 | Header only; body unread |
| `js/core/native.js` | 79 | Header only; body unread |
| `js/core/save-schema-registry.js` | 252 | Header only; body unread |
| `js/core/script-loader.js` | 254 | Header only; body unread |
| `js/core/store.js` | 878 | Header only; body unread |
| `js/core/wake-lock.js` | 58 | Fully read |
| `js/ui/a11y-opts.js` | 206 | Header only; body unread |
| `js/ui/appearance-opts.js` | 589 | Header only; body unread |
| `js/ui/appearance-studio.js` | 355 | Header only; body unread |
| `js/ui/aria-state.js` | 228 | Header only; body unread |
| `js/ui/captions.js` | 268 | Header only; body unread |
| `js/ui/condition-cue-controls.js` | 29 | Header only; body unread |
| `js/ui/controller-profile-controls.js` | 27 | Header only; body unread |
| `js/ui/css-zoom.js` | 65 | Header only; body unread |
| `js/ui/cvd-palette.js` | 173 | Header only; body unread |
| `js/ui/debris-opts.js` | 63 | Header only; body unread |
| `js/ui/deep-link.js` | 50 | Fully read |
| `js/ui/dock-layout.js` | 333 | Header only; body unread |
| `js/ui/dom.js` | 63 | Header only; body unread |
| `js/ui/driving-line-opts.js` | 81 | Header only; body unread |
| `js/ui/editor-workspace.js` | 125 | Header only; body unread |
| `js/ui/experience.js` | 601 | Header only; body unread |
| `js/ui/flags.js` | 198 | Header only; body unread |
| `js/ui/home-world.js` | 177 | Header only; body unread |
| `js/ui/hud-arrange.js` | 614 | Header only; body unread |
| `js/ui/hud-damage.js` | 77 | Header only; body unread |
| `js/ui/hud-elements.js` | 273 | Header only; body unread |
| `js/ui/hud-inputs.js` | 259 | Header only; body unread |
| `js/ui/hud-layout.js` | 1,355 | Header only; body unread |
| `js/ui/hud-minimap.js` | 287 | Header only; body unread |
| `js/ui/hud-readouts.js` | 308 | Header only; body unread |
| `js/ui/hud-relative.js` | 339 | Header only; body unread |
| `js/ui/hud-skin.js` | 86 | Header only; body unread |
| `js/ui/hud-strategy.js` | 201 | Header only; body unread |
| `js/ui/hud-tyres.js` | 88 | Header only; body unread |
| `js/ui/hud.js` | 2,541 | Partial: 1–60 |
| `js/ui/key-binds.js` | 692 | Header only; body unread |
| `js/ui/layers.js` | 401 | Header only; body unread |
| `js/ui/live-region.js` | 110 | Header only; body unread |
| `js/ui/loading-screen.js` | 998 | Header only; body unread |
| `js/ui/menu-nav.js` | 655 | Header only; body unread |
| `js/ui/modal.js` | 381 | Header only; body unread |
| `js/ui/onboard.js` | 192 | Header only; body unread |
| `js/ui/pause-opts.js` | 235 | Header only; body unread |
| `js/ui/photo-studio.js` | 761 | Header only; body unread |
| `js/ui/platform-session.js` | 488 | Header only; body unread |
| `js/ui/post-fx-opts.js` | 83 | Header only; body unread |
| `js/ui/quali-sheet.js` | 86 | Header only; body unread |
| `js/ui/race-message-history.js` | 59 | Header only; body unread |
| `js/ui/race-mix-controls.js` | 43 | Header only; body unread |
| `js/ui/results-sheet.js` | 859 | Header only; body unread |
| `js/ui/results-story.js` | 58 | Header only; body unread |
| `js/ui/save-health.js` | 167 | Header only; body unread |
| `js/ui/scale.js` | 305 | Header only; body unread |
| `js/ui/screen-looks.js` | 648 | Header only; body unread |
| `js/ui/scroll-fade.js` | 297 | Header only; body unread |
| `js/ui/select-screen.js` | 1,540 | Header only; body unread |
| `js/ui/setting-deps.js` | 449 | Header only; body unread |
| `js/ui/setting-row.js` | 233 | Header only; body unread |
| `js/ui/settings-export.js` | 1,348 | Header only; body unread |
| `js/ui/settings-search.js` | 255 | Header only; body unread |
| `js/ui/settings-tabs.js` | 335 | Header only; body unread |
| `js/ui/share-code.js` | 469 | Header only; body unread |
| `js/ui/sheet-shape.js` | 798 | Header only; body unread |
| `js/ui/survey-hud.js` | 234 | Header only; body unread |
| `js/ui/title-flow.js` | 203 | Header only; body unread |
| `js/ui/title-fx.js` | 297 | Header only; body unread |
| `js/ui/title-layout.js` | 545 | Header only; body unread |
| `js/ui/title-menu.js` | 250 | Header only; body unread |
| `js/ui/track-maps.js` | 675 | Header only; body unread |
| `js/ui/update-check.js` | 276 | Header only; body unread |
| `js/ui/watch-transport.js` | 168 | Header only; body unread |
| `js/input/bindings.js` | 319 | Header only; body unread |
| `js/input/controller-profiles.js` | 65 | Header only; body unread |
| `js/input/haptics.js` | 213 | Header only; body unread |
| `js/input/hold-buttons.js` | 211 | Header only; body unread |
| `js/input/input.js` | 2,624 | Partial: 1–70 |
| `js/input/pad-menu.js` | 286 | Header only; body unread |
| `js/input/phone-pad.js` | 1,215 | Header only; body unread |
| `js/input/steer-tuning.js` | 876 | Header only; body unread |
| `js/input/tilt-roll.js` | 48 | Fully read |
| `js/career/ai-dev.js` | 194 | Header only; body unread |
| `js/career/badges.js` | 141 | Header only; body unread |
| `js/career/career-backup.js` | 997 | Header only; body unread |
| `js/career/career-planning-ui.js` | 91 | Header only; body unread |
| `js/career/career-planning.js` | 140 | Header only; body unread |
| `js/career/career-ui-boot.js` | 119 | Header only; body unread |
| `js/career/career-ui.js` | 1,770 | Header only; body unread |
| `js/career/career.js` | 2,028 | Partial: 1–95 |
| `js/career/custom-team.js` | 434 | Header only; body unread |
| `js/career/experience.js` | 191 | Header only; body unread |
| `js/career/regulations.js` | 119 | Header only; body unread |
| `js/career/restore-points.js` | 181 | Header only; body unread |
| `js/career/save-migrate.js` | 418 | Header only; body unread |
| `js/career/season-cal.js` | 717 | Header only; body unread |
| `js/career/season-ui.js` | 304 | Header only; body unread |
| `js/career/team-identity.js` | 32 | Fully read |
| `js/data/api-transport.js` | 484 | Header only; body unread |
| `js/data/api.js` | 548 | Partial: 1–95 |
| `js/data/circuit-lore.js` | 276 | Inventory only; body unread (header output truncation) |
| `js/data/driver-ratings.js` | 154 | Inventory only; body unread (header output truncation) |
| `js/data/export.js` | 330 | Inventory only; body unread (header output truncation) |
| `js/data/flyby-overrides.js` | 144 | Inventory only; body unread (header output truncation) |
| `js/data/garage-defaults.js` | 115 | Inventory only; body unread (header output truncation) |
| `js/data/hub.js` | 825 | Partial: 1–70 |
| `js/data/legends.js` | 498 | Inventory only; body unread (header output truncation) |
| `js/data/live.js` | 437 | Inventory only; body unread (header output truncation) |
| `js/data/real-race-tab.js` | 1,186 | Inventory only; body unread (header output truncation) |
| `js/data/results.js` | 388 | Inventory only; body unread (header output truncation) |
| `js/data/schedule.js` | 279 | Inventory only; body unread (header output truncation) |
| `js/data/settings-defaults.js` | 95 | Inventory only; body unread (header output truncation) |
| `js/data/standings.js` | 141 | Inventory only; body unread (header output truncation) |
| `js/data/tab-utils.js` | 27 | Fully read |
| `js/data/teams.js` | 395 | Header only; body unread |
| `js/data/telemetry-model.js` | 351 | Header only; body unread |
| `js/data/telemetry-player.js` | 313 | Header only; body unread |
| `js/data/telemetry-render.js` | 377 | Header only; body unread |
| `js/data/telemetry-view.js` | 443 | Header only; body unread |
| `js/data/telemetry.js` | 436 | Header only; body unread |
| `js/net/bytes.js` | 58 | Header only; body unread |
| `js/net/handshake.js` | 384 | Header only; body unread |
| `js/net/lobby-codes.js` | 294 | Header only; body unread |
| `js/net/lobby-roster.js` | 82 | Header only; body unread |
| `js/net/lobby-settings.js` | 157 | Header only; body unread |
| `js/net/lobby.js` | 2,293 | Header only; body unread |
| `js/net/netplay.js` | 1,484 | Partial: 1–100 |
| `js/net/nostr.js` | 538 | Header only; body unread |
| `js/net/qr.js` | 337 | Header only; body unread |
| `js/net/rendezvous.js` | 454 | Header only; body unread |
| `js/net/scan.js` | 226 | Header only; body unread |
| `js/net/sdp.js` | 341 | Header only; body unread |
| `js/net/session.js` | 381 | Header only; body unread |
| `js/net/snapshot.js` | 398 | Header only; body unread |
| `js/net/spectate.js` | 23 | Fully read |
| `js/net/transport.js` | 930 | Header only; body unread |
| `js/audio/announcer-recorded.js` | 83 | Header only; body unread |
| `js/audio/announcer.js` | 891 | Header only; body unread |
| `js/audio/battle-earcon.js` | 124 | Header only; body unread |
| `js/audio/car-sfx.js` | 65 | Fully read |
| `js/audio/crowd.js` | 455 | Header only; body unread |
| `js/audio/driving-cues.js` | 260 | Header only; body unread |
| `js/audio/engine.js` | 3,342 | Header only; body unread |
| `js/audio/ers-layer.js` | 246 | Header only; body unread |
| `js/audio/music-lib.js` | 390 | Header only; body unread |
| `js/audio/panel.js` | 1,023 | Header only; body unread |
| `js/audio/race-mix-audition.js` | 58 | Header only; body unread |
| `js/audio/radio-fx.js` | 605 | Header only; body unread |
| `js/audio/radio-voice.js` | 1,004 | Header only; body unread |
| `js/audio/rivals.js` | 359 | Header only; body unread |
| `js/audio/signal.js` | 242 | Header only; body unread |
| `js/audio/soundtrack.js` | 618 | Header only; body unread |
| `js/audio/spotify.js` | 1,483 | Header only; body unread |
| `js/audio/stub.js` | 143 | Partial: 1–65 |
| `js/audio/tone-model.js` | 138 | Header only; body unread |
| `js/audio/voice-pack.js` | 418 | Header only; body unread |

## LSP evidence

Attached LSP tools were discoverable, but this slice used the checkout's documented shell fallback (local source identity is explicit):

- `bash tools/mcp/lsp-mcp.sh outline js/core/lazy-bundles.js --limit=18` — successful exit; reports IIFE `LazyBundles` at line 3 with exported `create` at line 5.
- `bash tools/mcp/lsp-mcp.sh refs GameStore.store --files --limit=12` — successful exit; reports **176 references in 60 files**. File counts include settings export 12, input 7, career UI 4, Spotify 3 and core i18n 2; references cross the assigned directory boundary. The files-mode response returned all 60 file rows despite the requested limit. This is dependency evidence, not proof that every use is correct.

No diagnostics run: no JavaScript changed. No definitions/callers evidence beyond the above queries.

## Comment findings with proof

1. **Confirmed stale tab list:** `js/data/hub.js:1` lists SCHEDULE / STANDINGS / RESULTS / LIVE / TELEMETRY / EXPORT, while the actual table at lines 40–48 additionally registers `race`, labelled WATCH & DRIVE. The introductory inventory omits a shipped code path. No source fix made because this task is mapping only.
2. **Source comments are sometimes intentionally abbreviated:** `js/input/input.js:1`, `js/career/career.js:1`, `js/net/netplay.js:1` and `js/ui/hud.js:1` end with a literal ellipsis mid-description. These cannot be used as complete contracts; the report uses concrete opening code where available.
3. **Verified local rationale:** wake-lock comment at `js/core/wake-lock.js:1–2` promises late-release and sentinel identity protection; lines 24–40 explicitly test wanted/hidden state and lock identity. This bounded implementation supports the rationale, without establishing device behavior.
4. **Explicit unresolved native assumption:** `js/core/native-download.js:9–10` calls its seven-day retention grace provisional and asks for real-device validation. The retention implementation was not read, so this is an authored limitation, not a newly diagnosed bug.
5. **Audio boundary is explicit:** `js/audio/radio-voice.js:3–9` documents why speech synthesis has independent failure/unlock/routing behavior. Only its opening rationale was read; muting behavior across the full feature remains unverified.

## Risks/unknowns

Only 8 small files were fully read; large controllers (HUD 2,541 lines, input 2,624, career 2,028, lobby 2,293, audio engine 3,342) retain substantial unread bodies. Inventory filenames and comments are navigation evidence, not confirmed end-to-end features. Script order, shell DOM IDs, G type contract, lifecycle call sites, validation tests, external service policy, multiplayer topology and all runtime/browser behavior require separate inspection. No defect is inferred merely from file size. Native, phone, Spotify, speech and wake-lock support are particularly platform-dependent. No credentials or save values were inspected or recorded.

## Next steps

1. Read manifest edges and the G type contract alongside targeted LSP definitions/callers before changing cross-system integration.
2. For a concrete feature, inspect its controller's exported functions and bounded call chain, then the matching tests; avoid treating this inventory as full review coverage.
3. Correct the DataHub introductory tab list in a separate source change if requested; validate with the repository's scoped checks.
4. Perform parent-owned browser verification only when a runtime claim is required, with source/build/viewport identity recorded.
