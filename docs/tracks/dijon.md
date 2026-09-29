# Circuit Dijon-Prenois — Visual Design Brief

**Setting:** DAY, green theme (Burgundy hillside). ~3.80 km GP layout, 12 turns, clockwise.

## 1. Setting

Cut into open Burgundy hillside north-west of Dijon (Prenois, Côte-d'Or). Short, fast, blind and steeply undulating — a circuit where the track disappears over crests repeatedly. Hosted five French Grands Prix and the 1982 Swiss GP, and the 1979 Villeneuve–Arnoux duel over the last two laps. Still hosts the Grand Prix de l'Âge d'Or.

**Sources:** [Wikipedia — Dijon-Prenois](https://en.wikipedia.org/wiki/Dijon-Prenois); [Circuit Dijon-Prenois — history](https://www.circuit-dijon-prenois.com/en/history-of-the-racetrack-en/); [RacingCircuits.info](https://www.racingcircuits.info/europe/france/dijon-prenois.html).

## 2. Atmosphere & palette

Warm, dry French summer. Open grassland and vineyard slope rather than woodland. Pale limestone showing in the cuttings.

## 3. Elevation

Severe for a circuit this short. Official max slope 14 % through the Parabolique. The lap climbs from the pit straight, crests, and falls through the Combe; blind crests are the character.

## 4. Landmarks & surroundings by lap position

| s | Side | Distance | Box description |
|---|---|---|---|
| 0.005 | +1 | 14 | Pit lane infield. Required `dijon-pit-garages` — long low flat-roofed garage run (official pitbuilding phases 2015–16). `dijon-race-control` at the exit end (video control / medical / reception). `guardrail` along the pit wall, one `marshalPost` at the exit, `sponsorHoarding` on the fascia. |
| 0.020 | -1 | 12 | Main `grandstandEx` opposite the pits (docs row; **UNCERTAIN** modern stand map — no FIA drawing found; keep this single open tier). `sponsorHoarding` at the base, `cameraTower` at the start-line end. |
| 0.055 | +1 | 32 | Paddock behind the garages: service `building` boxes on a gravel apron, `cameraTower` overlooking the straight. Motorhome row omitted (awning posts bury on the verge slope). |
| 0.105 | -1 | 9 | Bare outfield along the straight — `guardrail` close to the edge, `billboard` pair, then open mown grass. No tree line. |
| 0.160 | -1 | 26 | `spectatorHill` for the run to the first corner. Hedge boundary, isolated trees, a farmstead well back. |
| 0.210 | +1 | 10 | Courbe de Pouas — fast right over a crest. `tyreWall`, `marshalPost`, one `billboard`. Inside stays low. |
| 0.240 | -1 | 22 | Outside of Pouas: pale run-off, `guardrail`, `spectatorHill`, low horizon `ridge`. |
| 0.300 | +1 | 34 | Required `dijon-combe-cut` — pale limestone benches on the drop toward Virage de la Combe / Combe de Pouilly (Driver61 sheet; official Combe shoulder works). Hedge and scattered trees above the cut. |
| 0.365 | -1 | 44 | Open valley. Field hedges, crop colour, distant ridge. Nothing tall — the circuit must read from across the valley. Required `dijon-prenois-ferme` on the far shoulder (generic Burgundy ferme; exact farm names **UNCERTAIN**). |
| 0.420 | +1 | 12 | Double Droite de Villeroy — paired rights climbing away. `guardrail`, `tyreWall`, timing `building`. |
| 0.545 | +1 | 15 | The esses (S des Sablières). Limestone spoil benches, `marshalPost`, `guardrail`. |
| 0.645 | +1 | 10 | Virage de la Bretelle — left where the extension rejoins. `tyreWall`, `cameraTower` covering Parabolique entry. |
| 0.725 | -1 | 18 | Outside of the Parabolique. Required `dijon-parabolique-bank` — positive-rake spectator bank (1976–77 extension corner; max slope 14 %). Deep `guardrail`, `tyreWall`, `sponsorHoarding`. |
| 0.760 | +1 | 24 | Parabolique infield: deliberately empty — marshal + billboard pair only. |
| 0.880 | +1 | 20 | Parabolique exit / paddock entrance apron. Building + fence. Motorhomes omitted (burial / clip). |
| 0.950 | -1 | 14 | Approach to the line. Second `grandstandEx` (docs row; modern map **UNCERTAIN**), hoarding, `cameraTower`, `marshalPost`. |

## 5. Track features

- The Parabolique — long fast right closing the lap (added with the 1976 extension to 3.801 km).
- Blind crests where the track drops out of sight (Combe de Pouilly).
- Very short lap — cars are rarely out of view.

## 6. Modelling notes

- Open hillside, not forest. The circuit should be visible from across the valley.
- Hedgerow and isolated trees rather than continuous woodland.
- Minimal permanent structure — this is a spartan facility.
- Length authoring uses `lengthKm` 3.727 in the def (engine); real GP layout is 3.801 km — do not “fix” the def from this brief.

## 7. UNCERTAIN (do not build as fact)

- No modern grandstand seating map / FIA pit-lane drawing was found for wave 6. Keep the two docs-§4 `grandstandEx` rows only; do not invent multi-tier modern stands.
- Exact farmstead names / locations around Prenois — generic ferme silhouette only (`dijon-prenois-ferme`).
