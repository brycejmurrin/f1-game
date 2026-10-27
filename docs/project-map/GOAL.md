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
- Circuit scenery: groups A and B (26 files) complete; groups C/D source reads reported complete, reports still pending.

## Runtime milestone
Every tracked JavaScript file under js/ is fully read: **561/561**. All34 CSS files, root shell/roster/type scope, and all95 platform files are mapped (59 fully read text files plus36 inspected binaries). Source reading does not establish browser/GPU correctness. The full project goal remains open.

## Active assignments
- finish_tools_ci_a/b/c: all82 tools/ci files fully read, reports returned.
- finish_tools_mcp_a/b: split56 MCP infrastructure files; first28 read, remaining reading.
- finish_tools_lib: all54 shared tooling libraries.
- finish_tools_gen: all34 generators.
- finish_tools_environment: all tracked tools/env and tools/environment.
- finish_tests_helpers: all71 test helper files.

## Persistence checkpoint
Draft PR https://github.com/brycejmurrin/f1-game/pull/3922. Separate report commits through 212adc24b are local; earlier64809115e pushed. New runtime/platform/scenery/CI reports are awaiting next validated checkpoint. coverage.tsv records 561/561 runtime JS complete, full reads vs binary metadata vs unread for all tracked files outside these reports.

## Remaining backlog
Tools outside CI and tests; current and historical docs; assets/vendor; tracked and relevant retained artifacts/scratch; other root metadata and unlisted tracked directories. Runtime and stylesheet source has largely completed full-read evidence, but the wider backlog remains open. Initial seven maps contain explicit partial/unread file tables. None of these scopes is complete merely because its initial map exists.

## Verification and persistence
Parent serializes report integration and commits. New reports need docs-integrity and agent-config checks. Existing checkpoint passed 74/74. Agents created under an earlier read-only policy may remain EROFS even after parent access restored; parent writes their supplied text. Never claim completion while backlog remains.
