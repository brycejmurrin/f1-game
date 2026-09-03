# Apex Tools MCP Week-3

**Goal:** Fix dispatch so tree tools are not treated as locked browser tools, then wrap the leftover safe CLIs.

**Fix:** `toolKind()` (`tree` vs `browser`) replaces the week-1 name set. Output paths must resolve under `artifacts/` or `scratch/` (`path_escaped`). `apex_survey_track` emits the default `survey` label when only `fracs` is set.

**Add (tree):** `apex_select_specs`, `apex_assets_verify`, `apex_float_audit`, `apex_clip_audit`, `apex_coplanar_audit`, `apex_track_verts`.

**Add (browser + lock):** `apex_carshot`, `apex_wgx_shot`, `apex_quick_validate` (no port).

**Still not wrapped:** `test-bg`, bump writers, bake writers, TinyFish/chrome passthrough, `graph-parity`, `wgx-gallery`, `select-recall`, HTTP `:3713`.
