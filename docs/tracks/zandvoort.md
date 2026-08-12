# Circuit Zandvoort — Visual Design Brief

**Setting:** DAY, green theme (coastal dunes). ~4.26 km, 14 turns, clockwise. Two **banked** corners.

## 1. Setting
Threaded directly through the North Sea coastal dunes of the Netherlands, just a few metres from the beach at Zandvoort. Sandy, wind-blown terrain of rolling dune ridges capped with marram grass. Open sky, salt haze, and constantly shifting wind/sand conditions.

## 2. Atmosphere & palette
Bright, breezy seaside daylight with a soft sea haze on the horizon. Pale sandy ground, tan-and-green dune grass, and a fanatic orange crowd presence (Verstappen fans).
- Sky/sea haze: `[0.70, 0.80, 0.85]` (pale coastal blue-grey)
- North Sea blue: `[0.20, 0.42, 0.58]`
- Dune sand: `[0.80, 0.74, 0.56]`; marram grass: tan `[0.66, 0.62, 0.40]`, green `[0.34, 0.50, 0.26]`
- Tarmac: `[0.27, 0.28, 0.30]`; gravel traps: `[0.62, 0.55, 0.42]`
- Kerbs: red `[0.80, 0.14, 0.14]` / white `[0.90, 0.90, 0.90]`
- Crowd orange: `[0.95, 0.45, 0.05]`

## 3. Elevation
Continuous dune undulation — short rises and dips throughout, plus two heavily banked corners.
- s≈0.00–0.06: flat pit straight into Tarzan hairpin.
- s≈0.12–0.18: **Hugenholtz** (T3) — bowl-shaped banked left, ~18°, slingshots up over a dune crest.
- s≈0.20–0.55: rolling dune ridges (Hunserug, Scheivlak) — fast up-and-over undulations; **sand-first** mid-lap.
- s≈0.90–1.00: **Arie Luyendyk** (T14) — banked right, up to ~32% grade, feeding the pit straight.

## 4. Landmarks & surroundings by lap position
| s | Side | Distance | Box description |
|------|------|----------|-----------------|
| 0.00 | L | near | Pit building: long low white-grey box, repeated garage bays |
| 0.00 | R | mid | Main grandstand: tall tiered slab box, dense orange crowd-tint top rows |
| 0.04 | R | near | Tarzan hairpin: gravel apron + grandstand wrapping the turn |
| 0.06 | both | far | Sand dunes: low rolling tan/green box ridges hemming the track |
| 0.14 | L | near | Hugenholtz banked bowl: tilted R/W kerbs + SAFER outer rail, orange stand behind |
| 0.20–0.55 | both | near | Closer dune shoulders + thin hedges/pines — sand dominates mid-lap |
| 0.28–0.80 | R | mid | Intermittent North Sea peeks over seaward dune crests |
| 0.45 | L | far | North Sea horizon: flat blue band box low behind the dunes, haze-faded |
| 0.50 | R | far | Beach huts: tiny low pastel box row at the dune base near the shore |
| 0.50 | both | near | Scheivlak: pale gravel-trap aprons + marshal posts |
| 0.92 | R | near | Arie Luyendyk: tilted R/W kerbs + SAFER outer rail on the banked wall |
| 0.96 | L | mid | Pit-straight grandstand: tiered grey box, orange crowd-tint |

## 5. Track features
- Two steep **banked corners** — Hugenholtz (~18°) and Arie Luyendyk (up to ~32% / 18°): tilted red/white kerb strips + SAFER-style outer rail.
- Sand-first mid-lap (Hunserug → Scheivlak): dunes pulled close, thin marram hedges/pines, gravel aprons at Tarzan and Scheivlak.
- Coastal silhouette beats: intermittent North Sea blue peeks over seaward crests.
- Near-constant dune undulation — the track rises and falls over sandy ridges, never long-flat.
- Bold red/white kerbs, exaggerated and tilted on the banked turns.

## 6. Modelling notes
- Bank the two named corners visibly: rotate/raise the kerb and SAFER rail boxes so the camera reads the tilt (track basis banks with the road).
- Surround mid-lap with close rolling tan-and-green dune boxes — sand should dominate the ground plane; keep hedges/pines sparse so sand shows through.
- Drop intermittent blue North Sea peeks on the seaward horizon over dune crests; keep a far sea band behind.
- Tint grandstand top rows orange to evoke the Dutch crowd; concentrate stands at Tarzan, the bankings, and pit straight.
- Scatter tall thin wind-turbine pole-boxes and a few tiny beach-hut boxes on the seaward horizon for coastal flavour.
- Keep undulation alive: vary box heights along the ground so no stretch reads dead flat.

## Research pass — findings (not yet built)

- **The circuit is IN the dunes**, north of the town and hard against the North
  Sea coast — not beside them. Sand should intrude into the outfield
  everywhere: marram-grassed dune ridges crowding the barriers, blown sand on
  the run-offs, no trees of any size on the seaward side.
- **The two banked corners** are the modern signature: **Tarzanbocht** (Turn 1,
  in use since 1948, the great overtaking corner) and the **Arie
  Luyendykbocht**, the banked final turn onto the straight. Both deserve
  visibly banked geometry and banked kerbing, not flat corners with a camber
  number.
- **Orange.** The Dutch crowd is the most monochrome in F1 — grandstands,
  flares and general admission all read as one orange mass. Crowd colour here
  should be deliberately unvaried, which is the opposite of the usual advice.
- The North Sea itself sits low on the horizon beyond the seaward dune line.


## Outcome

All four researched findings were **already implemented** — the dunes intrude
everywhere with marram grass, Tarzanbocht and the Arie Luyendykbocht carry real
18°/19° banking, the crowd is already orange, and the North Sea is on the
horizon with a wind-farm silhouette. Zandvoort was the best-covered circuit in
this batch.

What was missing was the **festival**. The Dutch GP is not a race weekend with
entertainment attached, it is a festival that happens to contain a race —
dutchgp.com, F1.com and visitzandvoort.com all lead with it. Two things carry
that on sight:

- **The Ferris wheel** (confirmed on dutchgp.com and visitzandvoort.com's
  Racefestival page), behind the paddock side at gap 128.
- **The Fanzone Main Stage**, where the DJ sets run between sessions. A
  festival stage is a box of scaffolding with a roof, so the exposed **truss**
  is the silhouette: deck, LED screen face, four legs, cross-truss roof, PA
  stacks, and a lighting bar of orange cans.

Both sit behind the paddock so they read on the main-straight skyline above the
deliberately modest pit building without crowding it. **The stage crowd is one
colour on purpose** — Zandvoort's is the most monochrome crowd in F1, so the
usual speckle would be wrong here.
