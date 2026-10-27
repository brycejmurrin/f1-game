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

## Active assignments
- finish_render_shared: all shared renderer and renderer selection/boot, reading complete, report pending.
- finish_track_engine: all js/track engine source.
- finish_ui_a: eight appearance/experience UI modules.
- finish_ui_hud: entire HUD UI family, reusing exact completed prior files.
- finish_audio: all js/audio.
- finish_editor: all js/editor.

## Persistence checkpoint
Draft PR https://github.com/brycejmurrin/f1-game/pull/3922. Separate report commits through 64809115e pushed; newer complete reports awaiting next validated checkpoint. coverage.tsv is the per-tracked-file inventory with hashes and conservative status, not an assertion that every inventoried file was read. New complete scope statuses are integrated after reports arrive.

## Remaining backlog
js/render backends/shared, track/circuits/scenery, UI, garage, lighting/fx, agent/overlay/share/workers/xr, CSS/index and remaining root runtime/shell files; tools/tests; current and historical docs; assets/vendor; tracked and relevant retained artifacts/scratch. Initial seven maps contain explicit partial/unread file tables. None of these scopes is complete merely because its initial map exists.

## Verification and persistence
Parent serializes report integration and commits. New reports need docs-integrity and agent-config checks. Existing checkpoint passed 74/74. Agents created under an earlier read-only policy may remain EROFS even after parent access restored; parent writes their supplied text. Never claim completion while backlog remains.
