# Rear wing active aero — measured vs FIA 2026 (2026-10-19)

Bryce: "our rear wing active aero change of position doesn't look right".
Lane B·W3·L11. Fix: `rearFlap()` in `js/car/car-body-geom.js`; gate
`tests/unit/rear-wing-active-aero.test.mjs`.

## Reference

FIA 2026 F1 Regulations, Section C (Technical), Issue 17, 2026-04-28,
[C3.11.6 Rear Wing Adjuster System](https://api.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_c_technical_-_iss_17_-_2026-04-28.pdf):

| rule | text (abridged) |
|---|---|
| which elements | "RW Flap" = every Rear Wing Profile volume **except the forwardmost** (the main plane is fixed); up to three volumes in all (C3.11.1 b) |
| rigid | "Any adjustment of RW Flap must maintain the geometric relationship between all parts of RW Flap" (g.i) — the upper elements move as ONE body |
| pivot | "a fixed axis of rotation … aligned with the Y-Axis"; in Corner Mode "at Y = 50, lie between the rearmost point and the mid-point of RW Flap, measured in the X-direction" (b.ii) — the REAR half |
| direction | Straight Mode "results in a decrease in incidence of RW Flap" (c.ii), always the same magnitude |
| time | "maximum transition time between the two fixed positions … not exceed 400ms" (d), single actuator, failsafe to Corner Mode |
| front wing | C3.10.10: primary/secondary flap axes within **25 mm of each flap's forwardmost point** (LE pivot) |

The regs set no angle. Reporting on how teams built it
([Autosport, standout 2026 tech](https://www.autosport.com/f1/news/standout-tech-innovations-f1-2026-so-far/10845183/),
[The Race, Gary Anderson on each concept](https://www.the-race.com/formula-1/how-each-active-f1-rear-wing-concept-works-gary-anderson-explains/),
[The Race, 2027 clampdown](https://the-race.com/formula-1/fia-clampdown-macarena-f1-rear-wings-for-2027)):
Mercedes-style wings are "an extension of the previous DRS concept" — the flap
assembly's leading edge lifts to open a slot, the main plane stays; Alpine drops
the trailing edge; Ferrari / Red Bull / McLaren "flip-flop" (Macarena) wings
rotate the flap through or past vertical. We model the conventional DRS-style
wing, the shape a player recognises. DRS-era slot was capped at 85 mm.

## Measured before (VM, `Car3D.aeroFlaps`, default recipe lvl 2)

| element | pivot | Z (corner) incidence | X (straight) incidence |
|---|---|---|---|
| rearMid | own axis, 45 % chord (-2.439, 0.632) | +45.5° | **−22.5°** |
| rear | own axis, 45 % chord (-2.497, 0.736) | +47.6° | **−25.7°** |

Defects: (1) each element hinged on its own axis, not one rigid flap; (2) the
pivot sat in the FRONT half (45 % chord), so the TE dropped ~170 mm while the LE
rose; (3) `OPEN_FRAC.rear = 2.6` rotated each element 2.6× its own angle, past
flat to nose-up — the flap read as flipping over, LE swinging up toward the
static plane above it. Transition rate was fine: `X_OPEN_RATE` 2.6/s
(0.385 s) and `X_CLOSE_RATE` 8/s (0.125 s), inside the 400 ms rule; physics
untouched.

## After

One pivot for the whole stack at 72 % of the flap's X extent, on the primary
element's chord; one (zAngle, xAngle) pair; primary incidence 32° corner → 2°
straight (`REAR_INC`), backed off only if the lowest element would enter the
fixed main plane.

| element | pivot | Z | X | LE lift |
|---|---|---|---|---|
| rearMid | shared (-2.556, 0.753) | +30.0° | 0.0° | 135 mm |
| rear | shared (-2.556, 0.753) | +32.1° | +2.0° | 95 mm |

Before the drs plane flew, its clearance to the moving stack at aeroX 0 / 0.5 / 1 was ≥ 31 mm on every catalog
aero option. It now moves with the stack, so the gap is fixed. Per-frame cost is unchanged: the solve stays
inside the `_flapSpecs` memo, and the draw path (`drawAeroFlaps`,
`getAeroFlapSet`, `drawAeroEdge`, `wingBandGeom`) already rotates each mesh
about an arbitrary `(y, z)` pivot — `buildFlapGeom` emits design-pose geometry
minus the pivot — so no draw code changed.

## The static drs plane (granted car3d.js change)

Every shipped aero recipe has `drs: 1`, and `car3d.js` (`if (aDrs)` in the rear
wing build) BAKED an extra plane at the crown over the moving stack, so the
topmost element a chase camera sees never moved. Under C3.11.6 it is part of
the RW Flap. With the orchestrator's grant (option A), that one statement no
longer bakes it; `rearFlap()` flies it as `rearDrs` (top of the stack, flagged
`paint: "rearWing"`), and `drawAeroFlaps` / `getAeroFlapSet` paint it in the
livery's `rearWing || c2` colour as `Car3D.build` did, so Aston Martin keeps
its light-blue top plane. `rearDrs` incidence is 33.3° → 3.3°. The sponsor band
(`wingBandGeom`) now sits on `rearDrs` at its rest pose, the same rule the
non-DRS recipes already follow: it is a static decal, so it lifts off as the
wing opens. Per-car body triangles drop by the 100 the plane used to bake
(`tests/data/car-wing-foil-tris.json` re-measured).

Tools only: `Car3D.buildComplete` (parts sweep, viewer) appends every flap in
the flap colour, so there the drs plane shows the wing colour rather than
`rearWing`. car3d.js is another lane's file, so this was left as is.

The front wing still hinges mid-chord (0.52) where C3.10.10 asks for a
LE-near axis; a LE hinge hid the cascade under the nose (see the `HINGE`
comment). Left as is.
