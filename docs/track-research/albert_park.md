# Albert Park (Melbourne) — visual reference

Visual research for Apex 26 procedural scenery. WebFetch was blocked at the proxy
(403) for several hosts, so facts come from WebSearch extracts with source URLs cited
inline.

## Real-world surroundings

- Temporary street circuit around **Albert Park Lake**, ~3 km south of Melbourne CBD.
  5.278 km, clockwise, 14 turns, 58 laps
  ([Wikipedia](https://en.wikipedia.org/wiki/Albert_Park_Circuit),
  [F1 2026 guide](https://www.formula1.com/en/latest/article/circuit-guide-2026-australian-grand-prix-albert-park.19zPlhKhMbTaVNFIPKAAMa)).
- Uses existing public roads (**Aughtie Drive, Lakeside Drive**) + a detour through the
  **Lakeside Stadium car park**; barriers/grandstands/run-off built annually
  ([Wikipedia](https://en.wikipedia.org/wiki/Albert_Park_Circuit),
  [Total Motorsport](https://www.total-motorsport.com/f1-australian-grand-prix-track-guide-albert-park-circuit/)).
- Setting is **flat parkland** (225-ha urban park) wrapped around the lake
  ([Wikipedia](https://en.wikipedia.org/wiki/Albert_Park_and_Lake)).
- **Turns 7–13 run right along the lake shore** (Lakeside Drive); concrete barriers tight
  to the water, no run-off there
  ([Wikipedia](https://en.wikipedia.org/wiki/Albert_Park_Circuit)).
- **Melbourne CBD skyline is the signature backdrop across the lake**, seen from the far
  side (T2, T8–10/12) looking over the water
  ([GPFans](https://www.gpfans.com/en/f1-news/1077012/albert-park-f1-circuit/),
  [Rambling Feet](https://www.ramblingfeet.net/run-the-track-lap-albert-park/)).

## Signature landmarks

| Name | Height/desc | Colour | Shape | Track position |
|---|---|---|---|---|
| **Albert Park Lake** | Y-shaped artificial lake, ~1.8 km long, 49 ha | dark blue-green water | branching Y, two islands (Gunn, Mud), reedbeds | **INSIDE** the circuit — track wraps it; closest along Lakeside Drive (T7–13) |
| **Eureka Tower** | 297 m, 91 storeys | blue glass body + **gold-plated crown** + red stripe | twisted tapering tower with asymmetric "shoulders" | across the lake in CBD/Southbank — the **most identifiable** tower |
| **Australia 108** | ~317 m, 100 floors | dark glass + **gold starburst** near top | tall slender slab — tallest in Melbourne | CBD/Southbank skyline |
| **Rialto Towers** | 251 m | dark blue/grey glass | two conjoined towers | older CBD landmark |
| **Pit building** | low/long, fixed since 1996 (being replaced by 2028) | — | long low structure | main straight |
| **Lakeside Stadium** | grandstand/athletics stadium | — | bowl | south side of lake; track detours through its car park |

- Resident **black swans**, ducks, cormorants on the lake; Aquatower fountain exists but
  is currently **off** ([Wikipedia](https://en.wikipedia.org/wiki/Albert_Park_and_Lake),
  [Birdingplaces](https://www.birdingplaces.eu/en/birdingplaces/australia/albert-park-lake)).
- Other skyline fillers: Aurora ~271 m, West Side Place ~270 m, 120 Collins ~265 m
  (antenna spire), 101 Collins ~260 m
  ([tallest buildings in Melbourne](https://en.wikipedia.org/wiki/List_of_tallest_buildings_in_Melbourne)).

## Skyline & architecture

- CBD cluster sits **N/NE across the lake**. From water level **Eureka (gold crown) is
  the standout**; the rest blur into an anonymous glass mass. Backdrop = clustered band
  of **blue/grey reflective glass** towers, one tall dark slab (Australia 108), one
  gold-crowned blue tower (Eureka) as the readable heroes
  ([Rambling Feet](https://www.ramblingfeet.net/run-the-track-lap-albert-park/)).
- Cool glass palette — not warm stone.

## Water, vegetation & terrain

- **Terrain flat** — gentle parkland.
- **Trees = VERIFIED MIX of palms AND gums:** Canary Island date palms (feature/avenue,
  lakeside & Beaconsfield Parade), eucalyptus/river red gums (native, incl. the ~300-yr
  Corroboree Tree), London plane (deciduous avenue). 1992 survey: 117 species, native +
  exotic ([eMelbourne](https://www.emelbourne.net.au/biogs/EM01514b.htm),
  [Wikipedia](https://en.wikipedia.org/wiki/Albert_Park_and_Lake)). So **palms are
  authentic** here, alongside gums.
- Grass is **lush green parkland**; race is autumn (March) so some plane-tree autumn
  colour is plausible; gums stay evergreen.

## Grandstands, kerbs, surface

- **Temporary tubular-steel tiered stands**, driver-named (Piastri new 2026, Brabham,
  Jones, Senna, Waite@T12 over the lake, Ricciardo…)
  ([Wikipedia](https://en.wikipedia.org/wiki/Albert_Park_Circuit)).
- **Very smooth dark asphalt** (recently resurfaced), red/white kerbs; **lower "negative"
  kerbs at T6–7**; gravel trap at T7 extends to the kerb.
- Run-off = grass + gravel, rebuilt annually; concrete barriers along Lakeside Drive
  (T7–13) where the lake leaves no room.

## Atmosphere / lighting / signage

- **Day race, autumn** — race starts ~3pm AEDT, afternoon→early-evening light, NOT night
  ([Speedcafe](https://speedcafe.com/us/f1-news-2026-formula-1-australian-grand-prix-melbourne-start-time-how-to-watch-tv-times-live-stream-schedule-details-albert-park-weather/)).
- Melbourne "four seasons in one day" — mild, low-to-mid 20s °C, variable; **default to
  soft neutral/overcast or warm low-afternoon sun**, sunny-clear as alternate
  ([Williams F1 forecast](https://www.williamsf1.com/articles/95ead815-75d9-428a-a20e-9abbf6a31e92/20256-australian-grand-prix-forecast-melbourne-albert-park)).
- Australian-flag colours / national branding; driver-named stands.

## Gap analysis vs current game

Current `albert_park.js`: Melbourne CBD skyline (Eureka 270m, Rialto 230m), lake water
planes, lush parkland treelines, rowing boathouses, green mounds.

- **Eureka height understated** (game 270 m vs real 297 m) and **missing its gold crown**
  — the gold crown is the single most identifying detail; add a gold cap.
- **Missing Australia 108** (the actual tallest, ~317 m, dark slab + gold starburst) as a
  skyline anchor.
- **Skyline should sit across the lake to the N/NE**, framed over water — verify the
  towers are positioned beyond the lake plane on the correct bearing, not ringing the lap.
- **Trees:** game's "lush parkland treelines" should explicitly mix **date palms +
  eucalyptus/river red gums + London planes**, not generic broadleaf.
- Lake shape ideally **Y-shaped with two small islands**; confirm barriers hug the water
  tight along T7–13.
- Atmosphere should bias to **soft autumn afternoon**, not deep-saturated clear sky.

## Concrete scenery recommendations

1. **Eureka Tower:** raise to ~297 m, add a distinct **gold crown cap** + thin red stripe.
2. Add **Australia 108** (~317 m dark glass slab, gold starburst near top) as the tallest
   skyline element; keep Rialto (twin dark towers) and a few anonymous glass mid-rises.
3. Position the CBD cluster **across the lake (N/NE)**, framed over the water from the far
   side of the lap; cool blue-grey glass palette.
4. **Tree mix:** Canary Island date palms (lakeside avenues), eucalyptus/river red gums
   (large native canopies), London planes (deciduous avenues) — green with autumn tint.
5. **Y-shaped lake** with two small islands, dark blue-green water, black swans optional;
   concrete barriers tight along the lakeside section.
6. Smooth dark asphalt, red/white kerbs (lower negative kerbs T6–7), temporary steel
   grandstands, low pit building on the main straight.
7. Light: 3pm autumn afternoon — soft neutral/overcast default or warm low sun.
