# Autódromo Oscar y Juan Gálvez (Buenos Aires) — Visual Design Brief

**Setting:** DAY, green theme (flat city parkland, Buenos Aires). ~4.26 km, classic No.6 layout (`classic: true`), clockwise. Do **not** model the 2027 Tilke hairpin / new F1 config.

## 1. Setting
A municipal autodrome inside the city, on the pampa flat at the southern edge of Buenos Aires (Villa Riachuelo). Opened **9 Mar 1952** under Perón (capacity ~45,000): **mass-concrete stepped terraces** with open fronts and no roofs, a low flat-roofed pit block under a simple awning on square columns, and a plain concrete control tower on legs. The site is a public park, so its planting is ORDERED — evenly spaced avenues of **plátano** (London plane), not scattered woodland. Character corners / sections (classic): **Curvón Salotto**, **Recta del Lago**, Ascari chicane, Horquilla Parga, Senna S, **Confitería**.

## 2. Atmosphere & palette
Warm, slightly hazy River Plate light over flat green parkland. Argentine light blue and white on everything the circuit owns.
- Sky: zenith `[0.26, 0.46, 0.74]`, horizon `[0.80, 0.80, 0.74]`; sun `[1.0, 0.95, 0.80]`
- Fog `[0.78, 0.78, 0.74]`; grass `[0.24, 0.46, 0.21]`
- **Plane tree** `[0.30, 0.50, 0.24]` / `[0.24, 0.42, 0.20]` — broad, flattened, two-stage pollarded crown on a pale mottled trunk
- Eucalyptus `[0.26, 0.40, 0.26]`; gravel `[0.68, 0.64, 0.50]`
- **Celeste** (Argentine light blue) `[0.44, 0.68, 0.86]` with white — hoardings, flags, trim
- Mass concrete: pale grey terraces, no cladding, no fascia

## 3. Elevation
The pampa. Genuinely, honestly flat.
- s≈0.30: +2.2 m.
- s≈0.66: −2.0 m.
- Nothing else, and nothing else should be invented. This circuit's drama is the Curvón's length, not any hill. (Do not flatten further; do not add knife-edge steps.)

## 4. Landmarks & surroundings by lap position
| s | Side | Distance | Box description |
|------|------|----------|-----------------|
| 0.975 | R | near | **Pit block** (`baires-pit-block`, required): low, flat-roofed, 1950s, continuous awning on square columns. Flat parapet — no tensile fabric. **UNCERTAIN** whether this exact block survives the 2026–27 renovation (city news: new boxes/garages rising); kept because `classic: true` |
| 0.995 | R | far | **Control tower** (`baires-control-tower`, required): plain concrete box on legs. Same UNCERTAIN note — a new race-control building is under construction for 2027 |
| 0.96–0.99 | L | near | Flagpole row, celeste-and-white — **UNCERTAIN** (repo survey only; no public source for a formal "flag avenue"). Generic poles, **not** a required `baires-flag-avenue` |
| 0.00–0.10 | L | near | **1950s concrete terraces**: mass-concrete stepped seating, open fronts, plain back wall, no roof |
| 0.075 | L | near | Turn 1 gravel apron + red tyre wall |
| 0.10–0.25 | both | near | **Plane-tree avenue**: evenly spaced ranks + deeper eucalyptus rank |
| 0.20–0.30 | L | mid | Grass crowd bank |
| 0.35–0.42 | — | — | **Curvón Salotto**: long constant-radius sweep |
| 0.365–0.38 | R | mid | Covered `grandstandEx` + **`baires-terrace-curvon`** (required) mass-concrete terrace outside the sweep |
| 0.380 | L | near | Curvón gravel apron (40×90) + blue tyre wall |
| 0.38–0.48 | both | far | Open parkland inside the sweep — kept clear |
| 0.640 | L | mid | **Recta del Lago** covered `grandstandEx` (pastel) overlooking the park lake |
| 0.64–0.72 | R | mid | Grass crowd bank |
| 0.655 | R | far | Park lake (`baires-park-lake`) |
| 0.745 | R | mid | **Confitería** (`baires-confiteria`, required): trackside café-restaurant. Exact frac vs OSM is approximate (**UNCERTAIN** placement); the building is a named classic landmark. 2027 works remove Curva de la Confitería from the *new* layout — we still dress it on classic |
| 0.78–0.88 | L | mid | **Talud** GA embankment (Av. 27 de Febrero) — city news names the talud as a new access sector |
| 0.830 | L | far | **Talud gate** (`baires-talud-gate`, required): compact portal + ticket booths for the new 27 de Febrero entrance |
| 0.850 | R | near | Late-lap gravel + yellow tyre wall |
| 0.928 | L | far | **Portico** (`baires-portico`, required): Peronist-era entrance pylons |
| — | ring | far | Flat pampa horizon with **porteño apartment blocks** on one side only |

## 5. Track features
- Long ~800 m pit straight into a slow first corner.
- **The Curvón**: a big constant-radius bend held for a long time, gently banked.
- Three pinch points (s≈0.21, 0.52, 0.85); the rest is wide and flowing.
- Old-surface tarmac; classic gravel traps and armco, no tarmac run-off.
- Game layout is **classic** — do not add the 2027 F1-standard hairpin, T1 tunnel, or new precast tribune lengths as the primary silhouette (those are the renovation programme; classic terraces + two modest covered stands read the period).

## 6. Modelling notes
- Plant in disciplined AVENUES with even spacing.
- Build the plane tree explicitly: pale mottled trunk under a broad, flattened, two-stage crown.
- Terraces are open-fronted mass concrete with no roof and no fascia. A modern cantilever stand as the *main* look breaks the period; short flat-roof `grandstandEx` bays at Curvón / Recta del Lago are fine as secondary covered seating.
- Keep the pit block and tower deliberately plain.
- Keep the ground flat and the inside of the Curvón clear.
- Put apartment blocks on ONE horizon only.

## Research pass — wave 6 (2026-09)

**Verified / sourced**
- Opened 9 Mar 1952; ~45,000 capacity; named sections include Curvón / Recta del Lago / Confitería / Senna S — [Wikipedia: Autódromo Juan y Óscar Gálvez](https://en.wikipedia.org/wiki/Aut%C3%B3dromo_Juan_y_%C3%93scar_G%C3%A1lvez)
- Renovation >60% (Sep 2026): new pits/garages, race control, five new precast tribunas (95/55/90/50/50 m), perimeter wall, new gates including **Av. 27 de Febrero at the talud**; MotoGP 9–11 Apr 2027; do **not** model the new F1 hairpin on this classic def — [Buenos Aires Ciudad](https://buenosaires.gob.ar/gcaba_historico/noticias/avanza-la-transformacion-del-autodromo-galvez-nuevas-tribunas-accesos-y), [LA NACION](https://www.lanacion.com.ar/autos/asi-fueron-las-obras-en-el-galvez-para-que-argentina-reciba-al-moto-gp-nid25092026/), [Automundo](https://automundo.com.ar/obras-autodromo-galvez-motogp-formula-1/)

**UNCERTAIN (not built as fact)**
- Formal celeste/white **flagpole avenue** — repo survey only; left as generic poles.
- Whether the 1950s pit block / control tower still stand after renovation — modelled as classic because `classic: true`.
- Exact Confitería building frac on the OSM centreline — placed near s≈0.745 as a best-effort named landmark.
