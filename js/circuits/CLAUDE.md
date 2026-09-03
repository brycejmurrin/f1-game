# js/circuits/ — circuit DATA only

40 circuit definition files. Engine behaviour lives in `js/track/` — if a fix
needs code, it goes there; these files carry layout, palette, theme, metadata,
and the `scenery(api)` callback (reference: `docs/SCENERY-API.md`).

- **Script-tag order == `Tracks.LIST` == picker order.** Adding a circuit is
  the full new-file lockstep (root AGENTS.md) — tag position matters.
- **Frac-keyed tables respect `def._sceneryShift`** — the engine consumes
  them via the compensated idiom; write fracs in the def's own frame and
  never pre-compensate by hand.
- After ANY edit: `node tools/verify-track.cjs <id>` FIRST (2 s), then the
  groups `node tools/ci/pick-tests.mjs` names. A misplaced prop or terrain
  reading usually means a raw-frac mistake, not a geometry bug.
