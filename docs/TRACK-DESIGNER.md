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

## 1 SHAPE — the loop

| You want to… | Do this |
|---|---|
| Move the road | Drag a white point. |
| Add a point | Tap (click) the road between two points. |
| Remove a point | Double-tap it, press and hold it and choose DELETE, or select it and press **DELETE POINT**. A loop keeps at least 8 points. |
| Draw a new circuit | Pick **DRAW** and draw one closed loop in a single stroke. It closes, smooths and spaces itself, and the start goes on its longest straight. |
| Look around | Pinch or use the wheel to zoom, drag empty space to pan, **FIT VIEW** to recentre. |
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

Then tap the point where the shape should begin: it replaces the road after
that point and rejoins the loop. **STAMP AT SELECTED POINT** does the same for
the point you have selected. Shift-tap a second point first to replace exactly
the stretch between the two. Not what you wanted? **UNDO**.

## The start line

Select a point and press **START HERE** (or press and hold the point). The
start needs a long straight behind it: the grid and the pit entry stand there,
and the pit exit needs some straight after it. The checks say how many metres
are missing.

## 3 LOOK — themes

A theme sets the scenery, the time of day and the ground: PARKLAND GP, ALPINE
FOREST, DESERT OASIS, DESERT NIGHT, HARBOUR STREET, MARINA NIGHT, TILKE MODERN
and AUTUMN COUNTRYSIDE. The night themes race under floodlights.

## 4 DETAILS

Name the circuit (24 characters) and set **HALF-WIDTH m**, half the road's
width, from 5 to 8 m. Two rows of chips live here too:

- **RANDOMISE · TRACK OF THE DAY · START FROM…** — three ways to a new
  circuit. **TRACK OF THE DAY** draws the same circuit for everyone on the
  same day (UTC), so you can race your friends' times on it. **START FROM…**
  opens a card for every shipped circuit; pick one and its real layout becomes
  your design, named `<CIRCUIT> REMIX`, ready to change. Your previous design is
  one UNDO away, and SAVE adds the remix as a new circuit.
- **REVERSE · START HERE · DELETE POINT · UNDO · REDO · FIT VIEW · SPEED · TEST HERE** —
  **TEST HERE** drives from the selected point (see Test drive). **SPEED** colours the road by how fast a car takes it, yellow (slow) through
  orange and red to purple (flat out); press it again to turn it off.

## TURNS — every corner, tappable

Under **5 CHECKS**, **TURNS** lists the corners in driving order, for example
`T3 · RIGHT 92° · R 45 m · 118 km/h · 140 m`: which way it turns, how far, its
tightest radius, the slowest speed through it and how long it is. Tap a row
(or Enter on it) and the designer selects that corner's stretch of road,
centres the view on it and sets **CORNER** (or **HAIRPIN**) to the arc that
fits it. **REPLACE THE SELECTED SPAN** then rebuilds that corner from the
settings — tighten the radius or change the angle first to reshape it. UNDO
puts it back.

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
  braking zone. Many real circuits break one or two; they never block anything
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
| Touch | Drag a point to move it · tap the road to add one · double-tap a point to delete it · press and hold a point for DELETE / START HERE / TEST HERE · pinch to zoom, drag empty space to pan. |
| Mouse | Drag a point · click the road to add one · double-click a point to delete it · wheel to zoom, drag empty space to pan · shift-click a second point to select the stretch between them. |
| Keyboard | Tab to the canvas · `[` and `]` step through the points · arrows move the selected point 1 m (10 m with Shift) · Delete removes it · Enter stamps the active shape after it · Esc lets go of it. |
| Gamepad | The d-pad and A work every button and chip. With a point selected, the d-pad nudges it on the canvas; B lets go of the point, and B again closes the designer. |

## Limits

- A lap of 2.5–7 km, built from 8–200 points.
- 24 saved circuits.
- No online play on your own circuits yet: RACE A FRIEND uses the shipped
  circuits.
