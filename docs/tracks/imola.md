# Imola — Autodromo Enzo e Dino Ferrari (Italy)

**Game setting:** DAY · green theme (parkland by a river). Render: procedural colored BOXES, no textures. Objects placed by arc-fraction `s` (0.0 at start/finish, increasing in racing direction, wrapping to 1.0), Left/Right side, lateral distance band, tinted `[r,g,b]` 0–1.

## 1. Setting
An old-school **parkland circuit** opened 1953, running along the right bank of the **Santerno river** at the foot of the wooded **Imola hills**, 40 km east of Bologna. The lap is essentially a road following the river, then looping back up and over a couple of small hills through mature trees and grassy banks — narrow, enclosed, and intimate compared with modern tracks. **4.909 km, 19 turns, anticlockwise.** F1 last raced here in 2025 (Emilia-Romagna GP); the Spanish GP moves to Madrid for 2026, so this is a returning/legacy venue in the game (`classic: true`).

## 2. Atmosphere & palette
Bright Italian spring sky `[0.55,0.74,0.95]`, soft warm light. Dominant **parkland greens**: deciduous canopy `[0.20,0.46,0.22]`, shaded woods `[0.11,0.30,0.15]`, sunlit grass bank `[0.42,0.63,0.30]`. The **Santerno river** runs muted green-brown `[0.30,0.42,0.34]`. Gravel traps pale tan `[0.78,0.70,0.52]`. Thin morning **fog** lingers in the river valley and shaded dips (Acque Minerali, Rivazza) — light and dissipating, not heavy. Crowd skews **tifosi red** (Ferrari's home circuit, ~60 km from Maranello).

## 3. Elevation
Notably **hilly** in the mid-to-late lap. Flat river-side run to Tosa (~s 0.00–0.30), then a steady **climb to Piratella** at a blind hill-crest (~s 0.35), a drop and **climb to Acque Minerali** (~s 0.45–0.55), up over the **Variante Alta** crest (~s 0.65), then a **descent into Rivazza** (~s 0.80). Vary ground-box top heights here; keep the first third near-flat. **Do not flatten hills or add knife-edge elevation jolts.**

## 4. Landmarks & surroundings by lap position
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
- Variante Alta needs **tall sausage kerbs** (~1.3 m) and tight wooded crest walls; Rivazza is a grass amphitheatre plunge (tiered hillside stands), not a flat stand.
- Keep the first third flat, then ramp ground-box tops up for Piratella/Acque Minerali and drop them into Rivazza.
- Thin far mountain rings before stacking hero riverside / hollow / crest geometry.
- Stands use `grandstandEx` (positive rake, rows rise away from the track). Legacy `grandstand()` is retired here.
- Racetrack Tower: one continuous shaft + flush glass (no inter-floor air gaps — ground-audit unsupported BFS).

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
