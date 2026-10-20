# Body-style design preview (B·D1), not for merge

Living gallery: https://claude.ai/artifact/EkspVdVKpht3wDjn4C81MS. Republish every round to this same URL.

- `body-candidates.html` is the gallery source. Its images live in the ignored
  `artifacts/body-designs/gallery/img/` and are published as artifact files, never committed.
- `sil.mjs` measures silhouette XOR between bodies:
  `R=40 NEW=highnose,sharkfin node design-preview/bodies/sil.mjs -`. Views are side, top, front and the phone 3/4 view, and R is px per metre (40 is about the phone scale).
- `validity.mjs` builds each new body on all 11 team chassis, square and rounded:
  `NEW=highnose node design-preview/bodies/validity.mjs`. It takes about 5 min for 4 bodies.
- Shots: `node tools/shot/garage-angles.mjs --fast --settle=8 --view-settle=4 --label=1 --team=mclaren --backend=three --bodyStyle=<ids> --cam="hero:0.72,0.24,5.4;side:1.571,0.06,8.5;top:1.15,0.95,5.4" --clamp=0`.
  The review's side camera at distance 6.0 cuts off the nose, so use 8.5. `--target` does not aim the camera; take close-ups as crops.
- Real-car references: `artifacts/body-designs/refs/inspiration/manifest.jsonl` (CC photos, credited in the gallery).
- `fit-probe.mjs` (round 3) ray-casts a build: `cast(build(id), axis, a, b)` lists each part section's
  skin crossings on one line, so every join in the Fit check section is a pair of measured numbers.
- `identical.mjs` hashes all 11 factory cars and the 6 shipped bodies on every chassis (square, rounded,
  field LOD): `HEAD_REF=<ref> node design-preview/bodies/identical.mjs` vs plain; equal digests mean
  only the preview bodies changed.
- `measure.mjs` (round 4) prints each body's part sizes in mm (nose depth, width and top at three
  stations, pod outer x and shoulder, cover/fin top), with the shipped envelope (team + six shipped)
  as the last row: `node design-preview/bodies/measure.mjs [team] [--json]`.
- `size-sheet.mjs` + `size-sheet-compose.mjs` (round 4) render identical-framing offline frames (ortho
  side/front/top + the garage 3/4) and write before/after JPGs with the old outline traced in red:
  `HEAD_REF=<ref> node design-preview/bodies/size-sheet.mjs artifacts/body-designs/r4/before <ids>`,
  the same without HEAD_REF into `…/after` (plus `team` and the shipped ids), then
  `node design-preview/bodies/size-sheet-compose.mjs artifacts/body-designs/r4 artifacts/body-designs/gallery/img <ids>`.
