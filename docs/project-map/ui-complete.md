# UI complete-read ledger

Status: **in progress; not a complete UI review**. Inventory: 66 files, 25,652 lines in `js/ui/` on 2026-10-27. `AGENTS.md` and `.claude/skills/code-nav/SKILL.md` read. Only this report is edited; no source edits, browser runs, commits, or permission flags.

The full ranges below were displayed and read, including comments and private implementation. A combined read truncated `results-story.js` / `save-health.js`; both were reread separately in full. LSP references were queried for every module in this completed batch (`files: true`, full output); window globals explicitly use the LSP's labelled text fallback. Counts include declarations/exports, so absence of external references does not establish dead code for self-starting modules.

## Fully read batch 1

| File (`js/ui/`) | Full lines | Contract and behavior | LSP consumer files outside itself |
|---|---:|---|---|
| a11y-opts.js | 1–206 | Frozen preference module; focus high by default; colourblind cues off; per-action hold/toggle. Applies at evaluation; mounts SettingRow controls on DOM readiness. `compoundLetter`, `cuesOn`, getters/setters/apply helpers exposed. | hud-tyres, select-screen, data/hub, hud-readouts |
| aria-state.js | 1–228 | Self-starting window global; mirrors active/on sibling option buttons into aria-pressed without overwriting explicit semantics; escapes ON/OFF wrapping; hash current link and slider valuetext. Menu-only mutation scopes coalesce via timeout. Exposes sync/wrapOnOff. | none |
| condition-cue-controls.js | 1–29 | `create(store,host)` mounts explicit condition-aware estimate checkbox; applies to BrakeCue/DrivingCues and subscribes to store; returns refresh/dispose. | game |
| controller-profile-controls.js | 1–27 | `create(o)` shows current physical controller profile/reset; input owns device selection; responds to connection/profile events; returns refresh/dispose. | game |
| css-zoom.js | 1–65 | Cached visual-rect probe for old WebKit; `of`, viewportRect/localRect/localBox/toLocalDelta define visual/local unit boundary. | garage/setup-camera, menu-nav, sheet-shape, data/telemetry-player, dock-layout, experience |
| debris-opts.js | 1–63 | Raw `apex26.debris` string 1/0; `on/set/initUI`; saved switch and live DebrisWorld.setEnabled half; initializes settings silently. | none |
| deep-link.js | 1–50 | `parse/create/DOORS`; consumes and removes go query; bounded retry until bare title; clicks authorized title door; nextgp selects schedule after hub mounts. | title-flow |
| dom.js | 1–63 | Shared safe text node builder; cached trusted-constant fold HTML; rounded lap and race clocks (whole-second clock floors). No game state. | audio/panel, results-sheet, career/experience, input/steer-tuning, quali-sheet, watch-transport, data/results, results-story, career/career-planning-ui, career/career-ui, career/season-ui, data/hub, data/telemetry-view, editor/designer |
| driving-line-opts.js | 1–81 | Eval-time palette/opacity; persistent lineBrakeCue distinct from steering numeric brakeCue; migrates only legacy string flag. `brakeCue/setBrakeCue/initUI` plus keys. | game |
| editor-workspace.js | 1–125 | WeakMap-idempotent attach/init; common toolbar preview/tools disclosure. Domain keeps save/preview ownership; captures settings origin and restores on close, including nested flyby/freecam suspension. | game |
| hud-damage.js | 1–77 | Quantized damage visual/signature with per-part rounded percentages and spoken label; `paint/sync/level/text/label`; sync at HUD 10Hz; display only. | hud |
| hud-skin.js | 1–86 | skinAccent(team,G) delegates appearance overrides; lets known constructor CSS own accent; picks WCAG ink for runtime custom team colors using root text/background tokens. | hud |
| hud-tyres.js | 1–88 | Pure heat bands ±.55 window and spoken tyre lifespan; paint writes changed temperature, colourblind letter, accessible label. | hud |
| live-region.js | 1–110 | One writer for announce-live: flag > penalty > save > radio > HUD; 60ms beat/1200ms hold, four queued max, stale HUD/radio pruning and higher-priority preemption. `say/reset/state`. | hud, select-screen, race/announce-banner, hud-readouts, settings-search, update-check, game |
| post-fx-opts.js | 1–83 | Cached raw AO/godray switches; gate zeroes every strength required to skip pass; look governor shed also zeroes flare/bloom; settings wire silently. | game |
| quali-sheet.js | 1–86 | create(G) → build/open/close; renders model order without timing/order ownership; thousandth timing, DRIVEN rivals and durable-in-open-sheet pole badge. | game |
| race-message-history.js | 1–59 | create(G) transcript of delivered race/count/quali cards only, max20; quiet refresh updates matching last entry without timestamp reset; pause fold render/clear/mount/rows. | game |
| race-mix-controls.js | 1–43 | create(G,host) explicit current-setting audition; availability/mute/error states; stops on hidden/visibility/mute/dispose; subscriptions removed. | game |
| results-story.js | 1–58 | summary/render from canonical verdict and supplied points; no save/timers/gap guesses; practice unscored, duel excludes podium, classified retiree points respect DSQ. | results-sheet |
| save-health.js | 1–167 | inspect categorizes UTF16 local sizes, origin estimate, failed writes/mirror policy/restore health; cleanup only API/realrace response caches; on-demand restore preview/token confirmation/durable reload. `inspect/cleanup/mount/category`. | settings-export, select-screen |
| watch-transport.js | 1–168 | create(G,replay) → start/stop/paint/tick; replay owns clock/camera. Accessible play/event/speed/driver/camera/director/photo/timeline/chapters; negative preroll; rAF coalesced scrub; chapter drops pending scrub; write-on-change at .1s. | race/real-replay |

## Remaining exact coverage

Every file in the following table remains **unread in full**. No partial coverage is claimed. Continue with bounded chunks (roughly ≤200 lines or ≤5,000 output tokens) and query LSP contracts/consumers per module. Append findings and move each completed file to the completed section.

| File | Remaining lines |
|---|---:|
| `js/ui/appearance-opts.js` | 1–589 |
| `js/ui/appearance-studio.js` | 1–355 |
| `js/ui/captions.js` | 1–268 |
| `js/ui/cvd-palette.js` | 1–173 |
| `js/ui/dock-layout.js` | 1–333 |
| `js/ui/experience.js` | 1–601 |
| `js/ui/flags.js` | 1–198 |
| `js/ui/home-world.js` | 1–177 |
| `js/ui/hud-arrange.js` | 1–614 |
| `js/ui/hud-elements.js` | 1–273 |
| `js/ui/hud-inputs.js` | 1–259 |
| `js/ui/hud-layout.js` | 1–1355 |
| `js/ui/hud-minimap.js` | 1–287 |
| `js/ui/hud-readouts.js` | 1–308 |
| `js/ui/hud-relative.js` | 1–339 |
| `js/ui/hud-strategy.js` | 1–201 |
| `js/ui/hud.js` | 1–2541 |
| `js/ui/key-binds.js` | 1–692 |
| `js/ui/layers.js` | 1–401 |
| `js/ui/loading-screen.js` | 1–998 |
| `js/ui/menu-nav.js` | 1–655 |
| `js/ui/modal.js` | 1–381 |
| `js/ui/onboard.js` | 1–192 |
| `js/ui/pause-opts.js` | 1–235 |
| `js/ui/photo-studio.js` | 1–761 |
| `js/ui/platform-session.js` | 1–488 |
| `js/ui/results-sheet.js` | 1–859 |
| `js/ui/scale.js` | 1–305 |
| `js/ui/screen-looks.js` | 1–648 |
| `js/ui/scroll-fade.js` | 1–297 |
| `js/ui/select-screen.js` | 1–1540 |
| `js/ui/setting-deps.js` | 1–449 |
| `js/ui/setting-row.js` | 1–233 |
| `js/ui/settings-export.js` | 1–1348 |
| `js/ui/settings-search.js` | 1–255 |
| `js/ui/settings-tabs.js` | 1–335 |
| `js/ui/share-code.js` | 1–469 |
| `js/ui/sheet-shape.js` | 1–798 |
| `js/ui/survey-hud.js` | 1–234 |
| `js/ui/title-flow.js` | 1–203 |
| `js/ui/title-fx.js` | 1–297 |
| `js/ui/title-layout.js` | 1–545 |
| `js/ui/title-menu.js` | 1–250 |
| `js/ui/track-maps.js` | 1–675 |
| `js/ui/update-check.js` | 1–276 |

Completed: 21/66 files, 1962/25,652 lines. Remaining: 45 files, 23690 lines.
