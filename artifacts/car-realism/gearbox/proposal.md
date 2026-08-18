# Gearbox — compact 2026 carbon casing

## Ownership

- Catalog category: `gearbox`
- Style alias: `gbStyle` / `design.gearbox`
- Defaults: `buildGearboxParts` @ `js/car/car3d.js:1225`
- Draw site: rear assembly @ `js/car/car3d.js:2638–2672`
  (ahead of the beam wing / crash fin; **not** the aero diffuser loft or rear wing)

## Current draw (today)

| Knob | Gate | Geometry |
|---|---|---|
| `strakes` / `strakeH` | `> 0` | Vertical carbon boards under the case (`addBox`, z≈−2.20) — gearbox visual tell, left unchanged |
| `fin` / `finSY` / `finSZ` | `fin` | Crash-structure fin at z≈−2.30 — left unchanged |
| `casing` / `caseWidth` | `> 0` | Single axis-aligned bellhousing box; ≥2 adds tapered tail; ≥3 adds side plates |
| `louvres` | `> 0` | Flat INTAKE slabs at fixed x=±0.135 (ignore case width) |
| `heat` | truthy | One titanium plate on the case crown |

Defaults for tier-1 / `standard`: `strakes:0, fin:0, casing:0, louvres:0, heat:0`
→ **zero gearbox tris** on the shipped rear (measured default body **2392** / 2400).

## 2026 look we are matching

A real 2026 gearbox is a **compact carbon housing** between the PU and the rear
crash structure: bellhousing flange → main case → tight rear taper, with
cooling gills on the flanks and a titanium heat shield / fin bank on the crown
where exhaust heat soaks the case. Suspension pick-up blisters sit on the
side plates at the highest casing tier. Diffuser / beam wing / DRS stay aero-
owned — this proposal only reshapes the gearbox mass itself.

## Proposal

### Keep (unchanged gates & geometry)

- `strakes`, `strakeH`, `fin`, `finSY`, `finSZ` — byte-identical draw paths.
- Default recipe values for existing knobs — old saves stay the shipped rear.

### Enrich when knobs are already on

1. **`casing` ≥ 1** — replace the single bulge box with:
   - thin bellhousing flange ring at the engine interface
   - `addSpan` main carbon case (slight roof taper via `t`)
   - `casing ≥ 2`: compact rear taper into the crash structure (`DARK`)
   - `casing ≥ 3`: carbon side plates **plus** lower pick-up blisters
   - all widths still scale with `caseWidth`

2. **`louvres` > 0** — flank gills that **track half-case width** (so a wide
   stack / slim titanium case actually moves the louvre bank). Each slot is a
   recessed INTAKE cut + a thin proud carbon lip (reads as a cooling gill, not
   a floating slab).

3. **`heat`** — titanium crown shield still, width scaled to the live case.

### New knobs (default **0** → inert)

| Knob | Range | Effect |
|---|---|---|
| `heatFins` | 0…5 | Vertical titanium heat fins across the case crown (WHAT EXISTS) |
| `ribs` | 0…3 | Longitudinal carbon reinforcement straps on each flank (needs `casing > 0`) |

Registry: add both to `VISUAL_FIELD_REGISTRY.geometry.gearbox`.
Optional: append `["gearbox","heatFins",4]` / `["gearbox","ribs",2]` to the
structure-knob KNOBS list in `parts-physics.spec.js` (gearbox is absent today).

## Triangle budget

Measured on current tree (`Car3D.build(…, { noWheels:true })`):

| Build | Tris | Notes |
|---|---|---|
| Default body (all knobs 0) | **2392** | ceiling 2400 — **headroom 8** |
| Explicit gearbox zeros | 2392 | **delta 0** (must hold) |
| `seamless_shift` today | 2644 | +252 |
| 1.6× single-option ceiling | 3827 | |

### Proposed deltas (measured via in-memory patch apply; not written to `js/`)

| Build | Tris | Delta vs default |
|---|---|---|
| default / `standard` / explicit zeros | **2392** | **0** |
| `f1_spec` / `seamless_shift` (enriched casing+louvres, no new knobs) | 2800 | +408 |
| `sig_astonmartin_gbox` + `heatFins:4` + `ribs:2` (worst) | **2896** | **+504** |
| 1.6× ceiling | 3827 | — |

**Default-body delta: 0** (every new face is behind `casing` / `louvres` /
`heat` / `heatFins` / `ribs` gates that default to 0).

## SIGNATURE tagging (`parts-delta.json`)

All eleven SIGNATURE gearbox options get `heatFins` / `ribs` only (mesh tells;
cost/stats unchanged via `equivalent`):

| optionId | heatFins | ribs | Character |
|---|---|---|---|
| `sig_rb_shortcase` | 4 | 1 | Dense crown fins, compact case |
| `sig_ferrari_seamless` | 3 | 2 | Ribbed sculpted case |
| `sig_williams_longshift` | 2 | 0 | Heat-wrap slim (no ribs) |
| `sig_mercedes_gbox` | 3 | 1 | Clean Brackley crown |
| `sig_mclaren_gbox` | 4 | 1 | Aggressive cooling bank |
| `sig_redbull_gbox` | 0 | 2 | Structural ribs, no heat package |
| `sig_alpine_gbox` | 0 | 1 | Light flank ribs (louvres already on) |
| `sig_haas_gbox` | 2 | 2 | Carbon-case straps |
| `sig_audi_gbox` | 3 | 1 | Balanced Neuburg case |
| `sig_astonmartin_gbox` | 4 | 2 | Full F1-spec tell |
| `sig_cadillac_gbox` | 2 | 2 | Wide-case structural |

Universal options keep existing visuals; they pick up the richer casing/louvre
mesh automatically when their `casing`/`louvres`/`heat` are already non-zero,
but do **not** gain `heatFins`/`ribs` unless a later pass tags them.

## Out of scope

- Rear wing, DRS pod, beam wing, diffuser loft (`aero` / `floor`)
- Physics / `PACE` / `js/game.js`
- Editing `js/`, `css/`, tests, `index.html`, `version.json` in this proposal pass
