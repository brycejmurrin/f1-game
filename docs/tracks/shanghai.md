# Shanghai International Circuit — Visual Design Brief

**Setting:** DAY · Modern theme · 5.451 km, 16 turns, clockwise

## 1. Setting
Purpose-built Tilke circuit (opened 6 June 2004) in Jiading District, Shanghai,
on reclaimed marshland / former rice paddies stabilized by massive groundworks.
The layout is deliberately shaped like the Chinese character **上 (shàng)**,
"above / ascend." Sprawling, flat, infrastructure-heavy: huge grandstands, twin
wing bridges over the pit straight, broad asphalt run-offs, Yu Garden paddock
pavilions in lakes, and a hazy marsh backdrop (distant Pudong is a soft cue
only — the circuit is ~30+ km from central Pudong; a crisp skyline from the
track is not confirmed).

Sources: https://en.wikipedia.org/wiki/Shanghai_International_Circuit

## 2. Atmosphere & Palette
Frequently hazy, low-contrast sky — pale grey-blue with diffuse white sun, soft
long-distance fog. Modern materials: concrete greys, white steel / aluminium,
dark asphalt, accents of red/gold (luck/power colours — Autosport 2004) and
yellow signage. Marshland greens around the perimeter.
- Sky: `[0.72, 0.76, 0.80]` (hazy pale blue-grey)
- Fog/haze: `[0.80, 0.82, 0.83]`, thick beyond ~600 m
- Asphalt: `[0.26, 0.27, 0.29]`
- Pale runoff: `[0.58, 0.58, 0.60]`
- Concrete/steel: `[0.70, 0.72, 0.74]`
- Grass/marsh green: `[0.34, 0.45, 0.28]`

## 3. Elevation
Flat by F1 standards, but not literally level: the reclaimed marsh site is
engineered with ~6.7 m of long-wavelength relief, all under ~1.7% grade. A
subtle rise on the Turn 1–2 climb and exit of Turn 6 ("winds uphill"); the real
feature is a broad crest on the back straight (`js/circuits/shanghai.js`'s
`elevations` anchors it at s≈0.45, 6.5 m — kept there rather than moved to the
T1-2 bump to avoid a prop-interpenetration clash with the skyline towers).
Model this as three long, gentle cosine bumps, not a flat plane with two dents.
**Do not add knife-edge elevation jolts.** Residual `_sceneryShift` ≈ 0.09
(frame debt — probe before touching `sceneryStartFrac`).

## 4. Landmarks & Surroundings by Lap Position
| s | Side | Distance | Box-model description |
|------|------|----------|------------------------|
| 0.00 | L | near | Twin wing bridges (required): aluminium/glass/steel decks ~36–40 m on end pylons spanning the pit straight at either end of the main-stand/pit complex. Sourced as fact; exact media-vs-VIP role and precise spacing are UNCERTAIN — both stay neutral wings. |
| 0.00 | L | mid | Main grandstand ~30,000 steeply raked seats (Autosport 2004) — long white tiers behind the wings |
| 0.00 | L | mid | Yu Garden paddock (required `shanghai-yu-pavilions`): white pavilion boxes with red prism roofs on island pads in the lakes |
| 0.00 | R | near | Pit wall + low garage boxes, white/grey, red-edged |
| 0.04 | L | mid | Start grandstand tiers: stacked grey stepped boxes |
| 0.05–0.11 | R | near | Snail T1–3: coiling pale `runoffApron` pads + dense red/white kerb verge |
| 0.08 | R | mid | Secondary overlapping-circles / lotus-leaf roof stand (required `shanghai-circles-stand`) — grandprix.com 2004; Taiyo Kogyo PTFE lotus canopies on SE secondary stands |
| 0.30 | L | far | One hazy Pudong cluster (Pearl + Jin Mao + Shanghai Tower) — soft cue only; no wraparound skyline rings |
| 0.45 | R | mid | Mid-sector grandstand: low stepped grey box bank |
| 0.47 | over | near | Mid-arena spectator footbridge: white span crossing the track (7.2 m clearance) |
| 0.62 | L | far | Marsh/treeline: flat green mound strips + wetland plane |
| 0.78 | R | near | Long back straight: open flat green/grey verges, sparse signage boxes |
| 0.90 | L | mid | T14 hairpin grandstand: curved bank of stepped grey boxes + pale runoff apron |
| 0.96 | R | near | Pit entry buildings: white boxes returning to main complex |

### Twin wing bridges — what is sourced vs uncertain
- **Sourced:** two wing-like viewing platforms of aluminium, glass and steel
  cross the circuit at either end of the main grandstand / pit complex; one
  houses media, the other VIP guests; media view ~40 m above the straight;
  main stand ~30,000 steeply raked seats.
  — Wikipedia; https://www.grandprix.com/news/shanghai-shaping-up.html ;
    https://www.autosport.com/f1/news/analysis-china-raises-f1-to-new-heights-5067038/5067038/
- **Uncertain:** exact frac spacing, whether the wings are straight or angled,
  and which wing is media vs VIP. Do not reassign roles; keep both neutral.

### Secondary circles / lotus roof — sourced
- grandprix.com 2004: "unusual secondary grandstand design … series of
  overlapping circles forming the roof."
- China Daily / GKD: secondary stand roofs shaped like lotus leaves.
- Taiyo Kogyo: 26 elliptical PTFE membrane canopies on the SE secondary stands
  (288 m run). Bay count here is stylised.

## 5. Track Features
- **T1–3 snail spiral (s≈0.04–0.10):** tightening decreasing-radius right that coils inward — pale coiling runoff pads + strong kerb rhythm so it reads from the cockpit.
- **Long back straight (s≈0.72–0.88):** ~1.2 km dead-straight, one of F1's longest; open marsh verges (no tower wall).
- **T14 hairpin (s≈0.90):** heavy braking at the straight's end — sharp tight left, pale runoff apron.
- **Kerbs:** red/white striped low boxes on apexes and exits; denser through the snail.

## 6. Modelling Notes
- Lead with the **twin wing decks**: aluminium slab + glazed soffit/side band on
  end pylons at s≈0.004 / 0.022 — collapse any competing roof systems into this gateway.
- Secondary **overlapping-circles / lotus** roof on the SE snail outside
  (`shanghai-circles-stand`).
- Keep everything **grey/white/concrete/aluminium** with marsh-green verges;
  reserve color for red kerbs, red pavilion roofs, and yellow signage.
- Backdrop = **marsh mounds + one hazed Pudong** — never wraparound glass rings.
- **Yu Garden paddock**: small white pavilion boxes with red roofs on island
  pads in the lakes beside the pit.
- Stack grandstands as **stepped box tiers**; vary height to imply the 200,000-seat scale.

## Research pass — the marshland it was built on

The circuit's origin story is its landscape: this was **swampland used as rice
paddy**, and the ground was so soft that a raft of concrete piles had to be
sunk before anything could be built on it (racingcircuits.info; F1.com dates
the groundworks to April 2003). The lap was dressed with the city and the pit
complex, but the outfield was plain ground — which loses the one thing that
makes Jiading look like Jiading rather than like any Tilke infield.

Eight paddy blocks added (2×3 paddies each), gap 108–158. What carries it:

- **Rectangular, flooded, bunded.** Those three facts are the whole read. Each
  paddy sits *inside* a raised earth bund and is slightly sunk.
- **Real water, not green paint.** The flooded paddies use `waterSurface`, so
  they mirror the sky. That mirror is what sells them from a moving car; a
  green slab would just read as a lawn.
- ~22 % are **fallow** — drained, bare worked earth — so the block isn't uniform.
- **Reed fringes** on the outer edge, where the paddies stop being farmed and
  go back to marsh.
