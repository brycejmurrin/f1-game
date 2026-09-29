# Circuit Paul Ricard — Visual Design Brief

**Setting:** DAY, modern theme (Provençal limestone plateau at Le Castellet). ~5.84 km, 15 turns, clockwise.

## 1. Setting
A flat, bleached limestone plateau above Bandol, 400 m up and swept by the mistral. Two things dominate and neither is a grandstand: the **blue-and-red painted abrasive run-off**, which is continuous and covers acres in every direction, and the **live aerodrome inside the circuit** — Le Castellet airport, whose runway runs parallel to the Mistral straight and whose hangars, control tower and parked light aircraft are the only things on that horizon. The place reads as an airfield apron that happens to have a racing line painted on it, and that is exactly right.

## 2. Atmosphere & palette
Hard white Provençal light, bleached limestone, thin dry scrub. Enormous areas of cool blue-grey tarmac; almost no saturated colour except the hoardings.
- Sky: zenith `[0.22, 0.44, 0.78]`, horizon `[0.84, 0.82, 0.74]`; sun `[1.0, 0.96, 0.82]`
- Fog `[0.80, 0.78, 0.70]`; scrub grass `[0.34, 0.40, 0.21]`
- **Blue Zone** `[0.36, 0.42, 0.66]`, deeper blue `[0.29, 0.34, 0.56]`; **Red Zone** `[0.62, 0.28, 0.26]`; white lane lines `[0.90, 0.90, 0.88]`
- Aleppo pine `[0.14, 0.30, 0.16]` / `[0.11, 0.24, 0.14]`; dry brush `[0.36, 0.40, 0.22]`
- Built: white `[0.94, 0.94, 0.92]`, mill aluminium `[0.76, 0.78, 0.80]`, apron concrete `[0.60, 0.60, 0.59]`

## 3. Elevation
The flattest circuit in this set by some way — Le Castellet is a graded plateau. Vary ground-box tops by ≤1 unit.
- s≈0.30: +3 m, barely perceptible.
- s≈0.66: −3.5 m down the second half of the Mistral towards Signes.
- s≈0.88: +2.5 m back to the pit straight.
- Nothing else. Character here comes from width, paint and emptiness, not relief.

## 4. Landmarks & surroundings by lap position
| s | Side | Distance | Box description |
|------|------|----------|-----------------|
| whole lap | both | near | **Blue Zone / Red Zone** continuous abrasive run-off (draped — not a `modelGroup`; order is blue near kerb, red deeper) |
| 0.95–1.00 | R | near | **Pit slab**: single-storey, ~300 m, one uninterrupted flat roof on a comb of thin round columns, dark glazing band at head height, blue fascia lip. No stacked hospitality, no stepped silhouette |
| 0.992 | R | near | Race control: a glazed box cantilevered clear of the roof line on one blank core — the only vertical on the straight (`paul-ricard-race-control`) |
| 0.005 | L | near | **Main grandstand**, ~150 m, facing the pits (`paul-ricard-main-grandstand` + `grandstandEx`) — permanent 4,400-seat stand (2009) |
| 0.930 | R | near | **2019 pit entry** channel at exit of Virage de la Tour (`paul-ricard-pit-entry-2019`) |
| 0.94–0.05 | R | mid | Paddock behind the garages: apron, hospitality slabs, motorhomes, TV compound |
| 0.94–0.07 | R | near | Long white pit-lane hoarding wall — the one place colour shows against all that pale tarmac |
| 0.07 | — | — | **Verrerie**, gently banked (3°) |
| 0.20–0.44 | both | mid | Bare painted plateau — foliage suppressed entirely; sparse low pine only far back |
| 0.46–0.49 | L | near | Braking boards into the **Mistral chicane** (0.490–0.502) — the only reference points on a 1.8 km run with no trees and no buildings |
| 0.40–0.50 | L | far | **Aerodrome apron**: bare grey concrete slab (86×240) with a parallel taxiway stripe beyond it |
| 0.40–0.45 | L | far | Three barrel-roofed **hangars** in a row (`paul-ricard-aerodrome`), sliding-door bands facing the apron |
| 0.465–0.51 | L | far | Three light aircraft parked nose-in at the same angle |
| 0.545 | L | far | **Control tower** (`paul-ricard-airfield-tower`): squat glazed cab leaning outward on a white shaft, windsock on its own mast — the tallest thing for kilometres |
| 0.713 | — | — | **Signes**, 4° banked, flat-out at the end of the Mistral |
| 0.68–0.76 | L | mid | Bare aluminium **bleachers** on a scaffold rake; **Beausset public hill** (`paul-ricard-beausset-hill`) — GA berm over Double Droite du Beausset |
| 0.885 | L | far | Helipad: a painted circle on bare tarmac |
| 0.235 | R | far | Provençal **cabanon** + dry-stone wall (`paul-ricard-cabanon`, `paul-ricard-drywall`) |
| — | ring | far | The limestone massif of the Sainte-Baume beyond the plateau, pale and sparsely pined |

## 5. Track features
- The Mistral straight (with its chicane at s≈0.490–0.502) and **Signes** (0.713) at the end of it — the fastest sequence on the circuit.
- Banking is minimal: Verrerie 3°, Signes 4°, Le Beausset 3.5°.
- Pinch points at the Mistral chicane, Le Beausset and the Pont/Le Village complex.
- Width: the base half-width (8 m) everywhere else, deliberately. The 2017 refurbishment
  for the F1 return tightened La Verrerie but WIDENED its entry for clean starts, and widened
  the Camp hairpin (racing 0.2424, R 15 m) as well. So the Verrerie esses (0.087-0.110) and
  the 0.206-0.261 complex are NOT pinch points, and carry no `hwZones` entry. Decision and
  evidence: docs/notes/DEFECT-LEDGER.md § paul_ricard — hwZones decision.
- Sides are racing-direction: the pits and paddock are on the RIGHT of the main straight (the infield; the pit exit rejoins on the right), the main grandstand on the LEFT facing them.
- Barriers sit a long way back, well beyond the painted apron — the run-off, not the wall, is what a driver sees.

## 6. Modelling notes
- Paint the run-off CONTINUOUSLY, every verge and every straight, not just at the corners. A green-verged Paul Ricard is the one thing this circuit never is.
- Lay it as a run of footprint-guarded **draped** aprons (`api.drape` / `drapeRun`), and keep the white cross-lines: they are what stop all that blue reading as water from a distance. Do **not** add a `paul-ricard-blueline` `modelGroup` — the stripe is already a texture.
- The pit building is ONE horizontal line. No stepped silhouette, no glazed tower block. That flatness is what makes the site read as an aerodrome.
- Corner "stands" are bare scaffold bleachers standing in the middle of the paint, sparsely occupied. Do not give them shells or roofs.
- Keep the scrub thin, low and far back — the mistral beats it down, and any treeline would close the sightlines the plateau is made of.
- Dress the aerodrome properly. Without hangars, tower and parked aircraft the plateau reads as empty farmland with a track on it.

## Research pass — wave 6 (sourced vs uncertain)

### Sourced (built)
- **Blue Zone / Red Zone** abrasive run-off (asphalt + tungsten; blue first, red deeper) — [Wikipedia](https://en.wikipedia.org/wiki/Circuit_Paul_Ricard), [racingcircuits.info](https://www.racingcircuits.info/europe/france/circuit-paul-ricard.html), circuit press (Blue Line™).
- **4,400-seat start-straight grandstand** (2009 permanent) — [circuitpaulricard.com history](https://www.circuitpaulricard.com/en/the-circuit/history), racingcircuits.info.
- **Beausset public hill** (summer 2009 GA area over Double Droite du Beausset) — same history pages.
- **2019 pit entry** relocated to exit of Virage de la Tour (T14 outside) — racingcircuits.info; [Motorsport Week 2019-06-20](https://www.motorsportweek.com/2019/06/20/23303/); RaceFans / GPToday same weekend.
- **Le Castellet aerodrome** beside the circuit (hangars, tower, runway parallel to Mistral) — [aeroportducastellet.com](https://www.aeroportducastellet.com/en/), racingcircuits.info, circuit news.

### Uncertain / not built as fact
- **150 m scenery main stand vs 4,400 seats** — length is a plausible span for that capacity at ~20 rows / ~0.5 m pitch (~110 m of seating + aisles); **not resized** without a surveyed footprint. F1 temporary stands reached ~350 linear metres (GL Events 2018–19) and are a different structure.
- **Pit-entry channel dimensions** (wall height, lane width) — approximate; no scaled FIA pit-lane drawing used.
- **Wind turbines** on the horizon — scenic Provence cue already in file; not claimed as on-circuit furniture.
- **Vineyard / lavender parcels** — regional Provençal dressing; exact parcel locations not surveyed.
