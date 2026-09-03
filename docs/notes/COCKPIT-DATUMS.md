# Cockpit datums — the FIA numbers the first-person view is built on

The cockpit view had been tuned by eye across many sessions, each change
answering the last screenshot. This file replaces taste with the regulations
where the regulations have an answer, so the next change argues with a number.

Source: **FIA 2026 Formula 1 Technical Regulations, Section C, Issue 11
(26 February 2025)** — `api.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_c_technical_-_iss11_-_2025-02-26.pdf`.
Article numbers below are that document's. Quotes are verbatim.

## 1. The coordinate system, and why our metres already line up

FIA `Z` is height in **millimetres above the reference plane** (the plank's
underside), `Y` is lateral from the car's centre plane, `X` is longitudinal.
Apex uses **metres, +Y up**, origin on the car's centreline at road level — so
FIA `Z = 545` reads directly as our `y = 0.545`.

That is not an assumption. `js/car/car3d.js` puts the monocoque crest at
`y 0.545`, and C12.6 requires cockpit padding "above **Z = 545** … maintained
to the upper edges of the Survival Cell". The model was already to scale; the
numbers below transfer 1:1 with no conversion.

## 2. The datum table

| What | FIA article | Regulation value | Apex equivalent |
|---|---|---|---|
| Survival cell upper edge (padding datum) | C12.6 | above `Z = 545` | `y 0.545` — the monocoque crest |
| Headrest keyhole fixing, each side | C12.6 | `XC = −250 ±50`, `Z = 610 ±25` | tub side beside the driver's head ≈ `y 0.61` |
| Halo front fixing axis | C12.4.2 | `XC = −975`, `Z = 660` | `y 0.66` |
| Halo rear fixing mounting faces | C12.4.2 | plane `Z = 695` | `y 0.695` |
| Principal roll structure | C12.4.1 | structure at `[XC 55, 0, 968]` | `y 0.968` |
| Halo fairings | C3.13.3 | "be above `Z = 695mm`" and outside `RV−COCKPIT−HELMET` | — |
| **Mirror body volume** `RV-MIRROR-BODY` | Appendix §12.1–12.2 | polygon on plane `Z = 640` through `[XC −830, Y 470]`, `[XC −730, 470]`, `[XC −650, 680]`, `[XC −750, 680]`, **extruded to `Z = 720`** | lateral `x 0.47…0.68`, height `y 0.64…0.72` |
| **Mirror reflective surface** | C14.2.2 b | projects onto a rectangle **"200mm wide and 50mm high"** (+2/−0), corner radius ≤ 10mm | `0.20 × 0.05`, **landscape** |
| Mirror inboard normal angle | C14.2.2 d i | "between 24deg and 28deg to the X axis" | mirror toe-in |
| Mirror stay attachment | C3.7.5 | "Mirror Inner Stay bodywork must … **intersect Mirror Body and Mid Chassis**" | the stay must reach the tub |
| Mirror symmetry / purpose | C14.2.1 | "positioned symmetrically about the car's centre plane and mounted so that the driver has visibility to the rear and both sides" | — |

## 3. What the table found wrong

Four defects, each one a spec violation or a plain modelling error rather than
an opinion:

**Mirrors were inboard of the legal volume and above its ceiling.** They sat at
`x 0.44, y 0.735`. `RV-MIRROR-BODY` is `Y 470…680`, `Z 640…720` — so they were
3 cm too far inboard and 1.5 cm too high. "Move them out and down" was the
correct read, and the regulations say exactly how far.

**The reflective surface was portrait.** The glass was `sx 0.020 × sy 0.135` —
2 cm wide and 13.5 cm tall. C14.2.2 b specifies **200 mm wide × 50 mm high**.
The mirror was rotated 90° from its real proportions and roughly 4× out in both
axes, which is most of why it read as a floating slab rather than a mirror.

**The reflective surface was on the wrong side of the housing.** The glass sat
at `mz + 0.066` while the housing's own back face is at `mz + 0.0575` — 8 mm
*beyond* it, on the side facing away from the viewer. The driver (at `z −0.18`,
looking forward at a mirror at `z 0.92`) and the chase camera (behind the car)
both see the **−z** face, so both were looking at the dark carbon shell and the
reflective surface was unreachable from any camera in the game. After moving it
to `mz − 0.038`, 97% of visible mirror pixels land on the glass face.

**The stays did not reach the car.** The stalk rooted at `y 0.68, x 0.36`, while
the tub crown at that station (`z 0.92`) is at `y 0.508`, outer edge `x 0.535` —
17 cm above the bodywork and inboard of its edge, so it began in mid-air. C3.7.5
requires the inner stay to *intersect Mid Chassis*; ours intersected nothing.

**The tub was too low to sit in.** The bolster crown beside the driver topped out
at `y 0.56…0.58`, below the entire real range (`Z 610` headrest fixing → `Z 695`
halo rear fixing). With the eye at `y 0.82` the driver read as perched on the car
rather than seated in it.

## 4. The one number the regulations do not give

**Driver eye height.** `RV−COCKPIT−HELMET` is referenced throughout (C12.5.3,
C3.13.3) but defined in a separate CAD appendix, not in Section C's text, so
there is no quotable eyeline. It is bracketed rather than fixed: the helmet sits
above the tub sides (`Z 610…695`) and below the principal roll structure
(`Z 968`), with the halo's front fixing at `Z 660` passing in front of the face.

`COCKPIT_EYE_UP = 0.82` sits inside that bracket, ~0.16 above the tub crown and
~0.27 above the monocoque deck. It was chosen from the deck relationship
(see `OCCLUSION-PROBE.md` §4) before this file existed, and the bracket is a
consistency check on it, not a source. **Do not cite it as regulation.**

## 5. Using this file

Anything that moves the eye, the wheel rig, the tub crown or the mirrors should
cite a row above or say plainly that it is a look choice. Where a change is a
look choice, verify it with the depth raster in `OCCLUSION-PROBE.md` rather
than a screenshot — the two failure modes that cost this project the most
(geometry inside the near plane, one part silently eating another) are both
invisible to the eye and obvious to that probe.
