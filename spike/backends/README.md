# WGX/TLX spike — re-attached

WGX and TLX were temporarily moved out of the shipped tree during Phase 2b of
the 2026-09 restructure. Both backends, their tests, tools, rules, skills, and
vendored three.js files are now back in their normal source locations.

The original spike-out inventory is retained as a non-executable historical
record at [`docs/archive/moves/spike-backends.json`](../../docs/archive/moves/spike-backends.json).
It uses `appliedMoves`, not the live `moves` schema accepted by
`tools/gen/move-tree.mjs`, so accidentally running the completed plan cannot
move the active renderers out of the product again.

Current renderer ownership and verification live in `docs/ARCHITECTURE.md`,
`AGENTS.md`, and `.claude/rules/render-{wgx,tlx}.md`.
