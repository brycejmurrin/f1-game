# Sochi Autodrom — Visual Design Brief

**Setting:** DAY, modern theme (2014 Olympic Park, Black Sea coast). ~5.85 km, 18 turns, clockwise.
**Layout note:** the game models the **2014–21 GP layout** (`classic: true`). Since 15 Dec 2023 only the 2.313 km short layout is used locally and the GP loop section through Medals Plaza has been taken out of regular use; the venue was renamed **Sirius Autodrom** on 1 Apr 2024. Do **not** “update” the playable lap to the short layout — keep the classic GP loop as the historic F1 circuit.

Sources: [Sochi Autodrom (Wikipedia)](https://en.wikipedia.org/wiki/Sochi_Autodrom), [Sirius Autodrom — about](https://siriusautodrom.ru/about), [Sochi Olympic Park (Wikipedia)](https://en.wikipedia.org/wiki/Sochi_Olympic_Park), [Ice Cube Curling Center (Wikipedia)](https://en.wikipedia.org/wiki/Ice_Cube_Curling_Center).

## 1. Setting
The only circuit on this list that runs through a finished Olympic park. Sochi's first third threads between the 2014 venues across acres of open paved plaza — Fisht Stadium, the Bolshoy Ice Dome, the Adler Arena, the flame tower and its reflecting pool — with no trees, no crowd banks and no vegetation of any kind, just architecture and hard standing. The defining corner is **Turn 2**, a 180° left that wraps the whole way around the Medals Plaza and lasts long enough to feel like a lap of its own. Beyond the park the circuit reverts to ordinary subtropical coastal planting, with the Caucasus closing every wide shot. The start/finish sits on the **north edge next to the Olympic Park railway station**.

## 2. Atmosphere & palette
Soft humid Black Sea light, hazy horizon, subtropical green outside the park and pale grey paving inside it.
- Sky: zenith `[0.26, 0.46, 0.76]`, horizon `[0.80, 0.82, 0.80]`; sun `[1.0, 0.95, 0.82]`
- Fog `[0.78, 0.80, 0.80]` at density ≈0.0030
- Plaza paving `[0.78, 0.76, 0.74]`; grass `[0.22, 0.42, 0.20]`; gravel `[0.68, 0.62, 0.48]`
- Broadleaf `[0.20, 0.44, 0.20]` / `[0.15, 0.36, 0.18]`
- Reflecting pool `[0.30, 0.48, 0.66]`
- Kerbs red `[0.80, 0.16, 0.16]` / white `[0.92, 0.92, 0.90]`

## 3. Elevation
Reclaimed coastal flat — nearly level. Keep box heights near-constant.
- s≈0.34: +3.5 m on the outer loop.
- s≈0.68: −3 m coming back.
- Nothing else. Sochi's character is length and geometry, never relief.

## 4. Landmarks & surroundings by lap position
| s | Side | Distance | Box description |
|------|------|----------|-----------------|
| 0.005 | R | near | Main grandstand, 150 m, covered |
| 0.008 | R | mid | **Olympic Park railway station** — glass hall + canopy on the north edge by the grid |
| 0.045 | L | near | Turn 1 gravel apron + red tyre wall |
| 0.062 | R | mid | **Olympic rings** sculpture on a concrete plinth |
| 0.09 | R | mid | **Medals Plaza**: one enormous paved slab (120×260) filling the inside of the Turn 2 loop |
| 0.115 | R | mid | **Olympic flame tower** (~50 m Firebird stele) + rectangular reflecting pool with jets |
| 0.150 | R | far | **Bolshoy Ice Dome**: low silver dome |
| 0.18 | R | far | **Fisht Stadium**: big translucent shell — the largest silhouette on the circuit |
| 0.225 | R | far | **Adler Arena**: long low glass box (speed skating) |
| 0.245 | R | far | **Shayba Arena**: puck / snowflake drum |
| 0.290 | R | far | **Iceberg Skating Palace** under an oversailing arc roof |
| 0.00–0.30 | both | — | Foliage and lamps suppressed entirely — the park is paving and architecture, nothing wild |
| 0.05–0.30 | both | near | Tall slim park **lighting columns** in a very regular rhythm |
| 0.255 | L | near | Turn 5–6 gravel + blue tyre wall; concrete stand on R |
| 0.30–0.42 | both | mid | Clipped hedging along the plaza edges — landscaped, not wild |
| 0.42–0.58 | both | mid | Outer loop: ordinary subtropical broadleaf planting takes over |
| 0.545 | R | near | Turn 13–14 gravel; steel stand opposite on L |
| 0.815 | L | near | Turn 16–17 gravel + yellow tyre wall |
| 0.875 | R | far | **Ice Cube Curling Center** — cubic white/blue glass hall before the paddock funnel |
| 0.90 | — | — | Long final sequence, gently cambered (3.5°), back onto the straight |
| 0.94–1.00 | L | near | Pit bays + race control; motorhomes / broadcast further out |
| — | inland | far | **The Caucasus**: high mountain ridges closing the inland horizon |

## 5. Track features
- **Turn 2**: a 180° left held over a 260 m width zone at 5° of camber — the longest single corner on the calendar when it ran, and the whole reason to build the plaza.
- Long straights joined by 90° street-style junctions; permanent circuit on street-like alignments, so long continuous armco is right for most of the lap.
- Three pinch points (T5–6, T13–14, T16–17); modern flat kerbs.
- Very low tyre degradation surface — visually smooth, uniform, new-looking tarmac.

## 6. Modelling notes
- The park section must be architecturally led: big, clean, geometric volumes on open paving, each venue a distinct silhouette (shell / dome / glass box / spire / cube). Do not dress it with trees or crowd banks.
- Make Turn 2 read as a wrap: put the plaza and the flame tower INSIDE it, so the whole corner is spent looking at the same object from changing angles.
- Keep the lighting columns strictly regular. That rhythm is what says "municipal park" rather than "racing circuit".
- Landscape, do not naturalise — clipped hedge banding at the plaza edges, ordered planting on the outer loop only.
- Let the Caucasus close every distant view; without them the site reads as a flat industrial estate.
- Keep the ground plane dead level and the tarmac uniform; Sochi's smoothness is part of its identity.

## Uncertain / do not build as fact
- **Night / illumination shows** at Medals Plaza (singing fountains) are not sourced for race weekends — day palette only.
- Exact metre offsets of each venue from the racing line are best-effort from circuit descriptions and park maps; placement is silhouette-led, not survey-grade.
- Post-2023 short-layout barriers and dismantled GP fencing are out of scope while `classic: true`.

## Research pass — wave 6
Required assemblies: Fisht, Bolshoy, Adler, flame tower, Iceberg, Olympic rings, Shayba, race control, **Ice Cube**, **Olympic Park station**. Ground-audit: neonTower `cross` arm lifted by `MIN_SEP` in `city.js`; rings stemmed to the plinth; pit-bay glass seated on the deck; Sochi kit rail `jersey` → `armco` (jersey buried on camber); cityStyle dropped `cross`.
