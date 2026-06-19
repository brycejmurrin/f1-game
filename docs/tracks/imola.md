# Imola — Autodromo Enzo e Dino Ferrari (Italy)

**Game setting:** DAY · green theme (parkland by a river). Render: procedural colored BOXES, no textures. Objects placed by arc-fraction `s` (0.0 at start/finish, increasing in racing direction, wrapping to 1.0), Left/Right side, lateral distance band, tinted `[r,g,b]` 0–1.

## 1. Setting
An old-school **parkland circuit** opened 1953, running along the right bank of the **Santerno river** at the foot of the wooded **Imola hills**, 40 km east of Bologna. The lap is essentially a road following the river, then looping back up and over a couple of small hills through mature trees and grassy banks — narrow, enclosed, and intimate compared with modern tracks.

## 2. Atmosphere & palette
Bright Italian spring sky `[0.55,0.74,0.95]`, soft warm light. Dominant **parkland greens**: deciduous canopy `[0.20,0.46,0.22]`, shaded woods `[0.11,0.30,0.15]`, sunlit grass bank `[0.42,0.63,0.30]`. The **Santerno river** runs muted green-brown `[0.30,0.42,0.34]`. Gravel traps pale tan `[0.78,0.70,0.52]`. Thin morning **fog** lingers in the river valley and shaded dips (Acque Minerali, Rivazza) — light and dissipating, not heavy.

## 3. Elevation
Notably **hilly** in the mid-to-late lap. Flat river-side run to Tosa (~s 0.00–0.30), then a steady **climb to Piratella** at a blind hill-crest (~s 0.35), a drop and **climb to Acque Minerali** (~s 0.45–0.55), up over the **Variante Alta** crest (~s 0.65), then a **descent into Rivazza** (~s 0.80). Vary ground-box top heights here; keep the first third near-flat.

## 4. Landmarks & surroundings by lap position
| s | Side | Distance | Box-modelling description |
|------|------|----------|---------------------------|
| 0.00 | L | near | **Old pit building** + main grandstand: long stacked pale-grey boxes `[0.58,0.60,0.63]`, red trim row |
| 0.00 | R | near | **Santerno river** flat slab `[0.30,0.42,0.34]` running parallel to start straight |
| 0.05 | L | near | **Tamburello** chicane: red/white kerb boxes + **Ayrton Senna memorial** statue area, small bronze box `[0.45,0.40,0.30]` on green lawn |
| 0.12 | L | near | **Villeneuve** chicane kerbs; gravel trap tan slab beyond |
| 0.20 | R | mid | River + tree line hugging the back run to Tosa |
| 0.28 | L | near | **Tosa** tight hairpin: stepped grandstand box, gravel run-off |
| 0.35 | L+R | far | **Piratella** blind hill-crest: dark wooded green box walls, ground rises |
| 0.50 | R | mid | **Acque Minerali** right-left in a green hollow: dense trees `[0.11,0.30,0.15]`, fog band |
| 0.60 | L | far | **Wooded hills** backdrop: tiered dark-green box ridges on horizon `[0.16,0.34,0.18]` |
| 0.66 | L+R | near | **Variante Alta** chicane over a crest: tall sausage **kerb** boxes |
| 0.80 | L | mid | **Rivazza** double-left descent: grass banks, gravel, grandstand box |
| 0.92 | R | near | **Variante Bassa** / pit approach kerbs back toward river and pit straight |

## 5. Track features
- Runs roughly **anti-clockwise** in flow — an unusual, distinctive direction.
- Old-school narrow ribbon with classic **chicanes** (Tamburello, Villeneuve, Variante Alta, Bassa) and tight corners.
- Aggressive **old-school kerbs** — bright red/white, some raised sausage kerbs.
- Strong **elevation** through the wooded second half; flat river straight up front.

## 6. Modelling notes
- Pair a flat river slab (right of the start straight) with dense green tree walls to sell "circuit beside a river in a park."
- Keep the first third flat, then ramp ground-box tops up for Piratella/Acque Minerali and drop them into Rivazza.
- Tier dark-green box ridges on the horizon for the Imola hills enclosing the back of the lap.
- Punctuate the lap with red/white kerb-box clusters at each chicane for rhythm.
- A small bronze statue box on a green lawn near Tamburello reads as the Senna memorial — a quiet landmark.
- Thin fog boxes in the river valley and shaded hollows add old-school mood.
