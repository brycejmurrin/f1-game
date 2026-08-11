# Autodromo Internazionale del Mugello — Visual Design Brief

**Setting:** DAY, green theme (Tuscan hill valley north of Florence). ~5.25 km, 15 turns, clockwise.

## 1. Setting
A fast, flowing circuit riding the contours of a valley in the Tuscan hills at Scarperia, 30 km north of Florence. Ferrari has owned it since 1988 and it shows: the paddock is immaculate, red-trimmed and better kept than most Grand Prix venues. Everything else is Tuscany — mixed broadleaf on the valley sides, ranks of near-black **cypress** marking the ridgelines and the paddock approach, and a stone **casale** with its flanking cypress pair on the hillside above the Arrabbiate, which is the shot every helicopter camera uses.

## 2. Atmosphere & palette
Warm golden hill light, slightly hazy, with the deep near-black greens Tuscan cypress gives.
- Sky: zenith `[0.24, 0.44, 0.74]`, horizon `[0.80, 0.76, 0.64]`; sun `[1.0, 0.93, 0.72]` — warmer than any other circuit here
- Fog `[0.76, 0.72, 0.62]`; grass `[0.24, 0.42, 0.19]`
- Cypress: `[0.11, 0.27, 0.15]`, deeper `[0.08, 0.21, 0.12]` — tall, slim, near-black spires
- Pine `[0.12, 0.29, 0.15]`; broadleaf `[0.20, 0.44, 0.20]` / `[0.15, 0.36, 0.17]`
- Gravel `[0.68, 0.61, 0.44]`; Ferrari red trim `[0.86, 0.14, 0.12]`
- Kerbs red `[0.80, 0.14, 0.14]` / white `[0.92, 0.92, 0.90]`

## 3. Elevation
Roughly 40 m of range, and it is used constantly — this circuit is never level.
- s≈0.16: **10 m climb** after San Donato.
- s≈0.34: **11 m drop** into Casanova-Savelli.
- s≈0.52: **9 m climb** through the Arrabbiate — uphill, fast, and banked.
- s≈0.74: 8 m down to Bucine.
- s≈0.92: 6 m rise onto the 682 m main straight.

## 4. Landmarks & surroundings by lap position
| s | Side | Distance | Box description |
|------|------|----------|-----------------|
| 0.98 | R | near | **Pit canopy**: one long continuous roof over the whole garage row — no stepped silhouette, no glazed tower |
| 0.005 | L | near | Main grandstand, 160 m, with a **red trim band** fronting it; second concrete stand at 0.955 |
| 0.00–0.05 | L | near | Cypress avenue up to the paddock — slim near-black spires in a disciplined rank |
| 0.070 | R | near | **San Donato** (T1): gravel apron (38×52) + red tyre wall, 4° camber |
| 0.072 | L | mid | Covered grandstand on the outside of San Donato |
| 0.16–0.26 | L | mid | Grass spectator bank on the climb |
| 0.312 | R | near | **Casanova-Savelli**: gravel + blue tyre wall at the bottom of the drop; concrete stand opposite |
| 0.36–0.46 | both | far | Open valley floor — the sightline down to the Arrabbiate |
| 0.47–0.52 | — | — | **Arrabbiata 1 & 2**: uphill, fast, 5° banked both |
| 0.495 | L | near | Arrabbiata gravel apron + yellow tyre wall |
| 0.500 | R | far | **Casale**: Tuscan stone farmhouse with attached lower barn, flanked by a cypress pair on the drive |
| 0.50–0.60 | R | far | Cypress ranks on the hillside above the Arrabbiate |
| 0.62–0.72 | R | mid | Second grass spectator bank; Correntaio pinch at 0.62–0.66 |
| 0.880 | L | near | **Bucine**: gravel apron, 4.5° banked final corner; steel stand on R |
| — | ring | far | Mugello hills — forested valley walls close on every side, the reason this circuit looks like nowhere else |

## 5. Track features
- Long 682 m main straight downhill-braking into San Donato.
- The Arrabbiate: two long fast uphill rights, 5° banked, taken close to flat — the circuit's signature.
- Proper wide gravel traps at every heavy braking zone; this is an old-school venue despite being fast and modern.
- Three pinch points: Casanova-Savelli, Correntaio, Bucine.

## 6. Modelling notes
- Cypress is the single most identifying plant here. Build them as tall slim near-black spires and place them in ORDERED ranks along ridgelines and the paddock drive — scattered like ordinary trees they read as any European woodland.
- Warm the whole palette. Mugello's light is golden; the same greens under a cool sun read as Germany.
- Keep the valley walls close on all sides. This is not an open-plateau circuit — the hills should be visible above the treeline everywhere.
- Give the pit complex one continuous roof and a red trim band, and nothing else. Ferrari's circuit is neat, not flashy.
- Bank the Arrabbiate visibly and set them on a rising ground plane; the corners only make sense uphill.
- One casale with its cypress pair is enough architecture in the outfield — do not scatter buildings across the hillside.

## Research pass — the vine quilt

Mugello already planted the cypress and the olives, which is two of the three
things that make this landscape. The third was missing: these hills are worked
farmland, quilted with **vine rows**. Cypress and olive alone read as "somewhere
warm"; the vine quilt is what makes it Tuscany.

Seven vineyard blocks, gap 96–132, following the pattern that measured clean at
Imola — the read is entirely in the repetition:
- rows **parallel and evenly spaced**, each stepping out and shearing slightly
  so the block follows a contour rather than looking like a printed grid;
- **bare tilled soil** under each row (the ground between vines is worked
  earth, and that stripe is half the read);
- **end posts** on the wire — the detail that says *trained vine*, not *hedge*.

### Casali — attempted, and deliberately not shipped

Tuscan stone farmhouses belong here and were built (rough stone under a shallow
terracotta pitch with deep eaves, a square tower end, shuttered windows, a
cypress pair at the gate). **They are not in the circuit.** Wherever they went
they landed on the existing olive and cypress planting, and `clip-audit` counted
it: mugello 17 → 18 severe. A bisect named the casali (the vineyards measured
innocent) and the spot list named the collision — `addBox × addCone` at frac
0.64. Moving them out to gap 158–176 did not help.

The blocker is structural: **a circuit file cannot reserve ground before
building on it.** `indexSolid` is engine-internal and not on the scenery api,
so any large prop placed in vegetated outfield risks growing through a tree.
Fixing that properly — exposing a footprint-reservation call to circuit files —
would unblock casali here, Silverstone's campsites at a sensible distance, and
anything similar on the remaining classics.
