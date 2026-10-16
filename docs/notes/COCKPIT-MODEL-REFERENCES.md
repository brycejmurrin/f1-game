# Cockpit modelling references

Geometry cues from real cockpit photographs: open-bottom silicone hand grips,
carbon control housings, circular guarded buttons, three lower rotaries,
separate gear/clutch paddles, recessed LCDs, small shift lenses and a halo stem
that blends into a wider crown. The cockpit body uses a shaped cowl, tapered
carbon liners and recessed mirror glass aligned to the swept housings. The
raised cockpit surround encloses the wheel at hand height. The optional FAIRED
halo uses a broad carbon crown and smooth Y junction, matching the supplied
driver-eye game references; the tubular sizes remain available. Driver gloves wrap the grip rather than reading
as square slabs. The classic option uses a continuous leather rim, three alloy
spokes and a compact mechanical boss. Historic trim remains a cosmetic option
inside the modern car; it does not claim to reproduce a complete historic chassis.

Source photographs and manufacturer explanations, inspected through Chromium:

- [Mercedes: steering wheel construction and cockpit photograph](https://www.mercedesamgf1.com/news/how-does-an-f1-steering-wheel-work)
- [McLaren: steering wheels through the ages](https://www.mclaren.com/racing/team/through-the-ages-formula-one-steering-wheels/)
- [Racecar Engineering: Ferrari SF-23 cockpit, Mercedes W10 halo, Ferrari 2016 prototype and team fairings](https://www.racecar-engineering.com/tech-explained/tech-explained-formula-1-halo/)
- [Motorsport: Ferrari SF-24 and Mercedes W14 wheels; Ferrari 2025 front/back comparison diagrams](https://www.motorsport.com/f1/news/hamilton-ferrari-steering-wheel-like-mercedes/10701097/)
- [Red Bull: RB19 driver position and AlphaTauri mirror sightlines](https://www.redbull.com/au-en/f1-technician-cockpit-driver)
- [Autoweek: McLaren MP4-26 control layout](https://www.autoweek.com/racing/formula-1/a1993516/get-grip-guide-mclarens-complex-f1-steering-wheel/)
- [Silodrome: Niki Lauda's actual McLaren MP4 wheel, front and rear](https://silodrome.com/niki-laudas-mclaren-mp4-steering-wheel-is-for-sale/)
- [Aston Martin: cockpit tools in the 2026 regulations](https://www.astonmartinf1.com/en-GB/news/feature/inside-the-cockpit-the-tools-of-formula-ones-new-era)
- [Motorsport Technology: Williams FW43 controls and driver ergonomics](https://motorsport.tech/formula-1/master-control-understanding-the-williams-fw-43-steering-wheel)
- [Williams: FW46 wheel explained](https://www.williamsf1.com/videos/7d2e649c-31de-4e53-a166-455deb0c44ee/explained-our-2024-steering-wheel)

The shape is inspired by shared hardware features, rather than an exact replica
of a particular team's wheel. Existing wheel/seat/interior/halo IDs, saved
preferences, the original cyan-speed/orange-gear/green-battery LCD layout,
physics and steering rotation remain the model's integration
contract. The modern variants carry the original live display. The 2000s wheel uses a
compact monochrome LCD with live speed/gear, battery, shift lights, pedal bars,
active aero and overtake lamps; CLASSIC and NONE keep their HUD readouts. Physical controls use display-range colours;
only functioning indicator lights use HDR. Classic gauge needles follow live RPM,
speed on a fixed KPH scale, and ERS charge.

Browser screenshot API reference: <https://playwright.dev/docs/screenshots>.

## Selectable design families

STANDARD keeps the raised surround; SCULPTED narrows the mid-shoulder and adds
an outward crest; WIDE broadens the painted shoulder deck and front cowl. The
inner opening remains at the same hand clearance, and every body stays below
the LOW-seat eye. Body shapes are cockpit-view styling, independent of garage
performance parts and team paint.

GT RIM adds a closed flat-bottom rim around the modern screen. BUTTERFLY adds
angular wing housings and accent rails with an open top. Both share the original
live instruments and shift lights with F1 2026. GT RIM is a stylistic alternative,
not a claim that current F1 cars use a closed GT rim. The existing 2000s, CLASSIC
and NONE choices remain available.

### Additional cockpit combinations

OPEN YOKE uses a lower curved bridge with an open upper sightline; ENDURANCE
uses a shallow rectangular closed rim and diagonal lower spokes. Both retain
the shared live speed, gear, battery and shift-light layout. TAPERED shoulders
narrow toward the nose; STEPPED shoulders build a raised middle shelf while
keeping the rear opening below the low-seat eye. SUEDE adds contrasting seam
lines; RIBBED adds transverse raised padding. These are selectable design
interpretations, rather than replicas of a named team's car.


## Cockpit refinements and coordinated presets

All five bodies use six longitudinal shoulder stations with a rounded inner lip,
a snug opening and distinct flare/waist/crown profiles. The closed floor, rear
bulkhead and shoulders extend behind every seat. Flat harness webbing replaces
thick beams; the pale crossbar beneath the wheel is removed. Mirror housings
are tapered on slender supports and use the renderer's reflective material.

Modern wheels share the original cyan-speed/orange-gear/green-battery cells,
but have separate fascia outlines and rotary/control layouts. Grips interpolate
between smooth stations; gloves use narrower palms, curled fingers and tapered
cuffs. SPD/G/ERS, speed units, control legends and numbered rotary marks use
cached geometry. Pedal bars follow actual throttle/brake demand. Instrument
meshes have physical material IDs rather than the generic world texture.

Carbon uses the renderer's weave material; Team limits color to padding accents
and seams; Suede adds fabric panels/stitches; Ribbed uses molded cushion ribs.
Classic gauges sit clear of the dashboard, with numbered faces and a thinner
screen frame. Their labeled needles follow live RPM (0–16000), KPH (0–400),
and ERS (0–100%). The physical KPH dial keeps that scale when HUD units change.

## Proportions, materials and inspection

The painted shoulder shelf is narrower around the driver, with a rounded crest
closer to the opening. The forward surround rises slightly while staying below
the LOW eye. Tube halo side crowns flatten toward the center stem without
changing the rear mounts or cockpit topology.

The tub and hard scuttle use carbon; removable liners and cushions use matte
padding, gauge bezels use metal, and instrument faces retain their physical
surface. Neutral glove seams remain distinct from the car's accent paint.

SETTINGS → DISPLAY → COCKPIT includes PREVIEW COCKPIT, with FRONT, SIDE, REAR,
WHEEL and ABOVE inspection views. The isolated stationary viewer uses the
production geometry and the selected player's paint and parts, without
changing the race, input or driving camera. Its procedural materials provide
consistent studio lighting; the in-race day/night view remains the evidence
for baked material maps. Bahrain's warm night floodlight profile can still tint
carbon and padding strongly; the studio preview does not establish night color
accuracy. Closing the viewer releases its graphics context.
The public viewer is generated from the CARVIEW roster and shipped with
content-hashed asset tags.

The physical mirror glass reflects the environment, without following cars.
The [rear-view mirror rendering contract](COCKPIT-REAR-MIRROR-DESIGN.md) defines
the depth-tested extension needed to reuse the rear camera across GLX, TLX and
WGX. A HUD rectangle pasted over the housing would cover occluders when the
driver looks sideways, so it is not used as a physical reflection.

MODERN F1 applies sculpted/carbon/F1/standard seat/faired halo. HISTORIC applies
tapered/classic/round/standard seat/halo off. Presets require an explicit settings
selection; custom combinations and saved IDs remain supported. Individual rows
refresh after any preset or choice change. Slim/Standard/Thick halos use a
flattened carbon section and connected central junction; Faired keeps its broad
swept crown. All mounting feet remain behind the eye.

Additional reference: <https://www.mercedesamgf1.com/news/how-does-an-f1-steering-wheel-work>.
Screenshot API: <https://playwright.dev/docs/api/class-page#page-screenshot>.
