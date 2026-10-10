# Track designer — player guide

The TRACK DESIGNER builds your own circuit and races it like any shipped one:
the full field, time trial, ghosts and the leaderboard. This page is the long
form of the designer's own **HOW TO** tab (`js/editor/designer.js`, the `HOWTO`
table); keep the two saying the same thing.

## Open it

- **Title menu → TRACK DESIGNER.**
- **A share link** (`…/#track=APXT1…`) opens the designer straight on the shared
  circuit. Your own unsaved design is not lost: UNDO brings it back.
- **The race picker:** under the **MY CIRCUITS** chip, a saved circuit's
  **EDIT IN DESIGNER** chip reopens it.

The screen is a canvas (the circuit from above) and a rail with three tabs:
**DESIGN** (the tools), **MY CIRCUITS** (what you have saved) and **HOW TO**
(this guide, short). Your work autosaves as a draft, so closing the screen or
the browser loses nothing.

## The 60-second start

1. The first time you open it, **RANDOMISE** has already drawn a legal circuit.
   Press RANDOMISE again for another one, **TRACK OF THE DAY** for the one
   everybody gets today, or **START FROM…** to trace a real circuit.
2. Drag a few white points to make it yours.
3. Check **5 CHECKS** at the bottom of the rail: green means ready.
4. **SAVE**, then **RACE** or **TIME TRIAL**.

## Select several points, then adjust their elevation

1. Open **EDIT** or **ELEVATION**, then **SELECT POINTS → RANGE**.
2. On either the main map or elevation strip, drag between two points, or tap
   the first and last points. Desktop also supports click, then Shift-click.
3. The highlighted section and point count show the same selection in both views.
   A range follows driving order: an earlier end wraps across the start line.
   Separate Ctrl/Cmd-click selections are not supported.
4. To change height immediately, use **LOWER / RAISE** below the selection
   count. The number between them is the change in metres applied to every
   selected point. This works in **EDIT** and **RANGE**, keeps the selection
   and its relative hills, and stops the whole group at the height limit.
5. Switch to **POINT** to drag the selected group. On the elevation strip,
   drag vertically to raise or lower it; in **ELEVATION**, **POINT m / SPAN m**
   and the **0.25 / 1 / 5 m** steps give precise height control.
6. **LEVEL** flattens the selection, **SMOOTH** softens its slopes, and **ZERO**
   returns it to sea level. **UNDO** reverses an edit; **CLEAR** clears selection.

**HEIGHT** above the map toggles an elevation heat map, enabled when entering
ELEVATION. Purple is low; yellow is high. The legend shows the current road’s
minimum and maximum in metres above sea level; a level circuit reads **FLAT**.
Colours rescale to the current height range after edits, including undo. This
shows height, not slope steepness, over either OUTLINE or LIVE SCENERY.
**SPEED** switches to speed colouring; the two overlays are mutually exclusive.

**HOW TO** contains expandable task guides and buttons to open each tool.
On portrait screens, the guide uses the map’s space while it is open.

## 1 SHAPE — the loop

| You want to… | Do this |
|---|---|
| Select a point | Tap (click) a white point — selecting never moves it. |
| Select a group (SPAN) | Choose **RANGE**, then tap or drag between points on the map or elevation profile; start/end point numbers also work. The range follows driving order and can cross the start line. Shift-tap, **SELECT END**, and **TURNS** rows also select spans. Switch to **POINT** to drag the selected group. |
| Move the road | Drag a **selected** point (or drag past a short threshold on mouse). With a SPAN selected, drag any point in the group — the whole stretch moves together. Arrow keys nudge 1 m (10 m with Shift), the whole SPAN when one is selected. **UNDO** restores an accidental move. |
| Add a point | Tap (click) the road between two points. |
| Remove a point | Double-tap it, press and hold it and choose DELETE, or select it and press **DELETE POINT**. A loop keeps at least 8 points. |
| Cycle points | **PREV** / **NEXT** in Edit and Elevation, **PREV POINT** / **NEXT POINT** in other modes, Tab, or `[` `]` step through the loop (clears a SPAN); Escape deselects. Enter a point number to jump directly. |
| Draw a new circuit | Pick **DRAW** and draw one closed loop in a single stroke. It closes, smooths and spaces itself, and the start goes on its longest straight. |
| Look around | Pinch or use the wheel to zoom, drag empty space to pan, **FIT VIEW** to recentre. Pan and zoom never move points. |
| Turn it around | **REVERSE** runs the circuit the other way; the start line stays put. |

Every point snaps to a 25 cm grid, which is what keeps a share link short and
exact.

## 2 CORNERS — stamping shapes

Choose **STRAIGHT**, **CORNER**, **HAIRPIN**, **CHICANE** or **S-BEND**. The
**2 CORNERS** group then shows that shape's settings and names what you are
about to lay down, for example `CORNER R 60 m × 90° LEFT`:

- **LENGTH m** — a straight's length.
- **RADIUS m** — how tight the corner is (smaller is slower).
- **ANGLE °** — how far it turns.
- **TURNS LEFT / TURNS RIGHT** — which way it turns (a chicane or S-bend: the
  way its first part turns).
- **SPIRAL m** (CORNER, HAIRPIN, CHICANE, S-BEND; 0–80 m) — eases into and out
  of the corner on an [Euler spiral](https://en.wikipedia.org/wiki/Euler_spiral):
  the road tightens steadily to the radius over that length, holds it, and
  opens out the same way, so the steering builds instead of snapping. The
  corner still turns exactly its angle and keeps its radius at the apex; it
  just takes a little more road, and the rejoin absorbs that. The length is
  rounded to whole steps of the arc (8.5–25 m), a spiral under two steps
  is left out (the engine's own smoothing already eases that much), and two
  steps of true arc always stay at the apex — so a short, tight corner may
  take less spiral than you asked for, or none. 0 is the plain arc.

Then tap the point where the shape should begin: it replaces the road after
that point and rejoins the loop. **STAMP AT SELECTED POINT** does the same for
the point you have selected. With a SPAN selected (shift-tap a second point,
**SELECT END**, or a **TURNS** row), the button reads **REPLACE THE SELECTED
SPAN** and rebuilds exactly that stretch. Not what you wanted? **UNDO**.

## The start line

Select a point and press **START HERE** (or press and hold the point). The
start needs a long straight behind it: the grid and the pit entry stand there,
and the pit exit needs some straight after it. The checks say how many metres
are missing.

## SCENERY — themes and atmosphere

Opening **SCENERY** turns on **LIVE SCENERY**: an overhead illustration of
this circuit, with theme terrain, vegetation, water, buildings and placed props.
Theme, atmosphere and object edits update it automatically. Point selection,
pan and zoom still work; **OUTLINE** returns to the plain editing map without
changing the circuit or undo history. On phones, SCENERY gives the map the
elevation strip’s space; open ELEVATION to bring both selection views back.
The preview simplifies terrain relief
and small furniture; **RACE** or **TIME TRIAL** opens the full 3D circuit.

A theme sets the scenery, the sky and the ground. The inspector has **THEMES**,
**ATMOSPHERE**, and **OBJECTS** tabs, so each task has its own controls. Arrow
keys, Home and End navigate these tabs without changing the circuit.
Browse 27 themes using
**ALL**, **NATURE**, **COAST**, **CITY**, **DESERT** or **NIGHT**, or search by
name and description. Search and category work together; **CLEAR** resets both.
Browsing does not change the circuit until you choose a theme. The current
theme and its description stay above the browser, even when filtered out.

The mode bar stays above the canvas while the inspector scrolls. Select
**SCENERY** from any inspector tab to return to these controls.

| theme | what you get |
|---|---|
| PARKLAND GP | Rolling green grass, broadleaf belts, bright noon sun |
| ALPINE FOREST | Pine walls, snowy ground beyond the verge, snow-capped peaks |
| DESERT OASIS | Sand run-off, sparse palms, a pool in the infield |
| DESERT NIGHT | The oasis under floodlights and a warm night sky |
| HARBOUR STREET | Street circuit: concrete walls, pastel town, the sea alongside |
| MARINA NIGHT | Street circuit at night: neon skyline over dark water |
| TILKE MODERN | Painted run-off, big stands, a hotel over the pit straight |
| AUTUMN COUNTRYSIDE | Amber trees, low golden sun, mist |
| TUSCAN HILLS | Golden grass, cypress rows, terracotta stands on rolling hills |
| CLIFFTOP COAST | Umbrella pines above the sea, headlands on the horizon |
| SAVANNA PLAINS | Golden grassland, acacias, distant mesas |
| MISTY FOREST | Grey damp sky, deep pine forest, forested ridges |
| AIRFIELD | Flat and open under an overcast sky, hangars and windbreaks |
| RED ROCK CANYON | Rust-red ground and towering sandstone buttes |
| WINTER SNOW | Snow to the horizon, dark firs, white peaks |
| TWILIGHT RESORT | Purple dusk, a floodlit lagoon, a hotel by the start |
| RAINFOREST | Green hills, palms and emerald peaks in humid haze |
| NORDIC LAKES | Fir forests, cold blue water and red timber houses |
| HIGHLAND MOOR | Heather ridges, stone cottages and low cloud |
| METROPOLIS | Glass towers and a downtown street circuit |
| INDUSTRIAL DOCKS | Concrete quays, cranes and grey water |
| SALT FLATS | Bright white ground, scrub and hard noon sun |
| VINEYARD VALLEY | Golden rows, olive trees and warm afternoon sun |
| STADIUM NIGHT | A floodlit bowl with packed steel grandstands |
| TROPICAL ISLAND | Turquoise water, palms and bright sand |
| BLOSSOM PARK | Pink blossom belts, spring grass, pale hills and pastel stands |
| VOLCANIC COAST | Basalt mountains, sparse scrub and a deep-blue shoreline |

**ATMOSPHERE** offers six one-click presets. **THEME DEFAULT** restores the
original sky and normal trees/crowd; **GOLDEN HOUR** combines dusk, many trees
and few spectators; **RACE NIGHT** combines night, normal trees and a packed
crowd. **QUIET PRACTICE** uses daylight with few trees and spectators;
**SUNSET FESTIVAL** combines dusk, many trees and packed stands;
**FOREST ESCAPE** uses daylight, many trees and few spectators.
Each preset is one **UNDO** step. The three rows below can fine-tune it:

- **TIME OF DAY** — AUTO keeps the theme's own sky. DAY, DUSK (a low orange
  sun) or NIGHT (floodlights and lamps along the lap) override it; a street
  theme switches between its day town and its neon night town.
- **TREES** — FEW, NORMAL or MANY forest along the straights.
- **CROWD** — FEW, NORMAL or PACKED grandstands and spectator banks.

They are part of the circuit: a share link or exported file carries them, and
changing one makes it a new circuit for time-trial boards.

### Trackside props

Open **OBJECTS**. The inspector separates **CHOOSE AN OBJECT**, **PLACE OBJECTS**,
and **PLACED OBJECTS**. Filter the library by **NATURE** or **RACE VENUE**, or
browse **ALL**. Each selected object has a description. Pick **STAND**, **GANTRY**, **TREES**, **WATER**, **FLOOD**,
**BOARD**, **PALMS** (three palms), **HEDGE** (a 48 m clipped hedge),
**PINES** (three tall pines), **BUSHES** (five low shrubs), **MARSHAL**
(a signal shelter), or **CAMERA** (a broadcast tower), then
select a control point on the map or enter its number. Choose **LEFT**, **RIGHT**
or **BOTH** in driving
direction and type a **ROADSIDE GAP** in metres (distance from the road edge),
or use the − / + controls. **RESET GAP** restores that object’s default spacing. Each prop
kind remembers its spacing while the designer is open. Clearances match the
renderer, up to 120 m; gantries span the road and have no side/gap controls.

**PLACE AT POINT** adds at the selected point; with nothing selected the button
explicitly says **PLACE AT START**. **ALONG SECTION** evenly spaces 2–8 positions
between the start and end points in driving order. An earlier end wraps across
the start line. **BOTH** places a pair at each position; gantries span the road
and are never doubled. The button shows the total object count. A placement
that exceeds a cap is refused in full, and the entire batch is one **UNDO**.

The list shows each object's type, lap position, side and spacing. **EDIT**
opens exact lap-percentage, side and gap controls; **APPLY** updates that object.
**MOVE TO POINT** moves it to the selected map point, and **COPY TO POINT**
places another of the same kind there. **REMOVE** deletes that specific object;
**REMOVE LAST** removes only the selected kind. These operations support undo/redo,
autosave, saved circuits and share links. Existing per-kind caps and the total
limit of 16 props still apply. **SWAP ENDS** selects the opposite section
around the loop without moving the track or changing any placed objects. Pine and
bush clusters allow up to six placements each; marshal shelters and camera towers
allow four each.

## 4 DETAILS

Name the circuit (24 characters) and set **HALF-WIDTH m**, half the road's
width, from 5 to 8 m. **SPAN WIDTH m**, under it, narrows just the stretch
you have selected (tap a point, shift-tap a second, or tap a row under TURNS)
down to 5 m, tapering gently in and out (never steeper than 1 m in 20 m);
step it back up to the half-width and the stretch is full width again. It
only narrows — the road never gets wider than its half-width — and a circuit
keeps up to 24 such stretches. They stay on their points when you add, delete
or stamp elsewhere. Three rows of chips live here too:

- **RANDOMISE · TRACK OF THE DAY · START FROM…** — three ways to a new
  circuit. **TRACK OF THE DAY** draws the same circuit for everyone on the
  same day (UTC), so you can race your friends' times on it. **START FROM…**
  opens a card for every shipped circuit; pick one and its real layout becomes
  your design, named `<CIRCUIT> REMIX`, ready to change. Your previous design is
  one UNDO away, and SAVE adds the remix as a new circuit.
- **REVERSE · START HERE · DELETE POINT · UNDO · REDO · FIT VIEW · SPEED · TEST HERE** —
  **TEST HERE** drives from the selected point (see Test drive). **SPEED** colours the road by how fast a car takes it, yellow (slow) through
  orange and red to purple (flat out); press it again to turn it off.
- **FAST · TECHNICAL · MIXED** — designed randomise: the designer draws 16
  circuits, keeps the ones that pass every check, scores them for the style and
  shows the best four as cards (`4.8 km · 14 corners · 2 passing`). **FAST**
  favours long flat-out running and places to overtake; **TECHNICAL** many
  corners of many different radii; **MIXED** variety in both corners and speed.
  Every amber check costs a card points. **USE** loads a card as your design
  (one UNDO takes it back; SAVE adds it as a new circuit); **MORE LIKE THIS**
  nudges two or three of that card's points (never within 300 m of the start
  line) into four new cards. The same circuit always gives the same cards.

## Elevation — per-node heights

Switch to **ELEVATION** mode. The strip under the canvas is the circuit's
height profile (start line on the left), with one grip per control point. Amber
dots mark slope, crest and dip warnings.

- **Select** — choose **POINT**, then tap a map point or anywhere in that
  point's profile column. Both views highlight the same selection. **PREV** /
  **NEXT** or the point-number field pick a precise point when grips are crowded.
- **Select several** — choose **RANGE** and drag from a start point to an end
  point on either view, or tap the two endpoints. You can also type the end
  point number, shift-click, or use **SELECT END**. A range follows driving
  order; an end before the start wraps across the start line. **SELECT ALL**
  selects the whole loop; **CLEAR** deselects. Selection never edits the track.
- **See crowded points** — **FOCUS** centers the map on the selection and zooms
  its profile. **ZOOM IN / OUT**, **EARLIER / LATER**, and **FULL LAP** navigate
  the profile without changing the track or undo history.
- **Edit height** — in **POINT** mode, drag a selected profile grip vertically,
  type metres into **POINT m / SPAN m**, or use its minus/plus buttons. Choose
  **0.25 / 1 / 5 m STEP** for fine or large adjustments. A range moves by the
  same height offset, preserving its hills within the height limits. Up/Down
  nudge 1 m (5 m with Shift); Delete / Enter on the profile flatten the selection.
- **Shape the selection** — **LEVEL** uses the first selected point's height;
  **SMOOTH** softens heights while keeping a partial range's endpoints; **ZERO**
  sets selected heights to zero. Points outside the range stay unchanged.
- **Presets** — **Flat** clears heights; **Rolling** / **Hilly** write smooth
  per-node profiles (one UNDO each). Old saves without heights load flat.
- **BANKING & KERBS** — in the same mode: pick **KERB** style (**FLAT** /
  **SAUSAGE** / **RUMBLE**) for the whole circuit, and **BERMS ON** /
  **BERMS OFF** for the outer catch-fence mound on banked corners. Tap a
  **TURNS** row and set **BANK °** (below) to bank that corner.

Every height, bank, kerb or berm edit is one UNDO step.

## TURNS — every corner, tappable

Under **5 CHECKS**, **TURNS** lists the corners in driving order, for example
`T3 · RIGHT 92° · R 45 m · 118 km/h · 140 m`: which way it turns, how far, its
tightest radius, the slowest speed through it and how long it is. Tap a row
(or Enter on it) and the designer selects that corner's stretch of road,
centres the view on it and sets **CORNER** (or **HAIRPIN**) to the arc that
fits it. **REPLACE THE SELECTED SPAN** then rebuilds that corner from the
settings — tighten the radius or change the angle first to reshape it. UNDO
puts it back.

While a row is selected, **SELECTED TURN · T3** shows under the list with one
stepper, **BANK °**: FLAT, then 2° to 30° in steps of 2. It banks that corner
at its apex over the corner's own length, cambered toward the inside; FLAT
takes the banking away. Over 5.7° the checks add an FIA amber (Grade 1 allows
5.7°; it is advice, not a block). A banked or narrowed corner says so on its
row: `T3 · RIGHT 92° · R 45 m · 118 km/h · 140 m · BANK 6° · 12 m WIDE`.
Banking reuses the engine's `bankZones`; with **BERMS ON** (the default) the
outer side of a banked corner grows a grass berm.

## 5 CHECKS and FIX

The designer builds your circuit with the game's own track engine as you edit,
and lists what it finds:

- **Red** blocks SAVE, RACE and SHARE — a lap under 2.5 km or over 7 km, a
  corner too tight to drive, the road crossing itself without a bridge, too
  little straight around the start line.
- **Amber** is a warning; you can still race. Rows that start **FIA:** are the
  FIA's Grade 1 layout advice for a real circuit (no straight over 2 km, the
  first corner 250 m or more after the line and turning at least 45°, at most
  2 % of slope along the start straight, 12 m of road, at most 5.7° of
  banking), and *No overtaking spot* means no 400 m flat-out run into a heavy
  braking zone. *Crest* rows are where the car goes light over the top of a
  hill at speed, *Dip* rows where it is squashed into the bottom of one. Many real circuits break one or two; they never block anything
  and FIX ALL leaves them alone.
- Tap a row to jump to the spot on the canvas.
- **FIX** on a row repairs that one problem; **FIX ALL** (next to the 5 CHECKS
  label, while a red problem can be repaired) repairs everything it can in one
  go. Each is one UNDO step, so UNDO puts the circuit back exactly.
- A row with no FIX needs your hands: the message says what to change.

## SAVE, RACE, TIME TRIAL

- **SAVE** keeps the circuit in **MY CIRCUITS** (up to 24). Saving an edited
  circuit replaces it rather than adding a copy.
- **RACE** and **TIME TRIAL** save first, then take you to the picker with
  your circuit chosen. It also sits under the **MY CIRCUITS** chip there.
- In the **MY CIRCUITS** tab: **EDIT**, **RACE** and **DELETE** (press twice).

## Test drive

Select a point and press **TEST HERE** (the last chip under 4 DETAILS, or in
the press-and-hold row on the canvas). The designer saves the circuit and drops
you on that point at a standstill in a **time trial** — your stored weather and
laps, no race-settings sheet, no rivals. The run up to the start line is an
out-lap; the timed lap begins when you cross it, and lands on the circuit's
time-trial board like any other. **PAUSE → QUIT** brings you straight back to
the designer with the same point selected.

## SHARE, EXPORT, IMPORT

- **SHARE** copies a link. Whoever opens it gets the exact circuit, theme and
  all. If the copy is blocked, the link waits in the **SHARE CODE** field.
- **CARD** makes a 640×360 picture of the circuit — its outline, name, length,
  corners, estimated lap and the share link — and opens your device's share
  sheet with it (the full link rides along as text). Where the browser cannot
  share files (desktop Firefox, for one) the picture is saved as a `.png`
  instead.
- **SHARE CODE → LOAD** takes a pasted link or code.
- **EXPORT** saves the circuit as a small `.apextrack.json` file; **IMPORT**
  loads one back (up to 64 KB).

## Cheat sheet

| Input | How |
|---|---|
| Touch | Tap a point to select · drag a selected point (or hold briefly then drag) to move it · tap the road to add one · double-tap to delete · press and hold for DELETE / START HERE / TEST HERE · pinch to zoom, drag empty space to pan · on the elevation strip, tap then drag vertically. |
| Mouse | Click a point to select · drag past a short threshold to move · click the road to add one · double-click to delete · wheel to zoom, drag empty space to pan · shift-click a second point for a span. |
| Keyboard | Tab / `[` `]` cycle points · arrows nudge 1 m (10 m with Shift) · Delete removes · Enter stamps · Esc deselects · Ctrl/⌘Z undo · on the elevation strip, Up/Down set height (Shift ×5), Delete / Enter flatten. |
| Gamepad | The d-pad and A work every button and chip. With a point selected, the d-pad nudges it on the canvas; B lets go of the point, and B again closes the designer. |

## Limits

- A lap of 2.5–7 km, built from 8–200 points.
- 24 saved circuits.
- No online play on your own circuits yet: RACE A FRIEND uses the shipped
  circuits.
