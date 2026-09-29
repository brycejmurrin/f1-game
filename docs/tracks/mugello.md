# Autodromo Internazionale del Mugello — Visual Design Brief

**Setting:** DAY, green theme (Tuscan hill valley north of Florence). ~5.245 km, 15 turns, clockwise.

## 1. Setting
A fast, flowing circuit riding the contours of a valley in the Tuscan hills at Scarperia, ~30 km northeast of Florence. Ferrari has owned it since 1988 and it shows: the paddock is immaculate, red-trimmed and better kept than most Grand Prix venues. Everything else is Tuscany — mixed broadleaf on the valley sides, ranks of near-black **cypress** marking the ridgelines and the paddock approach, and a stone **casale** with its flanking cypress pair on the hillside above the Arrabbiate, which is the shot every helicopter camera uses.

**Sourced:** length 5.245 km, 15 turns, 1.141 km main straight; stadium stand capacity ~50,000 (+ hillside GA up to ~160,000 on MotoGP weekends); Ferrari ownership since 1988; 2020 Tuscan GP (Ferrari's 1000th). — [Wikipedia](https://en.wikipedia.org/wiki/Mugello_Circuit); [Trackside Seats](https://www.tracksideseats.com/motogp/circuits/mugello).

## 2. Atmosphere & palette
Warm golden hill light, slightly hazy, with the deep near-black greens Tuscan cypress gives.
- Sky: zenith `[0.24, 0.44, 0.74]`, horizon `[0.80, 0.76, 0.64]`; sun `[1.0, 0.93, 0.72]` — warmer than any other circuit here
- Fog `[0.76, 0.72, 0.62]`; grass `[0.24, 0.42, 0.19]`
- Cypress: `[0.11, 0.27, 0.15]`, deeper `[0.08, 0.21, 0.12]` — tall, slim, near-black spires
- Pine `[0.12, 0.29, 0.15]`; broadleaf `[0.20, 0.44, 0.20]` / `[0.15, 0.36, 0.17]`
- Gravel `[0.68, 0.61, 0.44]`; Ferrari red trim `[0.86, 0.14, 0.12]`
- Kerbs red `[0.80, 0.14, 0.14]` / white `[0.92, 0.92, 0.90]`

## 3. Elevation
Circuit-authored elevation lobes sum to roughly ~40 m of ups and downs (not a surveyed DEM — **UNCERTAIN** as a single relief figure; keep the existing `elevations` table, do not invent new peaks).
- s≈0.16: **10 m climb** after San Donato.
- s≈0.34: **11 m drop** into Casanova-Savelli.
- s≈0.52: **9 m climb** through the Arrabbiate — uphill, fast, and banked.
- s≈0.74: 8 m down to Bucine.
- s≈0.92: 6 m rise onto the main straight.

## 4. Landmarks & surroundings by lap position
| s | Side | Distance | Box description |
|------|------|----------|-----------------|
| 0.98 | R | near | **Pit canopy**: continuous roof over the garage row + race-control tower (`mugello-race-control`) |
| 0.005 | L | near | **Tribuna Centrale / Poltronissima** (`mugello-centrale-stand`, required): covered main stand, positive rake, rosso trim, cantilever roof — start/finish + podium view ([Trackside Seats](https://www.tracksideseats.com/motogp/circuits/mugello); [MotoGP Mugello Poltronissima](https://www.motogpmugello.com/en/ticket-info/grandstand-poltronissima); [mugellocircuit.com facilities](https://www.mugellocircuit.com/en/36-facilities)) |
| 0.00–0.05 | L | near | Cypress avenue up to the paddock |
| 0.145 | R | near | **San Donato** (T1): gravel apron + red tyre wall, 4° bank; terrazza bowl opposite |
| 0.16–0.26 | L | mid | Grass spectator bank on the climb |
| 0.218 | R | mid | **Poggio Secco** (`mugello-poggio-secco-stand`, required): uncovered stand on the outside of turn 3 ([MotoGP Mugello map copy](https://www.motogpmugello.com/en/map-of-the-grandstands-43); Luco entrance per [mugellocircuit FAQ](https://mugellocircuit.com/en/76-faq)) |
| 0.238 | R | mid | **Materassi** (`mugello-materassi-stand`, required): uncovered stand near Poggio Secco, outer edge ([Koobit / MotoGP Mugello](https://www.koobit.com/italian-motogp-e21448/tickets/materassi-135104)) |
| 0.312 | R | near | **Casanova-Savelli**: gravel + blue tyre wall; terrazza opposite |
| 0.36–0.46 | both | far | Open valley floor — sightline down to the Arrabbiate |
| 0.47–0.53 | L | mid | **Arrabbiata hillside** (`spectatorHill` ~0.485–0.530, gap 36): Prato / Grandstand 58 area — exact named-stand footprint **UNCERTAIN**; placed by bankZones, not ticket labels ([Arrabbiata 58](https://www.motogpmugello.com/en/ticket-info/grandstand-arrabbiata-58)) |
| 0.495 | L | near | Arrabbiata gravel apron + yellow tyre wall |
| 0.500 | R | far | **Casale** (`mugello-casale`): Tuscan stone farmhouse + barn, cypress pair |
| 0.50–0.60 | R | far | Cypress ranks on the hillside above the Arrabbiate |
| 0.62–0.72 | R | mid | Second grass spectator bank; Correntaio pinch at 0.62–0.66 |
| 0.880 | L | near | **Bucine**: gravel apron, 4.5° banked final corner; terrazza on R |
| — | ring | far | Mugello hills — forested valley walls close on every side |

## 5. Track features
- Long main straight (sourced 1.141 km) downhill-braking into San Donato.
- The Arrabbiate: two long fast uphill rights, 5° banked — the circuit's signature.
- Wide gravel traps at every heavy braking zone.
- Three pinch points: Casanova-Savelli, Correntaio, Bucine.

## 6. Modelling notes
- Cypress is the single most identifying plant here — ordered ranks, not scatter.
- Warm the whole palette; Mugello's light is golden.
- Keep the valley walls close on all sides.
- Centrale is the covered hero; Poggio Secco and Materassi stay uncovered (ticket sources).
- Bank the Arrabbiate visibly; hillside GA is `spectatorHill`, not another roofed shell.
- `indexSolid` reserves casale / Centrale / Poggio / Materassi footprints so deferred foliage routes around them.

## Research pass — the vine quilt

Seven vineyard blocks, gap 96–132, Imola-pattern rows over tilled soil with end posts. Vine strips seat on `groundUnder` / `terrainYAt` with a world-up `flatBasis` so banked `a.u` does not tip them into grade.

### Casali

Outfield stone farmhouses ship via `indexSolid` footprint reservation (scenery api). The Arrabbiata **casale** hero remains `mugello-casale` at s≈0.500 / gap 150.

### UNCERTAIN (do not build as fact)
- Single “~40 m relief” figure — circuit-authored lobes only; no DEM citation this pass.
- Exact seat rows / covered status for every ticket-map grandstand name beyond Centrale (covered), Poggio Secco / Materassi / Arrabbiata 58 (uncovered per ticket copy).
- Precise metre offset of Arrabbiata 58 vs Prato 58 on our centreline — hillside is placed by bankZones.
