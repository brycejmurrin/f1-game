# Engine — 2026 roll-hoop airbox + lofted cooling chimneys

Category: `engine` · alias `engStyle` / `design.engine`  
Scope: airbox / roll-hoop intake / snorkel / cover exits / sidepod chimneys.  
**Out of scope:** sidepod station loft (`buildSidepodBodywork`) — do not retessellate pods.

## Current draw sites (`js/car/car3d.js`)

| Piece | Lines | Today |
|---|---|---|
| Defaults `buildEngineParts` | ~1163–1173 | `in/snork/twin/inlet/outlet/…/chimney:0` — **no** `scoopLip` |
| Cover prism `buildEngineCoverBodywork` | ~1489–1511 | Single `addSpan` front→rear + accent pinstripes |
| Airbox + snork + outlet + service | ~1732–1819 | One trapezoid airbox; snork = one boxy `addSpan`; outlet 3 = `addBox` stacks |
| Radiator inlet mouths | ~1916–1935 | `inlet` 0..3 punched as boxes on `podGeom.inlet` (stock uses `1`) |
| Sidepod chimneys | ~1977–1988 | `chimney` 0..3: two `addBox` per stack (carbon body + dark exit) |

Measured default body (`Car3D.build(c1,c2,{noWheels:true})`): **2392** tris (ceiling 2400 → **8** free). Stock catalog option with full recipe resolution is already higher (~2560) because `inlet/outlet/servicePanel` fire; the hard gate is the bare default path.

## 2026 look we are matching

- **Roll-hoop airbox:** tall ram into a plenum behind the halo, with a dark intake lip — not a floating rectangular prism.
- **Snorkel crest (when `snork`):** a lofted throat → crest → cover-merge, optional cheeked scoop lip.
- **Cooling chimneys (when `chimney>0`):** tapered stacks standing on the pod shoulder with a recessed exit slot — Mercedes/Alpine-style open cooling, not two cubes.
- **Cover outlet 3:** twin stacks on the cover flanks get the same tapered treatment (already gated on `outlet===3`).

Stock cover silhouette (`buildEngineCoverBodywork` two-station prism) stays as-is so the default/stock deck matches today.

## Knob plan

| Knob | Values | Default | Effect |
|---|---|---|---|
| **`scoopLip`** *(new)* | `0 \| 1 \| 2` | **`0`** | `0` no faces. `1` thin INTAKE lip ring on the airbox mouth. `2` lip + carbon side cheeks. |
| `snork` *(existing)* | 0/1 | tier-derived | When truthy: **replace** the single snorkel span with a **3-station loft** (mouth → crest → merge) + keep flank louvres. Base airbox span unchanged when `snork` is false. |
| `chimney` *(existing)* | 0..3 | `0` | When >0: **replace** box stacks with tapered `addSpan` + inset exit (≈same tris, lofted silhouette). |
| `outlet` *(existing)* | 0..3 | tier-derived | When `===3`: loft the cover twin stacks the same way (already gated). |
| `inlet` *(existing)* | 0..3 | tier-derived | **Do not change `inlet===1`** (stock). Optional: `2`/`3` may use a beveled scoop mouth instead of nested boxes (gated). |

Also register `scoopLip` on `VISUAL_FIELD_REGISTRY.geometry.engine` and add `["engine","scoopLip",2]` to the `parts-physics` KNOBS list when integrating.

## Triangle budget

| Path | Δ tris vs today | Notes |
|---|---|---|
| Default / `scoopLip:0` / no snork / no chimney | **0** | Required. Bare body stays 2392. |
| `snork` loft (mouth→crest span + beveled crest→merge + void box) | **+28** | Was 1 span (12); now 12+16+12; louvres unchanged. |
| `scoopLip:1` (airbox lip; +snork lip if snork) | **+12** (+12 more if snork) | Recipe-gated boxes. |
| `scoopLip:2` | **+36** (+12 if snork lip) | Lip + two cheeks. |
| `chimney` N (lofted vs boxes) | **~0** | 1 span + 1 exit box per side = same 24 tris/side as 2 boxes. |
| `outlet===3` lofted | **~0** | Same swap. |

Worst single SIGNATURE (e.g. Cadillac: snork + chimney 3 + scoopLip 2): ≈ +28 + 0 + 36 + 12 = **+76** on an already-heavy recipe — still ≪ 1.6× default (≈3827).

## Integration notes

1. Patch `buildEngineParts` defaults + engineCover / chimney / outlet-3 draw blocks from `patch.js`.
2. Apply `parts-delta.json` onto existing SIGNATURE / FACTORY option `visual` objects (new keys only).
3. Do **not** edit `buildSidepodBodywork` stations or pod sample count.
4. Re-run body ceiling + `parts-physics` knob inertness after landing (not done here — proposal only).

## Files

- `artifacts/car-realism/engine/proposal.md` (this file)
- `artifacts/car-realism/engine/patch.js`
- `artifacts/car-realism/engine/parts-delta.json`
