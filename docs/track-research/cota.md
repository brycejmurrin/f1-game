# Circuit of the Americas (COTA, Austin) — visual reference

Visual research for Apex 26 procedural scenery. Sources cited inline. WebFetch was
blocked at the proxy (403) for several hosts, so facts were extracted from WebSearch
result content with the underlying source URLs cited.

> **Note on the "Velocity tower":** there is **no separate twisted multi-coloured
> sculpture** at COTA. "Velocity" is a hospitality lounge on the top floor of the
> Main Grandstand, not an artwork
> ([circuitoftheamericas.com](https://circuitoftheamericas.com/venue/velocity-lounge/)).
> The single iconic vertical colour landmark is the red-veiled Observation Tower.
> Do **not** model a separate "Velocity" sculpture.

## Real-world surroundings

- ~1,500-acre site in **Del Valle**, in **rolling hills ~15 mi (24 km) SE of downtown
  Austin** ([austintexas.org](https://www.austintexas.org/austin-insider-blog/blog/post/experiencing-circuit-of-the-americas/)).
- 20-turn **counter-clockwise** layout exploiting naturally undulating land, incl. the
  **133-ft (≈41 m) hill at Turn 1** ([austintexas.org](https://www.austintexas.org/austin-insider-blog/blog/post/experiencing-circuit-of-the-americas/)).
- Built on **Blackland Prairie clay** — swells/contracts, cause of the famous bumps
  ([grokipedia.com](https://grokipedia.com/page/Circuit_of_the_Americas)).
- Terrain is **gently rolling to nearly level** open prairie/savannah with scattered
  tree stands — not dramatic mountains
  ([tpwd.texas.gov](https://tpwd.texas.gov/wildlife/wildlife-diversity/wildscapes/wildscapes-plant-guidance-by-ecoregion/the-blackland-prairies/)).

## Signature landmarks

| Name | Height | Colour | Shape | Track position |
|---|---|---|---|---|
| **Observation Tower** | 251 ft / **76.5 m** (deck 230 ft / 70 m), 419 stairs | white/silver steel diagrid + **18 bright-RED tubes** ("veil") | double-helix lattice wrapped in filigree diagrid, ring-like deck on top | end of the Grand Plaza, behind/over the amphitheatre stage |
| **Austin360 / Germania Amphitheater** | ~14,000 cap | **RED steel-tube canopy** matching the tower | fans out over the stage, converges into the tower base to form the veil | carved into centre of Grand Plaza |
| **Turn 1 hill** | ≈41 m climb, ~11% | grass/asphalt | blind uphill crest | immediately after the start/finish straight |
| **Main Grandstand** | covered (rows 6+) | — | large permanent covered stand | over the start/finish line, main straight |

- Tower by **Miró Rivera Architects**; veil = 18 red steel tubes, red chosen to evoke
  light-streaks of racecars; deck has a **partial glass floor**, ~70 cap
  ([circuitoftheamericas.com](https://circuitoftheamericas.com/blog/2024/2/20/all-about-the-cota-tower/),
  [architizer.com](https://architizer.com/projects/observation-tower-circuit-of-the-americas/)).
- **Italian cypress** line the amphitheatre seating
  ([archello.com](https://archello.com/project/grand-plaza-and-amphitheater)).
- 3 permanent grandstands (Main, Turn 1, Turn 15) + temporary at Turns 4, 9, 12, 19
  ([thef1spectator.com](https://www.thef1spectator.com/united-states-grand-prix-travel-guide/where-to-watch/)).

## Skyline & architecture

- **Downtown Austin skyline IS visible** but only as a **distant low cluster on the
  horizon** (~24 km), clearly seen mainly from the tower deck
  ([architizer.com](https://architizer.com/projects/observation-tower-circuit-of-the-americas/),
  [mountbonnell.info](https://www.mountbonnell.info/visiting-austin/10-things-to-do-at-austins-circuit-of-the-americas)).
- On-site architecture is otherwise **low-rise**: red tower + amphitheatre canopy
  dominate; grandstands, pit building, and the 20-acre axial Grand Plaza are the mass
  ([archello.com](https://archello.com/project/grand-plaza-and-amphitheater)).

## Water, vegetation & terrain

- **Water feature:** the Grand Plaza has a **large reflecting pool** at one end, tower +
  amphitheatre on the opposite end of a strong axial line
  ([archello.com](https://archello.com/project/grand-plaza-and-amphitheater)).
- **Soil is dark brown / near-black Blackland clay — NOT red dirt**
  ([travis-tx.tamu.edu](https://travis-tx.tamu.edu/about-2/horticulture/soils-and-composting-for-austin/the-real-dirt-on-austin-area-soils/)).
- Vegetation: **live oak** dominant + post/blackjack oak, cedar elm, sugarberry, honey
  mesquite, eastern redcedar; ground = **bleached tall-grass prairie** (little bluestem,
  Indiangrass, switchgrass). Reads as dry scrubby oak/mesquite clumps + straw grass over
  rolling-to-flat ground — not lush forest. Ornamental Italian cypress only at the
  amphitheatre
  ([tpwd.texas.gov](https://tpwd.texas.gov/landwater/land/programs/landscape-ecology/ems/emst/herbaceous-vegetation/texas-blackland-tallgrass-prairie),
  [texastreeid.tamu.edu](http://texastreeid.tamu.edu/content/texasEcoRegions/BlacklandPrairies/)).

## Grandstands, kerbs, surface

- Surface **asphalt**, **red/white kerbs**, beyond kerb a **red-painted verge**
  ([grid.life](https://www.grid.life/cota-drivers-resources-1)).
- Run-off **mostly asphalt**, with gravel/grass added at Turn 19; surface notoriously
  **bumpy** from clay settlement
  ([grokipedia.com](https://grokipedia.com/page/Circuit_of_the_Americas)).

## Atmosphere / lighting / signage

- **Day race under strong Texas sun** (October afternoon) — bright, high, hazy sun, big
  open prairie sky, long sightlines
  ([austintexas.org](https://www.austintexas.org/austin-insider-blog/blog/post/experiencing-circuit-of-the-americas/)).
- Strong **US + Texas (Lone Star)** branding; dominant on-site colour accent is the
  **bright red** of the tower veil and amphitheatre canopy.

## Gap analysis vs current game

The current `cota.js` builds a 77 m red-deck Observation Tower (✔ close), a "Velocity
Tower" multi-frustum (✘ does not exist — remove), a Texas water tower (unverified —
not a documented landmark), the Austin360 canopy (✔), and red-soil amphitheatre
embankments + Texas Hill Country **ridge rings** (✘ overstated — terrain is rolling
prairie, not ridged hills; soil is dark brown not red).

- **Remove the "Velocity Tower."** It's fictional.
- **Soil colour is wrong:** change red dirt → **dark brown/near-black** Blackland clay.
- **Hill Country ridge rings are too dramatic:** flatten to gentle rolling swells; keep
  a faint distant low Austin skyline cluster on the horizon only.
- Observation tower colour/shape is good — ensure white diagrid + ~18 red vertical
  tubes reads, and the red amphitheatre canopy fans into its base.

## Concrete scenery recommendations

1. **Hero:** red double-helix Observation Tower (~77 m, white diagrid + 18 red tubes,
   ring deck) at the Grand Plaza end — visible from much of the lap.
2. Red steel-tube **amphitheatre canopy** fanning into the tower base.
3. **Reflecting pool** on the Grand Plaza axis (the real water feature) — not generic
   lakes.
4. Pronounce the **Turn 1 hill** (~41 m climb, ~11%) right off the main straight.
5. **Dark-brown clay** earth + **bleached tall-grass** verges + clumped live-oak/mesquite
   stands; flat-to-rolling ground; distant low Austin skyline on the horizon only.
6. **Red/white kerbs**, **red-painted verge**, mostly asphalt run-off (gravel/grass at
   T19), slightly bumpy tarmac.
7. Bright daytime sky, warm high Texas sun; US/Texas red-white-blue signage; red as the
   signature colour beacon of the complex.
