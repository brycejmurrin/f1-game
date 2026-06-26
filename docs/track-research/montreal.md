# Circuit Gilles Villeneuve (Montreal) — visual reference

Visual research for Apex 26 procedural scenery. WebFetch was blocked at the proxy (403)
for most hosts, so facts come from WebSearch extracts with source URLs cited inline.

## Real-world surroundings

- The circuit sits on **Île Notre-Dame**, an entirely **man-made island** in the **St.
  Lawrence River**, built from Metro excavation rock for **Expo 67**; part of **Parc
  Jean-Drapeau** ([Wikipedia](https://en.wikipedia.org/wiki/Notre_Dame_Island),
  [Parc Jean-Drapeau](https://www.parcjeandrapeau.com/en/circuit-gilles-villeneuve-multi-purpose-track-provelo-sports-training-montreal/)).
- Île Notre-Dame lies **SE of downtown**; Île Sainte-Hélène is immediately **W/NW**. The
  downtown skyline view from the island looks **NW across the river**
  ([Wikipedia](https://en.wikipedia.org/wiki/Notre_Dame_Island)).
- 4.361 km, 14 corners, **clockwise**. Race is the **Canadian GP in June**.
- **Almost half the lap — hairpin to pit area — runs alongside the Olympic Basin**, which
  flanks the long Casino Straight
  ([Wikipedia](https://en.wikipedia.org/wiki/Circuit_Gilles_Villeneuve)).

## Signature landmarks

| Name | Height/desc | Colour | Shape | Track position |
|---|---|---|---|---|
| **Biosphère** | 76 m dia, 62 m high geodesic dome | **bare silvery-grey steel** (acrylic skin burned off 1976 — open lattice) | near-spherical geodesic truss | on **Île Sainte-Hélène** (neighbouring island), across the water NW — clearly visible from the circuit |
| **Olympic Basin** | 2,180 m × 110 m × ~3 m | flat water | long rectangular rowing canal, 8 lanes, small towers | **borders the Casino/back straight**, ~half the lap |
| **Casino de Montréal** | 8 storeys | shiny **aluminium fins** (silvery, light) | angular faceted sculptural | on Île Notre-Dame (former France Pavilion); the basin/straight is named for it |
| **La Ronde + ferris wheel** | Grande Roue ~45 m | colourful park rides | wheel ring + coaster silhouettes | on Île Sainte-Hélène, across the water, visible from track |
| **Wall of Champions** | 1.0 m concrete wall | grey w/ **"Bonjour/Bienvenue au Québec"** tourism ad | flat barrier | **outside the final chicane exit** (T13/14) |

- Designed by **Buckminster Fuller** (Biosphère, Expo 67 US Pavilion)
  ([ArchDaily](https://www.archdaily.com/572135/ad-classics-montreal-biosphere-buckminster-fuller)).

## Skyline & architecture

- **Montreal downtown skyline is genuinely visible across the river, NW** ("backdrop of
  the St. Lawrence River and the Montreal skyline")
  ([Parc Jean-Drapeau](https://www.parcjeandrapeau.com/en/circuit-gilles-villeneuve-multi-purpose-track-provelo-sports-training-montreal/)).
- Skyline towers to model: **1250 René-Lévesque 226.5 m**, **1000 de La Gauchetière
  205 m** (twin tallest), Tour de la Bourse. A **~200 m height cap** (protecting Mount
  Royal views) means a **cluster of mid-rise towers topping ~200–226 m**, not supertall
  ([tallest buildings in Montreal](https://en.wikipedia.org/wiki/List_of_tallest_buildings_in_Montreal)).
- Trackside foreground = **Biosphère dome + La Ronde** on the near (NW) island, downtown
  towers behind them across the water.

## Water, vegetation & terrain

- **Terrain flat** (artificial island), surrounded by the St. Lawrence River.
- Water on the island: long rectangular **Olympic Basin** + **lagoons/canals** (Floralies
  Gardens surrounded by lagoons); Jean-Doré Beach nearby.
- Vegetation = **temperate parkland** — lush green **deciduous canopy (elms, maples,
  oaks)** in full June leaf, flower beds; Floralies alone has 2,000+ trees / ~90 species
  incl. 833 American elms
  ([Parc Jean-Drapeau](https://www.parcjeandrapeau.com/en/jardins-des-floralies-nature-flowers-trees-shrubs-green-spaces-ile-notre-dame-montreal/)).
- River exposure → **gusty crosswinds** (trees/flags moving) on the back straight/chicane.

## Grandstands, kerbs, surface

- Surface smooth asphalt, **fully resurfaced 2024**; historically bumpy.
- **Large/aggressive kerbs**, esp. big inside kerbs at the **final chicane**, paired with
  the hard concrete outside wall; red/white striping.
- Run-off = **street-style, walls close** — concrete walls ubiquitous, all realigned to
  **1.0 m**; little run-off (a tight semi-street feel).
- Grandstands: **hairpin (T10) ringed by a horseshoe of stands**; Main Grandstand on the
  pit straight; Grandstand 16 opposite (best Wall of Champions view).

## Atmosphere / lighting / signage

- **June daytime race**, ~18–28 °C, ~35% rain chance, gusty river crosswinds; long
  northern-summer daylight, generally bright with cloud risk → **clear-to-mildly-overcast
  "day" bias**.
- **Quebec/Canadian identity:** the **"Bienvenue au Québec"/"Bonjour Québec"** banner on
  the Wall of Champions is the defining signage; maple-leaf red/white + Quebec
  fleur-de-lis (blue/white) flags among fans.

## Gap analysis vs current game

(The current `montreal.js` was flagged for verification in the brief.) Key accuracy
levers regardless of current state:

- **The island-in-a-river setting is the identity** — the lap should read as wrapped by
  water on all sides, with the long **Olympic Basin** flanking the Casino/back straight.
- **Biosphère steel dome** is the hero foreground landmark — across the water on the NW
  island, bare silver-grey geodesic lattice (not a solid dome).
- **La Ronde ferris wheel** (~45 m) beside the Biosphère, also across the water.
- **Casino de Montréal** (faceted aluminium 8-storey) on the island itself.
- **Downtown skyline** = mid-rise cluster capped ~200–226 m on the **NW** horizon across
  the river — not a supertall wall.
- **1.0 m concrete walls hugging the track** the whole lap (semi-street), red/white kerbs,
  hairpin grandstand horseshoe.
- **"Bonjour Québec" wall** at the final chicane exit — a cheap, instantly-recognisable
  signage cue.
- Lush **deciduous** parkland (elm/maple/oak) in full green; lagoons in the infield.

## Concrete scenery recommendations

1. **Biosphère** — geodesic steel-lattice dome (76 m wide, 62 m high), bare silver-grey,
   placed across a water plane on the NW island; build as an open truss sphere, not solid.
2. **Olympic Basin** — long rectangular water plane (~2.2 km × 110 m) flanking the Casino
   straight, with small lane/start towers.
3. **La Ronde** — ~45 m ferris wheel (game has a `ferrisWheel()` helper) + coaster
   silhouettes beside the Biosphère.
4. **Casino de Montréal** — faceted aluminium 8-storey block on the island.
5. **Downtown skyline** — clustered glass towers capped ~200–226 m on the NW horizon
   across the river (1250 René-Lévesque, 1000 de La Gauchetière as the readable heroes).
6. **1.0 m concrete walls** hugging the asphalt the whole lap; red/white kerbs; aggressive
   chicane kerbs; hairpin grandstand horseshoe.
7. **"Bonjour Québec"** banner on the final-chicane wall; maple-leaf + fleur-de-lis flags.
8. Lush green **deciduous** parkland (elm/maple/oak), infield lagoons; flat island ringed
   by river water on the horizon. Day light, clear-to-overcast bias.
