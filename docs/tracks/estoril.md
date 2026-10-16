# Autódromo do Estoril — Visual Design Brief

**Setting:** DAY, green/classic theme. Autódromo Fernanda Pires da Silva on the
Alcabideche plateau (Cascais), ~9 km inland from the coastal town of Estoril —
not on the Atlantic shoreline. 4.182 km (official centreline), 13 corners,
clockwise; final corner is the **Parabólica Ayrton Senna**. Senna's first F1
win, 1985. Last used by F1 in 1996.

Sources: [circuito-estoril.pt technical data](https://www.circuito-estoril.pt/en/technical-data/),
[Wikipedia — Circuito do Estoril](https://en.wikipedia.org/wiki/Circuito_do_Estoril).

## 1. Setting
A 1972 permanent circuit on a dry hillside inland of Cascais / Estoril. Palette
is **limewash, terracotta and rust-primed scaffold tube**. The pit building is
one continuous masonry terrace (30 boxes, 17 × 6.70 m each) under a pantile
roof with an open roof terrace (three stair accesses). The crowd sat on open
tube scaffold you could see the pines through. Inland the Serra de Sintra
closes the horizon; seaward there is haze over the plateau, not an ocean sheet
next to the track.

## 2. Atmosphere & palette
Bright but softened — Atlantic haze takes the edge off the light.
- Sky: zenith `[0.24, 0.46, 0.78]`, horizon `[0.82, 0.82, 0.76]`; sun `[1.0, 0.95, 0.80]`
- Fog `[0.80, 0.80, 0.76]` at density ≈0.0030
- Limewash `[0.95, 0.94, 0.90]`, shadowed `[0.86, 0.85, 0.80]`; terracotta `[0.68, 0.33, 0.21]` / `[0.54, 0.27, 0.18]`
- Azulejo blue `[0.24, 0.42, 0.66]`; scaffold tube `[0.60, 0.58, 0.56]`
- Stone pine `[0.16, 0.31, 0.17]` / `[0.12, 0.25, 0.14]`; dry scrub `[0.33, 0.38, 0.21]`
- Gravel `[0.66, 0.58, 0.42]`; run-off `[0.62, 0.52, 0.38]`

## 3. Elevation
Undulates throughout — a hillside lap, never level for long. Do not flatten to
seat props; do not add knife-edge grade spikes.
- s≈0.09: **7 m climb** off the line to Turn 1.
- s≈0.32: **8 m drop** through the middle sector.
- s≈0.58: 6.5 m back up.
- s≈0.84: 6 m descent into the Parabolica approach.

## 4. Landmarks & surroundings by lap position
| s | Side | Distance | Box description |
|------|------|----------|-----------------|
| 0.95–1.00 | R | mid | **Pit terrace** (`estoril-pit-terrace`, required): 30 limewashed garage bays under one continuous pantile roof, azulejo band, open roof terrace with three stair towers. Official boxes 17×6.70 m; control tower separate |
| 0.978 | R | near | **Torre de cronometragem** (`estoril-timing-tower`, required): square limewashed tower, external leaning stair, open observation deck, tiled pyramid cap |
| 0.955 | L | near | Masonry terrace stand at the line — uncovered, terracotta-fronted |
| 0.95–0.045 | L | near | Sponsor hoarding run down the ~985 m S/F straight |
| 0.02–0.20 | both | near | Open scaffold stands: tube frames, plank decks, painted bench rows, striped canvas awnings |
| 0.078 | R | near | Turn 1 gravel apron + red tyre wall |
| 0.10–0.35 | both | mid | **Stone pines**: bare leaning trunks each carrying ONE wide flat parasol of canopy |
| 0.26 | L | far | **Aldeia** (`estoril-aldeia`, required): cubed limewashed houses stepping downslope around a church with a square campanile |
| 0.420 | L | near | Mid-lap gravel + blue tyre wall |
| 0.44 | R | far | **Moinho** (`estoril-moinho`, required, **UNCERTAIN** as an on-site feature — see below) |
| 0.62 | L | far | **Depósito de água** (`estoril-deposito`, required): elevated water tank + pump house (replaces the retired coastal lighthouse fiction) |
| 0.780 | R | near | Gravel apron on the run to the last sector |
| 0.865–0.935 | R | near | **Parabolica Ayrton Senna**: biggest crowd bank on the circuit |
| 0.900 | L | near | Parabolica gravel + yellow tyre wall |
| — | inland | far | Serra de Sintra ridge (Cruz Alta ~5 km NW) closing the inland horizon |

### Official facility facts (not all modelled as hero landmarks)
- Medical centre, helipad, 58,000 m² support paddock, CCTV / FIA Grade 1 boards —
  [technical data](https://www.circuito-estoril.pt/en/technical-data/).

## 5. Track features
- Long final **Parabolica** onto a ~985 m straight — Estoril's races were decided in the slipstream to the line.
- Three narrow points (s≈0.21, 0.50, 0.78) on a circuit already tight at 7 m base half-width.
- Old-school gravel traps and armco throughout; no tarmac run-off anywhere.
- Persistent Atlantic crosswind — the reason the whole hillside's planting leans.

## 6. Modelling notes
- Build the pine species explicitly: a bare leaning trunk with a single flared, shallow-domed parasol. The stacked-cone conifer helper draws a northern fir.
- Stands are open scaffold, not shelled grandstands.
- Keep the backdrop **asymmetric**: Serra de Sintra inland; no ocean sheet beside the track (circuit is inland Alcabideche — Guincho / Cascais bay are ~7 km away with the Malveira ridge between).
- Use only limewash, terracotta and rust-primed tube for everything built.
- Never reintroduce `sceneryStartFrac` (Estoril lesson, `docs/BUGS.md`).

## Research pass — wave 6 (2026-09-29)

### Sourced and built / corrected
- 30-bay pit terrace with roof terrace + three stairs — official technical data.
- Timing tower, aldeia, depósito kept as required landmarks.
- Docs corrected: inland Alcabideche plateau; Atlantic/farol sheet removed from the brief (already gone from scenery).
- Motorhome row removed — posts buried up to 5.6 m into hillside terrain.
- Aldeia house/church coplanar (20.8 m²) resolved by separating the house row downslope.

### UNCERTAIN / left alone
- **`estoril-moinho`**: prior model kept and marked required for contract continuity; web search found no windmill structure on the Autódromo itself (Alcabideche has historic mills a few km away). Do not extend.
- Exact medical-centre / helipad footprints not modelled as hero landmarks this pass (facility fact only).
