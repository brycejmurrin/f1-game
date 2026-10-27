# Complete project mapping goal

## User goal
Read every file in the requested root areas, map source relationships with LSP, identify evidence-backed comment cleanup, and commit reports. Use GPT-6.1 Sol agents. Source fixes are separate from mapping.

## Completion rules
A complete source read requires every line visible in nontruncated chunks. Header scans, outlines and inventory are partial. LSP references corroborate contracts but do not establish runtime behavior. Binary assets require metadata/provenance and usage inspection rather than a fictional line read. Generated/vendor/history content must retain provenance. Secret and browser profile contents are excluded.

## Source
Branch cursor/project-map-a84f, source ae73c6766, first report checkpoint c4dc493d9. Current complete reads below are bound to unchanged runtime source.

## Current complete source passes
- js/core: 16 files / 3,597 lines, complete_core; report core-complete.md.
- js/physics: 20 files / 8,454 lines, complete_physics; report physics-complete.md.
- js/net and js/input: 25 files / 14,237 lines, complete_net_input; report net-input-complete.md.
- js/data and js/career: 38 files / 16,118 lines, agent complete_data_career reported completion; detailed report pending integration.
- js/camera: 28 files, complete_car_camera reported completion; detailed report pending integration.
- game.js 1–3000: fully read by complete_core; 3001–6200 assigned complete_physics, 6201–9554 assigned complete_net_input.

## Active assignments
- complete_core: all js/perf after game boot report.
- complete_physics: game middle 3001–6200.
- complete_net_input: game tail 6201–9554.
- complete_car_camera: finish js/car after camera report.
- complete_race: finish all js/race then all js/audio.
- complete_data_career: all js/editor after completed data/career report.

## Remaining backlog
js/render backends/shared, track/circuits/scenery, UI, garage, lighting/fx, agent/overlay/share/workers/xr, CSS/index and remaining root runtime/shell files; tools/tests; current and historical docs; assets/vendor; tracked and relevant retained artifacts/scratch. Initial seven maps contain explicit partial/unread file tables. None of these scopes is complete merely because its initial map exists.

## Verification and persistence
Parent serializes report integration and commits. New reports need docs-integrity and agent-config checks. Existing checkpoint passed 74/74. Agents created under an earlier read-only policy may remain EROFS even after parent access restored; parent writes their supplied text. Never claim completion while backlog remains.
