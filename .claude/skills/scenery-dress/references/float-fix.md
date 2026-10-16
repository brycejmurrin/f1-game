# Fix a floating / sunk prop

1. Find it: `node tools/track/float-audit.cjs <id> --why` names each unsupported cluster's emitting
   source line (reports a prop base > `THRESH` above ground that nothing beneath supports; the constants
   sit at the top of the tool; `THRESH` is 1.2 m (`float-audit.cjs:43`), so a 0.5 m hover reads clean). Buried/unsupported prims:
   `ground-audit.cjs <id> --why`.
2. Read the call in `js/circuits/scenery/<id>.js` (grep the helper name at that frac).
3. Footing: `place`/`prop`/`anchor` use raycast terrain, else `groundYAt`; `grandstandEx`
   (`js/track/scenery/nature.js`) seats its shell with `groundYAt(k, gap + offset)` at the stand's CENTRE node,
   so a long stand on a cross-slope or a crest does not follow the ground. Try a smaller `gap` or `len`,
   split into two stands, or `anchor()` + `c[1]`. Primitive anchors differ: `addBox`/`addPyramid` take a
   centre, `addPrism`/`addCyl`/`addCone`/`addFrustum` a base (`docs/SCENERY-API.md` §Grounding).
4. A circuit-side fix: float-audit clean, ground-audit and clip-audit no worse than baseline.
5. If the cause is the helper itself (`js/track/scenery/*.js`), the fix hits every circuit. Run
   `float-audit.cjs --all`, `ground-audit.cjs --all --gate`, `clip-audit.cjs --all --gate` and
   `props-tris.cjs <id>` on a dense circuit, and name the unrun ones in the PR.
