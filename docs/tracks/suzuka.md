# Suzuka Circuit — Visual Design Brief

**Game setting:** DAY · green theme · figure-8 with crossover bridge.

## 1. Setting
Suzuka Circuit sits in Suzuka, Mie Prefecture, central Japan, on a 145-hectare leisure complex backed by forested hills and facing Ise Bay. The adjacent **Suzuka Circuit (Motopia) theme park** wraps the infield with car-themed rides, a hotel, and a giant Ferris wheel — a permanent, friendly skyline of color above the racing.

## 2. Atmosphere & palette
A clear-to-hazy spring/autumn sky, soft and slightly milky toward the horizon. Rolling **green hills** dominate the backdrop in layered tones — near `[0.25, 0.55, 0.25]`, distant haze-greyed `[0.45, 0.6, 0.5]`. Scatter **cherry-blossom accents** `[0.95, 0.75, 0.82]` against the green for seasonal pop. Low morning **fog** can pool in the esses valley — a soft white-grey `[0.85, 0.88, 0.9]` haze band near the ground. Kerbs flash red/white; grass is vivid managed green.

## 3. Elevation
Suzuka constantly **undulates**. From the start/finish the track climbs through the Esses (s≈0.10–0.22), keeps climbing to Degner, then **drops** sharply through Degner and into the underpass. The **figure-8 crossover** is here: the back loop dips **under** the main straight near **s≈0.37**, then later the racing line climbs the **crossover bridge over** the straight approaching 130R near **s≈0.82**. Spoon sits low (s≈0.62), with a long climb back up to 130R.

## 4. Landmarks & surroundings by lap position

| s (0–1) | Side | Distance | Box-modelling description |
|---|---|---|---|
| 0.00 | R | near | Tall pit/paddock building: long low grey box + slab roof, pit-lane wall strip |
| 0.00 | L | near | Main grandstand: stepped stacked dark-blue box rows under flat canopy |
| 0.02 | L | far | Giant **Ferris wheel** (Motopia): white ring on main straight — decluttered Motopia behind |
| 0.15 | R | mid | Esses grandstand: low tiered box terraces facing the climb |
| 0.18 | both | far | Forested **Mie hills**: big layered green box silhouettes, haze-fade |
| 0.18–0.22 | L | mid | **Cherry trees**: sparse pink sakura along the Esses climb (not Motopia) |
| 0.37 | over | near | **Crossover underpass**: dark enlarged portal where back loop dips under straight |
| 0.45 | R | mid | Hairpin grandstand: compact stacked box bank, advertising hoarding strip |
| 0.62 | L | mid | Spoon grandstand: low curved box terrace at the low point |
| 0.81 | over | near | **Crossover bridge**: bold green span lifting line over the main straight |
| 0.84 | R | mid | 130R grandstand: thin tall box bank tight to the flat-out left |
| 0.94 | both | near | **Casio Triangle** stands: paired box terraces framing the final chicane |

## 5. Track features
Figure-8 **crossover** (underpass at s≈0.37, bridge at s≈0.82); the high-speed **S-Curves** (alternating left-right boxes, T3–7); blind-drop **Degner** right kink pair; tight left **Hairpin**; double-apex **Spoon**; flat-out **130R** sweep; tight **Casio chicane** before the line. Red/white **kerbs** and wide green run-off everywhere.

## 6. Modelling notes
- Lean green: layered hill boxes at three haze-depths sell the forested Mie backdrop more than any single object.
- Make the **Ferris wheel** the hero skyline landmark on the main straight (s≈0.02) — Motopia behind it stays sparse (no coaster/swing clutter).
- Model the two **crossover** events distinctly: a dark enlarged underpass portal at s≈0.37, then a bold green bridge span at s≈0.81.
- Use the **undulation**: Esses climb rise is punched so grandstands sit on a visible hill, not a flat plane.
- Sprinkle small pink cherry-box clusters sparsely on the Esses climb only (s≈0.18–0.22 L).
- Keep kerb boxes thin, bright red/white, and tightly hugging the S-Curves and chicane to read the rhythm.

## 7. Research pass — the Mie landscape

Suzuka's built environment was already well covered: the Ferris wheel hero on
the main straight, the Motopia park behind it, the hotel block, the
figure-of-eight crossover, all the named corners.

**Note a deliberate decision already in the code:** the park's coaster loops
and chair-swing were *removed* on purpose because they competed with the Ferris
rim on the main-straight skyline. Do not add them back — a fuller Suzuka has to
come from somewhere other than more fairground clutter.

So this pass went to the landscape instead. The circuit sits in the foothills of
the Suzuka mountains in Mie, and it already plants the **sugi** (cedar) that
covers those hills. Two things were missing:

- **Bamboo groves.** At the edge of every Japanese hill plantation, where the
  cedar thins toward cleared ground, there is bamboo — and it looks nothing
  like a tree: tall, bare, pale, absurdly slender culms in a dense stand with
  all the foliage in the top third. Ten groves of 14–22 culms (a grove is a
  clump, not a scatter). **Cedar and bamboo side by side is the read; cedar
  alone could be Oregon.**
- **A hillside shrine and torii.** Mie is Shinto country — Ise Jingu is an hour
  down the road — and a small wooded shrine with a vermilion torii at the foot
  of its steps is as ordinary here as a church spire in the Ardennes. One only,
  set back on the wooded rise at the Spoon side (s≈0.648, L, gap 96) so it
  reads against the cedar instead of competing with the wheel. Torii
  proportions are the whole read: splayed pillars, curved-up *kasagi* over a
  straight *nuki*. Stone steps, a pair of stone lanterns, and the *honden*
  under a heavy dark hip roof whose deep overhanging eaves are its silhouette.
