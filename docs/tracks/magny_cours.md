# Circuit de Nevers Magny-Cours — Visual Design Brief

**Setting:** DAY, green theme (flat Nivernais farmland, central France). ~4.41 km, 17 turns, clockwise.

## 1. Setting
Open agricultural country in the middle of France, an hour south of Nevers, with nothing around it for miles. Magny-Cours was rebuilt in 1991 as a state-backed technology park and had one of the best-equipped paddocks in Europe attached to one of the least dramatic landscapes: flat fields, ruler-straight **poplar windbreak rows**, hedgerow field boundaries, and a stone Nivernais farm somewhere beyond the outfield. It never looked exotic and it should not here. The corner everyone remembers is **Adelaide**, a slow hairpin at the end of the long straight with a big stand on its outside.

## 2. Atmosphere & palette
Soft, cool, slightly overcast light over green farmland. Muted and temperate — the least saturated palette in this set apart from the Nürburgring.
- Sky: zenith `[0.32, 0.48, 0.70]`, horizon `[0.74, 0.76, 0.72]`; sun a near-neutral `[0.98, 0.96, 0.86]`
- Fog `[0.72, 0.74, 0.72]`; grass `[0.22, 0.44, 0.20]`
- Poplar `[0.22, 0.46, 0.22]`; hedgerow/broadleaf `[0.19, 0.44, 0.20]` / `[0.14, 0.35, 0.17]`
- Ploughed and stubble fields `[0.42, 0.46, 0.22]` — large flat patches beyond the hedges
- Gravel `[0.68, 0.62, 0.46]`
- Kerbs red `[0.80, 0.14, 0.14]` / white `[0.92, 0.92, 0.90]`

## 3. Elevation
Gently rolling farmland — real but modest relief, most of it through the Estoril/Lycée section.
- s≈0.24: +5 m rise past Estoril.
- s≈0.52: −6 m through the middle of the lap.
- s≈0.80: +4.5 m back toward Lycée and the line.
- Keep the ground plane soft: shallow swells, no crests, nothing blind.

## 4. Landmarks & surroundings by lap position
| s | Side | Distance | Box description |
|------|------|----------|-----------------|
| 0.995 | R | near | **Pit canopy**: one modern flat roof over the garage row, sized to the short (~240 m) straight |
| 0.005 | L | near | Main grandstand (150 m), covered; second concrete stand at 0.955 |
| 0.00–0.08 | both | — | Foliage suppressed at the pits — the paddock is the one built-up place on the lap |
| 0.08–0.15 | both | mid | **Poplar windbreak rows**: evenly spaced ranks along the field boundaries, alternating sides — the giveaway of French farmland |
| 0.172 | L | near | **Estoril**: gravel apron + blue tyre wall; steel stand on the outside |
| 0.24–0.34 | R | mid | Grass spectator bank |
| 0.30–0.40 | both | far | Field hedges banding the outfield; ploughed/stubble field patches (120×200) beyond them |
| 0.34 | R | far | **La ferme**: stone longhouse, barn and silo — the only structures for miles |
| 0.40–0.50 | both | far | Open farmland, deliberately bare. Nothing dramatic happens on this horizon |
| 0.580 | R | near | **Adelaide hairpin**: gravel apron (34×44) + red tyre wall; the circuit's biggest stand (96 m, covered) on the outside |
| 0.70–0.80 | L | mid | Second grass spectator bank |
| 0.920 | R | near | **Lycée**: gravel + yellow tyre wall onto the pit straight; concrete stand opposite |
| 0.95–0.08 | L | near | Sponsor hoarding run down the straight — the only colour in the landscape |
| — | ring | far | Low farmland horizon: shallow hedged fields and poplar lines fading into haze. Deliberately unremarkable |

## 5. Track features
- Very smooth, well-surfaced tarmac — Magny-Cours' resurfacing was famously good and the circuit looked new for its whole F1 life.
- **Adelaide** at the end of the long straight: the one true overtaking corner, pinched to 6.2 m.
- Estoril and Lycée are the other pinch points; the Château d'Eau and Imola sequences flow between them.
- Modest banking throughout (3–3.5°); no crests, no blind corners.

## 6. Modelling notes
- Plant in ROWS, not clumps. Poplar windbreaks and hedged field boundaries are the entire visual identity; scattered woodland turns this into a generic European autodrome instantly.
- Keep the backdrop deliberately shallow and low. Resist the urge to add hills — there aren't any, and their absence is the honest look.
- Vary the field patches between green pasture and ploughed/stubble tone so the outfield reads as worked land rather than a lawn.
- Concentrate the crowd at Adelaide, Estoril and Lycée; leave the rest of the lap with grass banks and hedges only.
- Keep the light cool and slightly flat. Warm golden sun belongs to Mugello, not the Nivernais.
- One stone farm in the middle distance is the right amount of architecture — a second would make the place look populated, which it is not.


## Research pass — verified, already covered

The Nivernais farmland read is complete — fields, hedgerows, poplar lines, and the corners named for the circuits they imitate (Adelaide, Estoril, Lycée). Charolais cattle would be the only addition and are not worth the vertex cost. **Nothing added.**
