# Hockenheimring — Visual Design Brief

**Setting:** DAY, green theme (Baden pine forest on the Rhine plain). ~4.57 km, 17 turns, clockwise.

## 1. Setting
Two circuits welded together. Three quarters of the lap is a corridor cut dead straight through the **Hardtwald**, a managed pine plantation south of Heidelberg — no crowd, no buildings, nothing but a wall of trunks either side of the armco. Then the track turns back on itself and drops into the **Motodrom**, a purpose-built stadium bowl where the entire spectator capacity is stacked in one unbroken ring of terracing around three slow corners. The contrast between the empty forest and the packed arena *is* Hockenheim; anything that softens it is wrong.

## 2. Atmosphere & palette
Hazy continental summer light, high sun, warm haze on the treeline. Green dominates outside the bowl; inside it, grey concrete and dense crowd colour.
- Sky: zenith `[0.26, 0.44, 0.72]`, horizon `[0.74, 0.76, 0.72]`
- Sun `[1.0, 0.94, 0.76]`; fog `[0.70, 0.72, 0.70]`
- Baden pine: deep `[0.09, 0.25, 0.13]`, mid `[0.11, 0.30, 0.15]`; broadleaf `[0.19, 0.44, 0.20]`
- Grass verge `[0.19, 0.42, 0.19]`; gravel `[0.66, 0.61, 0.48]`; concrete `[0.68, 0.68, 0.66]`
- Motodrom terracing: risers `[0.63, 0.62, 0.59]` / `[0.55, 0.55, 0.53]`, crowd bands `[0.88, 0.86, 0.82]`, `[0.22, 0.30, 0.52]`, `[0.78, 0.28, 0.22]`, `[0.90, 0.78, 0.28]`
- Kerbs: red `[0.80, 0.14, 0.14]` / white `[0.90, 0.90, 0.90]`

## 3. Elevation
Flat by F1 standards — this is the Rhine plain — but not dead flat.
- s≈0.00–0.15: level pit straight and Nordkurve.
- s≈0.26: the forest loop drifts gently **down** (~3.5 m) along the Parabolika.
- s≈0.46: **Spitzkehre** sits in the low corner of the site (~5 m below the line).
- s≈0.70–0.80: steady **climb** back up (~4 m) into the Motodrom.

## 4. Landmarks & surroundings by lap position
| s | Side | Distance | Box description |
|------|------|----------|-----------------|
| 0.00 | R | near | Pit terrace: six bays, one shallow **sloping roof plane** on raking struts over a glazed team balcony |
| 0.00 | L | near | Main grandstand: the one separate steel stand, cantilever roof, 140 m long |
| 0.00 | — | over | Start/finish gantry, dark steel; second gantry at 0.975 |
| 0.02 | R | far | Paddock hospitality blocks + broadcast compound (vans, dishes, mast) |
| 0.06–0.32 | both | near | **Hardtwald wall**: continuous ragged dark-green canopy mass right behind the armco, two overlapping depths |
| 0.33 | R | near | Ostkurve gravel apron + blue tyre wall; concrete stand opposite on L |
| 0.40 | L | near | Four braking-marker boards on posts down the Parabolika — the only signage in the forest |
| 0.46 | L | near | **Spitzkehre**: big pale gravel trap, red tyre wall, marshal post |
| 0.46 | R | mid | Temporary steel stand on the outside of the hairpin + camera tower |
| 0.62 | R | near | Forest-exit gravel apron, marshal post; trees resume immediately |
| 0.76 | L | mid | Earth spectator terraces closing the far end of the bowl |
| 0.79–0.95 | R | near | **Motodrom outer ring**: 5 rows of stepped concrete terracing, unbroken, with a continuous cantilever roof band and fascia above |
| 0.84–0.97 | L | near | Motodrom inner ring: shallower 3-row terrace facing back across the infield |
| 0.88 | R | mid | Stadium **videowall** on twin columns — the tallest object in the arena |
| 0.89 | L | far | Infield service compound: three low sheds under shallow pitched roofs |
| 0.80–0.96 | both | near | Low sponsor hoarding runs at the foot of the terracing (1.2–1.3 m only) |
| — | ring | far | Continuous Hardtwald backdrop: three concentric ranks of dark ridge boxes at 110/180/255 m |

## 5. Track features
- Long flat-out **Parabolika** ending in the Spitzkehre hairpin — the one heavy braking zone in the forest.
- Three stadium corners (Mercedes-Tribüne, Sachskurve, Südkurve) inside the bowl, all pinched to 6.6 m half-width.
- Modest camber only: Nordkurve 3°, Ostkurve entry 2.5°, Sachskurve 4°.
- Wide gravel traps at the Spitzkehre and Ostkurve; armco through the forest, debris fence in the stadium.

## 6. Modelling notes
- Build the Motodrom as ONE continuous rake walking the arc node by node — separate stand boxes with daylight between them is exactly what Hockenheim does not look like.
- Keep the forest section completely undressed: no stands, no lamps, no hoardings. Emptiness is the point.
- Emit the tree wall as overlapping prism slabs at two depths so its silhouette is ragged, then break its edge with scattered individual pines in front.
- The pit roof and the stadium rake are SLOPES — tilt the basis; a stack of axis-aligned boxes cannot fake either at silhouette distance.
- Keep hoarding under ~1.4 m along the bowl: the terracing starts 13 m out and anything taller stands in front of the first row.
- Ring the whole site with three ranks of dark ridge boxes so no horizon ever opens onto empty ground.
