# Circuit Zolder — Visual Design Brief

**Setting:** DAY, green theme (Limburg pine heath). ~4.01 km, 10 turns, clockwise.

> **GEOMETRY CAVEAT: this trace is the 2002-present 4.010 km layout. Formula One raced the 4.262 km, 15-turn version used from 1975 to 1985; that configuration no longer exists on the ground.**

> **Surveyed start line.** The built origin is 0.81 m from the stripe seen in
> the Flemish orthophoto. Pit and start/finish landmarks follow the new line.
> The wider landscape stays in its authored frame, and the named corner kits
> follow their surveyed bends. See [Start lines](START-LINES.md#donington-brands-hatch-and-zolder).

## 1. Setting

Pine heath and sand in Belgian Limburg, on the site of old coal workings. Ten Belgian Grands Prix, and the circuit where Gilles Villeneuve was killed in qualifying in 1982. Gently undulating, hemmed in by pine — with the Heusden-Zolder mine terril readable on the skyline from the pits.

## 2. Atmosphere & palette

Sandy and pale under dark pine. The soil here is genuinely sand, not loam — run-off and verges should read pale.

## 3. Elevation

Gently undulating, no severe changes. Keep real hills; no knife-edge terrain spikes.

## 4. Landmarks & surroundings by lap position

The pit lane is on the driver’s right (+1). The table uses racing-lap fractions
for the surveyed corners and start/finish buildings. The legacy landscaping
calls retain their authored fractions in the scenery file.

| Racing fraction | Side | Feature |
|---|---|---|
| 0.005 | +1 | Pit frontage and club offices, with a sponsor band along the pit wall. |
| 0.012 | −1 | Permanent start/finish tribune opposite the pit lane. [Circuit Zolder](https://www.circuit-zolder.be/en/about-us/museum/) |
| 0.018 | −1 | Museum behind the tribune. [Circuit Zolder](https://www.circuit-zolder.be/en/about-us/museum/) |
| 0.028 | +1 | Stefan Bongaerts’ five poles in the paddock. [Motorsport Guides](https://motorsportguides.com/a-pilgrimage-to-zolder-where-gilles-villeneuve-lost-his-life/) |
| 0.0752 | +1 | Eerste Linkse, T1. Sand runoff, tyre wall, Armco and spectator bank on the outside. |
| 0.1609 | +1 | Sterrenwacht, T2. Club building with observation drum beside the bend. |
| 0.1996 | −1 | Kanaalbocht, T3. Sandy spoil ridge, tyre wall and scrub. |
| 0.2890 | −1 | Lucien Bianchi, T4. Tyres, marshal post and approach billboards on the outside. |
| 0.4423 | ±1 | Kleine Chicane, T5. Armco both sides, with graded sand and pines beyond. |
| 0.5898 | +1 | Villeneuve Chicane, T6. Viewing stand and sand runoff. The memorial is a small building set back from the barrier. |
| 0.6511 | ±1 | Terlamen, T7. Inside stand and outside tyre wall with camera tower and forest edge. |
| 0.7623 | ±1 | Bolderberg, T8. Inside stand, outside sand and tyre wall. |
| 0.7854 | +1 | Jochen Rindt, T9. Armco, tyre wall and paddock furniture. |
| 0.9077 | — | Jacky Ickx, T10. The final chicane leads onto the start straight. |

Corner order follows the current circuit diagram and named OSM ways. The
surveyed banking stays at Sterrenwacht and Terlamen. [Circuit layout](https://www.racingcircuits.info/europe/belgium/zolder.html)

## 5. Track features

- A sequence of chicanes, including the Villeneuve chicane.
- Fast sweepers through the pine on the back section.
- Sand, not gravel, in the run-off.
- Distant terril (mine slag heap) as a soft `mountain` skyline cue — bearing **UNCERTAIN**; Hotel De Pits cites the view ([circuit-zolder.be/the-pits](https://www.circuit-zolder.be/en/the-pits/)).

## 6. Modelling notes

- Scots pine on sandy heath — the combination is the identity. Do not add more pine past the props-tris ratchet.
- The Villeneuve **chicane** memorial is restraint-only (small plaque building). The **paddock** five-pole sculpture is the required landmark.
- Low, functional buildings. Hotel De Pits / wellness massing is **UNCERTAIN** as a distinct silhouette and is not a required `modelGroup` this wave.
- Wave 6 (2026-09-29): cut buried 28→7, clip severe 99→39, flatCoplanar 18→4; added four required landmarks; no frame-key change.
- Clip pass (2026-10-05): severe 12→0. `ownPitStraight` kills the generic S/F 7-box; global pine/scrub honour OWNED; infield depth ranks removed (fold into pit/Rindt); Sterrenwacht seated behind pit offices on the frame-debt fold. No frame-key change.
