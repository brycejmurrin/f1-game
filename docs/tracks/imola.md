# Imola — Autodromo Enzo e Dino Ferrari (Italy)

**Game setting:** DAY · green theme (parkland by a river). Scenery uses procedural meshes and the baked material/model pack, with procedural fallbacks. Turn and sector metadata use racing-lap arc fractions; legacy scenery placement fractions below use the authored frame through wrapped helpers. Left/Right and lateral distance bands describe placement, not surveyed footprints.

## 1. Setting
An old-school **parkland circuit** opened 1953, running along the right bank of the **Santerno river** at the foot of the wooded **Imola hills**, 40 km east of Bologna. The lap is essentially a road following the river, then looping back up and over a couple of small hills through mature trees and grassy banks — narrow, enclosed, and intimate compared with modern tracks. **4.909 km, 19 turns, anticlockwise.** F1 last raced here in 2025 (Emilia-Romagna GP); the Spanish GP moves to Madrid for 2026, so this is a returning/legacy venue in the game (`classic: true`).

## 2. Atmosphere & palette
Bright Italian spring sky `[0.55,0.74,0.95]`, soft warm light. Dominant **parkland greens**: deciduous canopy `[0.20,0.46,0.22]`, shaded woods `[0.11,0.30,0.15]`, sunlit grass bank `[0.42,0.63,0.30]`. The **Santerno river** runs muted green-brown `[0.30,0.42,0.34]`. Gravel traps pale tan `[0.78,0.70,0.52]`. Thin morning **fog** lingers in the river valley and shaded dips (Acque Minerali, Rivazza) — light and dissipating, not heavy. Crowd skews **tifosi red** (Ferrari's home circuit, ~60 km from Maranello).

## 3. Elevation
Notably **hilly** in the mid-to-late lap. Flat river-side run to Tosa (~s 0.00–0.30), then a steady **climb to Piratella** at a blind hill-crest (~s 0.35), a drop and **climb to Acque Minerali** (~s 0.45–0.55), up over the **Variante Alta** crest (~s 0.65), then a **descent into Rivazza** (~s 0.80). Vary ground-box top heights here; keep the first third near-flat. **Do not flatten hills or add knife-edge elevation jolts.**

## 4. Landmarks & surroundings by legacy scenery position

These fractions are placement notes in the existing scenery frame, not validated
FIA corner anchors. Use the racing fractions in §7 for timing and corner labels;
verify final built placement before changing scenery from these notes.
| s | Side | Distance | Box-modelling description |
|------|------|----------|---------------------------|
| 0.00 | L (−1) | near–mid | **Modern Tilke pit complex** (2006–07 rebuild) — six garage slabs + hall; **Racetrack Tower** (`imola-racetrack-tower`, required) 7 floors over the pits with crimson façade panels |
| 0.00–0.05 | R (+1) | near | **Partenza / Start stands** opposite the pits (`imola-partenza-stands`, required) — long covered rank + crimson fascia |
| 0.00 | R | near | **Santerno river** continuous ribbon + grass bank — pit straight through Tamburello |
| 0.05–0.08 | L | near | **Tamburello** chicane: red/white kerbs + **Ayrton Senna memorial** (Stefano Pierotti bronze, 26 Apr 1997, Parco delle Acque Minerali) + tribute wall |
| 0.10 | R | mid | **Santerno footbridge** over the river ribbon |
| 0.12 | L | near | **Villeneuve** chicane kerbs; gravel trap; outside stand (WEC map V) |
| 0.00–0.18 | R | near–mid | Deciduous riverbank treeline (poplar/willow, almost no pine) hugging the water |
| 0.28–0.32 | L | near–mid | **Tosa** hairpin: covered stands + **Prato** grass banks behind; gravel run-off |
| 0.35 | L+R | far | **Piratella** blind hill-crest: dark deciduous wooded walls, ground rises; hillside villas |
| 0.48–0.55 | L (−1) | near–mid | **Acque Minerali** stand rank (AM) on the **inside** of the hillside; mist bands; dark broadleaf hollow |
| 0.60 | L | far | **Wooded hills** backdrop + Emilia vineyard rows on high ground |
| 0.64–0.68 | L+R | near | **Variante Alta** / Gresini crest: tall sausage kerbs + tight wooded walls |
| 0.78–0.86 | L | mid | **Rivazza** plunge amphitheatre: gravel, terrace, covered stand + **Prato** GA hills |
| 0.90–0.94 | L | mid | Historic race office + paddock gate portal; hospitality motorhomes |
| 0.92 | R | near | **Variante Bassa** / pit approach kerbs back toward river and pit straight |

## 5. Track features
- Runs **anticlockwise** — unusual and distinctive.
- Old-school narrow ribbon with classic **chicanes** (Tamburello, Villeneuve, Variante Alta, Bassa) and tight corners.
- Aggressive **old-school kerbs** — bright red/white, some raised sausage kerbs.
- Strong **elevation** through the wooded second half; flat river straight up front.
- Frame debt: `sceneryStartFrac` 0.495 → `_sceneryShift` ≈ 0.509. `K(s)` is authored-frame; never pre-shift. Do not change frame keys.

## 6. Modelling notes
- Chain overlapping Santerno water + bank slabs on the right from Variante Bassa through pit → Tamburello so the river reads continuous at race speed.
- Mid-lap (Piratella / Acque Minerali) is **deciduous hollow** — `pineFrac: 0`, dark broadleaf + mist planes; cypress only as sparse Italian punctuation.
- Variante Alta has raised kerb detail and tight wooded crest walls; kerb height is not established by the references here. Do not use the former unsupported 1.3 m estimate. Rivazza is a grass amphitheatre plunge (tiered hillside stands), not a flat stand.
- Keep the first third flat, then ramp ground-box tops up for Piratella/Acque Minerali and drop them into Rivazza.
- Thin far mountain rings before stacking hero riverside / hollow / crest geometry.
- Stands use `grandstandEx` (positive rake, rows rise away from the track). Legacy `grandstand()` is retired here.
- Racetrack Tower: one continuous shaft + flush glass (no inter-floor air gaps — ground-audit unsupported BFS).

## 7. FIA 2025 timing and nominal corner anchors

The [FIA event circuit map, document 4, version 3, issued 15 May 2025](https://www.fia.com/system/files/decision-document/2025_imola_event_-_circuit_map_-_imola_2025.pdf)
specifies **S1 115 m before T7** and **S2 190 m before T14**. T7 is Tosa;
T14 is the first right of Variante Alta/Gresini, followed by the left T15.
The operator's [car-layout map](https://www.autodromoimola.it/tracciato/)
corroborates the named shapes but labels 21 bends; the FIA event map's 19
corner numbers govern this definition. Marshal posts/lights are separate labels.

The current built centreline is **4,871.2493 m**, compared with the FIA's
**4,909 m** reference. Timing fractions use the built metric, without rescaling
the road or changing its origin, width or elevation. Sectors are `.33451582`
and `.65393488`, respectively 115 m and 190 m before the selected game anchors.

| FIA corner | Physical bend | Nominal racing fraction |
|---|---|---|
| 1 | Gentle bend before Tamburello | `.0788` |
| 2 / 3 / 4 | Tamburello left / right / left | `.1529` / `.1639` / `.1844` |
| 5 / 6 | Villeneuve left / right | `.2804` / `.2969` |
| 7 | Tosa left hairpin | `.35812372` |
| 8 | Uphill right sweep before Piratella | `.4392` |
| 9 | Piratella left | `.4834` |
| 10 | Left bend on descent to Acque Minerali | `.5204` |
| 11 / 12 / 13 | Acque Minerali right / right / exit left | `.5674` / `.5904` / `.5999` |
| 14 / 15 | Variante Alta/Gresini right / left | `.69293924` / `.6984` |
| 16 | Right kink on descent toward Rivazza | `.8169` |
| 17 / 18 | Rivazza first / second left | `.8529` / `.8799` |
| 19 | Final right toward the pit straight | `.9459` |

These are **nominal geometric references, not surveyed apex coordinates**.
Physical numbering follows the inspected FIA plan and built road topology;
it is not the ordering of detected curvature peaks. Existing markers were
retained where they matched the physical bend. T1, T8 and T14 use a local
signed-curvature peak inside their independently identified bend. Tosa has
two strong left-curvature peaks within one hairpin, so T7 instead uses half
the heading change across the complete hairpin. Four reasonable measurement
windows moved that midpoint by less than 0.11 m on this spline; this measures
algorithm sensitivity, not real-world survey accuracy. Gentle/broad bends
especially have uncertain exact apex stations.

The old list omitted the gentle T1, counted both Tosa peaks as T7/T8, and
shifted Acque Minerali labels into the T14 slot. Correcting the labels and
timing leaves the road and banking geometry unchanged. Automatically placed
braking boards follow the corrected corner metadata. Exact as-built runoff
polygons, surveyed elevation, kerb dimensions and scenery placement accuracy
remain separate research tasks.

The existing authored gameplay aero window is re-keyed from the old T14/T15
labels to physical T13/T14, preserving its Acque Minerali–Variante Alta
approach placement. It is not a reconstruction of the FIA 2025 main-straight
DRS zone; matching that interval across the gentle T1 needs a separate change.

## Sourced vs uncertain (wave 6)

**Sourced (built):**
- Tilke pit rebuild 2006–07; Racetrack Tower 7 floors / Ferrari façade — [autodromoimola.it/en/business/the-tower](https://www.autodromoimola.it/en/business/the-tower/), [Wikipedia Imola Circuit](https://en.wikipedia.org/wiki/Imola_Circuit)
- Spectator zones Start/Partenza, Tosa, Villeneuve, Gresini/Variante Alta, Acque Minerali, Rivazza + grassy **Prato** at Tosa and Rivazza — [WEC 2024 grandstand map PDF](https://autodromoimola.it/wp-content/uploads/2024/04/WEC-2024-IMOLA-Grandstand-Map-v.4-Spectators.pdf), [imola.gp grandstand overview](https://www.imola.gp/en/map-of-the-grandstands-50)
- Senna monument by Stefano Pierotti, 26 Apr 1997 at Tamburello / Parco delle Acque Minerali — [turismoimolese](https://turismoimolese.cittametropolitana.bo.it/en/places/squares-streets-monuments/ayrton-senna-monument)
- Official layout / turn names — [autodromoimola.it/tracciato](https://www.autodromoimola.it/tracciato/)

**UNCERTAIN (not built as fact):**
- Exact seat counts per stand and which lettered stand (SP/T/V/G/AM/R) sits on which side — PDFs used for zone order only; placement is by turn.
- Ferris wheel / fan-zone at WEC events — event-temporary; not modelled as permanent.
- Pre-2006 pit building — game uses the modern Tilke pit; old building not resurrected.

## Outcome (prior + wave 6)

The Santerno river was already modelled along the paddock boundary, and the crowd already skews tifosi red. Hillside vineyards mark Emilia-Romagna high ground.

Wave 6: converted legacy stands to `grandstandEx` (positive rake, zero BACKWARDS /
suppressed), grounded the Racetrack Tower as `imola-racetrack-tower`, added required
Partenza hero `imola-partenza-stands`, and restored the Acque Minerali outer bank
(prior `grandstand(0.51)` was fully suppressed) as a Prato-style `spectatorHill`.
Rivazza Prato character stays on the existing spectatorHills at 0.788 / 0.830.
