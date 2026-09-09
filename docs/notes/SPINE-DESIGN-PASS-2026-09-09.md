# Spine design pass — evidence (2026-09-09)

Lit factory sheet (hero / side / rear × 11 teams):
`/opt/cursor/artifacts/spine-design-pass/lit/sheet.png`

Per-team frames in the same directory. Placement re-check after recipe carve:
`node tools/car/spine-station.mjs --team=all` — every flank design `clear`.

Unit gates: `fin-design` + `cover-legibility` green (see `artifacts/spine-gates2.log`).

Harness notes for this box: headless WebGL2 can return null after X loss —
`APEX_HEADED=1 xvfb-run -a node tools/shot/garage-angles.mjs …` and
`installProbeInit` pins `apex26.gfxBackend=webgl2` so a coarse-pointer default
cannot divert boot onto deferred THREE.
