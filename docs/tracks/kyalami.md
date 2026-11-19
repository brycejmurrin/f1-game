# Kyalami Grand Prix Circuit — Visual Design Brief

**Setting:** DAY, green theme (Gauteng highveld). ~4.522 km (built 4480 m);
16 numbered turns, all 16 in the def's `turns`.
**Racing direction:** ANTICLOCKWISE (since 2026-11-18, #5316 CIRC2-05, Bryce's
`decision: Kyalami A`). Source: SRO/IGTC 2023 Kyalami 9 Hour briefing notes,
https://www.intercontinentalgtchallenge.com/documents/notice/3374/2023+Kyalami+9+hr+V1+Briefing+Notes.pdf
— p. 8 circuit map (turn names, Int 1 1470 m, Int 2 3253 m), p. 9 pit lane on
satellite. The def runs the OSM trace in its own order (`reverse: false`); the
built lap's net turning is +360° (+k = left). It ran clockwise before, with
Crowthorne as a right-hander T1; that build was the same loop driven backwards.

**Start line and pits:** the line is on control node 0, 201 m toward Ingwe from
the old line: Ingwe's apex 268 m before it, The Kink 252 m after (Wikipedia: "a
few hundred metres after the start/finish line"). The pit lane is on the
INFIELD (driver's left, `pit.side: -1`): entry road from 220 m before the line
(48 m past Ingwe's apex), exit road closed 200 m after it, before The Kink;
the engine's garage row stands about -46…+86 m.

**Turns (racing lap fraction):** T1 The Kink 0.058 (R, r ~500 m, flat out),
T2 Crowthorne 0.147 (L hairpin), T3-4 Jukskei Sweep 0.182 / 0.202, T5 Barbeque
0.227 (L), T6 Sunset 0.343 (long R), T7 Clubhouse 0.437 (L), T8-9 The Esses
0.497 / 0.520, T10 Leeukop 0.633 (L), T11 0.654, T12 Mineshaft 0.739, T13-14 The
Crocodiles 0.819 (R hairpin) / 0.847, T15 Cheetah 0.880 (R), T16 Ingwe 0.940
(slow L onto the straight). Sectors: the SRO intermediates, 0.325 and 0.719.

**Saved laps:** the def carries `revision: 2`. Every ghost, input ghost and
time-trial board row is stored under a comparable-class key whose `layout` is
`[revision, n, total]`; n and total did not change, so the revision is what
keeps a clockwise lap out of the anticlockwise class. Old rows stay in storage
untouched; they are never replayed, compared or shown as the picker's best.

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
nodes or flatten hills to seat props. Symmetric bumps keyed by source index, so
the direction flip moved none of them (racing fraction in brackets):
- 0.19: **10 m dip** through Jukskei.
- 0.40: the long **13 m climb** to Clubhouse.
- 0.62: 8 m further up to the circuit's high point at Leeukop.
- 0.84: **14 m drop** through the Crocodiles toward Ingwe and the main straight.

## 4. Landmarks & surroundings by lap position
Racing lap fraction; side as the driver sees it (L = infield on the straight).
| s | Side | Distance | Box description |
|------|------|----------|-----------------|
| 0.004 | L (−1) | near | **Pit block** (`kyalami-pit-block`, required) behind the engine's garages: unpainted face brick under a corrugated **verandah** on slender steel posts, red-oxide fascia |
| 0.991 | L | near | Race control (`kyalami-race-control`, required): squat brick box with a continuous brise-soleil band, lattice timing mast |
| 0.004 | R (+1) | near | **Main grandstand** (`kyalami-main-grandstand`, required), opposite the pits: sandstone/face-brick bowl under a corrugated lean-to on red-oxide trusses — Highveld vernacular, not a modern cantilever. Length ~80 m approximate |
| 0.026 | R | near | Main iron terrace beside it |
| 0.951–0.049 | R | near | Sponsor hoarding down the main straight (2.4 m boards) |
| 0.037 | L | far | **Clubhouse** (`kyalami-clubhouse`, required) in the infield paddock: face brick under a low pitched tile roof with a deep shaded **stoep** on square brick piers |
| 0.147 | outside | near | **Crowthorne** (T2): gravel apron + yellow tyre wall; exit terrace at 0.160 |
| 0.437 | outside | near | Clubhouse (T7) gravel apron |
| 0.345 | R | mid | **Windpump and dam** (`kyalami-windpump`, required): multi-blade steel fan on a lattice tower over a circular corrugated reservoir |
| 0.535–0.615 | R | mid | Climb terracing and grass bank |
| 0.565–0.685 | both | far | Open high plateau — foliage suppressed; the emptiness is the point |
| 0.705 | far | mid | **Mine headgear** (`kyalami-headgear`, required): four-legged steel A-frame, sheave wheels, winder house, conveyor toward the dumps — Gauteng reef silhouette, not a surveyed shaft on the property |
| 0.819 | outside | near | The Crocodiles (T13): gravel apron + blue tyre wall |
| 0.940 | outside | near | **Ingwe** (T16): gravel apron + red tyre wall; terrace on the exit, outside |
| — | ring | far | Low, wide highveld ridges; **flat-topped mine dumps** (pale cyanided sand) on the best arc of the skyline; Johannesburg towers as a faint smudge |

### Turn names — sourced vs uncertain
- **Use on the modern layout:** the 16 SRO turns above (briefing notes p. 8); `tools/track/corner-names/kyalami.json` maps each name to its `turns` index.
- **Do not rebuild as fact:** pre-1989 corners that were deleted with the long main straight and old Leeukop/pit complex. The game’s OSM path is the post-rebuild circuit.

## 5. Track features
- Long main straight from Ingwe, flat through The Kink, into **Crowthorne** — the classic Kyalami overtake, downhill-braking.
- Big elevation swings on both the climb and the plunge; the high point looks out over the whole site.
- Three pinch points (s≈0.25, 0.56, 0.88); camber 4° at Crowthorne (T2), 4.5° through Sunset (T6), 3.5° at T11.
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
