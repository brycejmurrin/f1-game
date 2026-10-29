# #3959 engine-cover / sidepod z-fight — board-lift sweep (2026-10-29)

Question: can the concept-body (sculpt) PANEL + accent boards stay in their own colour (keeping the
stripe) and clear `engineCover~sidepods` ZFIGHT by lifting them off the loft, instead of the sameLook
recolour at `js/car/car3d.js` ~532? Measured with
`node tools/car/car-fit-audit.mjs --bodies=needle,brick,anteater,arched,wedge,barge --base origin/claude/f1-game-project-26h3ng`
(77 builds, ~185 s). `body-styles` + `livery-zone-finish` unit tests passed in every variant.

| variant (boards restored to PANEL/c2, sameLook workaround removed) | NEW / WORSE rows |
|---|---|
| sculpt board lifted 8 mm (podFlank + 8 mm) | 98 / 110: GAP engineCover~sidepods 6.5 mm (limit 3), OPEN engineCover +51 |
| lift 2.8 mm | 96 / 97: OPEN + GAP + 11 ZFIGHT |
| board vertices ray-sampled onto the BUILT skin + 1 mm | 30 / 64: ZFIGHT only (chord vs skin) |
| ray-sampled + 2.5 mm | 9 / 36: ZFIGHT engineCover~livery/sidepods, OPEN engineCover +17 |
| ray-sampled + envelope (±20 mm y, ±60 mm z) + 1.5 mm | 96 / 107: gaps return |
| ray-sampled + 1 mm + z-midpoint and 1/8-f board refinement | 10 / 86: ZFIGHT only |
| ray-sampled + 2.5 mm + same refinement | **8 / 26**: ZFIGHT engineCover~livery (decals sit at podFlank + 4 mm in `car-mesh.js` podDecal) |
| podFlank + 2.5 mm, board AND decal share refined stops/cuts | 34 / 128: worse |

Findings for the next owner:
- Any lift moves hundreds of GAP/OPEN rows (the audit treats a board lifted past 3 mm as a floating
  cluster), so a pure offset cannot reach zero NEW/WORSE; this matches the earlier cc659/f5ee reds.
- Best lead: ray-sampled + 2.5 mm + refinement (8 NEW / 26 WORSE, all ZFIGHT between engineCover and
  livery/sidepods). The livery decals (`car-mesh.js` podDecal, +4 mm over podFlank, coarse stops) would
  also need to ride the sampled skin; that was not tried successfully.
- The partition route (cut the loft triangles, paint the cells once) remains the clean fix; the
  unverified patch is in PR #4076 comments 6483397094, and its fit/budget history is in the PR body.
