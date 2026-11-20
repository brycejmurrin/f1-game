# CarMesh — design rationale moved out of `js/car/car-mesh.js`

`js/car/car-mesh.js` is on the eager boot wall, so its long comment blocks move here verbatim, the same method as
[GOVERNOR-RATIONALE.md](GOVERNOR-RATIONALE.md). Each moved block became a one-line pointer `docs/CAR-MESH-RATIONALE.md
§cm-N` in the source; §cm-N below is that block, word for word, with the code line it sat above. Edit the rationale
here. First move: 2026-11-19, #5753 (tip `dec94440`).

### cm-1

Above `const REAR_LIGHTS = Object.freeze({`.

```text
REAR LIGHTS, 2026 spec. The car carries three of them, not one: the oval Rear
Impact Structure light in the centre of the crash structure, and — new for
2026 — a red light on each rear wing endplate that MIRRORS the RIS flash
pattern. That is why a modern car reads as three flashing points from behind
rather than a single dot, and why they share one emissive here.

Endplate anchor: Car3D.endplate(aLvl) puts the plates at x +-0.50 with their
rear face at z -2.69 at EVERY aero level; only the vertical extent moves
(y 0.475..0.755 at level 0, 0.525..1.105 at level 4). y 0.62 is inside the
plate at all five, so this needs no per-car aero lookup. z -2.705 clears the
face by the same 15 mm the RIS light uses against its own housing.
ONE mesh, ONE draw per car: the three quads used to be three draws of two
meshes through a per-light matrix, three render objects per lit car. Their
car-local offsets are constants, so they are baked into the vertices
(mat * (v + o) == (mat * T(o)) * v, identical up to float32 rounding of the
baked position). Order inside the mesh is the old draw order: RIS, left, right.
```
