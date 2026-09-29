# Circuit de Nevers Magny-Cours — Visual Design Brief

**Setting:** DAY, green theme (flat Nivernais farmland, central France). 4.411 km, 17 turns, clockwise.

## 1. Setting
Open agricultural country in the middle of France, an hour south of Nevers, with nothing around it for miles. Magny-Cours was rebuilt in 1989–91 as a state-backed technology park (Technopôle) and had one of the best-equipped paddocks in Europe attached to one of the least dramatic landscapes: flat fields, ruler-straight **poplar windbreak rows**, hedgerow field boundaries, and a stone Nivernais farm somewhere beyond the outfield. It never looked exotic and it should not here. The corner everyone remembers is **Adelaide**, a slow hairpin at the end of the long straight with a big stand on its outside.

## 2. Atmosphere & palette
Soft, cool, slightly overcast light over green farmland. Muted and temperate — the least saturated palette in this set apart from the Nürburgring.
- Sky: zenith `[0.32, 0.48, 0.70]`, horizon `[0.74, 0.76, 0.72]`; sun a near-neutral `[0.98, 0.96, 0.86]`
- Fog `[0.72, 0.74, 0.72]`; grass `[0.22, 0.44, 0.20]`
- Poplar `[0.22, 0.46, 0.22]`; hedgerow/broadleaf `[0.19, 0.44, 0.20]` / `[0.14, 0.35, 0.17]`
- Ploughed and stubble fields `[0.42, 0.46, 0.22]` — large flat patches beyond the hedges
- Gravel `[0.68, 0.62, 0.46]`
- Kerbs red `[0.80, 0.14, 0.14]` / white `[0.92, 0.92, 0.90]`

## 3. Elevation
Gently rolling farmland — real but modest relief, most of it through the Estoril/Lycée section. Wikipedia and on-lap notes: negligible change overall, a small valley at Estoril and a slight hill near Lycée.
- Keep the ground plane soft: shallow swells, no crests, nothing blind. No elevation edits in wave-6 scenery.

## 4. Landmarks & surroundings by lap position
| s | Side | Distance | Box description |
|------|------|----------|-----------------|
| 0.985–0.045 | R | near | **Pit bay vault**: pale render garages under a corrugated barrel vault, blue steel trim (1991 Technopôle rebuild) |
| 0.996 | R | mid | **Control block** + short conference wing (operator Business Center / Centre de Conférence) — squat two-storey, no tower |
| 0.005 | L | near | Main grandstand (150 m), covered |
| 0.055 | R | mid | **Conservatoire de la Monoplace Française** — museum at the main entrance (inaugurated 1 May 2015, ~1 400 m²) |
| 0.00–0.08 | both | — | Foliage suppressed at the pits — the paddock is the one built-up place on the lap |
| 0.062+ | R | mid | Technopôle industrial sheds (Ligier / Mygale era business park) |
| 0.08–0.15 | both | mid | **Poplar windbreak rows**: evenly spaced ranks along the field boundaries |
| 0.172 | L | near | **Estoril**: gravel apron + blue tyre wall; steel stand on the outside |
| 0.24–0.34 | R | mid | Grass spectator bank |
| 0.30–0.40 | both | far | Field hedges; ploughed/stubble/colza patches beyond them |
| 0.34 | R | far | **La ferme**: stone longhouse, barn and silo — the only farm for miles |
| 0.40–0.50 | both | far | Open farmland, deliberately bare |
| 0.580 | R | near | **Adelaide hairpin**: gravel apron + red tyre wall; biggest stand on the outside |
| 0.62 | R | far | Distant **bourg** (church + houses) on the horizon |
| 0.70–0.80 | L | mid | Second grass spectator bank |
| 0.817 | L | mid | **Château d'Eau** concrete water tower (names turn 14; corner re-profiled 2003) |
| 0.920 | R | near | **Lycée**: gravel + yellow tyre wall onto the pit straight; concrete stand opposite |
| 0.95–0.08 | L | near | Sponsor hoarding run down the straight |
| — | ring | far | Low farmland horizon: shallow hedged fields and poplar lines fading into haze |

## 5. Track features
- Very smooth, well-surfaced tarmac — Magny-Cours' resurfacing was famously good and the circuit looked new for its whole F1 life.
- **Adelaide** at the end of the long straight: the one true overtaking corner.
- Estoril and Lycée are the other pinch points; the Château d'Eau and Imola sequences flow between them.
- 2003 changes: Château d'Eau and Lycée re-profiled (Wikipedia / racingcircuits.info / operator historic).
- Modest banking throughout; no crests, no blind corners.

## 6. Modelling notes
- Plant in ROWS, not clumps. Poplar windbreaks and hedged field boundaries are the entire visual identity.
- Keep the backdrop deliberately shallow and low. Resist the urge to add hills.
- Vary the field patches between green pasture and ploughed/stubble tone.
- Concentrate the crowd at Adelaide, Estoril and Lycée; leave the rest of the lap with grass banks and hedges only.
- Keep the light cool and slightly flat.
- One stone farm in the middle distance is the right amount of rural architecture.

## Research — sourced vs uncertain (wave 6)

### Sourced (built)
- Length 4.411 km, 17 turns, central France; corners echo Adelaide / Estoril / Nürburgring / Imola; Grande Courbe, Château d'Eau; 2003 Château d'Eau + Lycée changes — [Wikipedia](https://en.wikipedia.org/wiki/Circuit_de_Nevers_Magny-Cours), [operator](https://www.circuitmagnycours.com/presentation-du-circuit/), [racingcircuits.info](https://www.racingcircuits.info/europe/france/magny-cours.html).
- Technopôle business park beside the circuit; Ligier / Mygale / Winfield history — racingcircuits.info, operator.
- Conservatoire de la Monoplace Française at the main entrance, opened 1 May 2015, ~1 400 m² — [operator visit page](https://www.circuitmagnycours.com/visite-conservatoire-monoplace/), fr.wikipedia Conservatoire entry.
- Business Center (conference centre 267 seats, press room, salons) — operator présentation page.
- Capacity 139,112; 14 numbered tributes + general enclosure — operator.

### UNCERTAIN (not built as named fact)
- **Which grandstand has which name today** — operator lists 14 tributes; names not scraped here. Stands use generic vault / grass-bank language only.
- Exact footprint / façade of the Conservatoire relative to the GP start — placed at the paddock/entrance end from the “main entrance” description; satellite confirmation not done this pass.
- Whether a freestanding water tower still stands next to Château d'Eau corner — the corner is named for one; the model is a conventional French château d'eau read, not a surveyed silhouette.
- ISAT campus buildings on site (Wikipedia) — not modelled; location relative to the GP ribbon unclear for a required landmark.
