# Track source and constructed-geometry audit — 19 October 2026

This audit compares the 52 shipped circuit definitions with fresh external references and actual construction output. It is a source register and ranked correction backlog, not a claim that every circuit is accurate or an instruction to impose one width on every track. No circuit data or engine behavior changes in this document.

## Revision and method

- Measurement revision: `2b1b2020af0e526c7e14176c79e1fb711c10023c`; circuit/track source compared with fetched deploy revision `2f97326d3915d581bd1474b7202da3e33bc43705`. Their only `js/track`/`js/circuits` difference is the full-lap guard in `core/space.js`; shipped definitions and geometry goldens remain unchanged.
- Unmodified authored definitions; no synthetic width overrides. Width is twice `hw`, excluding kerbs, runoff and pit aprons. Turn count is the curated marker table, not detected physical corners.
- The engine arc total is computed before final elevation/bridge passes. Final sampled XYZ chord length is a separate metric. Neither should be silently equated with a homologated centerline or a published racing-line length.
- Centerline inventory uses `line:false`. Full construction checks use normal `Tracks.build`, authored scenery, the local baked model pack, day/night, and injected renderer seams with instancing on/off. Uploads are stubs: these checks establish CPU construction/geometry, not GPU upload, shaders, frame rate or presentation.
- Imported coordinates are x-west/z-north (`tools/track/import-circuit-path.mjs`). Conditional signed-area direction agrees for all 34 circuits with an unambiguous selected direction; Suzuka figure-eight and unknown/conflicting directions are excluded. This is not individual-corner map registration.
- Sources were researched on 19 October 2026. Current and historical layouts, track versus motorcycle variants, centers versus ideal racing lines, degree versus percentage banking, and average versus minimum width remain distinct. A primary page can itself be stale or contradictory.

## Coverage and limits

The register contains 122 source references (119 distinct URLs), with an opened primary page for each circuit. Some technical dimensions remain secondary-only or unresolved. Selected fact coverage: lap length 51/52, turns 47/52, width 19/52, direction 35/52 (including figure-eight context), elevation range 7/52, banking 6/52. These counts are source availability, not an accuracy pass rate.

No complete per-station width, altitude/camber survey, pit-building survey, barrier-offset map or landmark georegistration was obtained for the fleet. Publicly unavailable measurements remain unknown. A valid mesh does not prove road location, realistic surface gradients, floating/grounded scenery, clipping or coplanar cleanliness.

## Ranked correction batches

1. **Localized and broad width contradictions.** Estoril provides corner-specific 10/14/18 m widths against a 12–14 m build; this is a useful first map-registration candidate. Sepang builds 13.2–16 m against operator 16–22 m; Istanbul 12.6–15 m against 14.5–21.5 m. Qatar is uniformly 16 m against an operator 12 m figure, but its venue page also retains the older 5.380 km description, so confirm post-2023 painted limits first. Korea is 16 m against operator 13–15 m. Scope each repair to its circuit data and measured stations.
2. **Banking units and anchor placement.** Formula 1 describes Jeddah T13 as 12 degrees; raw data specifies 7 degrees and the current marker sample is approximately 4.92 degrees. Confirm the physical apex and road cross-slope before changing the angle. Madrid sources describe 24 percent (approximately 13.50 degrees), not 24 degrees; its bank location and marker registration remain unresolved. Sepang T15 reverse camber from the 2016 resurfacing needs a surface sample, not an inference from an absent explicit zone.
3. **Elevation with real anchors.** Mexico builds approximately 6.74 m relief while Mercedes describes less than 3 m. COTA 31.37 m contrasts with the operator 130 ft (39.62 m); Red Bull Ring 53.70 m versus 65 m; Fuji 33.31 m versus 40 m; Okayama 22.15 m versus 29 m. Preserve bridge clearance, physics grades and terrain grounding while correcting a stationed profile; do not scale absolute altitude.
4. **Turn-marker identity.** Spa 20 markers versus a current F1 19-turn reference; Nürburgring 16 versus the 2020 F1 map 15; Okayama 11 versus operator 13. Fuji remains unresolved: its current operator lists 17, while Toyota’s official 2015 WEC preview lists 16 for the same 4.563 km course. These establish label/count questions, not missing physical corners. Match every apex against the correct layout before editing counts or bank anchors.
5. **Shared length construction.** All 52 engine arc totals are below imported `path.len`: median difference approximately −0.625 percent, range −1.626 to −0.163 percent. A VM counterfactual with only the two smoothing iterations disabled lengthens every circuit, but introduces substantial spline overshoot (for example Sepang approximately 5,977 m). Removing smoothing is not a repair. Separate trace projection, smoothing, spline overshoot, sampling and official measurement conventions; preserve geographic anchors and minimum-radius/fold constraints.
6. **Shanghai centerline fold.** All four construction modes report node 702 (approximately 51.85 percent lap). The matched GLX/TLX views show a pinched inner road edge at that location. This is not a rejected mesh; inspect emitted road-edge clamping, triangles and collision/surface readback before choosing a data or engine correction.
7. **Independent shared-engine findings.** Authored width windows use continuous start fractions while point permutation rounds to a node; Nürburgring, Kyalami and Magny-Cours show up to 0.40/0.26/0.10 m half-width drift. Left-handed instance winding correction reverses asymmetric local tangent offsets in real marshal-post models: fused versus instanced hut windows differ by 1.2 m, container doors by 2.8 m in supported circuit frames. Repairs need independent golden/geometry and culling/cache ownership coverage. These findings are not fixes in this audit.

## Whole-roster comparison

“Reference” selects the layout noted in each source entry, not necessarily the newest layout the venue offers. A small length difference alone is not a confirmed wrong trace. Width intervals describe published envelopes, not the positions of narrow/wide sections.

| Circuit | Reference / engine arc (m) | Reference / built full width (m) | Reference turns / markers | Built relief (m) |
| --- | ---: | --- | ---: | ---: |
| `bahrain` | 5,412 / 5,386.93 | unknown / 14–14 | 15 / 15 | 5.26 |
| `monaco` | 3,337 / 3,294.87 | unknown / 8.2–10 | 19 / 19 | 44.93 |
| `silverstone` | 5,891 / 5,845.7 | unknown / 16–16 | 18 / 18 | 14.18 |
| `spa` | 7,004 / 6,947.39 | 11–14 / 16–16 | 19 / 20 | 101.96 |
| `monza` | 5,793 / 5,777.58 | unknown / 13.6–16 | 11 / 11 | 5.99 |
| `suzuka` | 5,807 / 5,786.54 | 10–16 / 12.2–14 | 18 / 18 | 40.08 |
| `singapore` | 4,927 / 4,906.29 | unknown / 10.2–12 | 19 / 19 | 5 |
| `cota` | 5,513 / 5,505.79 | 12.8–15.85 / 16–16 | 20 / 20 | 31.37 |
| `interlagos` | 4,309 / 4,284.63 | unknown / 14–14 | 15 / 15 | 40.54 |
| `vegas` | 6,200 / 6,171.94 | unknown / 12.2–14 | 17 / 17 | 1.42 |
| `madrid` | 5,414 / 5,342.68 | 12–15 / 14–14 | 22 / 22 | 26.19 |
| `zandvoort` | 4,259 / 4,216.04 | unknown / 12–14 | 14 / 14 | 4.4 |
| `jeddah` | 6,174 / 6,159.88 | at least 11 (maximum unknown) / 12–12 | 27 / 27 | 2.36 |
| `albert_park` | 5,278 / 5,261.34 | unknown / 14–14 | 14 / 14 | 1.2 |
| `shanghai` | 5,451 / 5,414.69 | unknown / 16–16 | 16 / 16 | 6.74 |
| `miami` | 5,412 / 5,366.49 | unknown / 14–14 | 19 / 19 | 3.67 |
| `imola` | 4,909 / 4,870.75 | unknown / 14–14 | 19 / 19 | 28.13 |
| `montreal` | 4,361 / 4,347.01 | unknown / 14–14 | 14 / 14 | 3.44 |
| `redbull` | 4,326 / 4,287.95 | 12–13 / 14–14 | 10 / 10 | 53.7 |
| `hungaroring` | 4,381 / 4,364.49 | 10–16 / 14–14 | 14 / 14 | 30.32 |
| `baku` | 6,003 / 5,898.81 | 7.6 narrowest section (maximum unknown) / 7.6–12 | 20 / 20 | 14.19 |
| `mexico` | 4,304 / 4,286.81 | unknown / 16–16 | 17 / 17 | 6.74 |
| `qatar` | 5,419 / 5,390.08 | 12–12 / 16–16 | 16 / 16 | 6.73 |
| `abudhabi` | 5,281 / 5,277.32 | unknown / 16–16 | 16 / 16 | 9.24 |
| `hockenheim` | 4,574 / 4,540.28 | 12–18 / 12.4–15 | 17 / 17 | 9.14 |
| `nurburgring` | 5,148 / 5,110.18 | unknown / 12.4–15 | 15 / 16 | 50.81 |
| `catalunya` | 4,657 / 4,652.58 | unknown / 12.6–15 | 14 / 14 | 20.16 |
| `sepang` | 5,543 / 5,502.63 | 16–22 / 13.2–16 | 15 / 15 | 9.53 |
| `istanbul` | 5,338 / 5,250.82 | 14.5–21.5 / 12.6–15 | 14 / 14 | 21.04 |
| `paul_ricard` | 5,842 / 5,809.34 | unknown / 13.2–16 | 15 / 15 | 6.77 |
| `portimao` | 4,653 / 4,626.15 | unknown / 12.4–15 | 15 / 15 | 24.2 |
| `sochi` | 5,848 / 5,795.96 | unknown / 12.4–15 | 18 / 18 | 6.7 |
| `mugello` | 5,245 / 5,226.34 | 9–14 / 12.6–15 | 15 / 15 | 21.11 |
| `magny_cours` | 4,411 / 4,418.05 | 10–18 / 12.4–15 | 17 / 17 | 11.13 |
| `estoril` | 4,182.72 / 4,137.97 | 10–18 / 12–14 | 13 / 14 | 15.13 |
| `kyalami` | 4,522 / 4,480.08 | unknown / 12.4–15 | 16 / 13 | 27.21 |
| `watkins_glen` | unknown / 5,421.32 | 10.97–14.63 / 12.4–15 | 11 / 11 | 25.35 |
| `indianapolis` | 4,192.34 / 4,073.26 | unknown / 12.8–16 | 13 / 13 | 3.39 |
| `buenos_aires` | 4,259 / 4,237.64 | unknown / 12.4–15 | unknown / 18 | 4.44 |
| `jacarepagua` | 5,031 / 4,913.22 | unknown / 12.4–15 | unknown / 11 | 3.89 |
| `fuji` | 4,563 / 4,522.75 | 15–25 / 16–16 | unknown / 16 | 33.31 |
| `okayama` | 3,703 / 3,688.11 | 12–15 / 14–14 | 13 / 11 | 22.15 |
| `korea` | 5,615 / 5,555.29 | 13–15 / 16–16 | 18 / 18 | 0 |
| `jerez` | 4,428 / 4,391.08 | unknown / 15–15 | unknown / 13 | 17.9 |
| `donington` | 4,020 / 3,983.07 | unknown / 14–14 | 12 / 11 | 29.71 |
| `anderstorp` | 4,025 / 3,988.02 | unknown / 14–21 | unknown / 8 | 3.01 |
| `brands_hatch` | 3,916 / 3,884.96 | unknown / 14–14 | 11 / 11 | 28.57 |
| `zolder` | 4,001 / 3,988.59 | unknown / 15–15 | 11 / 10 | 14.13 |
| `dijon` | 3,801 / 3,717.09 | unknown / 14–14 | 9 / 12 | 23.93 |
| `buddh` | 5,125 / 5,104.59 | unknown / 16–16 | 16 / 16 | 5.26 |
| `mont_tremblant` | 4,260 / 4,208.49 | unknown / 14–14 | 15 / 15 | 28.21 |
| `mosport` | 3,957 / 3,933.43 | unknown / 13–13 | 10 / 10 | 40.8 |

## Source register and layout cautions

### bahrain

Sakhir Grand Prix5.412km layout; excludes2010Endurance and2020Outer variants.

- [Bahrain International Circuit](https://www.formula1.com/en/information/bahrain-international-circuit.2CaIdaOTCgQ3Yfnb37NmSS) — Formula 1; Sakhir Grand Prix layout; fields: lengthM, layoutEra.
- [Bahrain Grand Prix circuit information](https://ticketing.formula1.com/bahrain/) — Formula 1 ticketing; Sakhir 5.412 km layout; fields: lengthM, turns.
- [2025 Bahrain FIA WEC race guide, p2](https://cxf-prod.azureedge.net/news-platform-production/attachments/cmhkfsc170y5v01o0kphp0vlh-08-michelin-raceguide-wec-bahrein2025-en.pdf) — Michelin; 2025 Sakhir Grand Prix layout; fields: lengthM, turns, direction.

Limits: Exact local width profile and edge-of-road survey Surveyed banking sign, degree and longitudinal extent away from any explicitly cited corner Pit lane surveyed length, width and precise entry/exit geometry Primary numerical elevation range not located in this bounded search

### monaco

Modern 3.337 km Grand Prix street layout.

- [Circuit de Monaco guide, 4 June 2026](https://www.formula1.com/en/latest/article/circuit-guide-everything-you-need-to-know-about-the-circuit-de-monaco.vFsmfGHr6RWyLFtxi58wi) — Formula 1; 2026 modern Grand Prix layout; fields: lengthM, turns.
- [2024 Monaco F2 competition visa](https://www.fia.com/sites/default/files/decision-document/2024%20Monaco%20Event%20-%20VISA%20-%20F2%20Monaco%202024.pdf) — FIA; 2024 full Grand Prix support-event circuit; fields: direction, lengthM.

Limits: Exact local width profile and edge-of-road survey Surveyed banking sign, degree and longitudinal extent away from any explicitly cited corner Pit lane surveyed length, width and precise entry/exit geometry Primary numerical elevation range not located in this bounded search

### silverstone

Modern Arena Grand Prix layout, Hamilton Straight start; excludes 1991-2009 Bridge layout.

- [British Grand Prix circuit information](https://ticketing.formula1.com/great-britain/) — Formula 1 ticketing; Modern 5.891 km GP layout; fields: lengthM, turns.
- [2022 Silverstone event visa, pp6/8](https://www.fia.com/sites/default/files/doc_6_-_2022_silverstone_event_-_silverstone_visa.pdf) — FIA; 2022 full GP support-event circuit; fields: direction.

Limits: Exact local width profile and edge-of-road survey Surveyed banking sign, degree and longitudinal extent away from any explicitly cited corner Pit lane surveyed length, width and precise entry/exit geometry Primary numerical elevation range not located in this bounded search

### spa

Modern short GP circuit with Bus Stop, not historic 14 km road circuit.

- [Spa-Francorchamps guide, 16 July 2026](https://www.formula1.com/en/latest/article/circuit-guide-everything-you-need-to-know-about-the-circuit-de-spa-francorchamps.pC5N3J3W9LEj8REFvU6FX) — Formula 1; 2026 GP layout; fields: lengthM, turns, layoutEra.
- [2026 Belgian GP competition visa, p3](https://www.fia.com/system/files/decision-document/2026_belgian_grand_prix_-_competition_visa.pdf) — FIA; 2026 GP layout; fields: lengthM, direction.
- [2024 European Le Mans Series media guide — Spa technical profile](https://press.fiawec.com/assets/fileuploads/66/12/66124edb6859e.pdf) — European Le Mans Series, hosted by FIA WEC; 2024 GP layout; historical overall profile, not per-station survey; fields: widthRangeM.

- turns: reference 19; built 20. Comparison is official numbered turns against authored turn markers, not detected geometric corners. Matching counts do not establish correct marker locations.
- widthRangeM: reference 11–14; built 16–16. Built16m throughout exceeds the historical2024ELMS overall profile11–14m. Confirm current painted road limits and local width stations before changing circuit data; communicated to the active circuit-accuracy lane.

Limits: Exact local width profile and edge-of-road survey Surveyed banking sign, degree and longitudinal extent away from any explicitly cited corner Pit lane surveyed length, width and precise entry/exit geometry Primary numerical elevation range not located in this bounded search

### monza

Modern 5.793 km road circuit with chicanes, not banked combined oval.

- [Autodromo Nazionale Monza circuit information](https://www.formula1.com/en/information/italy-autodromo-nazionalemonza.FiJN1jnQlRLeHqOxIt13m) — Formula 1; Modern road circuit; fields: lengthM, layoutEra.
- [2026 Italian Grand Prix facts](https://www.formula1.com/en/latest/article/need-to-know-the-most-important-facts-stats-and-trivia-ahead-of-the-2026-italian-grand-prix.3R2slU8oSHdeOc5lidJDGy) — Formula 1; 2026 modern road circuit; fields: turns, lengthM.
- [2024 Monza F2 competition visa, pp2-3](https://www.fia.com/sites/default/files/decision-document/2024%20Monza%20Event%20-%20VISA%20-%20F2%20Monza%202024.pdf) — FIA; 2024 road circuit; fields: lengthM, direction.

Limits: Exact local width profile and edge-of-road survey Surveyed banking sign, degree and longitudinal extent away from any explicitly cited corner Pit lane surveyed length, width and precise entry/exit geometry Primary numerical elevation range not located in this bounded search

### suzuka

Current four-wheel full 5.807 km figure-eight course; not 5.821 km motorcycle course or East/West variants.

- [Suzuka Circuit Course Guide](https://www.suzukacircuit.jp/eng/course_s/) — Honda Mobilityland / Suzuka Circuit; Current four-wheel racing course; fields: lengthM, turns, widthRangeM, pit.
- [Japanese Grand Prix circuit information](https://ticketing.formula1.com/tickets/en/japan/general-admission-f1-suzuka-waitlist) — Formula 1 ticketing; Full figure-eight GP course; fields: layoutEra, direction.

Limits: Exact local width profile and edge-of-road survey Surveyed banking sign, degree and longitudinal extent away from any explicitly cited corner Pit lane surveyed length, width and precise entry/exit geometry Primary numerical elevation range not located in this bounded search

### singapore

Post-2023 Marina Bay 19-turn layout after removal of old Turns16-19; current 2026 F1 guide 4.927 km.

- [Marina Bay guide, 7 October 2026](https://www.formula1.com/en/latest/article/circuit-guide-everything-you-need-to-know-about-the-marina-bay-street-circuit.3d9yfiqIKoQhcMnRLESWbz.3d9yfiqIKoQhcMnRLESWbz) — Formula 1; 2026 post-2023 19-turn layout; fields: lengthM, turns, layoutEra.
- [FIA Singapore Thursday press conference 2022](https://www.formula1.com/en/latest/article/fia-thursday-press-conference-singapore-2022.5X3P2Ah1MvhSdcvuMh41vn) — Formula 1 / FIA transcript; Pre-2023 full street circuit; direction only, not length or turn count; fields: direction.

Limits: Exact local width profile and edge-of-road survey Surveyed banking sign, degree and longitudinal extent away from any explicitly cited corner Pit lane surveyed length, width and precise entry/exit geometry Primary numerical elevation range not located in this bounded search

### cota

Full Grand Prix circuit used since 2012; excludes National and NASCAR short variants.

- [About Circuit of The Americas](https://circuitoftheamericas.com/about/) — Circuit of The Americas; Full GP circuit, 3.41-mile rounded operator description; fields: widthRangeM, elevationRangeM, turns.
- [United States Grand Prix circuit information](https://ticketing.formula1.com/tickets/en/austin/general-admission-f1-circuit-of-the-americas-waitlist) — Formula 1 ticketing; Full GP circuit; fields: lengthM, turns.
- [Brazil preview driver quotes, 6 November 2014](https://www.formula1.com/en/latest/article/brazil-preview-quotes-toro-rosso-mercedes-force-india-and-more.1doyCWATro5pUCoOduhSrp.1doyCWATro5pUCoOduhSrp) — Formula 1; 2014 Austin full GP circuit direction only; fields: direction.

- widthRangeM: reference 12.8–15.85; built 16–16. Numeric envelope differs. Published width bounds alone do not identify where to alter local geometry; units and source precision must be retained.
- elevationRangeM: reference 39.62; built 31.37. Operator publishes total relief. Built maximum minus minimum differs; a centerline height profile and geographic alignment are needed before changing any samples.

Limits: Exact local width profile and edge-of-road survey Surveyed banking sign, degree and longitudinal extent away from any explicitly cited corner Pit lane surveyed length, width and precise entry/exit geometry Georeferenced per-position elevation profile

### interlagos

Modern short 4.309 km Grand Prix layout, not original 1970s 7.96 km course.

- [Sao Paulo Grand Prix circuit information](https://ticketing.formula1.com/tickets/en/brazil/general-admission-f1-interlagos-waitlist) — Formula 1 ticketing; Modern short GP circuit; fields: lengthM, turns, direction.

Limits: Exact local width profile and edge-of-road survey Surveyed banking sign, degree and longitudinal extent away from any explicitly cited corner Pit lane surveyed length, width and precise entry/exit geometry Primary numerical elevation range not located in this bounded search

### vegas

Las Vegas Strip Circuit introduced 2023; not 1981-82 Caesars Palace parking-lot circuit.

- [Las Vegas Strip Circuit track layout](https://www.f1lasvegasgp.com/track-layout/) — Las Vegas Grand Prix promoter; 2023-present Strip circuit; length rounded 6.2 km; fields: lengthM, turns, layoutEra.
- [2025 Las Vegas Grand Prix circuit statistics](https://www.f1lasvegasgp.com/2025/08/the-countdown-is-on-the-formula-1-heineken-las-vegas-grand-prix-returns-nov-20-22-2025/) — Las Vegas Grand Prix promoter; 2025 Strip circuit; fields: direction, turns.

Limits: Exact local width profile and edge-of-road survey Surveyed banking sign, degree and longitudinal extent away from any explicitly cited corner Pit lane surveyed length, width and precise entry/exit geometry Primary numerical elevation range not located in this bounded search

### madrid

Madring at IFEMA/Valdebebas, debut 2026; 2024 concept and 2026 race documentation disagree on length.

- [Madring guide, 10 September 2026](https://www.formula1.com/en/latest/article/circuit-guide-everything-you-need-to-know-about-the-madring.NF7Mh3iag3w9GUPlihwJA.NF7Mh3iag3w9GUPlihwJA) — Formula 1; 2026 race guide:5.414 km/22 turns; fields: lengthM, turns, layoutEra.
- [F1 awards IFEMA Madrid Spanish GP, January2024](https://www.ifema.es/notas-prensa/f1-otorga-a-ifema-madrid-la-organizacion-del-gran-premio-de-espana-a-partir-de-2026) — IFEMA Madrid; Preliminary concept pending homologation:5.474 km/20 turns; fields: lengthM, turns, layoutEra.
- [Madrid exclusive experiences 2026](https://www.ifema.es/visita-madrid/turismo/lujo-en-madrid-experiencias-exclusivas) — IFEMA Madrid; Tourism description:5.474 km/22 turns; fields: lengthM, turns.
- [Madring paves La Monumental,25 March2026](https://www.madring.com/notas-prensa/monumental-asfaltada) — Madring promoter; 2026 constructed Turn12,550m,24%; fields: banking.
- [Madrid approves Grand Prix mobility plan](https://diario.madrid.es/blog/notas-de-prensa/el-ayuntamiento-da-luz-verde-al-plan-de-movilidad-para-la-celebracion-del-gran-premio-de-formula-1/) — Madrid City Council; 2026 race-event description; fields: widthRangeM, banking, turns.

- widthRangeM: reference 12–15; built 14–14. Municipality specifies12m except15m main straight and Turn1. Built is14m uniformly: envelope inclusion alone masks missing variation. Precise geographic transition positions still require survey/map alignment.

Limits: Exact local width profile and edge-of-road survey Surveyed banking sign, degree and longitudinal extent away from any explicitly cited corner Pit lane surveyed length, width and precise entry/exit geometry Primary numerical elevation range not located in this bounded search Homologated final layout length and exact official-turn-to-built-arc registration

### zandvoort

2020 rebuild / 2021–2026 F1.

- [2026 Circuit Zandvoort guide](https://www.formula1.com/en/latest/article/circuit-guide-everything-you-need-to-know-about-circuit-zandvoort.3yxmn4LiWkbNTKpad7IRSo.3yxmn4LiWkbNTKpad7IRSo) — Formula 1; 2026; fields: lengthM, turns, banking.
- [Corners](https://www.circuitzandvoort.nl/en/corners/) — Circuit Zandvoort; 2020 rebuild; fields: banking, pitExit.
- [2022 Zandvoort F2 competition visa](https://www.fia.com/sites/default/files/doc_4_-_2022_zandvoort_event_-_f2_visa_-_zandvoort_2022.pdf) — FIA; 2022; fields: direction, pitExit.

Limits: Width/elevation/bank maps are not surveyed by this audit; unknown is not zero. Pit entry/exit path and bridge clearances not numerically source-verified. Operator /en/presentation page reverses degrees and percent (18%/32°); detailed corner page and F1 agree18° and~32% and take precedence. Classic flag does not make this a pre-1985 layout: source banked corners and current14-turn trace establish modern intent. No primary numerical full-width range located in this bounded search. No primary numerical highest-lowest centerline relief located in this bounded search.

### jeddah

2021–2025 F1 full layout.

- [Saudi Arabian GP2025](https://www.formula1.com/en/racing/2025/saudi-arabia) — Formula 1; 2025; fields: lengthM, turns.
- [Track Hire Brochure](https://jeddahcircuit.com/pdfs/track-hire-brochure.pdf) — Jeddah Corniche Circuit; full GP vs explicitly separate3.450km short layout; fields: lengthM, turns, direction, widthRangeM.
- [Jeddah Turn13 construction](https://www.formula1.com/en/latest/article/new-pictures-reveal-jeddahs-sweeping-turn-13-as-construction-continues-ahead.5na8wGmMNk4DDYjMJ5QXV6.5na8wGmMNk4DDYjMJ5QXV6) — Formula 1; 2021 launch; fields: banking.

- banking.turn13: reference 12; built 4.92. F1 explicitly says12degrees, not12% (≈6.84°). Raw authored zone is7°; built T13 marker≈4.92°. Correct angle and placement are distinct issues; nearest-marker validation needed before changing data.

Limits: Width/elevation/bank maps are not surveyed by this audit; unknown is not zero. Pit entry/exit path and bridge clearances not numerically source-verified. No primary numerical highest-lowest centerline relief located in this bounded search.

### albert_park

2022–2026 post-chicane-removal GP.

- [Albert Park circuit guide2026](https://www.formula1.com/en/latest/article/circuit-guide-2026-australian-grand-prix-albert-park.19zPlhKhMbTaVNFIPKAAMa) — Formula 1; 2026; fields: lengthM, turns, 2022layout.
- [Our History](https://shop.grandprix.com.au/pages/about-us) — Australian Grand Prix / Albert Park Circuit store; 2022+14turn layout; fields: direction, lengthM, turns, flatTopography.

- brief.direction: reference clockwise; built docs/tracks/albert_park.md says anticlockwise. Promoter states clockwise; correct prose without assuming engine reverse flag is wrong. Inventory signed area is positive like other clockwise traces.

Limits: Width/elevation/bank maps are not surveyed by this audit; unknown is not zero. Pit entry/exit path and bridge clearances not numerically source-verified. No primary numerical full-width range located in this bounded search. No primary numerical highest-lowest centerline relief located in this bounded search. No primary numerical banking specification located; existing authored bank zones remain unverified.

### shanghai

2004–2026 F1 full GP, resurfaced2024.

- [Shanghai circuit guide](https://www.formula1.com/en/latest/article/circuit-guide-everything-you-need-to-know-about-the-shanghai-international.1b0f0ghbsPMRsHJoHTt6eB.1b0f0ghbsPMRsHJoHTt6eB) — Formula 1; 2026; fields: lengthM, turns, backStraight.
- [2026 Chinese GP competition visa](https://www.fia.com/system/files/decision-document/2026_chinese_grand_prix_-_competition_visa.pdf) — FIA; 2026; fields: direction, lengthM.

Limits: Width/elevation/bank maps are not surveyed by this audit; unknown is not zero. Pit entry/exit path and bridge clearances not numerically source-verified. Do not use Shanghai Formula E shortened-layout dimensions for F1. Brief says maximum grade~1.7%, built2.764%; no independent primary grade specification found, so this is a brief/build discrepancy rather than externally proven error. No primary numerical full-width range located in this bounded search. No primary numerical highest-lowest centerline relief located in this bounded search. No primary numerical banking specification located; existing authored bank zones remain unverified.

### miami

2022–2026 F1 Hard Rock Stadium layout.

- [Miami circuit guide](https://www.formula1.com/en/latest/article/circuit-guide-everything-you-need-to-know-about-the-miami-international-autodrome.zMEQ1nU4xZKuvc9EsGXDr) — Formula 1; 2026; fields: lengthM, turns, elevationLocation.
- [Miami GP2025](https://www.mercedesamgf1.com/races/miami-grand-prix-2025) — Mercedes-AMG PETRONAS F1 Team; 2025; fields: direction.

- elevationLocation: reference T14–15 uphill approach then drops on exit; built {"T14Y": -0.0750946600615986, "T15Y": -0.13367269403934567, "rawHumps": [{"s": 0.8605, "halfM": 220, "rise": 3.5}, {"s": 0.662, "halfM": 95, "rise": 3.4}]}. Built T14/T15 markers are both approximately base height;3.4m hump at raw.662 lies after markerT17(.6333), and another3.5m hump lies nearT18. This establishes disagreement between source behavior and marker-linked output, but turn labels themselves could be displaced. Check map/apex correspondence before moving hills.
- brief.direction: reference anti-clockwise; built docs/tracks/miami.md says clockwise. Primary F1 team direction conflicts with brief, while raw built winding is negative like other anticlockwise traces.

Limits: Width/elevation/bank maps are not surveyed by this audit; unknown is not zero. Pit entry/exit path and bridge clearances not numerically source-verified. No primary numerical full-width range located in this bounded search. No primary numerical highest-lowest centerline relief located in this bounded search. No primary numerical banking specification located; existing authored bank zones remain unverified.

### imola

2008+ F1 layout, lastF1 event2025; legacy game venue.

- [Emilia-Romagna GP2025](https://www.formula1.com/en/racing/2025/emiliaromagna) — Formula 1; 2025; fields: lengthM, direction, hillSections.
- [Circuit map Imola2025](https://www.fia.com/system/files/decision-document/2025_imola_event_-_circuit_map_-_imola_2025.pdf) — FIA; 2025; fields: lengthM, turns.

Limits: Width/elevation/bank maps are not surveyed by this audit; unknown is not zero. Pit entry/exit path and bridge clearances not numerically source-verified. Operator MICE2021PDF describes non-F1 variants/21+corners; largePDF could not be opened by search fetch, so do not transfer its corner count to19-turn F1 layout. No precise primary relief or width range independently opened within budget. No primary numerical full-width range located in this bounded search. No primary numerical highest-lowest centerline relief located in this bounded search. No primary numerical banking specification located; existing authored bank zones remain unverified.

### montreal

Current 4.361km GP layout,2026.

- [Canadian GP circuit guide2026](https://www.formula1.com/en/latest/article/circuit-guide-everything-you-need-to-know-about-the-circuit-gilles-villeneuve.5RUqO9YE80jmCiuODWNX9g) — Formula 1; 2026; fields: lengthM, turns.
- [PCCNA Montreal supplementary regulations](https://www.imsa.com/wp-content/uploads/sites/32/2023/08/30/2024_IMSA_Official_Schedule_and_SR_PCCNA_Montreal_053024.pdf) — IMSA; 2024 F1 support layout; fields: direction, turns.

Limits: Width/elevation/bank maps are not surveyed by this audit; unknown is not zero. Pit entry/exit path and bridge clearances not numerically source-verified. No primary numerical full-width range located in this bounded search. No primary numerical highest-lowest centerline relief located in this bounded search. No primary numerical banking specification located; existing authored bank zones remain unverified.

### redbull

1996+ GP full layout;2024 measurement convention update.

- [F1 Race Track2026 Spielberg](https://www.redbullring.com/en/events-tickets/formula-1/formula-1-circuit/) — Red Bull Ring operator; 2026; centerline method summer2024; fields: lengthM, turns, elevationRangeM, grade, measurementConvention.
- [Austria media kit2021](https://www.fia.com/sites/default/files/austria_media_kit_2021_1.pdf) — Projekt Spielberg / FIA host; 2021 GP; fields: widthRangeM, grade, formerLengthM, turns.
- [Spielberg F3 competition visa](https://www.fia.com/system/files/decision-document/2025_spielberg_event_-_visa_-_f3_spielberg_event_2025.pdf) — FIA; 2025 GP full layout; fields: direction.

- widthRangeM: reference 12–13; built 14–14. Full drivable width (twice half-width), excluding pit apron/runoff. An interval falling within published bounds does not verify spatial variation. Null upper bound means only a published minimum is known.
- elevationRangeM: reference 65; built 53.7. Built centerline highest minus lowest; absolute venue altitude is deliberately excluded. Source era and survey resolution remain relevant.
- lengthMeasurementConvention: reference {"currentCenterlineM": 4326, "formerIdealLineM": 4318}; built 4,287.95. Operator explicitly attributes8m change to FIA measuring centerline instead of ideal racing line (summer2024). F1 generic circuit page still uses4318m. This is convention, not evidence of an8m layout extension.
- maxGradePercent: reference {"uphill": 12, "downhill": 9.3}; built 7.58. Current operator and2021FIA-hosted kit agree on grades. Built maxabs7.58% is materially shallower; unsigned statistic cannot separately compare up/down segments.

Limits: Width/elevation/bank maps are not surveyed by this audit; unknown is not zero. Pit entry/exit path and bridge clearances not numerically source-verified. No primary numerical banking specification located; existing authored bank zones remain unverified.

### hungaroring

2003+4.381km layout; current2025/26buildings.

- [Track rental](https://hungaroring.hu/site/en/services/track-rental) — Hungaroring operator; current; fields: lengthM, turns.
- [Hungaroring F1 Guidebook2018](https://hungaroring.hu/guidebook/) — Hungaroring operator; 2018 same4.381km layout; fields: lengthM, turns, widthRangeM, elevationRangeM, grade.
- [2024 Budapest F2 competition visa](https://www.fia.com/sites/default/files/decision-document/2024%20Budapest%20Event%20-%20VISA%20-%20F2%20Budapest%202024.pdf) — FIA; 2024; fields: direction.

- elevationRangeM: reference 36; built 30.32. Built centerline highest minus lowest; absolute venue altitude is deliberately excluded. Source era and survey resolution remain relevant.
- widthVariation: reference 10–16; built 14–14. Constant14m lies within bounds but omits published10–16m range. Source2018; current spatial width map and2025building changes need separate verification.

Limits: Width/elevation/bank maps are not surveyed by this audit; unknown is not zero. Pit entry/exit path and bridge clearances not numerically source-verified. No primary numerical banking specification located; existing authored bank zones remain unverified.

### baku

2016–2026 City Circuit GP.

- [Baku tenth race2026](https://www.bakucitycircuit.com/news/bakus-tenth-race-what-to-expect-from-the-2026-azerbaijan-grand-prix) — Baku City Circuit promoter; 2026; fields: lengthM, turns, direction, turn8WidthM.
- [Welcome back to Baku media kit](https://cdn.bakucitycircuit.com/uploads/news/377/5adf11efef5c1.pdf) — Baku City Circuit promoter; 2018; fields: pitLaneLengthM, pitSpeedKph, lengthM, turns.
- [Azerbaijan GP preview2017](https://www.fia.com/sites/default/files/2017azerbaijangp_preview.pdf) — FIA; 2017; fields: minimumWidthM, lengthM.

- turn8WidthM: reference 7.6; built 9.2. 2026promoter locates7.6m narrow point atT8. BuiltT8marker9.200m; T9/T10markers reach7.6m. Could be easing/window placement or turn-marker error; verify against map before shifting width zone.

Limits: Width/elevation/bank maps are not surveyed by this audit; unknown is not zero. Pit entry/exit path and bridge clearances not numerically source-verified. No primary numerical highest-lowest centerline relief located in this bounded search. No primary numerical banking specification located; existing authored bank zones remain unverified.

### mexico

2015+stadium F1 GP layout.

- [Mexico City GP2026](https://www.formula1.com/en/racing/2026/mexico) — Formula 1; 2026; fields: lengthM, layoutEra.
- [Mexican GP facts](https://www.formula1.com/en/latest/article/the-mexican-grand-prix-did-you-know-.3PBGA4dZnTTUsjkfevJuk4.3PBGA4dZnTTUsjkfevJuk4) — Formula 1; 2015modified stadiumlayout; fields: turns, direction.
- [2021 Mexico City GP engineering preview](https://media.mercedesamgf1.com/marsF1/en/instance/ko/2021-Mexico-City-Grand-Prix---Preview.xhtml?oid=187455512) — Mercedes-AMG PETRONAS F1 Team; 2021 same stadiumlayout; fields: elevationRangeM, altitude.

- elevationRangeM: reference {"upperExclusiveM": 3}; built 6.74. Built centerline highest minus lowest; absolute venue altitude is deliberately excluded. Source era and survey resolution remain relevant.

Limits: Width/elevation/bank maps are not surveyed by this audit; unknown is not zero. Pit entry/exit path and bridge clearances not numerically source-verified. Brief6°/5°Peraltada banking was not confirmed for2015+stadiumlayout; avoid transferring old full-Peraltada historical banking to modern diverted route. No primary numerical full-width range located in this bounded search. No primary numerical banking specification located; existing authored bank zones remain unverified.

### qatar

2023+ F1 Lusail GP; source operator also retains 5.380km general/motorcycle description.

- [Qatar Grand Prix 2025 circuit](https://www.formula1.com/en/racing/2025/qatar) — Formula 1; 2025 F1; fields: lengthM.
- [Circuit and venue hire — Circuit Data](https://www.lcsc.qa/circuit-and-venue-hire) — Lusail International Circuit; current operator GP venue; fields: turns, widthRangeM, pitGarages.
- [Mixed Training Day FAQ](https://www.lcsc.qa/faq/mixed-training-day-faq) — Lusail International Circuit; current cycling/walking; not F1; fields: directionContext.

- widthRangeM: reference 12–12; built 16–16. Built16m is4m (33.3%) wider than operator-published12m. Operator uses5.380km general circuit description while currentF1 lap is5.419km; confirm post2023 width/paint limits before an exact correction.

Limits: No primary numeric elevation range was established; the measured built range is 6.731 m. No complete primary banking survey or pit-lane dimensions established. CPU geometry was built in the208-case matrix; rendered road-edge quality, grounding/clipping/coplanar quality and physics behavior remain unverified. Operator gives5.380km while F1 gives5.419km; do not calibrate length against generic venue number. Operator FAQ sends cyclists clockwise and walkers anticlockwise; racing direction still needs F1 map corroboration. Operator publishes50garages15x6m; no same-definition built physical-garage inventory available.

### abudhabi

2021+ reconfigured Yas Marina 16-turn GP.

- [2025 Abu Dhabi Grand Prix event notes maps](https://www.fia.com/system/files/decision-document/2025_abu_dhabi_grand_prix_-_event_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_quarantine_zone_and_red_zones.pdf) — FIA; 2025 F1; fields: lengthM, turns, pitMap.
- [Completed track renovation ahead of2021 Abu Dhabi GP](https://www.yasmarinacircuit.com/en/w/track-reveal-1) — Yas Marina Circuit; 2021+GP; fields: layoutEra, turns.
- [Drivers approve new-look Yas Marina](https://www.formula1.com/en/latest/article/drivers-including-alonso-hamilton-and-verstappen-give-their-thumbs-up-to-new.L6d4zMYOgf9uBJe1Xy3U8.L6d4zMYOgf9uBJe1Xy3U8) — Formula 1; 2021+GP; fields: banking.
- [2020 Turkish GP talking points](https://www.formula1.com/en/latest/article/trending-topics-the-title-turn-8-tsunoda-and-more-talking-points-ahead-of.5uhcl9R0V9L4HfF8AZ3nOk) — Formula 1; 2020 direction; reconfiguration2021 retains orientation; fields: direction.

Limits: No primary numeric elevation range was established; the measured built range is 9.236 m. No complete primary banking survey or pit-lane dimensions established. CPU geometry was built in the208-case matrix; rendered road-edge quality, grounding/clipping/coplanar quality and physics behavior remain unverified. Source confirms banked newT9 but gives no angle; do not treat authored5degrees as measured truth. The built16markers matching the real count does not prove northern hairpin/newT9 paths have correct identities. No primary numeric width range opened.

### hockenheim

2002+ GP layout; classic last F1 German GP2019.

- [Data & Facts — Grand-Prix circuit](https://www.hockenheimring.de/en/info/hockenheimring/data-facts/) — Hockenheimring; current2002+GP; fields: lengthM, turns, widthRangeM.
- [2019 German GP media kit](https://www.fia.com/sites/default/files/media_kit_english_final_version-compressed.pdf) — Hockenheimring / FIA hosting; 2019F1; fields: layoutEra.

Limits: No primary numeric elevation range was established; the measured built range is 9.145 m. No complete primary banking survey or pit-lane dimensions established. CPU geometry was built in the208-case matrix; rendered road-edge quality, grounding/clipping/coplanar quality and physics behavior remain unverified. Explicit racing-direction text was not recovered from opened primary pages; clockwise agrees with circuit brief and imported-geometry orientation but remains primary-unverified.

### nurburgring

2002+ GP circuit with AMG Arena and F1 chicane; last F1 Eifel GP2020.

- [2020 Eifel GP Circuit Map Doc1](https://www.fia.com/sites/default/files/decision-document/2020%20Eifel%20Grand%20Prix%20-%20Circuit%20Map.pdf) — FIA; 2020F1; fields: lengthM, turns.
- [Grand Prix Track](https://www.nuerburgring.de/info/nuerburgring/race-tracks/grand-prix-track?locale=en) — Nürburgring; currentGP multi-use; fields: layoutEra, lengthM.
- [2020 Turkish GP talking points](https://www.formula1.com/en/latest/article/trending-topics-the-title-turn-8-tsunoda-and-more-talking-points-ahead-of.5uhcl9R0V9L4HfF8AZ3nOk) — Formula 1; 2020F1; fields: direction.

- turns: reference 15; built 16. Authored turn-marker count differs from the selected F1-era official map; markers are not detected physical corners.

Limits: No primary numeric elevation range was established; the measured built range is 50.81 m. No complete primary banking survey or pit-lane dimensions established. CPU geometry was built in the208-case matrix; rendered road-edge quality, grounding/clipping/coplanar quality and physics behavior remain unverified. Operator17-turn general-course count is not the2020F1 map count15; do not transplant motorcycle-chicane marker count. No numeric primary width range established.

### catalunya

2023+ no final chicane GP; revisedT10 from2021.

- [F1 Spanish GP2023 changes track configuration](https://www.circuitcat.com/ca/noticies/formula-1/el-formula-1-aws-gran-premio-de-espana-2023-canvia-de-configuracio-de-tracat/) — Circuit de Barcelona-Catalunya; 2023+no-chicaneGP; fields: lengthM, layoutEra.
- [2025 Spanish GP circuit](https://www.formula1.com/en/racing/2025/spain) — Formula 1; 2025F1; fields: lengthM, turnMap.
- [2023 F1 Appendix1 event particulars](https://www.circuitcat.com/wp-content/uploads/2023/06/F1-VISA-Barcelona-2023.pdf) — Circuit / RACC / FIA; 2023F1; fields: directionContext.

Limits: No primary numeric elevation range was established; the measured built range is 20.157 m. No complete primary banking survey or pit-lane dimensions established. CPU geometry was built in the208-case matrix; rendered road-edge quality, grounding/clipping/coplanar quality and physics behavior remain unverified. PDF extraction is font-encoded; direction is not claimed from unreadable text. 14turn count matches intended no-chicane era but official map number labels were not individually extracted here. No numeric primary road-width range established.

### sepang

1999-2017 GP loop, post2016 resurfacing/camber if representing last Malaysian GP.

- [Architecture — circuit dimensions](https://www.sepangcircuit.com/architecture) — PETRONAS Sepang International Circuit; current fullGP loop; fields: lengthM, turns, widthRangeM, pitGarages.
- [Malaysia preview — Sepang revamp](https://www.formula1.com/en/latest/article/f1-malaysia-gp-preview-sepang-revamp.3pYvhHo5JLfokzQzrcLhME) — Formula 1; 2016-2017F1; fields: banking, layoutEra.
- [Need to know Malaysia](https://www.formula1.com/en/latest/article/need-to-know-malaysia.3HZ93OGO7KIQys4GQe0siO) — Formula 1; 2017F1; fields: layoutEra.

- widthRangeM: reference 16–22; built 13.2–16. The built road falls below the operator-published minimum.

Limits: No primary numeric elevation range was established; the measured built range is 9.531 m. No complete primary banking survey or pit-lane dimensions established. CPU geometry was built in the208-case matrix; rendered road-edge quality, grounding/clipping/coplanar quality and physics behavior remain unverified. No explicit primary clockwise text extracted; circuit definition/brief and mapped geometry agree but racing-direction primary corroboration remains open. Operator33main pit garages and18south paddock garages are distinct facilities; engine race-team stalls are not automatically same count.

### istanbul

2005-2021 original GP path; returning2027 course not yet independently mapped.

- [The Circuit — Technical Specifications](https://tosfedistanbulpark.com/en/the-circuit/) — TOSFED Istanbul Park; originalGP loop/currentoperator2026; fields: lengthM, turns, widthRangeM, direction, maximumGradient.

- widthRangeM: reference 14.5–21.5; built 12.6–15. The built road falls below the operator-published minimum.

Limits: No primary numeric elevation range was established; the measured built range is 21.042 m. No complete primary banking survey or pit-lane dimensions established. CPU geometry was built in the208-case matrix; rendered road-edge quality, grounding/clipping/coplanar quality and physics behavior remain unverified. No numeric source banking angle forT8; source describes quadruple apex640m corner, not7degree banking.

### paul_ricard

2018-2022F1 GP1C-V2 with Mistral chicane; classic last French GP2022.

- [French Grand Prix2022 circuit](https://www.formula1.com/en/racing/2022/france) — Formula 1; 2022F1; fields: lengthM, turnMap.
- [Pistes et infrastructures](https://www.circuitpaulricard.com/fr/circuit/pistes-et-infrastructures) — Circuit Paul Ricard; current multi-layout circuit; fields: layoutEra, pitGarages.
- [Paul Ricard event Appendix1](https://www.gt4europeanseries.com/documents/notice/1550/Appendix%2B1%2BPaul%2BRicard.pdf) — SRO / ASA Circuit Paul Ricard; GT4 event variant; fields: directionContext.

Limits: No primary numeric elevation range was established; the measured built range is 6.773 m. No complete primary banking survey or pit-lane dimensions established. CPU geometry was built in the208-case matrix; rendered road-edge quality, grounding/clipping/coplanar quality and physics behavior remain unverified. Operator offers247configurations up to5858m; this maximum is not the2022F1 lap length5842m. GT4regulations direction text is search-indexed but PDF returned no extracted text; not used as fully verified direction. No numeric primary width/elevation range or corner banking angles established.

### portimao

2020-2021F1 GP4.653km/15turns; expected2027return not substituted for historical variant.

- [Portuguese Grand Prix2021 circuit](https://www.formula1.com/en/racing/2021/portugal) — Formula 1; 2021F1; fields: lengthM, layoutEra.
- [Racing Track — technical characteristics](https://autodromodoalgarve.com/the-park/racing-track/) — Autódromo Internacional do Algarve; operator FIA Slow Fast standard4684m/16corners; fields: variantLengthM, variantTurns, variantWidthM, variantBanking, pitGarages.
- [2020 Turkish GP talking points](https://www.formula1.com/en/latest/article/trending-topics-the-title-turn-8-tsunoda-and-more-talking-points-ahead-of.5uhcl9R0V9L4HfF8AZ3nOk) — Formula 1; 2020F1; fields: direction.

- operatorVariant: reference {"lengthM": 4684, "turns": 16, "widthM": 14, "mainStraightWidthM": 18, "bankPercentRange": [2, 8]}; built {"lengthM": 4626.147548019519, "turns": 15}. Operator describes FIA Slow Fast standard variant; F1 race page uses4653m. Do not replace playable path orturncount using4684/16.

Limits: No primary numeric elevation range was established; the measured built range is 24.204 m. No complete primary banking survey or pit-lane dimensions established. CPU geometry was built in the208-case matrix; rendered road-edge quality, grounding/clipping/coplanar quality and physics behavior remain unverified. Operator gradient/banking/width values belong to separately described4684m/16corner standard variant; not enough to assign exact per-corner values to4653mF1 lap.

### sochi

Historic2014-2021GP loop; not2023short course/SiriusAutodrom.

- [Russian Grand Prix2021 circuit](https://www.formula1.com/en/racing/2021/russia) — Formula 1; 2021F1; fields: lengthM, layoutEra.
- [Russian Grand Prix Friday Recap](https://www.haasf1team.com/news/russian-grand-prix-friday-recap-0) — Haas F1 Team; 2021F1; fields: lengthM, turns.
- [2020 Turkish GP talking points](https://www.formula1.com/en/latest/article/trending-topics-the-title-turn-8-tsunoda-and-more-talking-points-ahead-of.5uhcl9R0V9L4HfF8AZ3nOk) — Formula 1; 2020F1; fields: direction.

Limits: No primary numeric elevation range was established; the measured built range is 6.704 m. No complete primary banking survey or pit-lane dimensions established. CPU geometry was built in the208-case matrix; rendered road-edge quality, grounding/clipping/coplanar quality and physics behavior remain unverified. Current venue short course must not replace historicalGP loop. Opened2018Sochi media-kit URL was blocked; no claimed numeric road-width/elevation/banking evidence from it.

### mugello

Permanent circuit opened in 1974; 2020 F1-era layout..

- [Italian GP circuit information](https://www.motogp.com/en/calendar/2025/event/italy/ae539677-70a6-4642-aee4-6d6cc5979f67) — MotoGP; 2025; stable permanent layout; fields: lengthM, turns, total width 14 m, main straight 1141 m, layout practically unchanged since 1976.
- [All about the track](https://mugellocircuit.com/en/the-track/all-about-the-track/) — Mugello Circuit; Current facilities; fields: 20 pit garages, each 12 × 12 m.
- [Mugello track information](https://www.race-academy.com/en/track_mugello.php) — The Race Academy (trackday promoter); Current trackday layout; fields: lengthM, widthRangeM, turns.

- widthRangeM: reference 9–14; built 12.6–15. The 15 m built maximum exceeds MotoGP’s 14 m total-width figure and the promoter’s 9–14 m range. Localize widths and distinguish white lines from paved edges before editing geometry.

Limits: An explicit primary direction specification was not obtained. The repository brief describes clockwise racing, which remains unverified here. No surveyed elevation profile or localized banking measurements were found.

### magny_cours

Grand Prix layout revised in 2003; Formula 1 raced here through 2008..

- [Piste Grand Prix](https://www.circuitmagnycours.com/piste-grand-prix-de-nevers-magny-cours/) — Circuit de Nevers Magny-Cours; Current Grand Prix layout; fields: lengthM, turns, widthRangeM, 48 pit garages.
- [Histoire du Circuit](https://www.circuitmagnycours.com/histoire-du-circuit/) — Circuit de Nevers Magny-Cours; Historical layout chronology; fields: Château d’Eau and Lycée revised in 2003; resurfaced in 2020.

- widthRangeM: reference 10–18; built 12.4–15. The built width envelope omits the published narrow and wide extremes. The source does not locate those widths along the lap.

Limits: No primary numeric elevation range, banking survey or direction specification was found. No per-corner width stations were found.

### estoril

Post-2000 trace despite the classic Portuguese GP label; the last F1 race was in 1996..

- [Technical Data](https://www.circuito-estoril.pt/en/technical-data/) — Circuito Estoril; Current post-2000 course; fields: Centerline 4182.72 m, Ideal trajectory 4140.42 m, 13 turns: 9 right and 4 left, Width 14 m on main straight and T1/2/3/11/12/13; 10 m at T4–8; 18 m at T9–10, Maximum climb 6.75%; maximum descent 5.56%, 30 garages, each 6.7 × 17 m.

- widthRangeM: reference 10–18; built 12–14. The built road never reaches the official 10 m sections or the 18 m width at Turns 9 and 10. The operator provides corner-specific width groups, which require registration against the built markers.
- turns: reference 13; built 14. There are 14 authored markers versus 13 official turns. Curvature-peak markers do not establish extra or missing physical corners.
- layoutEra: reference Current post-2000 course; built Classic Portuguese GP label; explicitly post-2000 trace. Do not compare the 1994–1996 chicaned F1 layout with the explicitly post-2000 trace.

Limits: No numeric relief or banking survey was found. Built turn markers have not been registered against official numbered corners. The operator gives 4182.72 m centerline and 4140.42 m ideal trajectory. Proximity of the 4137.97 m engine arc to the latter does not establish a correct centerline or racing line.

### kyalami

2016 rebuild trace; classic South African GP label refers to the last F1 race in 1993..

- [Grand Prix Circuit](https://www.kyalamigrandprixcircuit.com/grand-prix-circuit/) — Kyalami Grand Prix Circuit; Current Grand Prix circuit; fields: lengthM, 16 turns, Average width 12 m, Operator text states anticlockwise, 40 pit garages.
- [Kyalami Driver Briefing](https://www.intercontinentalgtchallenge.com/documents/notice/3030/Briefing%2BKayalami%2BV2.pdf) — SRO / Intercontinental GT Challenge; Modern Kyalami 9 Hour course; fields: Length 4522 m, Map numbers 16 turns, Pit entry to exit 309 m, Intermediate timing distances 1470 m and 3253 m.

- turns: reference 16; built 13. The SRO map numbers 16 turns, while the definition has 13 authored markers. Register the map before concluding that physical corners are missing.
- layoutEra: reference Modern 2016 Grand Prix course; built Classic 1993 GP label. The 1992–1993 F1 layout differs from the 2016 rebuild. The definition already acknowledges that it uses the modern trace.

Limits: Direction is an unresolved contradiction between operator text and the intended modern racing direction. Neither the opened SRO text nor a rendered lap review establishes which assertion is wrong. The SRO map and a matched lap need visual direction inspection. The operator’s 12 m figure is an average, not a constant width or width range. No numeric relief or localized banking survey was found.

### watkins_glen

Full course with Boot; classic F1 label refers to 1980. Inner-loop era remains unconfirmed..

- [Facility Maps](https://www.theglen.com/facility-maps/) — Watkins Glen International; Current full course; fields: 3.4-mile full course with Boot, 11 turns, Clockwise.
- [FAQs: Length of Track](https://www.theglen.com/faq/) — Watkins Glen International; Current venue specifications; fields: Grand Prix course described as both 3.4 and 3.45 miles, 11 turns, Width 36–48 ft; average 38 ft, Elevation change 115 ft, Banking 6–10 degrees.

- widthRangeM: reference 10.97–14.63; built 12.4–15. The 15 m built maximum is approximately 0.37 m above the operator’s 48 ft maximum. Confirm paved-edge semantics and historical applicability.
- elevationRangeM: reference 35.05; built 25.35. Built relief is 25.35 m against the operator’s 115 ft, approximately 35.05 m. A stationed height profile is required for the current and historical variants.

Limits: The operator uses both 3.4 and 3.45 miles; neither rounded figure is treated as an exact length. Current inner-loop geometry versus the 1980 F1 variant needs topological review. The source does not locate individual banking measurements.

### indianapolis

Formula 1 road course used in 2000–2007; excludes the modern IndyCar road course..

- [Formula One World Championship](https://imsdotcom.azureedge.net/history/formula-one) — Indianapolis Motor Speedway; 2000–2007 F1 road course; fields: Formula 1 raced here in 2000–2007, 2.605-mile course, 13 turns, Clockwise, Used oval Turn 1 and the front straight.
- [Track Talk: The Greatest Spectacle in Racing](https://www.indycar.com/News/2020/01/01-27-Track-Talk-Indy-500) — INDYCAR; Oval geometry; not the entire road course; fields: Oval corner banking 9 degrees 12 minutes; oval corners 60 ft wide.

Limits: Infield width stations and relief were not found. The authored bank zone must be mapped to the F1 final bend. The modern IndyCar road course is a different layout and is excluded.

### buenos_aires

Classic Circuit 6 family; excludes the 2027 MotoGP/F1 renovation..

- [Súper TC2000: Matías Rossi campeón en el Gálvez](https://buenosaires.gob.ar/gcaba_historico/noticias/super-tc2000-matias-rossi-campeon-en-el-galvez) — Buenos Aires Ciudad; 2020 Circuit 6 event; fields: Circuit 6 length 4259 m.
- [Argentina 1998 race result](https://www.formula1.com/en/results/1998/races/673/argentina/race-result) — Formula 1; 1998 Formula 1 event; fields: 1998 Argentine Grand Prix; 72 laps.
- [Autodromo redevelopment](https://buenosaires.gob.ar/gcaba_historico/noticias/la-ciudad-reformula-la-megaobra-del-autodromo-para-recibir-al-motogp-y-que) — Buenos Aires Ciudad; 2026 announcement of future redevelopment; fields: New hairpin and extension planned for a future layout.

Limits: The built trace variant has not been visually identified; 18 markers do not independently establish Circuit 6. No primary turn count, width range, elevation range or banking survey was found. The future renovation is not applicable to the repository’s classic target.

### jacarepagua

1978–1989 Formula 1 Grand Prix course; excludes the later oval and shortened layouts..

- [Brazilian GP 1989 race result](https://www.formula1.com/en/results/1989/races/543/brazil/race-result) — Formula 1; 1989 Formula 1 event; fields: 1989 Brazilian Grand Prix; 61 laps.
- [Jacarepagua](https://www.statsf1.com/en/circuit-jacarepagua.aspx) — STATS F1 (secondary historical source); 1978–1989 historical Grand Prix course; fields: Formula 1 length 5031 m, Anticlockwise, Flat reclaimed marshland, Hosted F1 in 1978 and 1981–1989.

Limits: No surviving operator or FIA technical specification was found. Numeric length and direction are supported only by a secondary source. No width or banking dimensions were found. The repository brief attributes clockwise direction to STATS F1; the opened page currently states anticlockwise.

### fuji

Grand Prix course rebuilt in 2005; Formula 1 raced here in 2007–2008. Numbered-turn conventions conflict between sources..

- [Racing Course facilities](https://fsw.tv/guide/facility/racing.html) — Fuji Speedway; Current full-course operator specification; fields: Full course 4563 m; shortcut 4526 m, Operator counts 17 corners: 11 right and 6 left, Width 15–25 m, Altitudes 545–585 m, Main straight 1475 m, Maximum descent 10.05%; maximum climb 8.88%, Pit building A: 34 garages of 7 × 22 m; B: 11 garages of 7 × 11 m.
- [History of Fuji Speedway](https://toyotagazooracing.com/archive/ms/public/en/features/0503_ralfinjapan/history.html) — Toyota F1 Team; 2005 rebuilt course; fields: 2005 rebuilt course length 4563 m; width 15–25 m.
- [Toyota GAZOO Racing Heading Home, 5 October 2015](https://global.toyota/en/detail/9715068) — Toyota Motor Corporation / Toyota GAZOO Racing; 2015 WEC full course; historical context for the rebuilt circuit; fields: 2015 WEC course length 4563 m, 16 corners, Main straight 1475 m, Reopened in 2005; hosted F1 in 2007 and 2008.

- widthRangeM: reference 15–25; built 16–16. The constant 16 m road omits the published 25 m width. The current operator and Toyota’s 2005 archive both give 15–25 m for the relevant rebuilt course. Register width stations and edge definitions before editing.
- elevationRangeM: reference 40; built 33.31. Built relief is 33.31 m versus the operator’s 40 m. The operator identifies Dunlop as the low point; a stationed profile is needed.

Limits: Localized width stations and banking measurements were not found. An explicit direction specification was not obtained. A right-hand Turn 1 description alone does not establish whole-lap direction. The current operator lists 17 corners; Toyota’s official 2015 WEC preview lists 16 for a 4563 m course. Do not call the 16 authored markers a confirmed count defect without a dated map.

### okayama

TI Circuit Aida hosted the 1994–1995 Pacific GP; current core layout includes a 2017 refurbishment..

- [Racing Course guide](https://www.okayama-international-circuit.jp/guide/course.html) — Okayama International Circuit; Current course specification and historical event chronology; fields: Length 3703 m, 13 corners, Width 12–15 m, Hobbs altitude 275 m; Attwood altitude 246 m; relief 29 m, Main straight approximately 600 m at 1.08% downhill; back straight approximately 700 m at 1.10% uphill, 54 pits of 4.7 × 10 m, History includes the 1994 and 1995 Pacific Grands Prix.

- turns: reference 13; built 11. The definition explicitly uses 11 curvature peaks versus the operator’s 13 corners. This is a marker-count question, not proof of missing physical corners.
- elevationRangeM: reference 29; built 22.15. Built relief is 22.15 m versus the operator’s 29 m. Hobbs as the high point and Attwood as the low point provide concrete profile anchors.

Limits: Localized width stations and banking measurements were not found. An explicit primary direction specification was not obtained. The course guide’s 54 pits of 4.7 × 10 m differ from dimensions on another facilities page; establish building and date context before comparing.

### korea

Full F1 layout, 2010–2013 race era; current full-course operator specifications.

- [Tracks: F1 track](https://kicdev.scrs.kr/Tracks) — Korea International Circuit / Korea Mobility Group; Full F1 track, current operator page; fields: lengthM, turns, widthRangeM, longestStraightM.

- widthRangeM: reference 13–15; built 16–16. Operator distinguishes full F1 course from permanent and second tracks and gives full-course width 13–15m. Constructed drivable road is 16m for every node. High-confidence width review candidate; no narrowing edit made.

Limits: Surveyed elevation profile and banking were not established from opened primary material. Exact pit-entry/exit geometry, bridge clearances and local width transitions were not surveyed. FIA 2013 preview indexed an anticlockwise direction and lengthened pit exit; full page timed out in web open and alternate fetch, so direction and 2013 pit change were not promoted to confirmed facts. Direction is unknown unless facts.direction is explicitly sourced; signedAreaXZ alone was not used to infer compass direction.

### jerez

Modern OSM full circuit; source distinguishes 4,423 m motorcycle route and 4,428 m car/Senna-chicane route (introduced1994).

- [Circuit history, track and facilities](https://circuitodejerez.com/en/circuito/) — Circuito de Jerez Ángel Nieto; 1994+ Senna car-chicane route; current pits after2002; fields: lengthM, layoutEra, pits.
- [2026 Spain circuit specifications](https://www.motogp.com/es/calendar/2026/event/espana/a24be69b-8472-4aa4-9e83-d3610e0f1d98) — MotoGP; 2026 motorcycle standard route; fields: nominalWidthM, motorcycleTurns, motorcycleLengthM.

Limits: Surveyed elevation profile and banking were not established from opened primary material. Exact pit-entry/exit geometry, bridge clearances and local width transitions were not surveyed. Source supplies43 pits,12 m long×6 m wide,height>3 m; actual scenery pit-building count/dimensions not measured in this pass. Direction is unknown unless facts.direction is explicitly sourced; signedAreaXZ alone was not used to infer compass direction.

### donington

Current Grand Prix/Melbourne-loop layout, compared separately from1993 historic claims.

- [Circuit Layouts: GP Circuit](https://www.donington-park.co.uk/about/circuit-map) — MotorSport Vision / Donington Park; Current GP layout; fields: lengthM, turns.

Limits: Surveyed elevation profile and banking were not established from opened primary material. Exact pit-entry/exit geometry, bridge clearances and local width transitions were not surveyed. Direction is unknown unless facts.direction is explicitly sourced; signedAreaXZ alone was not used to infer compass direction.

### anderstorp

Current Scandinavian Raceway full circuit, historical SwedishGP1973–1978 identity.

- [The Circuit;2018operator map](https://www.scandinavianraceway.se/en/the-circuit/) — SRW Anderstorp; 2018map/current page; fields: layoutMap.
- [Anderstorp2018circuit map](https://www.scandinavianraceway.se/media/1304/anderstorp-banskiss-2018.jpg?height=457px&width=674px) — SRW Anderstorp; 2018; fields: layoutMap, pits.
- [Scandinavian Raceway8–9May2026](https://www.carreracup.se/kalender/scandinavian-raceway-8-9-maj-2026/) — Porsche Carrera Cup Scandinavia / Porsche Sverige; 2026 full circuit; fields: lengthM.

Limits: Surveyed elevation profile and banking were not established from opened primary material. Exact pit-entry/exit geometry, bridge clearances and local width transitions were not surveyed. Opened operator circuit page consists principally of a map; exact runway width, bank angle, turn count and direction were not independently extracted. Game14–21m variable width remains unverified. Direction is unknown unless facts.direction is explicitly sourced; signedAreaXZ alone was not used to infer compass direction.

### brands_hatch

Current Grand Prix woodland-loop layout; not an assertion of exact1964–1986F1 geometry.

- [Circuit Layouts: GP Circuit](https://www.brandshatch.co.uk/about/circuit-map) — MotorSport Vision / Brands Hatch; Current GP layout; fields: lengthM, turns.

Limits: Surveyed elevation profile and banking were not established from opened primary material. Exact pit-entry/exit geometry, bridge clearances and local width transitions were not surveyed. Operator site homepage and event material contain differing rounded mile figures; map page3.916km/2.433mi chosen. No current width/elevation dimension found in opened primary map text. Direction is unknown unless facts.direction is explicitly sourced; signedAreaXZ alone was not used to infer compass direction.

### zolder

Modern circuit; compare historic F1 claim separately from later chicane revisions.

- [About us](https://www.circuit-zolder.be/en/about-us/) — Circuit Zolder; Current; fields: venueIdentity.
- [Zolder2026event circuit specifications](https://www.goodyearfiaetrc.com/event/zolder) — Goodyear FIA European Truck Racing Championship; 2026 ETRC; fields: lengthM, turns.
- [2026 ETRCseason venue specifications](https://www.goodyearfiaetrc.com/news/goodyear-fia-etrc-season-so-far-and-whats-in-store) — Goodyear FIA European Truck Racing Championship; 2026 ETRC; fields: lengthM, turns, direction.

Limits: Surveyed elevation profile and banking were not established from opened primary material. Exact pit-entry/exit geometry, bridge clearances and local width transitions were not surveyed. Direction is unknown unless facts.direction is explicitly sourced; signedAreaXZ alone was not used to infer compass direction.

### dijon

Long Parabolique layout, lengthened1975–1977; current layout, not1974 short course.

- [History of the circuit](https://www.circuit-dijon-prenois.com/histoire-du-circuit/) — Circuit Dijon-Prenois; Original3289m; expanded3,801 m by1977; fields: lengthM, layoutEra.
- [2026Dijon-Prenois French Truck GP](https://coursesdecamions.fr/gp-camions-dijon-prenois/) — Championnat de France Camions FFSA; 2026long layout; fields: lengthM, turns.
- [2026FFSAcircuits](https://www.truckrace.org/en/ffsa-circuits/) — Truck Race Organisation; 2026long layout; fields: lengthM.

Limits: Surveyed elevation profile and banking were not established from opened primary material. Exact pit-entry/exit geometry, bridge clearances and local width transitions were not surveyed. Direction is unknown unless facts.direction is explicitly sourced; signedAreaXZ alone was not used to infer compass direction.

### buddh

2011–2013 F1 full circuit; not 2023 MotoGP short variant.

- [2013IndianGrandPrixStatSheet](https://motorinolimits.com/wp-content/uploads/2013/10/2013-Indian-Grand-Prix-Stats-Sheet.pdf) — Mercedes-Benz team statistics, hosted by Motorinolimits; 2013 F1; fields: lengthM, turns, pitLaneLimitedLengthM.

Limits: Surveyed elevation profile and banking were not established from opened primary material. Exact pit-entry/exit geometry, bridge clearances and local width transitions were not surveyed. Operator olddomain inaccessible; primary 2013 stats PDF records414 m pit lane under speedlimit, which is not the same as total generated pit path. No direct dimension comparison made. Width sources conflict18–20m,14–20m,etc; no unsupported range adopted. Direction is unknown unless facts.direction is explicitly sourced; signedAreaXZ alone was not used to infer compass direction.

### mont_tremblant

Current full 15 corner circuit; historic1968/1970 character and Hump height explicitly not surveyed.

- [Technical circuit characteristics](https://www.pistemonttremblant.com/infos/caracteristique-techniques-circuit/) — Circuit Mont-Tremblant / Piste Mont-Tremblant; Current full circuit; fields: lengthM, turns, averageWidthM, layoutEra.

- averageWidthM: reference 11; built 14. Operator publishes average11m. Game constant14m implies14m average,27.3%greater. This is an average comparison, not evidence every local width is11m. Current width can differ from1968/1970era; get dated plan before fixing historical target.

Limits: Surveyed elevation profile and banking were not established from opened primary material. Exact pit-entry/exit geometry, bridge clearances and local width transitions were not surveyed. Former lecircuit.com now serves unrelated dealershiptemplate; it is not a reliable current circuit authority. Current operator is pistemonttremblant.com. Source shows northern loop 2,460 m / southern loop 1,910 m, confirming4260m refersfull course. Direction is unknown unless facts.direction is explicitly sourced; signedAreaXZ alone was not used to infer compass direction.

### mosport

Full Grand Prix course1961–present shape; current operator dimensions with historic F1 identity.

- [Grand Prix Circuit](https://canadiantiremotorsportpark.com/pages/grand-prix-track) — Canadian Tire Motorsport Park; Current GP course opened1961; fields: lengthM, turns, naturalElevation, eventCentre.

Limits: Surveyed elevation profile and banking were not established from opened primary material. Exact pit-entry/exit geometry, bridge clearances and local width transitions were not surveyed. Operator describes dramatic elevationchanges but gives no numericrelief in openedpage; game40.80mrelief versus repo47mclaim remains unverified. Current13 m width and2001 widening require a dated primarysource before treating asF1-era width. Direction is unknown unless facts.direction is explicitly sourced; signedAreaXZ alone was not used to infer compass direction.

## Reproduction and verification

Local evidence is under `artifacts/track-research-8d41/`: `built-inventory.json`, `source-build-audit.json`, five `research-*.json`/`.md` source registers, `build-matrix.json`/`.log`, and `smoothing-probe.json`. The ignored research helpers are retained beside the data; they do not modify game source.

```sh
node artifacts/track-research-8d41/inventory.cjs
node --expose-gc artifacts/track-research-8d41/build-matrix.cjs
node artifacts/track-research-8d41/smoothing-probe.cjs
```

Full construction matrix: **208/208 completed**, zero rejected meshes, zero required-model failures, non-empty road/scenery in every case. Shanghai reports one informational centerline surface fold at node 702 in all four modes; mesh validation still passes. This is not a zero-fold verdict. Renderer seams were exercised with instancing on/off and baked assets; uploads/shaders/presentation were stubbed.

Rendered fleet coverage is selective, not 52-circuit visual sign-off. Ten fresh standard screenshot probes cover Qatar, Sepang, Jeddah T13 and Shanghai node 702 on GLX and TLX, plus the Sepang minimum-width location. All ten metadata records have positive presented-scene evidence and zero reported GPU errors; this is not a visual-parity pass. The metadata confirms GLX uses WebGL2 and TLX automatically selects software WebGPU with `forceWebGL:false` and `skipBatches:true`; this is not the forced-GL TLX mode used by earlier fixtures. The Jeddah TLX view shows building striping/blue patches relative to GLX, retained as a rendering-parity lead rather than declared visually clean. No GPU errors were reported in capture metadata. The landscape viewport is 844×390; touch/phone device behavior is not verified by these desktop-context captures.  Existing matched GLX/TLX evidence covers the range correction; actual shipped Monaco/Suzuka/Spa captures cover two areas each with identical widths before/after. Native WGX and hardware-GPU coverage were not run. TLX software-WebGPU presentation evidence does not establish player hardware-GPU correctness or speed. Browser smoke groups are not run as part of this documentation audit.

Keep circuit data in `js/circuits/`; generic corrections in `js/track/`. Coordinate active circuit-accuracy and renderer claims before implementing a batch. No merging, auto-merge or deployment is authorized by this audit.
