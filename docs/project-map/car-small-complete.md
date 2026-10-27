# Car supporting modules complete map

## Source and coverage
GPT-6.1 Sol complete_car_camera fully read these 19 files at c4dc493d9, including huge generated crest literal through separately recovered nontruncated pages. Five large construction/drawing/texture files are excluded and assigned another agent.

| File | Lines | Coverage |
|---|---:|---|
| js/car/car-geometry.js | 425 | Full |
| js/car/car-material-shade.js | 198 | Full |
| js/car/car-materials.js | 218 | Full |
| js/car/car-shade.js | 892 | Full |
| js/car/car-wheels.js | 724 | Full |
| js/car/crest-draw.js | 481 | Full |
| js/car/crest-paths.js | 85 | Full |
| js/car/custom-liveries.js | 196 | Full |
| js/car/field-lod.js | 136 | Full |
| js/car/ghost-share.js | 395 | Full |
| js/car/ghost.js | 413 | Full |
| js/car/helmets.js | 898 | Full |
| js/car/input-ghost.js | 608 | Full |
| js/car/liveries.js | 669 | Full |
| js/car/livery-design.js | 377 | Full |
| js/car/livery-graphics.js | 507 | Full |
| js/car/livery-stations.js | 192 | Full |
| js/car/parts.js | 1043 | Full |
| js/car/surface-outline.js | 91 | Full |

## Contracts and dependencies
CarGeometry supplies typed welding/clustering and primitive helpers. CarMaterials/CarMaterialShade supply material IDs, palette/finish remap and cross-backend constants. CarShade supplies loft/skin/pipe geometry and two-tone cutting; CarWheels owns rotor/caliper/duct and open/covered variants. Crests/path/graphics feed LiveryTex. CustomLiveries resolves imported ID collision, identity/revision and migration. FieldLod supplies lens-scaled hysteretic selectors and mirror/shadow caps. Helmets generates driver designs with bounded mesh memo. Liveries/LiveryDesign/LiveryStations provide catalogs, deterministic patterns, paint surfaces and anchored geometry. Parts provides twelve-category ownership/era/supplier availability, legal fallback, fitted stats/visuals/cost and legality-keyed caches. SurfaceOutline owns private probe texture for selected garage surfaces.

Ghost captures 20Hz PB poses with bounded disk LRU, pending/foreign merge and pooled interpolation. InputGhost records/replays lossless fixed-step controls with build/physics/dt compatibility. GhostShare encodes bounded hashed APXG1, sanitation, bounded inflate and detached guest/fragment lifecycle.

## LSP evidence
All 19 globals queried. Parts has 175 references in 21 files spanning career, garage, game, physics/race, network and agent. Ghost/InputGhost/GhostShare queries explicitly used text fallback because module.exports scoping; other module references were semantic. FieldLod.parts member query fell back to module, so exact member coverage is unverified.

## Limits and remaining goal
Full supporting-body reading complete; no browser, texture or GPU test. Large files car3d, car-body-geom, car-draw, car-mesh, liverytex remain assigned separately. Parent owns docs validation/commits.
