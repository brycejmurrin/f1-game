# Finish design preview (throwaway branch, not for merge)

Living gallery: https://claude.ai/artifact/GqcJU9VgByuXYzme5Nrwgj (private; republish to the SAME url each round).
`finish-lab.html` is the published source; images are artifact assets (`/_blob/<id>`), never committed.

- Preview finishes = ids 60-90 in `js/car/car-materials.js` FINISH_SURFACE, remapped in-shader onto existing
  surfaces, then tinted after the metal block (GLX `glsl-lit.js`, TLX `tsl-lit.js`, WGX `wgsl-chunks.js`).
- TLX rule learned the hard way: every value in the preview tint block is snapshotted with `.toVar()`; a bare
  TSL node shared between branches reads stale/zero (rendered black/white while GLX was right).
- `fd-v*-patch.py`, `fd-v6-*.py`: the patches as applied (history; already in the js files). `fd-final.sh`: the shoot.
- `pixdiff.json`: share of car pixels that differ from shipped gloss, TLX garage hero.
