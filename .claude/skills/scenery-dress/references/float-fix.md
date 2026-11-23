# Fix a floating / sunk prop

1. Find it: `node tools/track/float-audit.cjs <id> --why` names each unsupported cluster's emitting
   source line (reports a prop base > `THRESH` above ground that nothing beneath supports; the constants,
   `THRESH` among them, sit at the top of the tool, so a hover under `THRESH` reads clean). Buried/unsupported prims:
   `ground-audit.cjs <id> --why`. A floater float-audit calls clean (a stand on a cantilever or a gap) shows only as
   ground-audit's `footprintSupport` advisory: `WARN <id> unsupportedFootprint <gap>m … @circuits/scenery/<id>.js:<line>`
   (the line may be a helper lambda: read its caller).
2. Read the call in `js/circuits/scenery/<id>.js` (grep the helper name at that frac).
3. Footing: `place`/`prop`/`anchor` use raycast terrain, else `groundYAt`; `grandstandEx`
   (`js/track/scenery/nature.js`) seats its shell with `groundYAt(k, gap + offset)` at the stand's CENTRE node,
   so a long stand on a cross-slope or a crest does not follow the ground. Try a smaller `gap` or `len`,
   split into two stands, or `anchor()` + `c[1]`.
   **A floating `forestEdge` treeline is different:** the call is DEFERRED (`nature.js` pushes it to
   `deferredFoliage`; `build-props.js` runs `forestEdgeNow` after `scenery()` returns) and the ENGINE seats
   each crown, so `gap`/`len`/`anchor()` do not reach it. On steep ground (Spa's Eau Rouge climb) crowns
   plant at trackside height and hang over the valley: END the `forestEdge` span before the slope and
   plant that stretch per tree — an `along()` loop whose emitter reads the world ground per tree
   (`terrainYAt`), as `js/circuits/scenery/spa.js` does (grep `Eau Rouge / Raidillon climb is too steep`
   and `forestRank`). Never reuse one ground sample across a wide span: Trap B in `docs/SCENERY-API.md`
   §Grounding.
4. Done = SKILL.md "Grounded". If the cause is the helper itself (`js/track/scenery/*.js`), the fix hits
   every circuit: run `float-audit.cjs --all` (it gates on its own baseline), `clip-audit.cjs --all --gate`,
   `coplanar-audit.cjs --all --gate`, plus `props-tris.cjs <id>` (no gate) on a dense circuit, and
   name the unrun ones in the PR (CI group `sweeps` runs the fleet).
