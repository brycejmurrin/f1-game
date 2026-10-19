# Car fit audit — do the parts connect? (2026-10-19)

`node tools/car/car-fit-audit.mjs` builds every factory car offline (node:vm,
`Car3D.buildComplete` with `measure: true`, the parts-sweep loading path) and
reports how its parts JOIN. Asked for by Bryce on the design galleries: "parts
that still don't actually connect or they mesh into each other and have weird
edges". It is the gate for the combined design-preview PR: a branch passes when
it adds no NEW or WORSE fit failure versus the deploy tip.

```sh
node tools/car/car-fit-audit.mjs                                   # 11 factory cars, exit 1 on any FAIL
node tools/car/car-fit-audit.mjs --base origin/claude/f1-game-project-26h3ng   # only NEW/WORSE fail
node tools/car/car-fit-audit.mjs --all-styles --base origin/claude/f1-game-project-26h3ng
node tools/car/car-fit-audit.mjs --team=ferrari --styles=brakes/style_brakes_bigdisc --json
```

Not named `fit-audit.mjs`: `tools/ui/fit-audit.mjs` (the HUD fit tool) owns
that basename, and the MCP-surface guard resolves tools by basename.

## Units

- **section** — one `part("…")` marker range in `js/car/car3d.js` (`chassis`,
  `frontWing`, `wheels`, …). `build({measure:true}).parts[]` carries `from`/`to`
  (vertex range) since this tool; an older tree without them is rebuilt from the
  vertex counts, which is exact because sections are contiguous from vertex 0
  (the `--base` run proves it: head and base values agree to the 0.1 mm). Vertices
  past the last section are the active-aero flaps, section `aeroFlaps`.
- **piece** — a connected solid inside one section. Car3D is flat-shaded (a box
  is 24 unshared vertices), so pieces come from WELDED positions (0.05 mm), per
  section, so touching parts never fuse.
- **cluster** — pieces joined by surface contact (≤ `ATTACH_MM`) across sections.

## Checks

| check | what | fails when |
|---|---|---|
| GAP | a visible cluster not touching the car (the cluster holding the chassis); value = its nearest distance to anything else | > `GAP_MM` 3 mm |
| PENETRATION | vertices of section A inside a CLOSED piece of section B: nearest other-section face within 60 mm, normal-sign test (summed normals of tied faces at an edge/corner); only under a visible face | > `TYRE_PEN_MM` 3 mm into a tyre, else > `PEN_MM` 20 mm |
| ZFIGHT | visible same-facing faces (cos > 0.999) sharing no vertex, closer than 0.25 mm, of different colour or surface id; 4 samples per face | > 1 cm² per section pair |
| OPEN | welded boundary edges on visible faces (car bodies are back-face culled, so these are see-through holes or paper rims) | > 50 mm per section |

Every threshold is `FIT` in `tools/car/lib/fit-geom.mjs` with its derivation
(the parts-sweep optical anchor: ~6 mm/px at the audit camera, ~2 mm/px at the
2 m garage close-up; the 0.25 mm z-fight figure is 24-bit depth at a 0.1 m near
plane and a 20 m chase camera).

Rows are keyed `team|style|check|A|B` and folded (count `xN`, worst value, its
position in car metres, +X right, +Y up, +Z forward). `--base` charges a style
the base cannot build (a branch-only preview option) against the base FACTORY
car, so it is charged only for what it adds. WORSE = past the base value by the
check's own threshold, or more failing instances.

## Blind spots

- Visibility is 14 orthographic depth rasters at ~13 mm per pixel with 6 mm of
  depth slack: a part glimpsed only through a duct can read as hidden, and one
  within 6 mm under the skin as visible.
- GAP is vertex-to-face: two parts whose EDGES cross without a vertex near the
  other's face read as apart. Rare in box-built geometry.
- PENETRATION needs a closed target; an open shell (no boundary-free piece) has
  no inside and is never penetrated. The per-car piece counts say how many are closed.
- One pose: the baked (DRS-closed) mesh, wheels straight.
