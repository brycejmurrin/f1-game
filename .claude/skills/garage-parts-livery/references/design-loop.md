# Design loop — spine top / side, fin, any paint row

## Design loop — spine top / side, fin, any paint row

1. **Placement, no browser** (0.2 s): `node tools/car/spine-station.mjs --team=X --png=artifacts/spine`
   says where the ink lands (`v` 0 crease → 1 sidepod line) and rasterises the flat art.
2. **Look at it lit, once**: `garage-angles.mjs --team=X --spineLogo=wrap` — no camera
   flag, so it shoots the field's own STATION (`spineTop`; `spineSide` for a side
   design, `finBadge` for a fin). `--flat` puts the atlas art beside the frame.
3. **Iterate hot**: `garage-angles.mjs --serve --watch --team=X` (or `apex_garage`)
   keeps the garage open; edit the painter in `js/car/liverytex.js`, and each save
   re-shoots the last camera in ~10 s. Swap designs with `{"design":{…}}`, move with
   `{"frame":"spineSide"}` or an explicit `eye`/`look`, `{"diff":[a,b]}` for Δ + overlay.
4. **Choose**: `--pair='spineLogo:wrap|saddle'` scores the two in one run
   (`design-pairs.png`, magenta overlay of what changed).
5. **Gate**: the paint guard set ([placement.md](placement.md) § Cover-design guards) (`node --test tests/unit/<x>.test.mjs`).
