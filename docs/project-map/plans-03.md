# Plans map — group 03

Read coverage: 160,000 assigned bytes, across eight plans, in 25 individually returned chunks of at most 8,000 bytes. The first plan continues group 02; its header was additionally read. The last plan stops mid-row and continues group 04. Original whole-file hashes, assigned-part hashes, chunk hashes and the read ledger are in plans-03-evidence.json.

These are historical planning documents, with later status annotations. Proposed designs, source-reported measurements and current static corroboration are distinguished below. No plan instructions were executed. Runtime correctness, device support and performance remain outside this read-only map.

## colourblind-captions

Presentation accessibility: eliminate hue-only meanings and give spoken/cued state labelled captions. Semantic palette IIFE feeding CSS/canvas/shaders; redundant glyphs; caption ring and settings; optional cue glyphs.

Five slices: palette validation, all colour consumers, redundant cues, spotter/announcer captions/settings, optional cue visualiser.

PARTLY SHIPPED; palette and caption APIs exist. LSP palette references only appearance options and itself; complete canvas/shader adoption not established. Caption consumers include announcer, spotter, announce-banner and appearance settings.

22-semantics/9-colour-only inventory and contrast, shader, layout budgets are dated 2026-10-04 evidence, not measurements repeated here.

Extends deferred accessibility brainstorm item 13 and player accessibility slice 5; preserves separate physics contracts.

## feature-roadmap

Rank missing product capabilities across six research angles. Tier 1 six individual plans, Tier 2 deeper racing, Tier 3 risky larger bets.

Suggested share cards then overlay then reel; PWA/accessibility independent; localisation serialised against large UI work.

OPEN ranking; partly or fully shipped child status labels require per-plan scope checking.

Research provenance explicitly mixed: repo inventory with two corrected errors; several search snippets and background support claims; no new market measurements.

Coordinates six October 4 plans; links older mechanics/AI/strategy work and later fair-play plan. Deferred serverless leaderboard depends on determinism evidence.

## highlight-reel-clip-export

Twenty-second pose ring cannot retain a whole race highlight story or export video. Read-only event journal taps RaceFacts through RaceRadio; scored capped clip vault; pure scorer/planner; reel player; feature-detected WebCodecs plus muxer or MediaRecorder fallback.

Three slices: in-game reel, encoding/audio/vendor/backend resize, sharing polish; manual device gates.

OPEN; no matching reel/vault/encoder files found in static JS filename inventory. Historical unused journal stub was deleted per status.

Historical pose sizes, memory estimates, support research and licensing claims are source assertions; encoder throughput, OBS/device behavior and music redistribution remain unverified.

Extends broadcast-feel results-highlight slice C, reuses camera kit and replay discontinuity contract; constrained by memory plan and share-card delivery precedent.

## localisation

English text is scattered through DOM, JS sinks and template concatenations. Gettext-style inline English fallback, lazy hashed JSON, ICU-lite plurals and Intl helpers; DOM applier; pseudo locale; lint and migrated-surface guard.

Ten slices: foundation/picker/cache, lint, pseudo matrix, menus, HUD/results, Garage, Career/Data, captions, voice fallback, reviewed locale waves.

PARTLY SHIPPED: I18n APIs and DOM applier exist; locale manifest contains only English with two keys. LSP consumers establish DOM applier; no full screen migration or picker claim.

Historical counts (422 JS files, 427 concatenations, etc.) and language-market ranking are dated, heuristic provenance; no fresh full inventory.

Uses UI-MAP screen inventory, accessibility settings seam and radio template/voice-latency research. RTL and multilingual Kokoro deferred.

## pwa-shortcuts-calendar

Installed app lacks direct doors and external calendar reminders. Manifest shortcuts and allowlisted deep-link consumer; cached schedule countdown; proposed UTC RFC5545 builder, optional static CI feed and install capability evaluations.

Four slices: shortcuts, countdown/sessions, client-side calendar, optional feed or launch/share handling.

PARTLY SHIPPED: manifest has five shortcuts including controller; DeepLink stages existing title buttons and retries while gates block title. Schedule countdown has visibility/disconnect cleanup. Calendar export not established.

Historical feed response, TTL/rate/terms and calendar-client UID/VALARM behavior remain dated external assertions; no network or client import performed.

Reuses Data Hub schedule/cache and ghost-file conventions; distinguishes real calendar from in-game season; optional feed depends on deployment staging and attribution.

## share-cards

Text shares lack portable result images and compact staging links. Pure serialisable card model and layout ops; shared PNG painter/font/QR/delivery layer; proposed short card-link envelope.

Four slices: daily/shared renderer, race/season/career, ghost chart/staging, preview/sizes/a11y.

Status says SHIPPED; static files and ShareCard rendering support infrastructure. LSP only identifies DailyChallenge as external ShareCard consumer; all five planned card integrations not substantiated. Actual module home is share directory, diverging from proposed UI home.

Historical budgets and canvas/API compatibility are plan evidence; no image rendering/device sharing performed.

Builds on player-accessibility text share envelopes, designer PNG precedent, Photo Studio and GhostShare; ghost samples deliberately remain outside QR card links.

## stream-overlay

Creators need transparent graphics composited over gameplay from a separate OBS page. Transport-blind pure feed schema and DOM painter; proposed 4Hz publisher, same-browser BroadcastChannel fallback and passive WebRTC/Nostr bridge.

Four slices: demo/schema/painter, same-browser publisher, passive peer transport, polish/docs.

Status says SHIPPED but static page loads feed/render/broadcast/TV graphics only. Non-demo boot paints waiting frame and returns; demo uses a 250ms interval. No overlay publisher/bridge files in inventory. Thus shipped demo infrastructure is narrower than complete live OBS goal.

OBS profile separation and WebRTC support were explicitly unproven; 3% CPU target is a proposed acceptance criterion, not a measurement.

Separate surface from broadcast camera plan; passive PhonePad-style side-channel proposal must not occupy netplay grid seats.

## bug-hunt-plan

Read-only 13-reviewer audit at 64dd7a8 found lifecycle/input/per-frame defects. Subsystem batches each paired with targeted unit/VM pin and verification plan; first four prioritised, performance batch later, product decisions isolated.

Assigned prefix covers persistence/Garage batch 1 and lazy-boot batch 2 through partial row 2.6; remainder belongs to group04.

Status says SHIPPED via next-day fix-all plan; source explicitly says rows not reverified 2026-10-26. This map makes no per-row fix correctness claim.

Historical verified/repro labels distinguish coordinator source reread from Node/VM reproductions. Fuzz query counts and clean-subsystem conclusions are inherited audit claims, not rerun.

Subsequent fix-all plan is implementation handoff/superseding execution register; BUGS and defect ledger were dedupe inputs. Historical scratch reproducer references are preserved in JSON only.

## Cross-plan consumers and maintenance

The roadmap is the portfolio entry point. Share-card infrastructure is a delivery precedent for the open reel plan; localisation and captions meet at radio text, while the palette plan extends prior accessibility work. PWA work shares Data Hub schedule ownership. The overlay uses broadcast timing semantics but is a separate page and transport proposal. The bug-hunt document is a historical defect register, not a current actionable queue.

Static LSP navigation corroborated the named module APIs and their callers. Captions reaches announcer, spotter, announce-banner and appearance settings; DeepLink reaches title flow; I18n reaches the DOM applier; ShareCard reaches DailyChallenge. Palette-wide renderer adoption, full card-model rollout and live overlay transport are not established by these callers. The overlay non-demo path explicitly waits for a feed.

Cleanup candidates are documentary: qualify shipped labels by completed slice, reconcile proposed module homes with actual share/core homes, retain historical measurements with their dates, and route future implementation through current governing rules rather than copied branch/merge/test instructions. Preserve the bug audit provenance while using its later execution register to find fix history. No cleanup was performed beyond temporary mapping scratch files.

Limits: static corroboration does not prove absence of equivalent code under other names; filename absence is bounded inventory evidence. Tests, browser, network, application runtime, source edits, staging and commits were excluded. Raw historical, proposed and unresolved references remain only in the companion JSON.
