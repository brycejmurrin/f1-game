# Marina Bay Street Circuit — Singapore

**Setting:** NIGHT race · **Theme:** street_night · **Direction:** ANTI-CLOCKWISE

> **Direction, and how it was wrong for a long time.** This brief has said
> "cars run anticlockwise" since it was written, and the circuit drove
> *clockwise* anyway — the imported centreline is digitised backwards, and
> `js/circuits/singapore.js` had no `reverse` flag at all, the only circuit in
> the repo with none. The lap therefore played mirrored: 11 right / 6 left
> against a real 12 left / 7 right, Turn 1 taken as a right when Marina Bay's
> Turn 1 is a sharp left. Fixed with `reverse: true` + `sceneryLapMirror: true`
> + a mirrored marking table + the `sg-2008` race-direction override.
>
> The accuracy spec could not catch it: it compares the game against the same
> upstream GeoJSON the path came from, so both sides were backwards and agreed.
> Direction evidence and the ledger that tracked it are archived — see the
> archive index in `docs/README.md`.
>
> Sourcing, away from that dataset: Pirelli — "an asphalt-covered street circuit
> on which cars are driving anti-clockwise"; Singapore's National Library Board
> — "the cars would run anti-clockwise"; f1-fansite — "Driving direction:
> Counterclockwise".

## 1. Setting
A floodlit night street race threading the public roads around Marina Bay in downtown Singapore. Cars run anticlockwise past harbourside boulevards, low road bridges, and a wall of illuminated skyscrapers reflected in black bay water. Dense, humid, neon-soaked, and hemmed in by concrete barriers on every side.

## 2. Atmosphere & palette
Near-black cool sky (`zenith` ≈ `[0.02, 0.02, 0.07]`, cool horizon/fog) with no stars (light pollution). Buildings glow as grids of lit windows in cool blues/whites `[0.6, 0.7, 0.95]` accented by saturated neon signage (magenta, cyan, amber). Warmth is reserved for flood pools on tarmac `[1.0, 0.92, 0.7]` — not the sky/ambient. Bay water is a dark mirror catching colored reflections `[0.05, 0.08, 0.15]`.

## 3. Elevation
Essentially flat (sea-level reclaimed land). Only gentle ramps: a slight rise/dip crossing Anderson Bridge (~s 0.62) and the underpass beneath the Benjamin Sheares Bridge (~s 0.10). No meaningful gradient elsewhere.

## 4. Landmarks & surroundings by lap position
| s | Side | Distance | Box-modelling description |
|------|------|----------|----------------------------|
| 0.00 | both | near | Pit straight: low pit building L, grandstand R as stepped box rows |
| 0.06 | L | mid | CBD skyscrapers, tall lit-window boxes clustered behind barrier |
| 0.10 | both | near | Dark flat overpass box (Sheares Bridge) cars pass under |
| 0.18 | R | far | **Marina Bay Sands**: 3 tall leaning slab boxes + one long flat "skypark" box bridging their tops |
| 0.26 | R | far | **Gardens by the Bay Supertrees**: cluster of slim tapered cones, magenta/violet glow caps |
| 0.34 | L | mid | Mixed mid-rise hotel boxes, bright billboard panels (emissive quads) |
| 0.45 | R | far | Open bay water gap; distant skyline box band on horizon |
| 0.55 | L | near | **Fullerton Hotel**: wide low classical block, warm uplit `[1.0,0.85,0.55]` |
| 0.62 | both | near | **Anderson Bridge**: pale arched truss boxes flanking road over river |
| 0.66 | L | mid | **Esplanade theatre**: two spiky dome boxes (faceted/low-poly) |
| 0.70 | L | mid | The Padang: dark flat open box (field) behind low rail |
| 0.80 | R | mid | **Helix Bridge**: white spiraling lattice tube box arcing over water |
| 0.86 | R | near | **Singapore Flyer**: large vertical ring box (Ferris wheel), rim lit cyan `[0.4,0.8,1.0]` |
| 0.93–0.98 | both | near | Dark under-grandstand portal (finish straight) — pier + soffit canopies |
| 0.92 | both | near | Illuminated billboards + barrier walls funnel back to start |

## 5. Track features
Tight 90-degree street corners and slow left-right-left complexes (Sheares T1-3). Bumpy, low-grip asphalt over road seams. Unforgiving concrete barrier walls right at the edge everywhere; bright sawtooth kerbs (red/white box strips). One long straight (post-2023) replaces the old final chicane. Section runs under a grandstand near the lap's end.

## 6. Modelling notes
- Build a continuous **barrier wall** of grey boxes on both sides — the defining street-circuit element; never leave open runoff.
- Skyline = layered bands of tall boxes at varying depths; vary height/width and stipple lit-window emissive faces for a city wall.
- Treat hero landmarks as silhouettes: Sands = 3 slabs + cap, Flyer = ring, Supertrees = cones, Helix = curved tube. Recognizable by shape alone.
- Lean hard on **emissive faces** (windows, signage, kerbs, floodlight pools) against the dark sky — light, not texture, sells the night.
- Keep ground/sky nearly black so colored boxes pop; mirror a few bright reflections onto bay-water boxes (s 0.18–0.45, 0.80–0.86).
- Punctuate straights with tall emissive **billboard quads** in shifting neon hues.

## 7. Research pass — civic Singapore (findings, not yet built)

F1.com's own landmark list for Marina Bay is: the Singapore Flyer, **the
Supreme Court**, **Parliament**, the Fullerton Hotel, the Anderson Bridge and
the Merlion. The circuit models the Flyer, Fullerton, Anderson, Merlion, the
Padang, the Float, Marina Bay Sands, the Helix and the **old** Supreme Court /
City Hall (now the National Gallery, at s≈0.714 L — colonnade, pediment, low
rotunda dome).

Still missing, and worth a pass:

- **Parliament House** — modern block near the river.

## Outcome

The new Supreme Court (Foster, 2005 — the stone-fin block with the
cantilevered flying-saucer Court of Appeal disc) and St Andrew's Cathedral
(the white Gothic spire on the Padang) are both now built —
`modelGroup("singapore-supreme-court", ...)` and
`modelGroup("singapore-st-andrews", ...)` in `js/circuits/singapore.js`.
Parliament House remains the one item from the original research pass not
yet modelled.
