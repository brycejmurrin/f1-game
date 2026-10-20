# Car mesh budget, floating parts, narrow noses (B·H13, 2026-10-20)

Bryce's ask (to OrchB 24, 2026-10-20): the new body shapes seem to add vertices
and cost frame time; some bodies have floating or cropped pieces; needle,
anteater "and a few more" have noses that are far too narrow. PR #3242.

## 1. Where the vertices go

`node tools/car/tri-census.mjs [--flat] [--aero] [--root=<checkout>]`
(node:vm, ferrari factory parts). It builds each tier `js/car/car-draw.js` asks for.

| body (rounded, shipped) | player tris | field tris (rival < 120 m) | caster tris | verts before weld | verts after weld |
|---|---|---|---|---|---|
| team (ferrari) | 14,800 | 12,332 | 18,424 | 39,064 | 18,177 |
| 16 original concepts | 14,244–14,424 | 11,956–12,040 | ~18,100 | ~37,500 | ~17,250 |
| rift / keel / delta / serpent | 15,268–15,420 | 12,980–13,124 | ~19,200 | ~40,800 | — |
| caldra … nacrel (Blender) | 14,464–14,920 | 12,176–12,632 | ~18,500 | ~38,800 | — |
| auralis / cevora / vantrel / orynth | 15,900–15,940 | 13,612–13,652 | ~19,700 | ~42,400 | 18,654 |
| far shared rival (> 120 m) | 6,136 | — | — | 17,420 | — |

- The body styles are not where the cost went. Body-style sections (chassis, cover,
  pods, body detail, livery) are 4.4–5.6k of ~14.8k triangles. The rest is shared
  by every car: cockpit 1,508 (1,236 of it the rounded headrest), rear assembly
  1,508, halo 1,200, exhaust 628, suspension 548, brake ducts 504, and on the player
  only the helmet 2,784.
- Before #3172 (13c7a5fd) every concept body was 14,464–15,240 player tris. #3172
  added ~1.1k to the four sculpted bodies and moved the others by less than 600.
  A week earlier (53f94499) the team body was 14,180, now 14,800 (+4 %).
- **53 % of all vertices were exact duplicates.** `addTri`/`addQuad` emit unshared
  corners, so a 14.8k-triangle body carried 39k vertices (2.6 per triangle).
  `CarGeometry.weld` (end of `Car3D.build`, plus the wheel layers and flap
  geometry) merges corners that are identical in the Float32 position, normal,
  colour and surface the GPU reads. Body 39,064 → 18,177, field 31,660 → 16,049,
  each wheel layer 1,752 → 1,002 — same triangles, bit-identical picture
  (`tests/unit/car-mesh-budget.test.mjs` compares every corner). The weld costs
  ~30 ms per build in node:vm, inside the race-load warm.
  `measure` and `refinish` builds (fit audit, garage refinish) skip it, because
  they read vertex ranges. `noWeld: true` opts out.
- Race estimate at a grid start (20 cars inside 120 m): ~19 × 16.5k + 18k ≈ 330k
  car triangles, plus casters inside 50 m (6–10 × 18–20k) ≈ 450–530k a frame.
  A grid of all sculpted bodies is +8 %.
- Budget pinned in `tests/unit/car-mesh-budget.test.mjs`: player ≤ 16.5k, field
  ≤ 14k, far ≤ 6.5k triangles, ≤ 1.35 vertices per triangle.

## 2. Floating and cropped pieces

Found by `car-fit-audit.mjs --bodies` on ferrari and redbull, diffed against each
team's factory car, plus three read-only hunters, one per body family. The common
cause: a detail placed at a literal, or at the cover's widest x, while the concept
shell moved under it.

| id | part | bodies | before | fix |
|---|---|---|---|---|
| D1 | ERS conduit clamp boxes, cover flank | every concept (needle 142 mm, blade 156, auralis 84–102; factory 54) | float | on the cable line (`coverFlankX` below the shoulder) |
| D2 | conduit end box, z −1.68 | all | float 58–76 mm | same |
| D3 | roll-hoop scoop lip + cheeks | low or tall airboxes (needle, wedge, swan, scorpion, brick, barge, stepnose) | float 28–57 mm | seated on the mouth top and sized to the mouth's width |
| D4 | ERS cooler intake + grille slats | every pod-sculpted body | buried 22–44 / float 12–24 mm | on the highest `podRoof` skin under the part |
| D5 | second bargeboard vane, x 0.66 | wide pods (brick, barge, anteater, wedge, lowline, sharkfin) | buried 26–60 mm | ends at the pod mouth |
| D6 | front-wing cascade vanes i ≥ 1 | sharkfin, serpent, delta, stepnose, highnose, rift | float 20–39 mm behind the endplate | end on the endplate |
| D7 | fuel filler housing | lowline | buried 33–55 mm in the tub | not under the tub rim |

Not fixed (minor, or the factory car has them too): mirror stalk root buried
35–50 mm on high-shoulder bodies, gearbox heat fins 7–11 mm clear, the studies'
pod-flank band bridging the recess (3 mm), the studies' cover tail 40 mm short of
the rear mount (7.5 mm slot), and the duplicate `fitBodyDetails` in car-body-geom.js
(the second declaration wins).

## 3. Noses

Width of the cross-section 50 mm and 150 mm behind the tip
(`styledNoseStations`). The FIA nose rule, 2014–15 text: ≥ 9,000 mm² at 50 mm,
≥ 20,000 mm² at 150 mm behind the tip
([formula1-dictionary](https://www.formula1-dictionary.net/f1-2014-nose-cone-regulations-design/),
[F1 2015 nose changes](https://www.formula1.com/en/latest/technical/2015/2/2015-rule-changes---nose-designs.html),
[Racer FW37](https://racer.com/2015/01/21/tech-insight-williams-fw37-launch/)).
The shipped team noses are 151–204 mm wide at 150 mm.

| body | before w@50 / w@150 mm | after |
|---|---|---|
| needle | 23 / 33 (a spike) | 96 / 123 |
| blade | 55 / 78 | 93 / 117 (tall knife ratio kept, > 3.5) |
| anteater | 65 / 84 | 110 / 141 |
| swan | 70 / 94 | 114 / 150 |
| wasp | 75 / 99 | 117 / 152 |
| highnose | 85 / 112 | 120 / 158 |
| sharkfin | 95 / 125 | 125 / 163 |
| scorpion | 105 / 136 | 128 / 165 |

Heights are pinned (`noseTipH`/`noseMidH` at the old values, and `noseLow` keeps
the mid-cone drop the old `noseSlim < 0.7` gave), so each nose widens in plan view
and keeps its side profile. Needle is still the slimmest nose on the grid.
