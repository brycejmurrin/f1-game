# Kyalami Grand Prix Circuit — Visual Design Brief

**Setting:** DAY, green theme (Gauteng highveld). ~4.522 km, 16 turns.
**Racing direction:** anticlockwise in the live layout (`reverse: true` in the
def flips the OSM-authored clockwise trace). Official site lists
“Track run/direction: Anticlockwise”
(https://www.kyalamigrandprixcircuit.com/about-kyalami/).

## 1. Setting
On the reef between Johannesburg and Pretoria. The altitude is the whole
atmosphere: the sun is harsh, the sky is a deep hard blue, sightlines are long
because the air is thin, and the winter grass is **straw-gold**, not green. The
veld is open — flat-topped acacia thorn scattered over golden grass, ranks of
imported blue-gum along the boundaries, red laterite scars where the ground is
worn through. The built world is face brick, red oxide and corrugated iron, and
the horizon carries the flat-topped **tailings mesas** of the Witwatersrand gold
reef.

**Altitude (UNCERTAIN):** the official site quotes **1532 m**; older fan / brief
copy said ~1750 m. Do not treat either as surveyed terrain height in-game —
elevation comes from the authored `elevations` table only.

## 2. Atmosphere & palette
Hard high-altitude light, deep blue zenith, thin clear air with long visibility.
- Sky: zenith a deep `[0.14, 0.36, 0.76]`, horizon `[0.76, 0.76, 0.70]`; sun `[1.0, 0.96, 0.84]`
- Fog `[0.74, 0.74, 0.68]` at density ≈**0.0022** — the thinnest in the game; keep distance sharp
- **Straw-gold veld** `[0.44, 0.42, 0.22]`; dry scrub `[0.44, 0.40, 0.22]` / `[0.36, 0.34, 0.19]`
- Acacia thorn `[0.24, 0.36, 0.20]` / `[0.19, 0.30, 0.17]` — grey-blue green, never lush; blue-gum `[0.20, 0.34, 0.22]`
- Red laterite earth `[0.62, 0.44, 0.28]`; run-off `[0.60, 0.46, 0.32]`
- Face brick `[0.58, 0.36, 0.27]` / `[0.48, 0.29, 0.22]`; red-oxide trim and corrugated iron

## 3. Elevation
Built across a ridge — the authored table uses ~45 m of swing. That figure is a
**repo relief target**, not an SRTM re-survey this pass; do not add knife-edge
nodes or flatten hills to seat props.
- s≈0.16: **10 m drop** away from Crowthorne.
- s≈0.36: the long **13 m climb**.
- s≈0.58: 8 m further up to the circuit's high point.
- s≈0.80: **14 m plunge** back down to the main straight.

## 4. Landmarks & surroundings by lap position
| s | Side | Distance | Box description |
|------|------|----------|-----------------|
| 0.98 | L (+1 racing) | near | **Pit block** (`kyalami-pit-block`, required): unpainted face brick under a corrugated **verandah** on slender steel posts, red-oxide fascia |
| 0.999 | L | near | Race control (`kyalami-race-control`, required): squat brick box with a continuous brise-soleil band, lattice timing mast |
| 0.950 | R (−1 racing) | near | **Main grandstand** (`kyalami-main-grandstand`, required): sandstone/face-brick bowl under a corrugated lean-to on red-oxide trusses — Highveld vernacular, not a modern cantilever. Length ~80 m approximate |
| 0.95–0.05 | R | near | Sponsor hoarding run down the main straight (2.4 m boards) |
| 0.965 | L | far | **Clubhouse** (`kyalami-clubhouse`, required): face brick under a low pitched tile roof with a deep shaded **stoep** on square brick piers |
| 0.078 | outside | near | **Crowthorne**: gravel apron + red tyre wall — classic overtaking place (name retained on the modern layout) |
| 0.10–0.18 | outside | mid | Low crowd bank further out on the drop (2 rows — grade falls away) |
| 0.15–0.30 | both | mid | Open veld: scattered flat-crowned acacia, red laterite walkway scars, blue-gum rows on the boundary |
| 0.255 | inside | near | Gravel apron + blue tyre wall on the descent |
| 0.34 | far | mid | **Mine headgear** (`kyalami-headgear`, required): four-legged steel A-frame, sheave wheels, winder house, conveyor toward the dumps — Gauteng reef silhouette, not a surveyed shaft on the property |
| 0.36–0.48 | both | far | Open high plateau — foliage suppressed; the emptiness is the point |
| 0.42–0.52 | L | mid | Climb terracing |
| 0.565 | outside | near | Gravel apron near the circuit's high point (Leeukop) |
| 0.70 | L | mid | **Windpump and dam** (`kyalami-windpump`, required): multi-blade steel fan on a lattice tower over a circular corrugated reservoir |
| 0.885 | inside | near | Gravel + yellow tyre wall at the bottom of the plunge |
| — | ring | far | Low, wide highveld ridges; **flat-topped mine dumps** (pale cyanided sand) on the best arc of the skyline; Johannesburg towers as a faint smudge |

### Turn names — sourced vs uncertain
- **Use on the modern layout:** Crowthorne, Barbecue / Barbeque, Jukskei Sweep, Sunset, Clubhouse, The Esses, Leeukop (and later Mineshaft / Crocodiles / Cheetah / Ingwe on post-2015 naming). Sources: Wikipedia / SAHO / 2015 revamp coverage.
- **Do not rebuild as fact:** pre-1989 corners that were deleted with the long main straight and old Leeukop/pit complex. The game’s OSM path is the post-rebuild circuit.

## 5. Track features
- Long main straight into **Crowthorne** — the classic Kyalami overtake, downhill-braking.
- Big elevation swings on both the climb and the plunge; the high point looks out over the whole site.
- Three pinch points (s≈0.25, 0.56, 0.88); camber 4° at Crowthorne, 4.5° at the high sweep.
- Run-off and verge break repeatedly to bare red laterite — highveld ground is not continuous grass.

## 6. FIA Grade-1 upgrade (2025) — sourced, not modelled as new pits
Apex Circuit Design’s “light-touch” Grade-1 plan (FIA design approval mid-2025, three-year construction window) keeps the **4.522 km layout** and focuses on run-off, barriers, debris fencing, kerbs and drainage — not a new pit complex or grandstand rebuild.
- https://www.apexcircuitdesign.com/experience/kyalami-formula-1-upgrade
- https://autoaction.com.au/2025/06/19/kyalami-cleared-for-f1-return-with-fia-grade-1-green-light
- https://www.sowetan.co.za/motoring/2025-06-19-fia-approves-kyalami-upgrade-design-for-potential-formula-one-return/

Do **not** invent Grade-1-only architecture; dress the existing Grade-2 vernacular.

## 7. Modelling notes
- Get the grass colour right first. Straw-gold veld with red earth breaks is half of why photographs of this place look nothing like a European circuit; green grass ruins it instantly.
- Acacia karroo is a bare trunk forking low into ONE wide, shallow, near-horizontal crown. A rounded canopy here reads as English parkland.
- Keep the fog density low and the ridges far out and flat. This is a high plateau, not a valley — no close hills.
- Build in face brick, red oxide and corrugated sheeting. Model the iron roofs rib by rib; a smooth slab loses the whole vernacular.
- Spectator cover is a corrugated lean-to on a raked frame — no cantilever, no fascia, nothing modern.
- The mine dumps are the single most recognisable shape on the Gauteng horizon: dead-level tops, straight sides, a pale cyanided-sand colour that belongs to no natural hill. Give them the best arc of sky.


## Research pass — verified, already covered

Already excellent, and for the right reasons. It hand-builds **Acacia karroo** — bare trunk forking low into one wide, shallow, near-horizontal crown — with the note that *"a rounded tree() canopy here would read as European parkland."* Plus blue-gum windbreak rows and the red laterite scars where the veld wears through. Nothing to add on flora. Wave-6 pass: required `kyalami-main-grandstand`, explicit `{required:true}` on headgear / windpump / clubhouse, and ground-audit seating / spectator-hill pull-back on the Crowthorne drop.
