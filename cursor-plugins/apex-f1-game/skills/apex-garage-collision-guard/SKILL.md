---
name: Apex garage collision guard
description: >-
  Use before any Apex garage work to avoid colliding UI chrome, car mesh, and
  GarageDefaults agents/PRs.
---
# Apex garage collision guard

Use before launching or steering any garage-related cloud agent or UI/Cars work that touches garage.

## Ownership
- **UI Survey** — garage sheet chrome, tabs layout, dismiss/scroll (not part ids)
- **Cars** — meshes, wings, liveries presentation, garage lighting presentation
- **Defaults agent / Grok Bot** — shipping `GarageDefaults` / apex26-garage-v1 export (#1021 lane)
- **CI Watch** — merge only

## Before launch
1. List open PRs whose titles/branches mention garage, livery, headrest, chrome, defaults.
2. If a garage-chrome PR is already open, do **not** launch another chrome agent — `reply` to the existing one.
3. If GarageDefaults (#1021 or successor) is open, UI must not rewrite default parts/liveries.
4. Cap Cars cloud agents at 4 unless the user asks for more.

## Conflict response
- Duplicate chrome → steer/stop the newer agent; keep one PR.
- Mesh vs chrome overlap → split: Cars owns 3D, UI owns CSS/DOM sheet.
