---
name: Apex garage collision guard
description: >-
  Use before any Apex garage work to avoid colliding UI chrome, car mesh, and
  GarageDefaults PRs.
---
# Apex garage collision guard

Use before launching or starting any garage-related Cursor agent or UI/Cars work that touches the garage.

## Ownership
A path in an OPEN PR's diff belongs to that PR until it merges or closes (AGENTS.md §Git branch & deploy). The
split by subsystem (the issue's `area:*` label):
- **UI chrome** — garage sheet chrome, tabs layout, dismiss/scroll (not part ids)
- **Cars** — meshes, wings, liveries presentation, garage lighting presentation
- **Defaults** — shipping `GarageDefaults` / apex26-garage-v1 export (#1021 or its successor)

## Before launch
1. `node tools/ci/pr-board.mjs --json` (or the open-PR matrix): find open PRs whose titles or branches touch
   garage, livery, headrest, chrome or defaults.
2. A garage-chrome PR is already open → do not launch another; comment on that PR or its issue instead.
3. GarageDefaults (#1021 or successor) open → UI must not rewrite default parts or liveries.
4. Launch caps are the dispatcher's (`tools/ci/dispatch.json`, docs/WORKERS.md §The dispatcher), not this skill's.

## Conflict response
- Duplicate chrome → the older claim wins (docs/WORKERS.md §1); the newer one stands down with a comment.
- Mesh vs chrome overlap → split: Cars owns 3D, UI owns CSS/DOM sheet; record the split as a comment on both PRs.
