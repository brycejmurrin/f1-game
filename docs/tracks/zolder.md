# Circuit Zolder — Visual Design Brief

**Setting:** DAY, green theme (Limburg pine heath). ~4.01 km, 10 turns, clockwise.

> **GEOMETRY CAVEAT: this trace is the 2002-present 4.010 km layout. Formula One raced the 4.262 km, 15-turn version used from 1975 to 1985; that configuration no longer exists on the ground.**

> **FRAME DEBT:** `startFrac` 0.1226 / `sceneryStartFrac` 0 → `_sceneryShift` ≈ 0.844.
> Pit / S/F landmarks use `sl()`; corner props stay on authored `K()`. Do not
> retune frame keys without a per-circuit probe (`docs/tracks/START-LINES.md`).

## 1. Setting

Pine heath and sand in Belgian Limburg, on the site of old coal workings. Ten Belgian Grands Prix, and the circuit where Gilles Villeneuve was killed in qualifying in 1982. Gently undulating, hemmed in by pine — with the Heusden-Zolder mine terril readable on the skyline from the pits.

## 2. Atmosphere & palette

Sandy and pale under dark pine. The soil here is genuinely sand, not loam — run-off and verges should read pale.

## 3. Elevation

Gently undulating, no severe changes. Keep real hills; no knife-edge terrain spikes.

## 4. Landmarks & surroundings by lap position

Clockwise, so `+1` (right of travel) is the **infield** — pits, paddock, media — and
`-1` is the outer ring of pine woodland. Turn fractions from the def are quoted in
the rows they anchor.

| s | Side | Distance | Box description |
|---|---|---|---|
| 0.005 | +1 | 14 | Pit lane and garages: a long low `building` run of flat-roofed boxes, plain white/grey, with a continuous `sponsorHoarding` band along the pit wall and a `marshalPost` at the pit exit. Functional, not glamorous — this is a club circuit that happens to have F1 history. |
| 0.015 | -1 | 20 | **REQUIRED `zolder-main-grandstand`:** permanent S/F tribune (positive-rake `modelGroup`; `grandstandEx` at gap 12 was SUPPRESSED on this fold). Camera tower + billboards behind. Source: [circuit-zolder.be museum page](https://www.circuit-zolder.be/en/about-us/museum/) ("behind the permanent grandstand at start/finish"). |
| 0.018 | -1 | 56 | **REQUIRED `zolder-sf-museum`:** low archive hall behind the permanent tribune — wall of fame, Villeneuve carbon fragment, posters. Source: same museum page. |
| 0.028 | +1 | 54 | **REQUIRED `zolder-villeneuve-poles`:** Stefan Bongaerts paddock sculpture — five white poles (helmet / 126C2 / Ferrari / signature / maple leaves). Source: [Motorsport Guides pilgrimage](https://motorsportguides.com/a-pilgrimage-to-zolder-where-gilles-villeneuve-lost-his-life/). **Not** the chicane plaque. |
| 0.035 | -1 | 22 | Outside of the **Earste Chicane** (T1, s≈0.0352): wide pale sand run-off, then `tyreWall` on `guardrail`, `spectatorHill`, scatter of `tree`. |
| 0.042 | +1 | 16 | Infield of the chicane exit: `groundPatch` of bare sand, a `marshalPost`, a short `guardrail` run and the first rank of `pine` screening the paddock beyond. |
| 0.110 | -1 | 30 | Long `forestEdge` of dark Scots pine down the run away from the chicane — the dominant wall of the outer loop. |
| 0.180 | +1 | 16 | **REQUIRED `zolder-sterrenwacht`:** Sterrenwachtbocht (T2) — small square club building with a low observation drum. Named for the nearby Sterrenwacht / Bolderberg site ([nl.wikipedia Circuit Zolder](https://nl.wikipedia.org/wiki/Circuit_Zolder)). Exact drum diameter **UNCERTAIN**. |
| 0.194 | -1 | 20 | **Kanaalbocht** (T3, s≈0.1938) outside: low `ridge` of sandy spoil carrying the boundary, `guardrail` then `tyreWall` at the apex, `forestEdge` above the ridge line. |
| 0.265 | -1 | 34 | Forested motorhome park in the outer loop: scattered `motorhome` between `pine` (terrain-seated), a `groundPatch` of sand track access, `forestEdge` closing it off from the circuit. |
| 0.347 | +1 | 18 | **Lucien Bianchi bocht** (T4, s≈0.3473): fast infield-side corner — `guardrail` backed by `tyreWall`, a `marshalPost` on the exit and a pair of `billboard` panels facing the approach. |
| 0.433 | -1 | 24 | **Villeneuve chicane** (T5, s≈0.4333). Popular viewing: a modest `grandstandEx` on the outside, `tyreWall` on `guardrail`, sand run-off. The **chicane memorial** stays a single small low `building` on a `groundPatch` set back from the barrier — black granite plaque era; restraint is the point; do not dress it. Bust at Terlamen (2023+) is **UNCERTAIN** for this pass and not modelled. |
| 0.505 | +1 | 40 | Infield service area: `broadcastCompound` with trucks and dishes, one or two `motorhome`, a low `building` shed, all on a pale `groundPatch` with `pine` ranked behind. |
| 0.567 | -1 | 20 | **Kleine chicane** (T6, s≈0.5667): the small chicane — `tyreWall`, short `guardrail`, `marshalPost`, sand `groundPatch` run-off, `pine` immediately beyond. Tight and enclosed. |
| 0.715 | +1 | 22 | **Bolderberghaarspeldbocht** (T7, s≈0.7153): the hairpin after a rise and drop. Small `grandstandEx`, deep `tyreWall` on `guardrail`, `marshalPost`, `billboard` on the braking approach. |
| 0.863 | +1 | 18 | **Terlamenbocht** entry (T8, s≈0.8628): infield `grandstandEx`, `guardrail`, `sponsorHoarding` along the barrier, `marshalPost` at the apex. |
| 0.879 | -1 | 22 | Terlamenbocht exit (T9, s≈0.8792) outside: `tyreWall`, `cameraTower`, a `billboard` bank, `forestEdge` behind — the last of the pine before the paddock reopens. |
| 0.924 | +1 | 16 | **Jochen Rindt bocht** (T10, s≈0.9237) onto the pit straight: paddock `building` blocks and parked `motorhome` behind `guardrail`, `sponsorHoarding` on the pit-wall approach, `marshalPost` on the exit. |

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
