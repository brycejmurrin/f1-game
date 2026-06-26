# Baku — visual reference

Research for the Apex 26 procedural scenery of the Baku City Circuit (Azerbaijan
Grand Prix). All measurements and descriptions below are from cited real-world
sources; the final two sections compare them against the current game build
(`js/tracks/baku.js`, `theme: street_night`) and give concrete fixes.

## Real-world surroundings (researched facts, with sources/URLs cited inline)

- **The circuit.** 6.003 km street circuit (4th-longest on the calendar), 20
  corners (8 right / 12 left), run **anti-clockwise**, designed by Hermann Tilke.
  It threads three distinct zones: (1) tight 90° street blocks around the city
  centre / Government House, (2) the narrow uphill **"Castle Section"** squeezing
  past the medieval Old City walls near the Maiden Tower (the track pinches to a
  signature **7.6 m wide** at the Turn 8 complex), and (3) a long blast down the
  Caspian seafront (Neftchilar Avenue) back to the line. Start/finish and the
  temporary 44-garage pit complex sit at **Azadliq (Freedom) Square, directly
  opposite the Government House**.
  ([Wikipedia – Baku City Circuit](https://en.wikipedia.org/wiki/Baku_City_Circuit),
  [RacingCircuits.info](https://www.racingcircuits.info/asia/azerbaijan/baku.html),
  [Tilke portfolio](https://tilke.de/portfolio/baku-f1-city-circuit/),
  [Grokipedia](https://grokipedia.com/page/Baku_City_Circuit))
- **The main straight is ~2.2 km** along the Caspian shoreline (Neftchilar Ave),
  by far the longest flat-out section in F1 — roughly twice the Kemmel or Monza
  straights.
  ([Total Motorsport](https://www.total-motorsport.com/how-long-baku-straight-azerbaijan-gp/),
  [F1 Experiences](https://www.facebook.com/F1Experiences/posts/740627405145169/))
- **Race is a daytime/afternoon event, not night.** The 2026 GP starts at
  **15:00 local** (mid-afternoon), under generally clear, warm, dry September
  weather on the Caspian. This is a key mismatch with the game's full-night build
  (see gap analysis).
  ([Oversteer48 schedule](https://oversteer48.com/azerbaijan-baku-grand-prix-schedule/),
  [RacingNews365](https://racingnews365.com/f1/races/azerbaijan-gp),
  [Motorsport Tickets](https://motorsporttickets.com/blog/race-ready-azerbaijan-f1-schedule-and-travel-guide/))
- **The skyline is a deliberate clash of eras:** ancient honey/sand-coloured Old
  City (Icherisheher) and its battlemented walls in the foreground, grand
  Soviet/European stone facades (Government House) around the start, and modern
  glass towers + the Flame Towers crowning the hill behind. The Caspian Sea is on
  the inside of the long straight.

## Signature landmarks (name | height | colour | shape | track position)

| Name | Height | Colour | Shape | Track position |
|---|---|---|---|---|
| **Flame Towers** (3) | **182 m tallest** (south/residential); hotel ~160 m, office ~140 m — often cited "190 m" | Blue-tinted glass curtain wall by day; **full-facade LED screens** showing moving flames / Azerbaijani-flag colours by night | Three tapered, curved **flame/teardrop** silhouettes on a hilltop, tops leaning to one tip | **High on the hillside, well behind & above** the city — a distant backdrop overlooking the whole lap, NOT trackside. ([Wikipedia – Flame Towers](https://en.wikipedia.org/wiki/Flame_Towers), [Werner Sobek](https://www.wernersobek.com/projects/baku-flame-towers/), [ArchDaily](https://www.archdaily.com/538883/baku-flame-towers-hok)) |
| **Maiden Tower** (Qız Qalası) | **~28–29.5 m** (8 storeys); base dia. **16.5 m** | Honey/grey cut **stone**, ribbed banded surface | **Cylindrical, slightly tapering** ("truncated cone"), **flat top** (battlements removed in 19th c.); a distinctive **buttress/fin projection** juts from the sea side | **Trackside in the Castle Section**, Old City near Turns 8–10 ([Wikipedia – Maiden Tower](https://en.wikipedia.org/wiki/Maiden_Tower_(Baku)), [Advantour](https://www.advantour.com/azerbaijan/baku/giz-galasi.htm), [Visions of Azerbaijan](http://www.visions.az/en/news/83/9a564bc4/)) |
| **Old City walls** (Icherisheher / Baku Fortress Wall) | **8–12 m high, ~3.5 m thick** | Honey/sand limestone | **Crenellated rampart** with merlons, semicircular bastion towers, arched gates | **Cars drive right alongside them** through the narrow Castle Section ([UNESCO #958](https://whc.unesco.org/en/list/958/), [Wikipedia – Baku Fortress Wall](https://en.wikipedia.org/wiki/Baku_Fortress_Wall), [Old City (Baku)](https://en.wikipedia.org/wiki/Old_City_(Baku))) |
| **Government House** | 11-storey, ~200 m wide facade | **Pale local limestone (cream/buff)** | **Stalinist-Empire / neoclassical**, symmetrical, **two flanking towers/turrets**, tiered arches referencing the Shirvanshah palace, central dome | **Behind start/finish**, facing the line across Freedom Square ([Wikipedia – Government House](https://en.wikipedia.org/wiki/Government_House,_Baku), [Architecture of Baku](https://en.wikipedia.org/wiki/Architecture_of_Baku)) |
| **Palace of the Shirvanshahs** | 15th-c. complex, ~2-3 storeys | Sand/honey stone | Low palace + Divankhana, domes, crenellated walls | **At the highest point of the Old City**, inside the Castle Section ([Wikipedia – Palace of the Shirvanshahs](https://en.wikipedia.org/wiki/Palace_of_the_Shirvanshahs)) |
| **Baku Crystal Hall** | **max 24 m** (low, broad); 230 m × 160 m footprint | Steel + **illuminated white membrane**, RGB LED at night (5,400–9,500 points) | **Low faceted crystalline shell** of 180 diamond/triangular panels on a peninsula | **Far end, on the Flag Square peninsula** off the seafront straight — distant, low ([Wikipedia – Baku Crystal Hall](https://en.wikipedia.org/wiki/Baku_Crystal_Hall), [gmp Architekten](https://www.gmp.de/en/projects/7489/crystal-hall)) |
| **Azerbaijan Carpet Museum** | Low, ~3 storeys | Patterned facade; warm tones | **Shaped like a partly rolled-up carpet** (curled cylinder) | **On Baku Boulevard, sea side** of the seafront section ([Wikipedia – Carpet Museum](https://en.wikipedia.org/wiki/Azerbaijan_Carpet_Museum), [Azerbaijan.travel](https://azerbaijan.travel/visit-bakus-carpet-museum-cant-be-missed)) |
| **Four Seasons Hotel** | ~8 storeys | Cream/honey neoclassical stone | European Beaux-Arts block | **SW corner of the Old City, on the seafront** near start of the boulevard ([Four Seasons Baku](https://www.fourseasons.com/baku/)) |
| **Heydar Aliyev Center** | — | White | Zaha Hadid flowing white shell | **NOT visible — ~5–7 km inland**, nowhere near the circuit. Do not place trackside. ([Wikipedia – Heydar Aliyev Center](https://en.wikipedia.org/wiki/Heydar_Aliyev_Center)) |

## Skyline & architecture

The defining visual is the **layering of three eras stacked up the hillside**,
seen across the Caspian-front straight:

1. **Foreground (trackside):** honey-coloured Old City ramparts, the Maiden
   Tower, low sandstone old-town houses with small punched windows and flat
   roofs, occasional domes and slim minaret-like shafts.
2. **Mid-ground:** grand pale-limestone Soviet/European civic blocks
   (Government House and its neighbours around Freedom Square), the cream Four
   Seasons, the rolled-carpet Carpet Museum on the boulevard.
3. **Background, up the hill:** a wall of modern **blue-glass high-rises** and,
   crowning everything, the three **Flame Towers** silhouetted on the ridge.

So the correct palette is: **honey/sand stone close to the cars**, **pale cream
limestone** for the civic core, and **cool blue-tinted glass** climbing into the
distance — with the Caspian Sea (open, low, hazy) on the inside of the seafront
straight. Reference: [Architecture of Baku](https://en.wikipedia.org/wiki/Architecture_of_Baku),
[Tilke](https://tilke.de/portfolio/baku-f1-city-circuit/).

## Barriers, grandstands, kerbs, surface

- **Barriers:** standard F1 street armco + debris/catch fencing line the whole
  lap; **TecPro** energy-absorbing barriers (yellow/blue polyethylene-foam
  modules, stacked up to ~6 deep) at high-risk braking zones such as Turn 7 and
  the Castle Section entries.
  ([Grokipedia](https://grokipedia.com/page/Baku_City_Circuit),
  [Tecpro barrier – Wikipedia](https://en.wikipedia.org/wiki/Tecpro_barrier))
- **Grandstands:** ~10 grandstands. The **Main / Absheron grandstand overlooks
  the start-finish straight facing the team garages** (podium view); others sit
  along the seafront facing the Caspian and around Freedom Square.
  ([Motorsport Tickets grandstand guide](https://motorsporttickets.com/blog/baku-grand-prix-grandstand-guide/),
  [F1 Experiences](https://f1experiences.com/blog/where-to-watch-the-action-at-the-azerbaijan-gp))
- **Pit/start:** temporary two-storey **44-garage** pit building + paddock at
  Freedom Square opposite the Government House.
- **Kerbs & surface:** sealed asphalt (it is a public city street the rest of the
  year). Kerbs are F1-tuned — deliberately **flat/low at some corners (e.g. T5)**
  so cars can use all the road without bouncing, with standard **red/white**
  (and blue/white) striping elsewhere. The Castle Section runs over normal city
  road, bordered hard up against the stone walls, with effectively **zero run-off**
  there. ([Tilke](https://tilke.de/portfolio/baku-f1-city-circuit/),
  [Motorsportscalendar](https://motorsportscalendar.com/circuit/streets-of-baku))

## Vegetation & water

- **Sparse, and concentrated on Baku Boulevard** (the "Bulvar"), the seafront
  park on the inside of the long straight. It is **lined with palm trees**,
  benches and flowerbeds; the 2008 restoration added exotic planting (palms,
  imported baobabs, cacti). Inland street sections are essentially treeless
  hard cityscape.
  ([Wikipedia – Baku Boulevard](https://en.wikipedia.org/wiki/Baku_Boulevard),
  [Azerbaijan.travel](https://azerbaijan.travel/feel-bakus-mediterranean-atmosphere-stroll-along-the-boulevard))
- **Water:** the **Caspian Sea / Bay of Baku** sits immediately to the inside of
  the seafront straight — open dark water with harbour piers, the Flag Square
  peninsula and Crystal Hall jutting out, and distant ship silhouettes.

## Atmosphere / lighting / signage

- **Real race = bright Caspian afternoon** (15:00 start), clear warm light, long
  shadows, blue sky, low sea haze. NOT a night race.
  ([Oversteer48](https://oversteer48.com/azerbaijan-baku-grand-prix-schedule/))
- **Night identity exists but is the *city's*, not the race's:** the Flame
  Towers run their LED flame display after dark, Crystal Hall lights its RGB
  membrane, and the Old City is warmly up-lit. A dusk/evening palette is
  defensible for mood, but full midnight-blue is wrong for the GP.
- **National identity:** Azerbaijan flag = horizontal **blue / red / green** with
  a white crescent + 8-point star; these three colours recur on signage,
  flagpoles and branding. Track branding is dominated by Azerbaijani state /
  tourism sponsors ("Land of Fire" fire motif). Government House is floodlit
  cream; Maiden Tower and walls are warm-up-lit honey.

## Gap analysis vs current game (specific & concrete)

Current build is `theme: street_night`, `night: true` — a full-night scene. Key
inaccuracies:

1. **Flame Towers are far too tall.** Game uses `heights = [210, 240, 210]`
   (scene metres). Real towers are **~140 / 160 / 182 m** — the centre tower
   should be ~**182**, not 240, and the game makes all three taller than reality.
   They tower over everything implausibly.
2. **Flame Towers shape/treatment.** Game caps each with **stacked orange flame
   cones** (a literal fire plume). Real towers are **smooth tapered glass
   teardrops** whose "flame" is an **LED *image* on the facade**, with **no
   physical cone/spike** on top. The flame should read as an emissive facade
   pattern, not a 3D fire cone.
3. **Flame Towers position.** They sit ~180 m off track-right at s≈0.22, roughly
   on the straight. In reality they are **high on the hillside, set far back and
   up**, overlooking the lap — they belong in the distant backdrop, elevated, not
   as a near-trackside cluster.
4. **Maiden Tower is far too tall.** Game builds it as a **51 m** stack (drum to
   y≈5..33, finial at y≈49–51). Real tower is **~28–29.5 m** — the game is
   ~70–80% too tall. It also gives it a **pointed cone cap + finial ball**; the
   real tower is **flat-topped** (battlements long gone) with a distinctive
   **buttress fin** on one side, which the game omits.
5. **Maiden Tower diameter.** Game drum radius 9.2 (≈18 m dia) is close to the
   real 16.5 m base — fine. But the multi-frustum cornice/cone stack above adds
   fictional height; the body should be a near-straight tapering cylinder.
6. **Old City walls roughly right but slightly tall.** Game main rampart is 9 m,
   castle-section walls 11 m. Real walls are **8–12 m**, so 9–11 is acceptable
   (lower/`~9 m` is more typical) — keep but don't exceed ~12 m.
7. **It's night; the real GP is a bright afternoon.** The whole palette
   (`zenith [0.04,0.05,0.14]`, dark Caspian, sodium floodlights, neon) depicts
   midnight. The race is **15:00 daylight**. This is the single biggest
   atmosphere mismatch.
8. **Government House** is modelled with twin **conical-roofed corner towers** in
   SAND tone. Real building is **pale cream limestone** (closer to `[0.80,0.78,
   0.72]` than the SAND `[0.62,0.50,0.34]`), Stalinist-neoclassical with
   square turreted towers and a **central dome** — the twin-tower idea is right,
   but the stone is too brown/orange and the pointy roofs are too fairy-tale.
9. **Crystal Hall** is modelled as a tall stacked dome (~28 m) at s≈0.70. Real
   hall is **low and broad (max 24 m, 230×160 m)** — a faceted shell, not a
   bulbous dome — and sits on a **distant peninsula**, so it should read low,
   wide and far.
10. **Missing recognisable landmarks:** the **rolled-carpet Carpet Museum** and
    the **cream Four Seasons** at the Old City corner are absent; both are
    distinctive and trackside-visible on the boulevard.
11. **Heydar Aliyev Center** is correctly absent — confirm it stays out (5–7 km
    inland, never visible from the circuit).

## Concrete scenery recommendations (actionable)

1. **Flame Towers — rescale & retreat.** Set `heights` to roughly `[140, 182,
   160]` (centre tallest), move the anchor far back and **elevate** them (place
   on a raised hill mass / large `backdrop` silhouettes) so they crown the
   distant skyline rather than loom over the straight.
2. **Flame Towers — drop the fire cones.** Remove `addCone` flame crowns. Keep
   the smooth tapered `addFrustum` body but render the "flame" as an **emissive
   facade band/gradient** (orange→yellow `FLAME`/`FLAME_PALE` window bands up the
   curtain wall) and a clean tapered tip. By day use **blue-tinted glass**
   (`[0.45,0.55,0.70]`-ish) with the LED off.
3. **Maiden Tower — shrink to ~28–30 m.** Cut the drum + upper stack so total
   height is ~28 m (e.g. drum y=5..28). **Remove the cone cap and finial ball**;
   make it **flat-topped**. Keep radius ~8 (16 m dia). Add the signature
   **buttress fin**: a tall thin `addBox`/`addPrism` projecting from one side of
   the drum, full height. Keep the ribbed honey-stone look.
4. **Switch the default mood to bright afternoon (or warm dusk).** Either retheme
   to a daytime street palette (clear blue zenith, warm raking sun, Caspian as
   bright blue water, drop the sodium floodlights) or, if keeping a lit look,
   move to **golden-hour dusk** rather than midnight. This is the highest-impact
   change for realism. (Note CLAUDE.md: night palettes get ambient capped + sun
   dimmed — a `street_day`/dusk variant would better match the 15:00 race.)
5. **Government House — pale limestone.** Re-tone from SAND to **cream limestone**
   `~[0.80,0.78,0.70]`, widen the facade (it's ~200 m), swap the pointed conical
   tower roofs for **flat/turreted caps**, and keep/centre the **dome**.
6. **Crystal Hall — flatten & widen.** Lower max height to ~24 m, widen the
   footprint, model it as a **low faceted membrane shell** (shallow frustum / set
   of triangular panels) glowing white-RGB, and push it further out onto the
   seafront peninsula.
7. **Add the Carpet Museum** on the boulevard (sea side, seafront section): a
   short building with a **curled/rolled-cylinder** roofline (a horizontal
   `addCyl` partly unrolled) in warm patterned tone.
8. **Add a cream Four Seasons block** at the SW Old City corner (start of the
   seafront straight) to anchor the transition from civic stone to boulevard.
9. **Keep palms on the boulevard only** (already done) — leave inland street
   sections treeless hard cityscape.
10. **Barrier/kerb colours:** keep armco + catch fence; add **TecPro** colour
    accents (blue/yellow stacked modules) at heavy braking zones (T7, Castle
    entry). Use **red/white** (and some blue/white) kerb striping; keep T5-style
    flat low kerbs.
11. **National colours:** keep the blue/red/green flag motif on poles and
    signage (already present) and lean the sponsor/billboard palette toward
    Azerbaijani state + "Land of Fire" fire branding.
