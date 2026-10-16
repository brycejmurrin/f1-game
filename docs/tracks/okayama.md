# TI Circuit Aida (Okayama International Circuit) — Visual Design Brief

**Setting:** DAY, green theme (wooded inland hills). ~3.70 km, 11 turns in this
def (real circuit lists 13 corner names), clockwise. Opened 1990 as a private
circuit; Pacific GP 1994–95.

## 1. Setting

A short, tight circuit folded into wooded hills inland from the Seto Inland Sea
(Mimasaka). Built as a private club course, and it shows: narrow, hemmed in by
trees and earth banks, with almost no run-off. Two Pacific Grands Prix in 1994
and 1995 and nothing since.

Sources: [Wikipedia — Okayama International Circuit](https://en.wikipedia.org/wiki/Okayama_International_Circuit);
[Paradigm Shift track guide](https://www.paradigmshiftracing.com/okayama-track-guide-map.html).

## 2. Atmosphere & palette

Warm, humid green. Broadleaf and bamboo rather than conifer. Earth banks are pale clay.

## 3. Elevation

Constant gentle undulation, no single dramatic drop. The back section climbs.
Do not flatten hills to seat props; do not add knife-edge grade spikes.

## 4. Landmarks & surroundings by lap position

Clockwise. `+1` is RIGHT of the centreline in the direction of travel, which at
Okayama is the INFIELD side — pits, paddock and the club buildings all sit right.
Distances are metres from the track edge and are deliberately tiny: this is the
narrowest, most enclosed lap in the roster, and the enclosure is the character.
Corner names follow the British-driver set the circuit was christened with in 1992
(Attwood, Hairpin, Revolver, Hobbs, Mike Knight, etc.).

### Sourced landmarks (wave 6)

| Landmark | Evidence | In-game |
|---|---|---|
| **Control tower** (4 floors: OIRC office / briefing+VIP / control / stewards) | [OIC facilities01](https://www.okayama-international-circuit.jp/guide/facilities01.html) | required `okayama-control-tower` |
| **Pit garages** (1F garages, 2F media/viewing; bay ~4.22×9.52 m) | [facilities06](https://www.okayama-international-circuit.jp/guide/facilities06.html); [GTWC pit PDF](https://www.gt-world-challenge-asia.com/documents/notice/482/OkayamaInternationalCircuit_Pit+garage.pdf) | required `okayama-pit-garages` (often superseded by the engine pit complex — same pattern as Mosport/Estoril) |
| **A/B paddock club block** | [GTWC paddock layout 9-Aug-2023](https://www.gt-world-challenge-asia.com/documents/notice/475/OIC+paddock+Layout_9-Aug-2023.pdf) | required `okayama-paddock-block` at Williams |
| **Dunlop bridge** (control-tower ↔ mini-course / main-stand pedestrian link) | [facilities guide](https://www.okayama-international-circuit.jp/special/cycle-2019/facility.html); area_info.pdf | required `overheadSpan` `okayama-dunlop-bridge` at frac 0.995 |
| **Main stand** | [facilities01](https://www.okayama-international-circuit.jp/guide/facilities01.html) — exists; no detailed seating map | docs-row `grandstandEx` only (see UNCERTAIN) |

### UNCERTAIN — do not build as fact

- **Grandstand seating map** — not found; keep docs rows only, no invented stand ranks.
- **ENKEI bridge** exact frac (A/B ↔ C paddock footbridge) — confirmed to exist, lap position not locked; omitted.
- **Main gate / West gate** world position relative to the racing line — omitted.
- Real turn count is 13 named corners; this def carries 11 curvature peaks — not a scenery invent.

| s | Side | Distance | Box description |
|---|---|---|---|
| 0.005 | +1 | 6 | Pit wall along start/finish: `sponsorHoarding` run at wall height with `marshalPost` at the exit end; required control tower + pit garage run (see above). |
| 0.015 | -1 | 10 | Main `grandstandEx` outside the start/finish straight — a single modest covered bank, short, with `forestEdge` closing behind its top row. |
| 0.070 | -1 | 8 | Stands end and the trees take over immediately: `guardrail` hard against the edge, `forestEdge` of broadleaf and bamboo one row back, `ridge` rising behind. |
| 0.1172 | -1 | 5 | **Turn 1 (First Corner)**, downhill right: `tyreWall` against a pale clay earth bank with almost no run-off, `ridge` of green above, `cameraTower` on the bank shoulder. |
| 0.1172 | +1 | 9 | Turn 1 inside: `marshalPost`, a single `billboard`, `groundPatch` of pale clay where the apex kerb spills. |
| 0.1658 | -1 | 7 | **Attwood curve**: `guardrail` then an unbroken tree wall — `tree` ranks and `bush` infill to the barrier line, no sky gap. |
| 0.2107 | +1 | 14 | **Williams corner** infield: required `okayama-paddock-block` + soft hauler row on the paddock apron, `tree` screen between them and the track. |
| 0.2928 | -1 | 6 | **Moss S**, first flick: trees right up to the `guardrail`, `forestEdge` dense and dark, `marshalPost` in the only gap. |
| 0.3048 | +1 | 9 | Moss S, second flick: low `spectatorHill` grass bank, `bush` along its foot, `billboard` angled at the exit. |
| 0.3372 | -1 | 6 | **Hairpin**: `tyreWall` on a pale clay cut, `spectatorHill` stepped into the slope above it with bamboo `tree` clumps on the crest. |
| 0.3992 | +1 | 11 | **Revolver**: `marshalPost` and `sponsorHoarding` on the infield, `tree` stand behind — the infield here is wooded, not open. |
| 0.4552 | -1 | 9 | Exit onto the climbing back section: `forestEdge` both shoulders, `ridge` running with the track as it starts to gain height. |
| 0.6322 | -1 | 5 | **Hobbs corner**, the far hairpin at the top of the climb: `tyreWall` against an earth bank, small `grandstandEx` on the bank above, `cameraTower` beside it. |
| 0.6937 | +1 | 10 | **Mike Knight**: `marshalPost`, `guardrail`, `tree` ranks close on both sides through the descent. |
| 0.8678 | +1 | 8 | **Last Corner (Michael Schumacher corner)**, onto the straight: pit entry `building` and `guardrail` split, `billboard` on the infield, `grandstandEx` reappearing ahead on the left. |

## 5. Track features

- The narrowest lap in the roster — keep half-width tight.
- Hairpins at both ends of the lap.
- Earth banks, not gravel, on most of the outside.

## 6. Modelling notes

- Keep the outfield close. The identifying quality is enclosure — trees and banks right up against the tarmac.
- Low-rise club buildings, not a Grand Prix paddock.
- Wave-6 grounding: `motorhome()` buried into the Williams berm — use `safeBox` trailers; tree wall skips infield built windows and requires terrain agreement.
