# Design-review matrix (`tools/shot/design-matrix.mjs`)

Shots that differ, close on the part under review. 2026-10-20, lane B·W6·L23. Builds on the garage camera
catalog (`tools/shot/lib/garage-camera-catalog.mjs`) and drives `garage-angles.mjs --serve` over JSON lines
(no edits to either; the Codex camera lane `cursor/garage-camera-discovery-b62f` was not on the remote when this
was written, so this branch is based on the catalog already in the deploy branch).

## What a run is
`part × angle × base colour × light × variant`. Each (part, angle, colour, light) is a **group**: the baseline variant
is shot first, every other variant is pixel-diffed against it (`garage-angles` `diff`, changed-pixel fraction). A cell
under **0.5 %** is flagged *looks the same*. Output: `artifacts/design-matrix/<run>/` — PNGs, `manifest.json`, `sheet.html`
(sections per light, rows part·angle, columns colour·variant; `--phone` = 844x390 frames).

- **Framing**: `PART_BOXES` (car-space box, facing azimuth, tint field) + `frameForPart` fit the camera to the box at
  `--fill` (default 0.7 of the frame) and `--fov` (45). No `--dist`/`--az` hand-tuning. The boxes are a table (Car3D
  exports no part-bounds hook, and `js/` is out of this lane): override per run with `--bounds=@boxes.json`.
- **Angles**: `headOn, grazing (+45°), specular (+28°, el 0.55), low34, topFront, haloBehind` (the catalog station).
- **Colours**: base livery ids — `dark`=stealth, `mid`=splitshot, `light`=ice; any livery id works. (A part tint alone
  moved a sidepod by 0.19 % dark vs light: the body colour is the base livery's.)
- **Lights**: `lamp` (the part's inspection lamp), `off`, `keyHi`/`keyLo` (`light.keyMul` 1.5 / 0.5). Not yet: the G3
  broadcast garage mood and race daylight (`shot.mjs --tod`) — different tools, follow-up.
- **Safety**: one browser, dpr 1, ≤ 1600x900, refuses at loadavg ≥ 3. `--batch=k/n` takes whole groups;
  `--resume --run=<name>` redoes only groups with an unfinished cell. `--plan` prints the size and exits.

## Recipes (copy-paste)
```sh
# finishes: matte vs pearl against the factory gloss, three angles, dark/mid/light
node tools/shot/design-matrix.mjs --part=sidepod --angles=headOn,grazing,specular --colours=dark,mid,light \
  --variants=podFinish=matte,podFinish=pearl --baseline=podFinish=gloss --run=pod-finish
# aero: front + rear wing endplates, phone frame
node tools/shot/design-matrix.mjs --part=frontWing,rearWing --angles=headOn,low34,topFront --variants=endplate=<id> --phone
# bodies: nose and cover shapes
node tools/shot/design-matrix.mjs --part=nose,cover --angles=headOn,grazing --variants=bodyStyle=<id>,finShape=<id>
# tyres / exhaust / rims
node tools/shot/design-matrix.mjs --part=wheel,exhaust --angles=low34,specular --variants=rimFinish=<id>,exhaustTint=#ff6a00
# suspension / fuel-side ducts
node tools/shot/design-matrix.mjs --part=susp,duct --angles=grazing,topFront --variants=suspFinish=<id>,ductTint=#e8c200
# floor
node tools/shot/design-matrix.mjs --part=floor --angles=low34,grazing --variants=floorFinish=<id>,floorTint=#202020
# one chunk of a big matrix, then the next (rerun with --resume after a kill)
node tools/shot/design-matrix.mjs ... --run=big --batch=1/4
```
Field ids: `Liveries.FIELDS` / `garage-angles.mjs --design`. Gallery: drop `sheet.html` and its PNGs into an Artifact.
