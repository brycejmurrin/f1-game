# Las Vegas — visual reference

Visual research for the procedural scenery of the **Las Vegas Strip Circuit**
(Formula 1 Las Vegas Grand Prix). The game builds Vegas as `street_night` — a
neon canyon under floodlights. This document collects real-world facts to make
that scenery accurate, and ends with a gap analysis vs the current build
(`js/tracks/vegas.js`).

---

## Real-world surroundings (researched facts, with sources/URLs cited inline)

**The circuit.** 6.201 km (3.853 mi), **17 turns**, run **counter-clockwise**,
at night. It is one of the fastest street layouts in F1, with a ~1.9 km top-speed
straight down Las Vegas Boulevard (the Strip). Roads used: the new
start/finish + pit complex (a former parking lot at Harmon Ave / Koval Lane),
**Koval Lane**, **Westchester Lane**, the **Sands Avenue** loop around the Sphere,
**Las Vegas Boulevard** (the Strip), and **East Harmon Avenue** back to the start.
([Wikipedia – Las Vegas Strip Circuit](https://en.wikipedia.org/wiki/Las_Vegas_Strip_Circuit);
[GPFans track layout](https://www.gpfans.com/en/f1-news/1067868/las-vegas-grand-prix-full-track-layout-2025-f1-street-circuit/);
[RacingCircuits.info](https://www.racingcircuits.info/north-america/usa/las-vegas-strip-street-circuit.html))

**Landmark sequence around the lap.** The lap begins near **The Sphere**; cars
launch into a flowing opening sequence, head north up Koval Lane, then a long
sweeping left **encircles the Sphere** (the Sands Ave loop, T7–T9). At T9 the
track joins **Sands Avenue** heading west, then turns south onto the **Strip**
(T12–T14), the long straight that fronts **The Venetian, The Mirage (now
demolished/redeveloping), Caesars Palace, the Eiffel Tower at Paris Las Vegas,
and the Bellagio Fountains**. From T14 it runs east on East Harmon Ave to the
slight left kink (T17) back onto the start/finish straight.
([F1 fan guide](https://www.formula1.com/en/latest/article/speed-neon-and-the-strip-the-ultimate-fan-guide-to-las-vegas.6LafpqS1SuW41zYwdXz2iC);
[GPFans](https://www.gpfans.com/en/f1-news/1067868/las-vegas-grand-prix-full-track-layout-2025-f1-street-circuit/))

**Permanent pit / paddock — "Grand Prix Plaza".** Unlike most street circuits,
Vegas has a **permanent, purpose-built pit building** on the NE corner of Harmon
Ave and Koval Lane: ~**300,000 sq ft**, "the length of three football fields,"
set within a 39-acre complex. Above the garages sits a 3-level **Paddock Club**
(incl. roof terrace) for ~8,000 guests. Now branded **Grand Prix Plaza**, hosting
year-round F1 attractions (F1 X, F1 DRIVE, F1 HUB).
([Reuters/RJ – pit building name](https://www.reviewjournal.com/sports/motor-sports/formula-1/f1-las-vegas-grand-prix-pit-building-gets-permanent-name-2978728/);
[F1 logistics feature](https://www.formula1.com/en/latest/article/were-creating-a-new-legacy-the-mind-boggling-logistics-behind-the-las-vegas.GhNlNJbDR3wB8mwkgxZo8);
[Grand Prix Plaza about](https://www.grandprixplaza.com/about-us/))

**Grandstands.** Major spectator zones: **East Harmon**, **West Harmon**, the
**Mirage zone**, and the **T-Mobile Zone at Sphere**. A premium **Bellagio
Fountain Club** of grandstand boxes is built between the Bellagio lake/fountains
and the Strip.
([Motorsport Tickets grandstand guide](https://motorsporttickets.com/blog/las-vegas-grand-prix-grandstands/);
[8 News Now – Bellagio Fountain Club](https://www.8newsnow.com/news/local-news/new-views-of-bellagio-fountain-club-for-las-vegas-grand-prix/))

**Lighting.** Over **1,500 lighting fixtures** light the circuit (enough power for
~13,000 homes), designed for glare-free, consistent illumination. The race is a
flagship **night race**, marketed on the contrast of glowing track sections,
brake discs and sparks against the dark, with the neon Strip as backdrop.
([RJ – track lighting](https://www.reviewjournal.com/sports/motor-sports/formula-1/las-vegas-grand-prix-track-lighting-installation-progresses-to-the-strip-3180190/);
[F1 fan guide](https://www.formula1.com/en/latest/article/speed-neon-and-the-strip-the-ultimate-fan-guide-to-las-vegas.6LafpqS1SuW41zYwdXz2iC))

---

## Signature landmarks (name | height | colour | shape | track position)

| Landmark | Height | Colour | Shape | Track position |
|---|---|---|---|---|
| **The Sphere (Exosphere)** | **111.5 m tall, 157.2 m wide** (366 ft × 516 ft) | Full-RGB LED skin — any colour; cycles vivid imagery (eyeball, planet, emoji), often pure saturated blue/magenta/white | **Giant sphere**; matte dark dome by day, ~580,000 sq ft of LED pucks (~1.2M pucks) lit at night | Encircled by the Sands Ave loop, **T7–T9**; the lap "begins near the Sphere." Sits NE of the Strip. ([JYLED](https://www.szjy-led.com/msg-sphere-las-vegas/), [VFX Voice](https://vfxvoice.com/las-vegas-sphere-worlds-largest-high-res-led-screen-for-live-action-and-vfx/)) |
| **Paris Las Vegas — Eiffel Tower replica** | **164.6 m** (540 ft); half-scale | Iron **brown/bronze** (matched to original's paint chips); warm gold/amber floodlight at night, sparkles on the hour | Lattice steel tower with 4 splayed legs; **2/3-scale Arc de Triomphe** at its base | **Strip straight, T12–T14**, left side (west). ([Wikipedia – Paris Las Vegas](https://en.wikipedia.org/wiki/Paris_Las_Vegas), [Roadside America](https://www.roadsideamerica.com/story/12548)) |
| **Bellagio Fountains** | jets up to **140 m** (460 ft) | Water — white/blue/cyan under colour-changing lights at night | **8.5-acre man-made lake**; 1,214 nozzles, 4,792 lights; choreographed jets | **Strip straight**, west side, in front of Bellagio. Fountain Club stands sit between lake & track. ([Wikipedia – Fountains of Bellagio](https://en.wikipedia.org/wiki/Fountains_of_Bellagio)) |
| **Bellagio (resort tower)** | **151 m** (36 floors) | Warm cream/tan curved facade, warm-lit windows | Curved **Y/crescent** high-rise behind the lake | Behind the fountains, west of Strip. ([Wikipedia – Bellagio](https://en.wikipedia.org/wiki/Bellagio_(resort))) |
| **Caesars Palace** | ~**5 towers**, tallest ~150 m | **Cream / ivory** Roman classical; gold up-lighting | Multiple towers (Augustus/Octavius/Julius) + Roman colonnades, statues | West side of Strip near T14. ([storyhunt – Caesars](https://www.storyhunt.io/en/articles/caesars-palace)) |
| **The Venetian + St Mark's Campanile** | Venetian tower ~**145 m** (475 ft, 36 fl); **Campanile replica 96 m** (315 ft) | **Cream/sand stone**, terracotta-tile roofs; brick-red campanile with green/copper spire & gold gabriel statue | Italianate towers; campanile is a square brick **bell tower** with pyramidal cap; Doge's Palace + Rialto Bridge frontage | NE side of Strip / Sands Ave area. ([Wikipedia – Venetian](https://en.wikipedia.org/wiki/The_Venetian_Las_Vegas)) |
| **The Palazzo** | **195.6 m** (642 ft) | Cream/tan stone, warm glass | Tall rectilinear luxury tower | Sands/Venetian complex, NE. ([List of tallest – Wikipedia](https://en.wikipedia.org/wiki/List_of_tallest_buildings_in_Las_Vegas)) |
| **Wynn & Encore** | Wynn **187 m** (614 ft); Encore **192 m** (631 ft) | **Bronze / copper-tinted curved glass** curtain wall | Two **curved bronze** crescent towers | NE end of Strip near Sands Ave / Sphere approach. ([Wikipedia – Wynn](https://en.wikipedia.org/wiki/Wynn_Las_Vegas), [archpaper](https://www.archpaper.com/2019/01/wynn-resorts-sues-rival-for-imitating-its-architectural-style/)) |
| **Resorts World** | **205 m** (673 ft) | **Bronze curved glass** towers + giant red Chinese-flourish LED facade/screen | Three connected curved bronze towers; huge wraparound LED screen | NE / Sands area. ([Wikipedia – Resorts World](https://en.wikipedia.org/wiki/Resorts_World_Las_Vegas)) |
| **Fontainebleau Las Vegas** | **224 m** (735 ft) — **tallest building in LV** | Blue-tinted glass, sleek modern | Tall tapered glass tower | North Strip backdrop. ([List of tallest – Wikipedia](https://en.wikipedia.org/wiki/List_of_tallest_buildings_in_Las_Vegas)) |
| **The Strat (tower)** | **350 m** (1,149 ft) | White/grey concrete shaft, lit pod | Needle observation tower with bulb pod | Far north, distant skyline silhouette. ([List of tallest – Wikipedia](https://en.wikipedia.org/wiki/List_of_tallest_buildings_in_Las_Vegas)) |
| **High Roller (LINQ wheel)** | **167.6 m** (550 ft) — tallest observation wheel in N. America | White/steel structure; colour-changing LED cabins & spokes at night | **Ferris/observation wheel**, 28 spherical cabins | LINQ promenade, east side of Strip. ([CaesarsLINQ](https://www.caesars.com/linq/things-to-do/attractions/high-roller)) |
| **MGM Grand** | ~**89 m** but vast footprint | **Emerald green** glass + gold lion | Wide green tower block, gold lion statue | SE Strip / Harmon corridor. |
| **"Welcome to Fabulous Las Vegas" sign** | small (~8 m) | Yellow diamond + red/blue text on white starburst | Classic neon roadside sign | Iconic Strip signage motif. |

---

## Skyline & architecture

- **Character:** a dense, theatrical **resort canyon** — themed mega-casinos
  rather than a generic CBD. The Strip is a wall of large tower-hotels (~100–225 m)
  punctuated by replica landmarks (Eiffel, Campanile, Roman colonnades) and one
  giant geometric primitive (the Sphere). Far north sits the needle Strat.
- **Materials by era / theme — NOT uniformly dark glass:**
  - **Bronze / copper curved glass:** Wynn, Encore, Resorts World — a signature
    LV look (curved crescent towers in warm metallic glass).
  - **Cream / ivory / sand stone:** Caesars Palace, Bellagio, Venetian, Palazzo,
    Paris — the warm "Mediterranean/Roman" cluster, NOT grey.
  - **Emerald green glass:** MGM Grand.
  - **Blue / neutral modern glass:** Fontainebleau, Aria, Cosmopolitan, Vdara.
  - **Black/dark glass with magenta-gold trim:** more the *night-lit* read; many
    facades are warm stone that simply read dark in shadow between lit windows.
- **Density:** continuous street-wall along the Strip; both sides built up to the
  kerb with very little gap. Tall setback towers behind a lower street-level
  podium/retail band.
- **Heights for scale (real):** Fontainebleau 224, Resorts World 205, Palazzo 196,
  Trump 195, Encore 192, Wynn 187, Bellagio 151, Caesars ~150, Venetian ~145,
  Eiffel 165, Campanile 96, Sphere 111 (but 157 wide), Strat 350 (distant).

---

## Barriers, grandstands, kerbs, surface

- **Barriers:** standard F1 street-circuit kit — concrete blocks, **TecPro**
  barriers and **debris fencing** line public roads (Las Vegas Blvd, Koval,
  Harmon, Sands). On the Strip, barrier walls were wrapped/branded with sponsor
  and event livery; tyre stacks at high-risk apexes. There is no single official
  "gold/black/magenta" armco livery — that is a stylisation; real walls are
  concrete-grey with white/yellow accent paint and sponsor wraps (Heineken, MGM,
  etc.). ([F1 fan guide](https://www.formula1.com/en/latest/article/speed-neon-and-the-strip-the-ultimate-fan-guide-to-las-vegas.6LafpqS1SuW41zYwdXz2iC))
- **Grandstands:** large temporary tubular-steel stands with dark seating;
  branded fascia banners. Signature ones: T-Mobile Zone at Sphere, West/East
  Harmon, Mirage zone, and the premium **Bellagio Fountain Club** boxes facing
  the lake. Pit grandstands face the permanent **Grand Prix Plaza** building.
- **Pit building:** **permanent, modern** glass-and-steel grandstand-topped
  structure (3 levels, ~300,000 sq ft, ~3 football fields long) — visually a real
  building, not a temporary marquee. This is unique among F1 street circuits.
- **Kerbs:** standard F1 **red-and-white** serrated kerbs; some sausage/exit kerbs.
- **Surface:** freshly laid dark asphalt on the new sections (parking-lot S/F,
  Sphere loop) blended with public-road tarmac; smooth, dark, with the white
  edge/lane lines of public boulevards in places. Run-off is minimal (street
  circuit) — walls close to track, with asphalt/painted run-off at a few corners.

---

## Vegetation & water

- **Palms:** Las Vegas Boulevard is famously lined with **tall date/fan palms**
  and palm clusters in median planters and resort frontages. Palms are the
  dominant trackside vegetation.
- **Planters / landscaping:** manicured resort gardens (Bellagio Conservatory
  frontage, Wynn/Encore greenery), low ornamental shrubs and uplit planter beds.
- **Water:** the **Bellagio fountains / 8.5-acre lake** is the marquee water
  feature (jets to 140 m, choreographed, uplit white/blue). Other water features:
  the Venetian's canals/Grand Canal frontage, Caesars/Mirage pools (Mirage's
  volcano was a feature pre-demolition). Desert context otherwise — dry, no
  natural greenery beyond irrigated resort landscaping.

---

## Atmosphere / lighting / signage

- **Time of day:** **night race** — dark sky, the whole scene defined by artificial
  light. Floodlit track + neon-saturated surroundings.
- **Floodlight colour:** cool white/LED floodlights on the track itself (glare-free
  spec lighting). The *ambient glow* of the city is warm gold + saturated neon.
- **Neon palette:** the Strip's signature mix — **magenta/hot-pink, cyan/aqua,
  electric blue, gold/amber, violet, red, lime/green**. The Sphere adds full-RGB
  animated content (often blue, magenta, white). Casino marquees are huge LED
  screens cycling bright content.
- **Warm vs cool:** resort facades and replica landmarks (Eiffel, Caesars, Bellagio)
  are **warm gold/amber up-lit**; club/nightlife and LED screens skew **cool
  magenta/cyan**. This warm-stone-vs-cool-neon contrast is the defining LV look.
- **Signage / sponsors:** heavy commercial signage — Heineken (title-ish presence),
  MGM, casino-brand marquees, plus the classic **"Welcome to Fabulous Las Vegas"**
  starburst sign as a national-identity motif. National identity = American /
  Nevada desert + the Strip's themed-resort kitsch (faux Paris, Venice, Rome).
- **Reflections:** wet-look dark asphalt and glass towers mirror neon — strong
  specular highlights and coloured reflections are characteristic.

---

## Gap analysis vs current game (specific & concrete: what's missing/wrong/could be more accurate)

Current build (`js/tracks/vegas.js` + `tracks.js` STYLES/BARRIER/FURN):
Strip skyline `cityFront` + ~28 neon/LED towers 60–180 m; a glowing **Sphere**
landmark (radius 66 m, 12 frustum bands); Bellagio fountain water/jet planes;
**gold/black/neon-magenta** barrier livery; palm trees + gold "arm" lamps;
Eiffel tower (130 m), Venetian cluster + campanile, Caesars, MGM, High Roller
ferris wheel, "Welcome to Las Vegas" billboard, grandstands at Harmon chicane.

**Strengths already present:** the Sphere, Eiffel, Bellagio fountains, Venetian
campanile, Caesars, High Roller, palms, and the neon canyon are all modelled —
this is one of the more complete track files.

**Gaps / inaccuracies:**

1. **Sphere dimensions slightly off & shape.** Built as a full sphere of radius
   66 m → ~132 m diameter and ~132 m tall. Real Sphere is **157 m wide but only
   111 m tall** — it is a *flattened* sphere/dome wider than it is tall. Current
   geometry is too tall-relative-to-wide and slightly too small in width.
2. **Sphere position.** It's placed at s 0.30 on the inside; real lap *encircles*
   it on the Sands loop (≈T7–T9) and it should read as a landmark the track
   *wraps around*, visible over a sustained stretch, not a single side prop.
3. **Eiffel too short.** Modelled at 130 m; real replica is **164.6 m** (540 ft) —
   should be the tallest slender landmark on the Strip side after the Sphere.
4. **Missing signature bronze towers.** **Wynn, Encore, Resorts World** — the
   curved **bronze/copper glass** crescent towers (187–205 m) — are absent. The
   bronze-glass curved tower is arguably *the* modern LV silhouette and nothing
   in the build is bronze or curved.
5. **Missing tall backdrop landmarks.** **Fontainebleau (224 m, blue glass,
   tallest)** and the **Strat needle (350 m)** would anchor the far skyline; both
   absent.
6. **Colour: facades too uniformly dark/purple-grey.** Real Strip has a strong
   **warm cream/ivory cluster** (Caesars, Bellagio, Venetian, Palazzo, Paris) and
   **emerald-green MGM** and **bronze Wynn/RW**. Current `cityFront` palettes are
   nearly all dark grey-violet (`[0.20,0.18,0.24]`-ish). Reads too monochrome /
   too "generic night CBD," not enough themed-resort colour identity.
7. **Barrier livery is a stylisation, not real.** Gold/black/magenta armco is
   invented. Real walls are concrete-grey + white/yellow accents + sponsor wraps
   (Heineken/MGM). Acceptable as game flavour, but a concrete-grey base with
   coloured sponsor-board *segments* would be more authentic.
8. **Kerbs not called out.** Real red/white serrated kerbs — confirm the kerb
   colour matches (street circuits use standard red/white; current file should
   not tint them gold).
9. **Pit building generic.** The real **Grand Prix Plaza** is a permanent, modern
   3-level glass grandstand-building (3 football fields long) — distinctive. The
   build uses generic `grandstand()` calls at the Harmon chicane; a signature
   long lit glass pit structure would be more accurate.
10. **MGM colour wrong.** Modelled as dark-grey/gold; the real MGM Grand is
    **emerald-green glass** with a gold lion — a recognisable colour cue currently
    missed.
11. **Mirage.** Referenced as a landmark in F1 marketing, but the real Mirage was
    demolished (redeveloping into Hard Rock guitar-tower); fine to drop or
    repurpose as a generic Strip block.

---

## Concrete scenery recommendations (actionable)

**Sphere (highest impact):**
- Reshape to **oblate**: width radius ~78 m (157 m wide) but vertical radius
  ~56 m (111 m tall) — scale the band `y` by ~0.71 so it's wider than tall.
- Keep the full-RGB LED band palette (blue/magenta/white/cyan is correct).
- Optionally extend its visibility across s≈0.26–0.34 so the encircling
  Sands-loop read is stronger (it's the corner the track wraps around).

**New / corrected landmarks:**
- **Eiffel:** raise tower height 130 → **160 m**; keep bronze-brown col
  (`~[0.42,0.32,0.20]`), warm gold up-light. Add a small Arc-de-Triomphe block
  at its base.
- **Add Wynn + Encore (NE / Sands approach, ~s 0.32–0.40):** two **curved bronze
  glass** towers, ~187 m and ~192 m, col `~[0.55,0.40,0.22]` warm metallic, low
  roughness so they catch neon.
- **Add Resorts World (NE backdrop):** three bronze towers ~205 m + a large
  **red Chinese-flourish LED screen** facade panel (use a `billboard`/emissive
  red plane).
- **Add Fontainebleau (far north backdrop, tallest):** ~**224 m** blue-tinted
  glass tower `~[0.30,0.40,0.55]`, the highest backdrop silhouette.
- **Add the Strat needle** as a single distant silhouette ~350 m on the far
  backdrop (thin shaft + lit pod) — instantly reads as Vegas.
- **MGM Grand:** recolour to **emerald green** glass `~[0.10,0.45,0.25]` with gold
  trim, not dark grey.

**Colour corrections (skyline identity):**
- Re-bias the Strip `cityFront` palettes into **3 cohesive clusters** instead of
  uniform grey-violet:
  - Warm cream/ivory cluster (Caesars/Bellagio/Venetian/Palazzo/Paris):
    `~[0.62,0.58,0.50]`–`[0.70,0.65,0.55]`, warm gold windows.
  - Bronze/copper cluster (Wynn/Encore/RW): `~[0.50,0.38,0.22]`, low roughness.
  - Cool modern glass cluster (Aria/Cosmo/Fontainebleau): `~[0.20,0.26,0.34]`,
    cyan/white windows.
- Keep the dark-purple night towers only as the *filler* canyon, not 100% of it.

**Barriers / surface:**
- Optionally swap the invented gold/black/magenta armco for a **concrete-grey
  base** (`~[0.55,0.55,0.58]`) with periodic **sponsor-board colour segments**
  (Heineken green, MGM gold/black, magenta event wrap) and red/white tyre caps at
  apexes — closer to real wrapped-wall look while keeping neon flavour.
- Confirm kerbs are standard **red/white** serrated (not tinted gold).

**Pit / paddock:**
- Add a single **long, modern lit-glass pit/grandstand building** ("Grand Prix
  Plaza") along the start/finish straight — ~300 m long, 3 tiers, cool-white lit
  glass with warm interior glow — as a permanent-architecture cue distinct from
  the temporary Harmon stands.

**Vegetation / water (already good — minor):**
- Keep palm rows along the Strip (correct). Add a few **median-planter palm
  clusters** and uplit planter beds.
- Bellagio fountains are well modelled; ensure jet columns read **white/blue/cyan**
  (correct) and sit in the wide lake plane facing the Strip straight, with the
  **Fountain Club grandstand** between lake and track.
