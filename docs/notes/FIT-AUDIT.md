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
| PENETRATION | (a) vertices of section A inside a CLOSED piece of section B: nearest other-section face within 60 mm, normal-sign test (summed normals of tied faces at an edge/corner), only under a visible face; (b) TYRES: the tyre is open lathe bands, so each wheel's tyre is fitted as an analytic annulus (axle centre, bead and tread radii, width from its rubber/sidewall faces) and any other section's vertex inside it counts, depth = distance to the nearest annulus face | (b) > `TYRE_PEN_MM` 3 mm; (a) > `PEN_MM` 20 mm |
| ZFIGHT | visible same-facing faces (cos > 0.999) sharing no vertex, closer than 0.25 mm, of different colour or surface id; 4 samples per face | > 1 cm² per section pair |
| OPEN | welded boundary edges on visible faces that are not SEALED (no other surface within 3 mm of the edge midpoint); cars draw doubleSided, so these are paper rims showing the shell's inside | > 50 mm per section: WARN on an absolute run, gates as NEW/WORSE under `--base` |

Every threshold is `FIT` in `tools/car/lib/fit-geom.mjs` with its derivation
(the parts-sweep optical anchor: ~6 mm/px at the audit camera, ~2 mm/px at the
2 m garage close-up; the 0.25 mm z-fight figure is 24-bit depth at a 0.1 m near
plane and a 20 m chase camera).

Rows are keyed `team|style|check|A|B` and folded (count `xN`, worst value, its
position in car metres, +X right, +Y up, +Z forward). `--base` charges a style
the base cannot build (a branch-only preview option) against the base FACTORY
car, so it is charged only for what it adds. WORSE = past the base value by the
check's own threshold, or a count (vertices inside, face pairs, open edges,
floating clusters) up by a quarter and at least 3. A failing row with no failing
base twin is NEW only past its limit plus `NOISE` (GAP/PENETRATION 1 mm, ZFIGHT
0.5 cm², OPEN 10 mm); inside that margin it is NEAR-LIMIT, listed, never gating.
Why: the first `--all-styles --base` sweep (275 builds) flapped NEW across the
catalog on seams that sit at 2.9 mm in the base and 3.1 mm on a styled car, and
on GAP rows renamed by a bracket joining the floating cluster (GAP rows are now
keyed by the cluster's largest-area section; the note lists every section).

## Blind spots

- Visibility is 14 orthographic depth rasters at ~13 mm per pixel with 6 mm of
  depth slack: a part glimpsed only through a duct can read as hidden, and one
  within 6 mm under the skin as visible.
- GAP is vertex-to-face: two parts whose EDGES cross without a vertex near the
  other's face read as apart. Rare in box-built geometry.
- PENETRATION needs a closed target; an open shell (no boundary-free piece) has
  no inside and is never penetrated. The per-car piece counts say how many are closed.
- One pose: the baked (DRS-closed) mesh, wheels straight.

## Fixtures (measured 2026-10-19 on the deploy tip, mclaren)

| fixture | what the audit says vs the factory car |
|---|---|
| F12 Fenced Halo brow (`cockpit/style_cockpit_fenced`) | NEW `GAP halo → halo` 56.9 mm, x6: the crest vanes float over the crown (unit-tested) |
| F10 Big Disc scoop (`brakes/style_brakes_bigdisc`) | `PENETRATION brakeDucts → tyre LF/RF` 59 mm with 110/116 vertices inside vs 74/80: WORSE by count. The factory duct is already 59 mm into the front tyre on all 11 cars |
| F11 floor skirt (`floor/style_floor_tallfence`) | NEW `PENETRATION bodyDetail → tyre LR/RR` 18.2 mm: the skirt runs into the rear tyre |

The first version tested tyres with the closed-piece rule and missed F10 and
F11 entirely: every tyre band is open (48 boundary edges), so it had no
inside. That is why the tyre test is analytic.
