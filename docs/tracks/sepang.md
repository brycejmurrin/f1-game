# Sepang International Circuit — Visual Design Brief

**Setting:** DAY, green theme (Malaysian oil-palm plantation). ~5.54 km, 15 turns, clockwise.

## 1. Setting
Carved out of an oil-palm estate on reclaimed plantation land beside Kuala Lumpur International Airport. Two things make it unmistakable: the **Hibiscus Canopy** over the Main Grandstand opposite the pits — curved tensile petal bays on a steel spine (operator + structural-engineer naming; early press sometimes said banana leaf / hypar saddle — we follow the hibiscus/petal family) — and the ordered ranks of identical oil palms that ring everything else. Equatorial haze flattens the horizon; the air is visibly thick. KLIA's control tower sits on the skyline as the circuit's immediate neighbour.

F1/FIA confirmed Malaysia hosts the 2026 Bahrain Grand Prix weekend here (2–4 Oct 2026). Sources: formula1.com latest; fia.com news.

## 2. Atmosphere & palette
White-hot high sun almost directly overhead, heavy humidity, saturated jungle green under a bleached white sky.
- Sky: zenith `[0.30, 0.50, 0.76]`, horizon a near-white `[0.86, 0.86, 0.82]`; sun `[1.0, 0.97, 0.88]`
- Fog `[0.82, 0.84, 0.82]` at density ≈0.0034 — the haze is part of the look
- Palm frond `[0.16, 0.42, 0.18]` / `[0.12, 0.34, 0.15]`; jungle `[0.11, 0.34, 0.14]`, lit `[0.20, 0.46, 0.20]`
- Grass `[0.17, 0.42, 0.17]`; gravel `[0.68, 0.60, 0.44]`; drain water `[0.24, 0.32, 0.26]`
- Circuit green accent `[0.20, 0.50, 0.30]` on everything the venue owns
- Sun direction near-vertical `[0.20, 0.90, 0.14]` — short hard shadows

## 3. Elevation
Gently rolling reclaimed plantation, with one genuine drop and one climb.
- s≈0.00–0.15: level pit straight into the T1–T2 loop.
- s≈0.22: **5 m fall** through the early sequence.
- s≈0.46: **4.5 m climb** back up toward the mid-lap.
- s≈0.74: 4 m descent onto the long back straight.
- Otherwise flat — the character comes from width and heat, not hills.
- No elevation edits in the wave-6 scenery pass.

## 4. Landmarks & surroundings by lap position
| s | Side | Distance | Box description |
|------|------|----------|-----------------|
| 0.95–1.00 | L | near | **Main Grandstand + Hibiscus Canopy** (`sepang-main-grandstand-canopy`): 6 curved petal bays on masts over a bare raked terrace; no over-track spans. Opposite the pit lane (`ownPitStraight`). |
| 0.95–1.00 | R | near | Pit terrace: deep open garage arcade, first-floor gallery walkway on slim posts, green accent band (`sepang-pit-bay-*`) |
| 0.010 | R | near | Race control: tall narrow glazed **fin** with an oversailing louvre hood (`sepang-race-control`) |
| 0.065 | L | near | **K1 Grandstand** at T1–T2 (`sepang-t1-grandstand`): positive-rake covered stand on the outside of the right-hander |
| 0.02–0.05 | L | far | Long slatted **shaded walkway** on slim posts — every path on this site is covered |
| 0.06 | R | near | T1–T2 gravel apron (40×56) + red tyre wall |
| 0.18–0.28 | L | near | Deep open **monsoon drainage channel** running beside the run-off |
| 0.15–0.35 | both | mid | **Oil-palm plantation grid**: identical palms, identical spacing, alternate rows offset half a pitch into a quincunx |
| 0.34 | L | mid | Teal mid-lap stand at the T5–T6 sweep |
| 0.445 | L | mid | **F Grandstand** at T7–T8 (`sepang-t7-grandstand`): positive-rake covered stand |
| 0.30–0.40 | infield | far | Wide open infield — no planting; the width of this place is the point |
| 0.58 | R | near | T9 hairpin gravel + blue tyre wall, steel stand outside |
| 0.62–0.72 | L | mid | Earth spectator bank; second drainage channel on R |
| 0.885 | L | near | **T15 final hairpin**: gravel apron + yellow tyre wall, big covered stand outside. *No* T15 umbrella canopy — that claim is search-synthesis only and was not verified against photos/satellite. |
| — | ring | far | Plantation horizon of ordered palm ranks; faint Selangor limestone hills behind; **KLIA control tower** and terminal roofline on the far skyline (`sepang-klia-skyline`) |

## 5. Track features
- Famously **wide** — 8 m base half-width, only three corners narrow at all (T3–T4, T9, T15).
- Two long straights joined by the T15 hairpin; vast tarmac run-off almost everywhere, so gravel is limited. 5.543 km, 15 turns, 16–22 m wide (Wikipedia / operator).
- Gentle banking: T1–T2 loop 3.5°, T5–T6 sweep 4°, T12–T13 3°.
- Tropical downpours define its races — the open drains beside the run-off should always be visible.
- No Petronas sponsor lettering on structures (uncertain / brand-policy).

## 6. Modelling notes
- Main canopy follows **hibiscus petal bays** (operator + KKL), not a single hypar saddle. Six along-track petal dishes on masts, fabric panels drooping toward the track; spine beam links the hubs. Say so if a survey still prefers hypar.
- Seam the fabric — alternate panel tone. A flat single colour over 1500 m² reads as plastic.
- The plantation must be REGULAR. Every other circuit hash-scatters its trees so they do not line up; here the lining-up is the signature. Fix height and species per rank, jitter nothing but the trunk lean.
- Stands under the main canopy have no roofs of their own — the canopy is their roof. Model them as bare terraces with positive rake (rows rise away from the track).
- Keep the haze heavy and the horizon near-white; crisp distance is wrong for the equator.
- Put green accent banding on venue-owned structures and nothing else.
- Paddock motorhomes sit on discrete pads behind the pit terrace and skip placements where `terrainYAt` disagrees with the anchor by >2.5 m (was burying props ~8 m on the verge slope).

## Sourced vs uncertain
| Claim | Status |
|---|---|
| Hibiscus / petal main canopy | **Sourced** — operator architecture page + KKL checking-engineer write-up |
| Hypar / banana-leaf alternative | **Uncertain** — early press / survey text; not modelled as the hero |
| K1 (T1–T2) and F (T7–T8) grandstands | **Sourced** — sepangcircuit.com ticket pages |
| T15 umbrella canopy | **Uncertain** — omitted |
| Petronas naming livery on structures | **Uncertain** — no sponsor text added |
| 2026 Bahrain GP hosted at Sepang | **Sourced** — F1 + FIA |
