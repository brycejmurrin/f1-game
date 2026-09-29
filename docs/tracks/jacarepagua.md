# Autódromo Internacional Nelson Piquet (Jacarepaguá) — Visual Design Brief

**Setting:** DAY, modern theme (Rio coastal flat, Barra da Tijuca). ~5.03 km, 11 turns, **anticlockwise in racing space** (see direction note).

## 1. Setting
Built 1971–77 on reclaimed marshland in Jacarepaguá / Barra da Tijuca, on **Cabo Pombeba** projecting into the **Lagoa de Jacarepaguá**, and demolished in **November 2012** for the 2016 Olympic Park. The district sits between the **Maciço da Tijuca** and the **Serra da Pedra Branca**. Two facts drive the scenery: (1) forested granite massifs rising from the flat coastal plain; (2) exposure — no tall trees inland, only low sandy **restinga** scrub and coconut palms on the lagoon shore.

Sources: [Wikipedia — Autódromo Internacional Nelson Piquet](https://en.wikipedia.org/wiki/Aut%C3%B3dromo_Internacional_Nelson_Piquet); [Wikipedia — Jacarepaguá](https://en.wikipedia.org/wiki/Jacarepagu%C3%A1); [racetrackworld.com](https://racetrackworld.com/south-america-race-tracks/brazil-race-tracks/jacarepagua/); [STATS F1](https://www.statsf1.com/en/jacarepagua.aspx).

### Direction note (UNCERTAIN / projection)
External listings (STATS F1, racetrackworld) say **clockwise**. This def keeps `reverse: false` because the projected `[x,z]` OSM trace winds CW while racing-space east/north is the historic anticlockwise GP lap (same projection mirror as `f1-track-accuracy.spec.js`). Do not flip `reverse` or frame keys without a rendered lap.

### Demolished site
No modern trackside imagery exists. Landmark shapes are sourced from 1980s race coverage and geography; pier/peak alignments marked **UNCERTAIN** below must not be treated as surveyed fact.

## 2. Atmosphere & palette
Brilliant tropical light with heavy coastal humidity flattening the horizon. Pale sand, saturated sea and mountain green.
- Sky: zenith `[0.24, 0.48, 0.80]`, horizon a near-white `[0.86, 0.86, 0.82]`; sun `[1.0, 0.96, 0.86]` almost overhead
- Fog `[0.84, 0.85, 0.84]` at density ≈0.0034 — the haze is essential
- Grass `[0.24, 0.44, 0.20]`; **restinga scrub** `[0.34, 0.44, 0.24]`; sand run-off `[0.72, 0.68, 0.54]` / `[0.76, 0.71, 0.56]`
- Palm `[0.18, 0.44, 0.20]` / `[0.14, 0.36, 0.17]`
- Lagoon water `[0.26, 0.46, 0.60]`
- Brazilian green `[0.10, 0.44, 0.24]` and gold on hoardings and flags; sun-bleached 1970s concrete throughout

## 3. Elevation
Dead flat, and notorious for it (STATS F1: drained swamp, no notable height difference).
- s≈0.28: +2.0 m.
- s≈0.70: −1.8 m.
- That is the whole profile. Vertical drama belongs to the massifs, not the road.

## 4. Landmarks & surroundings by lap position
| s | Side | Distance | Box description |
|------|------|----------|-----------------|
| 0.975 | R | near | **Pit grandstand** (`jacarepagua-pit-grandstand`, required): open pit boxes + deck + stepped seating under brise-soleil |
| 0.998 | R | near | Squat **timing box** (`jacarepagua-timing-box`, required) on the roofline |
| far NE | — | far | **Tijuca ridge** (`jacarepagua-tijuca-ridge`, required): world-space forested granite silhouette NE of the lap bounds — exact peak alignment UNCERTAIN |
| 0.96–0.99 | L | near | Brazilian flagpole rank against the massif |
| 0.95–0.05 | L | near | Green-and-gold hoarding run down the pit straight |
| 0.075 | R | near | Turn 1 **sand trap** + red tyre wall |
| 0.066–0.085 | L | mid | Concrete terrace outside Turn 1 (gap cleared past former city pack) |
| ~~0.14–0.24~~ | — | — | Grass crowd banks removed this wave (shared planes with city pack / self; flatCoplanar) — T1/T9 terraces remain |
| 0.36–0.50 | L | near | **Lagoon frontage**: sandy restinga, reflective Lagoa sheet, shore hardscape (`jacarepagua-lagoon-shore`, required). Jetty stub is generic — exact pier layout UNCERTAIN |
| 0.40–0.50 | L | mid | Coconut palms on the shore only |
| 0.622 | R | near | Sand trap + blue tyre wall; aluminium terrace opposite |
| 0.882 | R | near | Late sand trap + yellow tyre wall |
| — | one arc | far | **PEDRA BRANCA MASSIF**: steep forested granite peaks over roughly half the horizon |
| — | seaward | far | Low hazy treeline closing the rest of the horizon |

Do **not** use Interlagos corner names (Curva do Sol / Reta Oposta) here.

## 5. Track features
- Long pit straight + longer back straight (turbo-era F1 >300 km/h) with a technical infield (racetrackworld).
- Giant grandstands historically lined most of the back straight (Wikipedia) — we keep the combined pit/stand structure on the main straight as the authored hero.
- **Sand traps** rather than gravel — pale coastal sand.
- Flat, fast, reclaimed marshland.

## 6. Modelling notes
- Place the Pedra Branca mountain arc FIRST; keep height high relative to width and roughness low (smooth granite domes).
- Add the required Tijuca ridge as a compact inland silhouette, not a second full ring (a full ring reads as a crater).
- Keep inland vegetation LOW (JAC-M3 foliage exclusion); coconut palms only on the lagoon shore.
- Water is centred on its anchor — lagoon setback must exceed half-width; keep the basin compact.
- City pack on the modern theme shared planes with near-track GA and place boxes — excluded for the whole lap this wave (`dressingExclusions` city). Pedra Branca mountains + morro housing supply the Rio skyline.
- Keep the ground plane flat. Do not invent Interlagos-style elevation drama.

## Research pass — wave 6
- **Sourced:** Cabo Pombeba / Lagoa de Jacarepaguá location; demolition Nov 2012 for Olympic Park; flat reclaimed marshland; Tijuca + Pedra Branca geography; 5.031 km / 11-turn GP layout; long straights + infield.
- **UNCERTAIN (not built as surveyed fact):** clockwise vs anticlockwise external listings vs projection note; exact Tijuca peak bearings from the GP pits; exact lagoon pier/jetty layout; any post-2012 Olympic Park structure (out of scope — circuit is the 1978–89 GP era).
