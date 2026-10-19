# Finish design lab (throwaway branch, not for merge)

Living gallery: https://claude.ai/artifact/GqcJU9VgByuXYzme5Nrwgj (private; republish to the SAME url each round).
`finish-lab.html` is the published source; images are artifact assets (`/_blob/<id>`), never committed.

- Round 4: 18 finishes passed the realism cut and are REAL rows (`FINISH_SURFACE` + `FINISH_RESERVED` in
  `js/car/car-materials.js`, ids 60-85, branched as `surfaceId == N` in GLX / TLX / WGX so `surface-id-parity` and
  `livery-finish-contract` cover them). The other 13 live in `FINISH_PREVIEW`: their branches key on `finishId`, the
  garage never offers them, only the whole-car `applyFinish` path takes them for the shoot. Verdicts: `finishes.json`.
- Each finish rides an existing base branch for its lighting, then one tint after the metal block. Anti-alias inputs
  are hoisted to uniform control flow: `fnPx` (object-space metres per pixel; pattern cells fade to their mean under
  ~2 px, so nothing shimmers in motion) and `fnCrease` (normal derivative; angle effects are withheld on hard panel
  edges). Angle terms read the geometric normal, not the orange-peeled shading normal.
- TLX rule learned the hard way: every value in the tint block is snapshotted with `.toVar()`; a bare TSL node shared
  between branches reads stale/zero (rendered black/white while GLX was right).
- `fd-r4.sh`: this round's shoot. `fd-v*-patch.py`, `fd-final.sh`: earlier rounds (history).
