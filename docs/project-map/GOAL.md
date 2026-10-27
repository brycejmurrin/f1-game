# Complete project mapping goal

## User goal
Read every file in the requested root areas, map source relationships with LSP, identify evidence-backed comment cleanup, and commit reports. Use GPT-6.1 Sol agents. Source fixes are separate from mapping.

## Completion rules
A complete source read requires every line visible in nontruncated chunks. Header scans, outlines and inventory are partial. LSP references corroborate contracts but do not establish runtime behavior. Binary assets require metadata/provenance and usage inspection rather than a fictional line read. Generated/vendor/history content must retain provenance. Secret and browser profile contents are excluded.

## Source
Branch cursor/project-map-a84f, source ae73c6766, first report checkpoint c4dc493d9. Current complete reads below are bound to unchanged runtime source.

## Current complete source passes
- js/core: 16 files / 3,597 lines; core-complete.md.
- js/physics: 20 files / 8,454 lines; physics-complete.md.
- js/race: 41 files / 14,098 lines; race-complete.md.
- js/net and js/input: 25 files / 14,237 lines; net-input-complete.md.
- js/data and js/career: 38 files / 16,118 lines; data-career-complete.md.
- js/camera: 28 files; camera-complete.md.
- js/car: 24 files; car-small-complete.md and car-large-complete.md.
- js/perf: 20 files / 7,277 lines; perf-complete.md.
- game.js: all 9,554 lines; game-boot/middle/tail-complete.md.
- js/render/glx: 10 files / 10,485 lines; glx-complete.md.
- js/render/three and webgpu: backend/subsystem files plus all shader leaves; three-complete.md, webgpu-complete.md, shaders-complete.md (initial pending shader rows are satisfied by the latter).

## Additional completed source passes
- js/ui: all66 files; initial21 plus ui-a/hud/c/d/e-complete.md (three initial HUD files intentionally reread).
- js/editor and js/audio: all20 files each; editor-complete.md and audio-complete.md.
- js/track: all28 /16,090 lines; track-engine-complete.md plus track-tail-complete.md (initial pending rows satisfied by tail report).
- js/circuits definitions: all52; circuit-defs-complete.md.
- js/garage: all22; garage-complete.md.
- js/lighting and js/fx: all15; lighting-fx-complete.md plus light-presets-complete.md (initial pending preset rows satisfied).
- js/agent, overlay, share, workers, xr: all25; agent-misc-complete.md.
- css: all34; css-a-complete.md plus css-b-complete.md.
- Root shell/config/roster/types: all13 scoped files; root-shell-complete.md.
- Circuit scenery: all four groups A/B/C/D fully read and reported.

## Runtime milestone
Every tracked JavaScript file under js/ is fully read: **561/561**. All34 CSS files, root shell/roster/type scope, and all95 platform files are mapped (59 fully read text files plus36 inspected binaries). Source reading does not establish browser/GPU correctness. The full project goal remains open.

## Current wider-project progress
- All582 tracked tools paths fully read across tools-ci/mcp/lib/gen/check/environment/shot/ui-gfx/gfx-tail/car/track/perf-light/misc reports.
- All39 root Markdown guides fully read across docs-root reports.
- All598 changelog fragments fully read; docs-changelog-complete.md.
- Test data221 files complete:214 fully raw-read; seven generated tables structurally traversed,111905 JSON nodes total. Fixture scope35 complete:34 fully raw-read, OpenF1 timing snapshot structurally traversed; tests-data/fixtures-complete reports.
- Test-only IWER vendor bundle complete across two byte groups; tests-vendor-complete.md. Full test-group roster127191 bytes read and56 group contracts mapped; tests-groups-complete.md.
- Manual test scope11 files/1439 lines complete; tests-manual-complete.md. Icons/locale leaves complete:77 PNG metadata, icon guide and both English catalogs read; icons-locales-complete.md. All38 tracked symlinks inspected; symlinks-complete.md. Original tracked-entry inventory is5109 (directory symlinks restored to coverage).
- All182 assets mapped:11 prose/code files fully read,24 generated voice indexes completely parsed/tuple-validated,147 binary resources inspected; assets-complete.md. Generated data is not claimed manually semantically read.
- All62 unit groups complete:1056 files/305161 source lines. Group02 raw gaps closed by02a/b/c; group21 raw gaps closed by21a/b/c/d.
- All57 vendor paths mapped:56 text files fully read; Rapier wrapper source fully read and encoded WASM structurally inspected. All20 vendor continuation groups complete.
- All44 historical-note groups complete; every byte interval of all305 original tracked notes is covered, with source hashes and provenance limits.

## Active/queued assignments and continuation
Use collaboration.list_agents for actual live worker state. Current readers: specs16, archive17, plans05, auxiliary04, tracks03, docs-other04. Complete: browser specs01–15, archive01–16, all .claude01–08, all .github01–03, plans01–04, auxiliary01–03, tracks01–02 and docs-other01–03. Continue specs17, archive18–31, auxiliary05–06, research01–07, examples01–03, snapshot01–08 and retained-source01–03. Own generated mapping outputs are excluded to avoid recursive work; dependencies/browser profiles/secrets are boundary metadata, not project source. All original tracked entries have completed evidence or an explicit remaining assignment. Start fresh GPT-6.1 Sol agents with fork_turns none and explicit model. Keep at most6 workers plus parent; a seventh worker launch was actually rejected by host.

## Persistence checkpoint
Draft PR https://github.com/brycejmurrin/f1-game/pull/3922. Separate reports and evidence committed and pushed through1eaaa85cb. Initial143 plus24 plus19 plus15 newer report commits passed the documentation guard. Latest docs/config checks74/74; subsequent docs37 checks and per-commit guards pass. Draft fast CI atf8c43939b passed26 jobs,24 skipped,0 failed (runs40498578383/40498578206). Integrating further completed reports now. Documentation checks are being rerun after correcting report path/Markdown quoting issues; do not treat a failing historical log as latest green. coverage.tsv is source-hash/read-status evidence; own mapping reports are excluded to avoid recursive scope.

## Remaining backlog
Remaining browser spec groups, historical and non-root documentation, auxiliary tracked roots, and relevant retained artifacts/scratch. Runtime, stylesheets, tools, assets, vendor and platform scopes have completed the evidence methods recorded above. Earlier partial maps are superseded by complete domain reports; no initial map alone proves completion.

## Verification and persistence
Parent serializes report integration and commits. New reports need docs-integrity and agent-config checks. Earlier checkpoint passed 74/74; current reports are being checked again. Agents created under an earlier read-only policy may remain EROFS even after parent access restored; parent writes their supplied text. Never claim completion while backlog remains.
