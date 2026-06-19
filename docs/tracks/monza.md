# Monza — Autodromo Nazionale Monza (Italy)

**Game setting:** DAY · green theme (royal park). Render: procedural colored BOXES, no textures. Objects placed by arc-fraction `s` (0.0 at start/finish, increasing in racing direction, wrapping to 1.0), Left/Right side, lateral distance band, tinted `[r,g,b]` 0–1.

## 1. Setting
The "Temple of Speed," opened 1922, set inside the **Royal Villa park of Monza** — Europe's largest walled park (~688 ha) just north of Milan. Track threads through dense woodland of **umbrella pines** and tall deciduous trees, past the neoclassical **Villa Reale**, ornamental lakes, and the crumbling old banked oval (Sopraelevata).

## 2. Atmosphere & palette
Bright Italian summer sky, warm low-downforce speed haze. Predominantly green: canopy `[0.18,0.45,0.20]`, shaded pine `[0.10,0.30,0.14]`, sunlit grass verge `[0.40,0.62,0.28]`. Sky `[0.55,0.74,0.95]`, gravel traps pale tan `[0.78,0.70,0.52]`. Light, low morning **fog** drifting between trees (especially Roggia, shaded under bridge/trees) — thin and dissipating, not heavy.

## 3. Elevation
Fairly **flat** throughout. Only minor undulations: a gentle dip and rise approaching Variante della Roggia (~s 0.30) and a subtle crest into the Lesmos (~s 0.45–0.52). Keep box heights near-constant; vary ground-box top by ≤1 unit.

## 4. Landmarks & surroundings by lap position
| s | Side | Distance | Box-modelling description |
|------|------|----------|---------------------------|
| 0.00 | L | near | **Tribuna Centrale** main grandstand: stepped stack of long grey-blue boxes `[0.55,0.58,0.62]`, red trim row |
| 0.00 | R | near | Pit wall + **podium tower** as tall slim white box `[0.90,0.90,0.88]` with red cap |
| 0.04 | R | mid | **Variante del Rettifilo** chicane: red/white kerb boxes, gravel trap tan slab |
| 0.10 | L+R | far | Dense pine wall flanking **Curva Grande** sweep, dark-green box rows |
| 0.30 | L | near | **Variante della Roggia** chicane under tree shade; cooler green tint, fog band |
| 0.40 | R | far | **Park lake** (Villa Reale pond): flat reflective blue slab `[0.30,0.50,0.70]` |
| 0.45 | R | mid | **Lesmo 1 & 2** curves hugging woodland; tight tree boxes |
| 0.55 | L | far | Old **Sopraelevata** banking ruin: tilted grey concrete ramp boxes `[0.62,0.60,0.58]`, moss-green `[0.35,0.45,0.30]` |
| 0.62 | R | far | Glimpse of **Villa Reale**: cream neoclassical box block `[0.86,0.80,0.66]` |
| 0.78 | L+R | near | **Variante Ascari** chicane: triple kerb-box sequence, gravel run-offs |
| 0.90 | L | near | **Parabolica / Curva Alboreto**: long sweeping kerb arc, wide gravel slab outside |
| 0.96 | R | far | Distant **Milan skyline** silhouette: faint grey box towers on horizon `[0.62,0.66,0.72]` |

## 5. Track features
- Three long **straights** (start/finish, Curva Grande approach, back straight) — top-speed corridors.
- Three heavy-braking **chicanes** (Rettifilo, Roggia, Ascari) with aggressive sausage **kerbs**.
- Long fast **Curva Grande** and the iconic constant-radius **Parabolica** onto the main straight.
- Wide gravel run-offs; classic red/white kerbs everywhere.

## 6. Modelling notes
- Make green dominate: thick continuous pine/tree box walls lining nearly the whole lap sell the enclosed-park feel.
- Keep terrain flat — character comes from speed and tree corridors, not hills.
- Punctuate straights with bright red/white kerb boxes at each chicane for rhythm.
- One reflective blue lake slab + cream Villa box are enough to evoke the royal grounds.
- Tilted grey ramp boxes for the Sopraelevata ruin read instantly as the historic banking.
- Tribuna Centrale + slim podium tower frame the start/finish; thin drifting fog boxes add mood near shaded corners.
