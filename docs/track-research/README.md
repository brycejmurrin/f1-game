# Per-track visual research — index

Visual reference research for all 24 Apex 26 circuits, gathered to make the procedural
per-track scenery (`js/tracks/*.js` `scenery()` + the `buildProps`/`buildRoad` dressing
in `js/tracks.js`) more accurate. One file per circuit; each has: real-world surroundings
(cited), a signature-landmark table, skyline/architecture, barriers/grandstands/kerbs/
surface, vegetation/water, atmosphere/lighting/signage, **gap analysis vs the current
game**, and **concrete scenery recommendations**.

> **Sourcing caveat:** the agent proxy returns 403 for WebFetch on most reference hosts
> (Wikipedia, F1.com, official circuit sites, Fandom — they bot-block, the proxy itself
> is healthy). All facts were drawn from WebSearch result extracts with the underlying
> source URLs cited inline. Numbers (heights, distances) are best-effort and worth a
> second check before they drive geometry.

## Files

| Circuit | File | Theme (current) | Headline finding |
|---|---|---|---|
| Abu Dhabi | [abudhabi.md](abudhabi.md) | desert/night | Colour-shifting LED grid-shell **arches over the track**; add Ferrari World red-dune roof; it's a **flat island**, not dunes; dusk→night |
| Albert Park | [albert_park.md](albert_park.md) | green/day | Eureka Tower needs its **gold crown** + correct 297 m; add Australia 108; skyline across the **lake**; palms + gums mix |
| Bahrain | [bahrain.md](bahrain.md) | desert/night | **No Manama skyline** (isolated desert); Sakhir Tower shorter + **sail-canopy** top; pale limestone sand (not red); floodlit date palms |
| Baku | [baku.md](baku.md) | street/night | **It's a daytime race**; Flame Towers shorter (~182 m) + LED-image flame (no 3D cones); Maiden Tower ~29 m flat-top |
| COTA | [cota.md](cota.md) | green/day | **"Velocity tower" is fictional** — remove; dark-brown clay (not red); rolling prairie (not ridges); red helix tower is the hero |
| Hungaroring | [hungaroring.md](hungaroring.md) | green/day | **Infield pond is fake** — remove; dry **dusty/sandy straw** palette (not lush green); sparse oak woodland, open spectator banks |
| Imola | [imola.md](imola.md) | green/day | Senna memorial is a **seated bronze statue** (not a white box); river hugs the Tamburello wall; mixed broadleaf park trees |
| Interlagos | [interlagos.md](interlagos.md) | green/day | Favela close + SP skyline **far north**; add Senna mirror statue + Kobra mural; lakes mid/far distance; bumpy patchwork tarmac |
| Jeddah | [jeddah.md](jeddah.md) | street/night | Fountain is a **312 m water jet far offshore** (not a near tower); add **Floating Mosque** (turquoise dome); trackside is sparse/low-rise |
| Madrid | [madrid.md](madrid.md) | modern/day | **IFEMA Barajas**, not downtown — low wide white pavilions; Cuatro Torres are far SW (not near); La Monumental banked bowl is the hero |
| Mexico | [mexico.md](mexico.md) | modern/day | **Day race in a green park** (not desert/night); **Foro Sol stadium encloses the track**; add Palacio de los Deportes copper dome; Día de Muertos |
| Miami | [miami.md](miami.md) | modern/day | **Downtown skyline is wrong** (16 mi away) — remove; marina is **fake/painted**; Hard Rock Stadium + **aqua run-off** are the heroes |
| Monaco | [monaco.md](monaco.md) | street/day | Casino is a **trio** (Hôtel de Paris + Casino + Café de Paris); add green-copper Belle Époque roofs, Yacht Club, Tour Odéon |
| Montreal | [montreal.md](montreal.md) | green/day | **Island in a river**; add **Biosphère steel dome** + La Ronde wheel across the water; Olympic Basin flanks the back straight; "Bonjour Québec" wall |
| Monza | [monza.md](monza.md) | green/day | Add the **ruined banked oval** (the missing icon); deciduous-dominant park trees (not pine-heavy); Tifosi red |
| Qatar | [qatar.md](qatar.md) | desert/night | Hero is the **402 m record pit building** (not a stadium); flat tan plain (not dunes); **artificial-grass border** ring; densest floodlights |
| Red Bull | [redbull.md](redbull.md) | green/day | **Bull is rusted Corten + gold horns** (not black/white) and sits in the infield; Wing pit building = spoiler profile; lower/greener mountains |
| Shanghai | [shanghai.md](shanghai.md) | modern/day | **Pearl Tower/Pudong NOT visible** (30 km away) — remove; build the circuit's own lotus canopies + Moon-Gate arches + paddock lake; humid/overcast |
| Silverstone | [silverstone.md](silverstone.md) | green/day | The Wing is **silver, not white**; terrain is **flat airfield** (remove mountain rings); open farmland + copses (not dense forest) |
| Singapore | [singapore.md](singapore.md) | street/night | Bay landmarks sit **across the water** (not in the canyon); Flyer is 150 m; add Merlion; taller CBD; **bay reflections** are the big win |
| Spa | [spa.md](spa.md) | green/day | **Belgian-flag run-off paint** + Wallonia kerbs; dense Ardennes **conifer** wall; add the pit-straight tower; gravel traps; overcast/wet |
| Suzuka | [suzuka.md](suzuka.md) | green/day | Add the **red ~50 m ferris wheel** (helper exists!) near start/finish + the **figure-8 crossover bridge**; rolling terrain; bright spring day |
| Vegas | [vegas.md](vegas.md) | street/night | **Sphere is oblate** (157 w × 111 h, not round); add bronze curved towers (Wynn/Encore/RW); themed resort colour clusters; Grand Prix Plaza pit |
| Zandvoort | [zandvoort.md](zandvoort.md) | modern/day | **Golden dune sand, NOT green pine forest** (biggest error); keep the steep **banking** dramatic; grey-green marram; drop wind turbines |

## Cross-cutting themes (apply broadly)

**1. Wrong setting / phantom skylines — the highest-impact category.** Several tracks
build a city skyline that isn't actually visible from the circuit:
- **Shanghai** — Oriental Pearl / Pudong is ~30 km away → remove; build the circuit's own
  architecture against a flat low-rise suburban horizon.
- **Miami** — downtown is ~26 km away → remove the 36-tower skyline; the stadium is the hero.
- **Madrid** — it's flat IFEMA Barajas, not downtown; Cuatro Torres are ~10 km SW → demote
  to a faint distant cluster on one bearing.
- **Bahrain** — Manama not visible → empty desert horizon.
- **Interlagos** — corporate skyline is *far north*; the *close* backdrop is favela housing.
- **Albert Park / Montreal** — skylines *are* real but sit **across water** on a specific
  bearing, not ringing the lap.

**2. Wrong time of day.** **Baku** is a daytime race (game uses full night). **Mexico** is
a green-park day race (game leans night/desert). **Abu Dhabi** is a signature **dusk→night**
twilight race. Many night races (Bahrain/Qatar/Singapore/Jeddah) use **cool-white LED**
floodlight, not warm sodium — verify `floodColor()` mapping per track.

**3. Wrong terrain/palette.**
- **Zandvoort** — golden coastal **dune sand**, not green pine forest (theme/palette + the
  `forestEdge` pines are the single biggest error in the whole set).
- **Hungaroring** — dry dusty **straw/sand**, not lush green; open banks, not dense forest.
- **Qatar / Bahrain** — flat pale-tan plains, not "dune rings."
- **Silverstone** — flat airfield, remove the green mountain backdrop rings.
- **COTA** — dark-brown clay (not red dirt); rolling prairie (not ridges).

**4. Missing signature landmarks (cheap, high-value adds).**
- **Suzuka** — red ~50 m ferris wheel (the `ferrisWheel()` helper already exists) + figure-8 crossover bridge.
- **Monza** — the ruined banked oval (Sopraelevata) in the park.
- **Montreal** — Biosphère geodesic steel dome + Olympic Basin + La Ronde wheel.
- **Mexico** — Palacio de los Deportes copper geodesic dome; the track-enclosing Foro Sol stadium.
- **Imola** — the seated bronze Senna statue (currently a flat white box).
- **Interlagos** — mirror-aluminium Senna statue + giant Kobra mural.
- **Jeddah** — the turquoise-dome Floating Mosque; the fountain as a far-offshore water jet.
- **Singapore** — the Merlion; bay-water reflections of the across-water skyline.

**5. Landmark accuracy (shape/colour/scale corrections).**
- **Vegas** — Sphere is oblate (flatten ~0.71); add bronze curved-glass resort towers; theme the resort colour clusters.
- **Baku** — Flame Towers ~182 m teardrops with LED-image flame (no 3D cones); Maiden Tower ~29 m flat-top.
- **Red Bull** — bull = rusted Corten + gold horns (not near-black/white), in the infield not Turn 1.
- **Silverstone / Red Bull** — the Wing / voestalpine-wing pit buildings should read as their actual aerofoil/spoiler silhouettes.
- **Monaco** — Casino Square is a three-building composition with green-copper Belle Époque roofs.

**6. Surface, kerb & run-off signatures worth painting in.**
- Belgian-flag run-off + Wallonia kerbs (**Spa**); Dolphins **aqua run-off** (**Miami**);
  artificial-grass border ring + pyramid sausage kerbs (**Qatar**); negative kerbs T6–7
  (**Albert Park**); green/yellow Senna-tribute kerb (**Hungaroring**, **Red Bull** yellow
  sausage kerbs); patchwork bumpy tarmac (**Interlagos**, **COTA**, **Monaco**).

## Suggested next step

These docs are research, not code changes. A reasonable follow-up is to pick the
highest-impact, lowest-risk fixes first — the "wrong setting" removals (Shanghai/Miami/
Madrid phantom skylines), the Zandvoort dune/forest palette, and the cheap landmark adds
(Suzuka ferris wheel, Montreal Biosphère) — and implement them per circuit, running
`node tools/verify-track.cjs <id>` after each `scenery()` edit.
